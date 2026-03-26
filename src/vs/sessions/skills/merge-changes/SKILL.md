---
name: merge-changes
description: Merge changes from the topic branch to the merge base branch. Use when the user wants to merge their session's work back to the base branch.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Merge Changes

Merge changes from the topic branch to the merge base branch.
The context block appended to the prompt contains the source and target branch information.

1. If there are any uncommitted changes, use the `/commit` skill to commit them
2. Merge the topic branch into the merge base branch. If there are any merge conflicts, resolve them and commit the merge. When in doubt on how to resolve a merge conflict, ask the user for guidance on how to proceed
