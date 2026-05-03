# `src/adapters/`

This directory holds adapter implementations that bridge between odf-kit's
contract types and third-party libraries' shapes.

For the architectural overview, naming conventions, and a worked example of
writing an adapter, see [`ADAPTERS.md`](../../ADAPTERS.md) at the repo root.

## Subdirectories

- [`parser/`](./parser/) — adapters for HTML/XML parsers (e.g. parse5,
  htmlparser2, jsdom, browser DOMParser)

Future subdirectories will appear as new substitutable stages are added —
e.g. `normalizer/`, `docx-reader/`, `xlsx-reader/`. Each follows the
naming convention documented in `ADAPTERS.md`.
