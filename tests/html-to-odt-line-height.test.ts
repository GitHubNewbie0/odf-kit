/**
 * CSS line-height → fo:line-height in htmlToOdt (#106, reported by lroder).
 *
 * T4: D106-5 fourth bullet. CSS `normal` writes no attribute. A unitless
 * number and an `em` value become a percent by the length core's decimal
 * shift (an em is the current font size, CSS 2.1 §10.8.1). Other values
 * with no ODF form are dropped without notice, pending the Phase 1 warnings
 * channel. The parser never hands the builder a value D106-4 refuses, so a
 * conversion never throws for a line-height (C-2 Part 3; D-A2: document
 * input degrades).
 */
import { describe, expect, test } from "@jest/globals";
import { strFromU8, unzipSync } from "fflate";
import fc from "fast-check";
import { htmlToOdt } from "../src/odt/index.js";

async function getContent(html: string): Promise<string> {
  return strFromU8(unzipSync(await htmlToOdt(html))["content.xml"]);
}

/** content.xml for one paragraph whose inline style sets line-height. */
function withLineHeight(value: string): Promise<string> {
  const escaped = value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return getContent(`<p style="line-height: ${escaped}">X</p>`);
}

function lineHeightAttr(xml: string): string | undefined {
  return /fo:line-height="([^"]*)"/.exec(xml)?.[1];
}

describe("htmlToOdt — CSS line-height (T4: D106-5 fourth bullet)", () => {
  test('unitless 1.555 → fo:line-height="155.5%" by decimal shift, never through Number (T4: D106-4, D106-5, D8)', async () => {
    expect(lineHeightAttr(await withLineHeight("1.555"))).toBe("155.5%");
  });

  test('unitless 1.00000000000000001 → fo:line-height="100.000000000000001%": the lexical shift, which Number() would collapse to 100% (T4: D106-5, D8; first pass 10.2 S4 "never through Number")', async () => {
    expect(lineHeightAttr(await withLineHeight("1.00000000000000001"))).toBe(
      "100.000000000000001%",
    );
  });

  test('1.5em → fo:line-height="150%" (T4: D106-5 fourth bullet; CSS 2.1 visudet l.1557–1563: 1.2em and 120% give the same line height)', async () => {
    expect(lineHeightAttr(await withLineHeight("1.5em"))).toBe("150%");
  });

  test.each(["-50%", "-1.5em"])(
    "%p → no attribute, no throw (T4: D106-4 third bullet, D106-5 fourth bullet)",
    async (v) => {
      expect(lineHeightAttr(await withLineHeight(v))).toBeUndefined();
    },
  );

  test("2rem → no attribute, no throw (T4: D106-5 fourth bullet: no ODF form)", async () => {
    expect(lineHeightAttr(await withLineHeight("2rem"))).toBeUndefined();
  });

  test("a 400-digit unitless value → no attribute, no throw (D-A2 bound, html-parser.ts cssLengthToOdf; core MAX_NUMERIC_LEXICAL)", async () => {
    const xml = await withLineHeight("9".repeat(400));
    expect(xml).toContain("<office:document-content");
    expect(lineHeightAttr(xml)).toBeUndefined();
  });

  // A leading "+" is a CSS number's optional sign: CSS Syntax 3 §4.3.13
  // "Consume a number", spec/w3c-css/CRD-css-syntax-3-20261001.txt
  // l.3849–3851 ("an optional sign character which is either "+", "-", or
  // missing") and l.3866–3868; §4.3.10, l.3753–3770 (a "+" starts a number
  // when a digit, or "." and a digit, follow). Each value below has an exact
  // ODF form, and D106-5 drops only values with none (Scott, 2026-11-13;
  // first pass 10.3 #7).
  test.each([
    ["+50%", "50%"],
    ["+12pt", "12pt"],
    ["+1.5", "150%"],
    ["+1.5em", "150%"],
  ])(
    '%p → fo:line-height=%p: the "+" is removed and the value converted (CSS Syntax 3 §4.3.13, CRD-css-syntax-3-20261001.txt l.3849–3851, l.3866–3868; T4: D106-5 fourth bullet)',
    async (v, expected) => {
      expect(lineHeightAttr(await withLineHeight(v))).toBe(expected);
    },
  );

  test('"+-0%" → no attribute, no throw: that "+" starts no number (CSS Syntax 3 §4.3.10, CRD-css-syntax-3-20261001.txt l.3753–3770; T4: D106-5 fourth bullet)', async () => {
    expect(lineHeightAttr(await withLineHeight("+-0%"))).toBeUndefined();
  });

  test('-0% → fo:line-height="-0%": a value of 0 is not negative, whatever its sign (T4: D106-4 third bullet; core isBelowZero)', async () => {
    expect(lineHeightAttr(await withLineHeight("-0%"))).toBe("-0%");
  });

  test("property: for any CSS line-height string, htmlToOdt resolves (T4: D106-4 + C-2 Part 3)", async () => {
    const cssish = fc.stringMatching(
      /^[-+]?(\d{0,4}(\.\d{0,4})?|\.\d{1,3})(e[-+]?\d{1,3})?(px|pt|cm|mm|in|pc|em|rem|ex|%)?$/,
    );
    const values = fc.oneof(
      fc.string(),
      cssish,
      fc.constantFrom("normal", "inherit", "calc(1em + 2px)", "9".repeat(400), "1e400"),
    );
    await fc.assert(
      fc.asyncProperty(values, async (v) => {
        await expect(withLineHeight(v)).resolves.toContain("<office:document-content");
      }),
      { numRuns: 200 },
    );
  });
});
