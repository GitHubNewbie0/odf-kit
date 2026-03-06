/**
 * Real-world reader test — Long Bass Lake Management Plan
 *
 * Run from repo root after npm run build:
 *   node scripts/test-reader-realworld.mjs path/to/document.odt
 *
 * Reports: errors, warnings, element counts, first 2000 chars of HTML output.
 */

import { readOdt, odtToHtml } from "../dist/reader/index.js";
import { readFileSync, writeFileSync } from "fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/test-reader-realworld.mjs <file.odt>");
  process.exit(1);
}

console.log(`Reading: ${path}`);
const bytes = readFileSync(path);

let doc;
try {
  doc = readOdt(bytes);
} catch (err) {
  console.error("❌ readOdt threw:", err.message);
  process.exit(1);
}

console.log("✅ readOdt succeeded");
console.log(`   Blocks: ${doc.body.length}`);

// Count block types
const counts = {};
for (const block of doc.body) {
  counts[block.kind] = (counts[block.kind] || 0) + 1;
}
console.log("   Block types:", counts);

// Render to HTML
let html;
try {
  html = odtToHtml(bytes);
} catch (err) {
  console.error("❌ renderToHtml threw:", err.message);
  process.exit(1);
}

console.log("✅ renderToHtml succeeded");
console.log(`   HTML length: ${html.length} chars`);

// Write full output for inspection
const outPath = path.replace(/\.odt$/, "-reader-output.html");
writeFileSync(outPath, `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { font-family: sans-serif; max-width: 900px; margin: 2em auto; line-height: 1.6; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  td, th { border: 1px solid #ccc; padding: 4px 8px; }
</style></head><body>${html}</body></html>`);
console.log(`   Full output written to: ${outPath}`);

// Show first chunk of output for quick sanity check
console.log("\n--- First 3000 chars of HTML output ---");
console.log(html.slice(0, 3000));
