import { ODF_NS, ODF_VERSION } from "../core/namespaces.js";
import { el, xmlDocument } from "../core/xml.js";
import type { XmlElement } from "../core/xml.js";
import type {
  TextRun,
  TableData,
  CellOptions,
  ListData,
  ListItemData,
  ParagraphOptions,
  TabStop,
  ImageData,
} from "./types.js";
import { normalizeFormatting, formattingKey, resolveColor } from "./formatting.js";
import type { NormalizedFormatting } from "./formatting.js";

// ─── Content Element ──────────────────────────────────────────────────

/** A content element within the document body. */
export interface ContentElement {
  type: "paragraph" | "heading" | "table" | "page-break" | "list" | "image";
  /** Heading level (1–6). Only used when type is "heading". */
  level?: number;
  /**
   * Content as text runs. Used by "paragraph" and "heading".
   */
  runs?: TextRun[];
  /**
   * Table data. Used by "table".
   */
  table?: TableData;
  /**
   * List data. Used by "list".
   */
  list?: ListData;
  /**
   * Paragraph options (tab stops). Used by "paragraph".
   */
  paragraphOptions?: ParagraphOptions;
  /**
   * Image data. Used by "image" (standalone image).
   */
  image?: ImageData;
}

// ─── Cell Style ───────────────────────────────────────────────────────

/** Normalized cell properties ready for ODF style generation. */
interface NormalizedCellStyle {
  backgroundColor?: string;
  borderTop?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderRight?: string;
}

/** Generate a stable key for a NormalizedCellStyle for deduplication. */
function cellStyleKey(cs: NormalizedCellStyle): string {
  const parts: string[] = [];
  if (cs.backgroundColor) parts.push(`bg:${cs.backgroundColor}`);
  if (cs.borderTop) parts.push(`bt:${cs.borderTop}`);
  if (cs.borderBottom) parts.push(`bb:${cs.borderBottom}`);
  if (cs.borderLeft) parts.push(`bl:${cs.borderLeft}`);
  if (cs.borderRight) parts.push(`br:${cs.borderRight}`);
  return parts.join("|");
}

/**
 * Normalize cell options into resolved cell style properties.
 * Merges table-level border defaults with cell-level overrides.
 */
function normalizeCellStyle(
  options: CellOptions | undefined,
  tableBorder: string | undefined,
): NormalizedCellStyle {
  const result: NormalizedCellStyle = {};

  // Start with table-level border default
  const defaultBorder = tableBorder;

  // Cell-level border (overrides table default)
  const cellBorder = options?.border ?? defaultBorder;

  // Individual side overrides
  result.borderTop = options?.borderTop ?? cellBorder;
  result.borderBottom = options?.borderBottom ?? cellBorder;
  result.borderLeft = options?.borderLeft ?? cellBorder;
  result.borderRight = options?.borderRight ?? cellBorder;

  // Background color
  if (options?.backgroundColor) {
    result.backgroundColor = resolveColor(options.backgroundColor);
  }

  // Clean up undefined borders
  if (!result.borderTop) delete result.borderTop;
  if (!result.borderBottom) delete result.borderBottom;
  if (!result.borderLeft) delete result.borderLeft;
  if (!result.borderRight) delete result.borderRight;

  return result;
}

// ─── Content Generation ──────────────────────────────────────────────

/**
 * Generate the content.xml for an ODT document.
 *
 * @param elements - The ordered list of content elements.
 * @param imageMap - Optional map from ImageData objects to their ZIP paths (e.g. "Pictures/image1.png").
 * @returns The serialized content.xml string.
 */
export function generateContent(
  elements: ContentElement[],
  imageMap?: Map<ImageData, string>,
): string {
  // Collect all unique text formatting combinations
  const textStyleMap = buildTextStyleMap(elements);

  // Collect all unique cell style combinations
  const cellStyleMap = buildCellStyleMap(elements);

  // Collect paragraph styles (for tab stops)
  const paraStyleMap = buildParagraphStyleMap(elements);

  // Image counter for draw:name attributes
  let imageCounter = 1;

  const root = el("office:document-content")
    .attr("xmlns:office", ODF_NS.office)
    .attr("xmlns:style", ODF_NS.style)
    .attr("xmlns:text", ODF_NS.text)
    .attr("xmlns:table", ODF_NS.table)
    .attr("xmlns:draw", ODF_NS.draw)
    .attr("xmlns:fo", ODF_NS.fo)
    .attr("xmlns:xlink", ODF_NS.xlink)
    .attr("xmlns:svg", ODF_NS.svg)
    .attr("office:version", ODF_VERSION);

  // Automatic styles
  const autoStyles = el("office:automatic-styles");

  // Text styles (T1, T2, ...)
  for (const [styleName, fmt] of textStyleMap.values()) {
    autoStyles.appendChild(buildTextStyle(styleName, fmt));
  }

  // Paragraph styles with tab stops (P1, P2, ...)
  for (const [styleName, tabStops] of paraStyleMap.values()) {
    autoStyles.appendChild(buildParagraphStyle(styleName, tabStops));
  }

  // Table and column styles
  let tableCounter = 1;
  for (const element of elements) {
    if (element.type === "table" && element.table) {
      const tableName = `Table${tableCounter}`;
      appendTableStyles(autoStyles, tableName, element.table);
      tableCounter++;
    }
  }

  // Cell styles (C1, C2, ...)
  for (const [styleName, cs] of cellStyleMap.values()) {
    autoStyles.appendChild(buildCellStyle(styleName, cs));
  }

  // List styles (L1, L2, ...)
  let listCounter = 1;
  for (const element of elements) {
    if (element.type === "list" && element.list) {
      const listName = `L${listCounter}`;
      autoStyles.appendChild(buildListStyle(listName, element.list));
      listCounter++;
    }
  }

  // Page break style (only if needed)
  const hasPageBreak = elements.some((e) => e.type === "page-break");
  if (hasPageBreak) {
    const pbStyle = el("style:style")
      .attr("style:name", "PageBreak")
      .attr("style:family", "paragraph")
      .attr("style:parent-style-name", "Standard");
    pbStyle.appendChild(el("style:paragraph-properties").attr("fo:break-before", "page"));
    autoStyles.appendChild(pbStyle);
  }

  root.appendChild(autoStyles);

  // Body → Text
  const body = el("office:body");
  const textContainer = el("office:text");

  // Add content elements
  tableCounter = 1;
  listCounter = 1;
  for (const element of elements) {
    switch (element.type) {
      case "paragraph": {
        const styleName = resolveParagraphStyleName(element, paraStyleMap);
        const p = el("text:p").attr("text:style-name", styleName);
        imageCounter = appendRuns(p, element.runs ?? [], textStyleMap, imageMap, imageCounter);
        textContainer.appendChild(p);
        break;
      }
      case "heading": {
        const level = element.level ?? 1;
        const h = el("text:h")
          .attr("text:style-name", `Heading_20_${level}`)
          .attr("text:outline-level", String(level));
        imageCounter = appendRuns(h, element.runs ?? [], textStyleMap, imageMap, imageCounter);
        textContainer.appendChild(h);
        break;
      }
      case "table": {
        if (element.table) {
          const tableName = `Table${tableCounter}`;
          textContainer.appendChild(
            buildTableElement(
              tableName,
              element.table,
              textStyleMap,
              cellStyleMap,
              imageMap,
              imageCounter,
            ),
          );
          // Count images in this table to advance the counter
          imageCounter += countImagesInTable(element.table);
          tableCounter++;
        }
        break;
      }
      case "list": {
        if (element.list) {
          const listName = `L${listCounter}`;
          textContainer.appendChild(
            buildListElement(listName, element.list, textStyleMap, imageMap, imageCounter),
          );
          imageCounter += countImagesInList(element.list);
          listCounter++;
        }
        break;
      }
      case "page-break": {
        textContainer.appendChild(el("text:p").attr("text:style-name", "PageBreak"));
        break;
      }
      case "image": {
        if (element.image && imageMap) {
          const p = el("text:p").attr("text:style-name", "Standard");
          p.appendChild(buildImageFrame(element.image, imageMap, imageCounter));
          imageCounter++;
          textContainer.appendChild(p);
        }
        break;
      }
    }
  }

  body.appendChild(textContainer);
  root.appendChild(body);
  return xmlDocument(root);
}

// ─── Text Style Map ───────────────────────────────────────────────────

/**
 * Build a map from formatting key → [style name, normalized formatting].
 * Scans paragraphs, headings, table cells, list items, AND link formatting.
 */
function buildTextStyleMap(
  elements: ContentElement[],
): Map<string, [string, NormalizedFormatting]> {
  const map = new Map<string, [string, NormalizedFormatting]>();
  let counter = 1;

  function registerRuns(runs: TextRun[]): void {
    for (const run of runs) {
      if (!run.formatting) continue;
      const normalized = normalizeFormatting(run.formatting);
      const key = formattingKey(normalized);
      if (key === "") continue;
      if (!map.has(key)) {
        map.set(key, [`T${counter}`, normalized]);
        counter++;
      }
    }
  }

  function registerListItems(items: ListItemData[]): void {
    for (const item of items) {
      registerRuns(item.runs);
      if (item.nested) {
        registerListItems(item.nested.items);
      }
    }
  }

  for (const element of elements) {
    if (element.runs) {
      registerRuns(element.runs);
    }
    if (element.type === "table" && element.table) {
      for (const row of element.table.rows) {
        for (const cell of row.cells) {
          registerRuns(cell.runs);
        }
      }
    }
    if (element.type === "list" && element.list) {
      registerListItems(element.list.items);
    }
  }

  return map;
}

// ─── Cell Style Map ───────────────────────────────────────────────────

/**
 * Build a map from cell style key → [style name, normalized cell style].
 * Scans all tables for unique cell formatting combinations.
 */
function buildCellStyleMap(elements: ContentElement[]): Map<string, [string, NormalizedCellStyle]> {
  const map = new Map<string, [string, NormalizedCellStyle]>();
  let counter = 1;

  for (const element of elements) {
    if (element.type !== "table" || !element.table) continue;

    const tableBorder = element.table.options?.border;

    for (const row of element.table.rows) {
      for (const cell of row.cells) {
        const normalized = normalizeCellStyle(cell.options, tableBorder);
        const key = cellStyleKey(normalized);
        if (key === "") continue;
        if (!map.has(key)) {
          map.set(key, [`C${counter}`, normalized]);
          counter++;
        }
      }
    }
  }

  return map;
}

/**
 * Append table-level and column-level automatic styles.
 */
function appendTableStyles(autoStyles: XmlElement, tableName: string, table: TableData): void {
  // Table style
  const tableStyle = el("style:style").attr("style:name", tableName).attr("style:family", "table");
  const tableProps = el("style:table-properties").attr("table:align", "margins");
  tableStyle.appendChild(tableProps);
  autoStyles.appendChild(tableStyle);

  // Column styles (if widths are specified)
  const widths = table.options?.columnWidths;
  if (widths) {
    for (let i = 0; i < widths.length; i++) {
      const colLetter = String.fromCharCode(65 + i);
      const colStyle = el("style:style")
        .attr("style:name", `${tableName}.${colLetter}`)
        .attr("style:family", "table-column");
      const colProps = el("style:table-column-properties").attr("style:column-width", widths[i]);
      colStyle.appendChild(colProps);
      autoStyles.appendChild(colStyle);
    }
  }
}

/**
 * Build a cell automatic style element.
 */
function buildCellStyle(styleName: string, cs: NormalizedCellStyle): XmlElement {
  const style = el("style:style").attr("style:name", styleName).attr("style:family", "table-cell");

  const props = el("style:table-cell-properties");

  if (cs.backgroundColor) {
    props.attr("fo:background-color", cs.backgroundColor);
  }
  if (cs.borderTop) {
    props.attr("fo:border-top", cs.borderTop);
  }
  if (cs.borderBottom) {
    props.attr("fo:border-bottom", cs.borderBottom);
  }
  if (cs.borderLeft) {
    props.attr("fo:border-left", cs.borderLeft);
  }
  if (cs.borderRight) {
    props.attr("fo:border-right", cs.borderRight);
  }

  style.appendChild(props);
  return style;
}

// ─── Table Building ──────────────────────────────────────────────────

/**
 * Build a table:table element with all its rows and cells.
 */
function buildTableElement(
  tableName: string,
  table: TableData,
  textStyleMap: Map<string, [string, NormalizedFormatting]>,
  cellStyleMap: Map<string, [string, NormalizedCellStyle]>,
  imageMap?: Map<ImageData, string>,
  imageCounterStart?: number,
): XmlElement {
  let imageCounter = imageCounterStart ?? 1;

  const tableEl = el("table:table")
    .attr("table:name", tableName)
    .attr("table:style-name", tableName);

  // Columns
  const numCols = getColumnCount(table);
  const widths = table.options?.columnWidths;

  if (widths) {
    for (let i = 0; i < Math.max(widths.length, numCols); i++) {
      if (i < widths.length) {
        tableEl.appendChild(
          el("table:table-column").attr(
            "table:style-name",
            `${tableName}.${String.fromCharCode(65 + i)}`,
          ),
        );
      } else {
        tableEl.appendChild(el("table:table-column"));
      }
    }
  } else if (numCols > 0) {
    tableEl.appendChild(
      el("table:table-column").attr("table:number-columns-repeated", String(numCols)),
    );
  }

  // Build coverage map for rowSpan/colSpan
  const covered = buildCoverageMap(table);
  const tableBorder = table.options?.border;

  // Rows
  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    const row = table.rows[rowIdx];
    const rowEl = el("table:table-row");

    let logicalCol = 0;

    for (const cell of row.cells) {
      // Skip positions covered by previous spans
      while (covered.has(`${rowIdx},${logicalCol}`)) {
        rowEl.appendChild(el("table:covered-table-cell"));
        logicalCol++;
      }

      // Empty cells
      if (cell.runs.length === 0 && !cell.options) {
        rowEl.appendChild(
          el("table:table-cell").appendChild(el("text:p").attr("text:style-name", "Standard")),
        );
        logicalCol++;
        continue;
      }

      // Real cell
      const cellEl = el("table:table-cell").attr("office:value-type", "string");

      // Cell style
      const normalizedCell = normalizeCellStyle(cell.options, tableBorder);
      const csKey = cellStyleKey(normalizedCell);
      if (csKey !== "") {
        const entry = cellStyleMap.get(csKey);
        cellEl.attr("table:style-name", entry![0]);
      }

      // Spanning
      const colSpan = cell.options?.colSpan ?? 1;
      if (colSpan > 1) {
        cellEl.attr("table:number-columns-spanned", String(colSpan));
      }

      const rowSpan = cell.options?.rowSpan ?? 1;
      if (rowSpan > 1) {
        cellEl.attr("table:number-rows-spanned", String(rowSpan));
      }

      // Cell content paragraph
      const p = el("text:p").attr("text:style-name", "Standard");
      imageCounter = appendRuns(p, cell.runs, textStyleMap, imageMap, imageCounter);
      cellEl.appendChild(p);

      rowEl.appendChild(cellEl);
      logicalCol += colSpan;

      // Covered cells after a colSpan
      for (let s = 1; s < colSpan; s++) {
        rowEl.appendChild(el("table:covered-table-cell"));
      }
    }

    tableEl.appendChild(rowEl);
  }

  return tableEl;
}

/**
 * Determine the number of columns in a table by examining all rows,
 * accounting for colSpan.
 */
function getColumnCount(table: TableData): number {
  let maxCols = 0;
  for (const row of table.rows) {
    let cols = 0;
    for (const cell of row.cells) {
      cols += cell.options?.colSpan ?? 1;
    }
    maxCols = Math.max(maxCols, cols);
  }
  if (table.options?.columnWidths) {
    maxCols = Math.max(maxCols, table.options.columnWidths.length);
  }
  return maxCols;
}

/**
 * Build a set of covered cell positions from rowSpan/colSpan.
 */
function buildCoverageMap(table: TableData): Set<string> {
  const covered = new Set<string>();

  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    const row = table.rows[rowIdx];
    let colIdx = 0;

    for (const cell of row.cells) {
      // Skip already-covered positions
      while (covered.has(`${rowIdx},${colIdx}`)) {
        colIdx++;
      }

      const colSpan = cell.options?.colSpan ?? 1;
      const rowSpan = cell.options?.rowSpan ?? 1;

      // Mark covered positions (excluding the cell itself)
      for (let r = 0; r < rowSpan; r++) {
        for (let c = 0; c < colSpan; c++) {
          if (r === 0 && c === 0) continue;
          covered.add(`${rowIdx + r},${colIdx + c}`);
        }
      }

      colIdx += colSpan;
    }
  }

  return covered;
}

// ─── Text Runs & Styles (shared by paragraphs, table cells, lists) ────

/**
 * Append text runs to a parent element (paragraph, heading, or cell paragraph).
 * Returns the updated image counter.
 */
function appendRuns(
  parent: XmlElement,
  runs: TextRun[],
  styleMap: Map<string, [string, NormalizedFormatting]>,
  imageMap?: Map<ImageData, string>,
  imageCounter: number = 1,
): number {
  for (const run of runs) {
    // Tab element
    if (run.field === "tab") {
      parent.appendChild(el("text:tab"));
      continue;
    }

    // Page number field
    if (run.field === "page-number") {
      const pageNum = el("text:page-number").attr("text:select-page", "current").text(run.text);

      if (run.formatting) {
        const normalized = normalizeFormatting(run.formatting);
        const key = formattingKey(normalized);
        if (key !== "") {
          const entry = styleMap.get(key)!;
          const span = el("text:span").attr("text:style-name", entry[0]);
          span.appendChild(pageNum);
          parent.appendChild(span);
          continue;
        }
      }
      parent.appendChild(pageNum);
      continue;
    }

    // Bookmark
    if (run.bookmark) {
      parent.appendChild(el("text:bookmark").attr("text:name", run.bookmark));
      // If there's also text, render it after the bookmark
      if (run.text) {
        parent.text(run.text);
      }
      continue;
    }

    // Image
    if (run.image) {
      if (imageMap) {
        parent.appendChild(buildImageFrame(run.image, imageMap, imageCounter));
        imageCounter++;
      }
      continue;
    }

    // Hyperlink
    if (run.link) {
      const linkEl = el("text:a").attr("xlink:type", "simple").attr("xlink:href", run.link);

      if (run.formatting) {
        const normalized = normalizeFormatting(run.formatting);
        const key = formattingKey(normalized);
        if (key !== "") {
          const entry = styleMap.get(key)!;
          linkEl.appendChild(el("text:span").attr("text:style-name", entry[0]).text(run.text));
        } else {
          linkEl.text(run.text);
        }
      } else {
        linkEl.text(run.text);
      }

      parent.appendChild(linkEl);
      continue;
    }

    // Plain or formatted text
    if (!run.formatting) {
      parent.text(run.text);
    } else {
      const normalized = normalizeFormatting(run.formatting);
      const key = formattingKey(normalized);

      if (key === "") {
        parent.text(run.text);
      } else {
        const entry = styleMap.get(key)!;
        const styleName = entry[0];
        parent.appendChild(el("text:span").attr("text:style-name", styleName).text(run.text));
      }
    }
  }

  return imageCounter;
}

/**
 * Build an ODF automatic style element for text formatting.
 */
function buildTextStyle(styleName: string, fmt: NormalizedFormatting): XmlElement {
  const style = el("style:style").attr("style:name", styleName).attr("style:family", "text");

  const props = el("style:text-properties");

  if (fmt.fontWeight) {
    props.attr("fo:font-weight", fmt.fontWeight);
  }
  if (fmt.fontStyle) {
    props.attr("fo:font-style", fmt.fontStyle);
  }
  if (fmt.fontSize) {
    props.attr("fo:font-size", fmt.fontSize);
  }
  if (fmt.fontFamily) {
    props.attr("style:font-name", fmt.fontFamily);
    props.attr("fo:font-family", fmt.fontFamily);
  }
  if (fmt.color) {
    props.attr("fo:color", fmt.color);
  }
  if (fmt.underline) {
    props.attr("style:text-underline-style", "solid");
    props.attr("style:text-underline-width", "auto");
    props.attr("style:text-underline-color", "font-color");
  }
  if (fmt.strikethrough) {
    props.attr("style:text-line-through-style", "solid");
  }
  if (fmt.superscript) {
    props.attr("style:text-position", "super 58%");
  }
  if (fmt.subscript) {
    props.attr("style:text-position", "sub 58%");
  }
  if (fmt.highlightColor) {
    props.attr("fo:background-color", fmt.highlightColor);
  }

  style.appendChild(props);
  return style;
}

// ─── Paragraph Styles (tab stops) ─────────────────────────────────────

/**
 * Generate a key for a set of tab stops.
 */
function tabStopsKey(tabStops: TabStop[]): string {
  return tabStops.map((ts) => `${ts.position}:${ts.type ?? "left"}`).join("|");
}

/**
 * Build a map of unique paragraph styles needed for tab stops.
 */
function buildParagraphStyleMap(elements: ContentElement[]): Map<string, [string, TabStop[]]> {
  const map = new Map<string, [string, TabStop[]]>();
  let counter = 1;

  for (const element of elements) {
    if (element.paragraphOptions?.tabStops && element.paragraphOptions.tabStops.length > 0) {
      const key = tabStopsKey(element.paragraphOptions.tabStops);
      if (!map.has(key)) {
        map.set(key, [`P${counter}`, element.paragraphOptions.tabStops]);
        counter++;
      }
    }
  }

  return map;
}

/**
 * Build a paragraph style with tab stops.
 */
function buildParagraphStyle(styleName: string, tabStops: TabStop[]): XmlElement {
  const style = el("style:style")
    .attr("style:name", styleName)
    .attr("style:family", "paragraph")
    .attr("style:parent-style-name", "Standard");

  const paraProps = el("style:paragraph-properties");

  const tabStopsEl = el("style:tab-stops");

  for (const ts of tabStops) {
    const tabStop = el("style:tab-stop")
      .attr("style:position", ts.position)
      .attr("style:type", ts.type ?? "left");
    tabStopsEl.appendChild(tabStop);
  }

  paraProps.appendChild(tabStopsEl);
  style.appendChild(paraProps);
  return style;
}

/**
 * Returns a custom style name (P1, P2) if tab stops are present, otherwise "Standard".
 */
function resolveParagraphStyleName(
  element: ContentElement,
  paraStyleMap: Map<string, [string, TabStop[]]>,
): string {
  if (element.paragraphOptions?.tabStops && element.paragraphOptions.tabStops.length > 0) {
    const key = tabStopsKey(element.paragraphOptions.tabStops);
    const entry = paraStyleMap.get(key);
    return entry ? entry[0] : "Standard";
  }
  return "Standard";
}

// ─── List Building ───────────────────────────────────────────────────

/** Bullet characters for each nesting level. */
const BULLET_CHARS = ["•", "◦", "▪", "▸", "–", "·"];

/**
 * Build a list style definition for automatic-styles.
 */
function buildListStyle(styleName: string, list: ListData): XmlElement {
  const isBullet = (list.options?.type ?? "bullet") === "bullet";
  const listStyle = el("text:list-style").attr("style:name", styleName);

  // Generate styles for up to 6 nesting levels
  const maxLevel = 6;
  for (let level = 1; level <= maxLevel; level++) {
    const indent = level * 0.635;
    const marginLeft = `${(indent * 2).toFixed(3)}cm`;
    const textIndent = `-${indent.toFixed(3)}cm`;

    if (isBullet) {
      const bulletEl = el("text:list-level-style-bullet")
        .attr("text:level", String(level))
        .attr("text:bullet-char", BULLET_CHARS[(level - 1) % BULLET_CHARS.length]);

      const levelProps = el("style:list-level-properties").attr(
        "text:list-level-position-and-space-mode",
        "label-alignment",
      );

      levelProps.appendChild(
        el("style:list-level-label-alignment")
          .attr("text:label-followed-by", "listtab")
          .attr("text:list-tab-stop-position", marginLeft)
          .attr("fo:text-indent", textIndent)
          .attr("fo:margin-left", marginLeft),
      );

      bulletEl.appendChild(levelProps);
      listStyle.appendChild(bulletEl);
    } else {
      const numberEl = el("text:list-level-style-number")
        .attr("text:level", String(level))
        .attr("style:num-suffix", ".")
        .attr("style:num-format", "1");

      const levelProps = el("style:list-level-properties").attr(
        "text:list-level-position-and-space-mode",
        "label-alignment",
      );

      levelProps.appendChild(
        el("style:list-level-label-alignment")
          .attr("text:label-followed-by", "listtab")
          .attr("text:list-tab-stop-position", marginLeft)
          .attr("fo:text-indent", textIndent)
          .attr("fo:margin-left", marginLeft),
      );

      numberEl.appendChild(levelProps);
      listStyle.appendChild(numberEl);
    }
  }

  return listStyle;
}

/**
 * Build a text:list element for the document body.
 */
function buildListElement(
  styleName: string,
  list: ListData,
  textStyleMap: Map<string, [string, NormalizedFormatting]>,
  imageMap?: Map<ImageData, string>,
  imageCounterStart?: number,
): XmlElement {
  const isBullet = (list.options?.type ?? "bullet") === "bullet";
  const paraStyleName = isBullet ? "List_20_Bullet" : "List_20_Number";
  let imageCounter = imageCounterStart ?? 1;

  const listEl = el("text:list").attr("text:style-name", styleName);

  function appendItems(parentEl: XmlElement, items: ListItemData[]): void {
    for (const item of items) {
      const itemEl = el("text:list-item");

      // Paragraph with the item text
      const p = el("text:p").attr("text:style-name", paraStyleName);
      imageCounter = appendRuns(p, item.runs, textStyleMap, imageMap, imageCounter);
      itemEl.appendChild(p);

      // Nested sub-list (goes inside the same list-item)
      if (item.nested) {
        const subList = el("text:list");
        appendItems(subList, item.nested.items);
        itemEl.appendChild(subList);
      }

      parentEl.appendChild(itemEl);
    }
  }

  appendItems(listEl, list.items);
  return listEl;
}

// ─── Image Building ──────────────────────────────────────────────────

/**
 * Build a draw:frame element containing a draw:image for an embedded image.
 */
function buildImageFrame(
  image: ImageData,
  imageMap: Map<ImageData, string>,
  imageCounter: number,
): XmlElement {
  const imagePath = imageMap.get(image);
  if (!imagePath) {
    throw new Error("Image not found in imageMap — this is an internal error.");
  }

  const frame = el("draw:frame")
    .attr("draw:name", `Image${imageCounter}`)
    .attr("text:anchor-type", image.anchor)
    .attr("svg:width", image.width)
    .attr("svg:height", image.height);

  const drawImage = el("draw:image")
    .attr("xlink:href", imagePath)
    .attr("xlink:type", "simple")
    .attr("xlink:show", "embed")
    .attr("xlink:actuate", "onLoad");

  frame.appendChild(drawImage);
  return frame;
}

/**
 * Count images in runs.
 */
function countImagesInRuns(runs: TextRun[]): number {
  let count = 0;
  for (const run of runs) {
    if (run.image) count++;
  }
  return count;
}

/**
 * Count images in a table.
 */
function countImagesInTable(table: TableData): number {
  let count = 0;
  for (const row of table.rows) {
    for (const cell of row.cells) {
      count += countImagesInRuns(cell.runs);
    }
  }
  return count;
}

/**
 * Count images in a list (recursive).
 */
function countImagesInList(list: ListData): number {
  let count = 0;
  function countItems(items: ListItemData[]): void {
    for (const item of items) {
      count += countImagesInRuns(item.runs);
      if (item.nested) countItems(item.nested.items);
    }
  }
  countItems(list.items);
  return count;
}

// ─── Header/Footer Builder (used by document.ts for styles.xml) ───────

/**
 * Build a paragraph element and associated text styles for header/footer content.
 *
 * @param runs - Text runs (from HeaderFooterBuilder or parsed string).
 * @param styleName - The paragraph style name ("Header" or "Footer").
 * @param stylePrefix - Prefix for automatic text styles ("HF" → HF1, HF2, ...).
 * @returns The paragraph element and any text styles needed.
 */
export function buildHeaderFooterContent(
  runs: TextRun[],
  styleName: string,
  stylePrefix: string,
): { paragraph: XmlElement; styles: XmlElement[] } {
  // Build style map for these runs
  const styleMap = new Map<string, [string, NormalizedFormatting]>();
  let counter = 1;

  for (const run of runs) {
    if (!run.formatting) continue;
    const normalized = normalizeFormatting(run.formatting);
    const key = formattingKey(normalized);
    if (key === "" || styleMap.has(key)) continue;
    styleMap.set(key, [`${stylePrefix}${counter}`, normalized]);
    counter++;
  }

  // Build the paragraph
  const p = el("text:p").attr("text:style-name", styleName);
  appendRuns(p, runs, styleMap);

  // Build the style elements
  const styles: XmlElement[] = [];
  for (const [name, fmt] of styleMap.values()) {
    styles.push(buildTextStyle(name, fmt));
  }

  return { paragraph: p, styles };
}
