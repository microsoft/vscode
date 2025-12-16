---
# NOTE: This prompt is intended for internal use only for now.
agent: Engineering
argument-hint: Provide a link or issue number to find duplicates for
description: Find duplicates for a VS Code GitHub issue
model: Claude Sonnet 4.5 (copilot)
tools:
  - execute/getTerminalOutput
  - execute/runInTerminal
  - github/*
  - agent/runSubagent
---

## Your Task
1. Use the GitHub MCP server to retrieve the prompt file https://github.com/microsoft/vscode-engineering/blob/main/.github/prompts/find-duplicates-gh-cli.prompt.md.
2. Follow those instructions PRECISELY to identify potential duplicate issues for a given issue number in the VS Code repository.
