/**
 * odf-kit — DOCX body reader
 *
 * Walks the w:body element from word/document.xml and converts it into the
 * DocxBodyElement[] model. Also used to parse footnote/endnote/header/footer
 * XML bodies, which share the same paragraph/table structure.
 *
 * Design decisions:
 *  - Only explicitly present XML properties are stored — no style inheritance
 *    resolution. The converter walks the basedOn chain at conversion time.
 *  - Mid-paragraph page breaks split the paragraph:
 *    [DocxParagraph (before), DocxPageBreak, DocxParagraph (after)]
 *  - Field state machine runs on every paragraph — handles both w:hyperlink
 *    elements and complex HYPERLINK fields (w:fldChar / w:instrText).
 *  - w:pict (legacy VML) images are fully handled via v:imagedata + v:shape.
 *  - w:sdt content is always processed; checkboxes get special rendering.
 *  - Tracked changes: w:ins / w:moveTo children are processed;
 *    w:del / w:moveFrom children are skipped.
 *  - Two-pass bookmark resolution: pass 1 collects all bookmark id→name
 *    mappings across the entire body; pass 2 emits bookmark elements using
 *    the pre-built map. This correctly handles cross-paragraph bookmarks.
 *  - Spec reference: ECMA-376 5th edition Part 1, §17 (WordprocessingML).
 *    CT_Body child elements validated against §17.2.2.
 */

import { parseXml } from "../reader/xml-parser.js";
import type { XmlElementNode } from "../reader/xml-parser.js";
import { parseRPr, parsePPr } from "./styles.js";
import type { PPrResult } from "./styles.js";
import type {
  DocxBodyElement,
  DocxParagraph,
  DocxTable,
  DocxTableRow,
  DocxTableCell,
  DocxInlineElement,
  DocxRun,
  DocxHyperlink,
  DocxInlineImage,
  DocxFootnoteReference,
  DocxEndnoteReference,
  DocxBookmark,
  DocxTab,
  DocxLineBreak,
  DocxNote,
  RunProps,
  ParaProps,
  RelationshipMap,
  StyleMap,
  NumberingMap,
} from "./types.js";
import { DEFAULT_RUN_PROPS, DEFAULT_PARA_PROPS } from "./types.js";

// ---------------------------------------------------------------------------
// Context passed through the entire walk
// ---------------------------------------------------------------------------

export interface BodyReaderContext {
  styles: StyleMap;
  numbering: NumberingMap;
  relationships: RelationshipMap;
  /** id → name map built by collectBookmarkNames() before the main walk. */
  bookmarkNames: Map<string, string>;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a body XML string into a DocxBodyElement array.
 *
 * Used for: word/document.xml (rootTag="body"), word/header*.xml (rootTag="hdr"),
 * word/footer*.xml (rootTag="ftr"). Footnote/endnote XML uses readNotes().
 *
 * @param xml     - Raw XML string.
 * @param rootTag - Local name of the container element, e.g. "body", "hdr", "ftr".
 * @param ctx     - Shared reader context.
 */
export function readBody(xml: string, rootTag: string, ctx: BodyReaderContext): DocxBodyElement[] {
  const root = parseXml(xml);
  const container = findContainer(root, rootTag);

  // Pass 1: collect all bookmark id→name mappings in this XML scope
  collectBookmarkNames(container.children, ctx.bookmarkNames);

  // Pass 2: walk and emit body elements
  return walkBodyChildren(container.children, ctx);
}

/**
 * Parse footnote/endnote XML into a Map<id, DocxNote>.
 * Handles both word/footnotes.xml and word/endnotes.xml.
 *
 * @param xml     - Raw XML string.
 * @param noteTag - "footnote" | "endnote".
 * @param ctx     - Shared reader context.
 */
export function readNotes(
  xml: string,
  noteTag: "footnote" | "endnote",
  ctx: BodyReaderContext,
): Map<string, DocxNote> {
  const map = new Map<string, DocxNote>();
  const root = parseXml(xml);

  // Pass 1: collect all bookmark names across all notes in this file
  for (const child of root.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) !== noteTag) continue;
    collectBookmarkNames(child.children, ctx.bookmarkNames);
  }

  // Pass 2: parse each note
  for (const child of root.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) !== noteTag) continue;

    const id = child.attrs["w:id"];
    // Skip separator and continuationSeparator pseudo-notes
    const noteType = child.attrs["w:type"];
    if (!id || noteType === "separator" || noteType === "continuationSeparator") continue;

    const body = walkBodyChildren(child.children, ctx);
    map.set(id, { id, body });
  }

  return map;
}

// ---------------------------------------------------------------------------
// Pass 1: bookmark name collection (recursive over entire XML tree)
// ---------------------------------------------------------------------------

/**
 * Walk children recursively and build a complete id→name map for all
 * w:bookmarkStart elements. This must run before the main body walk so that
 * w:bookmarkEnd elements (which carry only an id) can be resolved to names
 * regardless of paragraph boundaries.
 */
function collectBookmarkNames(
  children: XmlElementNode["children"],
  map: Map<string, string>,
): void {
  for (const child of children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    if (tag === "bookmarkStart") {
      const id = child.attrs["w:id"];
      const name = child.attrs["w:name"];
      if (id && name) map.set(id, name);
    }

    // Recurse into all container elements
    if (child.children.length > 0) {
      collectBookmarkNames(child.children, map);
    }
  }
}

// ---------------------------------------------------------------------------
// Container finder
// ---------------------------------------------------------------------------

function findContainer(root: XmlElementNode, containerTag: string): XmlElementNode {
  if (localName(root.tag) === containerTag) return root;

  for (const child of root.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) === containerTag) return child;
  }

  // Fallback: use root if container not found
  return root;
}

// ---------------------------------------------------------------------------
// Pass 2: body element walker
// ---------------------------------------------------------------------------

/**
 * Walk a list of XML children and emit DocxBodyElement values.
 * Handles all ECMA-376 §17.2.2 CT_Body child elements.
 */
function walkBodyChildren(
  children: XmlElementNode["children"],
  ctx: BodyReaderContext,
): DocxBodyElement[] {
  const elements: DocxBodyElement[] = [];

  for (const child of children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    switch (tag) {
      case "p":
        elements.push(...readParagraph(child, ctx));
        break;

      case "tbl":
        elements.push(readTable(child, ctx));
        break;

      case "sdt":
        elements.push(...readBlockSdt(child, ctx));
        break;

      case "customXml":
        // Block-level custom XML wrapper — unwrap and process children
        elements.push(...walkBodyChildren(child.children, ctx));
        break;

      case "ins":
      case "moveTo":
        // Tracked insertion / move destination — process children
        elements.push(...walkBodyChildren(child.children, ctx));
        break;

      case "bookmarkStart": {
        // Body-level bookmark (cross-paragraph) — emit as a zero-content paragraph
        // wrapping the bookmark marker so it has a place in the body model.
        const id = child.attrs["w:id"];
        const name = id ? (ctx.bookmarkNames.get(id) ?? id) : null;
        if (name) {
          const bookmark: DocxBookmark = { type: "bookmark", name, position: "start" };
          elements.push(makeSingleRunParagraph(bookmark));
        }
        break;
      }

      case "bookmarkEnd": {
        const id = child.attrs["w:id"];
        const name = id ? (ctx.bookmarkNames.get(id) ?? id) : null;
        if (name) {
          const bookmark: DocxBookmark = { type: "bookmark", name, position: "end" };
          elements.push(makeSingleRunParagraph(bookmark));
        }
        break;
      }

      case "altChunk":
        // Imported external content (HTML, RTF, etc.) — cannot convert; warn.
        ctx.warnings.push(
          "w:altChunk (imported external content) is not supported and was skipped",
        );
        break;

      // Intentionally skipped (correct per spec):
      case "del":
      case "moveFrom":
        // Tracked deletion / move source — skip all content
        break;

      case "sectPr":
        // Final section properties — handled by reader.ts, not here
        break;

      case "proofErr":
      case "permStart":
      case "permEnd":
      case "commentRangeStart":
      case "commentRangeEnd":
      case "customXmlDelRangeStart":
      case "customXmlDelRangeEnd":
      case "customXmlInsRangeStart":
      case "customXmlInsRangeEnd":
      case "customXmlMoveFromRangeStart":
      case "customXmlMoveFromRangeEnd":
      case "customXmlMoveToRangeStart":
      case "customXmlMoveToRangeEnd":
      case "moveFromRangeStart":
      case "moveFromRangeEnd":
      case "moveToRangeStart":
      case "moveToRangeEnd":
      case "oMath":
      case "oMathPara":
        // Markup anchors, math, and range markers — safely ignored
        break;

      default:
        // Unknown element — no warning at body level (too noisy for namespace declarations etc.)
        break;
    }
  }

  return elements;
}

/**
 * Wrap a single inline element in a minimal paragraph for body-level placement.
 * Used for body-level bookmarkStart/End which have no paragraph container.
 */
function makeSingleRunParagraph(inline: DocxInlineElement): DocxParagraph {
  return {
    type: "paragraph",
    headingLevel: null,
    styleId: null,
    props: { ...DEFAULT_PARA_PROPS },
    runs: [inline],
  };
}

// ---------------------------------------------------------------------------
// Paragraph
// ---------------------------------------------------------------------------

/**
 * Read a w:p element. Returns one or more DocxBodyElement values because a
 * mid-paragraph page break splits the paragraph into:
 *   [DocxParagraph (before), DocxPageBreak, DocxParagraph (after)]
 * The field state machine runs on every paragraph.
 */
function readParagraph(el: XmlElementNode, ctx: BodyReaderContext): DocxBodyElement[] {
  let styleId: string | null = null;
  let headingLevel: number | null = null;
  let paraProps: ParaProps = { ...DEFAULT_PARA_PROPS };

  // Extract pPr first (always the first child if present)
  for (const child of el.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) === "pPr") {
      const result = readPPr(child, ctx);
      styleId = result.styleId;
      headingLevel = result.headingLevel;
      paraProps = result.props;
      // hasSectPr warning already emitted inside readPPr
      break;
    }
  }

  // Run all inline content through the field state machine
  const allInline = processInlineChildren(el.children, ctx);
  const results = splitOnPageBreaks(allInline, styleId, headingLevel, paraProps);

  // w:pageBreakBefore — spec §17.3.1.23: force a page break before this
  // paragraph. Prepend a DocxPageBreak to the result array.
  if (paraProps.pageBreakBefore && results.length > 0) {
    results.unshift({ type: "pageBreak" });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Paragraph properties (w:pPr in a paragraph — not a style definition)
// ---------------------------------------------------------------------------

interface PPrReadResult {
  styleId: string | null;
  headingLevel: number | null;
  props: ParaProps;
  /** True if this paragraph ends a document section (mid-doc sectPr). */
  hasSectPr: boolean;
}

function readPPr(el: XmlElementNode, ctx: BodyReaderContext): PPrReadResult {
  let styleId: string | null = null;
  let headingLevel: number | null = null;

  for (const child of el.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    if (tag === "pStyle") {
      styleId = child.attrs["w:val"] ?? null;
      if (styleId) {
        const entry = ctx.styles.get(styleId);
        if (entry) headingLevel = entry.headingLevel;
      }
    }

    // w:outlineLvl at paragraph level can override the style heading level
    if (tag === "outlineLvl") {
      const val = Number(child.attrs["w:val"] ?? "0");
      if (val >= 0 && val <= 5) headingLevel = val + 1;
    }
  }

  const pprResult: PPrResult = parsePPr(el);

  if (pprResult.hasSectPr) {
    ctx.warnings.push(
      "Mid-document section break (w:sectPr in w:pPr) detected — " +
        "multi-section page layout changes are not fully supported; " +
        "final section layout is used for the whole document.",
    );
  }

  // Merge pageBreakBefore from parsed props; default false
  const props: ParaProps = {
    alignment: pprResult.props.alignment ?? null,
    pageBreakBefore: pprResult.props.pageBreakBefore ?? false,
    spaceBefore: pprResult.props.spaceBefore ?? null,
    spaceAfter: pprResult.props.spaceAfter ?? null,
    lineHeight: pprResult.props.lineHeight ?? null,
    indentLeft: pprResult.props.indentLeft ?? null,
    indentRight: pprResult.props.indentRight ?? null,
    indentFirstLine: pprResult.props.indentFirstLine ?? null,
    list: pprResult.props.list ?? null,
    borderBottom: pprResult.props.borderBottom ?? null,
  };

  return { styleId, headingLevel, props, hasSectPr: pprResult.hasSectPr };
}

// ---------------------------------------------------------------------------
// Page break splitting
// ---------------------------------------------------------------------------

/** Sentinel used internally to mark page break positions in inline content. */
interface PageBreakMarker {
  type: "pageBreakMarker";
}

function isPageBreakMarker(el: DocxInlineElement | PageBreakMarker): el is PageBreakMarker {
  return el.type === "pageBreakMarker";
}

/**
 * Split inline elements on page break markers.
 * Each segment becomes a DocxParagraph; markers become DocxPageBreak elements.
 * Content before, between, and after breaks is always preserved.
 */
function splitOnPageBreaks(
  allInline: Array<DocxInlineElement | PageBreakMarker>,
  styleId: string | null,
  headingLevel: number | null,
  props: ParaProps,
): DocxBodyElement[] {
  const results: DocxBodyElement[] = [];
  let current: DocxInlineElement[] = [];

  function flushParagraph() {
    results.push({
      type: "paragraph",
      headingLevel,
      styleId,
      props,
      runs: current,
    });
    current = [];
  }

  for (const el of allInline) {
    if (isPageBreakMarker(el)) {
      flushParagraph();
      results.push({ type: "pageBreak" });
    } else {
      current.push(el);
    }
  }

  // Always flush the final segment (handles paragraphs with no page breaks,
  // which is the common case, as well as content after the last break).
  flushParagraph();

  return results;
}

// ---------------------------------------------------------------------------
// Field state machine — runs on every paragraph's inline children
// ---------------------------------------------------------------------------

interface FieldState {
  active: boolean;
  instrText: string;
  displayRuns: DocxRun[];
  /** "before-separate" = collecting instrText; "after-separate" = collecting display */
  phase: "before-separate" | "after-separate";
}

/**
 * Process a list of paragraph-level child elements through the field state
 * machine. Handles both simple w:hyperlink elements and complex
 * w:fldChar/w:instrText field sequences in a single unified pass.
 */
function processInlineChildren(
  children: XmlElementNode["children"],
  ctx: BodyReaderContext,
): Array<DocxInlineElement | PageBreakMarker> {
  const results: Array<DocxInlineElement | PageBreakMarker> = [];
  const field: FieldState = {
    active: false,
    instrText: "",
    displayRuns: [],
    phase: "before-separate",
  };

  for (const child of children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    switch (tag) {
      case "r":
        processRunElement(child, field, ctx, results);
        break;

      case "hyperlink": {
        const link = readHyperlink(child, ctx);
        if (link) results.push(link);
        break;
      }

      case "fldSimple": {
        // Simple field — w:instr attribute contains the field instruction;
        // children are the display runs. Spec ref: ECMA-376 §17.16.19.
        // Handle HYPERLINK and PAGE; for others emit display content.
        const instr = (child.attrs["w:instr"] ?? "").trim();
        const displayRuns: DocxRun[] = [];
        for (const fc of child.children) {
          if (fc.type !== "element") continue;
          if (localName(fc.tag) === "r") {
            const items = readRun(fc, ctx);
            for (const item of items) {
              if (item.type === "run") displayRuns.push(item);
            }
          }
        }
        const resolved = resolveField(
          { active: true, instrText: instr, displayRuns, phase: "after-separate" },
          ctx,
        );
        if (resolved) results.push(resolved);
        break;
      }

      case "smartTag":
        // Semantic annotation wrapper — unwrap and process EG_PContent children.
        // Spec ref: ECMA-376 §17.5.1.9 (CT_SmartTagRun).
        results.push(...processInlineChildren(child.children, ctx));
        break;

      case "dir":
      case "bdo":
        // Bidirectional text direction override wrappers — unwrap.
        // Spec ref: ECMA-376 §17.3.2.8 (dir), §17.3.2.3 (bdo).
        results.push(...processInlineChildren(child.children, ctx));
        break;

      case "ins":
      case "moveTo":
        // Tracked insertion / move destination — process contained runs
        for (const insChild of child.children) {
          if (insChild.type !== "element") continue;
          if (localName(insChild.tag) === "r") {
            processRunElement(insChild, field, ctx, results);
          }
        }
        break;

      case "del":
      case "moveFrom":
        // Tracked deletion / move source — skip
        break;

      case "bookmarkStart": {
        const id = child.attrs["w:id"];
        const name = id ? (ctx.bookmarkNames.get(id) ?? id) : null;
        if (name) results.push({ type: "bookmark", name, position: "start" });
        break;
      }

      case "bookmarkEnd": {
        const id = child.attrs["w:id"];
        const name = id ? (ctx.bookmarkNames.get(id) ?? id) : null;
        if (name) results.push({ type: "bookmark", name, position: "end" });
        break;
      }

      case "sdt":
        results.push(...readInlineSdt(child, ctx));
        break;

      case "customXml":
        // Inline custom XML wrapper — unwrap and process children
        results.push(...processInlineChildren(child.children, ctx));
        break;

      case "proofErr":
      case "permStart":
      case "permEnd":
      case "commentRangeStart":
      case "commentRangeEnd":
        // Markup anchors — safely ignored
        break;

      case "pPr":
        // Already processed before this loop
        break;

      default:
        break;
    }
  }

  // If a field is still active at end of paragraph (malformed DOCX), emit
  // whatever display runs we have collected so content is not lost.
  if (field.active && field.displayRuns.length > 0) {
    ctx.warnings.push("Unclosed complex field at end of paragraph — display text recovered");
    results.push(...field.displayRuns);
  }

  return results;
}

/**
 * Process a single w:r element, routing through the field state machine
 * if a field is currently active.
 */
function processRunElement(
  runEl: XmlElementNode,
  field: FieldState,
  ctx: BodyReaderContext,
  results: Array<DocxInlineElement | PageBreakMarker>,
): void {
  // Check if this run contains a fldChar — if so, handle via state machine
  let hasFldChar = false;
  for (const child of runEl.children) {
    if (child.type === "element" && localName(child.tag) === "fldChar") {
      hasFldChar = true;
      break;
    }
  }

  if (!hasFldChar && !field.active) {
    // Common case: normal run outside any field
    results.push(...readRun(runEl, ctx));
    return;
  }

  // Field state machine processing
  for (const child of runEl.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    if (tag === "fldChar") {
      const fldCharType = child.attrs["w:fldCharType"];
      if (fldCharType === "begin") {
        field.active = true;
        field.instrText = "";
        field.displayRuns = [];
        field.phase = "before-separate";
      } else if (fldCharType === "separate") {
        field.phase = "after-separate";
      } else if (fldCharType === "end") {
        const resolved = resolveField(field, ctx);
        if (resolved) results.push(resolved);
        field.active = false;
        field.instrText = "";
        field.displayRuns = [];
      }
    } else if (tag === "instrText" && field.active && field.phase === "before-separate") {
      for (const n of child.children) {
        if (n.type === "text") field.instrText += n.text;
      }
    } else if (field.active && field.phase === "after-separate") {
      if (tag === "t") {
        let text = "";
        for (const n of child.children) {
          if (n.type === "text") text += n.text;
        }
        if (text) {
          field.displayRuns.push({ type: "run", text, props: { ...DEFAULT_RUN_PROPS } });
        }
      }
    } else if (!field.active) {
      // Normal run content outside a field — process individually
      const syntheticRun: XmlElementNode = {
        type: "element",
        tag: runEl.tag,
        attrs: runEl.attrs,
        children: [child],
      };
      results.push(...readRun(syntheticRun, ctx));
    }
  }
}

/**
 * Resolve a completed complex field into an inline element.
 * Handles: HYPERLINK (external and internal anchor), PAGE (page number).
 */
function resolveField(field: FieldState, ctx: BodyReaderContext): DocxInlineElement | null {
  const instr = field.instrText.trim();

  // HYPERLINK field — two forms:
  //   HYPERLINK "url"           — external URL
  //   HYPERLINK \l "anchor"     — internal anchor (\l flag = "location")
  const isLocalAnchor = /\\l\b/.test(instr);
  const hyperlinkMatch = /HYPERLINK\s+(?:\\l\s+)?"([^"]+)"/.exec(instr);
  if (hyperlinkMatch) {
    const rawUrl = hyperlinkMatch[1];
    const url = isLocalAnchor ? "#" + rawUrl : rawUrl;
    return {
      type: "hyperlink",
      url,
      internal: isLocalAnchor,
      runs: field.displayRuns,
    };
  }

  // PAGE field — current page number placeholder; emit display text as-is
  if (/^\s*PAGE\s*$/.test(instr) && field.displayRuns.length > 0) {
    return field.displayRuns[0];
  }

  // NUMPAGES, NUMCHARS, etc. — emit display text with no special treatment
  if (field.displayRuns.length > 0) {
    ctx.warnings.push(`Unrecognized field instruction: "${instr.slice(0, 80).trim()}"`);
    return field.displayRuns[0];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/**
 * Read a w:r element and return its inline content.
 * Returns an array because a run may produce a page break marker plus
 * surrounding text runs.
 */
function readRun(
  el: XmlElementNode,
  ctx: BodyReaderContext,
): Array<DocxInlineElement | PageBreakMarker> {
  const results: Array<DocxInlineElement | PageBreakMarker> = [];

  // Parse run properties (rPr is always the first child if present)
  let runProps: RunProps = { ...DEFAULT_RUN_PROPS };
  for (const child of el.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) === "rPr") {
      runProps = mergeRunProps(DEFAULT_RUN_PROPS, parseRPr(child));
      break;
    }
  }

  let pendingText = "";

  function flushText() {
    if (pendingText.length > 0) {
      results.push({ type: "run", text: pendingText, props: runProps });
      pendingText = "";
    }
  }

  for (const child of el.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    switch (tag) {
      case "t": {
        for (const n of child.children) {
          if (n.type === "text") pendingText += n.text;
        }
        break;
      }

      case "br": {
        const brType = child.attrs["w:type"];
        if (brType === "page" || brType === "column") {
          flushText();
          results.push({ type: "pageBreakMarker" });
        } else {
          // Default (no type or type="textWrapping") = soft line break
          flushText();
          results.push({ type: "lineBreak" } as DocxLineBreak);
        }
        break;
      }

      case "tab":
        flushText();
        results.push({ type: "tab" } as DocxTab);
        break;

      case "ptab":
        // Absolute position tab — spec §17.3.3.23 (CT_PTab).
        // Treat as a regular tab for conversion purposes.
        flushText();
        results.push({ type: "tab" } as DocxTab);
        break;

      case "drawing":
        flushText();
        {
          const img = readDrawing(child, ctx);
          if (img) results.push(img);
        }
        break;

      case "pict":
        flushText();
        {
          const img = readPict(child, ctx);
          if (img) results.push(img);
        }
        break;

      case "footnoteReference": {
        flushText();
        const id = child.attrs["w:id"];
        if (id) results.push({ type: "footnoteReference", id } as DocxFootnoteReference);
        break;
      }

      case "endnoteReference": {
        flushText();
        const id = child.attrs["w:id"];
        if (id) results.push({ type: "endnoteReference", id } as DocxEndnoteReference);
        break;
      }

      case "sym": {
        // Symbol character — w:char is a Unicode code point in hex
        flushText();
        const charCode = child.attrs["w:char"];
        if (charCode) {
          const text = String.fromCodePoint(parseInt(charCode, 16));
          results.push({ type: "run", text, props: runProps });
        }
        break;
      }

      case "noBreakHyphen":
        pendingText += "\u2011"; // non-breaking hyphen
        break;

      case "softHyphen":
        pendingText += "\u00AD"; // soft hyphen
        break;

      case "cr":
        flushText();
        results.push({ type: "lineBreak" } as DocxLineBreak);
        break;

      case "lastRenderedPageBreak":
        // Word-inserted rendering hint — treat as page break for fidelity
        flushText();
        results.push({ type: "pageBreakMarker" });
        break;

      case "rPr":
      case "fldChar":
      case "instrText":
        // Already handled above or processed by field state machine caller
        break;

      default:
        // Low-level run elements (rPrChange, annotationRef, etc.) — skip silently
        break;
    }
  }

  flushText();
  return results;
}

// ---------------------------------------------------------------------------
// Hyperlink (simple — w:hyperlink element)
// ---------------------------------------------------------------------------

function readHyperlink(el: XmlElementNode, ctx: BodyReaderContext): DocxHyperlink | null {
  const rId = el.attrs["r:id"];
  const anchor = el.attrs["w:anchor"];

  let url = "";
  let internal = false;

  if (rId) {
    const rel = ctx.relationships.get(rId);
    if (rel) {
      url = rel.target;
      internal = !rel.external;
      if (internal) url = "#" + url;
    }
  } else if (anchor) {
    url = "#" + anchor;
    internal = true;
  }

  if (!url) return null;

  const runs: DocxRun[] = [];
  for (const child of el.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);
    if (tag === "r") {
      const items = readRun(child, ctx);
      for (const item of items) {
        if (item.type === "run") runs.push(item);
      }
    }
  }

  return { type: "hyperlink", url, internal, runs };
}

// ---------------------------------------------------------------------------
// Modern drawing images (w:drawing → wp:inline / wp:anchor → a:blip)
// ---------------------------------------------------------------------------

function readDrawing(el: XmlElementNode, ctx: BodyReaderContext): DocxInlineImage | null {
  for (const child of el.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);
    if (tag !== "inline" && tag !== "anchor") continue;

    let widthEmu = 0;
    let heightEmu = 0;
    let rId: string | null = null;
    let altText: string | null = null;

    for (const prop of child.children) {
      if (prop.type !== "element") continue;
      const ptag = localName(prop.tag);

      if (ptag === "extent") {
        widthEmu = Number(prop.attrs["cx"] ?? "0");
        heightEmu = Number(prop.attrs["cy"] ?? "0");
      } else if (ptag === "docPr") {
        altText = prop.attrs["descr"] ?? prop.attrs["title"] ?? null;
      } else if (ptag === "graphic") {
        rId = findBlipRId(prop);
      }
    }

    if (!rId) {
      ctx.warnings.push(
        "w:drawing found but no image relationship could be resolved — image skipped",
      );
      return null;
    }

    return {
      type: "inlineImage",
      rId,
      widthCm: emuToCm(widthEmu),
      heightCm: emuToCm(heightEmu),
      altText,
    };
  }

  return null;
}

/** Walk a:graphic → a:graphicData → pic:pic → pic:blipFill → a:blip to find r:embed. */
function findBlipRId(graphicEl: XmlElementNode): string | null {
  for (const child of graphicEl.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) === "graphicData") {
      return findBlipInGraphicData(child);
    }
  }
  return null;
}

function findBlipInGraphicData(el: XmlElementNode): string | null {
  for (const child of el.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) === "pic") {
      for (const picChild of child.children) {
        if (picChild.type !== "element") continue;
        if (localName(picChild.tag) === "blipFill") {
          for (const bfChild of picChild.children) {
            if (bfChild.type !== "element") continue;
            if (localName(bfChild.tag) === "blip") {
              return bfChild.attrs["r:embed"] ?? null;
            }
          }
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Legacy VML images (w:pict → v:shape → v:imagedata)
// ---------------------------------------------------------------------------

function readPict(el: XmlElementNode, ctx: BodyReaderContext): DocxInlineImage | null {
  for (const child of el.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) !== "shape") continue;

    const style = child.attrs["style"] ?? "";
    const { widthCm, heightCm } = parseVmlStyle(style);

    let rId: string | null = null;
    let altText: string | null = null;

    for (const shapeChild of child.children) {
      if (shapeChild.type !== "element") continue;
      if (localName(shapeChild.tag) === "imagedata") {
        rId = shapeChild.attrs["r:id"] ?? shapeChild.attrs["r:href"] ?? null;
        altText = shapeChild.attrs["o:title"] ?? null;
      }
    }

    if (!rId) {
      ctx.warnings.push("w:pict found but no r:id on v:imagedata — image skipped");
      return null;
    }

    return { type: "inlineImage", rId, widthCm, heightCm, altText };
  }

  return null;
}

/**
 * Parse VML shape style string for width and height.
 * Handles pt, cm, in, px units. Falls back to 2.54cm (1 inch) if unparseable.
 */
function parseVmlStyle(style: string): { widthCm: number; heightCm: number } {
  const DEFAULT_CM = 2.54;
  let widthCm = DEFAULT_CM;
  let heightCm = DEFAULT_CM;

  const widthMatch = /width:\s*([\d.]+)(pt|cm|in|px)/.exec(style);
  const heightMatch = /height:\s*([\d.]+)(pt|cm|in|px)/.exec(style);

  if (widthMatch) widthCm = vmlUnitToCm(Number(widthMatch[1]), widthMatch[2]);
  if (heightMatch) heightCm = vmlUnitToCm(Number(heightMatch[1]), heightMatch[2]);

  return { widthCm, heightCm };
}

function vmlUnitToCm(value: number, unit: string): number {
  switch (unit) {
    case "cm":
      return value;
    case "pt":
      return (value / 72) * 2.54;
    case "in":
      return value * 2.54;
    case "px":
      return (value / 96) * 2.54; // assumes 96dpi
    default:
      return value;
  }
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function readTable(el: XmlElementNode, ctx: BodyReaderContext): DocxTable {
  const columnWidths: number[] = [];
  const rows: DocxTableRow[] = [];

  for (const child of el.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    if (tag === "tblGrid") {
      for (const gc of child.children) {
        if (gc.type !== "element") continue;
        if (localName(gc.tag) === "gridCol") {
          const w = Number(gc.attrs["w:w"] ?? "0");
          columnWidths.push(twipsToCm(w));
        }
      }
    } else if (tag === "tr") {
      rows.push(readTableRow(child, ctx));
    } else if (tag === "sdt") {
      // SDT wrapping one or more rows
      const sdtContent = findSdtContent(child);
      if (sdtContent) {
        for (const sdtChild of sdtContent.children) {
          if (sdtChild.type !== "element") continue;
          if (localName(sdtChild.tag) === "tr") {
            rows.push(readTableRow(sdtChild, ctx));
          }
        }
      }
    }
    // tblPr — table-wide properties handled at converter level via styles
  }

  return { type: "table", columnWidths, rows };
}

function readTableRow(el: XmlElementNode, ctx: BodyReaderContext): DocxTableRow {
  const cells: DocxTableCell[] = [];

  for (const child of el.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    if (tag === "tc") {
      cells.push(readTableCell(child, ctx));
    } else if (tag === "sdt") {
      const sdtContent = findSdtContent(child);
      if (sdtContent) {
        for (const sdtChild of sdtContent.children) {
          if (sdtChild.type !== "element") continue;
          if (localName(sdtChild.tag) === "tc") {
            cells.push(readTableCell(sdtChild, ctx));
          }
        }
      }
    }
    // trPr — row properties (row height, header row flag) — handled at converter level
  }

  return { cells };
}

function readTableCell(el: XmlElementNode, ctx: BodyReaderContext): DocxTableCell {
  let colSpan = 1;
  let vMerge: "restart" | "continue" | null = null;
  let backgroundColor: string | null = null;
  let verticalAlign: "top" | "center" | "bottom" | null = null;

  // Per spec (ECMA-376 §17.4.4 CT_Tc): tcPr is always the first child.
  // Walk el.children once: read tcPr properties, then pass all children to
  // walkBodyChildren which correctly handles tcPr by ignoring unknown tags.
  for (const child of el.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) !== "tcPr") continue;

    for (const prop of child.children) {
      if (prop.type !== "element") continue;
      const ptag = localName(prop.tag);

      if (ptag === "gridSpan") {
        colSpan = Number(prop.attrs["w:val"] ?? "1");
      } else if (ptag === "vMerge") {
        // w:val="restart" = first cell; absent or other value = continuation
        vMerge = prop.attrs["w:val"] === "restart" ? "restart" : "continue";
      } else if (ptag === "shd") {
        const fill = prop.attrs["w:fill"];
        if (fill && fill !== "auto") backgroundColor = fill.toUpperCase();
      } else if (ptag === "vAlign") {
        verticalAlign = normalizeVAlign(prop.attrs["w:val"]);
      }
    }
    break; // tcPr is always first and only appears once
  }

  // Pass all el.children to walkBodyChildren — it handles p, tbl, sdt, etc.
  // and correctly ignores tcPr (not a recognized body element tag).
  const body = walkBodyChildren(el.children, ctx);

  return { colSpan, vMerge, backgroundColor, verticalAlign, body };
}

// ---------------------------------------------------------------------------
// Structured document tags (w:sdt)
// ---------------------------------------------------------------------------

function readBlockSdt(el: XmlElementNode, ctx: BodyReaderContext): DocxBodyElement[] {
  const { checkboxState, controlType } = readSdtPr(el);

  if (checkboxState !== null) {
    const char = checkboxState ? "☑" : "☐";
    const run: DocxRun = { type: "run", text: char, props: { ...DEFAULT_RUN_PROPS } };
    return [
      {
        type: "paragraph",
        headingLevel: null,
        styleId: null,
        props: { ...DEFAULT_PARA_PROPS },
        runs: [run],
      },
    ];
  }

  warnUnknownSdtType(controlType, ctx);

  const content = findSdtContent(el);
  if (!content) return [];
  return walkBodyChildren(content.children, ctx);
}

function readInlineSdt(
  el: XmlElementNode,
  ctx: BodyReaderContext,
): Array<DocxInlineElement | PageBreakMarker> {
  const { checkboxState, controlType } = readSdtPr(el);

  if (checkboxState !== null) {
    const char = checkboxState ? "☑" : "☐";
    return [{ type: "run", text: char, props: { ...DEFAULT_RUN_PROPS } }];
  }

  warnUnknownSdtType(controlType, ctx);

  const content = findSdtContent(el);
  if (!content) return [];
  return processInlineChildren(content.children, ctx);
}

const KNOWN_SDT_TYPES = new Set([
  "richText",
  "text",
  "date",
  "dropDownList",
  "comboBox",
  "picture",
  "docPart",
  "docPartObj",
  "docPartList",
  "citation",
  "bibliography",
  "group",
  "checkbox",
]);

function warnUnknownSdtType(controlType: string | null, ctx: BodyReaderContext): void {
  if (controlType !== null && !KNOWN_SDT_TYPES.has(controlType)) {
    ctx.warnings.push(`w:sdt control type "${controlType}" — content processed as plain text`);
  }
}

interface SdtPrResult {
  checkboxState: boolean | null;
  controlType: string | null;
}

function readSdtPr(el: XmlElementNode): SdtPrResult {
  for (const child of el.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) !== "sdtPr") continue;

    for (const prop of child.children) {
      if (prop.type !== "element") continue;
      const tag = localName(prop.tag);

      if (tag === "checkbox") {
        let checked = false;
        for (const cb of prop.children) {
          if (cb.type !== "element") continue;
          if (localName(cb.tag) === "checked") {
            checked = cb.attrs["w14:val"] !== "0";
          }
        }
        return { checkboxState: checked, controlType: "checkbox" };
      }

      if (KNOWN_SDT_TYPES.has(tag)) {
        return { checkboxState: null, controlType: tag };
      }

      // Unknown control type — report it
      if (
        ![
          "alias",
          "tag",
          "id",
          "lock",
          "placeholder",
          "showingPlcHdr",
          "dataBinding",
          "rPr",
          "color",
          "appearance",
        ].includes(tag)
      ) {
        return { checkboxState: null, controlType: tag };
      }
    }
  }
  return { checkboxState: null, controlType: null };
}

function findSdtContent(el: XmlElementNode): XmlElementNode | null {
  for (const child of el.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) === "sdtContent") return child;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Unit conversions
// ---------------------------------------------------------------------------

/** 1 EMU = 1/914400 inch; 1 inch = 2.54 cm */
function emuToCm(emu: number): number {
  return Number(((emu / 914400) * 2.54).toFixed(4));
}

/** 1 twip = 1/1440 inch; 1 inch = 2.54 cm */
function twipsToCm(twips: number): number {
  return Number(((twips / 1440) * 2.54).toFixed(4));
}

// ---------------------------------------------------------------------------
// Run props merge
// ---------------------------------------------------------------------------

function mergeRunProps(base: RunProps, override: Partial<RunProps>): RunProps {
  const result = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v !== undefined) (result as Record<string, unknown>)[k] = v;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function normalizeVAlign(val: string | undefined): "top" | "center" | "bottom" | null {
  switch (val) {
    case "top":
      return "top";
    case "center":
      return "center";
    case "bottom":
      return "bottom";
    default:
      return null;
  }
}

function localName(tag: string): string {
  const colon = tag.indexOf(":");
  return colon === -1 ? tag : tag.slice(colon + 1);
}
