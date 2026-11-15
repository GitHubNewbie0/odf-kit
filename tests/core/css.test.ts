// tests/core/css.test.ts
//
// Tests for the CSS declaration-value check (src/core/css). The check decides
// whether a value V, written by a renderer as `name:V` and followed by the
// renderer's `;` or the end of the style attribute, occupies exactly one
// declaration at normal priority and leaves every later declaration untouched
// (T4: DS1-1). It reports which of the seven conditions V breaks (T4: DS1-6).
//
// Every expected value is derived by hand from CSS Syntax 3, CRD of 1 October
// 2026 (spec/w3c-css/CRD-css-syntax-3-20261001.txt in odf-kit-internal), cited
// by section and line. Each hostile value breaks exactly one condition, so the
// expected rule is unambiguous.

import { checkDeclarationValue } from "../../src/core/css/index.js";

const pass = { ok: true };
const fail = (rule: string) => ({ ok: false, rule });

// ─── Condition 1: no top-level <semicolon-token> ───────────────────────

describe("css check — condition 1, top-level semicolon (T4: DS1-1)", () => {
  // T1: Syntax 3 §4.3.1 l.3276-3279 (";" is a <semicolon-token>); §5.5.6
  // l.5840-5843 (it is the stop token of a declaration's value).
  test.each(["red;float:left", ";", "a(b);c", "'a';b"])(
    "%j ends the declaration: semicolon",
    (v) => {
      expect(checkDeclarationValue(v)).toEqual(fail("semicolon"));
    },
  );
});

// ─── Condition 2: no top-level <}-token> ───────────────────────────────

describe("css check — condition 2, top-level close brace (T4: DS1-11)", () => {
  // T1: Syntax 3 §4.3.1 l.3349-3352 ("}" is a <}-token>). Under the CRD's
  // style-attribute entry it ends the list (§5.5.5 l.5675-5678); under CSS
  // Style Attributes l.294-297 it is "merely an invalid token". DS1-11 makes
  // no ruling between them: under both it is not a valid value, so it is
  // rejected, and only what odf-kit writes is asserted.
  test.each(["red}", "}red", "a()}", "}"])("%j: close-brace", (v) => {
    expect(checkDeclarationValue(v)).toEqual(fail("close-brace"));
  });
});

// ─── Condition 3: no top-level <{-token> ───────────────────────────────

describe("css check — condition 3, top-level open brace (T4: DS1-3)", () => {
  // T1: Syntax 3 §5.5.8 l.5956-5961 (a "{" starts a simple block); §5.5.6
  // l.5868-5873 (a top-level {}-block with any other token: the declaration
  // is not returned). DS1-3: a closed {…} block at top level is rejected;
  // an open one is rejected by the same condition (first-pass-r3.md K9).
  test.each(["red{", "red {}", "{}", "{float:left}", "a{b}c"])("%j: open-brace", (v) => {
    expect(checkDeclarationValue(v)).toEqual(fail("open-brace"));
  });
});

// ─── Condition 4: nothing left open at the end ─────────────────────────

describe("css check — condition 4, a construct left open at the end (T4: DS1-1)", () => {
  // T1: Syntax 3 §5.5.9 l.5988-5992 (a simple block ends only at its ending
  // token or EOF) and l.5979-5981 (the ending token is the mirror variant);
  // §5.5.10 l.6009-6013 (a function ends at ")" or EOF). Left open, it takes
  // in the renderer's later declarations.
  test.each(["a(", "rgb(1,2", "a[", "a(b[c)", "a({"])("%j: unclosed block or function", (v) => {
    expect(checkDeclarationValue(v)).toEqual(fail("unclosed"));
  });

  // T1: Syntax 3 §4.3.5 l.3495-3499 (a string runs to its ending code point
  // or EOF).
  test.each(["'abc", '"abc', "'a\\'"])("%j: unclosed string", (v) => {
    expect(checkDeclarationValue(v)).toEqual(fail("unclosed"));
  });

  // T1: Syntax 3 §4.3.6 l.3569-3573 (an unquoted url runs to ")" or EOF);
  // §4.3.4 l.3454-3456 ("url" is matched ASCII case-insensitively on the
  // ident's value, so an escaped "u\rl(" is a url too).
  test.each(["url(x", "URL(x", "u\\rl(x"])("%j: unclosed url", (v) => {
    expect(checkDeclarationValue(v)).toEqual(fail("unclosed"));
  });

  // T1: Syntax 3 §4.3.2 l.3412-3420 (a comment runs to "*/" or EOF).
  test.each(["red/*", "/*"])("%j: unclosed comment", (v) => {
    expect(checkDeclarationValue(v)).toEqual(fail("unclosed"));
  });
});

// ─── Condition 5: no <bad-string-token> or <bad-url-token> ─────────────

describe("css check — condition 5, bad-string and bad-url tokens (T4: DS1-1)", () => {
  // T1: Syntax 3 §4.3.5 l.3502-3507 (a newline in a string gives a
  // <bad-string-token>); §3.3 l.1502-1505 (CR, FF and CRLF are newlines
  // after preprocessing).
  test.each(["'a\nb", "'a\rb", "'a\fb", "'a\r\nb", "f('a\nb)"])("%j: bad-string", (v) => {
    expect(checkDeclarationValue(v)).toEqual(fail("bad-token"));
  });

  // T1: Syntax 3 §4.3.6 l.3576-3586 (whitespace not followed by ")" or EOF),
  // l.3589-3601 (a quote, "(" or a non-printable code point), l.3613-3617
  // (a "\" that is not a valid escape): each gives a <bad-url-token>.
  test.each(["url(a b)", "url(a'b)", 'url(a"b)', "url(a(b)", "url(a\u0001b)", "url(a\\\nb)"])(
    "%j: bad-url",
    (v) => {
      expect(checkDeclarationValue(v)).toEqual(fail("bad-token"));
    },
  );
});

// ─── Condition 6: no escape that meets the end ─────────────────────────

describe("css check — condition 6, a trailing escape (T4: DS1-1)", () => {
  // T1: Syntax 3 §4.3.8 l.3686-3691 ("\" followed by anything but a newline,
  // EOF included, is a valid escape); §4.3.7 l.3657-3661 (read alone it meets
  // EOF). In place the renderer's ";" is the escaped code point (§4.3.7
  // l.3664-3667, via §4.3.1 l.3318-3325) and the next declaration joins V
  // (first-pass-r3.md K11).
  test.each(["red\\", "\\", "1\\", "#\\", "a b\\", "a(b)\\"])("%j: trailing-escape", (v) => {
    expect(checkDeclarationValue(v)).toEqual(fail("trailing-escape"));
  });

  // T1: Syntax 3 §4.3.8 l.3688-3690 ("\" before a newline is not an escape);
  // §4.3.7 l.3664-3667 ("\\" is an escaped "\", which does not meet EOF).
  test.each(["red\\\\", "red\\\n"])("%j passes", (v) => {
    expect(checkDeclarationValue(v)).toEqual(pass);
  });
});

// ─── Condition 7: not a trailing !important ────────────────────────────

describe("css check — condition 7, a trailing !important (T4: DS1-1)", () => {
  // T1: Syntax 3 §5.5.6 l.5847-5851: the last two non-whitespace tokens are a
  // "!" <delim-token> and an <ident-token> matching "important" ASCII
  // case-insensitively. Comments make no token (§4.3.2) and escapes resolve in
  // the ident's value (§4.3.12 l.3833-3837).
  test.each([
    "red !important",
    "red!IMPORTANT",
    "red !/**/important",
    "red !\\69mportant",
    "red ! important ",
    "!important",
  ])("%j: important", (v) => {
    expect(checkDeclarationValue(v)).toEqual(fail("important"));
  });

  // T1: Syntax 3 §5.5.6 l.5847-5851 counts only "!" then "important" as the
  // last two non-whitespace component values; a function is one component
  // value (§5.5.8 l.5962-5965). None of these sets the important flag.
  test.each([
    "red !",
    "red !foo",
    "red ! blue",
    "red !important x",
    "!important red",
    "a(!important)",
    "important",
  ])("%j passes", (v) => {
    expect(checkDeclarationValue(v)).toEqual(pass);
  });
});

// ─── Values the check must pass ────────────────────────────────────────

describe("css check — values that stay one declaration pass (T4: DS1-1, DS1-4)", () => {
  // T4: DS1-4 — inside a closed quoted string every code point Syntax 3
  // admits is admitted (§4.3.5 l.3525-3528), including ";", braces, an escaped
  // newline (l.3518-3520) and non-ASCII text.
  test.each(["'a;b'", '"a;b"', "'a}'", "'a{'", "'a\\\nb'", "'a\\'b'", "'日本語'", "'a\u0001b'"])(
    "string %j passes",
    (v) => {
      expect(checkDeclarationValue(v)).toEqual(pass);
    },
  );

  // T3: LibreOffice writes quoted family names — `fo:font-family="&apos;Liberation
  // Sans&apos;"` in tests/reader/fixtures/a4-cm-libreoffice.odt (meta:generator
  // LibreOffice/26.2.4.2$Windows_X86_64 …). T4: DS1-4.
  test("LibreOffice's 'Liberation Sans' passes", () => {
    expect(checkDeclarationValue("'Liberation Sans'")).toEqual(pass);
  });

  // T1: Syntax 3 §4.3.12 l.3833-3837 ("\;" is an escaped code point inside an
  // ident, not a <semicolon-token>); §4.3.2 l.3412-3418 (a closed comment makes
  // no token, whatever it holds).
  test.each(["a\\;b", "red/**/", "/* ; } { */red"])("%j passes", (v) => {
    expect(checkDeclarationValue(v)).toEqual(pass);
  });

  // T1: Syntax 3 §5.5.10 l.6014-6017 and §5.5.9 l.5993-5996: inside a function
  // or block every token but the ending one is a component value of it, so a
  // brace there is not top-level (first-pass-r2.md C2; engine cases 16-18).
  test.each(["a(})", "a({})", "a(])", "a[{}]", "rgb(1, 2, 3)"])("%j passes", (v) => {
    expect(checkDeclarationValue(v)).toEqual(pass);
  });

  // T1: Syntax 3 §4.3.6 l.3563-3566 (")" ends a url); §4.3.4 l.3459-3464 (a
  // quoted url is a function whose string may hold anything).
  test.each(["url(x)", "url( x )", "url('a;b')"])("%j passes", (v) => {
    expect(checkDeclarationValue(v)).toEqual(pass);
  });

  // T1: Syntax 3 §5.5.7 l.5939-5942: an unmatched ")" or "]" is one more
  // component value, not a separator; it can make the declaration invalid but
  // not end it (first-pass-r2.md Part 2, closing paragraph).
  test.each([")", "a]"])("stray closer %j passes", (v) => {
    expect(checkDeclarationValue(v)).toEqual(pass);
  });

  // T1: Syntax 3 §3.3 l.1510-1511 (U+0000 becomes U+FFFD, an ordinary code
  // point). Typical renderer values: none holds a structural token.
  test.each([
    "a\u0000b",
    "",
    "#ff0000",
    "12pt",
    "0.5pt solid #000000",
    "2px 2px #000000",
    "150%",
    "-0.05em",
  ])("%j passes", (v) => {
    expect(checkDeclarationValue(v)).toEqual(pass);
  });
});

// ─── Tokenizer paths the conditions depend on ──────────────────────────

describe("css check — tokens that carry no structure pass (T4: DS1-1)", () => {
  // T1: Syntax 3 §4.3.1: a lone "#" (l.3191-3193), "+" (l.3223-3225), "."
  // (l.3267-3269), "-" (l.3254-3256), "<" (l.3295-3297) and "@" (l.3309-3311)
  // are <delim-token>s; "-->" is a <CDC-token> (l.3243-3248) and "<!--" a
  // <CDO-token> (l.3286-3292); "@media" is an <at-keyword-token> (l.3302-3306).
  // None is a condition's token.
  test.each(["#", "+", ".", "-", "<", "@", "-->", "<!--", "@media", "-x", "a # b"])(
    "%j passes",
    (v) => {
      expect(checkDeclarationValue(v)).toEqual(pass);
    },
  );

  // T1: Syntax 3 §4.3.1 l.3217-3220, l.3261-3264 (a "+" or "." that starts a
  // number); §4.3.13 l.3895-3907 (an exponent).
  test.each(["+1", ".5em", "+.5", "1e5", "1e+5", "1E-5", "1e"])("number %j passes", (v) => {
    expect(checkDeclarationValue(v)).toEqual(pass);
  });

  // T1: Syntax 3 §4.3.6 l.3604-3610 (an escaped ")" inside a url does not end
  // it).
  test("url(a\\)b) passes", () => {
    expect(checkDeclarationValue("url(a\\)b)")).toEqual(pass);
  });
});

describe("css check — tokenizer paths to a failing condition (T4: DS1-1)", () => {
  // T1: Syntax 3 §4.3.9 l.3705-3711 ("-" then a valid escape starts an ident)
  // and §4.3.1 l.3302-3306 ("@" then a valid escape starts an at-keyword):
  // the ident sequence takes the escape, which meets EOF (§4.3.7 l.3657-3661).
  test.each(["-\\", "@\\"])("%j: trailing-escape", (v) => {
    expect(checkDeclarationValue(v)).toEqual(fail("trailing-escape"));
  });

  // T1: Syntax 3 §4.3.6 l.3576-3582 (whitespace then EOF returns the url
  // token, a parse error) and l.3569-3573 (EOF after an escaped code point):
  // the url is still open at the end.
  test.each(["url(a ", "url(a\\"])("%j: unclosed", (v) => {
    expect(checkDeclarationValue(v)).toEqual(fail("unclosed"));
  });

  // T1: Syntax 3 §4.3.15 l.4004-4021: the remnants of a bad url take an
  // escaped ")" whole, so the bad url ends at the next ")".
  test("url(a(b\\)c): bad-token", () => {
    expect(checkDeclarationValue("url(a(b\\)c)")).toEqual(fail("bad-token"));
  });
});

// ─── Input that is not a string ────────────────────────────────────────

describe("css check — a non-string input is checked as its string form (T4: DS1-20)", () => {
  // T4: DS1-20 — the engine converts its input to a string, the same
  // conversion a template literal applies when the renderer writes it, and
  // checks that string. So an array or object is checked as the text it would
  // be written as, not element by element.
  test.each([
    ['an array, "red;position:fixed"', ["red;position:fixed"], fail("semicolon")],
    ['an array of two, "a,b"', ["a", "b"], pass],
    ['an object with toString, "red}"', { toString: () => "red}" }, fail("close-brace")],
    ['a plain object, "[object Object]"', {}, pass],
    ['a number, "5"', 5, pass],
    ['null, "null"', null, pass],
  ])("%s", (_label, v, expected) => {
    expect(checkDeclarationValue(v as unknown as string)).toEqual(expected);
  });
});
