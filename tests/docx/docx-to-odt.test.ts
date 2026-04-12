import { describe, it, expect } from "@jest/globals";
import { zipSync, unzipSync } from "fflate";
import { docxToOdt } from "../../src/docx/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const W = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;
const R = `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;

/** Build a minimal valid DOCX ZIP from provided parts. */
function buildDocx(parts: Record<string, string>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(parts)) {
    files[path] = encoder.encode(content);
  }
  return zipSync(files);
}

/** Build a minimal DOCX with a given body XML snippet. */
function buildSimpleDocx(
  bodyXml: string,
  opts: { styles?: string; numbering?: string; relsExtra?: string } = {},
): Uint8Array {
  const relsExtra = opts.relsExtra ?? "";
  const extras: Record<string, string> = {};
  if (opts.styles) extras["word/styles.xml"] = opts.styles;
  if (opts.numbering) extras["word/numbering.xml"] = opts.numbering;

  return buildDocx({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsExtra}</Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?><w:document ${W} ${R}><w:body>${bodyXml}</w:body></w:document>`,
    ...extras,
  });
}

/** Unzip an ODT and return content.xml as a string. */
function getContentXml(odtBytes: Uint8Array): string {
  const zip = unzipSync(odtBytes);
  return decoder.decode(zip["content.xml"]);
}

function para(inner: string): string {
  return `<w:p>${inner}</w:p>`;
}

function run(text: string, rPr = ""): string {
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t>${text}</w:t></w:r>`;
}

// ─── docxToOdt — basic ───────────────────────────────────────────────

describe("docxToOdt — basic", () => {
  it("returns bytes and warnings", async () => {
    const docx = buildSimpleDocx(para(run("Hello")));
    const result = await docxToOdt(docx);
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("accepts ArrayBuffer input", async () => {
    const docx = buildSimpleDocx(para(run("Hello")));
    const result = await docxToOdt(docx.buffer as ArrayBuffer);
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("produces a valid ZIP (has content.xml)", async () => {
    const docx = buildSimpleDocx(para(run("Test")));
    const { bytes } = await docxToOdt(docx);
    const zip = unzipSync(bytes);
    expect(zip["content.xml"]).toBeDefined();
  });

  it("produces a valid ZIP (has mimetype)", async () => {
    const docx = buildSimpleDocx(para(run("Test")));
    const { bytes } = await docxToOdt(docx);
    const zip = unzipSync(bytes);
    expect(zip["mimetype"]).toBeDefined();
    const mime = decoder.decode(zip["mimetype"]);
    expect(mime).toBe("application/vnd.oasis.opendocument.text");
  });

  it("throws on invalid input (not a ZIP)", async () => {
    const notZip = encoder.encode("this is not a zip file");
    await expect(docxToOdt(notZip)).rejects.toThrow();
  });
});

// ─── docxToOdt — text content ─────────────────────────────────────────

describe("docxToOdt — text content round-trip", () => {
  it("preserves paragraph text in content.xml", async () => {
    const docx = buildSimpleDocx(para(run("Hello World")));
    const { bytes } = await docxToOdt(docx);
    expect(getContentXml(bytes)).toContain("Hello World");
  });

  it("preserves text from multiple paragraphs", async () => {
    const docx = buildSimpleDocx(para(run("First")) + para(run("Second")));
    const { bytes } = await docxToOdt(docx);
    const xml = getContentXml(bytes);
    expect(xml).toContain("First");
    expect(xml).toContain("Second");
  });

  it("preserves bold formatting in content.xml", async () => {
    const docx = buildSimpleDocx(para(run("Bold text", "<w:b/>")));
    const { bytes } = await docxToOdt(docx);
    const xml = getContentXml(bytes);
    expect(xml).toContain("Bold text");
    expect(xml).toContain("fo:font-weight");
  });

  it("preserves italic formatting", async () => {
    const docx = buildSimpleDocx(para(run("Italic text", "<w:i/>")));
    const { bytes } = await docxToOdt(docx);
    const xml = getContentXml(bytes);
    expect(xml).toContain("Italic text");
    expect(xml).toContain("fo:font-style");
  });

  it("preserves heading as text:h element", async () => {
    const stylesXml = `<?xml version="1.0"?><w:styles ${W}>
      <w:style w:type="paragraph" w:styleId="Heading1">
        <w:name w:val="heading 1"/>
      </w:style>
    </w:styles>`;
    const docx = buildSimpleDocx(
      para(`<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run("My Heading")}`),
      { styles: stylesXml },
    );
    const { bytes } = await docxToOdt(docx);
    const xml = getContentXml(bytes);
    expect(xml).toContain("text:h");
    expect(xml).toContain("My Heading");
  });

  it("preserves hyperlink text", async () => {
    const relsExtra = `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>`;
    const docx = buildSimpleDocx(
      para(`<w:hyperlink r:id="rId1"><w:r><w:t>Click here</w:t></w:r></w:hyperlink>`),
      { relsExtra },
    );
    const { bytes } = await docxToOdt(docx);
    const xml = getContentXml(bytes);
    expect(xml).toContain("Click here");
    expect(xml).toContain("xlink:href");
  });
});

// ─── docxToOdt — page break ───────────────────────────────────────────

describe("docxToOdt — page break", () => {
  it("emits page break element for w:br type=page", async () => {
    const docx = buildSimpleDocx(
      para(run("Before")) + para(`<w:r><w:br w:type="page"/></w:r>`) + para(run("After")),
    );
    const { bytes } = await docxToOdt(docx);
    const xml = getContentXml(bytes);
    expect(xml).toContain("fo:break-before");
    expect(xml).toContain("Before");
    expect(xml).toContain("After");
  });
});

// ─── docxToOdt — table ────────────────────────────────────────────────

describe("docxToOdt — table", () => {
  it("preserves table content in content.xml", async () => {
    const docx = buildSimpleDocx(`
      <w:tbl>
        <w:tblGrid><w:gridCol w:w="4320"/><w:gridCol w:w="4320"/></w:tblGrid>
        <w:tr>
          <w:tc><w:p>${run("Name")}</w:p></w:tc>
          <w:tc><w:p>${run("Age")}</w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:p>${run("Alice")}</w:p></w:tc>
          <w:tc><w:p>${run("30")}</w:p></w:tc>
        </w:tr>
      </w:tbl>
    `);
    const { bytes } = await docxToOdt(docx);
    const xml = getContentXml(bytes);
    expect(xml).toContain("table:table");
    expect(xml).toContain("Name");
    expect(xml).toContain("Alice");
    expect(xml).toContain("30");
  });
});

// ─── docxToOdt — lists ────────────────────────────────────────────────

describe("docxToOdt — lists", () => {
  it("preserves bullet list items", async () => {
    const numberingXml = `<?xml version="1.0"?><w:numbering ${W}>
      <w:abstractNum w:abstractNumId="0">
        <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/></w:lvl>
      </w:abstractNum>
      <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
    </w:numbering>`;
    const docx = buildSimpleDocx(
      para(
        `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run("Item 1")}`,
      ) +
        para(
          `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run("Item 2")}`,
        ),
      { numbering: numberingXml },
    );
    const { bytes } = await docxToOdt(docx);
    const xml = getContentXml(bytes);
    expect(xml).toContain("text:list");
    expect(xml).toContain("Item 1");
    expect(xml).toContain("Item 2");
  });

  it("preserves numbered list items", async () => {
    const numberingXml = `<?xml version="1.0"?><w:numbering ${W}>
      <w:abstractNum w:abstractNumId="0">
        <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl>
      </w:abstractNum>
      <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
    </w:numbering>`;
    const docx = buildSimpleDocx(
      para(
        `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run("First")}`,
      ) +
        para(
          `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run("Second")}`,
        ),
      { numbering: numberingXml },
    );
    const { bytes } = await docxToOdt(docx);
    const xml = getContentXml(bytes);
    expect(xml).toContain("First");
    expect(xml).toContain("Second");
  });
});

// ─── docxToOdt — metadata ─────────────────────────────────────────────

describe("docxToOdt — metadata", () => {
  it("reads title from docProps/core.xml", async () => {
    const docx = buildDocx({
      "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
      "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
      "word/document.xml": `<?xml version="1.0"?><w:document ${W}><w:body>${para(run("content"))}</w:body></w:document>`,
      "docProps/core.xml": `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>My Report</dc:title><dc:creator>Alice</dc:creator></cp:coreProperties>`,
    });
    const { bytes } = await docxToOdt(docx);
    const zip = unzipSync(bytes);
    const metaXml = decoder.decode(zip["meta.xml"]);
    expect(metaXml).toContain("My Report");
    expect(metaXml).toContain("Alice");
  });

  it("options.metadata overrides docProps title", async () => {
    const docx = buildSimpleDocx(para(run("content")));
    const { bytes } = await docxToOdt(docx, {
      metadata: { title: "Overridden Title" },
    });
    const zip = unzipSync(bytes);
    const metaXml = decoder.decode(zip["meta.xml"]);
    expect(metaXml).toContain("Overridden Title");
  });
});

// ─── docxToOdt — page layout ──────────────────────────────────────────

describe("docxToOdt — page layout", () => {
  it("reads page size from sectPr", async () => {
    // US Letter: 12240 × 15840 twips
    const docx = buildSimpleDocx(
      para(run("content")) + `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>`,
    );
    const { bytes } = await docxToOdt(docx);
    const zip = unzipSync(bytes);
    const stylesXml = decoder.decode(zip["styles.xml"]);
    // 12240 twips = 21.59cm ≈ letter width
    expect(stylesXml).toContain("21.59");
  });

  it("options.pageFormat overrides DOCX page size when no DOCX layout", async () => {
    const docx = buildSimpleDocx(para(run("content")));
    const { bytes } = await docxToOdt(docx, { pageFormat: "letter" });
    const zip = unzipSync(bytes);
    const stylesXml = decoder.decode(zip["styles.xml"]);
    expect(stylesXml).toContain("21.59");
  });
});

// ─── docxToOdt — font size and color ──────────────────────────────────

describe("docxToOdt — run formatting", () => {
  it("preserves font size in content.xml", async () => {
    // w:sz=28 half-points = 14pt
    const docx = buildSimpleDocx(para(run("Big text", `<w:sz w:val="28"/>`)));
    const { bytes } = await docxToOdt(docx);
    const xml = getContentXml(bytes);
    expect(xml).toContain("14");
    expect(xml).toContain("Big text");
  });

  it("preserves text color in content.xml", async () => {
    const docx = buildSimpleDocx(para(run("Red text", `<w:color w:val="FF0000"/>`)));
    const { bytes } = await docxToOdt(docx);
    const xml = getContentXml(bytes);
    expect(xml).toContain("Red text");
    expect(xml).toContain("#FF0000");
  });

  it("preserves underline in content.xml", async () => {
    const docx = buildSimpleDocx(para(run("Underlined", `<w:u w:val="single"/>`)));
    const { bytes } = await docxToOdt(docx);
    const xml = getContentXml(bytes);
    expect(xml).toContain("Underlined");
    expect(xml).toContain("underline");
  });
});

// ─── docxToOdt — footnotes ────────────────────────────────────────────

describe("docxToOdt — footnotes", () => {
  it("renders footnote reference as superscript marker and appends content", async () => {
    const footnotesXml = `<?xml version="1.0"?><w:footnotes ${W}>
      <w:footnote w:id="1">
        <w:p>${`<w:r><w:t>Footnote content here</w:t></w:r>`}</w:p>
      </w:footnote>
    </w:footnotes>`;

    const docx = buildDocx({
      "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
      "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>`,
      "word/document.xml": `<?xml version="1.0"?><w:document ${W}><w:body>${para(`${run("Main text")}<w:r><w:footnoteReference w:id="1"/></w:r>`)}</w:body></w:document>`,
      "word/footnotes.xml": footnotesXml,
    });

    const { bytes } = await docxToOdt(docx);
    const xml = getContentXml(bytes);
    expect(xml).toContain("Main text");
    expect(xml).toContain("[1]");
    expect(xml).toContain("Footnote content here");
  });
});
