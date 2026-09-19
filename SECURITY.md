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
include a description of the issue, a reproduction case if possible, and any
suggested mitigation.

## What to expect

- **Acknowledgement** within 7 days of your report.
- **Initial assessment** (confirmed / not reproducible / out of scope) within 14
  days.
- **Resolution timeline** depends on severity. Critical issues are prioritised
  for the next release; less severe issues are scheduled into the normal release
  flow.
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
