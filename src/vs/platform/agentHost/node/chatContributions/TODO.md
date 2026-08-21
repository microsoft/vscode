# Chat Contributions Backlog

Each contribution has its own subfolder so its implementation, helpers, and tests can grow without path churn.

## Remaining `onTurnEnd` extractions

- `checkpointAndChangeset` (`agentSideEffects.ts:1163`) — replaces checkpoint capture and changeset completion; must run before others with an explicit `order` and filter to `kind === 'success' || kind === 'error'`.
- `queueDrain` (`agentSideEffects.ts:1181`) — replaces `_tryConsumeNextQueuedMessage` and must filter to `kind === 'success'`.
- `git refresh host notification` (`agentSideEffects.ts:1182`) — replaces `_options.onTurnComplete`.
- `titleRefinement` (`agentSideEffects.ts:1190`) — replaces `_titleController.refineTitleFromFirstTurn` and must filter to `kind === 'success'`.
- `TurnEndReason` intentionally omits `AgentHostTurnFailureStage`: current error-hook dispatch comes only from `ChatError`, where the stage is hardcoded `'provider'`; add it only when a contribution needs a stage that reflects every error source.

## Future hooks

- `onIncomingRequest` — unifies duplicated turn admission in `handleAction` ChatTurnStarted (`agentSideEffects.ts:1604`) and `_tryConsumeNextQueuedMessage` (`agentSideEffects.ts:2061`), folds in `ILocalChatCommand`, and moves the read-only/archived guard from `_sendTurnMessage` (`agentSideEffects.ts:2171`) into a `reject` disposition.
- `contributeSend` — moves the four inline `hostInstructions` conditionals from `_sendTurnMessage` (`agentSideEffects.ts:2223`): `markdownPlanRichLinks`, `artifactTools`, `chatSurface`, and `renameInstruction`.
- `onHydrateTurns` — registers whole-list stages for side-chat stripping and turn usage, replacing `worktreeAnnouncement` (`agentService.ts:_getChatMessages:3093`) and `persistedTurnUsage` (`agentService.ts:_getChatMessages:3117`); the list boundary avoids one DB read per turn.
- `onAgentSignal` — observes or redirects signals before they reach state.

## Payoff

- Migrate btw/sideChat to one contribution (`contributeSend` plus `onHydrateTurns`), deleting the six per-harness wiring sites (`copilotAgent.ts:3524`, `:3629`, `:3775`; `claudeAgent.ts:1414`, `:1986`, `:2357`) and the `sideChat` field from both `IPersistedChat` blobs. Codex gains btw support by deletion rather than addition.

## Deliberately not contributions

- Subagent signal routing/buffering (`_handleAgentSignal` `agentSideEffects.ts:863-915`) and turn-id remap (`agentSideEffects.ts:974`) are routing fabric and correctness invariants.
- The three SDK event mappers and three attachment serializers are genuinely provider-shaped.
