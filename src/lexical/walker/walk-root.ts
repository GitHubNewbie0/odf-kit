import type { OdtDocument } from "../../odt/document.js";
import type { LexicalSerializedEditorState, LexicalSerializedNode } from "../types.js";
import type { WalkContext } from "./walk-image.js";
import {
  walkParagraph,
  walkHeading,
  walkQuote,
  walkCode,
  walkHorizontalRule,
} from "./walk-block.js";
import type {
  LexicalParagraphNode,
  LexicalHeadingNode,
  LexicalQuoteNode,
  LexicalCodeNode,
  LexicalListNode,
  LexicalCustomListNode,
  LexicalTableNode,
  LexicalImageNode,
} from "../types.js";
import { walkList } from "./walk-list.js";
import { walkTable } from "./walk-table.js";
import { walkImage } from "./walk-image.js";

/**
 * Walk the root of a Lexical SerializedEditorState and populate an OdtDocument.
 *
 * Dispatcher for all top-level node types. Block nodes (ElementNodes) and
 * decorator nodes (image, horizontalrule) are handled separately — confirmed
 * from Proton's EditorDocxExporter.ts where $isElementNode() returns false
 * for decorator nodes.
 */
export async function walkRoot(
  editorState: LexicalSerializedEditorState,
  doc: OdtDocument,
  context: WalkContext,
): Promise<void> {
  const children = editorState.root.children as LexicalSerializedNode[];

  for (const child of children) {
    // ── Decorator nodes (not ElementNodes — checked by type) ──────────────

    if (child.type === "image") {
      await walkImage(child as LexicalImageNode, doc, context);
      continue;
    }

    if (child.type === "horizontalrule") {
      walkHorizontalRule(doc);
      continue;
    }

    // ── Block element nodes ───────────────────────────────────────────────

    switch (child.type) {
      case "paragraph":
        walkParagraph(child as LexicalParagraphNode, doc);
        break;

      case "heading":
        walkHeading(child as LexicalHeadingNode, doc);
        break;

      case "quote":
        walkQuote(child as LexicalQuoteNode, doc);
        break;

      case "code":
        walkCode(child as LexicalCodeNode, doc);
        break;

      case "list":
        walkList(child as LexicalListNode, doc);
        break;

      case "custom-list":
        walkList(child as LexicalCustomListNode, doc);
        break;

      case "table":
        walkTable(child as LexicalTableNode, doc);
        break;

      default:
        console.warn(`[odf-kit] lexicalToOdt: unsupported node type "${child.type}" — skipped`);
    }
  }
}
