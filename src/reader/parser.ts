/**
 * ODT parser — the core of the odf-kit reader.
 *
 * Unpacks an .odt file (ZIP), parses content.xml, styles.xml, meta.xml,
 * and manifest.xml, builds the structured OdtDocumentModel, and wires up
 * the toHtml() method.
 *
 * The parsing pipeline:
 * 1. Unzip the .odt bytes with fflate
 * 2. Parse manifest.xml → build MIME type map for images
 * 3. Parse styles.xml and content.xml with parseXml
 * 4. Build style maps (semantic: bold/italic) and registry (visual: color/font)
 * 5. Extract tracked-change deletion IDs from office:text
 * 6. Walk office:body/office:text to produce BodyNode[]
 * 7. Parse meta.xml for document metadata
 * 8. Return OdtDocumentModel with body, metadata, and toHtml()
 *
 * Exported for unit testing: parseMetaXml is tested in isolation.
 * Internal helpers are tested indirectly through readOdt round-trip tests.
 */

import { unzipSync, strFromU8 } from "fflate";
import { parseXml } from "./xml-parser.js";
import type { XmlElementNode, XmlNode } from "./xml-parser.js";
import { buildRegistry, resolve, resolveFontFamily } from "./registry.js";
import type { StyleRegistry } from "./registry.js";
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
  InlineNode,
  SpanStyle,
  ImageNode,
  NoteNode,
  FieldNode,
  CellStyle,
  RowStyle,
  BorderStyle,
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
// Internal character style representation (Tier 1 semantic flags)
// ============================================================

/**
 * Resolved character formatting for a named automatic style.
 * Covers only the semantic formatting flags (bold, italic, etc.) that
 * Tier 1 exposes directly on TextSpan. Visual properties (color, font,
 * size) are handled by the Tier 2 registry.
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
 * The override wins for any property it explicitly sets. Since odf-kit
 * only ever sets properties to true (never explicitly to false), this
 * produces correct inheritance for all generated output.
 */
function mergeStyle(base: CharStyle, override: CharStyle): CharStyle {
  const result: CharStyle = { ...base };
  if (override.bold !== undefined) result.bold = override.bold;
  if (override.italic !== undefined) result.italic = override.italic;
  if (override.underline !== undefined) result.underline = override.underline;
  if (override.strikethrough !== undefined) result.strikethrough = override.strikethrough;
  if (override.superscript !== undefined) result.superscript = override.superscript;
  if (override.subscript !== undefined) result.subscript = override.subscript;
  return result;
}

/**
 * Merge two SpanStyle objects. Child (override) properties win over
 * parent (base) properties for any key that is explicitly set.
 */
function mergeSpanStyle(base: SpanStyle, override: SpanStyle): SpanStyle {
  return { ...base, ...override };
}

/** Build a TextSpan from text and resolved formatting, omitting falsy properties. */
function makeSpan(
  text: string,
  style: CharStyle,
  href?: string,
  visualStyle?: SpanStyle,
): TextSpan {
  const span: TextSpan = { text };
  if (style.bold) span.bold = true;
  if (style.italic) span.italic = true;
  if (style.underline) span.underline = true;
  if (style.strikethrough) span.strikethrough = true;
  if (style.superscript) span.superscript = true;
  if (style.subscript) span.subscript = true;
  if (href !== undefined) span.href = href;
  if (visualStyle !== undefined) span.style = visualStyle;
  return span;
}

// ============================================================
// Parse context
// ============================================================

/**
 * All context needed to parse the body of an ODT document.
 *
 * Passed through the entire parse chain so individual parsers can
 * resolve both semantic (bold/italic) and visual (color/font) styles,
 * look up image bytes, and skip tracked-change deletions.
 */
interface ParseContext {
  /** Semantic character styles keyed by style:name. */
  charStyles: Map<string, CharStyle>;
  /** List type by style:name: true = ordered, false = unordered. */
  listOrdered: Map<string, boolean>;
  /** Visual style registry for Tier 2 color/font/size resolution. */
  registry: StyleRegistry;
  /** ZIP path (e.g. "Pictures/foo.png") → raw image bytes. */
  imageBytes: Map<string, Uint8Array>;
  /** ZIP path → MIME type from manifest.xml. */
  manifestTypes: Map<string, string>;
  /** Change IDs that map to tracked deletions — content is excluded. */
  deletionIds: Set<string>;
}

// ============================================================
// Style map construction (semantic flags — Tier 1)
// ============================================================

/**
 * Scan a styles container element (office:automatic-styles or
 * office:styles) and populate the provided maps in place.
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

      if ("fo:font-weight" in p) style.bold = p["fo:font-weight"] === "bold";
      if ("fo:font-style" in p) style.italic = p["fo:font-style"] === "italic";

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
 * Build semantic character-style and list-type maps from both
 * content.xml and (optionally) styles.xml.
 *
 * Scan order (later wins):
 * 1. styles.xml office:styles
 * 2. styles.xml office:automatic-styles
 * 3. content.xml office:styles
 * 4. content.xml office:automatic-styles
 */
function buildStyleMaps(
  contentRoot: XmlElementNode,
  stylesRoot?: XmlElementNode,
): { charStyles: Map<string, CharStyle>; listOrdered: Map<string, boolean> } {
  const charStyles = new Map<string, CharStyle>();
  const listOrdered = new Map<string, boolean>();

  if (stylesRoot) {
    const namedEl = findElement(stylesRoot, "office:styles");
    if (namedEl) scanStylesElement(namedEl, charStyles, listOrdered);
    const autoEl = findElement(stylesRoot, "office:automatic-styles");
    if (autoEl) scanStylesElement(autoEl, charStyles, listOrdered);
  }

  const contentNamedEl = findElement(contentRoot, "office:styles");
  if (contentNamedEl) scanStylesElement(contentNamedEl, charStyles, listOrdered);

  const contentAutoEl = findElement(contentRoot, "office:automatic-styles");
  if (contentAutoEl) scanStylesElement(contentAutoEl, charStyles, listOrdered);

  return { charStyles, listOrdered };
}

// ============================================================
// Manifest parser
// ============================================================

/**
 * Parse META-INF/manifest.xml and return a map of file path → MIME type.
 * The manifest is the authoritative source for image MIME types per the
 * ODF spec (§17.7).
 */
function parseManifest(manifestXml: string): Map<string, string> {
  const types = new Map<string, string>();
  try {
    const root = parseXml(manifestXml);
    for (const child of root.children) {
      if (child.type !== "element" || child.tag !== "manifest:file-entry") continue;
      const path = child.attrs["manifest:full-path"];
      const mediaType = child.attrs["manifest:media-type"];
      if (path && mediaType) types.set(path, mediaType);
    }
  } catch {
    // Malformed manifest — return empty map; image rendering degrades gracefully
  }
  return types;
}

// ============================================================
// Tracked-change deletion ID extraction
// ============================================================

/**
 * Scan the text:tracked-changes block (if present) and return the set
 * of change IDs that correspond to deletions. Body content referencing
 * these IDs is excluded from the parse output (flattened to accepted state).
 */
function parseDeletionIds(bodyTextEl: XmlElementNode): Set<string> {
  const ids = new Set<string>();
  const tcEl = findElement(bodyTextEl, "text:tracked-changes");
  if (!tcEl) return ids;

  for (const child of tcEl.children) {
    if (child.type !== "element" || child.tag !== "text:changed-region") continue;
    const id = child.attrs["text:id"];
    if (!id) continue;
    const hasDeletion = child.children.some(
      (c) => c.type === "element" && c.tag === "text:deletion",
    );
    if (hasDeletion) ids.add(id);
  }

  return ids;
}

// ============================================================
// Tier 2 — Visual style extraction helpers
// ============================================================

/**
 * Parse an ODF pt measurement string (e.g. "12pt", "11.5pt") to a
 * plain number. Returns undefined for other units or malformed values
 * so callers can omit the property rather than emit a bad value.
 */
function parsePt(value: string): number | undefined {
  if (!value.endsWith("pt")) return undefined;
  const n = parseFloat(value.slice(0, -2));
  return isNaN(n) ? undefined : n;
}

/**
 * Encode raw image bytes as a base64 string suitable for use in a
 * data: URI. Uses Node.js Buffer, which is available in all target
 * environments (Node.js 22+).
 */
/**
 * Encode raw bytes as a base64 string.
 *
 * Pure TypeScript implementation — requires no globals, no DOM lib, and
 * no @types/node, consistent with the project's "types": [] tsconfig.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result +=
      CHARS[b0 >> 2] +
      CHARS[((b0 & 3) << 4) | (b1 >> 4)] +
      (i + 1 < len ? CHARS[((b1 & 15) << 2) | (b2 >> 6)] : "=") +
      (i + 2 < len ? CHARS[b2 & 63] : "=");
  }
  return result;
}

/**
 * Extract a SpanStyle from the textProps of a resolved style.
 *
 * Maps ODF text property attributes to SpanStyle fields. Returns
 * undefined when no visual properties are present so TextSpan.style
 * is absent entirely for unstyled runs.
 *
 * Font family resolution follows ODF priority (§15.4.26–27):
 * fo:font-family wins; style:font-name is resolved through fontFaces.
 */
function extractSpanStyle(
  textProps: Map<string, string>,
  registry: StyleRegistry,
): SpanStyle | undefined {
  const style: SpanStyle = {};
  let hasAny = false;

  const color = textProps.get("fo:color");
  if (color) {
    style.fontColor = color;
    hasAny = true;
  }

  const fontSizeStr = textProps.get("fo:font-size");
  if (fontSizeStr) {
    const pts = parsePt(fontSizeStr);
    if (pts !== undefined) {
      style.fontSize = pts;
      hasAny = true;
    }
  }

  const fontFamily = resolveFontFamily(textProps, registry.fontFaces);
  if (fontFamily) {
    style.fontFamily = fontFamily;
    hasAny = true;
  }

  const highlight = textProps.get("fo:background-color");
  if (highlight && highlight !== "transparent") {
    style.highlightColor = highlight;
    hasAny = true;
  }

  const textTransform = textProps.get("fo:text-transform");
  if (textTransform && textTransform !== "none") {
    style.textTransform = textTransform;
    hasAny = true;
  }

  const fontVariant = textProps.get("fo:font-variant");
  if (fontVariant && fontVariant !== "normal") {
    style.fontVariant = fontVariant;
    hasAny = true;
  }

  const textShadow = textProps.get("fo:text-shadow");
  if (textShadow && textShadow !== "none") {
    style.textShadow = textShadow;
    hasAny = true;
  }

  const letterSpacing = textProps.get("fo:letter-spacing");
  if (letterSpacing && letterSpacing !== "normal") {
    style.letterSpacing = letterSpacing;
    hasAny = true;
  }

  return hasAny ? style : undefined;
}

// ============================================================
// Tier 2 — Border and cell style helpers
// ============================================================

/**
 * Expand fo:border shorthand and per-side overrides into a BorderStyle.
 *
 * ODF "width style color" border values are identical to CSS border
 * shorthand — no transformation needed. Individual sides override the
 * shorthand at parse time so the renderer only sees resolved per-side
 * values.
 *
 * Returns undefined when no border is set on any side.
 */
function expandBorder(cellProps: Map<string, string>): BorderStyle | undefined {
  const shorthand = cellProps.get("fo:border");
  const top = cellProps.get("fo:border-top") ?? shorthand;
  const bottom = cellProps.get("fo:border-bottom") ?? shorthand;
  const left = cellProps.get("fo:border-left") ?? shorthand;
  const right = cellProps.get("fo:border-right") ?? shorthand;

  if (!top && !bottom && !left && !right) return undefined;

  const border: BorderStyle = {};
  if (top) border.top = top;
  if (bottom) border.bottom = bottom;
  if (left) border.left = left;
  if (right) border.right = right;
  return border;
}

/**
 * Build a CellStyle from the cellProps of a resolved style.
 *
 * Returns undefined when no visual cell properties are present so
 * TableCellNode.cellStyle is absent entirely for unstyled cells.
 */
function buildCellStyle(cellProps: Map<string, string>): CellStyle | undefined {
  const style: CellStyle = {};
  let hasAny = false;

  const bg = cellProps.get("fo:background-color");
  if (bg && bg !== "transparent") {
    style.backgroundColor = bg;
    hasAny = true;
  }

  const border = expandBorder(cellProps);
  if (border) {
    style.border = border;
    hasAny = true;
  }

  const va = cellProps.get("style:vertical-align");
  if (va) {
    style.verticalAlign = va;
    hasAny = true;
  }

  const cw = cellProps.get("style:column-width");
  if (cw) {
    style.columnWidth = cw;
    hasAny = true;
  }

  return hasAny ? style : undefined;
}

// ============================================================
// ODF field type mapping
// ============================================================

/**
 * Maps ODF field element tags to FieldNode.fieldType string values.
 * Any tag present here is handled as a FieldNode rather than recursed
 * as an unknown element in parseSpans.
 */
const FIELD_TYPE_MAP: Record<string, string> = {
  "text:date": "date",
  "text:time": "time",
  "text:page-number": "pageNumber",
  "text:page-count": "pageCount",
  "text:author-name": "authorName",
  "text:author-initials": "authorInitials",
  "text:title": "title",
  "text:description": "description",
  "text:subject": "subject",
  "text:keywords": "keywords",
  "text:chapter": "chapter",
  "text:user-defined": "userDefined",
};

// ============================================================
// Inline span parsing
// ============================================================

/**
 * Parse the inline content of a paragraph, heading, list item, table
 * cell, or note body into an array of InlineNode objects.
 *
 * Handles: text:span, text:a, text:line-break, text:tab, text:s,
 * draw:frame (images), text:note, text:bookmark, text:bookmark-start,
 * text:bookmark-end, text:bookmark-ref, text:change-start/end (skipped),
 * and all ODF text field elements.
 *
 * @param node            - Container element whose children are walked.
 * @param ctx             - Parse context with style maps, registry, and images.
 * @param baseStyle       - Inherited semantic character formatting.
 * @param href            - Inherited hyperlink href (set inside text:a).
 * @param baseVisualStyle - Inherited visual character formatting (Tier 2).
 */
function parseSpans(
  node: XmlElementNode,
  ctx: ParseContext,
  baseStyle: CharStyle = {},
  href?: string,
  baseVisualStyle?: SpanStyle,
): InlineNode[] {
  const spans: InlineNode[] = [];

  for (const child of node.children) {
    if (child.type === "text") {
      if (child.text.length > 0) {
        spans.push(makeSpan(child.text, baseStyle, href, baseVisualStyle));
      }
      continue;
    }

    switch (child.tag) {
      case "text:line-break":
        spans.push({ text: "", lineBreak: true });
        break;

      case "text:tab":
        spans.push(makeSpan("\t", baseStyle, href, baseVisualStyle));
        break;

      case "text:s": {
        // ODF space element — text:c gives the repeat count (default 1)
        const count = parseInt(child.attrs["text:c"] ?? "1", 10);
        spans.push(makeSpan(" ".repeat(count), baseStyle, href, baseVisualStyle));
        break;
      }

      case "text:span": {
        // Skip hidden spans
        if (child.attrs["text:display"] === "none") break;

        const styleName = child.attrs["text:style-name"];
        const spanStyle = styleName !== undefined ? (ctx.charStyles.get(styleName) ?? {}) : {};
        const merged = mergeStyle(baseStyle, spanStyle);

        // Resolve and merge visual style for Tier 2
        let childVisualStyle = baseVisualStyle;
        if (styleName) {
          const resolved = resolve(ctx.registry, "text", styleName);
          if (resolved.textProps.get("text:display") === "none") break;
          const spanVisual = extractSpanStyle(resolved.textProps, ctx.registry);
          if (spanVisual) {
            childVisualStyle = childVisualStyle
              ? mergeSpanStyle(childVisualStyle, spanVisual)
              : spanVisual;
          }
        }

        spans.push(...parseSpans(child, ctx, merged, href, childVisualStyle));
        break;
      }

      case "text:a": {
        const childHref = child.attrs["xlink:href"] ?? href;
        spans.push(...parseSpans(child, ctx, baseStyle, childHref, baseVisualStyle));
        break;
      }

      case "text:bookmark-ref": {
        // Cross-reference: rendered as a hyperlink to the bookmark anchor
        const refName = child.attrs["text:ref-name"] ?? "";
        const refHref = refName ? `#${refName}` : undefined;
        spans.push(...parseSpans(child, ctx, baseStyle, refHref, baseVisualStyle));
        break;
      }

      case "text:bookmark": {
        const name = child.attrs["text:name"];
        if (name) spans.push({ kind: "bookmark", name, position: "point" });
        break;
      }

      case "text:bookmark-start": {
        const name = child.attrs["text:name"];
        if (name) spans.push({ kind: "bookmark", name, position: "start" });
        break;
      }

      case "text:bookmark-end": {
        const name = child.attrs["text:name"];
        if (name) spans.push({ kind: "bookmark", name, position: "end" });
        break;
      }

      case "text:note": {
        const noteClass = (child.attrs["text:note-class"] ?? "footnote") as "footnote" | "endnote";
        const id = child.attrs["text:id"] ?? "";
        const citationEl = findElement(child, "text:note-citation");
        const citation = citationEl ? textContent(citationEl) : "";
        const noteBodyEl = findElement(child, "text:note-body");
        const body: BodyNode[] = noteBodyEl ? parseBodyNodes(noteBodyEl, ctx) : [];
        const noteNode: NoteNode = { kind: "note", noteClass, id, citation, body };
        spans.push(noteNode);
        break;
      }

      case "draw:frame": {
        const imageEl = findElement(child, "draw:image");
        if (!imageEl) break;

        const imageNode: ImageNode = { kind: "image", data: "" };

        const name = child.attrs["draw:name"];
        if (name) imageNode.name = name;
        const width = child.attrs["svg:width"];
        if (width) imageNode.width = width;
        const height = child.attrs["svg:height"];
        if (height) imageNode.height = height;
        const anchorType = child.attrs["text:anchor-type"];
        if (anchorType) imageNode.anchorType = anchorType;

        // Resolve MIME type: manifest.xml (authoritative) → loext:mime-type (fallback)
        const xhref = imageEl.attrs["xlink:href"];
        const mediaType =
          (xhref ? ctx.manifestTypes.get(xhref) : undefined) ?? imageEl.attrs["loext:mime-type"];
        if (mediaType) imageNode.mediaType = mediaType;

        // Resolve image data: embedded base64 or ZIP entry
        const binaryEl = findElement(imageEl, "office:binary-data");
        if (binaryEl) {
          // Inline base64 — strip whitespace that ODF allows between chunks
          imageNode.data = textContent(binaryEl).replace(/\s/g, "");
        } else if (xhref) {
          const bytes = ctx.imageBytes.get(xhref);
          if (bytes) imageNode.data = bytesToBase64(bytes);
        }

        // Accessibility metadata
        const titleEl = findElement(child, "svg:title");
        if (titleEl) imageNode.title = textContent(titleEl);
        const descEl = findElement(child, "svg:desc");
        if (descEl) imageNode.description = textContent(descEl);

        spans.push(imageNode);
        break;
      }

      case "text:change-start":
      case "text:change-end":
      case "text:change":
        // Tracked-change structural markers carry no content — skip
        break;

      default: {
        // Text field elements
        const fieldType = FIELD_TYPE_MAP[child.tag];
        if (fieldType !== undefined) {
          const value = textContent(child);
          const fieldNode: FieldNode = { kind: "field", fieldType, value };
          if (child.attrs["text:fixed"] === "true") fieldNode.fixed = true;
          if (fieldType === "userDefined") {
            const fieldName = child.attrs["text:name"];
            if (fieldName) fieldNode.name = fieldName;
          }
          spans.push(fieldNode);
          break;
        }
        // Unknown inline elements: recurse to pick up any text children
        spans.push(...parseSpans(child, ctx, baseStyle, href, baseVisualStyle));
        break;
      }
    }
  }

  return spans;
}

// ============================================================
// Body node parsers
// ============================================================

/** Parse a <text:list> element into a ListNode. */
function parseList(listEl: XmlElementNode, ctx: ParseContext): ListNode {
  const styleName = listEl.attrs["text:style-name"] ?? "";
  const ordered = ctx.listOrdered.get(styleName) ?? false;

  const items: ListItemNode[] = [];

  for (const child of listEl.children) {
    if (child.type !== "element" || child.tag !== "text:list-item") continue;

    let spans: InlineNode[] = [];
    let nested: ListNode | undefined;

    for (const itemChild of child.children) {
      if (itemChild.type !== "element") continue;
      if (itemChild.tag === "text:p" || itemChild.tag === "text:h") {
        const paraStyleName = itemChild.attrs["text:style-name"];
        const paraBaseStyle =
          paraStyleName !== undefined ? (ctx.charStyles.get(paraStyleName) ?? {}) : {};
        // Resolve paragraph-level visual style for list item text
        let baseVisualStyle: SpanStyle | undefined;
        if (paraStyleName) {
          const resolved = resolve(ctx.registry, "paragraph", paraStyleName);
          baseVisualStyle = extractSpanStyle(resolved.textProps, ctx.registry);
        }
        spans = spans.concat(parseSpans(itemChild, ctx, paraBaseStyle, undefined, baseVisualStyle));
      } else if (itemChild.tag === "text:list") {
        nested = parseList(itemChild, ctx);
      }
    }

    const item: ListItemNode = { spans };
    if (nested !== undefined) item.children = nested;
    items.push(item);
  }

  return { kind: "list", ordered, items };
}

/** Parse a <table:table> element into a TableNode. */
function parseTable(tableEl: XmlElementNode, ctx: ParseContext): TableNode {
  const tableStyleName = tableEl.attrs["table:style-name"];

  // Build column index → style name map from table:table-column elements.
  // Handles table:number-columns-repeated for compact column definitions.
  const columnStyleNames: string[] = [];
  for (const child of tableEl.children) {
    if (child.type !== "element" || child.tag !== "table:table-column") continue;
    const colStyleName = child.attrs["table:style-name"] ?? "";
    const repeated = parseInt(child.attrs["table:number-columns-repeated"] ?? "1", 10);
    for (let i = 0; i < repeated; i++) {
      columnStyleNames.push(colStyleName);
    }
  }

  const rows: TableRowNode[] = [];

  for (const child of tableEl.children) {
    if (child.type !== "element" || child.tag !== "table:table-row") continue;

    // Resolve row style
    let rowStyle: RowStyle | undefined;
    const rowStyleName = child.attrs["table:style-name"];
    if (rowStyleName) {
      const resolved = resolve(ctx.registry, "table-row", rowStyleName);
      const bg = resolved.cellProps.get("fo:background-color");
      if (bg && bg !== "transparent") rowStyle = { backgroundColor: bg };
    }

    const cells: TableCellNode[] = [];
    let colIndex = 0;

    for (const cellEl of child.children) {
      if (cellEl.type !== "element") continue;
      // Skip covered cells — they are placeholders for merged cell spans
      if (cellEl.tag === "table:covered-table-cell") {
        colIndex++;
        continue;
      }
      if (cellEl.tag !== "table:table-cell") continue;

      const colSpan = parseInt(cellEl.attrs["table:number-columns-spanned"] ?? "1", 10);
      const rowSpan = parseInt(cellEl.attrs["table:number-rows-spanned"] ?? "1", 10);

      // Resolve cell style
      const cellStyleName = cellEl.attrs["table:style-name"];
      let cellStyle: CellStyle | undefined;
      let cellTextStyle: SpanStyle | undefined;

      if (cellStyleName) {
        const resolved = resolve(ctx.registry, "table-cell", cellStyleName);
        cellStyle = buildCellStyle(resolved.cellProps);
        cellTextStyle = extractSpanStyle(resolved.textProps, ctx.registry);
      }

      // Merge column width from the matching table:table-column style if not
      // already set by the cell style itself
      if (!cellStyle?.columnWidth && colIndex < columnStyleNames.length) {
        const colStyleName = columnStyleNames[colIndex];
        if (colStyleName) {
          const colResolved = resolve(ctx.registry, "table-column", colStyleName);
          const cw = colResolved.cellProps.get("style:column-width");
          if (cw) {
            cellStyle = cellStyle ?? {};
            cellStyle.columnWidth = cw;
          }
        }
      }

      // Collect spans from all <text:p> children
      // (multi-paragraph cells are flattened for Tier 1/2; Tier 3 will model them separately)
      let spans: InlineNode[] = [];
      for (const cellChild of cellEl.children) {
        if (cellChild.type === "element" && cellChild.tag === "text:p") {
          const paraStyleName = cellChild.attrs["text:style-name"];
          const paraBaseStyle =
            paraStyleName !== undefined ? (ctx.charStyles.get(paraStyleName) ?? {}) : {};
          let baseVisualStyle: SpanStyle | undefined;
          if (paraStyleName) {
            const resolved = resolve(ctx.registry, "paragraph", paraStyleName);
            baseVisualStyle = extractSpanStyle(resolved.textProps, ctx.registry);
          }
          spans = spans.concat(
            parseSpans(cellChild, ctx, paraBaseStyle, undefined, baseVisualStyle),
          );
        }
      }

      const cell: TableCellNode = { spans };
      if (colSpan > 1) cell.colSpan = colSpan;
      if (rowSpan > 1) cell.rowSpan = rowSpan;
      if (cellStyleName) cell.styleName = cellStyleName;
      if (cellTextStyle) cell.textStyle = cellTextStyle;
      if (cellStyle) cell.cellStyle = cellStyle;

      cells.push(cell);
      colIndex += colSpan;
    }

    const row: TableRowNode = { cells };
    if (rowStyle) row.rowStyle = rowStyle;
    rows.push(row);
  }

  const tableNode: TableNode = { kind: "table", rows };
  if (tableStyleName) tableNode.styleName = tableStyleName;
  return tableNode;
}

/**
 * Walk the children of an <office:text> (or <text:section>) element and
 * produce an ordered array of BodyNode objects.
 *
 * Handles paragraphs, headings, lists, tables, and sections (transparent
 * containers). text:tracked-changes and all other elements are skipped.
 */
function parseBodyNodes(bodyTextEl: XmlElementNode, ctx: ParseContext): BodyNode[] {
  const nodes: BodyNode[] = [];

  for (const child of bodyTextEl.children) {
    if (child.type !== "element") continue;

    switch (child.tag) {
      case "text:p": {
        const paraStyleName = child.attrs["text:style-name"];
        const paraBaseStyle =
          paraStyleName !== undefined ? (ctx.charStyles.get(paraStyleName) ?? {}) : {};

        let textStyle: SpanStyle | undefined;
        if (paraStyleName) {
          const resolved = resolve(ctx.registry, "paragraph", paraStyleName);
          textStyle = extractSpanStyle(resolved.textProps, ctx.registry);
        }

        const para: ParagraphNode = {
          kind: "paragraph",
          spans: parseSpans(child, ctx, paraBaseStyle, undefined, textStyle),
        };
        if (paraStyleName) para.styleName = paraStyleName;
        if (textStyle) para.textStyle = textStyle;
        nodes.push(para);
        break;
      }

      case "text:h": {
        const rawLevel = parseInt(child.attrs["text:outline-level"] ?? "1", 10);
        const level = Math.min(Math.max(rawLevel, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6;
        const headingStyleName = child.attrs["text:style-name"];
        const headingBaseStyle =
          headingStyleName !== undefined ? (ctx.charStyles.get(headingStyleName) ?? {}) : {};

        let textStyle: SpanStyle | undefined;
        if (headingStyleName) {
          const resolved = resolve(ctx.registry, "paragraph", headingStyleName);
          textStyle = extractSpanStyle(resolved.textProps, ctx.registry);
        }

        const heading: HeadingNode = {
          kind: "heading",
          level,
          spans: parseSpans(child, ctx, headingBaseStyle, undefined, textStyle),
        };
        if (headingStyleName) heading.styleName = headingStyleName;
        if (textStyle) heading.textStyle = textStyle;
        nodes.push(heading);
        break;
      }

      case "text:list":
        nodes.push(parseList(child, ctx));
        break;

      case "table:table":
        nodes.push(parseTable(child, ctx));
        break;

      case "text:section":
        // Sections are transparent containers — recurse into their content
        nodes.push(...parseBodyNodes(child, ctx));
        break;

      // text:tracked-changes and all other top-level elements: skip
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
 * Reads content.xml for the document body and automatic styles,
 * styles.xml for named styles and font faces, meta.xml for document
 * metadata, and META-INF/manifest.xml for image MIME types. Extracts
 * all Pictures/* entries for embedded image resolution.
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

  const stylesXmlBytes = zip["styles.xml"];
  const stylesRoot = stylesXmlBytes ? parseXml(strFromU8(stylesXmlBytes)) : undefined;

  // Collect all Pictures/* entries from the ZIP
  const imageBytes = new Map<string, Uint8Array>();
  for (const [path, entry] of Object.entries(zip)) {
    if (path.startsWith("Pictures/")) {
      imageBytes.set(path, entry);
    }
  }

  // Parse manifest for authoritative MIME types
  const manifestBytes = zip["META-INF/manifest.xml"];
  const manifestTypes = manifestBytes
    ? parseManifest(strFromU8(manifestBytes))
    : new Map<string, string>();

  // Build semantic style maps (bold, italic, list types)
  const { charStyles, listOrdered } = buildStyleMaps(contentRoot, stylesRoot);

  // Build visual style registry (color, font, size, cell styles)
  const registry = buildRegistry(contentRoot, stylesRoot);

  // Extract deletion IDs for tracked-change flattening
  const bodyEl = findElement(contentRoot, "office:body");
  const bodyTextEl = bodyEl ? findElement(bodyEl, "office:text") : undefined;
  const deletionIds = bodyTextEl ? parseDeletionIds(bodyTextEl) : new Set<string>();

  const ctx: ParseContext = {
    charStyles,
    listOrdered,
    registry,
    imageBytes,
    manifestTypes,
    deletionIds,
  };

  const body: BodyNode[] = bodyTextEl ? parseBodyNodes(bodyTextEl, ctx) : [];

  return {
    metadata,
    body,
    toHtml(options?: HtmlOptions): string {
      return renderHtml(body, options);
    },
  };
}
