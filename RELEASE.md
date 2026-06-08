# Release checklist

Steps to publish a new version of odf-kit. Run in order; do not skip steps.

## 1. Verify the pipeline is clean

```powershell
cd C:\dev\odf-kit2
npm run format:check
npm run lint
npm run build
npm run test
npm run validate-html
```

All five must pass with no errors before proceeding.

## 2. Stage the badge artifact

`npm version patch` creates an autocommit that does not include
`docs/index.html`. Stage it first so it is included.

```powershell
git add docs/index.html
```

## 3. Bump the version

```powershell
npm version patch -m "chore: release v%s"
```

This updates `package.json`, runs `prepare` (which syncs `src/version.ts`
and `docs/index.html`), commits everything staged plus its own changes, and
creates a git tag.

## 4. Push the commit and tag

```powershell
git push origin main
git push origin --tags
```

## 5. Publish to npm

```powershell
npm publish
```

Verify the new version appears at https://www.npmjs.com/package/odf-kit.

## 6. Update publiccode.yml

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

## 7. Create the GitHub release

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

## 8. Verify

- [ ] npm: https://www.npmjs.com/package/odf-kit shows the new version
- [ ] GitHub: Releases page shows the new release with notes
- [ ] GitHub Actions: `Create GitLab release` workflow run completed green
- [ ] GitLab: https://gitlab.opencode.de/oc00013173229/odf-kit/-/releases shows the new release
- [ ] openCode: https://gitlab.opencode.de/oc00013173229/odf-kit shows updated softwareVersion
