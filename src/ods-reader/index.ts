/**
 * Public API for the odf-kit ODS reader.
 *
 * Import from "odf-kit/ods-reader":
 *
 * ```typescript
 * import { readOds, odsToHtml } from "odf-kit/ods-reader";
 * ```
 *
 * The implementation now lives at "odf-kit/ods/read" and
 * "odf-kit/ods/to-html"; this path is preserved for backwards compatibility
 * and re-exports from there.
 */
export { VERSION } from "../version.js";

export { readOds } from "../ods/read/parser.js";
export { odsToHtml } from "../ods/to-html/index.js";
export type {
  OdsDocumentModel,
  OdsMetadata,
  OdsSheetModel,
  OdsRowModel,
  OdsCellModel,
  OdsCellFormatting,
  ReadOdsOptions,
  OdsHtmlOptions,
} from "../ods/read/types.js";
