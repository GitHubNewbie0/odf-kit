/**
 * Style registry for the odf-kit ODT reader (Tier 2 / Tier 3).
 *
 * ODF documents store visual formatting in named and automatic styles that
 * reference each other through inheritance chains. This module parses both
 * styles.xml and the automatic-styles section of content.xml into a single
 * registry, then resolves any style name to its fully-computed property set
 * by walking the inheritance chain and merging in definition order.
 *
 * Exported for unit testing and consumed by parser.ts during body parsing.
 *
 * Key design points:
 *  - Automatic styles are looked up first; they override named styles of
 *    the same name (ODF spec §16.1).
 *  - Automatic styles may never be parents of other styles — the spec
 *    forbids it, so parent lookups always search the named map only.
 *  - Default styles (style:default-style) provide the floor for any
 *    property not set by any style in the chain.
 *  - Resolved results are cached so each family:name pair is walked once.
 *  - Font family resolution follows the ODF priority order: fo:font-family
 *    wins; if absent, style:font-name is resolved through the font-face map.
 *
 * Tier 3 addition:
 *  - graphicProps bag: attributes from style:graphic-properties, used to
 *    resolve style:wrap and other frame layout properties for images.
 */

import type { XmlElementNode } from "./xml-parser.js";

// ============================================================
// Public types
// ============================================================

/**
 * Fully resolved property set for a style after inheritance chain
 * application. Each Map holds raw ODF attribute key → value strings
 * exactly as they appear in the XML; conversion to CSS units is the
 * responsibility of the renderer, not the registry.
 *
 * Four bags mirror ODF's own property grouping:
 *  - textProps      — from style:text-properties
 *  - paragraphProps — from style:paragraph-properties
 *  - cellProps      — from style:table-cell-properties,
 *                     style:table-row-properties, and
 *                     style:table-column-properties
 *  - graphicProps   — from style:graphic-properties (Tier 3)
 */
export interface ResolvedStyle {
  textProps: Map<string, string>;
  paragraphProps: Map<string, string>;
  cellProps: Map<string, string>;
  /** Attributes from style:graphic-properties. Used to resolve style:wrap. */
  graphicProps: Map<string, string>;
}

/**
 * The style registry produced by buildRegistry().
 *
 * Treat this as an opaque handle; always access it through resolve().
 * The internal maps are exposed on the interface so unit tests can
 * inspect intermediate state without needing extra accessors.
 */
export interface StyleRegistry {
  /** style:font-face style:name → svg:font-family value. */
  fontFaces: Map<string, string>;
  /** "family:name" → raw properties for named styles (style:style). */
  named: Map<string, RawStyle>;
  /** "family:name" → raw properties for automatic styles. */
  automatic: Map<string, RawStyle>;
  /** "family" → default properties (style:default-style). */
  defaults: Map<string, RawStyle>;
  /** "family:name" → cached resolved result (populated lazily). */
  cache: Map<string, ResolvedStyle>;
}

// ============================================================
// Internal types
// ============================================================

/**
 * Raw (unresolved) properties for a single style element.
 * Stored before chain resolution so the walk can be done lazily.
 */
interface RawStyle {
  family: string;
  /** style:parent-style-name — named styles only; absent on automatic styles. */
  parentName?: string;
  /** style:display-name — human-readable label, preserved for consumers. */
  displayName?: string;
  textProps: Map<string, string>;
  paragraphProps: Map<string, string>;
  cellProps: Map<string, string>;
  /** Attributes from style:graphic-properties. Tier 3 addition. */
  graphicProps: Map<string, string>;
}

// ============================================================
// Internal XML navigation helpers
// ============================================================

/** Return the first direct element child with the given tag, or undefined. */
function findChild(node: XmlElementNode, tag: string): XmlElementNode | undefined {
  for (const child of node.children) {
    if (child.type === "element" && child.tag === tag) return child;
  }
  return undefined;
}

/** Return all direct element children with the given tag. */
function findChildren(node: XmlElementNode, tag: string): XmlElementNode[] {
  const result: XmlElementNode[] = [];
  for (const child of node.children) {
    if (child.type === "element" && child.tag === tag) result.push(child);
  }
  return result;
}

// ============================================================
// Property collection
// ============================================================

/**
 * The ODF property element tags that map to each of our four bags.
 * A single style element may contain more than one of these children.
 */
const TEXT_PROPS_TAG = "style:text-properties";
const PARA_PROPS_TAG = "style:paragraph-properties";
const GRAPHIC_PROPS_TAG = "style:graphic-properties";

/**
 * Tags whose attributes all land in cellProps.
 * table-cell, table-row, and table-column properties are merged into
 * one bag because a cell resolver looks up a single style name that
 * may carry any of them.
 */
const CELL_PROPS_TAGS = new Set([
  "style:table-cell-properties",
  "style:table-row-properties",
  "style:table-column-properties",
  "style:table-properties",
]);

/**
 * Collect all properties from the children of a style element into
 * a fresh RawStyle, without resolving inheritance.
 */
function collectRawStyle(
  styleEl: XmlElementNode,
  family: string,
  parentName?: string,
  displayName?: string,
): RawStyle {
  const textProps = new Map<string, string>();
  const paragraphProps = new Map<string, string>();
  const cellProps = new Map<string, string>();
  const graphicProps = new Map<string, string>();

  for (const child of styleEl.children) {
    if (child.type !== "element") continue;

    if (child.tag === TEXT_PROPS_TAG) {
      for (const [k, v] of Object.entries(child.attrs)) {
        textProps.set(k, v);
      }
    } else if (child.tag === PARA_PROPS_TAG) {
      for (const [k, v] of Object.entries(child.attrs)) {
        paragraphProps.set(k, v);
      }
    } else if (child.tag === GRAPHIC_PROPS_TAG) {
      for (const [k, v] of Object.entries(child.attrs)) {
        graphicProps.set(k, v);
      }
    } else if (CELL_PROPS_TAGS.has(child.tag)) {
      for (const [k, v] of Object.entries(child.attrs)) {
        cellProps.set(k, v);
      }
    }
  }

  return { family, parentName, displayName, textProps, paragraphProps, cellProps, graphicProps };
}

// ============================================================
// Font face scanning
// ============================================================

/**
 * Scan an office:font-face-decls element and populate the fontFaces map.
 * ODF §14.6: style:font-face gives each font a name; svg:font-family is
 * the CSS-usable family string (may include quotes, e.g. "'Times New Roman'").
 * Later entries win so content.xml overrides styles.xml for the same name.
 */
function scanFontFaces(container: XmlElementNode, fontFaces: Map<string, string>): void {
  for (const child of findChildren(container, "style:font-face")) {
    const name = child.attrs["style:name"];
    const family = child.attrs["svg:font-family"];
    if (name && family) {
      fontFaces.set(name, family);
    }
  }
}

// ============================================================
// Style container scanning
// ============================================================

/**
 * Scan a container element (office:styles or office:automatic-styles) and
 * populate the named, automatic, or defaults maps as appropriate.
 *
 * @param container    - The styles container element.
 * @param isAutomatic  - True when scanning office:automatic-styles.
 * @param named        - Named style map (mutated in place).
 * @param automatic    - Automatic style map (mutated in place).
 * @param defaults     - Default style map (mutated in place).
 */
function scanStylesContainer(
  container: XmlElementNode,
  isAutomatic: boolean,
  named: Map<string, RawStyle>,
  automatic: Map<string, RawStyle>,
  defaults: Map<string, RawStyle>,
): void {
  for (const child of container.children) {
    if (child.type !== "element") continue;

    if (child.tag === "style:default-style") {
      const family = child.attrs["style:family"];
      if (!family) continue;
      const raw = collectRawStyle(child, family);
      defaults.set(family, raw);
      continue;
    }

    if (child.tag === "style:style") {
      const name = child.attrs["style:name"];
      const family = child.attrs["style:family"];
      if (!name || !family) continue;

      const parentName = child.attrs["style:parent-style-name"];
      const displayName = child.attrs["style:display-name"];
      const raw = collectRawStyle(child, family, parentName, displayName);
      const key = `${family}:${name}`;

      if (isAutomatic) {
        automatic.set(key, raw);
      } else {
        named.set(key, raw);
      }
      continue;
    }
  }
}

// ============================================================
// Registry construction
// ============================================================

/**
 * Build a StyleRegistry from parsed content.xml and optional styles.xml roots.
 *
 * Scan order (later wins for the same key):
 *  1. styles.xml font-face-decls
 *  2. styles.xml office:styles        → named + defaults
 *  3. styles.xml office:automatic-styles → automatic
 *  4. content.xml font-face-decls
 *  5. content.xml office:styles       → named + defaults
 *  6. content.xml office:automatic-styles → automatic
 *
 * This matches the precedence order used by the existing buildStyleMaps()
 * function in parser.ts so Tier 2 and Tier 1 behaviour are consistent.
 *
 * @param contentRoot - Parsed root of content.xml.
 * @param stylesRoot  - Parsed root of styles.xml, if present in the ZIP.
 * @returns A populated StyleRegistry ready for resolve() calls.
 */
export function buildRegistry(
  contentRoot: XmlElementNode,
  stylesRoot?: XmlElementNode,
): StyleRegistry {
  const fontFaces = new Map<string, string>();
  const named = new Map<string, RawStyle>();
  const automatic = new Map<string, RawStyle>();
  const defaults = new Map<string, RawStyle>();
  const cache = new Map<string, ResolvedStyle>();

  if (stylesRoot) {
    const fontDecls = findChild(stylesRoot, "office:font-face-decls");
    if (fontDecls) scanFontFaces(fontDecls, fontFaces);

    const namedEl = findChild(stylesRoot, "office:styles");
    if (namedEl) scanStylesContainer(namedEl, false, named, automatic, defaults);

    const autoEl = findChild(stylesRoot, "office:automatic-styles");
    if (autoEl) scanStylesContainer(autoEl, true, named, automatic, defaults);
  }

  const contentFontDecls = findChild(contentRoot, "office:font-face-decls");
  if (contentFontDecls) scanFontFaces(contentFontDecls, fontFaces);

  const contentNamedEl = findChild(contentRoot, "office:styles");
  if (contentNamedEl) scanStylesContainer(contentNamedEl, false, named, automatic, defaults);

  const contentAutoEl = findChild(contentRoot, "office:automatic-styles");
  if (contentAutoEl) scanStylesContainer(contentAutoEl, true, named, automatic, defaults);

  return { fontFaces, named, automatic, defaults, cache };
}

// ============================================================
// Resolution
// ============================================================

/**
 * Resolve a style name to its fully-computed property set.
 *
 * Resolution algorithm (child properties always win over parent):
 *  1. Start with default style for the family (the floor).
 *  2. Look up the style in automatic first, then named.
 *  3. Walk the parentName chain (named styles only — spec requirement).
 *     Build the chain from outermost ancestor to the requested style.
 *  4. Apply the chain in order: outermost first so child props overwrite.
 *  5. Cache and return the result.
 *
 * Returns an empty ResolvedStyle (all empty Maps) if the style name is
 * not found in either map — callers may always safely access the Maps.
 *
 * @param registry - Registry produced by buildRegistry().
 * @param family   - ODF style family, e.g. "text", "paragraph", "graphic".
 * @param name     - The style:name value to resolve.
 * @returns Fully merged property Maps for this style.
 */
export function resolve(registry: StyleRegistry, family: string, name: string): ResolvedStyle {
  const cacheKey = `${family}:${name}`;
  const cached = registry.cache.get(cacheKey);
  if (cached) return cached;

  // 1. Seed from the default style for this family (may be absent).
  const defaultRaw = registry.defaults.get(family);
  const result: ResolvedStyle = {
    textProps: new Map(defaultRaw?.textProps),
    paragraphProps: new Map(defaultRaw?.paragraphProps),
    cellProps: new Map(defaultRaw?.cellProps),
    graphicProps: new Map(defaultRaw?.graphicProps),
  };

  // 2. Find the starting style — automatic overrides named for same key.
  const current: RawStyle | undefined =
    registry.automatic.get(cacheKey) ?? registry.named.get(cacheKey);

  if (!current) {
    // Style not found; cache the defaults-only result.
    registry.cache.set(cacheKey, result);
    return result;
  }

  // 3. Build the chain from outermost ancestor down to current.
  //    Parent lookups are always in named only (ODF spec §16.1).
  const chain: RawStyle[] = [];
  let node: RawStyle | undefined = current;
  while (node) {
    chain.unshift(node); // prepend → chain[0] is outermost
    const parentName = node.parentName;
    if (!parentName) break;
    node = registry.named.get(`${family}:${parentName}`);
  }

  // 4. Apply chain: outermost first so child properties overwrite.
  for (const raw of chain) {
    for (const [k, v] of raw.textProps) result.textProps.set(k, v);
    for (const [k, v] of raw.paragraphProps) result.paragraphProps.set(k, v);
    for (const [k, v] of raw.cellProps) result.cellProps.set(k, v);
    for (const [k, v] of raw.graphicProps) result.graphicProps.set(k, v);
  }

  // 5. Cache and return.
  registry.cache.set(cacheKey, result);
  return result;
}

// ============================================================
// Font family resolution helper
// ============================================================

/**
 * Resolve a font name to a CSS-ready font-family string.
 *
 * ODF priority order (§15.4.26 and §15.4.27):
 *  1. fo:font-family — a direct CSS font-family value; use as-is.
 *  2. style:font-name — a reference into office:font-face-decls;
 *     resolve through the fontFaces map to get svg:font-family.
 *
 * Returns undefined if neither attribute is present or if style:font-name
 * does not resolve to a known font face.
 *
 * @param textProps - The resolved textProps Map for a style.
 * @param fontFaces - The registry's fontFaces map.
 * @returns CSS font-family string, or undefined if not set.
 */
export function resolveFontFamily(
  textProps: Map<string, string>,
  fontFaces: Map<string, string>,
): string | undefined {
  const direct = textProps.get("fo:font-family");
  if (direct) return direct;

  const fontName = textProps.get("style:font-name");
  if (fontName) return fontFaces.get(fontName);

  return undefined;
}
