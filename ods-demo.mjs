import { OdsDocument } from "odf-kit";
import { writeFileSync } from "node:fs";

const doc = new OdsDocument();

// ─── Sheet 1: Sales Report ────────────────────────────────────────────────────

const sales = doc.addSheet("Sales Report");
sales.setTabColor("#4CAF50");

// Merged title cell spanning 5 columns
sales.addRow([
  { value: "Q1 2026 Sales Report", type: "string", colSpan: 5,
    bold: true, fontSize: 14, backgroundColor: "#1a1a2e", color: "#ffffff",
    align: "center" },
  null, null, null, null,
]);
sales.setRowHeight(0, "1cm");

// Header row — frozen
sales.addRow(
  ["Region", "Product", "Units", "Unit Price", "Revenue"],
  { bold: true, backgroundColor: "#e8f0fe",
    border: "0.5pt solid #90a4ae", align: "center" }
);
sales.freezeRows(2);

// Data rows
const rows = [
  ["North", "Widget A", 320, 49.99],
  ["North", "Widget B", 180, 79.99],
  ["South", "Widget A", 410, 49.99],
  ["South", "Widget C", 95,  149.99],
  ["East",  "Widget B", 260, 79.99],
  ["East",  "Widget C", 140, 149.99],
  ["West",  "Widget A", 390, 49.99],
  ["West",  "Widget B", 210, 79.99],
];

rows.forEach(([region, product, units, price], i) => {
  const rowNum = i + 3; // 1-based, after 2 header rows
  const bg = i % 2 === 0 ? "#ffffff" : "#f8f9fa";
  sales.addRow([
    { value: region,   type: "string", backgroundColor: bg },
    { value: product,  type: "string", backgroundColor: bg },
    { value: units,    type: "float",  backgroundColor: bg, align: "right",
      numberFormat: "integer" },
    { value: price,    type: "currency", numberFormat: "currency:USD",
      backgroundColor: bg, align: "right" },
    { value: `=C${rowNum}*D${rowNum}`, type: "formula",
      numberFormat: "currency:USD", backgroundColor: bg, align: "right" },
  ]);
});

// Totals row
const dataEnd = rows.length + 2;
sales.addRow([
  { value: "TOTAL", type: "string", colSpan: 2, bold: true,
    backgroundColor: "#e8f0fe", border: "0.5pt solid #90a4ae" },
  null,
  { value: `=SUM(C3:C${dataEnd})`, type: "formula",
    numberFormat: "integer", bold: true,
    backgroundColor: "#e8f0fe", border: "0.5pt solid #90a4ae", align: "right" },
  { value: "", type: "string", backgroundColor: "#e8f0fe" },
  { value: `=SUM(E3:E${dataEnd})`, type: "formula",
    numberFormat: "currency:USD", bold: true,
    backgroundColor: "#e8f0fe", border: "0.5pt solid #90a4ae", align: "right" },
]);

sales.setColumnWidth(0, "3cm");
sales.setColumnWidth(1, "4cm");
sales.setColumnWidth(2, "3cm");
sales.setColumnWidth(3, "3.5cm");
sales.setColumnWidth(4, "3.5cm");

// ─── Sheet 2: Data Types ──────────────────────────────────────────────────────

const types = doc.addSheet("Data Types");
types.setTabColor("#2196F3");

types.addRow(["Data Type Showcase"], {
  bold: true, fontSize: 13, backgroundColor: "#1a1a2e", color: "#ffffff",
});
types.setRowHeight(0, "1cm");

types.addRow(["Type", "Value", "Notes"], {
  bold: true, backgroundColor: "#bbdefb", border: "0.5pt solid #90a4ae",
});
types.freezeRows(2);

// String
types.addRow([
  "String", "Hello, odf-kit!", "Plain text value"
]);

// Number — integer format
types.addRow([
  "Integer",
  { value: 1234567, type: "float", numberFormat: "integer" },
  "Thousands separator, no decimals",
]);

// Number — decimal format
types.addRow([
  "Decimal",
  { value: 9876.5432, type: "float", numberFormat: "decimal:2" },
  "Two decimal places",
]);

// Currency — USD
types.addRow([
  "Currency (USD)",
  { value: 42999.99, type: "currency", numberFormat: "currency:USD" },
  "US dollar format",
]);

// Currency — EUR
types.addRow([
  "Currency (EUR)",
  { value: 38750.00, type: "currency", numberFormat: "currency:EUR" },
  "Euro format",
]);

// Percentage
types.addRow([
  "Percentage",
  { value: 0.8734, type: "percentage", numberFormat: "percentage:1" },
  "One decimal place",
]);

// Boolean
types.addRow([
  "Boolean (true)",  true,  "Native boolean",
]);
types.addRow([
  "Boolean (false)", false, "Native boolean",
]);

// Date — ISO format
types.addRow([
  "Date (ISO)",
  { value: new Date("2026-04-20"), type: "date",
    options: { dateFormat: "ISO" } },
  "YYYY-MM-DD",
]);

// Date — DMY format
types.addRow([
  "Date (DMY)",
  { value: new Date("2026-04-20"), type: "date",
    options: { dateFormat: "DMY" } },
  "DD/MM/YYYY",
]);

// Date — MDY format
types.addRow([
  "Date (MDY)",
  { value: new Date("2026-04-20"), type: "date",
    options: { dateFormat: "MDY" } },
  "MM/DD/YYYY",
]);

// Formula
types.addRow([
  "Formula",
  { value: "=2^10", type: "formula" },
  "=2^10 → 1024",
]);

// Hyperlink
types.addRow([
  "Hyperlink",
  { value: "odf-kit on GitHub", type: "string",
    href: "https://github.com/GitHubNewbie0/odf-kit",
    color: "#2563eb", underline: true },
  "Clickable link in cell",
]);

// Empty cell
types.addRow([
  "Empty", null, "null produces an empty cell",
]);

types.setColumnWidth(0, "4cm");
types.setColumnWidth(1, "4cm");
types.setColumnWidth(2, "7cm");

// ─── Sheet 3: Formatting ──────────────────────────────────────────────────────

const fmt = doc.addSheet("Formatting");
fmt.setTabColor("#FF5722");

fmt.addRow(["Cell Formatting Showcase"], {
  bold: true, fontSize: 13, backgroundColor: "#1a1a2e", color: "#ffffff",
});
fmt.setRowHeight(0, "1cm");

fmt.addRow(["Style", "Example"], {
  bold: true, backgroundColor: "#ffe0b2",
});
fmt.freezeRows(2);

fmt.addRow(["Bold",
  { value: "Bold text", type: "string", bold: true }]);

fmt.addRow(["Italic",
  { value: "Italic text", type: "string", italic: true }]);

fmt.addRow(["Bold + Italic",
  { value: "Bold italic", type: "string", bold: true, italic: true }]);

fmt.addRow(["Underline",
  { value: "Underlined", type: "string", underline: true }]);

fmt.addRow(["Font color",
  { value: "Red text", type: "string", color: "#e53935" }]);

fmt.addRow(["Background color",
  { value: "Yellow background", type: "string", backgroundColor: "#fff176" }]);

fmt.addRow(["Large font",
  { value: "16pt text", type: "string", fontSize: 16 }]);

fmt.addRow(["Custom font",
  { value: "Courier New", type: "string", fontFamily: "Courier New" }]);

fmt.addRow(["Align left",
  { value: "← left", type: "string", align: "left" }]);

fmt.addRow(["Align center",
  { value: "center →←", type: "string", align: "center" }]);

fmt.addRow(["Align right",
  { value: "right →", type: "string", align: "right" }]);

fmt.addRow(["Border",
  { value: "All borders", type: "string",
    border: "1pt solid #1a1a2e" }]);

fmt.addRow(["Border bottom only",
  { value: "Bottom border", type: "string",
    borderBottom: "2pt solid #e53935" }]);

fmt.addRow(["Wrap text",
  { value: "This is a long piece of text that should wrap within the cell rather than overflow.",
    type: "string", wrap: true }]);
fmt.setRowHeight(14, "1.8cm");

fmt.setColumnWidth(0, "4.5cm");
fmt.setColumnWidth(1, "7cm");

// ─── Sheet 4: Multi-sheet with freeze columns ─────────────────────────────────

const ledger = doc.addSheet("Ledger");
ledger.setTabColor("#9C27B0");

ledger.addRow(["ID", "Description", "Category", "Date", "Debit", "Credit", "Balance"], {
  bold: true, backgroundColor: "#ede7f6",
  border: "0.5pt solid #b39ddb", align: "center",
});
ledger.freezeRows(1);
ledger.freezeColumns(1); // freeze ID column

const entries = [
  [1, "Opening balance",      "Equity",    new Date("2026-01-01"), 0,      50000, "=G1+F2-E2"],
  [2, "Office rent",          "Overhead",  new Date("2026-01-05"), 2400,   0,     "=G2+F3-E3"],
  [3, "Client payment",       "Revenue",   new Date("2026-01-08"), 0,      8500,  "=G3+F4-E4"],
  [4, "Software licenses",    "IT",        new Date("2026-01-10"), 890,    0,     "=G4+F5-E5"],
  [5, "Consulting revenue",   "Revenue",   new Date("2026-01-15"), 0,      12000, "=G5+F6-E6"],
  [6, "Equipment purchase",   "Assets",    new Date("2026-01-18"), 3200,   0,     "=G6+F7-E7"],
  [7, "Payroll",              "Overhead",  new Date("2026-01-31"), 18000,  0,     "=G7+F8-E8"],
];

entries.forEach(([id, desc, cat, date, debit, credit, balance], i) => {
  const bg = i % 2 === 0 ? "#ffffff" : "#f3e5f5";
  ledger.addRow([
    { value: id,      type: "float",    numberFormat: "integer",      backgroundColor: bg, align: "center" },
    { value: desc,    type: "string",   backgroundColor: bg },
    { value: cat,     type: "string",   backgroundColor: bg },
    { value: date,    type: "date",     backgroundColor: bg },
    { value: debit,   type: "currency", numberFormat: "currency:USD",  backgroundColor: bg, align: "right" },
    { value: credit,  type: "currency", numberFormat: "currency:USD",  backgroundColor: bg, align: "right" },
    { value: balance, type: "formula",  numberFormat: "currency:USD",  backgroundColor: bg, align: "right", bold: true },
  ]);
});

ledger.setColumnWidth(0, "1.5cm");
ledger.setColumnWidth(1, "5cm");
ledger.setColumnWidth(2, "3cm");
ledger.setColumnWidth(3, "3cm");
ledger.setColumnWidth(4, "3cm");
ledger.setColumnWidth(5, "3cm");
ledger.setColumnWidth(6, "3cm");

// ─── Save ─────────────────────────────────────────────────────────────────────

const bytes = await doc.save();
writeFileSync("ods-demo.ods", bytes);
console.log("Written: ods-demo.ods");
