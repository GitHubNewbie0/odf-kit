# Release checklist — odf-kit

Print this page and tick each box by hand as you go. **Run the steps in order;
do not skip.** Each checklist item maps to a numbered section below with the
exact commands and detail.

> The version-bump commit now syncs the landing-page badge automatically (via the
> `version` npm hook). There is no longer any manual `docs/index.html` amend/retag
> step — that bug is fixed in `package.json`.

---

## Release: v_________ Date: 20___-_**-**_

```
PRE-FLIGHT
[ ]  0. npm auth OK (npm whoami)
[ ]  0b. Backup pushes current (git push backup ... in both repos)
[ ]  0c. Cross-tree document checks at or below baseline (maintainer only)
[ ]  1. Pull latest main
[ ]  2. No security PRs you meant to include are still open (glance)

PREPARE CONTENT (everything below the tag must be done BEFORE step 7)
[ ]  3. CHANGELOG.md updated (entry + footer links)
[ ]  4. publiccode.yml updated (softwareVersion + releaseDate, via validator)
[ ]  4b. SECURITY.md supported-versions line matches this release
[ ]  5. Full pipeline green (format:check, lint, typecheck:aliases, build, test, validate-html, check:side-effects, attw esm-only, attw default)
[ ]  5b. Regenerate docs/reference (npm run docs:reference; commit rides step 6)
[ ]  6. Release content committed (explicit paths; unrelated changes separate)

CUT THE RELEASE
[ ]  7. npm version <patch|minor|major>   (badge auto-syncs into the commit + tag)
        This release is: v_________  bump type: _________
[ ]  8. Push commits + tag   (git push origin main --follow-tags)
[ ]  9. npm publish   (browser 2FA expected)

PUBLISH METADATA
[ ] 10. GitHub release (gh release create --generate-notes) — THEN EDIT the body
[ ] 11. Verify everything (npm, GitHub, GitLab, openCode listing)
[ ] 11b. Smoke-test the published package from a fresh directory (see 11b below — it CANNOT run from the repo)

SECURITY RELEASE ONLY
[ ] 12. Request the CVE — AFTER the fix is live on npm
[ ] 13. Publish the advisory once the CVE is assigned
```

---

## 0. Verify npm authentication

```powershell
npm whoami
```

If this errors (`E401`, `ENEEDAUTH`, anything but your username),
re-authenticate before step 9:

```powershell
npm login
npm whoami
```

A browser window opens for approval. **This is the procedure — not a fallback.**
The credential is written to `.npmrc` and persists past the terminal session,
until revoked or until npm's account session policy expires it.

Token policy (post May-2026 npm changes):

- **Bypass-2FA tokens are permanently revoked.** Do not create one.
- Publishes use interactive browser 2FA at publish time — that is correct.

**Why not a granular token.** `odf-kit-publish-local-*` granular tokens were the
documented procedure through v0.14.1. They expire on a hard 90-day clock, which
is what failed at step 0 on the v0.14.2 release; `npm login` was used instead and
worked. The 90-day expiry did have one virtue — it forced a failure _here_, at
step 0, rather than at step 9 after the tag was pushed. Running `npm whoami` as
step 0 preserves that check independently of how the credential was obtained.
That is why this step exists and why it runs first.

## 0b. Confirm backup pushes are current

The bare repos under `Documents\odf-kit\backup\` are what Proton syncs offsite —
the working directories are not synced. `odf-kit-internal` has **no origin**, so
its bare repo is the only other copy of every brief, plan, state file, and
evidence record.

A bare repo contains only what has been pushed to it, and uncommitted work is
outside the backup entirely. So the step is commit **then** push, in both repos:

```powershell
cd C:\dev\odf-kit2
git status                # must be clean
git push backup main

cd C:\dev\odf-kit-internal
git status                # must be clean
git push backup main
```

A release is a bad moment to discover the only machine holding the planning
record is ahead of its only backup.

## 0c. Cross-tree document checks _(maintainer only)_

Canon and the internal plan documents assert things about this repository —
script names, paths, counts, the gate's own shape. Nothing in the public gate
can check them: the gate runs here, and those documents live in the internal
repo. `run-checks.mjs` runs from there, with truth taken from this repo.

```powershell
cd C:\dev\odf-kit-internal
node checks\run-checks.mjs
```

Exit 0 means nothing rose above its baseline. **Exit 1 means new drift** — a
document now claims something this repository contradicts. Read the findings
before going further: a stale claim about a script name, a subpath count, or a
removed file is exactly the kind of thing that makes a later step in this
checklist wrong.

Findings below the baseline are the recorded backlog, not a blocker. When one
is fixed, lower the baseline in the same commit:
`node checks\run-checks.mjs --update-baseline`.

**This step runs early on purpose.** Its failures invalidate the checklist
itself, so they are worth knowing before the release content is prepared. It is
not part of the gate, which verifies the code; this verifies what the documents
say about it.

Anyone without the internal repo skips this step — the release is not blocked
on it, but the maintainer's copy of it is.

## 1. Pull latest from origin

```powershell
cd C:\dev\odf-kit2
git pull origin main
```

Catches Dependabot merges or other-machine pushes before they cause a push
rejection later.

## 2. Security glance (not a task — just a look)

Check there are no Dependabot/CodeQL security PRs you intended to fold into this
release still sitting open. If one should ship in this release, merge it now so
the fix rides _in_ the release rather than trailing it afterward. Dependabot
handles the routine updates; this is only to avoid shipping while a security fix
you meant to include is unmerged.

## 3. Update CHANGELOG.md _(before the tag — do not defer this)_

This is the step most often skipped. The published npm tarball includes
CHANGELOG.md, so if the entry isn't in the release commit, the published
changelog is permanently stale.

1. Add a new `## [X.Y.Z] - YYYY-MM-DD` section below `## [Unreleased]`
   (leave `[Unreleased]` in place, empty, for the next cycle).
2. At the bottom of the file, update the reference links:
   - Change `[Unreleased]: ...compare/vPREV...HEAD` to
     `[Unreleased]: ...compare/vX.Y.Z...HEAD`.
   - Add `[X.Y.Z]: ...releases/tag/vX.Y.Z` directly below the `[Unreleased]` line.

Match the existing entry style (bold lead-in, `[#NN](...issues/NN)` links,
contributor thanks).

## 4. Update publiccode.yml _(before the tag)_

Update `softwareVersion` and `releaseDate` (today). **Never hand-edit and commit
directly** — edit at https://editor.opencode.de, click Validate, download the
verbatim output, replace the local file, then commit. The validator is offline
(syntax/completeness only); it does not modify the file or contact any directory.

**Check `releaseDate` in the downloaded file before committing.** The editor's
date picker rolls the date back a day (UTC vs. CDT): entered 2026-09-13, returned
2026-09-12 — the validator's only change to the file. Correct it by hand; the
result is then byte-identical to what you uploaded. **This recurs on every
evening release.**

## 4b. Check SECURITY.md supported versions _(before the tag)_

SECURITY.md declares which release line receives security patches. It ships in
the npm tarball, so a stale line is published and permanent for that version.

```powershell
Select-String -Path SECURITY.md -Pattern "currently"
```

Confirm the stated line matches the line this release is on. If it doesn't,
update the prose sentence and both table rows:

| Version   | Supported |
| --------- | --------- |
| 0.NEW.x   | ✅ Yes    |
| < 0.NEW.0 | ❌ No     |

Read the line on every release, not just minor bumps — a patch release within
the current line needs no change, but reading it is how a stale line gets
caught. **It read `0.13.x` from v0.14.0 through v0.14.1**, so every release in
that window published a policy declaring the current line unsupported.

Nothing catches this automatically. `doc-drift.mjs` derives truth from
`package.json` and the filesystem but does not compare SECURITY.md's version
claim against the version being released. Teaching it to would retire this step.

If SECURITY.md changed, it rides the step 6 release-content commit.

## 5. Verify the pipeline is clean

```powershell
npm run format:check
npm run lint
npm run typecheck:aliases
npm run build
npm run test
npm run validate-html
npm run check:side-effects
npx attw --pack . --profile esm-only          # must exit 0
npx attw --pack .                              # DEFAULT profile — see below
```

All must pass. If `format:check` fails, run `npm run format` then re-check.

This is the project's full gate (`typecheck:aliases` joined 2026-08-09; it
type-checks the legacy-alias suite that `npm test` alone is blind to).
There is no separate ODF-validator step here.

The DEFAULT attw profile is EXPECTED to exit non-zero: `CJSResolvesToESM`
is the permanent, deliberate ESM-only property — never "fix" it. What
you are checking is the node10 rows: count the greens and compare to
the published path count (32 as of v0.14.0). Fewer greens than paths
means an exports/typesVersions regression — stop.

**Count mechanically, not by eye.** Eye-counting the output gave 31 on the
v0.14.2 release — a false stop condition:

```powershell
npx attw --pack . | Select-String '^"odf-kit' | Measure-Object
```

Cross-check against the exports map in `package.json` if the numbers disagree.

## 5b. Regenerate the generated API reference

```powershell
npm run docs:reference
git status    # expect changes only under docs/reference/
```

TypeDoc output is committed (GitHub Pages serves from docs/), so the
reference must be regenerated from the final release source or the
published site documents the previous version. Changes ride the step 6
release-content commit. `docs/reference` is excluded from prettier and
validate-html by design (generated markup — see the Phase 6b commit);
do not "fix" vnu complaints in generated files.

## 6. Commit the release content

`npm version patch` (step 7) refuses to run on a dirty tree, so commit everything
that belongs in this release first.

Stage release content **by explicit path** — do not blanket-add, or unrelated
working-tree changes (tooling, ignores, security overrides) get swept in. Those
belong in their own separate commit, made before or after this one.

```powershell
git add CHANGELOG.md publiccode.yml SECURITY.md src/ tests/ docs/   # adjust to what changed
git status                                                # verify ONLY intended files
git commit -m "fix(area): short description of the release"
git status                                                # must be clean before step 7
```

Use a clear, descriptive message — it becomes the human summary in `git log` and
feeds the GitHub release notes (step 10).

## 7. Bump the version _(badge auto-syncs — no amend/retag)_

```powershell
# Choose the bump that matches the release — decide this when you fill
# in the header, not at the keyboard:
#   patch = fixes only        minor = new features, no breaks
#   major = breaking changes
npm version <patch|minor|major> -m "chore: release v%s"
```

This bumps `package.json`/`package-lock.json`, then runs the `version` npm hook
(`node scripts/sync-version.js && git add docs/index.html`) which writes the new
version into the landing-page badge and stages it **before** the commit and tag.
So the version commit and tag already contain the correct badge — the old manual
`docs/index.html` sync/amend/retag dance is gone.

Verify the badge landed in the commit:

```powershell
git show HEAD --stat
```

Should list `docs/index.html`, `package.json`, `package-lock.json`. If
`docs/index.html` is missing, the `version` hook didn't fire — stop and diagnose
(`src/version.ts` is gitignored and won't appear; that's expected).

The bump type is part of the release content review — if the CHANGELOG
entry describes features, `patch` is wrong; stop and reconsider.

## 8. Push the commits and tag

```powershell
git push origin main --follow-tags
```

`--follow-tags` pushes main and only the annotated tags reachable from it (not
all local tags — safer than `--tags`). The push to main triggers the GitLab
mirror sync; the tag triggers downstream release automation.

## 9. Publish to npm

```powershell
npm publish
```

A browser window opens for 2FA approval — this is expected; 2FA approval is
required per publish. Complete it.

```powershell
npm view odf-kit version          # may take ~30s to propagate
```

## 10. Create the GitHub release — then EDIT the notes

```powershell
gh release create vX.Y.Z --generate-notes
```

**`--generate-notes` only captures merged-PR commits.** Direct pushes to main
(typical for your fixes) are **invisible** to it — so the auto-generated body will
list only Dependabot PRs and miss the actual headline change. **Edit the release
body** (browser "Edit release", or `gh release edit`) to add the real change:
lead with the fix, keep the dependency list below it, keep the Full Changelog link.

Creating the GitHub release triggers the `Create GitLab release` workflow, which
mirrors the tag and creates the matching GitLab release. No manual GitLab steps.

## 11. Verify

```
[ ] npm:    npmjs.com/package/odf-kit shows the new version
[ ] GitHub: Releases page shows the release, notes edited to lead with the fix
[ ] Actions: "Create GitLab release" workflow run is green
[ ] GitLab:  gitlab.opencode.de/.../odf-kit/-/releases shows the release
[ ] openCode: project still appears in the directory after the mirror push
```

**openCode / EU directory notes** (see `opencode-eu-directory-investigation.md`):

- **openCode.de** re-indexes **on each mirror push** (near-instant), not on a
  timer. If the project drops from the directory after a push, that is the known
  intermittent issue — the documented probe is an empty commit
  (`git commit --allow-empty`) to re-trigger evaluation.
- **EU Interoperable** catalogue is a **separate** pipeline: a weekly batch crawler
  with a 60-day vitality score, likely fed from openCode. It does **not** react to
  individual pushes; its drops/adds are slow and unrelated to release timing. Do
  not conflate the two.

## 11b. Smoke-test the published package

**`tools/smoke.mjs` cannot run from the repo.** It fails immediately with
`ENOENT: tools/census.json`. It is designed to run from a **fresh project
directory** with `odf-kit` installed from the registry — that is the point: it
tests what consumers actually get, not the working tree.

```powershell
node tools/export-census.mjs --out-dir C:\temp\odfsmoke
mkdir C:\temp\smoketest ; cd C:\temp\smoketest
copy C:\temp\odfsmoke\tools\export-census.json census.json
copy C:\dev\odf-kit2\tools\smoke.mjs smoke.mjs
npm init -y
npm pkg set type=module      # npm init -y writes type:commonjs; odf-kit is ESM-only
npm install odf-kit
node smoke.mjs
```

Omitting `npm pkg set type=module` makes every import fail.

Asserts that every subpath imports, that census symbols and VERSION are present,
and that a markdown→ODT→model round-trip works. Return to the repo directory
afterward.

`smoke.mjs` resolves `census.json` and `node_modules` relative to its own
location, so it must sit **in** the scratch directory — not run from the repo
with a path argument. Exit 0 = pass; exit 1 lists the failures.

## 12. Request the CVE _(security releases only — AFTER step 9)_

Only applies when the release fixes a reported vulnerability.

**Nothing about the advisory happens before the fix is live on npm.** Publishing
— or doing anything that could lead to publishing — while the defect is
unpatched tells attackers about a live vulnerability in a library people are
using.

Once `npm view odf-kit version` shows the new version:

1. Go to the draft advisory on the repository's Security → Advisories page.
2. Set **Patched versions** to the version just published.
3. Request the CVE. GitHub acts as a CNA; review takes roughly **3 working
   days** and **publishes nothing** — the ID stays reserved until you publish.

Three separate actions, none of which discloses anything on its own: creating
the draft, requesting the CVE, and publishing. A draft is visible only to the
maintainer and anyone credited or added to it, and appears in no public
repository view.

Also offer the patch to the reporter for testing if they offered — their
confirmation is worth more than your own, and it costs nothing now that the fix
is public anyway.

## 13. Publish the advisory _(security releases only — after the CVE lands)_

Once the CVE is assigned, publish the advisory.

- Confirm **Patched versions** is set and correct.
- Credit the reporter unless they asked otherwise — SECURITY.md promises this.
- Publishing is **irreversible**.

On publication the advisory enters the GitHub Advisory Database, Dependabot
begins alerting downstream consumers automatically, and it redistributes through
GitHub's API and Atom feed. Nothing further to do.

**One advisory per release.** If several are in flight, each publishes with the
release that fixes it — never ahead of its own fix, and never bundled with an
advisory whose fix has not shipped.

---

## Troubleshooting

**`npm version` errors "Git working directory not clean"** — step 6 didn't fully
commit. `npm version` refuses a dirty tree. Commit or stash everything first.

**`npm publish` errors `E404 PUT .../odf-kit`** — credential missing or expired
(npm returns 404, not 401, to avoid leaking package existence). Re-authenticate
via step 0.

**Badge still shows the previous version after release** — the `version` hook
didn't run (check it exists in `package.json` scripts:
`"version": "node scripts/sync-version.js && git add docs/index.html"`). As a
one-off recovery: `node scripts\sync-version.js`, commit
`chore: catch up docs/index.html badge to vX.Y.Z`, push.

**GitHub release notes look thin / miss the fix** — expected from
`--generate-notes` on direct-push changes (step 10). Edit the body manually.

**Project dropped from openCode directory** — push an empty commit to re-trigger
the indexer; see the investigation doc. Do not confuse with the EU catalogue,
which updates weekly on its own cycle.

**Advisory published before the fix was live** — not recoverable. Publishing is
irreversible and Dependabot will already have alerted consumers. This is why 12
and 13 sit after step 9.
