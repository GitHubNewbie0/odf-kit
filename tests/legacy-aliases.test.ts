/**
 * Legacy alias paths — the strict-additive guarantee.
 *
 * T4: v0_14_0-plan-v3-amendments-2.md rule 0 — the export census committed at
 * 412d584 is the strict-additive contract: every symbol it records must keep
 * resolving from its existing subpath(s) after the v0.14.0 restructure.
 * T4: v0_14_0-plan-v3.md §Strict-Additive Guarantee — every existing import
 * path keeps working forever via a legacy alias.
 * T4: v0.13.4 VERSION contract — VERSION resolves from the root and from
 * every sub-export path.
 *
 * WHY THIS IS NOT A CHANGE-DETECTOR. The expected symbol lists below are not
 * transcribed from the current source; they are the rows of the v0.13.14
 * published surface as recorded in the before-picture at 412d584 — an
 * artifact that predates every file move in this release. A test that read
 * today's exports and asserted they equal today's exports would be worthless.
 * These assertions can only be satisfied by preserving what was published,
 * and each `expect` count below is cited to its census row.
 *
 * Imports use the PACKAGE SUBPATH ("odf-kit/odt"), not a source-relative path,
 * because the thing under test is the published import shape an external
 * caller uses. jest.config.js maps those specifiers back to src/ via
 * tsconfig.test.json `paths`.
 *
 * Presence, not equality: each path must expose AT LEAST its census symbols.
 * Additions are permitted by the strict-additive contract (v0.14.0 adds
 * markdownToOdt to odf-kit/markdown) and are policed separately by
 * tools/census-compare.mjs, which reports every addition for review.
 *
 * Type-only exports cannot be asserted at runtime, so they are pinned by the
 * `import type` block and exported type aliases at the foot of this file.
 *
 * THE TYPE PINS ARE GATE-ENFORCED — but NOT by `npm test`. Run
 * `npm run typecheck:aliases` (tsc over tsconfig.aliases.json); it is a
 * mandatory gate step. `npm test` alone is BLIND to type-only regressions
 * here, because ts-jest runs transpile-only under this project's
 * `isolatedModules: true`, `npm run lint` is not type-aware, and
 * `npm run build` type-checks only src/ (tsconfig.json excludes tests/).
 * Never conclude "the alias surface is intact" from a green test run alone.
 *
 * Demonstrated 2026-08-09, dropping ONLY the four Xlsx type re-exports from
 * src/xlsx/index.ts while leaving every runtime export in place:
 *   - `npm test` PASSED, all 13 green — completely blind;
 *   - `npm run typecheck:aliases` FAILED with TS2305 x4.
 * That is exactly the amendments-2 item 1 defect class — a type quietly
 * dropped from an alias's re-export list — and the runtime half of this
 * suite cannot see it by construction.
 *
 * The scope is deliberately one file. A project-wide test type-check is
 * blocked on ~20 pre-existing type errors elsewhere in tests/ (queued as
 * separate 0.14.x cleanup); widen tsconfig.aliases.json's `include` once
 * that lands. `npm run build` additionally covers the easier case: a type
 * deleted at its DEFINING module fails the build regardless.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import * as root from "odf-kit";
import * as legacyOdt from "odf-kit/odt";
import * as legacyOds from "odf-kit/ods";
import * as legacyTemplate from "odf-kit/template";
import * as legacyReader from "odf-kit/reader";
import * as legacyOdtReader from "odf-kit/odt-reader";
import * as legacyOdsReader from "odf-kit/ods-reader";
import * as legacyMarkdown from "odf-kit/markdown";
import * as legacyTypst from "odf-kit/typst";
import * as legacyLexical from "odf-kit/lexical";
import * as legacyDocx from "odf-kit/docx";
import * as legacyXlsx from "odf-kit/xlsx";
import * as legacyHtmlNormalizer from "odf-kit/html-normalizer";

const pkg = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
) as { version: string };

/** Every listed name must be a defined runtime export of the module. */
function expectRuntimeExports(mod: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    expect(`${name}: ${typeof mod[name]}`).not.toBe(`${name}: undefined`);
  }
}

/** T4: v0.13.4 VERSION contract — every path re-exports the package version. */
function expectVersion(mod: Record<string, unknown>) {
  expect(typeof mod.VERSION).toBe("string");
  expect(mod.VERSION).toBe(pkg.version);
}

describe("legacy alias paths — strict-additive guarantee (census 412d584)", () => {
  // ── odf-kit (root) — census row: 47 symbols, 19 runtime ────────────────
  // T4: amendments-2 item 2 — the root exports EXACTLY its census 47. v3's
  // replacement root dropped 6 (odfKitNormalizer, odfKitParser, VERSION and
  // the three contract types) and added 9; the ruling restored the 6 and
  // dropped the 9. These assertions pin the 6 that were nearly lost.
  test("odf-kit (root) exposes its 19 census runtime symbols", () => {
    expectRuntimeExports(root, [
      "OdtDocument",
      "ParagraphBuilder",
      "HeaderFooterBuilder",
      "TableBuilder",
      "RowBuilder",
      "CellBuilder",
      "ListBuilder",
      "htmlToOdt",
      "markdownToOdt",
      "tiptapToOdt",
      "odfKitNormalizer",
      "odfKitParser",
      "fillTemplate",
      "healPlaceholders",
      "replaceAll",
      "OdsDocument",
      "OdsSheet",
      "docxToOdt",
      "VERSION",
    ]);
    expectVersion(root);
  });

  // ── odf-kit/odt — census row: 26 symbols, 11 runtime ───────────────────
  test("odf-kit/odt exposes builders plus the three inbound conversions", () => {
    expectRuntimeExports(legacyOdt, [
      "OdtDocument",
      "ParagraphBuilder",
      "HeaderFooterBuilder",
      "TableBuilder",
      "RowBuilder",
      "CellBuilder",
      "ListBuilder",
      "htmlToOdt",
      "markdownToOdt",
      "tiptapToOdt",
      "VERSION",
    ]);
    expectVersion(legacyOdt);
  });

  // ── odf-kit/ods — census row: 9 symbols, 3 runtime ─────────────────────
  test("odf-kit/ods exposes OdsDocument and OdsSheet", () => {
    expectRuntimeExports(legacyOds, ["OdsDocument", "OdsSheet", "VERSION"]);
    expectVersion(legacyOds);
  });

  // ── odf-kit/template — census row: 5 symbols, 4 runtime ────────────────
  test("odf-kit/template exposes the three template functions", () => {
    expectRuntimeExports(legacyTemplate, [
      "fillTemplate",
      "healPlaceholders",
      "replaceAll",
      "VERSION",
    ]);
    expectVersion(legacyTemplate);
  });

  // ── odf-kit/reader + odf-kit/odt-reader — census row: 29 symbols, 3 ────
  // T4: v3 §Resolved Decisions — both subpaths resolve to the same module.
  test("odf-kit/reader exposes readOdt and odtToHtml", () => {
    expectRuntimeExports(legacyReader, ["readOdt", "odtToHtml", "VERSION"]);
    expectVersion(legacyReader);
  });

  test("odf-kit/odt-reader resolves identically to odf-kit/reader", () => {
    expectRuntimeExports(legacyOdtReader, ["readOdt", "odtToHtml", "VERSION"]);
    expect(legacyOdtReader.readOdt).toBe(legacyReader.readOdt);
    expect(legacyOdtReader.odtToHtml).toBe(legacyReader.odtToHtml);
  });

  // ── odf-kit/ods-reader — census row: 11 symbols, 3 runtime ─────────────
  test("odf-kit/ods-reader exposes readOds and odsToHtml", () => {
    expectRuntimeExports(legacyOdsReader, ["readOds", "odsToHtml", "VERSION"]);
    expectVersion(legacyOdsReader);
  });

  // ── odf-kit/markdown — census row: 4 symbols; 5 after v0.14.0 ──────────
  // T4: v3 §Existing paths preserved — "preserved and additively expanded",
  // markdownToOdt joins odtToMarkdown/modelToMarkdown. The addition is the
  // one authorised symbol-column change in Phase 2.
  test("odf-kit/markdown keeps both emitters and gains markdownToOdt", () => {
    expectRuntimeExports(legacyMarkdown, [
      "odtToMarkdown",
      "modelToMarkdown",
      "markdownToOdt",
      "VERSION",
    ]);
    expectVersion(legacyMarkdown);
  });

  // ── odf-kit/typst — census row: 4 symbols, 3 runtime ───────────────────
  test("odf-kit/typst exposes odtToTypst and modelToTypst", () => {
    expectRuntimeExports(legacyTypst, ["odtToTypst", "modelToTypst", "VERSION"]);
    expectVersion(legacyTypst);
  });

  // ── odf-kit/lexical — census row: 5 symbols, 2 runtime ─────────────────
  test("odf-kit/lexical exposes lexicalToOdt", () => {
    expectRuntimeExports(legacyLexical, ["lexicalToOdt", "VERSION"]);
    expectVersion(legacyLexical);
  });

  // ── odf-kit/docx — census row: 4 symbols, 2 runtime ────────────────────
  test("odf-kit/docx exposes docxToOdt", () => {
    expectRuntimeExports(legacyDocx, ["docxToOdt", "VERSION"]);
    expectVersion(legacyDocx);
  });

  // ── odf-kit/xlsx — census row: 8 symbols, 3 runtime ────────────────────
  // T4: amendments-2 item 1 — v3's spec exported only xlsxToOds and
  // XlsxToOdsOptions, which would have deleted readXlsx and the four
  // workbook model types. The ruling requires the full 8-symbol surface on
  // both the canonical path and this alias. readXlsx is the regression
  // guard: it is the symbol the sketch dropped.
  test("odf-kit/xlsx exposes xlsxToOds AND readXlsx (amendments-2 item 1)", () => {
    expectRuntimeExports(legacyXlsx, ["xlsxToOds", "readXlsx", "VERSION"]);
    expectVersion(legacyXlsx);
  });

  // ── odf-kit/html-normalizer — census row: 9 symbols, all runtime ───────
  // T4: amendments sheet 1 item 1 — a shipped public sub-export since
  // v0.13.2 that v2 of the plan wrongly treated as internal. This path is
  // never removed.
  test("odf-kit/html-normalizer exposes the normalizer and all seven rules", () => {
    expectRuntimeExports(legacyHtmlNormalizer, [
      "odfKitNormalizer",
      "selfCloseVoidElements",
      "decodeNamedEntities",
      "emptyRawTextElements",
      "lowercaseDoctype",
      "quoteUnquotedBooleanAttributes",
      "quoteUnquotedAttributeValues",
      "escapeAttributeValueAmpersands",
      "VERSION",
    ]);
    expectVersion(legacyHtmlNormalizer);
  });
});

/**
 * Compile-time preservation of every type-only export on the legacy paths.
 *
 * These aliases have no runtime effect; ts-jest type-checks this file, so a
 * published type removed from any legacy path fails the suite here. Counts
 * are the type-only remainder of each census row.
 */
import type {
  ContentElement,
  HtmlToOdtOptions,
  TiptapNode,
  TiptapMark,
  TiptapToOdtOptions,
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
} from "odf-kit/odt";
import type {
  OdsCellValue,
  OdsCellObject,
  OdsCellOptions,
  OdsCellType,
  OdsRowOptions,
  OdsDateFormat,
} from "odf-kit/ods";
import type { TemplateData } from "odf-kit/template";
import type {
  OdtDocumentModel,
  OdtMetadata,
  HtmlOptions,
  ReadOdtOptions,
  BodyNode,
  ParagraphNode,
  HeadingNode,
  ListNode,
  ListItemNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  SectionNode,
  TrackedChangeNode,
  InlineNode,
  TextSpan,
  ImageNode,
  NoteNode,
  BookmarkNode,
  FieldNode,
  SpanStyle,
  CellStyle,
  RowStyle,
  BorderStyle,
  ParagraphStyle,
} from "odf-kit/reader";
import type {
  OdsDocumentModel,
  OdsMetadata,
  OdsSheetModel,
  OdsRowModel,
  OdsCellModel,
  OdsCellFormatting,
  ReadOdsOptions,
  OdsHtmlOptions,
} from "odf-kit/ods-reader";
import type { MarkdownEmitOptions } from "odf-kit/markdown";
import type { TypstEmitOptions } from "odf-kit/typst";
import type {
  LexicalToOdtOptions,
  LexicalSerializedEditorState,
  LexicalSerializedNode,
} from "odf-kit/lexical";
import type { DocxToOdtOptions, DocxToOdtResult } from "odf-kit/docx";
import type { XlsxToOdsOptions, XlsxWorkbook, XlsxSheet, XlsxRow, XlsxCell } from "odf-kit/xlsx";
import type { ParsedHtmlTree, Parser, Normalizer, MetadataOptions } from "odf-kit";

/** odf-kit/odt — 15 type-only exports (26 census − 11 runtime). */
export type _OdtTypes = [
  ContentElement,
  HtmlToOdtOptions,
  TiptapNode,
  TiptapMark,
  TiptapToOdtOptions,
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
];

/** odf-kit/ods — 6 type-only exports (9 census − 3 runtime). */
export type _OdsTypes = [
  OdsCellValue,
  OdsCellObject,
  OdsCellOptions,
  OdsCellType,
  OdsRowOptions,
  OdsDateFormat,
];

/** odf-kit/template — 1 type-only export (5 census − 4 runtime). */
export type _TemplateTypes = [TemplateData];

/** odf-kit/reader + odf-kit/odt-reader — 26 type-only exports (29 − 3). */
export type _ReaderTypes = [
  OdtDocumentModel,
  OdtMetadata,
  HtmlOptions,
  ReadOdtOptions,
  BodyNode,
  ParagraphNode,
  HeadingNode,
  ListNode,
  ListItemNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  SectionNode,
  TrackedChangeNode,
  InlineNode,
  TextSpan,
  ImageNode,
  NoteNode,
  BookmarkNode,
  FieldNode,
  SpanStyle,
  CellStyle,
  RowStyle,
  BorderStyle,
  ParagraphStyle,
  PageLayout,
];

/** odf-kit/ods-reader — 8 type-only exports (11 census − 3 runtime). */
export type _OdsReaderTypes = [
  OdsDocumentModel,
  OdsMetadata,
  OdsSheetModel,
  OdsRowModel,
  OdsCellModel,
  OdsCellFormatting,
  ReadOdsOptions,
  OdsHtmlOptions,
];

/** Single-type and small legacy rows. */
export type _MarkdownTypes = [MarkdownEmitOptions];
export type _TypstTypes = [TypstEmitOptions];
export type _LexicalTypes = [
  LexicalToOdtOptions,
  LexicalSerializedEditorState,
  LexicalSerializedNode,
];
export type _DocxTypes = [DocxToOdtOptions, DocxToOdtResult];

/**
 * odf-kit/xlsx — 5 type-only exports (8 census − 3 runtime).
 * T4: amendments-2 item 1 — these four workbook model types plus readXlsx
 * are what v3's sketch would have dropped.
 */
export type _XlsxTypes = [XlsxToOdsOptions, XlsxWorkbook, XlsxSheet, XlsxRow, XlsxCell];

/**
 * Root contract types. T4: amendments-2 item 2 — ParsedHtmlTree, Parser and
 * Normalizer are three of the six symbols v3's replacement root omitted.
 */
export type _RootContractTypes = [ParsedHtmlTree, Parser, Normalizer, MetadataOptions];
