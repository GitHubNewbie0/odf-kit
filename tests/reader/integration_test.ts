import { parseMetaXml } from "../../src/reader/parser.js";
import { readOdt } from "../../src/reader/parser.js";
import { OdtDocument } from "../../src/index.js";
import type {
  ParagraphNode,
  HeadingNode,
  ListNode,
  TableNode,
  InlineNode,
  TextSpan,
} from "../../src/reader/types.js";

// ============================================================
// Type helper
// ============================================================

/**
 * Filter an InlineNode array down to TextSpan nodes only.
 *
 * Required because spans is InlineNode[] in Tier 2 — it may also contain
 * ImageNode, NoteNode, BookmarkNode, and FieldNode. Round-trip tests using
 * the odf-kit generator only produce TextSpan nodes, so filtering is safe
 * and keeps the test assertions unchanged from Tier 1.
 */
function textSpans(spans: InlineNode[]): TextSpan[] {
  return spans.filter((s): s is TextSpan => !("kind" in s));
}

// ============================================================
// parseMetaXml
// ============================================================

describe("parseMetaXml", () => {
  test("returns empty object for meta.xml with no office:meta element", () => {
    const xml =
      '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"></office:document-meta>';
    expect(parseMetaXml(xml)).toEqual({});
  });

  test("parses dc:title", () => {
    const xml =
      '<office:document-meta xmlns:office="x" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      "<office:meta>" +
      "<dc:title>My Document</dc:title>" +
      "</office:meta>" +
      "</office:document-meta>";
    const meta = parseMetaXml(xml);
    expect(meta.title).toBe("My Document");
  });

  test("parses dc:creator", () => {
    const xml =
      '<office:document-meta xmlns:office="x" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      "<office:meta>" +
      "<dc:creator>Jane Doe</dc:creator>" +
      "</office:meta>" +
      "</office:document-meta>";
    expect(parseMetaXml(xml).creator).toBe("Jane Doe");
  });

  test("parses dc:description", () => {
    const xml =
      '<office:document-meta xmlns:office="x" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      "<office:meta>" +
      "<dc:description>A test document</dc:description>" +
      "</office:meta>" +
      "</office:document-meta>";
    expect(parseMetaXml(xml).description).toBe("A test document");
  });

  test("parses meta:creation-date", () => {
    const xml =
      '<office:document-meta xmlns:office="x" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0">' +
      "<office:meta>" +
      "<meta:creation-date>2024-01-15T10:30:00</meta:creation-date>" +
      "</office:meta>" +
      "</office:document-meta>";
    expect(parseMetaXml(xml).creationDate).toBe("2024-01-15T10:30:00");
  });

  test("parses dc:date as modificationDate", () => {
    const xml =
      '<office:document-meta xmlns:office="x" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      "<office:meta>" +
      "<dc:date>2024-02-20T09:00:00</dc:date>" +
      "</office:meta>" +
      "</office:document-meta>";
    expect(parseMetaXml(xml).modificationDate).toBe("2024-02-20T09:00:00");
  });

  test("parses all fields together", () => {
    const xml =
      '<office:document-meta xmlns:office="x" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0">' +
      "<office:meta>" +
      "<dc:title>Full Doc</dc:title>" +
      "<dc:creator>Alice</dc:creator>" +
      "<dc:description>All fields</dc:description>" +
      "<meta:creation-date>2024-01-01T00:00:00</meta:creation-date>" +
      "<dc:date>2024-06-01T12:00:00</dc:date>" +
      "</office:meta>" +
      "</office:document-meta>";
    const meta = parseMetaXml(xml);
    expect(meta.title).toBe("Full Doc");
    expect(meta.creator).toBe("Alice");
    expect(meta.description).toBe("All fields");
    expect(meta.creationDate).toBe("2024-01-01T00:00:00");
    expect(meta.modificationDate).toBe("2024-06-01T12:00:00");
  });

  test("leaves missing fields undefined", () => {
    const xml =
      '<office:document-meta xmlns:office="x" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      "<office:meta><dc:title>Only Title</dc:title></office:meta>" +
      "</office:document-meta>";
    const meta = parseMetaXml(xml);
    expect(meta.title).toBe("Only Title");
    expect(meta.creator).toBeUndefined();
    expect(meta.description).toBeUndefined();
    expect(meta.creationDate).toBeUndefined();
    expect(meta.modificationDate).toBeUndefined();
  });
});

// ============================================================
// Round-trip — paragraphs
// ============================================================

describe("readOdt — round-trip paragraphs", () => {
  test("reads a plain paragraph", async () => {
    const doc = new OdtDocument();
    doc.addParagraph("Hello, world!");
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const paragraphs = parsed.body.filter((n) => n.kind === "paragraph") as ParagraphNode[];
    expect(paragraphs.length).toBeGreaterThanOrEqual(1);
    const first = paragraphs[0];
    expect(textSpans(first.spans).some((s) => s.text === "Hello, world!")).toBe(true);
  });

  test("reads multiple paragraphs in order", async () => {
    const doc = new OdtDocument();
    doc.addParagraph("First");
    doc.addParagraph("Second");
    doc.addParagraph("Third");
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const paragraphs = parsed.body.filter((n) => n.kind === "paragraph") as ParagraphNode[];
    const texts = paragraphs.map((p) =>
      textSpans(p.spans)
        .map((s) => s.text)
        .join(""),
    );
    expect(texts).toContain("First");
    expect(texts).toContain("Second");
    expect(texts).toContain("Third");
    expect(texts.indexOf("First")).toBeLessThan(texts.indexOf("Second"));
    expect(texts.indexOf("Second")).toBeLessThan(texts.indexOf("Third"));
  });

  test("reads a paragraph with bold text", async () => {
    const doc = new OdtDocument();
    doc.addParagraph((p) => {
      p.addText("plain ");
      p.addText("bold", { bold: true });
    });
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const paragraphs = parsed.body.filter((n) => n.kind === "paragraph") as ParagraphNode[];
    const first = paragraphs[0];
    const boldSpan = textSpans(first.spans).find((s) => s.bold === true);
    expect(boldSpan).toBeDefined();
    expect(boldSpan?.text).toBe("bold");
  });

  test("reads a paragraph with italic text", async () => {
    const doc = new OdtDocument();
    doc.addParagraph((p) => {
      p.addText("italic text", { italic: true });
    });
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const paragraphs = parsed.body.filter((n) => n.kind === "paragraph") as ParagraphNode[];
    const italicSpan = textSpans(paragraphs[0].spans).find((s) => s.italic === true);
    expect(italicSpan).toBeDefined();
    expect(italicSpan?.text).toBe("italic text");
  });

  test("reads a paragraph with underline text", async () => {
    const doc = new OdtDocument();
    doc.addParagraph((p) => {
      p.addText("underlined", { underline: true });
    });
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const paragraphs = parsed.body.filter((n) => n.kind === "paragraph") as ParagraphNode[];
    const span = textSpans(paragraphs[0].spans).find((s) => s.underline === true);
    expect(span).toBeDefined();
    expect(span?.text).toBe("underlined");
  });

  test("reads a paragraph with strikethrough text", async () => {
    const doc = new OdtDocument();
    doc.addParagraph((p) => {
      p.addText("struck", { strikethrough: true });
    });
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const paragraphs = parsed.body.filter((n) => n.kind === "paragraph") as ParagraphNode[];
    const span = textSpans(paragraphs[0].spans).find((s) => s.strikethrough === true);
    expect(span).toBeDefined();
    expect(span?.text).toBe("struck");
  });
});

// ============================================================
// Round-trip — headings
// ============================================================

describe("readOdt — round-trip headings", () => {
  test("reads a level 1 heading", async () => {
    const doc = new OdtDocument();
    doc.addHeading("Chapter One");
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const headings = parsed.body.filter((n) => n.kind === "heading") as HeadingNode[];
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(headings[0].level).toBe(1);
    expect(textSpans(headings[0].spans).some((s) => s.text.includes("Chapter One"))).toBe(true);
  });

  test("reads headings at multiple levels", async () => {
    const doc = new OdtDocument();
    doc.addHeading("Top", 1);
    doc.addHeading("Sub", 2);
    doc.addHeading("SubSub", 3);
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const headings = parsed.body.filter((n) => n.kind === "heading") as HeadingNode[];
    const levels = headings.map((h) => h.level);
    expect(levels).toContain(1);
    expect(levels).toContain(2);
    expect(levels).toContain(3);
  });
});

// ============================================================
// Round-trip — lists
// ============================================================

describe("readOdt — round-trip lists", () => {
  test("reads an unordered list", async () => {
    const doc = new OdtDocument();
    doc.addList(["Apple", "Banana", "Cherry"]);
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const lists = parsed.body.filter((n) => n.kind === "list") as ListNode[];
    expect(lists.length).toBeGreaterThanOrEqual(1);
    const list = lists[0];
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(3);
    const texts = list.items.map((i) =>
      textSpans(i.spans)
        .map((s) => s.text)
        .join(""),
    );
    expect(texts).toContain("Apple");
    expect(texts).toContain("Banana");
    expect(texts).toContain("Cherry");
  });

  test("reads an ordered list", async () => {
    const doc = new OdtDocument();
    doc.addList(["Step 1", "Step 2", "Step 3"], { type: "numbered" });
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const lists = parsed.body.filter((n) => n.kind === "list") as ListNode[];
    expect(lists.length).toBeGreaterThanOrEqual(1);
    expect(lists[0].ordered).toBe(true);
    expect(lists[0].items).toHaveLength(3);
  });
});

// ============================================================
// Round-trip — tables
// ============================================================

describe("readOdt — round-trip tables", () => {
  test("reads a simple 2×2 table", async () => {
    const doc = new OdtDocument();
    doc.addTable([
      ["A", "B"],
      ["C", "D"],
    ]);
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const tables = parsed.body.filter((n) => n.kind === "table") as TableNode[];
    expect(tables.length).toBeGreaterThanOrEqual(1);
    const table = tables[0];
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].cells).toHaveLength(2);

    const row0texts = table.rows[0].cells.map((c) =>
      textSpans(c.spans)
        .map((s) => s.text)
        .join(""),
    );
    expect(row0texts).toContain("A");
    expect(row0texts).toContain("B");

    const row1texts = table.rows[1].cells.map((c) =>
      textSpans(c.spans)
        .map((s) => s.text)
        .join(""),
    );
    expect(row1texts).toContain("C");
    expect(row1texts).toContain("D");
  });

  test("reads a table with multiple rows", async () => {
    const doc = new OdtDocument();
    doc.addTable([
      ["Name", "Score"],
      ["Alice", "95"],
      ["Bob", "87"],
    ]);
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const tables = parsed.body.filter((n) => n.kind === "table") as TableNode[];
    expect(tables[0].rows).toHaveLength(3);
  });
});

// ============================================================
// Round-trip — toHtml
// ============================================================

describe("readOdt — toHtml", () => {
  test("toHtml returns a string containing paragraph text", async () => {
    const doc = new OdtDocument();
    doc.addParagraph("Hello from toHtml");
    const bytes = await doc.save();
    const html = readOdt(bytes).toHtml({ fragment: true });
    expect(html).toContain("Hello from toHtml");
    expect(html).toContain("<p");
  });

  test("toHtml returns a full document by default", async () => {
    const doc = new OdtDocument();
    doc.addParagraph("Test");
    const bytes = await doc.save();
    const html = readOdt(bytes).toHtml();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html>");
  });

  test("toHtml returns a fragment when fragment is true", async () => {
    const doc = new OdtDocument();
    doc.addParagraph("Test");
    const bytes = await doc.save();
    const html = readOdt(bytes).toHtml({ fragment: true });
    expect(html).not.toContain("<!DOCTYPE");
    expect(html).toContain("<p");
  });

  test("odtToHtml convenience function produces the same output as readOdt().toHtml()", async () => {
    const { odtToHtml } = await import("../../src/reader/index.js");
    const doc = new OdtDocument();
    doc.addParagraph("Convenience test");
    const bytes = await doc.save();
    const direct = readOdt(bytes).toHtml({ fragment: true });
    const convenience = odtToHtml(bytes, { fragment: true });
    expect(convenience).toBe(direct);
  });
});

// ============================================================
// Round-trip — hyperlinks
// ============================================================

describe("readOdt — round-trip hyperlinks", () => {
  test("reads a hyperlink in a paragraph", async () => {
    const doc = new OdtDocument();
    doc.addParagraph((p) => {
      p.addText("Visit ");
      p.addLink("our site", "https://example.com");
    });
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const paragraphs = parsed.body.filter((n) => n.kind === "paragraph") as ParagraphNode[];
    const linkSpan = textSpans(paragraphs[0].spans).find((s) => s.href !== undefined);
    expect(linkSpan).toBeDefined();
    expect(linkSpan?.href).toBe("https://example.com");
    expect(linkSpan?.text).toBe("our site");
  });
});

// ============================================================
// Round-trip — mergeStyle tri-state (bold override cancellation)
// ============================================================

describe("readOdt — mergeStyle tri-state formatting", () => {
  test("span with explicit normal weight inside bold paragraph is not bold", async () => {
    const doc = new OdtDocument();
    doc.addParagraph((p) => {
      p.addText("bold", { bold: true });
      p.addText("normal");
    });
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const paragraphs = parsed.body.filter((n) => n.kind === "paragraph") as ParagraphNode[];
    const first = paragraphs[0];
    const boldSpan = textSpans(first.spans).find((s) => s.text === "bold");
    const normalSpan = textSpans(first.spans).find((s) => s.text === "normal");
    expect(boldSpan?.bold).toBe(true);
    expect(normalSpan?.bold).toBeUndefined();
  });

  test("bold and italic spans are independently set and cleared", async () => {
    const doc = new OdtDocument();
    doc.addParagraph((p) => {
      p.addText("both", { bold: true, italic: true });
      p.addText("bold only", { bold: true });
      p.addText("plain");
    });
    const bytes = await doc.save();
    const parsed = readOdt(bytes);

    const paragraphs = parsed.body.filter((n) => n.kind === "paragraph") as ParagraphNode[];
    const first = paragraphs[0];
    const both = textSpans(first.spans).find((s) => s.text === "both");
    const boldOnly = textSpans(first.spans).find((s) => s.text === "bold only");
    const plain = textSpans(first.spans).find((s) => s.text === "plain");
    expect(both?.bold).toBe(true);
    expect(both?.italic).toBe(true);
    expect(boldOnly?.bold).toBe(true);
    expect(boldOnly?.italic).toBeUndefined();
    expect(plain?.bold).toBeUndefined();
    expect(plain?.italic).toBeUndefined();
  });
});
