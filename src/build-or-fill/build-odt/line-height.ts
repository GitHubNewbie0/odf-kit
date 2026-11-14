/**
 * The builder's line-height options → ODF attribute values (#106).
 *
 * T4: D106-4. Each option writes its own attribute; a value the ODF 1.4
 * grammar does not permit for that attribute is refused with a TypeError at
 * the API boundary (addParagraph, addHeading). The throw is ruled for these
 * three options only (LEAD-061 stays open for the rest).
 *
 *   lineHeight        → fo:line-height              normal | nonNegativeLength | percent
 *   lineHeightAtLeast → style:line-height-at-least  nonNegativeLength
 *   lineSpacing       → style:line-spacing          length
 *
 * T1: rng:12465, 12474, 12479 (spec/odf-attributes.json).
 */

import { convertDecimal } from "../../core/length.js";
import type { ParagraphOptions } from "./types.js";

// T1: the datatype patterns, spec/odf-datatypes.json. An XSD pattern
// matches the whole value, hence the anchors.
// length, rng:6951 (negative permitted).
const LENGTH = /^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)(cm|mm|in|pt|pc|px)$/;
// nonNegativeLength, rng:7070.
const NON_NEGATIVE_LENGTH = /^([0-9]+(\.[0-9]*)?|\.[0-9]+)(cm|mm|in|pt|pc|px)$/;
// percent, rng:9082.
const PERCENT = /^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)%$/;

/** The attribute values the three options write; absent options are absent. */
export interface LineHeightAttributes {
  "fo:line-height"?: string;
  "style:line-height-at-least"?: string;
  "style:line-spacing"?: string;
}

function refuse(option: string, value: unknown, why: string, cause?: unknown): never {
  throw new TypeError(
    `ParagraphOptions.${option}: ${JSON.stringify(value) ?? String(value)} is refused: ${why}`,
    cause === undefined ? undefined : { cause },
  );
}

/**
 * A verbatim value below 0: a leading "-" and a nonzero digit. A value of 0
 * is not negative, whatever its sign (T4: D106-4 third bullet).
 */
function isBelowZero(value: string): boolean {
  const m = /^-([0-9]*\.?[0-9]*)/.exec(value);
  return m !== null && /[1-9]/.test(m[1] ?? "");
}

/**
 * A length the grammar permits, as written. A px length is a conversion
 * handed to us, never emitted: it is written in pt by the length core's
 * exact interval method, the same conversion htmlToOdt uses for CSS px
 * (T4: D8, D8a, D8c). Anything else is handed truth, verbatim (T4: D8).
 */
function lengthAsWritten(option: string, value: string): string {
  if (!value.endsWith("px")) return value;
  try {
    return convertDecimal(value.slice(0, -2), "px", "pt");
  } catch (e) {
    // The core refuses past its numeric bound or depth (src/core/length.ts).
    return refuse(option, value, "the px value cannot be converted to pt exactly", e);
  }
}

/**
 * A non-negative finite number as a percent, exactly: the decimal point of
 * String(n) (the shortest decimal form, exponent form included) moves two
 * places right. Nothing is rounded and no float arithmetic is done
 * (T4: D106-4 fourth bullet, D8). -0 prints as "0", so it gives "0%".
 */
function numberAsPercent(n: number): string {
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(n));
  if (!m) return refuse("lineHeight", n, "not a finite non-negative number");
  const frac = m[2] ?? "";
  const digits = BigInt(`${m[1]}${frac}`);
  // value = digits × 10^-scale; × 100 lowers the scale by 2.
  const scale = frac.length - Number(m[3] ?? "0") - 2;
  if (scale <= 0) return `${digits * 10n ** BigInt(-scale)}%`;
  const s = digits.toString().padStart(scale + 1, "0");
  const fraction = s.slice(-scale).replace(/0+$/, "");
  return `${s.slice(0, -scale)}${fraction === "" ? "" : `.${fraction}`}%`;
}

function lineHeightValue(value: unknown): string {
  if (typeof value === "number") {
    // T4: D106-4 second bullet: a number that is not finite or is negative.
    if (!Number.isFinite(value) || value < 0) {
      return refuse("lineHeight", value, "a number must be finite and not negative");
    }
    return numberAsPercent(value);
  }
  if (typeof value !== "string") return refuse("lineHeight", value, "not a number or a string");
  if (value === "normal") return value;
  if (PERCENT.test(value)) {
    // T4: D106-4 third bullet: XSL 1.0 §7.15.4, "Negative values are
    // illegal" (spec/w3c-xsl/REC-xsl-20011015/xslspec.txt l.23861–23862).
    if (isBelowZero(value)) return refuse("lineHeight", value, "a percent must not be negative");
    return value;
  }
  if (NON_NEGATIVE_LENGTH.test(value)) return lengthAsWritten("lineHeight", value);
  return refuse(
    "lineHeight",
    value,
    'ODF 1.4 permits "normal", a non-negative length or a percent',
  );
}

function lengthOptionValue(option: string, value: unknown, pattern: RegExp, what: string): string {
  // T4: D106-4 first bullet: a string only; a length needs a unit.
  if (typeof value !== "string") return refuse(option, value, "a length must be a string");
  if (!pattern.test(value)) return refuse(option, value, `ODF 1.4 permits ${what}`);
  return lengthAsWritten(option, value);
}

/**
 * The three line-height attributes `opts` writes, or a TypeError for the
 * first refused value. Pure: called at the API boundary to refuse, and
 * again when the automatic style is written.
 */
export function lineHeightAttributes(opts: ParagraphOptions | undefined): LineHeightAttributes {
  const out: LineHeightAttributes = {};
  if (opts === undefined) return out;
  if (opts.lineHeight !== undefined) out["fo:line-height"] = lineHeightValue(opts.lineHeight);
  if (opts.lineHeightAtLeast !== undefined) {
    out["style:line-height-at-least"] = lengthOptionValue(
      "lineHeightAtLeast",
      opts.lineHeightAtLeast,
      NON_NEGATIVE_LENGTH,
      "a non-negative length",
    );
  }
  if (opts.lineSpacing !== undefined) {
    out["style:line-spacing"] = lengthOptionValue(
      "lineSpacing",
      opts.lineSpacing,
      LENGTH,
      "a length",
    );
  }
  return out;
}
