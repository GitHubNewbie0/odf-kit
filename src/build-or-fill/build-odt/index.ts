/**
 * Public API for ODT construction from JavaScript-side inputs.
 *
 * Import from "odf-kit/build-or-fill/build-odt":
 *
 * ```typescript
 * import { OdtDocument } from "odf-kit/build-or-fill/build-odt";
 * ```
 */

export { VERSION } from "../../version.js";
export { OdtDocument } from "./document.js";
export { ParagraphBuilder } from "./paragraph-builder.js";
export { HeaderFooterBuilder } from "./header-footer-builder.js";
export { TableBuilder, RowBuilder, CellBuilder } from "./table-builder.js";
export { ListBuilder } from "./list-builder.js";
export type { ContentElement } from "./content.js";
export type {
  TextFormatting,
  TextRun,
  TableOptions,
  CellOptions,
  PageLayout,
  ParagraphOptions,
  TabStop,
  ListOptions,
  ImageOptions,
  ImageData,
} from "./types.js";
