/**
 * Public API for reading ODT files into a document model.
 *
 * Import from "odf-kit/odt/read":
 *
 * ```typescript
 * import { readOdt } from "odf-kit/odt/read";
 * ```
 *
 * readOdt() returns an OdtDocumentModel with a body array and a toHtml()
 * method. To render HTML, see "odf-kit/odt/to-html".
 */
export { VERSION } from "../../version.js";

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
