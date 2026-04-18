import { unzipSync } from "fflate";
import { OdtDocument } from "../src/odt/document.js";

const decode = new TextDecoder();

/** Helper: generate an .odt, unzip it, and return the entries. */
async function unpackOdt(doc: OdtDocument): Promise<Record<string, Uint8Array>> {
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
      expect(decode.decode(entries["mimetype"])).toBe("application/vnd.oasis.opendocument.text");
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
          r.addCell("Header", { backgroundColor: "silver" });
        });
      });
      const content = await getContentXml(doc);
      expect(content).toContain('fo:background-color="#c0c0c0"');
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
      const result = doc.setPageLayout({ orientation: "landscape" }).addParagraph("Test");
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
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]);

  const TEST_JPEG = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
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
      expect(content).toContain('xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"');
      expect(content).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    });
  });

  // ─── Graphic Styles (wrapMode, margins, border, opacity) ──────────────

  describe("image graphic styles", () => {
    it("should emit a graphic style with style:wrap when wrapMode is set", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
        wrapMode: "left",
      });

      const content = await getContentXml(doc);
      expect(content).toContain('style:family="graphic"');
      expect(content).toContain('style:parent-style-name="Graphics"');
      expect(content).toContain('style:wrap="left"');
      expect(content).toContain('draw:style-name="Gr1"');
    });

    it("should support wrapMode right", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
        wrapMode: "right",
      });

      const content = await getContentXml(doc);
      expect(content).toContain('style:wrap="right"');
    });

    it("should support wrapMode none", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
        wrapMode: "none",
      });

      const content = await getContentXml(doc);
      expect(content).toContain('style:wrap="none"');
    });

    it("should not emit draw:style-name when no graphic properties are set", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
      });

      const content = await getContentXml(doc);
      expect(content).not.toContain("draw:style-name");
      expect(content).not.toContain('style:family="graphic"');
    });

    it("should emit margin properties on graphic style", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
        wrapMode: "left",
        marginRight: "0.3cm",
        marginBottom: "0.2cm",
      });

      const content = await getContentXml(doc);
      expect(content).toContain('fo:margin-right="0.3cm"');
      expect(content).toContain('fo:margin-bottom="0.2cm"');
    });

    it("should expand uniform margin to all four sides", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
        margin: "0.5cm",
      });

      const content = await getContentXml(doc);
      expect(content).toContain('fo:margin-top="0.5cm"');
      expect(content).toContain('fo:margin-bottom="0.5cm"');
      expect(content).toContain('fo:margin-left="0.5cm"');
      expect(content).toContain('fo:margin-right="0.5cm"');
    });

    it("should allow side-specific margin to override uniform margin", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
        margin: "0.5cm",
        marginRight: "0.8cm",
      });

      const content = await getContentXml(doc);
      expect(content).toContain('fo:margin-top="0.5cm"');
      expect(content).toContain('fo:margin-right="0.8cm"');
    });

    it("should emit border on graphic style", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
        border: "1pt solid #000000",
      });

      const content = await getContentXml(doc);
      expect(content).toContain('fo:border="1pt solid #000000"');
    });

    it("should emit opacity on graphic style", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
        opacity: 50,
      });

      const content = await getContentXml(doc);
      expect(content).toContain('draw:opacity="50%"');
    });

    it("should reuse the same graphic style for identical properties", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
        wrapMode: "left",
      });
      doc.addImage(TEST_JPEG, {
        width: "8cm",
        height: "5cm",
        mimeType: "image/jpeg",
        wrapMode: "left",
      });

      const content = await getContentXml(doc);
      // Only one graphic style should be emitted
      const gr1Count = (content.match(/style:name="Gr1"/g) ?? []).length;
      expect(gr1Count).toBe(1);
      expect(content).not.toContain('style:name="Gr2"');
      // Both frames reference the same style
      const drawStyleCount = (content.match(/draw:style-name="Gr1"/g) ?? []).length;
      expect(drawStyleCount).toBe(2);
    });

    it("should emit separate graphic styles for different wrapModes", async () => {
      const doc = new OdtDocument();
      doc.addImage(TEST_PNG, {
        width: "10cm",
        height: "6cm",
        mimeType: "image/png",
        wrapMode: "left",
      });
      doc.addImage(TEST_JPEG, {
        width: "8cm",
        height: "5cm",
        mimeType: "image/jpeg",
        wrapMode: "right",
      });

      const content = await getContentXml(doc);
      expect(content).toContain('style:name="Gr1"');
      expect(content).toContain('style:name="Gr2"');
      expect(content).toContain('style:wrap="left"');
      expect(content).toContain('style:wrap="right"');
    });

    it("should apply graphic style to inline paragraph image", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addImage(TEST_PNG, {
          width: "5cm",
          height: "3cm",
          mimeType: "image/png",
          wrapMode: "left",
          marginRight: "0.3cm",
        });
      });

      const content = await getContentXml(doc);
      expect(content).toContain('style:wrap="left"');
      expect(content).toContain('fo:margin-right="0.3cm"');
      expect(content).toContain('draw:style-name="Gr1"');
    });
  });

  // ─── Repair Plan: Generation Side Fixes ─────────────────────────────

  describe("Asian/Complex script tripling", () => {
    it("should emit Asian and Complex font-weight variants for bold text", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("bold", { bold: true });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-weight="bold"');
      expect(content).toContain('style:font-weight-asian="bold"');
      expect(content).toContain('style:font-weight-complex="bold"');
    });

    it("should emit Asian and Complex font-style variants for italic text", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("italic", { italic: true });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-style="italic"');
      expect(content).toContain('style:font-style-asian="italic"');
      expect(content).toContain('style:font-style-complex="italic"');
    });

    it("should emit Asian and Complex font-size variants", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("big", { fontSize: 18 });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-size="18pt"');
      expect(content).toContain('style:font-size-asian="18pt"');
      expect(content).toContain('style:font-size-complex="18pt"');
    });

    it("should emit Asian and Complex font-name variants for fontFamily", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("fancy", { fontFamily: "Arial" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('style:font-name="Arial"');
      expect(content).toContain('style:font-name-asian="Arial"');
      expect(content).toContain('style:font-name-complex="Arial"');
    });

    it("should triple all four properties together", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("all", { bold: true, italic: true, fontSize: 14, fontFamily: "Arial" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('style:font-weight-asian="bold"');
      expect(content).toContain('style:font-weight-complex="bold"');
      expect(content).toContain('style:font-style-asian="italic"');
      expect(content).toContain('style:font-style-complex="italic"');
      expect(content).toContain('style:font-size-asian="14pt"');
      expect(content).toContain('style:font-size-complex="14pt"');
      expect(content).toContain('style:font-name-asian="Arial"');
      expect(content).toContain('style:font-name-complex="Arial"');
    });
  });

  describe("font-face declarations", () => {
    it("should emit office:font-face-decls when fontFamily is used", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("fancy", { fontFamily: "Arial" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain("office:font-face-decls");
      expect(content).toContain('style:name="Arial"');
      expect(content).toContain("style:font-face");
    });

    it("should quote multi-word font family names in svg:font-family", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("text", { fontFamily: "Times New Roman" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain("svg:font-family=\"'Times New Roman'\"");
    });

    it("should not emit office:font-face-decls when no fontFamily is used", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("plain", { bold: true });
      });
      const content = await getContentXml(doc);

      expect(content).not.toContain("office:font-face-decls");
    });

    it("should deduplicate font-face entries for the same family", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("first", { fontFamily: "Arial" });
        p.addText("second", { fontFamily: "Arial", bold: true });
      });
      const content = await getContentXml(doc);

      const matches = content.match(/style:name="Arial"/g);
      expect(matches).toHaveLength(1);
    });

    it("should emit separate font-face entries for different families", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("sans", { fontFamily: "Arial" });
        p.addText("serif", { fontFamily: "Georgia" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('style:name="Arial"');
      expect(content).toContain('style:name="Georgia"');
    });

    it("should place font-face-decls before automatic-styles in document order", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("text", { fontFamily: "Arial" });
      });
      const content = await getContentXml(doc);

      const fontFacePos = content.indexOf("office:font-face-decls");
      const autoStylesPos = content.indexOf("office:automatic-styles");
      expect(fontFacePos).toBeLessThan(autoStylesPos);
    });
  });

  describe("numeric font weight", () => {
    it("should support fontWeight: 300 (light)", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("light", { fontWeight: 300 });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-weight="300"');
      expect(content).toContain('style:font-weight-asian="300"');
      expect(content).toContain('style:font-weight-complex="300"');
    });

    it("should support fontWeight: 600 (semi-bold)", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("semibold", { fontWeight: 600 });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-weight="600"');
      expect(content).toContain('style:font-weight-asian="600"');
      expect(content).toContain('style:font-weight-complex="600"');
    });

    it("should deduplicate numeric font weight styles correctly", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("first", { fontWeight: 300 });
        p.addText("second", { fontWeight: 300 });
      });
      const content = await getContentXml(doc);

      const styleDefs = content.match(/style:name="T1"/g);
      expect(styleDefs).toHaveLength(1);
      const styleRefs = content.match(/text:style-name="T1"/g);
      expect(styleRefs).toHaveLength(2);
    });
  });

  describe("text transform and small caps", () => {
    it("should emit fo:text-transform for textTransform: uppercase", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("heading text", { textTransform: "uppercase" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:text-transform="uppercase"');
    });

    it("should emit fo:text-transform for textTransform: lowercase", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("LOUD TEXT", { textTransform: "lowercase" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:text-transform="lowercase"');
    });

    it("should emit fo:text-transform for textTransform: capitalize", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("title text", { textTransform: "capitalize" });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:text-transform="capitalize"');
    });

    it("should emit fo:font-variant for smallCaps: true", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("small caps", { smallCaps: true });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:font-variant="small-caps"');
    });

    it("should deduplicate textTransform styles", async () => {
      const doc = new OdtDocument();
      doc.addParagraph((p) => {
        p.addText("first", { textTransform: "uppercase" });
        p.addText("second", { textTransform: "uppercase" });
      });
      const content = await getContentXml(doc);

      const defs = content.match(/style:name="T1"/g);
      expect(defs).toHaveLength(1);
    });
  });

  describe("named styles in styles.xml", () => {
    it("should define the Standard paragraph style", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("test");
      const styles = await getStylesXml(doc);

      expect(styles).toContain('style:name="Standard"');
      expect(styles).toContain('style:family="paragraph"');
    });

    it("should define all six Heading styles", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("test");
      const styles = await getStylesXml(doc);

      for (let level = 1; level <= 6; level++) {
        expect(styles).toContain(`style:name="Heading_20_${level}"`);
      }
    });

    it("should define the Heading parent style", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("test");
      const styles = await getStylesXml(doc);

      expect(styles).toContain('style:name="Heading"');
    });

    it("should define List_20_Bullet and List_20_Number styles", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("test");
      const styles = await getStylesXml(doc);

      expect(styles).toContain('style:name="List_20_Bullet"');
      expect(styles).toContain('style:name="List_20_Number"');
    });

    it("should define Header and Footer styles", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("test");
      const styles = await getStylesXml(doc);

      expect(styles).toContain('style:name="Header"');
      expect(styles).toContain('style:name="Footer"');
    });

    it("should apply Asian/Complex tripling to Heading font-weight", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("test");
      const styles = await getStylesXml(doc);

      expect(styles).toContain('style:font-weight-asian="bold"');
      expect(styles).toContain('style:font-weight-complex="bold"');
    });

    it("should apply Asian/Complex tripling to Heading font sizes", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("test");
      const styles = await getStylesXml(doc);

      expect(styles).toContain('style:font-size-asian="28pt"');
      expect(styles).toContain('style:font-size-complex="28pt"');
    });

    it("should set keep-with-next on the Heading parent style", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("test");
      const styles = await getStylesXml(doc);

      expect(styles).toContain('fo:keep-with-next="always"');
    });

    it("should set style:default-outline-level on heading styles", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("test");
      const styles = await getStylesXml(doc);

      expect(styles).toContain('style:default-outline-level="1"');
      expect(styles).toContain('style:default-outline-level="2"');
    });

    it("should include Liberation Serif in styles.xml font-face-decls", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("test");
      const styles = await getStylesXml(doc);

      expect(styles).toContain("office:font-face-decls");
      expect(styles).toContain('style:name="Liberation Serif"');
    });
  });

  describe("paragraph alignment", () => {
    it("should emit fo:text-align for align: center", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("centered", { align: "center" });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:text-align="center"');
    });

    it("should emit fo:text-align for align: right", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("right", { align: "right" });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:text-align="right"');
    });

    it("should emit fo:text-align for align: justify", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("justified text here", { align: "justify" });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:text-align="justify"');
    });

    it("should use Standard style when no paragraph options are set", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("plain text");
      const content = await getContentXml(doc);

      expect(content).toContain('text:style-name="Standard"');
      expect(content).not.toContain('text:style-name="P1"');
    });

    it("should use a custom paragraph style when align is set", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("centered", { align: "center" });
      const content = await getContentXml(doc);

      expect(content).toContain('text:style-name="P1"');
    });

    it("should deduplicate paragraph styles with the same alignment", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("first centered", { align: "center" });
      doc.addParagraph("second centered", { align: "center" });
      const content = await getContentXml(doc);

      const defs = content.match(/style:name="P1"/g);
      expect(defs).toHaveLength(1);
      const refs = content.match(/text:style-name="P1"/g);
      expect(refs).toHaveLength(2);
    });

    it("should create separate styles for different alignments", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("centered", { align: "center" });
      doc.addParagraph("right", { align: "right" });
      const content = await getContentXml(doc);

      expect(content).toContain('style:name="P1"');
      expect(content).toContain('style:name="P2"');
    });
  });

  describe("paragraph spacing", () => {
    it("should emit fo:margin-top for spaceBefore", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("spaced", { spaceBefore: "0.4cm" });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:margin-top="0.4cm"');
    });

    it("should emit fo:margin-bottom for spaceAfter", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("spaced", { spaceAfter: "0.2cm" });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:margin-bottom="0.2cm"');
    });

    it("should support spaceBefore and spaceAfter together", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("spaced", { spaceBefore: "0.4cm", spaceAfter: "0.2cm" });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:margin-top="0.4cm"');
      expect(content).toContain('fo:margin-bottom="0.2cm"');
    });

    it("should support spacing in pt units", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("spaced", { spaceBefore: "6pt" });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:margin-top="6pt"');
    });
  });

  describe("line height", () => {
    it("should convert lineHeight number 1.5 to 150%", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("text", { lineHeight: 1.5 });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:line-height="150%"');
    });

    it("should convert lineHeight number 2 to 200%", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("text", { lineHeight: 2 });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:line-height="200%"');
    });

    it("should pass through lineHeight string with units", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("text", { lineHeight: "18pt" });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:line-height="18pt"');
    });

    it("should convert lineHeight 1 to 100%", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("text", { lineHeight: 1 });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:line-height="100%"');
    });
  });

  describe("paragraph indentation", () => {
    it("should emit fo:margin-left for indentLeft", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("indented", { indentLeft: "1cm" });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:margin-left="1cm"');
    });

    it("should emit fo:text-indent for indentFirst", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("indented first line", { indentFirst: "0.5cm" });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:text-indent="0.5cm"');
    });

    it("should support hanging indent with negative indentFirst", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("hanging", { indentLeft: "1cm", indentFirst: "-1cm" });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:margin-left="1cm"');
      expect(content).toContain('fo:text-indent="-1cm"');
    });
  });

  describe("heading with paragraph options", () => {
    it("should apply align to a heading via custom paragraph style", async () => {
      const doc = new OdtDocument();
      doc.addHeading("Centered Heading", 1, { align: "center" });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:text-align="center"');
    });

    it("should use a custom style that inherits from Heading_20_N", async () => {
      const doc = new OdtDocument();
      doc.addHeading("Heading with options", 2, { align: "center" });
      const content = await getContentXml(doc);

      expect(content).toContain('style:parent-style-name="Heading_20_2"');
    });

    it("should use Heading_20_N directly when no options are provided", async () => {
      const doc = new OdtDocument();
      doc.addHeading("Plain heading", 1);
      const content = await getContentXml(doc);

      expect(content).toContain('text:style-name="Heading_20_1"');
    });

    it("should give heading options and paragraph options different parent styles", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("centered para", { align: "center" });
      doc.addHeading("centered heading", 1, { align: "center" });
      const content = await getContentXml(doc);

      expect(content).toContain('style:parent-style-name="Standard"');
      expect(content).toContain('style:parent-style-name="Heading_20_1"');
    });

    it("should support method chaining with three-argument addHeading", () => {
      const doc = new OdtDocument();
      const result = doc.addHeading("Title", 1, { align: "center" }).addParagraph("Body");
      expect(result).toBe(doc);
    });
  });

  describe("cell vertical alignment and padding", () => {
    it("should emit style:vertical-align for verticalAlign: middle", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("centered", { verticalAlign: "middle" });
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('style:vertical-align="middle"');
    });

    it("should emit style:vertical-align for verticalAlign: top", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("top", { verticalAlign: "top" });
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('style:vertical-align="top"');
    });

    it("should emit style:vertical-align for verticalAlign: bottom", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("bottom", { verticalAlign: "bottom" });
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('style:vertical-align="bottom"');
    });

    it("should emit fo:padding for padding", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("padded", { padding: "0.1cm" });
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:padding="0.1cm"');
    });

    it("should support padding in pt units", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("padded", { padding: "2pt" });
        });
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:padding="2pt"');
    });

    it("should deduplicate cell styles with same verticalAlign and padding", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("A", { verticalAlign: "middle", padding: "0.1cm" });
          r.addCell("B", { verticalAlign: "middle", padding: "0.1cm" });
        });
      });
      const content = await getContentXml(doc);

      const defs = content.match(/style:name="C1"/g);
      expect(defs).toHaveLength(1);
      const refs = content.match(/table:style-name="C1"/g);
      expect(refs).toHaveLength(2);
    });
  });

  describe("row background color", () => {
    it("should emit fo:background-color on a row style", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow(
          (r) => {
            r.addCell("A");
            r.addCell("B");
          },
          { backgroundColor: "#EEEEEE" },
        );
      });
      const content = await getContentXml(doc);

      expect(content).toContain('style:family="table-row"');
      expect(content).toContain('fo:background-color="#EEEEEE"');
    });

    it("should apply row style name to table:table-row element", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow(
          (r) => {
            r.addCell("Header");
          },
          { backgroundColor: "#DDDDDD" },
        );
      });
      const content = await getContentXml(doc);

      expect(content).toContain('table:style-name="R1"');
    });

    it("should resolve named colors for row background (silver \u2192 #c0c0c0)", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow(
          (r) => {
            r.addCell("A");
          },
          { backgroundColor: "silver" },
        );
      });
      const content = await getContentXml(doc);

      expect(content).toContain('fo:background-color="#c0c0c0"');
    });

    it("should not apply row style when no row options are set", async () => {
      const doc = new OdtDocument();
      doc.addTable([["A", "B"]]);
      const content = await getContentXml(doc);

      expect(content).not.toContain('style:family="table-row"');
    });

    it("should deduplicate identical row styles", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow(
          (r) => {
            r.addCell("A");
          },
          { backgroundColor: "#EEEEEE" },
        );
        t.addRow(
          (r) => {
            r.addCell("B");
          },
          { backgroundColor: "#EEEEEE" },
        );
      });
      const content = await getContentXml(doc);

      const defs = content.match(/style:name="R1"/g);
      expect(defs).toHaveLength(1);
      const refs = content.match(/table:style-name="R1"/g);
      expect(refs).toHaveLength(2);
    });
  });

  describe("table cell value-type", () => {
    it("should not emit office:value-type on table cells", async () => {
      const doc = new OdtDocument();
      doc.addTable([
        ["Name", "Age"],
        ["Alice", "30"],
      ]);
      const content = await getContentXml(doc);

      expect(content).not.toContain("office:value-type");
    });

    it("should not emit office:value-type on cells with options", async () => {
      const doc = new OdtDocument();
      doc.addTable((t) => {
        t.addRow((r) => {
          r.addCell("Header", { bold: true, backgroundColor: "#DDDDDD" });
        });
      });
      const content = await getContentXml(doc);

      expect(content).not.toContain("office:value-type");
    });
  });

  describe("numbered list format types", () => {
    it("should support numFormat: i (lowercase roman)", async () => {
      const doc = new OdtDocument();
      doc.addList(["First", "Second"], { type: "numbered", numFormat: "i" });
      const content = await getContentXml(doc);

      expect(content).toContain('style:num-format="i"');
    });

    it("should support numFormat: I (uppercase roman)", async () => {
      const doc = new OdtDocument();
      doc.addList(["First", "Second"], { type: "numbered", numFormat: "I" });
      const content = await getContentXml(doc);

      expect(content).toContain('style:num-format="I"');
    });

    it("should support numFormat: a (lowercase alpha)", async () => {
      const doc = new OdtDocument();
      doc.addList(["First", "Second"], { type: "numbered", numFormat: "a" });
      const content = await getContentXml(doc);

      expect(content).toContain('style:num-format="a"');
    });

    it("should support numFormat: A (uppercase alpha)", async () => {
      const doc = new OdtDocument();
      doc.addList(["First", "Second"], { type: "numbered", numFormat: "A" });
      const content = await getContentXml(doc);

      expect(content).toContain('style:num-format="A"');
    });

    it("should default to Arabic numerals when no numFormat is specified", async () => {
      const doc = new OdtDocument();
      doc.addList(["Item"], { type: "numbered" });
      const content = await getContentXml(doc);

      expect(content).toContain('style:num-format="1"');
    });
  });

  describe("list numbering customization", () => {
    it("should support numPrefix and numSuffix to produce (1), (2)", async () => {
      const doc = new OdtDocument();
      doc.addList(["A", "B"], { type: "numbered", numPrefix: "(", numSuffix: ")" });
      const content = await getContentXml(doc);

      expect(content).toContain('style:num-prefix="("');
      expect(content).toContain('style:num-suffix=")"');
    });

    it("should support custom numSuffix alone", async () => {
      const doc = new OdtDocument();
      doc.addList(["A", "B"], { type: "numbered", numSuffix: ")" });
      const content = await getContentXml(doc);

      expect(content).toContain('style:num-suffix=")"');
    });

    it("should default numSuffix to period", async () => {
      const doc = new OdtDocument();
      doc.addList(["A", "B"], { type: "numbered" });
      const content = await getContentXml(doc);

      expect(content).toContain('style:num-suffix="."');
    });

    it("should emit text:start-value on the first list item when startValue is set", async () => {
      const doc = new OdtDocument();
      doc.addList(["Item 5", "Item 6"], { type: "numbered", startValue: 5 });
      const content = await getContentXml(doc);

      expect(content).toContain('text:start-value="5"');
    });

    it("should only emit text:start-value on the first item", async () => {
      const doc = new OdtDocument();
      doc.addList(["A", "B", "C"], { type: "numbered", startValue: 3 });
      const content = await getContentXml(doc);

      const matches = content.match(/text:start-value/g);
      expect(matches).toHaveLength(1);
    });

    it("should not emit text:start-value for bullet lists", async () => {
      const doc = new OdtDocument();
      // startValue is ignored for bullet lists; cast needed since type system blocks it
      doc.addList(["A", "B"], { type: "bullet" });
      const content = await getContentXml(doc);

      expect(content).not.toContain("text:start-value");
    });
  });

  describe("full integration \u2014 all repair plan features", () => {
    it("should produce a valid .odt combining all new generation features", async () => {
      const doc = new OdtDocument();
      doc.setMetadata({ title: "Repair Plan Integration Test" });

      doc.addHeading("Centered Chapter", 1, { align: "center", spaceBefore: "0.5cm" });
      doc.addParagraph("Justified body text with double spacing.", {
        align: "justify",
        lineHeight: 2,
        indentLeft: "1cm",
        indentFirst: "-1cm",
      });
      doc.addParagraph((p) => {
        p.addText("Semi-bold", { fontWeight: 600 });
        p.addText(" and ", { textTransform: "uppercase" });
        p.addText("small caps text", { smallCaps: true });
        p.addText(" in a custom font", { fontFamily: "Arial" });
      });

      doc.addTable(
        (t) => {
          t.addRow(
            (r) => {
              r.addCell("Header", {
                bold: true,
                backgroundColor: "#DDDDDD",
                verticalAlign: "middle",
                padding: "0.1cm",
              });
              r.addCell("Value", {
                bold: true,
                backgroundColor: "#DDDDDD",
                verticalAlign: "middle",
                padding: "0.1cm",
              });
            },
            { backgroundColor: "#DDDDDD" },
          );
          t.addRow((r) => {
            r.addCell("Data");
            r.addCell("42");
          });
        },
        { border: "0.5pt solid #000000" },
      );

      doc.addList(["Item A", "Item B"], {
        type: "numbered",
        numFormat: "i",
        numPrefix: "(",
        numSuffix: ")",
        startValue: 3,
      });

      const entries = await unpackOdt(doc);
      expect(entries["content.xml"]).toBeDefined();
      expect(entries["styles.xml"]).toBeDefined();

      const content = decode.decode(entries["content.xml"]);
      const styles = decode.decode(entries["styles.xml"]);

      // Asian/Complex tripling
      expect(content).toContain('style:font-weight-asian="600"');
      // Font face declarations
      expect(content).toContain("office:font-face-decls");
      expect(content).toContain('style:name="Arial"');
      // Paragraph options
      expect(content).toContain('fo:text-align="center"');
      expect(content).toContain('fo:text-align="justify"');
      expect(content).toContain('fo:line-height="200%"');
      expect(content).toContain('fo:margin-left="1cm"');
      // Heading inherits from Heading_20_1
      expect(content).toContain('style:parent-style-name="Heading_20_1"');
      // Cell features
      expect(content).toContain('style:vertical-align="middle"');
      expect(content).toContain('fo:padding="0.1cm"');
      // Row style
      expect(content).toContain('style:family="table-row"');
      // No value-type spec violation
      expect(content).not.toContain("office:value-type");
      // List features
      expect(content).toContain('style:num-format="i"');
      expect(content).toContain('text:start-value="3"');
      // Named styles in styles.xml
      expect(styles).toContain('style:name="Standard"');
      expect(styles).toContain('style:name="Heading_20_1"');
      expect(styles).toContain('style:name="List_20_Bullet"');
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
  describe("settings.xml", () => {
    it("should include settings.xml in the package", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("Hello");
      const entries = await unpackOdt(doc);
      expect(entries["settings.xml"]).toBeDefined();
    });

    it("should include xmlns:ooo namespace in settings.xml", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("Hello");
      const entries = await unpackOdt(doc);
      const settings = decode.decode(entries["settings.xml"]);
      expect(settings).toContain("http://openoffice.org/2004/office");
    });

    it("should include view settings with correct ViewId and ZoomFactor", async () => {
      const doc = new OdtDocument();
      doc.addParagraph("Hello");
      const entries = await unpackOdt(doc);
      const settings = decode.decode(entries["settings.xml"]);
      expect(settings).toContain("view2");
      expect(settings).toContain("ZoomFactor");
      expect(settings).toContain("100");
    });
  });
});
