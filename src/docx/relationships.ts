/**
 * odf-kit — DOCX relationship parser
 *
 * Parses word/_rels/document.xml.rels (and any other .rels file) into a
 * RelationshipMap keyed by rId.
 *
 * Relationship XML structure:
 *
 *   <Relationships xmlns="...">
 *     <Relationship Id="rId1"
 *       Type="http://…/officeDocument/2006/relationships/image"
 *       Target="media/image1.png"/>
 *     <Relationship Id="rId2"
 *       Type="http://…/officeDocument/2006/relationships/hyperlink"
 *       Target="https://example.com"
 *       TargetMode="External"/>
 *   </Relationships>
 */

import { parseXml } from "../reader/xml-parser.js";
import type { RelationshipMap, RelationshipEntry } from "./types.js";

/**
 * Parse a .rels XML string into a RelationshipMap.
 *
 * @param xml - Raw XML content of a .rels file.
 * @returns Map from rId → RelationshipEntry.
 */
export function parseRelationships(xml: string): RelationshipMap {
  const map: RelationshipMap = new Map();
  const root = parseXml(xml);

  for (const child of root.children) {
    if (child.type !== "element") continue;
    if (localName(child.tag) !== "Relationship") continue;

    const id = child.attrs["Id"];
    const type = child.attrs["Type"] ?? "";
    const rawTarget = child.attrs["Target"] ?? "";
    const targetMode = child.attrs["TargetMode"] ?? "";

    if (!id) continue;

    const external = targetMode === "External";

    // Internal targets in document.xml.rels are relative to the word/ folder.
    // Resolve them to full ZIP paths so the reader can look them up directly.
    const target = external ? rawTarget : resolveTarget(rawTarget);

    const entry: RelationshipEntry = { target, external, type };
    map.set(id, entry);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a relative relationship target to a full ZIP path.
 *
 * Targets in word/_rels/document.xml.rels are relative to the word/ folder:
 *   "media/image1.png"  → "word/media/image1.png"
 *   "footnotes.xml"     → "word/footnotes.xml"
 *   "../docProps/core.xml" would resolve to "docProps/core.xml" (not used
 *   in document.xml.rels but handled for correctness)
 *
 * Targets that already start with a slash or a scheme are returned as-is.
 */
function resolveTarget(rawTarget: string): string {
  if (rawTarget.startsWith("/") || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(rawTarget)) {
    return rawTarget;
  }

  // All document.xml.rels targets are relative to word/
  const base = "word/";
  const parts = (base + rawTarget).split("/");
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === "..") {
      resolved.pop();
    } else if (part !== ".") {
      resolved.push(part);
    }
  }

  return resolved.join("/");
}

/**
 * Extract the local name from a possibly-namespaced element name.
 * e.g. "pkg:Relationship" → "Relationship", "Relationship" → "Relationship"
 */
function localName(tag: string): string {
  const colon = tag.indexOf(":");
  return colon === -1 ? tag : tag.slice(colon + 1);
}
