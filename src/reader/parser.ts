/**
 * ODT parser — the core of the odf-kit reader.
 *
 * Unpacks an .odt file (ZIP), parses content.xml and meta.xml, builds
 * the structured OdtDocumentModel, and wires up the toHtml() method.
 *
 * The parsing pipeline:
 * 1. Unzip the .odt bytes with fflate
 * 2. Parse content.xml with parseXml — produces an XmlElementNode tree
 * 3. Build style maps from <office:automatic-styles> so character
 *    formatting (bold, italic, etc.) and list types can be resolved
 * 4. Walk <office:body>/<office:text> to produce BodyNode[]
 * 5. Parse meta.xml (if present) for document metadata
 * 6. Return an OdtDocumentModel whose toHtml() delegates to renderHtml()
 *
 * Exported for unit testing: parseMetaXml is tested in isolation.
 * Internal helpers (buildStyleMaps, parseBodyNodes, etc.) are tested
 * indirectly through readOdt round-trip integration tests.
 */

import { unzipSync, strFromU8 } from "fflate";
import { parseXml } from "./xml-parser.js";
import type { XmlElementNode, XmlNode } from "./xml-parser.js";
import { renderHtml } from "./html-renderer.js";
import type {
  OdtDocumentModel,
  OdtMetadata,
  BodyNode,
  ParagraphNode,
  HeadingNode,
  ListNode,
  ListItemNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  TextSpan,
  HtmlOptions,
} from "./types.js";

// ============================================================
// Internal XML navigation helpers
// ============================================================

/** Return the first direct element child with the given tag, or undefined. */
function findElement(node: XmlElementNode, tag: string): XmlElementNode | undefined {
  for (const child of node.children) {
    if (child.type === "element" && child.tag === tag) return child;
  }
  return undefined;
}

/** Return the concatenated text content of all direct text children. */
function textContent(node: XmlElementNode): string {
  return node.children
    .filter((c): c is Extract<XmlNode, { type: "text" }> => c.type === "text")
    .map((c) => c.text)
    .join("");
}

// ============================================================
// Internal character style representation
// ============================================================

/**
 * Resolved character formatting for a named automatic style.
 * Properties are only present when the style explicitly sets them.
 */
interface CharStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  superscript?: boolean;
  subscript?: boolean;
}

/**
 * Merge a base character style with an override.
 *
 * The override wins for any property it explicitly sets (true).
 * Unset properties in the override fall back to the base.
 * Since odf-kit only ever sets properties to true (never explicitly
 * to false), this produces correct inheritance for all generated output.
 */
function mergeStyle(base: CharStyle, override: CharStyle): CharStyle {
  const result: CharStyle = {};
  if (base.bold || override.bold) result.bold = true;
  if (base.italic || override.italic) result.italic = true;
  if (base.underline || override.underline) result.underline = true;
  if (base.strikethrough || override.strikethrough) result.strikethrough = true;
  if (base.superscript || override.superscript) result.superscript = true;
  if (base.subscript || override.subscript) result.subscript = true;
  return result;
}

/** Build a TextSpan from text and resolved formatting, omitting falsy properties. */
function makeSpan(text: string, style: CharStyle, href?: string): TextSpan {
  const span: TextSpan = { text };
  if (style.bold) span.bold = true;
  if (style.italic) span.italic = true;
  if (style.underline) span.underline = true;
  if (style.strikethrough) span.strikethrough = true;
  if (style.superscript) span.superscript = true;
  if (style.subscript) span.subscript = true;
  if (href !== undefined) span.href = href;
  return span;
}

// ============================================================
// Style map construction
// ============================================================

/** All style information extracted from <office:automatic-styles>. */
interface StyleMaps {
  /** Character and paragraph automatic styles keyed by style:name. */
  charStyles: Map<string, CharStyle>;
  /**
   * List styles keyed by style:name. Value is true for ordered
   * (numbered) lists, false for unordered (bullet) lists.
   */
  listOrdered: Map<string, boolean>;
}

/**
 * Scan a styles container element (either office:automatic-styles or
 * office:styles) and populate the provided style maps in place.
 */
function scanStylesElement(
  container: XmlElementNode,
  charStyles: Map<string, CharStyle>,
  listOrdered: Map<string, boolean>,
): void {
  for (const child of container.children) {
    if (child.type !== "element") continue;

    if (child.tag === "style:style") {
      const name = child.attrs["style:name"];
      if (!name) continue;

      const textPropsEl = findElement(child, "style:text-properties");
      if (!textPropsEl) continue;

      const style: CharStyle = {};
      const p = textPropsEl.attrs;

      if (p["fo:font-weight"] === "bold") style.bold = true;
      if (p["fo:font-style"] === "italic") style.italic = true;

      const underlineStyle = p["style:text-underline-style"];
      if (underlineStyle !== undefined && underlineStyle !== "none") style.underline = true;

      const strikeStyle = p["style:text-line-through-style"];
      if (strikeStyle !== undefined && strikeStyle !== "none") style.strikethrough = true;

      const textPosition = p["style:text-position"];
      if (textPosition !== undefined) {
        if (textPosition.startsWith("super")) style.superscript = true;
        if (textPosition.startsWith("sub")) style.subscript = true;
      }

      charStyles.set(name, style);
      continue;
    }

    if (child.tag === "text:list-style") {
      const name = child.attrs["style:name"];
      if (!name) continue;

      for (const levelChild of child.children) {
        if (levelChild.type !== "element") continue;
        if (levelChild.attrs["text:level"] !== "1") continue;
        if (levelChild.tag === "text:list-level-style-number") {
          listOrdered.set(name, true);
        } else if (levelChild.tag === "text:list-level-style-bullet") {
          listOrdered.set(name, false);
        }
      }
    }
  }
}

/**
 * Build style maps from both <office:automatic-styles> and <office:styles>
 * in a parsed content.xml tree.
 *
 * List styles defined by odf-kit appear in <office:styles> (named styles),
 * while character formatting automatic styles appear in
 * <office:automatic-styles>. Scanning both ensures all styles are resolved.
 */
function buildStyleMaps(contentRoot: XmlElementNode): StyleMaps {
  const charStyles = new Map<string, CharStyle>();
  const listOrdered = new Map<string, boolean>();

  const autoStylesEl = findElement(contentRoot, "office:automatic-styles");
  if (autoStylesEl) scanStylesElement(autoStylesEl, charStyles, listOrdered);

  const namedStylesEl = findElement(contentRoot, "office:styles");
  if (namedStylesEl) scanStylesElement(namedStylesEl, charStyles, listOrdered);

  return { charStyles, listOrdered };
}

// ============================================================
// Inline span parsing
// ============================================================

/**
 * Parse the inline content of a paragraph, heading, list item, or table
 * cell into an array of TextSpan objects.
 *
 * Recursively handles nested <text:span>, <text:a>, <text:line-break>,
 * <text:tab>, and <text:s> (ODF non-breaking space element).
 *
 * @param node - The container element whose children are walked.
 * @param charStyles - Resolved character style map from automatic-styles.
 * @param baseStyle - Inherited character formatting from the container.
 * @param href - Inherited hyperlink href, set when inside <text:a>.
 */
function parseSpans(
  node: XmlElementNode,
  charStyles: Map<string, CharStyle>,
  baseStyle: CharStyle = {},
  href?: string,
): TextSpan[] {
  const spans: TextSpan[] = [];

  for (const child of node.children) {
    if (child.type === "text") {
      if (child.text.length > 0) {
        spans.push(makeSpan(child.text, baseStyle, href));
      }
      continue;
    }

    switch (child.tag) {
      case "text:line-break":
        spans.push({ text: "", lineBreak: true });
        break;

      case "text:tab":
        spans.push(makeSpan("\t", baseStyle, href));
        break;

      case "text:s": {
        // ODF space element — text:c gives the repeat count (default 1)
        const count = parseInt(child.attrs["text:c"] ?? "1", 10);
        spans.push(makeSpan(" ".repeat(count), baseStyle, href));
        break;
      }

      case "text:span": {
        const styleName = child.attrs["text:style-name"];
        const spanStyle = styleName !== undefined ? (charStyles.get(styleName) ?? {}) : {};
        const merged = mergeStyle(baseStyle, spanStyle);
        spans.push(...parseSpans(child, charStyles, merged, href));
        break;
      }

      case "text:a": {
        const childHref = child.attrs["xlink:href"] ?? href;
        spans.push(...parseSpans(child, charStyles, baseStyle, childHref));
        break;
      }

      default:
        // Unknown inline elements: recurse to pick up any text children
        spans.push(...parseSpans(child, charStyles, baseStyle, href));
        break;
    }
  }

  return spans;
}

// ============================================================
// Body node parsers
// ============================================================

/** Parse a <text:list> element into a ListNode. */
function parseList(listEl: XmlElementNode, styles: StyleMaps): ListNode {
  const styleName = listEl.attrs["text:style-name"] ?? "";
  const ordered = styles.listOrdered.get(styleName) ?? false;

  const items: ListItemNode[] = [];

  for (const child of listEl.children) {
    if (child.type !== "element" || child.tag !== "text:list-item") continue;

    let spans: TextSpan[] = [];
    let nested: ListNode | undefined;

    for (const itemChild of child.children) {
      if (itemChild.type !== "element") continue;
      if (itemChild.tag === "text:p" || itemChild.tag === "text:h") {
        spans = spans.concat(parseSpans(itemChild, styles.charStyles));
      } else if (itemChild.tag === "text:list") {
        nested = parseList(itemChild, styles);
      }
    }

    const item: ListItemNode = { spans };
    if (nested !== undefined) item.children = nested;
    items.push(item);
  }

  return { kind: "list", ordered, items };
}

/** Parse a <table:table> element into a TableNode. */
function parseTable(tableEl: XmlElementNode, styles: StyleMaps): TableNode {
  const rows: TableRowNode[] = [];

  for (const child of tableEl.children) {
    if (child.type !== "element" || child.tag !== "table:table-row") continue;

    const cells: TableCellNode[] = [];

    for (const cellEl of child.children) {
      if (cellEl.type !== "element") continue;
      // Skip covered cells — they are placeholders for merged cell spans
      if (cellEl.tag === "table:covered-table-cell") continue;
      if (cellEl.tag !== "table:table-cell") continue;

      const colSpan = parseInt(cellEl.attrs["table:number-columns-spanned"] ?? "1", 10);
      const rowSpan = parseInt(cellEl.attrs["table:number-rows-spanned"] ?? "1", 10);

      // Collect spans from all <text:p> children (multi-paragraph cells
      // are concatenated for Tier 1 — paragraph breaks within cells are
      // not yet represented in the model)
      let spans: TextSpan[] = [];
      for (const cellChild of cellEl.children) {
        if (cellChild.type === "element" && cellChild.tag === "text:p") {
          spans = spans.concat(parseSpans(cellChild, styles.charStyles));
        }
      }

      const cell: TableCellNode = { spans };
      if (colSpan > 1) cell.colSpan = colSpan;
      if (rowSpan > 1) cell.rowSpan = rowSpan;
      cells.push(cell);
    }

    rows.push({ cells });
  }

  return { kind: "table", rows };
}

/**
 * Walk the children of an <office:text> (or <text:section>) element and
 * produce an ordered array of BodyNode objects.
 *
 * Handles paragraphs, headings, lists, tables, and sections (which are
 * transparent containers). All other elements are skipped.
 */
function parseBodyNodes(bodyTextEl: XmlElementNode, styles: StyleMaps): BodyNode[] {
  const nodes: BodyNode[] = [];

  for (const child of bodyTextEl.children) {
    if (child.type !== "element") continue;

    switch (child.tag) {
      case "text:p": {
        const para: ParagraphNode = {
          kind: "paragraph",
          spans: parseSpans(child, styles.charStyles),
        };
        nodes.push(para);
        break;
      }

      case "text:h": {
        const rawLevel = parseInt(child.attrs["text:outline-level"] ?? "1", 10);
        const level = Math.min(Math.max(rawLevel, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6;
        const heading: HeadingNode = {
          kind: "heading",
          level,
          spans: parseSpans(child, styles.charStyles),
        };
        nodes.push(heading);
        break;
      }

      case "text:list":
        nodes.push(parseList(child, styles));
        break;

      case "table:table":
        nodes.push(parseTable(child, styles));
        break;

      case "text:section":
        // Sections are transparent containers — recurse into their content
        nodes.push(...parseBodyNodes(child, styles));
        break;
    }
  }

  return nodes;
}

// ============================================================
// Metadata parser (exported for unit testing)
// ============================================================

/**
 * Parse a meta.xml string and return the document metadata.
 *
 * Exported so it can be tested in isolation with known XML strings
 * without needing a full .odt ZIP file.
 *
 * @param metaXml - Content of meta.xml as a string.
 * @returns Populated OdtMetadata object. Missing fields are undefined.
 */
export function parseMetaXml(metaXml: string): OdtMetadata {
  const root = parseXml(metaXml);
  const metaEl = findElement(root, "office:meta");
  if (!metaEl) return {};

  const metadata: OdtMetadata = {};

  const titleEl = findElement(metaEl, "dc:title");
  if (titleEl) metadata.title = textContent(titleEl);

  const creatorEl = findElement(metaEl, "dc:creator");
  if (creatorEl) metadata.creator = textContent(creatorEl);

  const descEl = findElement(metaEl, "dc:description");
  if (descEl) metadata.description = textContent(descEl);

  const creationEl = findElement(metaEl, "meta:creation-date");
  if (creationEl) metadata.creationDate = textContent(creationEl);

  const modEl = findElement(metaEl, "dc:date");
  if (modEl) metadata.modificationDate = textContent(modEl);

  return metadata;
}

// ============================================================
// Public API
// ============================================================

/**
 * Parse an .odt file and return a structured document model.
 *
 * Reads content.xml for the document body and automatic styles, and
 * meta.xml for document metadata. Both files are always present in
 * spec-compliant .odt files.
 *
 * @param bytes - The raw .odt file as a Uint8Array.
 * @returns A populated OdtDocumentModel with body, metadata, and toHtml().
 * @throws Error if the input is not a valid ZIP or is missing content.xml.
 *
 * @example
 * ```typescript
 * import { readOdt } from "odf-kit/reader";
 * import { readFileSync } from "node:fs";
 *
 * const bytes = new Uint8Array(readFileSync("document.odt"));
 * const doc = readOdt(bytes);
 * console.log(doc.body.length, "body nodes");
 * ```
 */
export function readOdt(bytes: Uint8Array): OdtDocumentModel {
  const zip = unzipSync(bytes);

  const contentXmlBytes = zip["content.xml"];
  if (!contentXmlBytes) throw new Error("readOdt: content.xml not found in ODT file");
  const contentXml = strFromU8(contentXmlBytes);

  const metaXmlBytes = zip["meta.xml"];
  const metadata: OdtMetadata = metaXmlBytes ? parseMetaXml(strFromU8(metaXmlBytes)) : {};

  const contentRoot = parseXml(contentXml);
  const styles = buildStyleMaps(contentRoot);

  const bodyEl = findElement(contentRoot, "office:body");
  const bodyTextEl = bodyEl ? findElement(bodyEl, "office:text") : undefined;
  const body: BodyNode[] = bodyTextEl ? parseBodyNodes(bodyTextEl, styles) : [];

  return {
    metadata,
    body,
    toHtml(options?: HtmlOptions): string {
      return renderHtml(body, options);
    },
  };
}
