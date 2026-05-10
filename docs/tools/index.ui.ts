// docs/tools/index.ui.ts
//
// Source of truth for the unified tool page's UI logic. Compiled and bundled
// into docs/tools/index.html by scripts/build-tool-page.js.
// See unified-tool-design-v2.md for the full design.
//
// Current scope: skeleton verification only. Confirms every expected DOM element
// is present so that subsequent passes can wire behavior without first re-checking
// the markup. No event handlers, no state machine, no conversion logic yet — those
// arrive in subsequent commits.

import { VERSION } from "odf-kit/odt";

// Expected DOM element IDs. If any go missing, the markup has drifted from
// what the UI code expects, and we want to know loudly at page-load time
// rather than discover it via a silent null-reference deep in event handling.
const EXPECTED_ELEMENT_IDS = [
  // Nav
  "aboutBtn",
  // Three input-method buttons
  "browseBtn",
  "sampleBtn",
  "keyboardBtn",
  // Two panes
  "inputPane",
  "outputPane",
  // Four action buttons
  "generateBtn",
  "saveBtn",
  "clearBtn",
  "saveAndClearBtn",
] as const;

const missing: string[] = [];
for (const id of EXPECTED_ELEMENT_IDS) {
  if (!document.getElementById(id)) {
    missing.push(id);
  }
}

if (missing.length > 0) {
  console.error(`odf-kit unified tool page: missing expected DOM elements: ${missing.join(", ")}`);
} else {
  console.log(
    `odf-kit unified tool page — v${VERSION} — skeleton verified ` +
      `(${EXPECTED_ELEMENT_IDS.length} elements present, no behavior wired yet).`,
  );
}
