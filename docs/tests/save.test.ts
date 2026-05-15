/**
 * docs/tests/save.test.ts
 *
 * Unit tests for `buildSaveBlob` (docs/tools/save.ts).
 *
 * Coverage:
 *  - MIME type is correctly mapped for each OutputFormat (5 tests).
 *  - Blob size matches Uint8Array length for bytes-kind results.
 *  - Blob size matches UTF-8 byte length (not character count) for
 *    text-kind results — verifies the Blob constructor handles
 *    multi-byte UTF-8 encoding correctly.
 *  - Filename is passed through verbatim from `result.outputFilename`.
 *
 * `triggerDownload` is intentionally not unit-tested. It is small
 * DOM-only glue (createObjectURL + anchor click + revokeObjectURL)
 * that would require jsdom to exercise; coverage is provided by the
 * manual smoke-test on the local server.
 *
 * Test environment note: Jest runs with `testEnvironment: "node"`.
 * Node 18+ exposes `Blob` and `Uint8Array` on `globalThis`, so no
 * jsdom or polyfill is required for the Blob assertions below.
 *
 * Property-name assumption: the discriminated union variants are
 * assumed to have `bytes`/`previewText` (bytes-kind) and `text`
 * (text-kind), with `outputFormat` and `outputFilename` on both.
 * If the actual property names in conversion.ts differ, the
 * compile error here flags it immediately.
 */

import { describe, expect, test } from "@jest/globals";
import { buildSaveBlob } from "../tools/save.js";
import type { ConversionResult } from "../tools/conversion.js";

describe("buildSaveBlob", () => {
  describe("MIME type mapping", () => {
    test("odt -> application/vnd.oasis.opendocument.text", () => {
      const result: ConversionResult = {
        kind: "bytes",
        bytes: new Uint8Array([0x50, 0x4b]),
        previewText: "<p>preview</p>",
        outputFormat: "odt",
        outputFilename: "doc.odt",
      };
      const { blob } = buildSaveBlob(result);
      expect(blob.type).toBe("application/vnd.oasis.opendocument.text");
    });

    test("ods -> application/vnd.oasis.opendocument.spreadsheet", () => {
      const result: ConversionResult = {
        kind: "bytes",
        bytes: new Uint8Array([0x50, 0x4b]),
        previewText: "<p>preview</p>",
        outputFormat: "ods",
        outputFilename: "sheet.ods",
      };
      const { blob } = buildSaveBlob(result);
      expect(blob.type).toBe("application/vnd.oasis.opendocument.spreadsheet");
    });

    test("html -> text/html", () => {
      const result: ConversionResult = {
        kind: "text",
        text: "<p>hello</p>",
        outputFormat: "html",
        outputFilename: "page.html",
      };
      const { blob } = buildSaveBlob(result);
      expect(blob.type).toBe("text/html");
    });

    test("markdown -> text/markdown", () => {
      const result: ConversionResult = {
        kind: "text",
        text: "# hello",
        outputFormat: "markdown",
        outputFilename: "doc.md",
      };
      const { blob } = buildSaveBlob(result);
      expect(blob.type).toBe("text/markdown");
    });

    test("typst -> text/plain", () => {
      const result: ConversionResult = {
        kind: "text",
        text: "= hello",
        outputFormat: "typst",
        outputFilename: "doc.typ",
      };
      const { blob } = buildSaveBlob(result);
      expect(blob.type).toBe("text/plain");
    });
  });

  describe("Blob size", () => {
    test("bytes-kind: Blob size equals Uint8Array length", () => {
      const bytes = new Uint8Array(1024).fill(0x42);
      const result: ConversionResult = {
        kind: "bytes",
        bytes,
        previewText: "",
        outputFormat: "odt",
        outputFilename: "doc.odt",
      };
      const { blob } = buildSaveBlob(result);
      expect(blob.size).toBe(1024);
    });

    test("text-kind: Blob size equals UTF-8 byte length, not character count", () => {
      // Three Japanese hiragana characters; each encodes to 3 UTF-8 bytes.
      // String.length reports 3 (code units); UTF-8 byte length is 9.
      const text = "あいう";
      const result: ConversionResult = {
        kind: "text",
        text,
        outputFormat: "html",
        outputFilename: "doc.html",
      };
      const { blob } = buildSaveBlob(result);
      expect(text.length).toBe(3); // sanity check the premise
      expect(blob.size).toBe(9);
    });
  });

  describe("Filename pass-through", () => {
    test("filename is returned verbatim from result.outputFilename", () => {
      const result: ConversionResult = {
        kind: "bytes",
        bytes: new Uint8Array(0),
        previewText: "",
        outputFormat: "odt",
        outputFilename: "MyReport (1).odt",
      };
      const { filename } = buildSaveBlob(result);
      expect(filename).toBe("MyReport (1).odt");
    });
  });
});
