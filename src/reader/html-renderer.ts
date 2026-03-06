/**
 * HTML renderer for the ODT document model.
 *
 * Converts the structured document model produced by the ODT parser into
 * an HTML string. Output is clean, semantic HTML using standard elements:
 * <p>, <h1>–<h6>, <strong>, <em>, <u>, <s>, <sup>, <sub>, <a>, <br>,
 * <ul>, <ol>, <li>, <table>, <tr>, <td>.
 *
 * Text content is HTML-escaped. Attribute values used in href are also
 * HTML-escaped so the output is safe to embed in any HTML context.
 *
 * By default renderHtml() returns a complete HTML document with a
 * <!DOCTYPE html> declaration. Pass { fragment: true } to receive only
 * the inner body content, suitable for embedding in an existing page.
 */

import type { BodyNode, TextSpan, ListNode, TableNode, HtmlOptions } from "./types.js";

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

/**
 * Render a single TextSpan to an HTML string.
 *
 * Nesting order: bold → italic → underline → strikethrough →
 * superscript/subscript → hyperlink. This order matches common browser
 * rendering conventions and produces valid, readable HTML.
 */
function renderSpan(span: TextSpan): string {
  if (span.lineBreak) return "<br>";

  let html = escapeHtml(span.text);

  if (span.bold) html = `<strong>${html}</strong>`;
  if (span.italic) html = `<em>${html}</em>`;
  if (span.underline) html = `<u>${html}</u>`;
  if (span.strikethrough) html = `<s>${html}</s>`;
  if (span.superscript) html = `<sup>${html}</sup>`;
  if (span.subscript) html = `<sub>${html}</sub>`;
  if (span.href !== undefined) html = `<a href="${escapeHtml(span.href)}">${html}</a>`;

  return html;
}

/** Render an array of TextSpan objects to a concatenated HTML string. */
function renderSpans(spans: TextSpan[]): string {
  return spans.map(renderSpan).join("");
}

/** Render a ListNode to an HTML <ul> or <ol> string. */
function renderList(list: ListNode): string {
  const tag = list.ordered ? "ol" : "ul";
  const items = list.items
    .map((item) => {
      const content = renderSpans(item.spans);
      const nested = item.children !== undefined ? renderList(item.children) : "";
      return `<li>${content}${nested}</li>`;
    })
    .join("");
  return `<${tag}>${items}</${tag}>`;
}

/** Render a TableNode to an HTML <table> string. */
function renderTable(table: TableNode): string {
  const rows = table.rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => {
          const attrParts: string[] = [];
          if (cell.colSpan !== undefined && cell.colSpan > 1) {
            attrParts.push(`colspan="${cell.colSpan}"`);
          }
          if (cell.rowSpan !== undefined && cell.rowSpan > 1) {
            attrParts.push(`rowspan="${cell.rowSpan}"`);
          }
          const attrs = attrParts.length > 0 ? " " + attrParts.join(" ") : "";
          return `<td${attrs}>${renderSpans(cell.spans)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table>${rows}</table>`;
}

/** Render a single BodyNode to an HTML string. */
function renderNode(node: BodyNode): string {
  switch (node.kind) {
    case "paragraph":
      return `<p>${renderSpans(node.spans)}</p>`;
    case "heading":
      return `<h${node.level}>${renderSpans(node.spans)}</h${node.level}>`;
    case "list":
      return renderList(node);
    case "table":
      return renderTable(node);
  }
}

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
  const inner = body.map(renderNode).join("\n");
  if (options?.fragment === true) return inner;
  return `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"></head>\n<body>\n${inner}\n</body>\n</html>`;
}
