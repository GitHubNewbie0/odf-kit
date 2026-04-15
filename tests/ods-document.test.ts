import { describe, expect, test } from "@jest/globals";
import { strFromU8, unzipSync } from "fflate";
import { OdsDocument } from "../src/ods/index.js";

// ─── Test Helper ──────────────────────────────────────────────────────

/** Save a document and return all ZIP entries as decoded strings. */
async function extractFiles(doc: OdsDocument): Promise<Record<string, string>> {
  const bytes = await doc.save();
  const zipped = unzipSync(bytes);
  const result: Record<string, string> = {};
  for (const [path, data] of Object.entries(zipped)) {
    result[path] = strFromU8(data);
  }
  return result;
}

// ─── Basic Structure ──────────────────────────────────────────────────

describe("OdsDocument — basic structure", () => {
  test("save() returns a Uint8Array", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1");
    const bytes = await doc.save();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  test("output ZIP contains all required ODS files", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1");
    const bytes = await doc.save();
    const files = unzipSync(bytes);
    expect(files["mimetype"]).toBeDefined();
    expect(files["content.xml"]).toBeDefined();
    expect(files["styles.xml"]).toBeDefined();
    expect(files["meta.xml"]).toBeDefined();
    expect(files["META-INF/manifest.xml"]).toBeDefined();
  });

  test("mimetype entry is the correct ODS MIME type", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1");
    const bytes = await doc.save();
    const files = unzipSync(bytes);
    expect(strFromU8(files["mimetype"])).toBe("application/vnd.oasis.opendocument.spreadsheet");
  });

  test("sheet name appears in content.xml", async () => {
    const doc = new OdsDocument();
    doc.addSheet("MySalesData");
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('table:name="MySalesData"');
  });

  test("multiple sheets all appear in content.xml", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Q1");
    doc.addSheet("Q2");
    doc.addSheet("Q3");
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('table:name="Q1"');
    expect(content).toContain('table:name="Q2"');
    expect(content).toContain('table:name="Q3"');
  });

  test("content.xml declares required ODS namespaces", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1");
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("xmlns:office=");
    expect(content).toContain("xmlns:table=");
    expect(content).toContain("xmlns:style=");
    expect(content).toContain("xmlns:fo=");
    expect(content).toContain("xmlns:number=");
  });
});

// ─── Cell Types ───────────────────────────────────────────────────────

describe("OdsDocument — cell types", () => {
  test("string cell", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow(["Hello World"]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('office:value-type="string"');
    expect(content).toContain("Hello World");
  });

  test("number cell produces float value-type", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow([42.5]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('office:value-type="float"');
    expect(content).toContain('office:value="42.5"');
    expect(content).toContain("42.5");
  });

  test("integer number cell", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow([100]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('office:value="100"');
  });

  test("boolean true cell", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow([true]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('office:value-type="boolean"');
    expect(content).toContain('office:boolean-value="true"');
    expect(content).toContain("TRUE");
  });

  test("boolean false cell", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow([false]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('office:boolean-value="false"');
    expect(content).toContain("FALSE");
  });

  test("date cell — default ISO format", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow([new Date("2026-01-15")]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('office:value-type="date"');
    expect(content).toContain('office:date-value="2026-01-15"');
  });

  test("null produces an empty cell", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow([null]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("<table:table-cell/>");
    expect(content).not.toContain("office:value-type");
  });

  test("undefined produces an empty cell", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow([undefined]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("<table:table-cell/>");
  });

  test("formula cell — explicit type required", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow([{ value: "=SUM(A1:A10)", type: "formula" }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('table:formula="of:=SUM(A1:A10)"');
  });

  test("string starting with = is NOT auto-detected as formula", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow(["=not a formula"]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('office:value-type="string"');
    expect(content).not.toContain("table:formula");
  });

  test("mixed types in one row", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow(["Text", 42, new Date("2026-06-01"), true, null]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('office:value-type="string"');
    expect(content).toContain('office:value-type="float"');
    expect(content).toContain('office:value-type="date"');
    expect(content).toContain('office:value-type="boolean"');
    expect(content).toContain("<table:table-cell/>");
  });
});

// ─── Date Formatting ──────────────────────────────────────────────────

describe("OdsDocument — date formatting", () => {
  test("default YYYY-MM-DD format — date-style element emitted", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow([new Date("2026-03-15")]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("Ndate-iso");
    expect(content).toContain("2026-03-15");
  });

  test("DD/MM/YYYY document-level format — display text correct", async () => {
    const doc = new OdsDocument();
    doc.setDateFormat("DD/MM/YYYY");
    doc.addSheet("Sheet1").addRow([new Date("2026-03-15")]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("Ndate-dmy");
    expect(content).toContain("15/03/2026");
  });

  test("MM/DD/YYYY document-level format — display text correct", async () => {
    const doc = new OdsDocument();
    doc.setDateFormat("MM/DD/YYYY");
    doc.addSheet("Sheet1").addRow([new Date("2026-03-15")]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("Ndate-mdy");
    expect(content).toContain("03/15/2026");
  });

  test("office:date-value always stores ISO regardless of display format", async () => {
    const doc = new OdsDocument();
    doc.setDateFormat("DD/MM/YYYY");
    doc.addSheet("Sheet1").addRow([new Date("2026-12-25")]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('office:date-value="2026-12-25"');
    expect(content).toContain("25/12/2026");
  });

  test("per-cell dateFormat overrides document default", async () => {
    const doc = new OdsDocument();
    doc.setDateFormat("YYYY-MM-DD");
    doc
      .addSheet("Sheet1")
      .addRow([{ value: new Date("2026-03-15"), type: "date", dateFormat: "DD/MM/YYYY" }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("Ndate-dmy");
    expect(content).toContain("15/03/2026");
    expect(content).not.toContain("Ndate-iso");
  });

  test("only used date format styles are emitted", async () => {
    const doc = new OdsDocument();
    // No date cells — no date styles should appear
    doc.addSheet("Sheet1").addRow(["text only"]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).not.toContain("number:date-style");
  });
});

// ─── Row Formatting ───────────────────────────────────────────────────

describe("OdsDocument — row formatting", () => {
  test("bold row option applies to all cells", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow(["Header", "Value"], { bold: true });
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('fo:font-weight="bold"');
  });

  test("backgroundColor row option applies to all cells", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow(["Row1"], { backgroundColor: "#DDDDDD" });
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('fo:background-color="#DDDDDD"');
  });

  test("italic row option", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow(["Text"], { italic: true });
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('fo:font-style="italic"');
  });

  test("align center row option", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow(["Centered"], { align: "center" });
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('fo:text-align="center"');
  });

  test("multiple row formatting options combined", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow(["Header"], {
      bold: true,
      italic: true,
      backgroundColor: "#CCCCCC",
      align: "center",
    });
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('fo:font-weight="bold"');
    expect(content).toContain('fo:font-style="italic"');
    expect(content).toContain('fo:background-color="#CCCCCC"');
    expect(content).toContain('fo:text-align="center"');
  });

  test("row with no options produces no cell style", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow(["plain"]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).not.toContain('table:style-name="ce');
  });
});

// ─── Cell-Level Formatting Overrides ─────────────────────────────────

describe("OdsDocument — cell-level formatting overrides", () => {
  test("cell backgroundColor overrides row backgroundColor", async () => {
    const doc = new OdsDocument();
    doc
      .addSheet("Sheet1")
      .addRow(["Normal", { value: "Override", type: "string", backgroundColor: "#FFFFFF" }], {
        backgroundColor: "#DDDDDD",
      });
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('fo:background-color="#DDDDDD"');
    expect(content).toContain('fo:background-color="#FFFFFF"');
  });

  test("cell inherits unoverridden row options", async () => {
    const doc = new OdsDocument();
    doc
      .addSheet("Sheet1")
      .addRow([{ value: "Cell", type: "string", color: "#FF0000" }], { bold: true });
    const { "content.xml": content } = await extractFiles(doc);
    // The cell style should have BOTH bold (from row) and color (from cell)
    expect(content).toContain('fo:font-weight="bold"');
    expect(content).toContain('fo:color="#FF0000"');
  });
});

// ─── Column and Row Dimensions ────────────────────────────────────────

describe("OdsDocument — dimensions", () => {
  test("setColumnWidth produces a width style in content.xml", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow(["A", "B"]);
    sheet.setColumnWidth(0, "5cm");
    sheet.setColumnWidth(1, "8cm");
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('style:column-width="5cm"');
    expect(content).toContain('style:column-width="8cm"');
  });

  test("setRowHeight produces a height style in content.xml", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow(["Header"]);
    sheet.setRowHeight(0, "1cm");
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('style:row-height="1cm"');
  });

  test("columns without explicit width use optimal-width style", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow(["A", "B"]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('style:use-optimal-column-width="true"');
  });

  test("rows without explicit height use optimal-height style", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow(["Row"]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('style:use-optimal-row-height="true"');
  });

  test("setRowHeight on out-of-range index is silently ignored", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow(["Row 0"]);
    // row index 5 doesn't exist — should not throw
    expect(() => sheet.setRowHeight(5, "1cm")).not.toThrow();
  });
});

// ─── Style Deduplication ──────────────────────────────────────────────

describe("OdsDocument — style deduplication", () => {
  test("identical row styles across rows share one cell style definition", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow(["A", "B"], { bold: true });
    sheet.addRow(["C", "D"], { bold: true });
    const { "content.xml": content } = await extractFiles(doc);
    // Only one cell style definition should exist
    expect(content).toContain('style:name="ce1"');
    expect(content).not.toContain('style:name="ce2"');
  });

  test("different row styles produce distinct cell style definitions", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow(["Bold"], { bold: true });
    sheet.addRow(["Italic"], { italic: true });
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('style:name="ce1"');
    expect(content).toContain('style:name="ce2"');
  });
});

// ─── Metadata ─────────────────────────────────────────────────────────

describe("OdsDocument — metadata", () => {
  test("title appears in meta.xml", async () => {
    const doc = new OdsDocument();
    doc.setMetadata({ title: "My Spreadsheet" });
    doc.addSheet("Sheet1");
    const { "meta.xml": meta } = await extractFiles(doc);
    expect(meta).toContain("My Spreadsheet");
  });

  test("creator appears in meta.xml", async () => {
    const doc = new OdsDocument();
    doc.setMetadata({ creator: "Scott Wirth" });
    doc.addSheet("Sheet1");
    const { "meta.xml": meta } = await extractFiles(doc);
    expect(meta).toContain("Scott Wirth");
  });

  test("meta:generator is odf-kit", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1");
    const { "meta.xml": meta } = await extractFiles(doc);
    expect(meta).toContain("odf-kit");
  });
});

// ─── Multiple Sheets ──────────────────────────────────────────────────

describe("OdsDocument — multiple sheets", () => {
  test("each sheet has its own rows", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1").addRow(["Only in Sheet1"]);
    doc.addSheet("Sheet2").addRow(["Only in Sheet2"]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("Only in Sheet1");
    expect(content).toContain("Only in Sheet2");
  });

  test("sheets appear in the order they were added", async () => {
    const doc = new OdsDocument();
    doc.addSheet("First");
    doc.addSheet("Second");
    const { "content.xml": content } = await extractFiles(doc);
    const firstIdx = content.indexOf('table:name="First"');
    const secondIdx = content.indexOf('table:name="Second"');
    expect(firstIdx).toBeLessThan(secondIdx);
  });
});

// ─── styles.xml ───────────────────────────────────────────────────────

describe("OdsDocument — styles.xml", () => {
  test("styles.xml contains Default table-cell style", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1");
    const { "styles.xml": styles } = await extractFiles(doc);
    expect(styles).toContain('style:name="Default"');
    expect(styles).toContain('style:family="table-cell"');
  });

  test("styles.xml contains master page definition", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1");
    const { "styles.xml": styles } = await extractFiles(doc);
    expect(styles).toContain("style:master-page");
    expect(styles).toContain('style:page-layout-name="Mlayout"');
  });
});

// ─── Number Formats ───────────────────────────────────────────────────

describe("OdsDocument — number formats", () => {
  test("integer format emits number:decimal-places=0 and grouping=true", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: 1234, type: "float", numberFormat: "integer" }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('number:decimal-places="0"');
    expect(content).toContain('number:grouping="true"');
  });

  test("decimal:2 format emits number:decimal-places=2 and grouping=true", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: 1234.56, type: "float", numberFormat: "decimal:2" }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('number:decimal-places="2"');
    expect(content).toContain('number:grouping="true"');
  });

  test("decimal:0 format emits number:decimal-places=0", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: 42, type: "float", numberFormat: "decimal:0" }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('number:decimal-places="0"');
  });

  test("percentage format emits office:value-type=percentage", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: 0.1234, type: "percentage", numberFormat: "percentage" }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('office:value-type="percentage"');
    expect(content).toContain('office:value="0.1234"');
    expect(content).toContain('number:decimal-places="2"');
  });

  test("percentage:1 format emits 1 decimal place", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: 0.333, type: "percentage", numberFormat: "percentage:1" }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('number:decimal-places="1"');
  });

  test("currency:EUR format emits number:currency-style and office:currency=EUR", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: 1234.56, type: "currency", numberFormat: "currency:EUR" }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("number:currency-style");
    expect(content).toContain('office:value-type="currency"');
    expect(content).toContain('office:currency="EUR"');
    expect(content).toContain("€");
  });

  test("currency:USD format emits $ symbol", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: 99.99, type: "currency", numberFormat: "currency:USD" }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('office:currency="USD"');
    expect(content).toContain("$");
  });

  test("currency:GBP:0 format emits 0 decimal places", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: 500, type: "currency", numberFormat: "currency:GBP:0" }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('office:currency="GBP"');
    expect(content).toContain('number:decimal-places="0"');
  });

  test("two cells with same numberFormat share one style", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([
      { value: 1000, type: "float", numberFormat: "decimal:2" },
      { value: 2000, type: "float", numberFormat: "decimal:2" },
    ]);
    const { "content.xml": content } = await extractFiles(doc);
    // Only one Nnum-dec2 style element should exist
    const matches = content.match(/style:name="Nnum-dec2"/g);
    expect(matches).toHaveLength(1);
  });

  test("numberFormat on row options applies to all cells", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([1000, 2000, 3000], { numberFormat: "integer" });
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("Nnum-int");
  });
});

// ─── Merged Cells ─────────────────────────────────────────────────────

describe("OdsDocument — merged cells", () => {
  test("colSpan:3 emits table:number-columns-spanned=3 and 2 covered cells", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: "Header", type: "string", colSpan: 3 }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('table:number-columns-spanned="3"');
    expect(content).toContain("table:covered-table-cell");
  });

  test("rowSpan:2 emits table:number-rows-spanned=2 and covered cell in next row", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: "Span", type: "string", rowSpan: 2 }, "B1"]);
    sheet.addRow(["B2"]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('table:number-rows-spanned="2"');
    expect(content).toContain("table:covered-table-cell");
  });

  test("colSpan and rowSpan combined", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: "Big", type: "string", colSpan: 2, rowSpan: 2 }, "C1"]);
    sheet.addRow(["C2", "D2"]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('table:number-columns-spanned="2"');
    expect(content).toContain('table:number-rows-spanned="2"');
    expect(content).toContain("table:covered-table-cell");
  });

  test("colSpan at non-zero column position", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow(["A1", { value: "Merged", type: "string", colSpan: 2 }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('table:number-columns-spanned="2"');
    expect(content).toContain("table:covered-table-cell");
  });

  test("merged cell with formatting", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([
      { value: "Title", type: "string", colSpan: 3, bold: true, backgroundColor: "#DDDDDD" },
    ]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('table:number-columns-spanned="3"');
    expect(content).toContain("fo:font-weight");
  });
});

// ─── Freeze Rows/Columns ──────────────────────────────────────────────

describe("OdsDocument — freeze rows/columns", () => {
  test("no freeze — settings.xml not generated", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1");
    const bytes = await doc.save();
    const files = unzipSync(bytes);
    expect(files["settings.xml"]).toBeUndefined();
  });

  test("freezeRows(1) generates settings.xml", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.freezeRows(1);
    const files = await extractFiles(doc);
    expect(files["settings.xml"]).toBeDefined();
  });

  test("freezeRows(1) sets VerticalSplitMode=2 and VerticalSplitPosition=1", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.freezeRows(1);
    const { "settings.xml": settings } = await extractFiles(doc);
    expect(settings).toContain("VerticalSplitMode");
    expect(settings).toContain(">2<");
    expect(settings).toContain("VerticalSplitPosition");
    expect(settings).toContain(">1<");
  });

  test("freezeRows(3) sets VerticalSplitPosition=3", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.freezeRows(3);
    const { "settings.xml": settings } = await extractFiles(doc);
    expect(settings).toContain(">3<");
  });

  test("freezeColumns(1) sets HorizontalSplitMode=2 and HorizontalSplitPosition=1", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.freezeColumns(1);
    const { "settings.xml": settings } = await extractFiles(doc);
    expect(settings).toContain("HorizontalSplitMode");
    expect(settings).toContain("HorizontalSplitPosition");
    expect(settings).toContain(">1<");
  });

  test("freezeRows and freezeColumns combined", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.freezeRows(1);
    sheet.freezeColumns(1);
    const { "settings.xml": settings } = await extractFiles(doc);
    expect(settings).toContain("VerticalSplitMode");
    expect(settings).toContain("HorizontalSplitMode");
  });

  test("settings.xml contains sheet name", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("MySalesData");
    sheet.freezeRows(1);
    const { "settings.xml": settings } = await extractFiles(doc);
    expect(settings).toContain("MySalesData");
  });

  test("settings.xml is in manifest", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.freezeRows(1);
    const { "META-INF/manifest.xml": manifest } = await extractFiles(doc);
    expect(manifest).toContain("settings.xml");
  });

  test("only sheets with freeze appear in settings.xml", async () => {
    const doc = new OdsDocument();
    const s1 = doc.addSheet("Frozen");
    doc.addSheet("NotFrozen");
    s1.freezeRows(1);
    const { "settings.xml": settings } = await extractFiles(doc);
    expect(settings).toContain("Frozen");
    expect(settings).not.toContain("NotFrozen");
  });
  test("freezeRows(1) includes ViewId=view1 in settings.xml", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.freezeRows(1);
    const { "settings.xml": settings } = await extractFiles(doc);
    expect(settings).toContain('config:name="ViewId"');
    expect(settings).toContain(">view1<");
  });

  test("freezeRows(1) includes ActiveTable matching sheet name", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("MySales");
    sheet.freezeRows(1);
    const { "settings.xml": settings } = await extractFiles(doc);
    expect(settings).toContain('config:name="ActiveTable"');
    expect(settings).toContain(">MySales<");
  });

  test("freezeRows(1) sets ActiveSplitRange=2", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.freezeRows(1);
    const { "settings.xml": settings } = await extractFiles(doc);
    expect(settings).toContain('config:name="ActiveSplitRange"');
    expect(settings).toContain(">2<");
  });

  test("freezeColumns(1) sets ActiveSplitRange=3", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.freezeColumns(1);
    const { "settings.xml": settings } = await extractFiles(doc);
    expect(settings).toContain('config:name="ActiveSplitRange"');
    expect(settings).toContain(">3<");
  });

  test("freezeRows(1) sets PositionBottom=1 and PositionRight=0", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.freezeRows(1);
    const { "settings.xml": settings } = await extractFiles(doc);
    expect(settings).toContain('config:name="PositionBottom"');
    expect(settings).toContain('config:name="PositionRight"');
  });

  test("freezeColumns(1) sets HorizontalSplitMode=2 and VerticalSplitMode=0", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.freezeColumns(1);
    const { "settings.xml": settings } = await extractFiles(doc);
    expect(settings).toContain('config:name="HorizontalSplitMode"');
    // VerticalSplitMode must be 0 (not frozen) when only columns are frozen
    expect(settings).toContain(">0<");
  });
});

// ─── Hyperlinks ───────────────────────────────────────────────────────

describe("OdsDocument — hyperlinks", () => {
  test("href on cell emits text:a with xlink:href", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([
      { value: "odf-kit", type: "string", href: "https://github.com/GitHubNewbie0/odf-kit" },
    ]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("text:a");
    expect(content).toContain("https://github.com/GitHubNewbie0/odf-kit");
    expect(content).toContain('xlink:type="simple"');
  });

  test("hyperlink cell contains the link text", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: "Click here", type: "string", href: "https://example.com" }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("Click here");
    expect(content).toContain("https://example.com");
  });

  test("xlink namespace declared on root element", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: "Link", type: "string", href: "https://example.com" }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
  });

  test("hyperlink with formatting", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: "Bold link", type: "string", href: "https://example.com", bold: true }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("fo:font-weight");
    expect(content).toContain("https://example.com");
  });

  test("cell without href has no text:a element", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow(["plain text"]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).not.toContain("text:a");
  });
});

// ─── Sheet Tab Color ──────────────────────────────────────────────────

describe("OdsDocument — sheet tab color", () => {
  test("setTabColor emits table:tab-color on table style", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.setTabColor("#FF0000");
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain('table:tab-color="#FF0000"');
  });

  test("different sheets can have different tab colors", async () => {
    const doc = new OdsDocument();
    const s1 = doc.addSheet("Red");
    const s2 = doc.addSheet("Blue");
    s1.setTabColor("#FF0000");
    s2.setTabColor("#0000FF");
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).toContain("#FF0000");
    expect(content).toContain("#0000FF");
  });

  test("sheet without tab color has no table:tab-color attribute", async () => {
    const doc = new OdsDocument();
    doc.addSheet("Sheet1");
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).not.toContain("table:tab-color");
  });
});
