# Chat Contributions Backlog

Each contribution has its own subfolder so its implementation, helpers, and tests can grow without path churn.

## Completed `onTurnEnd` extractions

- `checkpointAndChangeset` — captures the checkpoint before scheduling the changeset recompute; filters to `kind === 'success' || kind === 'error'` and runs first with an explicit order.
- `queueDrain` — calls `_tryConsumeNextQueuedMessage` only for `kind === 'success'`.
- `gitRefresh` — notifies the host to refresh git state only for `kind === 'success'`.
- `titleRefinement` — refines the first-turn title only for `kind === 'success'`.

## Remaining `onTurnEnd` work

- `TurnEndReason` intentionally omits `AgentHostTurnFailureStage`: current error-hook dispatch comes only from `ChatError`, where the stage is hardcoded `'provider'`; add it only when a contribution needs a stage that reflects every error source.

## Future hooks

- `onIncomingRequest` — unifies duplicated turn admission in `handleAction` ChatTurnStarted (`agentSideEffects.ts:1545`) and `_tryConsumeNextQueuedMessage` (`agentSideEffects.ts:2028`), folds in `ILocalChatCommand`, and moves the read-only/archived guard from `_sendTurnMessage` (`agentSideEffects.ts:2143`) into a `reject` disposition.
- `contributeSend` — moves the four inline `hostInstructions` conditionals from `_sendTurnMessage` (`agentSideEffects.ts:2188`): `markdownPlanRichLinks`, `artifactTools`, `chatSurface`, and `renameInstruction`.
- `onHydrateTurns` — registers whole-list stages for side-chat stripping and turn usage, replacing `worktreeAnnouncement` (`agentService.ts:_getChatMessages:3108`) and `persistedTurnUsage` (`agentService.ts:_applyPersistedTurnUsage:3136`); the list boundary avoids one DB read per turn.
- `onAgentSignal` — observes or redirects signals before they reach state.

## Payoff

- Migrate btw/sideChat to one contribution (`contributeSend` plus `onHydrateTurns`), deleting the six per-harness wiring sites (`copilotAgent.ts:3524`, `:3629`, `:3775`; `claudeAgent.ts:1414`, `:1986`, `:2357`) and the `sideChat` field from both `IPersistedChat` blobs. Codex gains btw support by deletion rather than addition.

## Deliberately not contributions

- Subagent signal routing/buffering (`_handleAgentSignal` `agentSideEffects.ts:840-963`) and turn-id remap (`agentSideEffects.ts:976`) are routing fabric and correctness invariants.
- The three SDK event mappers and three attachment serializers are genuinely provider-shaped.
