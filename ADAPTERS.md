# odf-kit Adapter Architecture

odf-kit ships sensible defaults for every internal stage that consumes
external input. Users who need different behavior — a specific parser for
compliance, a custom normalization scheme — substitute their own
implementations through documented hooks. This document explains the
architecture and the conventions that make substitution and adapter authoring
predictable.

## Philosophy

odf-kit core declares zero runtime dependencies and ships defaults that work
correctly for input from modern toolchains. The substitution architecture is
an opt-in escape hatch, not the recommended path. Most users never touch it.
Users who do — typically because of compliance requirements or unusual input
shapes — have a stable, documented contract to substitute against.

The architecture is also forward-compatible with sibling packages
(`odf-kit-parse5`, `odf-kit-classic`, etc.) that bundle a specific adapter
configuration as a one-install replacement for `odf-kit`.

## Substitutable Stages

| Stage | Option name | Contract type | Default implementation |
|-------|-------------|---------------|------------------------|
| HTML normalization | `normalizer` | `Normalizer` (`string → string`) | `odfKitNormalizer` |
| HTML/XML parsing | `parser` | `Parser` (`string → ParsedHtmlTree`) | `odfKitParser` |

Future stages will be added to this table as substitution hooks are
introduced. The naming and structural conventions below apply uniformly.

## Naming Conventions

Six categories of names need consistent rules. Future substitutable stages
reuse these conventions verbatim.

### Category 1: Contract types

**Rule:** Named after the *output* of the stage, with a `Parsed` or
`Normalized` prefix indicating what the function produces.

Examples (current and future):

- `ParsedHtmlTree` — output of any HTML parser
- `NormalizedHtml` — output of any normalizer (string alias)
- `ParsedDocxResult` — output of any DOCX reader (future)
- `ParsedXlsxResult` — output of any XLSX reader (future)
- `ExtractedZipEntries` — output of any ZIP unpacker (future)

The name describes *what comes out*, which is what implementations must
produce.

### Category 2: Option names

**Rule:** Lowercase camelCase, named after the *role* the substituted
function plays. Shortest unambiguous name within the option object's
context.

Examples:

- `parser` — on `HtmlToOdtOptions`
- `normalizer` — on `HtmlToOdtOptions`
- `docxReader` — on a future `DocxToOdtOptions`

The user thinks "I want to plug in my own parser," not "I want to substitute
a `ParsedHtmlTree`-producing function."

### Category 3: Default implementation names

**Rule:** `odfKit<Role>` for functions, `OdfKit<Role>` for classes.

Examples:

- `odfKitNormalizer` — built-in default normalizer
- `odfKitParser` — built-in default parser
- `odfKitDocxReader` — future built-in default DOCX reader

The explicit prefix marks the function as the package's default and lets
users opt back in:

```ts
htmlToOdt(html, { parser: odfKitParser });    // explicit default
htmlToOdt(html, { parser: someOtherParser }); // substituted
```

### Category 4: Adapter function names

**Rule:** `from<Library>` for output adapters (library output → odf-kit
contract type). `to<Library>` for input adapters (odf-kit input → library
expected shape). Both forms use `<Library>` as the source library name in
PascalCase.

Examples:

- `fromParse5` — converts parse5's tree to `ParsedHtmlTree`
- `fromHtmlparser2` — converts htmlparser2's tree to `ParsedHtmlTree`
- `fromDom` — converts a W3C DOM to `ParsedHtmlTree` (covers browser
  `DOMParser`, `linkedom`, `jsdom`)
- `fromMammoth` — converts mammoth's output to `ParsedDocxResult` (future)
- `fromSheetJS` — converts SheetJS's workbook to `ParsedXlsxResult` (future)

If a single library covers multiple stages, role disambiguation is appended:
`fromParse5Html`, `fromParse5Xml`.

The `from`/`to` prefixes are mnemonic: "from parse5 to the contract" or "to
parse5 from the contract." Reads naturally in code:

```ts
htmlToOdt(html, { parser: fromParse5(parse5.parse) });
```

For odf-kit's currently-substitutable stages, only `from<Library>` adapters
apply — both the normalizer and parser stages have universal input shapes
(`string` in), so input adapters aren't needed. The `to<Library>` form is
reserved for future stages with structured input. See "The Two-Direction
Adapter Principle" below.

### Category 5: Adapter file location

**Rule:** `src/adapters/<role>/from-<library>.ts` (or `to-<library>.ts`).

Examples:

- `src/adapters/parser/from-parse5.ts`
- `src/adapters/parser/from-htmlparser2.ts`
- `src/adapters/parser/from-dom.ts`
- `src/adapters/normalizer/from-<library>.ts` (future)
- `src/adapters/docx-reader/from-mammoth.ts` (future)

### Category 6: Conformance test location

**Rule:** `tests/conformance/<role>.test.ts`.

Each conformance file exports a runner function that takes an implementation
and runs the full battery against it:

```ts
// tests/conformance/parser.test.ts
export function runParserConformance(parser: Parser, suiteName: string) {
  describe(`${suiteName} — parser conformance`, () => {
    test("parses a single element", () => { /* ... */ });
    test("rejects unclosed tags", () => { /* ... */ });
    // ~30 cases
  });
}

// Run against odf-kit's default
runParserConformance(odfKitParser, "odf-kit default parser");
```

When future adapters are written, they run the same suite:

```ts
import { runParserConformance } from "odf-kit/tests/conformance/parser";
import { fromParse5 } from "./from-parse5.js";

runParserConformance(fromParse5(parse5.parse), "parse5 adapter");
```

Same suite, different implementation. Conformance is mechanical and
verifiable.

### Convention summary table

| Category | Convention | Example |
|----------|-----------|---------|
| Contract type | `Parsed<Subject>` or `Normalized<Subject>` | `ParsedHtmlTree`, `NormalizedHtml` |
| Option name | role, lowercase camelCase, shortest unambiguous | `parser`, `normalizer` |
| Default implementation | `odfKit<Role>` | `odfKitParser`, `odfKitNormalizer` |
| Adapter function (output direction) | `from<Library>` | `fromParse5`, `fromHtmlparser2` |
| Adapter function (input direction) | `to<Library>` | (future, when needed) |
| Adapter file | `src/adapters/<role>/from-<library>.ts` or `to-<library>.ts` | `src/adapters/parser/from-parse5.ts` |
| Conformance test | `tests/conformance/<role>.test.ts` | `tests/conformance/parser.test.ts` |

## The Two-Direction Adapter Principle

Substitution boundaries need adapters wherever the shapes differ. For each
substitutable stage, there are potentially two conversion points: