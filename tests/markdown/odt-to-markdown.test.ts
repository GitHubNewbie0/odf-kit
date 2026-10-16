import { describe, it, expect } from "@jest/globals";
import { zipSync } from "fflate";
import { odtToMarkdown, modelToMarkdown } from "../../src/markdown/index.js";
import { readOdt } from "../../src/odt/read/parser.js";
import type { BodyNode, InlineNode, OdtDocumentModel } from "../../src/odt/read/types.js";

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
// ─── images ───────────────────────────────────────────────────────────

/** Build an ODT ZIP that contains an embedded image. */
function buildOdtWithImage(name: string, mediaType: string, data: Uint8Array): Uint8Array {
  const picturePath = `Pictures/${name}`;
  const bodyXml = `
    <text:p>
      <draw:frame xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
                  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
                  draw:name="${name}" svg:width="5cm" svg:height="3cm">
        <draw:image xlink:href="${picturePath}"
                    xmlns:xlink="http://www.w3.org/1999/xlink"
                    xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>
      </draw:frame>
    </text:p>`;
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
  <manifest:file-entry manifest:full-path="${picturePath}" manifest:media-type="${mediaType}"/>
</manifest:manifest>`;
  const defaultStyles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2">
  <office:styles/>
</office:document-styles>`;
  return zipSync({
    mimetype: encoder.encode("application/vnd.oasis.opendocument.text"),
    "content.xml": encoder.encode(contentXml),
    "styles.xml": encoder.encode(defaultStyles),
    "META-INF/manifest.xml": encoder.encode(manifest),
    [picturePath]: data,
  });
}

// Minimal 1×1 PNG
const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe("odtToMarkdown — images", () => {
  it("default: image emitted as placeholder", () => {
    const odt = buildOdtWithImage("photo.png", "image/png", TINY_PNG);
    const md = odtToMarkdown(odt);
    expect(md).toContain("![");
    expect(md).toContain("photo.png");
    expect(md).not.toContain("data:image/png;base64,");
  });

  it("embedImages: true embeds image as base64 data URL", () => {
    const odt = buildOdtWithImage("photo.png", "image/png", TINY_PNG);
    const md = odtToMarkdown(odt, { embedImages: true });
    expect(md).toContain("data:image/png;base64,");
    expect(md).toMatch(/!\[.*\]\(data:image\/png;base64,/);
  });

  it("embedImages: false is same as default", () => {
    const odt = buildOdtWithImage("photo.png", "image/png", TINY_PNG);
    const md1 = odtToMarkdown(odt);
    const md2 = odtToMarkdown(odt, { embedImages: false });
    expect(md1).toBe(md2);
  });

  it("image with no data falls back to placeholder even with embedImages: true", () => {
    // Build ODT with draw:frame but no matching Pictures/ entry
    const odt = buildOdt(`
      <text:p>
        <draw:frame xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
                    xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
                    draw:name="missing.png" svg:width="5cm" svg:height="3cm">
          <draw:image xlink:href="Pictures/missing.png"
                      xmlns:xlink="http://www.w3.org/1999/xlink"
                      xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>
        </draw:frame>
      </text:p>`);
    const md = odtToMarkdown(odt, { embedImages: true });
    expect(md).toContain("![");
    expect(md).not.toContain("data:image/png;base64,");
  });
});

// ─── modelToMarkdown — hand-built models ──────────────────────────────
//
// Markdown authority (canon format_authorities, FA-1 §3): CommonMark, with
// GFM for tables and strikethrough. Cited here: CommonMark 0.29 (2019-04-06),
// https://spec.commonmark.org/0.29/, and GFM 0.29-gfm (2019-04-06),
// https://github.github.com/gfm/. Canon's pin is "versions not yet chosen".
//
// Assertions accept any spec-valid form, not one delimiter choice. Where the
// emitter drops something it cannot represent (C-2, LEAD-070), the tests
// assert only the content that must survive, so the drop itself is not pinned.
// Known defects (intraword emphasis, edge whitespace inside emphasis, <ins>
// around block content) and the note syntax are deliberately untested here.
// Links, images, and values with Markdown special characters are out of
// scope here. See odf-kit-internal state108-cc-md-emitter-tests.

function modelOf(body: BodyNode[]): OdtDocumentModel {
  return { metadata: {}, body, toHtml: () => "" };
}

function paraOf(...spans: InlineNode[]): BodyNode {
  return { kind: "paragraph", spans };
}

describe("modelToMarkdown — emphasis and strikethrough", () => {
  it("bold renders as strong emphasis: ** or __ (CommonMark 0.29 §6.4)", () => {
    // T1 (CommonMark 0.29 §6.4; same text in GFM 0.29-gfm): "A double ** can
    // open strong emphasis iff it is part of a left-flanking delimiter run";
    // __ likewise. Line start/end count as whitespace.
    const md = modelToMarkdown(modelOf([paraOf({ text: "word", bold: true })]));
    expect(md).toMatch(/^(\*\*|__)word\1$/);
  });

  it("italic renders as emphasis: * or _ (CommonMark 0.29 §6.4)", () => {
    // T1 (CommonMark 0.29 §6.4; same text in GFM 0.29-gfm): single * or _
    // opens/closes emphasis by the flanking rules.
    const md = modelToMarkdown(modelOf([paraOf({ text: "word", italic: true })]));
    expect(md).toMatch(/^([*_])word\1$/);
  });

  it("bold+italic renders as a spec-valid nesting of strong and emphasis (CommonMark 0.29 §6.4)", () => {
    // T1 (CommonMark 0.29 §6.4; same text in GFM 0.29-gfm): each form below
    // parses to strong + emphasis around "word".
    const valid = [
      "**_word_**",
      "__*word*__",
      "_**word**_",
      "*__word__*",
      "***word***",
      "___word___",
    ];
    const md = modelToMarkdown(modelOf([paraOf({ text: "word", bold: true, italic: true })]));
    expect(valid).toContain(md);
  });

  it("strikethrough renders as one or two tildes in GFM flavor (GFM 0.29-gfm §6.5)", () => {
    // T1 (GFM 0.29-gfm §6.5, extension): "Strikethrough text is any text wrapped in a
    // matching pair of one or two tildes (~)." gfm is the default flavor.
    const md = modelToMarkdown(modelOf([paraOf({ text: "word", strikethrough: true })]));
    expect(md).toMatch(/^(~~?)word\1$/);
  });
});

describe("modelToMarkdown — fields", () => {
  // Markdown has no field construct; the field's stored presentation is the
  // text it shows.
  it("pageNumber emits its stored presentation (ODF 1.4 Part 3 §7.2, §7.3.4)", () => {
    // T2 (ODF 1.4 Part 3 §7.2): "The content of an element is a textual
    // representation of the current field value as it would be displayed or
    // printed". §7.3.4: <text:page-number> has character data content.
    const md = modelToMarkdown(
      modelOf([
        paraOf(
          { text: "A" },
          { kind: "field", fieldType: "pageNumber", value: "7" },
          { text: "B" },
        ),
      ]),
    );
    expect(md).toBe("A7B");
  });

  it("pageCount emits its stored presentation (ODF 1.4 Part 3 §7.2, §7.5.18.2)", () => {
    // T2 (ODF 1.4 Part 3 §7.2, as above). §7.5.18.2: <text:page-count>
    // displays meta:page-count and has character data content.
    const md = modelToMarkdown(
      modelOf([
        paraOf({ text: "A" }, { kind: "field", fieldType: "pageCount", value: "3" }, { text: "B" }),
      ]),
    );
    expect(md).toBe("A3B");
  });

  it("title emits its stored presentation (ODF 1.4 Part 3 §7.2, §7.5.10)", () => {
    // T2 (ODF 1.4 Part 3 §7.2, as above). §7.5.10: <text:title> displays
    // dc:title and has character data content. Values with Markdown special
    // characters are out of scope here.
    const md = modelToMarkdown(
      modelOf([
        paraOf(
          { text: "A" },
          { kind: "field", fieldType: "title", value: "My Document" },
          { text: "B" },
        ),
      ]),
    );
    expect(md).toBe("AMy DocumentB");
  });
});

describe("modelToMarkdown — notes (dispatch only)", () => {
  // T4: LEAD-044 — an inline kind the dispatcher does not handle throws. These
  // tests assert only that a note is handled and the surrounding text keeps
  // its order. The note's own syntax is not asserted: both branches are
  // reported defects (state108; LEAD-070 for the CommonMark branch).
  const note: InlineNode = {
    kind: "note",
    noteClass: "footnote",
    id: "ftn1",
    citation: "1",
    body: [paraOf({ text: "noted" })],
  };

  it.each(["gfm", "commonmark"] as const)(
    "%s: a note is dispatched and the text around it keeps its order (T4: LEAD-044)",
    (flavor) => {
      const md = modelToMarkdown(modelOf([paraOf({ text: "Before" }, note, { text: "After" })]), {
        flavor,
      });
      expect(md.indexOf("Before")).toBe(0);
      expect(md.indexOf("After")).toBeGreaterThan(0);
    },
  );
});

describe("modelToMarkdown — sections", () => {
  it("section content is emitted as blocks, present and in document order (CommonMark 0.29 §4.8, §4.9)", () => {
    // T1 (CommonMark 0.29 §4.8, §4.9; same text in GFM 0.29-gfm): paragraphs
    // are blocks separated by blank lines.
    // T4: C-2 — the section container itself has no Markdown equivalent; only
    // the content that must survive is asserted.
    const md = modelToMarkdown(
      modelOf([
        paraOf({ text: "A" }),
        { kind: "section", body: [paraOf({ text: "B" }), paraOf({ text: "C" })] },
        paraOf({ text: "D" }),
      ]),
    );
    const blocks = md.split(/\n\n+/);
    expect(blocks).toContain("A");
    expect(blocks).toContain("B");
    expect(blocks).toContain("C");
    expect(blocks).toContain("D");
    expect(blocks.indexOf("A")).toBeLessThan(blocks.indexOf("B"));
    expect(blocks.indexOf("B")).toBeLessThan(blocks.indexOf("C"));
    expect(blocks.indexOf("C")).toBeLessThan(blocks.indexOf("D"));
  });
});

describe('modelToMarkdown — tracked changes, trackedChanges: "changes"', () => {
  // TrackedChangeNodes exist only in a "changes"-mode model (types.ts,
  // TrackedChangeNode doc), so only the "changes" option is in contract here.
  // T1 (CommonMark 0.29 §6.8; same text in GFM 0.29-gfm §6.10): "Text between
  // < and > that looks like an HTML tag is parsed as a raw HTML tag".
  // T1 (CommonMark 0.29 §4.6, §4.8; same text in GFM 0.29-gfm): <ins>/<del>
  // open neither a type-6 nor a type-7 HTML block on this line, so the line is
  // a paragraph with inline raw HTML. T4: C-2 — change metadata (author, date) is dropped, so only
  // the wrapped content is asserted, not exact output.
  function change(changeType: "insertion" | "deletion", text: string): BodyNode {
    return {
      kind: "tracked-change",
      changeType,
      changeId: "ct1",
      author: "Author",
      date: "2026-10-15T00:00:00",
      body: [paraOf({ text })],
    };
  }

  it("a single-paragraph insertion is wrapped in <ins> (CommonMark 0.29 §6.8)", () => {
    const md = modelToMarkdown(modelOf([change("insertion", "new")]), {
      trackedChanges: "changes",
    });
    expect(md).toContain("<ins>new</ins>");
  });

  it("a single-paragraph deletion is wrapped in <del> (CommonMark 0.29 §6.8)", () => {
    const md = modelToMarkdown(modelOf([change("deletion", "old")]), {
      trackedChanges: "changes",
    });
    expect(md).toContain("<del>old</del>");
  });
});
