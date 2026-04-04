import { describe, expect, test } from "@jest/globals";
import { strFromU8, unzipSync } from "fflate";
import { htmlToOdt } from "../src/odt/index.js";

// ─── Test Helper ──────────────────────────────────────────────────────

async function getContent(
  html: string,
  options?: Parameters<typeof htmlToOdt>[1],
): Promise<string> {
  const bytes = await htmlToOdt(html, options);
  const files = unzipSync(bytes);
  return strFromU8(files["content.xml"]);
}

async function getStyles(html: string, options?: Parameters<typeof htmlToOdt>[1]): Promise<string> {
  const bytes = await htmlToOdt(html, options);
  const files = unzipSync(bytes);
  return strFromU8(files["styles.xml"]);
}

// ─── Basic Output ─────────────────────────────────────────────────────

describe("htmlToOdt — basic output", () => {
  test("returns a Uint8Array", async () => {
    const bytes = await htmlToOdt("<p>Hello</p>");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  test("output ZIP contains required ODF files", async () => {
    const bytes = await htmlToOdt("<p>Hello</p>");
    const files = unzipSync(bytes);
    expect(files["mimetype"]).toBeDefined();
    expect(files["content.xml"]).toBeDefined();
    expect(files["styles.xml"]).toBeDefined();
    expect(files["meta.xml"]).toBeDefined();
    expect(files["META-INF/manifest.xml"]).toBeDefined();
  });

  test("mimetype is ODT", async () => {
    const bytes = await htmlToOdt("<p>Hello</p>");
    const files = unzipSync(bytes);
    expect(strFromU8(files["mimetype"])).toBe("application/vnd.oasis.opendocument.text");
  });

  test("empty HTML produces a valid document", async () => {
    const bytes = await htmlToOdt("");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});

// ─── Headings ─────────────────────────────────────────────────────────

describe("htmlToOdt — headings", () => {
  test("h1 produces heading level 1", async () => {
    const content = await getContent("<h1>Title</h1>");
    expect(content).toContain('text:outline-level="1"');
    expect(content).toContain("Title");
  });

  test("h2 produces heading level 2", async () => {
    const content = await getContent("<h2>Section</h2>");
    expect(content).toContain('text:outline-level="2"');
    expect(content).toContain("Section");
  });

  test("h3 through h6 produce correct levels", async () => {
    for (let level = 3; level <= 6; level++) {
      const content = await getContent(`<h${level}>Heading</h${level}>`);
      expect(content).toContain(`text:outline-level="${level}"`);
    }
  });
});

// ─── Paragraphs ───────────────────────────────────────────────────────

describe("htmlToOdt — paragraphs", () => {
  test("p produces a paragraph with text", async () => {
    const content = await getContent("<p>Hello world</p>");
    expect(content).toContain("Hello world");
    expect(content).toContain("text:p");
  });

  test("multiple paragraphs all appear in order", async () => {
    const content = await getContent("<p>First</p><p>Second</p><p>Third</p>");
    expect(content).toContain("First");
    expect(content).toContain("Second");
    expect(content).toContain("Third");
    expect(content.indexOf("First")).toBeLessThan(content.indexOf("Second"));
    expect(content.indexOf("Second")).toBeLessThan(content.indexOf("Third"));
  });

  test("p with text-align center applies alignment", async () => {
    const content = await getContent('<p style="text-align: center">Centered</p>');
    expect(content).toContain('fo:text-align="center"');
  });

  test("p with text-align right applies alignment", async () => {
    const content = await getContent('<p style="text-align: right">Right</p>');
    expect(content).toContain('fo:text-align="right"');
  });
});

// ─── Inline Formatting ────────────────────────────────────────────────

describe("htmlToOdt — inline formatting", () => {
  test("<strong> produces bold", async () => {
    const content = await getContent("<p><strong>Bold</strong></p>");
    expect(content).toContain('fo:font-weight="bold"');
    expect(content).toContain("Bold");
  });

  test("<b> produces bold", async () => {
    const content = await getContent("<p><b>Bold</b></p>");
    expect(content).toContain('fo:font-weight="bold"');
  });

  test("<em> produces italic", async () => {
    const content = await getContent("<p><em>Italic</em></p>");
    expect(content).toContain('fo:font-style="italic"');
    expect(content).toContain("Italic");
  });

  test("<i> produces italic", async () => {
    const content = await getContent("<p><i>Italic</i></p>");
    expect(content).toContain('fo:font-style="italic"');
  });

  test("<u> produces underline", async () => {
    const content = await getContent("<p><u>Underlined</u></p>");
    expect(content).toContain("text-underline-style");
    expect(content).toContain("Underlined");
  });

  test("<s> produces strikethrough", async () => {
    const content = await getContent("<p><s>Struck</s></p>");
    expect(content).toContain("text-line-through");
  });

  test("<del> produces strikethrough", async () => {
    const content = await getContent("<p><del>Deleted</del></p>");
    expect(content).toContain("text-line-through");
  });

  test("<sup> produces superscript", async () => {
    const content = await getContent("<p>x<sup>2</sup></p>");
    expect(content).toContain("super");
  });

  test("<sub> produces subscript", async () => {
    const content = await getContent("<p>H<sub>2</sub>O</p>");
    expect(content).toContain("sub");
  });

  test("<code> applies monospace font", async () => {
    const content = await getContent("<p><code>const x = 1;</code></p>");
    expect(content).toContain("Courier New");
    expect(content).toContain("const x = 1;");
  });

  test("<mark> applies highlight color", async () => {
    const content = await getContent("<p><mark>Highlighted</mark></p>");
    expect(content).toContain("#ffff00");
    expect(content).toContain("Highlighted");
  });

  test("nested inline formatting accumulates", async () => {
    const content = await getContent("<p><strong><em>Bold italic</em></strong></p>");
    expect(content).toContain('fo:font-weight="bold"');
    expect(content).toContain('fo:font-style="italic"');
    expect(content).toContain("Bold italic");
  });
});

// ─── Links ────────────────────────────────────────────────────────────

describe("htmlToOdt — links", () => {
  test("<a href> produces a hyperlink", async () => {
    const content = await getContent('<p><a href="https://example.com">Visit</a></p>');
    expect(content).toContain("xlink:href");
    expect(content).toContain("https://example.com");
    expect(content).toContain("Visit");
  });

  test("formatted text inside <a> keeps formatting", async () => {
    const content = await getContent(
      '<p><a href="https://example.com"><strong>Bold link</strong></a></p>',
    );
    expect(content).toContain('fo:font-weight="bold"');
    expect(content).toContain("https://example.com");
  });
});

// ─── Inline CSS ───────────────────────────────────────────────────────

describe("htmlToOdt — inline CSS on span", () => {
  test("color property applied", async () => {
    const content = await getContent('<p><span style="color: #FF0000">Red</span></p>');
    expect(content).toContain("#FF0000");
    expect(content).toContain("Red");
  });

  test("font-size in pt applied", async () => {
    const content = await getContent('<p><span style="font-size: 18pt">Big</span></p>');
    expect(content).toContain("18pt");
  });

  test("font-size in px converted to pt", async () => {
    const content = await getContent('<p><span style="font-size: 16px">Medium</span></p>');
    // 16px × 0.75 = 12pt
    expect(content).toContain("12pt");
  });

  test("font-family applied", async () => {
    const content = await getContent('<p><span style="font-family: Arial">Arial text</span></p>');
    expect(content).toContain("Arial");
  });

  test("font-weight: bold applied", async () => {
    const content = await getContent('<p><span style="font-weight: bold">Bold</span></p>');
    expect(content).toContain('fo:font-weight="bold"');
  });

  test("font-style: italic applied", async () => {
    const content = await getContent('<p><span style="font-style: italic">Italic</span></p>');
    expect(content).toContain('fo:font-style="italic"');
  });

  test("text-decoration: underline applied", async () => {
    const content = await getContent(
      '<p><span style="text-decoration: underline">Underlined</span></p>',
    );
    expect(content).toContain("text-underline-style");
  });
});

// ─── Line Breaks ──────────────────────────────────────────────────────

describe("htmlToOdt — line breaks", () => {
  test("<br> produces text:line-break", async () => {
    const content = await getContent("<p>Line one<br/>Line two</p>");
    expect(content).toContain("text:line-break");
    expect(content).toContain("Line one");
    expect(content).toContain("Line two");
  });
});

// ─── Lists ────────────────────────────────────────────────────────────

describe("htmlToOdt — lists", () => {
  test("<ul> produces a bullet list", async () => {
    const content = await getContent("<ul><li>Apple</li><li>Banana</li></ul>");
    expect(content).toContain("text:list");
    expect(content).toContain("Apple");
    expect(content).toContain("Banana");
  });

  test("<ol> produces a numbered list", async () => {
    const content = await getContent("<ol><li>First</li><li>Second</li></ol>");
    expect(content).toContain("text:list");
    expect(content).toContain("First");
    expect(content).toContain("Second");
  });

  test("list items with inline formatting", async () => {
    const content = await getContent("<ul><li><strong>Bold item</strong></li></ul>");
    expect(content).toContain('fo:font-weight="bold"');
    expect(content).toContain("Bold item");
  });

  test("nested list produces nested text:list", async () => {
    const content = await getContent("<ul><li>Parent<ul><li>Child</li></ul></li></ul>");
    expect(content).toContain("Parent");
    expect(content).toContain("Child");
    // Nested list: text:list appears more than once
    const listCount = (content.match(/<text:list/g) ?? []).length;
    expect(listCount).toBeGreaterThan(1);
  });
});

// ─── Tables ───────────────────────────────────────────────────────────

describe("htmlToOdt — tables", () => {
  test("table with td cells", async () => {
    const content = await getContent("<table><tr><td>A</td><td>B</td></tr></table>");
    expect(content).toContain("table:table");
    expect(content).toContain("table:table-row");
    expect(content).toContain("table:table-cell");
    expect(content).toContain("A");
    expect(content).toContain("B");
  });

  test("<th> cells are bold", async () => {
    const content = await getContent(
      "<table><tr><th>Header</th></tr><tr><td>Cell</td></tr></table>",
    );
    expect(content).toContain('fo:font-weight="bold"');
    expect(content).toContain("Header");
  });

  test("table with thead and tbody", async () => {
    const content = await getContent(
      "<table><thead><tr><th>Col</th></tr></thead><tbody><tr><td>Val</td></tr></tbody></table>",
    );
    expect(content).toContain("Col");
    expect(content).toContain("Val");
  });

  test("td with background-color style", async () => {
    const content = await getContent(
      '<table><tr><td style="background-color: #FFFF00">Yellow</td></tr></table>',
    );
    expect(content).toContain("#FFFF00");
  });
});

// ─── Blockquote ───────────────────────────────────────────────────────

describe("htmlToOdt — blockquote", () => {
  test("<blockquote> applies left indent", async () => {
    const content = await getContent("<blockquote><p>Indented</p></blockquote>");
    expect(content).toContain("fo:margin-left");
    expect(content).toContain("Indented");
  });
});

// ─── Preformatted ─────────────────────────────────────────────────────

describe("htmlToOdt — pre", () => {
  test("<pre> applies monospace font", async () => {
    const content = await getContent("<pre>code here</pre>");
    expect(content).toContain("Courier New");
    expect(content).toContain("code here");
  });

  test("<pre> with multiple lines uses line breaks", async () => {
    const content = await getContent("<pre>line1\nline2\nline3</pre>");
    expect(content).toContain("line1");
    expect(content).toContain("line2");
    expect(content).toContain("text:line-break");
  });
});

// ─── Horizontal Rule ──────────────────────────────────────────────────

describe("htmlToOdt — hr", () => {
  test("<hr> produces a paragraph with bottom border", async () => {
    const content = await getContent("<p>Before</p><hr/><p>After</p>");
    expect(content).toContain("fo:border-bottom");
    expect(content).toContain("Before");
    expect(content).toContain("After");
  });
});

// ─── Figure ───────────────────────────────────────────────────────────

describe("htmlToOdt — figure", () => {
  test("figcaption is emitted as a paragraph", async () => {
    const content = await getContent(
      '<figure><img src="photo.jpg"/><figcaption>Photo caption</figcaption></figure>',
    );
    expect(content).toContain("Photo caption");
  });

  test("img inside figure is skipped (v1)", async () => {
    const content = await getContent('<figure><img src="photo.jpg"/></figure>');
    // No draw:frame or draw:image should appear
    expect(content).not.toContain("draw:frame");
  });

  test("standalone img is skipped (v1)", async () => {
    const content = await getContent('<p>Before</p><img src="photo.jpg"/><p>After</p>');
    expect(content).not.toContain("draw:frame");
    expect(content).toContain("Before");
    expect(content).toContain("After");
  });
});

// ─── Transparent Containers ───────────────────────────────────────────

describe("htmlToOdt — transparent containers", () => {
  test("<div> content is emitted", async () => {
    const content = await getContent("<div><p>In a div</p></div>");
    expect(content).toContain("In a div");
  });

  test("<section> content is emitted", async () => {
    const content = await getContent("<section><h2>Section</h2><p>Text</p></section>");
    expect(content).toContain("Section");
    expect(content).toContain("Text");
  });

  test("full HTML document with html/body tags works", async () => {
    const content = await getContent("<html><body><h1>Title</h1><p>Body text</p></body></html>");
    expect(content).toContain("Title");
    expect(content).toContain("Body text");
  });

  test("fragment HTML without html/body tags works", async () => {
    const content = await getContent("<h1>Title</h1><p>Body text</p>");
    expect(content).toContain("Title");
    expect(content).toContain("Body text");
  });
});

// ─── Page Format ──────────────────────────────────────────────────────

describe("htmlToOdt — page format", () => {
  test("default page format is A4", async () => {
    const styles = await getStyles("<p>Hello</p>");
    expect(styles).toContain("21cm");
    expect(styles).toContain("29.7cm");
  });

  test("letter format sets correct dimensions", async () => {
    const styles = await getStyles("<p>Hello</p>", { pageFormat: "letter" });
    expect(styles).toContain("21.59cm");
    expect(styles).toContain("27.94cm");
  });

  test("legal format sets correct dimensions", async () => {
    const styles = await getStyles("<p>Hello</p>", { pageFormat: "legal" });
    expect(styles).toContain("35.56cm");
  });

  test("A5 format sets correct dimensions", async () => {
    const styles = await getStyles("<p>Hello</p>", { pageFormat: "A5" });
    expect(styles).toContain("14.8cm");
    expect(styles).toContain("21cm");
  });

  test("landscape orientation swaps dimensions", async () => {
    const styles = await getStyles("<p>Hello</p>", {
      pageFormat: "A4",
      orientation: "landscape",
    });
    expect(styles).toContain("landscape");
  });

  test("custom margin overrides preset default", async () => {
    const styles = await getStyles("<p>Hello</p>", {
      pageFormat: "A4",
      marginTop: "4cm",
    });
    expect(styles).toContain("4cm");
  });
});

// ─── Metadata ─────────────────────────────────────────────────────────

describe("htmlToOdt — metadata", () => {
  test("title appears in meta.xml", async () => {
    const bytes = await htmlToOdt("<p>Hello</p>", {
      metadata: { title: "My Document" },
    });
    const files = unzipSync(bytes);
    const meta = strFromU8(files["meta.xml"]);
    expect(meta).toContain("My Document");
  });

  test("creator appears in meta.xml", async () => {
    const bytes = await htmlToOdt("<p>Hello</p>", {
      metadata: { creator: "Alice" },
    });
    const files = unzipSync(bytes);
    const meta = strFromU8(files["meta.xml"]);
    expect(meta).toContain("Alice");
  });
});

// ─── Real-world HTML ──────────────────────────────────────────────────

describe("htmlToOdt — real-world HTML", () => {
  test("Nextcloud Text meeting notes sample", async () => {
    const html = `
      <h1>Meeting Notes</h1>
      <p>Attendees: <strong>Alice</strong>, Bob, Carol</p>
      <h2>Agenda</h2>
      <ul>
        <li>Project status update</li>
        <li>Budget review</li>
        <li>Next steps</li>
      </ul>
      <h2>Action Items</h2>
      <table>
        <tr><th>Owner</th><th>Task</th><th>Due</th></tr>
        <tr><td>Alice</td><td>Send report</td><td>Friday</td></tr>
        <tr><td>Bob</td><td>Review budget</td><td>Monday</td></tr>
      </table>
      <p>Next meeting: <em>April 10, 2026</em></p>
    `;
    const content = await getContent(html);
    expect(content).toContain("Meeting Notes");
    expect(content).toContain('fo:font-weight="bold"');
    expect(content).toContain("Project status update");
    expect(content).toContain("table:table");
    expect(content).toContain("Alice");
    expect(content).toContain('fo:font-style="italic"');
  });

  test("mixed heading, paragraph, list, and code", async () => {
    const html = `
      <h1>API Reference</h1>
      <p>Install with <code>npm install odf-kit</code></p>
      <ol>
        <li>Import the library</li>
        <li>Create a document</li>
        <li>Add content</li>
      </ol>
    `;
    const content = await getContent(html);
    expect(content).toContain("API Reference");
    expect(content).toContain("npm install odf-kit");
    expect(content).toContain("Courier New");
    expect(content).toContain("Import the library");
  });
});
