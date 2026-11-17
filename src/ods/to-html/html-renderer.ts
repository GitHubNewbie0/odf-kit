/**
 * ODS HTML renderer â€” converts an OdsDocumentModel to an HTML string.
 *
 * Each sheet is rendered as an HTML <table>. Merged cells use colspan/rowspan.
 * Covered cells are omitted. Cell formatting is applied as inline styles.
 *
 * Cell text, sheet names and the style attribute's value are escaped before
 * they reach the output, and colspan and rowspan, which the reader produces
 * as integers, are written only when greater than 1, so a document-controlled
 * value cannot terminate its attribute, introduce an element, or add an event
 * handler. Each CSS value written into a style attribute is also checked
 * (src/core/css) before it is written. A value that would not stay exactly
 * one declaration at normal priority, so that it could add declarations,
 * remove the renderer's own, or mark itself !important, is left out, and the
 * rest of the attribute is written as before (T4: DS1-1); a value left out
 * counts as absent, so a number or formula cell whose text-align is left out
 * is right-aligned by default (T4: DS1-21). The caller is not told when a
 * value is left out (T4: DS1-10).
 *
 * That is not a guarantee about the result. This output is HTML derived
 * from an untrusted document, and neither escaping nor the CSS check says
 * anything about where a URL points, what a CSS value causes the browser to
 * fetch, or what a consumer's page permits. Consumers embedding this output
 * should sanitize it or render it in a sandboxed context.
 */

import { escapeAttr } from "../../core/index.js";
import { checkDeclarationValue } from "../../core/css/index.js";

import type {
  OdsDocumentModel,
  OdsSheetModel,
  OdsRowModel,
  OdsCellModel,
  OdsCellFormatting,
  OdsHtmlOptions,
} from "../read/types.js";

// â”€â”€â”€ Style Building â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * The text to write for a CSS value, or undefined when the value is absent
 * or is left out.
 *
 * Presence is tested as before, by truthiness. A present value is converted
 * to a string once, and that one string is checked and written (T4: DS1-20).
 * The check (src/core/css) passes a value that stays exactly one declaration
 * at normal priority and leaves the later declarations untouched (T4: DS1-1).
 * A value that fails is left out and counts as absent wherever the renderer
 * tests whether a value is present (T4: DS1-21). Leaving it out is the
 * named exception to verbatim writing for the HTML renderers (T4: DS1-8); the
 * caller is not told in this release (T4: DS1-10).
 */
function writableCssText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = `${value}`;
  return checkDeclarationValue(text).ok ? text : undefined;
}

/** Push `name:value` onto `parts` when the value is present and writable. */
function pushDeclaration(parts: string[], name: string, value: string | undefined): void {
  const text = writableCssText(value);
  if (text !== undefined) parts.push(`${name}:${text}`);
}

/**
 * Build the cell's inline style. Every value is checked (writableCssText),
 * textAlign and verticalAlign included: renderOdsHtml takes models built by
 * the caller, so the reader's keyword limit does not reach them.
 *
 * `textAlign` is the text-align text renderCell has already read and
 * converted once (or undefined when absent or left out), so that the
 * text-align written and the default right-align test use the same result
 * (T4: DS1-20, DS1-21).
 */
function buildInlineStyle(fmt: OdsCellFormatting, textAlign: string | undefined): string {
  const parts: string[] = [];
  if (fmt.bold) parts.push("font-weight:bold");
  if (fmt.italic) parts.push("font-style:italic");
  if (fmt.underline) parts.push("text-decoration:underline");
  pushDeclaration(parts, "font-size", fmt.fontSize);
  pushDeclaration(parts, "font-family", fmt.fontFamily);
  pushDeclaration(parts, "color", fmt.color);
  pushDeclaration(parts, "background-color", fmt.backgroundColor);
  if (textAlign !== undefined) parts.push(`text-align:${textAlign}`);
  pushDeclaration(parts, "vertical-align", fmt.verticalAlign);
  return parts.join(";");
}

// â”€â”€â”€ HTML Escaping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// â”€â”€â”€ Cell Rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderCellValue(cell: OdsCellModel): string {
  // Prefer display text when available
  if (cell.displayText !== undefined && cell.displayText !== "") {
    return escapeHtml(cell.displayText);
  }
  if (cell.value === null || cell.value === undefined) return "";
  if (cell.value instanceof Date) {
    return escapeHtml(cell.value.toISOString().slice(0, 10));
  }
  return escapeHtml(String(cell.value));
}

function renderCell(cell: OdsCellModel, includeStyles: boolean, prefix: string): string {
  const attrs: string[] = [`class="${prefix}-cell"`];

  if (cell.colSpan && cell.colSpan > 1) attrs.push(`colspan="${cell.colSpan}"`);
  if (cell.rowSpan && cell.rowSpan > 1) attrs.push(`rowspan="${cell.rowSpan}"`);

  // textAlign is read once and converted once per cell. The same result is
  // written by buildInlineStyle and decides the default right-align below
  // (T4: DS1-20, DS1-21).
  const formatting = includeStyles ? cell.formatting : undefined;
  const textAlign = formatting ? writableCssText(formatting.textAlign) : undefined;

  if (formatting) {
    const style = buildInlineStyle(formatting, textAlign);
    if (style) attrs.push(`style="${escapeAttr(style)}"`);
  }

  // Right-align numbers by default if no text-align was written: a textAlign
  // that is left out counts as absent (T4: DS1-21).
  if (
    includeStyles &&
    textAlign === undefined &&
    (cell.type === "float" || cell.type === "formula")
  ) {
    const existingStyle = attrs.find((a) => a.startsWith("style="));
    if (existingStyle) {
      const idx = attrs.indexOf(existingStyle);
      attrs[idx] = existingStyle.replace(/^style="/, 'style="text-align:right;');
    } else {
      attrs.push(`style="text-align:right"`);
    }
  }

  const content = renderCellValue(cell);
  return `<td ${attrs.join(" ")}>${content}</td>`;
}

// â”€â”€â”€ Row Rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderRow(row: OdsRowModel, includeStyles: boolean, prefix: string): string {
  const cells = row.cells
    .filter((c: OdsCellModel) => c.type !== "covered")
    .map((c: OdsCellModel) => renderCell(c, includeStyles, prefix))
    .join("");

  // The height is read from table:table-row, where T1 does not declare
  // style:row-height; it is checked like any value (T4: DS1-7). A height left
  // out counts as absent, so the attribute is omitted (T4: DS1-1).
  const height = includeStyles ? writableCssText(row.height) : undefined;
  const style = height !== undefined ? ` style="height:${escapeAttr(height)}"` : "";
  return `<tr class="${prefix}-row"${style}>${cells}</tr>`;
}

// â”€â”€â”€ Sheet Rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderSheet(sheet: OdsSheetModel, includeStyles: boolean, prefix: string): string {
  if (sheet.rows.length === 0) {
    return `<h2 class="${prefix}-sheet-name">${escapeHtml(sheet.name)}</h2>\n<table class="${prefix}-sheet"></table>`;
  }

  const rows = sheet.rows
    .map((r: OdsRowModel) => renderRow(r, includeStyles, prefix))
    .join("\n    ");

  return [
    `<h2 class="${prefix}-sheet-name">${escapeHtml(sheet.name)}</h2>`,
    `<table class="${prefix}-sheet">`,
    `  <tbody>`,
    `    ${rows}`,
    `  </tbody>`,
    `</table>`,
  ].join("\n");
}

// â”€â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Render an OdsDocumentModel as an HTML string.
 *
 * Each sheet is rendered as a `<table>`. Merged cells use `colspan`/`rowspan`.
 * Covered cells are omitted. Cell formatting applied as inline styles.
 *
 * @param model   - Parsed document model from readOds().
 * @param options - Optional rendering options.
 * @returns HTML string.
 */
export function renderOdsHtml(model: OdsDocumentModel, options?: OdsHtmlOptions): string {
  const includeStyles = options?.includeStyles ?? true;
  const prefix = options?.classPrefix ?? "ods";

  const sheets = model.sheets
    .map((s: OdsSheetModel) => renderSheet(s, includeStyles, prefix))
    .join("\n\n");

  return `<div class="${prefix}-document">\n${sheets}\n</div>`;
}
