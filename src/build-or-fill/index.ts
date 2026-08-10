/**
 * Convenience re-export covering all ODF construction and template-filling.
 *
 * Import from "odf-kit/build-or-fill":
 *
 * ```typescript
 * import { OdtDocument, fillTemplate } from "odf-kit/build-or-fill";
 * ```
 *
 * For tree-shaking precision, prefer the specific sub-paths:
 *   "odf-kit/build-or-fill/build-odt"
 *   "odf-kit/build-or-fill/build-ods"
 *   "odf-kit/build-or-fill/fill-odt"
 *
 * Deviation from v3's sketch, recorded per amendments-2 rule 0: v3 specified
 * three `export *` lines. All three leaves re-export VERSION, so star-
 * exporting them makes VERSION an ambiguous name — under the ES module
 * semantics TypeScript implements, an ambiguous star-exported name is
 * excluded rather than re-exported, which would have silently broken the
 * v0.13.4 VERSION contract on this path. The re-exports are therefore
 * explicit, with VERSION taken once from its source.
 */
export { VERSION } from "../version.js";

// ── build-odt ────────────────────────────────────────────────────────────
export {
  OdtDocument,
  ParagraphBuilder,
  HeaderFooterBuilder,
  TableBuilder,
  RowBuilder,
  CellBuilder,
  ListBuilder,
} from "./build-odt/index.js";
export type { ContentElement } from "./build-odt/index.js";
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
} from "./build-odt/index.js";

// ── build-ods ────────────────────────────────────────────────────────────
export { OdsDocument, OdsSheet } from "./build-ods/index.js";
export type {
  OdsCellValue,
  OdsCellObject,
  OdsCellOptions,
  OdsCellType,
  OdsRowOptions,
  OdsDateFormat,
} from "./build-ods/index.js";

// ── fill-odt ─────────────────────────────────────────────────────────────
export { fillTemplate, healPlaceholders, replaceAll } from "./fill-odt/index.js";
export type { TemplateData } from "./fill-odt/index.js";
