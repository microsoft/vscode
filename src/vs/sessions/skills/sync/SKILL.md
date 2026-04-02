---
name: sync
description: Sync the current session branch with its upstream branch, or publish the current session branch to a remote. Use when the user asks to sync a branch, pull latest changes, rebase onto upstream, push current branch, publish branch, or set upstream.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Sync Changes

Sync the current session branch with its upstream branch, or publish the current session branch to a remote. Use when the user asks to sync a branch, pull latest changes, rebase onto upstream, push current branch, publish branch, or set upstream.

## Workflow

1. Check for uncommitted changes first. If there are uncommitted changes, use the `/commit` skill to commit them before continuing.
2. Check whether the current session branch has an upstream branch.
3. If the current session branch has an upstream branch:
   3.1. Check ahead/behind counts first. If the branch is already in sync (0 ahead, 0 behind), stop and report that no sync is needed.
      ```
      git rev-list --left-right --count HEAD...@{u}
      ```
   3.2. Fetch only the upstream remote.
      ```
      git fetch <upstream-remote>
      ```
   3.3. Rebase explicitly onto the upstream tracking branch.
      ```
      git rebase @{u}
      ```
   3.4. If there are merge conflicts, resolve them, stage the resolved files, and continue the rebase.
      ```
      git add <resolved-files>
      git rebase --continue
      ```
      If conflict resolution is unclear, ask the user how to proceed. If the user wants to stop the rebase, abort it:
      ```
      git rebase --abort
      ```
4. If the current session branch does not have an upstream branch:
   4.1. Determine the remote to publish to.
      - If there is only one remote, use it.
      - If there are multiple remotes, use the #tool:vscode/askQuestions tool to ask which remote to use.
   4.2. Publish the current branch and set upstream in one step.
      ```
      git push -u <remote> HEAD
      ```

## Validation

After the workflow completes, validate the result with explicit checks:

1. Verify the upstream branch is configured:
   ```
   git rev-parse --abbrev-ref --symbolic-full-name @{u}
   ```
2. Verify the working tree is clean:
   ```
   git status --porcelain
   ```
3. Verify sync state (ahead/behind):
   ```
   git rev-list --left-right --count HEAD...@{u}
   ```

If the branch was newly published, also verify the branch is available on the selected remote.
