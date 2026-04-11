/**
 * XLSX → ODS converter.
 *
 * Maps an XlsxWorkbook intermediate model to an OdsDocument and saves it.
 */

import { OdsDocument } from "../ods/document.js";
import type { OdsCellObject, OdsDateFormat } from "../ods/types.js";
import type { XlsxWorkbook, XlsxSheet, XlsxCell } from "./reader.js";

export interface XlsxToOdsOptions {
  /**
   * Date display format for date cells.
   * Defaults to "YYYY-MM-DD".
   */
  dateFormat?: OdsDateFormat;

  /**
   * Document metadata for the output ODS file.
   */
  metadata?: {
    title?: string;
    creator?: string;
    description?: string;
  };
}

// ─── Cell Mapping ─────────────────────────────────────────────────────

function mapCell(cell: XlsxCell, options: XlsxToOdsOptions): OdsCellObject {
  switch (cell.type) {
    case "string":
      return { value: cell.value as string, type: "string" };

    case "number":
      return { value: cell.value as number, type: "float" };

    case "boolean":
      return { value: cell.value as boolean, type: "boolean" };

    case "date":
      return {
        value: cell.value as Date,
        type: "date",
        ...(options.dateFormat ? { dateFormat: options.dateFormat } : {}),
      };

    case "formula": {
      // Determine the cell type from the cached value
      const val = cell.value;
      let type: OdsCellObject["type"] = "formula";
      if (typeof val === "string") type = "formula";
      else if (typeof val === "boolean") type = "formula";
      else if (val instanceof Date) type = "formula";
      else type = "formula";

      return {
        value: val,
        type,
        formula: cell.formula ? `=${cell.formula.replace(/^=/, "")}` : undefined,
      } as OdsCellObject;
    }

    case "error":
      // Represent errors as strings
      return { value: String(cell.value), type: "string" };

    default:
      return { value: null, type: "string" };
  }
}

// ─── Sheet Conversion ─────────────────────────────────────────────────

function convertSheet(xlSheet: XlsxSheet, options: XlsxToOdsOptions, doc: OdsDocument): void {
  const sheet = doc.addSheet(xlSheet.name);

  if (xlSheet.freezeRows) sheet.freezeRows(xlSheet.freezeRows);
  if (xlSheet.freezeColumns) sheet.freezeColumns(xlSheet.freezeColumns);

  if (xlSheet.rows.size === 0) return;

  // Determine row/column extent
  let maxRow = 0;
  let maxCol = 0;
  for (const [rowIdx, row] of xlSheet.rows) {
    if (rowIdx > maxRow) maxRow = rowIdx;
    for (const colIdx of row.cells.keys()) {
      if (colIdx > maxCol) maxCol = colIdx;
    }
  }
  // Also account for merge extents
  for (const [key, span] of xlSheet.merges) {
    const [c, r] = key.split(":").map(Number);
    const endRow = r + span.rowSpan - 1;
    const endCol = c + span.colSpan - 1;
    if (endRow > maxRow) maxRow = endRow;
    if (endCol > maxCol) maxCol = endCol;
  }

  for (let r = 0; r <= maxRow; r++) {
    const xlRow = xlSheet.rows.get(r);
    const cells: (OdsCellObject | null)[] = [];
    let hasContent = false;

    for (let c = 0; c <= maxCol; c++) {
      const cellKey = `${c}:${r}`;

      // Skip covered cells — OdsDocument handles them automatically via colSpan/rowSpan
      if (xlSheet.coveredCells.has(cellKey)) {
        cells.push(null);
        continue;
      }

      const xlCell = xlRow?.cells.get(c);
      if (!xlCell || xlCell.type === "empty") {
        cells.push(null);
        continue;
      }

      const cellObj = mapCell(xlCell, options);

      // Apply merge spans
      const merge = xlSheet.merges.get(cellKey);
      if (merge) {
        if (merge.colSpan > 1) cellObj.colSpan = merge.colSpan;
        if (merge.rowSpan > 1) cellObj.rowSpan = merge.rowSpan;
      }

      cells.push(cellObj);
      hasContent = true;
    }

    if (hasContent) {
      sheet.addRow(cells);
    } else {
      // Emit an empty row to preserve row positioning
      sheet.addRow([]);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Convert an XlsxWorkbook model to an ODS file.
 *
 * @param workbook - Parsed XLSX workbook from readXlsx().
 * @param options  - Conversion options.
 * @returns Promise resolving to a Uint8Array containing the .ods file.
 */
export async function convertXlsxToOds(
  workbook: XlsxWorkbook,
  options: XlsxToOdsOptions = {},
): Promise<Uint8Array> {
  const doc = new OdsDocument();

  if (options.metadata) {
    doc.setMetadata(options.metadata);
  }

  for (const xlSheet of workbook.sheets) {
    convertSheet(xlSheet, options, doc);
  }

  return doc.save();
}
