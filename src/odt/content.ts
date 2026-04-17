import { ODF_NS, ODF_VERSION } from "../core/namespaces.js";
import { el, xmlDocument } from "../core/xml.js";
import type { XmlElement } from "../core/xml.js";
import type {
  TextRun,
  TableData,
  TableRowOptions,
  CellOptions,
  ListData,
  ListItemData,
  ParagraphOptions,
  TabStop,
  ImageData,
} from "./types.js";
import { normalizeFormatting, formattingKey, resolveColor } from "./formatting.js";
import type { NormalizedFormatting } from "./formatting.js";

// ─── Content Element ──────────────────────────────────────────────────

/** A content element within the document body. */
export interface ContentElement {
  type: "paragraph" | "heading" | "table" | "page-break" | "list" | "image";
  /** Heading level (1–6). Only used when type is "heading". */
  level?: number;
  /**
   * Content as text runs. Used by "paragraph" and "heading".
   */
  runs?: TextRun[];
  /**
   * Table data. Used by "table".
   */
  table?: TableData;
  /**
   * List data. Used by "list".
   */
  list?: ListData;
  /**
   * Paragraph options (alignment, spacing, indentation, tab stops).
   * Used by "paragraph" and "heading".
   */
  paragraphOptions?: ParagraphOptions;
  /**
   * Image data. Used by "image" (standalone image).
   */
  image?: ImageData;
}

// ─── Row Style ────────────────────────────────────────────────────────

/** Normalized row properties ready for ODF style generation. */
interface NormalizedRowStyle {
  backgroundColor?: string;
}

/** Generate a stable key for a NormalizedRowStyle for deduplication. */
function rowStyleKey(rs: NormalizedRowStyle): string {
  const parts: string[] = [];
  if (rs.backgroundColor) parts.push(`bg:${rs.backgroundColor}`);
  return parts.join("|");
}

/** Normalize row options into resolved row style properties. */
function normalizeRowStyle(options: TableRowOptions | undefined): NormalizedRowStyle {
  const result: NormalizedRowStyle = {};
  if (options?.backgroundColor) {
    result.backgroundColor = resolveColor(options.backgroundColor);
  }
  return result;
}

// ─── Cell Style ───────────────────────────────────────────────────────

/** Normalized cell properties ready for ODF style generation. */
interface NormalizedCellStyle {
  backgroundColor?: string;
  borderTop?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderRight?: string;
  verticalAlign?: "top" | "middle" | "bottom";
  padding?: string;
}

/** Generate a stable key for a NormalizedCellStyle for deduplication. */
function cellStyleKey(cs: NormalizedCellStyle): string {
  const parts: string[] = [];
  if (cs.backgroundColor) parts.push(`bg:${cs.backgroundColor}`);
  if (cs.borderTop) parts.push(`bt:${cs.borderTop}`);
  if (cs.borderBottom) parts.push(`bb:${cs.borderBottom}`);
  if (cs.borderLeft) parts.push(`bl:${cs.borderLeft}`);
  if (cs.borderRight) parts.push(`br:${cs.borderRight}`);
  if (cs.verticalAlign) parts.push(`va:${cs.verticalAlign}`);
  if (cs.padding) parts.push(`p:${cs.padding}`);
  return parts.join("|");
}

/**
 * Normalize cell options into resolved cell style properties.
 * Merges table-level border defaults with cell-level overrides.
 */
function normalizeCellStyle(
  options: CellOptions | undefined,
  tableBorder: string | undefined,
): NormalizedCellStyle {
  const result: NormalizedCellStyle = {};

  // Start with table-level border default
  const defaultBorder = tableBorder;

  // Cell-level border (overrides table default)
  const cellBorder = options?.border ?? defaultBorder;

  // Individual side overrides
  result.borderTop = options?.borderTop ?? cellBorder;
  result.borderBottom = options?.borderBottom ?? cellBorder;
  result.borderLeft = options?.borderLeft ?? cellBorder;
  result.borderRight = options?.borderRight ?? cellBorder;

  // Background color
  if (options?.backgroundColor) {
    result.backgroundColor = resolveColor(options.backgroundColor);
  }

  // Vertical alignment
  if (options?.verticalAlign) {
    result.verticalAlign = options.verticalAlign;
  }

  // Padding
  if (options?.padding) {
    result.padding = options.padding;
  }

  // Clean up undefined borders
  if (!result.borderTop) delete result.borderTop;
  if (!result.borderBottom) delete result.borderBottom;
  if (!result.borderLeft) delete result.borderLeft;
  if (!result.borderRight) delete result.borderRight;

  return result;
}

// ─── Graphic Style ────────────────────────────────────────────────────

/** Normalized graphic frame properties ready for ODF style generation. */
interface NormalizedGraphicStyle {
  wrapMode?: "left" | "right" | "none";
  marginTop?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;
  border?: string;
  opacity?: number;
}

/** Generate a stable key for a NormalizedGraphicStyle for deduplication. */
function graphicStyleKey(gs: NormalizedGraphicStyle): string {
  const parts: string[] = [];
  if (gs.wrapMode) parts.push(`wrap:${gs.wrapMode}`);
  if (gs.marginTop) parts.push(`mt:${gs.marginTop}`);
  if (gs.marginBottom) parts.push(`mb:${gs.marginBottom}`);
  if (gs.marginLeft) parts.push(`ml:${gs.marginLeft}`);
  if (gs.marginRight) parts.push(`mr:${gs.marginRight}`);
  if (gs.border) parts.push(`border:${gs.border}`);
  if (gs.opacity !== undefined) parts.push(`opacity:${gs.opacity}`);
  return parts.join("|");
}

/** Normalize ImageData graphic properties into a NormalizedGraphicStyle. */
function normalizeGraphicStyle(image: ImageData): NormalizedGraphicStyle {
  const result: NormalizedGraphicStyle = {};
  if (image.wrapMode) result.wrapMode = image.wrapMode;
  // Side-specific margins override the uniform margin shorthand
  const margin = image.margin;
  result.marginTop = image.marginTop ?? margin;
  result.marginBottom = image.marginBottom ?? margin;
  result.marginLeft = image.marginLeft ?? margin;
  result.marginRight = image.marginRight ?? margin;
  if (image.border) result.border = image.border;
  if (image.opacity !== undefined) result.opacity = image.opacity;
  // Clean up undefined values
  if (!result.marginTop) delete result.marginTop;
  if (!result.marginBottom) delete result.marginBottom;
  if (!result.marginLeft) delete result.marginLeft;
  if (!result.marginRight) delete result.marginRight;
  return result;
}

/**
 * Build a map from graphic style key → [style name, normalized graphic style].
 * Scans all elements and inline image runs for images that need a graphic style.
 */
function buildGraphicStyleMap(
  elements: ContentElement[],
): Map<string, [string, NormalizedGraphicStyle]> {
  const map = new Map<string, [string, NormalizedGraphicStyle]>();
  let counter = 1;

  function registerImage(image: ImageData): void {
    const normalized = normalizeGraphicStyle(image);
    const key = graphicStyleKey(normalized);
    if (key === "") return;
    if (!map.has(key)) {
      map.set(key, [`Gr${counter}`, normalized]);
      counter++;
    }
  }

  function registerRuns(runs: TextRun[]): void {
    for (const run of runs) {
      if (run.image) registerImage(run.image);
    }
  }

  for (const element of elements) {
    if (element.type === "image" && element.image) {
      registerImage(element.image);
    }
    if (element.runs) {
      registerRuns(element.runs);
    }
    if (element.type === "table" && element.table) {
      for (const row of element.table.rows) {
        for (const cell of row.cells) {
          registerRuns(cell.runs);
        }
      }
    }
    if (element.type === "list" && element.list) {
      for (const item of element.list.items) {
        registerRuns(item.runs);
      }
    }
  }

  return map;
}

/**
 * Build a graphic automatic style element.
 */
function buildGraphicStyle(styleName: string, gs: NormalizedGraphicStyle): XmlElement {
  const style = el("style:style")
    .attr("style:name", styleName)
    .attr("style:family", "graphic")
    .attr("style:parent-style-name", "Graphics");

  const props = el("style:graphic-properties");

  if (gs.wrapMode) {
    props.attr("style:wrap", gs.wrapMode);
  }
  if (gs.marginTop) {
    props.attr("fo:margin-top", gs.marginTop);
  }
  if (gs.marginBottom) {
    props.attr("fo:margin-bottom", gs.marginBottom);
  }
  if (gs.marginLeft) {
    props.attr("fo:margin-left", gs.marginLeft);
  }
  if (gs.marginRight) {
    props.attr("fo:margin-right", gs.marginRight);
  }
  if (gs.border) {
    props.attr("fo:border", gs.border);
  }
  if (gs.opacity !== undefined) {
    props.attr("draw:opacity", `${gs.opacity}%`);
  }

  style.appendChild(props);
  return style;
}

// ─── Content Generation ──────────────────────────────────────────────

/**
 * Generate the content.xml for an ODT document.
 *
 * @param elements - The ordered list of content elements.
 * @param imageMap - Optional map from ImageData objects to their ZIP paths (e.g. "Pictures/image1.png").
 * @returns The serialized content.xml string.
 */
export function generateContent(
  elements: ContentElement[],
  imageMap?: Map<ImageData, string>,
): string {
  // Collect all unique text formatting combinations
  const textStyleMap = buildTextStyleMap(elements);

  // Collect all unique cell style combinations
  const cellStyleMap = buildCellStyleMap(elements);

  // Collect all unique row style combinations
  const rowStyleMap = buildRowStyleMap(elements);

  // Collect paragraph styles (alignment, spacing, indentation, tab stops)
  const paraStyleMap = buildParagraphStyleMap(elements);

  // Collect graphic styles (wrapMode, margins, border, opacity)
  const graphicStyleMap = buildGraphicStyleMap(elements);

  // Image counter for draw:name attributes
  let imageCounter = 1;

  const root = el("office:document-content")
    .attr("xmlns:office", ODF_NS.office)
    .attr("xmlns:style", ODF_NS.style)
    .attr("xmlns:text", ODF_NS.text)
    .attr("xmlns:table", ODF_NS.table)
    .attr("xmlns:draw", ODF_NS.draw)
    .attr("xmlns:fo", ODF_NS.fo)
    .attr("xmlns:xlink", ODF_NS.xlink)
    .attr("xmlns:svg", ODF_NS.svg)
    .attr("office:version", ODF_VERSION);

  // Font face declarations — required for every font name referenced via
  // style:font-name in any automatic style in this file.
  // Must appear before office:automatic-styles in document order.
  const fontFamilies = collectFontFamilies(textStyleMap);
  if (fontFamilies.size > 0) {
    const fontFaceDecls = el("office:font-face-decls");
    for (const fontFamily of fontFamilies) {
      // Wrap multi-word family names in quotes for svg:font-family
      const svgFontFamily = fontFamily.includes(" ") ? `'${fontFamily}'` : fontFamily;
      fontFaceDecls.appendChild(
        el("style:font-face")
          .attr("style:name", fontFamily)
          .attr("svg:font-family", svgFontFamily)
          .attr("style:font-family-generic", "swiss")
          .attr("style:font-pitch", "variable"),
      );
    }
    root.appendChild(fontFaceDecls);
  }

  // Automatic styles
  const autoStyles = el("office:automatic-styles");

  // Text styles (T1, T2, ...)
  for (const [styleName, fmt] of textStyleMap.values()) {
    autoStyles.appendChild(buildTextStyle(styleName, fmt));
  }

  // Paragraph styles (P1, P2, ...)
  for (const [styleName, opts, parentStyle] of paraStyleMap.values()) {
    autoStyles.appendChild(buildParagraphStyle(styleName, opts, parentStyle));
  }

  // Table, column, and row styles
  let tableCounter = 1;
  for (const element of elements) {
    if (element.type === "table" && element.table) {
      const tableName = `Table${tableCounter}`;
      appendTableStyles(autoStyles, tableName, element.table);
      tableCounter++;
    }
  }

  // Cell styles (C1, C2, ...)
  for (const [styleName, cs] of cellStyleMap.values()) {
    autoStyles.appendChild(buildCellStyle(styleName, cs));
  }

  // Row styles (R1, R2, ...)
  for (const [styleName, rs] of rowStyleMap.values()) {
    autoStyles.appendChild(buildRowStyle(styleName, rs));
  }

  // Graphic styles (Gr1, Gr2, ...)
  for (const [styleName, gs] of graphicStyleMap.values()) {
    autoStyles.appendChild(buildGraphicStyle(styleName, gs));
  }

  // List styles (L1, L2, ...)
  let listCounter = 1;
  for (const element of elements) {
    if (element.type === "list" && element.list) {
      const listName = `L${listCounter}`;
      autoStyles.appendChild(buildListStyle(listName, element.list));
      listCounter++;
    }
  }

  // Page break style (only if needed)
  const hasPageBreak = elements.some((e) => e.type === "page-break");
  if (hasPageBreak) {
    const pbStyle = el("style:style")
      .attr("style:name", "PageBreak")
      .attr("style:family", "paragraph")
      .attr("style:parent-style-name", "Standard");
    pbStyle.appendChild(el("style:paragraph-properties").attr("fo:break-before", "page"));
    autoStyles.appendChild(pbStyle);
  }

  root.appendChild(autoStyles);

  // Body → Text
  const body = el("office:body");
  const textContainer = el("office:text");

  // Add content elements
  tableCounter = 1;
  listCounter = 1;
  for (const element of elements) {
    switch (element.type) {
      case "paragraph": {
        const styleName = resolveParagraphStyleName(element, "Standard", paraStyleMap);
        const p = el("text:p").attr("text:style-name", styleName);
        imageCounter = appendRuns(
          p,
          element.runs ?? [],
          textStyleMap,
          imageMap,
          imageCounter,
          graphicStyleMap,
        );
        textContainer.appendChild(p);
        break;
      }
      case "heading": {
        const level = element.level ?? 1;
        const defaultStyleName = `Heading_20_${level}`;
        // If paragraph options are present, use a custom style that inherits
        // from the heading level style — otherwise use the named style directly.
        const styleName = resolveParagraphStyleName(element, defaultStyleName, paraStyleMap);
        const h = el("text:h")
          .attr("text:style-name", styleName)
          .attr("text:outline-level", String(level));
        imageCounter = appendRuns(
          h,
          element.runs ?? [],
          textStyleMap,
          imageMap,
          imageCounter,
          graphicStyleMap,
        );
        textContainer.appendChild(h);
        break;
      }
      case "table": {
        if (element.table) {
          const tableName = `Table${tableCounter}`;
          textContainer.appendChild(
            buildTableElement(
              tableName,
              element.table,
              textStyleMap,
              cellStyleMap,
              rowStyleMap,
              imageMap,
              imageCounter,
              graphicStyleMap,
            ),
          );
          // Count images in this table to advance the counter
          imageCounter += countImagesInTable(element.table);
          tableCounter++;
        }
        break;
      }
      case "list": {
        if (element.list) {
          const listName = `L${listCounter}`;
          textContainer.appendChild(
            buildListElement(
              listName,
              element.list,
              textStyleMap,
              imageMap,
              imageCounter,
              graphicStyleMap,
            ),
          );
          imageCounter += countImagesInList(element.list);
          listCounter++;
        }
        break;
      }
      case "page-break": {
        textContainer.appendChild(el("text:p").attr("text:style-name", "PageBreak"));
        break;
      }
      case "image": {
        if (element.image && imageMap) {
          const p = el("text:p").attr("text:style-name", "Standard");
          p.appendChild(buildImageFrame(element.image, imageMap, imageCounter, graphicStyleMap));
          imageCounter++;
          textContainer.appendChild(p);
        }
        break;
      }
    }
  }

  body.appendChild(textContainer);
  root.appendChild(body);
  return xmlDocument(root);
}

// ─── Text Style Map ───────────────────────────────────────────────────

/**
 * Build a map from formatting key → [style name, normalized formatting].
 * Scans paragraphs, headings, table cells, list items, AND link formatting.
 */
function buildTextStyleMap(
  elements: ContentElement[],
): Map<string, [string, NormalizedFormatting]> {
  const map = new Map<string, [string, NormalizedFormatting]>();
  let counter = 1;

  function registerRuns(runs: TextRun[]): void {
    for (const run of runs) {
      if (!run.formatting) continue;
      const normalized = normalizeFormatting(run.formatting);
      const key = formattingKey(normalized);
      if (key === "") continue;
      if (!map.has(key)) {
        map.set(key, [`T${counter}`, normalized]);
        counter++;
      }
    }
  }

  function registerListItems(items: ListItemData[]): void {
    for (const item of items) {
      registerRuns(item.runs);
      if (item.nested) {
        registerListItems(item.nested.items);
      }
    }
  }

  for (const element of elements) {
    if (element.runs) {
      registerRuns(element.runs);
    }
    if (element.type === "table" && element.table) {
      for (const row of element.table.rows) {
        for (const cell of row.cells) {
          registerRuns(cell.runs);
        }
      }
    }
    if (element.type === "list" && element.list) {
      registerListItems(element.list.items);
    }
  }

  return map;
}

/**
 * Collect all unique font family names referenced in a text style map.
 * Used to emit font-face declarations in content.xml.
 */
function collectFontFamilies(
  textStyleMap: Map<string, [string, NormalizedFormatting]>,
): Set<string> {
  const families = new Set<string>();
  for (const [, fmt] of textStyleMap.values()) {
    if (fmt.fontFamily) families.add(fmt.fontFamily);
  }
  return families;
}

// ─── Row Style Map ────────────────────────────────────────────────────

/**
 * Build a map from row style key → [style name, normalized row style].
 * Scans all table rows for unique row formatting combinations.
 */
function buildRowStyleMap(elements: ContentElement[]): Map<string, [string, NormalizedRowStyle]> {
  const map = new Map<string, [string, NormalizedRowStyle]>();
  let counter = 1;

  for (const element of elements) {
    if (element.type !== "table" || !element.table) continue;

    for (const row of element.table.rows) {
      const normalized = normalizeRowStyle(row.options);
      const key = rowStyleKey(normalized);
      if (key === "") continue;
      if (!map.has(key)) {
        map.set(key, [`R${counter}`, normalized]);
        counter++;
      }
    }
  }

  return map;
}

// ─── Cell Style Map ───────────────────────────────────────────────────

/**
 * Build a map from cell style key → [style name, normalized cell style].
 * Scans all tables for unique cell formatting combinations.
 */
function buildCellStyleMap(elements: ContentElement[]): Map<string, [string, NormalizedCellStyle]> {
  const map = new Map<string, [string, NormalizedCellStyle]>();
  let counter = 1;

  for (const element of elements) {
    if (element.type !== "table" || !element.table) continue;

    const tableBorder = element.table.options?.border;

    for (const row of element.table.rows) {
      for (const cell of row.cells) {
        const normalized = normalizeCellStyle(cell.options, tableBorder);
        const key = cellStyleKey(normalized);
        if (key === "") continue;
        if (!map.has(key)) {
          map.set(key, [`C${counter}`, normalized]);
          counter++;
        }
      }
    }
  }

  return map;
}

/**
 * Append table-level and column-level automatic styles.
 */
function appendTableStyles(autoStyles: XmlElement, tableName: string, table: TableData): void {
  // Table style
  const tableStyle = el("style:style").attr("style:name", tableName).attr("style:family", "table");
  const tableProps = el("style:table-properties").attr("table:align", "margins");
  tableStyle.appendChild(tableProps);
  autoStyles.appendChild(tableStyle);

  // Column styles (if widths are specified)
  const widths = table.options?.columnWidths;
  if (widths) {
    for (let i = 0; i < widths.length; i++) {
      const colLetter = String.fromCharCode(65 + i);
      const colStyle = el("style:style")
        .attr("style:name", `${tableName}.${colLetter}`)
        .attr("style:family", "table-column");
      const colProps = el("style:table-column-properties").attr("style:column-width", widths[i]);
      colStyle.appendChild(colProps);
      autoStyles.appendChild(colStyle);
    }
  }
}

/**
 * Build a row automatic style element.
 */
function buildRowStyle(styleName: string, rs: NormalizedRowStyle): XmlElement {
  const style = el("style:style").attr("style:name", styleName).attr("style:family", "table-row");

  const props = el("style:table-row-properties");

  if (rs.backgroundColor) {
    props.attr("fo:background-color", rs.backgroundColor);
  }

  style.appendChild(props);
  return style;
}

/**
 * Build a cell automatic style element.
 */
function buildCellStyle(styleName: string, cs: NormalizedCellStyle): XmlElement {
  const style = el("style:style").attr("style:name", styleName).attr("style:family", "table-cell");

  const props = el("style:table-cell-properties");

  if (cs.backgroundColor) {
    props.attr("fo:background-color", cs.backgroundColor);
  }
  if (cs.borderTop) {
    props.attr("fo:border-top", cs.borderTop);
  }
  if (cs.borderBottom) {
    props.attr("fo:border-bottom", cs.borderBottom);
  }
  if (cs.borderLeft) {
    props.attr("fo:border-left", cs.borderLeft);
  }
  if (cs.borderRight) {
    props.attr("fo:border-right", cs.borderRight);
  }
  if (cs.verticalAlign) {
    props.attr("style:vertical-align", cs.verticalAlign);
  }
  if (cs.padding) {
    props.attr("fo:padding", cs.padding);
  }

  style.appendChild(props);
  return style;
}

// ─── Table Building ──────────────────────────────────────────────────

/**
 * Build a table:table element with all its rows and cells.
 */
function buildTableElement(
  tableName: string,
  table: TableData,
  textStyleMap: Map<string, [string, NormalizedFormatting]>,
  cellStyleMap: Map<string, [string, NormalizedCellStyle]>,
  rowStyleMap: Map<string, [string, NormalizedRowStyle]>,
  imageMap?: Map<ImageData, string>,
  imageCounterStart?: number,
  graphicStyleMap: Map<string, [string, NormalizedGraphicStyle]> = new Map(),
): XmlElement {
  let imageCounter = imageCounterStart ?? 1;

  const tableEl = el("table:table")
    .attr("table:name", tableName)
    .attr("table:style-name", tableName);

  // Columns
  const numCols = getColumnCount(table);
  const widths = table.options?.columnWidths;

  if (widths) {
    for (let i = 0; i < Math.max(widths.length, numCols); i++) {
      if (i < widths.length) {
        tableEl.appendChild(
          el("table:table-column").attr(
            "table:style-name",
            `${tableName}.${String.fromCharCode(65 + i)}`,
          ),
        );
      } else {
        tableEl.appendChild(el("table:table-column"));
      }
    }
  } else if (numCols > 0) {
    tableEl.appendChild(
      el("table:table-column").attr("table:number-columns-repeated", String(numCols)),
    );
  }

  // Build coverage map for rowSpan/colSpan
  const covered = buildCoverageMap(table);
  const tableBorder = table.options?.border;

  // Rows
  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    const row = table.rows[rowIdx];
    const rowEl = el("table:table-row");

    // Apply row style when one exists for this row's options
    const normalizedRow = normalizeRowStyle(row.options);
    const rsKey = rowStyleKey(normalizedRow);
    if (rsKey !== "") {
      const entry = rowStyleMap.get(rsKey);
      if (entry) rowEl.attr("table:style-name", entry[0]);
    }

    let logicalCol = 0;

    for (const cell of row.cells) {
      // Skip positions covered by previous spans
      while (covered.has(`${rowIdx},${logicalCol}`)) {
        rowEl.appendChild(el("table:covered-table-cell"));
        logicalCol++;
      }

      // Empty cells
      if (cell.runs.length === 0 && !cell.options) {
        rowEl.appendChild(
          el("table:table-cell").appendChild(el("text:p").attr("text:style-name", "Standard")),
        );
        logicalCol++;
        continue;
      }

      // Real cell — omit office:value-type for text cells (spec violation to set
      // it without the corresponding office:string-value attribute)
      const cellEl = el("table:table-cell");

      // Cell style
      const normalizedCell = normalizeCellStyle(cell.options, tableBorder);
      const csKey = cellStyleKey(normalizedCell);
      if (csKey !== "") {
        const entry = cellStyleMap.get(csKey);
        cellEl.attr("table:style-name", entry![0]);
      }

      // Spanning
      const colSpan = cell.options?.colSpan ?? 1;
      if (colSpan > 1) {
        cellEl.attr("table:number-columns-spanned", String(colSpan));
      }

      const rowSpan = cell.options?.rowSpan ?? 1;
      if (rowSpan > 1) {
        cellEl.attr("table:number-rows-spanned", String(rowSpan));
      }

      // Cell content paragraph
      const p = el("text:p").attr("text:style-name", "Standard");
      imageCounter = appendRuns(
        p,
        cell.runs,
        textStyleMap,
        imageMap,
        imageCounter,
        graphicStyleMap,
      );
      cellEl.appendChild(p);

      rowEl.appendChild(cellEl);
      logicalCol += colSpan;

      // Covered cells after a colSpan
      for (let s = 1; s < colSpan; s++) {
        rowEl.appendChild(el("table:covered-table-cell"));
      }
    }

    tableEl.appendChild(rowEl);
  }

  return tableEl;
}

/**
 * Determine the number of columns in a table by examining all rows,
 * accounting for colSpan.
 */
function getColumnCount(table: TableData): number {
  let maxCols = 0;
  for (const row of table.rows) {
    let cols = 0;
    for (const cell of row.cells) {
      cols += cell.options?.colSpan ?? 1;
    }
    maxCols = Math.max(maxCols, cols);
  }
  if (table.options?.columnWidths) {
    maxCols = Math.max(maxCols, table.options.columnWidths.length);
  }
  return maxCols;
}

/**
 * Build a set of covered cell positions from rowSpan/colSpan.
 */
function buildCoverageMap(table: TableData): Set<string> {
  const covered = new Set<string>();

  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    const row = table.rows[rowIdx];
    let colIdx = 0;

    for (const cell of row.cells) {
      // Skip already-covered positions
      while (covered.has(`${rowIdx},${colIdx}`)) {
        colIdx++;
      }

      const colSpan = cell.options?.colSpan ?? 1;
      const rowSpan = cell.options?.rowSpan ?? 1;

      // Mark covered positions (excluding the cell itself)
      for (let r = 0; r < rowSpan; r++) {
        for (let c = 0; c < colSpan; c++) {
          if (r === 0 && c === 0) continue;
          covered.add(`${rowIdx + r},${colIdx + c}`);
        }
      }

      colIdx += colSpan;
    }
  }

  return covered;
}

// ─── Text Runs & Styles (shared by paragraphs, table cells, lists) ────

/**
 * Append text runs to a parent element (paragraph, heading, or cell paragraph).
 * Returns the updated image counter.
 */
function appendRuns(
  parent: XmlElement,
  runs: TextRun[],
  styleMap: Map<string, [string, NormalizedFormatting]>,
  imageMap?: Map<ImageData, string>,
  imageCounter: number = 1,
  graphicStyleMap: Map<string, [string, NormalizedGraphicStyle]> = new Map(),
): number {
  for (const run of runs) {
    // Line break
    if (run.lineBreak) {
      parent.appendChild(el("text:line-break"));
      continue;
    }

    // Tab element
    if (run.field === "tab") {
      parent.appendChild(el("text:tab"));
      continue;
    }

    // Page number field
    if (run.field === "page-number") {
      const pageNum = el("text:page-number").attr("text:select-page", "current").text(run.text);

      if (run.formatting) {
        const normalized = normalizeFormatting(run.formatting);
        const key = formattingKey(normalized);
        if (key !== "") {
          const entry = styleMap.get(key)!;
          const span = el("text:span").attr("text:style-name", entry[0]);
          span.appendChild(pageNum);
          parent.appendChild(span);
          continue;
        }
      }
      parent.appendChild(pageNum);
      continue;
    }

    // Bookmark
    if (run.bookmark) {
      parent.appendChild(el("text:bookmark").attr("text:name", run.bookmark));
      // If there's also text, render it after the bookmark
      if (run.text) {
        parent.text(run.text);
      }
      continue;
    }

    // Image
    if (run.image) {
      if (imageMap) {
        parent.appendChild(buildImageFrame(run.image, imageMap, imageCounter, graphicStyleMap));
        imageCounter++;
      }
      continue;
    }

    // Hyperlink
    if (run.link) {
      const linkEl = el("text:a").attr("xlink:type", "simple").attr("xlink:href", run.link);

      if (run.formatting) {
        const normalized = normalizeFormatting(run.formatting);
        const key = formattingKey(normalized);
        if (key !== "") {
          const entry = styleMap.get(key)!;
          linkEl.appendChild(el("text:span").attr("text:style-name", entry[0]).text(run.text));
        } else {
          linkEl.text(run.text);
        }
      } else {
        linkEl.text(run.text);
      }

      parent.appendChild(linkEl);
      continue;
    }

    // Plain or formatted text
    if (!run.formatting) {
      parent.text(run.text);
    } else {
      const normalized = normalizeFormatting(run.formatting);
      const key = formattingKey(normalized);

      if (key === "") {
        parent.text(run.text);
      } else {
        const entry = styleMap.get(key)!;
        const styleName = entry[0];
        parent.appendChild(el("text:span").attr("text:style-name", styleName).text(run.text));
      }
    }
  }

  return imageCounter;
}

/**
 * Build an ODF automatic style element for text formatting.
 * All four text properties (font-weight, font-style, font-size, font-name/family)
 * are tripled: Western + Asian + Complex. This ensures CJK and RTL text in the
 * same run is formatted correctly rather than falling back to parent style values.
 */
function buildTextStyle(styleName: string, fmt: NormalizedFormatting): XmlElement {
  const style = el("style:style").attr("style:name", styleName).attr("style:family", "text");

  const props = el("style:text-properties");

  if (fmt.fontWeight) {
    props.attr("fo:font-weight", fmt.fontWeight);
    props.attr("style:font-weight-asian", fmt.fontWeight);
    props.attr("style:font-weight-complex", fmt.fontWeight);
  }
  if (fmt.fontStyle) {
    props.attr("fo:font-style", fmt.fontStyle);
    props.attr("style:font-style-asian", fmt.fontStyle);
    props.attr("style:font-style-complex", fmt.fontStyle);
  }
  if (fmt.fontSize) {
    props.attr("fo:font-size", fmt.fontSize);
    props.attr("style:font-size-asian", fmt.fontSize);
    props.attr("style:font-size-complex", fmt.fontSize);
  }
  if (fmt.fontFamily) {
    props.attr("style:font-name", fmt.fontFamily);
    props.attr("fo:font-family", fmt.fontFamily);
    props.attr("style:font-name-asian", fmt.fontFamily);
    props.attr("style:font-name-complex", fmt.fontFamily);
  }
  if (fmt.color) {
    props.attr("fo:color", fmt.color);
  }
  if (fmt.underline) {
    props.attr("style:text-underline-style", "solid");
    props.attr("style:text-underline-width", "auto");
    props.attr("style:text-underline-color", "font-color");
  }
  if (fmt.strikethrough) {
    props.attr("style:text-line-through-style", "solid");
  }
  if (fmt.superscript) {
    props.attr("style:text-position", "super 58%");
  }
  if (fmt.subscript) {
    props.attr("style:text-position", "sub 58%");
  }
  if (fmt.highlightColor) {
    props.attr("fo:background-color", fmt.highlightColor);
  }
  if (fmt.textTransform) {
    props.attr("fo:text-transform", fmt.textTransform);
  }
  if (fmt.smallCaps) {
    props.attr("fo:font-variant", "small-caps");
  }

  style.appendChild(props);
  return style;
}

// ─── Paragraph Styles ─────────────────────────────────────────────────

/**
 * Normalize a lineHeight value to an ODF fo:line-height string.
 * Numbers ≥ 1 are treated as multipliers (1.5 → "150%").
 * Strings with units are passed through as-is ("18pt" → "18pt").
 */
function normalizeLineHeight(lineHeight: number | string): string {
  if (typeof lineHeight === "number") {
    return `${Math.round(lineHeight * 100)}%`;
  }
  return lineHeight;
}

/**
 * Returns true when the ParagraphOptions object contains at least one
 * property that requires a custom automatic paragraph style.
 */
function hasParagraphOptions(opts: ParagraphOptions | undefined): boolean {
  if (!opts) return false;
  return !!(
    opts.align ||
    opts.spaceBefore ||
    opts.spaceAfter ||
    opts.lineHeight !== undefined ||
    opts.indentLeft ||
    opts.indentFirst ||
    opts.borderBottom ||
    (opts.tabStops && opts.tabStops.length > 0)
  );
}

/**
 * Generate a stable key for a ParagraphOptions object.
 * Two identical option combinations produce the same key,
 * enabling style deduplication.
 */
function paragraphOptionsKey(opts: ParagraphOptions): string {
  const parts: string[] = [];
  if (opts.align) parts.push(`a:${opts.align}`);
  if (opts.spaceBefore) parts.push(`sb:${opts.spaceBefore}`);
  if (opts.spaceAfter) parts.push(`sa:${opts.spaceAfter}`);
  if (opts.lineHeight !== undefined) parts.push(`lh:${opts.lineHeight}`);
  if (opts.indentLeft) parts.push(`il:${opts.indentLeft}`);
  if (opts.indentFirst) parts.push(`if:${opts.indentFirst}`);
  if (opts.borderBottom) parts.push(`bdb:${opts.borderBottom}`);
  if (opts.tabStops && opts.tabStops.length > 0) {
    parts.push(`ts:${tabStopsKey(opts.tabStops)}`);
  }
  return parts.join("|");
}

/**
 * Generate a key for a set of tab stops.
 */
function tabStopsKey(tabStops: TabStop[]): string {
  return tabStops.map((ts) => `${ts.position}:${ts.type ?? "left"}`).join("|");
}

/**
 * Build a map of unique paragraph styles needed for all paragraph options.
 *
 * The map key is `${parentStyle}|${optionsKey}` so that two elements with
 * identical options but different parents (e.g. a paragraph vs. a heading)
 * get distinct automatic styles with the correct inheritance chain.
 *
 * Map value: [styleName, ParagraphOptions, parentStyleName]
 */
function buildParagraphStyleMap(
  elements: ContentElement[],
): Map<string, [string, ParagraphOptions, string]> {
  const map = new Map<string, [string, ParagraphOptions, string]>();
  let counter = 1;

  function register(opts: ParagraphOptions, parentStyle: string): void {
    const optsKey = paragraphOptionsKey(opts);
    const mapKey = `${parentStyle}|${optsKey}`;
    if (!map.has(mapKey)) {
      map.set(mapKey, [`P${counter}`, opts, parentStyle]);
      counter++;
    }
  }

  for (const element of elements) {
    if (!hasParagraphOptions(element.paragraphOptions)) continue;

    if (element.type === "paragraph") {
      register(element.paragraphOptions!, "Standard");
    } else if (element.type === "heading") {
      const level = element.level ?? 1;
      register(element.paragraphOptions!, `Heading_20_${level}`);
    }
  }

  return map;
}

/**
 * Build a paragraph automatic style element.
 *
 * @param styleName - The generated style name (e.g. "P1").
 * @param opts - The paragraph options to encode.
 * @param parentStyle - The named style this inherits from ("Standard" for
 *   paragraphs, "Heading_20_N" for headings with options).
 */
function buildParagraphStyle(
  styleName: string,
  opts: ParagraphOptions,
  parentStyle: string,
): XmlElement {
  const style = el("style:style")
    .attr("style:name", styleName)
    .attr("style:family", "paragraph")
    .attr("style:parent-style-name", parentStyle);

  const paraProps = el("style:paragraph-properties");
  let hasParaProps = false;

  if (opts.align) {
    paraProps.attr("fo:text-align", opts.align);
    hasParaProps = true;
  }
  if (opts.spaceBefore) {
    paraProps.attr("fo:margin-top", opts.spaceBefore);
    hasParaProps = true;
  }
  if (opts.spaceAfter) {
    paraProps.attr("fo:margin-bottom", opts.spaceAfter);
    hasParaProps = true;
  }
  if (opts.lineHeight !== undefined) {
    paraProps.attr("fo:line-height", normalizeLineHeight(opts.lineHeight));
    hasParaProps = true;
  }
  if (opts.indentLeft) {
    paraProps.attr("fo:margin-left", opts.indentLeft);
    hasParaProps = true;
  }
  if (opts.indentFirst) {
    paraProps.attr("fo:text-indent", opts.indentFirst);
    hasParaProps = true;
  }
  if (opts.borderBottom) {
    paraProps.attr("fo:border-bottom", opts.borderBottom);
    hasParaProps = true;
  }
  if (opts.tabStops && opts.tabStops.length > 0) {
    const tabStopsEl = el("style:tab-stops");
    for (const ts of opts.tabStops) {
      tabStopsEl.appendChild(
        el("style:tab-stop")
          .attr("style:position", ts.position)
          .attr("style:type", ts.type ?? "left"),
      );
    }
    paraProps.appendChild(tabStopsEl);
    hasParaProps = true;
  }

  if (hasParaProps) {
    style.appendChild(paraProps);
  }

  return style;
}

/**
 * Returns the paragraph style name to use for a given element.
 *
 * If the element has no meaningful paragraph options, returns the
 * provided default style name unchanged. Otherwise looks up the
 * pre-built automatic style from the map.
 *
 * @param element - The content element being rendered.
 * @param defaultStyleName - The fallback named style ("Standard" for paragraphs,
 *   "Heading_20_N" for headings).
 * @param paraStyleMap - The pre-built paragraph style map.
 */
function resolveParagraphStyleName(
  element: ContentElement,
  defaultStyleName: string,
  paraStyleMap: Map<string, [string, ParagraphOptions, string]>,
): string {
  if (!hasParagraphOptions(element.paragraphOptions)) return defaultStyleName;
  const optsKey = paragraphOptionsKey(element.paragraphOptions!);
  const mapKey = `${defaultStyleName}|${optsKey}`;
  const entry = paraStyleMap.get(mapKey);
  return entry ? entry[0] : defaultStyleName;
}

// ─── List Building ───────────────────────────────────────────────────

/** Bullet characters for each nesting level. */
const BULLET_CHARS = ["•", "◦", "▪", "▸", "–", "·"];

/**
 * Build a list style definition for automatic-styles.
 */
function buildListStyle(styleName: string, list: ListData): XmlElement {
  const isBullet = (list.options?.type ?? "bullet") === "bullet";
  const listStyle = el("text:list-style").attr("style:name", styleName);

  // Generate styles for up to 6 nesting levels
  const maxLevel = 6;
  for (let level = 1; level <= maxLevel; level++) {
    const indent = level * 0.635;
    const marginLeft = `${(indent * 2).toFixed(3)}cm`;
    const textIndent = `-${indent.toFixed(3)}cm`;

    if (isBullet) {
      const bulletEl = el("text:list-level-style-bullet")
        .attr("text:level", String(level))
        .attr("text:bullet-char", BULLET_CHARS[(level - 1) % BULLET_CHARS.length]);

      const levelProps = el("style:list-level-properties").attr(
        "text:list-level-position-and-space-mode",
        "label-alignment",
      );

      levelProps.appendChild(
        el("style:list-level-label-alignment")
          .attr("text:label-followed-by", "listtab")
          .attr("text:list-tab-stop-position", marginLeft)
          .attr("fo:text-indent", textIndent)
          .attr("fo:margin-left", marginLeft),
      );

      bulletEl.appendChild(levelProps);
      listStyle.appendChild(bulletEl);
    } else {
      const numFormat = list.options?.numFormat ?? "1";
      const numSuffix = list.options?.numSuffix ?? ".";

      const numberEl = el("text:list-level-style-number")
        .attr("text:level", String(level))
        .attr("style:num-format", numFormat)
        .attr("style:num-suffix", numSuffix);

      if (list.options?.numPrefix) {
        numberEl.attr("style:num-prefix", list.options.numPrefix);
      }

      const levelProps = el("style:list-level-properties").attr(
        "text:list-level-position-and-space-mode",
        "label-alignment",
      );

      levelProps.appendChild(
        el("style:list-level-label-alignment")
          .attr("text:label-followed-by", "listtab")
          .attr("text:list-tab-stop-position", marginLeft)
          .attr("fo:text-indent", textIndent)
          .attr("fo:margin-left", marginLeft),
      );

      numberEl.appendChild(levelProps);
      listStyle.appendChild(numberEl);
    }
  }

  return listStyle;
}

/**
 * Build a text:list element for the document body.
 */
function buildListElement(
  styleName: string,
  list: ListData,
  textStyleMap: Map<string, [string, NormalizedFormatting]>,
  imageMap?: Map<ImageData, string>,
  imageCounterStart?: number,
  graphicStyleMap: Map<string, [string, NormalizedGraphicStyle]> = new Map(),
): XmlElement {
  const isBullet = (list.options?.type ?? "bullet") === "bullet";
  const paraStyleName = isBullet ? "List_20_Bullet" : "List_20_Number";
  const startValue = !isBullet ? list.options?.startValue : undefined;
  let imageCounter = imageCounterStart ?? 1;
  let isFirstItem = true;

  const listEl = el("text:list").attr("text:style-name", styleName);

  function appendItems(parentEl: XmlElement, items: ListItemData[], isRoot: boolean): void {
    for (const item of items) {
      const itemEl = el("text:list-item");

      // text:start-value goes on the first item of the root list only
      if (isRoot && isFirstItem && startValue !== undefined) {
        itemEl.attr("text:start-value", String(startValue));
        isFirstItem = false;
      } else if (isRoot) {
        isFirstItem = false;
      }

      // Paragraph with the item text
      const p = el("text:p").attr("text:style-name", paraStyleName);
      imageCounter = appendRuns(
        p,
        item.runs,
        textStyleMap,
        imageMap,
        imageCounter,
        graphicStyleMap,
      );
      itemEl.appendChild(p);

      // Nested sub-list (goes inside the same list-item)
      if (item.nested) {
        const subList = el("text:list");
        appendItems(subList, item.nested.items, false);
        itemEl.appendChild(subList);
      }

      parentEl.appendChild(itemEl);
    }
  }

  appendItems(listEl, list.items, true);
  return listEl;
}

// ─── Image Building ──────────────────────────────────────────────────

/**
 * Build a draw:frame element containing a draw:image for an embedded image.
 */
function buildImageFrame(
  image: ImageData,
  imageMap: Map<ImageData, string>,
  imageCounter: number,
  graphicStyleMap: Map<string, [string, NormalizedGraphicStyle]>,
): XmlElement {
  const imagePath = imageMap.get(image);
  if (!imagePath) {
    throw new Error("Image not found in imageMap — this is an internal error.");
  }

  const frame = el("draw:frame")
    .attr("draw:name", image.name ?? `Image${imageCounter}`)
    .attr("text:anchor-type", image.anchor);
  if (image.width) frame.attr("svg:width", image.width);
  if (image.height) frame.attr("svg:height", image.height);

  // Resolve graphic style name if any graphic properties are set
  const gsKey = graphicStyleKey(normalizeGraphicStyle(image));
  if (gsKey !== "") {
    const entry = graphicStyleMap.get(gsKey);
    if (entry) {
      frame.attr("draw:style-name", entry[0]);
    }
  }

  if (image.alt) {
    frame.appendChild(el("svg:title").text(image.alt));
  }
  if (image.description) {
    frame.appendChild(el("svg:desc").text(image.description));
  }

  const drawImage = el("draw:image")
    .attr("xlink:href", imagePath)
    .attr("xlink:type", "simple")
    .attr("xlink:show", "embed")
    .attr("xlink:actuate", "onLoad");

  frame.appendChild(drawImage);
  return frame;
}

/**
 * Count images in runs.
 */
function countImagesInRuns(runs: TextRun[]): number {
  let count = 0;
  for (const run of runs) {
    if (run.image) count++;
  }
  return count;
}

/**
 * Count images in a table.
 */
function countImagesInTable(table: TableData): number {
  let count = 0;
  for (const row of table.rows) {
    for (const cell of row.cells) {
      count += countImagesInRuns(cell.runs);
    }
  }
  return count;
}

/**
 * Count images in a list (recursive).
 */
function countImagesInList(list: ListData): number {
  let count = 0;
  function countItems(items: ListItemData[]): void {
    for (const item of items) {
      count += countImagesInRuns(item.runs);
      if (item.nested) countItems(item.nested.items);
    }
  }
  countItems(list.items);
  return count;
}

// ─── Header/Footer Builder (used by document.ts for styles.xml) ───────

/**
 * Build a paragraph element and associated text styles for header/footer content.
 *
 * @param runs - Text runs (from HeaderFooterBuilder or parsed string).
 * @param styleName - The paragraph style name ("Header" or "Footer").
 * @param stylePrefix - Prefix for automatic text styles ("HF" → HF1, HF2, ...).
 * @returns The paragraph element and any text styles needed.
 */
export function buildHeaderFooterContent(
  runs: TextRun[],
  styleName: string,
  stylePrefix: string,
): { paragraph: XmlElement; styles: XmlElement[] } {
  // Build style map for these runs
  const styleMap = new Map<string, [string, NormalizedFormatting]>();
  let counter = 1;

  for (const run of runs) {
    if (!run.formatting) continue;
    const normalized = normalizeFormatting(run.formatting);
    const key = formattingKey(normalized);
    if (key === "" || styleMap.has(key)) continue;
    styleMap.set(key, [`${stylePrefix}${counter}`, normalized]);
    counter++;
  }

  // Build the paragraph
  const p = el("text:p").attr("text:style-name", styleName);
  appendRuns(p, runs, styleMap);

  // Build the style elements
  const styles: XmlElement[] = [];
  for (const [name, fmt] of styleMap.values()) {
    styles.push(buildTextStyle(name, fmt));
  }

  return { paragraph: p, styles };
}
