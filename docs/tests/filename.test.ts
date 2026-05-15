// docs/tests/filename.test.ts
//
// Unit tests for the pure-string filename utilities in docs/tools/filename.ts.
// Filename logic is small but has several edge cases that matter for the
// page (extension-less keyboard input, leading-dot files, multiple-dot
// filenames, etc.) and is exactly the kind of thing easy to break
// unintentionally — hence its own dedicated test file.
//
// Tests cover all three exported functions:
//   - parseFilename: extension splitting and failure modes
//   - outputExtension: format → extension mapping
//   - buildOutputFilename: end-to-end filename construction
//
// Located in docs/tests/ alongside run-conversion.test.ts (page tests
// separate from library tests at the repo root).

import { describe, expect, test } from "@jest/globals";
import { buildOutputFilename, outputExtension, parseFilename } from "../tools/filename.js";

describe("parseFilename", () => {
  test("simple filename with extension", () => {
    expect(parseFilename("report.html")).toEqual({
      ok: true,
      stem: "report",
      ext: "html",
    });
  });

  test("preserves case in stem; lowercases extension", () => {
    expect(parseFilename("MyDocument.HTML")).toEqual({
      ok: true,
      stem: "MyDocument",
      ext: "html",
    });
  });

  test("splits on the LAST dot", () => {
    expect(parseFilename("archive.tar.gz")).toEqual({
      ok: true,
      stem: "archive.tar",
      ext: "gz",
    });
  });

  test("no dot at all reports no-extension", () => {
    expect(parseFilename("Document")).toEqual({
      ok: false,
      reason: "no-extension",
    });
  });

  test("trailing dot reports no-extension", () => {
    expect(parseFilename("file.")).toEqual({
      ok: false,
      reason: "no-extension",
    });
  });

  test("leading dot reports empty-stem", () => {
    expect(parseFilename(".gitignore")).toEqual({
      ok: false,
      reason: "empty-stem",
    });
  });
});

describe("outputExtension", () => {
  test("maps each OutputFormat to its file extension", () => {
    expect(outputExtension("odt")).toBe("odt");
    expect(outputExtension("ods")).toBe("ods");
    expect(outputExtension("html")).toBe("html");
    expect(outputExtension("markdown")).toBe("md");
    expect(outputExtension("typst")).toBe("typ");
  });
});

describe("buildOutputFilename", () => {
  test("with extension: stem + new extension", () => {
    expect(buildOutputFilename("report.html", "odt")).toBe("report.odt");
  });

  test("without extension: whole string + new extension", () => {
    // Reached by keyboard input where inputFilename is "Document".
    expect(buildOutputFilename("Document", "odt")).toBe("Document.odt");
  });

  test("case is preserved in stem", () => {
    expect(buildOutputFilename("MyReport.HTML", "odt")).toBe("MyReport.odt");
  });

  test("multi-dot input takes everything up to last dot as stem", () => {
    expect(buildOutputFilename("archive.tar.gz", "odt")).toBe("archive.tar.odt");
  });

  test("markdown output uses .md extension", () => {
    expect(buildOutputFilename("notes.html", "markdown")).toBe("notes.md");
  });

  test("typst output uses .typ extension", () => {
    expect(buildOutputFilename("essay.odt", "typst")).toBe("essay.typ");
  });
});
