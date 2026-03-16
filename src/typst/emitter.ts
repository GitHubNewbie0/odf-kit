/**
 * Typst emitter for the ODT document model.
 *
 * Converts the structured document model produced by the ODT parser into
 * a Typst markup string (.typ). Zero runtime dependencies — the emitter is
 * a pure function over OdtDocumentModel and produces output suitable for
 * any Typst 0.11+ installation:
 *
 *   typst compile document.typ document.pdf
 *
 * Structural coverage:
 *  - Headings levels 1–6 (= through ======)
 *  - Paragraphs with text-align via #align()
 *  - Bold, italic, underline, strikethrough, superscript, subscript
 *  - Hyperlinks via #link()
 *  - Footnotes and endnotes via #footnote[]
 *  - Bookmarks as Typst labels (<name>) for point and start positions
 *  - Text fields: pageNumber and pageCount mapped to Typst counters;
 *    all others rendered as their stored evaluated value
 *  - Unordered and ordered lists with nested sub-lists
 *  - Tables via #table() with column widths where available
 *  - Named sections with comment headers
 *  - Tracked changes: final (default), original, and changes modes
 *
 * Tier 2 character style coverage (SpanStyle):
 *  - fontColor       → #text(fill: rgb("..."))[]
 *  - fontSize        → #text(size: Npt)[]
 *  - fontFamily      → #text(font: "...")[]
 *  - highlightColor  → #highlight(fill: rgb("..."))[]
 *
 * Page geometry (PageLayout) → #set page(width:, height:, margin: (...))
 *
 * Images: base64 image data cannot be embedded inline in Typst without
 * filesystem access. Each image is emitted as a comment placeholder
 * preserving its document position:
 *
 *   // [image: name 17cm × 5.74cm]
 *
 * Consumers that need images in the PDF should extract ImageNode.data
 * (base64) from the model, write the files alongside the .typ output,
 * and substitute the placeholders with #image("filename") calls.
 *
 * Text content is escaped for Typst markup mode. The following characters
 * are prefixed with a backslash: \ * _ # < @ ` ~ $ [ ]
 * A leading = on any line is also escaped to prevent heading misinterpretation.
 */

import type {
  OdtDocumentModel,
  BodyNode,
  InlineNode,
  TextSpan,
  SpanStyle,
  ImageNode,
  NoteNode,
  BookmarkNode,
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
 * Options for the Typst emitter.
 */
export interface TypstEmitOptions {
  /**
   * Controls how tracked changes are emitted. Mirrors ReadOdtOptions.trackedChanges.
   *
   * "final" (default): TrackedChangeNode values render as their insertion body;
   *   deletions produce no output. Matches the "final" parse mode behavior.
   * "original": TrackedChangeNode values render as their deletion body;
   *   insertions produce no output. Matches the "original" parse mode behavior.
   * "changes": insertions → #underline[], deletions → #strike[],
   *   format-change → body content only with no wrapper.
   *
   * Set readOdt and modelToTypst to the same mode for consistent results.
   * When readOdt is called with "final" (default), no TrackedChangeNode values
   * are emitted by the parser and this option has no effect.
   */
  trackedChanges?: "final" | "original" | "changes";
}

// ============================================================
// Typst escaping
// ============================================================

/** Characters with special meaning in Typst markup mode. */
const TYPST_ESCAPE_RE = /[\\*_#<@`~$[\]]/g;

/**
 * Escape characters that carry special meaning in Typst markup mode.
 *
 * Each matched character is prefixed with a backslash. A leading = on any
 * line is also escaped so text content is never misinterpreted as a heading.
 */
function escapeTypst(text: string): string {
  return text.replace(TYPST_ESCAPE_RE, (ch) => `\\${ch}`).replace(/^=/gm, "\\=");
}

// ============================================================
// Page setup
// ============================================================

/**
 * Emit a #set page(...) directive from a PageLayout.
 *
 * Returns an empty string when pageLayout is absent so the caller can
 * skip it without emitting a blank directive.
 */
function emitPageSetup(model: OdtDocumentModel): string {
  const layout = model.pageLayout;
  if (layout === undefined) return "";

  const parts: string[] = [];
  if (layout.width !== undefined) parts.push(`width: ${layout.width}`);
  if (layout.height !== undefined) parts.push(`height: ${layout.height}`);

  const marginParts: string[] = [];
  if (layout.marginTop !== undefined) marginParts.push(`top: ${layout.marginTop}`);
  if (layout.marginBottom !== undefined) marginParts.push(`bottom: ${layout.marginBottom}`);
  if (layout.marginLeft !== undefined) marginParts.push(`left: ${layout.marginLeft}`);
  if (layout.marginRight !== undefined) marginParts.push(`right: ${layout.marginRight}`);
  if (marginParts.length > 0) parts.push(`margin: (${marginParts.join(", ")})`);

  if (parts.length === 0) return "";
  return `#set page(${parts.join(", ")})`;
}

// ============================================================
// Tier 2 — SpanStyle helper
// ============================================================

/**
 * Wrap Typst content with #text() and #highlight() calls for any SpanStyle
 * properties that have Typst equivalents.
 *
 * Applied after all semantic formatting (#underline, #strike, _italic_,
 * *bold*) so SpanStyle is the outermost wrapper below the hyperlink anchor.
 *
 * Properties without a clean Typst mapping (textTransform, fontVariant,
 * textShadow, letterSpacing) are intentionally omitted — they have no
 * standard built-in Typst equivalent and faking them would produce incorrect
 * output.
 */
function applySpanStyle(style: SpanStyle, content: string): string {
  let out = content;

  // highlight() wraps first so #text() sits outside it
  if (style.highlightColor !== undefined) {
    out = `#highlight(fill: rgb("${style.highlightColor}"))[${out}]`;
  }

  const textArgs: string[] = [];
  if (style.fontColor !== undefined) textArgs.push(`fill: rgb("${style.fontColor}")`);
  if (style.fontSize !== undefined) textArgs.push(`size: ${style.fontSize}pt`);
  if (style.fontFamily !== undefined) textArgs.push(`font: "${style.fontFamily}"`);
  if (textArgs.length > 0) {
    out = `#text(${textArgs.join(", ")})[${out}]`;
  }

  return out;
}

// ============================================================
// Inline node renderers
// ============================================================

/**
 * Emit a TextSpan to a Typst markup string.
 *
 * Hidden spans (text:display="none") produce an empty string.
 * Hard line breaks produce a Typst forced line break: \
 *
 * Formatting nesting order (innermost first, outermost last):
 * superscript/subscript → strikethrough → underline → italic → bold
 * → SpanStyle → hyperlink anchor.
 */
function emitTextSpan(span: TextSpan): string {
  if (span.lineBreak) return "\\\n";
  if (span.hidden) return "";

  let out = escapeTypst(span.text);

  if (span.superscript) out = `#super[${out}]`;
  if (span.subscript) out = `#sub[${out}]`;
  if (span.strikethrough) out = `#strike[${out}]`;
  if (span.underline) out = `#underline[${out}]`;
  if (span.italic) out = `_${out}_`;
  if (span.bold) out = `*${out}*`;

  if (span.style !== undefined) {
    out = applySpanStyle(span.style, out);
  }

  if (span.href !== undefined) {
    out = `#link("${span.href}")[${out}]`;
  }

  return out;
}

/**
 * Emit an ImageNode as a comment placeholder.
 *
 * Typst does not support inline base64 image data without filesystem access.
 * The placeholder preserves the image's document position and carries its
 * name and dimensions so consumers can locate and substitute it.
 *
 * See module-level documentation for the recommended substitution workflow.
 */
function emitImage(node: ImageNode): string {
  const label = node.name ?? node.title ?? "image";
  const dims =
    node.width !== undefined && node.height !== undefined
      ? ` ${node.width} \u00d7 ${node.height}`
      : "";
  return `/* [image: ${label}${dims}] */`;
}

/**
 * Emit a NoteNode as a Typst #footnote[].
 *
 * Both footnote and endnote classes are emitted as #footnote[] — Typst does
 * not have a built-in endnote construct. Consumers that need distinct endnote
 * placement should post-process the .typ output.
 */
function emitNote(node: NoteNode, options?: TypstEmitOptions): string {
  const body = emitBodyNodes(node.body, options);
  return `#footnote[${body}]`;
}

/**
 * Emit a BookmarkNode as a Typst label.
 *
 * point and start positions emit <name> — Typst's label syntax for
 * cross-reference anchors. end positions produce no output (the span
 * has already been closed implicitly).
 */
function emitBookmark(node: BookmarkNode): string {
  if (node.position === "end") return "";
  return `<${node.name}>`;
}

/**
 * Emit a FieldNode to a Typst string.
 *
 * pageNumber and pageCount are mapped to their Typst counter equivalents.
 * All other field types fall back to the stored evaluated value, which is
 * always present per the ODF spec.
 */
function emitField(node: FieldNode): string {
  switch (node.fieldType) {
    case "pageNumber":
      return "#counter(page).display()";
    case "pageCount":
      return "#counter(page).final().first()";
    default:
      return escapeTypst(node.value);
  }
}

/**
 * Dispatch an InlineNode to the appropriate emitter.
 *
 * TextSpan has no `kind` property; all other InlineNode types do.
 * This mirrors the narrowing pattern used in the HTML renderer.
 */
function emitInlineNode(node: InlineNode, options?: TypstEmitOptions): string {
  if ("kind" in node) {
    switch (node.kind) {
      case "image":
        return emitImage(node);
      case "note":
        return emitNote(node, options);
      case "bookmark":
        return emitBookmark(node);
      case "field":
        return emitField(node);
    }
  }
  return emitTextSpan(node as TextSpan);
}

/** Emit an array of InlineNode objects to a concatenated Typst string. */
function emitSpans(spans: InlineNode[], options?: TypstEmitOptions): string {
  return spans.map((n) => emitInlineNode(n, options)).join("");
}

// ============================================================
// Block node renderers
// ============================================================

/**
 * Map an ODF/CSS text-align value to the Typst alignment keyword.
 *
 * ODF spec values "start" and "end" are passed through — Typst supports them
 * natively for bidirectional text. "justify" maps to Typst's "justify" keyword.
 */
function mapTextAlign(textAlign: string): string {
  switch (textAlign) {
    case "left":
      return "left";
    case "right":
      return "right";
    case "center":
      return "center";
    case "justify":
      return "justify";
    case "start":
      return "start";
    case "end":
      return "end";
    default:
      return "left";
  }
}

/**
 * Emit a ListNode to a Typst list string.
 *
 * Unordered items use the - marker; ordered items use +. Nested sub-lists
 * are indented with two spaces per level as required by the Typst parser.
 */
function emitList(list: ListNode, options?: TypstEmitOptions, depth = 0): string {
  const marker = list.ordered ? "+" : "-";
  const indent = "  ".repeat(depth);
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
 * Emit a TableNode as a Typst #table() call.
 *
 * Column widths are taken from the first row's CellStyle.columnWidth values
 * when present, producing a columns: (Xcm, Ycm, ...) tuple. When no widths
 * are available, columns: N (equal-width auto layout) is used instead.
 *
 * Cell content is emitted as Typst content blocks [...]. colspan and rowspan
 * are not yet expressible in standard Typst table syntax and are silently
 * ignored; the cell content is still emitted.
 */
function emitTable(table: TableNode, options?: TypstEmitOptions): string {
  if (table.rows.length === 0) return "";

  const cols = table.rows[0].cells.length;
  const firstRow = table.rows[0];
  const colWidths = firstRow.cells.map((cell) => cell.cellStyle?.columnWidth);
  const hasWidths = colWidths.some((w) => w !== undefined);

  const columnsArg = hasWidths
    ? `columns: (${colWidths.map((w) => w ?? "1fr").join(", ")})`
    : `columns: ${cols}`;

  const cells = table.rows
    .flatMap((row) => row.cells.map((cell) => `[${emitSpans(cell.spans, options)}]`))
    .join(", ");

  return `#table(\n  ${columnsArg},\n  ${cells}\n)`;
}

/**
 * Emit a SectionNode as a Typst comment header followed by its body content.
 *
 * Typst has no built-in section construct. The name is preserved as a comment
 * so consumers can identify section boundaries in the .typ output.
 */
function emitSection(node: SectionNode, options?: TypstEmitOptions): string {
  const header = node.name !== undefined ? `// Section: ${node.name}` : "// Section";
  const body = emitBodyNodes(node.body, options);
  return `${header}\n${body}`;
}

/**
 * Emit a TrackedChangeNode.
 *
 * When TypstEmitOptions.trackedChanges is "changes":
 *  insertion     → #underline[body]
 *  deletion      → #strike[body]
 *  format-change → body content only (no formatting wrapper; style changed,
 *                  not content)
 *
 * In other modes ("final", "original") the parser does not emit
 * TrackedChangeNode values. If one is encountered anyway (e.g. the consumer
 * constructed the model manually), it is rendered transparently as its body
 * content with no annotation wrapper — matching the HTML renderer's behavior.
 */
function emitTrackedChange(node: TrackedChangeNode, options?: TypstEmitOptions): string {
  const body = emitBodyNodes(node.body, options);

  if (options?.trackedChanges !== "changes") {
    return body;
  }

  switch (node.changeType) {
    case "insertion":
      return `#underline[${body}]`;
    case "deletion":
      return `#strike[${body}]`;
    case "format-change":
      return body;
  }
}

/** Emit a single BodyNode to a Typst markup string. */
function emitBodyNode(node: BodyNode, options?: TypstEmitOptions): string {
  switch (node.kind) {
    case "paragraph": {
      const content = emitSpans(node.spans, options);
      if (node.paragraphStyle?.textAlign !== undefined) {
        const align = mapTextAlign(node.paragraphStyle.textAlign);
        return `#align(${align})[${content}]`;
      }
      return content;
    }
    case "heading": {
      const prefix = "=".repeat(node.level);
      const content = emitSpans(node.spans, options);
      return `${prefix} ${content}`;
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
 * Emit an array of BodyNode objects separated by blank lines.
 *
 * Blank-line separation is the standard Typst paragraph delimiter and
 * ensures distinct blocks do not run together in the output.
 */
function emitBodyNodes(body: BodyNode[], options?: TypstEmitOptions): string {
  return body.map((n) => emitBodyNode(n, options)).join("\n\n");
}

// ============================================================
// Public API
// ============================================================

/**
 * Convert an OdtDocumentModel to a Typst markup string.
 *
 * This is the primary emitter function. It accepts a pre-parsed document
 * model and returns a .typ string with no side effects and no filesystem
 * access. Use this when you already have a model from readOdt() or when
 * you need fine-grained control over read options.
 *
 * @param model - The parsed ODT document model from readOdt().
 * @param options - Typst emitter options.
 * @returns Typst markup string (.typ).
 *
 * @example
 * ```typescript
 * import { readOdt } from "odf-kit/reader";
 * import { modelToTypst } from "odf-kit/typst";
 * import { readFileSync, writeFileSync } from "node:fs";
 *
 * const bytes = new Uint8Array(readFileSync("document.odt"));
 * const model = readOdt(bytes);
 * const typ = modelToTypst(model);
 * writeFileSync("document.typ", typ);
 * // then: typst compile document.typ document.pdf
 * ```
 */
export function modelToTypst(model: OdtDocumentModel, options?: TypstEmitOptions): string {
  const sections: string[] = [];

  const pageSetup = emitPageSetup(model);
  if (pageSetup) sections.push(pageSetup);

  const body = emitBodyNodes(model.body, options);
  if (body) sections.push(body);

  return sections.join("\n\n");
}

/**
 * Convert an .odt file directly to a Typst markup string.
 *
 * Convenience wrapper around readOdt() + modelToTypst(). Use modelToTypst()
 * directly when you need access to the document model, metadata, or want to
 * share a single readOdt() call between multiple emitters.
 *
 * @param bytes - The raw .odt file as a Uint8Array.
 * @param options - Combined emitter and read options. The trackedChanges
 *   field is forwarded to both readOdt() and modelToTypst() — set it once
 *   for consistent results across both steps.
 * @returns Typst markup string (.typ).
 *
 * @example
 * ```typescript
 * import { odtToTypst } from "odf-kit/typst";
 * import { readFileSync, writeFileSync } from "node:fs";
 *
 * const bytes = new Uint8Array(readFileSync("document.odt"));
 * const typ = odtToTypst(bytes);
 * writeFileSync("document.typ", typ);
 * // then: typst compile document.typ document.pdf
 * ```
 */
export function odtToTypst(bytes: Uint8Array, options?: TypstEmitOptions & ReadOdtOptions): string {
  const model = readOdt(bytes, options);
  return modelToTypst(model, options);
}
