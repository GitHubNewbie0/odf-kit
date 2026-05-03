/**
 * odf-kit's default HTML5 normalizer.
 *
 * Tier 1 normalization: four spec-grounded text transformations that bridge
 * good HTML5 to polyglot markup that parseXml can consume reliably.
 *
 * Public API:
 *   - odfKitNormalizer(html) — the composite normalizer
 *   - selfCloseVoidElements(html) — Rule 1
 *   - decodeNamedEntities(html) — Rule 2
 *   - emptyRawTextElements(html) — Rule 3
 *   - lowercaseDoctype(html) — Rule 4
 *
 * For the architectural overview and adapter conventions, see ADAPTERS.md
 * at the repo root.
 *
 * @module
 */

import { selfCloseVoidElements } from "./rules/void-elements.js";
import { decodeNamedEntities } from "./rules/entities.js";
import { emptyRawTextElements } from "./rules/raw-text.js";
import { lowercaseDoctype } from "./rules/doctype.js";

export { selfCloseVoidElements } from "./rules/void-elements.js";
export { decodeNamedEntities } from "./rules/entities.js";
export { emptyRawTextElements } from "./rules/raw-text.js";
export { lowercaseDoctype } from "./rules/doctype.js";

/**
 * The odf-kit default HTML5 normalizer.
 *
 * Applies four spec-grounded transformations in this order:
 *   1. emptyRawTextElements — clears <script> and <style> content first to
 *      prevent subsequent rules from matching patterns inside raw-text
 *   2. lowercaseDoctype — lowercases the doctype declaration
 *   3. selfCloseVoidElements — self-closes the 14 HTML5 void elements
 *   4. decodeNamedEntities — decodes HTML5 named entities to Unicode
 *
 * Output is polyglot markup: valid HTML5 and valid XHTML.
 *
 * Idempotent: odfKitNormalizer(odfKitNormalizer(x)) === odfKitNormalizer(x).
 *
 * @param html - Good HTML5 input from modern toolchains
 * @returns Polyglot markup ready for parseXml
 */
export function odfKitNormalizer(html: string): string {
  let s = html;
  s = emptyRawTextElements(s);
  s = lowercaseDoctype(s);
  s = selfCloseVoidElements(s);
  s = decodeNamedEntities(s);
  return s;
}
