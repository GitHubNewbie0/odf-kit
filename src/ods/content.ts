import { ODF_NS, ODF_VERSION } from "../core/namespaces.js";
import { el, xmlDocument } from "../core/xml.js";
import type { XmlElement } from "../core/xml.js";
import type {
  OdsCellData,
  OdsCellOptions,
  OdsDateFormat,
  OdsRowData,
  OdsRowOptions,
  OdsSheetData,
} from "./types.js";

// ─── Normalized Cell Style ────────────────────────────────────────────

/**
 * Resolved cell style properties ready for ODF style generation.
 * Captures text formatting, cell formatting, and optional data style reference.
 */
interface NormalizedCellStyle {
  // Text properties
  fontWeight?: string;
  fontStyle?: string;
  fontSize?: string;
  fontFamily?: string;
  color?: string;
  underline?: boolean;
  // Cell properties
  backgroundColor?: string;
  borderTop?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderRight?: string;
  textAlign?: string;
  verticalAlign?: string;
  padding?: string;
  wrap?: boolean;
  // Data style reference (links cell style to number:date-style)
  dataStyleName?: string;
}

/** Generate a stable deduplication key for a NormalizedCellStyle. */
function cellStyleKey(cs: NormalizedCellStyle): string {
  const parts: string[] = [];
  if (cs.fontWeight) parts.push(`fw:${cs.fontWeight}`);
  if (cs.fontStyle) parts.push(`fs:${cs.fontStyle}`);
  if (cs.fontSize) parts.push(`fz:${cs.fontSize}`);
  if (cs.fontFamily) parts.push(`ff:${cs.fontFamily}`);
  if (cs.color) parts.push(`co:${cs.color}`);
  if (cs.underline) parts.push(`ul:true`);
  if (cs.backgroundColor) parts.push(`bg:${cs.backgroundColor}`);
  if (cs.borderTop) parts.push(`bt:${cs.borderTop}`);
  if (cs.borderBottom) parts.push(`bb:${cs.borderBottom}`);
  if (cs.borderLeft) parts.push(`bl:${cs.borderLeft}`);
  if (cs.borderRight) parts.push(`br:${cs.borderRight}`);
  if (cs.textAlign) parts.push(`ta:${cs.textAlign}`);
  if (cs.verticalAlign) parts.push(`va:${cs.verticalAlign}`);
  if (cs.padding) parts.push(`p:${cs.padding}`);
  if (cs.wrap) parts.push(`wr:true`);
  if (cs.dataStyleName) parts.push(`ds:${cs.dataStyleName}`);
  return parts.join("|");
}

/** Normalize OdsCellOptions (merged effective options) into a NormalizedCellStyle. */
function normalizeOdsCellStyle(
  opts: OdsCellOptions | undefined,
  dataStyleName: string | undefined,
): NormalizedCellStyle {
  const result: NormalizedCellStyle = {};

  if (opts?.bold) result.fontWeight = "bold";
  if (opts?.italic) result.fontStyle = "italic";
  if (opts?.fontSize !== undefined) result.fontSize = normalizeFontSize(opts.fontSize);
  if (opts?.fontFamily) result.fontFamily = opts.fontFamily;
  if (opts?.color) result.color = opts.color;
  if (opts?.underline) result.underline = true;
  if (opts?.backgroundColor) result.backgroundColor = opts.backgroundColor;

  // Border resolution: side-specific overrides uniform shorthand
  const border = opts?.border;
  result.borderTop = opts?.borderTop ?? border;
  result.borderBottom = opts?.borderBottom ?? border;
  result.borderLeft = opts?.borderLeft ?? border;
  result.borderRight = opts?.borderRight ?? border;
  if (!result.borderTop) delete result.borderTop;
  if (!result.borderBottom) delete result.borderBottom;
  if (!result.borderLeft) delete result.borderLeft;
  if (!result.borderRight) delete result.borderRight;

  if (opts?.align) result.textAlign = opts.align;
  if (opts?.verticalAlign) result.verticalAlign = opts.verticalAlign;
  if (opts?.padding) result.padding = opts.padding;
  if (opts?.wrap) result.wrap = true;
  if (dataStyleName) result.dataStyleName = dataStyleName;

  return result;
}

/** Normalize a fontSize value to an ODF string with units. */
function normalizeFontSize(fontSize: number | string): string {
  return typeof fontSize === "number" ? `${fontSize}pt` : fontSize;
}

// ─── Option Merging ───────────────────────────────────────────────────

/**
 * Merge row-level options with cell-level options.
 * Cell options take precedence over row options for any property defined in both.
 */
function mergeOptions(
  rowOpts: OdsRowOptions | undefined,
  cellOpts: OdsCellOptions | undefined,
): OdsCellOptions | undefined {
  if (!rowOpts && !cellOpts) return undefined;
  if (!rowOpts) return cellOpts;
  if (!cellOpts) return rowOpts;
  return { ...rowOpts, ...cellOpts };
}

// ─── Date Format Helpers ──────────────────────────────────────────────

/** Map a date format enum value to its number:date-style name. */
function dateFormatToStyleName(format: OdsDateFormat): string {
  switch (format) {
    case "YYYY-MM-DD":
      return "Ndate-iso";
    case "DD/MM/YYYY":
      return "Ndate-dmy";
    case "MM/DD/YYYY":
      return "Ndate-mdy";
  }
}

/** Build a number:date-style element for automatic-styles. */
function buildDateFormatStyle(format: OdsDateFormat): XmlElement {
  const dateStyle = el("number:date-style").attr("style:name", dateFormatToStyleName(format));

  switch (format) {
    case "YYYY-MM-DD":
      dateStyle.appendChild(el("number:year").attr("number:style", "long"));
      dateStyle.appendChild(el("number:text").text("-"));
      dateStyle.appendChild(el("number:month").attr("number:style", "long"));
      dateStyle.appendChild(el("number:text").text("-"));
      dateStyle.appendChild(el("number:day").attr("number:style", "long"));
      break;
    case "DD/MM/YYYY":
      dateStyle.appendChild(el("number:day").attr("number:style", "long"));
      dateStyle.appendChild(el("number:text").text("/"));
      dateStyle.appendChild(el("number:month").attr("number:style", "long"));
      dateStyle.appendChild(el("number:text").text("/"));
      dateStyle.appendChild(el("number:year").attr("number:style", "long"));
      break;
    case "MM/DD/YYYY":
      dateStyle.appendChild(el("number:month").attr("number:style", "long"));
      dateStyle.appendChild(el("number:text").text("/"));
      dateStyle.appendChild(el("number:day").attr("number:style", "long"));
      dateStyle.appendChild(el("number:text").text("/"));
      dateStyle.appendChild(el("number:year").attr("number:style", "long"));
      break;
  }

  return dateStyle;
}

/**
 * Format a Date as an ISO date string (YYYY-MM-DD).
 * Always uses UTC to avoid timezone offsets shifting the date.
 */
function formatDateISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format a Date for display according to the given format. */
function formatDateDisplay(date: Date, format: OdsDateFormat): string {
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  switch (format) {
    case "YYYY-MM-DD":
      return `${y}-${m}-${d}`;
    case "DD/MM/YYYY":
      return `${d}/${m}/${y}`;
    case "MM/DD/YYYY":
      return `${m}/${d}/${y}`;
  }
}

/** Resolve the effective date format for a cell: cell > row > document default. */
function effectiveDateFormat(
  cell: OdsCellData,
  row: OdsRowData,
  defaultFormat: OdsDateFormat,
): OdsDateFormat {
  return cell.options?.dateFormat ?? row.options?.dateFormat ?? defaultFormat;
}

// ─── Style Collection ─────────────────────────────────────────────────

/** Scan all sheets for date formats actually used — only emit those styles. */
function collectUsedDateFormats(
  sheets: OdsSheetData[],
  defaultFormat: OdsDateFormat,
): Set<OdsDateFormat> {
  const used = new Set<OdsDateFormat>();
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        if (cell.type === "date") {
          used.add(effectiveDateFormat(cell, row, defaultFormat));
        }
      }
    }
  }
  return used;
}

/**
 * Build a map from cell style key → [style name, normalized style].
 * Deduplicates identical styles across all sheets and rows.
 */
function buildCellStyleMap(
  sheets: OdsSheetData[],
  defaultDateFormat: OdsDateFormat,
): Map<string, [string, NormalizedCellStyle]> {
  const map = new Map<string, [string, NormalizedCellStyle]>();
  let counter = 1;

  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        if (cell.type === "empty") continue;

        const effective = mergeOptions(row.options, cell.options);
        const dataStyleName =
          cell.type === "date"
            ? dateFormatToStyleName(effectiveDateFormat(cell, row, defaultDateFormat))
            : undefined;

        const normalized = normalizeOdsCellStyle(effective, dataStyleName);
        const key = cellStyleKey(normalized);
        if (key === "") continue;

        if (!map.has(key)) {
          map.set(key, [`ce${counter}`, normalized]);
          counter++;
        }
      }
    }
  }

  return map;
}

/**
 * Build a map from column width → style name, plus the shared optimal style name.
 * Columns without explicit widths share one "optimal" style.
 */
function buildColumnStyleMap(sheets: OdsSheetData[]): {
  widthMap: Map<string, string>;
  optimalStyleName: string;
} {
  const widthMap = new Map<string, string>();
  let counter = 1;

  for (const sheet of sheets) {
    for (const colData of sheet.columns.values()) {
      if (colData.width && !widthMap.has(colData.width)) {
        widthMap.set(colData.width, `co${counter}`);
        counter++;
      }
    }
  }

  return { widthMap, optimalStyleName: `co${counter}` };
}

/**
 * Build a map from row height → style name, plus the shared optimal style name.
 * Rows without explicit heights share one "optimal" style.
 */
function buildRowStyleMap(sheets: OdsSheetData[]): {
  heightMap: Map<string, string>;
  optimalStyleName: string;
} {
  const heightMap = new Map<string, string>();
  let counter = 1;

  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      if (row.height && !heightMap.has(row.height)) {
        heightMap.set(row.height, `ro${counter}`);
        counter++;
      }
    }
  }

  return { heightMap, optimalStyleName: `ro${counter}` };
}

// ─── Style Element Builders ───────────────────────────────────────────

function buildTableStyle(styleName: string): XmlElement {
  const style = el("style:style")
    .attr("style:name", styleName)
    .attr("style:family", "table")
    .attr("style:master-page-name", "Default");
  style.appendChild(
    el("style:table-properties").attr("table:display", "true").attr("style:writing-mode", "lr-tb"),
  );
  return style;
}

function buildColumnStyle(styleName: string, width: string): XmlElement {
  const style = el("style:style")
    .attr("style:name", styleName)
    .attr("style:family", "table-column");
  style.appendChild(el("style:table-column-properties").attr("style:column-width", width));
  return style;
}

function buildOptimalColumnStyle(styleName: string): XmlElement {
  const style = el("style:style")
    .attr("style:name", styleName)
    .attr("style:family", "table-column");
  style.appendChild(
    el("style:table-column-properties").attr("style:use-optimal-column-width", "true"),
  );
  return style;
}

function buildRowStyle(styleName: string, height: string): XmlElement {
  const style = el("style:style").attr("style:name", styleName).attr("style:family", "table-row");
  style.appendChild(el("style:table-row-properties").attr("style:row-height", height));
  return style;
}

function buildOptimalRowStyle(styleName: string): XmlElement {
  const style = el("style:style").attr("style:name", styleName).attr("style:family", "table-row");
  style.appendChild(el("style:table-row-properties").attr("style:use-optimal-row-height", "true"));
  return style;
}

function buildCellStyle(styleName: string, cs: NormalizedCellStyle): XmlElement {
  const style = el("style:style")
    .attr("style:name", styleName)
    .attr("style:family", "table-cell")
    .attr("style:parent-style-name", "Default");

  if (cs.dataStyleName) {
    style.attr("style:data-style-name", cs.dataStyleName);
  }

  // Table cell properties
  const hasCellProps =
    cs.backgroundColor ||
    cs.borderTop ||
    cs.borderBottom ||
    cs.borderLeft ||
    cs.borderRight ||
    cs.verticalAlign ||
    cs.padding ||
    cs.wrap;

  if (hasCellProps) {
    const cellProps = el("style:table-cell-properties");
    if (cs.backgroundColor) cellProps.attr("fo:background-color", cs.backgroundColor);
    if (cs.borderTop) cellProps.attr("fo:border-top", cs.borderTop);
    if (cs.borderBottom) cellProps.attr("fo:border-bottom", cs.borderBottom);
    if (cs.borderLeft) cellProps.attr("fo:border-left", cs.borderLeft);
    if (cs.borderRight) cellProps.attr("fo:border-right", cs.borderRight);
    if (cs.verticalAlign) cellProps.attr("style:vertical-align", cs.verticalAlign);
    if (cs.padding) cellProps.attr("fo:padding", cs.padding);
    if (cs.wrap) cellProps.attr("fo:wrap-option", "wrap");
    style.appendChild(cellProps);
  }

  // Text properties — tripled for Western/Asian/Complex script consistency
  const hasTextProps =
    cs.fontWeight || cs.fontStyle || cs.fontSize || cs.fontFamily || cs.color || cs.underline;

  if (hasTextProps) {
    const textProps = el("style:text-properties");
    if (cs.fontWeight) {
      textProps.attr("fo:font-weight", cs.fontWeight);
      textProps.attr("style:font-weight-asian", cs.fontWeight);
      textProps.attr("style:font-weight-complex", cs.fontWeight);
    }
    if (cs.fontStyle) {
      textProps.attr("fo:font-style", cs.fontStyle);
      textProps.attr("style:font-style-asian", cs.fontStyle);
      textProps.attr("style:font-style-complex", cs.fontStyle);
    }
    if (cs.fontSize) {
      textProps.attr("fo:font-size", cs.fontSize);
      textProps.attr("style:font-size-asian", cs.fontSize);
      textProps.attr("style:font-size-complex", cs.fontSize);
    }
    if (cs.fontFamily) {
      textProps.attr("style:font-name", cs.fontFamily);
      textProps.attr("fo:font-family", cs.fontFamily);
      textProps.attr("style:font-name-asian", cs.fontFamily);
      textProps.attr("style:font-name-complex", cs.fontFamily);
    }
    if (cs.color) textProps.attr("fo:color", cs.color);
    if (cs.underline) {
      textProps.attr("style:text-underline-style", "solid");
      textProps.attr("style:text-underline-width", "auto");
      textProps.attr("style:text-underline-color", "font-color");
    }
    style.appendChild(textProps);
  }

  // Paragraph properties for text alignment (fo:text-align lives here in ODS)
  if (cs.textAlign) {
    style.appendChild(el("style:paragraph-properties").attr("fo:text-align", cs.textAlign));
  }

  return style;
}

// ─── Column Count ─────────────────────────────────────────────────────

/**
 * Determine the number of columns in a sheet.
 * Takes the maximum of: cells in any row, and the highest explicit column index + 1.
 */
function getColumnCount(sheet: OdsSheetData): number {
  let max = 0;
  for (const row of sheet.rows) {
    max = Math.max(max, row.cells.length);
  }
  for (const colIdx of sheet.columns.keys()) {
    max = Math.max(max, colIdx + 1);
  }
  return max;
}

// ─── Cell and Sheet Building ──────────────────────────────────────────

/** Build a table:table-cell element for a single cell. */
function buildCellElement(
  cell: OdsCellData,
  row: OdsRowData,
  cellStyleMap: Map<string, [string, NormalizedCellStyle]>,
  defaultDateFormat: OdsDateFormat,
): XmlElement {
  if (cell.type === "empty") {
    return el("table:table-cell");
  }

  const cellEl = el("table:table-cell");

  // Effective options: row defaults merged with cell overrides
  const effective = mergeOptions(row.options, cell.options);
  const cellDateFmt = effectiveDateFormat(cell, row, defaultDateFormat);
  const dataStyleName = cell.type === "date" ? dateFormatToStyleName(cellDateFmt) : undefined;

  // Look up deduplicated cell style
  const normalized = normalizeOdsCellStyle(effective, dataStyleName);
  const key = cellStyleKey(normalized);
  if (key !== "") {
    const entry = cellStyleMap.get(key);
    if (entry) cellEl.attr("table:style-name", entry[0]);
  }

  // Value type, value attributes, and display paragraph
  switch (cell.type) {
    case "string":
      cellEl.attr("office:value-type", "string");
      cellEl.appendChild(el("text:p").text(String(cell.value ?? "")));
      break;

    case "float":
      cellEl.attr("office:value-type", "float");
      cellEl.attr("office:value", String(cell.value));
      cellEl.appendChild(el("text:p").text(String(cell.value)));
      break;

    case "date": {
      const date = cell.value as Date;
      cellEl.attr("office:value-type", "date");
      cellEl.attr("office:date-value", formatDateISO(date));
      cellEl.appendChild(el("text:p").text(formatDateDisplay(date, cellDateFmt)));
      break;
    }

    case "boolean":
      cellEl.attr("office:value-type", "boolean");
      cellEl.attr("office:boolean-value", cell.value ? "true" : "false");
      cellEl.appendChild(el("text:p").text(cell.value ? "TRUE" : "FALSE"));
      break;

    case "formula": {
      // Prepend OpenFormula namespace prefix; LibreOffice recalculates on open
      cellEl.attr("table:formula", `of:${String(cell.value)}`);
      cellEl.attr("office:value-type", "float");
      cellEl.attr("office:value", "0");
      cellEl.appendChild(el("text:p").text("0"));
      break;
    }
  }

  return cellEl;
}

/** Build a table:table element for one sheet. */
function buildSheetElement(
  sheet: OdsSheetData,
  tableStyleName: string,
  cellStyleMap: Map<string, [string, NormalizedCellStyle]>,
  widthMap: Map<string, string>,
  optimalColStyle: string,
  heightMap: Map<string, string>,
  optimalRowStyle: string,
  defaultDateFormat: OdsDateFormat,
): XmlElement {
  const numCols = getColumnCount(sheet);

  const tableEl = el("table:table")
    .attr("table:name", sheet.name)
    .attr("table:style-name", tableStyleName);

  // Column definitions — one per column
  for (let colIdx = 0; colIdx < numCols; colIdx++) {
    const colData = sheet.columns.get(colIdx);
    const colStyleName = colData?.width
      ? (widthMap.get(colData.width) ?? optimalColStyle)
      : optimalColStyle;

    tableEl.appendChild(
      el("table:table-column")
        .attr("table:style-name", colStyleName)
        .attr("table:default-cell-style-name", "Default"),
    );
  }

  // Row definitions
  for (const row of sheet.rows) {
    const rowStyleName = row.height
      ? (heightMap.get(row.height) ?? optimalRowStyle)
      : optimalRowStyle;

    const rowEl = el("table:table-row").attr("table:style-name", rowStyleName);

    for (const cell of row.cells) {
      rowEl.appendChild(buildCellElement(cell, row, cellStyleMap, defaultDateFormat));
    }

    tableEl.appendChild(rowEl);
  }

  return tableEl;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Generate the content.xml for an ODS document.
 *
 * @param sheets - Sheet data in tab order.
 * @param defaultDateFormat - Document-level default date display format.
 * @returns Serialized content.xml string.
 */
export function generateOdsContent(
  sheets: OdsSheetData[],
  defaultDateFormat: OdsDateFormat,
): string {
  // Collect all style information up front
  const usedDateFormats = collectUsedDateFormats(sheets, defaultDateFormat);
  const cellStyleMap = buildCellStyleMap(sheets, defaultDateFormat);
  const { widthMap, optimalStyleName: optimalColStyle } = buildColumnStyleMap(sheets);
  const { heightMap, optimalStyleName: optimalRowStyle } = buildRowStyleMap(sheets);

  // Root element — ODS uses office, style, text, table, fo, number namespaces
  const root = el("office:document-content")
    .attr("xmlns:office", ODF_NS.office)
    .attr("xmlns:style", ODF_NS.style)
    .attr("xmlns:text", ODF_NS.text)
    .attr("xmlns:table", ODF_NS.table)
    .attr("xmlns:fo", ODF_NS.fo)
    .attr("xmlns:number", ODF_NS.number)
    .attr("office:version", ODF_VERSION);

  // Automatic styles
  const autoStyles = el("office:automatic-styles");

  // Date format styles — only those actually used in this document
  for (const format of usedDateFormats) {
    autoStyles.appendChild(buildDateFormatStyle(format));
  }

  // Table styles — one per sheet
  for (let i = 0; i < sheets.length; i++) {
    autoStyles.appendChild(buildTableStyle(`ta${i + 1}`));
  }

  // Column styles: shared optimal-width style, then width-specific styles
  autoStyles.appendChild(buildOptimalColumnStyle(optimalColStyle));
  for (const [width, styleName] of widthMap) {
    autoStyles.appendChild(buildColumnStyle(styleName, width));
  }

  // Row styles: shared optimal-height style, then height-specific styles
  autoStyles.appendChild(buildOptimalRowStyle(optimalRowStyle));
  for (const [height, styleName] of heightMap) {
    autoStyles.appendChild(buildRowStyle(styleName, height));
  }

  // Cell styles (deduplicated)
  for (const [styleName, cs] of cellStyleMap.values()) {
    autoStyles.appendChild(buildCellStyle(styleName, cs));
  }

  root.appendChild(autoStyles);

  // Body → spreadsheet → sheets
  const body = el("office:body");
  const spreadsheet = el("office:spreadsheet");

  for (let i = 0; i < sheets.length; i++) {
    spreadsheet.appendChild(
      buildSheetElement(
        sheets[i],
        `ta${i + 1}`,
        cellStyleMap,
        widthMap,
        optimalColStyle,
        heightMap,
        optimalRowStyle,
        defaultDateFormat,
      ),
    );
  }

  body.appendChild(spreadsheet);
  root.appendChild(body);

  return xmlDocument(root);
}

/**
 * Generate the styles.xml for an ODS document.
 *
 * ODS requires styles.xml for:
 * - The `Default` table-cell style (referenced via `style:parent-style-name` on
 *   all automatic cell styles, and via `table:default-cell-style-name` on columns)
 * - The master page definition (referenced via `style:master-page-name` on table styles)
 */
export function generateOdsStyles(): string {
  const root = el("office:document-styles")
    .attr("xmlns:office", ODF_NS.office)
    .attr("xmlns:style", ODF_NS.style)
    .attr("xmlns:fo", ODF_NS.fo)
    .attr("office:version", ODF_VERSION);

  // Named styles — Default table-cell style
  const styles = el("office:styles");
  styles.appendChild(
    el("style:style").attr("style:name", "Default").attr("style:family", "table-cell"),
  );
  root.appendChild(styles);

  // Automatic styles — page layout required for master page reference
  const autoStyles = el("office:automatic-styles");
  const pageLayout = el("style:page-layout").attr("style:name", "Mlayout");
  pageLayout.appendChild(el("style:page-layout-properties"));
  autoStyles.appendChild(pageLayout);
  root.appendChild(autoStyles);

  // Master styles — Default master page referenced by table styles
  const masterStyles = el("office:master-styles");
  masterStyles.appendChild(
    el("style:master-page").attr("style:name", "Default").attr("style:page-layout-name", "Mlayout"),
  );
  root.appendChild(masterStyles);

  return xmlDocument(root);
}
