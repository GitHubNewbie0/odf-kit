// docs/tools/index.ui.ts
//
// Source of truth for the unified tool page's UI logic. Compiled and bundled
// into docs/tools/index.html by scripts/build-tool-page.js.
// See unified-tool-design-v2.md for the full design.
//
// Current scope: state machine + State A↔B wiring.
//   - Three input methods all wired:
//       Type Keyboard Input — fully functional (HTML hardcoded for now)
//       Browse to File / Load Sample File — placeholder "Not yet implemented"
//   - Clear fully functional (returns to State A)
//   - Generate is a no-op placeholder (transitions remain B; no conversion yet)
//   - State C entirely deferred until Generate actually produces output
//   - Trust popup, About button, error popup, conversion plumbing — all later

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
       * Phase 1a / this commit: only "text" is reachable, since Browse/Sample
       * are placeholders.
       */
      inputKind: "text" | "binary";
      /** Text content for text-kind inputs. Empty string until user types. */
      inputText: string;
      /** Whether this State B is a placeholder (Browse/Sample not-yet-impl). */
      isPlaceholder: boolean;
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
  // Two panes
  inputPane: HTMLDivElement;
  outputPane: HTMLDivElement;
  // Four action buttons
  generateBtn: HTMLButtonElement;
  saveBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  saveAndClearBtn: HTMLButtonElement;
};

function lookupElements(): Elements | null {
  const ids = [
    "aboutBtn",
    "browseBtn",
    "sampleBtn",
    "keyboardBtn",
    "inputPane",
    "outputPane",
    "generateBtn",
    "saveBtn",
    "clearBtn",
    "saveAndClearBtn",
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

  // Input pane: depends on whether this is the placeholder branch or real input
  if (state.isPlaceholder) {
    setPaneEmpty(els.inputPane, "Not yet implemented — Clear to try a different input method");
  } else if (state.inputKind === "text") {
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
  textarea.focus();
}

// ─────────────────────────────────────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────────────────────────────────────

function onBrowseClick(els: Elements): void {
  // Placeholder per design discussion (decision 2.i): show as State B with
  // "Not yet implemented" so the state machine is exercisable end-to-end.
  currentState = {
    state: "B",
    inputFormat: "html",
    inputFilename: "Document",
    inputKind: "text",
    inputText: "",
    isPlaceholder: true,
  };
  render(currentState, els);
}

function onSampleClick(els: Elements): void {
  currentState = {
    state: "B",
    inputFormat: "html",
    inputFilename: "Document",
    inputKind: "text",
    inputText: "",
    isPlaceholder: true,
  };
  render(currentState, els);
}

function onKeyboardClick(els: Elements): void {
  // Hardcoded HTML format per design discussion (decision 3). Format-selector
  // popup arrives in a later commit; for now, clicking the button drops you
  // straight into a textarea ready for HTML input.
  currentState = {
    state: "B",
    inputFormat: "html",
    inputFilename: "Document",
    inputKind: "text",
    inputText: "",
    isPlaceholder: false,
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
  els.sampleBtn.addEventListener("click", () => onSampleClick(els));
  els.keyboardBtn.addEventListener("click", () => onKeyboardClick(els));
  els.generateBtn.addEventListener("click", () => onGenerateClick(els));
  els.saveBtn.addEventListener("click", () => onSaveClick(els));
  els.clearBtn.addEventListener("click", () => onClearClick(els));
  els.saveAndClearBtn.addEventListener("click", () => onSaveAndClearClick(els));
  els.aboutBtn.addEventListener("click", () => onAboutClick(els));

  render(currentState, els);

  console.log(
    `odf-kit unified tool page — v${VERSION} — state machine wired ` +
      `(States A and B; State C and conversion not yet implemented).`,
  );
}

bootstrap();
