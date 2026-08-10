/**
 * Public API for converting ODT files to HTML.
 *
 * Import from "odf-kit/odt/to-html":
 *
 * ```typescript
 * import { odtToHtml } from "odf-kit/odt/to-html";
 * ```
 *
 * Two functions are available:
 *   odtToHtml(bytes, options) - convenience wrapper, parses bytes and renders HTML
 *   renderOdtHtml(body, options) - standalone renderer, takes a parsed body array
 *
 * For most use cases, prefer odtToHtml(). renderOdtHtml() is useful when you
 * already have a parsed model (e.g. from readOdt) and want to render multiple
 * times with different HTML options without re-parsing.
 */
export { VERSION } from "../../version.js";

import { readOdt } from "../read/parser.js";
import { renderOdtHtml } from "./html-renderer.js";
import type { HtmlOptions, ReadOdtOptions } from "../read/types.js";

export { renderOdtHtml } from "./html-renderer.js";
export type { HtmlOptions } from "../read/types.js";

/**
 * Convert an .odt file directly to an HTML string.
 *
 * Convenience wrapper around readOdt() + renderOdtHtml(). Use readOdt()
 * directly when you need access to the document model, metadata, page
 * layout, or header/footer content.
 *
 * @param bytes - The raw .odt file as a Uint8Array.
 * @param options - HTML output options.
 * @param readOptions - Options controlling how the document is parsed
 *   (e.g. tracked-changes mode). Passed to readOdt().
 * @returns HTML string. Full document by default; inner fragment when
 *   options.fragment is true.
 *
 * @example
 * ```typescript
 * import { odtToHtml } from "odf-kit/odt/to-html";
 * import { readFileSync } from "node:fs";
 *
 * const bytes = new Uint8Array(readFileSync("document.odt"));
 * const html = odtToHtml(bytes, { fragment: true });
 * ```
 */
export function odtToHtml(
  bytes: Uint8Array,
  options?: HtmlOptions,
  readOptions?: ReadOdtOptions,
): string {
  const model = readOdt(bytes, readOptions);
  return renderOdtHtml(model.body, options);
}
