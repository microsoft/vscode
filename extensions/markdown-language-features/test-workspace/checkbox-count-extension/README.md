# Markdown checkbox-count demo extension

This workspace extension demonstrates a Markdown code block editor whose UI is
loaded from external HTML, CSS, and TypeScript modules. The iframe communicates
with this extension through `WebEditorClient.hostTransport`.

From the VS Code repository:

1. Build `@vscode/markdown-editor` and `@vscode/web-editors` in the adjacent
   `vscode-packages` checkout.
2. Run `npm install` and `npm run build` in this folder, then run `npm install`
   in `extensions/markdown-language-features`.
3. Start the **Markdown Code Block Editor Demo** launch configuration.
4. Open `checkbox-count-demo.md` with the Markdown editor.
5. Toggle or edit task-list checkboxes. The count rendered by the code block
   editor updates through the extension host.

The build bundles `@vscode/web-editors` and its transitive dependencies into
the iframe entrypoint. The formatter remains a separate generated chunk so the
demo also exercises relative dynamic imports.
