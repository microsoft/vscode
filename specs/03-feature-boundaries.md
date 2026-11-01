# 03 — Feature boundaries and dependency rules

## Core versus optional

Feature removal must preserve shared services required by the editor. Classify each import and service as one of:

1. **Core runtime**: needed for editing, files, workspaces, language support, diagnostics, or terminal.
2. **Optional feature UI**: views, actions, menus, onboarding, and feature-specific styling.
3. **Optional provider**: built-in Git, debugger, notebook renderer, or agent provider.
4. **Extension platform**: extension host, manifest scanning, installation, and extension API contracts.

Do not remove core runtime merely because it is imported by an optional feature. Prefer separating the optional contribution from shared service registration. If an API is removed, document it as a compatibility break and gate corresponding extension points.

## Source Control and Git

The common workbench entry point imports Git contributions, GitHub link presentation, SCM contributions, quick diff, and SCM service contributions. Treat these as at least two candidate groups:

- `git`: built-in Git provider and Git-specific UI/integration.
- `scm`: generic source control provider framework, views, commands, and extension API support.

Dependency questions to answer before implementation:

- Which Git contributions register an SCM provider, and can they be omitted while preserving the generic provider service?
- Does quick diff have non-Git consumers or extension API consumers?
- Which core services reference SCM interfaces unconditionally?
- Is the intended product allowed to load third-party source control providers?

If third-party SCM is retained, keep the generic API/service and disable built-in Git. If all source control is removed, omit SCM registration and review API compatibility explicitly.

## Chat and selected agents

The common entry point imports shared chat, chat contributions, agent sessions, remote agent hosts, chat views/sessions, context contributions, inline chat, MCP UI, voice, and chat onboarding. Desktop and web add further chat-specific imports. Chat-related services also appear in the common service section. The generic Chat/Agents UI is a host surface that can serve more than one agent harness; Copilot Chat is a provider/product integration and must be treated separately.

Treat these separately until dependencies are known:

- `agentSessionsUI`: generic Chat/Agents session surface required when Codex/Claude are selected for in-editor sessions.
- `copilotChat`: Copilot harness, sign-in, and Copilot-specific contributions/services.
- `agentHost`: generic agent session/runtime integration, only if Codex/Claude need it.
- `mcp`: shared MCP platform and UI; provider-specific MCP use may survive without chat UI.
- `agents.codex` and `agents.claude`: provider/runtime selections, explicitly opt-in.

Trace service tokens and imports from Codex and Claude implementations before removing agent-host, auth, or MCP services. Never make `agentSessionsUI` implicitly enable Copilot extensions, sign-in, or install any provider extension. Disable Copilot-only imports while retaining shared session infrastructure that selected agents actually consume.

## Terminal and tasks

The integrated terminal is a required core feature. Keep terminal contributions in all profiles and inspect desktop/web implementations separately. `tasks` may be disabled independently if its task service, task UI, and command contributions can be separated. Agent shell execution may use a process/tool API distinct from the terminal UI; verify this rather than coupling agent support to `terminal` or `tasks`.

## Extensions and formatting

The extension platform remains necessary if users depend on extension-provided languages, linters, formatters, or agents. Separate extension install/runtime capability from Extensions view UI and recommendations. Extension installs require explicit declarations and IDs; profile resolution must not trigger installation. Build-time exclusion of a built-in extension must be coordinated with `product.json`, extension packaging, and dependency metadata.

## Diagnostics and testing

Keep markers, diagnostic collections, editor decorations, and language feature APIs in core. Disabling the Testing view must not disable diagnostic markers. Decide separately whether the testing extension API remains available to third-party providers when built-in testing UI is off.

