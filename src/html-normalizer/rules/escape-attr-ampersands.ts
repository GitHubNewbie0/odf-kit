/**
 * Rule 7 of the Tier 1 normalizer: escape unescaped `&` in attribute values.
 *
 * HTML5 attribute values commonly contain unescaped `&` characters in URLs:
 * `<a href="page.html?a=1&b=2">`. This is valid HTML5 per WHATWG. XML
 * requires `&` to introduce an entity reference. The Tier 1 parser
 * (parseXml) rejects unescaped `&` in attribute values per Phase 3
 * Tightening 3.
 *
 * This rule scans every quoted attribute value and replaces lone `&`
 * characters with `&amp;`, leaving valid XML entities and numeric
 * character references untouched.
 *
 * Spec reference: WHATWG HTML Living Standard § 13.2.5.42 "Attribute
 * value (double-quoted) state" describes character reference handling
 * for ambiguous ampersands.
 *
 * Scope: only attribute values are scanned. Text content `&` characters
 * are out of scope (matching Phase 3 T3's deliberate scoping). The five
 * XML predefined entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`)
 * and numeric references (`&#NNN;`, `&#xHHH;`) pass through. Any other
 * `&` becomes `&amp;`.
 *
 * Composition note: this rule runs after Rule 1 (selfCloseVoidElements)
 * and before Rule 2 (decodeNamedEntities). The order is structural rules
 * first, then attribute-content rules, then text-content rules.
 */

const TAG_PATTERN = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^>]*)?)>/g;
const ATTR_PATTERN = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)=(?:"([^"]*)"|'([^']*)')/g;
const VALID_ENTITY = /&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/y;

/**
 * Escape any unescaped `&` in a single attribute value.
 *
 * Lone `&` characters are replaced with `&amp;`. Valid XML predefined
 * entities and numeric character references pass through unchanged.
 */
function escapeValueAmpersands(value: string): string {
  if (!value.includes("&")) return value;

  let result = "";
  let i = 0;
  while (i < value.length) {
    if (value[i] !== "&") {
      result += value[i];
      i++;
      continue;
    }
    // Found a `&`. Test whether it starts a valid entity reference.
    VALID_ENTITY.lastIndex = i;
    if (VALID_ENTITY.test(value)) {
      // Valid entity — copy the whole match through
      result += value.slice(i, VALID_ENTITY.lastIndex);
      i = VALID_ENTITY.lastIndex;
    } else {
      // Lone `&` — escape it
      result += "&amp;";
      i++;
    }
  }
  return result;
}

/**
 * Rewrite the attribute area of a tag to escape unescaped `&` in values.
 */
function rewriteAttrArea(attrArea: string): string {
  if (!attrArea.includes("&")) return attrArea;

  return attrArea.replace(ATTR_PATTERN, (match, attrName, doubleVal, singleVal) => {
    if (doubleVal !== undefined) {
      const fixed = escapeValueAmpersands(doubleVal);
      return `${attrName}="${fixed}"`;
    }
    if (singleVal !== undefined) {
      const fixed = escapeValueAmpersands(singleVal);
      return `${attrName}='${fixed}'`;
    }
    return match;
  });
}

/**
 * Escape unescaped `&` characters in attribute values across all tags.
 *
 * Idempotent: already-escaped `&amp;` and other valid entities pass
 * through unchanged.
 *
 * @param html - HTML5 input
 * @returns Input with unescaped attribute-value `&` rewritten as `&amp;`
 */
export function escapeAttributeValueAmpersands(html: string): string {
  if (!html.includes("&")) return html;

  return html.replace(TAG_PATTERN, (_match, tagName, attrArea) => {
    const rewritten = rewriteAttrArea(attrArea ?? "");
    return `<${tagName}${rewritten}>`;
  });
}
