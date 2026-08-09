/**
 * Legacy alias. Preserved for backwards compatibility with callers that
 * import from "odf-kit/html-normalizer", a public sub-export since v0.13.2.
 * The normalizer now lives at:
 *   - "odf-kit/html/normalize"
 *
 * New code should import from that canonical path. This path is never
 * removed (v0_14_0-plan-v3-amendments.md item 1).
 */
export { VERSION } from "../version.js";

export {
  odfKitNormalizer,
  selfCloseVoidElements,
  decodeNamedEntities,
  emptyRawTextElements,
  lowercaseDoctype,
  quoteUnquotedBooleanAttributes,
  quoteUnquotedAttributeValues,
  escapeAttributeValueAmpersands,
} from "../html/normalize/index.js";
