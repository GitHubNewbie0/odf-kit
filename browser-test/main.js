import { OdtDocument } from "../dist/index.js";

const button = document.getElementById("generate");
const status = document.getElementById("status");

button.addEventListener("click", async () => {
  try {
    status.className = "";
    status.style.display = "none";

    const doc = new OdtDocument();
    doc.setMetadata({
      title: "Browser Test",
      creator: "odf-kit browser test",
    });
    doc.addHeading("odf-kit Browser Test", 1);
    doc.addParagraph(
      "This document was generated entirely in the browser using odf-kit.",
    );
    doc.addParagraph((p) => {
      p.addText("It supports ");
      p.addText("bold", { bold: true });
      p.addText(", ");
      p.addText("italic", { italic: true });
      p.addText(", and ");
      p.addText("colored text", { color: "blue" });
      p.addText(".");
    });
    doc.addHeading("Table Test", 2);
    doc.addTable(
      [
        ["Feature", "Status"],
        ["Paragraphs", "Working"],
        ["Headings", "Working"],
        ["Tables", "Working"],
        ["Formatting", "Working"],
        ["Lists", "Working"],
      ],
      { border: "0.5pt solid #000000" },
    );
    doc.addHeading("List Test", 2);
    doc.addList(["Node.js support", "Browser support", "Zero dependencies"]);
    doc.addParagraph((p) => {
      p.addText("Generated at: ");
      p.addText(new Date().toISOString(), { italic: true });
    });

    const bytes = await doc.save();

    // Trigger download
    const blob = new Blob([bytes], {
      type: "application/vnd.oasis.opendocument.text",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "browser-test.odt";
    a.click();
    URL.revokeObjectURL(url);

    status.textContent =
      "Success! File downloaded. Open browser-test.odt in LibreOffice to verify.";
    status.className = "success";
  } catch (err) {
    status.textContent = "Error: " + err.message;
    status.className = "error";
    console.error(err);
  }
});
