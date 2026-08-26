# Agent Host service construction

> **Status: CURRENT** (2026-08-24)

## Maintaining this document

This is a decision guide for Agent Host service bootstrapping, not a running
implementation diary.

- Update it when a placement rule, construction phase, ownership contract,
  accepted wart, or extension checklist changes.
- Prefer rules, small representative examples, and explicit exit conditions.
- Do not append incident history, temporary symbol lists, exhaustive service
  inventories, review chronology, or details already obvious from the code.
- Keep stable contracts separate from accepted debt.
- Remove obsolete guidance in the same change that makes it obsolete.
- Keep this file focused on `agentHostBootstrap.ts`, `agentHostServices.ts`,
  `agentServiceFoundation.ts`, `agentServiceComposition.ts`,
  `agentHostContributions.ts`, and their test graph.

## Primary graph

Each Agent Host process has one primary process-local `ServiceCollection` and
strict `InstantiationService`, owned by `AgentHostRuntime`. The closest VS Code
analogy is the shared process bootstrap in
`src/vs/code/electron-utility/sharedProcess/sharedProcessMain.ts`: concrete
pre-DI foundations, local `SyncDescriptor` registrations, strict DI, root
composition, then activation.

Scoped child instantiation services or service collections are allowed when an
isolated lifetime or override scope genuinely needs them. They should inherit
from the primary graph where possible, have an explicit owner, and must not
create competing instances of primary runtime services.

The primary Agent Host graph does not use the global `registerSingleton`
registry because tests and runtime-selected implementations need independent
process-local roots. This does not prohibit using a child graph for a scoped
subsystem.

## Stability

### Stable contracts

These are the intended extension points for new work:

- one primary runtime graph, with explicitly scoped child graphs allowed;
- foundation, core-service, host-service, composition, contribution, and
  entry-activation placement categories;
- lazy descriptor construction on first resolution;
- ordered chat contributions for cross-cutting turn, action, hydration, and
  outgoing-message behavior;
- named resolution sites for descriptors whose constructors register behavior
  required independently of their direct consumers;
- one disposal owner per object and phase-ordered runtime teardown;
- typed test overrides that reuse the production core registration list.

New services should follow these contracts. Do not add another exception merely
because an existing exception looks convenient.

### Accepted debt

The items in [Known warts](#known-warts) are not target patterns. They remain
because removing them requires a separate ownership or API refactoring. Each
wart has an explicit exit condition; update this document when one is removed.

## Construction phases

Bootstrap creates the pre-DI foundation, awaits telemetry, registers lazy
descriptors, creates the strict instantiation service, composes `AgentService`,
and finally activates contributions.

Tests use the same synchronous foundation, core registrations, and composition,
but supply telemetry and typed overrides directly, skip production host
services, and pre-register a mutable worktree seam whose default delegate is
`NullAgentHostWorktreeIsolation`.

## Where does a new object go?

| If the object... | Put it in | Construction |
|---|---|---|
| must exist before DI, performs bootstrap I/O, or needs entry-point inputs | `agentHostBootstrap.ts` foundation | concrete instance registered during bootstrap |
| is shared by production and AgentService tests | `registerAgentHostCoreServices` | local `SyncDescriptor`; tests must supply any required host-facing dependency override |
| needs production environment, sandbox, SDK, plugin, or provider-host inputs | `registerAgentHostHostServices` | local descriptor or selected concrete null implementation |
| needs a back-reference to `AgentService` | `agentServiceComposition.ts` | explicit callback seam |
| observes or enriches chat turns, actions, hydration, or outgoing messages | `chatContributions/` | implement `IAgentHostChatContribution` and register it in `registerBuiltInChatContributions` |
| registers non-chat providers, handlers, listeners, or other disposable behavior after construction | `agentHostContributions.ts` | create and immediately register in its returned store |
| starts transports, providers, recurring schedulers, or process listeners | entry point | activation after runtime creation |

Place an object based on construction requirements and lifetime, not on which
existing file first needs it.

## Descriptor rules

- All non-service parameters that bootstrap must supply must precede the first
  decorated service parameter. A trailing non-service parameter is valid only
  when it has an optional/default value and the descriptor intentionally accepts
  that value; DI cannot supply a trailing static argument.
- Follow the standard `SyncDescriptor` convention: static arguments precede
  decorated service dependencies.
- Do not use `supportsDelayedInstantiation`. In Node it schedules construction
  on a later macrotask, which makes startup failures and disposal timing
  nondeterministic. An eager descriptor is already lazy until first resolved.
- Descriptors resolve lazily through normal DI demand. If a constructor
  registers behavior required independently of direct calls, resolve it at a
  named composition or activation site, explain why, and test the behavior.
- Descriptor constructors must not read `AgentServiceCallbackAdapter.value`;
  lazy resolution order is not fixed relative to adapter binding.
- Never call `createInstance()` for a class registered as a descriptor.
- Migrate a service atomically: add its descriptor and remove its old
  imperative construction in the same commit.

## Registration window

The collection is created, populated, and dropped inside
`createAgentHostRuntime` or `createTestAgentService`. It is never returned or
handed to another component; `InstantiationService` keeps its reference private.
That ownership boundary, rather than a runtime seal, makes post-bootstrap
registration unavailable.

Dynamic feature registration belongs in a service-owned registry or the
contribution phase, not in the service collection.

## Ownership and disposal

| Owner | Objects |
|---|---|
| foundation | concrete instances it constructs |
| `InstantiationService` | descriptor-created services |
| AgentService composition | callback-bound objects and `AgentService` |
| contribution store | activation objects and registration disposables |
| `IAgentHostChatContributions` | registered chat contribution instances and their scoped mementos |
| entry point | transports, process listeners, providers, schedulers |

Never add a descriptor-created service to another `DisposableStore`.
`AgentHostRuntime` tears phases down explicitly: contributions, composition,
instantiation service, then foundation. Entry-point resources and logging are
disposed outside the runtime.

A descriptor that is never resolved is never constructed and therefore never
disposed. `InstantiationService` disposes only instances it creates.

## Test overrides

`createTestAgentService` builds the shared foundation and core graph with typed
overrides; defaults never overwrite an existing override. Its returned
`AgentService` disposes the whole test graph.

The test graph does not force construction of unused descriptors. Whole-graph
dependency completeness and cycle freedom are checked statically in
`agentHostServices.test.ts`.

The compatibility graph intentionally defaults to:

- a mutable worktree seam whose default delegate is the folder-preserving null
  implementation;
- `NullAgentEditAttributionService`, keeping telemetry attribution out of the
  default test graph;
- the caller-supplied git service required by core git/changeset descriptors.

Production and targeted graph tests still resolve the real implementations.

## Known warts

### `AgentServiceCallbackAdapter`

**Why it exists:** callback-dependent services are constructed before
`AgentService`, while provider lookup, session restore, server-tool operations,
and changeset liveness are still owned by `AgentService`.

Cross-cutting turn behavior now belongs in `IAgentHostChatContributions`; do not
add callbacks for behavior expressible through its lifecycle hooks.

**Do not extend it by default:** a new callback usually means another
responsibility should move to a narrower owning service.

**Exit condition:** extract provider registry, session operations/restoration,
server-tool ownership, turn dispatch, and subscription liveness so consumers
inject those owners directly. Contributions reduce the cross-cutting behavior
that those services must own, but the remaining callback queries and commands
need service owners rather than contribution hooks. Then delete the adapter and
binder contract.

### Post-DI service registrations

`IAgentHostProviderLocator`, `IAgentHostSessionTitleController`,
`IAgentHostLocalCommands`, and `IAgentService` are currently registered after
the primary `InstantiationService` is created because they depend on
composition-owned callbacks or objects.

**Do not add another post-DI registration.** Ordinary services belong in the
descriptor lists or the pre-DI foundation.

**Exit condition:** the provider, server-tool, session, and turn-dispatch
extractions remove the callback cycles. Register the remaining services before
constructing `InstantiationService`, with `IAgentService` as a descriptor.

### Chat contribution host bridge

`AgentSideEffects` registers its narrow `sendTurnMessage`/launch-kind host bridge
after the chat contribution service is constructed.

**Do not broaden this bridge for behavior that fits a contribution hook.**

**Exit condition:** once turn admission and dispatch have injectable owners,
inject those services into contributions directly and remove
`registerHost`/`getHost`.

### Concrete foundation services

State manager, configuration, authentication, GitHub endpoint, proxy, and
request services are concrete foundations.

**Why they exist:** some must precede telemetry; others have constructor shapes
that are not descriptor-safe because non-service arguments follow decorated
service arguments.

**Exit condition:** a service may move to `agentHostServices.ts` when its
constructor has leading static arguments only and no pre-telemetry ordering
requirement. Moving one is optional cleanup, not a prerequisite for adding
unrelated services.

## Anti-patterns

- Handing the service collection to anything outside bootstrap.
- A parallel root graph that duplicates services owned by the primary runtime.
- Public service getters on `AgentService`.
- Adding a post-construction `setX(...)` to fix ordinary ordering.
- Adding cross-cutting chat behavior directly to `AgentService` or
  `AgentSideEffects` when an existing contribution hook fits.
- Global `registerSingleton` for node Agent Host services.
- Process behavior in service constructors when it belongs in activation.
- A second test-only list of production service registrations.

## Adding a service checklist

- [ ] Classify it as foundation, core descriptor, host descriptor, composition, contribution, or entry activation.
- [ ] Keep constructor service parameters trailing and follow standard
  `SyncDescriptor` static-argument conventions.
- [ ] Register its service ID in the appropriate graph.
- [ ] If its constructor registers required behavior, add a documented
  resolution site and a behavior test.
- [ ] Put cross-cutting chat behavior in an ordered contribution and use scoped
  mementos for per-chat or per-session state.
- [ ] If using a child graph, document its scope, parent, and disposal owner.
- [ ] Give it exactly one disposal owner.
- [ ] Add a typed test override only when default test behavior must differ.
- [ ] Update this file if the placement rules or exceptions change.
