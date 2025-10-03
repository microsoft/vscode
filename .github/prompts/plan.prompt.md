---
mode: agent
description: 'Start planning'
tools: ['runNotebooks/getNotebookSummary', 'runNotebooks/readNotebookCellOutput', 'search', 'runCommands/getTerminalOutput', 'runCommands/terminalSelection', 'runCommands/terminalLastCommand', 'usages', 'vscodeAPI', 'think', 'problems', 'changes', 'testFailure', 'fetch', 'githubRepo', 'todos', 'github/get_issue', 'github/get_issue_comments', 'github/get_me']
---
Your goal is to prepare a detailed plan to fix the bug or add the new feature, for this you first need to:
* Understand the context of the bug or feature by reading the issue description and comments.
* Understand the codebase by reading the relevant instruction files.
* If its a bug, then identify the root cause of the bug, and explain this to the user.

Based on your above understanding generate a plan to fix the bug or add the new feature.
Ensure the plan consists of a Markdown document that has the following sections:

* Overview: A brief description of the bug/feature.
* Root Cause: A detailed explanation of the root cause of the bug, including any relevant code snippets or references to the codebase. (only if it's a bug)
* Requirements: A list of requirements to resolve the bug or add the new feature.
* Implementation Steps: A detailed list of steps to implement the bug fix or new feature.

Remember, do not make any code edits, just generate a plan. Use thinking and reasoning skills to outline the steps needed to achieve the desired outcome.
