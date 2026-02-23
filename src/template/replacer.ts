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

/** Template data — string-keyed, values can be anything. */
export type TemplateData = Record<string, unknown>;

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
 * the string has changed.
 */
function replaceSections(xml: string, data: TemplateData): string {
  let result = xml;
  let safety = 0;

  while (safety++ < 1000) {
    const match = SECTION_OPEN_RE.exec(result);
    if (!match) break;

    const tag = match[1];
    const openTag = `{#${tag}}`;
    const closeTag = `{/${tag}}`;
    const rawOpenStart = match.index;
    const rawOpenEnd = rawOpenStart + openTag.length;

    const rawCloseStart = findMatchingClose(result, tag, rawOpenEnd);
    if (rawCloseStart === -1) break; // Malformed — no matching close tag
    const rawCloseEnd = rawCloseStart + closeTag.length;

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
  return xml.replace(/<text:span[^>]*><\/text:span>/g, "");
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
