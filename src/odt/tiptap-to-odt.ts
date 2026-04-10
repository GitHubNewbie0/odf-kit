/**
 * TipTap/ProseMirror JSON to ODT converter.
 *
 * Walks a TipTap JSONContent document tree and maps nodes to OdtDocument
 * API calls. No dependency on @tiptap/core — just plain JSON walking.
 *
 * Supported block nodes: doc, paragraph, heading (1–6), bulletList,
 * orderedList, listItem, blockquote, codeBlock, horizontalRule, hardBreak,
 * image (data URI or pre-fetched via images option), table, tableRow,
 * tableCell, tableHeader.
 *
 * Supported marks: bold, italic, underline, strike, code, link, textStyle
 * (color, fontSize, fontFamily), highlight, superscript, subscript.
 *
 * Unknown node types are silently skipped unless unknownNodeHandler is
 * provided in options.
 */

import type { OdtDocument } from "./document.js";
import { ParagraphBuilder } from "./paragraph-builder.js";
import { ListBuilder } from "./list-builder.js";
import type { HtmlToOdtOptions } from "./html-to-odt.js";
import type { TextFormatting, TextRun, ParagraphOptions } from "./types.js";

// ─── Public Types ─────────────────────────────────────────────────────

/** A TipTap/ProseMirror JSON document node. */
export interface TiptapNode {
  /** Node type name (e.g. "doc", "paragraph", "heading", "text"). */
  type: string;
  /** Text content — present only on text nodes. */
  text?: string;
  /** Node attributes (e.g. { level: 1 } for headings, { href: "..." } for links). */
  attrs?: Record<string, unknown>;
  /** Child nodes — present on block and inline container nodes. */
  content?: TiptapNode[];
  /** Inline formatting marks — present on text nodes. */
  marks?: TiptapMark[];
}

/** A TipTap/ProseMirror inline mark. */
export interface TiptapMark {
  /** Mark type name (e.g. "bold", "italic", "link", "textStyle"). */
  type: string;
  /** Mark attributes (e.g. { href: "..." } for link, { color: "#ff0000" } for textStyle). */
  attrs?: Record<string, unknown>;
}

/**
 * Options for {@link tiptapToOdt}.
 *
 * Extends {@link HtmlToOdtOptions} — all page format, margin, orientation,
 * and metadata options apply.
 */
export interface TiptapToOdtOptions extends HtmlToOdtOptions {
  /**
   * Pre-fetched image bytes keyed by src URL.
   *
   * TipTap image nodes with `attrs.src` are looked up in this map.
   * If found, the image is embedded in the ODT. If not found (and the src
   * is not a data URI), a placeholder paragraph is emitted instead.
   *
   * Data URIs (`data:image/...;base64,...`) are always decoded and embedded
   * regardless of this map.
   *
   * @example
   * const images = {
   *   "https://example.com/photo.jpg": jpegBytes,
   *   "ipfs://Qm...": ipfsImageBytes,
   * }
   * const bytes = await tiptapToOdt(json, { images })
   */
  images?: Record<string, Uint8Array>;

  /**
   * Handler for unknown node types — custom TipTap extensions not
   * recognized by odf-kit.
   *
   * Called once per unrecognized node. The handler receives the node and
   * the OdtDocument instance and may call any OdtDocument methods to add
   * content. If not provided, unknown nodes are silently skipped.
   *
   * @example
   * // Handle a custom "callout" node
   * unknownNodeHandler: (node, doc) => {
   *   if (node.type === 'callout') {
   *     const text = node.content?.[0]?.content?.[0]?.text ?? ''
   *     doc.addParagraph(`⚠️ ${text}`)
   *   }
   * }
   */
  unknownNodeHandler?: (node: TiptapNode, doc: OdtDocument) => void;
}

// ─── Constants ────────────────────────────────────────────────────────

const HR_BORDER = "0.5pt solid #000000";
const BLOCKQUOTE_INDENT = "1cm";
const MONOSPACE_FONT = "Courier New";

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Convert a TipTap/ProseMirror JSON document to an ODT file.
 *
 * Accepts the JSON object returned by `editor.getJSON()` in TipTap.
 * No dependency on @tiptap/core — the JSON is walked as a plain object.
 *
 * @param json    - TipTap JSONContent document (must have type "doc").
 * @param options - Page format, margins, metadata, images, unknownNodeHandler.
 * @returns Promise resolving to a valid `.odt` file as a `Uint8Array`.
 *
 * @example
 * import { tiptapToOdt } from "odf-kit"
 *
 * const json = editor.getJSON()
 * const bytes = await tiptapToOdt(json, { pageFormat: "A4" })
 *
 * @example
 * // With pre-fetched images
 * const images = { "https://example.com/photo.jpg": jpegBytes }
 * const bytes = await tiptapToOdt(json, { images })
 *
 * @example
 * // With custom node handler
 * const bytes = await tiptapToOdt(json, {
 *   unknownNodeHandler: (node, doc) => {
 *     if (node.type === "callout") {
 *       doc.addParagraph(`⚠️ ${extractText(node)}`)
 *     }
 *   }
 * })
 */
export async function tiptapToOdt(
  json: TiptapNode,
  options?: TiptapToOdtOptions,
): Promise<Uint8Array> {
  // We reuse htmlToOdt's page layout setup by creating the document
  // through it with an empty HTML string, then walking the TipTap JSON
  // to populate. However, htmlToOdt is not designed for this — instead
  // we duplicate the page setup logic here for a clean implementation.

  // Import OdtDocument dynamically to avoid circular dependency issues
  const { OdtDocument } = await import("./document.js");
  const doc = new OdtDocument();

  // Apply metadata
  if (options?.metadata) {
    doc.setMetadata(options.metadata);
  }

  // Resolve page format (mirrors html-to-odt.ts)
  const PAGE_FORMATS: Record<string, { width: string; height: string; margin: string }> = {
    A4: { width: "21cm", height: "29.7cm", margin: "2.5cm" },
    letter: { width: "21.59cm", height: "27.94cm", margin: "2.54cm" },
    legal: { width: "21.59cm", height: "35.56cm", margin: "2.54cm" },
    A3: { width: "29.7cm", height: "42cm", margin: "2.5cm" },
    A5: { width: "14.8cm", height: "21cm", margin: "2cm" },
  };
  const format = PAGE_FORMATS[options?.pageFormat ?? "A4"];
  doc.setPageLayout({
    width: format.width,
    height: format.height,
    orientation: options?.orientation,
    marginTop: options?.marginTop ?? format.margin,
    marginBottom: options?.marginBottom ?? format.margin,
    marginLeft: options?.marginLeft ?? format.margin,
    marginRight: options?.marginRight ?? format.margin,
  });

  // Walk the document tree
  walkNode(json, doc, options ?? {});

  return doc.save();
}

// ─── Node Walking ─────────────────────────────────────────────────────

/**
 * Walk a single TipTap node and emit the corresponding ODT content.
 */
function walkNode(node: TiptapNode, doc: OdtDocument, options: TiptapToOdtOptions): void {
  switch (node.type) {
    case "doc":
      for (const child of node.content ?? []) {
        walkNode(child, doc, options);
      }
      break;

    case "paragraph": {
      const runs = extractRuns(node.content ?? [], {});
      if (runs.length === 0 || runs.every((r) => !r.text && !r.lineBreak)) {
        // Empty paragraph — still emit it to preserve spacing
        doc.addParagraph("");
      } else {
        doc.addParagraph((p) => applyRuns(p, runs));
      }
      break;
    }

    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const runs = extractRuns(node.content ?? [], {});
      doc.addHeading((p) => applyRuns(p, runs), level);
      break;
    }

    case "blockquote": {
      const opts: ParagraphOptions = { indentLeft: BLOCKQUOTE_INDENT };
      for (const child of node.content ?? []) {
        walkNodeWithParaOpts(child, doc, options, opts);
      }
      break;
    }

    case "codeBlock": {
      const text = extractText(node);
      const lines = text.split("\n");
      doc.addParagraph((p) => {
        lines.forEach((line, i) => {
          p.addText(line, { fontFamily: MONOSPACE_FONT });
          if (i < lines.length - 1) p.addLineBreak();
        });
      });
      break;
    }

    case "horizontalRule": {
      doc.addParagraph("", { borderBottom: HR_BORDER });
      break;
    }

    case "bulletList": {
      doc.addList((l) => fillList(l, node, options), { type: "bullet" });
      break;
    }

    case "orderedList": {
      doc.addList((l) => fillList(l, node, options), { type: "numbered" });
      break;
    }

    case "table": {
      walkTable(node, doc);
      break;
    }

    case "image": {
      walkImage(node, doc, options);
      break;
    }

    // Transparent containers — walk children
    case "listItem":
    case "tableRow":
    case "tableCell":
    case "tableHeader": {
      for (const child of node.content ?? []) {
        walkNode(child, doc, options);
      }
      break;
    }

    // Text node — should not appear at block level, emit as paragraph
    case "text": {
      const runs = extractRuns([node], {});
      if (runs.length > 0) {
        doc.addParagraph((p) => applyRuns(p, runs));
      }
      break;
    }

    default: {
      if (options.unknownNodeHandler) {
        options.unknownNodeHandler(node, doc);
      }
      // If no handler, silently skip
      break;
    }
  }
}

/**
 * Walk a node with inherited paragraph options (used for blockquote).
 */
function walkNodeWithParaOpts(
  node: TiptapNode,
  doc: OdtDocument,
  options: TiptapToOdtOptions,
  paraOpts: ParagraphOptions,
): void {
  if (node.type === "paragraph") {
    const runs = extractRuns(node.content ?? [], {});
    if (runs.length === 0 || runs.every((r) => !r.text && !r.lineBreak)) {
      doc.addParagraph("", paraOpts);
    } else {
      doc.addParagraph((p) => applyRuns(p, runs), paraOpts);
    }
  } else {
    walkNode(node, doc, options);
  }
}

// ─── List Walking ─────────────────────────────────────────────────────

/**
 * Populate a ListBuilder from a bulletList or orderedList node.
 * Called recursively for nested lists.
 */
function fillList(l: ListBuilder, listNode: TiptapNode, options: TiptapToOdtOptions): void {
  for (const item of listNode.content ?? []) {
    if (item.type !== "listItem") continue;

    // A listItem contains one or more paragraphs and optionally nested lists
    const paragraphs = (item.content ?? []).filter((c) => c.type === "paragraph");
    const nestedList = (item.content ?? []).find(
      (c) => c.type === "bulletList" || c.type === "orderedList",
    );

    // Use text from first paragraph as the item content
    const firstPara = paragraphs[0];
    const runs = firstPara ? extractRuns(firstPara.content ?? [], {}) : [];

    if (runs.length > 0 && runs.some((r) => r.text || r.lineBreak)) {
      l.addItem((p) => applyRuns(p, runs));
    } else {
      l.addItem("");
    }

    if (nestedList) {
      l.addNested((sub) => fillList(sub, nestedList, options));
    }
  }
}

// ─── Table Walking ────────────────────────────────────────────────────

/**
 * Walk a table node and add a table to the document.
 */
function walkTable(node: TiptapNode, doc: OdtDocument): void {
  const rows = node.content ?? [];
  if (rows.length === 0) return;

  doc.addTable((t) => {
    for (const row of rows) {
      if (row.type !== "tableRow") continue;
      t.addRow((r) => {
        for (const cell of row.content ?? []) {
          if (cell.type !== "tableCell" && cell.type !== "tableHeader") continue;
          const isHeader = cell.type === "tableHeader";
          const baseFormatting: TextFormatting = isHeader ? { bold: true } : {};
          // Extract text from all paragraphs in the cell
          const allRuns: TextRun[] = [];
          for (const child of cell.content ?? []) {
            if (child.type === "paragraph") {
              const runs = extractRuns(child.content ?? [], baseFormatting);
              if (allRuns.length > 0 && runs.length > 0) {
                allRuns.push({ text: " " }); // space between paragraphs
              }
              allRuns.push(...runs);
            }
          }
          if (allRuns.length > 0) {
            r.addCell((c) => applyRuns(c as unknown as ParagraphBuilder, allRuns));
          } else {
            r.addCell("");
          }
        }
      });
    }
  });
}

// ─── Image Handling ───────────────────────────────────────────────────

/**
 * Handle a TipTap image node.
 * - Data URIs are decoded and embedded directly.
 * - Other URLs are looked up in options.images. If found, embedded.
 * - If not found, a placeholder paragraph is emitted.
 */
function walkImage(node: TiptapNode, doc: OdtDocument, options: TiptapToOdtOptions): void {
  const src = (node.attrs?.src as string) ?? "";
  const alt = (node.attrs?.alt as string) ?? "Image";
  const width = node.attrs?.width as number | undefined;
  const height = node.attrs?.height as number | undefined;

  // Resolve image bytes
  let bytes: Uint8Array | undefined;
  let mimeType = "image/png";

  if (src.startsWith("data:")) {
    // Data URI — decode directly
    const match = src.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      bytes = base64ToUint8Array(match[2]);
    }
  } else if (options.images?.[src]) {
    // Pre-fetched image
    bytes = options.images[src];
    mimeType = guessMimeType(src);
  }

  if (bytes) {
    const widthCm = width ? `${Math.round((width / 96) * 2.54)}cm` : "10cm";
    const heightCm = height ? `${Math.round((height / 96) * 2.54)}cm` : "auto";
    doc.addImage(bytes, {
      mimeType: mimeType as
        | "image/png"
        | "image/jpeg"
        | "image/gif"
        | "image/svg+xml"
        | "image/webp"
        | "image/bmp"
        | "image/tiff",
      width: widthCm,
      height: heightCm,
    });
  } else {
    // Placeholder
    doc.addParagraph(`[Image: ${alt}]`);
  }
}

/** Decode a base64 string to Uint8Array. Pure implementation, no Buffer or atob needed. */
function base64ToUint8Array(b64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = clean.length;
  const bytes = new Uint8Array((len * 3) >> 2);
  let pos = 0;

  for (let i = 0; i < len; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    bytes[pos++] = (a << 2) | (b >> 4);
    if (i + 2 < len) bytes[pos++] = ((b & 0xf) << 4) | (c >> 2);
    if (i + 3 < len) bytes[pos++] = ((c & 0x3) << 6) | d;
  }

  return bytes.slice(0, pos);
}

/** Guess MIME type from file extension. */
function guessMimeType(src: string): string {
  const ext = src.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
  };
  return map[ext] ?? "image/png";
}

// ─── Inline Content Extraction ────────────────────────────────────────

/**
 * Recursively extract TextRun objects from TipTap inline content nodes.
 * Handles text nodes with marks and hardBreak nodes.
 */
function extractRuns(nodes: TiptapNode[], inherited: TextFormatting): TextRun[] {
  const runs: TextRun[] = [];

  for (const node of nodes) {
    if (node.type === "text") {
      const text = node.text ?? "";
      if (!text) continue;
      const formatting = mergeMarks(node.marks ?? [], inherited);
      const linkMark = node.marks?.find((m) => m.type === "link");
      const hasFormatting = Object.keys(formatting).length > 0;
      if (linkMark) {
        const href = (linkMark.attrs?.href as string) ?? "";
        runs.push({ text, link: href, formatting: hasFormatting ? formatting : undefined });
      } else {
        runs.push({ text, formatting: hasFormatting ? formatting : undefined });
      }
    } else if (node.type === "hardBreak") {
      runs.push({ text: "", lineBreak: true });
    } else if (node.content) {
      runs.push(...extractRuns(node.content, inherited));
    }
  }

  return runs;
}

/**
 * Convert an array of TipTap marks to TextFormatting, merged with inherited.
 */
function mergeMarks(marks: TiptapMark[], inherited: TextFormatting): TextFormatting {
  let f: TextFormatting = { ...inherited };

  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        f = { ...f, bold: true };
        break;
      case "italic":
        f = { ...f, italic: true };
        break;
      case "underline":
        f = { ...f, underline: true };
        break;
      case "strike":
        f = { ...f, strikethrough: true };
        break;
      case "code":
        f = { ...f, fontFamily: MONOSPACE_FONT };
        break;
      case "superscript":
        f = { ...f, superscript: true };
        break;
      case "subscript":
        f = { ...f, subscript: true };
        break;
      case "highlight": {
        const color = (mark.attrs?.color as string) ?? "yellow";
        f = { ...f, highlightColor: color };
        break;
      }
      case "textStyle": {
        if (mark.attrs?.color) f = { ...f, color: mark.attrs.color as string };
        if (mark.attrs?.fontSize) f = { ...f, fontSize: mark.attrs.fontSize as string };
        if (mark.attrs?.fontFamily) f = { ...f, fontFamily: mark.attrs.fontFamily as string };
        break;
      }
      // "link" handled in extractRuns — not a formatting property
    }
  }

  return f;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Apply an array of TextRun objects to a ParagraphBuilder.
 */
function applyRuns(p: ParagraphBuilder, runs: TextRun[]): void {
  for (const run of runs) {
    if (run.lineBreak) {
      p.addLineBreak();
    } else if (run.link) {
      p.addLink(run.text ?? "", run.link, run.formatting);
    } else {
      p.addText(run.text ?? "", run.formatting);
    }
  }
}

/**
 * Extract all plain text from a node tree (used for codeBlock).
 */
function extractText(node: TiptapNode): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(extractText).join("");
}
