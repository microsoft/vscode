---
name: update-pr
description: Update the pull request for the current session. Use when the user wants to push new changes to an existing PR.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Update Pull Request

Update the existing pull request for the current session.
The context block appended to the prompt contains the pull request information.

1. Check whether the pull request has any commits that are not yet present on the current branch (incoming changes). If there are any incoming changes, pull them into the current branch and resolve any merge conflicts
2. Run the compile and hygiene tasks (fixing any errors)
3. If there are any uncommitted changes, use the `/commit` skill to commit them
4. If the outgoing changes introduce significant changes to the pull request, update the pull request title and description to reflect those changes
5. Update the pull request with the new commits and information
