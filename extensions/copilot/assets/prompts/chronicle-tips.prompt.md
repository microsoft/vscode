---
name: chronicle:tips
description: Get personalized tips based on your chat session usage patterns
---

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../../../FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).

Analyze my recent chat session history and give me personalized tips to improve my workflow. Use the **chronicle** skill — it documents the `copilot_sessionStoreSql` tool, the session-store schema, and the Tips workflow for investigating usage patterns from `sessions`, `turns`, `session_files`, and `session_refs`.

When you invoke `copilot_sessionStoreSql`, set `subcommand: "tips"` on every call.
