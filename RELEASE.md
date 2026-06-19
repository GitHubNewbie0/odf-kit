# Release checklist — odf-kit

Print this page and tick each box by hand as you go. **Run the steps in order;
do not skip.** Each checklist item maps to a numbered section below with the
exact commands and detail.

> The version-bump commit now syncs the landing-page badge automatically (via the
> `version` npm hook). There is no longer any manual `docs/index.html` amend/retag
> step — that bug is fixed in `package.json`.

---

## Release: v_________   Date: 20___-___-___

```
PRE-FLIGHT
[ ]  0. npm auth OK (npm whoami)
[ ]  1. Pull latest main
[ ]  2. No security PRs you meant to include are still open (glance)

PREPARE CONTENT (everything below the tag must be done BEFORE step 7)
[ ]  3. CHANGELOG.md updated (entry + footer links)
[ ]  4. publiccode.yml updated (softwareVersion + releaseDate, via validator)
[ ]  5. Full pipeline green (format:check, lint, build, test, validate-html)
[ ]  6. Release content committed (explicit paths; unrelated changes separate)

CUT THE RELEASE
[ ]  7. npm version patch   (badge auto-syncs into the version commit + tag)
[ ]  8. Push commits + tag   (git push origin main --follow-tags)
[ ]  9. npm publish   (browser 2FA expected)

PUBLISH METADATA
[ ] 10. GitHub release (gh release create --generate-notes) — THEN EDIT the body
[ ] 11. Verify everything (npm, GitHub, GitLab, openCode listing)
```

---

## 0. Verify npm authentication

```powershell
npm whoami
```

If this errors (`E401`, `ENEEDAUTH`, anything but your username), the token is
missing or expired — restore it before step 9.

Token policy (post May-2026 npm changes):
- **Bypass-2FA tokens are permanently revoked.** Do not create one.
- **Granular write tokens expire every 90 days.** Rotate quarterly; set a reminder.
- Local publishes use interactive browser 2FA at publish time — that is correct.

To restore: npmjs.com → settings → tokens → Generate New → **Granular Access
Token**, name `odf-kit-publish-local-YYYY-MM`, 90-day expiry, **Read and write**
scoped to **only odf-kit**, **Bypass 2FA unchecked**. Copy it once, then:

```powershell
npm config set //registry.npmjs.org/:_authToken "npm_paste-token-here"
npm whoami
```

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
the fix rides *in* the release rather than trailing it afterward. Dependabot
handles the routine updates; this is only to avoid shipping while a security fix
you meant to include is unmerged.

## 3. Update CHANGELOG.md  *(before the tag — do not defer this)*

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

## 4. Update publiccode.yml  *(before the tag)*

Update `softwareVersion` and `releaseDate` (today). **Never hand-edit and commit
directly** — edit at https://editor.opencode.de, click Validate, download the
verbatim output, replace the local file, then commit. The validator is offline
(syntax/completeness only); it does not modify the file or contact any directory.

## 5. Verify the pipeline is clean

```powershell
npm run format:check
npm run lint
npm run build
npm run test
npm run validate-html
```

All five must pass. If `format:check` fails, run `npm run format` then re-check.
(This is the project's full gate. There is no separate ODF-validator step here.)

## 6. Commit the release content

`npm version patch` (step 7) refuses to run on a dirty tree, so commit everything
that belongs in this release first.

Stage release content **by explicit path** — do not blanket-add, or unrelated
working-tree changes (tooling, ignores, security overrides) get swept in. Those
belong in their own separate commit, made before or after this one.

```powershell
git add CHANGELOG.md publiccode.yml src/ tests/ docs/   # adjust to what changed
git status                                                # verify ONLY intended files
git commit -m "fix(area): short description of the release"
git status                                                # must be clean before step 7
```

Use a clear, descriptive message — it becomes the human summary in `git log` and
feeds the GitHub release notes (step 10).

## 7. Bump the version  *(badge auto-syncs — no amend/retag)*

```powershell
npm version patch -m "chore: release v%s"
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

A browser window opens for 2FA approval — this is expected (granular tokens
without Bypass 2FA require interactive confirmation per publish). Complete it.

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

---

## Troubleshooting

**`npm version` errors "Git working directory not clean"** — step 6 didn't fully
commit. `npm version` refuses a dirty tree. Commit or stash everything first.

**`npm publish` errors `E404 PUT .../odf-kit`** — token missing/expired/revoked
(npm returns 404, not 401, to avoid leaking package existence). Restore via step 0.

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
