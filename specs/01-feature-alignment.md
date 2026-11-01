# 01 — Feature alignment matrix

## Purpose

This matrix maps the requested focused IDE to workbench feature areas. “Minimal default” describes the proposed custom profile, not the repository's present default build. Optionality confidence is an initial source-structure estimate; low confidence means dependencies cross build lanes or shared platform services.

| Feature area | Fit | Minimal default | Candidate flag | Confidence | Rationale / boundary |
| --- | --- | --- | --- | --- | --- |
| Text editor and diff editor | Essential | On | Core | High | Main product surface; required by nearly every workbench flow. |
| Language services and extension API | Essential | On | Core | High | Needed for language support and extension-provided language features. |
| Diagnostics and markers | Essential | On | Core | High | Lint and language diagnostics depend on marker services and editor decorations. Keep data plumbing even if optional views are removed. |
| Linting and formatting | Essential | On | Core capability; providers opt-in | Medium | Built-in language features or explicitly declared provider extensions; never auto-install a formatter. |
| Files, workspaces, open/save | Essential | On | Core | High | Required editing and persistence workflow. |
| Search and code navigation | Essential | On | High | Core workflow for codebases; search editor can be considered separately. |
| Settings, commands, keybindings, quick access | Essential | On | Core | High | Shared workbench infrastructure. |
| Integrated terminal | Mandatory by user | On | `terminal` (locked on) | High | Must remain enabled in every profile. Also supports shell-based agent workflows. |
| Codex / Claude integration | Essential by selection | Explicit opt-in | `agents.codex`, `agents.claude` | Medium | Provider integrations are independent choices. Their UI/runtime requirements require separate tracing. |
| Generic Chat/Agents UI and session management | Required for selected in-editor agents | On when Codex/Claude panel sessions are selected | `agentSessionsUI` | Medium | Keep the shared panel and only required common services; this is not the Copilot product integration. |
| Copilot Chat harness, sign-in, and Copilot-specific UI/services | Out of scope | Off | `copilotChat` | Medium | Packaging and workbench registrations are filtered independently from shared Chat/Agents surfaces used by Codex/Claude; shared entitlement/configuration modules remain for now. |
| Built-in Git | Out of scope per request | Off | `git` | Medium | Git integration is separable conceptually from the generic SCM provider API, but dependencies need confirmation. |
| Source Control UI | Out of scope per request | Off | `sourceControlUI` | Low | The view, commands, and quick diff UI are omitted; the shared provider service remains available to enabled workbench consumers. |
| SCM provider service | Retain for enabled workbench consumers | On | `scmService` | Low | Keeps the generic SCM API registered without showing the Source Control view or enabling built-in Git. |
| Debug UI | Optional | Off | `debugUI` | Medium | Hides Debug views and built-in debugger integration; retain a small service bridge for enabled extension/workbench consumers. |
| Debug service/API bridge | Compatibility dependency | On | `debugService` | Medium | `MainThreadDebugService` and supporting contributions still inject `IDebugService`. |
| Task execution and UI | Optional | Off | `tasks` | Medium | Task API uses a disabled service contract for remaining consumers; terminal and agent shell tools stay enabled. |
| Notebook, Interactive, and REPL UI | Optional | Off | `notebooks` | Medium | Notebook extension bridges and editor imports are gated; a disabled service contract remains for Chat and Search. |
| Testing UI and provider bridge | Optional | Off | `testing` | Medium | Minimal builds omit the Testing contribution and MainThreadTesting bridge; internal extension-host testing code remains for Debug dependencies. |
| Remote development and tunnels | Optional | Off | `remote` | Medium | Remote workbench contributions and MainThread connection/socket/tunnel bridges are omitted; shared service contracts remain for core consumers. |
| Extension management UI | Conditional | On for manual installs | `extensionsUI` | Low | Minimal packages an explicit bundled extension allowlist; marketplace installs remain a user action. |
| Welcome, onboarding, walkthroughs | Low fit | Off | `welcome` | High | Welcome and onboarding contributions, Codex continuation guide, and diff editor tryout are omitted; shared Chat/Agents UI remains. |
| Comments and PR review | Low fit | Off | `review` | Medium | Omits the review contribution and MainThreadComments bridge; agent-editor comments remain separate. |
| Profiles and Settings Sync | Low fit | Off | `sync` | Low | Sync and Edit Sessions UI are omitted and web auto-sync is not eagerly started; shared services remain for Settings and extension management. |
| Update UI, surveys, and issue reporting | Product-specific | Off in minimal profile | `productServices` | Low | A no-op update service stays registered for shared consumers; platform update implementations are not loaded. |

## Flag count

The current schema has **17 optional feature controls**: `agentSessionsUI`, `copilotChat`, `chatPanel`, `git`, `sourceControlUI`, `scmService`, `debugUI`, `debugService`, `tasks`, `notebooks`, `testing`, `remote`, `extensionsUI`, `welcome`, `review`, `sync`, and `productServices`. `bundledExtensions` is a separate explicit package allowlist, not a runtime feature flag. `terminal` is a required-on invariant, not a toggle. Codex and Claude are explicit provider selections. The controls have dependencies and do not all remove every shared service from output.

Keep built-in Git, the Source Control UI, and the shared SCM service separate. The minimal profile omits Git and the UI while retaining the service for remaining consumers. Do not combine `terminal` and `tasks`; the user's terminal requirement makes that distinction material.

