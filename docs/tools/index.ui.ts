// docs/tools/index.ui.ts
//
// Source of truth for the unified tool page's UI logic. Compiled and bundled
// into docs/tools/index.html by scripts/build-tool-page.js.
// See unified-tool-design-v2.md for the full design.
//
// Current scope: state machine + reusable popup infrastructure + sample loading
// + Browse-to-File for text formats.
//   - Three input methods all wired:
//       Type Keyboard Input — fully functional with format-selector popup
//       Load Sample File — fully functional with sample-selector popup,
//                          loads a hardcoded sample document for the chosen format
//       Browse to File — fully functional for text formats (HTML, Markdown,
//                        Lexical JSON, TipTap JSON). Binary formats (DOCX,
//                        XLSX, ODT, ODS) emit a "not yet supported" error
//                        popup and stay in State A. JSON files are
//                        disambiguated by inspecting their parsed structure.
//   - Clear fully functional (returns to State A)
//   - Generate is a no-op placeholder (transitions remain B; no conversion yet)
//   - showPopup() is the reusable popup helper: native <dialog>, Promise-based,
//     used today for the format selector and sample selector. The optional
//     body parameter supports an additional content block between title and
//     options, used by showError() for error display.
//   - showError() is the thin error-popup wrapper: title + body + OK.
//   - State C entirely deferred until Generate actually produces output
//   - Trust popup, About button, conversion plumbing — all later
//
// Samples: harvested from existing tool pages (HTML, Lexical) and test fixtures
// (Markdown, TipTap). All four are parallel "Meeting Notes" content for easy
// cross-format comparison. Hardcoded here for this commit; build-time inlining
// of real sample files and binary-format samples (DOCX/XLSX/ODT/ODS) deferred
// to a later commit.

import { VERSION } from "odf-kit/odt";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Input formats the page accepts. */
type InputFormat = "html" | "markdown" | "lexical" | "tiptap" | "docx" | "xlsx" | "odt" | "ods";

/**
 * Page state. Discriminated union: each state carries only the data relevant
 * to that state, so e.g. there's no way to access output content while in B.
 *
 * State C is deliberately omitted from the type for this commit — adding it
 * before Generate produces output would be scaffolding for nothing.
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
 * Idempotent: calling render(state) twice produces the same UI.
 *
 * Called after every state mutation. Never called from inside event handlers
 * before the mutation; always after.
 */
function render(state: AppState, els: Elements): void {
  switch (state.state) {
    case "A":
      renderStateA(els);
      return;
    case "B":
      renderStateB(state, els);
      return;
  }
}

function renderStateA(els: Elements): void {
  // Three input-method buttons: active
  els.browseBtn.disabled = false;
  els.sampleBtn.disabled = false;
  els.keyboardBtn.disabled = false;

  // Four action buttons: all inactive
  els.generateBtn.disabled = true;
  els.saveBtn.disabled = true;
  els.clearBtn.disabled = true;
  els.saveAndClearBtn.disabled = true;

  // Input pane: empty placeholder
  setPaneEmpty(els.inputPane, "Select an input method above");

  // Output pane: empty placeholder
  setPaneEmpty(els.outputPane, "Output will appear here after Generate");
}

function renderStateB(state: Extract<AppState, { state: "B" }>, els: Elements): void {
  // Three input-method buttons: inactive (input is loaded; can't change it)
  els.browseBtn.disabled = true;
  els.sampleBtn.disabled = true;
  els.keyboardBtn.disabled = true;

  // Four action buttons: Generate active, Clear active, others inactive
  els.generateBtn.disabled = false;
  els.saveBtn.disabled = true;
  els.clearBtn.disabled = false;
  els.saveAndClearBtn.disabled = true;

  // Input pane: depends on whether the input is text-kind (editable textarea)
  // or binary-kind (read-only summary; binary preview lands in a later commit).
  if (state.inputKind === "text") {
    setPaneTextarea(els.inputPane, state.inputFormat, state.inputText);
  } else {
    // Binary inputs aren't reachable this commit, but the branch is here for completeness
    setPaneEmpty(els.inputPane, `Loaded: ${state.inputFilename}`);
  }

  // Output pane: still empty in State B (Generate hasn't run)
  setPaneEmpty(els.outputPane, "Click Generate to convert");
}

/** Replace pane contents with an empty placeholder div containing the message. */
function setPaneEmpty(pane: HTMLDivElement, message: string): void {
  const empty = document.createElement("div");
  empty.className = "io-pane-empty";
  empty.textContent = message;
  pane.replaceChildren(empty);
}

/** Replace pane contents with a textarea for text-kind inputs. */
function setPaneTextarea(pane: HTMLDivElement, format: InputFormat, value: string): void {
  const textarea = document.createElement("textarea");
  textarea.id = "inputTextarea";
  textarea.spellcheck = false;
  textarea.placeholder = `Type your ${format} input here...`;
  textarea.value = value;
  textarea.style.width = "100%";
  textarea.style.minHeight = "300px";
  textarea.style.fontFamily =
    "ui-monospace, SFMono-Regular, 'Cascadia Mono', 'Segoe UI Mono', Menlo, monospace";
  textarea.style.fontSize = "0.85rem";
  textarea.style.border = "none";
  textarea.style.outline = "none";
  textarea.style.resize = "vertical";
  textarea.style.background = "transparent";

  // Keep state in sync as the user types. Note: this updates state without
  // re-rendering, because re-rendering would replace the textarea and lose
  // focus / cursor. The textarea's own DOM is the authoritative display while
  // it's mounted; state is updated for when transitions later need the value.
  textarea.addEventListener("input", () => {
    if (currentState.state === "B") {
      currentState = { ...currentState, inputText: textarea.value };
    }
  });

  pane.replaceChildren(textarea);
  // Set cursor to start BEFORE focusing — otherwise focus may scroll the
  // textarea to wherever the cursor lands (the end, for freshly-populated
  // content), and the user sees the bottom of the file rather than the top.
  textarea.setSelectionRange(0, 0);
  textarea.focus();
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
 * Result of parsing a filename. The `ok: true` branch carries the case-preserved
 * stem and the lowercased extension; the `ok: false` branch carries a reason
 * that the caller maps to a specific error popup.
 */
type ParsedFilename =
  | { ok: true; stem: string; ext: string }
  | { ok: false; reason: "no-extension" | "empty-stem" };

/**
 * Split a filename on the LAST dot. Extension is lowercased for matching;
 * stem retains the original case for output naming. Reports a specific
 * failure reason for two cases the caller will surface as distinct errors:
 *   - "no-extension"  — no dot at all, OR ends with a dot (e.g. "file.")
 *   - "empty-stem"    — starts with a dot (e.g. ".gitignore")
 */
function parseFilename(name: string): ParsedFilename {
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1) return { ok: false, reason: "no-extension" };
  const stem = name.slice(0, lastDot);
  const ext = name.slice(lastDot + 1).toLowerCase();
  if (ext === "") return { ok: false, reason: "no-extension" };
  if (stem === "") return { ok: false, reason: "empty-stem" };
  return { ok: true, stem, ext };
}

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

function onGenerateClick(_els: Elements): void {
  // No-op placeholder. Real conversion arrives in a later commit. State stays B.
  console.log("Generate clicked — conversion not yet implemented.");
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

function onAboutClick(_els: Elements): void {
  // Trust popup arrives in a later commit.
  console.log("About clicked — trust popup not yet implemented.");
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
  els.generateBtn.addEventListener("click", () => onGenerateClick(els));
  els.saveBtn.addEventListener("click", () => onSaveClick(els));
  els.clearBtn.addEventListener("click", () => onClearClick(els));
  els.saveAndClearBtn.addEventListener("click", () => onSaveAndClearClick(els));
  els.aboutBtn.addEventListener("click", () => onAboutClick(els));

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
      `(Keyboard input, Sample loading, Browse to File for text formats; ` +
      `binary file preview and State C / conversion not yet implemented).`,
  );
}

bootstrap();
