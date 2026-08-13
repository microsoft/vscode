---
name: sessions
description: Core principles and workflow router for changes to the Agents Window under src/vs/sessions.
---

# Agents Window development

Use this skill for implementation, review, or design work under
`src/vs/sessions/**`.

## 1. Apply the core principles

- Preserve the layer direction: `vs/sessions` may import `vs/workbench` and
  lower layers; `vs/workbench` must never import `vs/sessions`.
- Keep shared Sessions code provider-neutral. Non-provider contributions must
  not import provider implementations.
- Model mutable session and chat state with observables. Use events for
  notifications, not as a parallel state model or for control flow.
- Register Sessions menu IDs in `browser/menus.ts` and consume `Menus.*`.
- Import contributions from the appropriate `sessions.*.main.ts` entry point.
- Prefer Sessions-owned adaptations over shared workbench changes unless the
  capability is genuinely shared.
- Put stable architecture in the owning specification and concrete behavior in
  tests. Do not preserve implementation chronology as development guidance.

## 2. Identify the owning area

Start with `src/vs/sessions/README.md`, then read only the specifications relevant
to the change:

| Area | Specification |
|------|---------------|
| Layering, folder ownership, cross-module imports | `src/vs/sessions/LAYERS.md` |
| Session/chat model, services, provider contract, core data flow | `src/vs/sessions/SESSIONS.md` |
| Workbench parts, grid, title bar, editor presentation | `src/vs/sessions/LAYOUT.md` |
| Session-aware layout state and restoration | `src/vs/sessions/LAYOUT_CONTROLLER.md` |
| Single-pane behavior and expected compositions | `src/vs/sessions/SINGLE_PANE_SCENARIOS.md` |
| Sessions sidebar list, grouping, filtering, and persistence | `src/vs/sessions/SESSIONS_LIST.md` |
| Phone layout and mobile components | `src/vs/sessions/MOBILE.md` |
| AI customizations | `src/vs/sessions/AI_CUSTOMIZATIONS.md` |
| Copilot customizations | `src/vs/sessions/copilot-customizations-spec.md` |
| Copilot Chat provider | `src/vs/sessions/contrib/providers/copilotChatSessions/COPILOT_CHAT_SESSIONS_PROVIDER.md` |
| Agent Host provider | `src/vs/sessions/contrib/providers/agentHost/AGENT_HOST_SESSIONS_PROVIDER.md` |
| Remote Agent Host provider | `src/vs/sessions/contrib/providers/remoteAgentHost/REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md` |

Do not load the learning inbox by default. Search its headings and scopes, then
read only matching entries after the authoritative specification.

## 3. Inspect before changing

- Trace the current implementation and its existing tests.
- Search for shared helpers, context keys, menu IDs, entry-point imports, and
  provider abstractions before adding new ones.
- Confirm which layer owns the behavior. Keep provider-specific decisions in the
  provider and view/layout decisions in Sessions-owned browser code.
- For UI work, also invoke the applicable accessibility, design, CSS, layout, or
  theming skill.
- For agent, LLM, policy, permissions, telemetry, or managed-setting changes,
  invoke the applicable specialist skill before implementation.

## 4. Implement the contract

Apply the core principles and the focused specification. Prefer small changes
that preserve these boundaries:

- `ISessionsManagementService` owns model orchestration and provider routing.
- `ISessionsService` owns visible and active session behavior.
- Providers expose provider-neutral state through `ISession` and `IChat`.
- Session state is observable; consumers derive UI state reactively.
- Contributions load through the appropriate `sessions.*.main.ts` entry point.
- Sessions menus use the shared `Menus` registry.
- Shared workbench changes represent shared capability, not Sessions-specific
  policy.

Update a specification when its architecture or durable behavior changes. Do not
add implementation chronology, rejected approaches, or bug narratives to a
specification.

## 5. Validate proportionally

Run the smallest existing checks that cover the change:

- focused unit tests for affected behavior;
- `npm run valid-layers-check` when imports or module ownership change;
- targeted type checking or compilation when TypeScript changes warrant it;
- relevant integration, E2E, or visual validation for cross-process or UI work.

Documentation-only changes require link, path, and consistency checks rather
than a full build.

## 6. Record feedback correctly

When a user explicitly corrects or rejects an approach, invoke the
`feedback-learning` skill unless they use the literal `learn!` trigger. Literal
`learn!` requests follow `.github/instructions/learnings.instructions.md`
instead. A durable architecture invariant belongs in the owning specification,
concrete behavior belongs in a regression test, and unproven reusable guidance
belongs temporarily in the scoped learning inbox. Never append every correction
to this skill.

## 7. Maintain this skill

Update this skill only when a principle is stable, cross-cutting, and useful for
most Agents Window work, or when the routing/workflow itself changes. Put
subsystem contracts in their focused specification and bug behavior in tests.

Keep the core-principles section at no more than ten bullets. Before adding one,
merge overlap, remove obsolete guidance, and prefer rewriting an existing
principle. Never append incident-specific details or use this skill as a
learning log.
