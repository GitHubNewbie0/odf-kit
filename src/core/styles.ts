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

  // Office styles container (default styles)
  root.appendChild(el("office:styles"));

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
