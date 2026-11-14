// src/core/css/declaration-value.ts
//
// The CSS declaration-value check. A renderer writes a value V into an HTML
// style attribute as `name:V`, followed by its own `;` or the end of the
// attribute. This module decides whether V then occupies exactly one
// declaration, at normal priority, and leaves every later declaration
// untouched (T4: DS1-1). A value that fails has its declaration left out by
// the caller; the result names the condition it broke (T4: DS1-6).
//
// Authority: CSS Syntax Module Level 3, W3C CRD of 1 October 2026
// (odf-kit-internal spec/w3c-css/CRD-css-syntax-3-20261001.txt), cited below
// by section and line. The seven conditions are those of the unit's first
// pass (Part 2, as corrected in round 3). They are sufficient, not necessary:
// a value that passes is one declaration; some values that fail would also be
// one declaration, and dropping them is the named exception to verbatim
// writing for the HTML renderers (T4: DS1-8).
//
// T4: DS1-9 — built straight from the spec text, not from a committed
// extraction. This is a named exception to FA-1's order (authority →
// extraction → engine), discharged by a later extraction for the CSS row.
//
// Internal to core; never published (T4: DS1-5).

/**
 * The condition a value broke, in the order of the first pass's list.
 *  1 `semicolon`        a top-level `<semicolon-token>`
 *  2 `close-brace`      a top-level `<}-token>`
 *  3 `open-brace`       a top-level `<{-token>`, open or closed
 *  4 `unclosed`         a block, function, string, url or comment open at the end
 *  5 `bad-token`        a `<bad-string-token>` or `<bad-url-token>`
 *  6 `trailing-escape`  an escape that meets the end of the value
 *  7 `important`        the value ends in `!important`
 */
export type DeclarationValueRule =
  | "semicolon"
  | "close-brace"
  | "open-brace"
  | "unclosed"
  | "bad-token"
  | "trailing-escape"
  | "important";

/** Result of {@link checkDeclarationValue}. */
export type DeclarationValueCheck = { ok: true } | { ok: false; rule: DeclarationValueRule };

const PASS: DeclarationValueCheck = { ok: true };

/**
 * Check one CSS value before it is written as `name:value`. The text checked
 * is the exact text written between the renderer's `name:` and its `;` or the
 * end of the attribute (T4: DS1-2).
 *
 * When a value breaks more than one condition, the result names the first
 * one met reading left to right; conditions 4, 6 and 7 are known only at the
 * end and are tested there, in that order.
 */
export function checkDeclarationValue(text: string): DeclarationValueCheck {
  const t = new Tokenizer(preprocess(text));
  // Ending tokens of the blocks and functions open at this point
  // (T1: §5.5.9 l.5979-5981, the mirror variant; §5.5.10 l.6009-6013, ")").
  const open: string[] = [];
  // The last two top-level non-whitespace component values, for condition 7
  // (T1: §5.5.6 l.5847-5851). A block or function counts as one (§5.5.8).
  let last: Token | undefined;
  let beforeLast: Token | undefined;

  for (let tok = t.next(); tok.type !== "eof"; tok = t.next()) {
    const topLevel = open.length === 0;
    // T1: §4.3.5 l.3502-3507, §4.3.6 l.3576-3601, l.3613-3617.
    if (tok.type === "bad-string" || tok.type === "bad-url") return fail("bad-token");
    if (topLevel) {
      // T1: §4.3.1 l.3276-3279; §5.5.6 l.5840-5843 — the declaration's stop token.
      if (tok.type === ";") return fail("semicolon");
      // T1: §4.3.1 l.3349-3352; §5.5.5 l.5675-5678 / Style Attributes l.294-297 (T4: DS1-11).
      if (tok.type === "}") return fail("close-brace");
      // T1: §5.5.8 l.5956-5961; §5.5.6 l.5868-5873 (T4: DS1-3).
      if (tok.type === "{") return fail("open-brace");
    }
    if (tok.type === "(" || tok.type === "function") open.push(")");
    else if (tok.type === "[") open.push("]");
    else if (tok.type === "{") open.push("}");
    else if (open.length > 0 && tok.type === open[open.length - 1]) open.pop();

    // A token met at top level starts a component value. A block or function
    // is recorded by its opening token; the tokens inside it and its ending
    // token are not top-level, so they are not recorded.
    if (topLevel && tok.type !== "whitespace") {
      beforeLast = last;
      last = tok;
    }
  }

  // T1: §5.5.9 l.5988-5992; §5.5.10 l.6009-6013; §4.3.5 l.3495-3499;
  // §4.3.6 l.3569-3573; §4.3.2 l.3412-3420 — each ends only at EOF.
  if (open.length > 0 || t.openAtEof) return fail("unclosed");
  // T1: §4.3.8 l.3686-3691 and §4.3.7 l.3657-3661 — read alone, the escape
  // meets EOF; in place it takes the renderer's ";" (§4.3.7 l.3664-3667).
  if (t.escapeMetEof) return fail("trailing-escape");
  // T1: §5.5.6 l.5847-5851 — "!" then an ident matching "important"
  // ASCII case-insensitively.
  if (
    beforeLast?.type === "delim" &&
    beforeLast.value === "!" &&
    last?.type === "ident" &&
    last.value.toLowerCase() === "important"
  ) {
    return fail("important");
  }
  return PASS;
}

function fail(rule: DeclarationValueRule): DeclarationValueCheck {
  return { ok: false, rule };
}

// ─── Preprocessing (T1: §3.3) ──────────────────────────────────────────

/** Code points of `text` after filtering (T1: §3.3 l.1502-1511). */
function preprocess(text: string): number[] {
  const out: number[] = [];
  const cps = Array.from(text, (c) => c.codePointAt(0)!);
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i];
    if (c === 0x0d) {
      // CR, or CR LF, becomes one LF (l.1502-1505).
      if (cps[i + 1] === 0x0a) i++;
      out.push(0x0a);
    } else if (c === 0x0c) {
      out.push(0x0a); // FF becomes LF (l.1503).
    } else if (c === 0 || (c >= 0xd800 && c <= 0xdfff)) {
      out.push(0xfffd); // NULL and surrogates become U+FFFD (l.1510-1511).
    } else {
      out.push(c);
    }
  }
  return out;
}

// ─── Tokenizer (T1: §4.3) ──────────────────────────────────────────────
//
// Produces only what the check needs: the token's type, and the value of an
// ident or delim (for condition 7). Numbers keep no value.

type Token =
  | { type: "ident" | "delim"; value: string }
  | {
      type:
        | "whitespace"
        | "string"
        | "bad-string"
        | "url"
        | "bad-url"
        | "function"
        | "at-keyword"
        | "hash"
        | "number"
        | "CDO"
        | "CDC"
        | ":"
        | ";"
        | ","
        | "("
        | ")"
        | "["
        | "]"
        | "{"
        | "}"
        | "eof";
    };

const EOF = -1;

// Definitions, T1: §4.2 (from l.2915; ident code points l.3066-3079, newline
// and whitespace l.3097-3110, non-printable l.3082-3089).
const isDigit = (c: number) => c >= 0x30 && c <= 0x39;
const isHexDigit = (c: number) =>
  isDigit(c) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
const isLetter = (c: number) => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
const isNewline = (c: number) => c === 0x0a;
const isWhitespace = (c: number) => c === 0x0a || c === 0x09 || c === 0x20;
const isNonPrintable = (c: number) =>
  (c >= 0 && c <= 0x08) || c === 0x0b || (c >= 0x0e && c <= 0x1f) || c === 0x7f;
// Non-ASCII ident code points, T1: §4.2 l.2986-3029 (all ranges inclusive).
const isNonAsciiIdent = (c: number) =>
  c === 0xb7 ||
  (c >= 0xc0 && c <= 0xd6) ||
  (c >= 0xd8 && c <= 0xf6) ||
  (c >= 0xf8 && c <= 0x37d) ||
  (c >= 0x37f && c <= 0x1fff) ||
  c === 0x200c ||
  c === 0x200d ||
  c === 0x203f ||
  c === 0x2040 ||
  (c >= 0x2070 && c <= 0x218f) ||
  (c >= 0x2c00 && c <= 0x2fef) ||
  (c >= 0x3001 && c <= 0xd7ff) ||
  (c >= 0xf900 && c <= 0xfdcf) ||
  (c >= 0xfdf0 && c <= 0xfffd) ||
  c >= 0x10000;
const isIdentStart = (c: number) => isLetter(c) || isNonAsciiIdent(c) || c === 0x5f;
const isIdent = (c: number) => isIdentStart(c) || isDigit(c) || c === 0x2d;

class Tokenizer {
  private i = 0;
  /** A string, url or comment was still open at EOF. */
  openAtEof = false;
  /** An escaped code point met EOF (T1: §4.3.7 l.3657-3661). */
  escapeMetEof = false;

  constructor(private readonly cp: number[]) {}

  private at(k: number): number {
    const j = this.i + k;
    return j < this.cp.length ? this.cp[j] : EOF;
  }

  /** T1: §4.3.8 l.3686-3691. */
  private validEscape(a: number, b: number): boolean {
    return a === 0x5c && !isNewline(b);
  }

  /** T1: §4.3.9 l.3703-3732. */
  private startsIdent(a: number, b: number, c: number): boolean {
    if (a === 0x2d) return isIdentStart(b) || b === 0x2d || this.validEscape(b, c);
    if (isIdentStart(a)) return true;
    if (a === 0x5c) return this.validEscape(a, b);
    return false;
  }

  /** T1: §4.3.10 l.3751-3789. */
  private startsNumber(a: number, b: number, c: number): boolean {
    if (a === 0x2b || a === 0x2d) return isDigit(b) || (b === 0x2e && isDigit(c));
    if (a === 0x2e) return isDigit(b);
    return isDigit(a);
  }

  /** T1: §4.3.1 l.3140-3398. Comments are consumed first (§4.3.2). */
  next(): Token {
    this.consumeComments();
    const c = this.at(0);
    if (c === EOF) return { type: "eof" };
    if (isWhitespace(c)) {
      while (isWhitespace(this.at(0))) this.i++;
      return { type: "whitespace" };
    }
    if (c === 0x22 || c === 0x27) {
      this.i++;
      return this.consumeString(c);
    }
    if (c === 0x23) {
      // T1: l.3162-3193.
      if (isIdent(this.at(1)) || this.validEscape(this.at(1), this.at(2))) {
        this.i++;
        this.consumeIdentSequence();
        return { type: "hash" };
      }
      this.i++;
      return { type: "delim", value: "#" };
    }
    if (c === 0x28) return this.single("(");
    if (c === 0x29) return this.single(")");
    if (c === 0x2b || c === 0x2e) {
      if (this.startsNumber(c, this.at(1), this.at(2))) return this.consumeNumeric();
      this.i++;
      return { type: "delim", value: String.fromCodePoint(c) };
    }
    if (c === 0x2c) return this.single(",");
    if (c === 0x2d) {
      // T1: l.3232-3256.
      if (this.startsNumber(c, this.at(1), this.at(2))) return this.consumeNumeric();
      if (this.at(1) === 0x2d && this.at(2) === 0x3e) {
        this.i += 3;
        return { type: "CDC" };
      }
      if (this.startsIdent(c, this.at(1), this.at(2))) return this.consumeIdentLike();
      this.i++;
      return { type: "delim", value: "-" };
    }
    if (c === 0x3a) return this.single(":");
    if (c === 0x3b) return this.single(";");
    if (c === 0x3c) {
      // T1: l.3282-3297.
      if (this.at(1) === 0x21 && this.at(2) === 0x2d && this.at(3) === 0x2d) {
        this.i += 4;
        return { type: "CDO" };
      }
      this.i++;
      return { type: "delim", value: "<" };
    }
    if (c === 0x40) {
      // T1: l.3298-3311.
      this.i++;
      if (this.startsIdent(this.at(0), this.at(1), this.at(2))) {
        this.consumeIdentSequence();
        return { type: "at-keyword" };
      }
      return { type: "delim", value: "@" };
    }
    if (c === 0x5b) return this.single("[");
    if (c === 0x5c) {
      // T1: l.3318-3336.
      if (this.validEscape(c, this.at(1))) return this.consumeIdentLike();
      this.i++;
      return { type: "delim", value: "\\" };
    }
    if (c === 0x5d) return this.single("]");
    if (c === 0x7b) return this.single("{");
    if (c === 0x7d) return this.single("}");
    if (isDigit(c)) return this.consumeNumeric();
    // "U"/"u" (l.3363-3379): unicode ranges are not allowed here, so both
    // take the ident-start branch below.
    if (isIdentStart(c)) return this.consumeIdentLike();
    this.i++;
    return { type: "delim", value: String.fromCodePoint(c) };
  }

  private single(type: ":" | ";" | "," | "(" | ")" | "[" | "]" | "{" | "}"): Token {
    this.i++;
    return { type };
  }

  /** T1: §4.3.2 l.3412-3421. */
  private consumeComments(): void {
    while (this.at(0) === 0x2f && this.at(1) === 0x2a) {
      this.i += 2;
      for (;;) {
        if (this.at(0) === EOF) {
          this.openAtEof = true;
          return;
        }
        if (this.at(0) === 0x2a && this.at(1) === 0x2f) {
          this.i += 2;
          break;
        }
        this.i++;
      }
    }
  }

  /** T1: §4.3.3 l.3426-3448, with §4.3.13 for the number itself. */
  private consumeNumeric(): Token {
    this.consumeNumber();
    if (this.startsIdent(this.at(0), this.at(1), this.at(2))) {
      this.consumeIdentSequence();
    } else if (this.at(0) === 0x25) {
      this.i++;
    }
    return { type: "number" };
  }

  /** T1: §4.3.13 l.3847 on — consumes the code points of a number. */
  private consumeNumber(): void {
    if (this.at(0) === 0x2b || this.at(0) === 0x2d) this.i++;
    while (isDigit(this.at(0))) this.i++;
    if (this.at(0) === 0x2e && isDigit(this.at(1))) {
      this.i++;
      while (isDigit(this.at(0))) this.i++;
    }
    const e = this.at(0);
    if (e === 0x45 || e === 0x65) {
      const s = this.at(1);
      if (isDigit(s)) {
        this.i++;
        while (isDigit(this.at(0))) this.i++;
      } else if ((s === 0x2b || s === 0x2d) && isDigit(this.at(2))) {
        this.i += 2;
        while (isDigit(this.at(0))) this.i++;
      }
    }
  }

  /** T1: §4.3.4 l.3453-3477. */
  private consumeIdentLike(): Token {
    const name = this.consumeIdentSequence();
    if (name.toLowerCase() === "url" && this.at(0) === 0x28) {
      this.i++;
      while (isWhitespace(this.at(0)) && isWhitespace(this.at(1))) this.i++;
      const a = this.at(0);
      const b = this.at(1);
      if (a === 0x22 || a === 0x27 || (isWhitespace(a) && (b === 0x22 || b === 0x27))) {
        return { type: "function" };
      }
      return this.consumeUrl();
    }
    if (this.at(0) === 0x28) {
      this.i++;
      return { type: "function" };
    }
    return { type: "ident", value: name };
  }

  /** T1: §4.3.12 l.3824-3845. */
  private consumeIdentSequence(): string {
    let result = "";
    for (;;) {
      const c = this.at(0);
      if (isIdent(c)) {
        result += String.fromCodePoint(c);
        this.i++;
      } else if (this.validEscape(c, this.at(1))) {
        this.i++;
        result += String.fromCodePoint(this.consumeEscaped());
      } else {
        return result;
      }
    }
  }

  /** T1: §4.3.7 l.3639-3667. The "\" has been consumed. */
  private consumeEscaped(): number {
    const c = this.at(0);
    if (c === EOF) {
      this.escapeMetEof = true; // l.3657-3661
      return 0xfffd;
    }
    this.i++;
    if (isHexDigit(c)) {
      let hex = String.fromCodePoint(c);
      while (hex.length < 6 && isHexDigit(this.at(0))) {
        hex += String.fromCodePoint(this.at(0));
        this.i++;
      }
      if (isWhitespace(this.at(0))) this.i++;
      const n = parseInt(hex, 16);
      if (n === 0 || (n >= 0xd800 && n <= 0xdfff) || n > 0x10ffff) return 0xfffd;
      return n;
    }
    return c;
  }

  /** T1: §4.3.5 l.3486-3528. The opening quote has been consumed. */
  private consumeString(ending: number): Token {
    for (;;) {
      const c = this.at(0);
      if (c === ending) {
        this.i++;
        return { type: "string" };
      }
      if (c === EOF) {
        this.openAtEof = true; // l.3495-3499
        return { type: "string" };
      }
      if (isNewline(c)) return { type: "bad-string" }; // l.3502-3507, newline reconsumed
      this.i++;
      if (c === 0x5c) {
        const n = this.at(0);
        if (n === EOF) continue; // l.3514-3515: do nothing
        if (isNewline(n))
          this.i++; // l.3518-3520
        else this.consumeEscaped(); // l.3521-3524
      }
    }
  }

  /** T1: §4.3.6 l.3548-3623. "url(" and its leading whitespace are consumed. */
  private consumeUrl(): Token {
    while (isWhitespace(this.at(0))) this.i++;
    for (;;) {
      const c = this.at(0);
      if (c === 0x29) {
        this.i++;
        return { type: "url" };
      }
      if (c === EOF) {
        this.openAtEof = true; // l.3569-3573
        return { type: "url" };
      }
      if (isWhitespace(c)) {
        while (isWhitespace(this.at(0))) this.i++;
        if (this.at(0) === 0x29) {
          this.i++;
          return { type: "url" };
        }
        if (this.at(0) === EOF) {
          this.openAtEof = true;
          return { type: "url" };
        }
        return this.consumeBadUrlRemnants(); // l.3584-3586
      }
      if (c === 0x22 || c === 0x27 || c === 0x28 || isNonPrintable(c)) {
        this.i++;
        return this.consumeBadUrlRemnants(); // l.3589-3601
      }
      if (c === 0x5c) {
        if (this.validEscape(c, this.at(1))) {
          this.i++;
          this.consumeEscaped(); // l.3608-3610
          continue;
        }
        this.i++;
        return this.consumeBadUrlRemnants(); // l.3613-3617
      }
      this.i++;
    }
  }

  /** T1: §4.3.15 l.3996-4024 — consume to ")" or EOF, taking escapes whole. */
  private consumeBadUrlRemnants(): Token {
    for (;;) {
      const c = this.at(0);
      if (c === EOF) return { type: "bad-url" };
      this.i++;
      if (c === 0x29) return { type: "bad-url" };
      if (this.validEscape(c, this.at(0))) this.consumeEscaped();
    }
  }
}
