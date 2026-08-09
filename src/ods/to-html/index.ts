/**
 * Public API for converting ODS files to HTML.
 *
 * Import from "odf-kit/ods/to-html":
 *
 * ```typescript
 * import { odsToHtml } from "odf-kit/ods/to-html";
 * ```
 *
 * Two functions are available:
 *   odsToHtml(bytes, htmlOptions, readOptions) - convenience wrapper
 *   renderOdsHtml(model, options) - standalone renderer, takes a parsed model
 */
export { VERSION } from "../../version.js";

import { readOds } from "../read/parser.js";
import { renderOdsHtml } from "./html-renderer.js";
import type { ReadOdsOptions, OdsHtmlOptions } from "../read/types.js";

export { renderOdsHtml } from "./html-renderer.js";
export type { OdsHtmlOptions } from "../read/types.js";

/**
 * Convert an ODS file directly to an HTML string.
 *
 * Convenience wrapper around readOds() + renderOdsHtml().
 *
 * @param bytes      - Raw .ods file bytes.
 * @param htmlOptions - Optional HTML rendering options.
 * @param readOptions - Optional parsing options.
 * @returns HTML string with one <table> per sheet.
 *
 * @example
 * import { odsToHtml } from "odf-kit/ods/to-html"
 * const html = odsToHtml(readFileSync("data.ods"))
 */
export function odsToHtml(
  bytes: Uint8Array,
  htmlOptions?: OdsHtmlOptions,
  readOptions?: ReadOdsOptions,
): string {
  const model = readOds(bytes, readOptions);
  return renderOdsHtml(model, htmlOptions);
}
