import { describe, it, expect } from "@jest/globals";
import { strFromU8, unzipSync } from "fflate";
import { tiptapToOdt } from "../src/odt/index.js";
import type { TiptapNode } from "../src/odt/index.js";

async function getContentXml(bytes: Uint8Array): Promise<string> {
  const unzipped = unzipSync(bytes);
  return strFromU8(unzipped["content.xml"]);
}

async function getStylesXml(bytes: Uint8Array): Promise<string> {
  const unzipped = unzipSync(bytes);
  return strFromU8(unzipped["styles.xml"]);
}

async function getMetaXml(bytes: Uint8Array): Promise<string> {
  const unzipped = unzipSync(bytes);
  return strFromU8(unzipped["meta.xml"]);
}

// ─── Minimal doc helper ───────────────────────────────────────────────

function doc(...content: TiptapNode[]): TiptapNode {
  return { type: "doc", content };
}

function paragraph(...content: TiptapNode[]): TiptapNode {
  return { type: "paragraph", content };
}

function heading(level: number, ...content: TiptapNode[]): TiptapNode {
  return { type: "heading", attrs: { level }, content };
}

function text(
  t: string,
  ...marks: Array<{ type: string; attrs?: Record<string, unknown> }>
): TiptapNode {
  return marks.length > 0 ? { type: "text", text: t, marks } : { type: "text", text: t };
}

function bulletList(...items: TiptapNode[]): TiptapNode {
  return { type: "bulletList", content: items };
}

function orderedList(...items: TiptapNode[]): TiptapNode {
  return { type: "orderedList", content: items };
}

function listItem(...content: TiptapNode[]): TiptapNode {
  return { type: "listItem", content };
}

function table(...rows: TiptapNode[]): TiptapNode {
  return { type: "table", content: rows };
}

function tableRow(...cells: TiptapNode[]): TiptapNode {
  return { type: "tableRow", content: cells };
}

function tableCell(...content: TiptapNode[]): TiptapNode {
  return { type: "tableCell", content };
}

function tableHeader(...content: TiptapNode[]): TiptapNode {
  return { type: "tableHeader", content };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("tiptapToOdt", () => {
  it("should return a valid Uint8Array", async () => {
    const bytes = await tiptapToOdt(doc(paragraph(text("Hello"))));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("should produce a valid ZIP file with content.xml", async () => {
    const bytes = await tiptapToOdt(doc(paragraph(text("Hello"))));
    const unzipped = unzipSync(bytes);
    expect(unzipped["mimetype"]).toBeDefined();
    expect(unzipped["content.xml"]).toBeDefined();
  });

  // ── Paragraph ──────────────────────────────────────────────────────

  it("should convert a paragraph", async () => {
    const bytes = await tiptapToOdt(doc(paragraph(text("Hello, world."))));
    const content = await getContentXml(bytes);
    expect(content).toContain("Hello, world.");
  });

  it("should handle an empty paragraph", async () => {
    const bytes = await tiptapToOdt(doc(paragraph()));
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  // ── Headings ───────────────────────────────────────────────────────

  it("should convert heading level 1", async () => {
    const bytes = await tiptapToOdt(doc(heading(1, text("My Title"))));
    const content = await getContentXml(bytes);
    expect(content).toContain("My Title");
    expect(content).toContain("Heading_20_1");
  });

  it("should convert headings levels 1 through 6", async () => {
    const nodes = [1, 2, 3, 4, 5, 6].map((l) => heading(l, text(`H${l}`)));
    const bytes = await tiptapToOdt(doc(...nodes));
    const content = await getContentXml(bytes);
    for (let l = 1; l <= 6; l++) {
      expect(content).toContain(`Heading_20_${l}`);
    }
  });

  // ── Marks ──────────────────────────────────────────────────────────

  it("should convert bold text", async () => {
    const bytes = await tiptapToOdt(doc(paragraph(text("bold", { type: "bold" }))));
    const content = await getContentXml(bytes);
    expect(content).toContain("bold");
    expect(content).toContain("fo:font-weight");
  });

  it("should convert italic text", async () => {
    const bytes = await tiptapToOdt(doc(paragraph(text("italic", { type: "italic" }))));
    const content = await getContentXml(bytes);
    expect(content).toContain("italic");
    expect(content).toContain("fo:font-style");
  });

  it("should convert underline text", async () => {
    const bytes = await tiptapToOdt(doc(paragraph(text("underline", { type: "underline" }))));
    const content = await getContentXml(bytes);
    expect(content).toContain("underline");
    expect(content).toContain("style:text-underline-style");
  });

  it("should convert strikethrough text", async () => {
    const bytes = await tiptapToOdt(doc(paragraph(text("struck", { type: "strike" }))));
    const content = await getContentXml(bytes);
    expect(content).toContain("struck");
    expect(content).toContain("style:text-line-through");
  });

  it("should convert code mark to monospace", async () => {
    const bytes = await tiptapToOdt(doc(paragraph(text("code()", { type: "code" }))));
    const content = await getContentXml(bytes);
    expect(content).toContain("code()");
    expect(content).toContain("Courier New");
  });

  it("should convert link mark", async () => {
    const bytes = await tiptapToOdt(
      doc(paragraph(text("click here", { type: "link", attrs: { href: "https://example.com" } }))),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("click here");
    expect(content).toContain("https://example.com");
  });

  it("should convert textStyle color", async () => {
    const bytes = await tiptapToOdt(
      doc(paragraph(text("red text", { type: "textStyle", attrs: { color: "#ff0000" } }))),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("red text");
    expect(content).toContain("#ff0000");
  });

  it("should convert superscript", async () => {
    const bytes = await tiptapToOdt(doc(paragraph(text("x"), text("2", { type: "superscript" }))));
    const content = await getContentXml(bytes);
    expect(content).toContain("super");
  });

  it("should convert subscript", async () => {
    const bytes = await tiptapToOdt(
      doc(paragraph(text("H"), text("2", { type: "subscript" }), text("O"))),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("sub");
  });

  // ── Hard break ─────────────────────────────────────────────────────

  it("should convert hardBreak to line break", async () => {
    const bytes = await tiptapToOdt(
      doc(paragraph(text("Line 1"), { type: "hardBreak" }, text("Line 2"))),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("Line 1");
    expect(content).toContain("Line 2");
    expect(content).toContain("text:line-break");
  });

  // ── Blockquote ─────────────────────────────────────────────────────

  it("should convert blockquote with indent", async () => {
    const bytes = await tiptapToOdt(
      doc({
        type: "blockquote",
        content: [paragraph(text("Quoted text"))],
      }),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("Quoted text");
  });

  // ── Code block ─────────────────────────────────────────────────────

  it("should convert codeBlock to monospace", async () => {
    const bytes = await tiptapToOdt(
      doc({
        type: "codeBlock",
        content: [text("const x = 1;")],
      }),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("const x = 1;");
    expect(content).toContain("Courier New");
  });

  // ── Horizontal rule ────────────────────────────────────────────────

  it("should convert horizontalRule to border paragraph", async () => {
    const bytes = await tiptapToOdt(doc({ type: "horizontalRule" }));
    const content = await getContentXml(bytes);
    expect(content).toContain("fo:border-bottom");
  });

  // ── Lists ──────────────────────────────────────────────────────────

  it("should convert bulletList", async () => {
    const bytes = await tiptapToOdt(
      doc(
        bulletList(
          listItem(paragraph(text("Item 1"))),
          listItem(paragraph(text("Item 2"))),
          listItem(paragraph(text("Item 3"))),
        ),
      ),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("Item 1");
    expect(content).toContain("Item 2");
    expect(content).toContain("text:list");
  });

  it("should convert orderedList", async () => {
    const bytes = await tiptapToOdt(
      doc(orderedList(listItem(paragraph(text("First"))), listItem(paragraph(text("Second"))))),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("First");
    expect(content).toContain("text:list");
  });

  it("should convert nested bulletList", async () => {
    const bytes = await tiptapToOdt(
      doc(
        bulletList(
          listItem(
            paragraph(text("Parent")),
            bulletList(listItem(paragraph(text("Child 1"))), listItem(paragraph(text("Child 2")))),
          ),
        ),
      ),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("Parent");
    expect(content).toContain("Child 1");
    expect(content).toContain("Child 2");
  });

  // ── Table ──────────────────────────────────────────────────────────

  it("should convert a table with headers and cells", async () => {
    const bytes = await tiptapToOdt(
      doc(
        table(
          tableRow(tableHeader(paragraph(text("Name"))), tableHeader(paragraph(text("Age")))),
          tableRow(tableCell(paragraph(text("Alice"))), tableCell(paragraph(text("30")))),
        ),
      ),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("Name");
    expect(content).toContain("Alice");
    expect(content).toContain("table:table");
  });

  // ── Image ──────────────────────────────────────────────────────────

  it("should emit placeholder for image without bytes", async () => {
    const bytes = await tiptapToOdt(
      doc({
        type: "image",
        attrs: { src: "https://example.com/photo.jpg", alt: "A photo" },
      }),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("A photo");
  });

  it("should embed image from images map", async () => {
    // 1x1 transparent PNG
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
      0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8,
      0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const src = "https://example.com/test.png";
    const bytes = await tiptapToOdt(
      doc({
        type: "image",
        attrs: { src, alt: "Test" },
      }),
      { images: { [src]: png } },
    );
    const unzipped = unzipSync(bytes);
    const hasPicture = Object.keys(unzipped).some((k) => k.startsWith("Pictures/"));
    expect(hasPicture).toBe(true);
  });

  // ── Unknown node ───────────────────────────────────────────────────

  it("should silently skip unknown node types without handler", async () => {
    const bytes = await tiptapToOdt(
      doc({ type: "customWidget", attrs: { data: "xyz" } }, paragraph(text("After custom"))),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("After custom");
  });

  it("should call unknownNodeHandler for unknown node types", async () => {
    const handledTypes: string[] = [];
    const bytes = await tiptapToOdt(
      doc(
        { type: "callout", content: [paragraph(text("Callout text"))] },
        paragraph(text("Normal")),
      ),
      {
        unknownNodeHandler: (node, doc) => {
          handledTypes.push(node.type);
          doc.addParagraph(`⚠️ Callout`);
        },
      },
    );
    expect(handledTypes).toContain("callout");
    const content = await getContentXml(bytes);
    expect(content).toContain("⚠️ Callout");
    expect(content).toContain("Normal");
  });

  // ── Page format ────────────────────────────────────────────────────

  it("should use A4 page format by default", async () => {
    const bytes = await tiptapToOdt(doc(paragraph(text("Hello"))));
    const styles = await getStylesXml(bytes);
    expect(styles).toContain("21cm");
    expect(styles).toContain("29.7cm");
  });

  it("should use letter page format when specified", async () => {
    const bytes = await tiptapToOdt(doc(paragraph(text("Hello"))), { pageFormat: "letter" });
    const styles = await getStylesXml(bytes);
    expect(styles).toContain("21.59cm");
  });

  it("should apply metadata", async () => {
    const bytes = await tiptapToOdt(doc(paragraph(text("Hello"))), {
      metadata: { title: "My Doc", creator: "Alice" },
    });
    const meta = await getMetaXml(bytes);
    expect(meta).toContain("My Doc");
    expect(meta).toContain("Alice");
  });

  // ── Full document ──────────────────────────────────────────────────

  it("should convert a full realistic document", async () => {
    const json: TiptapNode = {
      type: "doc",
      content: [
        heading(1, text("Meeting Notes")),
        paragraph(text("Date: "), text("April 9, 2026", { type: "bold" })),
        heading(2, text("Agenda")),
        orderedList(
          listItem(paragraph(text("Project status"))),
          listItem(paragraph(text("Budget review"))),
          listItem(paragraph(text("Next steps"))),
        ),
        heading(2, text("Action Items")),
        table(
          tableRow(
            tableHeader(paragraph(text("Owner"))),
            tableHeader(paragraph(text("Task"))),
            tableHeader(paragraph(text("Due"))),
          ),
          tableRow(
            tableCell(paragraph(text("Alice"))),
            tableCell(paragraph(text("Send report"))),
            tableCell(paragraph(text("Friday"))),
          ),
        ),
        paragraph(
          text("See "),
          text("odf-kit", {
            type: "link",
            attrs: { href: "https://github.com/GitHubNewbie0/odf-kit" },
          }),
          text(" for details."),
        ),
      ],
    };

    const bytes = await tiptapToOdt(json, { pageFormat: "A4" });
    expect(bytes).toBeInstanceOf(Uint8Array);
    const content = await getContentXml(bytes);
    expect(content).toContain("Meeting Notes");
    expect(content).toContain("Action Items");
    expect(content).toContain("Alice");
    expect(content).toContain("https://github.com/GitHubNewbie0/odf-kit");
  });
});
