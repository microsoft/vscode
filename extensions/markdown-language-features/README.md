# Language Features for Markdown files

**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.

## Features

See [Markdown in Visual Studio Code](https://code.visualstudio.com/docs/languages/markdown) to learn about the features of this extension.

### Rich editor RPC

The rich editor uses a private point-to-point `@vscode/hubrpc` connection between
the extension host and webview. Shared runtime-validated interfaces in
`src/preview/markdownEditorProtocol.ts` define document edits, commands, comments,
diff markers, highlighting, rich links, and embedded-editor routing. No global
Hub or capability service is required.

The `TextDocument` remains authoritative: local edits use the existing epoch
queue and `WorkspaceEdit`, external changes replace the renderer mirror, and
history commands drain accepted edits before invoking host undo/redo. Each
webview generation has its own secret-authenticated transport and connection;
reload/disposal closes pending requests and detaches listeners. Nested code
block editors do not receive this secret and keep their separately sandboxed
protocols; only their opaque host-transport payloads cross named RPC methods.
