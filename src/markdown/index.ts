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
 *
 * The emitter now lives at "odf-kit/odt/to-markdown"; this path is preserved
 * for backwards compatibility and re-exports from there.
 */
export { VERSION } from "../version.js";

export { odtToMarkdown, modelToMarkdown } from "../odt/to-markdown/emitter.js";
export type { MarkdownEmitOptions } from "../odt/to-markdown/emitter.js";
