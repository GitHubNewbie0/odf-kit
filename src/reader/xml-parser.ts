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

import type { Parser } from "../types/public.js";

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
  // Single-pass replacement prevents any decoded character from being
  // processed a second time (e.g. &amp;lt; → &lt; → <).
  return raw.replace(
    /&(?:amp|lt|gt|quot|apos);|&#x([0-9a-fA-F]+);|&#([0-9]+);/g,
    (entity, hex, dec) => {
      if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
      if (dec !== undefined) return String.fromCodePoint(parseInt(dec, 10));
      switch (entity) {
        case "&amp;":
          return "&";
        case "&lt;":
          return "<";
        case "&gt;":
          return ">";
        case "&quot;":
          return '"';
        case "&apos;":
          return "'";
        default:
          return entity;
      }
    },
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

/**
 * Tightening 3: scan an attribute value for unescaped `&`.
 *
 * XML §3.1 requires `&` in attribute values to introduce an entity
 * reference. Unescaped `&` is invalid XML. Throws if a `&` is found that
 * is not the start of one of the five XML predefined entities or a
 * numeric character reference.
 */
function validateAttributeValueEntities(value: string, attrName: string, parentTag: string): void {
  const validEntity = /&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/y;
  let i = 0;
  while ((i = value.indexOf("&", i)) !== -1) {
    validEntity.lastIndex = i;
    if (!validEntity.test(value)) {
      throw new Error(
        `parseXml: unescaped '&' in attribute value of <${parentTag} ${attrName}="${value}">`,
      );
    }
    i = validEntity.lastIndex;
  }
}

function parseAttributes(raw: string, parentTag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)=(?:"([^"]*)"|'([^']*)')/y;
  let i = 0;

  while (i < raw.length) {
    // Skip whitespace between attributes
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (i >= raw.length) break;

    // Try to match an attribute at the current position
    re.lastIndex = i;
    const m = re.exec(raw);
    if (m === null || m.index !== i) {
      // Tightening 2: anything that isn't an attribute or whitespace is malformed.
      const offending = raw.slice(i).trimEnd();
      throw new Error(`parseXml: malformed attribute syntax in <${parentTag}>: '${offending}'`);
    }
    const attrName = m[1];
    const attrValue = m[2] ?? m[3];
    validateAttributeValueEntities(attrValue, attrName, parentTag);
    attrs[attrName] = decodeEntities(attrValue);
    i += m[0].length;
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
      // Tightening 4: ']]>' is the CDATA terminator and is invalid in
      // text content outside CDATA sections.
      if (raw.includes("]]>")) {
        throw new Error("parseXml: ']]>' outside CDATA section");
      }
      if (raw.length > 0 && stack.length > 0) {
        stack[stack.length - 1].children.push({
          type: "text",
          text: decodeEntities(raw),
        });
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
      const closeTag = inner.slice(1).trim();
      // Tightening 5a: closing tag with no open elements.
      if (stack.length === 0) {
        throw new Error(`parseXml: closing tag </${closeTag}> with no matching open tag`);
      }
      // Tightening 5b: closing tag must match top of stack.
      const top = stack[stack.length - 1];
      if (top.tag !== closeTag) {
        throw new Error(`parseXml: mismatched closing tag </${closeTag}>; expected </${top.tag}>`);
      }
      stack.pop();
      continue;
    }

    // Self-closing tag: <tag attrs/>
    if (inner.endsWith("/")) {
      const body = inner.slice(0, -1).trimEnd();
      const space = body.search(/\s/);
      const tag = space === -1 ? body : body.slice(0, space);
      const attrs = space === -1 ? {} : parseAttributes(body.slice(space + 1), tag);
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
    const attrs = space === -1 ? {} : parseAttributes(inner.slice(space + 1), tag);
    const node: XmlElementNode = { type: "element", tag, attrs, children: [] };

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);

    if (!root) root = node;
  }

  if (!root) throw new Error("parseXml: no root element found");

  // Tightening 1: detect unclosed elements at end-of-input.
  // Well-formed input has an empty stack at this point. Anything left
  // means an opening tag was never closed.
  if (stack.length > 0) {
    const tags = stack.map((n) => `<${n.tag}>`).join(", ");
    throw new Error(`parseXml: unclosed elements: ${tags}`);
  }

  return root;
}

/**
 * The odf-kit default parser. Exposes parseXml as a function conforming to
 * the public Parser contract type, suitable for use as the default value
 * of the `parser` option in htmlToOdt and related APIs.
 *
 * For substituting alternative parsers (e.g. parse5), see ADAPTERS.md.
 */
export const odfKitParser: Parser = (xml) => parseXml(xml);
