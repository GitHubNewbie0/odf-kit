import { modelToTypst } from "../../src/typst/emitter.js";
import type {
  OdtDocumentModel,
  BodyNode,
  SectionNode,
  TrackedChangeNode,
  PageLayout,
} from "../../src/reader/types.js";

// ============================================================
// Helpers
// ============================================================

/** Minimal OdtDocumentModel with just a body array. */
function doc(body: BodyNode[], pageLayout?: PageLayout): OdtDocumentModel {
  return {
    metadata: {},
    body,
    pageLayout,
    toHtml: () => "",
  };
}

/** Paragraph body node. */
function para(text: string): BodyNode {
  return { kind: "paragraph", spans: [{ text }] };
}

/** Heading body node. */
function heading(text: string, level: 1 | 2 | 3 | 4 | 5 | 6): BodyNode {
  return { kind: "heading", level, spans: [{ text }] };
}

// ============================================================
// Escaping
// ============================================================

describe("modelToTypst — Typst escaping", () => {
  test("backslash in text is escaped", () => {
    const typ = modelToTypst(doc([para("a\\b")]));
    expect(typ).toContain("a\\\\b");
  });

  test("asterisk in text is escaped", () => {
    const typ = modelToTypst(doc([para("a*b")]));
    expect(typ).toContain("a\\*b");
  });

  test("hash in text is escaped", () => {
    const typ = modelToTypst(doc([para("a#b")]));
    expect(typ).toContain("a\\#b");
  });

  test("underscore in text is escaped", () => {
    const typ = modelToTypst(doc([para("a_b")]));
    expect(typ).toContain("a\\_b");
  });

  test("dollar sign in text is escaped", () => {
    const typ = modelToTypst(doc([para("$100")]));
    expect(typ).toContain("\\$100");
  });

  test("at sign in text is escaped", () => {
    const typ = modelToTypst(doc([para("@mention")]));
    expect(typ).toContain("\\@mention");
  });

  test("square brackets in text are escaped", () => {
    const typ = modelToTypst(doc([para("[note]")]));
    expect(typ).toContain("\\[note\\]");
  });

  test("leading = on a line is escaped to prevent heading", () => {
    const typ = modelToTypst(doc([para("= not a heading")]));
    expect(typ).toContain("\\= not a heading");
  });

  test("plain text with no special characters is passed through unchanged", () => {
    const typ = modelToTypst(doc([para("Hello, world!")]));
    expect(typ).toContain("Hello, world!");
  });
});

// ============================================================
// Headings
// ============================================================

describe("modelToTypst — headings", () => {
  test("level 1 heading emits = prefix", () => {
    const typ = modelToTypst(doc([heading("Title", 1)]));
    expect(typ).toContain("= Title");
  });

  test("level 2 heading emits == prefix", () => {
    const typ = modelToTypst(doc([heading("Section", 2)]));
    expect(typ).toContain("== Section");
  });

  test("level 3 heading emits === prefix", () => {
    const typ = modelToTypst(doc([heading("Sub", 3)]));
    expect(typ).toContain("=== Sub");
  });

  test("level 6 heading emits ====== prefix", () => {
    const typ = modelToTypst(doc([heading("Deep", 6)]));
    expect(typ).toContain("====== Deep");
  });

  test("heading content is preserved", () => {
    const typ = modelToTypst(doc([heading("My Document", 1)]));
    expect(typ).toContain("My Document");
  });
});

// ============================================================
// Paragraphs
// ============================================================

describe("modelToTypst — paragraphs", () => {
  test("plain paragraph emits text content", () => {
    const typ = modelToTypst(doc([para("Hello world")]));
    expect(typ).toContain("Hello world");
  });

  test("two paragraphs are separated by a blank line", () => {
    const typ = modelToTypst(doc([para("First"), para("Second")]));
    expect(typ).toContain("First\n\nSecond");
  });

  test("paragraph with textAlign center wraps in #align(center)", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "centered" }], paragraphStyle: { textAlign: "center" } },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#align(center)[centered]");
  });

  test("paragraph with textAlign right wraps in #align(right)", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "right" }], paragraphStyle: { textAlign: "right" } },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#align(right)[right]");
  });

  test("paragraph with textAlign justify wraps in #align(justify)", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ text: "justified" }],
        paragraphStyle: { textAlign: "justify" },
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#align(justify)[justified]");
  });

  test("paragraph with textAlign start wraps in #align(start)", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "x" }], paragraphStyle: { textAlign: "start" } },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#align(start)[x]");
  });

  test("paragraph with no paragraphStyle emits plain text", () => {
    const typ = modelToTypst(doc([para("plain")]));
    expect(typ).not.toContain("#align");
  });
});

// ============================================================
// Inline formatting — TextSpan
// ============================================================

describe("modelToTypst — inline formatting", () => {
  test("bold span emits *text*", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "bold", bold: true }] }];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("*bold*");
  });

  test("italic span emits _text_", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "italic", italic: true }] }];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("_italic_");
  });

  test("underline span emits #underline[text]", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "underlined", underline: true }] },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#underline[underlined]");
  });

  test("strikethrough span emits #strike[text]", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "struck", strikethrough: true }] },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#strike[struck]");
  });

  test("superscript span emits #super[text]", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "2", superscript: true }] }];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#super[2]");
  });

  test("subscript span emits #sub[text]", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "2", subscript: true }] }];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#sub[2]");
  });

  test("hyperlink emits #link(href)[text]", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "click", href: "https://example.com" }] },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain('#link("https://example.com")[click]');
  });

  test("hard line break emits backslash newline", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ text: "before" }, { text: "", lineBreak: true }, { text: "after" }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("\\\n");
    expect(typ).toContain("before");
    expect(typ).toContain("after");
  });

  test("hidden span produces no output", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "visible" }, { text: "hidden", hidden: true }] },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("visible");
    expect(typ).not.toContain("hidden");
  });
});

// ============================================================
// SpanStyle — Tier 2 character styling
// ============================================================

describe("modelToTypst — SpanStyle (Tier 2)", () => {
  test("fontColor emits #text(fill: rgb(...))[text]", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "red", style: { fontColor: "#ff0000" } }] },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain('#text(fill: rgb("#ff0000"))[red]');
  });

  test("fontSize emits #text(size: Npt)[text]", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "big", style: { fontSize: 18 } }] },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#text(size: 18pt)[big]");
  });

  test("fontFamily emits #text(font: ...)[text]", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "serif", style: { fontFamily: "Times New Roman" } }] },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain('#text(font: "Times New Roman")[serif]');
  });

  test("highlightColor emits #highlight(fill: rgb(...))[text]", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "hi", style: { highlightColor: "#ffff00" } }] },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain('#highlight(fill: rgb("#ffff00"))[hi]');
  });

  test("multiple SpanStyle properties combine on one span", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ text: "styled", style: { fontColor: "#ff0000", fontSize: 14 } }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain('fill: rgb("#ff0000")');
    expect(typ).toContain("size: 14pt");
  });

  test("span with no style produces no #text wrapper", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "plain" }] }];
    const typ = modelToTypst(doc(body));
    expect(typ).not.toContain("#text(");
  });
});

// ============================================================
// Lists
// ============================================================

describe("modelToTypst — lists", () => {
  test("unordered list emits - markers", () => {
    const body: BodyNode[] = [
      {
        kind: "list",
        ordered: false,
        items: [{ spans: [{ text: "Apple" }] }, { spans: [{ text: "Banana" }] }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("- Apple");
    expect(typ).toContain("- Banana");
  });

  test("ordered list emits + markers", () => {
    const body: BodyNode[] = [
      {
        kind: "list",
        ordered: true,
        items: [{ spans: [{ text: "First" }] }, { spans: [{ text: "Second" }] }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("+ First");
    expect(typ).toContain("+ Second");
  });

  test("nested list indents sub-items with two spaces", () => {
    const body: BodyNode[] = [
      {
        kind: "list",
        ordered: false,
        items: [
          {
            spans: [{ text: "Parent" }],
            children: {
              kind: "list",
              ordered: false,
              items: [{ spans: [{ text: "Child" }] }],
            },
          },
        ],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("- Parent");
    expect(typ).toContain("  - Child");
  });
});

// ============================================================
// Tables
// ============================================================

describe("modelToTypst — tables", () => {
  test("table emits #table() call", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [{ cells: [{ spans: [{ text: "A" }] }, { spans: [{ text: "B" }] }] }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#table(");
  });

  test("table emits columns: N when no widths set", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [{ cells: [{ spans: [{ text: "A" }] }, { spans: [{ text: "B" }] }] }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("columns: 2");
  });

  test("table emits columns tuple when column widths are set", () => {
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
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("columns: (5cm, 10cm)");
  });

  test("table cell content is emitted inside brackets", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [{ cells: [{ spans: [{ text: "Hello" }] }] }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("[Hello]");
  });

  test("empty table emits empty string", () => {
    const body: BodyNode[] = [{ kind: "table", rows: [] }];
    const typ = modelToTypst(doc(body));
    expect(typ.trim()).toBe("");
  });
});

// ============================================================
// Images
// ============================================================

describe("modelToTypst — images", () => {
  test("image emits a comment placeholder", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [
          {
            kind: "image",
            data: "base64data",
            width: "10cm",
            height: "5cm",
            name: "logo",
          },
        ],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("/* [image: logo 10cm");
    expect(typ).toContain("5cm] */");
  });

  test("image placeholder uses title when name is absent", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ kind: "image", data: "x", title: "My Photo" }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("/* [image: My Photo] */");
  });

  test("image placeholder uses fallback label when name and title absent", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ kind: "image", data: "x" }] }];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("/* [image: image] */");
  });
});

// ============================================================
// Footnotes and bookmarks
// ============================================================

describe("modelToTypst — footnotes and bookmarks", () => {
  test("footnote emits #footnote[body]", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [
          { text: "text" },
          {
            kind: "note",
            noteClass: "footnote",
            id: "fn1",
            citation: "1",
            body: [para("note body")],
          },
        ],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#footnote[");
    expect(typ).toContain("note body");
  });

  test("endnote also emits #footnote[body]", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [
          {
            kind: "note",
            noteClass: "endnote",
            id: "en1",
            citation: "*",
            body: [para("end note")],
          },
        ],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#footnote[");
  });

  test("bookmark point emits label <name>", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ kind: "bookmark", name: "section-1", position: "point" }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("<section-1>");
  });

  test("bookmark start emits label <name>", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ kind: "bookmark", name: "ref-a", position: "start" }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("<ref-a>");
  });

  test("bookmark end emits nothing", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ kind: "bookmark", name: "ref-a", position: "end" }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).not.toContain("<ref-a>");
  });
});

// ============================================================
// Text fields
// ============================================================

describe("modelToTypst — text fields", () => {
  test("pageNumber field emits Typst counter display", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ kind: "field", fieldType: "pageNumber", value: "1" }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#counter(page).display()");
  });

  test("pageCount field emits Typst counter final", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ kind: "field", fieldType: "pageCount", value: "10" }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("#counter(page).final().first()");
  });

  test("other field types emit their stored value", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ kind: "field", fieldType: "title", value: "My Document" }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("My Document");
  });

  test("date field emits stored date value", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ kind: "field", fieldType: "date", value: "2026-03-15" }],
      },
    ];
    const typ = modelToTypst(doc(body));
    expect(typ).toContain("2026-03-15");
  });
});

// ============================================================
// Sections
// ============================================================

describe("modelToTypst — sections", () => {
  test("named section emits comment header", () => {
    const section: SectionNode = {
      kind: "section",
      name: "Introduction",
      body: [para("intro text")],
    };
    const typ = modelToTypst(doc([section]));
    expect(typ).toContain("// Section: Introduction");
  });

  test("unnamed section emits generic comment header", () => {
    const section: SectionNode = { kind: "section", body: [para("x")] };
    const typ = modelToTypst(doc([section]));
    expect(typ).toContain("// Section");
  });

  test("section body content is emitted after the comment", () => {
    const section: SectionNode = {
      kind: "section",
      name: "Ch1",
      body: [para("section content")],
    };
    const typ = modelToTypst(doc([section]));
    expect(typ).toContain("section content");
    // Comment appears before body
    expect(typ.indexOf("// Section")).toBeLessThan(typ.indexOf("section content"));
  });
});

// ============================================================
// TrackedChangeNode
// ============================================================

describe("modelToTypst — TrackedChangeNode", () => {
  const changesOpt = { trackedChanges: "changes" as const };

  test("insertion in changes mode emits #underline[body]", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "insertion",
      changeId: "tc1",
      body: [para("inserted")],
    };
    const typ = modelToTypst(doc([tc]), changesOpt);
    expect(typ).toContain("#underline[");
    expect(typ).toContain("inserted");
  });

  test("deletion in changes mode emits #strike[body]", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "deletion",
      changeId: "tc2",
      body: [para("deleted")],
    };
    const typ = modelToTypst(doc([tc]), changesOpt);
    expect(typ).toContain("#strike[");
    expect(typ).toContain("deleted");
  });

  test("format-change in changes mode emits body only", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "format-change",
      changeId: "tc3",
      body: [para("reformatted")],
    };
    const typ = modelToTypst(doc([tc]), changesOpt);
    expect(typ).toContain("reformatted");
    expect(typ).not.toContain("#underline");
    expect(typ).not.toContain("#strike");
  });

  test("TrackedChangeNode without changes mode renders body transparently", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "insertion",
      changeId: "tc4",
      body: [para("content")],
    };
    const typ = modelToTypst(doc([tc]));
    expect(typ).toContain("content");
    expect(typ).not.toContain("#underline");
  });

  test("TrackedChangeNode with final mode renders body transparently", () => {
    const tc: TrackedChangeNode = {
      kind: "tracked-change",
      changeType: "deletion",
      changeId: "tc5",
      body: [para("del")],
    };
    const typ = modelToTypst(doc([tc]), { trackedChanges: "final" });
    expect(typ).toContain("del");
    expect(typ).not.toContain("#strike");
  });
});

// ============================================================
// Page setup
// ============================================================

describe("modelToTypst — page setup", () => {
  test("pageLayout emits #set page() directive", () => {
    const layout: PageLayout = { width: "21cm", height: "29.7cm" };
    const typ = modelToTypst(doc([], layout));
    expect(typ).toContain("#set page(");
    expect(typ).toContain("width: 21cm");
    expect(typ).toContain("height: 29.7cm");
  });

  test("pageLayout margins emit as nested tuple", () => {
    const layout: PageLayout = {
      marginTop: "2.54cm",
      marginBottom: "2.54cm",
      marginLeft: "3cm",
      marginRight: "3cm",
    };
    const typ = modelToTypst(doc([], layout));
    expect(typ).toContain("margin: (");
    expect(typ).toContain("top: 2.54cm");
    expect(typ).toContain("left: 3cm");
  });

  test("partial pageLayout emits only present fields", () => {
    const layout: PageLayout = { width: "17cm" };
    const typ = modelToTypst(doc([], layout));
    expect(typ).toContain("width: 17cm");
    expect(typ).not.toContain("height:");
    expect(typ).not.toContain("margin:");
  });

  test("no pageLayout emits no #set page directive", () => {
    const typ = modelToTypst(doc([para("text")]));
    expect(typ).not.toContain("#set page(");
  });

  test("#set page appears before body content", () => {
    const layout: PageLayout = { width: "21cm" };
    const typ = modelToTypst(doc([para("body")], layout));
    expect(typ.indexOf("#set page")).toBeLessThan(typ.indexOf("body"));
  });
});

// ============================================================
// odtToTypst convenience wrapper (smoke test only — no real ODT bytes)
// ============================================================

describe("modelToTypst — empty document", () => {
  test("empty body produces empty string", () => {
    const typ = modelToTypst(doc([]));
    expect(typ.trim()).toBe("");
  });

  test("single paragraph produces non-empty string", () => {
    const typ = modelToTypst(doc([para("hello")]));
    expect(typ.trim()).toBe("hello");
  });
});
