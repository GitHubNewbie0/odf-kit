/**
 * Lightweight XML builder for generating ODF XML documents.
 *
 * Since odf-kit only generates XML (never parses it), a focused builder
 * is simpler and avoids an external dependency. The builder handles
 * proper escaping, namespace prefixes, and serialization.
 */

/** Escape special characters for XML text content. */
export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape special characters for XML attribute values. */
function escapeAttr(value: string): string {
  return escapeXml(value).replace(/"/g, "&quot;");
}

/**
 * An XML element that can be built up and serialized.
 */
export class XmlElement {
  readonly tagName: string;
  private attributes: [string, string][] = [];
  private children: (XmlElement | string)[] = [];

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  /** Set an attribute on this element. Returns this for chaining. */
  attr(name: string, value: string): this {
    this.attributes.push([name, value]);
    return this;
  }

  /** Append a child element. Returns the child for further building. */
  appendChild(child: XmlElement): XmlElement {
    this.children.push(child);
    return child;
  }

  /** Set the text content of this element. Returns this for chaining. */
  text(content: string): this {
    this.children.push(content);
    return this;
  }

  /** Serialize this element and its children to an XML string. */
  serialize(indent: number = 0): string {
    const attrs = this.attributes.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join("");

    if (this.children.length === 0) {
      return `<${this.tagName}${attrs}/>`;
    }

    // If the only child is text, keep it on one line
    if (this.children.length === 1 && typeof this.children[0] === "string") {
      return `<${this.tagName}${attrs}>${escapeXml(this.children[0])}</${this.tagName}>`;
    }

    // Otherwise, serialize children on separate lines
    const childStr = this.children
      .map((child) => {
        if (typeof child === "string") {
          return escapeXml(child);
        }
        return child.serialize(indent + 1);
      })
      .join("\n");

    return `<${this.tagName}${attrs}>\n${childStr}\n</${this.tagName}>`;
  }
}

/**
 * Create a new XML element.
 */
export function el(tagName: string): XmlElement {
  return new XmlElement(tagName);
}

/**
 * Wrap an XmlElement as a complete XML document with declaration.
 */
export function xmlDocument(root: XmlElement): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + root.serialize();
}
