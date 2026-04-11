import { readXlsx } from "./reader.js";
import { convertXlsxToOds } from "./converter.js";
import type { XlsxToOdsOptions } from "./converter.js";

export { readXlsx } from "./reader.js";
export type { XlsxWorkbook, XlsxSheet, XlsxRow, XlsxCell } from "./reader.js";
export type { XlsxToOdsOptions } from "./converter.js";

/**
 * Convert an .xlsx file to an .ods file.
 *
 * Parses the XLSX XML directly — no external dependencies beyond fflate.
 * Runs in Node.js and browsers.
 *
 * @param bytes   - Raw .xlsx file bytes (Uint8Array or ArrayBuffer).
 * @param options - Optional conversion options.
 * @returns Promise resolving to a Uint8Array containing the .ods file.
 *
 * @example
 * import { xlsxToOds } from "odf-kit/xlsx"
 * import { readFileSync, writeFileSync } from "fs"
 *
 * const bytes = await xlsxToOds(readFileSync("report.xlsx"))
 * writeFileSync("report.ods", bytes)
 */
export async function xlsxToOds(
  bytes: Uint8Array | ArrayBuffer,
  options?: XlsxToOdsOptions,
): Promise<Uint8Array> {
  const workbook = readXlsx(bytes);
  return convertXlsxToOds(workbook, options);
}
