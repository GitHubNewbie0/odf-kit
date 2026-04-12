/**
 * odf-kit — DOCX styles parser
 *
 * Parses word/styles.xml into a StyleMap keyed by styleId.
 *
 * Heading detection priority (per plan):
 *   1. Style name matches "heading N" (case-insensitive) — canonical
 *   2. w:outlineLvl in the style's w:pPr — fallback for custom heading styles
 *   3. Caller-supplied styleMap option — overrides at conversion time
 *
 * Style inheritance (w:basedOn) is recorded but not resolved here — the
 * converter walks the chain at conversion time so it can merge with
 * document-level overrides cleanly.
 */

import { parseXml } from "../reader/xml-parser.js";
import type { XmlElementNode } from "../reader/xml-parser.js";
import type { StyleMap, StyleEntry, RunProps, ParaProps } from "./types.js";
import { DEFAULT_RUN_PROPS, DEFAULT_PARA_PROPS } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse word/styles.xml into a StyleMap.
 *
 * @param xml - Raw XML content of word/styles.xml.
 * @returns Map from styleId → StyleEntry.
 */
export function parseStyles(xml: string): StyleMap {
  const map: StyleMap = new Map();
  const root = parseXml(xml);

  for (const child of root.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) !== "style") continue;

    const entry = parseStyleEntry(child);
    if (entry) map.set(entry.styleId, entry);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Style entry
// ---------------------------------------------------------------------------

function parseStyleEntry(el: XmlElementNode): StyleEntry | null {
  const styleId = el.attrs["w:styleId"];
  if (!styleId) return null;

  const rawType = el.attrs["w:type"] ?? "paragraph";
  const type = normalizeStyleType(rawType);

  let name = "";
  let basedOn: string | null = null;
  let rPr: Partial<RunProps> | null = null;
  let pPr: Partial<ParaProps> | null = null;
  let outlineLvl: number | null = null;

  for (const child of el.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    switch (tag) {
      case "name":
        name = child.attrs["w:val"] ?? "";
        break;
      case "basedOn":
        basedOn = child.attrs["w:val"] ?? null;
        break;
      case "rPr":
        rPr = parseRPr(child);
        break;
      case "pPr": {
        const result = parsePPr(child);
        pPr = result.props;
        if (result.outlineLvl !== null) outlineLvl = result.outlineLvl;
        break;
      }
    }
  }

  // Heading level resolution:
  // 1. Style name "heading N" (canonical — set by Word for built-in heading styles)
  // 2. w:outlineLvl in pPr (fallback for custom styles that declare an outline level)
  const headingLevel = resolveHeadingLevel(name, outlineLvl);

  return { styleId, name, type, headingLevel, basedOn, rPr, pPr };
}

// ---------------------------------------------------------------------------
// Run properties (w:rPr)
// ---------------------------------------------------------------------------

/**
 * Parse a w:rPr element into a partial RunProps.
 * Only properties explicitly present in the XML are set — unset properties
 * are left undefined so that style inheritance can be applied by the caller.
 */
export function parseRPr(el: XmlElementNode): Partial<RunProps> {
  const props: Partial<RunProps> = {};

  for (const child of el.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    switch (tag) {
      case "b":
        props.bold = !isFalse(child.attrs["w:val"]);
        break;
      case "i":
        props.italic = !isFalse(child.attrs["w:val"]);
        break;
      case "u":
        // w:val="none" means no underline; any other value (single, double, etc.) = underline
        props.underline = (child.attrs["w:val"] ?? "single") !== "none";
        break;
      case "strike":
        props.strikethrough = !isFalse(child.attrs["w:val"]);
        break;
      case "dstrike":
        props.doubleStrikethrough = !isFalse(child.attrs["w:val"]);
        break;
      case "vertAlign":
        if (child.attrs["w:val"] === "superscript") props.superscript = true;
        if (child.attrs["w:val"] === "subscript") props.subscript = true;
        break;
      case "smallCaps":
        props.smallCaps = !isFalse(child.attrs["w:val"]);
        break;
      case "caps":
        props.allCaps = !isFalse(child.attrs["w:val"]);
        break;
      case "color":
        // "auto" means default/inherited — treat as null
        props.color = normalizeColor(child.attrs["w:val"]);
        break;
      case "sz":
        // w:sz is in half-points; divide by 2 for points
        props.fontSize = halfPointsToPoints(child.attrs["w:val"]);
        break;
      case "highlight":
        props.highlight = child.attrs["w:val"] ?? null;
        break;
      case "rFonts":
        // w:ascii is the Latin font; fall back to w:hAnsi
        props.fontFamily = child.attrs["w:ascii"] ?? child.attrs["w:hAnsi"] ?? null;
        break;
      case "lang":
        props.lang = child.attrs["w:val"] ?? null;
        break;
      case "rStyle":
        props.rStyleId = child.attrs["w:val"] ?? null;
        break;
    }
  }

  return props;
}

// ---------------------------------------------------------------------------
// Paragraph properties (w:pPr)
// ---------------------------------------------------------------------------

interface PPrResult {
  props: Partial<ParaProps>;
  outlineLvl: number | null;
  /** True if this pPr contains a w:sectPr (mid-document section break). */
  hasSectPr: boolean;
}

/**
 * Parse a w:pPr element into a partial ParaProps plus any outline level.
 * Only properties explicitly present in the XML are set.
 *
 * Spec ref: ECMA-376 §17.3.1.26 (CT_PPr), §17.3.1.25 (CT_PPrBase).
 */
export function parsePPr(el: XmlElementNode): PPrResult {
  const props: Partial<ParaProps> = {};
  let outlineLvl: number | null = null;
  let hasSectPr = false;

  for (const child of el.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    switch (tag) {
      case "jc":
        props.alignment = normalizeAlignment(child.attrs["w:val"]);
        break;

      case "spacing": {
        // w:before / w:after are in twips (1/20 pt); w:line is in twips too
        const before = child.attrs["w:before"];
        const after = child.attrs["w:after"];
        const line = child.attrs["w:line"];
        const lineRule = child.attrs["w:lineRule"];
        if (before !== undefined) props.spaceBefore = twipsToCm(Number(before));
        if (after !== undefined) props.spaceAfter = twipsToCm(Number(after));
        if (line !== undefined) {
          // lineRule "auto" = multiple of 240 twips (single=240, double=480)
          // lineRule "exact" or "atLeast" = fixed pt value — treat as multiplier vs 12pt baseline
          if (!lineRule || lineRule === "auto") {
            props.lineHeight = Number(line) / 240;
          } else {
            // Fixed line height in twips — store as multiplier relative to 12pt (240 twips)
            props.lineHeight = Number(line) / 240;
          }
        }
        break;
      }

      case "ind": {
        const left = child.attrs["w:left"];
        const right = child.attrs["w:right"];
        const firstLine = child.attrs["w:firstLine"];
        const hanging = child.attrs["w:hanging"];
        if (left !== undefined) props.indentLeft = twipsToCm(Number(left));
        if (right !== undefined) props.indentRight = twipsToCm(Number(right));
        // w:firstLine and w:hanging are mutually exclusive; hanging is negative indent
        if (firstLine !== undefined) props.indentFirstLine = twipsToCm(Number(firstLine));
        else if (hanging !== undefined) props.indentFirstLine = -twipsToCm(Number(hanging));
        break;
      }

      case "pageBreakBefore":
        // CT_OnOff — absence means false; presence (even with no val) means true
        props.pageBreakBefore = !isFalse(child.attrs["w:val"]);
        break;

      case "numPr":
        props.list = parseNumPr(child);
        break;

      case "pBdr":
        props.borderBottom = parsePBdrBottom(child);
        break;

      case "outlineLvl":
        // w:val is 0-based; heading level is 1-based
        outlineLvl = Number(child.attrs["w:val"] ?? "0") + 1;
        break;

      case "sectPr":
        // Mid-document section break — page layout change between sections.
        // Full multi-section support is out of scope; caller will warn.
        // Spec ref: ECMA-376 §17.6.17 (CT_SectPr inside CT_PPr).
        hasSectPr = true;
        break;
    }
  }

  return { props, outlineLvl, hasSectPr };
}

// ---------------------------------------------------------------------------
// List membership (w:numPr)
// ---------------------------------------------------------------------------

function parseNumPr(el: XmlElementNode): import("./types.js").ParaListProps | null {
  let numId: string | null = null;
  let level = 0;

  for (const child of el.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);
    if (tag === "ilvl") level = Number(child.attrs["w:val"] ?? "0");
    if (tag === "numId") numId = child.attrs["w:val"] ?? null;
  }

  if (!numId || numId === "0") return null; // numId "0" means no list
  return { numId, level };
}

// ---------------------------------------------------------------------------
// Paragraph border — bottom only (used for horizontal rule simulation)
// ---------------------------------------------------------------------------

function parsePBdrBottom(el: XmlElementNode): import("./types.js").ParaBorder | null {
  for (const child of el.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) !== "bottom") continue;

    const val = child.attrs["w:val"] ?? "none";
    if (val === "none" || val === "nil") return null;

    const sz = Number(child.attrs["w:sz"] ?? "4");
    const color = normalizeColor(child.attrs["w:color"]) ?? "000000";

    return {
      style: normalizeBorderStyle(val),
      widthPt: sz / 8, // eighths of a point → points
      color,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Heading level resolution
// ---------------------------------------------------------------------------

/**
 * Resolve heading level from style name and/or outline level.
 *
 * Word's built-in heading styles are named "heading 1" through "heading 9"
 * (lowercase, space-separated) in styles.xml regardless of display language.
 * "Title" maps to level 1, "Subtitle" to level 2 — these are conventional
 * defaults that the caller can override via styleMap option.
 */
function resolveHeadingLevel(name: string, outlineLvl: number | null): number | null {
  const lower = name.toLowerCase().trim();

  // "heading N" — canonical Word built-in heading style names
  const headingMatch = /^heading\s+(\d)$/.exec(lower);
  if (headingMatch) {
    const lvl = Number(headingMatch[1]);
    return lvl >= 1 && lvl <= 6 ? lvl : null;
  }

  // "title" → H1, "subtitle" → H2 (conventional defaults)
  if (lower === "title") return 1;
  if (lower === "subtitle") return 2;

  // Fallback: outline level declared in pPr
  if (outlineLvl !== null && outlineLvl >= 1 && outlineLvl <= 6) return outlineLvl;

  return null;
}

// ---------------------------------------------------------------------------
// Unit conversions
// ---------------------------------------------------------------------------

/** Convert twips (1/20 of a point) to centimetres. */
function twipsToCm(twips: number): number {
  // 1 inch = 1440 twips = 2.54 cm
  return Number(((twips / 1440) * 2.54).toFixed(4));
}

/** Convert half-points to points. */
function halfPointsToPoints(val: string | undefined): number | null {
  if (val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n / 2;
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function normalizeStyleType(raw: string): "paragraph" | "character" | "table" | "numbering" {
  switch (raw) {
    case "character":
      return "character";
    case "table":
      return "table";
    case "numbering":
      return "numbering";
    default:
      return "paragraph";
  }
}

function normalizeAlignment(
  val: string | undefined,
): "left" | "center" | "right" | "justify" | null {
  switch (val) {
    case "left":
      return "left";
    case "center":
      return "center";
    case "right":
      return "right";
    case "both": // DOCX uses "both" for justify
      return "justify";
    default:
      return null;
  }
}

function normalizeColor(val: string | undefined): string | null {
  if (!val || val === "auto") return null;
  return val.toUpperCase();
}

function normalizeBorderStyle(val: string): string {
  // Map common DOCX border styles to CSS/ODT equivalents
  switch (val) {
    case "dashed":
    case "dashSmallGap":
      return "dashed";
    case "dotted":
    case "dot":
      return "dotted";
    case "double":
      return "double";
    default:
      return "solid";
  }
}

/**
 * DOCX uses w:val="0" to explicitly turn off a toggle property
 * (bold, italic, etc.) when overriding an inherited style.
 * Any other value (or absence) means the property is on.
 */
function isFalse(val: string | undefined): boolean {
  return val === "0" || val === "false";
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function localName(tag: string): string {
  const colon = tag.indexOf(":");
  return colon === -1 ? tag : tag.slice(colon + 1);
}

// Re-export for use by body-reader
export { DEFAULT_RUN_PROPS, DEFAULT_PARA_PROPS };
export type { PPrResult };
