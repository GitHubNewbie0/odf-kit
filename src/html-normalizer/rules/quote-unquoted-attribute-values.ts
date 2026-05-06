/**
 * Rule 6 of the Tier 1 normalizer: quote unquoted attribute values.
 *
 * HTML5 allows attribute values to appear without quotes when the value
 * contains no whitespace, no `=`, and no `<`, `>`, `'`, `"`, or backtick:
 * `<a href=page.html>`, `<input class=primary>`, `<div data-id=42>`.
 * This is valid HTML5 per WHATWG. XML requires every attribute value to
 * be quoted. The Tier 1 parser (parseXml) rejects unquoted values loudly
 * per Phase 3 Tightening 2.
 *
 * This rule scans every opening tag and rewrites unquoted values as
 * double-quoted: `<a href=page.html>` becomes `<a href="page.html">`.
 *
 * Spec reference: WHATWG HTML Living Standard Â§ 13.1.2.3 "Attributes",
 * Unquoted attribute value syntax.
 *
 * Scope: only attribute *values* are rewritten. Attribute names without
 * `=` (boolean attributes) are out of scope â€” Rule 5 handles those.
 * Quoted values (single or double) pass through unchanged. The tag name
 * itself is never rewritten.
 *
 * Composition note: this rule should run alongside Rule 5
 * (quoteUnquotedBooleanAttributes). Order between Rules 5 and 6 doesn't
 * matter â€” they handle disjoint patterns. By convention this rule runs
 * after Rule 5 so the rule numbers parallel composition order.
 */

const TAG_PATTERN = /<([a-zA-Z][a-zA-Z0-9-]*)(?=[\s>])([^>]*)>/g;

/**
 * Scan an attribute area and rewrite unquoted attribute values to
 * double-quoted form. Quoted values pass through unchanged. Boolean
 * attributes (no `=`) pass through unchanged â€” Rule 5 handles those.
 */
function rewriteAttrArea(attrArea: string): string {
  if (!attrArea.trim()) return attrArea;
  if (!attrArea.includes("=")) return attrArea;

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
      // Not an attribute â€” copy and advance
      result += attrArea[i];
      i++;
      continue;
    }

    const attrName = nameMatch[0];
    const afterName = i + attrName.length;

    // Skip whitespace between name and =
    let j = afterName;
    while (j < attrArea.length && /\s/.test(attrArea[j])) j++;

    if (j >= attrArea.length || attrArea[j] !== "=") {
      // Boolean attribute (no =) â€” pass through, Rule 5 handles
      result += attrName;
      // Copy whitespace between name and end (or next attr)
      result += attrArea.slice(afterName, j);
      i = j;
      continue;
    }

    // We have name=
    result += attrName;
    result += attrArea.slice(afterName, j); // whitespace before =
    result += "="; // the =
    j++;

    // Skip whitespace after =
    const afterEq = j;
    while (j < attrArea.length && /\s/.test(attrArea[j])) j++;

    if (j >= attrArea.length) {
      // Trailing = with no value â€” preserve as-is
      result += attrArea.slice(afterEq);
      i = attrArea.length;
      continue;
    }

    // Pass through any whitespace between = and value
    result += attrArea.slice(afterEq, j);

    if (attrArea[j] === '"' || attrArea[j] === "'") {
      // Quoted value â€” pass through entirely
      const quote = attrArea[j];
      const end = attrArea.indexOf(quote, j + 1);
      if (end === -1) {
        // Malformed â€” copy rest as-is
        result += attrArea.slice(j);
        i = attrArea.length;
        continue;
      }
      result += attrArea.slice(j, end + 1);
      i = end + 1;
    } else {
      // Unquoted value â€” read until whitespace, end, or self-closing /
      // (per HTML5 spec, unquoted values terminate at whitespace, >, or
      // when `/` is followed by `>` for self-closing tags). The lone `/`
      // inside URLs like https://example.com/x.html is part of the value.
      let valEnd = j;
      while (valEnd < attrArea.length) {
        const ch = attrArea[valEnd];
        if (/\s/.test(ch)) break;
        if (ch === "/" && attrArea[valEnd + 1] === ">") break;
        valEnd++;
      }
      const value = attrArea.slice(j, valEnd);
      result += `"${value}"`;
      i = valEnd;
    }
  }

  return result;
}

/**
 * Quote unquoted attribute values in opening tags.
 *
 * Idempotent: already-quoted values pass through unchanged.
 *
 * @param html - HTML5 input
 * @returns Input with unquoted attribute values rewritten as `name="value"`
 */
export function quoteUnquotedAttributeValues(html: string): string {
  if (!html.includes("=")) return html;

  return html.replace(TAG_PATTERN, (_match, tagName, attrArea) => {
    const rewritten = rewriteAttrArea(attrArea ?? "");
    return `<${tagName}${rewritten}>`;
  });
}
