/**
 * Markdown emitter for the ODT document model.
 *
 * Converts the structured document model produced by the ODT parser into
 * a Markdown string. Zero runtime dependencies — the emitter is a pure
 * function over OdtDocumentModel.
 *
 * Structural coverage:
 *  - Headings levels 1–6 (# through ######)
 *  - Paragraphs with blank-line separation
 *  - Bold, italic, bold+italic, strikethrough (GFM)
 *  - Underline → <u>text</u> (HTML passthrough — valid in GFM)
 *  - Superscript → <sup>text</sup>, subscript → <sub>text</sub>
 *  - Hyperlinks → [text](url)
 *  - Hard line breaks → two trailing spaces + newline
 *  - Unordered and ordered lists with nested sub-lists
 *  - Tables → GFM pipe table with --- separator row
 *  - Images → ![alt](name) placeholder (base64 data not inlined)
 *  - Sections → body content only (no Markdown equivalent)
 *  - Tracked changes: final (default), original, and changes modes
 *
 * Text content is escaped for Markdown. The following characters are
 * backslash-escaped when they appear in plain text: \ ` * _ { } [ ] ( ) # + - . !
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
} from "../reader/types.js";
import { readOdt } from "../reader/parser.js";
import type { ReadOdtOptions } from "../reader/types.js";

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
   * "gfm" (default): GitHub Flavored Markdown — enables pipe tables and
   *   ~~strikethrough~~. Compatible with GitHub, GitLab, and most modern
   *   Markdown renderers.
   * "commonmark": CommonMark only — tables are omitted (cells emitted as
   *   plain paragraphs), strikethrough falls back to plain text.
   */
  flavor?: "commonmark" | "gfm";

  /**
   * Controls how tracked changes are emitted. Mirrors ReadOdtOptions.trackedChanges.
   *
   * "final" (default): insertions rendered as body; deletions produce no output.
   * "original": deletions rendered as body; insertions produce no output.
   * "changes": insertions → <ins>body</ins>, deletions → <del>body</del>.
   */
  trackedChanges?: "final" | "original" | "changes";
}

// ============================================================
// Markdown escaping
// ============================================================

/** Characters with special meaning in Markdown inline context. */
const MD_ESCAPE_RE = /[\\`*_{}[\]()#+\-.!]/g;

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
 * superscript/subscript → underline → strikethrough → italic → bold
 * → hyperlink anchor.
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
    out = `[${out}](${span.href})`;
  }

  return out;
}

/**
 * Emit an ImageNode as a Markdown image placeholder.
 *
 * Base64 image data is not inlined. The alt text and name are preserved
 * so consumers can substitute with real paths if needed.
 */
function emitImage(node: ImageNode): string {
  const alt = node.title ?? node.name ?? "image";
  const src = node.name ?? "image";
  return `![${alt}](${src})`;
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

/** Emit a FieldNode — page number and page count get descriptive placeholders. */
function emitField(node: FieldNode): string {
  if (node.fieldType === "pageNumber") return node.value ?? "[page]";
  if (node.fieldType === "pageCount") return node.value ?? "[pages]";
  return node.value ?? "";
}

/** Emit a single InlineNode to a Markdown string. */
function emitInlineNode(node: InlineNode, options?: MarkdownEmitOptions): string {
  if ("kind" in node) {
    switch (node.kind) {
      case "image":
        return emitImage(node);
      case "note":
        return emitNote(node, options);
      case "bookmark":
        // Bookmarks have no Markdown equivalent — emit nothing
        return "";
      case "field":
        return emitField(node);
    }
  }
  return emitTextSpan(node as TextSpan, options);
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
function emitTable(table: TableNode, options?: MarkdownEmitOptions): string {
  if (table.rows.length === 0) return "";

  if (options?.flavor === "commonmark") {
    // CommonMark has no table syntax — emit rows as plain text paragraphs
    return table.rows
      .map((row) => row.cells.map((cell) => emitSpans(cell.spans, options)).join(" | "))
      .join("\n\n");
  }

  const rows = table.rows.map(
    (row) =>
      "| " +
      row.cells.map((cell) => emitSpans(cell.spans, options).replace(/\|/g, "\\|")).join(" | ") +
      " |",
  );

  const cols = table.rows[0].cells.length;
  const separator = "| " + Array(cols).fill("---").join(" | ") + " |";

  // Insert separator after first row (header)
  rows.splice(1, 0, separator);

  return rows.join("\n");
}

/**
 * Emit a SectionNode — Markdown has no section construct.
 * Emits the body content directly.
 */
function emitSection(node: SectionNode, options?: MarkdownEmitOptions): string {
  return emitBodyNodes(node.body, options);
}

/**
 * Emit a TrackedChangeNode.
 *
 * "changes" mode: insertions → <ins>body</ins>, deletions → <del>body</del>.
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
