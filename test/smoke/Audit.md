# VS Code Smoke Tests Failures History

This file contains a history of smoke test failures which could be avoided if particular techniques were used in the test (e.g. binding test elements with HTML5 `data-*` attribute).

To better understand what can be employed in smoke test to ensure its stability, it is important to understand patterns that led to smoke test breakage. This markdown is a result of work on [this issue](https://github.com/microsoft/vscode/issues/27906).

## Log

1. This following change led to the smoke test failure because DOM element's attribute `a[title]` was changed:
 [eac49a3](https://github.com/microsoft/vscode/commit/eac49a321b84cb9828430e9dcd3f34243a3480f7)

 This attribute was used in the smoke test to grab the contents of SCM part in status bar:
 [0aec2d6](https://github.com/microsoft/vscode/commit/0aec2d6838b5e65cc74c33b853ffbd9fa191d636)

2. To be continued...
