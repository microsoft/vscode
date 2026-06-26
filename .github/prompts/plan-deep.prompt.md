---
agent: Plan
description: Clarify before planning in more detail
---

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).

Before doing your research workflow, gather preliminary context using #runSubagent (instructed to use max 5 tool calls) to get a high-level overview.

Then ask 3 clarifying questions and PAUSE for the user to answer them.

AFTER the user has answered, start the <workflow>. Add extra details to your planning draft.
