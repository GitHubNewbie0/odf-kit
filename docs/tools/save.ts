/**
 * docs/tools/save.ts
 *
 * Save logic for the unified tool page. Two responsibilities, kept
 * separate so the pure part is unit-testable in node Jest and the
 * DOM-glue part is a thin wrapper around standard browser APIs:
 *
 *  - `buildSaveBlob` (pure): takes a ConversionResult and returns a
 *    Blob plus the filename to attach to the download. Maps each
 *    OutputFormat to its appropriate MIME type via an internal table.
 *    No DOM, no side effects.
 *
 *  - `triggerDownload` (DOM-only): creates an object URL, triggers a
 *    browser download via a programmatic anchor click, then revokes
 *    the URL on the next event-loop tick. Not unit-tested (would
 *    require jsdom for one trivial test); verified by manual
 *    smoke-test on the local server.
 *
 * Consumed by `index.ui.ts` for both the Save and Save-and-Clear
 * button handlers. State management and user-facing feedback (success
 * popups, state transitions, error popups) are the caller's concern.
 * This module is purely "result -> file in Downloads."
 *
 * Note on type shape: ConversionResult is imported from conversion.ts
 * (C2). The discriminated union has `kind: "bytes"` or `kind: "text"`,
 * with `outputFilename` and `outputFormat` on both variants, plus
 * `bytes: Uint8Array` on the bytes variant and `text: string` on the
 * text variant. If the actual property names in conversion.ts differ,
 * adjust the destructure in `buildSaveBlob` accordingly.
 */

import type { ConversionResult, OutputFormat } from "./conversion.js";

/**
 * MIME type for each supported output format.
 *
 * - ODT and ODS: standard OASIS OpenDocument media types.
 * - HTML and Markdown: registered text media types.
 * - Typst: no registered IANA media type; `text/plain` is the safe
 *   choice (browsers and text editors accept it without quirks).
 */
const MIME_BY_FORMAT: Record<OutputFormat, string> = {
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  html: "text/html",
  markdown: "text/markdown",
  typst: "text/plain",
};

/**
 * Construct a Blob and accompanying filename from a conversion result.
 *
 * Pure function. Returns `{ blob, filename }` suitable for handing to
 * `triggerDownload` or to a unit test.
 *
 * The Blob's MIME type is derived from `result.outputFormat` via the
 * MIME_BY_FORMAT table. The filename is passed through verbatim from
 * `result.outputFilename` (constructed inside `runConversion` in C2).
 */
export function buildSaveBlob(result: ConversionResult): {
  blob: Blob;
  filename: string;
} {
  const mime = MIME_BY_FORMAT[result.outputFormat];
  const blob =
    result.kind === "bytes"
      ? new Blob([result.bytes], { type: mime })
      : new Blob([result.text], { type: mime });
  return { blob, filename: result.outputFilename };
}

/**
 * Trigger a browser download for `blob` with the given `filename`.
 *
 * Uses the standard object-URL + programmatic anchor-click pattern.
 * The URL is revoked via `setTimeout(..., 0)` rather than synchronously
 * because synchronous revoke can race with the browser's download
 * initiation in some implementations, occasionally leaving the
 * download stalled. Deferring by one event-loop tick is the
 * well-established safe idiom.
 *
 * No return value. The caller is responsible for any user-facing
 * feedback (success popup, state transitions, etc.).
 *
 * Throws only if the browser's blob/URL APIs themselves throw, which
 * is rare and typically indicates extreme memory pressure or a
 * disabled API. The caller should wrap calls in try/catch and route
 * any error through `showError`.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
