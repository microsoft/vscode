# Chat Contributions Backlog

Each contribution has its own subfolder so its implementation, helpers, and tests can grow without path churn.
`IAgentHostChatContributions` owns explicitly registered, dependency-injected contributions; their `order` controls sequencing, with registration order only breaking ties.

## Completed `onTurnEnd` extractions

- `checkpointAndChangeset` — captures the checkpoint before scheduling the changeset recompute; filters to `kind === 'success' || kind === 'error'` and runs first with an explicit order.
- `queueDrain` — owns queued-sender mementos, pending-message synchronization, and queue admission policy; drains for `kind === 'success' || kind === 'localCommand'`.
- `githubReferences`: attaches the owning session's GitHub pull request only for `kind === 'success'`.
- `sessionTitle` (order 400) refines the first-turn title only for `kind === 'success'`.
- `onTurnConsumable` is gone. Host-handled local commands now end through `onTurnEnd` with `TurnEndReason.kind === 'localCommand'`; the other turn-end contributions exclude that reason to preserve their previous behavior.

## Remaining `onTurnEnd` work

- `TurnEndReason` intentionally omits `AgentHostTurnFailureStage`: current error-hook dispatch comes only from `ChatError`, where the stage is hardcoded `'provider'`; add it only when a contribution needs a stage that reflects every error source.

## Remaining host bridge dependencies

- `hostLaunchKind` remains a plain `IAgentSideEffectsOptions` value used for queued-turn telemetry.
- `sendTurnMessage` remains on the bridge because the shared send tail is still owned by `AgentSideEffects`. Queue admission, including local-command interception, title seeding, provider lookup, and telemetry, lives in `QueueDrainContribution`.

## Completed `onOutgoingTurn` extractions

- `turnDelegation` (order 50) — persists agent-authored delegation metadata before provider send so replay can restore request origins.
- `markdownPlanRichLinks` (order 100) — adds Markdown plan rich-link guidance when `AgentHostMarkdownPlanRichLinksEnabledConfigKey` is enabled.
- `artifactTools` (order 200) — adds artifact-tool guidance when `AgentHostArtifactToolsConfigKey` is enabled.
- `chatSurface` (order 300) — adds terminal or editor-inline guidance from the session surface metadata.
- `githubReferences` (order 300) — attaches references from outgoing user messages.
- `sessionTitle` (order 400) asynchronously adds the automatic-title rename reminder.

## Completed `onAction` extractions

- `sessionTitle` (order 400) persists user-renamed titles, updates chat titles, and cascades default-chat titles to the owning session.

## Completed `onHydrateTurns` extractions

- `turnDelegation` (order 50) — restores agent authorship and delegation metadata by host or provider turn id.
- `persistedTurnUsage` (order 100) — restores persisted per-turn usage with one database read for the complete list.
- `worktreeAnnouncement` (order 200) — restores the isolated-worktree notice for default chats through `IAgentHostWorktreeIsolation`.
- Hydration reuses the spaced 100-series independently from turn-end and outgoing-turn hooks, because ordering is per hook.

## Known coverage gaps

- `onTurnEnd` fires from the agent signal path and from local command completion, but not for a client dispatched cancellation or for failures that report `ChatError` directly (missing provider, read-only or archived chat, a send that throws). This matches the call sites the previous `_markSessionUnread` had, so it is not a regression, but a contribution cannot yet rely on seeing every terminal outcome. Unifying admission behind `onIncomingRequest` is the point at which these paths can report through one route.
- Mementos with extra key segments must be deleted with `deleteMemento` when their segment value goes out of use. Setting the value to `undefined` keeps the entry until the owning chat or session is disposed.

## Future hooks

- `onAction` observes the post-reduction client dispatch path, not `onDidEmitEnvelope`: client actions already emit envelopes, so observing both would double-drain; pending-message server envelopes historically did not enter `handleAction` and remain outside this hook to preserve that behavior.
- `onIncomingRequest` — unifies duplicated turn admission in `handleAction` ChatTurnStarted and `QueueDrainContribution`, folds in `ILocalChatCommand`, and moves the read-only/archived guard from `_sendTurnMessage` into a `reject` disposition.
- `onOutgoingTurn` runs after the read-only/archived guard in `_sendTurnMessage`, so rejected messages do not attach GitHub references.
- `onOutgoingTurn` also runs after the provider lookup, so a turn that fails with `noAgent` does not attach GitHub references either. Both cases follow from attaching references to messages that are actually sent.
- Local commands can migrate to `onIncomingRequest` more easily now that their completion already flows through the normal turn-end path. Their `localCommand` reason continues to skip checkpointing, title refinement, GitHub-reference attachment, and mark-unread.
- `onAgentSignal` — observes or redirects signals before they reach state.

## Memento follow-ups

- Add disposable-value semantics only when a contribution needs to store disposables. Memento eviction currently drops observables without disposing their values.
- Consider a `chatDisposable` helper only when a real contribution needs it; do not add it speculatively.

## Side-chat follow-ups

- Prefer `IAgentHostStateManager.getChatInheritedTurnId()` in `SideChatContribution.onOutgoingTurn`: it is the provider's ground-truth inherited boundary, handles dropped forks and Claude's fresh fallback, and avoids recomputing the requested anchor. Codex must first report `inheritedTurnId`; it currently computes `keepThroughIndex` without exposing it, and resolving its host-versus-thread turn IDs is the same id-space problem behind active-turn side chats.
- The source turn can complete between `createChat` and the first side-chat `onOutgoingTurn`. The fork was anchored before that turn, but the contribution then sees no active turn and injects no context, so the source turn is absent from both. This pre-existing race also occurs on main.

## Payoff

- Migrate btw/sideChat to one contribution (`onOutgoingTurn` plus `onHydrateTurns`), deleting the six per-harness wiring sites (`copilot/copilotAgent.ts:3651`, `:3755`, `:3900`; `claude/claudeAgent.ts:1414`, `:1987`, `:2359`) and the `sideChat` field from both `IPersistedChat` blobs. Codex gains btw support by deletion rather than addition.

## Deliberately not contributions

- Subagent signal routing/buffering (`_handleAgentSignal` `agentSideEffects.ts:816-947`) and turn-id remap (`_dispatchActionForSession` `agentSideEffects.ts:952-972`) are routing fabric and correctness invariants.
- The three SDK event mappers and three attachment serializers are genuinely provider-shaped.
