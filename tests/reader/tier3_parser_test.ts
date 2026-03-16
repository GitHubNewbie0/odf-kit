import { zipSync, strToU8 } from "fflate";
import { readOdt } from "../../src/reader/parser.js";
import type {
  ParagraphNode,
  HeadingNode,
  SectionNode,
  TrackedChangeNode,
} from "../../src/reader/types.js";

// ============================================================
// Minimal ODT builder helpers
// ============================================================

/**
 * Build a minimal content.xml string.
 *
 * @param autoStyles - XML for office:automatic-styles children (styles).
 * @param body       - XML for office:text children (body nodes).
 */
function contentXml(autoStyles: string, body: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<office:document-content" +
    ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
    ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
    ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
    ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"' +
    ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"' +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    `<office:automatic-styles>${autoStyles}</office:automatic-styles>` +
    "<office:body>" +
    `<office:text>${body}</office:text>` +
    "</office:body>" +
    "</office:document-content>"
  );
}

/**
 * Build a minimal styles.xml string with a page layout and master page.
 *
 * @param pageLayoutProps - Attributes for style:page-layout-properties.
 * @param headerBody      - XML for style:header children (body nodes).
 * @param footerBody      - XML for style:footer children (body nodes).
 * @param firstHeaderBody - XML for style:header-first children (or empty).
 * @param firstFooterBody - XML for style:footer-first children (or empty).
 */
function stylesXml(
  pageLayoutProps: string,
  headerBody = "",
  footerBody = "",
  firstHeaderBody = "",
  firstFooterBody = "",
): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<office:document-styles" +
    ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
    ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
    ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
    ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">' +
    "<office:automatic-styles>" +
    '<style:page-layout style:name="pm1">' +
    `<style:page-layout-properties ${pageLayoutProps}/>` +
    "</style:page-layout>" +
    "</office:automatic-styles>" +
    "<office:master-styles>" +
    '<style:master-page style:name="Standard" style:page-layout-name="pm1">' +
    (headerBody ? `<style:header>${headerBody}</style:header>` : "") +
    (footerBody ? `<style:footer>${footerBody}</style:footer>` : "") +
    (firstHeaderBody ? `<style:header-first>${firstHeaderBody}</style:header-first>` : "") +
    (firstFooterBody ? `<style:footer-first>${firstFooterBody}</style:footer-first>` : "") +
    "</style:master-page>" +
    "</office:master-styles>" +
    "</office:document-styles>"
  );
}

/**
 * Build a minimal ODT ZIP and return it as Uint8Array.
 * content.xml is required; styles.xml is optional.
 */
function makeOdt(content: string, styles?: string): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "content.xml": strToU8(content),
    "META-INF/manifest.xml": strToU8(
      '<?xml version="1.0"?>' +
        '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">' +
        '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>' +
        "</manifest:manifest>",
    ),
  };
  if (styles) files["styles.xml"] = strToU8(styles);
  return zipSync(files);
}

// ============================================================
// ParagraphStyle — extraction from paragraph properties
// ============================================================

describe("readOdt Tier 3 — ParagraphStyle extraction", () => {
  test("fo:text-align is extracted into paragraphStyle.textAlign", () => {
    const content = contentXml(
      '<style:style style:name="P1" style:family="paragraph">' +
        '<style:paragraph-properties fo:text-align="center"/>' +
        "</style:style>",
      '<text:p text:style-name="P1">aligned</text:p>',
    );
    const doc = readOdt(makeOdt(content));
    const para = doc.body.find((n) => n.kind === "paragraph") as ParagraphNode | undefined;
    expect(para?.paragraphStyle?.textAlign).toBe("center");
  });

  test("fo:text-align start and end values are preserved verbatim", () => {
    for (const value of ["start", "end"]) {
      const content = contentXml(
        `<style:style style:name="P1" style:family="paragraph">` +
          `<style:paragraph-properties fo:text-align="${value}"/>` +
          `</style:style>`,
        '<text:p text:style-name="P1">x</text:p>',
      );
      const doc = readOdt(makeOdt(content));
      const para = doc.body.find((n) => n.kind === "paragraph") as ParagraphNode | undefined;
      expect(para?.paragraphStyle?.textAlign).toBe(value);
    }
  });

  test("fo:margin-left is extracted into paragraphStyle.marginLeft", () => {
    const content = contentXml(
      '<style:style style:name="P1" style:family="paragraph">' +
        '<style:paragraph-properties fo:margin-left="1.5cm"/>' +
        "</style:style>",
      '<text:p text:style-name="P1">x</text:p>',
    );
    const doc = readOdt(makeOdt(content));
    const para = doc.body.find((n) => n.kind === "paragraph") as ParagraphNode | undefined;
    expect(para?.paragraphStyle?.marginLeft).toBe("1.5cm");
  });

  test("fo:margin-right is extracted into paragraphStyle.marginRight", () => {
    const content = contentXml(
      '<style:style style:name="P1" style:family="paragraph">' +
        '<style:paragraph-properties fo:margin-right="2cm"/>' +
        "</style:style>",
      '<text:p text:style-name="P1">x</text:p>',
    );
    const doc = readOdt(makeOdt(content));
    const para = doc.body.find((n) => n.kind === "paragraph") as ParagraphNode | undefined;
    expect(para?.paragraphStyle?.marginRight).toBe("2cm");
  });

  test("fo:margin-top is extracted into paragraphStyle.marginTop", () => {
    const content = contentXml(
      '<style:style style:name="P1" style:family="paragraph">' +
        '<style:paragraph-properties fo:margin-top="0.5cm"/>' +
        "</style:style>",
      '<text:p text:style-name="P1">x</text:p>',
    );
    const doc = readOdt(makeOdt(content));
    const para = doc.body.find((n) => n.kind === "paragraph") as ParagraphNode | undefined;
    expect(para?.paragraphStyle?.marginTop).toBe("0.5cm");
  });

  test("fo:space-before maps to paragraphStyle.marginTop", () => {
    const content = contentXml(
      '<style:style style:name="P1" style:family="paragraph">' +
        '<style:paragraph-properties fo:space-before="0.3cm"/>' +
        "</style:style>",
      '<text:p text:style-name="P1">x</text:p>',
    );
    const doc = readOdt(makeOdt(content));
    const para = doc.body.find((n) => n.kind === "paragraph") as ParagraphNode | undefined;
    expect(para?.paragraphStyle?.marginTop).toBe("0.3cm");
  });

  test("fo:margin-top takes precedence over fo:space-before", () => {
    const content = contentXml(
      '<style:style style:name="P1" style:family="paragraph">' +
        '<style:paragraph-properties fo:margin-top="1cm" fo:space-before="0.2cm"/>' +
        "</style:style>",
      '<text:p text:style-name="P1">x</text:p>',
    );
    const doc = readOdt(makeOdt(content));
    const para = doc.body.find((n) => n.kind === "paragraph") as ParagraphNode | undefined;
    expect(para?.paragraphStyle?.marginTop).toBe("1cm");
  });

  test("fo:margin-bottom is extracted into paragraphStyle.marginBottom", () => {
    const content = contentXml(
      '<style:style style:name="P1" style:family="paragraph">' +
        '<style:paragraph-properties fo:margin-bottom="0.5cm"/>' +
        "</style:style>",
      '<text:p text:style-name="P1">x</text:p>',
    );
    const doc = readOdt(makeOdt(content));
    const para = doc.body.find((n) => n.kind === "paragraph") as ParagraphNode | undefined;
    expect(para?.paragraphStyle?.marginBottom).toBe("0.5cm");
  });

  test("fo:space-after maps to paragraphStyle.marginBottom", () => {
    const content = contentXml(
      '<style:style style:name="P1" style:family="paragraph">' +
        '<style:paragraph-properties fo:space-after="0.4cm"/>' +
        "</style:style>",
      '<text:p text:style-name="P1">x</text:p>',
    );
    const doc = readOdt(makeOdt(content));
    const para = doc.body.find((n) => n.kind === "paragraph") as ParagraphNode | undefined;
    expect(para?.paragraphStyle?.marginBottom).toBe("0.4cm");
  });

  test("fo:line-height is extracted into paragraphStyle.lineHeight", () => {
    const content = contentXml(
      '<style:style style:name="P1" style:family="paragraph">' +
        '<style:paragraph-properties fo:line-height="150%"/>' +
        "</style:style>",
      '<text:p text:style-name="P1">x</text:p>',
    );
    const doc = readOdt(makeOdt(content));
    const para = doc.body.find((n) => n.kind === "paragraph") as ParagraphNode | undefined;
    expect(para?.paragraphStyle?.lineHeight).toBe("150%");
  });

  test("paragraphStyle is absent when no paragraph properties are set", () => {
    const content = contentXml(
      '<style:style style:name="P1" style:family="paragraph">' +
        '<style:text-properties fo:font-size="12pt"/>' +
        "</style:style>",
      '<text:p text:style-name="P1">x</text:p>',
    );
    const doc = readOdt(makeOdt(content));
    const para = doc.body.find((n) => n.kind === "paragraph") as ParagraphNode | undefined;
    expect(para?.paragraphStyle).toBeUndefined();
  });

  test("paragraphStyle is set on headings too", () => {
    const content = contentXml(
      '<style:style style:name="H1" style:family="paragraph">' +
        '<style:paragraph-properties fo:text-align="center"/>' +
        "</style:style>",
      '<text:h text:outline-level="1" text:style-name="H1">Title</text:h>',
    );
    const doc = readOdt(makeOdt(content));
    const heading = doc.body.find((n) => n.kind === "heading") as HeadingNode | undefined;
    expect(heading?.paragraphStyle?.textAlign).toBe("center");
  });
});

// ============================================================
// Page layout — parsePageLayout
// ============================================================

describe("readOdt Tier 3 — page layout", () => {
  test("pageLayout is undefined when no styles.xml present", () => {
    const content = contentXml("", "<text:p>x</text:p>");
    const doc = readOdt(makeOdt(content)); // no styles.xml
    expect(doc.pageLayout).toBeUndefined();
  });

  test("parses fo:page-width into pageLayout.width", () => {
    const doc = readOdt(
      makeOdt(contentXml("", "<text:p>x</text:p>"), stylesXml('fo:page-width="21cm"')),
    );
    expect(doc.pageLayout?.width).toBe("21cm");
  });

  test("parses fo:page-height into pageLayout.height", () => {
    const doc = readOdt(
      makeOdt(contentXml("", "<text:p>x</text:p>"), stylesXml('fo:page-height="29.7cm"')),
    );
    expect(doc.pageLayout?.height).toBe("29.7cm");
  });

  test("parses all four margin properties", () => {
    const doc = readOdt(
      makeOdt(
        contentXml("", "<text:p>x</text:p>"),
        stylesXml(
          'fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2.5cm" fo:margin-right="2.5cm"',
        ),
      ),
    );
    expect(doc.pageLayout?.marginTop).toBe("2cm");
    expect(doc.pageLayout?.marginBottom).toBe("2cm");
    expect(doc.pageLayout?.marginLeft).toBe("2.5cm");
    expect(doc.pageLayout?.marginRight).toBe("2.5cm");
  });

  test("orientation is portrait when height > width", () => {
    const doc = readOdt(
      makeOdt(
        contentXml("", "<text:p>x</text:p>"),
        stylesXml('fo:page-width="21cm" fo:page-height="29.7cm"'),
      ),
    );
    expect(doc.pageLayout?.orientation).toBe("portrait");
  });

  test("orientation is landscape when width > height", () => {
    const doc = readOdt(
      makeOdt(
        contentXml("", "<text:p>x</text:p>"),
        stylesXml('fo:page-width="29.7cm" fo:page-height="21cm"'),
      ),
    );
    expect(doc.pageLayout?.orientation).toBe("landscape");
  });

  test("full A4 portrait page layout", () => {
    const doc = readOdt(
      makeOdt(
        contentXml("", "<text:p>x</text:p>"),
        stylesXml(
          'fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="2.54cm" fo:margin-bottom="2.54cm" fo:margin-left="2.54cm" fo:margin-right="2.54cm"',
        ),
      ),
    );
    expect(doc.pageLayout?.width).toBe("21cm");
    expect(doc.pageLayout?.height).toBe("29.7cm");
    expect(doc.pageLayout?.marginTop).toBe("2.54cm");
    expect(doc.pageLayout?.orientation).toBe("portrait");
  });
});

// ============================================================
// Headers and footers
// ============================================================

describe("readOdt Tier 3 — headers and footers", () => {
  test("header is undefined when no header in master page", () => {
    const doc = readOdt(
      makeOdt(contentXml("", "<text:p>x</text:p>"), stylesXml('fo:page-width="21cm"')),
    );
    expect(doc.header).toBeUndefined();
  });

  test("footer is undefined when no footer in master page", () => {
    const doc = readOdt(
      makeOdt(contentXml("", "<text:p>x</text:p>"), stylesXml('fo:page-width="21cm"')),
    );
    expect(doc.footer).toBeUndefined();
  });

  test("parses default header content as BodyNode[]", () => {
    const doc = readOdt(
      makeOdt(
        contentXml("", "<text:p>body</text:p>"),
        stylesXml('fo:page-width="21cm"', "<text:p>header text</text:p>"),
      ),
    );
    expect(doc.header).toBeDefined();
    expect(doc.header).toHaveLength(1);
    const para = doc.header![0] as ParagraphNode;
    expect(para.kind).toBe("paragraph");
    const textNode = para.spans.find((s) => !("kind" in s)) as { text: string } | undefined;
    expect(textNode?.text).toBe("header text");
  });

  test("parses default footer content as BodyNode[]", () => {
    const doc = readOdt(
      makeOdt(
        contentXml("", "<text:p>body</text:p>"),
        stylesXml('fo:page-width="21cm"', "", "<text:p>footer text</text:p>"),
      ),
    );
    expect(doc.footer).toBeDefined();
    expect(doc.footer).toHaveLength(1);
    const para = doc.footer![0] as ParagraphNode;
    const textNode = para.spans.find((s) => !("kind" in s)) as { text: string } | undefined;
    expect(textNode?.text).toBe("footer text");
  });

  test("parses first-page header content", () => {
    const doc = readOdt(
      makeOdt(
        contentXml("", "<text:p>body</text:p>"),
        stylesXml(
          'fo:page-width="21cm"',
          "<text:p>default header</text:p>",
          "",
          "<text:p>first page header</text:p>",
        ),
      ),
    );
    expect(doc.firstPageHeader).toBeDefined();
    const para = doc.firstPageHeader![0] as ParagraphNode;
    const textNode = para.spans.find((s) => !("kind" in s)) as { text: string } | undefined;
    expect(textNode?.text).toBe("first page header");
  });

  test("parses first-page footer content", () => {
    const doc = readOdt(
      makeOdt(
        contentXml("", "<text:p>body</text:p>"),
        stylesXml(
          'fo:page-width="21cm"',
          "",
          "<text:p>default footer</text:p>",
          "",
          "<text:p>first page footer</text:p>",
        ),
      ),
    );
    expect(doc.firstPageFooter).toBeDefined();
    const para = doc.firstPageFooter![0] as ParagraphNode;
    const textNode = para.spans.find((s) => !("kind" in s)) as { text: string } | undefined;
    expect(textNode?.text).toBe("first page footer");
  });

  test("header and footer are independent", () => {
    const doc = readOdt(
      makeOdt(
        contentXml("", "<text:p>body</text:p>"),
        stylesXml(
          'fo:page-width="21cm"',
          "<text:p>the header</text:p>",
          "<text:p>the footer</text:p>",
        ),
      ),
    );
    expect(doc.header).toBeDefined();
    expect(doc.footer).toBeDefined();
    const headerText = (doc.header![0] as ParagraphNode).spans.find((s) => !("kind" in s)) as
      | { text: string }
      | undefined;
    const footerText = (doc.footer![0] as ParagraphNode).spans.find((s) => !("kind" in s)) as
      | { text: string }
      | undefined;
    expect(headerText?.text).toBe("the header");
    expect(footerText?.text).toBe("the footer");
  });
});

// ============================================================
// SectionNode
// ============================================================

describe("readOdt Tier 3 — SectionNode", () => {
  test("text:section is surfaced as SectionNode in body", () => {
    const content = contentXml(
      "",
      '<text:section text:name="MySection"><text:p>section content</text:p></text:section>',
    );
    const doc = readOdt(makeOdt(content));
    const section = doc.body.find((n) => n.kind === "section") as SectionNode | undefined;
    expect(section).toBeDefined();
    expect(section?.kind).toBe("section");
  });

  test("section name is preserved on SectionNode", () => {
    const content = contentXml(
      "",
      '<text:section text:name="Introduction"><text:p>x</text:p></text:section>',
    );
    const doc = readOdt(makeOdt(content));
    const section = doc.body.find((n) => n.kind === "section") as SectionNode | undefined;
    expect(section?.name).toBe("Introduction");
  });

  test("section body contains its child paragraphs", () => {
    const content = contentXml(
      "",
      '<text:section text:name="S1">' +
        "<text:p>first</text:p>" +
        "<text:p>second</text:p>" +
        "</text:section>",
    );
    const doc = readOdt(makeOdt(content));
    const section = doc.body.find((n) => n.kind === "section") as SectionNode | undefined;
    expect(section?.body).toHaveLength(2);
    expect(section?.body[0].kind).toBe("paragraph");
    expect(section?.body[1].kind).toBe("paragraph");
  });

  test("section without a name has undefined name", () => {
    const content = contentXml("", "<text:section><text:p>x</text:p></text:section>");
    const doc = readOdt(makeOdt(content));
    const section = doc.body.find((n) => n.kind === "section") as SectionNode | undefined;
    expect(section?.name).toBeUndefined();
  });

  test("nodes before and after a section are preserved at body level", () => {
    const content = contentXml(
      "",
      "<text:p>before</text:p>" +
        '<text:section text:name="S1"><text:p>inside</text:p></text:section>' +
        "<text:p>after</text:p>",
    );
    const doc = readOdt(makeOdt(content));
    expect(doc.body[0].kind).toBe("paragraph");
    expect(doc.body[1].kind).toBe("section");
    expect(doc.body[2].kind).toBe("paragraph");
  });
});

// ============================================================
// Tracked changes — "final" mode (default)
// ============================================================

describe("readOdt Tier 3 — tracked changes final mode", () => {
  test("default mode includes insertion content as normal body nodes", () => {
    const content = contentXml(
      "",
      "<text:tracked-changes>" +
        '<text:changed-region text:id="ct1">' +
        "<text:insertion><dc:creator>Alice</dc:creator></text:insertion>" +
        "</text:changed-region>" +
        "</text:tracked-changes>" +
        '<text:change-start text:change-id="ct1"/>' +
        "<text:p>inserted paragraph</text:p>" +
        '<text:change-end text:change-id="ct1"/>',
    );
    const doc = readOdt(makeOdt(content));
    // Insertion content included normally, no TrackedChangeNode emitted
    const tc = doc.body.find((n) => n.kind === "tracked-change");
    expect(tc).toBeUndefined();
    const para = doc.body.find((n) => n.kind === "paragraph") as ParagraphNode | undefined;
    expect(para).toBeDefined();
  });

  test("default mode suppresses deletion content", () => {
    const content = contentXml(
      "",
      "<text:tracked-changes>" +
        '<text:changed-region text:id="ct2">' +
        "<text:deletion>" +
        "<dc:creator>Bob</dc:creator>" +
        "<text:p>deleted paragraph</text:p>" +
        "</text:deletion>" +
        "</text:changed-region>" +
        "</text:tracked-changes>" +
        "<text:p>kept paragraph</text:p>" +
        '<text:change text:change-id="ct2"/>',
    );
    const doc = readOdt(makeOdt(content));
    // Only the kept paragraph; deleted content not in body
    const paras = doc.body.filter((n) => n.kind === "paragraph") as ParagraphNode[];
    const texts = paras.map((p) =>
      p.spans
        .filter((s) => !("kind" in s))
        .map((s) => (s as { text: string }).text)
        .join(""),
    );
    expect(texts).toContain("kept paragraph");
    expect(texts).not.toContain("deleted paragraph");
  });

  test("explicit final mode behaves identically to default", () => {
    const content = contentXml(
      "",
      "<text:tracked-changes>" +
        '<text:changed-region text:id="ct3">' +
        "<text:deletion>" +
        "<dc:creator>Carol</dc:creator>" +
        "<text:p>deleted</text:p>" +
        "</text:deletion>" +
        "</text:changed-region>" +
        "</text:tracked-changes>" +
        "<text:p>kept</text:p>" +
        '<text:change text:change-id="ct3"/>',
    );
    const defaultDoc = readOdt(makeOdt(content));
    const explicitDoc = readOdt(makeOdt(content), { trackedChanges: "final" });
    expect(defaultDoc.body.length).toBe(explicitDoc.body.length);
  });
});

// ============================================================
// Tracked changes — "original" mode
// ============================================================

describe("readOdt Tier 3 — tracked changes original mode", () => {
  test("original mode suppresses insertion content", () => {
    const content = contentXml(
      "",
      "<text:tracked-changes>" +
        '<text:changed-region text:id="ct1">' +
        "<text:insertion><dc:creator>Alice</dc:creator></text:insertion>" +
        "</text:changed-region>" +
        "</text:tracked-changes>" +
        "<text:p>before</text:p>" +
        '<text:change-start text:change-id="ct1"/>' +
        "<text:p>inserted — should be suppressed</text:p>" +
        '<text:change-end text:change-id="ct1"/>' +
        "<text:p>after</text:p>",
    );
    const doc = readOdt(makeOdt(content), { trackedChanges: "original" });
    const paras = doc.body.filter((n) => n.kind === "paragraph") as ParagraphNode[];
    const texts = paras.map((p) =>
      p.spans
        .filter((s) => !("kind" in s))
        .map((s) => (s as { text: string }).text)
        .join(""),
    );
    expect(texts).toContain("before");
    expect(texts).toContain("after");
    expect(texts).not.toContain("inserted — should be suppressed");
  });

  test("original mode restores deletion content at change marker position", () => {
    const content = contentXml(
      "",
      "<text:tracked-changes>" +
        '<text:changed-region text:id="ct2">' +
        "<text:deletion>" +
        "<dc:creator>Bob</dc:creator>" +
        "<text:p>restored deletion</text:p>" +
        "</text:deletion>" +
        "</text:changed-region>" +
        "</text:tracked-changes>" +
        "<text:p>kept</text:p>" +
        '<text:change text:change-id="ct2"/>',
    );
    const doc = readOdt(makeOdt(content), { trackedChanges: "original" });
    const paras = doc.body.filter((n) => n.kind === "paragraph") as ParagraphNode[];
    const texts = paras.map((p) =>
      p.spans
        .filter((s) => !("kind" in s))
        .map((s) => (s as { text: string }).text)
        .join(""),
    );
    expect(texts).toContain("kept");
    expect(texts).toContain("restored deletion");
  });

  test("original mode emits no TrackedChangeNode values", () => {
    const content = contentXml(
      "",
      "<text:tracked-changes>" +
        '<text:changed-region text:id="ct3">' +
        "<text:insertion><dc:creator>X</dc:creator></text:insertion>" +
        "</text:changed-region>" +
        "</text:tracked-changes>" +
        '<text:change-start text:change-id="ct3"/>' +
        "<text:p>inserted</text:p>" +
        '<text:change-end text:change-id="ct3"/>',
    );
    const doc = readOdt(makeOdt(content), { trackedChanges: "original" });
    expect(doc.body.find((n) => n.kind === "tracked-change")).toBeUndefined();
  });
});

// ============================================================
// Tracked changes — "changes" mode
// ============================================================

describe("readOdt Tier 3 — tracked changes changes mode", () => {
  test("changes mode emits TrackedChangeNode for deletion at text:change position", () => {
    const content = contentXml(
      "",
      "<text:tracked-changes>" +
        '<text:changed-region text:id="ct1">' +
        "<text:deletion>" +
        "<dc:creator>Alice</dc:creator>" +
        "<dc:date>2026-01-15T10:00:00</dc:date>" +
        "<text:p>deleted content</text:p>" +
        "</text:deletion>" +
        "</text:changed-region>" +
        "</text:tracked-changes>" +
        "<text:p>normal paragraph</text:p>" +
        '<text:change text:change-id="ct1"/>',
    );
    const doc = readOdt(makeOdt(content), { trackedChanges: "changes" });
    const tc = doc.body.find((n) => n.kind === "tracked-change") as TrackedChangeNode | undefined;
    expect(tc).toBeDefined();
    expect(tc?.changeType).toBe("deletion");
    expect(tc?.changeId).toBe("ct1");
    expect(tc?.author).toBe("Alice");
    expect(tc?.date).toBe("2026-01-15T10:00:00");
  });

  test("deletion TrackedChangeNode contains the deleted body content", () => {
    const content = contentXml(
      "",
      "<text:tracked-changes>" +
        '<text:changed-region text:id="ct2">' +
        "<text:deletion>" +
        "<dc:creator>Bob</dc:creator>" +
        "<text:p>deleted paragraph</text:p>" +
        "</text:deletion>" +
        "</text:changed-region>" +
        "</text:tracked-changes>" +
        '<text:change text:change-id="ct2"/>',
    );
    const doc = readOdt(makeOdt(content), { trackedChanges: "changes" });
    const tc = doc.body.find((n) => n.kind === "tracked-change") as TrackedChangeNode | undefined;
    expect(tc?.body).toHaveLength(1);
    expect(tc?.body[0].kind).toBe("paragraph");
  });

  test("changes mode emits TrackedChangeNode for block-spanning insertion", () => {
    const content = contentXml(
      "",
      "<text:tracked-changes>" +
        '<text:changed-region text:id="ct3">' +
        "<text:insertion><dc:creator>Carol</dc:creator></text:insertion>" +
        "</text:changed-region>" +
        "</text:tracked-changes>" +
        '<text:change-start text:change-id="ct3"/>' +
        "<text:p>inserted paragraph</text:p>" +
        '<text:change-end text:change-id="ct3"/>',
    );
    const doc = readOdt(makeOdt(content), { trackedChanges: "changes" });
    const tc = doc.body.find((n) => n.kind === "tracked-change") as TrackedChangeNode | undefined;
    expect(tc).toBeDefined();
    expect(tc?.changeType).toBe("insertion");
    expect(tc?.changeId).toBe("ct3");
    expect(tc?.author).toBe("Carol");
  });

  test("insertion TrackedChangeNode body contains the inserted paragraphs", () => {
    const content = contentXml(
      "",
      "<text:tracked-changes>" +
        '<text:changed-region text:id="ct4">' +
        "<text:insertion><dc:creator>Dave</dc:creator></text:insertion>" +
        "</text:changed-region>" +
        "</text:tracked-changes>" +
        '<text:change-start text:change-id="ct4"/>' +
        "<text:p>first inserted</text:p>" +
        "<text:p>second inserted</text:p>" +
        '<text:change-end text:change-id="ct4"/>',
    );
    const doc = readOdt(makeOdt(content), { trackedChanges: "changes" });
    const tc = doc.body.find((n) => n.kind === "tracked-change") as TrackedChangeNode | undefined;
    expect(tc?.body).toHaveLength(2);
    expect(tc?.body[0].kind).toBe("paragraph");
    expect(tc?.body[1].kind).toBe("paragraph");
  });

  test("insertion content not duplicated as separate body nodes", () => {
    const content = contentXml(
      "",
      "<text:tracked-changes>" +
        '<text:changed-region text:id="ct5">' +
        "<text:insertion><dc:creator>Eve</dc:creator></text:insertion>" +
        "</text:changed-region>" +
        "</text:tracked-changes>" +
        '<text:change-start text:change-id="ct5"/>' +
        "<text:p>only inside tc node</text:p>" +
        '<text:change-end text:change-id="ct5"/>',
    );
    const doc = readOdt(makeOdt(content), { trackedChanges: "changes" });
    // The inserted paragraph should be inside the TrackedChangeNode body,
    // not also as a standalone paragraph in doc.body
    const standaloneParagraphs = doc.body.filter((n) => n.kind === "paragraph");
    expect(standaloneParagraphs).toHaveLength(0);
    const tc = doc.body.find((n) => n.kind === "tracked-change") as TrackedChangeNode;
    expect(tc?.body).toHaveLength(1);
  });

  test("format-change TrackedChangeNode has empty body", () => {
    const content = contentXml(
      "",
      "<text:tracked-changes>" +
        '<text:changed-region text:id="ct6">' +
        "<text:format-change><dc:creator>Frank</dc:creator></text:format-change>" +
        "</text:changed-region>" +
        "</text:tracked-changes>" +
        "<text:p>paragraph</text:p>" +
        '<text:change text:change-id="ct6"/>',
    );
    const doc = readOdt(makeOdt(content), { trackedChanges: "changes" });
    const tc = doc.body.find((n) => n.kind === "tracked-change") as TrackedChangeNode | undefined;
    expect(tc?.changeType).toBe("format-change");
    expect(tc?.body).toHaveLength(0);
  });

  test("normal body nodes coexist with TrackedChangeNode values", () => {
    const content = contentXml(
      "",
      "<text:tracked-changes>" +
        '<text:changed-region text:id="ct7">' +
        "<text:deletion><dc:creator>G</dc:creator><text:p>deleted</text:p></text:deletion>" +
        "</text:changed-region>" +
        "</text:tracked-changes>" +
        "<text:p>before</text:p>" +
        '<text:change text:change-id="ct7"/>' +
        "<text:p>after</text:p>",
    );
    const doc = readOdt(makeOdt(content), { trackedChanges: "changes" });
    expect(doc.body).toHaveLength(3); // before para + TrackedChangeNode + after para
    expect(doc.body[0].kind).toBe("paragraph");
    expect(doc.body[1].kind).toBe("tracked-change");
    expect(doc.body[2].kind).toBe("paragraph");
  });
});

// ============================================================
// registry.ts Tier 3 — graphicProps bag
// ============================================================

describe("buildRegistry Tier 3 — graphicProps", () => {
  // Import dynamically to keep the test focused on the public registry API
  test("style:graphic-properties attributes land in graphicProps", async () => {
    const { buildRegistry, resolve } = await import("../../src/reader/registry.js");
    const { parseXml } = await import("../../src/reader/xml-parser.js");

    const root = parseXml(
      "<office:document-content>" +
        "<office:automatic-styles>" +
        '<style:style style:name="fr1" style:family="graphic">' +
        '<style:graphic-properties style:wrap="left" style:run-through="foreground"/>' +
        "</style:style>" +
        "</office:automatic-styles>" +
        "</office:document-content>",
    );

    const registry = buildRegistry(root);
    const resolved = resolve(registry, "graphic", "fr1");
    expect(resolved.graphicProps.get("style:wrap")).toBe("left");
    expect(resolved.graphicProps.get("style:run-through")).toBe("foreground");
  });

  test("graphicProps is empty for styles with no graphic-properties element", async () => {
    const { buildRegistry, resolve } = await import("../../src/reader/registry.js");
    const { parseXml } = await import("../../src/reader/xml-parser.js");

    const root = parseXml(
      "<office:document-content>" +
        "<office:automatic-styles>" +
        '<style:style style:name="T1" style:family="text">' +
        '<style:text-properties fo:font-size="12pt"/>' +
        "</style:style>" +
        "</office:automatic-styles>" +
        "</office:document-content>",
    );

    const registry = buildRegistry(root);
    const resolved = resolve(registry, "text", "T1");
    expect(resolved.graphicProps.size).toBe(0);
  });

  test("graphicProps is inherited through style chain", async () => {
    const { buildRegistry, resolve } = await import("../../src/reader/registry.js");
    const { parseXml } = await import("../../src/reader/xml-parser.js");

    const root = parseXml(
      "<office:document-content>" +
        "<office:styles>" +
        '<style:style style:name="GraphicsBase" style:family="graphic">' +
        '<style:graphic-properties style:wrap="none"/>' +
        "</style:style>" +
        "</office:styles>" +
        "<office:automatic-styles>" +
        '<style:style style:name="fr1" style:family="graphic" style:parent-style-name="GraphicsBase">' +
        "</style:style>" +
        "</office:automatic-styles>" +
        "</office:document-content>",
    );

    const registry = buildRegistry(root);
    const resolved = resolve(registry, "graphic", "fr1");
    expect(resolved.graphicProps.get("style:wrap")).toBe("none");
  });
});
