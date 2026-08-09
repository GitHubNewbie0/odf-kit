# CLAUDE.md — odf-kit standing law

odf-kit: Apache-2.0 TypeScript library for OpenDocument files (ODT/ODS). ESM-only, Node 22+, runtime deps fflate + marked only. **Mission: make ODF the demonstrably correct, easy choice for builders.** Sole maintainer: Scott. Environment: **Windows, PowerShell, native paths** (`C:\dev\odf-kit2`).
This file is the imperative projection of `../odf-kit-internal/docs/methodology.md` (canonical). Never edit this file directly for law changes — law changes there first.

## Article One (govern every action by this)

Build all work as proofs from axioms, in authority order:
- **T1** grammar — `spec/odf-1.3-length-datatypes.json` and the extracted schema files. Never state spec facts from memory.
- **T2** prose — section-cited; see `../odf-kit-internal/docs/odf-prose-constraints.md`. No section number → not a citation.
- **T3** producer behavior — a named fixture with `meta:generator` intact. No fixture → the claim is unverified and never load-bearing.
- **T4** our decisions — cite the decision ID (D8, D4, G5 …). **Never postulate arbitrarily**: before any T4 choice of weight, survey comparable software, conventions, examples, and our adopters' preferences, and record what the survey found. If you find yourself picking an answer just to keep moving — stop, that is a decision for Scott.

Tag citations in comments: `// T1: …` `// T4: D8a, …`. No uncited magic numbers in touched code. Where the spec is silent, record the silence. When work goes wrong, descend to the axiom layer that determines the answer and rebuild there — a higher-layer fix is a patch, and a patch is a finding, not a solution.

## Session start — always

1. Read `../odf-kit-internal/state/` — highest-numbered `state*.md` **and its addendum**; the addendum wins on conflict.
2. Read the plan doc for the current task. **No plan doc → no implementation work** — surface the gap to Scott instead.
3. `v0_14_0-plan-v2.md` is **SUPERSEDED — never execute it.** The authoritative, executable restructure specification is `../odf-kit-internal/docs/v0_14_0-plan-v3.md` (all nine supersession amendments ruled 2026-08-08; A7 length ruling applied 2026-08-09).
4. **D12 precondition:** the v0.14.0 consolidation may not begin until methodology.md, this file, a refreshed internal repo, and a Scott-reviewed plan doc all exist. **All four exist as of the state71 refresh (2026-08-09)** — verify `state71.md` is present in `../odf-kit-internal/state/` before treating the precondition as met.

## Discuss-before-code (sovereign)

Design decisions are made by Scott in chat, never improvised here. Unmade decision encountered (API shape, architecture, scope, spec interpretation) → **stop and surface the question**. Executing a settled plan → proceed freely.

## Testing (mandatory on every change)

- Every touched feature ships Jest tests whose **expected values cite T1–T4** in the test name or a comment. A test that merely mirrors current behavior has no citation to give — that is a prohibited change-detector.
- **Bug fixes: failing test first** (confirm red), then fix (confirm green).
- Coverage is **ratchet-only** — never below the recorded baseline. Length/unit work adds property tests (fast-check inside Jest).
- Full pipeline gate before every commit — **read scripts and order from `package.json`, never from memory.** Every generated ODF fixture passes the OASIS validator with zero errors/warnings.
- Slice execution for large work: each slice individually committed, gated, revertible; stop for Scott's review between slices.

## Units & lengths (D8 — settled; details in `../odf-kit-internal/docs/units-and-lengths-foundation.md`)

- Handed truth (ODF input, caller values): preserve **verbatim** — value, unit, lexical form. Never convert or reformat.
- Handed a conversion (twips/EMU/px): exact **BigInt-rational interval method**, shortest decimal in the interval. **No floats, no `toFixed`, no `Math.round` on lengths — anywhere.**
- Output units (D8a): typography → **pt**; geometry → one unit per document by digit-count vote; format detection tolerance **±0.005in**. Never emit px, em, rem, `auto`, `inherit`, or `calc()` into ODF attributes.

## Page layout & styles (D-rulings, all CLOSED — cite by ID)

- **D4:** reader is **name-blind** on master pages — resolve segment 1's mold (first body reference, else first defined); later `style:master-page-name` references are switch points, never the document's mold; **count reachable molds and disclose when >1**. Writer names its master page `"Standard"`; the string `"Default"` is removed everywhere.
- **D1:** read `style:print-orientation`; exact-compared dimensions stay authoritative; disagreement → warning.
- **D3:** document-level defaults are written as `style:default-style` (§16.4-encouraged).
- **D5:** new conversion options live in `OdtBaseOptions`.
- **D6 (retargeted 2026-08-09):** ODS page-layout-properties get real geometry (B6 fix) in **0.14.x** — all pending ODS work (B6 geometry, direction support) is deferred until after the v0.14.0 restructure, so it lands once on final paths. v0.14.0 itself is move-only: no functional changes to any pathway.
- **D7 (amended 2026-08-09):** attribute coverage per the ruled table; `style:writing-mode` is READ **and WRITTEN** — converter-mapped in both directions since v0.13.14 (#81/#82), builder-exposed via `ParagraphOptions.writingMode`, writer type narrowed to the eight-value T1 union (`ba76865`). Reader-side stays `string` deliberately (reader types describe what files contain).
- **D10:** script variants (`-asian`/`-complex`): **detect + disclose** — warn when complex-script values differ from the western values the model reports. Full modeling deferred.
- **G5:** page background color — READ both `fo:background-color` and `draw:fill`/`draw:fill-color` (prefer `fo:` on disagreement, warn); WRITE both.
- Deferred-with-foundation (do not build unprompted, do not remove groundwork): `pageSequence` multi-segment model; reader `nominal` field; full script-variant modeling; `SpanStyle.fontSize` type migration (rides 1.0).

## spec/ directory

`*.rng` and `*-schema.html` are **verbatim OASIS files — never modify** (license). Generated files are **regenerated via `tools/` scripts, never hand-edited**. Annotations go in `spec/NOTICE.md`.

## Fixtures (T3 corpus)

- `tests/*/fixtures/` are **permanent evidence — never overwrite or regenerate**; new evidence is a new file.
- New fixtures: kebab-case; `meta:generator` intact (**never open a fixture in an editor before inspection**); provenance note (producer, version, how authored, source).
- LibreOffice closed before reading any fixture it has open (`.~lock.*`).

## Public surface (census & attw)

- The export census (`tools/export-census.mjs`) is the mechanical record of the public surface. Regenerate after any surface change (`npm run build` first); the committed output at `412d584` is the v0.14.0 **before-picture** — restructure verification is **diff against it, never trust**.
- `@arethetypeswrong/cli` (`attw`) is a **standing check** (ruled 2026-08-09): devDependency, mandatory RELEASE.md step, joins the gate unless runtime proves obnoxious. Run after any exports/typesVersions change.

## v0.14.0 restructure sessions (rider — governs any session executing v3)

- All work on branch `v0.14.0-restructure`; **never merge, never tag, never publish** — those are Scott's, via RELEASE.md.
- One phase at a time; within Phase 2, one numbered move at a time; **full gate after every move; one commit per move**, message naming the move number.
- Phase 0 (census before-picture) is **already committed at `412d584`** — verify `tools/export-census.json` exists, then start at Phase 1.
- Any discrepancy between v3 and the repo: **STOP and report. Never improvise, never work around** — that discipline caught a published-path deletion in v2; it is not ceremony.

## Git & release discipline

- Small focused commits; **single-line `-m` messages**; **explicit-path `git add`** (blanket adds are deny-listed).
- `git commit` locally: fine. **Any `git push`: always ask Scott.** openCode delisting workaround: empty commit to the **`gitlab` remote only — never `origin`**.
- Version bumps: `npm version` only (triggers `sync-version.js`). **Releases: open `RELEASE.md`, follow step-by-step in order** (includes SECURITY.md supported-versions update). Never release from memory; if RELEASE.md looks wrong, stop and flag.
- API stability: 0.x minors are stable API — no breaking changes, no public renames without an explicit Scott decision. **The v0.14.0 export-map expansion is explicitly authorized** (ruled 2026-08-09): the strict-additive guarantee governs — every existing path keeps working forever via legacy aliases; the map grows per `v0_14_0-plan-v3.md` (18 new paths incl. `./types`, `./length`, `/html/normalize`), and `./html-normalizer` is a shipped public path that must never be removed. Behavioral output changes (exactness fixes) allowed per plan docs, always CHANGELOG-listed.

## Scope & boundaries

Write scope: this repo. Additional context: `../odf-kit-internal` (read freely; write only session-handoff notes there). **Never request access beyond these two trees.**

## Self-correction & proportionality

Claims about files or state not currently inspected: flag as unverified or don't make them. When corrected by an artifact, record the correction visibly — it is the method working. This rigor is for consequential work; a three-line fix needs the gate, a cited test, and a decent commit message — not a dossier. Unsure which regime applies → ask.

## Session end

Write a handoff note (done / pending / surprises) to `../odf-kit-internal/state/` as `state<N>-cc-<topic>.md`, and remind Scott to commit + `git push backup main` in the internal repo.
