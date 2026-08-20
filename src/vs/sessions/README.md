# Agents Window documentation

`vs/sessions` implements the Agents Window as a top-level layer above
`vs/workbench`. This directory contains both the implementation and the durable
design specifications that describe its boundaries.

## Documentation ownership

Each contract has one authoritative home:

- This file indexes the subsystem and its design documents.
- Focused specifications describe stable architecture and product invariants.
- Tests define concrete behavior and regressions.
- `.github/skills/sessions/SKILL.md` owns the basic development principles,
  their maintenance policy, and routing to the relevant specification.
- `.github/learnings/sessions.md` is a temporary inbox for reusable feedback
  that has not yet been promoted.
- Git history, issues, and pull requests preserve implementation chronology and
  rejected approaches.

Do not duplicate detailed guidance across these artifacts. Concise routing
summaries may restate enough of a rule to identify its owning specification,
which remains authoritative.

## Architecture specifications

| Area | Authoritative document |
|------|------------------------|
| Internal layer hierarchy and import rules | [LAYERS.md](LAYERS.md) |
| Session/chat model, services, provider contract, and core data flow | [SESSIONS.md](SESSIONS.md) |
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

- `vs/sessions` may import from `vs/workbench` and lower layers.
  `vs/workbench` must not import from `vs/sessions`.
- Core browser and common code lives under `browser/` and `common/`.
- Shared Sessions services live under `services/`.
- Features live under `contrib/<feature>/`.
- Providers live under `contrib/providers/<provider>/`.
- Non-provider contributions must not import provider implementations.
- Contributions must be imported by the appropriate `sessions.*.main.ts` entry
  point to load.

See [LAYERS.md](LAYERS.md) for the enforced import graph.

## Updating documentation

Update a specification when a change modifies the architecture or a durable
contract it describes. Keep implementation walkthroughs, incident narratives,
and transient fixes out of specifications; represent concrete behavior with
tests and preserve historical rationale in the associated issue or pull request.
