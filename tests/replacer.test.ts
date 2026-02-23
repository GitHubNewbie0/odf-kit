import { replaceAll } from "../src/template/replacer.js";

// ============================================================
// Simple replacement
// ============================================================

describe("replaceAll — simple replacement", () => {
  test("replaces a single placeholder", () => {
    expect(replaceAll("<text:p>{name}</text:p>", { name: "Alice" }))
      .toBe("<text:p>Alice</text:p>");
  });

  test("replaces multiple different placeholders", () => {
    expect(replaceAll("<text:p>{first} {last}</text:p>", { first: "Alice", last: "Smith" }))
      .toBe("<text:p>Alice Smith</text:p>");
  });

  test("replaces same placeholder used multiple times", () => {
    expect(replaceAll("<text:p>{name} and {name}</text:p>", { name: "Alice" }))
      .toBe("<text:p>Alice and Alice</text:p>");
  });

  test("replaces placeholder inside span", () => {
    expect(replaceAll(
      '<text:p><text:span text:style-name="T1">{name}</text:span></text:p>',
      { name: "Alice" }
    )).toBe('<text:p><text:span text:style-name="T1">Alice</text:span></text:p>');
  });

  test("replaces numeric value", () => {
    expect(replaceAll("<text:p>{count}</text:p>", { count: 42 }))
      .toBe("<text:p>42</text:p>");
  });

  test("replaces boolean value", () => {
    expect(replaceAll("<text:p>{flag}</text:p>", { flag: true }))
      .toBe("<text:p>true</text:p>");
  });

  test("replaces undefined value with empty string", () => {
    expect(replaceAll("<text:p>{missing}</text:p>", {}))
      .toBe("<text:p></text:p>");
  });

  test("replaces null value with empty string", () => {
    expect(replaceAll("<text:p>{empty}</text:p>", { empty: null }))
      .toBe("<text:p></text:p>");
  });

  test("returns XML unchanged when no placeholders exist", () => {
    const xml = "<text:p>Hello world</text:p>";
    expect(replaceAll(xml, { name: "Alice" })).toBe(xml);
  });

  test("returns XML unchanged with empty data", () => {
    expect(replaceAll("<text:p>Hello</text:p>", {}))
      .toBe("<text:p>Hello</text:p>");
  });
});

// ============================================================
// XML escaping
// ============================================================

describe("replaceAll — XML escaping", () => {
  test("escapes ampersand", () => {
    expect(replaceAll("<text:p>{name}</text:p>", { name: "A & B" }))
      .toBe("<text:p>A &amp; B</text:p>");
  });

  test("escapes less-than", () => {
    expect(replaceAll("<text:p>{expr}</text:p>", { expr: "x < 5" }))
      .toBe("<text:p>x &lt; 5</text:p>");
  });

  test("escapes greater-than", () => {
    expect(replaceAll("<text:p>{expr}</text:p>", { expr: "x > 5" }))
      .toBe("<text:p>x &gt; 5</text:p>");
  });

  test("escapes double quote", () => {
    expect(replaceAll("<text:p>{quote}</text:p>", { quote: 'She said "hello"' }))
      .toBe("<text:p>She said &quot;hello&quot;</text:p>");
  });

  test("escapes single quote", () => {
    expect(replaceAll("<text:p>{quote}</text:p>", { quote: "it's" }))
      .toBe("<text:p>it&apos;s</text:p>");
  });

  test("escapes multiple special characters in one value", () => {
    expect(replaceAll("<text:p>{code}</text:p>", { code: '<a href="x">&' }))
      .toBe("<text:p>&lt;a href=&quot;x&quot;&gt;&amp;</text:p>");
  });
});

// ============================================================
// Dot notation
// ============================================================

describe("replaceAll — dot notation", () => {
  test("resolves one level of nesting", () => {
    expect(replaceAll("<text:p>{user.name}</text:p>", { user: { name: "Alice" } }))
      .toBe("<text:p>Alice</text:p>");
  });

  test("resolves two levels of nesting", () => {
    expect(replaceAll("<text:p>{company.address.city}</text:p>", {
      company: { address: { city: "Portland" } },
    })).toBe("<text:p>Portland</text:p>");
  });

  test("returns empty string for missing nested property", () => {
    expect(replaceAll("<text:p>{user.email}</text:p>", { user: { name: "Alice" } }))
      .toBe("<text:p></text:p>");
  });

  test("returns empty string when intermediate is missing", () => {
    expect(replaceAll("<text:p>{user.address.city}</text:p>", { user: { name: "Alice" } }))
      .toBe("<text:p></text:p>");
  });

  test("returns empty string when root is missing", () => {
    expect(replaceAll("<text:p>{user.name}</text:p>", {}))
      .toBe("<text:p></text:p>");
  });
});

// ============================================================
// Conditionals (truthy/falsy sections)
// ============================================================

describe("replaceAll — conditionals", () => {
  test("includes section when value is true", () => {
    expect(replaceAll("<text:p>{#show}Visible{/show}</text:p>", { show: true }))
      .toBe("<text:p>Visible</text:p>");
  });

  test("removes section when value is false", () => {
    expect(replaceAll("<text:p>{#show}Hidden{/show}</text:p>", { show: false }))
      .toBe("<text:p></text:p>");
  });

  test("removes section when value is undefined", () => {
    expect(replaceAll("<text:p>{#show}Hidden{/show}</text:p>", {}))
      .toBe("<text:p></text:p>");
  });

  test("removes section when value is null", () => {
    expect(replaceAll("<text:p>{#show}Hidden{/show}</text:p>", { show: null }))
      .toBe("<text:p></text:p>");
  });

  test("removes section when value is zero", () => {
    expect(replaceAll("<text:p>{#show}Hidden{/show}</text:p>", { show: 0 }))
      .toBe("<text:p></text:p>");
  });

  test("removes section when value is empty string", () => {
    expect(replaceAll("<text:p>{#show}Hidden{/show}</text:p>", { show: "" }))
      .toBe("<text:p></text:p>");
  });

  test("includes section when value is non-empty string", () => {
    expect(replaceAll("<text:p>{#show}Visible{/show}</text:p>", { show: "yes" }))
      .toBe("<text:p>Visible</text:p>");
  });

  test("includes section when value is non-zero number", () => {
    expect(replaceAll("<text:p>{#show}Visible{/show}</text:p>", { show: 1 }))
      .toBe("<text:p>Visible</text:p>");
  });

  test("removes section when value is empty array", () => {
    expect(replaceAll("<text:p>{#items}Content{/items}</text:p>", { items: [] }))
      .toBe("<text:p></text:p>");
  });

  test("preserves text before and after conditional section", () => {
    expect(replaceAll(
      "<text:p>Before {#show}Middle{/show} After</text:p>",
      { show: true }
    )).toBe("<text:p>Before Middle After</text:p>");
  });

  test("removes conditional spanning full paragraphs", () => {
    const xml =
      "<text:p>Always here</text:p>" +
      "{#showExtra}<text:p>Extra paragraph</text:p>{/showExtra}" +
      "<text:p>Also always here</text:p>";
    expect(replaceAll(xml, { showExtra: false }))
      .toBe("<text:p>Always here</text:p><text:p>Also always here</text:p>");
  });

  test("includes conditional spanning full paragraphs", () => {
    const xml =
      "<text:p>Always here</text:p>" +
      "{#showExtra}<text:p>Extra paragraph</text:p>{/showExtra}" +
      "<text:p>Also always here</text:p>";
    expect(replaceAll(xml, { showExtra: true }))
      .toBe("<text:p>Always here</text:p><text:p>Extra paragraph</text:p><text:p>Also always here</text:p>");
  });

  test("conditional section with placeholders inside", () => {
    expect(replaceAll(
      "<text:p>{#showDiscount}Save {percent}%!{/showDiscount}</text:p>",
      { showDiscount: true, percent: 10 }
    )).toBe("<text:p>Save 10%!</text:p>");
  });

  test("conditional section with object value merges data", () => {
    expect(replaceAll(
      "<text:p>{#discount}{percent}% off{/discount}</text:p>",
      { discount: { percent: 15 } }
    )).toBe("<text:p>15% off</text:p>");
  });
});

// ============================================================
// Loops
// ============================================================

describe("replaceAll — loops", () => {
  test("repeats content for each array item", () => {
    expect(replaceAll(
      "<text:p>{#items}{name} {/items}</text:p>",
      { items: [{ name: "A" }, { name: "B" }, { name: "C" }] }
    )).toBe("<text:p>A B C </text:p>");
  });

  test("loop with single item", () => {
    expect(replaceAll(
      "<text:p>{#items}{name}{/items}</text:p>",
      { items: [{ name: "Only" }] }
    )).toBe("<text:p>Only</text:p>");
  });

  test("loop items inherit parent data", () => {
    expect(replaceAll(
      "<text:p>{#items}{title}: {product}{/items}</text:p>",
      { title: "Order", items: [{ product: "Widget" }, { product: "Gadget" }] }
    )).toBe("<text:p>Order: WidgetOrder: Gadget</text:p>");
  });

  test("loop item properties override parent data", () => {
    expect(replaceAll(
      "<text:p>{#items}{name}{/items}</text:p>",
      { name: "Parent", items: [{ name: "Child" }] }
    )).toBe("<text:p>Child</text:p>");
  });

  test("loop over table rows", () => {
    const xml =
      "<table:table>" +
      "<table:table-row>" +
      "<table:table-cell><text:p>Product</text:p></table:table-cell>" +
      "<table:table-cell><text:p>Qty</text:p></table:table-cell>" +
      "</table:table-row>" +
      "{#rows}" +
      "<table:table-row>" +
      "<table:table-cell><text:p>{product}</text:p></table:table-cell>" +
      "<table:table-cell><text:p>{qty}</text:p></table:table-cell>" +
      "</table:table-row>" +
      "{/rows}" +
      "</table:table>";

    expect(replaceAll(xml, {
      rows: [
        { product: "Widget", qty: 5 },
        { product: "Gadget", qty: 3 },
      ],
    })).toBe(
      "<table:table>" +
      "<table:table-row>" +
      "<table:table-cell><text:p>Product</text:p></table:table-cell>" +
      "<table:table-cell><text:p>Qty</text:p></table:table-cell>" +
      "</table:table-row>" +
      "<table:table-row>" +
      "<table:table-cell><text:p>Widget</text:p></table:table-cell>" +
      "<table:table-cell><text:p>5</text:p></table:table-cell>" +
      "</table:table-row>" +
      "<table:table-row>" +
      "<table:table-cell><text:p>Gadget</text:p></table:table-cell>" +
      "<table:table-cell><text:p>3</text:p></table:table-cell>" +
      "</table:table-row>" +
      "</table:table>"
    );
  });

  test("loop over paragraphs", () => {
    expect(replaceAll(
      "{#people}<text:p>{name} — {role}</text:p>{/people}",
      {
        people: [
          { name: "Alice", role: "Engineer" },
          { name: "Bob", role: "Designer" },
        ],
      }
    )).toBe("<text:p>Alice — Engineer</text:p><text:p>Bob — Designer</text:p>");
  });

  test("loop with XML escaping in values", () => {
    expect(replaceAll(
      "<text:p>{#items}{name}{/items}</text:p>",
      { items: [{ name: "A & B" }, { name: "<C>" }] }
    )).toBe("<text:p>A &amp; B&lt;C&gt;</text:p>");
  });
});

// ============================================================
// Nested sections
// ============================================================

describe("replaceAll — nested sections", () => {
  test("loop inside conditional", () => {
    const xml =
      "{#showList}<text:p>Items:</text:p>" +
      "{#items}<text:p>{name}</text:p>{/items}{/showList}";
    expect(replaceAll(xml, {
      showList: true,
      items: [{ name: "A" }, { name: "B" }],
    })).toBe("<text:p>Items:</text:p><text:p>A</text:p><text:p>B</text:p>");
  });

  test("conditional inside loop", () => {
    const xml =
      "{#items}<text:p>{name}{#highlight} ★{/highlight}</text:p>{/items}";
    expect(replaceAll(xml, {
      items: [
        { name: "A", highlight: true },
        { name: "B", highlight: false },
        { name: "C", highlight: true },
      ],
    })).toBe("<text:p>A ★</text:p><text:p>B</text:p><text:p>C ★</text:p>");
  });

  test("nested loops", () => {
    const xml =
      "{#departments}<text:p>{dept}</text:p>" +
      "{#members}<text:p>  {name}</text:p>{/members}{/departments}";
    expect(replaceAll(xml, {
      departments: [
        { dept: "Engineering", members: [{ name: "Alice" }, { name: "Bob" }] },
        { dept: "Design", members: [{ name: "Carol" }] },
      ],
    })).toBe(
      "<text:p>Engineering</text:p>" +
      "<text:p>  Alice</text:p><text:p>  Bob</text:p>" +
      "<text:p>Design</text:p>" +
      "<text:p>  Carol</text:p>"
    );
  });

  test("removed conditional removes nested content too", () => {
    const xml =
      "{#showList}{#items}<text:p>{name}</text:p>{/items}{/showList}";
    expect(replaceAll(xml, { showList: false, items: [{ name: "A" }] }))
      .toBe("");
  });
});

// ============================================================
// Realistic template patterns
// ============================================================

describe("replaceAll — realistic templates", () => {
  test("invoice template", () => {
    const xml =
      '<text:p text:style-name="Standard">Invoice #{invoiceNumber}</text:p>' +
      '<text:p text:style-name="Standard">Date: {date}</text:p>' +
      '<text:p text:style-name="Standard">Bill to: {customer.name}</text:p>' +
      '<text:p text:style-name="Standard">{customer.address}</text:p>' +
      "<table:table><table:table-row>" +
      "<table:table-cell><text:p>Item</text:p></table:table-cell>" +
      "<table:table-cell><text:p>Amount</text:p></table:table-cell>" +
      "</table:table-row>" +
      "{#lineItems}<table:table-row>" +
      "<table:table-cell><text:p>{description}</text:p></table:table-cell>" +
      "<table:table-cell><text:p>${amount}</text:p></table:table-cell>" +
      "</table:table-row>{/lineItems}</table:table>" +
      '<text:p text:style-name="Standard">Total: ${total}</text:p>' +
      '{#showNotes}<text:p text:style-name="Standard">Notes: {notes}</text:p>{/showNotes}';

    expect(replaceAll(xml, {
      invoiceNumber: 1042,
      date: "2026-02-23",
      customer: { name: "Acme Corp", address: "123 Main St" },
      lineItems: [
        { description: "Consulting", amount: 500 },
        { description: "Development", amount: 1200 },
      ],
      total: 1700,
      showNotes: true,
      notes: "Net 30",
    })).toBe(
      '<text:p text:style-name="Standard">Invoice #1042</text:p>' +
      '<text:p text:style-name="Standard">Date: 2026-02-23</text:p>' +
      '<text:p text:style-name="Standard">Bill to: Acme Corp</text:p>' +
      '<text:p text:style-name="Standard">123 Main St</text:p>' +
      "<table:table><table:table-row>" +
      "<table:table-cell><text:p>Item</text:p></table:table-cell>" +
      "<table:table-cell><text:p>Amount</text:p></table:table-cell>" +
      "</table:table-row><table:table-row>" +
      "<table:table-cell><text:p>Consulting</text:p></table:table-cell>" +
      "<table:table-cell><text:p>$500</text:p></table:table-cell>" +
      "</table:table-row><table:table-row>" +
      "<table:table-cell><text:p>Development</text:p></table:table-cell>" +
      "<table:table-cell><text:p>$1200</text:p></table:table-cell>" +
      "</table:table-row></table:table>" +
      '<text:p text:style-name="Standard">Total: $1700</text:p>' +
      '<text:p text:style-name="Standard">Notes: Net 30</text:p>'
    );
  });

  test("contract template with conditional clauses", () => {
    const xml =
      "<text:p>This agreement between {partyA} and {partyB}.</text:p>" +
      "{#includeNDA}<text:p>Both parties agree to non-disclosure terms.</text:p>{/includeNDA}" +
      "{#includeNonCompete}<text:p>Non-compete clause applies for {nonCompeteYears} years.</text:p>{/includeNonCompete}" +
      "<text:p>Signed on {date}.</text:p>";

    expect(replaceAll(xml, {
      partyA: "Acme Corp",
      partyB: "Jane Doe",
      includeNDA: true,
      includeNonCompete: false,
      nonCompeteYears: 2,
      date: "2026-02-23",
    })).toBe(
      "<text:p>This agreement between Acme Corp and Jane Doe.</text:p>" +
      "<text:p>Both parties agree to non-disclosure terms.</text:p>" +
      "<text:p>Signed on 2026-02-23.</text:p>"
    );
  });
});

// ============================================================
// Edge cases
// ============================================================

describe("replaceAll — edge cases", () => {
  test("handles empty XML string", () => {
    expect(replaceAll("", { name: "Alice" })).toBe("");
  });

  test("handles placeholder-only string", () => {
    expect(replaceAll("{name}", { name: "Alice" })).toBe("Alice");
  });

  test("handles section-only string", () => {
    expect(replaceAll("{#show}Hello{/show}", { show: true })).toBe("Hello");
  });

  test("malformed section (no close tag) passes through", () => {
    const xml = "<text:p>{#broken}content</text:p>";
    expect(replaceAll(xml, { broken: true })).toBe("<text:p>{#broken}content</text:p>");
  });

  test("adjacent sections", () => {
    expect(replaceAll("{#a}A{/a}{#b}B{/b}", { a: true, b: true })).toBe("AB");
  });

  test("adjacent sections with one removed", () => {
    expect(replaceAll("{#a}A{/a}{#b}B{/b}", { a: true, b: false })).toBe("A");
  });

  test("section tag names with dots", () => {
    expect(replaceAll("{#user.active}Active{/user.active}", { user: { active: true } }))
      .toBe("Active");
  });

  test("section tag names with underscores", () => {
    expect(replaceAll("{#show_extra}Extra{/show_extra}", { show_extra: true }))
      .toBe("Extra");
  });
});
