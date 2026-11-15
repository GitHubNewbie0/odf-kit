/**
 * ODS HTML renderer — attribute escaping.
 *
 * GHSA-3cgg-c5pp-57h6: document-controlled values were interpolated into
 * style="…" without escaping, so a `"` in the value terminated the attribute
 * and injected arbitrary markup.
 *
 * Q1 (test-fixture-strategy-plan.md §2) governs the input type: these test the
 * renderer in isolation — given a known model, assert the HTML — so the input
 * is a hand-built model. A real .odt/.ods would drag the parser into an
 * assertion that is not about the parser, and no editor UI can author a
 * fo:color containing a quote in the first place.
 *
 * Each test pins the whole emitted tag rather than probing for substrings.
 * That is deliberate: it proves both halves of the fix at once — the value
 * appears in escaped form, AND no additional attribute or element was created.
 * Asserting the absence of a payload substring such as `onmouseover=` would be
 * wrong; escapeAttr does not touch `=` or attribute names, so that substring
 * survives verbatim inside the attribute value. What changed is that it no
 * longer parses as an attribute. Confirmed by the move-5 green probe against
 * the reporter's PoCs.
 */

import { renderOdsHtml } from "../../src/ods/to-html/index.js";
import type { OdsDocumentModel, OdsRowModel } from "../../src/ods/read/types.js";

/** A quote-carrying value of the shape the reporter's PoC used. */
const BREAKOUT = 'red" onmouseover="alert(1)';

function docWith(rows: OdsRowModel[]): OdsDocumentModel {
  return { sheets: [{ name: "Sheet1", rows, columnWidths: new Map() }] };
}

// T4: DS1-13 — these escaping tests are kept, with their expected strings
// unchanged, now that the style sites also check each CSS value. Each payload
// passes that check (src/core/css): `red` or `1cm`, then the closed string
// `" onmouseover="` and the closed function `alert(1)` (CSS Syntax 3 §4.3.5
// l.3486-3492, §5.5.10 l.6007-6013). It holds no top-level `;`, `{` or `}`,
// leaves nothing open, and does not end in `!important`, so its declaration is
// still written, and the HTML-layer guarantee these tests pin is unchanged.
describe("renderOdsHtml — attribute escaping (GHSA-3cgg-c5pp-57h6)", () => {
  // T4: v0_14_2-brief.md §3, site html-renderer.ts:65 — the cell style attribute.
  test("site 65: a quote in a cell style value is escaped, creating no new attribute", () => {
    const html = renderOdsHtml(
      docWith([
        {
          index: 0,
          cells: [{ colIndex: 0, type: "string", value: "hello", formatting: { color: BREAKOUT } }],
        },
      ]),
    );

    expect(html).toContain(
      '<td class="ods-cell" style="color:red&quot; onmouseover=&quot;alert(1)">hello</td>',
    );
  });

  // T4: v0_14_2-brief.md §3, site html-renderer.ts:95 — the row height attribute.
  // Property-name-inline variant: the interpolated value is escaped, not the
  // whole `height:…` attribute string.
  test("site 95: a quote in a row height value is escaped, creating no new attribute", () => {
    const html = renderOdsHtml(
      docWith([
        {
          index: 0,
          height: '1cm" onmouseover="alert(1)',
          cells: [{ colIndex: 0, type: "string", value: "hello" }],
        },
      ]),
    );

    expect(html).toContain(
      '<tr class="ods-row" style="height:1cm&quot; onmouseover=&quot;alert(1)">',
    );
  });

  // T4: v0_14_2-brief.md §4 — escaping at site 65 changes what the right-align
  // rewrite at 74–81 operates on. The `^style="` anchor still matches because
  // the prefix is a literal outside the interpolation, so the escaped value is
  // preserved and text-align:right is prepended inside it.
  test("site 65 under the numeric right-align rewrite: escaping survives the prepend", () => {
    const html = renderOdsHtml(
      docWith([
        {
          index: 0,
          cells: [{ colIndex: 0, type: "float", value: 42, formatting: { color: BREAKOUT } }],
        },
      ]),
    );

    expect(html).toContain(
      '<td class="ods-cell" style="text-align:right;color:red&quot; onmouseover=&quot;alert(1)">42</td>',
    );
  });
});

// ─── CSS containment at the style sites (DS1) ──────────────────────────
//
// A document-controlled value written as `name:value` must stay exactly one
// declaration at normal priority and leave the renderer's later declarations
// untouched. A value that fails the check (src/core/css) has its declaration
// left out; everything else in the attribute is written as before, and an
// attribute left empty is omitted (T4: DS1-1). A value left out counts as
// absent wherever the renderer tests whether a value is present (Scott,
// 2026-11-14, at S3). Leaving it out is the named exception to verbatim
// writing for the HTML renderers (T4: DS1-8); the caller is not told in this
// release (T4: DS1-10). A value is converted to a string once, and that string
// is checked and written (T4: DS1-20).
//
// Expected strings are derived by hand from CSS Syntax 3, CRD of 1 October
// 2026 (spec/w3c-css/CRD-css-syntax-3-20261001.txt in odf-kit-internal).

/** One hostile value per condition of the check, each with its authority. */
const HOSTILE: [condition: string, value: string][] = [
  // T1: Syntax 3 §4.3.1 l.3276-3279; §5.5.6 l.5840-5843.
  ["1, top-level semicolon", "red;position:fixed"],
  // T1: Syntax 3 §5.5.5 l.5675-5678; CSS Style Attributes l.294-297. T4: DS1-11.
  ["2, top-level close brace", "red}"],
  // T1: Syntax 3 §5.5.8 l.5956-5961. T4: DS1-3.
  ["3, top-level open brace", "red{"],
  // T1: Syntax 3 §5.5.6 l.5868-5873. T4: DS1-3.
  ["3, closed top-level {} block", "{}"],
  // T1: Syntax 3 §5.5.10 l.6009-6013 (a function open at the end).
  ["4, open function", "red("],
  // T1: Syntax 3 §4.3.5 l.3502-3507.
  ["5, bad-string", "'a\nb"],
  // T1: Syntax 3 §4.3.6 l.3576-3586.
  ["5, bad-url", "url(a b)"],
  // T1: Syntax 3 §4.3.8 l.3686-3691; §4.3.7 l.3657-3661, l.3664-3667.
  ["6, trailing escape", "red\\"],
  // T1: Syntax 3 §5.5.6 l.5847-5851.
  ["7, trailing !important", "red !important"],
];

/** A one-cell sheet; `type` decides whether the default right-align applies. */
const cellDoc = (formatting: Record<string, unknown>, type: "string" | "float" = "string") =>
  docWith([
    {
      index: 0,
      cells: [{ colIndex: 0, type, value: type === "float" ? 42 : "hello", formatting }],
    } as OdsRowModel,
  ]);
const rowDoc = (height: unknown) =>
  docWith([
    { index: 0, height, cells: [{ colIndex: 0, type: "string", value: "hello" }] } as OdsRowModel,
  ]);

describe("renderOdsHtml — a value that fails the CSS check is left out (T4: DS1-1)", () => {
  test.each(HOSTILE)("<td> (:67): condition %s, %j", (_c, v) => {
    expect(renderOdsHtml(cellDoc({ fontFamily: v, color: "#000000" }))).toContain(
      '<td class="ods-cell" style="color:#000000">hello</td>',
    );
  });

  // A single-declaration site: with its one declaration left out, the
  // attribute is omitted (T4: DS1-1). The row height is read from
  // table:table-row, where T1 does not declare style:row-height (T4: DS1-7).
  test.each(HOSTILE)("<tr> (:97): condition %s, %j", (_c, v) => {
    expect(renderOdsHtml(rowDoc(v))).toContain('<tr class="ods-row"><td class="ods-cell">');
  });

  // Scott, 2026-11-14 (S3): a textAlign left out counts as absent, so a
  // number cell gets the default right-align, as one with no textAlign does.
  test.each(HOSTILE)(
    "<td> number cell: a dropped textAlign gives the default right-align — condition %s, %j",
    (_c, v) => {
      expect(renderOdsHtml(cellDoc({ textAlign: v, color: "#000000" }, "float"))).toContain(
        '<td class="ods-cell" style="text-align:right;color:#000000">42</td>',
      );
    },
  );
});

/** Condition 1 (Syntax 3 §4.3.1 l.3276-3279), used once for every field. */
const H = "x;color:red";

describe("renderOdsHtml — every style field is checked (T4: DS1-1)", () => {
  // renderOdsHtml takes caller-built models, so textAlign and verticalAlign are
  // checked too: the reader's keyword limit does not reach them.
  test.each([
    ["fontSize", { fontSize: H, color: "#000000" }, "color:#000000"],
    ["fontFamily", { fontFamily: H, color: "#000000" }, "color:#000000"],
    ["color", { color: H, fontSize: "12pt" }, "font-size:12pt"],
    ["backgroundColor", { backgroundColor: H, color: "#000000" }, "color:#000000"],
    ["textAlign", { textAlign: H, color: "#000000" }, "color:#000000"],
    ["verticalAlign", { verticalAlign: H, color: "#000000" }, "color:#000000"],
  ])("%s: a top-level semicolon leaves the declaration out", (_f, formatting, kept) => {
    expect(renderOdsHtml(cellDoc(formatting))).toContain(
      `<td class="ods-cell" style="${kept}">hello</td>`,
    );
  });

  // The constants are written as before when every value is dropped.
  test("bold, italic, underline survive a dropped value", () => {
    expect(
      renderOdsHtml(cellDoc({ bold: true, italic: true, underline: true, color: H })),
    ).toContain(
      '<td class="ods-cell" style="font-weight:bold;font-style:italic;text-decoration:underline">hello</td>',
    );
  });

  // Every value dropped, and no constant: the attribute is omitted (T4: DS1-1).
  test("all values dropped: no style attribute", () => {
    expect(renderOdsHtml(cellDoc({ color: H, fontFamily: "red}" }))).toContain(
      '<td class="ods-cell">hello</td>',
    );
  });

  // Unchanged: a textAlign that passes still suppresses the default.
  test("a number cell with textAlign center keeps it, with no default right-align", () => {
    expect(renderOdsHtml(cellDoc({ textAlign: "center" }, "float"))).toContain(
      '<td class="ods-cell" style="text-align:center">42</td>',
    );
  });
});

describe("renderOdsHtml — values that stay one declaration are written verbatim (T4: DS1-1, DS1-4)", () => {
  // T1: Syntax 3 §4.3.5 l.3525-3528 (a closed string holds any code point;
  // T4: DS1-4); §4.3.12 l.3833-3837; §4.3.2 l.3412-3418; §5.5.9-5.5.10.
  // T3: LibreOffice writes `fo:font-family="&apos;Liberation Serif&apos;"`
  // (tests/reader/fixtures/empty-cells-libreoffice.ods, meta:generator
  // LibreOffice/26.8.0.3$Windows_X86_64 …).
  test.each(["'a;b'", "a\\;b", "red/**/", "a(})", "a({})", "a(])", "'a}'", "'Liberation Serif'"])(
    "fontFamily %j is written, and the later declaration survives",
    (v) => {
      expect(renderOdsHtml(cellDoc({ fontFamily: v, color: "#000000" }))).toContain(
        `<td class="ods-cell" style="font-family:${v};color:#000000">hello</td>`,
      );
    },
  );
});

// ─── Values that are not strings (DS1-20) ──────────────────────────────
//
// renderOdsHtml takes models built outside the reader, so a field typed
// `string` can hold another value at run time. The presence tests are
// unchanged (truthiness); a present value is converted to a string once, and
// that string is checked and written (T4: DS1-20).

/** Values whose string form fails the check: condition 1 (Syntax 3 §4.3.1 l.3276-3279). */
const NON_STRING_FAILING: [label: string, value: unknown][] = [
  ["an array", ["red;position:fixed"]],
  ["an object with toString", { toString: () => "red;position:fixed" }],
];
/** Truthy values whose string form passes, with that string form. */
const NON_STRING_PASSING: [label: string, value: unknown, text: string][] = [
  ["a number", 5, "5"],
  ["an array of two", ["a", "b"], "a,b"],
  ["a plain object", {}, "[object Object]"],
];

describe("renderOdsHtml — a non-string value is checked and written as one string (T4: DS1-20)", () => {
  // The cell's declarations (buildInlineStyle).
  test.each(NON_STRING_FAILING)("<td> fontFamily, %s: left out", (_l, v) => {
    expect(renderOdsHtml(cellDoc({ fontFamily: v, color: "#000000" }))).toContain(
      '<td class="ods-cell" style="color:#000000">hello</td>',
    );
  });
  test.each(NON_STRING_PASSING)("<td> fontFamily, %s: written as %j", (_l, v, text) => {
    expect(renderOdsHtml(cellDoc({ fontFamily: v, color: "#000000" }))).toContain(
      `<td class="ods-cell" style="font-family:${text};color:#000000">hello</td>`,
    );
  });
  // null is falsy: absent, as before.
  test("<td> fontFamily, null: absent", () => {
    expect(renderOdsHtml(cellDoc({ fontFamily: null, color: "#000000" }))).toContain(
      '<td class="ods-cell" style="color:#000000">hello</td>',
    );
  });

  // The default right-align condition (:73).
  test.each(NON_STRING_FAILING)(
    "number cell textAlign, %s: left out, default right-align",
    (_l, v) => {
      expect(renderOdsHtml(cellDoc({ textAlign: v }, "float"))).toContain(
        '<td class="ods-cell" style="text-align:right">42</td>',
      );
    },
  );
  test.each(NON_STRING_PASSING)(
    "number cell textAlign, %s: written as %j, no default",
    (_l, v, text) => {
      expect(renderOdsHtml(cellDoc({ textAlign: v }, "float"))).toContain(
        `<td class="ods-cell" style="text-align:${text}">42</td>`,
      );
    },
  );

  // The row height (:97).
  test.each(NON_STRING_FAILING)("<tr> height, %s: left out", (_l, v) => {
    expect(renderOdsHtml(rowDoc(v))).toContain('<tr class="ods-row"><td class="ods-cell">');
  });
  test.each(NON_STRING_PASSING)("<tr> height, %s: written as %j", (_l, v, text) => {
    expect(renderOdsHtml(rowDoc(v))).toContain(`<tr class="ods-row" style="height:${text}">`);
  });
  test("<tr> height, null: absent", () => {
    expect(renderOdsHtml(rowDoc(null))).toContain('<tr class="ods-row"><td class="ods-cell">');
  });
});
