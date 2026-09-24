# Agents Window learning inbox

Last reviewed: 2026-08-13

Scope: `src/vs/sessions/**`

## Test the boundary that failed

- **Scope:** `src/vs/sessions/**/test/**`, `src/vs/platform/agentHost/test/**`
- **Learning:** Regression tests should exercise the user-facing or transport boundary where behavior failed, not only an internal helper, mock shortcut, or diagnostic message.
- **Evidence:** Historical fixes passed helper-level tests while DOM listeners were disconnected, and provider mocks bypassed protocol mappers that had dropped optional metadata.
- **Disposition:** Candidate for the repository test-writing guidance; concrete recurrences belong in focused regression tests.

## Tie transition guards to the work they protect

- **Scope:** `src/vs/sessions/**`
- **Learning:** State that suppresses or coordinates a transition should share the lifetime of the observable or promise that performs the transition. Synchronous work must unwind synchronously; timers and consume-once flags are not lifecycle signals.
- **Evidence:** The same class of race appeared in layout restoration, delayed provider readiness, draft replacement, and stale asynchronous picker results.
- **Disposition:** Candidate for the Sessions skill if it continues to recur outside the lifecycle contracts already covered by focused specifications.

## Preserve metadata through every hydration path

- **Scope:** `src/vs/sessions/contrib/providers/agentHost/**`, `src/vs/platform/agentHost/**`
- **Learning:** Metadata that affects session identity or behavior must survive live notifications, catalog listing, wire mapping, caches, and restoration. Optional type fields do not prove that field-by-field mappers preserved them.
- **Evidence:** Historical quick-chat and restored-session failures appeared only on alternate hydration paths that direct provider mocks did not exercise.
- **Disposition:** Candidate for an Agent Host persistence test matrix or provider specification.

## Preserve semantic identity and order in presentation

- **Scope:** `src/vs/sessions/browser/**`, `src/vs/sessions/contrib/**`
- **Learning:** Presentation code may filter or decorate provider data, but should not merge exact identities or reorder stable source sequences using mutable labels, status, or asynchronously arriving enrichment.
- **Evidence:** Historical picker and tab regressions collapsed distinct providers, moved committed drafts, or dropped already-visible grouped items.
- **Disposition:** Candidate for focused picker and multi-chat regression tests.

## Scope reactive UI state to the rendered entity

- **Scope:** `src/vs/sessions/**/browser/**`
- **Learning:** Reactive and asynchronous UI state must be bound to the session, chat, or tree element actually being rendered. Recycled templates must replace their element-scoped subscriptions, and awaited results must be rejected after ownership changes.
- **Evidence:** Historical issues included actions targeting the window-global session, stale repository context on recycled rows, and late async results publishing into a replacement view.
- **Disposition:** Candidate for focused UI specifications and lifecycle tests.

## Attribute a console error to the provider that backs the surface

- **Scope:** `src/vs/sessions/contrib/providers/**`
- **Learning:** The sessions list resolves every registered provider, so an error in the console may come from a provider unrelated to the surface the user was operating. Identify which provider backs that surface before editing; a stack trace shows where an error was thrown, not which feature produced it. Several providers share a product name across the workbench and the Copilot extension without sharing an implementation.
- **Evidence:** A cloud sandbox report was traced into the Copilot extension's similarly named cloud provider, which shares neither code nor identifier with the Agents Window sandbox provider.
- **Disposition:** Candidate for the Sessions skill if provider-attribution mistakes recur.

## Rule out local product configuration before suspecting product code

- **Scope:** `src/vs/sessions/**`, `src/vs/platform/agentHost/**`
- **Learning:** Features reading `product.defaultChatAgent` can misbehave in dev builds because `product.overrides.json` is gitignored and drifts from the shipped configuration without appearing in any diff. Compare the specific keys a feature reads against the distro mixin before treating the behavior as a code defect, and note that ordered configuration arrays carry meaning by index.
- **Evidence:** A rotated `providerScopes` array left index 0 — the permissive scope set that the cloud sandbox client reads directly — without repository access, presenting as an authentication bug in feature code.
- **Disposition:** Candidate for repository onboarding or debugging guidance if dev-only configuration drift recurs.

## Capture live editor state independently of persistence

- **Scope:** `src/vs/sessions/contrib/layout/**`
- **Learning:** A newly created Quick Chat can contain live editors before it has a saved working set. Visibility capture should observe the live editor list while excluding transient strategy-owned hides and empty editor groups.
- **Evidence:** Gating side-pane visibility capture on saved working-set presence lost the state opened before the Quick Chat's first switch.
- **Disposition:** The durable behavior belongs in layout specifications and focused regression tests.
