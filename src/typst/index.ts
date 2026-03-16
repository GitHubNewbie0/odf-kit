/**
 * Typst emitter for odf-kit.
 *
 * Converts ODT documents to Typst markup (.typ), which can then be compiled
 * to PDF by any Typst 0.11+ installation:
 *
 *   typst compile document.typ document.pdf
 *
 * Import from "odf-kit/typst" (separate from the main "odf-kit" import
 * so the emitter is only bundled when explicitly needed):
 *
 * ```typescript
 * import { modelToTypst, odtToTypst } from "odf-kit/typst";
 * ```
 *
 * modelToTypst() accepts a pre-parsed OdtDocumentModel and is the primary
 * function. odtToTypst() is a convenience wrapper that calls readOdt() +
 * modelToTypst() in a single step.
 *
 * Both functions are zero-dependency pure functions — no filesystem access,
 * no child process spawning, no Typst installation required at import time.
 * The consumer decides how to use the returned .typ string.
 */

export { modelToTypst, odtToTypst } from "./emitter.js";
export type { TypstEmitOptions } from "./emitter.js";
