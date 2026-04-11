/**
 * XLSX reader — parses an .xlsx file into an intermediate XlsxWorkbook model.
 *
 * Parsing pipeline:
 * 1. Unzip the .xlsx bytes with fflate
 * 2. Parse xl/workbook.xml → sheet names and rIds
 * 3. Parse xl/_rels/workbook.xml.rels → rId → file path map
 * 4. Parse xl/sharedStrings.xml → string lookup array
 * 5. Parse xl/styles.xml → style index → date format detection
 * 6. Parse each xl/worksheets/sheet*.xml → rows, cells, merges, freeze
 * 7. Return XlsxWorkbook
 *
 * No external dependencies — uses fflate for ZIP and our existing xml-parser.
 */

import { unzipSync, strFromU8 } from "fflate";
import { parseXml } from "../reader/xml-parser.js";
import type { XmlElementNode } from "../reader/xml-parser.js";

// ─── Intermediate Model ───────────────────────────────────────────────

export interface XlsxWorkbook {
  sheets: XlsxSheet[];
}

export interface XlsxSheet {
  name: string;
  /** rowIndex → row */
  rows: Map<number, XlsxRow>;
  /** "col:row" → merge span for primary cell */
  merges: Map<string, { colSpan: number; rowSpan: number }>;
  /** Set of "col:row" keys that are covered by a merge (non-primary) */
  coveredCells: Set<string>;
  freezeRows?: number;
  freezeColumns?: number;
}

export interface XlsxRow {
  /** colIndex → cell */
  cells: Map<number, XlsxCell>;
}

export interface XlsxCell {
  type: "string" | "number" | "boolean" | "date" | "formula" | "error" | "empty";
  value: string | number | boolean | Date | null;
  /** Original formula string, if cell has a formula. */
  formula?: string;
}

// ─── XML Helpers ──────────────────────────────────────────────────────

/** Strip namespace prefix from tag name: "ss:sheet" → "sheet", "sheet" → "sheet" */
function localName(tag: string): string {
  const colon = tag.indexOf(":");
  return colon === -1 ? tag : tag.slice(colon + 1);
}

/** Find first child whose local name matches, ignoring namespace prefix. */
function findLocal(node: XmlElementNode, local: string): XmlElementNode | undefined {
  for (const child of node.children) {
    if (child.type === "element" && localName(child.tag) === local) return child;
  }
  return undefined;
}

function findLocals(node: XmlElementNode, local: string): XmlElementNode[] {
  return node.children.filter(
    (c): c is XmlElementNode => c.type === "element" && localName(c.tag) === local,
  );
}

/** Get text content of all direct text children. */
function textContent(node: XmlElementNode): string {
  return node.children
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("");
}

// ─── Cell Reference Parsing ───────────────────────────────────────────

/**
 * Parse a cell reference like "A1", "Z3", "AA10" into zero-based col/row indices.
 */
export function parseCellRef(ref: string): { col: number; row: number } {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid cell reference: ${ref}`);
  const colStr = match[1];
  const rowStr = match[2];
  let col = 0;
  for (const ch of colStr) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return { col: col - 1, row: parseInt(rowStr, 10) - 1 };
}

/**
 * Parse a merge range like "A1:C2" into start position and span.
 */
export function parseMergeRef(ref: string): {
  startCol: number;
  startRow: number;
  colSpan: number;
  rowSpan: number;
} {
  const [start, end] = ref.split(":");
  const s = parseCellRef(start);
  const e = parseCellRef(end);
  return {
    startCol: s.col,
    startRow: s.row,
    colSpan: e.col - s.col + 1,
    rowSpan: e.row - s.row + 1,
  };
}

// ─── Date Handling ────────────────────────────────────────────────────

/**
 * Built-in XLSX numFmtId values that represent date or time formats.
 * These are defined by the OOXML spec and always mean date/time regardless
 * of any custom numFmts definitions.
 */
const BUILTIN_DATE_FORMAT_IDS = new Set([
  14,
  15,
  16,
  17, // m/d/yy variants
  18,
  19,
  20,
  21,
  22, // h:mm variants and m/d/yy h:mm
  27,
  28,
  29,
  30,
  31, // CJK date formats
  32,
  33,
  34,
  35,
  36, // CJK time/date formats
  45,
  46,
  47, // mm:ss variants
  50,
  51,
  52,
  53,
  54, // more CJK
  55,
  56,
  57,
  58, // more CJK
]);

/**
 * Returns true if a custom number format code represents a date/time.
 * Strips quoted strings first, then checks for date tokens (y, m, d, h).
 */
export function isDateFormatCode(code: string): boolean {
  // Remove quoted literals like "yyyy" or "mm"
  const stripped = code.replace(/"[^"]*"/g, "").toLowerCase();
  // Remove numeric format tokens that look like date chars but aren't
  if (/^[#0,. %]+$/.test(stripped)) return false;
  return /[ymd]/.test(stripped);
}

/**
 * Returns true if the given style index refers to a date/time format.
 */
export function isDateStyle(
  styleIndex: number,
  cellXfs: number[],
  customFormats: Map<number, string>,
): boolean {
  if (styleIndex < 0 || styleIndex >= cellXfs.length) return false;
  const numFmtId = cellXfs[styleIndex];
  if (BUILTIN_DATE_FORMAT_IDS.has(numFmtId)) return true;
  const custom = customFormats.get(numFmtId);
  return custom !== undefined && isDateFormatCode(custom);
}

/**
 * Convert an XLSX serial date number to a JavaScript Date (UTC).
 *
 * Excel stores dates as days since January 0, 1900, with a deliberate
 * off-by-one bug inherited from Lotus 1-2-3 (Excel incorrectly treats
 * 1900 as a leap year). The correct epoch is December 30, 1899 UTC.
 */
export function xlsxSerialToDate(serial: number): Date {
  // Excel serial 1 = January 1, 1900. Epoch = December 31, 1899.
  // Excel incorrectly treats 1900 as a leap year (serial 60 = Feb 29, 1900,
  // which never existed). For serials > 60, subtract 1 to correct this.
  // serial 1  → no correction → Dec 31 + 1 day  = Jan 1, 1900  ✓
  // serial 25569 → corrected to 25568 → Dec 31 + 25568 days = Jan 1, 1970 ✓
  const corrected = serial > 60 ? serial - 1 : serial;
  const epoch = Date.UTC(1899, 11, 31); // December 31, 1899
  const ms = Math.round(corrected * 24 * 60 * 60 * 1000);
  return new Date(epoch + ms);
}

// ─── Styles Parser ────────────────────────────────────────────────────

interface StylesData {
  /** Array of numFmtId indexed by style (cellXfs) index. */
  cellXfs: number[];
  /** Custom number formats: numFmtId → formatCode. */
  customFormats: Map<number, string>;
}

function parseStyles(xml: string): StylesData {
  const cellXfs: number[] = [];
  const customFormats = new Map<number, string>();

  try {
    const root = parseXml(xml);

    // Custom numFmts
    const numFmtsEl = findLocal(root, "numFmts");
    if (numFmtsEl) {
      for (const fmt of findLocals(numFmtsEl, "numFmt")) {
        const id = parseInt(fmt.attrs["numFmtId"] ?? "-1", 10);
        const code = fmt.attrs["formatCode"] ?? "";
        if (id >= 0) customFormats.set(id, code);
      }
    }

    // cellXfs
    const cellXfsEl = findLocal(root, "cellXfs");
    if (cellXfsEl) {
      for (const xf of findLocals(cellXfsEl, "xf")) {
        const numFmtId = parseInt(xf.attrs["numFmtId"] ?? "0", 10);
        cellXfs.push(numFmtId);
      }
    }
  } catch {
    // Malformed styles.xml — return empty, cells won't be detected as dates
  }

  return { cellXfs, customFormats };
}

// ─── Shared Strings Parser ────────────────────────────────────────────

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];

  try {
    const root = parseXml(xml);

    for (const si of findLocals(root, "si")) {
      // Simple case: <si><t>text</t></si>
      const t = findLocal(si, "t");
      if (t) {
        strings.push(textContent(t));
        continue;
      }

      // Rich text case: <si><r><t>part1</t></r><r><t>part2</t></r></si>
      const parts: string[] = [];
      for (const r of findLocals(si, "r")) {
        const rt = findLocal(r, "t");
        if (rt) parts.push(textContent(rt));
      }
      strings.push(parts.join(""));
    }
  } catch {
    // Malformed sharedStrings.xml — return empty array
  }

  return strings;
}

// ─── Workbook Parser ──────────────────────────────────────────────────

interface SheetRef {
  name: string;
  rId: string;
}

function parseWorkbook(xml: string): SheetRef[] {
  const sheets: SheetRef[] = [];
  try {
    const root = parseXml(xml);
    const sheetsEl = findLocal(root, "sheets");
    if (sheetsEl) {
      for (const sheet of findLocals(sheetsEl, "sheet")) {
        const name = sheet.attrs["name"] ?? "Sheet";
        // rId may be "r:id" or "relationships:id" depending on namespace
        const rId =
          sheet.attrs["r:id"] ??
          Object.entries(sheet.attrs).find(([k]) => k.endsWith(":id"))?.[1] ??
          "";
        if (rId) sheets.push({ name, rId });
      }
    }
  } catch {
    // Malformed workbook.xml
  }
  return sheets;
}

function parseWorkbookRels(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const root = parseXml(xml);
    for (const rel of findLocals(root, "Relationship")) {
      const id = rel.attrs["Id"] ?? "";
      const target = rel.attrs["Target"] ?? "";
      const type = rel.attrs["Type"] ?? "";
      if (id && target && type.includes("worksheet")) {
        // Normalize path: Target may be "worksheets/sheet1.xml" → "xl/worksheets/sheet1.xml"
        const path = target.startsWith("xl/") ? target : `xl/${target}`;
        map.set(id, path);
      }
    }
  } catch {
    // Malformed rels
  }
  return map;
}

// ─── Sheet Parser ─────────────────────────────────────────────────────

function parseSheet(xml: string, sharedStrings: string[], styles: StylesData): XlsxSheet {
  const rows = new Map<number, XlsxRow>();
  const merges = new Map<string, { colSpan: number; rowSpan: number }>();
  const coveredCells = new Set<string>();
  let freezeRows: number | undefined;
  let freezeColumns: number | undefined;

  try {
    const root = parseXml(xml);

    // Freeze pane from sheetView
    const sheetViews = findLocal(root, "sheetViews");
    if (sheetViews) {
      const sheetView = findLocal(sheetViews, "sheetView");
      if (sheetView) {
        const pane = findLocal(sheetView, "pane");
        if (pane && pane.attrs["state"] === "frozen") {
          const ySplit = parseInt(pane.attrs["ySplit"] ?? "0", 10);
          const xSplit = parseInt(pane.attrs["xSplit"] ?? "0", 10);
          if (ySplit > 0) freezeRows = ySplit;
          if (xSplit > 0) freezeColumns = xSplit;
        }
      }
    }

    // Merge cells
    const mergeCellsEl = findLocal(root, "mergeCells");
    if (mergeCellsEl) {
      for (const mc of findLocals(mergeCellsEl, "mergeCell")) {
        const ref = mc.attrs["ref"];
        if (!ref || !ref.includes(":")) continue;
        const m = parseMergeRef(ref);
        merges.set(`${m.startCol}:${m.startRow}`, {
          colSpan: m.colSpan,
          rowSpan: m.rowSpan,
        });
        // Mark covered cells
        for (let r = m.startRow; r < m.startRow + m.rowSpan; r++) {
          for (let c = m.startCol; c < m.startCol + m.colSpan; c++) {
            if (r === m.startRow && c === m.startCol) continue; // skip primary
            coveredCells.add(`${c}:${r}`);
          }
        }
      }
    }

    // Sheet data
    const sheetData = findLocal(root, "sheetData");
    if (!sheetData) return { name: "", rows, merges, coveredCells, freezeRows, freezeColumns };

    for (const rowEl of findLocals(sheetData, "row")) {
      const rowAttr = rowEl.attrs["r"];
      if (!rowAttr) continue;
      const rowIdx = parseInt(rowAttr, 10) - 1;
      const cells = new Map<number, XlsxCell>();

      for (const cellEl of findLocals(rowEl, "c")) {
        const cellRef = cellEl.attrs["r"];
        if (!cellRef) continue;

        let colIdx: number;
        try {
          colIdx = parseCellRef(cellRef).col;
        } catch {
          continue;
        }

        const t = cellEl.attrs["t"] ?? "n"; // type attribute
        const s = parseInt(cellEl.attrs["s"] ?? "-1", 10); // style index

        const vEl = findLocal(cellEl, "v");
        const fEl = findLocal(cellEl, "f");
        const isEl = findLocal(cellEl, "is"); // inline string

        const rawValue = vEl ? textContent(vEl) : null;
        const formulaStr = fEl ? textContent(fEl) : undefined;

        let cell: XlsxCell;

        if (t === "s" && rawValue !== null) {
          // Shared string
          const idx = parseInt(rawValue, 10);
          cell = {
            type: "string",
            value: sharedStrings[idx] ?? "",
            formula: formulaStr,
          };
        } else if (t === "b") {
          // Boolean
          cell = {
            type: "boolean",
            value: rawValue === "1",
            formula: formulaStr,
          };
        } else if (t === "str") {
          // Formula result string
          cell = {
            type: "formula",
            value: rawValue ?? "",
            formula: formulaStr,
          };
        } else if (t === "inlineStr" && isEl) {
          // Inline string
          const tEl = findLocal(isEl, "t");
          cell = {
            type: "string",
            value: tEl ? textContent(tEl) : "",
          };
        } else if (t === "e") {
          // Error
          cell = {
            type: "error",
            value: rawValue ?? "#ERROR!",
            formula: formulaStr,
          };
        } else {
          // Number, date, or formula with numeric result
          if (rawValue === null) {
            cell = { type: "empty", value: null };
          } else {
            const num = parseFloat(rawValue);
            const isDate = s >= 0 && isDateStyle(s, styles.cellXfs, styles.customFormats);

            if (formulaStr) {
              cell = {
                type: "formula",
                value: isDate ? xlsxSerialToDate(num) : num,
                formula: formulaStr,
              };
            } else if (isDate) {
              cell = { type: "date", value: xlsxSerialToDate(num) };
            } else {
              cell = { type: "number", value: num };
            }
          }
        }

        cells.set(colIdx, cell);
      }

      if (cells.size > 0) {
        rows.set(rowIdx, { cells });
      }
    }
  } catch {
    // Malformed sheet XML — return what we have
  }

  return { name: "", rows, merges, coveredCells, freezeRows, freezeColumns };
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Parse an XLSX file into an intermediate XlsxWorkbook model.
 *
 * @param bytes - Raw .xlsx file bytes (Uint8Array or ArrayBuffer).
 * @returns XlsxWorkbook with typed cell values.
 */
export function readXlsx(bytes: Uint8Array | ArrayBuffer): XlsxWorkbook {
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  const files = unzipSync(data);

  const decode = (path: string): string | null => {
    const entry = files[path];
    return entry ? strFromU8(entry) : null;
  };

  // Shared strings (optional)
  const sharedStrings = (() => {
    const xml = decode("xl/sharedStrings.xml");
    return xml ? parseSharedStrings(xml) : [];
  })();

  // Styles (optional but needed for date detection)
  const styles = (() => {
    const xml = decode("xl/styles.xml");
    return xml ? parseStyles(xml) : { cellXfs: [], customFormats: new Map() };
  })();

  // Workbook — sheet list
  const workbookXml = decode("xl/workbook.xml");
  if (!workbookXml) return { sheets: [] };
  const sheetRefs = parseWorkbook(workbookXml);

  // Relationships — rId → file path
  const relsXml = decode("xl/_rels/workbook.xml.rels");
  const relsMap = relsXml ? parseWorkbookRels(relsXml) : new Map<string, string>();

  // Parse each sheet
  const sheets: XlsxSheet[] = [];
  for (const ref of sheetRefs) {
    const path = relsMap.get(ref.rId);
    if (!path) continue;
    const sheetXml = decode(path);
    if (!sheetXml) continue;
    const sheet = parseSheet(sheetXml, sharedStrings, styles);
    sheet.name = ref.name;
    sheets.push(sheet);
  }

  return { sheets };
}
