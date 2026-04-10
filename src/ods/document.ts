import { assemblePackage } from "../core/packaging.js";
import type { PackageFile } from "../core/packaging.js";
import { generateMeta } from "../core/metadata.js";
import type { MetadataOptions } from "../core/metadata.js";
import { generateOdsContent, generateOdsStyles } from "./content.js";
import { generateOdsSettings } from "./settings.js";
import { OdsSheet } from "./sheet-builder.js";
import type { OdsDateFormat } from "./types.js";

/** MIME type for ODF spreadsheet documents. */
const ODS_MIME_TYPE = "application/vnd.oasis.opendocument.spreadsheet";

/**
 * Builder for ODS (OpenDocument Spreadsheet) files.
 *
 * @example
 * const doc = new OdsDocument();
 * const sheet = doc.addSheet("Sales");
 * sheet.addRow(["Month", "Revenue"], { bold: true, backgroundColor: "#DDDDDD" });
 * sheet.addRow(["January", 12500.00]);
 * sheet.addRow(["Total", { value: "=SUM(B2:B3)", type: "formula" }]);
 * sheet.setColumnWidth(0, "4cm");
 * sheet.freezeRows(1);
 * const bytes = await doc.save();
 */
export class OdsDocument {
  private sheets: OdsSheet[] = [];
  private metadata: MetadataOptions = {};
  private defaultDateFormat: OdsDateFormat = "YYYY-MM-DD";

  /** Set document metadata (title, creator, description). */
  setMetadata(options: MetadataOptions): this {
    this.metadata = { ...this.metadata, ...options };
    return this;
  }

  /**
   * Set the default date display format for all date cells in this document.
   *
   * @param format - `"YYYY-MM-DD"` | `"DD/MM/YYYY"` | `"MM/DD/YYYY"`.
   */
  setDateFormat(format: OdsDateFormat): this {
    this.defaultDateFormat = format;
    return this;
  }

  /**
   * Add a sheet (tab) to the spreadsheet.
   *
   * @param name - Sheet tab name.
   * @returns The new OdsSheet builder.
   */
  addSheet(name: string): OdsSheet {
    const sheet = new OdsSheet(name);
    this.sheets.push(sheet);
    return sheet;
  }

  /**
   * Generate the ODS file as a Uint8Array.
   */
  async save(): Promise<Uint8Array> {
    const sheetData = this.sheets.map((s) => s.data);
    const contentXml = generateOdsContent(sheetData, this.defaultDateFormat);
    const stylesXml = generateOdsStyles();
    const metaXml = generateMeta(this.metadata);
    const settingsXml = generateOdsSettings(sheetData);

    const files: PackageFile[] = [
      { path: "content.xml", content: contentXml },
      { path: "styles.xml", content: stylesXml },
      { path: "meta.xml", content: metaXml },
    ];

    if (settingsXml) {
      files.push({ path: "settings.xml", content: settingsXml });
    }

    return assemblePackage(ODS_MIME_TYPE, files);
  }
}
