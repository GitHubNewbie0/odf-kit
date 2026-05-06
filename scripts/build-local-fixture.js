// scripts/build-local-fixture.js
// Generates html-to-odt-local.html from html-to-odt.html by replacing
// esm.run import URLs with local /dist/ paths for offline development.
//
// Run after touching html-to-odt.html to keep the local fixture in sync.
//
// Usage: npm run build:local-fixture
import fs from "node:fs";

const SRC = "docs/tools/html-to-odt.html";
const DST = "docs/tools/html-to-odt-local.html";

const src = fs.readFileSync(SRC, "utf8");

// Replace order matters: more-specific (/reader) before less-specific (bare URL).
const local = src
  .replace(
    /https:\/\/esm\.run\/odf-kit@[\d.]+\/reader/g,
    "/dist/reader/index.js",
  )
  .replace(/https:\/\/esm\.run\/odf-kit@[\d.]+/g, "/dist/index.js");

fs.writeFileSync(DST, local);
console.log(`build-local-fixture: ${SRC} -> ${DST}`);
