/**
 * Legacy alias. Preserved for backwards compatibility with callers that
 * import from "odf-kit/docx". The DOCX pathway now lives at:
 *   - "odf-kit/docx/to-odt"
 *
 * New code should import from that canonical path.
 */
export { VERSION } from "../version.js";

export { docxToOdt } from "./to-odt/index.js";
export type { DocxToOdtOptions, DocxToOdtResult } from "./to-odt/index.js";
