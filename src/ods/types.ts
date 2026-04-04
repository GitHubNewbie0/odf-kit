// ─── Cell Value Types ─────────────────────────────────────────────────

/** Recognized cell types in ODS. */
export type OdsCellType = "string" | "float" | "date" | "boolean" | "formula";

/** Built-in date display formats. */
export type OdsDateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";

/**
 * Cell and text formatting options.
 *
 * Applied at the row level (as defaults for all cells) or at the cell level
 * (as overrides for a single cell via {@link OdsCellObject}).
 *
 * @example
 * // Row-level defaults
 * sheet.addRow(["Header", "Value"], { bold: true, backgroundColor: "#DDDDDD" });
 *
 * @example
 * // Cell-level overrides inside OdsCellObject
 * sheet.addRow([{ value: "Special", type: "string", color: "#FF0000" }]);
 */
export interface OdsCellOptions {
  /** Bold text. */
  bold?: boolean;

  /** Italic text. */
  italic?: boolean;

  /**
   * Font size. A number is interpreted as points (e.g. `12` → `"12pt"`).
   * A string must include units (e.g. `"14pt"`, `"0.5cm"`).
   */
  fontSize?: number | string;

  /** Font family (e.g. `"Arial"`, `"Liberation Sans"`). */
  fontFamily?: string;

  /**
   * Text color. Accepts hex (`"#FF0000"`) or CSS named colors (`"red"`).
   */
  color?: string;

  /** Underline the text. */
  underline?: boolean;

  /**
   * Cell background color. Accepts hex (`"#DDDDDD"`) or CSS named colors.
   */
  backgroundColor?: string;

  /**
   * Border on all four sides. Uses CSS border shorthand:
   * `"<width> <style> <color>"` (e.g. `"0.5pt solid #000000"`).
   */
  border?: string;

  /** Top border. Overrides `border` for the top side. */
  borderTop?: string;

  /** Bottom border. Overrides `border` for the bottom side. */
  borderBottom?: string;

  /** Left border. Overrides `border` for the left side. */
  borderLeft?: string;

  /** Right border. Overrides `border` for the right side. */
  borderRight?: string;

  /** Horizontal text alignment within the cell. */
  align?: "left" | "center" | "right";

  /** Vertical alignment of content within the cell. */
  verticalAlign?: "top" | "middle" | "bottom";

  /** Padding between cell border and content (e.g. `"0.1cm"`). */
  padding?: string;

  /** Enable text wrapping within the cell. */
  wrap?: boolean;

  /**
   * Date display format — applies when the cell contains a Date value.
   * Overrides the document-level default set via `OdsDocument.setDateFormat()`.
   */
  dateFormat?: OdsDateFormat;
}

/**
 * Row-level formatting options. Applied to all cells in the row as defaults.
 * Individual cell options (via {@link OdsCellObject}) override these per cell.
 */
export type OdsRowOptions = OdsCellOptions;

/**
 * Explicit typed cell — use when automatic type detection is insufficient.
 *
 * Required for formula cells. Also allows per-cell formatting that overrides
 * the row-level defaults set in `addRow()`.
 *
 * Extends {@link OdsCellOptions} so individual cell formatting can override
 * row-level defaults.
 *
 * @example
 * // Formula — explicit type required
 * { value: "=SUM(B1:B10)", type: "formula" }
 *
 * @example
 * // Date with per-cell format override
 * { value: new Date("2026-01-15"), type: "date", dateFormat: "DD/MM/YYYY" }
 *
 * @example
 * // String with bold override inside a non-bold row
 * { value: "Total", type: "string", bold: true }
 */
export interface OdsCellObject extends OdsCellOptions {
  /** The cell value. */
  value: string | number | boolean | Date | null;

  /** The explicit cell type. */
  type: OdsCellType;
}

/**
 * A cell value — either a primitive (auto-typed) or an explicit {@link OdsCellObject}.
 *
 * **Auto-type rules:**
 * - `number` → float
 * - `Date` → date
 * - `boolean` → boolean
 * - `string` → string (never auto-detected as formula)
 * - `null` / `undefined` → empty cell
 *
 * @example
 * // Primitives — auto-typed
 * sheet.addRow(["Hello", 42, new Date("2026-01-15"), true]);
 *
 * @example
 * // Mix of primitives and explicit objects
 * sheet.addRow(["Total", { value: "=SUM(B1:B10)", type: "formula" }]);
 */
export type OdsCellValue = string | number | boolean | Date | null | undefined | OdsCellObject;

// ─── Internal Data Structures ─────────────────────────────────────────

/** Internal representation of a cell after type resolution. */
export interface OdsCellData {
  /** The raw value (always a primitive or null for empty cells). */
  value: string | number | boolean | Date | null;

  /** The resolved cell type. */
  type: OdsCellType | "empty";

  /** Cell-level formatting options — merged with row options at render time. */
  options?: OdsCellOptions;
}

/** Internal representation of a row. */
export interface OdsRowData {
  /** Cells in this row in column order. */
  cells: OdsCellData[];

  /** Row-level formatting options — applied as defaults to all cells. */
  options?: OdsRowOptions;

  /** Explicit row height with units (e.g. `"1cm"`). */
  height?: string;
}

/** Internal representation of a column definition. */
export interface OdsColumnData {
  /** Explicit column width with units (e.g. `"3cm"`). */
  width?: string;
}

/** Internal representation of a complete sheet. */
export interface OdsSheetData {
  /** Sheet tab name. */
  name: string;

  /** Rows in insertion order. */
  rows: OdsRowData[];

  /** Sparse column definitions keyed by zero-based column index. */
  columns: Map<number, OdsColumnData>;
}
