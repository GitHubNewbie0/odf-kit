# odf-kit

Generate, fill, read, and convert OpenDocument Format files (.odt, .ods) in TypeScript and JavaScript. Works in Node.js and browsers. No LibreOffice dependency — pure spec-compliant ODF.

**[Documentation & examples →](https://githubnewbie0.github.io/odf-kit/)**

```bash
npm install odf-kit
```

## Five ways to work with ODF files

```typescript
// 1. Build an ODT document from scratch
import { OdtDocument } from "odf-kit";

const doc = new OdtDocument();
doc.addHeading("Quarterly Report", 1);
doc.addParagraph("Revenue exceeded expectations.");
doc.addTable([
  ["Division", "Q4 Revenue", "Growth"],
  ["North", "$2.1M", "+12%"],
  ["South", "$1.8M", "+8%"],
]);
const bytes = await doc.save();
```

```typescript
// 2. Build an ODS spreadsheet from scratch
import { OdsDocument } from "odf-kit";

const doc = new OdsDocument();
const sheet = doc.addSheet("Sales");
sheet.addRow(["Month", "Revenue", "Growth"], { bold: true, backgroundColor: "#DDDDDD" });
sheet.addRow(["January", 12500, 0.08]);
sheet.addRow(["February", 14200, 0.136]);
sheet.addRow(["Total", { value: "=SUM(B2:B3)", type: "formula" }]);
sheet.setColumnWidth(0, "4cm");
sheet.setColumnWidth(1, "4cm");
const bytes = await doc.save();
```

```typescript
// 3. Fill an existing .odt template with data
import { fillTemplate } from "odf-kit";

const template = readFileSync("invoice-template.odt");
const result = fillTemplate(template, {
  customer: "Acme Corp",
  date: "2026-03-19",
  items: [
    { product: "Widget", qty: 5, price: "$125" },
    { product: "Gadget", qty: 3, price: "$120" },
  ],
  showNotes: true,
  notes: "Net 30",
});
writeFileSync("invoice.odt", result);
```

```typescript
// 4. Read an existing .odt file
import { readOdt, odtToHtml } from "odf-kit/reader";

const bytes = readFileSync("report.odt");
const model = readOdt(bytes);              // structured document model
const html  = odtToHtml(bytes);            // styled HTML string
```

```typescript
// 5. Convert .odt to Typst for PDF generation
import { odtToTypst } from "odf-kit/typst";
import { execSync } from "child_process";

const typst = odtToTypst(readFileSync("letter.odt"));
writeFileSync("letter.typ", typst);
execSync("typst compile letter.typ letter.pdf");
```

---

## Installation

```bash
npm install odf-kit
```

Node.js 22+ required. ESM only. Sub-exports:

```typescript
import { OdtDocument, OdsDocument, fillTemplate } from "odf-kit";   // build + fill
import { readOdt, odtToHtml }                     from "odf-kit/reader"; // read + HTML
import { odtToTypst, modelToTypst }               from "odf-kit/typst";  // Typst/PDF
```

Works in Node.js, browsers, Deno, Bun, and Cloudflare Workers. The only runtime dependency is [fflate](https://github.com/101arrowz/fflate) for ZIP packaging — no transitive dependencies.

---

## Browser usage

odf-kit generates and reads documents entirely client-side. No server required.

```javascript
import { OdtDocument } from "odf-kit";

const doc = new OdtDocument();
doc.addHeading("Generated in the Browser", 1);
doc.addParagraph("Created without any server.");

const bytes = await doc.save();
const blob = new Blob([bytes], { type: "application/vnd.oasis.opendocument.text" });
const url  = URL.createObjectURL(blob);
const a    = document.createElement("a");
a.href     = url;
a.download = "document.odt";
a.click();
URL.revokeObjectURL(url);
```

Template filling and reading work the same way — pass `Uint8Array` bytes from a `<input type="file">` or `fetch()`.

---

## Build: ODT documents

### Text and formatting

```typescript
doc.addHeading("Chapter 1", 1);

doc.addParagraph((p) => {
  p.addText("This is ");
  p.addText("bold",   { bold: true });
  p.addText(", ");
  p.addText("italic", { italic: true });
  p.addText(", and ");
  p.addText("red",    { color: "red", fontSize: 16 });
  p.addText(".");
});

// Scientific notation
doc.addParagraph((p) => {
  p.addText("H");
  p.addText("2", { subscript: true });
  p.addText("O is ");
  p.addText("essential", { underline: true, highlightColor: "yellow" });
});
```

### Tables

```typescript
// Simple
doc.addTable([
  ["Name",  "Age", "City"],
  ["Alice", "30",  "Portland"],
  ["Bob",   "25",  "Seattle"],
]);

// With column widths and borders
doc.addTable([
  ["Product", "Price"],
  ["Widget",  "$9.99"],
], { columnWidths: ["8cm", "4cm"], border: "0.5pt solid #000000" });

// Full control — builder callback
doc.addTable((t) => {
  t.addRow((r) => {
    r.addCell("Name",   { bold: true, backgroundColor: "#DDDDDD" });
    r.addCell("Status", { bold: true, backgroundColor: "#DDDDDD" });
  });
  t.addRow((r) => {
    r.addCell((c) => { c.addText("Project Alpha", { bold: true }); });
    r.addCell("Complete", { color: "green" });
  });
}, { columnWidths: ["8cm", "4cm"] });
```

### Page layout, headers, footers

```typescript
doc.setPageLayout({
  orientation: "landscape",
  marginTop: "1.5cm",
  marginBottom: "1.5cm",
});

doc.setHeader((h) => {
  h.addText("Confidential", { bold: true, color: "gray" });
  h.addText(" — Page ");
  h.addPageNumber();
});

doc.setFooter("© 2026 Acme Corp — Page ###");  // ### = page number

doc.addPageBreak();
```

### Lists

```typescript
doc.addList(["Apples", "Bananas", "Cherries"]);
doc.addList(["First", "Second", "Third"], { type: "numbered" });

// Nested with formatting
doc.addList((l) => {
  l.addItem((p) => {
    p.addText("Important: ", { bold: true });
    p.addText("read the docs");
  });
  l.addItem("Main topic");
  l.addNested((sub) => {
    sub.addItem("Subtopic A");
    sub.addItem("Subtopic B");
  });
});
```

### Images

```typescript
import { readFile } from "fs/promises";

const logo = await readFile("logo.png");

doc.addImage(logo, { width: "10cm", height: "6cm", mimeType: "image/png" });

// Inline image inside a paragraph
doc.addParagraph((p) => {
  p.addText("Logo: ");
  p.addImage(logo, { width: "2cm", height: "1cm", mimeType: "image/png" });
});
```

In a browser, use `fetch()` or a file input instead of `readFile()`:

```javascript
const response = await fetch("logo.png");
const logo = new Uint8Array(await response.arrayBuffer());
```

### Links and bookmarks

```typescript
doc.addParagraph((p) => {
  p.addBookmark("introduction");
  p.addText("Welcome to the guide.");
});

doc.addParagraph((p) => {
  p.addLink("our website", "https://example.com", { bold: true });
  p.addText(" or go back to the ");
  p.addLink("introduction", "#introduction");
});
```

### Tab stops

```typescript
doc.addParagraph((p) => {
  p.addText("Item");  p.addTab();
  p.addText("Qty");   p.addTab();
  p.addText("$100.00");
}, {
  tabStops: [
    { position: "6cm" },
    { position: "12cm", type: "right" },
  ],
});
```

### Method chaining

```typescript
const bytes = await new OdtDocument()
  .setMetadata({ title: "Report" })
  .setPageLayout({ orientation: "landscape" })
  .setHeader("Confidential")
  .setFooter("Page ###")
  .addHeading("Summary", 1)
  .addParagraph("All systems operational.")
  .addTable([["System", "Status"], ["API", "OK"], ["DB", "OK"]])
  .save();
```

---

## Build: ODS spreadsheets

`OdsDocument` generates `.ods` spreadsheet files with multiple sheets, typed cells, formatting, and formulas.

### Cell types

Values are auto-typed from their JavaScript type. Use an explicit `OdsCellObject` when you need formulas or per-cell overrides.

```typescript
import { OdsDocument } from "odf-kit";

const doc = new OdsDocument();
const sheet = doc.addSheet("Data");

sheet.addRow([
  "Text",             // string
  42,                 // float
  new Date("2026-01-15"),  // date
  true,               // boolean
  null,               // empty cell
  { value: "=SUM(B1:B10)", type: "formula" },  // formula — explicit required
]);
```

### Row and cell formatting

Options on `addRow()` apply to all cells in the row. Per-cell options inside an `OdsCellObject` override the row defaults.

```typescript
// Bold header row with background
sheet.addRow(["Month", "Revenue", "Notes"], {
  bold: true,
  backgroundColor: "#DDDDDD",
  align: "center",
});

// Mixed: row default + per-cell override
sheet.addRow([
  "January",
  { value: 12500, type: "float", color: "#006600" },  // green text on this cell only
  "On track",
], { italic: true });
```

Available formatting options: `bold`, `italic`, `fontSize`, `fontFamily`, `color`, `underline`, `backgroundColor`, `border`, `borderTop/Bottom/Left/Right`, `align`, `verticalAlign`, `padding`, `wrap`.

### Date formatting

```typescript
// Document-level default
doc.setDateFormat("DD/MM/YYYY");  // "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY"

// Per-row or per-cell override
sheet.addRow([{ value: new Date("2026-12-25"), type: "date", dateFormat: "MM/DD/YYYY" }]);
```

The `office:date-value` attribute always stores the ISO date — display format is separate.

### Column widths and row heights

```typescript
sheet.setColumnWidth(0, "4cm");
sheet.setColumnWidth(1, "8cm");

sheet.addRow(["Header"]);
sheet.setRowHeight(0, "1.5cm");
```

### Multiple sheets

```typescript
const doc = new OdsDocument();
doc.setMetadata({ title: "Annual Report", creator: "Acme Corp" });

const q1 = doc.addSheet("Q1");
q1.addRow(["Month", "Revenue"], { bold: true });
q1.addRow(["January", 12500]);
q1.addRow(["March", 14800]);

const q2 = doc.addSheet("Q2");
q2.addRow(["Month", "Revenue"], { bold: true });
q2.addRow(["April", 15300]);

const bytes = await doc.save();
```

---

## Fill: template engine

Create a `.odt` template in LibreOffice with `{placeholders}`, then fill it programmatically.

### Simple replacement

```
Dear {name},

Your order #{orderNumber} has shipped to {address}.
```

### Dot notation

```
Company: {company.name}
City: {company.address.city}
```

### Loops

```
{#items}
Product: {product} — Qty: {qty} — Price: {price}
{/items}
```

```typescript
fillTemplate(template, {
  items: [
    { product: "Widget", qty: 5, price: "$125" },
    { product: "Gadget", qty: 3, price: "$120" },
  ],
});
```

### Conditionals

```
{#showDiscount}
You qualify for a {percent}% discount!
{/showDiscount}
```

Falsy values (`false`, `null`, `undefined`, `0`, `""`, `[]`) remove the block. Truthy values include it. Loops and conditionals nest freely.

### How it works

LibreOffice often fragments typed text like `{name}` across multiple XML elements due to editing history or spell check. odf-kit handles this automatically with a two-pass pipeline: first it reassembles fragmented placeholders, then replaces them with data. Headers and footers in `styles.xml` are processed alongside the document body.

Template syntax follows [Mustache](https://mustache.github.io/) conventions, established for document templating by [docxtemplater](https://docxtemplater.com/). odf-kit's engine is a clean-room implementation built for ODF — no code from either project was used.

---

## Read: ODT document model

`odf-kit/reader` parses `.odt` files into a structured model and renders to HTML.

```typescript
import { readOdt, odtToHtml } from "odf-kit/reader";
import { readFileSync } from "fs";

const bytes = readFileSync("report.odt");

// Structured model
const model = readOdt(bytes);
console.log(model.body);        // BodyNode[]
console.log(model.pageLayout);  // PageLayout
console.log(model.header);      // HeaderFooterContent

// Styled HTML
const html = odtToHtml(bytes);

// With tracked changes mode
const final    = odtToHtml(bytes, {}, { trackedChanges: "final" });
const original = odtToHtml(bytes, {}, { trackedChanges: "original" });
const marked   = odtToHtml(bytes, {}, { trackedChanges: "changes" });
```

### What the reader extracts

**Tier 1 — Structure:** paragraphs, headings, tables, lists, images, notes, bookmarks, fields, hyperlinks, tracked changes (all three ODF-defined modes: final/original/changes).

**Tier 2 — Styling:** span styles (bold, italic, font, color, highlight, underline, strikethrough, superscript, subscript), image float/wrap mode, footnotes/endnotes, cell and row background colors, style inheritance and resolution.

**Tier 3 — Layout:** paragraph styles (alignment, margins, padding, line height), table column widths, page geometry (size, margins, orientation), headers and footers (all four zones: default, first page, left/right), sections, tracked change metadata (author, date).

### Document model types

```typescript
import type {
  OdtDocumentModel,
  BodyNode,          // ParagraphNode | HeadingNode | TableNode | ListNode |
                     // ImageNode | SectionNode | TrackedChangeNode
  ParagraphNode,
  HeadingNode,
  TableNode,
  ListNode,
  ImageNode,
  SectionNode,
  TrackedChangeNode,
  InlineNode,        // TextNode | SpanNode | ImageNode | NoteNode |
                     // BookmarkNode | FieldNode | LinkNode
  PageLayout,
  ReadOdtOptions,
} from "odf-kit/reader";
```

---

## Typst: ODT to PDF

`odf-kit/typst` converts `.odt` files to [Typst](https://typst.app/) markup for PDF generation. No LibreOffice, no headless browser — just the Typst CLI.

```typescript
import { odtToTypst, modelToTypst } from "odf-kit/typst";
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

// Convenience wrapper — ODT bytes → Typst string
const typst = odtToTypst(readFileSync("letter.odt"));
writeFileSync("letter.typ", typst);
execSync("typst compile letter.typ letter.pdf");

// From a model (if you already have one from readOdt)
import { readOdt } from "odf-kit/reader";
const model  = readOdt(readFileSync("letter.odt"));
const typst2 = modelToTypst(model);
```

Both functions return a plain string — no filesystem access, no CLI dependency, no side effects. You control how the `.typ` file is compiled. Works in any JavaScript environment including browsers.

### Tracked changes in Typst output

```typescript
import type { TypstEmitOptions } from "odf-kit/typst";

const options: TypstEmitOptions = { trackedChanges: "final" };     // accepted text only
const options2: TypstEmitOptions = { trackedChanges: "original" }; // before changes
const options3: TypstEmitOptions = { trackedChanges: "changes" };  // annotated markup
```

See the [complete ODT to PDF with Typst guide](https://githubnewbie0.github.io/odf-kit/guides/odt-to-typst-pdf.html) for installation, font setup, and real-world examples.

---

## API Reference

### OdtDocument

| Method | Description |
|--------|-------------|
| `setMetadata(options)` | Set title, creator, description |
| `setPageLayout(options)` | Set page size, margins, orientation |
| `setHeader(content)` | Set page header (string or builder) |
| `setFooter(content)` | Set page footer (string or builder) |
| `addHeading(content, level?)` | Add heading (level 1–6) |
| `addParagraph(content, options?)` | Add paragraph (string or builder) |
| `addTable(content, options?)` | Add table (string[][] or builder) |
| `addList(content, options?)` | Add list (string[] or builder) |
| `addImage(data, options)` | Add standalone image |
| `addPageBreak()` | Insert page break |
| `save()` | Generate `.odt` as `Promise<Uint8Array>` |

### OdsDocument

| Method | Description |
|--------|-------------|
| `setMetadata(options)` | Set title, creator, description |
| `setDateFormat(format)` | Set default date display format (`"YYYY-MM-DD"` \| `"DD/MM/YYYY"` \| `"MM/DD/YYYY"`) |
| `addSheet(name)` | Add a sheet tab — returns `OdsSheet` |
| `save()` | Generate `.ods` as `Promise<Uint8Array>` |

### OdsSheet

| Method | Description |
|--------|-------------|
| `addRow(values, options?)` | Add a row of cells with optional formatting defaults |
| `setColumnWidth(colIndex, width)` | Set column width (e.g. `"4cm"`) |
| `setRowHeight(rowIndex, height)` | Set row height (e.g. `"1cm"`) |

### OdsCellValue

```typescript
type OdsCellValue =
  | string          // → string cell
  | number          // → float cell
  | boolean         // → boolean cell
  | Date            // → date cell
  | null            // → empty cell
  | undefined       // → empty cell
  | OdsCellObject;  // → explicit type (required for formulas)

interface OdsCellObject extends OdsCellOptions {
  value: string | number | boolean | Date | null;
  type: "string" | "float" | "date" | "boolean" | "formula";
}
```

### fillTemplate

```typescript
function fillTemplate(templateBytes: Uint8Array, data: TemplateData): Uint8Array
```

`TemplateData` is `Record<string, unknown>` — any JSON-serializable value.

| Syntax | Description |
|--------|-------------|
| `{tag}` | Replace with value |
| `{object.property}` | Dot notation for nested objects |
| `{#tag}...{/tag}` | Loop (array) or conditional (truthy/falsy) |

### readOdt / odtToHtml

```typescript
function readOdt(bytes: Uint8Array, options?: ReadOdtOptions): OdtDocumentModel
function odtToHtml(
  bytes: Uint8Array,
  htmlOptions?: HtmlOptions,
  readOptions?: ReadOdtOptions
): string
```

### odtToTypst / modelToTypst

```typescript
function odtToTypst(bytes: Uint8Array, options?: TypstEmitOptions): string
function modelToTypst(model: OdtDocumentModel, options?: TypstEmitOptions): string
```

### TextFormatting

```typescript
{
  bold?: boolean,
  italic?: boolean,
  fontSize?: number | string,    // 12 or "12pt"
  fontFamily?: string,
  color?: string,                // "#FF0000" or "red"
  underline?: boolean,
  strikethrough?: boolean,
  superscript?: boolean,
  subscript?: boolean,
  highlightColor?: string,
}
```

### TableOptions / CellOptions

```typescript
// TableOptions
{ columnWidths?: string[], border?: string }

// CellOptions (extends TextFormatting)
{
  backgroundColor?: string,
  border?: string,
  borderTop?: string, borderBottom?: string,
  borderLeft?: string, borderRight?: string,
  colSpan?: number,
  rowSpan?: number,
}
```

### PageLayout

```typescript
{
  width?: string,           // "21cm" (A4 default)
  height?: string,          // "29.7cm"
  orientation?: "portrait" | "landscape",
  marginTop?: string,       // "2cm" default
  marginBottom?: string,
  marginLeft?: string,
  marginRight?: string,
}
```

---

## Platform support

| Platform | Support |
|----------|---------|
| Node.js 22+ | ✅ Full |
| Chrome, Firefox, Safari, Edge | ✅ Full |
| Deno, Bun | ✅ Full |
| Cloudflare Workers | ✅ Full |

ESM only. Zero Node-specific APIs in the library source — enforced at the TypeScript level, guaranteeing cross-platform compatibility.

---

## Why odf-kit?

**ODF is the ISO standard (ISO/IEC 26300) for documents.** It's the default format for LibreOffice, mandatory for many governments and public sector organisations, and the best choice for long-term document preservation.

- **Single runtime dependency** — fflate for ZIP. No transitive dependencies.
- **Spec-compliant output** — every generated file passes the OASIS ODF validator. Enforced on every commit by CI.
- **Multiple ODF formats** — ODT documents and ODS spreadsheets from the same library.
- **Five complete capability modes** — build ODT, build ODS, fill templates, read, convert. Not just generation.
- **Zero-dependency Typst emitter** — the only JavaScript library with built-in ODT→Typst conversion for PDF generation.
- **TypeScript-first** — full types across all sub-exports.
- **Apache 2.0** — use freely in commercial and open source projects.

---

## Comparison

| Feature | odf-kit | simple-odf | docxtemplater |
|---------|---------|------------|---------------|
| Generate .odt from scratch | ✅ | ⚠️ flat XML only | ❌ |
| Generate .ods from scratch | ✅ | ❌ | ❌ |
| Fill .odt templates | ✅ | ❌ | ✅ .docx only |
| Read .odt files | ✅ | ❌ | ❌ |
| Convert to HTML | ✅ | ❌ | ❌ |
| Convert to Typst / PDF | ✅ | ❌ | ❌ |
| Browser support | ✅ | ❌ | ✅ |
| Maintained | ✅ | ❌ abandoned 2021 | ✅ |
| Open source | ✅ Apache 2.0 | ✅ MIT | ⚠️ paid for advanced features |

---

## Specification compliance

odf-kit targets ODF 1.2 (ISO/IEC 26300). Generated files include proper ZIP packaging (mimetype stored uncompressed as the first entry per spec), manifest, metadata, and all required namespace declarations. The OASIS ODF validator runs on every push via GitHub Actions.

---

## Version history

**v0.9.0** — ODS spreadsheet generation: `OdsDocument`, multiple sheets, auto-typed cells, formulas, date formatting (ISO/DMY/MDY), row and cell formatting, column widths, row heights, style deduplication. 707 tests passing.

**v0.8.0** — `odf-kit/typst` sub-export: `odtToTypst()` and `modelToTypst()`. Zero-dependency ODT→Typst emitter for PDF generation via Typst CLI. 650+ tests passing.

**v0.7.0** — Tier 3 reader: paragraph styles, page geometry, headers/footers (all four zones), sections, tracked changes (all three ODF modes). `SectionNode`, `TrackedChangeNode` added to `BodyNode` union.

**v0.6.0** — Tier 2 reader: span styles, image float/wrap, footnotes/endnotes, bookmarks, fields, cell/row styles, full style inheritance.

**v0.5.0** — `odf-kit/reader` sub-export: `readOdt()`, `odtToHtml()`. Tier 1: paragraphs, headings, tables, lists, images, notes, tracked changes.

**v0.4.0** — Generation repair: 16 spec compliance gaps fixed, OASIS ODF validator added to CI.

**v0.3.0** — Template engine: loops, conditionals, dot notation, automatic XML fragment healing.

**v0.2.0** — Migrated to fflate (zero transitive dependencies).

**v0.1.0** — Programmatic ODT creation: text, tables, page layout, lists, images, links, bookmarks.

---

## Guides

Full walkthroughs and real-world examples on the documentation site:

- [Generate ODT files in Node.js](https://githubnewbie0.github.io/odf-kit/guides/generate-odt-nodejs.html)
- [Generate ODT files in the browser](https://githubnewbie0.github.io/odf-kit/guides/generate-odt-browser.html)
- [Fill ODT templates in JavaScript](https://githubnewbie0.github.io/odf-kit/guides/fill-odt-template-javascript.html)
- [Convert ODT to HTML in JavaScript](https://githubnewbie0.github.io/odf-kit/guides/odt-to-html-javascript.html)
- [ODT to PDF via Typst](https://githubnewbie0.github.io/odf-kit/guides/odt-to-typst-pdf.html)
- [Generate ODT without LibreOffice](https://githubnewbie0.github.io/odf-kit/guides/generate-odt-without-libreoffice.html)
- [ODF government compliance](https://githubnewbie0.github.io/odf-kit/guides/odf-government-compliance.html)
- [simple-odf alternative](https://githubnewbie0.github.io/odf-kit/guides/simple-odf-alternative.html)
- [docxtemplater alternative for ODF](https://githubnewbie0.github.io/odf-kit/guides/docxtemplater-odf-alternative.html)
- [ODT JavaScript ecosystem](https://githubnewbie0.github.io/odf-kit/guides/odt-javascript-ecosystem.html)
- [Free ODT to HTML converter (online tool)](https://githubnewbie0.github.io/odf-kit/tools/odt-to-html.html)
- [Free ODT to PDF converter (online tool)](https://githubnewbie0.github.io/odf-kit/tools/odt-to-pdf.html)

---

## Contributing

Issues and pull requests welcome at [github.com/GitHubNewbie0/odf-kit](https://github.com/GitHubNewbie0/odf-kit).

```bash
git clone https://github.com/GitHubNewbie0/odf-kit.git
cd odf-kit
npm install
npm run build
npm test
```

Full pipeline before submitting a PR:

```bash
npm run format:check
npm run lint
npm run build
npm test
```

---

## Acknowledgments

Template syntax follows [Mustache](https://mustache.github.io/) conventions, established for document templating by [docxtemplater](https://docxtemplater.com/). odf-kit's engine is a clean-room implementation purpose-built for ODF — no code from either project was used.

---

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
