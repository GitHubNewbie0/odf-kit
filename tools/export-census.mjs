#!/usr/bin/env node
/**
 * export-census.mjs — odf-kit export census (api-doc-inventory-plan.md §3.2;
 * v0_14_0-plan-v3.md Phase 0).
 *
 * Walks the package.json `exports` map, loads each entry point's emitted
 * .d.ts through the TypeScript compiler API, and records every exported
 * symbol: name, kind, subpath(s), JSDoc presence, function signatures,
 * interface properties (with optionality and per-property JSDoc), and —
 * load-bearing for STALE detection — the members of every pure
 * string-literal union.
 *
 * MUST run against emitted output: `npm run build` first.
 *
 *   node tools/export-census.mjs
 *   node tools/export-census.mjs --out-dir <dir>
 *
 * Outputs (committed; the v0.14.0 before-picture):
 *   tools/export-census.json  — machine-readable, deterministic, diffable
 *   tools/export-census.md    — human summary
 *
 * --out-dir writes both files under <dir> instead of the repo root, keeping
 * the same tools/ prefix. It exists so verification runs cannot address the
 * committed before-picture: regenerating in place during the v0.14.0
 * restructure would overwrite the one artifact Phases 4 and 8 diff against,
 * and there is no redo. Omit the flag only when deliberately regenerating
 * the committed baseline.
 *
 * No timestamp is embedded, deliberately: before/after diffs must show only
 * real surface change. Git records when.
 */

import ts from "typescript";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Directory the two output files are written under. Defaults to the repo
 * root, so the committed before-picture is only ever rewritten by a bare,
 * deliberate invocation.
 */
const outDirFlag = process.argv.indexOf("--out-dir");
if (outDirFlag !== -1 && !process.argv[outDirFlag + 1]) {
  console.error("export-census: --out-dir requires a directory argument");
  process.exit(1);
}
const outDir =
  outDirFlag === -1 ? repoRoot : resolve(process.argv[outDirFlag + 1]);

// ---------------------------------------------------------------- exports map

const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
if (!pkg.exports) {
  console.error("export-census: no exports map in package.json");
  process.exit(1);
}

/** subpath label ("odf-kit", "odf-kit/odt", ...) → absolute .d.ts path */
const entryPoints = [];
for (const [key, value] of Object.entries(pkg.exports)) {
  const label = key === "." ? pkg.name : `${pkg.name}/${key.slice(2)}`;
  const typesRel =
    typeof value === "object" && value !== null ? value.types : undefined;
  if (!typesRel) {
    entryPoints.push({ label, dts: null, error: "no `types` condition" });
    continue;
  }
  const dts = resolve(repoRoot, typesRel);
  entryPoints.push(
    existsSync(dts)
      ? { label, dts }
      : { label, dts, error: `missing on disk: ${typesRel} — run \`npm run build\` first` },
  );
}

const missing = entryPoints.filter((e) => e.error);
if (missing.some((e) => e.error.startsWith("missing on disk"))) {
  for (const e of missing) console.error(`export-census: ${e.label}: ${e.error}`);
  process.exit(1);
}

// Dedupe: several subpaths may share one .d.ts (./reader, ./odt-reader).
const byDts = new Map();
for (const e of entryPoints) {
  if (!e.dts) continue;
  if (!byDts.has(e.dts)) byDts.set(e.dts, { dts: e.dts, subpaths: [] });
  byDts.get(e.dts).subpaths.push(e.label);
}

// ------------------------------------------------------------------- program

const rootFiles = [...byDts.keys()];
const program = ts.createProgram(rootFiles, {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
});
const checker = program.getTypeChecker();

// ------------------------------------------------------------------- helpers

function hasJsDoc(symbol) {
  try {
    return symbol.getDocumentationComment(checker).some((p) => p.text.trim());
  } catch {
    return false;
  }
}

/** Pure string-literal union members (undefined filtered), else null. */
function literalUnionMembers(type) {
  if (!type || !type.isUnion?.()) return null;
  const parts = type.types.filter(
    (t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)),
  );
  if (parts.length < 2) return null;
  if (!parts.every((t) => t.isStringLiteral())) return null;
  return parts.map((t) => t.value).sort();
}

function typeString(type) {
  try {
    return checker.typeToString(
      type,
      undefined,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
    );
  } catch {
    return "(unprintable)";
  }
}

function symbolKind(sym) {
  const f = sym.getFlags();
  if (f & ts.SymbolFlags.Class) return "class";
  if (f & ts.SymbolFlags.Interface) return "interface";
  if (f & ts.SymbolFlags.TypeAlias) return "type-alias";
  if (f & ts.SymbolFlags.Function) return "function";
  if (f & ts.SymbolFlags.Enum) return "enum";
  if (f & ts.SymbolFlags.Variable) return "const";
  return "other";
}

function describeSignature(sig) {
  return {
    parameters: sig.getParameters().map((p) => {
      const decl = p.valueDeclaration ?? p.getDeclarations()?.[0];
      const pType = decl
        ? checker.getTypeOfSymbolAtLocation(p, decl)
        : undefined;
      const optional =
        !!decl &&
        ts.isParameter(decl) &&
        (!!decl.questionToken || !!decl.initializer);
      return {
        name: p.getName(),
        type: pType ? typeString(pType) : "(unknown)",
        optional,
      };
    }),
    returns: typeString(sig.getReturnType()),
  };
}

function describeProperties(type) {
  const props = [];
  for (const p of checker.getPropertiesOfType(type)) {
    const decl = p.valueDeclaration ?? p.getDeclarations()?.[0];
    const pType = decl ? checker.getTypeOfSymbolAtLocation(p, decl) : undefined;
    const row = {
      name: p.getName(),
      type: pType ? typeString(pType) : "(unknown)",
      optional: !!(p.getFlags() & ts.SymbolFlags.Optional),
      jsdoc: hasJsDoc(p),
    };
    const members = pType ? literalUnionMembers(pType) : null;
    if (members) row.unionMembers = members;
    props.push(row);
  }
  return props.sort((a, b) => a.name.localeCompare(b.name));
}

function describeSymbol(exported) {
  let sym = exported;
  let viaAlias = false;
  try {
    if (sym.getFlags() & ts.SymbolFlags.Alias) {
      sym = checker.getAliasedSymbol(sym);
      viaAlias = true;
    }
  } catch {
    /* keep the alias symbol */
  }

  const row = {
    name: exported.getName(),
    kind: symbolKind(sym),
    jsdoc: hasJsDoc(sym) || hasJsDoc(exported),
  };
  if (viaAlias) row.reExport = true;

  try {
    const decl = sym.valueDeclaration ?? sym.getDeclarations()?.[0];

    if (row.kind === "function" || row.kind === "const" || row.kind === "class") {
      const t = decl ? checker.getTypeOfSymbolAtLocation(sym, decl) : undefined;
      if (t) {
        const sigs = t.getCallSignatures();
        if (sigs.length) row.signatures = sigs.map(describeSignature);
        else if (row.kind === "const") {
          row.type = typeString(t);
          const members = literalUnionMembers(t);
          if (members) row.unionMembers = members;
        }
      }
    }

    if (row.kind === "interface") {
      row.properties = describeProperties(checker.getDeclaredTypeOfSymbol(sym));
    }

    if (row.kind === "type-alias" && decl && ts.isTypeAliasDeclaration(decl)) {
      const t = checker.getTypeAtLocation(decl.name);
      row.type = typeString(t);
      const members = literalUnionMembers(t);
      if (members) row.unionMembers = members;
      // Object-shaped aliases (e.g. options types) get property rows too.
      if (!members && t.getProperties().length) {
        row.properties = describeProperties(t);
      }
    }
  } catch (err) {
    row.error = String(err?.message ?? err);
  }
  return row;
}

// --------------------------------------------------------------------- walk

const modules = [];
for (const { dts, subpaths } of byDts.values()) {
  const sf = program.getSourceFile(dts);
  const entry = {
    subpaths: subpaths.sort(),
    dts: dts.slice(repoRoot.length + 1).replaceAll("\\", "/"),
    symbols: [],
  };
  if (!sf) {
    entry.error = "source file not loaded";
    modules.push(entry);
    continue;
  }
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  if (!moduleSymbol) {
    entry.error = "no module symbol (not a module?)";
    modules.push(entry);
    continue;
  }
  entry.symbols = checker
    .getExportsOfModule(moduleSymbol)
    .map(describeSymbol)
    .sort((a, b) => a.name.localeCompare(b.name));
  modules.push(entry);
}
modules.sort((a, b) => a.subpaths[0].localeCompare(b.subpaths[0]));

// ------------------------------------------------------------------- outputs

const census = {
  package: pkg.name,
  version: pkg.version,
  note: "Generated by tools/export-census.mjs after `npm run build`. Deterministic; no timestamp by design.",
  entryPointErrors: missing.map((e) => ({ subpath: e.label, error: e.error })),
  modules,
};

mkdirSync(resolve(outDir, "tools"), { recursive: true });

writeFileSync(
  resolve(outDir, "tools/export-census.json"),
  JSON.stringify(census, null, 2) + "\n",
);

// Human summary.
let totalSymbols = 0;
let noDoc = [];
let unions = [];
for (const m of modules) {
  totalSymbols += m.symbols.length;
  for (const s of m.symbols) {
    if (!s.jsdoc) noDoc.push(`${m.subpaths[0]} · ${s.name}`);
    if (s.unionMembers)
      unions.push(`${m.subpaths[0]} · ${s.name}: ${s.unionMembers.join(" | ")}`);
    for (const p of s.properties ?? []) {
      if (p.unionMembers)
        unions.push(
          `${m.subpaths[0]} · ${s.name}.${p.name}: ${p.unionMembers.join(" | ")}`,
        );
    }
  }
}

const md = [
  `# Export census — ${pkg.name}@${pkg.version}`,
  "",
  "Generated by `tools/export-census.mjs` (api-doc-inventory §3.2; v0.14.0 Phase 0).",
  "Full data: `tools/export-census.json`.",
  "",
  `| Entry point(s) | .d.ts | Exported symbols |`,
  `|---|---|---|`,
  ...modules.map(
    (m) =>
      `| ${m.subpaths.map((s) => `\`${s}\``).join(", ")} | \`${m.dts}\` | ${m.symbols.length}${m.error ? ` — **${m.error}**` : ""} |`,
  ),
  "",
  `**Total exported symbols (deduped by entry file): ${totalSymbols}**`,
  "",
  `## String-literal unions (${unions.length}) — STALE-detection column`,
  "",
  ...(unions.length ? unions.map((u) => `- ${u}`) : ["- none found"]),
  "",
  `## Symbols without JSDoc (${noDoc.length}) — Phase 3 batching input`,
  "",
  ...(noDoc.length ? noDoc.map((u) => `- ${u}`) : ["- none — full coverage"]),
  "",
].join("\n");

writeFileSync(resolve(outDir, "tools/export-census.md"), md);

console.log(
  `export-census: ${modules.length} entry files, ${totalSymbols} symbols, ` +
    `${unions.length} literal unions, ${noDoc.length} symbols without JSDoc.`,
);
console.log(
  `Wrote ${resolve(outDir, "tools/export-census.json")} and ` +
    `${resolve(outDir, "tools/export-census.md")}` +
    (outDir === repoRoot ? " (committed before-picture)" : ""),
);
if (census.entryPointErrors.length) {
  console.warn("Entry-point warnings:");
  for (const e of census.entryPointErrors)
    console.warn(`  ${e.subpath}: ${e.error}`);
}
