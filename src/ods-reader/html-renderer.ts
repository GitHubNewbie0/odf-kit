/**
 * ODS HTML renderer — converts an OdsDocumentModel to an HTML string.
 *
 * Each sheet is rendered as an HTML <table>. Merged cells use colspan/rowspan.
 * Covered cells are omitted. Cell formatting is applied as inline styles.
 */

import type {
  OdsDocumentModel,
  OdsSheetModel,
  OdsRowModel,
  OdsCellModel,
  OdsCellFormatting,
  OdsHtmlOptions,
} from "./types.js";

// ─── Style Building ───────────────────────────────────────────────────

function buildInlineStyle(fmt: OdsCellFormatting): string {
  const parts: string[] = [];
  if (fmt.bold) parts.push("font-weight:bold");
  if (fmt.italic) parts.push("font-style:italic");
  if (fmt.underline) parts.push("text-decoration:underline");
  if (fmt.fontSize) parts.push(`font-size:${fmt.fontSize}`);
  if (fmt.fontFamily) parts.push(`font-family:${fmt.fontFamily}`);
  if (fmt.color) parts.push(`color:${fmt.color}`);
  if (fmt.backgroundColor) parts.push(`background-color:${fmt.backgroundColor}`);
  if (fmt.textAlign) parts.push(`text-align:${fmt.textAlign}`);
  if (fmt.verticalAlign) parts.push(`vertical-align:${fmt.verticalAlign}`);
  return parts.join(";");
}

// ─── HTML Escaping ────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Cell Rendering ───────────────────────────────────────────────────

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

  if (includeStyles && cell.formatting) {
    const style = buildInlineStyle(cell.formatting);
    if (style) attrs.push(`style="${style}"`);
  }

  // Right-align numbers by default if no explicit alignment
  if (
    includeStyles &&
    !cell.formatting?.textAlign &&
    (cell.type === "float" || cell.type === "formula")
  ) {
    const existingStyle = attrs.find((a) => a.startsWith("style="));
    if (existingStyle) {
      const idx = attrs.indexOf(existingStyle);
      attrs[idx] = existingStyle.replace('"', '"text-align:right;');
    } else {
      attrs.push(`style="text-align:right"`);
    }
  }

  const content = renderCellValue(cell);
  return `<td ${attrs.join(" ")}>${content}</td>`;
}

// ─── Row Rendering ────────────────────────────────────────────────────

function renderRow(row: OdsRowModel, includeStyles: boolean, prefix: string): string {
  const cells = row.cells
    .filter((c: OdsCellModel) => c.type !== "covered")
    .map((c: OdsCellModel) => renderCell(c, includeStyles, prefix))
    .join("");

  const style = includeStyles && row.height ? ` style="height:${row.height}"` : "";
  return `<tr class="${prefix}-row"${style}>${cells}</tr>`;
}

// ─── Sheet Rendering ──────────────────────────────────────────────────

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

// ─── Public API ───────────────────────────────────────────────────────

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
