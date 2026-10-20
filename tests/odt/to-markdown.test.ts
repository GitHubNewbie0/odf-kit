// Markdown emitter: link and image destinations, the text context and field
// values (plan §9 rows). Imports only the canonical public path plus the two
// test-only renderers pinned as devDependencies (marked is a runtime
// dependency; markdown-it 14.3.0 and parse5 5.1.1 are exact dev pins).
//
// Every expected string below is the expected= value of its row in the
// derivation output that the plan's red/green record cites, by row ID.
//
// Emitted-string tests ("emitted: …") and renderer-outcome tests ("renderer:
// …") are separate: no test holds both kinds.
//
// Citations used throughout:
// - T1: CommonMark 0.29 (cm.txt) and GFM 0.29-gfm (gfm.txt), the citation
//   copies excerpted in spec/citations/markdown-cm-0.29-gfm-0.29.txt.
// - T1: WHATWG URL (url-spec.txt, Last Updated 19 October 2026): "Remove any
//   leading and trailing C0 control or space from input." (l.3743); "Remove
//   all ASCII tab or newline from input." (l.3752); scheme start state
//   (l.3785) and scheme state (l.3808).
// - T4: R1 form (b) (Scott, 2026-10-19): bare destination with \ ( ) & <
//   backslash-escaped; <…> with \ < > & escaped iff [\0- \u007F] remains
//   after normalization (trim, then strip).
// - T4: R2 blocked-scheme output shape (Scott, 2026-10-18): a blocked
//   destination is emitted as \[text\]\(`scheme:…`\), an image keeping
//   its leading ! (CommonMark 0.29 §6.6 Example 588, cm.txt l.11923–11924).
// - T4: R2 membership (Scott, 2026-10-19): http, https, mailto, tel,
//   relative and protocol-relative //; data: only at an image destination.
// - T4: [E] (Scott, 2026-10-19): image/{png,gif,jpeg,webp,bmp,tiff};
//   [F] (Scott, 2026-10-19): registered names only, never a throw;
//   [H] (Scott, 2026-10-19): essence match, parameters ignored, no trim;
//   [H2] (Scott, 2026-10-20): no "," gets the blocked form, no throw.
// - T4: S1–S4 (Scott, 2026-10-18): < and & join the text escape set; the
//   table-cell escaper is the text-context escaping plus |.
// - T4: Q4 (Scott, 2026-10-20): a newline in a GFM cell becomes a space.
// - T3: marked 18.0.12 and markdown-it 14.3.0 at defaults, internal
//   measurements P1–P6 (the T3 artifact is not yet written; those rows are
//   the record).

import { describe, it, expect } from "@jest/globals";
import { marked } from "marked";
import MarkdownIt from "markdown-it";
import parse5 from "parse5";
import { modelToMarkdown } from "../../src/odt/to-markdown/index.js";

type Model = Parameters<typeof modelToMarkdown>[0];
type Options = Parameters<typeof modelToMarkdown>[1];
type Body = Model["body"];
type Inline = Extract<Body[number], { kind: "paragraph" }>["spans"][number];

const modelOf = (body: Body): Model => ({ metadata: {}, body, toHtml: () => "" });
const para = (...spans: Inline[]): Body[number] => ({ kind: "paragraph", spans });
const md = (body: Body, options?: Options): string => modelToMarkdown(modelOf(body), options);
const link = (model: string, text = "t"): string => md([para({ text, href: model })]);
// ImageNode.data is required by the type; the placeholder branch never reads it.
const image = (model: string): string =>
  md([para({ kind: "image", title: "a", name: model, data: "" })]);
const table = (cell: Inline[]): string =>
  md([
    {
      kind: "table",
      rows: [
        { isHeader: true, cells: [{ spans: [{ text: "h" }] }] },
        { isHeader: false, cells: [{ spans: cell }] },
      ],
    },
  ]);

// ---- renderers (test-only) ----
const mdit = new MarkdownIt();
const renderMarked = (s: string): string => marked.parse(s) as string;
const renderMdit = (s: string): string => mdit.render(s);
interface P5Node {
  tagName?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: P5Node[];
}
const p5 = parse5 as unknown as { parseFragment(html: string): P5Node };
/** The first <a href> or <img src> attribute value, as an HTML parser decodes it. */
function attr(html: string): string | undefined {
  const walk = (n: P5Node): string | undefined => {
    if (n.tagName === "a" || n.tagName === "img") {
      const a = n.attrs?.find((x) => x.name === "href" || x.name === "src");
      if (a) return a.value;
    }
    for (const c of n.childNodes ?? []) {
      const r = walk(c);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  return walk(p5.parseFragment(html));
}
function markedLinkToken(s: string): string | undefined {
  let href: string | undefined;
  marked.walkTokens(marked.lexer(s), (t) => {
    if (t.type === "link" && href === undefined) href = (t as { href: string }).href;
  });
  return href;
}
const BASE = "https://base.test/d/";
// T1: WHATWG URL scheme start state and scheme state (url-spec.txt l.3785, l.3808).
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const schemeOf = (s: string): string | null => s.match(SCHEME)?.[0].toLowerCase() ?? null;
// T1: URL preprocessing (url-spec.txt l.3743, l.3752), applied to parse5's decoding.
// "C0 control or space" is U+0000–U+0020 (Infra, infra-spec.txt l.1500–1501).
function viewOf(model: string): string {
  const s = attr(`<a href="${model}">t</a>`) ?? "";
  let a = 0;
  let b = s.length;
  while (a < b && s.charCodeAt(a) <= 0x20) a++;
  while (b > a && s.charCodeAt(b - 1) <= 0x20) b--;
  return s.slice(a, b).replace(/[\t\n\r]/g, "");
}

// ================================================================ emitted strings

describe('emitted: link destinations, blocked (plan §9 "Classifier — BLOCKED" + "Blocked output form")', () => {
  // T4: R2 blocked-scheme output shape (Scott, 2026-10-18); R2 membership (Scott, 2026-10-19).
  // T1: CommonMark 0.29 §6.1 "Any ASCII punctuation character may be
  // backslash-escaped" (cm.txt l.7178), so \[ \] \( \) are literal;
  // "backslash escapes do not work in code spans" (§6.3, cm.txt l.7862).
  it.each([
    [
      "P1.1",
      "Classifier — BLOCKED",
      "t",
      "javascript:alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.2",
      "Classifier — BLOCKED",
      "t",
      "JAVASCRIPT:alert(1)",
      "\\[t\\]\\(`JAVASCRIPT:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.3",
      "Classifier — BLOCKED",
      "t",
      "vbscript:x",
      "\\[t\\]\\(`vbscript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.4",
      "Classifier — BLOCKED",
      "t",
      "file:///etc/passwd",
      "\\[t\\]\\(`file:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.5",
      "Classifier — BLOCKED",
      "t",
      "&#106;avascript:alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.6",
      "Classifier — BLOCKED",
      "t",
      "&#106avascript:alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.7",
      "Classifier — BLOCKED",
      "t",
      "&#x6A;avascript:alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.9",
      "Classifier — BLOCKED",
      "t",
      "javascript&#58;alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.10",
      "Classifier — BLOCKED",
      "t",
      "javascript&colon;alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.11",
      "Classifier — BLOCKED",
      "t",
      "java&#9;script:alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.12",
      "Classifier — BLOCKED",
      "t",
      "&#1;javascript:alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.13",
      "Classifier — BLOCKED",
      "t",
      "java&#x0A;script:alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.14",
      "Classifier — BLOCKED",
      "t",
      "&#32;javascript:alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.15",
      "Classifier — BLOCKED",
      "t",
      " javascript:alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.16",
      "Classifier — BLOCKED",
      "t",
      "\u0001javascript:alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.17",
      "Classifier — BLOCKED",
      "t",
      "java\tscript:alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.18",
      "Classifier — BLOCKED",
      "t",
      "java\rscript:alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.19",
      "Classifier — BLOCKED",
      "t",
      "java\nscript:alert(1)",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.20",
      "Classifier — BLOCKED",
      "t",
      "javascript:alert(1) ",
      "\\[t\\]\\(`javascript:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.22",
      "Classifier — BLOCKED",
      "t",
      "data:text/html;base64,PHNjcmlwdD4=",
      "\\[t\\]\\(`data:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "P1.25",
      "Classifier — BLOCKED",
      "t",
      "data:image/svg+xml;base64,AAAA",
      "\\[t\\]\\(`data:…`\\)",
      "T3: internal measurement P1 (classifier bucket BLOCKED)",
    ],
    [
      "F1.5",
      "Blocked output form (www.-initial)",
      "t",
      "www.evil.test:x",
      "\\[t\\]\\(`www.evil.test:…`\\)",
      "T1: GFM 0.29-gfm §6.9 gfm.txt l.12636–12638; T3: internal measurement F1.5",
    ],
    [
      "LINK-DATA",
      "Classifier — BLOCKED, data: at a link destination",
      "t",
      "data:image/png;base64,AAAA",
      "\\[t\\]\\(`data:…`\\)",
      "T4: R2 membership (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
    [
      "LINK-BMP",
      "data: media types (link destination)",
      "t",
      "data:image/bmp;base64,AAAA",
      "\\[t\\]\\(`data:…`\\)",
      "T4: [E] (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
  ])("%s (%s): text %j, href %j -> %j; %s", (_id, _bullet, text, model, expected) => {
    expect(link(model, text)).toBe(expected);
  });
});

describe('emitted: link destinations, allowed (plan §9 "Destination sites", "Classifier — ALLOWED", "Empty destination", normalization, oracle)', () => {
  // T4: R1 form (b) (Scott, 2026-10-19). T1: CommonMark 0.29 §6.5 a bare
  // destination "does not include ASCII space or control characters, and
  // includes parentheses only if (a) they are backslash-escaped" (cm.txt
  // l.10134–10137); backslash escapes work "including URLs" (§6.1, l.7339).
  it.each([
    [
      "P1.26",
      "Destination sites / Classifier — ALLOWED",
      "t",
      "https://x.test/a(b)c",
      "[t](https://x.test/a\\(b\\)c)",
      "T3: internal measurement P1 (ALLOWED)",
    ],
    [
      "P1.27",
      "Destination sites / Classifier — ALLOWED",
      "t",
      "//host/path",
      "[t](//host/path)",
      "T3: internal measurement P1 (ALLOWED)",
    ],
    [
      "P1.28",
      "Destination sites / Classifier — ALLOWED",
      "t",
      "#frag",
      "[t](#frag)",
      "T3: internal measurement P1 (ALLOWED)",
    ],
    [
      "P1.29",
      "Destination sites / Classifier — ALLOWED",
      "t",
      "../rel.odt",
      "[t](../rel.odt)",
      "T3: internal measurement P1 (ALLOWED)",
    ],
    [
      "P1.30",
      "Destination sites / Classifier — ALLOWED",
      "t",
      "mailto:a@b.c",
      "[t](mailto:a@b.c)",
      "T3: internal measurement P1 (ALLOWED)",
    ],
    [
      "P1.31",
      "Destination sites / Classifier — ALLOWED",
      "t",
      "tel:+1555",
      "[t](tel:+1555)",
      "T3: internal measurement P1 (ALLOWED)",
    ],
    [
      "P1.8",
      "Classifier — ALLOWED (allowed-and-inert)",
      "t",
      "&#x6Aavascript:alert(1)",
      "[t](\\&#x6Aavascript:alert\\(1\\))",
      "T3: internal measurements P1.8/B1 and P1.21",
    ],
    [
      "P1.21",
      "Classifier — ALLOWED (allowed-and-inert)",
      "t",
      "javascript\\:alert(1)",
      "[t](javascript\\\\:alert\\(1\\))",
      "T3: internal measurements P1.8/B1 and P1.21",
    ],
    [
      "P1.32",
      "Empty destination",
      "t",
      "",
      "[t]()",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T1: cm.txt l.10202; T3: P6.1",
    ],
    [
      "C1.1",
      "Empty destination (whitespace-only)",
      "t",
      " ",
      "[t]()",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: C1",
    ],
    [
      "C1.2",
      "Empty destination (whitespace-only)",
      "t",
      "  ",
      "[t]()",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: C1",
    ],
    [
      "C1.3",
      "Empty destination (whitespace-only)",
      "t",
      "\t",
      "[t]()",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: C1",
    ],
    [
      "C1.4",
      "Empty destination (whitespace-only)",
      "t",
      "\n",
      "[t]()",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: C1",
    ],
    [
      "C1.5",
      "Empty destination (whitespace-only)",
      "t",
      "\u0001",
      "[t]()",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: C1",
    ],
    [
      "C1.6",
      "Empty destination (whitespace-only)",
      "t",
      " \t ",
      "[t]()",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: C1",
    ],
    [
      "D1.1",
      "Empty destination (reference-only)",
      "t",
      "&#32;",
      "[t](\\&#32;)",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: D1",
    ],
    [
      "D1.2",
      "Empty destination (reference-only)",
      "t",
      "&#9;",
      "[t](\\&#9;)",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: D1",
    ],
    [
      "D1.3",
      "Empty destination (reference-only)",
      "t",
      "&#x0A;",
      "[t](\\&#x0A;)",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: D1",
    ],
    [
      "D1.4",
      "Empty destination (reference-only)",
      "t",
      "&#1;",
      "[t](\\&#1;)",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: D1",
    ],
    [
      "D1.5",
      "Empty destination (reference-only)",
      "t",
      "&Tab;",
      "[t](\\&Tab;)",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: D1",
    ],
    [
      "D1.6",
      "Empty destination (reference-only)",
      "t",
      "&NewLine;",
      "[t](\\&NewLine;)",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: D1",
    ],
    [
      "D1.7",
      "Empty destination (reference-only)",
      "t",
      " &#32; ",
      "[t](\\&#32;)",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: D1",
    ],
    [
      "P5.1",
      "Emitted-string normalization",
      "t",
      " https://x.test/p",
      "[t](https://x.test/p)",
      "T1: url-spec.txt l.3743; T3: P5.1/A1.1",
    ],
    [
      "P2.1",
      "Parse-layer oracle",
      "t",
      "https://x.test/a(b)c",
      "[t](https://x.test/a\\(b\\)c)",
      "T3: internal measurement P2",
    ],
    [
      "P2.2",
      "Parse-layer oracle",
      "t",
      "https://x.test/a b",
      "[t](<https://x.test/a b>)",
      "T3: internal measurement P2",
    ],
    [
      "P2.3",
      "Parse-layer oracle",
      "t",
      "https://x.test/a\\b",
      "[t](https://x.test/a\\\\b)",
      "T3: internal measurement P2",
    ],
    [
      "P2.4",
      "Parse-layer oracle",
      "t",
      "https://x.test/?q=1&r=2",
      "[t](https://x.test/?q=1\\&r=2)",
      "T3: internal measurement P2",
    ],
    [
      "P2.5",
      "Parse-layer oracle",
      "t",
      "https://x.test/ä",
      "[t](https://x.test/ä)",
      "T3: internal measurement P2",
    ],
    [
      "P3.1",
      "Reference-shaped allowed models",
      "t",
      "a&amp;b",
      "[t](a\\&amp;b)",
      "T3: marked 18.0.12, internal measurement P3",
    ],
    [
      "P3.2",
      "Reference-shaped allowed models",
      "t",
      "https://x.test/?q=1&amp;r=2",
      "[t](https://x.test/?q=1\\&amp;r=2)",
      "T3: marked 18.0.12, internal measurement P3",
    ],
    [
      "M2-l89",
      "Destination sites (batch-4 M2)",
      "click",
      "https://x.test/a)b",
      "[click](https://x.test/a\\)b)",
      "T4: R1 form (b) (Scott, 2026-10-19)",
    ],
    [
      "M2-l90",
      "Destination sites (batch-4 M2)",
      "click",
      "x)](javascript:alert(1)",
      "[click](x\\)]\\(javascript:alert\\(1\\))",
      "T4: R1 form (b) (Scott, 2026-10-19)",
    ],
  ])("%s (%s): text %j, href %j -> %j; %s", (_id, _bullet, text, model, expected) => {
    expect(link(model, text)).toBe(expected);
  });
});

describe("emitted: image destinations (plan §9 image rows; placeholder branch, default options)", () => {
  // Both image branches use the one classifier with kind "image" (T4: [B], Scott, 2026-10-19).
  it.each([
    [
      "P1.23-img",
      "Classifier — ALLOWED, data: at an image destination",
      "data:image/png;base64,AAAA",
      "![a](data:image/png;base64,AAAA)",
      "T4: R2 membership (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
    [
      "P1.24-img",
      "Classifier — ALLOWED (case-insensitive)",
      "DATA:IMAGE/PNG;base64,AAAA",
      "![a](DATA:IMAGE/PNG;base64,AAAA)",
      "T4: R2 membership (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
    [
      "E-bmp",
      "data: media types (allowed)",
      "data:image/bmp;base64,AAAA",
      "![a](data:image/bmp;base64,AAAA)",
      "T4: [E] (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
    [
      "E-tiff",
      "data: media types (allowed)",
      "data:image/tiff;base64,AAAA",
      "![a](data:image/tiff;base64,AAAA)",
      "T4: [E] (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
    [
      "E-wmf",
      "data: media types (blocked)",
      "data:image/wmf;base64,AAAA",
      "!\\[a\\]\\(`data:…`\\)",
      "T4: [E] (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
    [
      "E-emf",
      "data: media types (blocked)",
      "data:image/emf;base64,AAAA",
      "!\\[a\\]\\(`data:…`\\)",
      "T4: [E] (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
    [
      "P1.25-img",
      "data: media types (blocked)",
      "data:image/svg+xml;base64,AAAA",
      "!\\[a\\]\\(`data:…`\\)",
      "T4: [E] (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
    [
      "F-alias",
      "data: media types (alias, no throw)",
      "data:image/x-ms-bmp;base64,AAAA",
      "!\\[a\\]\\(`data:…`\\)",
      "T4: [F] (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
    [
      "H-param",
      "data: media-type matching (allowed)",
      "data:image/png;foo=bar;base64,AAAA",
      "![a](data:image/png;foo=bar;base64,AAAA)",
      "T4: [H] (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
    [
      "H-upper",
      "data: media-type matching (allowed)",
      "data:IMAGE/PNG;base64,AAAA",
      "![a](data:IMAGE/PNG;base64,AAAA)",
      "T4: [H] (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
    [
      "H-space",
      "data: media-type matching (blocked, no throw)",
      "data:image/png ;base64,AAAA",
      "!\\[a\\]\\(`data:…`\\)",
      "T4: [H] (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
    [
      "H-longer",
      "data: media-type matching (blocked, no throw)",
      "data:image/pngX;base64,AAAA",
      "!\\[a\\]\\(`data:…`\\)",
      "T4: [H] (Scott, 2026-10-19); no probe evidence; ruling only",
    ],
    [
      "H2",
      "data: with no comma (blocked, no throw)",
      "data:image/png;base64AAAA",
      "!\\[a\\]\\(`data:…`\\)",
      "T4: [H2] (Scott, 2026-10-20); no probe evidence; ruling only",
    ],
    [
      "IMG-JS",
      "Blocked output form (image)",
      "javascript:alert(1)",
      "!\\[a\\]\\(`javascript:…`\\)",
      "T4: R2 blocked-scheme output shape (Scott, 2026-10-18); T1: cm.txt l.11923–11924 (Example 588)",
    ],
    [
      "IMG-EMPTY",
      "Empty destination (image)",
      "",
      "![a]()",
      "T4: R1 empty-destination sub-ruling (Scott, 2026-10-18); T3: P6.2",
    ],
  ])("%s (%s): name %j -> %j; %s", (_id, _bullet, model, expected) => {
    let out = "";
    expect(() => {
      out = image(model);
    }).not.toThrow();
    expect(out).toBe(expected);
  });
});

describe('emitted: batch-4 M3 image PoCs (plan §9 "Destination sites (A, B)")', () => {
  // T4: R1 form (b) (Scott, 2026-10-19); alt is escaped once as text context
  // (T1: CommonMark 0.29 §6.1, cm.txt l.7178); the embedImages data: string
  // goes through the same classifier (T4: [B], [E], [H], Scott, 2026-10-19).
  it.each([
    [
      "M3-l108",
      { kind: "image", title: "a]b*c", name: "pic.png", data: "" },
      false,
      "![a\\]b\\*c](pic.png)",
    ],
    [
      "M3-l109",
      { kind: "image", title: "alt", name: "a)b.png", data: "" },
      false,
      "![alt](a\\)b.png)",
    ],
    [
      "M3-l110",
      { kind: "image", title: "alt", name: "x)](javascript:alert(1)", data: "" },
      false,
      "![alt](x\\)]\\(javascript:alert\\(1\\))",
    ],
    [
      "M3-l118",
      { kind: "image", title: "alt", mediaType: "image/png)](javascript:alert(1)", data: "AAAA" },
      true,
      "!\\[alt\\]\\(`data:…`\\)",
    ],
    [
      "M3-l119",
      { kind: "image", title: "alt", mediaType: "image/png", data: "AA)](javascript:alert(1)" },
      true,
      "![alt](data:image/png;base64,AA\\)]\\(javascript:alert\\(1\\))",
    ],
    [
      "M3-l120",
      { kind: "image", title: "a]b*c", mediaType: "image/png", data: "AAAA" },
      true,
      "![a\\]b\\*c](data:image/png;base64,AAAA)",
    ],
  ] as const)("%s", (_id, node, embedImages, expected) => {
    expect(md([para(node)], embedImages ? { embedImages: true } : undefined)).toBe(expected);
  });
});

describe('emitted: text context (plan §9 "Text context (D, S4)")', () => {
  // T4: S1–S4 (Scott, 2026-10-18): < and & join the text escape set.
  // T1: CommonMark 0.29 §4.6 HTML block start condition 1 (cm.txt
  // l.2809–2811); §6.8 raw HTML (cm.txt l.12248–12249); < and & are ASCII
  // punctuation (§2.1, cm.txt l.494–499), backslash-escapable (§6.1, l.7178).
  it.each([
    ["TXT-script", "<script>x</script>", "\\<script>x\\</script>"],
    ["TXT-script-mid", "A<script>x</script>B", "A\\<script>x\\</script>B"],
    ["TXT-b", "<b onmouseover=x>", "\\<b onmouseover=x>"],
    ["TXT-b-mid", "A<b onmouseover=x>B", "A\\<b onmouseover=x>B"],
    ["TXT-lt", "&lt;", "\\&lt;"],
    ["TXT-lt-mid", "A&lt;B", "A\\&lt;B"],
  ])("%s: %j -> %j", (_id, text, expected) => {
    expect(md([para({ text })])).toBe(expected);
  });

  it("CELL-S1: a GFM table cell holds the text-context escaping with a single backslash", () => {
    // T4: S1–S4 (Scott, 2026-10-18): the cell escaper is the text-context escaping plus |.
    // T1: GFM 0.29-gfm §4.10: inlines are parsed in cells (gfm.txt l.4509–4513).
    const out = table([{ text: "<script>x</script>" }]);
    expect(out.split("\n")[2]).toBe(`| ${"\\<script>x\\</script>"} |`);
  });

  it("CELL-Q4: a line break in a GFM cell becomes a space; the row stays on one line", () => {
    // T4: Q4 (Scott, 2026-10-20). No probe evidence; ruling only.
    const out = table([{ text: "a" }, { text: "", lineBreak: true }, { text: "b" }]);
    expect(out.split("\n")[2]).toBe(`| ${"a   b"} |`);
  });
});

describe('emitted: field values (plan §9 "Field values (C)")', () => {
  // T4: S1–S4 (Scott, 2026-10-18); a defined field value is document input
  // and is escaped as text context (T1: CommonMark 0.29 §6.1, cm.txt l.7178).
  it.each([
    ["FIELD-script", "<script>x</script>", "\\<script>x\\</script>"],
    ["FIELD-M4", "a*b](x)", "a\\*b\\]\\(x\\)"],
  ])("%s: %j -> %j", (_id, value, expected) => {
    expect(md([para({ kind: "field", fieldType: "title", value })])).toBe(expected);
  });
});

describe('emitted: blocked form in a GFM table cell (plan §9 "Blocked output form", H2.3)', () => {
  it("H2.3: the whole emitted table", () => {
    // T4: R2 blocked-scheme output shape (Scott, 2026-10-18). T3: internal measurement H2.3.
    expect(table([{ text: "t", href: "www.evil.test:x" }])).toBe(
      "| h |\n| --- |\n| \\[t\\]\\(`www.evil.test:…`\\) |",
    );
  });
});

// ================================================================ renderer outcomes

const BLOCKED_LINKS: readonly [string, string][] = [
  ["P1.1", "javascript:alert(1)"],
  ["P1.2", "JAVASCRIPT:alert(1)"],
  ["P1.3", "vbscript:x"],
  ["P1.4", "file:///etc/passwd"],
  ["P1.5", "&#106;avascript:alert(1)"],
  ["P1.6", "&#106avascript:alert(1)"],
  ["P1.7", "&#x6A;avascript:alert(1)"],
  ["P1.9", "javascript&#58;alert(1)"],
  ["P1.10", "javascript&colon;alert(1)"],
  ["P1.11", "java&#9;script:alert(1)"],
  ["P1.12", "&#1;javascript:alert(1)"],
  ["P1.13", "java&#x0A;script:alert(1)"],
  ["P1.14", "&#32;javascript:alert(1)"],
  ["P1.15", " javascript:alert(1)"],
  ["P1.16", "\u0001javascript:alert(1)"],
  ["P1.17", "java\tscript:alert(1)"],
  ["P1.18", "java\rscript:alert(1)"],
  ["P1.19", "java\nscript:alert(1)"],
  ["P1.20", "javascript:alert(1) "],
  ["P1.22", "data:text/html;base64,PHNjcmlwdD4="],
  ["P1.25", "data:image/svg+xml;base64,AAAA"],
  ["F1.5", "www.evil.test:x"],
  ["LINK-DATA", "data:image/png;base64,AAAA"],
  ["LINK-BMP", "data:image/bmp;base64,AAAA"],
];
const BLOCKED_IMAGES: readonly [string, string][] = [
  ["E-wmf", "data:image/wmf;base64,AAAA"],
  ["E-emf", "data:image/emf;base64,AAAA"],
  ["P1.25-img", "data:image/svg+xml;base64,AAAA"],
  ["F-alias", "data:image/x-ms-bmp;base64,AAAA"],
  ["H-space", "data:image/png ;base64,AAAA"],
  ["H-longer", "data:image/pngX;base64,AAAA"],
  ["H2", "data:image/png;base64AAAA"],
  ["IMG-JS", "javascript:alert(1)"],
];

describe('renderer: blocked destinations render as literal text (plan §9 "Blocked output form")', () => {
  // T4: R2 blocked-scheme output shape (Scott, 2026-10-18): nothing live.
  // T3: marked 18.0.12 and markdown-it 14.3.0 at defaults, probe 3 H1/H2.
  const cases: [string, string][] = [
    ...BLOCKED_LINKS.map(([id, m]): [string, string] => [
      `${id} link ${JSON.stringify(m)}`,
      link(m),
    ]),
    ...BLOCKED_IMAGES.map(([id, m]): [string, string] => [
      `${id} image ${JSON.stringify(m)}`,
      image(m),
    ]),
    ["H2.3 table cell", table([{ text: "t", href: "www.evil.test:x" }])],
  ];
  it.each(cases)("%s: no <a and no <img in either renderer", (_label, out) => {
    for (const html of [renderMarked(out), renderMdit(out)]) {
      expect(html.includes("<a")).toBe(false);
      expect(html.includes("<img")).toBe(false);
    }
  });
});

describe('renderer: allowed-and-inert chains (plan §9 "Classifier — ALLOWED")', () => {
  it("P1.8: each renderer's final href equals the raw model and resolves under the base with no scheme", () => {
    // T3: internal measurement B1 (both renderers emit the raw model).
    const model = "&#x6Aavascript:alert(1)";
    for (const html of [renderMarked(link(model)), renderMdit(link(model))]) {
      const a = attr(html);
      expect(a).toBe(model);
      expect(schemeOf(a ?? "")).toBeNull();
      expect(new URL(a ?? "", BASE).href.startsWith(BASE)).toBe(true);
    }
  });

  it("P1.21: each renderer's href resolves relative to the base", () => {
    // T3: internal measurement (D) (the v3 audit's probe).
    const model = "javascript\\:alert(1)";
    for (const html of [renderMarked(link(model)), renderMdit(link(model))]) {
      const a = attr(html);
      expect(a).toBeDefined();
      expect(new URL(a ?? "", BASE).href.startsWith(BASE)).toBe(true);
    }
  });
});

describe('renderer: parse-layer oracle (plan §9 "Parse-layer oracle")', () => {
  // T1: CommonMark 0.29 §6.5 (cm.txt l.10134–10137): the parsed destination
  // is the model. T3: internal measurement P2 (marked's token equals the model).
  it.each([
    ["P2.1", "https://x.test/a(b)c"],
    ["P2.2", "https://x.test/a b"],
    ["P2.3", "https://x.test/a\\b"],
    ["P2.4", "https://x.test/?q=1&r=2"],
    ["P2.5", "https://x.test/ä"],
  ])("%s: marked.lexer link href equals the model %j", (_id, model) => {
    expect(markedLinkToken(link(model))).toBe(model);
  });

  it.each([
    ["P2.1", "https://x.test/a(b)c"],
    ["P2.2", "https://x.test/a b"],
    ["P2.4", "https://x.test/?q=1&r=2"],
    ["P2.5", "https://x.test/ä"],
  ])("%s: markdown-it agrees at the URL-meaning level: %j", (_id, model) => {
    expect(new URL(attr(renderMdit(link(model))) ?? "", BASE).href).toBe(new URL(model, BASE).href);
  });

  it("P2.3: the backslash divergence, asserted as documentation", () => {
    // T3: internal measurement P2.3: the URL parser folds the model's \ to /,
    // while the renderer's %5C keeps a literal backslash (plan §3, exception 2).
    const model = "https://x.test/a\\b";
    expect(new URL(model, BASE).href).toBe("https://x.test/a/b");
    expect(new URL(attr(renderMdit(link(model))) ?? "", BASE).href).toBe("https://x.test/a%5Cb");
  });
});

describe('renderer: reference-shaped allowed models (plan §9 "Reference-shaped allowed models (marked T3)")', () => {
  // T3: marked 18.0.12, internal measurement P3.1/P3.2: marked's final
  // attribute is the decoded view; markdown-it's is the model.
  it.each([
    ["P3.1", "a&amp;b", "a&b"],
    ["P3.2", "https://x.test/?q=1&amp;r=2", "https://x.test/?q=1&r=2"],
  ])("%s: %j: marked attr = view %j, markdown-it attr = model", (_id, model, view) => {
    expect(attr(renderMarked(link(model)))).toBe(view);
    expect(attr(renderMdit(link(model)))).toBe(model);
  });

  it.each([
    ["P3.1", "a&amp;b"],
    ["P3.2", "https://x.test/?q=1&amp;r=2"],
  ])(
    "%s: scheme of model vs scheme of view: no rendering carries a scheme the view lacks: %j",
    (_id, model) => {
      // Plan §5 soundness: a scheme in the model or in any partial decoding is a scheme in the view.
      const view = viewOf(model);
      const vs = schemeOf(view);
      const ms = schemeOf(model);
      if (ms !== null) expect(ms).toBe(vs);
      for (const html of [renderMarked(link(model)), renderMdit(link(model))]) {
        const s = schemeOf(attr(html) ?? "");
        if (s !== null) expect(s).toBe(vs);
      }
    },
  );
});

describe('renderer: emitted-string normalization (plan §9 "Emitted-string normalization")', () => {
  it("P5.1: both renderers' hrefs resolve to the view's URL", () => {
    // T1: url-spec.txt l.3743 (trim). T3: internal measurement P5.1/A1.1.
    const model = " https://x.test/p";
    for (const html of [renderMarked(link(model)), renderMdit(link(model))]) {
      expect(new URL(attr(html) ?? "", BASE).href).toBe(new URL(viewOf(model), BASE).href);
    }
  });
});
