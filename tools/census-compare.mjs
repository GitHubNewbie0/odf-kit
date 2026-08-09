#!/usr/bin/env node
/**
 * census-compare.mjs — diff two export censuses by symbol name.
 *
 * The mechanical form of the v0.14.0 strict-additive contract
 * (v0_14_0-plan-v3-amendments-2.md rule 0): every row of the committed
 * before-picture must resolve identically from its existing subpath(s)
 * after the restructure. This tool is the Phase 4 / Phase 8 "verify by
 * diff, never trust" check, and the per-move check during Phase 2.
 *
 *   node tools/census-compare.mjs <candidate.json>
 *   node tools/census-compare.mjs <candidate.json> --baseline <path>
 *
 * Baseline defaults to tools/export-census.json — the before-picture
 * committed at 412d584. Produce a candidate without touching it:
 *
 *   node tools/export-census.mjs --out-dir "$SCRATCH"
 *   node tools/census-compare.mjs "$SCRATCH/tools/export-census.json"
 *
 * Comparison is per SUBPATH, not per module group. The census groups
 * subpaths that share a .d.ts (./reader + ./odt-reader); when the exports
 * map grows at Phase 5, new subpaths join existing groups, and a
 * group-keyed comparison would misread that as a module being removed and
 * another added. Rule 0 speaks about subpaths, so this compares subpaths.
 *
 * Four channels, two severities:
 *
 *   DRIFT (exit 1) — contract violations
 *     removed   a subpath, or a symbol, that the baseline published
 *     changed   a symbol whose kind/signatures/properties/unionMembers/
 *               jsdoc differ (every column except reExport)
 *
 *   EXPECTED (exit 0) — reported for the operator to check against intent
 *     added     new subpaths or symbols. Legitimate under a strict-additive
 *               release, so not a failure — but verify each against what the
 *               phase actually authorised (move 11 adds markdownToOdt to
 *               odf-kit/markdown; Phase 5 adds 18 sub-export paths). An
 *               addition nobody planned is a finding.
 *     flips     reExport true/false changes. Expected restructure metadata
 *               (amendments-2 C1): a legacy path whose implementation moved
 *               to its canonical home now re-exports it. Never "fix" these.
 *
 * Exit codes: 0 = no drift, 1 = drift found, 2 = usage or I/O error.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const flagAt = argv.indexOf("--baseline");
if (flagAt !== -1 && !argv[flagAt + 1]) {
  console.error("census-compare: --baseline requires a path argument");
  process.exit(2);
}
const baselinePath =
  flagAt === -1
    ? resolve(repoRoot, "tools/export-census.json")
    : resolve(argv[flagAt + 1]);
const candidatePath = argv.filter((a, i) => {
  if (a === "--baseline") return false;
  if (flagAt !== -1 && i === flagAt + 1) return false;
  return !a.startsWith("--");
})[0];

if (!candidatePath) {
  console.error(
    "census-compare: usage: node tools/census-compare.mjs <candidate.json> [--baseline <path>]",
  );
  process.exit(2);
}

function load(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`census-compare: cannot read ${label} (${path}): ${e.message}`);
    process.exit(2);
  }
}

const baseline = load(baselinePath, "baseline");
const candidate = load(resolve(candidatePath), "candidate");

// ------------------------------------------------------------------ compare

/** Deterministic serialisation, so key order can never fake a difference. */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** subpath → { dts, symbols: Map<name, row> }; one row per subpath. */
function bySubpath(census) {
  const out = new Map();
  for (const m of census.modules ?? []) {
    for (const sp of m.subpaths ?? []) {
      out.set(sp, {
        dts: m.dts,
        symbols: new Map((m.symbols ?? []).map((s) => [s.name, s])),
      });
    }
  }
  return out;
}

const base = bySubpath(baseline);
const cand = bySubpath(candidate);

const removedSubpaths = [];
const addedSubpaths = [];
const removedSymbols = [];
const changedSymbols = [];
const addedSymbols = [];
const flips = [];

for (const sp of cand.keys()) if (!base.has(sp)) addedSubpaths.push(sp);

for (const [sp, b] of base) {
  const c = cand.get(sp);
  if (!c) {
    removedSubpaths.push(sp);
    continue;
  }
  for (const name of c.symbols.keys()) {
    if (!b.symbols.has(name)) addedSymbols.push(`${sp} :: ${name}`);
  }
  for (const [name, bRow] of b.symbols) {
    const cRow = c.symbols.get(name);
    if (!cRow) {
      removedSymbols.push(`${sp} :: ${name}`);
      continue;
    }
    const strip = ({ reExport, ...rest }) => stable(rest);
    if (strip(bRow) !== strip(cRow)) {
      changedSymbols.push({ where: `${sp} :: ${name}`, from: strip(bRow), to: strip(cRow) });
    }
    if ((bRow.reExport ?? false) !== (cRow.reExport ?? false)) {
      flips.push(
        `${sp} :: ${name}  ${bRow.reExport ?? false} -> ${cRow.reExport ?? false}`,
      );
    }
  }
}

// ------------------------------------------------------------------- report

const countSymbols = (census) =>
  (census.modules ?? []).reduce((n, m) => n + (m.symbols?.length ?? 0), 0);

console.log(`census-compare`);
console.log(`  baseline : ${baselinePath}`);
console.log(`  candidate: ${resolve(candidatePath)}`);
console.log(
  `  entry files ${baseline.modules?.length ?? 0} -> ${candidate.modules?.length ?? 0}` +
    `   subpaths ${base.size} -> ${cand.size}` +
    `   symbols (deduped by entry file) ${countSymbols(baseline)} -> ${countSymbols(candidate)}`,
);
console.log("");

const list = (label, rows) => {
  console.log(`${label} (${rows.length}):`);
  if (!rows.length) console.log("  none");
  else rows.forEach((r) => console.log(`  ${r}`));
  console.log("");
};

list("EXPECTED · added subpaths", addedSubpaths);
list("EXPECTED · added symbols", addedSymbols);
list("EXPECTED · reExport flips", flips);
list("DRIFT · removed subpaths", removedSubpaths);
list("DRIFT · removed symbols", removedSymbols);

console.log(`DRIFT · changed symbols (${changedSymbols.length}):`);
if (!changedSymbols.length) console.log("  none");
else {
  for (const c of changedSymbols) {
    console.log(`  ${c.where}`);
    console.log(`    baseline : ${c.from}`);
    console.log(`    candidate: ${c.to}`);
  }
}
console.log("");

const drift =
  removedSubpaths.length + removedSymbols.length + changedSymbols.length;
if (drift) {
  console.error(
    `census-compare: FAIL — ${drift} contract violation(s). ` +
      `Every baseline row must resolve identically from its existing subpath(s).`,
  );
  process.exit(1);
}
console.log(
  "census-compare: PASS — no removals, no symbol-column changes. " +
    "Check the EXPECTED channels against what this phase authorised.",
);
