import { ODF_NS, ODF_VERSION } from "../core/namespaces.js";
import { el, xmlDocumentCompact } from "../core/xml.js";

/**
 * Generate settings.xml for an ODT document.
 *
 * Provides sensible default view settings (zoom, layout, viewport) so that
 * LibreOffice opens the document in a clean, predictable state. Without
 * settings.xml, LibreOffice falls back to user preferences which may differ
 * between installations.
 *
 * Serialized without whitespace between tags — LibreOffice's settings parser
 * silently ignores view settings when whitespace text nodes are present
 * between config elements. The xmlns:ooo namespace is required for LibreOffice
 * to recognise the file as originating from an ODF-aware application.
 *
 * @returns Serialized settings.xml string.
 */
export function generateOdtSettings(): string {
  const root = el("office:document-settings")
    .attr("xmlns:office", ODF_NS.office)
    .attr("xmlns:config", "urn:oasis:names:tc:opendocument:xmlns:config:1.0")
    .attr("xmlns:ooo", "http://openoffice.org/2004/office")
    .attr("office:version", ODF_VERSION);

  const settings = el("office:settings");
  const viewSettingsSet = el("config:config-item-set").attr("config:name", "ooo:view-settings");

  // Top-level view area — default viewport dimensions in 1/100 mm units
  viewSettingsSet.appendChild(
    el("config:config-item")
      .attr("config:name", "ViewAreaTop")
      .attr("config:type", "long")
      .text("0"),
  );
  viewSettingsSet.appendChild(
    el("config:config-item")
      .attr("config:name", "ViewAreaLeft")
      .attr("config:type", "long")
      .text("0"),
  );
  viewSettingsSet.appendChild(
    el("config:config-item")
      .attr("config:name", "ViewAreaWidth")
      .attr("config:type", "long")
      .text("32000"),
  );
  viewSettingsSet.appendChild(
    el("config:config-item")
      .attr("config:name", "ViewAreaHeight")
      .attr("config:type", "long")
      .text("18000"),
  );
  viewSettingsSet.appendChild(
    el("config:config-item")
      .attr("config:name", "ShowRedlineChanges")
      .attr("config:type", "boolean")
      .text("true"),
  );
  viewSettingsSet.appendChild(
    el("config:config-item")
      .attr("config:name", "InBrowseMode")
      .attr("config:type", "boolean")
      .text("false"),
  );

  // Views indexed map — Writer uses ViewId "view2"
  const viewsIndexed = el("config:config-item-map-indexed").attr("config:name", "Views");
  const viewEntry = el("config:config-item-map-entry");

  viewEntry.appendChild(
    el("config:config-item")
      .attr("config:name", "ViewId")
      .attr("config:type", "string")
      .text("view2"),
  );
  viewEntry.appendChild(
    el("config:config-item").attr("config:name", "ZoomType").attr("config:type", "short").text("0"),
  );
  viewEntry.appendChild(
    el("config:config-item")
      .attr("config:name", "ZoomFactor")
      .attr("config:type", "short")
      .text("100"),
  );
  viewEntry.appendChild(
    el("config:config-item")
      .attr("config:name", "ViewLayoutColumns")
      .attr("config:type", "short")
      .text("1"),
  );
  viewEntry.appendChild(
    el("config:config-item")
      .attr("config:name", "ViewLayoutBookMode")
      .attr("config:type", "boolean")
      .text("false"),
  );
  viewEntry.appendChild(
    el("config:config-item")
      .attr("config:name", "IsSelectedFrame")
      .attr("config:type", "boolean")
      .text("false"),
  );

  viewsIndexed.appendChild(viewEntry);
  viewSettingsSet.appendChild(viewsIndexed);
  settings.appendChild(viewSettingsSet);
  root.appendChild(settings);

  return xmlDocumentCompact(root);
}
