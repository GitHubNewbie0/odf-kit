/**
 * DOCX w:spacing line spacing → the ODF line-height setting (#106, #86;
 * reported by lroder).
 *
 * T4: D106-5. w:lineRule "auto" becomes an fo:line-height percent, "exact"
 * an fo:line-height length, "atLeast" a style:line-height-at-least length,
 * each converted exactly (D8). A value with no ODF form writes no attribute
 * and adds a warnings entry (C-2 Part 3); nothing throws.
 *
 * ECMA-376 Part 1 §17.3.1.33 (first pass 8.6): w:line is "twentieths of a
 * point" when w:lineRule is atLeast or exact, and "240ths of a line" when it
 * is auto; an omitted w:lineRule "shall be assumed to be of a value auto if
 * a line attribute value is present" (l.12429); an omitted w:line takes "the
 * value previously set in the style hierarchy". §17.18.81: w:line is
 * ST_SignedTwipsMeasure, an integer or a universal measure (§22.9.2.15).
 */
import { describe, expect, test } from "@jest/globals";
import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import fc from "fast-check";
import { docxToOdt } from "../../src/docx/to-odt/index.js";

const W = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;

function buildDocx(bodyXml: string, stylesXml?: string): Uint8Array {
  const parts: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${bodyXml}</w:body></w:document>`,
  };
  if (stylesXml !== undefined) {
    parts["word/styles.xml"] =
      `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}>${stylesXml}</w:styles>`;
  }
  const files: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(parts)) files[path] = strToU8(content);
  return zipSync(files);
}

function xmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** One paragraph whose w:pPr carries `spacing` (a w:spacing element). */
async function convert(spacing: string, stylesXml?: string, pPrExtra = "") {
  const { bytes, warnings } = await docxToOdt(
    buildDocx(`<w:p><w:pPr>${pPrExtra}${spacing}</w:pPr><w:r><w:t>x</w:t></w:r></w:p>`, stylesXml),
  );
  const xml = strFromU8(unzipSync(bytes)["content.xml"]);
  const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(xml)?.[1];
  return {
    lineHeight: attr("fo:line-height"),
    atLeast: attr("style:line-height-at-least"),
    lineWarnings: warnings.filter((w) => w.includes("w:line")),
  };
}

function spacing(line: string, rule?: string): string {
  return `<w:spacing w:line="${xmlAttr(line)}"${rule === undefined ? "" : ` w:lineRule="${xmlAttr(rule)}"`}/>`;
}

describe("docxToOdt — w:spacing exact and atLeast (T4: D106-5)", () => {
  test('exact 240 → fo:line-height="12pt" (ECMA §17.3.1.33 "twentieths of a point")', async () => {
    const r = await convert(spacing("240", "exact"));
    expect(r).toEqual({ lineHeight: "12pt", atLeast: undefined, lineWarnings: [] });
  });

  test('atLeast 240 → style:line-height-at-least="12pt" (ECMA §17.18.48 "at least the value specified")', async () => {
    const r = await convert(spacing("240", "atLeast"));
    expect(r).toEqual({ lineHeight: undefined, atLeast: "12pt", lineWarnings: [] });
  });

  test('exact 259 → "12.95pt": the shortest decimal in [12.925, 12.975)pt (T4: D8 Case 2, D8b)', async () => {
    expect((await convert(spacing("259", "exact"))).lineHeight).toBe("12.95pt");
  });

  test('exact "1.5pi" → fo:line-height="1.5pc" (T4: D106-5 third bullet; ECMA §22.9.2.15 "1 pi = 12 pt", "1 pc = 12 pt")', async () => {
    expect((await convert(spacing("1.5pi", "exact"))).lineHeight).toBe("1.5pc");
  });

  test('atLeast "12mm" → style:line-height-at-least="12mm" (T4: D106-5, D8: handed truth verbatim)', async () => {
    expect((await convert(spacing("12mm", "atLeast"))).atLeast).toBe("12mm");
  });
});

describe("docxToOdt — w:spacing auto (T4: D106-5; ECMA §17.3.1.33 '240ths of a line')", () => {
  test.each([
    ["360", "150%"],
    ["276", "115%"],
    ["259", "108%"],
  ])(
    "auto %p → fo:line-height=%p: the shortest decimal in [t−½, t+½)/240 × 100 (259: [107.708…, 108.125)) (T4: D106-5, D8 Case 2)",
    async (line, expected) => {
      const r = await convert(spacing(line, "auto"));
      expect(r).toEqual({ lineHeight: expected, atLeast: undefined, lineWarnings: [] });
    },
  );

  test('w:line="360" with no w:lineRule → "150%" (ECMA §17.3.1.33 l.12429: omitted lineRule is auto)', async () => {
    expect((await convert(spacing("360"))).lineHeight).toBe("150%");
  });

  test('w:line absent → inherited from the style hierarchy: style auto 360, paragraph none → "150%" (ECMA §17.3.1.33 "previously set in the style hierarchy")', async () => {
    const styles =
      '<w:style w:type="paragraph" w:styleId="S"><w:name w:val="S"/>' +
      '<w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr></w:style>';
    expect((await convert("", styles, '<w:pStyle w:val="S"/>')).lineHeight).toBe("150%");
  });
});

describe("docxToOdt — values with no ODF form: no attribute, one warning, no throw (T4: D106-5 third bullet; C-2 Part 3)", () => {
  test.each([
    ["12pt", "auto", "a unit under auto (ECMA §17.3.1.33: auto counts 240ths of a line)"],
    ["-240", "exact", "a negative exact (T1: nonNegativeLength rng:12465/7070)"],
    ["-240", "atLeast", "a negative atLeast (T1: nonNegativeLength rng:12474/7070)"],
    ["-240", "auto", "a negative auto (T4: D106-4 third bullet)"],
  ])("w:line=%p w:lineRule=%p → %s", async (line, rule) => {
    const r = await convert(spacing(line, rule));
    expect(r.lineHeight).toBeUndefined();
    expect(r.atLeast).toBeUndefined();
    expect(r.lineWarnings).toHaveLength(1);
  });

  test("property: for any w:line and w:lineRule, docxToOdt resolves, and either writes a T1 value or warns (T4: D106-5; C-2 Part 3)", async () => {
    const line = fc.oneof(
      fc.string(),
      fc.stringMatching(/^[-+]?\d{0,5}(\.\d{0,3})?(mm|cm|in|pt|pc|pi|px|em)?$/),
      fc.constant("9".repeat(400)),
    );
    const rule = fc.constantFrom("auto", "exact", "atLeast", "bogus", undefined);
    await fc.assert(
      fc.asyncProperty(line, rule, async (l, r) => {
        const out = await convert(spacing(l, r));
        const written = out.lineHeight ?? out.atLeast;
        if (written === undefined) expect(out.lineWarnings.length).toBeGreaterThan(0);
        else expect(written).toMatch(/^(\d+(\.\d*)?|\.\d+)((cm|mm|in|pt|pc)|%)$/);
      }),
      { numRuns: 200 },
    );
  });
});
