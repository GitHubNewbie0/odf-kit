import { renderHtml } from "../../src/reader/html-renderer.js";
import type {
  BodyNode,
  InlineNode,
  ImageNode,
  NoteNode,
  BookmarkNode,
  FieldNode,
} from "../../src/reader/types.js";

// ============================================================
// Helpers
// ============================================================

/** Wrap inline nodes in a single paragraph body for renderHtml. */
function para(spans: InlineNode[]): BodyNode[] {
  return [{ kind: "paragraph", spans }];
}

// ============================================================
// Hidden spans
// ============================================================

describe("renderHtml Tier 2 — hidden spans", () => {
  test("hidden span produces no output", () => {
    const html = renderHtml(para([{ text: "visible" }, { text: "hidden", hidden: true }]), {
      fragment: true,
    });
    expect(html).toContain("visible");
    expect(html).not.toContain("hidden");
  });

  test("hidden span does not emit a <span> wrapper", () => {
    const html = renderHtml(para([{ text: "gone", hidden: true }]), { fragment: true });
    expect(html).toBe("<p></p>");
  });
});

// ============================================================
// SpanStyle → inline CSS
// ============================================================

describe("renderHtml Tier 2 — SpanStyle inline CSS", () => {
  test("fontColor emits color CSS property", () => {
    const html = renderHtml(
      para([{ text: "red", style: { fontColor: "#ff0000" } }]),
      { fragment: true },
    );
    expect(html).toContain('style="color:#ff0000"');
    expect(html).toContain("red");
  });

  test("fontSize emits font-size in pt", () => {
    const html = renderHtml(para([{ text: "big", style: { fontSize: 18 } }]), { fragment: true });
    expect(html).toContain("font-size:18pt");
  });

  test("fontFamily emits font-family CSS property", () => {
    const html = renderHtml(
      para([{ text: "arial", style: { fontFamily: "Arial" } }]),
      { fragment: true },
    );
    expect(html).toContain("font-family:Arial");
  });

  test("highlightColor emits background-color CSS property", () => {
    const html = renderHtml(
      para([{ text: "highlighted", style: { highlightColor: "#ffff00" } }]),
      { fragment: true },
    );
    expect(html).toContain("background-color:#ffff00");
  });

  test("textTransform emits text-transform CSS property", () => {
    const html = renderHtml(
      para([{ text: "caps", style: { textTransform: "uppercase" } }]),
      { fragment: true },
    );
    expect(html).toContain("text-transform:uppercase");
  });

  test("fontVariant emits font-variant CSS property", () => {
    const html = renderHtml(
      para([{ text: "sc", style: { fontVariant: "small-caps" } }]),
      { fragment: true },
    );
    expect(html).toContain("font-variant:small-caps");
  });

  test("textShadow emits text-shadow CSS property", () => {
    const html = renderHtml(
      para([{ text: "shadow", style: { textShadow: "2px 2px #000000" } }]),
      { fragment: true },
    );
    expect(html).toContain("text-shadow:2px 2px #000000");
  });

  test("letterSpacing emits letter-spacing CSS property", () => {
    const html = renderHtml(
      para([{ text: "spaced", style: { letterSpacing: "0.05em" } }]),
      { fragment: true },
    );
    expect(html).toContain("letter-spacing:0.05em");
  });

  test("multiple SpanStyle properties emit as semicolon-separated CSS", () => {
    const html = renderHtml(
      para([{ text: "multi", style: { fontColor: "#123456", fontSize: 14 } }]),
      { fragment: true },
    );
    expect(html).toContain("color:#123456");
    expect(html).toContain("font-size:14pt");
  });

  test("span with no style properties emits no <span> wrapper", () => {
    const html = renderHtml(para([{ text: "plain" }]), { fragment: true });
    expect(html).toBe("<p>plain</p>");
  });

  test("SpanStyle wraps semantic formatting — bold inside span", () => {
    const html = renderHtml(
      para([{ text: "hi", bold: true, style: { fontColor: "#ff0000" } }]),
      { fragment: true },
    );
    // semantic <strong> inside <span style>
    expect(html).toContain("<strong>hi</strong>");
    expect(html).toContain('style="color:#ff0000"');
  });

  test("hyperlink is outermost — wraps SpanStyle and bold", () => {
    const html = renderHtml(
      para([{ text: "link", bold: true, href: "https://example.com", style: { fontSize: 12 } }]),
      { fragment: true },
    );
    // href wraps everything
    expect(html.indexOf('<a href=')).toBeLessThan(html.indexOf("<strong>"));
  });
});

// ============================================================
// Cell and row styles
// ============================================================

describe("renderHtml Tier 2 — cell and row styles", () => {
  test("cell backgroundColor emits background-color inline style on <td>", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [
              {
                spans: [{ text: "A" }],
                cellStyle: { backgroundColor: "#eeeeee" },
              },
            ],
          },
        ],
      },
    ];
    const html = renderHtml(body, { fragment: true });
    expect(html).toContain('style="background-color:#eeeeee"');
    expect(html).toContain("<td");
  });

  test("cell border emits per-side border CSS", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [
              {
                spans: [{ text: "B" }],
                cellStyle: {
                  border: { top: "0.5pt solid #000000", bottom: "0.5pt solid #000000" },
                },
              },
            ],
          },
        ],
      },
    ];
    const html = renderHtml(body, { fragment: true });
    expect(html).toContain("border-top:0.5pt solid #000000");
    expect(html).toContain("border-bottom:0.5pt solid #000000");
    expect(html).not.toContain("border-left");
  });

  test("cell verticalAlign emits vertical-align CSS", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [{ spans: [{ text: "C" }], cellStyle: { verticalAlign: "middle" } }],
          },
        ],
      },
    ];
    const html = renderHtml(body, { fragment: true });
    expect(html).toContain("vertical-align:middle");
  });

  test("cell columnWidth is NOT emitted as layout CSS in Tier 2", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [{ spans: [{ text: "D" }], cellStyle: { columnWidth: "5cm" } }],
          },
        ],
      },
    ];
    const html = renderHtml(body, { fragment: true });
    expect(html).not.toContain("5cm");
    expect(html).not.toContain("width");
  });

  test("row backgroundColor emits background-color on <tr>", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [{ spans: [{ text: "E" }] }],
            rowStyle: { backgroundColor: "#dddddd" },
          },
        ],
      },
    ];
    const html = renderHtml(body, { fragment: true });
    expect(html).toContain('<tr style="background-color:#dddddd">');
  });

  test("row without rowStyle emits <tr> with no style attribute", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [{ cells: [{ spans: [{ text: "F" }] }] }],
      },
    ];
    const html = renderHtml(body, { fragment: true });
    expect(html).toContain("<tr>");
    expect(html).not.toContain("<tr style");
  });

  test("cell and row styles coexist on the same table", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [{ spans: [{ text: "G" }], cellStyle: { backgroundColor: "#ffffff" } }],
            rowStyle: { backgroundColor: "#aaaaaa" },
          },
        ],
      },
    ];
    const html = renderHtml(body, { fragment: true });
    expect(html).toContain("<tr style");
    expect(html).toContain("<td style");
  });
});

// ============================================================
// ImageNode
// ============================================================

describe("renderHtml Tier 2 — images", () => {
  const baseImage: ImageNode = {
    kind: "image",
    data: "iVBORw0KGgo=",
    mediaType: "image/png",
  };

  test("renders an image as <img> with data URI src", () => {
    const html = renderHtml(para([baseImage]), { fragment: true });
    expect(html).toContain("<img ");
    expect(html).toContain("src=\"data:image/png;base64,iVBORw0KGgo=\"");
  });

  test("always emits alt attribute (empty string when title absent)", () => {
    const html = renderHtml(para([baseImage]), { fragment: true });
    expect(html).toContain('alt=""');
  });

  test("title renders as alt attribute", () => {
    const image: ImageNode = { ...baseImage, title: "Company logo" };
    const html = renderHtml(para([image]), { fragment: true });
    expect(html).toContain('alt="Company logo"');
  });

  test("width and height render as inline CSS", () => {
    const image: ImageNode = { ...baseImage, width: "17cm", height: "5cm" };
    const html = renderHtml(para([image]), { fragment: true });
    expect(html).toContain("width:17cm");
    expect(html).toContain("height:5cm");
  });

  test("description with name emits aria-describedby and hidden span", () => {
    const image: ImageNode = {
      ...baseImage,
      name: "Logo",
      description: "A blue rectangular logo",
    };
    const html = renderHtml(para([image]), { fragment: true });
    expect(html).toContain('aria-describedby="odf-img-Logo"');
    expect(html).toContain('id="odf-img-Logo"');
    expect(html).toContain("A blue rectangular logo");
    expect(html).toContain("hidden");
  });

  test("description without name does not emit aria-describedby", () => {
    const image: ImageNode = { ...baseImage, description: "Some image" };
    const html = renderHtml(para([image]), { fragment: true });
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain("Some image");
  });

  test("title is HTML-escaped in alt attribute", () => {
    const image: ImageNode = { ...baseImage, title: 'Logo & "Icon"' };
    const html = renderHtml(para([image]), { fragment: true });
    expect(html).toContain('alt="Logo &amp; &quot;Icon&quot;"');
  });
});

// ============================================================
// NoteNode
// ============================================================

describe("renderHtml Tier 2 — notes", () => {
  const footnote: NoteNode = {
    kind: "note",
    noteClass: "footnote",
    id: "ftn0",
    citation: "1",
    body: [{ kind: "paragraph", spans: [{ text: "Note content here." }] }],
  };

  test("renders a superscript citation anchor", () => {
    const html = renderHtml(para([footnote]), { fragment: true });
    expect(html).toContain("<sup");
    expect(html).toContain(">1<");
  });

  test("citation links to the note aside by id", () => {
    const html = renderHtml(para([footnote]), { fragment: true });
    expect(html).toContain('href="#odf-note-ftn0"');
    expect(html).toContain('id="odf-note-ftn0"');
  });

  test("note body is rendered inside an <aside role='note'>", () => {
    const html = renderHtml(para([footnote]), { fragment: true });
    expect(html).toContain('<aside id="odf-note-ftn0" role="note">');
    expect(html).toContain("Note content here.");
    expect(html).toContain("</aside>");
  });

  test("citation text is preserved as-is (not auto-renumbered)", () => {
    const customNote: NoteNode = { ...footnote, id: "ftn1", citation: "†" };
    const html = renderHtml(para([customNote]), { fragment: true });
    expect(html).toContain(">†<");
  });

  test("endnote renders the same way as footnote", () => {
    const endnote: NoteNode = { ...footnote, noteClass: "endnote", id: "edn0" };
    const html = renderHtml(para([endnote]), { fragment: true });
    expect(html).toContain('<aside id="odf-note-edn0" role="note">');
  });

  test("note ref anchor id and citation href are linked", () => {
    const html = renderHtml(para([footnote]), { fragment: true });
    expect(html).toContain('id="odf-note-ftn0-ref"');
    expect(html).toContain('href="#odf-note-ftn0"');
  });
});

// ============================================================
// BookmarkNode
// ============================================================

describe("renderHtml Tier 2 — bookmarks", () => {
  test("point bookmark emits zero-width <a id> anchor", () => {
    const bookmark: BookmarkNode = { kind: "bookmark", name: "section_2", position: "point" };
    const html = renderHtml(para([bookmark]), { fragment: true });
    expect(html).toContain('<a id="section_2"></a>');
  });

  test("start bookmark emits <a id> anchor", () => {
    const bookmark: BookmarkNode = { kind: "bookmark", name: "key_term", position: "start" };
    const html = renderHtml(para([bookmark]), { fragment: true });
    expect(html).toContain('<a id="key_term"></a>');
  });

  test("end bookmark emits nothing", () => {
    const bookmark: BookmarkNode = { kind: "bookmark", name: "key_term", position: "end" };
    const html = renderHtml(para([bookmark]), { fragment: true });
    expect(html).toBe("<p></p>");
  });

  test("bookmark name is HTML-escaped", () => {
    const bookmark: BookmarkNode = { kind: "bookmark", name: 'sec"1', position: "point" };
    const html = renderHtml(para([bookmark]), { fragment: true });
    expect(html).toContain('id="sec&quot;1"');
  });
});

// ============================================================
// FieldNode
// ============================================================

describe("renderHtml Tier 2 — fields", () => {
  test("field renders as its stored value", () => {
    const field: FieldNode = { kind: "field", fieldType: "date", value: "2026-03-15" };
    const html = renderHtml(para([field]), { fragment: true });
    expect(html).toContain("2026-03-15");
  });

  test("page number field renders its value", () => {
    const field: FieldNode = { kind: "field", fieldType: "pageNumber", value: "3" };
    const html = renderHtml(para([field]), { fragment: true });
    expect(html).toContain("3");
  });

  test("field value is HTML-escaped", () => {
    const field: FieldNode = { kind: "field", fieldType: "title", value: "Smith & Co" };
    const html = renderHtml(para([field]), { fragment: true });
    expect(html).toContain("Smith &amp; Co");
  });

  test("fixed field renders identically to live field (value-only output)", () => {
    const live: FieldNode = { kind: "field", fieldType: "date", value: "2026-01-01" };
    const fixed: FieldNode = { ...live, fixed: true };
    const liveHtml = renderHtml(para([live]), { fragment: true });
    const fixedHtml = renderHtml(para([fixed]), { fragment: true });
    expect(fixedHtml).toBe(liveHtml);
  });
});

// ============================================================
// Mixed inline content
// ============================================================

describe("renderHtml Tier 2 — mixed inline content", () => {
  test("paragraph with text, bookmark, and field renders all three", () => {
    const spans: InlineNode[] = [
      { text: "See " },
      { kind: "bookmark", name: "fig1", position: "point" },
      { text: "Figure" },
      { kind: "field", fieldType: "pageNumber", value: "4" },
    ];
    const html = renderHtml(para(spans), { fragment: true });
    expect(html).toContain("See ");
    expect(html).toContain('id="fig1"');
    expect(html).toContain("Figure");
    expect(html).toContain("4");
  });

  test("paragraph with text span before and after a note preserves order", () => {
    const note: NoteNode = {
      kind: "note",
      noteClass: "footnote",
      id: "ftn0",
      citation: "1",
      body: [{ kind: "paragraph", spans: [{ text: "Note." }] }],
    };
    const spans: InlineNode[] = [
      { text: "Before" },
      note,
      { text: "After" },
    ];
    const html = renderHtml(para(spans), { fragment: true });
    expect(html.indexOf("Before")).toBeLessThan(html.indexOf("<sup"));
    expect(html.indexOf("</aside>")).toBeLessThan(html.indexOf("After"));
  });
});
