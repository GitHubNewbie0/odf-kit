import type {
  LexicalSerializedNode,
  LexicalTextNode,
  LexicalLinkNode,
  InlineContentBuilder,
} from "../types.js";
import {
  TEXT_FORMAT_BOLD,
  TEXT_FORMAT_ITALIC,
  TEXT_FORMAT_STRIKETHROUGH,
  TEXT_FORMAT_UNDERLINE,
  TEXT_FORMAT_CODE,
  TEXT_FORMAT_SUBSCRIPT,
  TEXT_FORMAT_SUPERSCRIPT,
} from "../types.js";
import { parseInlineStyle } from "../css/parse-inline-style.js";
import { pxToPt } from "../util/px-to-pt.js";

/**
 * Walk an inline Lexical node and append content to an InlineContentBuilder.
 *
 * Accepts both ParagraphBuilder and CellBuilder — both satisfy InlineContentBuilder
 * structurally. Handles: text, link, autolink, code-highlight, hashtag, linebreak.
 *
 * Inline images (type: "image") are not handled here — they require async
 * resolution and are handled by walk-image.ts at the block level.
 */
export function walkInline(node: LexicalSerializedNode, p: InlineContentBuilder): void {
  switch (node.type) {
    case "text":
      return walkText(node as LexicalTextNode, p);

    case "link":
    case "autolink":
      return walkLink(node as LexicalLinkNode, p);

    case "code-highlight":
      // Ignore highlightType — render as plain monospace text
      p.addText((node.text as string) ?? "", { fontFamily: "Courier New" });
      return;

    case "hashtag":
      p.addText((node.text as string) ?? "");
      return;

    case "linebreak":
      p.addLineBreak();
      return;

    case "overflow":
      // Editor UI node — no content meaning
      console.warn(`[odf-kit] lexicalToOdt: unsupported inline node type "overflow" — skipped`);
      return;

    default:
      console.warn(`[odf-kit] lexicalToOdt: unsupported inline node type "${node.type}" — skipped`);
  }
}

/**
 * Walk a Lexical text node, extracting format bitmask and CSS inline styles.
 */
function walkText(node: LexicalTextNode, p: InlineContentBuilder): void {
  const format = node.format ?? 0;
  const style = parseInlineStyle(node.style ?? "");

  // format & TEXT_FORMAT_CODE means inline code — use monospace font,
  // overriding any font-family from the CSS style string.
  const isInlineCode = (format & TEXT_FORMAT_CODE) !== 0;

  p.addText(node.text ?? "", {
    bold: (format & TEXT_FORMAT_BOLD) !== 0,
    italic: (format & TEXT_FORMAT_ITALIC) !== 0,
    strikethrough: (format & TEXT_FORMAT_STRIKETHROUGH) !== 0,
    underline: (format & TEXT_FORMAT_UNDERLINE) !== 0,
    subscript: (format & TEXT_FORMAT_SUBSCRIPT) !== 0,
    superscript: (format & TEXT_FORMAT_SUPERSCRIPT) !== 0,
    fontFamily: isInlineCode ? "Courier New" : style.fontFamily,
    fontSize: pxToPt(style.fontSize),
    color: style.color ? `#${style.color}` : undefined,
    highlightColor: style.backgroundColor ? `#${style.backgroundColor}` : undefined,
  });
}

/**
 * Walk a Lexical link or autolink node.
 *
 * Renders each text child as a link run, preserving bold/italic/color.
 * Other child types are walked as plain inline nodes.
 */
function walkLink(node: LexicalLinkNode, p: InlineContentBuilder): void {
  const url = (node.url as string) ?? "";
  const children = (node.children as LexicalSerializedNode[]) ?? [];

  for (const child of children) {
    if (child.type === "text") {
      const textNode = child as LexicalTextNode;
      const format = textNode.format ?? 0;
      const style = parseInlineStyle(textNode.style ?? "");

      p.addLink(textNode.text ?? "", url, {
        bold: (format & TEXT_FORMAT_BOLD) !== 0,
        italic: (format & TEXT_FORMAT_ITALIC) !== 0,
        color: style.color ? `#${style.color}` : undefined,
      });
    } else {
      // Non-text children inside a link (rare) — render as plain inline
      walkInline(child, p);
    }
  }
}
