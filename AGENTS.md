# AGENTS.md

Project guidance for release and publishing.

## Version Bumps (Git + npm)

Preferred flow (creates a git tag):

```bash
# Ensure clean working tree
npm version patch   # or minor/major

git push --follow-tags
```

If you need more control over tagging:

```bash
# Manually edit package.json version
# Then:
git add package.json

git commit -m "chore(release): vX.Y.Z"
git tag vX.Y.Z

git push

git push --tags
```

## npm Publish

```bash
npm login
npm publish --access public
```

If you need to validate the tarball first:

```bash
npm pack
```

## GitHub Release Notes

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "<release notes>"
```
