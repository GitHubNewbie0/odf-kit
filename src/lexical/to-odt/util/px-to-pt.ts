/**
 * Convert pixels to points as an ODT font size string.
 *
 * Formula: px * 0.75 (1pt = 1/72 inch, 1px = 1/96 inch at standard DPI).
 * This matches Proton's getTextRun.ts pixelsToPoints() implementation.
 * Result is rounded to 1 decimal place and suffixed with "pt".
 *
 * Returns undefined when px is 0, negative, or falsy.
 *
 * @param px - The pixel value from a Lexical text node CSS font-size.
 * @returns A string like "12.0pt", or undefined if px is 0 or absent.
 *
 * @example
 * pxToPt(16)  // "12.0pt"
 * pxToPt(14)  // "10.5pt"
 * pxToPt(0)   // undefined
 */
export function pxToPt(px: number | undefined): string | undefined {
  if (!px || px <= 0) return undefined;
  const pt = px * 0.75;
  return `${pt.toFixed(1)}pt`;
}
