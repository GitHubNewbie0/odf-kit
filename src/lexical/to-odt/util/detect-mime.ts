/**
 * Detect the MIME type of an image from its source.
 *
 * Detection order:
 * 1. Base64 data URL prefix (most reliable)
 * 2. URL file extension
 * 3. Raw byte signature (magic bytes)
 * 4. Fallback: 'image/png'
 */

/** Map of base64 data URL prefixes to MIME types. */
const DATA_URL_MIME: Record<string, string> = {
  "data:image/png": "image/png",
  "data:image/jpeg": "image/jpeg",
  "data:image/jpg": "image/jpeg",
  "data:image/gif": "image/gif",
  "data:image/webp": "image/webp",
  "data:image/svg+xml": "image/svg+xml",
  "data:image/bmp": "image/bmp",
  "data:image/tiff": "image/tiff",
};

/** Map of file extensions to MIME types. */
const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
};

/**
 * Detect MIME type from a base64 data URL or URL string.
 * Falls back to inspecting magic bytes if src gives no clue.
 *
 * @param src - The image src (data URL or HTTP URL).
 * @param data - The raw image bytes.
 * @returns A MIME type string. Defaults to 'image/png' if undetectable.
 */
export function detectMime(src: string, data: Uint8Array): string {
  // 1. Base64 data URL prefix
  for (const [prefix, mime] of Object.entries(DATA_URL_MIME)) {
    if (src.startsWith(prefix)) return mime;
  }

  // 2. URL file extension
  const extMatch = src.split("?")[0].split(".").pop()?.toLowerCase();
  if (extMatch && EXT_MIME[extMatch]) {
    return EXT_MIME[extMatch];
  }

  // 3. Magic bytes
  return detectMimeFromBytes(data);
}

/**
 * Detect MIME type from raw image bytes using magic byte signatures.
 */
function detectMimeFromBytes(data: Uint8Array): string {
  if (data.length < 4) return "image/png";

  // PNG: 89 50 4E 47
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }

  // GIF: 47 49 46 38
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) {
    return "image/gif";
  }

  // WEBP: 52 49 46 46 ... 57 45 42 50
  if (
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data.length >= 12 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "image/webp";
  }

  // BMP: 42 4D
  if (data[0] === 0x42 && data[1] === 0x4d) {
    return "image/bmp";
  }

  // SVG: starts with '<' (3C) — crude but covers inline SVG
  if (data[0] === 0x3c) {
    return "image/svg+xml";
  }

  return "image/png";
}

/**
 * Check whether a src string is a base64 data URL.
 *
 * @param src - The image src string.
 * @returns True if the src is a data URL (starts with "data:").
 */
export function isBase64Image(src: string): boolean {
  return src.startsWith("data:");
}

/**
 * Convert a base64 data URL to a Uint8Array.
 *
 * Handles both "data:image/png;base64,..." and raw base64 strings.
 *
 * @param src - The base64 data URL.
 * @returns The decoded bytes.
 */
export function base64ToUint8Array(src: string): Uint8Array {
  // Strip the data URL prefix if present
  const base64 = src.includes(",") ? src.split(",")[1] : src;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
