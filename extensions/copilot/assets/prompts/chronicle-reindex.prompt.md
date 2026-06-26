---
name: chronicle:reindex
description: Rebuild the local session index and sync to cloud
---

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../../../FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).

Reindex my session store to pick up any missing sessions. Add 'force' to re-process already indexed sessions.

When you invoke `copilot_sessionStoreSql`, set `subcommand: "reindex"`.
