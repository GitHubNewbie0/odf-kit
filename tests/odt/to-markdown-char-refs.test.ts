// HTML attribute character-reference decoder (plan §0.4, §5): the shipped
// decoder must agree with an HTML parser's decoding of the same raw attribute.
// parse5 5.1.1 (an exact dev pin) is the corroborator; the HTML Standard
// adjudicates any divergence.
//
// T1: HTML Standard (html-spec.txt, Last Updated 20 October 2026), §13.2.5
// tokenization, character reference states consumed as part of an attribute:
// §13.2.5.77 Character reference state (l.96052); §13.2.5.78 Named character
// reference state (l.96066), incl. "for historical reasons, flush code points
// consumed" (l.96077); §13.2.5.79 Ambiguous ampersand state (l.96108);
// §13.2.5.80–83 numeric, hexadecimal and decimal states (l.96124, l.96139,
// l.96150, l.96168); §13.2.5.84 Numeric character reference end state
// (l.96182–96250).
// T3: internal measurement P4.1–P4.10 (raw attributes and parse5's decoding).

import { describe, it, expect } from "@jest/globals";
import parse5 from "parse5";
import { decodeAttributeCharRefs } from "../../src/odt/to-markdown/char-refs.js";

interface P5Node {
  tagName?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: P5Node[];
}
const p5 = parse5 as unknown as { parseFragment(html: string): P5Node };
/** parse5's decoding of a raw href attribute value. */
function parse5Decode(raw: string): string | undefined {
  const walk = (n: P5Node): string | undefined => {
    if (n.tagName === "a") return n.attrs?.find((x) => x.name === "href")?.value;
    for (const c of n.childNodes ?? []) {
      const r = walk(c);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  return walk(p5.parseFragment(`<a href="${raw}">t</a>`));
}

describe("decodeAttributeCharRefs agrees with parse5 (plan §0.4 P4 agreement rows)", () => {
  it.each([
    ["P4.1", "&#106;avascript:x"],
    ["P4.2", "&#106avascript:x"],
    ["P4.3", "&#x6Aavascript:x"],
    ["P4.4", "javascript&colon;x"],
    ["P4.5", "a&amp;b"],
    ["P4.6", "a&ampb"],
    ["P4.7", "a&amp/b"],
    ["P4.8", "a&amp=b"],
    ["P4.9", "a&notarealref;b"],
    ["P4.10", "a&nbspb"],
  ])("%s: %j", (_id, raw) => {
    // P4.3 is the P1.8 decoder route: maximal hex-digit consumption (§13.2.5.82).
    expect(decodeAttributeCharRefs(raw)).toBe(parse5Decode(raw));
  });
});
