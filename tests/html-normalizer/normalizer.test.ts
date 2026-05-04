/**
 * Unit tests for the Tier 1 normalizer rules and the composite
 * odfKitNormalizer.
 *
 * The conformance battery in tests/conformance/normalizer.test.ts covers
 * contract-level assertions; this file tests odfKitNormalizer's specific
 * implementation details and edge cases.
 */

import {
  odfKitNormalizer,
  selfCloseVoidElements,
  decodeNamedEntities,
  emptyRawTextElements,
  lowercaseDoctype,
  quoteUnquotedBooleanAttributes,
  quoteUnquotedAttributeValues,
  escapeAttributeValueAmpersands,
} from "../../src/html-normalizer/index.js";

describe("selfCloseVoidElements (Rule 1)", () => {
  test("self-closes a bare void element", () => {
    expect(selfCloseVoidElements("<br>")).toBe("<br />");
  });

  test("self-closes a void element with attributes", () => {
    expect(selfCloseVoidElements('<img src="x.png">')).toBe('<img src="x.png" />');
  });

  test("self-closes void elements with boolean attributes", () => {
    expect(selfCloseVoidElements('<input type="text" disabled>')).toBe(
      '<input type="text" disabled />',
    );
  });

  test("passes through already-self-closed forms (no space)", () => {
    expect(selfCloseVoidElements("<br/>")).toBe("<br/>");
  });

  test("passes through already-self-closed forms (with space)", () => {
    expect(selfCloseVoidElements("<br />")).toBe("<br />");
    expect(selfCloseVoidElements('<img src="x.png" />')).toBe('<img src="x.png" />');
  });

  test("does not match non-void elements", () => {
    expect(selfCloseVoidElements("<p>")).toBe("<p>");
    expect(selfCloseVoidElements("<div>")).toBe("<div>");
    expect(selfCloseVoidElements("<span></span>")).toBe("<span></span>");
  });

  test("does not match elements whose names start with a void element name", () => {
    expect(selfCloseVoidElements("<brick>")).toBe("<brick>");
    expect(selfCloseVoidElements("<input-field>")).toBe("<input-field>");
  });

  test("matches lowercase only", () => {
    expect(selfCloseVoidElements("<BR>")).toBe("<BR>");
    expect(selfCloseVoidElements("<Br>")).toBe("<Br>");
  });

  test("handles all 14 HTML5 void elements", () => {
    const voidElements = [
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "param",
      "source",
      "track",
      "wbr",
    ];
    for (const tag of voidElements) {
      expect(selfCloseVoidElements(`<${tag}>`)).toBe(`<${tag} />`);
    }
  });

  test("handles multiple void elements in one string", () => {
    expect(selfCloseVoidElements("<br><hr><br>")).toBe("<br /><hr /><br />");
  });

  test("preserves surrounding content", () => {
    expect(selfCloseVoidElements("<p>before<br>after</p>")).toBe("<p>before<br />after</p>");
  });

  test("collapses trailing whitespace inside the tag", () => {
    expect(selfCloseVoidElements("<br   >")).toBe("<br />");
  });

  test("is idempotent", () => {
    const input = '<p>text<br><img src="x"></p>';
    const once = selfCloseVoidElements(input);
    const twice = selfCloseVoidElements(once);
    expect(twice).toBe(once);
  });
});

describe("decodeNamedEntities (Rule 2)", () => {
  test("decodes &copy; to ©", () => {
    expect(decodeNamedEntities("&copy;")).toBe("©");
  });

  test("decodes &nbsp; to non-breaking space", () => {
    expect(decodeNamedEntities("&nbsp;")).toBe("\u00A0");
  });

  test("decodes &mdash; to em dash", () => {
    expect(decodeNamedEntities("&mdash;")).toBe("—");
  });

  test("decodes multiple entities in one string", () => {
    expect(decodeNamedEntities("&copy;&nbsp;&mdash;")).toBe("©\u00A0—");
  });

  test("passes through XML predefined entities unchanged", () => {
    expect(decodeNamedEntities("&amp;")).toBe("&amp;");
    expect(decodeNamedEntities("&lt;")).toBe("&lt;");
    expect(decodeNamedEntities("&gt;")).toBe("&gt;");
    expect(decodeNamedEntities("&quot;")).toBe("&quot;");
    expect(decodeNamedEntities("&apos;")).toBe("&apos;");
  });

  test("passes through unknown named entities unchanged", () => {
    expect(decodeNamedEntities("&notarealentity;")).toBe("&notarealentity;");
  });

  test("passes through numeric entities (parseXml decodes those)", () => {
    expect(decodeNamedEntities("&#160;")).toBe("&#160;");
    expect(decodeNamedEntities("&#xA0;")).toBe("&#xA0;");
  });

  test("does not match entities without trailing semicolon", () => {
    expect(decodeNamedEntities("&copy text")).toBe("&copy text");
  });

  test("decodes entities in attribute values and text", () => {
    expect(decodeNamedEntities('<p title="Caf&eacute;">Caf&eacute;</p>')).toBe(
      '<p title="Café">Café</p>',
    );
  });

  test("preserves content with no entities", () => {
    expect(decodeNamedEntities("plain text")).toBe("plain text");
    expect(decodeNamedEntities("")).toBe("");
  });

  test("is idempotent", () => {
    const input = "&copy; &nbsp; &amp;";
    const once = decodeNamedEntities(input);
    const twice = decodeNamedEntities(once);
    expect(twice).toBe(once);
  });
});

describe("emptyRawTextElements (Rule 3)", () => {
  test("empties script content", () => {
    expect(emptyRawTextElements("<script>code</script>")).toBe("<script></script>");
  });

  test("empties style content", () => {
    expect(emptyRawTextElements("<style>body { color: red; }</style>")).toBe("<style></style>");
  });

  test("preserves attributes on script tag", () => {
    expect(emptyRawTextElements('<script src="x.js">code</script>')).toBe(
      '<script src="x.js"></script>',
    );
  });

  test("preserves attributes on style tag", () => {
    expect(emptyRawTextElements('<style type="text/css">css</style>')).toBe(
      '<style type="text/css"></style>',
    );
  });

  test("handles already-empty script", () => {
    expect(emptyRawTextElements('<script src="x.js"></script>')).toBe(
      '<script src="x.js"></script>',
    );
  });

  test("empties multiple script blocks", () => {
    expect(emptyRawTextElements("<script>a</script><script>b</script>")).toBe(
      "<script></script><script></script>",
    );
  });

  test("preserves surrounding content", () => {
    expect(emptyRawTextElements("<p>text</p><script>code</script><p>more</p>")).toBe(
      "<p>text</p><script></script><p>more</p>",
    );
  });

  test("removes script content with HTML-like text", () => {
    expect(emptyRawTextElements('<script>var x = "<br>";</script>')).toBe("<script></script>");
  });

  test("removes style content with @rules", () => {
    expect(emptyRawTextElements("<style>@import url(x.css);</style>")).toBe("<style></style>");
  });

  test("matches lowercase only", () => {
    expect(emptyRawTextElements("<SCRIPT>code</SCRIPT>")).toBe("<SCRIPT>code</SCRIPT>");
  });

  test("is idempotent", () => {
    const input = '<script src="x.js">a</script><style>b</style>';
    const once = emptyRawTextElements(input);
    const twice = emptyRawTextElements(once);
    expect(twice).toBe(once);
  });
});

describe("lowercaseDoctype (Rule 4)", () => {
  test("lowercases <!DOCTYPE html>", () => {
    expect(lowercaseDoctype("<!DOCTYPE html>")).toBe("<!doctype html>");
  });

  test("lowercases <!DOCTYPE HTML>", () => {
    expect(lowercaseDoctype("<!DOCTYPE HTML>")).toBe("<!doctype html>");
  });

  test("preserves already-lowercase doctype", () => {
    expect(lowercaseDoctype("<!doctype html>")).toBe("<!doctype html>");
  });

  test("preserves content after the doctype", () => {
    expect(lowercaseDoctype("<!DOCTYPE html>\n<html>\n<body></body>\n</html>")).toBe(
      "<!doctype html>\n<html>\n<body></body>\n</html>",
    );
  });

  test("does not modify input without a doctype", () => {
    const input = "<html><body></body></html>";
    expect(lowercaseDoctype(input)).toBe(input);
  });

  test("is idempotent", () => {
    const input = "<!DOCTYPE html>\n<html></html>";
    const once = lowercaseDoctype(input);
    const twice = lowercaseDoctype(once);
    expect(twice).toBe(once);
  });
});

describe("odfKitNormalizer (composite)", () => {
  test("applies all four rules to a representative HTML5 document", () => {
    const input =
      '<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head>' +
      "<body><p>Caf&eacute;<br>2026</p>" +
      "<script>var x = 1;</script></body></html>";
    const expected =
      '<!doctype html>\n<html><head><meta charset="utf-8" /></head>' +
      "<body><p>Café<br />2026</p>" +
      "<script></script></body></html>";
    expect(odfKitNormalizer(input)).toBe(expected);
  });

  test("passes through already-polyglot input unchanged", () => {
    const input =
      '<!doctype html>\n<html><head><meta charset="utf-8" /></head>' +
      "<body><p>Hello<br /></p></body></html>";
    expect(odfKitNormalizer(input)).toBe(input);
  });

  test("handles empty input", () => {
    expect(odfKitNormalizer("")).toBe("");
  });

  test("preserves whitespace", () => {
    const input = "  <p>text</p>  \n\n  ";
    expect(odfKitNormalizer(input)).toBe(input);
  });

  test("Rule 3 runs before Rule 1 (script <br> not self-closed)", () => {
    const input = '<script>var html = "<br>";</script>';
    const expected = "<script></script>";
    expect(odfKitNormalizer(input)).toBe(expected);
  });

  test("Rule 3 runs before Rule 2 (script entities not decoded)", () => {
    // The script content (including any entities) is removed entirely;
    // entities outside the script are decoded.
    const input = "<script>var x = &copy;;</script>&copy;";
    const expected = "<script></script>©";
    expect(odfKitNormalizer(input)).toBe(expected);
  });

  test("is idempotent", () => {
    const input = '<!DOCTYPE html><meta charset="utf-8"><p>Caf&eacute;<br></p>';
    const once = odfKitNormalizer(input);
    const twice = odfKitNormalizer(once);
    expect(twice).toBe(once);
  });

  test("handles all four rules combined in one fragment", () => {
    const input = '<!DOCTYPE html><img src="x" alt="&copy;"><script>code</script>';
    const expected = '<!doctype html><img src="x" alt="©" /><script></script>';
    expect(odfKitNormalizer(input)).toBe(expected);
  });
});

describe("quoteUnquotedBooleanAttributes (Rule 5)", () => {
  test("quotes a single bare boolean attribute", () => {
    expect(quoteUnquotedBooleanAttributes("<input checked>")).toBe('<input checked="">');
  });

  test("quotes multiple bare boolean attributes", () => {
    expect(quoteUnquotedBooleanAttributes("<script async defer>")).toBe(
      '<script async="" defer="">',
    );
  });

  test("quotes crossorigin in link tag", () => {
    expect(
      quoteUnquotedBooleanAttributes(
        '<link rel="preconnect" href="https://example.com" crossorigin>',
      ),
    ).toBe('<link rel="preconnect" href="https://example.com" crossorigin="">');
  });

  test("preserves quoted attributes", () => {
    expect(quoteUnquotedBooleanAttributes('<a href="x.html" target="_blank">')).toBe(
      '<a href="x.html" target="_blank">',
    );
  });

  test("preserves single-quoted attributes", () => {
    expect(quoteUnquotedBooleanAttributes("<a href='x.html'>")).toBe("<a href='x.html'>");
  });

  test("handles mix of quoted and bare attributes", () => {
    expect(quoteUnquotedBooleanAttributes('<input type="text" required disabled value="x">')).toBe(
      '<input type="text" required="" disabled="" value="x">',
    );
  });

  test("does not touch already-empty-string attributes", () => {
    expect(quoteUnquotedBooleanAttributes('<input checked="">')).toBe('<input checked="">');
  });

  test("preserves self-closing tags", () => {
    expect(quoteUnquotedBooleanAttributes("<br/>")).toBe("<br/>");
    expect(quoteUnquotedBooleanAttributes("<br />")).toBe("<br />");
    expect(quoteUnquotedBooleanAttributes("<input checked />")).toBe('<input checked="" />');
  });

  test("does not touch non-tag content", () => {
    expect(quoteUnquotedBooleanAttributes("<p>hello world</p>")).toBe("<p>hello world</p>");
  });

  test("does not touch text outside tags", () => {
    expect(quoteUnquotedBooleanAttributes("text only, no tags")).toBe("text only, no tags");
  });

  test("handles closing tags (no rewriting)", () => {
    expect(quoteUnquotedBooleanAttributes("</input>")).toBe("</input>");
  });

  test("handles tags with no attributes", () => {
    expect(quoteUnquotedBooleanAttributes("<p>")).toBe("<p>");
    expect(quoteUnquotedBooleanAttributes("<div>")).toBe("<div>");
  });

  test("real-world example: docs-site link with crossorigin", () => {
    const input = '<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>';
    const expected = '<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin="">';
    expect(quoteUnquotedBooleanAttributes(input)).toBe(expected);
  });

  test("is idempotent", () => {
    const input = '<input type="text" required disabled value="x">';
    const once = quoteUnquotedBooleanAttributes(input);
    const twice = quoteUnquotedBooleanAttributes(once);
    expect(twice).toBe(once);
  });
});

describe("escapeAttributeValueAmpersands (Rule 7)", () => {
  test("escapes a lone & in href", () => {
    expect(escapeAttributeValueAmpersands('<a href="page.html?a=1&b=2">')).toBe(
      '<a href="page.html?a=1&amp;b=2">',
    );
  });

  test("escapes a lone & in single-quoted attribute", () => {
    expect(escapeAttributeValueAmpersands("<a href='page.html?a=1&b=2'>")).toBe(
      "<a href='page.html?a=1&amp;b=2'>",
    );
  });

  test("preserves &amp; (already escaped)", () => {
    expect(escapeAttributeValueAmpersands('<a href="page.html?a=1&amp;b=2">')).toBe(
      '<a href="page.html?a=1&amp;b=2">',
    );
  });

  test("preserves all five XML predefined entities", () => {
    expect(escapeAttributeValueAmpersands('<a title="&amp;&lt;&gt;&quot;&apos;">')).toBe(
      '<a title="&amp;&lt;&gt;&quot;&apos;">',
    );
  });

  test("preserves numeric character references", () => {
    expect(escapeAttributeValueAmpersands('<a title="&#160;&#xA0;">')).toBe(
      '<a title="&#160;&#xA0;">',
    );
  });

  test("escapes named-entity-shaped strings (only XML predefined are valid)", () => {
    // &copy; is HTML5 named, but Rule 7 only treats the five XML predefined
    // entities and numeric refs as already-valid. Named entities like &copy;
    // get escaped here. Rule 2 (decodeNamedEntities) runs AFTER Rule 7 in
    // the composite, so the user-facing result still works correctly:
    // Rule 7 → "&amp;copy;" then Rule 2 sees no entities to decode.
    // This test documents the intentional behavior.
    expect(escapeAttributeValueAmpersands('<a title="&copy;">')).toBe('<a title="&amp;copy;">');
  });

  test("escapes multiple unescaped & characters", () => {
    expect(escapeAttributeValueAmpersands('<a href="?a=1&b=2&c=3">')).toBe(
      '<a href="?a=1&amp;b=2&amp;c=3">',
    );
  });

  test("preserves attribute values without &", () => {
    expect(escapeAttributeValueAmpersands('<a href="page.html">')).toBe('<a href="page.html">');
  });

  test("does not touch text content & characters", () => {
    expect(escapeAttributeValueAmpersands("<p>A & B & C</p>")).toBe("<p>A & B & C</p>");
  });

  test("processes multiple tags in one input", () => {
    expect(escapeAttributeValueAmpersands('<a href="?a=1&b=2"><img src="?x=1&y=2"></a>')).toBe(
      '<a href="?a=1&amp;b=2"><img src="?x=1&amp;y=2"></a>',
    );
  });

  test("preserves attributes with no value", () => {
    expect(escapeAttributeValueAmpersands("<input checked>")).toBe("<input checked>");
  });

  test("handles mix of escaped and unescaped & in same value", () => {
    expect(escapeAttributeValueAmpersands('<a href="?a=1&amp;b=2&c=3">')).toBe(
      '<a href="?a=1&amp;b=2&amp;c=3">',
    );
  });

  test("real-world example: docs-site link with query string", () => {
    const input = '<a href="https://example.com/search?q=odf&type=tools">link</a>';
    const expected = '<a href="https://example.com/search?q=odf&amp;type=tools">link</a>';
    expect(escapeAttributeValueAmpersands(input)).toBe(expected);
  });

  test("is idempotent", () => {
    const input = '<a href="?a=1&b=2&amp;c=3">';
    const once = escapeAttributeValueAmpersands(input);
    const twice = escapeAttributeValueAmpersands(once);
    expect(twice).toBe(once);
  });
});

describe("quoteUnquotedAttributeValues (Rule 6)", () => {
  test("quotes a single unquoted value", () => {
    expect(quoteUnquotedAttributeValues("<a href=page.html>")).toBe('<a href="page.html">');
  });

  test("quotes multiple unquoted values", () => {
    expect(quoteUnquotedAttributeValues("<input type=text class=primary>")).toBe(
      '<input type="text" class="primary">',
    );
  });

  test("preserves double-quoted values", () => {
    expect(quoteUnquotedAttributeValues('<a href="page.html" target="_blank">')).toBe(
      '<a href="page.html" target="_blank">',
    );
  });

  test("preserves single-quoted values", () => {
    expect(quoteUnquotedAttributeValues("<a href='page.html'>")).toBe("<a href='page.html'>");
  });

  test("handles mix of quoted and unquoted values", () => {
    expect(quoteUnquotedAttributeValues('<input type=text class="primary" id=main>')).toBe(
      '<input type="text" class="primary" id="main">',
    );
  });

  test("does not touch boolean attributes (no =)", () => {
    expect(quoteUnquotedAttributeValues("<input checked>")).toBe("<input checked>");
  });

  test("handles unquoted values mixed with boolean attributes", () => {
    expect(quoteUnquotedAttributeValues("<input type=text required>")).toBe(
      '<input type="text" required>',
    );
  });

  test("handles numeric unquoted values", () => {
    expect(quoteUnquotedAttributeValues("<div data-id=42>")).toBe('<div data-id="42">');
  });

  test("handles unquoted values with hyphens and dots", () => {
    expect(quoteUnquotedAttributeValues("<a href=https://example.com/x.html>")).toBe(
      '<a href="https://example.com/x.html">',
    );
  });

  test("preserves self-closing tags", () => {
    expect(quoteUnquotedAttributeValues("<br/>")).toBe("<br/>");
    expect(quoteUnquotedAttributeValues("<img src=x.png />")).toBe('<img src="x.png" />');
  });

  test("does not touch tags with no attributes", () => {
    expect(quoteUnquotedAttributeValues("<p>")).toBe("<p>");
    expect(quoteUnquotedAttributeValues("<div>")).toBe("<div>");
  });

  test("does not touch closing tags", () => {
    expect(quoteUnquotedAttributeValues("</p>")).toBe("</p>");
  });

  test("does not touch text outside tags", () => {
    expect(quoteUnquotedAttributeValues("text only")).toBe("text only");
  });

  test("real-world example: legacy form input", () => {
    const input = "<input type=text name=email maxlength=255 required>";
    const expected = '<input type="text" name="email" maxlength="255" required>';
    expect(quoteUnquotedAttributeValues(input)).toBe(expected);
  });

  test("is idempotent", () => {
    const input = "<input type=text class=primary id=main>";
    const once = quoteUnquotedAttributeValues(input);
    const twice = quoteUnquotedAttributeValues(once);
    expect(twice).toBe(once);
  });
});
