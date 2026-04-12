/**
 * odf-kit/docx — DOCX to ODT conversion
 *
 * Convert .docx files to .odt — pure ESM, zero new dependencies,
 * runs in Node.js 22+ and browsers.
 *
 * @example
 * import { docxToOdt } from "odf-kit/docx"
 * import { readFileSync, writeFileSync } from "fs"
 *
 * const { bytes, warnings } = await docxToOdt(readFileSync("report.docx"))
 * writeFileSync("report.odt", bytes)
 * if (warnings.length > 0) console.warn(warnings)
 *
 * @example
 * // With options
 * const { bytes } = await docxToOdt(input, {
 *   pageFormat: "letter",
 *   orientation: "portrait",
 *   styleMap: {
 *     "Section Title": 1,
 *     "Sub Title": 2,
 *   },
 * })
 *
 * @module
 */

import { readDocx } from "./reader.js";
import { convertDocxToOdt } from "./converter.js";
export type { DocxToOdtOptions } from "./converter.js";

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

/**
 * Result of a DOCX → ODT conversion.
 *
 * `bytes` is the complete .odt file ready to write to disk or serve over
 * HTTP. `warnings` reports content that could not be fully converted —
 * check and log these during development and testing.
 */
export interface DocxToOdtResult {
  /** The .odt file as a Uint8Array. */
  bytes: Uint8Array;

  /**
   * Warnings about content that could not be converted.
   *
   * Examples:
   *  - Images whose ZIP entry was not found
   *  - Mid-document section breaks (page layout changes)
   *  - Unrecognised complex field instructions
   *  - w:altChunk (imported external content)
   */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a .docx file to .odt.
 *
 * Accepts raw bytes from `fs.readFileSync()`, `fetch().arrayBuffer()`,
 * a `File` object's `.arrayBuffer()`, or any other Uint8Array / ArrayBuffer
 * source. Works in Node.js 22+ and modern browsers.
 *
 * @param input   - Raw .docx bytes: Uint8Array or ArrayBuffer.
 * @param options - Optional conversion options.
 * @returns Promise resolving to `{ bytes, warnings }`.
 *
 * @example
 * // Node.js
 * import { readFileSync, writeFileSync } from "fs"
 * const { bytes, warnings } = await docxToOdt(readFileSync("input.docx"))
 * writeFileSync("output.odt", bytes)
 *
 * @example
 * // Browser (File input)
 * const file = event.target.files[0]
 * const { bytes } = await docxToOdt(await file.arrayBuffer())
 * const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.oasis.opendocument.text" }))
 *
 * @example
 * // Override page format and supply a custom style map
 * const { bytes } = await docxToOdt(input, {
 *   pageFormat: "letter",
 *   styleMap: { "Article Heading": 1 },
 * })
 */
export async function docxToOdt(
  input: Uint8Array | ArrayBuffer,
  options: import("./converter.js").DocxToOdtOptions = {},
): Promise<DocxToOdtResult> {
  const warnings: string[] = [];

  const docxDoc = await readDocx(input, warnings);
  const bytes = await convertDocxToOdt(docxDoc, options, warnings);

  return { bytes, warnings };
}
