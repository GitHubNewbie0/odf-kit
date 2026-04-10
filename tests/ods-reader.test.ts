import { describe, it, expect } from "@jest/globals";
import { OdsDocument } from "../src/ods/index.js";
import { readOds, odsToHtml } from "../src/ods-reader/index.js";

// ─── Helper ───────────────────────────────────────────────────────────

async function makeOds(build: (doc: OdsDocument) => void): Promise<Uint8Array> {
  const doc = new OdsDocument();
  build(doc);
  return doc.save();
}

// ─── Basic Structure ──────────────────────────────────────────────────

describe("readOds — basic structure", () => {
  it("returns an OdsDocumentModel with sheets array", async () => {
    const bytes = await makeOds((doc) => {
      doc.addSheet("Sheet1");
    });
    const model = readOds(bytes);
    expect(model.sheets).toBeDefined();
    expect(Array.isArray(model.sheets)).toBe(true);
  });

  it("reads sheet name correctly", async () => {
    const bytes = await makeOds((doc) => {
      doc.addSheet("MySalesData");
    });
    const model = readOds(bytes);
    expect(model.sheets[0].name).toBe("MySalesData");
  });

  it("reads multiple sheet names in order", async () => {
    const bytes = await makeOds((doc) => {
      doc.addSheet("Alpha");
      doc.addSheet("Beta");
      doc.addSheet("Gamma");
    });
    const model = readOds(bytes);
    expect(model.sheets).toHaveLength(3);
    expect(model.sheets[0].name).toBe("Alpha");
    expect(model.sheets[1].name).toBe("Beta");
    expect(model.sheets[2].name).toBe("Gamma");
  });
});

// ─── Cell Types ───────────────────────────────────────────────────────

describe("readOds — cell types", () => {
  it("reads a string cell", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow(["Hello"]);
    });
    const model = readOds(bytes);
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.type).toBe("string");
    expect(cell.value).toBe("Hello");
  });

  it("reads a float cell", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([1234.56]);
    });
    const model = readOds(bytes);
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.type).toBe("float");
    expect(cell.value).toBe(1234.56);
  });

  it("reads a boolean true cell", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([true]);
    });
    const model = readOds(bytes);
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.type).toBe("boolean");
    expect(cell.value).toBe(true);
  });

  it("reads a boolean false cell", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([false]);
    });
    const model = readOds(bytes);
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.type).toBe("boolean");
    expect(cell.value).toBe(false);
  });

  it("reads a date cell as a Date object", async () => {
    const date = new Date("2026-01-15T00:00:00Z");
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([date]);
    });
    const model = readOds(bytes);
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.type).toBe("date");
    expect(cell.value).toBeInstanceOf(Date);
    expect((cell.value as Date).toISOString().slice(0, 10)).toBe("2026-01-15");
  });

  it("reads a formula cell with cached result", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([{ value: "=SUM(1,2)", type: "formula" }]);
    });
    const model = readOds(bytes);
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.type).toBe("formula");
    expect(cell.formula).toBe("=SUM(1,2)");
  });

  it("reads an empty cell as type empty with null value", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow(["A", null, "C"]);
    });
    const model = readOds(bytes);
    const row = model.sheets[0].rows[0];
    // First and last cells present
    expect(row.cells[0].value).toBe("A");
  });

  it("reads multiple cell types in one row", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow(["Text", 42, true, new Date("2026-06-01T00:00:00Z")]);
    });
    const model = readOds(bytes);
    const cells = model.sheets[0].rows[0].cells;
    expect(cells[0].type).toBe("string");
    expect(cells[1].type).toBe("float");
    expect(cells[1].value).toBe(42);
    expect(cells[2].type).toBe("boolean");
    expect(cells[3].type).toBe("date");
  });
});

// ─── Multiple Rows ────────────────────────────────────────────────────

describe("readOds — multiple rows", () => {
  it("reads multiple rows with correct values", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow(["January", 12500]);
      sheet.addRow(["February", 14200]);
      sheet.addRow(["March", 13100]);
    });
    const model = readOds(bytes);
    const rows = model.sheets[0].rows;
    expect(rows).toHaveLength(3);
    expect(rows[0].cells[0].value).toBe("January");
    expect(rows[0].cells[1].value).toBe(12500);
    expect(rows[1].cells[0].value).toBe("February");
    expect(rows[2].cells[0].value).toBe("March");
  });

  it("row index is correct", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow(["Row 0"]);
      sheet.addRow(["Row 1"]);
      sheet.addRow(["Row 2"]);
    });
    const model = readOds(bytes);
    const rows = model.sheets[0].rows;
    expect(rows[0].index).toBe(0);
    expect(rows[1].index).toBe(1);
    expect(rows[2].index).toBe(2);
  });
});

// ─── Column Index ─────────────────────────────────────────────────────

describe("readOds — column indices", () => {
  it("cell colIndex is correct", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow(["A", "B", "C"]);
    });
    const model = readOds(bytes);
    const cells = model.sheets[0].rows[0].cells;
    expect(cells[0].colIndex).toBe(0);
    expect(cells[1].colIndex).toBe(1);
    expect(cells[2].colIndex).toBe(2);
  });
});

// ─── Display Text ─────────────────────────────────────────────────────

describe("readOds — display text", () => {
  it("displayText is available on string cells", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow(["Hello World"]);
    });
    const model = readOds(bytes);
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.displayText).toBe("Hello World");
  });

  it("displayText is available on float cells", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([1234.56]);
    });
    const model = readOds(bytes);
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.displayText).toBeDefined();
  });
});

// ─── Merged Cells ─────────────────────────────────────────────────────

describe("readOds — merged cells", () => {
  it("primary cell has colSpan set", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([{ value: "Merged", type: "string", colSpan: 3 }]);
    });
    const model = readOds(bytes);
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.colSpan).toBe(3);
  });

  it("covered cells have type covered and null value", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([{ value: "Merged", type: "string", colSpan: 2 }, "C"]);
    });
    const model = readOds(bytes);
    const cells = model.sheets[0].rows[0].cells;
    expect(cells[1].type).toBe("covered");
    expect(cells[1].value).toBeNull();
  });

  it("covered cell has correct colIndex", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([{ value: "Merged", type: "string", colSpan: 2 }, "C"]);
    });
    const model = readOds(bytes);
    const cells = model.sheets[0].rows[0].cells;
    expect(cells[1].colIndex).toBe(1);
    expect(cells[2].colIndex).toBe(2);
  });

  it("cell after merge has correct colIndex", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow(["A", { value: "Merged", type: "string", colSpan: 2 }, "D"]);
    });
    const model = readOds(bytes);
    const cells = model.sheets[0].rows[0].cells;
    // A=0, Merged=1, covered=2, D=3
    const dCell = cells.find((c) => c.value === "D");
    expect(dCell?.colIndex).toBe(3);
  });
});

// ─── Formatting ───────────────────────────────────────────────────────

describe("readOds — cell formatting", () => {
  it("reads bold formatting", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([{ value: "Bold", type: "string", bold: true }]);
    });
    const model = readOds(bytes);
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.formatting?.bold).toBe(true);
  });

  it("reads background color", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([{ value: "Colored", type: "string", backgroundColor: "#DDDDDD" }]);
    });
    const model = readOds(bytes);
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.formatting?.backgroundColor).toBe("#DDDDDD");
  });

  it("formatting is absent when includeFormatting is false", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([{ value: "Bold", type: "string", bold: true }]);
    });
    const model = readOds(bytes, { includeFormatting: false });
    const cell = model.sheets[0].rows[0].cells[0];
    expect(cell.formatting).toBeUndefined();
  });
});

// ─── Sheet Tab Color ──────────────────────────────────────────────────

describe("readOds — sheet tab color", () => {
  it("reads tab color", async () => {
    const bytes = await makeOds((doc) => {
      doc.addSheet("Sheet1").setTabColor("#FF0000");
    });
    const model = readOds(bytes);
    expect(model.sheets[0].tabColor).toBe("#FF0000");
  });

  it("tabColor is undefined when not set", async () => {
    const bytes = await makeOds((doc) => {
      doc.addSheet("Sheet1");
    });
    const model = readOds(bytes);
    expect(model.sheets[0].tabColor).toBeUndefined();
  });
});

// ─── Freeze Settings ──────────────────────────────────────────────────

describe("readOds — freeze settings", () => {
  it("reads freezeRows", async () => {
    const bytes = await makeOds((doc) => {
      doc.addSheet("Sheet1").freezeRows(1);
    });
    const model = readOds(bytes);
    expect(model.sheets[0].freezeRows).toBe(1);
  });

  it("reads freezeColumns", async () => {
    const bytes = await makeOds((doc) => {
      doc.addSheet("Sheet1").freezeColumns(2);
    });
    const model = readOds(bytes);
    expect(model.sheets[0].freezeColumns).toBe(2);
  });

  it("freezeRows is undefined when not set", async () => {
    const bytes = await makeOds((doc) => {
      doc.addSheet("Sheet1");
    });
    const model = readOds(bytes);
    expect(model.sheets[0].freezeRows).toBeUndefined();
  });
});

// ─── Metadata ─────────────────────────────────────────────────────────

describe("readOds — metadata", () => {
  it("reads document title", async () => {
    const bytes = await makeOds((doc) => {
      doc.setMetadata({ title: "My Report" });
      doc.addSheet("Sheet1");
    });
    const model = readOds(bytes);
    expect(model.metadata?.title).toBe("My Report");
  });

  it("reads creator", async () => {
    const bytes = await makeOds((doc) => {
      doc.setMetadata({ creator: "Alice" });
      doc.addSheet("Sheet1");
    });
    const model = readOds(bytes);
    expect(model.metadata?.creator).toBe("Alice");
  });
});

// ─── odsToHtml ────────────────────────────────────────────────────────

describe("odsToHtml", () => {
  it("returns a string", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow(["Hello", 42]);
    });
    const html = odsToHtml(bytes);
    expect(typeof html).toBe("string");
  });

  it("contains sheet name", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("MySalesData");
      sheet.addRow(["January", 12500]);
    });
    const html = odsToHtml(bytes);
    expect(html).toContain("MySalesData");
  });

  it("contains cell values", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow(["Alice", 30]);
    });
    const html = odsToHtml(bytes);
    expect(html).toContain("Alice");
    expect(html).toContain("30");
  });

  it("contains table element", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow(["A"]);
    });
    const html = odsToHtml(bytes);
    expect(html).toContain("<table");
  });

  it("merged cells use colspan attribute", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([{ value: "Header", type: "string", colSpan: 3 }]);
    });
    const html = odsToHtml(bytes);
    expect(html).toContain('colspan="3"');
  });

  it("covered cells not rendered", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([{ value: "Merged", type: "string", colSpan: 2 }]);
    });
    const html = odsToHtml(bytes);
    // Only one <td> for the merged cell, no extra td for covered
    const tdCount = (html.match(/<td/g) ?? []).length;
    expect(tdCount).toBe(1);
  });

  it("bold formatting applied as inline style", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([{ value: "Bold", type: "string", bold: true }]);
    });
    const html = odsToHtml(bytes);
    expect(html).toContain("font-weight:bold");
  });

  it("includeStyles:false omits inline styles", async () => {
    const bytes = await makeOds((doc) => {
      const sheet = doc.addSheet("Sheet1");
      sheet.addRow([{ value: "Bold", type: "string", bold: true }]);
    });
    const html = odsToHtml(bytes, { includeStyles: false });
    expect(html).not.toContain("font-weight");
  });

  it("wraps output in ods-document div", async () => {
    const bytes = await makeOds((doc) => {
      doc.addSheet("Sheet1").addRow(["A"]);
    });
    const html = odsToHtml(bytes);
    expect(html).toContain('class="ods-document"');
  });

  it("custom classPrefix applied", async () => {
    const bytes = await makeOds((doc) => {
      doc.addSheet("Sheet1").addRow(["A"]);
    });
    const html = odsToHtml(bytes, { classPrefix: "myapp" });
    expect(html).toContain('class="myapp-document"');
    expect(html).toContain('class="myapp-sheet"');
  });
});
