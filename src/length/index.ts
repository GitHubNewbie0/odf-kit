/**
 * ODF length utilities — exact-rational parsing, conversion, comparison and
 * formatting of ODF length values.
 *
 * Import from "odf-kit/length":
 *
 * ```typescript
 * import { parseOdfValue, convertQuantized, compareLengths } from "odf-kit/length";
 * ```
 *
 * This is the user-shaped surface of the exact-rational length core shipped
 * internally in v0.13.12 (T4: D8 / A7-D11, ruled 2026-08-09). The dividing
 * line is principled: functions whose parameters speak strings, numbers or
 * OdfValue are public; the rational/interval engine — Rational, cmpRational,
 * Interval, intervalFromQuantized, intervalFromDecimal, shortestInUnit and
 * chooseGeometricUnit — stays private to src/core/length.ts.
 *
 * T4: D8 — handed truth is preserved verbatim; conversions use the BigInt
 * rational-interval method and the shortest decimal in the interval. No
 * floats, no toFixed, no Math.round on lengths.
 */
export { VERSION } from "../version.js";

export type { Unit, SourceUnit, OdfValue } from "../core/length.js";
export {
  parseOdfValue,
  lengthValue,
  formatOdfValue,
  canonicalForm,
  toNumber,
  compareLengths,
  isExactInUnit,
  convertDecimal,
  convertQuantized,
} from "../core/length.js";
