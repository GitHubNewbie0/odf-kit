import { readOdt } from "../../src/reader/parser.js";
import { renderHtml } from "../../src/reader/html-renderer.js";
import type {
  ParagraphNode,
  HeadingNode,
  ListNode,
  TableNode,
  TableCellNode,
  InlineNode,
  TextSpan,
} from "../../src/reader/types.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ============================================================
// Fixture loader
// ============================================================

// Real LibreOffice Writer document (see fixtures/README.md). ESM: __dirname is
// unavailable, so resolve the fixture directory from import.meta.url.
const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_BYTES = new Uint8Array(
  readFileSync(join(FIXTURE_DIR, "fixtures", "list-in-cell.odt")),
);

/**
 * Filter an InlineNode array down to TextSpan nodes only, mirroring the helper
 * in integration_test.ts. spans is InlineNode[], so it may also contain image,
 * note, bookmark, and field nodes; this fixture's cells are plain text.
 */
function textSpans(spans: InlineNode[]): TextSpan[] {
  return spans.filter((s): s is TextSpan => !("kind" in s));
}

function spanText(spans: InlineNode[]): string {
  return textSpans(spans)
    .map((s) => s.text)
    .join("");
}

// ============================================================
// Block content inside table cells
//
// Regression for the reported bug: a list inside a table cell was silently
// dropped during ODT->HTML conversion. Root cause was that cells modeled only
// flattened inline content; block-level cell children (lists, headings, nested
// tables, multiple paragraphs) had no representation. Cells now carry block
// content in `body`, parsed by the same walker used for the document body.
//
// The fixture is one real Writer document whose 2x2 outer table exercises every
// case: a paragraph + list, a heading + paragraph, two paragraphs, and a
// nested table.
// ============================================================

describe("readOdt — block content inside table cells", () => {
  const doc = readOdt(FIXTURE_BYTES);
  const table = doc.body.find((n) => n.kind === "table") as TableNode;
  const cell = (r: number, c: number): TableCellNode => table.rows[r].cells[c];

  test("the outer table is present with the expected shape", () => {
    expect(table).toBeDefined();
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].cells).toHaveLength(2);
    expect(table.rows[1].cells).toHaveLength(2);
  });

  test("preserves a list inside a cell (the reported bug)", () => {
    const list = cell(0, 0).body!.find((n) => n.kind === "list") as ListNode;
    expect(list).toBeDefined();
    expect(list.ordered).toBe(false);
    const itemTexts = list.items.map((i) => spanText(i.spans));
    expect(itemTexts).toContain("bullet list style.");
  });

  test("keeps a paragraph that precedes the list in the same cell", () => {
    const para = cell(0, 0).body!.find((n) => n.kind === "paragraph") as ParagraphNode;
    expect(para).toBeDefined();
    expect(spanText(para.spans)).toBe("This is the");
  });

  test("preserves a heading inside a cell", () => {
    const heading = cell(0, 1).body!.find((n) => n.kind === "heading") as HeadingNode;
    expect(heading).toBeDefined();
    expect(heading.level).toBe(1);
    expect(spanText(heading.spans)).toBe("Heading paragraph style");
  });

  test("preserves multiple paragraphs in a cell", () => {
    const paras = cell(1, 0).body!.filter((n) => n.kind === "paragraph") as ParagraphNode[];
    expect(paras).toHaveLength(2);
    expect(spanText(paras[0].spans)).toBe("Creating two");
    expect(spanText(paras[1].spans)).toBe("paragraphs here.");
  });

  test("preserves a nested table inside a cell", () => {
    const nested = cell(1, 1).body!.find((n) => n.kind === "table") as TableNode;
    expect(nested).toBeDefined();
    expect(nested.rows).toHaveLength(2);
    expect(nested.rows[0].cells).toHaveLength(2);
  });

  // ----------------------------------------------------------
  // Backward compatibility: spans is derived from body. Paragraph and heading
  // text is kept; list and table content has no inline projection and is
  // omitted. Paragraph-only cells stay byte-identical to the pre-change parser;
  // heading text is newly recovered (it was dropped entirely before).
  // ----------------------------------------------------------

  test("derives spans from paragraph content, omitting the list", () => {
    expect(spanText(cell(0, 0).spans)).toBe("This is the");
  });

  test("derived spans now include heading text that was previously dropped", () => {
    expect(spanText(cell(0, 1).spans)).toContain("Heading paragraph style");
  });

  test("derives empty spans for a cell whose only content is a nested table", () => {
    expect(spanText(cell(1, 1).spans)).toBe("");
  });

  // ----------------------------------------------------------
  // End-to-end render (readOdt -> renderHtml, the odtToHtml pipeline).
  // ----------------------------------------------------------

  test("renders the cell list to HTML end-to-end", () => {
    const html = renderHtml(doc.body, { fragment: true });
    // The list survives conversion. Item text is wrapped in a <span> carrying
    // the fixture's font, so match the ul>li structure around the text rather
    // than pinning the system-dependent span attributes.
    expect(html).toMatch(/<ul><li>.*?bullet list style\..*?<\/li><\/ul>/s);
  });

  test("renders the paragraph-then-list cell in order, with the margin reset", () => {
    const html = renderHtml(doc.body, { fragment: true });
    // Paragraph carries the cell margin reset and is immediately followed by the
    // list in the same cell. Tolerant of the inner <span> and the <td>'s own
    // border style.
    expect(html).toMatch(
      /<p style="margin-top:0;margin-bottom:0">.*?This is the.*?<\/p><ul><li>.*?bullet list style\./s,
    );
  });
});
