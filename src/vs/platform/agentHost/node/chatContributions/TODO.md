# Chat Contributions Backlog

Each contribution has its own subfolder so its implementation, helpers, and tests can grow without path churn.

## Completed `onTurnEnd` extractions

- `checkpointAndChangeset` — captures the checkpoint before scheduling the changeset recompute; filters to `kind === 'success' || kind === 'error'` and runs first with an explicit order.
- `queueDrain` — calls `_tryConsumeNextQueuedMessage` only for `kind === 'success'`.
- `gitRefresh` — notifies the host to refresh git state only for `kind === 'success'`.
- `titleRefinement` — refines the first-turn title only for `kind === 'success'`.

## Remaining `onTurnEnd` work

- `TurnEndReason` intentionally omits `AgentHostTurnFailureStage`: current error-hook dispatch comes only from `ChatError`, where the stage is hardcoded `'provider'`; add it only when a contribution needs a stage that reflects every error source.

## Completed `contributeSend` extractions

- `markdownPlanRichLinks` (order 100) — adds Markdown plan rich-link guidance when `AgentHostMarkdownPlanRichLinksEnabledConfigKey` is enabled.
- `artifactTools` (order 200) — adds artifact-tool guidance when `AgentHostArtifactToolsConfigKey` is enabled.
- `chatSurface` (order 300) — adds terminal or editor-inline guidance from the session surface metadata.
- `renameInstruction` (order 400) — asynchronously adds the automatic-title rename reminder.

## Future hooks

- `onIncomingRequest` — unifies duplicated turn admission in `handleAction` ChatTurnStarted (`agentSideEffects.ts:1530`) and `_tryConsumeNextQueuedMessage` (`agentSideEffects.ts:1986`), folds in `ILocalChatCommand`, and moves the read-only/archived guard from `_sendTurnMessage` (`agentSideEffects.ts:2102`) into a `reject` disposition.
- `onHydrateTurns` — registers whole-list stages for side-chat stripping and turn usage, replacing `worktreeAnnouncement` (`agentService.ts:_getChatMessages:3108`) and `persistedTurnUsage` (`agentService.ts:_applyPersistedTurnUsage:3136`); the list boundary avoids one DB read per turn.
- **Open architectural question for the next step:** `onHydrateTurns` runs in `AgentService._getChatMessages` (`agentService.ts:3102`), while the dispatcher is instantiated in `AgentSideEffects`. Decide then whether to share/hoist the dispatcher or instantiate a second one; do not resolve that ownership here.
- `onAgentSignal` — observes or redirects signals before they reach state.

## Payoff

- Migrate btw/sideChat to one contribution (`contributeSend` plus `onHydrateTurns`), deleting the six per-harness wiring sites (`copilot/copilotAgent.ts:3649`, `:3754`, `:3900`; `claude/claudeAgent.ts:1414`, `:1986`, `:2357`) and the `sideChat` field from both `IPersistedChat` blobs. Codex gains btw support by deletion rather than addition.

## Deliberately not contributions

- Subagent signal routing/buffering (`_handleAgentSignal` `agentSideEffects.ts:825-948`) and turn-id remap (`agentSideEffects.ts:975`) are routing fabric and correctness invariants.
- The three SDK event mappers and three attachment serializers are genuinely provider-shaped.
