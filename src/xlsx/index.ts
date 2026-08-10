/**
 * Legacy alias. Preserved for backwards compatibility with callers that
 * import from "odf-kit/xlsx". The XLSX pathway now lives at:
 *   - "odf-kit/xlsx/to-ods"
 *
 * New code should import from that canonical path.
 *
 * This alias mirrors the canonical entry point's full surface, including
 * readXlsx and the four workbook model types (amendments-2 item 1).
 */
export { VERSION } from "../version.js";

export { xlsxToOds, readXlsx } from "./to-ods/index.js";
export type {
  XlsxToOdsOptions,
  XlsxWorkbook,
  XlsxSheet,
  XlsxRow,
  XlsxCell,
} from "./to-ods/index.js";
