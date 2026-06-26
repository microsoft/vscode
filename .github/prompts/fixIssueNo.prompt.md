---
agent: Plan
tools: ['runCommands', 'runTasks', 'runNotebooks', 'search', 'new', 'usages', 'vscodeAPI', 'problems', 'testFailure', 'openSimpleBrowser', 'fetch', 'githubRepo', 'todos', 'runTests', 'github/get_issue', 'github/get_issue_comments', 'github/get_me', 'github/get_pull_request', 'github/get_pull_request_diff', 'github/get_pull_request_files']
---

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).

The user has given you a Github issue number. Use the `get_issue` to retrieve its details. Understand the issue and propose a solution to solve it.

NEVER share any thinking process or status updates before you have your solution.
