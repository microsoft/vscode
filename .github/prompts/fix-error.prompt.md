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
