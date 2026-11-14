// tests/core/length.test.ts
//
// Tests for the length core (units-and-lengths-foundation.md D8/D8a/b/c).
// Fixture values are taken directly from the foundation doc's worked
// examples so the tests are traceable to the decisions they enforce.
//
// NOTE: verify this import path against the repo's existing test
// convention before committing (e.g. whether tests import with a .js
// extension); adjust to match.

import {
  parseOdfValue,
  lengthValue,
  formatOdfValue,
  canonicalForm,
  toNumber,
  compareLengths,
  isExactInUnit,
  intervalFromQuantized,
  convertQuantized,
  convertDecimal,
  chooseGeometricUnit,
  isBelowZero,
  decimalToPercent,
  convertQuantizedToPercent,
} from "../../src/core/length.js";

// ─── Case 1: handed truth — lexical preservation ───────────────────────

describe("length core — Case 1 lexical preservation", () => {
  test('"20mm" round-trips byte-identically', () => {
    const v = parseOdfValue("20mm")!;
    expect(formatOdfValue(v)).toBe("20mm");
  });

  test('"0.4925in" round-trips byte-identically (van den Oever case)', () => {
    // LibreOffice under inch preference writes 1.25cm as 0.4925in.
    // The one thing a fidelity library must not do is hand back 1.25095cm.
    const v = parseOdfValue("0.4925in")!;
    expect(formatOdfValue(v)).toBe("0.4925in");
  });

  test("lengthValue preserves an API caller's form", () => {
    expect(formatOdfValue(lengthValue(2.5, "cm"))).toBe("2.5cm");
    expect(formatOdfValue(lengthValue("12", "pt"))).toBe("12pt");
  });

  test("percent parses and round-trips", () => {
    const v = parseOdfValue("150%")!;
    expect(v.kind).toBe("percent");
    expect(formatOdfValue(v)).toBe("150%");
  });

  test("keywords pass through", () => {
    const v = parseOdfValue("normal")!;
    expect(v).toEqual({ kind: "keyword", value: "normal" });
  });

  test("unitless numbers are rejected (not lengths in ODF)", () => {
    expect(parseOdfValue("12")).toBeUndefined();
  });

  test("garbage is rejected", () => {
    expect(parseOdfValue("12quux")).toBeUndefined();
    expect(parseOdfValue("")).toBeUndefined();
  });

  test("px is accepted on input", () => {
    const v = parseOdfValue("16px")!;
    expect(v.kind).toBe("length");
    expect(formatOdfValue(v)).toBe("16px"); // Case 1: lexical wins
  });
});

// ─── Exact arithmetic at the consumer boundary ─────────────────────────

describe("length core — toNumber", () => {
  test("21cm is exactly 210mm", () => {
    expect(toNumber(parseOdfValue("21cm")!, "mm")).toBe(210);
  });

  test("16px is exactly 12pt", () => {
    expect(toNumber(parseOdfValue("16px")!, "pt")).toBe(12);
  });

  test("percent has no number in a unit", () => {
    expect(toNumber(parseOdfValue("150%")!, "pt")).toBeUndefined();
  });
});

// ─── B1: exact comparison ──────────────────────────────────────────────

describe("length core — compareLengths (B1)", () => {
  test('"11in" > "21cm" (the landscape page B1 got wrong)', () => {
    // parseFloat gave 11 < 21 → portrait. Exact: 279.4mm > 210mm.
    expect(compareLengths("11in", "21cm")).toBe(1);
  });

  test("equal lengths across units compare equal", () => {
    expect(compareLengths("2.54cm", "1in")).toBe(0);
    expect(compareLengths("72pt", "1in")).toBe(0);
  });

  test("non-lengths return undefined rather than a wrong answer", () => {
    expect(compareLengths("150%", "1in")).toBeUndefined();
    expect(compareLengths("normal", "1in")).toBeUndefined();
  });
});

// ─── Case 2: the D8 worked example ─────────────────────────────────────

describe("length core — Case 2 quantized conversion (D8)", () => {
  test("1417 twips → 2.5cm (the doc's worked example, verbatim)", () => {
    expect(convertQuantized(1417, "twip", "cm")).toBe("2.5cm");
  });

  test("…and 2.5cm converts back to 1417 twips exactly", () => {
    const twips = toNumber(parseOdfValue("2.5cm")!, "pt")! * 20;
    expect(Math.round(twips)).toBe(1417);
  });

  test("1440 twips → 1in in inches, 2.54cm in cm (D8a motivation)", () => {
    expect(convertQuantized(1440, "twip", "in")).toBe("1in");
    expect(convertQuantized(1440, "twip", "cm")).toBe("2.54cm");
  });

  test("300px → 7.94cm (D8b tie-break: nearest nominal 7.9375)", () => {
    expect(convertQuantized(300, "px", "cm")).toBe("7.94cm");
  });

  test("EMU: 914400 EMU (1 inch) → 2.54cm", () => {
    expect(convertQuantized(914400, "emu", "cm")).toBe("2.54cm");
  });
});

// ─── D8c: fractional sources ───────────────────────────────────────────

describe("length core — D8c fractional quantum", () => {
  test('"12.5" px (quantum 0.1px) → 9.4pt', () => {
    expect(convertDecimal("12.5", "px", "pt")).toBe("9.4pt");
  });

  test("integer-string source behaves like integer quantum", () => {
    expect(convertDecimal("300", "px", "cm")).toBe("7.94cm");
  });
});

// ─── Canonical form: cm-else-pt, never px ──────────────────────────────

describe("length core — canonical form (Case 3)", () => {
  test("synthesized px value emits pt, never px", () => {
    const v = parseOdfValue("16px")!;
    // Strip the lexical to simulate an odf-kit-computed value.
    const synthesized = { ...v, lexical: undefined };
    expect(canonicalForm(synthesized)).toBe("12pt");
    expect(formatOdfValue(synthesized)).toBe("12pt");
  });

  test("inch-derived values are exact in cm", () => {
    const v = parseOdfValue("0.4925in")!;
    expect(isExactInUnit(v, "cm")).toBe(true);
    expect(canonicalForm({ ...v, lexical: undefined })).toBe("1.25095cm");
  });

  test("pt values are NOT exact in cm, and canonicalize to pt", () => {
    const v = parseOdfValue("12pt")!;
    expect(isExactInUnit(v, "cm")).toBe(false);
    expect(isExactInUnit(v, "pt")).toBe(true);
    expect(canonicalForm({ ...v, lexical: undefined })).toBe("12pt");
  });
});

// ─── D8a: the geometric unit vote ──────────────────────────────────────

describe("length core — D8a digit-count vote", () => {
  test("inch-round margins outvote a metric page (the A4-inch author)", () => {
    // 1in margins (1440 twips) around an A4 page (11906 × 16838 twips).
    const intervals = [
      intervalFromQuantized(1440, "twip"), // margin: 1in / 2.54cm
      intervalFromQuantized(1440, "twip"),
      intervalFromQuantized(1440, "twip"),
      intervalFromQuantized(1440, "twip"),
      intervalFromQuantized(11906, "twip"), // A4 width
      intervalFromQuantized(16838, "twip"), // A4 height
    ];
    // Four 1-digit inch margins beat the metric page dimensions.
    expect(chooseGeometricUnit(intervals, "cm")).toBe("in");
  });

  test("metric-round values vote metric", () => {
    // 2cm margins (1134 twips) on the same A4 page.
    const intervals = [
      intervalFromQuantized(1134, "twip"),
      intervalFromQuantized(1134, "twip"),
      intervalFromQuantized(1134, "twip"),
      intervalFromQuantized(1134, "twip"),
      intervalFromQuantized(11906, "twip"),
      intervalFromQuantized(16838, "twip"),
    ];
    const winner = chooseGeometricUnit(intervals, "cm");
    expect(winner === "cm" || winner === "mm").toBe(true);
  });

  test("empty population falls back to page-native unit", () => {
    expect(chooseGeometricUnit([], "in")).toBe("in");
    expect(chooseGeometricUnit([])).toBe("cm");
  });
});

// ─── Determinism ───────────────────────────────────────────────────────

describe("length core — determinism", () => {
  test("same input, same output, every time (no float wobble)", () => {
    const a = convertQuantized(1417, "twip", "cm");
    for (let i = 0; i < 100; i++) {
      expect(convertQuantized(1417, "twip", "cm")).toBe(a);
    }
  });
});

// ─── Sign and percent: lexical, exact (D106-3, D106-4, D8) ─────────────

describe("length core — isBelowZero", () => {
  test.each(["-50%", "-0.5cm", "-.1pt", "-0.001%"])(
    "%p is below zero (T4: D106-3 first bullet, D106-4 third bullet)",
    (v) => {
      expect(isBelowZero(v)).toBe(true);
    },
  );

  test.each(["-0%", "-0.00%", "-0cm", "-.0pt", "0%", "50%", "0.5cm", "normal", "+5%", ""])(
    "%p is not below zero: a value of 0 is not negative, whatever its sign (T4: D106-4 third bullet)",
    (v) => {
      expect(isBelowZero(v)).toBe(false);
    },
  );
});

describe("length core — decimalToPercent", () => {
  test.each([
    ["1.555", "155.5%"],
    ["1.005", "100.5%"],
    ["1e-7", "0.00001%"],
    ["1.5", "150%"],
    ["2", "200%"],
    ["1", "100%"],
    ["0", "0%"],
    ["12.", "1200%"],
    [".5", "50%"],
    ["1.5e+21", "150000000000000000000000%"],
  ])(
    "%p → %p: the decimal point moves two places, nothing rounded (T4: D106-4 fourth bullet, D8)",
    (d, p) => {
      expect(decimalToPercent(d)).toBe(p);
    },
  );

  test.each([String(Number.MIN_VALUE), String(Number.MAX_VALUE)])(
    "the extreme finite numbers' String() forms are accepted (%p) (T4: D106-4 fourth bullet: any finite number)",
    (d) => {
      expect(decimalToPercent(d)).toMatch(/^\d+(\.\d+)?%$/);
    },
  );

  test.each([
    "",
    ".",
    "-1",
    "+1",
    "1.5em",
    "1e",
    "1e999999999",
    "1e-999999999",
    "1".repeat(65),
    "abc",
  ])(
    "%p → undefined: not a non-negative decimal within the core's bounds (T4: D8; MAX_NUMERIC_LEXICAL)",
    (d) => {
      expect(decimalToPercent(d)).toBeUndefined();
    },
  );
});

describe("length core — convertQuantizedToPercent (D8 Case 2)", () => {
  test.each([
    [360n, "150%"],
    [276n, "115%"],
    [259n, "108%"],
    [240n, "100%"],
    [0n, "0%"],
    [1n, "0.4%"],
  ])(
    "%p 240ths → %p: the shortest decimal in [t−½, t+½)/240 × 100, nearest the nominal on ties (T4: D8 Case 2, D8b; D106-5; ECMA-376 Part 1 §17.3.1.33 '240ths of a line')",
    (count, expected) => {
      expect(convertQuantizedToPercent(count, 240n)).toBe(expected);
    },
  );
});
