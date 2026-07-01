---
name: create-draft-pr
description: Create a draft pull request for the current session. Use when the user wants to open a draft PR with the session's changes.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Create Draft Pull Request

Use the GitHub MCP server to create a draft pull request — do NOT use the `gh` CLI.

1. Run the compile and hygiene tasks (fixing any errors)
2. If there are any uncommitted changes, use the `/commit` skill to commit them
3. Review all changes in the current session
4. Write a clear, concise PR title with a short area prefix (e.g. "sessions: …", "editor: …")
5. Write a description covering what changed, why, and anything reviewers should know
6. Create the draft pull request
