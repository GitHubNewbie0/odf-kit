/**
 * The line-height setting in the reader (#106, reported by lroder).
 *
 * fo:line-height, style:line-height-at-least and style:line-spacing inherit
 * as one setting: the nearest style in the chain that sets any of them
 * supplies it (T4: D106-1). The reader reports that style's attributes
 * verbatim, and only fo:line-height when that style sets it (T4: D106-2).
 *
 * The fixture expectations are T3: LibreOffice's own PDF lays each child out
 * by the child's attribute alone (fixtures/README.md, "The line-height
 * fixtures").
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { readOdt } from "../../src/odt/read/parser.js";
import type { ParagraphNode, ParagraphStyle } from "../../src/odt/read/types.js";

// ============================================================
// Helpers
// ============================================================

const LINE_HEIGHT_FIELDS = new Set(["lineHeight", "lineHeightAtLeast", "lineSpacing"]);

/**
 * The line-height setting a paragraph reports: exactly the three fields
 * that are present, so `toEqual` also asserts the absent ones are absent.
 */
function lineHeightSetting(style: ParagraphStyle | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(style ?? {}).filter(([k]) => LINE_HEIGHT_FIELDS.has(k)));
}

function fixtureBytes(file: string): Buffer {
  return readFileSync(new URL(`./fixtures/${file}`, import.meta.url));
}

/** Every body paragraph of a fixture that uses `styleName`; never empty. */
function paragraphsStyled(file: string, styleName: string): ParagraphNode[] {
  const paras = readOdt(new Uint8Array(fixtureBytes(file))).body.filter(
    (n): n is ParagraphNode => n.kind === "paragraph" && n.styleName === styleName,
  );
  expect(paras.length).toBeGreaterThan(0);
  return paras;
}

const NS =
  ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
  ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
  ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
  ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"';

/** A minimal ODT: `styles` goes in styles.xml office:styles, `body` in office:text. */
function makeOdt(styles: string, body: string): Uint8Array {
  const content =
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content${NS}>` +
    `<office:body><office:text>${body}</office:text></office:body>` +
    "</office:document-content>";
  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8"?><office:document-styles${NS}>` +
    `<office:styles>${styles}</office:styles>` +
    "</office:document-styles>";
  return zipSync({
    "content.xml": strToU8(content),
    "styles.xml": strToU8(stylesXml),
    "META-INF/manifest.xml": strToU8(
      '<?xml version="1.0"?>' +
        '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">' +
        '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>' +
        "</manifest:manifest>",
    ),
  });
}

/** The single paragraph of a synthetic document whose one style P sets `paraProps`. */
function readOneStyle(paraProps: string): ParagraphStyle | undefined {
  const doc = readOdt(
    makeOdt(
      '<style:style style:name="P" style:family="paragraph">' +
        `<style:paragraph-properties ${paraProps}/>` +
        "</style:style>",
      '<text:p text:style-name="P">x</text:p>',
    ),
  );
  const para = doc.body.find((n): n is ParagraphNode => n.kind === "paragraph");
  return para?.paragraphStyle;
}

// ============================================================
// Fixtures are the files D106-1 names
// ============================================================

describe("line-height fixtures — committed bytes", () => {
  // T4: D106-1 names the three fixtures by sha256.
  test.each([
    ["line-height-test.odt", "782ce26c4e633e718899ed0d6a4ccba48f4231b6db7771986a305cf100227bf3"],
    [
      "line-height-inherit-2.odt",
      "4bffed6bad58d9e94e42b68185220df4b1c5d62598b606dc80ea911fdf8fc023",
    ],
    [
      "line-height-inherit-3.odt",
      "449b24fcc7b37da8404717d9036a5aab92e8ee87f78c83e592a3db5e6a166414",
    ],
  ])("%s has the sha256 D106-1 records", (file, sha256) => {
    expect(createHash("sha256").update(fixtureBytes(file)).digest("hex")).toBe(sha256);
  });
});

// ============================================================
// D106-1 — one setting for inheritance, applied in resolve
// ============================================================

describe("line-height inheritance — fixture 1 (line-height-test.odt)", () => {
  const FILE = "line-height-test.odt";

  test("Text_20_body → lineHeight 300% (T3 fixture 1: 41.4pt; T4: D106-1)", () => {
    for (const p of paragraphsStyled(FILE, "Text_20_body")) {
      expect(lineHeightSetting(p.paragraphStyle)).toEqual({ lineHeight: "300%" });
    }
  });

  test("Child → lineHeightAtLeast 0.101cm, not the inherited 300% (T3 fixture 1: 13.8pt; T4: D106-1)", () => {
    for (const p of paragraphsStyled(FILE, "Child")) {
      expect(lineHeightSetting(p.paragraphStyle)).toEqual({ lineHeightAtLeast: "0.101cm" });
    }
  });

  test("PropChild → lineHeight 100% only, not the inherited at-least (T3 fixture 1: 13.8pt; T4: D106-1)", () => {
    for (const p of paragraphsStyled(FILE, "PropChild")) {
      expect(lineHeightSetting(p.paragraphStyle)).toEqual({ lineHeight: "100%" });
    }
  });

  test("LeadingChild → lineSpacing 0cm only, not the inherited 300% (T3 fixture 1: 13.8pt; T4: D106-1)", () => {
    for (const p of paragraphsStyled(FILE, "LeadingChild")) {
      expect(lineHeightSetting(p.paragraphStyle)).toEqual({ lineSpacing: "0cm" });
    }
  });

  test("P2 (automatic, parent Child) → lineHeightAtLeast 0.101cm (T4: D106-1; T2: §19.510 automatic → named parent)", () => {
    for (const p of paragraphsStyled(FILE, "P2")) {
      expect(lineHeightSetting(p.paragraphStyle)).toEqual({ lineHeightAtLeast: "0.101cm" });
    }
  });

  test("Child keeps the inherited marginBottom 0.247cm (T4: D106-1 last sentence; T2: §16.2 per-property)", () => {
    for (const p of paragraphsStyled(FILE, "Child")) {
      expect(p.paragraphStyle?.marginBottom).toBe("0.247cm");
    }
  });
});

describe("line-height inheritance — fixture 2 (line-height-inherit-2.odt)", () => {
  const FILE = "line-height-inherit-2.odt";

  test("AtLeastBase → lineHeightAtLeast 1.499cm from Standard (T3 fixture 2: 42.5pt; T4: D106-1)", () => {
    for (const p of paragraphsStyled(FILE, "AtLeastBase")) {
      expect(lineHeightSetting(p.paragraphStyle)).toEqual({ lineHeightAtLeast: "1.499cm" });
    }
  });

  test("LeadingOverAtLeast → lineSpacing 0.499cm only (T3 fixture 2: 27.95pt; T4: D106-1)", () => {
    for (const p of paragraphsStyled(FILE, "LeadingOverAtLeast")) {
      expect(lineHeightSetting(p.paragraphStyle)).toEqual({ lineSpacing: "0.499cm" });
    }
  });

  test("LeadingBase → lineSpacing 1cm, not Standard's at-least (T3 fixture 2: 42.15pt; T4: D106-1)", () => {
    for (const p of paragraphsStyled(FILE, "LeadingBase")) {
      expect(lineHeightSetting(p.paragraphStyle)).toEqual({ lineSpacing: "1cm" });
    }
  });

  test("AtLeastOverLeading → lineHeightAtLeast 0.801cm only (T3 fixture 2: 22.7pt; T4: D106-1)", () => {
    for (const p of paragraphsStyled(FILE, "AtLeastOverLeading")) {
      expect(lineHeightSetting(p.paragraphStyle)).toEqual({ lineHeightAtLeast: "0.801cm" });
    }
  });

  test.each(["P1", "P2"])(
    "%s (automatic, parent Standard) → lineHeightAtLeast 1.499cm (T4: D106-1; T2: §19.510)",
    (styleName) => {
      for (const p of paragraphsStyled(FILE, styleName)) {
        expect(lineHeightSetting(p.paragraphStyle)).toEqual({ lineHeightAtLeast: "1.499cm" });
      }
    },
  );
});

describe("line-height inheritance — fixture 3 (line-height-inherit-3.odt)", () => {
  const FILE = "line-height-inherit-3.odt";

  test("LeadingParent → lineSpacing 1cm (T3 fixture 3: 42.15pt; T4: D106-1)", () => {
    for (const p of paragraphsStyled(FILE, "LeadingParent")) {
      expect(lineHeightSetting(p.paragraphStyle)).toEqual({ lineSpacing: "1cm" });
    }
  });

  test("PropOverLeading → lineHeight 200% only (T3 fixture 3: 27.6pt; T4: D106-1)", () => {
    for (const p of paragraphsStyled(FILE, "PropOverLeading")) {
      expect(lineHeightSetting(p.paragraphStyle)).toEqual({ lineHeight: "200%" });
    }
  });

  test("FixedOverLeading → lineHeight 0.801cm only (T3 fixture 3: 22.7pt; T4: D106-1)", () => {
    for (const p of paragraphsStyled(FILE, "FixedOverLeading")) {
      expect(lineHeightSetting(p.paragraphStyle)).toEqual({ lineHeight: "0.801cm" });
    }
  });

  test("Standard → none of the three (fixture 3: Standard sets none; T4: D106-1)", () => {
    for (const p of paragraphsStyled(FILE, "Standard")) {
      expect(lineHeightSetting(p.paragraphStyle)).toEqual({});
    }
  });
});

describe("line-height inheritance — the default style is the chain's root", () => {
  test("default style sets fo:line-height, named style sets at-least → at-least only (T4: D106-1; T2: §16.4, §19.510)", () => {
    const doc = readOdt(
      makeOdt(
        '<style:default-style style:family="paragraph">' +
          '<style:paragraph-properties fo:line-height="150%"/>' +
          "</style:default-style>" +
          '<style:style style:name="Named" style:family="paragraph">' +
          '<style:paragraph-properties style:line-height-at-least="0.5cm"/>' +
          "</style:style>",
        '<text:p text:style-name="Named">x</text:p>',
      ),
    );
    const para = doc.body.find((n): n is ParagraphNode => n.kind === "paragraph");
    expect(lineHeightSetting(para?.paragraphStyle)).toEqual({ lineHeightAtLeast: "0.5cm" });
  });
});

// ============================================================
// D106-2 — what the winning element reports
// ============================================================

describe("line-height in one element (D106-2)", () => {
  test('fo:line-height="120%" with at-least → lineHeight 120% only (T4: D106-2; T2: §20.204 "has precedence")', () => {
    expect(
      lineHeightSetting(readOneStyle('fo:line-height="120%" style:line-height-at-least="0.5cm"')),
    ).toEqual({ lineHeight: "120%" });
  });

  test('fo:line-height="normal" with line-spacing → lineHeight normal only (T4: D106-2; T2: §20.318 "disabled")', () => {
    expect(
      lineHeightSetting(readOneStyle('fo:line-height="normal" style:line-spacing="0.2cm"')),
    ).toEqual({ lineHeight: "normal" });
  });

  test("at-least with line-spacing → both, verbatim (T4: D106-2; spec silent on their precedence)", () => {
    expect(
      lineHeightSetting(
        readOneStyle('style:line-height-at-least="0.5cm" style:line-spacing="0.2cm"'),
      ),
    ).toEqual({ lineHeightAtLeast: "0.5cm", lineSpacing: "0.2cm" });
  });

  test('style:line-spacing="-0.2cm" → lineSpacing "-0.2cm" verbatim (T1: length rng:6951 admits negatives; T4: D8)', () => {
    expect(lineHeightSetting(readOneStyle('style:line-spacing="-0.2cm"'))).toEqual({
      lineSpacing: "-0.2cm",
    });
  });
});
