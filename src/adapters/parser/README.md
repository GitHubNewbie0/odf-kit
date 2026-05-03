# `src/adapters/parser/`

Adapters that wrap third-party HTML/XML parsers to satisfy odf-kit's
`Parser` contract type (`(xml: string) => ParsedHtmlTree`).

For the contract specification and a complete worked example of writing a
parser adapter, see [`ADAPTERS.md`](../../../ADAPTERS.md) at the repo root.

## Naming convention

`from-<library>.ts` exports `from<Library>(...)` — converts the third-party
parser's output to a `ParsedHtmlTree`. For example,
`from-parse5.ts` exports `fromParse5`.

No adapters ship in v0.13.2. This directory is established as a structural
commitment — future adapters have a predictable home.
