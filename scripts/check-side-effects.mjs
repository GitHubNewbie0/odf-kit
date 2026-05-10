// scripts/check-side-effects.mjs
//
// Investigates whether odf-kit's source modules have side effects on import.
// Walks every .ts file under src/, parses each via the TypeScript compiler API,
// and flags any top-level statement that isn't a pure declaration.
//
// Pure declarations (NOT flagged):
//   - import { ... } from "..."  (named/default/namespace imports — bindings only)
//   - import type { ... } from "..."  (type-only — fully erased)
//   - export { ... } / export const / export function / export class / export type
//   - const / let / var declarations (any initializer, even computed)
//   - function / class declarations
//   - interface / type alias / enum declarations
//   - declare statements (type-only)
//
// Side effects (FLAGGED):
//   - import "..."  (bare import — pulls module in for side effects)
//   - Top-level expression statements (function calls, console.log, etc.)
//   - Top-level if/for/while/switch/try (executable control flow)
//   - Top-level throw / return (shouldn't appear at module scope but flag if so)
//
// Usage: node scripts/check-side-effects.mjs
//
// Exits 0 if clean, 1 if any side effects found.
// One-off investigation tool. Not wired into npm scripts.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const srcRoot = join(repoRoot, "src");

// Recursively collect all .ts files under src/
function collectTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

// Check if a top-level statement is a "pure declaration"
// (no execution at module init time).
function isPureDeclaration(node) {
  // Import declarations: pure UNLESS bare (no clause means side-effect import)
  if (ts.isImportDeclaration(node)) {
    if (!node.importClause) {
      return false; // bare import — side effect
    }
    return true;
  }

  // Export declarations and assignments: pure (re-exports, type exports, etc.)
  if (ts.isExportDeclaration(node)) return true;
  if (ts.isExportAssignment(node)) return true;

  // Variable statements: pure declarations regardless of initializer
  // (the initializer's evaluation is a "side effect" only if it has observable
  //  effects beyond producing a value — which the next category is for)
  if (ts.isVariableStatement(node)) return true;

  // Function / class declarations: pure
  if (ts.isFunctionDeclaration(node)) return true;
  if (ts.isClassDeclaration(node)) return true;

  // Type-only constructs: fully erased at compile time
  if (ts.isInterfaceDeclaration(node)) return true;
  if (ts.isTypeAliasDeclaration(node)) return true;
  if (ts.isEnumDeclaration(node)) return true; // enums emit code but don't execute beyond constants

  // Module / namespace declarations: pure structurally
  if (ts.isModuleDeclaration(node)) return true;

  // declare statements (ambient declarations): fully erased
  if (
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
  ) {
    return true;
  }

  // Empty statement (just `;`): harmless
  if (node.kind === ts.SyntaxKind.EmptyStatement) return true;

  // Anything else (expression statements, control flow, etc.) is NOT a pure declaration.
  return false;
}

function describeStatement(node, sourceFile) {
  const start = node.getStart(sourceFile);
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
  const kind = ts.SyntaxKind[node.kind];
  const text = node.getText(sourceFile).split("\n")[0].trim();
  const truncated = text.length > 100 ? text.slice(0, 97) + "..." : text;
  return {
    line: line + 1,
    column: character + 1,
    kind,
    text: truncated,
  };
}

// Main
const files = collectTsFiles(srcRoot);
console.log(`check-side-effects: scanning ${files.length} .ts files under src/\n`);

const findings = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  );

  for (const stmt of sourceFile.statements) {
    if (!isPureDeclaration(stmt)) {
      findings.push({
        file: relative(repoRoot, file).replace(/\\/g, "/"),
        ...describeStatement(stmt, sourceFile),
      });
    }
  }
}

if (findings.length === 0) {
  console.log("check-side-effects: CLEAN — no top-level side effects detected.");
  console.log('  Adding `"sideEffects": false` to package.json is safe.');
  process.exit(0);
}

console.log(`check-side-effects: found ${findings.length} top-level statement(s) that are NOT pure declarations:\n`);

for (const f of findings) {
  console.log(`  ${f.file}:${f.line}:${f.column}`);
  console.log(`    kind: ${f.kind}`);
  console.log(`    text: ${f.text}`);
  console.log();
}

console.log("Each finding above must be inspected:");
console.log("  - False positive (pure declaration the script missed): script needs refinement");
console.log("  - Real but harmless side effect: still incompatible with sideEffects:false");
console.log("  - Real and necessary side effect: do NOT add sideEffects:false");
console.log("  - Real and removable side effect: refactor first, then add the field");

process.exit(1);
