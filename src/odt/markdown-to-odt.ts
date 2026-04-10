import { marked } from "marked";
import { htmlToOdt } from "./html-to-odt.js";
import type { HtmlToOdtOptions } from "./html-to-odt.js";

/**
 * Convert a Markdown string to an ODT file.
 *
 * Internally converts Markdown → HTML via `marked`, then HTML → ODT
 * via {@link htmlToOdt}. All {@link HtmlToOdtOptions} apply — page format,
 * orientation, margins, and metadata.
 *
 * **Supported Markdown:** CommonMark spec — headings, paragraphs, bold,
 * italic, strikethrough, unordered and ordered lists, nested lists, tables,
 * blockquotes, fenced code blocks, inline code, horizontal rules, and links.
 *
 * **Page format:** Defaults to A4, the ISO standard for Europe and most of
 * the world. Pass `{ pageFormat: "letter" }` for US/Canadian users.
 *
 * @param markdown - Markdown string to convert.
 * @param options  - Optional page format, margins, orientation, and metadata.
 * @returns Promise resolving to a valid `.odt` file as a `Uint8Array`.
 *
 * @example
 * // Basic usage — A4 page (default)
 * import { markdownToOdt } from "odf-kit";
 * const bytes = await markdownToOdt("# Hello\n\nWorld");
 *
 * @example
 * // US letter with metadata
 * const bytes = await markdownToOdt(markdownString, {
 *   pageFormat: "letter",
 *   metadata: { title: "My Document", creator: "Alice" },
 * });
 */
export async function markdownToOdt(
  markdown: string,
  options?: HtmlToOdtOptions,
): Promise<Uint8Array> {
  const html = await marked.parse(markdown);
  return htmlToOdt(html, options);
}
