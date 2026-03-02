# Merge-base screenshot comparison idea

Instead of comparing against checked-in baselines, compare HEAD screenshots against merge-base screenshots using a git worktree.

## Approach

1. Capture screenshots at HEAD → `.screenshots/head/`
2. Find merge base (`git merge-base HEAD origin/main` for PRs, `HEAD~1` for pushes)
3. `git worktree add /tmp/merge-base-worktree <merge-base-sha>`
4. In the worktree: install deps, build vite, capture screenshots → `.screenshots/base/`
5. Compare: `screenshot:compare --baseline .../base --current .../head`
6. Clean up worktree

## Benefits

- No need to maintain baseline screenshots in the repo
- The merge base IS the baseline — only shows what the PR actually changed
- Status check goes red only when the PR introduces visual changes

## Workflow changes needed

- `fetch-depth: 50` on checkout
- `statuses: write` permission
- Steps for: determine merge base, create worktree, install deps (merge base), build vite (merge base), capture screenshots (merge base), compare, clean up
- Upload artifact paths change from `current/` to `head/` and `base/`
- Status state: `failure` when `CHANGED > 0`, `success` otherwise

## CLI commands

```bash
# Capture at head
npx component-explorer screenshot --project ./test/componentFixtures/component-explorer.json --target ./test/componentFixtures/.screenshots/head

# Capture at merge base (using worktree project path)
npx component-explorer screenshot --project /tmp/merge-base-worktree/test/componentFixtures/component-explorer.json --target ./test/componentFixtures/.screenshots/base

# Compare
npx component-explorer screenshot:compare \
  --project ./test/componentFixtures \
  --baseline ./test/componentFixtures/.screenshots/base \
  --current ./test/componentFixtures/.screenshots/head \
  --report ./test/componentFixtures/.screenshots/report
```
