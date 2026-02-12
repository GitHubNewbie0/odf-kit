import type { TextFormatting, TextRun, ImageOptions, ImageData } from "./types.js";

/**
 * Builder for paragraph content with formatted text runs.
 *
 * Passed to the callback form of `addParagraph()` and `addHeading()`.
 * Each call to `addText()` appends a run of text with optional formatting.
 *
 * @example
 * doc.addParagraph((p) => {
 *   p.addText("Normal text, ");
 *   p.addText("bold text, ", { bold: true });
 *   p.addText("and red text.", { color: "red" });
 * });
 *
 * @example
 * // Tab stops
 * doc.addParagraph((p) => {
 *   p.addText("Label");
 *   p.addTab();
 *   p.addText("Value");
 * }, { tabStops: [{ position: "8cm" }] });
 *
 * @example
 * // Links and bookmarks
 * doc.addParagraph((p) => {
 *   p.addBookmark("intro");
 *   p.addText("Welcome! Visit ");
 *   p.addLink("our site", "https://example.com");
 *   p.addText(" or jump to ");
 *   p.addLink("Chapter 2", "#chapter2");
 * });
 *
 * @example
 * // Inline image
 * doc.addParagraph((p) => {
 *   p.addText("See figure: ");
 *   p.addImage(pngBytes, { width: "5cm", height: "3cm", mimeType: "image/png" });
 * });
 */
export class ParagraphBuilder {
  /** @internal */
  readonly runs: TextRun[] = [];

  /**
   * Add a run of text with optional formatting.
   *
   * @param text - The text content.
   * @param formatting - Optional formatting for this run.
   * @returns This builder, for chaining.
   *
   * @example
   * p.addText("hello");
   * p.addText("bold", { bold: true });
   * p.addText("big red", { fontSize: 24, color: "#FF0000" });
   */
  addText(text: string, formatting?: TextFormatting): this {
    this.runs.push({ text, formatting });
    return this;
  }

  /**
   * Insert a tab character. Use with `tabStops` in paragraph options
   * to control tab positions.
   *
   * @returns This builder, for chaining.
   *
   * @example
   * p.addText("Name");
   * p.addTab();
   * p.addText("Value");
   */
  addTab(): this {
    this.runs.push({ text: "", field: "tab" });
    return this;
  }

  /**
   * Add a hyperlink.
   *
   * Use a URL for external links, or `"#bookmarkName"` for internal links
   * to bookmarks created with `addBookmark()`.
   *
   * @param text - The visible link text.
   * @param url - The link target (URL or `"#bookmarkName"`).
   * @param formatting - Optional text formatting for the link.
   * @returns This builder, for chaining.
   *
   * @example
   * p.addLink("our website", "https://example.com");
   * p.addLink("Click here", "https://example.com", { bold: true, color: "blue" });
   * p.addLink("Chapter 2", "#chapter2");
   */
  addLink(text: string, url: string, formatting?: TextFormatting): this {
    this.runs.push({ text, formatting, link: url });
    return this;
  }

  /**
   * Insert a bookmark at the current position in the text flow.
   *
   * Bookmarks can be linked to from elsewhere in the document using
   * `addLink("text", "#bookmarkName")`.
   *
   * @param name - The bookmark name (used in `#name` links).
   * @returns This builder, for chaining.
   *
   * @example
   * p.addBookmark("chapter1");
   * p.addText("Chapter 1 content...");
   */
  addBookmark(name: string): this {
    this.runs.push({ text: "", bookmark: name });
    return this;
  }

  /**
   * Insert an inline image at the current position.
   *
   * The image is anchored as a character in the text flow by default.
   *
   * @param data - The raw image bytes as a Uint8Array.
   * @param options - Image options (width, height, mimeType are required).
   * @returns This builder, for chaining.
   *
   * @example
   * p.addImage(pngBytes, { width: "5cm", height: "3cm", mimeType: "image/png" });
   */
  addImage(data: Uint8Array, options: ImageOptions): this {
    const imageData: ImageData = {
      data,
      width: options.width,
      height: options.height,
      mimeType: options.mimeType,
      anchor: options.anchor ?? "as-character",
    };
    this.runs.push({ text: "", image: imageData });
    return this;
  }
}
