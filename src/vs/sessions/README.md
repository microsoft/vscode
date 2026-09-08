# Agents Window documentation

> **Specification change gate:** Bug fixes do not update the architecture specifications indexed here unless they intentionally change a documented contract. Put regression behavior in tests and implementation constraints in the owning code.

`vs/sessions` implements the Agents Window as a top-level layer above `vs/workbench`. This directory contains both the implementation and the durable design specifications that describe its boundaries.

## Documentation ownership

Each contract has one authoritative home:

- This file indexes the subsystem and its design documents.
- Focused specifications describe stable architecture and product invariants.
- Tests define concrete behavior and regressions.
- `.github/skills/sessions/SKILL.md` owns the basic development principles, their maintenance policy, and routing to the relevant specification.
- `.github/learnings/sessions.md` is a temporary inbox for reusable feedback that has not yet been promoted.
- Git history, issues, and pull requests preserve implementation chronology and rejected approaches.

Do not duplicate detailed guidance across these artifacts. Concise routing summaries may restate enough of a rule to identify its owning specification, which remains authoritative.

Only the documents indexed below are subsystem architecture specifications. Other Markdown in this directory has narrower ownership:

- `skills/*/SKILL.md` files are executable product workflows;
- `test/**/*.md` files are test infrastructure and scenario inputs;
- code-adjacent Markdown may specify a test-backed state machine or a scoped external contract.

Do not turn those files into general Sessions guidance.

## Architecture specifications

| Area | Authoritative document |
|------|------------------------|
| Internal layer hierarchy and import rules | [LAYERS.md](LAYERS.md) |
| Session/chat model, services, provider contract, and core data flow | [SESSIONS.md](SESSIONS.md) |
| Automations ownership, routing, migration, persistence, and run lifecycle | [AUTOMATIONS.md](AUTOMATIONS.md) |
| Workbench parts, grid, title bar, and editor presentation | [LAYOUT.md](LAYOUT.md) |
| Session-aware layout capture and restoration | [LAYOUT_CONTROLLER.md](LAYOUT_CONTROLLER.md) |
| Single-pane behavior scenarios | [SINGLE_PANE_SCENARIOS.md](SINGLE_PANE_SCENARIOS.md) |
| Sessions sidebar list | [SESSIONS_LIST.md](SESSIONS_LIST.md) |
| Phone layout and mobile components | [MOBILE.md](MOBILE.md) |
| AI customizations | [AI_CUSTOMIZATIONS.md](AI_CUSTOMIZATIONS.md) |
| Copilot customizations | [copilot-customizations-spec.md](copilot-customizations-spec.md) |
| Copilot Chat provider | [COPILOT_CHAT_SESSIONS_PROVIDER.md](contrib/providers/copilotChatSessions/COPILOT_CHAT_SESSIONS_PROVIDER.md) |
| Agent Host provider | [AGENT_HOST_SESSIONS_PROVIDER.md](contrib/providers/agentHost/AGENT_HOST_SESSIONS_PROVIDER.md) |
| Remote Agent Host provider | [REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md](contrib/providers/remoteAgentHost/REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md) |

## Structural boundaries

- `vs/sessions` may import from `vs/workbench` and lower layers. `vs/workbench` must not import from `vs/sessions`.
- Core browser and common code lives under `browser/` and `common/`.
- Shared Sessions services live under `services/`.
- Features live under `contrib/<feature>/`.
- Providers live under `contrib/providers/<provider>/`.
- Non-provider contributions must not import provider implementations.
- Contributions must be imported by the appropriate `sessions.*.main.ts` entry point to load.

See [LAYERS.md](LAYERS.md) for the enforced import graph.

## Updating documentation

Update an architecture specification only when a change modifies:

- component or service ownership;
- an interface, lifecycle, state machine, or persistence contract;
- a cross-component invariant that cannot be understood from one implementation.

Do not update architecture specifications for styling, copy, action placement, telemetry fields, settings defaults, file inventories, implementation algorithms, or individual bug fixes. Put concrete behavior and regressions in tests, keep a brief non-obvious constraint beside the owning code when needed, and preserve incident analysis and rejected approaches in the issue or pull request.

Before adding a section, identify the existing contract it changes. If no contract changes, the specification should usually remain untouched. Compact overlapping or obsolete material before adding new guidance.

The authoritative specification paths and their routing instructions are CODEOWNED. Their reviewer verifies that a contract actually changes and that a test or code-local constraint would not be the more durable representation.
