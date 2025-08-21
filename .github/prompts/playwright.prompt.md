---
mode: agent
description: 'Use playwright to _see_ the code changes you have made'
tools: ['codebase', 'usages', 'vscodeAPI', 'problems', 'changes', 'testFailure', 'openSimpleBrowser', 'fetch', 'findTestFiles', 'searchResults', 'githubRepo', 'todos', 'runTests', 'runCommands', 'runTasks', 'editFiles', 'runNotebooks', 'search', 'new', 'browser_click', 'browser_close', 'browser_console_messages', 'browser_drag', 'browser_evaluate', 'browser_file_upload', 'browser_handle_dialog', 'browser_hover', 'browser_install', 'browser_navigate_back', 'browser_navigate_forward', 'browser_network_requests', 'browser_press_key', 'browser_resize', 'browser_select_option', 'browser_snapshot', 'browser_tab_close', 'browser_tab_list', 'browser_tab_new', 'browser_tab_select', 'browser_take_screenshot', 'browser_type', 'browser_wait_for']
---
For every UI change you make, verify the result interactively using erdos-playwright-mcp. Use Playwright to open the relevant UI, perform the change, and take screenshots to visually confirm the update. This ensures that every modification is visible, correct, and meets the intended requirements.

Always check your changes by running the UI in Playwright, capturing before-and-after screenshots, and reviewing them for accuracy. This approach helps catch regressions, improves reliability, and provides clear evidence of the effect of your work.

NOTE: When you use a playwright tool, it will automatically open a Erdos dev build so just assume that one will be opened for you. You do not need to open a dev build yourself.

In addition to visual verification, follow best practices for writing robust, maintainable, and extendable code. Ensure all user-facing messages are localized, use consistent naming and indentation, and prefer async/await for asynchronous operations. Write and update relevant tests, clean up temporary files, and adhere to project coding guidelines for quality and consistency.

If the task is unreasonable or infeasible, or if any of the tests are incorrect, please tell the user. The solution should be robust, maintainable, and extendable.
