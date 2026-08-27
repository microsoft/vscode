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

`AgentSideEffects` shed roughly 500 lines by extracting ten behaviors. Do not
put another lifecycle side effect, outgoing-prompt addition, restored-turn
enrichment, or client-action observer back into either large orchestration
class. `AgentSideEffects` dispatches the lifecycle and retains routing and send
mechanics; `AgentService` owns session lifecycle and invokes hydration and
memento eviction. See `agentSideEffects.ts` and `agentService.ts`.

This is also a review rule: code added to either file needs a specific reason
that it is routing, a correctness invariant, provider-shaped behavior, or a
dispatcher call site. "It was convenient to add here" is not a reason.

## Decide before you code

Write a contribution when the behavior answers yes to this test:

1. Does it react to a completed turn, a reduced client action, a turn about to
   be sent, or a complete restored turn list?
2. Can an explicitly registered, dependency-injected unit own it without
   changing protocol routing or provider mapping?
3. Does it compose with other behavior in a defined order?

Examples are checkpoint and changeset work, queue draining, GitHub-reference
attachment, title handling, persisted usage, worktree announcements, unread
state, rich-link guidance, artifact-tool guidance, and chat-surface guidance.
Their directories under `node/chatContributions/` are the reference
implementations.

Do **not** use a contribution for the following:

- Subagent signal routing and buffering in
  `node/agentSideEffects.ts` are routing fabric and correctness invariants.
- Turn-id remapping in `node/agentSideEffects.ts` is also routing fabric.
- The three SDK event mappers and three attachment serializers are
  provider-shaped.

If the answer is "this must route every signal correctly before state changes"
or "this differs by SDK," it is not a contribution. The explicit non-goals and
future boundaries are in `node/chatContributions/TODO.md`.

## Keep the hook surface small

`IAgentHostChatContribution` intentionally has four hooks in
`common/agentHostChatContributionsService.ts`. Only add another method when no
existing payload can express the behavior.

The set was reduced from six to four:

- `onTurnConsumable` became `onTurnEnd` with
  `TurnEndReason.kind === 'localCommand'`.
- `onUserMessage` became `onOutgoingTurn`.

Prefer adding a discriminant or payload to an existing type, such as a new
`TurnEndReason` variant, over adding a hook. A proposed single-purpose hook
with one caller and one implementer is the smell that produced both removals.
Do not create an abstraction merely to move one direct call.

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

## The four hooks

| Hook | Fires when | Must not assume | Existing example |
|---|---|---|---|
| `onTurnEnd` | An agent-signal terminal path ends, or a host-handled local command completes. | It does not see every terminal outcome. It does not fire for client-dispatched cancellation, missing provider, read-only or archived chat, or a send that throws. Discriminate `success`, `cancelled`, `error`, and `localCommand`; do not throw. | `checkpointAndChangeset`, `queueDrain`, `githubReferences`, `sessionTitle`, `markUnread` |
| `onAction` | A client action has been reduced into host state. | It is not an envelope observer and does not see pending-message server envelopes. Filter the action type and read post-reduction state. | `queueDrain` tracks queued senders; `sessionTitle` persists user title changes. |
| `onOutgoingTurn` | Awaited after the read-only or archived guard and provider lookup, before the turn is sent. | Rejected messages and `noAgent` failures never reach it. `IOutgoingTurn` carries the full `Message`; contributions can replace its text in order and add instructions, but cannot replace its already-committed attachments, model, agent, origin, or metadata. Prefer the message-text channel for context injection: changing instructions invalidates the provider prompt cache and increases user cost. Do not bypass the send path. | `markdownPlanRichLinks`, `artifactTools`, `chatSurface`, `githubReferences`, `sessionTitle` |
| `onHydrateTurns` | A provider has returned the complete restored turn list for a chat. | It is not limited to default chats and must return a list for the next stage. Do not assume its input is pristine provider output because earlier contributions may have transformed it. | `persistedTurnUsage`, `worktreeAnnouncement` |

The call sites are in `node/agentSideEffects.ts` and `node/agentService.ts`.
The coverage caveat for `onTurnEnd` is deliberate and documented in
`node/chatContributions/TODO.md`; do not claim it is a universal finally hook.

## Ordering is behavior

`order` is load-bearing. The dispatcher sorts lower values first; registration
order breaks ties only. Ordering is per hook, so the 100-series can be reused
for hydration independently of outgoing turns. See
`node/agentHostChatContributionsService.ts`.

Use explicit orders to preserve a required sequence:

- `CheckpointAndChangesetContribution` runs at 100 so it captures a checkpoint
  before later changeset-related work.
- `QueueDrainContribution` is 200.
- `GitHubReferencesContribution` and `ChatSurfaceContribution` are 300 where
  applicable.
- `SessionTitleContribution` is 400 and `MarkUnreadContribution` is 500.

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
- `IAgentHostProviderLocator`
- `IAgentHostTelemetryReporter`
- `IAgentHostTurnTracker`
- `IAgentHostLocalCommands`

`IAgentHostWorktreeIsolation` is injectable too. "It isn't injectable" was a
wrong conclusion caused by service-registration order and later disproved.
Trace registration from `node/agentHostServices.ts` through
`node/agentHostBootstrap.ts` and `createAgentServiceComposition` in
`node/agentServiceComposition.ts`. Register a real service before the
instantiation path constructs contributions; do not smuggle it through the
context or host bridge.

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

`queueDrain/queueDrainContribution.ts` demonstrates the required delete on
queued-message removal and consumption. Central eviction lives in
`node/agentHostChatContributionsService.ts` and is called by
`node/agentService.ts`.

## Failure isolation

The dispatcher logs and isolates failures independently for every hook:

- A throwing `onTurnEnd` or `onAction` contribution does not stop later
  contributions.
- A failed `onOutgoingTurn` contribution adds no instructions and does not
  block the send or later contributions.
- A failed `onHydrateTurns` contribution deliberately passes the previous
  turns to the next stage. Losing chat history is worse than losing one
  enrichment.

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
