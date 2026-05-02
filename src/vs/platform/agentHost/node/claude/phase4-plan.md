# Phase 4 Implementation Plan — `ClaudeAgent` Skeleton

> **Handoff plan** — written to be executed by an agent with no prior conversation context. All file paths and line citations are verified against the workspace at synthesis time. Cross-reference [roadmap.md](./roadmap.md) before committing exact phase numbers.

## 1. Goal

Add a `ClaudeAgent` provider to the agent host that registers with `IAgentService`, advertises Anthropic models from `ICopilotApiService.models()`, and authenticates against the same GitHub resource as `CopilotAgent`. **No SDK / subprocess / sendMessage** in this phase — those are Phase 6+. Most `IAgent` methods throw `Error('TODO: Phase N')`.

Because the provider is a stub for the next several phases (every user-facing method throws `TODO: Phase N`), registration is **off by default** behind a new `chat.agentHost.claudeAgent.enabled` workbench setting. See §4 for the gate; without opting in, the provider is invisible to users and to root state. This was added beyond the original Phase 4 brief — Phase 4 ships only the skeleton and its registration gate; opening the setting up by default waits until the user-facing methods stop throwing.

**Exit criteria:** With `chat.agentHost.claudeAgent.enabled: true`, a workbench client connecting to the agent host sees a `claude` provider in root state, can pick a Claude model, and `sendMessage()` throws `TODO: Phase 6`. With the setting off (the default), only `copilotcli` is registered.

## 2. Files to create / modify

| Action | File | Purpose |
|---|---|---|
| **Create** | `src/vs/platform/agentHost/node/claude/claudeAgent.ts` | The `ClaudeAgent` class. ~200–300 lines. |
| **Create** | `src/vs/platform/agentHost/test/node/claudeAgent.test.ts` | Unit tests. |
| **Modify** | `src/vs/platform/agentHost/common/agentService.ts` | Export `AgentHostClaudeAgentEnabledSettingId` setting id and `AgentHostEnableClaudeEnvVar` constant. |
| **Modify** | `src/vs/workbench/contrib/chat/browser/chat.contribution.ts` | Register `chat.agentHost.claudeAgent.enabled` (boolean, default `false`, `experimental`+`advanced`, hidden in stable). |
| **Modify** | `src/vs/platform/agentHost/electron-main/electronAgentHostStarter.ts` | Read the setting; forward as `VSCODE_AGENT_HOST_ENABLE_CLAUDE` env var into the utility process. |
| **Modify** | `src/vs/platform/agentHost/node/nodeAgentHostStarter.ts` | Same forwarding for the Node child-process fallback. |
| **Modify** | `src/vs/platform/agentHost/node/agentHostMain.ts` | Conditionally register `ClaudeAgent` next to `CopilotAgent` based on the env var. |
| **Modify** | `src/vs/platform/agentHost/node/agentHostServerMain.ts` | Register `ICopilotApiService`, `IClaudeProxyService`, and `ClaudeAgent` (gated on env var or `--enable-claude-agent`). Currently has none of these. |
| **Modify** | `src/vs/platform/agentHost/node/claude/scripts/launch-smoke.sh` | Export `VSCODE_AGENT_HOST_ENABLE_CLAUDE=1` so the smoke flow does not require touching user settings. |

## 3. `ClaudeAgent` class spec

**Reference implementation map:**

| Phase 4 concern | Reference |
|---|---|
| Class shell, `Disposable`, emitter, observable | `src/vs/platform/agentHost/node/copilot/copilotAgent.ts` (in-tree `IAgent` reference) |
| `getDescriptor` / `getProtectedResources` / `authenticate` | `CopilotAgent` ONLY — extension has no `IAgent` analog |
| Model filter | `extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeModels.ts:165–179` |

**Do NOT** copy `ClaudeCodeSession` (claudeCodeAgent.ts:122+) verbatim — that class has accreted ~20 layered concerns (MCP gateway, plugins, edit tracker, settings tracker, OTel, hooks, debug logger, ripgrep PATH, runtime data, folder MRU). Each concern enters the in-tree implementation in the phase that actually needs it.

### 3.1 Class shell

```ts
export class ClaudeAgent extends Disposable implements IAgent {
    readonly id = 'claude' as const;

    private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
    readonly onDidSessionProgress = this._onDidSessionProgress.event;

    private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
    readonly models: IObservable<readonly IAgentModelInfo[]> = this._models;

    private _githubToken: string | undefined;
    private _proxyHandle: IClaudeProxyHandle | undefined;

    constructor(
        @ILogService private readonly _logService: ILogService,
        @ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
        @IClaudeProxyService private readonly _claudeProxyService: IClaudeProxyService,
    ) {
        super();
    }
    // ...
}
```

**Provider id is `'claude'`** (not `'claude-code'`). The id becomes the URI scheme via `AgentSession.uri()` at `src/vs/platform/agentHost/common/agentService.ts:314`. Branding goes in `displayName`.

### 3.2 `getDescriptor()` and `getProtectedResources()`

Mirror `CopilotAgent` lines 249–266. Use `localize()` for user-visible strings:

```ts
getDescriptor(): IAgentDescriptor {
    return {
        provider: 'claude',
        displayName: localize('claudeAgent.displayName', "Claude"),
        description: localize('claudeAgent.description', "Claude agent backed by the Anthropic Claude Agent SDK"),
    };
}

getProtectedResources(): ProtectedResourceMetadata[] {
    return [{
        resource: 'https://api.github.com',
        resource_name: 'GitHub Copilot',
        authorization_servers: ['https://github.com/login/oauth'],
        scopes_supported: ['read:user', 'user:email'],
        required: true,
    }];
}
```

### 3.3 `authenticate()` — the only real logic in this phase

Defer proxy startup until a token arrives. `IClaudeProxyService.start()` requires a non-empty github token (`src/vs/platform/agentHost/node/claude/claudeProxyService.ts:61`), so eager construction is impossible.

Mirror `CopilotAgent.authenticate()` (lines 277–309):

```ts
async authenticate(resource: string, token: string): Promise<boolean> {
    if (resource !== 'https://api.github.com') {
        return false;
    }
    const tokenChanged = this._githubToken !== token;
    this._githubToken = token;
    this._logService.info(`[Claude] Auth token ${tokenChanged ? 'updated' : 'unchanged'}`);
    if (tokenChanged) {
        // Restart proxy with new token. Old handle's dispose() decrements
        // refcount; ClaudeProxyService applies most-recent-token-wins.
        const oldHandle = this._proxyHandle;
        this._proxyHandle = await this._claudeProxyService.start(token);
        oldHandle?.dispose();
        void this._refreshModels();
    }
    return true;
}
```

**Order matters:** acquire new handle before disposing old one so the proxy server doesn't tear down between the two calls (refcount stays ≥ 1 throughout).

### 3.4 `_refreshModels()` — token-change-driven, with stale guard

Copy CopilotAgent's pattern (lines 299–313):

```ts
private async _refreshModels(): Promise<void> {
    const tokenAtStart = this._githubToken;
    if (!tokenAtStart) {
        this._models.set([], undefined);
        return;
    }
    try {
        const all = await this._copilotApiService.models(tokenAtStart);
        const filtered = all.filter(m => isClaudeModel(m)).map(m => toAgentModelInfo(m, this.id));
        if (this._githubToken === tokenAtStart) {
            this._models.set(filtered, undefined);
        }
    } catch (err) {
        this._logService.error(err, '[Claude] Failed to refresh models');
        if (this._githubToken === tokenAtStart) {
            this._models.set([], undefined);
        }
    }
}
```

### 3.5 Model filter (module-level helpers)

Two checks combined: CCAModel surface filter + Claude id parser. The id parser elegantly excludes synthetic ids like `auto`:

```ts
function isClaudeModel(m: CCAModel): boolean {
    return (
        m.vendor === 'Anthropic' &&
        !!m.supported_endpoints?.includes('/v1/messages') &&
        !!m.model_picker_enabled &&
        !!m.capabilities?.supports?.tool_calls &&
        tryParseClaudeModelId(m.id) !== undefined  // from claudeModelId.ts
    );
}

function toAgentModelInfo(m: CCAModel, provider: AgentProvider): IAgentModelInfo {
    return {
        provider,
        id: m.id,
        name: m.name,
        maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
        supportsVision: !!m.capabilities?.supports?.vision,
    };
}
```

Field references (`src/typings/copilot-api.d.ts`):
- `vendor` → line 113
- `supported_endpoints` → line 115 (optional, use `?.`)
- `model_picker_enabled` → line 140
- `capabilities.supports.tool_calls` → line 150
- `capabilities.limits.max_context_window_tokens` → line ~133

Verify the exact `IAgentModelInfo` shape against `src/vs/platform/agentHost/common/agentService.ts:204` before writing. Drop fields that don't exist in the interface.

### 3.6 Stub map

Every required `IAgent` method that isn't implemented yet throws `new Error('TODO: Phase N')`. Phase numbers from [roadmap.md](./roadmap.md):

| Method | Phase N | Notes |
|---|---|---|
| `createSession` | 5 | |
| `disposeSession` | 5 | |
| `getSessionMessages` | 5 | Comment: full transcript reconstruction is Phase 13 |
| `listSessions` | 5 | |
| `resolveSessionConfig` | 5 | |
| `sessionConfigCompletions` | 5 | |
| `shutdown` | 5 | |
| `sendMessage` | 6 | |
| `respondToPermissionRequest` | 7 | |
| `respondToUserInputRequest` | 7 | |
| `abortSession` | 9 | |
| `changeModel` | 9 | |
| `setClientTools` | 10 | |
| `onClientToolCallComplete` | 10 | |
| `setClientCustomizations` | 11 | |
| `setCustomizationEnabled` | 11 | |

**Cross-reference roadmap before committing each Phase N** — exact numbers may have shifted since this plan was written.

**Optional methods to OMIT** (interface allows): `truncateSession?`, `setPendingMessages?`, `getCustomizations?`, `getSessionCustomizations?`, `onArchivedChanged?`, `onDidCustomizationsChange?`.

### 3.7 `dispose()` — REAL, not a TODO

`AgentService.dispose()` calls `provider.dispose()` unconditionally. The `_proxyHandle` is refcounted; failing to dispose leaks the proxy server lifetime.

```ts
override dispose(): void {
    // Phase 6+ INVARIANT: SDK subprocess(es) MUST be killed before disposing
    // the proxy handle. In Phase 4 there are no subprocesses, so this is safe.
    this._proxyHandle?.dispose();
    this._proxyHandle = undefined;
    this._githubToken = undefined;
    this._models.set([], undefined);
    super.dispose();
}
```

The comment is mandatory — Phase 6 will add SDK spawn and the order matters per `IClaudeProxyHandle` doc at `src/vs/platform/agentHost/node/claude/claudeProxyService.ts:33`.

## 4. Registration changes

Registration is **gated** so users on a default install never see a stub provider. The contract is:

```
[workbench]                                  [agent host process]
chat.agentHost.claudeAgent.enabled  --->  VSCODE_AGENT_HOST_ENABLE_CLAUDE=1  --->  registerProvider(ClaudeAgent)
```

- The setting key and env-var name live in `src/vs/platform/agentHost/common/agentService.ts` (`AgentHostClaudeAgentEnabledSettingId`, `AgentHostEnableClaudeEnvVar`) so both sides reference the same string.
- The setting is registered in `src/vs/workbench/contrib/chat/browser/chat.contribution.ts` next to `AgentHostEnabledSettingId`: `type: 'boolean'`, `default: false`, `tags: ['experimental', 'advanced']`, `included: product.quality !== 'stable'`.
- The env var also acts as a developer override: setting it on the parent process (e.g. in `launch-smoke.sh`) opts the agent host in regardless of the workbench setting.
- Changes require an agent host restart — the env var is captured at process spawn time. The setting description must say so.

### 4.1 `chat.contribution.ts` — register the setting

Import `AgentHostClaudeAgentEnabledSettingId` next to the existing agent-host setting ids and add a property to the `chat` configuration block:

```ts
[AgentHostClaudeAgentEnabledSettingId]: {
    type: 'boolean',
    description: nls.localize('chat.agentHost.claudeAgent.enabled', "When enabled, the Claude agent provider is registered inside the agent host. Requires `#chat.agentHost.enabled#`. The agent host process must be restarted for changes to this setting to take effect."),
    default: false,
    tags: ['experimental', 'advanced'],
    included: product.quality !== 'stable',
},
```

### 4.2 Both starters — forward setting → env var

**`electronAgentHostStarter.ts`** (utility process path). Inside `start()` before `utilityProcess.start({...})`:

```ts
const claudeEnabled = this._configurationService.getValue<boolean>(AgentHostClaudeAgentEnabledSettingId)
    || process.env[AgentHostEnableClaudeEnvVar] === '1';

this.utilityProcess.start({
    // ...
    env: {
        ...deepClone(process.env),
        ...shellEnv,
        VSCODE_ESM_ENTRYPOINT: 'vs/platform/agentHost/node/agentHostMain',
        VSCODE_PIPE_LOGGING: 'true',
        VSCODE_VERBOSE_LOGGING: 'true',
        ...(claudeEnabled ? { [AgentHostEnableClaudeEnvVar]: '1' } : {}),
    }
});
```

**`nodeAgentHostStarter.ts`** (Node child-process fallback). Same precedence (setting OR inherited env var), written into the `env` object before the `IIPCOptions` is constructed.

### 4.3 `agentHostMain.ts` (already has DI for the prerequisites)

`ICopilotApiService` and `IClaudeProxyService` are already registered at lines 110–112. Add one more `registerProvider` call after `CopilotAgent`, **gated on the env var**:

```ts
agentService.registerProvider(instantiationService.createInstance(CopilotAgent));
if (process.env[AgentHostEnableClaudeEnvVar] === '1') {
    agentService.registerProvider(instantiationService.createInstance(ClaudeAgent));
}
```

Add the imports: `ClaudeAgent` from `./claude/claudeAgent.js` and `AgentHostEnableClaudeEnvVar` from `../common/agentService.js`.

### 4.4 `agentHostServerMain.ts` (DI bare — add three things, then gate)

Currently this file does NOT register `ICopilotApiService` or `IClaudeProxyService`. Inside the `if (!options.quiet)` block (around line 188), before `instantiationService.createInstance(CopilotAgent)`:

```ts
const copilotApiService = instantiationService.createInstance(CopilotApiService, undefined);
diServices.set(ICopilotApiService, copilotApiService);
const claudeProxyService = disposables.add(instantiationService.createInstance(ClaudeProxyService));
diServices.set(IClaudeProxyService, claudeProxyService);
```

Then register Claude conditionally. The standalone server adds a CLI flag `--enable-claude-agent` (mirroring `--enable-mock-agent`) which OR's with the env var:

```ts
// In parseServerOptions():
const enableClaudeAgent = argv.includes('--enable-claude-agent') || process.env[AgentHostEnableClaudeEnvVar] === '1';

// Inside the !options.quiet block, after CopilotAgent registration:
if (options.enableClaudeAgent) {
    const claudeAgent = disposables.add(instantiationService.createInstance(ClaudeAgent));
    agentService.registerProvider(claudeAgent);
    log('ClaudeAgent registered');
}
```

Update the `IServerOptions` interface, the file-header usage comment, and `parseServerOptions()` return value accordingly.

Imports needed (mirror `agentHostMain.ts` lines ~20–25):
- `CopilotApiService`, `ICopilotApiService` from `./shared/copilotApiService.js`
- `ClaudeProxyService`, `IClaudeProxyService` from `./claude/claudeProxyService.js`
- `ClaudeAgent` from `./claude/claudeAgent.js`
- `AgentHostEnableClaudeEnvVar` from `../common/agentService.js`

**`undefined` second arg to `CopilotApiService` is intentional** — that's the `fetchFn` slot, and `agentHostMain.ts:110` does the same.

## 5. Test file spec

New file: `src/vs/platform/agentHost/test/node/claudeAgent.test.ts`. Mirror the harness style of `src/vs/platform/agentHost/test/node/copilotAgent.test.ts` (read lines 233–262 for the `createTestAgentContext` pattern).

**Mock services (no extensive mocking — minimal stand-ins):**
- `IClaudeProxyService` mock: `start(token)` returns `{ baseUrl: 'http://127.0.0.1:0', nonce: 'test-nonce', dispose: () => disposeCount++ }`. Track call count and last token.
- `ICopilotApiService` mock: `models(token)` returns a canned `CCAModel[]` mixing Anthropic + non-Anthropic + non-tool-calls + non-picker.

**Test cases (use `assert.deepStrictEqual` snapshots per repo guidelines):**

1. `getDescriptor()` returns `{ provider: 'claude', displayName: 'Claude', description: ... }`.
2. `getProtectedResources()` matches the GitHub resource shape.
3. Models observable is empty before `authenticate`.
4. `authenticate('https://api.github.com', token)` returns `true`, calls `start(token)`, populates models with only the Claude-family entries, in correct `IAgentModelInfo` shape.
5. `authenticate('https://other.example.com', token)` returns `false`; a follow-up `authenticate('https://api.github.com', token)` still works (proxy `start` called exactly once total). Catches implementations that early-return `false` after corrupting state.
6. Calling `authenticate` twice with the **same** token does NOT call `start()` again (token unchanged path).
7. Calling `authenticate` with a **different** token: new `start(tokenB)` was called AND old handle was disposed.
8. Filter excludes: non-Anthropic vendor (e.g. `vendor: 'copilot'` for the synthetic `auto` model — verified at `extensions/copilot/src/extension/conversation/vscode-node/chatParticipants.ts:312`), missing `/v1/messages` endpoint, `model_picker_enabled: false`, `tool_calls: false`, unparseable Claude id (e.g. id `'auto'` would also fail `tryParseClaudeModelId`).
9. `AgentSession.uri('claude', 'abc')` round-trips: scheme `'claude'`, `AgentSession.id()` returns `'abc'`, `AgentSession.provider()` returns `'claude'`.
10. `dispose()` disposes the proxy handle; second `dispose()` is idempotent.
11. Each stubbed method (sample 3–4) throws an `Error` whose message contains `'TODO: Phase'` and the right number.
12. **Registration smoke:** instantiate `AgentService` + register `ClaudeAgent` + assert it appears in root state via the public service surface.
13. **Stale-write guard:** if a slow `models(tokA)` call resolves *after* `authenticate(tokB)` has already published `[B]`, the late `[A]` result must be discarded.
    Use `DeferredPromise` from [src/vs/base/common/async.ts](src/vs/base/common/async.ts#L1739) to control the resolution order:
    ```ts
    const tokAModels = new DeferredPromise<CCAModel[]>();
    mockApi.models = (token: string) => token === 'tokA' ? tokAModels.p : Promise.resolve([CLAUDE_MODEL_B]);

    void agent.authenticate('https://api.github.com', 'tokA');  // refresh-A starts, hangs on tokAModels.p
    await agent.authenticate('https://api.github.com', 'tokB'); // refresh-B runs to completion, models == [B]

    tokAModels.complete([CLAUDE_MODEL_A]);                       // refresh-A unblocks; guard must drop the write
    await new Promise(r => setImmediate(r));

    assert.deepStrictEqual(agent.models.get().map(m => m.id), [CLAUDE_MODEL_B.id]);
    ```
    Codifies the invariant that the in-tree `CopilotAgent` already relies on but doesn't currently test.

Use `ensureNoDisposablesAreLeakedInTestSuite()` at the top.

## 6. Risks / gotchas

| Risk | Mitigation |
|---|---|
| Older roadmap revisions said "start proxy in constructor" — that's wrong. `start()` requires a token. | This plan and the current `roadmap.md` agree: defer to `authenticate()`. If you find a contradicting note elsewhere, this plan + Phase 2's `claudeProxyService.ts:61` win. |
| `agentHostServerMain.ts` lacks DI for `ICopilotApiService`/`IClaudeProxyService` — server mode would crash. | Add both registrations as in §4.4. |
| `CCAModel.supported_endpoints` is `string[] \| undefined` — direct `.includes()` will throw. | Use `?.includes()` everywhere. |
| `_refreshModels` writes after `await` — token may have rotated. | Snapshot `_githubToken` at start, gate the write on equality. (Mirrors CopilotAgent.) |
| `_proxyHandle.dispose()` is the ONLY way to release the proxy refcount — leaving `dispose()` as a TODO leaks. | Implement real `dispose()` in this phase; comment Phase 6 ordering invariant. |
| `IClaudeProxyService` constructor requires `ICopilotApiService` (verified Phase 2). | Register `ICopilotApiService` first in `agentHostServerMain.ts`. |
| Test assertions after `authenticate` are async-sensitive (model fetch is a promise). | For tests that just need the refresh to settle: `await new Promise(r => setImmediate(r))` to drain microtasks. For tests that need to *control* refresh ordering (e.g. stale-write guard): use `DeferredPromise` from [async.ts](src/vs/base/common/async.ts#L1739) on the mock `models()` call. Avoid timer-based waits. |
| Disposable leak detection: mock `IClaudeProxyHandle` should not register with the test store unless tracked. | Use a lightweight object literal — its `dispose` is a closure, not a disposable. |
| Forgetting to gate — default-on registration would expose `TODO: Phase N` errors to every Insiders user. | Both `agentHostMain.ts` and `agentHostServerMain.ts` MUST gate on `process.env[AgentHostEnableClaudeEnvVar] === '1'`. Smoke without setting the env var: only `copilotcli` should appear in root state. |
| Setting flipped at runtime doesn't take effect. | The env var is captured at agent-host process spawn. Reload the window (or kill the host) to apply. The setting description must say so. |
| Smoke run claims "ClaudeAgent didn't register" — actually the env var was lost. | `launch-smoke.sh` exports `VSCODE_AGENT_HOST_ENABLE_CLAUDE=1` for the operator. The Electron starter forwards via `...deepClone(process.env)` then merges the explicit env var; the Node starter copies it explicitly into the spawned `env`. |

## 7. Acceptance criteria

The PR is **done** when every box below is checked. Run them in order — earlier failures invalidate later checks.

### 7.1 Code structure

- [ ] `src/vs/platform/agentHost/node/claude/claudeAgent.ts` exists with `export class ClaudeAgent extends Disposable implements IAgent`.
- [ ] `id = 'claude'` (not `'claude-code'`, not `'copilotcli'`).
- [ ] Constructor takes exactly `@ILogService`, `@ICopilotApiService`, `@IClaudeProxyService` (no other deps).
- [ ] All 16 stubbed methods (§3.6) throw `Error('TODO: Phase N')` with the correct N.
- [ ] No optional methods are present (`truncateSession?`, `getCustomizations?`, etc.).
- [ ] `dispose()` is real (not a TODO) and disposes `_proxyHandle`.
- [ ] Phase-6 subprocess-ownership invariant is in a code comment near `dispose()`.
- [ ] Microsoft copyright header is on every new file.

### 7.2 Registration & gating

- [ ] `AgentHostClaudeAgentEnabledSettingId` and `AgentHostEnableClaudeEnvVar` are exported from `src/vs/platform/agentHost/common/agentService.ts`.
- [ ] `chat.contribution.ts` registers `chat.agentHost.claudeAgent.enabled` with `default: false`, `tags: ['experimental', 'advanced']`, and `included: product.quality !== 'stable'`.
- [ ] Setting `description` notes the agent host must restart for changes to take effect.
- [ ] Both `electronAgentHostStarter.ts` and `nodeAgentHostStarter.ts` forward the setting (or inherited env var) as `VSCODE_AGENT_HOST_ENABLE_CLAUDE=1`.
- [ ] `agentHostMain.ts` registers `ClaudeAgent` ONLY when `process.env[AgentHostEnableClaudeEnvVar] === '1'` — verified by toggling the env var and observing root state.
- [ ] `agentHostServerMain.ts` registers `ICopilotApiService`, `IClaudeProxyService`, AND `ClaudeAgent` (was missing all three). `ClaudeAgent` registration is gated on `--enable-claude-agent` OR the env var; the file-header usage line documents the new flag.

### 7.3 Compile + lint + layers

- [ ] `VS Code - Build` task shows zero TypeScript errors. If task is unavailable, `npm run compile-check-ts-native` exits 0.
- [ ] `npm run eslint -- src/vs/platform/agentHost/node/claude/claudeAgent.ts src/vs/platform/agentHost/test/node/claudeAgent.test.ts` exits 0.
- [ ] `npm run valid-layers-check` exits 0.
- [ ] `npm run hygiene` exits 0.

### 7.4 Tests

- [ ] `src/vs/platform/agentHost/test/node/claudeAgent.test.ts` exists with all 13 cases from §5.
- [ ] `ensureNoDisposablesAreLeakedInTestSuite()` is at the top of the suite.
- [ ] `scripts/test.sh --grep ClaudeAgent` exits 0 — every case passes.
- [ ] No test uses `as any` or `as unknown as Foo` casts.
- [ ] No test depends on real network or real subprocesses.

### 7.5 Behavioral exit criteria (matches §1)

These are the *outcomes* the unit tests verify. §7.8 is the live-system smoke that proves they hold end-to-end.

- [ ] **Default-off:** with no setting and no env var, a workbench client connecting to the agent host sees only `'copilotcli'` in root state — no `'claude'` provider.
- [ ] **Opt-in:** with `chat.agentHost.claudeAgent.enabled: true` (or `VSCODE_AGENT_HOST_ENABLE_CLAUDE=1` set on the parent process) and a fresh agent host, the client sees `'claude'` listed alongside `'copilotcli'`.
- [ ] After authenticate, the client sees Anthropic models in the picker (filtered by §3.5 predicate).
- [ ] Calling `sendMessage` on a Claude session throws `Error('TODO: Phase 6')` (or whatever §3.6 maps to in the current roadmap).

### 7.6 PR readiness

- [ ] PR title: `agentHost/claude: Phase 4 — ClaudeAgent skeleton`.
- [ ] PR description links to [roadmap.md](./roadmap.md) Phase 4 section and notes the exit criteria are met.
- [ ] PR description lists the stubbed methods + their target phase as a table.
- [ ] PR is opened as draft until the build passes; promote when green.

### 7.7 What to do if a step fails

| Failure | Likely cause | First debugging step |
|---|---|---|
| Compile error on `IAgentModelInfo` | Added a non-existent field (e.g. `family`) | Re-read `src/vs/platform/agentHost/common/agentService.ts:204`; drop unsupported fields. |
| Compile error on `supportsVision` | Returned `boolean \| undefined` | Coerce: `!!m.capabilities?.supports?.vision`. |
| `valid-layers-check` fails | Imported from a higher layer (`vs/workbench/`, `vs/sessions/`) by accident | Check imports — only `vs/base`, `vs/platform`, `vs/typings` allowed. |
| Test 13 (stale-write) flakes | Microtask draining timing | Replace timer waits with `DeferredPromise` resolution + `await new Promise(r => setImmediate(r))`. |
| `dispose()` test leaks | Mock proxy handle counted as a tracked disposable | Plain object literal, not `Disposable` subclass. |
| `agentHostServerMain.ts` server crashes at startup | DI registration order | Register `ICopilotApiService` BEFORE `IClaudeProxyService`. |
| `Cannot find module './claude/claudeAgent.js'` | Forgot the `.js` extension on the import | All in-tree imports use `.js` even for `.ts` source files. |
| Smoke logs show `CopilotAgent registered` but no `ClaudeAgent registered` | Setting off, env var not forwarded, or starter not reading the setting | Confirm `chat.agentHost.claudeAgent.enabled: true` in the user-data-dir's `settings.json`, OR that `launch-smoke.sh` exported `VSCODE_AGENT_HOST_ENABLE_CLAUDE=1`. Restart the agent host — the env var is captured at spawn. |
| Setting flipped in the UI but `'claude'` still missing | Env var is captured at agent host spawn time | Reload the window or kill the agent host process so the starter re-spawns with the new env. |

### 7.8 Live-system smoke (mandatory before merging)

This is the proof Phase 4 actually ships. The unit tests prove the class is wired correctly in isolation; the smoke proves it boots, registers, and surfaces in the UI when an authenticated user opens the Agents app.

**Follow [`smoke.md`](./smoke.md).** It is a streamlined, repeatable plan distilled from the live walk that originally informed this section. The boilerplate is captured in two helper scripts under [`./scripts/`](./scripts/):

- `launch-smoke.sh` — boots the Agents app on a chosen CDP port with the right env + flags.
- `verify-claude-logs.sh` — runs the five log-level invariants (registration, auth fan-out, proxy startup, root-state propagation, model filter) and saves evidence to `/tmp/claude-phase4-smoke/<timestamp>/`.

For Phase 4 specifically, the plan's per-phase table requires:

- [ ] **Gate verified disabled:** launch the Agents app *without* the env var (and with the setting off) and confirm only `CopilotAgent registered` appears in `agenthost.log` — no `ClaudeAgent registered`, no `'claude'` provider in root state.
- [ ] **Gate verified enabled:** re-launch via `launch-smoke.sh` (which sets `VSCODE_AGENT_HOST_ENABLE_CLAUDE=1`) and confirm both providers register.
- [ ] At least one `claude:/<uuid>` session URI appears in the IPC log after the user picks Claude (the session URI scheme is `claude:`, **not** `agent-host-claude:` — the longer form is the synced-customization namespace, observable separately).
- [ ] The first user prompt surfaces `TODO: Phase 5` in the response area. (`createSession` is the earliest stub on the path; `sendMessage` is reached only after `createSession` succeeds, which lands in Phase 5.)
- [ ] Attach `registration.log`, `picker-open.png`, `stub-error.png`, and `claude-session-uris.log` to the PR.

If any step in §7.8 fails, the PR is **not** ready regardless of whether §7.1–7.7 are green.

## 8. Resolved decisions

**Should `dispose()` await an in-flight `_refreshModels`?**
No. `dispose()` clears `this._githubToken` *before* `super.dispose()`, so any hung `_refreshModels` will, on resume, see `this._githubToken !== tokenAtStart` and drop its write — making the in-flight refresh a no-op. Test 13 (stale-write guard) codifies this invariant. Fire-and-forget; matches `CopilotAgent`.

**Why is registration gated on a setting when the spec only said "register"?**
Phase 4 is a stub. Every user-facing method (`createSession`, `sendMessage`, `respondToPermissionRequest`, …) throws `TODO: Phase N`. Shipping it default-on would mean Insiders users who pick Claude in the picker hit a `TODO: Phase 5` error on their first prompt. Default-off + a setting + a developer env var keeps Phase 4 testable without exposing it broadly. The setting is `included: product.quality !== 'stable'` so it is hidden from stable installs entirely. Flip the default to `true` (or remove the gate) only once the user-facing methods stop throwing — the natural milestone is Phase 6 (`sendMessage` lands).

**Workbench setting vs. agent-host root config (`IAgentConfigurationService`)?**
Workbench setting. Root config is for runtime / per-session knobs that flow through the IPC protocol; this is a feature flag for whether a provider exists at all, decided at process spawn. Mirrors the precedent set by `chat.agentHost.enabled` (which gates whether the *whole* agent host process spawns).
