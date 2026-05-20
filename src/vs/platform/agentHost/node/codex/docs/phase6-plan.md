# Codex Phase 6 — `sendMessage`, materialization, model swap ✅

Drive a turn end-to-end: lazily construct the codex `Thread` on the
first message, stream events back as protocol actions, support
mid-conversation model / approval / sandbox swaps via thread rebuild.

## What landed

### Provisional sessions

`createSession` returns `{ provisional: true }` without spawning the
codex CLI. The agent host defers the workbench's `sessionAdded`
notification until `onDidMaterializeSession` fires (mirrors Claude's
Phase 6).

Materialization happens on the first `sendMessage` for that session:

1. Read live session config (approval policy, sandbox mode) via
   `IAgentConfigurationService.getSessionConfigValues`.
2. Construct a `Codex.startThread({ workingDirectory, model,
   modelReasoningEffort, approvalPolicy, sandboxMode,
   skipGitRepoCheck: true })`.
3. Fire `onDidMaterializeSession`.
4. Begin streaming.

### Live config readback

Every `sendMessage` re-reads the session config so a
`SessionConfigChanged` action that landed between turns wins over the
value captured at `createSession`. This is the same shape as Claude's
`_readSessionPermissionMode` + `setPermissionMode` flow, except that
codex has no `setPermissionMode` equivalent — we apply the new value
by rebuilding the thread (see next section).

### Model swaps

The codex SDK's `Thread` binds `model`, `modelReasoningEffort`,
`approvalPolicy`, and `sandboxMode` at `startThread()` /
`resumeThread()` time and replays them on every `runStreamed()`. There
is **no equivalent of Claude's `Query.setModel` /
`Query.applyFlagSettings`** — the only way to change a bound flag is to
construct a new `Thread`.

So on every turn we compute a `threadOptionsKey` of
`<modelId>|<effort>|<approvalPolicy>|<sandboxMode>`. If it differs
from the key captured when `entry.thread` was constructed:

- If `entry.thread.id` is populated (a previous turn has run), we
  call `codex.resumeThread(existingId, newOptions)`. This re-attaches
  to the same on-disk transcript at `~/.codex/sessions/<id>.jsonl`,
  so the conversation history is preserved.
- If `entry.thread.id` is `null` (no turn has run yet, the option
  drifted between createSession and first sendMessage), we call
  `codex.startThread(newOptions)`. No transcript yet to preserve.

`changeModel(session, model)` simply stashes the new model on the
session record — it does not rebuild the thread, because the user
might still be tweaking the picker. The rebuild happens on the next
`sendMessage`.

### Streaming loop

```ts
const turnState = createCodexTurnState();
const { events } = await entry.thread.runStreamed(prompt, {
    signal: entry.abortController.signal,
});
for await (const event of events) {
    for (const signal of mapCodexEvent(uri, turnId, event, turnState)) {
        this._onDidSessionProgress.fire(signal);
    }
}
this._fire(uri, { type: ActionType.SessionTurnComplete, turnId });
```

Event mapping itself lives in [`codexMapSessionEvents.ts`](../codexMapSessionEvents.ts);
see [phase7-plan.md](./phase7-plan.md) for the tool-call / streaming
specifics.

### Abort handling

- `abortSession(session)` fires the controller's `abort()`. The signal
  is passed to `runStreamed({ signal })`, so the codex CLI process is
  killed via the SDK's standard child-process termination path.
- A cancelled turn emits `SessionTurnCancelled` (NOT
  `SessionTurnComplete`) so the reducer transitions the turn correctly.
- The aborted controller is re-armed at the **start of the next
  `sendMessage`** (not in the catch handler), so a subsequent turn
  doesn't inherit the aborted signal.

### Errors

- Any `runStreamed` throw that isn't a `CancellationError` fires
  `SessionError(turnId, { errorType: 'CodexError', message, stack })`
  followed by `SessionTurnComplete`. The two-event ending matches
  Claude's contract — without `SessionTurnComplete`, the workbench
  shows the turn as still streaming forever.

## Things the codex SDK doesn't give us

- **Per-tool-call approval gates** — `approvalPolicy` is a global
  thread-level mode. Claude's `canUseTool` per-call hook has no codex
  analogue.
- **Mid-turn message injection** (Claude's steering) — `setPendingMessages`
  is a no-op.
- **In-flight model swap** — see above; we rebuild instead.
- **Hot reload of working directory** — same rebuild path applies if
  we ever expose `cwd` swap.
