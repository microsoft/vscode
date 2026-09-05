# Chat Contributions Backlog

Open work and standing caveats for `IAgentHostChatContributions`. The architecture, the hook
contracts, and the rules for adding a contribution live in
`.github/skills/agent-host-chat-contributions/SKILL.md` and in the JSDoc on
`common/agentHostChatContributionsService.ts`. Completed extractions are recorded in git
history, not here.

`order` is load-bearing and is per hook, so the same 100-series is reused independently by
different hooks; registration order only breaks ties.

## Standing caveats

- A contribution on `onDidDispatchAction` must filter tightly, because the hook fires for
  every dispatched action. `sessionInputNeeded` and `persistedTurnUsage` both re-check
  `isAhpChatChannel` + `isChatAction`, reproducing the guard their code sat behind in
  `AgentSideEffects`. All three contributions on this hook also skip rejected actions,
  except that `sessionFlags` still persists config values for one, matching the behavior
  it was extracted from.
- `TurnEndReason` intentionally omits `AgentHostTurnFailureStage`: error-hook dispatch comes
  only from `ChatError`, where the stage is hardcoded `provider`. Add it only when a
  contribution needs a stage that reflects every error source.
- `IIncomingRequest` carries no provider or resolved-agent information, because the gate runs
  before provider lookup. A contribution that needs to reject based on provider capability
  would need that lookup hoisted first.

## Known gaps

- `onTurnEnd` does not fire for an agent-emitted `ChatError` or `ChatTurnCancelled` that
  arrives when no turn is active. The reducer's `endTurn` no-ops for those, so there is no
  turn to end; only `ChatTurnComplete` reports on that path, with an undefined `turnId`.
  Every terminal outcome a started turn can reach is otherwise covered.
- A rejected queued turn consumes its queued message through `ChatTurnStarted` but does not
  retrigger the drain, so the remaining queue stalls. Do not fix this by draining on
  `rejected`: an archived chat would cascade through every queued message with immediate
  rejections rather than retain them until it is unarchived. The fix is to return a rejected
  queued message to the queue.

## Remaining work

### Host bridge

- `hostLaunchKind` remains a plain `IAgentSideEffectsOptions` value used for queued-turn
  telemetry.
- `sendTurnMessage` remains on the bridge because the shared send tail is still owned by
  `AgentSideEffects`.
- An alternative that would delete `startTurn` outright: have `_admitQueuedTurn` re-enter
  `handleAction` after dispatching `ChatTurnStarted`, the way `AgentService`'s
  `_startSessionPrompt` and `_startAgentMergePrompt` already do, and derive `source` from the
  action's existing `queuedMessageId` rather than passing it. The bridge would swap
  `sendTurnMessage` for `handleAction`. This is a behavior change, not a shape change:
  `handleAction` ends by calling `_chatContributions.didApplyClientAction(...)`, so queued turns
  would begin firing `onDidApplyClientAction` for their `ChatTurnStarted`.

### Side chat

Both remaining items are defects, not extraction work; the btw/sideChat migration is done.

- Prefer `IAgentHostStateManager.getChatInheritedTurnId()` in
  `SideChatContribution.onOutgoingTurn`. `onHydrateTurns` already uses it; `onOutgoingTurn`
  still recomputes the anchor with `resolveLastNonLocalTurnId`. The state manager value is the
  provider's ground-truth inherited boundary, handles dropped forks and Claude's fresh
  fallback, and avoids recomputing the requested anchor. Codex must first report
  `inheritedTurnId`; it currently computes `keepThroughIndex` without exposing it, and
  resolving its host-versus-thread turn IDs is the same id-space problem behind active-turn
  side chats.
- The source turn can complete between `createChat` and the first side-chat `onOutgoingTurn`.
  The fork was anchored before that turn, but the contribution then sees no active turn and
  injects no context, so the source turn is absent from both. This pre-existing race also
  occurs on main.

### Mementos

- Add disposable-value semantics only when a contribution needs to store disposables. Memento
  eviction currently drops observables without disposing their values.
- Consider a `chatDisposable` helper only when a real contribution needs it; do not add it
  speculatively.

### Future hooks

- `onAgentSignal` — observes or redirects signals before they reach state.