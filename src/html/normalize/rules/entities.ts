/**
 * Rule 2 of the Tier 1 normalizer: decode HTML5 named character references.
 *
 * HTML5 defines ~2,226 named character references (`&nbsp;`, `&copy;`,
 * `&mdash;`, etc.). XML defines only five (`&amp;`, `&lt;`, `&gt;`,
 * `&quot;`, `&apos;`). This rule decodes every HTML5 named entity to its
 * Unicode character equivalent so downstream parseXml sees only XML-legal
 * content.
 *
 * Spec reference: WHATWG HTML Living Standard § 13.5 "Named character
 * references".
 *
 * Scope:
 *   - Semicolon-terminated forms only (`&copy;` decoded; bare `&copy`
 *     passes through). Decoding the legacy non-semicolon forms correctly
 *     requires HTML5 tokenizer lookahead rules; out of scope for Tier 1.
 *   - The five XML predefined entities pass through unchanged because
 *     parseXml decodes them downstream. (The entity table excludes them
 *     by design — see scripts/generate-entities-table.mjs.)
 *   - Numeric character references (`&#N;`, `&#xN;`) pass through
 *     unchanged because parseXml decodes them.
 */

import { ENTITIES } from "../data/entities-table.js";

const ENTITY_PATTERN = /&([a-zA-Z][a-zA-Z0-9]*);/g;

/**
 * Decode HTML5 named character references to Unicode characters.
 *
 * Idempotent: decoded characters do not match the entity pattern, so a
 * second pass is a no-op.
 *
 * @param html - HTML5 input
 * @returns Input with HTML5 named entities decoded
 */
export function decodeNamedEntities(html: string): string {
  return html.replace(ENTITY_PATTERN, (match, name) => {
    const decoded = ENTITIES[name];
    return decoded !== undefined ? decoded : match;
  });
}
