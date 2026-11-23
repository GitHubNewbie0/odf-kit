# Security Policy

Thank you for helping keep odf-kit and its users safe.

## Reporting a vulnerability

**Please do not open public issues for security vulnerabilities.**

The preferred reporting channel is **GitHub's private vulnerability reporting**:
go to the [Security tab of this repository](https://github.com/GitHubNewbie0/odf-kit/security)
and click **"Report a vulnerability."** Your report will be visible only to the
maintainer until coordinated disclosure.

If you cannot use GitHub Security Advisories, you can also email
**scott@wirthmgt.com** with the subject line `[odf-kit security]`. Please
include what the next section asks for.

## What a report needs

- The odf-kit version and the function called.
- A reproduction that runs against the latest release: the input file or
  string, and the code that passes it to odf-kit.
- What an attacker gains from it.

A report without a working reproduction is closed without discussion.

## What to expect

odf-kit has one maintainer and no bug bounty. What follows applies to every
open report, including reports filed before this version of the policy.

- **Order.** Reports are handled by severity and by how reachable the defect is
  in real use, as the maintainer assesses them, not in the order they arrive.
  No timeline is promised. Critical issues are prioritised for the next release.
- **Replies.** GitHub's confirmation of your submission is the receipt; an
  emailed report gets none. You will get one reply, when the report is fixed or
  declined. Status questions in between are not answered. If you intend to
  publish on a date of your own, say so in the report.
- **One advisory per defect.** A report of a defect that is already fixed, or
  already covered by an advisory, is folded into that one. The same defect at
  another site in the code is the same defect and does not get a separate
  advisory or CVE.
- **CVEs.** The maintainer decides whether to request a CVE, and requests it
  once, after the fix is published. Assignment is GitHub's decision on GitHub's
  schedule. The maintainer does not track it or answer questions about it.
- **Credit** for the reporter in the release notes and any published security
  advisory, unless you request otherwise.

## Supported versions

odf-kit is pre-1.0 software under active development. Security patches are
provided only for the **latest minor release line** (currently `0.14.x`). Users
on older versions are encouraged to upgrade.

| Version  | Supported |
| -------- | --------- |
| 0.14.x   | ✅ Yes    |
| < 0.14.0 | ❌ No     |

## In scope

The following are treated as security issues and handled under this policy:

- **Parsing vulnerabilities** in odf-kit's readers (ODT, ODS, DOCX, XLSX, HTML,
  Markdown, Lexical JSON, TipTap JSON): out-of-bounds reads, infinite loops,
  unbounded memory growth, prototype pollution, or any input that causes
  odf-kit to throw an unrecoverable error in normally-correct host code.
- **ZIP-handling issues** in the underlying file-package layer: ZIP bombs,
  path traversal via crafted entry names, or any malformed package that
  produces undefined behaviour in `fflate`.
- **XML-handling issues**: XXE (XML External Entity) exposure, billion-laughs
  expansion, or any XML input that causes denial of service.
- **Output-escaping issues** in odf-kit's renderers and emitters (ODT/ODS → HTML,
  ODT → Markdown, and any future output format): document-controlled values
  reaching generated output unescaped, such that a crafted input file can inject
  markup, attributes, event handlers, or links into odf-kit's output. This
  applies whether or not the injected content is harmful inside odf-kit itself —
  these functions exist to produce output that consumers embed, so injection
  into that output is in scope here rather than being the consumer's problem.
- **Supply-chain integrity**: any concern about the integrity of published
  npm packages, the build pipeline, or the openCode mirror.

## Out of scope

The following are **not** security issues and should be reported as ordinary
issues, not vulnerabilities:

- Rendering or format-compatibility differences between odf-kit's output and
  LibreOffice, Microsoft Word, or Google Docs.
- Style or formatting features that don't yet round-trip perfectly.
- Conversion fidelity gaps (e.g., a DOCX feature that doesn't translate to ODT
  cleanly).
- Issues in dependent applications that consume odf-kit but originate in the
  consumer's code rather than in odf-kit itself.
- Values that only the calling code can supply: an option passed to an odf-kit
  function, or a document model the calling code built or changed itself
  rather than taking it unchanged from one of odf-kit's readers. odf-kit treats
  its caller's own code as trusted. A value is in scope when a crafted input
  can put it there: a file, or the HTML, Markdown, Lexical JSON or TipTap JSON
  handed to odf-kit to convert.

**Note on the first and fourth items above.** Neither excludes output-escaping
issues. If odf-kit emits a document-controlled value into its output without
escaping it for that context, the defect is odf-kit's, regardless of what the
consumer does with the output afterward. "Originates in the consumer's code"
means defects in code odf-kit did not generate — not defects in output odf-kit
did generate.

## Disclosure

Vulnerabilities will be disclosed via a GitHub Security Advisory after a fix
is published. If you've been working with the maintainer on a coordinated
disclosure, you'll receive a draft of the advisory before publication.
