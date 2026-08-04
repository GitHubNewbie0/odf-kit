# Reader Audit — Batch 1 findings (registry.ts, parser.ts extraction region, types.ts)

**Status:** Findings recorded — no fixes (audit rule)
**Date:** July 29, 2026
**Sources read:** `src/reader/registry.ts` (complete, 411 lines), `src/reader/parser.ts` :400–660 (parsePt, extractSpanStyle, extractParagraphStyle, expandBorder), `src/reader/types.ts` (complete, earlier this session)
**Provenance tags:** T1 grammar (spec/odf-1.3-length-datatypes.json), T2 prose, T3 fixture, T4 decision — per the adopted charter.

---

## 1. The registry is sound — and already charter-shaped

`ResolvedStyle` stores **raw ODF attribute strings verbatim** ("exactly as they appear in the XML; conversion to CSS units is the responsibility of the renderer, not the registry" — registry.ts:37). The registry is Case-1 compliant by design and predates the D8 decision. [T4, already documented in-file]

Confirmed mechanics:

- **Default-style floor works.** `resolve()` seeds from `defaults.get(family)` before walking the chain (registry.ts:339–345). Anything the writer emits as `style:default-style` will be inherited by every resolved style of that family — the premise behind option B for `defaultParagraph` is verified in source, not just asserted. Spec citations are present in-file (§16.1 for automatic-parent prohibition and precedence).
- **Script variants are captured, not lost.** `collectRawStyle` copies *every* attribute of the property elements into the bags (registry.ts:161–177). `style:font-size-asian`/`-complex` are therefore in `textProps` for every resolved style. D10's question is now precise: the data survives to the extraction boundary; only extraction ignores it.
- **Chain resolution order** is outermost-ancestor-first with child overwrite, cached per family:name. Correct place to later resolve `percent` and `font-size-rel` forms, since ancestors are fully merged before the child is read.

One registry-level gap, recorded not fixed:

- **R1 — `style:default-style` has no `style:name` and cannot be resolved *as itself*.** The floor is applied when resolving any named style, but there is no path to ask "what is the document's default paragraph style" directly — which is exactly what G3 (`model.defaultParagraph`) needs. Trivial: expose `registry.defaults`. [needs-fix, small]

## 2. Extraction boundary — where every confirmed loss lives

### extractSpanStyle (parser.ts:485)

- **B7 confirmed in full context.** `parsePt` (parser.ts:446) is the pt-only filter; grammar says `fo:font-size` = `positiveLength` | `percent` [T1]. `"0.5cm"`, `"120%"` silently dropped. The in-file doc comment is honest about the intent ("Returns undefined for other units... so callers can omit the property") — a T4 decision recorded in-file, now overturned by T1.
- **D10 boundary:** only `fo:font-size` is read; `-asian`/`-complex` present in the map, unread. Same for the entire `style:font-size-rel` triple [T1: signed length deltas]. For an Arabic document, the operative size attribute is `-complex` — Kitab-relevant.
- `fo:letter-spacing`: read, with `normal` filtered — grammar admits `normal` as keyword [T1], so filtering it loses nothing CSS can't default. Fine as-is.

### extractParagraphStyle (parser.ts:565)

- **B4 confirmed in full context:** `fo:line-height` passed through verbatim (correct per D8), but `style:line-height-at-least` and `style:line-spacing` unread [T1: both exist, nonNegativeLength and signed length respectively].
- **NEW — R2: `fo:text-indent` is never read.** ParagraphStyle has no field for it (types.ts confirms). Consequence: the DOCX converter's hanging indents (`indentFirst` → `fo:text-indent`) are **written by our own converter and invisible to our own reader** — the same emit-but-refuse-to-read asymmetry as B2 (`style:print-orientation`), one attribute over. Round-trip loss on our own output. [needs-fix]
- **NEW — R3: `fo:margin` shorthand unread at paragraph level too.** B3 was recorded against `parsePageLayout`; the same gap exists here. Precedent for the fix is *in the same file*: `expandBorder` (parser.ts:637) already does shorthand-plus-per-side-override expansion for `fo:border`, correctly. The margin fix is a copy of an existing in-file pattern. Note the T1 wrinkle: the shorthand is `nonNegativeLength|percent` while `margin-left/right` longhands are signed — expansion is safe, collapse is not.
- **NEW — R4: `fo:padding-top`/`-bottom` unread** (left/right only). Minor, but it makes the padding support look complete when it is half. Also no `fo:padding` shorthand — same expandBorder-shaped fix. [needs-fix, small]
- The `margin-top ?? space-before` precedence (parser.ts:588) is asserted without citation. Grammar has both attributes [T1]; which wins when both are present is a prose question — **needs a T2 citation or an explicit T4 decision marker.** Currently it is a bare claim of exactly the kind the charter exists to catch.

## 3. Shape of the fix (for the plan doc, not for now)

The division of labor is already correct and should be kept:

- **Registry:** verbatim bags, inheritance, floor. Add: expose defaults (R1). Later: percentage/rel resolution hooks, since only the registry has ancestor context.
- **Extraction:** the *only* place attribute→model translation happens. All B/R fixes land here. `parsePt` is replaced by the length core's `parseOdfValue`; new attributes (at-least, line-spacing, text-indent, shorthands, script variants) are added here.
- **Renderer:** consumes model values; loses its `pt`-appending special case when fontSize becomes verbatim (D9).

Nothing in Batch 1 contradicts the foundation docs. The reader's architecture anticipated the charter; the defects are all at one thin boundary, which is the best possible place for them to be.

## 5. Call-site walk (parser.ts complete — July 29)

Coverage: :400–1555 viewed directly; :1–400, :980–1182, :1555–1759 swept for every attribute read (`attrs[` / `.get("fo:|style:|svg:|text:|table:`) with the list-item region :983–1045 then viewed in full. All 1,759 lines are accounted for; no length-bearing attribute read exists outside the regions examined. The reader can now honestly be claimed "fully walked" for length-relevance.

### R5 — unstyled nodes never touch the registry, so the default-style floor never applies to them *(needs-fix, spec-conformance)*

At every extraction call site — `text:p` (parser.ts:1256), `text:h` (:1282), list-item paragraphs (:997) — `resolve()` is called **only when `text:style-name` is present**. A bare `<text:p>` (no style-name) skips resolution entirely: no floor, no `Standard` inheritance, no extraction at all.

Per ODF, `text:style-name` is optional and a paragraph without one takes the family's default style. [T2 — needs the exact section number for the citation file; the behavior claim is verified in source.] LibreOffice always assigns style names, so this is invisible in LibreOffice-authored fixtures [T3 — same corpus-homogeneity caveat as the unit bugs]; foreign producers emitting bare paragraphs will read back unstyled.

Direct consequence for G2/G3: writing `defaultParagraph` as `style:default-style` (option B) round-trips through our reader **only for styled paragraphs**. R5 must be fixed in the same release or the feature's round-trip claim is false for bare-paragraph documents. Fix is one-line-shaped: resolve with the empty/default chain when style-name is absent (resolve() already handles unknown names by returning the defaults-seeded result — passing the absent case through it is consistent).

### R6 — list-item paragraphs extract span style but not paragraph style *(needs-fix, consistency)*

parser.ts:997–1000: list-item `text:p`/`text:h` get `extractSpanStyle` but never `extractParagraphStyle`, and `ListItemNode` (types.ts) has no `paragraphStyle` field. A list item whose paragraph style sets line spacing or margins loses them. Same parallel-implementation inconsistency class as audit finding 5f (Typst emitTable) — the list-item path is a second, poorer implementation of paragraph handling. Also note: list-item headings are flattened into `spans` (level discarded) — recorded, severity low. [T4-adjacent: the flattening was presumably a deliberate Tier 2 simplification, but it is undocumented.]

### Clean findings (no action)

- **Image dimensions** (:871–874): `svg:width`/`height` read verbatim — Case 1 compliant; grammar-legal percentages pass through unharmed [T1].
- **Table geometry**: `style:column-width` read verbatim (:1115, buildCellStyle :682); span/repeat counts via `parseInt` on integer-typed attributes — correct, integers are not lengths [T1].
- **Heading resolution** uses the `paragraph` family (:1283) — correct per spec; `text:h` takes paragraph styles.
- **Row background** (:1079) resolved through the registry with the floor applied — consistent with the styled-node path.
- **:1–400 region**: Tier 1 semantic charStyles + manifest + changed-regions; the sweep shows no length-bearing attribute reads there.

### Revised queue (supersedes §4)

R1 expose defaults (G3) · R2 `fo:text-indent` · R3 `fo:margin` shorthand (paragraph + page) · R4 padding completion · R5 default floor for unstyled nodes · R6 list-item paragraphStyle · T2 citations needed: margin-top/space-before precedence; default-style-applies-to-unstyled.
