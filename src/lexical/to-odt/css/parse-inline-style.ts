import { cssColorToHex } from "./color-to-hex.js";

/**
 * Parsed representation of a Lexical text node's inline CSS style string.
 *
 * Lexical stores inline styles as a CSS string on the `style` property of
 * text nodes, e.g.: "color: rgb(255, 0, 0); font-size: 14px; font-family: Arial;"
 *
 * Proton's getTextRun.ts uses browser DOM (element.style.cssText) to parse this.
 * We implement pure string parsing so it works in Node.js too.
 */
export interface ParsedStyle {
  /** Text color as a 6-digit hex string (without #), e.g. 'ff0000'. */
  color?: string;

  /** Background/highlight color as a 6-digit hex string (without #). */
  backgroundColor?: string;

  /**
   * Font size in pixels.
   * Proton always stores font sizes in px — caller converts to pt via px * 0.75.
   */
  fontSize?: number;

  /**
   * First font family from the stack, with quotes stripped.
   * e.g. '"Arial", sans-serif' → 'Arial'
   */
  fontFamily?: string;
}

/**
 * Parse a Lexical inline CSS style string into a structured object.
 *
 * Uses indexOf(':') to split on the first colon only — safe for values
 * containing colons (e.g. url('http://...') or data URIs).
 *
 * @param cssText - The raw CSS string from a Lexical text node's `style` property.
 * @returns A ParsedStyle with any recognized properties extracted.
 */
export function parseInlineStyle(cssText: string): ParsedStyle {
  const result: ParsedStyle = {};
  if (!cssText) return result;

  for (const decl of cssText.split(";")) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;

    const prop = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).trim();
    if (!prop || !value) continue;

    switch (prop) {
      case "color": {
        const hex = cssColorToHex(value);
        if (hex) result.color = hex;
        break;
      }
      case "background-color": {
        const hex = cssColorToHex(value);
        if (hex) result.backgroundColor = hex;
        break;
      }
      case "font-size": {
        const px = parseFloat(value);
        if (!isNaN(px) && px > 0) result.fontSize = px;
        break;
      }
      case "font-family": {
        // Take first family, strip quotes, trim whitespace
        const first = value.split(",")[0];
        const clean = first.replace(/['"]/g, "").trim();
        if (clean) result.fontFamily = clean;
        break;
      }
    }
  }

  return result;
}
