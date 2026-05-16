/**
 * docs/tools/state-a-placeholders.ts
 *
 * Shared State A placeholder strings for the input and output panes.
 * Imported by:
 *
 *   - index.ui.ts (renders these strings when transitioning to State A
 *     via setPaneEmpty).
 *   - serialize-page.ts (resets the cloned DOM to State A before
 *     serializing the saved snapshot, so the saved file opens in a
 *     clean state regardless of what was in the panes when the user
 *     clicked Save-page).
 *
 * NOTE ON DUPLICATION WITH THE TEMPLATE:
 *
 * The same two HTML strings appear inline in docs/tools/index.template.html
 * (the initial DOM state when the page first loads). The template can't
 * import TypeScript at build time, so it duplicates these strings rather
 * than substituting from this module. A comment in the template flags the
 * link. If you ever edit a placeholder string here, update the template
 * too — and vice versa.
 *
 * The pane-empty div class name (`io-pane-empty`) is also duplicated in
 * index.ui.ts's setPaneEmpty function (which builds the same div
 * programmatically rather than via this string). That third occurrence is
 * structural (a function building DOM elements), not textual, and isn't
 * worth folding into this module — but it's worth noting so the dedup
 * picture is complete.
 */

export const INPUT_PANE_PLACEHOLDER_HTML =
  '<div class="io-pane-empty">Select an input method above</div>';

export const OUTPUT_PANE_PLACEHOLDER_HTML =
  '<div class="io-pane-empty">Output will appear here after Generate</div>';

/**
 * The text content of the placeholder divs, without the wrapping HTML.
 * Used by index.ui.ts's setPaneEmpty function, which builds the div
 * element programmatically and only needs the inner text.
 */
export const INPUT_PANE_PLACEHOLDER_TEXT = "Select an input method above";

export const OUTPUT_PANE_PLACEHOLDER_TEXT = "Output will appear here after Generate";
