// docs/tools/conversion.ts
//
// The single UI ↔ odf-kit seam for the unified tool page. The click handler
// in index.ui.ts builds a ConversionInput[] (one element today, multiple in
// Phase 1b batch processing), picks an OutputFormat, and calls
// runConversion. The function dispatches by the (inputFormat, outputFormat)
// pair to the matching library call, constructs the output filename via
// filename.ts, and returns a ConversionResult[]. State C rendering reads the
// result; the click handler does not need to know about library functions.
//
// Every (inputFormat, outputFormat) pair is enumerated as a case so the
// TypeScript compiler enforces exhaustiveness as new pathways are added.
// html→odt, markdown→odt, lexical→odt, and tiptap→odt are implemented (all
// four text→ODT pathways); the other six pairs throw
// "not yet implemented" or "unsupported pathway". Subsequent commits fan
// out to the remaining pathways one at a time.
//
// The function signature is array-in / array-out so Phase 1b (batch / State
// D) doesn't change call sites — only the loop body inside runConversion
// gets exercised on more inputs. Async because Phase 1b batch progress will
// emit between elements; the Promise return type leaves room for that
// without changing call sites. Today the implementation is synchronous
// inside (awaits on instant operations).
//
// ─────────────────────────────────────────────────────────────────────────────
// previewText: a UI concern that lives here
// ─────────────────────────────────────────────────────────────────────────────
//
// ConversionResult (bytes-kind) carries a previewText field — for bytes
// outputs (ODT, ODS), the round-tripped HTML or HTML-equivalent string the
// UI displays in the output pane's read-only textarea. This couples this
// module to a UI concern: a non-UI consumer (e.g., a CLI) would have no use
// for previewText and would pay the round-trip cost unnecessarily.
//
// We accept the leak because (a) every pathway in the page uses previewText
// so the alternative of caching it in the UI layer just moves the same
// complexity elsewhere; (b) the round-trip cost is uniformly modest;
// (c) future non-UI consumers can be served by an opt-out option without
// restructuring the module.

import { htmlToOdt, markdownToOdt, tiptapToOdt } from "odf-kit/odt";
import { lexicalToOdt } from "odf-kit/lexical";
import { odtToHtml } from "odf-kit/reader";
import { buildOutputFilename, type OutputFormat } from "./filename.js";

// Re-export OutputFormat so callers of this module get it from the
// conceptually-right place ("the conversion module's output format") rather
// than reaching into filename.ts directly. filename.ts is the canonical
// definition (it sits at the bottom of the dependency graph with zero
// imports); this is just sugar for downstream consumers.
export type { OutputFormat };

/**
 * A single conversion request. Discriminated by inputFormat so each branch
 * carries only the data shape that input format actually needs:
 *   - Text inputs (html, markdown, lexical, tiptap) carry a UTF-8 string.
 *   - Binary inputs (docx, xlsx, odt, ods) carry raw bytes.
 *
 * inputFilename is the source filename: a real file's name when loaded via
 * Browse, the sample's filename when loaded via Sample, or "Document" when
 * the user typed input directly. Used to construct the output filename.
 *
 * Phase 1a always builds a one-element array. Phase 1b will pass multiple
 * inputs. The function shape doesn't change.
 */
export type ConversionInput =
  | { inputFormat: "html"; text: string; inputFilename: string }
  | { inputFormat: "markdown"; text: string; inputFilename: string }
  | { inputFormat: "lexical"; text: string; inputFilename: string }
  | { inputFormat: "tiptap"; text: string; inputFilename: string }
  | { inputFormat: "docx"; bytes: Uint8Array; inputFilename: string }
  | { inputFormat: "xlsx"; bytes: Uint8Array; inputFilename: string }
  | { inputFormat: "odt"; bytes: Uint8Array; inputFilename: string }
  | { inputFormat: "ods"; bytes: Uint8Array; inputFilename: string };

/**
 * A single conversion result. Discriminated by kind so the rendering layer
 * can switch on it cleanly:
 *
 *   - "bytes" for ODT / ODS outputs (binary, saved as-is via Blob; preview
 *     round-trips through the matching reader to produce HTML source string
 *     for the read-only output textarea). The previewText field carries the
 *     round-tripped string, computed once at conversion time so re-renders
 *     don't re-run the reader.
 *
 *   - "text" for HTML / Markdown / Typst outputs (UTF-8 string, saved via
 *     Blob with the appropriate MIME type; the same string is what the
 *     output textarea shows directly — no separate preview needed).
 *
 * The outputFilename is the name the saved file should have — stem from the
 * input filename, extension from the output format. Constructed via
 * filename.ts so the click handler doesn't need to know the input-format
 * → output-extension mapping.
 */
export type ConversionResult =
  | {
      kind: "bytes";
      outputFormat: "odt" | "ods";
      bytes: Uint8Array;
      /**
       * HTML source string produced by round-tripping the bytes through the
       * matching reader (odtToHtml for ODT, odsToHtml for ODS). The UI
       * displays this in the read-only output textarea. Computed at
       * conversion time so renders don't re-run the reader.
       */
      previewText: string;
      outputFilename: string;
    }
  | {
      kind: "text";
      outputFormat: "html" | "markdown" | "typst";
      text: string;
      outputFilename: string;
    };

/**
 * Convert one or more inputs to the chosen output format. Phase 1a always
 * passes a one-element array; Phase 1b passes multiple. The function shape
 * doesn't change between phases.
 *
 * Errors from the underlying library calls propagate as Error instances;
 * the caller (onGenerateClick in index.ui.ts) catches them and surfaces
 * them via showError. runConversion itself does not touch the UI.
 *
 * Async because Phase 1b batch progress will emit between elements; the
 * Promise return type leaves room for that without changing call sites.
 * Today the implementation is synchronous inside.
 */
export async function runConversion(
  inputs: ConversionInput[],
  outputFormat: OutputFormat,
): Promise<ConversionResult[]> {
  const results: ConversionResult[] = [];
  for (const input of inputs) {
    results.push(await convertOne(input, outputFormat));
  }
  return results;
}

/**
 * Convert a single input. Pulled out of runConversion's loop so the
 * dispatch table is one straight switch per input format, each nesting a
 * switch on output format. Reads top-to-bottom as a coverage matrix of
 * the ten (input → output) pairs the page supports:
 *
 *     html     → odt      ✓ (C2)
 *     markdown → odt      ✓ (C5)
 *     lexical  → odt      ✓ (C6)
 *     tiptap   → odt      ✓ (C7)
 *     docx     → odt      throw "not yet implemented"
 *     xlsx     → ods      throw "not yet implemented"
 *     odt      → html     throw "not yet implemented"
 *     odt      → markdown throw "not yet implemented"
 *     odt      → typst    throw "not yet implemented"
 *     ods      → html     throw "not yet implemented"
 *
 * Every other (input, output) combination is genuinely unsupported (e.g.
 * html → typst makes no sense for this page) and throws "unsupported
 * pathway". The distinction matters: "not yet implemented" is a TODO for
 * a future commit; "unsupported pathway" is a permanent shape boundary.
 *
 * Async because some library functions (notably htmlToOdt and likely the
 * other *ToOdt builders) are async. Subsequent commits replace the "not
 * yet implemented" throws with real library calls one pathway at a time.
 * The exhaustive switch ensures the compiler refuses to forget a pair
 * when InputFormat or OutputFormat grows.
 */
async function convertOne(
  input: ConversionInput,
  outputFormat: OutputFormat,
): Promise<ConversionResult> {
  switch (input.inputFormat) {
    case "html":
      switch (outputFormat) {
        case "odt": {
          const bytes = await htmlToOdt(input.text);
          const previewText = odtToHtml(bytes);
          return {
            kind: "bytes",
            outputFormat: "odt",
            bytes,
            previewText,
            outputFilename: buildOutputFilename(input.inputFilename, "odt"),
          };
        }
        case "ods":
        case "html":
        case "markdown":
        case "typst":
          throw new Error(`unsupported pathway: html→${outputFormat}`);
      }
      break;
    case "markdown":
      switch (outputFormat) {
        case "odt": {
          const bytes = await markdownToOdt(input.text);
          const previewText = odtToHtml(bytes);
          return {
            kind: "bytes",
            outputFormat: "odt",
            bytes,
            previewText,
            outputFilename: buildOutputFilename(input.inputFilename, "odt"),
          };
        }
        case "ods":
        case "html":
        case "markdown":
        case "typst":
          throw new Error(`unsupported pathway: markdown→${outputFormat}`);
      }
      break;
    case "lexical":
      switch (outputFormat) {
        case "odt": {
          // lexicalToOdt takes a parsed SerializedEditorState object, not a
          // string (unlike htmlToOdt/markdownToOdt). The input text was
          // already validated as parseable JSON at load time (detectJsonFormat
          // parses it to disambiguate Lexical vs TipTap and rejects anything
          // else with an error popup), so a parse failure here would be an
          // internal inconsistency; we let it throw and propagate as an Error
          // via runConversion's contract. JSON.parse returns `any`; the value
          // flows into lexicalToOdt's typed parameter (if lint flags
          // no-unsafe-argument, cast it: `as LexicalSerializedEditorState`,
          // importing the type from "odf-kit/lexical").
          const editorState = JSON.parse(input.text);
          const bytes = await lexicalToOdt(editorState);
          const previewText = odtToHtml(bytes);
          return {
            kind: "bytes",
            outputFormat: "odt",
            bytes,
            previewText,
            outputFilename: buildOutputFilename(input.inputFilename, "odt"),
          };
        }
        case "ods":
        case "html":
        case "markdown":
        case "typst":
          throw new Error(`unsupported pathway: lexical→${outputFormat}`);
      }
      break;
    case "tiptap":
      switch (outputFormat) {
        case "odt": {
          // tiptapToOdt takes a parsed TipTap JSONContent object (type "doc"),
          // not a string — same shape as the lexical case. The input text was
          // already validated as parseable JSON at load time (detectJsonFormat
          // parses it to disambiguate Lexical vs TipTap), so the parse is
          // unwrapped and any failure propagates as an Error via runConversion.
          const json = JSON.parse(input.text);
          const bytes = await tiptapToOdt(json);
          const previewText = odtToHtml(bytes);
          return {
            kind: "bytes",
            outputFormat: "odt",
            bytes,
            previewText,
            outputFilename: buildOutputFilename(input.inputFilename, "odt"),
          };
        }
        case "ods":
        case "html":
        case "markdown":
        case "typst":
          throw new Error(`unsupported pathway: tiptap→${outputFormat}`);
      }
      break;
    case "docx":
      switch (outputFormat) {
        case "odt":
          throw new Error("not yet implemented: docx→odt");
        case "ods":
        case "html":
        case "markdown":
        case "typst":
          throw new Error(`unsupported pathway: docx→${outputFormat}`);
      }
      break;
    case "xlsx":
      switch (outputFormat) {
        case "ods":
          throw new Error("not yet implemented: xlsx→ods");
        case "odt":
        case "html":
        case "markdown":
        case "typst":
          throw new Error(`unsupported pathway: xlsx→${outputFormat}`);
      }
      break;
    case "odt":
      switch (outputFormat) {
        case "html":
          throw new Error("not yet implemented: odt→html");
        case "markdown":
          throw new Error("not yet implemented: odt→markdown");
        case "typst":
          throw new Error("not yet implemented: odt→typst");
        case "odt":
        case "ods":
          throw new Error(`unsupported pathway: odt→${outputFormat}`);
      }
      break;
    case "ods":
      switch (outputFormat) {
        case "html":
          throw new Error("not yet implemented: ods→html");
        case "odt":
        case "ods":
        case "markdown":
        case "typst":
          throw new Error(`unsupported pathway: ods→${outputFormat}`);
      }
      break;
  }

  // Unreachable in well-formed dispatch: every branch above either returns
  // or throws. This line exists so the function's declared return type is
  // satisfied. If execution ever reaches it, an inner switch was made
  // non-exhaustive — runtime error will name the offending pair.
  throw new Error(`unreachable: unhandled conversion (${input.inputFormat} → ${outputFormat})`);
}
