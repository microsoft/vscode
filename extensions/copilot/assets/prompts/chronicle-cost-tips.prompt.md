---
name: chronicle:cost-tips
description: Get personalized tips to reduce token usage and Copilot cost
---

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../../../FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).

Analyze my recent chat session history and give me personalized, data-grounded tips to reduce token usage and Copilot cost. Use the **chronicle** skill — it documents the `copilot_sessionStoreSql` tool, the session-store schema, and the Cost Tips workflow for finding expensive sessions, token-heavy patterns, and concrete habit changes.

When you invoke `copilot_sessionStoreSql`, set `subcommand: "cost-tips"` on every call.
