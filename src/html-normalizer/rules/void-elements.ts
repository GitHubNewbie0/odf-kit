/**
 * Rule 1 of the Tier 1 normalizer: self-close HTML5 void elements.
 *
 * The HTML5 spec defines 14 void elements with no content and no closing
 * tag: area, base, br, col, embed, hr, img, input, link, meta, param,
 * source, track, wbr. In HTML5 they are typically written without
 * self-closing slashes (`<meta charset="utf-8">`); in XHTML they require
 * self-closing (`<meta charset="utf-8" />`). This rule adds the slash.
 *
 * Spec reference: WHATWG HTML Living Standard § 13.1.2 "Elements"
 * (void elements list).
 *
 * Scope: lowercase tag names only. Per the v0.13.2 plan's scope discipline,
 * tag-name case enforcement is deferred to Tier 2 if ever needed. Inputs
 * with uppercase void element tags (e.g. `<BR>`) are outside the contract;
 * users with such input should use the substitution hook.
 *
 * Limitation: the regex-based implementation assumes good HTML5 from modern
 * toolchains, which escape `>` and `<` in attribute values as `&gt;` and
 * `&lt;`. Inputs with unescaped `>` in attribute values are outside the
 * contract.
 */

const VOID_ELEMENT_PATTERN =
  /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(?=[\s/>])([^>]*)>/g;

/**
 * Self-close all 14 HTML5 void elements that are not already self-closed.
 *
 * Idempotent: already-self-closed forms (`<br/>`, `<br />`) pass through
 * unchanged.
 *
 * @param html - HTML5 input
 * @returns Input with void elements rewritten in self-closing form
 */
export function selfCloseVoidElements(html: string): string {
  return html.replace(VOID_ELEMENT_PATTERN, (match, tag, body) => {
    const trimmed = body.replace(/\s+$/, "");
    if (trimmed.endsWith("/")) {
      return match;
    }
    return body.length > 0 ? `<${tag}${trimmed} />` : `<${tag} />`;
  });
}
