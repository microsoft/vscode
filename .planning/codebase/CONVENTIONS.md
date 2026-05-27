# Coding Conventions — Agent Host Subsystem

**Analysis Date:** 2026-05-27

Scope: [`src/vs/platform/agentHost/`](src/vs/platform/agentHost), [`src/vs/workbench/contrib/chat/browser/agentSessions/`](src/vs/workbench/contrib/chat/browser/agentSessions), [`src/vs/sessions/contrib/providers/agentHost/`](src/vs/sessions/contrib/providers/agentHost).

This document is prescriptive for code in the agent host subsystem. For VS Code-wide rules, follow the instruction files cited below rather than restating them here.

---

## 1. VS Code Coding Guidelines That Apply

Apply these as-is — do not re-derive:

- General coding style, naming, strings, formatting: see [.github/copilot-instructions.md](.github/copilot-instructions.md) and [.github/instructions/coding-guidelines.instructions.md](.github/instructions/coding-guidelines.instructions.md).
- Source-code layering, target environments, DI rules: see [.github/instructions/source-code-organization.instructions.md](.github/instructions/source-code-organization.instructions.md). Files under `src/vs/platform/agentHost/node/**` are Node-target only; `common/**` is environment-agnostic; browser code under `workbench/contrib/chat/browser/agentSessions/**` must not import from `node/**`.
- Disposable patterns (registration, `MutableDisposable`, `DisposableStore`, leak avoidance): see [.github/instructions/disposable.instructions.md](.github/instructions/disposable.instructions.md).
- Observables (`observableValue`, `derived`, `autorun`, transactions): see [.github/instructions/observables.instructions.md](.github/instructions/observables.instructions.md).
- Agent host test patterns specifically: see [.github/instructions/agentHostTesting.instructions.md](.github/instructions/agentHostTesting.instructions.md) — authoritative for tests under `src/vs/platform/agentHost/test/**`.
- Chat feature area: see [.github/instructions/chat.instructions.md](.github/instructions/chat.instructions.md) for code under `workbench/contrib/chat/**`.

---

## 2. Service & DI Patterns

The agent host main process composes services manually via `IInstantiationService` rather than relying on the platform service collection. The composition root is [`agentHostMain.ts`](src/vs/platform/agentHost/node/agentHostMain.ts).

**Pattern:** instantiate via `instantiationService.createInstance(...)`, then register into the `ServiceCollection` (`diServices.set`) so downstream `createInstance` calls can pick them up.

Examples ([`agentHostMain.ts`](src/vs/platform/agentHost/node/agentHostMain.ts)):

- `ICopilotApiService` is constructed and registered before agents that depend on it ([line 150-151](src/vs/platform/agentHost/node/agentHostMain.ts#L150-L151)).
- `IAgentHostTerminalManager`, `IAgentConfigurationService`, `IAgentHostCompletions` are exposed from `agentService` ([line 164-166](src/vs/platform/agentHost/node/agentHostMain.ts#L164-L166)).
- `IAgentHostCheckpointService`, `IAgentHostGitService`, `IAgentHostFileMonitorService`, `IAgentHostOTelService`, `IAgentPluginManager` follow the same `createInstance` + `diServices.set` pattern ([line 138-160](src/vs/platform/agentHost/node/agentHostMain.ts#L138-L160)).
- `IAgent` providers (Copilot, Claude) are instantiated last and registered through `agentService.registerProvider(instantiationService.createInstance(...))` ([line 167](src/vs/platform/agentHost/node/agentHostMain.ts#L167), [line 174](src/vs/platform/agentHost/node/agentHostMain.ts#L174)).

**Rule:** declare service dependencies in the constructor with `@IServiceId` decorators. Do not stash an `IInstantiationService` to resolve services lazily — see global guidelines in [.github/copilot-instructions.md](.github/copilot-instructions.md). The only legitimate uses of `_instantiationService.createInstance` after construction in this subsystem are creating per-session sub-objects (e.g. `ClaudeSessionMetadataStore` at [`claudeAgent.ts` line 229](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L229), `ShellManager` at [`copilotAgent.ts` line 905](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L905), `PluginController` at [`copilotAgent.ts` line 286](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L286)).

---

## 3. Disposable Patterns

Agent providers extend `Disposable` and use the standard VS Code disposable primitives.

- **`extends Disposable`** for any class owning subscriptions: [`ClaudeAgent` at claudeAgent.ts line 138](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L138), [`CopilotAgent` at copilotAgent.ts line 233](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L233), [`AgentHostChatSession` at agentHostSessionHandler.ts line 229](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L229), [`AgentHostSessionHandler` at line 373](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L373).
- **`DisposableMap<string, ...>`** owns per-session lifetimes — keyed by `sessionId`, with `deleteAndDispose` on shutdown. Examples: [`_sessions` in claudeAgent.ts line 171](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L171), [`_sessions` in copilotAgent.ts line 247](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L247).
- **`SequencerByKey<string>`** serializes per-session async operations so that create/resume/dispose for a given `sessionId` cannot interleave: [`_disposeSequencer`](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L194) and [`_sessionSequencer`](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L206) in `claudeAgent.ts`; [`_sessionSequencer` in copilotAgent.ts line 266](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L266).
- **`DisposableStore`** is used for per-turn / per-iteration scopes inside long-lived handlers (see [`agentHostSessionHandler.ts` line 962](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L962), [line 1021](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L1021), [line 1251](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L1251)).
- **`MutableDisposable<DisposableStore>`** for a single replaceable scope whose contents come and go ([line 965](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L965)).

**Rule:** if a method called repeatedly creates disposables, return `IDisposable` and let the caller register it — do not register on the owning class. See [.github/instructions/disposable.instructions.md](.github/instructions/disposable.instructions.md).

---

## 4. Observable Patterns

The agent host bridge into the chat UI is observable-driven. Canonical example is [`agentHostSessionHandler.ts`](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts):

- **State as `observableValue`** — `progressObs` and `isCompleteObs` are session-scoped observables read by the chat widget ([line 230-231](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L230-L231)).
- **`derived`** projects shape from a parent observable — `turn$`, `responseParts$`, `inputRequests$`, `usage$` ([line 1260-1271](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L1260-L1271)).
- **`autorun`** runs effects on observable changes and is always `this._register(...)`ed ([line 411](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L411), [line 459](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L459)).
- **`autorunPerKeyedItem`** subscribes to a keyed collection once per item, avoiding repeated child-observer install ([line 1282](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L1282), [line 1337](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L1337)).
- **`transaction`** is imported alongside the above ([line 14](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L14)) — use it to batch multiple `set` calls so observers fire once.

Provider classes also expose model lists as observables: see `_models = observableValue<readonly IAgentModelInfo[]>(...)` in [`claudeAgent.ts` line 144](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L144) and [`copilotAgent.ts` line 241](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L241).

For broader rules see [.github/instructions/observables.instructions.md](.github/instructions/observables.instructions.md).

---

## 5. Event-Emission Patterns

Use `Emitter<T>` / `Event<T>` for cross-component notifications; never use events to drive control flow within a single owner (use observables or direct calls).

**Provider → session progress:** each `IAgent` exposes an `onDidSessionProgress` event that fires `AgentSignal` values:

- Declaration: [`claudeAgent.ts` line 141-142](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L141-L142), [`copilotAgent.ts` line 237-238](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L237-L238).
- Forwarding from per-session entries: [`claudeAgent.ts` line 366](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L366), [line 478](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L478).
- Direct fire of the `{ kind: 'action', session, action }` shape: [`copilotAgent.ts` line 1029](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L1029).

**`SessionAction` discriminated union:** defined in [`src/vs/platform/agentHost/common/state/sessionActions.ts`](src/vs/platform/agentHost/common/state/sessionActions.ts) — exported alias `SessionAction = ISessionAction_` at [line 135](src/vs/platform/agentHost/common/state/sessionActions.ts#L135); error variant is `SessionErrorAction` ([line 24](src/vs/platform/agentHost/common/state/sessionActions.ts#L24)). All session-state transitions flow through this union — providers should construct actions and emit them via the progress event rather than mutating UI-side state.

**Rule:** register every `Emitter` with `this._register(new Emitter<...>())` and expose only the `.event` to consumers.

---

## 6. Error Handling

- **`ProtocolError`** is the wire-level error type carrying a numeric code and optional protected-resource list. Defined at [`sessionProtocol.ts` line 113](src/vs/platform/agentHost/common/state/sessionProtocol.ts#L113).
- **`AHP_AUTH_REQUIRED = -32007`** is the canonical "auth needed" code ([`sessionProtocol.ts` line 89](src/vs/platform/agentHost/common/state/sessionProtocol.ts#L89)). Providers throw it whenever a session is started without credentials:
  - Claude: [`claudeAgent.ts` line 249-250](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L249-L250).
  - Copilot: [`copilotAgent.ts` line 456](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L456) — passes `this.getProtectedResources()` so the client can drive an auth flow.
- **`CancellationError`** from [`base/common/errors`](src/vs/base/common/errors.ts) is the only way to signal user-initiated cancellation through async chains (see import at [`claudeAgent.ts` line 11](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L11)). Do not throw plain `Error` for cancellation.
- **SDK → Session error conversion:** provider code catches SDK-thrown errors at the session boundary, logs them with the prefix convention (§7), and fires a `SessionErrorAction` rather than letting the error propagate out of the agent. See the `entry.send()` catch block at [`copilotAgent.ts` line 1113](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L1113).

**Rule:** never silently swallow errors at the agent boundary. Either convert to a `SessionAction` (visible to the user) or rethrow as `ProtocolError`.

---

## 7. Logging Conventions

Logging goes through `ILogService` (constructor-injected). Every log line about a specific session is prefixed `[<Provider>:<sessionId>]` so logs can be grepped per-session across providers.

Examples:

- `[Claude:${sessionId}]` — [`claudeAgent.ts` line 439](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L439), [line 453](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L453), [line 462](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L462).
- `[Copilot:${sessionId}]` — [`copilotAgent.ts` line 946](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L946), [line 1037](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L1037), [line 1077](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L1077), [line 1113](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L1113), [line 1152](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L1152).

**Levels used in practice:**
- `info` — lifecycle events (resume, send, client-tool registration).
- `warn` — recoverable failures the session continues past (overlay read failed, baseline checkpoint failed, missing session).
- `error` — terminal failures of an operation (`entry.send()` failed).

**Rule:** include identifying context (`sessionId`, `clientId`, counts) in every log message; prefer a single structured line over multiple fragments.

---

## 8. Settings Registration

Per the post-`f3831aeef7d` convention, `chat.agentHost.*` settings are registered from a contribution file that lives in `common/` (loaded from the agent host main process too) rather than from renderer-only code.

Canonical file: [`src/vs/platform/agentHost/common/agentHost.config.contribution.ts`](src/vs/platform/agentHost/common/agentHost.config.contribution.ts).

- Title uses `nls.localize('chatAgentHostConfigurationTitle', "Chat Agent Host")` ([line 29](src/vs/platform/agentHost/common/agentHost.config.contribution.ts#L29)).
- Settings registered via `configurationRegistry.registerConfiguration({...})` ([line 27](src/vs/platform/agentHost/common/agentHost.config.contribution.ts#L27)).
- `chat.agentHost.enabled` declared with a localized description ([line 34](src/vs/platform/agentHost/common/agentHost.config.contribution.ts#L34)).

A related starter-side contribution lives at [`agentHostStarter.config.contribution.ts`](src/vs/platform/agentHost/common/agentHostStarter.config.contribution.ts).

**Rule:** new `chat.agentHost.*` settings must be added in `common/*.config.contribution.ts` so the main process and agent host process see the same schema. Do not add them in renderer-only contributions.

---

## 9. Strings & Localization

All user-visible strings use `nls.localize` (or the destructured `localize` alias), with a stable ID and an English fallback:

```ts
displayName: localize('claudeAgent.displayName', "Claude")
```

Examples: [`claudeAgent.ts` line 237-238](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L237-L238), session-config strings at [line 685-702](src/vs/platform/agentHost/node/claude/claudeAgent.ts#L685-L702); Copilot model-thinking-level labels at [`copilotAgent.ts` line 541-555](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L541-L555); isolation/branch session-config strings at [line 959-984](src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L959-L984).

- IDs are dot-namespaced: `claude.sessionConfig.permissionMode.acceptEdits`, `agentHost.sessionConfig.isolation`, `copilot.modelThinkingLevel.high`.
- Use double quotes for the user-visible fallback string; single quotes for the ID. This matches [.github/instructions/coding-guidelines.instructions.md](.github/instructions/coding-guidelines.instructions.md).
- Use title-case for command labels, picker titles, and menu items (e.g. `"Thinking Level"`, `"Auto-Approve Edits"`).
- Never concatenate user-visible strings; use `{0}`-style placeholders.

---

## 10. Naming Conventions

Subsystem-specific patterns layered on top of the global rules:

- **Provider classes:** `<Provider>Agent` extending `Disposable implements IAgent` — `ClaudeAgent`, `CopilotAgent` ([file: claudeAgent.ts](src/vs/platform/agentHost/node/claude/claudeAgent.ts), [file: copilotAgent.ts](src/vs/platform/agentHost/node/copilot/copilotAgent.ts)).
- **Per-session entries:** `<Provider>SessionEntry` or `<Provider>AgentSession` (e.g. `ClaudeSessionEntry`, `CopilotAgentSession`).
- **Config key enums:** `<Provider>SessionConfigKey` as `export const enum` — see [`ClaudeSessionConfigKey` in claudeSessionConfigKeys.ts line 21](src/vs/platform/agentHost/common/claudeSessionConfigKeys.ts#L21).
- **Narrow helpers:** `narrow<X>(raw: unknown): X | undefined` — the single source of truth for coercing an untrusted runtime value into a typed enum. Example: [`narrowClaudePermissionMode` in claudeSessionConfigKeys.ts line 37](src/vs/platform/agentHost/common/claudeSessionConfigKeys.ts#L37). Apply this pattern for every new provider session-config enum so the SDK and the cross-process wire stay in sync.
- **Service interfaces:** `IAgentHost<X>` for agent-host-process services (`IAgentHostTerminalManager`, `IAgentHostCheckpointService`, `IAgentHostCompletions`, `IAgentHostFileMonitorService`, `IAgentHostGitService`, `IAgentHostOTelService`); `IAgent<X>` for non-host-scoped concerns (`IAgentConfigurationService`, `IAgentPluginManager`).
- **Files:** lowerCamelCase (`agentHostMain.ts`, `claudeAgent.ts`, `agentHostSessionHandler.ts`).
- **Observable fields:** suffix `Obs` or `$` (e.g. `progressObs`, `isCompleteObs`, `turn$`, `responseParts$`, `usage$` in [`agentHostSessionHandler.ts`](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L1260-L1271)).
- **Log prefix:** `[<Provider>:<sessionId>]` (see §7).

---

## 11. Testing Conventions

Authoritative reference: [.github/instructions/agentHostTesting.instructions.md](.github/instructions/agentHostTesting.instructions.md) (scoped to `src/vs/platform/agentHost/**`). Also follow [.github/instructions/writing-tests.instructions.md](.github/instructions/writing-tests.instructions.md).

**Where tests live:**

- Platform agent-host tests: [`src/vs/platform/agentHost/test/node/`](src/vs/platform/agentHost/test/node) — one `<source>.test.ts` next to each source unit. Integration tests use `.integrationTest.ts` (e.g. [`claudeAgent.integrationTest.ts`](src/vs/platform/agentHost/test/node/claudeAgent.integrationTest.ts), [`agentHostGitService.integrationTest.ts`](src/vs/platform/agentHost/test/node/agentHostGitService.integrationTest.ts)).
- Workbench agent-sessions tests: [`src/vs/workbench/contrib/chat/test/browser/agentSessions/`](src/vs/workbench/contrib/chat/test/browser/agentSessions).
- Shared protocol fixtures live under [`test/node/protocol/`](src/vs/platform/agentHost/test/node/protocol) and [`test/node/test-cases/`](src/vs/platform/agentHost/test/node/test-cases).

**Snapshot tests:** prefer one `assert.deepStrictEqual` snapshot over many fine-grained assertions — see the learnings section of [.github/copilot-instructions.md](.github/copilot-instructions.md). Snapshot-style assertion is the dominant pattern in `claudeMapSessionEvents.test.ts`, `claudeReplayMapper.test.ts`, `reducers.test.ts`.

**Fake services pattern:** do not stub globals or use `any` casts. Make dependencies injectable through the constructor (with the production default) and pass a fake implementing the real interface from tests. See the learning at the bottom of [.github/copilot-instructions.md](.github/copilot-instructions.md). The canonical agent fake is [`mockAgent.ts`](src/vs/platform/agentHost/test/node/mockAgent.ts) — reuse it instead of inventing new mocks.

**Shared fixtures:** reuse [`claudeMapSessionEventsTestUtils.ts`](src/vs/platform/agentHost/test/node/claudeMapSessionEventsTestUtils.ts) and [`historyRecordFixtures.ts`](src/vs/platform/agentHost/test/node/historyRecordFixtures.ts) rather than copy-pasting setup. Test cases that exercise the protocol layer live in [`test-cases/`](src/vs/platform/agentHost/test/node/test-cases).

**Rule:** every test must clean up disposables via `ensureNoDisposablesAreLeaked` (per the writing-tests guidelines). The `Disposable` base in production code already supports this; tests that create their own stores must dispose them in `teardown`.

---

*Conventions analysis: 2026-05-27*
