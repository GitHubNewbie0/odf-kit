/**
 * Public API for the odf-kit Markdown pathways.
 *
 * Import from "odf-kit/markdown":
 *
 * ```typescript
 * import { odtToMarkdown, modelToMarkdown, markdownToOdt } from "odf-kit/markdown";
 * ```
 *
 * odtToMarkdown() converts an .odt file directly to a Markdown string.
 * modelToMarkdown() accepts a pre-parsed OdtDocumentModel from readOdt().
 * markdownToOdt() converts Markdown source into an .odt file.
 *
 * Both pathways now live at canonical paths — "odf-kit/odt/to-markdown"
 * (outbound) and "odf-kit/markdown/to-odt" (inbound). This path is preserved
 * for backwards compatibility and re-exports from both.
 *
 * markdownToOdt is exposed here additively as of v0.14.0; it was previously
 * reachable from "odf-kit/odt" and the package root, both of which continue
 * to export it.
 */
export { VERSION } from "../version.js";

export { odtToMarkdown, modelToMarkdown } from "../odt/to-markdown/emitter.js";
export type { MarkdownEmitOptions } from "../odt/to-markdown/emitter.js";
export { markdownToOdt } from "./to-odt/markdown-to-odt.js";
