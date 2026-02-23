// generate-test.mjs — Run with: node generate-test.mjs
// Produces test-output.odt in the current directory

import { writeFileSync } from "node:fs";
import { OdtDocument } from "./dist/odt/document.js";

const doc = new OdtDocument();

// Metadata
doc.setMetadata({ title: "odf-kit fflate Migration Test", creator: "odf-kit 0.2.0" });

// Page layout
doc.setPageLayout({ orientation: "portrait", marginTop: "2.5cm", marginBottom: "2.5cm" });
doc.setHeader((h) => {
  h.addText("odf-kit", { bold: true });
  h.addText(" — fflate Migration Test — Page ");
  h.addPageNumber();
});
doc.setFooter("Confidential — Page ###");

// Title
doc.addHeading("odf-kit Feature Verification", 1);
doc.addParagraph("This document exercises every feature to verify the fflate migration produces valid output.");

// Text formatting
doc.addHeading("Text Formatting", 2);
doc.addParagraph((p) => {
  p.addText("Bold", { bold: true });
  p.addText(", ");
  p.addText("italic", { italic: true });
  p.addText(", ");
  p.addText("bold italic", { bold: true, italic: true });
  p.addText(", ");
  p.addText("underline", { underline: true });
  p.addText(", ");
  p.addText("strikethrough", { strikethrough: true });
  p.addText(", ");
  p.addText("superscript", { superscript: true });
  p.addText(", ");
  p.addText("subscript", { subscript: true });
  p.addText(".");
});
doc.addParagraph((p) => {
  p.addText("Red text", { color: "red" });
  p.addText(", ");
  p.addText("blue 18pt Arial", { color: "blue", fontSize: 18, fontFamily: "Arial" });
  p.addText(", ");
  p.addText("highlighted yellow", { highlightColor: "yellow" });
  p.addText(".");
});
doc.addParagraph((p) => {
  p.addText("Chemical formula: H");
  p.addText("2", { subscript: true });
  p.addText("O. Einstein: E=mc");
  p.addText("2", { superscript: true });
  p.addText(".");
});

// Tables
doc.addHeading("Tables", 2);
doc.addParagraph("Simple table:");
doc.addTable([
  ["Name", "Age", "City"],
  ["Alice", "30", "Portland"],
  ["Bob", "25", "Seattle"],
  ["Carol", "35", "Denver"],
], { columnWidths: ["5cm", "2cm", "4cm"], border: "0.5pt solid #000000" });

doc.addParagraph("Formatted table with merged cells:");
doc.addTable((t) => {
  t.addRow((r) => {
    r.addCell("Report Summary", { bold: true, colSpan: 3, backgroundColor: "#336699", color: "white", fontSize: 14 });
  });
  t.addRow((r) => {
    r.addCell("Category", { bold: true, backgroundColor: "#DDDDDD" });
    r.addCell("Q1", { bold: true, backgroundColor: "#DDDDDD" });
    r.addCell("Q2", { bold: true, backgroundColor: "#DDDDDD" });
  });
  t.addRow((r) => {
    r.addCell("Revenue");
    r.addCell((c) => {
      c.addText("$1,250", { color: "green", bold: true });
    });
    r.addCell((c) => {
      c.addText("$1,480", { color: "green", bold: true });
    });
  });
  t.addRow((r) => {
    r.addCell("Expenses");
    r.addCell("$800");
    r.addCell("$920");
  });
}, { columnWidths: ["5cm", "3cm", "3cm"], border: "0.5pt solid #999999" });

// Lists
doc.addHeading("Lists", 2);
doc.addParagraph("Bullet list:");
doc.addList(["First item", "Second item", "Third item"]);

doc.addParagraph("Numbered list:");
doc.addList(["Step one", "Step two", "Step three"], { type: "numbered" });

doc.addParagraph("Nested list with formatting:");
doc.addList((l) => {
  l.addItem((p) => {
    p.addText("Bold parent", { bold: true });
  });
  l.addNested((sub) => {
    sub.addItem("Child A");
    sub.addItem("Child B");
    sub.addNested((subsub) => {
      subsub.addItem("Grandchild");
    });
  });
  l.addItem("Back to top level");
});

// Tab stops
doc.addHeading("Tab Stops", 2);
doc.addParagraph((p) => {
  p.addText("Item");
  p.addTab();
  p.addText("Qty");
  p.addTab();
  p.addText("$100.00");
}, { tabStops: [{ position: "6cm" }, { position: "12cm", type: "right" }] });
doc.addParagraph((p) => {
  p.addText("Widget");
  p.addTab();
  p.addText("50");
  p.addTab();
  p.addText("$2,500.00");
}, { tabStops: [{ position: "6cm" }, { position: "12cm", type: "right" }] });

// Links and bookmarks
doc.addHeading("Links and Bookmarks", 2);
doc.addParagraph((p) => {
  p.addBookmark("links-section");
  p.addText("Visit ");
  p.addLink("example.com", "https://example.com", { bold: true, color: "blue" });
  p.addText(" for more information.");
});

// Page break
doc.addPageBreak();

// Second page
doc.addHeading("Second Page", 1);
doc.addParagraph((p) => {
  p.addText("This content is on page 2 after a page break. ");
  p.addText("Jump back to ");
  p.addLink("Links and Bookmarks", "#links-section");
  p.addText(".");
});

doc.addParagraph("If you can read this document correctly in LibreOffice with all formatting intact, the fflate migration is verified.");

// Save
const bytes = await doc.save();
writeFileSync("test-output.odt", bytes);
console.log("Written: test-output.odt (%d bytes)", bytes.length);
