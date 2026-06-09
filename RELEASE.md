# Release checklist

Steps to publish a new version of odf-kit. Run in order; do not skip steps.

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
cycle. This is part of the release commit, not a separate commit.

In `CHANGELOG.md`:

1. Rename the existing `## [Unreleased]` heading to
   `## [X.Y.Z] - YYYY-MM-DD`, using today's date.
2. Insert a new empty `## [Unreleased]` section above it. Leave the body
   empty; subsections (`### Added`, `### Fixed`, etc.) get added as work
   accumulates after the release.
3. At the bottom of the file, update the reference links:
   - Change `[Unreleased]: ...compare/vPREV...HEAD` to
     `[Unreleased]: ...compare/vX.Y.Z...HEAD`.
   - Add a new `[X.Y.Z]: ...releases/tag/vX.Y.Z` line directly below the
     `[Unreleased]` line, above the previous version's line.

Stage the file so `npm version patch` picks it up:

```powershell
git add CHANGELOG.md
```

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

## 4. Stage the badge artifact

`npm version patch` creates an autocommit that does not include
`docs/index.html`. Stage it first so it is included.

```powershell
git add docs/index.html
```

## 5. Bump the version

```powershell
npm version patch -m "chore: release v%s"
```

This updates `package.json`, runs `prepare` (which syncs `src/version.ts`
and `docs/index.html`), commits everything staged (CHANGELOG.md,
docs/index.html) plus its own changes (package.json, package-lock.json,
src/version.ts), and creates a git tag.

## 6. Push the commit and tag

```powershell
git push origin main
git push origin --tags
```

## 7. Publish to npm

```powershell
npm publish
```

Verify the new version appears at https://www.npmjs.com/package/odf-kit.

## 8. Update publiccode.yml

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
the openCode.de indexer will pick it up.

## 9. Create the GitHub release

```powershell
gh release create vX.Y.Z --generate-notes
```

Replace `vX.Y.Z` with the version tag just pushed (e.g. `v0.13.6`).
`--generate-notes` populates the release body from commits since the last
release. Review the generated notes in the browser after creation; edit if
needed.

Creating the GitHub release triggers the `Create GitLab release` workflow
automatically, which pushes the tag to the GitLab mirror and creates a
matching release there. No manual GitLab steps required.

## 10. Verify

- [ ] npm: https://www.npmjs.com/package/odf-kit shows the new version
- [ ] GitHub: Releases page shows the new release with notes
- [ ] GitHub Actions: `Create GitLab release` workflow run completed green
- [ ] GitLab: https://gitlab.opencode.de/oc00013173229/odf-kit/-/releases shows the new release
- [ ] openCode: https://gitlab.opencode.de/oc00013173229/odf-kit shows updated softwareVersion