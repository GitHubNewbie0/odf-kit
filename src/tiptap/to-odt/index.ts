/**
 * Public API for converting TipTap/ProseMirror JSON to ODT.
 *
 * Import from "odf-kit/tiptap/to-odt":
 *
 * ```typescript
 * import { tiptapToOdt } from "odf-kit/tiptap/to-odt";
 * ```
 */
export { VERSION } from "../../version.js";

export { tiptapToOdt } from "./tiptap-to-odt.js";
export type { TiptapNode, TiptapMark, TiptapToOdtOptions } from "./tiptap-to-odt.js";
