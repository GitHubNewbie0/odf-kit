import { parseXml } from "../../src/reader/xml-parser.js";
import { buildRegistry, resolve, resolveFontFamily } from "../../src/reader/registry.js";
import type { StyleRegistry } from "../../src/reader/registry.js";

// ============================================================
// Helpers
// ============================================================

/** Build a minimal office:document-content root with the given inner XML. */
function contentRoot(inner: string) {
  return parseXml(`<office:document-content>${inner}</office:document-content>`);
}

/** Build a minimal office:document-styles root with the given inner XML. */
function stylesRoot(inner: string) {
  return parseXml(`<office:document-styles>${inner}</office:document-styles>`);
}

// ============================================================
// buildRegistry — font faces
// ============================================================

describe("buildRegistry — font faces", () => {
  test("returns empty fontFaces for a document with no font-face-decls", () => {
    const registry = buildRegistry(contentRoot(""));
    expect(registry.fontFaces.size).toBe(0);
  });

  test("parses font faces from content.xml font-face-decls", () => {
    const root = contentRoot(
      "<office:font-face-decls>" +
        '<style:font-face style:name="Arial1" svg:font-family="Arial"/>' +
        "</office:font-face-decls>",
    );
    const registry = buildRegistry(root);
    expect(registry.fontFaces.get("Arial1")).toBe("Arial");
  });

  test("parses font faces from styles.xml font-face-decls", () => {
    const sRoot = stylesRoot(
      "<office:font-face-decls>" +
        '<style:font-face style:name="Times1" svg:font-family="\'Times New Roman\'"/>' +
        "</office:font-face-decls>",
    );
    const registry = buildRegistry(contentRoot(""), sRoot);
    expect(registry.fontFaces.get("Times1")).toBe("'Times New Roman'");
  });

  test("content.xml font face overrides styles.xml for same name", () => {
    const sRoot = stylesRoot(
      "<office:font-face-decls>" +
        '<style:font-face style:name="F1" svg:font-family="OldFamily"/>' +
        "</office:font-face-decls>",
    );
    const cRoot = contentRoot(
      "<office:font-face-decls>" +
        '<style:font-face style:name="F1" svg:font-family="NewFamily"/>' +
        "</office:font-face-decls>",
    );
    const registry = buildRegistry(cRoot, sRoot);
    expect(registry.fontFaces.get("F1")).toBe("NewFamily");
  });

  test("parses multiple font faces", () => {
    const root = contentRoot(
      "<office:font-face-decls>" +
        '<style:font-face style:name="A" svg:font-family="Arial"/>' +
        '<style:font-face style:name="B" svg:font-family="Verdana"/>' +
        "</office:font-face-decls>",
    );
    const registry = buildRegistry(root);
    expect(registry.fontFaces.size).toBe(2);
    expect(registry.fontFaces.get("B")).toBe("Verdana");
  });
});

// ============================================================
// buildRegistry — named styles
// ============================================================

describe("buildRegistry — named styles", () => {
  test("parses a named style into the named map", () => {
    const root = contentRoot(
      "<office:styles>" +
        '<style:style style:name="Heading1" style:family="paragraph">' +
        '<style:text-properties fo:font-size="18pt" fo:font-weight="bold"/>' +
        "</style:style>" +
        "</office:styles>",
    );
    const registry = buildRegistry(root);
    const raw = registry.named.get("paragraph:Heading1");
    expect(raw).toBeDefined();
    expect(raw?.textProps.get("fo:font-size")).toBe("18pt");
    expect(raw?.textProps.get("fo:font-weight")).toBe("bold");
  });

  test("preserves style:display-name on named styles", () => {
    const root = contentRoot(
      "<office:styles>" +
        '<style:style style:name="Heading_20_1" style:family="paragraph" style:display-name="Heading 1">' +
        "</style:style>" +
        "</office:styles>",
    );
    const registry = buildRegistry(root);
    const raw = registry.named.get("paragraph:Heading_20_1");
    expect(raw?.displayName).toBe("Heading 1");
  });

  test("preserves style:parent-style-name on named styles", () => {
    const root = contentRoot(
      "<office:styles>" +
        '<style:style style:name="Child" style:family="paragraph" style:parent-style-name="Parent">' +
        "</style:style>" +
        "</office:styles>",
    );
    const registry = buildRegistry(root);
    const raw = registry.named.get("paragraph:Child");
    expect(raw?.parentName).toBe("Parent");
  });

  test("skips style:style elements missing style:name or style:family", () => {
    const root = contentRoot(
      "<office:styles>" +
        '<style:style style:family="paragraph"></style:style>' +
        '<style:style style:name="Orphan"></style:style>' +
        "</office:styles>",
    );
    const registry = buildRegistry(root);
    expect(registry.named.size).toBe(0);
  });
});

// ============================================================
// buildRegistry — automatic styles
// ============================================================

describe("buildRegistry — automatic styles", () => {
  test("parses an automatic style into the automatic map", () => {
    const root = contentRoot(
      "<office:automatic-styles>" +
        '<style:style style:name="T1" style:family="text">' +
        '<style:text-properties fo:color="#ff0000"/>' +
        "</style:style>" +
        "</office:automatic-styles>",
    );
    const registry = buildRegistry(root);
    expect(registry.automatic.get("text:T1")).toBeDefined();
    expect(registry.named.get("text:T1")).toBeUndefined();
  });

  test("automatic styles have no parentName (automatic styles cannot be parents)", () => {
    const root = contentRoot(
      "<office:automatic-styles>" +
        '<style:style style:name="T1" style:family="text">' +
        "</style:style>" +
        "</office:automatic-styles>",
    );
    const registry = buildRegistry(root);
    const raw = registry.automatic.get("text:T1");
    expect(raw?.parentName).toBeUndefined();
  });
});

// ============================================================
// buildRegistry — default styles
// ============================================================

describe("buildRegistry — default styles", () => {
  test("parses a style:default-style into the defaults map", () => {
    const sRoot = stylesRoot(
      "<office:styles>" +
        '<style:default-style style:family="paragraph">' +
        '<style:text-properties fo:font-size="11pt"/>' +
        "</style:default-style>" +
        "</office:styles>",
    );
    const registry = buildRegistry(contentRoot(""), sRoot);
    const def = registry.defaults.get("paragraph");
    expect(def).toBeDefined();
    expect(def?.textProps.get("fo:font-size")).toBe("11pt");
  });

  test("default style keyed by family only, not name", () => {
    const sRoot = stylesRoot(
      "<office:styles>" +
        '<style:default-style style:family="text">' +
        "</style:default-style>" +
        "</office:styles>",
    );
    const registry = buildRegistry(contentRoot(""), sRoot);
    expect(registry.defaults.has("text")).toBe(true);
  });
});

// ============================================================
// buildRegistry — cell/row/column props land in cellProps
// ============================================================

describe("buildRegistry — table property bags", () => {
  test("table-cell-properties attrs land in cellProps", () => {
    const root = contentRoot(
      "<office:automatic-styles>" +
        '<style:style style:name="CE1" style:family="table-cell">' +
        '<style:table-cell-properties fo:background-color="#cccccc" style:vertical-align="middle"/>' +
        "</style:style>" +
        "</office:automatic-styles>",
    );
    const registry = buildRegistry(root);
    const raw = registry.automatic.get("table-cell:CE1");
    expect(raw?.cellProps.get("fo:background-color")).toBe("#cccccc");
    expect(raw?.cellProps.get("style:vertical-align")).toBe("middle");
  });

  test("table-row-properties attrs land in cellProps", () => {
    const root = contentRoot(
      "<office:automatic-styles>" +
        '<style:style style:name="RW1" style:family="table-row">' +
        '<style:table-row-properties fo:background-color="#eeeeee"/>' +
        "</style:style>" +
        "</office:automatic-styles>",
    );
    const registry = buildRegistry(root);
    const raw = registry.automatic.get("table-row:RW1");
    expect(raw?.cellProps.get("fo:background-color")).toBe("#eeeeee");
  });

  test("table-column-properties attrs land in cellProps", () => {
    const root = contentRoot(
      "<office:automatic-styles>" +
        '<style:style style:name="CO1" style:family="table-column">' +
        '<style:table-column-properties style:column-width="5cm"/>' +
        "</style:style>" +
        "</office:automatic-styles>",
    );
    const registry = buildRegistry(root);
    const raw = registry.automatic.get("table-column:CO1");
    expect(raw?.cellProps.get("style:column-width")).toBe("5cm");
  });
});

// ============================================================
// resolve — basic behaviour
// ============================================================

describe("resolve — basic behaviour", () => {
  test("returns empty Maps for an unknown style name", () => {
    const registry = buildRegistry(contentRoot(""));
    const result = resolve(registry, "text", "NonExistent");
    expect(result.textProps.size).toBe(0);
    expect(result.paragraphProps.size).toBe(0);
    expect(result.cellProps.size).toBe(0);
  });

  test("seeds result from the matching default style", () => {
    const sRoot = stylesRoot(
      "<office:styles>" +
        '<style:default-style style:family="paragraph">' +
        '<style:text-properties fo:font-size="11pt"/>' +
        "</style:default-style>" +
        "</office:styles>",
    );
    const root = contentRoot(
      "<office:automatic-styles>" +
        '<style:style style:name="P1" style:family="paragraph">' +
        "</style:style>" +
        "</office:automatic-styles>",
    );
    const registry = buildRegistry(root, sRoot);
    const result = resolve(registry, "paragraph", "P1");
    // Default property present even though P1 sets nothing
    expect(result.textProps.get("fo:font-size")).toBe("11pt");
  });

  test("named style props override defaults", () => {
    const sRoot = stylesRoot(
      "<office:styles>" +
        '<style:default-style style:family="paragraph">' +
        '<style:text-properties fo:font-size="11pt"/>' +
        "</style:default-style>" +
        '<style:style style:name="Big" style:family="paragraph">' +
        '<style:text-properties fo:font-size="18pt"/>' +
        "</style:style>" +
        "</office:styles>",
    );
    const registry = buildRegistry(contentRoot(""), sRoot);
    const result = resolve(registry, "paragraph", "Big");
    expect(result.textProps.get("fo:font-size")).toBe("18pt");
  });

  test("automatic style overrides named style for same key", () => {
    const cRoot = contentRoot(
      "<office:styles>" +
        '<style:style style:name="T1" style:family="text">' +
        '<style:text-properties fo:color="#000000"/>' +
        "</style:style>" +
        "</office:styles>" +
        "<office:automatic-styles>" +
        '<style:style style:name="T1" style:family="text">' +
        '<style:text-properties fo:color="#ff0000"/>' +
        "</style:style>" +
        "</office:automatic-styles>",
    );
    const registry = buildRegistry(cRoot);
    const result = resolve(registry, "text", "T1");
    expect(result.textProps.get("fo:color")).toBe("#ff0000");
  });

  test("walks parent chain — grandparent props inherited by child", () => {
    const root = contentRoot(
      "<office:styles>" +
        '<style:style style:name="Base" style:family="paragraph">' +
        '<style:text-properties fo:font-size="12pt" fo:color="#000000"/>' +
        "</style:style>" +
        '<style:style style:name="Mid" style:family="paragraph" style:parent-style-name="Base">' +
        '<style:text-properties fo:color="#0000ff"/>' +
        "</style:style>" +
        '<style:style style:name="Child" style:family="paragraph" style:parent-style-name="Mid">' +
        "</style:style>" +
        "</office:styles>",
    );
    const registry = buildRegistry(root);
    const result = resolve(registry, "paragraph", "Child");
    // font-size from Base, color overridden by Mid
    expect(result.textProps.get("fo:font-size")).toBe("12pt");
    expect(result.textProps.get("fo:color")).toBe("#0000ff");
  });

  test("child props win over parent props", () => {
    const root = contentRoot(
      "<office:styles>" +
        '<style:style style:name="Parent" style:family="paragraph">' +
        '<style:text-properties fo:font-size="12pt"/>' +
        "</style:style>" +
        '<style:style style:name="Child" style:family="paragraph" style:parent-style-name="Parent">' +
        '<style:text-properties fo:font-size="24pt"/>' +
        "</style:style>" +
        "</office:styles>",
    );
    const registry = buildRegistry(root);
    const result = resolve(registry, "paragraph", "Child");
    expect(result.textProps.get("fo:font-size")).toBe("24pt");
  });

  test("caches result — second call returns the same object", () => {
    const root = contentRoot(
      "<office:automatic-styles>" +
        '<style:style style:name="T1" style:family="text">' +
        '<style:text-properties fo:color="#123456"/>' +
        "</style:style>" +
        "</office:automatic-styles>",
    );
    const registry = buildRegistry(root);
    const first = resolve(registry, "text", "T1");
    const second = resolve(registry, "text", "T1");
    expect(second).toBe(first); // same object reference
  });

  test("different families with same style name resolve independently", () => {
    const root = contentRoot(
      "<office:automatic-styles>" +
        '<style:style style:name="S1" style:family="text">' +
        '<style:text-properties fo:color="#ff0000"/>' +
        "</style:style>" +
        '<style:style style:name="S1" style:family="paragraph">' +
        '<style:paragraph-properties fo:text-align="center"/>' +
        "</style:style>" +
        "</office:automatic-styles>",
    );
    const registry = buildRegistry(root);
    const textResult = resolve(registry, "text", "S1");
    const paraResult = resolve(registry, "paragraph", "S1");
    expect(textResult.textProps.get("fo:color")).toBe("#ff0000");
    expect(textResult.paragraphProps.get("fo:text-align")).toBeUndefined();
    expect(paraResult.paragraphProps.get("fo:text-align")).toBe("center");
    expect(paraResult.textProps.get("fo:color")).toBeUndefined();
  });
});

// ============================================================
// resolveFontFamily
// ============================================================

describe("resolveFontFamily", () => {
  let registry: StyleRegistry;

  beforeEach(() => {
    registry = buildRegistry(
      contentRoot(
        "<office:font-face-decls>" +
          '<style:font-face style:name="ArialRef" svg:font-family="Arial"/>' +
          "</office:font-face-decls>",
      ),
    );
  });

  test("returns fo:font-family directly when present", () => {
    const textProps = new Map([["fo:font-family", "Helvetica"]]);
    expect(resolveFontFamily(textProps, registry.fontFaces)).toBe("Helvetica");
  });

  test("resolves style:font-name through fontFaces map", () => {
    const textProps = new Map([["style:font-name", "ArialRef"]]);
    expect(resolveFontFamily(textProps, registry.fontFaces)).toBe("Arial");
  });

  test("fo:font-family wins over style:font-name when both present", () => {
    const textProps = new Map([
      ["fo:font-family", "Direct"],
      ["style:font-name", "ArialRef"],
    ]);
    expect(resolveFontFamily(textProps, registry.fontFaces)).toBe("Direct");
  });

  test("returns undefined when neither attribute is present", () => {
    const textProps = new Map<string, string>();
    expect(resolveFontFamily(textProps, registry.fontFaces)).toBeUndefined();
  });

  test("returns undefined when style:font-name does not match any font face", () => {
    const textProps = new Map([["style:font-name", "UnknownFont"]]);
    expect(resolveFontFamily(textProps, registry.fontFaces)).toBeUndefined();
  });
});
