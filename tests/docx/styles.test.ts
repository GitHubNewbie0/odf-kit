import { describe, it, expect } from "@jest/globals";
import { parseStyles, parseRPr, parsePPr } from "../../src/docx/styles.js";
import { parseXml } from "../../src/reader/xml-parser.js";

// ─── Helpers ──────────────────────────────────────────────────────────

function stylesXml(inner: string): string {
  return `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${inner}</w:styles>`;
}

function rPrEl(inner: string) {
  return parseXml(
    `<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${inner}</w:rPr>`,
  );
}

function pPrEl(inner: string) {
  return parseXml(
    `<w:pPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${inner}</w:pPr>`,
  );
}

// ─── parseStyles — heading detection ─────────────────────────────────

describe("parseStyles — heading detection", () => {
  it("detects heading 1 style by name", () => {
    const xml = stylesXml(`
      <w:style w:type="paragraph" w:styleId="Heading1">
        <w:name w:val="heading 1"/>
      </w:style>`);
    const map = parseStyles(xml);
    expect(map.get("Heading1")!.headingLevel).toBe(1);
  });

  it("detects heading 6 style by name", () => {
    const xml = stylesXml(`
      <w:style w:type="paragraph" w:styleId="Heading6">
        <w:name w:val="heading 6"/>
      </w:style>`);
    const map = parseStyles(xml);
    expect(map.get("Heading6")!.headingLevel).toBe(6);
  });

  it("ignores heading 7+ (out of ODT range)", () => {
    const xml = stylesXml(`
      <w:style w:type="paragraph" w:styleId="Heading7">
        <w:name w:val="heading 7"/>
      </w:style>`);
    const map = parseStyles(xml);
    expect(map.get("Heading7")!.headingLevel).toBeNull();
  });

  it("maps title style to heading level 1", () => {
    const xml = stylesXml(`
      <w:style w:type="paragraph" w:styleId="Title">
        <w:name w:val="title"/>
      </w:style>`);
    const map = parseStyles(xml);
    expect(map.get("Title")!.headingLevel).toBe(1);
  });

  it("maps subtitle style to heading level 2", () => {
    const xml = stylesXml(`
      <w:style w:type="paragraph" w:styleId="Subtitle">
        <w:name w:val="subtitle"/>
      </w:style>`);
    const map = parseStyles(xml);
    expect(map.get("Subtitle")!.headingLevel).toBe(2);
  });

  it("detects heading from outlineLvl (0-based → 1-based)", () => {
    const xml = stylesXml(`
      <w:style w:type="paragraph" w:styleId="Custom">
        <w:name w:val="custom heading"/>
        <w:pPr><w:outlineLvl w:val="1"/></w:pPr>
      </w:style>`);
    const map = parseStyles(xml);
    expect(map.get("Custom")!.headingLevel).toBe(2);
  });

  it("style name match takes priority over outlineLvl", () => {
    const xml = stylesXml(`
      <w:style w:type="paragraph" w:styleId="Heading3">
        <w:name w:val="heading 3"/>
        <w:pPr><w:outlineLvl w:val="5"/></w:pPr>
      </w:style>`);
    const map = parseStyles(xml);
    // Name says H3, outlineLvl says H6 — name wins
    expect(map.get("Heading3")!.headingLevel).toBe(3);
  });

  it("normal style has null heading level", () => {
    const xml = stylesXml(`
      <w:style w:type="paragraph" w:styleId="Normal">
        <w:name w:val="Normal"/>
      </w:style>`);
    const map = parseStyles(xml);
    expect(map.get("Normal")!.headingLevel).toBeNull();
  });

  it("records basedOn reference", () => {
    const xml = stylesXml(`
      <w:style w:type="paragraph" w:styleId="MyStyle">
        <w:name w:val="My Style"/>
        <w:basedOn w:val="Normal"/>
      </w:style>`);
    const map = parseStyles(xml);
    expect(map.get("MyStyle")!.basedOn).toBe("Normal");
  });

  it("records style type correctly", () => {
    const xml = stylesXml(`
      <w:style w:type="character" w:styleId="Strong">
        <w:name w:val="Strong"/>
      </w:style>`);
    const map = parseStyles(xml);
    expect(map.get("Strong")!.type).toBe("character");
  });
});

// ─── parseRPr — run properties ────────────────────────────────────────

describe("parseRPr — run properties", () => {
  it("detects bold", () => {
    expect(parseRPr(rPrEl("<w:b/>")).bold).toBe(true);
  });

  it("detects bold off via w:val=0", () => {
    expect(parseRPr(rPrEl(`<w:b w:val="0"/>`)).bold).toBe(false);
  });

  it("detects italic", () => {
    expect(parseRPr(rPrEl("<w:i/>")).italic).toBe(true);
  });

  it("detects underline (single)", () => {
    expect(parseRPr(rPrEl(`<w:u w:val="single"/>`)).underline).toBe(true);
  });

  it("detects underline off (none)", () => {
    expect(parseRPr(rPrEl(`<w:u w:val="none"/>`)).underline).toBe(false);
  });

  it("detects strikethrough", () => {
    expect(parseRPr(rPrEl("<w:strike/>")).strikethrough).toBe(true);
  });

  it("detects double strikethrough", () => {
    expect(parseRPr(rPrEl("<w:dstrike/>")).doubleStrikethrough).toBe(true);
  });

  it("detects superscript", () => {
    expect(parseRPr(rPrEl(`<w:vertAlign w:val="superscript"/>`)).superscript).toBe(true);
  });

  it("detects subscript", () => {
    expect(parseRPr(rPrEl(`<w:vertAlign w:val="subscript"/>`)).subscript).toBe(true);
  });

  it("detects smallCaps", () => {
    expect(parseRPr(rPrEl("<w:smallCaps/>")).smallCaps).toBe(true);
  });

  it("detects allCaps", () => {
    expect(parseRPr(rPrEl("<w:caps/>")).allCaps).toBe(true);
  });

  it("parses font size from half-points", () => {
    // w:sz=24 half-points → 12pt
    expect(parseRPr(rPrEl(`<w:sz w:val="24"/>`)).fontSize).toBe(12);
  });

  it("parses color hex", () => {
    expect(parseRPr(rPrEl(`<w:color w:val="FF0000"/>`)).color).toBe("FF0000");
  });

  it("returns null for auto color", () => {
    expect(parseRPr(rPrEl(`<w:color w:val="auto"/>`)).color).toBeNull();
  });

  it("parses font family from w:ascii", () => {
    expect(parseRPr(rPrEl(`<w:rFonts w:ascii="Arial"/>`)).fontFamily).toBe("Arial");
  });

  it("falls back to w:hAnsi for font family", () => {
    expect(parseRPr(rPrEl(`<w:rFonts w:hAnsi="Times New Roman"/>`)).fontFamily).toBe(
      "Times New Roman",
    );
  });

  it("parses highlight color", () => {
    expect(parseRPr(rPrEl(`<w:highlight w:val="yellow"/>`)).highlight).toBe("yellow");
  });

  it("parses language tag", () => {
    expect(parseRPr(rPrEl(`<w:lang w:val="en-US"/>`)).lang).toBe("en-US");
  });

  it("parses character style reference", () => {
    expect(parseRPr(rPrEl(`<w:rStyle w:val="Strong"/>`)).rStyleId).toBe("Strong");
  });
});

// ─── parsePPr — paragraph properties ─────────────────────────────────

describe("parsePPr — paragraph properties", () => {
  it("parses left alignment", () => {
    expect(parsePPr(pPrEl(`<w:jc w:val="left"/>`)).props.alignment).toBe("left");
  });

  it("parses center alignment", () => {
    expect(parsePPr(pPrEl(`<w:jc w:val="center"/>`)).props.alignment).toBe("center");
  });

  it("parses both (justify) alignment", () => {
    expect(parsePPr(pPrEl(`<w:jc w:val="both"/>`)).props.alignment).toBe("justify");
  });

  it("parses space before in twips → cm", () => {
    // 720 twips = 0.5 inch = 1.27cm
    const result = parsePPr(pPrEl(`<w:spacing w:before="720"/>`));
    expect(result.props.spaceBefore).toBeCloseTo(1.27, 1);
  });

  it("parses space after in twips → cm", () => {
    const result = parsePPr(pPrEl(`<w:spacing w:after="360"/>`));
    expect(result.props.spaceAfter).toBeCloseTo(0.635, 2);
  });

  it("parses line height multiplier (auto rule)", () => {
    // 360 twips / 240 = 1.5 (1.5× line height)
    const result = parsePPr(pPrEl(`<w:spacing w:line="360" w:lineRule="auto"/>`));
    expect(result.props.lineHeight).toBeCloseTo(1.5, 2);
  });

  it("parses left indentation in twips → cm", () => {
    // 720 twips = 1.27cm
    const result = parsePPr(pPrEl(`<w:ind w:left="720"/>`));
    expect(result.props.indentLeft).toBeCloseTo(1.27, 1);
  });

  it("parses first-line indent", () => {
    const result = parsePPr(pPrEl(`<w:ind w:firstLine="360"/>`));
    expect(result.props.indentFirstLine).toBeGreaterThan(0);
  });

  it("parses hanging indent as negative first-line", () => {
    const result = parsePPr(pPrEl(`<w:ind w:hanging="360"/>`));
    expect(result.props.indentFirstLine).toBeLessThan(0);
  });

  it("parses list membership (numPr)", () => {
    const result = parsePPr(pPrEl(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>`));
    expect(result.props.list).toEqual({ numId: "1", level: 0 });
  });

  it("returns null list for numId=0 (explicit list removal)", () => {
    const result = parsePPr(pPrEl(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>`));
    expect(result.props.list).toBeNull();
  });

  it("parses outlineLvl → heading level (0-based → 1-based)", () => {
    const result = parsePPr(pPrEl(`<w:outlineLvl w:val="0"/>`));
    expect(result.outlineLvl).toBe(1);
  });

  it("detects sectPr inside pPr", () => {
    const result = parsePPr(pPrEl(`<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>`));
    expect(result.hasSectPr).toBe(true);
  });

  it("hasSectPr is false when no sectPr present", () => {
    const result = parsePPr(pPrEl(`<w:jc w:val="left"/>`));
    expect(result.hasSectPr).toBe(false);
  });

  it("parses pageBreakBefore", () => {
    const result = parsePPr(pPrEl(`<w:pageBreakBefore/>`));
    expect(result.props.pageBreakBefore).toBe(true);
  });

  it("parses pageBreakBefore=false via val=0", () => {
    const result = parsePPr(pPrEl(`<w:pageBreakBefore w:val="0"/>`));
    expect(result.props.pageBreakBefore).toBe(false);
  });

  it("parses paragraph bottom border", () => {
    const result = parsePPr(
      pPrEl(`<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="000000"/></w:pBdr>`),
    );
    expect(result.props.borderBottom).toBeDefined();
    expect(result.props.borderBottom!.color).toBe("000000");
    expect(result.props.borderBottom!.widthPt).toBe(1); // 8 eighths = 1pt
  });
});
