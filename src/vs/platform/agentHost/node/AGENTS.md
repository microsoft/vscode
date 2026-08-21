<!--
  Agent Host node-runtime service construction.
  Living spec — keep in sync with agentHostBootstrap.ts, agentHostServices.ts,
  agentServiceComposition.ts, and agentHostContributions.ts.
-->

# Agent Host service construction

> **Status: IN PROGRESS** (2026-08-21)
>
> The runtime is migrating from imperative service registration to the model
> described here. Until this status is `CURRENT`, follow the target rules for
> new code and preserve each intermediate commit's working construction path.

## One graph

Each Agent Host process has one process-local `ServiceCollection` and one strict
`InstantiationService`, owned by `AgentHostRuntime`. The closest VS Code
analogy is the shared process bootstrap in
`src/vs/code/electron-utility/sharedProcess/sharedProcessMain.ts`: concrete
pre-DI foundations, local `SyncDescriptor` registrations, strict DI, root
composition, then activation.

The Agent Host does not use the global `registerSingleton` registry because
tests and runtime-selected implementations need independent process-local
graphs.

## Construction phases

```ts
async function createAgentHostRuntime(options) {
	const services = new AgentHostServiceCollection();
	const foundation = createPreTelemetryFoundation(options, services);
	const telemetry = await createTelemetry(foundation);
	completeFoundation(foundation, telemetry, services);

	const coreIds = registerAgentHostCoreServices(services, foundation);
	const hostIds = registerAgentHostHostServices(services, foundation);
	const instantiationService = new InstantiationService(services, true);
	services.seal();
	resolveAll(instantiationService, [...coreIds, ...hostIds]);

	const composition = createAgentServiceComposition(instantiationService, foundation);
	const contributions = activateAgentHostContributions(instantiationService, composition);
	wireProductionWorktree(instantiationService, composition);

	return new AgentHostRuntime(foundation, instantiationService, composition, contributions);
}
```

Tests use the same synchronous foundation, core registrations, and composition,
but supply telemetry and typed overrides directly, skip production host
services, and opt into worktree wiring explicitly.

## Where does a new object go?

| If the object... | Put it in | Construction |
|---|---|---|
| must exist before DI, performs bootstrap I/O, or needs entry-point inputs | `agentHostBootstrap.ts` foundation | concrete instance registered before sealing |
| is shared by production and AgentService tests and depends only on shared services | `registerAgentHostCoreServices` | local `SyncDescriptor` |
| needs production environment, sandbox, SDK, plugin, or provider-host inputs | `registerAgentHostHostServices` | local descriptor or selected concrete null implementation |
| needs a back-reference to `AgentService` | `agentServiceComposition.ts` | explicit callback seam |
| registers providers, handlers, listeners, or other disposable behavior after construction | `agentHostContributions.ts` | create and immediately register in its returned store |
| starts transports, providers, recurring schedulers, or process listeners | entry point | activation after runtime creation |

Place an object based on construction requirements and lifetime, not on which
existing file first needs it.

## Descriptor rules

- All non-service parameters must precede the first decorated service parameter.
- `SyncDescriptor.staticArguments.length` must equal the first service
  dependency index exactly. `InstantiationService` otherwise pads or truncates
  arguments after only a `console.trace`.
- Do not use `supportsDelayedInstantiation`. In Node it schedules construction
  on a later macrotask, which makes startup failures and disposal timing
  nondeterministic. An eager descriptor is already lazy until first resolved.
- Production eagerly resolves every returned core and host service ID before
  composition so missing dependencies still fail during startup.
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

Tests pass typed overrides into `createTestAgentHostGraph`; defaults never
overwrite an existing override. `createTestAgentService` remains a compatibility
wrapper whose returned `AgentService` disposes the whole test graph.

The compatibility graph intentionally defaults to:

- no worktree isolation, preserving the historical degraded path;
- `NullAgentEditAttributionService`, avoiding background git polling in
  unrelated fake-timer tests.

Production and targeted graph tests still resolve the real implementations.

## Known exceptions

- `AgentServiceCallbackAdapter` is the explicit late-binding seam for
  responsibilities still owned by `AgentService`.
- `AgentService.setWorktreeIsolation` is the sole post-composition
  back-reference bridge. Production wires it after composition; tests only when
  given a concrete `WorktreeIsolation`.
- State manager, configuration, authentication, and GitHub endpoint remain
  concrete foundations because their constructor shapes or pre-telemetry
  ordering are not descriptor-safe.
- The `stateManager` getter on `AgentService` remains a test seam.

## Anti-patterns

- `services.set(...)` after the collection is sealed.
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
- [ ] Give it exactly one disposal owner.
- [ ] Add a typed test override only when default test behavior must differ.
- [ ] Update this file if the placement rules or exceptions change.
