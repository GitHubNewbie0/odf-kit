/**
 * Rule 4 of the Tier 1 normalizer: lowercase the doctype declaration.
 *
 * HTML5 doctype declarations are case-insensitive. XML is case-sensitive.
 * This rule lowercases the entire doctype declaration if present, so
 * `<!DOCTYPE html>` becomes `<!doctype html>`.
 *
 * Spec reference: WHATWG HTML Living Standard § 13.1.1 "The DOCTYPE".
 *
 * Scope: matches the first doctype declaration in the input. Standard
 * HTML documents have exactly one. Multiple doctypes are malformed input,
 * outside the contract.
 */

const DOCTYPE_PATTERN = /<!DOCTYPE\b[^>]*>/i;

/**
 * Lowercase the doctype declaration.
 *
 * Idempotent: an already-lowercase doctype produces the same output.
 *
 * @param html - HTML5 input
 * @returns Input with doctype declaration lowercased
 */
export function lowercaseDoctype(html: string): string {
  return html.replace(DOCTYPE_PATTERN, (match) => match.toLowerCase());
}
