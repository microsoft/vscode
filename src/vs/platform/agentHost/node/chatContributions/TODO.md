# Chat Contributions Backlog

Each contribution has its own subfolder so its implementation, helpers, and tests can grow without path churn.
`IAgentHostChatContributions` owns explicitly registered, dependency-injected contributions; their `order` controls sequencing, with registration order only breaking ties.

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

## Completed `onHydrateTurns` extractions

- `persistedTurnUsage` (order 100) — restores persisted per-turn usage with one database read for the complete list.
- `worktreeAnnouncement` (order 200) — restores the isolated-worktree notice for default chats through the late-bound host bridge.
- Hydration reuses the spaced 100-series independently from turn-end and send hooks, because ordering is per hook.

## Future hooks

- `onIncomingRequest` — unifies duplicated turn admission in `handleAction` ChatTurnStarted (`agentSideEffects.ts:1521`) and `_tryConsumeNextQueuedMessage` (`agentSideEffects.ts:1977`), folds in `ILocalChatCommand`, and moves the read-only/archived guard from `_sendTurnMessage` (`agentSideEffects.ts:2093`) into a `reject` disposition.
- `onAgentSignal` — observes or redirects signals before they reach state.

## Memento follow-ups

- Add disposable-value semantics only when a contribution needs to store disposables. Memento eviction currently drops observables without disposing their values.
- Consider a `chatDisposable` helper only when a real contribution needs it; do not add it speculatively.

## Payoff

- Migrate btw/sideChat to one contribution (`contributeSend` plus `onHydrateTurns`), deleting the six per-harness wiring sites (`copilot/copilotAgent.ts:3651`, `:3755`, `:3900`; `claude/claudeAgent.ts:1414`, `:1987`, `:2359`) and the `sideChat` field from both `IPersistedChat` blobs. Codex gains btw support by deletion rather than addition.

## Deliberately not contributions

- Subagent signal routing/buffering (`_handleAgentSignal` `agentSideEffects.ts:816-947`) and turn-id remap (`_dispatchActionForSession` `agentSideEffects.ts:952-972`) are routing fabric and correctness invariants.
- The three SDK event mappers and three attachment serializers are genuinely provider-shaped.
