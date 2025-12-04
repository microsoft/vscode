---
# ⚠️: Internal use only. To onboard, follow instructions at https://github.com/microsoft/vscode-engineering/blob/main/docs/gh-mcp-onboarding.md
agent: Engineering
model: Claude Sonnet 4.5 (copilot)
argument-hint: Describe your issue. Include relevant keywords or phrases.
description: Search for an existing VS Code GitHub issue
tools:
  - github/*
  - agent/runSubagent
---

## Your Task
1. Use the GitHub MCP server to retrieve the prompt file https://github.com/microsoft/vscode-engineering/blob/main/.github/prompts/find-issue.prompt.md.
2. Follow those instructions PRECISELY to find issues related to the issue description provided. Perform your search in the `vscode` repository.
