# odf-kit

Create OpenDocument Format files (.odt) in TypeScript/JavaScript. No templates, no LibreOffice dependency — just a clean API that produces spec-compliant ODF files.

```typescript
import { OdtDocument } from "odf-kit";
import { writeFile } from "fs/promises";

const doc = new OdtDocument();
doc.addHeading("Quarterly Report", 1);
doc.addParagraph("Revenue exceeded expectations across all divisions.");
doc.addTable([
  ["Division", "Q4 Revenue", "Growth"],
  ["North", "$2.1M", "+12%"],
  ["South", "$1.8M", "+8%"],
  ["West", "$3.2M", "+15%"],
], { border: "0.5pt solid #000000" });

const bytes = await doc.save();
await writeFile("report.odt", bytes);
```

The generated `.odt` file opens in LibreOffice, Apache OpenOffice, OnlyOffice, Collabora, Google Docs, Microsoft Office, and any ODF-compliant application.

## Why odf-kit?

**ODF is the ISO standard (ISO/IEC 26300) for documents.** It's the default format for LibreOffice, the standard required by many governments, and the best choice for long-term document preservation. Until now, JavaScript developers had no maintained library for generating proper ODF files.

odf-kit fills that gap with a single runtime dependency, full TypeScript types, and an API designed to feel familiar to anyone who has used a document-generation library.

## Installation

```bash
npm install odf-kit
```

Requires Node.js 22 or later. ESM only.

## Features

- **Text** — paragraphs, headings (levels 1–6), bold, italic, underline, strikethrough, superscript, subscript, font size, font family, text color, highlight color
- **Tables** — column widths, cell borders (per-table, per-cell, per-side), background colors, cell merging (colspan/rowspan), rich text in cells
- **Page layout** — page size, margins, orientation, headers, footers, page numbers, page breaks
- **Lists** — bullet lists, numbered lists, nesting up to 6 levels, formatted items
- **Images** — embedded PNG/JPEG/GIF/SVG/WebP/BMP/TIFF, standalone or inline, configurable sizing and anchoring
- **Links** — external hyperlinks, internal bookmark links, formatted link text
- **Bookmarks** — named anchor points for internal navigation
- **Tab stops** — left, center, right alignment with configurable positions

## Quick Start

### Simple document

```typescript
import { OdtDocument } from "odf-kit";

const doc = new OdtDocument();
doc.setMetadata({ title: "My Document", creator: "Jane Doe" });
doc.addHeading("Introduction", 1);
doc.addParagraph("This is a simple ODF text document.");
doc.addParagraph("It opens in LibreOffice, Google Docs, and Microsoft Office.");

const bytes = await doc.save(); // Uint8Array — valid .odt file
```

### Formatted text

```typescript
doc.addParagraph((p) => {
  p.addText("This is ");
  p.addText("bold", { bold: true });
  p.addText(", ");
  p.addText("italic", { italic: true });
  p.addText(", and ");
  p.addText("red", { color: "red", fontSize: 16 });
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
// Simple — array of arrays
doc.addTable([
  ["Name", "Age", "City"],
  ["Alice", "30", "Portland"],
  ["Bob", "25", "Seattle"],
]);

// With options
doc.addTable([
  ["Product", "Price"],
  ["Widget", "$9.99"],
], { columnWidths: ["8cm", "4cm"], border: "0.5pt solid #000000" });

// Full control — builder callback
doc.addTable((t) => {
  t.addRow((r) => {
    r.addCell("Name", { bold: true, backgroundColor: "#DDDDDD" });
    r.addCell("Status", { bold: true, backgroundColor: "#DDDDDD" });
  });
  t.addRow((r) => {
    r.addCell((c) => {
      c.addText("Project Alpha", { bold: true });
    });
    r.addCell("Complete", { color: "green" });
  });
}, { columnWidths: ["8cm", "4cm"] });
```

### Page layout

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

doc.setFooter("© 2026 Acme Corp — Page ###"); // ### = page number

doc.addHeading("Chapter 1", 1);
doc.addParagraph("First chapter content.");
doc.addPageBreak();
doc.addHeading("Chapter 2", 1);
doc.addParagraph("Second chapter content.");
```

### Lists

```typescript
// Simple
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

// Standalone image
doc.addImage(logo, {
  width: "10cm",
  height: "6cm",
  mimeType: "image/png",
});

// Inline image in text
doc.addParagraph((p) => {
  p.addText("Company logo: ");
  p.addImage(logo, { width: "2cm", height: "1cm", mimeType: "image/png" });
  p.addText(" — Acme Corp");
});
```

### Links and bookmarks

```typescript
doc.addParagraph((p) => {
  p.addBookmark("introduction");
  p.addText("Welcome to the guide.");
});

doc.addParagraph((p) => {
  p.addText("Visit ");
  p.addLink("our website", "https://example.com", { bold: true });
  p.addText(" or go back to the ");
  p.addLink("introduction", "#introduction");
  p.addText(".");
});
```

### Tab stops

```typescript
doc.addParagraph((p) => {
  p.addText("Item");
  p.addTab();
  p.addText("Qty");
  p.addTab();
  p.addText("$100.00");
}, {
  tabStops: [
    { position: "6cm" },
    { position: "12cm", type: "right" },
  ],
});
```

### Method chaining

Every method returns the document, so you can chain calls:

```typescript
const bytes = await new OdtDocument()
  .setMetadata({ title: "Report" })
  .setPageLayout({ orientation: "landscape" })
  .setHeader("Confidential")
  .setFooter("Page ###")
  .addHeading("Summary", 1)
  .addParagraph("All systems operational.")
  .addTable([["System", "Status"], ["API", "OK"], ["DB", "OK"]])
  .addList(["No incidents", "No alerts"], { type: "numbered" })
  .save();
```

## API Reference

### OdtDocument

| Method | Description |
|--------|-------------|
| `setMetadata(options)` | Set title, creator, description |
| `setPageLayout(options)` | Set page size, margins, orientation |
| `setHeader(content)` | Set page header (string or builder callback) |
| `setFooter(content)` | Set page footer (string or builder callback) |
| `addHeading(content, level?)` | Add a heading (string or builder callback, level 1–6) |
| `addParagraph(content, options?)` | Add a paragraph (string or builder callback) |
| `addTable(content, options?)` | Add a table (string[][] or builder callback) |
| `addList(content, options?)` | Add a list (string[] or builder callback) |
| `addImage(data, options)` | Add a standalone image |
| `addPageBreak()` | Insert a page break |
| `save()` | Generate .odt file as `Promise<Uint8Array>` |

### TextFormatting

Accepted by `addText()`, `addLink()`, and `addCell()`:

```typescript
{
  bold?: boolean,
  italic?: boolean,
  fontWeight?: "normal" | "bold",
  fontStyle?: "normal" | "italic",
  fontSize?: number | string,       // 12 or "12pt"
  fontFamily?: string,               // "Arial"
  color?: string,                    // "#FF0000" or "red"
  underline?: boolean,
  strikethrough?: boolean,
  superscript?: boolean,
  subscript?: boolean,
  highlightColor?: string,           // "#FFFF00" or "yellow"
}
```

`fontSize` as a number assumes points. Both `{ bold: true }` and `{ fontWeight: "bold" }` work. When both are provided, the explicit property wins.

### ImageOptions

```typescript
{
  width: string,       // "10cm", "4in" — required
  height: string,      // "6cm", "3in" — required
  mimeType: string,    // "image/png", "image/jpeg" — required
  anchor?: "as-character" | "paragraph",
}
```

### TableOptions

```typescript
{
  columnWidths?: string[],  // ["5cm", "3cm"]
  border?: string,          // "0.5pt solid #000000"
}
```

### CellOptions

Extends `TextFormatting` with:

```typescript
{
  backgroundColor?: string,  // "#EEEEEE" or "lightgray"
  border?: string,
  borderTop?: string,
  borderBottom?: string,
  borderLeft?: string,
  borderRight?: string,
  colSpan?: number,
  rowSpan?: number,
}
```

### PageLayout

```typescript
{
  width?: string,              // "21cm" (default: A4)
  height?: string,             // "29.7cm"
  orientation?: "portrait" | "landscape",
  marginTop?: string,          // "2cm" (default)
  marginBottom?: string,
  marginLeft?: string,
  marginRight?: string,
}
```

## Status

**v0.1.0** — ODT module is complete and tested (102 tests). Generates valid `.odt` files that open correctly in LibreOffice 24.2. ODS (spreadsheets), ODP (presentations), and ODG (drawings) are planned for future releases.

## Specification Compliance

odf-kit targets ODF 1.2 (ISO/IEC 26300). Generated files include proper ZIP packaging (mimetype stored uncompressed as the first entry), manifest, metadata, and all required namespace declarations.

## Contributing

Issues and pull requests are welcome at [github.com/GitHubNewbie0/odf-kit](https://github.com/GitHubNewbie0/odf-kit).

```bash
git clone https://github.com/GitHubNewbie0/odf-kit.git
cd odf-kit
npm install
npm run build
npm test
```

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
