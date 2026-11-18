export { ODF_NS, ODF_VERSION } from "./namespaces.js";
// escapeAttr: internal only - never add to package.json exports (v0_14_2-brief.md 2026-09-12).
export { XmlElement, el, xmlDocument, escapeXml, escapeAttr } from "./xml.js";
export { generateManifest } from "./manifest.js";
export type { ManifestEntry } from "./manifest.js";
export { generateMeta } from "./metadata.js";
export type { MetadataOptions } from "./metadata.js";
export { generateStyles } from "./styles.js";
export type { StylesConfig } from "./styles.js";
export { assemblePackage } from "./packaging.js";
export type { PackageFile } from "./packaging.js";
// Internal only: core/ is not a published path (T4: MR-1, the front door for the
// line-height unit's imports; core/length having no barrel of its own is LEAD-035).
export {
  convertDecimal,
  convertQuantized,
  convertQuantizedToPercent,
  decimalToPercent,
  isBelowZero,
  parseOdfValue,
  MAX_EMISSION_SEARCH_K,
  MAX_NUMERIC_LEXICAL,
} from "./length.js";
