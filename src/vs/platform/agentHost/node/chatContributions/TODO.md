# Chat Contributions Backlog

Each contribution has its own subfolder so its implementation, helpers, and tests can grow without path churn.
`IAgentHostChatContributions` owns explicitly registered, dependency-injected contributions; their `order` controls sequencing, with registration order only breaking ties.

## Completed `onTurnEnd` extractions

- `checkpointAndChangeset` — captures the checkpoint before scheduling the changeset recompute; filters to `kind === 'success' || kind === 'error'` and runs first with an explicit order.
- `queueDrain` — owns queued-sender mementos, pending-message synchronization, and queue admission policy; only drains for `kind === 'success'`.
- `githubReferences`: attaches references from direct user messages and the owning session's GitHub pull request only for `kind === 'success'`.
- `sessionTitle` (order 400) refines the first-turn title only for `kind === 'success'`.

## Remaining `onTurnEnd` work

- `TurnEndReason` intentionally omits `AgentHostTurnFailureStage`: current error-hook dispatch comes only from `ChatError`, where the stage is hardcoded `'provider'`; add it only when a contribution needs a stage that reflects every error source.

## Remaining host bridge dependencies

- `hostLaunchKind` remains a plain `IAgentSideEffectsOptions` value used for queued-turn telemetry.
- `sendTurnMessage` remains on the bridge because the shared send tail is still owned by `AgentSideEffects`. Queue admission, including local-command interception, title seeding, provider lookup, and telemetry, lives in `QueueDrainContribution`.

## Completed `contributeSend` extractions

- `markdownPlanRichLinks` (order 100) — adds Markdown plan rich-link guidance when `AgentHostMarkdownPlanRichLinksEnabledConfigKey` is enabled.
- `artifactTools` (order 200) — adds artifact-tool guidance when `AgentHostArtifactToolsConfigKey` is enabled.
- `chatSurface` (order 300) — adds terminal or editor-inline guidance from the session surface metadata.
- `sessionTitle` (order 400) asynchronously adds the automatic-title rename reminder.

## Completed `onAction` extractions

- `sessionTitle` (order 400) persists user-renamed titles, updates chat titles, and cascades default-chat titles to the owning session.

## Completed `onHydrateTurns` extractions

- `persistedTurnUsage` (order 100) — restores persisted per-turn usage with one database read for the complete list.
- `worktreeAnnouncement` (order 200) — restores the isolated-worktree notice for default chats through `IAgentHostWorktreeIsolation`.
- Hydration reuses the spaced 100-series independently from turn-end and send hooks, because ordering is per hook.

## Future hooks

- `onAction` observes the post-reduction client dispatch path, not `onDidEmitEnvelope`: client actions already emit envelopes, so observing both would double-drain; pending-message server envelopes historically did not enter `handleAction` and remain outside this hook to preserve that behavior.
- `onIncomingRequest` — unifies duplicated turn admission in `handleAction` ChatTurnStarted and `QueueDrainContribution`, folds in `ILocalChatCommand`, and moves the read-only/archived guard from `_sendTurnMessage` into a `reject` disposition.
- `onUserMessage` is dispatched only for direct `ChatTurnStarted` admission after local-command handling. Queued admission in `QueueDrainContribution` therefore continues to skip GitHub reference attachment until `onIncomingRequest` unifies admission.
- Migrate local commands to `onIncomingRequest`, then remove their narrow `turnConsumable` callback. Local-command turns must not be routed through `turnEnd`, because they intentionally skip checkpointing, title refinement, and GitHub-reference attachment.
- `onAgentSignal` — observes or redirects signals before they reach state.

## Memento follow-ups

- Add disposable-value semantics only when a contribution needs to store disposables. Memento eviction currently drops observables without disposing their values.
- Consider a `chatDisposable` helper only when a real contribution needs it; do not add it speculatively.

## Payoff

- Migrate btw/sideChat to one contribution (`contributeSend` plus `onHydrateTurns`), deleting the six per-harness wiring sites (`copilot/copilotAgent.ts:3651`, `:3755`, `:3900`; `claude/claudeAgent.ts:1414`, `:1987`, `:2359`) and the `sideChat` field from both `IPersistedChat` blobs. Codex gains btw support by deletion rather than addition.

## Deliberately not contributions

- Subagent signal routing/buffering (`_handleAgentSignal` `agentSideEffects.ts:816-947`) and turn-id remap (`_dispatchActionForSession` `agentSideEffects.ts:952-972`) are routing fabric and correctness invariants.
- The three SDK event mappers and three attachment serializers are genuinely provider-shaped.
