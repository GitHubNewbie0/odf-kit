import { ODF_NS, ODF_VERSION } from "./namespaces.js";
import { el, xmlDocument } from "./xml.js";

/** Options for document metadata. */
export interface MetadataOptions {
  /** Document title. */
  title?: string;
  /** Document description/subject. */
  description?: string;
  /** Creator name. */
  creator?: string;
  /** Creation date (defaults to now). */
  creationDate?: Date;
}

/**
 * Generate the meta.xml content.
 */
export function generateMeta(options: MetadataOptions = {}): string {
  const root = el("office:document-meta")
    .attr("xmlns:office", ODF_NS.office)
    .attr("xmlns:meta", ODF_NS.meta)
    .attr("xmlns:dc", ODF_NS.dc)
    .attr("office:version", ODF_VERSION);

  const metaEl = el("office:meta");

  // Generator
  metaEl.appendChild(el("meta:generator").text("odf-kit"));

  // Creation date
  const date = options.creationDate ?? new Date();
  metaEl.appendChild(el("meta:creation-date").text(date.toISOString()));

  // Optional fields
  if (options.title) {
    metaEl.appendChild(el("dc:title").text(options.title));
  }

  if (options.description) {
    metaEl.appendChild(el("dc:description").text(options.description));
  }

  if (options.creator) {
    metaEl.appendChild(el("meta:initial-creator").text(options.creator));
  }

  root.appendChild(metaEl);
  return xmlDocument(root);
}
