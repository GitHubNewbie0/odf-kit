// ─── Cell Value Types ─────────────────────────────────────────────────

/** Recognized cell types in ODS. */
export type OdsCellType =
  | "string"
  | "float"
  | "date"
  | "boolean"
  | "formula"
  | "percentage"
  | "currency";

/** Built-in date display formats. */
export type OdsDateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";

/**
 * Cell and text formatting options.
 *
 * Applied at the row level (as defaults for all cells) or at the cell level
 * (as overrides for a single cell via {@link OdsCellObject}).
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

  /** Text color. Accepts hex (`"#FF0000"`) or CSS named colors (`"red"`). */
  color?: string;

  /** Underline the text. */
  underline?: boolean;

  /** Cell background color. Accepts hex (`"#DDDDDD"`) or CSS named colors. */
  backgroundColor?: string;

  /**
   * Border on all four sides. CSS shorthand: `"<width> <style> <color>"`
   * (e.g. `"0.5pt solid #000000"`).
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

  /**
   * Number display format. Applies when the cell contains a numeric value.
   *
   * Predefined formats:
   * - `"integer"`          — 1,234 (no decimal places, thousands separator)
   * - `"decimal:N"`        — 1,234.56 (N decimal places, thousands separator)
   * - `"percentage"`       — 12.34% (raw value × 100, 2 decimal places)
   * - `"percentage:N"`     — 12.3% (N decimal places)
   * - `"currency:CODE"`    — €1,234.56 (ISO 4217 code, 2 decimal places)
   * - `"currency:CODE:N"`  — €1,234.6 (currency with N decimal places)
   *
   * @example
   * { value: 1234567.89, type: "float", numberFormat: "decimal:2" }
   * { value: 0.1234, type: "percentage", numberFormat: "percentage:1" }
   * { value: 1234.56, type: "currency", numberFormat: "currency:EUR" }
   * { value: 9999, type: "float", numberFormat: "integer" }
   */
  numberFormat?: string;
}

/**
 * Row-level formatting options. Applied to all cells in the row as defaults.
 * Individual cell options (via {@link OdsCellObject}) override these per cell.
 */
export type OdsRowOptions = OdsCellOptions;

/**
 * Explicit typed cell — use when automatic type detection is insufficient.
 *
 * Required for formula, percentage, and currency cells. Also allows per-cell
 * formatting that overrides row-level defaults.
 *
 * @example
 * // Formula — explicit type required
 * { value: "=SUM(B1:B10)", type: "formula" }
 *
 * @example
 * // Percentage
 * { value: 0.1234, type: "percentage", numberFormat: "percentage:1" }
 *
 * @example
 * // Currency
 * { value: 1234.56, type: "currency", numberFormat: "currency:EUR" }
 *
 * @example
 * // Merged cell spanning 3 columns
 * { value: "Q1 Report", type: "string", colSpan: 3, bold: true }
 *
 * @example
 * // Hyperlink
 * { value: "odf-kit", type: "string", href: "https://github.com/GitHubNewbie0/odf-kit" }
 */
export interface OdsCellObject extends OdsCellOptions {
  /** The cell value. */
  value: string | number | boolean | Date | null;

  /** The explicit cell type. */
  type: OdsCellType;

  /**
   * Span this cell across N columns (default 1).
   * The spanned columns in the same row are automatically filled with
   * covered cells.
   */
  colSpan?: number;

  /**
   * Span this cell across N rows (default 1).
   * The spanned cells in subsequent rows at the same column position are
   * automatically filled with covered cells.
   */
  rowSpan?: number;

  /**
   * Hyperlink URL. When set, the cell text becomes a clickable link.
   *
   * @example
   * { value: "odf-kit", type: "string", href: "https://github.com/GitHubNewbie0/odf-kit" }
   */
  href?: string;
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
 * sheet.addRow(["Hello", 42, new Date("2026-01-15"), true]);
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

  /** Column span — number of columns this cell covers (default 1). */
  colSpan?: number;

  /** Row span — number of rows this cell covers (default 1). */
  rowSpan?: number;

  /** Hyperlink URL — when set, cell text is rendered as a link. */
  href?: string;
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

  /** Number of rows to freeze at the top (0 = no freeze). */
  freezeRows?: number;

  /** Number of columns to freeze at the left (0 = no freeze). */
  freezeColumns?: number;

  /** Sheet tab color (hex e.g. `"#FF0000"` or CSS named color). */
  tabColor?: string;
}
