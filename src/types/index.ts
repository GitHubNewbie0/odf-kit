/**
 * Adapter contract types for the substitution architecture (v0.13.2).
 *
 * Import from "odf-kit/types":
 *
 * ```typescript
 * import type { Parser, Normalizer } from "odf-kit/types";
 * ```
 *
 * These are the types any substituted normalizer or parser implementation
 * must satisfy. See ADAPTERS.md for the architectural overview and a worked
 * adapter example.
 *
 * T4: v0_14_0-plan-v3-amendments.md item 3 — the v0.13.2 CHANGELOG documents
 * an "odf-kit/types" import that the exports map never carried. This entry
 * point resolves that PHANTOM, making the documented path real.
 *
 * OdtBaseOptions is re-exported here from its defining module. T4:
 * amendments-2 item 5 — v3 guessed it lived in the ODT types module; it is
 * in fact defined in the HTML-to-ODT pathway, verified at execution time,
 * and it was previously published from no entry point at all.
 */
export { VERSION } from "../version.js";

export type {
  ParsedHtmlTree,
  Parser,
  Normalizer,
  NormalizerOption,
  ParserOption,
} from "./public.js";
export type { OdtBaseOptions } from "../html/to-odt/html-to-odt.js";
