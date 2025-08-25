---
applyTo: '**/*.ts, **/*.css'
description: 'Use Playwright to visually verify UI changes in VS Code'
---

For every UI change you make, verify the result interactively using vscode-playwright-mcp & vscode-automation-mcp. You will have a local VS Code instance at your disposable. See if the change is reflected correctly and take screenshots to visually confirm the update. This ensures that every modification is visible, correct, and meets the intended requirements.

Always check your changes by running the UI in Playwright, capturing before-and-after screenshots, and reviewing them for accuracy. This approach helps catch regressions, improves reliability, and provides clear evidence of the effect of your work.

NOTE: When you use a playwright tool, it will automatically open a VS Code dev build so just assume that one will be opened for you. You do not need to open a dev build yourself. You do not need to write Playwright tests.
