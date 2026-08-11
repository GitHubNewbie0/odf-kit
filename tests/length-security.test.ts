// tests/length-security.test.ts
//
// Security coverage for the length core's ReDoS hardening (v0.14.1):
// CodeQL js/polynomial-redos #28/#29 (UNIT_RE/PERCENT_RE), #30
// (placeDecimal), and the 64-character input bound ruled 2026-08-11.
//
// INPUT TYPE — every input in this file is a CONSTRUCTED STRING, and that
// is the fit-for-purpose choice rather than a concession. Q1–Q5 of
// test-fixture-strategy-plan.md §2 were considered; no fixture fits. Q2 is
// the operative discriminator ("Can a real editor author this case at
// all?"): no producer emits a trailing-dot lexical, a 65-character numeric,
// or `digits + "x"` garbage, and the subject under test is an expression's
// accept/reject boundary, which is not a document property at all — so
// constructed input is the ONLY possible input. Q3 does not apply: its
// force is for tests asserting what producers emit, and nothing here does.
// Q1, Q4 and Q5 are not engaged — no renderer isolation, no XML bytes to
// display beside the assertion, no producer-specific behaviour.
//
// No timing assertions anywhere: wall-clock tests flake, and equivalence
// and boundedness are the properties that actually matter.

import { describe, expect, test } from "@jest/globals";
import {
  parseOdfValue,
  lengthValue,
  formatOdfValue,
  canonicalForm,
  convertQuantized,
  convertDecimal,
  shortestInUnit,
  intervalFromQuantized,
  intervalFromDecimal,
} from "../src/core/length.js";

// ─── DEFECTS UNDER TEST — not implementation ───────────────────────────
//
// The expressions below are the PRE-FIX expressions, quoted verbatim from
// a6b90c6 as the defects CodeQL #28/#29 reported. They exist here only as
// the differential's control side. They must NEVER be copied back into
// src/ — their `\d+\.?\d*` core is the polynomial-backtracking defect
// itself, and this file is where that shape is allowed to survive.

/** DEFECT (a6b90c6, CodeQL #28) — pre-fix UNIT_RE. Do not reuse. */
const OLD_UNIT_RE = /^([-+]?(?:\d+\.?\d*|\.\d+))(cm|mm|in|pt|pc|px)$/;
/** DEFECT (a6b90c6, CodeQL #29) — pre-fix PERCENT_RE. Do not reuse. */
const OLD_PERCENT_RE = /^([-+]?(?:\d+\.?\d*|\.\d+))%$/;

// The shipped expressions, mirrored. `\d+(?:\.\d*)?` replaces `\d+\.?\d*`:
// the old optional `\.?` let `\d+` and `\d*` apply to the same digit run,
// giving ~n²/2 backtracking paths before the anchored suffix failed.
const NEW_UNIT_RE = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+))(cm|mm|in|pt|pc|px)$/;
const NEW_PERCENT_RE = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+))%$/;

// parseDecimal's expression, UNCHANGED by this work. Quoted so the
// differential can model the WHOLE pre-change pipeline rather than only
// its first gate — a lexical UNIT_RE accepts can still be rejected here
// ("12." matches UNIT_RE but is not a decimal). Not a defect; still not
// implementation — src/core/length.ts owns the real one.
const DECIMAL_RE = /^([-+]?)(\d+)?(?:\.(\d+))?$/;

function decimalAccepts(raw: string): boolean {
  const m = DECIMAL_RE.exec(raw);
  return !!m && !(m[2] === undefined && m[3] === undefined);
}

type Shape = { kind: string; unit?: string; lexical?: string };

/** What parseOdfValue returned for `input` BEFORE this change. */
function oldPipeline(input: string): Shape | undefined {
  const trimmed = input.trim();
  const u = OLD_UNIT_RE.exec(trimmed);
  if (u) return decimalAccepts(u[1]) ? { kind: "length", unit: u[2], lexical: trimmed } : undefined;
  const p = OLD_PERCENT_RE.exec(trimmed);
  if (p) return decimalAccepts(p[1]) ? { kind: "percent", lexical: trimmed } : undefined;
  if (/^[A-Za-z][A-Za-z-]*$/.test(trimmed)) return { kind: "keyword" };
  return undefined;
}

function actualShape(input: string): Shape | undefined {
  const v = parseOdfValue(input);
  if (!v) return undefined;
  if (v.kind === "length") return { kind: "length", unit: v.unit, lexical: v.lexical };
  if (v.kind === "percent") return { kind: "percent", lexical: v.lexical };
  return { kind: "keyword" };
}

// ─── Corpus — the T1 grammar family ────────────────────────────────────
//
// T1 (spec/odf-1.3-length-datatypes.json): a length is a decimal followed
// by one of cm/mm/in/pt/pc/px; the decimal admits integer, trailing-dot,
// fractional and leading-dot forms, signed or unsigned.

const UNITS = ["cm", "mm", "in", "pt", "pc", "px"] as const;
const SIGNS = ["", "+", "-"];
const SHAPES = ["12", "12.", "12.5", ".5", "0", "0.0", "000123", "1.500", ".0", "7"];

const CORPUS: string[] = [];
for (const sign of SIGNS) {
  for (const shape of SHAPES) {
    for (const unit of UNITS) CORPUS.push(`${sign}${shape}${unit}`);
    CORPUS.push(`${sign}${shape}%`);
    CORPUS.push(`${sign}${shape}`); // unitless — never a length in ODF
  }
}
CORPUS.push(
  "normal",
  "auto",
  "thin",
  "inherit",
  "",
  " ",
  "   ",
  "cm",
  "%",
  "px",
  "-",
  "+",
  ".",
  "-.",
  "12 cm",
  "12cmx",
  "1.2.3cm",
  "1e3cm",
  "NaNcm",
  "  12cm  ",
);
// Adversarial but within the bound: long digit runs are precisely the
// input class that made the pre-fix expressions quadratic.
for (const k of [8, 16, 32, 48, 60]) {
  const run = "9".repeat(k);
  CORPUS.push(`${run}cm`, `${run}.cm`, `${run}%`, `${run}x`, `${run}.`, `.${run}cm`);
}
CORPUS.push(`0${"9".repeat(60)}pt`, `${"0".repeat(60)}1cm`);

describe("length core — regex rewrites are language-equivalent (CodeQL #28/#29)", () => {
  test("UNIT_RE: rewrite matches and captures identically to the pre-fix expression", () => {
    for (const input of CORPUS) {
      expect(input.length).toBeLessThanOrEqual(64); // differential holds below the bound
      const before = OLD_UNIT_RE.exec(input);
      const after = NEW_UNIT_RE.exec(input);
      expect({ input, m: after && [...after] }).toEqual({ input, m: before && [...before] });
    }
  });

  test("PERCENT_RE: rewrite matches and captures identically to the pre-fix expression", () => {
    for (const input of CORPUS) {
      const before = OLD_PERCENT_RE.exec(input);
      const after = NEW_PERCENT_RE.exec(input);
      expect({ input, m: after && [...after] }).toEqual({ input, m: before && [...before] });
    }
  });

  test("parseOdfValue's observable result is unchanged from the pre-change pipeline", () => {
    // Composed differential: anchors the equivalence claim to the SHIPPED
    // module rather than to the mirrored literals above. The expression is
    // only the first gate, so comparing expressions alone cannot see a
    // change in what the module as a whole accepts.
    for (const input of CORPUS) {
      expect({ input, got: actualShape(input) }).toEqual({ input, got: oldPipeline(input) });
    }
  });
});

// ─── The 64-char bound (T4, ruled 2026-08-11) ──────────────────────────
//
// MAX_NUMERIC_LEXICAL = 64 is derived from the module's own precision
// ceilings: the emission search caps at MAX_EMISSION_SEARCH_K = 25
// fractional digits, and toNumber's float boundary is 15 significant
// digits. Deliberate T1 deviation — the RNG's [0-9]* is unbounded — taken
// to bound parse cost on crafted input.

const DIGITS = "1234567890";
const digits = (k: number) => DIGITS.repeat(Math.ceil(k / 10)).slice(0, k);
/** A valid `<decimal>cm` lexical of exactly `total` characters. */
const lexicalOfLength = (total: number) => `1.${digits(total - 4)}cm`;
/** A valid bare decimal of exactly `total` characters. */
const decimalOfLength = (total: number) => `1.${digits(total - 2)}`;

describe("length core — 64-character input bound", () => {
  test("a 63-character lexical parses", () => {
    const input = lexicalOfLength(63);
    expect(input).toHaveLength(63);
    expect(parseOdfValue(input)?.kind).toBe("length");
  });

  test("a 64-character lexical parses and round-trips byte-identically", () => {
    // D8 Case 1: handed truth is preserved verbatim. The bound admits 64,
    // so lexical preservation is unaffected AT the boundary.
    const input = lexicalOfLength(64);
    expect(input).toHaveLength(64);
    const v = parseOdfValue(input);
    expect(v?.kind).toBe("length");
    expect(formatOdfValue(v!)).toBe(input);
  });

  test("a 65-character lexical is rejected", () => {
    const input = lexicalOfLength(65);
    expect(input).toHaveLength(65);
    expect(parseOdfValue(input)).toBeUndefined();
  });

  test("lengthValue throws at 65 characters, naming the bound", () => {
    const input = decimalOfLength(65);
    expect(input).toHaveLength(65);
    expect(() => lengthValue(input, "cm")).toThrow(/exceeds 64 chars/);
  });

  test("intervalFromDecimal throws at 65 characters, naming the bound", () => {
    expect(() => intervalFromDecimal(decimalOfLength(65), "px")).toThrow(/exceeds 64 chars/);
  });

  test("the rejection message excerpts rather than echoing the input back whole", () => {
    let message = "";
    try {
      lengthValue(decimalOfLength(5000), "cm");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/exceeds 64 chars/);
    expect(message.length).toBeLessThan(200);
  });

  test("a keyword longer than the bound is rejected — the guard is pre-regex by design", () => {
    // Consequence of the ruled placement: the guard runs before ANY
    // expression, so no attacker-supplied byte reaches a pattern. No ODF
    // keyword approaches this length; recorded so the behaviour is
    // deliberate rather than incidental.
    expect(parseOdfValue("a".repeat(64))?.kind).toBe("keyword");
    expect(parseOdfValue("a".repeat(65))).toBeUndefined();
  });
});

// ─── 3c: the composed guarantee behind placeDecimal (CodeQL #30) ───────
//
// placeDecimal's trailing-zero strip is UNREACHABLE from every public
// entry point — all three of its states (trailing-zero run, bare-dot
// exposure, full-strip-to-zero). Proof: rat() normalizes to lowest terms,
// so exactDecimal's scaled numerator is n·2^(k−a)·5^(k−b) for d = 2^a·5^b
// with gcd(n,d) = 1, never divisible by 10; and shortestInUnit returns at
// the MINIMAL k, where an m ending in 0 would mean m/10 was a candidate at
// k−1. Measured agreement: 194,453 executions of the branch across 304,580
// public-entry calls fired the strip zero times.
//
// So the property worth asserting is not the stripping but the COMPOSED
// GUARANTEE that makes it dead: no decimal this module COMPUTES ever
// carries a trailing zero in its fractional part or ends in a bare dot.
// The character-walk rewrite is what removes the #30 cost either way.

const ZEROY = [
  "1.500",
  "2.5000",
  "0.10",
  "10.0",
  "100.00",
  "0.000",
  "0.0",
  "1.0",
  "25.000",
  "0.500",
  "-1.500",
  "-0.0",
];
const SOURCES = ["cm", "mm", "in", "pt", "pc", "px", "twip", "emu"] as const;
const TARGETS = ["cm", "mm", "in", "pt", "pc"] as const;

/** The guarantee, as a predicate. Integers may end in 0 ("10cm"); a
 *  FRACTIONAL part may not, and nothing may end in a bare dot. */
function violatesGuarantee(emitted: string): boolean {
  const num = emitted.replace(/(cm|mm|in|pt|pc|px|%)$/, "");
  return num.includes(".") && (num.endsWith("0") || num.endsWith("."));
}

describe("length core — computed decimals never carry trailing zeros (CodeQL #30)", () => {
  test("no value this module computes ends in a fractional zero or a bare dot", () => {
    const emitted: string[] = [];
    for (const n of ZEROY) {
      for (const u of UNITS) emitted.push(canonicalForm(parseOdfValue(`${n}${u}`)!));
      emitted.push(canonicalForm(parseOdfValue(`${n}%`)!));
    }
    for (const c of [0, 1, -1, 10, 100, 1000, 1440, 1417, 914400, -1440, 5760000]) {
      for (const s of SOURCES) for (const t of TARGETS) emitted.push(convertQuantized(c, s, t));
    }
    for (const n of ZEROY) {
      for (const s of SOURCES) for (const t of TARGETS) emitted.push(convertDecimal(n, s, t));
    }
    for (const c of [0, 1, 25, 100]) {
      for (const s of SOURCES) {
        for (const t of TARGETS) {
          emitted.push(shortestInUnit(intervalFromQuantized(c, s), t));
          emitted.push(shortestInUnit(intervalFromDecimal(`${c}.500`, s), t));
        }
      }
    }
    // Guard the sweep itself: a regression that made everything throw or
    // return nothing must not pass by vacuous truth.
    expect(emitted.length).toBeGreaterThan(1000);
    expect(emitted.filter(violatesGuarantee)).toEqual([]);
  });

  test("Case-1 lexicals are preserved WITH their trailing zeros — the guarantee is about computed values", () => {
    // D8 Case 1: handed truth is returned verbatim. "1.500cm" in, "1.500cm"
    // out. The guarantee above governs what the module computes, not what
    // it preserves — conflating the two would break lexical fidelity.
    expect(formatOdfValue(parseOdfValue("1.500cm")!)).toBe("1.500cm");
    expect(canonicalForm(parseOdfValue("1.500cm")!)).toBe("1.5cm");
  });

  test("zero and negatives emit canonically", () => {
    expect(canonicalForm(parseOdfValue("0.000cm")!)).toBe("0cm");
    expect(canonicalForm(parseOdfValue("-1.500cm")!)).toBe("-1.5cm");
  });
});
