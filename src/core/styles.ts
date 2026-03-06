import { ODF_NS, ODF_VERSION } from "./namespaces.js";
import { el, xmlDocument } from "./xml.js";
import type { XmlElement } from "./xml.js";

/** Options for styles.xml generation. */
export interface StylesConfig {
  /** Page layout settings (all values pre-resolved with defaults). */
  pageLayout?: {
    width: string;
    height: string;
    orientation: "portrait" | "landscape";
    marginTop: string;
    marginBottom: string;
    marginLeft: string;
    marginRight: string;
  };

  /** Complete header paragraph element, or null for no header. */
  headerParagraph?: XmlElement | null;

  /** Complete footer paragraph element, or null for no footer. */
  footerParagraph?: XmlElement | null;

  /**
   * Text styles needed by header/footer content.
   * These go into office:automatic-styles inside styles.xml.
   */
  headerFooterStyles?: XmlElement[];
}

// ─── Heading definitions ──────────────────────────────────────────────

interface HeadingDef {
  level: number;
  fontSize: string;
  marginTop: string;
  marginBottom: string;
}

const HEADING_DEFS: HeadingDef[] = [
  { level: 1, fontSize: "28pt", marginTop: "0.423cm", marginBottom: "0.212cm" },
  { level: 2, fontSize: "24pt", marginTop: "0.353cm", marginBottom: "0.212cm" },
  { level: 3, fontSize: "20pt", marginTop: "0.247cm", marginBottom: "0.212cm" },
  { level: 4, fontSize: "14pt", marginTop: "0.212cm", marginBottom: "0.141cm" },
  { level: 5, fontSize: "13pt", marginTop: "0.212cm", marginBottom: "0.141cm" },
  { level: 6, fontSize: "12pt", marginTop: "0.212cm", marginBottom: "0.141cm" },
];

// ─── Named style builders ─────────────────────────────────────────────

/**
 * Build the Standard paragraph style — root of the style hierarchy.
 * Sets the base font size (with Asian/Complex tripling) and a small
 * bottom margin that matches LibreOffice's default paragraph spacing.
 */
function buildStandardStyle(): XmlElement {
  const style = el("style:style")
    .attr("style:name", "Standard")
    .attr("style:family", "paragraph")
    .attr("style:class", "text");

  style.appendChild(el("style:paragraph-properties").attr("fo:margin-bottom", "0.212cm"));

  style.appendChild(
    el("style:text-properties")
      .attr("style:font-name", "Liberation Serif")
      .attr("fo:font-size", "12pt")
      .attr("style:font-name-asian", "Liberation Serif")
      .attr("style:font-size-asian", "12pt")
      .attr("style:font-name-complex", "Liberation Serif")
      .attr("style:font-size-complex", "12pt"),
  );

  return style;
}

/**
 * Build the Heading parent style — ancestor of all Heading_20_N styles.
 * Carries bold weight (with Asian/Complex tripling) and keep-with-next
 * so no heading level has to repeat these properties.
 */
function buildHeadingParentStyle(): XmlElement {
  const style = el("style:style")
    .attr("style:name", "Heading")
    .attr("style:family", "paragraph")
    .attr("style:class", "chapter")
    .attr("style:parent-style-name", "Standard")
    .attr("style:next-style-name", "Standard");

  style.appendChild(el("style:paragraph-properties").attr("fo:keep-with-next", "always"));

  style.appendChild(
    el("style:text-properties")
      .attr("fo:font-weight", "bold")
      .attr("style:font-weight-asian", "bold")
      .attr("style:font-weight-complex", "bold"),
  );

  return style;
}

/**
 * Build a single Heading_20_N style (level 1–6).
 * Font size and margins are level-specific; bold and keep-with-next
 * are inherited from the Heading parent.
 */
function buildHeadingStyle(def: HeadingDef): XmlElement {
  const style = el("style:style")
    .attr("style:name", `Heading_20_${def.level}`)
    .attr("style:display-name", `Heading ${def.level}`)
    .attr("style:family", "paragraph")
    .attr("style:class", "chapter")
    .attr("style:parent-style-name", "Heading")
    .attr("style:next-style-name", "Standard")
    .attr("style:default-outline-level", String(def.level));

  style.appendChild(
    el("style:paragraph-properties")
      .attr("fo:margin-top", def.marginTop)
      .attr("fo:margin-bottom", def.marginBottom),
  );

  // Font size only — bold is inherited from Heading parent.
  // Asian/Complex tripling required for CJK/RTL correctness.
  style.appendChild(
    el("style:text-properties")
      .attr("fo:font-size", def.fontSize)
      .attr("style:font-size-asian", def.fontSize)
      .attr("style:font-size-complex", def.fontSize),
  );

  return style;
}

/**
 * Build the List Bullet paragraph style used by bullet list items.
 */
function buildListBulletStyle(): XmlElement {
  return el("style:style")
    .attr("style:name", "List_20_Bullet")
    .attr("style:display-name", "List Bullet")
    .attr("style:family", "paragraph")
    .attr("style:class", "list")
    .attr("style:parent-style-name", "Standard");
}

/**
 * Build the List Number paragraph style used by numbered list items.
 */
function buildListNumberStyle(): XmlElement {
  return el("style:style")
    .attr("style:name", "List_20_Number")
    .attr("style:display-name", "List Number")
    .attr("style:family", "paragraph")
    .attr("style:class", "list")
    .attr("style:parent-style-name", "Standard");
}

/**
 * Build the Header paragraph style used in page headers.
 */
function buildHeaderStyle(): XmlElement {
  return el("style:style")
    .attr("style:name", "Header")
    .attr("style:family", "paragraph")
    .attr("style:class", "extra")
    .attr("style:parent-style-name", "Standard");
}

/**
 * Build the Footer paragraph style used in page footers.
 */
function buildFooterStyle(): XmlElement {
  return el("style:style")
    .attr("style:name", "Footer")
    .attr("style:family", "paragraph")
    .attr("style:class", "extra")
    .attr("style:parent-style-name", "Standard");
}

/**
 * Append all required named styles to the office:styles element.
 *
 * Every style referenced in content.xml must be defined here.
 * LibreOffice silently applies built-in fallbacks for missing named styles,
 * but strict ODF validators and non-LibreOffice readers require explicit
 * definitions.
 */
function appendNamedStyles(officeStyles: XmlElement): void {
  officeStyles.appendChild(buildStandardStyle());
  officeStyles.appendChild(buildHeadingParentStyle());
  for (const def of HEADING_DEFS) {
    officeStyles.appendChild(buildHeadingStyle(def));
  }
  officeStyles.appendChild(buildListBulletStyle());
  officeStyles.appendChild(buildListNumberStyle());
  officeStyles.appendChild(buildHeaderStyle());
  officeStyles.appendChild(buildFooterStyle());
}

// ─── Main export ──────────────────────────────────────────────────────

/**
 * Generate the styles.xml for an ODF document.
 *
 * @param config - Optional page layout, header, and footer settings.
 * @returns The serialized styles.xml string.
 */
export function generateStyles(config?: StylesConfig): string {
  const root = el("office:document-styles")
    .attr("xmlns:office", ODF_NS.office)
    .attr("xmlns:style", ODF_NS.style)
    .attr("xmlns:fo", ODF_NS.fo)
    .attr("xmlns:text", ODF_NS.text)
    .attr("xmlns:svg", ODF_NS.svg)
    .attr("office:version", ODF_VERSION);

  // Font face declarations — required for every font name referenced in
  // any style attribute (style:font-name, fo:font-family) in this file.
  const fontFaceDecls = el("office:font-face-decls");
  fontFaceDecls.appendChild(
    el("style:font-face")
      .attr("style:name", "Liberation Serif")
      .attr("svg:font-family", "'Liberation Serif'")
      .attr("style:font-family-generic", "roman")
      .attr("style:font-pitch", "variable"),
  );
  root.appendChild(fontFaceDecls);

  // Named styles — Standard, Heading hierarchy, list styles, header/footer styles.
  // All styles referenced in content.xml must be explicitly defined here.
  const officeStyles = el("office:styles");
  appendNamedStyles(officeStyles);
  root.appendChild(officeStyles);

  // Automatic styles — page layout + any header/footer text styles
  const autoStyles = el("office:automatic-styles");

  // Page layout
  const pl = config?.pageLayout;
  const pageLayout = el("style:page-layout").attr("style:name", "pm1");
  const pageProps = el("style:page-layout-properties")
    .attr("fo:page-width", pl?.width ?? "21cm")
    .attr("fo:page-height", pl?.height ?? "29.7cm")
    .attr("style:print-orientation", pl?.orientation ?? "portrait")
    .attr("fo:margin-top", pl?.marginTop ?? "2cm")
    .attr("fo:margin-bottom", pl?.marginBottom ?? "2cm")
    .attr("fo:margin-left", pl?.marginLeft ?? "2cm")
    .attr("fo:margin-right", pl?.marginRight ?? "2cm");
  pageLayout.appendChild(pageProps);

  // Header style (spacing) — only if header content exists
  if (config?.headerParagraph) {
    const headerStyle = el("style:header-style");
    headerStyle.appendChild(
      el("style:header-footer-properties")
        .attr("fo:min-height", "0.6cm")
        .attr("fo:margin-bottom", "0.5cm"),
    );
    pageLayout.appendChild(headerStyle);
  }

  // Footer style (spacing) — only if footer content exists
  if (config?.footerParagraph) {
    const footerStyle = el("style:footer-style");
    footerStyle.appendChild(
      el("style:header-footer-properties")
        .attr("fo:min-height", "0.6cm")
        .attr("fo:margin-top", "0.5cm"),
    );
    pageLayout.appendChild(footerStyle);
  }

  autoStyles.appendChild(pageLayout);

  // Add header/footer text styles (if any)
  if (config?.headerFooterStyles) {
    for (const style of config.headerFooterStyles) {
      autoStyles.appendChild(style);
    }
  }

  root.appendChild(autoStyles);

  // Master styles
  const masterStyles = el("office:master-styles");
  const masterPage = el("style:master-page")
    .attr("style:name", "Default")
    .attr("style:page-layout-name", "pm1");

  // Header content
  if (config?.headerParagraph) {
    const header = el("style:header");
    header.appendChild(config.headerParagraph);
    masterPage.appendChild(header);
  }

  // Footer content
  if (config?.footerParagraph) {
    const footer = el("style:footer");
    footer.appendChild(config.footerParagraph);
    masterPage.appendChild(footer);
  }

  masterStyles.appendChild(masterPage);
  root.appendChild(masterStyles);

  return xmlDocument(root);
}
