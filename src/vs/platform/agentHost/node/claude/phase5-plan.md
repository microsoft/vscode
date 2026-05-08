# Phase 5 Implementation Plan — `ClaudeAgent` session lifecycle

> **Handoff plan** — written to be executed by an agent with no prior conversation context. All file paths and line citations are verified against the workspace at synthesis time. Cross-reference [roadmap.md](./roadmap.md) before committing exact phase numbers.

> **Status note (post-Phase 6.5 design — Phase 6.1 Cycle G).** Two pieces of this plan are now historical and superseded:
>
> 1. **Fork narrative.** The fork narrative below was drafted under the working assumption that the agent host would translate `protocolTurnId → SDK-event-uuid` *at fork time* via a live SDK session handle (e.g. `ClaudeAgentSession.getNextTurnEventId(…)` or a JSONL walk through `sdk.getSessionMessages`). That approach was attempted and reverted; **Phase 6.5 ships the contract-based persisted-mapping approach instead** — the mapping is captured on every `type:'result'` ingest by Phase 13's result-message mapper and stored in the session-data DB, so fork is an O(1) DB lookup with no JSONL inference. See [roadmap.md §"Phase 6.5 — Fork"](./roadmap.md) and [CONTEXT.md M9 fork sub-flow](./CONTEXT.md) for the canonical contract. The references to `getNextTurnEventId`, JSONL walks, and `sdk.getSessionMessages` lookups in the body of this plan are historical — read them as the design that was *replaced*, not the design that shipped.
> 2. **`permissionMode` enum width.** The §B5 schema example shows the original 4-value enum `['default', 'acceptEdits', 'bypassPermissions', 'plan']`. The canonical enum is the 6-value form `['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto']` (matching `ClaudePermissionMode` in [`claudeSessionConfigKeys.ts`](../../common/claudeSessionConfigKeys.ts) and the SDK's `PermissionMode` typedef), expanded in Phase 6.1 Cycle E1. See [CONTEXT.md M11/M12](./CONTEXT.md) and Cycle E1 in [phase6.1-plan.md](./phase6.1-plan.md) for the live code.

## 1. Goal

Replace the seven Phase-5 stubs in [claudeAgent.ts](claudeAgent.ts) (`createSession`, `disposeSession`, `getSessionMessages`, `listSessions`, `resolveSessionConfig`, `sessionConfigCompletions`, `shutdown`) with real implementations. **No live LLM traffic** in this phase — `sendMessage` stays a Phase-6 stub. The SDK's `query()` is **not** spawned in `createSession`.

**Fork is explicitly out of scope.** SDK `forkSession` requires translating a protocol turn ID to an SDK event ID via `ClaudeAgentSession.getNextTurnEventId(...)`, which itself requires a live SDK session handle (CopilotAgent's reference at [`copilotAgent.ts:589-592`](../copilot/copilotAgent.ts#L589-L592) loads the source session via `_resumeSession` to do this). Phase 5 has no SDK session machinery, so the protocol-turn-ID → SDK-event-ID translation is structurally missing. Implementing fork on top of half-baked plumbing is the kind of corner-cutting that produces the latent bugs we're already trying to avoid in CopilotAgent. Phase 5 `createSession` therefore throws `TODO: Phase 6` when `config.fork` is set; Phase 6 picks up fork as part of its sendMessage / SDK-session work.

**Exit criteria:** With the Phase-4 gate enabled, a workbench client can:

1. Create a non-fork Claude session and receive a `claude:/<uuid>` URI.
2. List sessions and see entries from this agent host AND externally-created Claude Code sessions (CLI, other clients).
3. Dispose a session cleanly without affecting external listings.
4. Shut down the agent host cleanly.
5. `createSession({ fork })` throws `TODO: Phase 6`.
6. The first `sendMessage` call still throws `TODO: Phase 6` (sendMessage is Phase 6, not Phase 5).

## 2. Files to create / modify

| Action | File | Purpose |
|---|---|---|
| **Create** | [claudeAgentSdkService.ts](claudeAgentSdkService.ts) | Lazy `@anthropic-ai/claude-agent-sdk` wrapper. Phase-5 surface: `listSessions`, `getSessionMessages`. **No `query()` yet, no `forkSession` yet — fork is Phase 6.** |
| **Create** | [claudeAgentSession.ts](claudeAgentSession.ts) | Per-session wrapper. Phase-5 fields: `sessionId`, `sessionUri`. `dispose()` is no-op-safe. Class grows in Phase 6 to hold `_query`, `_abortController`, etc. |
| **Modify** | [claudeAgent.ts](claudeAgent.ts) | Replace 7 stubs. Add `ISessionDataService` + `IClaudeAgentSdkService` DI. Add `_sessions: DisposableMap<string, ClaudeAgentSession>`, `_disposeSequencer: SequencerByKey<string>`, `_shutdownPromise?: Promise<void>`. |
| **Modify** | [../agentHostMain.ts](../agentHostMain.ts) | Register `IClaudeAgentSdkService` next to `IClaudeProxyService`. |
| **Modify** | [../agentHostServerMain.ts](../agentHostServerMain.ts) | Same registration as `agentHostMain.ts`. |
| **Modify** | [/package.json](../../../../../../package.json) | Add `@anthropic-ai/claude-agent-sdk` at version **`0.2.112`** (versions > 0.2.112 add native deps — out of scope until Phase 15 per [roadmap.md §15](roadmap.md)). |
| **Modify** | [/remote/package.json](../../../../../../remote/package.json) | Same dep — agent host runs in the remote bundle too. |
| **Modify** | [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts) | Add `FakeClaudeAgentSdkService`. Replace stub-throw assertions for the 6 Phase-5-implemented methods with lifecycle cases (fork still throws). Add the mandatory cases in §5. |

## 3. Implementation spec

### 3.1 `IClaudeAgentSdkService` — lazy SDK wrapper

Mirrors the lazy-import pattern at [`claudeCodeSdkService.ts:78-93`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeSdkService.ts#L78-L93). The agent host runs in Electron's utility process; the dynamic `import()` keeps the heavy SDK out of cold-start paths and isolates the native-deps boundary.

```ts
export const IClaudeAgentSdkService = createDecorator<IClaudeAgentSdkService>('claudeAgentSdkService');

export interface IClaudeAgentSdkService {
    readonly _serviceBrand: undefined;
    listSessions(): Promise<readonly SDKSessionInfo[]>;
    getSessionMessages(sessionId: string): Promise<readonly SDKMessage[]>;
    // forkSession added in Phase 6 — fork requires a live SDK session handle
    // for protocol-turn-ID → SDK-event-ID translation; see §1.
}

export class ClaudeAgentSdkService implements IClaudeAgentSdkService {
    declare readonly _serviceBrand: undefined;

    constructor(@ILogService private readonly _logService: ILogService) { }

    /**
     * Cached resolved module. We deliberately cache the *resolved* value, not
     * the promise \u2014 if the dynamic import throws, the next call retries.
     * Mirrors the convention in [`agentHostTerminalManager.ts:60-66`](../agentHostTerminalManager.ts#L60-L66)
     * for `node-pty`. Retry cost is acceptable here because `listSessions()`
     * is called per user action (workbench open, refresh), not in a polling
     * loop. The first failure is logged via {@link _logFirstLoadFailure} so
     * a corrupt `node_modules` shows up clearly without flooding logs.
     */
    private _sdkModule: typeof import('@anthropic-ai/claude-agent-sdk') | undefined;
    private _firstLoadFailureLogged = false;

    protected async _loadSdk(): Promise<typeof import('@anthropic-ai/claude-agent-sdk')> {
        if (this._sdkModule) {
            return this._sdkModule;
        }
        try {
            this._sdkModule = await import('@anthropic-ai/claude-agent-sdk');
            return this._sdkModule;
        } catch (err) {
            if (!this._firstLoadFailureLogged) {
                this._firstLoadFailureLogged = true;
                this._logService.error('[ClaudeAgentSdkService] Failed to load @anthropic-ai/claude-agent-sdk; will retry on next call.', err);
            }
            throw err;
        }
    }

    async listSessions(): Promise<readonly SDKSessionInfo[]> {
        const sdk = await this._loadSdk();
        return sdk.listSessions(undefined);
    }
    // getSessionMessages similarly
}
```

**Phase-5 surface only.** No `query()` export, no `forkSession` \u2014 those land in Phase 6.

### 3.2 `ClaudeAgentSession` — per-session wrapper (minimal)

Phase-5 fields are the bare minimum. The class grows substantially in Phase 6.

```ts
export class ClaudeAgentSession extends Disposable {
    constructor(
        readonly sessionId: string,
        readonly sessionUri: URI,
        readonly workingDirectory: URI | undefined,
    ) {
        super();
    }

    // Phase 6 will add: _query, _abortController, _pendingPrompt, etc.
    // For Phase 5, dispose() is the inherited no-op — nothing yet to tear down.
}
```

**Working-directory ownership.** The wrapper is the single in-memory source of truth for the session's working directory while live, mirroring CopilotAgent's pattern (`CopilotAgentSession` and `IProvisionalSession` both hold `workingDirectory` directly — see [`copilotAgent.ts:603-615`](../copilot/copilotAgent.ts#L603-L615)). Persistence flows through `setMetadata('claude.customizationDirectory', …)` on fork and (Phase 6) on first `sendMessage`; resume-from-disk reconstructs the wrapper from that metadata. Phase 5 marks the field `readonly` because pre-prompt drafts can't change folder mid-life; Phase 6 may convert it to a settable field when worktree materialization is introduced (the worktree URI replaces the original folder while the customization-directory metadata still anchors plugin discovery to the user's pick).

This file exists in Phase 5 chiefly to nail down the import shape and DI boundary so Phase 6 is a pure-additive change.

### 3.3 `ClaudeAgent` — DI updates and lifecycle methods

Add three constructor deps, three private fields, and one metadata-key constant (Claude-namespaced, mirroring CopilotAgent's `_META_CUSTOMIZATION_DIRECTORY` at [`copilotAgent.ts:1304`](../copilot/copilotAgent.ts#L1304)):

```ts
private static readonly _META_CUSTOMIZATION_DIRECTORY = 'claude.customizationDirectory';

constructor(
    @ILogService private readonly _logService: ILogService,
    @ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
    @IClaudeProxyService private readonly _claudeProxyService: IClaudeProxyService,
    @ISessionDataService private readonly _sessionDataService: ISessionDataService,    // NEW
    @IClaudeAgentSdkService private readonly _sdkService: IClaudeAgentSdkService,      // NEW
) { super(); }

private readonly _sessions = this._register(new DisposableMap<string, ClaudeAgentSession>());
private readonly _disposeSequencer = new SequencerByKey<string>();
private _shutdownPromise: Promise<void> | undefined;
```

Both `agentHostMain.ts` and `agentHostServerMain.ts` use `instantiationService.createInstance(ClaudeAgent)` already — DI resolves the new deps automatically once they are registered (see §3.6).

#### 3.3.1 `createSession`

**Fork is deferred to Phase 6** (see §1). When `config.fork` is set, throw `Error('TODO: Phase 6: fork requires SDK session handle for protocol-turn-ID → SDK-event-ID translation')`. The non-fork path is in-memory only; no DB writes, no SDK calls.

`AgentService.createSession` ([`agentService.ts:269-282`](../agentService.ts#L269-L282)) **already** builds `config.fork.turnIdMapping` from the source session's turns BEFORE calling `provider.createSession(config)`. Providers are consumers of the mapping, not authors. Phase 6 implementation will use this; Phase 5 ignores the field by virtue of throwing.

**Post-PR #313841 invariant** (relevant for Phase 6 once fork lands): AgentService drops `config.fork` for sources with zero turns ([`agentService.ts:269-282`](../agentService.ts#L269-L282)) — a forkless source is indistinguishable from a fresh session, so the call falls through to the non-fork path. Phase 6's fork branch will therefore be guaranteed `config.fork.session` has ≥ 1 turn and `config.fork.turnIdMapping` is non-empty.

```ts
async createSession(config: IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult> {
    if (config.fork) {
        // Fork requires translating `config.fork.turnId` (a protocol turn ID)
        // to an SDK event ID via the live source SDK session handle. Phase 5
        // has no SDK session machinery, so the translation is structurally
        // unavailable. Phase 6 picks this up alongside sendMessage by
        // resuming the source via `_resumeSession` and calling
        // `getNextTurnEventId(...)` (mirrors CopilotAgent at
        // copilotAgent.ts:589-592).
        throw new Error('TODO: Phase 6: fork requires SDK session handle');
    }

    // Non-fork path: in-memory only. Mirrors Claude Code's "no message → no session"
    // semantic. First sendMessage (Phase 6) writes the SDK session record and
    // metadata. AgentService now eagerly creates sessions on folder-pick (PR #313841)
    // and arms a 30s GC that calls disposeSession if the user abandons the
    // new-chat view; for an empty Claude session that's a cheap in-memory drop
    // because nothing has been persisted yet. Note: we do NOT set
    // `provisional: true` on the result — that opt-in would defer
    // `sessionAdded` until ClaudeAgent fires `onDidMaterializeSession`, but
    // Phase 5 has no SDK session to materialize. Returning without
    // `provisional` makes AgentService dispatch `SessionReady` immediately
    // (the desired behaviour for Claude until Phase 6 introduces real
    // materialization work).
    const sessionId = generateUuid();
    const sessionUri = AgentSession.uri(this.id, sessionId);
    const session = new ClaudeAgentSession(sessionId, sessionUri, config.workingDirectory);
    this._sessions.set(sessionId, session);
    return { session: sessionUri, workingDirectory: config.workingDirectory };
}
```

Note: `IAgentCreateSessionConfig` carries `workingDirectory?: URI` — there is no `customizationDirectory` field on the config. The customization directory is the user-picked folder (Claude doesn't materialize a worktree until Phase 6 / Phase 15), so `config.workingDirectory` is the right source for both purposes in Phase 5. The return type is `IAgentCreateSessionResult` ([`agentService.ts:124-145`](../../common/agentService.ts#L124-L145)); we populate `session` and `workingDirectory` and intentionally omit `provisional`.

#### 3.3.2 `listSessions`

**SDK is source of truth.** Per-session DB is overlay/cache only. External Claude Code sessions (CLI, other clients) MUST surface — that's a Phase-5 exit criterion.

CopilotAgent's pattern at `copilotAgent.ts:519-541` has a latent bug: `Promise.all` over fan-out reads where any rejection drops the whole listing. ClaudeAgent must follow the resilient pattern at [`agentService.ts:188-204`](../../common/agentService.ts#L188-L204) — each iteration wraps its own try/catch and returns the SDK-provided entry on failure.

```ts
async listSessions(): Promise<readonly IAgentSessionMetadata[]> {
    const sdkEntries = await this._sdkService.listSessions();
    return Promise.all(sdkEntries.map(async entry => {
        // Per-session DB overlay. Failure here NEVER excludes the session.
        try {
            const sessionUri = AgentSession.uri(this.id, entry.sessionId);
            const dbRef = await this._sessionDataService.tryOpenDatabase(sessionUri);
            if (dbRef) {
                try {
                    const customizationDirectory = await dbRef.object.getMetadata(
                        ClaudeAgent._META_CUSTOMIZATION_DIRECTORY,
                    );
                    return this._toAgentSessionMetadata(entry, { customizationDirectory });
                } finally {
                    dbRef.dispose();
                }
            }
        } catch (err) {
            this._logService.warn(err, `[Claude] Overlay read failed for session ${entry.sessionId}`);
        }
        // External session, or DB read failed: surface what the SDK gave us.
        return this._toAgentSessionMetadata(entry, {});
    }));
}
```

**No filter** like CopilotAgent's `if (!metadata) return undefined` at `copilotAgent.ts:521-523`. That filter is what hides external sessions today; ClaudeAgent doesn't reproduce it. Title / isRead / isArchived / diffs decoration is already handled generically by [`AgentService.listSessions`](../../common/agentService.ts#L188-L204).

**No `dir` scoping.** `IAgent.listSessions()` has no `dir` parameter ([`agentService.ts:467`](../../common/agentService.ts#L467)) and `IClaudeAgentSdkService.listSessions()` mirrors that surface. The SDK service translates this to `sdk.listSessions(undefined)` internally — the host doesn't expose `dir` plumbing. If/when `IAgent` grows an optional `dir`, the SDK service surface grows in lockstep.

#### 3.3.3 `getSessionMessages`

```ts
async getSessionMessages(_session: URI): Promise<readonly IAgentMessage[]> {
    return [];   // Phase 13 owns full transcript reconstruction.
}
```

A code comment must reference Phase 13 explicitly so future readers don't silently fill this in.

#### 3.3.4 `disposeSession`

Sequencer-serialized. Removes the wrapper from `_sessions`. Does **NOT** delete the SDK session, does **NOT** delete the DB — Phase 13 owns deletion.

```ts
disposeSession(session: URI): Promise<void> {
    const sessionId = AgentSession.id(session);
    return this._disposeSequencer.queue(sessionId, async () => {
        this._sessions.deleteAndDispose(sessionId);  // safe if missing
    });
}
```

#### 3.3.5 `resolveSessionConfig` / `sessionConfigCompletions`

Decision **B5** from the planning conversation: Claude-native single-axis schema. The platform `Mode`/`AutoApprove` keys are subsumed by `permissionMode`. The `Permissions` key is reused from `platformSessionSchema` because Claude SDK accepts `allowedTools` / `disallowedTools` natively, so the platform key is a faithful representation.

Add a new file [../../common/claudeSessionConfigKeys.ts](../../common/claudeSessionConfigKeys.ts):

```ts
export const enum ClaudeSessionConfigKey {
    PermissionMode = 'permissionMode',
}
```

Implementation:

```ts
async resolveSessionConfig(_session: URI | undefined): Promise<IResolvedAgentSessionConfig> {
    const sessionSchema = createSchema({
        [ClaudeSessionConfigKey.PermissionMode]: schemaProperty<PermissionMode>({
            type: 'string',
            title: localize('claude.sessionConfig.permissionMode', "Approvals"),
            description: localize('claude.sessionConfig.permissionModeDescription', "How Claude handles tool approvals."),
            enum: ['default', 'acceptEdits', 'bypassPermissions', 'plan'],
            enumLabels: [
                localize('claude.sessionConfig.permissionMode.default', "Ask Each Time"),
                localize('claude.sessionConfig.permissionMode.acceptEdits', "Auto-Approve Edits"),
                localize('claude.sessionConfig.permissionMode.bypassPermissions', "Bypass Approvals"),
                localize('claude.sessionConfig.permissionMode.plan', "Plan Only (Read-Only)"),
            ],
            enumDescriptions: [
                localize('claude.sessionConfig.permissionMode.defaultDescription', "Prompt for every tool call."),
                localize('claude.sessionConfig.permissionMode.acceptEditsDescription', "Auto-approve file edits; prompt for shell and other tools."),
                localize('claude.sessionConfig.permissionMode.bypassPermissionsDescription', "Auto-approve every tool call."),
                localize('claude.sessionConfig.permissionMode.planDescription', "Read-only research mode; no tool calls executed."),
            ],
            default: 'default',
            sessionMutable: true,
        }),
        [SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions],
    });
    return {
        schema: sessionSchema,
        values: { /* defaults applied by the caller via schema.default */ },
    };
}

async sessionConfigCompletions(_session: URI | undefined, _property: string, _query: string): Promise<IAgentSessionConfigCompletions> {
    return { items: [] };   // permissionMode is enum; no dynamic completion needed
}
```

**Skipped keys:**
- `SessionConfigKey.AutoApprove`, `SessionConfigKey.Mode` — subsumed by `permissionMode`.
- `SessionConfigKey.Isolation`, `Branch`, `BranchNameHint` — deferred to Phase 6 prerequisite (§8 worktree-extraction note).

**Why this works for the workbench UI** (verified live):
- [`AgentHostModePicker`](../../../../../sessions/contrib/chat/browser/agentHost/agentHostModePicker.ts#L128-L141) renders nothing when `schema.properties[Mode]` is absent or fails `isWellKnownModeSchema()`. Claude sessions don't show a mode picker — the right behavior.
- [`AgentHostSessionConfigPicker`](../../../../../sessions/contrib/chat/browser/agentHost/agentHostSessionConfigPicker.ts#L326) is the generic per-property fallback. It renders a dropdown for any string-enum property in the schema. **`permissionMode` gets a dropdown for free, no workbench changes needed.**
- The pre-existing `ClaudePermissionModePicker` (`src/vs/sessions/contrib/copilotChatSessions/browser/claudePermissionModePicker.ts`) is for **extension-based** Claude (`CopilotChatSessionsProvider`), not agent-host Claude. The two coexist via `when` clauses. Eventually the extension picker should be deleted in favor of the generic schema-driven path; that cleanup is documented as tech debt in `COPILOT_CHAT_SESSIONS_PROVIDER.md:157` and is out of scope for Phase 5.

#### 3.3.6 `shutdown` and `dispose`

Memoized idempotent shutdown. Mirrors CopilotAgent's pattern at [`copilotAgent.ts:1057-1068`](../copilot/copilotAgent.ts#L1057-L1068).

```ts
shutdown(): Promise<void> {
    this._shutdownPromise ??= (async () => {
        // Phase 6+ INVARIANT: SDK Query subprocesses MUST be aborted before
        // disposing the proxy handle, AND any in-flight createSession /
        // sendMessage I/O must be drained first. Phase 5 has no Query
        // objects and no async createSession path (fork is Phase 6), so the
        // _sessions map only holds in-memory wrappers — disposal here is
        // sequencing for Phase 6, not real teardown work. Phase 6 will
        // introduce `_inFlightCreates: Set<Promise<unknown>>` and prepend
        // `await Promise.allSettled([...this._inFlightCreates])` to this
        // body when fork + sendMessage materialization land.
        //
        // Per-session teardown goes through `_disposeSequencer` so a
        // concurrent `disposeSession(uri)` already in flight is awaited
        // before shutdown reuses the same key. In Phase 5 the queued work
        // is synchronous, so the sequencer is mostly a no-op; the routing
        // matters in Phase 6 when teardown grows real async work (Query
        // abort, in-flight metadata writes).
        const sessionIds = [...this._sessions.keys()];
        await Promise.all(sessionIds.map(sessionId =>
            this._disposeSequencer.queue(sessionId, async () => {
                this._sessions.deleteAndDispose(sessionId);
            })
        ));
    })();
    return this._shutdownPromise;
}

override async dispose(): Promise<void> {
    await this.shutdown();              // ordered: drain sessions
    this._proxyHandle?.dispose();        // then release proxy refcount
    this._proxyHandle = undefined;
    this._githubToken = undefined;
    this._models.set([], undefined);
    super.dispose();
}
```

The `await shutdown(); _proxyHandle?.dispose();` ordering preserves the Phase-4 invariant comment at `claudeAgent.ts:241-248`. **In Phase 6 this becomes load-bearing** — Query subprocesses talk to the proxy and must die first.

### 3.4 DI registration

Both `agentHostMain.ts` and `agentHostServerMain.ts` already register `ICopilotApiService` and `IClaudeProxyService`. Add `IClaudeAgentSdkService` next to `IClaudeProxyService` in **both** files:

```ts
const claudeAgentSdkService = disposables.add(instantiationService.createInstance(ClaudeAgentSdkService));
diServices.set(IClaudeAgentSdkService, claudeAgentSdkService);
```

If `ClaudeAgentSdkService` doesn't need disposal (no held resources beyond the lazy SDK module reference), the `disposables.add()` wrapper is still the right call \u2014 the codebase convention at [`agentHostMain.ts:112`](../agentHostMain.ts#L112) wraps `ClaudeProxyService` unconditionally even when there's nothing meaningful to release. Symmetry over micro-optimization.

### 3.5 No subagent parsing in Phase 5

`parseSubagentSessionUri` and the `subagentOf` URI authority are explicitly **deferred to Phase 12**. ClaudeAgent's session URIs in Phase 5 are flat: `claude:/<sessionId>`.

`listSessions` is safe to use unfiltered: the SDK's `listSessions(_options?)` only enumerates top-level sessions by filesystem layout convention. Subagent transcripts live in a nested `subagents/agent-<id>.jsonl` directory inside the parent session's storage and are only reachable through the separate `listSubagents(sessionId)` API (Phase 12+). The returned `SDKSessionInfo` shape carries no parent/subagent discriminator field, so filtering at this layer would be impossible regardless — but it isn't needed. Verified against `@anthropic-ai/claude-agent-sdk@0.2.112`'s `sdk.d.ts`.

### 3.6 No `IClaudeSessionTranscriptStore` seam

The roadmap originally proposed introducing `IClaudeSessionTranscriptStore` in Phase 5 as a seam for the future hybrid (SDK + `sessionStore` alpha) implementation. **Deferred to Phase 13** by 2-of-3 reviewer consensus — the seam is dead code today and Phase 13 (transcript reconstruction) is the natural place to introduce it. `getSessionMessages` returns `[]` directly in Phase 5.

## 4. Persistence model (the load-bearing decision)

| Source | Owns | Phase 5 reads | Phase 5 writes |
|---|---|---|---|
| **SDK** (`@anthropic-ai/claude-agent-sdk` JSONL on disk) | Session existence, transcripts, last-modified | `listSessions` | None — fork (which would write) is Phase 6 |
| **Per-session DB** (`ISessionDataService.openDatabase(uri)`) | Overlay/cache: `customizationDirectory` (Claude-namespaced), project info | `listSessions` (overlay only) | None in Phase 5 — fork's `vacuumInto`/`remapTurnIds`/`setMetadata` and sendMessage's metadata write are both Phase 6 |
| **In-memory `_sessions` map** | Active wrapper objects, dispose lifecycle | `disposeSession` | `createSession` (non-fork) |

**Three rules:**

1. **Non-fork `createSession` does NOT touch disk.** First `sendMessage` (Phase 6) writes the SDK session record. Pre-prompt drafts that the user abandons (workspace switch, new-chat close) are GC'd by AgentService 30 s after the last subscriber drops via `disposeSession` (PR #313841, [`agentService.ts SESSION_GC_GRACE_MS`](../agentService.ts)) — for Claude this is a cheap in-memory wrapper drop because no DB row exists yet.
2. **Fork `createSession` is unimplemented in Phase 5** (throws `TODO: Phase 6`). Phase 6 will add the vacuum + remap + setMetadata pipeline alongside the SDK-session machinery that translates protocol turn IDs to SDK event IDs. The DB schema and metadata key (`'claude.customizationDirectory'`) are reserved for Phase 6's use.
3. **`listSessions` never excludes a session because of DB read failure.** The SDK is the source of truth; the DB is decoration.

## 5. Test file spec

Modify [`../../test/node/claudeAgent.test.ts`](../../test/node/claudeAgent.test.ts). The existing 14 Phase-4 cases stay; replace the stub-throw assertions for the 6 Phase-5-implemented methods (fork still throws, kept) and add the new lifecycle cases below.

**New fakes:**

- `FakeClaudeAgentSdkService` implementing `IClaudeAgentSdkService` (Phase-5 surface: `listSessions` + `getSessionMessages` only). Configurable `_sessionList: SDKSessionInfo[]`. Track call counts for verification.
- Reuse [`createNullSessionDataService()`](../../test/common/sessionTestHelpers.ts) (in-memory variant) — extend it inline in the test file if a richer fake is needed (e.g. to simulate a corrupt DB by having `tryOpenDatabase` reject for one specific sessionId).
- `RecordingLogService extends NullLogService` — overrides `error(...)` to push the args into a public `errorCalls: unknown[][]` array. Used by test 11 to assert the log-once contract on `_loadSdk` failures.
- `TestableClaudeAgentSdkService extends ClaudeAgentSdkService` — overrides the protected `_loadSdk()` method to throw on demand (controlled by a public `failNext: boolean` flag). Used by test 11 to simulate dynamic-import failure without touching `node_modules`.

**Mandatory cases** (use `assert.deepStrictEqual` for snapshot-style assertions per repo guideline):

1. **`createSession` non-fork — no DB writes, no SDK calls.** Returns `claude:/<uuid>` URI; UUID is host-minted (`generateUuid()` shape). Assert via fakes that **none of `openDatabase`, `tryOpenDatabase`, or any `IClaudeAgentSdkService` method was called.**
2. **`createSession({ fork })` throws `TODO: Phase 6`.** With `config.fork = { session, turnId, turnIndex, turnIdMapping }` set, `createSession` rejects with an error whose message contains `"Phase 6"`. Assert no entry was added to `_sessions`, no DB was opened, and no SDK call was made.
3. **`listSessions` returns SDK entries decorated with overlay.** Two SDK sessions: one has a local DB with `customizationDirectory: '/foo'`, one doesn't. Assert both surface; only the first carries the overlay value.
4. **`listSessions` includes external sessions.** Sessions surfaced by the SDK that have no local DB at all (external Claude Code CLI sessions) MUST appear in the result with whatever fields the SDK provided.
5. **`listSessions` resilience: corrupt-DB does not poison the listing.** Three SDK sessions; fake `tryOpenDatabase` rejects for one specific sessionId. Result still has all three entries (the corrupt one falls back to the SDK-only entry, not undefined).
6. **`getSessionMessages` returns `[]`** — comment in test cites Phase 13.
7. **`disposeSession` removes from `_sessions`, leaves SDK + DB alone.** Subsequent `listSessions` (still driven by SDK) shows the session — `dispose` is a wrapper-removal, not a deletion.
8. **`disposeSession` is safe for unknown sessionId** — no-op, no throw.
9. **`shutdown` is idempotent** — call twice in parallel; second call returns the same memoized promise; no double-iteration over `_sessions`.
10. **`dispose` ordering: shutdown then proxy.** Use a sentinel proxy handle whose `dispose()` records a timestamp; after `agent.dispose()`, assert the recorded shutdown completion strictly precedes the proxy disposal.
11. **`ClaudeAgentSdkService` log-once-on-failure.** Construct a `TestableClaudeAgentSdkService` with `failNext = true` and a `RecordingLogService`. Call `listSessions()` twice in sequence; both calls reject. Assert `recordingLogService.errorCalls.length === 1` (NOT 2). Then set `failNext = false` and resolve `_sdkModule` to a stub returning `[]`; `listSessions()` resolves and `errorCalls.length` stays at 1 (success doesn't re-log). This locks the contract that diagnosis logs aren't spammy.
12. **`shutdown` and `disposeSession` share the dispose sequencer (Phase-6 race guard).** Inject a `ClaudeAgentSession` subclass whose `dispose()` increments a per-instance `disposeCount` and (optionally) awaits a deferred to slow teardown to a controllable scale. Create two sessions, fire `agent.disposeSession(s1)` and `agent.shutdown()` without awaiting either, then resolve all deferreds. Assert each wrapper's `disposeCount === 1` (NOT 2 — no double-dispose). Assert `_sessions` is empty afterwards. The test passes trivially in Phase 5 (sync dispose), but locks the contract so Phase 6's real async teardown can't regress.

**Resolved-config cases** (replace existing stub-throw assertions):

13. **`resolveSessionConfig`** returns a schema with `permissionMode` (4-value enum) and `Permissions` (the platform key), and **no other** properties. Snapshot-compare the schema definition.
14. **`sessionConfigCompletions`** returns `{ items: [] }` for any property/query.

Use `ensureNoDisposablesAreLeakedInTestSuite()` at the top of the suite (already there from Phase 4).

## 6. Risks / gotchas

| Risk | Mitigation |
|---|---|
| `@anthropic-ai/claude-agent-sdk@0.2.112` may pull native deps via postinstall. | After `npm install`, run `npm ls @anthropic-ai/claude-agent-sdk`. Verify pure-JS shape — no `node-gyp` rebuilds, no platform-specific binary downloads. If 0.2.112 has native steps, escalate before merging Phase 5; the roadmap's Phase 15 boundary (versions > 0.2.112 add native deps) implies 0.2.112 itself is clean, but verify. |
| Lazy `import('@anthropic-ai/claude-agent-sdk')` in a utility process Node context. | Extension uses the same pattern; agent host runs in Electron's utility process. Validate with the live smoke (§7.6) before declaring done. Low risk but a real failure mode. |
| SDK dynamic-import fails (corrupt `node_modules`, postinstall failure). | `_loadSdk` caches the resolved module on success and retries on failure (matches `agentHostTerminalManager.ts` node-pty pattern). First failure is logged once via `ILogService.error` so it's diagnosable; subsequent failures retry silently. `listSessions` is per user action, not a polling loop, so retry storms aren't a concern. |
| `Promise.all` over fan-out reads silently corrupts `listSessions`. | §3.3.2 inner-try/catch pattern. Test 5 codifies the invariant. **Do not copy CopilotAgent's structure verbatim — it has the bug.** |
| `disposeSession` race with concurrent `listSessions` reading `_sessions`. | `_disposeSequencer.queue(sessionId, ...)` serializes per-session teardown. `listSessions` reads from the SDK, not `_sessions`, so the race is moot in practice — but the sequencer matters in Phase 6 when teardown also aborts a `Query`. |
| `disposeSession(uri)` racing concurrent `shutdown()` could double-dispose the same wrapper in Phase 6. | `shutdown()` routes per-session teardown through the same `_disposeSequencer` that `disposeSession` uses, so an in-flight per-session call is awaited before shutdown disposes the same key. Phase 5 dispose is synchronous so the race is benign, but the routing is locked in now so Phase 6's real async teardown (`Query` abort, in-flight metadata writes) inherits the serialization for free. Test 12 codifies the contract. |
| Fork is unimplemented in Phase 5; workbench may attempt to fork. | `createSession({ fork })` throws `TODO: Phase 6`; the workbench surfaces this as a session-creation error. UX impact: "Restart from here" / similar fork triggers will fail visibly when targeting a Claude session. Acceptable because (a) Phase 5 is gated behind a setting and an env var, (b) Phase 6 closes the gap. Test 10 codifies the throw. |
| Phase-6 `dispose` order silently regressed. | Test 10 (sentinel-timestamp) catches inversion. Comment block at the top of `dispose()` cites the invariant. |
| Pre-prompt drafts disappear when the user abandons new-chat. | Intentional. Per PR #313841, AgentService eagerly creates the session on folder-pick and arms a 30 s GC timer that fires `disposeSession` if the last subscriber drops while the session has zero turns. For Claude that means createSession + disposeSession is silently exercised every time a user opens new-chat and walks away — both must be cheap. The non-fork path is in-memory only and Phase-6 disposeSession will be a wrapper drop, so this is fine. Test 1 codifies the no-DB-write invariant. |
| `createSession` and `disposeSession` are now hot paths (folder-pick + 30 s GC). | Phase 5 createSession is in-memory for the only implemented case (non-fork) → cheap. Phase 6 disposeSession must stay cheap; if Claude later needs heavier setup at create time we can opt into the `provisional`/`onDidMaterializeSession` pattern (PR #313841) instead of paying it eagerly. |
| External-session UI rendering: `SDKSessionInfo` may not include `cwd` / `workingDirectory`. | Phase 5 surfaces what the SDK gives us. If the chat UI needs `cwd` to render a sensible label, Phase 13 (transcript reconstruction) will add JSONL-derived enrichment. Not a Phase-5 blocker. |
| `IAgent.listSessions()` has no `dir` parameter. | `IClaudeAgentSdkService.listSessions()` mirrors the surface (no `dir` parameter). Internally it calls `sdk.listSessions(undefined)`. Future enhancement if/when `IAgent` gains an optional `dir`. |
| Workbench UI lacks a permission-mode picker for Claude sessions. | The generic `AgentHostSessionConfigPicker` auto-renders any string-enum property. Verified live (§3.3.5). No workbench code changes needed in Phase 5. |
| Both `agentHostMain.ts` and `agentHostServerMain.ts` need the new SDK service registration. | §3.4 lists both. Forgetting `agentHostServerMain.ts` causes server-mode crashes the same way Phase 4 missed it. |

## 7. Acceptance criteria

The PR is **done** when every box below is checked. Run them in order — earlier failures invalidate later checks.

### 7.1 Code structure

- [ ] [claudeAgentSdkService.ts](claudeAgentSdkService.ts) exports `IClaudeAgentSdkService` decorator + `ClaudeAgentSdkService` impl. Lazy SDK module load (cached on success, retries on failure, logs first failure once — mirrors `agentHostTerminalManager.ts` node-pty pattern). Phase-5 surface only (`listSessions`, `getSessionMessages` — no `forkSession`, no `query()`).
- [ ] [claudeAgentSession.ts](claudeAgentSession.ts) exports `ClaudeAgentSession extends Disposable` with `sessionId`, `sessionUri`, `workingDirectory` fields. No `_query` / `_abortController` yet.
- [ ] [claudeAgent.ts](claudeAgent.ts) constructor adds `@ISessionDataService` + `@IClaudeAgentSdkService`. Class adds `_sessions: DisposableMap`, `_disposeSequencer: SequencerByKey`, `_shutdownPromise?: Promise<void>`.
- [ ] All 7 Phase-5 stubs are real implementations or, in the case of `createSession` with `config.fork`, throw `TODO: Phase 6`. None throw `TODO: Phase 5`.
- [ ] Phase-6+ stubs (`sendMessage`, `respondToPermissionRequest`, etc.) still throw `TODO: Phase N`.
- [ ] `dispose()` order is `await shutdown(); _proxyHandle?.dispose(); super.dispose();` with a comment citing the Phase-6 invariant.
- [ ] Microsoft copyright header on every new file.
- [ ] No `as any` / `as unknown as Foo` casts in test or production code.

### 7.2 Schema & DI

- [ ] [../../common/claudeSessionConfigKeys.ts](../../common/claudeSessionConfigKeys.ts) exists exporting `ClaudeSessionConfigKey.PermissionMode = 'permissionMode'`.
- [ ] `resolveSessionConfig` returns ONLY `permissionMode` + reused `Permissions` from `platformSessionSchema`. No `AutoApprove`, no `Mode`, no `Isolation`, no `Branch`, no `BranchNameHint`.
- [ ] Both `agentHostMain.ts` AND `agentHostServerMain.ts` register `IClaudeAgentSdkService` next to `IClaudeProxyService`.

### 7.3 Persistence invariants (assert in tests)

- [ ] Non-fork `createSession` does NOT call `ISessionDataService.openDatabase` or `tryOpenDatabase`, and does NOT call any `IClaudeAgentSdkService` method.
- [ ] `createSession({ fork })` rejects with a `TODO: Phase 6` error and produces no side effects (no `_sessions` entry, no DB call, no SDK call).
- [ ] `listSessions` returns one entry per SDK session, including those with no local DB.
- [ ] `listSessions` is resilient to single-DB-read failure (no `Promise.all`-over-throwables corruption).

### 7.4 Compile + lint + layers

- [ ] `VS Code - Build` task shows zero TypeScript errors. If task is unavailable, `npm run compile-check-ts-native` exits 0.
- [ ] `npm run eslint -- src/vs/platform/agentHost/node/claude src/vs/platform/agentHost/test/node/claudeAgent.test.ts` exits 0.
- [ ] `npm run valid-layers-check` exits 0.
- [ ] `npm run hygiene` exits 0.
- [ ] `npm ls @anthropic-ai/claude-agent-sdk` shows exactly `0.2.112`, no native build steps in the install log.

### 7.5 Tests

- [ ] All 14 Phase-4 cases still pass.
- [ ] All 14 new cases from §5 pass.
- [ ] `scripts/test.sh --grep ClaudeAgent` exits 0.
- [ ] `ensureNoDisposablesAreLeakedInTestSuite()` is at the top of the suite (preserved from Phase 4).

### 7.6 Live-system smoke (mandatory before merging)

Follow the Phase-4 smoke harness ([smoke.md](smoke.md), [scripts/launch-smoke.sh](scripts/launch-smoke.sh)). Phase-5 additions:

- [ ] **Disabled-gate run executed** (deferred for Phase 4 per [phase4-plan.md §7.8](phase4-plan.md); re-required for Phase 5). With `chat.agentHost.claudeAgent.enabled: false` and no env var, the workbench shows only `'copilotcli'` in root state.
- [ ] **Enabled-gate run.** Pick Claude in the picker; observe `claude:/<uuid>` in the IPC log (same evidence shape as Phase 4 — but now `createSession` succeeded for real, not via TODO).
- [ ] **First user prompt now surfaces `TODO: Phase 6`**, not `TODO: Phase 5`. Capture the response error.
- [ ] **External-session visibility.** With Claude Code CLI sessions present in `~/.claude/sessions/` (or whatever the SDK uses on the smoke machine), they appear in the workbench session list alongside agent-host-created ones. If the smoke machine has none, create one out-of-band via `claude-code` CLI, then verify it surfaces.
- [ ] **Clean shutdown.** Kill the agent host process; logs show no unhandled rejection from a hung `Query` (there is no Query yet — but `shutdown()` should run its memoized promise to completion).
- [ ] **Empty-session GC (PR #313841).** Open new-chat against Claude, pick the folder, optionally pick a model, then close the new-chat view without sending a message. Within ~30 s the agent host log shows `GC: disposing empty unsubscribed session claude:/<uuid>` and ClaudeAgent's `disposeSession` runs cleanly (no DB file written, no thrown errors, `_sessions` no longer contains the entry).
- [ ] Smoke artifacts saved under `/tmp/claude-phase5-smoke/<timestamp>/`: `registration.log`, `disabled-gate.log`, `claude-session-uris.log`, `external-session.log`, `todo-phase6-error.png`, `shutdown.log`, `empty-session-gc.log`.

### 7.7 PR readiness

- [ ] PR title: `agentHost/claude: Phase 5 — session lifecycle`.
- [ ] PR description links to [roadmap.md](roadmap.md) Phase 5 and to this plan; notes that exit criteria are met.
- [ ] PR description lists the 7 implemented stubs + the 9 still-stubbed methods + their target phase as a table.
- [ ] PR description calls out the Phase-6 contract notes (worktree-extraction prerequisite, `canUseTool` consumes `permissionMode` + `Permissions` directly — see §8).
- [ ] PR is opened as draft until the build passes; promote when green.

### 7.8 What to do if a step fails

| Failure | Likely cause | First debugging step |
|---|---|---|
| `npm ls` shows native build steps | SDK version drifted to > 0.2.112 | Pin to exact `0.2.112` (no caret) in both root and `remote/` `package.json`. |
| `Cannot find module '@anthropic-ai/claude-agent-sdk'` from a utility process | Lazy import resolved against the wrong root | Verify `agentHostMain.ts` was bundled with the SDK in `node_modules` reachable from the utility process working directory. Check `agentHostServerMain.ts` similarly. |
| `valid-layers-check` fails | Imported a workbench/sessions symbol from `vs/platform/agentHost/` | Only `vs/base`, `vs/platform`, `vs/typings` allowed. The Claude permission-mode picker is workbench-side and must NOT be referenced from the platform layer. |
| Test 5 (corrupt-DB resilience) flakes | Used `Promise.all` instead of `await Promise.all(map(async ... try/catch))` | Inline-try/catch pattern from `agentService.ts:188-204`, NOT the bulk-`Promise.all` from `copilotAgent.ts:519-541`. |
| Test 10 (dispose ordering) fails | `dispose()` body called `_proxyHandle?.dispose()` before awaiting `shutdown()` | Reorder. The `await` matters — fire-and-forget breaks Phase 6. |
| `listSessions` test surfaces zero entries when SDK returns three | Filter inadvertently introduced (e.g. `if (!metadata) return undefined`) | Remove. SDK is source of truth; filter excludes external sessions. |
| Live smoke shows external Claude Code sessions but agent-host-created ones disappear after restart | Non-fork `createSession` is writing partial DB rows | Verify `openDatabase` is NOT called in the non-fork path. The "disappears after restart" symptom is the correct behavior for Phase 5 — pre-prompt drafts don't persist. |
| Live smoke shows `TODO: Phase 5` instead of `TODO: Phase 6` after first prompt | One of the seven Phase-5 methods still throws | Grep `TODO: Phase 5` in `claudeAgent.ts`; remaining hits are bugs. |

## 8. Phase-6 contract notes (record now, implement then)

These are decisions Phase 5 locks down so Phase 6 is a pure-additive change. They don't ship code in Phase 5 but they bind the schema and the lifecycle.

**Permission-mode resolution helper (Phase 6 will add this method):**

```ts
// src/vs/platform/agentHost/node/claude/claudeAgent.ts (Phase 6)
private _resolveClaudePermissionMode(sessionUri: URI): PermissionMode {
    // Read the session's permissionMode value; fall back to schema default.
    // canUseTool callback consumes BOTH this and the Permissions key directly —
    // NO translation table, NO mapping. Single source of truth.
    const mode = this._configurationService.getEffectiveValue(
        sessionUri.toString(), claudeSessionSchema, ClaudeSessionConfigKey.PermissionMode);
    return isPermissionMode(mode) ? mode : 'default';
}
```

Phase 6's `canUseTool` reads `permissionMode` + `Permissions` directly. **NO `AutoApprove`-to-`permissionMode` translation helper.** Each provider owns its own permission semantics; the platform schema doesn't impose one.

**Phase-6 prerequisite — extract `IAgentWorktreeService`:**

`Isolation`, `Branch`, `BranchNameHint`, and `_resolveSessionProject` are about computing the cwd the agent runs in (possibly creating a git worktree, possibly resolving project info from cwd). All of this is provider-agnostic by nature. Today it lives inside `CopilotAgent`:

- Worktree metadata: [copilot/copilotAgent.ts:1263-1325](../copilot/copilotAgent.ts#L1263-L1325)
- Project resolution: [copilot/copilotAgent.ts:521](../copilot/copilotAgent.ts#L521) (`_resolveSessionProject`)

Claude needs the same semantic but advertising those keys without a backing implementation ships a UI lie. **Phase 6 (or a separate prerequisite PR) extracts `IAgentWorktreeService`** to the platform layer and updates both providers to consume it. Both providers then advertise `Isolation`/`Branch`/`BranchNameHint` in their schemas.

**Cross-cutting principle to record in [CONTEXT.md](CONTEXT.md):** when Claude needs a "platform" capability that's actually living inside CopilotAgent, the right fix is to **lift it into the platform**, not duplicate it. Applies to worktrees, project resolution, and likely more as we cross into Phase 7+.

## 9. Resolved decisions

**Why is `listSessions` not gated on local-DB existence?**
The SDK is source of truth. CopilotAgent's pattern at `copilotAgent.ts:521-523` filters out sessions without local metadata, which has the side effect of hiding externally-created Claude Code sessions (CLI, Cursor, etc.). That's exactly the population the Phase-5 exit criterion calls out. The DB is overlay/cache only.

**Why does non-fork `createSession` skip the DB write?**
Mirrors Claude Code's "no message → no session" semantic. Pre-prompt drafts are in-memory only; first `sendMessage` (Phase 6) writes the SDK session record. Avoids phantom DB rows when users open the picker, hesitate, and quit without sending. The cost — drafts evaporate on app close — is acceptable and matches the SDK's own behavior.

**Why is the schema Claude-native (`permissionMode`) instead of platform-conforming (`AutoApprove` + `Mode`)?**
Decision **B5**. The `SessionConfigKey` doc-comment at [`sessionConfigKeys.ts:6-15`](../../common/sessionConfigKeys.ts) splits keys into platform-consumed (`AutoApprove`, `Permissions`, `Mode`) and client-convention (`Isolation`, `Branch`, `BranchNameHint`). But [`SessionPermissionManager`](../../common/sessionPermissions.ts#L117-L167) — the only reader of `AutoApprove` — fires only from Copilot SDK `pending_confirmation` signals. Claude SDK invokes `canUseTool` **directly** before each call, completely independent of platform gating. So `AutoApprove` is effectively a Copilot-private knob; Claude has no obligation to advertise it. The `permissionMode` enum (4 values) collapses what Copilot expresses as 2 axes (`AutoApprove` × `Mode`) into Claude's native single axis. Workbench UI is schema-driven and adapts automatically (§3.3.5).

**Why is `turnIdMapping` consumed but not built by `ClaudeAgent.createSession`?**
[`AgentService.createSession`](../../common/agentService.ts#L252-L264) **already** builds `turnIdMapping` from the source session's turns BEFORE calling `provider.createSession(config)`. Providers are consumers, not authors. CopilotAgent's older inline-build pattern at `copilotAgent.ts:633` predates the centralized mapping; `ClaudeAgent` follows the new contract.

**Why no `IClaudeSessionTranscriptStore` seam in Phase 5?**
2-of-3 reviewer consensus. The seam is dead code today — the only consumer would be `getSessionMessages`, which returns `[]` until Phase 13 anyway. Introducing the seam now means committing to an interface shape before we know what the hybrid (SDK + `sessionStore` alpha) implementation needs. Phase 13 (transcript reconstruction) is the natural place to introduce it.

**Why is `shutdown` memoized?**
CopilotAgent's pattern at [`copilotAgent.ts:1057-1068`](../copilot/copilotAgent.ts#L1057-L1068). Multiple callers can race to shut down the agent during process exit (workbench window close + agent-host process signal). A memoized promise makes second/third calls cheap and correct. **The order `await shutdown(); _proxyHandle?.dispose();` is load-bearing for Phase 6** — Query subprocesses talk to the proxy and must die first.

**Should `disposeSession` delete the DB?**
No. Phase 13 owns deletion semantics (full transcript management). `disposeSession` is a wrapper-removal, not a delete. External sessions surfaced via `listSessions` would re-appear on the next listing anyway, so DB deletion in Phase 5 would be both incomplete and confusing.
