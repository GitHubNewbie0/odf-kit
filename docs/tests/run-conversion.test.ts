// docs/tests/run-conversion.test.ts
//
// Unit tests for the conversion dispatch boundary in docs/tools/conversion.ts.
// This is the UI ↔ library seam: the function the click handler calls when
// the user hits Generate. We test the dispatch shape, the filename
// construction, the array contract, and the error path — not the underlying
// ODF generation correctness (that's covered by the library's own tests).
//
// Test cases per design decision BB:
//   1. Happy path: HTML → ODT returns a well-shaped bytes-kind result.
//   2. Filename with extension: "report.html" → "report.odt".
//   3. Filename without extension: "Document" → "Document.odt".
//   4. Not-yet-implemented pair throws with descriptive message.
//   5. Array contract: two inputs return two results in order.
//
// Located in docs/tests/ (sibling to docs/tools/) so the page's tests live
// adjacent to the page source, distinct from the library's tests/ directory
// at the repository root.

import { describe, expect, test } from "@jest/globals";
import { runConversion, type ConversionInput } from "../tools/conversion.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixture: minimal valid HTML
// ─────────────────────────────────────────────────────────────────────────────
//
// Small but real HTML5 input — enough that htmlToOdt produces a valid ODT
// document. Doc structure is intentionally bare so the test isn't sensitive
// to library-side rendering choices (paragraph spacing, span wrappers, etc.).
// What we check is that something non-empty came out and is shaped correctly.

const MINIMAL_HTML = "<!DOCTYPE html><html><body><p>Hello world</p></body></html>";

// Small but real CommonMark input — enough that markdownToOdt (Markdown →
// HTML via marked, then htmlToOdt) produces a valid ODT document. As with
// the HTML fixture, the structure is bare so the test isn't sensitive to
// library-side rendering choices; we check shape, not exact bytes.
const MINIMAL_MARKDOWN = "# Hello\n\nWorld";

// Minimal valid Lexical SerializedEditorState as a JSON *string* — this is
// how it arrives at runConversion (ConversionInput.text carries the raw file
// / sample / typed text; the lexical case JSON.parses it before calling
// lexicalToOdt, which takes a parsed object). A root with one paragraph and
// one text node is the smallest structure the walker renders to a valid ODT.
const MINIMAL_LEXICAL = JSON.stringify({
  root: {
    type: "root",
    version: 1,
    direction: "ltr",
    format: "",
    indent: 0,
    children: [
      {
        type: "paragraph",
        version: 1,
        direction: "ltr",
        format: "",
        indent: 0,
        children: [
          {
            type: "text",
            version: 1,
            text: "Hello world",
            format: 0,
            style: "",
            mode: "normal",
            detail: 0,
          },
        ],
      },
    ],
  },
});

// Minimal valid TipTap JSONContent document as a JSON *string* — same arrival
// path as lexical (ConversionInput.text carries raw JSON; the tiptap case
// JSON.parses it before calling tiptapToOdt, which takes a parsed object with
// type "doc"). A doc with one paragraph and one text node is the smallest
// structure tiptapToOdt renders to a valid ODT.
const MINIMAL_TIPTAP = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Hello world" }],
    },
  ],
});

describe("runConversion(html → odt)", () => {
  test("happy path: returns bytes-kind result with all expected fields", async () => {
    const input: ConversionInput = {
      inputFormat: "html",
      text: MINIMAL_HTML,
      inputFilename: "fixture.html",
    };
    const results = await runConversion([input], "odt");
    expect(results).toHaveLength(1);

    const result = results[0]!;
    expect(result.kind).toBe("bytes");
    if (result.kind !== "bytes") return; // Narrowing for TypeScript
    expect(result.outputFormat).toBe("odt");
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(typeof result.previewText).toBe("string");
    expect(result.previewText.length).toBeGreaterThan(0);
    expect(result.outputFilename).toBe("fixture.odt");
  });

  test("filename construction: input with extension produces stem + .odt", async () => {
    const input: ConversionInput = {
      inputFormat: "html",
      text: MINIMAL_HTML,
      inputFilename: "report.html",
    };
    const results = await runConversion([input], "odt");
    expect(results[0]!.outputFilename).toBe("report.odt");
  });

  test("filename construction: input without extension uses whole string as stem", async () => {
    // Reached when the user typed input via keyboard — onKeyboardClick
    // sets inputFilename to "Document" with no extension. parseFilename
    // reports no-extension; buildOutputFilename falls back to whole-string
    // and appends the output extension.
    const input: ConversionInput = {
      inputFormat: "html",
      text: MINIMAL_HTML,
      inputFilename: "Document",
    };
    const results = await runConversion([input], "odt");
    expect(results[0]!.outputFilename).toBe("Document.odt");
  });

  test("array contract: two inputs produce two results in submitted order", async () => {
    const inputs: ConversionInput[] = [
      {
        inputFormat: "html",
        text: "<p>first</p>",
        inputFilename: "first.html",
      },
      {
        inputFormat: "html",
        text: "<p>second</p>",
        inputFilename: "second.html",
      },
    ];
    const results = await runConversion(inputs, "odt");
    expect(results).toHaveLength(2);
    expect(results[0]!.outputFilename).toBe("first.odt");
    expect(results[1]!.outputFilename).toBe("second.odt");
  });
});

describe("runConversion(markdown → odt)", () => {
  test("happy path: returns bytes-kind result with all expected fields", async () => {
    const input: ConversionInput = {
      inputFormat: "markdown",
      text: MINIMAL_MARKDOWN,
      inputFilename: "fixture.md",
    };
    const results = await runConversion([input], "odt");
    expect(results).toHaveLength(1);

    const result = results[0]!;
    expect(result.kind).toBe("bytes");
    if (result.kind !== "bytes") return; // Narrowing for TypeScript
    expect(result.outputFormat).toBe("odt");
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(typeof result.previewText).toBe("string");
    expect(result.previewText.length).toBeGreaterThan(0);
    expect(result.outputFilename).toBe("fixture.odt");
  });
});

describe("runConversion(lexical → odt)", () => {
  test("happy path: returns bytes-kind result with all expected fields", async () => {
    const input: ConversionInput = {
      inputFormat: "lexical",
      text: MINIMAL_LEXICAL,
      inputFilename: "sample_lexical.json",
    };
    const results = await runConversion([input], "odt");
    expect(results).toHaveLength(1);

    const result = results[0]!;
    expect(result.kind).toBe("bytes");
    if (result.kind !== "bytes") return; // Narrowing for TypeScript
    expect(result.outputFormat).toBe("odt");
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(typeof result.previewText).toBe("string");
    expect(result.previewText.length).toBeGreaterThan(0);
    expect(result.outputFilename).toBe("sample_lexical.odt");
  });
});

describe("runConversion(tiptap → odt)", () => {
  test("happy path: returns bytes-kind result with all expected fields", async () => {
    const input: ConversionInput = {
      inputFormat: "tiptap",
      text: MINIMAL_TIPTAP,
      inputFilename: "sample_tiptap.json",
    };
    const results = await runConversion([input], "odt");
    expect(results).toHaveLength(1);

    const result = results[0]!;
    expect(result.kind).toBe("bytes");
    if (result.kind !== "bytes") return; // Narrowing for TypeScript
    expect(result.outputFormat).toBe("odt");
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(typeof result.previewText).toBe("string");
    expect(result.previewText.length).toBeGreaterThan(0);
    expect(result.outputFilename).toBe("sample_tiptap.odt");
  });
});

describe("runConversion error paths", () => {
  test("not-yet-implemented pair throws with descriptive message", async () => {
    // DOCX → ODT is in the dispatch table but not yet wired. With C7 all four
    // text→ODT pathways are implemented, so the specimen is now a binary-input
    // pair — note the shape change from `text` to `bytes` (docx carries a
    // Uint8Array). The dispatch throws before reading the bytes, so an empty
    // array is sufficient. Re-point to the next still-unimplemented pathway as
    // each remaining (binary) fan-out commit lands.
    const input: ConversionInput = {
      inputFormat: "docx",
      bytes: new Uint8Array(),
      inputFilename: "test.docx",
    };
    await expect(runConversion([input], "odt")).rejects.toThrow(/not yet implemented.*docx.*odt/);
  });
});
