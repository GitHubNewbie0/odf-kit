// docs/tools/index.ui.ts
//
// Source of truth for the unified tool page's UI logic. Compiled and bundled
// into docs/tools/index.html by scripts/build-tool-page.js.
// See unified-tool-design-v2.md for the full design.
//
// Current scope: state machine (States A, B, C) + reusable popup infrastructure
// + sample loading + Browse-to-File for text formats + About popup + HTML→ODT
// conversion end-to-end (vertical slice).
//   - Three input methods all wired:
//       Type Keyboard Input — fully functional with format-selector popup
//       Load Sample File — fully functional with sample-selector popup,
//                          loads a hardcoded sample document for the chosen format
//       Browse to File — fully functional for text formats (HTML, Markdown,
//                        Lexical JSON, TipTap JSON). Binary formats (DOCX,
//                        XLSX, ODT, ODS) emit a "not yet supported" error
//                        popup and stay in State A. JSON files are
//                        disambiguated by inspecting their parsed structure.
//   - About button — fully functional, shows About popup with pathway list,
//                    trust language, and identity/provenance.
//   - Clear fully functional (returns to State A)
//   - Generate: HTML→ODT wired end-to-end. Other pathways still throw "not
//     yet implemented" inside runConversion and surface via showError;
//     subsequent commits fan out one pathway at a time.
//   - Save / Save-and-Clear: still no-op placeholders (C3 wires them).
//   - Three popup primitives (deliberately explicit, not overloaded):
//       showPopup() — selector popups (title + optional body + options list)
//       showError() — error popups (title + message + single OK)
//       showAbout() — About popup (rich DOM body + single Close)
//     (showInfo, an alias around showPopup for success/neutral info, lands
//     in C3 when Save uses it.)
//   - State C now reachable via Generate from HTML input. Output pane
//     renders the round-tripped ODT preview as a visual page in a
//     sandboxed iframe via odtToHtml's HTML output (per the rendering
//     table in unified-tool-design-v2). The sticky disclosure footer
//     tells users "Preview is rendered approximately. The saved file
//     is exact." since the iframe shows an HTML approximation of the
//     ODT document, not the ODT itself.
//   - Trust popup on first visit — later.
//
// Architecture notes:
//   - Conversion logic lives in conversion.ts (UI ↔ library seam) and
//     filename.ts (pure string utilities). index.ui.ts handles the DOM,
//     event wiring, and state transitions; it imports from those two
//     modules but contains no library calls of its own.
//   - render() is a coordinator over three diff-aware sub-renderers
//     (renderInputPane, renderOutputPane, renderButtons). Each is
//     idempotent and looks at the current DOM before deciding what to
//     change. Mounted textareas survive transitions: cursor/scroll/focus/
//     selection in the input textarea persist across B→C and C→C
//     transitions; output-textarea selection survives stale-flag flips.
//   - Generate uses an appear-threshold + minimum-display pattern for the
//     "Generating..." indicator: timer set at 200ms, minimum on-screen
//     time 400ms once shown. Avoids the flash on fast conversions and the
//     flash on barely-over-threshold conversions. Inline in onGenerateClick
//     for now; factor out if a second site needs the same pattern.
//
// Samples: harvested from existing tool pages (HTML, Lexical) and test fixtures
// (Markdown, TipTap). All four are parallel "Meeting Notes" content for easy
// cross-format comparison. Hardcoded here for this commit; build-time inlining
// of real sample files and binary-format samples (DOCX/XLSX/ODT/ODS) deferred
// to a later commit.

import { VERSION } from "odf-kit/odt";
import {
  type ConversionInput,
  type ConversionResult,
  type OutputFormat,
  runConversion,
} from "./conversion.js";
import { parseFilename } from "./filename.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Input formats the page accepts. */
type InputFormat = "html" | "markdown" | "lexical" | "tiptap" | "docx" | "xlsx" | "odt" | "ods";

/**
 * Page state. Discriminated union: each state carries only the data relevant
 * to that state, so e.g. there's no way to access output content while in B.
 *
 * State C scaffolding is present in the type system this commit, but no user
 * action transitions to it yet. C2 wires the first path (HTML → ODT).
 */
type AppState =
  | { state: "A" }
  | {
      state: "B";
      inputFormat: InputFormat;
      /** Filename used for naming the eventual saved output. */
      inputFilename: string;
      /**
       * Whether the input is text (in which case it's editable in the textarea)
       * or binary (file bytes loaded; not editable, will preview later).
       * This commit: only "text" is reachable, since binary file selection is
       * intercepted by an error popup and the binary preview path is deferred.
       */
      inputKind: "text" | "binary";
      /** Text content for text-kind inputs. Empty string until user types. */
      inputText: string;
    }
  | {
      state: "C";
      // Input-side fields carried forward from B so the user can re-edit
      // and re-Generate without losing context.
      inputFormat: InputFormat;
      inputFilename: string;
      inputKind: "text" | "binary";
      inputText: string;
      // Output-side fields produced by Generate.
      outputFormat: OutputFormat;
      outputContent: ConversionResult;
      /**
       * Set when the user edits the input after a successful Generate; the
       * output textarea is then no longer in sync with the input. The sticky
       * disclosure footer in the output pane flips to the stale message; the
       * Save / Save-and-Clear buttons stay enabled (saving stale output is
       * not invalid — the user may have intended that snapshot). C4 wires
       * the visual indicator; this commit just tracks the flag.
       */
      isStale: boolean;
    };

// ─────────────────────────────────────────────────────────────────────────────
// Samples
// ─────────────────────────────────────────────────────────────────────────────
//
// Four sample documents — one per supported text input format — used by the
// Load Sample File button. All four are "Meeting Notes" content with parallel
// structure (heading, date, list/agenda, table or link), so a user picking
// different sample formats sees similar content rendered through each format.
//
// Sources (verbatim or near-verbatim):
//   - SAMPLE_HTML:     EXAMPLE_HTML from docs/tools/html-to-odt.html
//   - SAMPLE_MARKDOWN: "full markdown document" test in tests/markdown-to-odt.test.ts
//   - SAMPLE_LEXICAL:  SAMPLE from docs/tools/lexical-to-odt.html
//   - SAMPLE_TIPTAP:   "full realistic document" test in tests/tiptap-to-odt.test.ts

const SAMPLE_HTML = `<h1>Hello World</h1>

<p>This is an example showing what <strong>HTML to ODT</strong> can do.</p>

<h2>Supported elements</h2>
<ul>
  <li>Headings h1\u2013h6</li>
  <li>Bold, italic, underline, strikethrough</li>
  <li>Lists (ordered and unordered, nested)</li>
  <li>Tables with rows, cells, and headers</li>
  <li>Links and blockquotes</li>
  <li>Code blocks and inline <code>code</code></li>
</ul>

<h2>Sample table</h2>
<table>
  <tr><th>Name</th><th>Score</th><th>Notes</th></tr>
  <tr><td>Alice</td><td>98</td><td>Top of the class</td></tr>
  <tr><td>Bob</td><td>87</td><td>Solid effort</td></tr>
  <tr><td>Carol</td><td>92</td><td>Honor roll</td></tr>
</table>

<blockquote>
  ODT is the only ISO-standardized document format (ISO/IEC 26300).
</blockquote>

<p>Generate the file to see how this content becomes a valid <code>.odt</code> document.</p>`;

const SAMPLE_MARKDOWN = `# Meeting Notes

**Date:** April 9, 2026

## Agenda

1. Project status
2. Budget review
3. Next steps

## Action Items

| Owner | Task | Due |
|-------|------|-----|
| Alice | Send report | Friday |
| Bob | Review budget | Monday |

See [odf-kit](https://github.com/GitHubNewbie0/odf-kit) for details.`;

const SAMPLE_LEXICAL = JSON.stringify(
  {
    root: {
      children: [
        {
          type: "heading",
          tag: "h1",
          format: "",
          indent: 0,
          direction: "ltr",
          version: 1,
          children: [
            {
              type: "text",
              text: "Meeting Notes",
              format: 0,
              style: "",
              mode: "normal",
              detail: 0,
              version: 1,
            },
          ],
        },
        {
          type: "paragraph",
          format: "",
          indent: 0,
          direction: "ltr",
          version: 1,
          children: [
            {
              type: "text",
              text: "Date: ",
              format: 0,
              style: "",
              mode: "normal",
              detail: 0,
              version: 1,
            },
            {
              type: "text",
              text: "April 18, 2026",
              format: 1,
              style: "",
              mode: "normal",
              detail: 0,
              version: 1,
            },
          ],
        },
        {
          type: "heading",
          tag: "h2",
          format: "",
          indent: 0,
          direction: "ltr",
          version: 1,
          children: [
            {
              type: "text",
              text: "Action Items",
              format: 0,
              style: "",
              mode: "normal",
              detail: 0,
              version: 1,
            },
          ],
        },
        {
          type: "list",
          listType: "bullet",
          start: 1,
          direction: "ltr",
          version: 1,
          children: [
            {
              type: "listitem",
              value: 1,
              indent: 0,
              direction: "ltr",
              version: 1,
              children: [
                {
                  type: "text",
                  text: "Send report by Friday",
                  format: 0,
                  style: "",
                  mode: "normal",
                  detail: 0,
                  version: 1,
                },
              ],
            },
            {
              type: "listitem",
              value: 2,
              indent: 0,
              direction: "ltr",
              version: 1,
              children: [
                {
                  type: "text",
                  text: "Review budget on Monday",
                  format: 0,
                  style: "",
                  mode: "normal",
                  detail: 0,
                  version: 1,
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          format: "",
          indent: 0,
          direction: "ltr",
          version: 1,
          children: [
            {
              type: "text",
              text: "See ",
              format: 0,
              style: "",
              mode: "normal",
              detail: 0,
              version: 1,
            },
            {
              type: "link",
              url: "https://github.com/GitHubNewbie0/odf-kit",
              direction: "ltr",
              format: "",
              indent: 0,
              version: 1,
              children: [
                {
                  type: "text",
                  text: "odf-kit on GitHub",
                  format: 0,
                  style: "",
                  mode: "normal",
                  detail: 0,
                  version: 1,
                },
              ],
            },
            {
              type: "text",
              text: " for more.",
              format: 0,
              style: "",
              mode: "normal",
              detail: 0,
              version: 1,
            },
          ],
        },
      ],
      direction: "ltr",
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  },
  null,
  2,
);

const SAMPLE_TIPTAP = JSON.stringify(
  {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Meeting Notes" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Date: " },
          { type: "text", text: "April 9, 2026", marks: [{ type: "bold" }] },
        ],
      },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Agenda" }] },
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Project status" }] }],
          },
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Budget review" }] }],
          },
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Next steps" }] }],
          },
        ],
      },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Action Items" }] },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Owner" }] }],
              },
              {
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Task" }] }],
              },
              {
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Due" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Alice" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Send report" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Friday" }] }],
              },
            ],
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "See " },
          {
            type: "text",
            text: "odf-kit",
            marks: [{ type: "link", attrs: { href: "https://github.com/GitHubNewbie0/odf-kit" } }],
          },
          { type: "text", text: " for details." },
        ],
      },
    ],
  },
  null,
  2,
);

// Lookup table: format value → sample content + filename used in State B
const SAMPLES: Record<
  "html" | "markdown" | "lexical" | "tiptap",
  { content: string; filename: string }
> = {
  html: { content: SAMPLE_HTML, filename: "sample_html.html" },
  markdown: { content: SAMPLE_MARKDOWN, filename: "sample_md.md" },
  lexical: { content: SAMPLE_LEXICAL, filename: "sample_lexical.json" },
  tiptap: { content: SAMPLE_TIPTAP, filename: "sample_tiptap.json" },
};

// ─────────────────────────────────────────────────────────────────────────────
// DOM references
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cached element references. Looked up once at module load so transitions
 * don't pay the getElementById cost every time. If any are missing, we fail
 * loudly at startup before wiring any handlers.
 */
type Elements = {
  // Nav
  aboutBtn: HTMLButtonElement;
  // Three input-method buttons
  browseBtn: HTMLButtonElement;
  sampleBtn: HTMLButtonElement;
  keyboardBtn: HTMLButtonElement;
  // Hidden file input — clicked programmatically by Browse to open native picker
  fileInput: HTMLInputElement;
  // Two panes
  inputPane: HTMLDivElement;
  outputPane: HTMLDivElement;
  // Four action buttons
  generateBtn: HTMLButtonElement;
  saveBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  saveAndClearBtn: HTMLButtonElement;
  // Popup (modal dialog) — reused for all popups via showPopup()
  popup: HTMLDialogElement;
  popupTitle: HTMLHeadingElement;
  popupBody: HTMLDivElement;
  popupOptions: HTMLDivElement;
};

function lookupElements(): Elements | null {
  const ids = [
    "aboutBtn",
    "browseBtn",
    "sampleBtn",
    "keyboardBtn",
    "fileInput",
    "inputPane",
    "outputPane",
    "generateBtn",
    "saveBtn",
    "clearBtn",
    "saveAndClearBtn",
    "popup",
    "popupTitle",
    "popupBody",
    "popupOptions",
  ] as const;

  const missing: string[] = [];
  const found: Record<string, HTMLElement> = {};

  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) {
      missing.push(id);
    } else {
      found[id] = el;
    }
  }

  if (missing.length > 0) {
    console.error(
      `odf-kit unified tool page: missing expected DOM elements: ${missing.join(", ")}`,
    );
    return null;
  }

  return found as unknown as Elements;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let currentState: AppState = { state: "A" };

// ─────────────────────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single source of truth for "what the UI should look like, given a state."
 * Coordinator over three diff-aware sub-renderers — one per region of the UI:
 *
 *   - renderInputPane:  the editable textarea (or empty placeholder)
 *   - renderOutputPane: the read-only textarea showing converted content
 *                       (or empty placeholder)
 *   - renderButtons:    the four action buttons' disabled states
 *
 * Sub-renderers are individually idempotent: calling render(state) twice
 * produces the same UI. Some of them are diff-aware in the sense that they
 * look at the current DOM before deciding whether to mutate it, so a
 * mounted-and-focused textarea isn't destroyed on every state change.
 *
 * Concretely: once the input textarea is mounted, calling render() during
 * B→C, C→C, or C→B-back-to-text transitions leaves the textarea element
 * alone (it owns its own cursor / scroll / focus / selection). State syncs
 * to the textarea via its input listener; the textarea's DOM is the
 * authoritative display while it's mounted. This makes it safe for the
 * input listener itself to call render() directly — for example to flip
 * isStale in State C and update the output pane's disclosure footer.
 *
 * Called after every state mutation. Never called from inside event handlers
 * before the mutation; always after.
 */
function render(state: AppState, els: Elements): void {
  renderInputPane(state, els);
  renderOutputPane(state, els);
  renderButtons(state, els);
}

/**
 * Diff-aware: if the new state wants a text-editable textarea and one is
 * already mounted, leave it alone (preserves cursor / scroll / focus /
 * selection across transitions). If the new state wants a textarea and
 * none is mounted, mount one populated from state.inputText. If the new
 * state wants the empty placeholder, replace whatever's there with that.
 */
function renderInputPane(state: AppState, els: Elements): void {
  if (state.state === "A") {
    setPaneEmpty(els.inputPane, "Select an input method above");
    return;
  }

  // States B and C both want the input textarea (for text-kind inputs).
  // Binary-kind isn't reachable this commit; the placeholder branch is
  // here for completeness when binary preview lands.
  if (state.inputKind === "binary") {
    setPaneEmpty(els.inputPane, `Loaded: ${state.inputFilename}`);
    return;
  }

  // Text-kind: if a textarea is already mounted, leave it alone — the
  // textarea owns its display while mounted, and destroying it would lose
  // cursor / scroll / focus. State already mirrors the textarea's value via
  // the input listener attached in setPaneTextarea.
  const existing = els.inputPane.querySelector("textarea");
  if (existing !== null) {
    return;
  }

  // No textarea mounted: build one populated from state.inputText.
  setPaneTextarea(els.inputPane, state.inputFormat, state.inputText, false, els);
}

/**
 * In States A and B the output pane shows an empty placeholder; the message
 * differs slightly between the two ("Output will appear here after Generate"
 * vs. "Click Generate to convert") so the user knows what's expected next.
 *
 * In State C the output pane shows a read-only textarea populated from the
 * conversion result. For text-kind results the textarea content is the
 * result text directly; for bytes-kind results, the result bytes will be
 * round-tripped through a reader by the caller of runConversion (or here,
 * once C2 wires the reading-back path). This commit creates the rendering
 * scaffolding only; State C isn't reachable yet.
 */
function renderOutputPane(state: AppState, els: Elements): void {
  if (state.state === "A") {
    setPaneEmpty(els.outputPane, "Output will appear here after Generate");
    return;
  }

  if (state.state === "B") {
    setPaneEmpty(els.outputPane, "Click Generate to convert");
    return;
  }

  // State C. Output rendering varies by result kind and output format:
  //   - "bytes" (ODT / ODS): round-tripped to HTML via the matching reader
  //     at conversion time (cached as previewText), then rendered as a
  //     visual preview in an iframe so the user sees what a viewer would
  //     show — not the HTML source.
  //   - "text" with outputFormat "html": rendered as a visual preview in
  //     an iframe (the HTML IS the source).
  //   - "text" with outputFormat "markdown" or "typst": pure text formats;
  //     shown verbatim in a read-only textarea so the user can read and
  //     copy the source. (Future commits exercise these branches; html→odt
  //     this commit doesn't reach them.)
  const result = state.outputContent;
  if (result.kind === "bytes") {
    setPaneIframe(els.outputPane, result.previewText);
    ensureOutputDisclosure(els.outputPane);
    return;
  }
  // result.kind === "text"
  if (result.outputFormat === "html") {
    setPaneIframe(els.outputPane, result.text);
    ensureOutputDisclosure(els.outputPane);
    return;
  }
  // Markdown or Typst: read-only textarea.
  // Diff-aware: skip the rebuild if content matches what's already shown,
  // so stale-flag flips (every keystroke in input) don't tear down the
  // user's text selection in the output pane.
  const existing = els.outputPane.querySelector("textarea");
  if (existing !== null && existing.value === result.text) {
    ensureOutputDisclosure(els.outputPane);
    return;
  }
  setPaneTextarea(els.outputPane, state.inputFormat, result.text, true, els);
  ensureOutputDisclosure(els.outputPane);
}

/**
 * Replace pane contents with an iframe rendering the given HTML via the
 * srcdoc attribute. Sandboxed without allow-scripts (the round-tripped or
 * generated HTML never contains script, but defense in depth).
 * allow-same-origin lets the iframe's inline styles resolve normally.
 *
 * Diff-aware: stashes the HTML on the iframe element's dataset so a
 * subsequent render call with the same content can return early without
 * tearing down the iframe — preserves the user's scroll position in the
 * preview across stale-flag flips during input editing.
 */
function setPaneIframe(pane: HTMLDivElement, html: string): void {
  const existing = pane.querySelector("iframe");
  if (existing !== null && existing.dataset.previewText === html) {
    return;
  }
  const iframe = document.createElement("iframe");
  iframe.id = "outputIframe";
  iframe.sandbox.add("allow-same-origin");
  iframe.srcdoc = html;
  iframe.dataset.previewText = html;
  pane.replaceChildren(iframe);
}

/**
 * Ensure the output pane has its disclosure footer mounted. Idempotent:
 * if one is already there, leaves it alone. If not, appends a fresh one
 * with the "fresh" message text. C4 will add the stale-message branch
 * when isStale is true.
 *
 * Sibling to the textarea/placeholder inside the pane. CSS makes it
 * sticky-bottom so it remains visible regardless of scroll position.
 */
function ensureOutputDisclosure(pane: HTMLDivElement): void {
  const existing = pane.querySelector(".io-pane-disclosure");
  if (existing !== null) {
    return;
  }
  const disclosure = document.createElement("div");
  disclosure.className = "io-pane-disclosure";
  disclosure.textContent = "Preview is rendered approximately. The saved file is exact.";
  pane.appendChild(disclosure);
}

/**
 * Action button enabled/disabled states by state.
 *
 *   State A: all four disabled.
 *   State B: Generate + Clear enabled; Save + SaveAndClear disabled.
 *   State C: all four enabled (output exists and can be saved).
 *
 * Pure attribute updates — no DOM children to preserve.
 */
function renderButtons(state: AppState, els: Elements): void {
  switch (state.state) {
    case "A":
      els.browseBtn.disabled = false;
      els.sampleBtn.disabled = false;
      els.keyboardBtn.disabled = false;
      els.generateBtn.disabled = true;
      els.saveBtn.disabled = true;
      els.clearBtn.disabled = true;
      els.saveAndClearBtn.disabled = true;
      return;
    case "B":
      els.browseBtn.disabled = true;
      els.sampleBtn.disabled = true;
      els.keyboardBtn.disabled = true;
      els.generateBtn.disabled = false;
      els.saveBtn.disabled = true;
      els.clearBtn.disabled = false;
      els.saveAndClearBtn.disabled = true;
      return;
    case "C":
      els.browseBtn.disabled = true;
      els.sampleBtn.disabled = true;
      els.keyboardBtn.disabled = true;
      els.generateBtn.disabled = false;
      els.saveBtn.disabled = false;
      els.clearBtn.disabled = false;
      els.saveAndClearBtn.disabled = false;
      return;
  }
}

/** Replace pane contents with an empty placeholder div containing the message. */
function setPaneEmpty(pane: HTMLDivElement, message: string): void {
  const empty = document.createElement("div");
  empty.className = "io-pane-empty";
  empty.textContent = message;
  pane.replaceChildren(empty);
}

/**
 * Replace pane contents with a textarea.
 *
 * When readOnly is false (input pane), wires an input listener that mirrors
 * the textarea's value into currentState.inputText. The listener updates
 * state without re-rendering, since the textarea is its own authoritative
 * display while mounted — renderInputPane's diff-aware check would no-op
 * anyway if called, but skipping the render is cheaper and more obviously
 * correct.
 *
 * When readOnly is true (output pane in State C), no listener is attached:
 * the output textarea is a passive display of the conversion result. The
 * user can select and copy text from it but not edit it.
 */
function setPaneTextarea(
  pane: HTMLDivElement,
  format: InputFormat,
  value: string,
  readOnly: boolean,
  els: Elements,
): void {
  const textarea = document.createElement("textarea");
  textarea.id = readOnly ? "outputTextarea" : "inputTextarea";
  textarea.spellcheck = false;
  textarea.placeholder = readOnly ? "" : `Type your ${format} input here...`;
  textarea.value = value;
  textarea.readOnly = readOnly;
  textarea.style.width = "100%";
  textarea.style.minHeight = "300px";
  textarea.style.fontFamily =
    "ui-monospace, SFMono-Regular, 'Cascadia Mono', 'Segoe UI Mono', Menlo, monospace";
  textarea.style.fontSize = "0.85rem";
  textarea.style.border = "none";
  textarea.style.outline = "none";
  textarea.style.resize = "vertical";
  textarea.style.background = "transparent";

  if (!readOnly) {
    // Keep state in sync as the user types. Updates state without
    // re-rendering: the textarea is its own authoritative display while
    // mounted (renderInputPane's diff-aware check would no-op anyway, but
    // skipping the call is cheaper and more obviously correct).
    //
    // Special case: in State C, edits make the output stale. We DO call
    // render() in that case so renderOutputPane can flip the disclosure
    // footer to the stale message. renderInputPane sees the textarea
    // already mounted and leaves it alone, so cursor / focus survive.
    textarea.addEventListener("input", () => {
      if (currentState.state === "B") {
        currentState = { ...currentState, inputText: textarea.value };
        return;
      }
      if (currentState.state === "C") {
        if (currentState.isStale) {
          // Already marked stale; just mirror the text. Skip render() — no
          // visual transition to make, and the textarea owns its DOM.
          currentState = { ...currentState, inputText: textarea.value };
          return;
        }
        currentState = { ...currentState, inputText: textarea.value, isStale: true };
        // C4 will wire the visual stale indicator. For now the state flag
        // is set but no on-screen change occurs — render() is still safe
        // to call (it'll just no-op the input textarea via the diff-aware
        // check), and we call it so the wiring is in place when C4 adds
        // the disclosure-footer update.
        render(currentState, els);
      }
    });
  }

  pane.replaceChildren(textarea);
  // Set cursor to start BEFORE focusing — otherwise focus may scroll the
  // textarea to wherever the cursor lands (the end, for freshly-populated
  // content), and the user sees the bottom of the file rather than the top.
  textarea.setSelectionRange(0, 0);
  // Don't steal focus when mounting a read-only output textarea: the user
  // just clicked Generate and is reading the result, not typing. Focusing
  // an output textarea would steal the cursor from any input field the
  // user may have shifted back to.
  if (!readOnly) {
    textarea.focus();
  }
  textarea.scrollTop = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Popup helper
// ─────────────────────────────────────────────────────────────────────────────

/** A selectable option in a popup. */
type PopupOption = {
  /** Short label shown as the primary text on the button. */
  label: string;
  /** Optional longer description shown beneath the label in lighter text. */
  description?: string;
  /** Value returned via the promise when this option is chosen. */
  value: string;
};

/**
 * Show a modal popup with a title and a list of options. Returns a promise
 * that resolves to the chosen option's value, or null if the user dismissed
 * the popup (Escape, click backdrop, no click).
 *
 * Uses the page's single <dialog> element with showModal(); the browser
 * handles focus trapping, escape key, and aria-modal semantics natively.
 * The dialog's contents are populated dynamically so the same element can
 * serve every popup the page needs (format selector, sample selector,
 * output selector, trust popup, error popup).
 */
function showPopup(
  els: Elements,
  args: { title: string; body?: string; options: PopupOption[] },
): Promise<string | null> {
  return new Promise((resolve) => {
    // Populate title
    els.popupTitle.textContent = args.title;

    // Populate body (optional). When absent, the body div is hidden so the
    // popup renders identically to a body-less call. Reset explicitly every
    // time so a popup with body followed by one without doesn't leak the
    // previous body's content.
    if (args.body !== undefined && args.body !== "") {
      els.popupBody.textContent = args.body;
      els.popupBody.hidden = false;
    } else {
      els.popupBody.textContent = "";
      els.popupBody.hidden = true;
    }

    // Build option buttons fresh each time (caller's options array drives this).
    const buttons: HTMLButtonElement[] = [];
    for (const opt of args.options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "popup-option";
      btn.dataset.value = opt.value;

      const labelSpan = document.createElement("span");
      labelSpan.textContent = opt.label;
      btn.appendChild(labelSpan);

      if (opt.description) {
        const descSpan = document.createElement("span");
        descSpan.className = "popup-option-desc";
        descSpan.textContent = opt.description;
        btn.appendChild(descSpan);
      }

      btn.addEventListener("click", () => {
        cleanup();
        els.popup.close();
        resolve(opt.value);
      });

      buttons.push(btn);
    }
    els.popupOptions.replaceChildren(...buttons);

    // Dismiss handlers — the dialog's "close" event fires on Escape, on
    // showModal-then-close calls, and (if we wire it) on backdrop clicks.
    // Native dialog doesn't dismiss on backdrop click by default; we add
    // that ourselves below.
    function onDialogClose(): void {
      cleanup();
      // If close fired because of a selection, the selection branch already
      // resolved; this branch resolves null for any other close reason.
      resolve(null);
    }
    function onBackdropClick(e: MouseEvent): void {
      // The dialog's content fills its bounding box; clicking outside the
      // content but still on the dialog itself means the backdrop was hit.
      if (e.target === els.popup) {
        els.popup.close();
      }
    }
    function cleanup(): void {
      els.popup.removeEventListener("close", onDialogClose);
      els.popup.removeEventListener("click", onBackdropClick);
    }
    els.popup.addEventListener("close", onDialogClose);
    els.popup.addEventListener("click", onBackdropClick);

    els.popup.showModal();

    // Focus the first option for keyboard accessibility.
    buttons[0]?.focus();
  });
}

/**
 * Show an error popup with a title and message body, single OK button.
 * Thin wrapper around showPopup for the common "tell the user something is
 * wrong with the file or unsupported, wait for acknowledgement" case. All
 * dismissal paths (OK button, Escape, backdrop click) are equivalent; the
 * promise resolves and state is unchanged. The popup is for informational
 * dismissal — its return value carries no decision and is intentionally void.
 */
async function showError(els: Elements, args: { title: string; message: string }): Promise<void> {
  await showPopup(els, {
    title: args.title,
    body: args.message,
    options: [{ label: "OK", value: "ok" }],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// File loading helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect whether parsed JSON is a Lexical document or a TipTap document by
 * inspecting top-level structure. Returns null if neither shape matches.
 *
 * Lexical: top-level object with a `root` object whose `type === "root"`.
 * TipTap:  top-level object with `type === "doc"` and array `content`.
 *
 * Mutually exclusive in practice. If a value somehow satisfied both,
 * Lexical takes precedence (checked first), which is fine for our purposes.
 */
function detectJsonFormat(parsed: unknown): "lexical" | "tiptap" | null {
  if (parsed === null || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const root = obj.root;
  if (root !== null && typeof root === "object") {
    const rootObj = root as Record<string, unknown>;
    if (rootObj.type === "root") return "lexical";
  }

  if (obj.type === "doc" && Array.isArray(obj.content)) {
    return "tiptap";
  }

  return null;
}

/**
 * Promise wrapper around FileReader.readAsText. Resolves with the decoded
 * text; rejects with the FileReader error (or a generic Error) if reading
 * fails. UTF-8 is the default encoding, matching how text files are
 * typically authored for this tool's input formats.
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader returned non-string result"));
        return;
      }
      resolve(result);
    };
    reader.onerror = (): void => {
      reject(reader.error ?? new Error("Unknown FileReader error"));
    };
    reader.readAsText(file);
  });
}

/** Extract a human-readable message from an unknown thrown value. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function onBrowseClick(els: Elements): void {
  // Reset value defensively so the change event fires even if the user picks
  // the same file twice across separate Browse clicks. The persistent change
  // listener attached at bootstrap handles the resulting selection.
  els.fileInput.value = "";
  els.fileInput.click();
}

/**
 * Persistent change handler attached to the hidden file input at bootstrap.
 * Reads the selected file, validates the filename, and dispatches to the
 * appropriate loader (text, JSON, binary stub) or error popup. State remains
 * A throughout this handler until a successful text-or-JSON load transitions
 * to State B.
 */
async function onFileSelected(els: Elements, file: File): Promise<void> {
  const parsed = parseFilename(file.name);
  if (!parsed.ok) {
    if (parsed.reason === "no-extension") {
      await showError(els, {
        title: "File has no extension",
        message:
          "The tool detects format from the file extension. Supported: " +
          ".html, .htm, .md, .markdown, .docx, .xlsx, .odt, .ods, .json.",
      });
    } else {
      await showError(els, {
        title: "File name is empty before the extension",
        message:
          "Files like '.gitignore' are config files without a base name. " +
          "The tool needs a base name to use for the converted output.",
      });
    }
    return;
  }

  const { ext } = parsed;
  switch (ext) {
    case "html":
    case "htm":
      await loadTextFile(els, file, "html");
      return;
    case "md":
    case "markdown":
      await loadTextFile(els, file, "markdown");
      return;
    case "json":
      await loadJsonFile(els, file);
      return;
    case "docx":
    case "xlsx":
    case "odt":
    case "ods":
      await showError(els, {
        title: "Binary files are not yet supported",
        message:
          "Binary input (.docx, .xlsx, .odt, .ods) is coming soon. " +
          "For now, try a text format (HTML, Markdown, or JSON), or use " +
          "Load Sample File or Type Keyboard Input.",
      });
      return;
    default:
      await showError(els, {
        title: "Unsupported file type",
        message:
          `The file extension ".${ext}" is not supported. Supported types: ` +
          ".html, .htm, .md, .markdown, .docx, .xlsx, .odt, .ods, .json.",
      });
      return;
  }
}

/**
 * Read a text file and transition to State B with its content. Reports
 * FileReader errors via showError; state remains A on failure.
 */
async function loadTextFile(els: Elements, file: File, format: "html" | "markdown"): Promise<void> {
  let text: string;
  try {
    text = await readFileAsText(file);
  } catch (err) {
    await showError(els, {
      title: "Couldn't read file",
      message: `The browser reported an error while reading the file. ${errorMessage(err)}`,
    });
    return;
  }

  currentState = {
    state: "B",
    inputFormat: format,
    inputFilename: file.name,
    inputKind: "text",
    inputText: text,
  };
  render(currentState, els);
}

/**
 * Read a JSON file, parse it, disambiguate Lexical vs TipTap by structure,
 * and transition to State B with its content. Reports FileReader errors,
 * JSON parse errors, and unrecognized-format cases via showError; state
 * remains A on any failure.
 */
async function loadJsonFile(els: Elements, file: File): Promise<void> {
  let text: string;
  try {
    text = await readFileAsText(file);
  } catch (err) {
    await showError(els, {
      title: "Couldn't read file",
      message: `The browser reported an error while reading the file. ${errorMessage(err)}`,
    });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    await showError(els, {
      title: "File is not valid JSON",
      message: `The file's contents could not be parsed as JSON. Parser said: ${errorMessage(err)}`,
    });
    return;
  }

  const format = detectJsonFormat(parsed);
  if (format === null) {
    await showError(els, {
      title: "JSON not recognized as Lexical or TipTap",
      message:
        "The tool detects Lexical by a top-level 'root' object, and " +
        "TipTap by a top-level 'doc' type with a 'content' array. " +
        "The file does not match either shape.",
    });
    return;
  }

  currentState = {
    state: "B",
    inputFormat: format,
    inputFilename: file.name,
    inputKind: "text",
    inputText: text,
  };
  render(currentState, els);
}

async function onSampleClick(els: Elements): Promise<void> {
  // Show sample-selector popup. User picks one of four text-format samples;
  // we then transition to State B with that sample's content pre-populating
  // the textarea and the sample's filename set for eventual output naming.
  // If the user dismisses without picking, state remains A.
  // Binary-format samples (DOCX, XLSX, ODT, ODS) are deferred to a future
  // commit alongside binary input handling.
  const chosen = await showPopup(els, {
    title: "Choose a sample file",
    options: [
      {
        label: "Sample HTML",
        description: "headings, list, table, blockquote, code",
        value: "html",
      },
      {
        label: "Sample Markdown",
        description: "headings, list, table, bold text, link",
        value: "markdown",
      },
      {
        label: "Sample Lexical",
        description: "JSON document with headings, list, formatting",
        value: "lexical",
      },
      {
        label: "Sample TipTap",
        description: "JSON document with headings, list, table, link",
        value: "tiptap",
      },
    ],
  });

  if (chosen === null) {
    // Dismissed without choosing — state stays A
    return;
  }

  const sample = SAMPLES[chosen as keyof typeof SAMPLES];
  currentState = {
    state: "B",
    inputFormat: chosen as InputFormat,
    inputFilename: sample.filename,
    inputKind: "text",
    inputText: sample.content,
  };
  render(currentState, els);
}

async function onKeyboardClick(els: Elements): Promise<void> {
  // Show format-selector popup per the v2 plan. User picks one of four text
  // formats; only then do we transition to State B with that format chosen.
  // If the user dismisses without picking, state remains A.
  const chosen = await showPopup(els, {
    title: "Choose an input format",
    options: [
      { label: "HTML", description: "web markup", value: "html" },
      { label: "Markdown", description: "prose with formatting", value: "markdown" },
      { label: "Lexical", description: "JSON from Lexical editor", value: "lexical" },
      { label: "TipTap", description: "JSON from TipTap editor", value: "tiptap" },
    ],
  });

  if (chosen === null) {
    // Dismissed without choosing — state stays A
    return;
  }

  currentState = {
    state: "B",
    inputFormat: chosen as InputFormat,
    inputFilename: "Document",
    inputKind: "text",
    inputText: "",
  };
  render(currentState, els);
}

/**
 * Indicator threshold: arm a timer when conversion starts; if it fires before
 * conversion completes, mount the "Generating..." label on the Generate button.
 * Avoids the flash on fast conversions (timer never fires).
 */
const INDICATOR_APPEAR_THRESHOLD_MS = 200;

/**
 * Minimum display time once the indicator is shown. If conversion completes
 * shortly after the indicator appears (e.g. timer fires at 200ms and
 * conversion finishes at 220ms), pad with an artificial delay so the
 * indicator stays on screen for at least this long. Avoids the flash on
 * barely-over-threshold conversions.
 */
const INDICATOR_MIN_DISPLAY_MS = 400;

async function onGenerateClick(els: Elements): Promise<void> {
  // Generate is only enabled in State B; defensive guard for any path that
  // could call this otherwise (e.g. if a future code change wires it in
  // State C without updating this check).
  if (currentState.state !== "B" && currentState.state !== "C") {
    return;
  }

  // Build the ConversionInput from current state. This commit: only text-
  // kind inputs are reachable (binary inputs intercepted before State B).
  // The default html→odt pathway is the only one wired; other input
  // formats will throw "not yet implemented" from runConversion, which
  // we surface via showError below.
  //
  // currentState is narrowed to "B" | "C" by the guard above. Both
  // variants carry the same input-side fields (inputFormat, inputKind,
  // inputText, inputFilename) with identical types, so reading them is
  // safe regardless of which we're in.
  const inputState = currentState;
  if (inputState.inputKind !== "text") {
    // Binary inputs aren't reachable this commit (file loading blocks
    // them before State B); future binary preview work will fill this in.
    await showError(els, {
      title: "Generation failed",
      message: "Binary input conversion is not yet supported. Please use a text-format input.",
    });
    return;
  }

  // For the vertical slice, all text inputs target ODT. Multi-output (ODT
  // → HTML / Markdown / Typst) requires the second popup per design
  // decision F, which lands when the first ODT-input pathway is wired.
  const outputFormat: OutputFormat = chooseOutputFormat(inputState.inputFormat);

  const input: ConversionInput = buildConversionInput(
    inputState.inputFormat,
    inputState.inputText,
    inputState.inputFilename,
  );

  // Appear-threshold + minimum-display indicator. The timer is armed
  // before conversion starts; if it fires, the Generate button gets the
  // "Generating..." label and is disabled. Once conversion completes,
  // the finally block clears the timer (no-op if it already fired) and
  // enforces the minimum-display delay if the indicator was shown.
  let indicatorShown = false;
  let indicatorShownAt = 0;
  const timer = window.setTimeout(() => {
    indicatorShown = true;
    indicatorShownAt = performance.now();
    els.generateBtn.textContent = "Generating...";
    els.generateBtn.disabled = true;
  }, INDICATOR_APPEAR_THRESHOLD_MS);

  try {
    const results = await runConversion([input], outputFormat);
    // Phase 1a always returns exactly one result. (The array contract is
    // for Phase 1b batch processing.) Defensive guard in case that ever
    // drifts: surface a clear error rather than silently dropping data.
    if (results.length !== 1) {
      throw new Error(`expected 1 conversion result, got ${results.length}`);
    }
    const result = results[0]!;

    // Transition to State C. The input-side fields carry forward so the
    // user can re-edit and re-Generate without losing context.
    currentState = {
      state: "C",
      inputFormat: inputState.inputFormat,
      inputFilename: inputState.inputFilename,
      inputKind: inputState.inputKind,
      inputText: inputState.inputText,
      outputFormat,
      outputContent: result,
      isStale: false,
    };
  } catch (err) {
    // Conversion failed. State stays at B (or returns to B if it was C)
    // so the user can fix the input and retry. If we came from State C,
    // we discard the previous output and revert to B; the alternative
    // (keep stale output visible alongside an error) would be confusing.
    if (currentState.state === "C") {
      currentState = {
        state: "B",
        inputFormat: currentState.inputFormat,
        inputFilename: currentState.inputFilename,
        inputKind: currentState.inputKind,
        inputText: currentState.inputText,
      };
    }
    await showError(els, {
      title: "Generation failed",
      message: errorMessage(err),
    });
  } finally {
    window.clearTimeout(timer);
    // Enforce minimum-display time. If the indicator was shown and
    // conversion completed quickly after, pad with a delay so the
    // indicator stays on screen at least INDICATOR_MIN_DISPLAY_MS.
    if (indicatorShown) {
      const elapsed = performance.now() - indicatorShownAt;
      const remaining = INDICATOR_MIN_DISPLAY_MS - elapsed;
      if (remaining > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
      }
    }
    // Restore the button label. render() below will set disabled per
    // the current state's normal rules.
    els.generateBtn.textContent = "Generate";
  }

  render(currentState, els);
}

/**
 * Pick the output format for a given input format. For inputs with a single
 * sensible output (HTML, Markdown, Lexical, TipTap → ODT; DOCX → ODT;
 * XLSX → ODS; ODS → HTML), no popup is needed; we return the only choice
 * directly. For inputs with multiple sensible outputs (ODT → HTML / Markdown
 * / Typst), the second popup per design decision F belongs here — landing in
 * the commit that wires the first ODT-input pathway.
 *
 * This commit: only single-output cases. ODT input throws unreachable here
 * because file-loading blocks it before State B anyway. Defensive default
 * for compiler exhaustiveness.
 */
function chooseOutputFormat(inputFormat: InputFormat): OutputFormat {
  switch (inputFormat) {
    case "html":
    case "markdown":
    case "lexical":
    case "tiptap":
    case "docx":
      return "odt";
    case "xlsx":
      return "ods";
    case "odt":
    case "ods":
      // Unreachable this commit (binary inputs blocked before State B).
      // ODT input will return one of html/markdown/typst per a popup
      // selection; ODS will return html. Falling back to html here is
      // arbitrary but safe — the path can't actually execute.
      return "html";
  }
}

/**
 * Build a ConversionInput for the given input format from the State B fields.
 * Text-kind inputs only this commit; binary-kind comes later when binary
 * file loading lands.
 */
function buildConversionInput(
  inputFormat: InputFormat,
  text: string,
  inputFilename: string,
): ConversionInput {
  switch (inputFormat) {
    case "html":
      return { inputFormat: "html", text, inputFilename };
    case "markdown":
      return { inputFormat: "markdown", text, inputFilename };
    case "lexical":
      return { inputFormat: "lexical", text, inputFilename };
    case "tiptap":
      return { inputFormat: "tiptap", text, inputFilename };
    case "docx":
    case "xlsx":
    case "odt":
    case "ods":
      // Unreachable: caller checks inputKind === "text" before calling.
      // Binary-kind ConversionInput needs a bytes field which isn't
      // available here. Throw rather than silently producing a
      // malformed input.
      throw new Error(`buildConversionInput called with binary inputFormat: ${inputFormat}`);
  }
}

function onClearClick(els: Elements): void {
  currentState = { state: "A" };
  render(currentState, els);
}

function onSaveClick(_els: Elements): void {
  // Unreachable in State B (button is disabled). Wired for completeness.
  console.log("Save clicked — not yet implemented.");
}

function onSaveAndClearClick(_els: Elements): void {
  // Unreachable in State B (button is disabled). Wired for completeness.
  console.log("Save and Clear clicked — not yet implemented.");
}

/**
 * Show the About popup. Three sections: pathway list (what this page does),
 * trust language (why it's safe), and identity/provenance (about odf-kit).
 * Single "Close" button; dismissible via button, Escape, or backdrop click.
 *
 * Deliberately separate from showPopup and showError because the body is
 * rich DOM content (lists, link) rather than plain text — making it the
 * third popup primitive keeps each primitive single-purpose and explicit.
 * Some dialog mechanics duplicate showPopup; that duplication is honest,
 * matching the genuinely different content shape.
 */
function showAbout(els: Elements): Promise<void> {
  return new Promise((resolve) => {
    // Title
    els.popupTitle.textContent = "About";

    // Body — rich DOM content built fresh each open
    els.popupBody.replaceChildren(buildAboutContent());
    els.popupBody.hidden = false;

    // Single Close button
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "popup-option";
    closeBtn.dataset.value = "close";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = "Close";
    closeBtn.appendChild(labelSpan);
    closeBtn.addEventListener("click", () => {
      els.popup.close();
    });
    els.popupOptions.replaceChildren(closeBtn);

    // Dismiss handlers — same backdrop/escape/close pattern as showPopup.
    // Any dismiss path resolves the same way (void); no decision is carried.
    function onDialogClose(): void {
      cleanup();
      resolve();
    }
    function onBackdropClick(e: MouseEvent): void {
      if (e.target === els.popup) {
        els.popup.close();
      }
    }
    function cleanup(): void {
      els.popup.removeEventListener("close", onDialogClose);
      els.popup.removeEventListener("click", onBackdropClick);
    }
    els.popup.addEventListener("close", onDialogClose);
    els.popup.addEventListener("click", onBackdropClick);

    els.popup.showModal();
    closeBtn.focus();
    // Force the body to scroll-top. Same pattern as the input-pane fix in
    // state56's d67cfbd — explicit reset after the showModal/focus dance,
    // since focus or showModal can leave the scrollable body at a non-zero
    // scrollTop. The "cursor" equivalent for a scrollable div.
    els.popupBody.scrollTop = 0;
  });
}

/**
 * Construct the About popup's body content as a DOM tree. Pure DOM
 * construction (no innerHTML); every text node is built explicitly so the
 * output is unambiguously text, not interpreted as markup.
 *
 * Three sections:
 *   1. "What this page does" — pathway list grouped by destination format
 *   2. "Why it's safe" — trust language (local execution, no upload, dare
 *      the reader to verify by disconnecting)
 *   3. "About odf-kit" — version, build date, license, link to GitHub
 *
 * The pathway list deliberately covers the page's conversions only — not
 * every odf-kit library capability. The landing page (separate work) will
 * eventually describe the library's full surface area.
 */
function buildAboutContent(): HTMLElement {
  const container = document.createElement("div");
  container.className = "about-content";

  // Section 1: What this page does
  const s1 = document.createElement("section");
  const s1h = document.createElement("h3");
  s1h.textContent = "What this page does";
  s1.appendChild(s1h);

  const pathways: Array<{ group: string; items: string[] }> = [
    {
      group: "Convert to ODT (word processor format)",
      items: ["HTML", "Markdown", "Lexical JSON", "TipTap JSON", "DOCX"],
    },
    {
      group: "Convert to ODS (spreadsheet format)",
      items: ["XLSX"],
    },
    {
      group: "Convert from ODT",
      items: ["to HTML", "to Markdown", "to Typst (for PDF generation)"],
    },
    {
      group: "Convert from ODS",
      items: ["to HTML"],
    },
  ];
  for (const { group, items } of pathways) {
    const groupDiv = document.createElement("div");
    groupDiv.className = "pathway-group";
    const h = document.createElement("h4");
    h.textContent = group;
    groupDiv.appendChild(h);
    const ul = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    }
    groupDiv.appendChild(ul);
    s1.appendChild(groupDiv);
  }
  container.appendChild(s1);

  // Section 2: Why it's safe
  const s2 = document.createElement("section");
  const s2h = document.createElement("h3");
  s2h.textContent = "Why it's safe";
  s2.appendChild(s2h);
  const trustP = document.createElement("p");
  trustP.textContent =
    "Your files never leave your computer. All conversion runs locally in " +
    "your browser. No upload, no server, no analytics on file contents.";
  s2.appendChild(trustP);
  const dareP = document.createElement("p");
  dareP.textContent =
    "Verify it yourself: disconnect your internet after the page loads, " +
    "then run conversions — everything still works.";
  s2.appendChild(dareP);
  container.appendChild(s2);

  // Section 3: About odf-kit
  const s3 = document.createElement("section");
  const s3h = document.createElement("h3");
  s3h.textContent = "About odf-kit";
  s3.appendChild(s3h);
  const buildDate =
    document.querySelector('meta[name="build-date"]')?.getAttribute("content") ?? "unknown";
  const idP = document.createElement("p");
  idP.appendChild(
    document.createTextNode(
      `odf-kit v${VERSION} — open source library for OpenDocument file formats. ` +
        `Apache 2.0 licensed. Build date: ${buildDate}. `,
    ),
  );
  const link = document.createElement("a");
  link.href = "https://github.com/GitHubNewbie0/odf-kit";
  link.textContent = "GitHub repository";
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  idP.appendChild(link);
  idP.appendChild(document.createTextNode("."));
  s3.appendChild(idP);
  container.appendChild(s3);

  return container;
}

async function onAboutClick(els: Elements): Promise<void> {
  await showAbout(els);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

function bootstrap(): void {
  const els = lookupElements();
  if (!els) {
    return;
  }

  els.browseBtn.addEventListener("click", () => onBrowseClick(els));
  els.sampleBtn.addEventListener("click", () => {
    void onSampleClick(els);
  });
  els.keyboardBtn.addEventListener("click", () => {
    void onKeyboardClick(els);
  });
  els.generateBtn.addEventListener("click", () => {
    void onGenerateClick(els);
  });
  els.saveBtn.addEventListener("click", () => onSaveClick(els));
  els.clearBtn.addEventListener("click", () => onClearClick(els));
  els.saveAndClearBtn.addEventListener("click", () => onSaveAndClearClick(els));
  els.aboutBtn.addEventListener("click", () => {
    void onAboutClick(els);
  });

  // Persistent change handler on the hidden file input. Fires when the user
  // picks a file via the native picker; does not fire on cancel. Attached
  // once at bootstrap so no per-click listener accumulation occurs.
  els.fileInput.addEventListener("change", () => {
    const file = els.fileInput.files?.[0];
    if (!file) return;
    void onFileSelected(els, file);
  });

  render(currentState, els);

  console.log(
    `odf-kit unified tool page — v${VERSION} — state machine wired ` +
      `(Keyboard input, Sample loading, Browse to File for text formats, ` +
      `About popup; binary file preview and State C / conversion not yet implemented).`,
  );
}

bootstrap();
