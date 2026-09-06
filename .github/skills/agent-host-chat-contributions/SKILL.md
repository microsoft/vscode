---
name: agent-host-chat-contributions
description: Build and review cross-cutting agent-host chat behavior through lifecycle contributions. Use when adding turn lifecycle side effects, prompt or context injection, restored-history transformation, protocol-action observation, or when reviewing changes that add code to AgentSideEffects or AgentService.
---

# Agent Host Chat Contributions

Use the contribution model for a self-contained behavior that crosses an
agent-host chat lifecycle boundary. Read these files before changing the model:

- `src/vs/platform/agentHost/common/agentHostChatContributionsService.ts`
- `src/vs/platform/agentHost/node/agentHostChatContributionsService.ts`
- `src/vs/platform/agentHost/node/chatContributions/TODO.md`
- `src/vs/platform/agentHost/node/chatContributions/builtInChatContributions.ts`

## The rule that prevents the old failure mode

> **New cross-cutting features go in contributions, not in `AgentSideEffects` or
> `AgentService`.**

`AgentSideEffects` has shed well over 700 lines by extracting seventeen behaviors.
Do not put another lifecycle side effect, outgoing-prompt addition, restored-turn
enrichment, admission check, or action observer back into either large
orchestration class. `AgentSideEffects` dispatches the lifecycle and retains routing and send
mechanics; `AgentService` owns session lifecycle and invokes hydration and
memento eviction. See `agentSideEffects.ts` and `agentService.ts`.

This is also a review rule: code added to either file needs a specific reason
that it is routing, a correctness invariant, provider-shaped behavior, or a
dispatcher call site. "It was convenient to add here" is not a reason.

## Decide before you code

Write a contribution when the behavior answers yes to this test:

1. Does it react to a lifecycle moment the hooks already name — a turn request
   asking to proceed, a completed turn, a dispatched action, a turn about to be
   sent, a restored turn list, or a chat being restored?
2. Can an explicitly registered, dependency-injected unit own it without
   changing protocol routing or provider mapping?
3. Does it compose with other behavior in a defined order?

Examples are admission gating, local-command interception, checkpoint and
changeset work, queue draining, GitHub-reference attachment, title handling,
persisted usage, session input-needed aggregation, session flag persistence,
chat drafts, worktree announcements, unread state, rich-link guidance,
artifact-tool guidance, and chat-surface guidance. Their directories under
`node/chatContributions/` are the reference implementations.

Do **not** use a contribution for the following:

- Subagent signal routing and buffering in
  `node/agentSideEffects.ts` are routing fabric and correctness invariants.
- Turn-id remapping in `node/agentSideEffects.ts` is also routing fabric.
- The three SDK event mappers and three attachment serializers are
  provider-shaped.
- Provider-shaped overlays applied during restore, such as seeding a draft's
  model from `IAgent`-supplied session metadata in `_doRestoreSession`. Moving
  one would push provider metadata into `IHydrationContext` for one consumer.

If the answer is "this must route every signal correctly before state changes"
or "this differs by SDK," it is not a contribution. Open work and standing
caveats are tracked in `node/chatContributions/TODO.md`.

## Keep the hook surface small

`IAgentHostChatContribution` has seven hooks in
`common/agentHostChatContributionsService.ts`. Only add another method when no
existing payload can express the behavior.

The set was once reduced from six to four:

- `onTurnConsumable` became `onTurnEnd` with
  `TurnEndReason.kind === 'localCommand'`.
- `onUserMessage` became `onOutgoingTurn`.

Prefer adding a discriminant or payload to an existing type, such as a new
`TurnEndReason` variant, over adding a hook. A proposed single-purpose hook
with one caller and one implementer is the smell that produced both removals.
Do not create an abstraction merely to move one direct call.

The three hooks added since clear a specific bar: **no existing payload could
express them because they fire at a different moment or from a different
source, not merely with different data.**

- `onHydrateChat` restores host-owned chat state *before* a chat enters the
  catalog. `onHydrateTurns` runs lazily, after a provider returns turns, so
  reusing it would leave a restored peer chat untitled until it was opened.
- `onIncomingRequest` gates a turn before it reaches a provider, and can reject
  it. No observer hook can refuse.
- `onDidDispatchAction` observes server-dispatched and rejected actions, which
  `onDidApplyClientAction` structurally cannot see.

Adding a `{ kind: ... }` discriminant to an existing hook was considered and
rejected for `onHydrateChat`: the discriminant guidance covers payload variants
*within* one moment, the way `TurnEndReason` discriminates outcomes of a single
turn ending.

## Anatomy and registration

Give every contribution its own directory under
`node/chatContributions/<feature>/`. It owns its implementation, helpers, and
tests as it grows. A contribution must have:

- `static readonly id`, unique across registrations.
- An explicit `order`, even when it currently appears independent.
- A constructor whose first parameter is
  `IAgentHostChatContributionContext`, followed by injected services.
- A single registration in
  `node/chatContributions/builtInChatContributions.ts`.

This is the complete shape of the existing artifact-tools contribution,
adapted from `artifactTools/artifactToolsContribution.ts`:

```ts
export class ArtifactToolsContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'artifactTools';
	readonly order = 200;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentConfigurationService private readonly _agentConfigService: IAgentConfigurationService,
	) {
		super();
	}

	onOutgoingTurn(): ISendContribution | undefined {
		return this._agentConfigService.getRootValue(platformRootSchema, AgentHostArtifactToolsConfigKey)
			? { instructions: [ARTIFACT_TOOLS_INSTRUCTION] }
			: undefined;
	}
}
```

Add its constructor to the one built-in list with
`contributions.registerContribution(ArtifactToolsContribution)`. That list is
activated by `activateAgentHostContributions` in
`node/agentHostContributions.ts`; do not add a competing registration site.
The dispatcher constructs each contribution through `IInstantiationService`,
rejects duplicate ids, and disposes it on unregistration.

## The seven hooks

| Hook | Fires when | Must not assume | Existing example |
|---|---|---|---|
| `onIncomingRequest` | A turn request asks to proceed to a provider, before any side effect. **Synchronous, and fails closed.** | It decides admission, so a throw rejects rather than being skipped. Return `accept`, `handled`, or `reject`; the first non-accept wins and later contributions are not consulted. | `localCommand` 50, `turnAdmission` 100 |
| `onTurnEnd` | Any terminal outcome a started turn can reach, plus a request refused before its turn started. | Discriminate `rejected` from `error`: the former has no started turn to finalize and no checkpoint to capture. Do not throw. It does not fire for an agent-emitted terminal action arriving with no active turn, because the reducer no-ops for those. | `checkpointAndChangeset`, `queueDrain`, `githubReferences`, `sessionTitle`, `markUnread` |
| `onDidApplyClientAction` | A client-dispatched action was applied to host state. | It never sees server-dispatched or rejected actions. Anything it sees definitely reduced. | `queueDrain` tracks queued senders; `sessionTitle` persists user title changes. |
| `onDidDispatchAction` | Any action was dispatched and its outcome is known, from any origin. | It also delivers **rejected** actions that never reduced — check `rejectionReason`. Implementing this and `onDidApplyClientAction` together sees every client action twice. | `sessionInputNeeded`, `persistedTurnUsage`, `sessionFlags` |
| `onOutgoingTurn` | Awaited after admission and provider lookup, before the turn is sent. | Rejected turns and `noAgent` failures never reach it. `IOutgoingTurn` carries the full `Message`; contributions can replace its text in order and add instructions, but cannot replace its already-committed attachments, model, agent, origin, or metadata. Prefer the message-text channel for context injection: changing instructions invalidates the provider prompt cache and increases user cost. Do not bypass the send path. | `markdownPlanRichLinks`, `artifactTools`, `chatSurface`, `sessionTitle`, `sideChat` |
| `onHydrateTurns` | A provider has returned the complete restored turn list for a chat. | It is not limited to default chats and must return a list for the next stage. Do not assume its input is pristine provider output because earlier contributions may have transformed it. | `turnDelegation`, `persistedTurnUsage`, `worktreeAnnouncement`, `sideChat` |
| `onHydrateChat` | A chat is being restored, eagerly, before it enters the session catalog. | It runs with no provider — it is a metadata-only read — and before the chat exists, so a chat memento taken here would outlive a failed registration. | `sessionTitle`, `chatDraft` |

The call sites are in `node/agentSideEffects.ts`, `node/agentHostTurnStarter.ts`,
and `node/agentService.ts`.

## Ordering is behavior

`order` is load-bearing. The dispatcher sorts lower values first; registration
order breaks ties only. Ordering is per hook, so the 100-series can be reused
for hydration independently of outgoing turns. See
`node/agentHostChatContributionsService.ts`.

Use explicit orders to preserve a required sequence:

- `LocalCommandContribution` is 50 and `TurnAdmissionContribution` is 100 on
  `onIncomingRequest`. That order is load-bearing: local commands were always
  intercepted before the read-only guard, so `/rename` still works in a
  read-only or archived chat.
- `CheckpointAndChangesetContribution` runs at 100 so it captures a checkpoint
  before later changeset-related work.
- `QueueDrainContribution` is 200 and `SessionInputNeededContribution` is 200.
- `GitHubReferencesContribution` and `ChatSurfaceContribution` are 300 where
  applicable.
- `SessionTitleContribution` is 400, `MarkUnreadContribution` and
  `SideChatContribution` are 500, `ChatDraftContribution` is 600, and
  `SessionFlagsContribution` is 700.

`markUnread` and `sideChat` both declare 500 and both implement `onTurnEnd`, so
their relative sequence rests on registration order. Give a new contribution a
distinct order rather than joining that tie.

A silent reordering regression already happened. The built-in-sequence
regression tests in `test/node/chatContributions.test.ts` protect the original
turn-end, outgoing-turn, and hydration sequences. Add or update those tests
when ordering changes intentionally.

## Depend on services, not a growing context

Never add callbacks or services to `IAgentHostChatContributionContext`. It is
only contribution identity plus centrally evicted mementos. Coordinate through
`@Injectable` services.

`IAgentHostChatContributionHost` is intentionally the narrow bridge to
`AgentSideEffects`: it has only `hostLaunchKind` and `sendTurnMessage`. It grew
to seven members before being cut back to two by promoting collaborators to
real services:

- `IAgentHostSessionTitleController`
- `IAgentHostProviderService`
- `IAgentHostTelemetryReporter`
- `IAgentHostTurnTracker`
- `IAgentHostToolCallTracker`
- `IAgentHostLocalCommands`

`IAgentHostWorktreeIsolation` is injectable too. "It isn't injectable" was a
wrong conclusion caused by service-registration order and later disproved.
Trace registration from `node/agentHostServices.ts` through
`node/agentHostBootstrap.ts` and `createAgentServiceComposition` in
`node/agentServiceComposition.ts`. Register a real service before the
instantiation path constructs contributions; do not smuggle it through the
context or host bridge.

Adding a service is not free: roughly six hand-built test `ServiceCollection`s
construct `AgentSideEffects` or call `registerBuiltInChatContributions`, and each
needs the new registration or fails with `UNKNOWN service <id>`. Two related
traps, both hit for real:

- Only wrap a test registration in `disposables.add(...)` when the class extends
  `Disposable`; wrapping a plain object throws `d.dispose is not a function` at
  teardown.
- If the collaborator is stateless, prefer a plain function taking
  `ServicesAccessor`, invoked through `IInstantiationService.invokeFunction`, and
  skip DI entirely. `node/agentHostTurnStarter.ts` is the reference: making it a
  service bought nothing and cost a registration in every graph.

## Mementos have a lifecycle

Create keys with `createChatMementoKey` or `createSessionMementoKey` in
`common/agentHostChatContributionsService.ts`. Contexts are contribution-scoped,
so identical debug names in two contributions do not collide.

- Chat mementos are evicted when their chat is disposed.
- Session mementos and all supplied chat mementos are evicted when their owning
  session is disposed.
- Extra key segments are part of the identity. Use them for bounded identities
  such as a queued message id.
- **Call `deleteMemento` when an extra-segment value is no longer needed.**
  Setting its observable to `undefined` leaves its map entry alive until chat
  or session disposal, so a long-lived chat otherwise accumulates one entry per
  segment value.
- `onHydrateChat` runs *before* its chat is registered, so a chat memento taken
  there would outlive a registration that then failed. No current contribution
  does this, but do not be the first without handling it.

`queueDrain/queueDrainContribution.ts` demonstrates the required delete on
queued-message removal and consumption. Central eviction lives in
`node/agentHostChatContributionsService.ts` and is called by
`node/agentService.ts`.

## Failure isolation, and the one exception

The dispatcher logs and isolates failures independently for every observer hook:

- A throwing `onTurnEnd`, `onDidApplyClientAction`, or `onDidDispatchAction`
  contribution does not stop later contributions.
- A failed `onOutgoingTurn` contribution adds no instructions and does not
  block the send or later contributions.
- A failed `onHydrateTurns` or `onHydrateChat` contribution deliberately passes
  the previous value to the next stage. Losing chat history, a title, or a draft
  is worse than losing one enrichment.

**`onIncomingRequest` inverts this and fails closed.** A contribution that
throws there *rejects* the request with `internalError` at stage `validation`.
That gate is the enforcement behind the UI hiding the composer, so failing open
would let a buggy or remote client run work in a session that may no longer have
its isolated worktree on disk. Losing one enrichment is survivable; letting a
request past a guard is not.

It is also **deliberately synchronous**, for the same reason: a gate has to
decide before the send path performs any await, so the state it reads cannot
change between the decision and its effect. Every admission check the host makes
today is already synchronous. An async version was tried first and broke three
`agentSideEffects` tests by deferring the read-only guard one microtask past the
assertions — which was the design saying the gate belongs before the first await.

Implement normal error handling where it improves the feature, but never
depend on a thrown error to control lifecycle flow. The exact dispatch behavior
is in `node/agentHostChatContributionsService.ts`.

## Tests and extraction proof

Add focused dispatcher tests in
`test/node/chatContributions.test.ts` for hook dispatch, ordering, memento
eviction, and failure isolation. The same file owns the built-in-sequence
regression tests.

When extracting existing behavior from `AgentSideEffects`, leave the existing
`test/node/agentSideEffects.test.ts` suite unchanged. Its passing behavior is
the proof that the extraction preserved semantics; test new dispatcher
mechanics separately rather than rewriting the old assertions to fit the new
structure.

One caveat that has bitten twice: some hand-built test graphs construct
`AgentSideEffects` **without** calling `registerBuiltInChatContributions`, so
they silently stop exercising behavior the moment it moves into a contribution.
When an extraction breaks such a suite, add the missing registration so the graph
mirrors production wiring — do not weaken the assertion. The failure means the
test was verifying an incomplete graph, not that the extraction was wrong.
