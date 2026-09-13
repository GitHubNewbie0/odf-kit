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
