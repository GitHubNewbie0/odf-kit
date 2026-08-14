#!/usr/bin/env node
/**
 * doc-drift.mjs — find claims in prose that the artifacts contradict.
 *
 * THE PROBLEM
 *   A fact about the machine gets written into several documents. The machine
 *   changes. The documents don't. Nothing fails, because prose is never
 *   executed. The error is found months later by somebody who believed it.
 *   The gate's step count had FOUR homes and three were wrong.
 *
 * THE APPROACH
 *   Derive truth from the artifacts — package.json, the filesystem — then scan
 *   prose for assertions of the same kind and compare. No registry, no
 *   dependency graph, no index to maintain: the checker walks whatever files
 *   exist and needs no cooperation from them.
 *
 * RELATIONSHIP TO canon.md
 *   Canon declares the facts; this verifies that nothing contradicts them.
 *
 * WHAT IT CANNOT DO
 *   Only checks claims with an artifact to check against. A wrong claim about
 *   a decision or a rationale is invisible here.
 *
 * WHAT IT DELIBERATELY SKIPS
 *   state/ and logs/ — a state file correctly describes the world on its date.
 *   Historical records are not claims about the present.
 *
 * USAGE
 *   node tools/doc-drift.mjs [--repo <path>] [--also <path> ...]
 *
 * EXIT  0 = no drift   1 = drift found   2 = usage/IO error
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";

// ── arguments ─────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
let repoRoot = process.cwd();
const extraRoots = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--repo") repoRoot = resolve(argv[++i] ?? "");
  else if (argv[i] === "--also") extraRoots.push(resolve(argv[++i] ?? ""));
  else {
    console.error(`doc-drift: unknown argument ${argv[i]}`);
    process.exit(2);
  }
}

const pkgPath = join(repoRoot, "package.json");
if (!existsSync(pkgPath)) {
  console.error(`doc-drift: no package.json at ${repoRoot}`);
  process.exit(2);
}
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const truth = {
  scripts: new Set(Object.keys(pkg.scripts ?? {})),
  subpaths: Object.keys(pkg.exports ?? {}).length,
  runtimeDeps: Object.keys(pkg.dependencies ?? {}),
  engineNode: (pkg.engines?.node ?? "").replace(/[^\d.]/g, ""),
};

// ── prose corpus ──────────────────────────────────────────────────────────

const PROSE_EXT = /\.(md|ya?ml)$/i;
const SKIP_DIR = /^(node_modules|\.git|dist|coverage|\.cache|\.codeql-db|state|logs)$/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!SKIP_DIR.test(name)) walk(full, out);
    } else if (PROSE_EXT.test(name)) out.push(full);
  }
  return out;
}

const roots = [repoRoot, ...extraRoots];
const files = roots.flatMap((r) => walk(r));

// ── findings ──────────────────────────────────────────────────────────────

const findings = [];
const record = (file, line, check, message) =>
  findings.push({ file, line, check, message });

const RE_NPM_RUN = /npm run ([a-z0-9:_-]+)/gi;

// B · path references — TIGHTENED (v3).
//   v2 produced 258 findings, nearly all noise, because prose legitimately
//   refers to things by shorthand: bare directories (`core/`, `rules/`),
//   partial paths (`odt/document.ts` for the full build-or-fill path), and
//   foreign package parts (`word/document.xml`, `xl/styles.xml`).
//   v3 flags ONLY a full repo-rooted path: starts with a known top-level
//   directory AND ends in a file extension. Everything else is shorthand and
//   not the checker's business.
const RE_TICKED = /`([^`\n]+)`/g;
const ROOTED = /^(src|tests|tools|scripts|docs|spec)\/[\w./@-]+\.\w+$/;

const RE_CHAIN = /([a-z][\w:.-]*(?:\s*(?:→|->)\s*[a-z][\w:.-]*)+)/gi;

const WORD_NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const RE_COUNT =
  /\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:published\s+)?(subpaths?|sub-exports?|entry\s+points?|runtime\s+dep(?:endenc)?(?:y|ies))/gi;

// E · Node version claims — FIXED (v3).
//   v2 flagged every mention of `node10` / `node16`, which are attw RESOLUTION
//   MODES, not Node versions. Requiring whitespace before the digits excludes
//   them: attw writes them closed up, prose writes "Node 22".
const RE_NODE = /\bNode(?:\.js)?\s+(\d{1,2})\s*\+?/gi;

for (const file of files) {
  const shown = relative(process.cwd(), file) || file;
  const here = dirname(file);
  const text = readFileSync(file, "utf8");

  text.split(/\r?\n/).forEach((line, idx) => {
    const n = idx + 1;

    for (const m of line.matchAll(RE_NPM_RUN)) {
      if (!truth.scripts.has(m[1])) {
        record(shown, n, "script", `"npm run ${m[1]}" — no such script in package.json`);
      }
    }

    for (const m of line.matchAll(RE_TICKED)) {
      const raw = m[1].trim();
      if (!ROOTED.test(raw)) continue;
      const candidates = [join(here, raw), ...roots.map((r) => join(r, raw))];
      if (!candidates.some((p) => existsSync(p))) {
        record(shown, n, "path", `\`${raw}\` — rooted path that does not exist`);
      }
    }

    for (const m of line.matchAll(RE_CHAIN)) {
      const tokens = m[1].split(/\s*(?:→|->)\s*/).map((t) => t.trim());
      if (tokens.length < 3) continue;
      if (tokens.filter((t) => truth.scripts.has(t)).length < 2) continue;
      const unknown = tokens.filter((t) => !truth.scripts.has(t));
      const missing = [...truth.scripts].filter(
        (s) => !tokens.includes(s) && !/^(clean|prepare|prepublishOnly|version|format$|build:|docs:)/.test(s),
      );
      const parts = [];
      if (unknown.length) parts.push(`not scripts: ${unknown.join(", ")}`);
      if (missing.length) parts.push(`scripts absent from chain: ${missing.join(", ")}`);
      if (parts.length) record(shown, n, "pipeline", `chain "${m[1]}" — ${parts.join("; ")}`);
    }

    for (const m of line.matchAll(RE_COUNT)) {
      const claimed = WORD_NUM[m[1].toLowerCase()] ?? Number(m[1]);
      const kind = m[2].toLowerCase().replace(/\s+/g, " ");
      let actual = null;
      let label = null;
      if (/subpath|sub-export|entry point/.test(kind)) {
        actual = truth.subpaths;
        label = "exports map entries";
      } else if (/runtime dep/.test(kind)) {
        actual = truth.runtimeDeps.length;
        label = `dependencies (${truth.runtimeDeps.join(", ")})`;
      }
      if (actual !== null && claimed !== actual) {
        record(shown, n, "count", `claims ${claimed} ${kind}; package.json has ${actual} ${label}`);
      }
    }

    for (const m of line.matchAll(RE_NODE)) {
      if (!truth.engineNode) continue;
      const major = truth.engineNode.split(".")[0];
      if (m[1] !== major) {
        record(shown, n, "node", `claims Node ${m[1]}; engines.node is ${pkg.engines.node}`);
      }
    }
  });
}

// ── report ────────────────────────────────────────────────────────────────

console.log("doc-drift");
console.log(`  repo      : ${repoRoot}`);
for (const r of extraRoots) console.log(`  also      : ${r}`);
console.log(`  prose files scanned: ${files.length}  (state/ and logs/ skipped)`);
console.log(`  scripts (${truth.scripts.size}): ${[...truth.scripts].join(", ")}`);
console.log(`  exports map entries: ${truth.subpaths}`);
console.log(`  runtime deps: ${truth.runtimeDeps.join(", ") || "(none)"}`);
console.log("");

if (findings.length === 0) {
  console.log("no drift found.");
  process.exit(0);
}

const byCheck = {};
for (const f of findings) (byCheck[f.check] ??= []).push(f);
for (const [check, list] of Object.entries(byCheck)) {
  console.log(`── ${check.toUpperCase()} (${list.length}) ${"─".repeat(Math.max(0, 50 - check.length))}`);
  for (const f of list) console.log(`  ${f.file}:${f.line}\n      ${f.message}`);
  console.log("");
}
console.log(`doc-drift: ${findings.length} finding(s).`);
console.log(
  "\nFindings are claims to CHECK, not proven errors. A plan document may\n" +
    "describe a pre-restructure path deliberately; a chain may describe a\n" +
    "different pipeline. The checker reports mismatches; judging them is the\n" +
    "reader's job.",
);
process.exit(1);
