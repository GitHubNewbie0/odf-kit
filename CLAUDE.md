# CLAUDE.md — odf-kit standing law

odf-kit: Apache-2.0 TypeScript library for OpenDocument files (ODT/ODS). ESM-only, Node 22+, runtime deps fflate + marked only. Mission: open formats for governments, non-profits, small orgs. Sole maintainer: Scott. Environment: **Windows, PowerShell, native paths** (`C:\dev\odf-kit2`).

## Session start — always

1. Read `../odf-kit-internal/state/` — highest-numbered `state*.md` **and its addendum** are the authoritative handoff. Where they conflict, the addendum wins.
2. Read the plan doc named for the current task. **No plan doc → no implementation work**; ask Scott instead (see Discuss-before-code).
3. `v0_14_0-plan-v2.md` (the 1,871-line subpath restructure) is **SUPERSEDED — never execute it.**

## Discuss-before-code (sovereign rule)

Design decisions are made by Scott in chat sessions, never improvised here. If a task requires an unmade decision — API shape, architecture, scope, spec interpretation — **stop and surface the question**; do not pick an answer to keep moving. Execution of a settled plan: proceed freely.

## Provenance charter (adopted, mandatory)

Every load-bearing claim traces to an authority, tagged in comments:
- **T1** grammar — `spec/odf-1.3-length-datatypes.json` (generated from the OASIS RNG)
- **T2** prose — section-cited, see `../odf-kit-internal/docs/odf-prose-constraints.md`
- **T3** producer behavior — a named fixture in `tests/*/fixtures/` (generator string intact)
- **T4** authored decision — cite the decision ID (D8, G5, …) and its doc

No uncited magic numbers in code you write or touch. Never state spec facts from memory — read the extracted `spec/` files or the fixture. If a needed fact has no authority yet, that's a finding to record, not a gap to paper over.

## spec/ directory

- `*.rng` and `*-schema.html` are **verbatim OASIS files: never modify** (license requires it). Annotations go in `spec/NOTICE.md`.
- Generated files (`odf-1.3-length-datatypes.*`, `citations/*`) are **regenerated via `tools/` scripts, never hand-edited**.

## Testing (mandatory on every change)

- Every touched feature ships with Jest tests. **Expected values must cite T1–T4** in the test name or a comment. A test that merely mirrors current behavior has no citation to give — that's the tell it's wrong.
- **Bug fixes: write the failing test first**, confirm it fails, then fix. Red-then-green is proof, not ceremony.
- Coverage is **ratchet-only**: never let the recorded baseline drop. No retrofit campaigns.
- Length/unit work: property tests (fast-check inside Jest) for algebraic guarantees.
- Full pipeline gate before every commit — **read the exact scripts and order from `package.json`, never from memory.** (Currently: format:check → lint → build → test → validate-html; build already chains build:tool-page.)
- Every generated ODF fixture must pass the OASIS validator (jar in repo) with zero errors/warnings.

## Units & lengths (D8 — settled system; details in `../odf-kit-internal/docs/units-and-lengths-foundation.md`)

- **Handed truth** (ODF input, caller-supplied values): preserve **verbatim** — value, unit, lexical form. Never convert, never reformat.
- **Handed a conversion** (twips/EMU/px): exact BigInt-rational interval method, shortest decimal in the interval. **No floating-point arithmetic in length code. No `toFixed`. No `Math.round` on lengths.**
- Typography → pt; geometry → one unit per document by digit-count vote. Never emit px, em, rem, `auto`, `inherit`, or `calc()` into ODF attributes.

## Fixtures (T3 corpus)

- `tests/*/fixtures/` files are **permanent evidence — never overwrite or regenerate** an existing fixture; add new ones.
- New fixtures: kebab-case names, `meta:generator` intact, provenance noted (producer + version + how authored).
- LibreOffice must be closed before reading a fixture it has open (`.~lock.*` files).

## Git & release discipline

- Commits: small, focused; **single-line `-m` messages** (multi-line paste breaks PowerShell); **explicit-path `git add`**, never `git add .` or `-A`.
- `git commit` locally: fine. **`git push` of any kind: always ask Scott first.** Special rule: openCode delisting workaround pushes an empty commit to the **`gitlab` remote only — never `origin`**.
- Version bumps: `npm version patch|minor` only (triggers `sync-version.js`) — never hand-edit versions.
- **Releases: open `RELEASE.md` and follow it step by step in order.** Never run a release from memory. If RELEASE.md looks wrong, stop and flag it. RELEASE.md includes updating the SECURITY.md supported-versions table.

## Scope & boundaries

- Write scope: this repo. Additional context: `../odf-kit-internal` (read freely; write only session-state/handoff notes there, at session end). **Never request access beyond these two trees.**
- API stability: 0.x minors are stable API. No breaking changes, no export-map changes, no renames of public symbols without an explicit Scott decision. Behavioral output changes (e.g. exactness fixes) are allowed per plan docs but must be listed for the CHANGELOG.
- The published subpath layout (`/reader`, `/docx`, domain paths) is **correct and stays** — do not "improve" it.

## Proportionality

This rigor is for work where wrongness is expensive or claims are numerous. A three-line fix needs the pipeline gate, a test, and a decent commit message — not a dossier. When unsure which regime applies, ask.

## Session end

Write a brief handoff note (what was done, what's pending, any surprises) to `../odf-kit-internal/state/` as `state<N>-cc-<topic>.md`, and remind Scott to `git commit` + `git push backup` in the internal repo.
