import { ODF_NS, ODF_VERSION } from "./namespaces.js";
import { el, xmlDocument } from "./xml.js";

/** An entry in the ODF manifest. */
export interface ManifestEntry {
  fullPath: string;
  mediaType: string;
}

/**
 * Generate the META-INF/manifest.xml content.
 *
 * The manifest lists every file in the ODF package along with its media type.
 * The root entry ("/") describes the overall document type.
 */
export function generateManifest(rootMediaType: string, entries: ManifestEntry[]): string {
  const root = el("manifest:manifest")
    .attr("xmlns:manifest", ODF_NS.manifest)
    .attr("manifest:version", ODF_VERSION);

  // Root entry — the document itself
  root.appendChild(
    el("manifest:file-entry")
      .attr("manifest:media-type", rootMediaType)
      .attr("manifest:full-path", "/"),
  );

  // Individual file entries
  for (const entry of entries) {
    root.appendChild(
      el("manifest:file-entry")
        .attr("manifest:media-type", mediaTypeForPath(entry.fullPath, entry.mediaType))
        .attr("manifest:full-path", entry.fullPath),
    );
  }

  return xmlDocument(root);
}

/** Derive a sensible media type from a file path if not explicitly provided. */
function mediaTypeForPath(path: string, explicit: string): string {
  if (explicit) return explicit;
  if (path.endsWith(".xml")) return "text/xml";
  return "application/octet-stream";
}
