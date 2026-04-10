import { ODF_NS } from "../core/namespaces.js";
import { el, xmlDocument } from "../core/xml.js";
import type { OdsSheetData } from "./types.js";

/**
 * Generate settings.xml for an ODS document.
 *
 * settings.xml is required to configure freeze rows/columns (the
 * VerticalSplitMode / HorizontalSplitMode approach used by LibreOffice).
 * Only emitted when at least one sheet has freeze settings.
 *
 * @param sheets - Sheet data array in tab order.
 * @returns Serialized settings.xml string, or null if no freeze settings exist.
 */
export function generateOdsSettings(sheets: OdsSheetData[]): string | null {
  const sheetsWithFreeze = sheets.filter(
    (s) => (s.freezeRows ?? 0) > 0 || (s.freezeColumns ?? 0) > 0,
  );

  if (sheetsWithFreeze.length === 0) return null;

  const root = el("office:document-settings")
    .attr("xmlns:office", ODF_NS.office)
    .attr("xmlns:config", "urn:oasis:names:tc:opendocument:xmlns:config:1.0")
    .attr("office:version", "1.2");

  const settings = el("office:settings");

  const viewSettingsSet = el("config:config-item-set").attr("config:name", "ooo:view-settings");

  const viewsIndexed = el("config:config-item-map-indexed").attr("config:name", "Views");
  const viewEntry = el("config:config-item-map-entry");

  const tablesNamed = el("config:config-item-map-named").attr("config:name", "Tables");

  for (const sheet of sheetsWithFreeze) {
    const sheetEntry = el("config:config-item-map-entry").attr("config:name", sheet.name);

    const freezeRows = sheet.freezeRows ?? 0;
    const freezeCols = sheet.freezeColumns ?? 0;

    if (freezeRows > 0) {
      sheetEntry.appendChild(
        el("config:config-item")
          .attr("config:name", "VerticalSplitMode")
          .attr("config:type", "short")
          .text("2"),
      );
      sheetEntry.appendChild(
        el("config:config-item")
          .attr("config:name", "VerticalSplitPosition")
          .attr("config:type", "int")
          .text(String(freezeRows)),
      );
      sheetEntry.appendChild(
        el("config:config-item")
          .attr("config:name", "PositionBottom")
          .attr("config:type", "int")
          .text(String(freezeRows)),
      );
    }

    if (freezeCols > 0) {
      sheetEntry.appendChild(
        el("config:config-item")
          .attr("config:name", "HorizontalSplitMode")
          .attr("config:type", "short")
          .text("2"),
      );
      sheetEntry.appendChild(
        el("config:config-item")
          .attr("config:name", "HorizontalSplitPosition")
          .attr("config:type", "int")
          .text(String(freezeCols)),
      );
      sheetEntry.appendChild(
        el("config:config-item")
          .attr("config:name", "PositionRight")
          .attr("config:type", "int")
          .text(String(freezeCols)),
      );
    }

    tablesNamed.appendChild(sheetEntry);
  }

  viewEntry.appendChild(tablesNamed);
  viewsIndexed.appendChild(viewEntry);
  viewSettingsSet.appendChild(viewsIndexed);
  settings.appendChild(viewSettingsSet);
  root.appendChild(settings);

  return xmlDocument(root);
}
