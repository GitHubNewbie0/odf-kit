/**
 * odf-kit — DOCX internal model types
 *
 * These types represent the parsed state of a .docx file. They are internal
 * to the odf-kit/docx pipeline and are not part of the public API.
 *
 * Flow: .docx bytes → reader.ts → DocxDocument → converter.ts → OdtDocument
 */

// ---------------------------------------------------------------------------
// Top-level document
// ---------------------------------------------------------------------------

export interface DocxDocument {
  metadata: DocxMetadata;
  pageLayout: DocxPageLayout;
  body: DocxBodyElement[];
  footnotes: Map<string, DocxNote>; // footnote id → content
  endnotes: Map<string, DocxNote>; // endnote id → content
  headers: DocxHeaderFooter[];
  footers: DocxHeaderFooter[];
  styles: StyleMap;
  numbering: NumberingMap;
  relationships: RelationshipMap;
  images: ImageMap; // rId → raw bytes + mime type
}

// ---------------------------------------------------------------------------
// Metadata — from docProps/core.xml
// ---------------------------------------------------------------------------

export interface DocxMetadata {
  title: string | null;
  creator: string | null;
  description: string | null;
  created: string | null; // ISO 8601
  modified: string | null; // ISO 8601
}

// ---------------------------------------------------------------------------
// Page layout — from w:sectPr
// ---------------------------------------------------------------------------

export interface DocxPageLayout {
  /** Page width in cm. */
  width: number | null;
  /** Page height in cm. */
  height: number | null;
  /** Margins in cm. */
  marginTop: number | null;
  marginBottom: number | null;
  marginLeft: number | null;
  marginRight: number | null;
  /** "portrait" | "landscape". Derived from width vs height when w:orient absent. */
  orientation: "portrait" | "landscape" | null;
}

// ---------------------------------------------------------------------------
// Body elements
// ---------------------------------------------------------------------------

export type DocxBodyElement = DocxParagraph | DocxTable | DocxPageBreak;

export interface DocxPageBreak {
  type: "pageBreak";
}

// ---------------------------------------------------------------------------
// Paragraph
// ---------------------------------------------------------------------------

export interface DocxParagraph {
  type: "paragraph";
  /** Resolved heading level (1–6), or null for body text. */
  headingLevel: number | null;
  /** Paragraph style ID from styles.xml, e.g. "Heading1", "Normal". */
  styleId: string | null;
  props: ParaProps;
  runs: DocxInlineElement[];
}

export type DocxInlineElement =
  | DocxRun
  | DocxHyperlink
  | DocxInlineImage
  | DocxFootnoteReference
  | DocxEndnoteReference
  | DocxBookmark
  | DocxTab
  | DocxLineBreak;

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export interface DocxRun {
  type: "run";
  text: string;
  props: RunProps;
}

// ---------------------------------------------------------------------------
// Hyperlink
// ---------------------------------------------------------------------------

export interface DocxHyperlink {
  type: "hyperlink";
  /** Resolved URL for external links; anchor target for internal links. */
  url: string;
  /** True if this is an internal bookmark link (starts with #). */
  internal: boolean;
  runs: DocxRun[];
}

// ---------------------------------------------------------------------------
// Inline image (w:drawing / w:pict inside a run)
// ---------------------------------------------------------------------------

export interface DocxInlineImage {
  type: "inlineImage";
  /** Relationship ID — used to look up bytes in DocxDocument.images. */
  rId: string;
  /** Width in cm, derived from EMU value (1 cm = 914400 / 100 EMU). */
  widthCm: number;
  /** Height in cm. */
  heightCm: number;
  /** Alt text from wp:docPr descr attribute. */
  altText: string | null;
}

// ---------------------------------------------------------------------------
// Footnote / endnote reference (inline marker in the body)
// ---------------------------------------------------------------------------

export interface DocxFootnoteReference {
  type: "footnoteReference";
  /** Matches a key in DocxDocument.footnotes. */
  id: string;
}

export interface DocxEndnoteReference {
  type: "endnoteReference";
  /** Matches a key in DocxDocument.endnotes. */
  id: string;
}

// ---------------------------------------------------------------------------
// Note content (footnote or endnote)
// ---------------------------------------------------------------------------

export interface DocxNote {
  id: string;
  /** Full paragraph support — notes may contain multiple paragraphs. */
  body: DocxBodyElement[];
}

// ---------------------------------------------------------------------------
// Bookmark
// ---------------------------------------------------------------------------

export interface DocxBookmark {
  type: "bookmark";
  name: string;
  /** "start" | "end" — paired markers in the body. */
  position: "start" | "end";
}

// ---------------------------------------------------------------------------
// Tab and line break
// ---------------------------------------------------------------------------

export interface DocxTab {
  type: "tab";
}

export interface DocxLineBreak {
  type: "lineBreak";
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export interface DocxTable {
  type: "table";
  /** Column widths in cm, one per column. Derived from w:tblGrid / w:gridCol. */
  columnWidths: number[];
  rows: DocxTableRow[];
}

export interface DocxTableRow {
  cells: DocxTableCell[];
}

export interface DocxTableCell {
  /** Number of columns this cell spans (w:gridSpan). Default: 1. */
  colSpan: number;
  /**
   * Rowspan is inferred from w:vMerge / w:vMerge w:val="restart".
   * "restart" = first cell of a vertical merge group.
   * "continue" = continuation cell (rendered as merged, no output cell).
   * null = not merged vertically.
   */
  vMerge: "restart" | "continue" | null;
  /** Background color (hex, no #), from w:shd w:fill. */
  backgroundColor: string | null;
  /** Vertical alignment: "top" | "center" | "bottom". */
  verticalAlign: "top" | "center" | "bottom" | null;
  body: DocxBodyElement[];
}

// ---------------------------------------------------------------------------
// Headers and footers
// ---------------------------------------------------------------------------

export interface DocxHeaderFooter {
  /**
   * "default" | "first" | "even"
   * Corresponds to w:type attribute on w:hdr / w:ftr.
   */
  headerType: "default" | "first" | "even";
  body: DocxBodyElement[];
}

// ---------------------------------------------------------------------------
// Run properties (character-level formatting)
// ---------------------------------------------------------------------------

export interface RunProps {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  doubleStrikethrough: boolean;
  superscript: boolean;
  subscript: boolean;
  smallCaps: boolean;
  allCaps: boolean;
  /** Hex color string without #, e.g. "FF0000". Null = auto/default. */
  color: string | null;
  /** Font size in points. Null = inherited. */
  fontSize: number | null;
  /** Highlight color name, e.g. "yellow", "cyan". Null = none. */
  highlight: string | null;
  /** Font family name. Null = inherited. */
  fontFamily: string | null;
  /** BCP 47 language tag, e.g. "en-US". Null = inherited. */
  lang: string | null;
  /** Character style ID reference. Null = none. */
  rStyleId: string | null;
}

export const DEFAULT_RUN_PROPS: RunProps = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  doubleStrikethrough: false,
  superscript: false,
  subscript: false,
  smallCaps: false,
  allCaps: false,
  color: null,
  fontSize: null,
  highlight: null,
  fontFamily: null,
  lang: null,
  rStyleId: null,
};

// ---------------------------------------------------------------------------
// Paragraph properties (block-level formatting)
// ---------------------------------------------------------------------------

export interface ParaProps {
  /** "left" | "center" | "right" | "justify". Null = inherited. */
  alignment: "left" | "center" | "right" | "justify" | null;
  /**
   * Force a page break before this paragraph (w:pageBreakBefore).
   * When true the converter emits a page break before the paragraph.
   */
  pageBreakBefore: boolean;
  /** Space before paragraph in cm. Null = inherited. */
  spaceBefore: number | null;
  /** Space after paragraph in cm. Null = inherited. */
  spaceAfter: number | null;
  /**
   * Line height. Null = auto (single).
   * Expressed as a multiplier, e.g. 1.5 = 150%, 2.0 = double.
   */
  lineHeight: number | null;
  /** Left indentation in cm. Null = none. */
  indentLeft: number | null;
  /** Right indentation in cm. Null = none. */
  indentRight: number | null;
  /** First-line indentation in cm. Negative = hanging. Null = none. */
  indentFirstLine: number | null;
  /**
   * List membership. Null = not a list item.
   */
  list: ParaListProps | null;
  /** Paragraph bottom border, for horizontal rule simulation. */
  borderBottom: ParaBorder | null;
}

export const DEFAULT_PARA_PROPS: ParaProps = {
  alignment: null,
  pageBreakBefore: false,
  spaceBefore: null,
  spaceAfter: null,
  lineHeight: null,
  indentLeft: null,
  indentRight: null,
  indentFirstLine: null,
  list: null,
  borderBottom: null,
};

export interface ParaListProps {
  /** References a key in NumberingMap. */
  numId: string;
  /** Zero-based list level (0 = outermost). */
  level: number;
}

export interface ParaBorder {
  /** Border style, e.g. "solid", "dashed". Mapped from w:val. */
  style: string;
  /** Line width in pt. Derived from w:sz (eighths of a point → divide by 8). */
  widthPt: number;
  /** Hex color without #. */
  color: string;
}

// ---------------------------------------------------------------------------
// Style map — from word/styles.xml
// ---------------------------------------------------------------------------

/** Keyed by styleId (w:styleId attribute), e.g. "Heading1", "Normal". */
export type StyleMap = Map<string, StyleEntry>;

export interface StyleEntry {
  styleId: string;
  /** Display name, e.g. "heading 1", "Normal". */
  name: string;
  type: "paragraph" | "character" | "table" | "numbering";
  /** Resolved heading level (1–6). Null if not a heading style. */
  headingLevel: number | null;
  /** Parent style ID (w:basedOn). Null = no parent. */
  basedOn: string | null;
  /** Default character formatting for this style. */
  rPr: Partial<RunProps> | null;
  /** Default paragraph formatting for this style. */
  pPr: Partial<ParaProps> | null;
}

// ---------------------------------------------------------------------------
// Numbering map — from word/numbering.xml
// ---------------------------------------------------------------------------

/**
 * Keyed by numId (string). Each value is an array of levels (index = level).
 * Level 0 is the outermost list level.
 */
export type NumberingMap = Map<string, NumberingLevel[]>;

export interface NumberingLevel {
  /** Zero-based level index. */
  level: number;
  /** True = ordered (numbered) list. False = unordered (bullet) list. */
  isOrdered: boolean;
  /**
   * DOCX numFmt value: "bullet", "decimal", "lowerRoman", "upperRoman",
   * "lowerLetter", "upperLetter", "ordinal", "none", etc.
   */
  numFormat: string;
  /** List start value. Default: 1. */
  start: number;
}

// ---------------------------------------------------------------------------
// Relationship map — from word/_rels/document.xml.rels
// ---------------------------------------------------------------------------

/**
 * Keyed by relationship ID (rId), value is the resolved file path within
 * the ZIP, e.g. "word/media/image1.png", or an external URL.
 */
export type RelationshipMap = Map<string, RelationshipEntry>;

export interface RelationshipEntry {
  /** Full path within ZIP (for internal rels) or URL (for external rels). */
  target: string;
  /** True if this is an external URL (hyperlink, etc.). */
  external: boolean;
  /** Relationship type URI, e.g. ".../hyperlink", ".../image". */
  type: string;
}

// ---------------------------------------------------------------------------
// Image map — raw bytes keyed by rId
// ---------------------------------------------------------------------------

export interface ImageEntry {
  /** Raw image bytes. */
  bytes: Uint8Array;
  /** MIME type derived from file extension, e.g. "image/png", "image/jpeg". */
  mimeType: string;
  /** Original filename within the ZIP, e.g. "image1.png". */
  filename: string;
}

/** Keyed by rId — same keys as RelationshipMap for image-type relationships. */
export type ImageMap = Map<string, ImageEntry>;
