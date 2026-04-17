/**
 * Input types for lexicalToOdt() — loosely typed to accept any valid
 * Lexical SerializedEditorState without requiring a Lexical dependency.
 *
 * Only the fields we actually use are typed. All other fields are captured
 * by the index signature and safely ignored.
 */

// ─── Editor State ────────────────────────────────────────────────────────────

export interface LexicalSerializedEditorState {
  root: LexicalSerializedRootNode;
}

export interface LexicalSerializedRootNode {
  children: LexicalSerializedNode[];
  direction: "ltr" | "rtl" | null;
  format: string;
  indent: number;
  type: "root";
  version: number;
}

// ─── Generic Node ────────────────────────────────────────────────────────────

export interface LexicalSerializedNode {
  type: string;
  version?: number;
  [key: string]: unknown;
}

// ─── Block Nodes ─────────────────────────────────────────────────────────────

export interface LexicalParagraphNode extends LexicalSerializedNode {
  type: "paragraph";
  format: string; // alignment: "left" | "center" | "right" | "justify" | "start" | "end" | ""
  indent: number;
  children: LexicalSerializedNode[];
}

export interface LexicalHeadingNode extends LexicalSerializedNode {
  type: "heading";
  tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  format: string;
  children: LexicalSerializedNode[];
}

export interface LexicalQuoteNode extends LexicalSerializedNode {
  type: "quote";
  children: LexicalSerializedNode[];
}

export interface LexicalCodeNode extends LexicalSerializedNode {
  type: "code";
  language?: string | null;
  children: LexicalSerializedNode[];
}

// ─── List Nodes ───────────────────────────────────────────────────────────────

export type LexicalListType = "bullet" | "number" | "check";

export interface LexicalListNode extends LexicalSerializedNode {
  type: "list";
  listType: LexicalListType;
  start: number;
  children: LexicalSerializedNode[];
}

export interface LexicalCustomListNode extends LexicalSerializedNode {
  type: "custom-list";
  listType: LexicalListType;
  start: number;
  listStyleType?: "lower-alpha" | "upper-alpha" | "upper-roman";
  listMarker?: "period" | "bracket";
  children: LexicalSerializedNode[];
}

export interface LexicalListItemNode extends LexicalSerializedNode {
  type: "listitem";
  value: number;
  indent: number;
  checked?: boolean;
  children: LexicalSerializedNode[];
}

// ─── Table Nodes ──────────────────────────────────────────────────────────────

export interface LexicalTableNode extends LexicalSerializedNode {
  type: "table";
  children: LexicalSerializedNode[];
}

export interface LexicalTableRowNode extends LexicalSerializedNode {
  type: "tablerow";
  children: LexicalSerializedNode[];
}

export interface LexicalTableCellNode extends LexicalSerializedNode {
  type: "tablecell";
  colSpan?: number;
  rowSpan?: number;
  children: LexicalSerializedNode[];
}

// ─── Inline Nodes ─────────────────────────────────────────────────────────────

/**
 * Text format bitmask values (confirmed from Lexical source).
 *
 * Usage: (format & TEXT_FORMAT_BOLD) !== 0
 */
export const TEXT_FORMAT_BOLD = 1; // 1 << 0
export const TEXT_FORMAT_ITALIC = 2; // 1 << 1
export const TEXT_FORMAT_STRIKETHROUGH = 4; // 1 << 2
export const TEXT_FORMAT_UNDERLINE = 8; // 1 << 3
export const TEXT_FORMAT_CODE = 16; // 1 << 4 — inline monospace
export const TEXT_FORMAT_SUBSCRIPT = 32; // 1 << 5
export const TEXT_FORMAT_SUPERSCRIPT = 64; // 1 << 6

export interface LexicalTextNode extends LexicalSerializedNode {
  type: "text";
  text: string;
  format: number; // bitmask — use TEXT_FORMAT_* constants
  style: string; // CSS string e.g. "color: red; font-size: 14px;"
  mode?: string;
  detail?: number;
}

export interface LexicalLinkNode extends LexicalSerializedNode {
  type: "link" | "autolink";
  url: string;
  children: LexicalSerializedNode[];
}

export interface LexicalCodeHighlightNode extends LexicalSerializedNode {
  type: "code-highlight";
  text: string;
  highlightType?: string;
}

export interface LexicalHashtagNode extends LexicalSerializedNode {
  type: "hashtag";
  text: string;
}

export interface LexicalLineBreakNode extends LexicalSerializedNode {
  type: "linebreak";
}

// ─── Decorator Nodes ──────────────────────────────────────────────────────────

/**
 * Proton's ImageNode — confirmed from ImageNode.tsx.
 * width/height of 0 means 'inherit' (natural size unknown).
 */
export interface LexicalImageNode extends LexicalSerializedNode {
  type: "image";
  src: string;
  altText: string;
  width?: number; // pixels; 0 or absent means 'inherit'
  height?: number; // pixels; 0 or absent means 'inherit'
  maxWidth?: number | null;
  showCaption: boolean;
  caption?: LexicalCaptionEditor;
}

/**
 * Nested editor state inside an image caption.
 */
export interface LexicalCaptionEditor {
  editorState?: {
    root?: {
      children?: LexicalSerializedNode[];
    };
  };
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface LexicalToOdtOptions {
  /**
   * Page format. Defaults to 'A4'.
   */
  pageFormat?: "A4" | "letter" | "legal" | "A3" | "A5";

  /**
   * Top margin with units. Defaults to '2.54cm'.
   */
  marginTop?: string;

  /**
   * Bottom margin with units. Defaults to '2.54cm'.
   */
  marginBottom?: string;

  /**
   * Left margin with units. Defaults to '2.54cm'.
   */
  marginLeft?: string;

  /**
   * Right margin with units. Defaults to '2.54cm'.
   */
  marginRight?: string;

  /**
   * Callback to resolve an image URL to raw bytes.
   *
   * Called when an image `src` is not a base64 data URL.
   * If not provided, non-base64 images are skipped with a console warning.
   * If provided but returns `undefined`, the image is skipped with a console warning.
   *
   * @param src - The image URL from the Lexical node.
   * @returns The raw image bytes, or `undefined` to skip the image.
   *
   * @example
   * fetchImage: async (src) => {
   *   const response = await fetch(src)
   *   return new Uint8Array(await response.arrayBuffer())
   * }
   */
  fetchImage?: (src: string) => Promise<Uint8Array | undefined>;
}
// ─── Shared Builder Interface ─────────────────────────────────────────────────

/**
 * Minimal interface satisfied by both ParagraphBuilder and CellBuilder.
 *
 * Used to type walkInline() so it works in both paragraph and table cell
 * contexts without a type cast. TypeScript resolves this structurally.
 */
export interface InlineContentBuilder {
  addText(text: string, formatting?: import("../odt/types.js").TextFormatting): this;
  addLink(text: string, url: string, formatting?: import("../odt/types.js").TextFormatting): this;
  addLineBreak(): this;
  addImage(data: Uint8Array, options: import("../odt/types.js").ImageOptions): this;
}
