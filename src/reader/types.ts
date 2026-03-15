/**
 * Document model types for the odf-kit ODT reader.
 *
 * These interfaces describe the intermediate representation produced by
 * readOdt() — a typed, traversable document model that maps ODF structure
 * to familiar concepts without exposing any ODF XML details.
 *
 * Tier 1 covers structure and semantic formatting: paragraphs, headings,
 * lists, tables, and TextSpan character flags (bold, italic, etc.).
 *
 * Tier 2 extends the model with visual fidelity: character-level colors,
 * fonts, and sizes via SpanStyle; cell and row backgrounds and borders;
 * embedded images as base64; footnotes and endnotes with full rich bodies;
 * bookmarks; text fields; and tracked-change flattening.
 *
 * Tier 3 (future): paragraph alignment, margins, spacing, table column
 * widths as layout, float positioning, headers/footers, page geometry.
 */

// ============================================================
// Tier 2 — Inline visual style
// ============================================================

/**
 * Visual character-level properties for a text run.
 *
 * Set on TextSpan.style when the run carries any Tier 2 visual property.
 * Absent entirely when no visual properties are present, so Tier 1 code
 * that never inspects TextSpan.style continues to work without change.
 *
 * All values are CSS-ready:
 *  - fontColor / highlightColor are hex strings ("#ff0000")
 *  - fontSize is a plain number in points (renderer appends "pt")
 *  - fontFamily is a resolved CSS font-family string
 *  - textTransform, fontVariant, textShadow, letterSpacing are CSS values
 *
 * Naming follows Syncfusion Document Editor API conventions where they
 * overlap (fontColor, highlightColor) for consistency with the broader
 * document-editing ecosystem.
 */
export interface SpanStyle {
  /** fo:color → "#ff0000". Text foreground color. */
  fontColor?: string;
  /**
   * fo:font-size → 18. Always points, stored as a number.
   * Renderer appends "pt"; consumers doing math never parse a unit string.
   */
  fontSize?: number;
  /** Resolved CSS font-family string. See resolveFontFamily() in registry.ts. */
  fontFamily?: string;
  /**
   * fo:background-color on text properties → "#ffff00".
   * Named highlightColor (not backgroundColor) to distinguish from block/cell
   * background and match LibreOffice terminology.
   */
  highlightColor?: string;
  /** fo:text-transform → "uppercase" | "lowercase" | "capitalize". */
  textTransform?: string;
  /** fo:font-variant → "small-caps". */
  fontVariant?: string;
  /** fo:text-shadow → "2px 2px #FF0000". CSS-ready, no transformation needed. */
  textShadow?: string;
  /** fo:letter-spacing → "0.05em". CSS-ready, no transformation needed. */
  letterSpacing?: string;
}

// ============================================================
// Tier 1 — Inline text spans (extended for Tier 2)
// ============================================================

/**
 * A single run of inline content with optional character formatting.
 *
 * A paragraph or heading is made up of one or more TextSpan objects.
 * Adjacent runs with different formatting are kept separate. A span
 * with lineBreak set to true represents a <text:line-break/> element
 * and carries an empty text string.
 *
 * Tier 2 additions:
 *  - hidden: set when text:display="none"; renderers should skip the run.
 *  - style: visual properties; absent entirely when none are set so
 *    Tier 1 consumers never need to check for it.
 */
export interface TextSpan {
  /** The text content of this run. Empty string when lineBreak is true. */
  text: string;
  /** When true, this run represents a hard line break (<br> in HTML). */
  lineBreak?: true;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  /** The href value when this run is part of a hyperlink. */
  href?: string;
  /**
   * When true, this run has text:display="none" and should not be rendered.
   * Tier 2: parser sets this; renderers skip the span.
   */
  hidden?: true;
  /**
   * Visual character properties. Absent entirely when no Tier 2 visual
   * properties are set, preserving Tier 1 code compatibility.
   */
  style?: SpanStyle;
}

// ============================================================
// Tier 2 — Non-text inline nodes
// ============================================================

/**
 * An image embedded in the document at its inline position.
 *
 * draw:frame / draw:image in ODF. Appears in spans[] at the position of
 * the draw:frame element regardless of anchor type. Float positioning
 * (anchorType) is preserved for Tier 3 layout decisions.
 *
 * data is always base64-encoded binary — the parser resolves the ZIP
 * entry at parse time so consumers never need to touch the ZIP.
 *
 * Accessibility metadata (title → alt, description → aria-describedby)
 * is the only JavaScript ODT library that preserves both fields.
 */
export interface ImageNode {
  kind: "image";
  /** draw:name — stable identifier within the document. */
  name?: string;
  /** svg:width → "17cm". CSS-ready, no transformation needed. */
  width?: string;
  /** svg:height → "5.736cm". CSS-ready, no transformation needed. */
  height?: string;
  /**
   * MIME type of the image.
   * Source priority: manifest.xml (authoritative per ODF spec) →
   * loext:mime-type (LibreOffice extension, fallback).
   */
  mediaType?: string;
  /** Base64-encoded image bytes. Always resolved; never a file path. */
  data: string;
  /** svg:title → HTML alt attribute. */
  title?: string;
  /** svg:desc → HTML aria-describedby long description. */
  description?: string;
  /**
   * text:anchor-type → "as-char" | "paragraph" | "char" | "page".
   * Preserved for Tier 3 float layout; not used by the Tier 2 renderer.
   */
  anchorType?: string;
}

/**
 * A footnote or endnote reference, inline at the point of the citation mark.
 *
 * ODF stores notes inline in the paragraph (unlike DOCX, which uses a
 * separate file). The note body may contain full block content — multiple
 * paragraphs, headings, or lists — which is preserved here.
 *
 * citation is preserved as-is (not auto-numbered) because authors may use
 * custom marks such as * or †. noteClass is preserved so renderers can
 * collect footnotes and endnotes into separate buckets at the page bottom.
 */
export interface NoteNode {
  kind: "note";
  /** text:note-class — distinguishes footnote from endnote rendering. */
  noteClass: "footnote" | "endnote";
  /** text:id — stable cross-reference identifier for back-linking. */
  id: string;
  /** text:note-citation text — e.g. "1", "*", "†". Preserved as authored. */
  citation: string;
  /** Full rich body content. May contain paragraphs, headings, and lists. */
  body: BodyNode[];
}

/**
 * A named anchor position within the document.
 *
 * ODF defines three bookmark forms:
 *  - point:  zero-width position marker (<text:bookmark>)
 *  - start:  beginning of a named range (<text:bookmark-start>)
 *  - end:    end of a named range (<text:bookmark-end>)
 *
 * Cross-references to bookmarks (text:bookmark-ref) are represented as
 * TextSpan with href: "#name" — no separate node type needed.
 *
 * Renderer emits <a id="name"></a> for point and start; nothing for end.
 */
export interface BookmarkNode {
  kind: "bookmark";
  name: string;
  position: "point" | "start" | "end";
}

/**
 * An ODF text field at its inline position.
 *
 * ODF defines dozens of field types. All store their evaluated value as
 * element text content at save time, so no field evaluation engine is
 * needed — the parser reads the stored value directly.
 *
 * fixed indicates whether the author intentionally froze the value
 * (e.g. a print-date snapshot). Absent or false means the value should
 * be re-evaluated in live renderers.
 */
export interface FieldNode {
  kind: "field";
  /**
   * ODF field type. Well-known values:
   *  "date" | "time" | "pageNumber" | "pageCount" | "authorName" |
   *  "authorInitials" | "title" | "description" | "subject" |
   *  "keywords" | "chapter" | "userDefined"
   * Open string for any other spec-valid field type.
   */
  fieldType: string;
  /** Stored evaluated value — always present per ODF spec. */
  value: string;
  /** text:fixed="true" — value is a frozen snapshot, not live. */
  fixed?: boolean;
  /** text:name — present for userDefined fields. */
  name?: string;
}

/**
 * Union of all inline content types that can appear within a paragraph,
 * heading, list item, table cell, or note body.
 *
 * The name `spans` is preserved on all container nodes (not renamed to
 * `body` or `inline`) to avoid breaking Tier 1 consumers. The element
 * type is widened from TextSpan to InlineNode.
 *
 * Narrowing pattern:
 *   for (const node of para.spans) {
 *     if ('kind' in node && node.kind === 'image') { ... }
 *     else { // TextSpan — no `kind` property }
 *   }
 */
export type InlineNode = TextSpan | ImageNode | NoteNode | BookmarkNode | FieldNode;

// ============================================================
// Tier 2 — Cell and row styles
// ============================================================

/**
 * Per-side border values for a table cell.
 *
 * Values are in ODF "width style color" syntax (e.g. "0.5pt solid #000000"),
 * which is identical to CSS border shorthand — no transformation needed.
 *
 * Populated at parse time by expanding fo:border shorthand and then
 * overriding individual sides with fo:border-top/bottom/left/right where
 * explicitly set. The renderer never sees the shorthand.
 */
export interface BorderStyle {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
}

/**
 * Visual properties for a table cell.
 *
 * columnWidth is stored for completeness (from style:table-column-properties
 * via the cell style resolution) but is not applied to table layout in
 * Tier 2 — that is a Tier 3 concern.
 */
export interface CellStyle {
  /** fo:background-color on table-cell-properties. */
  backgroundColor?: string;
  /** Expanded border shorthand — all four sides individually resolved. */
  border?: BorderStyle;
  /** style:vertical-align → "top" | "middle" | "bottom". */
  verticalAlign?: string;
  /**
   * style:column-width → "5cm". CSS-ready.
   * Stored for consumers; not used by the Tier 2 HTML renderer for layout.
   */
  columnWidth?: string;
}

/**
 * Visual properties for a table row.
 *
 * Supports alternating-row shading and header-row highlighting, which
 * are common in real documents and missed by all other JS ODT tools.
 */
export interface RowStyle {
  /** fo:background-color on table-row-properties. */
  backgroundColor?: string;
}

// ============================================================
// Block nodes (updated for Tier 2)
// ============================================================

/**
 * Paragraph-level layout properties.
 *
 * Empty in Tier 2 — defined now so the interface exists and Tier 3 can
 * populate it (text-align, margins, spacing, line-height) without any
 * breaking change to the node shape.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentionally empty; Tier 3 will add text-align, margins, and spacing without a breaking change
export interface ParagraphStyle {}

/** A paragraph in the document body. */
export interface ParagraphNode {
  kind: "paragraph";
  /**
   * ODF internal style name (e.g. "Text_20_Body").
   * Preserved for consumers doing semantic style mapping (mammoth-style).
   */
  styleName?: string;
  /**
   * Paragraph-level text defaults from the paragraph style's
   * style:text-properties. Spans without an explicit character style
   * inherit these values.
   */
  textStyle?: SpanStyle;
  /**
   * Paragraph layout properties. Empty interface in Tier 2;
   * Tier 3 will populate with alignment, margins, and spacing.
   */
  paragraphStyle?: ParagraphStyle;
  /**
   * Inline content. Element type widened from TextSpan to InlineNode
   * to accommodate images, notes, bookmarks, and fields inline in text.
   * Existing code iterating spans continues to work without change.
   */
  spans: InlineNode[];
}

/** A heading in the document body at the given outline level. */
export interface HeadingNode {
  kind: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** ODF internal style name (e.g. "Heading_20_1"). */
  styleName?: string;
  /** Heading-level text defaults from the heading style's text-properties. */
  textStyle?: SpanStyle;
  /** Heading layout properties. Empty in Tier 2; populated in Tier 3. */
  paragraphStyle?: ParagraphStyle;
  /** Inline content. Widened from TextSpan[] to InlineNode[]. */
  spans: InlineNode[];
}

/**
 * A list item. May contain a nested child list for multi-level lists.
 *
 * spans is widened to InlineNode[] so inline images and fields within
 * list items are representable.
 */
export interface ListItemNode {
  /** Inline content of the list item. */
  spans: InlineNode[];
  /** Nested child list, if this item contains a sub-list. */
  children?: ListNode;
}

/** An ordered or unordered list. */
export interface ListNode {
  kind: "list";
  ordered: boolean;
  items: ListItemNode[];
}

/** A single table cell. */
export interface TableCellNode {
  /**
   * Inline content of the cell. Widened to InlineNode[] to support
   * images and other inline nodes within cells.
   *
   * Note: Tier 1 concatenated all <text:p> children of a cell into a
   * single spans array. Tier 2 preserves that flattening; per-paragraph
   * structure within cells is a Tier 3 concern.
   */
  spans: InlineNode[];
  colSpan?: number;
  rowSpan?: number;
  /** ODF internal style name for the cell. */
  styleName?: string;
  /** Cell-level text defaults from the cell style's text-properties. */
  textStyle?: SpanStyle;
  /** Cell visual properties: background, border, vertical-align. */
  cellStyle?: CellStyle;
}

/** A table row. */
export interface TableRowNode {
  cells: TableCellNode[];
  /** Row visual properties: background color. */
  rowStyle?: RowStyle;
}

/** A table. */
export interface TableNode {
  kind: "table";
  /** ODF internal style name for the table. */
  styleName?: string;
  rows: TableRowNode[];
}

// ============================================================
// Top-level unions and document root (unchanged from Tier 1)
// ============================================================

/**
 * Discriminated union of all node types that can appear in the
 * document body. Use the kind property to narrow to a specific type.
 */
export type BodyNode = ParagraphNode | HeadingNode | ListNode | TableNode;

/** Document metadata extracted from meta.xml. */
export interface OdtMetadata {
  title?: string;
  creator?: string;
  description?: string;
  /** ISO 8601 date string from meta:creation-date. */
  creationDate?: string;
  /** ISO 8601 date string from dc:date (last modified). */
  modificationDate?: string;
}

/** Options for HTML conversion. */
export interface HtmlOptions {
  /**
   * When true, omit the <!DOCTYPE html><html><body> wrapper and return
   * only the inner HTML fragment. Useful for embedding in an existing page.
   * Default: false.
   */
  fragment?: boolean;
}

/**
 * The parsed ODT document returned by readOdt().
 *
 * Provides typed access to the document body and metadata, plus a
 * convenience method for HTML conversion.
 *
 * @example
 * ```typescript
 * import { readOdt } from "odf-kit/reader";
 * import { readFileSync } from "node:fs";
 *
 * const bytes = new Uint8Array(readFileSync("document.odt"));
 * const doc = readOdt(bytes);
 * console.log(doc.metadata.title);
 * const html = doc.toHtml({ fragment: true });
 * ```
 */
export interface OdtDocumentModel {
  /** Document metadata from meta.xml. */
  readonly metadata: OdtMetadata;
  /**
   * Ordered list of body nodes: paragraphs, headings, lists, and tables
   * in document order.
   */
  readonly body: BodyNode[];
  /**
   * Convert the document to an HTML string.
   *
   * @param options - HTML output options.
   * @returns HTML string representation of the document.
   *
   * @example
   * ```typescript
   * const html = doc.toHtml({ fragment: true });
   * ```
   */
  toHtml(options?: HtmlOptions): string;
}
