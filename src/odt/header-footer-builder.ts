import type { TextFormatting, TextRun } from "./types.js";

/**
 * Builder for header and footer content.
 *
 * Has the same `addText()` method as paragraphs, plus `addPageNumber()`
 * for inserting the current page number.
 *
 * @example
 * doc.setFooter((f) => {
 *   f.addText("Page ");
 *   f.addPageNumber();
 *   f.addText(" — Confidential", { italic: true });
 * });
 */
export class HeaderFooterBuilder {
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
   * Insert the current page number.
   *
   * @param formatting - Optional formatting for the page number.
   * @returns This builder, for chaining.
   *
   * @example
   * f.addText("Page ");
   * f.addPageNumber();
   *
   * @example
   * f.addPageNumber({ bold: true, fontSize: 10 });
   */
  addPageNumber(formatting?: TextFormatting): this {
    this.runs.push({ text: "#", field: "page-number", formatting });
    return this;
  }
}
