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
 * Tier 3 adds page layout: paragraph alignment, margins, spacing, table
 * column widths as layout, image float positioning, headers and footers,
 * page geometry, named sections, and a full tracked-changes model with
 * three rendering modes (final, original, changes).
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
// Tier 3 — Paragraph layout style
// ============================================================

/**
 * Paragraph-level layout properties from style:paragraph-properties.
 *
 * All values are CSS-ready strings (lengths include units: "1.5cm", "150%").
 * fo:text-align values are passed through verbatim per ODF 1.2 §20.216:
 * "start" | "end" | "left" | "right" | "center" | "justify". All six are
 * valid CSS text-align values in modern browsers; normalizing start/end to
 * left/right would break RTL documents.
 */
export interface ParagraphStyle {
  /**
   * fo:text-align → "start" | "end" | "left" | "right" | "center" | "justify".
   * ODF spec values passed through as-is; all are valid CSS text-align values.
   */
  textAlign?: string;
  /** fo:margin-left → "1.5cm". Left indent. */
  marginLeft?: string;
  /** fo:margin-right → "1.5cm". Right indent. */
  marginRight?: string;
  /**
   * fo:margin-top → "0.5cm". Space above the paragraph.
   * Also written as fo:space-before in some ODF producers — both map here.
   */
  marginTop?: string;
  /**
   * fo:margin-bottom → "0.5cm". Space below the paragraph.
   * Also written as fo:space-after in some ODF producers — both map here.
   */
  marginBottom?: string;
  /** fo:padding-left → "0.2cm". */
  paddingLeft?: string;
  /** fo:padding-right → "0.2cm". */
  paddingRight?: string;
  /**
   * fo:line-height → "150%" or "0.6cm".
   * ODF accepts both percentage and length values; stored as-is.
   */
  lineHeight?: string;
}

// ============================================================
// Tier 3 — Page geometry
// ============================================================

/**
 * Physical page dimensions and margins from the default page layout
 * (style:page-layout / style:page-layout-properties in styles.xml).
 *
 * All dimension values are CSS-ready strings including units (e.g. "21cm").
 * orientation is derived from comparing fo:page-width to fo:page-height;
 * it is absent when the layout element is missing from the document.
 */
export interface PageLayout {
  /** fo:page-width → "21cm". Full page width including margins. */
  width?: string;
  /** fo:page-height → "29.7cm". Full page height including margins. */
  height?: string;
  /** fo:margin-top → "2.54cm". */
  marginTop?: string;
  /** fo:margin-bottom → "2.54cm". */
  marginBottom?: string;
  /** fo:margin-left → "2.54cm". */
  marginLeft?: string;
  /** fo:margin-right → "2.54cm". */
  marginRight?: string;
  /**
   * Derived from fo:page-width vs fo:page-height.
   * "landscape" when width > height; "portrait" otherwise.
   * Absent when the page-layout-properties element is not found.
   */
  orientation?: "portrait" | "landscape";
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
 * the draw:frame element regardless of anchor type.
 *
 * data is always base64-encoded binary — the parser resolves the ZIP
 * entry at parse time so consumers never need to touch the ZIP.
 *
 * Accessibility metadata (title → alt, description → aria-describedby)
 * is preserved; odf-kit is the only JavaScript ODT library that preserves
 * both fields.
 *
 * Tier 3 additions:
 *  - wrapMode: from style:wrap on the frame's graphic style. Controls float
 *    positioning in the HTML renderer.
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
   * Preserved for consumers; used alongside wrapMode for layout decisions.
   */
  anchorType?: string;
  /**
   * style:wrap from style:graphic-properties on the frame's named style.
   * Controls how surrounding text wraps around the image.
   *  "left"        — image floats left, text wraps on right
   *  "right"       — image floats right, text wraps on left
   *  "parallel"    — text wraps on both sides (CSS does not support; no float)
   *  "run-through" — image overlaps text (CSS does not support; no float)
   *  "none"        — no text wrap; image is a block
   * Absent when no graphic style is associated with the frame.
   */
  wrapMode?: string;
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
 *     if ("kind" in node) { ... } // ImageNode | NoteNode | BookmarkNode | FieldNode
 *     else { ... }                // TextSpan (no kind property)
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
 * via the cell style resolution) and is applied to table layout in Tier 3
 * via <colgroup><col style="width:X"> in the HTML renderer.
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
   * Applied as <col style="width:X"> in the Tier 3 HTML renderer.
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
// Block nodes (updated for Tier 2 and Tier 3)
// ============================================================

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
   * Paragraph layout properties: alignment, margins, padding, line-height.
   * Absent when none of the supported properties are set in the style.
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
  /** Heading layout properties: alignment, margins, padding, line-height. */
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
// Tier 3 — Block nodes
// ============================================================

/**
 * A named document section.
 *
 * ODF <text:section> elements are named regions that may carry
 * protection, visibility, and linking properties. In Tier 3 they
 * are surfaced as first-class block nodes rather than transparent
 * containers, so consumers can identify section boundaries.
 *
 * name corresponds to text:name on the section element.
 * body contains the full ordered BodyNode content of the section.
 */
export interface SectionNode {
  kind: "section";
  /** text:name — the author-assigned section name. */
  name?: string;
  /** Ordered body content of the section. */
  body: BodyNode[];
}

/**
 * A tracked change node surfaced when readOdt is called with
 * trackedChanges: "changes".
 *
 * ODF §5.5 defines three change types:
 *  - insertion:     text was added; body contains the inserted content.
 *  - deletion:      text was removed; body contains the deleted content
 *                   restored from the text:tracked-changes registry.
 *  - format-change: formatting was altered; body is empty (no content
 *                   moved, only style attributes changed).
 *
 * In "final" mode (default) these nodes are never emitted — insertions
 * appear as normal body content and deletions are suppressed.
 * In "original" mode these nodes are also never emitted — insertions are
 * suppressed and deletions appear as normal body content.
 * In "changes" mode every tracked change emits one TrackedChangeNode at
 * the position of its change marker in the body.
 *
 * author corresponds to dc:creator on the changed-region element.
 * date is the dc:date value — an ISO 8601 date-time string.
 */
export interface TrackedChangeNode {
  kind: "tracked-change";
  /** Type of change as defined in ODF §5.5. */
  changeType: "insertion" | "deletion" | "format-change";
  /** text:id of the changed-region — stable cross-reference identifier. */
  changeId: string;
  /** dc:creator on the changed-region element. */
  author?: string;
  /** dc:date on the changed-region element — ISO 8601 date-time string. */
  date?: string;
  /**
   * Content associated with the change.
   *  - insertion: the inserted body content.
   *  - deletion:  the deleted body content restored from the registry.
   *  - format-change: always empty — no content was moved.
   */
  body: BodyNode[];
}

// ============================================================
// Top-level unions and document root
// ============================================================

/**
 * Discriminated union of all node types that can appear in the
 * document body or in header/footer content. Use the kind property
 * to narrow to a specific type.
 *
 * SectionNode and TrackedChangeNode were added in Tier 3 (v0.7.0).
 * Exhaustive switches on BodyNode must handle all six members.
 */
export type BodyNode =
  | ParagraphNode
  | HeadingNode
  | ListNode
  | TableNode
  | SectionNode
  | TrackedChangeNode;

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
  /**
   * Controls how tracked changes are rendered. Mirrors the trackedChanges
   * option on ReadOdtOptions.
   *
   * "final" (default): insertions rendered as normal content; deletions
   *   suppressed. Same output as before Tier 3.
   * "original": insertions suppressed; deletions rendered as normal content.
   * "changes": TrackedChangeNode values rendered as <ins>, <del>, or
   *   <span class="odf-format-change"> with data-author and data-date.
   *
   * This option applies to TrackedChangeNode members already in the body
   * model. If readOdt was called with trackedChanges: "final" (default),
   * no TrackedChangeNode values exist and this option has no effect.
   * Set readOdt and toHtml to the same mode for consistent results.
   */
  trackedChanges?: "final" | "original" | "changes";
}

/**
 * Options for readOdt().
 *
 * Controls how tracked changes in the source document are processed
 * during parsing. The choice determines what appears in the body array.
 */
export interface ReadOdtOptions {
  /**
   * Controls tracked-change processing. ODF §5.5.
   *
   * "final" (default): show the document as if all changes were accepted.
   *   Insertions appear as normal body content; deletions are suppressed.
   *   No TrackedChangeNode values are emitted. This is the behavior that
   *   existed before Tier 3 and is unchanged.
   *
   * "original": show the document as if all changes were rejected.
   *   Insertions are suppressed; deleted content is restored from the
   *   text:tracked-changes registry at the correct body position.
   *   No TrackedChangeNode values are emitted.
   *
   * "changes": expose all tracked changes in the document model.
   *   TrackedChangeNode values are emitted in body order at the position
   *   of each change marker. Insertion nodes carry the inserted content;
   *   deletion nodes carry the restored deleted content; format-change
   *   nodes have an empty body. Use toHtml({ trackedChanges: "changes" })
   *   to render them as <ins>, <del>, and <span class="odf-format-change">.
   */
  trackedChanges?: "final" | "original" | "changes";
}

/**
 * The parsed ODT document returned by readOdt().
 *
 * Provides typed access to the document body, metadata, page layout,
 * and header/footer content, plus a convenience method for HTML conversion.
 *
 * @example
 * ```typescript
 * import { readOdt } from "odf-kit/reader";
 * import { readFileSync } from "node:fs";
 *
 * const bytes = new Uint8Array(readFileSync("document.odt"));
 * const doc = readOdt(bytes);
 * console.log(doc.metadata.title);
 * console.log(doc.pageLayout?.orientation);
 * const html = doc.toHtml({ fragment: true });
 * ```
 */
export interface OdtDocumentModel {
  /** Document metadata from meta.xml. */
  readonly metadata: OdtMetadata;
  /**
   * Ordered list of body nodes: paragraphs, headings, lists, tables,
   * sections, and (in "changes" mode) tracked-change nodes.
   */
  readonly body: BodyNode[];
  /**
   * Physical page dimensions and margins from the default page layout
   * in styles.xml. Absent when the document contains no page layout.
   */
  readonly pageLayout?: PageLayout;
  /**
   * Default header content, parsed as BodyNode[].
   * Absent when the document has no default header.
   */
  readonly header?: BodyNode[];
  /**
   * Default footer content, parsed as BodyNode[].
   * Absent when the document has no default footer.
   */
  readonly footer?: BodyNode[];
  /**
   * First-page header content (style:header-first on the master page).
   * Absent when the document has no first-page header.
   */
  readonly firstPageHeader?: BodyNode[];
  /**
   * First-page footer content (style:footer-first on the master page).
   * Absent when the document has no first-page footer.
   */
  readonly firstPageFooter?: BodyNode[];
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
