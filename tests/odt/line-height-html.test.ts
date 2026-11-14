/**
 * The line-height setting in the HTML output (#106, reported by lroder).
 *
 * T4: D106-3. lineHeight → CSS line-height verbatim, except a negative value.
 * lineHeightAtLeast → line-height on the block, with the block's inline
 * content wrapped in one <span style="line-height:normal">: on a block
 * container line-height sets the minimal height of its line boxes, on an
 * inline element the height used (CSS 2.1 §10.8.1, visudet l.1502–1520).
 * lineSpacing has no CSS form and is not written. "Negative" means a value
 * below 0; a value of 0 is not negative, whatever its sign (D106-4 third
 * bullet; first pass 10.3 #5).
 */
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { readOdt } from "../../src/odt/read/parser.js";
import { renderOdtHtml } from "../../src/odt/to-html/index.js";
import type { BodyNode, HeadingNode, ParagraphNode } from "../../src/odt/read/types.js";

// ============================================================
// Helpers
// ============================================================

const WRAPPER_OPEN = '<span style="line-height:normal">';

interface Block {
  /** The CSS declarations of the block's style attribute, in order. */
  css: string[];
  /** The block's inner HTML. */
  inner: string;
}

/** Render one block alone and split it into its declarations and inner HTML. */
function renderBlock(node: BodyNode): Block {
  const html = renderOdtHtml([node], { fragment: true });
  const m = /^<(p|h[1-6])(?: style="([^"]*)")?(?: dir="[^"]*")?>([\s\S]*)<\/\1>$/.exec(html);
  if (!m) throw new Error(`not a single block: ${html}`);
  return { css: m[2] ? m[2].split(";") : [], inner: m[3] ?? "" };
}

/** The block's line-height declarations (expected: zero or one). */
function lineHeights(block: Block): string[] {
  return block.css.filter((d) => d.startsWith("line-height:"));
}

/** True when the inner HTML is exactly one line-height:normal wrapper span. */
function isWrapped(block: Block): boolean {
  return (
    block.inner.startsWith(WRAPPER_OPEN) &&
    block.inner.endsWith("</span>") &&
    block.inner.indexOf(WRAPPER_OPEN, 1) === -1
  );
}

/** Every body paragraph of a reader fixture that uses `styleName`; never empty. */
function fixtureBlocks(file: string, styleName: string): ParagraphNode[] {
  const bytes = readFileSync(new URL(`../reader/fixtures/${file}`, import.meta.url));
  const paras = readOdt(new Uint8Array(bytes)).body.filter(
    (n): n is ParagraphNode => n.kind === "paragraph" && n.styleName === styleName,
  );
  expect(paras.length).toBeGreaterThan(0);
  return paras;
}

const NS =
  ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
  ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
  ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
  ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"';

/** Read a synthetic document whose one paragraph style P sets `paraProps`. */
function readSynthetic(paraProps: string, body = '<text:p text:style-name="P">x</text:p>') {
  const content =
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content${NS}>` +
    "<office:automatic-styles>" +
    '<style:style style:name="P" style:family="paragraph">' +
    `<style:paragraph-properties ${paraProps}/>` +
    "</style:style>" +
    "</office:automatic-styles>" +
    `<office:body><office:text>${body}</office:text></office:body>` +
    "</office:document-content>";
  const doc = readOdt(
    zipSync({
      "content.xml": strToU8(content),
      "META-INF/manifest.xml": strToU8(
        '<?xml version="1.0"?>' +
          '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">' +
          '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>' +
          "</manifest:manifest>",
      ),
    }),
  );
  const node = doc.body[0];
  if (node === undefined) throw new Error("no body node");
  return node as ParagraphNode | HeadingNode;
}

// ============================================================
// Fixtures
// ============================================================

describe("line-height HTML — fixture 1 (line-height-test.odt)", () => {
  const FILE = "line-height-test.odt";

  test("Text_20_body → line-height:300%, no wrapper (T4: D106-3 first bullet)", () => {
    for (const p of fixtureBlocks(FILE, "Text_20_body")) {
      const b = renderBlock(p);
      expect(lineHeights(b)).toEqual(["line-height:300%"]);
      expect(b.inner.startsWith(WRAPPER_OPEN)).toBe(false);
    }
  });

  test("Child with text → block line-height:0.101cm and the wrapper span (T4: D106-3 third bullet; CSS 2.1 visudet l.1502–1520)", () => {
    const [withText] = fixtureBlocks(FILE, "Child").filter((p) => p.spans.length > 0);
    const b = renderBlock(withText as ParagraphNode);
    expect(lineHeights(b)).toEqual(["line-height:0.101cm"]);
    expect(isWrapped(b)).toBe(true);
  });

  test("Child, empty → block line-height:0.101cm, no wrapper (T4: D106-3; first pass 10.2 S2 'no wrapper when there is no inline content')", () => {
    const [empty] = fixtureBlocks(FILE, "Child").filter((p) => p.spans.length === 0);
    const b = renderBlock(empty as ParagraphNode);
    expect(lineHeights(b)).toEqual(["line-height:0.101cm"]);
    expect(b.inner).toBe("");
  });

  test("LeadingChild → no line-height (T4: D106-3 fourth bullet: lineSpacing has no CSS form)", () => {
    for (const p of fixtureBlocks(FILE, "LeadingChild")) {
      const b = renderBlock(p);
      expect(lineHeights(b)).toEqual([]);
      expect(b.inner.startsWith(WRAPPER_OPEN)).toBe(false);
    }
  });
});

describe("line-height HTML — fixture 2 (line-height-inherit-2.odt)", () => {
  const FILE = "line-height-inherit-2.odt";

  test("AtLeastOverLeading → block line-height:0.801cm and the wrapper span (T4: D106-3 third bullet)", () => {
    for (const p of fixtureBlocks(FILE, "AtLeastOverLeading")) {
      const b = renderBlock(p);
      expect(lineHeights(b)).toEqual(["line-height:0.801cm"]);
      expect(isWrapped(b)).toBe(true);
    }
  });

  test("LeadingBase → no line-height (T4: D106-3 fourth bullet)", () => {
    for (const p of fixtureBlocks(FILE, "LeadingBase")) {
      const b = renderBlock(p);
      expect(lineHeights(b)).toEqual([]);
      expect(b.inner.startsWith(WRAPPER_OPEN)).toBe(false);
    }
  });
});

describe("line-height HTML — fixture 3 (line-height-inherit-3.odt)", () => {
  test("FixedOverLeading → line-height:0.801cm, no wrapper (T4: D106-3 first bullet)", () => {
    for (const p of fixtureBlocks("line-height-inherit-3.odt", "FixedOverLeading")) {
      const b = renderBlock(p);
      expect(lineHeights(b)).toEqual(["line-height:0.801cm"]);
      expect(b.inner.startsWith(WRAPPER_OPEN)).toBe(false);
    }
  });
});

// ============================================================
// Synthetic
// ============================================================

describe("line-height HTML — synthetic", () => {
  test("at-least with line-spacing → only the at-least form (T4: D106-2, D106-3)", () => {
    const node = readSynthetic('style:line-height-at-least="0.5cm" style:line-spacing="0.2cm"');
    const b = renderBlock(node);
    expect(lineHeights(b)).toEqual(["line-height:0.5cm"]);
    expect(isWrapped(b)).toBe(true);
  });

  test('fo:line-height="-50%" → reader "-50%" verbatim, no line-height in HTML (T4: D106-2, D8; D106-3 first bullet; CSS 2.1 visudet l.1549–1553)', () => {
    const node = readSynthetic('fo:line-height="-50%"');
    expect(node.paragraphStyle?.lineHeight).toBe("-50%");
    expect(lineHeights(renderBlock(node))).toEqual([]);
  });

  test('style:line-height-at-least="-0.5cm" → reader verbatim, no line-height and no wrapper in HTML (T4: D106-2, D8; D106-3 first bullet; CSS 2.1 visudet l.1534–1538)', () => {
    const node = readSynthetic('style:line-height-at-least="-0.5cm"');
    expect(node.paragraphStyle?.lineHeightAtLeast).toBe("-0.5cm");
    const b = renderBlock(node);
    expect(lineHeights(b)).toEqual([]);
    expect(b.inner.startsWith(WRAPPER_OPEN)).toBe(false);
  });

  test('fo:line-height="-0%" → reader "-0%", HTML line-height:-0% as given (T4: D106-3 first bullet, D106-4 third bullet: 0 is not negative)', () => {
    const node = readSynthetic('fo:line-height="-0%"');
    expect(node.paragraphStyle?.lineHeight).toBe("-0%");
    expect(lineHeights(renderBlock(node))).toEqual(["line-height:-0%"]);
  });

  test("text:h with at-least → the same block form on the heading (T4: D106-3; first pass 10.2 S2 'Same path for text:h')", () => {
    const node = readSynthetic(
      'style:line-height-at-least="0.5cm"',
      '<text:h text:style-name="P" text:outline-level="1">x</text:h>',
    );
    expect(node.kind).toBe("heading");
    const b = renderBlock(node);
    expect(lineHeights(b)).toEqual(["line-height:0.5cm"]);
    expect(isWrapped(b)).toBe(true);
  });
});
