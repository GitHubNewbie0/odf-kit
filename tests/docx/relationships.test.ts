import { describe, it, expect } from "@jest/globals";
import { parseRelationships } from "../../src/docx/relationships.js";

// ─── parseRelationships ───────────────────────────────────────────────

describe("parseRelationships — basic", () => {
  it("returns empty map for empty Relationships element", () => {
    const xml = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const map = parseRelationships(xml);
    expect(map.size).toBe(0);
  });

  it("parses a single internal image relationship", () => {
    const xml = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
    </Relationships>`;
    const map = parseRelationships(xml);
    const rel = map.get("rId1");
    expect(rel).toBeDefined();
    expect(rel!.target).toBe("word/media/image1.png");
    expect(rel!.external).toBe(false);
    expect(rel!.type).toContain("relationships/image");
  });

  it("resolves internal target relative to word/ folder", () => {
    const xml = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
    </Relationships>`;
    const map = parseRelationships(xml);
    expect(map.get("rId1")!.target).toBe("word/footnotes.xml");
  });

  it("resolves ../ segments in internal targets", () => {
    const xml = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
    </Relationships>`;
    const map = parseRelationships(xml);
    expect(map.get("rId1")!.target).toBe("media/image1.png");
  });

  it("parses an external hyperlink relationship", () => {
    const xml = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>
    </Relationships>`;
    const map = parseRelationships(xml);
    const rel = map.get("rId2");
    expect(rel!.target).toBe("https://example.com");
    expect(rel!.external).toBe(true);
  });

  it("parses multiple relationships", () => {
    const xml = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>
      <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
    </Relationships>`;
    const map = parseRelationships(xml);
    expect(map.size).toBe(3);
    expect(map.get("rId1")!.external).toBe(false);
    expect(map.get("rId2")!.external).toBe(true);
    expect(map.get("rId3")!.target).toBe("word/header1.xml");
  });

  it("skips entries with no Id attribute", () => {
    const xml = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
    </Relationships>`;
    const map = parseRelationships(xml);
    expect(map.size).toBe(0);
  });

  it("stores the full type URI", () => {
    const xml = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
    </Relationships>`;
    const map = parseRelationships(xml);
    expect(map.get("rId1")!.type).toBe(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
    );
  });
});
