/**
 * HTML-to-ODT parser.
 *
 * Walks an HTML string (reusing the existing XML parser since editor-generated
 * HTML from Nextcloud Text, TipTap, ProseMirror, CKEditor, and Quill is
 * well-formed XHTML), maps elements to OdtDocument API calls, and populates
 * the provided document.
 *
 * Supported block elements: h1–h6, p, ul, ol, li, table, blockquote, pre,
 * hr, figure/figcaption, div, section, article, main, header, footer, nav,
 * aside, body, html (transparent containers).
 *
 * Supported inline elements: strong, b, em, i, u, s, del, sup, sub, a,
 * code, mark, span (with inline CSS), br, img.
 *
 * Inline CSS properties parsed: color, font-size, font-family, font-weight,
 * font-style, text-decoration, background-color (on table cells only).
 *
 * Images: base64 data URLs decoded automatically. Remote URLs resolved via
 * the `images` map or `fetchImage` callback if provided. Skipped silently
 * if no resolution method is available or returns undefined.
 */

import { parseXml } from "../reader/xml-parser.js";
import type { XmlElementNode, XmlNode } from "../reader/xml-parser.js";
import type { OdtDocument } from "./document.js";
import { ParagraphBuilder } from "./paragraph-builder.js";
import { ListBuilder } from "./list-builder.js";
import type { TextRun, TextFormatting, ParagraphOptions, CellOptions } from "./types.js";
import { detectMime, isBase64Image, base64ToUint8Array } from "../lexical/util/detect-mime.js";

// ─── Constants ────────────────────────────────────────────────────────

/** HR border style — matches a standard horizontal rule appearance. */
const HR_BORDER = "0.5pt solid #000000";

/** Default indentation for blockquote elements. */
const BLOCKQUOTE_INDENT = "1cm";

/** Monospace font family for <pre> and <code> elements. */
const MONOSPACE_FONT = "Courier New";

/** Default image width when no width attribute is present. */
const DEFAULT_IMAGE_WIDTH = "10cm";

/** Block-level HTML tags — used to distinguish block from inline content. */
const BLOCK_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "div",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "nav",
  "aside",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "blockquote",
  "pre",
  "hr",
  "figure",
  "figcaption",
  "html",
  "body",
  "head",
  "script",
  "style",
  "img",
]);

/** List tags that may appear as children of <li>. */
const LIST_TAGS = new Set(["ul", "ol"]);

// ─── Image Context ────────────────────────────────────────────────────

/**
 * Carries image resolution state through the parser.
 * Passed to all walker functions so they can resolve images without
 * needing the options object threaded through every signature.
 */
interface ImageContext {
  images?: Record<string, Uint8Array>;
  fetchImage?: (src: string) => Promise<Uint8Array | undefined>;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Parse an HTML string and populate the provided OdtDocument.
 *
 * The HTML is wrapped in a `<div>` before parsing to ensure a single XML
 * root, making fragment HTML (no `<html>`/`<body>` wrapper) work correctly.
 * Full-document HTML with `<html>` and `<body>` tags is also handled —
 * those elements are treated as transparent containers.
 *
 * @param html       - HTML string to convert.
 * @param doc        - OdtDocument to populate.
 * @param images     - Pre-fetched image bytes keyed by src URL.
 * @param fetchImage - Async callback to fetch image bytes on demand.
 */
export async function parseHtml(
  html: string,
  doc: OdtDocument,
  images?: Record<string, Uint8Array>,
  fetchImage?: (src: string) => Promise<Uint8Array | undefined>,
): Promise<void> {
  const ctx: ImageContext = { images, fetchImage };
  // Wrap in a div to guarantee a single XML root for fragment HTML.
  // Full-document HTML is handled transparently since <html>/<body> recurse.
  const root = parseXml(`<div>${html}</div>`);
  await walkBlockChildren(root.children, doc, ctx);
}

// ─── Tag Normalization ────────────────────────────────────────────────

/** Normalize a tag name: lowercase and strip namespace prefix if present. */
function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/^[^:]+:/, "");
}

/** Return true if the tag is a known block-level element. */
function isBlockTag(tag: string): boolean {
  return BLOCK_TAGS.has(tag);
}

// ─── Image Resolution ─────────────────────────────────────────────────

/**
 * Resolve image bytes for a given src attribute value.
 *
 * Resolution order:
 * 1. Base64 data URL — decoded inline, no network call needed.
 * 2. `images` map — pre-fetched bytes keyed by src.
 * 3. `fetchImage` callback — called with the src URL.
 * 4. Returns undefined — caller skips the image silently.
 *
 * @param src - The img src attribute value.
 * @param ctx - Image context carrying the map and callback.
 * @returns Resolved bytes, or undefined if not resolvable.
 */
async function resolveImage(
  src: string,
  ctx: ImageContext,
): Promise<{ data: Uint8Array; mimeType: string } | undefined> {
  if (!src) return undefined;

  let data: Uint8Array | undefined;

  if (isBase64Image(src)) {
    // 1. Base64 data URL — always decodable
    data = base64ToUint8Array(src);
  } else if (ctx.images?.[src]) {
    // 2. Pre-fetched map
    data = ctx.images[src];
  } else if (ctx.fetchImage) {
    // 3. Async fetch callback
    data = await ctx.fetchImage(src);
  }

  if (!data || data.length === 0) return undefined;

  return { data, mimeType: detectMime(src, data) };
}

/**
 * Parse image dimensions from an <img> element's width/height attributes.
 *
 * Accepts numeric pixels ("200"), px-suffixed ("200px"), or CSS length
 * strings with units ("10cm", "3in"). Pixel values are converted to cm
 * at 96 DPI. Returns undefined for each dimension if not parseable.
 */
function parseImageDimensions(node: XmlElementNode): {
  width: string | undefined;
  height: string | undefined;
} {
  const parseAttr = (attr: string): string | undefined => {
    const raw = node.attrs[attr];
    if (!raw) return undefined;
    const trimmed = raw.trim();
    // Already has CSS units — pass through
    if (/^[\d.]+\s*(cm|mm|in|pt|pc|em|rem)$/.test(trimmed)) return trimmed;
    // Numeric or px
    const px = parseFloat(trimmed);
    if (!px || px <= 0) return undefined;
    const cm = (px / 96) * 2.54;
    return `${cm.toFixed(2)}cm`;
  };

  return { width: parseAttr("width"), height: parseAttr("height") };
}

// ─── Block Walking ────────────────────────────────────────────────────

/**
 * Walk a list of XML nodes as block-level content.
 *
 * Consecutive inline nodes and bare text are collected and flushed as a
 * single implicit paragraph when a block element is encountered, or at
 * the end of the list. This handles mixed block+inline content correctly.
 *
 * @param nodes           - Child nodes to walk.
 * @param doc             - Document to populate.
 * @param ctx             - Image resolution context.
 * @param defaultParaOpts - Inherited paragraph options (e.g. from blockquote).
 */
async function walkBlockChildren(
  nodes: XmlNode[],
  doc: OdtDocument,
  ctx: ImageContext,
  defaultParaOpts?: ParagraphOptions,
): Promise<void> {
  const pendingInlines: XmlNode[] = [];

  async function flushPending(): Promise<void> {
    if (pendingInlines.length === 0) return;
    const runs = await extractInline(pendingInlines, {}, ctx);
    const meaningful = runs.some(
      (r) => (r.text && r.text.trim().length > 0) || r.lineBreak || r.image != null,
    );
    if (meaningful) {
      doc.addParagraph((p) => applyRunsToBuilder(p, runs), defaultParaOpts);
    }
    pendingInlines.length = 0;
  }

  for (const node of nodes) {
    if (node.type === "text") {
      if (node.text.trim().length > 0) {
        pendingInlines.push(node);
      }
      continue;
    }

    const tag = normalizeTag(node.tag);
    if (isBlockTag(tag)) {
      await flushPending();
      await walkBlockElement(node, doc, ctx, defaultParaOpts);
    } else {
      // Inline element at block level — collect for implicit paragraph
      pendingInlines.push(node);
    }
  }

  await flushPending();
}

/**
 * Walk a single block-level element and emit the corresponding ODT content.
 */
async function walkBlockElement(
  node: XmlElementNode,
  doc: OdtDocument,
  ctx: ImageContext,
  defaultParaOpts?: ParagraphOptions,
): Promise<void> {
  const tag = normalizeTag(node.tag);

  switch (tag) {
    // ── Headings ───────────────────────────────────────────────────
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = parseInt(tag[1], 10);
      const runs = await extractInline(node.children, {}, ctx);
      doc.addHeading((p) => applyRunsToBuilder(p, runs), level);
      break;
    }

    // ── Paragraph ──────────────────────────────────────────────────
    case "p": {
      const runs = await extractInline(node.children, {}, ctx);
      const opts = mergeParagraphOptions(defaultParaOpts, parseParagraphOptions(node));
      doc.addParagraph((p) => applyRunsToBuilder(p, runs), opts);
      break;
    }

    // ── Blockquote ─────────────────────────────────────────────────
    case "blockquote": {
      await walkBlockChildren(
        node.children,
        doc,
        ctx,
        mergeParagraphOptions(defaultParaOpts, { indentLeft: BLOCKQUOTE_INDENT }) ?? {
          indentLeft: BLOCKQUOTE_INDENT,
        },
      );
      break;
    }

    // ── Preformatted ───────────────────────────────────────────────
    case "pre": {
      const text = extractTextContent(node).replace(/^\n/, "").replace(/\n$/, "");
      const lines = text.split("\n");
      doc.addParagraph((p) => {
        lines.forEach((line, i) => {
          p.addText(line, { fontFamily: MONOSPACE_FONT });
          if (i < lines.length - 1) p.addLineBreak();
        });
      });
      break;
    }

    // ── Horizontal rule ───────────────────────────────────────────
    case "hr": {
      doc.addParagraph("", { borderBottom: HR_BORDER });
      break;
    }

    // ── Lists ──────────────────────────────────────────────────────
    case "ul": {
      await walkList(node, doc, ctx, false);
      break;
    }

    case "ol": {
      await walkList(node, doc, ctx, true);
      break;
    }

    // ── Table ─────────────────────────────────────────────────────
    case "table": {
      await walkTable(node, doc, ctx);
      break;
    }

    // ── Standalone image ──────────────────────────────────────────
    case "img": {
      const src = node.attrs["src"] ?? "";
      const resolved = await resolveImage(src, ctx);
      if (resolved) {
        const { width, height } = parseImageDimensions(node);
        const alt = node.attrs["alt"];
        doc.addImage(resolved.data, {
          mimeType: resolved.mimeType,
          width: width ?? DEFAULT_IMAGE_WIDTH,
          height,
          ...(alt ? { alt } : {}),
        });
      }
      break;
    }

    // ── Figure ────────────────────────────────────────────────────
    case "figure": {
      // Emit the <img> child if present, then figcaption as a paragraph.
      for (const child of node.children) {
        if (child.type !== "element") continue;
        const childTag = normalizeTag(child.tag);
        if (childTag === "img") {
          const src = child.attrs["src"] ?? "";
          const resolved = await resolveImage(src, ctx);
          if (resolved) {
            const { width, height } = parseImageDimensions(child);
            const alt = child.attrs["alt"];
            doc.addImage(resolved.data, {
              mimeType: resolved.mimeType,
              width: width ?? DEFAULT_IMAGE_WIDTH,
              height,
              ...(alt ? { alt } : {}),
            });
          }
        } else if (childTag === "figcaption") {
          const runs = await extractInline(child.children, {}, ctx);
          doc.addParagraph((p) => applyRunsToBuilder(p, runs));
        }
      }
      break;
    }

    // ── Transparent block containers ──────────────────────────────
    case "div":
    case "section":
    case "article":
    case "main":
    case "header":
    case "footer":
    case "nav":
    case "aside":
    case "body":
    case "html": {
      await walkBlockChildren(node.children, doc, ctx, defaultParaOpts);
      break;
    }

    // ── Ignored ───────────────────────────────────────────────────
    case "head":
    case "script":
    case "style":
    case "meta":
    case "link":
      break;

    // ── Unknown block — recurse as transparent container ──────────
    default:
      await walkBlockChildren(node.children, doc, ctx, defaultParaOpts);
      break;
  }
}

// ─── List Walking ─────────────────────────────────────────────────────

/** Walk a <ul> or <ol> element and add a list to the document. */
async function walkList(
  node: XmlElementNode,
  doc: OdtDocument,
  ctx: ImageContext,
  ordered: boolean,
): Promise<void> {
  // Pre-extract all runs so we can use them inside the sync addList callback.
  const items = await extractListItems(node, ctx);
  doc.addList((l) => applyListItems(l, items), { type: ordered ? "numbered" : "bullet" });
}

interface ListItemData {
  runs: TextRun[];
  nested?: ListItemData[];
  nestedOrdered?: boolean;
}

/**
 * Pre-extract list item data asynchronously so it can be applied
 * synchronously inside the addList callback.
 */
async function extractListItems(
  listNode: XmlElementNode,
  ctx: ImageContext,
): Promise<ListItemData[]> {
  const items: ListItemData[] = [];

  for (const child of listNode.children) {
    if (child.type !== "element") continue;
    if (normalizeTag(child.tag) !== "li") continue;

    const inlineChildren: XmlNode[] = child.children.filter((c) => {
      if (c.type === "text") return true;
      return !LIST_TAGS.has(normalizeTag((c as XmlElementNode).tag));
    });

    const nestedListChild = child.children.find(
      (c): c is XmlElementNode => c.type === "element" && LIST_TAGS.has(normalizeTag(c.tag)),
    );

    const runs = await extractInline(inlineChildren, {}, ctx);

    const item: ListItemData = { runs };

    if (nestedListChild) {
      const nestedTag = normalizeTag(nestedListChild.tag);
      item.nested = await extractListItems(nestedListChild, ctx);
      item.nestedOrdered = nestedTag === "ol";
    }

    items.push(item);
  }

  return items;
}

/** Apply pre-extracted list items to a ListBuilder synchronously. */
function applyListItems(l: ListBuilder, items: ListItemData[]): void {
  for (const item of items) {
    if (item.runs.length > 0 && item.runs.some((r) => r.text || r.lineBreak)) {
      l.addItem((p) => applyRunsToBuilder(p, item.runs));
    } else {
      l.addItem("");
    }

    if (item.nested) {
      l.addNested((sub) => applyListItems(sub, item.nested!));
    }
  }
}

// ─── Table Walking ────────────────────────────────────────────────────

/** Walk a <table> element and add a table to the document. */
async function walkTable(node: XmlElementNode, doc: OdtDocument, ctx: ImageContext): Promise<void> {
  const rows = collectTableRows(node);
  if (rows.length === 0) return;

  // Pre-extract all cell content asynchronously.
  const cellData = await Promise.all(
    rows.map((row) => Promise.all(row.map((cell) => extractCellContent(cell, ctx)))),
  );

  doc.addTable((t) => {
    for (const row of cellData) {
      t.addRow((r) => {
        for (const { runs, options } of row) {
          r.addCell((c) => applyRunsToBuilder(c as unknown as ParagraphBuilder, runs), options);
        }
      });
    }
  });
}

/**
 * Collect all <tr> rows from a table, handling <thead>, <tbody>, <tfoot>.
 * Returns an array of arrays of <td>/<th> elements.
 */
function collectTableRows(tableNode: XmlElementNode): XmlElementNode[][] {
  const rows: XmlElementNode[][] = [];

  function processContainer(el: XmlElementNode): void {
    for (const child of el.children) {
      if (child.type !== "element") continue;
      const tag = normalizeTag(child.tag);
      if (tag === "tr") {
        const cells = child.children.filter(
          (c): c is XmlElementNode =>
            c.type === "element" && (normalizeTag(c.tag) === "td" || normalizeTag(c.tag) === "th"),
        );
        if (cells.length > 0) rows.push(cells);
      } else if (tag === "thead" || tag === "tbody" || tag === "tfoot" || tag === "table") {
        processContainer(child);
      }
    }
  }

  processContainer(tableNode);
  return rows;
}

/**
 * Extract cell content and options from a <td> or <th> element.
 * <th> cells get bold: true applied to all runs.
 */
async function extractCellContent(
  cell: XmlElementNode,
  ctx: ImageContext,
): Promise<{ runs: TextRun[]; options: CellOptions }> {
  const isHeader = normalizeTag(cell.tag) === "th";
  const style = cell.attrs["style"] ?? "";

  const options: CellOptions = {};

  // Parse cell-level inline CSS
  const bg = extractCssProperty(style, "background-color");
  if (bg) options.backgroundColor = bg;
  const border = extractCssProperty(style, "border");
  if (border) options.border = border;

  const baseFormatting: TextFormatting = isHeader ? { bold: true } : {};
  const runs = await extractInline(cell.children, baseFormatting, ctx);

  return { runs, options };
}

// ─── Inline Content Extraction ────────────────────────────────────────

/**
 * Recursively extract text runs from a list of nodes, accumulating
 * inherited text formatting as the tree is descended.
 *
 * Block-level tags encountered in an inline context are treated as
 * transparent (their children are extracted as inline content). This
 * handles common editor patterns like <p> inside <li>.
 *
 * @param nodes     - Nodes to process.
 * @param inherited - TextFormatting accumulated from ancestor elements.
 * @param ctx       - Image resolution context.
 * @returns Array of TextRun objects ready for use with ParagraphBuilder.
 */
async function extractInline(
  nodes: XmlNode[],
  inherited: TextFormatting,
  ctx: ImageContext,
): Promise<TextRun[]> {
  const runs: TextRun[] = [];

  for (const node of nodes) {
    if (node.type === "text") {
      const text = normalizeWhitespace(node.text);
      if (text) {
        runs.push(makeRun(text, inherited));
      }
      continue;
    }

    const tag = normalizeTag(node.tag);

    switch (tag) {
      case "strong":
      case "b":
        runs.push(...(await extractInline(node.children, { ...inherited, bold: true }, ctx)));
        break;

      case "em":
      case "i":
        runs.push(...(await extractInline(node.children, { ...inherited, italic: true }, ctx)));
        break;

      case "u":
        runs.push(...(await extractInline(node.children, { ...inherited, underline: true }, ctx)));
        break;

      case "s":
      case "del":
        runs.push(
          ...(await extractInline(node.children, { ...inherited, strikethrough: true }, ctx)),
        );
        break;

      case "sup":
        runs.push(
          ...(await extractInline(node.children, { ...inherited, superscript: true }, ctx)),
        );
        break;

      case "sub":
        runs.push(...(await extractInline(node.children, { ...inherited, subscript: true }, ctx)));
        break;

      case "code":
        runs.push(
          ...(await extractInline(
            node.children,
            { ...inherited, fontFamily: MONOSPACE_FONT },
            ctx,
          )),
        );
        break;

      case "mark":
        runs.push(
          ...(await extractInline(node.children, { ...inherited, highlightColor: "yellow" }, ctx)),
        );
        break;

      case "span": {
        const spanFormatting = mergeInlineStyle(node.attrs["style"] ?? "", inherited);
        runs.push(...(await extractInline(node.children, spanFormatting, ctx)));
        break;
      }

      case "a": {
        const href = node.attrs["href"] ?? "";
        const linkRuns = await extractInline(node.children, inherited, ctx);
        for (const r of linkRuns) {
          runs.push({ ...r, link: href });
        }
        break;
      }

      case "br":
        runs.push({ text: "", lineBreak: true });
        break;

      case "img": {
        // Inline image — resolve and emit as an image run
        const src = node.attrs["src"] ?? "";
        const resolved = await resolveImage(src, ctx);
        if (resolved) {
          const { width, height } = parseImageDimensions(node);
          const alt = node.attrs["alt"];
          runs.push({
            text: "",
            image: {
              data: resolved.data,
              mimeType: resolved.mimeType,
              width: width ?? DEFAULT_IMAGE_WIDTH,
              height,
              anchor: "as-character",
              ...(alt ? { alt } : {}),
            },
          });
        }
        break;
      }

      // Ignored elements — no content
      case "script":
      case "style":
        break;

      // Everything else (including block tags in inline context) — recurse transparently
      default:
        runs.push(...(await extractInline(node.children, inherited, ctx)));
        break;
    }
  }

  return runs;
}

/** Create a TextRun from text and formatting, omitting empty formatting objects. */
function makeRun(text: string, formatting: TextFormatting): TextRun {
  const hasFormatting = Object.keys(formatting).length > 0;
  return hasFormatting ? { text, formatting } : { text };
}

// ─── Inline Style Parsing ─────────────────────────────────────────────

/**
 * Merge CSS inline style string into existing TextFormatting.
 * Parsed CSS properties override inherited values.
 *
 * Supported properties: color, font-size, font-family, font-weight,
 * font-style, text-decoration.
 *
 * @param style     - Value of the `style` attribute (e.g. `"color: red; font-size: 14pt"`).
 * @param inherited - Existing TextFormatting to merge into.
 * @returns New TextFormatting with CSS properties applied.
 */
function mergeInlineStyle(style: string, inherited: TextFormatting): TextFormatting {
  if (!style.trim()) return inherited;

  const result = { ...inherited };

  for (const decl of style.split(";")) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).trim();
    if (!value) continue;

    switch (prop) {
      case "color":
        result.color = value;
        break;
      case "font-size":
        result.fontSize = convertFontSize(value);
        break;
      case "font-family": {
        // Take the first family name, strip quotes
        const family = value
          .split(",")[0]
          .trim()
          .replace(/^['"]|['"]$/g, "");
        if (family) result.fontFamily = family;
        break;
      }
      case "font-weight":
        if (value === "bold" || (parseInt(value, 10) >= 600 && !isNaN(parseInt(value, 10)))) {
          result.bold = true;
        }
        break;
      case "font-style":
        if (value === "italic" || value === "oblique") result.italic = true;
        break;
      case "text-decoration":
        if (value.includes("underline")) result.underline = true;
        if (value.includes("line-through")) result.strikethrough = true;
        break;
    }
  }

  return result;
}

/**
 * Convert a CSS font-size value to an ODF-compatible string.
 * - px → pt (1px = 0.75pt at 96dpi)
 * - em → pt (1em = 12pt, base 16px)
 * - pt, cm, mm → passed through
 */
function convertFontSize(value: string): string {
  if (value.endsWith("px")) {
    const px = parseFloat(value);
    return `${Math.round(px * 0.75)}pt`;
  }
  if (value.endsWith("em")) {
    const em = parseFloat(value);
    return `${Math.round(em * 12)}pt`;
  }
  // pt, cm, mm — pass through as-is
  return value;
}

/**
 * Extract a single CSS property value from a style attribute string.
 * Returns undefined if the property is not present.
 */
function extractCssProperty(style: string, property: string): string | undefined {
  for (const decl of style.split(";")) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    if (prop === property) {
      const value = decl.slice(colon + 1).trim();
      return value || undefined;
    }
  }
  return undefined;
}

// ─── Paragraph Option Parsing ─────────────────────────────────────────

/**
 * Parse paragraph-level options from a block element's attributes.
 * Currently extracts text-align from the element's inline style.
 */
function parseParagraphOptions(node: XmlElementNode): ParagraphOptions | undefined {
  const style = node.attrs["style"] ?? "";
  const align = extractCssProperty(style, "text-align");
  if (align === "left" || align === "center" || align === "right" || align === "justify") {
    return { align };
  }
  return undefined;
}

/**
 * Merge two ParagraphOptions objects.
 * The second argument (override) wins for any property defined in both.
 */
function mergeParagraphOptions(
  base: ParagraphOptions | undefined,
  override: ParagraphOptions | undefined,
): ParagraphOptions | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...override };
}

// ─── Text Content Extraction ──────────────────────────────────────────

/** Extract all text content from an element, recursing into children. */
function extractTextContent(node: XmlElementNode): string {
  let text = "";
  for (const child of node.children) {
    if (child.type === "text") {
      text += child.text;
    } else {
      text += extractTextContent(child);
    }
  }
  return text;
}

// ─── Whitespace Normalization ─────────────────────────────────────────

/**
 * Normalize inline whitespace per HTML rendering rules.
 * Multiple whitespace characters collapse to a single space.
 * Preserves single spaces between words.
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

// ─── Run Application ──────────────────────────────────────────────────

/**
 * Apply an array of TextRuns to a ParagraphBuilder (or compatible builder).
 * Handles plain text, formatted text, links, inline images, and line breaks.
 */
export function applyRunsToBuilder(p: ParagraphBuilder, runs: TextRun[]): void {
  for (const run of runs) {
    if (run.lineBreak) {
      p.addLineBreak();
    } else if (run.image) {
      p.addImage(run.image.data, {
        mimeType: run.image.mimeType,
        width: run.image.width,
        height: run.image.height,
        ...(run.image.alt ? { alt: run.image.alt } : {}),
      });
    } else if (run.link !== undefined) {
      p.addLink(run.text, run.link, run.formatting);
    } else if (run.text) {
      p.addText(run.text, run.formatting);
    }
  }
}
