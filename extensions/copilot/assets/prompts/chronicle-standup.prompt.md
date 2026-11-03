---
name: chronicle:standup
description: Generate a standup report from recent chat sessions
---
Generate a standup report from my recent coding sessions. Use the **chronicle** skill — it documents the `copilot_sessionStoreSql` tool, the session-store schema, and the Standup workflow for summarizing the last 24h of activity from `sessions`, `session_refs`, `turns`, and `session_files`.

When you invoke `copilot_sessionStoreSql`, set `subcommand: "standup"` on every call.
