---
name: sync-upstream
description: Update a stale session branch by rebasing onto the latest origin. Use when the upstream has moved significantly and the session needs to catch up, resolving conflicts by preserving upstream changes and adapting session work to fit.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Update Branch

Rebase the current session branch onto the latest upstream so the work stays grounded in origin.

## Workflow

1. If there are uncommitted changes, use the `/commit` skill to commit them first.
2. Fetch the latest upstream and rebase onto it:
   ```
   git fetch origin
   git rebase origin/main
   ```
   Use the appropriate base branch if it is not `main`.

## Conflict Resolution

When conflicts arise, **upstream always wins**:

- **Never alter upstream logic, APIs, or patterns** to accommodate session changes.
- **Adapt session work** to fit the new upstream — rename, restructure, or rewrite as needed while preserving the session's goals.
- After resolving each conflict, `git add` the files and `git rebase --continue`.

## Validation

After the rebase completes, verify the result still compiles and meets the session's objectives. If session changes no longer make sense against the updated upstream, explain what changed and propose a revised approach.
