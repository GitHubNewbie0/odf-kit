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
 *   .setColumnWidth(1, "5cm");
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
   * - {@link OdsCellObject} → explicit type (required for formulas)
   *
   * Row options apply formatting defaults to every cell in the row.
   * Per-cell {@link OdsCellObject} options override row-level defaults.
   *
   * @param values - Array of cell values in column order.
   * @param options - Optional formatting defaults for all cells in this row.
   * @returns This sheet, for chaining.
   *
   * @example
   * // Simple auto-typed row
   * sheet.addRow([1.23, "Text", new Date("2026-01-15"), true]);
   *
   * @example
   * // Header row with formatting
   * sheet.addRow(["Month", "Revenue"], { bold: true, backgroundColor: "#DDDDDD" });
   *
   * @example
   * // Row with a formula cell
   * sheet.addRow(["Total", { value: "=SUM(B1:B10)", type: "formula" }]);
   */
  addRow(values: OdsCellValue[], options?: OdsRowOptions): this {
    const cells: OdsCellData[] = values.map((v) => toCellData(v));
    this.data.rows.push({ cells, options });
    return this;
  }

  /**
   * Set the width of a column.
   *
   * May be called before or after adding rows. Uses zero-based column index.
   * Columns without an explicit width use the application's optimal width.
   *
   * @param colIndex - Zero-based column index.
   * @param width - Width with units (e.g. `"3cm"`, `"1.5in"`).
   * @returns This sheet, for chaining.
   *
   * @example
   * sheet.setColumnWidth(0, "4cm");
   * sheet.setColumnWidth(1, "8cm");
   */
  setColumnWidth(colIndex: number, width: string): this {
    this.data.columns.set(colIndex, { width });
    return this;
  }

  /**
   * Set the height of a row.
   *
   * The row must already exist (added via {@link addRow}). Uses zero-based
   * row index. Silently ignored for out-of-range indices.
   * Rows without an explicit height use the application's optimal height.
   *
   * @param rowIndex - Zero-based row index.
   * @param height - Height with units (e.g. `"1cm"`, `"18pt"`).
   * @returns This sheet, for chaining.
   *
   * @example
   * sheet.addRow(["Header"]);
   * sheet.setRowHeight(0, "1cm");
   */
  setRowHeight(rowIndex: number, height: string): this {
    const row = this.data.rows[rowIndex];
    if (row) {
      row.height = height;
    }
    return this;
  }
}

// ─── Internal Helpers ─────────────────────────────────────────────────

/**
 * Convert an OdsCellValue to internal OdsCellData with resolved type.
 */
function toCellData(value: OdsCellValue): OdsCellData {
  if (value === null || value === undefined) {
    return { value: null, type: "empty" };
  }

  // OdsCellObject — has an explicit 'type' field alongside 'value'
  if (isOdsCellObject(value)) {
    return {
      value: value.value,
      type: value.type,
      options: extractCellOptions(value),
    };
  }

  // Auto-typed primitives
  if (value instanceof Date) {
    return { value, type: "date" };
  }
  if (typeof value === "boolean") {
    return { value, type: "boolean" };
  }
  if (typeof value === "number") {
    return { value, type: "float" };
  }
  // string — never auto-detected as formula
  return { value: value as string, type: "string" };
}

/**
 * Type guard: returns true when value is an OdsCellObject.
 */
function isOdsCellObject(value: OdsCellValue): value is OdsCellObject {
  return typeof value === "object" && value !== null && !(value instanceof Date) && "type" in value;
}

/**
 * Extract OdsCellOptions fields from an OdsCellObject, excluding 'value' and 'type'.
 * Returns undefined when no formatting options are present.
 */
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
  return Object.keys(opts).length > 0 ? opts : undefined;
}
