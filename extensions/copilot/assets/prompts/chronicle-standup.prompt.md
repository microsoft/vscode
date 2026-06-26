---
name: chronicle:standup
description: Generate a standup report from recent chat sessions
---

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../../../FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).

Generate a standup report from my recent coding sessions. Use the **chronicle** skill — it documents the `copilot_sessionStoreSql` tool, the session-store schema, and the Standup workflow for summarizing the last 24h of activity from `sessions`, `session_refs`, `turns`, and `session_files`.

When you invoke `copilot_sessionStoreSql`, set `subcommand: "standup"` on every call.
