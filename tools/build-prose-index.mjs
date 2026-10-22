/**
 * build-prose-index.mjs
 *
 * Builds a POINTER index over the prose of the text authorities on disk:
 * for every section, its number, title, level, anchor and line range in the
 * source file; for ODF, a names index mapping every element and attribute
 * name of the T1 grammar (spec/odf-elements.json, spec/odf-attributes.json)
 * to the sections that define and mention it. Pointers only — no prose, no
 * summaries, no interpretation (T2 stays demand-driven).
 *
 * Usage:
 *   node tools/build-prose-index.mjs
 *
 * Reads (T4: Move 3 opening message — sources are read from the internal
 * repo and never copied into public spec/; the run HARD-STOPS if any file's
 * sha256 differs from the PROVENANCE value recorded below):
 *   ../odf-kit-internal/spec/odf-1.4/OpenDocument-v1.4-os-part{1..4}-*.html
 *   ../odf-kit-internal/spec/whatwg/{html,url,infra}-spec.{html,txt}
 *   ../odf-kit-internal/spec/markdown/{commonmark-0.29.html,cm.txt,gfm-spec.html,gfm.txt}
 *   spec/odf-elements.json, spec/odf-attributes.json (the T1 vocabulary)
 *
 * Writes (T4: Move 3 ruling 3 — version-stable names, version in the header):
 *   spec/prose-index/<slug>.json for each authority below, and
 *   spec/prose-index/odf-names.json
 *
 * Scope (T4: Move 3 ruling 1, Scott 2026-10-21): ODF 1.4 Parts 1–4, WHATWG
 * HTML/URL/Infra, CommonMark 0.29 and GFM 0.29-gfm only. APPNOTE is excluded
 * permanently (its only grant, APPNOTE-6.2.0.txt l.2464–2466, is reproduction
 * without modification); W3C XML and CSS are deferred until their licence
 * texts are on disk.
 *
 * Section boundaries are found in the HTML original (headings, by a
 * quote-aware tag scanner) and line numbers point into the citation copy
 * where one exists (the copies are line-preserving: checked per heading
 * below). Fail-closed: an unrecognised heading form, a section count that
 * disagrees with the document's own table of contents (beyond the expected
 * exceptions listed here, each from probe-move3-r2), a raw `<hN` count that
 * the scanner does not account for, or a duplicate section number stops the
 * run. Source anomalies are recorded in each header, never repaired.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// T4: bump on any change that alters the generated output.
const GENERATOR_VERSION = "1.0.2";
const GENERATOR_NAME = "tools/build-prose-index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const INTERNAL = join(REPO, "..", "odf-kit-internal");
const OUT_DIR = join(REPO, "spec", "prose-index");

function fail(msg) {
  console.error(`build-prose-index: HARD STOP — ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Authorities. sha256 values are the PROVENANCE.md entries cited per line.
// `expect` holds the exceptions the cross-checks must find EXACTLY (each set
// observed and investigated in probe-move3-r2; any drift is a hard stop).
// ---------------------------------------------------------------------------

const ODF_PROV = "spec/odf-1.4/PROVENANCE.md";
const AUTHORITIES = [
  {
    slug: "odf-part1",
    family: "odf",
    part: 1,
    title: "Open Document Format for Office Applications (OpenDocument) Version 1.4. Part 1: Introduction",
    // T1 text: the front matter line carries the stage date.
    version: { text: "6 October 2025", line: 135 },
    original: { path: "spec/odf-1.4/OpenDocument-v1.4-os-part1-introduction.html", sha256: "1b34174c358403bb254e42c225bf3c0a1384b433d13036a73bc84c4d4de85090", provenance: `${ODF_PROV} l.22` },
    expect: { unnumbered: [], notInToc: [], tocNotSection: [], tocNumberMismatch: [], paragraphSections: [] },
  },
  {
    slug: "odf-part2",
    family: "odf",
    part: 2,
    title: "Open Document Format for Office Applications (OpenDocument) Version 1.4. Part 2: Packages",
    version: { text: "6 October 2025", line: 243 },
    original: { path: "spec/odf-1.4/OpenDocument-v1.4-os-part2-packages.html", sha256: "99c315b17c9e324393b98eff2db3c83c4f9cf9e02c208f421132ed4eb71eb4f9", provenance: `${ODF_PROV} l.25` },
    expect: { unnumbered: [], notInToc: [], tocNotSection: [], tocNumberMismatch: [], paragraphSections: [] },
  },
  {
    slug: "odf-part3",
    family: "odf",
    part: 3,
    title: "Open Document Format for Office Applications (OpenDocument) Version 1.4. Part 3: OpenDocument Schema",
    version: { text: "6 October 2025", line: 611 },
    original: { path: "spec/odf-1.4/OpenDocument-v1.4-os-part3-schema.html", sha256: "44776435e99953609973a7f462ac4626d38521e3e384bcdab3c4f0357af41a72", provenance: `${ODF_PROV} l.28` },
    expect: {
      unnumbered: [],
      notInToc: [],
      // probe-move3-r2 L145: TOC entry "18.3.16 " with no title; its target id occurs nowhere and the body goes 18.3.15 → 18.3.17.
      tocNotSection: ["__RefHeading___Toc144349_3652015455"],
      tocNumberMismatch: [],
      // probe-move3-r2 L146–L152: Appendix A–G are <p class="P36">, not <hN>, and are TOC targets.
      paragraphSections: ["Appendix A", "Appendix B", "Appendix C", "Appendix D", "Appendix E", "Appendix F", "Appendix G"],
    },
  },
  {
    slug: "odf-part4",
    family: "odf",
    part: 4,
    title: "Open Document Format for Office Applications (OpenDocument) Version 1.4. Part 4: Recalculated Formula (OpenFormula) Format",
    version: { text: "6 October 2025", line: 645 },
    original: { path: "spec/odf-1.4/OpenDocument-v1.4-os-part4-formula.html", sha256: "6917544bbb0bca7c18a553cb9adc67ae10022459be05c85eb906f94353dedbf0", provenance: `${ODF_PROV} l.31` },
    expect: {
      unnumbered: [],
      // probe-move3-r2 L160: 11 headings carry no __RefHeading anchor and no TOC entry; 6.10.8 EASTERSUNDAY is absent
      // from the TOC. (r2 L170 also listed 6.8.22 IMSEC: the TOC links it by #a_6_8_22_IMSEC, which r2 did not count.)
      notInToc: ["4.11.7.1", "4.11.7.2", "4.11.7.3", "4.11.7.4", "4.11.7.5", "4.11.7.6", "4.11.7.7", "4.11.7.8", "6.14.4.1", "6.14.4.2", "6.14.4.3", "6.10.8"],
      // TOC entry "Appendix A. Changes From Previous Specification Versions (Non Normative)" (l.744): its target id
      // occurs nowhere in the file (found by this generator; r2 counted only __RefHeading links).
      tocNotSection: ["a_Appendix_A__Changes_From_Previous_Specification_Versions__Non_Normative_"],
      // probe-move3-r2 L168: the TOC labels it "A.1." while the body prints "Appendix A". And the TOC was not
      // renumbered after 6.10.8 EASTERSUNDAY: its labels 6.10.8–6.10.24 point at the body's 6.10.9–6.10.25
      // (e.g. TOC "6.10.8 EDATE" → heading "6.10.9 EDATE", __RefHeading__1018186_715980110).
      tocNumberMismatch: ["Appendix A", ...Array.from({ length: 17 }, (_, i) => `6.10.${i + 9}`)],
      paragraphSections: ["Appendix A"],
    },
  },
  {
    slug: "whatwg-html",
    family: "wattsi",
    title: "HTML Standard (WHATWG Living Standard)",
    version: { text: "Living Standard — Last Updated 20 October 2026", line: 16 },
    original: { path: "spec/whatwg/html-spec.html", sha256: "e317a47f9e9a283243cce01422f7faf758c0305f1778beb52ca0e83bfde7424e", provenance: "spec/whatwg/PROVENANCE.md l.33" },
    copy: { path: "spec/whatwg/html-spec.txt", sha256: "56d1f95d1f2ff04136c02930ce673f68dbb2330278996cd818836419333380a3", provenance: "spec/whatwg/PROVENANCE.md l.39" },
    expect: {
      unnumbered: ["HTML", "Table of contents", "Full table of contents", "Index", "Elements", "Element content categories", "Attributes", "Element interfaces", "All interfaces", "Events", "HTTP headers", "MIME types", "References", "Acknowledgments", "Intellectual property rights"],
      // the document title and the two TOC headings themselves
      notInToc: ["HTML", "Table of contents", "Full table of contents"],
      tocNotSection: [],
      tocNumberMismatch: [],
      paragraphSections: [],
      // literal "<h1>"…"<h6>" inside title= attribute values (MDN annotations, l.13023, l.13025, l.13081):
      // 28, counted independently by grep -o 'title="[^"]*<h[1-6][^"]*"' (probe-move3-r2 L236's 121 was a naive-regex artifact)
      inAttributeHeadingTags: 28,
    },
  },
  {
    slug: "whatwg-url",
    family: "bikeshed",
    title: "URL Standard (WHATWG Living Standard)",
    version: { text: "Living Standard — Last Updated 19 October 2026", line: 404 },
    original: { path: "spec/whatwg/url-spec.html", sha256: "08cb42a9a8575dab006676378c846fdd8a72d06897c27929aa51eaf099656be4", provenance: "spec/whatwg/PROVENANCE.md l.7" },
    copy: { path: "spec/whatwg/url-spec.txt", sha256: "6f96b8cc89ca13793290247c7bbaf6cee404a26baaa49490cbfed2b188caca46", provenance: "spec/whatwg/PROVENANCE.md l.13" },
    expect: {
      unnumbered: ["URL", "Abstract", "Table of Contents", "Goals", "Acknowledgments", "Intellectual property rights", "Index", "Terms defined by this specification", "Terms defined by reference", "References", "Normative References", "Non-Normative References", "IDL Index"],
      notInToc: ["URL", "Abstract", "Table of Contents"],
      tocNotSection: [],
      tocNumberMismatch: [],
      paragraphSections: [],
    },
  },
  {
    slug: "whatwg-infra",
    family: "bikeshed",
    title: "Infra Standard (WHATWG Living Standard)",
    version: { text: "Living Standard — Last Updated 19 October 2026", line: 187 },
    original: { path: "spec/whatwg/infra-spec.html", sha256: "8d43350a0a36ebf7682cfe4146dcd7afb8d9f94da0d80677dcc0da16e43590d7", provenance: "spec/whatwg/PROVENANCE.md l.20" },
    copy: { path: "spec/whatwg/infra-spec.txt", sha256: "888ecf0ba6af5d1445ae5da2dee5bc0ca17cd0ef0ab6d80c13c388b82b86a93a", provenance: "spec/whatwg/PROVENANCE.md l.26" },
    expect: {
      unnumbered: ["Infra", "Abstract", "Table of Contents", "Goals", "Acknowledgments", "Intellectual property rights", "Index", "Terms defined by this specification", "Terms defined by reference", "References", "Normative References", "Non-Normative References"],
      notInToc: ["Infra", "Abstract", "Table of Contents"],
      tocNotSection: [],
      tocNumberMismatch: [],
      paragraphSections: [],
    },
  },
  {
    slug: "commonmark",
    family: "pandoc",
    title: "CommonMark Spec",
    version: { text: "Version 0.29 (2019-04-06)", line: 118 },
    original: { path: "spec/markdown/commonmark-0.29.html", sha256: "e0a5fd9adb8886111b0208f7256cdccdb590fb5b081eb8b2bf621e55f60a771a", provenance: "spec/markdown/PROVENANCE.md l.8" },
    copy: { path: "spec/markdown/cm.txt", sha256: "7d91af0ef913b6f69d9898e34e567b8aeffe7677ef4cd7746d121558ae304440", provenance: "spec/markdown/PROVENANCE.md l.14" },
    expect: {
      unnumbered: ["CommonMark Spec", "Appendix: A parsing strategy", "Overview", "Phase 1: block structure", "Phase 2: inline structure", "An algorithm for parsing nested emphasis and links", "look for link or image", "process emphasis"],
      // probe 2026-10-21 (div#TOC id set): the title, one numbered h3 and three appendix h3/h4 are absent from the TOC
      notInToc: ["CommonMark Spec", "5.2.1", "An algorithm for parsing nested emphasis and links", "look for link or image", "process emphasis"],
      tocNotSection: [],
      tocNumberMismatch: [],
      paragraphSections: [],
    },
  },
  {
    slug: "gfm",
    family: "pandoc",
    title: "GitHub Flavored Markdown Spec",
    version: { text: "Version 0.29-gfm (2019-04-06)", line: 119 },
    original: { path: "spec/markdown/gfm-spec.html", sha256: "b153d814fdfc8624bb6da7449162c1cd707a637f7d1c1b636eb44b9cf63fa220", provenance: "spec/markdown/PROVENANCE.md l.20" },
    copy: { path: "spec/markdown/gfm.txt", sha256: "af9664ff58c43247c175ba2b6379308607e99063fbe049c0175bb47938bb379b", provenance: "spec/markdown/PROVENANCE.md l.26" },
    expect: {
      unnumbered: ["GitHub Flavored Markdown Spec", "Appendix: A parsing strategy", "Overview", "Phase 1: block structure", "Phase 2: inline structure", "An algorithm for parsing nested emphasis and links", "look for link or image", "process emphasis"],
      notInToc: ["GitHub Flavored Markdown Spec", "5.2.1", "An algorithm for parsing nested emphasis and links", "look for link or image", "process emphasis"],
      tocNotSection: [],
      tocNumberMismatch: [],
      paragraphSections: [],
    },
  },
];

// T4: per-family heading conventions, each observed in probe-move3-r2 (P2).
//   depthOffset — number depth minus tag level (h2 is "1" in WHATWG specs).
const FAMILY = {
  odf: { numberRe: [/<span>([0-9]+(?:\.[0-9]+)*) <\/span>/, /<span class="Zeichenformat"[^>]*>((?:Appendix )?[A-Z](?:\.[0-9]+)*)<\/span>/], depthOffset: 0 },
  wattsi: { numberRe: [/<span class="secno">([^<]*)<\/span>/], depthOffset: 1 },
  bikeshed: { numberRe: [/<span class="secno">([^<]*)<\/span>/], depthOffset: 1 },
  pandoc: { numberRe: [/<span class="number">([^<]*)<\/span>/], depthOffset: 0 },
};

// ---------------------------------------------------------------------------
// Load and verify
// ---------------------------------------------------------------------------

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
function load(rel, expected) {
  let buf;
  try {
    buf = readFileSync(join(INTERNAL, rel));
  } catch {
    fail(`cannot read odf-kit-internal/${rel} (the internal repo must be checked out beside this one)`);
  }
  const got = sha256(buf);
  if (got !== expected) fail(`sha256 mismatch for odf-kit-internal/${rel}: got ${got}, PROVENANCE records ${expected}`);
  return buf.toString("utf8");
}

const lineStarts = (t) => {
  const a = [0];
  for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) === 10) a.push(i + 1);
  return a;
};
const lineOf = (ls, off) => {
  let lo = 0, hi = ls.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (ls[m] <= off) lo = m;
    else hi = m - 1;
  }
  return lo + 1;
};
// Number of lines as `wc -l` would count them, plus a final unterminated line.
const lineCount = (t) => t.split("\n").length - (t.endsWith("\n") ? 1 : 0);

// ---------------------------------------------------------------------------
// Quote-aware tag scanner. Comments, <!…> declarations and the raw text of
// <script>/<style> are skipped; `<` inside a quoted attribute value is data.
// ---------------------------------------------------------------------------

function scan(text) {
  const tokens = [];
  let inAttrHeading = 0; // "<hN" occurrences inside attribute values
  let skippedHeading = 0; // "<hN" occurrences inside comments / script / style
  const skipped = []; // comment and script/style-body spans [start, stop) — no tokens, but text the mentions pass must not read
  const countH = (s) => (s.match(/<h[1-6][\s>/]/g) || []).length;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf("<", i);
    if (lt === -1) break;
    if (text.startsWith("<!--", lt)) {
      const e = text.indexOf("-->", lt + 4);
      if (e === -1) fail("unterminated comment");
      skippedHeading += countH(text.slice(lt, e));
      skipped.push({ start: lt, stop: e + 3 });
      i = e + 3;
      continue;
    }
    if (text[lt + 1] === "!" || text[lt + 1] === "?") {
      const e = text.indexOf(">", lt);
      i = e + 1;
      continue;
    }
    const isEnd = text[lt + 1] === "/";
    const m = /^[A-Za-z][A-Za-z0-9-]*/.exec(text.slice(lt + (isEnd ? 2 : 1), lt + 40));
    if (!m) {
      i = lt + 1; // a literal "<" in text
      continue;
    }
    const name = m[0].toLowerCase();
    // find the tag end, honouring quotes
    let j = lt + (isEnd ? 2 : 1) + m[0].length;
    let q = null;
    const attrStart = j;
    for (; j < n; j++) {
      const c = text[j];
      if (q) {
        if (c === q) q = null;
      } else if (c === '"' || c === "'") q = c;
      else if (c === ">") break;
    }
    if (j >= n) fail(`unterminated tag at offset ${lt}`);
    const raw = text.slice(attrStart, j);
    if (!isEnd) inAttrHeading += countH(raw);
    tokens.push({ end: isEnd, name, attrs: raw, start: lt, stop: j + 1 });
    i = j + 1;
    if (!isEnd && (name === "script" || name === "style")) {
      const close = text.indexOf(`</${name}`, i);
      if (close === -1) fail(`unterminated <${name}>`);
      skippedHeading += countH(text.slice(i, close));
      if (close > i) skipped.push({ start: i, stop: close }); // an empty body has nothing to blank
      i = close;
    }
  }
  return { tokens, inAttrHeading, skippedHeading, skipped };
}

const attr = (raw, key) => {
  const m = new RegExp(`(?:^|\\s)${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(raw);
  return m ? (m[1] ?? m[2]) : null;
};
const classes = (raw) => (attr(raw, "class") || "").split(/\s+/).filter(Boolean);

// T1 (HTML character references in the sources): the forms the titles use.
// Any other named reference in a title is a hard stop, so nothing is guessed.
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s, strict) {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (all, ref) => {
    if (ref[0] === "#") return String.fromCodePoint(ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10));
    if (ref in NAMED) return NAMED[ref];
    if (strict) fail(`unknown character reference ${all} in a heading`);
    return all;
  });
}
// Text content of a fragment: tags removed (quote-aware), references decoded,
// whitespace collapsed.
function textOf(fragment, strict = true) {
  const { tokens } = scan(fragment);
  let out = "", at = 0;
  for (const t of tokens) {
    out += fragment.slice(at, t.start);
    at = t.stop;
  }
  out += fragment.slice(at);
  return decode(out, strict).replace(/\s+/g, " ").trim();
}
// Index of the token closing the element opened at tokens[k] (depth-counted).
function closeOf(tokens, k) {
  const name = tokens[k].name;
  let depth = 0;
  for (let i = k; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.name !== name) continue;
    if (!t.end && !t.attrs.trimEnd().endsWith("/")) depth++;
    else if (t.end) depth--;
    if (depth === 0) return i;
  }
  fail(`no closing </${name}> for the element at offset ${tokens[k].start}`);
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function buildAuthority(a) {
  const text = load(a.original.path, a.original.sha256);
  const copy = a.copy ? load(a.copy.path, a.copy.sha256) : null;
  const cited = copy ?? text; // the file the line numbers point into
  const citedPath = a.copy ? a.copy.path : a.original.path;
  const ls = lineStarts(text);
  const cls = lineStarts(cited);
  const fam = FAMILY[a.family];
  const anomalies = [];
  const crossChecks = {};

  // the version line, as recorded above, must be present
  const vline = cited.slice(cls[a.version.line - 1], cls[a.version.line] ?? cited.length);
  if (!textOf(vline, false).includes(a.version.text)) fail(`${a.slug}: version text "${a.version.text}" not on ${citedPath} l.${a.version.line}`);

  const { tokens, inAttrHeading, skippedHeading, skipped } = scan(text);
  const idsIn = (from, to) => {
    const ids = [];
    for (let k = from; k <= to; k++) if (!tokens[k].end) { const id = attr(tokens[k].attrs, "id"); if (id) ids.push(id); }
    return ids;
  };

  // 1. heading elements
  const raw = [];
  tokens.forEach((t, k) => {
    if (t.end || !/^h[1-6]$/.test(t.name)) return;
    const c = closeOf(tokens, k);
    raw.push({ kind: "heading", level: +t.name[1], k, c, start: t.start, innerStart: t.stop, innerEnd: tokens[c].start, attrs: t.attrs });
  });
  // independent raw count: every "<hN" in the file must be a heading start,
  // inside an attribute value, or inside a skipped comment/script/style.
  const rawCount = (text.match(/<h[1-6][\s>/]/g) || []).length;
  const expectedInAttr = a.expect.inAttributeHeadingTags ?? 0;
  if (rawCount !== raw.length + inAttrHeading + skippedHeading) fail(`${a.slug}: raw <hN count ${rawCount} ≠ headings ${raw.length} + in-attribute ${inAttrHeading} + skipped ${skippedHeading}`);
  if (inAttrHeading !== expectedInAttr) fail(`${a.slug}: ${inAttrHeading} <hN inside attribute values, expected ${expectedInAttr}`);
  crossChecks.rawHeadingTags = { raw: rawCount, headingElements: raw.length, insideAttributeValues: inAttrHeading, insideCommentsScriptStyle: skippedHeading };

  // 2. the document's own table of contents
  let tocK;
  if (a.family === "odf") tocK = tokens.findIndex((t) => !t.end && t.name === "table" && classes(t.attrs).includes("Sect1"));
  else if (a.family === "wattsi") tocK = tokens.findIndex((t) => !t.end && t.name === "ol" && attr(t.attrs, "class") === "toc");
  else if (a.family === "bikeshed") tocK = tokens.findIndex((t) => !t.end && t.name === "nav" && attr(t.attrs, "id") === "toc");
  else tocK = tokens.findIndex((t) => !t.end && t.name === "div" && attr(t.attrs, "id") === "TOC");
  if (tocK < 0) fail(`${a.slug}: table of contents not found`);
  const tocC = closeOf(tokens, tocK);
  const tocRaw = new Map(); // target id → label markup
  const tocSplit = []; // entries whose label is split across adjacent links to one target
  let prevId = null, prevClose = -1;
  for (let k = tocK; k < tocC; k++) {
    const t = tokens[k];
    if (t.end || t.name !== "a") continue;
    const href = attr(t.attrs, "href");
    if (!href || !href.startsWith("#")) continue;
    const c = closeOf(tokens, k);
    const id = href.slice(1);
    const label = text.slice(t.stop, tokens[c].start);
    if (tocRaw.has(id)) {
      // Source form (Part 3 l.716, "19.197.35 <dr3d:sphere>"): one entry
      // written as consecutive <a> elements with the same target — joined;
      // any other repeat is a hard stop.
      if (id !== prevId || k !== prevClose + 1) fail(`${a.slug}: TOC targets #${id} twice, not adjacently`);
      if (!tocSplit.includes(id)) tocSplit.push(id);
      tocRaw.set(id, tocRaw.get(id) + label);
    } else tocRaw.set(id, label);
    prevId = id;
    prevClose = c;
  }
  const toc = new Map([...tocRaw].map(([id, raw]) => [id, textOf(raw)]));
  const tocRange = [text.slice(0, tokens[tocK].start).split("\n").length, lineOf(ls, tokens[tocC].start)];

  // 3. ODF: TOC targets that are paragraphs, not headings (Appendix level 1)
  const headingIds = new Set(raw.flatMap((h) => idsIn(h.k, h.c).concat(attr(h.attrs, "id") ?? [])));
  for (const id of toc.keys()) {
    if (headingIds.has(id)) continue;
    const k = tokens.findIndex((t) => !t.end && attr(t.attrs, "id") === id);
    if (k < 0) continue; // tocNotSection, checked below
    let p = k;
    while (p >= 0 && !(!tokens[p].end && tokens[p].name === "p")) p--;
    if (p < 0 || a.family !== "odf") fail(`${a.slug}: TOC target #${id} is not inside a heading`);
    const c = closeOf(tokens, p);
    if (c < k) fail(`${a.slug}: TOC target #${id} is not inside a <p>`);
    raw.push({ kind: "paragraph", level: null, k: p, c, start: tokens[p].start, innerStart: tokens[p].stop, innerEnd: tokens[c].start, attrs: tokens[p].attrs });
  }
  raw.sort((x, y) => x.start - y.start);

  // 4. number, title, level, anchor per section
  const sections = raw.map((h) => {
    const inner = text.slice(h.innerStart, h.innerEnd);
    let printed = null, numberSpan = null;
    for (const re of fam.numberRe) {
      const m = re.exec(inner);
      if (m) { printed = m[1]; numberSpan = m[0]; break; }
    }
    // T4: Move 3 ruling 3 — number as printed, minus whitespace and a trailing "."
    const number = printed == null ? null : printed.trim().replace(/\.$/, "") || null;
    const title = textOf(numberSpan ? inner.replace(numberSpan, "") : inner);
    const ids = idsIn(h.k, h.c);
    const own = attr(h.attrs, "id");
    const anchor = own ?? ids[0] ?? null;
    let level = h.level;
    if (h.kind === "paragraph") {
      if (!number || !/^Appendix [A-Z]$/.test(number)) fail(`${a.slug}: paragraph section without an "Appendix X" number: "${title}"`);
      level = 1; // T4: an "Appendix X" part heading is a top-level section (Parts 1, 2 mark the same with <h1>)
    }
    // the number's depth must agree with the tag level
    if (number && h.kind === "heading") {
      const depth = number.replace(/^Appendix /, "").split(".").length;
      if (depth !== level - fam.depthOffset) fail(`${a.slug}: number ${number} at h${level} (depth ${depth}, offset ${fam.depthOffset})`);
    }
    if (a.family === "bikeshed" && number) {
      const dl = attr(h.attrs, "data-level");
      if (dl !== number) fail(`${a.slug}: secno ${number} ≠ data-level ${dl}`);
    }
    if (!title) fail(`${a.slug}: empty title at offset ${h.start}`);
    const startLine = lineOf(ls, h.start);
    const headEndLine = lineOf(ls, h.innerEnd);
    return { kind: h.kind, number, title, level, anchor, ids: new Set(ids.concat(own ?? [])), start: h.start, startLine, headEndLine };
  });

  // 5. fail-closed checks against the expected exceptions
  const same = (label, got, exp) => {
    const g = [...got].sort(), e = [...exp].sort();
    if (JSON.stringify(g) !== JSON.stringify(e)) fail(`${a.slug}: ${label}\n  found:    ${JSON.stringify(got)}\n  expected: ${JSON.stringify(exp)}`);
  };
  const key = (s) => s.number ?? s.title;
  same("unnumbered sections", sections.filter((s) => !s.number).map((s) => s.title), a.expect.unnumbered);
  same("paragraph sections", sections.filter((s) => s.kind === "paragraph").map(key), a.expect.paragraphSections);
  const numbers = sections.filter((s) => s.number).map((s) => s.number);
  const dup = numbers.filter((x, i) => numbers.indexOf(x) !== i);
  if (dup.length) fail(`${a.slug}: duplicate section numbers ${dup}`);
  const inToc = (s) => [...s.ids].some((id) => toc.has(id));
  same("sections not in the TOC", sections.filter((s) => !inToc(s)).map(key), a.expect.notInToc);
  const allIds = new Set(sections.flatMap((s) => [...s.ids]));
  same("TOC targets that are not a section", [...toc.keys()].filter((id) => !allIds.has(id)), a.expect.tocNotSection);
  const mism = sections.filter((s) => {
    if (!s.number) return false;
    const id = [...s.ids].find((x) => toc.has(x));
    return id !== undefined && !toc.get(id).startsWith(s.number);
  });
  same("TOC label number ≠ section number", mism.map(key), a.expect.tocNumberMismatch);
  crossChecks.tableOfContents = {
    lines: tocRange,
    entries: toc.size,
    entriesSplitAcrossAdjacentLinks: tocSplit.map((id) => ({ id, label: toc.get(id) })),
    sections: sections.length,
    sectionsInToc: sections.filter(inToc).length,
    sectionsNotInToc: sections.filter((s) => !inToc(s)).map(key),
    tocTargetsNotASection: a.expect.tocNotSection.map((id) => ({ id, label: toc.get(id) })),
    tocLabelNumberMismatch: mism.map((s) => ({ section: s.number, tocLabel: toc.get([...s.ids].find((x) => toc.has(x))) })),
  };

  // 6. citation-copy alignment: each heading's text is on the same lines of the copy
  if (copy) {
    // Equal line counts, or one fewer in the copy when the original's last line
    // is unterminated and holds only tags (the tag strip leaves it empty and no
    // newline is written — whatwg *-spec.html end "</script>" / "</html>").
    const lastLine = text.slice(text.lastIndexOf("\n") + 1);
    const tagOnlyTail = !text.endsWith("\n") && lastLine.replace(/<[^>]*>/g, "") === "";
    if (lineCount(copy) !== lineCount(text) && !(tagOnlyTail && lineCount(text) === lineCount(copy) + 1)) {
      fail(`${a.slug}: line counts differ — original ${lineCount(text)}, copy ${lineCount(copy)}`);
    }
    const alnum = (s) => s.replace(/[^\p{L}\p{N}]/gu, "");
    for (const s of sections) {
      const seg = copy.slice(cls[s.startLine - 1], cls[s.headEndLine] ?? copy.length);
      const probe = alnum(s.title).slice(0, 24);
      if (!alnum(decode(seg, false)).includes(probe)) fail(`${a.slug}: heading "${s.title}" (l.${s.startLine}) not found on the same lines of ${a.copy.path}`);
    }
  }

  // 7. endLine — T4: Move 3 ruling 2(d): the subtree span, ending on the line
  // before the next section at the same or a shallower level. Where that next
  // heading starts mid-line after text of this section, the line is shared.
  const total = lineCount(cited);
  let shared = 0;
  sections.forEach((s, i) => {
    const next = sections.slice(i + 1).find((x) => x.level <= s.level);
    if (!next) { s.endLine = total; return; }
    const before = text.slice(ls[next.startLine - 1], next.start);
    if (textOf(before, false) !== "") { s.endLine = next.startLine; shared++; }
    else s.endLine = next.startLine - 1;
    if (s.endLine < s.startLine) s.endLine = s.startLine;
  });
  crossChecks.sharedBoundaryLines = shared;

  // Only ODF's gaps are source anomalies: elsewhere the sections missing from
  // the TOC are the title, the TOC headings and depth-limited entries, which
  // crossChecks.tableOfContents.sectionsNotInToc already lists.
  if (a.family === "odf" && a.expect.notInToc.length) anomalies.push({ kind: "not-in-toc", sections: a.expect.notInToc });
  if (a.expect.tocNotSection.length) anomalies.push({ kind: "toc-target-absent", entries: crossChecks.tableOfContents.tocTargetsNotASection });
  if (a.expect.tocNumberMismatch.length) anomalies.push({ kind: "toc-label-number-differs", entries: crossChecks.tableOfContents.tocLabelNumberMismatch });
  if (a.expect.paragraphSections.length) anomalies.push({ kind: "section-heading-is-a-paragraph", sections: a.expect.paragraphSections });
  if (a.family === "odf") {
    const noRef = sections.filter((s) => ![...s.ids].some((id) => id.startsWith("__RefHeading"))).map(key);
    if (noRef.length) anomalies.push({ kind: "heading-without-__RefHeading-anchor", sections: noRef });
  }

  return { a, text, ls, tokens, skipped, tocRange, citedPath, sections, crossChecks, anomalies };
}

// ---------------------------------------------------------------------------
// ODF names index — the T1 vocabulary against Parts 1–4
// ---------------------------------------------------------------------------

function loadT1(file) {
  const buf = readFileSync(join(REPO, "spec", file));
  return { json: JSON.parse(buf.toString("utf8")), sha256: sha256(buf) };
}

function buildNames(odf) {
  const el = loadT1("odf-elements.json");
  const at = loadT1("odf-attributes.json");
  const elements = Object.keys(el.json.elements).sort();
  const attributes = Object.keys(at.json.attributes).sort();
  // T1 (Part 3 anchor form, probe-move3-r2 L407): id = "element-" / "attribute-" + name with ":" → "_".
  const idForm = (n) => n.replace(":", "_");
  for (const n of [...elements, ...attributes]) if (n.includes("_") || (n.match(/:/g) || []).length !== 1) fail(`T1 name ${n} has no unambiguous anchor form`);
  const elById = new Map(elements.map((n) => [idForm(n), n]));
  const atById = new Map(attributes.map((n) => [idForm(n), n]));
  const entry = () => ({ defined: [], mentions: [] });
  const E = Object.fromEntries(elements.map((n) => [n, entry()]));
  const A = Object.fromEntries(attributes.map((n) => [n, entry()]));
  const unmatchedAnchors = [];
  const both = new Set(elements.filter((n) => atById.has(idForm(n))));

  for (const r of odf) {
    const part = r.a.part;
    const owner = (line) => { let s = null; for (const x of r.sections) { if (x.startLine <= line) s = x; else break; } return s; };
    // defined: the spec's own anchors
    for (const t of r.tokens) {
      if (t.end) continue;
      const id = attr(t.attrs, "id");
      if (!id || !/^(element|attribute)-/.test(id)) continue;
      const line = lineOf(r.ls, t.start);
      const s = owner(line);
      const at0 = { part, section: s ? s.number : null, line };
      if (id.startsWith("element-")) {
        const n = elById.get(id.slice(8));
        if (n) E[n].defined.push(at0);
        else unmatchedAnchors.push({ part, id, line });
      } else {
        const [x, y] = id.slice(10).split("_element-");
        const n = atById.get(x);
        const e = y === undefined ? undefined : elById.get(y);
        if (n && (y === undefined || e)) A[n].defined.push(e ? { ...at0, element: e } : at0);
        else unmatchedAnchors.push({ part, id, line });
      }
    }
    // mentions: names in the text content, outside the TOC, one per (line, name).
    // Tags, comments and script/style bodies are blanked, keeping their newlines
    // so line numbers are unchanged (1.0.2: comments were read as text before —
    // LibreOffice's converter comments carry names, e.g. Part 4 l.637
    // "<!--Next 'div' was a 'text:p'.-->").
    const keep = [];
    let at1 = 0;
    const blanked = [...r.tokens, ...r.skipped].sort((x, y) => x.start - y.start);
    for (const t of blanked) {
      if (t.start < at1) fail(`odf-names: overlapping blanked spans in Part ${part} at offset ${t.start}`);
      keep.push(r.text.slice(at1, t.start));
      keep.push("\n".repeat((r.text.slice(t.start, t.stop).match(/\n/g) || []).length));
      at1 = t.stop;
    }
    keep.push(r.text.slice(at1));
    const plain = keep.join("").split("\n");
    if (plain.length !== r.ls.length) fail(`odf-names: line structure lost for Part ${part}`);
    plain.forEach((raw, i) => {
      const line = i + 1;
      if (line >= r.tocRange[0] && line <= r.tocRange[1]) return;
      const seen = new Set();
      for (const m of decode(raw, false).matchAll(/(?<![\w:.-])[A-Za-z][\w.-]*:[A-Za-z_][\w.-]*/g)) {
        let n = m[0];
        while (n && !(n in E) && !(n in A) && /[.-]$/.test(n)) n = n.slice(0, -1);
        if (seen.has(n) || !(n in E || n in A)) continue;
        seen.add(n);
        const s = owner(line);
        const at2 = { part, section: s ? s.number : null, line };
        if (n in E) E[n].mentions.push(at2);
        if (n in A) A[n].mentions.push(at2);
      }
    });
  }
  const count = (o) => ({
    names: Object.keys(o).length,
    withDefinition: Object.values(o).filter((x) => x.defined.length).length,
    withMention: Object.values(o).filter((x) => x.mentions.length).length,
    definitions: Object.values(o).reduce((s, x) => s + x.defined.length, 0),
    mentions: Object.values(o).reduce((s, x) => s + x.mentions.length, 0),
  });
  return { E, A, el, at, unmatchedAnchors, both: [...both], counts: { elements: count(E), attributes: count(A), anchorsWithoutT1Name: unmatchedAnchors.length } };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const today = new Date().toISOString().slice(0, 10);
const NOTICE = (what) => `GENERATED by ${GENERATOR_NAME} — regenerate (node ${GENERATOR_NAME}), never edit by hand. A pointer index over ${what}: section numbers, titles and line ranges only, no prose. See spec/NOTICE.md for the source's notice and licence.`;
const inputOf = (f, role) => ({ role, path: `odf-kit-internal/${f.path}`, sha256: f.sha256, provenance: `odf-kit-internal/${f.provenance}` });
const SECTION_CONVENTIONS = {
  number: "the section number as printed, minus surrounding whitespace and a trailing '.'; null when the heading is unnumbered (T4: Move 3 ruling 3)",
  title: "the heading's text content with the number removed, character references decoded, whitespace collapsed",
  level: "the heading's tag level (h1 = 1); an ODF 'Appendix X' paragraph heading is level 1",
  anchor: "the heading's own id, else the first id inside it; the fragment that links to it in the original",
  file: "the file the line numbers point into: the citation copy where one exists, else the original (path relative to the odf-kit-internal repo)",
  startLine: "1-based line of the heading's start tag",
  endLine: "subtree span: the line before the next section at the same or a shallower level, or that line itself when this section's text continues on it before the next heading (shared boundary line); the last line of the file for the final section of each level (T4: Move 3 ruling 2(d))",
  boundaries: "sections are the document's heading elements (<h1>–<h6>, found by a quote-aware tag scan of the original) plus, for ODF, table-of-contents targets that are paragraphs",
};

mkdirSync(OUT_DIR, { recursive: true });
const write = (file, obj) => writeFileSync(join(OUT_DIR, file), JSON.stringify(obj, null, 2) + "\n");

const results = AUTHORITIES.map(buildAuthority);
for (const r of results) {
  const { a } = r;
  const inputs = [inputOf(a.original, "original")];
  if (a.copy) inputs.push(inputOf(a.copy, "citation-copy"));
  write(`${a.slug}.json`, {
    _generated: {
      notice: NOTICE(a.title),
      file: `spec/prose-index/${a.slug}.json`,
      generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
      generated: today,
      authority: { title: a.title, version: a.version.text, versionAt: `odf-kit-internal/${r.citedPath} l.${a.version.line}` },
      inputs,
      conventions: SECTION_CONVENTIONS,
      crossChecks: r.crossChecks,
      anomalies: r.anomalies,
      counts: { sections: r.sections.length, numbered: r.sections.filter((s) => s.number).length, unnumbered: r.sections.filter((s) => !s.number).length },
    },
    sections: r.sections.map((s) => ({ number: s.number, title: s.title, level: s.level, anchor: s.anchor, file: `odf-kit-internal/${r.citedPath}`, startLine: s.startLine, endLine: s.endLine })),
  });
  console.log(`${a.slug}: ${r.sections.length} sections, TOC ${r.crossChecks.tableOfContents.entries}, shared boundary lines ${r.crossChecks.sharedBoundaryLines}`);
}

const odf = results.filter((r) => r.a.family === "odf");
const names = buildNames(odf);
const namesFile = {
  _generated: {
    notice: NOTICE("the ODF 1.4 Parts 1–4 prose, keyed by the T1 element and attribute names"),
    file: "spec/prose-index/odf-names.json",
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
    generated: today,
    inputs: [
      ...odf.map((r) => inputOf(r.a.original, "original")),
      { role: "T1 vocabulary", path: "spec/odf-elements.json", sha256: names.el.sha256, extractor: names.el.json._generated.extractor },
      { role: "T1 vocabulary", path: "spec/odf-attributes.json", sha256: names.at.sha256, extractor: names.at.json._generated.extractor },
    ],
    conventions: {
      keys: "every element name in spec/odf-elements.json and every attribute name in spec/odf-attributes.json, so the T1 files and this index share one vocabulary; open-name-class (anyName) declarations have no name and are not keyed",
      part: "the ODF 1.4 part number (1–4); the section index for part N is spec/prose-index/odf-partN.json",
      section: "the number of the innermost section whose heading starts on or before the line; null before the first section",
      defined: "the spec's own anchors: id=\"element-<prefix>_<local>\", id=\"attribute-<prefix>_<local>\" and id=\"attribute-<prefix>_<local>_element-<prefix>_<local>\" (the last carries `element`)",
      mentions: "occurrences of the name as a whole token (not preceded or followed by a name character or ':') in the text content — tags removed, character references decoded — one entry per (part, line); lines of each part's table of contents are excluded. A string that is both an element and an attribute name is listed under both; mentions are not disambiguated",
      line: "1-based line in the part's HTML original",
    },
    namesThatAreBothElementAndAttribute: names.both,
    anchorsWithoutT1Name: names.unmatchedAnchors,
    counts: names.counts,
  },
  elements: names.E,
  attributes: names.A,
};
write("odf-names.json", namesFile);
console.log("odf-names:", JSON.stringify(names.counts));
