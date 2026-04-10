# Changelog

All notable changes to odf-kit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [0.4.0] - 2026-03-05

### Added

- **Advanced text formatting** — Underline, strikethrough, superscript, subscript, highlight color (hex and named CSS colors).
- **Hyperlinks** — External URLs (`https://...`) and internal bookmark links (`#name`). Optional text formatting on links.
- **Bookmarks** — `addBookmark(name)` on `ParagraphBuilder`.
- **Images** — Embedded PNG, JPEG, GIF, SVG, WebP, BMP, TIFF. Standalone (paragraph anchor) or inline (as-character). Stored in ZIP under `Pictures/` with correct MIME types in manifest.
- **`draw` and `xlink` namespaces** added to content.xml.
- 109 new tests.

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

## [0.2.0] - 2026-02-21

### Changed

- **Replaced jszip with fflate** — Zero transitive runtime dependencies. Faster, smaller (~8kB). MIT license.

## [0.1.0] - 2026-02-11

Initial release. Complete ODT generation support.

### Added

- Core ODF ZIP packaging, XML generation, namespace management, manifest, metadata.
- Paragraphs, headings (levels 1–6), text formatting (bold, italic, font size, color, etc.).
- Tables, page layout, headers/footers, page breaks, lists, tab stops.
- Method chaining. Full TypeScript types. ESM-only, Node.js 22+. 102 tests.

[0.9.8]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.8
[0.9.7]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.7
[0.9.6]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.6
[0.9.5]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.5
[0.9.4]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.4
[0.9.2]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.2
[0.9.1]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.1
[0.9.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.9.0
[0.8.4]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.8.4
[0.8.3]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.8.3
[0.8.2]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.8.2
[0.8.1]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.8.1
[0.8.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.8.0
[0.7.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.7.0
[0.4.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.4.0
[0.3.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.3.0
[0.2.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.2.0
[0.1.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.1.0
