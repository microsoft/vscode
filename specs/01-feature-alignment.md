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
| Copilot Chat harness, sign-in, and Copilot-specific UI/services | Out of scope | Off | `copilotChat` | Medium | Imports are spread across common, desktop, and web entry points. Separate from shared Chat/Agents surfaces used by Codex/Claude. |
| Built-in Git | Out of scope per request | Off | `git` | Medium | Git integration is separable conceptually from the generic SCM provider API, but dependencies need confirmation. |
| SCM framework and UI | Out of scope per request; boundary open | Off unless provider API retained | `scm` | Low | Removing this breaks third-party SCM providers. Decide whether the requested removal targets built-in Git or all SCM providers. |
| Debug UI and built-in debugging | Optional | Off | `debug` | Medium | Debug extensions may contribute independently; not required for diagnostics. |
| Tasks | Optional | Off | `tasks` | Medium | Keep separate from mandatory terminal. |
| Notebooks | Optional | Off | `notebooks` | Medium | Renderer, editor, and web entry-point imports need checking. |
| Testing UI | Optional | Off | `testing` | Medium | Language extensions may still provide test controllers; decide whether to retain that API. |
| Remote development and tunnels | Out of initial scope | Off | `remote` | Low | Crosses workbench, server, extension, and packaging lanes. |
| Extension management UI | Conditional | On if users install extensions | `extensionsUI` | Low | Hiding the view differs from removing extension host and install support. Explicit install policy must be preserved. |
| Welcome, onboarding, walkthroughs | Low fit | Off | `welcome` | High | Mostly separable presentation contributions; audit startup requirements. |
| Comments, GitHub, PR review | Low fit | Off | `review` | Medium | Some are extensions; built-in integrations can depend on Git/SCM. |
| Profiles and Settings Sync | Low fit | Off | `sync` | Low | Broad account, authentication, and persistence dependencies. |
| Update and feedback surfaces | Product-specific | Off in custom build | `productServices` | Low | Intersects distribution and policy configuration; analyze separately. |

## Flag count

The current proposal has **12 candidate controls**: `agentSessionsUI`, `copilotChat`, `git`, `scm`, `debug`, `tasks`, `notebooks`, `testing`, `remote`, `extensionsUI`, `welcome`, and `review`, with `sync` and `productServices` as later candidates. `terminal` is a required-on invariant, not a toggle. Codex and Claude are opt-in provider selections. This is a planning count, not a claim that all controls are independent or implementation-ready.

Do not combine `git` and `scm` into one flag until the third-party SCM compatibility decision is made. Do not combine `terminal` and `tasks`; the user's terminal requirement makes that distinction material.

