import { OdtDocument } from "./document.js";
import { parseHtml } from "./html-parser.js";
import type { PageLayout } from "./types.js";

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
 */
export interface HtmlToOdtOptions {
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
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Convert an HTML string to an ODT file.
 *
 * Parses the HTML using the odf-kit XML parser (editor-generated HTML from
 * Nextcloud Text, TipTap, ProseMirror, CKEditor, and Quill is well-formed
 * XHTML), maps elements to OdtDocument API calls, and returns the resulting
 * `.odt` file as a `Uint8Array`.
 *
 * This is the missing conversion direction: the entire industry converts
 * ODT→HTML for web display. `htmlToOdt` brings content back into the open
 * standard — no LibreOffice, no Pandoc, no server-side dependencies.
 *
 * **Page formats:** Defaults to A4, which is the ISO standard and the
 * dominant format for European governments and organizations. Pass
 * `{ pageFormat: "letter" }` for US/Canadian users.
 *
 * **Images (v1):** `<img>` elements are skipped. v2 will add an `images`
 * option accepting a `Record<src, Uint8Array>` map for pre-fetched image
 * bytes, which odf-kit-service can populate from WebDAV before calling
 * `htmlToOdt`.
 *
 * @param html    - HTML string to convert. May be a full document
 *                  (`<html><body>...</body></html>`) or a fragment.
 * @param options - Optional page format, margins, orientation, and metadata.
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

  // Parse HTML and populate document
  parseHtml(html, doc);

  return doc.save();
}
