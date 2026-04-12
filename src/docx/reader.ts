/**
 * odf-kit — DOCX reader
 *
 * Unpacks a .docx ZIP and orchestrates all sub-parsers to produce a
 * DocxDocument. This is the public entry point for the DOCX reading pipeline.
 *
 * Files read (per ECMA-376 Part 1 §11.3):
 *   word/document.xml          — main body (required)
 *   word/_rels/document.xml.rels — relationships: images, hyperlinks, etc.
 *   word/styles.xml            — paragraph and character style definitions
 *   word/numbering.xml         — list definitions (optional)
 *   word/footnotes.xml         — footnote content (optional)
 *   word/endnotes.xml          — endnote content (optional)
 *   word/header*.xml           — header content (optional, up to 3 per section)
 *   word/footer*.xml           — footer content (optional, up to 3 per section)
 *   word/settings.xml          — page size/margins if not in body sectPr (optional)
 *   word/media/*               — embedded images
 *   docProps/core.xml          — document metadata (optional)
 *
 * Relationship type URI suffixes (both openxmlformats.org and purl.oclc.org
 * namespace prefixes are recognised — spec §9.2 permits both):
 *   .../relationships/image
 *   .../relationships/hyperlink
 *   .../relationships/footnotes
 *   .../relationships/endnotes
 *   .../relationships/header
 *   .../relationships/footer
 */

import { unzipSync } from "fflate";
import { parseXml } from "../reader/xml-parser.js";
import type { XmlElementNode } from "../reader/xml-parser.js";
import { parseRelationships } from "./relationships.js";
import { parseStyles } from "./styles.js";
import { parseNumbering } from "./numbering.js";
import { readBody, readNotes } from "./body-reader.js";
import type { BodyReaderContext } from "./body-reader.js";
import type {
  DocxDocument,
  DocxMetadata,
  DocxPageLayout,
  DocxHeaderFooter,
  RelationshipMap,
  StyleMap,
  NumberingMap,
  ImageMap,
  ImageEntry,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a .docx file (as raw bytes) into a DocxDocument model.
 *
 * @param input   - Raw .docx bytes: Uint8Array or ArrayBuffer.
 * @param warnings - Mutable array to which parsing warnings are appended.
 * @returns Fully populated DocxDocument.
 */
export async function readDocx(
  input: Uint8Array | ArrayBuffer,
  warnings: string[],
): Promise<DocxDocument> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  // Unzip — fflate.unzipSync returns Record<string, Uint8Array>
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(bytes);
  } catch (err) {
    throw new Error(`readDocx: failed to unzip input — is this a valid .docx file? (${err})`);
  }

  // Helper: decode a ZIP entry to a UTF-8 string, return null if absent
  function getText(path: string): string | null {
    const entry = zip[path] ?? zip[path.replace(/^\//, "")];
    if (!entry) return null;
    return new TextDecoder("utf-8").decode(entry);
  }

  // ---------------------------------------------------------------------------
  // 1. Relationships
  // ---------------------------------------------------------------------------

  const relsXml = getText("word/_rels/document.xml.rels");
  const relationships: RelationshipMap = relsXml ? parseRelationships(relsXml) : new Map();

  // ---------------------------------------------------------------------------
  // 2. Styles
  // ---------------------------------------------------------------------------

  const stylesXml = getText("word/styles.xml");
  const styles: StyleMap = stylesXml ? parseStyles(stylesXml) : new Map();

  // ---------------------------------------------------------------------------
  // 3. Numbering
  // ---------------------------------------------------------------------------

  const numberingXml = getText("word/numbering.xml");
  const numbering: NumberingMap = numberingXml ? parseNumbering(numberingXml) : new Map();

  // ---------------------------------------------------------------------------
  // 4. Images — load all image-type relationships
  // ---------------------------------------------------------------------------

  const images: ImageMap = new Map();

  for (const [rId, rel] of relationships) {
    if (!isImageRel(rel.type)) continue;
    if (rel.external) continue; // external image URLs — skip, cannot embed

    const entry = zip[rel.target] ?? zip[rel.target.replace(/^\//, "")];
    if (!entry) {
      warnings.push(`Image rId "${rId}" references "${rel.target}" which is not in the ZIP`);
      continue;
    }

    const imageEntry: ImageEntry = {
      bytes: entry,
      mimeType: mimeTypeFromPath(rel.target),
      filename: rel.target.split("/").pop() ?? rel.target,
    };
    images.set(rId, imageEntry);
  }

  // ---------------------------------------------------------------------------
  // 5. Metadata — docProps/core.xml (Dublin Core / OPC core properties)
  //    Spec: ECMA-376-2 §11 (Part 2 defines coreProperties element)
  // ---------------------------------------------------------------------------

  const coreXml = getText("docProps/core.xml");
  const metadata: DocxMetadata = coreXml
    ? parseCoreProperties(coreXml, warnings)
    : { title: null, creator: null, description: null, created: null, modified: null };

  // ---------------------------------------------------------------------------
  // 6. Body reader context — shared across all body walks
  // ---------------------------------------------------------------------------

  const bookmarkNames = new Map<string, string>();

  const ctx: BodyReaderContext = {
    styles,
    numbering,
    relationships,
    bookmarkNames,
    warnings,
  };

  // ---------------------------------------------------------------------------
  // 7. Footnotes and endnotes
  // ---------------------------------------------------------------------------

  const footnotesXml = getText("word/footnotes.xml");
  const footnotes = footnotesXml ? readNotes(footnotesXml, "footnote", ctx) : new Map();

  const endnotesXml = getText("word/endnotes.xml");
  const endnotes = endnotesXml ? readNotes(endnotesXml, "endnote", ctx) : new Map();

  // ---------------------------------------------------------------------------
  // 8. Headers and footers
  //    Discovered via relationship type; header/footer type (default/first/even)
  //    read from the sectPr headerReference/footerReference elements.
  //    Spec ref: ECMA-376 §11.3.9, §11.3.6, §17.10.
  // ---------------------------------------------------------------------------

  // Build rId → headerType map from sectPr references in document.xml
  const headerTypeMap = new Map<string, "default" | "first" | "even">();
  const footerTypeMap = new Map<string, "default" | "first" | "even">();

  const documentXml = getText("word/document.xml");
  if (documentXml) {
    extractHdrFtrTypes(documentXml, headerTypeMap, footerTypeMap);
  }

  const headers: DocxHeaderFooter[] = [];
  const footers: DocxHeaderFooter[] = [];

  for (const [rId, rel] of relationships) {
    if (isHeaderRel(rel.type)) {
      const xml = getText(rel.target);
      if (xml) {
        const headerType = headerTypeMap.get(rId) ?? "default";
        const body = readBody(xml, "hdr", ctx);
        headers.push({ headerType, body });
      }
    } else if (isFooterRel(rel.type)) {
      const xml = getText(rel.target);
      if (xml) {
        const headerType = footerTypeMap.get(rId) ?? "default";
        const body = readBody(xml, "ftr", ctx);
        footers.push({ headerType, body });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 9. Page layout — from body sectPr (preferred) or word/settings.xml fallback
  //    Spec ref: ECMA-376 §17.6 (sectPr), CT_PageSz, CT_PageMar
  // ---------------------------------------------------------------------------

  let pageLayout: DocxPageLayout = emptyPageLayout();

  if (documentXml) {
    pageLayout = extractPageLayout(documentXml, warnings);
  }

  // Fallback to settings.xml if body sectPr had no pgSz/pgMar
  if (!pageLayout.width && !pageLayout.marginTop) {
    const settingsXml = getText("word/settings.xml");
    if (settingsXml) {
      const settingsLayout = extractPageLayoutFromSettings(settingsXml, warnings);
      if (settingsLayout.width) pageLayout = settingsLayout;
    }
  }

  // ---------------------------------------------------------------------------
  // 10. Main document body — last, so all maps are fully populated
  // ---------------------------------------------------------------------------

  if (!documentXml) {
    throw new Error("readDocx: word/document.xml is missing — not a valid .docx file");
  }

  const body = readBody(documentXml, "body", ctx);

  // Warn about any referenced footnotes/endnotes not found in their parts
  for (const [, el] of Object.entries({})) void el; // no-op; warnings already in ctx

  return {
    metadata,
    pageLayout,
    body,
    footnotes,
    endnotes,
    headers,
    footers,
    styles,
    numbering,
    relationships,
    images,
  };
}

// ---------------------------------------------------------------------------
// Core properties parser — docProps/core.xml
// Spec: ECMA-376-2 §11 (OPC Part 2).
// Elements use Dublin Core (dc:), Dublin Core Terms (dcterms:), and
// core properties (cp:) namespaces. We strip prefixes and match local names.
// ---------------------------------------------------------------------------

function parseCoreProperties(xml: string, warnings: string[]): DocxMetadata {
  let title: string | null = null;
  let creator: string | null = null;
  let description: string | null = null;
  let created: string | null = null;
  let modified: string | null = null;

  let root: XmlElementNode;
  try {
    root = parseXml(xml);
  } catch {
    warnings.push("docProps/core.xml could not be parsed — metadata unavailable");
    return { title, creator, description, created, modified };
  }

  // The root element is cp:coreProperties; walk its children
  const container =
    localName(root.tag) === "coreProperties" ? root : (findChild(root, "coreProperties") ?? root);

  for (const child of container.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);
    const text = textContent(child);

    switch (tag) {
      case "title":
        title = text || null;
        break;
      case "creator":
        // dc:creator — primary author
        creator = text || null;
        break;
      case "description":
        // dc:description or cp:description
        description = text || null;
        break;
      case "subject":
        // dc:subject — use as description fallback if description absent
        if (!description) description = text || null;
        break;
      case "created":
        // dcterms:created — ISO 8601 datetime
        created = text || null;
        break;
      case "modified":
        // dcterms:modified — ISO 8601 datetime
        modified = text || null;
        break;
      case "lastModifiedBy":
        // cp:lastModifiedBy — not in our model, skip
        break;
    }
  }

  return { title, creator, description, created, modified };
}

// ---------------------------------------------------------------------------
// Page layout extraction — from the final w:sectPr in document.xml
// Spec ref: ECMA-376 §17.6.17 (sectPr), §17.6.13 (pgSz), §17.6.11 (pgMar)
// ---------------------------------------------------------------------------

function extractPageLayout(documentXml: string, warnings: string[]): DocxPageLayout {
  let root: XmlElementNode;
  try {
    root = parseXml(documentXml);
  } catch {
    warnings.push("word/document.xml could not be re-parsed for page layout");
    return emptyPageLayout();
  }

  // The final sectPr is a direct child of w:body
  const body = findDescendant(root, "body");
  if (!body) return emptyPageLayout();

  // Per spec §17.6.17: the final section's sectPr is the last child of body
  let sectPr: XmlElementNode | null = null;
  for (const child of body.children) {
    if (child.type === "element" && localName(child.tag) === "sectPr") {
      sectPr = child;
    }
  }

  if (!sectPr) return emptyPageLayout();
  return parseSectPr(sectPr);
}

function extractPageLayoutFromSettings(settingsXml: string, warnings: string[]): DocxPageLayout {
  let root: XmlElementNode;
  try {
    root = parseXml(settingsXml);
  } catch {
    warnings.push("word/settings.xml could not be parsed for page layout");
    return emptyPageLayout();
  }

  // word/settings.xml root is w:settings; sectPr may appear as a child
  const sectPr = findChild(root, "sectPr");
  if (!sectPr) return emptyPageLayout();
  return parseSectPr(sectPr);
}

/**
 * Parse a w:sectPr element into a DocxPageLayout.
 * Spec ref: CT_PageSz (§17.18.65) and CT_PageMar.
 *
 * w:pgSz attributes:
 *   w:w      — page width in twips (ST_TwipsMeasure)
 *   w:h      — page height in twips
 *   w:orient — "portrait" | "landscape" (optional; derived from w/h if absent)
 *
 * w:pgMar attributes (all in twips, all required by schema but may be absent
 * in practice):
 *   w:top, w:right, w:bottom, w:left, w:header, w:footer, w:gutter
 */
function parseSectPr(sectPr: XmlElementNode): DocxPageLayout {
  let width: number | null = null;
  let height: number | null = null;
  let orientation: "portrait" | "landscape" | null = null;
  let marginTop: number | null = null;
  let marginBottom: number | null = null;
  let marginLeft: number | null = null;
  let marginRight: number | null = null;

  for (const child of sectPr.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    if (tag === "pgSz") {
      const w = child.attrs["w:w"];
      const h = child.attrs["w:h"];
      const orient = child.attrs["w:orient"];

      if (w !== undefined) width = twipsToCm(Number(w));
      if (h !== undefined) height = twipsToCm(Number(h));

      if (orient === "portrait" || orient === "landscape") {
        orientation = orient;
      } else if (width !== null && height !== null) {
        // Derive orientation from dimensions when w:orient is absent
        // Spec §17.18.65: landscape when width > height
        orientation = width > height ? "landscape" : "portrait";
      }
    } else if (tag === "pgMar") {
      const top = child.attrs["w:top"];
      const bottom = child.attrs["w:bottom"];
      const left = child.attrs["w:left"];
      const right = child.attrs["w:right"];

      if (top !== undefined) marginTop = twipsToCm(Number(top));
      if (bottom !== undefined) marginBottom = twipsToCm(Number(bottom));
      if (left !== undefined) marginLeft = twipsToCm(Number(left));
      if (right !== undefined) marginRight = twipsToCm(Number(right));
    }
  }

  return { width, height, orientation, marginTop, marginBottom, marginLeft, marginRight };
}

function emptyPageLayout(): DocxPageLayout {
  return {
    width: null,
    height: null,
    orientation: null,
    marginTop: null,
    marginBottom: null,
    marginLeft: null,
    marginRight: null,
  };
}

// ---------------------------------------------------------------------------
// Header / footer type extraction
// Reads sectPr headerReference / footerReference elements to build
// rId → "default" | "first" | "even" maps.
// Spec ref: ECMA-376 §17.10.5 (headerReference), §17.10.2 (footerReference)
// ---------------------------------------------------------------------------

function extractHdrFtrTypes(
  documentXml: string,
  headerTypeMap: Map<string, "default" | "first" | "even">,
  footerTypeMap: Map<string, "default" | "first" | "even">,
): void {
  let root: XmlElementNode;
  try {
    root = parseXml(documentXml);
  } catch {
    return;
  }

  // Walk all sectPr elements (final body sectPr + any mid-doc sectPr in pPr)
  collectSectPrRefs(root, headerTypeMap, footerTypeMap);
}

function collectSectPrRefs(
  node: XmlElementNode,
  headerTypeMap: Map<string, "default" | "first" | "even">,
  footerTypeMap: Map<string, "default" | "first" | "even">,
): void {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    const tag = localName(child.tag);

    if (tag === "sectPr") {
      for (const ref of child.children) {
        if (ref.type !== "element") continue;
        const refTag = localName(ref.tag);

        if (refTag === "headerReference" || refTag === "footerReference") {
          const rId = ref.attrs["r:id"] ?? ref.attrs["w:id"];
          const rawType = ref.attrs["w:type"] ?? "default";
          const hdrType = normalizeHdrFtrType(rawType);
          if (rId) {
            if (refTag === "headerReference") headerTypeMap.set(rId, hdrType);
            else footerTypeMap.set(rId, hdrType);
          }
        }
      }
    } else {
      collectSectPrRefs(child, headerTypeMap, footerTypeMap);
    }
  }
}

function normalizeHdrFtrType(raw: string): "default" | "first" | "even" {
  if (raw === "first") return "first";
  if (raw === "even") return "even";
  return "default"; // "default" and "odd" both map to default
}

// ---------------------------------------------------------------------------
// Relationship type helpers
// Both openxmlformats.org and purl.oclc.org URI prefixes are valid per spec §9.2
// ---------------------------------------------------------------------------

const REL_SUFFIXES = {
  image: "relationships/image",
  hyperlink: "relationships/hyperlink",
  footnotes: "relationships/footnotes",
  endnotes: "relationships/endnotes",
  header: "relationships/header",
  footer: "relationships/footer",
} as const;

function relMatches(type: string, suffix: string): boolean {
  return type.endsWith("/" + suffix);
}

function isImageRel(type: string): boolean {
  return relMatches(type, REL_SUFFIXES.image);
}
function isHeaderRel(type: string): boolean {
  return relMatches(type, REL_SUFFIXES.header);
}
function isFooterRel(type: string): boolean {
  return relMatches(type, REL_SUFFIXES.footer);
}

// ---------------------------------------------------------------------------
// MIME type from file extension
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  webp: "image/webp",
  svg: "image/svg+xml",
  wmf: "image/x-wmf",
  emf: "image/x-emf",
};

function mimeTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------

function twipsToCm(twips: number): number {
  return Number(((twips / 1440) * 2.54).toFixed(4));
}

// ---------------------------------------------------------------------------
// XML utility helpers
// ---------------------------------------------------------------------------

function localName(tag: string): string {
  const colon = tag.indexOf(":");
  return colon === -1 ? tag : tag.slice(colon + 1);
}

/** Find a direct child element by local name. */
function findChild(el: XmlElementNode, name: string): XmlElementNode | null {
  for (const child of el.children) {
    if (child.type === "element" && localName(child.tag) === name) return child;
  }
  return null;
}

/** Find a descendant element by local name (breadth-first). */
function findDescendant(el: XmlElementNode, name: string): XmlElementNode | null {
  const queue: XmlElementNode[] = [el];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (localName(node.tag) === name) return node;
    for (const child of node.children) {
      if (child.type === "element") queue.push(child);
    }
  }
  return null;
}

/** Concatenate all text node descendants of an element. */
function textContent(el: XmlElementNode): string {
  let text = "";
  for (const child of el.children) {
    if (child.type === "text") text += child.text;
    else if (child.type === "element") text += textContent(child);
  }
  return text.trim();
}
