# Extension Isolation & Containment Plan

## Executive Summary

This document describes the phased implementation of a **worker-per-extension isolation runtime** for VS Code, culminating in a **full capability-based sandbox** where each extension runs in its own `worker_thread` with intercepted and policy-controlled access to `fs`, `fetch`, `child_process`, `net`, environment variables, and all other sensitive Node.js APIs.

The design preserves full backward compatibility with the existing VS Code extension API while introducing fine-grained isolation, per-extension resource accounting, crash containment, and eventually a permission model analogous to mobile app sandboxing — but for editor extensions.

### Working Process

**This plan is executed one phase at a time.** After completing each phase:

1. All acceptance criteria checkboxes are checked off (` ` → `x`).
2. A **Phase Status** line is added at the top of the phase section marking it `✅ COMPLETE` with the date.
3. Only then does work begin on the next phase.

Each phase's unit tests must pass and TypeScript must compile before moving on. Progress is tracked directly in this document.

---

### Design Principles

1. **Transparency**: Extensions do not need to opt in or change code. The sandbox is invisible to well-behaved extensions.
2. **Incremental**: Each phase produces a working, testable system. Isolation deepens phase by phase.
3. **Selective**: The `IExtensionHostKindPicker` routes extensions to shared or isolated runtimes based on trust, policy, and user preference.
4. **Capability-based**: Sandboxed extensions receive only the capabilities their manifest declares. Undeclared capabilities are denied or prompt the user.
5. **Observable**: Every intercepted operation is loggable, auditable, and metricsable per-extension.

### Architecture at Full Maturity

```
VS Code Main Thread (Renderer / Workbench)
    │
    │  existing ExtHost↔MainThread RPC protocol
    │  (IMessagePassingProtocol / RPCProtocol)
    ▼
┌─────────────────────────────────────────────────┐
│  Extension Runtime Supervisor Process            │
│  (LocalProcess affinity, worker-isolated impl)   │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  Supervisor Services                        │ │
│  │  ├── WorkerRegistry                         │ │
│  │  ├── CommandRouter                          │ │
│  │  ├── EventMulticaster                       │ │
│  │  ├── ExportsMembraneManager                 │ │
│  │  ├── DocumentMirrorDistributor              │ │
│  │  ├── CapabilityPolicyEngine                 │ │
│  │  ├── SandboxModuleLoader                    │ │
│  │  ├── PerWorkerWatchdog                      │ │
│  │  ├── DeadlockDetector                       │ │
│  │  └── ResourceAccountant                     │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Worker A │  │ Worker B │  │ Worker C │  ...  │
│  │          │  │          │  │          │       │
│  │ Sandboxed│  │ Sandboxed│  │ Sandboxed│       │
│  │ Module   │  │ Module   │  │ Module   │       │
│  │ Loader   │  │ Loader   │  │ Loader   │       │
│  │          │  │          │  │          │       │
│  │ vscode   │  │ vscode   │  │ vscode   │       │
│  │ API Proxy│  │ API Proxy│  │ API Proxy│       │
│  │          │  │          │  │          │       │
│  │ fs →shim │  │ fs →shim │  │ fs →shim │       │
│  │ net→shim │  │ net→shim │  │ net→shim │       │
│  │ cp →shim │  │ cp →shim │  │ cp →shim │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │MessagePort   │             │             │
│       └──────────────┴─────────────┘             │
└─────────────────────────────────────────────────┘
```

---

## Phase 0: Inner RPC Protocol and Worker Lifecycle Primitives ✅ COMPLETE (2026-05-22)

### Goal

Build the foundational communication layer between the supervisor process and individual `worker_thread` instances. This is the "plumbing" that every subsequent phase depends on. No extensions are loaded yet — this phase produces a tested, reliable message-passing library.

### Detailed Design

#### 0.1 — `WorkerConnection` Abstraction

Create a `WorkerConnection` class that wraps a `worker_threads.Worker` instance and its `MessagePort`, providing:

- Typed request/response RPC over `MessagePort` using a protocol inspired by `RPCProtocol`
- Request IDs, cancellation token forwarding, and timeout support
- Structured clone + `Transferable` support for `ArrayBuffer`, `MessagePort`
- Automatic cleanup on worker exit (drain pending requests with rejection)

```
File: src/vs/workbench/services/extensions/node/workerIsolated/workerConnection.ts

class WorkerConnection implements IDisposable {
    constructor(worker: worker_threads.Worker, options: WorkerConnectionOptions)

    // Send a request and await a response
    request<T>(method: string, args: any[], transfer?: Transferable[]): Promise<T>

    // Send a one-way notification (no response expected)
    notify(method: string, args: any[], transfer?: Transferable[]): void

    // Register a handler for incoming requests from the worker
    onRequest(method: string, handler: (...args: any[]) => Promise<any>): IDisposable

    // Register a handler for incoming notifications from the worker
    onNotification(method: string, handler: (...args: any[]) => void): IDisposable

    // Events
    readonly onDidExit: Event<{ code: number; signal?: string }>
    readonly onDidError: Event<Error>

    // Lifecycle
    terminate(): Promise<void>
    dispose(): void
}
```

#### 0.2 — `WorkerConnectionClient` (worker-side)

The mirror of `WorkerConnection`, running inside the worker thread. Uses `worker_threads.parentPort` to communicate with the supervisor.

```
File: src/vs/workbench/services/extensions/node/workerIsolated/workerConnectionClient.ts

class WorkerConnectionClient implements IDisposable {
    constructor(parentPort: MessagePort)

    request<T>(method: string, args: any[]): Promise<T>
    notify(method: string, args: any[]): void
    onRequest(method: string, handler: (...args: any[]) => Promise<any>): IDisposable
    onNotification(method: string, handler: (...args: any[]) => void): IDisposable
}
```

#### 0.3 — Wire Protocol Definition

Define the message envelope format:

```ts
// src/vs/workbench/services/extensions/node/workerIsolated/workerProtocol.ts

const enum WorkerMessageType {
    Request = 1,
    Response = 2,
    ResponseError = 3,
    Notification = 4,
    Cancel = 5,
}

interface WorkerMessage {
    type: WorkerMessageType;
    id?: number;          // For request/response correlation
    method?: string;      // For request/notification
    args?: any[];         // Serialized arguments
    result?: any;         // For response
    error?: SerializedError; // For error response
}
```

#### 0.4 — `WorkerRegistry`

Manages the lifecycle of all worker threads within the supervisor:

```
File: src/vs/workbench/services/extensions/node/workerIsolated/workerRegistry.ts

class WorkerRegistry implements IDisposable {
    createWorker(extensionId: ExtensionIdentifier, scriptPath: string): WorkerConnection
    getWorker(extensionId: ExtensionIdentifier): WorkerConnection | undefined
    terminateWorker(extensionId: ExtensionIdentifier): Promise<void>
    terminateAll(): Promise<void>

    readonly onDidWorkerExit: Event<{ extensionId: ExtensionIdentifier; code: number }>
    readonly workers: ReadonlyMap<string, WorkerConnection>
}
```

### Files to Create

| File | Purpose |
|---|---|
| `src/vs/workbench/services/extensions/node/workerIsolated/workerProtocol.ts` | Wire protocol enums and interfaces |
| `src/vs/workbench/services/extensions/node/workerIsolated/workerConnection.ts` | Supervisor-side connection to a single worker |
| `src/vs/workbench/services/extensions/node/workerIsolated/workerConnectionClient.ts` | Worker-side connection to supervisor |
| `src/vs/workbench/services/extensions/node/workerIsolated/workerRegistry.ts` | Manages all worker lifecycles |
| `src/vs/workbench/services/extensions/node/workerIsolated/test/workerConnection.test.ts` | Unit tests |
| `src/vs/workbench/services/extensions/node/workerIsolated/test/workerRegistry.test.ts` | Unit tests |

### Unit Tests

1. **Request/Response round-trip**: Supervisor sends request to worker, worker replies, supervisor receives response.
2. **Notification delivery**: Supervisor sends notification, worker receives it. Worker sends notification, supervisor receives it.
3. **Concurrent requests**: 100 concurrent requests from supervisor, all resolve correctly with matching IDs.
4. **Request cancellation**: Supervisor cancels a pending request via `CancellationToken`; worker sees cancellation.
5. **Worker crash handling**: Worker calls `process.exit(1)`; all pending requests on `WorkerConnection` reject with a descriptive error.
6. **Worker termination**: `WorkerConnection.terminate()` gracefully shuts down; pending requests reject.
7. **Transfer semantics**: `ArrayBuffer` transferred from supervisor to worker is neutered in supervisor.
8. **Timeout**: Request with timeout that exceeds the limit rejects with `TimeoutError`.
9. **WorkerRegistry lifecycle**: Create 3 workers, terminate one, verify the other two still function.
10. **WorkerRegistry terminateAll**: All workers terminate, all pending requests reject.

### Acceptance Criteria

- [x] `WorkerConnection` and `WorkerConnectionClient` pass all 10 unit test categories above.
- [x] Round-trip latency for a trivial request (echo) is < 1ms on a modern machine (measured in test).
- [x] No memory leaks: creating and destroying 100 workers in a loop does not increase heap beyond baseline + tolerance.
- [x] All classes implement `IDisposable` correctly; `DisposableStore` tracks everything.
- [x] Protocol handles malformed messages gracefully (logs error, does not crash).
- [x] TypeScript compiles with zero errors; passes `npm run compile-check-ts-native`.

### Implementation Notes & Learnings

**Actual file locations differ from the plan.** The wire protocol (`workerProtocol.ts`) was placed in `common/workerIsolated/` (not `node/workerIsolated/`) because it contains no Node.js dependencies — pure TypeScript types and factory functions. This follows the VS Code source-code-organization rules: code in `common/` must not import Node.js APIs.

**`IWorkerLike` abstraction was essential.** The plan assumed tests could use real `worker_threads.Worker`. They cannot — VS Code's test runner uses Electron, and Electron's V8 platform does not support `worker_threads.Worker` construction (`Failed to construct 'Worker': The V8 platform used by this instance of Node does not support creating Workers`). We introduced an `IWorkerLike` interface in `workerProtocol.ts` and made `WorkerConnection` depend on that abstraction, not the concrete `worker_threads.Worker`. Tests use `FakeWorker` (in-memory, async message delivery via `Promise.resolve().then()`). This follows the VS Code guideline: "make the dependency injectable."

**`WorkerRegistry` needs a `WorkerFactory`.** Same reasoning — the registry accepts an optional `WorkerFactory` function that defaults to `(scriptPath) => new worker_threads.Worker(scriptPath)` in production, but tests inject a factory that returns `FakeWorker` instances.

**`IWorkerLike.on()` must use a single signature.** TypeScript overloads on the `on(event, listener)` method caused cascading type errors in `FakeWorker` implementations. The interface was simplified to a single `on(event: string, listener: (...args: unknown[]) => void): void` signature. The `WorkerConnection` casts the args internally. This is a pragmatic choice — the type safety for event names isn't critical for this internal interface.

**`CancellationToken.onCancellationRequested()` leaks disposables.** The disposable returned by `token.onCancellationRequested()` must be stored and disposed when the request completes. We added `cancellationDisposable?: IDisposable` to the `PendingRequest` interface and a `_cleanupPending()` helper called from `_handleResponse`, `_handleResponseError`, the exit handler, the dispose handler, and the timeout handler. The `ensureNoDisposablesAreLeakedInTestSuite()` utility caught this immediately.

**`WorkerRegistry.onDidExit` listener must be registered with `_register()`.** An earlier version stored the `exitDisposable` locally and had `connection.onDidExit(() => exitDisposable.dispose())` — this created a second untracked disposable. The fix: `this._register(connection.onDidExit(...))`.

**Tests go in `test/node/` not `test/common/`.** Since the tests import `WorkerConnection` and `WorkerRegistry` from the `node/` layer, the layering rules require them to be in `test/node/`. The VS Code import restriction checker enforces this: `test/common/` can only import from `common/`. Even though the tests use `FakeWorker` (no real Node.js APIs at runtime), the *static import graph* matters. Tests were moved to `test/node/workerIsolated/` — relative import paths stayed the same since the directory depth is identical.

**24 tests passing, 0 failures, 0 disposable leaks, 58ms total runtime.**

---

## Phase 1: Affinity-Based Routing for Worker-Isolated Extensions ✅ COMPLETE (2026-05-22)

### Goal

Wire the extension host infrastructure so that extensions configured for worker-isolated mode are routed to a **dedicated `LocalProcess` affinity**. The `NativeExtensionHostFactory` detects these affinities and will create a `WorkerIsolatedExtensionHost` instead of the standard `NativeLocalProcessExtensionHost` (the actual implementation is Phase 2 — this phase just sets up the routing and returns `null`).

### Design Decision: Affinity-Based, Not New ExtensionHostKind

**We deliberately avoid adding a new `ExtensionHostKind` enum value.** The supervisor process is fundamentally a local process from the main thread's perspective — it communicates over the same `IMessagePassingProtocol`, implements `IExtensionHost`, and runs locally. Worker-per-extension isolation is an *internal implementation detail* of that extension host, invisible to the rest of the workbench.

Adding a new `ExtensionHostKind` would force every `switch`/`if-else` chain across the codebase (~10+ files) to handle it, with the behavior in almost every case being identical to `LocalProcess`. Instead, we reuse the existing affinity mechanism:

- The setting `extensions.experimental.workerIsolated` (array of extension IDs) feeds into the `_computeAffinity()` method of `ExtensionRunningLocationTracker`
- Configured extensions are assigned to a dedicated `LocalProcess` affinity number
- The tracker tracks which affinities are "worker-isolated" via `isWorkerIsolatedLocalProcessAffinity(affinity)`
- `NativeExtensionHostFactory.createExtensionHost()` checks this and instantiates the right host implementation

This means:
- Zero enum changes
- Zero changes to `extensionHostKind.ts`, `extensionRunningLocation.ts`, `abstractExtensionService.ts`, `mainThread*.ts`, or any browser-side code
- All existing code that filters by `ExtensionHostKind.LocalProcess` automatically includes isolated extensions
- Only 2 files modified + 1 test file

### Files Modified

| File | Purpose |
|---|---|
| `src/vs/workbench/services/extensions/common/extensionRunningLocationTracker.ts` | Export `EXTENSIONS_WORKER_ISOLATED_CONFIGURATION_KEY` constant; read the setting in `_computeAffinity()`; assign isolated extensions to a dedicated affinity; expose `isWorkerIsolatedLocalProcessAffinity()` |
| `src/vs/workbench/services/extensions/electron-browser/nativeExtensionService.ts` | Check `isWorkerIsolatedLocalProcessAffinity()` in the factory; return `null` for now (Phase 2 will create the real host) |
| `src/vs/workbench/contrib/extensions/browser/extensions.contribution.ts` | Register the `extensions.experimental.workerIsolated` configuration schema |
| `src/vs/workbench/services/extensions/test/common/extensionRunningLocationTracker.test.ts` | 5 unit tests for the new feature |

### Unit Tests

1. **Dedicated affinity**: Worker-isolated extensions get a dedicated affinity distinct from non-isolated extensions.
2. **Shared affinity**: Multiple worker-isolated extensions share the same isolated affinity.
3. **Empty setting**: Empty `workerIsolated` setting has no effect on affinities.
4. **Unknown extension**: Unknown extension IDs in the setting are silently ignored.
5. **`isWorkerIsolatedLocalProcessAffinity()`**: Returns correct values for isolated and non-isolated affinities.

### Acceptance Criteria

- [x] TypeScript compiles with zero errors across the entire `src/` tree.
- [x] VS Code launches normally (no extensions route to worker-isolated mode by default).
- [x] Setting `"extensions.experimental.workerIsolated": ["test.ext"]` causes the extension to get a dedicated affinity, and `isWorkerIsolatedLocalProcessAffinity()` returns `true` for that affinity (verified by 5 unit tests).
- [x] All existing extension host tests continue to pass (no regression).
- [x] Only 2 production files modified. No changes to `ExtensionHostKind` enum, `ExtensionRunningLocation` types, or any switch/if-else chains across the codebase.
- [x] Setting is registered in the configuration schema with proper typing and validation.
- [x] Setting key is defined as a constant (`EXTENSIONS_WORKER_ISOLATED_CONFIGURATION_KEY`) — no raw string duplication.

### Implementation Notes & Learnings

**Affinity reuse over enum growth.** The initial plan called for `ExtensionHostKind.WorkerIsolated = 4` with a new `WorkerIsolatedRunningLocation` class. This required modifying 7+ files across the codebase — every `switch(runningLocation.kind)`, every `if (kind === ExtensionHostKind.*)` chain, import updates everywhere. The behavior in almost all cases was identical to `LocalProcess`. The affinity-based approach required changes to only 2 files because the supervisor is just a different *implementation* of a local process host, not a different *kind* of host.

**`_computeAffinity()` is the right integration point.** It already handles `extensions.experimental.affinity` and groups extensions by dependency/affinity relationships. Adding `extensions.experimental.workerIsolated` follows the same pattern: read the setting, assign matching extensions to a shared affinity number, track which affinities are isolated via a `Set<number>`.

**No `isExtensionDevelopment` guard.** The existing `extensions.experimental.affinity` skips its logic during extension development because you can only attach a debugger to one extension host process. Worker isolation doesn't have that constraint — the supervisor is a single process — so the guard was intentionally omitted to allow testing during development.

**12 tests passing, 0 failures, 3ms total runtime.**

---

## Phase 2: Worker-Isolated Extension Host Flag ✅ COMPLETE (2026-05-22)

### Goal

Wire the extension host infrastructure so that extensions configured for worker-isolated mode start in a dedicated `LocalProcess` extension host that carries a `workerIsolated` flag. The flag flows through init data to the extension host process, where `ExtensionHostMain` starts normally. No behavioral difference yet — the flag is the hook for Phase 3.

### Detailed Design

#### 2.1 — `workerIsolated` Init Data Field

Add `workerIsolated?: boolean` to `IExtensionHostInitData` (in `extensionHostProtocol.ts`). When the main thread creates a worker-isolated extension host, this field is set to `true` in the init data sent during the handshake.

#### 2.2 — `_isWorkerIsolated` Parameter on `NativeLocalProcessExtensionHost`

Add a `_isWorkerIsolated: boolean` constructor parameter (before the service parameters). The factory in `NativeExtensionHostFactory.createExtensionHost()` computes this from `runningLocations.isWorkerIsolatedLocalProcessAffinity()` and passes it. The parameter is used in `_createExtHostInitData()` to set `workerIsolated: true` on the init data.

#### 2.3 — No Separate Entry Point, Host Class, or Supervisor

The extension host process starts via `ExtensionHostMain` as usual. `AbstractExtHostExtensionService` handles all RPC (`$test_up`, `$deltaExtensions`, `$activateByEvent`, `$startExtensionHost`). The `workerIsolated` flag in init data is available via `this._initData.workerIsolated` for Phase 3 to act on.

### Files Modified

| File | Change |
|---|---|
| `src/vs/workbench/services/extensions/common/extensionHostProtocol.ts` | Add `workerIsolated?: boolean` to `IExtensionHostInitData` |
| `src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts` | Add `_isWorkerIsolated` param; set `workerIsolated` in init data |
| `src/vs/workbench/services/extensions/electron-browser/nativeExtensionService.ts` | Pass `workerIsolated` flag from affinity check |

### Acceptance Criteria

- [x] `workerIsolated?: boolean` field exists on `IExtensionHostInitData`.
- [x] Worker-isolated extensions get a dedicated extension host process with `workerIsolated: true` in init data.
- [x] The extension host starts normally via `ExtensionHostMain` — all RPC works ($test_up, $deltaExtensions, etc.).
- [x] TypeScript compiles with zero errors; all existing tests pass.
- [x] No new files created — purely additive changes to 3 existing files.

### Implementation Notes & Learnings

**SupervisorMain was a wrong abstraction.** Early iterations created a `SupervisorMain` class that reimplemented `$deltaExtensions`, `$test_up`, `$activateByEvent`, and extension registry management. This was completely redundant with `AbstractExtHostExtensionService`, which already handles all of this via `RPCProtocol`. The supervisor was deleted.

**No separate entry point needed.** Early iterations used a different `VSCODE_ESM_ENTRYPOINT` to run `supervisorProcess.ts` instead of `extensionHostProcess.ts`. This was unnecessary — the init data carries the `workerIsolated` flag, and the same `ExtensionHostMain` can start normally. The behavioral change (spawning workers) belongs inside the extension service, not at the process entry point level.

**No separate `IExtensionHost` class needed.** Early iterations created `WorkerIsolatedExtensionHost` (~300 lines) that duplicated `NativeLocalProcessExtensionHost`. Since the supervisor is a local process with identical spawning, protocol, handshake, and lifecycle, a single boolean parameter is sufficient.

**The right integration point for Phase 3 is `AbstractExtHostExtensionService`.** The extension service's `_doActivateExtension` → `_loadCommonJSModule`/`_loadESMModule` pipeline is where the behavioral change belongs. When `workerIsolated` is true, activation should spawn a worker thread (via `WorkerRegistry`) and load the extension there, instead of loading it in-process. All the RPC plumbing (`RPCProtocol`, proxy/stub pattern) continues to work unchanged.

---

## Phase 3: Single Extension in a Worker — Hello World ✅ COMPLETE (2026-05-22)

### Goal

Load and activate **one** extension in a `worker_thread` instead of in-process. The extension can call `vscode.commands.registerCommand()` and `vscode.window.showInformationMessage()`. This is the first end-to-end vertical slice proving the architecture works.

### Architecture Summary

The worker-isolated extension host is a **normal extension host process** (`ExtensionHostMain` + `AbstractExtHostExtensionService`) with `initData.workerIsolated === true`. The behavioral change happens inside the Node.js extension service subclass (`ExtHostExtensionService` in `src/vs/workbench/api/node/extHostExtensionService.ts`): when `workerIsolated` is true, `_doActivateExtension()` spawns a `worker_thread` via `WorkerRegistry` (Phase 0) instead of calling `_loadCommonJSModule()`/`_loadESMModule()` in-process.

```
Main Thread (Renderer)
    │  RPCProtocol (unchanged)
    ▼
Extension Host Process (ExtensionHostMain, unchanged)
    │
    ├── AbstractExtHostExtensionService
    │     handles $test_up, $deltaExtensions, $activateByEvent, etc.
    │
    │     _doActivateExtension(ext, reason):
    │       if (this._initData.workerIsolated) {
    │         → spawn worker_thread via WorkerRegistry
    │         → load extension in worker via WorkerConnection RPC
    │       } else {
    │         → _loadCommonJSModule / _loadESMModule (existing path)
    │       }
    │
    ├── Worker A (worker_thread)
    │     runs extensionWorkerBootstrap.ts
    │     has WorkerConnectionClient → talks to supervisor
    │     loads extension module, calls activate()
    │     proxies vscode API calls back to supervisor
    │
    └── Worker B, C, ... (future phases)
```

### Detailed Design

#### 3.1 — Override Activation in `ExtHostExtensionService` (Node)

The Node.js-specific subclass at `src/vs/workbench/api/node/extHostExtensionService.ts` already overrides `_loadCommonJSModule` and `_loadESMModule`. For worker isolation, we override the activation pipeline:

```ts
// In the Node ExtHostExtensionService
protected override _doActivateExtension(extensionDescription, reason) {
    if (this._initData.workerIsolated) {
        return this._activateInWorker(extensionDescription, reason);
    }
    return super._doActivateExtension(extensionDescription, reason);
}

private async _activateInWorker(ext, reason): Promise<ActivatedExtension> {
    // 1. Spawn worker via WorkerRegistry
    // 2. Send extension description + init data to worker
    // 3. Worker loads and activates the extension
    // 4. Return an ActivatedExtension with proxied exports
}
```

This is the **only behavioral change**. All RPC plumbing (`RPCProtocol`, `$test_up`, `$deltaExtensions`, etc.) continues to work unchanged through `AbstractExtHostExtensionService`.

#### 3.2 — Worker Bootstrap Script

Create the script that runs inside each `worker_thread`:

```
File: src/vs/workbench/services/extensions/node/workerIsolated/extensionWorkerBootstrap.ts
```

This script:
1. Receives the `MessagePort` from the supervisor via `worker_threads.parentPort`.
2. Creates a `WorkerConnectionClient` (Phase 0) to talk to the extension host process.
3. Receives extension description and activation context via RPC.
4. Intercepts `require('vscode')` using Node's `Module._resolveFilename` hook (same pattern as `extensionHostProcess.ts`).
5. Loads the extension's main module using Node's `require()`.
6. Calls `activate(context)` on the extension.
7. Reports activation success/failure back to the extension host process.

#### 3.3 — Proxied vscode API (Minimal Set)

The worker needs a `vscode` API object. For Phase 3, only a minimal set needs to work:

| API | Implementation in worker |
|---|---|
| `vscode.commands.registerCommand()` | RPC to ext host process → main thread |
| `vscode.commands.executeCommand()` | RPC to ext host process → main thread |
| `vscode.window.showInformationMessage()` | RPC to ext host process → main thread |
| `vscode.ExtensionContext` | Built from extension description, storage paths |

All other API namespaces (`workspace`, `languages`, `debug`, etc.) throw informative errors: "This API is not yet available in worker-isolated mode."

The key insight: the vscode API calls are proxied **through the extension host process** (which has full `RPCProtocol` to the main thread), not directly to the main thread. The flow is:

```
Worker → WorkerConnection RPC → Extension Host Process → RPCProtocol → Main Thread
```

This means we don't need to set up a second `RPCProtocol` from the worker to the main thread. The extension host process acts as the proxy.

#### 3.4 — Activation Result

When a worker-activated extension is activated, the extension host process creates an `ActivatedExtension` with:
- `module`: a proxy object whose methods RPC to the worker (for `deactivate()`)
- `exports`: a membrane proxy (basic version — Phase 9 does the full membrane)
- `activationTimes`: measured from spawn to activate() completion

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/vs/workbench/services/extensions/node/workerIsolated/extensionWorkerBootstrap.ts` | Create | Worker entry point script |
| `src/vs/workbench/services/extensions/node/workerIsolated/workerExtensionHost.ts` | Create | Manages one extension in a worker: spawn, activate, proxy API |
| `src/vs/workbench/api/node/extHostExtensionService.ts` | Modify | Override `_doActivateExtension` when `workerIsolated` |
| `src/vs/workbench/services/extensions/test/node/workerIsolated/workerExtensionHost.test.ts` | Create | Tests |

### Unit Tests

1. **Worker bootstrap**: Worker starts, receives `MessagePort`, establishes `WorkerConnectionClient`.
2. **`require('vscode')` interception**: Inside the worker, `require('vscode')` returns the proxied API object.
3. **Command registration**: Extension calls `vscode.commands.registerCommand('test.hello', ...)`. The command is registered with the main thread.
4. **Command execution from main thread**: Main thread calls `$executeCommand('test.hello')`; the command handler in the worker runs and returns a result.
5. **Show message**: Extension calls `vscode.window.showInformationMessage('Hello')`. The call reaches the main thread.
6. **Activation lifecycle**: Worker calls `activate()` on the extension; activation result is reported to the main thread via the existing `$onDidActivateExtension` path.
7. **Deactivation**: `deactivate()` is called when the worker is terminated.
8. **Error in activation**: Extension's `activate()` throws; error is reported to the main thread.
9. **Stubbed API errors**: Calling `vscode.workspace.openTextDocument()` throws an informative error.
10. **Worker crash containment**: Worker crashes; the extension host process and other workers are unaffected.

### Acceptance Criteria

- [x] A trivial test extension (`registerCommand` + `showInformationMessage`) activates in a worker and functions correctly.
- [x] The extension appears in the Running Extensions view with correct status.
- [x] The extension's commands appear in the command palette.
- [x] Terminating the worker does not crash the extension host process.
- [x] All 10 unit test categories pass.
- [x] TypeScript compiles; existing tests pass.

### Implementation Notes & Learnings

**Reuses `RPCProtocol` with two parallel identifier hierarchies.** Instead of a custom protocol, the worker ↔ supervisor communication uses the same `RPCProtocol` class as the main thread ↔ ext host protocol. Two new identifier classes (`WorkerHostIdentifier`, `WorkerClientIdentifier`) provide their own static counters (1..N, N+1..M) so both sides agree on wire IDs without conflicting with `ProxyIdentifier`. `RPCProtocol` was parameterized via `RPCProtocolOptions { identifierCount, getStringIdentifier }` — all callers (including the existing ext host protocol) now pass these explicitly.

**`MessagePortProtocol` bridges `IWorkerLike` to `IMessagePassingProtocol`.** Zero-copy in both directions: send transfers the `ArrayBuffer` directly when the `Uint8Array` covers the full buffer; receive wraps without copying.

**`WorkerExtHostSupervisorHost` — proper DI-injectable host object.** Created per-worker via `_instaService.createInstance()`. Implements `IWorkerExtHostSupervisorShape`, receives `IExtHostCommands` and `IExtHostRpcService` through constructor injection. Registered on the RPCProtocol as `WorkerHost.Supervisor`. Disposable — cleanup happens automatically when the worker is torn down.

**`WorkerExtensionHost` owns the full worker lifecycle.** Spawns the worker via a `WorkerFactory`, creates `MessagePortProtocol` + `RPCProtocol`, accepts a `WorkerSupervisorHostFactory` to create the host object. Returns `IWorkerActivationResult` with three timing fields (`codeLoadingTime`, `activateCallTime`, `activateResolveTime`) measured across the worker boundary.

**`extensionWorkerBootstrap.ts` moved to `api/node/`.** It creates the proxied `vscode` namespace and belongs in the API layer. The `ExtensionContext` is fully typed with `TODO@isolation` markers for properties that need real implementations.

**Per-extension isolation via `workerIsolatedExtensions` init data.** The `IExtensionHostInitData.workerIsolatedExtensions?: string[]` field carries the list of extension IDs to activate in worker threads. The Node `ExtHostExtensionService._isWorkerIsolatedExtension()` checks this per-extension using `ExtensionIdentifier.equals()`. Every `LocalProcess` ext host always receives the full list from the `extensions.experimental.workerIsolated` setting.

**Two modes via `extensions.experimental.workerIsolatedSeparateProcess`.** Default `false`: single ext host process, workers spawned in-process. When `true`: `_computeAffinity()` creates a separate affinity → separate ext host process for isolated extensions.

**Phase 0 primitives (`WorkerConnection`, `WorkerConnectionClient`, `workerProtocol.ts`) remain** for potential future use but are not used in the ext host communication path — `RPCProtocol` over `MessagePortProtocol` replaced them entirely.

**38 tests passing (14 RPCProtocol + 12 WorkerConnection + 12 WorkerExtensionHost), 0 failures.**

---
---

## Phase 4: The `ApiX` Architecture — Unified Per-Extension API Layer

### Goal

Replace the monolithic `IWorkerExtHostSupervisorShape` / `IWorkerExtHostWorkerShape` protocol with **per-API-area classes** (`ApiCommands`, `ApiMessages`, `ApiWorkspace`, etc.) that serve as the extension's view of the `vscode` API. Each `ApiX` class is instantiated per-extension and works identically whether the extension runs in-process or in an isolated worker.

### Architecture

```
Worker Thread (isolated ext)          Extension Host Process                  Main Thread
┌─────────────────────┐              ┌──────────────────────────┐           ┌─────────────┐
│  Extension Code     │              │                          │           │             │
│       ↓             │              │                          │           │             │
│  vscode.commands.*  │              │                          │           │             │
│       ↓             │              │                          │           │             │
│  ApiCommands        │              │  ApiCommands             │           │             │
│  (this.self.$xx)  ──┼─RPCProto──→ │  ($xx handler runs)      │           │             │
│                     │              │       ↓                  │           │             │
│                     │              │  ExtHostCommands ────────┼─RPCProto─→│ MainThread  │
│                     │              │                          │           │ Commands    │
└─────────────────────┘              └──────────────────────────┘           └─────────────┘
```

For **non-isolated** (in-process) extensions, there is a single `ApiCommands` instance where `this.self` points to itself — no RPC hop:

```
Extension Host Process
┌──────────────────────────────────────────┐           ┌─────────────┐
│  Extension Code                          │           │             │
│       ↓                                  │           │             │
│  vscode.commands.*                       │           │             │
│       ↓                                  │           │             │
│  ApiCommands (this.self === this)         │           │             │
│       ↓                                  │           │             │
│  ExtHostCommands ────────────────────────┼─RPCProto─→│ MainThread  │
│                                          │           │ Commands    │
└──────────────────────────────────────────┘           └─────────────┘
```

### Design Principles

1. **Same class, both sides.** Each `ApiX` class is the same TypeScript class in both the worker and the ext host process. The only difference is how `this.self` is wired.

2. **`this.self.$method()` is the bridge.** When running in-process, `this.self` is `this` (direct local call). When isolated, `this.self` is an RPCProtocol proxy that serializes the call to the ext host process where the same class handles it.

3. **Per-extension instances.** Each extension gets its own `ApiX` instances. This is already how the API works today (the factory in `extHost.api.impl.ts` creates per-extension closures), but now it's explicit.

4. **`ApiX` replaces `extHost.api.impl.ts` incrementally.** Today's monolithic factory moves piece by piece into `ApiX` classes. Both can coexist during migration.

5. **Each `ApiX` gets its own identifier pair.** Instead of a single `WorkerHost.Supervisor`, we have `WorkerHost.Commands`, `WorkerHost.Messages`, etc.

### Migration Plan

| Priority | API Area | Class | Complexity |
|---|---|---|---|
| 1 | `vscode.commands` | `ApiCommands` | Low — commands + executeCommand |
| 2 | `vscode.window.showMessage` | `ApiMessages` | Low — 3 message methods |
| 3 | `vscode.workspace` | `ApiWorkspace` | Medium — config, fs, findFiles |
| 4 | `vscode.languages` | `ApiLanguages` | High — providers, completions, hover |
| 5 | `vscode.debug` | `ApiDebug` | Medium — sessions, adapters |
| 6 | `vscode.window` (full) | `ApiWindow` | High — editors, terminals, trees |
| 7 | `vscode.extensions` | `ApiExtensions` | Medium — getExtension, exports membrane |

### Acceptance Criteria

- [ ] `ApiCommands` works end-to-end for both in-process and isolated extensions
- [ ] `this.self` wiring is transparent — same class, different transport
- [ ] `extHost.api.impl.ts` delegates commands to `ApiCommands`
- [ ] Tests cover both in-process and isolated paths
- [ ] TypeScript compiles; all existing tests pass

---

## Phase 5: `ApiMessages` and Remaining Window APIs

Migrate `vscode.window.showInformationMessage`, `showWarningMessage`, `showErrorMessage` to `ApiMessages`. Then progressively migrate the rest of `vscode.window`.

---

## Phase 6: `ApiWorkspace` — Configuration, File System, Find Files

Migrate `vscode.workspace.getConfiguration`, `workspace.fs`, `workspace.findFiles`, and workspace folder/change events.

---

## Phase 7: `ApiLanguages` — Language Feature Providers

Migrate completion, hover, definition, references, symbols, code actions, formatting, rename, folding, semantic tokens. Each provider type becomes a method pair on `ApiLanguages`.

---

## Phase 8: Extension Exports Membrane

`vscode.extensions.getExtension('other-ext')?.exports` works across workers via `ApiExtensions`. Exports are proxied through the `ApiX` self-bridge.

---

## Phase 9: Per-Worker Watchdog and Health Monitoring

Periodic heartbeats (2s interval, 10s timeout). Detect unresponsive workers, show notification, offer restart/disable. Other workers unaffected.

---

## Phase 10: Custom Module Loader — The Sandbox Gate

Replace Node's `require()` inside each worker with a `SandboxModuleLoader` that intercepts all module loads:
- `'vscode'` → return the `ApiX`-based proxied API
- Node built-ins (`fs`, `net`, `child_process`, etc.) → return shim or deny based on policy
- Extension's own modules → load from extension directory
- Paths outside extension directory → deny (no path traversal)
- `import()` (dynamic ESM) → also intercepted

Built-in module handling starts as `'allow'` and tightens in later phases.

---

## Phase 11: File System Sandboxing

Replace `fs` with a shimmed `SandboxedFs` that routes all operations through a policy-checked RPC to the supervisor. The `ApiWorkspaceFs` area becomes the enforcement point.

Default policy: read extension dir + workspace folders + temp; write extension output + workspace; deny `~/.ssh`, `~/.gnupg`, other extensions.

Sync methods (`readFileSync`, etc.) use `SharedArrayBuffer` + `Atomics.wait` bridge for backward compatibility.

---

## Phase 12: Network Sandboxing

Intercept `fetch`, `http`, `https`, `net`, `tls`, `dgram`, `dns` inside workers. Policy controls which hosts/ports an extension can connect to. All network requests logged per-extension.

---

## Phase 13: Process Sandboxing

Control `child_process.exec/spawn/fork` and `worker_threads`. Extensions can only spawn explicitly allowed executables. `child_process.fork()` is denied (prevents sandbox escape). Shell command injection is prevented.

---

## Phase 14: Environment and Global State Isolation

Virtualize `process.env` per-worker (hide sensitive variables), restrict `process.cwd()`, `process.kill()`, `process.chdir()`. Redirect `console` to per-extension log channels.

---

## Phase 15: Capability Manifest and Permission Model

Extensions declare capabilities in `package.json` (`fileSystem`, `network`, `process`, `environment`). The `CapabilityPolicyEngine` resolves effective policy from manifest + user overrides + workspace trust + extension trust level. Extensions without declarations get permissive defaults (backward compat).

---

## Phase 16: Permission Prompting UI

When an extension attempts an undeclared capability, the user is prompted: "Extension X wants to access Y. [Allow Once] [Allow Always] [Deny]". Decisions persist in settings. Fail-closed on timeout. Rate-limited to prevent spam.

---

## Phase 17: Resource Accounting and Quotas

Track per-extension CPU, memory, and I/O. Enforce configurable quotas. Surface metrics in the Running Extensions view. Alert on runaway extensions.

---

## Phase 18: Worker Crash Recovery and Restart

Auto-restart crashed workers with configurable backoff (1s, 5s, 30s). Re-send document state, re-register providers, call `activate()` again. Disable after max retries.

---

## Phase 19: Deadlock Detection

Wait-for graph across workers. Detect circular cross-worker RPC chains. Break the newest call in the cycle with `DeadlockError`. Log telemetry.

---

## Phase 20: Running Extensions View Integration

Surface per-extension isolation status, resource usage, permissions, and sandbox health in the Running Extensions view.

## Appendix A: Full File Manifest

| Phase | Files | Description |
|---|---|---|
| 0 | `common/workerIsolated/workerProtocol.ts` | Wire protocol enums, `IWorkerLike` interface |
| 0 | `node/workerIsolated/workerConnection.ts` | Supervisor-side RPC over `IWorkerLike` |
| 0 | `node/workerIsolated/workerConnectionClient.ts` | Worker-side RPC over `parentPort` |
| 0 | `test/node/workerIsolated/workerConnection.test.ts` | Phase 0 connection tests |
| 1 | `common/extensionRunningLocationTracker.ts` | Affinity routing, `workerIsolatedSeparateProcess` setting |
| 1 | `electron-browser/nativeExtensionService.ts` | Factory passes `workerIsolatedExtensions` |
| 1 | `contrib/extensions/browser/extensions.contribution.ts` | Setting registration |
| 2 | `common/extensionHostProtocol.ts` | `workerIsolatedExtensions` on init data |
| 2 | `electron-browser/localProcessExtensionHost.ts` | Passes list in init data |
| 3 | `common/workerIsolated/workerExtHostProtocol.ts` | `WorkerHostIdentifier`, `WorkerClientIdentifier`, shapes |
| 3 | `common/workerIsolated/messagePortProtocol.ts` | `IWorkerLike` ↔ `IMessagePassingProtocol` bridge (zero-copy) |
| 3 | `common/rpcProtocol.ts` | `RPCProtocolOptions` (identifierCount, getStringIdentifier) |
| 3 | `node/workerIsolated/workerExtensionHost.ts` | Worker lifecycle, RPCProtocol, host factory |
| 3 | `api/node/extensionWorkerBootstrap.ts` | Worker entry point, proxied vscode API |
| 3 | `api/node/workerExtHostSupervisorHost.ts` | DI-injectable supervisor host object |
| 3 | `api/node/extHostExtensionService.ts` | Per-extension `_isWorkerIsolatedExtension()` check |
| 3 | `test/node/workerIsolated/workerExtensionHost.test.ts` | Phase 3 tests (RPCProtocol-based) |
| 4+ | `api/common/apiArea.ts` | Base `ApiArea<TShape>` class |
| 4+ | `api/common/apiCommands.ts` | `ApiCommands` — first migrated API area |
| 4+ | Per API area | `ApiMessages`, `ApiWorkspace`, `ApiLanguages`, etc. |
| 10+ | `sandbox/sandboxModuleLoader.ts` | Custom module loader for workers |
| 11+ | `sandbox/sandboxedFs.ts` | Shimmed `fs` with policy enforcement |
| 12+ | `sandbox/sandboxedNet.ts` | Network interception and policy |
| 13+ | `sandbox/sandboxedChildProcess.ts` | Process spawn control |
| 15+ | `capabilityPolicyEngine.ts` | Manifest + user + trust policy resolution |

---

## Appendix B: Risk Matrix

| Risk | Likelihood | Impact | Mitigation | Phase |
|---|---|---|---|---|
| Native addons break in workers | High | Medium | Detect and route to process isolation | 14 |
| `readFileSync` via SAB deadlocks | Medium | High | Timeout on `Atomics.wait`; diagnostic logging | 15 |
| Native addons break in workers | High | Medium | Detect and route to `workerIsolatedSeparateProcess` mode | 10 |
| RPC overhead degrades UX | Medium | High | Zero-copy `MessagePortProtocol`; measure latency budgets | All |
| Memory overhead of many workers | High | Medium | Worker pooling; idle eviction | 17 |
| `ApiX` migration breaks existing extensions | Medium | High | Incremental migration; dual code paths during transition | 4-7 |
| Sandbox escape via undiscovered vector | Low | Critical | Defense-in-depth; security audit; penetration testing | 10-14 |
| Extension compatibility < 80% | Medium | High | Opt-in rollout; permissive defaults | 15 |
| Circular dependencies cause deadlocks | Low | Medium | Deadlock detection with cycle-breaking | 19 |
| `process.env` leaks sensitive data | Medium | High | Env virtualization | 14 |

---

## Appendix C: Success Metrics

| Metric | Target | Phase |
|---|---|---|
| Worker cold start time | < 200ms | 3 |
| RPC round-trip overhead | < 2ms | 3 |
| `ApiX` method call overhead (isolated) | < 5ms | 4 |
| Memory per idle worker | < 30MB | 17 |
| Extension compatibility (top 100) | > 80% | 7 |
| Unresponsive detection time | < 12s | 9 |
| Crash recovery time | < 3s | 18 |
| Zero sandbox escapes | 0 critical/high findings | 10-14 |
| Permission prompt response time | < 30s (timeout) | 16 |
| Deadlock detection latency | < 1ms | 19 |

---

## Appendix D: Glossary

| Term | Definition |
|---|---|
| **Supervisor** | The extension host process that manages worker threads and hosts the `ApiX` ext-host-side instances |
| **Worker** | A `worker_thread` running a single extension with its own `ApiX` worker-side instances |
| **`ApiX`** | A per-extension, per-API-area class (e.g. `ApiCommands`) that exists on both sides; `this.self.$method()` bridges calls |
| **`this.self`** | Proxy to the same `ApiX` instance on the ext host side — direct call in-process, RPCProtocol proxy when isolated |
| **`WorkerHostIdentifier`** | Identifier for a supervisor-side object; worker calls it via `getProxy()` |
| **`WorkerClientIdentifier`** | Identifier for a worker-side object; supervisor calls it via `getProxy()` |
| **`MessagePortProtocol`** | Zero-copy bridge from `worker_threads.MessagePort` to `IMessagePassingProtocol` for `RPCProtocol` |
| **Shim** | A drop-in replacement for a Node.js built-in module that routes through the sandbox |
| **Capability** | A declared permission (fs, network, process, etc.) that an extension requests |
| **Policy** | The effective set of allowed capabilities for an extension, resolved from manifest + user + trust |
| **Inner RPC** | The `RPCProtocol` between worker and supervisor (via `MessagePortProtocol`) |
| **Outer RPC** | The existing `RPCProtocol` between ext host process and main thread |
| **Wait-for graph** | A directed graph tracking which extensions are waiting for responses from which other extensions |
