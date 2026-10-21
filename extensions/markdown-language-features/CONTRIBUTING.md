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

### Managed development graph

The experimental repository-root `dev.workspace.ts` can manage the initial
`install-fast` / `build-fast` / Electron preparation, core transpile watcher,
Markdown extension-host watcher, and the three Markdown webview watchers.
The `codeOss` node invokes `.agents/skills/launch/scripts/launch.ts` through `scripts/dev-workspace-codeoss.mts`. It reuses the graph's prepared build outputs, waits for the launcher's CDP readiness and Markdown extension activation, then reports the application PID, debug ports, profile directory, run directory, and log file as its service value.

The launch skill seeds an isolated profile and shared-authentication directory from the authenticated Code OSS development profile. This replaces the previous persistent per-slot profile/shared-settings setup; the source profile is never modified. See the [launch skill](../../.agents/skills/launch/SKILL.md) for profile selection and the GitHub sign-in flow. Configure Marketplace endpoints locally in the ignored `product.overrides.json`. The window title includes the slot and branch, with live branch updates while the built-in Git extension is enabled.

The adapter invokes the TypeScript launcher with `--wait`, keeping Code OSS in the managed process tree. Deactivating or restarting the node stops that instance, rather than leaving a detached window behind. Manually launched instances with different profiles remain independent.

The local setup uses a directory link at `.tmp/dev-workspace` pointing to a
built `vscode-packages/dev-workspace` package. Use the Node version from
`.nvmrc`; the linked server task selects it with `fnm`.
The **Dev Workspace: Linked Named-pipe Server** task reads the ignored
`.tmp/workspace-connection.json` with `endpoint` and `token` fields.
The **Dev Workspace: Attach TUI** task connects to that instance.
Do not run the usual watch tasks at the same time: they would write the same
output directories.

From a terminal at the repository root, connect using the same credentials:

```powershell
$connection = Get-Content .tmp\workspace-connection.json -Raw | ConvertFrom-Json
$env:LINKRPC_ENDPOINT = $connection.endpoint
$env:LINKRPC_TOKEN = $connection.token
node .tmp\dev-workspace\dist\cli.js inputs dev.workspace.ts
node .tmp\dev-workspace\dist\cli.js inputs dev.workspace.ts '{"markdownEditorPath":"D:\\src\\vscode-packages\\vscode-team-tools\\packages\\markdown-editor"}'
node .tmp\dev-workspace\dist\cli.js activate dev.workspace.ts codeOss
node .tmp\dev-workspace\dist\cli.js tui dev.workspace.ts
```

Alternatively, let the Hub daemon own the workspace server (use the Node version from `.nvmrc`):

```powershell
hub services run --endpoint npipe://./pipe/linkrpc-hub-hdieterichs `
  --namespace dev-workspace-vscode-slot2 --id main --detach --cwd $PWD.Path `
  -- fnm exec --using=24.18.0 node .tmp\dev-workspace\dist\cli.js serve dev.workspace.ts

$env:LINKRPC_ENDPOINT = 'npipe://./pipe/linkrpc-hub-hdieterichs'
$services = hub services list --endpoint $env:LINKRPC_ENDPOINT --namespace dev-workspace-vscode-slot2 | ConvertFrom-Json
$env:DEV_WORKSPACE_SERVICE_ID = ($services | Where-Object id -eq main).serviceId
node .tmp\dev-workspace\dist\cli.js activate dev.workspace.ts codeOss
node .tmp\dev-workspace\dist\cli.js value dev.workspace.ts codeOss
node .tmp\dev-workspace\dist\cli.js tui dev.workspace.ts
```

Start only one workspace server per checkout. Managed services use the returned service ID, not a hand-written tunnel alias. The server remains daemon-owned after the launch command returns; the example does not configure reboot persistence or automatic restart.

`markdownEditorPath` is a live, persisted project input. Set it to `null` to
restore the published dependency. The link step runs after installation and
validates the package identity and built commands before replacing anything.
Changing the input stops affected watchers before switching the link, then
rebuilds/restarts the demanded chain. The existing Code OSS window is kept;
reload it or reopen the Markdown editor to load the new webview bundle.
Initial installation can take a while; subsequent `install-fast` and
`build-fast` runs reuse the repository's own incremental state.
The core watcher uses `transpile --watch --incremental` to reuse that initial
build instead of deleting and rebuilding `out` again. Source events arriving
during startup are queued and processed after the initial incremental build.

Keep the package's `editorWatch` node active in the packages checkout's runtime.
It owns package/dependency builds there, while this checkout watches the
resolved package output and rebuilds the webview. The two runtimes do not yet
share dependency leases or exact cross-checkout source provenance; activating
`codeOss` does not automatically activate the other runtime's package watcher.
Other extension-host/media and Copilot sources are built initially, but this
graph's ongoing extension watchers are scoped to Markdown.

The native extension build scripts emit opt-in `DEV_WORKSPACE_BUILD_EVENTS`
start/done/failed markers. Readiness includes postprocessing, not merely
starting the process. Run the adapter checks with
`node --test extensions/esbuild-common.test.mts scripts/dev-workspace-link.test.mts`.

### Embedded code-block editor presentation

`markdown.codeBlockEditorProviders` contributions and export-API resolve results
accept optional `presentation: { resizable, fullWidth, fullView, minHeight }`.
The Markdown editor owns these controls, including for static/uncooperative
pages. Resolve-result properties override contribution defaults; explicit
provider properties override guest-advertised preferences. Keep the contribution
schema, descriptor validation, RPC schema, equality checks, and static/export-API
paths in sync when extending this contract.

Undefined resolve-result properties inherit the contribution defaults; explicit `false` still overrides them. The extension consumes the published `@vscode/markdown-editor` package, which implements the controls and mode notifications.

The implementation and interaction fixtures live in the local Markdown editor
package. See its README's **Embedded editor presentation** section for the
optional mode-notification messages and sizing precedence.

### Active block highlighting

`markdown.editor.highlightActiveBlock` controls the rich editor's active-block
background and glow, and defaults to enabled. Resource-specific changes are sent
to the renderer without reloading the document or changing source-marker visibility.
The webview reserves symmetric scrollbar gutters so the document remains centered.

### Rich editor diagnostics

Built-in Markdown pull diagnostics use the language client's custom-editor tab tracking (provided by `vscode-languageclient` 9.0.1). A Markdown document opened only in the rich editor must receive diagnostics without a companion text-editor tab. Keep `diagnosticPullOptions.onTabs` and `onChange` enabled. When validating client upgrades, enable `markdown.validate.enabled`, open a broken link only in the rich editor, and verify that fixing it clears the diagnostic. The renderer continues to consume the existing VS Code diagnostic collections; no separate diagnostic provider is needed.

### Outline and breadcrumbs

The rich editor opts into `customTextEditorNavigation`. The workbench reuses the document's symbol providers for Outline and breadcrumbs; the extension reports each panel's source selection and routes reveal and view-state requests through the Markdown editor RPC bridge. Offset mapping uses the renderer's synchronized text, including when its line endings differ from the document.

Keep navigation independent of editing mode. Breadcrumb previews must preserve focus and selection, canceled previews must not override newer navigation, and opening a symbol to the side must retain the custom editor type. Navigation regression coverage lives in `src/test/markdownEditorNavigation.test.ts` and `src/test/markdownEditorBridge.test.ts`, with workbench coverage in the custom-editor navigation and document-symbol Outline suites.

Chat also consumes this per-panel navigation selection as implicit context, including in the Agents window. It attaches a range in the underlying Markdown document, not rendered HTML, and respects the existing implicit-context settings and ignored-file checks. A collapsed or cleared selection falls back to the document URI. No separate Markdown chat bridge is needed. Workbench regression coverage lives in `src/vs/workbench/contrib/chat/test/browser/attachments/chatImplicitContext.test.ts`.

Selection, document, and webview changes share a 500 ms debounce before refreshing chat context, matching code-editor behavior. Navigation availability changes refresh immediately, and registering a chat widget refreshes existing widgets as well so a superseded asynchronous refresh cannot leave them stale.

### Running tests

You can run the VS Code extension tests by running the `Markdown Extension Tests` target in VS Code. This will run the tests under `./src/test`

### Rich-link presentation lifetimes

The Markdown editor webview shares one presentation observable per URL within a document. Unreferenced presentations remain cached for five minutes, with at most 256 inactive URLs retained in least-recently-used order. Active entries are never evicted.

Reference-count transitions are coalesced in a microtask and sent as incremental subscriptions, not complete URL lists. A synchronous release/reacquire during rendering keeps both the observable and its subscription. Once an entry becomes inactive, its host watcher is released while its cached presentation remains available.

Every new subscription receives the current presentation followed by changes through the existing extension API watcher. Updates carry a subscription ID so messages from a previous subscription or webview cannot overwrite current state. Reusing a cached entry displays its previous presentation while the new subscription resolves.

Run the webview cache and subscription tests with `node --test ./scripts/linkPresentationProvider.test.mts` from this extension directory.

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
