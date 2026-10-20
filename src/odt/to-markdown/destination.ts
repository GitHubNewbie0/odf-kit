/**
 * Link and image destinations for the Markdown emitter: normalization, the
 * scheme classifier, destination escaping, and the one function every call
 * site uses to emit `[text](dest)` / `![alt](dest)`.
 *
 * Citations:
 * - T1: WHATWG URL (Living Standard, Last Updated 19 October 2026),
 *   url-spec.txt: "Remove any leading and trailing C0 control or space from
 *   input." (l.3743); "Remove all ASCII tab or newline from input." (l.3752);
 *   scheme start state (l.3785) and scheme state (l.3808). Infra
 *   (infra-spec.txt): "A C0 control or space is a C0 control or U+0020
 *   SPACE." (l.1500–1501); "An ASCII tab or newline is U+0009 TAB, U+000A LF,
 *   or U+000D CR." (l.1468–1469).
 * - T1: CommonMark 0.29 §6.5 (cm.txt l.10129–10137): the bracketed and bare
 *   destination forms; §6.1 backslash escapes work in destinations (l.7339);
 *   §6.3 "backslash escapes do not work in code spans" (l.7862).
 * - T4: R1 form (b) (Scott, 2026-10-19); R2 blocked-scheme output shape
 *   (Scott, 2026-10-18); R2 membership (Scott, 2026-10-19); [B] one
 *   classifier, the single decision point (Scott, 2026-10-19); [E], [F], [H]
 *   (Scott, 2026-10-19); [H2] (Scott, 2026-10-20).
 */

import { decodeAttributeCharRefs } from "./char-refs.js";

export type DestinationKind = "link" | "image";
export type DestinationClass = { allowed: true } | { allowed: false; scheme: string };

// T1: Infra — C0 control or space is U+0000–U+0020.
const isC0OrSpace = (c: number): boolean => c <= 0x20;

/**
 * URL preprocessing: trim leading and trailing C0 control or space, then remove
 * every ASCII tab or newline (T1: url-spec.txt l.3743, then l.3752).
 */
export function normalizeDestination(model: string): string {
  let a = 0;
  let b = model.length;
  while (a < b && isC0OrSpace(model.charCodeAt(a))) a++;
  while (b > a && isC0OrSpace(model.charCodeAt(b - 1))) b--;
  return model.slice(a, b).replace(/[\t\n\r]/g, "");
}

// T1: URL scheme start state (ASCII alpha) then scheme state (ASCII
// alphanumeric, "+", "-", "."), ended by ":" (url-spec.txt l.3785, l.3808).
const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;

// T4: R2 membership (Scott, 2026-10-19): http, https, mailto, tel; relative and
// protocol-relative destinations have no scheme and are allowed.
const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto", "tel"]);

// T4: R2 membership and its amendment [E] (Scott, 2026-10-19), registered names
// only ([F]): the data: carve-out, at an image destination only.
const IMAGE_DATA_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/gif",
  "image/jpeg",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);

const asciiLower = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/**
 * Classify a destination model (T4: R2b, decode first; [B], the single
 * decision point — no call site checks again). Never throws ([F], [H], [H2]).
 */
export function classifyDestination(model: string, kind: DestinationKind): DestinationClass {
  const view = normalizeDestination(decodeAttributeCharRefs(model));
  const m = SCHEME_RE.exec(view);
  if (m === null) return { allowed: true };
  const scheme = m[0].slice(0, -1);
  const lower = asciiLower(scheme);
  if (ALLOWED_SCHEMES.has(lower)) return { allowed: true };
  if (lower === "data" && kind === "image") {
    // T4: [H] (Scott, 2026-10-19): the media-type portion is the text between
    // "data:" and the first ","; its essence is the text before the portion's
    // first ";" (the whole portion if it has none), matched ASCII
    // case-insensitively; no trimming, no parameter parsing.
    const rest = view.slice(m[0].length);
    const comma = rest.indexOf(",");
    // T4: [H2] (Scott, 2026-10-20): no "," fails the carve-out match.
    if (comma >= 0) {
      const portion = rest.slice(0, comma);
      const semi = portion.indexOf(";");
      const essence = semi < 0 ? portion : portion.slice(0, semi);
      if (IMAGE_DATA_TYPES.has(asciiLower(essence))) return { allowed: true };
    }
  }
  // T4: R2 blocked-scheme output shape: the scheme as the decoded view spells it.
  return { allowed: false, scheme };
}

// T4: R1 form (b): the bracket trigger is [\0- \u007F] — C0 controls, space and DEL.
const needsBrackets = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) return true;
  }
  return false;
};

/**
 * Escape a normalized destination (T4: R1 form (b)). If a C0 control, space or
 * DEL remains, the bracketed form `<…>` with `\`, `<`, `>` and `&`
 * backslash-escaped (T1: cm.txt l.10129–10131); otherwise the bare form with
 * `\`, `(`, `)`, `&` and `<` backslash-escaped (T1: cm.txt l.10134–10137).
 */
export function escapeDestination(normalized: string): string {
  if (needsBrackets(normalized)) {
    return `<${normalized.replace(/[\\<>&]/g, (c) => `\\${c}`)}>`;
  }
  return normalized.replace(/[\\()&<]/g, (c) => `\\${c}`);
}

/**
 * Emit a link or image. `labelMd` is the link text or alt, already escaped once
 * as text context. An allowed destination is normalized and escaped; a blocked
 * one is emitted as the R2 blocked-scheme form, assembled here and never passed
 * through the text escaper: the scheme enters the code span raw (T1: cm.txt
 * l.7862), and an image keeps its leading "!" (T1: cm.txt l.11923–11924).
 */
export function emitLinkOrImage(labelMd: string, model: string, kind: DestinationKind): string {
  const bang = kind === "image" ? "!" : "";
  const c = classifyDestination(model, kind);
  if (c.allowed) {
    return `${bang}[${labelMd}](${escapeDestination(normalizeDestination(model))})`;
  }
  return `${bang}\\[${labelMd}\\]\\(\`${c.scheme}:…\`\\)`;
}
