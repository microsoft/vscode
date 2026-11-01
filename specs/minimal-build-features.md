# Optional features for a focused Code OSS build

## Goal

Define build-time switches for a lean coding IDE centered on editing, language support, diagnostics, linting and formatting, with Codex or Claude supplied as explicit agent integrations. Keep the generic Chat/Agents session UI when selected agents need in-editor sessions, while excluding Copilot-specific chat features independently. Optional features must be omitted from generated bundles when disabled, rather than merely hidden in the workbench UI. The standard build remains unchanged unless a minimal profile is selected.

## Findings

The workbench has three application entry points: `workbench.common.main.ts`, `workbench.desktop.main.ts`, and `workbench.web.main.ts`. Desktop and web both import the common entry point. Features are primarily enabled by side-effect imports in these files, with shared services and contributions sometimes registered elsewhere. Consequently, removing an extension from `product.json` does not remove a core workbench feature; hiding an activity bar entry does not remove its implementation either.

`build/vite/index-workbench.ts` and the Vite configuration drive current client bundling, while gulp packaging has separate desktop, server, and extension lanes. A robust solution must pass one normalized feature profile to all relevant entry points, including development builds and packaged builds. Compile-time constants with literal booleans are a suitable first mechanism because bundlers can eliminate disabled branches. Dynamic `import()` is not itself sufficient to guarantee elimination if chunk discovery still includes the module. The build should validate the profile and emit a manifest of enabled groups for diagnostics.

The feature graph is not flat. Chat uses shared services for agent host, authentication, MCP, inline chat and session experiences. Git contributes Git services, SCM views and quick diff; SCM is also an extension API used by third-party source control providers, so disabling Git alone is different from disabling the SCM framework. Diagnostics rely on markers and editor decorations, which must stay enabled even when the Problems view is removed. Extension management is a platform capability and is likely required for marketplace installs and third-party language tooling; it cannot be removed in the minimal profile if extensions remain user-installable.

## Candidate build groups

The current candidate inventory includes **12 controls**, plus the always-on editor core. The controls are not independent: dependencies below constrain combinations, and Codex/Claude require the generic session UI when panel sessions are selected.

| Build flag | Main areas | Initial recommendation | Constraints |
| --- | --- | --- | --- |
| `agentSessionsUI` | Generic Chat/Agents session surface used by selected agent harnesses | On when Codex/Claude panel sessions are selected | Shared UI is distinct from Copilot branding and services; inspect imports before exclusion. |
| `copilotChat` | Copilot harness, sign-in, Copilot-specific chat, and integrations | Off in minimal profile | Separate from shared Chat/Agents surfaces used by Codex/Claude. |
| `sourceControl` | SCM UI, SCM service, quick diff, Git UI integration | Off in minimal profile | Disabling the SCM framework prevents third-party SCM providers. Git contribution may be separable from generic SCM. |
| `debug` | Debug UI, debug contributions and built-in debug integrations | Off in minimal profile | Keep language diagnostics and markers. Some extensions may contribute debuggers independently. |
| `tasks` | Task service and task UI | Off in minimal profile | Keep separate from the integrated terminal; task execution can be omitted while terminal and agent shell tools remain available. |
| `notebooks` | Notebook editor and renderers | Off in minimal profile | Review notebook imports in editor and web entry points. |
| `testing` | Testing UI and test controller contributions | Off in minimal profile | Language extensions can provide tests; omit only the workbench testing surface. |
| `remote` | Remote authority UI, remote explorer, tunnels and remote start | Off in minimal profile | Remote extension and server targets require independent treatment. |
| `extensionsUI` | Extensions view, recommendations and gallery UI | On when extensions are supported | Disabling this does not necessarily remove extension host/runtime support. Decide whether builds permit extension installation. |
| `welcome` | Getting Started, walkthroughs, welcome/onboarding surfaces | Off in minimal profile | Keep first-run essentials that remain required by product identity. |
| `feedback` | Issue/reporting surfaces and optional feedback integrations | Off in minimal profile | Product-level URLs and telemetry configuration need separate review. |

These groups should be refined into a dependency graph before implementation. Likely additional candidates include comments/review, search editor, profiles/sync, and update services, but they are not counted yet because they intersect core navigation, persistence or distribution responsibilities.

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
| Source Control UI and built-in Git | Out of scope per current request | Off | Medium | Clarify whether third-party SCM providers should remain supported; SCM API and built-in Git are distinct concerns. |
| Debugging | Useful, not required for stated minimum | Off | Medium | Debug extensions may contribute independently; preserve editor diagnostics. |
| Tasks | Useful, not required | Off | Medium | Separate from mandatory terminal; tasks may have shared service dependencies. |
| Notebooks | Out of scope for initial profile | Off | Medium | Check editor, renderer and web entry points. |
| Testing UI | Useful, not required for initial profile | Off | Medium | Test providers may come from language extensions. |
| Remote development and tunnels | Out of scope for initial profile | Off | Low | Crosses workbench, server, remote extensions and packaging. |
| Extension marketplace UI | Conditional | On if extensions are user-installable | Low | Disabling this can break language and agent extension installation; decide whether the product is closed/minimal or extensible. |
| Welcome, walkthrough and onboarding UI | Low alignment | Off | High | Mostly user-facing contributions; audit first-run dependencies. |
| Comments, PR review, GitHub integration | Out of scope | Off | Medium | Often coupled to GitHub and SCM but may be extension-owned. |
| Profiles and Settings Sync | Low alignment | Off | Low | Broad account, authentication and persistence dependencies. |
| Updates and feedback surfaces | Low alignment | Off or product-specific | Low | Distribution and product policy need review before exclusion. |

The matrix identifies roughly **9 feature areas proposed off** in the minimal profile (Chat, Source Control/Git, debugging, tasks, notebooks, testing, remote, welcome, and review integrations), plus conditional decisions for extension marketplace, sync, and product services. Only 10 groups are currently suitable as an initial flag inventory; several rows above need merging or splitting after dependency analysis. Do not interpret the count of rows as an implementation-ready flag count.

## Core that stays enabled

The minimal profile keeps editor and diff editor, file/workspace explorer, open/save and working-copy services, command/keybinding and quick access infrastructure, language service and extension API, markers/diagnostics, textMate/tree-sitter tokenization, search, settings/preferences, the integrated terminal, and extension host support when language extensions are in scope. Linting and formatting remain supplied by built-in language features or explicitly installed extensions. Codex/Claude integrations are separately declared and opt-in; they must not pull in Copilot Chat by implication.

## Proposed build interface

Add a validated build profile, preferably a checked-in `build/features.json` with `default` and `minimal` profiles, and allow explicit command-line overrides. Example profile names are `default` and `minimal`; avoid a growing set of undocumented environment variables. Resolve the selected profile once in build tooling, validate known keys and dependency constraints, and inject a generated module containing literal `true`/`false` constants. Application entry points then use a central feature-gated import registry so desktop, web and development bundles make the same choice.

The registry should group imports by feature and define required services separately from optional UI. Keep the default profile all-on for compatibility. Minimal can disable the candidate groups listed above according to validated dependencies. Build output should print the selected profile and flags, and package metadata should record the resolved configuration. Unknown flags and invalid combinations should fail early with actionable errors.

## Dependency and removal analysis required before coding

For each group, trace direct imports from all entry points, static imports from its contribution modules, service identifiers injected elsewhere, command/context references, extension API contracts, CSS/assets, and build/package tasks. Classify dependencies as required core, optional UI, optional provider, or extension-owned. Then test at least: default profile parity; minimal desktop bundle; minimal web bundle; and a third-party extension contribution against disabled UI groups where relevant. Search for residual imports in emitted bundle metadata to confirm disabled modules are absent.

SCM needs an explicit product decision: if the goal is removal of the built-in Git experience while retaining third-party source control extensions, split `git` from `sourceControlUI` and retain the provider API/service. If the goal is no source control feature of any kind, the SCM API and provider framework may also be removed, which is a wider compatibility break.

Chat likewise needs a product decision: removing Copilot Chat is not equivalent to removing all chat/agent support. Keep generic agent entry points only when the selected Codex/Claude integration uses them; otherwise remove Chat, agent sessions, MCP UI and associated shared services as a coherent set. Keep provider CLI integrations separately declared and optional.

## Rollout

1. Confirm the intended SCM boundary and whether Codex/Claude must use built-in agent session UI.
2. Produce an import and service dependency matrix for the 10 candidate groups; split or merge groups based on actual dependency edges.
3. Implement the profile resolver and generated compile-time constants without changing the default build.
4. Gate registrations across common, desktop, web, server and package lanes; remove extension/package artifacts only when the chosen profile excludes them.
5. Validate default parity and minimal desktop/web outputs, then document supported profile combinations.

## Current workspace state

The workspace already has local edits in `.vscode/extensions.json`, `.vscode/settings.json`, `AGENTS.md`, and `package-lock.json`. This specification does not change or revert those files. No dependencies were installed and no build was run for this analysis.
