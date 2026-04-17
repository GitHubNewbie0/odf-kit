import type {
  TextFormatting,
  TextRun,
  ImageOptions,
  ImageData,
  CellOptions,
  TableCellData,
  TableRowData,
  TableRowOptions,
} from "./types.js";

/**
 * Builder for cell content with formatted text runs.
 *
 * Passed to the callback form of `RowBuilder.addCell()`.
 * Works the same as ParagraphBuilder — each `addText()` appends a run.
 *
 * @example
 * r.addCell((c) => {
 *   c.addText("Total: ", { bold: true });
 *   c.addText("$1,250", { color: "green" });
 * });
 */
export class CellBuilder {
  /** @internal */
  readonly runs: TextRun[] = [];

  /**
   * Add a run of text with optional formatting.
   *
   * @param text - The text content.
   * @param formatting - Optional formatting for this run.
   * @returns This builder, for chaining.
   */
  addText(text: string, formatting?: TextFormatting): this {
    this.runs.push({ text, formatting });
    return this;
  }

  /**
   * Add a hyperlink run to this cell.
   *
   * @param text - The visible link text.
   * @param url - The URL. Use `"#bookmarkName"` for internal links.
   * @param formatting - Optional text formatting for the link.
   * @returns This builder, for chaining.
   */
  addLink(text: string, url: string, formatting?: TextFormatting): this {
    this.runs.push({ text, formatting, link: url });
    return this;
  }

  /**
   * Insert a line break at the current position in the cell.
   *
   * @returns This builder, for chaining.
   */
  addLineBreak(): this {
    this.runs.push({ text: "", lineBreak: true });
    return this;
  }

  /**
   * Insert an inline image at the current position in the cell.
   *
   * @param data - The raw image bytes as a Uint8Array.
   * @param options - Image options (mimeType required; width and height optional).
   * @returns This builder, for chaining.
   */
  addImage(data: Uint8Array, options: ImageOptions): this {
    const imageData: ImageData = {
      data,
      width: options.width,
      height: options.height,
      mimeType: options.mimeType,
      anchor: options.anchor ?? "as-character",
      alt: options.alt,
      description: options.description,
      name: options.name,
      wrapMode: options.wrapMode,
      margin: options.margin,
      marginTop: options.marginTop,
      marginBottom: options.marginBottom,
      marginLeft: options.marginLeft,
      marginRight: options.marginRight,
      border: options.border,
      opacity: options.opacity,
    };
    this.runs.push({ text: "", image: imageData });
    return this;
  }
}

/**
 * Builder for a table row.
 *
 * Passed to the callback of `TableBuilder.addRow()`. Each `addCell()`
 * adds a cell to the row. Cells covered by colSpan or rowSpan from other
 * cells should NOT be added — odf-kit generates them automatically.
 *
 * @example
 * t.addRow((r) => {
 *   r.addCell("Name", { bold: true, backgroundColor: "#DDDDDD" });
 *   r.addCell("Age", { bold: true, backgroundColor: "#DDDDDD" });
 * });
 */
export class RowBuilder {
  /** @internal */
  readonly cells: TableCellData[] = [];

  /**
   * Add a cell to this row.
   *
   * Accepts a string for plain text, a string with options for formatted text,
   * or a callback for rich text (multiple runs with different formatting).
   *
   * @param content - Cell content: string, or callback for rich text.
   * @param options - Cell options (formatting, borders, merging).
   * @returns This builder, for chaining.
   *
   * @example
   * // Plain text
   * r.addCell("Hello");
   *
   * @example
   * // Text with formatting and cell options
   * r.addCell("Header", { bold: true, backgroundColor: "#DDDDDD" });
   *
   * @example
   * // Rich text via callback
   * r.addCell((c) => {
   *   c.addText("Bold ", { bold: true });
   *   c.addText("and normal.");
   * });
   *
   * @example
   * // Rich text via callback with cell options
   * r.addCell((c) => {
   *   c.addText("Merged cell", { bold: true });
   * }, { colSpan: 2, backgroundColor: "#EEEEEE" });
   */
  addCell(content: string | ((builder: CellBuilder) => void), options?: CellOptions): this {
    let runs: TextRun[];

    if (typeof content === "string") {
      // Plain text — if options include text formatting, apply it
      if (options && hasTextFormatting(options)) {
        runs = [{ text: content, formatting: extractTextFormatting(options) }];
      } else {
        runs = [{ text: content }];
      }
    } else {
      // Callback builder
      const builder = new CellBuilder();
      content(builder);
      runs = builder.runs;
    }

    this.cells.push({ runs, options });
    return this;
  }
}

/**
 * Builder for a table.
 *
 * Passed to the callback form of `OdtDocument.addTable()`.
 * Each `addRow()` adds a row to the table.
 *
 * @example
 * doc.addTable((t) => {
 *   t.addRow((r) => {
 *     r.addCell("Name", { bold: true });
 *     r.addCell("Age", { bold: true });
 *   });
 *   t.addRow((r) => {
 *     r.addCell("Alice");
 *     r.addCell("30");
 *   });
 * });
 */
export class TableBuilder {
  /** @internal */
  readonly rows: TableRowData[] = [];

  /**
   * Add a row to this table.
   *
   * @param buildRow - Callback receiving a {@link RowBuilder}.
   * @param options - Optional row-level options (e.g. background color).
   * @returns This builder, for chaining.
   *
   * @example
   * // Plain row
   * t.addRow((r) => { r.addCell("Alice"); r.addCell("30"); });
   *
   * @example
   * // Header row with background color
   * t.addRow((r) => {
   *   r.addCell("Name"); r.addCell("Age");
   * }, { backgroundColor: "#DDDDDD" });
   */
  addRow(buildRow: (row: RowBuilder) => void, options?: TableRowOptions): this {
    const builder = new RowBuilder();
    buildRow(builder);
    this.rows.push({ cells: builder.cells, options });
    return this;
  }
}

/**
 * Check if CellOptions contains any text formatting properties.
 */
function hasTextFormatting(opts: CellOptions): boolean {
  return (
    opts.bold !== undefined ||
    opts.italic !== undefined ||
    opts.fontWeight !== undefined ||
    opts.fontStyle !== undefined ||
    opts.fontSize !== undefined ||
    opts.fontFamily !== undefined ||
    opts.color !== undefined
  );
}

/**
 * Extract text formatting properties from CellOptions.
 */
function extractTextFormatting(opts: CellOptions): TextFormatting {
  const fmt: TextFormatting = {};
  if (opts.bold !== undefined) fmt.bold = opts.bold;
  if (opts.italic !== undefined) fmt.italic = opts.italic;
  if (opts.fontWeight !== undefined) fmt.fontWeight = opts.fontWeight;
  if (opts.fontStyle !== undefined) fmt.fontStyle = opts.fontStyle;
  if (opts.fontSize !== undefined) fmt.fontSize = opts.fontSize;
  if (opts.fontFamily !== undefined) fmt.fontFamily = opts.fontFamily;
  if (opts.color !== undefined) fmt.color = opts.color;
  return fmt;
}
