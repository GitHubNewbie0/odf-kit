import { describe, it, expect } from "@jest/globals";
import { zipSync } from "fflate";
import {
  parseCellRef,
  parseMergeRef,
  xlsxSerialToDate,
  isDateFormatCode,
  isDateStyle,
  readXlsx,
} from "../src/xlsx/reader.js";
import { xlsxToOds } from "../src/xlsx/index.js";
import { readOds } from "../src/ods-reader/index.js";

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
