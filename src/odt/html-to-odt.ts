import { OdtDocument } from "./document.js";
import { parseHtml } from "./html-parser.js";
import type { PageLayout } from "./types.js";
import type { Normalizer, Parser } from "../types/public.js";

// ─── Page Format Presets ──────────────────────────────────────────────

interface PageFormatSpec {
  width: string;
  height: string;
  margin: string;
}

const PAGE_FORMATS: Record<string, PageFormatSpec> = {
  A4: { width: "21cm", height: "29.7cm", margin: "2.5cm" },
  letter: { width: "21.59cm", height: "27.94cm", margin: "2.54cm" },
  legal: { width: "21.59cm", height: "35.56cm", margin: "2.54cm" },
  A3: { width: "29.7cm", height: "42cm", margin: "2.5cm" },
  A5: { width: "14.8cm", height: "21cm", margin: "2cm" },
};

// ─── Options ──────────────────────────────────────────────────────────

/**
 * Options for {@link htmlToOdt}.
 *
 * All fields are optional. Defaults: A4 page format, portrait orientation,
 * 2.5cm margins.
 *
 * @example
 * // European government default
 * await htmlToOdt(html);
 *
 * @example
 * // US letter with 1-inch margins
 * await htmlToOdt(html, { pageFormat: "letter" });
 *
 * @example
 * // Landscape A4 with custom top/bottom margins
 * await htmlToOdt(html, {
 *   pageFormat: "A4",
 *   orientation: "landscape",
 *   marginTop: "1.5cm",
 *   marginBottom: "1.5cm",
 * });
 *
 * @example
 * // Pre-fetched images (e.g. from odf-kit-service via WebDAV)
 * await htmlToOdt(html, {
 *   images: {
 *     "https://example.com/logo.png": pngBytes,
 *   },
 * });
 *
 * @example
 * // Fetch images on demand (Node.js or browser)
 * await htmlToOdt(html, {
 *   fetchImage: async (src) => {
 *     const res = await fetch(src);
 *     return new Uint8Array(await res.arrayBuffer());
 *   },
 * });
 */
/**
 * Base options shared across ODT-producing functions.
 *
 * `OdtBaseOptions` covers concerns that apply to every ODT output
 * pathway — page format, orientation, margins, metadata, and image
 * resolution. It does not include input-specific concerns: HTML-stage
 * substitution hooks (normalizer, parser) live on {@link HtmlToOdtOptions}
 * because they only make sense when the input arrives as HTML and goes
 * through the parse stage. Pathways that walk a structured tree
 * directly — like `tiptapToOdt` over a TipTap JSON tree — do not have
 * an HTML-stage and therefore do not expose those hooks.
 *
 * Extended by `HtmlToOdtOptions` and `TiptapToOdtOptions`.
 */
export interface OdtBaseOptions {
  /**
   * Page format preset. Determines page dimensions and default margins.
   * Individual margin overrides apply on top of the preset.
   *
   * - `"A4"` — 21 × 29.7 cm, 2.5 cm margins. ISO standard, default for Europe. **(default)**
   * - `"letter"` — 21.59 × 27.94 cm, 2.54 cm margins. USA and Canada.
   * - `"legal"` — 21.59 × 35.56 cm, 2.54 cm margins. USA legal.
   * - `"A3"` — 29.7 × 42 cm, 2.5 cm margins. Large format.
   * - `"A5"` — 14.8 × 21 cm, 2 cm margins. Small booklets.
   */
  pageFormat?: "A4" | "letter" | "legal" | "A3" | "A5";

  /**
   * Page orientation. Defaults to `"portrait"`.
   * Swaps page width and height when set to `"landscape"`.
   */
  orientation?: "portrait" | "landscape";

  /** Override the top margin (e.g. `"3cm"`, `"1.5in"`). */
  marginTop?: string;

  /** Override the bottom margin. */
  marginBottom?: string;

  /** Override the left margin. */
  marginLeft?: string;

  /** Override the right margin. */
  marginRight?: string;

  /** Document metadata. */
  metadata?: {
    /** Document title. */
    title?: string;
    /** Author name. */
    creator?: string;
    /** Description or subject. */
    description?: string;
  };

  /**
   * Pre-fetched image bytes keyed by `src` URL.
   *
   * Use this when you have already fetched image bytes before calling
   * the conversion function — for example, in odf-kit-service where
   * images can be retrieved from WebDAV before conversion.
   *
   * Base64 data URLs embedded directly in `src` attributes are always
   * decoded automatically and do not need to appear in this map.
   *
   * If both `images` and `fetchImage` are provided, `images` is checked
   * first. If the src is not found in the map, `fetchImage` is called.
   *
   * @example
   * await htmlToOdt(html, {
   *   images: {
   *     "https://example.com/logo.png": pngBytes,
   *     "https://example.com/photo.jpg": jpegBytes,
   *   },
   * });
   */
  images?: Record<string, Uint8Array>;

  /**
   * Async callback to fetch image bytes for a given `src` URL.
   *
   * Called for each `<img>` element whose src is not a base64 data URL
   * and is not found in the `images` map. Return `undefined` to skip the
   * image silently.
   *
   * Works in Node.js and browsers. For Node.js, use the `node-fetch`
   * package or the built-in `fetch` available in Node.js 18+.
   *
   * @example
   * // Browser or Node.js 18+
   * await htmlToOdt(html, {
   *   fetchImage: async (src) => {
   *     const res = await fetch(src);
   *     if (!res.ok) return undefined;
   *     return new Uint8Array(await res.arrayBuffer());
   *   },
   * });
   */
  fetchImage?: (src: string) => Promise<Uint8Array | undefined>;
}

/**
 * Options for {@link htmlToOdt}.
 *
 * Extends {@link OdtBaseOptions} with HTML-stage substitution hooks
 * (`normalizer`, `parser`) that apply when the input arrives as an HTML
 * string and goes through the normalize → parse → walk pipeline.
 *
 * All `OdtBaseOptions` fields apply: page format, orientation, margins,
 * metadata, image resolution. Defaults: A4 page format, portrait
 * orientation, 2.5cm margins.
 *
 * @example
 * // European government default
 * await htmlToOdt(html);
 *
 * @example
 * // US letter with 1-inch margins
 * await htmlToOdt(html, { pageFormat: "letter" });
 *
 * @example
 * // Landscape A4 with custom top/bottom margins
 * await htmlToOdt(html, {
 *   pageFormat: "A4",
 *   orientation: "landscape",
 *   marginTop: "1.5cm",
 *   marginBottom: "1.5cm",
 * });
 *
 * @example
 * // Pre-fetched images (e.g. from odf-kit-service via WebDAV)
 * await htmlToOdt(html, {
 *   images: {
 *     "https://example.com/logo.png": pngBytes,
 *   },
 * });
 *
 * @example
 * // Fetch images on demand (Node.js or browser)
 * await htmlToOdt(html, {
 *   fetchImage: async (src) => {
 *     const res = await fetch(src);
 *     return new Uint8Array(await res.arrayBuffer());
 *   },
 * });
 */
export interface HtmlToOdtOptions extends OdtBaseOptions {
  /**
   * Normalizer function applied to the HTML input before parsing.
   *
   * - Omitted or `undefined`: uses odfKitNormalizer (Tier 1 normalization).
   *   This is what most users want.
   * - `false`: skips normalization. Use when input is already polyglot/XHTML.
   * - A custom function: substitute your own normalizer.
   *
   * The default normalizer applies four spec-grounded transformations to
   * convert good HTML5 into polyglot markup:
   *   1. Self-close 14 HTML5 void elements
   *   2. Decode HTML5 named entities to Unicode
   *   3. Empty <script> and <style> content
   *   4. Lowercase the doctype declaration
   *
   * See ADAPTERS.md ("Skip Semantics") for why normalization can be
   * skipped but parsing cannot.
   */
  normalizer?: Normalizer | false;

  /**
   * Parser function applied to the (optionally normalized) input.
   *
   * - Omitted or `undefined`: uses odfKitParser (the tightened built-in
   *   XML parser). This is what most users want.
   * - A custom function: substitute your own parser.
   *
   * Unlike `normalizer`, `parser` cannot be skipped. The next stage (the
   * walker) requires a tree, not a string — there's no coherent meaning
   * for "skip parsing." Always supply either the default or a substitute.
   *
   * Common substitution case: use parse5 for full HTML5 spec compliance.
   * The fromParse5 adapter is not shipped in v0.13.2; users who need it
   * can write a small adapter following the conventions in ADAPTERS.md:
   *
   *   import { fromParse5 } from "./from-parse5"; // user-written
   *   import * as parse5 from "parse5";
   *   await htmlToOdt(html, { parser: fromParse5(parse5.parse) });
   *
   * See ADAPTERS.md ("Skip Semantics") for the architectural rationale.
   */
  parser?: Parser;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Convert an HTML string to an ODT file.
 *
 * Accepts good HTML5 — the kind produced by Markdown renderers, rich-text
 * editors (Nextcloud Text, TipTap, ProseMirror, CKEditor, Quill), templating
 * engines, and modern content management systems. Input is normalized to
 * polyglot markup (Tier 1 normalization) before parsing. The default chain
 * runs `odfKitNormalizer → odfKitParser → walker`; either stage can be
 * substituted via the `normalizer` and `parser` options. See ADAPTERS.md
 * for the substitution architecture.
 *
 * The underlying parser fails loudly on malformed input — unclosed tags,
 * mismatched tags, unescaped `&` in attribute values. This is the intended
 * fix for inputs that previously produced silent wrong output.
 *
 * This is the missing conversion direction: the entire industry converts
 * ODT→HTML for web display. `htmlToOdt` brings content back into the open
 * standard — no LibreOffice, no Pandoc, no server-side dependencies.
 *
 * **Page formats:** Defaults to A4, which is the ISO standard and the
 * dominant format for European governments and organizations. Pass
 * `{ pageFormat: "letter" }` for US/Canadian users.
 *
 * **Images:** Base64 data URLs embedded in `src` attributes are decoded and
 * embedded automatically. For remote URLs, provide pre-fetched bytes via the
 * `images` map, or an async `fetchImage` callback. If neither is provided,
 * `<img>` elements with remote URLs are skipped silently.
 *
 * @param html    - HTML string to convert. May be a full document
 *                  (`<html><body>...</body></html>`) or a fragment.
 * @param options - Optional page format, margins, orientation, metadata,
 *                  image resolution, and substitution hooks for normalizer
 *                  and parser.
 * @returns Promise resolving to a valid `.odt` file as a `Uint8Array`.
 *
 * @example
 * // Nextcloud Text HTML → A4 ODT (default)
 * import { htmlToOdt } from "odf-kit";
 * const bytes = await htmlToOdt(html);
 *
 * @example
 * // US letter
 * const bytes = await htmlToOdt(html, { pageFormat: "letter" });
 *
 * @example
 * // With image fetching
 * const bytes = await htmlToOdt(html, {
 *   fetchImage: async (src) => {
 *     const res = await fetch(src);
 *     return new Uint8Array(await res.arrayBuffer());
 *   },
 * });
 *
 * @example
 * // Custom margins and metadata
 * const bytes = await htmlToOdt(html, {
 *   pageFormat: "A4",
 *   marginTop: "3cm",
 *   marginBottom: "3cm",
 *   metadata: { title: "Meeting Notes", creator: "Alice" },
 * });
 */
export async function htmlToOdt(html: string, options?: HtmlToOdtOptions): Promise<Uint8Array> {
  const doc = new OdtDocument();

  // Apply metadata
  if (options?.metadata) {
    doc.setMetadata(options.metadata);
  }

  // Resolve page format preset
  const format = PAGE_FORMATS[options?.pageFormat ?? "A4"];

  // Build page layout — individual margin overrides apply on top of preset defaults
  const layout: PageLayout = {
    width: format.width,
    height: format.height,
    orientation: options?.orientation,
    marginTop: options?.marginTop ?? format.margin,
    marginBottom: options?.marginBottom ?? format.margin,
    marginLeft: options?.marginLeft ?? format.margin,
    marginRight: options?.marginRight ?? format.margin,
  };

  doc.setPageLayout(layout);

  // Parse HTML and populate document. Threads substitution hooks through
  // to parseHtml so users can replace the normalizer or parser.
  await parseHtml(html, doc, options?.images, options?.fetchImage, {
    normalizer: options?.normalizer,
    parser: options?.parser,
  });

  return doc.save();
}
