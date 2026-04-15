/**
 * Public API for the odf-kit Markdown emitter.
 *
 * Import from "odf-kit/markdown":
 *
 * ```typescript
 * import { odtToMarkdown, modelToMarkdown } from "odf-kit/markdown";
 * ```
 *
 * odtToMarkdown() converts an .odt file directly to a Markdown string.
 * modelToMarkdown() accepts a pre-parsed OdtDocumentModel from readOdt().
 */

export { odtToMarkdown, modelToMarkdown } from "./emitter.js";
export type { MarkdownEmitOptions } from "./emitter.js";
