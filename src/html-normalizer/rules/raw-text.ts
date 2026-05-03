/**
 * Rule 3 of the Tier 1 normalizer: empty `<script>` and `<style>` content.
 *
 * `<script>` and `<style>` are HTML5 raw-text elements: their content may
 * contain literal `<` and `&` characters that are valid HTML5 but invalid
 * XML. Since htmlToOdt does not render script or style content into ODT,
 * the simplest correct transformation is to empty the content of any such
 * elements. Attributes on the opening tag are preserved.
 *
 * Spec reference: WHATWG HTML Living Standard § 13.2.5.1 "Data state" and
 * related raw-text mode states.
 *
 * Scope: lowercase tag names only, consistent with Rule 1's scope.
 *
 * Composition note: this rule MUST run before Rule 1 (selfCloseVoidElements)
 * and Rule 2 (decodeNamedEntities) in the composite normalizer. Otherwise
 * those rules would falsely match `<` and `&` patterns inside script/style
 * content. The composite order is enforced in src/html-normalizer/index.ts.
 */

const RAW_TEXT_PATTERN = /<(script|style)((?:\s[^>]*)?)>[\s\S]*?<\/\1\s*>/g;

/**
 * Empty the content of `<script>` and `<style>` elements while preserving
 * their opening-tag attributes.
 *
 * Idempotent: an already-empty raw-text element produces the same output.
 *
 * @param html - HTML5 input
 * @returns Input with script/style content emptied
 */
export function emptyRawTextElements(html: string): string {
  return html.replace(RAW_TEXT_PATTERN, (_match, tag, attrs) => {
    return `<${tag}${attrs}></${tag}>`;
  });
}
