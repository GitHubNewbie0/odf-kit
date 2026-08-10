// smoke.mjs — odf-kit v0.14.0 Phase 8 smoke test (state73 spec)
//
// Run from a FRESH project directory (not the repo) with odf-kit installed
// from the npm registry, and a census.json copied beside it:
//
//   node tools/export-census.mjs --out-dir <scratch>   (in the repo)
//   copy <scratch>/tools/export-census.json  <here>/census.json
//   npm install odf-kit          (fresh dir, type:module)
//   node smoke.mjs
//
// Asserts, for every published subpath: (1) the specifier resolves from the
// INSTALLED package; (2) every runtime symbol the census records is present
// and of a sane kind; (3) VERSION === the installed package.json version on
// every path. Then one functional round-trip: markdown -> ODT bytes -> readOdt.
// Exit 0 = pass, 1 = failures listed.

import { readFileSync } from "node:fs";

const census = JSON.parse(readFileSync(new URL("./census.json", import.meta.url), "utf8"));
const pkgVersion = JSON.parse(
  readFileSync(new URL("./node_modules/odf-kit/package.json", import.meta.url), "utf8"),
).version;

// kind heuristics: census kinds that exist at runtime vs type-only
const TYPE_ONLY = /interface|type/i;

const failures = [];
let paths = 0, runtimeChecks = 0, versionChecks = 0;

for (const mod of census.modules) {
  for (const sub of mod.subpaths) {
    paths++;
    let m;
    try {
      m = await import(sub);
    } catch (e) {
      failures.push(`${sub}: FAILED TO IMPORT — ${e.message.split("\n")[0]}`);
      continue;
    }
    for (const s of mod.symbols) {
      if (TYPE_ONLY.test(s.kind ?? "")) continue; // types checked at publish by attw/tsc
      runtimeChecks++;
      const v = m[s.name];
      if (v === undefined) {
        failures.push(`${sub} :: ${s.name} (${s.kind}) — undefined in installed package`);
      } else if (/function|class/i.test(s.kind ?? "") && typeof v !== "function") {
        failures.push(`${sub} :: ${s.name} — expected callable (${s.kind}), got ${typeof v}`);
      }
    }
    versionChecks++;
    if (m.VERSION !== pkgVersion) {
      failures.push(`${sub} :: VERSION — expected ${pkgVersion}, got ${String(m.VERSION)}`);
    }
  }
}

// functional round-trip: markdown -> odt bytes -> parsed model
try {
  const { markdownToOdt } = await import("odf-kit/markdown/to-odt");
  const { readOdt } = await import("odf-kit/odt/read");
  const bytes = await markdownToOdt("# Smoke Test\n\nHello **0.14.0** from the published package.\n");
  const model = readOdt(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const kinds = model.body.map((n) => n.kind);
  if (!kinds.includes("heading") || !kinds.includes("paragraph")) {
    failures.push(`round-trip: parsed body kinds ${JSON.stringify(kinds)} — expected heading + paragraph`);
  }
} catch (e) {
  failures.push(`round-trip FAILED: ${e.message.split("\n")[0]}`);
}

console.log(`installed odf-kit version: ${pkgVersion}`);
console.log(`subpaths imported: ${paths}`);
console.log(`runtime symbol checks: ${runtimeChecks}`);
console.log(`VERSION checks: ${versionChecks}`);
console.log("");
if (failures.length) {
  console.log(`FAIL (${failures.length}):`);
  for (const f of failures) console.log("  " + f);
  process.exit(1);
}
console.log("PASS — every census symbol resolves from the published package; VERSION holds on all paths; round-trip works.");
