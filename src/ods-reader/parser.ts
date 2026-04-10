/**
 * ODS parser — reads an .ods file and builds an OdsDocumentModel.
 *
 * Pipeline:
 * 1. Unzip the .ods bytes with fflate
 * 2. Parse content.xml — walk office:spreadsheet → table:table → table:table-row → table:table-cell
 * 3. Resolve cell types and values from office:value-type attributes
 * 4. Handle table:number-columns-repeated / table:number-rows-repeated (LibreOffice compression)
 * 5. Handle merged cells — colSpan/rowSpan on primary, covered cells at correct indices
 * 6. Resolve cell styles from automatic-styles → OdsCellFormatting
 * 7. Parse settings.xml for freeze row/column configuration
 * 8. Parse meta.xml for document metadata
 * 9. Return OdsDocumentModel
 */

import { unzipSync, strFromU8 } from "fflate";
import { parseXml } from "../reader/xml-parser.js";
import type { XmlElementNode } from "../reader/xml-parser.js";
import type {
  OdsDocumentModel,
  OdsMetadata,
  OdsSheetModel,
  OdsRowModel,
  OdsCellModel,
  OdsCellFormatting,
  ReadOdsOptions,
} from "./types.js";

// ─── XML Helpers ──────────────────────────────────────────────────────

/** Return the first direct element child with the given tag, or undefined. */
function findElement(node: XmlElementNode, tag: string): XmlElementNode | undefined {
  for (const child of node.children) {
    if (child.type === "element" && child.tag === tag) return child;
  }
  return undefined;
}

/** Return all direct element children with the given tag. */
function findElements(node: XmlElementNode, tag: string): XmlElementNode[] {
  return node.children.filter((c): c is XmlElementNode => c.type === "element" && c.tag === tag);
}

/** Return the concatenated text content of all text:p children. */
function cellDisplayText(cell: XmlElementNode): string {
  const parts: string[] = [];
  for (const child of cell.children) {
    if (child.type === "element" && child.tag === "text:p") {
      parts.push(extractTextContent(child));
    }
  }
  return parts.join("\n");
}

/** Recursively extract all text from a node. */
function extractTextContent(node: XmlElementNode): string {
  const parts: string[] = [];
  for (const child of node.children) {
    if (child.type === "text") {
      parts.push(child.text);
    } else if (child.type === "element") {
      if (child.tag === "text:s") {
        // text:s c="N" = N spaces
        const count = parseInt(child.attrs["text:c"] ?? "1", 10);
        parts.push(" ".repeat(count));
      } else if (child.tag === "text:tab") {
        parts.push("\t");
      } else if (child.tag === "text:line-break") {
        parts.push("\n");
      } else {
        parts.push(extractTextContent(child));
      }
    }
  }
  return parts.join("");
}

// ─── Style Resolution ─────────────────────────────────────────────────

/**
 * Parse automatic-styles from content.xml and build a map from
 * style name → OdsCellFormatting.
 */
function buildStyleMap(contentRoot: XmlElementNode): Map<string, OdsCellFormatting> {
  const map = new Map<string, OdsCellFormatting>();

  const autoStyles = findElement(contentRoot, "office:automatic-styles");
  if (!autoStyles) return map;

  // Build number-style name → format string map
  const numberStyles = new Map<string, string>();
  for (const child of autoStyles.children) {
    if (child.type !== "element") continue;
    const name = child.attrs["style:name"];
    if (!name) continue;

    if (child.tag === "number:number-style" || child.tag === "number:currency-style") {
      numberStyles.set(name, parseNumberStyleName(name));
    } else if (child.tag === "number:date-style") {
      numberStyles.set(name, parseDateStyleName(name));
    }
  }

  // Build cell style map
  for (const child of autoStyles.children) {
    if (child.type !== "element" || child.tag !== "style:style") continue;
    if (child.attrs["style:family"] !== "table-cell") continue;

    const name = child.attrs["style:name"];
    if (!name) continue;

    const formatting: OdsCellFormatting = {};

    // Data style (number/date format)
    const dataStyleName = child.attrs["style:data-style-name"];
    if (dataStyleName) {
      const fmt = numberStyles.get(dataStyleName);
      if (fmt) {
        if (fmt.startsWith("date:")) {
          formatting.dateFormat = fmt.slice(5);
        } else {
          formatting.numberFormat = fmt;
        }
      }
    }

    // Table cell properties
    const cellProps = findElement(child, "style:table-cell-properties");
    if (cellProps) {
      const bg = cellProps.attrs["fo:background-color"];
      if (bg && bg !== "transparent") formatting.backgroundColor = bg;

      const va = cellProps.attrs["style:vertical-align"];
      if (va === "top" || va === "middle" || va === "bottom") {
        formatting.verticalAlign = va;
      }
    }

    // Text properties
    const textProps = findElement(child, "style:text-properties");
    if (textProps) {
      const fw = textProps.attrs["fo:font-weight"];
      if (fw === "bold") formatting.bold = true;

      const fs = textProps.attrs["fo:font-style"];
      if (fs === "italic") formatting.italic = true;

      const ul = textProps.attrs["style:text-underline-style"];
      if (ul && ul !== "none") formatting.underline = true;

      const color = textProps.attrs["fo:color"];
      if (color) formatting.color = color;

      const fontSize = textProps.attrs["fo:font-size"];
      if (fontSize) formatting.fontSize = fontSize;

      const fontFamily = textProps.attrs["fo:font-family"] ?? textProps.attrs["style:font-name"];
      if (fontFamily) formatting.fontFamily = fontFamily;
    }

    // Paragraph properties (text-align)
    const paraProps = findElement(child, "style:paragraph-properties");
    if (paraProps) {
      const ta = paraProps.attrs["fo:text-align"];
      if (ta === "start" || ta === "left") formatting.textAlign = "left";
      else if (ta === "center") formatting.textAlign = "center";
      else if (ta === "end" || ta === "right") formatting.textAlign = "right";
    }

    if (Object.keys(formatting).length > 0) {
      map.set(name, formatting);
    }
  }

  return map;
}

/** Reverse-engineer a human-readable format string from a style name. */
function parseNumberStyleName(name: string): string {
  // Our generated style names: Nnum-int, Nnum-dec2, Nnum-pct2, Nnum-eur2 etc.
  if (name === "Nnum-int") return "integer";
  const decMatch = name.match(/^Nnum-dec(\d+)$/);
  if (decMatch) return `decimal:${decMatch[1]}`;
  const pctMatch = name.match(/^Nnum-pct(\d+)$/);
  if (pctMatch) return `percentage:${pctMatch[1]}`;
  const curMatch = name.match(/^Nnum-([a-z]{3})(\d+)$/);
  if (curMatch) return `currency:${curMatch[1].toUpperCase()}:${curMatch[2]}`;
  return name; // unknown — return as-is
}

/** Reverse-engineer a date format string from a style name. */
function parseDateStyleName(name: string): string {
  switch (name) {
    case "Ndate-iso":
      return "date:YYYY-MM-DD";
    case "Ndate-dmy":
      return "date:DD/MM/YYYY";
    case "Ndate-mdy":
      return "date:MM/DD/YYYY";
    case "Ndate-dt":
      return "date:YYYY-MM-DD HH:MM:SS";
    default:
      return `date:${name}`;
  }
}

// ─── Cell Value Parsing ───────────────────────────────────────────────

/** Parse a date value from an ODS office:date-value attribute. */
function parseDateValue(dateStr: string): Date {
  // ISO date: "2026-01-15" or datetime: "2026-01-15T10:30:00"
  return new Date(dateStr + (dateStr.includes("T") ? "Z" : "T00:00:00Z"));
}

/**
 * Parse a table:table-cell element into an OdsCellModel.
 *
 * @param cellEl    - The XML element (table:table-cell or table:covered-table-cell)
 * @param colIndex  - Physical column index
 * @param styleMap  - Resolved cell styles
 * @param includeFormatting - Whether to include formatting
 */
function parseCellElement(
  cellEl: XmlElementNode,
  colIndex: number,
  styleMap: Map<string, OdsCellFormatting>,
  includeFormatting: boolean,
): OdsCellModel {
  // Covered cell
  if (cellEl.tag === "table:covered-table-cell") {
    return { colIndex, type: "covered", value: null };
  }

  const valueType = cellEl.attrs["office:value-type"];
  const colSpan = parseInt(cellEl.attrs["table:number-columns-spanned"] ?? "1", 10);
  const rowSpan = parseInt(cellEl.attrs["table:number-rows-spanned"] ?? "1", 10);
  const styleName = cellEl.attrs["table:style-name"];
  const displayText = cellDisplayText(cellEl);

  const cell: OdsCellModel = {
    colIndex,
    type: "empty",
    value: null,
  };

  if (displayText) cell.displayText = displayText;
  if (colSpan > 1) cell.colSpan = colSpan;
  if (rowSpan > 1) cell.rowSpan = rowSpan;

  // Formatting
  if (includeFormatting && styleName) {
    const fmt = styleMap.get(styleName);
    if (fmt) cell.formatting = fmt;
  }

  // Formula
  const formula = cellEl.attrs["table:formula"];
  if (formula) {
    cell.formula = formula.replace(/^of:/, "");
  }

  // Value type dispatch
  switch (valueType) {
    case "string":
      cell.type = "string";
      cell.value = displayText || cellEl.attrs["office:string-value"] || "";
      break;

    case "float":
      cell.type = formula ? "formula" : "float";
      cell.value = parseFloat(cellEl.attrs["office:value"] ?? "0");
      break;

    case "percentage":
      cell.type = formula ? "formula" : "float";
      // ODS stores raw decimal (0.1234 = 12.34%) — return raw value
      cell.value = parseFloat(cellEl.attrs["office:value"] ?? "0");
      break;

    case "currency":
      cell.type = formula ? "formula" : "float";
      cell.value = parseFloat(cellEl.attrs["office:value"] ?? "0");
      break;

    case "date":
      cell.type = formula ? "formula" : "date";
      cell.value = parseDateValue(cellEl.attrs["office:date-value"] ?? "");
      break;

    case "boolean":
      cell.type = formula ? "formula" : "boolean";
      cell.value = cellEl.attrs["office:boolean-value"] === "true";
      break;

    default:
      // No value-type attribute — empty cell (or formula with no cached result)
      if (formula) {
        cell.type = "formula";
        cell.value = null;
      }
      break;
  }

  return cell;
}

// ─── Sheet Parsing ────────────────────────────────────────────────────

/**
 * Parse a table:table element into an OdsSheetModel.
 */
function parseSheet(
  tableEl: XmlElementNode,
  styleMap: Map<string, OdsCellFormatting>,
  includeFormatting: boolean,
  freezeRows?: number,
  freezeColumns?: number,
): OdsSheetModel {
  const name = tableEl.attrs["table:name"] ?? "Sheet";

  // Extract tab color from the table style
  // table:tab-color is on style:table-properties inside automatic-styles
  // We can't easily reach it here — it will be resolved by the caller
  const sheet: OdsSheetModel = {
    name,
    rows: [],
    columnWidths: new Map(),
    freezeRows,
    freezeColumns,
  };

  // Count columns from table:table-column elements (for future column width support)
  for (const child of tableEl.children) {
    if (child.type !== "element") continue;
    if (child.tag !== "table:table-column") continue;
    // repeated count tracked but not used yet — column width resolution is future work
  }

  // Parse rows
  let rowIdx = 0;
  for (const child of tableEl.children) {
    if (child.type !== "element") continue;
    if (child.tag !== "table:table-row") continue;

    const rowRepeated = parseInt(child.attrs["table:number-rows-repeated"] ?? "1", 10);
    const rowHeight = child.attrs["style:row-height"];

    // Parse cells in this row
    const baseCells: OdsCellModel[] = [];
    let physicalCol = 0;

    for (const cellEl of child.children) {
      if (cellEl.type !== "element") continue;
      if (cellEl.tag !== "table:table-cell" && cellEl.tag !== "table:covered-table-cell") continue;

      const repeated = parseInt(cellEl.attrs["table:number-columns-repeated"] ?? "1", 10);

      if (repeated > 1) {
        // Repeated cells — expand them
        for (let r = 0; r < repeated; r++) {
          const cell = parseCellElement(cellEl, physicalCol, styleMap, includeFormatting);
          cell.colIndex = physicalCol;
          baseCells.push(cell);
          physicalCol++;
        }
      } else {
        const cell = parseCellElement(cellEl, physicalCol, styleMap, includeFormatting);
        baseCells.push(cell);
        physicalCol++;
      }
    }

    // Trim trailing empty cells
    let lastNonEmpty = baseCells.length - 1;
    while (lastNonEmpty >= 0 && baseCells[lastNonEmpty].type === "empty") {
      lastNonEmpty--;
    }
    const trimmedCells = baseCells.slice(0, lastNonEmpty + 1);

    // Only emit row if it has content (or rowRepeated is small — avoid thousands of empty rows)
    const hasContent = trimmedCells.some((c) => c.type !== "empty" && c.type !== "covered");

    if (hasContent) {
      // Emit this row (and repeated copies if they also have content — rare)
      for (let r = 0; r < Math.min(rowRepeated, 1); r++) {
        const row: OdsRowModel = {
          index: rowIdx + r,
          cells: trimmedCells.map((c) => ({ ...c })),
        };
        if (rowHeight) row.height = rowHeight;
        sheet.rows.push(row);
      }
    }

    rowIdx += rowRepeated;
  }

  return sheet;
}

// ─── Settings Parsing ─────────────────────────────────────────────────

/**
 * Parse settings.xml to extract freeze row/column configuration.
 * Returns a map from sheet name → { freezeRows, freezeColumns }.
 */
function parseSettings(
  settingsXml: string,
): Map<string, { freezeRows?: number; freezeColumns?: number }> {
  const result = new Map<string, { freezeRows?: number; freezeColumns?: number }>();

  try {
    const root = parseXml(settingsXml);

    // Navigate: office:settings → config:config-item-set (ooo:view-settings)
    //   → config:config-item-map-indexed (Views) → config:config-item-map-entry
    //   → config:config-item-map-named (Tables) → config:config-item-map-entry (sheet name)

    const settings = findElement(root, "office:settings");
    if (!settings) return result;

    for (const itemSet of findElements(settings, "config:config-item-set")) {
      if (itemSet.attrs["config:name"] !== "ooo:view-settings") continue;

      const indexed = findElement(itemSet, "config:config-item-map-indexed");
      if (!indexed) continue;

      const viewEntry = findElement(indexed, "config:config-item-map-entry");
      if (!viewEntry) continue;

      const tablesNamed = findElement(viewEntry, "config:config-item-map-named");
      if (!tablesNamed) continue;

      for (const sheetEntry of findElements(tablesNamed, "config:config-item-map-entry")) {
        const sheetName = sheetEntry.attrs["config:name"];
        if (!sheetName) continue;

        const freeze: { freezeRows?: number; freezeColumns?: number } = {};

        for (const item of findElements(sheetEntry, "config:config-item")) {
          const itemName = item.attrs["config:name"];
          const itemValue = parseInt(item.children.find((c) => c.type === "text")?.text ?? "0", 10);

          if (itemName === "VerticalSplitPosition" && itemValue > 0) {
            freeze.freezeRows = itemValue;
          } else if (itemName === "HorizontalSplitPosition" && itemValue > 0) {
            freeze.freezeColumns = itemValue;
          }
        }

        if (Object.keys(freeze).length > 0) {
          result.set(sheetName, freeze);
        }
      }
    }
  } catch {
    // Malformed settings.xml — silently ignore
  }

  return result;
}

// ─── Metadata Parsing ─────────────────────────────────────────────────

function parseMetaXml(metaXml: string): OdsMetadata {
  const metadata: OdsMetadata = {};
  try {
    const root = parseXml(metaXml);
    const meta = findElement(root, "office:meta");
    if (!meta) return metadata;

    for (const child of meta.children) {
      if (child.type !== "element") continue;
      const text = extractTextContent(child);
      switch (child.tag) {
        case "dc:title":
          metadata.title = text;
          break;
        case "dc:creator":
        case "meta:initial-creator":
          if (!metadata.creator) metadata.creator = text;
          break;
        case "dc:description":
          metadata.description = text;
          break;
        case "meta:creation-date":
          metadata.creationDate = text;
          break;
        case "dc:date":
          metadata.lastModified = text;
          break;
      }
    }
  } catch {
    // Malformed meta.xml — silently ignore
  }
  return metadata;
}

// ─── Tab Color Extraction ─────────────────────────────────────────────

/**
 * Extract sheet tab colors from content.xml automatic-styles.
 * Returns a map from table style name (e.g. "ta1") → hex color.
 */
function buildTabColorMap(contentRoot: XmlElementNode): Map<string, string> {
  const map = new Map<string, string>();
  const autoStyles = findElement(contentRoot, "office:automatic-styles");
  if (!autoStyles) return map;

  for (const child of autoStyles.children) {
    if (child.type !== "element" || child.tag !== "style:style") continue;
    if (child.attrs["style:family"] !== "table") continue;
    const name = child.attrs["style:name"];
    if (!name) continue;

    const tableProps = findElement(child, "style:table-properties");
    if (!tableProps) continue;

    const tabColor = tableProps.attrs["table:tab-color"];
    if (tabColor) map.set(name, tabColor);
  }

  return map;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Parse an ODS file into a structured document model.
 *
 * @param bytes   - Raw .ods file bytes (Uint8Array).
 * @param options - Optional parsing options.
 * @returns Structured OdsDocumentModel.
 */
export function readOds(bytes: Uint8Array, options?: ReadOdsOptions): OdsDocumentModel {
  const includeFormatting = options?.includeFormatting ?? true;

  // Unzip
  const files = unzipSync(bytes);

  // Required: content.xml
  const contentData = files["content.xml"];
  if (!contentData) throw new Error("readOds: content.xml not found in ODS package");
  const contentXml = strFromU8(contentData);
  const contentRoot = parseXml(contentXml);

  // Optional: meta.xml
  let metadata: OdsMetadata | undefined;
  const metaData = files["meta.xml"];
  if (metaData) {
    metadata = parseMetaXml(strFromU8(metaData));
  }

  // Optional: settings.xml (freeze rows/columns)
  const freezeMap = new Map<string, { freezeRows?: number; freezeColumns?: number }>();
  const settingsData = files["settings.xml"];
  if (settingsData) {
    const parsed = parseSettings(strFromU8(settingsData));
    for (const [k, v] of parsed) freezeMap.set(k, v);
  }

  // Build style map from content.xml automatic-styles
  const styleMap = includeFormatting
    ? buildStyleMap(contentRoot)
    : new Map<string, OdsCellFormatting>();

  // Build tab color map
  const tabColorMap = buildTabColorMap(contentRoot);

  // Find office:spreadsheet
  const body = findElement(contentRoot, "office:body");
  if (!body) throw new Error("readOds: office:body not found in content.xml");
  const spreadsheet = findElement(body, "office:spreadsheet");
  if (!spreadsheet) throw new Error("readOds: office:spreadsheet not found in content.xml");

  // Parse each sheet
  const sheets: OdsSheetModel[] = [];
  for (const child of spreadsheet.children) {
    if (child.type !== "element" || child.tag !== "table:table") continue;

    const tableStyleName = child.attrs["table:style-name"];
    const freeze = freezeMap.get(child.attrs["table:name"] ?? "");

    const sheet = parseSheet(
      child,
      styleMap,
      includeFormatting,
      freeze?.freezeRows,
      freeze?.freezeColumns,
    );

    // Apply tab color from table style
    if (tableStyleName) {
      const tabColor = tabColorMap.get(tableStyleName);
      if (tabColor) sheet.tabColor = tabColor;
    }

    sheets.push(sheet);
  }

  const model: OdsDocumentModel = { sheets };
  if (metadata && Object.keys(metadata).length > 0) {
    model.metadata = metadata;
  }

  return model;
}
