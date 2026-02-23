import { healPlaceholders, tokenize } from "../src/template/healer.js";

// ============================================================
// Tokenizer tests
// ============================================================

describe("tokenize", () => {
  test("splits XML into tag and text segments", () => {
    const xml = '<text:p>Hello <text:span text:style-name="T1">world</text:span></text:p>';
    const segments = tokenize(xml);
    expect(segments).toEqual([
      { type: "tag", content: "<text:p>" },
      { type: "text", content: "Hello " },
      { type: "tag", content: '<text:span text:style-name="T1">' },
      { type: "text", content: "world" },
      { type: "tag", content: "</text:span>" },
      { type: "tag", content: "</text:p>" },
    ]);
  });

  test("handles text-only input", () => {
    expect(tokenize("Hello world")).toEqual([{ type: "text", content: "Hello world" }]);
  });

  test("handles tags-only input", () => {
    expect(tokenize("<a><b></b></a>")).toEqual([
      { type: "tag", content: "<a>" },
      { type: "tag", content: "<b>" },
      { type: "tag", content: "</b>" },
      { type: "tag", content: "</a>" },
    ]);
  });

  test("handles self-closing tags", () => {
    expect(tokenize("Hello<text:line-break/>World")).toEqual([
      { type: "text", content: "Hello" },
      { type: "tag", content: "<text:line-break/>" },
      { type: "text", content: "World" },
    ]);
  });

  test("handles empty string", () => {
    expect(tokenize("")).toEqual([]);
  });
});

// ============================================================
// Passthrough tests — nothing should change
// ============================================================

describe("healPlaceholders — passthrough", () => {
  test("returns XML unchanged when no placeholders exist", () => {
    const xml = "<text:p>Hello world</text:p>";
    expect(healPlaceholders(xml)).toBe(xml);
  });

  test("returns XML unchanged when placeholder is already contiguous", () => {
    const xml = '<text:p><text:span text:style-name="T1">{name}</text:span></text:p>';
    expect(healPlaceholders(xml)).toBe(xml);
  });

  test("returns XML unchanged when placeholder is in bare text", () => {
    const xml = "<text:p>{name}</text:p>";
    expect(healPlaceholders(xml)).toBe(xml);
  });

  test("preserves multiple contiguous placeholders", () => {
    const xml = "<text:p>{firstName} {lastName}</text:p>";
    expect(healPlaceholders(xml)).toBe(xml);
  });

  test("preserves loop and conditional tags that are contiguous", () => {
    const xml = "<text:p>{#items}{product} x {qty}{/items}</text:p>";
    expect(healPlaceholders(xml)).toBe(xml);
  });

  test("preserves dot notation placeholders that are contiguous", () => {
    const xml = "<text:p>{user.name}</text:p>";
    expect(healPlaceholders(xml)).toBe(xml);
  });
});

// ============================================================
// Two-span fragmentation
// ============================================================

describe("healPlaceholders — two-span fragmentation", () => {
  test("heals placeholder split across two same-style spans", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">name}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{name}</text:span></text:p>',
    );
  });

  test("heals placeholder split across two different-style spans", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T2">name}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{name}</text:span></text:p>',
    );
  });

  test("heals placeholder split with brace at end of first span", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">Hello {</text:span>' +
      '<text:span text:style-name="T1">name}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">Hello {name}</text:span></text:p>',
    );
  });

  test("heals placeholder split with text remaining after closing brace", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">name} world</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      "<text:p>" +
        '<text:span text:style-name="T1">{name}</text:span>' +
        '<text:span text:style-name="T1"> world</text:span>' +
        "</text:p>",
    );
  });

  test("heals placeholder with text on both sides in different spans", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">Hello {</text:span>' +
      '<text:span text:style-name="T2">name} World</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      "<text:p>" +
        '<text:span text:style-name="T1">Hello {name}</text:span>' +
        '<text:span text:style-name="T2"> World</text:span>' +
        "</text:p>",
    );
  });
});

// ============================================================
// Multi-span fragmentation (3+ spans)
// ============================================================

describe("healPlaceholders — multi-span fragmentation", () => {
  test("heals placeholder split across three spans", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">na</text:span>' +
      '<text:span text:style-name="T1">me}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{name}</text:span></text:p>',
    );
  });

  test("heals placeholder with every character in its own span", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">n</text:span>' +
      '<text:span text:style-name="T1">a</text:span>' +
      '<text:span text:style-name="T1">m</text:span>' +
      '<text:span text:style-name="T1">e</text:span>' +
      '<text:span text:style-name="T1">}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{name}</text:span></text:p>',
    );
  });

  test("heals placeholder across three different-style spans", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T2">na</text:span>' +
      '<text:span text:style-name="T3">me}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{name}</text:span></text:p>',
    );
  });
});

// ============================================================
// Bare text mixed with spans
// ============================================================

describe("healPlaceholders — bare text and span mixing", () => {
  test("heals placeholder starting in bare text, ending in span", () => {
    const xml =
      "<text:p>" + "{" + '<text:span text:style-name="T1">name}</text:span>' + "</text:p>";
    expect(healPlaceholders(xml)).toBe("<text:p>{name}</text:p>");
  });

  test("heals placeholder starting in span, ending in bare text", () => {
    const xml =
      "<text:p>" + '<text:span text:style-name="T1">{</text:span>' + "name}" + "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{name}</text:span></text:p>',
    );
  });

  test("heals placeholder from bare text through span to bare text", () => {
    const xml =
      "<text:p>" + "{" + '<text:span text:style-name="T1">na</text:span>' + "me}" + "</text:p>";
    expect(healPlaceholders(xml)).toBe("<text:p>{name}</text:p>");
  });

  test("preserves surrounding bare text when healing", () => {
    const xml =
      "<text:p>" +
      "Hello {" +
      '<text:span text:style-name="T1">name}</text:span>' +
      " World" +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe("<text:p>Hello {name} World</text:p>");
  });
});

// ============================================================
// Multiple placeholders
// ============================================================

describe("healPlaceholders — multiple placeholders", () => {
  test("heals two fragmented placeholders in the same paragraph", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{first</text:span>' +
      '<text:span text:style-name="T1">Name}</text:span>' +
      " " +
      '<text:span text:style-name="T1">{last</text:span>' +
      '<text:span text:style-name="T1">Name}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      "<text:p>" +
        '<text:span text:style-name="T1">{firstName}</text:span>' +
        " " +
        '<text:span text:style-name="T1">{lastName}</text:span>' +
        "</text:p>",
    );
  });

  test("heals one fragmented placeholder while leaving contiguous one alone", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{intact}</text:span>' +
      " and " +
      '<text:span text:style-name="T1">{frag</text:span>' +
      '<text:span text:style-name="T1">mented}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      "<text:p>" +
        '<text:span text:style-name="T1">{intact}</text:span>' +
        " and " +
        '<text:span text:style-name="T1">{fragmented}</text:span>' +
        "</text:p>",
    );
  });
});

// ============================================================
// Loop and conditional tags
// ============================================================

describe("healPlaceholders — loop and conditional tags", () => {
  test("heals fragmented loop open tag", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{#</text:span>' +
      '<text:span text:style-name="T1">items}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{#items}</text:span></text:p>',
    );
  });

  test("heals fragmented loop close tag", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{/</text:span>' +
      '<text:span text:style-name="T1">items}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{/items}</text:span></text:p>',
    );
  });

  test("heals loop open tag split at every character", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">#</text:span>' +
      '<text:span text:style-name="T1">i</text:span>' +
      '<text:span text:style-name="T1">t</text:span>' +
      '<text:span text:style-name="T1">e</text:span>' +
      '<text:span text:style-name="T1">m</text:span>' +
      '<text:span text:style-name="T1">s</text:span>' +
      '<text:span text:style-name="T1">}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{#items}</text:span></text:p>',
    );
  });
});

// ============================================================
// Dot notation (nested data access)
// ============================================================

describe("healPlaceholders — dot notation", () => {
  test("heals fragmented dot notation placeholder", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{user.</text:span>' +
      '<text:span text:style-name="T1">name}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{user.name}</text:span></text:p>',
    );
  });

  test("heals deeply nested dot notation", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{company</text:span>' +
      '<text:span text:style-name="T2">.address.</text:span>' +
      '<text:span text:style-name="T3">city}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{company.address.city}</text:span></text:p>',
    );
  });
});

// ============================================================
// Edge cases
// ============================================================

describe("healPlaceholders — edge cases", () => {
  test("ignores curly braces that don't form valid placeholders", () => {
    const xml = "<text:p>This is {not a placeholder} at all</text:p>";
    expect(healPlaceholders(xml)).toBe(xml);
  });

  test("ignores empty braces", () => {
    const xml = "<text:p>{}</text:p>";
    expect(healPlaceholders(xml)).toBe(xml);
  });

  test("ignores braces with only special characters", () => {
    const xml = "<text:p>{#}</text:p>";
    expect(healPlaceholders(xml)).toBe(xml);
  });

  test("handles placeholder at very start of text content", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">x}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{x}</text:span></text:p>',
    );
  });

  test("handles single-character identifier", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">x</text:span>' +
      '<text:span text:style-name="T1">}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{x}</text:span></text:p>',
    );
  });

  test("handles underscore-prefixed identifier", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{_</text:span>' +
      '<text:span text:style-name="T1">private}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{_private}</text:span></text:p>',
    );
  });

  test("handles placeholder with digits in name", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{item</text:span>' +
      '<text:span text:style-name="T1">2}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{item2}</text:span></text:p>',
    );
  });

  test("handles XML with no text content at all", () => {
    const xml = "<text:p><text:line-break/></text:p>";
    expect(healPlaceholders(xml)).toBe(xml);
  });

  test("handles empty string", () => {
    expect(healPlaceholders("")).toBe("");
  });
});

// ============================================================
// Realistic ODF XML patterns
// ============================================================

describe("healPlaceholders — realistic ODF patterns", () => {
  test("heals placeholder in a full paragraph with namespaces", () => {
    const xml =
      '<text:p text:style-name="Standard">' +
      "Dear " +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T2">recipientName</text:span>' +
      '<text:span text:style-name="T1">}</text:span>' +
      "," +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p text:style-name="Standard">' +
        "Dear " +
        '<text:span text:style-name="T1">{recipientName}</text:span>' +
        "," +
        "</text:p>",
    );
  });

  test("heals multiple placeholders in a template letter", () => {
    const xml =
      '<text:p text:style-name="Standard">' +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">date</text:span>' +
      '<text:span text:style-name="T1">}</text:span>' +
      "</text:p>" +
      '<text:p text:style-name="Standard">' +
      "Dear {name}," +
      "</text:p>" +
      '<text:p text:style-name="Standard">' +
      "Your order " +
      '<text:span text:style-name="T2">{</text:span>' +
      '<text:span text:style-name="T2">orderNumber}</text:span>' +
      " has shipped." +
      "</text:p>";

    expect(healPlaceholders(xml)).toBe(
      '<text:p text:style-name="Standard">' +
        '<text:span text:style-name="T1">{date}</text:span>' +
        "</text:p>" +
        '<text:p text:style-name="Standard">' +
        "Dear {name}," +
        "</text:p>" +
        '<text:p text:style-name="Standard">' +
        "Your order " +
        '<text:span text:style-name="T2">{orderNumber}</text:span>' +
        " has shipped." +
        "</text:p>",
    );
  });

  test("heals loop tags in a table row pattern", () => {
    const xml =
      "<table:table-row><table:table-cell><text:p>" +
      '<text:span text:style-name="T1">{#</text:span>' +
      '<text:span text:style-name="T1">rows}</text:span>' +
      "</text:p></table:table-cell></table:table-row>" +
      "<table:table-row><table:table-cell><text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T2">product}</text:span>' +
      "</text:p></table:table-cell>" +
      "<table:table-cell><text:p>{qty}</text:p></table:table-cell></table:table-row>" +
      "<table:table-row><table:table-cell>" +
      "<text:p>{/rows}</text:p>" +
      "</table:table-cell></table:table-row>";

    expect(healPlaceholders(xml)).toBe(
      "<table:table-row><table:table-cell><text:p>" +
        '<text:span text:style-name="T1">{#rows}</text:span>' +
        "</text:p></table:table-cell></table:table-row>" +
        "<table:table-row><table:table-cell><text:p>" +
        '<text:span text:style-name="T1">{product}</text:span>' +
        "</text:p></table:table-cell>" +
        "<table:table-cell><text:p>{qty}</text:p></table:table-cell></table:table-row>" +
        "<table:table-row><table:table-cell>" +
        "<text:p>{/rows}</text:p>" +
        "</table:table-cell></table:table-row>",
    );
  });
});

// ============================================================
// Shared segment — two fragmented placeholders touching
// ============================================================

describe("healPlaceholders — shared segment stress tests", () => {
  test("heals two adjacent fragmented placeholders sharing a middle segment", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{first</text:span>' +
      '<text:span text:style-name="T2">}{last</text:span>' +
      '<text:span text:style-name="T3">}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      "<text:p>" +
        '<text:span text:style-name="T1">{first}</text:span>' +
        '<text:span text:style-name="T2">{last}</text:span>' +
        "</text:p>",
    );
  });

  test("heals two adjacent fragmented placeholders with text between them in shared segment", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{first</text:span>' +
      '<text:span text:style-name="T2">} and {last</text:span>' +
      '<text:span text:style-name="T3">}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      "<text:p>" +
        '<text:span text:style-name="T1">{first}</text:span>' +
        '<text:span text:style-name="T2"> and {last}</text:span>' +
        "</text:p>",
    );
  });

  test("heals three fragmented placeholders in sequence", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">a}</text:span>' +
      " " +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">b}</text:span>' +
      " " +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">c}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      "<text:p>" +
        '<text:span text:style-name="T1">{a}</text:span>' +
        " " +
        '<text:span text:style-name="T1">{b}</text:span>' +
        " " +
        '<text:span text:style-name="T1">{c}</text:span>' +
        "</text:p>",
    );
  });

  test("heals three fragmented placeholders all sharing segments", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{a</text:span>' +
      '<text:span text:style-name="T2">}{b</text:span>' +
      '<text:span text:style-name="T3">}{c</text:span>' +
      '<text:span text:style-name="T4">}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      "<text:p>" +
        '<text:span text:style-name="T1">{a}</text:span>' +
        '<text:span text:style-name="T2">{b}</text:span>' +
        '<text:span text:style-name="T3">{c}</text:span>' +
        "</text:p>",
    );
  });
});

// ============================================================
// XML entities alongside placeholders
// ============================================================

describe("healPlaceholders — XML entities", () => {
  test("preserves XML entities in text around a fragmented placeholder", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">Smith &amp; Co: {</text:span>' +
      '<text:span text:style-name="T1">name}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">Smith &amp; Co: {name}</text:span></text:p>',
    );
  });

  test("preserves &lt; and &gt; entities near placeholders", () => {
    const xml =
      "<text:p>" +
      "Value &lt; " +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">max}</text:span>' +
      " &gt; min" +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      "<text:p>" +
        "Value &lt; " +
        '<text:span text:style-name="T1">{max}</text:span>' +
        " &gt; min" +
        "</text:p>",
    );
  });
});

// ============================================================
// ODF inline elements between placeholder fragments
// ============================================================

describe("healPlaceholders — ODF inline elements", () => {
  test("removes text:s (space) element inside healed fragment", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      "<text:s/>" +
      '<text:span text:style-name="T1">name}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{name}</text:span></text:p>',
    );
  });

  test("preserves text:line-break between separate placeholders", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">first}</text:span>' +
      "<text:line-break/>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">second}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      "<text:p>" +
        '<text:span text:style-name="T1">{first}</text:span>' +
        "<text:line-break/>" +
        '<text:span text:style-name="T1">{second}</text:span>' +
        "</text:p>",
    );
  });

  test("removes bookmark element inside healed fragment", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:bookmark text:name="mark1"/>' +
      '<text:span text:style-name="T1">name}</text:span>' +
      "</text:p>";
    expect(healPlaceholders(xml)).toBe(
      '<text:p><text:span text:style-name="T1">{name}</text:span></text:p>',
    );
  });
});
