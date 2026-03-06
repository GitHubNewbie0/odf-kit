import { renderHtml } from "../../src/reader/html-renderer.js";
import type { BodyNode } from "../../src/reader/types.js";

// ============================================================
// Paragraphs
// ============================================================

describe("renderHtml — paragraphs", () => {
  test("renders a plain paragraph", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "Hello world" }] }];
    expect(renderHtml(body, { fragment: true })).toBe("<p>Hello world</p>");
  });

  test("renders an empty paragraph", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [] }];
    expect(renderHtml(body, { fragment: true })).toBe("<p></p>");
  });

  test("renders multiple paragraphs separated by newlines", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "First" }] },
      { kind: "paragraph", spans: [{ text: "Second" }] },
    ];
    expect(renderHtml(body, { fragment: true })).toBe("<p>First</p>\n<p>Second</p>");
  });

  test("renders a paragraph with a line break span", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ text: "Line one" }, { text: "", lineBreak: true }, { text: "Line two" }],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe("<p>Line one<br>Line two</p>");
  });
});

// ============================================================
// Headings
// ============================================================

describe("renderHtml — headings", () => {
  test("renders heading level 1", () => {
    const body: BodyNode[] = [{ kind: "heading", level: 1, spans: [{ text: "Title" }] }];
    expect(renderHtml(body, { fragment: true })).toBe("<h1>Title</h1>");
  });

  test("renders heading level 2", () => {
    const body: BodyNode[] = [{ kind: "heading", level: 2, spans: [{ text: "Section" }] }];
    expect(renderHtml(body, { fragment: true })).toBe("<h2>Section</h2>");
  });

  test("renders heading level 6", () => {
    const body: BodyNode[] = [{ kind: "heading", level: 6, spans: [{ text: "Deep" }] }];
    expect(renderHtml(body, { fragment: true })).toBe("<h6>Deep</h6>");
  });

  test("renders a heading with formatted spans", () => {
    const body: BodyNode[] = [
      {
        kind: "heading",
        level: 1,
        spans: [{ text: "Bold", bold: true }, { text: " heading" }],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe("<h1><strong>Bold</strong> heading</h1>");
  });
});

// ============================================================
// Character formatting
// ============================================================

describe("renderHtml — character formatting", () => {
  test("renders bold text", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "hello", bold: true }] }];
    expect(renderHtml(body, { fragment: true })).toBe("<p><strong>hello</strong></p>");
  });

  test("renders italic text", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "hello", italic: true }] }];
    expect(renderHtml(body, { fragment: true })).toBe("<p><em>hello</em></p>");
  });

  test("renders underline text", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "hello", underline: true }] }];
    expect(renderHtml(body, { fragment: true })).toBe("<p><u>hello</u></p>");
  });

  test("renders strikethrough text", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "hello", strikethrough: true }] },
    ];
    expect(renderHtml(body, { fragment: true })).toBe("<p><s>hello</s></p>");
  });

  test("renders superscript text", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "2", superscript: true }] }];
    expect(renderHtml(body, { fragment: true })).toBe("<p><sup>2</sup></p>");
  });

  test("renders subscript text", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "2", subscript: true }] }];
    expect(renderHtml(body, { fragment: true })).toBe("<p><sub>2</sub></p>");
  });

  test("renders bold and italic together (nesting order: italic wraps bold)", () => {
    const body: BodyNode[] = [
      { kind: "paragraph", spans: [{ text: "hi", bold: true, italic: true }] },
    ];
    expect(renderHtml(body, { fragment: true })).toBe("<p><em><strong>hi</strong></em></p>");
  });

  test("renders mixed plain and formatted spans in one paragraph", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [
          { text: "This is " },
          { text: "bold", bold: true },
          { text: " and " },
          { text: "italic", italic: true },
          { text: "." },
        ],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe(
      "<p>This is <strong>bold</strong> and <em>italic</em>.</p>",
    );
  });
});

// ============================================================
// Hyperlinks
// ============================================================

describe("renderHtml — hyperlinks", () => {
  test("renders a hyperlink", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ text: "click here", href: "https://example.com" }],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe(
      '<p><a href="https://example.com">click here</a></p>',
    );
  });

  test("renders a bold hyperlink", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ text: "link", bold: true, href: "https://example.com" }],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe(
      '<p><a href="https://example.com"><strong>link</strong></a></p>',
    );
  });

  test("escapes special characters in href", () => {
    const body: BodyNode[] = [
      {
        kind: "paragraph",
        spans: [{ text: "link", href: "https://example.com?q=a&b=1" }],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe(
      '<p><a href="https://example.com?q=a&amp;b=1">link</a></p>',
    );
  });
});

// ============================================================
// HTML escaping
// ============================================================

describe("renderHtml — HTML escaping", () => {
  test("escapes & in text content", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "Smith & Co" }] }];
    expect(renderHtml(body, { fragment: true })).toBe("<p>Smith &amp; Co</p>");
  });

  test("escapes < and > in text content", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "a < b > c" }] }];
    expect(renderHtml(body, { fragment: true })).toBe("<p>a &lt; b &gt; c</p>");
  });

  test("escapes double quotes in text content", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: 'say "hello"' }] }];
    expect(renderHtml(body, { fragment: true })).toBe("<p>say &quot;hello&quot;</p>");
  });
});

// ============================================================
// Lists
// ============================================================

describe("renderHtml — lists", () => {
  test("renders an unordered list", () => {
    const body: BodyNode[] = [
      {
        kind: "list",
        ordered: false,
        items: [{ spans: [{ text: "Apple" }] }, { spans: [{ text: "Banana" }] }],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe("<ul><li>Apple</li><li>Banana</li></ul>");
  });

  test("renders an ordered list", () => {
    const body: BodyNode[] = [
      {
        kind: "list",
        ordered: true,
        items: [{ spans: [{ text: "Step 1" }] }, { spans: [{ text: "Step 2" }] }],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe("<ol><li>Step 1</li><li>Step 2</li></ol>");
  });

  test("renders a nested list", () => {
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
    expect(renderHtml(body, { fragment: true })).toBe(
      "<ul><li>Parent<ul><li>Child</li></ul></li></ul>",
    );
  });

  test("renders list items with formatted spans", () => {
    const body: BodyNode[] = [
      {
        kind: "list",
        ordered: false,
        items: [{ spans: [{ text: "Bold item", bold: true }] }],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe(
      "<ul><li><strong>Bold item</strong></li></ul>",
    );
  });
});

// ============================================================
// Tables
// ============================================================

describe("renderHtml — tables", () => {
  test("renders a simple two-column table", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [{ spans: [{ text: "A" }] }, { spans: [{ text: "B" }] }],
          },
          {
            cells: [{ spans: [{ text: "C" }] }, { spans: [{ text: "D" }] }],
          },
        ],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe(
      "<table>" + "<tr><td>A</td><td>B</td></tr>" + "<tr><td>C</td><td>D</td></tr>" + "</table>",
    );
  });

  test("renders a cell with colspan", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [{ spans: [{ text: "Merged" }], colSpan: 2 }],
          },
        ],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe(
      '<table><tr><td colspan="2">Merged</td></tr></table>',
    );
  });

  test("renders a cell with rowspan", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [{ spans: [{ text: "Tall" }], rowSpan: 3 }],
          },
        ],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe(
      '<table><tr><td rowspan="3">Tall</td></tr></table>',
    );
  });

  test("renders a cell with colspan and rowspan together", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [{ spans: [{ text: "Big" }], colSpan: 2, rowSpan: 2 }],
          },
        ],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe(
      '<table><tr><td colspan="2" rowspan="2">Big</td></tr></table>',
    );
  });

  test("omits colspan/rowspan attributes when value is 1", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [{ spans: [{ text: "Normal" }], colSpan: 1, rowSpan: 1 }],
          },
        ],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe("<table><tr><td>Normal</td></tr></table>");
  });

  test("renders formatted content inside table cells", () => {
    const body: BodyNode[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [{ spans: [{ text: "Bold", bold: true }] }],
          },
        ],
      },
    ];
    expect(renderHtml(body, { fragment: true })).toBe(
      "<table><tr><td><strong>Bold</strong></td></tr></table>",
    );
  });
});

// ============================================================
// Fragment vs full document wrapper
// ============================================================

describe("renderHtml — output wrapper", () => {
  test("returns a fragment when fragment is true", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "Hi" }] }];
    const html = renderHtml(body, { fragment: true });
    expect(html).toBe("<p>Hi</p>");
    expect(html).not.toContain("<!DOCTYPE");
  });

  test("returns a full HTML document by default", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "Hi" }] }];
    const html = renderHtml(body);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html>");
    expect(html).toContain("<body>");
    expect(html).toContain("<p>Hi</p>");
    expect(html).toContain("</body>");
    expect(html).toContain("</html>");
  });

  test("returns a full HTML document when fragment is false", () => {
    const body: BodyNode[] = [{ kind: "paragraph", spans: [{ text: "Hi" }] }];
    const html = renderHtml(body, { fragment: false });
    expect(html).toContain("<!DOCTYPE html>");
  });

  test("returns empty fragment for empty body", () => {
    expect(renderHtml([], { fragment: true })).toBe("");
  });
});
