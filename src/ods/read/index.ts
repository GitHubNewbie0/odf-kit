/**
 * Public API for reading ODS files into a spreadsheet model.
 *
 * Import from "odf-kit/ods/read":
 *
 * ```typescript
 * import { readOds } from "odf-kit/ods/read";
 * ```
 *
 * readOds() returns an OdsDocumentModel with one sheet model per sheet. To
 * render HTML, see "odf-kit/ods/to-html".
 */
export { VERSION } from "../../version.js";

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
