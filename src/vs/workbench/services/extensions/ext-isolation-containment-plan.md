# Extension Isolation & Containment Plan

## Executive Summary

This document describes the phased implementation of a **worker-per-extension isolation runtime** for VS Code, culminating in a **full capability-based sandbox** where each extension runs in its own `worker_thread` with intercepted and policy-controlled access to `fs`, `fetch`, `child_process`, `net`, environment variables, and all other sensitive Node.js APIs.

The design preserves full backward compatibility with the existing VS Code extension API while introducing fine-grained isolation, per-extension resource accounting, crash containment, and eventually a permission model analogous to mobile app sandboxing — but for editor extensions.

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
│  (new ExtensionHostKind.WorkerIsolated)          │
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

## Phase 0: Inner RPC Protocol and Worker Lifecycle Primitives

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

- [ ] `WorkerConnection` and `WorkerConnectionClient` pass all 10 unit test categories above.
- [ ] Round-trip latency for a trivial request (echo) is < 1ms on a modern machine (measured in test).
- [ ] No memory leaks: creating and destroying 100 workers in a loop does not increase heap beyond baseline + tolerance.
- [ ] All classes implement `IDisposable` correctly; `DisposableStore` tracks everything.
- [ ] Protocol handles malformed messages gracefully (logs error, does not crash).
- [ ] TypeScript compiles with zero errors; passes `npm run compile-check-ts-native`.

---

## Phase 1: Extension Host Kind Registration

### Goal

Register `ExtensionHostKind.WorkerIsolated` in the VS Code extension host infrastructure so the system recognizes the new kind, even though nothing runs on it yet. This is pure wiring — no supervisor process, no workers.

### Detailed Design

#### 1.1 — Add the Enum Value

```ts
// src/vs/workbench/services/extensions/common/extensionHostKind.ts
export const enum ExtensionHostKind {
    LocalProcess = 1,
    LocalWebWorker = 2,
    Remote = 3,
    WorkerIsolated = 4,  // NEW
}
```

Update `extensionHostKindToString()` to handle the new kind.

#### 1.2 — Running Location

Add `WorkerIsolatedRunningLocation` in `src/vs/workbench/services/extensions/common/extensionRunningLocation.ts`, analogous to `LocalProcessRunningLocation`. This is used by the extension service to track where each extension is running.

#### 1.3 — Extension Host Kind Picker

Modify the `IExtensionHostKindPicker` implementations to recognize the new kind. Initially, the picker **never** selects `WorkerIsolated` — this is gated behind a setting:

```ts
// New setting: "extensions.experimental.workerIsolated": []
// Array of extension IDs to route to the WorkerIsolated host
```

When the setting lists an extension ID, the picker routes it to `WorkerIsolated` instead of `LocalProcess`.

#### 1.4 — Stub `IExtensionHost` Implementation

Create a minimal `WorkerIsolatedExtensionHost` class that implements `IExtensionHost` but throws on `start()`. This lets the system compile and validates that all switch statements and maps handle the new kind.

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/vs/workbench/services/extensions/common/extensionHostKind.ts` | Modify | Add `WorkerIsolated = 4` |
| `src/vs/workbench/services/extensions/common/extensionRunningLocation.ts` | Modify | Add `WorkerIsolatedRunningLocation` |
| `src/vs/workbench/services/extensions/common/extensionRunningLocationTracker.ts` | Modify | Handle new kind in location tracking |
| `src/vs/workbench/services/extensions/electron-sandbox/extensionHostKindPicker.ts` | Modify | Route based on setting |
| `src/vs/workbench/services/extensions/node/workerIsolated/workerIsolatedExtensionHost.ts` | Create | Stub `IExtensionHost` |
| `src/vs/workbench/services/extensions/electron-sandbox/extensionService.ts` | Modify | Create host for new kind |
| `src/vs/workbench/services/extensions/common/abstractExtensionService.ts` | Modify | Handle new kind |

### Unit Tests

1. **Kind string conversion**: `extensionHostKindToString(ExtensionHostKind.WorkerIsolated)` returns `'WorkerIsolated'`.
2. **Picker routing**: When setting contains `'test.extension'`, picker returns `WorkerIsolated` for that ID and `LocalProcess` for others.
3. **Picker default**: When setting is empty, no extensions route to `WorkerIsolated`.
4. **Running location**: `WorkerIsolatedRunningLocation` correctly reports `kind`, `affinity`, and equality.
5. **Exhaustive switches**: All `switch(kind)` statements in the codebase handle `WorkerIsolated` (verified by TypeScript exhaustiveness checks).

### Acceptance Criteria

- [ ] TypeScript compiles with zero errors across the entire `src/` tree.
- [ ] VS Code launches normally with the new kind registered (no extensions route to it by default).
- [ ] Setting `"extensions.experimental.workerIsolated": ["test.ext"]` causes the picker to select `WorkerIsolated` for that extension (verified by unit test and log inspection).
- [ ] All existing extension host tests continue to pass (no regression).
- [ ] `npm run valid-layers-check` passes.

---

## Phase 2: Supervisor Process Skeleton

### Goal

Create the supervisor process that will manage worker threads. It starts as a child process, establishes the `IMessagePassingProtocol` with the main thread, and responds to basic lifecycle commands — but spawns no workers yet. From the main thread's perspective, it looks like a valid (but empty) extension host.

### Detailed Design

#### 2.1 — Supervisor Entry Point

Create the supervisor process entry point, analogous to `src/vs/workbench/api/node/extensionHostProcess.ts`:

```
File: src/vs/workbench/services/extensions/node/workerIsolated/supervisorProcess.ts
```

This process:
1. Reads IPC configuration from `process.env` (parent PID, IPC handle, nonce) — same mechanism as the existing extension host process.
2. Creates a `Protocol` over the IPC socket to the main thread.
3. Performs the existing extension host handshake (`RPCProtocol` setup).
4. Instantiates `SupervisorMain` which handles activation requests.
5. Responds to `$test_up()` heartbeats.

#### 2.2 — `SupervisorMain`

The core orchestrator inside the supervisor process:

```
File: src/vs/workbench/services/extensions/node/workerIsolated/supervisorMain.ts

class SupervisorMain implements IDisposable {
    constructor(
        rpcProtocol: RPCProtocol,
        workerRegistry: WorkerRegistry,
        initData: IExtensionHostInitData,
    )

    // Called by main thread via RPC
    $activate(extensionId: ExtensionIdentifier): Promise<ActivatedExtension>
    $activateByEvent(event: string): Promise<void>
    $deltaExtensions(toAdd: IExtensionDescription[], toRemove: ExtensionIdentifier[]): Promise<void>
    $test_up(): Promise<number>

    // Internal
    private _getOrCreateWorker(ext: IExtensionDescription): Promise<WorkerConnection>
}
```

#### 2.3 — Wire `WorkerIsolatedExtensionHost` to Actually Start

Replace the stub from Phase 1 with a real implementation that:
1. Spawns the supervisor child process (using `child_process.fork()`)
2. Establishes the `IMessagePassingProtocol` over the IPC channel
3. Returns the protocol from `start()`

This follows the same pattern as `NativeLocalProcessExtensionHost`.

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/vs/workbench/services/extensions/node/workerIsolated/supervisorProcess.ts` | Create | Supervisor process entry point |
| `src/vs/workbench/services/extensions/node/workerIsolated/supervisorMain.ts` | Create | Core orchestrator |
| `src/vs/workbench/services/extensions/node/workerIsolated/workerIsolatedExtensionHost.ts` | Modify | Replace stub with real launch |
| `src/vs/workbench/services/extensions/node/workerIsolated/test/supervisorMain.test.ts` | Create | Tests |

### Unit Tests

1. **Supervisor starts**: `SupervisorMain` constructs without error and responds to `$test_up()`.
2. **Heartbeat**: `$test_up()` returns valid timestamp; repeated calls succeed.
3. **Empty activation**: `$activateByEvent('*')` with no extensions registered resolves without error.
4. **Delta extensions**: `$deltaExtensions([extA], [])` registers extension A; `$deltaExtensions([], [extA.id])` unregisters it.
5. **Protocol handshake**: The supervisor process entry point successfully completes the RPC handshake with a mock main thread (integration-style test using actual `child_process.fork()`).
6. **Graceful shutdown**: `dispose()` terminates all workers and closes the IPC channel.

### Acceptance Criteria

- [ ] `WorkerIsolatedExtensionHost.start()` successfully spawns the supervisor process and returns an `IMessagePassingProtocol`.
- [ ] Main thread can send `$test_up()` and receive a response (supervisor is alive).
- [ ] Main thread can send `$deltaExtensions()` to register extension descriptions.
- [ ] Supervisor process exits cleanly when `dispose()` is called.
- [ ] No orphaned child processes remain after VS Code shutdown.
- [ ] TypeScript compiles; existing tests pass; `valid-layers-check` passes.
- [ ] Supervisor correctly reads and validates `IExtensionHostInitData`.

---

## Phase 3: Single Extension in a Worker — Hello World

### Goal

Load and activate **one** extension in a `worker_thread` inside the supervisor. The extension can call `vscode.commands.registerCommand()` and `vscode.window.showInformationMessage()`. This is the first end-to-end vertical slice proving the architecture works.

### Detailed Design

#### 3.1 — Worker Bootstrap Script

Create the script that runs inside each `worker_thread`:

```
File: src/vs/workbench/services/extensions/node/workerIsolated/extensionWorkerBootstrap.ts
```

This script:
1. Receives the `MessagePort` from the supervisor via `workerData` or `parentPort`.
2. Creates a `WorkerConnectionClient` to talk to the supervisor.
3. Instantiates a stripped-down `ExtHostExtensionService` that knows about exactly one extension.
4. Creates the `vscode` API namespace using a modified version of `createApiFactoryAndRegisterActors()`.
5. Loads the extension's main module using Node's `require()`.
6. Calls `activate(context)` on the extension.
7. Reports activation success/failure back to the supervisor.

#### 3.2 — Proxied ExtHost Services (Minimal Set)

For this phase, only a minimal set of ExtHost services need to work inside the worker:

| Service | Implementation in worker |
|---|---|
| `ExtHostCommands` | Thin proxy: `registerCommand` sends registration to supervisor; `executeCommand` sends request to supervisor |
| `ExtHostMessageService` | Thin proxy: `showInformationMessage` etc. forward to supervisor → main thread |
| `ExtHostExtensionService` | Single-extension version: knows only about this extension |
| `ExtHostLogService` | Forwards log calls to supervisor |

All other API namespaces (`workspace`, `languages`, `debug`, etc.) are stubbed with informative error messages: "This API is not yet available in isolated mode."

#### 3.3 — Supervisor Routing for Commands

The supervisor maintains:
- A map of `commandId → extensionId` for locally registered commands
- For commands not registered locally: forwards to main thread via the existing RPC

When the main thread calls `$executeCommand('ext.cmd')`, the supervisor routes to the correct worker.

#### 3.4 — Worker-Side `vscode` Module Injection

The worker needs to intercept `require('vscode')` and return the proxied API. Two approaches:

**Option A**: Use Node's `Module._resolveFilename` hook to intercept `require('vscode')` — this is what the current extension host does.

**Option B**: Use `worker_threads` `workerData` with a pre-loaded module map.

**Recommendation**: Option A for consistency with the existing extension host.

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/vs/workbench/services/extensions/node/workerIsolated/extensionWorkerBootstrap.ts` | Create | Worker entry point |
| `src/vs/workbench/services/extensions/node/workerIsolated/workerExtHostCommands.ts` | Create | Proxied commands for worker |
| `src/vs/workbench/services/extensions/node/workerIsolated/workerExtHostMessageService.ts` | Create | Proxied messages for worker |
| `src/vs/workbench/services/extensions/node/workerIsolated/workerApiFactory.ts` | Create | vscode API factory for workers |
| `src/vs/workbench/services/extensions/node/workerIsolated/supervisorMain.ts` | Modify | Add worker spawning and command routing |
| `src/vs/workbench/services/extensions/node/workerIsolated/test/singleExtension.test.ts` | Create | End-to-end tests |

### Unit Tests

1. **Worker bootstrap**: Worker starts, receives `MessagePort`, establishes `WorkerConnectionClient`.
2. **`require('vscode')` interception**: Inside the worker, `require('vscode')` returns the proxied API object with expected namespaces.
3. **Command registration**: Extension calls `vscode.commands.registerCommand('test.hello', ...)`. Supervisor's command map contains `'test.hello'`.
4. **Command execution from main thread**: Main thread calls `$executeCommand('test.hello')`; the command handler in the worker runs and returns a result.
5. **Show message**: Extension calls `vscode.window.showInformationMessage('Hello')`. The call reaches the main thread's `MainThreadMessageService`.
6. **Activation lifecycle**: Worker calls `activate()` on the extension; activation result is reported to supervisor; supervisor reports to main thread.
7. **Deactivation**: `deactivate()` is called when the worker is terminated.
8. **Extension context**: The `ExtensionContext` passed to `activate()` has correct `extensionPath`, `extensionUri`, `subscriptions`, `globalState`, and `workspaceState`.
9. **Error in activation**: Extension's `activate()` throws; the error is reported to supervisor and main thread with extension ID context.
10. **Stubbed API errors**: Calling `vscode.workspace.openTextDocument()` (not yet implemented) throws an informative error.

### Acceptance Criteria

- [ ] A trivial test extension (`registerCommand` + `showInformationMessage`) activates in a worker and functions correctly when triggered from the command palette.
- [ ] The extension appears in the Running Extensions view with correct status.
- [ ] The extension's commands appear in the command palette.
- [ ] Terminating the worker (simulated crash) does not crash the supervisor or the main thread.
- [ ] All 10 unit test categories pass.
- [ ] Latency overhead of command execution through the worker is < 5ms compared to the shared host.
- [ ] TypeScript compiles; existing tests pass.

---

## Phase 4: Multi-Extension Workers and Cross-Extension Command Routing

### Goal

Run **multiple** extensions in separate workers within the same supervisor. Extension A can execute a command registered by extension B, with the supervisor transparently routing the call.

### Detailed Design

#### 4.1 — Multi-Worker Command Router

Upgrade the supervisor's command infrastructure:

```ts
class SupervisorCommandRouter {
    private readonly _commandOwners = new Map<string, ExtensionIdentifier>();
    private readonly _pendingExecutions = new Map<number, PendingExecution>();

    // Called when a worker registers a command
    registerCommand(extensionId: ExtensionIdentifier, commandId: string): void

    // Called when a worker unregisters a command (disposal)
    unregisterCommand(extensionId: ExtensionIdentifier, commandId: string): void

    // Called when any source (worker or main thread) wants to execute a command
    executeCommand(
        callerId: ExtensionIdentifier | 'mainThread',
        commandId: string,
        args: any[],
        token: CancellationToken
    ): Promise<any>
}
```

The routing logic:
1. Check if `commandId` is registered in any worker → route to that worker.
2. If not → forward to main thread (the command may be in the shared extension host or a built-in command).
3. If the main thread returns `$executeCommand` back to the supervisor (because the command is in an isolated extension) → route to the correct worker.

#### 4.2 — Extension Dependency Activation Order

When extension A depends on extension B, the supervisor must:
1. Receive `$activate(extensionA)` from the main thread.
2. Check `extensionA.extensionDependencies`.
3. Activate extension B first (spawn worker, load, call `activate()`).
4. Only then activate extension A.

This uses the existing `ExtensionDescriptionRegistry` topological sorting.

#### 4.3 — Worker Identity and Scoping

Each worker has a `WorkerIdentity`:

```ts
interface WorkerIdentity {
    readonly extensionId: ExtensionIdentifier;
    readonly workerId: string;  // UUID
    readonly pid: number;       // worker threadId
}
```

All RPC messages between worker and supervisor include the worker identity for routing and logging.

### Unit Tests

1. **Two-extension command routing**: Extension A registers `'a.greet'`, extension B registers `'b.compute'`. From main thread, `$executeCommand('a.greet')` reaches worker A; `$executeCommand('b.compute')` reaches worker B.
2. **Cross-worker command**: Worker A calls `executeCommand('b.compute', 21)`. Supervisor routes to worker B. Worker B returns `42`. Worker A receives `42`.
3. **Command not found**: Worker A calls `executeCommand('nonexistent')`. Supervisor forwards to main thread. Main thread returns error. Worker A receives the error.
4. **Command in shared host**: Command registered in the traditional shared extension host is callable from an isolated worker (routed through supervisor → main thread → shared host).
5. **Dependency activation order**: Extension A depends on B. `$activate(A)` triggers B's activation first, then A's.
6. **Circular dependency detection**: Extension A depends on B, B depends on A. Activation fails with a descriptive error.
7. **Concurrent activations**: 5 independent extensions activate concurrently; all succeed.
8. **Command re-registration**: Extension B deactivates and its commands are unregistered. Worker A calling `executeCommand('b.compute')` now goes to main thread.
9. **Large argument serialization**: Command with 1MB argument string works correctly (no corruption, reasonable performance).
10. **Cancellation across workers**: Worker A executes command in worker B with a `CancellationToken`. Cancellation propagates and B's handler receives the cancellation.

### Acceptance Criteria

- [ ] Two test extensions in separate workers can call each other's commands.
- [ ] Command routing adds < 2ms latency compared to in-process command dispatch.
- [ ] Extension dependency chains activate in correct order.
- [ ] Commands registered in the shared extension host remain callable from isolated workers.
- [ ] Worker crash of extension B does not affect extension A's worker.
- [ ] All 10 unit test categories pass.
- [ ] Running Extensions view shows both extensions with correct worker information.

---

## Phase 5: Event Multicasting Infrastructure

### Goal

Extensions in isolated workers can subscribe to VS Code events (`onDidChangeTextDocument`, `onDidChangeConfiguration`, `onDidOpenTerminal`, etc.) and receive them reliably. The supervisor multicasts events from the main thread to all subscribed workers.

### Detailed Design

#### 5.1 — Event Subscription Registry

The supervisor tracks which workers are subscribed to which event categories:

```ts
class EventMulticaster implements IDisposable {
    // Worker subscribes to a category of events
    subscribe(workerId: string, eventCategory: string): void

    // Worker unsubscribes
    unsubscribe(workerId: string, eventCategory: string): void

    // Main thread delivers an event; multicast to all subscribed workers
    deliver(eventCategory: string, args: any[]): void

    // Cross-worker event (extension-to-extension)
    deliverToWorker(targetWorkerId: string, eventCategory: string, args: any[]): void
}
```

#### 5.2 — Lazy Event Subscription

Events should be lazily subscribed. When a worker first adds a listener for `workspace.onDidChangeTextDocument`, the worker notifies the supervisor. The supervisor, if it doesn't already have a subscription to the main thread for that event, creates one. When the last worker unsubscribes, the supervisor drops its main-thread subscription.

This matches how the existing extension host works: `ExtHostDocuments` registers for document change events from the main thread only when extensions are listening.

#### 5.3 — Event Delivery Guarantees

- **At-least-once**: Events may be duplicated in edge cases (worker restart); extensions should be idempotent.
- **Ordered per-worker**: Events arrive at each worker in the order they were emitted.
- **No cross-worker ordering guarantee**: Worker A and Worker B may see events in different relative orderings (due to message queue differences).

### Unit Tests

1. **Single subscriber**: Worker A subscribes to `onDidChangeConfiguration`. Main thread emits config change. Worker A receives it.
2. **Multiple subscribers**: Workers A, B, C subscribe. Event delivered to all three.
3. **Selective subscription**: Worker A subscribes to `onDidChangeConfiguration`, Worker B does not. Only A receives config changes.
4. **Unsubscribe**: Worker A subscribes, receives events, unsubscribes, no longer receives events.
5. **Lazy subscription**: No main-thread subscription exists until a worker subscribes. After last worker unsubscribes, main-thread subscription is disposed.
6. **Event ordering**: 100 events emitted in sequence. Each worker receives them in the same order.
7. **Worker crash during event delivery**: Worker crashes mid-delivery. Supervisor handles the error; other workers still receive events.
8. **Event with complex payload**: Events carrying `TextDocumentChangeEvent`-like payloads (URIs, ranges, text) serialize/deserialize correctly.
9. **High-frequency events**: 10,000 events/second for 1 second. No events dropped, no memory leak.
10. **Dispose cleanup**: Disposing `EventMulticaster` unsubscribes everything and cleans up.

### Acceptance Criteria

- [ ] Extensions in isolated workers receive configuration change events.
- [ ] Extensions in isolated workers receive file system watcher events.
- [ ] Event delivery overhead is < 1ms per event per worker (measured in test).
- [ ] No memory leaks: subscribing and unsubscribing 1000 times does not grow heap.
- [ ] Event ordering is preserved per-worker.
- [ ] Lazy subscription optimization is verified: no unnecessary main-thread subscriptions.
- [ ] All 10 unit test categories pass.

---

## Phase 6: Document Mirror Replication

### Goal

Each worker gets its own `ExtHostDocuments` instance with independent document mirrors synchronized from the supervisor. Extensions can call `workspace.openTextDocument()`, `workspace.textDocuments`, and receive `onDidChangeTextDocument` / `onDidOpenTextDocument` / `onDidCloseTextDocument` events.

### Detailed Design

#### 6.1 — Per-Worker Document State

The supervisor holds the canonical document state (received from the main thread via `$acceptModelChanged`, `$acceptModelAdded`, `$acceptModelRemoved`). It then distributes these events to workers.

Two strategies:

**Strategy A — Full replication**: Every worker receives every document event. Each worker has a full `ExtHostDocuments` instance. Simple but wasteful if an extension doesn't care about most documents.

**Strategy B — On-demand replication**: Workers only receive document events for documents they've expressed interest in (via `openTextDocument()`, `registerCompletionItemProvider()`, etc.). More complex but much more efficient.

**Recommendation**: Start with Strategy A (simplicity) and optimize to Strategy B in a later phase.

#### 6.2 — Document Identity

Today, `workspace.openTextDocument(uri)` returns the same `TextDocument` instance across calls within the same extension host. In isolated workers, each worker gets its own `TextDocument` instance for the same URI, but the content is identical (kept in sync). This is fine — the API contract is about equality of URI and content, not object identity (and `===` identity across extensions was never guaranteed even in the shared host model).

#### 6.3 — Document Content Synchronization

When a worker starts, it receives the current document state as a bulk snapshot. Subsequent changes arrive as incremental `$acceptModelChanged` events.

### Unit Tests

1. **Document sync on worker start**: Worker starts; supervisor sends current documents; worker's `workspace.textDocuments` matches main thread state.
2. **Document open event**: Main thread opens a document. Worker receives `onDidOpenTextDocument`.
3. **Document change event**: Document is edited. Worker receives `onDidChangeTextDocument` with correct content changes.
4. **Document close event**: Document is closed. Worker receives `onDidCloseTextDocument`.
5. **`openTextDocument()` from worker**: Worker calls `workspace.openTextDocument(uri)`. Request goes to supervisor → main thread. Worker receives the document.
6. **Document content consistency**: After 50 rapid edits, worker's document content matches the main thread's content exactly (character-by-character).
7. **Multiple workers same document**: Workers A and B both have mirrors of the same document. An edit from main thread reaches both.
8. **Worker late join**: Worker C starts after document D was already open. Worker C still receives document D's current content.
9. **Large document**: A 10MB document is synchronized without corruption or excessive memory.
10. **Document versioning**: `TextDocument.version` in the worker increments correctly with each edit.

### Acceptance Criteria

- [ ] Extensions in isolated workers can read document content via `workspace.textDocuments` and `TextDocument.getText()`.
- [ ] `workspace.openTextDocument()` works from isolated workers.
- [ ] `onDidChangeTextDocument` fires in workers with correct change data.
- [ ] Document content is always consistent between worker mirrors and main thread (verified by content hash comparison in stress test).
- [ ] No excessive memory: document content is not duplicated more than necessary.
- [ ] All 10 unit test categories pass.

---

## Phase 7: Language Feature Providers Through Workers

### Goal

Extensions in isolated workers can register language feature providers (`CompletionItemProvider`, `HoverProvider`, `DefinitionProvider`, `DocumentSymbolProvider`, `CodeActionProvider`, etc.) and they work correctly in the editor.

### Detailed Design

#### 7.1 — Worker-Side `ExtHostLanguageFeatures`

Create a proxied `ExtHostLanguageFeatures` inside each worker that:
- Registers provider handles with the supervisor
- Receives `$provideCompletionItems`, `$provideHover`, etc. callbacks from the supervisor
- Invokes the extension's provider
- Serializes the result back to the supervisor

The serialization of `CompletionItem`, `Hover`, `Location`, etc. already exists in `extHostTypeConverters.ts`. The worker reuses these converters.

#### 7.2 — Supervisor as Provider Router

The supervisor aggregates providers from all workers and presents them to the main thread as a single set. When the main thread calls `$provideCompletionItems(handle, ...)`, the supervisor routes to the correct worker based on the handle.

Provider handles must be globally unique across workers. The supervisor assigns handle ranges per worker (e.g., worker A: handles 1-999, worker B: handles 1000-1999) or uses a prefix scheme.

#### 7.3 — Provider Lifecycle

When a worker registers a provider, the supervisor:
1. Allocates a handle
2. Registers the provider with the main thread via `MainThreadLanguageFeatures.$registerCompletionSupport(handle, selector, ...)`
3. Stores the mapping: `handle → workerId`

When the main thread calls `$provideCompletionItems(handle, ...)`:
1. Supervisor looks up the worker for this handle
2. Forwards the call to the worker
3. Worker invokes the provider and serializes the result
4. Supervisor forwards the result to the main thread

### Unit Tests

1. **Completion provider registration**: Worker registers `CompletionItemProvider`. Main thread receives the registration.
2. **Completion provider invocation**: Typing triggers completions. Worker's provider is invoked. Results appear in the editor.
3. **Hover provider**: Worker registers `HoverProvider`. Hovering over a symbol invokes the provider through the worker.
4. **Definition provider**: `Go to Definition` invokes the worker's `DefinitionProvider`.
5. **Code action provider**: Quick fix invokes the worker's `CodeActionProvider`.
6. **Multiple providers across workers**: Worker A provides completions, Worker B provides hover, for the same language. Both work.
7. **Provider disposal**: Worker disposes its completion provider. Main thread unregisters it. No more calls arrive at the worker.
8. **Provider timeout**: Provider takes > 5 seconds. The main thread's timeout handling works correctly.
9. **Provider throws**: Provider throws an error. The error is captured and reported; editor shows appropriate fallback.
10. **Resolve pattern**: `CompletionItem.resolve()` (two-phase completion) works through the worker.

### Acceptance Criteria

- [ ] An extension in a worker providing completions works identically to one in the shared host (same editor UX).
- [ ] Latency for provider invocation through worker is < 10ms overhead vs. shared host.
- [ ] All major provider types work: completion, hover, definition, references, symbols, code actions, formatting, rename, folding, semantic tokens.
- [ ] Provider handles are globally unique; no conflicts between workers.
- [ ] Provider disposal is clean; no lingering registrations.
- [ ] All 10 unit test categories pass.

---

## Phase 8: Workspace API and Configuration

### Goal

Extensions in workers can use `workspace.getConfiguration()`, `workspace.workspaceFolders`, `workspace.findFiles()`, `workspace.fs` (file system API), and configuration change events.

### Detailed Design

#### 8.1 — Worker `ExtHostConfiguration`

Each worker gets a proxied `ExtHostConfiguration`:
- `getConfiguration()` returns configuration values fetched from the supervisor → main thread.
- Configuration change events are multicasted from the supervisor.
- Per-extension configuration scoping (resource-based) works correctly.

#### 8.2 — Worker `ExtHostWorkspace`

- `workspaceFolders` is replicated from supervisor.
- `findFiles()` forwards to supervisor → main thread.
- `workspace.fs` is a proxy to `ExtHostFileSystem` → supervisor → main thread.
- `onDidChangeWorkspaceFolders` is multicasted.

#### 8.3 — Worker `ExtHostFileSystem`

The `workspace.fs` API (`readFile`, `writeFile`, `stat`, `readDirectory`, `delete`, `rename`, `copy`) is already fully brokered through RPC. The worker's proxy simply adds another hop: Worker → Supervisor → Main Thread.

**Important for sandboxing (future)**: This is the exact interception point where Phase 14 will add policy-based file system access control. The proxy layer we build now is reused later for sandboxing.

### Unit Tests

1. **Get configuration**: `workspace.getConfiguration('editor').get('fontSize')` returns the correct value.
2. **Configuration change event**: User changes a setting. Worker receives `onDidChangeConfiguration` with correct affected keys.
3. **Workspace folders**: `workspace.workspaceFolders` returns correct folders.
4. **Find files**: `workspace.findFiles('**/*.ts')` returns results.
5. **Workspace fs.readFile**: Reading a file via `workspace.fs.readFile()` returns correct content.
6. **Workspace fs.writeFile**: Writing a file via `workspace.fs.writeFile()` persists correctly.
7. **Workspace fs.stat**: `stat()` returns correct file metadata.
8. **Workspace fs.readDirectory**: `readDirectory()` returns correct entries.
9. **Workspace folder change event**: Adding a workspace folder triggers `onDidChangeWorkspaceFolders`.
10. **Scoped configuration**: `getConfiguration('myExt', documentUri)` returns resource-scoped config.

### Acceptance Criteria

- [ ] Extensions in workers can read and write configuration.
- [ ] Extensions in workers can access workspace folders and files.
- [ ] All workspace file system operations work through the proxy.
- [ ] Configuration and workspace events are delivered to workers.
- [ ] No behavior difference from the shared extension host for these APIs.
- [ ] All 10 unit test categories pass.

---

## Phase 9: Extension Exports Membrane — Basic

### Goal

`vscode.extensions.getExtension('other-ext')?.exports` works across workers. Start with the simplest case: exports that are plain objects with methods (functions). Events and complex class instances are deferred to Phase 16.

### Detailed Design

#### 9.1 — The Membrane Concept

When extension A calls `getExtension('ext-b')?.exports`, it receives a **membrane proxy** — a local object whose methods are RPC stubs pointing at the real exports in extension B's worker.

```ts
// In Worker A:
const extB = vscode.extensions.getExtension('ext-b');
const result = await extB.exports.computeSomething(42);
// This is actually an RPC call: Worker A → Supervisor → Worker B → B.exports.computeSomething(42)
```

#### 9.2 — Exports Registration

When extension B's `activate()` returns, its return value (the exports) is analyzed:

```ts
class ExportsAnalyzer {
    analyze(exports: any): ExportsDescriptor {
        // Walk the exports object
        // For each property:
        //   - primitive → value (will be sent by value)
        //   - function → remote handle
        //   - object → recurse
        //   - class instance → remote handle with method descriptors
        return descriptor;
    }
}
```

The `ExportsDescriptor` is sent to the supervisor, which stores it.

#### 9.3 — Membrane Proxy Generation

When extension A requests extension B's exports, the supervisor sends B's `ExportsDescriptor` to Worker A. Worker A generates a `Proxy` object:

```ts
function createMembraneProxy(descriptor: ExportsDescriptor, connection: WorkerConnectionClient): any {
    const proxy = {};
    for (const [key, propDesc] of descriptor.properties) {
        if (propDesc.type === 'function') {
            proxy[key] = (...args: any[]) => {
                return connection.request('$invokeExport', [targetExtId, key, args]);
            };
        } else if (propDesc.type === 'value') {
            proxy[key] = propDesc.value; // sent by value
        }
    }
    return proxy;
}
```

#### 9.4 — Limitations (This Phase)

- Only top-level properties of exports are proxied (no nested objects deeper than 1 level).
- Functions in exports must be async-safe (their return values are serialized).
- Events in exports are not supported yet (Phase 16).
- Class instances are not supported yet (Phase 16).
- Exports mutations after `activate()` returns are not reflected in the membrane.

### Unit Tests

1. **Simple function export**: Extension B exports `{ add: (a, b) => a + b }`. Extension A calls `extB.exports.add(1, 2)` and receives `3`.
2. **Async function export**: Extension B exports `{ fetchData: async () => 'data' }`. Extension A awaits and receives `'data'`.
3. **Primitive export**: Extension B exports `{ version: '1.0.0' }`. Extension A reads `extB.exports.version` and gets `'1.0.0'`.
4. **Extension not found**: `getExtension('nonexistent')` returns `undefined`.
5. **Extension not yet activated**: `getExtension('ext-b')` returns the extension but `isActive` is `false` and `exports` is `undefined`.
6. **Activation trigger**: Accessing `exports` on an inactive extension triggers activation (matches current behavior).
7. **Error in export function**: Extension B's exported function throws. Extension A receives a rejected promise with the error.
8. **Export function with complex args**: Function called with `{ uri: vscode.Uri.file('/path'), range: new vscode.Range(1,0,2,0) }`. Serialization works.
9. **Multiple extensions accessing same exports**: Workers A and C both call extension B's exports concurrently. Both receive correct results.
10. **Membrane after deactivation**: Extension B deactivates. Extension A's membrane calls reject with "Extension deactivated".

### Acceptance Criteria

- [ ] Cross-worker `getExtension().exports` works for function-typed exports.
- [ ] Primitive-valued exports are accessible without RPC.
- [ ] Export function invocation latency is < 5ms overhead vs. in-process.
- [ ] The membrane is transparent to extensions — no API changes required.
- [ ] Errors propagate correctly through the membrane.
- [ ] All 10 unit test categories pass.
- [ ] Known limitations are documented and enforced with clear error messages.

---

## Phase 10: Output Channels, Diagnostics, and Status Bar

### Goal

Extensions in workers can create output channels, push diagnostics (errors/warnings), and create status bar items. These are high-usage APIs that many extensions need.

### Detailed Design

#### 10.1 — Output Channels

`window.createOutputChannel()` is already brokered via `ExtHostOutputChannel` → `MainThreadOutputService`. The worker proxy forwards the creation and write calls through the supervisor.

#### 10.2 — Diagnostics

`languages.createDiagnosticCollection()` is brokered via `ExtHostDiagnostics` → `MainThreadDiagnostics`. Worker proxy forwards diagnostic pushes.

#### 10.3 — Status Bar

`window.createStatusBarItem()` is brokered via `ExtHostStatusBar` → `MainThreadStatusBar`. Worker proxy handles creation and updates.

### Unit Tests

1. **Output channel creation**: Worker creates output channel; it appears in the Output panel.
2. **Output channel write**: `channel.appendLine('test')` displays in the output panel.
3. **Diagnostic push**: Worker pushes diagnostics for a file; they appear in the Problems panel.
4. **Diagnostic clear**: Worker clears diagnostics; they disappear from the Problems panel.
5. **Status bar item**: Worker creates status bar item with text; it appears in the status bar.
6. **Status bar update**: Updating status bar item text/color reflects in the UI.
7. **Status bar dispose**: Disposing the item removes it from the status bar.
8. **Multiple workers output channels**: Workers A and B create separate output channels; both work independently.
9. **Log output channel**: `window.createOutputChannel('name', { log: true })` works from workers.
10. **Diagnostic collection dispose**: Disposing the collection clears all its diagnostics.

### Acceptance Criteria

- [ ] Output channels created from isolated workers function identically to shared host.
- [ ] Diagnostics pushed from isolated workers appear in the Problems panel.
- [ ] Status bar items created from isolated workers appear and update correctly.
- [ ] All APIs match existing behavior — no visible difference to users.
- [ ] All 10 unit test categories pass.

---

## Phase 11: Debug, Tasks, and Terminal APIs

### Goal

Extensions in workers can use the debug, tasks, and terminal APIs. These are essential for language extensions and build tool integrations.

### Detailed Design

All three APIs (`debug`, `tasks`, `window.createTerminal`) are already fully brokered through RPC between ext host and main thread. The worker adds one more proxy hop.

### Unit Tests

1. **Register debug adapter**: Worker registers a `DebugAdapterDescriptorFactory`. Debug sessions can start.
2. **Start debug session**: `debug.startDebugging()` from a worker starts a debug session.
3. **Debug events**: Worker receives `onDidStartDebugSession`, `onDidTerminateDebugSession`.
4. **Task provider**: Worker registers a `TaskProvider`. Tasks appear in the task list.
5. **Task execution**: `tasks.executeTask()` from a worker runs the task.
6. **Task events**: Worker receives `onDidStartTask`, `onDidEndTask`.
7. **Create terminal**: Worker creates a terminal via `window.createTerminal()`.
8. **Terminal send text**: `terminal.sendText('echo hello')` sends text to the terminal.
9. **Terminal events**: Worker receives `onDidOpenTerminal`, `onDidCloseTerminal`.
10. **Pseudoterminal**: Worker registers a `Pseudoterminal` (custom terminal). It functions correctly.

### Acceptance Criteria

- [ ] Debug adapter contributions from isolated workers function correctly.
- [ ] Task providers from isolated workers appear in the task list.
- [ ] Terminal creation from isolated workers works.
- [ ] All debug/task/terminal events are delivered to workers.
- [ ] All 10 unit test categories pass.

---

## Phase 12: Per-Worker Watchdog and Health Monitoring

### Goal

The supervisor monitors each worker's responsiveness individually. A hung worker (`while(true){}`) is detected, reported to the user, and can be terminated without affecting other workers.

### Detailed Design

#### 12.1 — Heartbeat Protocol

The supervisor sends periodic `$heartbeat` requests to each worker (every 2 seconds). If a worker doesn't respond within 10 seconds, it's marked unresponsive.

```ts
class PerWorkerWatchdog implements IDisposable {
    private readonly _heartbeatInterval = 2000;
    private readonly _unresponsiveThreshold = 10000;
    private readonly _terminateThreshold = 30000;

    readonly onDidWorkerBecomeUnresponsive: Event<ExtensionIdentifier>;
    readonly onDidWorkerBecomeResponsive: Event<ExtensionIdentifier>;
    readonly onDidTerminateUnresponsiveWorker: Event<ExtensionIdentifier>;
}
```

#### 12.2 — Unresponsive UI

When a worker becomes unresponsive:
1. The supervisor notifies the main thread via RPC.
2. The main thread shows a notification: "Extension 'X' is not responding."
3. Options: "Wait", "Restart Extension", "Disable Extension"
4. "Restart Extension" terminates the worker and spawns a new one.

#### 12.3 — Memory Monitoring

Use `worker_threads` resource tracking (or V8 `getHeapStatistics()` forwarded from the worker) to monitor per-worker memory usage. Alert if a worker exceeds a configurable threshold.

### Unit Tests

1. **Healthy worker**: Worker responds to heartbeats. No events fire.
2. **Unresponsive worker**: Worker blocks on `while(true){}`. `onDidWorkerBecomeUnresponsive` fires within threshold.
3. **Recovery**: Worker was slow but recovers. `onDidWorkerBecomeResponsive` fires.
4. **Auto-terminate**: Worker remains unresponsive past terminate threshold. Worker is terminated.
5. **Terminate notification**: `onDidTerminateUnresponsiveWorker` fires with correct extension ID.
6. **Other workers unaffected**: Worker A is unresponsive. Workers B and C continue to respond normally.
7. **Memory threshold**: Worker allocates excessive memory. Memory alert fires.
8. **Heartbeat frequency**: Heartbeats are sent at the configured interval (±10%).
9. **Watchdog disposal**: Disposing the watchdog stops all heartbeat timers.
10. **Worker restart after terminate**: After an unresponsive worker is terminated, re-activating the extension spawns a new worker.

### Acceptance Criteria

- [ ] A worker running `while(true){}` is detected as unresponsive within 12 seconds.
- [ ] User sees "Extension X is not responding" notification.
- [ ] "Restart Extension" terminates the hung worker and re-activates the extension in a fresh worker.
- [ ] Other extensions in separate workers are completely unaffected by a hung worker.
- [ ] Memory monitoring detects runaway memory allocation.
- [ ] All 10 unit test categories pass.

---

## Phase 13: Deadlock Detection

### Goal

Detect and break async deadlocks caused by circular cross-worker RPC calls.

### Detailed Design

#### 13.1 — Wait-For Graph

The supervisor maintains a directed graph of pending cross-worker calls:

```
Node: (extensionId, callId)
Edge: extensionA is waiting for extensionB
```

On each new cross-worker call, the supervisor checks for cycles. If a cycle is detected, the newest call in the cycle is rejected with `DeadlockError`.

```ts
class DeadlockDetector {
    trackPendingCall(from: ExtensionIdentifier, to: ExtensionIdentifier, callId: number): void
    completePendingCall(callId: number): void

    // Returns the cycle if a deadlock is detected, null otherwise
    checkForDeadlock(): ExtensionIdentifier[] | null
}
```

#### 13.2 — Deadlock Reporting

When a deadlock is detected:
1. The newest call is rejected with a `DeadlockError` including the full cycle description.
2. A telemetry event is logged with the cycle details.
3. A warning appears in the developer console.

### Unit Tests

1. **No deadlock**: A calls B, B returns. No deadlock detected.
2. **Simple deadlock**: A calls B, B calls A (while A is waiting). Deadlock detected.
3. **Three-way deadlock**: A calls B, B calls C, C calls A. Deadlock detected.
4. **Near-miss**: A calls B, A also calls C. No deadlock (no cycle).
5. **Deadlock resolution**: Newest call in the cycle is rejected. Older calls eventually complete.
6. **Concurrent non-deadlocking calls**: Many concurrent cross-worker calls with no cycles. No false positives.
7. **Deadlock with main thread**: A calls main thread, main thread calls A back. Detected and handled.
8. **Cleanup on completion**: Completed calls are removed from the graph; no stale edges.
9. **Performance**: 10,000 tracked calls, cycle detection completes in < 1ms.
10. **Error message quality**: `DeadlockError` message includes human-readable cycle description.

### Acceptance Criteria

- [ ] Circular RPC chains are detected before they cause infinite hangs.
- [ ] Detection latency is < 1ms even with 10,000 pending calls.
- [ ] False positive rate is zero (mathematically proven by cycle detection algorithm).
- [ ] Rejected calls include descriptive error messages.
- [ ] Telemetry captures deadlock occurrences for later analysis.
- [ ] All 10 unit test categories pass.

---

## Phase 14: Custom Module Loader — The Sandbox Gate

### Goal

Replace Node's default `require()` inside each worker with a custom module loader that intercepts all module loads. This is the foundation of the sandbox — it controls what code and what Node.js built-in modules an extension can access.

### Detailed Design

#### 14.1 — `SandboxModuleLoader`

Each worker uses a custom module loader that wraps Node's `Module._load`:

```ts
class SandboxModuleLoader {
    constructor(
        private readonly _extensionId: ExtensionIdentifier,
        private readonly _extensionPath: string,
        private readonly _policy: SandboxPolicy,
        private readonly _shimRegistry: ShimRegistry,
    )

    // Intercepts require() calls
    load(request: string, parent: Module): any {
        // 1. 'vscode' → return proxied API (already done)
        // 2. Node built-in (fs, net, child_process, etc.) → return shim or deny
        // 3. Extension's own modules (relative path) → load normally from extension dir
        // 4. node_modules dependency → load from extension's node_modules
        // 5. Anything else → deny with error
    }
}
```

#### 14.2 — Module Resolution Scoping

Extensions can only `require()`:
1. `'vscode'` — the proxied API
2. Their own files (paths within `extensionPath`)
3. Their own `node_modules` (within `extensionPath/node_modules`)
4. Node built-in modules — subject to policy (shimmed or blocked)

An extension **cannot** `require()`:
- Files outside its extension directory
- Other extensions' files
- Global `node_modules`
- The supervisor's modules

This is enforced by the module loader at resolution time:

```ts
private _resolveModulePath(request: string, parentPath: string): string {
    const resolved = Module._resolveFilename(request, parent);
    if (!resolved.startsWith(this._extensionPath)) {
        throw new Error(`Extension '${this._extensionId}' cannot require '${request}': path '${resolved}' is outside the extension directory.`);
    }
    return resolved;
}
```

#### 14.3 — Built-in Module Registry

A registry defines how each Node.js built-in module is handled:

```ts
interface BuiltinModulePolicy {
    readonly module: string;        // e.g., 'fs', 'net', 'child_process'
    readonly action: 'shim' | 'deny' | 'allow';
    readonly shimFactory?: () => any; // If action === 'shim', the factory for the shim
}
```

In this phase, all built-in modules are `'allow'` (passed through unchanged). Shimming is introduced in Phases 15-17.

### Unit Tests

1. **`require('vscode')` works**: Returns the proxied API.
2. **Relative require works**: `require('./helper')` loads from the extension's directory.
3. **`node_modules` require works**: `require('lodash')` loads from the extension's `node_modules`.
4. **Path escape blocked**: `require('../../supervisor-module')` is denied.
5. **Absolute path escape blocked**: `require('/etc/passwd')` is denied.
6. **Symlink escape blocked**: A symlink from `node_modules/evil` pointing outside the extension dir is blocked.
7. **Built-in module access**: `require('fs')` works (in `'allow'` mode).
8. **Non-existent module**: `require('nonexistent')` throws the standard Node error.
9. **Module caching**: Same module `require()`'d twice returns the same instance.
10. **Dynamic import**: `import()` is also intercepted (via loader hooks).
11. **`createRequire()` restricted**: `module.createRequire()` with paths outside the extension dir is denied.
12. **Policy change**: Changing a built-in module from `'allow'` to `'deny'` takes effect for new `require()` calls.

### Acceptance Criteria

- [ ] Extensions can only load their own code and dependencies — no path traversal escapes.
- [ ] `require('vscode')` returns the proxied API.
- [ ] Node built-in modules are interceptable (even if all allowed in this phase).
- [ ] Module caching works correctly within the worker.
- [ ] Symlink-based escapes are prevented.
- [ ] `import()` (dynamic ESM) is also intercepted.
- [ ] Performance overhead of module interception is < 1ms per `require()` call.
- [ ] All 12 unit test categories pass.
- [ ] Security review: no known bypasses to the module path restriction.

---

## Phase 15: File System Sandboxing

### Goal

Replace Node's `fs` module inside each worker with a **shimmed `fs`** that routes all file system operations through the supervisor. The supervisor enforces per-extension file system access policies.

### Detailed Design

#### 15.1 — `SandboxedFs` Shim

Create a drop-in replacement for Node's `fs` module:

```
File: src/vs/workbench/services/extensions/node/workerIsolated/sandbox/sandboxedFs.ts
```

This module exports the same API surface as Node's `fs` (and `fs/promises`), but every operation goes through a policy-checked RPC to the supervisor:

```ts
class SandboxedFs {
    constructor(
        private readonly _connection: WorkerConnectionClient,
        private readonly _extensionId: ExtensionIdentifier,
    )

    readFile(path: string, options?: any): Promise<Buffer> {
        return this._connection.request('$fs.readFile', [path, options]);
    }

    writeFile(path: string, data: any, options?: any): Promise<void> {
        return this._connection.request('$fs.writeFile', [path, data, options]);
    }

    // ... all fs methods
}
```

#### 15.2 — File System Access Policy

The supervisor enforces access rules per extension:

```ts
interface FsAccessPolicy {
    // What paths can the extension read?
    readAllowed: PathPattern[];    // e.g., [extensionPath + '/**', workspaceFolders + '/**']
    // What paths can the extension write?
    writeAllowed: PathPattern[];   // e.g., [extensionPath + '/out/**', workspaceFolders + '/**']
    // What paths are denied regardless?
    denied: PathPattern[];         // e.g., ['~/.ssh/**', '~/.gnupg/**']
}
```

Default policy:
- **Read**: Extension's own directory + workspace folders + temp directory
- **Write**: Extension's own directory (output/cache) + workspace folders + temp directory
- **Denied**: SSH keys, GPG keys, credentials files, other extensions' directories

#### 15.3 — Synchronous `fs` Methods

Node's `fs` has synchronous methods (`readFileSync`, `writeFileSync`, etc.). These **cannot** be trivially proxied through async RPC.

**Options**:
1. **Block them**: Throw an error. Many extensions use sync fs methods.
2. **Use `Atomics.wait` + `SharedArrayBuffer`**: Block the worker thread while the supervisor performs the operation. This is technically possible but complex and defeats some isolation benefits.
3. **Use a pre-populated in-memory fs for reads**: Cache commonly accessed files.

**Recommendation**: Option 2 (with `SharedArrayBuffer`) for backward compatibility. This is the approach used by VS Code's web worker extension host for `require()` itself. A `SharedArrayBuffer` and `Atomics.wait` pair allows the worker to block until the supervisor writes the result.

```ts
class SyncBridge {
    private readonly _sharedBuffer: SharedArrayBuffer;
    private readonly _int32: Int32Array;

    syncRequest(method: string, args: any[]): any {
        // 1. Write request to shared buffer
        // 2. Notify supervisor via MessagePort
        // 3. Atomics.wait() on the shared buffer
        // 4. Supervisor performs the operation
        // 5. Supervisor writes result to shared buffer and Atomics.notify()
        // 6. Worker reads result from shared buffer
    }
}
```

#### 15.4 — `path` Module Behavior

The `path` module is CPU-only (no I/O) and does not need shimming. It passes through unchanged.

### Unit Tests

1. **Shimmed `require('fs')`**: Inside a sandboxed worker, `require('fs')` returns the shim, not Node's real `fs`.
2. **`readFile` allowed path**: Reading a file within the workspace succeeds.
3. **`readFile` denied path**: Reading `~/.ssh/id_rsa` is denied with `PermissionError`.
4. **`writeFile` allowed path**: Writing to the extension's output directory succeeds.
5. **`writeFile` denied path**: Writing to `/etc/hosts` is denied.
6. **`readFileSync` works**: Synchronous read via `SharedArrayBuffer` bridge returns correct content.
7. **`writeFileSync` works**: Synchronous write via bridge completes.
8. **`readdir` works**: Lists directory contents within allowed paths.
9. **`stat` works**: Returns correct file metadata.
10. **`mkdir` / `rmdir`**: Directory creation/removal within allowed paths works.
11. **`rename` / `unlink`**: File rename/delete within allowed paths works.
12. **Path traversal blocked**: `readFile('../../etc/passwd')` resolves the path and denies access.
13. **Symlink following**: `readFile(symlinkToSensitiveFile)` resolves and denies if target is outside policy.
14. **Watch**: `fs.watch()` and `fs.watchFile()` work within allowed paths.
15. **Stream**: `fs.createReadStream()` and `fs.createWriteStream()` work within allowed paths.
16. **Policy update**: Changing policy at runtime affects subsequent operations.

### Acceptance Criteria

- [ ] Extensions using `require('fs')` get the sandboxed shim transparently.
- [ ] All common `fs` methods (async, sync, streaming) work for allowed paths.
- [ ] Access to paths outside the policy is denied with clear error messages.
- [ ] Path traversal attacks (relative paths, symlinks) are caught and denied.
- [ ] `readFileSync` / `writeFileSync` work via the `SharedArrayBuffer` bridge without deadlocking.
- [ ] Performance: async `readFile` adds < 5ms overhead vs. direct `fs.readFile`.
- [ ] Performance: sync `readFileSync` adds < 10ms overhead vs. direct `fs.readFileSync`.
- [ ] All 16 unit test categories pass.
- [ ] Security review: no known bypasses.

---

## Phase 16: Network Sandboxing — `fetch`, `http`, `https`, `net`

### Goal

Intercept and policy-control all network access from sandboxed extensions. Extensions can only make network requests to allowed hosts/ports.

### Detailed Design

#### 16.1 — Network Shims

Create shimmed versions of:
- `http` / `https` — Intercept `http.request()`, `https.request()`, `http.get()`, etc.
- `net` — Intercept `net.connect()`, `net.createConnection()`, `new net.Socket()`.
- `fetch` (global) — Intercept the global `fetch()` function.
- `tls` — Intercept `tls.connect()`.
- `dgram` — Intercept UDP sockets.
- `dns` — Intercept DNS lookups.

All network operations go through the supervisor for policy checking:

```ts
// In supervisor
class NetworkPolicyEngine {
    checkOutbound(
        extensionId: ExtensionIdentifier,
        host: string,
        port: number,
        protocol: 'http' | 'https' | 'tcp' | 'udp'
    ): { allowed: boolean; reason?: string }
}
```

#### 16.2 — Network Access Policy

```ts
interface NetworkPolicy {
    // Allowed outbound connections
    allowedHosts: HostPattern[];     // e.g., ['*.github.com', 'api.example.com']
    allowedPorts: number[];           // e.g., [80, 443]
    // Block all by default? (default: false for backward compat, true for untrusted)
    denyByDefault: boolean;
    // Allow localhost connections?
    allowLocalhost: boolean;
}
```

#### 16.3 — Request Proxying vs. Policy-Only

**Option A — Policy-only**: The shim checks the policy, then performs the actual network request from within the worker using the real `http`/`net` modules. Simpler, but the worker still has raw socket access.

**Option B — Full proxying**: All network I/O goes through the supervisor process. The worker has no direct network access. Stronger isolation, but higher complexity and latency.

**Recommendation**: Option A for Phase 16, with the path to Option B available for Phase 24 (full containment). Option A provides meaningful security (policy enforcement) while maintaining performance.

#### 16.4 — Global `fetch` Interception

In the worker, replace the global `fetch`:

```ts
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const check = await connection.request('$net.checkOutbound', [url.hostname, url.port || 443, url.protocol]);
    if (!check.allowed) {
        throw new Error(`Network access denied for extension '${extensionId}': ${check.reason}`);
    }
    return originalFetch(input, init);
};
```

### Unit Tests

1. **`fetch` to allowed host**: `fetch('https://api.github.com/...')` succeeds when `*.github.com` is allowed.
2. **`fetch` to denied host**: `fetch('https://evil.com/...')` is denied.
3. **`http.request` to allowed host**: Works correctly.
4. **`http.request` to denied host**: Denied.
5. **`net.connect` to allowed host/port**: Works.
6. **`net.connect` to denied host/port**: Denied.
7. **Localhost access**: When `allowLocalhost` is true, connections to `127.0.0.1` work.
8. **DNS resolution**: `dns.lookup('evil.com')` is blocked when host is not allowed.
9. **Default deny mode**: With `denyByDefault: true`, all connections except explicitly allowed are denied.
10. **Streaming responses**: `fetch` returning a streaming response works correctly through the shim.
11. **HTTPS client certificates**: Extensions using client certificates for mTLS work when allowed.
12. **WebSocket**: `new WebSocket('wss://allowed.com')` works when host is allowed.
13. **Request logging**: All network requests are logged with extension ID, host, port, and allow/deny status.
14. **Policy update**: Runtime policy changes take effect for new connections.

### Acceptance Criteria

- [ ] All network APIs (`fetch`, `http`, `https`, `net`, `tls`, `dgram`, `dns`) are intercepted.
- [ ] Extensions can only connect to hosts/ports allowed by policy.
- [ ] Denied connections produce clear, actionable error messages.
- [ ] All network requests are logged per-extension for auditability.
- [ ] Performance overhead for allowed requests is < 2ms.
- [ ] No known policy bypasses (e.g., DNS rebinding, IP literal, etc.).
- [ ] All 14 unit test categories pass.
- [ ] Security review: DNS rebinding and IP-based bypass attempts are mitigated.

---

## Phase 17: Process Sandboxing — `child_process`, `worker_threads`

### Goal

Control an extension's ability to spawn child processes and create worker threads. This is critical for security — an extension that can spawn `bash -c 'rm -rf /'` is not meaningfully sandboxed.

### Detailed Design

#### 17.1 — `child_process` Shim

Intercept `child_process.exec()`, `execSync()`, `spawn()`, `spawnSync()`, `fork()`, `execFile()`:

```ts
class SandboxedChildProcess {
    exec(command: string, options?: any): ChildProcess {
        // Check policy: is this extension allowed to spawn processes?
        // Check command against allowlist/denylist
        // If allowed: execute via supervisor (which runs the actual child_process)
        // If denied: throw
    }
}
```

#### 17.2 — Process Spawn Policy

```ts
interface ProcessPolicy {
    // Can this extension spawn any child processes?
    allowSpawn: boolean;
    // Allowed executables (if allowSpawn is true)
    allowedExecutables: string[];  // e.g., ['node', 'python3', 'git']
    // Denied executables
    deniedExecutables: string[];   // e.g., ['bash', 'sh', 'cmd', 'powershell']
    // Can this extension create worker_threads?
    allowWorkerThreads: boolean;
}
```

#### 17.3 — `worker_threads` Restriction

Prevent extensions from creating their own `worker_threads` (which would bypass the sandbox). Intercept `require('worker_threads')` to return a shim that either denies or proxies thread creation through the supervisor.

#### 17.4 — Process Output Redirection

Spawned child processes' `stdout`/`stderr` are captured and forwarded through the supervisor for logging and auditing.

### Unit Tests

1. **Spawn allowed**: Extension spawns `git status`. Process executes and returns output.
2. **Spawn denied**: Extension spawns `bash -c 'rm -rf /'`. Spawn is denied.
3. **Spawn with pipe**: Extension spawns a process with `stdio: 'pipe'` and reads output. Works.
4. **`execSync` allowed**: Synchronous execution of allowed command works.
5. **`execSync` denied**: Synchronous execution of denied command throws.
6. **`fork` denied**: `child_process.fork()` is denied (would bypass sandbox).
7. **`worker_threads` denied**: `require('worker_threads')` returns shim that denies `new Worker()`.
8. **Process spawn logging**: All spawn attempts are logged with command, args, and allow/deny status.
9. **Process kill**: Extension can kill a process it spawned.
10. **Policy: no processes**: With `allowSpawn: false`, all process creation is denied.
11. **Executable path resolution**: `exec('git')` resolves to `/usr/bin/git` and checks against the allowlist.
12. **Argument injection prevention**: `exec('git; rm -rf /')` is denied (shell command injection).

### Acceptance Criteria

- [ ] Extensions can spawn only explicitly allowed executables.
- [ ] Shell command injection is prevented.
- [ ] `child_process.fork()` is denied (prevents sandbox escape).
- [ ] Extensions cannot create their own `worker_threads`.
- [ ] All process creation is logged with extension ID and command.
- [ ] Sync and async process APIs work for allowed commands.
- [ ] All 12 unit test categories pass.
- [ ] Security review: no known sandbox escape via process spawning.

---

## Phase 18: Environment and Global State Isolation

### Goal

Isolate per-worker environment variables, `process.env`, global state (`globalThis`), and other process-wide Node.js APIs that could leak information between extensions.

### Detailed Design

#### 18.1 — `process.env` Virtualization

Each worker gets a virtualized `process.env`:

```ts
const virtualEnv = Object.create(null);
// Copy safe environment variables
for (const key of safeEnvKeys) {
    virtualEnv[key] = process.env[key];
}
// Add extension-specific variables
virtualEnv.EXTENSION_ID = extensionId;
virtualEnv.EXTENSION_PATH = extensionPath;
```

Sensitive variables (`HOME`, `USERPROFILE`, `SSH_AUTH_SOCK`, tokens, keys) are selectively included or excluded based on policy.

#### 18.2 — `process` Object Shim

Replace the worker's `process` global with a restricted version:

- `process.env` — virtualized (see above)
- `process.cwd()` — returns the extension's directory (not the supervisor's cwd)
- `process.exit()` — terminates only this worker (already the default for `worker_threads`)
- `process.pid` — returns the worker's thread ID (not the supervisor's pid)
- `process.argv` — sanitized
- `process.execPath` — allowed (read-only)
- `process.kill()` — denied (cannot kill other processes)
- `process.chdir()` — denied (would affect shared process state in `worker_threads`)

#### 18.3 — Global State Isolation

`worker_threads` already provide separate global scopes. However, some Node.js APIs share state:
- `require.cache` — already per-worker in `worker_threads`
- `setTimeout` / `setInterval` — already per-worker
- `console` — redirect to per-extension log channel

### Unit Tests

1. **Env isolation**: Worker A's `process.env.MY_VAR = 'a'` is not visible in Worker B.
2. **Sensitive env hidden**: `process.env.SSH_AUTH_SOCK` is not available in the worker.
3. **Extension-specific env**: `process.env.EXTENSION_ID` equals the extension's ID.
4. **`process.cwd()`**: Returns the extension's directory.
5. **`process.exit()`**: Terminates only the worker.
6. **`process.kill()` denied**: `process.kill(supervisorPid)` is denied.
7. **`process.chdir()` denied**: Throws "Not supported in sandboxed mode".
8. **Console redirection**: `console.log('test')` appears in the extension's log channel.
9. **`process.argv` sanitized**: Does not contain sensitive command-line arguments.
10. **Global scope isolation**: `globalThis.myFlag = true` in Worker A is not visible in Worker B.

### Acceptance Criteria

- [ ] Environment variables are isolated per-worker.
- [ ] Sensitive environment variables are not exposed to extensions.
- [ ] `process.cwd()` returns the extension's directory.
- [ ] `process.kill()` and `process.chdir()` are denied.
- [ ] Console output is routed to per-extension log channels.
- [ ] No information leakage between workers through global state.
- [ ] All 10 unit test categories pass.

---

## Phase 19: Capability Manifest and Permission Model

### Goal

Introduce a declarative permission model where extensions declare the capabilities they need in their `package.json`. The sandbox enforces these declarations.

### Detailed Design

#### 19.1 — Capability Declarations in `package.json`

```json
{
    "name": "my-extension",
    "capabilities": {
        "fileSystem": {
            "read": ["workspace", "extensionStorage"],
            "write": ["extensionStorage"]
        },
        "network": {
            "outbound": ["api.github.com:443", "*.npmjs.org:443"]
        },
        "process": {
            "spawn": ["git", "node"]
        },
        "environment": {
            "read": ["PATH", "HOME"]
        }
    }
}
```

#### 19.2 — Policy Resolution

The `CapabilityPolicyEngine` in the supervisor resolves the effective policy from:

1. **Extension manifest** — what the extension declares it needs
2. **User overrides** — user grants or denies additional capabilities via settings
3. **Workspace trust** — in untrusted workspaces, capabilities are restricted
4. **Extension trust level** — trusted (marketplace verified) vs. untrusted (sideloaded)

```ts
class CapabilityPolicyEngine {
    resolvePolicy(
        extension: IExtensionDescription,
        userOverrides: CapabilityOverrides,
        workspaceTrust: boolean,
    ): ResolvedPolicy

    checkCapability(
        extensionId: ExtensionIdentifier,
        capability: string,
        details: any
    ): { allowed: boolean; reason: string }
}
```

#### 19.3 — Backward Compatibility

Existing extensions without `capabilities` declarations get a **permissive default policy** that allows everything (matching current behavior). The sandbox enforces restrictions only when:
- The extension declares capabilities (opt-in), or
- The user/admin explicitly restricts the extension via settings, or
- The extension is untrusted (sideloaded, unsigned)

This ensures zero breaking changes for existing extensions.

### Unit Tests

1. **Manifest parsing**: `capabilities` field in `package.json` is correctly parsed.
2. **Policy resolution with manifest**: Extension with declared capabilities gets a matching policy.
3. **Policy resolution without manifest**: Extension without capabilities gets permissive policy.
4. **User override grant**: User grants `network` capability to an extension that didn't declare it.
5. **User override deny**: User denies `process.spawn` for an extension that declared it.
6. **Workspace trust restriction**: In untrusted workspace, `process.spawn` is denied even if declared.
7. **Trusted extension**: Marketplace-verified extension gets permissive defaults.
8. **Untrusted extension**: Sideloaded extension gets restrictive defaults.
9. **Capability check — allowed**: `checkCapability('network', { host: 'api.github.com' })` returns allowed.
10. **Capability check — denied**: `checkCapability('network', { host: 'evil.com' })` returns denied.
11. **Policy serialization**: Policy can be serialized and sent to workers.
12. **Multiple extensions, different policies**: Extensions A and B have different policies; both enforced correctly.

### Acceptance Criteria

- [ ] Extensions can declare capabilities in `package.json`.
- [ ] The `CapabilityPolicyEngine` resolves policies correctly from manifest + user + trust.
- [ ] Backward compatibility: extensions without capabilities work unchanged.
- [ ] User can override capabilities via settings.
- [ ] Workspace trust affects capability resolution.
- [ ] All 12 unit test categories pass.
- [ ] Policy engine has no logical errors (formally verified policy resolution).

---

## Phase 20: Permission Prompting UI

### Goal

When an extension attempts an operation that requires a capability it hasn't been granted, the user is prompted to allow or deny. Similar to mobile app permission prompts.

### Detailed Design

#### 20.1 — Permission Prompt Flow

```
1. Worker calls sandboxed API (e.g., fetch('https://evil.com'))
2. Supervisor's policy engine: not allowed, prompt user
3. Supervisor notifies main thread: "Extension X wants to access evil.com"
4. Main thread shows notification:
   ┌──────────────────────────────────────────────┐
   │  Extension "My Extension" wants to access     │
   │  https://evil.com                             │
   │                                               │
   │  [Allow Once] [Allow Always] [Deny] [Details] │
   └──────────────────────────────────────────────┘
5. User response → Supervisor allows or denies the operation
6. If "Allow Always" → persist in settings for this extension
```

#### 20.2 — Permission Persistence

User decisions are stored in the configuration:

```json
{
    "extensions.capabilities.overrides": {
        "publisher.extension-id": {
            "network.outbound": {
                "api.github.com": "allow",
                "evil.com": "deny"
            }
        }
    }
}
```

#### 20.3 — Timeout Handling

If the user doesn't respond within 30 seconds, the operation is denied by default (fail-closed).

### Unit Tests

1. **Prompt triggered**: Denied operation triggers a prompt notification.
2. **Allow once**: User clicks "Allow Once". Operation succeeds. Next identical request prompts again.
3. **Allow always**: User clicks "Allow Always". Operation succeeds. Next identical request auto-allows.
4. **Deny**: User clicks "Deny". Operation fails. Extension receives permission error.
5. **Timeout**: User doesn't respond. Operation denied after timeout.
6. **Persistence**: "Allow Always" persists across VS Code restarts.
7. **Multiple prompts**: Two different denied operations trigger two separate prompts.
8. **Prompt rate limiting**: Extension rapidly triggering 100 denied operations doesn't spam 100 prompts.
9. **UI appearance**: Prompt notification has correct text, extension name, and buttons.
10. **Settings management**: User can review and revoke granted permissions in settings.

### Acceptance Criteria

- [ ] Permission prompts appear when extensions attempt denied operations.
- [ ] "Allow Once", "Allow Always", and "Deny" all function correctly.
- [ ] Persistent permissions survive VS Code restarts.
- [ ] Prompt rate limiting prevents notification spam.
- [ ] Timeout defaults to deny (fail-closed).
- [ ] All 10 unit test categories pass.

---

## Phase 21: Resource Accounting and Quotas

### Goal

Track per-extension CPU time, memory usage, and I/O operations. Enforce configurable quotas.

### Detailed Design

#### 21.1 — CPU Time Tracking

Use `worker.performance.eventLoopUtilization()` (Node.js API) to track how much CPU each worker consumes:

```ts
class ResourceAccountant {
    getCpuUsage(extensionId: ExtensionIdentifier): { active: number; idle: number; utilization: number }
    getMemoryUsage(extensionId: ExtensionIdentifier): { heapUsed: number; heapTotal: number; external: number }
    getIoStats(extensionId: ExtensionIdentifier): { reads: number; writes: number; bytesRead: number; bytesWritten: number }
}
```

#### 21.2 — Quota Enforcement

```ts
interface ResourceQuota {
    maxHeapMB: number;           // e.g., 512
    maxCpuPercent: number;       // e.g., 80 (80% of one core)
    maxFsReadsPerMinute: number; // e.g., 1000
    maxNetRequestsPerMinute: number; // e.g., 100
}
```

When a quota is exceeded:
1. Warning logged
2. Notification to user: "Extension X is using excessive resources"
3. If sustained: extension is throttled or terminated

#### 21.3 — Resource Dashboard Integration

Surface per-extension resource metrics in the Running Extensions view:
- CPU usage bar
- Memory usage bar
- I/O rate
- Network requests count

### Unit Tests

1. **CPU tracking**: Worker doing CPU-intensive work shows high CPU utilization.
2. **Memory tracking**: Worker allocating large arrays shows increased heap usage.
3. **I/O tracking**: Worker reading files shows increasing read count.
4. **Memory quota exceeded**: Worker exceeding heap limit triggers warning.
5. **CPU quota exceeded**: Worker pegging CPU triggers warning.
6. **I/O rate limit**: Worker exceeding fs reads/minute triggers throttling.
7. **Network rate limit**: Worker exceeding network requests/minute triggers throttling.
8. **Metrics accuracy**: CPU utilization matches expected values within 10%.
9. **Idle worker**: Worker doing nothing shows near-zero resource usage.
10. **Resource cleanup on terminate**: Terminated worker's resources are freed and metrics zeroed.

### Acceptance Criteria

- [ ] Per-extension CPU, memory, and I/O metrics are collected accurately.
- [ ] Resource quotas are enforced with configurable thresholds.
- [ ] Quota violations produce user-visible warnings.
- [ ] Running Extensions view shows per-extension resource metrics.
- [ ] Resource tracking overhead is < 1% CPU.
- [ ] All 10 unit test categories pass.

---

## Phase 22: Worker Crash Recovery and Restart

### Goal

When a worker crashes (unhandled exception, out-of-memory, explicit `process.exit()`), the supervisor automatically restarts it with configurable retry policy.

### Detailed Design

#### 22.1 — Crash Handling

```ts
class WorkerCrashHandler {
    constructor(
        private readonly _workerRegistry: WorkerRegistry,
        private readonly _retryPolicy: RetryPolicy,
    )

    // Called when a worker exits unexpectedly
    handleCrash(extensionId: ExtensionIdentifier, exitCode: number, error?: Error): void {
        // 1. Log the crash with full details
        // 2. Reject all pending RPC calls to this worker
        // 3. Notify main thread (show notification)
        // 4. If retries remaining: schedule restart after backoff
        // 5. If retries exhausted: disable extension
    }
}
```

#### 22.2 — Retry Policy

```ts
interface RetryPolicy {
    maxRetries: number;          // e.g., 3
    backoffMs: number[];         // e.g., [1000, 5000, 30000]
    resetAfterMs: number;        // e.g., 300000 (reset retry count after 5 min stable)
}
```

#### 22.3 — State Recovery

On restart, the supervisor:
1. Re-sends the extension's `IExtensionDescription` to the new worker.
2. Re-sends current document mirrors.
3. Re-registers the extension's providers with the main thread.
4. Calls `activate()` again.
5. **Does not** restore in-memory state (extension must handle this via `globalState`/`workspaceState`).

### Unit Tests

1. **Worker crash detection**: Worker throws unhandled exception. Supervisor detects the crash.
2. **Pending calls rejected**: Pending RPC calls to the crashed worker are rejected with clear errors.
3. **Auto-restart**: Worker crashes. Supervisor restarts it after backoff.
4. **Retry limit**: Worker crashes 4 times (max 3 retries). Extension is disabled.
5. **Backoff timing**: Retry delays match the configured backoff schedule.
6. **Reset after stability**: Worker runs stably for 5 minutes. Retry count resets to 0.
7. **State re-sync**: After restart, worker has correct document state and workspace folders.
8. **Provider re-registration**: After restart, extension's language providers work again.
9. **Notification**: User sees "Extension X crashed and was restarted" notification.
10. **Crash telemetry**: Crash events are logged with extension ID, exit code, and error details.

### Acceptance Criteria

- [ ] Worker crashes are detected and handled within 1 second.
- [ ] Workers auto-restart with configurable backoff.
- [ ] After restart, extension re-activates and functions correctly.
- [ ] Retry limits prevent infinite crash loops.
- [ ] Users are notified of crashes and restarts.
- [ ] Other workers are completely unaffected by a crash.
- [ ] All 10 unit test categories pass.

---

## Phase 23: Extension Exports Membrane — Advanced

### Goal

Extend the basic membrane (Phase 9) to support events, class instances, iterators, and deeply nested exports objects.

### Detailed Design

#### 23.1 — Event Proxying

Extension exports often include events:

```ts
// Extension B's exports
export interface API {
    onDidChange: Event<ChangeEvent>;
    someMethod(): Promise<void>;
}
```

The membrane must proxy event subscriptions:

```ts
// When extension A does:
const extB = vscode.extensions.getExtension('ext-b');
extB.exports.onDidChange(e => { /* handle */ });

// The membrane:
// 1. Sends a subscription request to Worker B
// 2. Worker B registers the listener on the real event
// 3. When the event fires in Worker B, Worker B sends the event data to the supervisor
// 4. Supervisor routes it to Worker A
// 5. Worker A invokes A's callback
```

#### 23.2 — Class Instance Proxying

For class instances in exports, the membrane creates a remote handle:

```ts
// Extension B exports a class instance
// The membrane creates a proxy where every method call is RPC

const proxy = new Proxy(target, {
    get(obj, prop) {
        if (typeof prop === 'string') {
            return (...args: any[]) => connection.request('$invokeMethod', [handleId, prop, args]);
        }
    }
});
```

#### 23.3 — Iterator and AsyncIterator Support

For exports returning iterators (`Symbol.iterator`) or async iterators (`Symbol.asyncIterator`), the membrane wraps them in remote iteration protocols.

#### 23.4 — Garbage Collection and Handle Lifecycle

Remote handles must be garbage-collected when no longer referenced. Use `FinalizationRegistry` to detect when a proxy is GC'd, then notify the owning worker to release the real object.

### Unit Tests

1. **Event proxying**: Extension A subscribes to extension B's exported event. Event fires in B. A's callback runs.
2. **Event unsubscription**: Extension A unsubscribes. Event fires in B. A's callback does NOT run.
3. **Class method proxying**: Extension A calls a method on B's exported class instance. Method runs in B.
4. **Class property access**: Extension A reads a property on B's exported class instance. Property value is returned.
5. **Nested objects**: Extension B's exports has `{ a: { b: { c: () => 42 } } }`. Extension A calls `extB.exports.a.b.c()` and gets `42`.
6. **Iterator proxying**: Extension B exports a method returning an iterator. Extension A iterates it.
7. **AsyncIterator proxying**: Extension B exports an async generator. Extension A iterates it with `for await`.
8. **Handle cleanup**: Proxy in A is GC'd. B's real object is eventually released.
9. **Multiple event listeners**: Extensions A and C both subscribe to B's event. Both receive events.
10. **Event with complex payload**: Event carries complex objects (URIs, Ranges). Serialization works.

### Acceptance Criteria

- [ ] Extension exports with events, methods, properties, and nested objects all work through the membrane.
- [ ] Event subscriptions/unsubscriptions proxy correctly with no leaks.
- [ ] Class instances are usable through the membrane.
- [ ] Remote handles are cleaned up when proxies are garbage-collected.
- [ ] Iterator and async iterator patterns work.
- [ ] All 10 unit test categories pass.

---

## Phase 24: Full Network Containment (Option B)

### Goal

Move from policy-only network interception (Phase 16) to **full network proxying** where the worker has zero direct network access. All network I/O flows through the supervisor.

### Detailed Design

#### 24.1 — Worker Network Isolation

The worker thread is configured with no direct network access:
- All socket creation is intercepted at the `net.Socket` level
- The shim creates a `MessagePort`-based tunnel to the supervisor
- The supervisor performs the actual network I/O
- Data flows: Worker → MessagePort → Supervisor → Real Socket → Network

#### 24.2 — Supervisor Network Proxy

```ts
class NetworkProxy {
    // Create a proxied connection
    createConnection(
        extensionId: ExtensionIdentifier,
        options: { host: string; port: number; protocol: string }
    ): ProxiedSocket

    // ProxiedSocket bridges MessagePort ↔ real socket
}
```

#### 24.3 — Performance Optimization

For high-throughput connections, use `SharedArrayBuffer` for data transfer between worker and supervisor to avoid MessagePort serialization overhead.

### Unit Tests

1. **HTTP request through proxy**: `http.get('http://example.com')` works through the supervisor proxy.
2. **HTTPS request through proxy**: TLS handshake works correctly through the proxy.
3. **WebSocket through proxy**: WebSocket connections work through the proxy.
4. **Large data transfer**: 100MB file download through the proxy completes without corruption.
5. **Concurrent connections**: 50 concurrent connections from one worker all work.
6. **Connection timeout**: Proxy handles connection timeouts correctly.
7. **Connection close**: Closing a proxied connection cleans up both sides.
8. **Error propagation**: Network errors (DNS failure, connection refused) are correctly propagated.
9. **No direct access**: Worker cannot bypass the proxy (verified by attempting raw socket creation).
10. **Performance**: HTTP request latency overhead is < 20ms vs. direct connection.

### Acceptance Criteria

- [ ] Workers have zero direct network access.
- [ ] All network I/O flows through the supervisor proxy.
- [ ] HTTP, HTTPS, WebSocket, and raw TCP connections work through the proxy.
- [ ] Large data transfers work without corruption.
- [ ] Performance overhead is acceptable (< 20ms per request).
- [ ] No known bypass mechanisms.
- [ ] All 10 unit test categories pass.

---

## Phase 25: Running Extensions View Integration

### Goal

Surface per-extension isolation status, resource usage, permissions, and sandbox health in the Running Extensions view and extension details page.

### Detailed Design

#### 25.1 — Running Extensions View Columns

Add columns to the Running Extensions view:

| Column | Data |
|---|---|
| Isolation | "Shared" / "Isolated Worker" / "Separate Process" |
| Status | "Running" / "Activating" / "Unresponsive" / "Crashed" |
| CPU | CPU utilization percentage |
| Memory | Heap size in MB |
| Permissions | Summary of granted capabilities |

#### 25.2 — Extension Details

The extension details page shows:
- Isolation mode and policy
- Granted and denied capabilities
- Resource usage history (sparkline)
- Crash history
- Permission override controls

### Unit Tests

1. **View shows isolation status**: Isolated extension shows "Isolated Worker" in the view.
2. **View shows resource usage**: CPU and memory columns populate correctly.
3. **Unresponsive indicator**: Unresponsive extension shows correct status.
4. **Crashed indicator**: Crashed extension shows correct status.
5. **Permission summary**: Granted capabilities are listed.
6. **Restart action**: "Restart Extension" action works from the view.
7. **Kill action**: "Kill Worker" action terminates the extension.
8. **Details page**: Extension details show correct isolation info.
9. **Permission overrides**: Can grant/deny capabilities from the details page.
10. **Shared host extensions**: Non-isolated extensions show "Shared" status.

### Acceptance Criteria

- [ ] Running Extensions view shows isolation status for each extension.
- [ ] Resource usage metrics are displayed and updated in real-time.
- [ ] Users can manage extension permissions from the UI.
- [ ] All statuses (running, unresponsive, crashed) are accurately reflected.
- [ ] All 10 unit test categories pass.

---

## Phase 26: Telemetry and Diagnostics

### Goal

Comprehensive telemetry for the isolation system: sandbox violations, resource usage, crash rates, latency overhead, permission prompts, and adoption metrics.

### Detailed Design

#### 26.1 — Telemetry Events

| Event | Data |
|---|---|
| `extension/sandbox/activated` | extensionId, isolationMode, activationTime |
| `extension/sandbox/violation` | extensionId, capability, target, action (deny/prompt) |
| `extension/sandbox/permission` | extensionId, capability, userDecision (allow/deny/timeout) |
| `extension/sandbox/crash` | extensionId, exitCode, errorMessage, retryCount |
| `extension/sandbox/unresponsive` | extensionId, durationMs, recovered |
| `extension/sandbox/resourceQuota` | extensionId, resource, usage, quota |
| `extension/sandbox/latency` | extensionId, operation, overhead_ms |
| `extension/sandbox/deadlock` | extensionIds, cycle |

#### 26.2 — Diagnostics Export

A "Export Sandbox Diagnostics" command that generates a report:

```
Sandbox Diagnostics Report
===========================
Generated: 2026-05-22T10:00:00Z

Extension: ms-python.python
  Isolation: WorkerIsolated
  Status: Running
  CPU: 12%, Memory: 156MB
  Sandbox violations: 3 (fs: 2, net: 1)
  Crashes: 0
  Permissions: fs.read(workspace), net(*.python.org)

Extension: user.untrusted-ext
  Isolation: WorkerIsolated
  Status: Running (restricted)
  Sandbox violations: 15 (net: 12, process: 3)
  Permissions: fs.read(workspace), fs.write(extensionStorage)
  Denied: net.outbound, process.spawn
```

### Unit Tests

1. **Activation telemetry**: Activating an isolated extension logs `extension/sandbox/activated`.
2. **Violation telemetry**: A denied `fs.readFile` logs `extension/sandbox/violation`.
3. **Permission telemetry**: User responding to a prompt logs `extension/sandbox/permission`.
4. **Crash telemetry**: Worker crash logs `extension/sandbox/crash`.
5. **Latency telemetry**: RPC overhead is measured and logged.
6. **Diagnostics export**: "Export Sandbox Diagnostics" produces a valid report.
7. **Telemetry privacy**: No file paths, file contents, or secrets in telemetry data.
8. **Telemetry rate limiting**: High-frequency violations don't flood telemetry.
9. **Aggregate metrics**: Summary metrics (total violations, total crashes) are tracked.
10. **Opt-out**: Telemetry respects the global telemetry opt-out setting.

### Acceptance Criteria

- [ ] All telemetry events are logged correctly.
- [ ] Diagnostics report is comprehensive and accurate.
- [ ] Telemetry contains no sensitive information.
- [ ] Telemetry is rate-limited to prevent flooding.
- [ ] All 10 unit test categories pass.

---

## Phase 27: Worker Pooling and Memory Optimization

### Goal

Optimize memory usage when many extensions are isolated. Implement worker pooling, lazy deactivation, and memory pressure handling.

### Detailed Design

#### 27.1 — Worker Pooling

When an extension is idle (no active providers, no pending commands) for a configurable duration, its worker can be suspended (deactivated and terminated) to free memory. Re-activation spawns a new worker.

```ts
class WorkerPool {
    private readonly _idleThresholdMs = 300000; // 5 minutes
    private readonly _maxActiveWorkers = 20;

    // When a worker becomes idle, start the idle timer
    // When max workers exceeded, evict least-recently-used idle workers
}
```

#### 27.2 — Shared Read-Only Modules

Multiple workers loading the same npm package (e.g., `vscode-languageclient`) can share read-only cached module bytecode via V8's code cache. The supervisor pre-compiles and distributes `ScriptCompiler.CachedData`.

#### 27.3 — Memory Pressure Handling

When system memory is low:
1. Terminate idle workers (most-idle first).
2. Reduce document mirror replication (only sync documents the extension actually uses).
3. Notify active workers to reduce caches.

### Unit Tests

1. **Idle worker eviction**: Worker idle for > threshold is terminated.
2. **Re-activation after eviction**: Evicted extension re-activates on demand.
3. **Max workers limit**: When limit is reached, oldest idle worker is evicted.
4. **LRU ordering**: Least-recently-used idle worker is evicted first.
5. **Active worker protected**: Worker with active providers is not evicted.
6. **Memory pressure handling**: Under memory pressure, idle workers are aggressively evicted.
7. **Pool metrics**: Pool reports active count, idle count, total memory.
8. **Rapid activation/deactivation**: Extension rapidly activated/deactivated 100 times doesn't leak.
9. **Code cache sharing**: Two workers loading the same module benefit from code cache.
10. **Graceful deactivation**: Idle worker's `deactivate()` is called before termination.

### Acceptance Criteria

- [ ] Idle workers are automatically evicted to free memory.
- [ ] Worker count stays within configurable limits.
- [ ] Evicted extensions re-activate transparently when needed.
- [ ] Memory usage scales sub-linearly with number of isolated extensions.
- [ ] All 10 unit test categories pass.

---

## Phase 28: Snapshot-Based Fast Restart

### Goal

Use V8 heap snapshots or startup snapshots to dramatically reduce worker startup time. Cold start of a worker with a typical extension takes < 100ms instead of 500ms+.

### Detailed Design

#### 28.1 — V8 Startup Snapshots

Create V8 startup snapshots that include the pre-initialized `vscode` API proxy, common `ExtHost*` services, and type converters. Each worker starts from this snapshot rather than executing all initialization code.

#### 28.2 — Module Pre-Compilation

Pre-compile the extension's main module and its dependencies into V8 bytecode. Store the bytecode in a cache directory. On subsequent starts, load bytecode directly.

#### 28.3 — Snapshot Invalidation

Snapshots are invalidated when:
- VS Code version changes
- Extension version changes
- Node.js version changes

### Unit Tests

1. **Snapshot creation**: Startup snapshot is created and stored.
2. **Snapshot loading**: Worker starts from snapshot successfully.
3. **Startup time improvement**: Worker with snapshot starts in < 100ms (vs. > 300ms without).
4. **Snapshot invalidation**: Version change triggers re-creation.
5. **Snapshot correctness**: Extension activated from snapshot behaves identically to cold start.
6. **Bytecode caching**: Pre-compiled module loads faster than source.
7. **Cache size**: Snapshot cache doesn't exceed configurable size limit.
8. **Parallel snapshot creation**: Creating snapshots for multiple extensions doesn't deadlock.
9. **Corruption recovery**: Corrupted snapshot is detected and re-created.
10. **Benchmark**: End-to-end activation with snapshot is 3-5x faster than without.

### Acceptance Criteria

- [ ] Worker startup time with snapshot is < 100ms.
- [ ] Snapshots are invalidated correctly on version changes.
- [ ] Extension behavior is identical with and without snapshots.
- [ ] Snapshot cache is bounded and managed.
- [ ] All 10 unit test categories pass.

---

## Phase 29: Cross-Host Isolation (Remote + Local)

### Goal

Ensure the isolation system works correctly when some extensions run locally and others run remotely (via the Remote extension host). The supervisor handles the topology transparently.

### Detailed Design

#### 29.1 — Multi-Supervisor Coordination

In a remote development scenario:
- Local supervisor manages locally isolated extensions
- Remote supervisor manages remotely isolated extensions
- The main thread coordinates between both supervisors

Commands and exports membrane work across the local/remote boundary, with the supervisor proxying through the main thread.

#### 29.2 — Remote Worker Considerations

Remote workers run in the remote machine's supervisor process. File system and network policies are relative to the remote machine.

### Unit Tests

1. **Local isolated + remote shared**: Local isolated extension calls command in remote shared host. Works.
2. **Local isolated + remote isolated**: Two isolated extensions on different machines. Cross-extension commands work.
3. **File system policy remote**: Remote worker's fs policy uses remote paths.
4. **Network policy remote**: Remote worker's network policy applies to remote machine's network.
5. **Latency**: Cross-host command adds expected network latency (measured, not optimized away).
6. **Reconnection**: After network disconnection and reconnection, cross-host commands resume.
7. **Remote crash**: Remote worker crash doesn't affect local workers.
8. **Extension location**: Extension correctly identifies whether it's running locally or remotely.
9. **Mixed activation**: Extension with local and remote activation events works.
10. **Resource metrics remote**: Remote worker's resource metrics are visible in local UI.

### Acceptance Criteria

- [ ] Isolation works correctly in remote development scenarios.
- [ ] Cross-host extension interaction (commands, exports) works.
- [ ] Policies are applied relative to the correct machine.
- [ ] Remote worker crashes are contained.
- [ ] All 10 unit test categories pass.

---

## Phase 30: Security Audit, Hardening, and Escape Prevention

### Goal

Comprehensive security audit of the entire isolation system. Identify and close all sandbox escape vectors. Engage security review.

### Detailed Design

#### 30.1 — Escape Vector Analysis

Systematically analyze every possible sandbox escape:

| Vector | Description | Mitigation |
|---|---|---|
| `eval()` / `Function()` | Dynamic code execution | Cannot be prevented without V8 modifications; accepted risk |
| `vm.runInThisContext()` | Execute code in current context | Intercept `vm` module; deny `runInThisContext` |
| `process.binding()` | Low-level Node.js bindings | Deny `process.binding` and `process._linkedBinding` |
| `require.resolve` path traversal | Resolve paths outside sandbox | Already mitigated in Phase 14 |
| `Module._load` override | Extension overrides the module loader | Freeze the module loader after initialization |
| `Object.getPrototypeOf` chain walking | Walk prototype chain to find non-shimmed objects | Use proper `Proxy` objects; don't leave real objects accessible |
| `SharedArrayBuffer` side channel | Timing side-channel attacks | Accepted risk (same as browser) |
| WASM | Execute arbitrary native code via WebAssembly | Intercept `WebAssembly.instantiate()`; policy-based |
| Native addons | C++ addons bypass all JS-level sandboxing | Detect and deny native addons in sandboxed mode |
| `inspector` module | V8 inspector can modify running code | Deny `inspector` module |
| `v8` module | V8 API access | Deny `v8` module (except `writeHeapSnapshot` if needed) |

#### 30.2 — Hardening Measures

1. **Freeze critical objects**: `Object.freeze(process)`, `Object.freeze(globalThis)` after initialization.
2. **Deny dangerous modules**: `vm`, `inspector`, `v8`, `perf_hooks` (selective), `trace_events`.
3. **Lock module loader**: After the extension is loaded, prevent modifications to `Module._load`, `Module._resolveFilename`.
4. **Prototype pollution protection**: Freeze `Object.prototype`, `Array.prototype`, `Function.prototype` in the worker.
5. **`eval` tracking**: Log all uses of `eval()` and `new Function()` for auditing.

#### 30.3 — Penetration Testing

Create a suite of "malicious extension" test cases that attempt various sandbox escapes:

- Path traversal via relative `require()`
- Process spawning via `child_process`
- Network access to blocked hosts
- File system access outside allowed paths
- Prototype pollution to access supervisor objects
- `process.binding('spawn_sync')` to bypass shims
- `WebAssembly` to execute native code
- `vm.runInThisContext` to escape the sandbox

### Unit Tests (Security Test Suite)

1. **Path traversal**: `require('../../supervisor')` is denied.
2. **Process binding bypass**: `process.binding('spawn_sync')` is denied.
3. **`_linkedBinding` bypass**: `process._linkedBinding('...')` is denied.
4. **Module loader override**: Modifying `Module._load` after init is denied.
5. **Prototype chain walk**: Walking from `Error.prototype` to `globalThis` doesn't reach unsandboxed objects.
6. **`vm.runInThisContext`**: Denied.
7. **`eval` tracking**: `eval('1+1')` is logged.
8. **Native addon loading**: Extension with a `.node` file is denied in sandbox mode.
9. **`inspector` module**: `require('inspector')` is denied.
10. **WASM without permission**: `WebAssembly.instantiate()` is denied when not permitted.
11. **`process.kill(1)`**: Cannot kill the supervisor process.
12. **`process.env` mutation visibility**: `process.env.SECRET = 'x'` is not visible in other workers.
13. **`fs.readFile('/etc/shadow')`**: Denied.
14. **DNS rebinding**: Connecting to a host that resolves to an internal IP is detected and denied.
15. **SharedArrayBuffer as covert channel**: Workers cannot communicate via SAB (supervisor controls all SAB creation).

### Acceptance Criteria

- [ ] All 15 security test cases pass (escapes are prevented).
- [ ] No known sandbox escape vectors remain unmitigated.
- [ ] Security review by at least 2 security engineers.
- [ ] Penetration test report with zero critical or high findings.
- [ ] All mitigations are documented in a security design document.
- [ ] Hardening measures do not break legitimate extension functionality.
- [ ] `eval()` and `new Function()` usage is tracked and logged.

---

## Phase 31: Extension Compatibility Testing at Scale

### Goal

Validate that the top 100 VS Code marketplace extensions work correctly in isolated mode. Build a compatibility test suite and CI pipeline.

### Detailed Design

#### 31.1 — Compatibility Test Framework

An automated test runner that:
1. Installs extensions from the marketplace.
2. Launches VS Code with the extension in isolated mode.
3. Activates the extension via its activation events.
4. Runs a basic smoke test (open file, trigger completions, run commands).
5. Captures any errors, sandbox violations, or crashes.

#### 31.2 — Compatibility Categories

| Category | Expected Outcome |
|---|---|
| Works perfectly | Extension functions identically to shared host |
| Works with warnings | Extension functions but triggers sandbox violations (logged) |
| Works with permission prompts | Extension requests capabilities (user prompted) |
| Incompatible | Extension uses unsandboxable APIs (native addons, etc.) |

#### 31.3 — Compatibility Dashboard

A CI-generated report showing per-extension compatibility status, updated on each VS Code build.

### Acceptance Criteria

- [ ] Compatibility test framework exists and runs in CI.
- [ ] Top 100 extensions are tested; results categorized.
- [ ] > 80% of top 100 extensions work in isolated mode without modifications.
- [ ] Incompatible extensions are identified with clear reasons.
- [ ] Compatibility report is generated and published.
- [ ] No regressions in extension behavior for compatible extensions.

---

## Phase 32: Documentation, API, and Extension Author Guide

### Goal

Comprehensive documentation for extension authors, VS Code administrators, and VS Code contributors.

### Deliverables

1. **Extension Author Guide**: "Making your extension sandbox-ready"
   - How capabilities work
   - How to declare capabilities in `package.json`
   - Common migration patterns (from `fs` to `workspace.fs`, from `child_process` to task API)
   - Testing in sandbox mode

2. **Administrator Guide**: "Managing extension isolation"
   - Configuring isolation policies
   - Managing permissions
   - Monitoring resource usage
   - Troubleshooting

3. **API Reference**: Updated `vscode` API docs with isolation notes
   - Which APIs are affected by sandbox restrictions
   - Alternatives for restricted APIs

4. **Architecture Document**: Updated VS Code architecture docs
   - Supervisor design
   - Worker lifecycle
   - Membrane design
   - Security model

### Acceptance Criteria

- [ ] Extension author guide covers all common scenarios.
- [ ] Administrator guide covers all configuration options.
- [ ] API reference notes are accurate and complete.
- [ ] Architecture document is reviewed by core team.
- [ ] All documentation is spell-checked and proofread.

---

## Appendix A: Full File Manifest

| Phase | New Files | Modified Files |
|---|---|---|
| 0 | `workerProtocol.ts`, `workerConnection.ts`, `workerConnectionClient.ts`, `workerRegistry.ts` + tests | — |
| 1 | `workerIsolatedExtensionHost.ts` (stub) | `extensionHostKind.ts`, `extensionRunningLocation.ts`, `extensionRunningLocationTracker.ts`, `extensionHostKindPicker.ts`, `extensionService.ts`, `abstractExtensionService.ts` |
| 2 | `supervisorProcess.ts`, `supervisorMain.ts` + tests | `workerIsolatedExtensionHost.ts` |
| 3 | `extensionWorkerBootstrap.ts`, `workerExtHostCommands.ts`, `workerExtHostMessageService.ts`, `workerApiFactory.ts` + tests | `supervisorMain.ts` |
| 4 | `supervisorCommandRouter.ts` + tests | `supervisorMain.ts`, `extensionWorkerBootstrap.ts` |
| 5 | `eventMulticaster.ts` + tests | `supervisorMain.ts`, `extensionWorkerBootstrap.ts` |
| 6 | `documentMirrorDistributor.ts` + tests | `supervisorMain.ts`, `extensionWorkerBootstrap.ts` |
| 7 | `workerExtHostLanguageFeatures.ts` + tests | `supervisorMain.ts` |
| 8 | `workerExtHostConfiguration.ts`, `workerExtHostWorkspace.ts` + tests | `supervisorMain.ts` |
| 9 | `exportsAnalyzer.ts`, `membraneProxy.ts`, `membraneManager.ts` + tests | `supervisorMain.ts`, `extensionWorkerBootstrap.ts` |
| 10 | `workerExtHostOutputChannel.ts`, `workerExtHostDiagnostics.ts`, `workerExtHostStatusBar.ts` + tests | `supervisorMain.ts` |
| 11 | `workerExtHostDebug.ts`, `workerExtHostTask.ts`, `workerExtHostTerminal.ts` + tests | `supervisorMain.ts` |
| 12 | `perWorkerWatchdog.ts` + tests | `supervisorMain.ts` |
| 13 | `deadlockDetector.ts` + tests | `supervisorMain.ts` |
| 14 | `sandboxModuleLoader.ts`, `shimRegistry.ts` + tests | `extensionWorkerBootstrap.ts` |
| 15 | `sandbox/sandboxedFs.ts`, `sandbox/syncBridge.ts`, `sandbox/fsPolicy.ts` + tests | `sandboxModuleLoader.ts` |
| 16 | `sandbox/sandboxedNet.ts`, `sandbox/sandboxedFetch.ts`, `sandbox/networkPolicy.ts` + tests | `sandboxModuleLoader.ts` |
| 17 | `sandbox/sandboxedChildProcess.ts`, `sandbox/processPolicy.ts` + tests | `sandboxModuleLoader.ts` |
| 18 | `sandbox/sandboxedProcess.ts`, `sandbox/envVirtualizer.ts` + tests | `extensionWorkerBootstrap.ts` |
| 19 | `capabilityPolicyEngine.ts`, `capabilityManifest.ts` + tests | `supervisorMain.ts`, `sandboxModuleLoader.ts` |
| 20 | `permissionPromptService.ts` + tests | `capabilityPolicyEngine.ts` |
| 21 | `resourceAccountant.ts` + tests | `supervisorMain.ts` |
| 22 | `workerCrashHandler.ts` + tests | `supervisorMain.ts`, `workerRegistry.ts` |
| 23 | `membraneEventProxy.ts`, `membraneClassProxy.ts`, `membraneIterator.ts` + tests | `membraneProxy.ts` |
| 24 | `sandbox/networkProxy.ts`, `sandbox/proxiedSocket.ts` + tests | `sandbox/sandboxedNet.ts` |
| 25 | UI files in `contrib/extensions/browser/` + tests | `extensionsViewlet.ts` |
| 26 | `sandboxTelemetry.ts` + tests | `supervisorMain.ts` |
| 27 | `workerPool.ts` + tests | `workerRegistry.ts` |
| 28 | `snapshotManager.ts`, `bytecodeCache.ts` + tests | `extensionWorkerBootstrap.ts` |
| 29 | — + tests | `supervisorMain.ts`, `workerIsolatedExtensionHost.ts` |
| 30 | `test/security/` suite | Various hardening changes |
| 31 | `test/compatibility/` framework | CI configuration |
| 32 | Documentation files | — |

---

## Appendix B: Risk Matrix

| Risk | Likelihood | Impact | Mitigation | Phase |
|---|---|---|---|---|
| Native addons break in workers | High | Medium | Detect and route to process isolation | 14 |
| `readFileSync` via SAB deadlocks | Medium | High | Timeout on `Atomics.wait`; diagnostic logging | 15 |
| Membrane breaks existing extensions | High | High | Start with commands-only; add membrane incrementally | 9, 23 |
| RPC overhead degrades UX | Medium | High | Measure latency budgets; use `Transferable`; consider direct `MessagePort` | All |
| Memory overhead of many workers | High | Medium | Worker pooling; idle eviction; code cache sharing | 27 |
| Sandbox escape via undiscovered vector | Low | Critical | Defense-in-depth; security audit; penetration testing | 30 |
| Extension compatibility < 80% | Medium | High | Compatibility testing; opt-in rollout; permissive defaults | 31 |
| `worker_threads` crash takes all workers | Medium | Medium | Process-level isolation fallback for critical extensions | 22 |
| Circular dependencies cause deadlocks | Low | Medium | Deadlock detection with cycle-breaking | 13 |
| `process.env` leaks sensitive data | Medium | High | Env virtualization from the start | 18 |

---

## Appendix C: Success Metrics

| Metric | Target | Phase |
|---|---|---|
| Worker cold start time | < 200ms | 3, 28 |
| RPC round-trip overhead | < 2ms | 0, 4 |
| Provider invocation overhead | < 10ms | 7 |
| Memory per idle worker | < 30MB | 27 |
| Extension compatibility (top 100) | > 80% | 31 |
| Unresponsive detection time | < 12s | 12 |
| Crash recovery time | < 3s | 22 |
| Zero sandbox escapes in security audit | 0 critical/high findings | 30 |
| Permission prompt response time | < 30s (timeout) | 20 |
| Deadlock detection latency | < 1ms | 13 |

---

## Appendix D: Glossary

| Term | Definition |
|---|---|
| **Supervisor** | The process that manages worker threads; implements `IExtensionHost` from the main thread's perspective |
| **Worker** | A `worker_thread` running a single extension |
| **Membrane** | A proxy layer that makes cross-worker object access transparent |
| **Shim** | A drop-in replacement for a Node.js built-in module that routes through the sandbox |
| **Capability** | A declared permission (fs, network, process, etc.) that an extension requests |
| **Policy** | The effective set of allowed capabilities for an extension, resolved from manifest + user + trust |
| **Inner RPC** | The RPC protocol between worker and supervisor (via `MessagePort`) |
| **Outer RPC** | The existing RPC protocol between supervisor and main thread |
| **Handle** | A reference ID for a remote object (function, event, class instance) in the membrane |
| **Wait-for graph** | A directed graph tracking which extensions are waiting for responses from which other extensions |
