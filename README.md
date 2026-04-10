# odf-kit

Generate, fill, read, and convert OpenDocument Format files (.odt, .ods) in TypeScript and JavaScript. Convert HTML, Markdown, and TipTap JSON to ODT. Works in Node.js and browsers. No LibreOffice dependency — pure spec-compliant ODF.

**[Documentation & examples →](https://githubnewbie0.github.io/odf-kit/)**

```bash
npm install odf-kit
```

## Eight ways to work with ODF files

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
// 2. Convert HTML to ODT
import { htmlToOdt } from "odf-kit";

const html = `
  <h1>Meeting Notes</h1>
  <p>Attendees: <strong>Alice</strong>, Bob, Carol</p>
  <ul>
    <li>Project status</li>
    <li>Budget review</li>
  </ul>
`;
const bytes = await htmlToOdt(html, { pageFormat: "A4" });
```

```typescript
// 3. Convert Markdown to ODT
import { markdownToOdt } from "odf-kit";

const markdown = `
# Meeting Notes

Attendees: **Alice**, Bob, Carol

## Action Items

- Send report by Friday
- Review budget on Monday
`;
const bytes = await markdownToOdt(markdown, { pageFormat: "A4" });
```

```typescript
// 4. Convert TipTap/ProseMirror JSON to ODT
import { tiptapToOdt } from "odf-kit";

// editor.getJSON() returns TipTap JSONContent
const bytes = await tiptapToOdt(editor.getJSON(), { pageFormat: "A4" });

// With pre-fetched images (e.g. from IPFS or S3)
const images = { [imageUrl]: await fetchImageBytes(imageUrl) };
const bytes2 = await tiptapToOdt(editor.getJSON(), { images });

// With custom node handler for app-specific extensions
const bytes3 = await tiptapToOdt(editor.getJSON(), {
  unknownNodeHandler: (node, doc) => {
    if (node.type === "callout") doc.addParagraph(`⚠️ ${extractText(node)}`);
  },
});
```

```typescript
// 5. Build an ODS spreadsheet from scratch
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
// 6. Fill an existing .odt template with data
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
// 7. Read an existing .odt file
import { readOdt, odtToHtml } from "odf-kit/reader";

const bytes = readFileSync("report.odt");
const model = readOdt(bytes);              // structured document model
const html  = odtToHtml(bytes);            // styled HTML string
```

```typescript
// 8. Convert .odt to Typst for PDF generation
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
import { OdtDocument, OdsDocument, htmlToOdt, markdownToOdt, tiptapToOdt, fillTemplate } from "odf-kit";
import { readOdt, odtToHtml }                from "odf-kit/reader";
import { odtToTypst, modelToTypst }          from "odf-kit/typst";
```

Works in Node.js, browsers, Deno, Bun, and Cloudflare Workers. Runtime dependencies: [fflate](https://github.com/101arrowz/fflate) for ZIP, [marked](https://marked.js.org/) for Markdown parsing.

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
  { value: 12500, type: "float", color: "#006600" },
  "On track",
], { italic: true });
```

### Date formatting

```typescript
doc.setDateFormat("DD/MM/YYYY");  // "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY"
sheet.addRow([{ value: new Date("2026-12-25"), type: "date", dateFormat: "MM/DD/YYYY" }]);
```

### Column widths and row heights

```typescript
sheet.setColumnWidth(0, "4cm");
sheet.setColumnWidth(1, "8cm");
sheet.setRowHeight(0, "1.5cm");
```

### Multiple sheets

```typescript
const doc = new OdsDocument();
const q1 = doc.addSheet("Q1");
q1.addRow(["Month", "Revenue"], { bold: true });
q1.addRow(["January", 12500]);

const q2 = doc.addSheet("Q2");
q2.addRow(["Month", "Revenue"], { bold: true });
q2.addRow(["April", 15300]);

const bytes = await doc.save();
```

---

## Convert: HTML to ODT

`htmlToOdt()` converts an HTML string to a `.odt` file. The primary use case is Nextcloud Text ODT export and any web-based editor that stores content as HTML.

```typescript
import { htmlToOdt } from "odf-kit";

const bytes = await htmlToOdt(html);                          // A4 default
const bytes = await htmlToOdt(html, { pageFormat: "letter" }); // US letter
```

### Page formats

| Format | Dimensions | Default margins | Typical use |
|---|---|---|---|
| `"A4"` | 21 × 29.7 cm | 2.5 cm | Europe, ISO standard **(default)** |
| `"letter"` | 21.59 × 27.94 cm | 2.54 cm | USA, Canada |
| `"legal"` | 21.59 × 35.56 cm | 2.54 cm | USA legal |
| `"A3"` | 29.7 × 42 cm | 2.5 cm | Large format |
| `"A5"` | 14.8 × 21 cm | 2 cm | Small booklets |

### Supported HTML elements

**Block:** `<h1>`–`<h6>`, `<p>`, `<ul>`, `<ol>`, `<li>` (nested), `<table>` / `<tr>` / `<td>` / `<th>`, `<blockquote>`, `<pre>`, `<hr>`, `<figure>` / `<figcaption>`, `<div>` / `<section>` (transparent).

**Inline:** `<strong>`, `<em>`, `<u>`, `<s>`, `<sup>`, `<sub>`, `<a href>`, `<code>`, `<mark>`, `<span style="">`, `<br>`.

---

## Convert: Markdown to ODT

`markdownToOdt()` converts any CommonMark Markdown string to ODT. Accepts the same options as `htmlToOdt()`.

```typescript
import { markdownToOdt } from "odf-kit";

const bytes = await markdownToOdt(markdownString, { pageFormat: "A4" });
const bytes = await markdownToOdt(markdownString, {
  pageFormat: "letter",
  metadata: { title: "My Document", creator: "Alice" },
});
```

Supports headings, paragraphs, bold, italic, lists (nested), tables, links, blockquotes, code blocks, and horizontal rules.

---

## Convert: TipTap/ProseMirror JSON to ODT

`tiptapToOdt()` converts TipTap/ProseMirror `JSONContent` directly to ODT. No dependency on `@tiptap/core` — walks the JSON tree as a plain object. This is the most direct integration path for any TipTap-based editor (dDocs, Outline, Novel, BlockNote, etc.).

```typescript
import { tiptapToOdt } from "odf-kit";

// Basic usage
const bytes = await tiptapToOdt(editor.getJSON(), { pageFormat: "A4" });

// With pre-fetched images
const images = {
  "https://example.com/photo.jpg": jpegBytes,
  "ipfs://Qm...": ipfsImageBytes,
};
const bytes = await tiptapToOdt(editor.getJSON(), { images });

// With custom node handler for app-specific extensions
const bytes = await tiptapToOdt(editor.getJSON(), {
  unknownNodeHandler: (node, doc) => {
    if (node.type === "callout") {
      doc.addParagraph(`⚠️ ${node.content?.[0]?.content?.[0]?.text ?? ""}`)
    }
  },
});
```

### Supported TipTap nodes

**Block:** `doc`, `paragraph`, `heading` (1–6), `bulletList`, `orderedList`, `listItem` (nested), `blockquote`, `codeBlock`, `horizontalRule`, `hardBreak`, `image`, `table`, `tableRow`, `tableCell`, `tableHeader`.

**Marks:** `bold`, `italic`, `underline`, `strike`, `code`, `link`, `textStyle` (color, fontSize, fontFamily), `highlight`, `superscript`, `subscript`.

**Images:** Data URIs are decoded and embedded directly. Other URLs are looked up in the `images` option. Unknown URLs emit a `[Image: alt]` placeholder paragraph.

**Unknown nodes:** Silently skipped by default. Provide `unknownNodeHandler` to handle custom extensions.

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

### Conditionals

```
{#showDiscount}
You qualify for a {percent}% discount!
{/showDiscount}
```

Falsy values (`false`, `null`, `undefined`, `0`, `""`, `[]`) remove the block. Truthy values include it.

---

## Read: ODT document model

`odf-kit/reader` parses `.odt` files into a structured model and renders to HTML.

```typescript
import { readOdt, odtToHtml } from "odf-kit/reader";

const bytes = readFileSync("report.odt");
const model = readOdt(bytes);
const html  = odtToHtml(bytes);

// Tracked changes
const final    = odtToHtml(bytes, {}, { trackedChanges: "final" });
const original = odtToHtml(bytes, {}, { trackedChanges: "original" });
const marked   = odtToHtml(bytes, {}, { trackedChanges: "changes" });
```

---

## Typst: ODT to PDF

```typescript
import { odtToTypst, modelToTypst } from "odf-kit/typst";

const typst = odtToTypst(readFileSync("letter.odt"));
writeFileSync("letter.typ", typst);
execSync("typst compile letter.typ letter.pdf");
```

---

## API Reference

### htmlToOdt / markdownToOdt

```typescript
function htmlToOdt(html: string, options?: HtmlToOdtOptions): Promise<Uint8Array>
function markdownToOdt(markdown: string, options?: HtmlToOdtOptions): Promise<Uint8Array>

interface HtmlToOdtOptions {
  pageFormat?: "A4" | "letter" | "legal" | "A3" | "A5"; // default: "A4"
  orientation?: "portrait" | "landscape";
  marginTop?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;
  metadata?: { title?: string; creator?: string; description?: string };
}
```

### tiptapToOdt

```typescript
function tiptapToOdt(json: TiptapNode, options?: TiptapToOdtOptions): Promise<Uint8Array>

interface TiptapNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
}

interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TiptapToOdtOptions extends HtmlToOdtOptions {
  images?: Record<string, Uint8Array>;
  unknownNodeHandler?: (node: TiptapNode, doc: OdtDocument) => void;
}
```

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

### OdsDocument / OdsSheet

| Method | Description |
|--------|-------------|
| `doc.setMetadata(options)` | Set title, creator, description |
| `doc.setDateFormat(format)` | Set default date display format |
| `doc.addSheet(name)` | Add a sheet tab — returns `OdsSheet` |
| `doc.save()` | Generate `.ods` as `Promise<Uint8Array>` |
| `sheet.addRow(values, options?)` | Add a row of cells |
| `sheet.setColumnWidth(index, width)` | Set column width |
| `sheet.setRowHeight(index, height)` | Set row height |

### fillTemplate

```typescript
function fillTemplate(templateBytes: Uint8Array, data: TemplateData): Uint8Array
```

| Syntax | Description |
|--------|-------------|
| `{tag}` | Replace with value |
| `{object.property}` | Dot notation |
| `{#tag}...{/tag}` | Loop or conditional |

### TextFormatting

```typescript
{
  bold?: boolean,
  italic?: boolean,
  fontSize?: number | string,
  fontFamily?: string,
  color?: string,
  underline?: boolean,
  strikethrough?: boolean,
  superscript?: boolean,
  subscript?: boolean,
  highlightColor?: string,
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

ESM only. Zero Node-specific APIs in the library source — enforced at the TypeScript level.

---

## Why odf-kit?

**ODF is the ISO standard (ISO/IEC 26300) for documents.** It's the default format for LibreOffice, mandatory for many governments and public sector organisations, and the best choice for long-term document preservation.

- **Two runtime dependencies** — fflate (ZIP) and marked (Markdown parsing). No transitive dependencies.
- **Spec-compliant output** — every generated file passes the OASIS ODF validator. Enforced on every commit by CI.
- **Multiple ODF formats** — ODT documents and ODS spreadsheets from the same library.
- **Eight complete capability modes** — build ODT, build ODS, convert HTML→ODT, convert Markdown→ODT, convert TipTap JSON→ODT, fill templates, read, convert to Typst/PDF.
- **TipTap/ProseMirror integration** — direct JSON→ODT conversion for any TipTap-based editor, no intermediate HTML step.
- **Zero-dependency Typst emitter** — the only JavaScript library with built-in ODT→Typst conversion for PDF generation.
- **TypeScript-first** — full types across all sub-exports.
- **Apache 2.0** — use freely in commercial and open source projects.

---

## Comparison

| Feature | odf-kit | simple-odf | docxtemplater |
|---------|---------|------------|---------------|
| Generate .odt from scratch | ✅ | ⚠️ flat XML only | ❌ |
| Generate .ods from scratch | ✅ | ❌ | ❌ |
| Convert HTML → ODT | ✅ | ❌ | ❌ |
| Convert Markdown → ODT | ✅ | ❌ | ❌ |
| Convert TipTap JSON → ODT | ✅ | ❌ | ❌ |
| Fill .odt templates | ✅ | ❌ | ✅ .docx only |
| Read .odt files | ✅ | ❌ | ❌ |
| Convert to HTML | ✅ | ❌ | ❌ |
| Convert to Typst / PDF | ✅ | ❌ | ❌ |
| Browser support | ✅ | ❌ | ✅ |
| Maintained | ✅ | ❌ abandoned 2021 | ✅ |
| Open source | ✅ Apache 2.0 | ✅ MIT | ⚠️ paid for advanced features |

---

## Specification compliance

odf-kit targets ODF 1.2 (ISO/IEC 26300). Generated files include proper ZIP packaging, manifest, metadata, and all required namespace declarations. The OASIS ODF validator runs on every push via GitHub Actions.

---

## Version history

**v0.9.6** — `tiptapToOdt()`: TipTap/ProseMirror JSON→ODT conversion. `TiptapNode`, `TiptapMark`, `TiptapToOdtOptions` types. `unknownNodeHandler` for custom extensions. Image support via pre-fetched bytes map. 817 tests passing.

**v0.9.5** — `markdownToOdt()`: Markdown→ODT via marked + htmlToOdt. 786 tests passing.

**v0.9.4** — ODS datetime auto-detection (nonzero UTC time → datetime format). ODS formula `xmlns:of` namespace fix (Err:510 resolved).

**v0.9.2** — `htmlToOdt()`: HTML→ODT conversion with page format presets, full inline formatting, lists, tables, blockquote, pre, hr, and inline CSS. 769 tests passing.

**v0.9.0** — ODS spreadsheet generation: `OdsDocument`, multiple sheets, auto-typed cells, formulas, date formatting, row and cell formatting, column widths, row heights. 707 tests passing.

**v0.8.0** — `odf-kit/typst`: `odtToTypst()` and `modelToTypst()`. Zero-dependency ODT→Typst emitter for PDF generation.

**v0.7.0** — Tier 3 reader: paragraph styles, page geometry, headers/footers, sections, tracked changes (all three ODF modes).

**v0.6.0** — Tier 2 reader: span styles, image float/wrap, footnotes/endnotes, bookmarks, fields, cell/row styles.

**v0.5.0** — `odf-kit/reader`: `readOdt()`, `odtToHtml()`. Tier 1 parsing.

**v0.3.0** — Template engine: loops, conditionals, dot notation, automatic XML fragment healing.

**v0.1.0** — Programmatic ODT creation: text, tables, page layout, lists, images, links, bookmarks.

---

## Guides

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

---

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
