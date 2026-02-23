import { healPlaceholders } from "../src/template/healer.js";
import { replaceAll } from "../src/template/replacer.js";

/**
 * Pipeline test: heal → replace, end to end.
 *
 * Simulates exactly what fillTemplate does to content.xml,
 * without needing fflate for zip/unzip.
 */
function pipeline(xml: string, data: Record<string, unknown>): string {
  return replaceAll(healPlaceholders(xml), data);
}

// ============================================================
// Full pipeline — fragmented placeholders + replacement
// ============================================================

describe("pipeline — heal then replace", () => {
  test("heals and replaces a simple fragmented placeholder", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">name}</text:span>' +
      "</text:p>";
    expect(pipeline(xml, { name: "Alice" })).toBe(
      '<text:p><text:span text:style-name="T1">Alice</text:span></text:p>'
    );
  });

  test("heals and replaces multiple fragmented placeholders", () => {
    const xml =
      '<text:p text:style-name="Standard">' +
      "Dear " +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T2">name</text:span>' +
      '<text:span text:style-name="T1">}</text:span>' +
      ", your order #" +
      '<text:span text:style-name="T3">{order</text:span>' +
      '<text:span text:style-name="T3">Number}</text:span>' +
      " is ready." +
      "</text:p>";
    expect(pipeline(xml, { name: "Alice", orderNumber: 1042 })).toBe(
      '<text:p text:style-name="Standard">' +
      "Dear " +
      '<text:span text:style-name="T1">Alice</text:span>' +
      ", your order #" +
      '<text:span text:style-name="T3">1042</text:span>' +
      " is ready." +
      "</text:p>"
    );
  });

  test("heals and replaces fragmented loop tags", () => {
    const xml =
      '<text:p><text:span text:style-name="T1">{#</text:span>' +
      '<text:span text:style-name="T1">items}</text:span></text:p>' +
      "<text:p>" +
      '<text:span text:style-name="T2">{</text:span>' +
      '<text:span text:style-name="T2">product}</text:span>' +
      "</text:p>" +
      '<text:p><text:span text:style-name="T1">{/</text:span>' +
      '<text:span text:style-name="T1">items}</text:span></text:p>';
    expect(pipeline(xml, {
      items: [{ product: "Widget" }, { product: "Gadget" }],
    })).toBe(
      "<text:p>" +
      '<text:span text:style-name="T2">Widget</text:span>' +
      "</text:p>" +
      "<text:p>" +
      '<text:span text:style-name="T2">Gadget</text:span>' +
      "</text:p>"
    );
  });

  test("heals and replaces fragmented conditional tags", () => {
    const xml =
      "<text:p>Always visible</text:p>" +
      '<text:span text:style-name="T1">{#</text:span>' +
      '<text:span text:style-name="T1">showNote}</text:span>' +
      "<text:p>Note: {message}</text:p>" +
      '<text:span text:style-name="T1">{/</text:span>' +
      '<text:span text:style-name="T1">showNote}</text:span>';
    expect(pipeline(xml, { showNote: true, message: "Important" })).toBe(
      "<text:p>Always visible</text:p><text:p>Note: Important</text:p>"
    );
  });

  test("heals fragmented conditional and removes when falsy", () => {
    const xml =
      "<text:p>Always visible</text:p>" +
      '<text:span text:style-name="T1">{#</text:span>' +
      '<text:span text:style-name="T1">showNote}</text:span>' +
      "<text:p>Hidden note</text:p>" +
      '<text:span text:style-name="T1">{/</text:span>' +
      '<text:span text:style-name="T1">showNote}</text:span>';
    expect(pipeline(xml, { showNote: false })).toBe(
      "<text:p>Always visible</text:p>"
    );
  });

  test("XML escaping works through pipeline", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T1">company}</text:span>' +
      "</text:p>";
    expect(pipeline(xml, { company: "Smith & Jones <LLC>" })).toBe(
      '<text:p><text:span text:style-name="T1">Smith &amp; Jones &lt;LLC&gt;</text:span></text:p>'
    );
  });

  test("dot notation with fragmented placeholder", () => {
    const xml =
      "<text:p>" +
      '<text:span text:style-name="T1">{user</text:span>' +
      '<text:span text:style-name="T2">.name}</text:span>' +
      "</text:p>";
    expect(pipeline(xml, { user: { name: "Alice" } })).toBe(
      '<text:p><text:span text:style-name="T1">Alice</text:span></text:p>'
    );
  });
});

// ============================================================
// Realistic full-document pipeline
// ============================================================

describe("pipeline — realistic document", () => {
  test("invoice template with fragmented placeholders, loops, and conditionals", () => {
    const xml =
      // Date — fragmented across 3 spans
      '<text:p text:style-name="Standard">' +
      "Invoice Date: " +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T2">da</text:span>' +
      '<text:span text:style-name="T1">te}</text:span>' +
      "</text:p>" +
      // Customer — contiguous (no healing needed)
      '<text:p text:style-name="Standard">Customer: {customer}</text:p>' +
      // Table header
      "<table:table>" +
      "<table:table-row>" +
      "<table:table-cell><text:p>Item</text:p></table:table-cell>" +
      "<table:table-cell><text:p>Qty</text:p></table:table-cell>" +
      "</table:table-row>" +
      // Loop — open tag fragmented
      '<text:span text:style-name="T1">{#</text:span>' +
      '<text:span text:style-name="T1">items}</text:span>' +
      "<table:table-row>" +
      "<table:table-cell><text:p>{product}</text:p></table:table-cell>" +
      // Qty — fragmented
      "<table:table-cell><text:p>" +
      '<text:span text:style-name="T3">{</text:span>' +
      '<text:span text:style-name="T3">qty}</text:span>' +
      "</text:p></table:table-cell>" +
      "</table:table-row>" +
      "{/items}" +
      "</table:table>" +
      // Total
      '<text:p text:style-name="Standard">Total: ${total}</text:p>' +
      // Conditional notes — fragmented
      '<text:span text:style-name="T1">{#</text:span>' +
      '<text:span text:style-name="T1">showNotes}</text:span>' +
      '<text:p text:style-name="Standard">Notes: {notes}</text:p>' +
      "{/showNotes}";

    expect(pipeline(xml, {
      date: "2026-02-23",
      customer: "Acme Corp",
      items: [
        { product: "Widget", qty: 5 },
        { product: "Gadget", qty: 3 },
      ],
      total: 1700,
      showNotes: true,
      notes: "Net 30",
    })).toBe(
      '<text:p text:style-name="Standard">' +
      "Invoice Date: " +
      '<text:span text:style-name="T1">2026-02-23</text:span>' +
      "</text:p>" +
      '<text:p text:style-name="Standard">Customer: Acme Corp</text:p>' +
      "<table:table>" +
      "<table:table-row>" +
      "<table:table-cell><text:p>Item</text:p></table:table-cell>" +
      "<table:table-cell><text:p>Qty</text:p></table:table-cell>" +
      "</table:table-row>" +
      "<table:table-row>" +
      "<table:table-cell><text:p>Widget</text:p></table:table-cell>" +
      "<table:table-cell><text:p>" +
      '<text:span text:style-name="T3">5</text:span>' +
      "</text:p></table:table-cell>" +
      "</table:table-row>" +
      "<table:table-row>" +
      "<table:table-cell><text:p>Gadget</text:p></table:table-cell>" +
      "<table:table-cell><text:p>" +
      '<text:span text:style-name="T3">3</text:span>' +
      "</text:p></table:table-cell>" +
      "</table:table-row>" +
      "</table:table>" +
      '<text:p text:style-name="Standard">Total: $1700</text:p>' +
      '<text:p text:style-name="Standard">Notes: Net 30</text:p>'
    );
  });

  test("template letter with nested loops and conditionals, all fragmented", () => {
    const xml =
      // Greeting — fragmented
      "<text:p>Dear " +
      '<text:span text:style-name="T1">{</text:span>' +
      '<text:span text:style-name="T2">recipientName</text:span>' +
      '<text:span text:style-name="T1">}</text:span>' +
      ",</text:p>" +
      // Departments loop — fragmented open
      '<text:span text:style-name="T1">{#</text:span>' +
      '<text:span text:style-name="T1">departments}</text:span>' +
      "<text:p>Department: {dept}</text:p>" +
      // Members sub-loop — fragmented
      '<text:span text:style-name="T1">{#</text:span>' +
      '<text:span text:style-name="T1">members}</text:span>' +
      "<text:p>  - {memberName}" +
      // Conditional within loop — fragmented
      '<text:span text:style-name="T1">{#</text:span>' +
      '<text:span text:style-name="T1">isLead}</text:span>' +
      " (Lead)" +
      '<text:span text:style-name="T1">{/</text:span>' +
      '<text:span text:style-name="T1">isLead}</text:span>' +
      "</text:p>" +
      "{/members}" +
      "{/departments}" +
      "<text:p>Regards, {sender}</text:p>";

    expect(pipeline(xml, {
      recipientName: "Alice",
      sender: "The Team",
      departments: [
        {
          dept: "Engineering",
          members: [
            { memberName: "Bob", isLead: true },
            { memberName: "Carol", isLead: false },
          ],
        },
        {
          dept: "Design",
          members: [
            { memberName: "Dave", isLead: false },
          ],
        },
      ],
    })).toBe(
      "<text:p>Dear " +
      '<text:span text:style-name="T1">Alice</text:span>' +
      ",</text:p>" +
      "<text:p>Department: Engineering</text:p>" +
      "<text:p>  - Bob (Lead)</text:p>" +
      "<text:p>  - Carol</text:p>" +
      "<text:p>Department: Design</text:p>" +
      "<text:p>  - Dave</text:p>" +
      "<text:p>Regards, The Team</text:p>"
    );
  });
});

// ============================================================
// fillTemplate integration tests (require fflate)
// ============================================================

describe("fillTemplate — integration", () => {
  let fflate: typeof import("fflate") | null = null;
  let fillTemplate: typeof import("../src/template/template.js").fillTemplate | null = null;

  beforeAll(async () => {
    try {
      fflate = await import("fflate");
      const mod = await import("../src/template/template.js");
      fillTemplate = mod.fillTemplate;
    } catch {
      // fflate not installed — tests will be skipped
    }
  });

  test("fills a real .odt file with simple replacements", () => {
    if (!fflate || !fillTemplate) return;

    const contentXml = fflate.strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">' +
      '<office:body><office:text>' +
      '<text:p text:style-name="Standard">Hello {name}!</text:p>' +
      "</office:text></office:body>" +
      "</office:document-content>"
    );

    const mimetype = fflate.strToU8("application/vnd.oasis.opendocument.text");

    const odt = fflate.zipSync({
      mimetype: [mimetype, { level: 0 }],
      "content.xml": [contentXml, { level: 6 }],
    });

    const result = fillTemplate(new Uint8Array(odt), { name: "Alice" });
    const files = fflate.unzipSync(result);
    const content = fflate.strFromU8(files["content.xml"]);

    expect(content).toContain("Hello Alice!");
    expect(content).not.toContain("{name}");
  });

  test("fills template with loops and conditionals in real .odt", () => {
    if (!fflate || !fillTemplate) return;

    const contentXml = fflate.strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">' +
      '<office:body><office:text>' +
      "<text:p>Invoice for {customer}</text:p>" +
      "{#items}<text:p>{product}: {qty}</text:p>{/items}" +
      "{#showTotal}<text:p>Total: {total}</text:p>{/showTotal}" +
      "</office:text></office:body>" +
      "</office:document-content>"
    );

    const mimetype = fflate.strToU8("application/vnd.oasis.opendocument.text");

    const odt = fflate.zipSync({
      mimetype: [mimetype, { level: 0 }],
      "content.xml": [contentXml, { level: 6 }],
    });

    const result = fillTemplate(new Uint8Array(odt), {
      customer: "Acme Corp",
      items: [
        { product: "Widget", qty: 5 },
        { product: "Gadget", qty: 3 },
      ],
      showTotal: true,
      total: 245,
    });

    const files = fflate.unzipSync(result);
    const content = fflate.strFromU8(files["content.xml"]);

    expect(content).toContain("Invoice for Acme Corp");
    expect(content).toContain("Widget: 5");
    expect(content).toContain("Gadget: 3");
    expect(content).toContain("Total: 245");
    expect(content).not.toContain("{#items}");
    expect(content).not.toContain("{/items}");
  });

  test("processes styles.xml for header/footer placeholders", () => {
    if (!fflate || !fillTemplate) return;

    const contentXml = fflate.strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">' +
      '<office:body><office:text>' +
      "<text:p>Body content</text:p>" +
      "</office:text></office:body>" +
      "</office:document-content>"
    );

    const stylesXml = fflate.strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
      'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0">' +
      "<office:master-styles>" +
      '<style:master-page style:name="Standard">' +
      "<style:header><text:p>{companyName} — Confidential</text:p></style:header>" +
      "<style:footer><text:p>Page {pageLabel}</text:p></style:footer>" +
      "</style:master-page>" +
      "</office:master-styles>" +
      "</office:document-styles>"
    );

    const mimetype = fflate.strToU8("application/vnd.oasis.opendocument.text");

    const odt = fflate.zipSync({
      mimetype: [mimetype, { level: 0 }],
      "content.xml": [contentXml, { level: 6 }],
      "styles.xml": [stylesXml, { level: 6 }],
    });

    const result = fillTemplate(new Uint8Array(odt), {
      companyName: "Acme Corp",
      pageLabel: "draft",
    });

    const files = fflate.unzipSync(result);
    const styles = fflate.strFromU8(files["styles.xml"]);

    expect(styles).toContain("Acme Corp — Confidential");
    expect(styles).toContain("Page draft");
    expect(styles).not.toContain("{companyName}");
    expect(styles).not.toContain("{pageLabel}");
  });

  test("preserves non-XML files in the .odt package", () => {
    if (!fflate || !fillTemplate) return;

    const contentXml = fflate.strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">' +
      '<office:body><office:text>' +
      "<text:p>{name}</text:p>" +
      "</office:text></office:body>" +
      "</office:document-content>"
    );

    const mimetype = fflate.strToU8("application/vnd.oasis.opendocument.text");
    const manifest = fflate.strToU8(
      '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'
    );
    const fakeImage = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes

    const odt = fflate.zipSync({
      mimetype: [mimetype, { level: 0 }],
      "content.xml": [contentXml, { level: 6 }],
      "META-INF/manifest.xml": [manifest, { level: 6 }],
      "Pictures/logo.png": [fakeImage, { level: 6 }],
    });

    const result = fillTemplate(new Uint8Array(odt), { name: "Alice" });
    const files = fflate.unzipSync(result);

    expect(files["mimetype"]).toBeDefined();
    expect(files["content.xml"]).toBeDefined();
    expect(files["META-INF/manifest.xml"]).toBeDefined();
    expect(files["Pictures/logo.png"]).toBeDefined();
    expect(files["Pictures/logo.png"]).toEqual(fakeImage);
  });
});
