# odf-kit Adapter Architecture

odf-kit ships sensible defaults for every internal stage that consumes
external input. Users who need different behavior — a specific parser for
compliance, a custom normalization scheme — substitute their own
implementations through documented hooks. This document explains the
architecture and the conventions that make substitution and adapter authoring
predictable.

## Philosophy

odf-kit has two runtime dependencies — fflate for ZIP packaging and marked
for Markdown parsing — and ships defaults that work correctly for input from
modern toolchains. The substitution architecture is
an opt-in escape hatch, not the recommended path. Most users never touch it.
Users who do — typically because of compliance requirements or unusual input
shapes — have a stable, documented contract to substitute against.

The architecture is also forward-compatible with sibling packages
(`odf-kit-parse5`, `odf-kit-classic`, etc.) that bundle a specific adapter
configuration as a one-install replacement for `odf-kit`.

## Substitutable Stages

| Stage              | Option name  | Contract type                        | Default implementation |
| ------------------ | ------------ | ------------------------------------ | ---------------------- |
| HTML normalization | `normalizer` | `Normalizer` (`string → string`)     | `odfKitNormalizer`     |
| HTML/XML parsing   | `parser`     | `Parser` (`string → ParsedHtmlTree`) | `odfKitParser`         |

Future stages will be added to this table as substitution hooks are
introduced. The naming and structural conventions below apply uniformly.

## Skip Semantics

Some stages can be skipped entirely (passing `false` as the option value).
Others can be substituted but not skipped. The rule is straightforward: a
stage can be skipped if and only if its output shape matches the next
stage's expected input shape.

| Stage      | Input  | Output | Skippable?                                    |
| ---------- | ------ | ------ | --------------------------------------------- |
| Normalizer | string | string | ✅ Yes — pass `normalizer: false`             |
| Parser     | string | tree   | ❌ No — the walker needs a tree, not a string |

Skipping the normalizer is meaningful when the user knows their input is
already polyglot/XHTML and Tier 1 normalization would be a no-op. The
next stage (the parser) still gets a string, so the chain proceeds.

Skipping the parser would leave the next stage (the walker) with a string
instead of a tree — there is no coherent way to proceed. Users substituting
a parser must always supply one; the type system enforces this by declaring
`parser?: Parser` (without `| false`) on `HtmlToOdtOptions`.

**General rule for future stages:** when adding a substitutable stage,
decide whether `false` is a valid option by asking — _does the next stage's
expected input shape match this stage's expected output shape if the stage
is skipped?_ If yes, allow `false`. If no, the option type omits `false`
and the type system enforces the requirement.

## Naming Conventions

Six categories of names need consistent rules. Future substitutable stages
reuse these conventions verbatim.

### Category 1: Contract types

**Rule:** Named after the _output_ of the stage, with a `Parsed` or
`Normalized` prefix indicating what the function produces.

Examples (current and future):

- `ParsedHtmlTree` — output of any HTML parser
- `NormalizedHtml` — output of any normalizer (string alias) (future)
- `ParsedDocxResult` — output of any DOCX reader (future)
- `ParsedXlsxResult` — output of any XLSX reader (future)
- `ExtractedZipEntries` — output of any ZIP unpacker (future)

The name describes _what comes out_, which is what implementations must
produce.

### Category 2: Option names

**Rule:** Lowercase camelCase, named after the _role_ the substituted
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
htmlToOdt(html, { parser: odfKitParser }); // explicit default
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

**No adapters ship with odf-kit today.** `src/adapters/` exists as a
structural commitment so that contributed adapters have a predictable home.
An adapter you write for your own project lives in your project.

### Category 6: Conformance test location

**Rule:** `tests/conformance/<role>.test.ts`.

Each conformance file exports a runner function that takes an implementation
and runs the full battery against it:

```ts
// tests/conformance/parser.test.ts
export function runParserConformance(parser: Parser, suiteName: string) {
  describe(`${suiteName} — parser conformance`, () => {
    test("parses a single element", () => {
      /* ... */
    });
    test("rejects unclosed tags", () => {
      /* ... */
    });
    // ~30 cases
  });
}

// Run against odf-kit's default
runParserConformance(odfKitParser, "odf-kit default parser");
```

When adapters are written, they run the same suite:

```ts
import { runParserConformance } from "./conformance/parser.js";
import { fromParse5 } from "./from-parse5.js";

runParserConformance(fromParse5(parse5.parse), "parse5 adapter");
```

Same suite, different implementation. Conformance is mechanical and
verifiable. The batteries are not published to npm; see
[Writing an Adapter](#writing-an-adapter).

### Convention summary table

| Category                            | Convention                                                   | Example                              |
| ----------------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| Contract type                       | `Parsed<Subject>` or `Normalized<Subject>`                   | `ParsedHtmlTree`, `NormalizedHtml`   |
| Option name                         | role, lowercase camelCase, shortest unambiguous              | `parser`, `normalizer`               |
| Default implementation              | `odfKit<Role>`                                               | `odfKitParser`, `odfKitNormalizer`   |
| Adapter function (output direction) | `from<Library>`                                              | `fromParse5`, `fromHtmlparser2`      |
| Adapter function (input direction)  | `to<Library>`                                                | (future, when needed)                |
| Adapter file                        | `src/adapters/<role>/from-<library>.ts` or `to-<library>.ts` | `src/adapters/parser/from-parse5.ts` |
| Conformance test                    | `tests/conformance/<role>.test.ts`                           | `tests/conformance/parser.test.ts`   |

## The Two-Direction Adapter Principle

Substitution boundaries need adapters wherever the shapes differ. For each
substitutable stage, there are potentially two conversion points:

```
Pipeline → [adapter-out] → user's implementation → [adapter-in] → Pipeline
```

The "adapter-out" converts odf-kit's data to the shape the user's library
expects to receive. The "adapter-in" converts the library's output back to
odf-kit's contract type.

For some stages, only one adapter is needed:

- **Parser stage:** every parser takes a string as input. Input shape is
  universal across the JS ecosystem (`parse5.parse(html)`,
  `htmlparser2.parseDocument(html)`, `new DOMParser().parseFromString(html,
"text/html")` all accept strings). Only the OUTPUT direction needs an
  adapter (`from<Library>`).

- **Normalizer stage:** input is a string, output is a string. No adapters
  needed — the user's normalizer is already a `string → string` function.

For other stages, both directions need adapters:

- **Hypothetical future walker stage:** input would be a `ParsedHtmlTree`,
  output would be a list of OdtDocument operations. A user substituting with
  a library that uses its own tree shape would need both `to<Library>`
  (`ParsedHtmlTree` → library tree) and `from<Library>` (library output →
  odf-kit operations).

The naming convention extends symmetrically:

- `from<Library>` — converts library's OUTPUT to odf-kit's contract type
- `to<Library>` — converts odf-kit's input to the library's expected shape

For odf-kit's currently-substitutable stages, only `from<Library>` adapters
are relevant. When future stages with structured input shapes are added,
`to<Library>` adapters fill the matching slot. The directory
`src/adapters/<role>/` holds both directions for each library.

## Writing an Adapter

Step-by-step:

1. Identify the stage you're targeting. Look up its contract type and option
   name in the Substitutable Stages table above.

2. Determine which direction(s) need adapters. For a parser, only the output
   direction (`from<Library>`). For a stage with structured input, both
   directions.

3. Write the adapter function(s) with the right signature(s).

4. Convert between the third-party library's shape and odf-kit's contract
   type.

5. Run the conformance test suite (`tests/conformance/<role>.test.ts`)
   against your adapter. Fix any failures.

6. Place your adapter at `src/adapters/<role>/from-<library>.ts` (or
   `to-<library>.ts` for the other direction).

## Worked Example: Writing a parse5 Adapter

This complete example demonstrates the conventions and shows what's involved
in supporting parse5 as the parser. The same pattern applies to
htmlparser2, jsdom, browser `DOMParser`, or any other HTML parser.

### Step 1: Understand the shape difference

odf-kit's `ParsedHtmlTree` shape:

```ts
interface XmlElementNode {
  type: "element";
  tag: string; // lowercase tag name
  attrs: Record<string, string>; // plain object
  children: XmlNode[]; // array of children
}

interface XmlTextNode {
  type: "text";
  text: string;
}

type XmlNode = XmlElementNode | XmlTextNode;
```

parse5's output shape (simplified):

```ts
interface Parse5Element {
  nodeName: string; // lowercase
  tagName: string; // lowercase
  attrs: Array<{ name: string; value: string }>; // array, not object
  childNodes: Parse5Node[]; // childNodes, not children
  parentNode: Parse5Node;
  namespaceURI: string;
}

interface Parse5TextNode {
  nodeName: "#text"; // discriminator is the literal "#text"
  value: string; // value, not text
  parentNode: Parse5Node;
}
```

The shapes differ in property names, attribute representation, and the
text-vs-element discriminator. The adapter is a recursive function that
walks the parse5 tree and builds an equivalent tree in odf-kit's shape.

### Step 2: Write the adapter

Save it in your own project — `src/adapters/parser/from-parse5.ts` if you are
contributing it to odf-kit, anywhere you like if it is yours:

```ts
import type { Parser, ParsedHtmlTree } from "odf-kit/types";

// The child-node union, derived from the published contract type.
type XmlNode = ParsedHtmlTree["children"][number];

/**
 * Adapter that wraps parse5's parse function to satisfy odf-kit's Parser
 * contract.
 *
 * Usage:
 *   import * as parse5 from "parse5";
 *   import { fromParse5 } from "./from-parse5.js";
 *
 *   const odt = await htmlToOdt(html, { parser: fromParse5(parse5.parse) });
 *
 * @param parse5Parse - parse5's parse function (or any function with the
 *   same shape)
 * @returns A Parser conforming to odf-kit's contract
 */
export function fromParse5(parse5Parse: (html: string) => any): Parser {
  return (xml: string): ParsedHtmlTree => {
    const document = parse5Parse(xml);

    // parse5 wraps content in an html/body structure. Find the body's first
    // element child as the actual root for odf-kit's purposes.
    const html = document.childNodes.find((n: any) => n.nodeName === "html");
    const body = html?.childNodes.find((n: any) => n.nodeName === "body");
    const root = body?.childNodes.find(
      (n: any) => n.nodeName !== "#text" && n.nodeName !== "#comment",
    );

    if (!root) {
      throw new Error("fromParse5: no root element found in document");
    }

    return convertNode(root) as ParsedHtmlTree;
  };
}

/**
 * Recursively convert a parse5 node to odf-kit's XmlNode shape.
 */
function convertNode(parse5Node: any): XmlNode {
  // Text nodes
  if (parse5Node.nodeName === "#text") {
    return { type: "text", text: parse5Node.value };
  }

  // Skip comments (odf-kit doesn't process them)
  if (parse5Node.nodeName === "#comment") {
    return { type: "text", text: "" };
  }

  // Element nodes
  return {
    type: "element",
    tag: parse5Node.tagName,
    attrs: Object.fromEntries(parse5Node.attrs.map((a: any) => [a.name, a.value])),
    children: parse5Node.childNodes.map(convertNode),
  };
}
```

### Step 3: Verify with the conformance suite

The battery lives at `tests/conformance/parser.test.ts` in the odf-kit
repository. It is **not** published to npm — `package.json`'s `files` field
ships `dist` only — so reach it by cloning the repo or copying the file into
your own test suite:

```ts
import { runParserConformance } from "./conformance/parser.js";
import { fromParse5 } from "./from-parse5.js";
import * as parse5 from "parse5";

runParserConformance(fromParse5(parse5.parse), "parse5 adapter");
```

If the conformance suite passes, your adapter is ready to use.

### Step 4: Use it

```ts
import { htmlToOdt } from "odf-kit";
import { fromParse5 } from "./from-parse5.js";
import * as parse5 from "parse5";

const odt = await htmlToOdt(html, {
  parser: fromParse5(parse5.parse),
});
```

The adapter is roughly 40 lines of code, mostly mechanical. Adapters for
htmlparser2, jsdom, or browser `DOMParser` follow the same pattern with
different property name translations.

## Contract Specifications

This section documents the invariants any conforming implementation must
satisfy. They are permanent — see [Versioning Promise](#versioning-promise)
below.

Import the contract types from `odf-kit/types`:

```ts
import type { Parser, Normalizer, ParsedHtmlTree } from "odf-kit/types";
```

### `ParsedHtmlTree`

Aliased from the internal `XmlElementNode` type in
`src/odt/read/xml-parser.ts`. Structure:

```ts
interface XmlElementNode {
  type: "element";
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

interface XmlTextNode {
  type: "text";
  text: string;
}

type XmlNode = XmlElementNode | XmlTextNode;
```

#### Invariants on `XmlElementNode`

- `type` MUST be the literal string `"element"`.
- `tag` MUST be a non-empty string. For HTML input, `tag` MUST be the
  lowercase HTML tag name (e.g. `"p"`, `"div"`, `"img"`). The same shape is
  reused internally for ODF XML where `tag` is namespaced (e.g.
  `"text:p"`); when used as a `ParsedHtmlTree` returned from a `Parser`,
  callers expect lowercase HTML tags.
- `attrs` MUST be a plain object (`Record<string, string>`), not an array,
  not a `Map`. Keys are attribute names; values are attribute values.
- Attribute values MUST have all entity references already decoded. Adapters
  that wrap parsers which return raw strings must decode entities before
  populating `attrs`.
- `children` MUST be an array. It MAY be empty (e.g. for HTML void elements
  such as `<br>`, `<img>`, `<hr>` — these appear as elements with
  `children: []`).

#### Invariants on `XmlTextNode`

- `type` MUST be the literal string `"text"`.
- `text` MUST be a string (possibly empty) with all entity references
  already decoded.

#### Tree-level invariants

- The root returned by a `Parser` MUST be an `XmlElementNode`, never an
  `XmlTextNode`.
- Comments MUST NOT appear in the tree. Adapters wrapping parsers that
  preserve comments must filter them out (or, for compatibility with
  whitespace handling downstream, replace them with empty text nodes that
  are ignored by walkers).
- Processing instructions and DOCTYPE declarations MUST NOT appear in the
  tree.
- CDATA sections, where present in the input, MUST appear as text nodes
  containing the CDATA content with no further escaping.

### `Normalizer`

```ts
type Normalizer = (html: string) => string;
```

#### Invariants

- A normalizer MUST be a pure function: same input, same output, no
  side effects.
- A normalizer MUST be idempotent: `normalizer(normalizer(x))` MUST equal
  `normalizer(x)` for every input.
- A normalizer MUST NOT throw on any input. Malformed input is the
  parser's concern — the normalizer's job is to bridge syntactic gaps,
  not to validate.
- A normalizer's output SHOULD be a string the downstream parser can
  consume. For odf-kit's Tier 1 normalizer, this means the output is
  XHTML-compatible (well-formed XML with HTML semantics).

### `Parser`

```ts
type Parser = (xml: string) => ParsedHtmlTree;
```

#### Invariants

- A parser MUST be a pure function: same input, same output, no side
  effects.
- A parser MUST throw `Error` on malformed input rather than producing
  silently-incorrect output. Conformance test cases include unclosed tags,
  mismatched tags, unescaped `&`, malformed attributes, and illegal CDATA
  terminators — all of which MUST throw.
- A parser MUST return a `ParsedHtmlTree` (i.e. an `XmlElementNode`) for
  any input it accepts.
- A parser MUST decode XML predefined entities (`&amp;`, `&lt;`, `&gt;`,
  `&quot;`, `&apos;`) and numeric character references (`&#N;` and
  `&#xN;`) in both attribute values and text content. Named HTML entities
  beyond the five predefined are the normalizer's responsibility, not the
  parser's.

## Versioning Promise

**Contract types are permanent.** New fields MAY be added — changes are
additive only. Existing fields will never be removed, renamed, or have their
types changed, across every future major version. An adapter written against
these contracts today keeps working, unmodified, indefinitely.

This matches odf-kit's guarantee for published import paths: no published
path is ever removed, and no alias carries a removal timeline. Adapter
authors get the same promise for the types they build against.

## Sibling Packages

The substitution architecture makes "sibling packages" possible — separate
npm packages that bundle a specific adapter for one-install access to an
alternative parser or normalizer.

For example, a future `odf-kit-parse5` package would:

- Depend on both `odf-kit` and `parse5`
- Ship the parse5 adapter pre-written
- Re-export odf-kit's API with parse5 wired in as the default parser

Users wanting parse5-powered HTML processing would `npm install
odf-kit-parse5` and use it as a drop-in replacement for `odf-kit`. odf-kit
core keeps its two runtime dependencies; the sibling package declares whatever
its specific configuration additionally needs.

No sibling packages exist as of this writing. The architecture is ready for
them when real demand justifies the maintenance cost.

## Relationship to ARCHITECTURE.md

`ARCHITECTURE.md` describes the codebase as a whole — the source tree, the
published paths and their legacy aliases, the compatibility guarantee, and
which modules are internal. Its audience is anyone asking "where does X live?"

This document covers the substitution architecture specifically: how to replace
an internal stage with your own implementation, what the contract types
require, and the conventions adapter authors follow. `ARCHITECTURE.md` points
here for exactly that.

Different audiences, different concerns.
