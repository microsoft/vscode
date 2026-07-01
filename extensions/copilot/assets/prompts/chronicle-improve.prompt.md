---
name: chronicle:improve
description: Improve agent instructions based on friction patterns in your session history
---
Analyze my recent chat session history for friction patterns and suggest improvements to my agent instructions file. Use the **chronicle** skill — it documents the `copilot_sessionStoreSql` tool, the session-store schema, and the Improve workflow for detecting repeated failures, user corrections, and recurring friction across sessions, then proposing data-grounded additions to the project's agent instructions.

When you invoke `copilot_sessionStoreSql`, set `subcommand: "improve"` on every call.
