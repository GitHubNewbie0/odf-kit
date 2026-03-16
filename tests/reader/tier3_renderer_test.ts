import { renderHtml } from "../../src/reader/html-renderer.js";
import type {
  BodyNode,
  ParagraphStyle,
  SectionNode,
  TrackedChangeNode,
} from "../../src/reader/types.js";

// ============================================================
// Helpers
// ============================================================

/** Wrap inline text in a paragraph with an optional ParagraphStyle. */
function para(text: string, paragraphStyle?: ParagraphStyle): BodyNode {
  return { kind: "paragraph", spans: [{ text }], ...(paragraphStyle && { paragraphStyle }) };
}

/** Wrap inline text in a heading with an optional ParagraphStyle. */
function heading(
  text: string,
  level: 1 | 2 | 3 | 4 | 5 | 6,
  paragraphStyle?: ParagraphStyle,
): BodyNode {
  return { kind: "heading", level, spans: [{ text }], ...(paragraphStyle && { paragraphStyle }) };
}

// ============================================================
// ParagraphStyle — paragraph elements
// ============================================================

describe("renderHtml Tier 3 — ParagraphStyle on paragraphs", () => {
  test("textAlign emits text-align CSS on <p>", () => {
    const html = renderHtml([para("aligned", { textAlign: "center" })], { fragment: true });
    expect(html).toContain('<p style="text-align:center">');
  });

  test("all six ODF text-align values are passed through verbatim", () => {
    for (const value of ["start", "end", "left", "right", "center", "justify"]) {
      const html = renderHtml([para("x", { textAlign: value })], { fragment: true });
      expect(html).toContain(`text-align:${value}`);
    }
  });

  test("marginLeft emits margin-left CSS on <p>", () => {
    const html = renderHtml([para("indented", { marginLeft: "1.5cm" })], { fragment: true });
    expect(html).toContain("margin-left:1.5cm");
  });

  test("marginRight emits margin-right CSS on <p>", () => {
    const html = renderHtml([para("x", { marginRight: "2cm" })], { fragment: true });
    expect(html).toContain("margin-right:2cm");
  });

  test("marginTop emits margin-top CSS on <p>", () => {
    const html = renderHtml([para("x", { marginTop: "0.5cm" })], { fragment: true });
    expect(html).toContain("margin-top:0.5cm");
  });

  test("marginBottom emits margin-bottom CSS on <p>", () => {
    const html = renderHtml([para("x", { marginBottom: "0.5cm" })], { fragment: true });
    expect(html).toContain("margin-bottom:0.5cm");
  });

  test("paddingLeft emits padding-left CSS on <p>", () => {
    const html = renderHtml([para("x", { paddingLeft: "0.2cm" })], { fragment: true });
    expect(html).toContain("padding-left:0.2cm");
  });

  test("paddingRight emits padding-right CSS on <p>", () => {
    const html = renderHtml([para("x", { paddingRight: "0.2cm" })], { fragment: true });
    expect(html).toContain("padding-right:0.2cm");
  });

  test("lineHeight percentage emits line-height CSS on <p>", () => {
    const html = renderHtml([para("x", { lineHeight: "150%" })], { fragment: true });
    expect(html).toContain("line-height:150%");
  });

  test("lineHeight length value emits line-height CSS on <p>", () => {
    const html = renderHtml([para("x", { lineHeight: "0.6cm" })], { fragment: true });
    expect(html).toContain("line-height:0.6cm");
  });

  test("multiple ParagraphStyle properties are combined in one style attribute", () => {
    const html = renderHtml(
      [para("x", { textAlign: "justify", marginLeft: "1cm", lineHeight: "120%" })],
      { fragment: true },
    );
    expect(html).toContain("text-align:justify");
    expect(html).toContain("margin-left:1cm");
    expect(html).toContain("line-height:120%");
    // All in a single style attribute on <p>
    expect(html).toMatch(/<p style="[^"]*text-align:justify[^"]*">/);
  });

  test("paragraph with no paragraphStyle has no style attribute on <p>", () => {
    const html = renderHtml([para("plain")], { fragment: true });
    expect(html).toBe("<p>plain</p>");
  });

  test("paragraph content is preserved when paragraphStyle is set", () => {
    const html = renderHtml([para("content here", { textAlign: "right" })], { fragment: true });
    expect(html).toContain("content here");
    expect(html).toContain("</p>");
  });
});

// ============================================================
// ParagraphStyle — heading elements
// ============================================================

describe("renderHtml Tier 3 — ParagraphStyle on headings", () => {
  test("textAlign emits text-align CSS on <h1>", () => {
    const html = renderHtml([heading("Title", 1, { textAlign: "center" })], { fragment: true });
    expect(html).toContain('<h1 style="text-align:center">');
  });

  test("textAlign emits text-align CSS on <h3>", () => {
    const html = renderHtml([heading("Sub", 3, { textAlign: "right" })], { fragment: true });
    expect(html).toContain('<h3 style="text-align:right">');
  });

  test("marginLeft emits margin-left CSS on heading", () => {
    const html = renderHtml([heading("Indented", 2, { marginLeft: "2cm" })], { fragment: true });
    expect(html).toContain("margin-left:2cm");
    expect(html).toContain("<h2");
  });

  test("heading with no paragraphStyle has no style attribute", () => {
    const html = renderHtml([heading("Plain", 1)], { fragment: true });
    expect(html).toBe("<h1>Plain</h1>");
  });

  test("heading content preserved when paragraphStyle is set", () => {
    const html = renderHtml([heading("Content", 2, { lineHeight: "130%" })], { fragment: true });
    expect(html).toContain("Content");
    expect(html).toContain("</h2>");
  });
});

// ============================================================
// Table column widths — <colgroup>
// ============================================================

describe("renderHtml Tier 3 — table column widths via colgroup", () => {
  test("emits <colgroup> when cells have columnWidth", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [
              { spans: [{ text: "A" }], cellStyle: { columnWidth: "5cm" } },
              { spans: [{ text: "B" }], cellStyle: { columnWidth: "10cm" } },
            ],
          },
        ],
      },
    ];
    const html = renderHtml(body, { fragment: true });
    expect(html).toContain("<colgroup>");
    expect(html).toContain('<col style="width:5cm">');
    expect(html).toContain('<col style="width:10cm">');
  });

  test("colgroup appears before the first <tr>", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [{ spans: [{ text: "X" }], cellStyle: { columnWidth: "3cm" } }],
          },
        ],
      },
    ];
    const html = renderHtml(body, { fragment: true });
    expect(html.indexOf("<colgroup>")).toBeLessThan(html.indexOf("<tr>"));
  });

  test("emits bare <col> for cells without columnWidth in a mixed row", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [
              { spans: [{ text: "A" }], cellStyle: { columnWidth: "5cm" } },
              { spans: [{ text: "B" }] }, // no columnWidth
            ],
          },
        ],
      },
    ];
    const html = renderHtml(body, { fragment: true });
    expect(html).toContain("<colgroup>");
    expect(html).toContain('<col style="width:5cm">');
    expect(html).toContain("<col>");
  });

  test("omits <colgroup> when no cells have columnWidth", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [{ spans: [{ text: "A" }] }, { spans: [{ text: "B" }] }],
          },
        ],
      },
    ];
    const html = renderHtml(body, { fragment: true });
    expect(html).not.toContain("<colgroup>");
    expect(html).not.toContain("<col");
  });

  test("columnWidth is not applied as cell style on <td>", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [{ spans: [{ text: "X" }], cellStyle: { columnWidth: "5cm" } }],
          },
        ],
      },
    ];
    const html = renderHtml(body, { fragment: true });
    // Width should only be on <col>, not on <td>
    expect(html).not.toMatch(/<td[^>]*width:5cm/);
  });
});

// ============================================================
// Image float positioning — wrapMode
// ============================================================

describe("renderHtml Tier 3 — image wrapMode float positioning", () => {
  const baseImage = {
    kind: "image" as const,
    data: "abc",
    mediaType: "image/png",
    width: "5cm",
    height: "3cm",
  };

  test("wrapMode left emits float:left on <img>", () => {
    const html = renderHtml([{ kind: "paragraph", spans: [{ ...baseImage, wrapMode: "left" }] }], {
      fragment: true,
    });
    expect(html).toContain("float:left");
  });

  test("wrapMode right emits float:right on <img>", () => {
    const html = renderHtml([{ kind: "paragraph", spans: [{ ...baseImage, wrapMode: "right" }] }], {
      fragment: true,
    });
    expect(html).toContain("float:right");
  });

  test("wrapMode none emits display:block on <img>", () => {
    const html = renderHtml([{ kind: "paragraph", spans: [{ ...baseImage, wrapMode: "none" }] }], {
      fragment: true,
    });
    expect(html).toContain("display:block");
    expect(html).not.toContain("float:");
  });

  test("wrapMode parallel emits no float CSS", () => {
    const html = renderHtml(
      [{ kind: "paragraph", spans: [{ ...baseImage, wrapMode: "parallel" }] }],
      { fragment: true },
    );
    expect(html).not.toContain("float:");
    expect(html).not.toContain("display:block");
  });

  test("wrapMode run-through emits no float CSS", () => {
    const html = renderHtml(
      [{ kind: "paragraph", spans: [{ ...baseImage, wrapMode: "run-through" }] }],
      { fragment: true },
    );
    expect(html).not.toContain("float:");
    expect(html).not.toContain("display:block");
  });

  test("absent wrapMode emits no float CSS", () => {
    const html = renderHtml([{ kind: "paragraph", spans: [{ ...baseImage }] }], { fragment: true });
    expect(html).not.toContain("float:");
    expect(html).not.toContain("display:block");
  });

  test("wrapMode left combined with width and height in single style attribute", () => {
    const html = renderHtml([{ kind: "paragraph", spans: [{ ...baseImage, wrapMode: "left" }] }], {
      fragment: true,
    });
    // width, height, and float all in the same style attribute
    expect(html).toMatch(/style="[^"]*width:5cm[^"]*"/);
    expect(html).toMatch(/style="[^"]*height:3cm[^"]*"/);
    expect(html).toMatch(/style="[^"]*float:left[^"]*"/);
  });
});

// ============================================================
// SectionNode
// ============================================================

describe("renderHtml Tier 3 — SectionNode", () => {
  test("renders a section as <section> element", () => {
    const section: SectionNode = {
      kind: "section",
      body: [{ kind: "paragraph", spans: [{ text: "section content" }] }],
    };
    const html = renderHtml([section], { fragment: true });
    expect(html).toContain("<section");
    expect(html).toContain("</section>");
    expect(html).toContain("section content");
  });

  test("section name is emitted as data-name attribute", () => {
    const section: SectionNode = {
      kind: "section",
      name: "Introduction",
      body: [{ kind: "paragraph", spans: [{ text: "intro" }] }],
    };
    const html = renderHtml([section], { fragment: true });
    expect(html).toContain('data-name="Introduction"');
  });

  test("section without name has no data-name attribute", () => {
    const section: SectionNode = {
      kind: "section",
      body: [{ kind: "paragraph", spans: [{ text: "x" }] }],
    };
    const html = renderHtml([section], { fragment: true });
    expect(html).not.toContain("data-name");
  });

  test("section name is HTML-escaped", () => {
    const section: SectionNode = {
      kind: "section",
      name: 'Section "A"',
      body: [],
    };
    const html = renderHtml([section], { fragment: true });
    expect(html).toContain('data-name="Section &quot;A&quot;"');
  });

  test("section body content is rendered inside <section>", () => {
    const section: SectionNode = {
      kind: "section",
      name: "Chapter 1",
      body: [
        { kind: "heading", level: 1, spans: [{ text: "The Title" }] },
        { kind: "paragraph", spans: [{ text: "The body text." }] },
      ],
    };
    const html = renderHtml([section], { fragment: true });
    const sectionStart = html.indexOf("<section");
    const sectionEnd = html.indexOf("</section>");
    const sectionContent = html.slice(sectionStart, sectionEnd);
    expect(sectionContent).toContain("<h1>The Title</h1>");
    expect(sectionContent).toContain("<p>The body text.</p>");
  });

  test("empty section body renders an empty <section>", () => {
    const section: SectionNode = { kind: "section", body: [] };
    const html = renderHtml([section], { fragment: true });
    expect(html).toContain("<section");
    expect(html).toContain("</section>");
  });

  test("nested sections render nested <section> elements", () => {
    const inner: SectionNode = {
      kind: "section",
      name: "Inner",
      body: [{ kind: "paragraph", spans: [{ text: "inner" }] }],
    };
    const outer: SectionNode = { kind: "section", name: "Outer", body: [inner] };
    const html = renderHtml([outer], { fragment: true });
    expect(html).toContain('data-name="Outer"');
    expect(html).toContain('data-name="Inner"');
    // Inner <section> is nested inside outer
    const outerStart = html.indexOf('data-name="Outer"');
    const innerStart = html.indexOf('data-name="Inner"');
    expect(outerStart).toBeLessThan(innerStart);
  });
});

// ============================================================
// TrackedChangeNode — changes mode
// ============================================================

describe("renderHtml Tier 3 — TrackedChangeNode in changes mode", () => {
  const options = { fragment: true, trackedChanges: "changes" as const };

  test("insertion renders as <ins>", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "insertion",
      changeId: "ct1",
      body: [{ kind: "paragraph", spans: [{ text: "inserted text" }] }],
    };
    const html = renderHtml([tc], options);
    expect(html).toContain("<ins");
    expect(html).toContain("</ins>");
    expect(html).toContain("inserted text");
  });

  test("deletion renders as <del>", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "deletion",
      changeId: "ct2",
      body: [{ kind: "paragraph", spans: [{ text: "deleted text" }] }],
    };
    const html = renderHtml([tc], options);
    expect(html).toContain("<del");
    expect(html).toContain("</del>");
    expect(html).toContain("deleted text");
  });

  test("format-change renders as <span class='odf-format-change'>", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "format-change",
      changeId: "ct3",
      body: [],
    };
    const html = renderHtml([tc], options);
    expect(html).toContain('<span class="odf-format-change"');
    expect(html).toContain("</span>");
  });

  test("author is emitted as data-author attribute", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "insertion",
      changeId: "ct4",
      author: "Jane Doe",
      body: [],
    };
    const html = renderHtml([tc], options);
    expect(html).toContain('data-author="Jane Doe"');
  });

  test("date is emitted as data-date attribute", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "deletion",
      changeId: "ct5",
      date: "2026-03-15T10:00:00",
      body: [],
    };
    const html = renderHtml([tc], options);
    expect(html).toContain('data-date="2026-03-15T10:00:00"');
  });

  test("author and date both present on same element", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "insertion",
      changeId: "ct6",
      author: "Alice",
      date: "2026-01-01T00:00:00",
      body: [],
    };
    const html = renderHtml([tc], options);
    expect(html).toContain('data-author="Alice"');
    expect(html).toContain('data-date="2026-01-01T00:00:00"');
  });

  test("author and date absent when not set", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "insertion",
      changeId: "ct7",
      body: [],
    };
    const html = renderHtml([tc], options);
    expect(html).not.toContain("data-author");
    expect(html).not.toContain("data-date");
  });

  test("author value is HTML-escaped", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "insertion",
      changeId: "ct8",
      author: 'User "X"',
      body: [],
    };
    const html = renderHtml([tc], options);
    expect(html).toContain('data-author="User &quot;X&quot;"');
  });

  test("TrackedChangeNode body is rendered inside the wrapper element", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "deletion",
      changeId: "ct9",
      body: [{ kind: "paragraph", spans: [{ text: "body content" }] }],
    };
    const html = renderHtml([tc], options);
    const delStart = html.indexOf("<del");
    const delEnd = html.indexOf("</del>");
    const inside = html.slice(delStart, delEnd);
    expect(inside).toContain("body content");
  });
});

// ============================================================
// TrackedChangeNode — non-changes modes
// ============================================================

describe("renderHtml Tier 3 — TrackedChangeNode without changes mode", () => {
  test("TrackedChangeNode without trackedChanges option renders body transparently", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "insertion",
      changeId: "ct10",
      body: [{ kind: "paragraph", spans: [{ text: "transparent" }] }],
    };
    const html = renderHtml([tc], { fragment: true });
    expect(html).toContain("transparent");
    expect(html).not.toContain("<ins");
    expect(html).not.toContain("<del");
  });

  test("TrackedChangeNode with trackedChanges final renders body transparently", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "deletion",
      changeId: "ct11",
      body: [{ kind: "paragraph", spans: [{ text: "del content" }] }],
    };
    const html = renderHtml([tc], { fragment: true, trackedChanges: "final" });
    expect(html).toContain("del content");
    expect(html).not.toContain("<del");
  });

  test("TrackedChangeNode with trackedChanges original renders body transparently", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "insertion",
      changeId: "ct12",
      body: [{ kind: "paragraph", spans: [{ text: "orig content" }] }],
    };
    const html = renderHtml([tc], { fragment: true, trackedChanges: "original" });
    expect(html).toContain("orig content");
    expect(html).not.toContain("<ins");
  });
});
