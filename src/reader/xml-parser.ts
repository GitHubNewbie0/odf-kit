/**
 * Minimal XML parser for ODF content.xml and meta.xml.
 *
 * ODF files always contain well-formed XML, which allows a straightforward
 * single-pass parser rather than a full spec-compliant implementation.
 * The parser handles all constructs present in ODF XML: elements, text
 * nodes, attributes, self-closing tags, XML declarations, and comments.
 *
 * The output is a lightweight element tree: each node is either an
 * XmlElementNode (tag, attributes, children) or an XmlTextNode (text
 * content). XML entities in both text nodes and attribute values are
 * decoded to their character equivalents so callers work with plain
 * strings throughout.
 *
 * Exported for unit testing and for use by the ODT parser.
 */

/** An element node in the XML tree. */
export interface XmlElementNode {
  type: "element";
  /** The fully-qualified tag name including namespace prefix, e.g. "text:p". */
  tag: string;
  /** Attribute map. Keys include namespace prefix, e.g. "text:style-name". */
  attrs: Record<string, string>;
  children: XmlNode[];
}

/** A text node in the XML tree. XML entities are decoded. */
export interface XmlTextNode {
  type: "text";
  text: string;
}

/** A node in the XML tree. */
export type XmlNode = XmlElementNode | XmlTextNode;

/**
 * Decode the five standard XML predefined entities in a string.
 *
 * Applied to both text node content and attribute values so that callers
 * always receive plain character strings, never entity references.
 */
function decodeEntities(raw: string): string {
  return (
    raw
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      // Numeric character references: decimal (&#160;) and hex (&#xA0;)
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
  );
}

/**
 * Parse attribute key="value" pairs from the inner content of an open tag.
 *
 * Handles namespace-prefixed names such as text:style-name and
 * xlink:href. Attribute values are entity-decoded.
 *
 * @param raw - The portion of the tag string after the tag name.
 * @returns Map of attribute name to decoded value.
 */
function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Match both double-quoted (attr="val") and single-quoted (attr='val') values
  const re = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)=(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    attrs[m[1]] = decodeEntities(m[2] ?? m[3]);
  }
  return attrs;
}

/**
 * Parse an ODF XML string into an element tree.
 *
 * Returns the root element of the document. Skips XML declarations
 * (<?xml ...?>), processing instructions, and comments. Assumes
 * well-formed XML — ODF files produced by conformant writers always are.
 *
 * @param xml - XML string, optionally starting with a UTF-8 BOM.
 * @returns The root XmlElementNode.
 * @throws Error if the input contains no root element.
 */
export function parseXml(xml: string): XmlElementNode {
  // Strip UTF-8 BOM if present
  const src = xml.startsWith("\uFEFF") ? xml.slice(1) : xml;

  const stack: XmlElementNode[] = [];
  let root: XmlElementNode | undefined;
  let i = 0;

  while (i < src.length) {
    if (src[i] !== "<") {
      // Text node
      const end = src.indexOf("<", i);
      const raw = end === -1 ? src.slice(i) : src.slice(i, end);
      i = end === -1 ? src.length : end;
      if (raw.length > 0 && stack.length > 0) {
        stack[stack.length - 1].children.push({ type: "text", text: decodeEntities(raw) });
      }
      continue;
    }

    // XML comment: <!-- ... -->
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i);
      i = end === -1 ? src.length : end + 3;
      continue;
    }

    // CDATA section: <![CDATA[ ... ]]>
    if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i);
      if (end !== -1) {
        const text = src.slice(i + 9, end);
        if (text.length > 0 && stack.length > 0) {
          stack[stack.length - 1].children.push({ type: "text", text });
        }
        i = end + 3;
      } else {
        i = src.length;
      }
      continue;
    }

    // All other tags: find the closing >, skipping over quoted attribute
    // values so that a literal > inside "..." or '...' does not prematurely
    // close the tag.
    let j = i + 1;
    while (j < src.length && src[j] !== ">") {
      if (src[j] === '"' || src[j] === "'") {
        const quote = src[j++];
        while (j < src.length && src[j] !== quote) j++;
        if (j < src.length) j++; // skip closing quote
      } else {
        j++;
      }
    }
    if (j >= src.length) break; // malformed — stop

    const inner = src.slice(i + 1, j);
    i = j + 1;

    // XML declaration or processing instruction: <?...?>
    if (inner.startsWith("?")) continue;

    // DOCTYPE declaration
    if (inner.startsWith("!")) continue;

    // Close tag: </tag>
    if (inner.startsWith("/")) {
      stack.pop();
      continue;
    }

    // Self-closing tag: <tag attrs/>
    if (inner.endsWith("/")) {
      const body = inner.slice(0, -1).trimEnd();
      const space = body.search(/\s/);
      const tag = space === -1 ? body : body.slice(0, space);
      const attrs = space === -1 ? {} : parseAttributes(body.slice(space + 1));
      const node: XmlElementNode = { type: "element", tag, attrs, children: [] };
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      } else if (!root) {
        root = node;
      }
      continue;
    }

    // Open tag: <tag attrs>
    const space = inner.search(/\s/);
    const tag = space === -1 ? inner : inner.slice(0, space);
    const attrs = space === -1 ? {} : parseAttributes(inner.slice(space + 1));
    const node: XmlElementNode = { type: "element", tag, attrs, children: [] };

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);

    if (!root) root = node;
  }

  if (!root) throw new Error("parseXml: no root element found");
  return root;
}
