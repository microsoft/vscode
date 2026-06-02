---
name: update-screenshots
description: Download screenshot baselines from the latest CI run and commit them. Use when asked to update, accept, or refresh component screenshot baselines from CI, or after the screenshot-test GitHub Action reports differences. This skill should be run as a subagent.
---

# Update Component Screenshots from CI

Screenshot baselines are **no longer stored in the repository**. They are managed by an external screenshot service (`hediet-screenshots.azurewebsites.net`). The CI workflow uploads screenshots to this service and diffs them automatically.

When the `Checking Component Screenshots` GitHub Action detects changes, it posts a PR comment with before/after comparisons. No manual baseline updates are needed — the screenshots on the `main` branch commit become the new baselines automatically after merge.

## What Changed

- Baseline images were removed from `test/componentFixtures/.screenshots/baseline/`.
- Git LFS is no longer used for screenshot storage.
- The screenshot service stores images keyed by commit SHA and handles diffing.

## If Screenshots Need Investigation

1. Check the PR comment posted by the CI workflow for visual diffs.
2. Download the `screenshots` artifact from the CI run for the raw captured images:

```bash
gh run download <run-id> --name screenshots --dir .tmp/screenshots
```

3. Compare locally if needed. The artifact contains the full set of captured screenshots.
