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

## ODF 1.4 derived files

These files are generated from the three ODF 1.4 RelaxNG schemas by
`tools/extract-odf-grammar.mjs`. Regenerate them; never edit them by hand.

| File                  | Produced by                     | Derived from                               |
| --------------------- | ------------------------------- | ------------------------------------------ |
| `odf-elements.json`   | `tools/extract-odf-grammar.mjs` | the ODF 1.4 main, manifest and dsig `.rng` |
| `odf-attributes.json` | `tools/extract-odf-grammar.mjs` | the ODF 1.4 main, manifest and dsig `.rng` |
| `odf-datatypes.json`  | `tools/extract-odf-grammar.mjs` | the ODF 1.4 main, manifest and dsig `.rng` |

Source: Open Document Format for Office Applications (OpenDocument) Version
1.4, OASIS Standard, 6 October 2025, schemas at
https://docs.oasis-open.org/office/OpenDocument/v1.4/os/schemas/. Each
schema's header reads "Copyright (c) OASIS Open 2025. All Rights Reserved."

## OASIS copyright notice and Notices (applies to all ODF-derived files in this directory, ODF 1.3 and 1.4)

Reproduced verbatim from the originals in the maintainer's internal source
repository (HTML tags dropped, no other change):

(a) The copyright notice, from the header comment of
`odf-kit-internal/spec/odf-1.4/schemas/OpenDocument-v1.4-schema.rng` (l.6):

```text
Copyright (c) OASIS Open 2025. All Rights Reserved.
```

(b) The Notices section of
`odf-kit-internal/spec/odf-1.4/OpenDocument-v1.4-os-part3-schema.html` (l.693–713):

```text
Notices

Copyright © OASIS Open 2025. All Rights Reserved.

All capitalized terms in the following text have the meanings assigned to them in the OASIS Intellectual Property Rights Policy (the "OASIS IPR Policy"). The full Policy may be found at the OASIS website.

This document and translations of it may be copied and furnished to others, and derivative works that comment on or otherwise explain it or assist in its implementation may be prepared, copied, published, and distributed, in whole or in part, without restriction of any kind, provided that the above copyright notice and this section are included on all such copies and derivative works. However, this document itself may not be modified in any way, including by removing the copyright notice or references to OASIS, except as needed for the purpose of developing any document or deliverable produced by an OASIS Technical Committee (in which case the rules applicable to copyrights, as set forth in the OASIS IPR Policy, must be followed) or as required to translate it into languages other than English.

The limited permissions granted above are perpetual and will not be revoked by OASIS or its successors or assigns.

This document and the information contained herein is provided on an "AS IS" basis and OASIS DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTY THAT THE USE OF THE INFORMATION HEREIN WILL NOT INFRINGE ANY OWNERSHIP RIGHTS OR ANY IMPLIED WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.

As stated in the OASIS IPR Policy, the following three paragraphs in brackets apply to OASIS Standards Final Deliverable documents (Committee Specification, OASIS Standard, or Approved Errata).

[OASIS requests that any OASIS Party or any other party that believes it has patent claims that would necessarily be infringed by implementations of this OASIS Standards Final Deliverable, to notify OASIS TC Administrator and provide an indication of its willingness to grant patent licenses to such patent claims in a manner consistent with the IPR Mode of the OASIS Technical Committee that produced this deliverable.]

[OASIS invites any party to contact the OASIS TC Administrator if it is aware of a claim of ownership of any patent claims that would necessarily be infringed by implementations of this OASIS Standards Final Deliverable by a patent holder that is not willing to provide a license to such patent claims in a manner consistent with the IPR Mode of the OASIS Technical Committee that produced this OASIS Standards Final Deliverable. OASIS may include such claims on its website, but disclaims any obligation to do so.]

[OASIS takes no position regarding the validity or scope of any intellectual property or other rights that might be claimed to pertain to the implementation or use of the technology described in this OASIS Standards Final Deliverable or the extent to which any license under such rights might or might not be available; neither does it represent that it has made any effort to identify any such rights. Information on OASIS' procedures with respect to rights in any document or deliverable produced by an OASIS Technical Committee can be found on the OASIS website. Copies of claims of rights made available for publication and any assurances of licenses to be made available, or the result of an attempt made to obtain a general license or permission for the use of such proprietary rights by implementers or users of this OASIS Standards Final Deliverable, can be obtained from the OASIS TC Administrator. OASIS makes no representation that any information or list of intellectual property rights will at any time be complete, or that any claims in such list are, in fact, Essential Claims.]

The name "OASIS" is a trademark of OASIS, the owner and developer of this specification, and should be used only to refer to the organization and its official outputs. OASIS welcomes reference to, and implementation and use of, specifications, while reserving the right to enforce its marks against misleading uses. Please see https://www.oasis-open.org/policies-guidelines/trademark/ for above guidance.
```

## CommonMark 0.29 and GFM 0.29-gfm excerpts

`citations/markdown-cm-0.29-gfm-0.29.txt` holds excerpts of two specifications
that the Markdown emitter and its tests cite:

- CommonMark Spec, Version 0.29 (2019-04-06), by John MacFarlane:
  https://spec.commonmark.org/0.29/
- GitHub Flavored Markdown Spec, Version 0.29-gfm (2019-04-06), based on
  the CommonMark Spec by John MacFarlane: https://github.github.com/gfm/

Both are licensed under the Creative Commons Attribution-ShareAlike 4.0
International License (CC BY-SA 4.0),
https://creativecommons.org/licenses/by-sa/4.0/. Their licence statements,
quoted verbatim from the text copies the excerpts were taken from (`cm.txt`
l.123–135 and `gfm.txt` l.121–127), are:

    <a rel="license"
       href="http://creativecommons.org/licenses/by-sa/4.0/"><img alt="Creative
       Commons BY-SA" style="border-width:0"
       src="https://i.creativecommons.org/l/by-sa/4.0/80x15.png"
       /><span xmlns:dct="http://purl.org/dc/terms/"
       href="http://purl.org/dc/dcmitype/Text" property="dct:title"
       rel="dct:type">CommonMark Spec by
       <a xmlns:cc="http://creativecommons.org/ns#"
       href="http://spec.commonmark.org" property="cc:attributionName"
       rel="cc:attributionURL">John MacFarlane is licensed under a
       <a rel="license"
       href="http://creativecommons.org/licenses/by-sa/4.0/">Creative
       Commons Attribution-ShareAlike 4.0 International License.

      This formal specification is based on the
      CommonMark Spec by
      John MacFarlane and licensed under
      <a rel="license"
       href="http://creativecommons.org/licenses/by-sa/4.0/">
        <img style="vertical-align:middle" alt="Creative Commons BY-SA" style="border-width:0"
       src="https://i.creativecommons.org/l/by-sa/4.0/80x15.png"/>

`spec/citations/markdown-cm-0.29-gfm-0.29.txt` is a verbatim, unmodified
excerpt under CC BY-SA 4.0, not Apache-2.0. Each excerpt in it is headed by
its section number and its line range in `cm.txt` or `gfm.txt`. It is not
produced by `tools/extract-prose-citations.mjs`, and the `citations/*.txt`
row under "Derived files" does not cover it.

## Trademarks

"OASIS", "OpenDocument", "Open Document Format" and "ODF" are trademarks of
OASIS. The name _odf-kit_ refers to the format descriptively, as other ODF
tooling does. It does not denote an OASIS output.

## Scope and version

- These files stay in the repository and are not published in the npm
  package (provenance charter, DP4).
- odf-kit's ODF target was ruled **ODF 1.4** on 2026-09-16. The verbatim
  OASIS files in the first table are 1.3, together with the 1.3 derived
  files; they stay here while code and tests still cite them.
- The ODF 1.4 schemas are **not copied into this directory**. The verbatim
  1.4 files live in the maintainer's internal source repository
  (`odf-kit-internal/spec/odf-1.4/`, with its own provenance record).
  `tools/extract-odf-grammar.mjs` reads the three schemas from
  `../odf-kit-internal/spec/odf-1.4/schemas/` and stops if a file's sha256
  differs from the value recorded in the script. Each generated file's
  `_generated` header records the path and sha256 it matched. Regenerating
  the 1.4 files therefore needs that repository checked out beside this one.

## Annotations

Notes about any file in this directory go here.

- _(none yet)_
