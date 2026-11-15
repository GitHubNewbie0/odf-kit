// tests/core/style-attr.property.test.ts
//
// Property test for CSS containment in the HTML renderers' style attributes
// (T4: DS1-12). For any value, at any style field of either renderer, an
// independent CSS parser must read back exactly the renderer's own
// `name:value` pieces, in order, none of them important (T4: DS1-15).
//
// The oracle, per attribute (T4: DS1-15):
//  1. parse5 (devDependency) parses the emitted HTML and gives the decoded
//     attribute text. It must equal the renderer's own pieces joined by `;`,
//     after HTML input preprocessing (CR and CRLF become LF, WHATWG HTML
//     §13.2.3.5; U+0000 becomes U+FFFD in an attribute value, §13.2.5.36).
//  2. css-tree (devDependency, parse only, lexer off: T4: DS1-12) parses that
//     text as a declaration list. Its items must cover exactly the source
//     text of the pieces, in order; an item may stop short of its piece only
//     by trailing whitespace, which a declaration's value drops (Syntax 3
//     §5.5.6 l.5855-5856). A `Raw` item, css-tree's form for a
//     declaration it does not parse into parts, also takes in the `;` after
//     it; that one `;` is not counted (code-work span-probe, S4).
//  3. No item is important: an item counts as important only when its
//     important text, escapes decoded, equals "important" ignoring case
//     (CSS Syntax 3 §5.5.6 l.5847-5851). css-tree also marks `!foo` as
//     important "foo"; that is not important under Syntax 3.
//     This rule sees only items css-tree parses as a `Declaration`. A `Raw`
//     item carries no important field: for a value with two bangs ending in
//     `!important`, such as `color:!a !important` or
//     `color:red !x !important`, css-tree returns one `Raw` item with no
//     important field (code-work raw-important-probe, S4b), though under
//     Syntax 3 both are important. The check rejects them (condition 7);
//     this rule does not see them.
//  4. css-tree's tokenizer scans the text: at top level no <{-token> and no
//     <}-token>, and anywhere no <bad-string-token> and no <bad-url-token>.
//     Nesting is tracked here (Syntax 3 §5.5.8-5.5.10), so a brace inside a
//     function or block is not top-level.
//
// The pieces expected are computed with the renderers' own rules and with
// checkDeclarationValue itself: a value is left out when it fails the check
// (T4: DS1-1), counts as absent then (T4: DS1-21), and is converted to a
// string once (T4: DS1-20). So this test catches a check that lets a hostile
// value through, not one that rejects too much; the harmless-form tests in
// tests/core/css.test.ts and the to-html suites cover that direction.
//
// With the check switched off (every value passes), the pieces expected are
// exactly what the renderer writes, and the oracle must still fail: each
// condition property below is shown failing that way in the S4 record.

import fc from "fast-check";
import parse5 from "parse5";
import { parse as parseCss, tokenize, tokenTypes } from "css-tree";
import { checkDeclarationValue } from "../../src/core/css/index.js";
import { renderOdtHtml } from "../../src/odt/to-html/index.js";
import { renderOdsHtml } from "../../src/ods/to-html/index.js";
import type { BodyNode } from "../../src/odt/read/types.js";
import type { OdsDocumentModel } from "../../src/ods/read/types.js";

// ─── Seed ──────────────────────────────────────────────────────────────
//
// T4: Scott, 2026-11-14 (S4 review) — the gate runs a pinned seed, so a
// failure reproduces on every run; an environment variable overrides it for
// soak runs. ODF_KIT_PROPERTY_SEED unset: the pinned seed below. Set to an
// integer: that seed. Set to "random": a fresh seed each run, printed so a
// failing soak run can be replayed. The pinned value is the date of the
// ruling; any fixed integer serves.
const PINNED_SEED = 20261114;
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
  console.log(`style-attr property seed: ${seed}`);
fc.configureGlobal({ seed });

// ─── HTML: find the element and its decoded style attribute ───────────

interface P5Node {
  tagName?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: P5Node[];
}
const p5 = parse5 as unknown as { parseFragment(html: string): P5Node };

/** The first element named `tag` in document order, or undefined. */
function findElement(node: P5Node, tag: string): P5Node | undefined {
  if (node.tagName === tag) return node;
  for (const child of node.childNodes ?? []) {
    const found = findElement(child, tag);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** HTML input preprocessing as it bears on an attribute value (see header). */
function htmlNormalize(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\0/g, "�");
}

// ─── The oracle ─────────────────────────────────────────────────────────

/** Decode CSS escapes in an ident's text (Syntax 3 §4.3.7 l.3639-3667). */
function decodeEscapes(text: string): string {
  return text.replace(
    /\\(?:([0-9a-fA-F]{1,6})[ \t\n]?|([^\n]))/g,
    (_m, hex?: string, ch?: string) => {
      if (hex === undefined) return ch ?? "";
      const n = parseInt(hex, 16);
      return n === 0 || (n >= 0xd800 && n <= 0xdfff) || n > 0x10ffff
        ? "�"
        : String.fromCodePoint(n);
    },
  );
}

/** Every way the attribute text departs from the renderer's pieces; empty when it reads back exactly. */
function oracle(attr: string | undefined, pieces: string[]): string[] {
  const want = pieces.map(htmlNormalize);
  if (want.length === 0)
    return attr === undefined
      ? []
      : [`a style attribute ${JSON.stringify(attr)} where none is written`];
  if (attr === undefined) return ["no style attribute"];
  const text = want.join(";");
  if (attr !== text)
    return [`attribute ${JSON.stringify(attr)} is not the pieces ${JSON.stringify(text)}`];

  const problems: string[] = [];

  // 2. Items cover exactly the pieces' source text.
  const spans: [number, number][] = [];
  let offset = 0;
  for (const piece of want) {
    spans.push([offset, offset + piece.length]);
    offset += piece.length + 1;
  }
  // Offsets of <semicolon-token>s, so that a Raw item's trailing separator is
  // told apart from an escaped `\;`, which is part of an ident (Syntax 3
  // §4.3.1 l.3318-3325).
  const semicolons = new Set<number>();
  tokenize(text, (type, start) => {
    if (type === tokenTypes.Semicolon) semicolons.add(start);
  });
  const items: { type: string; start: number; end: number; important?: boolean | string }[] = [];
  parseCss(text, {
    context: "declarationList",
    positions: true,
    parseValue: false,
    onParseError: () => {},
  }).children.forEach((node) => {
    let end = node.loc.end.offset;
    if (node.type === "Raw" && semicolons.has(end - 1)) end -= 1;
    items.push({ type: node.type, start: node.loc.start.offset, end, important: node.important });
  });
  // An item may stop short of its piece only by trailing whitespace: a
  // declaration's value drops its trailing whitespace tokens (Syntax 3 §5.5.6
  // l.5855-5856), and css-tree's span sometimes does too. Whitespace is tab,
  // space and newline (§4.2 l.3097-3110); FF is a newline after preprocessing
  // (§3.3 l.1502-1505).
  const covers = (item: { start: number; end: number }, [start, end]: [number, number]) =>
    item.start === start && item.end <= end && /^[\t\n\f ]*$/.test(text.slice(item.end, end));
  const got = items.map((i) => text.slice(i.start, i.end));
  if (items.length !== spans.length || !items.every((item, i) => covers(item, spans[i]))) {
    problems.push(`items ${JSON.stringify(got)} are not the pieces ${JSON.stringify(want)}`);
  }

  // 3. No item is important.
  for (const item of items) {
    if (item.important === undefined || item.important === false) continue;
    const name = item.important === true ? "important" : decodeEscapes(item.important);
    if (name.toLowerCase() === "important")
      problems.push(`item ${JSON.stringify(text.slice(item.start, item.end))} is important`);
  }

  // 4. The token scan.
  const closer = new Map<number, number>([
    [tokenTypes.Function, tokenTypes.RightParenthesis],
    [tokenTypes.LeftParenthesis, tokenTypes.RightParenthesis],
    [tokenTypes.LeftSquareBracket, tokenTypes.RightSquareBracket],
    [tokenTypes.LeftCurlyBracket, tokenTypes.RightCurlyBracket],
  ]);
  const open: number[] = [];
  tokenize(text, (type, start, end) => {
    const token = JSON.stringify(text.slice(start, end));
    if (type === tokenTypes.BadString) problems.push(`bad-string token ${token}`);
    if (type === tokenTypes.BadUrl) problems.push(`bad-url token ${token}`);
    if (open.length === 0 && type === tokenTypes.LeftCurlyBracket)
      problems.push(`top-level { at ${start}`);
    if (open.length === 0 && type === tokenTypes.RightCurlyBracket)
      problems.push(`top-level } at ${start}`);
    const ending = closer.get(type);
    if (ending !== undefined) open.push(ending);
    else if (open.length > 0 && type === open[open.length - 1]) open.pop();
  });

  return problems;
}

// ─── The renderers' own pieces ─────────────────────────────────────────

/** A style field: its model path and its CSS property name. */
interface Field {
  path: string[];
  css: string;
}

/** A style site: how to build a model from field values, render it, and which element holds the attribute. */
interface Site {
  name: string;
  fields: Field[];
  /** true: present when `!== undefined` (ODT); false: present when truthy (ODS, ODT <col>). */
  presentWhenDefined: boolean;
  /** Text written for a value, before the check (ODT font-size appends `pt`, T4: DS1-2). */
  text?: (field: Field, value: unknown) => string;
  render: (values: Map<string, unknown>, extra: Extra) => string;
  tag: string;
  /** Pieces the renderer writes besides the fields, given what the fields wrote. */
  constants?: (written: string[], extra: Extra) => { before: string[]; after: string[] };
}
interface Extra {
  number: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

const f = (path: string, css: string): Field => ({ path: path.split("."), css });
const key = (field: Field) => field.path.join(".");

/** Build a nested object from dotted paths. */
function nest(values: Map<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of values) {
    if (value === undefined) continue;
    const parts = path.split(".");
    let target = out;
    for (const part of parts.slice(0, -1))
      target = (target[part] ??= {}) as Record<string, unknown>;
    target[parts[parts.length - 1]] = value;
  }
  return out;
}

const odt = (body: BodyNode[]) => renderOdtHtml(body, { fragment: true });
const ods = (model: OdsDocumentModel) => renderOdsHtml(model);

const PARAGRAPH_FIELDS = [
  f("textAlign", "text-align"),
  f("marginLeft", "margin-left"),
  f("marginRight", "margin-right"),
  f("marginTop", "margin-top"),
  f("marginBottom", "margin-bottom"),
  f("paddingLeft", "padding-left"),
  f("paddingRight", "padding-right"),
  f("lineHeight", "line-height"),
];

/** The renderers' style sites (src/odt/to-html, src/ods/to-html). */
const SITES: Site[] = [
  {
    name: "ODT <span>",
    fields: [
      f("fontColor", "color"),
      f("fontSize", "font-size"),
      f("fontFamily", "font-family"),
      f("highlightColor", "background-color"),
      f("textTransform", "text-transform"),
      f("fontVariant", "font-variant"),
      f("textShadow", "text-shadow"),
      f("letterSpacing", "letter-spacing"),
    ],
    presentWhenDefined: true,
    text: (field, value) => (field.css === "font-size" ? `${value}pt` : `${value}`),
    render: (v) =>
      odt([{ kind: "paragraph", spans: [{ text: "x", style: nest(v) }] }] as BodyNode[]),
    tag: "span",
  },
  {
    name: "ODT <p>",
    fields: PARAGRAPH_FIELDS,
    presentWhenDefined: true,
    render: (v) =>
      odt([{ kind: "paragraph", paragraphStyle: nest(v), spans: [{ text: "x" }] }] as BodyNode[]),
    tag: "p",
  },
  {
    name: "ODT <h2>",
    fields: PARAGRAPH_FIELDS,
    presentWhenDefined: true,
    render: (v) =>
      odt([
        { kind: "heading", level: 2, paragraphStyle: nest(v), spans: [{ text: "x" }] },
      ] as BodyNode[]),
    tag: "h2",
  },
  {
    name: "ODT <img>",
    fields: [f("width", "width"), f("height", "height")],
    presentWhenDefined: true,
    render: (v) =>
      odt([
        {
          kind: "paragraph",
          spans: [
            { kind: "image", data: "AAAA", mediaType: "image/png", wrapMode: "left", ...nest(v) },
          ],
        },
      ] as BodyNode[]),
    tag: "img",
    constants: () => ({ before: [], after: ["float:left"] }),
  },
  {
    name: "ODT <td>",
    fields: [
      f("backgroundColor", "background-color"),
      f("verticalAlign", "vertical-align"),
      f("border.top", "border-top"),
      f("border.bottom", "border-bottom"),
      f("border.left", "border-left"),
      f("border.right", "border-right"),
    ],
    presentWhenDefined: true,
    render: (v) =>
      odt([
        {
          kind: "table",
          rows: [{ isHeader: false, cells: [{ spans: [{ text: "x" }], cellStyle: nest(v) }] }],
        },
      ] as BodyNode[]),
    tag: "td",
  },
  {
    name: "ODT <tr>",
    fields: [f("backgroundColor", "background-color")],
    presentWhenDefined: true,
    render: (v) =>
      odt([
        {
          kind: "table",
          rows: [{ isHeader: false, rowStyle: nest(v), cells: [{ spans: [{ text: "x" }] }] }],
        },
      ] as BodyNode[]),
    tag: "tr",
  },
  {
    name: "ODT <col>",
    fields: [f("columnWidth", "width")],
    presentWhenDefined: false,
    render: (v) =>
      odt([
        {
          kind: "table",
          rows: [{ isHeader: false, cells: [{ spans: [{ text: "x" }], cellStyle: nest(v) }] }],
        },
      ] as BodyNode[]),
    tag: "col",
  },
  {
    name: "ODS <td>",
    fields: [
      f("fontSize", "font-size"),
      f("fontFamily", "font-family"),
      f("color", "color"),
      f("backgroundColor", "background-color"),
      f("textAlign", "text-align"),
      f("verticalAlign", "vertical-align"),
    ],
    presentWhenDefined: false,
    render: (v, x) =>
      ods({
        sheets: [
          {
            name: "S",
            columnWidths: new Map(),
            rows: [
              {
                index: 0,
                cells: [
                  {
                    colIndex: 0,
                    type: x.number ? "float" : "string",
                    value: x.number ? 1 : "x",
                    formatting: {
                      bold: x.bold,
                      italic: x.italic,
                      underline: x.underline,
                      ...nest(v),
                    },
                  },
                ],
              },
            ],
          },
        ],
      } as OdsDocumentModel),
    tag: "td",
    constants: (_written, x) => ({
      before: [
        ...(x.bold ? ["font-weight:bold"] : []),
        ...(x.italic ? ["font-style:italic"] : []),
        ...(x.underline ? ["text-decoration:underline"] : []),
      ],
      after: [],
    }),
  },
  {
    name: "ODS <tr>",
    fields: [f("height", "height")],
    presentWhenDefined: false,
    render: (v) =>
      ods({
        sheets: [
          {
            name: "S",
            columnWidths: new Map(),
            rows: [{ index: 0, ...nest(v), cells: [{ colIndex: 0, type: "string", value: "x" }] }],
          },
        ],
      } as OdsDocumentModel),
    tag: "tr",
  },
];

/** The pieces a site writes for these values: the renderers' rules, with the check (see header). */
function expectedPieces(site: Site, values: Map<string, unknown>, extra: Extra): string[] {
  const written: string[] = [];
  let textAlignWritten = false;
  for (const field of site.fields) {
    const value = values.get(key(field));
    const present = site.presentWhenDefined ? value !== undefined : Boolean(value);
    if (!present) continue;
    const text = site.text ? site.text(field, value) : `${value as string}`;
    if (!checkDeclarationValue(text).ok) continue;
    written.push(`${field.css}:${text}`);
    if (field.css === "text-align") textAlignWritten = true;
  }
  const { before, after } = site.constants?.(written, extra) ?? { before: [], after: [] };
  const pieces = [...before, ...written, ...after];
  // ODS: the default right-align on a number cell, prepended, when no
  // text-align was written (T4: DS1-21). It is one of the renderer's own pieces.
  if (site.name === "ODS <td>" && extra.number && !textAlignWritten)
    pieces.unshift("text-align:right");
  return pieces;
}

/** Render, find the element, and run the oracle. */
function check(site: Site, values: Map<string, unknown>, extra: Extra): string[] {
  const html = site.render(values, extra);
  const element = findElement(p5.parseFragment(html), site.tag);
  const attr = element?.attrs?.find((a) => a.name === "style")?.value;
  const problems = oracle(attr, expectedPieces(site, values, extra));
  return problems.map((p) => `${site.name}: ${p}\n  html: ${html}`);
}

// ─── Arbitraries ───────────────────────────────────────────────────────

/** Fragments that carry CSS or HTML structure, mixed with ordinary text. */
const FRAGMENTS = [
  ";",
  ":",
  "{",
  "}",
  "(",
  ")",
  "[",
  "]",
  "'",
  '"',
  "\\",
  "/*",
  "*/",
  "url(",
  "!",
  "important",
  "!important",
  " !IMPORTANT",
  "!\\69mportant",
  "!/**/important",
  "\n",
  "\r",
  "\f",
  "\r\n",
  "\t",
  "@",
  "<!--",
  "-->",
  "&",
  "&amp;",
  " ",
  "a",
  "1",
  "red",
  "#",
  ",",
  "-",
  ".",
  "x(",
  "\u0000",
  "\u0001",
  "é",
  "12pt",
  "\\;",
  "\\\\",
];
const anyValue = fc
  .array(fc.oneof(fc.constantFrom(...FRAGMENTS), fc.string({ maxLength: 2 })), { maxLength: 8 })
  .map((parts) => parts.join(""));

const extraArb = fc.record({
  number: fc.boolean(),
  bold: fc.boolean(),
  italic: fc.boolean(),
  underline: fc.boolean(),
});

/** Values for every field of a site: each absent, or any value. */
function valuesArb(site: Site) {
  return fc
    .tuple(...site.fields.map(() => fc.option(anyValue, { nil: undefined })))
    .map((vs) => new Map(site.fields.map((field, i) => [key(field), vs[i]] as [string, unknown])));
}

// ─── The general property ──────────────────────────────────────────────

describe("style attributes read back as exactly the renderer's own declarations (T4: DS1-12, DS1-15)", () => {
  test.each(SITES.map((s) => [s.name, s] as const))("%s: any values", (_name, site) => {
    fc.assert(
      fc.property(valuesArb(site), extraArb, (values, extra) => {
        const problems = check(site, values, extra);
        if (problems.length > 0) throw new Error(problems.join("\n"));
      }),
      { numRuns: 500 },
    );
  });
});

// ─── One property per condition of the check ───────────────────────────
//
// Each generator makes only values that break its condition (first-pass-r2.md
// Part 2 conditions 1-7, cited per line). The value is placed at a field that
// a later renderer piece follows, so a value that takes in what follows it is
// seen. With the check on, each is left out and the property holds; with the
// check off, the oracle must catch it.

const word = fc.stringMatching(/^[a-z0-9]{0,4}$/);
const words = fc.stringMatching(/^[a-z0-9 ]{0,4}$/);

const CONDITIONS: [condition: string, arb: fc.Arbitrary<string>][] = [
  // T1: Syntax 3 §4.3.1 l.3276-3279; §5.5.6 l.5840-5843.
  ["1, top-level semicolon", fc.tuple(words, words).map(([a, b]) => `${a};${b}`)],
  // T1: Syntax 3 §5.5.5 l.5675-5678; CSS Style Attributes l.294-297. T4: DS1-11.
  ["2, top-level close brace", fc.tuple(words, words).map(([a, b]) => `${a}}${b}`)],
  // T1: Syntax 3 §5.5.8 l.5956-5961. T4: DS1-3.
  ["3, top-level open brace", fc.tuple(words, words).map(([a, b]) => `${a}{${b}`)],
  // T1: Syntax 3 §5.5.6 l.5868-5873. T4: DS1-3.
  [
    "3, closed top-level {} block",
    fc.tuple(words, words, words).map(([a, b, c]) => `${a}{${b}}${c}`),
  ],
  // T1: Syntax 3 §5.5.9 l.5988-5992; §5.5.10 l.6009-6013; §4.3.5 l.3495-3499;
  // §4.3.6 l.3569-3573; §4.3.2 l.3412-3420.
  [
    "4, a construct open at the end",
    fc
      .tuple(words, fc.constantFrom("(", "[", "x(", "'", '"', "url(", "/*"), word)
      .map(([a, opener, b]) => `${a}${opener}${b}`),
  ],
  // T1: Syntax 3 §4.3.5 l.3502-3507.
  ["5, bad-string", fc.tuple(words, word, word).map(([a, b, c]) => `${a}'${b}\n${c}`)],
  // T1: Syntax 3 §4.3.6 l.3576-3586.
  ["5, bad-url", fc.tuple(word, word).map(([a, b]) => `url(${a} x${b})`)],
  // T1: Syntax 3 §4.3.8 l.3686-3691; §4.3.7 l.3657-3661, l.3664-3667.
  ["6, a trailing escape", words.map((a) => `${a}\\`)],
  // T1: Syntax 3 §5.5.6 l.5847-5851.
  [
    "7, a trailing !important",
    fc
      .tuple(
        words,
        fc.constantFrom(" !important", "!IMPORTANT", " !/**/important", " !\\69mportant"),
      )
      .map(([a, b]) => `${a}${b}`),
  ],
];

/** Every placement where a later renderer piece follows the field. */
const PLACEMENTS: { site: Site; field: Field; follower?: Field }[] = SITES.flatMap((site) =>
  site.fields.flatMap((field, i) => {
    const follower = site.fields[i + 1];
    if (follower !== undefined) return [{ site, field, follower }];
    if (
      site.constants?.([], { number: false, bold: false, italic: false, underline: false }).after
        .length
    ) {
      return [{ site, field }];
    }
    return [];
  }),
);

describe("each condition of the check is caught at every placement (T4: DS1-12, DS1-15)", () => {
  test.each(CONDITIONS)("condition %s", (_condition, arb) => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PLACEMENTS),
        arb,
        extraArb,
        ({ site, field, follower }, value, extra) => {
          const values = new Map<string, unknown>([[key(field), value]]);
          if (follower !== undefined) values.set(key(follower), "a");
          const problems = check(site, values, extra);
          if (problems.length > 0) throw new Error(problems.join("\n"));
        },
      ),
      { numRuns: 300 },
    );
  });
});
