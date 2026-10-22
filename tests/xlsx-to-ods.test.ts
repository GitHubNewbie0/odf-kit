import { describe, it, expect } from "@jest/globals";
import { zipSync, unzipSync } from "fflate";
import {
  parseCellRef,
  parseMergeRef,
  xlsxSerialToDate,
  isDateFormatCode,
  isDateStyle,
  readXlsx,
} from "../src/xlsx/to-ods/reader.js";
import { xlsxToOds } from "../src/xlsx/to-ods/index.js";
import { readOds } from "../src/ods-reader/index.js";
import { parseXml } from "../src/odt/read/xml-parser.js";
import type { XmlElementNode } from "../src/odt/read/xml-parser.js";

// ─── Helpers ──────────────────────────────────────────────────────────

const encoder = new TextEncoder();

/** Build a minimal valid XLSX ZIP from provided XML parts. */
function buildXlsx(parts: Record<string, string>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [path, xml] of Object.entries(parts)) {
    files[path] = encoder.encode(xml);
  }
  return zipSync(files);
}

/** Build a complete minimal XLSX with one sheet of data. */
function buildSimpleXlsx(sheetXml: string, sharedStrings?: string, stylesXml?: string): Uint8Array {
  return buildXlsx({
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "xl/workbook.xml": `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>${sharedStrings ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' : ""}</Relationships>`,
    "xl/worksheets/sheet1.xml": sheetXml,
    ...(sharedStrings ? { "xl/sharedStrings.xml": sharedStrings } : {}),
    ...(stylesXml ? { "xl/styles.xml": stylesXml } : {}),
  });
}

// ─── parseCellRef ─────────────────────────────────────────────────────

describe("parseCellRef", () => {
  it("parses A1 → col 0, row 0", () => {
    expect(parseCellRef("A1")).toEqual({ col: 0, row: 0 });
  });
  it("parses B2 → col 1, row 1", () => {
    expect(parseCellRef("B2")).toEqual({ col: 1, row: 1 });
  });
  it("parses Z1 → col 25, row 0", () => {
    expect(parseCellRef("Z1")).toEqual({ col: 25, row: 0 });
  });
  it("parses AA1 → col 26, row 0", () => {
    expect(parseCellRef("AA1")).toEqual({ col: 26, row: 0 });
  });
  it("parses AB1 → col 27, row 0", () => {
    expect(parseCellRef("AB1")).toEqual({ col: 27, row: 0 });
  });
  it("parses AZ1 → col 51, row 0", () => {
    expect(parseCellRef("AZ1")).toEqual({ col: 51, row: 0 });
  });
  it("parses BA1 → col 52, row 0", () => {
    expect(parseCellRef("BA1")).toEqual({ col: 52, row: 0 });
  });
  it("parses D5 → col 3, row 4", () => {
    expect(parseCellRef("D5")).toEqual({ col: 3, row: 4 });
  });
});

// ─── parseMergeRef ────────────────────────────────────────────────────

describe("parseMergeRef", () => {
  it("parses A1:C1 → startCol 0, startRow 0, colSpan 3, rowSpan 1", () => {
    expect(parseMergeRef("A1:C1")).toEqual({ startCol: 0, startRow: 0, colSpan: 3, rowSpan: 1 });
  });
  it("parses A1:A3 → startCol 0, startRow 0, colSpan 1, rowSpan 3", () => {
    expect(parseMergeRef("A1:A3")).toEqual({ startCol: 0, startRow: 0, colSpan: 1, rowSpan: 3 });
  });
  it("parses B2:D4 → startCol 1, startRow 1, colSpan 3, rowSpan 3", () => {
    expect(parseMergeRef("B2:D4")).toEqual({ startCol: 1, startRow: 1, colSpan: 3, rowSpan: 3 });
  });
});

// ─── xlsxSerialToDate ─────────────────────────────────────────────────

describe("xlsxSerialToDate", () => {
  it("converts 1 → 1900-01-01", () => {
    const d = xlsxSerialToDate(1);
    expect(d.toISOString().slice(0, 10)).toBe("1900-01-01");
  });
  it("converts 25569 → 1970-01-01 (Unix epoch)", () => {
    const d = xlsxSerialToDate(25569);
    expect(d.toISOString().slice(0, 10)).toBe("1970-01-01");
  });
  it("converts 45000 → a date after 2023", () => {
    const d = xlsxSerialToDate(45000);
    expect(d.getFullYear()).toBeGreaterThanOrEqual(2023);
  });
});

// ─── isDateFormatCode ─────────────────────────────────────────────────

describe("isDateFormatCode", () => {
  it("yyyy-mm-dd is a date format", () => {
    expect(isDateFormatCode("yyyy-mm-dd")).toBe(true);
  });
  it("dd/mm/yyyy is a date format", () => {
    expect(isDateFormatCode("dd/mm/yyyy")).toBe(true);
  });
  it("m/d/yy is a date format", () => {
    expect(isDateFormatCode("m/d/yy")).toBe(true);
  });
  it("#,##0.00 is not a date format", () => {
    expect(isDateFormatCode("#,##0.00")).toBe(false);
  });
  it("0% is not a date format", () => {
    expect(isDateFormatCode("0%")).toBe(false);
  });
  it("General is not a date format", () => {
    expect(isDateFormatCode("General")).toBe(false);
  });
});

// ─── isDateStyle ──────────────────────────────────────────────────────

describe("isDateStyle", () => {
  it("built-in numFmtId 14 (m/d/yy) is a date style", () => {
    expect(isDateStyle(0, [14], new Map())).toBe(true);
  });
  it("numFmtId 0 (General) is not a date style", () => {
    expect(isDateStyle(0, [0], new Map())).toBe(false);
  });
  it("custom date format is detected as date style", () => {
    const custom = new Map([[164, "yyyy-mm-dd"]]);
    expect(isDateStyle(0, [164], custom)).toBe(true);
  });
  it("custom number format is not a date style", () => {
    const custom = new Map([[165, "#,##0.00"]]);
    expect(isDateStyle(0, [165], custom)).toBe(false);
  });
  it("out of bounds style index returns false", () => {
    expect(isDateStyle(5, [0], new Map())).toBe(false);
  });
});

// ─── readXlsx — basic structure ───────────────────────────────────────

describe("readXlsx — basic structure", () => {
  it("returns workbook with sheets array", () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`,
    );
    const wb = readXlsx(xlsx);
    expect(wb.sheets).toBeDefined();
    expect(wb.sheets.length).toBe(1);
  });

  it("reads sheet name correctly", () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`,
    );
    const wb = readXlsx(xlsx);
    expect(wb.sheets[0].name).toBe("Sheet1");
  });
});

// ─── readXlsx — cell types ────────────────────────────────────────────

describe("readXlsx — cell types", () => {
  it("reads a shared string cell", () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`,
      `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Hello World</t></si></sst>`,
    );
    const wb = readXlsx(xlsx);
    const cell = wb.sheets[0].rows.get(0)?.cells.get(0);
    expect(cell?.type).toBe("string");
    expect(cell?.value).toBe("Hello World");
  });

  it("reads a numeric cell", () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>1234.56</v></c></row></sheetData></worksheet>`,
    );
    const wb = readXlsx(xlsx);
    const cell = wb.sheets[0].rows.get(0)?.cells.get(0);
    expect(cell?.type).toBe("number");
    expect(cell?.value).toBe(1234.56);
  });

  it("reads a boolean true cell", () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="b"><v>1</v></c></row></sheetData></worksheet>`,
    );
    const wb = readXlsx(xlsx);
    const cell = wb.sheets[0].rows.get(0)?.cells.get(0);
    expect(cell?.type).toBe("boolean");
    expect(cell?.value).toBe(true);
  });

  it("reads a boolean false cell", () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="b"><v>0</v></c></row></sheetData></worksheet>`,
    );
    const wb = readXlsx(xlsx);
    const cell = wb.sheets[0].rows.get(0)?.cells.get(0);
    expect(cell?.type).toBe("boolean");
    expect(cell?.value).toBe(false);
  });

  it("reads a formula cell with cached numeric result", () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>SUM(1,2)</f><v>3</v></c></row></sheetData></worksheet>`,
    );
    const wb = readXlsx(xlsx);
    const cell = wb.sheets[0].rows.get(0)?.cells.get(0);
    expect(cell?.type).toBe("formula");
    expect(cell?.value).toBe(3);
    expect(cell?.formula).toBe("SUM(1,2)");
  });

  it("reads a date cell with built-in date style", () => {
    const stylesXml = `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`;
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" s="1"><v>25569</v></c></row></sheetData></worksheet>`,
      undefined,
      stylesXml,
    );
    const wb = readXlsx(xlsx);
    const cell = wb.sheets[0].rows.get(0)?.cells.get(0);
    expect(cell?.type).toBe("date");
    expect(cell?.value).toBeInstanceOf(Date);
    expect((cell?.value as Date).toISOString().slice(0, 10)).toBe("1970-01-01");
  });

  it("reads multi-part shared string (rich text)", () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`,
      `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><t>Hello </t></r><r><t>World</t></r></si></sst>`,
    );
    const wb = readXlsx(xlsx);
    const cell = wb.sheets[0].rows.get(0)?.cells.get(0);
    expect(cell?.value).toBe("Hello World");
  });

  it("reads cells at correct column indices", () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="C1"><v>3</v></c></row></sheetData></worksheet>`,
    );
    const wb = readXlsx(xlsx);
    const row = wb.sheets[0].rows.get(0)!;
    expect(row.cells.get(0)?.value).toBe(1);
    expect(row.cells.get(2)?.value).toBe(3);
    expect(row.cells.get(1)).toBeUndefined(); // B1 is empty
  });
});

// ─── readXlsx — merged cells ──────────────────────────────────────────

describe("readXlsx — merged cells", () => {
  it("reads merge definition into merges map", () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells></worksheet>`,
      `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Merged</t></si></sst>`,
    );
    const wb = readXlsx(xlsx);
    const sheet = wb.sheets[0];
    expect(sheet.merges.get("0:0")).toEqual({ colSpan: 3, rowSpan: 1 });
  });

  it("marks covered cells correctly", () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells></worksheet>`,
    );
    const wb = readXlsx(xlsx);
    const sheet = wb.sheets[0];
    expect(sheet.coveredCells.has("1:0")).toBe(true); // B1
    expect(sheet.coveredCells.has("2:0")).toBe(true); // C1
    expect(sheet.coveredCells.has("0:0")).toBe(false); // A1 is primary
  });
});

// ─── readXlsx — freeze ────────────────────────────────────────────────

describe("readXlsx — freeze pane", () => {
  it("reads frozen row", () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView><pane state="frozen" ySplit="1" xSplit="0" topLeftCell="A2"/></sheetView></sheetViews><sheetData/></worksheet>`,
    );
    const wb = readXlsx(xlsx);
    expect(wb.sheets[0].freezeRows).toBe(1);
    expect(wb.sheets[0].freezeColumns).toBeUndefined();
  });

  it("reads frozen column", () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView><pane state="frozen" ySplit="0" xSplit="1" topLeftCell="B1"/></sheetView></sheetViews><sheetData/></worksheet>`,
    );
    const wb = readXlsx(xlsx);
    expect(wb.sheets[0].freezeColumns).toBe(1);
  });
});

// ─── xlsxToOds — round-trip ───────────────────────────────────────────

describe("xlsxToOds — round-trip via readOds", () => {
  it("converts a string cell and reads it back", async () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`,
      `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Hello</t></si></sst>`,
    );
    const ods = await xlsxToOds(xlsx);
    const model = readOds(ods);
    expect(model.sheets[0].rows[0].cells[0].value).toBe("Hello");
    expect(model.sheets[0].rows[0].cells[0].type).toBe("string");
  });

  it("converts a numeric cell and reads it back", async () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>42.5</v></c></row></sheetData></worksheet>`,
    );
    const ods = await xlsxToOds(xlsx);
    const model = readOds(ods);
    expect(model.sheets[0].rows[0].cells[0].value).toBe(42.5);
    expect(model.sheets[0].rows[0].cells[0].type).toBe("float");
  });

  it("converts a boolean cell and reads it back", async () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="b"><v>1</v></c></row></sheetData></worksheet>`,
    );
    const ods = await xlsxToOds(xlsx);
    const model = readOds(ods);
    expect(model.sheets[0].rows[0].cells[0].value).toBe(true);
    expect(model.sheets[0].rows[0].cells[0].type).toBe("boolean");
  });

  it("converts a date cell and reads it back as a Date", async () => {
    const stylesXml = `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`;
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" s="1"><v>25569</v></c></row></sheetData></worksheet>`,
      undefined,
      stylesXml,
    );
    const ods = await xlsxToOds(xlsx);
    const model = readOds(ods);
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.type).toBe("date");
    expect((cell.value as Date).toISOString().slice(0, 10)).toBe("1970-01-01");
  });

  it("preserves sheet name", async () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`,
    );
    const ods = await xlsxToOds(xlsx);
    const model = readOds(ods);
    expect(model.sheets[0].name).toBe("Sheet1");
  });

  it("preserves multiple rows and columns", async () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>100</v></c></row>` +
        `<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>200</v></c></row>` +
        `</sheetData></worksheet>`,
      `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Alice</t></si><si><t>Bob</t></si></sst>`,
    );
    const ods = await xlsxToOds(xlsx);
    const model = readOds(ods);
    const rows = model.sheets[0].rows;
    expect(rows[0].cells[0].value).toBe("Alice");
    expect(rows[0].cells[1].value).toBe(100);
    expect(rows[1].cells[0].value).toBe("Bob");
    expect(rows[1].cells[1].value).toBe(200);
  });

  it("preserves freeze rows", async () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView><pane state="frozen" ySplit="1" xSplit="0" topLeftCell="A2"/></sheetView></sheetViews><sheetData/></worksheet>`,
    );
    const ods = await xlsxToOds(xlsx);
    const model = readOds(ods);
    expect(model.sheets[0].freezeRows).toBe(1);
  });

  it("converts ArrayBuffer input", async () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>99</v></c></row></sheetData></worksheet>`,
    );
    const ods = await xlsxToOds(xlsx.buffer);
    const model = readOds(ods);
    expect(model.sheets[0].rows[0].cells[0].value).toBe(99);
  });
});
// ─── xlsxToOds — formula cells ───────────────────────────────────────

describe("xlsxToOds — formula cells", () => {
  it("preserves cached numeric result and correct value-type in ODS XML", async () => {
    // Verifies the core fix: table:formula holds the expression, office:value
    // holds the cached result, office:value-type is "float" — not the broken
    // pre-fix output where the cached result ended up in table:formula and
    // office:value was hardcoded to "0".
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>SUM(1,2)</f><v>3</v></c></row></sheetData></worksheet>`,
    );
    const ods = await xlsxToOds(xlsx);
    const files = unzipSync(ods);
    const contentXml = new TextDecoder().decode(files["content.xml"]);
    expect(contentXml).toContain('table:formula="of:=SUM(1,2)"');
    expect(contentXml).toContain('office:value-type="float"');
    expect(contentXml).toContain('office:value="3"');
  });

  it("round-trips numeric formula cached value via readOds", async () => {
    const xlsx = buildSimpleXlsx(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>SUM(1,2)</f><v>3</v></c></row></sheetData></worksheet>`,
    );
    const ods = await xlsxToOds(xlsx);
    const model = readOds(ods);
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.value).toBe(3);
    expect(cell.type).toBe("formula");
  });
});

// ─── xlsxToOds — rows, merges and covered cells (LEAD 1) ─────────────
//
// Citations below are to ODF 1.4. "rng l.N" is OpenDocument-v1.4-schema.rng:N; each
// declaration it names is in spec/odf-elements.json or spec/odf-attributes.json with that
// line. "§N" is ODF 1.4 Part 3 §N (prose); "html l.N" is the line in its HTML rendering,
// which spec/prose-index/odf-part3.json maps to the section. The inputs are valid SpreadsheetML:
// a merge range needs no row or c element under it (ECMA-376 Part 1, 5th ed., sml.xsd
// CT_SheetData row minOccurs="0", CT_Row c minOccurs="0", CT_MergeCell ref ST_Ref;
// §18.3.1.55: "The formatting and content for the merged range is always stored in the top
// left cell.").

const SML = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const SST = `<?xml version="1.0"?><sst ${SML}><si><t>Hello</t></si><si><t>World</t></si></sst>`;

/** One child of a table:table-row: its tag and attributes. */
interface OdsGridCell {
  tag: string;
  attrs: Record<string, string>;
}

/** Parse content.xml of the first sheet into declared columns and per-row cell children. */
function odsGrid(ods: Uint8Array): { declaredColumns: number; rows: OdsGridCell[][] } {
  const content = new TextDecoder().decode(unzipSync(ods)["content.xml"]);
  const elements = (n: XmlElementNode): XmlElementNode[] =>
    n.children.filter((c): c is XmlElementNode => c.type === "element");
  const find = (n: XmlElementNode, tag: string): XmlElementNode | undefined => {
    if (n.tag === tag) return n;
    for (const c of elements(n)) {
      const hit = find(c, tag);
      if (hit) return hit;
    }
    return undefined;
  };
  const table = find(parseXml(content), "table:table");
  if (!table) throw new Error("no table:table in content.xml");
  const repeat = (attrs: Record<string, string>): number =>
    Number(attrs["table:number-columns-repeated"] ?? "1");
  let declaredColumns = 0;
  const rows: OdsGridCell[][] = [];
  for (const child of elements(table)) {
    if (child.tag === "table:table-column") declaredColumns += repeat(child.attrs);
    if (child.tag === "table:table-row") {
      rows.push(elements(child).map((c) => ({ tag: c.tag, attrs: c.attrs })));
    }
  }
  return { declaredColumns, rows };
}

/**
 * A row's width: the grid positions its children occupy. T1 §9.1.5 (html l.3836): covered
 * cells "occupy the same position in document order as the cells spanned. There is one
 * <table:covered-table-cell> element for each cell that is spanned", so a column span is
 * counted through its covered cells; table:number-columns-repeated (rng l.16059-16064)
 * counts as that many positions.
 */
function rowWidth(row: OdsGridCell[]): number {
  return row.reduce((w, c) => w + Number(c.attrs["table:number-columns-repeated"] ?? "1"), 0);
}

// Cases 1-7 of LEAD 1 step 0 (scratch odf-1.4\lead-1\probe-05.mjs and probe-06.mjs).
const LEAD1_CASES: { name: string; sheet: string; sst?: string }[] = [
  {
    // validate-odf writer 9 input (odf-kit-internal checks/validate-odf.mjs:332)
    name: "1 corpus input: merge A3:C3, data in rows 1-2, no row 3",
    sheet: `<?xml version="1.0"?><worksheet ${SML}><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42.5</v></c><c r="C1" t="b"><v>1</v></c></row><row r="2"><c r="A2"><f>SUM(1,2)</f><v>3</v></c><c r="B2" t="s"><v>1</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A3:C3"/></mergeCells></worksheet>`,
    sst: SST,
  },
  {
    name: "2 probe-04 input: merge A2:C2, data only in row 1",
    sheet: `<?xml version="1.0"?><worksheet ${SML}><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A2:C2"/></mergeCells></worksheet>`,
  },
  {
    name: "3 probe-04 control: no merge",
    sheet: `<?xml version="1.0"?><worksheet ${SML}><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`,
  },
  {
    name: "4 merge A1:C1 whose top-left cell has data",
    sheet: `<?xml version="1.0"?><worksheet ${SML}><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells></worksheet>`,
  },
  {
    name: "5 merge A2:B2 with an empty top-left cell, data in C2",
    sheet: `<?xml version="1.0"?><worksheet ${SML}><sheetData><row r="1"><c r="A1"><v>1</v></c></row><row r="2"><c r="C2"><v>2</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A2:B2"/></mergeCells></worksheet>`,
  },
  {
    name: "6 gap row, no merge: data in rows 1 and 3",
    sheet: `<?xml version="1.0"?><worksheet ${SML}><sheetData><row r="1"><c r="A1"><v>1</v></c></row><row r="3"><c r="A3"><v>3</v></c></row></sheetData></worksheet>`,
  },
  {
    name: "7 row-span merge A1:A2 with data in B1 and B2",
    sheet: `<?xml version="1.0"?><worksheet ${SML}><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>9</v></c></row><row r="2"><c r="B2"><v>8</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:A2"/></mergeCells></worksheet>`,
  },
];

const convertCase = async (i: number): Promise<ReturnType<typeof odsGrid>> =>
  odsGrid(await xlsxToOds(buildSimpleXlsx(LEAD1_CASES[i].sheet, LEAD1_CASES[i].sst)));

describe("xlsxToOds — rows are never empty (LEAD 1, T-1)", () => {
  // T1: rng l.16223-16231 — table:table-row content is oneOrMore of table:table-cell |
  // table:covered-table-cell.
  for (const i of [0, 1, 5]) {
    it(`T1 rng l.16223-16231: every table:table-row has a cell child — case ${LEAD1_CASES[i].name}`, async () => {
      const { rows } = await convertCase(i);
      for (const row of rows) expect(row.length).toBeGreaterThan(0);
    });
  }
});

describe("xlsxToOds — a merge over empty cells is kept (LEAD 1, T-2)", () => {
  it("T1 §19.680 (html l.17637) + §9.1.5 (html l.3836): A2:C2 over a row with no cells → spanned empty cell + 2 covered cells", async () => {
    const { declaredColumns, rows } = await convertCase(1);
    expect(declaredColumns).toBe(3);
    expect(rows[1].map((c) => c.tag)).toEqual([
      "table:table-cell",
      "table:covered-table-cell",
      "table:covered-table-cell",
    ]);
    expect(rows[1][0].attrs["table:number-columns-spanned"]).toBe("3");
    // The top-left cell has no value in the source (§18.3.1.55); none is invented.
    expect(rows[1][0].attrs["office:value-type"]).toBeUndefined();
  });

  it("T1 §19.680 + §9.1.5: corpus A3:C3 → row 3 is a 3-column spanned empty cell + 2 covered cells", async () => {
    const { rows } = await convertCase(0);
    expect(rows[2].map((c) => c.tag)).toEqual([
      "table:table-cell",
      "table:covered-table-cell",
      "table:covered-table-cell",
    ]);
    expect(rows[2][0].attrs["table:number-columns-spanned"]).toBe("3");
  });

  it("T1 §19.680 + §9.1.5: A2:B2 with an empty top-left cell in a row with data → span kept, C2 at position 3", async () => {
    const { rows } = await convertCase(4);
    expect(rows[1].map((c) => c.tag)).toEqual([
      "table:table-cell",
      "table:covered-table-cell",
      "table:table-cell",
    ]);
    expect(rows[1][0].attrs["table:number-columns-spanned"]).toBe("2");
    expect(rows[1][2].attrs["office:value"]).toBe("2");
  });
});

describe("xlsxToOds — covered cells keep their grid positions (LEAD 1, T-3)", () => {
  // T1 §9.1.5 (html l.3836): covered cells "occupy the same position in document order as
  // the cells spanned. There is one <table:covered-table-cell> element for each cell that is
  // spanned."
  it("T1 §9.1.5: row-span A1:A2 → row 2 is a covered cell, then B2's value at position 2", async () => {
    const { rows } = await convertCase(6);
    expect(rows[1].map((c) => c.tag)).toEqual(["table:covered-table-cell", "table:table-cell"]);
    expect(rows[1][1].attrs["office:value"]).toBe("8");
  });

  it("T1 §9.1.5: A1:C1 with data → 3 declared columns; row 1 is a spanned cell + exactly 2 covered cells", async () => {
    const { declaredColumns, rows } = await convertCase(3);
    expect(declaredColumns).toBe(3);
    expect(rows[0].map((c) => c.tag)).toEqual([
      "table:table-cell",
      "table:covered-table-cell",
      "table:covered-table-cell",
    ]);
  });
});

describe("xlsxToOds — covered-only rows and single-cell merge refs (LEAD 1 repair, F3)", () => {
  // Inputs X2 and X4 of the LEAD 1 review (scratch odf-1.4\lead-1-review\probe-03.mjs).
  it("T1 §9.1.5 (html l.3836) + rng l.16223-16231: row-span A1:A3 over an absent row 2 → row 2 is a covered cell then B2's empty position", async () => {
    const sheet = `<?xml version="1.0"?><worksheet ${SML}><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c></row><row r="3"><c r="B3"><v>3</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:A3"/></mergeCells></worksheet>`;
    const { declaredColumns, rows } = odsGrid(await xlsxToOds(buildSimpleXlsx(sheet)));
    expect(declaredColumns).toBe(2);
    expect(rows[1]).toEqual([
      { tag: "table:covered-table-cell", attrs: {} },
      { tag: "table:table-cell", attrs: {} },
    ]);
    expect(rowWidth(rows[1])).toBe(declaredColumns);
  });

  it("ECMA-376 Part 1 §18.3.1.55 + T1 §19.680 (html l.17637): single-cell merge ref A2:A2 over an empty cell → no span and no invented value type", async () => {
    const sheet = `<?xml version="1.0"?><worksheet ${SML}><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A2:A2"/></mergeCells></worksheet>`;
    const { rows } = odsGrid(await xlsxToOds(buildSimpleXlsx(sheet)));
    // A2 holds no content in the source (§18.3.1.55: content is stored in the top-left cell);
    // a one-cell ref spans nothing, so row 2 is the empty row of LEAD 1 decision 2.
    expect(rows[1]).toEqual([
      { tag: "table:table-cell", attrs: { "table:number-columns-repeated": "2" } },
    ]);
  });
});

describe("xlsxToOds — row invariants over the LEAD 1 cases (T-5)", () => {
  // T1: rng l.16223-16231 (a row is never empty); §9.1.5 (html l.3836) and
  // rng l.16059-16064 (positions occupied, counted by rowWidth) against the declared
  // table:table-column count.
  LEAD1_CASES.forEach((c, i) => {
    it(`T1 rng l.16223-16231 + §9.1.5: rows non-empty and as wide as the declared columns — case ${c.name}`, async () => {
      const { declaredColumns, rows } = await convertCase(i);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.length).toBeGreaterThan(0);
        expect(rowWidth(row)).toBe(declaredColumns);
      }
    });
  });
});
