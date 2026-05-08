# Phase 6.1 Implementation Plan — Mapping Conformance Pass

> **Status:** Cycles A–G + post-Cycle-F architectural cleanup (including the stateless-mapper follow-up) complete.
>
> **Handoff plan** — written to be executed by an agent with no prior conversation context. All file paths and line citations are verified against the workspace at synthesis time. Cross-reference [roadmap.md](./roadmap.md) before committing exact phase numbers.

## 1. Goal

Bring the shipped Claude IAgent surface (Phases 4–6) back into M1–M13 mapping conformance with [CONTEXT.md](./CONTEXT.md). This is a **drift-correction phase**, not a feature phase — every change is a fix to existing code or to a doc bug in `CONTEXT.md`.

**Phase 6.1 deliverable:** the shipped Phase 4–6 surface (`createSession`, `_materializeProvisional`, `sendMessage`, mapper, descriptor, models observable, listSessions, sidecar) agrees with the M1, M8, M11, M12, and M13 portraits — verified by per-cycle unit tests and a single live smoke run.

**Out of scope (deferred):**

- `abortSession` (`claudeAgent.ts:801` throws `TODO: Phase 9`) — Phase 9.
- `changeModel` — Phase 9.
- M9 fork `resume: sessionId` — Phase 6.5 (separate stacked PR).
- M1 yield-boundary mutation barrier — Phase 9 (no hot-swap state shipped yet, so the barrier has nothing to coordinate).
- Phase 7 tool calls, Phase 8 edits, Phase 10+ — all unaffected.

**Exit criteria:**

1. `CONTEXT.md` cites only methods that exist on `IAgent` (no `setSessionConfigValues` references). M11 and M12 invariants are internally consistent.
2. Both `createSession` and `_materializeProvisional` throw `ProtocolError(AHP_AUTH_REQUIRED, …, this.getProtectedResources())` when called pre-auth — never plain `Error`.
3. The outbound `SDKUserMessage` from `sendMessage` carries `uuid: effectiveTurnId`. Turn.id ↔ SDKUserMessage.uuid invariant holds for every turn.
4. `IAgentCreateSessionConfig.config` flows from `createSession` → provisional record → sidecar → `Options.*` on the first `query()` call. First turn uses the requested `model`, `permissionMode`, and `effort` — SDK defaults never silently win.
5. `permissionMode` enum carries 6 values (`'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`), matching the SDK's `PermissionMode` type and the M11 portrait.
6. `IAgentDescriptor.displayName === 'Claude'` (the user-facing brand for this provider; "Claude Code" is forbidden as a UI string). `isClaudeModel` matches the M12-ratified predicate set. `toAgentModelInfo` surfaces `configSchema` (synthesized from CCAModel thinking capability), `policyState`, and `_meta`. `getSessionMetadata?` is implemented. `listSessions` surfaces ALL SDK-known sessions; the per-session sidecar is a best-effort enrichment overlay (deviation from CopilotAgent's drop-without-sidecar pattern, justified by Claude SDK's external-CLI session model).
7. `claudeMapSessionEvents.ts` handles the `'assistant'` (final canonical) `SDKMessage` envelope alongside `'stream_event'` and `'result'`. Final assistant content reconciles with prior partials per the M8:875 invariant.
8. Stale fork narratives in `phase5-plan.md` and `phase6-plan.md` agree with the Phase 6.5 contract-based fork model in `roadmap.md`.

## 2. Verified drift (audit table)

Findings cross-checked against `CONTEXT.md` and source by three independent reviewers (Opus, GPT, Gemini) plus a debate pass.

### CRITICAL

- **C1 (M1)** — [claudeAgent.ts:780](claudeAgent.ts#L780) builds `SDKUserMessage` without `uuid`. M1 + Glossary mandate `uuid = effectiveTurnId`. Breaks Turn.id ↔ SDKUserMessage.uuid invariant; Phase 6.5 fork and Phase 13 replay cannot function.
- **C2 (M11)** — [claudeAgent.ts:422-469](claudeAgent.ts#L422-L469) builds `Options` with no `model`, hardcoded `permissionMode: 'default'`. M11 says `IAgentCreateSessionConfig.config` MUST flow into `Options.*` on the first `query()` call. The provisional record `IClaudeProvisionalSession` (around line 92) **also** has no `config` field to carry the bag forward — structural gap.
- **C3 (M13)** — [claudeAgent.ts:415](claudeAgent.ts#L415) (`_materializeProvisional`) throws plain `Error('Claude proxy is not running...')`. [CONTEXT.md:2247](CONTEXT.md#L2247) says any lifecycle method that runs before `authenticate()` must throw `ProtocolError(AHP_AUTH_REQUIRED, msg, this.getProtectedResources())`.
- **C4 (M13)** — `createSession` at [claudeAgent.ts:297](claudeAgent.ts#L297) does NOT guard against unauthenticated state. CopilotAgent guards `createSession` directly at [copilotAgent.ts:382-385](../copilot/copilotAgent.ts#L382-L385). A client can call `createSession` pre-auth, get a provisional handle, then trip `_materializeProvisional`'s plain `Error` on first `sendMessage`.

### IMPORTANT

- **I1 (M8)** — [claudeMapSessionEvents.ts:54-66](claudeMapSessionEvents.ts#L54-L66) switches on `'stream_event' | 'result' | default`. The `'assistant'` envelope (final canonical) is dropped. [CONTEXT.md:875](CONTEXT.md#L875): "Partials are advisory; final `SDKAssistantMessage` is canonical." Phase 7 directly depends on this.
- **I2 (M11)** — [claudeSessionConfigKeys.ts:30](../../common/claudeSessionConfigKeys.ts#L30) and [claudeAgent.ts:681-701](claudeAgent.ts#L681-L701) declare 4-value `permissionMode` enum. [CONTEXT.md:1962](CONTEXT.md#L1962) specifies 5 (adds `'dontAsk'`). The SDK typedef at [sdk.d.ts:1560](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L1560) actually exposes 6 (adds `'auto'`). Cycle A ratifies whether `'auto'` belongs in M11.
- **I3 (M12)** — ~~[claudeAgent.ts:229](claudeAgent.ts#L229) `displayName: 'Claude'`. [CONTEXT.md:1741](CONTEXT.md#L1741) specifies `'Claude Code'`.~~ **Withdrawn during Cycle D** — re-reading [CONTEXT.md:1741](CONTEXT.md#L1741) shows the doc already specifies `'Claude'`; no drift exists. "Claude Code" is also forbidden as a user-facing brand string. Cycle D1 is therefore a no-op (no code change).
- **I4 (M12)** — [claudeAgent.ts:47-53](claudeAgent.ts#L47-L53) `isClaudeModel` has 5 predicates. [CONTEXT.md:1789-1795](CONTEXT.md#L1789-L1795) specifies 3 (vendor, supported_endpoints, model_picker_enabled). Direction unratified — narrow impl OR document additions.
- **I5 (M12)** — [claudeAgent.ts:63-71](claudeAgent.ts#L63-L71) `toAgentModelInfo` returns 5 fields. [CONTEXT.md:1802-1812](CONTEXT.md#L1802-L1812) says it must also surface `configSchema` (synth from `CCAModel.capabilities.supports.thinking`), `policyState`, `_meta` (billing multiplier).
- **I6 (M12)** — `getSessionMetadata?` not implemented on `claudeAgent.ts`. [CONTEXT.md:1880-1900](CONTEXT.md#L1880-L1900): "should also implement for parity with CopilotAgent."
- **I7 (M12)** — Sidecar at lines 211/553/639 only persists `claude.customizationDirectory`. CopilotAgent's sidecar at [copilotAgent.ts:1532-1580](../copilot/copilotAgent.ts#L1532-L1580) carries `model`. Without sidecar persistence of `model`, `listSessions`/`getSessionMetadata` cannot satisfy [CONTEXT.md:1896](CONTEXT.md#L1896).
- **I8 (M12)** — [claudeAgent.ts:655-662](claudeAgent.ts#L655-L662) `_toAgentSessionMetadata` doesn't include `model` field at all.
- **I9 (M12)** — ~~[claudeAgent.ts:632-651](claudeAgent.ts#L632-L651) `listSessions` returns SDK-only sessions when no sidecar exists. [CONTEXT.md:2124](CONTEXT.md#L2124) specifies Claude should follow Copilot's "drop sessions without sidecar" filter pattern.~~ **Withdrawn during Cycle D** — the directive itself is wrong: dropping sidecar-less sessions in Claude erases sessions created by the external Claude CLI (an explicit Phase-5 exit criterion). The SDK is the source of truth for the session list; the sidecar is an enrichment overlay. CONTEXT.md is the doc bug, not `claudeAgent.ts`. Plan correction lands in Cycle D; D5 becomes a no-op (no code change).

### Mapping doc bugs (Cycle A scope)

- **Q1** — `CONTEXT.md` references `setSessionConfigValues` 4× (lines 1995, 1998, 2008, 2195). Method does NOT exist on `IAgent` (verified by grep across `src/vs/platform/agentHost/common/`). Definitive doc bug.
- **Q2** — M11 implies `permissionMode` should be `sessionMutable: true`, but Q1's missing protocol method means there's no mechanism to perform the mutation post-creation. Self-contradiction. Resolution must accompany Q1.

### NIT

- **N1 (M9)** — `phase5-plan.md` and `phase6-plan.md` describe pre-Phase-6.5 fork model.
- **N2 (M8)** — `claudeMapSessionEvents.ts` doesn't differentiate `result.subtype` error states for telemetry. Defer to Phase 14.

### Documented exclusions (correctly stubbed; defer per roadmap)

- `abortSession` at [claudeAgent.ts:801](claudeAgent.ts#L801) throws `TODO: Phase 9` — defer.
- `changeModel` unimplemented — Phase 9.
- M9 `resume: sessionId` for fork path — Phase 6.5.
- M1 yield-boundary mutation barrier — Phase 9 (no hot-swap state shipped yet).

## 3. Cycle structure

Order: **A → B → C → E → D → F → G**.

| Cycle | Scope | Files |
|---|---|---|
| A ✓ | Doc corrections (zero code) | [CONTEXT.md](./CONTEXT.md) |
| B ✓ | Auth conformance (C3 + C4) | [claudeAgent.ts](./claudeAgent.ts) |
| C ✓ | Send-seam uuid (C1) | [claudeAgent.ts](./claudeAgent.ts) |
| E ✓ | Materialize + metadata coherence (C2 + I2 + I7 + I8) | [claudeAgent.ts](./claudeAgent.ts), [claudeSessionConfigKeys.ts](../../common/claudeSessionConfigKeys.ts) |
| D ✓ | Catalog completeness (I3 + I4 + I5 + I6 + I9) | [claudeAgent.ts](./claudeAgent.ts) |
| F ✓ | Mapper widening: 'assistant' canonical (I1) | [claudeMapSessionEvents.ts](./claudeMapSessionEvents.ts) |
| G | Stale phase-plan refresh (N1) | [phase5-plan.md](./phase5-plan.md), [phase6-plan.md](./phase6-plan.md), [roadmap.md](./roadmap.md) |

### Cycle A ✓ — Mapping doc corrections (CONTEXT.md only)

*Completed. See [Implementation Notes](#implementation-notes) for the decisions taken and the resulting CONTEXT.md changes.*

- Replace 4× `setSessionConfigValues` (lines 1995, 1998, 2008, 2195) with the correct routing. Two options to choose from:
  1. Reference `IAgentCreateSessionConfig.config` (create-time only) and remove `sessionMutable: true` from M11 (resolves Q2).
  2. Mark as `TODO: protocol surface for live config edits not yet defined` and keep `sessionMutable: true` as a forward-looking marker.
- Resolve Q2 sessionMutable contradiction.
- Ratify I4 direction (narrow impl to 3 predicates OR document the 2 extras).
- Ratify I2 SDK 6-value vs CONTEXT 5-value (does `'auto'` belong in M11?).
- Update M13 OPEN_Q ("plain Error vs ProtocolError") status to "Cycle B fixes".

**Acceptance:** `CONTEXT.md` cites only methods that exist on `IAgent`; sessionMutable invariants are internally consistent.

**Risk:** None (doc-only). Decisions in this cycle constrain Cycles D and E.

### Cycle B ✓ — Auth conformance (M13 / C3 + C4)

*Completed. See [Implementation Notes](#implementation-notes) for the resulting code changes.*

**Files:** [claudeAgent.ts](./claudeAgent.ts), [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts)

- Import `ProtocolError`, `AHP_AUTH_REQUIRED` (mirror imports already used by [copilotAgent.ts](../copilot/copilotAgent.ts)).
- **C3 fix:** replace plain `Error` in `_materializeProvisional` (line 415) with `ProtocolError(AHP_AUTH_REQUIRED, msg, this.getProtectedResources())`.
- **C4 fix:** add the same guard at the head of `createSession` (line 297). Mirror [copilotAgent.ts:382-385](../copilot/copilotAgent.ts#L382-L385).
- Update existing tests asserting old error message; add new tests for `createSession`-while-unauth.

**Acceptance:** Both `createSession` and `_materializeProvisional` throw `ProtocolError` with code `-32007` and `data.resources` populated when called pre-auth.

**Risk:** Test breakage (grep `'Claude proxy is not running'`); workbench-side handlers matching the message.

### Cycle C ✓ — Send-seam uuid (M1 / C1)

*Completed. See [Implementation Notes](#implementation-notes) for the resulting code changes.*

**Files:** [claudeAgent.ts](./claudeAgent.ts), [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts)

- Add `uuid: effectiveTurnId as branded` to the `SDKUserMessage` literal at lines 780–785. Branded type is the SDK's `` `${string}-${string}-${string}-${string}-${string}` ``.

**Acceptance:** Yielded `SDKUserMessage.uuid === effectiveTurnId`.

**Risk:** Pre-existing transcripts have SDK-random uuids; one-time discontinuity. No callers depend on this yet (Phase 6.5 deferred).

### Cycle E ✓ — Materialize + metadata coherence (M11 / C2 + I2 + I7 + I8)

*Completed. See [Implementation Notes](#implementation-notes) for the resulting code changes.*

The largest cycle. Unifying insight: provisional state, materialize-time config read, startup `Options`, and persisted session metadata all share the same data path.

**Files:** [claudeAgent.ts](./claudeAgent.ts), [../../common/claudeSessionConfigKeys.ts](../../common/claudeSessionConfigKeys.ts), [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts)

- **E1.** Add `'dontAsk'` (and per Cycle A ratification, possibly `'auto'`) to `permissionMode` enum + label/description.
- **E2.** Add structural `config?: Record<string, unknown>` field to `IClaudeProvisionalSession` (around line 92) so the `createSession` config bag actually survives until materialize. Currently dropped on the floor.
- **E3.** Persist `model` (and per Cycle A ratification, `permissionMode`/`effort`) to sidecar at create + materialize. Mirror CopilotAgent's pattern at [copilotAgent.ts:549-551](../copilot/copilotAgent.ts#L549-L551), [copilotAgent.ts:1532-1580](../copilot/copilotAgent.ts#L1532-L1580). Update `_writeSessionMetadata` and `_readSessionMetadata` accordingly.
- **E4.** At `_materializeProvisional`, **read from sidecar** for the latest config (not just from `provisional.config`). This matches CopilotAgent's pattern at [copilotAgent.ts:771](../copilot/copilotAgent.ts#L771) and handles the case where session config was edited after `createSession` but before first `sendMessage`.
- **E5.** Build `Options.model` from the resolved `CCAModel.id`. Verify SDK's `Options.model` accepts the CCAModel.id format (vs needing translation). Cite `sdk.d.ts:Options` for the type.
- **E6.** Replace hardcoded `permissionMode: 'default'` at line 449 with the resolved value.
- **E7.** Expand `_toAgentSessionMetadata` (lines 655–662) to include `model` field from sidecar (I8 fix).
- **E8** (optional, M11 invariant). Store `_currentModel`, `_currentPermissionMode`, `_currentEffort` on `ClaudeAgentSession` for "Restart preserves bijective state." Defer if `changeModel` (Phase 9) isn't shipping yet.

**Acceptance:** First turn uses requested `model` + `permissionMode` + `effort` (not SDK default). Round-trip: `createSession({ model: 'claude-sonnet-4-5' })` → first turn runs that model → `listSessions`/`getSessionMetadata` (after Cycle D) reflect it.

**Risk:**

1. First-turn behavior change is user-visible (correct, but flag in PR).
2. Sidecar schema change requires migration story — set `model: undefined` for legacy sidecars; impl tolerates undefined.
3. Must verify `CCAModel.id` ↔ SDK `Options.model` format compatibility before landing.
4. Tests on the materialize `Options` shape break.

### Cycle D ✓ — Catalog completeness (M12 / I3 + I4 + I5 + I6 + I9)

**Files:** [claudeAgent.ts](./claudeAgent.ts), [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts), [CONTEXT.md](./CONTEXT.md)

- **D1.** ~~`getDescriptor.displayName: 'Claude Code'` (was `'Claude'`).~~ **No-op.** Re-reading CONTEXT.md shows `'Claude'` is already canonical; "Claude Code" is also forbidden as a user-facing brand. I3 was a misread of the doc; no code change needed. Cycle A's audit-row revision (in this Cycle D pass) corrects the audit table.
- **D2.** No-op per Cycle A ratification — the impl's 5 predicates are canonical; M12 documents all five with rationale.
- **D3.** Expand `toAgentModelInfo` with `configSchema` (synth from `CCAModel.capabilities.supports.{adaptive_thinking,min_thinking_budget,max_thinking_budget}` — Anthropic models expose adaptive-thinking capability rather than `supportedReasoningEfforts`; mirror CopilotAgent's `_createThinkingLevelConfigSchema` shape but source the enum from the 5-value `ClaudeEffortLevel` union when the model supports adaptive thinking), `policyState` (from `CCAModelPolicy.state`), `_meta.multiplierNumeric` (from `CCAModelBilling.multiplier`).
- **D4.** Implement `getSessionMetadata?(session)` using SDK top-level `getSessionInfo(sessionId)` (sdk.d.ts:581 — verified to exist) joined with the `_readSessionMetadata` sidecar reader from Cycle E. Add a thin wrapper to `IClaudeAgentSdkService` so the SDK module stays behind the service boundary.
- **D5.** ~~Filter `listSessions` to drop sessions without sidecar, mirroring CopilotAgent's pattern.~~ **No-op.** External Claude CLI sessions have no sidecar and MUST surface (Phase-5 exit criterion); the shipped code at [claudeAgent.ts:761-797](claudeAgent.ts#L761-L797) already does the right thing. The plan's directive was a misread of conformance — Copilot can drop because every Copilot session is born inside VS Code; Claude cannot drop because external CLI sessions are first-class. CONTEXT.md correction (line ~1888 + line ~2159 table cell) lands in this cycle.

**Acceptance:** Models observable carries `configSchema` for adaptive-thinking models, `policyState`, and `_meta.multiplierNumeric`; `getSessionMetadata` returns metadata for known sessions with `model`/`customizationDirectory` populated from sidecar and `summary`/`cwd`/timestamps from SDK; `listSessions` continues to surface all SDK-known sessions (sidecar-less ones too).

*Completed. See [Implementation Notes](#implementation-notes) for the resulting code changes.*

**Risk:**

1. ~~Verify `IClaudeAgentSdkService.getSessionInfo` exists (interface inspection).~~ Verified — sdk.d.ts:581 exposes `getSessionInfo(sessionId, options?)`. Service interface needs a one-line wrapper addition.
2. ~~Verify CCAModel exposes thinking-capability data.~~ Verified — `CCAModelSupports` exposes `min_thinking_budget`/`max_thinking_budget` (types.d.ts:208-214). No `supportedReasoningEfforts` field on Anthropic CCAModel rows; D3 must synth the 5-value `ClaudeEffortLevel` enum directly when the model supports adaptive thinking.
3. Tests on the model filter shape may break (D2). — *No code change in D2; ignore.*

### Cycle F ✓ — Mapper widening: 'assistant' canonical (M8 / I1)

*Completed. See [Implementation Notes](#implementation-notes) for the resulting code changes.*

**Files:** [claudeMapSessionEvents.ts](./claudeMapSessionEvents.ts), [claudeAgentSession.ts](./claudeAgentSession.ts) (state shape only), [../../test/node/claudeMapSessionEvents.test.ts](../../test/node/claudeMapSessionEvents.test.ts)

- Add `case 'assistant'` to `mapSDKMessageToAgentSignals` (line 54–66 switch).
- Implement final-canonical reconciliation: emit final response parts that override partial-accumulated content. Extend `IClaudeMapperState` to track per-block content if reconciliation requires it.
- Verify reducer ordering: `SessionResponsePart` MUST precede first delta for that part id (existing invariant).
- **Scope discipline:** limit to verified live-envelope drift; do NOT pre-commit to replay-style reconciliation since replay is still stubbed at [claudeAgent.ts:598-605](claudeAgent.ts#L598-L605).

**Acceptance:** synthetic `SDKAssistantMessage` produces canonical response parts; deltas-followed-by-final test passes.

**Risk:** UI render glitches if reconciliation order is wrong. Phase 6's `canUseTool: deny` keeps `'assistant'` messages text-only in practice — safer landing zone than Phase 7. Phase 7 directly depends on this fix.

### Cycle G ✓ — Stale phase-plan + roadmap refresh (NIT, doc-only)

**Files:** [phase5-plan.md](./phase5-plan.md), [phase6-plan.md](./phase6-plan.md), [roadmap.md](./roadmap.md)

Drift surface verified by a 3-reviewer council pass (Councillor-GPT / Opus / Gemini) on roadmap.md vs CONTEXT.md M1–M13. All three converged tightly on the same findings. Synthesized findings live at `/memories/session/review.md`; this cycle is the place they land.

#### G1 — Phase-plan stale fork narrative (original Cycle G scope)

- Replace lazy-fork-time-lookup language in [phase5-plan.md](./phase5-plan.md) and [phase6-plan.md](./phase6-plan.md) with persisted-mapping language per the Phase 6.5 contract-based approach (already in [roadmap.md](./roadmap.md)).

#### G2 — Roadmap drift fixes (added from council review)

Each item below is a confirmed contradiction or staleness in [roadmap.md](./roadmap.md) relative to CONTEXT.md's locked M-mapping. Severity reflects implementation risk if a future phase consumes the roadmap as written.

| # | Phase | roadmap.md says | CONTEXT.md says | Fix in roadmap.md | Severity |
|---|---|---|---|---|---|
| G2.1 | 9 steering | `Query.streamInput()` for mid-turn injection ([roadmap.md:687](./roadmap.md#L687)) | M10: zero callers of `streamInput` in reference; primitive is yielding `SDKUserMessage` with `priority: 'now'` into the existing prompt iterable ([CONTEXT.md:1180-1257](./CONTEXT.md#L1180-L1257)) | Replace `streamInput` language with prompt-iterable + `priority: 'now'` | HIGH |
| G2.2 | 9 changeModel | `Query.setModel()` only ([roadmap.md:689](./roadmap.md#L689)) | M11: bundle-atomic — `ModelSelection.id` + `config.effort` ⇒ `setModel` + `applyFlagSettings({ effortLevel })` with `'max' → 'xhigh'` clamp ([CONTEXT.md:1614-1665](./CONTEXT.md#L1614-L1665)) | Add effort fan-out, document the clamp | MED-HIGH |
| G2.3 | 11 customizations | `_pendingRestart` (restart-on-toggle) ([roadmap.md:735-737](./roadmap.md#L735-L737)) | M11: `reloadPlugins` is **defer-and-coalesce**, not restart ([CONTEXT.md:487](./CONTEXT.md#L487), [710](./CONTEXT.md#L710), [1544](./CONTEXT.md#L1544), [1585](./CONTEXT.md#L1585)) | Reclassify as defer-and-coalesce with `_pendingPluginReload` flag drained at next yield boundary | HIGH |
| G2.4 | 5 lifecycle | Allocate session + persist metadata immediately ([roadmap.md:407-424](./roadmap.md#L407-L424)) | M9: `IAgentCreateSessionResult.provisional`, `onDidMaterializeSession`, deferred `sessionAdded`. Provisional sessions own no SDK resources, no sidecar until materialization ([CONTEXT.md:920-1000](./CONTEXT.md#L920-L1000)) | Add provisional/materialize vocabulary; reference `onDidMaterializeSession` event; note no on-disk sidecar before materialization | MEDIUM |
| G2.5 | 5 listSessions | Generic SDK → IAgentSessionMetadata mapping ([roadmap.md:430](./roadmap.md#L430)) | M12: Claude does NOT drop sessions without sidecar (Copilot does); SHOULD implement `getSessionMetadata?` ([CONTEXT.md:1869-1878](./CONTEXT.md#L1869-L1878), [1904-1915](./CONTEXT.md#L1904-L1915), [2189-2212](./CONTEXT.md#L2189-L2212)) | Spell out the sidecar policy (best-effort enrichment, NOT filter), name `getSessionMetadata?` as in-scope for Phase 5 | MEDIUM |
| G2.6 | 7 tools | Generic permission/user-input wiring ([roadmap.md:632-651](./roadmap.md#L632-L651)) | M7: per-session `Map<tool_use_id, turnId>` cross-message attribution ([CONTEXT.md:503-512](./CONTEXT.md#L503-L512), [880](./CONTEXT.md#L880)). M2/M3: dual routing in `canUseTool` — arbitrary tools → `respondToPermissionRequest`, `INTERACTIVE_CLAUDE_TOOLS` (`'AskUserQuestion' \| 'ExitPlanMode'`) → `respondToUserInputRequest`; plus `Options.onElicitation` for MCP user input ([CONTEXT.md:597-612](./CONTEXT.md#L597-L612)) | Add the attribution map and the dual-routing requirement to Phase 7 scope | HIGH |
| G2.7 | 10 MCP | Per-query MCP recreation + yield-restart on tool diff ([roadmap.md:716-721](./roadmap.md#L716-L721)) | M11: `setMcpServers` is bijective (cheap runtime via `SDKControlMcpSetServersRequest`) ([CONTEXT.md:1488-1548](./CONTEXT.md#L1488-L1548)) | Distinguish in-process tool path (`createSdkMcpServer`) from external `setMcpServers` (runtime-mutable); reserve restart for the in-process diff case only | MEDIUM |
| G2.8 | 9–11 | Per-write paths described without taxonomy | M11 hot-swap / defer-and-coalesce / restart-required taxonomy ([CONTEXT.md:1576-1611](./CONTEXT.md#L1576-L1611)) | Adopt the M11 three-bucket taxonomy as the organizing framework for Phase 9/10/11 config-write paragraphs | MEDIUM (systemic) |
| G2.9 | 5/9/12 | `setPermissionMode` "internal SDK concern, not a protocol method" ([roadmap.md:691-694](./roadmap.md#L691-L694)) | M12: `permissionMode` is `sessionMutable: true` (M11 hot-swap, bijective) but the generic live-edit setter is TBD ([CONTEXT.md:1920-1935](./CONTEXT.md#L1920-L1935), [1958-1984](./CONTEXT.md#L1958-L1984)) | Acknowledge the protocol-evolution gap; note that until the generic setter lands, schema-mutable `permissionMode` round-trips as a `createSession` restart | LOW-MEDIUM |
| G2.10 | 6.5 fork | Correctly persisted-mapping + `Options.resume` ([roadmap.md:554-559](./roadmap.md#L554-L559)) | M9: also fires `onDidMaterializeSession` immediately because `forkSession` writes the session file synchronously ([CONTEXT.md:942-947](./CONTEXT.md#L942-L947)) | Add a one-line note that the fork path fires the materialize event eagerly (sketchy not wrong; documentation gap) | LOW |

#### G3 — Compatible / no-change (council confirmed alignment)

- Phase 13 "do not implement `truncateSession`" — aligned with M10.
- Phase 6 `abortSession` mechanism (`AbortController.abort()`, not `Query.interrupt()`) — aligned with M4.
- Phase 6.5 fork core flow — turn-id mapping + `Options.resume` aligned with M9 (apart from G2.10 documentation gap).

**Acceptance:** roadmap.md and the two phase-plans agree with the M1–M13 portraits in CONTEXT.md. The 9 council-confirmed drift items above are resolved by edits on the roadmap side (none require CONTEXT.md changes; CONTEXT is already correct).

**Risk:** None — doc-only.

#### Implementation notes (Cycle G — what landed)

Applied as in-place edits in this PR; no code changes.

- **G1 (phase plans).** Rather than rewriting the bodies of two completed-phase handoff plans, added a *Status note (post-Phase 6.5 design — Phase 6.1 Cycle G)* block at the top of [phase5-plan.md](./phase5-plan.md) and [phase6-plan.md](./phase6-plan.md). The phase5-plan note covers two drifts: (a) the lazy-fork-time-lookup language (`getNextTurnEventId`, JSONL walks, `sdk.getSessionMessages`) is marked historical and superseded by Phase 6.5's persisted-mapping contract; (b) the §B5 4-value `permissionMode` enum example is marked superseded by the 6-value canonical expanded in Cycle E1. The phase6-plan note covers the same fork-language drift in §1's `createSession({ fork })` description. Body text is preserved as historical record; readers are pointed at [roadmap.md](./roadmap.md), [CONTEXT.md](./CONTEXT.md), and [`claudeSessionConfigKeys.ts`](../../common/claudeSessionConfigKeys.ts) for current contracts.
- **G2.1–G2.10 (roadmap.md).** All 10 drift items resolved by in-place edits to the relevant phase sections:
  - Phase 5 lifecycle rewritten around `IAgentCreateSessionResult.provisional` / `onDidMaterializeSession` (G2.4); `listSessions` sidecar policy spelled out as best-effort enrichment, `getSessionMetadata?` named in scope (G2.5); `resolveSessionConfig` notes the M12 generic-live-edit-setter gap (G2.9 partial).
  - Phase 6.5 "Architectural model" sub-section gained a one-line note that fork fires `onDidMaterializeSession` eagerly because `forkSession` writes the file synchronously (G2.10).
  - Phase 7 gained the `Map<tool_use_id, turnId>` attribution model and the `INTERACTIVE_CLAUDE_TOOLS` dual-routing branch in `canUseTool` (G2.6).
  - Phase 9 rewritten with M11 hot-swap / defer-and-coalesce / restart-required taxonomy as opening framing (G2.8 partial); steering replaced `Query.streamInput` with prompt-iterable `priority: 'now'` yield + `IAgentSteeringConsumedSignal` semantics (G2.1); `changeModel` made bundle-atomic with `setModel` + `applyFlagSettings({ effortLevel })` fan-out and the `'max' → 'xhigh'` clamp documented (G2.2); `setPermissionMode` paragraph notes the protocol-surface gap (G2.9).
  - Phase 10 reorganized to distinguish in-process tools (`createSdkMcpServer` + `Options.mcpServers`, restart-required) from external MCP servers (`Query.setMcpServers`, hot-swap) (G2.7).
  - Phase 11 reclassified `setCustomizationEnabled` from `_pendingRestart` to defer-and-coalesce via `_pendingPluginReload` + `Query.reloadPlugins`, with the tool-set-divergence case kept as the narrow restart-required fallback (G2.3).
- **G3.** No edits required; council confirmed alignment.

All drift items are resolved by edits on the roadmap / phase-plan side. CONTEXT.md was treated as the truth oracle and is unchanged.

## 4. Files to modify (consolidated)

| File | Cycles | What |
|---|---|---|
| [CONTEXT.md](./CONTEXT.md) | A | Mapping doc fixes; status updates |
| [claudeAgent.ts](./claudeAgent.ts) | B, C, D, E | Auth (createSession + materialize); uuid; toAgentModelInfo expansion; getSessionMetadata; permissionMode 5/6-value; sidecar with model; Options.model + permissionMode seeding; provisional.config; _toAgentSessionMetadata.model. **D1 (displayName) and D5 (listSessions filter) reversed during Cycle D — no code change for those steps.** |
| [claudeAgentSession.ts](./claudeAgentSession.ts) | F (state), E (optional E8) | Mapper state for reconciliation; bijective state for restart preservation |
| [claudeMapSessionEvents.ts](./claudeMapSessionEvents.ts) | F | `'assistant'` case + reconciliation |
| [../../common/claudeSessionConfigKeys.ts](../../common/claudeSessionConfigKeys.ts) | E1 | permissionMode enum expansion |
| [phase5-plan.md](./phase5-plan.md), [phase6-plan.md](./phase6-plan.md), [roadmap.md](./roadmap.md) | G | Stale fork descriptions |
| [../../test/node/claudeAgent.test.ts](../../test/node/claudeAgent.test.ts), [../../test/node/claudeMapSessionEvents.test.ts](../../test/node/claudeMapSessionEvents.test.ts) | All | Test coverage per cycle |

## 5. Consensus risks

1. **Test breakage at auth boundary** — grep `'Claude proxy is not running'`; coordinate with workbench if any consumer matches the message.
2. **Transcript discontinuity at uuid fix** — sessions written before Cycle C have SDK-random uuids; accept one-time discontinuity.
3. **First-turn behavior change at startup-config seeding** — user-visible but correct; flag in PR description.
4. **Sidecar schema change** — must tolerate legacy sidecars without `model` field (default to undefined).
5. **CCAModel ↔ Options.model format compatibility** — verify before Cycle E5 landing; fallback is a model-id-mapping helper.
6. ~~**listSessions behavior change at D5** — sessions from other hosts disappear from the list. Document in PR.~~ **Withdrawn** — D5 reversed during Cycle D; no behavior change ships.
7. **`IClaudeAgentSdkService.getSessionInfo` interface** — Cycle D4 may need a one-line interface addition.
8. **Mapper reconciliation correctness** — Cycle F could double-emit text if not done carefully; test with synthetic messages.

## 6. Verification

**Per cycle**

- Unit tests for the cycle's affected files.
- `npm run compile-check-ts-native`.
- `npm run valid-layers-check`.

**After all cycles — live smoke**

1. Authenticate.
2. `createSession({ config: { model: <non-default>, permissionMode: 'plan' } })`.
3. First `sendMessage`.
4. Verify response renders.
5. Verify SDK Turn `uuid` matches protocol `turnId` in transcript.
6. Verify `listSessions` and `getSessionMetadata` return the chosen model.

## 7. Provenance

This plan was synthesized from a 3-councillor council-plan run (Opus, GPT, Gemini) with a debate pass. The fan-out produced three independent drift audits; the synthesis preserved findings with at least 2/3 agreement; the debate pass added 4 items the synthesis missed (C4, I7, I8, I9) and promoted Q1 from open question to definitive doc bug. The order `A → B → C → E → D → F → G` reflects the post-debate consensus.

## Implementation Notes

### Cycle A — doc corrections (completed)

**Decisions taken**

| Question | Choice | Rationale |
|---|---|---|
| Q1 / Q2 — how to handle 4× `setSessionConfigValues` references | **Option 2 (Forward-looking)** — keep `sessionMutable: true` on `permissionMode`; keep the same-schema-serves-both framing (`resolveSessionConfig` reads at both creation and post-creation, `IAgentCreateSessionConfig.config` writes at creation); mark the generic post-creation setter (working name: `setSessionConfigValues`) as a TBD protocol surface; require any `sessionMutable: true` property without a covering `changeModel`/`setCustomizationEnabled` path to round-trip via `createSession` until the generic setter lands. | The schema's mutability flag is the read-side contract — `permissionMode` has a bijective SDK setter (`Query.setPermissionMode`), so it's correctly marked. The doc bug was citing a method that doesn't exist; the doc fix is to mark it TBD without erasing the design intent. |
| I4 — `isClaudeModel` predicate count | **Option A** — document all 5 predicates in M12 with rationale. | Impl extras (`tool_calls`, `tryParseClaudeModelId`) have JSDoc-documented reasons (reference-extension parity, exclude synthetic ids like `'auto'`). Narrowing the impl would be a regression. No code change needed in Cycle D2. |
| I2 — does `'auto'` belong in M11 enum? | **Option Z** — include `'auto'`; enum is 6 values matching the SDK's `PermissionMode` type. | Surfacing the SDK's full enum on the IAgent surface lets the client UI reach the model-classifier-driven approval mode without a future schema bump. Cycle E1 expands the enum from 4 → 6. |

**Files changed**

- [CONTEXT.md](./CONTEXT.md) — 5 edits applied via `multi_replace_string_in_file`, then 4 of them revised after reviewer pushback on the Q1/Q2 framing:
  1. M12 `isClaudeModel` filter prose (around line 1786) — `three predicates AND'd together` → 5 predicates with per-predicate rationale, citing impl JSDoc and reference-extension parity. *(Final.)*
  2. M12 `permissionMode` bullet in `resolveSessionConfig` properties list (around line 1975) — documents the full 6-value SDK enum (including `'auto'`) and re-affirms `sessionMutable: true` (M11 hot-swap; `Query.setPermissionMode()` is bijective). *(Revised after pushback.)*
  3. M12 `Same schema serves creation *and* post-creation display` subsection (around line 1996) — `resolveSessionConfig` is the read surface for both phases; `IAgentCreateSessionConfig.config` is the creation-time write bag; the generic post-creation setter is TBD; live edits to `sessionMutable: true` properties not covered by `changeModel`/`setCustomizationEnabled` round-trip via `createSession` until the generic setter lands. *(Revised after pushback.)*
  4. M12 `resolveSessionConfig is the schema source for runtime mutations too` invariant (around line 2192) — schema and implementation must agree (matching M11 hot-swap path required for any `sessionMutable: true` property); the future generic live-edit setter is the protocol conduit; restart-via-`createSession` is the interim fallback. *(Revised after pushback.)*
  5. M13 `AHP_AUTH_REQUIRED throw` row (around line 2247) — `— see open mapping question below` → `— to be corrected in Phase 6.1 Cycle B (see [phase6.1-plan.md](phase6.1-plan.md))`. Eliminates the dangling reference. *(Final.)*
  6. M12 `sessionConfigCompletions` prose (around line 2076) — `static five-value enum` → `static six-value enum` to match the I2 ratification. *(Added in revision pass.)*

**Verification**

- `grep setSessionConfigValues CONTEXT.md` — 4 matches remaining, all correctly framed as the **TBD generic post-creation setter** per Option 2. No prescriptive citations of a non-existent shipped method.
- `grep "five-value\|five values" CONTEXT.md` — 0 matches. All `permissionMode` enum mentions reflect the 6-value ratification.
- `grep "see open mapping question below" CONTEXT.md` — 0 matches. Dangling reference resolved.

**Deviations from plan**

- The first pass of edits picked Option 1 (Strict). Reviewer pushed back on Q1's framing: `IAgentCreateSessionConfig.config` is the creation-time write, `resolveSessionConfig` is the read surface for both creation and post-creation — not "creation-only." Three of the five edits were re-done to land on Option 2 (Forward-looking) instead. Cycle A's net behaviour is therefore: doc fixes the broken `setSessionConfigValues` citations by labelling them TBD, preserves the design intent of `sessionMutable: true` on `permissionMode`, and surfaces `'auto'` per I2.

**Notes for downstream cycles**

- **Cycle E1** must add **two** values to the `permissionMode` enum (`'dontAsk'` and `'auto'`), not one. Final enum is 6 values matching SDK `PermissionMode` type.
- **Cycle D2** is now a no-op for `isClaudeModel` — the impl's 5 predicates are ratified as canonical. Still need D1 (displayName), D3 (toAgentModelInfo), D4 (getSessionMetadata), D5 (listSessions filter).
- **Cycle E** must mark `permissionMode` as `sessionMutable: true` in the `resolveSessionConfig` schema. Until the generic live-edit setter lands as a protocol surface, the implementation may either (a) implement `permissionMode` edits via a Claude-specific path, or (b) leave the live edit unsupported with the round-trip-via-`createSession` fallback documented for clients. Either is acceptable for Phase 6.1; designing the generic setter is out of scope.

### Cycle B — auth conformance C3 + C4 (completed)

**Code changes**

- [claudeAgent.ts](./claudeAgent.ts):
  - Added `import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';`.
  - Introduced shared private helper `_ensureAuthenticated(): IClaudeProxyHandle` — returns the live `_proxyHandle` or throws `ProtocolError(AHP_AUTH_REQUIRED, 'Authentication is required to use Claude', this.getProtectedResources())`.
  - **C4**: `createSession` calls `this._ensureAuthenticated()` at the head (before fork-branch), so a pre-auth `createSession` is rejected as `AHP_AUTH_REQUIRED` with the protected-resources hint instead of silently minting a provisional record.
  - **C3**: `_materializeProvisional` replaces the plain `Error('Claude proxy is not running...')` with `const proxyHandle = this._ensureAuthenticated();`. The materialize path is now defense-in-depth (C4 makes the bare-public-API path unreachable), but stays in place for completeness and to keep both call sites symmetrical.

**Tests**

- New test (passes): `'createSession before authenticate throws ProtocolError(AHP_AUTH_REQUIRED) with protected resources'`. Verifies `code === AHP_AUTH_REQUIRED`, `message === 'Authentication is required to use Claude'`, and `data` is the `getProtectedResources()` array.
- Six pre-existing `createSession`-using tests updated to call `await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok')` first (lines 922, 958, 978, 1851, 1878, 2074 in `claudeAgent.test.ts`). The fork-rejection test still asserts `/Phase 6\.5/` because auth now succeeds before the fork branch is reached.
- Test count: **46 pass / 0 fail** (was 41 → +1 new + 6 updated +0 broken). Integration test (`claudeAgent.integrationTest.ts`) was already authenticating first; no change required.

**Verification**

- `grep "Claude proxy is not running"` across the workspace — 0 hits in non-plan code, confirming no workbench-side handler depends on the old error message.
- `get_errors` on both touched files — 0 errors.

**Deviations from plan**

- Plan called for guards inline at each call site. Implementation extracted them into a shared `_ensureAuthenticated()` helper to (a) keep both error throws byte-identical and (b) return the handle so `_materializeProvisional` can keep its narrowed `IClaudeProxyHandle` type without a non-null assertion. Net behaviour identical; readability improved.

**Notes for downstream cycles**

- **Cycle E** (and any future caller of `_proxyHandle` outside `authenticate`/`shutdown`) should funnel through `_ensureAuthenticated()` to inherit the auth-conformance error contract for free.
- **Cycle G2** (workbench surfacing) — verify the workbench's `AgentService` already maps `ProtocolError(AHP_AUTH_REQUIRED, …, [resources])` to its sign-in flow (CopilotAgent has the matching shape at `copilotAgent.ts:384`); no Claude-specific surfacing work expected.

### Cycle C — Send-seam uuid C1 (completed)

**Code changes**

- [claudeAgent.ts](./claudeAgent.ts) at the `sendMessage` SDK-prompt-literal site (lines ~787–795 post-edit): added `uuid: effectiveTurnId as \`${string}-${string}-${string}-${string}-${string}\`` to the `SDKUserMessage` literal. The brand cast at the boundary mirrors the reference extension at [`claudeCodeAgent.ts:585`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts#L585) and the doc snippet at [CONTEXT.md:1272](./CONTEXT.md#L1272). One-line JSDoc cites the M1 / Glossary invariant (`Turn.id ↔ SDKUserMessage.uuid`) so future readers don't unwind the brand cast as cosmetic.

**Tests**

- New test (passes): `'sendMessage tags SDKUserMessage.uuid with the effective turn id (M1 / Turn.id ↔ uuid invariant)'`. Stages a single turn with explicit `turnId: 'turn-explicit'`, drains the prompt iterable, asserts `drained[0].uuid === 'turn-explicit'`. Test-suite count: **47 pass / 0 fail** (was 46 → +1 new).
- **Scope decision:** the originally drafted version of the test asserted both the explicit-turnId path AND the `turnId ?? generateUuid()` fallback path across two turns. The two-turn shape requires `queryAdvance` gating to keep the SDK transcript aligned per turn (mirroring the test at line 1100), which expanded the test outside Cycle C's scope. Reduced to a single-turn assertion — the fallback path is structurally trivial (`turnId ?? generateUuid()`, one line) and already exercised by every other `sendMessage` test in the suite that omits the `turnId` argument.

**Verification**

- TDD red-green-refactor: red test failed with `uuid: undefined` (matching the C1 finding); green after one-line fix.
- `get_errors` on both touched files — 0 errors.

**Deviations from plan**

- None. Plan called for `as branded` with the SDK's `\`${string}-${string}-${string}-${string}-${string}\`` shape; that's exactly what landed.

**Notes for downstream cycles**

- **Phase 6.5 fork** (deferred) can now treat `SDKUserMessage.uuid` as authoritative for turn-id lookup; the persisted-mapping-table contract from `roadmap.md` populates from this same value.
- **Phase 13 replay** (deferred) similarly relies on this invariant — `SDKUserMessageReplay.uuid` (whose type makes `uuid` required, not optional) will round-trip through the same id.

### Cycle E — Materialize + metadata coherence C2 + I2 + I7 + I8 (completed)

**Code changes**

- [../../common/claudeSessionConfigKeys.ts](../../common/claudeSessionConfigKeys.ts) — `ClaudePermissionMode` union widened from 4 to 6 values (`'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`); JSDoc updated to cite `sdk.d.ts:1560` and the I2 ratification.
- [claudeAgent.ts](./claudeAgent.ts):
  - **E1** — `resolveSessionConfig` `permissionMode` schema gains `'dontAsk'` + `'auto'` enum values, with matching localized `enumLabels` + `enumDescriptions`.
  - **E2** — `IClaudeProvisionalSession` extended with `readonly model: ModelSelection | undefined` and `readonly config: Record<string, unknown> | undefined`. `createSession` now seeds both fields from the inbound `IAgentCreateSessionConfig` instead of dropping them.
  - **E5/E6** — materialize site builds `Options.model = provisional.model?.id` and `Options.permissionMode = this._resolvePermissionMode(provisional.config)` (was hardcoded `'default'` with no `model`). The provisional record is the source of truth for these values at materialize — see deviations below for why E4's sidecar-priority read was reverted.
  - **E3** — refactored `_writeCustomizationDirectory(session, workingDirectory)` → `_writeSessionMetadata(session, { customizationDirectory?, model?, permissionMode? })`. Single `openDatabase` ref, `Promise.all` batched writes, only-write-on-defined; mirrors CopilotAgent's `_storeSessionMetadata` shape (`copilotAgent.ts:1532`).
  - **E3 read-side** — added `_readSessionMetadata(session): Promise<{ customizationDirectory?, model?, permissionMode? }>` mirroring `copilotAgent.ts:1559`. Uses `tryOpenDatabase` so missing DB is not an error.
  - **E3 helpers** — added `_serializeModelSelection` (JSON.stringify) and `_parseModelSelection` (object-shape narrowing with legacy plain-string fallback) mirroring `copilotAgent.ts:492-522`. Added `_narrowPermissionMode` for the read-side type guard. Added `_resolvePermissionMode(config)` for the create-time bag → SDK enum coercion (used at materialize to resolve the `provisional.config` bag).
  - **E4** — *not implemented*. See deviations below.
  - **E7** — `_toAgentSessionMetadata` overlay arg widened to `{ customizationDirectory?, model? }` and emits `model` on `IAgentSessionMetadata`. `listSessions` overlay reader replaced with a single `_readSessionMetadata` call; the per-key `tryOpenDatabase` + `getMetadata` block is gone (deduplicated through the new helper).
  - Added private `_META_MODEL = 'claude.model'` and `_META_PERMISSION_MODE = 'claude.permissionMode'` constants alongside the existing `_META_CUSTOMIZATION_DIRECTORY`.

**Tests**

Two new tests added to [`claudeAgent.test.ts`](../../test/node/claudeAgent.test.ts), one pre-existing test updated:

- Updated: `'resolveSessionConfig returns Claude-native permissionMode + reused Permissions schema'` (line ~2208) — `permissionModeEnum` snapshot expanded from 4 → 6 values; JSDoc updated to cite `sdk.d.ts:1560` and the Cycle A ratification.
- New (E2/E5/E6): `'createSession config.model + config.config.permissionMode flow into Options on first send (M11 / Phase 6.1 C2)'` — round-trip test asserting `Options.model === created-time model.id` and `Options.permissionMode === created-time permissionMode` after the first `sendMessage`.
- New (E3/E7): `'createSession.model round-trips through the per-session DB to listSessions[].model (Phase 6.1 I8 + I7 + C2)'` — full round-trip: `createSession({ model })` → `sendMessage` materializes (writes sidecar via `_writeSessionMetadata`) → `sdk.sessionList = [...]` → `listSessions` surfaces `model` on the entry's `IAgentSessionMetadata`.

**Effort addendum** — `Options.effort` wired separately after the model + permissionMode work landed:

- New file [../../common/claudeModelConfig.ts](../../common/claudeModelConfig.ts):
  - `CLAUDE_THINKING_LEVEL_KEY = 'thinkingLevel'` — the `ModelSelection.config` sub-key carrying the picker's effort pick. Mirrors CopilotAgent's `ThinkingLevelConfigKey` (`copilotAgent.ts:83`) so a single picker contract spans both providers.
  - `ClaudeEffortLevel` type — hand-rolled 5-value union (`'low' | 'medium' | 'high' | 'xhigh' | 'max'`) structurally identical to the SDK's `EffortLevel` (sdk.d.ts:443) but defined in `common/` so the layer stays SDK-free.
  - `resolveClaudeEffort(model)` — pure narrowing function mirroring CopilotAgent's `_getReasoningEffort` (`copilotAgent.ts:487`). Pulled out of `ClaudeAgent` so the narrow can be exercised directly without standing up the full agent fixture.
- [claudeAgent.ts](./claudeAgent.ts) — materialize site sets `Options.effort = resolveClaudeEffort(provisional.model)`. No private `_resolveEffort` method, no `_CLAUDE_THINKING_LEVEL_KEY` constant on the class, no `EffortLevel` SDK import — the structural assignment from `ClaudeEffortLevel` to `Options.effort` is checked by TS without a cast.
- **Source of truth**: effort lives inside `ModelSelection.config.thinkingLevel` (a model-config sub-key), **not** as a top-level Claude session-config key. This mirrors CopilotAgent exactly and means the effort value piggybacks on the existing model serialize/parse + sidecar round-trip — no new `_META_EFFORT` constant, no new `_writeSessionMetadata` field, no new `resolveSessionConfig` schema property required.
- **Enum width at Options seam vs hot-swap seam**: `Options.effort` (sdk.d.ts:1214) accepts the full 5-value `EffortLevel` union. The live hot-swap path `applyFlagSettings({ effortLevel })` (sdk.d.ts:4292) only accepts a 4-value subset that omits `'max'`; that clamp lives in Phase 9, not here.
- New tests:
  - [claudeModelConfig.test.ts](../../test/common/claudeModelConfig.test.ts) — focused unit tests on the extracted `resolveClaudeEffort` helper. One test covers all 5 accepted strings → SDK enum values; one covers the 5 degrade-to-`undefined` failure modes (no model, no config bag, empty config bag, unrelated config key, unrecognized value).
  - [claudeAgent.test.ts](../../test/node/claudeAgent.test.ts): `'createSession model.config.thinkingLevel flows into Options.effort on first send (M11 / Phase 6.1 C2)'` — full round-trip wiring assertion that `Options.effort === 'high'` after `createSession({ model: { id, config: { thinkingLevel: 'high' } } })` + `sendMessage`.

Test-suite count: **52 pass / 0 fail** (was 47 → +5 new + 1 updated).

**Verification**

- TDD red-green per micro-step (E1 → E2/E5/E6 → E3/E7 → E4); each step's RED-flip was proven by a failing test, then GREEN-flipped by the minimal impl change. Full-suite re-run after each step confirmed no other tests broke.
- `get_errors` on both modified files at each step — 0 errors.

**Deviations from plan**

- Plan listed E1 → E7 as one cycle; impl decomposed into 4 micro-steps (E1; E2/E5/E6; E3/E7; E4) for cleaner red-green cycles. Net behaviour identical except for E4 (see next bullet).
- **E4 (sidecar-priority read at materialize) reverted after a subagent investigation of CopilotAgent.** The plan called for `_materializeProvisional` to read the sidecar via `_readSessionMetadata` and prefer those values over `provisional.*`, citing `copilotAgent.ts:771` as the matching pattern. Investigation showed that line is the *provisional initialization site*, not a sidecar read — CopilotAgent's actual materialize-time pattern (`copilotAgent.ts:777-783`) reads `provisional.model` directly and reads the *live* session config via `IAgentConfigurationService.getSessionConfigValues(sessionUri)`, not from the per-session DB. The DB sidecar in CopilotAgent is for durability across restarts (`listSessions`, `_resumeSession`), not as the materialize-time source of truth. In Phase 6.1, ClaudeAgent has no `changeModel` (deferred to Phase 9 per E8) and no `IAgentConfigurationService` integration (deferred to Phase 7), so there is **no mutation channel** between `createSession` and the first `sendMessage` that could write to the sidecar; an "E4 sidecar wins" branch would be dead code at this phase and would diverge from CopilotAgent's pattern. **Resolution:** materialize uses `provisional.model?.id` and `_resolvePermissionMode(provisional.config)` directly; sidecar persistence (E3) and `_readSessionMetadata` are kept because `listSessions` (E7) consumes the latter. The mid-stream live re-read lands in Phase 7 (config) and Phase 9 (`changeModel`), each through its own production-correct channel.
- Plan called the write helper `_writeSessionMetadata` (singular) and the read helper `_readSessionMetadata`. CopilotAgent's reference uses `_storeSessionMetadata` for the write. We chose `_writeSessionMetadata` for symmetry with the read helper and the plan's wording.
- Plan E5 risk-flagged `CCAModel.id ↔ Options.model` format compatibility ("verify before landing; fallback is a model-id-mapping helper"). Verified: SDK `Options.model` is `string` (sdk.d.ts:1289), and CCAModel.id is also a flat string identifier — no translation needed. The brand cast at the persist boundary (`_serializeModelSelection`) is JSON-only, not format-translation.
- Plan E8 (store `_currentModel`/`_currentPermissionMode`/`_currentEffort` on `ClaudeAgentSession` for "Restart preserves bijective state") deferred to Phase 9 (`changeModel`) per the plan's own "(optional, M11 invariant). … Defer if `changeModel` (Phase 9) isn't shipping yet."
- The plan's Cycle A note "**Cycle E** must mark `permissionMode` as `sessionMutable: true`" — `sessionMutable: true` was already present on `permissionMode` in the schema before this cycle (verified during E1). No additional change needed.

**Notes for downstream cycles**

- **Cycle D's `getSessionMetadata?(session)`** consumes `_readSessionMetadata` directly — the plan's D4 ("joined with the sidecar reader from Cycle E") references this helper. Cycle D should compose `_readSessionMetadata(session)` with `IClaudeAgentSdkService.getSessionInfo(id)` and pipe the result through `_toAgentSessionMetadata`.
- **Phase 7 live-config re-read** is the correct channel for mid-stream `permissionMode` (and any other mutable session-config) edits. Mirror CopilotAgent's `_materializeProvisional` pattern (`copilotAgent.ts:777-783`): inject `IAgentConfigurationService` and call `getSessionConfigValues(sessionUri.toString())` at materialize. The sidecar persist on materialize stays (so post-restart cold reads via `listSessions`/`getSessionMetadata` still work); the live read **replaces** the materialize-time read of `provisional.config`, it does **not** stack with a sidecar read.
- **Phase 9 `changeModel`** is the correct channel for live model edits. Mirror CopilotAgent's `changeModel` (`copilotAgent.ts:1212-1224`): mutate `provisional.model` while still provisional, RPC the live SDK after materialize, and **then** persist via `_writeSessionMetadata` so the sidecar reflects the new state for the next cold read.
- **Migration story (E3 risk #2)**: legacy sidecars written before Cycle E only have `claude.customizationDirectory`. `_readSessionMetadata` returns `model: undefined` and `permissionMode: undefined` for those rows — `listSessions` surfaces `model: undefined` on those entries (acceptable; the SDK row still appears) and the `_parseModelSelection` legacy-plain-string branch covers any older schema attempts.
- **Cycle G (stale phase-plan refresh)**: must update `phase5-plan.md`/`phase6-plan.md` references to the 4-value `permissionMode` enum to the 6-value canonical.

### Cycle D — Catalog completeness M12 / I3 + I4 + I5 + I6 + I9 (completed)

**Code changes**

- [../../common/claudeModelConfig.ts](../../common/claudeModelConfig.ts):
  - **D3 helper** — added `createClaudeThinkingLevelSchema(supportedEfforts: readonly ClaudeEffortLevel[])` returning a `ConfigSchema` whose `thinkingLevel.enum` is sourced from each model's own `reasoning_effort` list (different Claude models support different subsets, e.g. `['low','medium','high']`, `['high']`, `[]`). Mirror of CopilotAgent's `_createThinkingLevelConfigSchema(supportedReasoningEfforts, defaultReasoningEffort)` at copilotAgent.ts:457 — same per-model variation, same matching-`enumLabels` shape. Returns `undefined` for an empty list so the picker renders no thinkingLevel control for that model. Also exports `isClaudeEffortLevel(value): value is ClaudeEffortLevel` for callers that need to narrow runtime strings into the SDK's `EffortLevel` shape; `claudeAgent.ts` filters the per-model `reasoning_effort` array through it.
- [claudeAgent.ts](./claudeAgent.ts):
  - **D3** — `toAgentModelInfo(m, provider)` expanded with three optional fields:
    - `configSchema = createClaudeThinkingLevelSchema(supportedEfforts)` where `supportedEfforts = (supports.reasoning_effort ?? []).filter(isClaudeEffortLevel)`. Reads the per-model list off the runtime CAPI `/models` payload (which already carries `reasoning_effort: string[]` and `adaptive_thinking: boolean` on `capabilities.supports`) by narrowing through a local `IClaudeModelSupports` type — the published `@vscode/copilot-api` types don't yet declare these fields, tracked at [microsoft/vscode-capi#85](https://github.com/microsoft/vscode-capi/issues/85). Same pattern the extension already uses at [`extensions/copilot/src/platform/endpoint/common/endpointProvider.ts`](../../../../../../extensions/copilot/src/platform/endpoint/common/endpointProvider.ts) (its locally-declared `IChatModelCapabilities`). Drop the `IClaudeModelSupports` augmentation when the SDK catches up.
    - `policyState = m.policy?.state as PolicyState | undefined` — propagates `CCAModelPolicy.state` straight through to clients so the picker can grey-out disabled rows.
    - `_meta = { multiplierNumeric: m.billing?.multiplier }` (only when `multiplier` is a number) — surfaces `CCAModelBilling.multiplier` under the `_meta` side-channel slot per `IAgentModelInfo._meta` (`agentService.ts:271`). Spread-only-when-defined so non-multiplied models stay clean.
  - **D4** — added `getSessionMetadata(session: URI): Promise<IAgentSessionMetadata | undefined>` mirroring `IAgent.getSessionMetadata?` (`agentService.ts:477`). Composes `_sdkService.getSessionInfo(id)` (SDK is the source of truth for existence) with `_readSessionMetadata(session)` (overlay), pipes through `_toAgentSessionMetadata`. Crucially **does NOT** gate on the sidecar — external Claude CLI sessions have no DB but must hydrate (Phase-5 exit criterion + the D5 reversal). Overlay read failures are caught and logged so a single corrupt DB cannot lose the SDK-supplied summary/cwd; SDK lookup failures propagate so the caller learns the SDK module is broken.
  - **D1, D2, D5** — no-op (rationale captured in the audit-row strikethroughs at lines 47/53 and the cycle-step bullets D1/D5).
- [claudeAgentSdkService.ts](./claudeAgentSdkService.ts):
  - Added `getSessionInfo(sessionId): Promise<SDKSessionInfo | undefined>` to the `IClaudeAgentSdkService` interface and the `IClaudeSdkBindings` structural slice, plus the production passthrough on `ClaudeAgentSdkService` (one-line `await this._getSdk(); return sdk.getSessionInfo(sessionId)`). Keeps the SDK module behind the service boundary so the agent's `getSessionMetadata` doesn't reach into `@anthropic-ai/claude-agent-sdk` directly.

**Tests**

Two new tests added to [`claudeAgent.test.ts`](../../test/node/claudeAgent.test.ts), one pre-existing test updated, two test doubles extended, plus a `makeSupports` test helper:

- Updated: `'authenticate populates models filtered to Claude family'` — model snapshot expanded to include `policyState: 'enabled'` and `_meta: { multiplierNumeric: 1 }` from the default `makeModel` fixture (`policy.state` + `billing.multiplier` were already on the fixture; D3 makes them visible on `IAgentModelInfo`).
- New (D3): `'authenticate sources configSchema enum from each model\'s reasoning_effort list (Phase 6.1 / Cycle D3 / I5)'` — five-model fixture exercising every per-model variation in one assertion: full `['low','medium','high']`, single-value `['high']`, empty `[]` (no schema), unknown values filtered out (`['low','bogus','high']` → `['low','high']`), and missing field (no schema). Snapshot is `{ modelId: configSchema | undefined }` so the per-model variation is the contract.
- New (D4): `'getSessionMetadata joins SDK info with sidecar overlay, returns SDK-only fields for external sessions, and undefined for unknown ids (Phase 6.1 / Cycle D4 / I7)'` — three-call assertion in one test (sidecar + external + unknown) snapshotting the joined output, plus the SDK-lookup-call list to lock the call shape.
- `makeSupports({ adaptive_thinking, reasoning_effort })` test helper — narrows the augmented runtime shape through one widening cast at the test boundary (mirror of the prod-side `IClaudeModelSupports`); tests then build per-model fixtures via spread without escape-hatch casts at every fixture site.
- `FakeClaudeAgentSdkService.getSessionInfo` — searches `sessionList` by id by default; `getSessionInfoOverride` hook for "session moved off disk" tests; `getSessionInfoCalls` records ids for call-shape assertions.
- `ProxyRoundTripSdkService` (integration test) — added `getSessionInfo(): Promise<undefined>` stub to satisfy the interface; the integration suite never exercises the lookup so the stub is unconditional.
- Test-suite count: **54 pass / 0 fail** (was 52 → +2 new + 1 updated; `claudeModelConfig.test.ts` still 2/2).

**Deviation note (D3 — corrected mid-cycle)**

The first D3 implementation used a static 5-value `ClaudeEffortLevel` union for *any* adaptive-thinking model, gated on the presence of `min_thinking_budget` + `max_thinking_budget` on `CCAModelSupports`. That was wrong: per-model variation is the contract. Different Claude models expose different effort subsets at runtime (the extension's [`pickReasoningEffort`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeModels.ts) at line 208 reads `endpoint.supportsReasoningEffort` per-endpoint, e.g. `['low','medium','high']`, `['high']`, or `[]`). The corrected approach reads the runtime `reasoning_effort` field via a local `IClaudeModelSupports` type augmentation at the read boundary; SDK-type drift tracked at [microsoft/vscode-capi#85](https://github.com/microsoft/vscode-capi/issues/85).

**Verification**

- TDD red-green per micro-step (D3 → D4); each step's RED-flip was proven by a failing test, then GREEN-flipped by the minimal impl change. Full-suite re-run after each step confirmed no other tests broke.
- `get_errors` on all modified files at each step — 0 errors.

**Deviations from plan**

- **D3 source for the thinking-level enum.** Plan said "synth from `CCAModel.capabilities.supports.{adaptive_thinking,min_thinking_budget,max_thinking_budget}`". The shipped CCAModel typedef (types.d.ts:207–208) has no `adaptive_thinking` field — only the two budget bounds. Resolution: detect adaptive thinking via `min_thinking_budget !== undefined && max_thinking_budget !== undefined`, source the enum from the static `ClaudeEffortLevel` union (the picker-emit side already uses it; the materialize-narrow side already accepts it). Diverges from CopilotAgent's `supportedReasoningEfforts`-driven shape but is the only correct path for Anthropic models.
- **D4 sidecar-gated vs SDK-gated existence check.** CopilotAgent's `getSessionMetadata` (`copilotAgent.ts:560-590`) returns `undefined` when there's no stored sidecar — every Copilot session is born inside VS Code, so the sidecar is a sound presence test. Claude cannot inherit that pattern: the same external-CLI carve-out that drives the listSessions D5 reversal also applies here. Resolution: use `_sdkService.getSessionInfo(sessionId)` as the existence test (SDK miss ⇒ undefined) and treat the overlay as decoration only.
- **No `IAgentModelInfo` interface change.** The three new fields (`configSchema`, `policyState`, `_meta`) were already optional on the interface (`agentService.ts:269-271`); D3 only fills them in for the Claude provider. CopilotAgent's `_listModels` already surfaces all three (`copilotAgent.ts:600-610`).

**Notes for downstream cycles**

- **Phase 9 `changeModel`** can use the same `createClaudeThinkingLevelSchema` helper to advertise the picker contract on a per-model basis after live model swaps; no new helper needed.
- **`_meta` schema convention**: D3 introduces the `multiplierNumeric` key under Claude's `_meta`. Matches CopilotAgent's existing `_meta.multiplierNumeric` (verified at `copilotAgent.ts:608`); clients reading either provider's models can index this slot uniformly.

### Cycle D follow-ups (post-D, pre-F)

Three small drift-free extensions to D3 landed between Cycle D close and Cycle F start, all within Cycle D's already-listed file scope. Captured here so the plan doesn't lie about what shipped.

- **Direct unit tests for the D3 helpers.** Added [`../../test/common/claudeModelConfig.test.ts`](../../test/common/claudeModelConfig.test.ts) covering `resolveClaudeEffort` (2 tests), `isClaudeEffortLevel` (1), and `createClaudeThinkingLevelSchema` (3 — variation snapshot, default-rule, aliasing safety). 5 tests total. The shipped `claudeAgent.test.ts` already exercises the helpers end-to-end through `toAgentModelInfo`, but direct tests pin the picker-emit / materialize-narrow contract independent of the agent boundary.
- **Default thinking level rule.** `createClaudeThinkingLevelSchema` now emits `default: 'high'` when (and only when) `'high'` is in the model's `supportedEfforts` list; no default otherwise. Mirrors the extension's canonical rule at [`claudeCodeModels.ts:230`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeModels.ts#L230). Surfaces through `IConfigSchema.properties[key].default` so the JSON-schema-driven picker pre-selects 'high' on a fresh session for any model that supports it.
- **Option A — sort `is_chat_default` models first.** [`claudeAgent.ts`](./claudeAgent.ts) `_refreshModels` now stable-sorts `all.filter(isClaudeModel)` by `is_chat_default` descending before mapping through `toAgentModelInfo`. The `IAgentModelInfo` protocol carries no `isDefault` bit; the workbench picker uses `models[0]` as the de-facto default at [`modelPicker.ts:144`](../../../../../sessions/contrib/copilotChatSessions/browser/modelPicker.ts#L144) (`_selectedModel ?? models[0]`). Stable comparator (returns 0 on ties) preserves CAPI's relative ordering among non-default models. Test added: `'authenticate surfaces the CAPI chat-default model first; ties preserve insertion order'`. **No protocol change** to `IAgentModelInfo`.
- **Test count after follow-ups:** **59 pass / 0 fail** (`claudeAgent.test.ts`: 54 → 55; `claudeModelConfig.test.ts`: 0 → 5; `claudeAgent.integrationTest.ts`: unchanged).

### Cycle F — Mapper widening: 'assistant' canonical M8 / I1 (completed)

**Code changes**

- [claudeMapSessionEvents.ts](./claudeMapSessionEvents.ts):
  - Added `case 'assistant':` to the top-level `mapSDKMessageToAgentSignals` switch, dispatching to a new private `mapAssistantCanonical(message, logService)` helper.
  - `mapAssistantCanonical` deliberately returns `[]` for text/thinking content. The reducer at [`reducers.ts:338-356`](../../common/state/protocol/reducers.ts#L338-L356) is **append-only** — there is no `SessionResponsePart` replacement action. Because `Options.includePartialMessages: true` (Phase 6 §3.4) drives the partials to produce the same content the canonical message carries, re-emitting on the canonical envelope would duplicate, not reconcile, the activeTurn `responseParts` list.
  - Defense-in-depth: scans `message.message.content` for `tool_use` blocks and warns each one with the `id`/`name`. Mirrors the existing `content_block_start` `tool_use` warn-and-drop at [claudeMapSessionEvents.ts:163-167](claudeMapSessionEvents.ts#L163-L167). Both warns lift in Phase 7 once tool calls are wired through.
  - JSDoc on the new helper documents M8:875 ("partials advisory; canonical authoritative") and explains why the only correct action under append-only-reducer + `includePartialMessages: true` is "drop".

**Tests**

Two new tests in [`claudeAgent.test.ts`](../../test/node/claudeAgent.test.ts), one new builder, one extension to `createTestContext`, and a small log-capturing fake:

- New helper: `makeAssistantMessage(sessionId, content)` builds an `SDKAssistantMessage` envelope (`type: 'assistant'`) with the SDK's full `Anthropic.Messages.Message` shape. Sits next to the existing `make*` builders. Uses `'fake-assistant-id'` etc. as static fixtures since these IDs aren't asserted by any test.
- New helper: `CapturingLogService` — minimal `ILogService` test double that records `warn(message)` calls into a `warns: string[]` array for assertions. Other methods are no-ops. Plumbed via a new optional `logService` field on `createTestContext`'s options bag (defaults to `NullLogService`); the option flows through to the fake `IClaudeProxyService` (whose [stale token logging path](./claudeAgent.ts#L1099) wants a real-ish log service in the test).
- New test (passes): `'canonical SDKAssistantMessage with tool_use content fires defense-in-depth warning (Phase 6.1 / Cycle F)'`. Stages a `system:init`, a canonical `SDKAssistantMessage` carrying a `tool_use` content block, and a `result:success`. Asserts `responsePartCount === 0` and `logService.warns` contains a `tool_use`-mentioning entry.
- New test (passes): `'canonical SDKAssistantMessage with text content does not double-emit signals already produced by stream_event partials (Phase 6.1 / Cycle F)'`. Stages the canonical no-double-emit scenario: `system:init` → `stream_event(message_start, content_block_start, text_delta='hello', content_block_stop, message_stop)` → canonical `SDKAssistantMessage([{type:'text', text:'hello'}])` → `result:success`. Asserts exactly **1** `SessionResponsePart` and exactly **1** `SessionDelta` (with `content === 'hello'`) — no duplication from the canonical envelope.
- Test count: **61 pass / 0 fail** (was 59 → +2 new). `claudeModelConfig.test.ts` still 5/5 — total agentHost claude suite **66 pass**.

**Verification**

- TDD red-green: red phase confirmed by running just the two new tests with the mapper still on `default` arm — tool_use warning test failed (no `case 'assistant'` arm meant `message.message.content` was never inspected). Green after adding the case to the switch and the helper.
- `get_errors` on both touched files — 0 errors.

**Deviations from plan**

- **No `IClaudeMapperState` extension.** Plan flagged "Extend `IClaudeMapperState` to track per-block content if reconciliation requires it." Reconciliation does NOT require it: under append-only-reducer + `includePartialMessages: true`, the canonical message's correct action is "drop, with a defense-in-depth scan." No state extension shipped; [claudeAgentSession.ts](./claudeAgentSession.ts) untouched.
- **No standalone `claudeMapSessionEvents.test.ts`.** Plan listed [`../../test/node/claudeMapSessionEvents.test.ts`](../../test/node/claudeMapSessionEvents.test.ts) as a target; the existing convention in this codebase tests the mapper end-to-end through the agent (consistent with the existing `'text content_block emits SessionResponsePart(Markdown) before SessionDelta'` family of tests). Adding a standalone file would duplicate the harness for no gain. The new tests were added to `claudeAgent.test.ts` next to its peers.
- **Reducer ordering invariant — verified by construction, not by new test.** The plan called out "Verify reducer ordering: `SessionResponsePart` MUST precede first delta for that part id." Cycle F adds zero new emissions in the canonical text path, so the invariant cannot regress. The existing tests at [`claudeAgent.test.ts:1369`](../../test/node/claudeAgent.test.ts#L1369) and [`:1444`](../../test/node/claudeAgent.test.ts#L1444) continue to lock the invariant for the `stream_event`-driven path.

**Notes for downstream cycles**

- **Phase 7 (tool calls).** The defense-in-depth `tool_use` warn lifts in Phase 7. The mapper will then emit `SessionToolCallStart` from the canonical envelope's `tool_use` blocks (alongside the matching emissions already planned for `stream_event` partials). The `mapAssistantCanonical` helper is the dispatch site for that work.
- **Replay parity (Phase 13).** Replay produces canonical `SDKAssistantMessage`s only — there are no `stream_event` partials in JSONL transcripts. `mapAssistantCanonical` is therefore the *only* path that emits text response parts in replay, so its body must grow from "drop" to "emit canonical parts" before replay ships. Until then, the stub at [`claudeAgent.ts:598-605`](./claudeAgent.ts#L598-L605) keeps replay off.
- **Boundary asymmetry preserved.** Live still closes a turn on `'result'` (the existing code path); canonical `'assistant'` deliberately does NOT close the turn. M8 boundary contract intact.

### Architectural cleanup (post-Cycle-F, pre-Cycle-G)

Two follow-up refactors that came out of the post-Cycle-F architectural review. Both are pure debt reduction — no behavior change, no protocol change, no new tests for cycles A–F's behavior. Phase 7 readiness is the underlying motivator: the mapper grows, so the seam needs to grow with it instead of the call sites.

**1. Encapsulate mapper state as an opaque `ClaudeMapperState` class**

- [`claudeMapSessionEvents.ts`](./claudeMapSessionEvents.ts): Replaced `export interface IClaudeMapperState { readonly currentBlockParts: Map<number, string>; }` with `export class ClaudeMapperState`. The class exposes 4 named operations — `resetMessage()`, `allocPart(index, partId)`, `getPart(index)`, `dropPart(index)` — backed by a private `_blockParts: Map<number, string>`. The lifecycle invariant ("clear on `message_start`, allocate on `content_block_start`, look up on `content_block_delta`, drop on `content_block_stop`") now lives behind those names.
- The mapper signatures (`mapSDKMessageToAgentSignals`, internal `mapStreamEvent`) take `state: ClaudeMapperState` instead of `state: IClaudeMapperState`. The four internal call sites (`message_start` → `state.resetMessage()`, `content_block_start text/thinking` → `state.allocPart(index, partId)` ×2, `content_block_delta` → `state.getPart(event.index)`, `content_block_stop` → `state.dropPart(event.index)`) route through the methods.
- [`claudeAgentSession.ts`](./claudeAgentSession.ts): `private readonly _mapperState: IClaudeMapperState = { currentBlockParts: new Map<number, string>() };` becomes `private readonly _mapperState: ClaudeMapperState = new ClaudeMapperState();`. Import updated. No other call sites — `_mapperState` is only ever passed to `mapSDKMessageToAgentSignals`.
- **Why now.** Phase 7 grows the state with at least one cross-message map (in-flight tool calls keyed by SDK `tool_use_id`) and the lifecycle for those is *not* "drop on `message_start`" — it's "drop on `tool_result` envelope or terminal `result`." Encoding the per-message vs. cross-message lifecycle distinction in a `Map<number, string>` literal at the call site would have meant a breaking change in Phase 7. Encoding it in `resetMessage()` (per-message fields drop here; cross-message fields explicitly excluded) localizes that change to one method body.
- **Why a class, not a tighter interface.** The previous `interface IClaudeMapperState { readonly currentBlockParts: Map<number, string>; }` had `readonly` on the *field reference* but not on the *Map's mutation surface*; callers could (and did) call `.set` / `.get` / `.delete` / `.clear` directly. A class with private state and a method-only surface fixes that without `Readonly<...>` wrappers that wouldn't have made the Map's mutators inaccessible anyway.
- **No protocol change. No new tests for state ownership specifically — the state semantics are tested through the mapper behavior, see "Direct mapper unit tests" below.**

**2. Direct mapper unit tests at the function seam**

- New file: [`../../test/node/claudeMapSessionEvents.test.ts`](../../test/node/claudeMapSessionEvents.test.ts). 11 tests covering the mapper as a pure function with a fresh `ClaudeMapperState` per scenario. Cases:
  1. `message_start` clears state and emits no signals (verified by post-reset delta resolving to `[]`).
  2. text content block: start emits `SessionResponsePart(Markdown)`, deltas emit `SessionDelta` with the same `partId`, stop drops the part (post-stop delta at the same index emits `[]`).
  3. thinking content block: start emits `SessionResponsePart(Reasoning)`, delta emits `SessionReasoning`.
  4. streamed `tool_use` content block at `content_block_start` is dropped with a warn log (defense-in-depth).
  5. canonical `'assistant'` envelope drops `tool_use` blocks with a warn log and emits nothing.
  6. canonical `'assistant'` envelope without `tool_use` emits nothing and does not warn.
  7. `result` success emits `SessionUsage` (with `model` from `modelUsage`) followed by `SessionTurnComplete`.
  8. `result` success with empty `modelUsage` omits the `model` field on `SessionUsage`.
  9. `message_stop` and unknown stream events emit `[]`.
  10. `content_block_delta` with no allocated part (orphan delta) emits `[]`.
  11. multi-block ordering: text @0 + thinking @1 keep distinct part ids, and deltas route to the correct part.
- New file: [`../../test/node/claudeMapSessionEventsTestUtils.ts`](../../test/node/claudeMapSessionEventsTestUtils.ts). Exports the SDK envelope builders previously inlined in `claudeAgent.test.ts` (`makeSystemInitMessage`, `makeResultSuccess`, `makeStreamEvent`, `makeMessageStart`, `makeContentBlockStart{Text,Thinking,ToolUse}`, `make{Text,Thinking}Delta`, `makeContentBlockStop`, `makeMessageStop`, `makeAssistantMessage`, `makeNonNullableUsage`, `TEST_UUID`) plus their type aliases (`BetaRaw*Event`, `BetaContentBlock`). One new builder added: `makeContentBlockStartToolUse(index, id, name)` for the new direct test of defense-in-depth.
- [`../../test/node/claudeAgent.test.ts`](../../test/node/claudeAgent.test.ts) now imports those builders from the util file instead of declaring them inline (~200 lines removed; the file is unchanged in semantics).
- **Why now.** Cycles A–F added new builders + a `CapturingLogService` test double *inside* the agent harness file. Each new mapper test before this refactor cost ~50 lines of agent harness setup. With the seam at the function level, the new tests cost a fresh `ClaudeMapperState()` each. The 11 cases above all fit inside 280 lines including imports.
- **Coverage delta.** The agent-harness tests already exercised the same mapper behavior end-to-end — these direct tests don't add coverage *of correct behavior*, they add coverage *at the seam where regressions should fail first*. Cases 8 (modelUsage empty), 9 (message_stop), 10 (orphan delta), and 11 (multi-block ordering) were not directly asserted at the harness level; they're now locked at the mapper level.
- **No protocol change. No behavior change. No agent-harness regression — `claudeAgent.test.ts` still 55/55 pass after the import refactor.**

**Test count after architectural cleanup:** agentHost claude suite is now **72 pass / 0 fail** across `claudeAgent.test.ts` (55) + `claudeMapSessionEvents.test.ts` (11 new) + `claudeModelConfig.test.ts` (6). No regressions.

**3. Stateless mapper (follow-up to #1)**

After landing #1, an empirical re-read of `BetaRawContentBlockStartEvent.index` ([`node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts:1123`](../../../../../node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts)) and the SDK's own accumulator ([`node_modules/@anthropic-ai/sdk/lib/BetaMessageStream.js:476`](../../../../../node_modules/@anthropic-ai/sdk/lib/BetaMessageStream.js)) showed `index` is the position within the *current message's* `content[]` — the SDK accumulator does `snapshot.content.push(event.content_block)` on `content_block_start` and `snapshot.content.at(event.index)` on `content_block_delta` with no bounds checking. Phase 6 sets `canUseTool: deny`, so a turn is exactly one assistant message and `index` is therefore monotonic within a turn. That removes the only reason `ClaudeMapperState` existed.

- [`claudeMapSessionEvents.ts`](./claudeMapSessionEvents.ts): Deleted the `ClaudeMapperState` class. `mapSDKMessageToAgentSignals` and the internal `mapStreamEvent` no longer take a `state` parameter. `content_block_start text/thinking` emits `SessionResponsePart` with `id: \`${turnId}#${event.index}\`` directly. `content_block_delta` emits with the same string formula — no map lookup, no orphan-delta guard. `message_start`, `content_block_stop`, `message_delta`, `message_stop` all become `return []` no-ops. `generateUuid` import removed.
- [`claudeAgentSession.ts`](./claudeAgentSession.ts): Dropped the `_mapperState` field and its `ClaudeMapperState` import; the call to `mapSDKMessageToAgentSignals` no longer passes a state argument.
- [`../../test/node/claudeMapSessionEvents.test.ts`](../../test/node/claudeMapSessionEvents.test.ts): Removed the `freshState()` helper and `ClaudeMapperState` import. Re-purposed the `message_start` test to "emits no signals" (no state to clear). Dropped the post-stop "leak" assertion from the text-block test (stop is now a no-op; the SDK protocol guarantees no out-of-order deltas). Deleted the orphan-delta test — a `SessionDelta` with an unknown `partId` is already a silent no-op in the reducer ([`reducers.ts:240`](../../common/state/protocol/reducers.ts#L240)), so the mapper-level guard was redundant cosmetic protection.
- **Why now / why this is safe.** The state class only ever skipped a no-op iteration in the reducer. The SDK protocol orders `content_block_start` strictly before any delta at the same index; an out-of-protocol delta with no preceding start is silently dropped by `updateResponsePart` because `if (!found) return state;`. Removing the state class therefore changes zero observable behavior under the SDK contract and one cosmetic behavior (a malformed orphan delta would now hit the reducer no-op instead of a mapper no-op).
- **Phase 7 implication.** Phase 7 turns are multi-message (text → tool_use → tool_result → text). The SDK resets `index` per message — the `content_block_start` push-then-`at(index)` pattern in `BetaMessageStream.js` proves it, since each `message_start` builds a fresh snapshot. That collision lands in Phase 7, not Phase 6. The fix at that point is to mix `message.id` (or an equivalent per-message counter) into the partId formula: `${turnId}#${messageId}#${index}`. Phase 7's plan should reintroduce the minimum state needed for that — likely a single `_currentMessageId: string | undefined` field, set on `message_start` from `event.message.id` — alongside the tool-call tracking maps it already requires. The phase-7-plan.md `IClaudeMapperState` design predates this refactor and should be re-derived from the new shape.
- **Test count after this follow-up:** **71 pass / 0 fail** (one direct mapper test deleted as redundant with the reducer's no-op contract). Agent harness tests unchanged (55 pass).



