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

  // ViewId is required for LibreOffice to recognise this as a valid view entry
  viewEntry.appendChild(
    el("config:config-item")
      .attr("config:name", "ViewId")
      .attr("config:type", "string")
      .text("view1"),
  );

  const tablesNamed = el("config:config-item-map-named").attr("config:name", "Tables");

  // Track the first sheet name to use as ActiveTable
  const activeTable = sheetsWithFreeze[0].name;

  for (const sheet of sheetsWithFreeze) {
    const sheetEntry = el("config:config-item-map-entry").attr("config:name", sheet.name);

    const freezeRows = sheet.freezeRows ?? 0;
    const freezeCols = sheet.freezeColumns ?? 0;

    sheetEntry.appendChild(
      el("config:config-item")
        .attr("config:name", "HorizontalSplitMode")
        .attr("config:type", "short")
        .text(freezeCols > 0 ? "2" : "0"),
    );
    sheetEntry.appendChild(
      el("config:config-item")
        .attr("config:name", "VerticalSplitMode")
        .attr("config:type", "short")
        .text(freezeRows > 0 ? "2" : "0"),
    );
    sheetEntry.appendChild(
      el("config:config-item")
        .attr("config:name", "HorizontalSplitPosition")
        .attr("config:type", "int")
        .text(String(freezeCols)),
    );
    sheetEntry.appendChild(
      el("config:config-item")
        .attr("config:name", "VerticalSplitPosition")
        .attr("config:type", "int")
        .text(String(freezeRows)),
    );
    // ActiveSplitRange: 2 = bottom pane (rows frozen), 3 = right pane (cols frozen)
    const activeSplitRange = freezeCols > 0 ? 3 : 2;
    sheetEntry.appendChild(
      el("config:config-item")
        .attr("config:name", "ActiveSplitRange")
        .attr("config:type", "short")
        .text(String(activeSplitRange)),
    );
    sheetEntry.appendChild(
      el("config:config-item")
        .attr("config:name", "PositionLeft")
        .attr("config:type", "int")
        .text("0"),
    );
    sheetEntry.appendChild(
      el("config:config-item")
        .attr("config:name", "PositionRight")
        .attr("config:type", "int")
        .text(String(freezeCols)),
    );
    sheetEntry.appendChild(
      el("config:config-item")
        .attr("config:name", "PositionTop")
        .attr("config:type", "int")
        .text("0"),
    );
    sheetEntry.appendChild(
      el("config:config-item")
        .attr("config:name", "PositionBottom")
        .attr("config:type", "int")
        .text(String(freezeRows)),
    );

    tablesNamed.appendChild(sheetEntry);
  }

  viewEntry.appendChild(tablesNamed);

  // ActiveTable tells LibreOffice which sheet tab is active
  viewEntry.appendChild(
    el("config:config-item")
      .attr("config:name", "ActiveTable")
      .attr("config:type", "string")
      .text(activeTable),
  );

  viewsIndexed.appendChild(viewEntry);
  viewSettingsSet.appendChild(viewsIndexed);
  settings.appendChild(viewSettingsSet);
  root.appendChild(settings);

  return xmlDocument(root);
}
