# Reader Test Fixtures

This folder holds input documents for the ODT reader test suite (`tests/reader/`). It also defines the **fixture convention** for the reader: where inputs come from, which style to use for which kind of test, and how every binary fixture is kept documented rather than opaque.

The goal is that a reviewer — or a bug reporter reading the test that closes their issue — can understand exactly what a test feeds in and why, without unzipping a black box.

## The three fixture tiers

Reader tests draw their input from one of three sources. Pick the **lowest tier** **that faithfully exercises the behavior under test** — real documents first.

### 1. Real `.odt` files — the default for parser and reader behavior

A real `.odt`, produced by an actual editor (LibreOffice Writer first, optionally Word or Google Docs for cross-producer coverage), committed to this folder and read through `readOdt(readFileSync(...))`.

Use this tier for anything that tests how the reader handles **what real producers** **emit**: structure parsing, style resolution, lists, tables, cell content, tracked changes, headers/footers, and every regression that originated from a real file.

This is the default. If a real document can express the case, use one.

### 2. Hand-built model objects — renderer unit tests

A `BodyNode\[\]` (or fragment thereof) constructed directly in the test file and passed to `renderHtml`. No parsing involved.

Use this tier **only** to test the renderer in isolation — given a known model, assert the HTML. It is the right tool for `html-renderer.test.ts`, because it pins renderer output without dragging the parser into the assertion. It is the wrong tool for anything that claims to test _reading_, because a hand-built model can describe a structure the parser would never actually produce.

### 3. Inline `content.xml` strings — surgical edge cases

An XML string embedded in the test, parsed in place.

Reserved for edge cases that are **awkward or impossible to author in a real editor**, or where the precise XML must sit visibly next to the assertion. Use sparingly: hand-written XML carries the realism risk described below, so prefer a real `.odt` whenever one can express the case.

## Why real documents are the default

The reader's whole job is to read what real applications write. Hand-authored input tends to be _too clean_ — tidy style names, no producer quirks, no surprises — and clean input hides exactly the bugs that real input triggers.

Two concrete examples from this project:

- **Lists inside table cells were silently dropped** (the bug that motivated this convention). It was reported with a real LibreOffice file. An idealized inline `content.xml` written from memory would likely have _passed_, because it would not reproduce whatever the real cell structure exercised.

- **`htmlToOdt` silently produced empty output** on standard HTML5. Prettier-formatted input happened to parse and worked; real-world input failed. Clean test input would have masked it indefinitely.

Same lesson both times: **a fixture that didn't come from a real producer can pass** **while the real document fails.** So real `.odt` files are the default, and the burden is on the author to justify dropping to inline XML.

## Rules for a real `.odt` fixture

1. **Minimal.** Trim to the smallest document that still exercises the behavior. Delete unrelated content, styles, and pages.

2. **From a named real producer.** Generate it in LibreOffice Writer (or another real editor). Do not hand-assemble the ZIP — that defeats the point of this tier.

3. **Documented in the index below.** Every committed `.odt` gets a row recording its producer, version, contents, and how to regenerate it.

4. **Descriptive name.** Kebab-case, named for what it contains: `list-in-cell.odt`, `nested-table-in-cell.odt`.

5. **Optional legibility companion.** For structurally interesting fixtures, you may commit the extracted `content.xml` alongside as `\<name\>.content.xml` so the structure is readable in a diff without unzipping. The `.odt` remains the source of truth the test reads; the companion is documentation only.

## Provenance & regeneration

Every real fixture records enough to **reproduce it from scratch**, so the binary is never a mystery and can be regenerated if a future editor version changes its output.

Each index entry records:

- **Producer + version** — e.g. "LibreOffice Writer 25.8.x".

- **Contents** — one line on what the document holds.

- **Recipe** — the steps to recreate it in that editor.

## Regression fixtures vs. smoke fixtures

- **Regression fixtures** are minimal, self-generated, and the primary assertion target. They are what the test suite checks against. Provenance is fully under our control.

- **Smoke fixtures** are reporter-supplied files kept for informal end-to-end confirmation (e.g., "the exact file from the issue now converts"). They are valuable for realism but carry provenance we don't own, so they are **not** the primary assertion target and are clearly marked as smoke material in the index. A minimal self-generated regression fixture always backs the actual assertions.

## Fixture index

| File                                                                        | Producer | Contents | Type |
| --------------------------------------------------------------------------- | -------- | -------- | ---- |
| _(none committed yet — first entry lands with the list-in-cell regression)_ |          |          |      |

**Planned inaugural fixture — `list-in-cell.odt`**

- **Producer:** LibreOffice Writer (26.2.3.2 (x86_64))

- **Contents:** A single table whose cell contains a two-item bulleted list, plus the related block-in-cell cases (a heading in a cell, a cell with two paragraphs, a nested table in a cell) so one minimal real document covers the full root-cause fix.

- **Recipe:** New Writer document → insert a table → in a cell, type two lines and apply the bullet List style → in another cell apply a Heading paragraph style → in another cell press Enter to create two paragraphs → in another cell insert a small table → delete all other content → Save As `.odt`. Record the LibreOffice version in this row.

- **Type:** regression

**Smoke fixture — wheymann's `Bullet-Test.odt`** (issue reporter's file): kept for end-to-end confirmation that the originally reported document now converts. Smoke only; the `list-in-cell.odt` regression fixture backs the assertions.

## Adding a fixture — quick checklist

1. Can a renderer-only model object test this? → tier 2, no file needed.

2. Otherwise, can a real `.odt` express it? → tier 1. Generate it minimally in a real editor, name it descriptively, add an index row with producer/version/contents/recipe.

3. Only if a real editor genuinely cannot author the case → tier 3 inline `content.xml`, with a comment explaining why a real file wouldn't do.

4. Keep it minimal. Keep it documented.
