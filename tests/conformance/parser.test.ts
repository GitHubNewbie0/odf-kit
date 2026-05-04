/**
 * Conformance battery for any Parser implementation.
 *
 * Exports `runParserConformance(parser, suiteName)`. Any parser — odf-kit's
 * default odfKitParser or a third-party adapter — can be tested against
 * this battery. The suite is portable: import the runner and run it
 * against any Parser.
 *
 * For the contract specification (what every conforming parser must
 * satisfy), see ADAPTERS.md.
 *
 * The unit tests in tests/reader/xml-parser.test.ts cover odf-kit-specific
 * implementation details. This battery covers contract-level invariants
 * every parser must satisfy.
 *
 * @module
 */

import { odfKitParser } from "../../src/reader/xml-parser.js";
import type { Parser } from "../../src/types/public.js";

/**
 * Run the parser conformance battery against an implementation.
 */
export function runParserConformance(parser: Parser, suiteName: string): void {
  describe(`${suiteName} — parser conformance`, () => {
    describe("element parsing", () => {
      test("parses a single element", () => {
        const tree = parser("<a></a>");
        expect(tree.type).toBe("element");
        expect(tree.tag).toBe("a");
      });

      test("parses nested elements", () => {
        const tree = parser("<a><b></b></a>");
        expect(tree.children).toHaveLength(1);
        const child = tree.children[0];
        expect(child.type).toBe("element");
        if (child.type === "element") {
          expect(child.tag).toBe("b");
        }
      });

      test("parses deeply nested elements", () => {
        const tree = parser("<a><b><c><d></d></c></b></a>");
        let node: typeof tree = tree;
        for (const tag of ["a", "b", "c", "d"]) {
          expect(node.tag).toBe(tag);
          if (node.children.length > 0 && node.children[0].type === "element") {
            node = node.children[0];
          }
        }
      });

      test("parses self-closing elements", () => {
        const tree = parser("<a><b/></a>");
        expect(tree.children).toHaveLength(1);
        const child = tree.children[0];
        expect(child.type).toBe("element");
        if (child.type === "element") {
          expect(child.tag).toBe("b");
          expect(child.children).toHaveLength(0);
        }
      });

      test("parses single self-closing root", () => {
        const tree = parser("<a/>");
        expect(tree.tag).toBe("a");
        expect(tree.children).toHaveLength(0);
      });
    });

    describe("attribute handling", () => {
      test("parses simple attributes", () => {
        const tree = parser('<a href="x.html"></a>');
        expect(tree.attrs.href).toBe("x.html");
      });

      test("parses namespaced attributes", () => {
        const tree = parser('<text:p text:style-name="P1"></text:p>');
        expect(tree.attrs["text:style-name"]).toBe("P1");
      });

      test("decodes XML predefined entities in attribute values", () => {
        const tree = parser('<a title="&amp;&lt;&gt;"></a>');
        expect(tree.attrs.title).toBe("&<>");
      });

      test("decodes numeric character references in attribute values", () => {
        const tree = parser('<a title="&#160;"></a>');
        expect(tree.attrs.title).toBe("\u00A0");
      });

      test("accepts both single and double quoted values", () => {
        expect(parser('<a href="x"></a>').attrs.href).toBe("x");
        expect(parser("<a href='x'></a>").attrs.href).toBe("x");
      });
    });

    describe("text content", () => {
      test("parses plain text", () => {
        const tree = parser("<a>hello</a>");
        expect(tree.children).toHaveLength(1);
        const child = tree.children[0];
        expect(child.type).toBe("text");
        if (child.type === "text") {
          expect(child.text).toBe("hello");
        }
      });

      test("decodes XML predefined entities in text", () => {
        const tree = parser("<a>&amp;&lt;&gt;</a>");
        const child = tree.children[0];
        expect(child.type).toBe("text");
        if (child.type === "text") {
          expect(child.text).toBe("&<>");
        }
      });

      test("parses mixed inline content", () => {
        const tree = parser("<p>before<em>middle</em>after</p>");
        expect(tree.children).toHaveLength(3);
      });
    });

    describe("CDATA sections", () => {
      test("preserves CDATA content as text", () => {
        const tree = parser("<a><![CDATA[<b>raw</b>]]></a>");
        const child = tree.children[0];
        expect(child.type).toBe("text");
        if (child.type === "text") {
          expect(child.text).toBe("<b>raw</b>");
        }
      });
    });

    describe("skipped constructs", () => {
      test("skips XML declaration", () => {
        const tree = parser('<?xml version="1.0"?><a></a>');
        expect(tree.tag).toBe("a");
      });

      test("skips comments", () => {
        const tree = parser("<a><!-- comment --></a>");
        expect(tree.children).toHaveLength(0);
      });

      test("skips DOCTYPE declaration", () => {
        const tree = parser("<!DOCTYPE html><a></a>");
        expect(tree.tag).toBe("a");
      });

      test("skips processing instructions", () => {
        const tree = parser('<?xml-stylesheet href="x"?><a></a>');
        expect(tree.tag).toBe("a");
      });
    });

    describe("error cases (must throw)", () => {
      test("throws on unclosed tags", () => {
        expect(() => parser("<a>")).toThrow();
      });

      test("throws on mismatched closing tags", () => {
        expect(() => parser("<a></b>")).toThrow();
      });

      test("throws on unescaped & in attribute values", () => {
        expect(() => parser('<a href="x?a=1&b=2"></a>')).toThrow();
      });

      test("throws on malformed attribute syntax", () => {
        expect(() => parser("<input checked/>")).toThrow();
      });

      test("throws on ]]> outside CDATA", () => {
        expect(() => parser("<a>text]]>more</a>")).toThrow();
      });
    });

    describe("contract invariants", () => {
      test("returns an XmlElementNode root (never a text node)", () => {
        const tree = parser("<a></a>");
        expect(tree.type).toBe("element");
      });

      test("attrs is a plain object", () => {
        const tree = parser('<a href="x"></a>');
        expect(typeof tree.attrs).toBe("object");
        expect(Array.isArray(tree.attrs)).toBe(false);
      });

      test("children is an array", () => {
        const tree = parser("<a></a>");
        expect(Array.isArray(tree.children)).toBe(true);
      });

      test("is a pure function", () => {
        const input = '<a href="x"><b>text</b></a>';
        const t1 = parser(input);
        const t2 = parser(input);
        expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));
      });
    });
  });
}

runParserConformance(odfKitParser, "odf-kit default parser");
