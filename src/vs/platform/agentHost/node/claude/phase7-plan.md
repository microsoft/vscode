# Phase 7 Implementation Plan — `ClaudeAgent` tool calls + permission + user input

> **Handoff plan** — written to be executed by an agent with no prior conversation context. All file paths and line citations are verified against the workspace at synthesis time. Cross-reference [roadmap.md](./roadmap.md) before committing exact phase numbers.

## 1. Goal

Replace Phase 6's `canUseTool: deny` stub with the real tool-use loop. Map the SDK's `tool_use` / `tool_result` flow to the protocol's tool-call state machine (`Streaming → PendingConfirmation → Running → Completed/Cancelled`), implement `respondToPermissionRequest` and `respondToUserInputRequest`, honour the session's `permissionMode`, and special-case the `AskUserQuestion` built-in tool through a `SessionInputRequested` round-trip.

**Phase 7 deliverable.** A user typing "read package.json" sees:

1. `SessionToolCallStart` (toolName `Read`, `Streaming`),
2. `SessionToolCallDelta` events streaming the partial input JSON,
3. `pending_confirmation` signal → host translates to `SessionToolCallReady` (PendingConfirmation),
4. Workbench dispatches `SessionToolCallConfirmed { approved: true }` → `respondToPermissionRequest`,
5. SDK runs the tool, `SessionToolCallComplete` lands with the file content as `ToolCallResult`.

A user typing "what should I do next?" — and the model invoking `AskUserQuestion` — sees a `SessionInputRequested`, the workbench answers via `SessionInputCompleted`, `respondToUserInputRequest` resolves the deferred, and the SDK receives the answers as `updatedInput`.

**Out of scope (deferred):**

- File edit tracking, diff previews, per-file undo (Phase 8).
- `abortSession`, steering, `changeModel` (Phase 9).
- Client-provided tools / MCP gateway (Phase 10).
- Customizations / plugins (Phase 11).
- Subagents (Phase 12).
- Full transcript reconstruction including `tool_use` / `tool_result` replay (Phase 13).

**Exit criteria:**

1. The Phase 6 `canUseTool` deny stub is gone. Every tool the SDK proposes either auto-approves through the session's `permissionMode`, surfaces a confirmation via `pending_confirmation`, or — for `AskUserQuestion` only — round-trips through `SessionInputRequested`.
2. `IClaudeMapperState` exposes per-block tool tracking. The defense-in-depth `tool_use` warn-and-drop at [claudeMapSessionEvents.ts:163-167](claudeMapSessionEvents.ts#L163) is replaced with a real `SessionToolCallStart` emission, paired with `SessionToolCallDelta` for `input_json_delta`, and `SessionToolCallComplete` for synthetic `user` messages carrying `tool_result` content blocks.
3. `ClaudeAgent.respondToPermissionRequest(requestId, approved)` and `ClaudeAgent.respondToUserInputRequest(requestId, response, answers)` no longer throw `TODO: Phase 7`. Both iterate `_sessions` and delegate to the matching `ClaudeAgentSession.respondToPermissionRequest` / `respondToUserInputRequest`, which return `boolean` so the iteration can stop on first match — mirroring [`copilotAgent.ts:1239-1254`](../copilot/copilotAgent.ts#L1239-L1254).
4. The hardcoded `permissionMode: 'default'` at [claudeAgent.ts:444](claudeAgent.ts#L444) is replaced with a live read from `IAgentConfigurationService.getSessionConfigValues(sessionUri)[ClaudeSessionConfigKey.PermissionMode]`. Mid-session changes propagate via `Query.setPermissionMode(mode)` from the next `sendMessage` (no per-event listener — the session re-reads at every entry point).
5. Disposing a session whose `canUseTool` is parked on a deferred unblocks cleanly: `denyAllPending()` resolves every pending permission with `false` and every pending user input with `Cancel`.
6. Existing Phase 6 tests still pass. `claudeAgent.test.ts:797-832`'s "TODO: Phase 7" placeholder is removed; the suite gains tool-lifecycle tests, permission-mode tests, and an `AskUserQuestion` test driving the captured `canUseTool` callback.
7. The proxy-backed integration test exercises one `Read` permission round-trip.

## 2. Files to create / modify

| Action | File | Purpose |
|---|---|---|
| **Modify** | [claudeAgent.ts](claudeAgent.ts) | Replace `canUseTool` deny stub with the real gate (closure over `this`). Replace hardcoded `permissionMode: 'default'` with a live config read at materialize. Implement `respondToPermissionRequest` and `respondToUserInputRequest` as `_sessions.values()` iteration, mirroring [`copilotAgent.ts:1239-1254`](../copilot/copilotAgent.ts#L1239-L1254). Wire `Query.setPermissionMode(mode)` into `sendMessage` so live config wins. Add an `onElicitation: async () => ({ action: 'cancel' })` stub in `Options` to silence the SDK auto-decline path for any incidental MCP elicitation (full MCP wiring is Phase 10). |
| **Major edit** | [claudeAgentSession.ts](claudeAgentSession.ts) | Add `_pendingPermissions: Map<string, DeferredPromise<boolean>>` and `_pendingUserInputs: Map<string, { deferred: DeferredPromise<{ response, answers? }>; questionId: string }>`. Add `requestPermission(...)`, `requestUserInput(...)`, `respondToPermissionRequest(requestId, approved): boolean`, `respondToUserInputRequest(requestId, response, answers?): boolean`. Add `denyAllPending()` invoked from the dispose chain so the SDK's `canUseTool` callback unblocks. Add `setPermissionMode(mode)` that forwards to `Query.setPermissionMode` once the query is bound. |
| **Major edit** | [claudeMapSessionEvents.ts](claudeMapSessionEvents.ts) | Extend `IClaudeMapperState` with `activeToolBlocks: Map<number, { toolUseId: string; toolName: string }>` (per-message, cleared on `message_start`) and `toolCallTurnIds: Map<string /*toolUseId*/, string /*turnId*/>` (cross-message, drained on `tool_result`). Replace the warn-and-drop branch at [claudeMapSessionEvents.ts:163-167](claudeMapSessionEvents.ts#L163) with `SessionToolCallStart` emission. Handle `input_json_delta` → `SessionToolCallDelta`. Handle synthetic `user` messages whose `message.content` contains `tool_result` blocks → one `SessionToolCallComplete` per block. **Do NOT emit `SessionToolCallReady`** — that comes from the host translating `pending_confirmation` (see §3.3). |
| **Create** | [claudeToolDisplay.ts](claudeToolDisplay.ts) | Pure helper. `getClaudePermissionKind(toolName: string): 'shell' \| 'write' \| 'mcp' \| 'read' \| 'url' \| 'custom-tool'` and `getClaudeToolDisplayName(toolName: string): string`. Mirrors the [`copilotToolDisplay.ts`](../copilot/copilotToolDisplay.ts) shape. The mapping table is in §4. |
| **Modify** | [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts) | Make `FakeQuery.setPermissionMode` recordable instead of throw. Expose `capturedStartupOptions[].canUseTool` (and `onElicitation`) as callable handles. Add helpers for building `tool_use` content-block stream events and synthetic `tool_result` user messages. Replace [claudeAgent.test.ts:797 / 832](../../test/node/claudeAgent.test.ts#L797) Phase-7 throw assertions with real round-trip tests. Add the cases listed in §5. |
| **Modify** | [../../test/node/claudeAgent.integration.test.ts](../../test/node/claudeAgent.integration.test.ts) | Extend the proxy-backed test to script a one-tool turn (`tool_use { name: 'Read' }` → host approves → `tool_result`) and assert the resulting `AgentSignal` sequence. |

No new dependencies. No SDK version change.

## 3. Implementation spec

### 3.1 The shared owner of the tool-use round-trip is `ClaudeAgent` — not `ClaudeAgentSession`

The SDK's `canUseTool` closure is set on `Options` before the session wrapper is instantiated ([claudeAgent.ts:436-444](claudeAgent.ts#L436)), so the closure cannot capture `this._sessions.get(sessionId)` at construction time. Two viable shapes:

- **(A)** Closure captures `sessionId` and reads `this._sessions.get(sessionId)` at call time — the agent always has access to its own session map. The session owns the pending state and the `pending_confirmation` emission.
- **(B)** Closure captures the session reference passed in by `_materializeProvisional` after the session is constructed.

We pick **(A)**. The session is in `_sessions` by the time any `canUseTool` callback fires (the SDK doesn't dispatch tools before init completes, and init completes before `_materializeProvisional` returns the wrapper at [claudeAgent.ts:469-470](claudeAgent.ts#L469)). (A) keeps the agent the single owner of cross-session policy (config reads, `_sessions` lookup, future MCP routing) and the session purely a per-Query state holder. This mirrors [`copilotAgent.ts:1239-1254`](../copilot/copilotAgent.ts#L1239-L1254): the agent dispatches, the session resolves.

```ts
// claudeAgent.ts (sketch — inside _materializeProvisional, replaces lines 436-444)

const options: Options = {
    // ... unchanged ...
    canUseTool: async (toolName, input, options) => {
        return this._handleCanUseTool(sessionId, toolName, input, options);
    },
    onElicitation: async () => ({ action: 'cancel' }), // §3.7
    permissionMode: this._readSessionPermissionMode(provisional.sessionUri), // §3.6
    // ... unchanged ...
};
```

### 3.2 Pending state on `ClaudeAgentSession`

Mirror [`copilotAgentSession.ts:182-184`](../copilot/copilotAgentSession.ts#L182-L184) — same maps, same value shapes, same `respondTo*` boolean return.

```ts
// claudeAgentSession.ts (additions)

import { DeferredPromise } from '../../../../base/common/async.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { CancellationError } from '../../../../base/common/errors.js';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import {
    SessionInputAnswer,
    SessionInputAnswerState,
    SessionInputAnswerValueKind,
    SessionInputResponseKind,
} from '../../common/state/protocol/state.js';

private readonly _pendingPermissions = new Map<string, DeferredPromise<boolean>>();
private readonly _pendingUserInputs = new Map<string, {
    deferred: DeferredPromise<{ response: SessionInputResponseKind; answers?: Record<string, SessionInputAnswer> }>;
    questionId: string;
}>();

/**
 * Park on a deferred until {@link respondToPermissionRequest} resolves it.
 * The agent has already fired `pending_confirmation` before calling this
 * (so the workbench is already showing the confirm UI). The SDK is
 * blocked on this promise inside its `canUseTool` callback.
 */
async requestPermission(toolUseId: string): Promise<boolean> {
    if (this._abortController.signal.aborted) {
        return false;
    }
    const deferred = new DeferredPromise<boolean>();
    this._pendingPermissions.set(toolUseId, deferred);
    return deferred.p;
}

respondToPermissionRequest(requestId: string, approved: boolean): boolean {
    const deferred = this._pendingPermissions.get(requestId);
    if (!deferred) {
        return false;
    }
    this._pendingPermissions.delete(requestId);
    deferred.complete(approved);
    return true;
}

/**
 * Build a `SessionInputRequested` action, fire it via
 * `_onDidSessionProgress`, and park on a deferred until the workbench
 * answers via {@link respondToUserInputRequest}.
 *
 * Returns the answer keyed by the original `AskUserQuestionInput.questions[].header`
 * (the SDK's expected shape). Returns `undefined` on Cancel/Decline so
 * the caller can deny the SDK tool call.
 */
async requestUserInput(
    request: AskUserQuestionInput,
): Promise<Record<string, string> | undefined> {
    if (this._abortController.signal.aborted) {
        return undefined;
    }
    // ... build SessionInputRequest from `request.questions` (mirrors
    // `copilotAgentSession.ts:828-849` but with multiple questions, since
    // AskUserQuestionInput supports a question carousel) ...
    // ... fire SessionInputRequested action signal ...
    // ... await deferred, transform answers back to `Record<question.header, string>` ...
}

respondToUserInputRequest(
    requestId: string,
    response: SessionInputResponseKind,
    answers?: Record<string, SessionInputAnswer>,
): boolean {
    const pending = this._pendingUserInputs.get(requestId);
    if (!pending) {
        return false;
    }
    this._pendingUserInputs.delete(requestId);
    pending.deferred.complete({ response, answers });
    return true;
}

/**
 * Forwards to `Query.setPermissionMode(mode)` once the query has been
 * bound. Pre-bind, this is a no-op — the next materialize seeds the
 * mode via `Options.permissionMode`.
 */
setPermissionMode(mode: PermissionMode): void {
    this._query?.setPermissionMode(mode);
}

/**
 * Invoked from the dispose chain. Resolves every parked permission
 * deferred with `false` and every parked input deferred with `Cancel`,
 * unblocking the SDK's `canUseTool` callback so it can return and the
 * SDK can shut down cleanly.
 */
private _denyAllPending(): void {
    for (const [, deferred] of this._pendingPermissions) {
        if (!deferred.isSettled) {
            deferred.complete(false);
        }
    }
    this._pendingPermissions.clear();

    for (const [, pending] of this._pendingUserInputs) {
        if (!pending.deferred.isSettled) {
            pending.deferred.complete({ response: SessionInputResponseKind.Cancel });
        }
    }
    this._pendingUserInputs.clear();
}
```

Wire `_denyAllPending()` into the existing dispose chain at [claudeAgentSession.ts:122-125](claudeAgentSession.ts#L122). Order matters: deny BEFORE `_abortController.abort()` so the SDK's `canUseTool` callback (currently parked) resolves with `false` and the SDK's loop unwinds before the abort tears the subprocess down. After `abort()`, `_warm[Symbol.asyncDispose]()` runs as today.

```ts
// In the constructor, immediately after `super();` and BEFORE the
// existing `_abortController` dispose registration:
this._register(toDisposable(() => this._denyAllPending()));
this._register(toDisposable(() => this._abortController.abort()));
// ... existing WarmQuery dispose ...
```

`Disposable` runs registrations in LIFO order, so register `_denyAllPending` FIRST so it runs LAST. Wait — actually [base/common/lifecycle.ts](../../../../base/common/lifecycle.ts) `dispose()` runs registered disposables in arbitrary order via the `DisposableStore.dispose` map; verify the actual semantics before relying on order. **Safer:** make `_denyAllPending()` synchronous and idempotent, and call it explicitly at the top of an `override dispose()` — that guarantees deterministic ordering.

```ts
override dispose(): void {
    this._denyAllPending();
    super.dispose();
}
```

### 3.3 Mapper extensions

`IClaudeMapperState` gains two maps. The existing `currentBlockParts` is a per-message map cleared on `message_start`; `activeToolBlocks` follows the same lifecycle. `toolCallTurnIds` is cross-message (a `tool_use` lands in one assistant message, the matching `tool_result` arrives in a later synthetic user message).

```ts
// claudeMapSessionEvents.ts (extended interface)

export interface IClaudeMapperState {
    /** existing — text/thinking part allocation */
    readonly currentBlockParts: Map<number, string>;

    /**
     * Per-message: maps content_block index → in-flight tool-use block.
     * Populated on `content_block_start { tool_use }`, drained on
     * `content_block_stop`, cleared on `message_start`.
     */
    readonly activeToolBlocks: Map<number, { toolUseId: string; toolName: string }>;

    /**
     * Cross-message: maps SDK `tool_use_id` → the `turnId` the tool was
     * announced under. Populated on `content_block_start { tool_use }`,
     * drained when the matching `tool_result` arrives in a synthetic
     * `user` message. Persists across `message_start` clears because
     * `tool_result` arrives in a different SDKMessage than the
     * announcing assistant message.
     */
    readonly toolCallTurnIds: Map<string, string>;
}
```

Initialise in [claudeAgentSession.ts:84-85](claudeAgentSession.ts#L84):

```ts
private readonly _mapperState: IClaudeMapperState = {
    currentBlockParts: new Map(),
    activeToolBlocks: new Map(),
    toolCallTurnIds: new Map(),
    toolCallNames: new Map(),
};
```

#### 3.3.1 `content_block_start { tool_use }` — emit `SessionToolCallStart`

Replaces the warn-and-drop branch at [claudeMapSessionEvents.ts:163-167](claudeMapSessionEvents.ts#L163).

```ts
if (block.type === 'tool_use') {
    state.activeToolBlocks.set(event.index, { toolUseId: block.id, toolName: block.name });
    state.toolCallTurnIds.set(block.id, turnId);
    state.toolCallNames.set(block.id, block.name);
    return [{
        kind: 'action',
        session,
        action: {
            type: ActionType.SessionToolCallStart,
            session: sessionStr,
            turnId,
            toolCallId: block.id,
            toolName: block.name,
            displayName: getClaudeToolDisplayName(block.name),
        } satisfies SessionToolCallStartAction,
    }];
}
```

The `SessionToolCallStart` action transitions the tool call into `Streaming` ([state.ts:1123-1135](../../common/state/protocol/state.ts#L1123)) — `partialInput` is empty, deltas append to it.

#### 3.3.2 `content_block_delta { input_json_delta }` — emit `SessionToolCallDelta`

```ts
if (event.delta.type === 'input_json_delta') {
    const active = state.activeToolBlocks.get(event.index);
    if (!active) {
        return [];
    }
    return [{
        kind: 'action',
        session,
        action: {
            type: ActionType.SessionToolCallDelta,
            session: sessionStr,
            turnId,
            toolCallId: active.toolUseId,
            content: event.delta.partial_json,
        } satisfies SessionToolCallDeltaAction,
    }];
}
```

The mapper does NOT need to assemble the JSON. The SDK delivers fully-parsed `input` to `canUseTool` ([sdk.d.ts:1825-1833](../../../../../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L1825)); the `Delta` events exist purely so the workbench can render the streaming params live.

#### 3.3.3 `content_block_stop` — drain per-block state

Drain `activeToolBlocks.delete(event.index)`. Do NOT emit `SessionToolCallReady` here — that arrives from `pending_confirmation` (§3.5). Mapper-side, the tool call sits in `Streaming` until the host advances it.

Also drain `currentBlockParts.delete(event.index)` for parity with the text/thinking branches; today's mapper already implicitly relies on the part-id staying allocated for late deltas (the SDK's per-block ordering guarantees deltas don't arrive after stop), but explicit cleanup avoids accumulating dead entries across long turns.

#### 3.3.4 Synthetic `user` message with `tool_result` blocks — emit `SessionToolCallComplete`

The SDK delivers tool results back as `SDKUserMessage` records with `isSynthetic: true` (or sometimes `isSynthetic` absent) and a `message.content` array containing `tool_result` content blocks per the Anthropic API. From [sdk.d.ts:3489-3510](../../../../../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L3489):

```ts
export declare type SDKUserMessage = {
    type: 'user';
    message: MessageParam;             // content is BetaContentBlockParam[]
    parent_tool_use_id: string | null;
    isSynthetic?: boolean;
    tool_use_result?: unknown;
    // ...
};
```

The mapper detects:

```ts
case 'user': {
    const content = message.message.content;
    if (!Array.isArray(content)) {
        return [];
    }
    const signals: AgentSignal[] = [];
    for (const block of content) {
        if (block.type !== 'tool_result') {
            continue;
        }
        const toolUseId = block.tool_use_id;
        const associatedTurnId = state.toolCallTurnIds.get(toolUseId);
        const toolName = state.toolCallNames.get(toolUseId);
        if (associatedTurnId === undefined || toolName === undefined) {
            // Defense in depth: tool result without a known announcement.
            // Phase 13 transcript replay will populate the maps from disk;
            // in Phase 7 a missing entry means the SDK emitted a tool_result
            // we never saw the tool_use for.
            logService.warn(`[claudeMapSessionEvents] tool_result for unknown tool_use_id ${toolUseId}`);
            continue;
        }
        state.toolCallTurnIds.delete(toolUseId);
        state.toolCallNames.delete(toolUseId);
        signals.push({
            kind: 'action',
            session,
            action: {
                type: ActionType.SessionToolCallComplete,
                session: sessionStr,
                turnId: associatedTurnId,
                toolCallId: toolUseId,
                result: buildToolCallResult(block, toolName),
            } satisfies SessionToolCallCompleteAction,
        });
    }
    return signals;
}
```

`buildToolCallResult` translates the Anthropic `tool_result` content (string or content-block array) into `ToolCallResult` ([state.ts:1095-1116](../../common/state/protocol/state.ts#L1095)). Phase-7 mapping (per §9.3 decision):

- `success = !block.is_error`
- `pastTenseMessage = \`${getClaudeToolDisplayName(toolName)} finished\``  — Phase 8 refines per-tool.
- `content` = pass-through of the Anthropic `tool_result.content` array if it's already an array of typed blocks; if it's a plain string, wrap as `[{ type: 'text', text: <string> }]`.

The `toolName` is needed for the past-tense string. Add a third map to `IClaudeMapperState` to support this: `toolCallNames: Map<string /*toolUseId*/, string /*toolName*/>`. Populated alongside `toolCallTurnIds` on `tool_use` start; drained alongside it on `tool_result`.

```ts
// claudeMapSessionEvents.ts (final IClaudeMapperState shape)
export interface IClaudeMapperState {
    readonly currentBlockParts: Map<number, string>;
    readonly activeToolBlocks: Map<number, { toolUseId: string; toolName: string }>;
    readonly toolCallTurnIds: Map<string, string>;
    readonly toolCallNames: Map<string, string>;
}
```

#### 3.3.5 Why the mapper doesn't emit `SessionToolCallReady`

The protocol's tool-call state machine ([sessionState.ts:60-65](../../common/state/sessionState.ts)) lives in two phases:

1. **`Streaming`** — `SessionToolCallStart` + 0..N `SessionToolCallDelta`. The mapper drives this purely from stream events.
2. **`PendingConfirmation`** — `SessionToolCallReady` lands the assembled tool-call state and triggers the confirmation UI.

The hop from Streaming → PendingConfirmation is the host's call. The host's `_translateToolCallSignal` (existing infrastructure on `AgentService`, used by Copilot today) handles the `pending_confirmation` signal by either (a) auto-approving and dispatching `SessionToolCallReady` with `confirmed: NotNeeded`, or (b) dispatching `SessionToolCallReady` with confirmation options. Either way the action is the host's, not the mapper's. See [agentService.ts:299-330](../../common/agentService.ts#L299) for the contract — the comment is explicit: "the host applies auto-approval logic over `permissionKind` / `permissionPath` and then dispatches the appropriate `SessionToolCallReady` action".

Mapper emits `Start` and `Delta`. Session emits `pending_confirmation`. Host emits `Ready`. Mapper emits `Complete`.

### 3.4 The `_handleCanUseTool` flow

The closure in `Options.canUseTool` is the hot path. It must:

1. Re-read live `permissionMode` (so a mid-turn config change wins).
2. Special-case `AskUserQuestion` (§3.5).
3. Auto-approve under `bypassPermissions` (any tool) and `acceptEdits` (write-class tools).
4. Return `{ behavior: 'deny', message: '...' }` if the session is gone or aborted.
5. Otherwise, fire `pending_confirmation` and park on `session.requestPermission(toolUseId)`.

```ts
// claudeAgent.ts (new private method)

private async _handleCanUseTool(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>,
    options: { suggestions?: PermissionUpdate[]; signal: AbortSignal; blockedPath?: string; toolUseID: string },
): Promise<PermissionResult> {
    const session = this._sessions.get(sessionId);
    if (!session) {
        // Race: session disposed between SDK call and our lookup. SDK
        // expects a deny so its loop can unwind.
        return { behavior: 'deny', message: 'Session is no longer active' };
    }

    const sessionUri = session.sessionUri;
    const liveMode = this._readSessionPermissionMode(sessionUri);

    // 1. AskUserQuestion: surface as user input request (§3.5).
    if (toolName === 'AskUserQuestion') {
        const askInput = input as AskUserQuestionInput;
        const answers = await session.requestUserInput(askInput);
        if (!answers) {
            return { behavior: 'deny', message: 'The user cancelled the question' };
        }
        return {
            behavior: 'allow',
            updatedInput: { ...askInput, answers },
        };
    }

    // 2. Plan mode disables non-read tools natively in the SDK; if it
    //    still calls canUseTool, deny non-read tools defensively.
    const permissionKind = getClaudePermissionKind(toolName);
    if (liveMode === 'plan' && permissionKind !== 'read') {
        return { behavior: 'deny', message: 'Plan mode is read-only' };
    }

    // 3. bypassPermissions: allow everything.
    if (liveMode === 'bypassPermissions') {
        return { behavior: 'allow' };
    }

    // 4. acceptEdits: auto-approve write-class tools.
    if (liveMode === 'acceptEdits' && permissionKind === 'write') {
        return { behavior: 'allow' };
    }

    // 5. Default path: surface a pending confirmation.
    const permissionPath = options.blockedPath ?? extractPermissionPath(toolName, input);
    const toolInputJson = JSON.stringify(input);

    this._onDidSessionProgress.fire({
        kind: 'pending_confirmation',
        session: sessionUri,
        state: {
            status: ToolCallStatus.PendingConfirmation,
            toolCallId: options.toolUseID,
            toolName,
            displayName: getClaudeToolDisplayName(toolName),
            invocationMessage: getClaudeToolDisplayName(toolName), // §9.3: generic in Phase 7
            toolInput: toolInputJson,
        } satisfies ToolCallPendingConfirmationState,
        permissionKind,
        permissionPath,
    });

    const approved = await session.requestPermission(options.toolUseID);
    return approved
        ? { behavior: 'allow' }
        : { behavior: 'deny', message: 'User declined' };
}

private _readSessionPermissionMode(sessionUri: URI): PermissionMode {
    const values = this._configurationService.getSessionConfigValues(sessionUri.toString());
    const raw = values?.[ClaudeSessionConfigKey.PermissionMode];
    if (raw === 'acceptEdits' || raw === 'bypassPermissions' || raw === 'plan' || raw === 'default') {
        return raw;
    }
    return 'default';
}
```

`extractPermissionPath` is a tiny pure helper alongside `getClaudePermissionKind` in [claudeToolDisplay.ts](claudeToolDisplay.ts) — see §4. Per §9.3, Phase 7 ships `invocationMessage = getClaudeToolDisplayName(toolName)` (e.g. `"Read file"`); Phase 8 refines per-tool. There is no separate `getClaudeInvocationMessage` helper in Phase 7 — call `getClaudeToolDisplayName` directly.

### 3.5 `AskUserQuestion` special-case

The `AskUserQuestion` built-in tool ([extensions/copilot/src/extension/chatSessions/claude/common/claudeTools.ts:60](../../../../../../extensions/copilot/src/extension/chatSessions/claude/common/claudeTools.ts#L60)) is the SDK's question-carousel mechanism. The production extension handles it in [`askUserQuestionHandler.ts:33-92`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/common/toolPermissionHandlers/askUserQuestionHandler.ts#L33) by:

1. Calling the workbench `vscode_askQuestions` core tool to render the question carousel.
2. Translating the answers back into the SDK's expected shape: `Record<question.question, "selected, freeText">` keyed by **question text**, not header.
3. Returning `{ behavior: 'allow', updatedInput: { ...input, answers } }` so the SDK "executes" the tool with the assembled answers as its result.

The agent host has no direct workbench tool service, but it has the `SessionInputRequested` action — designed for exactly this round-trip. The mapping is identical except:

- Host fires `SessionInputRequested` with one `SessionInputQuestion` per `AskUserQuestionInput.questions[i]`.
- Workbench renders the carousel, dispatches `SessionInputCompleted`.
- Agent host calls `respondToUserInputRequest` → `session.respondToUserInputRequest` → resolves the `requestUserInput` deferred → closure builds `answers` and returns `{ behavior: 'allow', updatedInput: { ...input, answers } }`.

**Why not `onElicitation`?** GPT's council vote pointed there but the SDK declares `ElicitationRequest` as MCP-server-only — see [sdk.d.ts:498-520](../../../../../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L498):

> ```
> /** Elicitation request from an MCP server, asking the SDK consumer for user input. */
> export declare type ElicitationRequest = { ... };
> ```

`AskUserQuestion` is a built-in tool, not an MCP server, so it never reaches `onElicitation`. (We still wire `onElicitation` as a `cancel` stub — §3.7 — because some hooks/customizations could surface elicitations once Phase 11 lands, and the SDK auto-declines if the field is absent.)

**Mapping the answers.** `AskUserQuestionInput.questions[i]` has `header` (id) and `question` (display). The SDK expects `answers` keyed by `question.question` ([extensions/copilot/.../askUserQuestionHandler.ts:67-73](../../../../../../extensions/copilot/src/extension/chatSessions/claude/common/toolPermissionHandlers/askUserQuestionHandler.ts#L67)). The protocol's `SessionInputAnswer` is keyed by our internally-generated `questionId`. So:

- When firing `SessionInputRequested`, generate a unique `questionId` per question and stash a `Map<questionId, headerOrQuestionText>` in the pending entry.
- When the answer arrives, look up by `questionId`, read the answer's `value` (text or selected), and build `Record<question.question, value>`.
- Concatenate selected options + freeform text with `, ` to match the production extension's behaviour.

### 3.6 `permissionMode` propagation

Two surfaces consume the mode:

- **The SDK.** Set via `Options.permissionMode` at materialize, and via `Query.setPermissionMode(mode)` mid-session.
- **Our `canUseTool` gate.** Re-read live from `IAgentConfigurationService` on every callback (§3.4).

**Materialize.** Replace `permissionMode: 'default'` at [claudeAgent.ts:444](claudeAgent.ts#L444) with `permissionMode: this._readSessionPermissionMode(provisional.sessionUri)`.

**Mid-session.** In `sendMessage` ([claudeAgent.ts:761-783](claudeAgent.ts#L761)), before invoking `entry.send(...)`, call `entry.setPermissionMode(this._readSessionPermissionMode(session))`. This guarantees the SDK's view matches the user's latest config value before each turn. Mid-turn changes to `permissionMode` between two `canUseTool` callbacks are not separately propagated — the next turn syncs it. The `canUseTool` gate (§3.4) reads live, so the host's auto-approval policy responds immediately even if the SDK's internal classification lags by one turn.

**Why no `SessionConfigChanged` listener.** [agentSideEffects.ts:835](../agentSideEffects.ts#L835) handles `SessionConfigChanged` at the side-effects layer — by the time `canUseTool` fires, `getSessionConfigValues` returns the new value. There is no need to subscribe per session. This matches CopilotAgent's "read at every entry point" pattern ([copilotAgent.ts:773](../copilot/copilotAgent.ts#L773): "any `SessionConfigChanged` actions that arrived after `createSession` are honoured without bespoke forwarding").

### 3.7 `onElicitation` stub

The SDK's `Options.onElicitation` ([sdk.d.ts:1320](../../../../../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L1320)) is the MCP-only equivalent of `canUseTool` for elicitation requests. If absent, the SDK auto-declines (sdk.d.ts comment around `OnElicitation`). Phase 7 has no MCP servers wired (Phase 10), so this is technically unreachable, BUT:

- Phase 11 hooks/customizations may surface elicitations earlier than Phase 10 expects.
- A user-supplied CLAUDE.md in the cwd can configure plugins or settings that include an MCP server.

Add a `cancel` stub so any incidental elicitation declines cleanly with a logged warn:

```ts
// claudeAgent.ts (in _materializeProvisional Options)
onElicitation: async req => {
    this._logService.info(`[Claude] declining elicitation from MCP server (Phase 7 stub): ${req.message ?? ''}`);
    return { action: 'cancel' };
},
```

Promote to a real implementation in Phase 10 alongside the MCP gateway.

### 3.8 `respondToPermissionRequest` / `respondToUserInputRequest` on `ClaudeAgent`

Replace [claudeAgent.ts:785-790](claudeAgent.ts#L785) with the same iteration pattern used by [`copilotAgent.ts:1239-1254`](../copilot/copilotAgent.ts#L1239-L1254):

```ts
respondToPermissionRequest(requestId: string, approved: boolean): void {
    for (const session of this._sessions.values()) {
        if (session.respondToPermissionRequest(requestId, approved)) {
            return;
        }
    }
    // Optional: log a warn for unknown requestIds. Returning silently
    // matches CopilotAgent — the workbench treats both as "no-op" and
    // the action is already idempotent at the reducer level.
}

respondToUserInputRequest(
    requestId: string,
    response: SessionInputResponseKind,
    answers?: Record<string, SessionInputAnswer>,
): void {
    for (const session of this._sessions.values()) {
        if (session.respondToUserInputRequest(requestId, response, answers)) {
            return;
        }
    }
}
```

Synchronous (return `void`) — matches the `IAgent` declaration at [agentService.ts:382-385](../../common/agentService.ts#L382). The actual SDK resumption happens on the deferred promise the session is parked on, which the workbench-driven dispatch flow already runs on the right async tick.

## 4. Tool-name → `permissionKind` / `displayName` mapping

`getClaudePermissionKind(toolName: string)` and `getClaudeToolDisplayName(toolName: string)` live in [claudeToolDisplay.ts](claudeToolDisplay.ts). The mapping is sourced from the SDK's built-in tool list ([sdk.d.ts: see `BUILTIN_TOOL_NAMES` constant if exported, otherwise enumerated here]) cross-referenced with the production extension's [`claudeTools.ts:35-67`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/common/claudeTools.ts#L35) and the host's permissionKind enum at [agentService.ts:324](../../common/agentService.ts#L324).

| Tool name | `permissionKind` | `displayName` | Notes |
|---|---|---|---|
| `Bash` | `shell` | `Run shell command` | `input.command` is the command line |
| `BashOutput` | `shell` | `Read shell output` | Reads buffered output of a backgrounded Bash |
| `KillBash` | `shell` | `Kill shell command` | Terminates a backgrounded Bash |
| `Read` | `read` | `Read file` | `input.file_path` |
| `Glob` | `read` | `Find files` | `input.pattern`, optional `input.path` |
| `Grep` | `read` | `Search files` | `input.pattern`, optional `input.path` |
| `LS` | `read` | `List directory` | `input.path` |
| `NotebookRead` | `read` | `Read notebook` | `input.notebook_path` |
| `Write` | `write` | `Write file` | `input.file_path` |
| `Edit` | `write` | `Edit file` | `input.file_path` |
| `MultiEdit` | `write` | `Edit file` | `input.file_path` |
| `NotebookEdit` | `write` | `Edit notebook` | `input.notebook_path` |
| `TodoWrite` | `write` | `Update todo list` | Internal SDK state |
| `WebFetch` | `url` | `Fetch URL` | `input.url` |
| `Task` | `custom-tool` | `Run subagent task` | Triggers Phase 12 subagent UX in the future |
| `ExitPlanMode` | `custom-tool` | `Exit plan mode` | Surfaces plan-review confirmation in production extension |
| `AskUserQuestion` | (special-cased — does not produce `pending_confirmation`) | `Ask user a question` | §3.5 |
| `<starts with "mcp__">` | `mcp` | `Run MCP tool ${stripped}` | Reserved for Phase 10 |
| `<unknown>` | `custom-tool` | `${toolName}` | Defensive default |

`extractPermissionPath(toolName, input)` mirrors the column above:

```ts
export function extractPermissionPath(toolName: string, input: Record<string, unknown>): string | undefined {
    switch (toolName) {
        case 'Read':
        case 'Write':
        case 'Edit':
        case 'MultiEdit': {
            const fp = input.file_path;
            return typeof fp === 'string' ? fp : undefined;
        }
        case 'NotebookRead':
        case 'NotebookEdit': {
            const fp = input.notebook_path;
            return typeof fp === 'string' ? fp : undefined;
        }
        case 'Glob':
        case 'Grep':
        case 'LS': {
            const p = input.path;
            return typeof p === 'string' ? p : undefined;
        }
        case 'WebFetch': {
            const url = input.url;
            return typeof url === 'string' ? url : undefined;
        }
        default:
            return undefined;
    }
}
```

`options.blockedPath` from the SDK takes precedence when present (the SDK populates it for tools that map to a single denied path).

## 5. Test cases

All new tests live in [claudeAgent.test.ts](../../test/node/claudeAgent.test.ts) unless noted.

### 5.1 Test infrastructure changes

- **`FakeQuery.setPermissionMode`** at [claudeAgent.test.ts:266](../../test/node/claudeAgent.test.ts#L266): stop throwing. Push to `recordedPermissionModes: PermissionMode[]`.
- **`FakeClaudeAgentSdkService`**: each entry of `capturedStartupOptions` already records the `Options` object verbatim. Tests can therefore call `capturedStartupOptions[0].canUseTool!(name, input, { toolUseID, signal: ..., suggestions: [], blockedPath })` directly. No new field needed.
- **Helpers** at the top of the file:
  - `streamToolUseStart(index, toolUseId, name, turnId)` → `SDKMessage` of type `stream_event` with `event.type === 'content_block_start'`.
  - `streamInputJsonDelta(index, partialJson, turnId)` → `content_block_delta` with `input_json_delta`.
  - `streamContentBlockStop(index, turnId)` → `content_block_stop`.
  - `userToolResultMessage(toolUseId, content, isError?)` → `SDKMessage` of type `user` with `message.content` containing a single `tool_result` block.
- **Replace** [claudeAgent.test.ts:797-832](../../test/node/claudeAgent.test.ts#L797): drop the `respondToPermissionRequest: TODO Phase 7` assertion. (`respondToUserInputRequest` was already not in the throw-list.)

### 5.2 New unit tests

Phrased as `assert.deepStrictEqual` snapshots over the captured `_onDidSessionProgress` event log unless the test specifically targets a single field. Per the workspace's testing guidelines: prefer one snapshot over many small assertions.

1. **`canUseTool: deny stub is gone`.** Materialize a session, drive a `tool_use { name: 'Read' }` block through the stream, call `capturedStartupOptions[0].canUseTool` directly. Assert the call does NOT immediately deny — it parks on a deferred. Resolve via `agent.respondToPermissionRequest(toolUseId, true)` and assert the `canUseTool` promise resolves with `{ behavior: 'allow' }`.

2. **`canUseTool: respondToPermissionRequest false → deny`.** As (1) but `false`. Result: `{ behavior: 'deny', message: 'User declined' }`.

3. **`canUseTool: bypassPermissions auto-allows`.** Seed session config with `permissionMode: 'bypassPermissions'`. Drive `canUseTool` for any tool. Assert immediate `{ behavior: 'allow' }`, no `pending_confirmation` fired.

4. **`canUseTool: acceptEdits auto-allows write tools, prompts shell`.** Seed `acceptEdits`. `Write` → immediate allow. `Bash` → `pending_confirmation` fired, parks on deferred.

5. **`canUseTool: plan mode denies non-read`.** Seed `plan`. `Bash` → immediate deny. `Read` → `pending_confirmation`.

6. **`canUseTool: live config win`.** Seed `default`. Run a `canUseTool` call (parks). Update config to `bypassPermissions` via `SessionConfigChanged`. Run a SECOND `canUseTool` call: assert immediate allow without firing `pending_confirmation`. (Validates the live re-read at §3.4.)

7. **`pending_confirmation signal carries the correct shape`.** Drive a `Read { file_path: '/tmp/foo.txt' }`. Assert the captured signal is exactly:
   ```js
   { kind: 'pending_confirmation', session: <uri>, state: { status: 'pending-confirmation', toolCallId: <toolUseId>, toolName: 'Read', displayName: 'Read file', invocationMessage: '...', toolInput: '{"file_path":"/tmp/foo.txt"}' }, permissionKind: 'read', permissionPath: '/tmp/foo.txt' }
   ```

8. **`mapper emits SessionToolCallStart on tool_use block start`.** Stream `streamToolUseStart(0, 'tu_1', 'Read', turnId)`. Assert the captured action is `{ type: 'session/toolCallStart', toolCallId: 'tu_1', toolName: 'Read', displayName: 'Read file' }`.

9. **`mapper emits SessionToolCallDelta on input_json_delta`.** Stream `streamToolUseStart(...)` then `streamInputJsonDelta(0, '{"file_pa', turnId)`. Assert the second action is `{ type: 'session/toolCallDelta', toolCallId: 'tu_1', content: '{"file_pa' }`.

10. **`mapper emits SessionToolCallComplete on tool_result`.** After (8) and `content_block_stop`, push `userToolResultMessage('tu_1', 'file contents')`. Assert action is `{ type: 'session/toolCallComplete', toolCallId: 'tu_1', turnId: <originalTurnId>, result: { success: true, content: [{ type: 'text', text: 'file contents' }], pastTenseMessage: ... } }`. Verifies `toolCallTurnIds` cross-message linkage.

11. **`mapper drops tool_result for unknown tool_use_id with warn`.** Push `userToolResultMessage('unknown_id', '...')` without a preceding `tool_use`. Assert no actions emitted, `logService.warn` called once.

12. **`AskUserQuestion: surfaces SessionInputRequested, returns updatedInput`.** Drive `canUseTool('AskUserQuestion', { questions: [{ header: 'q1', question: 'Pick one?', options: [...] }] }, ...)`. Assert a `SessionInputRequested` action fires with one question. Resolve via `agent.respondToUserInputRequest(requestId, Accept, { [questionId]: { state: Done, value: { kind: Selected, value: 'option-a' } } })`. Assert the `canUseTool` promise resolves with `{ behavior: 'allow', updatedInput: { questions: [...], answers: { 'Pick one?': 'option-a' } } }`.

13. **`AskUserQuestion: cancel returns deny`.** As (12) but respond with `Cancel`. Result: `{ behavior: 'deny', message: 'The user cancelled the question' }`.

14. **`respondToPermissionRequest unknown id is silent`.** No session has the id. `agent.respondToPermissionRequest('nope', true)` returns void. No throw, no assertion.

15. **`respondToUserInputRequest unknown id is silent`.** Same as (14) for user input.

16. **`Query.setPermissionMode forwards on sendMessage`.** Send a first message (binds the Query). Update config to `acceptEdits`. Send a second message. Assert `FakeQuery.recordedPermissionModes === ['acceptEdits']` (only the second send forwards, since the first send seeded mode via `Options.permissionMode`).

17. **`dispose with parked permission unblocks SDK`.** Drive `canUseTool` (parks). Call `agent.disposeSession(sessionUri)`. Assert the `canUseTool` promise resolves with `{ behavior: 'deny', message: '...' }` and the SDK's `for await` loop terminates without orphaning the deferred. Verifies §3.2 `_denyAllPending` ordering.

18. **`Options.onElicitation stub returns cancel`.** Inspect `capturedStartupOptions[0].onElicitation`. Call it with a fake elicitation request. Assert `{ action: 'cancel' }`.

### 5.3 Integration test (proxy-backed)

Extend [claudeAgent.integration.test.ts](../../test/node/claudeAgent.integration.test.ts):

- Stub `ICopilotApiService` to deliver a canned Anthropic stream that emits a `tool_use { name: 'Read', input: { file_path: '/tmp/x' } }` block, then waits for the `tool_result` to arrive on the upstream request, then emits a final assistant `text` block + `result`.
- Drive `agent.sendMessage(...)`, capture progress signals.
- Assert sequence: `Start(tool_call) → ResponsePart(text) → Start(tool_call=Read) → Delta(...) → pending_confirmation → respondToPermissionRequest(true) → Complete(tool_result) → ResponsePart(text=continuation) → SessionUsage → SessionTurnComplete`.

(The host's `_translateToolCallSignal` injection of `SessionToolCallReady` lives outside the agent's emission stream, so the integration test asserts the agent-side emissions only.)

## 6. Risks / gotchas

1. **Mapper currently warns and drops `tool_use` ([claudeMapSessionEvents.ts:163-167](claudeMapSessionEvents.ts#L163-L167)).** That branch is the Phase 6 defense-in-depth for `canUseTool: deny`. Phase 7 must REPLACE it, not add alongside — leaving both paths means a `tool_use` would emit a `Start` AND log a warn.

2. **`canUseTool` blocks the SDK's tool execution loop.** The SDK parks on the awaited `PermissionResult`. If the session is disposed mid-park, the Promise must still resolve or the SDK's `for await` won't terminate, leaking the subprocess. Mitigated by `_denyAllPending()` in dispose (§3.2). Test 17 covers this.

3. **`Query.setPermissionMode` is only available after the first send.** [`sdk.d.ts: Query`](../../../../../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts) exposes `setPermissionMode` on the bound `Query` only — pre-bind, the field on `ClaudeAgentSession._query` is `undefined`. The call site in `sendMessage` runs INSIDE the sequencer queue (so AFTER `_materializeProvisional` returns and AFTER the first `entry.send` would bind), so the first turn seeds the mode via `Options.permissionMode`, and subsequent turns use `setPermissionMode`. The session's `setPermissionMode` short-circuits if `_query === undefined`.

4. **Existing test asserts `respondToPermissionRequest` throws TODO Phase 7.** [claudeAgent.test.ts:797-832](../../test/node/claudeAgent.test.ts#L797) — must be removed in this phase or the suite fails. The new tests (5.2.1, 5.2.2, 5.2.14) take its place.

5. **SDK auto-declines elicitations when `onElicitation` is absent.** Phase 7 has no MCP servers, but customizations and skills sourced via `settingSources` could still emit elicitations through the SDK's hook plumbing. Wire the `cancel` stub at materialize (§3.7) so the auto-decline is explicit and logged. Test 18 covers this.

6. **`tool_use` block index reuse across messages.** The SDK's content-block index is per-message — a fresh `message_start` resets the counter. `activeToolBlocks` is per-message and cleared on `message_start` for parity with `currentBlockParts`. `toolCallTurnIds` is cross-message and keyed on the SDK's UUID `block.id` (globally unique), not the index. Test 6 (live mode) and test 10 (cross-message tool_result) cover both axes.

7. **Synthetic user-message detection.** [sdk.d.ts:3489-3510](../../../../../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L3489) marks tool-result deliveries as `isSynthetic?: boolean` — present-and-true on emitters that bother. Older emitters omit it. Filter by content shape (any `user` message whose `content` array contains a `tool_result` block), NOT `isSynthetic`. The `tool_result` blocks themselves are what matter; the wrapping message can be anything.

8. **`_handleCanUseTool` runs on the SDK's async tick, not the session sequencer.** The SDK invokes `canUseTool` from inside its own loop — it does NOT serialize with our `_sessionSequencer`. Two parallel tool calls in a single turn (the SDK does emit them) will race into `_handleCanUseTool` simultaneously. Each one looks up the session map, parks on a distinct `toolUseID`-keyed deferred, and resolves independently. No shared mutable state inside `_handleCanUseTool` itself, so this is fine.

9. **`pending_confirmation` ordering vs `Start`/`Delta`.** The mapper emits `Start` and `Delta` from inside the `for await (message of query)` loop. `_handleCanUseTool` fires `pending_confirmation` from a separate async callback path. Both ultimately push into `_onDidSessionProgress` (a single `Emitter`), and `Emitter.fire` is synchronous — the order in which they reach the host is the order they're called. The SDK fires `canUseTool` AFTER the corresponding `content_block_stop`, so the order is: `Start` → `Delta`s → `pending_confirmation`. Verified by walking through the SDK's source path for tool-block delivery.

## 7. Acceptance criteria

1. The 18 new unit tests in §5.2 pass. Existing Phase-6 tests still pass.
2. The integration test in §5.3 exercises a one-tool round-trip end-to-end against the proxy.
3. `npm run compile-check-ts-native` reports zero errors. `npm run gulp compile-extensions` reports zero errors (no extension changes, but the agent platform shares declarations with extensions).
4. `npm run valid-layers-check` reports zero new layer violations.
5. **Live-system smoke run.** Phase 7 extends the existing live-smoke procedure documented at [smoke.md](smoke.md) — the canonical operator-driven E2E for `ClaudeAgent`, harnessed by [`launch-smoke.sh`](scripts/launch-smoke.sh) and [`verify-claude-logs.sh`](scripts/verify-claude-logs.sh). Smoke.md is keyed by phase; Phase 7 adds a row to the "When to run" table and a set of new log assertions to `verify-claude-logs.sh --phase=7`. The run produces a tool-call screenshot + log artifacts attached to the PR.

   **New Phase-7 row to add to smoke.md §1:**

   | 7 (tool calls + permission + user input) | Same as Phase 6 PLUS: a tool-using prompt fires `pending_confirmation`; approving it lands `SessionToolCallComplete` with the result; flipping `permissionMode → bypassPermissions` skips confirmation; an `AskUserQuestion` invocation surfaces the question carousel and answers reach the model. |

   **New Phase-7 assertions to add to `verify-claude-logs.sh --phase=7`:**

   9. ≥ 1 `"type":"session/toolCall/start"` action in the IPC log (proves the mapper's §3.3.1 emission).
   10. ≥ 1 `"signal":"pending_confirmation"` envelope in the agent-host log (proves §3.4 fired).
   11. ≥ 1 `"type":"session/toolCall/complete"` action (proves the synthetic `user` `tool_result` round-trip in §3.3.4).
   12. **No fatal patterns** — extends §6 of smoke.md:
       - `[ClaudeAgentSession] canUseTool callback parked on disposed session` (proves dispose ordering bug if it appears).
       - `[claudeMapSessionEvents] tool_result for unknown tool_use_id` warn (proves cross-message lookup is broken if it appears outside Phase 13 replay).
   13. (Operator-driven) After a `bypassPermissions` round-trip, the agent-host log contains a `Query.setPermissionMode("bypassPermissions")` line and the next tool call has NO matching `pending_confirmation` envelope (proves §3.6 live-mode propagation).

   **New Phase-7 artifacts to capture in `/tmp/claude-smoke/<timestamp>/`:**

   - `tool-actions.log` — sample `session/toolCall/start` / `session/toolCall/complete` envelopes
   - `tool-confirm.png` — screenshot of the tool confirmation card pre-approval
   - `tool-complete.png` — screenshot of the assistant response post-approval
   - `bypass-mode.png` — screenshot proving no confirmation card on bypass
   - `ask-user-question.png` — screenshot of the question carousel

   **Phase-7-specific operator script (uses the [`launch`](../../../../../../.github/skills/launch/SKILL.md) and [`code-oss-logs`](../../../../../../.github/skills/code-oss-logs/SKILL.md) skills):**

   1. **Boot.** Run `./src/vs/platform/agentHost/node/claude/scripts/launch-smoke.sh 9224`. Wait for CDP port. Run `verify-claude-logs.sh --phase=7` to confirm the Phase-6 baseline still passes (registration / auth / proxy / models / no fatals).
   2. **Permission round-trip — approve.** Use the [`launch`](../../../../../../.github/skills/launch/SKILL.md) skill to attach Playwright, open the agent picker, select Claude (use `ArrowDown` + `Enter` per smoke.md §3 gotcha), and type `read package.json and tell me the name`. Wait ≥ 5s for the tool card to render. Snapshot. Verify a `Pick file Read` (or similar) confirmation card appears. Screenshot to `tool-confirm.png`. Approve. Snapshot again. Verify the assistant response includes the package name (e.g. `"code-oss-dev"`). Screenshot to `tool-complete.png`.
   3. **Verify the action stream.** Use the [`code-oss-logs`](../../../../../../.github/skills/code-oss-logs/SKILL.md) skill to read the agent-host log for the active window. Confirm the sequence `canUseTool` → `pending_confirmation` → `respondToPermissionRequest(approved=true)` → `tool_result` → `session/toolCall/complete` appears in order. Re-run `verify-claude-logs.sh --phase=7` and confirm checks 9–11 pass.
   4. **Permission round-trip — bypass.** Open the workbench Approvals dropdown, switch to `bypassPermissions`. Type `read README.md`. Snapshot. Verify NO confirmation card appears; the read result lands directly. Screenshot to `bypass-mode.png`. Re-run `verify-claude-logs.sh --phase=7` and confirm check 13 passes (the `setPermissionMode("bypassPermissions")` line is present and the post-bypass tool call has no `pending_confirmation`).
   5. **`AskUserQuestion` round-trip.** Switch back to `default` mode. Type `What should I do next? Use AskUserQuestion to give me three options.` Snapshot. Verify the question carousel renders. Pick an option. Verify the model receives the answer (the assistant's next response references the chosen option). Screenshot to `ask-user-question.png`.
   6. **Tear down.** `lsof -t -i :9224 | xargs -r kill`. Attach all five screenshots + `tool-actions.log` + the Phase-7 row in `verify-claude-logs.sh` output to the PR per smoke.md §7.

6. The Phase-6 `canUseTool: deny` stub at [claudeAgent.ts:436-440](claudeAgent.ts#L436) is gone — `git grep "Tools are not yet enabled"` returns no matches.

## 8. Phase 8+ contract notes

- **Phase 8 (file edit tracking)** layers on top of `SessionToolCallComplete` for `Write`/`Edit`/`MultiEdit`. Phase 7's `getClaudePermissionKind('Write') === 'write'` and `extractPermissionPath('Write', input) === input.file_path` are the seam — Phase 8 reads them off `pending_confirmation` to allocate `resourceWrite` URIs and attach `edits: { items: FileEdit[] }` to the `pending_confirmation.state.edits` field (currently omitted in Phase 7).
- **Phase 9 (abort/steering)** uses the same `_pendingPermissions` map. `abortSession` will call `_denyAllPending()` then `_abortController.abort()` — Phase 7's `_denyAllPending()` is the underlying primitive. `Query.setPermissionMode` is also touched by Phase 9's plan-mode entry/exit hooks; the `setPermissionMode` method on `ClaudeAgentSession` from §3.2 is the Phase-9 hook point.
- **Phase 10 (client tools / MCP)** replaces the `onElicitation: cancel` stub from §3.7 with a real translation to the protocol's input request / pending tool call. The `getClaudePermissionKind('mcp__*')` rule from §4 is the Phase-10 entry point for routing.
- **Phase 11 (customizations)** adds tools sourced from CLAUDE.md / hooks / agent customizations. `getClaudePermissionKind` falls through to `'custom-tool'` for unknowns, so Phase 7 already handles them (deny/prompt) — Phase 11 just extends the display-name table.
- **Phase 12 (subagents)** uses `parentToolCallId` on `pending_confirmation` ([agentService.ts:333-340](../../common/agentService.ts#L333)). Phase 7 omits it (no Task-tool handling yet). When Phase 12 lands, `_handleCanUseTool` will inspect `input.subagent_type` and set `parentToolCallId` accordingly. The `Task` tool is in the §4 table as `custom-tool` for now.
- **Phase 13 (transcript reconstruction)** must populate `toolCallTurnIds` from disk replay so `tool_result` events delivered on session restoration can map back to the announcing `tool_use`'s turnId. The `IClaudeMapperState` design from §3.3 is the seam — replay drives the same mapper, hydrating the same maps.

## 9. Decisions (grilling outcomes)

The five candidates that survived the council fan-out were resolved during the grilling pass; the user opted into autonomous resolution. Recording the resolutions here so the implementing agent has the full reasoning trail.

### 9.1 `AskUserQuestion` is visible in the transcript as a tool call

**Decision.** Emit `SessionToolCallStart`, `SessionToolCallDelta`, and `SessionToolCallComplete` for `AskUserQuestion` from the mapper, exactly the same as any other tool. Skip ONLY the `pending_confirmation` signal — `_handleCanUseTool` short-circuits to the user-input round-trip (§3.5).

**Why.** The protocol's tool-call card is the natural transcript artifact for "this happened in this turn". `SessionInputRequested` is an orthogonal answer-collection state, not a tool-progress state — they convey different information. Suppressing the tool-call entry would force Phase 13 transcript reconstruction to special-case the read side too, and would lose the record of which questions were asked and how the model received the answers.

**Mapper-side implication.** No special branching for `AskUserQuestion` in the mapper. It treats every `tool_use` block uniformly. The branching happens entirely inside `_handleCanUseTool` (§3.4 step 1).

**UX nuance to flag for the workbench.** When both a tool-call card and the question carousel are visible during the round-trip, the workbench may choose to visually collapse the tool-call card while the carousel is open. That's a workbench rendering concern, not an agent-host emission concern.

### 9.2 `requiresResultConfirmation` is deferred to Phase 8

**Decision.** Phase 7 emits `SessionToolCallComplete` without `requiresResultConfirmation`. Phase 8 (file edit tracking, diff previews, per-file accept/reject) is the correct phase to add it.

**Why.** The flag exists to gate the SDK from receiving the tool's output until the user reviews it ([actions.ts:418](../../common/state/protocol/actions.ts#L418)). The review surface is a diff renderer, which Phase 8 owns. Wiring the flag in Phase 7 without the diff plumbing creates a half-state where the workbench shows "approve result" UI without anything to approve.

**Operational note.** Phase 7's `Write`/`Edit` tools still go through the standard `pending_confirmation` flow before execution (auto-approved under `acceptEdits`, prompted otherwise). They just don't gate the *result*. The model's view of the tool result is unchanged from Phase 6.

### 9.3 `pastTenseMessage` ships generic in Phase 7

**Decision.** Phase 7 emits `pastTenseMessage: \`${displayName} finished\`` (e.g. `"Read file finished"`). Phase 8 refines per-tool ("Read package.json (240 lines)", "Wrote 12 lines to foo.ts", etc.).

**Why.** Per-tool past-tense strings need access to the tool's *result* shape (line counts, diff summaries) — that data only enters the mapper alongside Phase 8's edit-tracking work. Forcing meaningful strings in Phase 7 means duplicating Phase-8-shape parsers in the mapper. The workbench has rendered generic past-tense strings since the Copilot agent shipped; nothing UX-critical depends on richer text in this phase.

**`invocationMessage` parity.** Same posture: ship `\`${displayName}\`` for Phase 7. Phase 8's per-tool helpers will replace both at the same site.

### 9.4 Wire the `onElicitation: cancel` stub

**Decision.** Set `Options.onElicitation: async req => ({ action: 'cancel' })` at materialize time, with a `_logService.info` of the elicitation message and originating MCP server name. Phase 10 replaces the stub with a real translation.

**Why.** The SDK's behaviour when `onElicitation` is absent is "auto-decline" — but it's not specified what telemetry is fired or what the user-visible result is. An explicit `cancel` with a log line gives us a known surface to debug from when Phase 11 customizations or Phase 10 MCP servers eventually fire elicitations through it. The cost is a single closure on `Options`. The benefit is observability when something unexpected fires.

**Test 18 in §5.2** locks the stub's behaviour so a future SDK upgrade can't silently change it.

### 9.5 `Query.setPermissionMode` rebinding is Phase 9's concern

**Decision.** Phase 7 forwards live `permissionMode` via `Query.setPermissionMode(mode)` from `sendMessage` (§3.6). It does NOT track the previously-set mode or attempt to rebind on yield-restart — that flow doesn't exist yet.

**Why.** Phase 9 owns yield-restart. When that lands, the rebind path will re-build `Options.permissionMode` from the live config (same path as initial materialize at §3.6) — no additional Phase-7 machinery needed. `ClaudeAgentSession.setPermissionMode` from §3.2 stays as-is; it short-circuits when `_query === undefined`, which is the post-restart state right before the next `sendMessage` rebinds it.

**Risk acknowledged.** If Phase 9 lands a yield-restart that doesn't go through `_materializeProvisional`'s path (e.g. it re-uses `WarmQuery` and only rebinds `Query`), it'll need to seed permissionMode itself. Phase 9's plan should call this out in its own §3.6 equivalent.
