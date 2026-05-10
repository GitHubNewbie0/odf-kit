// docs/tools/index.ui.ts
//
// Source of truth for the unified tool page's UI logic. Compiled and bundled
// into docs/tools/index.html by scripts/build-tool-page.js.
// See unified-tool-design-v2.md for the full design.

import { VERSION } from "odf-kit/odt";

const helloEl = document.getElementById("hello");
if (helloEl) {
  helloEl.textContent = `odf-kit ${VERSION} — UI scaffolding loaded.`;
}

console.log(`odf-kit unified tool page — v${VERSION}`);
