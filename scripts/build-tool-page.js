// scripts/build-tool-page.js
//
// Generates docs/tools/index.html from docs/tools/index.template.html by:
//   1. Bundling docs/tools/index.ui.ts (and its odf-kit imports) via esbuild
//      into a single inline ES module string.
//   2. Substituting the bundle between the <!-- ODF_KIT_BUNDLE_START --> /
//      <!-- ODF_KIT_BUNDLE_END --> markers in the template.
//   3. Substituting the current ISO date for the <!-- BUILD_DATE --> marker.
//   4. Writing the result to docs/tools/index.html.
//
// docs/tools/index.html is git-ignored and prettier-ignored — never
// hand-edited. Source of truth is the template + index.ui.ts.
//
// Wired into the npm build lifecycle as the final step so `npm run build`
// produces both dist/ AND docs/tools/index.html in one command.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const templatePath = join(repoRoot, "docs", "tools", "index.template.html");
const outputPath = join(repoRoot, "docs", "tools", "index.html");
const uiEntryPoint = join(repoRoot, "docs", "tools", "index.ui.ts");

// 1. Read the template
const template = readFileSync(templatePath, "utf8");

// 2. Verify both expected markers exist before doing anything else.
//    Capturing groups around the markers preserve them in the substitution,
//    so only the content between them is replaced.
const bundleMarkerRe =
  /(<!-- ODF_KIT_BUNDLE_START -->)[\s\S]*?(<!-- ODF_KIT_BUNDLE_END -->)/;
const buildDateMarkerRe = /<!--\s*BUILD_DATE\s*-->/;

if (!bundleMarkerRe.test(template)) {
  console.error(
    "build-tool-page: bundle markers not found in template. " +
      "Expected <!-- ODF_KIT_BUNDLE_START --> ... <!-- ODF_KIT_BUNDLE_END -->",
  );
  process.exit(1);
}
if (!buildDateMarkerRe.test(template)) {
  console.error("build-tool-page: <!-- BUILD_DATE --> marker not found in template");
  process.exit(1);
}

// 3. Bundle docs/tools/index.ui.ts via esbuild.
//    Self-referencing imports (odf-kit/odt etc.) resolve through the package.json
//    exports map to dist/, which tsc must have produced first (build pipeline order).
const bundleResult = await esbuild.build({
  entryPoints: [uiEntryPoint],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: false,
  minify: false,
  write: false,
  logLevel: "warning",
  absWorkingDir: repoRoot,
});

if (bundleResult.errors.length > 0) {
  console.error("build-tool-page: esbuild reported errors");
  process.exit(1);
}

const bundleCode = bundleResult.outputFiles[0].text;

// Sanity check — a literal </script> inside the bundle would prematurely close
// the inline <script type="module"> wrapper. Refuse to write rather than emit
// a silently-broken page.
if (bundleCode.includes("</script>")) {
  console.error(
    "build-tool-page: bundle contains literal </script> — " +
      'would break inline <script type="module"> wrapper. Refusing to write.',
  );
  process.exit(1);
}

// 4. Substitute markers. Bundle markers are preserved as audit trail; only the
//    content between them is replaced.
const buildDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const inlineScript =
  `$1\n<script type="module">\n${bundleCode}\n</script>\n$2`;

let output = template.replace(bundleMarkerRe, inlineScript);
output = output.replace(buildDateMarkerRe, buildDate);

// 5. Write
writeFileSync(outputPath, output, "utf8");

const totalKb = (Buffer.byteLength(output, "utf8") / 1024).toFixed(1);
const bundleKb = (Buffer.byteLength(bundleCode, "utf8") / 1024).toFixed(1);
console.log(
  `build-tool-page: wrote docs/tools/index.html ` +
    `(${totalKb} KB total, bundle ${bundleKb} KB, build date ${buildDate})`,
);
