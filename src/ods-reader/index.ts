import { readOds } from "./parser.js";
import { renderOdsHtml } from "./html-renderer.js";
import type { ReadOdsOptions, OdsHtmlOptions } from "./types.js";

export { readOds } from "./parser.js";
export type {
  OdsDocumentModel,
  OdsMetadata,
  OdsSheetModel,
  OdsRowModel,
  OdsCellModel,
  OdsCellFormatting,
  ReadOdsOptions,
  OdsHtmlOptions,
} from "./types.js";

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
 * import { odsToHtml } from "odf-kit/ods-reader"
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
