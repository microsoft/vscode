# 03 — Feature boundaries and dependency rules

## Core versus optional

Feature removal must preserve shared services required by the editor. Classify each import and service as one of:

1. **Core runtime**: needed for editing, files, workspaces, language support, diagnostics, or terminal.
2. **Optional feature UI**: views, actions, menus, onboarding, and feature-specific styling.
3. **Optional provider**: built-in Git, debugger, notebook renderer, or agent provider.
4. **Extension platform**: extension host, manifest scanning, installation, and extension API contracts.

Do not remove core runtime merely because it is imported by an optional feature. Prefer separating the optional contribution from shared service registration. If an API is removed, document it as a compatibility break and gate corresponding extension points.

## Source Control and Git

The common workbench entry point controls Git contributions, GitHub link presentation, Source Control UI and quick diff, and the generic SCM service as separate groups:

- `git`: built-in Git provider and Git-specific UI/integration.
- `sourceControlUI`: Source Control views, commands, and quick diff UI.
- `scmService`: generic source control provider framework and extension API support.

The minimal profile disables `git` and `sourceControlUI` while retaining `scmService`, which is injected by enabled features such as Search and Chat. Removing the service requires separately gating or redesigning those consumers. Third-party SCM providers can still register through the service, but the Source Control UI remains absent.

 Debug has the same split. The minimal profile disables `debugUI` and removes the built-in JavaScript debugger, while `debugService` keeps `IDebugService` available to the extension host API and workbench consumers. DebugService also injects `ITestService` and `ITestResultService`; when `testing` is off, register `NullTestService` and `NullTestResultService` to satisfy these dependencies without restoring Testing UI or MainThreadTesting. When `debugService` is off, register a dependency-free disabled MainThreadDebugService RPC proxy because the extension host initializes its public Debug API in every profile. Gate other service consumers before removing the underlying service.

## Chat and selected agents

The common entry point imports shared chat, chat contributions, agent sessions, remote agent hosts, chat views/sessions, context contributions, inline chat, MCP UI, voice, and chat onboarding. Desktop and web add further chat-specific imports. Chat-related services also appear in the common service section. The generic Chat/Agents UI is a host surface that can serve more than one agent harness; Copilot Chat is a provider/product integration and must be treated separately.

Treat these separately until dependencies are known:

- `copilotChat`: the built-in Copilot Chat extension is filtered from packaging; workbench Copilot sign-in/setup, Copilot CLI discovery and launch commands, harness introduction, quota/promo notifications, Chat entitlement UI, and Copilot voice/canvas features are disabled. Shared entitlement and configuration modules remain where generic Chat code still imports their contracts; removing those modules needs a separate dependency split. Trinoris voice commands are a separate proposed capability and must not re-enable Copilot Voice; see [spec 08](08-trinoris-voice-control.md).
- `agentHost`: generic agent session/runtime integration, only if Codex/Claude need it.
- `mcp`: shared MCP platform and UI; provider-specific MCP use may survive without chat UI.
- `agents.codex` and `agents.claude`: provider/runtime selections, explicitly opt-in.

Trace service tokens and imports from Codex and Claude implementations before removing agent-host, auth, or MCP services. The shared agent session UI remains available for the selected providers; it must not implicitly enable Copilot extensions, sign-in, or install any provider extension. Disable Copilot-only imports while retaining shared session infrastructure that selected agents actually consume.

## Terminal and tasks

The integrated terminal is a required core feature. Keep terminal contributions in all profiles and inspect desktop/web implementations separately. `tasks` may be disabled independently if its task service, task UI, and command contributions can be separated. Agent shell execution may use a process/tool API distinct from the terminal UI; verify this rather than coupling agent support to `terminal` or `tasks`.

## Extensions and formatting

The extension platform remains necessary if users depend on extension-provided languages, linters, formatters, or agents. Separate extension install/runtime capability from Extensions view UI and recommendations. Extension installs require explicit declarations and IDs; profile resolution must not trigger installation. Build-time exclusion of a built-in extension must be coordinated with `product.json`, extension packaging, and dependency metadata.

## Diagnostics and testing

Keep markers, diagnostic collections, editor decorations, and language feature APIs in core. Disabling Testing must not disable diagnostic markers. When `testing` is false, omit the Testing workbench contribution and register a disabled MainThreadTesting RPC bridge, so the extension host initializes cleanly and test controller operations are unavailable. Debug receives null test service contracts for its internal dependencies.

When `notebooks` is false, omit notebook editors and execution services but register disabled MainThreadNotebook, MainThreadNotebookDocuments, MainThreadNotebookEditors, MainThreadNotebookKernels, MainThreadNotebookRenderers, and MainThreadInteractive RPC channels. The extension host initializes these public API proxies even when notebook support is disabled.

## Remote workspaces and tunnels

When `remote` is false, omit remote workbench contributions and register disabled MainThreadTunnelService and MainThreadManagedSockets RPC bridges. These channels are requested by the extension-host API bootstrap even in local-only windows. The bridges do not forward ports or open managed sockets. Remote service contracts remain registered where local extension-management and browser entry paths still depend on them.

## Welcome and onboarding

When `welcome` is false, omit Welcome, walkthrough, onboarding, and tryout contributions, including the Codex continuation guide that requires the onboarding scenario service. Preserve generic Chat/Agents sessions and their Chat-specific empty-state content.

## Review comments

When `review` is false, omit review/comment workbench contributions and the full MainThreadComments implementation. Register a dependency-free disabled MainThreadComments proxy because the extension host eagerly constructs its public Comments API proxy in every profile. Keep the separate agent-editor comments bridge, which serves agent session comments and does not use the review `ICommentService`.

## Settings Sync

When `sync` is false, omit Settings Sync and Edit Sessions UI contributions and do not eagerly start web auto-sync. Shared sync service contracts remain registered for Settings, extension management, and profile consumers; removing those implementations requires disabled contracts and a separate consumer audit.

## Product services

When `productServices` is false, omit update UI, surveys, and issue-reporting contributions. Keep `IUpdateService` registered for timer and menu-bar consumers through a no-op implementation. The browser implementation reports an idle state and skips update checks and reload actions; the Electron main process does not load platform update implementations in this profile.

