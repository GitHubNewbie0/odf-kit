// docs/tools/disclosure.ts
//
// The output-pane disclosure footer has two text states. "Fresh" is the
// default honest-preview note shown whenever State C output is in sync with
// the input. "Stale" replaces it the moment the user edits the input after a
// successful Generate, reminding them the preview no longer reflects the
// current input. Saving still works on the stale output bytes — the footer is
// a reminder, not a lock (see ensureOutputDisclosure in index.ui.ts, and the
// .is-stale rule in index.template.html for the amber treatment).
//
// The strings and the message-selection logic live here, isolated from the
// DOM, so they can be unit-tested in node without a DOM environment — matching
// the project's pure-logic-in-node / DOM-glue-smoke-tested posture (same
// reason buildSaveBlob and parseFilename are factored out of index.ui.ts).
//
// index.template.html duplicates these two strings in an HTML comment for
// documentation; keep both in sync if the wording ever changes.

export const DISCLOSURE_FRESH = "Preview is rendered approximately. The saved file is exact.";

export const DISCLOSURE_STALE = "Stale — click Generate to refresh.";

/**
 * The disclosure-footer message for the given staleness. Fresh when the
 * output is in sync with the input; the stale reminder once the input has
 * been edited after Generate.
 */
export function disclosureMessage(isStale: boolean): string {
  return isStale ? DISCLOSURE_STALE : DISCLOSURE_FRESH;
}
