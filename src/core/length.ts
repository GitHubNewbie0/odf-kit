// src/core/length.ts
//
// The length core. Implements the system settled in
// units-and-lengths-foundation.md D8/D8a/D8b/D8c (July 29, 2026).
//
// Principles (D8):
//  - NO floating-point arithmetic in this module. All values are exact
//    BigInt rationals. Floats appear only at the consumer boundary
//    (`toNumber`), when a caller asks for a number in a named unit.
//  - Case 1 (handed truth): ODF input or an API-supplied value+unit is
//    preserved lexically. "20mm" in, "20mm" out. Nothing is inferred.
//  - Case 2 (handed a conversion): quantized sources (DOCX twips/EMU,
//    CSS px) imply an interval [t−½q, t+½q) — the source's quantum IS
//    the tolerance. We emit the shortest decimal inside that interval
//    (D8b: nearest the nominal on ties; D8c: fractional sources take
//    their quantum from the last significant digit).
//  - Case 3 (odf-kit converts): same algorithm, same criterion — the
//    shortest representation that converts back to the held value.
//
// Unit factors are exact rationals over millimetres:
//   1 in = 127/5 mm      1 pt = 127/360 mm     1 pc = 127/30 mm
//   1 px = 127/480 mm (96 dpi, exact per CSS)  1 twip = 127/7200 mm
//   1 EMU = 127/4572000 mm (914400 per inch)
// Primes 127 and 3 in these factors are why no fixed integer grid
// (mm100, EMU) can hold every legal value — see the mm100 rejection in
// the foundation doc. The exact rational strictly contains them all.
//
// Per-attribute grammar (which units/forms are legal WHERE) is the
// schema layer's job, driven by spec/odf-1.3-length-datatypes.json.
// This module accepts the full lexical family and validates nothing
// attribute-specific.
//
// Policy (foundation §12): px is accepted everywhere it is legal, and
// NEVER emitted. Canonical output (Case 3) is cm where the value is
// exact in cm, otherwise pt — computable, not heuristic: a value is
// exact in cm iff its mm-denominator's prime factors are ⊆ {2, 5}.
// Every legal decimal input terminates in one of the two (in/mm/cm →
// cm; pt/pc/px/twip/EMU → pt).

// ─── Input bound ───────────────────────────────────────────────────────

/**
 * Maximum length of a numeric lexical accepted anywhere in this module.
 * Derived, not chosen: shortestInUnit's emission search caps at k=25
 * fractional digits and toNumber's float boundary is 15 significant
 * digits — no value distinction beyond that depth survives any pathway.
 * 64 chars holds sign + 30 integer digits + dot + 30 fractional digits
 * + a 2-char unit: double the module's own deepest precision, orders of
 * magnitude past any observed producer (T3 max ≈ 6 digits).
 * Deliberate T1 deviation: the RNG's [0-9]* is unbounded; we reject
 * grammar-legal-but-pathological input to bound parse cost. CHANGELOG'd.
 */
const MAX_NUMERIC_LEXICAL = 64;

/**
 * Excerpt an offending lexical for an error message. Rejected input may be
 * arbitrarily long; never echo it back whole.
 */
function excerpt(s: string): string {
  return s.length > MAX_NUMERIC_LEXICAL ? `${s.slice(0, MAX_NUMERIC_LEXICAL)}…` : s;
}

// ─── Units ─────────────────────────────────────────────────────────────

/** Units that may appear in ODF length lexicals (and be emitted, except px). */
export type Unit = "cm" | "mm" | "in" | "pt" | "pc" | "px";

/** Quantized source units accepted for Case-2 conversion. */
export type SourceUnit = Unit | "twip" | "emu";

/** Exact factor: 1 <unit> = FACTOR_MM[unit] mm. */
const FACTOR_MM: Record<SourceUnit, Rational> = {
  mm: { n: 1n, d: 1n },
  cm: { n: 10n, d: 1n },
  in: { n: 127n, d: 5n },
  pt: { n: 127n, d: 360n },
  pc: { n: 127n, d: 30n },
  px: { n: 127n, d: 480n },
  twip: { n: 127n, d: 7200n },
  emu: { n: 127n, d: 4572000n },
};

/**
 * Default candidates for the D8a geometric vote: the units producers
 * are observed to use for geometry (T3: LibreOffice emits in/cm/mm for
 * geometry, pt for typography). pt and pc are excluded by default —
 * with them in, pica wins spuriously whenever margins are inch-round
 * (6pc = 1in in one digit), a unit no producer emits for geometry.
 * Callers may widen via the `candidates` parameter. px is never a
 * candidate (accept-only policy, foundation §12).
 */
const VOTE_CANDIDATES: readonly Unit[] = ["cm", "mm", "in"];

// ─── Exact rationals ───────────────────────────────────────────────────

/** Normalized rational: d > 0, gcd(|n|, d) = 1. Never construct by hand. */
export interface Rational {
  readonly n: bigint;
  readonly d: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function rat(n: bigint, d: bigint): Rational {
  if (d === 0n) throw new Error("length core: zero denominator");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

function mul(a: Rational, b: Rational): Rational {
  return rat(a.n * b.n, a.d * b.d);
}

function div(a: Rational, b: Rational): Rational {
  if (b.n === 0n) throw new Error("length core: division by zero");
  return rat(a.n * b.d, a.d * b.n);
}

function sub(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

/** Exact comparison: −1, 0, 1. */
export function cmpRational(a: Rational, b: Rational): -1 | 0 | 1 {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}

/** Floor division for BigInt, correct for negative dividends. */
function floorDiv(a: bigint, b: bigint): bigint {
  // b > 0 guaranteed by rat() normalization at all call sites.
  const q = a / b;
  return a % b !== 0n && a < 0n ? q - 1n : q;
}

/** Ceiling division for BigInt, correct for negative dividends. */
function ceilDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a > 0n ? q + 1n : q;
}

/**
 * Parse a decimal string ("2.5", "-0.75", ".5") into an exact rational.
 * This is the ONLY entry point for numeric text; no parseFloat anywhere.
 */
function parseDecimal(raw: string): Rational | undefined {
  // Bound before any regex or BigInt work: 10n ** BigInt(frac.length) below,
  // and exactDecimal's repeated rat()/gcd, both grow with input length.
  if (raw.length > MAX_NUMERIC_LEXICAL) return undefined;
  const m = /^([-+]?)(\d+)?(?:\.(\d+))?$/.exec(raw);
  if (!m || (m[2] === undefined && m[3] === undefined)) return undefined;
  const sign = m[1] === "-" ? -1n : 1n;
  const int = m[2] ?? "";
  const frac = m[3] ?? "";
  const digits = int + frac;
  const n = sign * BigInt(digits === "" ? "0" : digits);
  const d = 10n ** BigInt(frac.length);
  return rat(n, d);
}

// ─── Value model ───────────────────────────────────────────────────────

/**
 * A parsed ODF attribute value.
 *
 * `length.mm` is the exact value in millimetres — the arithmetic truth.
 * `lexical`, when present, is the original source text (Case 1); it is
 * emitted verbatim by formatOdfValue so unmodified values round-trip
 * byte-identically. A value with no lexical was synthesized by odf-kit
 * (Case 2/3) and formats canonically.
 *
 * `percent` keeps the percentage NUMBER (150 for "150%"); what it is
 * relative to is the consuming attribute's business, not this module's.
 *
 * `keyword` is any bare word ("normal", "auto", "thin", …). Whether a
 * given keyword is legal for a given attribute is the schema layer's
 * check; the core just carries it.
 */
export type OdfValue =
  | { kind: "length"; mm: Rational; unit: Unit; lexical?: string }
  | { kind: "percent"; value: Rational; lexical?: string }
  | { kind: "keyword"; value: string };

// The numeric core is `\d+(?:\.\d*)?|\.\d+`, not the older `\d+\.?\d*|\.\d+`.
// Same language — `\d+(?:\.\d*)?` accepts exactly `12`, `12.`, `12.5` — but the
// optional `\.?` in the old form let `\d+` and `\d*` both apply to the same
// digit run, giving ~n²/2 backtracking paths before the anchored suffix failed
// (CodeQL js/polynomial-redos #28/#29). Now each digit run matches one way.
const UNIT_RE = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+))(cm|mm|in|pt|pc|px)$/;
const PERCENT_RE = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+))%$/;
const KEYWORD_RE = /^[A-Za-z][A-Za-z-]*$/;

/**
 * Case 1 — parse an ODF attribute value, preserving the lexical form.
 *
 * Unitless numbers return undefined: ODF lengths always carry a unit,
 * and CSS's unitless line-height is a distinct concept the caller must
 * handle before reaching for a length. (foundation §10, CSS/XSL note)
 */
export function parseOdfValue(raw: string): OdfValue | undefined {
  const trimmed = raw.trim();
  // Pre-regex by design: this is the document-text entry point, so the bound
  // must be applied before any pattern touches attacker-supplied bytes.
  if (trimmed.length > MAX_NUMERIC_LEXICAL) return undefined;
  let m = UNIT_RE.exec(trimmed);
  if (m) {
    const value = parseDecimal(m[1]);
    if (!value) return undefined;
    const unit = m[2] as Unit;
    return { kind: "length", mm: mul(value, FACTOR_MM[unit]), unit, lexical: trimmed };
  }
  m = PERCENT_RE.exec(trimmed);
  if (m) {
    const value = parseDecimal(m[1]);
    if (!value) return undefined;
    return { kind: "percent", value, lexical: trimmed };
  }
  if (KEYWORD_RE.test(trimmed)) return { kind: "keyword", value: trimmed };
  return undefined;
}

/**
 * Case 1 — an API caller hands us a value+unit. Preserved, not converted.
 * Numbers are stringified as given; if the caller's float has artifacts,
 * those are the caller's artifacts, faithfully kept.
 */
export function lengthValue(value: number | string, unit: Unit): OdfValue {
  const text = typeof value === "number" ? String(value) : value.trim();
  const dec = parseDecimal(text);
  if (!dec)
    throw new Error(
      `length core: not a decimal value or exceeds ${MAX_NUMERIC_LEXICAL} chars: "${excerpt(text)}"`,
    );
  return { kind: "length", mm: mul(dec, FACTOR_MM[unit]), unit, lexical: `${text}${unit}` };
}

// ─── Formatting ────────────────────────────────────────────────────────

/** Is the value exactly representable as a finite decimal in `unit`? */
export function isExactInUnit(v: OdfValue, unit: Unit): boolean {
  if (v.kind !== "length") return false;
  const inUnit = div(v.mm, FACTOR_MM[unit]);
  // Finite decimal ⇔ denominator's primes ⊆ {2, 5}.
  let d = inUnit.d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  return d === 1n;
}

/** Shortest exact decimal for a rational KNOWN to terminate. */
function exactDecimal(r: Rational): string {
  // Scale until integral. Terminates because caller guarantees 2,5-only.
  let k = 0n;
  let scaled = r;
  while (scaled.d !== 1n) {
    scaled = rat(scaled.n * 10n, scaled.d);
    k += 1n;
  }
  return placeDecimal(scaled.n, k);
}

/** Render m · 10^−k without floating point. */
function placeDecimal(m: bigint, k: bigint): string {
  const neg = m < 0n;
  let s = (neg ? -m : m).toString();
  const kk = Number(k);
  if (kk > 0) {
    while (s.length <= kk) s = "0" + s;
    s = s.slice(0, s.length - kk) + "." + s.slice(s.length - kk);
    // Character walk, not /\.?0+$/ — that expression is unanchored at the left
    // and backtracks quadratically on long trailing-zero runs (CodeQL #30).
    // Output is identical: the dot was just inserted with kk ≥ 1 fractional
    // characters after it, so the string can end in "." only once zeros go.
    let end = s.length;
    while (end > 0 && s[end - 1] === "0") end -= 1;
    if (end > 0 && s[end - 1] === ".") end -= 1;
    s = s.slice(0, end);
    if (s === "" || s === "-") s = "0";
  }
  return (neg ? "-" : "") + s;
}

/**
 * Case-3 canonical form: cm where exact, else pt (foundation §11/§12;
 * van den Oever's rule made computable). px is never emitted.
 * Every value parseable by this module terminates in one of the two.
 */
export function canonicalForm(v: OdfValue): string {
  if (v.kind === "keyword") return v.value;
  if (v.kind === "percent") return `${exactDecimal(v.value)}%`;
  if (isExactInUnit(v, "cm")) return `${exactDecimal(div(v.mm, FACTOR_MM.cm))}cm`;
  if (isExactInUnit(v, "pt")) return `${exactDecimal(div(v.mm, FACTOR_MM.pt))}pt`;
  // Unreachable for values built via this module's own entry points;
  // guard against a hand-built Rational rather than emit garbage.
  throw new Error("length core: value exact in neither cm nor pt");
}

/** Lexical if present (Case 1), else canonical (Case 3). */
export function formatOdfValue(v: OdfValue): string {
  if (v.kind !== "keyword" && v.lexical !== undefined) return v.lexical;
  return canonicalForm(v);
}

// ─── Consumer boundary ─────────────────────────────────────────────────

/**
 * The ONLY place a float is produced. `toNumber(parse("21cm"), "mm")`
 * → 210. Returns undefined for percents and keywords — they have no
 * length until the consumer resolves them.
 */
export function toNumber(v: OdfValue, unit: Unit): number | undefined {
  if (v.kind !== "length") return undefined;
  const r = div(v.mm, FACTOR_MM[unit]);
  // 15 significant decimal digits of headroom, then one float division.
  const SCALE = 10n ** 15n;
  return Number((r.n * SCALE) / r.d) / 1e15;
}

/**
 * Exact comparison of two lengths (fixes B1 and its writer twin).
 * Accepts raw attribute strings or parsed values. Returns undefined if
 * either side is not a length — the caller must decide what a percent
 * compares to, because this module cannot.
 */
export function compareLengths(a: string | OdfValue, b: string | OdfValue): -1 | 0 | 1 | undefined {
  const va = typeof a === "string" ? parseOdfValue(a) : a;
  const vb = typeof b === "string" ? parseOdfValue(b) : b;
  if (!va || !vb || va.kind !== "length" || vb.kind !== "length") return undefined;
  return cmpRational(va.mm, vb.mm);
}

// ─── Case 2: quantized sources and intervals ───────────────────────────

/** Half-open interval [lo, hi) in millimetres. */
export interface Interval {
  readonly lo: Rational;
  readonly hi: Rational;
  /** The source's nominal value in mm, for the D8b tie-break. */
  readonly nominal: Rational;
}

/**
 * A source integer t in a quantized unit implies the true value lies in
 * [t−½, t+½) source units (D8). 1417 twips → the author's 2.5cm.
 */
export function intervalFromQuantized(count: number | bigint, source: SourceUnit): Interval {
  const t = typeof count === "bigint" ? rat(count, 1n) : parseDecimalOrThrow(String(count));
  const half = rat(1n, 2n);
  const f = FACTOR_MM[source];
  return {
    lo: mul(sub(t, half), f),
    hi: mul(rat(t.n * 2n + t.d, t.d * 2n), f), // t + ½, exact
    nominal: mul(t, f),
  };
}

/**
 * D8c — fractional sources: the quantum derives from the last
 * significant digit. "12.5" px → quantum 0.1 px → [12.45, 12.55) px.
 */
export function intervalFromDecimal(raw: string, source: SourceUnit): Interval {
  const t = parseDecimalOrThrow(raw.trim());
  const fracLen = raw.includes(".") ? raw.trim().split(".")[1].length : 0;
  const q = rat(1n, 10n ** BigInt(fracLen)); // quantum = last sig. digit
  const halfQ = rat(q.n, q.d * 2n);
  const f = FACTOR_MM[source];
  return {
    lo: mul(sub(t, halfQ), f),
    hi: mul(rat(t.n * (q.d * 2n) + q.n * t.d, t.d * (q.d * 2n)), f), // t + q/2
    nominal: mul(t, f),
  };
}

function parseDecimalOrThrow(s: string): Rational {
  const r = parseDecimal(s);
  if (!r)
    throw new Error(
      `length core: not a decimal value or exceeds ${MAX_NUMERIC_LEXICAL} chars: "${excerpt(s)}"`,
    );
  return r;
}

/**
 * Shortest decimal in a half-open interval, expressed in `unit`.
 *
 * Implementation note from the foundation doc: for increasing k, test
 * whether an integer multiple of 10^−k lies in the interval —
 * ceil(lo·10^k) ≤ m, m < hi·10^k strictly. First k that admits a
 * candidate wins; among candidates, nearest the nominal (D8b).
 */
export function shortestInUnit(interval: Interval, unit: Unit): string {
  const f = FACTOR_MM[unit];
  const lo = div(interval.lo, f);
  const hi = div(interval.hi, f);
  const nom = div(interval.nominal, f);
  for (let k = 0n; k <= 25n; k += 1n) {
    const s = 10n ** k;
    const mMin = ceilDiv(lo.n * s, lo.d);
    // strict upper bound: largest m with m < hi·s
    const hiScaledNum = hi.n * s;
    const mMax = hiScaledNum % hi.d === 0n ? hiScaledNum / hi.d - 1n : floorDiv(hiScaledNum, hi.d);
    if (mMin > mMax) continue;
    // D8b: candidate nearest nominal·s. Only the two integers around
    // nominal·s (clamped into range) can win.
    const nomFloor = floorDiv(nom.n * s, nom.d);
    const clamp = (m: bigint) => (m < mMin ? mMin : m > mMax ? mMax : m);
    const c1 = clamp(nomFloor);
    const c2 = clamp(nomFloor + 1n);
    // |c·d − n·s| comparison, exact.
    const dist = (m: bigint) => {
      const diff = m * nom.d - nom.n * s;
      return diff < 0n ? -diff : diff;
    };
    const m = dist(c1) <= dist(c2) ? c1 : c2;
    return `${placeDecimal(m, k)}${unit}`;
  }
  throw new Error("length core: no decimal found in interval (degenerate interval?)");
}

/** Case-2 convenience: quantized count → shortest decimal in `target`. */
export function convertQuantized(count: number | bigint, source: SourceUnit, target: Unit): string {
  return shortestInUnit(intervalFromQuantized(count, source), target);
}

/** D8c convenience: fractional source string → shortest decimal in `target`. */
export function convertDecimal(raw: string, source: SourceUnit, target: Unit): string {
  return shortestInUnit(intervalFromDecimal(raw, source), target);
}

// ─── D8a: geometric-domain unit vote ───────────────────────────────────

function digitCount(rendered: string): number {
  let c = 0;
  for (const ch of rendered) if (ch >= "0" && ch <= "9") c += 1;
  return c;
}

/**
 * D8a (final) — one unit per document for the geometric domain, chosen
 * by exact digit-count vote: for each candidate, render every value via
 * shortest-decimal-in-interval and sum the digit counts; lowest total
 * wins. Page dimensions vote as ordinary members. Tie-break: the page
 * format's native unit, then cm. Deterministic; BigInt-exact throughout.
 *
 * The vote follows the author rather than the paper: inch-round margins
 * on an A4 page outvote the metric page, matching LibreOffice's own
 * emission under an inch preference. (Typographic domain never votes —
 * it is always pt.)
 */
export function chooseGeometricUnit(
  intervals: readonly Interval[],
  pageNativeUnit?: Unit,
  candidates: readonly Unit[] = VOTE_CANDIDATES,
): Unit {
  if (intervals.length === 0) return pageNativeUnit ?? "cm";
  let best: Unit | undefined;
  let bestTotal = Infinity;
  for (const unit of candidates) {
    let total = 0;
    for (const iv of intervals) total += digitCount(shortestInUnit(iv, unit));
    if (
      total < bestTotal ||
      (total === bestTotal &&
        // tie-break: page-native unit, then cm
        (unit === pageNativeUnit || (unit === "cm" && best !== pageNativeUnit)))
    ) {
      best = unit;
      bestTotal = total;
    }
  }
  return best ?? "cm";
}
