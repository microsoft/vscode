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
- exact leading static arguments for descriptors;
- eager startup resolution of registered service IDs;
- collection sealing after bootstrap registration;
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
	const foundation = createAgentServiceFoundation(options, services);
	const telemetry = await createAgentHostTelemetryService(foundation);
	services.set(ITelemetryService, telemetry);

	const coreIds = registerAgentHostCoreServices(services, foundation);
	const hostIds = registerAgentHostHostServices(services, foundation);
	const instantiationService = new InstantiationService(services, true);
	services.seal();
	resolveAll(instantiationService, [...coreIds, ...hostIds]);

	const composition = createAgentServiceComposition(instantiationService, foundation);
	const contributions = activateAgentHostContributions(instantiationService, composition);
	composition.setContributions(contributions);
	wireProductionWorktree(instantiationService, composition.agentService);

	return new AgentHostRuntime(foundation, instantiationService, composition, contributions);
}
```

Tests use the same synchronous foundation, core registrations, and composition,
but supply telemetry and typed overrides directly, skip production host
services, and preserve the historical no-worktree path.

## Where does a new object go?

| If the object... | Put it in | Construction |
|---|---|---|
| must exist before DI, performs bootstrap I/O, or needs entry-point inputs | `agentHostBootstrap.ts` foundation | concrete instance registered before sealing |
| is shared by production and AgentService tests | `registerAgentHostCoreServices` | local `SyncDescriptor`; tests must supply any required host-facing dependency override |
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
- `SyncDescriptor.staticArguments.length` must equal the first service
  dependency index exactly. `InstantiationService` otherwise pads or truncates
  arguments after only a `console.trace`.
- Do not use `supportsDelayedInstantiation`. In Node it schedules construction
  on a later macrotask, which makes startup failures and disposal timing
  nondeterministic. An eager descriptor is already lazy until first resolved.
- Production eagerly resolves every returned core and host service ID before
  composition. This intentionally preserves the pre-descriptor behavior, where
  bootstrap constructed every service eagerly, so this migration changes
  construction ownership without also introducing accidental laziness. Future
  lazy construction should be a separate, measured change with targeted tests.
- Never call `createInstance()` for a class registered as a descriptor.
- Migrate a service atomically: add its descriptor and remove its old
  imperative construction in the same commit.

## Sealing

The collection is sealed only after every concrete instance and descriptor,
including awaited telemetry, has been registered. After sealing:

- new service IDs are rejected;
- replacements are rejected;
- descriptor-to-instance replacement by `InstantiationService` is allowed.

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

## Test overrides

`createTestAgentService` builds the shared foundation and core graph with typed
overrides; defaults never overwrite an existing override. Its returned
`AgentService` disposes the whole test graph.

The compatibility graph intentionally defaults to:

- no worktree isolation, preserving the historical degraded path;
- `NullAgentEditAttributionService`, avoiding background git polling in
  unrelated fake-timer tests.
- the caller-supplied git service required by core git/changeset descriptors.

Production and targeted graph tests still resolve the real implementations.

## Known warts

### `AgentServiceCallbackAdapter`

**Why it exists:** callback-dependent services are constructed before
`AgentService`, while provider lookup, session restore, server-tool operations,
and changeset liveness are still owned by `AgentService`.

**Do not extend it by default:** a new callback usually means another
responsibility should move to a narrower owning service.

**Exit condition:** extract provider registry, session operations/restoration,
working-directory resolution, turn dispatch, and subscription liveness so
their consumers can inject those owners directly. Then delete the adapter and
its binder contract.

### `AgentService.setWorktreeIsolation`

**Why it exists:** worktree isolation is a production host descriptor, but
configuration, side effects, and customization enablement need its late
back-reference after composition. The compatibility test graph historically
runs without worktree isolation.

**Do not add sibling setters:** ordinary construction-order dependencies belong
in constructor injection.

**Exit condition:** introduce a correctly typed host-facing worktree contract
that can be injected without changing the default test graph, or relocate the
pending-worktree state so the back-reference disappears.

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

- `services.set(...)` after the collection is sealed.
- A parallel root graph that duplicates services owned by the primary runtime.
- Public service getters on `AgentService`.
- Adding another post-construction `setX(...)` to fix ordinary ordering.
- Global `registerSingleton` for node Agent Host services.
- Process behavior in service constructors when it belongs in activation.
- A second test-only list of production service registrations.
- Descriptor registration without an exact static-argument audit.

## Adding a service checklist

- [ ] Classify it as foundation, core descriptor, host descriptor, composition, contribution, or entry activation.
- [ ] Keep constructor service parameters trailing and static-argument arity exact.
- [ ] Register and eagerly resolve its service ID in the appropriate graph.
- [ ] If using a child graph, document its scope, parent, and disposal owner.
- [ ] Give it exactly one disposal owner.
- [ ] Add a typed test override only when default test behavior must differ.
- [ ] Update this file if the placement rules or exceptions change.
