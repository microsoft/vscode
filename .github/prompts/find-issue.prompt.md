---
# ⚠️: Internal use only. To onboard, follow instructions at https://github.com/microsoft/vscode-engineering/blob/main/docs/gh-mcp-onboarding.md
agent: agent
model: Claude Sonnet 4.5 (copilot)
argument-hint: Describe your issue. Include relevant keywords or phrases.
description: Search for an existing VS Code GitHub issue
tools:
  - github/*
  - agent/runSubagent
---

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).

## Your Task
1. Get the file contents of the prompt file https://github.com/microsoft/vscode-engineering/blob/main/.github/prompts/find-issue.prompt.md.
2. Follow those instructions PRECISELY to find issues related to the issue description provided. Perform your search in the `vscode` repository.
