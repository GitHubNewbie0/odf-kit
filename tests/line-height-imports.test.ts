/**
 * Where the line-height unit's imports point (#106).
 *
 * T4: MR-1 — anything reaching into a module from outside goes through its
 * front door, the barrel; same-module traffic ignores it. The imports the
 * line-height unit added or widened into `src/core/length.ts` therefore go
 * through `core`'s barrel, `src/core/index.ts`, which republishes what they
 * use. Older imports past the barrel are LEAD-038's scope and are not
 * checked here.
 */
import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import * as core from "../src/core/index.js";
import * as length from "../src/core/length.js";

/** Every module specifier a source file imports, statically or by type. */
function importSpecifiers(path: string): string[] {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf-8");
  return [...source.matchAll(/\bfrom\s+"([^"]+)"|\bimport\(\s*"([^"]+)"\s*\)/g)].map(
    (m) => m[1] ?? m[2] ?? "",
  );
}

describe("the line-height unit's imports into core go through core's barrel (T4: MR-1)", () => {
  test.each([
    "src/odt/to-html/html-renderer.ts",
    "src/build-or-fill/build-odt/line-height.ts",
    "src/docx/to-odt/line-spacing.ts",
    "src/html/to-odt/html-parser.ts",
  ])("%s imports nothing from core/length.js, a definer (T4: MR-1)", (path) => {
    expect(importSpecifiers(path).filter((s) => s.endsWith("/core/length.js"))).toEqual([]);
  });

  test.each([
    "convertDecimal",
    "convertQuantized",
    "convertQuantizedToPercent",
    "decimalToPercent",
    "excerpt",
    "isBelowZero",
    "parseOdfValue",
    "MAX_EMISSION_SEARCH_K",
    "MAX_NUMERIC_LEXICAL",
  ])("core's barrel republishes %s from core/length.ts, the same binding (T4: MR-1)", (name) => {
    const published = (core as Record<string, unknown>)[name];
    expect(published).toBeDefined();
    expect(published).toBe((length as Record<string, unknown>)[name]);
  });
});

describe("docx/to-odt/line-spacing.ts takes ParagraphOptions from build-odt's barrel (T4: MR-5)", () => {
  // MR-5: a pathway never reaches into another module's definers; build-odt's
  // barrel publishes ParagraphOptions (src/build-or-fill/build-odt/index.ts).
  test("it imports nothing from build-odt/types.js, a definer (T4: MR-5, MR-1)", () => {
    const specifiers = importSpecifiers("src/docx/to-odt/line-spacing.ts");
    expect(specifiers.filter((s) => s.endsWith("/build-odt/types.js"))).toEqual([]);
    expect(specifiers).toContain("../../build-or-fill/build-odt/index.js");
  });
});
