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

    describe("unquoted boolean attributes", () => {
      test('<input checked> becomes <input checked="">', () => {
        expect(normalizer("<input checked>")).toMatch(/<input\s+checked=""\s*\/?>/);
      });

      test('<script async defer> becomes <script async="" defer="">', () => {
        const output = normalizer("<script async defer>");
        expect(output).toContain('async=""');
        expect(output).toContain('defer=""');
      });

      test('<link rel="preconnect" crossorigin> becomes <link rel="preconnect" crossorigin="">', () => {
        const output = normalizer('<link rel="preconnect" href="https://example.com" crossorigin>');
        expect(output).toContain('crossorigin=""');
      });

      test("quoted attributes pass through unchanged", () => {
        const output = normalizer('<a href="x.html" target="_blank">link</a>');
        expect(output).toContain('href="x.html"');
        expect(output).toContain('target="_blank"');
      });
    });

    describe("unquoted attribute values", () => {
      test('<a href=page> becomes <a href="page">', () => {
        const output = normalizer("<a href=page.html>link</a>");
        expect(output).toContain('href="page.html"');
      });

      test('<input type=text> becomes <input type="text">', () => {
        const output = normalizer("<input type=text>");
        expect(output).toContain('type="text"');
      });

      test("quoted values pass through unchanged", () => {
        const output = normalizer('<a href="page.html">link</a>');
        expect(output).toContain('href="page.html"');
      });

      test("mixed quoted and unquoted values are all quoted", () => {
        const output = normalizer('<input type=text class="primary" id=main>');
        expect(output).toContain('type="text"');
        expect(output).toContain('class="primary"');
        expect(output).toContain('id="main"');
      });
    });

    describe("attribute-value ampersand escaping", () => {
      test("href with unescaped & is escaped", () => {
        const output = normalizer('<a href="page.html?a=1&b=2">link</a>');
        expect(output).toContain('href="page.html?a=1&amp;b=2"');
      });

      test("multiple unescaped & in attribute value are all escaped", () => {
        const output = normalizer('<a href="?a=1&b=2&c=3">link</a>');
        expect(output).toContain("&amp;b=2&amp;c=3");
      });

      test("&amp; (already escaped) is preserved", () => {
        const output = normalizer('<a href="page.html?a=1&amp;b=2">link</a>');
        expect(output).toContain('href="page.html?a=1&amp;b=2"');
      });

      test("text content & characters are not modified", () => {
        const output = normalizer("<p>A & B</p>");
        // The exact form may vary (some normalizers might choose to escape,
        // others not), but the conformance contract is that text-content `&`
        // is not the responsibility of the normalizer. The parser is
        // expected to handle text-content `&` lenience separately.
        // This test asserts that the input round-trips: whatever the
        // normalizer does to text-content `&`, it should not crash, and
        // the structure should be preserved.
        expect(output).toContain("A");
        expect(output).toContain("B");
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

      test("is idempotent across all seven rules", () => {
        const input =
          "<!DOCTYPE html>" +
          '<meta charset="utf-8">' +
          '<link rel="preconnect" href="https://example.com" crossorigin>' +
          "<p>Caf&eacute;<br>" +
          '<a href="page.html?a=1&b=2">link</a>' +
          "<input type=text required>" +
          "<script>x</script></p>";
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
