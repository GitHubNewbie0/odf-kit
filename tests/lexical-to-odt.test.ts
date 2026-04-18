import { describe, it, expect } from "@jest/globals";
import { strFromU8, unzipSync } from "fflate";
import { lexicalToOdt } from "../src/lexical/index.js";
import type { LexicalSerializedEditorState, LexicalSerializedNode } from "../src/lexical/index.js";

async function getContentXml(bytes: Uint8Array): Promise<string> {
  const unzipped = unzipSync(bytes);
  return strFromU8(unzipped["content.xml"]);
}

async function getStylesXml(bytes: Uint8Array): Promise<string> {
  const unzipped = unzipSync(bytes);
  return strFromU8(unzipped["styles.xml"]);
}

// ─── Editor state helpers ─────────────────────────────────────────────────────

function editorState(...children: LexicalSerializedNode[]): LexicalSerializedEditorState {
  return {
    root: {
      type: "root",
      version: 1,
      direction: "ltr",
      format: "",
      indent: 0,
      children,
    },
  };
}

function paragraph(children: LexicalSerializedNode[], format: string = ""): LexicalSerializedNode {
  return { type: "paragraph", version: 1, format, indent: 0, direction: "ltr", children };
}

function heading(
  tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
  children: LexicalSerializedNode[],
): LexicalSerializedNode {
  return { type: "heading", version: 1, tag, format: "", indent: 0, direction: "ltr", children };
}

function quote(children: LexicalSerializedNode[]): LexicalSerializedNode {
  return { type: "quote", version: 1, direction: "ltr", children };
}

function code(children: LexicalSerializedNode[]): LexicalSerializedNode {
  return { type: "code", version: 1, direction: "ltr", language: null, children };
}

function list(
  listType: "bullet" | "number",
  items: LexicalSerializedNode[],
  start: number = 1,
): LexicalSerializedNode {
  return { type: "list", version: 1, listType, start, direction: "ltr", children: items };
}

function listItem(children: LexicalSerializedNode[], value: number = 1): LexicalSerializedNode {
  return { type: "listitem", version: 1, value, indent: 0, direction: "ltr", children };
}

function table(rows: LexicalSerializedNode[]): LexicalSerializedNode {
  return { type: "table", version: 1, children: rows };
}

function tableRow(cells: LexicalSerializedNode[]): LexicalSerializedNode {
  return { type: "tablerow", version: 1, children: cells };
}

function tableCell(
  children: LexicalSerializedNode[],
  colSpan?: number,
  rowSpan?: number,
): LexicalSerializedNode {
  return { type: "tablecell", version: 1, colSpan, rowSpan, children };
}

function text(content: string, format: number = 0, style: string = ""): LexicalSerializedNode {
  return { type: "text", version: 1, text: content, format, style, mode: "normal", detail: 0 };
}

function link(url: string, children: LexicalSerializedNode[]): LexicalSerializedNode {
  return {
    type: "link",
    version: 1,
    url,
    direction: "ltr",
    format: "",
    indent: 0,
    children,
  };
}

function linebreak(): LexicalSerializedNode {
  return { type: "linebreak", version: 1 };
}

function horizontalRule(): LexicalSerializedNode {
  return { type: "horizontalrule", version: 1 };
}

// Text format bitmask constants (matches src/lexical/types.ts)
const BOLD = 1;
const ITALIC = 2;
const STRIKETHROUGH = 4;
const UNDERLINE = 8;
const CODE = 16;
const SUBSCRIPT = 32;
const SUPERSCRIPT = 64;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("lexicalToOdt", () => {
  // ── Basic ─────────────────────────────────────────────────────────────────

  it("should return a valid Uint8Array", async () => {
    const bytes = await lexicalToOdt(editorState(paragraph([text("Hello")])));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("should produce a valid ZIP file with content.xml and mimetype", async () => {
    const bytes = await lexicalToOdt(editorState(paragraph([text("Hello")])));
    const unzipped = unzipSync(bytes);
    expect(unzipped["mimetype"]).toBeDefined();
    expect(unzipped["content.xml"]).toBeDefined();
  });

  it("should handle an empty document without crashing", async () => {
    const bytes = await lexicalToOdt(editorState());
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  // ── Paragraph ─────────────────────────────────────────────────────────────

  it("should convert a plain paragraph", async () => {
    const bytes = await lexicalToOdt(editorState(paragraph([text("Hello, world.")])));
    const content = await getContentXml(bytes);
    expect(content).toContain("Hello, world.");
  });

  it("should handle an empty paragraph", async () => {
    const bytes = await lexicalToOdt(editorState(paragraph([])));
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it("should apply center alignment", async () => {
    const bytes = await lexicalToOdt(editorState(paragraph([text("Centered")], "center")));
    const content = await getContentXml(bytes);
    expect(content).toContain("Centered");
    expect(content).toContain("fo:text-align");
  });

  // ── Headings ──────────────────────────────────────────────────────────────

  it("should convert heading h1", async () => {
    const bytes = await lexicalToOdt(editorState(heading("h1", [text("My Title")])));
    const content = await getContentXml(bytes);
    expect(content).toContain("My Title");
    expect(content).toContain("Heading_20_1");
  });

  it("should convert headings h1 through h6", async () => {
    const nodes = (["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((tag) =>
      heading(tag, [text(`Heading ${tag}`)]),
    );
    const bytes = await lexicalToOdt(editorState(...nodes));
    const content = await getContentXml(bytes);
    for (let l = 1; l <= 6; l++) {
      expect(content).toContain(`Heading_20_${l}`);
    }
  });

  // ── Text formatting ───────────────────────────────────────────────────────

  it("should convert bold text", async () => {
    const bytes = await lexicalToOdt(editorState(paragraph([text("bold", BOLD)])));
    const content = await getContentXml(bytes);
    expect(content).toContain("bold");
    expect(content).toContain("fo:font-weight");
  });

  it("should convert italic text", async () => {
    const bytes = await lexicalToOdt(editorState(paragraph([text("italic", ITALIC)])));
    const content = await getContentXml(bytes);
    expect(content).toContain("italic");
    expect(content).toContain("fo:font-style");
  });

  it("should convert underline text", async () => {
    const bytes = await lexicalToOdt(editorState(paragraph([text("underline", UNDERLINE)])));
    const content = await getContentXml(bytes);
    expect(content).toContain("underline");
    expect(content).toContain("style:text-underline-style");
  });

  it("should convert strikethrough text", async () => {
    const bytes = await lexicalToOdt(editorState(paragraph([text("struck", STRIKETHROUGH)])));
    const content = await getContentXml(bytes);
    expect(content).toContain("struck");
    expect(content).toContain("style:text-line-through");
  });

  it("should convert inline code to monospace", async () => {
    const bytes = await lexicalToOdt(editorState(paragraph([text("code()", CODE)])));
    const content = await getContentXml(bytes);
    expect(content).toContain("code()");
    expect(content).toContain("Courier New");
  });

  it("should convert superscript", async () => {
    const bytes = await lexicalToOdt(editorState(paragraph([text("x"), text("2", SUPERSCRIPT)])));
    const content = await getContentXml(bytes);
    expect(content).toContain("super");
  });

  it("should convert subscript", async () => {
    const bytes = await lexicalToOdt(
      editorState(paragraph([text("H"), text("2", SUBSCRIPT), text("O")])),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("sub");
  });

  it("should convert inline color from CSS style", async () => {
    const colored = {
      type: "text",
      version: 1,
      text: "red text",
      format: 0,
      style: "color: rgb(255, 0, 0);",
      mode: "normal",
      detail: 0,
    };
    const bytes = await lexicalToOdt(editorState(paragraph([colored])));
    const content = await getContentXml(bytes);
    expect(content).toContain("red text");
    expect(content).toContain("fo:color");
  });

  // ── Link ──────────────────────────────────────────────────────────────────

  it("should convert a link", async () => {
    const bytes = await lexicalToOdt(
      editorState(paragraph([link("https://example.com", [text("click here")])])),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("click here");
    expect(content).toContain("https://example.com");
  });

  // ── Line break ────────────────────────────────────────────────────────────

  it("should convert linebreak to text:line-break", async () => {
    const bytes = await lexicalToOdt(
      editorState(paragraph([text("Line 1"), linebreak(), text("Line 2")])),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("Line 1");
    expect(content).toContain("Line 2");
    expect(content).toContain("text:line-break");
  });

  // ── Blockquote ────────────────────────────────────────────────────────────

  it("should convert quote with indent", async () => {
    const bytes = await lexicalToOdt(editorState(quote([text("Quoted text")])));
    const content = await getContentXml(bytes);
    expect(content).toContain("Quoted text");
    expect(content).toContain("fo:margin-left");
  });

  // ── Code block ────────────────────────────────────────────────────────────

  it("should convert code block to monospace", async () => {
    const bytes = await lexicalToOdt(editorState(code([text("const x = 1;")])));
    const content = await getContentXml(bytes);
    expect(content).toContain("const x = 1;");
    expect(content).toContain("Courier New");
  });

  // ── Horizontal rule ───────────────────────────────────────────────────────

  it("should convert horizontal rule to border paragraph", async () => {
    const bytes = await lexicalToOdt(editorState(horizontalRule()));
    const content = await getContentXml(bytes);
    expect(content).toContain("fo:border-bottom");
  });

  // ── Lists ─────────────────────────────────────────────────────────────────

  it("should convert bullet list", async () => {
    const bytes = await lexicalToOdt(
      editorState(
        list("bullet", [
          listItem([text("Item 1")]),
          listItem([text("Item 2")]),
          listItem([text("Item 3")]),
        ]),
      ),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("Item 1");
    expect(content).toContain("Item 2");
    expect(content).toContain("text:list");
  });

  it("should convert numbered list", async () => {
    const bytes = await lexicalToOdt(
      editorState(list("number", [listItem([text("First")]), listItem([text("Second")])])),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("First");
    expect(content).toContain("text:list");
  });

  it("should convert nested list", async () => {
    const bytes = await lexicalToOdt(
      editorState(
        list("bullet", [
          listItem([
            text("Parent"),
            list("bullet", [listItem([text("Child 1")]), listItem([text("Child 2")])]),
          ]),
        ]),
      ),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("Parent");
    expect(content).toContain("Child 1");
    expect(content).toContain("Child 2");
  });

  // ── Table ─────────────────────────────────────────────────────────────────

  it("should convert a table", async () => {
    const bytes = await lexicalToOdt(
      editorState(
        table([
          tableRow([tableCell([paragraph([text("Name")])]), tableCell([paragraph([text("Age")])])]),
          tableRow([tableCell([paragraph([text("Alice")])]), tableCell([paragraph([text("30")])])]),
        ]),
      ),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("Name");
    expect(content).toContain("Alice");
    expect(content).toContain("table:table");
  });

  it("should apply colSpan to table cells", async () => {
    const bytes = await lexicalToOdt(
      editorState(
        table([
          tableRow([tableCell([paragraph([text("Merged")])], 2)]),
          tableRow([tableCell([paragraph([text("A")])]), tableCell([paragraph([text("B")])])]),
        ]),
      ),
    );
    const content = await getContentXml(bytes);
    expect(content).toContain("table:number-columns-spanned");
  });

  // ── Page format ───────────────────────────────────────────────────────────

  it("should use A4 page format by default", async () => {
    const bytes = await lexicalToOdt(editorState(paragraph([text("Hello")])));
    const styles = await getStylesXml(bytes);
    expect(styles).toContain("21cm");
    expect(styles).toContain("29.7cm");
  });

  it("should use letter page format when specified", async () => {
    const bytes = await lexicalToOdt(editorState(paragraph([text("Hello")])), {
      pageFormat: "letter",
    });
    const styles = await getStylesXml(bytes);
    expect(styles).toContain("21.59cm");
  });

  // ── Full document ─────────────────────────────────────────────────────────

  it("should convert a realistic full document", async () => {
    const bytes = await lexicalToOdt(
      editorState(
        heading("h1", [text("Meeting Notes")]),
        paragraph([text("Date: "), text("April 18, 2026", BOLD)]),
        heading("h2", [text("Agenda")]),
        list("number", [
          listItem([text("Project status")]),
          listItem([text("Budget review")]),
          listItem([text("Next steps")]),
        ]),
        table([
          tableRow([
            tableCell([paragraph([text("Owner")])]),
            tableCell([paragraph([text("Task")])]),
          ]),
          tableRow([
            tableCell([paragraph([text("Alice")])]),
            tableCell([paragraph([text("Send report")])]),
          ]),
        ]),
        paragraph([
          text("See "),
          link("https://github.com/GitHubNewbie0/odf-kit", [text("odf-kit")]),
          text(" for details."),
        ]),
      ),
      { pageFormat: "A4" },
    );
    expect(bytes).toBeInstanceOf(Uint8Array);
    const content = await getContentXml(bytes);
    expect(content).toContain("Meeting Notes");
    expect(content).toContain("Agenda");
    expect(content).toContain("Alice");
    expect(content).toContain("https://github.com/GitHubNewbie0/odf-kit");
  });
});
