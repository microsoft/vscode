# Chat Contributions Backlog

Each contribution has its own subfolder so its implementation, helpers, and tests can grow
without path churn. `IAgentHostChatContributions` owns explicitly registered,
dependency-injected contributions; their `order` controls sequencing, with registration
order only breaking ties. Ordering is per hook, so the same 100-series is reused
independently by different hooks.

## Hooks at a glance

| Hook | Fires | Contributions, in order |
|---|---|---|
| `onIncomingRequest` | A turn request asks to proceed to a provider. Synchronous, fails closed. | `localCommand` 50, `turnAdmission` 100 |
| `onTurnEnd` | A turn reached a terminal outcome. | `checkpointAndChangeset` 100, `queueDrain` 200, `githubReferences` 300, `sessionTitle` 400, `markUnread` 500, `sideChat` 500 |
| `onAction` | A client action was reduced into host state. | `queueDrain` 200, `sessionTitle` 400, `chatDraft` 600 |
| `onOutgoingTurn` | A turn is about to be sent. | `turnDelegation` 50, `markdownPlanRichLinks` 100, `artifactTools` 200, `chatSurface` 300, `sessionTitle` 400, `sideChat` 500 |
| `onHydrateTurns` | A provider returned a restored turn list. | `turnDelegation` 50, `persistedTurnUsage` 100, `worktreeAnnouncement` 200, `sideChat` 500 |
| `onHydrateChat` | A chat is being restored, before it enters the catalog. | `sessionTitle` 400, `chatDraft` 600 |

`markUnread` and `sideChat` both declare 500 on `onTurnEnd`; registration order breaks
that tie. Give a new contribution a distinct order rather than adding to the tie.

## Completed extractions

### `onIncomingRequest`

- `localCommand` (50) intercepts host-handled commands (`/rename`, `!command`) and returns
  `handled`. Its order is load-bearing: local commands were historically intercepted
  before the read-only guard ran, so a `/rename` on a read-only or archived chat succeeds.
  Running below `turnAdmission` preserves that.
- `turnAdmission` (100) rejects turns on read-only chats and archived sessions.

The shared admission preamble — the gate, title seeding, provider lookup, the `noAgent`
error, `userMessageSent`, and `turnStarted` — lives in the `startTurn` function in
`node/agentHostTurnStarter.ts`. Both `handleAction`'s `ChatTurnStarted` case and
`QueueDrainContribution._admitQueuedTurn` invoke it through
`IInstantiationService.invokeFunction`, differing only in their `source` and in who
dispatches `ChatTurnStarted`.

`startTurn` is a plain function taking `ServicesAccessor`, not a service. It is stateless,
so registering it in DI bought nothing and cost a registration in every hand-built test
service graph. Keep it a function unless it acquires state.

### `onTurnEnd`

- `checkpointAndChangeset` (100) captures the checkpoint before scheduling the changeset
  recompute; filters to `kind === 'success' || kind === 'error'`.
- `queueDrain` (200) owns queued-sender mementos and pending-message synchronization, and
  decides when a queued message may start a turn; drains for
  `kind === 'success' || kind === 'localCommand'`.
- `githubReferences` (300) attaches the owning session's GitHub pull request, only for
  `kind === 'success'`. This is its only hook.
- `sessionTitle` (400) refines the first-turn title, only for `kind === 'success'`.
- `markUnread` (500) is the terminal tail, kept at 500 because it was originally dispatched
  after all turn-complete side effects.
- `onTurnConsumable` is gone. Host-handled local commands end through `onTurnEnd` with
  `TurnEndReason.kind === 'localCommand'`; the other turn-end contributions exclude that
  reason to preserve their previous behavior.

### `onAction`

- `queueDrain` (200) tracks queued senders and synchronizes pending messages.
- `sessionTitle` (400) persists user-renamed titles, updates chat titles, and cascades
  default-chat titles to the owning session.
- `chatDraft` (600) persists chat drafts. Its trigger moved from `onDidEmitEnvelope` to
  `onAction`, narrowing it from client-and-server dispatch to client dispatch only. That is
  deliberate: `ChatDraftChangedAction` is a `ClientChatAction` that nothing in production
  server-dispatches, and `onAction` runs after the reject-and-return guards in
  `_dispatchActionNow`, so a rejected draft is no longer written.

### `onOutgoingTurn`

- `turnDelegation` (50) persists agent-authored delegation metadata before provider send so
  replay can restore request origins.
- `markdownPlanRichLinks` (100) adds Markdown plan rich-link guidance when
  `AgentHostMarkdownPlanRichLinksEnabledConfigKey` is enabled.
- `artifactTools` (200) adds artifact-tool guidance when `AgentHostArtifactToolsConfigKey`
  is enabled.
- `chatSurface` (300) adds terminal or editor-inline guidance from the session surface
  metadata.
- `sessionTitle` (400) asynchronously adds the automatic-title rename reminder.
- Orders 100-400 are reserved for the original host-instruction sequence.

`onOutgoingTurn` runs after admission and after the provider lookup, so a rejected turn and
a turn that fails with `noAgent` never reach it. That follows from only enriching messages
that are actually sent.

### `onHydrateTurns`

- `turnDelegation` (50) restores agent authorship and delegation metadata by host or
  provider turn id.
- `persistedTurnUsage` (100) restores persisted per-turn usage with one database read for
  the complete list.
- `worktreeAnnouncement` (200) restores the isolated-worktree notice for default chats
  through `IAgentHostWorktreeIsolation`.

### `onHydrateChat`

Restores host-owned chat state — today a title and a draft — from persistence before a chat
is registered in the session catalog.

- `sessionTitle` (400) restores the user-set custom chat title it persists in `onAction`.
- `chatDraft` (600) restores the draft it persists in `onAction`.
- Both keys are disjoint, so their relative order is nominal today; they declare it anyway.

The `meta.model` overlay in `_doRestoreSession` deliberately stays in `AgentService`: it
seeds the draft's model from `IAgent`-supplied session metadata, so it is provider-shaped,
and moving it would mean putting provider metadata into `IHydrationContext` for one
consumer.

## Design decisions worth keeping

### `onIncomingRequest` fails closed

Every other hook logs a throwing contribution, skips it, and continues. A throwing
`onIncomingRequest` contribution *rejects* the request with `internalError` at stage
`validation`. This gate is the enforcement behind the UI hiding the composer, so failing
open would let a buggy or remote client run work in a session that may no longer have its
isolated worktree on disk. Losing one enrichment is survivable; letting a request past a
guard is not.

### `onIncomingRequest` is synchronous

A gate has to decide before the send path performs any await, so the state it reads cannot
change between the decision and its effect. This is not a limitation: every admission check
the host performs today — read-only and archived chats, `ILocalChatCommand.tryHandle`, the
missing-provider check — is already synchronous. Making the hook async was tried first and
broke three `agentSideEffects` tests by deferring the read-only guard one microtask past the
assertions, which was the design saying the gate belongs before the first await.

### `onHydrateChat` is separate from `onHydrateTurns`

The two fire at different lifecycle moments, not because they carry different payloads:

| | `onHydrateTurns` | `onHydrateChat` |
|---|---|---|
| Call site | `_getChatMessages`, after `provider.chats.getMessages` | `_doRestoreSession`, `_restorePeerChatsFromCatalog`, subagent discovery |
| For peer chats | Lazy, on first content request | Eager, at catalog registration |
| Needs a provider | Yes | No — a metadata-only database read |

Fusing them would force drafts and titles to be read lazily, so a restored peer chat tab
would render untitled until it was opened, and the subagent site registers a title with no
turn hydration at all. Adding a `{ kind: 'summary' | 'turns' }` discriminant to one hook was
rejected for the same reason: the discriminant guidance covers payload variants *within* one
moment, the way `TurnEndReason` discriminates outcomes of a single turn ending.

`onHydrateChat` reuses `IHydrationContext` verbatim and copies `hydrateTurns`' dispatch
semantics — threading accumulator, per-hook ordering, and failure isolation that preserves
the previous value. `IRestoredChat` is an object from the start, like `ISendContribution`,
so the next host-owned restorable field does not need another hook.

### Hoisting the admission gate dropped rejection telemetry

The gate originally ran inside `_sendTurnMessage`, *after* `userMessageSent` and
`turnTracker.turnStarted`. It now runs at the front of the shared preamble, before both.
This was accepted deliberately and is not an oversight:

- A read-only or archived rejection no longer emits `userMessageSent`. That event now means
  "a message was actually sent to a provider", which is what its name claims.
- It also no longer emits a `turnCompleted` report. `AgentHostTurnTracker.turnCompleted`
  returns early when no `turnStarted` timing exists, so the previous `result: 'error'`,
  `stage: 'validation'` report is simply absent rather than malformed.
- `_completeTurn` and `_toolCallTracker.clearSession` were dropped from the rejection path
  for the same reason: both finalize a turn that started, and a rejected turn no longer
  starts one.

The tradeoff is losing per-rejection failure telemetry in exchange for a gate that runs
before any side effect. If rejection volume needs measuring later, report it from the
contribution rather than reviving the turn-completion path.

`_sendTurnMessage` now performs no admission at all; it is purely the send tail.

### Not contributions

- Subagent signal routing/buffering (`_handleAgentSignal`) and turn-id remap
  (`_dispatchActionForSession`) are routing fabric and correctness invariants.
- The three SDK event mappers and three attachment serializers are genuinely
  provider-shaped.
- `onAction` observes the post-reduction client dispatch path, not `onDidEmitEnvelope`:
  client actions already emit envelopes, so observing both would double-drain, and
  pending-message server envelopes historically did not enter `handleAction`.

## Known coverage gaps

- `onTurnEnd` fires from the agent signal path and from local command completion, but not
  for a client dispatched cancellation, nor for failures that report `ChatError` directly
  (a rejected admission, a missing provider, a send that throws). A contribution cannot yet
  rely on seeing every terminal outcome. Admission is now unified behind
  `onIncomingRequest`, so the remaining step is having those paths report through it.
- Making a rejection fire `onTurnEnd` is a behavior change, not a refactor:
  `checkpointAndChangeset` filters on `success || error`, so firing `error` for a rejected
  turn would schedule changeset work for a turn that never captured a checkpoint.
- Mementos with extra key segments must be deleted with `deleteMemento` when their segment
  value goes out of use. Setting the value to `undefined` keeps the entry until the owning
  chat or session is disposed.
- `onHydrateChat` runs before its chat is registered in the catalog, and chat mementos are
  evicted by chat disposal. A contribution that took a chat memento during hydration for a
  chat that then failed to register would leak that entry. Neither `chatDraft` nor
  `sessionTitle` takes a memento, so this is currently theoretical.
- `TurnEndReason` intentionally omits `AgentHostTurnFailureStage`: current error-hook
  dispatch comes only from `ChatError`, where the stage is hardcoded `provider`. Add it only
  when a contribution needs a stage that reflects every error source.
- `IIncomingRequest` carries no provider or resolved-agent information, because the gate
  runs before provider lookup. A contribution that needs to reject based on provider
  capability would need that lookup hoisted first.

## Remaining work

### Host bridge

- `hostLaunchKind` remains a plain `IAgentSideEffectsOptions` value used for queued-turn
  telemetry.
- `sendTurnMessage` remains on the bridge because the shared send tail is still owned by
  `AgentSideEffects`.
- An alternative that would delete `startTurn` outright: have `_admitQueuedTurn` re-enter
  `handleAction` after dispatching `ChatTurnStarted`, the way `AgentService`'s
  `_startSessionPrompt` and `_startAgentMergePrompt` already do, and derive `source` from
  the action's existing `queuedMessageId` rather than passing it. The bridge would swap
  `sendTurnMessage` for `handleAction`. This is a behavior change, not a shape change:
  `handleAction` ends by calling `_chatContributions.action(...)`, so queued turns would
  begin firing `onAction` for their `ChatTurnStarted`.

### Side chat

- Prefer `IAgentHostStateManager.getChatInheritedTurnId()` in
  `SideChatContribution.onOutgoingTurn`: it is the provider's ground-truth inherited
  boundary, handles dropped forks and Claude's fresh fallback, and avoids recomputing the
  requested anchor. Codex must first report `inheritedTurnId`; it currently computes
  `keepThroughIndex` without exposing it, and resolving its host-versus-thread turn IDs is
  the same id-space problem behind active-turn side chats.
- The source turn can complete between `createChat` and the first side-chat
  `onOutgoingTurn`. The fork was anchored before that turn, but the contribution then sees
  no active turn and injects no context, so the source turn is absent from both. This
  pre-existing race also occurs on main.
- Migrating btw/sideChat fully to the contribution deletes the six per-harness wiring sites
  in `copilot/copilotAgent.ts` and `claude/claudeAgent.ts` and the `sideChat` field from
  both `IPersistedChat` blobs. Codex gains btw support by deletion rather than addition.

### Mementos

- Add disposable-value semantics only when a contribution needs to store disposables.
  Memento eviction currently drops observables without disposing their values.
- Consider a `chatDisposable` helper only when a real contribution needs it; do not add it
  speculatively.

### Future hooks

- `onAgentSignal` — observes or redirects signals before they reach state.
