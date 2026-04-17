import type { OdtDocument } from "../../odt/document.js";
import type {
  LexicalParagraphNode,
  LexicalHeadingNode,
  LexicalQuoteNode,
  LexicalCodeNode,
} from "../types.js";
import { walkInline } from "./walk-inline.js";

/**
 * Map Lexical block-level alignment strings to odf-kit ParagraphOptions.align values.
 *
 * Lexical uses: "left" | "center" | "right" | "justify" | "start" | "end" | ""
 * odf-kit accepts: "left" | "center" | "right" | "justify"
 *
 * "start" and "end" are logical directions — map to "left" and "right" respectively.
 * "" (empty) means default — omit the align option entirely.
 */
const ALIGNMENT_MAP: Record<string, "left" | "center" | "right" | "justify" | undefined> = {
  left: "left",
  start: "left",
  center: "center",
  right: "right",
  end: "right",
  justify: "justify",
  "": undefined,
};

/**
 * Walk a Lexical paragraph node.
 */
export function walkParagraph(node: LexicalParagraphNode, doc: OdtDocument): void {
  const align = ALIGNMENT_MAP[node.format ?? ""];
  const children = node.children ?? [];

  doc.addParagraph(
    (p) => {
      for (const child of children) {
        walkInline(child, p);
      }
    },
    align ? { align } : undefined,
  );
}

/**
 * Walk a Lexical heading node (h1–h6).
 */
export function walkHeading(node: LexicalHeadingNode, doc: OdtDocument): void {
  const level = parseInt(node.tag.slice(1), 10) as 1 | 2 | 3 | 4 | 5 | 6;
  const children = node.children ?? [];

  doc.addHeading((h) => {
    for (const child of children) {
      walkInline(child, h);
    }
  }, level);
}

/**
 * Walk a Lexical quote node.
 *
 * Rendered as an indented paragraph with a left indent.
 * ODT does not have a native blockquote style so we approximate visually.
 */
export function walkQuote(node: LexicalQuoteNode, doc: OdtDocument): void {
  const children = node.children ?? [];

  doc.addParagraph(
    (p) => {
      for (const child of children) {
        walkInline(child, p);
      }
    },
    { indentLeft: "1cm" },
  );
}

/**
 * Walk a Lexical code block node (CodeNode).
 *
 * Children are CodeHighlightNodes (syntax-highlighted tokens) and linebreak nodes.
 * We ignore syntax highlight colors and render everything in Courier New.
 *
 * Note: inline code (TextNode with format bit 16) is handled in walk-inline.ts.
 */
export function walkCode(node: LexicalCodeNode, doc: OdtDocument): void {
  const children = node.children ?? [];

  doc.addParagraph((p) => {
    for (const child of children) {
      if (child.type === "code-highlight" || child.type === "text") {
        p.addText((child.text as string) ?? "", { fontFamily: "Courier New" });
      } else if (child.type === "linebreak") {
        p.addLineBreak();
      } else {
        console.warn(
          `[odf-kit] lexicalToOdt: unexpected node type "${child.type}" inside code block — skipped`,
        );
      }
    }
  });
}

/**
 * Walk a horizontal rule decorator node.
 *
 * Rendered as an empty paragraph with a bottom border — the same approach
 * used by Proton's DOCX exporter (createHorizontalRuleChild.ts).
 */
export function walkHorizontalRule(doc: OdtDocument): void {
  doc.addParagraph("", { borderBottom: "0.5pt solid #000000" });
}
