# spec/ — notices and provenance

This directory holds OASIS OpenDocument specification files and artifacts
derived from them. This file is the single place for notices and annotations
about everything here.

## Verbatim OASIS files

These files are byte-for-byte copies of OASIS Standard deliverables. They are
**verbatim and must remain so**: the OASIS notice prohibits modifying them.
Anything we need to say about them is written in this file, never in them.

| File                                     | OASIS source                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `OpenDocument-v1.3-schema.rng`           | https://docs.oasis-open.org/office/OpenDocument/v1.3/os/schemas/                                            |
| `OpenDocument-v1.3-os-part3-schema.html` | https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part3-schema/OpenDocument-v1.3-os-part3-schema.html |

Open Document Format for Office Applications (OpenDocument) Version 1.3,
OASIS Standard, 27 April 2021. Copyright © OASIS Open 2021. All Rights
Reserved.

Each file carries its own copyright notice, which is the authoritative text:

- the `.rng` in its opening comment block (copyright, source URL, and the
  TC IPR statement at https://www.oasis-open.org/committees/office/ipr.php);
- the `.html` in its "Notices" section.

Under those notices, verbatim copies may be copied and distributed provided
the notices are retained and the files are not modified.

## Derived files

These files are produced from the verbatim files above by scripts in `tools/`.
They are generated: regenerate them, never edit them by hand. They are
derivative works that assist in implementing the specification, a category
the OASIS notice permits, subject to the same notice.

| File                            | Produced by                         | Derived from       |
| ------------------------------- | ----------------------------------- | ------------------ |
| `odf-1.3-length-datatypes.json` | `tools/extract-odf-datatypes.mjs`   | the `.rng`         |
| `odf-1.3-length-datatypes.md`   | `tools/extract-odf-datatypes.mjs`   | the `.rng`         |
| `citations/*.txt`               | `tools/extract-prose-citations.mjs` | the Part 3 `.html` |

The citation files contain passages quoted from the Part 3 prose, used as
section-cited evidence (T2 in the provenance charter).

## Trademarks

"OASIS", "OpenDocument", "Open Document Format" and "ODF" are trademarks of
OASIS. The name _odf-kit_ refers to the format descriptively, as other ODF
tooling does. It does not denote an OASIS output.

## Scope and version

- These files stay in the repository and are not published in the npm
  package (provenance charter, DP4).
- odf-kit's ODF target was ruled **ODF 1.4** on 2026-09-16. The files above
  are still 1.3. When the 1.4 schema and Part 3 prose are added, each gets a
  row in the first table with its OASIS source, and the derived files are
  regenerated.

## Annotations

Notes about any file in this directory go here.

- _(none yet)_
