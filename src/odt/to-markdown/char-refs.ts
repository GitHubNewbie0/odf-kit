/**
 * HTML character-reference decoding for a reference consumed as part of an
 * attribute value: the string a browser's HTML parser hands to the URL parser
 * for an `href`/`src` attribute. The Markdown emitter classifies link and image
 * destinations on this decoded view (T4: R2b, decode first).
 *
 * T1: HTML Standard (Living Standard, Last Updated 20 October 2026), §13.2.5
 * Tokenization, the character reference states §13.2.5.77–§13.2.5.84
 * (html-spec.txt l.96052–96250). The named table is HTML_ENTITIES, generated
 * from the standard's entities.json. Nothing else is normalized here.
 */

import { HTML_ENTITIES } from "./html-entities.js";

// T1: §13.2.5.78 — "Consume the maximum number of characters possible, where
// the consumed characters are one of the identifiers in the first column of the
// named character references table" (html-spec.txt l.96066). The longest
// identifier bounds the search.
const MAX_NAME_LENGTH = Math.max(...[...HTML_ENTITIES.keys()].map((k) => k.length));

// T1: §13.2.5.84 replacement table, 0x80–0x9F (html-spec.txt l.96182–96250).
const C1_REMAP: ReadonlyMap<number, number> = new Map([
  [0x80, 0x20ac],
  [0x82, 0x201a],
  [0x83, 0x0192],
  [0x84, 0x201e],
  [0x85, 0x2026],
  [0x86, 0x2020],
  [0x87, 0x2021],
  [0x88, 0x02c6],
  [0x89, 0x2030],
  [0x8a, 0x0160],
  [0x8b, 0x2039],
  [0x8c, 0x0152],
  [0x8e, 0x017d],
  [0x91, 0x2018],
  [0x92, 0x2019],
  [0x93, 0x201c],
  [0x94, 0x201d],
  [0x95, 0x2022],
  [0x96, 0x2013],
  [0x97, 0x2014],
  [0x98, 0x02dc],
  [0x99, 0x2122],
  [0x9a, 0x0161],
  [0x9b, 0x203a],
  [0x9c, 0x0153],
  [0x9e, 0x017e],
  [0x9f, 0x0178],
]);

const isDigit = (c: number): boolean => c >= 0x30 && c <= 0x39;
const isUpperHex = (c: number): boolean => c >= 0x41 && c <= 0x46;
const isLowerHex = (c: number): boolean => c >= 0x61 && c <= 0x66;
// Infra: ASCII alphanumeric is an ASCII digit or ASCII alpha.
const isAlphanumeric = (c: number): boolean =>
  isDigit(c) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);

/**
 * Decode the character references in a raw attribute value exactly as the HTML
 * tokenizer does in an attribute value state. Never throws.
 */
export function decodeAttributeCharRefs(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s.charCodeAt(i) !== 0x26) {
      out += s[i];
      i++;
      continue;
    }
    // T1: §13.2.5.77 Character reference state (l.96052): consume the next
    // input character after "&".
    const next = s.charCodeAt(i + 1);
    if (isAlphanumeric(next)) {
      // T1: §13.2.5.78 Named character reference state (l.96066).
      let match = "";
      for (let len = Math.min(MAX_NAME_LENGTH, s.length - i); len > 1; len--) {
        const candidate = s.slice(i, i + len);
        if (HTML_ENTITIES.has(candidate)) {
          match = candidate;
          break;
        }
      }
      if (match === "") {
        // T1: §13.2.5.78 "Otherwise", then §13.2.5.79 Ambiguous ampersand state
        // (l.96108): the "&" is flushed and the alphanumerics that follow are
        // appended to the attribute value as they are, so the text is unchanged.
        out += "&";
        i++;
        continue;
      }
      const after = s.charCodeAt(i + match.length);
      if (!match.endsWith(";") && (after === 0x3d || isAlphanumeric(after))) {
        // T1: §13.2.5.78 (l.96077): consumed as part of an attribute, last
        // character not ";", next "=" or ASCII alphanumeric — "for historical
        // reasons, flush code points consumed as a character reference".
        out += match;
      } else {
        out += HTML_ENTITIES.get(match);
      }
      i += match.length;
      continue;
    }
    if (next !== 0x23) {
      // T1: §13.2.5.77 "Anything else": flush "&", reconsume in the return state.
      out += "&";
      i++;
      continue;
    }
    // T1: §13.2.5.80 Numeric character reference state (l.96124).
    let j = i + 2;
    const x = s.charCodeAt(j);
    const hex = x === 0x78 || x === 0x58;
    if (hex) j++;
    const first = s.charCodeAt(j);
    const startsDigits = hex
      ? isDigit(first) || isUpperHex(first) || isLowerHex(first)
      : isDigit(first);
    if (!startsDigits) {
      // T1: §13.2.5.80 "Anything else" / §13.2.5.81 (l.96139) "Anything else":
      // flush the code points consumed ("&#" or "&#x"), reconsume.
      out += s.slice(i, j);
      i = j;
      continue;
    }
    // T1: §13.2.5.82 Hexadecimal (l.96150) / §13.2.5.83 Decimal (l.96168)
    // character reference state. The code is held at 0x110000 once it exceeds
    // 0x10FFFF: §13.2.5.84 only asks whether it is greater than 0x10FFFF.
    let code = 0;
    for (;;) {
      const c = s.charCodeAt(j);
      let d: number;
      if (isDigit(c)) d = c - 0x30;
      else if (hex && isUpperHex(c)) d = c - 0x37;
      else if (hex && isLowerHex(c)) d = c - 0x57;
      else break;
      code = Math.min(code * (hex ? 16 : 10) + d, 0x110000);
      j++;
    }
    // ";" switches to the end state; anything else is reconsumed there.
    if (s.charCodeAt(j) === 0x3b) j++;
    // T1: §13.2.5.84 Numeric character reference end state (l.96182).
    if (code === 0x00 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      code = 0xfffd;
    } else {
      code = C1_REMAP.get(code) ?? code;
    }
    out += String.fromCodePoint(code);
    i = j;
  }
  return out;
}
