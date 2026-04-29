---
agent: agent
description: 'Fix an unhandled error from the VS Code error telemetry dashboard'
argument-hint: Paste the GitHub issue URL for the error-telemetry issue
tools: ['edit', 'search', 'execute/getTerminalOutput', 'execute/runInTerminal', 'read/terminalLastCommand', 'read/terminalSelection', 'execute/createAndRunTask', 'execute/runTask', 'read/getTaskOutput', 'search/usages', 'read/problems', 'search/changes', 'execute/testFailure', 'todo', 'execute/runTests', 'web/fetch', 'web/githubRepo']
---

The user has given you a GitHub issue URL for an unhandled error from the VS Code error telemetry dashboard. Fetch the issue to retrieve its details (error message, stack trace, hit count, affected users).

Follow the `fix-errors` skill guidelines to fix this error. Key principles:

1. **Read the error construction code first.** Before proposing any fix, search the codebase for where the error is constructed (the `new Error(...)` or custom error class instantiation). Read the surrounding code to understand:
   - What conditions trigger the error (thresholds, validation checks, categorization logic)
   - What parameters, classifications, or categories the error encodes
   - What the intended meaning of each category is and what action each warrants
   - Whether the error is a symptom of invalid data, a threshold-based warning, or a design-time signal
   Use this understanding to determine the correct fix strategy. Do NOT assume what the error means from its message alone — the construction code is the source of truth.
2. **Do NOT fix at the crash site.** Do not add guards, try/catch, or fallback values at the bottom of the stack trace. That only masks the problem.
3. **Trace the data flow upward** through the call stack to find the producer of invalid data.
4. **If the producer is cross-process** (e.g., IPC) and cannot be identified from the stack alone, **enrich the error message** with diagnostic context (data type, truncated value, operation name) so the next telemetry cycle reveals the source. Do NOT silently swallow the error.
5. **If the producer is identifiable**, fix it directly.

After making changes, check for compilation errors via the build task and run relevant unit tests.

## Submitting the Fix

After the fix is validated (compilation clean, tests pass):

1. **Create a branch**: `git checkout -b <github-username>/<short-description>` (e.g., `bryanchen-d/fix-notebook-index-error`).
2. **Commit**: Stage changed files and commit with a message like `fix: <brief description> (#<issue-number>)`.
3. **Push**: `git push -u origin <branch-name>`.
4. **Create a draft PR** with a description that includes these sections:
   - **Summary**: A concise description of what was changed and why.
   - **Issue link**: `Fixes #<issue-number>` so GitHub auto-closes the issue when the PR merges.
   - **Trigger scenarios**: What user actions or system conditions cause this error to surface.
   - **Code flow diagram**: A Mermaid swimlane/sequence diagram showing the call chain from trigger to error. Use participant labels for the key components (e.g., classes, modules, processes). Example:
     ````
     ```mermaid
     sequenceDiagram
         participant A as CallerComponent
         participant B as MiddleLayer
         participant C as LowLevelUtil
         A->>B: someOperation(data)
         B->>C: validate(data)
         C-->>C: data is invalid
         C->>B: throws "error message"
         B->>A: unhandled error propagates
     ```
     ````
   - **Manual validation steps**: Concrete, step-by-step instructions a reviewer can follow to reproduce the original error and verify the fix. Include specific setup requirements (e.g., file types to open, settings to change, actions to perform). If the error cannot be easily reproduced manually, explain why and describe what alternative validation was performed (e.g., unit tests, code inspection).
   - **How the fix works**: A brief explanation of the fix approach, with a note per changed file.
5. **Monitor the PR — BLOCKING**: You MUST NOT complete the task until the monitoring loop below is done.
   - Wait 2 minutes after each push, then check for Copilot review comments using `gh pr view <number> --json reviews,comments` and `gh api repos/{owner}/{repo}/pulls/{number}/comments`.
   - If there are review comments, evaluate each one:
     - If valid, apply the fix in a new commit, push, and **resolve the comment thread** using the GitHub GraphQL API (`resolveReviewThread` mutation with the thread's node ID).
     - If not applicable, leave a reply explaining why.
     - After addressing comments, update the PR description if the changes affect the summary, diagram, or per-file notes.
   - **Re-run tests** after addressing review comments to confirm nothing regressed.
   - After each push, repeat the wait-and-check cycle. Continue until **two consecutive checks return zero new comments**.
6. **Verify CI**: After the monitoring loop is done, check that CI checks are passing using `gh pr checks <number>`. If any required checks fail, investigate and fix. Do NOT complete the task with failing CI.
