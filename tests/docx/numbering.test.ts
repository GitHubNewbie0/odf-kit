import { describe, it, expect } from "@jest/globals";
import { parseNumbering } from "../../src/docx/numbering.js";

// ─── Helpers ──────────────────────────────────────────────────────────

function numberingXml(abstractNums: string, nums: string): string {
  return `<?xml version="1.0"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    ${abstractNums}
    ${nums}
  </w:numbering>`;
}

function abstractNum(id: string, levels: string): string {
  return `<w:abstractNum w:abstractNumId="${id}">
    ${levels}
  </w:abstractNum>`;
}

function lvl(ilvl: string, numFmt: string, start = "1"): string {
  return `<w:lvl w:ilvl="${ilvl}">
    <w:start w:val="${start}"/>
    <w:numFmt w:val="${numFmt}"/>
  </w:lvl>`;
}

function num(numId: string, abstractNumId: string, overrides = ""): string {
  return `<w:num w:numId="${numId}">
    <w:abstractNumId w:val="${abstractNumId}"/>
    ${overrides}
  </w:num>`;
}

// ─── parseNumbering — basic ───────────────────────────────────────────

describe("parseNumbering — basic", () => {
  it("returns empty map for empty numbering element", () => {
    const xml = `<?xml version="1.0"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:numbering>`;
    const map = parseNumbering(xml);
    expect(map.size).toBe(0);
  });

  it("resolves a bullet list", () => {
    const xml = numberingXml(abstractNum("0", lvl("0", "bullet")), num("1", "0"));
    const map = parseNumbering(xml);
    const levels = map.get("1");
    expect(levels).toBeDefined();
    expect(levels![0].isOrdered).toBe(false);
    expect(levels![0].numFormat).toBe("bullet");
  });

  it("resolves a decimal numbered list", () => {
    const xml = numberingXml(abstractNum("0", lvl("0", "decimal")), num("1", "0"));
    const map = parseNumbering(xml);
    expect(map.get("1")![0].isOrdered).toBe(true);
    expect(map.get("1")![0].numFormat).toBe("decimal");
  });

  it("resolves lowerRoman as ordered", () => {
    const xml = numberingXml(abstractNum("0", lvl("0", "lowerRoman")), num("1", "0"));
    const map = parseNumbering(xml);
    expect(map.get("1")![0].isOrdered).toBe(true);
    expect(map.get("1")![0].numFormat).toBe("lowerRoman");
  });

  it("resolves upperLetter as ordered", () => {
    const xml = numberingXml(abstractNum("0", lvl("0", "upperLetter")), num("1", "0"));
    const map = parseNumbering(xml);
    expect(map.get("1")![0].isOrdered).toBe(true);
  });

  it("preserves start value", () => {
    const xml = numberingXml(abstractNum("0", lvl("0", "decimal", "5")), num("1", "0"));
    const map = parseNumbering(xml);
    expect(map.get("1")![0].start).toBe(5);
  });

  it("resolves multiple levels", () => {
    const xml = numberingXml(
      abstractNum("0", lvl("0", "decimal") + lvl("1", "lowerLetter") + lvl("2", "lowerRoman")),
      num("1", "0"),
    );
    const map = parseNumbering(xml);
    const levels = map.get("1")!;
    expect(levels.length).toBe(3);
    expect(levels[0].numFormat).toBe("decimal");
    expect(levels[1].numFormat).toBe("lowerLetter");
    expect(levels[2].numFormat).toBe("lowerRoman");
  });

  it("resolves two different num entries sharing one abstractNum", () => {
    const xml = numberingXml(abstractNum("0", lvl("0", "decimal")), num("1", "0") + num("2", "0"));
    const map = parseNumbering(xml);
    expect(map.has("1")).toBe(true);
    expect(map.has("2")).toBe(true);
    expect(map.get("1")![0].numFormat).toBe("decimal");
    expect(map.get("2")![0].numFormat).toBe("decimal");
  });

  it("two num entries with shared abstractNum are independent (mutation safety)", () => {
    const xml = numberingXml(abstractNum("0", lvl("0", "decimal")), num("1", "0") + num("2", "0"));
    const map = parseNumbering(xml);
    // Modifying one should not affect the other
    map.get("1")![0].numFormat = "bullet";
    expect(map.get("2")![0].numFormat).toBe("decimal");
  });
});

// ─── parseNumbering — level overrides ─────────────────────────────────

describe("parseNumbering — lvlOverride", () => {
  it("applies startOverride to level 0", () => {
    const xml = numberingXml(
      abstractNum("0", lvl("0", "decimal", "1")),
      num("1", "0", `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"/></w:lvlOverride>`),
    );
    const map = parseNumbering(xml);
    expect(map.get("1")![0].start).toBe(3);
  });

  it("does not affect base abstractNum when override is applied", () => {
    const xml = numberingXml(
      abstractNum("0", lvl("0", "decimal", "1")),
      num("1", "0", `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="10"/></w:lvlOverride>`) +
        num("2", "0"),
    );
    const map = parseNumbering(xml);
    expect(map.get("1")![0].start).toBe(10);
    expect(map.get("2")![0].start).toBe(1); // unaffected
  });

  it("handles full lvl override inside lvlOverride", () => {
    const xml = numberingXml(
      abstractNum("0", lvl("0", "decimal")),
      num(
        "1",
        "0",
        `<w:lvlOverride w:ilvl="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="lowerRoman"/></w:lvl></w:lvlOverride>`,
      ),
    );
    const map = parseNumbering(xml);
    expect(map.get("1")![0].numFormat).toBe("lowerRoman");
  });
});

// ─── parseNumbering — level normalisation ─────────────────────────────

describe("parseNumbering — level normalisation", () => {
  it("fills gaps in level sequence with defaults", () => {
    // Only level 0 and 2 defined — level 1 should be filled with defaults
    const xml = numberingXml(
      abstractNum("0", lvl("0", "decimal") + lvl("2", "lowerLetter")),
      num("1", "0"),
    );
    const map = parseNumbering(xml);
    const levels = map.get("1")!;
    expect(levels.length).toBe(3);
    expect(levels[1].numFormat).toBe("bullet"); // default fill
    expect(levels[1].isOrdered).toBe(false);
  });

  it("sorts levels by index regardless of XML order", () => {
    const xml = numberingXml(
      abstractNum("0", lvl("2", "decimal") + lvl("0", "bullet") + lvl("1", "lowerRoman")),
      num("1", "0"),
    );
    const map = parseNumbering(xml);
    const levels = map.get("1")!;
    expect(levels[0].numFormat).toBe("bullet");
    expect(levels[1].numFormat).toBe("lowerRoman");
    expect(levels[2].numFormat).toBe("decimal");
  });
});
