# Phase 7 Implementation Plan — `ClaudeAgent` tool calls + permission + user input

Status: ready

> **Handoff plan** — written to be executed by an agent with no prior conversation context. All file paths and line citations are verified against the workspace at synthesis time. Cross-reference [roadmap.md](./roadmap.md) before committing exact phase numbers.
>
> **Source of truth.** [CONTEXT.md](./CONTEXT.md) is the canonical IAgent ↔ Claude SDK mapping. When this plan and CONTEXT.md disagree on a contract detail, CONTEXT.md wins; surface the drift back to this plan as an `Implementation Notes` deviation rather than silently re-implementing against the plan's wording.
>
> **Scope expansion (pre-implementation, recorded under super-implementer pre-flight).** The original plan (§3.5 / §4 / §5) only covered the `AskUserQuestion` interactive tool. CONTEXT.md M2 (lines 599, 651, 659), [roadmap.md:690](./roadmap.md#L690), and [phase6.1-plan.md G2.6](./phase6.1-plan.md) all specify an `INTERACTIVE_CLAUDE_TOOLS = {'AskUserQuestion', 'ExitPlanMode'}` discriminator, with both tools routed through the user-input flow. Per the source-of-truth rule, CONTEXT.md wins; Phase 7 must handle both. The Steps list, §3.5, §4 (mapping table), and §5.2 (test cases) all need to be extended for `ExitPlanMode`. The mapper (§3.3) is already uniform — it doesn't special-case interactive tools. The `_handleCanUseTool` flow (§3.4) needs to dispatch via an `INTERACTIVE_CLAUDE_TOOLS.has(toolName)` check, with `AskUserQuestion` routing to the question-carousel `requestUserInput` path and `ExitPlanMode` routing to a 2-button Approve/Deny `requestUserInput` path.
>
> **Post-implementation correction (recorded after Step 5 — see Step 5 Implementation Notes).** During implementation, `ExitPlanMode` was found to fit the permission-gate semantics better than the user-input flow: it's an Approve/Deny on whether to leave plan mode (a tool-permission decision), not a question/answer carousel. The implementation routes `ExitPlanMode` through `session.requestPermission` / `pending_confirmation` with custom Approve/Deny labels and the plan body as `invocationMessage`; only `AskUserQuestion` uses `requestUserInput` / `SessionInputRequested`. CONTEXT.md M2 was updated to match (the canUseTool routing table now splits `AskUserQuestion` and `ExitPlanMode` into separate rows; the sibling-comparison `ExitPlanMode` row was rewritten). `INTERACTIVE_CLAUDE_TOOLS` remains the dispatcher discriminator, but its meaning is now "tools the SDK will not auto-approve under any `permissionMode`, so they always reach the host" — not "tools that route through the user-input flow." Tests at [claudeAgent.test.ts:3014, 3034, 3091](../../test/node/claudeAgent.test.ts#L3014) lock in the corrected wire shape (resolved via `respondToPermissionRequest`).
>
> **`ExitPlanMode` design — simple production-extension mirror (deferred richer shape).** Phase 7 mirrors the production extension's [`exitPlanModeHandler.ts`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/common/toolPermissionHandlers/exitPlanModeHandler.ts) verbatim: a single yes/no question with two buttons (`Approve` / `Deny`); on Approve the host calls `session.setPermissionMode('acceptEdits')` then returns `{ behavior: 'allow', updatedInput: input }`; on Deny the host returns `{ behavior: 'deny', message: 'The user declined the plan, maybe ask why?' }` (the production extension's exact wording). CopilotAgent's richer `IExitPlanModeResponse { approved, selectedAction?, autoApproveEdits?, feedback? }` shape ([copilotAgent.ts:106-123](../copilot/copilotAgent.ts#L106), [copilotAgentSession.ts:1439-1518](../copilot/copilotAgentSession.ts#L1439)) is **deferred** — see roadmap.md "ExitPlanMode richer response shape". The handler implementation MUST leave a `// TODO(claude-future): adopt richer IExitPlanModeResponse shape — see roadmap.md` marker at the call site so the upgrade path is discoverable.
>
> **Where the mode flip lives in production.** The production extension does NOT flip `permissionMode → 'acceptEdits'` inside the handler — it lives in `claudeMessageDispatch.ts`'s tool-completion path ([`claudeMessageDispatch.spec.ts:541`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/common/test/claudeMessageDispatch.spec.ts#L541) asserts the post-completion call). The agent host has no equivalent dispatch service, so Phase 7 collapses the flip into the handler immediately before returning `allow`. Functionally identical; surfaced in §3.5b for clarity.

## Steps

The eight implementation subsections in §3 are the steps. Walked in TDD order so each step's red→green is bounded by a coherent group of behaviors from §5. The §3.x subheading is the canonical name; the `Done when` clause and `Files` list collapse the existing §2 / §3 / §5 cross-references into one place per step.

1. ✓ **§3.2 — Pending state on `ClaudeAgentSession`**
    - Files: [claudeAgentSession.ts](claudeAgentSession.ts).
    - Done when: `_pendingPermissions` / `_pendingUserInputs` maps exist; `requestPermission`, `respondToPermissionRequest`, `requestUserInput`, `respondToUserInputRequest`, `setPermissionMode`, `_denyAllPending` are implemented per §3.2; `override dispose()` calls `_denyAllPending()` before `super.dispose()`. Test 17 from §5.2 (dispose with parked permission unblocks SDK) goes red→green here using a tiny in-memory test that constructs a session and dispose-then-asserts; agent-driven tests come later.
2. ✓ **§3.3 — Mapper extensions for `tool_use` / `tool_result`**
    - Files: [claudeMapSessionEvents.ts](claudeMapSessionEvents.ts), [claudeAgentSession.ts](claudeAgentSession.ts) (mapperState init), [../../test/node/claudeMapSessionEvents.test.ts](../../test/node/claudeMapSessionEvents.test.ts), [../../test/node/claudeMapSessionEventsTestUtils.ts](../../test/node/claudeMapSessionEventsTestUtils.ts).
    - Done when: `IClaudeMapperState` carries `activeToolBlocks`, `toolCallTurnIds`, `toolCallNames`; `content_block_start { tool_use }` emits `SessionToolCallStart`; `input_json_delta` emits `SessionToolCallDelta`; `content_block_stop` drains `activeToolBlocks` and `currentBlockParts`; synthetic `user` messages with `tool_result` content emit `SessionToolCallComplete`; unknown `tool_use_id` warns and drops. Tests 8, 9, 10, 11 from §5.2 go red→green here.
3. ✓ **§4 — `claudeToolDisplay.ts` helper module**
    - Files: [claudeToolDisplay.ts](claudeToolDisplay.ts) (new), [../../test/node/claudeToolDisplay.test.ts](../../test/node/claudeToolDisplay.test.ts) (new).
    - Done when: `getClaudePermissionKind`, `getClaudeToolDisplayName`, `extractPermissionPath` exported; mapping table from §4 implemented; `mcp__*` prefix and unknown-tool defensive default both behave per §4. New unit test snapshots the table.
4. ✓ **§3.4 — `_handleCanUseTool` flow on `ClaudeAgent`**
    - Files: [claudeAgent.ts](claudeAgent.ts), [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts).
    - Done when: `canUseTool` closure captures `sessionId` and dispatches into `_handleCanUseTool`; live `permissionMode` is re-read via `_readSessionPermissionMode`; `bypassPermissions`, `acceptEdits`, and `plan` shortcuts behave per §3.4; default path fires `pending_confirmation` and parks on `session.requestPermission(toolUseId)`. Tests 1, 2, 3, 4, 5, 6, 7 from §5.2 go red→green here. The Phase-6 deny stub at [claudeAgent.ts:436-440](claudeAgent.ts#L436) is removed.
5. ✓ **§3.5 — `INTERACTIVE_CLAUDE_TOOLS` user-input flow (`AskUserQuestion` + `ExitPlanMode`)**
    - Files: [claudeAgent.ts](claudeAgent.ts), [claudeAgentSession.ts](claudeAgentSession.ts), [claudeToolDisplay.ts](claudeToolDisplay.ts) (export `INTERACTIVE_CLAUDE_TOOLS`), [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts).
    - Done when: `INTERACTIVE_CLAUDE_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])` exported from [claudeToolDisplay.ts](claudeToolDisplay.ts); `_handleCanUseTool` dispatches via `INTERACTIVE_CLAUDE_TOOLS.has(toolName)`; `AskUserQuestion` → carousel `requestUserInput` per §3.5a; `ExitPlanMode` → simple 2-button Approve/Deny `requestUserInput` per §3.5b that on Approve calls `session.setPermissionMode('acceptEdits')` then returns `{ behavior: 'allow', updatedInput: input }`, on Deny returns `{ behavior: 'deny', message: 'The user declined the plan, maybe ask why?' }`. **Simple production-mirror; richer `IExitPlanModeResponse` shape deferred per roadmap.md.** The implementation MUST drop a `// TODO(claude-future): adopt richer IExitPlanModeResponse shape — see roadmap.md` marker at the handler site. The plan mapping table in §4 marks BOTH tools as "(special-cased — does not produce `pending_confirmation`)". Tests 12, 13 from §5.2 (carousel) plus new tests 12b, 13b (ExitPlanMode Approve flips mode + allow; Deny → `deny` with the production wording) go red→green here.
6. ✓ **§3.6 / §3.8 — `permissionMode` propagation + `respondTo*` agent dispatch**
    - Files: [claudeAgent.ts](claudeAgent.ts), [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts).
    - Done when: `Options.permissionMode` is seeded from `_readSessionPermissionMode(provisional.sessionUri)` at materialize; `sendMessage` calls `entry.setPermissionMode(this._readSessionPermissionMode(session))` before `entry.send(...)`; `respondToPermissionRequest` and `respondToUserInputRequest` iterate `_sessions.values()` and short-circuit on first match; `FakeQuery.setPermissionMode` is recordable. Tests 14, 15, 16 from §5.2 go red→green here.
    - **Implementation Notes (Step 6).** `_readSessionPermissionMode` was changed to return `PermissionMode | undefined` (was `PermissionMode` with a `'default'` fallback). Three call sites carry the fallback chain: `Options.permissionMode` at materialize uses `?? this._resolvePermissionMode(provisional.config)` (production AgentService seeds `state.config` so live wins; test fixtures that bypass that layer rely on the createSession-time fallback); the persisted-metadata write uses the same chain; `_handleCanUseTool` keeps `?? 'default'` for the canUseTool gate. `sendMessage` forwards live mode via `entry.setPermissionMode(this._readSessionPermissionMode(session) ?? 'default')` ONLY when the entry was NOT just-materialized — the just-materialized turn already has the live value via `Options.permissionMode`, so a redundant SDK control-channel call would just record an extra mode in `FakeQuery.recordedPermissionModes`. Tests 14 + 15 (unknown-id silent for both `respondToPermissionRequest` and `respondToUserInputRequest`) shipped in Steps 4 + 5; Test 16 here exercises the live mid-session forward (turn 1 default; `updateSessionConfig({ permissionMode: 'acceptEdits' })`; turn 2 records `['acceptEdits']`). Test 16b additionally pins the materialize-time live read (state seeded with `permissionMode: 'plan'` BEFORE first `sendMessage`; `Options.permissionMode === 'plan'`). The §3.8 portions (`respondTo*` dispatchers + `FakeQuery.setPermissionMode` recordable) graduated to Steps 4 + 5 to keep the round-trip assertion shape working there. Two race tests ("dispose racing _writeCustomizationDirectory" + "agent.dispose() during a racing first sendMessage") needed `IAgentConfigurationService` added to their bespoke `ServiceCollection` since the live read at materialize now reaches into it. After Step 6: 72/72 tests green in claudeAgent.test.ts.
7. ✓ **§3.7 — `onElicitation` cancel stub**
    - Files: [claudeAgent.ts](claudeAgent.ts), [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts).
    - Done when: `Options.onElicitation` is wired to a closure that logs and returns `{ action: 'cancel' }`. Test 18 from §5.2 goes red→green here.
    - **Implementation Notes (Step 7).** Wired `Options.onElicitation` immediately after `canUseTool` in `_materializeProvisional`'s Options object. Closure logs `[Claude] declining elicitation from MCP server (Phase 7 stub): {request.message}` at info level and returns `{ action: 'cancel' }`. `CapturingLogService` extended with an `infos: string[]` channel (was `warns` + `errors` only) so Test 18 can assert the diagnostic line surfaces. Test 18 calls the captured callback with a synthetic `ElicitationRequest` (`{ serverName: 'test-mcp', message: 'Pick a side', mode: 'form' }`) and pins both the `cancel` action and the singleton log entry. Snapshot-style: one `assert.deepStrictEqual` over `{ result, logCount }`. Full MCP wiring deferred to Phase 10. After Step 7: 73/73 tests green in claudeAgent.test.ts.
8. ✓ **§5.3 — Integration test (proxy-backed) + smoke.md row**
    - Files: [../../test/node/claudeAgent.integrationTest.ts](../../test/node/claudeAgent.integrationTest.ts), [smoke.md](smoke.md), [scripts/verify-claude-logs.sh](scripts/verify-claude-logs.sh).
    - Done when: the proxy-backed integration test exercises a one-tool `Read` permission round-trip end-to-end against the proxy and asserts the `AgentSignal` sequence; smoke.md gains the Phase-7 row from §7.5; `verify-claude-logs.sh --phase=7` adds the assertions 9–13 from §7.5.
    - **Implementation Notes (Step 8).** Three deliverables landed: (1) `claudeAgent.integrationTest.ts` got a Phase-7 case ("Phase 7 §5.3 — canUseTool / onElicitation closures wired through to Options on materialize") that drives the existing proxy-backed harness through `agent.sendMessage`, then asserts the captured `Options` carries both `canUseTool` and `onElicitation` functions and that calling `onElicitation` returns `{ action: 'cancel' }`. The full content-block tool round-trip with synthetic `tool_result` user messages is covered exhaustively in `claudeAgent.test.ts` (Tests 1–18) — the integration adds value by guaranteeing the new closures survive the materialize → SDK boundary intact when the real proxy is in the loop. Both Phase-6 and Phase-7 integration tests required wiring `IAgentConfigurationService` into the bespoke `ServiceCollection` (same fix as the Step 6 race tests in `claudeAgent.test.ts`), since `_readSessionPermissionMode` now reaches into it from `_materializeProvisional`. (2) `smoke.md` gained a Phase-7 row in the "When to run" table, a §4.1 Phase-7 operator script (4 steps: approve round-trip, action-stream verify, bypass round-trip, AskUserQuestion flow), and a Phase-7+ entry in §7 "Attach to PR" listing `tool-confirm.png`, `tool-complete.png`, `bypass-mode.png`, `ask-user-question.png`, and `tool-actions.log`. (3) `verify-claude-logs.sh` got the §7.5 assertions 9–13: when `PHASE >= 7`, FATAL_PATTERNS expands with the canUseTool-on-disposed-session and unknown-tool_use_id strings, and a new Phase-7 block counts `session/toolCall/start` / `pending_confirmation` / `session/toolCall/complete` actions in the IPC log (asserts ≥1 of each), snapshots them to `$OUT/tool-actions.log`, and best-effort-greps for `setPermissionMode.*bypassPermissions` for §7.5 assertion 13. After Step 8: 75/75 integration tests green (3/3 in the ClaudeAgent suite); 73/73 unit tests green in `claudeAgent.test.ts`.

    - **Implementation Notes (Step 8 — post-smoke fix).** The smoke test caught a deadlock in the auto-approval path: `_handleCanUseTool` and `_handleExitPlanMode` both fired `pending_confirmation` BEFORE calling `session.requestPermission(toolUseId)` to register the deferred. `agentSideEffects._handleToolReady` auto-approves writes synchronously inside the fire path (so a write inside the working directory matching `_isEditAutoApproved` calls `agent.respondToPermissionRequest` immediately), and that response found an empty `_pendingPermissions` map → the SDK's `canUseTool` deadlocked, the tool result was never produced, and the turn hung forever. Fix mirrors `CopilotAgentSession.handlePermissionRequest`: register the deferred FIRST (`const permissionPromise = session.requestPermission(toolUseId)`), then fire the event, then `await permissionPromise`. Two regression tests added (Test 8 for the Read path, Test 14 for the ExitPlanMode path) that subscribe a synchronous responder to `onDidSessionProgress` and assert `canUseTool` resolves with `allow`. Live re-test against `~/Code/Misc/claude-code` confirmed: README.md write is auto-approved, edit applies (file shows `+2 -0`), turn completes; `exit plan mode...` prompt now renders the "Ready to code?" card with the plan body in both the side-by-side and below-input panels. After fix: 75/75 unit tests green in `claudeAgent.test.ts`.

## Files to Modify or Create

See §2 — duplicated below in the strict-template shape:

| Action | File | Purpose |
|---|---|---|
| **Modify** | [claudeAgent.ts](claudeAgent.ts) | Replace `canUseTool` deny stub with the real gate; wire `onElicitation`, `permissionMode`, and the `_handleCanUseTool` dispatcher; replace `respondToPermissionRequest` / `respondToUserInputRequest` Phase-6 throws with `_sessions.values()` iteration. |
| **Modify** | [claudeAgentSession.ts](claudeAgentSession.ts) | Add `_pendingPermissions` / `_pendingUserInputs` maps; `requestPermission` / `respondToPermissionRequest` / `requestUserInput` / `respondToUserInputRequest` / `setPermissionMode` / `_denyAllPending`; extend `_mapperState` with `activeToolBlocks` / `toolCallTurnIds` / `toolCallNames`. |
| **Modify** | [claudeMapSessionEvents.ts](claudeMapSessionEvents.ts) | Replace warn-and-drop branch with `SessionToolCallStart` emission; handle `input_json_delta` and synthetic `user` `tool_result` per §3.3. |
| **Create** | [claudeToolDisplay.ts](claudeToolDisplay.ts) | `getClaudePermissionKind` / `getClaudeToolDisplayName` / `extractPermissionPath` per §4. |
| **Modify** | [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts) | Make `FakeQuery.setPermissionMode` recordable; add helpers for `tool_use` content-block stream events and synthetic `tool_result` user messages; add tests 1–7, 12–18 from §5.2; remove the Phase-7 throw assertions. |
| **Modify** | [../../test/node/claudeMapSessionEvents.test.ts](../../test/node/claudeMapSessionEvents.test.ts) | Add tests 8–11 from §5.2 covering mapper-side tool emissions. |
| **Modify** | [../../test/node/claudeMapSessionEventsTestUtils.ts](../../test/node/claudeMapSessionEventsTestUtils.ts) | Add `streamToolUseStart`, `streamInputJsonDelta`, `streamContentBlockStop`, `userToolResultMessage` helpers per §5.1. |
| **Create** | [../../test/node/claudeToolDisplay.test.ts](../../test/node/claudeToolDisplay.test.ts) | Snapshot test for the §4 mapping table. |
| **Modify** | [../../test/node/claudeAgent.integrationTest.ts](../../test/node/claudeAgent.integrationTest.ts) | Extend the proxy-backed test with a one-tool `Read` round-trip per §5.3. |
| **Modify** | [smoke.md](smoke.md) | Add the Phase-7 row from §7.5. |
| **Modify** | [scripts/verify-claude-logs.sh](scripts/verify-claude-logs.sh) | Add `--phase=7` assertions 9–13 from §7.5. |

No new dependencies. No SDK version change. The smoke harness scripts (`launch-smoke.sh`, `verify-claude-logs.sh`) and `smoke.md` already exist from earlier phases.

## Verification

### Unit / Integration

- All 18 unit tests in §5.2 pass.
- Integration test in §5.3 passes against the local proxy.
- `npm run compile-check-ts-native` reports zero errors.
- `npm run gulp compile-extensions` reports zero errors.
- `npm run valid-layers-check` reports zero new layer violations.
- Existing Phase 6 tests still pass (`respondToPermissionRequest: TODO Phase 7` throw assertion at [claudeAgent.test.ts:797-832](../../test/node/claudeAgent.test.ts#L797) is replaced, not removed-and-orphaned).

### E2E

The live-system smoke run from §7.5. Uses the [`launch`](../../../../../../.github/skills/launch/SKILL.md) and [`code-oss-logs`](../../../../../../.github/skills/code-oss-logs/SKILL.md) skills to drive Code OSS, render the tool confirmation card, and verify the `pending_confirmation → respondToPermissionRequest → tool_result → SessionToolCallComplete` sequence in agent-host logs. Captures five screenshots + a `tool-actions.log` artifact. The `bypass-mode` and `AskUserQuestion` rounds are part of the same operator session.

`verify-claude-logs.sh --phase=7` is the automated gate inside the operator script — the manual screenshots are for the PR. If `verify-claude-logs.sh --phase=7` fails, treat it as a regression in the most recently completed step and write a unit/integration test that reproduces the gap before re-running.

## Open Questions

None at plan-acceptance time. The five council candidates from the planning pass (§9) were resolved during the grilling pass, with the user opting into autonomous resolution. The decisions live in §9 and are binding for implementation; surface drift back through `Implementation Notes` if any §9 decision turns out to be wrong during execution.

## Decisions

See §9 — the five resolutions are summarised here for super-implementer's strict-template scan; full reasoning lives in §9:

- **§9.1** — `AskUserQuestion` is a normal tool from the mapper's perspective: emit `SessionToolCallStart` / `Delta` / `Complete`. Skip ONLY the `pending_confirmation` signal; the user-input round-trip happens inside `_handleCanUseTool`.
- **§9.2** — `requiresResultConfirmation` is deferred to Phase 8 (file edit tracking). Phase 7 emits `SessionToolCallComplete` without it.
- **§9.3** — `pastTenseMessage` ships as `\`${displayName} finished\`` (generic). Phase 8 refines per-tool. `invocationMessage` matches: ship `\`${displayName}\`` for Phase 7.
- **§9.4** — Wire `Options.onElicitation: async req => ({ action: 'cancel' })` with a `_logService.info` line. Phase 10 replaces with real translation.
- **§9.5** — `Query.setPermissionMode` rebinding on yield-restart is Phase 9's concern. Phase 7 forwards live `permissionMode` from `sendMessage` only; the `setPermissionMode` method short-circuits when `_query === undefined`.

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

### 3.5 `INTERACTIVE_CLAUDE_TOOLS` — host-handled tools

`INTERACTIVE_CLAUDE_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])` — exported from [claudeToolDisplay.ts](claudeToolDisplay.ts) and consulted from `_handleCanUseTool` (§3.4) before any other branch. Membership signals "the SDK does not auto-approve this tool under any `permissionMode`, so it always reaches the host" — not "routes through the user-input flow." Routing splits by tool semantics: `AskUserQuestion` (§3.5a) is structured user input and routes through `session.requestUserInput(...)` / `SessionInputRequested`; `ExitPlanMode` (§3.5b) is a permission gate and routes through `session.requestPermission(...)` / `pending_confirmation` with custom Approve/Deny labels. Both differ from the default `_handleCanUseTool` path only in the per-tool UI shape they emit. (Original plan called for `ExitPlanMode` to also use `requestUserInput`; corrected during implementation — see Step 5 post-implementation correction and the cross-cutting note in §1.)

#### 3.5a `AskUserQuestion` special-case

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

#### 3.5b `ExitPlanMode` special-case (simple production-mirror)

`ExitPlanMode` is the SDK's plan-review mechanism. The model emits a plan body, the host renders it for the user, and an Approve/Deny answer determines whether the SDK continues into edits. Phase 7 mirrors the production extension's [`exitPlanModeHandler.ts`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/common/toolPermissionHandlers/exitPlanModeHandler.ts) verbatim — the simplest contract that satisfies CONTEXT.md M2 and matches user expectations from the production extension.

**Wire shape.** The SDK calls `canUseTool('ExitPlanMode', { plan: string }, ...)`. The handler:

1. Calls `session.requestUserInput({ ... })` with a single `SessionInputQuestion` of kind `SingleSelect`, two options `Approve` and `Deny`, no freeform input. The question text is the plan body, prefixed with `"Here is Claude's plan:\n\n"`. The `displayName` shown in the carousel header is `"Ready to code?"`.
2. Awaits the workbench answer.
3. **On Approve.** Calls `session.setPermissionMode('acceptEdits')` (mirrors what `claudeMessageDispatch.ts` does on tool completion in production — see [`claudeMessageDispatch.spec.ts:541`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/common/test/claudeMessageDispatch.spec.ts#L541)), then returns `{ behavior: 'allow', updatedInput: input }`.
4. **On Deny / cancel.** Returns `{ behavior: 'deny', message: 'The user declined the plan, maybe ask why?' }` — the production extension's exact wording, so the model's recovery prompt is unchanged.

**Pseudo-code (in `_handleCanUseTool`):**

```ts
if (toolName === 'ExitPlanMode') {
    // TODO(claude-future): adopt richer IExitPlanModeResponse shape
    //   ({ approved, selectedAction?, autoApproveEdits?, feedback? }) mirroring
    //   CopilotAgent's exit_plan_mode flow ([copilotAgent.ts:106-123],
    //   [copilotAgentSession.ts:1439-1518]). See roadmap.md "ExitPlanMode
    //   richer response shape".
    const planInput = input as { plan?: string };
    const answer = await session.requestUserInput({
        displayName: localize('claude.exitPlanMode.title', "Ready to code?"),
        questions: [{
            kind: SessionInputQuestionKind.SingleSelect,
            question: localize('claude.exitPlanMode.body', "Here is Claude's plan:\n\n{0}", planInput.plan ?? ''),
            options: [
                { label: localize('claude.exitPlanMode.approve', "Approve"), recommended: true },
                { label: localize('claude.exitPlanMode.deny', "Deny") },
            ],
            allowFreeformInput: false,
        }],
    });
    if (answer?.value === 'Approve') {
        await session.setPermissionMode('acceptEdits');
        return { behavior: 'allow', updatedInput: input };
    }
    return { behavior: 'deny', message: 'The user declined the plan, maybe ask why?' };
}
```

**Why the mode flip lives in the handler (not the mapper).** The production extension splits the responsibility: the handler returns `allow`, then `claudeMessageDispatch.ts` calls `setPermissionModeForSession(sessionId, 'acceptEdits')` after the tool _completes_ ([`claudeMessageDispatch.spec.ts:541-548`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/common/test/claudeMessageDispatch.spec.ts#L541)). The agent host has no equivalent dispatch service, so we collapse the flip into the handler immediately before returning `allow`. The result is functionally identical from the SDK's perspective: by the time the SDK runs the next `canUseTool` for any subsequent edit tool, `permissionMode` is already `'acceptEdits'`.

**Why a single SingleSelect, not two separate questions or a Boolean.** `SingleSelect` matches CopilotAgent's `handleExitPlanModeRequest` ([copilotAgentSession.ts:1439-1518](../copilot/copilotAgentSession.ts#L1439)) and the workbench has rendering for it. A `Boolean` question would carry less semantic intent ("yes"/"no" buttons aren't quite the same UX), and two separate questions would force two round-trips. The two-option SingleSelect collapses to two buttons in the workbench carousel, matching the production extension's button-based UX.

**Test coverage.** Tests 12b and 13b in §5.2:

- **12b.** ExitPlanMode → user picks Approve → `setPermissionMode('acceptEdits')` recorded → closure returns `{ behavior: 'allow', updatedInput: input }`.
- **13b.** ExitPlanMode → user picks Deny (or cancels) → closure returns `{ behavior: 'deny', message: 'The user declined the plan, maybe ask why?' }` — string-equal assertion to lock the wording.

**Deferred richer shape.** CopilotAgent's `IExitPlanModeResponse` ([copilotAgent.ts:106-123](../copilot/copilotAgent.ts#L106)) supports `selectedAction` (multi-action plans), `autoApproveEdits` (override the mode flip), and `feedback` (free-text rejection reason). Adopting that shape requires the workbench to render multi-action plan UX and capture freeform feedback, which is out of scope for Phase 7. Tracked in roadmap.md — see "Deferred enhancements" inside the Phase 7 entry.

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
| `ExitPlanMode` | (special-cased — `pending_confirmation` with custom Approve/Deny labels; plan body rendered as `invocationMessage`) | `Ready to code?` | §3.5b — simple 2-button Approve/Deny mirror of production extension |
| `AskUserQuestion` | (special-cased — routes through `requestUserInput` / `SessionInputRequested`, does not produce `pending_confirmation`) | `Ask user a question` | §3.5a |
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

## Implementation Notes

Live status of the implementation. Updated as steps land.

### Step 1 — §3.2 pending state on `ClaudeAgentSession` ✓

**Files changed.** [claudeAgentSession.ts](claudeAgentSession.ts), [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts).

**Tests added.** Test 17 from §5.2 — `ClaudeAgentSession (Phase 7 §3.2) > dispose with parked permission unblocks SDK (Test 17)`. Constructs a `ClaudeAgentSession` directly, parks `requestPermission('tu_1')`, calls `dispose()`, asserts the deferred resolves with `false`. Lives in a sibling suite (not nested inside the main `ClaudeAgent` suite) so the inner-suite leak detector doesn't double-register with the outer one.

**Deviations from the plan.**

- **`requestUserInput` signature generalised.** Plan §3.2 typed it as `requestUserInput(request: AskUserQuestionInput)`, but §3.5b's pseudo-code calls `session.requestUserInput(...)` with a non-`AskUserQuestion` shape (an Approve/Deny `SingleSelect` for `ExitPlanMode`). Per the source-of-truth rule (CONTEXT.md M2 wins; the §3.2 pseudo-code predates the scope expansion), the session-level primitive is now generic over `SessionInputRequest`. The agent (`_handleCanUseTool` / §3.5) owns the per-tool conversion (`AskUserQuestionInput → SessionInputRequest` and answer → SDK `PermissionResult`). The `_pendingUserInputs` value type collapses to `DeferredPromise<{ response, answers? }>` — no `questionId` stash needed because the agent owns the mapping.
- **`override dispose()` synchronous and idempotent.** Plan §3.2 hedged between LIFO disposable registration and an explicit `override dispose()`; we picked the explicit override (deterministic, doesn't depend on `DisposableStore` ordering semantics). `_denyAllPending()` runs first, then `super.dispose()` triggers the existing abort-controller + `WarmQuery.asyncDispose` chain.

**No drift in scope.** Only `claudeAgentSession.ts` and `claudeAgent.test.ts` were touched, matching the Step 1 `Files` list. The `Emitter` and `ClaudeAgentSession` imports added to the test file are wiring-only.

**Verification.** Test 17 passes; all 57 existing tests in `claudeAgent.test.ts` still pass.

### Step 2 — §3.3 mapper extensions for `tool_use` / `tool_result` ✓

**Files changed.** [claudeMapSessionEvents.ts](claudeMapSessionEvents.ts), [claudeAgentSession.ts](claudeAgentSession.ts), [../../test/node/claudeMapSessionEvents.test.ts](../../test/node/claudeMapSessionEvents.test.ts), [../../test/node/claudeMapSessionEventsTestUtils.ts](../../test/node/claudeMapSessionEventsTestUtils.ts), [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts) (Phase 6.1 warn-and-drop test rewritten).

**Tests added.** Tests 8 / 9 / 10 / 11 from §5.2, plus two bonus snapshots: `tool_result with is_error: true reports success=false` and `tool_result content as TextBlock array unwraps to ToolResultTextContent[]`. The Phase 6.1 `streamed tool_use … warn` test was deleted (the warn-and-drop is gone); the canonical-assistant `tool_use … warn` test was rewritten to assert silent drop.

**Deviations from the plan.**

- **`IClaudeMapperState` reborn as `ClaudeMapperState` class.** Plan §3.3 says "extend `IClaudeMapperState`" — but Phase 6.1 (final state, recorded at `phase6.1-plan.md:574-578`) had already deleted the interface AND removed the mapper's `state` parameter. Phase 7 re-introduces a class (mirroring Phase 6.1's earlier-attempt class shape) with method-only mutators rather than an interface with raw `Map`s. Phase 6.1's prediction was correct: cross-message `tool_use` → `tool_result` linkage requires a class-shaped state.
- **No `currentBlockParts` resurrection.** Plan §3.3 mentions that `content_block_stop` "drains `activeToolBlocks` and `currentBlockParts`". The latter no longer exists (Phase 6.1 dropped it; partIds are now `${turnId}#${index}` derived directly). Step 2 only drains `activeToolBlocks`. The known partId-collision risk for Phase 7 multi-message turns documented at `phase6.1-plan.md:578` is deferred to a follow-up — no test in §5.2 exercises it, and the integration test (Step 8) hits the single-message case.
- **`extractToolResultContent` projects to `ToolResultTextContent[]` only.** Plan §3.3.4 talks about `SessionToolCallComplete.result.content` matching the SDK's `ToolResultBlockParam.content`, but the SDK accepts `string | (TextBlockParam | ImageBlockParam | SearchResultBlockParam | DocumentBlockParam | ToolReferenceBlockParam)[]`. Phase 7 emits only `Text` content; non-text blocks are silently dropped. Phase 8's "richer result kinds" gates the rest.
- **`assistant`-canonical `tool_use` is silently dropped** (no warn). Plan §6.1's defense-in-depth warn-and-drop was specifically for `canUseTool: deny`; Phase 7 lifts the deny stub, so the partial stream owns `SessionToolCallStart` and the canonical envelope's `tool_use` blocks are duplicates by construction. Drop is silent.

**Cross-step infrastructure.** `ClaudeAgentSession` regrows a `_mapperState: ClaudeMapperState` field threaded through every mapper invocation. The mapper signature changes from 4 args to 5 (state inserted before logService) — every call site in the test file was updated.

**Verification.** All 15 mapper unit tests pass. All 56 + the rewritten 1 = 57 `claudeAgent.test.ts` tests still pass. Total agent test count: 77 across the three suites (claudeAgent + claudeMapSessionEvents + claudeToolDisplay).

### Step 3 — §4 `claudeToolDisplay.ts` helper module ✓

**Files added.** [claudeToolDisplay.ts](claudeToolDisplay.ts), [../../test/node/claudeToolDisplay.test.ts](../../test/node/claudeToolDisplay.test.ts).

**Tests added.** Five snapshot tests covering: full §4 mapping table, `mcp__*` prefix handling, unknown-tool fallback, `extractPermissionPath` for all path-bearing tools, and `INTERACTIVE_CLAUDE_TOOLS` membership.

**Deviation from the plan.**

- **Step ordering swapped with §3.3.** Plan listed §4 (Step 3) AFTER §3.3 (Step 2). The mapper's `SessionToolCallStart` emission needs `getClaudeToolDisplayName` from §4, so we shipped §4 first and let §3.3's mapper consume it. Net thrash is minimal — the §3.3 step lists `claudeToolDisplay.ts` as a dependency anyway.
- **`INTERACTIVE_CLAUDE_TOOLS` exported here instead of in Step 5.** The set is a pure data table that belongs alongside the §4 mapping, so it ships in Step 3 with snapshot coverage; Step 5's job is to consume it from `_handleCanUseTool`.
- **`ClaudePermissionKind` exported as a named type.** The plan's §4 prose lists the union inline. Exporting the named type makes the agent-side dispatch and tests typecheck-safe without re-typing the union.

**Verification.** All 5 tests pass; full suite (77 tests) still green.

### Step 4 — §3.4 `_handleCanUseTool` flow on `ClaudeAgent` ✓

**Files changed.** [claudeAgent.ts](claudeAgent.ts), [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts).

**Tests added.** Tests 1–7 from §5.2 plus a `respondToPermissionRequest unknown id is silent` regression test, all under `suite('ClaudeAgent (Phase 7 §3.4 — _handleCanUseTool)')`. Suite-local `materialize()` helper runs a one-turn `system_init → result_success` round-trip so `FakeClaudeAgentSdkService.capturedStartupOptions[0].canUseTool` is captured and the session's `_sessions` entry exists, then directly invokes that closure — bypassing the SDK's own `for await` loop so the gate logic is exercised in isolation.

**Deviations from the plan.**

- **`respondToPermissionRequest` graduated in Step 4 (not Step 6).** Plan §3.8 / Step 6 owns the `respondToPermissionRequest` `_sessions.values()` iteration, but Step 4's "park on `requestPermission` then resolve via `respondToPermissionRequest`" assertion shape requires the agent-level dispatcher to work NOW. The Phase-6 throw stub at [claudeAgent.test.ts:822](../../test/node/claudeAgent.test.ts#L822) is removed at the same time. Step 6 retains responsibility for `respondToUserInputRequest` and the `permissionMode` propagation; only the permission half of §3.8 moves up.
- **Test seed bypasses `IAgentConfigurationService.updateSessionConfig`.** The `SessionConfigChanged` reducer no-ops when `state.config` is undefined ([reducers.ts:593](../../common/state/protocol/reducers.ts#L593)), so the `materialize()` test helper directly mutates `state.config = { schema, values }` to seed `permissionMode`. Test 6 (live config win) still calls `updateSessionConfig` for the live flip — it works because the initial seed left `state.config` defined. Production code is unaffected: real sessions get their `state.config` set by the AgentService schema-registration path, which is separate from `materialize`'s in-memory state plumbing.
- **`updatedInput` always echoes the input verbatim on allow.** Plan §3.4 mentions `updatedInput` as a path for plugin-style input rewriting, but Phase 7 ships the trivial echo (`{ behavior: 'allow', updatedInput: input }`). Phase 8's `Edit` confirm-result wrapper is the first user of a transformed `updatedInput`.
- **`requestPermission` does not take an `updatedInput` argument.** The deferred returned from `ClaudeAgentSession.requestPermission(toolUseId)` resolves with a plain boolean; the agent owns the `{ behavior, updatedInput }` shape. Keeps the session-level primitive boolean-only and lets the agent-level dispatcher (§3.5) layer `AskUserQuestion` / `ExitPlanMode` on top without changing the session contract.
- **`respondToPermissionRequest` is silent on unknown id.** No throw, no log — production-mirrors what an out-of-band cancel would look like (the workbench may dispatch a response for a session that the agent already disposed). Covered by the explicit `unknown id is silent` test.

**Constructor change.** `ClaudeAgent` constructor grew a 7th DI parameter `@IAgentConfigurationService private readonly _configurationService` after `_gitService`. The test fixture's `createTestContext` constructs `AgentHostStateManager` + `AgentConfigurationService`, registers `[IAgentConfigurationService, configService]`, and surfaces both on `ITestContext` (`stateManager`, `configService`) so per-test seeding is possible without re-wiring DI.

**Verification.** 65/65 tests pass in `claudeAgent.test.ts` (57 baseline + 8 new); full suite (85 across claudeAgent + claudeMapSessionEvents + claudeToolDisplay) still green.

### Step 5 — §3.5 `INTERACTIVE_CLAUDE_TOOLS` user-input flow ✓

**Files changed.** [claudeAgent.ts](claudeAgent.ts), [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts).

**Tests added.** Tests 12, 13, 12b, 13b from §5.2 plus a `respondToUserInputRequest unknown id is silent` regression, all under `suite('ClaudeAgent (Phase 7 §3.5 — INTERACTIVE_CLAUDE_TOOLS)')`. The suite-local `materialize()` helper subscribes to `onDidSessionProgress`, filters for `SessionInputRequested` actions, and exposes the captured `inputRequests` array — so each test can both inspect the carousel rendered to the workbench AND drive the answer back via `agent.respondToUserInputRequest(toolUseID, ...)`.

**Deviations from the plan.**

- **`respondToUserInputRequest` graduated in Step 5 (not Step 6).** Symmetric to Step 4's early lift of `respondToPermissionRequest`: the user-input round-trip is the only way to drive `_handleAskUserQuestion` / `_handleExitPlanMode` to completion in tests, so the agent-level `_sessions.values()` dispatcher ships now. Step 6 retains responsibility for `permissionMode` propagation only.
- **`FakeQuery.setPermissionMode` graduated to recordable (was Step 6 / §5.1).** ExitPlanMode's Approve path calls `session.setPermissionMode('acceptEdits')` immediately, which in tests routes through `FakeQuery.setPermissionMode`. The Phase-6 `throw` stub is replaced with `recordedPermissionModes.push(mode)`. Signature is `async setPermissionMode(mode): Promise<void>` to match the SDK's `Query` declaration. Step 6 will use the same recorder for `sendMessage`-driven mid-session forwarding.
- **`_handleInteractiveTool` collapses both tools through one switch.** Plan §3.5 wrote the dispatch as two `if` branches inside `_handleCanUseTool`. We extracted them into a small switch helper so `_handleCanUseTool` reads as a single linear policy chain (interactive → mode shortcuts → park). The `default: deny` arm is defensive; the `INTERACTIVE_CLAUDE_TOOLS.has(toolName)` gate at the call site already excludes unknown names.
- **`SessionInputRequest.id` reuses the `toolUseID`.** The plan §3.5a sketch generated a fresh `questionId` per question and stashed a map. We collapsed to a single id (the SDK's `tool_use_id`) for the request, because `respondToUserInputRequest` already routes by `requestId` against `_pendingUserInputs` and the question-text re-keying happens in `_handleAskUserQuestion`'s answer-collation pass. Per-question ids inside the request are derived from `header` (or `q-${idx}` fallback) so the workbench can target individual questions in a multi-question carousel.
- **AskUserQuestion answer collation matches production verbatim.** `Selected` → `[value, ...freeformValues]`, `SelectedMany` → `[...values, ...freeformValues]`, `Text` → `[value]`, joined with `', '`. Skipped answers and the all-skipped-answers case both return `{ behavior: 'deny', message: 'The user cancelled the question' }`, mirroring `askUserQuestionHandler.ts:50-66`.
- **`ExitPlanMode` decision routing.** Approve maps to a `Selected` answer with `value === 'approve'` against the question id `'plan-decision'`. Anything else (Deny/Cancel/Decline/skipped/unexpected shape) falls through to the production-wording deny. The mode flip happens BEFORE returning `allow`, so by the next `canUseTool` callback the SDK already sees `'acceptEdits'` (matches `claudeMessageDispatch.spec.ts:541-548` semantics). The `// TODO(claude-future): adopt richer IExitPlanModeResponse shape — see roadmap.md` marker lives on the `_handleExitPlanMode` JSDoc.

**Verification.** 70/70 tests pass in `claudeAgent.test.ts` (65 baseline + 5 new); full agentHost test count: 90 across claudeAgent + claudeMapSessionEvents + claudeToolDisplay.

**Post-implementation correction (post-Step 5, captured here for completeness; see also the cross-cutting note in §1).** `ExitPlanMode` was subsequently refactored from the user-input flow to the permission-gate flow because Approve/Deny on "leave plan mode" is semantically a tool-permission decision, not a question/answer carousel. After the refactor:
- `_handleExitPlanMode` calls `session.requestPermission({ toolUseID, state: buildExitPlanModeConfirmationState(...), permissionKind: getClaudePermissionKind('ExitPlanMode') })` instead of `session.requestUserInput(...)`. The plan body is rendered as the card's `invocationMessage`; Approve/Deny use custom button labels.
- On Approve, the host writes `permissionMode: 'acceptEdits'` to `IAgentConfigurationService` (per-session config) instead of calling `session.setPermissionMode('acceptEdits')` directly. The next `sendMessage` reads the new mode and forwards it via `Query.setPermissionMode` between turns. This avoids issuing an SDK control request on the same channel `canUseTool` is mid-delivery on (which deadlocks — see the "MUST NOT call `session.setPermissionMode` here" note in `claudeAgent.ts`).
- Tests 12b, 13b, and 14 in [claudeAgent.test.ts:3014, 3069, 3091](../../test/node/claudeAgent.test.ts#L3014) lock in the corrected wire shape: they listen for `pending_confirmation` with `toolName === 'ExitPlanMode'` and resolve via `respondToPermissionRequest`, not `respondToUserInputRequest`.
- `INTERACTIVE_CLAUDE_TOOLS` retains both members — it remains the dispatcher discriminator — but its meaning collapses to "exempt from SDK auto-approval, needs a hand-coded handler."
- `_handleInteractiveTool`'s switch now dispatches to two structurally different handlers (`requestPermission` vs `requestUserInput`). The earlier note that called the dispatcher "a single linear policy chain" still holds; only the per-tool inner shape differs.
- The `FakeQuery.setPermissionMode` recorder added in this step continues to be useful for Step 6's `sendMessage`-driven forwarding (the path that now carries the ExitPlanMode-induced mode change between turns), so the recorder change earns its keep.

