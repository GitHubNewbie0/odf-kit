import { assemblePackage } from "../core/packaging.js";
import type { PackageFile } from "../core/packaging.js";
import { generateMeta } from "../core/metadata.js";
import type { MetadataOptions } from "../core/metadata.js";
import { generateOdsContent, generateOdsStyles } from "./content.js";
import { OdsSheet } from "./sheet-builder.js";
import type { OdsDateFormat } from "./types.js";

/** MIME type for ODF spreadsheet documents. */
const ODS_MIME_TYPE = "application/vnd.oasis.opendocument.spreadsheet";

/**
 * Builder for ODS (OpenDocument Spreadsheet) files.
 *
 * @example
 * // Simple spreadsheet
 * const doc = new OdsDocument();
 * const sheet = doc.addSheet("Sales");
 * sheet.addRow(["Month", "Revenue"], { bold: true, backgroundColor: "#DDDDDD" });
 * sheet.addRow(["January", 12500.00]);
 * sheet.addRow(["February", 14200.00]);
 * sheet.addRow(["Total", { value: "=SUM(B2:B3)", type: "formula" }]);
 * sheet.setColumnWidth(0, "4cm");
 * sheet.setColumnWidth(1, "5cm");
 * const bytes = await doc.save();
 *
 * @example
 * // Multiple sheets
 * const doc = new OdsDocument();
 * const q1 = doc.addSheet("Q1");
 * const q2 = doc.addSheet("Q2");
 * q1.addRow(["January", 12500.00]);
 * q2.addRow(["April", 15300.00]);
 * const bytes = await doc.save();
 *
 * @example
 * // Date formatting
 * const doc = new OdsDocument();
 * doc.setDateFormat("DD/MM/YYYY");
 * const sheet = doc.addSheet("Data");
 * sheet.addRow([new Date("2026-01-15"), 1000]);
 * sheet.addRow([new Date("2026-02-15"), 2000]);
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
   * Can be overridden per row (via `OdsRowOptions.dateFormat`) or per cell
   * (via `OdsCellObject.dateFormat`). Defaults to `"YYYY-MM-DD"`.
   *
   * The `office:date-value` attribute always stores the ISO date regardless
   * of the display format chosen here.
   *
   * @param format - `"YYYY-MM-DD"` | `"DD/MM/YYYY"` | `"MM/DD/YYYY"`.
   * @returns This document, for chaining.
   *
   * @example
   * doc.setDateFormat("DD/MM/YYYY");
   */
  setDateFormat(format: OdsDateFormat): this {
    this.defaultDateFormat = format;
    return this;
  }

  /**
   * Add a sheet (tab) to the spreadsheet.
   *
   * Sheets appear in the tab bar in the order they are added.
   * Returns an {@link OdsSheet} builder for adding rows and setting dimensions.
   *
   * @param name - Sheet tab name (e.g. `"Sales"`, `"Q1 2026"`).
   * @returns The new OdsSheet builder.
   *
   * @example
   * const sheet = doc.addSheet("Sales");
   * sheet.addRow(["Month", "Revenue"]);
   */
  addSheet(name: string): OdsSheet {
    const sheet = new OdsSheet(name);
    this.sheets.push(sheet);
    return sheet;
  }

  /**
   * Generate the ODS file as a Uint8Array.
   *
   * The returned bytes are a valid ZIP/ODF package that can be written
   * to disk, sent over the network, or saved to Nextcloud via WebDAV.
   */
  async save(): Promise<Uint8Array> {
    const sheetData = this.sheets.map((s) => s.data);
    const contentXml = generateOdsContent(sheetData, this.defaultDateFormat);
    const stylesXml = generateOdsStyles();
    const metaXml = generateMeta(this.metadata);

    const files: PackageFile[] = [
      { path: "content.xml", content: contentXml },
      { path: "styles.xml", content: stylesXml },
      { path: "meta.xml", content: metaXml },
    ];

    return assemblePackage(ODS_MIME_TYPE, files);
  }
}
