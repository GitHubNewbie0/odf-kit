/**
 * docs/tools/serialize-page.ts
 *
 * Produces a standalone, self-contained HTML string of the tool page for
 * the "Click here to download converter to your computer." trust-artifact
 * feature (C3b). The saved file works fully offline because the build
 * pipeline already inlines all CSS and JS into the live page — the
 * serialize step is reading what's already there, not gathering or
 * inlining anything new.
 *
 * Architecture:
 *
 *   - serializePage operates on a CLONE of the document, not the live
 *     DOM. The live page is never mutated. The user clicks Save-page
 *     mid-conversation, the file lands in Downloads, and the page they
 *     were working on stays exactly as it was — current input, current
 *     output, current button states, everything.
 *
 *   - The clone is reset to State A before serialization (input/output
 *     panes returned to their empty-state placeholders, action buttons
 *     re-disabled, any open dialog removed) so the saved file opens in
 *     a clean state. The user explicitly chose to save the tool, not
 *     mid-work state.
 *
 *   - buildSavePageFilename composes the filename from the library
 *     version (passed in by the caller, read from the odf-kit/odt
 *     VERSION export at click time) and the build date (read from the
 *     <meta name="build-date"> tag set by build-tool-page.js). Format:
 *     odf-kit-tool-[VERSION]-[BUILD_DATE].html — e.g.
 *     odf-kit-tool-0.13.4-2026-05-15.html. VERSION gives precision;
 *     BUILD_DATE gives an at-a-glance sense of how old the snapshot is.
 *
 * Both exports are pure functions. No DOM mutation of the live page,
 * no network calls, no side effects. Testable in node Jest with jsdom
 * (or a hand-rolled minimal Document mock; the function only uses a
 * small surface of the DOM API).
 */

import {
  INPUT_PANE_PLACEHOLDER_HTML,
  OUTPUT_PANE_PLACEHOLDER_HTML,
} from "./state-a-placeholders.js";

/**
 * Serialize a fully self-contained HTML snapshot of the page. Returns
 * the HTML string with a leading `<!doctype html>` declaration.
 *
 * The input document is NOT mutated. Internally, the document element
 * is cloned (deep), transient state is stripped from the clone, and
 * the clone's outerHTML is returned.
 *
 * Transient-state stripping on the clone:
 *
 *   1. Any open <dialog> is removed (the user shouldn't open the saved
 *      file mid-popup; the dialog would be visible behind the modal
 *      backdrop on load, or worse, would not be dismissable).
 *
 *   2. The input pane (#inputPane) is reset to its State A placeholder
 *      ('<div class="io-pane-empty">Select an input method above</div>').
 *
 *   3. The output pane (#outputPane) is reset to its State A placeholder
 *      ('<div class="io-pane-empty">Output will appear here after
 *      Generate</div>').
 *
 *   4. The four action buttons (#generateBtn, #saveBtn, #clearBtn,
 *      #saveAndClearBtn) are re-disabled. The Save-page button itself
 *      (#savePageBtn) and the About button (#aboutBtn) stay enabled —
 *      they work in every state.
 *
 *   5. The hidden file input (#fileInput) is kept as-is; it's
 *      structural, not transient state.
 */
export function serializePage(doc: Document): string {
  const cloneRoot = doc.documentElement.cloneNode(true) as HTMLElement;
  resetToStateA(cloneRoot);
  return `<!doctype html>\n${cloneRoot.outerHTML}`;
}

/**
 * Build the filename for the saved snapshot.
 *
 * libVersion is the odf-kit library version (e.g. "0.13.4"); buildDate
 * is the ISO YYYY-MM-DD date the page was built (e.g. "2026-05-15").
 * Both values come from outside this module — the caller reads them
 * from VERSION (odf-kit/odt export) and from the build-date <meta>
 * tag respectively.
 *
 * The function is a one-liner today but lives as a named export so
 * (a) tests can assert the format independently of the click handler,
 * and (b) future format changes (if any) have one place to land.
 */
export function buildSavePageFilename(libVersion: string, buildDate: string): string {
  return `odf-kit-tool-${libVersion}-${buildDate}.html`;
}

/**
 * Reset the cloned document root to State A. Internal helper for
 * serializePage. Operates on the clone only; never called on the live
 * DOM. Uses defensive null checks because the clone is being treated
 * as untrusted input — if some element is missing for any reason
 * (markup change in the template, partial clone failure), we silently
 * skip rather than throwing, on the principle that a slightly
 * imperfect saved snapshot is better than a save that fails outright.
 */
function resetToStateA(root: HTMLElement): void {
  const removeOpenDialogs = (el: HTMLElement): void => {
    const dialogs = el.querySelectorAll("dialog[open]");
    dialogs.forEach((d) => d.removeAttribute("open"));
  };
  removeOpenDialogs(root);

  const inputPane = root.querySelector("#inputPane");
  if (inputPane) {
    inputPane.innerHTML = INPUT_PANE_PLACEHOLDER_HTML;
  }

  const outputPane = root.querySelector("#outputPane");
  if (outputPane) {
    outputPane.innerHTML = OUTPUT_PANE_PLACEHOLDER_HTML;
  }

  const actionButtonIds = ["generateBtn", "saveBtn", "clearBtn", "saveAndClearBtn"];
  for (const id of actionButtonIds) {
    const btn = root.querySelector<HTMLButtonElement>(`#${id}`);
    if (btn) {
      btn.disabled = true;
    }
  }
}
