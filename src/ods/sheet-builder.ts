import type {
  OdsCellData,
  OdsCellObject,
  OdsCellOptions,
  OdsCellValue,
  OdsRowOptions,
  OdsSheetData,
} from "./types.js";

/**
 * Builder for an ODS sheet (tab).
 *
 * Returned by {@link OdsDocument.addSheet}. Not constructed directly.
 * All methods return `this` for chaining.
 *
 * @example
 * const sheet = doc.addSheet("Sales");
 * sheet
 *   .addRow(["Month", "Revenue"], { bold: true, backgroundColor: "#DDDDDD" })
 *   .addRow(["January", 12500.00])
 *   .addRow(["February", 14200.00])
 *   .addRow(["Total", { value: "=SUM(B2:B3)", type: "formula" }])
 *   .setColumnWidth(0, "4cm")
 *   .setColumnWidth(1, "5cm")
 *   .freezeRows(1);
 */
export class OdsSheet {
  /** Internal sheet data — used by OdsDocument.save(). */
  readonly data: OdsSheetData;

  constructor(name: string) {
    this.data = {
      name,
      rows: [],
      columns: new Map(),
    };
  }

  /**
   * Add a row of values to the sheet.
   *
   * Values are auto-typed:
   * - `number` → float
   * - `Date` → date
   * - `boolean` → boolean
   * - `string` → string (never auto-detected as formula)
   * - `null` / `undefined` → empty cell
   * - {@link OdsCellObject} → explicit type (required for formulas, percentages, currencies)
   *
   * @param values - Array of cell values in column order.
   * @param options - Optional formatting defaults for all cells in this row.
   * @returns This sheet, for chaining.
   *
   * @example
   * sheet.addRow(["Month", "Revenue"], { bold: true, backgroundColor: "#DDDDDD" });
   * sheet.addRow(["January", 12500.00]);
   * sheet.addRow(["Total", { value: "=SUM(B2:B3)", type: "formula" }]);
   * sheet.addRow([{ value: 0.1234, type: "percentage", numberFormat: "percentage:1" }]);
   * sheet.addRow([{ value: 1234.56, type: "currency", numberFormat: "currency:EUR" }]);
   * sheet.addRow([{ value: "Report", type: "string", colSpan: 3, bold: true }]);
   * sheet.addRow([{ value: "odf-kit", type: "string", href: "https://github.com/GitHubNewbie0/odf-kit" }]);
   */
  addRow(values: OdsCellValue[], options?: OdsRowOptions): this {
    const cells: OdsCellData[] = values.map((v) => toCellData(v));
    this.data.rows.push({ cells, options });
    return this;
  }

  /**
   * Set the width of a column.
   *
   * @param colIndex - Zero-based column index.
   * @param width - Width with units (e.g. `"3cm"`, `"1.5in"`).
   * @returns This sheet, for chaining.
   */
  setColumnWidth(colIndex: number, width: string): this {
    this.data.columns.set(colIndex, { width });
    return this;
  }

  /**
   * Set the height of a row.
   *
   * @param rowIndex - Zero-based row index.
   * @param height - Height with units (e.g. `"1cm"`, `"18pt"`).
   * @returns This sheet, for chaining.
   */
  setRowHeight(rowIndex: number, height: string): this {
    const row = this.data.rows[rowIndex];
    if (row) {
      row.height = height;
    }
    return this;
  }

  /**
   * Freeze the top N rows so they remain visible when scrolling down.
   *
   * Typically used to keep a header row visible. Call after adding rows.
   *
   * @param rows - Number of rows to freeze (default 1).
   * @returns This sheet, for chaining.
   *
   * @example
   * sheet.addRow(["Name", "Amount", "Date"], { bold: true });
   * sheet.freezeRows(1);
   */
  freezeRows(rows: number = 1): this {
    this.data.freezeRows = rows;
    return this;
  }

  /**
   * Freeze the left N columns so they remain visible when scrolling right.
   *
   * @param cols - Number of columns to freeze (default 1).
   * @returns This sheet, for chaining.
   *
   * @example
   * sheet.freezeColumns(1); // freeze the first column
   */
  freezeColumns(cols: number = 1): this {
    this.data.freezeColumns = cols;
    return this;
  }

  /**
   * Set the sheet tab color.
   *
   * @param color - Hex color (`"#FF0000"`) or CSS named color (`"red"`).
   * @returns This sheet, for chaining.
   *
   * @example
   * doc.addSheet("Q1").setTabColor("#4CAF50");
   * doc.addSheet("Q2").setTabColor("#2196F3");
   */
  setTabColor(color: string): this {
    this.data.tabColor = color;
    return this;
  }
}

// ─── Internal Helpers ─────────────────────────────────────────────────

function toCellData(value: OdsCellValue): OdsCellData {
  if (value === null || value === undefined) {
    return { value: null, type: "empty" };
  }

  if (isOdsCellObject(value)) {
    return {
      value: value.value,
      type: value.type,
      options: extractCellOptions(value),
      colSpan: value.colSpan,
      rowSpan: value.rowSpan,
      href: value.href,
    };
  }

  if (value instanceof Date) {
    return { value, type: "date" };
  }
  if (typeof value === "boolean") {
    return { value, type: "boolean" };
  }
  if (typeof value === "number") {
    return { value, type: "float" };
  }
  return { value: value as string, type: "string" };
}

function isOdsCellObject(value: OdsCellValue): value is OdsCellObject {
  return typeof value === "object" && value !== null && !(value instanceof Date) && "type" in value;
}

function extractCellOptions(obj: OdsCellObject): OdsCellOptions | undefined {
  const opts: OdsCellOptions = {};
  if (obj.bold !== undefined) opts.bold = obj.bold;
  if (obj.italic !== undefined) opts.italic = obj.italic;
  if (obj.fontSize !== undefined) opts.fontSize = obj.fontSize;
  if (obj.fontFamily !== undefined) opts.fontFamily = obj.fontFamily;
  if (obj.color !== undefined) opts.color = obj.color;
  if (obj.underline !== undefined) opts.underline = obj.underline;
  if (obj.backgroundColor !== undefined) opts.backgroundColor = obj.backgroundColor;
  if (obj.border !== undefined) opts.border = obj.border;
  if (obj.borderTop !== undefined) opts.borderTop = obj.borderTop;
  if (obj.borderBottom !== undefined) opts.borderBottom = obj.borderBottom;
  if (obj.borderLeft !== undefined) opts.borderLeft = obj.borderLeft;
  if (obj.borderRight !== undefined) opts.borderRight = obj.borderRight;
  if (obj.align !== undefined) opts.align = obj.align;
  if (obj.verticalAlign !== undefined) opts.verticalAlign = obj.verticalAlign;
  if (obj.padding !== undefined) opts.padding = obj.padding;
  if (obj.wrap !== undefined) opts.wrap = obj.wrap;
  if (obj.dateFormat !== undefined) opts.dateFormat = obj.dateFormat;
  if (obj.numberFormat !== undefined) opts.numberFormat = obj.numberFormat;
  return Object.keys(opts).length > 0 ? opts : undefined;
}
