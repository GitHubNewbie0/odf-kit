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
 * 5. Extract tracked-change changed-region metadata from office:text
 * 6. Walk office:body/office:text to produce BodyNode[]
 * 7. Parse page layout and master-page header/footer content from styles.xml
 * 8. Parse meta.xml for document metadata
 * 9. Return OdtDocumentModel with body, metadata, page layout, headers/footers,
 *    and toHtml()
 *
 * Tier 3 additions:
 *  - ParagraphStyle: text-align, margins, padding, line-height on paragraphs and headings
 *  - ImageNode.wrapMode: style:wrap resolved from graphic style via registry
 *  - PageLayout: page dimensions and margins from style:page-layout in styles.xml
 *  - Header/footer content: parsed from style:master-page in styles.xml
 *  - SectionNode: text:section surfaces as a named block node (was transparent)
 *  - Tracked changes (all three modes):
 *      "final"    — accept all: insertions kept, deletions suppressed (unchanged behavior)
 *      "original" — reject all: insertions suppressed, deletions restored
 *      "changes"  — full model: TrackedChangeNode emitted for block-level change markers
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
  ParagraphStyle,
  ImageNode,
  NoteNode,
  FieldNode,
  CellStyle,
  RowStyle,
  BorderStyle,
  SectionNode,
  TrackedChangeNode,
  PageLayout,
  HtmlOptions,
  ReadOdtOptions,
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
// Internal tracked-change region model
// ============================================================

/**
 * Metadata for a single changed region from text:tracked-changes.
 *
 * deletionEl is the raw text:deletion element, stored for lazy body
 * parsing when a text:change point marker is encountered during body
 * walking. Body parsing requires a fully built ParseContext, so it
 * cannot happen during the initial changed-region scan.
 */
interface ChangedRegion {
  type: "insertion" | "deletion" | "format-change";
  author?: string;
  date?: string;
  /** Raw text:deletion element. Present only for deletion regions. */
  deletionEl?: XmlElementNode;
}

/**
 * Mutable tracking state for inline and block-level change marker
 * processing. Shared via ParseContext so state persists across recursive
 * parseSpans calls within the same paragraph.
 *
 * skipping:  true when currently inside an insertion region that should
 *            be suppressed ("original" mode only).
 * changeId:  the change ID that opened the current skip zone.
 */
interface SkipState {
  skipping: boolean;
  changeId?: string;
}

/**
 * Mutable collection state for block-level insertion tracking in
 * "changes" mode.
 *
 * When collecting is true, body nodes are pushed into buffer instead of
 * the main nodes array. When the matching text:change-end is encountered,
 * the buffer is wrapped in a TrackedChangeNode and pushed to nodes.
 *
 * collecting:  true when inside a block-spanning insertion region.
 * changeId:    the change ID that opened the collection zone.
 * buffer:      accumulates body nodes belonging to the insertion.
 * region:      the ChangedRegion metadata for the active insertion.
 */
interface CollectState {
  collecting: boolean;
  changeId?: string;
  buffer: BodyNode[];
  region?: ChangedRegion;
}

// ============================================================
// Parse context
// ============================================================

/**
 * All context needed to parse the body of an ODT document.
 *
 * Passed through the entire parse chain so individual parsers can
 * resolve both semantic (bold/italic) and visual (color/font) styles,
 * look up image bytes, and handle tracked changes per the requested mode.
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
  /** Tracked-change regions keyed by text:id. */
  changedRegions: Map<string, ChangedRegion>;
  /** Tracked-changes rendering mode. */
  trackedChanges: "final" | "original" | "changes";
  /**
   * Mutable skip state for original mode.
   * Shared across all recursive parseSpans calls within a body walk.
   */
  skipState: SkipState;
  /**
   * Mutable collection state for changes mode block-level insertions.
   * When collecting, body nodes are buffered and wrapped in a
   * TrackedChangeNode when the matching text:change-end is hit.
   */
  collectState: CollectState;
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
// Tracked-change region scanner
// ============================================================

/**
 * Scan the text:tracked-changes block (if present) and build a map of
 * change ID → ChangedRegion metadata.
 *
 * For deletions, the raw text:deletion element is stored for lazy body
 * parsing when the matching text:change point marker is encountered
 * during body walking (at which point ParseContext is available).
 *
 * For insertions and format-changes, no body content is stored here —
 * their content lives inline in the body between change markers.
 *
 * @param bodyTextEl - The office:text element containing text:tracked-changes.
 * @returns Map of text:id → ChangedRegion.
 */
function parseChangedRegions(bodyTextEl: XmlElementNode): Map<string, ChangedRegion> {
  const regions = new Map<string, ChangedRegion>();
  const tcEl = findElement(bodyTextEl, "text:tracked-changes");
  if (!tcEl) return regions;

  for (const child of tcEl.children) {
    if (child.type !== "element" || child.tag !== "text:changed-region") continue;
    const id = child.attrs["text:id"];
    if (!id) continue;

    let type: "insertion" | "deletion" | "format-change" | undefined;
    let deletionEl: XmlElementNode | undefined;
    let author: string | undefined;
    let date: string | undefined;

    for (const regionChild of child.children) {
      if (regionChild.type !== "element") continue;

      if (regionChild.tag === "text:insertion") {
        type = "insertion";
        const creatorEl = findElement(regionChild, "dc:creator");
        if (creatorEl) author = textContent(creatorEl);
        const dateEl = findElement(regionChild, "dc:date");
        if (dateEl) date = textContent(dateEl);
      } else if (regionChild.tag === "text:deletion") {
        type = "deletion";
        deletionEl = regionChild;
        const creatorEl = findElement(regionChild, "dc:creator");
        if (creatorEl) author = textContent(creatorEl);
        const dateEl = findElement(regionChild, "dc:date");
        if (dateEl) date = textContent(dateEl);
      } else if (regionChild.tag === "text:format-change") {
        type = "format-change";
        const creatorEl = findElement(regionChild, "dc:creator");
        if (creatorEl) author = textContent(creatorEl);
        const dateEl = findElement(regionChild, "dc:date");
        if (dateEl) date = textContent(dateEl);
      }
    }

    if (!type) continue;

    const region: ChangedRegion = { type };
    if (author) region.author = author;
    if (date) region.date = date;
    if (deletionEl) region.deletionEl = deletionEl;

    regions.set(id, region);
  }

  return regions;
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
// Tier 3 — Paragraph layout extraction
// ============================================================

/**
 * Extract a ParagraphStyle from the paragraphProps of a resolved style.
 *
 * Maps ODF paragraph property attributes to ParagraphStyle fields. Returns
 * undefined when none of the supported properties are set so
 * ParagraphNode.paragraphStyle is absent entirely for unstyled paragraphs.
 *
 * fo:text-align values are passed through verbatim per ODF 1.2 §20.216
 * ("start", "end", "left", "right", "center", "justify") — all are valid
 * CSS text-align values in modern browsers.
 *
 * fo:margin-top/fo:space-before both map to marginTop. ODF producers use
 * both; fo:margin-top takes precedence when both are present.
 * Similarly fo:margin-bottom / fo:space-after → marginBottom.
 */
function extractParagraphStyle(paragraphProps: Map<string, string>): ParagraphStyle | undefined {
  const style: ParagraphStyle = {};
  let hasAny = false;

  const textAlign = paragraphProps.get("fo:text-align");
  if (textAlign) {
    style.textAlign = textAlign;
    hasAny = true;
  }

  const marginLeft = paragraphProps.get("fo:margin-left");
  if (marginLeft) {
    style.marginLeft = marginLeft;
    hasAny = true;
  }

  const marginRight = paragraphProps.get("fo:margin-right");
  if (marginRight) {
    style.marginRight = marginRight;
    hasAny = true;
  }

  // fo:margin-top takes precedence over fo:space-before when both present
  const marginTop = paragraphProps.get("fo:margin-top") ?? paragraphProps.get("fo:space-before");
  if (marginTop) {
    style.marginTop = marginTop;
    hasAny = true;
  }

  // fo:margin-bottom takes precedence over fo:space-after when both present
  const marginBottom =
    paragraphProps.get("fo:margin-bottom") ?? paragraphProps.get("fo:space-after");
  if (marginBottom) {
    style.marginBottom = marginBottom;
    hasAny = true;
  }

  const paddingLeft = paragraphProps.get("fo:padding-left");
  if (paddingLeft) {
    style.paddingLeft = paddingLeft;
    hasAny = true;
  }

  const paddingRight = paragraphProps.get("fo:padding-right");
  if (paddingRight) {
    style.paddingRight = paddingRight;
    hasAny = true;
  }

  const lineHeight = paragraphProps.get("fo:line-height");
  if (lineHeight) {
    style.lineHeight = lineHeight;
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
 * text:bookmark-end, text:bookmark-ref, tracked-change inline markers,
 * and all ODF text field elements.
 *
 * Tier 3 tracked-change handling (inline markers):
 *  "final":    change markers skipped; insertion content included normally.
 *  "original": text:change-start for an insertion → activate skip zone;
 *              text:change-end → deactivate skip zone; content inside
 *              a skip zone is suppressed. text:change (inline deletion
 *              point) is skipped — deleted content lives only in the
 *              registry and is not inline.
 *  "changes":  all inline markers skipped transparently; inline insertion
 *              content is included normally. Block-level change markers
 *              emit TrackedChangeNode in parseBodyNodes.
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
    // Suppress all output when inside a skip zone (original mode, insertion region)
    if (ctx.skipState.skipping) {
      if (child.type === "element") {
        if (child.tag === "text:change-end") {
          const changeId = child.attrs["text:change-id"];
          if (changeId === ctx.skipState.changeId) {
            ctx.skipState.skipping = false;
            ctx.skipState.changeId = undefined;
          }
        }
        // text:change-start nested inside a skip zone: extend skip to innermost end
        // All other elements: suppressed
      }
      continue;
    }

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

        // Tier 3: resolve wrapMode from the frame's graphic style
        const frameStyleName = child.attrs["draw:style-name"];
        if (frameStyleName) {
          const graphicResolved = resolve(ctx.registry, "graphic", frameStyleName);
          const wrapMode = graphicResolved.graphicProps.get("style:wrap");
          if (wrapMode) imageNode.wrapMode = wrapMode;
        }

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

      // ── Tracked-change inline markers ────────────────────────────────────

      case "text:change-start": {
        const changeId = child.attrs["text:change-id"];
        if (!changeId) break;
        const region = ctx.changedRegions.get(changeId);
        if (!region) break;
        // "original": suppress insertion content between this marker and its end
        if (ctx.trackedChanges === "original" && region.type === "insertion") {
          ctx.skipState.skipping = true;
          ctx.skipState.changeId = changeId;
        }
        // "final" and "changes": transparent — skip the marker, keep the content
        break;
      }

      case "text:change-end": {
        const changeId = child.attrs["text:change-id"];
        // Clear skip state if this end matches the active skip zone.
        // (Already cleared in the skip-zone branch above when skipping;
        //  this handles the non-skipping case gracefully.)
        if (ctx.skipState.changeId === changeId) {
          ctx.skipState.skipping = false;
          ctx.skipState.changeId = undefined;
        }
        break;
      }

      case "text:change":
        // Inline deletion / format-change point marker.
        // "final":    no-op — deleted content is not inline, nothing to restore.
        // "original": no-op — deleted content not restored inline; only block-level
        //             text:change markers between paragraphs restore content.
        // "changes":  cannot emit TrackedChangeNode (not an InlineNode); skip.
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
 * Walk the children of a body container element (office:text, text:section,
 * style:header, style:footer, text:note-body, etc.) and produce an ordered
 * array of BodyNode objects.
 *
 * Tier 3 additions:
 *  - text:section surfaces as SectionNode (was transparent in Tier 2).
 *  - Block-level tracked-change markers (text:change, text:change-start,
 *    text:change-end between paragraphs) are handled per the active mode.
 *
 * Block-level change marker semantics:
 *  "final":    all markers skipped; body nodes emitted normally.
 *  "original": text:change-start for insertion → suppress following nodes
 *              until matching text:change-end; text:change for deletion →
 *              emit the deleted BodyNode content from the registry.
 *  "changes":  text:change → emit TrackedChangeNode with deletion/format-
 *              change content; text:change-start → emit TrackedChangeNode
 *              for insertion and suppress following nodes until matching
 *              text:change-end (insertion content wrapped in the node).
 *
 * text:tracked-changes is always skipped — it is metadata, not content.
 */
function parseBodyNodes(bodyTextEl: XmlElementNode, ctx: ParseContext): BodyNode[] {
  const nodes: BodyNode[] = [];

  for (const child of bodyTextEl.children) {
    if (child.type !== "element") continue;

    // ── Block-level skip zone (original mode, block-spanning insertions) ──
    if (ctx.skipState.skipping) {
      if (child.tag === "text:change-end") {
        const changeId = child.attrs["text:change-id"];
        if (changeId === ctx.skipState.changeId) {
          ctx.skipState.skipping = false;
          ctx.skipState.changeId = undefined;
        }
      }
      // All other nodes within the skip zone are suppressed
      continue;
    }

    // ── Routing: collect into insertion buffer or emit to main nodes ──────
    // In "changes" mode, nodes between a text:change-start and its matching
    // text:change-end for an insertion are buffered. The buffer is wrapped
    // in a TrackedChangeNode when the end marker is hit. All other nodes
    // go directly to `nodes`.
    const dest: BodyNode[] = ctx.collectState.collecting ? ctx.collectState.buffer : nodes;

    switch (child.tag) {
      case "text:p": {
        const paraStyleName = child.attrs["text:style-name"];
        const paraBaseStyle =
          paraStyleName !== undefined ? (ctx.charStyles.get(paraStyleName) ?? {}) : {};

        let textStyle: SpanStyle | undefined;
        let paragraphStyle: ParagraphStyle | undefined;
        if (paraStyleName) {
          const resolved = resolve(ctx.registry, "paragraph", paraStyleName);
          textStyle = extractSpanStyle(resolved.textProps, ctx.registry);
          paragraphStyle = extractParagraphStyle(resolved.paragraphProps);
        }

        const para: ParagraphNode = {
          kind: "paragraph",
          spans: parseSpans(child, ctx, paraBaseStyle, undefined, textStyle),
        };
        if (paraStyleName) para.styleName = paraStyleName;
        if (textStyle) para.textStyle = textStyle;
        if (paragraphStyle) para.paragraphStyle = paragraphStyle;
        dest.push(para);
        break;
      }

      case "text:h": {
        const rawLevel = parseInt(child.attrs["text:outline-level"] ?? "1", 10);
        const level = Math.min(Math.max(rawLevel, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6;
        const headingStyleName = child.attrs["text:style-name"];
        const headingBaseStyle =
          headingStyleName !== undefined ? (ctx.charStyles.get(headingStyleName) ?? {}) : {};

        let textStyle: SpanStyle | undefined;
        let paragraphStyle: ParagraphStyle | undefined;
        if (headingStyleName) {
          const resolved = resolve(ctx.registry, "paragraph", headingStyleName);
          textStyle = extractSpanStyle(resolved.textProps, ctx.registry);
          paragraphStyle = extractParagraphStyle(resolved.paragraphProps);
        }

        const heading: HeadingNode = {
          kind: "heading",
          level,
          spans: parseSpans(child, ctx, headingBaseStyle, undefined, textStyle),
        };
        if (headingStyleName) heading.styleName = headingStyleName;
        if (textStyle) heading.textStyle = textStyle;
        if (paragraphStyle) heading.paragraphStyle = paragraphStyle;
        dest.push(heading);
        break;
      }

      case "text:list":
        dest.push(parseList(child, ctx));
        break;

      case "table:table":
        dest.push(parseTable(child, ctx));
        break;

      case "text:section": {
        // Tier 3: surface as SectionNode instead of transparent recursion
        const sectionName = child.attrs["text:name"];
        const sectionBody = parseBodyNodes(child, ctx);
        const sectionNode: SectionNode = { kind: "section", body: sectionBody };
        if (sectionName) sectionNode.name = sectionName;
        dest.push(sectionNode);
        break;
      }

      // ── Block-level tracked-change markers ──────────────────────────────

      case "text:change": {
        const changeId = child.attrs["text:change-id"];
        if (!changeId) break;
        const region = ctx.changedRegions.get(changeId);
        if (!region) break;

        if (ctx.trackedChanges === "original" && region.type === "deletion") {
          // Restore deleted block content at this position
          if (region.deletionEl) {
            nodes.push(...parseBodyNodes(region.deletionEl, ctx));
          }
        } else if (ctx.trackedChanges === "changes") {
          // Emit a TrackedChangeNode with deletion/format-change content.
          // Deletions carry restored content from the registry; format-changes
          // have an empty body (no content moved, only style changed).
          const body: BodyNode[] =
            region.type === "deletion" && region.deletionEl
              ? parseBodyNodes(region.deletionEl, ctx)
              : [];
          const tcNode: TrackedChangeNode = {
            kind: "tracked-change",
            changeType: region.type,
            changeId,
            body,
          };
          if (region.author) tcNode.author = region.author;
          if (region.date) tcNode.date = region.date;
          nodes.push(tcNode);
        }
        // "final": skip — deletions are not in the body, nothing to suppress
        break;
      }

      case "text:change-start": {
        const changeId = child.attrs["text:change-id"];
        if (!changeId) break;
        const region = ctx.changedRegions.get(changeId);
        if (!region) break;

        if (ctx.trackedChanges === "original" && region.type === "insertion") {
          // Suppress the following block nodes (the inserted content) until
          // the matching text:change-end
          ctx.skipState.skipping = true;
          ctx.skipState.changeId = changeId;
        } else if (ctx.trackedChanges === "changes" && region.type === "insertion") {
          // Activate collection mode. Subsequent body nodes go into the buffer
          // until the matching text:change-end closes the zone and wraps the
          // buffer in a TrackedChangeNode pushed to the main nodes array.
          ctx.collectState.collecting = true;
          ctx.collectState.changeId = changeId;
          ctx.collectState.buffer = [];
          ctx.collectState.region = region;
        }
        // "final": transparent — skip marker, insertion content emitted normally
        break;
      }

      case "text:change-end": {
        const changeId = child.attrs["text:change-id"];

        // Close an active collection zone when the end marker matches
        if (
          ctx.collectState.collecting &&
          changeId === ctx.collectState.changeId &&
          ctx.collectState.region
        ) {
          const region = ctx.collectState.region;
          const tcNode: TrackedChangeNode = {
            kind: "tracked-change",
            changeType: "insertion",
            changeId: ctx.collectState.changeId!,
            body: ctx.collectState.buffer,
          };
          if (region.author) tcNode.author = region.author;
          if (region.date) tcNode.date = region.date;
          nodes.push(tcNode);

          // Reset collection state
          ctx.collectState.collecting = false;
          ctx.collectState.changeId = undefined;
          ctx.collectState.buffer = [];
          ctx.collectState.region = undefined;
        }
        // "original": skip-zone end handled at top of loop
        // "final" / unmatched: transparent — skip the marker
        break;
      }

      case "text:tracked-changes":
        // Metadata block — never emit as body content
        break;

      // All other top-level elements: skip
    }
  }

  return nodes;
}

// ============================================================
// Tier 3 — Page layout parser
// ============================================================

/**
 * Parse the default page layout from styles.xml.
 *
 * ODF page layout structure (styles.xml):
 *  office:automatic-styles → style:page-layout (named)
 *  office:master-styles    → style:master-page (references layout by name)
 *
 * The default master page is the one named "Standard" (LibreOffice default),
 * or the first master page when no "Standard" page exists.
 *
 * @param stylesRoot - Parsed root of styles.xml.
 * @returns PageLayout when a page layout is found, undefined otherwise.
 */
function parsePageLayout(stylesRoot: XmlElementNode): PageLayout | undefined {
  // Locate the default master page
  const masterStylesEl = findElement(stylesRoot, "office:master-styles");
  if (!masterStylesEl) return undefined;

  let masterPage: XmlElementNode | undefined;
  for (const child of masterStylesEl.children) {
    if (child.type !== "element" || child.tag !== "style:master-page") continue;
    // Prefer "Standard"; otherwise take the first master page found
    if (!masterPage || child.attrs["style:name"] === "Standard") {
      masterPage = child;
    }
    if (child.attrs["style:name"] === "Standard") break;
  }
  if (!masterPage) return undefined;

  const layoutName = masterPage.attrs["style:page-layout-name"];
  if (!layoutName) return undefined;

  // Locate the named page-layout in automatic-styles
  const autoStylesEl = findElement(stylesRoot, "office:automatic-styles");
  if (!autoStylesEl) return undefined;

  let pageLayoutEl: XmlElementNode | undefined;
  for (const child of autoStylesEl.children) {
    if (
      child.type === "element" &&
      child.tag === "style:page-layout" &&
      child.attrs["style:name"] === layoutName
    ) {
      pageLayoutEl = child;
      break;
    }
  }
  if (!pageLayoutEl) return undefined;

  const propsEl = findElement(pageLayoutEl, "style:page-layout-properties");
  if (!propsEl) return undefined;

  const layout: PageLayout = {};
  let hasAny = false;

  const width = propsEl.attrs["fo:page-width"];
  if (width) {
    layout.width = width;
    hasAny = true;
  }

  const height = propsEl.attrs["fo:page-height"];
  if (height) {
    layout.height = height;
    hasAny = true;
  }

  const mt = propsEl.attrs["fo:margin-top"];
  if (mt) {
    layout.marginTop = mt;
    hasAny = true;
  }

  const mb = propsEl.attrs["fo:margin-bottom"];
  if (mb) {
    layout.marginBottom = mb;
    hasAny = true;
  }

  const ml = propsEl.attrs["fo:margin-left"];
  if (ml) {
    layout.marginLeft = ml;
    hasAny = true;
  }

  const mr = propsEl.attrs["fo:margin-right"];
  if (mr) {
    layout.marginRight = mr;
    hasAny = true;
  }

  // Derive orientation by comparing dimensions
  if (layout.width && layout.height) {
    const w = parseFloat(layout.width);
    const h = parseFloat(layout.height);
    if (!isNaN(w) && !isNaN(h)) {
      layout.orientation = w > h ? "landscape" : "portrait";
      hasAny = true;
    }
  }

  return hasAny ? layout : undefined;
}

// ============================================================
// Tier 3 — Master page header/footer parser
// ============================================================

/**
 * Parse the header and footer zones from the default master page.
 *
 * ODF master page structure (styles.xml → office:master-styles):
 *  style:master-page
 *    style:header       — default header (all pages except first when
 *                         style:header-first is present)
 *    style:footer       — default footer
 *    style:header-first — first-page header (requires style:display="true"
 *                         on the master page)
 *    style:footer-first — first-page footer
 *
 * Each zone element contains text:p / text:h / text:list / table:table
 * children — the same elements as office:text — so parseBodyNodes is
 * used directly. The result is BodyNode[] for each zone.
 *
 * @param stylesRoot - Parsed root of styles.xml.
 * @param ctx        - Parse context for style and image resolution.
 * @returns Object with up to four BodyNode[] arrays; each absent when
 *   the zone element is not present in the document.
 */
function parseMasterPageContent(
  stylesRoot: XmlElementNode,
  ctx: ParseContext,
): {
  header?: BodyNode[];
  footer?: BodyNode[];
  firstPageHeader?: BodyNode[];
  firstPageFooter?: BodyNode[];
} {
  const result: {
    header?: BodyNode[];
    footer?: BodyNode[];
    firstPageHeader?: BodyNode[];
    firstPageFooter?: BodyNode[];
  } = {};

  const masterStylesEl = findElement(stylesRoot, "office:master-styles");
  if (!masterStylesEl) return result;

  // Find the default master page (same logic as parsePageLayout)
  let masterPage: XmlElementNode | undefined;
  for (const child of masterStylesEl.children) {
    if (child.type !== "element" || child.tag !== "style:master-page") continue;
    if (!masterPage || child.attrs["style:name"] === "Standard") {
      masterPage = child;
    }
    if (child.attrs["style:name"] === "Standard") break;
  }
  if (!masterPage) return result;

  const headerEl = findElement(masterPage, "style:header");
  if (headerEl) {
    const body = parseBodyNodes(headerEl, ctx);
    if (body.length > 0) result.header = body;
  }

  const footerEl = findElement(masterPage, "style:footer");
  if (footerEl) {
    const body = parseBodyNodes(footerEl, ctx);
    if (body.length > 0) result.footer = body;
  }

  const firstHeaderEl = findElement(masterPage, "style:header-first");
  if (firstHeaderEl) {
    const body = parseBodyNodes(firstHeaderEl, ctx);
    if (body.length > 0) result.firstPageHeader = body;
  }

  const firstFooterEl = findElement(masterPage, "style:footer-first");
  if (firstFooterEl) {
    const body = parseBodyNodes(firstFooterEl, ctx);
    if (body.length > 0) result.firstPageFooter = body;
  }

  return result;
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
 * styles.xml for named styles, font faces, page layout, and master page
 * header/footer content, meta.xml for document metadata, and
 * META-INF/manifest.xml for image MIME types. Extracts all Pictures/*
 * entries for embedded image resolution.
 *
 * @param bytes   - The raw .odt file as a Uint8Array.
 * @param options - Optional read options. See ReadOdtOptions.
 * @returns A populated OdtDocumentModel with body, metadata, page layout,
 *   headers/footers, and toHtml().
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
 * console.log(doc.pageLayout?.orientation);
 *
 * // Review mode
 * const review = readOdt(bytes, { trackedChanges: "changes" });
 * ```
 */
export function readOdt(bytes: Uint8Array, options?: ReadOdtOptions): OdtDocumentModel {
  const trackedChanges = options?.trackedChanges ?? "final";

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

  // Build visual style registry (color, font, size, cell styles, graphic styles)
  const registry = buildRegistry(contentRoot, stylesRoot);

  // Extract tracked-change region metadata
  const bodyEl = findElement(contentRoot, "office:body");
  const bodyTextEl = bodyEl ? findElement(bodyEl, "office:text") : undefined;
  const changedRegions = bodyTextEl
    ? parseChangedRegions(bodyTextEl)
    : new Map<string, ChangedRegion>();

  const ctx: ParseContext = {
    charStyles,
    listOrdered,
    registry,
    imageBytes,
    manifestTypes,
    changedRegions,
    trackedChanges,
    skipState: { skipping: false },
    collectState: { collecting: false, buffer: [] },
  };

  const body: BodyNode[] = bodyTextEl ? parseBodyNodes(bodyTextEl, ctx) : [];

  // Parse page layout and header/footer from styles.xml
  const pageLayout = stylesRoot ? parsePageLayout(stylesRoot) : undefined;
  const masterPageContent = stylesRoot ? parseMasterPageContent(stylesRoot, ctx) : {};

  return {
    metadata,
    body,
    ...(pageLayout && { pageLayout }),
    ...(masterPageContent.header && { header: masterPageContent.header }),
    ...(masterPageContent.footer && { footer: masterPageContent.footer }),
    ...(masterPageContent.firstPageHeader && {
      firstPageHeader: masterPageContent.firstPageHeader,
    }),
    ...(masterPageContent.firstPageFooter && {
      firstPageFooter: masterPageContent.firstPageFooter,
    }),
    toHtml(htmlOptions?: HtmlOptions): string {
      return renderHtml(body, htmlOptions);
    },
  };
}
