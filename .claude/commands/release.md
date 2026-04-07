Create a versioned release that triggers PyPI publishing via trusted publisher.

## Arguments

$ARGUMENTS — version bump type: `patch`, `minor`, or `major` (optional, defaults
to analyzing changes)

## Instructions

1. Determine the version bump:
   - If `$ARGUMENTS` specifies `patch`, `minor`, or `major`, use that
   - If not specified, analyze commits since the last tag to determine:
     - `major`: breaking changes (commits with `!` or `BREAKING CHANGE`)
     - `minor`: new features (`feat:` commits)
     - `patch`: fixes, refactors, docs, chores only

2. Get the current version:
   - Check `git tag --sort=-v:refname | head -1` for the latest tag
   - If no tags exist, start at `v0.1.0`
   - Also check `pyproject.toml` `version` field

3. Calculate the new version following semver.

4. Verify readiness:
   - `git status` — must be on `main` with no uncommitted changes
   - `git pull origin main` — must be up to date
   - Warn and stop if not on `main` or if there are uncommitted changes

5. Update the version in `pyproject.toml`:
   - Change `version = "X.Y.Z"` to the new version
   - Also update `__version__` in `src/astrowidget/__init__.py`

6. Ensure the JS bundle is current:
   - Copy `js/inline_widget.js` to `src/astrowidget/static/widget.js`
   - Verify `src/astrowidget/static/widget.js` exists

7. Run tests to verify everything works:
   ```bash
   pixi run test-py
   ```
   Stop if tests fail.

8. Verify the package builds:
   ```bash
   pip install build && python -m build
   ```
   Check that `dist/astrowidget-X.Y.Z-py3-none-any.whl` contains
   `astrowidget/static/widget.js`.

9. Commit the version bump:
    ```bash
    git add pyproject.toml src/astrowidget/__init__.py src/astrowidget/static/widget.js
    git commit -m "chore(release): prepare vX.Y.Z"
    ```

10. Create the git tag:
    ```bash
    git tag -a vX.Y.Z -m "vX.Y.Z"
    ```

11. Ask for confirmation before pushing.

12. Push the commit and tag:
    ```bash
    git push origin main --follow-tags
    ```

13. Create a GitHub release (triggers the publish workflow):
    ```bash
    gh release create vX.Y.Z --title "vX.Y.Z" \
      --generate-notes \
      --latest
    ```

    This uses `.github/release.yml` to auto-generate categorized release notes:
    - PRs labeled `breaking` appear under **Breaking Changes**
    - PRs labeled `enhancement` appear under **New Features**
    - PRs labeled `bug` appear under **Bug Fixes**
    - PRs labeled `documentation` appear under **Documentation**
    - All other PRs appear under **Other Changes**
    - Commits from `dependabot` and `pre-commit-ci` are excluded

    The `.github/workflows/publish.yml` workflow will then automatically:
    - Build the JS bundle and Python package
    - Publish to PyPI via trusted publisher (OIDC)

14. Confirm: "Released vX.Y.Z — <release URL>"
    - Remind user to check the GitHub Actions run for PyPI publish status

## Prerequisites

Before the first release, the following must be configured:

1. **PyPI**: Add a pending trusted publisher at
   [pypi.org/manage/account/publishing](https://pypi.org/manage/account/publishing/)
   with owner=`uw-ssec`, repo=`astrowidget`, workflow=`publish.yml`,
   environment=`pypi`

2. **GitHub**: Create a `pypi` environment in the repo settings
   (Settings → Environments → New environment → name it `pypi`)

## Version Guidelines

| Bump            | When                               | Example              |
| --------------- | ---------------------------------- | -------------------- |
| `patch` (0.1.X) | Bug fixes, docs, chores, refactors | `v0.1.1` → `v0.1.2` |
| `minor` (0.X.0) | New features, non-breaking changes | `v0.1.2` → `v0.2.0` |
| `major` (X.0.0) | Breaking changes, major rewrites   | `v0.2.0` → `v1.0.0` |

## Release Note Labels

For the auto-generated release notes to categorize PRs correctly, apply these
labels to PRs before merging:

| Label | Release Notes Section |
|---|---|
| `breaking` | Breaking Changes |
| `enhancement` | New Features |
| `bug` | Bug Fixes |
| `documentation` | Documentation |
| `ignore-for-release` | Excluded from notes |

PRs without these labels appear under **Other Changes**.

## Rules

- Must be on `main` branch with no uncommitted changes
- All tests must pass before releasing
- Never create a release from a feature branch
- Tag format is always `vX.Y.Z` (with `v` prefix)
- The wheel must include `astrowidget/static/widget.js`
- Ask for confirmation before pushing the tag and creating the release
