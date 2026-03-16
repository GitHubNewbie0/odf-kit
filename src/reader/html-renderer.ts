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
 * Text content is HTML-escaped. Attribute values used in href, src,
 * data-*, and id are also HTML-escaped so the output is safe to embed
 * in any context.
 *
 * By default renderHtml() returns a complete HTML document with a
 * <!DOCTYPE html> declaration. Pass { fragment: true } to receive only
 * the inner body content, suitable for embedding in an existing page.
 */

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
  SectionNode,
  TrackedChangeNode,
  CellStyle,
  RowStyle,
  HtmlOptions,
} from "./types.js";

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
// Tier 2 — CSS helpers
// ============================================================

/**
 * Convert a SpanStyle to a semicolon-separated inline CSS string.
 *
 * All SpanStyle values are CSS-ready — no unit conversion is needed
 * except fontSize, which is stored as a plain number (points) and
 * gets "pt" appended here.
 *
 * Returns an empty string when the style has no properties set,
 * so callers can skip emitting the <span> wrapper entirely.
 */
function spanStyleToCss(style: SpanStyle): string {
  const parts: string[] = [];
  if (style.fontColor !== undefined) parts.push(`color:${style.fontColor}`);
  if (style.fontSize !== undefined) parts.push(`font-size:${style.fontSize}pt`);
  if (style.fontFamily !== undefined) parts.push(`font-family:${style.fontFamily}`);
  if (style.highlightColor !== undefined) parts.push(`background-color:${style.highlightColor}`);
  if (style.textTransform !== undefined) parts.push(`text-transform:${style.textTransform}`);
  if (style.fontVariant !== undefined) parts.push(`font-variant:${style.fontVariant}`);
  if (style.textShadow !== undefined) parts.push(`text-shadow:${style.textShadow}`);
  if (style.letterSpacing !== undefined) parts.push(`letter-spacing:${style.letterSpacing}`);
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
 * Returns an empty string when the style has no properties set,
 * so callers can omit the style attribute entirely.
 */
function paragraphStyleToCss(style: ParagraphStyle): string {
  const parts: string[] = [];
  if (style.textAlign !== undefined) parts.push(`text-align:${style.textAlign}`);
  if (style.marginLeft !== undefined) parts.push(`margin-left:${style.marginLeft}`);
  if (style.marginRight !== undefined) parts.push(`margin-right:${style.marginRight}`);
  if (style.marginTop !== undefined) parts.push(`margin-top:${style.marginTop}`);
  if (style.marginBottom !== undefined) parts.push(`margin-bottom:${style.marginBottom}`);
  if (style.paddingLeft !== undefined) parts.push(`padding-left:${style.paddingLeft}`);
  if (style.paddingRight !== undefined) parts.push(`padding-right:${style.paddingRight}`);
  if (style.lineHeight !== undefined) parts.push(`line-height:${style.lineHeight}`);
  return parts.join(";");
}

/**
 * Convert a CellStyle to a semicolon-separated inline CSS string for
 * use on <td> elements. Border values are already in CSS-compatible
 * "width style color" format from the registry border expansion.
 *
 * columnWidth is not applied here — it is emitted on <col> elements
 * via the colgroup builder in renderTable.
 */
function cellStyleToCss(style: CellStyle): string {
  const parts: string[] = [];
  if (style.backgroundColor !== undefined) parts.push(`background-color:${style.backgroundColor}`);
  if (style.verticalAlign !== undefined) parts.push(`vertical-align:${style.verticalAlign}`);
  if (style.border !== undefined) {
    if (style.border.top !== undefined) parts.push(`border-top:${style.border.top}`);
    if (style.border.bottom !== undefined) parts.push(`border-bottom:${style.border.bottom}`);
    if (style.border.left !== undefined) parts.push(`border-left:${style.border.left}`);
    if (style.border.right !== undefined) parts.push(`border-right:${style.border.right}`);
  }
  return parts.join(";");
}

/**
 * Convert a RowStyle to a semicolon-separated inline CSS string for
 * use on <tr> elements.
 */
function rowStyleToCss(style: RowStyle): string {
  const parts: string[] = [];
  if (style.backgroundColor !== undefined) parts.push(`background-color:${style.backgroundColor}`);
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
    if (css) html = `<span style="${css}">${html}</span>`;
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
 * are already in CSS-compatible units such as "17cm").
 */
function renderImage(node: ImageNode): string {
  const attrs: string[] = [];

  if (node.data && node.mediaType) {
    attrs.push(`src="data:${node.mediaType};base64,${node.data}"`);
  }

  attrs.push(`alt="${escapeHtml(node.title ?? "")}"`);

  const styleParts: string[] = [];
  if (node.width !== undefined) styleParts.push(`width:${node.width}`);
  if (node.height !== undefined) styleParts.push(`height:${node.height}`);

  // Tier 3: float positioning from wrapMode
  if (node.wrapMode === "left") {
    styleParts.push("float:left");
  } else if (node.wrapMode === "right") {
    styleParts.push("float:right");
  } else if (node.wrapMode === "none") {
    styleParts.push("display:block");
  }
  // "parallel" and "run-through" have no CSS equivalent; no float added.

  if (styleParts.length > 0) attrs.push(`style="${styleParts.join(";")}"`);

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
 */
function renderInlineNode(node: InlineNode, options?: HtmlOptions): string {
  if ("kind" in node) {
    switch (node.kind) {
      case "image":
        return renderImage(node);
      case "note":
        return renderNote(node, options);
      case "bookmark":
        return renderBookmark(node);
      case "field":
        return renderField(node);
    }
  }
  return renderTextSpan(node as TextSpan);
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
 * Render a TableNode to an HTML <table> string with Tier 2 inline styles
 * and Tier 3 column width layout via <colgroup>.
 *
 * Column widths are collected from the first content row's cells
 * (where columnWidth values are stored after Tier 2 column style
 * resolution). A <colgroup> is emitted only when at least one cell
 * carries a columnWidth value.
 */
function renderTable(table: TableNode, options?: HtmlOptions): string {
  // Build <colgroup> from the first row that has cells with columnWidth
  let colgroup = "";
  for (const row of table.rows) {
    const cols = row.cells.map((cell) => {
      const cw = cell.cellStyle?.columnWidth;
      return cw ? `<col style="width:${cw}">` : "<col>";
    });
    // Only emit <colgroup> when at least one cell has an explicit width
    if (row.cells.some((cell) => cell.cellStyle?.columnWidth !== undefined)) {
      colgroup = `<colgroup>${cols.join("")}</colgroup>`;
    }
    break; // Use only the first row for column width information
  }

  const rows = table.rows
    .map((row) => {
      const rowCss = row.rowStyle !== undefined ? rowStyleToCss(row.rowStyle) : "";
      const rowAttrs = rowCss ? ` style="${rowCss}"` : "";

      const cells = row.cells
        .map((cell) => {
          const attrParts: string[] = [];
          if (cell.colSpan !== undefined && cell.colSpan > 1) {
            attrParts.push(`colspan="${cell.colSpan}"`);
          }
          if (cell.rowSpan !== undefined && cell.rowSpan > 1) {
            attrParts.push(`rowspan="${cell.rowSpan}"`);
          }
          if (cell.cellStyle !== undefined) {
            const css = cellStyleToCss(cell.cellStyle);
            if (css) attrParts.push(`style="${css}"`);
          }
          const attrs = attrParts.length > 0 ? " " + attrParts.join(" ") : "";
          return `<td${attrs}>${renderSpans(cell.spans, options)}</td>`;
        })
        .join("");

      return `<tr${rowAttrs}>${cells}</tr>`;
    })
    .join("");

  return `<table>${colgroup}${rows}</table>`;
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

/** Render a single BodyNode to an HTML string. */
function renderBodyNode(node: BodyNode, options?: HtmlOptions): string {
  switch (node.kind) {
    case "paragraph": {
      const attrParts: string[] = [];
      if (node.paragraphStyle !== undefined) {
        const css = paragraphStyleToCss(node.paragraphStyle);
        if (css) attrParts.push(`style="${css}"`);
      }
      const attrs = attrParts.length > 0 ? " " + attrParts.join(" ") : "";
      return `<p${attrs}>${renderSpans(node.spans, options)}</p>`;
    }
    case "heading": {
      const attrParts: string[] = [];
      if (node.paragraphStyle !== undefined) {
        const css = paragraphStyleToCss(node.paragraphStyle);
        if (css) attrParts.push(`style="${css}"`);
      }
      const attrs = attrParts.length > 0 ? " " + attrParts.join(" ") : "";
      return `<h${node.level}${attrs}>${renderSpans(node.spans, options)}</h${node.level}>`;
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
 * const html = renderHtml(doc.body, { fragment: true });
 * ```
 */
export function renderHtml(body: BodyNode[], options?: HtmlOptions): string {
  const inner = body.map((n) => renderBodyNode(n, options)).join("\n");
  if (options?.fragment === true) return inner;
  return `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"></head>\n<body>\n${inner}\n</body>\n</html>`;
}
