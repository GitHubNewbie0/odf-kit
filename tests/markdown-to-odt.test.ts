import { describe, it, expect } from "@jest/globals";
import { strFromU8, unzipSync } from "fflate";
import { markdownToOdt } from "../src/odt/index.js";

async function getContentXml(bytes: Uint8Array): Promise<string> {
  const unzipped = unzipSync(bytes);
  return strFromU8(unzipped["content.xml"]);
}

async function getStylesXml(bytes: Uint8Array): Promise<string> {
  const unzipped = unzipSync(bytes);
  return strFromU8(unzipped["styles.xml"]);
}

async function getMetaXml(bytes: Uint8Array): Promise<string> {
  const unzipped = unzipSync(bytes);
  return strFromU8(unzipped["meta.xml"]);
}

describe("markdownToOdt", () => {
  it("should return a valid Uint8Array", async () => {
    const bytes = await markdownToOdt("# Hello\n\nWorld");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("should produce a valid ZIP file", async () => {
    const bytes = await markdownToOdt("Hello");
    const unzipped = unzipSync(bytes);
    expect(unzipped["mimetype"]).toBeDefined();
    expect(unzipped["content.xml"]).toBeDefined();
  });

  it("should convert a heading", async () => {
    const bytes = await markdownToOdt("# My Title");
    const content = await getContentXml(bytes);
    expect(content).toContain("My Title");
    expect(content).toContain("Heading_20_1");
  });

  it("should convert headings levels 1-3", async () => {
    const bytes = await markdownToOdt("# H1\n\n## H2\n\n### H3");
    const content = await getContentXml(bytes);
    expect(content).toContain("Heading_20_1");
    expect(content).toContain("Heading_20_2");
    expect(content).toContain("Heading_20_3");
  });

  it("should convert a paragraph", async () => {
    const bytes = await markdownToOdt("Hello, world.");
    const content = await getContentXml(bytes);
    expect(content).toContain("Hello, world.");
  });

  it("should convert bold text", async () => {
    const bytes = await markdownToOdt("**bold text**");
    const content = await getContentXml(bytes);
    expect(content).toContain("bold text");
    expect(content).toContain("fo:font-weight");
  });

  it("should convert italic text", async () => {
    const bytes = await markdownToOdt("*italic text*");
    const content = await getContentXml(bytes);
    expect(content).toContain("italic text");
    expect(content).toContain("fo:font-style");
  });

  it("should convert an unordered list", async () => {
    const bytes = await markdownToOdt("- Item 1\n- Item 2\n- Item 3");
    const content = await getContentXml(bytes);
    expect(content).toContain("Item 1");
    expect(content).toContain("Item 2");
    expect(content).toContain("Item 3");
    expect(content).toContain("text:list");
  });

  it("should convert an ordered list", async () => {
    const bytes = await markdownToOdt("1. First\n2. Second\n3. Third");
    const content = await getContentXml(bytes);
    expect(content).toContain("First");
    expect(content).toContain("Second");
    expect(content).toContain("text:list");
  });

  it("should convert a link", async () => {
    const bytes = await markdownToOdt("[odf-kit](https://github.com/GitHubNewbie0/odf-kit)");
    const content = await getContentXml(bytes);
    expect(content).toContain("odf-kit");
    expect(content).toContain("https://github.com/GitHubNewbie0/odf-kit");
  });

  it("should convert a table", async () => {
    const md = "| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |";
    const bytes = await markdownToOdt(md);
    const content = await getContentXml(bytes);
    expect(content).toContain("Alice");
    expect(content).toContain("table:table");
  });

  it("should convert a code block to monospace", async () => {
    const bytes = await markdownToOdt("```\nconst x = 1;\n```");
    const content = await getContentXml(bytes);
    expect(content).toContain("const x = 1;");
  });

  it("should support A4 page format (default)", async () => {
    const bytes = await markdownToOdt("Hello");
    const styles = await getStylesXml(bytes);
    expect(styles).toContain("21cm");
    expect(styles).toContain("29.7cm");
  });

  it("should support letter page format", async () => {
    const bytes = await markdownToOdt("Hello", { pageFormat: "letter" });
    const styles = await getStylesXml(bytes);
    expect(styles).toContain("21.59cm");
  });

  it("should support metadata", async () => {
    const bytes = await markdownToOdt("Hello", {
      metadata: { title: "My Doc", creator: "Alice" },
    });
    const meta = await getMetaXml(bytes);
    expect(meta).toContain("My Doc");
    expect(meta).toContain("Alice");
  });

  it("should handle empty string", async () => {
    const bytes = await markdownToOdt("");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("should handle a full markdown document", async () => {
    const md = `# Meeting Notes

**Date:** April 9, 2026

## Agenda

1. Project status
2. Budget review
3. Next steps

## Action Items

| Owner | Task | Due |
|-------|------|-----|
| Alice | Send report | Friday |
| Bob | Review budget | Monday |

See [odf-kit](https://github.com/GitHubNewbie0/odf-kit) for details.`;

    const bytes = await markdownToOdt(md, { pageFormat: "A4" });
    expect(bytes).toBeInstanceOf(Uint8Array);
    const content = await getContentXml(bytes);
    expect(content).toContain("Meeting Notes");
    expect(content).toContain("Action Items");
    expect(content).toContain("Alice");
  });
});
