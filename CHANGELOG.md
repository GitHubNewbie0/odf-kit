# Changelog

All notable changes to odf-kit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.13.9] - 2026-06-29

### Fixed

- **Table heading rows dropped on read** — when reading ODT, `readOdt()` and `odtToHtml()` silently discarded table heading rows (the rows marked by LibreOffice Writer's "Repeat heading rows after page break", stored in ODF as `<table:table-header-rows>`). The same table converted correctly when the heading row was left unmarked, but vanished entirely once it was marked. The reader's table parser only iterated `<table:table-row>` elements that were direct children of `<table:table>`, so rows nested inside the `<table:table-header-rows>` wrapper were never visited and were dropped. The parser now collects rows recursively, descending through `table:table-header-rows`, `table:table-row-group`, and `table:table-rows`, and column definitions through `table:table-columns`, `table:table-column-group`, and `table:table-header-columns`. Heading rows are flagged and rendered into `<thead>` with `<th scope="col">` cells; tables with no heading rows render exactly as before. Covered by parser and renderer regression tests. Fixes [#51](https://github.com/GitHubNewbie0/odf-kit/issues/51). Thanks to [@wheymann](https://github.com/wheymann) for the report.

### Added

- **`isHeader` field on `TableRowNode`** — the reader's table row model gains `isHeader: boolean`, true for rows originating from a `<table:table-header-rows>` wrapper, mirroring `DocxTableRow.isHeader` in the DOCX reader. Additive for consumers reading the model — no breaking changes.

## [0.13.8] - 2026-06-17

### Fixed

- **Block content inside table cells dropped on read** — when reading ODT, `readOdt()` and `odtToHtml()` silently discarded any block-level content inside a `<table:table-cell>` other than paragraphs. Lists, headings, nested tables, and the boundaries between multiple paragraphs in a cell did not appear in the output. The reader modeled a cell as flattened inline content only, so block children had no representation and were dropped during the parser's cell walk. Cells now carry full block content and are parsed and rendered through the same path used for the document body, so a list (or heading, or nested table) inside a cell converts the same as it would anywhere else. Covered by a regression test against a real LibreOffice document with list, heading, multi-paragraph, and nested-table cells. Fixes [#45](https://github.com/GitHubNewbie0/odf-kit/issues/45). Thanks to [@wheymann](https://github.com/wheymann) for the report.

### Added

- **`body` field on `TableCellNode`** — the reader's table cell model gains `body?: BodyNode[]`, the faithful block-level representation of cell content (paragraphs, headings, lists, nested tables). The existing `spans` field is retained for backward compatibility and derived from `body` (paragraph and heading text; lists and tables have no inline projection). Additive — no breaking changes.

## [0.13.7] - 2026-06-09

### Added

- **`currency:CODE:right` and `currency:CODE:N:right` number formats** — `OdsCellOptions.numberFormat` now accepts an optional `:right` position parameter to place the currency symbol after the value with a non-breaking space (e.g. `1 234,56 €`), matching European typographic convention used in France, Germany, Spain, Italy, Portugal, the Netherlands, and most other Eurozone countries. The reader's reverse-mapping in `readOds()` follows suit: documents with right-positioned currency cells return `numberFormat: "currency:CODE:N:right"`. Default behaviour (`currency:EUR`, `currency:EUR:2`) is unchanged — symbol remains on the left for backward compatibility. Fixes [#44](https://github.com/GitHubNewbie0/odf-kit/issues/44). Thanks to [@pascal-brand38](https://github.com/pascal-brand38) for the report.

## [0.13.6] - 2026-06-08

### Fixed

- **XLSX→ODS formula cell interface mismatch** — `xlsxToOds()` now correctly round-trips formula cells. Previously, the cached numeric result ended up in `table:formula` (e.g. `of:3`) and `office:value` was hardcoded to `0`, producing spec-invalid XML that LibreOffice masked by evaluating the cached result as a constant. The converter now maps the cached result to the correct ODS value type (`float`, `string`, `boolean`, or `date`) and passes the formula expression separately, so `table:formula` holds the expression (e.g. `of:=SUM(1,2)`) and `office:value` holds the cached result (e.g. `3`). Fixes [#25](https://github.com/GitHubNewbie0/odf-kit/issues/25).
- **`formula` field added to `OdsCellObject` and `OdsCellData`** — formula cells can now be constructed directly: `{ value: 3, type: "float", formula: "=SUM(A1:A2)" }`. The existing `{ value: "=SUM(A1:A2)", type: "formula" }` shorthand is preserved for backward compatibility.

### Internal

- Dependency updates: `typescript-eslint` 8.60.0→8.60.1, `vnu-jar` 26.5.22→26.5.29, `eslint` 10.4.0→10.4.1. CI action bumps: `actions/configure-pages` 5→6, `actions/upload-pages-artifact` 3→5, `actions/deploy-pages` 4→5. `homepage`, `bugs`, and `engines` fields added to `package.json`. New GitLab release workflow.

## [0.13.5] - 2026-06-04

### Fixed

- **Landscape orientation produced portrait dimensions** — `htmlToOdt()`, `markdownToOdt()`, `lexicalToOdt()`, and `tiptapToOdt()` previously resolved a portrait preset and passed portrait width/height to `setPageLayout` alongside `orientation: 'landscape'`. The result: `styles.xml` emitted `style:print-orientation='landscape'` but kept `fo:page-width`/`fo:page-height` in portrait order, and LibreOffice and Word opened the resulting documents in portrait. `buildStylesConfig()` now swaps resolved dimensions when `isLandscape && width<height`, completing the existing swap-when-absent logic. Reported by the community against v0.13.4. 7 regression tests added (1340→1347).
- **Spinner hidden on initial load** of five standalone tool pages (`odt-to-pdf`, `odt-to-html`, `odt-to-markdown`, `ods-to-html`, `xlsx-to-ods`) — the "Converting…" spinner was visible on page load before any user action.

### Added

- **`LexicalToOdtOptions.orientation`** — was missing from the public API; lexical landscape was inaccessible alongside being broken at the styles.xml layer. Now exposed alongside the dimension fix above.

### Internal

- ESLint 10 migration; `sideEffects: false` declared in `package.json`; unified tool page scaffolding (States A/B/C, popup infrastructure, sample loading, error popup, HTML→ODT, markdown→ODT, lexical→ODT, and tiptap→ODT pathways wired); CodeQL ReDoS and XSS-via-exception fixes; `SECURITY.md` and `CONTRIBUTING.md` added for openCode badge eligibility; GitHub Actions workflow to auto-sync `main` to `gitlab.opencode.de`; GitLab sync hardened with idempotent remote and retry/backoff. Multiple Dependabot patch updates.

## [0.13.4] - 2026-05-05

### Added

- **`VERSION` runtime export** — odf-kit now exports a `VERSION` constant from the root entry point and from all 11 published sub-paths (`/odt`, `/reader`, `/ods`, `/ods-reader`, `/xlsx`, `/template`, `/typst`, `/docx`, `/markdown`, `/lexical`, `/html-normalizer`). Allows runtime consumers to determine which version of odf-kit they have loaded — useful for error reporting, telemetry, and feature detection. The constant's value is automatically derived from `package.json` at build time, so it stays in lockstep with the package version with no manual sync. Importing example: `import { VERSION } from "odf-kit"` (or from any sub-path).

### Changed

- **Tool page error reports now include the actual loaded version** — the live tool pages on githubnewbie0.github.io/odf-kit/tools/ no longer ship a hardcoded version string in their error-reporting code. Each page now imports `VERSION` from the same odf-kit module it uses for conversion, ensuring error reports always reflect the version of the code that ran. Previously, the displayed "Version: x.y.z" in auto-generated GitHub issues could lag behind the actual loaded code by several patch versions (see issue #10).
- **Landing page hero badge** is also now derived from `package.json` at build time and stays in sync with each release. No more stale badge versions on the landing page.

### Internal

- **`scripts/sync-version.js`** — new pre-build/prepare hook script. Reads `package.json` and writes `src/version.ts` (gitignored, regenerated on every build) plus updates the hero badge in `docs/index.html`. Wired into `npm run build` (so the generated TS file is up-to-date before `tsc` runs) and into `npm run prepare` (so fresh clones have the generated file before running `tsc` directly). Single source of truth for the version string going forward.

## [0.13.3] - 2026-05-04

### Fixed

- **Dependabot alert: marked OOM DoS** — bumped `marked` from 18.0.0 to 18.0.3 to address [GHSA — Marked Vulnerable to OOM Denial of Service via Infinite Recursion in marked Tokenizer](https://github.com/GitHubNewbie0/odf-kit/security/dependabot/26). The vulnerability allowed a 3-byte input sequence (`\x09\x0b\n`) to trigger infinite recursion in the marked tokenizer, leading to memory exhaustion and process crash. Affected applications using `markdownToOdt()` with untrusted Markdown input. Patched in marked 18.0.2; odf-kit v0.13.3 ships with marked 18.0.3 (the latest 18.x patch).

### Added

- **Dependabot version updates** — `.github/dependabot.yml` configures weekly automated PRs for npm dependency updates and monthly PRs for GitHub Actions version updates. Reduces lag between dependency patches and odf-kit lockfile updates. No effect on end-users.

## [0.13.2] - 2026-05-04

### Added

- **HTML5 normalizer for `htmlToOdt()`** — `htmlToOdt()`, `markdownToOdt()`, and the underlying `parseHtml()` now run input through a Tier 1 normalizer before parsing. The normalizer applies seven spec-grounded text transformations: empties `<script>` and `<style>` content; lowercases the doctype declaration; quotes unquoted boolean attributes (e.g. `<input checked>` → `<input checked="">`); quotes unquoted attribute values (e.g. `<a href=foo>` → `<a href="foo">`); self-closes 14 HTML5 void elements; decodes ~2,120 HTML5 named entities to Unicode; and escapes lone `&` in attribute values (e.g. `href="?a=1&b=2"` → `href="?a=1&amp;b=2"`). Good HTML5 input that previously produced silent empty output now converts correctly. Default behaviour for editor-generated polyglot HTML is unchanged — the normalizer is idempotent on already-polyglot input.
- **Substitution architecture** — `htmlToOdt()` and `markdownToOdt()` accept new `normalizer` and `parser` options. Pass `false` to skip normalization (when input is known polyglot/XHTML), or pass a custom function to substitute either stage. `tiptapToOdt()` does not expose these hooks because TipTap input is a JSON tree, not an HTML string. See `ADAPTERS.md` at the repo root for the architecture, naming conventions, and a worked parse5 adapter example.
- **`odfKitNormalizer`** — the default normalizer, exported from the root and from the new `odf-kit/html-normalizer` sub-export. The seven individual rules are also exported: `selfCloseVoidElements`, `decodeNamedEntities`, `emptyRawTextElements`, `lowercaseDoctype`, `quoteUnquotedBooleanAttributes`, `quoteUnquotedAttributeValues`, `escapeAttributeValueAmpersands`.
- **`odfKitParser`** — the default parser (a `Parser`-conforming wrapper around the existing `parseXml`), exported from the root.
- **Public types** — `ParsedHtmlTree`, `Parser`, `Normalizer` exported from the root for adapter authors. `NormalizerOption` and `ParserOption` are available via the `odf-kit/types` path for symmetric architectural use.
- **`OdtBaseOptions`** — base interface with shared fields (page format, orientation, margins, metadata, image resolution). `HtmlToOdtOptions` extends it and adds `normalizer` and `parser`. `TiptapToOdtOptions` extends `OdtBaseOptions` directly. No user-facing API change for code using the existing options.
- **`odf-kit/html-normalizer`** sub-export added.
- **`ADAPTERS.md`** at the repo root — documents the substitution architecture: philosophy, six naming conventions, the two-direction adapter principle, skip semantics, contract specifications, versioning promise, sibling-package design, and a complete worked parse5 adapter example.
- 183 new tests (1307 total, 28 test suites).

### Changed

- **`parseXml` now fails loudly on malformed input** — five tightenings: detects unclosed elements at end-of-input; rejects malformed attribute syntax that the normalizer didn't cover; rejects unescaped `&` in attribute values not followed by a valid XML entity or numeric reference; rejects `]]>` in text content outside CDATA sections; rejects mismatched closing tags. Previous behaviour was silent wrong output. Code that worked in v0.13.1 continues to work in v0.13.2 — the new errors surface latent bugs in inputs that were producing incorrect output. Treat the new errors as bugs in your input that v0.13.2 makes visible.
- **`package.json`** — `lexical` entry in `typesVersions` had a missing leading `./`; corrected.

### Migration

No code changes required for typical users. Default behaviour is preserved for editor-generated and polyglot input, and existing options work unchanged. Three situations may warrant attention:

- If your `htmlToOdt()` calls were silently producing empty or wrong output on hand-written HTML5, v0.13.2 fixes that automatically — the seven-rule normalizer handles void elements, named entities, boolean attributes, unquoted attribute values, ampersands in URLs, and other HTML5-vs-XHTML differences before parsing.
- If your input was triggering one of the malformed-input cases above, you'll now see an explicit error. This is the intended behavior — the previous silent corruption is the bug being fixed.
- If you were calling `tiptapToOdt()` with `normalizer` or `parser` in the options object, those properties were always ignored at runtime and are now compile-time errors. Remove them.

## [0.13.1] - 2026-04-22

### Added

- **`odtToMarkdown()` `embedImages` option** — pass `{ embedImages: true }` to embed images as base64 data URLs (`![alt](data:image/png;base64,...)`) instead of placeholder paths. Produces a fully self-contained Markdown file. Default behaviour unchanged. 4 new tests (1124 total).

## [0.13.0] - 2026-04-20

### Added

- **`htmlToOdt()` image support** — `<img>` elements are now embedded in the output `.odt` file. Base64 data URLs are decoded and embedded automatically. Remote URLs are resolved via the new `images` option (`Record<string, Uint8Array>`) or the new async `fetchImage` callback. Images without a resolution method are skipped silently. Inline images inside paragraphs and standalone block images are both supported. `<figure><img></figure>` is also handled.
- 7 new tests (1120 total, 25 test suites).

## [0.12.3] - 2026-04-18

### Added

- **ODT `settings.xml`** — `OdtDocument.save()` now generates `settings.xml` with sensible default view settings (zoom 100%, single-column layout, print view). LibreOffice requires the `xmlns:ooo` namespace on this file to recognise it as originating from an ODF-aware application.

### Fixed

- **ODT `settings.xml` missing `xmlns:ooo` namespace** — consistent with the ODS fix in v0.12.1.
- 6 new tests (1113 total, 25 test suites).

## [0.12.2] - 2026-04-18

### Internal

- Lexical-to-odt test suite added (29 tests). No user-facing changes.

## [0.12.1] - 2026-04-18

### Fixed

- **ODS freeze rows/columns not working in LibreOffice** — `settings.xml` was missing the `xmlns:ooo="http://openoffice.org/2004/office"` namespace declaration on the root element. LibreOffice uses its presence to recognise the settings file as originating from an ODF-aware application; without it, all view settings including freeze panes are silently ignored. Adding this single declaration resolves freeze rows and columns in LibreOffice 26.2 and earlier.
- 29 new tests (1107 total, 25 test suites).

## [0.12.0] - 2026-04-17

### Added

- **`lexicalToOdt()`** — Convert a Lexical `SerializedEditorState` to a valid `.odt` file. Available via `odf-kit/lexical`. Supports all Lexical node types used by Proton Docs: paragraphs, headings (h1–h6), blockquotes, code blocks, bullet/numbered/check lists, custom-list numbering styles (lower-alpha, upper-alpha, upper-roman), tables (with colSpan/rowSpan), links, autolinks, inline code, images (with async `fetchImage` callback and caption support), horizontal rules, hashtags, and line breaks.
- **`odf-kit/lexical`** sub-export added.
- **`ImageOptions.width` and `ImageOptions.height` made optional** — Previously required strings. Now optional to support images whose natural dimensions are unknown at generation time (e.g. Lexical images with `width: 0` / `height: 0` meaning 'inherit'). Existing callers passing explicit values are unaffected — non-breaking change.
- **`CellBuilder.addLink()`** — Add hyperlink runs inside table cells.
- **`CellBuilder.addLineBreak()`** — Insert line breaks inside table cells.
- **`CellBuilder.addImage()`** — Insert inline images inside table cells.
- **`console` and `atob` declared in `env.d.ts`** — Available in all supported environments (Node.js 22+, browsers, Deno, Bun, Cloudflare Workers).

## [0.11.0] - 2026-04-15

### Added

- **`odtToMarkdown()`** — Convert `.odt` files directly to Markdown. Returns a Markdown string. Available via `odf-kit/markdown`.
- **`modelToMarkdown()`** — Convert a pre-parsed `OdtDocumentModel` to Markdown. Use when you already have a model from `readOdt()` or want to share a single parse across multiple emitters.
- **`odf-kit/markdown`** sub-export added.
- **`MarkdownEmitOptions`** — `flavor: "gfm" | "commonmark"` (default: `"gfm"`) and `trackedChanges: "final" | "original" | "changes"` (default: `"final"`).
- **GFM flavor** — pipe tables with `---` separator row, `~~strikethrough~~`. Compatible with GitHub, GitLab, and most modern Markdown renderers.
- **CommonMark flavor** — tables emitted as plain text rows (no pipe syntax), strikethrough falls back to plain text.
- **Inline coverage:** bold (`**text**`), italic (`_text_`), bold+italic (`**_text_**`), strikethrough (`~~text~~`), underline (`<u>text</u>`), superscript (`<sup>text</sup>`), subscript (`<sub>text</sub>`), hyperlinks (`[text](url)`), hard line breaks (two trailing spaces + newline), images (`![alt](name)` placeholder).
- **Block coverage:** headings (levels 1–6), paragraphs (blank-line separated), unordered lists (`- `), ordered lists (`1. `), nested lists (2-space indent per level), tables (GFM pipe format), sections (body emitted directly), tracked changes.
- 19 new tests (1078 total, 24 test suites).

## [0.10.4] - 2026-04-14

### Fixed

- **ODS freeze rows/columns — `ViewId` and `ActiveTable` missing** — LibreOffice requires a `ViewId` item (`"view1"`) in the view entry and an `ActiveTable` item naming the active sheet. Without both, the entire view configuration is silently ignored and freeze panes have no effect. Both items are now emitted correctly.
- **`typesVersions` dropped in v0.10.3** — The `typesVersions` field added in v0.10.1 was accidentally omitted from the v0.10.3 `package.json`. Restored.
- 6 new freeze pane tests (1059 total).

## [0.10.3] - 2026-04-14

### Changed

- **`module-sync` exports condition added** — All sub-exports now include a `module-sync` condition alongside `import`. This improves compatibility with bundlers (webpack 5, rollup, vite) that need to load ESM packages synchronously in a CJS module graph. The underlying file is unchanged — both `import` and `module-sync` point to the same ESM output. Note: `require()` from a pure CJS Node.js runtime is still not supported; use dynamic `import()` instead.
- **`typesVersions` field added** — Fixes TypeScript sub-export resolution when `moduleResolution` is set to `"node"` (the legacy resolver). Previously, TypeScript could not find type declarations for `odf-kit/ods-reader` and other sub-exports in projects using older `tsconfig.json` settings. All ten sub-exports are now covered.

## [0.10.2] - 2026-04-13

### Fixed

- **ODS freeze rows/columns** — `freezeRows()` and `freezeColumns()` now work correctly in LibreOffice and other ODF-compliant spreadsheet applications. The root cause was a missing `ActiveSplitRange` config item in `settings.xml` — without it, LibreOffice silently ignores the freeze pane entirely. Additionally, both split axes (`HorizontalSplitMode` and `VerticalSplitMode`) and all four position items (`PositionLeft`, `PositionRight`, `PositionTop`, `PositionBottom`) are now always emitted with correct values, matching what LibreOffice itself writes when freezing panes.

## [0.10.1] - 2026-04-13

### Added

- **`typesVersions` field in `package.json`** — fixes TypeScript sub-export resolution when `moduleResolution` is set to `"node"` (the legacy resolver). All ten sub-exports covered.
- **Automatic error reporting to GitHub Issues via Cloudflare Worker** — the unified tool page's error path can now file structured issues automatically.
- **New guide page:** [Convert DOCX to ODT in JavaScript](https://githubnewbie0.github.io/odf-kit/guides/docx-to-odt.html). Landing page rewritten to cover all eleven modes; all 7 tool pages linked from README and landing page footer.

## [0.10.0] - 2026-04-12

### Added

- **`docxToOdt()`** — Convert `.docx` files directly to `.odt`. Pure ESM, zero new dependencies, runs in Node.js 22+ and browsers. No CommonJS, no LibreOffice, no intermediate HTML step. Available via `odf-kit/docx`.
- **Native DOCX parser** — Reads the full DOCX ZIP structure: `word/document.xml`, `word/styles.xml`, `word/numbering.xml`, `word/_rels/document.xml.rels`, `word/footnotes.xml`, `word/endnotes.xml`, `word/header*.xml`, `word/footer*.xml`, `word/settings.xml`, `word/media/*`, `docProps/core.xml`.
- **Content preserved:** paragraphs, headings (style-name and outlineLvl detection), bold, italic, underline, strikethrough, superscript/subscript, small caps, all caps, font size, font family, text color, highlight color, text alignment, paragraph spacing (before/after), line height, indentation (left, right, first-line/hanging), bullet lists, numbered lists (decimal, roman, alpha), nested lists, tables (column widths, merged cells — colSpan and rowSpan, cell background color, vertical alignment), hyperlinks (external and internal anchor), bookmarks (two-pass cross-paragraph resolution), images (actual EMU dimensions, not defaulted to 10cm), page layout (size, margins, orientation from `w:sectPr`), headers and footers, footnotes and endnotes, page breaks, tabs, line breaks, tracked changes (final-text mode — insertions included, deletions skipped).
- **Metadata** — title, creator, description read from `docProps/core.xml` (Dublin Core / OCP core properties).
- **Style inheritance** — `w:basedOn` chain walked at conversion time; each style layer correctly overrides its parent.
- **Complex fields** — `w:fldChar`/`w:instrText` HYPERLINK fields handled via state machine in addition to `w:hyperlink` elements. `w:fldSimple` fields (including in headers/footers) also handled.
- **`w:pict` legacy VML images** — Dimensions parsed from `v:shape style` attribute; image bytes loaded via `v:imagedata r:id`.
- **`w:sdt` structured document tags** — Always unwrapped and processed; checkboxes rendered as ☐/☑.
- **`pageBreakBefore`** paragraph property respected — emits a page break before the affected paragraph.
- **`DocxToOdtOptions`** — `pageFormat`, `orientation`, `preservePageLayout` (default: true), `styleMap` (custom style name → heading level), `metadata` override.
- **`DocxToOdtResult`** — `{ bytes: Uint8Array, warnings: string[] }`. Warnings report content that could not be fully converted (unrecognised fields, missing images, mid-document section breaks, etc.).
- **`odf-kit/docx`** sub-export added.
- **Deprecates** `@odf-kit/docx-to-odt` (CommonJS, browser-incompatible) — use `odf-kit/docx` instead.
- Spec-validated against ECMA-376 5th edition Part 1 (WordprocessingML). Every XSD schema element verified against the authoritative spec PDF.
- 117 new tests (1053 total, 23 test suites).

## [0.9.9] - 2026-04-11

### Added

- **`xlsxToOds()`** — Convert an `.xlsx` file to an `.ods` file. Available via `odf-kit/xlsx`. Zero new dependencies — parses XLSX XML directly using fflate (already present) and odf-kit's existing XML parser.
- **XLSX parser** — Reads `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/sharedStrings.xml`, `xl/styles.xml`, and `xl/worksheets/sheet*.xml`. No dependency on SheetJS or any external library.
- **Cell types supported:** string, number, boolean, date (with Excel serial → `Date` conversion including Lotus 1900 leap year bug correction), formula (cached result + formula string), error (as string).
- **Date detection** — Built-in XLSX date format IDs (14–17, 22, 27–36, 45–47, 50–58) plus custom format code analysis.
- **Merged cells** — `colSpan`/`rowSpan` preserved via `<mergeCells>` parsing.
- **Freeze rows/columns** — Detected from `<pane state="frozen">` in sheet XML.
- **Multi-sheet workbooks** — All sheets converted in tab order.
- **`readXlsx()`** — Lower-level function returning an `XlsxWorkbook` intermediate model. Exported from `odf-kit/xlsx` for callers who need the parsed model directly.
- **`odf-kit/xlsx`** sub-export added.
- Supports `.xlsx` and `.xlsm` (macro-enabled, same XML structure). Does not support legacy `.xls` (binary) or `.xlsb` (binary XML).
- 47 new tests (936 total).

## [0.9.8] - 2026-04-10

### Added

- **`readOds()`** — Parse an ODS file into a structured `OdsDocumentModel`. Returns typed JavaScript values — `string`, `number`, `boolean`, `Date` — never display-formatted strings. Available via `odf-kit/ods-reader`.
- **`odsToHtml()`** — Convert an ODS file directly to an HTML string. Each sheet rendered as a `<table>` with inline styles. Available via `odf-kit/ods-reader`.
- **`OdsDocumentModel`** — sheets → rows → cells with `value`, `type`, `formula?`, `displayText?`, `colSpan?`, `rowSpan?`, `formatting?`.
- **Cell types:** `"string"`, `"float"`, `"date"`, `"boolean"`, `"formula"`, `"empty"`, `"covered"`.
- **Formula cells** — `value` is the cached result, `formula` is the original formula string (e.g. `"=SUM(A1:A10)"`).
- **Merged cell handling** — primary cell has `colSpan`/`rowSpan`, covered cells have `type: "covered"` and `value: null` at correct physical column indices.
- **Cell formatting** — `OdsCellFormatting` with bold, italic, underline, fontSize, fontFamily, color, backgroundColor, textAlign, verticalAlign, numberFormat, dateFormat. Set `includeFormatting: false` for faster parsing when only values are needed.
- **Sheet metadata** — tab color, freeze rows/columns read from settings.xml.
- **Document metadata** — title, creator, description from meta.xml.
- **`odf-kit/ods-reader`** sub-export added.
- **`odf-kit/odt-reader`** alias added for `odf-kit/reader` — consistent naming with `odf-kit/ods-reader`.
- 40 new tests (889 total).

## [0.9.7] - 2026-04-10

### Added

- **Number formats** — `numberFormat` option on `OdsCellOptions` for professional numeric display. Formats: `"integer"` (1,234), `"decimal:N"` (1,234.56), `"percentage"` / `"percentage:N"` (12.34%), `"currency:CODE"` / `"currency:CODE:N"` (€1,234.56). Applies at row level (default for all cells) or per cell. Style deduplication — identical formats share one ODF style element.
- **Percentage cells** — `type: "percentage"` on `OdsCellObject`. Stores raw decimal, displays as percentage.
- **Currency cells** — `type: "currency"` on `OdsCellObject` with `numberFormat: "currency:CODE"`. Supports 30+ ISO 4217 currency codes with correct symbols.
- **Merged cells** — `colSpan` and `rowSpan` on `OdsCellObject`. Automatically emits `table:covered-table-cell` elements for spanned positions. Supports combined colSpan + rowSpan and merges at any column position.
- **Freeze rows/columns** — `sheet.freezeRows(N)` and `sheet.freezeColumns(N)` on `OdsSheet`. Generates `settings.xml` in the ODS ZIP with LibreOffice-compatible freeze configuration. `settings.xml` only emitted when at least one sheet has freeze settings.
- **Hyperlinks in ODS cells** — `href` on `OdsCellObject`. Cell text rendered as `text:a` link with `xlink:href`. `xmlns:xlink` namespace declared on document root.
- **Sheet tab color** — `sheet.setTabColor(color)` on `OdsSheet`. Accepts hex (`"#FF0000"`) or CSS named colors. Emits `table:tab-color` on the sheet's table style.
- **`OdsCellType`** exported from public API.
- 32 new tests (849 total).

## [0.9.6] - 2026-04-10

### Added

- **`tiptapToOdt()`** — Convert TipTap/ProseMirror JSON directly to ODT. Accepts the JSON object returned by `editor.getJSON()` in TipTap and returns a valid `.odt` file as `Uint8Array`. No dependency on `@tiptap/core` — walks the JSON tree as a plain object.
- **Supported block nodes:** `doc`, `paragraph`, `heading` (levels 1–6), `bulletList`, `orderedList`, `listItem` (nested), `blockquote`, `codeBlock`, `horizontalRule`, `hardBreak`, `image`, `table`, `tableRow`, `tableCell`, `tableHeader`.
- **Supported marks:** `bold`, `italic`, `underline`, `strike`, `code`, `link`, `textStyle` (color, fontSize, fontFamily), `highlight`, `superscript`, `subscript`.
- **Image support:** Data URIs decoded and embedded directly. Other URLs looked up in the `images` option (`Record<src, Uint8Array>`). Unknown URLs emit a placeholder paragraph.
- **`unknownNodeHandler`** callback in `TiptapToOdtOptions` — handle custom TipTap extensions without waiting for odf-kit to add support.
- **`TiptapNode`**, **`TiptapMark`**, **`TiptapToOdtOptions`** types exported.
- All `HtmlToOdtOptions` apply (page format, margins, orientation, metadata).
- 31 new tests (817 total).

## [0.9.5] - 2026-04-09

### Added

- **`markdownToOdt()`** — Convert Markdown directly to ODT. Accepts any CommonMark Markdown string and returns a valid `.odt` file as `Uint8Array`. Supports all `HtmlToOdtOptions` (page format, margins, orientation, metadata). Internally converts Markdown → HTML via `marked`, then HTML → ODT via `htmlToOdt()`.
- **`marked`** added as first runtime dependency (23kB, zero transitive dependencies).
- 17 new tests.

## [0.9.4] - 2026-04-06

### Fixed

- **ODS datetime detection** — `Date` objects with a nonzero UTC time component now render as datetime (`YYYY-MM-DDTHH:MM:SS`) rather than date-only (`YYYY-MM-DD`). Auto-detected: if `getUTCHours()`, `getUTCMinutes()`, `getUTCSeconds()`, or `getUTCMilliseconds()` are nonzero, the cell uses `office:date-value` with full datetime format and a matching `number:date-style`.
- **ODS formula namespace** — Added `xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2"` to the `office:document-content` root element. Previously the `of:` prefix used in formula values was undeclared, causing LibreOffice to display `Err:510` in formula cells.

## [0.9.3] - 2026-04-04

### Notes

- Same-day re-publish of v0.9.2 with no functional changes. The user-facing additions (`htmlToOdt()`, `addLineBreak()`, `ParagraphOptions.borderBottom`) are documented under v0.9.2.

## [0.9.2] - 2026-04-05

### Added

- **`htmlToOdt()`** — Convert HTML to ODT. Accepts any HTML string (full document or fragment) and returns a valid `.odt` file as `Uint8Array`. Supports headings (h1–h6), paragraphs, bold, italic, underline, strikethrough, lists (ordered and unordered, nested), tables, hyperlinks, blockquotes, code blocks, horizontal rules, and inline CSS (color, font-size, font-family, text-align, background-color on cells).
- **Page format presets** — `A4` (default), `letter`, `legal`, `A3`, `A5`. Individual margin overrides apply on top of preset defaults.
- **`HtmlToOdtOptions`** — `pageFormat`, `orientation`, `marginTop/Bottom/Left/Right`, `metadata` (title, creator, description).
- **`addLineBreak()`** on `ParagraphBuilder` — inserts a `text:line-break` within a paragraph.
- **`borderBottom`** on `ParagraphOptions` — bottom border on a paragraph (useful for horizontal rules and section dividers).
- 62 new tests (769 total).

## [0.9.1] - 2026-04-04

### Fixed

- Added `"./ods"` sub-export to `package.json` exports map. v0.9.0 was published without this entry, making `import { OdsDocument } from "odf-kit/ods"` fail with a module resolution error.

## [0.9.0] - 2026-04-04

### Added

- **ODS spreadsheet generation** — `OdsDocument` and `OdsSheet` for creating `.ods` files.
- **`OdsDocument`** — `addSheet(name)`, `setDateFormat()`, `save()`.
- **`OdsSheet`** — `addRow(values, options?)`, `setColumnWidth(index, width)`, `setRowHeight(index, height)`.
- **Auto-typed cells** — `number` → float, `Date` → date, `boolean` → boolean, `null`/`undefined` → empty. String values are always string type; formula cells require explicit `{ value, type: "formula" }`.
- **Date formatting** — Three built-in formats: `"YYYY-MM-DD"` (ISO, default), `"DD/MM/YYYY"` (European), `"MM/DD/YYYY"` (US). Set document-level default via `setDateFormat()` or override per-cell via `dateFormat` in cell options.
- **Cell formatting** — `bold`, `italic`, `fontSize`, `fontFamily`, `color`, `backgroundColor`, `border`, `borderTop/Bottom/Left/Right`, `align`, `verticalAlign`, `padding`, `wrap`.
- **Row formatting** — Pass formatting options as second argument to `addRow()` — applies to all cells in the row as defaults. Cell-level options override row defaults.
- **Multiple sheets** — `addSheet()` creates additional tabs.
- **Style deduplication** — Identical cell styles across all sheets share a single ODF style element.
- **Package restructure** — New sub-exports: `odf-kit/odt`, `odf-kit/ods`, `odf-kit/template`, `odf-kit/reader`, `odf-kit/typst`. Existing `import { OdtDocument } from "odf-kit"` continues to work unchanged.
- 57 new tests (707 total).

## [0.8.5] - 2026-03-30

### Fixed

- **CodeQL security alerts** in template and reader modules.

## [0.8.4] - 2026-04-03

### Fixed

- **ReDoS in healer/replacer** — Replaced catastrophic backtracking regex patterns with linear alternatives.
- **Double-escaping in xml-parser** — Fixed entity double-encoding when parsing XML with pre-escaped content.
- **CI permissions** — Tightened GitHub Actions workflow permissions.

## [0.8.3] - 2026-03-26

### Added

- **Image wrap mode** — `wrapMode: "left" | "right" | "none"` on `ImageOptions`. Left/right wrap positions the image with text flowing around it. Requires graphic style subsystem (new in this release).
- **Image margins** — `marginTop`, `marginBottom`, `marginLeft`, `marginRight` on `ImageOptions`.
- **Image border** — `border` on `ImageOptions` (CSS shorthand, e.g. `"0.5pt solid #000000"`).
- **Image opacity** — `opacity` on `ImageOptions` (0–1).

## [0.8.2] - 2026-03-26

### Added

- **Image accessibility** — `alt` → `<svg:title>`, `description` → `<svg:desc>` inside `draw:frame`.
- **`name`** override for `draw:name` on images.
- **`anchor: "page"`** support on `ImageOptions`.
- 6 new tests.

## [0.8.1] - 2026-03-20

### Changed

- **README overhaul** — Full rewrite covering all four modes (build, fill, read, typst). Added Guides section with links to all guide and tool pages.
- Fixed `package.json` description field.
- Fixed dev vulnerabilities (ajv, flatted).

## [0.8.0] - 2026-03-20

### Added

- **Typst emitter** — `odtToTypst()` and `modelToTypst()` via new `odf-kit/typst` sub-export. Converts ODT files to [Typst](https://typst.app) markup. Zero-dependency, pure TypeScript, browser-safe. Returns a `.typ` string.

## [0.7.0] - 2026-03-15

### Added

- **ODT reader** — `readOdt()` parses `.odt` files into a structured `OdtDocumentModel`. Tier 1 (raw XML), Tier 2 (semantic model), and Tier 3 (rendered output). Available via `odf-kit/reader`.
- **`odtToHtml()`** — Convert ODT to an HTML string.
- **HTML renderer** — Full fidelity rendering of headings, paragraphs, formatting, lists, tables, images (as base64 data URIs), hyperlinks.

### Changed
- **`BodyNode` discriminated union expanded** (TypeScript-level breaking change): `SectionNode` and `TrackedChangeNode` added as new members. Consumer code performing exhaustive switches on `BodyNode.kind` without a `default:` clause will fail to compile until those cases are handled. No runtime behavior change. Minor version bump per pre-1.0 semver convention.

## [0.6.0] - 2026-03-15

### Added

- **ODT reader Tier 2 — styled HTML output** — Colors, fonts, images, notes, bookmarks, and field references now flow through to the rendered HTML. Significant fidelity improvement over the Tier 1 output shipped in v0.5.0.

## [0.5.2] - 2026-03-07

### Fixed

- **Reader: paragraph-level bold/italic now applied** — `styles.xml` is now integrated with `content.xml` style resolution.

## [0.5.1] - 2026-03-06

### Fixed

- **Template engine** — 7 bug fixes: tag boundary parsing, nested empty spans, meta.xml processing.
- **Reader** — 7 bug fixes: single-quoted attributes, numeric character references, CharStyle tri-state, styles.xml integration, HTML5 charset handling.

### Added

- **OASIS ODF Validator in CI** — generated output is now validated against the ODF spec on every push. 410 tests passing.

## [0.5.0] - 2026-03-06

### Added

- **ODT reader (Tier 1)** — `readOdt()` and `odtToHtml()`, available via the new `odf-kit/reader` sub-export. Tier 1 returns the raw XML model; Tier 2 (styled HTML) follows in v0.6.0; Tier 3 (full fidelity) follows in v0.7.0.
- New guide pages: browser usage, government usage, docxtemplater comparison, LibreOffice alternatives.
- `robots.txt` and updated sitemap.

## [0.4.0] - 2026-03-02

### Added

- **Browser support** — odf-kit now runs in browsers in addition to Node.js. Required minor build configuration changes (`env.d.ts` for DOM globals, dual tsconfig setup for source vs tests). README updated with browser usage examples. Browser-test fixture added under `browser-test/`.

## [0.3.0] - 2026-02-23

### Added

- **Template engine** — Fill existing `.odt` templates with data using `fillTemplate()`. Replaces `{placeholders}` with values from a data object.
- **Simple replacement** — `{tag}` placeholders with automatic XML escaping.
- **Loops** — `{#items}...{/items}` repeats content for each array item.
- **Conditionals** — `{#showSection}...{/showSection}` includes or removes content.
- **Dot notation** — `{user.address.city}` resolves nested object paths.
- **Placeholder healer** — Reassembles placeholders fragmented by LibreOffice across multiple `<text:span>` elements.
- **Header/footer templates** — Placeholders in `styles.xml` processed alongside `content.xml`.
- 120 new tests (222 total).

## [0.2.0] - 2026-02-23

### Added

- **Advanced text formatting** — Underline, strikethrough, superscript, subscript, highlight color (hex and named CSS colors).
- **Hyperlinks** — External URLs (`https://...`) and internal bookmark links (`#name`). Optional text formatting on links.
- **Bookmarks** — `addBookmark(name)` on `ParagraphBuilder`.
- **Images** — Embedded PNG, JPEG, GIF, SVG, WebP, BMP, TIFF. Standalone (paragraph anchor) or inline (as-character). Stored in ZIP under `Pictures/` with correct MIME types in manifest.
- **`draw` and `xlink` namespaces** added to content.xml.

### Changed

- **Replaced jszip with fflate** — Zero transitive runtime dependencies. Faster, smaller (~8kB). MIT license.

## [0.1.0] - 2026-02-11

Initial release. Complete ODT generation support.

### Added

- Core ODF ZIP packaging, XML generation, namespace management, manifest, metadata.
- Paragraphs, headings (levels 1–6), text formatting (bold, italic, font size, color).
- Tables, page layout, headers/footers, page breaks, lists, tab stops.
- Method chaining. Full TypeScript types. ESM-only, Node.js 22+. 102 tests.

[Unreleased]: https://github.com/GitHubNewbie0/odf-kit/compare/v0.13.9...HEAD
[0.13.9]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.13.9
[0.13.8]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.13.8
[0.13.7]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.13.7
[0.13.6]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.13.6
[0.13.5]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.13.5
[0.13.4]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.13.4
[0.13.3]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.13.3
[0.13.2]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.13.2
[0.13.1]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.13.1
[0.13.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.13.0
[0.12.3]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.12.3
[0.12.2]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.12.2
[0.12.1]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.12.1
[0.12.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.12.0
[0.11.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.11.0
[0.10.4]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.10.4
[0.10.3]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.10.3
[0.10.2]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.10.2
[0.10.1]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.10.1
[0.10.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.10.0
[0.9.9]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.9
[0.9.8]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.8
[0.9.7]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.7
[0.9.6]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.6
[0.9.5]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.5
[0.9.4]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.4
[0.9.3]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.3
[0.9.2]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.2
[0.9.1]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.1
[0.9.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.0
[0.8.5]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.8.5
[0.8.4]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.8.4
[0.8.3]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.8.3
[0.8.2]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.8.2
[0.8.1]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.8.1
[0.8.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.8.0
[0.7.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.7.0
[0.6.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.6.0
[0.5.2]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.5.2
[0.5.1]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.5.1
[0.5.0]: https://www.npmjs.com/package/odf-kit/v/0.5.0
[0.4.0]: https://www.npmjs.com/package/odf-kit/v/0.4.0
[0.3.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.3.0
[0.2.0]: https://www.npmjs.com/package/odf-kit/v/0.2.0
[0.1.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.1.0