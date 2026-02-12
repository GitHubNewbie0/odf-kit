/**
 * Text formatting options.
 *
 * Supports both boolean shortcuts (`bold: true`) and CSS-style properties
 * (`fontWeight: "bold"`). When both are provided, the more explicit
 * CSS-style property wins.
 *
 * @example
 * // Boolean shortcut
 * { bold: true, italic: true }
 *
 * @example
 * // CSS-style properties
 * { fontWeight: "bold", fontStyle: "italic" }
 *
 * @example
 * // Font size as number (assumes pt) or string with units
 * { fontSize: 14 }
 * { fontSize: "14pt" }
 *
 * @example
 * // Full formatting
 * { bold: true, fontSize: 16, fontFamily: "Arial", color: "#FF0000" }
 *
 * @example
 * // Advanced formatting
 * { underline: true, highlightColor: "yellow" }
 * { strikethrough: true }
 * { superscript: true }
 * { subscript: true }
 */
export interface TextFormatting {
  /** Shortcut for `fontWeight: "bold"`. */
  bold?: boolean;

  /** Shortcut for `fontStyle: "italic"`. */
  italic?: boolean;

  /** Font weight. Overrides `bold` if both are provided. */
  fontWeight?: "normal" | "bold";

  /** Font style. Overrides `italic` if both are provided. */
  fontStyle?: "normal" | "italic";

  /**
   * Font size. A number is interpreted as points (e.g. `12` means `"12pt"`).
   * A string should include the unit (e.g. `"14pt"`, `"1.2cm"`).
   */
  fontSize?: number | string;

  /**
   * Font family name (e.g. `"Arial"`, `"Times New Roman"`).
   */
  fontFamily?: string;

  /**
   * Text color. Accepts hex (`"#FF0000"`) or CSS named colors (`"red"`).
   */
  color?: string;

  /** Underline the text. */
  underline?: boolean;

  /** Draw a line through the text. */
  strikethrough?: boolean;

  /** Render text as superscript (raised, smaller). */
  superscript?: boolean;

  /** Render text as subscript (lowered, smaller). */
  subscript?: boolean;

  /**
   * Text highlight/background color.
   * Accepts hex (`"#FFFF00"`) or CSS named colors (`"yellow"`).
   */
  highlightColor?: string;
}

/**
 * A single run of text with optional formatting.
 * A paragraph is composed of one or more text runs.
 */
export interface TextRun {
  /** The text content. */
  text: string;

  /** Optional formatting for this run. */
  formatting?: TextFormatting;

  /**
   * If set, this run renders as a field or special element instead of literal text.
   * The `text` property serves as fallback display text.
   */
  field?: "page-number" | "tab";

  /**
   * If set, wraps this run in a hyperlink (`text:a`).
   * Use a URL for external links, or `"#bookmarkName"` for internal links.
   */
  link?: string;

  /**
   * If set, inserts a bookmark at this position in the text flow.
   * The `text` property is still rendered normally after the bookmark.
   */
  bookmark?: string;

  /**
   * If set, this run renders as an inline image (`draw:frame` > `draw:image`).
   * The `text` property is ignored.
   */
  image?: ImageData;
}

// ─── Paragraph Options ───────────────────────────────────────────────

/**
 * A tab stop definition for paragraph layout.
 *
 * @example
 * { position: "8cm" }
 * { position: "4in", type: "right" }
 */
export interface TabStop {
  /**
   * Position of the tab stop with units (e.g. `"8cm"`, `"3in"`).
   */
  position: string;

  /**
   * Alignment type of the tab stop. Defaults to `"left"`.
   */
  type?: "left" | "center" | "right";
}

/**
 * Options for paragraph-level formatting.
 *
 * @example
 * { tabStops: [{ position: "8cm" }, { position: "14cm", type: "right" }] }
 */
export interface ParagraphOptions {
  /**
   * Tab stops for this paragraph. Used with `addTab()` in the paragraph builder.
   */
  tabStops?: TabStop[];
}

// ─── Image Types ────────────────────────────────────────────────────

/**
 * Options for adding an image to the document.
 *
 * @example
 * { width: "10cm", height: "6cm", mimeType: "image/png" }
 *
 * @example
 * { width: "4in", height: "3in", mimeType: "image/jpeg", anchor: "paragraph" }
 */
export interface ImageOptions {
  /** Image width with units (e.g. `"10cm"`, `"4in"`). Required. */
  width: string;

  /** Image height with units (e.g. `"6cm"`, `"3in"`). Required. */
  height: string;

  /**
   * MIME type of the image data (e.g. `"image/png"`, `"image/jpeg"`, `"image/svg+xml"`).
   */
  mimeType: string;

  /**
   * How the image is anchored in the document.
   * - `"as-character"` — inline with text (default for images inside paragraphs)
   * - `"paragraph"` — anchored to the paragraph (default for standalone `addImage()`)
   */
  anchor?: "as-character" | "paragraph";
}

/**
 * Internal representation of an embedded image.
 */
export interface ImageData {
  /** The raw image bytes. */
  data: Uint8Array;

  /** Image width with units. */
  width: string;

  /** Image height with units. */
  height: string;

  /** MIME type (e.g. `"image/png"`). */
  mimeType: string;

  /** Anchor type. */
  anchor: "as-character" | "paragraph";
}

// ─── List Types ──────────────────────────────────────────────────────

/**
 * Options for list-level settings.
 *
 * @example
 * { type: "numbered" }
 *
 * @example
 * { type: "bullet" }
 */
export interface ListOptions {
  /**
   * List type. Defaults to `"bullet"`.
   */
  type?: "bullet" | "numbered";
}

/**
 * Internal representation of a list item's data.
 */
export interface ListItemData {
  /** Text runs inside the list item. */
  runs: TextRun[];

  /** Nested sub-list, if any. */
  nested?: ListData;
}

/**
 * Internal representation of a complete list.
 */
export interface ListData {
  /** Items in this list. */
  items: ListItemData[];

  /** List-level options. */
  options?: ListOptions;
}

// ─── Page Layout Types ────────────────────────────────────────────────

/**
 * Page layout options for the document.
 *
 * Defaults to A4 portrait with 2cm margins if not specified.
 *
 * @example
 * // Landscape A4
 * { orientation: "landscape" }
 *
 * @example
 * // US Letter with custom margins
 * { width: "8.5in", height: "11in", marginTop: "1in", marginBottom: "1in" }
 *
 * @example
 * // Narrow margins
 * { marginLeft: "1cm", marginRight: "1cm" }
 */
export interface PageLayout {
  /**
   * Page width with units (e.g. `"21cm"`, `"8.5in"`).
   * Defaults to A4 width (21cm) or A4 height (29.7cm) if landscape.
   */
  width?: string;

  /**
   * Page height with units (e.g. `"29.7cm"`, `"11in"`).
   * Defaults to A4 height (29.7cm) or A4 width (21cm) if landscape.
   */
  height?: string;

  /**
   * Page orientation. Defaults to `"portrait"`.
   * When set to `"landscape"`, the default A4 dimensions are swapped.
   * If you provide explicit width and height, they are used as-is.
   */
  orientation?: "portrait" | "landscape";

  /** Top margin with units. Defaults to `"2cm"`. */
  marginTop?: string;

  /** Bottom margin with units. Defaults to `"2cm"`. */
  marginBottom?: string;

  /** Left margin with units. Defaults to `"2cm"`. */
  marginLeft?: string;

  /** Right margin with units. Defaults to `"2cm"`. */
  marginRight?: string;
}

// ─── Table Types ──────────────────────────────────────────────────────

/**
 * Options for table-level settings.
 *
 * @example
 * { columnWidths: ["5cm", "3cm", "4cm"] }
 *
 * @example
 * { columnWidths: ["5cm", "3cm"], border: "0.5pt solid #000000" }
 */
export interface TableOptions {
  /**
   * Column widths as strings with units (e.g. `"3cm"`, `"50mm"`, `"2in"`).
   * If omitted, columns are auto-sized by the application.
   */
  columnWidths?: string[];

  /**
   * Default border for all cells. Uses CSS border shorthand format:
   * `"<width> <style> <color>"` (e.g. `"0.5pt solid #000000"`).
   * Individual cells can override this.
   */
  border?: string;
}

/**
 * Options for cell-level settings.
 *
 * Includes text formatting properties (applied to the cell's text)
 * and cell-specific properties (background, borders, merging).
 *
 * @example
 * // Bold header cell with background
 * { bold: true, backgroundColor: "#DDDDDD" }
 *
 * @example
 * // Cell spanning two columns
 * { colSpan: 2 }
 *
 * @example
 * // Cell with custom border
 * { border: "1pt solid #000000", backgroundColor: "lightgray" }
 */
export interface CellOptions extends TextFormatting {
  /**
   * Cell background color. Accepts hex (`"#EEEEEE"`) or CSS named colors (`"lightgray"`).
   */
  backgroundColor?: string;

  /**
   * Border for all four sides. Uses CSS border shorthand format:
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

  /**
   * Number of columns this cell spans. Defaults to 1.
   * Cells covered by the span should not be added — odf-kit generates them.
   */
  colSpan?: number;

  /**
   * Number of rows this cell spans. Defaults to 1.
   * Cells covered by the span in subsequent rows should not be added — odf-kit generates them.
   */
  rowSpan?: number;
}

/**
 * Internal representation of a table cell's data.
 */
export interface TableCellData {
  /** Text runs inside the cell. */
  runs: TextRun[];

  /** Cell options (formatting, borders, merging). */
  options?: CellOptions;
}

/**
 * Internal representation of a table row's data.
 */
export interface TableRowData {
  /** Cells in this row. */
  cells: TableCellData[];
}

/**
 * Internal representation of a complete table.
 */
export interface TableData {
  /** Rows in this table. */
  rows: TableRowData[];

  /** Table-level options. */
  options?: TableOptions;
}
