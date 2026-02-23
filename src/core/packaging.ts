import { zipSync, type Zippable } from "fflate";
import { generateManifest } from "./manifest.js";
import type { ManifestEntry } from "./manifest.js";

/** A file to include in the ODF package. */
export interface PackageFile {
  path: string;
  content: string | Uint8Array;

  /**
   * Explicit MIME type for the manifest entry.
   * If omitted, defaults to `"text/xml"` for `.xml` files and
   * `"application/octet-stream"` for everything else.
   */
  mediaType?: string;
}

/**
 * Assemble an ODF ZIP package.
 *
 * The ODF specification requires:
 * 1. The "mimetype" file must be the FIRST entry in the ZIP.
 * 2. The "mimetype" file must be stored uncompressed (STORED, not DEFLATED).
 * 3. The "mimetype" file must contain only the media type string, with no
 *    trailing newline or whitespace.
 *
 * @param mimeType - The ODF MIME type (e.g. "application/vnd.oasis.opendocument.text").
 * @param files - The XML and other files to include (excluding mimetype and manifest).
 * @returns A Uint8Array containing the complete ZIP package.
 */
export async function assemblePackage(mimeType: string, files: PackageFile[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();

  // Build ZIP file map — object insertion order determines entry order in ZIP
  const zipData: Zippable = {};

  // 1. mimetype — must be first, uncompressed (level 0 = STORED)
  zipData["mimetype"] = [encoder.encode(mimeType), { level: 0 as const }];

  // 2. Add content files (DEFLATED)
  for (const file of files) {
    const data = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    zipData[file.path] = [data, { level: 6 as const }];
  }

  // 3. Generate and add manifest (DEFLATED)
  const manifestEntries: ManifestEntry[] = files.map((f) => ({
    fullPath: f.path,
    mediaType: f.mediaType ?? (f.path.endsWith(".xml") ? "text/xml" : "application/octet-stream"),
  }));

  const manifestXml = generateManifest(mimeType, manifestEntries);
  zipData["META-INF/manifest.xml"] = [encoder.encode(manifestXml), { level: 6 as const }];

  return zipSync(zipData);
}
