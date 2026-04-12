/**
 * odf-kit — DOCX → ODT converter
 *
 * Walks a DocxDocument model and drives the OdtDocument API to produce
 * an equivalent ODT document.
 *
 * Design decisions:
 *  - Style inheritance: the basedOn chain is walked at conversion time so
 *    the reader stores only explicitly present properties.
 *  - List grouping: consecutive paragraphs sharing a numId are collected
 *    into a flat array then converted to a nested ListData tree before
 *    being passed to doc.addList().
 *  - Footnotes/endnotes: OdtDocument has no text:note API. References are
 *    rendered as superscript markers ([1], [2], …); all note content is
 *    appended as a "Footnotes" / "Endnotes" section at the document end.
 *  - Headers/footers: only the "default" type is mapped (first/even are
 *    out of scope for the current OdtDocument API).
 *  - Images: bytes and dimensions are taken directly from the DOCX model;
 *    EMU→cm conversion already done by the reader.
 */

import { OdtDocument } from "../odt/document.js";
import { ParagraphBuilder } from "../odt/paragraph-builder.js";
import type {
  TextFormatting,
  ParagraphOptions,
  TableOptions,
  CellOptions,
  ListOptions,
  ListData,
  ListItemData,
  PageLayout,
} from "../odt/types.js";
import type {
  DocxDocument,
  DocxBodyElement,
  DocxParagraph,
  DocxTable,
  DocxTableCell,
  DocxInlineElement,
  DocxRun,
  DocxNote,
  StyleMap,
  StyleEntry,
  RunProps,
  ParaProps,
  NumberingLevel,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DocxToOdtOptions {
  /**
   * Output page format. Default: read from DOCX, fallback "A4".
   * Only used when preservePageLayout is false or DOCX has no page size.
   */
  pageFormat?: "A4" | "letter" | "legal" | "A3" | "A5";

  /** Page orientation. Default: read from DOCX, fallback "portrait". */
  orientation?: "portrait" | "landscape";

  /**
   * Custom Word style name → ODT heading level.
   * Merges with and overrides built-in heading detection.
   */
  styleMap?: Record<string, number>;

  /**
   * Read page layout (size, margins, orientation) from the DOCX.
   * When true (default), explicit pageFormat/orientation options override.
   */
  preservePageLayout?: boolean;

  /** ODT document metadata. Defaults: read from docProps/core.xml. */
  metadata?: {
    title?: string;
    creator?: string;
    description?: string;
  };
}

// ---------------------------------------------------------------------------
// Internal conversion context
// ---------------------------------------------------------------------------

interface ConversionContext {
  doc: DocxDocument;
  options: DocxToOdtOptions;
  warnings: string[];
  /** Running counter for footnote/endnote inline markers. */
  noteCounter: number;
  /** Collected footnote entries for end-of-document rendering. */
  pendingFootnotes: Array<{ marker: string; note: DocxNote }>;
  /** Collected endnote entries for end-of-document rendering. */
  pendingEndnotes: Array<{ marker: string; note: DocxNote }>;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Convert a parsed DocxDocument into an OdtDocument and return its bytes.
 */
export async function convertDocxToOdt(
  docxDoc: DocxDocument,
  options: DocxToOdtOptions,
  warnings: string[],
): Promise<Uint8Array> {
  const ctx: ConversionContext = {
    doc: docxDoc,
    options,
    warnings,
    noteCounter: 0,
    pendingFootnotes: [],
    pendingEndnotes: [],
  };

  const odt = new OdtDocument();

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------
  const meta = options.metadata ?? {};
  const srcMeta = docxDoc.metadata;

  odt.setMetadata({
    title: meta.title ?? srcMeta.title ?? undefined,
    creator: meta.creator ?? srcMeta.creator ?? undefined,
    description: meta.description ?? srcMeta.description ?? undefined,
  });

  // -------------------------------------------------------------------------
  // Page layout
  // -------------------------------------------------------------------------
  const preserveLayout = options.preservePageLayout !== false; // default true
  const layout = docxDoc.pageLayout;
  const pageLayout: PageLayout = {};

  if (preserveLayout && layout.width) pageLayout.width = `${layout.width}cm`;
  if (preserveLayout && layout.height) pageLayout.height = `${layout.height}cm`;
  if (preserveLayout && layout.orientation) pageLayout.orientation = layout.orientation;
  if (preserveLayout && layout.marginTop) pageLayout.marginTop = `${layout.marginTop}cm`;
  if (preserveLayout && layout.marginBottom) pageLayout.marginBottom = `${layout.marginBottom}cm`;
  if (preserveLayout && layout.marginLeft) pageLayout.marginLeft = `${layout.marginLeft}cm`;
  if (preserveLayout && layout.marginRight) pageLayout.marginRight = `${layout.marginRight}cm`;

  // Explicit option overrides
  if (options.orientation) pageLayout.orientation = options.orientation;
  if (options.pageFormat && !pageLayout.width) {
    const dims = PAGE_FORMAT_DIMS[options.pageFormat];
    if (dims) {
      const isLandscape = (options.orientation ?? layout.orientation) === "landscape";
      pageLayout.width = isLandscape ? dims[1] : dims[0];
      pageLayout.height = isLandscape ? dims[0] : dims[1];
    }
  }

  if (Object.keys(pageLayout).length > 0) {
    odt.setPageLayout(pageLayout);
  }

  // -------------------------------------------------------------------------
  // Header and footer — "default" type only
  // -------------------------------------------------------------------------
  const defaultHeader = docxDoc.headers.find((h) => h.headerType === "default");
  const defaultFooter = docxDoc.footers.find((f) => f.headerType === "default");

  if (defaultHeader) {
    const text = extractPlainText(defaultHeader.body);
    if (text) odt.setHeader(text);
  }

  if (defaultFooter) {
    const text = extractPlainText(defaultFooter.body);
    if (text) odt.setFooter(text);
  }

  // -------------------------------------------------------------------------
  // Body
  // -------------------------------------------------------------------------
  const grouped = groupListItems(docxDoc.body, docxDoc);
  convertGroupedElements(grouped, odt, ctx);

  // -------------------------------------------------------------------------
  // Footnotes section (appended at end)
  // -------------------------------------------------------------------------
  if (ctx.pendingFootnotes.length > 0) {
    odt.addParagraph(""); // spacer
    odt.addHeading("Footnotes", 6);
    for (const { marker, note } of ctx.pendingFootnotes) {
      const bodyText = extractPlainText(note.body);
      odt.addParagraph(`${marker} ${bodyText}`);
    }
  }

  if (ctx.pendingEndnotes.length > 0) {
    odt.addParagraph("");
    odt.addHeading("Endnotes", 6);
    for (const { marker, note } of ctx.pendingEndnotes) {
      const bodyText = extractPlainText(note.body);
      odt.addParagraph(`${marker} ${bodyText}`);
    }
  }

  return odt.save();
}

// ---------------------------------------------------------------------------
// Page format dimensions [portrait-width, portrait-height]
// ---------------------------------------------------------------------------

const PAGE_FORMAT_DIMS: Record<string, [string, string]> = {
  A4: ["21cm", "29.7cm"],
  letter: ["21.59cm", "27.94cm"],
  legal: ["21.59cm", "35.56cm"],
  A3: ["29.7cm", "42cm"],
  A5: ["14.8cm", "21cm"],
};

// ---------------------------------------------------------------------------
// List grouping — collect consecutive list paragraphs into ListGroup objects
// ---------------------------------------------------------------------------

interface ListGroup {
  kind: "listGroup";
  numId: string;
  items: ListGroupItem[];
}

interface ListGroupItem {
  level: number;
  runs: DocxInlineElement[];
  isOrdered: boolean;
  numFormat: string;
  start: number;
}

type GroupedElement = DocxBodyElement | ListGroup;

function groupListItems(elements: DocxBodyElement[], docxDoc: DocxDocument): GroupedElement[] {
  const result: GroupedElement[] = [];
  let i = 0;

  while (i < elements.length) {
    const el = elements[i];

    if (el.type === "paragraph" && el.props.list) {
      const numId = el.props.list.numId;
      const group: ListGroup = { kind: "listGroup", numId, items: [] };

      while (i < elements.length) {
        const cur = elements[i];
        if (cur.type !== "paragraph" || !cur.props.list || cur.props.list.numId !== numId) break;

        const level = cur.props.list.level;
        const numEntry = resolveNumberingLevel(numId, level, docxDoc);
        group.items.push({
          level,
          runs: cur.runs,
          isOrdered: numEntry?.isOrdered ?? false,
          numFormat: numEntry?.numFormat ?? "bullet",
          start: numEntry?.start ?? 1,
        });
        i++;
      }

      result.push(group);
    } else {
      result.push(el);
      i++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Body element conversion
// ---------------------------------------------------------------------------

function convertGroupedElements(
  elements: GroupedElement[],
  odt: OdtDocument,
  ctx: ConversionContext,
): void {
  for (const el of elements) {
    if ("kind" in el && el.kind === "listGroup") {
      convertListGroup(el, odt, ctx);
    } else {
      convertBodyElement(el as DocxBodyElement, odt, ctx);
    }
  }
}

function convertBodyElement(el: DocxBodyElement, odt: OdtDocument, ctx: ConversionContext): void {
  switch (el.type) {
    case "pageBreak":
      odt.addPageBreak();
      break;

    case "paragraph":
      convertParagraph(el, odt, ctx);
      break;

    case "table":
      convertTable(el, odt, ctx);
      break;
  }
}

// ---------------------------------------------------------------------------
// Paragraph conversion
// ---------------------------------------------------------------------------

function convertParagraph(para: DocxParagraph, odt: OdtDocument, ctx: ConversionContext): void {
  // Resolve effective heading level
  const headingLevel = resolveHeadingLevel(para, ctx);

  // Resolve paragraph options from style chain + direct props
  const paraOptions = resolveParaOptions(para, ctx);

  // Build content callback
  const content = (p: ParagraphBuilder) => buildParagraphContent(para.runs, p, ctx);

  if (headingLevel !== null) {
    odt.addHeading(content, headingLevel, paraOptions);
  } else {
    odt.addParagraph(content, paraOptions);
  }
}

// ---------------------------------------------------------------------------
// Heading level resolution
// ---------------------------------------------------------------------------

function resolveHeadingLevel(para: DocxParagraph, ctx: ConversionContext): number | null {
  // 1. Caller styleMap option — highest priority
  if (ctx.options.styleMap && para.styleId) {
    const styleName = ctx.doc.styles.get(para.styleId)?.name;
    if (styleName && ctx.options.styleMap[styleName] !== undefined) {
      return ctx.options.styleMap[styleName];
    }
  }

  // 2. Paragraph-level heading from reader (outlineLvl or style name)
  if (para.headingLevel !== null) {
    return para.headingLevel;
  }

  // 3. Style chain — check each style in basedOn chain for heading level
  if (para.styleId) {
    let entry = ctx.doc.styles.get(para.styleId);
    while (entry) {
      if (entry.headingLevel !== null) return entry.headingLevel;
      entry = entry.basedOn ? (ctx.doc.styles.get(entry.basedOn) ?? undefined) : undefined;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Paragraph options resolution (style chain + direct props)
// ---------------------------------------------------------------------------

function resolveParaOptions(
  para: DocxParagraph,
  ctx: ConversionContext,
): ParagraphOptions | undefined {
  // Collect inherited props from style chain (root → leaf order)
  const chain = getStyleChain(para.styleId, ctx.doc.styles);
  const inherited: Partial<ParaProps> = {};

  for (const entry of chain) {
    if (entry.pPr) mergeParaProps(inherited, entry.pPr);
  }

  // Direct paragraph props override inherited
  mergeParaProps(inherited, para.props);

  return paraPropsToOptions(inherited);
}

function paraPropsToOptions(props: Partial<ParaProps>): ParagraphOptions | undefined {
  const opts: ParagraphOptions = {};
  let hasAny = false;

  if (props.alignment) {
    opts.align = props.alignment;
    hasAny = true;
  }
  if (props.spaceBefore != null) {
    opts.spaceBefore = `${props.spaceBefore}cm`;
    hasAny = true;
  }
  if (props.spaceAfter != null) {
    opts.spaceAfter = `${props.spaceAfter}cm`;
    hasAny = true;
  }
  if (props.lineHeight != null) {
    opts.lineHeight = props.lineHeight;
    hasAny = true;
  }
  if (props.indentLeft != null) {
    opts.indentLeft = `${props.indentLeft}cm`;
    hasAny = true;
  }
  if (props.indentFirstLine != null) {
    opts.indentFirst = `${props.indentFirstLine}cm`;
    hasAny = true;
  }
  if (props.borderBottom) {
    const b = props.borderBottom;
    opts.borderBottom = `${b.widthPt}pt ${b.style} #${b.color}`;
    hasAny = true;
  }

  return hasAny ? opts : undefined;
}

// ---------------------------------------------------------------------------
// Inline content builder
// ---------------------------------------------------------------------------

function buildParagraphContent(
  runs: DocxInlineElement[],
  p: ParagraphBuilder,
  ctx: ConversionContext,
): void {
  for (const el of runs) {
    switch (el.type) {
      case "run":
        convertRun(el, p, ctx);
        break;

      case "hyperlink": {
        if (el.runs.length === 0) break;
        // Merge all run text into one link; use formatting of first run
        const text = el.runs.map((r) => r.text).join("");
        const fmt = el.runs[0] ? resolveRunFormatting(el.runs[0], ctx) : undefined;
        p.addLink(text, el.url, fmt ?? undefined);
        break;
      }

      case "inlineImage": {
        const imgEntry = ctx.doc.images.get(el.rId);
        if (!imgEntry) {
          ctx.warnings.push(`Image rId "${el.rId}" not found in image map — skipped`);
          break;
        }
        p.addImage(imgEntry.bytes, {
          width: `${el.widthCm}cm`,
          height: `${el.heightCm}cm`,
          mimeType: imgEntry.mimeType,
          anchor: "as-character",
          alt: el.altText ?? undefined,
        });
        break;
      }

      case "footnoteReference": {
        ctx.noteCounter++;
        const marker = `[${ctx.noteCounter}]`;
        p.addText(marker, { superscript: true });
        const note = ctx.doc.footnotes.get(el.id);
        if (note) ctx.pendingFootnotes.push({ marker, note });
        break;
      }

      case "endnoteReference": {
        ctx.noteCounter++;
        const marker = `[${ctx.noteCounter}]`;
        p.addText(marker, { superscript: true });
        const note = ctx.doc.endnotes.get(el.id);
        if (note) ctx.pendingEndnotes.push({ marker, note });
        break;
      }

      case "bookmark":
        if (el.position === "start") {
          p.addBookmark(el.name);
        }
        // "end" bookmarks have no ODT equivalent at the inline level — skip
        break;

      case "tab":
        p.addTab();
        break;

      case "lineBreak":
        p.addLineBreak();
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Run conversion
// ---------------------------------------------------------------------------

function convertRun(run: DocxRun, p: ParagraphBuilder, ctx: ConversionContext): void {
  if (!run.text) return;
  const fmt = resolveRunFormatting(run, ctx);
  p.addText(run.text, fmt ?? undefined);
}

// ---------------------------------------------------------------------------
// Run formatting resolution (style chain + direct props)
// ---------------------------------------------------------------------------

function resolveRunFormatting(run: DocxRun, ctx: ConversionContext): TextFormatting | null {
  // Collect inherited props from character style chain
  const chain = getStyleChain(run.props.rStyleId, ctx.doc.styles);
  const inherited: Partial<RunProps> = {};

  for (const entry of chain) {
    if (entry.rPr) mergeRunProps(inherited, entry.rPr);
  }

  // Direct run props override inherited
  mergeRunProps(inherited, run.props);

  return runPropsToFormatting(inherited);
}

function runPropsToFormatting(props: Partial<RunProps>): TextFormatting | null {
  const fmt: TextFormatting = {};
  let hasAny = false;

  if (props.bold) {
    fmt.bold = true;
    hasAny = true;
  }
  if (props.italic) {
    fmt.italic = true;
    hasAny = true;
  }
  if (props.underline) {
    fmt.underline = true;
    hasAny = true;
  }
  if (props.strikethrough || props.doubleStrikethrough) {
    fmt.strikethrough = true;
    hasAny = true;
  }
  if (props.superscript) {
    fmt.superscript = true;
    hasAny = true;
  }
  if (props.subscript) {
    fmt.subscript = true;
    hasAny = true;
  }
  if (props.smallCaps) {
    fmt.smallCaps = true;
    hasAny = true;
  }
  if (props.allCaps) {
    fmt.textTransform = "uppercase";
    hasAny = true;
  }

  if (props.color) {
    fmt.color = `#${props.color}`;
    hasAny = true;
  }
  if (props.fontSize != null) {
    fmt.fontSize = props.fontSize; // already in points from reader
    hasAny = true;
  }
  if (props.fontFamily) {
    fmt.fontFamily = props.fontFamily;
    hasAny = true;
  }
  if (props.highlight) {
    const hex = HIGHLIGHT_COLORS[props.highlight.toLowerCase()];
    if (hex) {
      fmt.highlightColor = hex;
      hasAny = true;
    }
  }

  return hasAny ? fmt : null;
}

// DOCX highlight color names → CSS hex values
const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: "#FFFF00",
  green: "#00FF00",
  cyan: "#00FFFF",
  magenta: "#FF00FF",
  red: "#FF0000",
  blue: "#0000FF",
  darkblue: "#00008B",
  darkcyan: "#008B8B",
  darkgreen: "#006400",
  darkmagenta: "#8B008B",
  darkred: "#8B0000",
  darkyellow: "#8B8B00",
  darkgray: "#A9A9A9",
  lightgray: "#D3D3D3",
  black: "#000000",
  white: "#FFFFFF",
};

// ---------------------------------------------------------------------------
// Table conversion
// ---------------------------------------------------------------------------

function convertTable(table: DocxTable, odt: OdtDocument, ctx: ConversionContext): void {
  const tableOptions: TableOptions = {};

  if (table.columnWidths.length > 0) {
    tableOptions.columnWidths = table.columnWidths.map((w) => `${w}cm`);
  }

  // Build rowspan map: track which cells are covered by vertical merges
  // Key: "rowIndex:colIndex", value: remaining rows still covered
  const coveredCells = new Map<string, number>();

  odt.addTable((t) => {
    table.rows.forEach((row, rowIdx) => {
      t.addRow((r) => {
        let colIdx = 0;

        for (const cell of row.cells) {
          // Skip cells covered by a rowspan from a previous row
          while (coveredCells.get(`${rowIdx}:${colIdx}`) ?? 0 > 0) {
            colIdx++;
          }

          const cellOptions = buildCellOptions(cell);

          // Register this cell's rowspan coverage in subsequent rows
          if (cell.vMerge === "restart" && cell.colSpan >= 1) {
            // We need to look ahead to count how many rows this spans
            const rowsSpanned = countRowSpan(table.rows, rowIdx, colIdx);
            if (rowsSpanned > 1) {
              cellOptions.rowSpan = rowsSpanned;
              for (let r2 = rowIdx + 1; r2 < rowIdx + rowsSpanned; r2++) {
                for (let c2 = colIdx; c2 < colIdx + cell.colSpan; c2++) {
                  coveredCells.set(`${r2}:${c2}`, 1);
                }
              }
            }
          }

          // Skip continuation cells (covered by a vMerge restart)
          if (cell.vMerge === "continue") {
            colIdx += cell.colSpan;
            continue;
          }

          const cellContent = buildCellContent(cell, ctx);
          r.addCell(cellContent, cellOptions);
          colIdx += cell.colSpan;
        }
      });
    });
  }, tableOptions);
}

function buildCellOptions(cell: DocxTableCell): CellOptions {
  const opts: CellOptions = {};
  if (cell.colSpan > 1) opts.colSpan = cell.colSpan;
  if (cell.backgroundColor) opts.backgroundColor = `#${cell.backgroundColor}`;
  if (cell.verticalAlign) {
    opts.verticalAlign = cell.verticalAlign === "center" ? "middle" : cell.verticalAlign;
  }
  return opts;
}

function buildCellContent(
  cell: DocxTableCell,
  ctx: ConversionContext,
): (builder: import("../odt/table-builder.js").CellBuilder) => void {
  return (c) => {
    // Collect all text from all paragraphs in the cell
    let first = true;
    for (const bodyEl of cell.body) {
      if (bodyEl.type !== "paragraph") continue;

      // Add a separator between multiple paragraphs in one cell
      if (!first) c.addText(" / ");
      first = false;

      for (const run of bodyEl.runs) {
        if (run.type === "run" && run.text) {
          const fmt = resolveRunFormatting(run, ctx);
          if (fmt) {
            c.addText(run.text, fmt);
          } else {
            c.addText(run.text);
          }
        } else if (run.type === "hyperlink") {
          const text = run.runs.map((r) => r.text).join("");
          if (text) c.addText(text);
        }
        // Other inline types (images, bookmarks etc.) not supported in cells — skip
      }
    }
  };
}

/**
 * Count how many consecutive rows a cell at (rowIdx, colIdx) spans,
 * by looking for vMerge="continue" cells at the same column position
 * in subsequent rows.
 */
function countRowSpan(rows: DocxTable["rows"], startRow: number, colIdx: number): number {
  let count = 1;
  for (let r = startRow + 1; r < rows.length; r++) {
    let col = 0;
    let found = false;
    for (const cell of rows[r].cells) {
      if (col === colIdx && cell.vMerge === "continue") {
        found = true;
        break;
      }
      col += cell.colSpan;
    }
    if (!found) break;
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// List conversion
// ---------------------------------------------------------------------------

function convertListGroup(group: ListGroup, odt: OdtDocument, ctx: ConversionContext): void {
  if (group.items.length === 0) return;

  // Determine list type from the level-0 items' format
  const level0 = group.items.find((i) => i.level === 0);
  const listOptions = buildListOptions(
    level0?.isOrdered ?? false,
    level0?.numFormat ?? "bullet",
    level0?.start ?? 1,
  );

  const listData = buildNestedListData(group.items, 0, 0, ctx);
  listData.options = listOptions;

  odt.addList((builder) => {
    populateListBuilder(builder, listData, ctx);
  }, listOptions);
}

function buildListOptions(isOrdered: boolean, numFormat: string, start: number): ListOptions {
  if (!isOrdered) return { type: "bullet" };

  const fmt = docxNumFormatToOdt(numFormat);
  const opts: ListOptions = { type: "numbered", numFormat: fmt };
  if (start !== 1) opts.startValue = start;
  return opts;
}

function docxNumFormatToOdt(numFormat: string): "1" | "a" | "A" | "i" | "I" {
  switch (numFormat) {
    case "lowerLetter":
      return "a";
    case "upperLetter":
      return "A";
    case "lowerRoman":
      return "i";
    case "upperRoman":
      return "I";
    default:
      return "1"; // decimal, ordinal, etc.
  }
}

/**
 * Build a nested ListData tree from a flat array of ListGroupItems.
 * Processes items starting at `startIdx`, at `currentLevel`, and
 * returns the tree plus the index of the next unconsumed item.
 */
function buildNestedListData(
  items: ListGroupItem[],
  startIdx: number,
  currentLevel: number,
  ctx: ConversionContext,
): ListData {
  const listItems: ListItemData[] = [];
  let i = startIdx;

  while (i < items.length) {
    const item = items[i];

    if (item.level < currentLevel) {
      // Return to parent level — stop processing here
      break;
    }

    if (item.level > currentLevel) {
      // Higher level than expected — attach as nested to last item if possible
      // (handles malformed DOCX where level jumps without a parent)
      if (listItems.length === 0) {
        listItems.push({ runs: [] });
      }
      const nested = buildNestedListData(items, i, item.level, ctx);
      const lastItem = listItems[listItems.length - 1];
      lastItem.nested = nested;
      // Advance past all items consumed at this level
      i = advancePastLevel(items, i, item.level);
      continue;
    }

    // Same level — add this item
    const runs = buildListItemRuns(item.runs, ctx);
    const listItem: ListItemData = { runs };

    // Check if next items are at a deeper level — if so, attach as nested
    const nextIdx = i + 1;
    if (nextIdx < items.length && items[nextIdx].level > currentLevel) {
      const nestedOptions = buildListOptions(
        items[nextIdx].isOrdered,
        items[nextIdx].numFormat,
        items[nextIdx].start,
      );
      const nested = buildNestedListData(items, nextIdx, items[nextIdx].level, ctx);
      nested.options = nestedOptions;
      listItem.nested = nested;
      i = advancePastLevel(items, nextIdx, items[nextIdx].level);
    } else {
      i++;
    }

    listItems.push(listItem);
  }

  return { items: listItems };
}

function advancePastLevel(items: ListGroupItem[], startIdx: number, level: number): number {
  let i = startIdx;
  while (i < items.length && items[i].level >= level) i++;
  return i;
}

function buildListItemRuns(
  inlines: DocxInlineElement[],
  ctx: ConversionContext,
): import("../odt/types.js").TextRun[] {
  const runs: import("../odt/types.js").TextRun[] = [];
  for (const el of inlines) {
    if (el.type === "run" && el.text) {
      const fmt = resolveRunFormatting(el, ctx);
      runs.push({ text: el.text, formatting: fmt ?? undefined });
    } else if (el.type === "hyperlink") {
      const text = el.runs.map((r) => r.text).join("");
      if (text) runs.push({ text, link: el.url });
    } else if (el.type === "tab") {
      runs.push({ text: "", field: "tab" });
    } else if (el.type === "lineBreak") {
      runs.push({ text: "", lineBreak: true });
    }
  }
  return runs;
}

function populateListBuilder(
  builder: import("../odt/list-builder.js").ListBuilder,
  listData: ListData,
  ctx: ConversionContext,
): void {
  for (const item of listData.items) {
    if (item.runs.length > 0) {
      builder.addItem((p) => {
        for (const run of item.runs) {
          if (run.text) p.addText(run.text, run.formatting);
          else if (run.field === "tab") p.addTab();
          else if (run.lineBreak) p.addLineBreak();
        }
      });
    } else {
      builder.addItem("");
    }

    if (item.nested && item.nested.items.length > 0) {
      builder.addNested((sub) => {
        populateListBuilder(sub, item.nested!, ctx);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Style chain utilities
// ---------------------------------------------------------------------------

/**
 * Collect the style chain from the root basedOn style down to the given
 * styleId (root-first order so child overrides parent).
 */
function getStyleChain(styleId: string | null | undefined, styles: StyleMap): StyleEntry[] {
  if (!styleId) return [];

  const chain: StyleEntry[] = [];
  let id: string | null = styleId;
  const visited = new Set<string>();

  while (id && !visited.has(id)) {
    visited.add(id);
    const entry = styles.get(id);
    if (!entry) break;
    chain.unshift(entry); // prepend so chain is root-first
    id = entry.basedOn;
  }

  return chain;
}

function mergeParaProps(base: Partial<ParaProps>, override: Partial<ParaProps>): void {
  if (override.alignment !== undefined) base.alignment = override.alignment;
  if (override.pageBreakBefore !== undefined) base.pageBreakBefore = override.pageBreakBefore;
  if (override.spaceBefore !== undefined) base.spaceBefore = override.spaceBefore;
  if (override.spaceAfter !== undefined) base.spaceAfter = override.spaceAfter;
  if (override.lineHeight !== undefined) base.lineHeight = override.lineHeight;
  if (override.indentLeft !== undefined) base.indentLeft = override.indentLeft;
  if (override.indentRight !== undefined) base.indentRight = override.indentRight;
  if (override.indentFirstLine !== undefined) base.indentFirstLine = override.indentFirstLine;
  if (override.list !== undefined) base.list = override.list;
  if (override.borderBottom !== undefined) base.borderBottom = override.borderBottom;
}

function mergeRunProps(base: Partial<RunProps>, override: Partial<RunProps>): void {
  if (override.bold !== undefined) base.bold = override.bold;
  if (override.italic !== undefined) base.italic = override.italic;
  if (override.underline !== undefined) base.underline = override.underline;
  if (override.strikethrough !== undefined) base.strikethrough = override.strikethrough;
  if (override.doubleStrikethrough !== undefined)
    base.doubleStrikethrough = override.doubleStrikethrough;
  if (override.superscript !== undefined) base.superscript = override.superscript;
  if (override.subscript !== undefined) base.subscript = override.subscript;
  if (override.smallCaps !== undefined) base.smallCaps = override.smallCaps;
  if (override.allCaps !== undefined) base.allCaps = override.allCaps;
  if (override.color !== undefined) base.color = override.color;
  if (override.fontSize !== undefined) base.fontSize = override.fontSize;
  if (override.highlight !== undefined) base.highlight = override.highlight;
  if (override.fontFamily !== undefined) base.fontFamily = override.fontFamily;
  if (override.lang !== undefined) base.lang = override.lang;
  if (override.rStyleId !== undefined) base.rStyleId = override.rStyleId;
}

// ---------------------------------------------------------------------------
// Numbering lookup — resolves a numId + level to a NumberingLevel
// ---------------------------------------------------------------------------

function resolveNumberingLevel(
  numId: string,
  level: number,
  docxDoc: DocxDocument,
): NumberingLevel | null {
  const levels = docxDoc.numbering?.get(numId);
  if (!levels) return null;
  return levels[level] ?? levels[0] ?? null;
}

// ---------------------------------------------------------------------------
// Plain text extraction — used for headers/footers and footnote content
// ---------------------------------------------------------------------------

function extractPlainText(elements: DocxBodyElement[]): string {
  const parts: string[] = [];

  for (const el of elements) {
    if (el.type !== "paragraph") continue;
    for (const run of el.runs) {
      if (run.type === "run") parts.push(run.text);
      else if (run.type === "hyperlink") {
        parts.push(run.runs.map((r) => r.text).join(""));
      }
    }
  }

  return parts.join("").trim();
}
