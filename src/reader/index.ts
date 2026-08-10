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
 * method. odtToHtml() is a convenience wrapper that parses and renders in
 * a single step.
 *
 * The implementation now lives at "odf-kit/odt/read" and
 * "odf-kit/odt/to-html"; this path is preserved for backwards compatibility
 * and re-exports from there.
 */
export { VERSION } from "../version.js";

export { readOdt } from "../odt/read/parser.js";
export { odtToHtml } from "../odt/to-html/index.js";
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
} from "../odt/read/types.js";
