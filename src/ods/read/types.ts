/**
 * ODS reader type definitions.
 *
 * These types describe the in-memory model returned by readOds().
 */

// ─── Document Model ───────────────────────────────────────────────────

/** Top-level ODS document model returned by readOds(). */
export interface OdsDocumentModel {
  /** Sheets in tab order. */
  sheets: OdsSheetModel[];
  /** Document metadata from meta.xml. */
  metadata?: OdsMetadata;
}

/** Document metadata from meta.xml. */
export interface OdsMetadata {
  title?: string;
  creator?: string;
  description?: string;
  creationDate?: string;
  lastModified?: string;
}

/** A single sheet (tab) in the spreadsheet. */
export interface OdsSheetModel {
  /** Sheet tab name. */
  name: string;
  /** Tab color if set (hex or CSS named color). */
  tabColor?: string;
  /** Rows in order. Sparse rows (e.g. from table:number-rows-repeated) are expanded. */
  rows: OdsRowModel[];
  /** Column widths by zero-based column index. */
  columnWidths: Map<number, string>;
  /** Number of frozen rows (from settings.xml). */
  freezeRows?: number;
  /** Number of frozen columns (from settings.xml). */
  freezeColumns?: number;
}

/** A row of cells. */
export interface OdsRowModel {
  /** Zero-based row index within the sheet. */
  index: number;
  /** Cells in column order. Covered cells have type "covered". */
  cells: OdsCellModel[];
  /** Row height if explicitly set. */
  height?: string;
}

/**
 * A single cell in the spreadsheet.
 *
 * Cell types:
 * - `"string"`  — text value; `value` is a string
 * - `"float"`   — numeric value; `value` is a number
 * - `"date"`    — date/datetime; `value` is a Date (UTC)
 * - `"boolean"` — boolean; `value` is true or false
 * - `"formula"` — formula cell; `value` is the cached result, `formula` is the original string
 * - `"empty"`   — no content; `value` is null
 * - `"covered"` — covered by a merge from a primary cell; `value` is null
 */
export interface OdsCellModel {
  /** Zero-based column index. Always correct regardless of merges. */
  colIndex: number;

  /** Cell type. */
  type: "string" | "float" | "date" | "boolean" | "formula" | "empty" | "covered";

  /**
   * The typed JavaScript value.
   * - string → string
   * - float → number
   * - date → Date (UTC)
   * - boolean → boolean
   * - formula → cached result (number, string, or boolean)
   * - empty/covered → null
   */
  value: string | number | boolean | Date | null;

  /**
   * Original formula string for formula cells (e.g. `"=SUM(A1:A10)"`).
   * The `of:` OpenFormula prefix is stripped.
   * Undefined for non-formula cells.
   */
  formula?: string;

  /**
   * Display text as it appears in the cell (the text:p content).
   * e.g. `"1,234.56"` for a formatted number, `"15/01/2026"` for a date.
   * May differ from `value` when number or date formatting is applied.
   */
  displayText?: string;

  /**
   * Number of columns this cell spans (1 = no merge).
   * Only set when > 1.
   */
  colSpan?: number;

  /**
   * Number of rows this cell spans (1 = no merge).
   * Only set when > 1.
   */
  rowSpan?: number;

  /** Cell formatting extracted from the cell style. */
  formatting?: OdsCellFormatting;
}

/** Cell formatting properties extracted from ODS automatic styles. */
export interface OdsCellFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: string;
  fontFamily?: string;
  /** Text color. */
  color?: string;
  /** Cell background color. */
  backgroundColor?: string;
  /** Horizontal text alignment. */
  textAlign?: "left" | "center" | "right";
  /** Vertical alignment. */
  verticalAlign?: "top" | "middle" | "bottom";
  /** Number format string (e.g. `"decimal:2"`, `"currency:EUR"`, `"percentage"`). */
  numberFormat?: string;
  /** Date format string (e.g. `"YYYY-MM-DD"`, `"DD/MM/YYYY"`). */
  dateFormat?: string;
}

// ─── Options ─────────────────────────────────────────────────────────

/** Options for {@link readOds}. */
export interface ReadOdsOptions {
  /**
   * Whether to include cell formatting in the model.
   * Defaults to `true`. Set to `false` for faster parsing when
   * only values and types are needed.
   */
  includeFormatting?: boolean;
}

/** Options for {@link odsToHtml}. */
export interface OdsHtmlOptions {
  /**
   * Whether to include inline styles from cell formatting.
   * Defaults to `true`.
   */
  includeStyles?: boolean;

  /**
   * CSS class prefix for generated elements.
   * Defaults to `"ods"`.
   */
  classPrefix?: string;
}
