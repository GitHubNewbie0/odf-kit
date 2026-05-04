/**
 * Rule 5 of the Tier 1 normalizer: quote unquoted boolean attributes.
 *
 * HTML5 defines a "boolean attribute" syntax that allows attribute names to
 * appear without a value: `<input checked>`, `<script async defer>`,
 * `<link crossorigin>`. This is valid HTML5 per WHATWG. XML requires every
 * attribute to have a quoted value. The Tier 1 parser (parseXml) rejects
 * unquoted attributes loudly per Phase 3 Tightening 2.
 *
 * This rule rewrites unquoted boolean attributes to their XML-equivalent
 * empty-string form: `<input checked>` becomes `<input checked="">`. The
 * empty string is the canonical XHTML serialization of a boolean attribute.
 *
 * Spec reference: WHATWG HTML Living Standard § 2.6.2 "Boolean attributes".
 *
 * Scope: only attribute names that appear without `=` are rewritten. Quoted
 * values pass through unchanged. The tag name itself (the first identifier
 * after `<`) is never rewritten. Self-closing markers (`/>`) are preserved.
 * Unquoted attribute values (e.g. `href=page`) are passed through verbatim
 * — Rule 6 handles those.
 *
 * Composition note: this rule runs before Rule 1 (selfCloseVoidElements)
 * and Rule 2 (decodeNamedEntities) in the composite normalizer. The order
 * is structural-rules-first, content-rules-last.
 */

const TAG_PATTERN = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^>]*)?)>/g;

/**
 * Scan an attribute area and rewrite unquoted boolean attributes to
 * empty-string form. Quoted attributes (`name="value"` or `name='value'`)
 * pass through unchanged. Unquoted values pass through unchanged for
 * Rule 6 to handle.
 */
function rewriteAttrArea(attrArea: string): string {
  if (!attrArea.trim()) return attrArea;

  let result = "";
  let i = 0;

  while (i < attrArea.length) {
    // Preserve whitespace
    while (i < attrArea.length && /\s/.test(attrArea[i])) {
      result += attrArea[i];
      i++;
    }
    if (i >= attrArea.length) break;

    // Try to match an attribute name
    const nameMatch = /^[a-zA-Z_:][a-zA-Z0-9_:.-]*/.exec(attrArea.slice(i));
    if (!nameMatch) {
      // Not an attribute — copy the character and advance
      result += attrArea[i];
      i++;
      continue;
    }

    const attrName = nameMatch[0];
    const afterName = i + attrName.length;

    // Skip whitespace after the name
    let j = afterName;
    while (j < attrArea.length && /\s/.test(attrArea[j])) j++;

    if (j < attrArea.length && attrArea[j] === "=") {
      // Attribute with a value — pass through name, =, and the value
      result += attrName;
      // Copy whitespace between name and =
      result += attrArea.slice(afterName, j);
      // Copy =
      result += attrArea[j];
      j++;
      // Skip whitespace after =
      while (j < attrArea.length && /\s/.test(attrArea[j])) {
        result += attrArea[j];
        j++;
      }
      if (j < attrArea.length && (attrArea[j] === '"' || attrArea[j] === "'")) {
        // Quoted value — copy through entirely
        const quote = attrArea[j];
        const end = attrArea.indexOf(quote, j + 1);
        if (end === -1) {
          // Malformed — copy rest as-is
          result += attrArea.slice(j);
          i = attrArea.length;
          continue;
        }
        result += attrArea.slice(j, end + 1);
        i = end + 1;
      } else {
        // Unquoted value — Rule 6 handles this. Copy the value through
        // without modification and advance past it.
        let valEnd = j;
        while (valEnd < attrArea.length) {
          const ch = attrArea[valEnd];
          if (/\s/.test(ch)) break;
          if (ch === "/" && attrArea[valEnd + 1] === ">") break;
          valEnd++;
        }
        result += attrArea.slice(j, valEnd);
        i = valEnd;
      }
    } else {
      // Boolean attribute — rewrite as name=""
      result += `${attrName}=""`;
      i = afterName;
    }
  }

  return result;
}

/**
 * Quote unquoted boolean attributes in opening tags.
 *
 * Idempotent: already-quoted forms (`name=""` or `name="value"`) pass through
 * unchanged.
 *
 * @param html - HTML5 input
 * @returns Input with unquoted boolean attributes rewritten as `name=""`
 */
export function quoteUnquotedBooleanAttributes(html: string): string {
  return html.replace(TAG_PATTERN, (_match, tagName, attrArea) => {
    const rewritten = rewriteAttrArea(attrArea ?? "");
    return `<${tagName}${rewritten}>`;
  });
}
