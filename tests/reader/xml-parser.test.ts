import { parseXml } from "../../src/reader/xml-parser.js";
import type { XmlElementNode } from "../../src/reader/xml-parser.js";

// ============================================================
// Basic structure
// ============================================================

describe("parseXml — basic structure", () => {
  test("parses a single empty element", () => {
    const node = parseXml("<root></root>");
    expect(node.type).toBe("element");
    expect(node.tag).toBe("root");
    expect(node.attrs).toEqual({});
    expect(node.children).toEqual([]);
  });

  test("parses a self-closing element", () => {
    const node = parseXml("<root/>");
    expect(node.type).toBe("element");
    expect(node.tag).toBe("root");
    expect(node.children).toEqual([]);
  });

  test("parses namespace-prefixed tag names", () => {
    const node = parseXml("<text:p></text:p>");
    expect(node.tag).toBe("text:p");
  });

  test("returns the root element when children are present", () => {
    const node = parseXml("<office:body><office:text></office:text></office:body>");
    expect(node.tag).toBe("office:body");
    expect(node.children).toHaveLength(1);
    const child = node.children[0] as XmlElementNode;
    expect(child.tag).toBe("office:text");
  });

  test("throws when input has no root element", () => {
    expect(() => parseXml("")).toThrow("no root element");
    expect(() => parseXml("<!-- comment only -->")).toThrow("no root element");
  });
});

// ============================================================
// Attributes
// ============================================================

describe("parseXml — attributes", () => {
  test("parses a single attribute", () => {
    const node = parseXml('<text:p text:style-name="P1"></text:p>');
    expect(node.attrs["text:style-name"]).toBe("P1");
  });

  test("parses multiple attributes", () => {
    const node = parseXml(
      '<style:style style:name="T1" style:family="text" style:parent-style-name="Default"></style:style>',
    );
    expect(node.attrs["style:name"]).toBe("T1");
    expect(node.attrs["style:family"]).toBe("text");
    expect(node.attrs["style:parent-style-name"]).toBe("Default");
  });

  test("parses xmlns declarations as regular attributes", () => {
    const node = parseXml(
      '<office:document-content xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"></office:document-content>',
    );
    expect(node.attrs["xmlns:text"]).toBe("urn:oasis:names:tc:opendocument:xmlns:text:1.0");
  });

  test("parses attributes on a self-closing element", () => {
    const node = parseXml('<text:line-break text:style-name="P1"/>');
    expect(node.tag).toBe("text:line-break");
    expect(node.attrs["text:style-name"]).toBe("P1");
  });

  test("returns empty attrs object when no attributes are present", () => {
    const node = parseXml("<text:p></text:p>");
    expect(node.attrs).toEqual({});
  });
});

// ============================================================
// Text nodes
// ============================================================

describe("parseXml — text nodes", () => {
  test("parses a direct text child", () => {
    const node = parseXml("<text:p>Hello world</text:p>");
    expect(node.children).toHaveLength(1);
    const text = node.children[0];
    expect(text.type).toBe("text");
    if (text.type === "text") expect(text.text).toBe("Hello world");
  });

  test("ignores text between top-level elements (whitespace formatting)", () => {
    const node = parseXml("<root>\n  <child></child>\n</root>");
    const elements = node.children.filter((c) => c.type === "element");
    expect(elements).toHaveLength(1);
  });

  test("preserves whitespace-only text inside inline context", () => {
    const node = parseXml("<text:span> </text:span>");
    expect(node.children).toHaveLength(1);
    const text = node.children[0];
    if (text.type === "text") expect(text.text).toBe(" ");
  });

  test("decodes &amp; entity in text content", () => {
    const node = parseXml("<text:p>Smith &amp; Co</text:p>");
    const text = node.children[0];
    if (text.type === "text") expect(text.text).toBe("Smith & Co");
  });

  test("decodes &lt; and &gt; entities in text content", () => {
    const node = parseXml("<text:p>a &lt; b &gt; c</text:p>");
    const text = node.children[0];
    if (text.type === "text") expect(text.text).toBe("a < b > c");
  });

  test("decodes &quot; and &apos; entities in text content", () => {
    const node = parseXml("<text:p>&quot;quoted&quot; and &apos;apos&apos;</text:p>");
    const text = node.children[0];
    if (text.type === "text") expect(text.text).toBe("\"quoted\" and 'apos'");
  });
});

// ============================================================
// Attribute entity decoding
// ============================================================

describe("parseXml — attribute entity decoding", () => {
  test("decodes &amp; in attribute values", () => {
    const node = parseXml('<text:a xlink:href="http://example.com?a=1&amp;b=2"></text:a>');
    expect(node.attrs["xlink:href"]).toBe("http://example.com?a=1&b=2");
  });

  test("decodes &quot; in attribute values", () => {
    const node = parseXml('<tag attr="say &quot;hello&quot;"></tag>');
    expect(node.attrs["attr"]).toBe('say "hello"');
  });
});

// ============================================================
// Nested elements
// ============================================================

describe("parseXml — nested elements", () => {
  test("parses two levels of nesting", () => {
    const node = parseXml(
      "<office:body><office:text><text:p>Hello</text:p></office:text></office:body>",
    );
    expect(node.tag).toBe("office:body");
    const officeText = node.children[0] as XmlElementNode;
    expect(officeText.tag).toBe("office:text");
    const para = officeText.children[0] as XmlElementNode;
    expect(para.tag).toBe("text:p");
    const text = para.children[0];
    if (text.type === "text") expect(text.text).toBe("Hello");
  });

  test("parses sibling elements", () => {
    const node = parseXml(
      "<office:text><text:p>First</text:p><text:p>Second</text:p></office:text>",
    );
    expect(node.children).toHaveLength(2);
    const first = node.children[0] as XmlElementNode;
    const second = node.children[1] as XmlElementNode;
    expect(first.tag).toBe("text:p");
    expect(second.tag).toBe("text:p");
  });

  test("parses mixed text and element children", () => {
    const node = parseXml(
      '<text:p>Hello <text:span text:style-name="T1">world</text:span> end</text:p>',
    );
    expect(node.children).toHaveLength(3);
    const first = node.children[0];
    const mid = node.children[1] as XmlElementNode;
    const last = node.children[2];
    if (first.type === "text") expect(first.text).toBe("Hello ");
    expect(mid.tag).toBe("text:span");
    if (last.type === "text") expect(last.text).toBe(" end");
  });
});

// ============================================================
// Special constructs
// ============================================================

describe("parseXml — special constructs", () => {
  test("skips the XML declaration", () => {
    const node = parseXml('<?xml version="1.0" encoding="UTF-8"?><root></root>');
    expect(node.tag).toBe("root");
  });

  test("skips XML comments", () => {
    const node = parseXml("<root><!-- this is a comment --><child/></root>");
    const elements = node.children.filter((c) => c.type === "element");
    expect(elements).toHaveLength(1);
    const child = elements[0] as XmlElementNode;
    expect(child.tag).toBe("child");
  });

  test("skips comments containing a > character", () => {
    const node = parseXml("<root><!-- a > b --><child/></root>");
    const elements = node.children.filter((c) => c.type === "element");
    expect(elements).toHaveLength(1);
  });

  test("handles CDATA sections as text content", () => {
    const node = parseXml("<root><![CDATA[raw <content>]]></root>");
    expect(node.children).toHaveLength(1);
    const text = node.children[0];
    if (text.type === "text") expect(text.text).toBe("raw <content>");
  });

  test("strips a leading UTF-8 BOM", () => {
    const node = parseXml('\uFEFF<?xml version="1.0"?><root/>');
    expect(node.tag).toBe("root");
  });

  test("parses a self-closing tag among siblings", () => {
    const node = parseXml("<text:p>Hello<text:line-break/>World</text:p>");
    expect(node.children).toHaveLength(3);
    const br = node.children[1] as XmlElementNode;
    expect(br.tag).toBe("text:line-break");
    expect(br.children).toEqual([]);
  });
});

// ============================================================
// ODF realistic fragments
// ============================================================

describe("parseXml — ODF realistic fragments", () => {
  test("parses a style:text-properties element with character formatting", () => {
    const xml =
      '<style:style style:name="T1" style:family="text">' +
      '<style:text-properties fo:font-weight="bold" fo:font-style="italic"/>' +
      "</style:style>";
    const node = parseXml(xml);
    expect(node.tag).toBe("style:style");
    expect(node.attrs["style:name"]).toBe("T1");
    const props = node.children[0] as XmlElementNode;
    expect(props.tag).toBe("style:text-properties");
    expect(props.attrs["fo:font-weight"]).toBe("bold");
    expect(props.attrs["fo:font-style"]).toBe("italic");
  });

  test("parses a text:list with nested list items", () => {
    const xml =
      '<text:list text:style-name="L1">' +
      "<text:list-item><text:p>Item A</text:p></text:list-item>" +
      "<text:list-item><text:p>Item B</text:p></text:list-item>" +
      "</text:list>";
    const node = parseXml(xml);
    expect(node.tag).toBe("text:list");
    const items = node.children.filter(
      (c): c is XmlElementNode => c.type === "element" && c.tag === "text:list-item",
    );
    expect(items).toHaveLength(2);
  });

  test("parses a table:table with rows and cells", () => {
    const xml =
      "<table:table>" +
      "<table:table-row>" +
      "<table:table-cell><text:p>A</text:p></table:table-cell>" +
      "<table:table-cell><text:p>B</text:p></table:table-cell>" +
      "</table:table-row>" +
      "</table:table>";
    const node = parseXml(xml);
    expect(node.tag).toBe("table:table");
    const row = node.children[0] as XmlElementNode;
    expect(row.tag).toBe("table:table-row");
    expect(row.children).toHaveLength(2);
  });
});
