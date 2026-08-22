# Contributing

This extension provides language features for working with Markdown files in vscode. This include the Markdown Preview, as well as IntelliSense, link validation, and other language features.

Almost all language features are implemented in the upstream [Markdown Language Service](https://github.com/microsoft/vscode-markdown-languageservice) and surfaced through the [Markdown Language Server](https://github.com/microsoft/vscode-markdown-languageserver), so many language feature changes belong in one of those repositories instead of this one.

## Project Structure

Here is a quick look at the important files in this project:

```
src/
  extension.ts           Desktop (Node.js) entrypoint
  extension.browser.ts   Web entrypoint
  client/                Language client that talks to the Markdown language server
  preview/               Built-in Markdown preview (custom editor + webview management)
  markdownEngine.ts      markdown-it engine used to render previews
  markdownExtensions.ts  Reads `markdown.*` contributions from other extensions

preview-src/             Frontend code that runs inside the preview webview
notebook/                Notebook Markdown renderer source
media/                   Default Markdown preview styles and scripts
```

Build outputs are written to `out/` (desktop), `dist/` (web), and `notebook-out/` (notebook renderer).

### Developing the Markdown editor

See [Markdown code block editor extensions](./markdown-code-block-editor-extensions.md)
for the experimental extension contribution that embeds custom editors in
fenced code blocks.

1. **Know the repositories and integration points**

   `@vscode/markdown-editor` lives in the sibling `microsoft/vscode-packages` checkout at `vscode-team-tools/packages/markdown-editor`. In this repo, the integration is in `extensions/markdown-language-features`, especially `markdown-editor-src`, `src/preview/markdownEditorProvider.ts`, and `esbuild.markdownEditor.mts`. These instructions assume `vscode` and `vscode-packages` are sibling folders.

2. **Build the package first**

   The package exports files from `dist`, so VS Code does not consume its TypeScript sources directly. Run `pnpm build` once in `vscode-packages/vscode-team-tools/packages/markdown-editor`. For ongoing work, keep `pnpm dev` running there so `dist` stays up to date.

3. **Point the extension at your local package**

   **A. Use a `file:` dependency for a durable local setup**

   Set the dependency in `extensions/markdown-language-features/package.json` to:

   ```json
   "@vscode/markdown-editor": "file:../../../vscode-packages/vscode-team-tools/packages/markdown-editor"
   ```

   Then run `npm install` in `extensions/markdown-language-features`. This updates `package.json` and `package-lock.json`, creates a local link, and survives later `npm install` runs. This is development-only; restore the dependency to a published version before submitting changes that should consume a release.

   **B. Use `npm link` for a temporary setup**

   In `vscode-packages/vscode-team-tools/packages/markdown-editor`, run:

   ```bash
   npm link
   ```

   In `vscode\extensions\markdown-language-features`, run:

   ```bash
   npm link @vscode/markdown-editor
   ```

   This leaves `package.json` and `package-lock.json` unchanged, but any later `npm install` in the extension replaces the link. If that happens, run `npm link @vscode/markdown-editor` again.

   Verify the resolved package from `extensions/markdown-language-features`:

   ```bash
   node -e "console.log(require('node:fs').realpathSync('node_modules/@vscode/markdown-editor'))"
   ```

   The output should be the local `vscode-packages/vscode-team-tools/packages/markdown-editor` directory.

4. **Rebuild and run VS Code**

   Source-built VS Code does not load `@vscode/markdown-editor` dynamically from `node_modules`. `esbuild.markdownEditor.mts` bundles it into `markdown-editor-out`, so keep both the package `pnpm dev` watcher and VS Code's **Ext - Build** task running. For a one-time build, run `npm run build-markdown-editor` in `extensions/markdown-language-features` after the package build completes.

   Launch VS Code with the **Run VS Code** task. After the Markdown editor bundle is rebuilt, reload the development window or close and reopen the Markdown custom editor.

5. **Update editor commands**

   Markdown editor commands and their default keybindings are defined in `vscode-packages/vscode-team-tools/packages/markdown-editor/src/editorCommands.ts`. Do not manually edit entries marked with `"$generated": true` in this extension's `package.json` or their titles in `package.nls.json`: `npm run build-markdown-editor` and `npm run watch-markdown-editor` regenerate them while preserving manual entries. Run `npm run check-markdown-editor-package-json` to verify that the checked-in manifests are current without modifying them.

### Running tests

You can run the VS Code extension tests by running the `Markdown Extension Tests` target in VS Code. This will run the tests under `./src/test`

### Updating the Markdown language service

Language features such as IntelliSense, validation, document links, and rename are powered by a language server rather than being implemented directly in this extension. There are two packages for this:

- [`vscode-markdown-languageservice`](https://github.com/microsoft/vscode-markdown-languageservice) — the library that implements the actual Markdown language intelligence. Almost all language feature bug fixes and additions should start here.

- [`vscode-markdown-languageserver`](https://github.com/microsoft/vscode-markdown-languageserver) — a thin language server that wraps the language service and exposes it over the Language Server Protocol.

This extension depends on `vscode-markdown-languageserver` and connects to it from `src/client/`. The code in `src/languageFeatures/` provides the VS Code-specific glue and the features that are not handled by the server.


1. Update the language service **in the server**. The [server's contributing guide](https://github.com/microsoft/vscode-markdown-languageserver/blob/main/CONTRIBUTING.md) documents this, but in short you run the following in the `vscode-markdown-languageserver` repository and then publish a new server release:

   ```bash
   npm install vscode-markdown-languageservice@latest
   ```

2. Bump the server dependency in this extension to the newly published version:

   ```bash
   npm install vscode-markdown-languageserver@latest
   ```

### Testing unpublished versions locally

You can use `npm link` to test local changes to the language service/server without publishing:

```bash
# First, in your vscode-markdown-languageservice checkout
npm run compile
npm link

# In your vscode-markdown-languageserver checkout
# Link in the language-service changes
npm link vscode-markdown-languageservice
npm run compile


# And finally in vscode, link in the service
cd extensions/markdown-language-features
npm link vscode-markdown-languageserver
```

## Related Code

Additional Markdown features in vscode are split across several built-in extensions. Depending on your change, the right place to make it may be one of these:

- [`markdown-basics`](../markdown-basics) — Markdown language basics: the TextMate grammar, language configuration, and snippets. Change this for syntax highlighting and tokenization.

- [`markdown-math`](../markdown-math) — KaTeX math rendering in the preview.

- [`mermaid-markdown-features`](../mermaid-markdown-features) — Mermaid diagram rendering in the preview.

The latter two extensions build on top of our Markdown extension api using the same mechanism is available to third-party extensions:

- `markdown.markdownItPlugins` — register a [markdown-it](https://github.com/markdown-it/markdown-it) plugin to extend how Markdown is parsed and rendered.
- `markdown.previewScripts` — add scripts that run inside the preview webview.
- `markdown.previewStyles` — add stylesheets to the preview.
- `markdown.codeBlockEditors` — register an extension-relative, self-contained HTML editor for a fenced code block language in the experimental Markdown editor. The HTML runs in a sandboxed iframe and exchanges content using the `web-editor/0.12` protocol.
