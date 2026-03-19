---
agent: agent
description: 'Fix an unhandled error from the VS Code error telemetry dashboard'
argument-hint: Paste the GitHub issue URL for the error-telemetry issue
tools: ['edit', 'search', 'execute/getTerminalOutput', 'execute/runInTerminal', 'read/terminalLastCommand', 'read/terminalSelection', 'execute/createAndRunTask', 'execute/runTask', 'read/getTaskOutput', 'search/usages', 'read/problems', 'search/changes', 'execute/testFailure', 'todo', 'execute/runTests', 'web/fetch', 'web/githubRepo']
---

The user has given you a GitHub issue URL for an unhandled error from the VS Code error telemetry dashboard. Fetch the issue to retrieve its details (error message, stack trace, hit count, affected users).

Follow the `fix-errors` skill guidelines to fix this error. Key principles:

1. **Do NOT fix at the crash site.** Do not add guards, try/catch, or fallback values at the bottom of the stack trace. That only masks the problem.
2. **Trace the data flow upward** through the call stack to find the producer of invalid data.
3. **If the producer is cross-process** (e.g., IPC) and cannot be identified from the stack alone, **enrich the error message** with diagnostic context (data type, truncated value, operation name) so the next telemetry cycle reveals the source. Do NOT silently swallow the error.
4. **If the producer is identifiable**, fix it directly.

After making changes, check for compilation errors via the build task and run relevant unit tests.

## Submitting the Fix

After the fix is validated (compilation clean, tests pass):

1. **Create a branch**: `git checkout -b <github-username>/<short-description>` (e.g., `bryanchen-d/fix-notebook-index-error`).
2. **Commit**: Stage changed files and commit with a message like `fix: <brief description> (#<issue-number>)`.
3. **Push**: `git push -u origin <branch-name>`.
4. **Create a draft PR** with a description that includes:
   - A summary of the change.
   - `Fixes #<issue-number>` so GitHub auto-closes the issue when the PR merges.
   - What scenarios may trigger the error.
   - The code flow explaining why the error gets thrown and goes unhandled.
   - Steps a user can follow to manually validate the fix.
   - How the fix addresses the issue, with a brief note per changed file.
5. **Monitor the PR** for Copilot review comments. Wait 1-2 minutes after each push for Copilot to leave its review, then check for new comments. Evaluate each comment:
   - If valid, apply the fix in a new commit, push, and **resolve the comment thread** using the GitHub GraphQL API (`resolveReviewThread` mutation with the thread's node ID).
   - If not applicable, leave a reply explaining why.
   - After addressing comments, update the PR description if the changes affect the summary, code flow explanation, or per-file notes.
6. **Repeat monitoring** after each push: wait 1-2 minutes, check for new Copilot comments, and address them. Continue this loop until no new comments appear.
7. **Re-run tests** after addressing review comments to confirm nothing regressed.
