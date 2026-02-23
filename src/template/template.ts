/**
 * Template engine entry point.
 *
 * fillTemplate() takes a .odt file as bytes and a data object,
 * then returns a new .odt file with all placeholders replaced.
 *
 * Pipeline: unzip → heal content.xml → replace placeholders → re-zip
 */

import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { healPlaceholders } from "./healer.js";
import { replaceAll, type TemplateData } from "./replacer.js";

/**
 * Fill an ODF template with data.
 *
 * @param templateBytes — Raw bytes of a .odt file
 * @param data — Key-value data for placeholder replacement
 * @returns Uint8Array — A new .odt file with placeholders replaced
 *
 * @example
 * ```typescript
 * import { fillTemplate } from "odf-kit";
 * import { readFileSync, writeFileSync } from "fs";
 *
 * const template = readFileSync("invoice-template.odt");
 * const result = await fillTemplate(template, {
 *   customer: "Acme Corp",
 *   date: "2026-02-23",
 *   items: [
 *     { product: "Widget", qty: 5, price: 25 },
 *     { product: "Gadget", qty: 3, price: 40 },
 *   ],
 *   total: 245,
 * });
 * writeFileSync("invoice-filled.odt", result);
 * ```
 */
export function fillTemplate(templateBytes: Uint8Array, data: TemplateData): Uint8Array {
  // Unzip the ODF package
  const files = unzipSync(templateBytes);

  // Process content.xml — this is where all document text lives
  if (files["content.xml"]) {
    const xml = strFromU8(files["content.xml"]);
    const healed = healPlaceholders(xml);
    const filled = replaceAll(healed, data);
    files["content.xml"] = strToU8(filled);
  }

  // Process styles.xml — headers/footers may contain placeholders
  if (files["styles.xml"]) {
    const xml = strFromU8(files["styles.xml"]);
    const healed = healPlaceholders(xml);
    const filled = replaceAll(healed, data);
    files["styles.xml"] = strToU8(filled);
  }

  // Re-zip with ODF-required structure:
  // mimetype must be first entry, stored uncompressed
  const mimetype = files["mimetype"];
  const result: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};

  // mimetype first, uncompressed
  if (mimetype) {
    result["mimetype"] = [mimetype, { level: 0 }];
  }

  // All other files, compressed
  for (const [path, content] of Object.entries(files)) {
    if (path === "mimetype") continue;
    result[path] = [content, { level: 6 }];
  }

  return zipSync(result);
}
