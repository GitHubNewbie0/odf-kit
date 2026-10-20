/**
 * Markdown emitter for the ODT document model.
 *
 * Converts the structured document model produced by the ODT parser into
 * a Markdown string. Zero runtime dependencies â€” the emitter is a pure
 * function over OdtDocumentModel.
 *
 * Structural coverage:
 *  - Headings levels 1â€“6 (# through ######)
 *  - Paragraphs with blank-line separation
 *  - Bold, italic, bold+italic, strikethrough (GFM)
 *  - Underline â†’ <u>text</u> (HTML passthrough â€” valid in GFM)
 *  - Superscript â†’ <sup>text</sup>, subscript â†’ <sub>text</sub>
 *  - Hyperlinks â†’ [text](url)
 *  - Hard line breaks â†’ two trailing spaces + newline
 *  - Unordered and ordered lists with nested sub-lists
 *  - Tables â†’ GFM pipe table with --- separator row
 *  - Images â†’ ![alt](name) placeholder (base64 data not inlined)
 *  - Sections â†’ body content only (no Markdown equivalent)
 *  - Tracked changes: final (default), original, and changes modes
 *
 * Text content is escaped for Markdown. The following characters are
 * backslash-escaped when they appear in plain text: \ ` * _ { } [ ] ( ) # + - . ! < &
 */

import type {
  OdtDocumentModel,
  BodyNode,
  InlineNode,
  TextSpan,
  ImageNode,
  NoteNode,
  FieldNode,
  ListNode,
  TableNode,
  SectionNode,
  TrackedChangeNode,
} from "../read/types.js";
import { readOdt } from "../read/parser.js";
import { emitLinkOrImage } from "./destination.js";
import type { ReadOdtOptions } from "../read/types.js";

// ============================================================
// Public options type
// ============================================================

/**
 * Options for the Markdown emitter.
 */
export interface MarkdownEmitOptions {
  /**
   * Markdown flavor to target.
   *
   * "gfm" (default): GitHub Flavored Markdown â€” enables pipe tables and
   *   ~~strikethrough~~. Compatible with GitHub, GitLab, and most modern
   *   Markdown renderers.
   * "commonmark": CommonMark only â€” tables are omitted (cells emitted as
   *   plain paragraphs), strikethrough falls back to plain text.
   */
  flavor?: "commonmark" | "gfm";

  /**
   * Controls how tracked changes are emitted. Mirrors ReadOdtOptions.trackedChanges.
   *
   * "final" (default): insertions rendered as body; deletions produce no output.
   * "original": deletions rendered as body; insertions produce no output.
   * "changes": insertions â†’ <ins>body</ins>, deletions â†’ <del>body</del>.
   */
  trackedChanges?: "final" | "original" | "changes";
  /**
   * If true, images are embedded as base64 data URLs (`![alt](data:image/png;base64,...)`).
   * Produces a fully self-contained Markdown file at the cost of larger file size.
   * Defaults to false â€” images are emitted as `![alt](name)` placeholders.
   * Only `image/png`, `image/gif`, `image/jpeg`, `image/webp`, `image/bmp` and `image/tiff` are embedded; any other media type is emitted as visible literal text, not as an image.
   */
  embedImages?: boolean;
}

// ============================================================
// Markdown escaping
// ============================================================

/**
 * Characters with special meaning in Markdown inline context. All are ASCII
 * punctuation, which may be backslash-escaped (T1: CommonMark 0.29 §2.1, §6.1,
 * cm.txt l.494–499, l.7178). `<` and `&` close raw HTML and character
 * references in text (T4: S1–S4, Scott, 2026-10-18).
 */
const MD_ESCAPE_RE = /[\\`*_{}[\]()#+\-.!<&]/g;

/**
 * Escape characters that carry special meaning in Markdown plain text.
 * Does not escape inside code spans or link targets.
 */
function escapeMd(text: string): string {
  return text.replace(MD_ESCAPE_RE, (ch) => `\\${ch}`);
}

// ============================================================
// Inline node renderers
// ============================================================

/**
 * Emit a TextSpan to a Markdown string.
 *
 * Formatting nesting order (innermost first):
 * superscript/subscript â†’ underline â†’ strikethrough â†’ italic â†’ bold
 * â†’ hyperlink anchor.
 */
function emitTextSpan(span: TextSpan, options?: MarkdownEmitOptions): string {
  if (span.lineBreak) return "  \n";
  if (span.hidden) return "";

  let out = escapeMd(span.text);

  if (span.superscript) out = `<sup>${out}</sup>`;
  if (span.subscript) out = `<sub>${out}</sub>`;
  if (span.underline) out = `<u>${out}</u>`;

  if (span.strikethrough) {
    out = options?.flavor === "commonmark" ? out : `~~${out}~~`;
  }

  if (span.italic && span.bold) {
    out = `**_${out}_**`;
  } else if (span.bold) {
    out = `**${out}**`;
  } else if (span.italic) {
    out = `_${out}_`;
  }

  if (span.href !== undefined) {
    // T4: [B] (Scott, 2026-10-19): the one classifier decides; no check here.
    out = emitLinkOrImage(out, span.href, "link");
  }

  return out;
}

/**
 * Emit an ImageNode as a Markdown image placeholder.
 *
 * By default, base64 image data is not inlined â€” the alt text and name are
 * preserved as a placeholder so consumers can substitute with real paths.
 * Pass `{ embedImages: true }` to embed images as base64 data URLs instead.
 */
function emitImage(node: ImageNode, options?: MarkdownEmitOptions): string {
  // Alt is text context, escaped once (T1: CommonMark 0.29 §6.1, cm.txt l.7178).
  const alt = escapeMd(node.title ?? node.name ?? "image");
  if (options?.embedImages && node.data && node.mediaType) {
    // The data: string is assembled raw and goes through the same function
    // unconditionally (T4: [B], [E], [H], Scott, 2026-10-19).
    return emitLinkOrImage(alt, `data:${node.mediaType};base64,${node.data}`, "image");
  }
  return emitLinkOrImage(alt, node.name ?? "image", "image");
}

/**
 * Emit a NoteNode (footnote/endnote) as a Markdown inline footnote.
 * Uses the GFM/Pandoc-style inline footnote syntax: ^[content].
 * Falls back to a bracketed superscript number for CommonMark.
 */
function emitNote(node: NoteNode, options?: MarkdownEmitOptions): string {
  const content = emitBodyNodes(node.body, options);
  if (options?.flavor === "commonmark") {
    return `<sup>[note]</sup>`;
  }
  return `^[${content.trim()}]`;
}

/** Emit a FieldNode â€” page number and page count get descriptive placeholders. */
function emitField(node: FieldNode): string {
  // A defined value is document input, escaped as text context (T4: S1–S4,
  // Scott, 2026-10-18). A null or undefined value gets 3125d07's fallback,
  // literal and unescaped, by the same `??` (T4: [R1-R], Scott, 2026-10-20).
  const value: string | undefined = node.value ?? undefined;
  if (node.fieldType === "pageNumber") return value === undefined ? "[page]" : escapeMd(value);
  if (node.fieldType === "pageCount") return value === undefined ? "[pages]" : escapeMd(value);
  return value === undefined ? "" : escapeMd(value);
}

/**
 * Emit a single InlineNode to a Markdown string.
 *
 * TextSpan has no `kind` property; all other InlineNode types do. The switch
 * is exhaustive over the remaining kinds (T4: LEAD-044): the `never`
 * assignment in `default` makes a new InlineNode kind a compile error here.
 * At runtime `default` is reached only by a model built outside the type
 * system, and throws naming the kind rather than emitting the node as text or
 * dropping it (T4: Scott, 2026-10-15, option B).
 */
function emitInlineNode(node: InlineNode, options?: MarkdownEmitOptions): string {
  if (!("kind" in node)) return emitTextSpan(node, options);
  switch (node.kind) {
    case "image":
      return emitImage(node, options);
    case "note":
      return emitNote(node, options);
    case "bookmark":
      // Bookmarks have no Markdown equivalent â€” emit nothing
      return "";
    case "field":
      return emitField(node);
    default: {
      const unhandled: never = node;
      throw new Error(
        `modelToMarkdown: unknown InlineNode kind "${String((unhandled as { kind: unknown }).kind)}"`,
      );
    }
  }
}

/** Emit an array of InlineNodes to a Markdown string. */
function emitSpans(spans: InlineNode[], options?: MarkdownEmitOptions): string {
  return spans.map((s) => emitInlineNode(s, options)).join("");
}

// ============================================================
// Block node renderers
// ============================================================

/**
 * Emit a ListNode to a Markdown string.
 *
 * Unordered items use `- `; ordered items use `1. ` (renumbered by renderers).
 * Nested sub-lists are indented with two spaces per level.
 */
function emitList(list: ListNode, options?: MarkdownEmitOptions, depth = 0): string {
  const indent = "  ".repeat(depth);
  const marker = list.ordered ? "1." : "-";

  return list.items
    .map((item) => {
      const content = emitSpans(item.spans, options);
      const nested =
        item.children !== undefined ? "\n" + emitList(item.children, options, depth + 1) : "";
      return `${indent}${marker} ${content}${nested}`;
    })
    .join("\n");
}

/**
 * Emit a TableNode as a GFM pipe table.
 *
 * The first row is treated as the header row. A separator row of `---`
 * cells is inserted after it. Falls back to plain paragraph text per cell
 * when flavor is "commonmark".
 */
function escapeMarkdownTableCell(s: string): string {
  // T4: S1–S4 (Scott, 2026-10-18): the cell content is already text-context
  // escaped, so only | is added; no backslash doubling. T4: Q4 (Scott,
  // 2026-10-20): a newline becomes a space, so the row stays on one line.
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function emitTable(table: TableNode, options?: MarkdownEmitOptions): string {
  if (table.rows.length === 0) return "";

  if (options?.flavor === "commonmark") {
    // CommonMark has no table syntax â€” emit rows as plain text paragraphs
    return table.rows
      .map((row) => row.cells.map((cell) => emitSpans(cell.spans, options)).join(" | "))
      .join("\n\n");
  }

  const rows = table.rows.map(
    (row) =>
      "| " +
      row.cells.map((cell) => escapeMarkdownTableCell(emitSpans(cell.spans, options))).join(" | ") +
      " |",
  );

  const cols = table.rows[0].cells.length;
  const separator = "| " + Array(cols).fill("---").join(" | ") + " |";

  // Insert separator after first row (header)
  rows.splice(1, 0, separator);

  return rows.join("\n");
}

/**
 * Emit a SectionNode â€” Markdown has no section construct.
 * Emits the body content directly.
 */
function emitSection(node: SectionNode, options?: MarkdownEmitOptions): string {
  return emitBodyNodes(node.body, options);
}

/**
 * Emit a TrackedChangeNode.
 *
 * "changes" mode: insertions â†’ <ins>body</ins>, deletions â†’ <del>body</del>.
 * Other modes: body emitted transparently.
 */
function emitTrackedChange(node: TrackedChangeNode, options?: MarkdownEmitOptions): string {
  const body = emitBodyNodes(node.body, options);

  if (options?.trackedChanges !== "changes") {
    return body;
  }

  switch (node.changeType) {
    case "insertion":
      return `<ins>${body}</ins>`;
    case "deletion":
      return `<del>${body}</del>`;
    case "format-change":
      return body;
  }
}

/** Emit a single BodyNode to a Markdown string. */
function emitBodyNode(node: BodyNode, options?: MarkdownEmitOptions): string {
  switch (node.kind) {
    case "paragraph":
      return emitSpans(node.spans, options);
    case "heading": {
      const prefix = "#".repeat(node.level);
      return `${prefix} ${emitSpans(node.spans, options)}`;
    }
    case "list":
      return emitList(node, options);
    case "table":
      return emitTable(node, options);
    case "section":
      return emitSection(node, options);
    case "tracked-change":
      return emitTrackedChange(node, options);
  }
}

/**
 * Emit an array of BodyNodes separated by blank lines.
 */
function emitBodyNodes(body: BodyNode[], options?: MarkdownEmitOptions): string {
  return body
    .map((n) => emitBodyNode(n, options))
    .filter((s) => s.trim().length > 0)
    .join("\n\n");
}

// ============================================================
// Public API
// ============================================================

/**
 * Convert an OdtDocumentModel to a Markdown string.
 *
 * @param model - The parsed ODT document model from readOdt().
 * @param options - Markdown emitter options.
 * @returns Markdown string.
 *
 * @example
 * ```typescript
 * import { readOdt } from "odf-kit/reader";
 * import { modelToMarkdown } from "odf-kit/markdown";
 * import { readFileSync, writeFileSync } from "node:fs";
 *
 * const bytes = new Uint8Array(readFileSync("document.odt"));
 * const model = readOdt(bytes);
 * const md = modelToMarkdown(model);
 * writeFileSync("document.md", md);
 * ```
 */
export function modelToMarkdown(model: OdtDocumentModel, options?: MarkdownEmitOptions): string {
  return emitBodyNodes(model.body, options);
}

/**
 * Convert an .odt file directly to a Markdown string.
 *
 * Convenience wrapper around readOdt() + modelToMarkdown(). Use
 * modelToMarkdown() directly when you need access to the document model
 * or want to share a single readOdt() call between multiple emitters.
 *
 * @param bytes - The raw .odt file as a Uint8Array.
 * @param options - Combined emitter and read options.
 * @returns Markdown string.
 *
 * @example
 * ```typescript
 * import { odtToMarkdown } from "odf-kit/markdown";
 * import { readFileSync, writeFileSync } from "node:fs";
 *
 * const bytes = new Uint8Array(readFileSync("document.odt"));
 * const md = odtToMarkdown(bytes);
 * writeFileSync("document.md", md);
 * ```
 */
export function odtToMarkdown(
  bytes: Uint8Array,
  options?: MarkdownEmitOptions & ReadOdtOptions,
): string {
  const model = readOdt(bytes, options);
  return modelToMarkdown(model, options);
}
