// docs/tools/delayed-indicator.ts
//
// Appear-threshold + minimum-display timing for a "busy" indicator wrapped
// around an async operation. Extracted from the inline logic that lived in
// onGenerateClick (index.ui.ts) so the same pattern can drive both the
// Generate button's "Generating..." label and the binary-preview spinner
// (loadBinaryFile) — the "factor out if a second site needs the same
// pattern" the original inline comment anticipated.
//
// The pattern defeats two distinct flashes:
//   - The flash on FAST operations: if the work settles before the appear
//     threshold, the indicator never mounts at all (show() never fires).
//   - The flash on BARELY-OVER-THRESHOLD operations: if the indicator
//     mounts and the work settles a few milliseconds later, the indicator
//     is held on screen for at least the minimum-display time so it reads
//     as deliberate feedback rather than a glitch.
//
// This is a UI-timing concern (uses window.setTimeout / performance.now),
// so it lives in docs/tools alongside the other page glue, not in the
// library source.

/**
 * Arm the indicator timer this many ms after the operation starts. If the
 * operation is still running when the timer fires, show() is invoked. If it
 * settles first, show() never fires (no flash on fast operations).
 */
export const INDICATOR_APPEAR_THRESHOLD_MS = 200;

/**
 * Once shown, keep the indicator on screen at least this long. If the
 * operation settles shortly after show() fired, the difference is padded
 * with an artificial delay (no flash on barely-over-threshold operations).
 */
export const INDICATOR_MIN_DISPLAY_MS = 400;

/**
 * Run `operation` while managing a busy indicator with the appear-threshold
 * + minimum-display pattern.
 *
 * Behavior:
 *   - A timer is armed before `operation` starts. If it fires before the
 *     operation settles, `show` is invoked (mount the indicator).
 *   - When the operation settles (resolve OR reject), the timer is cleared.
 *     If `show` had fired, the minimum-display delay is enforced and then
 *     `hide` is invoked. If `show` never fired, neither the delay nor `hide`
 *     runs — nothing was shown, so there is nothing to hold or tear down.
 *   - The operation's resolved value is returned; a rejection is re-thrown
 *     unchanged after the indicator has been cleaned up, so callers keep
 *     their normal try/catch around the await.
 *
 * `hide` is paired with `show`: it runs only when `show` ran. This mirrors
 * the original inline logic, where restoring the Generate label was a no-op
 * whenever the label had never been changed. Callers whose `hide` must be
 * safe to skip in the fast path get exactly that for free; callers whose
 * `hide` tears down a DOM node it mounted in `show` never tear down a node
 * that was never mounted.
 *
 * Note on error-path ordering: because this wrapper encloses only
 * `operation`, its cleanup (min-display delay + `hide`) completes as the
 * rejection unwinds through it — i.e. BEFORE the caller's catch runs. In
 * the Generate case this means the button label is restored to "Generate"
 * before any error popup is shown, rather than after. The button sits behind
 * the modal backdrop while the popup is up, so the difference is not
 * user-visible; it is a slight improvement over the prior inline behavior
 * (which left the label frozen at "Generating..." behind the backdrop until
 * the popup was dismissed).
 */
export async function withDelayedIndicator<T>(
  operation: () => Promise<T>,
  show: () => void,
  hide: () => void,
  options?: { appearThresholdMs?: number; minDisplayMs?: number },
): Promise<T> {
  const appearThresholdMs = options?.appearThresholdMs ?? INDICATOR_APPEAR_THRESHOLD_MS;
  const minDisplayMs = options?.minDisplayMs ?? INDICATOR_MIN_DISPLAY_MS;

  let shown = false;
  let shownAt = 0;
  const timer = window.setTimeout(() => {
    shown = true;
    shownAt = performance.now();
    show();
  }, appearThresholdMs);

  try {
    return await operation();
  } finally {
    window.clearTimeout(timer);
    if (shown) {
      const elapsed = performance.now() - shownAt;
      const remaining = minDisplayMs - elapsed;
      if (remaining > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
      }
      hide();
    }
  }
}
