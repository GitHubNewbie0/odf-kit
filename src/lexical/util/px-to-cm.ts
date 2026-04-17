/**
 * Convert pixels to centimetres as an ODT dimension string.
 *
 * Formula: px / 96 * 2.54 (96 DPI standard screen resolution).
 * Result is rounded to 2 decimal places and suffixed with "cm".
 *
 * Returns undefined when px is 0, negative, or falsy — treating these
 * as 'inherit' / unknown, consistent with Lexical's ImageNode where
 * width/height of 0 means the natural size is unknown.
 *
 * @param px - The pixel value (e.g. from a Lexical image node width/height).
 * @returns A string like "10.58cm", or undefined if px is 0 or absent.
 *
 * @example
 * pxToCm(96)  // "2.54cm"
 * pxToCm(0)   // undefined
 * pxToCm(undefined) // undefined
 */
export function pxToCm(px: number | undefined): string | undefined {
  if (!px || px <= 0) return undefined;
  const cm = (px / 96) * 2.54;
  return `${cm.toFixed(2)}cm`;
}
