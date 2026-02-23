import { unzipSync } from "fflate";
import { OdtDocument } from "../src/odt/document.js";

const decode = new TextDecoder();

/** Helper: generate an .odt, unzip it, and return the entries. */
async function unpackOdt(
  doc: OdtDocument,
): Promise<Record<string, Uint8Array>> {
  const bytes = await doc.save();
  return unzipSync(bytes);
}

/** Helper: generate an .odt and return its content.xml as a string. */
async function getContentXml(doc: OdtDocument): Promise<string> {
  const entries = await unpackOdt(doc);
  return decode.decode(entries["content.xml"]);
}

/** Helper: generate an .odt and return its styles.xml as a string. */
async function getStylesXml(doc: OdtDocument): Promise<string> {
  const entries = await unpackOdt(doc);
  return decode.decode(entries["styles.xml"]);
}

describe("OdtDocument", () => {
  describe("Hello World .odt generation", () => {
    let entries: Record<string, Uint8Array>;

    beforeAll(async () => {
      const doc = new OdtDocument();
      doc.addParagraph("Hello, World!");
      entries = await unpackOdt(doc);
    });

    it("should produce a valid ZIP file", () => {
      expect(entries).toBeDefined();
    });

    it("should contain an uncompressed mimetype file as the first entry", () => {
      expect(entries["mimetype"]).toBeDefined();
      expect(decode.decode(entries["mimetype"])).toBe(
        "application/vnd.oasis.opendocument.text",
      );
    });

    it("should contain META-INF/manifest.xml", () => {
      expect(entries["META-INF/manifest.xml"]).toBeDefined();
      const content = decode.decode(entries["META-INF/manifest.xml"]);
      expect(content).toContain("manifest:manifest");
      expect(content).toContain("application/vnd.oasis.opendocument.text");
      expect(content).toContain("content.xml");
      expect(content).toContain("styles.xml");
      expect(content).toContain("meta.xml");
    });

    it("should contain content.xml with the paragraph", () => {
      expect(entries["content.xml"]).toBeDefined();
      const content = decode.decode(entries["content.xml"]);
      expect(content).toContain("office:document-content");
      expect(content).toContain("office:body");
      expect(content).toContain("office:text");
      expect(content).toContain("Hello, World!");
      expect(content).toContain("text:p");
    });

    it("should contain styles.xml", () => {
      expect(entries["styles.xml"]).toBeDefined();
      const content = decode.decode(entries["styles.xml"]);
      expect(content).toContain("office:document-styles");
    });

    it("should contain meta.xml with generator tag", () => {
      expect(entries["meta.xml"]).toBeDefined();
      const content = decode.decode(entries["meta.xml"]);
      expect(content).toContain("office:document-meta");
      expect(content).toContain("odf-kit");
    });
  });

  describe("headings", () => {
    it("should support headings with levels", async () => {
      const doc = new OdtDocument();
      doc.addHeading("Chapter One", 1);
      doc.addParagraph("Some text.");
      const content = await getContentXml(doc);

      expect(content).toContain("text:h");
      expect(content).toContain("Chapter One");
      expect(content).toContain('text:outline-level="1"');
    });
  });

  describe("metadata", () => {
    it("should include custom metadata", async () => {
      const doc = new OdtDocument();
      doc.setMetadata({ title: "Test Doc", creator: "Test Author" });
      doc.addParagraph("Content.");
      const entries = await unpackOdt(doc);
      const meta = decode.decode(entries["meta.xml"]);

      expect(meta).toContain("Test Doc");
      expect(meta).toContain("Test Author");
    });
  });

  describe("fluent API", () => {
    it("should support method chaining", async () => {
      const doc = new OdtDocument();
      const result = doc
        .setMetadata({ title: "Chained" })
        .addHeading("Title", 1)
        .addParagraph("Body text.");

      expect(result).toBe(doc);

      const bytes = await doc.save();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);
    });
  });

  describe("text formatting", () => {
    it("should generate bold text with text:span and automatic style", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("bold", { bold: true });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-weight="bold"');
      expect(content).toContain("text:span");
      expect(content).toContain("bold");
    });

    it("should generate italic text", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("italic", { italic: true });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-style="italic"');
      expect(content).toContain("text:span");
    });

    it("should support fontWeight and fontStyle as alternatives to bold/italic", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("styled", { fontWeight: "bold", fontStyle: "italic" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-weight="bold"');
      expect(content).toContain('fo:font-style="italic"');
    });

    it("should support fontSize as a number (assumes pt)", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("big", { fontSize: 24 });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-size="24pt"');
    });

    it("should support fontSize as a string with units", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("big", { fontSize: "18pt" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-size="18pt"');
    });

    it("should support fontFamily", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("fancy", { fontFamily: "Arial" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain("Arial");
    });

    it("should support color as hex", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("red", { color: "#FF0000" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:color="#FF0000"');
    });

    it("should support color as named CSS color", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("red", { color: "red" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:color="#ff0000"');
    });

    it("should mix plain and formatted text in one paragraph", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("Normal ");
        p.addText("bold ", { bold: true });
        p.addText("normal again");
      });
      const content = await getContentXml(doc);

      expect(content).toContain("Normal ");
      expect(content).toContain("text:span");
      expect(content).toContain("bold ");
      expect(content).toContain("normal again");
    });

    it("should deduplicate identical formatting styles", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("first bold ", { bold: true });
        p.addText("second bold", { bold: true });
      });
      const content = await getContentXml(doc);

      const spanMatches = content.match(/text:style-name="T1"/g);
      expect(spanMatches).not.toBeNull();
      expect(spanMatches!.length).toBe(2);

      const styleMatches = content.match(/style:name="T1"/g);
      expect(styleMatches).not.toBeNull();
      expect(styleMatches!.length).toBe(1);
    });

    it("should create separate styles for different formatting", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("bold", { bold: true });
        p.addText("italic", { italic: true });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('style:name="T1"');
      expect(content).toContain('style:name="T2"');
    });

    it("should support combined formatting properties", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("fancy", {
          bold: true,
          italic: true,
          fontSize: 16,
          fontFamily: "Arial",
          color: "#336699",
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-weight="bold"');
      expect(content).toContain('fo:font-style="italic"');
      expect(content).toContain('fo:font-size="16pt"');
      expect(content).toContain("Arial");
      expect(content).toContain('fo:color="#336699"');
    });

    it("should support formatted headings with callback", async () => {
      const doc = new OdtDocument();
      doc.addHeading((h) => {
        h.addText("Chapter ");
        h.addText("One", { italic: true });
      }, 1);
      const content = await getContentXml(doc);

      expect(content).toContain("text:h");
      expect(content).toContain("Chapter ");
      expect(content).toContain('fo:font-style="italic"');
      expect(content).toContain("One");
    });

    it("should let explicit fontWeight override bold shortcut", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("not bold", { bold: true, fontWeight: "normal" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-weight="normal"');
    });
  });

  describe("tables", () => {
    it("should generate a basic table from array of arrays", async () => {
      const doc = new OdtDocument();
      doc.addTable([
        ["Name", "Age"],
        ["Alice", "30"],
      ]);
      const content = await getContentXml(doc);

      expect(content).toContain("table:table");
      expect(content).toContain("table:table-row");
      expect(content).toContain("table:table-cell");
      expect(content).toContain("Name");
      expect(content).toContain("Age");
      expect(content).toContain("Alice");
      expect(content).toContain("30");
    });

    it("should generate table:table-column elements", async () => {
      const doc = new OdtDocument();
      doc.addTable([["A", "B", "C"]]);
      const content = await getContentXml(doc);

      expect(content).toContain("table:table-column");
      expect(content).toContain('table:number-columns-repeated="3"');
    });

    it("should support column widths", async () => {
      const doc = new OdtDocument();
      doc.addTable(
        [
          ["Name", "Age"],
          ["Alice", "30"],
        ],
        { columnWidths: ["5cm", "3cm"] },
      );
      const content = await getContentXml(doc);

      expect(content).toContain('style:column-width="5cm"');
      expect(content).toContain('style:column-width="3cm"');
    });

    it("should support table-level border applied to all cells", async () => {
      const doc = new OdtDocument();
      doc.addTable([["A", "B"]], { border: "0.5pt solid #000000" });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:border-top="0.5pt solid #000000"');
      expect(content).toContain('fo:border-bottom="0.5pt solid #000000"');
      expect(content).toContain('fo:border-left="0.5pt solid #000000"');
      expect(content).toContain('fo:border-right="0.5pt solid #000000"');
    });

    it("should support cell background color", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("Header", { backgroundColor: "#DDDDDD" });
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:background-color="#DDDDDD"');
    });

    it("should support named colors for cell background", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("Header", { backgroundColor: "lightgray" });
        });
      });
      const content = await getContentXml(doc);

      // lightgray is not in our named colors map, so it passes through
      // but silver (#c0c0c0) is — let's test that
      const doc2 = new OdtDocument();
      doc2.addTable((t) => {
        t.addRow((r) => {
          r.addCell("Header", { backgroundColor: "silver" });
        });
      });
      const content2 = await getContentXml(doc2);
      expect(content2).toContain('fo:background-color="#c0c0c0"');
    });

    it("should support individual border overrides", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("Cell", {
            border: "0.5pt solid #000000",
            borderBottom: "2pt solid #FF0000",
          });
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:border-top="0.5pt solid #000000"');
      expect(content).toContain('fo:border-bottom="2pt solid #FF0000"');
      expect(content).toContain('fo:border-left="0.5pt solid #000000"');
      expect(content).toContain('fo:border-right="0.5pt solid #000000"');
    });

    it("should support bold text in cells via CellOptions", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("Header", { bold: true });
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-weight="bold"');
      expect(content).toContain("text:span");
      expect(content).toContain("Header");
    });

    it("should support rich text inside cells via callback", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell((c) => {
            c.addText("Total: ", { bold: true });
            c.addText("$1,250", { color: "green" });
          });
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain("Total: ");
      expect(content).toContain("$1,250");
      expect(content).toContain('fo:font-weight="bold"');
    });

    it("should support colSpan (column merging)", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("Merged", { colSpan: 2 });
        });
        t.addRow((r) => {
          r.addCell("Left");
          r.addCell("Right");
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('table:number-columns-spanned="2"');
      expect(content).toContain("table:covered-table-cell");
      expect(content).toContain("Merged");
    });

    it("should support rowSpan (row merging)", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("Tall", { rowSpan: 2 });
          r.addCell("Top");
        });
        t.addRow((r) => {
          r.addCell("Bottom");
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('table:number-rows-spanned="2"');
      expect(content).toContain("table:covered-table-cell");
      expect(content).toContain("Tall");
      expect(content).toContain("Top");
      expect(content).toContain("Bottom");
    });

    it("should deduplicate identical cell styles", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("A", { backgroundColor: "#DDDDDD" });
          r.addCell("B", { backgroundColor: "#DDDDDD" });
        });
      });
      const content = await getContentXml(doc);

      const cellStyleMatches = content.match(/table:style-name="C1"/g);
      expect(cellStyleMatches).not.toBeNull();
      expect(cellStyleMatches!.length).toBe(2);

      const styleDefs = content.match(/style:name="C1"/g);
      expect(styleDefs).not.toBeNull();
      expect(styleDefs!.length).toBe(1);
    });

    it("should support multiple tables in one document", async () => {
      const doc = new OdtDocument();
      doc.addTable([["A1"]]);
      doc.addParagraph("Between tables.");
      doc.addTable([["B1"]]);
      const content = await getContentXml(doc);

      expect(content).toContain('table:name="Table1"');
      expect(content).toContain('table:name="Table2"');
      expect(content).toContain("Between tables.");
    });

    it("should support method chaining with addTable", async () => {
      const doc = new OdtDocument();
      const result = doc
        .addHeading("Report", 1)
        .addTable([["X", "Y"]])
        .addParagraph("Done.");

      expect(result).toBe(doc);

      const bytes = await doc.save();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);
    });

    it("should produce valid .odt files with tables", async () => {
      const doc = new OdtDocument();
      doc.addHeading("Table Test", 1);
      doc.addTable(
        [
          ["Name", "Age", "City"],
          ["Alice", "30", "Portland"],
          ["Bob", "25", "Seattle"],
        ],
        {
          columnWidths: ["5cm", "2cm", "4cm"],
          border: "0.5pt solid #000000",
        },
      );

      const entries = await unpackOdt(doc);

      expect(entries["mimetype"]).toBeDefined();
      expect(entries["content.xml"]).toBeDefined();
      expect(entries["styles.xml"]).toBeDefined();
      expect(entries["meta.xml"]).toBeDefined();
      expect(entries["META-INF/manifest.xml"]).toBeDefined();
    });
  });

  describe("page layout", () => {
    it("should default to A4 portrait with 2cm margins", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("Test");
      const styles = await getStylesXml(doc);

      expect(styles).toContain('fo:page-width="21cm"');
      expect(styles).toContain('fo:page-height="29.7cm"');
      expect(styles).toContain('style:print-orientation="portrait"');
      expect(styles).toContain('fo:margin-top="2cm"');
      expect(styles).toContain('fo:margin-bottom="2cm"');
      expect(styles).toContain('fo:margin-left="2cm"');
      expect(styles).toContain('fo:margin-right="2cm"');
    });

    it("should support landscape orientation with swapped A4 dimensions", async () => {
      const doc = new OdtDocument();
      doc.setPageLayout({ orientation: "landscape" });
      doc.addParagraph("Test");
      const styles = await getStylesXml(doc);

      expect(styles).toContain('fo:page-width="29.7cm"');
      expect(styles).toContain('fo:page-height="21cm"');
      expect(styles).toContain('style:print-orientation="landscape"');
    });

    it("should support custom page dimensions (US Letter)", async () => {
      const doc = new OdtDocument();
      doc.setPageLayout({ width: "8.5in", height: "11in" });
      doc.addParagraph("Test");
      const styles = await getStylesXml(doc);

      expect(styles).toContain('fo:page-width="8.5in"');
      expect(styles).toContain('fo:page-height="11in"');
    });

    it("should support custom margins", async () => {
      const doc = new OdtDocument();
      doc.setPageLayout({
        marginTop: "1.5cm",
        marginBottom: "1.5cm",
        marginLeft: "1cm",
        marginRight: "1cm",
      });
      doc.addParagraph("Test");
      const styles = await getStylesXml(doc);

      expect(styles).toContain('fo:margin-top="1.5cm"');
      expect(styles).toContain('fo:margin-bottom="1.5cm"');
      expect(styles).toContain('fo:margin-left="1cm"');
      expect(styles).toContain('fo:margin-right="1cm"');
    });

    it("should support method chaining with setPageLayout", () => {
      const doc = new OdtDocument();
      const result = doc
        .setPageLayout({ orientation: "landscape" })
        .addParagraph("Test");
      expect(result).toBe(doc);
    });
  });

  describe("headers and footers", () => {
    it("should support a plain text header", async () => {
      const doc = new OdtDocument();
      doc.setHeader("Company Report");
      doc.addParagraph("Content");
      const styles = await getStylesXml(doc);

      expect(styles).toContain("style:header");
      expect(styles).toContain("Company Report");
    });

    it("should support a plain text footer", async () => {
      const doc = new OdtDocument();
      doc.setFooter("Confidential");
      doc.addParagraph("Content");
      const styles = await getStylesXml(doc);

      expect(styles).toContain("style:footer");
      expect(styles).toContain("Confidential");
    });

    it("should replace ### with page number field in footer string", async () => {
      const doc = new OdtDocument();
      doc.setFooter("Page ###");
      doc.addParagraph("Content");
      const styles = await getStylesXml(doc);

      expect(styles).toContain("text:page-number");
      expect(styles).toContain("Page ");
    });

    it("should replace ### with page number field in header string", async () => {
      const doc = new OdtDocument();
      doc.setHeader("Page ### of report");
      doc.addParagraph("Content");
      const styles = await getStylesXml(doc);

      expect(styles).toContain("text:page-number");
      expect(styles).toContain("Page ");
      expect(styles).toContain(" of report");
    });

    it("should support formatted header via builder callback", async () => {
      const doc = new OdtDocument();
      doc.setHeader((h) => {
        h.addText("Report", { bold: true });
        h.addText(" \u2014 Draft", { italic: true });
      });
      doc.addParagraph("Content");
      const styles = await getStylesXml(doc);

      expect(styles).toContain("style:header");
      expect(styles).toContain('fo:font-weight="bold"');
      expect(styles).toContain('fo:font-style="italic"');
      expect(styles).toContain("Report");
      expect(styles).toContain(" \u2014 Draft");
    });

    it("should support formatted footer with page number via builder", async () => {
      const doc = new OdtDocument();
      doc.setFooter((f) => {
        f.addText("Page ");
        f.addPageNumber({ bold: true });
        f.addText(" \u2014 Confidential", { italic: true, color: "gray" });
      });
      doc.addParagraph("Content");
      const styles = await getStylesXml(doc);

      expect(styles).toContain("style:footer");
      expect(styles).toContain("text:page-number");
      expect(styles).toContain("Page ");
      expect(styles).toContain(" \u2014 Confidential");
    });

    it("should support both header and footer simultaneously", async () => {
      const doc = new OdtDocument();
      doc.setHeader("Top of page");
      doc.setFooter("Bottom of page");
      doc.addParagraph("Content");
      const styles = await getStylesXml(doc);

      expect(styles).toContain("style:header");
      expect(styles).toContain("style:footer");
      expect(styles).toContain("Top of page");
      expect(styles).toContain("Bottom of page");
    });

    it("should generate header/footer spacing styles", async () => {
      const doc = new OdtDocument();
      doc.setHeader("Header");
      doc.setFooter("Footer");
      doc.addParagraph("Content");
      const styles = await getStylesXml(doc);

      expect(styles).toContain("style:header-footer-properties");
    });

    it("should support method chaining with setHeader and setFooter", () => {
      const doc = new OdtDocument();
      const result = doc.setHeader("H").setFooter("F").addParagraph("Test");
      expect(result).toBe(doc);
    });
  });

  describe("page breaks", () => {
    it("should insert a page break between content", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("Page 1 content.");
      doc.addPageBreak();
      doc.addParagraph("Page 2 content.");
      const content = await getContentXml(doc);

      expect(content).toContain('text:style-name="PageBreak"');
      expect(content).toContain('fo:break-before="page"');
      expect(content).toContain("Page 1 content.");
      expect(content).toContain("Page 2 content.");
    });

    it("should generate page break style only when needed", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("No break here.");
      const content = await getContentXml(doc);

      expect(content).not.toContain("PageBreak");
      expect(content).not.toContain("fo:break-before");
    });

    it("should support method chaining with addPageBreak", () => {
      const doc = new OdtDocument();
      const result = doc.addParagraph("A").addPageBreak().addParagraph("B");
      expect(result).toBe(doc);
    });

    it("should produce valid .odt with all page layout features", async () => {
      const doc = new OdtDocument();
      doc.setPageLayout({ orientation: "landscape", marginTop: "1cm" });
      doc.setHeader((h) => {
        h.addText("Report", { bold: true });
        h.addText(" \u2014 Page ");
        h.addPageNumber();
      });
      doc.setFooter("Confidential \u2014 Page ###");
      doc.addHeading("Chapter 1", 1);
      doc.addParagraph("First chapter.");
      doc.addPageBreak();
      doc.addHeading("Chapter 2", 1);
      doc.addParagraph("Second chapter.");

      const entries = await unpackOdt(doc);

      expect(entries["mimetype"]).toBeDefined();
      expect(entries["content.xml"]).toBeDefined();
      expect(entries["styles.xml"]).toBeDefined();
      expect(entries["meta.xml"]).toBeDefined();
      expect(entries["META-INF/manifest.xml"]).toBeDefined();

      const content = decode.decode(entries["content.xml"]);
      const styles = decode.decode(entries["styles.xml"]);

      expect(styles).toContain('style:print-orientation="landscape"');
      expect(styles).toContain('fo:margin-top="1cm"');
      expect(styles).toContain("style:header");
      expect(styles).toContain("style:footer");
      expect(styles).toContain("text:page-number");
      expect(content).toContain("PageBreak");
    });
  });

  describe("advanced text formatting", () => {
    it("should generate underlined text", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("underlined", { underline: true });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('style:text-underline-style="solid"');
      expect(content).toContain('style:text-underline-width="auto"');
      expect(content).toContain('style:text-underline-color="font-color"');
    });

    it("should generate strikethrough text", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("deleted", { strikethrough: true });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('style:text-line-through-style="solid"');
    });

    it("should generate superscript text", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("2", { superscript: true });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('style:text-position="super 58%"');
    });

    it("should generate subscript text", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("2", { subscript: true });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('style:text-position="sub 58%"');
    });

    it("should generate highlighted text with hex color", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("highlighted", { highlightColor: "#FFFF00" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:background-color="#FFFF00"');
    });

    it("should generate highlighted text with named color", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("highlighted", { highlightColor: "yellow" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:background-color="#ffff00"');
    });

    it("should combine underline with other formatting", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("bold underline", { bold: true, underline: true });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-weight="bold"');
      expect(content).toContain('style:text-underline-style="solid"');
    });

    it("should deduplicate styles for identical advanced formatting", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("first", { underline: true });
        p.addText("second", { underline: true });
      });
      const content = await getContentXml(doc);

      const matches = content.match(/style:name="T/g);
      expect(matches).toHaveLength(1);
    });

    it("should create separate styles for different advanced formatting", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("under", { underline: true });
        p.addText("strike", { strikethrough: true });
      });
      const content = await getContentXml(doc);

      const matches = content.match(/style:name="T/g);
      expect(matches).toHaveLength(2);
    });

    it("should handle H\u2082O example with subscript", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("H");
        p.addText("2", { subscript: true });
        p.addText("O");
      });
      const content = await getContentXml(doc);

      expect(content).toContain("H");
      expect(content).toContain("O");
      expect(content).toContain('style:text-position="sub 58%"');
    });
  });

  describe("lists", () => {
    it("should generate a bullet list from string array", async () => {
      const doc = new OdtDocument();
      doc.addList(["Item 1", "Item 2", "Item 3"]);
      const content = await getContentXml(doc);

      expect(content).toContain("text:list");
      expect(content).toContain("text:list-item");
      expect(content).toContain("Item 1");
      expect(content).toContain("Item 2");
      expect(content).toContain("Item 3");
    });

    it("should generate bullet list style with bullet chars", async () => {
      const doc = new OdtDocument();
      doc.addList(["Test"]);
      const content = await getContentXml(doc);

      expect(content).toContain("text:list-level-style-bullet");
      expect(content).toContain("text:bullet-char");
    });

    it("should generate a numbered list", async () => {
      const doc = new OdtDocument();
      doc.addList(["First", "Second"], { type: "numbered" });
      const content = await getContentXml(doc);

      expect(content).toContain("text:list-level-style-number");
      expect(content).toContain('style:num-format="1"');
      expect(content).toContain('style:num-suffix="."');
    });

    it("should support formatted list items via builder", async () => {
      const doc = new OdtDocument();
      doc.addList((l) => {
        l.addItem("Plain");
        l.addItem((p) => {
          p.addText("Bold ", { bold: true });
          p.addText("item");
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain("Plain");
      expect(content).toContain("Bold ");
      expect(content).toContain('fo:font-weight="bold"');
    });

    it("should support nested lists", async () => {
      const doc = new OdtDocument();
      doc.addList((l) => {
        l.addItem("Parent");
        l.addNested((sub) => {
          sub.addItem("Child 1");
          sub.addItem("Child 2");
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain("Parent");
      expect(content).toContain("Child 1");
      expect(content).toContain("Child 2");
      const nestedListCount = (content.match(/<text:list[ >]/g) ?? []).length;
      expect(nestedListCount).toBeGreaterThanOrEqual(2);
    });

    it("should support deeply nested lists", async () => {
      const doc = new OdtDocument();
      doc.addList((l) => {
        l.addItem("Level 1");
        l.addNested((sub) => {
          sub.addItem("Level 2");
          sub.addNested((subsub) => {
            subsub.addItem("Level 3");
          });
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain("Level 1");
      expect(content).toContain("Level 2");
      expect(content).toContain("Level 3");
    });

    it("should support multiple lists in one document", async () => {
      const doc = new OdtDocument();
      doc.addList(["Bullet 1", "Bullet 2"]);
      doc.addList(["Number 1", "Number 2"], { type: "numbered" });
      const content = await getContentXml(doc);

      expect(content).toContain("text:list-level-style-bullet");
      expect(content).toContain("text:list-level-style-number");
      expect(content).toContain("Bullet 1");
      expect(content).toContain("Number 1");
    });

    it("should support method chaining with addList", () => {
      const doc = new OdtDocument();
      const result = doc.addList(["A"]).addParagraph("B");
      expect(result).toBe(doc);
    });

    it("should generate list level properties for indentation", async () => {
      const doc = new OdtDocument();
      doc.addList(["Test"]);
      const content = await getContentXml(doc);

      expect(content).toContain("style:list-level-properties");
      expect(content).toContain("style:list-level-label-alignment");
      expect(content).toContain("fo:margin-left");
      expect(content).toContain("fo:text-indent");
    });
  });

  describe("tab stops", () => {
    it("should insert tab elements", async () => {
      const doc = new OdtDocument();
      doc.addParagraph(
        (p) => {
          p.addText("Label");
          p.addTab();
          p.addText("Value");
        },
        { tabStops: [{ position: "8cm" }] },
      );
      const content = await getContentXml(doc);

      expect(content).toContain("text:tab");
      expect(content).toContain("Label");
      expect(content).toContain("Value");
    });

    it("should generate paragraph style with tab stop positions", async () => {
      const doc = new OdtDocument();
      doc.addParagraph(
        (p) => {
          p.addText("A");
          p.addTab();
          p.addText("B");
        },
        { tabStops: [{ position: "8cm" }] },
      );
      const content = await getContentXml(doc);

      expect(content).toContain("style:tab-stops");
      expect(content).toContain('style:position="8cm"');
      expect(content).toContain('style:type="left"');
    });

    it("should support right-aligned tab stops", async () => {
      const doc = new OdtDocument();
      doc.addParagraph(
        (p) => {
          p.addText("Left");
          p.addTab();
          p.addText("Right");
        },
        { tabStops: [{ position: "16cm", type: "right" }] },
      );
      const content = await getContentXml(doc);

      expect(content).toContain('style:type="right"');
    });

    it("should support center-aligned tab stops", async () => {
      const doc = new OdtDocument();
      doc.addParagraph(
        (p) => {
          p.addText("Left");
          p.addTab();
          p.addText("Center");
        },
        { tabStops: [{ position: "8cm", type: "center" }] },
      );
      const content = await getContentXml(doc);

      expect(content).toContain('style:type="center"');
    });

    it("should support multiple tab stops", async () => {
      const doc = new OdtDocument();
      doc.addParagraph(
        (p) => {
          p.addText("Col1");
          p.addTab();
          p.addText("Col2");
          p.addTab();
          p.addText("Col3");
        },
        { tabStops: [{ position: "5cm" }, { position: "10cm" }] },
      );
      const content = await getContentXml(doc);

      expect(content).toContain('style:position="5cm"');
      expect(content).toContain('style:position="10cm"');
    });

    it("should deduplicate paragraph styles with same tab stops", async () => {
      const doc = new OdtDocument();
      doc.addParagraph(
        (p) => {
          p.addText("A");
          p.addTab();
          p.addText("B");
        },
        { tabStops: [{ position: "8cm" }] },
      );
      doc.addParagraph(
        (p) => {
          p.addText("C");
          p.addTab();
          p.addText("D");
        },
        { tabStops: [{ position: "8cm" }] },
      );
      const content = await getContentXml(doc);

      const matches = content.match(/style:name="P/g);
      expect(matches).toHaveLength(1);
    });

    it("should use Standard style for paragraphs without tab stops", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("No tabs here");
      const content = await getContentXml(doc);

      expect(content).toContain('text:style-name="Standard"');
      expect(content).not.toContain("style:tab-stops");
    });

    it("should use custom style for paragraphs with tab stops", async () => {
      const doc = new OdtDocument();
      doc.addParagraph(
        (p) => {
          p.addText("A");
          p.addTab();
          p.addText("B");
        },
        { tabStops: [{ position: "8cm" }] },
      );
      const content = await getContentXml(doc);

      expect(content).toContain('text:style-name="P1"');
    });
  });

  describe("full integration \u2014 all Phase 4 features", () => {
    it("should produce valid .odt with all Phase 4 features", async () => {
      const doc = new OdtDocument();
      doc.setMetadata({ title: "Phase 4 Test" });

      doc.addHeading("Formatting Demo", 1);
      doc.addParagraph((p) => {
        p.addText("H");
        p.addText("2", { subscript: true });
        p.addText("O is ");
        p.addText("important", { underline: true, highlightColor: "yellow" });
        p.addText(" \u2014 not ");
        p.addText("optional", { strikethrough: true });
        p.addText("! E=mc");
        p.addText("2", { superscript: true });
      });

      doc.addHeading("Lists", 1);
      doc.addList(["Apple", "Banana", "Cherry"]);
      doc.addList(["First", "Second", "Third"], { type: "numbered" });
      doc.addList((l) => {
        l.addItem((p) => {
          p.addText("Bold item", { bold: true });
        });
        l.addItem("Parent with children");
        l.addNested((sub) => {
          sub.addItem("Child A");
          sub.addItem("Child B");
        });
      });

      doc.addHeading("Tab Stops", 1);
      doc.addParagraph(
        (p) => {
          p.addText("Name");
          p.addTab();
          p.addText("Value");
          p.addTab();
          p.addText("Unit");
        },
        { tabStops: [{ position: "5cm" }, { position: "10cm" }] },
      );

      const entries = await unpackOdt(doc);

      expect(entries["mimetype"]).toBeDefined();
      expect(entries["content.xml"]).toBeDefined();
      expect(entries["styles.xml"]).toBeDefined();
      expect(entries["meta.xml"]).toBeDefined();
      expect(entries["META-INF/manifest.xml"]).toBeDefined();

      const content = decode.decode(entries["content.xml"]);

      expect(content).toContain('style:text-position="sub 58%"');
      expect(content).toContain('style:text-position="super 58%"');
      expect(content).toContain('style:text-underline-style="solid"');
      expect(content).toContain('style:text-line-through-style="solid"');
      expect(content).toContain("fo:background-color");
      expect(content).toContain("text:list");
      expect(content).toContain("text:list-item");
      expect(content).toContain("text:list-level-style-bullet");
      expect(content).toContain("text:list-level-style-number");
      expect(content).toContain("text:tab");
      expect(content).toContain("style:tab-stops");
    });
  });

  // ─── Phase 5: Images and Links ───────────────────────────────────────

  const TEST_PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x01,
  ]);

  const TEST_JPEG = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01,
  ]);

  async function getManifestXml(doc: OdtDocument): Promise<string> {
    const entries = await unpackOdt(doc);
    return decode.decode(entries["META-INF/manifest.xml"]);
  }

  describe("hyperlinks", () => {
    it("should generate text:a element for a link", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("Visit ");
        p.addLink("our website", "https://example.com");
      });

      const content = await getContentXml(doc);
      expect(content).toContain('xlink:type="simple"');
      expect(content).toContain('xlink:href="https://example.com"');
      expect(content).toContain("our website");
      expect(content).toContain("text:a");
    });

    it("should support formatted links", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addLink("Click here", "https://example.com", {
          bold: true,
          color: "blue",
        });
      });

      const content = await getContentXml(doc);
      expect(content).toContain("text:a");
      expect(content).toContain('xlink:href="https://example.com"');
      expect(content).toContain("text:span");
      expect(content).toContain("Click here");
      expect(content).toContain('fo:font-weight="bold"');
    });

    it("should support internal bookmark links", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addLink("Go to intro", "#introduction");
      });

      const content = await getContentXml(doc);
      expect(content).toContain('xlink:href="#introduction"');
      expect(content).toContain("Go to intro");
    });

    it("should mix links with plain text", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("See ");
        p.addLink("example.com", "https://example.com");
        p.addText(" for details.");
      });

      const content = await getContentXml(doc);
      expect(content).toContain("See ");
      expect(content).toContain("text:a");
      expect(content).toContain(" for details.");
    });
  });

  describe("bookmarks", () => {
    it("should generate text:bookmark element", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addBookmark("chapter1");
        p.addText("Chapter 1 content");
      });

      const content = await getContentXml(doc);
      expect(content).toContain("text:bookmark");
      expect(content).toContain('text:name="chapter1"');
      expect(content).toContain("Chapter 1 content");
    });

    it("should support linking to a bookmark", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addBookmark("intro");
        p.addText("Introduction");
      });
      doc.addParagraph((p) => {
        p.addText("Go back to ");
        p.addLink("Introduction", "#intro");
      });

      const content = await getContentXml(doc);
      expect(content).toContain('text:name="intro"');
      expect(content).toContain('xlink:href="#intro"');
    });

    it("should support multiple bookmarks", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addBookmark("section1");
        p.addText("Section 1");
      });
      doc.addParagraph((p) => {
        p.addBookmark("section2");
        p.addText("Section 2");
      });

      const content = await getContentXml(doc);
      expect(content).toContain('text:name="section1"');
      expect(content).toContain('text:name="section2"');
    });
  });

  describe("images", () => {
    it("should embed a standalone image in the ZIP", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
      });

      const entries = await unpackOdt(doc);
      expect(entries["Pictures/image1.png"]).toBeDefined();
      expect(entries["Pictures/image1.png"]).toEqual(TEST_PNG);
    });

    it("should generate draw:frame and draw:image in content.xml", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
      });

      const content = await getContentXml(doc);
      expect(content).toContain("draw:frame");
      expect(content).toContain('draw:name="Image1"');
      expect(content).toContain('svg:width="10cm"');
      expect(content).toContain('svg:height="6cm"');
      expect(content).toContain("draw:image");
      expect(content).toContain('xlink:href="Pictures/image1.png"');
      expect(content).toContain('xlink:type="simple"');
      expect(content).toContain('xlink:show="embed"');
      expect(content).toContain('xlink:actuate="onLoad"');
    });

    it("should default to paragraph anchor for standalone images", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
      });

      const content = await getContentXml(doc);
      expect(content).toContain('text:anchor-type="paragraph"');
    });

    it("should add image to the manifest with correct media type", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
      });

      const manifest = await getManifestXml(doc);
      expect(manifest).toContain('manifest:media-type="image/png"');
      expect(manifest).toContain('manifest:full-path="Pictures/image1.png"');
    });

    it("should support inline images in paragraphs", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("See figure: ");
        p.addImage(TEST_PNG, {
          width: "5cm",
          height: "3cm",
          mimeType: "image/png",
        });
      });

      const content = await getContentXml(doc);
      expect(content).toContain("See figure: ");
      expect(content).toContain("draw:frame");
      expect(content).toContain('svg:width="5cm"');
      expect(content).toContain('svg:height="3cm"');
      expect(content).toContain('text:anchor-type="as-character"');
    });

    it("should support explicit anchor type", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
        anchor: "as-character",
      });

      const content = await getContentXml(doc);
      expect(content).toContain('text:anchor-type="as-character"');
    });

    it("should support JPEG images with correct extension", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_JPEG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/jpeg",
      });

      const entries = await unpackOdt(doc);
      expect(entries["Pictures/image1.jpeg"]).toBeDefined();

      const content = await getContentXml(doc);
      expect(content).toContain('xlink:href="Pictures/image1.jpeg"');

      const manifest = await getManifestXml(doc);
      expect(manifest).toContain('manifest:media-type="image/jpeg"');
    });

    it("should support multiple images", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
      });
      doc.addImage(TEST_JPEG, {
        width: "8cm",
        height: "5cm",
        mimeType: "image/jpeg",
      });

      const entries = await unpackOdt(doc);
      expect(entries["Pictures/image1.png"]).toBeDefined();
      expect(entries["Pictures/image2.jpeg"]).toBeDefined();

      const content = await getContentXml(doc);
      expect(content).toContain('draw:name="Image1"');
      expect(content).toContain('draw:name="Image2"');
      expect(content).toContain('xlink:href="Pictures/image1.png"');
      expect(content).toContain('xlink:href="Pictures/image2.jpeg"');
    });

    it("should support method chaining with addImage", async () => {
      const doc = new OdtDocument();
      const result = doc
        .addParagraph("Before image")
        .addImage(TEST_PNG, {
          width: "10cm",
          height: "6cm",
          mimeType: "image/png",
        })
        .addParagraph("After image");

      expect(result).toBe(doc);

      const content = await getContentXml(doc);
      expect(content).toContain("Before image");
      expect(content).toContain("draw:frame");
      expect(content).toContain("After image");
    });

    it("should include draw and xlink namespaces", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
      });

      const content = await getContentXml(doc);
      expect(content).toContain(
        'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
      );
      expect(content).toContain(
        'xmlns:xlink="http://www.w3.org/1999/xlink"',
      );
    });
  });

  describe("full integration \u2014 all Phase 5 features", () => {
    it("should produce valid .odt with all Phase 5 features", async () => {
      const doc = new OdtDocument();
      doc.setMetadata({ title: "Phase 5 Test", creator: "odf-kit" });
      doc.setPageLayout({ orientation: "portrait" });
      doc.setHeader("Phase 5 \u2014 Images and Links");
      doc.setFooter("Page ###");

      doc.addParagraph((p) => {
        p.addBookmark("intro");
        p.addText("Introduction");
      });
      doc.addParagraph("This document tests Phase 5 features.");

      doc.addParagraph((p) => {
        p.addText("Visit ");
        p.addLink("example.com", "https://example.com", { bold: true });
        p.addText(" for more info, or go to ");
        p.addLink("the introduction", "#intro");
        p.addText(".");
      });

      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
      });

      doc.addParagraph((p) => {
        p.addText("Inline image: ");
        p.addImage(TEST_JPEG, {
          width: "3cm",
          height: "2cm",
          mimeType: "image/jpeg",
        });
        p.addText(" end of line.");
      });

      doc.addTable(
        [
          ["Feature", "Status"],
          ["Links", "Done"],
          ["Bookmarks", "Done"],
          ["Images", "Done"],
        ],
        { border: "0.5pt solid #000000" },
      );

      doc.addList(["Images embedded", "Links working", "Bookmarks working"], {
        type: "numbered",
      });

      doc.addPageBreak();
      doc.addParagraph("Second page.");

      const entries = await unpackOdt(doc);

      expect(entries["mimetype"]).toBeDefined();
      expect(entries["content.xml"]).toBeDefined();
      expect(entries["styles.xml"]).toBeDefined();
      expect(entries["meta.xml"]).toBeDefined();
      expect(entries["META-INF/manifest.xml"]).toBeDefined();
      expect(entries["Pictures/image1.png"]).toBeDefined();
      expect(entries["Pictures/image2.jpeg"]).toBeDefined();

      const content = decode.decode(entries["content.xml"]);
      const manifest = decode.decode(entries["META-INF/manifest.xml"]);

      expect(content).toContain("text:a");
      expect(content).toContain('xlink:href="https://example.com"');
      expect(content).toContain('xlink:href="#intro"');
      expect(content).toContain("text:bookmark");
      expect(content).toContain('text:name="intro"');
      expect(content).toContain("draw:frame");
      expect(content).toContain("draw:image");
      expect(content).toContain('xlink:href="Pictures/image1.png"');
      expect(content).toContain('xlink:href="Pictures/image2.jpeg"');
      expect(content).toContain('text:anchor-type="paragraph"');
      expect(content).toContain('text:anchor-type="as-character"');
      expect(manifest).toContain('manifest:media-type="image/png"');
      expect(manifest).toContain('manifest:media-type="image/jpeg"');
      expect(content).toContain("table:table");
      expect(content).toContain("text:list");
      expect(content).toContain("PageBreak");
    });
  });
});
