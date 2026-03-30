# Code Review: AgentChatBridge & Orchestrator Integration

**Score: 6/10** | Files: 3 | LOC: ~450

## Critical Issues

### 1. Unbounded recursive retry on 429 (agentChatBridge.ts:271)
`_sendLlmRequest` catches 429, marks account exhausted, gets next account, and recursively calls itself. If rotation service cycles through accounts that all return 429 before being marked exhausted (race), or if `getNextAccount` returns the same exhausted account, this becomes infinite recursion blowing the stack.
**Fix:** Add a `maxRetries` parameter (default 3), decrement on each recursive call, throw when exhausted.

### 2. Double progress emission (agentChatBridge.ts:153 + 235)
In `_createAgentImplementation.invoke()`, streaming chunks are emitted via `progress()` inside `_sendLlmRequest` (L235), then the full `responseText` is emitted again at L153-155. Client receives all content twice.
**Fix:** Remove the L153-155 block — streaming already delivered all content incrementally.

### 3. Double state transition in orchestrator (orchestratorServiceImpl.ts:287-289 + agentChatBridge.ts:147-148)
When `_executeSingleTask` calls `executeAgentTask`, the orchestrator transitions agent to Queued->Running (L288-289). Then `executeAgentTask` internally calls `_sendLlmRequest`, but if called via the `invoke` path in `_createAgentImplementation`, it also transitions Queued->Running (L147-148). Depending on call path, state machine may reject duplicate transitions or get confused.
**Fix:** Clarify ownership — orchestrator should own state transitions for tasks it dispatches; `invoke` handles transitions only when called as a chat participant directly.

## High Priority

### 4. CancellationToken not passed through in sendToAgent (orchestratorServiceImpl.ts:194)
`sendToAgent` creates a local `CancellationTokenSource` that is never cancelled. There's no timeout, and the caller has no way to cancel. Long-running LLM calls will hang indefinitely.
**Fix:** Accept a `CancellationToken` parameter or wire up a timeout like `_executeSingleTask` does.

### 5. Token estimation is naive (agentChatBridge.ts:244)
`Math.ceil(length / 4)` ignores system instructions in the input count and doesn't account for multi-byte characters. Reported costs will consistently undercount input tokens.
**Fix:** Include system instruction length; note estimation is approximate in logs. Consider using `computeTokenLength` from `ILanguageModelsService`.

### 6. costPer1MTokens nullable fallback (agentChatBridge.ts:249)
`account.costPer1MTokens ?? 3` — magic number fallback. `IProviderAccount` doesn't define `costPer1MTokens`, so this will always be `3`.
**Fix:** Define the field on the interface or remove cost estimation from bridge.

## Medium Priority

### 7. _executeWithDependencies dead code path (orchestratorServiceImpl.ts:264)
After the stuck-task loop (L250-261), `ready.length` is re-checked at L264 but `ready` was captured before the loop and never updated. This check is always false if it was false at L248 — the `break` at L265 is the only reachable path.

### 8. Dispose of registerAgent return value not tracked by caller
`registerAgent` returns an `IDisposable` but no caller pattern shown stores it. If the orchestrator spawns agents and never disposes registrations, dynamic participants accumulate.

## Positive Observations
- Clean separation: bridge handles LLM, orchestrator handles task lifecycle
- Proper `DisposableStore` usage in `registerAgent`
- Timeout + CTS pattern in `_executeSingleTask` is correct
- Contribution file registration is clean and follows VS Code patterns

## Recommended Actions (priority order)
1. Cap recursive retries in `_sendLlmRequest` (stack overflow risk)
2. Remove duplicate progress emission in `invoke`
3. Clarify state transition ownership between orchestrator and bridge
4. Add cancellation support to `sendToAgent`
