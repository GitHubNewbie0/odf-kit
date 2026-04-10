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
  // Data style reference (links cell style to number:date-style or number:number-style)
  dataStyleName?: string;
}

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

function normalizeFontSize(fontSize: number | string): string {
  return typeof fontSize === "number" ? `${fontSize}pt` : fontSize;
}

// ─── Option Merging ───────────────────────────────────────────────────

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

const DATETIME_STYLE_NAME = "Ndate-dt";

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

function formatDateISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isDatetime(date: Date): boolean {
  return (
    date.getUTCHours() !== 0 ||
    date.getUTCMinutes() !== 0 ||
    date.getUTCSeconds() !== 0 ||
    date.getUTCMilliseconds() !== 0
  );
}

function formatDatetimeISO(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function formatDatetimeDisplay(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${formatDateISO(date)} ${h}:${mi}:${s}`;
}

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

function buildDatetimeFormatStyle(): XmlElement {
  const dtStyle = el("number:date-style").attr("style:name", DATETIME_STYLE_NAME);
  dtStyle.appendChild(el("number:year").attr("number:style", "long"));
  dtStyle.appendChild(el("number:text").text("-"));
  dtStyle.appendChild(el("number:month").attr("number:style", "long"));
  dtStyle.appendChild(el("number:text").text("-"));
  dtStyle.appendChild(el("number:day").attr("number:style", "long"));
  dtStyle.appendChild(el("number:text").text(" "));
  dtStyle.appendChild(el("number:hours").attr("number:style", "long"));
  dtStyle.appendChild(el("number:text").text(":"));
  dtStyle.appendChild(el("number:minutes").attr("number:style", "long"));
  dtStyle.appendChild(el("number:text").text(":"));
  dtStyle.appendChild(el("number:seconds").attr("number:style", "long"));
  return dtStyle;
}

function hasDatetimeCells(sheets: OdsSheetData[]): boolean {
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        if (cell.type === "date" && cell.value instanceof Date && isDatetime(cell.value)) {
          return true;
        }
      }
    }
  }
  return false;
}

function effectiveDateFormat(
  cell: OdsCellData,
  row: OdsRowData,
  defaultFormat: OdsDateFormat,
): OdsDateFormat {
  return cell.options?.dateFormat ?? row.options?.dateFormat ?? defaultFormat;
}

// ─── Number Format Helpers ────────────────────────────────────────────

/**
 * Parse a numberFormat string and return a stable style name.
 * Returns undefined if the format string is not recognized.
 *
 * Format strings:
 *   "integer"          → "Nnum-int"
 *   "decimal:N"        → "Nnum-decN"
 *   "percentage"       → "Nnum-pct2"
 *   "percentage:N"     → "Nnum-pctN"
 *   "currency:CODE"    → "Nnum-CODE2"   (lowercase code)
 *   "currency:CODE:N"  → "Nnum-CODEN"
 */
function numberFormatToStyleName(format: string): string | undefined {
  if (format === "integer") return "Nnum-int";

  const decMatch = format.match(/^decimal:(\d+)$/);
  if (decMatch) return `Nnum-dec${decMatch[1]}`;

  if (format === "percentage") return "Nnum-pct2";
  const pctMatch = format.match(/^percentage:(\d+)$/);
  if (pctMatch) return `Nnum-pct${pctMatch[1]}`;

  const curMatch = format.match(/^currency:([A-Z]{3})(?::(\d+))?$/);
  if (curMatch) {
    const code = curMatch[1].toLowerCase();
    const decimals = curMatch[2] ?? "2";
    return `Nnum-${code}${decimals}`;
  }

  return undefined;
}

/** Currency code → symbol mapping for common currencies. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  CHF: "Fr",
  CAD: "CA$",
  AUD: "A$",
  INR: "₹",
  KRW: "₩",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  PLN: "zł",
  CZK: "Kč",
  HUF: "Ft",
  RON: "lei",
  BGN: "лв",
  HRK: "kn",
  RUB: "₽",
  TRY: "₺",
  BRL: "R$",
  MXN: "MX$",
  ZAR: "R",
  SGD: "S$",
  HKD: "HK$",
  NZD: "NZ$",
  ILS: "₪",
  AED: "د.إ",
  SAR: "﷼",
};

/** Build a number:number-style or number:currency-style element. */
function buildNumberFormatStyle(format: string): XmlElement | undefined {
  const styleName = numberFormatToStyleName(format);
  if (!styleName) return undefined;

  if (format === "integer") {
    const s = el("number:number-style").attr("style:name", styleName);
    s.appendChild(
      el("number:number")
        .attr("number:decimal-places", "0")
        .attr("number:grouping", "true")
        .attr("number:min-integer-digits", "1"),
    );
    return s;
  }

  const decMatch = format.match(/^decimal:(\d+)$/);
  if (decMatch) {
    const s = el("number:number-style").attr("style:name", styleName);
    s.appendChild(
      el("number:number")
        .attr("number:decimal-places", decMatch[1])
        .attr("number:grouping", "true")
        .attr("number:min-integer-digits", "1"),
    );
    return s;
  }

  if (format === "percentage") {
    const s = el("number:number-style").attr("style:name", styleName);
    s.appendChild(
      el("number:number").attr("number:decimal-places", "2").attr("number:min-integer-digits", "1"),
    );
    s.appendChild(el("number:text").text("%"));
    return s;
  }

  const pctMatch = format.match(/^percentage:(\d+)$/);
  if (pctMatch) {
    const s = el("number:number-style").attr("style:name", styleName);
    s.appendChild(
      el("number:number")
        .attr("number:decimal-places", pctMatch[1])
        .attr("number:min-integer-digits", "1"),
    );
    s.appendChild(el("number:text").text("%"));
    return s;
  }

  const curMatch = format.match(/^currency:([A-Z]{3})(?::(\d+))?$/);
  if (curMatch) {
    const code = curMatch[1];
    const decimals = curMatch[2] ?? "2";
    const symbol = CURRENCY_SYMBOLS[code] ?? code;
    const s = el("number:currency-style").attr("style:name", styleName);
    s.appendChild(
      el("number:currency-symbol")
        .attr("number:language", "en")
        .attr("number:country", "US")
        .text(symbol),
    );
    s.appendChild(
      el("number:number")
        .attr("number:decimal-places", decimals)
        .attr("number:grouping", "true")
        .attr("number:min-integer-digits", "1"),
    );
    return s;
  }

  return undefined;
}

/** Collect all unique numberFormat values used across all sheets. */
function collectUsedNumberFormats(sheets: OdsSheetData[]): Set<string> {
  const used = new Set<string>();
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        const fmt = cell.options?.numberFormat ?? row.options?.numberFormat;
        if (fmt) used.add(fmt);
      }
    }
  }
  return used;
}

// ─── Style Collection ─────────────────────────────────────────────────

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
 * Resolve the data style name for a cell — covers both date and number formats.
 */
function resolveDataStyleName(
  cell: OdsCellData,
  row: OdsRowData,
  defaultDateFormat: OdsDateFormat,
): string | undefined {
  if (cell.type === "date") {
    return cell.value instanceof Date && isDatetime(cell.value)
      ? DATETIME_STYLE_NAME
      : dateFormatToStyleName(effectiveDateFormat(cell, row, defaultDateFormat));
  }
  const fmt = cell.options?.numberFormat ?? row.options?.numberFormat;
  if (fmt) return numberFormatToStyleName(fmt);
  return undefined;
}

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
        const dataStyleName = resolveDataStyleName(cell, row, defaultDateFormat);
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

function buildTableStyle(styleName: string, tabColor?: string): XmlElement {
  const style = el("style:style")
    .attr("style:name", styleName)
    .attr("style:family", "table")
    .attr("style:master-page-name", "Default");
  const tableProps = el("style:table-properties")
    .attr("table:display", "true")
    .attr("style:writing-mode", "lr-tb");
  if (tabColor) tableProps.attr("table:tab-color", tabColor);
  style.appendChild(tableProps);
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

  if (cs.textAlign) {
    style.appendChild(el("style:paragraph-properties").attr("fo:text-align", cs.textAlign));
  }

  return style;
}

// ─── Column Count ─────────────────────────────────────────────────────

function getColumnCount(sheet: OdsSheetData): number {
  let max = 0;
  for (const row of sheet.rows) {
    // Account for colSpan when computing column count
    let colCount = 0;
    for (const cell of row.cells) {
      colCount += cell.colSpan ?? 1;
    }
    max = Math.max(max, colCount);
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

  // Column and row span
  const colSpan = cell.colSpan ?? 1;
  const rowSpan = cell.rowSpan ?? 1;
  if (colSpan > 1) cellEl.attr("table:number-columns-spanned", String(colSpan));
  if (rowSpan > 1) cellEl.attr("table:number-rows-spanned", String(rowSpan));

  // Effective options and style lookup
  const effective = mergeOptions(row.options, cell.options);
  const dataStyleName = resolveDataStyleName(cell, row, defaultDateFormat);
  const normalized = normalizeOdsCellStyle(effective, dataStyleName);
  const key = cellStyleKey(normalized);
  if (key !== "") {
    const entry = cellStyleMap.get(key);
    if (entry) cellEl.attr("table:style-name", entry[0]);
  }

  // Cell content — build the text:p content, wrapping in text:a for hyperlinks
  const buildTextP = (content: string): XmlElement => {
    const p = el("text:p");
    if (cell.href) {
      const a = el("text:a")
        .attr("xlink:type", "simple")
        .attr("xlink:href", cell.href)
        .text(content);
      p.appendChild(a);
    } else {
      p.text(content);
    }
    return p;
  };

  // Value type, value attributes, and display paragraph
  switch (cell.type) {
    case "string":
      cellEl.attr("office:value-type", "string");
      cellEl.appendChild(buildTextP(String(cell.value ?? "")));
      break;

    case "float":
      cellEl.attr("office:value-type", "float");
      cellEl.attr("office:value", String(cell.value));
      cellEl.appendChild(buildTextP(String(cell.value)));
      break;

    case "percentage": {
      // ODS stores raw decimal, displays as percentage
      const rawVal = Number(cell.value ?? 0);
      cellEl.attr("office:value-type", "percentage");
      cellEl.attr("office:value", String(rawVal));
      // Display value: multiply by 100 for display (LibreOffice recalculates)
      cellEl.appendChild(buildTextP(String(rawVal)));
      break;
    }

    case "currency": {
      const fmt = cell.options?.numberFormat ?? row.options?.numberFormat ?? "";
      const curMatch = fmt.match(/^currency:([A-Z]{3})/);
      const currencyCode = curMatch ? curMatch[1] : "USD";
      cellEl.attr("office:value-type", "currency");
      cellEl.attr("office:currency", currencyCode);
      cellEl.attr("office:value", String(cell.value));
      cellEl.appendChild(buildTextP(String(cell.value)));
      break;
    }

    case "date": {
      const date = cell.value as Date;
      const cellDateFmt = effectiveDateFormat(cell, row, defaultDateFormat);
      cellEl.attr("office:value-type", "date");
      if (isDatetime(date)) {
        cellEl.attr("office:date-value", formatDatetimeISO(date));
        cellEl.appendChild(buildTextP(formatDatetimeDisplay(date)));
      } else {
        cellEl.attr("office:date-value", formatDateISO(date));
        cellEl.appendChild(buildTextP(formatDateDisplay(date, cellDateFmt)));
      }
      break;
    }

    case "boolean":
      cellEl.attr("office:value-type", "boolean");
      cellEl.attr("office:boolean-value", cell.value ? "true" : "false");
      cellEl.appendChild(buildTextP(cell.value ? "TRUE" : "FALSE"));
      break;

    case "formula": {
      cellEl.attr("table:formula", `of:${String(cell.value)}`);
      cellEl.attr("office:value-type", "float");
      cellEl.attr("office:value", "0");
      cellEl.appendChild(buildTextP("0"));
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

  // Column definitions
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

  // Two-pass approach for rowSpan:
  // Pass 1: build a set of (rowIndex, colIndex) positions covered by rowSpan cells
  const coveredCells = new Set<string>();

  // Track physical column positions accounting for colSpan
  for (let rowIdx = 0; rowIdx < sheet.rows.length; rowIdx++) {
    const row = sheet.rows[rowIdx];
    let physicalCol = 0;

    for (const cell of row.cells) {
      // Skip positions already covered
      while (coveredCells.has(`${rowIdx}:${physicalCol}`)) {
        physicalCol++;
      }

      const colSpan = cell.colSpan ?? 1;
      const rowSpan = cell.rowSpan ?? 1;

      // Mark all covered cells for rowSpan
      if (rowSpan > 1) {
        for (let rs = 1; rs < rowSpan; rs++) {
          for (let cs = 0; cs < colSpan; cs++) {
            coveredCells.add(`${rowIdx + rs}:${physicalCol + cs}`);
          }
        }
      }
      // Mark covered cells for colSpan within the same row
      // (these are emitted as covered cells inline — no need to track separately)

      physicalCol += colSpan;
    }
  }

  // Pass 2: build row elements
  for (let rowIdx = 0; rowIdx < sheet.rows.length; rowIdx++) {
    const row = sheet.rows[rowIdx];
    const rowStyleName = row.height
      ? (heightMap.get(row.height) ?? optimalRowStyle)
      : optimalRowStyle;

    const rowEl = el("table:table-row").attr("table:style-name", rowStyleName);

    let physicalCol = 0;

    for (const cell of row.cells) {
      // Emit covered cells for any rowSpan from previous rows
      while (coveredCells.has(`${rowIdx}:${physicalCol}`)) {
        rowEl.appendChild(el("table:covered-table-cell"));
        physicalCol++;
      }

      // Emit the actual cell
      rowEl.appendChild(buildCellElement(cell, row, cellStyleMap, defaultDateFormat));

      const colSpan = cell.colSpan ?? 1;

      // Emit inline covered cells for colSpan
      for (let cs = 1; cs < colSpan; cs++) {
        rowEl.appendChild(el("table:covered-table-cell"));
      }

      physicalCol += colSpan;
    }

    // Fill any remaining covered cells at end of row
    while (coveredCells.has(`${rowIdx}:${physicalCol}`)) {
      rowEl.appendChild(el("table:covered-table-cell"));
      physicalCol++;
    }

    tableEl.appendChild(rowEl);
  }

  return tableEl;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Generate the content.xml for an ODS document.
 */
export function generateOdsContent(
  sheets: OdsSheetData[],
  defaultDateFormat: OdsDateFormat,
): string {
  const usedDateFormats = collectUsedDateFormats(sheets, defaultDateFormat);
  const needsDatetime = hasDatetimeCells(sheets);
  const usedNumberFormats = collectUsedNumberFormats(sheets);
  const cellStyleMap = buildCellStyleMap(sheets, defaultDateFormat);
  const { widthMap, optimalStyleName: optimalColStyle } = buildColumnStyleMap(sheets);
  const { heightMap, optimalStyleName: optimalRowStyle } = buildRowStyleMap(sheets);

  // Root element — add xlink namespace for hyperlinks
  const root = el("office:document-content")
    .attr("xmlns:office", ODF_NS.office)
    .attr("xmlns:style", ODF_NS.style)
    .attr("xmlns:text", ODF_NS.text)
    .attr("xmlns:table", ODF_NS.table)
    .attr("xmlns:fo", ODF_NS.fo)
    .attr("xmlns:number", ODF_NS.number)
    .attr("xmlns:of", "urn:oasis:names:tc:opendocument:xmlns:of:1.2")
    .attr("xmlns:xlink", "http://www.w3.org/1999/xlink")
    .attr("office:version", ODF_VERSION);

  const autoStyles = el("office:automatic-styles");

  // Date format styles
  for (const format of usedDateFormats) {
    autoStyles.appendChild(buildDateFormatStyle(format));
  }
  if (needsDatetime) {
    autoStyles.appendChild(buildDatetimeFormatStyle());
  }

  // Number format styles
  for (const format of usedNumberFormats) {
    const styleEl = buildNumberFormatStyle(format);
    if (styleEl) autoStyles.appendChild(styleEl);
  }

  // Table styles — pass tab color
  for (let i = 0; i < sheets.length; i++) {
    autoStyles.appendChild(buildTableStyle(`ta${i + 1}`, sheets[i].tabColor));
  }

  // Column styles
  autoStyles.appendChild(buildOptimalColumnStyle(optimalColStyle));
  for (const [width, styleName] of widthMap) {
    autoStyles.appendChild(buildColumnStyle(styleName, width));
  }

  // Row styles
  autoStyles.appendChild(buildOptimalRowStyle(optimalRowStyle));
  for (const [height, styleName] of heightMap) {
    autoStyles.appendChild(buildRowStyle(styleName, height));
  }

  // Cell styles
  for (const [styleName, cs] of cellStyleMap.values()) {
    autoStyles.appendChild(buildCellStyle(styleName, cs));
  }

  root.appendChild(autoStyles);

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
 */
export function generateOdsStyles(): string {
  const root = el("office:document-styles")
    .attr("xmlns:office", ODF_NS.office)
    .attr("xmlns:style", ODF_NS.style)
    .attr("xmlns:fo", ODF_NS.fo)
    .attr("office:version", ODF_VERSION);

  const styles = el("office:styles");
  styles.appendChild(
    el("style:style").attr("style:name", "Default").attr("style:family", "table-cell"),
  );
  root.appendChild(styles);

  const autoStyles = el("office:automatic-styles");
  const pageLayout = el("style:page-layout").attr("style:name", "Mlayout");
  pageLayout.appendChild(el("style:page-layout-properties"));
  autoStyles.appendChild(pageLayout);
  root.appendChild(autoStyles);

  const masterStyles = el("office:master-styles");
  masterStyles.appendChild(
    el("style:master-page").attr("style:name", "Default").attr("style:page-layout-name", "Mlayout"),
  );
  root.appendChild(masterStyles);

  return xmlDocument(root);
}
