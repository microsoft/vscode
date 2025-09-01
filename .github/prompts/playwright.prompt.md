---
mode: agent
description: 'Use playwright & automation tools to _see_ the code changes you have made'
tools: ['codebase', 'usages', 'vscodeAPI', 'problems', 'changes', 'testFailure', 'openSimpleBrowser', 'fetch', 'findTestFiles', 'searchResults', 'githubRepo', 'todos', 'runTests', 'editFiles', 'runNotebooks', 'search', 'new', 'runCommands', 'runTasks', 'vscode-playwright-mcp', 'get_commit', 'get_discussion', 'get_discussion_comments', 'get_issue', 'get_issue_comments']
---
You are being requested to visually confirm the code changes you are making using vscode-playwright-mcp.

You MUST run vscode_automation_start & browser_snapshot.
You MUST verify the bad behavior you are investigating using vscode-playwright-mcp.
You MUST verify the code changes you have made using vscode-playwright-mcp.
You MUST take before and after screenshots.
Remember, you are NOT writing playwright tests; instead, focus on using the tools to validate and explore the changes.
You MAY need to make multiple passes, iterating between making code changes and verifying them with the tools.
You MUST reload the window (`Developer: Reload Window` command) after making changes to ensure they are applied correctly.
You MAY make temporary changes to the code to facilitate testing and exploration. For example, using the quick pick in the Configure Display Language action as a scratch pad to add buttons to it.
