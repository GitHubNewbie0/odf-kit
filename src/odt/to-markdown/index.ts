/**
 * Public API for converting ODT files to Markdown.
 *
 * Import from "odf-kit/odt/to-markdown":
 *
 * ```typescript
 * import { odtToMarkdown, modelToMarkdown } from "odf-kit/odt/to-markdown";
 * ```
 *
 * odtToMarkdown() converts an .odt file directly to a Markdown string.
 * modelToMarkdown() accepts a pre-parsed OdtDocumentModel from readOdt().
 */
export { VERSION } from "../../version.js";

export { odtToMarkdown, modelToMarkdown } from "./emitter.js";
export type { MarkdownEmitOptions } from "./emitter.js";
