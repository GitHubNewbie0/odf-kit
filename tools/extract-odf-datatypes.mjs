/**
 * extract-odf-datatypes.mjs
 *
 * Derives, from the official OASIS ODF 1.3 RelaxNG schema, the definitive
 * mapping of every length-bearing attribute to its datatype: which units are
 * legal, whether negative values are permitted, whether zero is permitted,
 * whether percentages are permitted, and which literal keywords (e.g.
 * "normal") are allowed alongside.
 *
 * This converts decision D7 (page-layout attribute coverage) and the unit
 * questions under D8 from proposed judgements into extracted fact.
 *
 * Usage:
 *   1. Download the schema (one time):
 *      Invoke-WebRequest -Uri "https://docs.oasis-open.org/office/OpenDocument/v1.3/os/schemas/OpenDocument-v1.3-schema.rng" -OutFile "spec/OpenDocument-v1.3-schema.rng"
 *   2. Build odf-kit (the script reuses our own XML parser):
 *      npm run build
 *   3. Run:
 *      node tools/extract-odf-datatypes.mjs
 *
 * Output:
 *   spec/odf-1.3-length-datatypes.json  — machine-readable mapping
 *   spec/odf-1.3-length-datatypes.md    — human-readable tables
 *
 * No dependencies beyond odf-kit's own built dist/.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Dogfood: parse the spec's schema with odf-kit's own XML parser.
import { parseXml } from "../dist/reader/xml-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const RNG_PATH = join(REPO, "spec", "OpenDocument-v1.3-schema.rng");

// ---------------------------------------------------------------------------
// Load and parse
// ---------------------------------------------------------------------------

const xml = readFileSync(RNG_PATH, "utf8");
const root = parseXml(xml);

// ---------------------------------------------------------------------------
// Generic tree helpers (the RNG uses unprefixed element names in the
// RelaxNG default namespace; our parser preserves tags as written).
// ---------------------------------------------------------------------------

function* walk(node) {
  yield node;
  if (node.children) {
    for (const child of node.children) {
      if (child.type === "element") yield* walk(child);
    }
  }
}

function localTag(node) {
  // Strip any namespace prefix, defensive in case the RNG uses one.
  return node.tag.includes(":") ? node.tag.slice(node.tag.indexOf(":") + 1) : node.tag;
}

function textContent(node) {
  let out = "";
  for (const child of node.children ?? []) {
    if (child.type === "text") out += child.text;
    else if (child.type === "element") out += textContent(child);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pass 1 — collect all <define name="...">
// ---------------------------------------------------------------------------

/** @type {Map<string, any>} name → define element */
const defines = new Map();
for (const node of walk(root)) {
  if (localTag(node) === "define" && node.attrs?.name) {
    // RelaxNG combine="choice"/"interleave" can split a define across
    // multiple elements; merge children so ref-resolution sees all branches.
    if (defines.has(node.attrs.name)) {
      const existing = defines.get(node.attrs.name);
      existing.children = [...(existing.children ?? []), ...(node.children ?? [])];
    } else {
      defines.set(node.attrs.name, node);
    }
  }
}

// ---------------------------------------------------------------------------
// Pass 2 — classify datatype defines
//
// A "length-like datatype define" is any define whose direct content is a
// <data> element whose pattern parameter mentions unit suffixes or '%',
// or whose type is decimal/double used in a length context. We derive the
// classification from the pattern text itself — nothing is hardcoded from
// memory except the recognizer for what a unit token looks like.
// ---------------------------------------------------------------------------

const UNIT_TOKEN = /\((cm|mm|in|pt|pc|px)\)/g;

function classifyPattern(pattern) {
  const units = [...new Set([...pattern.matchAll(UNIT_TOKEN)].map((m) => m[1]))];
  const percent = pattern.includes("%");
  if (units.length === 0 && !percent) return undefined;
  // Sign: a leading -? before the numeric part means negatives are legal.
  const negativeAllowed = /^-\?|\(-\?|-\?\(/.test(pattern) || pattern.startsWith("-?");
  // Zero: pattern families in the ODF schema distinguish positiveLength
  // (numeric part cannot be all zeros) from length (can). Detect the
  // positive-only idiom: "[0-9]*[1-9][0-9]*" as the required integer core.
  const zeroExcluded = pattern.includes("[1-9]");
  return { units, percent, negativeAllowed, zeroExcluded, pattern };
}

/** @type {Map<string, any>} datatype define name → classification */
const datatypes = new Map();
for (const [name, def] of defines) {
  for (const node of walk(def)) {
    if (localTag(node) === "data") {
      for (const child of node.children ?? []) {
        if (child.type === "element" && localTag(child) === "param" && child.attrs?.name === "pattern") {
          const cls = classifyPattern(textContent(child));
          if (cls) datatypes.set(name, cls);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pass 3 — for every <attribute name="...">, resolve its content down to
// datatype defines, collecting literal <value> keywords and inline <data>
// patterns along the way. Resolution follows <ref> transitively with a
// visited set (the schema contains reference cycles at the structural level,
// though not among datatypes).
// ---------------------------------------------------------------------------

function resolveContent(node, acc, visited) {
  for (const child of node.children ?? []) {
    if (child.type !== "element") continue;
    const tag = localTag(child);
    if (tag === "ref") {
      const target = child.attrs?.name;
      if (!target || visited.has(target)) continue;
      visited.add(target);
      if (datatypes.has(target)) {
        acc.datatypes.add(target);
      } else if (defines.has(target)) {
        resolveContent(defines.get(target), acc, visited);
      }
    } else if (tag === "value") {
      acc.keywords.add(textContent(child));
    } else if (tag === "data") {
      for (const p of child.children ?? []) {
        if (p.type === "element" && localTag(p) === "param" && p.attrs?.name === "pattern") {
          const cls = classifyPattern(textContent(p));
          if (cls) acc.inline.push(cls);
        }
      }
      // Non-pattern data types (e.g. decimal, double) — record the type name
      if (child.attrs?.type && !["string"].includes(child.attrs.type)) {
        acc.rawTypes.add(child.attrs.type);
      }
    } else {
      // choice / optional / group / interleave / list — descend
      resolveContent(child, acc, visited);
    }
  }
}

/** @type {Map<string, any>} attribute name → resolution */
const attributes = new Map();
for (const node of walk(root)) {
  if (localTag(node) !== "attribute") continue;
  // <attribute name="fo:page-width"> or <attribute><name>...</name>
  let attrName = node.attrs?.name;
  if (!attrName) {
    for (const child of node.children ?? []) {
      if (child.type === "element" && localTag(child) === "name") attrName = textContent(child);
    }
  }
  if (!attrName) continue;

  const acc = { datatypes: new Set(), keywords: new Set(), inline: [], rawTypes: new Set() };
  resolveContent(node, acc, new Set());

  const isLengthBearing = acc.datatypes.size > 0 || acc.inline.length > 0;
  if (!isLengthBearing) continue;

  // The same attribute name can be declared in several contexts (e.g.
  // fo:margin-left on paragraph vs page vs graphic properties). Merge.
  if (attributes.has(attrName)) {
    const prev = attributes.get(attrName);
    for (const d of acc.datatypes) prev.datatypes.add(d);
    for (const k of acc.keywords) prev.keywords.add(k);
    prev.inline.push(...acc.inline);
    for (const t of acc.rawTypes) prev.rawTypes.add(t);
    prev.declarations += 1;
  } else {
    attributes.set(attrName, { ...acc, declarations: 1 });
  }
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function summarize(attrName, res) {
  const units = new Set();
  let percent = false;
  let negativeAllowed = false;
  let zeroExcluded = true; // becomes false if ANY reachable datatype permits zero
  const dtNames = [...res.datatypes].sort();
  const all = [...dtNames.map((n) => datatypes.get(n)), ...res.inline];
  for (const cls of all) {
    for (const u of cls.units) units.add(u);
    percent ||= cls.percent;
    negativeAllowed ||= cls.negativeAllowed;
    if (!cls.zeroExcluded) zeroExcluded = false;
  }
  return {
    attribute: attrName,
    datatypes: dtNames,
    units: [...units].sort(),
    percentAllowed: percent,
    negativeAllowed,
    zeroExcluded: all.length > 0 ? zeroExcluded : undefined,
    keywords: [...res.keywords].sort(),
    otherTypes: [...res.rawTypes].sort(),
    declarations: res.declarations,
  };
}

const rows = [...attributes.entries()]
  .map(([name, res]) => summarize(name, res))
  .sort((a, b) => a.attribute.localeCompare(b.attribute));

const datatypeTable = [...datatypes.entries()]
  .map(([name, cls]) => ({ name, ...cls }))
  .sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(join(REPO, "spec"), { recursive: true });

writeFileSync(
  join(REPO, "spec", "odf-1.3-length-datatypes.json"),
  JSON.stringify({ source: "OpenDocument-v1.3-schema.rng (OASIS Standard, 2021-04-27)", datatypes: datatypeTable, attributes: rows }, null, 2),
);

let md = "# ODF 1.3 length datatypes — extracted from the official RNG schema\n\n";
md += "Source: `OpenDocument-v1.3-schema.rng`, OASIS Standard, 27 April 2021.\n";
md += "Generated by `tools/extract-odf-datatypes.mjs`. Do not edit by hand.\n\n";
md += "## Datatype definitions\n\n";
md += "| Define | Units | % | Negative | Zero excluded | Pattern |\n|---|---|---|---|---|---|\n";
for (const dt of datatypeTable) {
  md += `| \`${dt.name}\` | ${dt.units.join(", ") || "—"} | ${dt.percent ? "yes" : "—"} | ${dt.negativeAllowed ? "yes" : "—"} | ${dt.zeroExcluded ? "yes" : "—"} | \`${dt.pattern.length > 60 ? dt.pattern.slice(0, 57) + "..." : dt.pattern}\` |\n`;
}
md += "\n## Length-bearing attributes\n\n";
md += "| Attribute | Datatypes | Units | % | Negative | Keywords | Decls |\n|---|---|---|---|---|---|---|\n";
for (const r of rows) {
  md += `| \`${r.attribute}\` | ${r.datatypes.map((d) => `\`${d}\``).join(", ") || "(inline)"} | ${r.units.join(", ")} | ${r.percentAllowed ? "yes" : "—"} | ${r.negativeAllowed ? "yes" : "—"} | ${r.keywords.map((k) => `\`${k}\``).join(", ") || "—"} | ${r.declarations} |\n`;
}
writeFileSync(join(REPO, "spec", "odf-1.3-length-datatypes.md"), md);

console.log(`Datatype defines found: ${datatypeTable.length}`);
console.log(`Length-bearing attributes: ${rows.length}`);
console.log(`Written: spec/odf-1.3-length-datatypes.{json,md}`);

// Spot-check the attributes this whole investigation has turned on.
for (const probe of ["fo:page-width", "fo:font-size", "fo:line-height", "fo:margin", "fo:margin-left", "style:line-spacing", "fo:text-indent", "svg:width"]) {
  const r = rows.find((x) => x.attribute === probe);
  console.log(probe.padEnd(24), r ? `${r.datatypes.join("+") || "inline"} units=[${r.units}] %=${r.percentAllowed} neg=${r.negativeAllowed} kw=[${r.keywords}]` : "NOT FOUND — investigate");
}
