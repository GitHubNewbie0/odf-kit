import { describe, expect, test } from "@jest/globals";
import { strFromU8, unzipSync } from "fflate";
import { OdsDocument } from "../src/ods/index.js";
import { parseXml } from "../src/odt/read/xml-parser.js";
import type { XmlElementNode } from "../src/odt/read/xml-parser.js";

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
  test("currency:EUR:right emits number then NBSP then currency-symbol", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: 1234.56, type: "currency", numberFormat: "currency:EUR:right" }]);
    const { "content.xml": content } = await extractFiles(doc);
    const styleMatch = content.match(/<number:currency-style[^>]*>.*?<\/number:currency-style>/s);
    expect(styleMatch).not.toBeNull();
    const styleXml = styleMatch![0];
    const numberIdx = styleXml.indexOf("<number:number");
    const nbspIdx = styleXml.indexOf("<number:text>\u00A0</number:text>");
    const symbolIdx = styleXml.indexOf("<number:currency-symbol");
    expect(numberIdx).toBeLessThan(nbspIdx);
    expect(nbspIdx).toBeLessThan(symbolIdx);
  });

  test("currency:EUR:2:right composes decimals with right position", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: 1234.5, type: "currency", numberFormat: "currency:EUR:2:right" }]);
    const { "content.xml": content } = await extractFiles(doc);
    const styleMatch = content.match(/<number:currency-style[^>]*>.*?<\/number:currency-style>/s);
    expect(styleMatch).not.toBeNull();
    const styleXml = styleMatch![0];
    expect(styleXml).toContain('number:decimal-places="2"');
    const numberIdx = styleXml.indexOf("<number:number");
    const symbolIdx = styleXml.indexOf("<number:currency-symbol");
    expect(numberIdx).toBeLessThan(symbolIdx);
  });

  test("currency:EUR (default left) emits symbol before number — regression", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: 1234.56, type: "currency", numberFormat: "currency:EUR" }]);
    const { "content.xml": content } = await extractFiles(doc);
    const styleMatch = content.match(/<number:currency-style[^>]*>.*?<\/number:currency-style>/s);
    expect(styleMatch).not.toBeNull();
    const styleXml = styleMatch![0];
    const symbolIdx = styleXml.indexOf("<number:currency-symbol");
    const numberIdx = styleXml.indexOf("<number:number");
    expect(symbolIdx).toBeLessThan(numberIdx);
    expect(styleXml).not.toContain("<number:text>\u00A0</number:text>");
  });

  test("left and right positioned currency styles dedupe independently", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([
      { value: 100, type: "currency", numberFormat: "currency:EUR" },
      { value: 200, type: "currency", numberFormat: "currency:EUR:right" },
      { value: 300, type: "currency", numberFormat: "currency:EUR" },
      { value: 400, type: "currency", numberFormat: "currency:EUR:right" },
    ]);
    const { "content.xml": content } = await extractFiles(doc);
    const styleMatches = content.match(/<number:currency-style[^>]+style:name="[^"]+"/g);
    expect(styleMatches).toHaveLength(2);
    expect(content).toContain('style:name="Nnum-eur2"');
    expect(content).toContain('style:name="Nnum-eur2r"');
  });

  test("currency with unknown position parameter silently produces no style", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: 100, type: "currency", numberFormat: "currency:EUR:middle" }]);
    const { "content.xml": content } = await extractFiles(doc);
    expect(content).not.toContain("number:currency-style");
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

// ─── Empty Rows and Empty Spanned Cells (LEAD 1, T-4) ─────────────────
//
// Citations below are to ODF 1.4. "rng l.N" is OpenDocument-v1.4-schema.rng:N; each
// declaration it names is in spec/odf-elements.json or spec/odf-attributes.json with that
// line. "§N" is ODF 1.4 Part 3 §N (prose); "html l.N" is the line in its HTML rendering,
// which spec/prose-index/odf-part3.json maps to the section.

/** The children (tag + attributes) of each table:table-row of the first sheet. */
async function rowChildren(
  doc: OdsDocument,
): Promise<{ tag: string; attrs: Record<string, string> }[][]> {
  const { "content.xml": content } = await extractFiles(doc);
  const elements = (n: XmlElementNode): XmlElementNode[] =>
    n.children.filter((c): c is XmlElementNode => c.type === "element");
  const rows: { tag: string; attrs: Record<string, string> }[][] = [];
  const walk = (n: XmlElementNode): void => {
    if (n.tag === "table:table-row") {
      rows.push(elements(n).map((c) => ({ tag: c.tag, attrs: c.attrs })));
      return;
    }
    elements(n).forEach(walk);
  };
  walk(parseXml(content));
  return rows;
}

describe("OdsDocument — empty rows and empty spanned cells (LEAD 1, T-4)", () => {
  test("T1 rng l.16223-16231 + l.16059-16064: addRow([]) in a 3-column table → one empty cell repeated 3 times (T4: Scott, LEAD 1 decision 2)", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow(["A1", "B1", "C1"]);
    sheet.addRow([]);
    sheet.addRow(["A3"]);
    const rows = await rowChildren(doc);
    expect(rows[1]).toEqual([
      { tag: "table:table-cell", attrs: { "table:number-columns-repeated": "3" } },
    ]);
  });

  test("T1 rng l.16223-16231: addRow([]) in a 1-column table → one bare empty cell, no repeat attribute (T4: LEAD 1 decision 2)", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow(["A1"]);
    sheet.addRow([]);
    const rows = await rowChildren(doc);
    expect(rows[1]).toEqual([{ tag: "table:table-cell", attrs: {} }]);
  });

  test("T1 rng l.16223-16231: addRow([]) with 0 declared columns → one bare empty cell (T4: Scott, LEAD 1 N = 0 ruling)", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([]);
    const rows = await rowChildren(doc);
    expect(rows[0]).toEqual([{ tag: "table:table-cell", attrs: {} }]);
  });

  test("T1 §19.680 (html l.17637) + §9.1.5 (html l.3836): { value: null, colSpan: 3 } → empty cell spanning 3 + 2 covered cells (T4: LEAD 1 decision 3)", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: null, type: "string", colSpan: 3 }]);
    const rows = await rowChildren(doc);
    expect(rows[0]).toEqual([
      { tag: "table:table-cell", attrs: { "table:number-columns-spanned": "3" } },
      { tag: "table:covered-table-cell", attrs: {} },
      { tag: "table:covered-table-cell", attrs: {} },
    ]);
  });

  test("T1 §19.680 + §9.1.5: { value: null, rowSpan: 2 } → empty cell spanning 2 rows + a covered cell below (T4: LEAD 1 decision 3)", async () => {
    const doc = new OdsDocument();
    const sheet = doc.addSheet("Sheet1");
    sheet.addRow([{ value: null, type: "string", rowSpan: 2 }, "B1"]);
    sheet.addRow(["B2"]);
    const rows = await rowChildren(doc);
    expect(rows[0][0]).toEqual({
      tag: "table:table-cell",
      attrs: { "table:number-rows-spanned": "2" },
    });
    expect(rows[1][0]).toEqual({ tag: "table:covered-table-cell", attrs: {} });
  });
});

// ─── Empty Spanning Cells Keep Style, Formula and Href (LEAD 1 repair, F1) ─
//
// T4: Scott's F1 ruling (2026-10-21): an empty spanning cell keeps everything the cell object
// specifies except a value — its own style, the row's style, its formula and its href. T1: each
// is an optional cell attribute independent of the value-type group (rng l.16059-16101), and
// text:a content is zeroOrMore (rng l.16458-16460). The cell carries no office:value-type: §19.389
// (html l.13832) "The value type of each of these elements shall be specified" against §9.1.4
// (html l.3827) "Table cells may be empty" is an UNRESOLVED T2 tension, recorded as a LEAD; this
// follows odf-kit's existing practice for empty cells (bare, no value type).

/** The first table:table-cell of the first sheet, and the parsed content.xml root. */
async function firstCell(
  doc: OdsDocument,
): Promise<{ cell: XmlElementNode; root: XmlElementNode }> {
  const { "content.xml": content } = await extractFiles(doc);
  const root = parseXml(content);
  const find = (n: XmlElementNode): XmlElementNode | undefined => {
    if (n.tag === "table:table-cell") return n;
    for (const c of n.children) {
      if (c.type !== "element") continue;
      const hit = find(c);
      if (hit) return hit;
    }
    return undefined;
  };
  const cell = find(root);
  if (!cell) throw new Error("no table:table-cell in content.xml");
  return { cell, root };
}

/** The table-cell-properties and text-properties attributes of the named automatic style. */
function cellStyleProps(root: XmlElementNode, name: string): Record<string, string> {
  const elements = (n: XmlElementNode): XmlElementNode[] =>
    n.children.filter((c): c is XmlElementNode => c.type === "element");
  const find = (n: XmlElementNode): XmlElementNode | undefined => {
    if (n.tag === "style:style" && n.attrs["style:name"] === name) return n;
    for (const c of elements(n)) {
      const hit = find(c);
      if (hit) return hit;
    }
    return undefined;
  };
  const style = find(root);
  if (!style) throw new Error(`no style:style named ${name}`);
  expect(style.attrs["style:family"]).toBe("table-cell");
  return Object.assign({}, ...elements(style).map((c) => c.attrs));
}

describe("OdsDocument — an empty spanning cell keeps style, formula and href (LEAD 1 repair, F1)", () => {
  test("T4 F1 ruling + T1 rng l.16066-16070: own style on { value: null, colSpan: 2 } → table:style-name, no value type, no content", async () => {
    const doc = new OdsDocument();
    doc
      .addSheet("Sheet1")
      .addRow([
        { value: null, type: "string", colSpan: 2, backgroundColor: "#FFFF00", bold: true },
        "C1",
      ]);
    const { cell, root } = await firstCell(doc);
    const styleName = cell.attrs["table:style-name"];
    expect(styleName).toBeDefined();
    expect(cell.attrs).toEqual({
      "table:number-columns-spanned": "2",
      "table:style-name": styleName,
    });
    expect(cell.children.filter((c) => c.type === "element")).toEqual([]);
    expect(cellStyleProps(root, styleName)).toMatchObject({
      "fo:background-color": "#FFFF00",
      "fo:font-weight": "bold",
    });
  });

  test("T4 F1 ruling + T1 rng l.16066-16070: row options on an empty spanning cell → the row's style on the cell", async () => {
    const doc = new OdsDocument();
    doc
      .addSheet("Sheet1")
      .addRow([{ value: null, type: "string", colSpan: 2 }, "C1"], { backgroundColor: "#00FF00" });
    const { cell, root } = await firstCell(doc);
    const styleName = cell.attrs["table:style-name"];
    expect(styleName).toBeDefined();
    expect(cell.attrs).toEqual({
      "table:number-columns-spanned": "2",
      "table:style-name": styleName,
    });
    expect(cellStyleProps(root, styleName)).toMatchObject({ "fo:background-color": "#00FF00" });
  });

  test("T4 F1 ruling, decision 2 + T1 rng l.16076-16080, §19.646 (html l.17077): formula on an empty spanning cell → table:formula, no value type, no cached value", async () => {
    const doc = new OdsDocument();
    doc
      .addSheet("Sheet1")
      .addRow([{ value: null, type: "string", formula: "SUM(1;2)", colSpan: 2 }, "C1"]);
    const { cell } = await firstCell(doc);
    expect(cell.attrs).toEqual({
      "table:number-columns-spanned": "2",
      "table:formula": "of:SUM(1;2)",
    });
    expect(cell.children.filter((c) => c.type === "element")).toEqual([]);
  });

  test("T4 F1 ruling, decision 3 + T1 rng l.16458-16480: href on an empty spanning cell → text:p > empty text:a, no value type", async () => {
    const doc = new OdsDocument();
    doc
      .addSheet("Sheet1")
      .addRow([{ value: null, type: "string", href: "https://example.org/", colSpan: 2 }, "C1"]);
    const { cell } = await firstCell(doc);
    expect(cell.attrs).toEqual({ "table:number-columns-spanned": "2" });
    const kids = cell.children.filter((c): c is XmlElementNode => c.type === "element");
    expect(kids.map((k) => k.tag)).toEqual(["text:p"]);
    const inner = kids[0].children.filter((c): c is XmlElementNode => c.type === "element");
    expect(inner.map((k) => [k.tag, k.attrs])).toEqual([
      ["text:a", { "xlink:type": "simple", "xlink:href": "https://example.org/" }],
    ]);
    expect(inner[0].children).toEqual([]);
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
  describe("OdsDocument — settings.xml", () => {
    test("settings.xml is present when freeze rows are set", async () => {
      const doc = new OdsDocument();
      const sheet = doc.addSheet("Sheet1");
      sheet.freezeRows(1);
      const files = await extractFiles(doc);
      expect(files["settings.xml"]).toBeDefined();
    });

    test("settings.xml includes xmlns:ooo namespace", async () => {
      const doc = new OdsDocument();
      const sheet = doc.addSheet("Sheet1");
      sheet.freezeRows(1);
      const files = await extractFiles(doc);
      expect(files["settings.xml"]).toContain("http://openoffice.org/2004/office");
    });

    test("settings.xml is absent when no freeze settings exist", async () => {
      const doc = new OdsDocument();
      doc.addSheet("Sheet1");
      const files = await extractFiles(doc);
      expect(files["settings.xml"]).toBeUndefined();
    });
  });
});
