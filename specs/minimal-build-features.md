# Optional features for a focused Code OSS build

## Goal

Define build-time switches for a lean coding IDE centered on editing, language support, diagnostics, linting and formatting, with Codex or Claude supplied as explicit agent integrations. Keep the generic Chat/Agents session UI when selected agents need in-editor sessions, while excluding Copilot-specific chat features independently. Optional features must be omitted from generated bundles when disabled, rather than merely hidden in the workbench UI. The standard build remains unchanged unless a minimal profile is selected.

## Findings

The workbench has three application entry points: `workbench.common.main.ts`, `workbench.desktop.main.ts`, and `workbench.web.main.ts`. Desktop and web both import the common entry point. Features are primarily enabled by side-effect imports in these files, with shared services and contributions sometimes registered elsewhere. Consequently, removing an extension from `product.json` does not remove a core workbench feature; hiding an activity bar entry does not remove its implementation either.

`build/vite/index-workbench.ts` and the Vite configuration drive current client bundling, while gulp packaging has separate desktop, server, and extension lanes. A robust solution must pass one normalized feature profile to all relevant entry points, including development builds and packaged builds. Compile-time constants with literal booleans are a suitable first mechanism because bundlers can eliminate disabled branches. Dynamic `import()` is not itself sufficient to guarantee elimination if chunk discovery still includes the module. The build should validate the profile and emit a manifest of enabled groups for diagnostics.

The feature graph is not flat. Chat uses shared services for agent host, authentication, MCP, inline chat and session experiences. Built-in Git, Source Control UI, and the generic SCM service have separate roles: minimal disables Git and the UI while retaining the service for enabled consumers. Diagnostics rely on markers and editor decorations, which must stay enabled even when the Problems view is removed. Extension management is a platform capability and is likely required for marketplace installs and third-party language tooling; it cannot be removed in the minimal profile if extensions remain user-installable.

## Candidate build groups

The build schema includes **17 optional feature controls**, plus a separate `bundledExtensions` package allowlist, the always-on editor core, mandatory terminal, and separately selected Codex/Claude providers. The controls are not independent: dependencies below constrain combinations. The shared agent session UI remains available for selected providers. `coordinationUI` is enabled in `minimal`, and `trinoris.coordination` is explicitly listed in that profile’s extension package allowlist.

| Build flag | Main areas | Initial recommendation | Constraints |
| --- | --- | --- | --- |
| `copilotChat` | Built-in Copilot Chat extension, Copilot sign-in/setup, Copilot CLI discovery, Copilot notifications and UI integrations | Off in minimal profile | Shared Chat entitlement/configuration modules remain until their contracts are split from Codex/Claude session code. |
| `chatPanel` | Chat sidebar view | Off in minimal profile | Separate from the generic agent sessions UI used by selected providers. |
| `sourceControlUI` | Source Control view, SCM commands, quick diff UI | Off in minimal profile | Git is separately disabled; the SCM provider service stays registered for enabled workbench consumers. |
| `scmService` | Generic SCM provider service | On in minimal profile | Retained because search, chat, and other workbench code inject `ISCMService`. |
| `debugUI` | Debug views, editor controls, and built-in debugger extensions | Off in minimal profile | Keep language diagnostics and markers. The `IDebugService` bridge remains for workbench and extension API consumers. |
| `debugService` | Core debug service and extension API bridge | On in minimal profile | Required by the extension host debug API and remaining workbench consumers; revisit if those consumers are also removed. |
| `tasks` | Task execution, commands, views, and task agent tools | Off in minimal profile | A disabled task service contract remains for Debug, terminal monitoring, and extension API consumers. Terminal and agent shell tools stay available. |
| `notebooks` | Notebook editor/renderers, Interactive and REPL, notebook extension bridges | Off in minimal profile | Disabled notebook RPC proxies satisfy extension-host bootstrap; a disabled notebook service contract remains for shared consumers. |
| `testing` | Testing UI and MainThreadTesting provider bridge | Off in minimal profile | Test controllers cannot register in minimal builds. Null test services satisfy remaining Debug service dependencies. |
| `remote` | Remote workbench contributions and extension-host connection/socket/tunnel bridges | Off in minimal profile | Disabled tunnel and managed-socket RPC proxies satisfy extension-host bootstrap; shared service contracts remain for local extension-management and browser consumers. |
| `sync` | Settings Sync and Edit Sessions contributions | Off in minimal profile | Shared services remain for Settings and extension management; web auto-sync is not started eagerly. |
| `extensionsUI` | Extensions view and marketplace | On for explicit user installs | Minimal packages only the declared `bundledExtensions` list; marketplace installs remain a deliberate user action. |
| `welcome` | Getting Started, walkthroughs, welcome/onboarding surfaces | Off in minimal profile | Generic Chat/Agents session UI remains available; welcome contributions are not required for it. |
| `productServices` | Update UI, surveys, issue reporting, and product-specific contributions | Off in minimal profile | A no-op update service preserves shared contracts; platform update implementations are not loaded. |

Potential future controls include search editor, profile management, and feedback surfaces; they are not in the current schema because they intersect core navigation, persistence, or distribution responsibilities.

The minimal `bundledExtensions` allowlist is `vscode.configuration-editing`, `vscode.css-language-features`, `vscode.emmet`, `vscode.html-language-features`, `vscode.json-language-features`, `vscode.references-view`, `vscode.search-result`, and `vscode.typescript-language-features`. The build compiler, local extension packager, marketplace built-in list, and web extension scanner all use this list. The default profile uses `"*"` to preserve the repository's current extension set.

## Feature alignment matrix

Alignment is judged against the stated purpose: a focused coding IDE with code editing, diagnostics, linting, formatting, an integrated terminal, and explicitly selected Codex or Claude agents. “Default” refers to the proposed minimal profile, not the repository's existing default build. Optionality confidence indicates whether the group appears separable from the source structure inspected so far; it is not a substitute for dependency tracing.

| Feature | Alignment | Minimal profile | Build optionality | Dependencies / notes |
| --- | --- | --- | --- | --- |
| Text editor, diff editor | Essential | On | Core | Main product surface. |
| Language services and extension API | Essential | On | Core | Needed for language intelligence and third-party language tooling. |
| Diagnostics, markers, problems data | Essential | On | Core data; UI review needed | Preserve marker service and editor diagnostics even if optional views are considered later. |
| Linting and formatting | Essential | On | Core capability; providers optional | Built-in formatter or explicitly declared extension/provider. Do not auto-install extensions. |
| File/workspace explorer, open/save | Essential | On | Core | Core workspace editing workflow. |
| Integrated terminal | Essential | On | Core | User has explicitly marked this mandatory; also supports agent shell workflows. |
| Search and navigation | Essential | On | Core | Core codebase editing/navigation. |
| Settings, commands, keybindings, quick access | Essential | On | Core | Shared workbench infrastructure. |
| Codex/Claude agent integration | Essential by selection | Explicit opt-in | Optional provider integration | Declare each integration by ID and dependencies; do not imply Copilot Chat. Confirm whether the agent requires built-in session UI. |
| Copilot Chat and Copilot-specific UI | Out of scope | Off | Medium | Chat imports are spread across common, desktop and web entry points; shared agent/MCP services require dependency analysis. |
| Source Control UI and built-in Git | Out of scope per current request | Off | Medium | Generic SCM service remains for workbench consumers; no Source Control view or built-in Git provider is loaded. |
| Debugging | Useful, not required for stated minimum | Off | Medium | Debug extensions may contribute independently; preserve editor diagnostics. |
| Tasks | Useful, not required | Off | Medium | Separate from mandatory terminal; tasks may have shared service dependencies. |
| Notebooks | Out of scope for initial profile | Off | Medium | Check editor, renderer and web entry points. |
| Testing UI | Useful, not required for initial profile | Off | Medium | Test providers may come from language extensions. |
| Remote development and tunnels | Out of scope for initial profile | Off | Low | Crosses workbench, server, remote extensions and packaging. |
| Extension marketplace UI | Conditional | On if extensions are user-installable | Low | Disabling this can break language and agent extension installation; decide whether the product is closed/minimal or extensible. |
| Welcome, walkthrough and onboarding UI | Low alignment | Off | High | Includes the Codex continuation guide and diff editor tryout; generic Chat/Agents remains available. |
| Comments and PR review | Out of scope | Off | Medium | Review contributions and the full MainThreadComments implementation are omitted; a dependency-free disabled RPC proxy satisfies extension-host bootstrap. Agent-editor comments remain separate. |
| Profiles and Settings Sync | Low alignment | Off | Low | Broad account, authentication and persistence dependencies. |
| Updates and feedback surfaces | Low alignment | Off or product-specific | Low | Distribution and product policy need review before exclusion. |

The minimal profile disables 13 of the 16 feature controls: Copilot Chat, Chat panel, Git, Source Control UI, Debug UI, tasks, notebooks, testing, remote workbench, welcome, review, Settings Sync, and product services. SCM and Debug service APIs and extension management UI remain on. The shared agent session UI is retained for Codex/Claude. Terminal is a mandatory-on invariant. Provider selection is recorded separately for Codex and Claude.

## Core that stays enabled

The minimal profile keeps editor and diff editor, file/workspace explorer, open/save and working-copy services, command/keybinding and quick access infrastructure, language service and extension API, markers/diagnostics, textMate/tree-sitter tokenization, search, settings/preferences, the integrated terminal, and extension host support when language extensions are in scope. Linting and formatting remain supplied by built-in language features or explicitly installed extensions. Codex/Claude integrations are separately declared and opt-in; they must not pull in Copilot Chat by implication.

## Proposed build interface

Add a validated build profile, preferably a checked-in `build/features.json` with `default` and `minimal` profiles, and allow explicit command-line overrides. Example profile names are `default` and `minimal`; avoid a growing set of undocumented environment variables. Resolve the selected profile once in build tooling, validate known keys and dependency constraints, and inject a generated module containing literal `true`/`false` constants. Application entry points then use a central feature-gated import registry so desktop, web and development bundles make the same choice.

The registry should group imports by feature and define required services separately from optional UI. Keep the default profile all-on for compatibility. Minimal can disable the candidate groups listed above according to validated dependencies. Build output should print the selected profile and flags, and package metadata should record the resolved configuration. Unknown flags and invalid combinations should fail early with actionable errors.

## Dependency boundaries and remaining validation

The profile implementation traces and gates the major workbench entry points, service contracts, extension bridges, and packaging paths. Remaining validation should compare default behavior, build minimal desktop and web bundles, inspect disabled module/assets in outputs, and exercise a third-party extension against disabled UI groups where relevant.

The minimal profile removes the built-in Git provider and Source Control UI, but retains the generic SCM API/service because enabled workbench features still consume it. Removing the service requires gating or redesigning those consumers and is a separate compatibility change.

The selected product keeps shared Chat/Agents session support for Codex/Claude while disabling Copilot-specific chat independently. Provider flags remain explicit, and neither provider selection nor the shared session UI installs an extension.

## Validation follow-up

1. Build default and minimal desktop/web targets and verify default parity.
2. Inspect emitted bundles and packages for disabled feature modules, built-in extensions, and Copilot runtime assets.
3. Smoke-check editor, terminal, search, extension installation, formatting/lint providers, and selected agents.
4. Decide whether the development watch path needs a profile-selectable fallback; it currently always uses minimal.

## Current workspace state

No dependencies were installed for this work. The client TypeScript typecheck passed; package builds and runtime smoke checks remain outstanding.
