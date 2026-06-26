---
name: get-search-view-results
description: 'Get the current search results from the Search view in VS Code'
---

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../../../../../FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).

# Getting Search View Results

1. VS Code has a search view, and it can have existing search results.
2. To get the current search results, you can use the VS Code command `search.action.getSearchResults`.
3. Run that command via the `copilot_runVscodeCommand` tool. Make sure to pass the `skipCheck` argument as true to avoid checking if the command exists, as we know it does.