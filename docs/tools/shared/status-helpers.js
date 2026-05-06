/**
 * Shared status display helpers for odf-kit tool pages.
 *
 * Replaces the unsafe pattern of concatenating exception text into innerHTML
 * with safer DOM construction using textContent for user data.
 */

/**
 * Replace the contents of a parent element with the given child nodes.
 * Atomic — clears existing children and appends new ones in one operation.
 */
export function setStatusContent(parent, ...nodes) {
  parent.replaceChildren(...nodes);
}

/**
 * Build a developer-controlled HTML icon (e.g., "<span>✓</span>", "<div class='spinner'></div>").
 * The HTML string is treated as a literal — never user data. Returns the first child node.
 *
 * Safe because callers pass static literals only. Never call with user-controllable input.
 */
export function makeIcon(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl.content.firstChild;
}

/**
 * Build a span containing user-supplied text. Uses textContent, so HTML in
 * the input is treated as literal text, not parsed as markup. Safe for any input.
 */
export function makeText(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}
