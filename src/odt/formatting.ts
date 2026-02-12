import type { TextFormatting } from "./types.js";

/**
 * CSS named colors mapped to hex values.
 * Covers the 17 standard CSS colors plus common additions.
 */
const CSS_NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  olive: "#808000",
  lime: "#00ff00",
  aqua: "#00ffff",
  teal: "#008080",
  navy: "#000080",
  fuchsia: "#ff00ff",
  pink: "#ffc0cb",
  brown: "#a52a2a",
  coral: "#ff7f50",
  crimson: "#dc143c",
  darkblue: "#00008b",
  darkgreen: "#006400",
  darkred: "#8b0000",
  gold: "#ffd700",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  magenta: "#ff00ff",
  salmon: "#fa8072",
  tan: "#d2b48c",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
};

/**
 * Normalized formatting properties ready for ODF style generation.
 * All values are resolved to their ODF-compatible form.
 */
export interface NormalizedFormatting {
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  fontSize?: string;
  fontFamily?: string;
  color?: string;
  underline?: boolean;
  strikethrough?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  highlightColor?: string;
}

/**
 * Normalize a TextFormatting object to resolved ODF properties.
 *
 * - `bold: true` becomes `fontWeight: "bold"`
 * - `italic: true` becomes `fontStyle: "italic"`
 * - `fontSize: 12` becomes `"12pt"`
 * - Named colors like `"red"` become `"#ff0000"`
 * - Explicit properties (`fontWeight`, `fontStyle`) override boolean shortcuts
 */
export function normalizeFormatting(fmt: TextFormatting): NormalizedFormatting {
  const result: NormalizedFormatting = {};

  // Font weight: explicit property wins over boolean shortcut
  if (fmt.fontWeight !== undefined) {
    result.fontWeight = fmt.fontWeight;
  } else if (fmt.bold !== undefined) {
    result.fontWeight = fmt.bold ? "bold" : "normal";
  }

  // Font style: explicit property wins over boolean shortcut
  if (fmt.fontStyle !== undefined) {
    result.fontStyle = fmt.fontStyle;
  } else if (fmt.italic !== undefined) {
    result.fontStyle = fmt.italic ? "italic" : "normal";
  }

  // Font size: number assumes pt
  if (fmt.fontSize !== undefined) {
    result.fontSize = typeof fmt.fontSize === "number" ? `${fmt.fontSize}pt` : fmt.fontSize;
  }

  // Font family: pass through
  if (fmt.fontFamily !== undefined) {
    result.fontFamily = fmt.fontFamily;
  }

  // Color: resolve named colors to hex
  if (fmt.color !== undefined) {
    const lower = fmt.color.toLowerCase().trim();
    result.color = CSS_NAMED_COLORS[lower] ?? fmt.color;
  }

  // Underline
  if (fmt.underline) {
    result.underline = true;
  }

  // Strikethrough
  if (fmt.strikethrough) {
    result.strikethrough = true;
  }

  // Superscript / subscript (superscript wins if both set)
  if (fmt.superscript) {
    result.superscript = true;
  } else if (fmt.subscript) {
    result.subscript = true;
  }

  // Highlight color: resolve named colors to hex
  if (fmt.highlightColor !== undefined) {
    const lower = fmt.highlightColor.toLowerCase().trim();
    result.highlightColor = CSS_NAMED_COLORS[lower] ?? fmt.highlightColor;
  }

  return result;
}

/**
 * Generate a stable key for a NormalizedFormatting object.
 * Two identical formatting combinations produce the same key,
 * enabling style deduplication.
 */
export function formattingKey(fmt: NormalizedFormatting): string {
  const parts: string[] = [];
  if (fmt.fontWeight) parts.push(`w:${fmt.fontWeight}`);
  if (fmt.fontStyle) parts.push(`s:${fmt.fontStyle}`);
  if (fmt.fontSize) parts.push(`z:${fmt.fontSize}`);
  if (fmt.fontFamily) parts.push(`f:${fmt.fontFamily}`);
  if (fmt.color) parts.push(`c:${fmt.color}`);
  if (fmt.underline) parts.push("u:1");
  if (fmt.strikethrough) parts.push("st:1");
  if (fmt.superscript) parts.push("sup:1");
  if (fmt.subscript) parts.push("sub:1");
  if (fmt.highlightColor) parts.push(`hc:${fmt.highlightColor}`);
  return parts.join("|");
}

/**
 * Resolve a color value: converts named CSS colors to hex.
 * Hex values and other strings are passed through unchanged.
 */
export function resolveColor(color: string): string {
  const lower = color.toLowerCase().trim();
  return CSS_NAMED_COLORS[lower] ?? color;
}
