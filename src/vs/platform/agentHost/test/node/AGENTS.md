# Agent host unit tests

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../../../../../FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).


For tests in this area that touch the SessionDatabase, they MUST use an in-memory database, not a real database file on disk. Use `SessionDatabase.open(':memory:')` and see the examples from existing tests.
