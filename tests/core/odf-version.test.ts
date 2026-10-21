// tests/core/odf-version.test.ts
//
// The ODF version odf-kit declares in every package it builds.
//
// T1: OASIS OpenDocument-v1.4-schema.rng l.7819-7822; OpenDocument-v1.4-manifest-schema.rng l.201-203.
// office:version on every office:document-* root and manifest:version on
// manifest:manifest each have the single value "1.4".

import { strFromU8, unzipSync } from "fflate";
import { OdtDocument } from "../../src/build-or-fill/build-odt/document.js";
import { OdsDocument } from "../../src/build-or-fill/build-ods/document.js";

/** The root element's start tag of an XML stream (after the XML declaration). */
function rootTag(xml: string): string {
  const tag = /<(?![?!])[^>]+>/.exec(xml)?.[0];
  if (!tag) throw new Error("no root element");
  return tag;
}

/** The value of `attr` on the root element, or undefined. */
function rootAttr(xml: string, attr: string): string | undefined {
  return new RegExp(`\\s${attr}="([^"]*)"`).exec(rootTag(xml))?.[1];
}

function streams(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, data] of Object.entries(unzipSync(bytes))) out[path] = strFromU8(data);
  return out;
}

const ROOTS: Record<string, string> = {
  "content.xml": "office:document-content",
  "styles.xml": "office:document-styles",
  "meta.xml": "office:document-meta",
  "settings.xml": "office:document-settings",
};

async function odt(): Promise<Uint8Array> {
  const doc = new OdtDocument();
  doc.addParagraph("version");
  return doc.save();
}

async function ods(): Promise<Uint8Array> {
  const doc = new OdsDocument();
  const sheet = doc.addSheet("Sheet1");
  sheet.addRow(["version"]);
  // settings.xml is emitted only when a sheet has freeze settings (src/build-or-fill/build-ods/settings.ts:10).
  sheet.freezeRows(1);
  return doc.save();
}

describe.each([
  ["OdtDocument.save", odt],
  ["OdsDocument.save", ods],
])("%s declares ODF 1.4", (_name, build) => {
  test.each(Object.entries(ROOTS))(
    // T1: OpenDocument-v1.4-schema.rng l.7819-7822
    '%s root %s has office:version="1.4"',
    async (path, element) => {
      const files = streams(await build());
      expect(files[path]).toBeDefined();
      expect(rootTag(files[path]).startsWith(`<${element}`)).toBe(true);
      expect(rootAttr(files[path], "office:version")).toBe("1.4");
    },
  );

  // T1: OpenDocument-v1.4-manifest-schema.rng l.201-203
  test('META-INF/manifest.xml root manifest:manifest has manifest:version="1.4"', async () => {
    const files = streams(await build());
    const manifest = files["META-INF/manifest.xml"];
    expect(manifest).toBeDefined();
    expect(rootTag(manifest).startsWith("<manifest:manifest")).toBe(true);
    expect(rootAttr(manifest, "manifest:version")).toBe("1.4");
  });
});
