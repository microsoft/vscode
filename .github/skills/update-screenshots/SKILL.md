---
name: update-screenshots
description: Download screenshot baselines from the latest CI run and commit them. Use when asked to update, accept, or refresh component screenshot baselines from CI, or after the screenshot-test GitHub Action reports differences. This skill should be run as a subagent.
---

# Update Component Screenshots from CI

When asked to update, accept, or refresh screenshot baselines from CI — or when the `Screenshot Tests` GitHub Action has failed with screenshot differences — follow this procedure to download the CI-generated screenshots and commit them as the new baselines.

## Why CI Screenshots?

Screenshots captured locally may differ from CI due to platform differences (fonts, rendering, DPI). The CI (Linux, ubuntu-latest) is the source of truth. This skill downloads the CI-produced screenshots and commits them as baselines.

## Prerequisites

- The `gh` CLI must be authenticated (`gh auth status`).
- The `Screenshot Tests` GitHub Action must have run and produced a `screenshot-diff` artifact.

## Procedure

### 1. Find the latest screenshot artifact

If the user provides a specific run ID or PR number, use that. Otherwise, find the latest run:

```bash
# For a specific PR:
gh run list --workflow screenshot-test.yml --branch <branch> --limit 5 --json databaseId,status,conclusion,headBranch

# For the current branch:
gh run list --workflow screenshot-test.yml --branch $(git branch --show-current) --limit 5 --json databaseId,status,conclusion
```

Pick the most recent run that has a `screenshot-diff` artifact (runs where screenshots matched won't have one).

### 2. Download the artifact

```bash
gh run download <run-id> --name screenshot-diff --dir .tmp/screenshot-diff
```

This downloads:
- `test/componentFixtures/.screenshots/current/` — the CI-captured screenshots
- `test/componentFixtures/.screenshots/report.json` — structured diff report
- `test/componentFixtures/.screenshots/report.md` — human-readable diff report

### 3. Review the changes

Show the user what changed by reading the markdown report:

```bash
cat .tmp/screenshot-diff/test/componentFixtures/.screenshots/report.md
```

### 4. Copy CI screenshots to baseline

```bash
# Remove old baselines and replace with CI screenshots
rm -rf test/componentFixtures/.screenshots/baseline/
cp -r .tmp/screenshot-diff/test/componentFixtures/.screenshots/current/ test/componentFixtures/.screenshots/baseline/
```

### 5. Clean up

```bash
rm -rf .tmp/screenshot-diff
```

### 6. Stage and commit

```bash
git add test/componentFixtures/.screenshots/baseline/
git commit -m "update screenshot baselines from CI"
```

### 7. Verify

Confirm the baselines are updated by listing the files:

```bash
git diff --stat HEAD~1
```

## Notes

- If no `screenshot-diff` artifact exists, the screenshots already match the baselines — no update needed.
- The `--filter` option on the CLI can be used to selectively accept only some fixtures if needed.
- After committing updated baselines, the next CI run should pass the screenshot comparison.
