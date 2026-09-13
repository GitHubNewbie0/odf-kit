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
