import type { OdtDocument } from "../../odt/document.js";
import type { ListBuilder } from "../../odt/list-builder.js";
import type {
  LexicalSerializedNode,
  LexicalListNode,
  LexicalCustomListNode,
  LexicalListItemNode,
} from "../types.js";
import { walkInline } from "./walk-inline.js";

/**
 * Map Lexical CustomListNode listStyleType to odf-kit numFormat.
 * Confirmed from CustomListTypes.ts: 'lower-alpha' | 'upper-alpha' | 'upper-roman'
 */
function mapNumFormat(listStyleType: string | undefined): "1" | "a" | "A" | "i" | "I" {
  switch (listStyleType) {
    case "lower-alpha":
      return "a";
    case "upper-alpha":
      return "A";
    case "upper-roman":
      return "I";
    default:
      return "1";
  }
}

/**
 * Map Lexical CustomListNode listMarker to odf-kit numSuffix.
 * Confirmed from CustomListTypes.ts: 'period' | 'bracket'
 */
function mapNumSuffix(listMarker: string | undefined): string {
  return listMarker === "bracket" ? ")" : ".";
}

/**
 * Walk a Lexical list node (type: "list") or custom-list node (type: "custom-list").
 *
 * Both types share the same structure — custom-list extends list with
 * listStyleType and listMarker fields for numbered list style variants.
 */
export function walkList(node: LexicalListNode | LexicalCustomListNode, doc: OdtDocument): void {
  const listType = node.listType;
  const isNumbered = listType === "number";
  const customNode = node as LexicalCustomListNode;

  doc.addList(
    (l) => {
      buildListItems(node.children ?? [], l);
    },
    {
      type: isNumbered ? "numbered" : "bullet",
      numFormat: isNumbered ? mapNumFormat(customNode.listStyleType) : undefined,
      numSuffix: isNumbered ? mapNumSuffix(customNode.listMarker) : undefined,
      startValue: isNumbered ? (node.start ?? 1) : undefined,
    },
  );
}

/**
 * Recursively build list items into a ListBuilder.
 *
 * Each listitem may contain:
 * - Inline children (text, link, code-highlight, etc.)
 * - A nested list node (list or custom-list) — rendered via addNested()
 * - Both inline content AND a nested list — inline first, then nested
 */
function buildListItems(items: LexicalSerializedNode[], l: ListBuilder): void {
  for (const item of items) {
    if (item.type !== "listitem") {
      console.warn(
        `[odf-kit] lexicalToOdt: unexpected node type "${item.type}" inside list — skipped`,
      );
      continue;
    }

    const listItem = item as LexicalListItemNode;
    const children = listItem.children ?? [];

    // Separate inline children from nested list children
    const inlineChildren = children.filter((c) => c.type !== "list" && c.type !== "custom-list");
    const nestedList = children.find((c) => c.type === "list" || c.type === "custom-list");

    // Add the item with its inline content
    l.addItem((p) => {
      for (const child of inlineChildren) {
        walkInline(child, p);
      }
    });

    // If there is a nested list, attach it to the item just added
    if (nestedList) {
      const nestedChildren = (nestedList.children as LexicalSerializedNode[]) ?? [];
      l.addNested((sub) => {
        buildListItems(nestedChildren, sub);
      });
    }
  }
}
