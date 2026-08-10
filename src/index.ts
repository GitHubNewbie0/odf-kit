// odf-kit — OpenDocument Format file generator
// https://github.com/GitHubNewbie0/odf-kit
//
// The root convenience export. Every symbol below is a row of the export
// census committed at 412d584 — the v0.13.14 published root surface, 47
// symbols. v0.14.0 repoints these imports at the canonical module locations
// without changing the surface itself (v0_14_0-plan-v3-amendments-2.md
// item 2: the root exports exactly its census 47; the nine additional
// symbols v3's replacement root proposed are new surface and are deferred
// to a separately ruled change).

// ── Build / construct ────────────────────────────────────────────────────
export {
  OdtDocument,
  ParagraphBuilder,
  HeaderFooterBuilder,
  TableBuilder,
  RowBuilder,
  CellBuilder,
  ListBuilder,
} from "./build-or-fill/build-odt/index.js";
export { OdsDocument, OdsSheet } from "./build-or-fill/build-ods/index.js";

// ── Fill templates ───────────────────────────────────────────────────────
export { fillTemplate, healPlaceholders, replaceAll } from "./build-or-fill/fill-odt/index.js";

// ── Inbound conversions ──────────────────────────────────────────────────
export { htmlToOdt } from "./html/to-odt/index.js";
export { markdownToOdt } from "./markdown/to-odt/index.js";
export { tiptapToOdt } from "./tiptap/to-odt/index.js";
export { docxToOdt } from "./docx/to-odt/index.js";

// ── HTML input utilities ─────────────────────────────────────────────────
export { odfKitNormalizer } from "./html/normalize/index.js";
export { odfKitParser } from "./odt/read/xml-parser.js";

export { VERSION } from "./version.js";

// ── Types ────────────────────────────────────────────────────────────────
export type { ContentElement } from "./build-or-fill/build-odt/content.js";
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
} from "./build-or-fill/build-odt/types.js";
export type {
  OdsCellValue,
  OdsCellObject,
  OdsCellOptions,
  OdsCellType,
  OdsRowOptions,
  OdsDateFormat,
} from "./build-or-fill/build-ods/index.js";
export type { TemplateData } from "./build-or-fill/fill-odt/index.js";
export type { HtmlToOdtOptions } from "./html/to-odt/html-to-odt.js";
export type { TiptapNode, TiptapMark, TiptapToOdtOptions } from "./tiptap/to-odt/tiptap-to-odt.js";
export type { DocxToOdtOptions, DocxToOdtResult } from "./docx/to-odt/index.js";
export type { ParsedHtmlTree, Parser, Normalizer } from "./types/public.js";
export type { MetadataOptions } from "./core/index.js";
