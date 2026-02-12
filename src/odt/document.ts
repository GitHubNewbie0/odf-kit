import { assemblePackage } from "../core/packaging.js";
import type { PackageFile } from "../core/packaging.js";
import { generateMeta } from "../core/metadata.js";
import type { MetadataOptions } from "../core/metadata.js";
import { generateStyles } from "../core/styles.js";
import type { StylesConfig } from "../core/styles.js";
import { generateContent, buildHeaderFooterContent } from "./content.js";
import type { ContentElement } from "./content.js";
import { ParagraphBuilder } from "./paragraph-builder.js";
import { HeaderFooterBuilder } from "./header-footer-builder.js";
import { TableBuilder } from "./table-builder.js";
import { ListBuilder } from "./list-builder.js";
import type {
  TableOptions, TableData, TextRun, PageLayout,
  ParagraphOptions, ListOptions, ListData, ListItemData,
  ImageOptions, ImageData,
} from "./types.js";

/** MIME type for ODF text documents. */
const ODT_MIME_TYPE = "application/vnd.oasis.opendocument.text";

/**
 * Builder for ODT (OpenDocument Text) files.
 *
 * @example
 * // Simple document
 * const doc = new OdtDocument();
 * doc.addHeading("My Document", 1);
 * doc.addParagraph("Hello, World!");
 * const bytes = await doc.save();
 *
 * @example
 * // Formatted text
 * const doc = new OdtDocument();
 * doc.addParagraph((p) => {
 *   p.addText("Normal, ");
 *   p.addText("bold, ", { bold: true });
 *   p.addText("and italic.", { italic: true });
 * });
 * const bytes = await doc.save();
 *
 * @example
 * // Table
 * const doc = new OdtDocument();
 * doc.addTable([
 *   ["Name", "Age"],
 *   ["Alice", "30"],
 * ]);
 * const bytes = await doc.save();
 *
 * @example
 * // Page layout with header and footer
 * const doc = new OdtDocument();
 * doc.setPageLayout({ orientation: "landscape", marginTop: "1.5cm" });
 * doc.setHeader("Company Report — Confidential");
 * doc.setFooter("Page ###");
 * doc.addParagraph("Content here.");
 * const bytes = await doc.save();
 *
 * @example
 * // Links and images
 * const doc = new OdtDocument();
 * doc.addParagraph((p) => {
 *   p.addText("Visit ");
 *   p.addLink("our website", "https://example.com");
 * });
 * doc.addImage(pngBytes, { width: "10cm", height: "6cm", mimeType: "image/png" });
 * const bytes = await doc.save();
 */
export class OdtDocument {
  private elements: ContentElement[] = [];
  private metadata: MetadataOptions = {};
  private pageLayout: PageLayout | undefined;
  private headerRuns: TextRun[] | null = null;
  private footerRuns: TextRun[] | null = null;

  /** Set document metadata (title, creator, etc.). */
  setMetadata(options: MetadataOptions): this {
    this.metadata = { ...this.metadata, ...options };
    return this;
  }

  /**
   * Set the page layout (size, margins, orientation).
   *
   * Defaults to A4 portrait with 2cm margins if not called.
   * When orientation is "landscape" and no explicit width/height is given,
   * the A4 dimensions are swapped automatically.
   *
   * @param layout - Page layout options.
   * @returns This document, for chaining.
   *
   * @example
   * doc.setPageLayout({ orientation: "landscape" });
   *
   * @example
   * doc.setPageLayout({
   *   width: "8.5in",
   *   height: "11in",
   *   marginTop: "1in",
   *   marginBottom: "1in",
   * });
   */
  setPageLayout(layout: PageLayout): this {
    this.pageLayout = { ...this.pageLayout, ...layout };
    return this;
  }

  /**
   * Set the document header (appears at the top of every page).
   *
   * Pass a string for plain text, or a callback to build formatted content.
   * Use `###` in a string to insert the current page number.
   *
   * @param content - A string, or a callback receiving a
   *   {@link HeaderFooterBuilder}.
   * @returns This document, for chaining.
   *
   * @example
   * doc.setHeader("Company Report — Confidential");
   *
   * @example
   * doc.setHeader("Page ###");
   *
   * @example
   * doc.setHeader((h) => {
   *   h.addText("Report", { bold: true });
   *   h.addText(" — Page ");
   *   h.addPageNumber();
   * });
   */
  setHeader(content: string | ((builder: HeaderFooterBuilder) => void)): this {
    this.headerRuns = buildHeaderFooterRuns(content);
    return this;
  }

  /**
   * Set the document footer (appears at the bottom of every page).
   *
   * Pass a string for plain text, or a callback to build formatted content.
   * Use `###` in a string to insert the current page number.
   *
   * @param content - A string, or a callback receiving a
   *   {@link HeaderFooterBuilder}.
   * @returns This document, for chaining.
   *
   * @example
   * doc.setFooter("Page ###");
   *
   * @example
   * doc.setFooter((f) => {
   *   f.addText("Page ");
   *   f.addPageNumber({ bold: true });
   *   f.addText(" — Confidential", { italic: true, color: "gray" });
   * });
   */
  setFooter(content: string | ((builder: HeaderFooterBuilder) => void)): this {
    this.footerRuns = buildHeaderFooterRuns(content);
    return this;
  }

  /**
   * Add a paragraph to the document.
   *
   * Pass a string for plain text, or a callback to build formatted content.
   * Optional second parameter for paragraph-level options like tab stops.
   *
   * @param content - A string for plain text, or a callback receiving a
   *   {@link ParagraphBuilder} for formatted text with multiple runs.
   * @param options - Optional paragraph options (tab stops).
   * @returns This document, for chaining.
   *
   * @example
   * doc.addParagraph("Hello, World!");
   *
   * @example
   * doc.addParagraph((p) => {
   *   p.addText("This is ");
   *   p.addText("bold", { bold: true });
   *   p.addText(" text.");
   * });
   *
   * @example
   * // With tab stops
   * doc.addParagraph((p) => {
   *   p.addText("Label");
   *   p.addTab();
   *   p.addText("Value");
   * }, { tabStops: [{ position: "8cm" }] });
   *
   * @example
   * // With links
   * doc.addParagraph((p) => {
   *   p.addText("Visit ");
   *   p.addLink("our site", "https://example.com");
   * });
   */
  addParagraph(
    content: string | ((builder: ParagraphBuilder) => void),
    options?: ParagraphOptions,
  ): this {
    this.elements.push({
      type: "paragraph",
      runs: buildRuns(content),
      paragraphOptions: options,
    });
    return this;
  }

  /**
   * Add a heading to the document.
   *
   * Pass a string for plain text, or a callback to build formatted content.
   * Level defaults to 1 if not specified.
   *
   * @param content - A string for plain text, or a callback receiving a
   *   {@link ParagraphBuilder} for formatted text with multiple runs.
   * @param level - Heading level, 1–6. Defaults to 1.
   * @returns This document, for chaining.
   *
   * @example
   * doc.addHeading("Chapter One", 1);
   *
   * @example
   * doc.addHeading((h) => {
   *   h.addText("Chapter ");
   *   h.addText("One", { italic: true });
   * }, 1);
   */
  addHeading(content: string | ((builder: ParagraphBuilder) => void), level: number = 1): this {
    this.elements.push({
      type: "heading",
      level,
      runs: buildRuns(content),
    });
    return this;
  }

  /**
   * Add a table to the document.
   *
   * Pass an array of arrays for a simple table, or a callback to build
   * a table with formatting, borders, backgrounds, and cell merging.
   *
   * @param content - An array of string arrays (rows of cells), or a
   *   callback receiving a {@link TableBuilder}.
   * @param options - Optional table-level settings (column widths, default border).
   * @returns This document, for chaining.
   *
   * @example
   * doc.addTable([
   *   ["Name", "Age"],
   *   ["Alice", "30"],
   * ]);
   *
   * @example
   * doc.addTable((t) => {
   *   t.addRow((r) => {
   *     r.addCell("Name", { bold: true, backgroundColor: "#DDDDDD" });
   *     r.addCell("Age", { bold: true, backgroundColor: "#DDDDDD" });
   *   });
   *   t.addRow((r) => { r.addCell("Alice"); r.addCell("30"); });
   * }, { columnWidths: ["5cm", "3cm"] });
   */
  addTable(
    content: string[][] | ((builder: TableBuilder) => void),
    options?: TableOptions,
  ): this {
    this.elements.push({
      type: "table",
      table: buildTableData(content, options),
    });
    return this;
  }

  /**
   * Add a list to the document.
   *
   * Pass an array of strings for a simple list, or a callback to build
   * a list with formatting and nesting.
   *
   * @param content - An array of strings (simple items), or a
   *   callback receiving a {@link ListBuilder}.
   * @param options - Optional list-level settings (type: bullet or numbered).
   * @returns This document, for chaining.
   *
   * @example
   * // Simple bullet list
   * doc.addList(["Item 1", "Item 2", "Item 3"]);
   *
   * @example
   * // Numbered list
   * doc.addList(["First", "Second", "Third"], { type: "numbered" });
   *
   * @example
   * // Builder for formatting and nesting
   * doc.addList((l) => {
   *   l.addItem("Plain text item");
   *   l.addItem((p) => {
   *     p.addText("Formatted ", { bold: true });
   *     p.addText("item");
   *   });
   *   l.addItem("Parent");
   *   l.addNested((sub) => {
   *     sub.addItem("Child 1");
   *     sub.addItem("Child 2");
   *   });
   * });
   */
  addList(
    content: string[] | ((builder: ListBuilder) => void),
    options?: ListOptions,
  ): this {
    this.elements.push({
      type: "list",
      list: buildListData(content, options),
    });
    return this;
  }

  /**
   * Add a standalone image to the document.
   *
   * The image is placed in its own paragraph, anchored to the paragraph
   * by default. For inline images within text, use `p.addImage()` inside
   * an `addParagraph()` callback.
   *
   * @param data - The raw image bytes as a Uint8Array.
   * @param options - Image options (width, height, mimeType are required).
   * @returns This document, for chaining.
   *
   * @example
   * doc.addImage(pngBytes, {
   *   width: "10cm",
   *   height: "6cm",
   *   mimeType: "image/png",
   * });
   *
   * @example
   * // Explicit anchor type
   * doc.addImage(jpegBytes, {
   *   width: "15cm",
   *   height: "10cm",
   *   mimeType: "image/jpeg",
   *   anchor: "paragraph",
   * });
   */
  addImage(data: Uint8Array, options: ImageOptions): this {
    const imageData: ImageData = {
      data,
      width: options.width,
      height: options.height,
      mimeType: options.mimeType,
      anchor: options.anchor ?? "paragraph",
    };
    this.elements.push({
      type: "image",
      image: imageData,
    });
    return this;
  }

  /**
   * Insert a page break. Content after this will start on a new page.
   *
   * @returns This document, for chaining.
   *
   * @example
   * doc.addHeading("Chapter 1", 1);
   * doc.addParagraph("Chapter 1 content.");
   * doc.addPageBreak();
   * doc.addHeading("Chapter 2", 1);
   * doc.addParagraph("Chapter 2 content.");
   */
  addPageBreak(): this {
    this.elements.push({ type: "page-break" });
    return this;
  }

  /**
   * Generate the ODT file as a Uint8Array.
   *
   * The returned bytes are a valid ZIP/ODF package that can be written
   * to disk or sent over the network.
   */
  async save(): Promise<Uint8Array> {
    // Collect all embedded images and build path mapping
    const { imageMap, imageFiles } = this.collectImages();

    const contentXml = generateContent(this.elements, imageMap);
    const stylesConfig = this.buildStylesConfig();
    const stylesXml = generateStyles(stylesConfig);
    const metaXml = generateMeta(this.metadata);

    const files: PackageFile[] = [
      { path: "content.xml", content: contentXml },
      { path: "styles.xml", content: stylesXml },
      { path: "meta.xml", content: metaXml },
      ...imageFiles,
    ];

    return assemblePackage(ODT_MIME_TYPE, files);
  }

  /**
   * Build the StylesConfig from document settings.
   */
  private buildStylesConfig(): StylesConfig {
    const config: StylesConfig = {};
    const allStyles: import("../core/xml.js").XmlElement[] = [];

    // Page layout
    if (this.pageLayout) {
      const pl = this.pageLayout;
      const isLandscape = pl.orientation === "landscape";
      const hasExplicitDimensions = pl.width !== undefined && pl.height !== undefined;

      config.pageLayout = {
        width: pl.width ?? (isLandscape && !hasExplicitDimensions ? "29.7cm" : "21cm"),
        height: pl.height ?? (isLandscape && !hasExplicitDimensions ? "21cm" : "29.7cm"),
        orientation: pl.orientation ?? "portrait",
        marginTop: pl.marginTop ?? "2cm",
        marginBottom: pl.marginBottom ?? "2cm",
        marginLeft: pl.marginLeft ?? "2cm",
        marginRight: pl.marginRight ?? "2cm",
      };
    }

    // Header
    if (this.headerRuns) {
      const result = buildHeaderFooterContent(this.headerRuns, "Header", "HF");
      config.headerParagraph = result.paragraph;
      allStyles.push(...result.styles);
    }

    // Footer (style prefix continues from header to avoid collisions)
    if (this.footerRuns) {
      const prefix = allStyles.length > 0 ? "FF" : "HF";
      const result = buildHeaderFooterContent(this.footerRuns, "Footer", prefix);
      config.footerParagraph = result.paragraph;
      allStyles.push(...result.styles);
    }

    if (allStyles.length > 0) {
      config.headerFooterStyles = allStyles;
    }

    return config;
  }

  /**
   * Scan all content elements for embedded images.
   * Returns a mapping from ImageData objects to ZIP paths, plus PackageFile entries.
   */
  private collectImages(): { imageMap: Map<ImageData, string>; imageFiles: PackageFile[] } {
    const imageMap = new Map<ImageData, string>();
    const imageFiles: PackageFile[] = [];
    let counter = 1;

    const register = (img: ImageData): void => {
      if (imageMap.has(img)) return;
      const ext = mimeToExtension(img.mimeType);
      const path = `Pictures/image${counter}${ext}`;
      imageMap.set(img, path);
      imageFiles.push({ path, content: img.data, mediaType: img.mimeType });
      counter++;
    };

    const scanRuns = (runs: TextRun[]): void => {
      for (const run of runs) {
        if (run.image) register(run.image);
      }
    };

    const scanListItems = (items: ListItemData[]): void => {
      for (const item of items) {
        scanRuns(item.runs);
        if (item.nested) scanListItems(item.nested.items);
      }
    };

    for (const element of this.elements) {
      // Standalone image
      if (element.image) register(element.image);

      // Inline images in runs (paragraphs, headings)
      if (element.runs) scanRuns(element.runs);

      // Images in table cells
      if (element.type === "table" && element.table) {
        for (const row of element.table.rows) {
          for (const cell of row.cells) {
            scanRuns(cell.runs);
          }
        }
      }

      // Images in list items
      if (element.type === "list" && element.list) {
        scanListItems(element.list.items);
      }
    }

    return { imageMap, imageFiles };
  }
}

/**
 * Convert a string or builder callback into an array of text runs.
 */
function buildRuns(content: string | ((builder: ParagraphBuilder) => void)): TextRun[] {
  if (typeof content === "string") {
    return [{ text: content }];
  }

  const builder = new ParagraphBuilder();
  content(builder);
  return builder.runs;
}

/**
 * Convert a string or builder callback into header/footer text runs.
 * In strings, `###` is replaced with a page number field.
 */
function buildHeaderFooterRuns(
  content: string | ((builder: HeaderFooterBuilder) => void),
): TextRun[] {
  if (typeof content === "function") {
    const builder = new HeaderFooterBuilder();
    content(builder);
    return builder.runs;
  }

  // Parse string — replace ### with page number fields
  const runs: TextRun[] = [];
  const parts = content.split("###");

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== "") {
      runs.push({ text: parts[i] });
    }
    // Insert page number field between parts (not after the last one)
    if (i < parts.length - 1) {
      runs.push({ text: "#", field: "page-number" });
    }
  }

  // If no ### was found, it's just plain text
  if (runs.length === 0) {
    runs.push({ text: content });
  }

  return runs;
}

/**
 * Convert an array of arrays or a builder callback into TableData.
 */
function buildTableData(
  content: string[][] | ((builder: TableBuilder) => void),
  options?: TableOptions,
): TableData {
  if (typeof content === "function") {
    const builder = new TableBuilder();
    content(builder);
    return { rows: builder.rows, options };
  }

  return {
    rows: content.map((row) => ({
      cells: row.map((text) => ({
        runs: [{ text }],
      })),
    })),
    options,
  };
}

/**
 * Convert a string array or builder callback into ListData.
 */
function buildListData(
  content: string[] | ((builder: ListBuilder) => void),
  options?: ListOptions,
): ListData {
  if (typeof content === "function") {
    const builder = new ListBuilder();
    content(builder);
    return { items: builder.items, options };
  }

  return {
    items: content.map((text) => ({
      runs: [{ text }],
    })),
    options,
  };
}

/**
 * Derive a file extension from a MIME type.
 */
function mimeToExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png": return ".png";
    case "image/jpeg": return ".jpeg";
    case "image/gif": return ".gif";
    case "image/svg+xml": return ".svg";
    case "image/webp": return ".webp";
    case "image/bmp": return ".bmp";
    case "image/tiff": return ".tiff";
    default: return ".bin";
  }
}
