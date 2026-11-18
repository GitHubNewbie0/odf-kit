/**
 * HTML renderer for the ODT document model.
 *
 * Converts the structured document model produced by the ODT parser into
 * an HTML string. Tier 1 output is clean, semantic HTML using standard
 * elements: <p>, <h1>–<h6>, <strong>, <em>, <u>, <s>, <sup>, <sub>,
 * <a>, <br>, <ul>, <ol>, <li>, <table>, <tr>, <td>.
 *
 * Tier 2 additions:
 *  - Inline CSS on text runs (color, font-size, font-family, etc.) via
 *    TextSpan.style → <span style="...">.
 *  - Inline CSS on table cells and rows (background, border, vertical-align).
 *  - Embedded images as base64 data URIs with alt and aria-describedby.
 *  - Footnotes and endnotes rendered as inline <sup> anchors with adjacent
 *    <aside role="note"> bodies; CSS can reposition them as needed.
 *  - Bookmarks rendered as zero-width <a id="..."> anchors.
 *  - Text fields rendered as their stored evaluated value.
 *  - Hidden text spans (text:display="none") suppressed from output.
 *
 * Tier 3 additions:
 *  - Paragraph and heading layout: inline CSS for text-align, margins,
 *    padding, and line-height from ParagraphStyle via style="...".
 *  - Table column widths: <colgroup><col style="width:X"> emitted for
 *    tables where any cell carries a columnWidth value.
 *  - Image float positioning: style:wrap → CSS float:left / float:right /
 *    display:block via ImageNode.wrapMode.
 *  - Sections: <section data-name="..."> wrapping SectionNode.body.
 *  - Tracked changes (when HtmlOptions.trackedChanges is "changes"):
 *      insertion    → <ins data-author="..." data-date="...">
 *      deletion     → <del data-author="..." data-date="...">
 *      format-change → <span class="odf-format-change" data-author="..." data-date="...">
 *    In "final" and "original" modes TrackedChangeNode is not emitted by
 *    the parser; if encountered, it is rendered transparently.
 *
 * Text content and interpolated attribute values are escaped before they
 * reach the output. That prevents markup breakout: a document-controlled
 * value cannot terminate its attribute, introduce an element, or add an
 * event handler.
 *
 * Each CSS value written into a style attribute is also checked
 * (src/core/css) before it is written. A value that would not stay exactly
 * one declaration at normal priority, so that it could add declarations,
 * remove the renderer's own, or mark itself !important, is left out, and
 * the rest of the attribute is written as before (T4: DS1-1). The caller is
 * not told when a value is left out (T4: DS1-10).
 *
 * That is not a guarantee about the result. This output is HTML derived
 * from an untrusted document, and neither escaping nor the CSS check says
 * anything about where a URL points, what a CSS value causes the browser to
 * fetch, or what a consumer's page permits. Consumers embedding this output
 * should sanitize it or render it in a sandboxed context.
 *
 * By default renderOdtHtml() returns a complete HTML document with a
 * <!DOCTYPE html> declaration. Pass { fragment: true } to receive only
 * the inner body content, suitable for embedding in an existing page.
 */

import { escapeAttr } from "../../core/index.js";
import { isBelowZero } from "../../core/length.js";
import { checkDeclarationValue } from "../../core/css/index.js";

import type {
  BodyNode,
  InlineNode,
  TextSpan,
  SpanStyle,
  ParagraphStyle,
  ImageNode,
  NoteNode,
  BookmarkNode,
  FieldNode,
  ListNode,
  TableNode,
  TableRowNode,
  SectionNode,
  TrackedChangeNode,
  CellStyle,
  RowStyle,
  HtmlOptions,
  TableCellNode,
} from "../read/types.js";

// ============================================================
// HTML escaping
// ============================================================

/**
 * Escape the five characters that must be encoded in HTML text content
 * and attribute values.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================
// CSS values in style attributes
// ============================================================

/**
 * Whether a value can be written as `name:value` in a style attribute: it
 * stays exactly one declaration at normal priority and leaves the later
 * declarations untouched (src/core/css; T4: DS1-1). The text checked is the
 * exact text written between `name:` and the renderer's `;` or the end of
 * the attribute (T4: DS1-2).
 *
 * A value that fails has its declaration left out; the rest of the attribute
 * is written as before. This is the named exception to verbatim writing for
 * the HTML renderers (T4: DS1-8). The caller is not told in this release; the
 * exception to C-2 is discharged when the HTML path gets a warnings channel
 * (T4: DS1-10).
 *
 * Callers pass the string they will write: a value is converted to a string
 * once, and that one string is checked and written (T4: DS1-20).
 */
function isWritableCssValue(text: string): boolean {
  return checkDeclarationValue(text).ok;
}

/**
 * Push `name:value` onto `parts` when the value is present and writable.
 * A model built outside the reader can hold a non-string here at run time,
 * so the value is converted to a string once, and that string is both
 * checked and written (T4: DS1-20).
 */
function pushDeclaration(parts: string[], name: string, value: string | undefined): void {
  if (value === undefined) return;
  const text = `${value}`;
  if (isWritableCssValue(text)) parts.push(`${name}:${text}`);
}

// ============================================================
// Tier 2 — CSS helpers
// ============================================================

/**
 * Convert a SpanStyle to a semicolon-separated inline CSS string.
 *
 * All SpanStyle values are CSS-ready — no unit conversion is needed
 * except fontSize, which is stored as a plain number (points) and
 * gets "pt" appended here. Each value is checked before it is written
 * (isWritableCssValue); fontSize is checked as the text `${fontSize}pt`
 * (T4: DS1-2).
 *
 * Returns an empty string when the style has no properties set,
 * so callers can skip emitting the <span> wrapper entirely.
 */
function spanStyleToCss(style: SpanStyle): string {
  const parts: string[] = [];
  pushDeclaration(parts, "color", style.fontColor);
  if (style.fontSize !== undefined) pushDeclaration(parts, "font-size", `${style.fontSize}pt`);
  pushDeclaration(parts, "font-family", style.fontFamily);
  pushDeclaration(parts, "background-color", style.highlightColor);
  pushDeclaration(parts, "text-transform", style.textTransform);
  pushDeclaration(parts, "font-variant", style.fontVariant);
  pushDeclaration(parts, "text-shadow", style.textShadow);
  pushDeclaration(parts, "letter-spacing", style.letterSpacing);
  return parts.join(";");
}

// ============================================================
// Tier 3 — Paragraph CSS helper
// ============================================================

/**
 * Convert a ParagraphStyle to a semicolon-separated inline CSS string.
 *
 * All ParagraphStyle values are CSS-ready strings including units.
 * fo:text-align values ("start", "end", "left", "right", "center",
 * "justify") are passed through verbatim — all are valid CSS text-align
 * values in modern browsers.
 *
 * Each value is checked before it is written (isWritableCssValue). That
 * includes marginTop / marginBottom read from fo:space-before /
 * fo:space-after, a placement T1 does not declare (T4: DS1-7).
 *
 * The line-height declaration is the block's BlockLineHeight, worked out
 * once per block by the caller (blockLineHeight; T4: DS1-20).
 *
 * Returns an empty string when the style has no properties set,
 * so callers can omit the style attribute entirely.
 */
function paragraphStyleToCss(
  style: ParagraphStyle,
  lineHeight: BlockLineHeight | undefined,
): string {
  const parts: string[] = [];
  pushDeclaration(parts, "text-align", style.textAlign);
  pushDeclaration(parts, "margin-left", style.marginLeft);
  pushDeclaration(parts, "margin-right", style.marginRight);
  pushDeclaration(parts, "margin-top", style.marginTop);
  pushDeclaration(parts, "margin-bottom", style.marginBottom);
  pushDeclaration(parts, "padding-left", style.paddingLeft);
  pushDeclaration(parts, "padding-right", style.paddingRight);
  if (lineHeight !== undefined) parts.push(`line-height:${lineHeight.value}`);
  return parts.join(";");
}

/** The line-height a block writes, and whether its inline content is wrapped. */
interface BlockLineHeight {
  /** The one string that was checked, and is written (T4: DS1-20). */
  value: string;
  wrap: boolean;
}

/**
 * The CSS line-height a block carries from the line-height setting, and
 * whether its inline content needs the line-height:normal wrapper.
 * T4: D106-3:
 *  - lineHeight → written verbatim, unless negative (CSS 2.1 §10.8.1:
 *    "Negative values are illegal"). It has precedence over the other two in
 *    the same element (ODF 1.4 §20.204; T4: D106-2), so the reader never
 *    reports them beside it.
 *  - lineHeightAtLeast → written on the block, unless negative, and the
 *    inline content is wrapped: on a block container line-height is the
 *    minimal height of the line boxes, on an inline element the height used
 *    (CSS 2.1 §10.8.1, visudet l.1502–1520).
 *  - lineSpacing → not written: CSS has no form for it. A named exception to
 *    C-2, pending a warnings channel on the HTML path.
 *
 * Each field is read and converted to a string once, and that string is
 * checked and written (T4: DS1-20). A value the check leaves out counts as
 * absent (isWritableCssValue; T4: DS1-1, DS1-21): a lineHeight left out lets
 * lineHeightAtLeast apply, and a lineHeightAtLeast left out gives no wrapper.
 * A negative lineHeight, not written, counts as absent in the same way: a
 * user agent ignores a declaration with an illegal value (T4: D106-7; CSS 2.1
 * §4.2, syndata l.708). Only a caller-built model holds both (T4: D106-2).
 * Call it once per block and pass the result to both of its users.
 */
function blockLineHeight(style: ParagraphStyle): BlockLineHeight | undefined {
  const lineHeight = style.lineHeight;
  if (lineHeight !== undefined) {
    const text = `${lineHeight}`;
    if (isWritableCssValue(text) && !isBelowZero(text)) return { value: text, wrap: false };
  }
  const atLeast = style.lineHeightAtLeast;
  if (atLeast !== undefined) {
    const text = `${atLeast}`;
    if (isWritableCssValue(text) && !isBelowZero(text)) return { value: text, wrap: true };
  }
  return undefined;
}

/**
 * The inner HTML of a paragraph or heading. When the block carries an
 * at-least line height, non-empty inline content is wrapped in one
 * <span style="line-height:normal"> (T4: D106-3 third bullet).
 */
function renderBlockInner(
  spans: InlineNode[],
  lineHeight: BlockLineHeight | undefined,
  options?: HtmlOptions,
): string {
  const inner = renderSpans(spans, options);
  const wrap = lineHeight?.wrap === true;
  return wrap && inner !== "" ? `<span style="line-height:normal">${inner}</span>` : inner;
}

/**
 * Convert a CellStyle to a semicolon-separated inline CSS string for
 * use on <td> elements. Border values are already in CSS-compatible
 * "width style color" format from the registry border expansion.
 *
 * columnWidth is not applied here — it is emitted on <col> elements
 * via the colgroup builder in renderTable.
 *
 * Each value is checked before it is written (isWritableCssValue).
 */
function cellStyleToCss(style: CellStyle): string {
  const parts: string[] = [];
  pushDeclaration(parts, "background-color", style.backgroundColor);
  pushDeclaration(parts, "vertical-align", style.verticalAlign);
  if (style.border !== undefined) {
    pushDeclaration(parts, "border-top", style.border.top);
    pushDeclaration(parts, "border-bottom", style.border.bottom);
    pushDeclaration(parts, "border-left", style.border.left);
    pushDeclaration(parts, "border-right", style.border.right);
  }
  return parts.join(";");
}

/**
 * Convert a RowStyle to a semicolon-separated inline CSS string for
 * use on <tr> elements. The value is checked before it is written
 * (isWritableCssValue).
 */
function rowStyleToCss(style: RowStyle): string {
  const parts: string[] = [];
  pushDeclaration(parts, "background-color", style.backgroundColor);
  return parts.join(";");
}

// ============================================================
// Inline node renderers
// ============================================================

/**
 * Render a TextSpan to an HTML string.
 *
 * Hidden spans (text:display="none") produce an empty string.
 *
 * Nesting order for semantic elements: bold → italic → underline →
 * strikethrough → superscript/subscript. SpanStyle (Tier 2) wraps the
 * semantic content in a <span style="..."> when present. The hyperlink
 * anchor is outermost so it wraps all formatting.
 */
function renderTextSpan(span: TextSpan): string {
  if (span.lineBreak) return "<br>";
  if (span.hidden) return "";

  let html = escapeHtml(span.text);

  if (span.bold) html = `<strong>${html}</strong>`;
  if (span.italic) html = `<em>${html}</em>`;
  if (span.underline) html = `<u>${html}</u>`;
  if (span.strikethrough) html = `<s>${html}</s>`;
  if (span.superscript) html = `<sup>${html}</sup>`;
  if (span.subscript) html = `<sub>${html}</sub>`;

  if (span.style !== undefined) {
    const css = spanStyleToCss(span.style);
    if (css) html = `<span style="${escapeAttr(css)}">${html}</span>`;
  }

  if (span.href !== undefined) html = `<a href="${escapeHtml(span.href)}">${html}</a>`;

  return html;
}

/**
 * Render an ImageNode as an HTML <img> element with a base64 data URI.
 *
 * Tier 3 — Float positioning via wrapMode:
 *  "left"        → float:left
 *  "right"       → float:right
 *  "none"        → display:block (image is a block; no float)
 *  "parallel"    → no float (CSS does not support text on both sides)
 *  "run-through" → no float (CSS does not support image overlapping text)
 *  absent        → no float CSS added
 *
 * Accessibility: title → alt (always emitted, empty string when absent);
 * description → aria-describedby with a hidden <span> carrying the text.
 * The describedby id uses the image draw:name when available.
 *
 * Width and height from the ODF frame are emitted as inline CSS (values
 * are already in CSS-compatible units such as "17cm"). Each is checked
 * before it is written (isWritableCssValue), so it cannot take in the
 * float or display declaration that follows.
 */
function renderImage(node: ImageNode): string {
  const attrs: string[] = [];

  if (node.data && node.mediaType) {
    attrs.push(`src="data:${escapeAttr(node.mediaType)};base64,${escapeAttr(node.data)}"`);
  }

  attrs.push(`alt="${escapeHtml(node.title ?? "")}"`);

  const styleParts: string[] = [];
  pushDeclaration(styleParts, "width", node.width);
  pushDeclaration(styleParts, "height", node.height);

  // Tier 3: float positioning from wrapMode
  if (node.wrapMode === "left") {
    styleParts.push("float:left");
  } else if (node.wrapMode === "right") {
    styleParts.push("float:right");
  } else if (node.wrapMode === "none") {
    styleParts.push("display:block");
  }
  // "parallel" and "run-through" have no CSS equivalent; no float added.

  if (styleParts.length > 0) attrs.push(`style="${escapeAttr(styleParts.join(";"))}"`);

  if (node.description !== undefined && node.name !== undefined) {
    const descId = `odf-img-${escapeHtml(node.name)}`;
    attrs.push(`aria-describedby="${descId}"`);
    const img = `<img ${attrs.join(" ")}>`;
    const desc = `<span id="${descId}" hidden>${escapeHtml(node.description)}</span>`;
    return img + desc;
  }

  return `<img ${attrs.join(" ")}>`;
}

/**
 * Render a NoteNode (footnote or endnote) as an inline superscript
 * citation anchor plus an adjacent <aside> carrying the note body.
 *
 * The <aside role="note"> appears immediately after the citation mark
 * in the HTML stream. CSS can hide it and collect notes to the page
 * bottom; JavaScript can do the same. The two elements are linked by
 * matching id/href pairs for back-referencing.
 */
function renderNote(node: NoteNode, options?: HtmlOptions): string {
  const refId = `odf-note-${escapeHtml(node.id)}-ref`;
  const noteId = `odf-note-${escapeHtml(node.id)}`;
  const citation = `<sup id="${refId}"><a href="#${noteId}">${escapeHtml(node.citation)}</a></sup>`;
  const bodyHtml = node.body.map((n) => renderBodyNode(n, options)).join("");
  const aside = `<aside id="${noteId}" role="note">${bodyHtml}</aside>`;
  return citation + aside;
}

/**
 * Render a BookmarkNode as a zero-width named anchor.
 *
 * point and start positions emit <a id="name"></a> so that
 * text:bookmark-ref cross-references (rendered as TextSpan with
 * href="#name") resolve correctly. end positions emit nothing.
 */
function renderBookmark(node: BookmarkNode): string {
  if (node.position === "end") return "";
  return `<a id="${escapeHtml(node.name)}"></a>`;
}

/**
 * Render a FieldNode as its stored evaluated value.
 *
 * ODF stores the evaluated field value as element text content at save
 * time, so no field evaluation is needed — the stored value is rendered
 * directly as HTML-escaped text.
 */
function renderField(node: FieldNode): string {
  return escapeHtml(node.value);
}

/**
 * Dispatch an InlineNode to the appropriate renderer.
 *
 * TextSpan has no `kind` property; all other InlineNode types do.
 * This distinguishes them without a separate type guard import.
 *
 * The switch is exhaustive over the remaining kinds (T4: LEAD-044): the
 * `never` assignment in `default` makes a new InlineNode kind a compile
 * error here. At runtime `default` is reached only by a model built outside
 * the type system, and throws naming the kind rather than rendering the node
 * as text or dropping it (T4: Scott, 2026-10-15, option B).
 */
function renderInlineNode(node: InlineNode, options?: HtmlOptions): string {
  if (!("kind" in node)) return renderTextSpan(node);
  switch (node.kind) {
    case "image":
      return renderImage(node);
    case "note":
      return renderNote(node, options);
    case "bookmark":
      return renderBookmark(node);
    case "field":
      return renderField(node);
    default: {
      const unhandled: never = node;
      throw new Error(
        `renderOdtHtml: unknown InlineNode kind "${String((unhandled as { kind: unknown }).kind)}"`,
      );
    }
  }
}

/** Render an array of InlineNode objects to a concatenated HTML string. */
function renderSpans(spans: InlineNode[], options?: HtmlOptions): string {
  return spans.map((n) => renderInlineNode(n, options)).join("");
}

// ============================================================
// Block node renderers
// ============================================================

/** Render a ListNode to an HTML <ul> or <ol> string. */
function renderList(list: ListNode, options?: HtmlOptions): string {
  const tag = list.ordered ? "ol" : "ul";
  const items = list.items
    .map((item) => {
      const content = renderSpans(item.spans, options);
      const nested = item.children !== undefined ? renderList(item.children, options) : "";
      return `<li>${content}${nested}</li>`;
    })
    .join("");
  return `<${tag}>${items}</${tag}>`;
}

/**
 * Render the content of a table cell. Cells carry block content in `body`.
 * A cell with no `body` — a hand-built or legacy model carrying only flat
 * `spans` — is normalized to a single paragraph so every cell renders through
 * the same block path. Cell paragraphs and headings get a vertical-margin reset
 * (see renderBodyNode), matching LibreOffice and other ODF→HTML producers.
 */
function renderCellContent(cell: TableCellNode, options?: HtmlOptions): string {
  const body: BodyNode[] =
    cell.body && cell.body.length > 0 ? cell.body : [{ kind: "paragraph", spans: cell.spans }];
  return body.map((n) => renderBodyNode(n, options, true)).join("");
}

/**
 * Render a single table row. Header rows (from table:table-header-rows) emit
 * <th scope="col"> cells; body rows emit <td>. Body-cell attribute order
 * (colspan, rowspan, style) is preserved so non-header table output is
 * unchanged from before header-row support.
 */
function renderRow(
  row: TableRowNode,
  options: HtmlOptions | undefined,
  headerCells: boolean,
): string {
  const rowCss = row.rowStyle !== undefined ? rowStyleToCss(row.rowStyle) : "";
  const rowAttrs = rowCss ? ` style="${escapeAttr(rowCss)}"` : "";
  const tag = headerCells ? "th" : "td";

  const cells = row.cells
    .map((cell) => {
      const attrParts: string[] = [];
      if (headerCells) attrParts.push(`scope="col"`);
      if (cell.colSpan !== undefined && cell.colSpan > 1) {
        attrParts.push(`colspan="${cell.colSpan}"`);
      }
      if (cell.rowSpan !== undefined && cell.rowSpan > 1) {
        attrParts.push(`rowspan="${cell.rowSpan}"`);
      }
      if (cell.cellStyle !== undefined) {
        const css = cellStyleToCss(cell.cellStyle);
        if (css) attrParts.push(`style="${escapeAttr(css)}"`);
      }
      const attrs = attrParts.length > 0 ? " " + attrParts.join(" ") : "";
      return `<${tag}${attrs}>${renderCellContent(cell, options)}</${tag}>`;
    })
    .join("");

  return `<tr${rowAttrs}>${cells}</tr>`;
}

/**
 * Render a TableNode to an HTML <table> string with Tier 2 inline styles
 * and Tier 3 column width layout via <colgroup>.
 *
 * Column widths are collected from the first content row's cells
 * (where columnWidth values are stored after Tier 2 column style
 * resolution). A <colgroup> is emitted only when at least one cell
 * carries a columnWidth value that passes the CSS check: a width left
 * out counts as absent (isWritableCssValue; T4: DS1-1). columnWidth may
 * come from cell properties, where T1 does not declare style:column-width
 * (T4: DS1-7).
 *
 * Rows from table:table-header-rows are rendered inside <thead> with <th>
 * cells; the remaining rows go in <tbody> with <td> cells. When a table has
 * no header rows the output is unchanged: bare <tr> rows with no thead/tbody
 * wrapper.
 */
function renderTable(table: TableNode, options?: HtmlOptions): string {
  // Build <colgroup> from the first row that has cells with columnWidth
  let colgroup = "";
  for (const row of table.rows) {
    // Per cell: undefined when no width is present or it is left out (it then
    // counts as absent, T4: DS1-1); null for a falsy width, which gives a bare
    // <col> as before; otherwise the one string checked and written (T4: DS1-20).
    const widths = row.cells.map((cell): string | null | undefined => {
      const cw = cell.cellStyle?.columnWidth;
      if (cw === undefined) return undefined;
      const text = `${cw}`;
      if (!isWritableCssValue(text)) return undefined;
      return cw ? text : null;
    });
    const cols = widths.map((w) => (w ? `<col style="width:${escapeAttr(w)}">` : "<col>"));
    // Only emit <colgroup> when at least one cell has an explicit width
    if (widths.some((w) => w !== undefined)) {
      colgroup = `<colgroup>${cols.join("")}</colgroup>`;
    }
    break; // Use only the first row for column width information
  }

  const headerRows = table.rows.filter((row) => row.isHeader);
  const bodyRows = table.rows.filter((row) => !row.isHeader);

  // No header rows: preserve the original flat output exactly.
  if (headerRows.length === 0) {
    const rows = bodyRows.map((row) => renderRow(row, options, false)).join("");
    return `<table>${colgroup}${rows}</table>`;
  }

  const thead = `<thead>${headerRows.map((row) => renderRow(row, options, true)).join("")}</thead>`;
  const tbody =
    bodyRows.length > 0
      ? `<tbody>${bodyRows.map((row) => renderRow(row, options, false)).join("")}</tbody>`
      : "";
  return `<table>${colgroup}${thead}${tbody}</table>`;
}

/**
 * Render a SectionNode as a <section> element.
 *
 * The section name is emitted as a data-name attribute when present,
 * preserving the author-assigned section name for consumers that perform
 * semantic section identification.
 */
function renderSection(node: SectionNode, options?: HtmlOptions): string {
  const nameAttr = node.name ? ` data-name="${escapeHtml(node.name)}"` : "";
  const bodyHtml = node.body.map((n) => renderBodyNode(n, options)).join("\n");
  return `<section${nameAttr}>\n${bodyHtml}\n</section>`;
}

/**
 * Render a TrackedChangeNode.
 *
 * When HtmlOptions.trackedChanges is "changes":
 *  insertion    → <ins data-author="..." data-date="...">body</ins>
 *  deletion     → <del data-author="..." data-date="...">body</del>
 *  format-change → <span class="odf-format-change" data-author="..." data-date="...">body</span>
 *
 * In other modes ("final", "original") the parser does not emit
 * TrackedChangeNode values. If one is encountered anyway (e.g. consumer
 * constructed the model manually), it is rendered transparently as its
 * body content with no wrapper element.
 */
function renderTrackedChange(node: TrackedChangeNode, options?: HtmlOptions): string {
  const bodyHtml = node.body.map((n) => renderBodyNode(n, options)).join("\n");

  if (options?.trackedChanges !== "changes") {
    // Transparent fallback — render body content without annotation wrapper
    return bodyHtml;
  }

  const dataParts: string[] = [];
  if (node.author) dataParts.push(`data-author="${escapeHtml(node.author)}"`);
  if (node.date) dataParts.push(`data-date="${escapeHtml(node.date)}"`);
  const dataAttrs = dataParts.length > 0 ? " " + dataParts.join(" ") : "";

  switch (node.changeType) {
    case "insertion":
      return `<ins${dataAttrs}>${bodyHtml}</ins>`;
    case "deletion":
      return `<del${dataAttrs}>${bodyHtml}</del>`;
    case "format-change":
      return `<span class="odf-format-change"${dataAttrs}>${bodyHtml}</span>`;
  }
}

/**
 * Map an ODF style:writing-mode value to an HTML `dir` attribute.
 *
 * Only the right-to-left modes produce output: left-to-right is the HTML
 * default, so emitting dir="ltr" on every paragraph would be noise. The
 * vertical modes (tb-rl, tb-lr, tb) have no `dir` equivalent — they need
 * CSS writing-mode plus layout consequences this renderer does not attempt
 * — so they are carried in the model and not rendered here.
 *
 * `dir` is emitted as an attribute rather than CSS `direction` because it
 * is the HTML-native mechanism, and because it is what makes any
 * direction-relative alignment value (text-align: start/end, which Word
 * writes on ODF export) resolve correctly in the consumer.
 */
function dirAttr(writingMode: string | undefined): string {
  return writingMode === "rl-tb" || writingMode === "rl" ? ` dir="rtl"` : "";
}

/** Render a single BodyNode to an HTML string. */
function renderBodyNode(node: BodyNode, options?: HtmlOptions, inCell = false): string {
  switch (node.kind) {
    case "paragraph": {
      const reset = inCell ? "margin-top:0;margin-bottom:0" : "";
      const lineHeight =
        node.paragraphStyle !== undefined ? blockLineHeight(node.paragraphStyle) : undefined;
      const sourceCss =
        node.paragraphStyle !== undefined
          ? paragraphStyleToCss(node.paragraphStyle, lineHeight)
          : "";
      const css = [reset, sourceCss].filter((s) => s).join(";");
      const attrs =
        (css ? ` style="${escapeAttr(css)}"` : "") + dirAttr(node.paragraphStyle?.writingMode);
      return `<p${attrs}>${renderBlockInner(node.spans, lineHeight, options)}</p>`;
    }
    case "heading": {
      const reset = inCell ? "margin-top:0;margin-bottom:0" : "";
      const lineHeight =
        node.paragraphStyle !== undefined ? blockLineHeight(node.paragraphStyle) : undefined;
      const sourceCss =
        node.paragraphStyle !== undefined
          ? paragraphStyleToCss(node.paragraphStyle, lineHeight)
          : "";
      const css = [reset, sourceCss].filter((s) => s).join(";");
      const attrs =
        (css ? ` style="${escapeAttr(css)}"` : "") + dirAttr(node.paragraphStyle?.writingMode);
      return `<h${node.level}${attrs}>${renderBlockInner(node.spans, lineHeight, options)}</h${node.level}>`;
    }
    case "list":
      return renderList(node, options);
    case "table":
      return renderTable(node, options);
    case "section":
      return renderSection(node, options);
    case "tracked-change":
      return renderTrackedChange(node, options);
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Convert a document body to an HTML string.
 *
 * @param body - Array of BodyNode objects in document order.
 * @param options - HTML output options.
 * @returns HTML string. Full document by default; inner fragment when
 *   options.fragment is true.
 *
 * @example
 * ```typescript
 * const html = renderOdtHtml(doc.body, { fragment: true });
 * ```
 */
export function renderOdtHtml(body: BodyNode[], options?: HtmlOptions): string {
  const inner = body.map((n) => renderBodyNode(n, options)).join("\n");
  if (options?.fragment === true) return inner;
  return `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"></head>\n<body>\n${inner}\n</body>\n</html>`;
}
