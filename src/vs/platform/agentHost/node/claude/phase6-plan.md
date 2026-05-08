# Phase 6 Implementation Plan — `ClaudeAgent` real `sendMessage` (single-turn, no tools)

> **Handoff plan** — written to be executed by an agent with no prior conversation context. All file paths and line citations are verified against the workspace at synthesis time. Cross-reference [roadmap.md](./roadmap.md) before committing exact phase numbers.

> **Status note (post-Phase 6.5 design — Phase 6.1 Cycle G).** The throw inside `createSession({ fork })` references `sdk.getSessionMessages` as the lookup mechanism, reflecting the originally-planned lazy-walk approach. **Phase 6.5 ships the contract-based persisted-mapping approach instead** — the `protocolTurnId → lastSdkMessageUuid` mapping is captured by Phase 13's result-message mapper on every `type:'result'` ingest and stored in the session-data DB; fork performs an O(1) DB lookup, not a JSONL walk. See [roadmap.md §"Phase 6.5 — Fork"](./roadmap.md) and [CONTEXT.md M9 fork sub-flow](./CONTEXT.md) for the canonical contract.

## 1. Goal

Replace [claudeAgent.ts](claudeAgent.ts)'s `sendMessage` stub with a real implementation that streams a single assistant turn (no tool execution) from the Claude SDK back to the workbench client as `AgentSignal`s. Introduce the **provisional / materialize** lifecycle pattern that Phase 5 deliberately deferred: `createSession` returns immediately with `provisional: true`, the SDK subprocess fork happens lazily on the first `sendMessage`, and `onDidMaterializeSession` fires once the SDK init handshake completes.

**Phase 6 deliverable:** the workbench's "smallest test stream" — `message_start → content_block_start → content_block_delta → content_block_stop → message_delta(usage) → message_stop → result` — flows end-to-end through `ClaudeProxyService → SDK subprocess → mapper → AgentSignal`. A user typing "hi" sees streamed assistant text appear incrementally.

**Out of scope (deferred):**

- **Fork** is **Phase 6.5** (separate stacked PR). The Phase-5 fork stub stays, the throw message updates from `TODO: Phase 6` to `TODO: Phase 6.5`. See §8 for the deferred decisions.
- Tools (Phase 7) — `canUseTool` returns `{ behavior: 'deny', message: '...' }` as a Phase-6 stub. The mapper has a defense-in-depth skip+warn for any `tool_use` block that leaks through.
- Edits (Phase 8), abort/steering/changeModel (Phase 9), client tools (Phase 10), customizations (Phase 11), subagents (Phase 12), restoration (Phase 13).

**Exit criteria:**

1. A workbench client creates a non-fork Claude session and the response carries `provisional: true`. No SDK subprocess has been forked. No `sessionAdded` notification has fired yet.
2. The first `sendMessage` materializes the session: SDK subprocess forks, init handshake completes, `onDidMaterializeSession` fires, `AgentService` dispatches the deferred `sessionAdded` notification. The user's prompt is delivered to the SDK.
3. Streaming `assistant` content appears in the workbench as `SessionResponsePart(Markdown)` followed by per-token `SessionDelta` signals. `result` triggers `SessionUsage` then `SessionTurnComplete` in that order.
4. A second `sendMessage` on the same materialized session reuses the existing Query (no second `startup()` call). `_isResumed` flips to `true` after the first `system:init`.
5. Disposing a materialized session aborts the SDK subprocess cleanly (no orphan processes). Disposing a still-provisional session is a cheap map removal.
6. `createSession({ fork })` throws `TODO: Phase 6.5`.
7. The proxy-backed integration test (real `ClaudeProxyService` + real `@anthropic-ai/claude-agent-sdk` + stubbed `ICopilotApiService`) passes end-to-end against a canned Anthropic stream.

## 2. Files to create / modify

| Action | File | Purpose |
|---|---|---|
| **Modify** | [claudeAgentSdkService.ts](claudeAgentSdkService.ts) | Add `startup({ options }): Promise<WarmQuery>` to `IClaudeSdkBindings` and `IClaudeAgentSdkService`. Phase-5 surface (`listSessions`) preserved. (`getSessionMessages` and `forkSession` are added in Phase 6.5, NOT Phase 6.) |
| **Major rewrite** | [claudeAgentSession.ts](claudeAgentSession.ts) | Phase-5 minimum (~30 lines) → Phase-6 Query owner (~300 lines): `_query: Query`, `_abortController: AbortController`, prompt iterable (`_createPromptIterable`), `_pendingPromptDeferred: DeferredPromise<void>`, `_inFlightRequests: QueuedRequest[]`, `_isResumed: boolean`, `_currentBlockParts: Map<number, string>`, `_fatalError: Error \| undefined`. Methods: `send`, `_processMessages`, `dispose`. |
| **Modify** | [claudeAgent.ts](claudeAgent.ts) | Add `_provisionalSessions: Map<string, IClaudeProvisionalSession>`, `_onDidMaterializeSession: Emitter`, `_sessionSequencer: SequencerByKey<string>` (separate from Phase-5's `_disposeSequencer`). Add constructor dependency `@IAgentHostGitService` (resolved as `_gitService`) for `projectFromCopilotContext` lookups during `createSession`. Add helper imports: `rgPath` from `@vscode/ripgrep`, `delimiter` from `../../../../base/common/path.js`. Replace `sendMessage` stub. Make non-fork `createSession` return `provisional: true`. Add `_materializeProvisional`. Update fork branch error: `TODO: Phase 6` → `TODO: Phase 6.5`. Extend `shutdown()` to drain `_provisionalSessions` before the existing `_sessions` drain. |
| **Create** | [claudeMapSessionEvents.ts](claudeMapSessionEvents.ts) | Pure helper: `SDKMessage → AgentSignal[]`. Markdown/reasoning part allocation. Defense-in-depth skip+warn for `tool_use`. Mirrors Copilot's `mapSessionEvents.ts`. |
| **Create** | [claudePromptResolver.ts](claudePromptResolver.ts) | Pure helper: `(prompt: string, attachments?: IAgentAttachment[]) → Anthropic.ContentBlockParam[]`. Builds `<system-reminder>` block for file/selection references. |
| **Modify** | [/package.json](../../../../../../package.json) | No version change — `@anthropic-ai/claude-agent-sdk@0.2.112` already pinned by Phase 5. |
| **Modify** | [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts) | Extend `FakeClaudeAgentSdkService` with `startup()`, `nextQueryMessages`, `queryAdvance`, `capturedStartupOptions`, `startupRejection`. Add `FakeWarmQuery` and `FakeQuery` helpers. Add the 15 Phase-6 unit cases in §5. |
| **Create** | [../../test/node/claudeAgent.integration.test.ts](../../test/node/claudeAgent.integration.test.ts) | Single proxy-backed integration test (real `ClaudeProxyService` + real SDK + stubbed `ICopilotApiService`). Roadmap explicit requirement ([roadmap.md L532](roadmap.md#L532)). |

## 3. Implementation spec

### 3.1 SDK service: add `startup()`

Phase 5's `IClaudeSdkBindings` and `IClaudeAgentSdkService` expose **only** `listSessions`. Phase 6 adds the **session-creation** surface, `startup()`. Phase 6.5 will later add `getSessionMessages` and `forkSession`. Per the SDK at [sdk.d.ts:4550](../../../../../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts) `startup({ options, initializeTimeoutMs? })` forks the subprocess and **completes the init handshake** before returning a `WarmQuery`. Then `warm.query(promptIterable)` binds the prompt and returns a `Query`. This is a strict upgrade over the production extension's `query({ prompt, options })` flow at [`claudeCodeAgent.ts:487`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts#L487) — `startup()` was added after the extension shipped, and agent host is greenfield. The split lets us **fire `onDidMaterializeSession` only after the subprocess fork + init succeeded**, avoiding any phantom-session class of bug.

```ts
// claudeAgentSdkService.ts (extension)

export interface IClaudeSdkBindings {
    listSessions(options?: ListSessionsOptions): Promise<SDKSessionInfo[]>;
    /**
     * Pre-warms the SDK subprocess and runs the init handshake. Returns a
     * `WarmQuery` whose `.query(promptIterable)` binds the prompt iterable
     * and returns a streaming `Query`. Aborting `options.abortController`
     * either rejects this promise (if init is in flight) or causes the
     * resulting Query to clean up resources (sdk.d.ts:982).
     */
    startup(params: { options: Options; initializeTimeoutMs?: number }): Promise<WarmQuery>;
}

export interface IClaudeAgentSdkService {
    readonly _serviceBrand: undefined;
    listSessions(): Promise<readonly SDKSessionInfo[]>;
    startup(params: { options: Options; initializeTimeoutMs?: number }): Promise<WarmQuery>;
    // getSessionMessages + forkSession added in Phase 6.5
}
```

`ClaudeAgentSdkService.startup` is a thin pass-through to the lazily-imported SDK module — `await this._loadSdk()` then `sdk.startup(params)`. No additional state.

### 3.2 `IClaudeProvisionalSession` + provisional state on `ClaudeAgent`

Mirrors CopilotAgent's `IProvisionalSession` at [`copilotAgent.ts:67-82`](../copilot/copilotAgent.ts#L67-L82) plus an `AbortController` for the Q8 shutdown-during-materialize race.

```ts
// claudeAgent.ts (additions)

interface IClaudeProvisionalSession {
    readonly sessionId: string;
    readonly sessionUri: URI;
    readonly workingDirectory: URI;
    /**
     * Per-session AbortController. Wired into `Options.abortController`
     * during materialization. On materialize success, ownership transfers
     * to the new `ClaudeAgentSession` (which registers
     * `toDisposable(() => abortController.abort())`). Until then, `shutdown`
     * iterates `_provisionalSessions` and calls `abort()` directly to
     * unblock any in-flight `await sdk.startup()`. See §3.4.
     */
    readonly abortController: AbortController;
    /** Eagerly resolved at create time so the summary renders. */
    readonly project: IAgentSessionProjectInfo | undefined;
}

private readonly _provisionalSessions = new Map<string, IClaudeProvisionalSession>();

private readonly _onDidMaterializeSession = this._register(new Emitter<IAgentMaterializeSessionEvent>());
readonly onDidMaterializeSession = this._onDidMaterializeSession.event;

/**
 * Per-session sequencer for first-message materialization and subsequent
 * sends. SEPARATE from Phase-5's `_disposeSequencer` because they
 * serialize different concerns: `_disposeSequencer` linearizes teardown,
 * `_sessionSequencer` linearizes turn-driving. Mirrors CopilotAgent
 * (`copilotAgent.ts:265`).
 */
private readonly _sessionSequencer = new SequencerByKey<string>();
```

`AgentService` already understands this protocol — see [`agentService.ts:154-160, 334-360`](../agentService.ts#L334-L360):
- If the agent provider's `IAgentCreateSessionResult.provisional === true`, AgentService creates the session in the state manager **with `emitNotification: false`**, defers `sessionAdded`, and skips the `SessionReady` lifecycle dispatch.
- When `IAgent.onDidMaterializeSession` fires, AgentService calls `dispatchedSessionAdded(...)` and then `dispatchServerAction({ type: ActionType.SessionReady, ... })`.

ClaudeAgent only needs to honor the contract: return `provisional: true` from non-fork `createSession`, and fire `onDidMaterializeSession` from `_materializeProvisional`.

### 3.3 `createSession` — return `provisional: true`

Phase-5's non-fork path eagerly creates a `ClaudeAgentSession` wrapper and stores it in `_sessions`. Phase 6 replaces that with a provisional record. Fork still throws — message updated.

**New constructor dependency.** `ClaudeAgent`'s Phase-5 constructor at [`claudeAgent.ts:136-141`](claudeAgent.ts#L136-L141) does NOT inject git context. Phase 6 adds `@IAgentHostGitService` (resolved as `private readonly _gitService: IAgentHostGitService`, imported from `'../agentHostGitService.js'`) so `createSession` can call `projectFromCopilotContext(...)` (imported from `'../copilot/copilotGitProject.js'`). Mirrors CopilotAgent at [`copilotAgent.ts:843`](../copilot/copilotAgent.ts#L843). Test fakes use `createNoopGitService()` from `'../../test/common/sessionTestHelpers.js'`.

```ts
async createSession(config: IAgentCreateSessionConfig = {}): Promise<IAgentCreateSessionResult> {
    if (config.fork) {
        // Fork moved to Phase 6.5: requires translating `config.fork.turnId`
        // (a protocol turn ID) to an SDK message UUID via `sdk.getSessionMessages`.
        // See phase6-plan.md §8.
        throw new Error('TODO: Phase 6.5: fork requires message-UUID lookup via sdk.getSessionMessages');
    }

    // Non-fork path: provisional. NO subprocess fork, NO worktree, NO DB write.
    // Materialization happens in `_materializeProvisional` on the first
    // `sendMessage`. AgentService defers `sessionAdded` until then.
    const sessionId = config.session ? AgentSession.id(config.session) : generateUuid();
    const sessionUri = AgentSession.uri(this.id, sessionId);

    // Idempotent re-creates (workbench reconnect): if the session is already
    // materialized OR already provisional, return the same URI. Mirrors
    // CopilotAgent (`copilotAgent.ts:732-746`). We deliberately do NOT
    // overwrite the existing provisional record — a re-create payload from
    // a fresh connection would clobber the AbortController.
    if (this._sessions.has(sessionId)) {
        return { session: sessionUri, workingDirectory: config.workingDirectory };
    }
    if (this._provisionalSessions.has(sessionId)) {
        return { session: sessionUri, workingDirectory: config.workingDirectory, provisional: true };
    }

    if (!config.workingDirectory) {
        throw new Error(`createSession: workingDirectory is required for new Claude sessions`);
    }

    const project = await projectFromCopilotContext(
        { cwd: config.workingDirectory.fsPath },
        this._gitService,
    );

    this._provisionalSessions.set(sessionId, {
        sessionId,
        sessionUri,
        workingDirectory: config.workingDirectory,
        abortController: new AbortController(),
        project,
    });

    return {
        session: sessionUri,
        workingDirectory: config.workingDirectory,
        provisional: true,
        ...(project ? { project } : {}),
    };
}
```

**Phase-5 invariants Phase 6 preserves:**
- Non-fork `createSession` does NOT call `ISessionDataService.openDatabase` / `tryOpenDatabase`. (`_provisionalSessions` is in-memory only.)
- Non-fork `createSession` does NOT call any `IClaudeAgentSdkService` method. (Materialize is deferred.)

**New invariants:**
- Non-fork `createSession` returns `provisional: true` and does NOT add an entry to `_sessions`.
- A duplicate `createSession` for a still-provisional URI returns the same URI without overwriting the existing provisional record.

### 3.4 `_materializeProvisional`

Promotes a `IClaudeProvisionalSession` into a real `ClaudeAgentSession`. Called from `sendMessage` (§3.8) inside the `_sessionSequencer.queue(sessionId, ...)` block, so concurrent first sends serialize naturally.

```ts
private async _materializeProvisional(sessionId: string): Promise<ClaudeAgentSession> {
    const provisional = this._provisionalSessions.get(sessionId);
    if (!provisional) {
        throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
    }

    const proxyHandle = this._proxyHandle;
    if (!proxyHandle) {
        throw new Error('Claude proxy is not running; agent must be authenticated first');
    }

    const subprocessEnv = this._buildSubprocessEnv();
    // `proxyHandle.baseUrl` is the full URL (e.g. `http://127.0.0.1:54321`,
    // no trailing slash). Source: `claudeProxyService.ts:44-49`. Do NOT
    // try to read `proxyHandle.port`; it is not part of the contract.
    //
    // PATH composition:
    // - `rgPath` (imported from `@vscode/ripgrep`) is the absolute path to
    //   the ripgrep BINARY. Use `path.dirname(rgPath)` for the directory.
    // - `delimiter` (imported from `../../../../base/common/path.js`) is
    //   the PATH separator (`:` on macOS/Linux, `;` on Windows). Do NOT
    //   use `path.sep` (`/` or `\\`) — that would corrupt PATH on Windows.
    // Mirrors CopilotAgent (`copilotAgent.ts:7, 17, 434-450`).
    const settingsEnv = {
        ANTHROPIC_BASE_URL: proxyHandle.baseUrl,
        ANTHROPIC_AUTH_TOKEN: `${proxyHandle.nonce}.${sessionId}`,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        USE_BUILTIN_RIPGREP: '0',
        PATH: `${dirname(rgPath)}${delimiter}${process.env.PATH ?? ''}`,
    };

    const options: Options = {
        cwd: provisional.workingDirectory.fsPath,
        executable: process.execPath as 'node',
        env: subprocessEnv,
        abortController: provisional.abortController,
        allowDangerouslySkipPermissions: true,
        canUseTool: async (_name, _input) => ({
            behavior: 'deny',
            message: 'Tools are not yet enabled for this session (Phase 6).',
        }),
        disallowedTools: ['WebSearch'],
        includeHookEvents: true,
        includePartialMessages: true,    // per-token streaming
        permissionMode: 'default',
        sessionId,                        // first run: new SDK session
        settingSources: ['user', 'project', 'local'],
        settings: { env: settingsEnv },
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        stderr: data => this._logService.error(`[Claude SDK stderr] ${data}`),
    };

    const warm = await this._sdkService.startup({ options });

    // Q8 belt-and-suspenders: the SDK's comment guarantees abort cleanup
    // (sdk.d.ts:982), but if `startup()` resolved despite a racing abort,
    // dispose the WarmQuery and surface cancellation. The agent has been
    // shutting down while we awaited; do NOT materialize.
    if (provisional.abortController.signal.aborted) {
        await warm[Symbol.asyncDispose]();
        throw new CancellationError();
    }

    const session = this._createSessionWrapper(
        sessionId,
        provisional.sessionUri,
        provisional.workingDirectory,
        warm,
        provisional.abortController,
    );

    // Persist customization-directory metadata BEFORE firing the
    // materialize event. The `IAgentMaterializeSessionEvent` contract
    // (agentService.ts:142-147 + agentService.ts:393-395 in `node/`)
    // says the agent has "persisted on-disk metadata" by the time the
    // event fires. AgentService relies on this to atomically dispatch
    // `sessionAdded` + `SessionReady`; firing before the write would
    // race those notifications past durable state. CopilotAgent at
    // `copilotAgent.ts:843-848` awaits `_storeSessionMetadata` before
    // firing — Phase 6 mirrors that ordering.
    //
    // On persistence failure: dispose the wrapper (which aborts the
    // SDK subprocess), keep the provisional record removed, and re-throw.
    // Treating this as fatal avoids silent half-persisted state. The
    // user sees a `SessionError` and the session never enters `_sessions`.
    try {
        await this._writeCustomizationDirectory(provisional.sessionUri, provisional.workingDirectory);
    } catch (err) {
        session.dispose();
        this._provisionalSessions.delete(sessionId);
        this._logService.error(`[Claude] Failed to persist customization directory; aborting materialize`, err);
        throw err;
    }

    this._sessions.set(sessionId, session);
    this._provisionalSessions.delete(sessionId);

    this._onDidMaterializeSession.fire({
        session: provisional.sessionUri,
        workingDirectory: provisional.workingDirectory,
        project: provisional.project,
    });

    return session;
}

private _buildSubprocessEnv(): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = {
        ELECTRON_RUN_AS_NODE: '1',
        NODE_OPTIONS: undefined,
        ANTHROPIC_API_KEY: undefined,
    };
    for (const key of Object.keys(process.env)) {
        if (key === 'ELECTRON_RUN_AS_NODE') { continue; }
        if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
            env[key] = undefined;
        }
    }
    return env;
}
```

**`Options.env` contract** (sdk.d.ts:1075-1078): "Merged on top of `process.env` — entries here override... Set a key to `undefined` to remove an inherited variable." Mirrors CopilotAgent's strip pattern at [`copilotAgent.ts:434-450`](../copilot/copilotAgent.ts#L434-L450).

**Why agent host strips env when the production extension doesn't**: extension runs in EH (already Electron-as-node, `NODE_OPTIONS` configured for EH); agent host runs in a utility process spawned from main, subprocess env state isn't pre-conditioned.

`_createSessionWrapper` is updated to take the `WarmQuery` and the `AbortController` (vs the Phase-5 minimal signature). Tests override this hook to inject a recording subclass.

### 3.5 `ClaudeAgentSession` — Query owner (~300 lines)

Major rewrite from Phase 5's 30-line minimum. Owns the SDK Query, the per-session AbortController, the prompt iterable, and the message processing loop.

```ts
// claudeAgentSession.ts (Phase 6)

interface QueuedRequest {
    readonly prompt: SDKUserMessage;
    readonly deferred: DeferredPromise<void>;
    /**
     * Required (non-optional). The agent's `sendMessage(...)` interface accepts
     * `turnId?: string` (`agentService.ts:424`), but `AgentSideEffects` always
     * supplies one (`agentSideEffects.ts:704`, `:939`). Phase 6's `ClaudeAgent.sendMessage`
     * generates a UUID via `generateUuid()` if the caller omitted it, before
     * forwarding to `entry.send()`. The mapper depends on `turnId: string` to
     * populate `SessionDeltaAction.turnId` etc. (`actions.ts:233-258, 460-465, 521-526`).
     */
    readonly turnId: string;
}

export class ClaudeAgentSession extends Disposable {
    /** SDK Query handle. Null until first `send()` binds the prompt iterable. */
    private _query: Query | undefined;

    /** Wakes the prompt iterable's `next()` when a new prompt arrives or on abort. */
    private _pendingPromptDeferred = new DeferredPromise<void>();

    /** FIFO of in-flight requests. Length ≤ 1 in Phase 6 due to `_sessionSequencer`. */
    private _inFlightRequests: QueuedRequest[] = [];

    /** Prompts pushed by `send()`, drained by the prompt iterable. */
    private _queuedPrompts: SDKUserMessage[] = [];

    /** Flips true after the first `system:init` SDKMessage; controls `sessionId` vs `resume` on re-options. */
    private _isResumed = false;

    /** content_block index → response part id. Cleared on `message_start`. */
    private readonly _currentBlockParts = new Map<number, string>();

    /** Mapper state passed to `mapSDKMessageToAgentSignals`. Held here so the loop can clear it on errors. */
    private readonly _mapperState: IClaudeMapperState = { currentBlockParts: this._currentBlockParts };

    /**
     * Set by `_processMessages` if the SDK iterator throws or ends without
     * `result`. Once set, every subsequent `send()` rejects immediately
     * with this error rather than parking on `_pendingPromptDeferred.p`
     * (which would hang forever — the consumer loop is dead). Cleared by
     * dispose, never recovered: post-fatal-error sessions are dead until
     * the caller disposes them and creates a new session. Phase 6 has no
     * teardown+recreate flow so this is a terminal state.
     */
    private _fatalError: Error | undefined;

    constructor(
        readonly sessionId: string,
        readonly sessionUri: URI,
        readonly workingDirectory: URI | undefined,
        private readonly _warm: WarmQuery,
        private readonly _abortController: AbortController,
        private readonly _onDidSessionProgress: Emitter<AgentSignal>,
        @ILogService private readonly _logService: ILogService,
    ) {
        super();
        // Dispose chain → abort → SDK cleanup (sdk.d.ts:982).
        this._register(toDisposable(() => this._abortController.abort()));
        // Wake parked iterator on abort so it can return `{ done: true }`.
        this._abortController.signal.addEventListener('abort', () => {
            this._pendingPromptDeferred.complete();
        }, { once: true });
        // The WarmQuery itself owns disposable resources too.
        this._register(toDisposable(() => {
            void this._warm[Symbol.asyncDispose]().catch(err =>
                this._logService.warn(`[ClaudeAgentSession] WarmQuery dispose failed: ${err}`));
        }));
    }

    /**
     * Push a prompt onto the queue and await the turn's completion (the
     * `result` SDKMessage). Throws `CancellationError` if the session has
     * already been aborted. Throws the stored `_fatalError` if the
     * background `_processMessages` loop has died (S7: prevents silent
     * infinite hangs on retry-after-fatal). The first call also binds the
     * prompt iterable to the WarmQuery and kicks off `_processMessages`.
     */
    async send(prompt: SDKUserMessage, turnId: string): Promise<void> {
        if (this._abortController.signal.aborted) {
            throw new CancellationError();
        }
        if (this._fatalError) {
            // Loop is dead. Reject immediately rather than parking on a
            // deferred no consumer will ever pop. Caller must dispose and
            // recreate the session to recover.
            throw this._fatalError;
        }
        if (!this._query) {
            this._query = this._warm.query(this._createPromptIterable());
            // Fire-and-forget: errors propagate via QueuedRequest.deferred,
            // and any post-loop crash is captured into `_fatalError`.
            void this._processMessages().catch(err =>
                this._logService.error(`[ClaudeAgentSession] _processMessages crashed: ${err}`));
        }
        const deferred = new DeferredPromise<void>();
        this._inFlightRequests.push({ prompt, deferred, turnId });
        this._queuedPrompts.push(prompt);
        this._pendingPromptDeferred.complete();
        return deferred.p;
    }

    private _createPromptIterable(): AsyncIterable<SDKUserMessage> {
        return {
            [Symbol.asyncIterator]: () => ({
                next: async () => {
                    while (this._queuedPrompts.length === 0) {
                        if (this._abortController.signal.aborted) {
                            return { done: true, value: undefined };
                        }
                        await this._pendingPromptDeferred.p;
                        this._pendingPromptDeferred = new DeferredPromise<void>();
                    }
                    return { done: false, value: this._queuedPrompts.shift()! };
                },
            }),
        };
    }

    private async _processMessages(): Promise<void> {
        try {
            for await (const message of this._query!) {
                if (this._abortController.signal.aborted) {
                    throw new CancellationError();
                }
                if (message.type === 'system' && (message as SDKSystemMessage).subtype === 'init' && !this._isResumed) {
                    this._isResumed = true;
                }
                // Mapper needs the current turn's `turnId` to populate
                // `SessionAction.turnId` (actions.ts:238, 256, 465, 526).
                // Phase 6 always has exactly one in-flight request when
                // streaming is active; reading the head element is safe.
                const turnId = this._inFlightRequests[0]?.turnId;
                if (turnId !== undefined) {
                    try {
                        const signals = mapSDKMessageToAgentSignals(
                            message,
                            this.sessionUri,
                            turnId,
                            this._mapperState,
                            this._logService,
                        );
                        for (const signal of signals) {
                            this._onDidSessionProgress.fire(signal);
                        }
                    } catch (mapperErr) {
                        // Q12 rule 1: defense-in-depth. Don't kill the turn on a
                        // single malformed SDK message.
                        this._logService.warn(`[ClaudeAgentSession] mapper threw, skipping message: ${mapperErr}`);
                    }
                }
                if (message.type === 'result') {
                    if ((message as SDKResultMessage).is_error) {
                        this._logService.warn(`[ClaudeAgentSession] result.is_error: ${(message as SDKResultMessage).error_during_execution ?? 'unknown'}`);
                    }
                    const completed = this._inFlightRequests.shift();
                    completed?.deferred.complete();
                }
            }
            // S6: if the SDK iterator closed cleanly while aborted (sdk.d.ts:982
            // says "stop and clean up resources" — a graceful close is allowed),
            // surface as `CancellationError`, not a generic "ended without result"
            // failure. Phase 9's cancellation discrimination (§8.3) depends on
            // this being a `CancellationError` instance.
            if (this._abortController.signal.aborted) {
                throw new CancellationError();
            }
            // Generator ended without `result` for any in-flight request.
            throw new Error('Claude SDK stream ended without result');
        } catch (err) {
            // S7: latch the failure so subsequent `send()` calls reject
            // immediately. Without this, a retry pushes a prompt into
            // `_queuedPrompts` and parks on `_pendingPromptDeferred.p`
            // — the loop is dead, the prompt never drains, hang forever.
            this._fatalError = err instanceof Error ? err : new Error(String(err));
            for (const req of this._inFlightRequests) {
                if (!req.deferred.isSettled) {
                    req.deferred.error(err);
                }
            }
            this._inFlightRequests = [];
            throw err;
        }
    }
}
```

**Why a queue of length ≤ 1 instead of a single `_currentRequest`**: `_sessionSequencer` (§3.8) guarantees serialized first-call materialization and serialized subsequent sends, so the queue is currently always length ≤ 1. The queue shape is preserved because Phase 7+ (tools) introduces intra-turn waits that may need short bursts of >1 in-flight, and we don't want to refactor the loop later.

**Why the AbortController drives prompt-iterable termination** (Q9): the controller is already (a) the SDK's cancellation contract, (b) the dispose-chain endpoint via `toDisposable(() => abort())`, (c) the shutdown-cascade signal. Reusing it as the iterator's "done" condition keeps the entire session lifecycle on a single observable signal. No bespoke `_isDisposed` flag.

### 3.6 `claudeMapSessionEvents.ts` — pure helper

Mirrors Copilot's `mapSessionEvents.ts`. Pure function that takes one `SDKMessage` plus the `sessionUri`, the active `turnId`, and mutable mapper state, and returns zero or more `AgentSignal`s. Pure-function testability is the reason it's its own module instead of a private method on the session class.

```ts
// claudeMapSessionEvents.ts

export interface IClaudeMapperState {
    /** content_block index → response part id. Owned by the session, cleared on message_start. */
    readonly currentBlockParts: Map<number, string>;
}

/**
 * Map one SDK message to zero or more agent signals.
 *
 * `session` is the session URI used for the `IAgentActionSignal.session`
 * envelope (`agentService.ts:293-298`) and for the `SessionAction.session`
 * field on every emitted action (`actions.ts:233-258, 460-465, 521-526`).
 *
 * `turnId` is the protocol turn id originating from the client-driven
 * `SessionTurnStarted` action (`agentSideEffects.ts:670` case handler).
 * Every emitted action requires it; the session reads it from the head
 * of `_inFlightRequests` per Phase-6's single-in-flight invariant.
 *
 * Phase 6 emits:
 * - `SessionResponsePart(Markdown)` on `content_block_start` with text type
 * - `SessionResponsePart(Reasoning)` on `content_block_start` with thinking type
 * - `SessionDelta` on `content_block_delta` with text_delta
 * - `SessionReasoning` on `content_block_delta` with thinking_delta
 * - `SessionUsage` on `result` (or `message_delta` if usage is set)
 * - `SessionTurnComplete` on `result`
 *
 * Phase 6 deliberately does NOT emit `SessionTurnStarted` — that's
 * `AgentSideEffects`' job (`agentSideEffects.ts:484` for the dispatch,
 * `:670` for the case handler that calls `agent.sendMessage`). And
 * `SessionError` is dispatched by `AgentSideEffects.catch()` chain on
 * `sendMessage` (`agentSideEffects.ts:704`).
 *
 * Reducer ordering invariant: the protocol reducer at `actions.ts:233, 460`
 * REQUIRES `SessionResponsePart` to precede any `SessionDelta` /
 * `SessionReasoning` for that part id. The mapper allocates the part
 * before the first delta; tests assert ordering, not just presence.
 */
export function mapSDKMessageToAgentSignals(
    message: SDKMessage,
    session: URI,
    turnId: string,
    state: IClaudeMapperState,
    logService: ILogService,
): AgentSignal[] {
    // ... (see §4 for the full table)
}
```

The body implements the full Q7 mapping table from the planning conversation. Trace-log + skip for unhandled types so unexpected SDK additions don't throw.

### 3.7 `claudePromptResolver.ts` — pure helper

Builds the `Anthropic.ContentBlockParam[]` from a prompt string + serialized `IAgentAttachment[]`. Pure, no I/O.

```ts
// claudePromptResolver.ts

export function resolvePromptToContentBlocks(
    prompt: string,
    attachments?: readonly IAgentAttachment[],
): Anthropic.ContentBlockParam[] {
    const blocks: Anthropic.ContentBlockParam[] = [{ type: 'text', text: prompt }];
    if (!attachments?.length) {
        return blocks;
    }
    const refLines: string[] = [];
    for (const att of attachments) {
        switch (att.type) {
            case AttachmentType.File:
            case AttachmentType.Directory:
                refLines.push(`- ${uriToString(att.uri)}`);
                break;
            case AttachmentType.Selection: {
                const line = att.selection ? `:${att.selection.start.line + 1}` : '';
                refLines.push(`- ${uriToString(att.uri)}${line}`);
                if (att.text) {
                    refLines.push('```');
                    refLines.push(att.text);
                    refLines.push('```');
                }
                break;
            }
        }
    }
    blocks.push({
        type: 'text',
        text: '<system-reminder>\nThe user provided the following references:\n' +
            refLines.join('\n') +
            '\n\nIMPORTANT: this context may or may not be relevant to your tasks. ' +
            'You should not respond to this context unless it is highly relevant to your task.\n' +
            '</system-reminder>',
    });
    return blocks;
}

function uriToString(uri: URI): string {
    return uri.scheme === 'file' ? uri.fsPath : uri.toString();
}
```

**Extension-ahead-of-protocol notes** (record but not Phase 6 work): the production extension at [`claudePromptResolver.ts`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudePromptResolver.ts) handles inline range substitution and binary-image extraction. Protocol's `IAgentAttachment` carries neither today. When images land, follow the extension's `image` content block path; when inline ranges land, port the descending-sort replacement loop.

**Selection branch is dead-code in Phase 6** (S4 from review). `IAgentAttachment` (`agentService.ts:243-254`) carries `text` and `selection` for the `Selection` attachment type, but `AgentSideEffects` strips them at the protocol → agent boundary (`agentSideEffects.ts:699-703` for live send and `:934-938` for queued send) — the agent receives only `{ type, uri, displayName }`. The `Selection` switch case in `resolvePromptToContentBlocks` therefore exists for forward-compat (mirroring the production extension's shape) but never executes in Phase 6. A future phase that expands `AgentSideEffects` to forward `text` + `selection` activates it without resolver changes. Phase 6 must NOT touch `agentSideEffects.ts` to enable selection rendering — that scope expansion is deferred.

### 3.8 `sendMessage` — sequencer + materialize-first + entry.send

```ts
async sendMessage(
    session: URI,
    prompt: string,
    attachments?: IAgentAttachment[],
    turnId?: string,
): Promise<void> {
    const sessionId = AgentSession.id(session);
    // `IAgent.sendMessage` declares `turnId?` (agentService.ts:424) but
    // every production caller in `AgentSideEffects` supplies one
    // (`agentSideEffects.ts:704, :939`). Generate a fallback so the
    // session-side `QueuedRequest.turnId: string` invariant holds even
    // if a hypothetical future caller forgets it; tests can rely on
    // their explicit value being passed through.
    const effectiveTurnId = turnId ?? generateUuid();
    return this._sessionSequencer.queue(sessionId, async () => {
        let entry = this._sessions.get(sessionId);
        if (!entry) {
            if (this._provisionalSessions.has(sessionId)) {
                entry = await this._materializeProvisional(sessionId);
            } else {
                throw new Error(`Cannot send to unknown session: ${sessionId}`);
            }
        }

        const contentBlocks = resolvePromptToContentBlocks(prompt, attachments);
        const sdkPrompt: SDKUserMessage = {
            type: 'user',
            message: { role: 'user', content: contentBlocks },
            session_id: sessionId,
            parent_tool_use_id: null,
        };

        await entry.send(sdkPrompt, effectiveTurnId);
    });
}
```

**Sequencer scope**: the `queue(sessionId, ...)` block holds the sequencer through both materialize AND `entry.send`. This guarantees: (a) two concurrent first-message calls serialize into one materialization plus two ordered sends, (b) a `disposeSession` racing a first send reaches the dispose-sequencer eventually but the in-flight materialize completes its own work first, (c) Phase 7+ intra-turn waits don't deadlock because they happen inside `entry.send` after the sequencer has been entered (sequencer is per-key, not global).

**`entry.send` returns the deferred** for the in-flight turn, so `sendMessage` only resolves when `result` arrives. AgentSideEffects' `.catch()` at [`agentSideEffects.ts:704`](../agentSideEffects.ts#L704) sees errors and dispatches `SessionError`.

### 3.9 `shutdown` — drain provisional then sessions

Phase 5's `shutdown` already serializes per-session teardown via `_disposeSequencer`. Phase 6 prepends a provisional drain so any in-flight `await sdk.startup()` aborts cleanly.

```ts
shutdown(): Promise<void> {
    return this._shutdownPromise ??= (async () => {
        // Q8: cancel any provisional sessions mid-materialize. Their
        // AbortControllers are wired into Options.abortController, so
        // aborting unblocks any in-flight `await sdk.startup()`.
        for (const provisional of this._provisionalSessions.values()) {
            provisional.abortController.abort();
        }
        this._provisionalSessions.clear();

        // Existing Phase-5 drain. Each ClaudeAgentSession registers
        // `toDisposable(() => abortController.abort())`, so disposing
        // them aborts their SDK Query.
        const sessionIds = [...this._sessions.keys()];
        await Promise.all(sessionIds.map(sessionId =>
            this._disposeSequencer.queue(sessionId, async () => {
                this._sessions.deleteAndDispose(sessionId);
            }),
        ));
    })();
}
```

`disposeSession(uri)` for a still-provisional session is a new branch:

```ts
disposeSession(session: URI): Promise<void> {
    const sessionId = AgentSession.id(session);
    return this._disposeSequencer.queue(sessionId, async () => {
        const provisional = this._provisionalSessions.get(sessionId);
        if (provisional) {
            provisional.abortController.abort();
            this._provisionalSessions.delete(sessionId);
            return;
        }
        this._sessions.deleteAndDispose(sessionId);
    });
}
```

## 4. SDK message → `AgentSignal` mapping (Phase 6 table)

`Options.includePartialMessages: true` means we receive raw `stream_event` SDKMessages for true per-token streaming. `assistant` SDKMessages still arrive but text content is NOT re-emitted (already streamed via `stream_event`). This is a UX upgrade over the production extension which doesn't set the flag.

| SDKMessage | AgentSignal(s) / behavior |
|---|---|
| `system` (subtype `init`) | Set `_isResumed = true`. No signal. |
| `stream_event` → `message_start` | Clear `_currentBlockParts`. No signal. |
| `stream_event` → `content_block_start` (text) | Allocate new partId, emit `SessionResponsePart(Markdown)`. Store `currentBlockParts.set(event.index, partId)`. |
| `stream_event` → `content_block_start` (thinking) | Allocate new partId, emit `SessionResponsePart(Reasoning)`. Store. |
| `stream_event` → `content_block_start` (tool_use) | **Skip + warn.** No partId allocated. Defense-in-depth — `canUseTool: deny` should prevent this. |
| `stream_event` → `content_block_delta` (text_delta) | Emit `SessionDelta(currentBlockParts.get(event.index), event.delta.text)`. |
| `stream_event` → `content_block_delta` (thinking_delta) | Emit `SessionReasoning(partId, event.delta.thinking)`. |
| `stream_event` → `content_block_delta` (input_json_delta) | No-op (tool input parameters; out of Phase 6 scope). |
| `stream_event` → `content_block_stop` | `currentBlockParts.delete(event.index)`. No signal. |
| `stream_event` → `message_delta` | If `usage` present, emit `SessionUsage`. |
| `stream_event` → `message_stop` | No signal (turn-complete is driven by `result`, not stream_event). |
| `assistant` (whole message) | Used ONLY for metadata: error-field log, defense-in-depth tool_use verification. Text content NOT re-emitted. |
| `result` | Emit `SessionUsage` (if not already emitted via message_delta) then `SessionTurnComplete`. |
| `system` (subtype `compact_boundary`) | No-op (Phase 6 has no context management). |
| `user` (tool_result) | No-op (Phase 7 territory). |
| Other | Trace-log + skip. |

**Reducer ordering invariant** (`actions.ts:233, 460`): `SessionResponsePart` MUST precede any `SessionDelta` / `SessionReasoning` for that part id. The mapper allocates parts before deltas; tests assert ordering not just presence (Tests 6, 7 in §5).

## 5. Test cases

`ensureNoDisposablesAreLeakedInTestSuite()` stays at the top of the suite (preserved from Phase 5).

### 5.1 Unit tests (15 new cases)

1. **`createSession` non-fork → `provisional: true`.** Result has `provisional: true`. `_provisionalSessions` has one entry. `_sessions` is empty. SDK was NOT called (`startupCallCount === 0`, `listSessionsCallCount === 0`). Database was NOT opened (`openDatabaseCallCount === 0`).
2. **`createSession` with `config.fork` → throws "TODO: Phase 6.5".** No side effects.
3. **First `sendMessage` on a provisional session → materializes.** `onDidMaterializeSession` fires exactly once. `startupCallCount === 1`. After completion, `_sessions` has the entry, `_provisionalSessions` is empty.
4. **Materialize event payload shape.** `{ session: <uri>, workingDirectory: <uri>, project: undefined }` (project field is optional and tests don't set up gitService).
5. **Two `sendMessage` calls on the same session → reuses Query.** `startupCallCount === 1` after both. Both deferreds complete on their respective `result` messages.
6. **Assistant text block → `SessionResponsePart(Markdown)` precedes `SessionDelta`.** Capture all signals from `_onDidSessionProgress`. Assert the first `SessionDelta` for partId X is preceded by exactly one `SessionResponsePart(kind=Markdown, partId=X)` for the same X.
7. **Assistant thinking block → `SessionResponsePart(Reasoning)` precedes `SessionReasoning`.** Same shape as test 6, kind=Reasoning.
8. **`result` SDKMessage → `SessionUsage` then `SessionTurnComplete` in that order.** Snapshot the suffix of the signal sequence after the last delta.
9. **Multiple text blocks in one assistant message → each gets its own part allocation.** Two `content_block_start(text)` events at indices 0 and 1. Assert two distinct partIds were allocated, deltas routed correctly.
10. **`_isResumed` flips on first `system:init`.** First `sendMessage` produces a session whose `_isResumed === true` after the init message. (Asserted via a getter exposed for test, OR by triggering a teardown+recreate flow that asserts `Options.resume === sessionId` on the second `startup()` — Phase 6 doesn't have teardown+recreate yet, so the getter is acceptable.)
11. **Dispose materialized session → controller aborted; in-flight deferred rejects.** Set `queryAdvance` to block at index 3. Call `sendMessage` (returns pending promise). Call `disposeSession`. Resolve the blocker. Assert: (a) the pending sendMessage promise rejects, (b) `capturedStartupOptions[0].abortController.signal.aborted === true`, (c) `_sessions` no longer has the entry.
12. **Dispose provisional session → no SDK call; map removed.** Create provisional, call `disposeSession`. Assert `_provisionalSessions` is empty, `startupCallCount === 0`.
13. **Shutdown drain — two scenarios.**
    - **(a) Only provisional**: create three sessions, none send. Call `shutdown()`. Assert `startupCallCount === 0`, `_provisionalSessions` is empty.
    - **(b) Mixed provisional + materialized**: create three sessions, send on two (leaving one provisional). With `queryAdvance` blocking, call `shutdown()`. Assert all three deferreds resolve/reject (the two materialized reject with abort, the provisional one was never awaiting send), `_sessions` and `_provisionalSessions` both empty, controller of every entry was aborted.
14. **Mapper throws on a malformed `stream_event` → log + continue.** Inject a malformed message at index 2 via `nextQueryMessages`. Assert: warn was logged once, signals from indices 0, 1, 3, 4 emitted normally, turn completes via `result`.
15. **Attachment conversion (File / Directory only).** S4 from review: `text` and `selection` fields on `IAgentAttachment` are dropped by `AgentSideEffects` before reaching the agent (`agentSideEffects.ts:699-703, :934-938`), so a Selection-shape input is not realistically reachable in Phase 6. Test the realistic path: `sendMessage('hi', [{type: AttachmentType.File, uri: URI.parse('file:///a')}, {type: AttachmentType.Directory, uri: URI.parse('file:///b')}])`. After the call, inspect `FakeQuery.capturedPrompt` — the first `SDKUserMessage`'s `content` is `[{type:'text', text:'hi'}, {type:'text', text: matches /^<system-reminder>[\s\S]*\/a[\s\S]*\/b/ }]`. Selection rendering is deferred to a future phase that expands `AgentSideEffects` to forward `text` + `selection`; the resolver's `Selection` branch is dead-code until then (per §3.7 note).

### 5.2 Integration test (1 case)

**File**: [../../test/node/claudeAgent.integration.test.ts](../../test/node/claudeAgent.integration.test.ts)

Real `ClaudeProxyService` + real `@anthropic-ai/claude-agent-sdk` + stubbed `ICopilotApiService` returning a canned Anthropic stream `[message_start, content_block_start(text), content_block_delta('hello'), content_block_stop, message_delta(usage), message_stop]` followed by terminal SDK messages so `result` arrives.

Asserts:
- The full proxy → SDK → mapper → AgentSignal pipeline emits the expected signal sequence.
- The SDK subprocess actually forks (assert `process.execPath` was used as executable).
- `Options.env` strip behavior: `NODE_OPTIONS` is undefined in the subprocess env, `ELECTRON_RUN_AS_NODE === '1'`.
- Cleanup: dispose the agent, no orphan subprocesses (assert `ps` doesn't show stale `claude-agent-sdk` children — or rely on the SDK's own `[Symbol.asyncDispose]` contract and assert no unhandled rejections).

This test is the single real-world validator that the proxy's `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` plumbing actually works against the SDK. Roadmap explicit requirement at [roadmap.md L532](roadmap.md#L532).

### 5.3 Removed from earlier draft

- **(was) "SDK load failure → sendMessage rejects"**: Phase 5 already covers SDK lazy-load failure via `listSessions`. The new `startupRejection` field on `FakeClaudeAgentSdkService` covers init failure as a setup variant of test 3, not a separate test.

### 5.4 Nice-to-have (not gating)

- Concurrent `sendMessage` serialization via `_sessionSequencer`.
- `sendMessage` after shutdown → reject with `CancellationError`.
- `tool_use` leakage guard: if SDK ever delivers `content_block_start(tool_use)` despite `canUseTool: deny`, mapper skips + warns; the loop doesn't hang.

## 6. Risks / gotchas

| Risk | Mitigation |
|---|---|
| `startup()` doesn't honor `Options.abortController` during init handshake. | Belt-and-suspenders: after `await sdk.startup()` resolves, check `provisional.abortController.signal.aborted`; if true, `await warm[Symbol.asyncDispose]()` and throw `CancellationError`. Integration test exercises real abort during init. |
| `assistant` SDKMessages double-emit text already streamed via `stream_event`. | Mapper rule: with `includePartialMessages: true`, `assistant` whole-messages contribute ZERO `SessionDelta` / `SessionResponsePart` signals — only metadata (errors, defense-in-depth tool_use detection). Tests 6, 7, 9 codify the no-double-emit invariant. |
| Reducer corruption from out-of-order signals (`SessionDelta` before `SessionResponsePart`). | Mapper allocates the part on `content_block_start` BEFORE any deltas can arrive (deltas are SDK-ordered). Tests 6, 7 assert the precedence directly. |
| `tool_use` block leaks through `canUseTool: deny`. | Mapper skips + warns at `content_block_start(tool_use)`. Loop continues. SDK eventually surfaces the failed call via `result.error_during_execution`, which we log but don't re-raise. Test 5.4 nice-to-have. |
| `process.execPath` in a utility process needs `ELECTRON_RUN_AS_NODE=1`. | `_buildSubprocessEnv()` sets it. Mirror of `copilotAgent.ts:434-450`. Integration test asserts the env value. |
| `NODE_OPTIONS` from the parent Electron process breaks the Claude subprocess. | `_buildSubprocessEnv()` strips it via `undefined` (Options.env semantics, sdk.d.ts:1075-1078). Integration test asserts `NODE_OPTIONS === undefined` in the spawn env. |
| Provisional session resurrected by a duplicate `createSession` after the user disposed it. | `disposeSession(uri)` removes the provisional entry AND aborts its controller. A subsequent `createSession` for the same URI creates a new provisional record (new AbortController). The Phase-5 idempotency guard (`if (this._sessions.has(sessionId)) return ...`) only fires for already-materialized sessions; provisional re-creates after dispose are a fresh provisional. |
| `_sessionSequencer` and `_disposeSequencer` deadlock. | They are SEPARATE sequencers with the same key (sessionId). `disposeSession` enters `_disposeSequencer`; `sendMessage` enters `_sessionSequencer`. They can run in parallel for the same session. The race is benign: a concurrent dispose during materialize aborts the AbortController, which causes `await sdk.startup()` to reject inside `_sessionSequencer`. |
| Materialize-during-dispose race surfaces a half-born session in `_sessions`. | The `provisional.abortController.signal.aborted` check after `await sdk.startup()` (Q8 belt-and-suspenders) catches this and disposes the WarmQuery. Test 13b codifies. |
| `Query` AsyncIterable doesn't terminate on abort. | The session's `_processMessages` checks `signal.aborted` at the top of every iteration. The mapper's no-op fall-through plus the prompt iterable's abort-aware termination means we drop out of the `for await` cleanly. SDK comment at sdk.d.ts:982 promises Query cleanup on abort. |
| Workbench client retries `createSession` over a re-connection while the original `sendMessage` is still materializing. | Idempotency: the second `createSession` finds the session in `_provisionalSessions` and returns the same URI without creating a new record. The in-flight materialize on the first connection's send completes normally; the second connection awaits its own send. |
| `result.is_error: true` causes the turn to look stuck. | Mapper still emits `SessionTurnComplete` after logging the warning. `is_error` is informational on a successful turn (model decided to error in-band). Test in §5.4 nice-to-have. |
| Phase 9 cancellation looks like Phase 6 error. | Documented limitation: dispose-driven cancellation rejects in-flight deferred with `CancellationError`. AgentSideEffects doesn't yet discriminate, so it dispatches `SessionError` during shutdown. Harmless (state manager being torn down) but technically wrong. Phase 9 follow-up: discriminate `isCancellationError` in AgentSideEffects OR dispatch `SessionTurnCancelled` from the agent before reject. Cited in §8. |

## 7. Acceptance criteria

The PR is **done** when every box below is checked.

### 7.1 Code structure

- [ ] [claudeAgentSdkService.ts](claudeAgentSdkService.ts) exposes `startup()` on both `IClaudeSdkBindings` and `IClaudeAgentSdkService`. Phase-5 surface preserved.
- [ ] [claudeAgentSession.ts](claudeAgentSession.ts) is a Query owner with the fields enumerated in §3.5. Constructor takes `WarmQuery`, `AbortController`, and the agent's progress emitter. `dispose()` aborts the controller and disposes the WarmQuery.
- [ ] [claudeAgent.ts](claudeAgent.ts) has `_provisionalSessions: Map<string, IClaudeProvisionalSession>`, `_onDidMaterializeSession` Emitter, `_sessionSequencer: SequencerByKey<string>` distinct from `_disposeSequencer`. `_createSessionWrapper` updated to take WarmQuery + AbortController.
- [ ] `createSession` non-fork returns `provisional: true`, fork branch throws `TODO: Phase 6.5`.
- [ ] `_materializeProvisional` builds the SDK `Options` per §3.4 (env strip, settings.env, includePartialMessages, canUseTool deny, abortController).
- [ ] [claudeMapSessionEvents.ts](claudeMapSessionEvents.ts) is a pure helper module exporting `mapSDKMessageToAgentSignals` and `IClaudeMapperState`. No I/O. No DI.
- [ ] [claudePromptResolver.ts](claudePromptResolver.ts) is a pure helper exporting `resolvePromptToContentBlocks`. No I/O. No DI.
- [ ] All Phase-7+ stubs (`respondToPermissionRequest`, `respondToUserInputRequest`, etc.) still throw `TODO: Phase N`.
- [ ] No `as any` / `as unknown as Foo` casts in production or test code.
- [ ] Microsoft copyright header on every new file.

### 7.2 Persistence invariants (assert in tests)

- [ ] Non-fork `createSession` does NOT call `ISessionDataService.openDatabase` or `tryOpenDatabase`, and does NOT call any `IClaudeAgentSdkService` method (no `startup()`, no `listSessions()`).
- [ ] `createSession({ fork })` rejects with a `TODO: Phase 6.5` error and produces no side effects.
- [ ] Materialize is the FIRST `startup()` call; `startupCallCount === 1` after first `sendMessage`, regardless of how many `createSession` retries happened beforehand.
- [ ] Dispose materialized session aborts the AbortController and rejects in-flight deferreds.
- [ ] Dispose provisional session does NOT call `startup()` and does NOT touch `_sessions`.

### 7.3 Compile + lint + layers

- [ ] `VS Code - Build` task shows zero TypeScript errors. If task is unavailable, `npm run compile-check-ts-native` exits 0.
- [ ] `npm run eslint -- src/vs/platform/agentHost/node/claude src/vs/platform/agentHost/test/node/claudeAgent.test.ts src/vs/platform/agentHost/test/node/claudeAgent.integration.test.ts` exits 0.
- [ ] `npm run valid-layers-check` exits 0.
- [ ] `npm run hygiene` exits 0.

### 7.4 Tests

- [ ] All Phase-5 cases still pass (no regression).
- [ ] All 15 unit cases from §5.1 pass.
- [ ] The integration test in §5.2 passes against the real SDK.
- [ ] `scripts/test.sh --grep ClaudeAgent` exits 0.
- [ ] `scripts/test-integration.sh --grep claudeAgent` exits 0 (or the equivalent integration runner per the workspace's test conventions).

### 7.5 Live-system smoke (mandatory before merging)

Phase-6 smoke checklist (6 boxes):

- [ ] **Provisional defers `sessionAdded`.** Open new-chat, pick Claude, pick folder. The session appears in the workbench list ONLY after the first message lands.
- [ ] **Per-token streaming.** Type "hi" → assistant text appears incrementally (visible chunks during the response, not just at completion).
- [ ] **Persistence after first turn.** After the first turn completes, the session shows up in `listSessions()` (workbench reload — session is there).
- [ ] **Second turn reuses Query.** Second prompt streams without re-materializing, prior turn's content remains visible.
- [ ] **Mid-turn dispose.** Send a long-response prompt, dispose the session mid-stream. No unhandled rejection in the agent host log; session removed cleanly from the workbench.
- [ ] **Clean process teardown.** Kill the agent host process; `ps aux | grep claude` shows no orphan subprocesses; next startup has no error spam.

(Fork smoke moves to Phase 6.5.)

### 7.6 PR readiness

- [ ] PR title: `agentHost/claude: Phase 6 — sendMessage (single-turn, no tools)`.
- [ ] PR description links to [roadmap.md](roadmap.md) Phase 6 and to this plan; notes that exit criteria are met.
- [ ] PR description lists the implemented changes vs the still-stubbed methods + their target phase.
- [ ] PR description calls out the deferred Phase 6.5 fork, the Phase 9 cancellation discrimination follow-up, and the canUseTool deny stub as Phase 7 surface.

## 8. Phase 6.5 / Phase 7+ contract notes

These are decisions Phase 6 locks down so later phases are pure-additive.

### 8.1 Phase 6.5 — fork

> **Status update (post-Phase-6):** Phase 6.5 was attempted on top of
> Phase 6 and **fully reverted**. The implementation outline below is
> preserved as a historical record of the design at Phase-6 lock-down
> time; the **current source of truth** is `roadmap.md` § "Phase 6.5 —
> Fork (deferred)". The reverted attempt used a JSONL forward-scan
> heuristic to infer turn boundaries; the new approach persists
> `turnId → lastSdkMessageUuid` on result-message ingest, anchored on
> Phase 13's mapper. Phase 6.5 is no longer a stacked PR on Phase 6 —
> it sequences after Phase 13.

**Critical SDK divergence from CopilotAgent**: Claude SDK's `forkSession(sessionId, { upToMessageId, title })` at [sdk.d.ts:540-565](../../../../../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts) takes a **message UUID**, not an event id. This is structurally different from CopilotAgent's `getNextTurnEventId(turnId) → toEventId` pattern. Mirroring CopilotAgent's pattern would have been wrong.

**Phase 6.5 implementation outline**:
- Add `forkSession` to `IClaudeSdkBindings` and `IClaudeAgentSdkService`.
- In `createSession({ fork })`, walk `sdk.getSessionMessages(srcSessionId)` to compute the `protocolTurnId → assistantMessageUuid` mapping lazily at fork time. SDK transcript is the source of truth — no Phase-6 metadata write needed.
- Resume the forked session so the SDK loads the forked history.
- Persist the customization-directory metadata via `setMetadata` on the forked session.
- Phase 6.5 is a stacked PR on top of Phase 6.

### 8.2 Phase 7 — `canUseTool`

Phase 6's stub returns `{ behavior: 'deny', message: 'Tools are not yet enabled for this session (Phase 6).' }`. Phase 7 flips this to call `IToolPermissionService.canUseTool(...)` (mirrors [`claudeCodeAgent.ts:467`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts#L467)). The mapper's defense-in-depth `tool_use` skip+warn becomes a pass-through to a new tool-call signal.

### 8.3 Phase 9 — cancellation discrimination in AgentSideEffects

Documented limitation: Phase 6's dispose-driven cancellation rejects in-flight deferreds with `CancellationError`. AgentSideEffects' `.catch()` at [`agentSideEffects.ts:704`](../agentSideEffects.ts#L704) doesn't yet discriminate cancellation from real failure, so it dispatches `SessionError` during shutdown. Phase 9's `abortSession` work needs to either (a) discriminate `isCancellationError` in AgentSideEffects, (b) dispatch `SessionTurnCancelled` from the agent before reject, or (c) both.

### 8.4 Phase 7+ — `ClaudeMessageProcessor` extraction trigger

Phase 6 keeps `_processMessages` as a private method on `ClaudeAgentSession`. The single-class decision is right at this surface area: the mapper helper already gives us pure-function testability, and the loop itself is thin orchestration.

**Trigger to extract**: when `_processMessages` accretes any of:
- Tool-use dispatch (Phase 7) with `unprocessedToolCalls` map + per-tool span tracking.
- Hook-event handling (Phase 11) with `otelHookSpans` map.
- Edit-tracker integration (Phase 8).
- Subagent trace contexts (Phase 12).
- OTel `invoke_agent` span lifecycle.

At that point — likely Phase 7 — extract a `ClaudeMessageProcessor` helper class registered (`_register`'d) by the session. Mirrors how the production extension's [`claudeCodeAgent.ts:578-700`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts#L578-L700) has clearly distinct concerns mashed together — we want to split them when they actually exist, not pre-emptively.

### 8.5 Phase 7+ — sequencer reconvergence trigger

Phase 6 deliberately uses **two separate** per-session sequencers:
- `_disposeSequencer` (Phase 5, teardown) at `claudeAgent.ts:153-165`
- `_sessionSequencer` (Phase 6, send + materialize)

CopilotAgent uses a **single** sequencer ([`copilotAgent.ts:265`](../copilot/copilotAgent.ts#L265)) for sends, disposes, model changes, archive, etc. Phase 6's two-sequencer split is safe today because dispose and send are linked through the AbortController cascade: dispose → abort → SDK Query unwinds → `_processMessages` exits → in-flight deferred rejects. The sequencers don't deadlock because each holds a different per-key lock.

**Trigger to converge**: when Phase 7 introduces tool-call confirmations that hold longer-lived in-flight state on the session (e.g. waiting on `respondToPermissionRequest`), the AbortController cascade is no longer the only synchronization point. At that phase, audit whether dispose-during-tool-confirmation needs a single sequencer to serialize. If yes, fold `_disposeSequencer` into `_sessionSequencer` and route both `disposeSession` and `sendMessage` through the same `queue(sessionId, ...)`. Mirrors CopilotAgent.

### 8.6 Production extension `sdk.startup()` adoption (out of scope, recorded)

The extension at [`claudeCodeAgent.ts:487`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts#L487) uses `query({ prompt, options })` directly. `sdk.startup()` is a strict upgrade for any "session is created before first prompt" flow but the extension doesn't have provisional/materialize semantics, so the gain is purely about subprocess pre-warming. Not on the agent-host roadmap.

## 9. Resolved decisions (grilling outcomes)

The full grilling transcript locked these. Recording the conclusions here so a fresh-context reader sees the rationale.

**Q1: `canUseTool` stub.** Returns `{ behavior: 'deny', ... }`, not `allow`. `allow` would actually execute tools (filesystem mutations + multi-turn loops), exceeding Phase-6 scope. Mapper skip+warn for `tool_use` blocks is defense-in-depth on top.

**Q2: Fork → Phase 6.5.** Claude SDK's `forkSession` API is structurally different from Copilot's (message UUID vs event id). Doing it right requires `sdk.getSessionMessages` lookup. Stacked PR keeps Phase 6 focused.

**Q3: Skip metadata write on materialize, lazy backfill in Phase 6.5.** No `protocolTurnId → messageUUID` mapping written in Phase 6 because Phase 6 doesn't need it; Phase 6.5 computes lazily from `sdk.getSessionMessages(srcId)` on fork.

**Q4: Materialization timing — `sdk.startup()`.** `startup({ options })` forks subprocess and completes init handshake before returning `WarmQuery`. Fire `onDidMaterializeSession` AFTER the await resolves → no phantom-session bug.

**Q5: `_processMessages` on session class.** Not extracted to a separate class in Phase 6. Mapper helper provides the testability seam; the loop itself is thin. Extraction trigger documented (§8.4).

**Q6: Signal emission via shared `Emitter<AgentSignal>`.** Session emits via the agent's emitter (passed in constructor) — not its own. Mirrors CopilotAgent's pattern.

**Q7: `includePartialMessages: true`.** Per-token streaming UX. Production extension doesn't set this (chunky UX); we do.

**Q8: Shutdown-during-materialize race.** Per-session `AbortController` lives on the provisional record. Pass into `Options.abortController`. On materialize success, ownership transfers to `ClaudeAgentSession` which registers `toDisposable(() => abort())`. Shutdown loops `_provisionalSessions` calling `abort()`; then drains `_sessions`. Native to SDK contract (sdk.d.ts:982). No agent-level controller, no parent/child wiring, no flags.

**Q9: Prompt iterable termination via AbortController.** Same controller drives SDK cancellation, dispose chain, and iterator termination. Constructor wires `signal.addEventListener('abort', () => deferred.complete())` to wake parked iterator. No bespoke `_isDisposed` flag.

**Q10: Attachment conversion → `<system-reminder>` block.** Pure helper `claudePromptResolver.ts` mirrors production extension, simplified for the protocol's narrower attachment surface (no images, no inline ranges yet).

**Q11: Env stripping — two SDK surfaces.** `Options.env` for subprocess process env (strip `NODE_OPTIONS`, `ANTHROPIC_API_KEY`, `VSCODE_*`, `ELECTRON_*`; set `ELECTRON_RUN_AS_NODE=1`). `Options.settings.env` for Claude session config (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `USE_BUILTIN_RIPGREP`, `PATH`).

**Q12: `_processMessages` error rules.** (1) Mapper throws → log + skip, no propagate. (2) SDK iterator throws OR ends without `result` → drain in-flight with reject + throw. (3) `result.is_error: true` → log warn, still complete the turn normally. Inlined drain (no helper methods — only two call sites).

**Q13: `FakeClaudeAgentSdkService` shape.** Async-generator iterator, field-based capture, optional `queryAdvance` hook for timing-sensitive tests. `FakeWarmQuery` and `FakeQuery` helpers.

**Q14: Refined test list.** 15 unit + 1 integration. Removed "SDK load failure" (Phase 5 covers it). Added mapper-throws test and attachment-conversion test (File/Directory only — selection-shape inputs descoped per S4 review finding). Split shutdown-drain into provisional-only and mixed scenarios.
