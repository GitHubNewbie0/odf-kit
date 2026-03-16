/**
 * Public API for the odf-kit ODT reader.
 *
 * Import from "odf-kit/reader" (separate from the main "odf-kit" import
 * so the reader is only bundled when explicitly needed):
 *
 * ```typescript
 * import { readOdt, odtToHtml } from "odf-kit/reader";
 * ```
 *
 * readOdt() returns an OdtDocumentModel with a body array and a toHtml()
 * method. odtToHtml() is a convenience wrapper that calls readOdt().toHtml()
 * in a single step.
 */

export { readOdt } from "./parser.js";
export type {
  // Document root and metadata
  OdtDocumentModel,
  OdtMetadata,
  HtmlOptions,
  ReadOdtOptions,

  // Top-level body node union and block types
  BodyNode,
  ParagraphNode,
  HeadingNode,
  ListNode,
  ListItemNode,
  TableNode,
  TableRowNode,
  TableCellNode,

  // Tier 3 block types
  SectionNode,
  TrackedChangeNode,

  // Inline node union and all inline types
  InlineNode,
  TextSpan,
  ImageNode,
  NoteNode,
  BookmarkNode,
  FieldNode,

  // Tier 2 style types
  SpanStyle,
  CellStyle,
  RowStyle,
  BorderStyle,

  // Tier 3 style and layout types
  ParagraphStyle,
  PageLayout,
} from "./types.js";

import { readOdt } from "./parser.js";
import type { HtmlOptions, ReadOdtOptions } from "./types.js";

/**
 * Convert an .odt file directly to an HTML string.
 *
 * Convenience wrapper around readOdt().toHtml(). Use readOdt() directly
 * when you need access to the document model, metadata, page layout, or
 * header/footer content.
 *
 * @param bytes - The raw .odt file as a Uint8Array.
 * @param options - HTML output options.
 * @param readOptions - Options controlling how the document is parsed
 *   (e.g. tracked-changes mode). Passed to readOdt().
 * @returns HTML string. Full document by default; inner fragment when
 *   options.fragment is true.
 *
 * @example
 * ```typescript
 * import { odtToHtml } from "odf-kit/reader";
 * import { readFileSync } from "node:fs";
 *
 * const bytes = new Uint8Array(readFileSync("document.odt"));
 * const html = odtToHtml(bytes, { fragment: true });
 * ```
 */
export function odtToHtml(
  bytes: Uint8Array,
  options?: HtmlOptions,
  readOptions?: ReadOdtOptions,
): string {
  return readOdt(bytes, readOptions).toHtml(options);
}
