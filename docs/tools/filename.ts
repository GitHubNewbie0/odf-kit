// docs/tools/filename.ts
//
// Pure string utilities for parsing input filenames and constructing
// output filenames. No DOM, no library imports, no side effects — this
// module is purely synchronous string logic.
//
// Two consumer regions:
//   - File-loading helpers in index.ui.ts call parseFilename() to validate
//     uploaded filenames and pick the input format from the extension.
//   - convertOne() in conversion.ts calls buildOutputFilename() to name the
//     file that Save will download.
//
// OutputFormat is defined here (rather than in conversion.ts) so this
// module has zero imports — it sits at the bottom of the docs/tools/
// dependency graph. conversion.ts re-exports the type so callers
// conceptually get it from where it logically belongs (conversion).

/**
 * Output formats the page produces. ODT and ODS are the OpenDocument targets;
 * HTML / Markdown / Typst are the text-format targets reached by going
 * "back out" of an ODT input (via odtToHtml / odtToMarkdown / odtToTypst).
 * PDF is NOT in this union — PDF generation lives on the standalone
 * odt-to-pdf.html page (Typst-mediated, external compile step).
 */
export type OutputFormat = "odt" | "ods" | "html" | "markdown" | "typst";

/**
 * Result of parsing a filename. The `ok: true` branch carries the case-preserved
 * stem and the lowercased extension; the `ok: false` branch carries a reason
 * that the caller maps to a specific error popup.
 */
export type ParsedFilename =
  { ok: true; stem: string; ext: string } | { ok: false; reason: "no-extension" | "empty-stem" };

/**
 * Split a filename on the LAST dot. Extension is lowercased for matching;
 * stem retains the original case for output naming. Reports a specific
 * failure reason for two cases the caller will surface as distinct errors:
 *   - "no-extension"  — no dot at all, OR ends with a dot (e.g. "file.")
 *   - "empty-stem"    — starts with a dot (e.g. ".gitignore")
 */
export function parseFilename(name: string): ParsedFilename {
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1) return { ok: false, reason: "no-extension" };
  const stem = name.slice(0, lastDot);
  const ext = name.slice(lastDot + 1).toLowerCase();
  if (ext === "") return { ok: false, reason: "no-extension" };
  if (stem === "") return { ok: false, reason: "empty-stem" };
  return { ok: true, stem, ext };
}

/**
 * Map an OutputFormat to its file extension (no leading dot). Single source
 * of truth for the output-format → extension mapping; used by
 * buildOutputFilename below and any future Save logic that needs a MIME
 * hint independent of the filename.
 */
export function outputExtension(outputFormat: OutputFormat): string {
  switch (outputFormat) {
    case "odt":
      return "odt";
    case "ods":
      return "ods";
    case "html":
      return "html";
    case "markdown":
      return "md";
    case "typst":
      return "typ";
  }
}

/**
 * Build the output filename from the input filename and output format.
 *
 *   - Filename has an extension (e.g. "report.html"):  stem + new ext
 *   - Filename has no extension (e.g. "Document"):     whole string + new ext
 *
 * The second case is reached by keyboard input, where onKeyboardClick sets
 * inputFilename to "Document" with no extension. parseFilename treats that
 * as a failure ({ok: false, reason: "no-extension"}) because it's an error
 * for the file-loading flow; here it's the expected "use the whole string
 * as the stem" case, so we fall back to the raw string.
 *
 * Empty-stem files (e.g. ".gitignore") are rejected by file loading before
 * they ever reach this function — file loading surfaces them via showError
 * and refuses to transition to State B. So an empty-stem inputFilename
 * shouldn't be possible here, but if it ever is we fall back to the whole
 * string and produce something like ".gitignore.odt" rather than throwing.
 * Defensive, not exhaustive.
 */
export function buildOutputFilename(inputFilename: string, outputFormat: OutputFormat): string {
  const parsed = parseFilename(inputFilename);
  const stem = parsed.ok ? parsed.stem : inputFilename;
  return `${stem}.${outputExtension(outputFormat)}`;
}
