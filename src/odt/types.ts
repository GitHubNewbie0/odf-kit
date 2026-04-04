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
 *
 * @example
 * // Text transform and small caps
 * { textTransform: "uppercase" }
 * { smallCaps: true }
 *
 * @example
 * // Numeric font weight (light, semi-bold, etc.)
 * { fontWeight: 300 }
 * { fontWeight: 600 }
 */
export interface TextFormatting {
  /** Shortcut for `fontWeight: "bold"`. */
  bold?: boolean;

  /** Shortcut for `fontStyle: "italic"`. */
  italic?: boolean;

  /**
   * Font weight. Overrides `bold` if both are provided.
   * Accepts named values (`"normal"`, `"bold"`) or numeric CSS weights
   * (`100`–`900`, e.g. `300` for light, `600` for semi-bold).
   */
  fontWeight?: "normal" | "bold" | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

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

  /**
   * Transform the text case.
   * - `"uppercase"` — ALL CAPS
   * - `"lowercase"` — all lowercase
   * - `"capitalize"` — First Letter Of Each Word
   */
  textTransform?: "uppercase" | "lowercase" | "capitalize";

  /**
   * Render text in small capitals. Common in legal documents, academic
   * papers, and section headings.
   */
  smallCaps?: boolean;
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

  /**
   * If true, inserts a line break (`text:line-break`) at this position.
   * Equivalent to `<br>` in HTML — a soft line break within the same paragraph.
   * The `text` property is ignored.
   */
  lineBreak?: boolean;
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
 * { align: "center" }
 *
 * @example
 * { spaceBefore: "0.4cm", spaceAfter: "0.2cm" }
 *
 * @example
 * { lineHeight: 1.5 }
 * { lineHeight: "18pt" }
 *
 * @example
 * // Hanging indent (first line protrudes left)
 * { indentLeft: "1cm", indentFirst: "-1cm" }
 *
 * @example
 * { tabStops: [{ position: "8cm" }, { position: "14cm", type: "right" }] }
 */
export interface ParagraphOptions {
  /**
   * Horizontal text alignment. Defaults to the parent style's alignment (left).
   */
  align?: "left" | "center" | "right" | "justify";

  /**
   * Space above the paragraph with units (e.g. `"0.4cm"`, `"6pt"`).
   * Equivalent to `fo:margin-top` on the paragraph.
   */
  spaceBefore?: string;

  /**
   * Space below the paragraph with units (e.g. `"0.2cm"`, `"6pt"`).
   * Equivalent to `fo:margin-bottom` on the paragraph.
   */
  spaceAfter?: string;

  /**
   * Line height. A number ≥ 1 is treated as a multiplier (e.g. `1.5` → 150%).
   * A string with units sets an absolute line height (e.g. `"18pt"`).
   */
  lineHeight?: number | string;

  /**
   * Left indent for the entire paragraph with units (e.g. `"1cm"`).
   * Equivalent to `fo:margin-left` on the paragraph.
   */
  indentLeft?: string;

  /**
   * First-line indent with units. Positive values indent the first line
   * (e.g. `"0.5cm"`). Negative values create a hanging indent — combine
   * with `indentLeft` to keep text aligned (e.g. `indentLeft: "1cm"`,
   * `indentFirst: "-1cm"`).
   */
  indentFirst?: string;

  /**
   * Tab stops for this paragraph. Used with `addTab()` in the paragraph builder.
   */
  tabStops?: TabStop[];

  /**
   * Border on the bottom edge of the paragraph. Uses CSS border shorthand:
   * `"<width> <style> <color>"` (e.g. `"0.5pt solid #000000"`).
   * Used to render horizontal rules (`<hr>`) in HTML→ODT conversion.
   */
  borderBottom?: string;
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
   * - `"page"` — anchored to the page (positioned relative to the page)
   */
  anchor?: "as-character" | "paragraph" | "page";

  /**
   * Accessible label for the image. Maps to `<svg:title>` inside the draw frame.
   * Used by screen readers and accessibility tools.
   *
   * @example
   * { alt: "Company logo" }
   * { alt: "LaTeX: \\frac{1}{2}" }
   */
  alt?: string;

  /**
   * Detailed description of the image content. Maps to `<svg:desc>` inside
   * the draw frame. Useful for preserving metadata such as LaTeX source,
   * formula text, or extended captions for round-trip editing.
   *
   * @example
   * { description: "$\\frac{1}{2}$" }
   */
  description?: string;

  /**
   * Override the auto-generated frame name. Maps to `draw:name` on the
   * draw frame. Useful when stable, predictable names are needed for
   * round-trip editing or LibreOffice extension integration.
   *
   * @example
   * { name: "formula-1" }
   */
  name?: string;

  /**
   * How text wraps around the image frame.
   * - `"left"` — image floats left, text wraps on the right
   * - `"right"` — image floats right, text wraps on the left
   * - `"none"` — no text wrap; image sits in its own block
   *
   * Requires `anchor: "paragraph"` or `anchor: "page"` to take effect.
   *
   * @example
   * { wrapMode: "left", marginRight: "0.3cm" }
   */
  wrapMode?: "left" | "right" | "none";

  /**
   * Space between the image frame and surrounding text/content.
   * Accepts values with units (e.g. `"0.3cm"`, `"6pt"`).
   * Applies to all four sides unless the side-specific properties are used.
   *
   * @example
   * { wrapMode: "left", margin: "0.2cm" }
   */
  margin?: string;

  /** Space above the image frame. Overrides `margin` for the top side. */
  marginTop?: string;

  /** Space below the image frame. Overrides `margin` for the bottom side. */
  marginBottom?: string;

  /** Space to the left of the image frame. Overrides `margin` for the left side. */
  marginLeft?: string;

  /** Space to the right of the image frame. Overrides `margin` for the right side. */
  marginRight?: string;

  /**
   * Border around the image frame. Uses CSS border shorthand format:
   * `"<width> <style> <color>"` (e.g. `"0.5pt solid #000000"`).
   *
   * @example
   * { border: "1pt solid #cccccc" }
   */
  border?: string;

  /**
   * Opacity of the image frame as a percentage (0–100).
   * `100` is fully opaque (default), `0` is fully transparent.
   *
   * @example
   * { opacity: 50 }
   */
  opacity?: number;
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
  anchor: "as-character" | "paragraph" | "page";

  /** Accessible label — maps to `<svg:title>`. */
  alt?: string;

  /** Detailed description — maps to `<svg:desc>`. */
  description?: string;

  /** Override for the draw:name attribute on the frame. */
  name?: string;

  /** Text wrap mode — maps to style:wrap on style:graphic-properties. */
  wrapMode?: "left" | "right" | "none";

  /** Uniform margin around the frame (all sides). */
  margin?: string;

  /** Top margin. Overrides margin for the top side. */
  marginTop?: string;

  /** Bottom margin. Overrides margin for the bottom side. */
  marginBottom?: string;

  /** Left margin. Overrides margin for the left side. */
  marginLeft?: string;

  /** Right margin. Overrides margin for the right side. */
  marginRight?: string;

  /** Border around the frame — CSS shorthand (e.g. "0.5pt solid #000000"). */
  border?: string;

  /** Opacity as a percentage (0–100). */
  opacity?: number;
}

// ─── List Types ──────────────────────────────────────────────────────

/**
 * Options for list-level settings.
 *
 * @example
 * { type: "numbered" }
 *
 * @example
 * // Roman numerals starting at 1
 * { type: "numbered", numFormat: "i" }
 *
 * @example
 * // Alphabetic list with parentheses: (a), (b), (c)
 * { type: "numbered", numFormat: "a", numPrefix: "(", numSuffix: ")" }
 *
 * @example
 * // Continue numbering from 5
 * { type: "numbered", startValue: 5 }
 */
export interface ListOptions {
  /**
   * List type. Defaults to `"bullet"`.
   */
  type?: "bullet" | "numbered";

  /**
   * Number format for numbered lists. Ignored for bullet lists.
   * - `"1"` — Arabic numerals: 1, 2, 3 (default)
   * - `"a"` — lowercase alpha: a, b, c
   * - `"A"` — uppercase alpha: A, B, C
   * - `"i"` — lowercase roman: i, ii, iii
   * - `"I"` — uppercase roman: I, II, III
   */
  numFormat?: "1" | "a" | "A" | "i" | "I";

  /**
   * Text prepended to the number (e.g. `"("` produces `(1)`, `(2)`).
   * Ignored for bullet lists. Defaults to `""`.
   */
  numPrefix?: string;

  /**
   * Text appended to the number (e.g. `")"` produces `1)`, `2)`).
   * Ignored for bullet lists. Defaults to `"."`.
   */
  numSuffix?: string;

  /**
   * Number to start the list at. Ignored for bullet lists. Defaults to `1`.
   */
  startValue?: number;
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
 * // Cell with custom border and vertical alignment
 * { border: "1pt solid #000000", verticalAlign: "middle" }
 *
 * @example
 * // Cell padding
 * { padding: "0.1cm" }
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

  /**
   * Vertical alignment of content within the cell.
   * - `"top"` — align to top (default)
   * - `"middle"` — center vertically
   * - `"bottom"` — align to bottom
   */
  verticalAlign?: "top" | "middle" | "bottom";

  /**
   * Padding between the cell border and its content, applied to all four sides.
   * Accepts values with units (e.g. `"0.1cm"`, `"2pt"`).
   */
  padding?: string;
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
 * Options for row-level settings.
 *
 * @example
 * // Zebra striping
 * { backgroundColor: "#EEEEEE" }
 *
 * @example
 * // Header row highlight
 * { backgroundColor: "#DDDDDD" }
 */
export interface TableRowOptions {
  /**
   * Row background color. Accepts hex (`"#EEEEEE"`) or CSS named colors (`"lightgray"`).
   * Applied to the entire row via `fo:background-color` on `style:table-row-properties`.
   */
  backgroundColor?: string;
}

/**
 * Internal representation of a table row's data.
 */
export interface TableRowData {
  /** Cells in this row. */
  cells: TableCellData[];

  /** Row-level options (background color, etc.). */
  options?: TableRowOptions;
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
