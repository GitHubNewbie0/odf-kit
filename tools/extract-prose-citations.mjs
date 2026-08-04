/**
 * extract-prose-citations.mjs
 *
 * The ODF 1.3 Part 3 prose HTML has virtually no line breaks (single lines
 * span megabytes, including base64-embedded images), so line-oriented tools
 * (Select-String, grep) are useless against it. This script strips it to
 * plain text and extracts a bounded window of prose around each citation
 * target from spec/odf-1.3-prose-constraints.md (P1, P2, P4, P5).
 *
 * Usage:
 *   node tools/extract-prose-citations.mjs
 * Reads:  spec/OpenDocument-v1.3-os-part3-schema.html
 * Writes: spec/citations/p1-default-style.txt
 *         spec/citations/p2-master-page-name.txt
 *         spec/citations/p4-margin-semantics.txt
 *         spec/citations/p5-page-width.txt
 *
 * (P3 targets the RNG, which is clean XML — Select-String handles it fine.)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const HTML_PATH = join(REPO, "spec", "OpenDocument-v1.3-os-part3-schema.html");
const OUT_DIR = join(REPO, "spec", "citations");

// ---------------------------------------------------------------------------
// HTML → text
// ---------------------------------------------------------------------------

let html = readFileSync(HTML_PATH, "utf8");

// Drop embedded images/scripts/styles wholesale before anything else —
// they are the megabyte lines.
html = html
  .replace(/<img[^>]*>/gis, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ");

// Block-level closers become newlines so headings/paragraphs separate.
html = html.replace(/<\/(p|div|h[1-6]|li|tr|td|th|dt|dd)>/gi, "\n");
html = html.replace(/<(br|hr)\s*\/?>/gi, "\n");

// Strip all remaining tags.
let text = html.replace(/<[^>]+>/g, "");

// Decode the entities the spec actually uses.
text = text
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&");

// Normalize whitespace per line; drop empties.
const lines = text
  .split(/\r?\n/)
  .map((l) => l.replace(/\s+/g, " ").trim())
  .filter((l) => l.length > 0);

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

const TARGETS = [
  {
    out: "p1-default-style.txt",
    label: "P1 — style:default-style semantics",
    // Section heading lines look like: "16.4 <style:default-style>"
    pattern: /style:default-style/,
    windowBefore: 2,
    windowAfter: 25,
    maxMatches: 4,
  },
  {
    out: "p2-master-page-name.txt",
    label: "P2 — style:master-page-name attribute",
    pattern: /style:master-page-name/,
    windowBefore: 2,
    windowAfter: 15,
    maxMatches: 4,
  },
  {
    out: "p4-margin-semantics.txt",
    label: "P4 — fo:margin-top / fo:margin-bottom semantics (sum vs max)",
    // The attribute sections: "20.xxx fo:margin-bottom" etc.
    pattern: /^\d+\.\d+\s*fo:margin(-top|-bottom)?\b|fo:margin-bottom attribute|fo:margin-top attribute/,
    windowBefore: 1,
    windowAfter: 20,
    maxMatches: 5,
  },
  {
    out: "p5-page-width.txt",
    label: "P5 — fo:page-width positivity",
    pattern: /^\d+\.\d+\s*fo:page-width\b|fo:page-width attribute|The fo:page-width/,
    windowBefore: 1,
    windowAfter: 15,
    maxMatches: 4,
  },
];

// ---------------------------------------------------------------------------
// Extraction — prefer section-heading matches (a line starting with a
// section number) over table-of-contents entries and passing mentions.
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

for (const t of TARGETS) {
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (!t.pattern.test(lines[i])) continue;
    // Score: lines that begin with a section number (e.g. "16.4 ", "19.500 ",
    // "20.205 ") are the actual sections; bare mentions rank lower; the TOC
    // (first ~5% of lines) ranks lowest.
    const isSection = /^\d{1,2}\.\d+/.test(lines[i]);
    const inToc = i < lines.length * 0.05;
    const score = (isSection ? 2 : 0) - (inToc ? 3 : 0);
    hits.push({ i, score });
  }
  hits.sort((a, b) => b.score - a.score || a.i - b.i);

  let out = `# ${t.label}\n# Source: OpenDocument-v1.3-os-part3-schema.html (OASIS Standard 2021-04-27)\n\n`;
  for (const { i } of hits.slice(0, t.maxMatches)) {
    out += `--- match at extracted-line ${i} ---\n`;
    const from = Math.max(0, i - t.windowBefore);
    const to = Math.min(lines.length, i + t.windowAfter);
    out += lines.slice(from, to).join("\n") + "\n\n";
  }
  if (hits.length === 0) out += "(no matches — pattern needs adjustment)\n";
  writeFileSync(join(OUT_DIR, t.out), out);
  console.log(`${t.out}: ${Math.min(hits.length, t.maxMatches)} of ${hits.length} matches written`);
}

console.log(`\nDone → spec/citations/`);
