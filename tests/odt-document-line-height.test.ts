/**
 * The builder's line-height options (#106, reported by lroder).
 *
 * T4: D106-4. ParagraphOptions has lineHeight, lineHeightAtLeast and
 * lineSpacing. A value the ODF 1.4 grammar does not permit for its attribute
 * is refused with a TypeError at the API boundary, including a number that
 * is not finite or is negative; a negative percent for lineHeight is refused
 * too (XSL 1.0 §7.15.4, spec/w3c-xsl/REC-xsl-20011015/xslspec.txt
 * l.23861–23862), but a percent whose value is 0 is not negative, whatever
 * its sign. A numeric lineHeight becomes a percent by shifting the decimal
 * point of its shortest decimal form: nothing is rounded (D8).
 */
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import fc from "fast-check";
import { OdtDocument } from "../src/build-or-fill/build-odt/document.js";
import type { ParagraphOptions } from "../src/build-or-fill/build-odt/types.js";

// ─── Seed ──────────────────────────────────────────────────────────────
//
// T4: D106-6 — this unit's property tests take their seed the way DS1-22
// pins the style-attribute property test (tests/core/style-attr.property.test.ts),
// so a failure reproduces on every run; an environment variable overrides it
// for soak runs. ODF_KIT_PROPERTY_SEED unset: the pinned seed below. Set to an
// integer: that seed. Set to "random": a fresh seed each run, printed so a
// failing soak run can be replayed. The pinned value is the date of the
// ruling (D106-6), as DS1-22's is; any fixed integer serves.
const PINNED_SEED = 20261117;
const seedSetting = process.env.ODF_KIT_PROPERTY_SEED;
const seed =
  seedSetting === undefined || seedSetting === ""
    ? PINNED_SEED
    : seedSetting === "random"
      ? Math.floor(Math.random() * 2 ** 31) // any non-negative 31-bit integer
      : Number.parseInt(seedSetting, 10);
if (!Number.isSafeInteger(seed)) {
  throw new Error(
    `ODF_KIT_PROPERTY_SEED must be an integer or "random", got ${JSON.stringify(seedSetting)}`,
  );
}
if (seedSetting !== undefined && seedSetting !== "")
  console.log(`OdtDocument line-height property seed: ${seed}`);
fc.configureGlobal({ seed });

// ============================================================
// T1 patterns, read from the generated grammar (never restated)
// ============================================================

interface DatatypeFile {
  datatypes: Record<string, { declarations: { pattern: { params: { pattern: string } }[] }[] }>;
}
const DATATYPES = (
  JSON.parse(
    readFileSync(new URL("../spec/odf-datatypes.json", import.meta.url), "utf-8"),
  ) as DatatypeFile
).datatypes;

/** An XSD pattern matches the whole value: anchor it. */
function t1(name: string): RegExp {
  const p = DATATYPES[name]?.declarations[0]?.pattern[0]?.params.pattern;
  if (p === undefined) throw new Error(`no T1 pattern for ${name}`);
  return new RegExp(`^(?:${p})$`);
}

const LENGTH = t1("length"); // rng:6951
const NON_NEGATIVE_LENGTH = t1("nonNegativeLength"); // rng:7070
const PERCENT = t1("percent"); // rng:9082

/** T1 value sets of the three attributes (rng:12465, 12474, 12479). */
const ATTR_VALUE_OK: Record<string, (v: string) => boolean> = {
  "fo:line-height": (v) => v === "normal" || NON_NEGATIVE_LENGTH.test(v) || PERCENT.test(v),
  "style:line-height-at-least": (v) => NON_NEGATIVE_LENGTH.test(v),
  "style:line-spacing": (v) => LENGTH.test(v),
};

// ============================================================
// Helpers
// ============================================================

const decode = new TextDecoder();

async function contentXml(doc: OdtDocument): Promise<string> {
  return decode.decode(unzipSync(await doc.save())["content.xml"]);
}

/** Every value of `attr` in content.xml. */
function attrValues(xml: string, attr: string): string[] {
  return [...xml.matchAll(new RegExp(`${attr}="([^"]*)"`, "g"))].map((m) => m[1] ?? "");
}

/** The one value of `attr` written for a single paragraph with `opts`. */
async function writtenAttr(
  opts: Record<string, unknown>,
  attr: string,
): Promise<string | undefined> {
  const doc = new OdtDocument();
  doc.addParagraph("x", options(opts));
  const values = attrValues(await contentXml(doc), attr);
  expect(values.length).toBeLessThanOrEqual(1);
  return values[0];
}

/** Options built before the type names them; a cast, so red means behaviour. */
function options(o: Record<string, unknown>): ParagraphOptions {
  return o as ParagraphOptions;
}

/** An exact decimal: digits × 10^-scale, as BigInts. */
interface Decimal {
  digits: bigint;
  scale: bigint;
}

/** Parse a decimal string, exponent form included ("1.5", "1e-7", "1e+21"). */
function parseDecimal(s: string): Decimal {
  const m = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(s);
  if (!m) throw new Error(`not a decimal: ${s}`);
  const frac = m[2] ?? "";
  return {
    digits: BigInt(`${m[1]}${frac}`),
    scale: BigInt(frac.length) - BigInt(m[3] ?? "0"),
  };
}

/** a = b exactly, by cross-multiplication. */
function decimalsEqual(a: Decimal, b: Decimal): boolean {
  const k = a.scale > b.scale ? a.scale : b.scale;
  return a.digits * 10n ** (k - a.scale) === b.digits * 10n ** (k - b.scale);
}

/** A verbatim value below 0: a leading "-" and a nonzero digit. */
function isBelowZero(v: string): boolean {
  const m = /^-([0-9]*\.?[0-9]*)/.exec(v);
  return m !== null && /[1-9]/.test(m[1] ?? "");
}

// ============================================================
// C11 — the two new options
// ============================================================

describe("ParagraphOptions.lineHeightAtLeast and lineSpacing", () => {
  test('lineHeightAtLeast "0.5cm" → style:line-height-at-least="0.5cm" (T4: D106-4; T1: rng:12474)', async () => {
    expect(await writtenAttr({ lineHeightAtLeast: "0.5cm" }, "style:line-height-at-least")).toBe(
      "0.5cm",
    );
  });

  test('lineSpacing "-0.1cm" → style:line-spacing="-0.1cm" (T1: length rng:6951 admits negatives; T4: D8)', async () => {
    expect(await writtenAttr({ lineSpacing: "-0.1cm" }, "style:line-spacing")).toBe("-0.1cm");
  });

  test('lineHeightAtLeast "-0.5cm" → TypeError (T4: D106-4; T1: nonNegativeLength rng:7070)', () => {
    expect(() =>
      new OdtDocument().addParagraph("x", options({ lineHeightAtLeast: "-0.5cm" })),
    ).toThrow(TypeError);
  });

  test.each(["lineHeightAtLeast", "lineSpacing"])(
    "%s given the number 12 from untyped JavaScript → TypeError (T4: D106-4 first bullet, 'a length needs a unit'; T1: rng:6951/7070)",
    (key) => {
      expect(() => new OdtDocument().addParagraph("x", options({ [key]: 12 }))).toThrow(TypeError);
    },
  );

  test("addHeading refuses the same values (T4: D106-4 'at the API boundary')", () => {
    expect(() =>
      new OdtDocument().addHeading("x", 1, options({ lineHeightAtLeast: "-0.5cm" })),
    ).toThrow(TypeError);
    expect(() => new OdtDocument().addHeading("x", 1, { lineHeight: -0.5 })).toThrow(TypeError);
  });
});

// ============================================================
// C12 — lineHeight: exact numbers, checked strings
// ============================================================

describe("ParagraphOptions.lineHeight", () => {
  test.each([
    [1.555, "155.5%"],
    [1.005, "100.5%"],
    [1e-7, "0.00001%"],
  ])(
    "number %p → fo:line-height=%p by decimal shift, nothing rounded (T4: D106-4, D8; T1: percent rng:9082)",
    async (n, expected) => {
      expect(await writtenAttr({ lineHeight: n }, "fo:line-height")).toBe(expected);
    },
  );

  test('-0 → fo:line-height="0%" (T4: D106-4 third bullet: -0 is not negative)', async () => {
    expect(await writtenAttr({ lineHeight: -0 }, "fo:line-height")).toBe("0%");
  });

  test.each([-0.5, NaN, Infinity])(
    "number %p → TypeError (T4: D106-4 'not finite or is negative')",
    (n) => {
      expect(() => new OdtDocument().addParagraph("x", { lineHeight: n })).toThrow(TypeError);
    },
  );

  test.each(["1.5em", "-3pt", "auto"])(
    "string %p → TypeError (T4: D106-4; T1: rng:12465 normal | nonNegativeLength | percent)",
    (s) => {
      expect(() => new OdtDocument().addParagraph("x", { lineHeight: s })).toThrow(TypeError);
    },
  );

  test('"-50%" → TypeError (T4: D106-4 third bullet; XSL 1.0 §7.15.4 "Negative values are illegal")', () => {
    expect(() => new OdtDocument().addParagraph("x", { lineHeight: "-50%" })).toThrow(TypeError);
  });

  test.each(["-0%", "-0.00%"])(
    "%p → written as given: a percent of value 0 is not negative (T4: D106-4 third bullet; T1: percent rng:9082; D8)",
    async (s) => {
      expect(await writtenAttr({ lineHeight: s }, "fo:line-height")).toBe(s);
    },
  );

  test.each(["normal", "150%", "18pt"])(
    "%p → written verbatim (T1: rng:12465; T4: D8)",
    async (s) => {
      expect(await writtenAttr({ lineHeight: s }, "fo:line-height")).toBe(s);
    },
  );
});

// ============================================================
// px — handed a conversion, never emitted (first pass 10.3 #6)
// ============================================================

describe("line-height options — px is written in pt (T4: D8 Case 2, D8a: never emit px; typography in pt)", () => {
  test.each([
    ["lineHeight", "fo:line-height", "12px", "9pt"],
    ["lineHeightAtLeast", "style:line-height-at-least", "12px", "9pt"],
    ["lineSpacing", "style:line-spacing", "-12px", "-9pt"],
  ])("%s %p → %p (1px = 0.75pt, exact; T4: D8, D8a)", async (key, attr, given, expected) => {
    expect(await writtenAttr({ [key]: given }, attr)).toBe(expected);
  });

  test('lineHeightAtLeast "12.5px" → "9.4pt": the shortest decimal in [9.3375, 9.4125)pt (T4: D8c, D8b)', async () => {
    expect(await writtenAttr({ lineHeightAtLeast: "12.5px" }, "style:line-height-at-least")).toBe(
      "9.4pt",
    );
  });

  test.each(["lineHeight", "lineHeightAtLeast", "lineSpacing"])(
    "%s: a px value the length core cannot convert → TypeError (T4: D106-4 API boundary; core numeric bound, src/core/length.ts)",
    (key) => {
      const tooLong = `${"1".repeat(70)}px`;
      expect(() => new OdtDocument().addParagraph("x", options({ [key]: tooLong }))).toThrow(
        TypeError,
      );
    },
  );
});

// ============================================================
// Property tests (fast-check)
// ============================================================

describe("line-height options — properties (T4: D106-4)", () => {
  // Run count and generator sizes stand as committed (T4: D106-10). Each is for:
  // - runs, fast-check's default 100 (no numRuns set): the cases drawn per run.
  // - double min 0, max Number.MAX_VALUE: every finite non-negative double, so
  //   String(n) gives both plain and exponent forms ("1e-7", "1.5e+21").
  // - constant -0: the one signed value D106-4 admits ("-0 gives 0%").
  // - integer 0 to 1000, divided by 1000: decimals from 0 to 1 with up to three
  //   fraction digits, whose String(n) is a short plain decimal.
  test("any finite non-negative number, -0 included → a T1 percent exactly 100 × the number's decimal string", async () => {
    const nonNegative = fc.oneof(
      fc.double({ min: 0, max: Number.MAX_VALUE, noNaN: true }),
      fc.constant(-0),
      fc.integer({ min: 0, max: 1000 }).map((i) => i / 1000),
    );
    await fc.assert(
      fc.asyncProperty(nonNegative, async (n) => {
        const written = await writtenAttr({ lineHeight: n }, "fo:line-height");
        expect(written).toBeDefined();
        expect(PERCENT.test(written as string)).toBe(true);
        const out = parseDecimal((written as string).slice(0, -1));
        const hundredTimes = parseDecimal(String(n));
        hundredTimes.digits *= 100n;
        expect(decimalsEqual(out, hundredTimes)).toBe(true);
      }),
    );
  });

  // Run count and generator sizes stand as committed (T4: D106-10). Each is for:
  // - runs, fast-check's default 100 per option (no numRuns set): the cases
  //   drawn per run.
  // - fc.string() at fast-check's default size: arbitrary short text, mostly
  //   not a lexical at all.
  // - integer part \d{0,3}: zero to three digits, so an empty integer part
  //   (".5") is drawn as well as whole numbers.
  // - fraction \.\d{0,3}: zero to three digits, so a bare trailing point
  //   ("12.") is drawn as well as decimals.
  // - leading-point form \.\d{1,3}: one to three digits after a point with
  //   no integer part.
  const nearLexical = fc.stringMatching(
    /^[-+]?(\d{0,3}(\.\d{0,3})?|\.\d{1,3})(cm|mm|in|pt|pc|px|%|em|rem)?$/,
  );
  const anyString = fc.oneof(
    fc.string(),
    nearLexical,
    fc.constantFrom("normal", "auto", "inherit", ""),
  );

  test.each([
    ["lineHeight", "fo:line-height"],
    ["lineHeightAtLeast", "style:line-height-at-least"],
    ["lineSpacing", "style:line-spacing"],
  ])(
    "any string for %s → a TypeError, or a %s value matching T1 (never a percent below 0 for fo:line-height)",
    async (key, attr) => {
      await fc.assert(
        fc.asyncProperty(anyString, async (s) => {
          const doc = new OdtDocument();
          try {
            doc.addParagraph("x", options({ [key]: s }));
          } catch (e) {
            expect(e).toBeInstanceOf(TypeError);
            return;
          }
          // Not refused → written, exactly once (T4: D106-4 "writes each
          // line-height attribute").
          const values = attrValues(await contentXml(doc), attr);
          expect(values).toHaveLength(1);
          for (const v of values) {
            expect(ATTR_VALUE_OK[attr]?.(v)).toBe(true);
            expect(v.endsWith("px")).toBe(false); // T4: D8a, never emit px
            if (attr === "fo:line-height") expect(isBelowZero(v)).toBe(false);
          }
        }),
      );
    },
  );
});

// ============================================================
// C13 — the style dedup key
// ============================================================

describe("line-height options — automatic style dedup", () => {
  test("two paragraphs with different at-least values get two styles (T4: D106-4)", async () => {
    const doc = new OdtDocument();
    doc.addParagraph("a", options({ lineHeightAtLeast: "0.5cm" }));
    doc.addParagraph("b", options({ lineHeightAtLeast: "0.8cm" }));
    const values = attrValues(await contentXml(doc), "style:line-height-at-least");
    expect(values.sort()).toEqual(["0.5cm", "0.8cm"]);
  });

  test("two paragraphs with different line-spacing values get two styles (T4: D106-4)", async () => {
    const doc = new OdtDocument();
    doc.addParagraph("a", options({ lineSpacing: "0.1cm" }));
    doc.addParagraph("b", options({ lineSpacing: "0.2cm" }));
    const values = attrValues(await contentXml(doc), "style:line-spacing");
    expect(values.sort()).toEqual(["0.1cm", "0.2cm"]);
  });
});
