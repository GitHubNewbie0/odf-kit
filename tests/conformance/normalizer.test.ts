/**
 * Conformance battery for any Normalizer implementation.
 *
 * Exports `runNormalizerConformance(normalizer, suiteName)`. Any normalizer
 * — odf-kit's default odfKitNormalizer or a third-party substitute — can
 * be tested against this battery. The suite is portable: import the runner
 * and run it against any Normalizer.
 *
 * For the contract specification (what every conforming normalizer must
 * satisfy), see ADAPTERS.md.
 *
 * The unit tests in tests/html-normalizer/normalizer.test.ts cover
 * odf-kit-specific implementation details. This battery covers
 * contract-level invariants every normalizer must satisfy.
 *
 * @module
 */

import { odfKitNormalizer } from "../../src/html-normalizer/index.js";
import type { Normalizer } from "../../src/types/public.js";

/**
 * Run the normalizer conformance battery against an implementation.
 *
 * @param normalizer - The Normalizer implementation to test
 * @param suiteName - Display name for the suite (appears in test output)
 */
export function runNormalizerConformance(normalizer: Normalizer, suiteName: string): void {
  describe(`${suiteName} — normalizer conformance`, () => {
    describe("void element self-closing", () => {
      test("<br> is self-closed in some form", () => {
        expect(normalizer("<br>")).toMatch(/<br\s*\/>/);
      });

      test('<meta charset="utf-8"> is self-closed', () => {
        expect(normalizer('<meta charset="utf-8">')).toMatch(/<meta\s+charset="utf-8"\s*\/>/);
      });

      test("already-self-closed void elements remain self-closed", () => {
        expect(normalizer("<br />")).toMatch(/<br\s*\/>/);
      });

      test("all 14 HTML5 void elements are self-closed", () => {
        const voidElements = [
          "area",
          "base",
          "br",
          "col",
          "embed",
          "hr",
          "img",
          "input",
          "link",
          "meta",
          "param",
          "source",
          "track",
          "wbr",
        ];
        for (const tag of voidElements) {
          expect(normalizer(`<${tag}>`)).toMatch(new RegExp(`<${tag}\\s*/>`));
        }
      });
    });

    describe("named entity decoding", () => {
      test("&copy; decodes to ©", () => {
        expect(normalizer("&copy;")).toBe("©");
      });

      test("&nbsp; decodes to non-breaking space", () => {
        expect(normalizer("&nbsp;")).toBe("\u00A0");
      });

      test("&mdash; decodes to em dash", () => {
        expect(normalizer("&mdash;")).toBe("—");
      });

      test("the five XML predefined entities are preserved", () => {
        expect(normalizer("&amp;")).toBe("&amp;");
        expect(normalizer("&lt;")).toBe("&lt;");
        expect(normalizer("&gt;")).toBe("&gt;");
        expect(normalizer("&quot;")).toBe("&quot;");
        expect(normalizer("&apos;")).toBe("&apos;");
      });

      test("unknown named entities are preserved", () => {
        expect(normalizer("&notarealentity;")).toBe("&notarealentity;");
      });
    });

    describe("raw-text element handling", () => {
      test("script content with HTML-like text is removed", () => {
        const output = normalizer('<script>var html = "<br>";</script>');
        expect(output).not.toContain("var html");
      });

      test("style content with @rules is removed", () => {
        const output = normalizer("<style>@import url(x.css);</style>");
        expect(output).not.toContain("@import");
      });

      test("script attributes are preserved", () => {
        const output = normalizer('<script src="x.js">code</script>');
        expect(output).toContain('src="x.js"');
      });
    });

    describe("doctype handling", () => {
      test("<!DOCTYPE html> is lowercased", () => {
        const output = normalizer("<!DOCTYPE html>");
        expect(output).toMatch(/<!doctype/);
        expect(output).not.toMatch(/<!DOCTYPE/);
      });
    });

    describe("contract invariants", () => {
      test("empty input produces empty output", () => {
        expect(normalizer("")).toBe("");
      });

      test("is a pure function", () => {
        const input = "<p>hello<br></p>";
        expect(normalizer(input)).toBe(normalizer(input));
      });

      test("is idempotent", () => {
        const input =
          '<!DOCTYPE html><meta charset="utf-8"><p>Caf&eacute;<br>' + "<script>x</script></p>";
        const once = normalizer(input);
        const twice = normalizer(once);
        expect(twice).toBe(once);
      });

      test("does not throw on malformed input", () => {
        expect(() => normalizer("<p>unclosed")).not.toThrow();
        expect(() => normalizer("</p>")).not.toThrow();
        expect(() => normalizer("<<<>")).not.toThrow();
      });
    });
  });
}

runNormalizerConformance(odfKitNormalizer, "odf-kit default normalizer");
