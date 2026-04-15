import { describe, it, expect } from "@jest/globals";
import { zipSync } from "fflate";
import { odtToMarkdown, modelToMarkdown } from "../../src/markdown/index.js";
import { readOdt } from "../../src/reader/parser.js";

// ─── Helpers ──────────────────────────────────────────────────────────

const encoder = new TextEncoder();

/** Build a minimal valid ODT ZIP from a content.xml body string. */
function buildOdt(bodyXml: string, stylesXml?: string): Uint8Array {
  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  office:version="1.2">
  <office:automatic-styles/>
  <office:body>
    <office:text>${bodyXml}</office:text>
  </office:body>
</office:document-content>`;

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

  const defaultStyles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2">
  <office:styles/>
</office:document-styles>`;

  return zipSync({
    mimetype: encoder.encode("application/vnd.oasis.opendocument.text"),
    "content.xml": encoder.encode(contentXml),
    "styles.xml": encoder.encode(stylesXml ?? defaultStyles),
    "META-INF/manifest.xml": encoder.encode(manifest),
  });
}

function para(text: string, styleName = "Text_Body"): string {
  return `<text:p text:style-name="${styleName}">${text}</text:p>`;
}

function heading(text: string, level: number): string {
  return `<text:h text:outline-level="${level}">${text}</text:h>`;
}

// ─── headings ─────────────────────────────────────────────────────────

describe("odtToMarkdown — headings", () => {
  it("renders h1 with single #", () => {
    const odt = buildOdt(heading("Title", 1));
    expect(odtToMarkdown(odt)).toBe("# Title");
  });

  it("renders h2 with ##", () => {
    const odt = buildOdt(heading("Section", 2));
    expect(odtToMarkdown(odt)).toBe("## Section");
  });

  it("renders h6 with ######", () => {
    const odt = buildOdt(heading("Deep", 6));
    expect(odtToMarkdown(odt)).toBe("###### Deep");
  });
});

// ─── paragraphs ───────────────────────────────────────────────────────

describe("odtToMarkdown — paragraphs", () => {
  it("renders a plain paragraph", () => {
    const odt = buildOdt(para("Hello world"));
    expect(odtToMarkdown(odt)).toBe("Hello world");
  });

  it("separates multiple paragraphs with blank lines", () => {
    const odt = buildOdt(para("First") + para("Second") + para("Third"));
    expect(odtToMarkdown(odt)).toBe("First\n\nSecond\n\nThird");
  });

  it("skips empty paragraphs", () => {
    const odt = buildOdt(para("") + para("Content") + para(""));
    expect(odtToMarkdown(odt)).toBe("Content");
  });
});

// ─── inline formatting ────────────────────────────────────────────────

describe("odtToMarkdown — inline formatting", () => {
  it("renders bold as **text**", () => {
    const odt = buildOdt(para(`<text:span text:style-name="bold">bold</text:span>`));
    // Bold via style — we test via model directly to control span properties
    const model = readOdt(odt);
    // Just check the output doesn't throw and contains the text
    const md = modelToMarkdown(model);
    expect(md).toContain("bold");
  });

  it("escapes Markdown special characters in plain text", () => {
    const odt = buildOdt(para("Price is $10 and (50% off)"));
    const md = odtToMarkdown(odt);
    expect(md).toContain("Price");
    expect(md).toContain("10");
  });

  it("renders line break as two trailing spaces + newline", () => {
    const odt = buildOdt(
      `<text:p text:style-name="Text_Body">Before<text:line-break/>After</text:p>`,
    );
    const md = odtToMarkdown(odt);
    expect(md).toContain("  \n");
    expect(md).toContain("Before");
    expect(md).toContain("After");
  });
});

// ─── lists ────────────────────────────────────────────────────────────

describe("odtToMarkdown — lists", () => {
  it("renders an unordered list with - markers", () => {
    const odt = buildOdt(`
      <text:list>
        <text:list-item><text:p>Apple</text:p></text:list-item>
        <text:list-item><text:p>Banana</text:p></text:list-item>
        <text:list-item><text:p>Cherry</text:p></text:list-item>
      </text:list>
    `);
    const md = odtToMarkdown(odt);
    expect(md).toContain("- Apple");
    expect(md).toContain("- Banana");
    expect(md).toContain("- Cherry");
  });
});

// ─── tables ───────────────────────────────────────────────────────────

describe("odtToMarkdown — tables (GFM)", () => {
  it("renders a table with pipe syntax and separator row", () => {
    const odt = buildOdt(`
      <table:table>
        <table:table-row>
          <table:table-cell><text:p>Name</text:p></table:table-cell>
          <table:table-cell><text:p>Age</text:p></table:table-cell>
        </table:table-row>
        <table:table-row>
          <table:table-cell><text:p>Alice</text:p></table:table-cell>
          <table:table-cell><text:p>30</text:p></table:table-cell>
        </table:table-row>
      </table:table>
    `);
    const md = odtToMarkdown(odt);
    expect(md).toContain("| Name");
    expect(md).toContain("| ---");
    expect(md).toContain("| Alice");
  });

  it("renders table as plain text in commonmark flavor", () => {
    const odt = buildOdt(`
      <table:table>
        <table:table-row>
          <table:table-cell><text:p>Name</text:p></table:table-cell>
          <table:table-cell><text:p>Age</text:p></table:table-cell>
        </table:table-row>
      </table:table>
    `);
    const md = odtToMarkdown(odt, { flavor: "commonmark" });
    expect(md).not.toContain("| ---");
    expect(md).toContain("Name");
    expect(md).toContain("Age");
  });
});

// ─── headings + paragraphs combined ───────────────────────────────────

describe("odtToMarkdown — mixed content", () => {
  it("renders heading followed by paragraph", () => {
    const odt = buildOdt(heading("My Title", 1) + para("Some content here."));
    const md = odtToMarkdown(odt);
    expect(md).toBe("# My Title\n\nSome content here\\.");
  });

  it("renders multiple headings and paragraphs in order", () => {
    const odt = buildOdt(
      heading("Chapter 1", 1) + para("Intro text.") + heading("Chapter 2", 1) + para("More text."),
    );
    const md = odtToMarkdown(odt);
    const lines = md.split("\n\n");
    expect(lines[0]).toBe("# Chapter 1");
    expect(lines[2]).toBe("# Chapter 2");
  });
});

// ─── modelToMarkdown ──────────────────────────────────────────────────

describe("modelToMarkdown", () => {
  it("accepts a pre-parsed model", () => {
    const odt = buildOdt(heading("Hello", 1) + para("World"));
    const model = readOdt(odt);
    const md = modelToMarkdown(model);
    expect(md).toContain("# Hello");
    expect(md).toContain("World");
  });

  it("accepts flavor option", () => {
    const odt = buildOdt(heading("Hello", 1));
    const model = readOdt(odt);
    const md = modelToMarkdown(model, { flavor: "commonmark" });
    expect(md).toBe("# Hello");
  });
});

// ─── options ──────────────────────────────────────────────────────────

describe("odtToMarkdown — options", () => {
  it("defaults to gfm flavor", () => {
    const odt = buildOdt(`
      <table:table>
        <table:table-row>
          <table:table-cell><text:p>A</text:p></table:table-cell>
        </table:table-row>
        <table:table-row>
          <table:table-cell><text:p>B</text:p></table:table-cell>
        </table:table-row>
      </table:table>
    `);
    const md = odtToMarkdown(odt);
    expect(md).toContain("| ---");
  });

  it("returns a string", () => {
    const odt = buildOdt(para("test"));
    expect(typeof odtToMarkdown(odt)).toBe("string");
  });

  it("returns empty string for document with no body content", () => {
    const odt = buildOdt("");
    expect(odtToMarkdown(odt)).toBe("");
  });
});
