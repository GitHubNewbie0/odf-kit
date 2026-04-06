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
 * code, mark, span (with inline CSS), br.
 *
 * Inline CSS properties parsed: color, font-size, font-family, font-weight,
 * font-style, text-decoration, background-color (on table cells only).
 *
 * Images: skipped in v1 — fetch/embed support planned for v2 via an
 * `images` option (Record<src, Uint8Array>).
 */

import { parseXml } from "../reader/xml-parser.js";
import type { XmlElementNode, XmlNode } from "../reader/xml-parser.js";
import type { OdtDocument } from "./document.js";
import { ParagraphBuilder } from "./paragraph-builder.js";
import { ListBuilder } from "./list-builder.js";
import type { TextRun, TextFormatting, ParagraphOptions, CellOptions } from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────

/** HR border style — matches a standard horizontal rule appearance. */
const HR_BORDER = "0.5pt solid #000000";

/** Default indentation for blockquote elements. */
const BLOCKQUOTE_INDENT = "1cm";

/** Monospace font family for <pre> and <code> elements. */
const MONOSPACE_FONT = "Courier New";

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
]);

/** List tags that may appear as children of <li>. */
const LIST_TAGS = new Set(["ul", "ol"]);

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Parse an HTML string and populate the provided OdtDocument.
 *
 * The HTML is wrapped in a `<div>` before parsing to ensure a single XML
 * root, making fragment HTML (no `<html>`/`<body>` wrapper) work correctly.
 * Full-document HTML with `<html>` and `<body>` tags is also handled —
 * those elements are treated as transparent containers.
 *
 * @param html - HTML string to convert.
 * @param doc  - OdtDocument to populate.
 */
export function parseHtml(html: string, doc: OdtDocument): void {
  // Wrap in a div to guarantee a single XML root for fragment HTML.
  // Full-document HTML is handled transparently since <html>/<body> recurse.
  const root = parseXml(`<div>${html}</div>`);
  walkBlockChildren(root.children, doc);
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

// ─── Block Walking ────────────────────────────────────────────────────

/**
 * Walk a list of XML nodes as block-level content.
 *
 * Consecutive inline nodes and bare text are collected and flushed as a
 * single implicit paragraph when a block element is encountered, or at
 * the end of the list. This handles mixed block+inline content correctly.
 *
 * @param nodes          - Child nodes to walk.
 * @param doc            - Document to populate.
 * @param defaultParaOpts - Inherited paragraph options (e.g. from blockquote).
 */
function walkBlockChildren(
  nodes: XmlNode[],
  doc: OdtDocument,
  defaultParaOpts?: ParagraphOptions,
): void {
  const pendingInlines: XmlNode[] = [];

  function flushPending(): void {
    if (pendingInlines.length === 0) return;
    const runs = extractInline(pendingInlines, {});
    const meaningful = runs.some((r) => (r.text && r.text.trim().length > 0) || r.lineBreak);
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
      flushPending();
      walkBlockElement(node, doc, defaultParaOpts);
    } else {
      // Inline element at block level — collect for implicit paragraph
      pendingInlines.push(node);
    }
  }

  flushPending();
}

/**
 * Walk a single block-level element and emit the corresponding ODT content.
 */
function walkBlockElement(
  node: XmlElementNode,
  doc: OdtDocument,
  defaultParaOpts?: ParagraphOptions,
): void {
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
      const runs = extractInline(node.children, {});
      doc.addHeading((p) => applyRunsToBuilder(p, runs), level);
      break;
    }

    // ── Paragraph ──────────────────────────────────────────────────
    case "p": {
      const runs = extractInline(node.children, {});
      const opts = mergeParagraphOptions(defaultParaOpts, parseParagraphOptions(node));
      doc.addParagraph((p) => applyRunsToBuilder(p, runs), opts);
      break;
    }

    // ── Blockquote ─────────────────────────────────────────────────
    case "blockquote": {
      walkBlockChildren(
        node.children,
        doc,
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
      walkList(node, doc, false);
      break;
    }

    case "ol": {
      walkList(node, doc, true);
      break;
    }

    // ── Table ─────────────────────────────────────────────────────
    case "table": {
      walkTable(node, doc);
      break;
    }

    // ── Figure ────────────────────────────────────────────────────
    case "figure": {
      // Images skipped in v1. Emit figcaption as a plain paragraph.
      for (const child of node.children) {
        if (child.type !== "element") continue;
        if (normalizeTag(child.tag) === "figcaption") {
          const runs = extractInline(child.children, {});
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
      walkBlockChildren(node.children, doc, defaultParaOpts);
      break;
    }

    // ── Ignored ───────────────────────────────────────────────────
    case "head":
    case "script":
    case "style":
    case "meta":
    case "link":
    case "img": // images skipped in v1
      break;

    // ── Unknown block — recurse as transparent container ──────────
    default:
      walkBlockChildren(node.children, doc, defaultParaOpts);
      break;
  }
}

// ─── List Walking ─────────────────────────────────────────────────────

/** Walk a <ul> or <ol> element and add a list to the document. */
function walkList(node: XmlElementNode, doc: OdtDocument, ordered: boolean): void {
  doc.addList((l) => fillListBuilder(l, node), { type: ordered ? "numbered" : "bullet" });
}

/**
 * Populate a ListBuilder from a <ul> or <ol> element.
 * Called recursively for nested lists.
 */
function fillListBuilder(l: ListBuilder, listNode: XmlElementNode): void {
  for (const child of listNode.children) {
    if (child.type !== "element") continue;
    if (normalizeTag(child.tag) !== "li") continue;

    // Separate inline content from nested list children
    const inlineChildren: XmlNode[] = child.children.filter((c) => {
      if (c.type === "text") return true;
      return !LIST_TAGS.has(normalizeTag((c as XmlElementNode).tag));
    });

    const nestedListChild = child.children.find(
      (c): c is XmlElementNode => c.type === "element" && LIST_TAGS.has(normalizeTag(c.tag)),
    );

    const runs = extractInline(inlineChildren, {});

    if (runs.length > 0 && runs.some((r) => r.text || r.lineBreak)) {
      l.addItem((p) => applyRunsToBuilder(p, runs));
    } else {
      l.addItem("");
    }

    if (nestedListChild) {
      l.addNested((sub) => fillListBuilder(sub, nestedListChild));
    }
  }
}

// ─── Table Walking ────────────────────────────────────────────────────

/** Walk a <table> element and add a table to the document. */
function walkTable(node: XmlElementNode, doc: OdtDocument): void {
  const rows = collectTableRows(node);
  if (rows.length === 0) return;

  doc.addTable((t) => {
    for (const row of rows) {
      t.addRow((r) => {
        for (const cell of row) {
          const { runs, options } = extractCellContent(cell);
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
function extractCellContent(cell: XmlElementNode): { runs: TextRun[]; options: CellOptions } {
  const isHeader = normalizeTag(cell.tag) === "th";
  const style = cell.attrs["style"] ?? "";

  const options: CellOptions = {};

  // Parse cell-level inline CSS
  const bg = extractCssProperty(style, "background-color");
  if (bg) options.backgroundColor = bg;
  const border = extractCssProperty(style, "border");
  if (border) options.border = border;

  const baseFormatting: TextFormatting = isHeader ? { bold: true } : {};
  const runs = extractInline(cell.children, baseFormatting);

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
 * @returns Array of TextRun objects ready for use with ParagraphBuilder.
 */
function extractInline(nodes: XmlNode[], inherited: TextFormatting): TextRun[] {
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
        runs.push(...extractInline(node.children, { ...inherited, bold: true }));
        break;

      case "em":
      case "i":
        runs.push(...extractInline(node.children, { ...inherited, italic: true }));
        break;

      case "u":
        runs.push(...extractInline(node.children, { ...inherited, underline: true }));
        break;

      case "s":
      case "del":
        runs.push(...extractInline(node.children, { ...inherited, strikethrough: true }));
        break;

      case "sup":
        runs.push(...extractInline(node.children, { ...inherited, superscript: true }));
        break;

      case "sub":
        runs.push(...extractInline(node.children, { ...inherited, subscript: true }));
        break;

      case "code":
        runs.push(...extractInline(node.children, { ...inherited, fontFamily: MONOSPACE_FONT }));
        break;

      case "mark":
        runs.push(...extractInline(node.children, { ...inherited, highlightColor: "yellow" }));
        break;

      case "span": {
        const spanFormatting = mergeInlineStyle(node.attrs["style"] ?? "", inherited);
        runs.push(...extractInline(node.children, spanFormatting));
        break;
      }

      case "a": {
        const href = node.attrs["href"] ?? "";
        const linkRuns = extractInline(node.children, inherited);
        for (const r of linkRuns) {
          // Each run inside the link becomes a link run
          runs.push({ ...r, link: href });
        }
        break;
      }

      case "br":
        runs.push({ text: "", lineBreak: true });
        break;

      case "img":
        // Images skipped in v1
        break;

      // Ignored elements — no content
      case "script":
      case "style":
        break;

      // Everything else (including block tags in inline context) — recurse transparently
      default:
        runs.push(...extractInline(node.children, inherited));
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
 * Handles plain text, formatted text, links, and line breaks.
 */
export function applyRunsToBuilder(p: ParagraphBuilder, runs: TextRun[]): void {
  for (const run of runs) {
    if (run.lineBreak) {
      p.addLineBreak();
    } else if (run.link !== undefined) {
      p.addLink(run.text, run.link, run.formatting);
    } else if (run.text) {
      p.addText(run.text, run.formatting);
    }
  }
}
