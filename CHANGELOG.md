# Changelog

All notable changes to odf-kit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-02-23

Template engine.

### Added

- **Template engine** — Fill existing `.odt` templates with data using `fillTemplate()`. Load a `.odt` file created in LibreOffice, replace `{placeholders}` with values from a JSON/object data source, and get a new `.odt` file back.
- **Simple replacement** — `{tag}` placeholders replaced with values, with automatic XML escaping of `& < > " '`
- **Loops** — `{#items}...{/items}` repeats content for each item in an array. Items inherit parent data; item properties override.
- **Conditionals** — `{#showSection}...{/showSection}` includes or removes content based on truthy/falsy values.
- **Dot notation** — `{user.address.city}` resolves nested object paths.
- **Placeholder healer** — Automatically reassembles placeholders that LibreOffice fragments across multiple `<text:span>` elements. Handles 2-span, multi-span, every-character, shared-segment, and bare-text fragmentation patterns. Removes editing artifacts (`<text:s/>`, `<text:bookmark/>`) trapped inside fragments.
- **Boundary expansion** — Section markers (`{#tag}`, `{/tag}`) expand outward through wrapping XML elements to prevent orphaned empty tags after removal.
- **Header/footer templates** — Placeholders in `styles.xml` (headers and footers) are processed alongside `content.xml`.
- **120 new tests** — healer (51), replacer (56), template pipeline and integration (13). Total: 222 tests.

### Credits

Template syntax follows [Mustache](https://mustache.github.io/) conventions (`{tag}`, `{#section}{/section}`), proven in document templating by [docxtemplater](https://docxtemplater.com/). odf-kit's template engine is a clean-room implementation purpose-built for ODF — no code from either project was used.

## [0.2.0] - 2026-02-21

Zero-dependency migration.

### Changed

- **Replaced jszip with fflate** — Zero transitive runtime dependencies. Faster compression/decompression, smaller bundle (~8kB). MIT license.
- All 102 existing tests re-validated with fflate. Generated files verified in LibreOffice.

## [0.1.0] - 2026-02-11

Initial release. Complete ODT (text document) support.

### Added

- **Core** — ODF ZIP packaging (mimetype stored uncompressed as first entry), XML generation, namespace management, manifest, metadata
- **Paragraphs and headings** — Plain text or formatted via builder callback, heading levels 1–6
- **Text formatting** — Bold, italic, underline, strikethrough, superscript, subscript, font size, font family, text color, highlight color. Boolean shortcuts (`bold: true`) and CSS-style properties (`fontWeight: "bold"`) both accepted. Style deduplication for identical formatting.
- **Tables** — Array-of-arrays for simple tables, builder callback for full control. Column widths, cell borders (table-level, cell-level, per-side), background colors (hex and named CSS colors), cell merging (colSpan/rowSpan), rich text in cells.
- **Page layout** — Page size (A4 default), margins, orientation (portrait/landscape). Landscape auto-swaps A4 dimensions.
- **Headers and footers** — Plain text (with `###` for page numbers) or formatted via builder callback with `addPageNumber()`.
- **Page breaks** — `addPageBreak()` inserts a new page.
- **Lists** — Bullet and numbered lists. String array for simple lists, builder callback for formatting and nesting (up to 6 levels).
- **Tab stops** — Left, center, right alignment with configurable positions.
- **Images** — Embedded PNG, JPEG, GIF, SVG, WebP, BMP, TIFF. Standalone (paragraph anchor) or inline (as-character anchor). Images stored in ZIP under `Pictures/` with correct MIME types in manifest.
- **Hyperlinks** — External URLs and internal bookmark links (`#name`). Optional text formatting on links.
- **Bookmarks** — Named anchor points for internal navigation via `addBookmark()`.
- **Method chaining** — All methods return `this` for fluent API usage.
- **TypeScript** — Full type definitions with JSDoc comments. ESM-only, Node.js 22+.
- **Testing** — 102 tests covering all features. Validated against LibreOffice 24.2.

[0.3.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.3.0
[0.2.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.2.0
[0.1.0]: https://github.com/GitHubNewbie0/odf-kit/releases/tag/v0.1.0
