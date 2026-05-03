#!/usr/bin/env node
/**
 * One-time generator: converts WHATWG's entities.json into a TypeScript
 * data file consumable by src/html-normalizer/rules/entities.ts.
 *
 * Usage:
 *   1. Download entities.json from https://html.spec.whatwg.org/entities.json
 *   2. Run: node scripts/generate-entities-table.mjs <path-to-entities.json>
 *   3. The script writes src/html-normalizer/data/entities-table.ts
 *   4. Delete the downloaded entities.json (not committed)
 *
 * Filtering applied:
 *   - Semicolon-terminated entities only (legacy non-semicolon forms excluded)
 *   - Five XML predefined entities excluded (handled by parseXml)
 *
 * The generated file is the single source of truth at runtime. This script
 * is committed for audit and regeneration only — it is not part of the
 * build pipeline.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error(
    "Usage: node scripts/generate-entities-table.mjs <path-to-entities.json>",
  );
  process.exit(1);
}

const raw = JSON.parse(readFileSync(inputPath, "utf-8"));

const XML_PREDEFINED = new Set(["amp", "lt", "gt", "quot", "apos"]);

const entries = [];
for (const [key, value] of Object.entries(raw)) {
  if (!key.endsWith(";")) continue;
  const name = key.slice(1, -1);
  if (XML_PREDEFINED.has(name)) continue;
  entries.push([name, value.characters]);
}

entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const lines = [
  "/**",
  " * HTML5 named character reference table.",
  " *",
  " * Generated from WHATWG's entities.json by",
  " * scripts/generate-entities-table.mjs. Do not edit by hand — run the",
  " * generator if the table needs to be updated.",
  " *",
  " * Filtering applied:",
  " *   - Semicolon-terminated entities only (legacy non-semicolon forms",
  " *     excluded)",
  " *   - Five XML predefined entities excluded (parseXml handles those)",
  " *",
  " * Maps entity name (without leading `&` and trailing `;`) to its decoded",
  ' * string value. Example: ENTITIES.copy === "\\u00A9".',
  " */",
  "",
  "export const ENTITIES: Readonly<Record<string, string>> = Object.freeze({",
];

for (const [name, chars] of entries) {
  lines.push(`  ${JSON.stringify(name)}: ${JSON.stringify(chars)},`);
}

lines.push("});");
lines.push("");

const outputPath = resolve("src/html-normalizer/data/entities-table.ts");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, lines.join("\n"), "utf-8");

console.log(`Wrote ${entries.length} entities to ${outputPath}`);