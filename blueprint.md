# Blueprint

This blueprint specifies how the VS Code extension host is to be refactored so that, in addition to running as the workbench's spawned child process, it can also run **standalone as an MCP (Model Context Protocol) server**. It is purely a design specification — no implementation changes are described here.

The blueprint covers:

1. The target architecture (three parts).
2. A map of what the current code already gives us.
3. The refactorings needed to separate concerns.
4. What must be added or stubbed for the MCP entrypoint.
5. How the result is verified.

## 1. Target Architecture

The extension host is split into three clearly separated parts, each in its own folder so the boundaries can be enforced by lint / layer checks. Names below are conceptual; the exact folder names are an implementation detail.

### 1.1. Workbench entrypoint (existing)

The current Electron / web-worker / remote launchers and the matching process entry. This is the **current behavior, preserved unchanged from the workbench's point of view**:

- The workbench spawns the extension host via `IExtensionHostStarter` and the platform-specific launcher classes (`NativeLocalProcessExtensionHost`, `WebWorkerExtensionHost`, remote launcher).
- The process entry reads `IExtensionHostInitData` over the workbench transport (socket / `MessagePort` / pipe) and hands control to the shared implementation.
- All UI-related `MainThread*` services are provided by the workbench, as today.

After the refactor, this entrypoint contains **only the transport, handshake, and main-thread side wiring it has today**. It contains no extension activation logic, no `vscode.*` API construction, no RPC service registration — those move into the shared implementation (see 1.3).

### 1.2. MCP server entrypoint (new)

A new, alternative process entry that loads the same shared implementation, but instead of connecting to a VS Code workbench:

- It speaks **MCP** on stdio (and optionally HTTP/SSE) using the MCP SDK that the workbench already uses.
- Its single purpose is to expose the **language support** that installed extensions provide (completions, hover, definition, references, symbols, diagnostics, formatting, code actions, semantic tokens, inlay hints, signature help, rename, code lens, folding ranges, selection ranges, document highlights, document links, call/type hierarchy, linked editing ranges) to MCP clients. All other extension contributions are intentionally **not** surfaced (see section 6).
- It **does not** start a UI, does not connect outbound to a workbench, and does not require Electron.
- Lifecycle is driven by the MCP client connection (one MCP session per process; process exits when the client disconnects).

The MCP entrypoint runs on Node.js only (no browser/worker variant). The web-worker entrypoint is unaffected.

### 1.3. Shared extension host implementation

Everything that is independent of how the host was launched:

- `ExtensionHostMain` orchestration: building the RPC protocol, instantiating the DI container, wiring `MainContext` / `ExtHostContext`, instantiating `ExtHostExtensionService`, running activation.
- The `vscode.*` API construction (today in `extHost.api.impl.ts`).
- All `ExtHost*` services that live inside the extension host: commands, configuration, workspace, documents, language features, language models, tools, MCP client glue, secret state, storage, telemetry, logging, etc.
- The activation pipeline (`ExtensionsActivator`), extension scanning, and `package.json` handling.
- The RPC protocol shapes (`extHost.protocol.ts`) and the registration of `MainThread*` proxies/customers.

This layer **must not import** from the workbench entrypoint or the MCP entrypoint. It defines:

- An interface for "how to obtain `IExtensionHostInitData`".
- An interface for "how to obtain the RPC channel to the main side" (whether the main side is a real workbench or a synthetic in-process main side).
- An interface for "which `MainThread*` shapes need to be backed" — letting each entrypoint plug in real or stub implementations.

Both entrypoints (1.1 and 1.2) consume this layer; neither owns it.

## 2. Mapping from Today's Code

This section is non-normative; it pins the blueprint to concrete code so that the refactor can be traced.

### 2.1. Pieces that already belong to "shared implementation"

These move (or stay, but become the canonical location) under the shared folder. They are already largely workbench-agnostic; the refactor mainly tightens their boundaries:

- `src/vs/workbench/api/common/extensionHostMain.ts` — `ExtensionHostMain`.
- `src/vs/workbench/api/common/extHost.api.impl.ts` — `vscode.*` API construction.
- `src/vs/workbench/api/common/extHost.protocol.ts` — RPC shapes.
- `src/vs/workbench/api/common/extHost.common.services.ts` — DI registrations.
- `src/vs/workbench/api/common/extHostExtensionService.ts` and the Node/Worker subclasses under `src/vs/workbench/api/node/` and `src/vs/workbench/api/worker/`.
- `src/vs/workbench/api/common/extHostExtensionActivator.ts` — activation engine.
- All `src/vs/workbench/api/common/extHost*.ts` services that implement `ExtHost*Shape`.
- The existing MCP client glue (`extHostMcp.ts` in the extension host's API layer).

The fact that these files currently sit under `src/vs/workbench/api/` is a historical artifact. After the refactor they should live under a clearly named "extension host implementation" folder that has no dependency on workbench-only modules.

### 2.2. Pieces that belong to "workbench entrypoint"

- `src/vs/workbench/api/node/extensionHostProcess.ts` — the actual Node entry script.
- `src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts` — `NativeLocalProcessExtensionHost`.
- `src/vs/workbench/services/extensions/browser/webWorkerExtensionHost.ts` — `WebWorkerExtensionHost`.
- `src/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html` and worker shim.
- `src/vs/workbench/services/extensions/common/extensionHostProtocol.ts` — handshake + `IExtensionHostInitData`.
- `src/vs/workbench/services/extensions/common/extensionHostEnv.ts` — `ExtHostConnectionType`.
- `src/vs/platform/extensions/common/extensionHostStarter.ts` and `src/vs/platform/extensions/electron-browser/extensionHostStarter.ts` — process spawning.
- `src/vs/workbench/services/extensions/common/extensionHostManagers.ts` — lifecycle.
- All `src/vs/workbench/api/browser/mainThread*.ts` — the real, UI-capable main thread implementations.

### 2.3. The remote server as a partial precedent

`src/vs/server/node/remoteExtensionHostAgentServer.ts` and `src/vs/server/node/serverServices.ts` already demonstrate that the extension host process can run on plain Node.js with a non-workbench main side. The MCP entrypoint is closer to "an even more restricted remote server": it talks MCP to its client instead of the workbench transport, and it stubs even more `MainThread*` services because there is no remote workbench on the other side.

## 3. Refactoring Required

Before adding the MCP entrypoint, the following refactors are needed. Each is a behavior-preserving change to today's workbench-launched extension host.

### 3.1. Define a launcher-agnostic boot interface

Introduce a single, narrow boot contract that any entrypoint must satisfy, conceptually:

- Provide the resolved `IExtensionHostInitData` (or an equivalent host-independent shape).
- Provide a duplex message channel for the RPC protocol.
- Provide a set of `MainThread*` shape implementations (the "main side"), indexed by `MainContext` identifier.
- Provide host services that today are taken from the workbench transport for granted: log service, telemetry, file system access, environment.

The shared `ExtensionHostMain` becomes a function that takes this contract and returns a running host with `dispose` semantics.

`IExtensionHostInitData` itself is renamed/relocated so it lives in the shared layer; the workbench entrypoint and MCP entrypoint both populate it from their respective sources.

### 3.2. Make the `MainThread*` set pluggable

Today, the extension host implicitly assumes "the other end of the RPC is a workbench". The refactor must:

- Treat the `MainThread*` shape implementations as **plug-ins** registered by the entrypoint, not as a fixed set.
- For each `MainContext` identifier, allow exactly one of:
  - a real `MainThread*` proxy talking over RPC to a workbench (1.1's case);
  - an in-process synthetic implementation (1.2's case);
  - **explicit "not supported" behavior** that surfaces as a clear, structured error to extensions when called.
- Add a uniform "not-supported" wrapper that any entrypoint can install for a given `MainContext` slot, raising a recognizable error type so extensions can detect and adapt rather than crashing.

This is required because the MCP entrypoint cannot supply real implementations of UI-bound `MainThread*` shapes.

### 3.3. Extract Node-only services from "workbench/api/node"

Several files under `src/vs/workbench/api/node/` mix two concerns: (a) "this is the Node variant of an `ExtHost*` service" and (b) "this is part of the workbench entrypoint glue". These must be split so the Node-flavored `ExtHost*` services live in the shared layer and are reusable by the MCP entrypoint, while the entry script and any workbench-specific Node glue stay in the workbench entrypoint folder.

### 3.4. Decouple `IExtensionHostInitData` from the workbench transport

Today the init data is delivered over the workbench's handshake protocol. The shape must be made constructible from arbitrary sources (CLI args, env, a config file, MCP client capabilities), and the workbench handshake becomes one source among potentially several. No new fields are needed for this; the dependency on the workbench transport for *delivery* must be removed.

### 3.5. Folder layout

After the refactor, the three parts live under three top-level locations. Conceptual layout:

- `extHost/impl/` — shared implementation (section 1.3).
- `extHost/workbenchEntry/` — workbench entrypoint and all `MainThread*` proxies (section 1.1).
- `extHost/mcpEntry/` — MCP entrypoint and its synthetic main side (section 1.2).

Layering rule: `impl/` must not import from either entry folder; entry folders may import from `impl/` but not from each other. (The exact path names are an implementation choice; what matters is the boundary.)

## 4. The MCP Entrypoint in Detail

This section specifies the new entrypoint introduced in section 1.2.

### 4.1. Process model

- A single Node process per MCP session.
- stdin/stdout speak the MCP protocol using the same MCP SDK already used by `src/vs/workbench/contrib/mcp/`.
- An optional `--http <port>` mode exposes MCP over HTTP/SSE for clients that don't use stdio; this is a stretch goal, not required for the first cut.
- The process accepts CLI flags for: workspace folder, extensions directory, user-data directory, log level, allow/deny list of extensions to load.
- On client disconnect (or `--once` mode completing), the process performs the normal extension `deactivate()` path and exits.

### 4.2. Mapping from language support to MCP primitives

The MCP server surfaces only the language support that extensions register through `vscode.languages.registerXxxProvider` (and the LSP-backed equivalents that ultimately end up in the same `LanguageFeaturesRegistry`). It does so by translating each language feature into MCP primitives:

- **MCP tools** — one tool per language feature, named with a stable prefix (e.g. `language.definition`, `language.references`, `language.hover`, `language.completion`, `language.documentSymbols`, `language.workspaceSymbols`, `language.formatDocument`, `language.formatRange`, `language.codeActions`, `language.rename`, `language.signatureHelp`, `language.semanticTokens`, `language.inlayHints`, `language.codeLens`, `language.foldingRanges`, `language.selectionRanges`, `language.documentHighlights`, `language.documentLinks`, `language.callHierarchy`, `language.typeHierarchy`, `language.linkedEditingRange`). Each tool's input schema accepts a document URI plus the feature-specific arguments (position, range, trigger character, format options, etc.). Each tool's output is the structured language service result, serialized to JSON; positions and ranges follow the LSP-compatible shape (zero-based line/character) so MCP clients can consume them directly.
  - The tools dispatch through the existing `LanguageFeaturesRegistry` populated by activated language extensions. The registry already supports multiple providers per language; the MCP layer concatenates / merges results the same way the workbench does.
  - Tools that take a document URI implicitly open / refresh the document through the shared `ExtHostDocuments` service so that providers see the same `TextDocument` they would in the workbench.
- **MCP resources** — one resource per known diagnostic source, keyed by document URI. Diagnostics from `MainThreadDiagnostics` are exposed as readable resources that the MCP client can subscribe to. Diagnostic updates push resource-changed notifications.
- **MCP prompts** — none. No prompt templates are surfaced in this iteration.

The translation layer between the language feature registry and MCP lives in the MCP entrypoint, **not** in the shared implementation. The shared implementation only exposes its existing internal registries (`LanguageFeaturesRegistry`, `IDiagnosticsService`); the entrypoint adapts them to MCP shapes.

Languages, document language IDs, and the document open/close lifecycle are visible to providers exactly as in the workbench: the entrypoint opens a `TextDocument` for any URI the MCP client references in a tool call, keeps it open while requests are in flight, and closes it after an idle interval.

### 4.3. Shortcircuited APIs

The MCP entrypoint installs synthetic "main side" implementations for the following `MainThread*` shapes. Each falls into one of three categories:

#### 4.3.1. Hard-refused (raise a recognizable error)

These cannot be honored without a user in the loop, or are outside the language-support scope. The synthetic implementation rejects the call with a typed error (e.g. `UIUnavailableError`) that includes the originating API name. Extensions are expected to handle the error or gracefully degrade.

- `MainThreadQuickOpen` — `showQuickPick`, `showInputBox`.
- `MainThreadDialogs` — `showOpenDialog`, `showSaveDialog`.
- `MainThreadMessageService` — modal `showInformationMessage` / `showWarningMessage` / `showErrorMessage` (modal). Non-modal forms route to logging (see below).
- `MainThreadWebviews`, `MainThreadWebviewPanels`, `MainThreadWebviewViews`, `MainThreadCustomEditors` — anything that requires a renderer.
- `MainThreadEditors`, `MainThreadTextEditors`, `MainThreadDocumentsAndEditors` for **active editor** access (no active editor exists; reads return undefined, writes are refused). The read-only `TextDocument` view of files opened by MCP tool calls is provided through the shared `ExtHostDocuments` service and does not require a `MainThreadTextEditor`.
- `MainThreadTerminalService` — refused entirely.
- `MainThreadDebugService` — refused entirely.
- `MainThreadTreeViews`, `MainThreadDecorations`, `MainThreadStatusBar`, `MainThreadProgress` (UI-visible progress), `MainThreadComments`, `MainThreadTheming`.
- `MainThreadLanguageModels`, `MainThreadLanguageModelTools`, `MainThreadChatAgents2` — out of scope; no language-model, tool-factory, or chat-participant contributions are exposed.
- `MainThreadMcp` — disabled; an extension running inside this server cannot spawn further MCP servers.
- `MainThreadAuthentication` — interactive authentication is refused. Language extensions that gate their functionality on a user session will fail to activate; this is acceptable for the first cut.
- `MainThreadSCM`, `MainThreadNotebook`, `MainThreadNotebookEditors`, `MainThreadInteractive`, `MainThreadSpeech`, `MainThreadShare`, `MainThreadUriOpeners`, `MainThreadWindow`, `MainThreadClipboard` — out of scope.

#### 4.3.2. Soft-stubbed (no-op or log-only)

These can be silently absorbed without breaking language extensions, because the absence of UI does not change the language-service semantics:

- Non-modal `showInformationMessage` / `showWarningMessage` / `showErrorMessage` → forwarded to the log service at the matching level. The returned `Thenable<string|undefined>` resolves to `undefined` (no button picked). Language extensions commonly surface activation errors this way and continue to function.
- `MainThreadProgress` non-UI variants → progress events are logged; the underlying task still runs. Long-running language analyses (indexing, project loading) rely on this.
- `MainThreadTelemetry` → forwarded to a structured log stream, never to real telemetry endpoints.
- `MainThreadConsole`, `MainThreadErrors` → forwarded to stderr / log.

#### 4.3.3. Real implementations (non-UI)

These behave the same as in the workbench, but with synthetic, headless backends. This is the minimum set required to make registered language providers function:

- `MainThreadLanguageFeatures` — full implementation. This is the core of what the MCP server exposes; every entry in the `LanguageFeaturesRegistry` becomes routable through MCP tools.
- `MainThreadLanguages` — full implementation. Language registration, language-id resolution, and `getLanguages` queries work as in the workbench.
- `MainThreadDiagnostics` — full implementation. Diagnostic collections are tracked and exposed as MCP resources.
- `MainThreadDocuments` and `MainThreadDocumentContentProviders` — full implementation. Documents are opened on demand when an MCP tool call references a URI; `TextDocument` content, language id, and version are visible to providers.
- `MainThreadBulkEdits` — accepts `WorkspaceEdit`s produced by code-action and rename providers and applies them to the synthetic document store; results are returned to the MCP client rather than written to disk by default. A CLI flag enables write-through to disk.
- `MainThreadFileSystem` — real disk file system using Node `fs`, scoped to the configured workspace folder. Extension-registered `FileSystemProvider`s remain in effect for their schemes (language servers commonly read project files this way).
- `MainThreadWorkspace` — single workspace folder configured via CLI; folder-add/remove operations are refused. Workspace folder URI and name are visible to language extensions.
- `MainThreadConfiguration` — backed by `settings.json` files on disk (user + workspace + folder), watched the same way the remote server does it. Language extensions read their settings (e.g. format options, server arguments) through this.
- `MainThreadLogService` — real log channels, written to a log directory passed via CLI. Language servers' output channels are routed here.
- `MainThreadStorage` — file-backed key/value storage per extension under the user-data directory. Used by language extensions for caches and workspace state.
- `MainThreadCommands` — full implementation, with one constraint: commands registered by language extensions are callable from inside the extension host (e.g. code-action callbacks invoking commands); they are **not** exposed as MCP tools. Built-in editor commands that mutate UI are no-ops.

### 4.4. Workbench dependencies that must be re-implemented in the MCP entrypoint

Even outside the `MainThread*` set, the workbench supplies a few cross-cutting services that the shared implementation transitively expects. These need standalone implementations under the MCP entrypoint, modeled after the remote server's `serverServices.ts`:

- `IFileService` and the disk file system provider (Node `fs`).
- `IEnvironmentService` / `INativeEnvironmentService` — populated from CLI flags + OS.
- `IConfigurationService` — loading `settings.json` files from the user-data and workspace directories.
- `ILogService` and log channel routing.
- `ITelemetryService` — `NullTelemetryService` (or log-only).
- `IExtensionManagementService` — read-only over the configured extensions directory; install/uninstall is refused.
- `IProductService` — a stripped-down product config that identifies the host as the MCP variant.
- `IUserDataProfilesService` — single default profile, no UI.
- `IModelService` / `ITextModelService` — required by many language feature implementations to obtain backing text models for documents opened on demand.

### 4.5. Extension visibility and trust

- The MCP entrypoint loads extensions that contribute language support. An extension is considered a language-support extension if it does any of the following: declares a `contributes.languages` block; declares an activation event of the form `onLanguage:*`; or, after activation, registers at least one provider through `vscode.languages.registerXxxProvider`.
- Extensions that do not match are still activated if they are transitive dependencies (`extensionDependencies`), but their non-language-support `MainThread*` calls fall under section 4.3.
- An allow-list / deny-list CLI flag can override the heuristic for testing and trusted-deployment scenarios.
- Untrusted-workspace logic from `IWorkspaceTrustService` is honored; in standalone mode the workspace is trusted only when an explicit CLI flag says so.

### 4.6. Lifecycle and errors

- The MCP entrypoint waits for the MCP `initialize` handshake before activating any extension and before exposing the language-feature MCP tool list.
- After `initialize`, eager-activation extensions activate as usual; `onLanguage:*` activation events fire as MCP tool calls arrive for documents in those languages, mirroring the workbench's lazy activation semantics.
- The MCP server advertises the union of language-feature tools that any installed extension is capable of providing. Tool invocations that have no provider for the requested language return an empty / null result (matching the workbench's behavior), not an error.
- `UIUnavailableError` and similar typed errors raised from shortcircuited APIs propagate through the MCP layer as structured tool errors (MCP `isError: true` responses with a stable error code), not as transport-level failures.

## 5. Verification

A dedicated **integration test** must exercise the MCP entrypoint end-to-end. It is the primary acceptance signal for this work.

### 5.1. Scope of the integration test

- Spawn the MCP entrypoint as a real child process (the same way an MCP client would launch it). No in-process shortcuts.
- Configure the process with a temporary workspace folder, a temporary user-data directory, and an extensions directory containing **a small but representative set of installed language extensions**. At minimum, the test must cover:
  - A pure declarative language contribution (a `contributes.languages` entry with grammar/configuration, no providers — verifies language registration round-trips through MCP).
  - A `vscode.languages.registerXxxProvider`-style extension that registers in-process providers (verifies provider dispatch without LSP).
  - An LSP-backed extension using `vscode-languageclient` that spawns a real language server child process (verifies that the activation pipeline, child-process spawning, and request/response flow over LSP all work inside the standalone host).
- The set of extensions used is chosen from extensions that already ship in this repo (under `extensions/`), so the test does not depend on the marketplace.

### 5.2. Exercised language features

For each extension, the test connects to the MCP server as a real MCP client (using the same SDK the workbench uses) and issues calls covering the breadth of section 4.2:

- `language.definition`, `language.references`, `language.hover`, `language.completion`, `language.documentSymbols`, `language.formatDocument`, `language.codeActions`, `language.rename`, and at least one of `language.semanticTokens` / `language.inlayHints`.
- Reading the diagnostics MCP resource for an open document and observing at least one update after the document's content changes.

Each assertion is a structural check against the JSON returned by the MCP tool, not a deep textual comparison; the goal is to prove the language feature was reached and produced a well-formed result, not to pin the exact provider output.

### 5.3. Shortcircuit behavior

The integration test also asserts that the shortcircuit policy of section 4.3 is honored:

- At least one extension intentionally invokes a hard-refused API (e.g. `showInformationMessage` with a modal option, or `window.createTreeView`). The test asserts that the extension still activates and that the call surfaces as the expected typed error rather than crashing the host.
- The test asserts that a non-modal `showInformationMessage` produces a log entry and resolves to `undefined`.

### 5.4. Lifecycle assertions

- Eager-activation extensions must be activated by the time the MCP server advertises its tool list after `initialize`.
- A tool call that targets a document in language `L` for which no extension has registered any provider returns an empty / null result (not an error).
- On MCP client disconnect, the process performs `deactivate()` on all activated extensions before exiting, and exits with code 0.

### 5.5. Test location

The test lives alongside the existing extension-host integration tests (the `*.integrationTest.ts` family that today drives the extension host from Node) and runs under the existing integration test runner. It must run in CI on the same platforms (Linux, macOS, Windows) as the rest of the extension host tests.

## 6. Out of Scope

To keep the spec focused, the following are explicitly **not** part of this blueprint:

- Exposing any extension contribution other than language support. In particular: language model tools (`vscode.lm.registerTool`), chat participants, slash-command prompt templates, opted-in commands, custom editors, tree views, debugger contributions, terminal profiles, task providers, SCM providers, notebook contributions, `FileSystemProvider`s as MCP resources, and webviews are all out of scope for this iteration.
- Authoring a new MCP SDK; the existing dependency is reused.
- A browser/worker build of the MCP entrypoint.
- Packaging / distribution / installer changes.
- Any change to the workbench-side extension host launcher's observable behavior.
