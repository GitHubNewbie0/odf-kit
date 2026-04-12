import { describe, it, expect } from "@jest/globals";
import { readBody, readNotes } from "../../src/docx/body-reader.js";
import type { BodyReaderContext } from "../../src/docx/body-reader.js";

// ─── Helpers ──────────────────────────────────────────────────────────

const W = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;
const R = `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;

function makeCtx(overrides?: Partial<BodyReaderContext>): BodyReaderContext {
  return {
    styles: new Map(),
    numbering: new Map(),
    relationships: new Map(),
    bookmarkNames: new Map(),
    warnings: [],
    ...overrides,
  };
}

function bodyXml(inner: string): string {
  return `<?xml version="1.0"?><w:document ${W}><w:body>${inner}</w:body></w:document>`;
}

function para(inner: string): string {
  return `<w:p>${inner}</w:p>`;
}

function run(text: string, rPr = ""): string {
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t>${text}</w:t></w:r>`;
}

// ─── readBody — paragraphs ────────────────────────────────────────────

describe("readBody — paragraphs", () => {
  it("returns empty array for empty body", () => {
    const ctx = makeCtx();
    const elements = readBody(bodyXml(""), "body", ctx);
    expect(elements).toHaveLength(0);
  });

  it("reads a single plain paragraph", () => {
    const ctx = makeCtx();
    const elements = readBody(bodyXml(para(run("Hello World"))), "body", ctx);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("paragraph");
    const p = elements[0] as import("../../src/docx/types.js").DocxParagraph;
    expect(p.runs).toHaveLength(1);
    const r = p.runs[0] as import("../../src/docx/types.js").DocxRun;
    expect(r.text).toBe("Hello World");
  });

  it("reads heading level from pStyle", () => {
    const styles = new Map([
      [
        "Heading1",
        {
          styleId: "Heading1",
          name: "heading 1",
          type: "paragraph" as const,
          headingLevel: 1,
          basedOn: null,
          rPr: null,
          pPr: null,
        },
      ],
    ]);
    const ctx = makeCtx({ styles });
    const xml = bodyXml(para(`<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run("My Heading")}`));
    const elements = readBody(xml, "body", ctx);
    const p = elements[0] as import("../../src/docx/types.js").DocxParagraph;
    expect(p.headingLevel).toBe(1);
  });

  it("reads heading level from outlineLvl (0-based → 1-based)", () => {
    const ctx = makeCtx();
    const xml = bodyXml(para(`<w:pPr><w:outlineLvl w:val="1"/></w:pPr>${run("H2 paragraph")}`));
    const elements = readBody(xml, "body", ctx);
    const p = elements[0] as import("../../src/docx/types.js").DocxParagraph;
    expect(p.headingLevel).toBe(2);
  });

  it("reads multiple paragraphs", () => {
    const ctx = makeCtx();
    const xml = bodyXml(para(run("First")) + para(run("Second")) + para(run("Third")));
    const elements = readBody(xml, "body", ctx);
    expect(elements).toHaveLength(3);
  });

  it("reads bold run formatting", () => {
    const ctx = makeCtx();
    const xml = bodyXml(para(run("Bold text", "<w:b/>")));
    const elements = readBody(xml, "body", ctx);
    const p = elements[0] as import("../../src/docx/types.js").DocxParagraph;
    const r = p.runs[0] as import("../../src/docx/types.js").DocxRun;
    expect(r.props.bold).toBe(true);
  });

  it("reads paragraph alignment", () => {
    const ctx = makeCtx();
    const xml = bodyXml(para(`<w:pPr><w:jc w:val="center"/></w:pPr>${run("Centered")}`));
    const elements = readBody(xml, "body", ctx);
    const p = elements[0] as import("../../src/docx/types.js").DocxParagraph;
    expect(p.props.alignment).toBe("center");
  });
});

// ─── readBody — tracked changes ───────────────────────────────────────

describe("readBody — tracked changes", () => {
  it("includes text from w:ins (tracked insertion)", () => {
    const ctx = makeCtx();
    const xml = bodyXml(
      para(`<w:ins w:id="1" w:author="A" w:date="2024-01-01T00:00:00Z">${run("Inserted")}</w:ins>`),
    );
    const elements = readBody(xml, "body", ctx);
    const p = elements[0] as import("../../src/docx/types.js").DocxParagraph;
    const r = p.runs.find((r) => r.type === "run") as import("../../src/docx/types.js").DocxRun;
    expect(r.text).toBe("Inserted");
  });

  it("skips text from w:del (tracked deletion)", () => {
    const ctx = makeCtx();
    const xml = bodyXml(
      para(
        `<w:del w:id="1" w:author="A" w:date="2024-01-01T00:00:00Z">${run("Deleted")}</w:del>${run("Kept")}`,
      ),
    );
    const elements = readBody(xml, "body", ctx);
    const p = elements[0] as import("../../src/docx/types.js").DocxParagraph;
    const texts = p.runs
      .filter((r) => r.type === "run")
      .map((r) => (r as import("../../src/docx/types.js").DocxRun).text);
    expect(texts).not.toContain("Deleted");
    expect(texts).toContain("Kept");
  });
});

// ─── readBody — page breaks ───────────────────────────────────────────

describe("readBody — page breaks", () => {
  it("emits DocxPageBreak from w:br type=page", () => {
    const ctx = makeCtx();
    const xml = bodyXml(para(`<w:r><w:br w:type="page"/></w:r>`));
    const elements = readBody(xml, "body", ctx);
    // Para before + pageBreak + para after (all empty in this case)
    const breakEl = elements.find((e) => e.type === "pageBreak");
    expect(breakEl).toBeDefined();
  });

  it("splits paragraph on mid-paragraph page break", () => {
    const ctx = makeCtx();
    const xml = bodyXml(para(`${run("Before")}<w:r><w:br w:type="page"/></w:r>${run("After")}`));
    const elements = readBody(xml, "body", ctx);
    expect(elements.some((e) => e.type === "pageBreak")).toBe(true);
    const paras = elements.filter(
      (e) => e.type === "paragraph",
    ) as import("../../src/docx/types.js").DocxParagraph[];
    const beforeTexts = paras[0].runs
      .filter((r) => r.type === "run")
      .map((r) => (r as import("../../src/docx/types.js").DocxRun).text);
    const afterTexts = paras[paras.length - 1].runs
      .filter((r) => r.type === "run")
      .map((r) => (r as import("../../src/docx/types.js").DocxRun).text);
    expect(beforeTexts).toContain("Before");
    expect(afterTexts).toContain("After");
  });

  it("emits pageBreak from pageBreakBefore paragraph property", () => {
    const ctx = makeCtx();
    const xml = bodyXml(para(`<w:pPr><w:pageBreakBefore/></w:pPr>${run("New page")}`));
    const elements = readBody(xml, "body", ctx);
    expect(elements[0].type).toBe("pageBreak");
    expect(elements[1].type).toBe("paragraph");
  });
});

// ─── readBody — inline elements ───────────────────────────────────────

describe("readBody — inline elements", () => {
  it("reads tab character", () => {
    const ctx = makeCtx();
    const xml = bodyXml(para(`<w:r><w:tab/></w:r>`));
    const elements = readBody(xml, "body", ctx);
    const p = elements[0] as import("../../src/docx/types.js").DocxParagraph;
    expect(p.runs.some((r) => r.type === "tab")).toBe(true);
  });

  it("reads line break", () => {
    const ctx = makeCtx();
    const xml = bodyXml(para(`<w:r><w:br/></w:r>`));
    const elements = readBody(xml, "body", ctx);
    const p = elements[0] as import("../../src/docx/types.js").DocxParagraph;
    expect(p.runs.some((r) => r.type === "lineBreak")).toBe(true);
  });

  it("reads hyperlink element", () => {
    const rels = new Map([
      [
        "rId1",
        {
          target: "https://example.com",
          external: true,
          type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        },
      ],
    ]);
    const ctx = makeCtx({ relationships: rels });
    const xml = bodyXml(
      para(`<w:hyperlink ${R} r:id="rId1"><w:r><w:t>Click here</w:t></w:r></w:hyperlink>`),
    );
    const elements = readBody(xml, "body", ctx);
    const p = elements[0] as import("../../src/docx/types.js").DocxParagraph;
    const link = p.runs.find(
      (r) => r.type === "hyperlink",
    ) as import("../../src/docx/types.js").DocxHyperlink;
    expect(link).toBeDefined();
    expect(link.url).toBe("https://example.com");
    expect(link.runs[0].text).toBe("Click here");
  });

  it("reads internal anchor hyperlink", () => {
    const ctx = makeCtx();
    const xml = bodyXml(
      para(`<w:hyperlink ${W} w:anchor="section1"><w:r><w:t>Jump</w:t></w:r></w:hyperlink>`),
    );
    const elements = readBody(xml, "body", ctx);
    const p = elements[0] as import("../../src/docx/types.js").DocxParagraph;
    const link = p.runs.find(
      (r) => r.type === "hyperlink",
    ) as import("../../src/docx/types.js").DocxHyperlink;
    expect(link.url).toBe("#section1");
    expect(link.internal).toBe(true);
  });
});

// ─── readBody — bookmarks ─────────────────────────────────────────────

describe("readBody — bookmarks (two-pass resolution)", () => {
  it("resolves bookmarkEnd name from bookmarkStart in same paragraph", () => {
    const ctx = makeCtx();
    const xml = bodyXml(
      para(
        `<w:bookmarkStart w:id="1" w:name="myBookmark"/>${run("text")}<w:bookmarkEnd w:id="1"/>`,
      ),
    );
    const elements = readBody(xml, "body", ctx);
    const p = elements[0] as import("../../src/docx/types.js").DocxParagraph;
    const start = p.runs.find(
      (r) =>
        r.type === "bookmark" &&
        (r as import("../../src/docx/types.js").DocxBookmark).position === "start",
    ) as import("../../src/docx/types.js").DocxBookmark;
    const end = p.runs.find(
      (r) =>
        r.type === "bookmark" &&
        (r as import("../../src/docx/types.js").DocxBookmark).position === "end",
    ) as import("../../src/docx/types.js").DocxBookmark;
    expect(start.name).toBe("myBookmark");
    expect(end.name).toBe("myBookmark");
  });

  it("resolves bookmarkEnd name from bookmarkStart in different paragraph (cross-paragraph)", () => {
    const ctx = makeCtx();
    const xml = bodyXml(
      para(`<w:bookmarkStart w:id="2" w:name="crossPara"/>${run("Para 1")}`) +
        para(`${run("Para 2")}<w:bookmarkEnd w:id="2"/>`),
    );
    const elements = readBody(xml, "body", ctx);
    const p2 = elements[1] as import("../../src/docx/types.js").DocxParagraph;
    const end = p2.runs.find(
      (r) => r.type === "bookmark",
    ) as import("../../src/docx/types.js").DocxBookmark;
    expect(end.name).toBe("crossPara");
  });
});

// ─── readBody — tables ────────────────────────────────────────────────

describe("readBody — tables", () => {
  it("reads a simple 1×1 table", () => {
    const ctx = makeCtx();
    const xml = bodyXml(`
      <w:tbl>
        <w:tblGrid><w:gridCol w:w="5000"/></w:tblGrid>
        <w:tr><w:tc><w:p>${run("Cell text")}</w:p></w:tc></w:tr>
      </w:tbl>
    `);
    const elements = readBody(xml, "body", ctx);
    expect(elements[0].type).toBe("table");
    const t = elements[0] as import("../../src/docx/types.js").DocxTable;
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].cells).toHaveLength(1);
  });

  it("reads column widths from tblGrid", () => {
    const ctx = makeCtx();
    const xml = bodyXml(`
      <w:tbl>
        <w:tblGrid>
          <w:gridCol w:w="2880"/>
          <w:gridCol w:w="5760"/>
        </w:tblGrid>
        <w:tr>
          <w:tc><w:p/></w:tc>
          <w:tc><w:p/></w:tc>
        </w:tr>
      </w:tbl>
    `);
    const elements = readBody(xml, "body", ctx);
    const t = elements[0] as import("../../src/docx/types.js").DocxTable;
    expect(t.columnWidths).toHaveLength(2);
    // 2880 twips = 5.08cm
    expect(t.columnWidths[0]).toBeCloseTo(5.08, 1);
  });

  it("reads colSpan from gridSpan", () => {
    const ctx = makeCtx();
    const xml = bodyXml(`
      <w:tbl>
        <w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>
        <w:tr>
          <w:tc>
            <w:tcPr><w:gridSpan w:val="2"/></w:tcPr>
            <w:p>${run("Merged")}</w:p>
          </w:tc>
        </w:tr>
      </w:tbl>
    `);
    const elements = readBody(xml, "body", ctx);
    const t = elements[0] as import("../../src/docx/types.js").DocxTable;
    expect(t.rows[0].cells[0].colSpan).toBe(2);
  });

  it("reads vMerge restart and continue", () => {
    const ctx = makeCtx();
    const xml = bodyXml(`
      <w:tbl>
        <w:tblGrid><w:gridCol w:w="3000"/></w:tblGrid>
        <w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p/></w:tc></w:tr>
        <w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr>
      </w:tbl>
    `);
    const elements = readBody(xml, "body", ctx);
    const t = elements[0] as import("../../src/docx/types.js").DocxTable;
    expect(t.rows[0].cells[0].vMerge).toBe("restart");
    expect(t.rows[1].cells[0].vMerge).toBe("continue");
  });
});

// ─── readBody — fldSimple ─────────────────────────────────────────────

describe("readBody — fldSimple fields", () => {
  it("reads fldSimple HYPERLINK as a hyperlink element", () => {
    const ctx = makeCtx();
    const xml = bodyXml(
      para(
        `<w:fldSimple w:instr=' HYPERLINK "https://example.com" '><w:r><w:t>Link text</w:t></w:r></w:fldSimple>`,
      ),
    );
    const elements = readBody(xml, "body", ctx);
    const p = elements[0] as import("../../src/docx/types.js").DocxParagraph;
    const link = p.runs.find(
      (r) => r.type === "hyperlink",
    ) as import("../../src/docx/types.js").DocxHyperlink;
    expect(link).toBeDefined();
    expect(link.url).toBe("https://example.com");
  });
});

// ─── readNotes ────────────────────────────────────────────────────────

describe("readNotes", () => {
  it("parses footnote content", () => {
    const ctx = makeCtx();
    const xml = `<?xml version="1.0"?><w:footnotes ${W}>
      <w:footnote w:id="1">
        <w:p>${run("Footnote text")}</w:p>
      </w:footnote>
    </w:footnotes>`;
    const notes = readNotes(xml, "footnote", ctx);
    expect(notes.has("1")).toBe(true);
    const note = notes.get("1")!;
    const p = note.body[0] as import("../../src/docx/types.js").DocxParagraph;
    const r = p.runs[0] as import("../../src/docx/types.js").DocxRun;
    expect(r.text).toBe("Footnote text");
  });

  it("skips separator pseudo-notes", () => {
    const ctx = makeCtx();
    const xml = `<?xml version="1.0"?><w:footnotes ${W}>
      <w:footnote w:id="0" w:type="separator"><w:p/></w:footnote>
      <w:footnote w:id="1"><w:p>${run("Real note")}</w:p></w:footnote>
    </w:footnotes>`;
    const notes = readNotes(xml, "footnote", ctx);
    expect(notes.has("0")).toBe(false);
    expect(notes.has("1")).toBe(true);
  });

  it("parses endnote content", () => {
    const ctx = makeCtx();
    const xml = `<?xml version="1.0"?><w:endnotes ${W}>
      <w:endnote w:id="2">
        <w:p>${run("Endnote text")}</w:p>
      </w:endnote>
    </w:endnotes>`;
    const notes = readNotes(xml, "endnote", ctx);
    expect(notes.get("2")).toBeDefined();
  });
});
