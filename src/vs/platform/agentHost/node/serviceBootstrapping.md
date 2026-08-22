# Agent Host service construction

> **Status: CURRENT** (2026-08-21)

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
- registration-time static-argument validation for descriptors;
- lazy descriptor construction on first resolution;
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

```ts
async function createAgentHostRuntime(options) {
	const services = new AgentHostServiceCollection();
	const infrastructure = new DisposableStore();
	const foundation = createAgentServiceFoundation({ ...options, services, owned: infrastructure });
	const telemetry = await createAgentHostTelemetryService(foundation);
	services.set(ITelemetryService, telemetry);

	registerAgentHostCoreServices(services, coreInputs);
	registerAgentHostHostServices(services, hostInputs);
	const instantiationService = new InstantiationService(services, true);

	const composition = createAgentServiceComposition(instantiationService, foundation);
	const contributions = activateAgentHostContributions(instantiationService, composition);
	composition.setContributions(contributions);

	return new AgentHostRuntime({
		instantiationService,
		agentService: composition.agentService,
		agents: composition.agents,
		onDidStartTurn: composition.onDidStartTurn,
		sdkDownloadProgress,
	}, infrastructure);
}
```

Tests use the same synchronous foundation, core registrations, and composition,
but supply telemetry and typed overrides directly and skip production host
services. The test graph pre-registers a mutable worktree seam whose default
delegate is `NullAgentHostWorktreeIsolation`; core defaults never overwrite a
pre-registered typed override.

## Where does a new object go?

| If the object... | Put it in | Construction |
|---|---|---|
| must exist before DI, performs bootstrap I/O, or needs entry-point inputs | `agentHostBootstrap.ts` foundation | concrete instance registered during bootstrap |
| is shared by production and AgentService tests | `registerAgentHostCoreServices` | local `SyncDescriptor`; tests may pre-register a typed override |
| needs production environment, sandbox, SDK, plugin, or provider-host inputs | `registerAgentHostHostServices` | local descriptor or selected concrete null implementation |
| needs a back-reference to `AgentService` | `agentServiceComposition.ts` | explicit callback seam |
| registers providers, handlers, listeners, or other disposable behavior after construction | `agentHostContributions.ts` | create and immediately register in its returned store |
| starts transports, providers, recurring schedulers, or process listeners | entry point | activation after runtime creation |

Place an object based on construction requirements and lifetime, not on which
existing file first needs it.

## Descriptor rules

- All non-service parameters that bootstrap must supply must precede the first
  decorated service parameter. A trailing non-service parameter is valid only
  when it has an optional/default value and the descriptor intentionally accepts
  that value; DI cannot supply a trailing static argument.
- Descriptors with service dependencies must pass exactly as many leading static
  arguments as the first service dependency index. Registration rejects a
  mismatch before bootstrap. For constructors without service dependencies,
  registration also requires every non-defaulted parameter reported by
  `Function.length`; this is a conservative heuristic because DI does not inspect
  those arguments.
- This arity validation covers descriptors only. Classes created directly with
  `createInstance()` remain the caller's responsibility.
- Do not use `supportsDelayedInstantiation`. In Node it schedules construction
  on a later macrotask, which makes startup failures and disposal timing
  nondeterministic. An eager descriptor is already lazy until first resolved.
- Descriptors are lazy and resolve through normal DI demand. If a constructor
  registers a listener or callback whose behavior is required independently of
  direct service calls, resolve it at a named composition or activation site,
  explain why there, and cover the behavior with a test. Prefer designs that arm
  behavior on first use.
- Descriptor constructors must not read `AgentServiceCallbackAdapter.value`.
  Lazy resolution order is not fixed, so doing so would fail nondeterministically
  depending on whether `AgentService` has bound the adapter.
- Never call `createInstance()` for a class registered as a descriptor.
- Migrate a service atomically: add its descriptor and remove its old
  imperative construction in the same commit.

## Registration window

The service collection is created, populated, and dropped inside
`createAgentHostRuntime` or `createTestAgentService`. It is never returned,
stored, or handed to another component; `InstantiationService` keeps its
reference private. This ownership boundary, rather than a runtime seal, makes
post-bootstrap registration unavailable.

A weaker seal that rejects new IDs while allowing descriptor-to-instance
write-back is technically possible. It is intentionally omitted because the
collection never escapes bootstrap, leaving little value in another lifecycle
state machine.

Dynamic feature registration belongs in a service-owned registry or the
contribution phase, not in the service collection.

## Ownership and disposal

| Owner | Objects |
|---|---|
| foundation | concrete instances it constructs |
| `InstantiationService` | descriptor-created services |
| AgentService composition | callback-bound objects and `AgentService` |
| contribution store | activation objects and registration disposables |
| entry point | transports, process listeners, providers, schedulers |

Never add a descriptor-created service to another `DisposableStore`.
`AgentHostRuntime` tears phases down explicitly: contributions, composition,
instantiation service, then foundation. Entry-point resources and logging are
disposed outside the runtime.

A descriptor that is never resolved is never constructed and therefore never
disposed. `InstantiationService` disposes only the instances it creates.

## Test overrides

`createTestAgentService` builds the shared foundation and core graph with typed
overrides; defaults never overwrite an existing override. Its returned
`AgentService` disposes the whole test graph.

The test graph does not force construction of otherwise unused descriptors.
Whole-graph dependency completeness and cycle freedom are checked statically in
`agentHostServices.test.ts`; descriptor enumeration belongs in that test, not
in a production collection accessor.

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

**Do not extend it by default:** a new callback usually means another
responsibility should move to a narrower owning service.

Worktree lifecycle ownership now uses ordinary DI. The remaining callbacks cover
provider registry, session operations/restoration, turn and attachment
orchestration, and subscription liveness.

**Exit condition:** extract those remaining responsibilities so their consumers
can inject the owners directly. Then delete the adapter and its binder contract.

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

- Handing the service collection to anything outside the bootstrap function.
- A descriptor whose constructor registers required behavior without a named,
  documented resolution site.
- A parallel root graph that duplicates services owned by the primary runtime.
- Public service getters on `AgentService`.
- Adding a post-construction `setX(...)` to fix ordinary ordering.
- Global `registerSingleton` for node Agent Host services.
- Process behavior in service constructors when it belongs in activation.
- A second test-only list of production service registrations.
- Descriptor registration without an exact static-argument audit.

## Adding a service checklist

- [ ] Classify it as foundation, core descriptor, host descriptor, composition, contribution, or entry activation.
- [ ] Keep constructor service parameters trailing and static-argument arity exact.
- [ ] Register its service ID in the appropriate graph.
- [ ] If its constructor registers required behavior, add a documented
  resolution site and a test proving that behavior is armed after runtime
  creation.
- [ ] If using a child graph, document its scope, parent, and disposal owner.
- [ ] Give it exactly one disposal owner.
- [ ] Add a typed test override only when default test behavior must differ.
- [ ] Update this file if the placement rules or exceptions change.
