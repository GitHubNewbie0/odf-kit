/**
 * Public API for filling ODT templates with JavaScript data.
 *
 * Import from "odf-kit/build-or-fill/fill-odt":
 *
 * ```typescript
 * import { fillTemplate } from "odf-kit/build-or-fill/fill-odt";
 * ```
 */

export { VERSION } from "../../version.js";
export { fillTemplate } from "./template.js";
export { healPlaceholders } from "./healer.js";
export { replaceAll, type TemplateData } from "./replacer.js";
