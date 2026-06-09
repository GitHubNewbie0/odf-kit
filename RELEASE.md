# Release checklist

Steps to publish a new version of odf-kit. Run in order; do not skip steps.

## 0. Verify npm authentication

```powershell
npm whoami
```

If this errors with `E401`, `ENEEDAUTH`, or anything other than your npm username, your token is missing or expired and you must restore it before step 7.

Since the npm Shai-Hulud incident of May 2026, npm has tightened token policy:

- **Bypass-2FA tokens are permanently revoked.** Do not create one — even if the npm UI offers the option for "CI/CD" use.
- **Granular access tokens with write permission expire every 90 days.** You will need to rotate at least quarterly. Set a calendar reminder when you create a new token.
- **Classic / legacy tokens were removed in November 2025.** Only granular tokens exist now.

To restore authentication:

1. Visit https://www.npmjs.com/settings/<your-username>/tokens
2. Generate New Token → **Granular Access Token**
3. Token name: `odf-kit-publish-local-YYYY-MM` (descriptive helps when reviewing later)
4. Expiration: 90 days (current maximum for write tokens)
5. Packages and scopes → Permissions: **Read and write**, scope: **Only select packages → odf-kit**
6. **Do NOT check Bypass 2FA.** Leave it unchecked. Local publishes use interactive browser-based 2FA at publish time, which is correct.
7. Generate. Copy the token immediately — it is not shown again.

Install locally:

```powershell
npm config set //registry.npmjs.org/:_authToken "npm_paste-the-token-here"
npm whoami
```

`whoami` should now print your username.

## 1. Pull latest from origin

If any commits landed on `main` since you last pulled (Dependabot merges,
direct pushes from another machine, etc.), pulling now avoids a push
rejection later in the release.

```powershell
cd C:\dev\odf-kit2
git pull origin main
```

## 2. Update CHANGELOG.md

Convert the `[Unreleased]` section into a versioned section for the release
you are about to cut, and prepare a fresh empty `[Unreleased]` for the next
cycle.

In `CHANGELOG.md`:

1. Rename the existing `## [Unreleased]` heading to
   `## [X.Y.Z] - YYYY-MM-DD`, using today's date.
2. Insert a new empty `## [Unreleased]` section above it.
3. At the bottom of the file, update the reference links:
   - Change `[Unreleased]: ...compare/vPREV...HEAD` to
     `[Unreleased]: ...compare/vX.Y.Z...HEAD`.
   - Add a new `[X.Y.Z]: ...releases/tag/vX.Y.Z` line directly below the
     `[Unreleased]` line.

## 3. Verify the pipeline is clean

```powershell
npm run format:check
npm run lint
npm run build
npm run test
npm run validate-html
```

All five must pass with no errors before proceeding. If `format:check`
reports issues, run `npm run format` to fix and re-run `format:check`.

## 4. Commit the release-content changes

`npm version patch` (step 5) requires a fully clean working tree — it will
refuse to run if anything is staged or modified, even if you intend those
changes to be part of the release. So commit everything that belongs in this
release as a regular commit first.

Stage everything that's part of the release content (CHANGELOG.md, any
source/test/doc changes, README updates):

```powershell
git add CHANGELOG.md README.md src/ tests/ docs/
git status
```

Verify only intended files are staged. Then commit:

```powershell
git commit -m "feat(area): short description of the release"
```

Use whatever commit message convention is appropriate for the change
(`feat`, `fix`, `chore`, etc.). This commit's message becomes the
human-readable summary of the release in `git log`.

Verify tree is now clean:

```powershell
git status
```

Must show "nothing to commit, working tree clean" before proceeding.

## 5. Bump the version

```powershell
npm version patch -m "chore: release v%s"
```

This updates `package.json` and `package-lock.json`, creates a commit, and
creates a git tag.

Note: `npm version` does **NOT** run the `prepare` hook, so
`docs/index.html` is NOT bumped by this step. The next step fixes that.

## 6. Sync docs/index.html and amend the release commit

`scripts/sync-version.js` writes the current version into `docs/index.html`
(the landing-page badge) and `src/version.ts` (gitignored, runtime). Run it
now, fold the result into the release commit via amend, and re-tag:

```powershell
node scripts\sync-version.js
git add docs/index.html
git commit --amend --no-edit
git tag -d vX.Y.Z
git tag vX.Y.Z
```

Replace `vX.Y.Z` with the version just bumped (e.g. `v0.13.7`). The
re-tag step is required because amending changes the commit SHA, leaving
the original tag pointing at an orphaned commit.

Verify:

```powershell
git show HEAD --stat
```

The release commit must list three files: `docs/index.html`,
`package-lock.json`, `package.json`. If `docs/index.html` is missing, the
amend did not capture it — diagnose before continuing.

## 7. Push the commits and tag

```powershell
git push origin main
git push origin --tags
```

## 8. Publish to npm

```powershell
npm publish
```

A browser window will open asking you to approve the publish via 2FA. This
is expected behavior — granular tokens without Bypass 2FA require
interactive confirmation per publish. Complete the prompt in the browser;
the CLI waits and then proceeds.

Verify the new version appears at https://www.npmjs.com/package/odf-kit:

```powershell
npm view odf-kit version
```

May take 30 seconds for the registry to propagate.

## 9. Update publiccode.yml

Update `softwareVersion` and `releaseDate` in `publiccode.yml` to the new
version and today's date. Validate at https://editor.opencode.de, download
the verbatim output, and save to the repo root. Never commit a hand-edited
version — always use the validator's output.

```powershell
git add publiccode.yml
git commit -m "chore: update publiccode.yml to vX.Y.Z"
git push origin main
```

The GitLab sync will push the updated `publiccode.yml` to the mirror, where
the openCode.de indexer will pick it up (allow 24–48 hours for re-indexing).

## 10. Create the GitHub release

```powershell
gh release create vX.Y.Z --generate-notes
```

Replace `vX.Y.Z` with the version tag just pushed (e.g. `v0.13.7`).
`--generate-notes` populates the release body from commits since the last
release. Review the generated notes in the browser after creation; edit
via the "Edit release" button if needed.

Creating the GitHub release triggers the `Create GitLab release` workflow
automatically, which pushes the tag to the GitLab mirror and creates a
matching release there. No manual GitLab steps required.

## 11. Verify

- [ ] npm: https://www.npmjs.com/package/odf-kit shows the new version
- [ ] GitHub: Releases page shows the new release with notes
- [ ] GitHub Actions: `Create GitLab release` workflow run completed green
- [ ] GitLab: https://gitlab.opencode.de/oc00013173229/odf-kit/-/releases shows the new release
- [ ] openCode: https://gitlab.opencode.de/oc00013173229/odf-kit shows updated softwareVersion (allow 24–48 hours)

---

## Troubleshooting

**`npm version patch` errors with "Git working directory not clean"**
Step 4 was skipped or didn't fully commit. `npm version` refuses to run on
a dirty tree even if changes are staged. Commit (or stash) everything before
running step 5.

**`npm publish` errors with `E404 — Not Found - PUT https://registry.npmjs.org/odf-kit`**
The npm token is missing, expired, or revoked. The 404 (rather than 401) is
npm's way of refusing the publish without leaking package-name existence to
unauthorized callers. Go back to step 0 and restore the token.

**`docs/index.html` shows the previous version's badge after release**
Step 6 was skipped. The landing page still shows the old version. Run step
6 manually now and amend (or, if the release commit has already been
pushed, commit the sync as a follow-up `chore: catch up docs/index.html
badge to vX.Y.Z`).

**GitHub release notes look thin or wrong**
`gh release create --generate-notes` reads commit messages between the
previous tag and the new tag. If your feature commit has a clear,
descriptive message (as in step 4), the notes will reflect it. If they
don't, edit via the "Edit release" button on the release page in the
browser.