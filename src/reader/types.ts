/**
 * Document model types for the odf-kit ODT reader.
 *
 * These interfaces describe the intermediate representation produced by
 * readOdt() — a typed, traversable document model that maps ODF structure
 * to familiar concepts without exposing any ODF XML details.
 *
 * The model is intentionally simple for Tier 1: paragraphs, headings,
 * lists, and tables, each carrying one or more TextSpan objects for
 * inline content. Tier 2 will extend the model with styled output
 * (fonts, colors, margins) and embedded images.
 */

/**
 * A single run of inline content with optional character formatting.
 *
 * A paragraph or heading is made up of one or more TextSpan objects.
 * Adjacent runs with different formatting are kept separate. A span
 * with lineBreak set to true represents a <text:line-break/> element
 * and carries an empty text string.
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
}

/** A paragraph in the document body. */
export interface ParagraphNode {
  kind: "paragraph";
  spans: TextSpan[];
}

/** A heading in the document body at the given outline level. */
export interface HeadingNode {
  kind: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  spans: TextSpan[];
}

/**
 * A list item. May contain a nested child list for multi-level lists.
 */
export interface ListItemNode {
  spans: TextSpan[];
  children?: ListNode;
}

/** An ordered or unordered list. */
export interface ListNode {
  kind: "list";
  ordered: boolean;
  items: ListItemNode[];
}

/**
 * A single table cell. colSpan and rowSpan are only present when
 * the cell spans more than one column or row.
 */
export interface TableCellNode {
  spans: TextSpan[];
  colSpan?: number;
  rowSpan?: number;
}

/** A table row. */
export interface TableRowNode {
  cells: TableCellNode[];
}

/** A table. */
export interface TableNode {
  kind: "table";
  rows: TableRowNode[];
}

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
