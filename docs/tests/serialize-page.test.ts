/**
 * docs/tests/serialize-page.test.ts
 *
 * Unit tests for `buildSavePageFilename` (docs/tools/serialize-page.ts).
 *
 * `serializePage` is intentionally not unit-tested. It is a DOM
 * operation (cloneNode, querySelector, attribute mutation, outerHTML
 * serialization) and the project's established testing posture is:
 * test what can be made pure; smoke-test what genuinely requires a
 * DOM. Installing jsdom for one function in one page would break that
 * posture for marginal benefit; manual browser smoke-test is the
 * canonical verification path for `serializePage`.
 *
 * The smoke-test verifies, in a real browser:
 *   1. Click Save-page; downloaded file lands in Downloads folder.
 *   2. Filename matches odf-kit-tool-VERSION-DATE.html.
 *   3. Open the downloaded file directly (file:// URL); it loads.
 *   4. Disconnect internet; reload the downloaded file; still works.
 *   5. Run a real conversion in the downloaded copy (html→odt).
 *   6. Confirm the live page is unchanged after clicking Save-page
 *      (input pane, output pane, button states all preserved).
 *
 * This file unit-tests only `buildSavePageFilename` because the
 * filename format is the contract the saved file's name must satisfy
 * and is easily verifiable as a pure string function.
 */

import { describe, expect, test } from "@jest/globals";
import { buildSavePageFilename } from "../tools/serialize-page.js";

describe("buildSavePageFilename", () => {
  test("composes the format odf-kit-tool-VERSION-DATE.html", () => {
    expect(buildSavePageFilename("0.13.4", "2026-05-15")).toBe(
      "odf-kit-tool-0.13.4-2026-05-15.html",
    );
  });

  test("passes through arbitrary version strings verbatim", () => {
    expect(buildSavePageFilename("1.0.0-beta.2", "2026-12-31")).toBe(
      "odf-kit-tool-1.0.0-beta.2-2026-12-31.html",
    );
  });
});
