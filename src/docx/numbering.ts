/**
 * odf-kit — DOCX numbering parser
 *
 * Parses word/numbering.xml into a NumberingMap keyed by numId.
 *
 * DOCX numbering uses a two-level indirection:
 *
 *   w:num (numId) → references a w:abstractNum (abstractNumId)
 *   w:abstractNum defines the actual level formatting (w:lvl elements)
 *   w:num may override individual levels via w:lvlOverride
 *
 * This parser resolves the indirection so the body-reader only needs to
 * look up numId → level to get a NumberingLevel.
 *
 * numbering.xml structure:
 *
 *   <w:numbering>
 *     <w:abstractNum w:abstractNumId="0">
 *       <w:lvl w:ilvl="0">
 *         <w:start w:val="1"/>
 *         <w:numFmt w:val="decimal"/>
 *         ...
 *       </w:lvl>
 *       ...
 *     </w:abstractNum>
 *     <w:num w:numId="1">
 *       <w:abstractNumId w:val="0"/>
 *       <w:lvlOverride w:ilvl="0">   <!-- optional -->
 *         <w:startOverride w:val="1"/>
 *       </w:lvlOverride>
 *     </w:num>
 *   </w:numbering>
 */

import { parseXml } from "../reader/xml-parser.js";
import type { XmlElementNode } from "../reader/xml-parser.js";
import type { NumberingMap, NumberingLevel } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse word/numbering.xml into a NumberingMap.
 *
 * @param xml - Raw XML content of word/numbering.xml.
 * @returns Map from numId → NumberingLevel[].
 */
export function parseNumbering(xml: string): NumberingMap {
  const map: NumberingMap = new Map();
  const root = parseXml(xml);

  // Pass 1: collect all abstractNum definitions
  const abstractNums = new Map<string, NumberingLevel[]>();

  for (const child of root.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) !== "abstractNum") continue;

    const abstractNumId = child.attrs["w:abstractNumId"];
    if (!abstractNumId) continue;

    const levels = parseAbstractNum(child);
    abstractNums.set(abstractNumId, levels);
  }

  // Pass 2: resolve w:num → abstractNum, apply any level overrides
  for (const child of root.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) !== "num") continue;

    const numId = child.attrs["w:numId"];
    if (!numId) continue;

    let abstractNumId: string | null = null;
    const overrides = new Map<number, Partial<NumberingLevel>>();

    for (const numChild of child.children) {
      if (numChild.type !== "element") continue;
      const tag = localName(numChild.tag);

      if (tag === "abstractNumId") {
        abstractNumId = numChild.attrs["w:val"] ?? null;
      } else if (tag === "lvlOverride") {
        const ilvl = Number(numChild.attrs["w:ilvl"] ?? "0");
        const override = parseLvlOverride(numChild);
        if (override) overrides.set(ilvl, override);
      }
    }

    if (!abstractNumId) continue;

    const baseLevels = abstractNums.get(abstractNumId);
    if (!baseLevels) continue;

    // Apply overrides — clone levels so abstractNum definitions stay pure
    const levels = baseLevels.map((lvl) => {
      const override = overrides.get(lvl.level);
      return override ? { ...lvl, ...override } : { ...lvl };
    });

    map.set(numId, levels);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Abstract numbering definition
// ---------------------------------------------------------------------------

function parseAbstractNum(el: XmlElementNode): NumberingLevel[] {
  const levels: NumberingLevel[] = [];

  for (const child of el.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) !== "lvl") continue;

    const level = parseLvl(child);
    if (level) levels.push(level);
  }

  // Ensure levels are sorted by index and fill any gaps with defaults
  return normalizeLevels(levels);
}

function parseLvl(el: XmlElementNode): NumberingLevel | null {
  const ilvl = el.attrs["w:ilvl"];
  if (ilvl === undefined) return null;

  const level = Number(ilvl);
  let numFormat = "bullet";
  let start = 1;

  for (const child of el.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    if (tag === "numFmt") {
      numFormat = child.attrs["w:val"] ?? "bullet";
    } else if (tag === "start") {
      start = Number(child.attrs["w:val"] ?? "1");
    }
  }

  const isOrdered = isOrderedFormat(numFormat);
  return { level, isOrdered, numFormat, start };
}

// ---------------------------------------------------------------------------
// Level override (w:lvlOverride inside w:num)
// ---------------------------------------------------------------------------

/**
 * Parse a w:lvlOverride element.
 * Returns only the properties that are explicitly overridden.
 * Currently only w:startOverride is commonly used; full w:lvl override
 * is also handled if present.
 */
function parseLvlOverride(el: XmlElementNode): Partial<NumberingLevel> | null {
  const override: Partial<NumberingLevel> = {};

  for (const child of el.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    if (tag === "startOverride") {
      override.start = Number(child.attrs["w:val"] ?? "1");
    } else if (tag === "lvl") {
      // Full level definition override — parse it and merge
      const lvl = parseLvl(child);
      if (lvl) {
        if (lvl.numFormat !== undefined) override.numFormat = lvl.numFormat;
        if (lvl.isOrdered !== undefined) override.isOrdered = lvl.isOrdered;
        if (lvl.start !== undefined) override.start = lvl.start;
      }
    }
  }

  return Object.keys(override).length > 0 ? override : null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a DOCX numFmt value represents an ordered (numbered) list.
 */
function isOrderedFormat(numFormat: string): boolean {
  switch (numFormat) {
    case "bullet":
    case "none":
      return false;
    case "decimal":
    case "decimalZero":
    case "upperRoman":
    case "lowerRoman":
    case "upperLetter":
    case "lowerLetter":
    case "ordinal":
    case "cardinalText":
    case "ordinalText":
    case "hex":
    case "chicago":
    case "ideographDigital":
    case "japaneseCounting":
    case "aiueo":
    case "iroha":
    case "decimalFullWidth":
    case "decimalHalfWidth":
    case "japaneseLegal":
    case "japaneseDigitalTenThousand":
    case "decimalEnclosedCircle":
    case "decimalFullWidth2":
    case "aiueoFullWidth":
    case "irohaFullWidth":
    case "decimalZero2":
      return true;
    default:
      // Unknown format — treat as unordered if name contains "bullet"
      return !numFormat.toLowerCase().includes("bullet");
  }
}

/**
 * Ensure the levels array is sorted and has no gaps.
 * Missing levels (e.g. if numbering.xml skips an ilvl) get a default entry.
 */
function normalizeLevels(levels: NumberingLevel[]): NumberingLevel[] {
  if (levels.length === 0) return [];

  levels.sort((a, b) => a.level - b.level);

  const maxLevel = levels[levels.length - 1].level;
  const filled: NumberingLevel[] = [];
  const byLevel = new Map(levels.map((l) => [l.level, l]));

  for (let i = 0; i <= maxLevel; i++) {
    filled.push(
      byLevel.get(i) ?? {
        level: i,
        isOrdered: false,
        numFormat: "bullet",
        start: 1,
      },
    );
  }

  return filled;
}

function localName(tag: string): string {
  const colon = tag.indexOf(":");
  return colon === -1 ? tag : tag.slice(colon + 1);
}
