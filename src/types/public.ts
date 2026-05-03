/**
 * Public types for odf-kit's substitution architecture.
 *
 * Defines the contract types that any substituted normalizer or parser
 * implementation must satisfy. These types are the load-bearing API surface
 * for adapter authors and sibling-package authors.
 *
 * For the architectural overview, naming conventions, and a worked adapter
 * example, see `ADAPTERS.md` at the repo root.
 *
 * @module
 */

import type { XmlElementNode } from "../reader/xml-parser.js";

/**
 * The canonical parsed-tree shape that any HTML/XML parser must return.
 *
 * Aliased from the internal `XmlElementNode` type. Implementations of
 * `Parser` MUST return a tree conforming to this structure:
 *
 * ```ts
 * interface XmlElementNode {
 *   type: "element";
 *   tag: string;                    // lowercase tag name
 *   attrs: Record<string, string>;  // plain object, entities decoded
 *   children: XmlNode[];            // XmlElementNode | XmlTextNode
 * }
 *
 * interface XmlTextNode {
 *   type: "text";
 *   text: string;                   // entities decoded
 * }
 * ```
 *
 * See the Contract Specifications section of `ADAPTERS.md` for the full
 * list of invariants any conforming implementation must satisfy.
 */
export type ParsedHtmlTree = XmlElementNode;

/**
 * The shape of a normalizer function.
 *
 * A normalizer takes an HTML/XML string and returns a string that the
 * downstream parser can consume safely. The default implementation is
 * `odfKitNormalizer` (Tier 1 normalization), available from
 * `odf-kit/html-normalizer` as of v0.13.2.
 */
export type Normalizer = (html: string) => string;

/**
 * The shape of a parser function.
 *
 * A parser takes a string (typically post-normalization XHTML or XML) and
 * returns a `ParsedHtmlTree`. The default implementation is `odfKitParser`,
 * which wraps the built-in tightened XML parser.
 *
 * Custom parsers — for example, a parse5 adapter for full HTML5 spec
 * compliance — substitute via the `parser` option on `htmlToOdt`. See
 * `ADAPTERS.md` for adapter-writing conventions.
 */
export type Parser = (xml: string) => ParsedHtmlTree;

/**
 * Option type for fields that accept a `Normalizer` or skip-marker.
 *
 * - A `Normalizer` function: substitute the default with this implementation.
 * - `false`: skip normalization entirely (input is already polyglot/XHTML).
 * - `undefined` or omitted: use the built-in `odfKitNormalizer`.
 */
export type NormalizerOption = Normalizer | false | undefined;

/**
 * Option type for fields that accept a `Parser` or skip-marker.
 *
 * - A `Parser` function: substitute the default with this implementation.
 * - `false`: reserved; not currently meaningful for `htmlToOdt` (a parser
 *   is required).
 * - `undefined` or omitted: use the built-in `odfKitParser`.
 *
 * `htmlToOdt` itself narrows its `parser` option to `Parser | undefined`
 * because a parser is required. `ParserOption` is provided for symmetry
 * with `NormalizerOption` and for future stages where skipping a parser
 * is meaningful.
 */
export type ParserOption = Parser | false | undefined;
