import type { OdtDocument } from "../../odt/document.js";
import type {
  LexicalTableNode,
  LexicalTableRowNode,
  LexicalTableCellNode,
  LexicalSerializedNode,
  InlineContentBuilder,
} from "../types.js";
import { walkInline } from "./walk-inline.js";

/**
 * Walk a Lexical table node and add it to the document.
 *
 * Structure confirmed from Proton's getChildrenFromTableNode.ts:
 *   TableNode → TableRowNode[] → TableCellNode[] → block children
 *
 * Each cell's block children (paragraphs, headings) are walked and their
 * inline content is appended to the cell builder.
 */
export function walkTable(node: LexicalTableNode, doc: OdtDocument): void {
  const rows = (node.children ?? []) as LexicalSerializedNode[];

  doc.addTable((t) => {
    for (const rowNode of rows) {
      if (rowNode.type !== "tablerow") {
        console.warn(
          `[odf-kit] lexicalToOdt: unexpected node type "${rowNode.type}" inside table — skipped`,
        );
        continue;
      }

      const row = rowNode as LexicalTableRowNode;
      const cells = (row.children ?? []) as LexicalSerializedNode[];

      t.addRow((r) => {
        for (const cellNode of cells) {
          if (cellNode.type !== "tablecell") {
            console.warn(
              `[odf-kit] lexicalToOdt: unexpected node type "${cellNode.type}" inside table row — skipped`,
            );
            continue;
          }

          const cell = cellNode as LexicalTableCellNode;
          const colSpan = cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined;
          const rowSpan = cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : undefined;

          r.addCell(
            (c) => {
              walkCellChildren(
                (cell.children ?? []) as LexicalSerializedNode[],
                c as unknown as InlineContentBuilder,
              );
            },
            colSpan || rowSpan ? { colSpan, rowSpan } : undefined,
          );
        }
      });
    }
  });
}

/**
 * Walk the block-level children of a table cell and append their inline
 * content to the CellBuilder.
 *
 * Lexical table cells contain block nodes (paragraph, heading, etc.) rather
 * than inline nodes directly. We walk each block's children as inline content,
 * inserting a line break between blocks when there are multiple.
 */
function walkCellChildren(children: LexicalSerializedNode[], c: InlineContentBuilder): void {
  let firstBlock = true;

  for (const child of children) {
    // Separate block content with a line break
    if (!firstBlock) {
      c.addLineBreak();
    }
    firstBlock = false;

    // Block nodes — walk their inline children
    const blockChildren = (child.children ?? []) as LexicalSerializedNode[];
    for (const inline of blockChildren) {
      walkInline(inline, c);
    }
  }
}
