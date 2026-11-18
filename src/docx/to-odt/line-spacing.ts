/**
 * DOCX w:spacing line spacing → the ODF line-height setting (#106, #86).
 *
 * T4: D106-5. w:lineRule "auto" → an fo:line-height percent; "exact" → an
 * fo:line-height length; "atLeast" → a style:line-height-at-least length.
 * Each is converted exactly (D8). A value with no ODF form writes nothing
 * and adds one warnings entry (C-2 Part 3); nothing here throws, and the
 * builder is never handed a value D106-4 refuses.
 *
 * ECMA-376 Part 1 §17.3.1.33: under atLeast or exact, w:line is "twentieths
 * of a point"; under auto, "240ths of a line". §17.18.81: w:line is
 * ST_SignedTwipsMeasure, an integer or a universal measure (§22.9.2.15).
 *
 * An auto value counts lines and an ODF percent counts font sizes
 * (ODF 1.4 §20.204), so that mapping is not exact under the letter of ODF;
 * no exact mapping exists without font metrics (D106-5 second bullet).
 */

import {
  convertQuantized,
  convertQuantizedToPercent,
  excerpt,
  isBelowZero,
  MAX_NUMERIC_LEXICAL,
} from "../../core/index.js";
import type { ParagraphOptions } from "../../build-or-fill/build-odt/index.js";
import type { DocxLineSpacing } from "./types.js";

// ECMA-376 Part 1 §17.18.81 ST_SignedTwipsMeasure: xsd:integer ...
const TWIPS = /^[-+]?\d+$/;
// ... or §22.9.2.15 ST_UniversalMeasure.
const UNIVERSAL_MEASURE = /^-?\d+(?:\.\d+)?(mm|cm|in|pt|pc|pi)$/;
// ECMA-376 Part 1 §17.3.1.33: auto counts 240ths of a line.
const AUTO_PER_LINE = 240n;

type LineHeightOptions = Pick<ParagraphOptions, "lineHeight" | "lineHeightAtLeast">;

function warn(warnings: string[], s: DocxLineSpacing, why: string): LineHeightOptions {
  // Document text is echoed through core's excerpt, the repo's one limit (T4: MR-4).
  warnings.push(
    `w:spacing w:line="${excerpt(s.line)}" w:lineRule="${excerpt(s.rule)}": ${why} — line spacing not converted`,
  );
  return {};
}

/**
 * A universal measure as an ODF length: digits and unit kept (D8, handed
 * truth), "pi" written "pc" (ECMA-376 §22.9.2.15: each is 12pt). A value of
 * 0 is not negative, whatever its sign (D106-4 third bullet), and T1's
 * nonNegativeLength has no "-", so a zero's sign is dropped.
 */
function measureAsLength(measure: string, unit: string): string {
  const digits = measure.slice(0, -unit.length);
  return `${digits.startsWith("-") ? digits.slice(1) : digits}${unit === "pi" ? "pc" : unit}`;
}

/**
 * The line-height options one w:spacing line setting maps to, or none and
 * a warnings entry.
 */
export function lineSpacingToOptions(s: DocxLineSpacing, warnings: string[]): LineHeightOptions {
  // Bound before any BigInt or pattern work on document text (core bound).
  if (s.line.length > MAX_NUMERIC_LEXICAL) return warn(warnings, s, "the value is too long");
  const rule = s.rule;
  if (rule !== "auto" && rule !== "exact" && rule !== "atLeast") {
    // ECMA-376 Part 1 §17.18.48 ST_LineSpacingRule: auto, exact, atLeast.
    return warn(warnings, s, "the line rule is not auto, exact or atLeast");
  }

  if (TWIPS.test(s.line)) {
    const count = BigInt(s.line);
    if (count < 0n) return warn(warnings, s, "a negative line spacing has no ODF form");
    if (rule === "auto") return { lineHeight: convertQuantizedToPercent(count, AUTO_PER_LINE) };
    const length = convertQuantized(count, "twip", "pt");
    return rule === "exact" ? { lineHeight: length } : { lineHeightAtLeast: length };
  }

  const measure = UNIVERSAL_MEASURE.exec(s.line);
  if (measure === null) return warn(warnings, s, "the value is not a twips measure");
  // ECMA-376 §17.3.1.33: auto counts 240ths of a line, which a unit cannot.
  if (rule === "auto") return warn(warnings, s, "a unit under the auto rule has no ODF form");
  if (isBelowZero(s.line)) return warn(warnings, s, "a negative line spacing has no ODF form");
  const length = measureAsLength(s.line, measure[1] ?? "");
  return rule === "exact" ? { lineHeight: length } : { lineHeightAtLeast: length };
}
