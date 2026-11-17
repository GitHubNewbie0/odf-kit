/**
 * ODT HTML renderer — attribute escaping.
 *
 * GHSA-3cgg-c5pp-57h6: document-controlled values were interpolated into
 * hand-built HTML attributes without escaping, so a `"` in the value
 * terminated the attribute and injected arbitrary markup.
 *
 * Q1 (test-fixture-strategy-plan.md §2) governs the input type: these test the
 * renderer in isolation — given a known model, assert the HTML — so the input
 * is a hand-built model. A real .odt would drag the parser into an assertion
 * that is not about the parser, and no editor UI can author an svg:width or
 * fo:color containing a quote in the first place.
 *
 * Each test pins the whole emitted opening tag rather than probing for
 * substrings. That proves both halves of the fix at once — the value appears
 * in escaped form, AND no additional attribute or element was created, since
 * the pinned string runs to the closing `>`. Asserting the absence of a
 * payload substring such as `onmouseover=` would be wrong: escapeAttr does not
 * touch `=` or attribute names, so that substring survives verbatim inside the
 * attribute value. What changed is that it no longer parses as an attribute.
 * Confirmed by the move-5 green probe against the reporter's PoCs.
 */

import { renderOdtHtml } from "../../src/odt/to-html/index.js";
import type { BodyNode } from "../../src/odt/read/types.js";

/** Quote-carrying values of the shape the reporter's PoCs used. */
const BREAKOUT = 'red" onmouseover="alert(1)';
const LENGTH_BREAKOUT = '1cm" onmouseover="alert(1)';

const opts = { fragment: true } as const;

// T4: DS1-13 — these escaping tests are kept, with their expected strings
// unchanged, now that the style sites also check each CSS value. Each payload
// passes that check (src/core/css): `red` or `1cm`, then the closed string
// `" onmouseover="` and the closed function `alert(1)` (CSS Syntax 3 §4.3.5
// l.3486-3492, §5.5.10 l.6007-6013). It holds no top-level `;`, `{` or `}`,
// leaves nothing open, and does not end in `!important`, so its declaration is
// still written, and the HTML-layer guarantee these tests pin is unchanged.
describe("renderOdtHtml — attribute escaping (GHSA-3cgg-c5pp-57h6)", () => {
  // T4: v0_14_2-brief.md §3, site html-renderer.ts:197 — the span style attribute.
  test("site 197: a quote in a span style value is escaped, creating no new attribute", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "hello", style: { fontColor: BREAKOUT } }] },
    ];

    expect(renderOdtHtml(body, opts)).toContain(
      '<span style="color:red&quot; onmouseover=&quot;alert(1)">hello</span>',
    );
  });

  // T4: v0_14_2-brief.md §3, site html-renderer.ts:227 — the image data-URI src.
  // Two interpolations, tested separately: mediaType is document-controlled and
  // can plainly carry a quote.
  test("site 227: a quote in the image mediaType is escaped, creating no new attribute", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ kind: "image", data: "AAAA", mediaType: 'image/png" onerror="alert(1)' }],
      },
    ];

    expect(renderOdtHtml(body, opts)).toContain(
      '<img src="data:image/png&quot; onerror=&quot;alert(1);base64,AAAA" alt="">',
    );
  });

  // T4: v0_14_2-brief.md §3 — node.data is escaped UNCONDITIONALLY (ruled
  // 2026-09-12). Valid base64 cannot contain a quote, so this escape is a no-op
  // in the normal case; the ruling removes the dependency on an invariant
  // maintained elsewhere, since the reader's input is an untrusted package.
  // This test exists so that removing the data escape cannot leave the suite
  // green.
  test("site 227: a quote in the image data is escaped, creating no new attribute", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ kind: "image", data: 'AAAA" onerror="alert(1)', mediaType: "image/png" }],
      },
    ];

    expect(renderOdtHtml(body, opts)).toContain(
      '<img src="data:image/png;base64,AAAA&quot; onerror=&quot;alert(1)" alt="">',
    );
  });

  // T4: v0_14_2-brief.md §3, site html-renderer.ts:246 — the image style attribute.
  // The values reaching it are pushed at 233-234 (svg:width, svg:height) and are
  // named in neither the brief's site list nor the advisory: they do not match
  // the `style="${` pattern the site list was derived from. Escaping the joined
  // string at 246 covers both. One test each, so the advisory's count of
  // document-controlled values has a check behind it rather than a note.
  test("site 246: a quote in the image width is escaped, creating no new attribute", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ kind: "image", data: "AAAA", mediaType: "image/png", width: LENGTH_BREAKOUT }],
      },
    ];

    expect(renderOdtHtml(body, opts)).toContain(
      '<img src="data:image/png;base64,AAAA" alt="" style="width:1cm&quot; onmouseover=&quot;alert(1)">',
    );
  });

  test("site 246: a quote in the image height is escaped, creating no new attribute", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ kind: "image", data: "AAAA", mediaType: "image/png", height: LENGTH_BREAKOUT }],
      },
    ];

    expect(renderOdtHtml(body, opts)).toContain(
      '<img src="data:image/png;base64,AAAA" alt="" style="height:1cm&quot; onmouseover=&quot;alert(1)">',
    );
  });

  // T4: v0_14_2-brief.md §3, site html-renderer.ts:369 — the table row style attribute.
  test("site 369: a quote in a row style value is escaped, creating no new attribute", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            isHeader: false,
            rowStyle: { backgroundColor: BREAKOUT },
            cells: [{ spans: [{ text: "x" }] }],
          },
        ],
      },
    ];

    expect(renderOdtHtml(body, opts)).toContain(
      '<tr style="background-color:red&quot; onmouseover=&quot;alert(1)">',
    );
  });

  // T4: v0_14_2-brief.md §3, site html-renderer.ts:384 — the table cell style attribute.
  test("site 384: a quote in a cell style value is escaped, creating no new attribute", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            isHeader: false,
            cells: [{ spans: [{ text: "x" }], cellStyle: { backgroundColor: BREAKOUT } }],
          },
        ],
      },
    ];

    expect(renderOdtHtml(body, opts)).toContain(
      '<td style="background-color:red&quot; onmouseover=&quot;alert(1)">',
    );
  });

  // T4: v0_14_2-brief.md §3, site html-renderer.ts:414 — the <col> width attribute.
  // Property-name-inline variant: the interpolated value is escaped, not the
  // whole `width:…` attribute string.
  test("site 414: a quote in a column width is escaped, creating no new attribute", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            isHeader: false,
            cells: [{ spans: [{ text: "x" }], cellStyle: { columnWidth: LENGTH_BREAKOUT } }],
          },
        ],
      },
    ];

    expect(renderOdtHtml(body, opts)).toContain(
      '<colgroup><col style="width:1cm&quot; onmouseover=&quot;alert(1)"></colgroup>',
    );
  });

  // T4: v0_14_2-brief.md §3, sites html-renderer.ts:515 and :523. The two lines
  // are byte-identical, so each assertion names its element — <p> for the
  // paragraph case, <h2> for the heading case. Asserting on the style attribute
  // alone would leave one site untested while appearing covered.
  test("site 515: a quote in a paragraph style value is escaped, creating no new attribute", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", paragraphStyle: { textAlign: BREAKOUT }, spans: [{ text: "hello" }] },
    ];

    expect(renderOdtHtml(body, opts)).toContain(
      '<p style="text-align:red&quot; onmouseover=&quot;alert(1)">hello</p>',
    );
  });

  test("site 523: a quote in a heading style value is escaped, creating no new attribute", () => {
    const body: BodyNode[] = [
      {
        kind: "heading",
        level: 2,
        paragraphStyle: { textAlign: BREAKOUT },
        spans: [{ text: "hello" }],
      },
    ];

    expect(renderOdtHtml(body, opts)).toContain(
      '<h2 style="text-align:red&quot; onmouseover=&quot;alert(1)">hello</h2>',
    );
  });
});

// ─── CSS containment at the style sites (DS1) ──────────────────────────
//
// A document-controlled value written as `name:value` must stay exactly one
// declaration at normal priority and leave the renderer's later declarations
// untouched. A value that fails the check (src/core/css) has its declaration
// left out; everything else in the attribute is written as before, and an
// attribute left empty is omitted (T4: DS1-1). Leaving it out is the named
// exception to verbatim writing for the HTML renderers (T4: DS1-8), and the
// caller is not told in this release (T4: DS1-10).
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

const image = (extra: Record<string, unknown>): BodyNode[] =>
  [
    {
      kind: "paragraph",
      spans: [{ kind: "image", data: "AAAA", mediaType: "image/png", ...extra }],
    },
  ] as BodyNode[];
const table = (cells: Record<string, unknown>[], rowStyle?: Record<string, unknown>): BodyNode[] =>
  [
    {
      kind: "table",
      rows: [
        {
          isHeader: false,
          ...(rowStyle ? { rowStyle } : {}),
          cells: cells.map((c) => ({ spans: [{ text: "x" }], ...c })),
        },
      ],
    },
  ] as BodyNode[];
const span = (style: Record<string, unknown>): BodyNode[] =>
  [{ kind: "paragraph", spans: [{ text: "hello", style }] }] as BodyNode[];
const para = (paragraphStyle: Record<string, unknown>): BodyNode[] =>
  [{ kind: "paragraph", paragraphStyle, spans: [{ text: "hello" }] }] as BodyNode[];

/**
 * Each style site: a model holding value `v` followed by a later declaration,
 * and the tag expected once `v` is left out.
 */
const SITES: [site: string, build: (v: string) => BodyNode[], expected: string][] = [
  [
    "<span> (:206)",
    (v) => span({ fontColor: v, fontSize: 12 }),
    '<span style="font-size:12pt">hello</span>',
  ],
  [
    "<p> (:535)",
    (v) => para({ textAlign: v, marginLeft: "1cm" }),
    '<p style="margin-left:1cm">hello</p>',
  ],
  [
    "<h2> (:544)",
    (v) =>
      [
        {
          kind: "heading",
          level: 2,
          paragraphStyle: { textAlign: v, marginLeft: "1cm" },
          spans: [{ text: "hello" }],
        },
      ] as BodyNode[],
    '<h2 style="margin-left:1cm">hello</h2>',
  ],
  [
    "<img> (:255)",
    (v) => image({ width: v, height: "2cm", wrapMode: "left" }),
    '<img src="data:image/png;base64,AAAA" alt="" style="height:2cm;float:left">',
  ],
  [
    "<td> (:403)",
    (v) => table([{ cellStyle: { backgroundColor: v, verticalAlign: "top" } }]),
    '<td style="vertical-align:top">',
  ],
  // A single-declaration site: with its one declaration left out, the
  // attribute is omitted (T4: DS1-1).
  ["<tr> (:388)", (v) => table([{}], { backgroundColor: v }), "<table><tr><td>"],
  [
    "<col> (:433)",
    (v) => table([{ cellStyle: { columnWidth: v } }, { cellStyle: { columnWidth: "2cm" } }]),
    '<colgroup><col><col style="width:2cm"></colgroup>',
  ],
];

describe("renderOdtHtml — a value that fails the CSS check is left out (T4: DS1-1)", () => {
  for (const [site, build, expected] of SITES) {
    test.each(HOSTILE)(`${site}: condition %s, %j`, (_condition, v) => {
      expect(renderOdtHtml(build(v), opts)).toContain(expected);
    });
  }

  // T4: DS1-1 with first-pass-r2.md C12 — a dropped width counts as absent,
  // so with no width left the <colgroup> is not emitted.
  test.each(HOSTILE)(
    "<colgroup> (:436): no passing width, no colgroup — condition %s, %j",
    (_c, v) => {
      expect(renderOdtHtml(table([{ cellStyle: { columnWidth: v } }]), opts)).toContain(
        "<table><tr><td>",
      );
    },
  );

  // T4: DS1-1 — inside a table cell the constant margin reset is still
  // written when the paragraph's own value is left out.
  test.each(HOSTILE)("cell paragraph: the reset survives — condition %s, %j", (_c, v) => {
    const body = table([
      { body: [{ kind: "paragraph", paragraphStyle: { textAlign: v }, spans: [{ text: "x" }] }] },
    ]);
    expect(renderOdtHtml(body, opts)).toContain(
      '<td><p style="margin-top:0;margin-bottom:0">x</p></td>',
    );
  });
});

/** Condition 1 (Syntax 3 §4.3.1 l.3276-3279), used once for every field. */
const H = "x;color:red";

/** Every document- or caller-controlled field, with a control declaration and the tag expected. */
const FIELDS: [field: string, body: BodyNode[], expected: string][] = [
  [
    "span fontColor",
    span({ fontColor: H, letterSpacing: "1pt" }),
    '<span style="letter-spacing:1pt">',
  ],
  // T4: DS1-2 — at :108 the check reads the text written, `${fontSize}pt`.
  ["span fontSize", span({ fontSize: H, fontColor: "#000000" }), '<span style="color:#000000">'],
  [
    "span fontFamily",
    span({ fontFamily: H, fontColor: "#000000" }),
    '<span style="color:#000000">',
  ],
  [
    "span highlightColor",
    span({ highlightColor: H, fontColor: "#000000" }),
    '<span style="color:#000000">',
  ],
  [
    "span textTransform",
    span({ textTransform: H, fontColor: "#000000" }),
    '<span style="color:#000000">',
  ],
  [
    "span fontVariant",
    span({ fontVariant: H, fontColor: "#000000" }),
    '<span style="color:#000000">',
  ],
  [
    "span textShadow",
    span({ textShadow: H, fontColor: "#000000" }),
    '<span style="color:#000000">',
  ],
  [
    "span letterSpacing",
    span({ letterSpacing: H, fontColor: "#000000" }),
    '<span style="color:#000000">',
  ],
  ["p textAlign", para({ textAlign: H, marginLeft: "1cm" }), '<p style="margin-left:1cm">'],
  ["p marginLeft", para({ marginLeft: H, textAlign: "center" }), '<p style="text-align:center">'],
  ["p marginRight", para({ marginRight: H, textAlign: "center" }), '<p style="text-align:center">'],
  // T4: DS1-7 — marginTop / marginBottom also carry fo:space-before /
  // fo:space-after, read where T1 declares nothing; checked like any value.
  ["p marginTop", para({ marginTop: H, textAlign: "center" }), '<p style="text-align:center">'],
  [
    "p marginBottom",
    para({ marginBottom: H, textAlign: "center" }),
    '<p style="text-align:center">',
  ],
  ["p paddingLeft", para({ paddingLeft: H, textAlign: "center" }), '<p style="text-align:center">'],
  [
    "p paddingRight",
    para({ paddingRight: H, textAlign: "center" }),
    '<p style="text-align:center">',
  ],
  ["p lineHeight", para({ lineHeight: H, textAlign: "center" }), '<p style="text-align:center">'],
  [
    "img width",
    image({ width: H, height: "2cm" }),
    '<img src="data:image/png;base64,AAAA" alt="" style="height:2cm">',
  ],
  [
    "img height",
    image({ height: H, width: "2cm" }),
    '<img src="data:image/png;base64,AAAA" alt="" style="width:2cm">',
  ],
  [
    "td backgroundColor",
    table([{ cellStyle: { backgroundColor: H, verticalAlign: "top" } }]),
    '<td style="vertical-align:top">',
  ],
  [
    "td verticalAlign",
    table([{ cellStyle: { verticalAlign: H, backgroundColor: "#ffffff" } }]),
    '<td style="background-color:#ffffff">',
  ],
  [
    "td border.top",
    table([{ cellStyle: { border: { top: H }, verticalAlign: "top" } }]),
    '<td style="vertical-align:top">',
  ],
  [
    "td border.bottom",
    table([{ cellStyle: { border: { bottom: H }, verticalAlign: "top" } }]),
    '<td style="vertical-align:top">',
  ],
  [
    "td border.left",
    table([{ cellStyle: { border: { left: H }, verticalAlign: "top" } }]),
    '<td style="vertical-align:top">',
  ],
  [
    "td border.right",
    table([{ cellStyle: { border: { right: H }, verticalAlign: "top" } }]),
    '<td style="vertical-align:top">',
  ],
  ["tr backgroundColor", table([{}], { backgroundColor: H }), "<table><tr><td>"],
  // T4: DS1-7 — columnWidth is also read from cell properties, where T1 does
  // not declare style:column-width; checked like any value.
  ["col columnWidth", table([{ cellStyle: { columnWidth: H } }]), "<table><tr><td>"],
];

describe("renderOdtHtml — every style field is checked (T4: DS1-1)", () => {
  test.each(FIELDS)(
    "%s: a top-level semicolon leaves the declaration out",
    (_f, body, expected) => {
      expect(renderOdtHtml(body, opts)).toContain(expected);
    },
  );
});

describe("renderOdtHtml — font-size is checked as the text written (T4: DS1-2)", () => {
  // T4: DS1-2 — the check reads `${fontSize}pt`. In place `pt` follows the
  // model value, so a trailing `\` escapes `p` (Syntax 3 §4.3.7 l.3664-3667)
  // and `!important` becomes the ident `importantpt` (§4.3.12 l.3824-3845):
  // each is one declaration at normal priority, and is written.
  test.each([
    ["1\\", '<span style="font-size:1\\pt">'],
    ["1 !important", '<span style="font-size:1 !importantpt">'],
  ])("fontSize %j is written", (v, expected) => {
    expect(renderOdtHtml(span({ fontSize: v }), opts)).toContain(expected);
  });
});

describe("renderOdtHtml — values that stay one declaration are written verbatim (T4: DS1-1, DS1-4)", () => {
  // T1: Syntax 3 §4.3.5 l.3525-3528 (a closed string holds any code point;
  // T4: DS1-4); §4.3.12 l.3833-3837 (`\;` is part of an ident); §4.3.2
  // l.3412-3418 (a closed comment makes no token); §5.5.9-5.5.10 (a brace
  // inside a closed function is not top-level). T3: LibreOffice writes
  // `fo:font-family="&apos;Liberation Sans&apos;"`
  // (tests/reader/fixtures/a4-cm-libreoffice.odt, meta:generator
  // LibreOffice/26.2.4.2$Windows_X86_64 …).
  test.each(["'a;b'", "a\\;b", "red/**/", "a(})", "a({})", "a(])", "'a}'", "'Liberation Sans'"])(
    "fontFamily %j is written, and the later declaration survives",
    (v) => {
      expect(renderOdtHtml(span({ fontFamily: v, highlightColor: "#ffff00" }), opts)).toContain(
        `<span style="font-family:${v};background-color:#ffff00">`,
      );
    },
  );
});

// ─── Values that are not strings (DS1-20) ──────────────────────────────
//
// renderOdtHtml takes models built outside the reader, for example parsed
// from JSON, so a field typed `string` can hold another value at run time.
// T4: DS1-20 — the value is converted to a string once; that string is
// checked and that string is written. The presence tests are unchanged:
// `!== undefined` for a declaration, truthiness for a <col> width.

/** Values whose string form fails the check: condition 1 (Syntax 3 §4.3.1 l.3276-3279). */
const NON_STRING_FAILING: [label: string, value: unknown][] = [
  ["an array", ["red;position:fixed"]],
  ["an object with toString", { toString: () => "red;position:fixed" }],
];
/** Values whose string form passes, with that string form. */
const NON_STRING_PASSING: [label: string, value: unknown, text: string][] = [
  ["a number", 5, "5"],
  ["an array of two", ["a", "b"], "a,b"],
  ["a plain object", {}, "[object Object]"],
  ["null", null, "null"],
];

describe("renderOdtHtml — a non-string value is checked and written as one string (T4: DS1-20)", () => {
  // The shared helper (pushDeclaration), at a span and at a paragraph.
  test.each(NON_STRING_FAILING)("span fontColor, %s: left out", (_l, v) => {
    expect(renderOdtHtml(span({ fontColor: v, fontSize: 12 }), opts)).toContain(
      '<span style="font-size:12pt">',
    );
  });
  test.each(NON_STRING_PASSING)("span fontColor, %s: written as %j", (_l, v, text) => {
    expect(renderOdtHtml(span({ fontColor: v, fontSize: 12 }), opts)).toContain(
      `<span style="color:${text};font-size:12pt">`,
    );
  });
  test.each(NON_STRING_FAILING)("p marginLeft, %s: left out", (_l, v) => {
    expect(renderOdtHtml(para({ marginLeft: v, marginRight: "1cm" }), opts)).toContain(
      '<p style="margin-right:1cm">',
    );
  });
  test.each(NON_STRING_PASSING)("p marginLeft, %s: written as %j", (_l, v, text) => {
    expect(renderOdtHtml(para({ marginLeft: v, marginRight: "1cm" }), opts)).toContain(
      `<p style="margin-left:${text};margin-right:1cm">`,
    );
  });

  // The <col> width (renderTable). null is falsy, so, as before, it gives a
  // bare <col>.
  const cols = (v: unknown) =>
    table([{ cellStyle: { columnWidth: v } }, { cellStyle: { columnWidth: "2cm" } }]);
  test.each(NON_STRING_FAILING)("col columnWidth, %s: left out", (_l, v) => {
    expect(renderOdtHtml(cols(v), opts)).toContain(
      '<colgroup><col><col style="width:2cm"></colgroup>',
    );
  });
  test.each(NON_STRING_PASSING.filter(([, v]) => v !== null))(
    "col columnWidth, %s: written as %j",
    (_l, v, text) => {
      expect(renderOdtHtml(cols(v), opts)).toContain(
        `<colgroup><col style="width:${text}"><col style="width:2cm"></colgroup>`,
      );
    },
  );
  test("col columnWidth, null: a bare <col>", () => {
    expect(renderOdtHtml(cols(null), opts)).toContain(
      '<colgroup><col><col style="width:2cm"></colgroup>',
    );
  });

  // Font size: the string is `${fontSize}pt` (T4: DS1-2).
  test.each([
    ["an array", ["12;position:fixed"]],
    ["an object with toString", { toString: () => "12;position:fixed" }],
  ])("span fontSize, %s: left out", (_l, v) => {
    expect(renderOdtHtml(span({ fontColor: "#000000", fontSize: v }), opts)).toContain(
      '<span style="color:#000000">',
    );
  });
  test.each(NON_STRING_PASSING)("span fontSize, %s: written as %jpt", (_l, v, text) => {
    expect(renderOdtHtml(span({ fontColor: "#000000", fontSize: v }), opts)).toContain(
      `<span style="color:#000000;font-size:${text}pt">`,
    );
  });
});
