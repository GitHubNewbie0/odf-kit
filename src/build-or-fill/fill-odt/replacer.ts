/**
 * Template replacer for healed ODF XML.
 *
 * Operates on XML that has already been through the healer, so all
 * placeholders are contiguous strings. Three operations:
 *
 * 1. Simple replacement: {tag} → XML-escaped value
 * 2. Sections: {#tag}...{/tag}
 *    - Array value → loop (repeat inner content for each item)
 *    - Truthy non-array → conditional (include inner content once)
 *    - Falsy → remove inner content
 * 3. Dot notation: {a.b.c} → nested property access
 *
 * Sections are processed first (recursively), then simple replacements.
 * Loop items inherit parent data, with item properties taking precedence.
 */

import { tokenize } from "./healer.js";

/** Template data — string-keyed, values can be anything. */
export type TemplateData = Record<string, unknown>;

/**
 * Classify an XML tag string as opening/closing a <table:table-row>, or
 * neither. Operates on a whole tag (including angle brackets) as produced by
 * tokenize(), so attribute values containing '>' are already handled.
 */
function classifyRowTag(tag: string): "open" | "close" | "other" {
  if (tag.startsWith("</")) {
    return /^<\/table:table-row\s*>$/.test(tag) ? "close" : "other";
  }
  if (tag.endsWith("/>")) return "other"; // self-closing (empty) row holds no marker
  return /^<table:table-row[\s>]/.test(tag) ? "open" : "other";
}

/**
 * Is `fragment` a balanced run of complete sibling nodes — i.e. every element
 * opened within it is also closed within it, with no unmatched closing tag?
 *
 * This is the discriminator between the two section paths. When the region
 * between {#tag} and {/tag} is balanced, it is already a clean repeatable unit
 * (inline text, a whole paragraph, or a whole bare row) and the existing path
 * handles it. When it is unbalanced, the markers straddle a structural
 * boundary (e.g. sit in different table cells) and we promote to whole rows.
 *
 * Uses tokenize() so '>' inside quoted attribute values never miscounts.
 */
function isBalancedSiblingRun(fragment: string): boolean {
  let depth = 0;
  for (const seg of tokenize(fragment)) {
    if (seg.type !== "tag") continue;
    const t = seg.content;
    if (t.startsWith("<?") || t.startsWith("<!")) continue; // decl / comment / doctype
    if (t.startsWith("</")) {
      depth--;
      if (depth < 0) return false; // unmatched close — straddles a boundary
    } else if (!t.endsWith("/>")) {
      depth++; // opening tag (self-closing tags do not change depth)
    }
  }
  return depth === 0;
}

/**
 * Find the innermost <table:table-row>…</table:table-row> span that encloses
 * the character position `target`. Depth-counted, so a nested table inside a
 * cell does not fool the boundary (its inner rows push and pop symmetrically).
 *
 * `target` is expected to fall inside a text segment (a placeholder literal
 * always sits in text between tags). Returns null if the position is not
 * inside any table row.
 */
function innermostRowSpan(xml: string, target: number): { start: number; end: number } | null {
  const segs = tokenize(xml);
  let offset = 0;
  const stack: number[] = []; // start offsets of currently-open rows
  let found: number | null = null; // enclosing row start, once target is located

  for (const seg of segs) {
    const segStart = offset;
    const segEnd = offset + seg.content.length;

    if (seg.type === "tag") {
      const c = classifyRowTag(seg.content);
      if (c === "open") {
        stack.push(segStart);
      } else if (c === "close") {
        const s = stack.pop();
        if (found !== null && s === found) return { start: found, end: segEnd };
      }
    } else if (found === null && segStart <= target && target < segEnd) {
      if (stack.length === 0) return null; // target not inside any row
      found = stack[stack.length - 1];
    }

    offset = segEnd;
  }

  return null;
}

/**
 * The span of complete table rows to repeat when a section's markers straddle
 * table structure: from the start of the row containing the open marker to the
 * end of the row containing the close marker (one row if the same, a run of
 * whole rows if they differ). Null if either marker is not inside a table row.
 */
function enclosingRowSpan(
  xml: string,
  openIdx: number,
  closeIdx: number,
): { start: number; end: number } | null {
  const openRow = innermostRowSpan(xml, openIdx);
  const closeRow = innermostRowSpan(xml, closeIdx);
  if (!openRow || !closeRow) return null;
  return { start: openRow.start, end: closeRow.end };
}

/**
 * Valid placeholder identifier: letter or underscore, then letters,
 * digits, underscores, or dots.
 */
const SIMPLE_RE = /\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;

/**
 * Section opening tag: {#identifier}
 */
const SECTION_OPEN_RE = /\{#([a-zA-Z_][a-zA-Z0-9_.]*)\}/;

/**
 * Escape a string for safe inclusion in XML text content.
 */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Resolve a dotted path against a data object.
 *
 * resolveValue({ user: { name: "Alice" } }, "user.name") → "Alice"
 * resolveValue({ x: 1 }, "y") → undefined
 */
function resolveValue(data: TemplateData, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = data;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as TemplateData)[part];
  }

  return current;
}

/**
 * Find the matching {/tag} for a {#tag} at a given position.
 *
 * Handles same-name nesting by depth counting. Returns the index
 * of the start of {/tag}, or -1 if not found.
 */
function findMatchingClose(xml: string, tag: string, searchFrom: number): number {
  const openTag = `{#${tag}}`;
  const closeTag = `{/${tag}}`;
  let depth = 1;
  let pos = searchFrom;

  while (depth > 0 && pos < xml.length) {
    const nextOpen = xml.indexOf(openTag, pos);
    const nextClose = xml.indexOf(closeTag, pos);

    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      pos = nextClose + closeTag.length;
    }
  }

  return -1;
}

/**
 * Expand a section marker boundary outward through wrapping XML elements
 * where the marker is the sole text content.
 *
 * For example, if {#items} sits inside:
 *   <text:p><text:span text:style-name="T1">{#items}</text:span></text:p>
 *
 * The boundary expands to encompass the entire <text:p>...</text:p>.
 *
 * Expansion only happens when a matching open/close tag pair is found
 * on both sides with nothing but whitespace between them and the marker.
 * This prevents absorbing parent elements that contain other content.
 *
 * Applied uniformly to every section open and close marker.
 */
function expandBoundary(xml: string, start: number, end: number): { start: number; end: number } {
  let s = start;
  let e = end;

  while (true) {
    // Look backward from s for an opening tag
    let backProbe = s - 1;
    while (backProbe >= 0 && " \n\r\t".includes(xml[backProbe])) backProbe--;
    if (backProbe < 0 || xml[backProbe] !== ">") break;

    const openTagEnd = backProbe;
    const openTagStart = xml.lastIndexOf("<", openTagEnd);
    if (openTagStart === -1) break;

    const openTagStr = xml.slice(openTagStart, openTagEnd + 1);
    // Must be an opening tag (not closing or self-closing)
    if (openTagStr.startsWith("</") || openTagStr.endsWith("/>")) break;

    // Extract element name from opening tag (e.g., "text:span" from "<text:span ...>")
    const nameMatch = openTagStr.match(/^<([^\s>/]+)/);
    if (!nameMatch) break;
    const elemName = nameMatch[1];

    // Look forward from e for the matching closing tag
    let fwdProbe = e;
    while (fwdProbe < xml.length && " \n\r\t".includes(xml[fwdProbe])) fwdProbe++;
    if (fwdProbe >= xml.length || xml[fwdProbe] !== "<") break;

    const closeTagStart = fwdProbe;
    const closeTagEnd = xml.indexOf(">", closeTagStart);
    if (closeTagEnd === -1) break;

    const closeTagStr = xml.slice(closeTagStart, closeTagEnd + 1);
    // Must be the matching closing tag
    if (closeTagStr !== `</${elemName}>`) break;

    // Both sides match — expand
    s = openTagStart;
    e = closeTagEnd + 1;
  }

  return { start: s, end: e };
}

/**
 * Process all sections ({#tag}...{/tag}) in the XML string.
 *
 * Scans left-to-right, processes each section by:
 * - Array → repeat inner content for each item (with recursive replacement)
 * - Truthy → include inner content once (with recursive replacement)
 * - Falsy → remove entirely
 *
 * Section marker boundaries are expanded outward through wrapping XML
 * elements where the marker is the sole text content. This prevents
 * orphaned tags when {#tag} or {/tag} sits inside a span or paragraph.
 *
 * After each section is processed, rescans from the beginning since
 * the string has changed. The loop is guaranteed to terminate: each
 * iteration removes exactly one {#tag}...{/tag} pair from the string,
 * so after N sections there are no more open markers.
 *
 * Unmatched {/tag} markers (no preceding {#tag}) are left as literal
 * text — they pass through replaceSimple unchanged since SIMPLE_RE does
 * not match the {/...} syntax.
 */
function replaceSections(xml: string, data: TemplateData): string {
  let result = xml;
  let match: RegExpExecArray | null;

  while ((match = SECTION_OPEN_RE.exec(result)) !== null) {
    const tag = match[1];
    const openTag = `{#${tag}}`;
    const closeTag = `{/${tag}}`;
    const rawOpenStart = match.index;
    const rawOpenEnd = rawOpenStart + openTag.length;

    const rawCloseStart = findMatchingClose(result, tag, rawOpenEnd);
    if (rawCloseStart === -1) break; // Malformed — no matching close tag
    const rawCloseEnd = rawCloseStart + closeTag.length;

    // Structural promotion: if the region between the markers is not a balanced
    // run of complete siblings, the markers straddle a structural boundary
    // (typically {#tag} in one table cell and {/tag} in another). Repeating the
    // raw text run would corrupt the table; instead repeat the whole enclosing
    // <table:table-row>(s). See table-row-loop-plan.md / FormVox #112.
    const rawInner = result.slice(rawOpenEnd, rawCloseStart);
    if (!isBalancedSiblingRun(rawInner)) {
      const span = enclosingRowSpan(result, rawOpenStart, rawCloseStart);
      if (span) {
        const unit = result.slice(span.start, span.end);
        // Strip exactly the outer markers by their known positions within the
        // unit (close first, so the open offset stays valid). Any nested
        // same-name section markers are preserved for the recursive pass.
        const relOpen = rawOpenStart - span.start;
        const relClose = rawCloseStart - span.start;
        const stripped =
          unit.slice(0, relOpen) +
          unit.slice(relOpen + openTag.length, relClose) +
          unit.slice(relClose + closeTag.length);

        const before = result.slice(0, span.start);
        const after = result.slice(span.end);
        const value = resolveValue(data, tag);

        let expansion: string;
        if (Array.isArray(value)) {
          expansion = value
            .map((item) => {
              const itemData =
                typeof item === "object" && item !== null
                  ? { ...data, ...(item as TemplateData) }
                  : data;
              return replaceAll(stripped, itemData);
            })
            .join("");
        } else if (value) {
          const sectionData =
            typeof value === "object" && value !== null
              ? { ...data, ...(value as TemplateData) }
              : data;
          expansion = replaceAll(stripped, sectionData);
        } else {
          expansion = "";
        }

        result = before + expansion + after;
        continue; // rescan from the top, as the balanced path does
      }
      // Unbalanced but not inside table rows: fall through to the existing
      // boundary-expansion path (best-effort, unchanged from prior behavior).
    }

    // Expand boundaries outward through wrapping XML elements
    const openBound = expandBoundary(result, rawOpenStart, rawOpenEnd);
    const closeBound = expandBoundary(result, rawCloseStart, rawCloseEnd);

    const before = result.slice(0, openBound.start);
    const inner = result.slice(openBound.end, closeBound.start);
    const after = result.slice(closeBound.end);

    const value = resolveValue(data, tag);
    let expansion: string;

    if (Array.isArray(value)) {
      // Loop — repeat inner content for each array item
      expansion = value
        .map((item) => {
          const itemData =
            typeof item === "object" && item !== null
              ? { ...data, ...(item as TemplateData) }
              : data;
          return replaceAll(inner, itemData);
        })
        .join("");
    } else if (value) {
      // Truthy non-array — include once
      const sectionData =
        typeof value === "object" && value !== null
          ? { ...data, ...(value as TemplateData) }
          : data;
      expansion = replaceAll(inner, sectionData);
    } else {
      // Falsy — remove
      expansion = "";
    }

    result = before + expansion + after;
  }

  return result;
}

/**
 * Replace all simple {tag} placeholders with values from data.
 *
 * Undefined/null values become empty string.
 * All values are XML-escaped.
 */
function replaceSimple(xml: string, data: TemplateData): string {
  return xml.replace(SIMPLE_RE, (_match, key: string) => {
    const value = resolveValue(data, key);
    if (value == null) return "";
    return xmlEscape(String(value));
  });
}

/**
 * Remove empty <text:span ...></text:span> pairs from an XML string.
 */
function removeEmptySpans(xml: string): string {
  return xml.replace(/<text:span(?:\s+[^>]*)?>(?:<\/text:span>)/g, "");
}

/**
 * Full replacement pass: sections first, then simple placeholders,
 * then clean up any empty spans left behind.
 *
 * This is the recursive entry point — loop iterations call back into
 * this to process their inner content.
 */
export function replaceAll(xml: string, data: TemplateData): string {
  const afterSections = replaceSections(xml, data);
  const afterSimple = replaceSimple(afterSections, data);
  return removeEmptySpans(afterSimple);
}
