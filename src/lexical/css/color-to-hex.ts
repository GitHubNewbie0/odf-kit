/**
 * Convert a CSS color value to a 6-digit hex string (without #).
 *
 * Supports:
 *   - rgb(r, g, b)
 *   - rgba(r, g, b, a)   — alpha ignored
 *   - #rrggbb
 *   - #rgb               — shorthand expanded
 *   - CSS named colors   — top 30 most common
 *
 * Returns undefined if the value cannot be parsed.
 */

const NAMED_COLORS: Record<string, string> = {
  black: "000000",
  white: "ffffff",
  red: "ff0000",
  green: "008000",
  blue: "0000ff",
  yellow: "ffff00",
  orange: "ffa500",
  purple: "800080",
  pink: "ffc0cb",
  gray: "808080",
  grey: "808080",
  brown: "a52a2a",
  cyan: "00ffff",
  magenta: "ff00ff",
  lime: "00ff00",
  indigo: "4b0082",
  violet: "ee82ee",
  gold: "ffd700",
  silver: "c0c0c0",
  navy: "000080",
  teal: "008080",
  maroon: "800000",
  olive: "808000",
  coral: "ff7f50",
  salmon: "fa8072",
  khaki: "f0e68c",
  beige: "f5f5dc",
  ivory: "fffff0",
  lavender: "e6e6fa",
  transparent: "000000",
};

export function cssColorToHex(value: string): string | undefined {
  const v = value.trim().toLowerCase();

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return toHex(r, g, b);
  }

  // #rrggbb
  const hex6Match = v.match(/^#([0-9a-f]{6})$/);
  if (hex6Match) {
    return hex6Match[1];
  }

  // #rgb — expand to #rrggbb
  const hex3Match = v.match(/^#([0-9a-f]{3})$/);
  if (hex3Match) {
    const [r, g, b] = hex3Match[1].split("").map((c) => c + c);
    return `${r}${g}${b}`;
  }

  // Named color
  if (NAMED_COLORS[v] !== undefined) {
    return NAMED_COLORS[v];
  }

  return undefined;
}

function toHex(r: number, g: number, b: number): string {
  return [r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
}
