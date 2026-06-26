---
# NOTE: This prompt is intended for internal use only for now.
agent: agent
argument-hint: Provide a link or issue number to find duplicates for
description: Find duplicates for a VS Code GitHub issue
model: Claude Sonnet 4.5 (copilot)
tools:
  - execute/getTerminalOutput
  - execute/runInTerminal
  - github/*
  - agent/runSubagent
---

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).

## Your Task
1. Get the file contents of the prompt file https://github.com/microsoft/vscode-engineering/blob/main/.github/prompts/find-duplicates-gh-cli.prompt.md.
2. Follow those instructions PRECISELY to identify potential duplicate issues for a given issue number in the VS Code repository.
