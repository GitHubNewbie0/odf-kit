/**
 * Placeholder healer for ODF XML.
 *
 * When a user types {name} in LibreOffice, the editor may split it across
 * multiple <text:span> elements depending on editing history, spell check,
 * or style changes. This module reassembles fragmented placeholders into
 * contiguous text so the replacer can find them reliably.
 *
 * Algorithm:
 * 1. Tokenize XML into tag/text segments
 * 2. Build a "text ribbon" — concatenation of all text segments with
 *    character-to-segment position mapping
 * 3. Find all placeholder patterns in the ribbon
 * 4. For any placeholder spanning multiple text segments, consolidate:
 *    the full placeholder goes into the first segment, intermediate
 *    text segments and self-closing tags are cleared, consumed text
 *    is removed from the last segment. Open/close tag pairs are
 *    preserved to keep remaining text properly wrapped.
 * 5. Rebuild XML from segments
 * 6. Remove empty <text:span> elements left behind
 *
 * This is uniform — every fragmented placeholder gets the same treatment
 * regardless of span count, style differences, or tag context.
 */

/** A segment of the XML string: either an XML tag or text content. */
interface Segment {
  type: "tag" | "text";
  content: string;
}

/** Position mapping from a text ribbon character back to its segment. */
interface CharOrigin {
  segIndex: number;
  charIndex: number;
}

/**
 * Valid placeholder pattern:
 * - {varName}        — simple replacement
 * - {#varName}       — loop/conditional open
 * - {/varName}       — loop/conditional close
 * - {object.property} — dot notation for nested data
 *
 * Identifier: starts with letter or underscore, followed by letters, digits,
 * underscores, or dots.
 */
const PLACEHOLDER_RE = /\{[#/]?[a-zA-Z_][a-zA-Z0-9_.]*\}/g;

/**
 * Split an XML string into alternating text and tag segments.
 *
 * Tags are anything inside < >, including self-closing tags.
 * Text is everything between tags.
 */
export function tokenize(xml: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;

  while (i < xml.length) {
    if (xml[i] === "<") {
      const end = xml.indexOf(">", i);
      if (end === -1) {
        // Malformed XML — treat remainder as text
        segments.push({ type: "text", content: xml.slice(i) });
        break;
      }
      segments.push({ type: "tag", content: xml.slice(i, end + 1) });
      i = end + 1;
    } else {
      const end = xml.indexOf("<", i);
      if (end === -1) {
        segments.push({ type: "text", content: xml.slice(i) });
        break;
      }
      segments.push({ type: "text", content: xml.slice(i, end) });
      i = end;
    }
  }

  return segments;
}

/**
 * Build a text ribbon from segments and a character-to-segment mapping.
 *
 * The ribbon is the concatenation of all text segment contents.
 * charMap[i] tells you which segment and character position
 * ribbon character i came from.
 */
function buildRibbon(segments: Segment[]): { ribbon: string; charMap: CharOrigin[] } {
  const charMap: CharOrigin[] = [];
  const chars: string[] = [];

  for (let s = 0; s < segments.length; s++) {
    if (segments[s].type === "text") {
      for (let c = 0; c < segments[s].content.length; c++) {
        chars.push(segments[s].content[c]);
        charMap.push({ segIndex: s, charIndex: c });
      }
    }
  }

  return { ribbon: chars.join(""), charMap };
}

/**
 * Find all placeholder matches in a text ribbon.
 */
function findPlaceholders(ribbon: string): { start: number; end: number; text: string }[] {
  const matches: { start: number; end: number; text: string }[] = [];
  let match;

  PLACEHOLDER_RE.lastIndex = 0;
  while ((match = PLACEHOLDER_RE.exec(ribbon)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length - 1,
      text: match[0],
    });
  }

  return matches;
}

/**
 * Remove empty <text:span ...></text:span> pairs from an XML string.
 */
function removeEmptySpans(xml: string): string {
  return xml.replace(/<text:span[^>]*><\/text:span>/g, "");
}

/**
 * Heal fragmented placeholders in ODF XML.
 *
 * Takes raw XML (typically content.xml from an .odt file) and returns
 * the same XML with any placeholders that were split across multiple
 * text:span elements reassembled into contiguous text.
 *
 * Placeholders that are already contiguous pass through unchanged.
 * Non-placeholder text passes through unchanged.
 */
export function healPlaceholders(xml: string): string {
  const segments = tokenize(xml);
  const { ribbon, charMap } = buildRibbon(segments);
  const placeholders = findPlaceholders(ribbon);

  if (placeholders.length === 0) return xml;

  // Process in reverse order so earlier segment indices stay valid
  for (let i = placeholders.length - 1; i >= 0; i--) {
    const ph = placeholders[i];
    const firstSegIdx = charMap[ph.start].segIndex;
    const lastSegIdx = charMap[ph.end].segIndex;

    // Not fragmented — placeholder is entirely within one text segment
    if (firstSegIdx === lastSegIdx) continue;

    const firstCharIdx = charMap[ph.start].charIndex;
    const lastCharIdx = charMap[ph.end].charIndex;

    // Put everything before { plus the full placeholder into the first segment
    const before = segments[firstSegIdx].content.slice(0, firstCharIdx);
    segments[firstSegIdx] = { type: "text", content: before + ph.text };

    // Keep everything after } in the last segment
    const after = segments[lastSegIdx].content.slice(lastCharIdx + 1);
    segments[lastSegIdx] = { type: "text", content: after };

    // Clear intermediate text segments and self-closing tag elements.
    // Text between fragments is part of the fragmentation.
    // Self-closing tags (e.g., <text:s/>, <text:bookmark/>) inside a
    // fragmented placeholder are editing artifacts.
    // Open/close tag pairs (</text:span>, <text:span>) are structural
    // and must stay to keep remaining text properly wrapped.
    for (let s = firstSegIdx + 1; s < lastSegIdx; s++) {
      if (segments[s].type === "text") {
        segments[s] = { type: "text", content: "" };
      } else if (segments[s].content.endsWith("/>")) {
        segments[s] = { type: "tag", content: "" };
      }
    }
  }

  // Rebuild XML from segments
  const rebuilt = segments.map((s) => s.content).join("");

  // Clean up empty spans left behind
  return removeEmptySpans(rebuilt);
}
