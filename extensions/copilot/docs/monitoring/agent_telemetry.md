# Agent Telemetry Parity: Workbench Chat Agent vs Copilot CLI Agent

> **TL;DR**
>
> 1. **Gap is real.** The Copilot CLI agent in VS Code is missing ~10 product telemetry events that the workbench Copilot agent emits today — including tool invocations, errors, rate-limits, repo/commit/diff context, and per-action user feedback.
> 2. **Cause is structural, not data-availability.** The CLI session bypasses `ChatParticipantRequestHandler` and the `UserFeedbackService` wiring used by every other Copilot participant. The runtime SDK already exposes every signal we need.
> 3. **Fix is almost entirely VS Code-side.** **11 of 12 fixes** require zero `copilot-agent-runtime` changes — just subscribe to existing SDK session events and emit `publicLog2` / `sendMSFTTelemetryEvent`. The one optional runtime ask is a permission-decision schema enrichment.
> 4. **Recommended path:** ship the P0 group below (~1 sprint of one engineer); it closes the most valuable 80% of the gap.

---

## Top gaps and where the fix lives

| # | Missing telemetry | Why it matters | Owner |
|---|---|---|:---:|
| 1 | Tool invocation (`chat.tools.languageModelToolInvoked` equivalent) | Per-tool success rate, latency, error breakdown for shell / file / search / MCP | **vscode** |
| 2 | Rate-limit (`chatRateLimitAction`) | Capacity & auto-model-switch dashboards exclude CLI traffic today | **vscode** |
| 3 | Errors / failures (auth, MCP, model, quota) | CLI is silent on every failure mode in product telemetry | **vscode** |
| 4 | Per-action feedback (`panel.action.{copy,insert,vote,followup}`, `panel.edit.feedback`, `interactiveSessionDone`) | Quality / satisfaction signals; model evaluation pipelines | **vscode** |
| 5 | Permission decisions (read / write / shell / mcp / url / memory / hook) | Auto-approval rate, abuse signals — currently OTel-only and off by default | **vscode** (+ optional **runtime** schema add) |
| 6 | Repo / commit / diff context (`request.repoInfo`, `interactiveSessionRequest/Response/Message`, `panel.request`) | Repo-aware analysis, eval grounding, diff survival | **vscode** |
| 7 | Session lifecycle (created / disposed / forked / resumed) | Adoption funnel, session-level cohort metrics | **shared workbench** |
| 8 | Slash-command coverage (`/commit`, `/sync`, `/create-pr`, `/plan`, `/fleet`, `/compact`, …) | Today only `/delegate` is captured | **vscode** |
| 9 | Plan / fleet / autopilot mode transitions | Mode adoption, conversion rates | **vscode** |
| 10 | Subagent lifecycle (started / completed / failed) | Subagent reliability, latency | **vscode** |
| 11 | Compaction telemetry | Context-pressure rate, when users hit limits | **vscode** |
| 12 | Doc update for `sessionType` filtering | Dashboards split by surface cleanly | **vscode** |

> **Why so VS Code-heavy?** The runtime SDK already emits every underlying signal as a typed session event (`tool.execution_complete`, `permission.requested/completed`, `session.error` with `errorType: rate_limit` and upstream `code`, `auto_mode_switch.*`, `model.call_failure`, `subagent.*`, `exit_plan_mode.*`, `session.compaction_*`). The CLI session in VS Code already subscribes to these for UI rendering — we just need to add a `publicLog2` call alongside.

---

## Recommended sequencing

### P0 — Ship first (closes the highest-signal gaps)

1. **Tool, error, and permission telemetry.** Add three `publicLog2` sends in [copilotcliSession.ts](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts) (existing `tool.execution_complete`, `session.error`, `permission.completed` handlers). Estimate: ~1 day.
2. **Wire CLI participant into `UserFeedbackService`.** Add `agent.onDidPerformAction` / `onDidReceiveFeedback` in [copilotCLIChatSessions.ts](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts), routing to `userFeedbackService`. Closes 7+ events at once and most OTel-metric gaps as a side effect. Estimate: ~½ day.
3. **Repo / commit / diff context.** Instantiate the existing [`RepoInfoTelemetry`](../../src/extension/prompt/node/repoInfoTelemetry.ts) per request in `copilotcliSession.handleRequest` (the CLI session already injects `IGitService`). Estimate: ~½ day.

### P1 — Cover capacity + lifecycle

4. **Rate-limit (`chatRateLimitAction`)** by subscribing to `session.error` (`errorType === 'rate_limit'`) and `auto_mode_switch.completed`.
5. **Session lifecycle events** at the workbench layer (`chat.session.created/disposed`) keyed on `sessionType` — benefits CLI + future agents.

### P2 — Long tail

6. Slash-command coverage; plan/fleet/autopilot transitions; subagent lifecycle; compaction telemetry; doc updates.

### Optional runtime ask (only if needed)

- Add `auto: boolean` and `policySource: string` to runtime `permission.completed` so VS Code can split silent allowlist decisions from interactive ones without re-deriving. Skip unless an auto-approval-rate dashboard is on the roadmap.

---

## How to verify the conclusion (one example)

The workbench agent's `request.repoInfo` event ships `remoteUrl`, `headCommitHash`, `headBranchName`, `diffsJSON`, etc. via [`RepoInfoTelemetry`](../../src/extension/prompt/node/repoInfoTelemetry.ts#L171), invoked from [`ChatParticipantRequestHandler`](../../src/extension/prompt/node/chatParticipantRequestHandler.ts#L57). The CLI session dispatches via [`copilotCLIChatSessions.handleRequestImpl`](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts#L798) and never instantiates that handler — so today the CLI emits no `request.repoInfo`. `RepoInfoTelemetry` only depends on workbench services (`IGitService`, `IGitDiffService`, `ITelemetryService`, …); the CLI session already injects `IGitService` at [copilotcliSession.ts:805](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L805). **No runtime change required.** The same pattern holds for every other gap above.

---

<details>
<summary>Appendix A — Architectural framing</summary>

A chat request flows through three telemetry layers; knowing which layer fires explains the parity story.

| Layer | Where | Workbench agent | CLI agent |
|---|---|:---:|:---:|
| **A. Workbench chat platform** — `src/vs/workbench/contrib/chat/...` (`ChatServiceImpl`, `ChatServiceTelemetry`, `LanguageModelToolsService`, `ChatWidget`, model picker) | shared dispatch via `ChatServiceImpl._sendRequestAsync` | ✅ | ✅ (split by `sessionType`) |
| **B. Copilot extension chat participants** — `extensions/copilot/src/extension/conversation/vscode-node/...` + `extensions/copilot/src/extension/prompt/node/chatParticipantTelemetry.ts` (`UserFeedbackService`, `ChatParticipantRequestHandler`, `RepoInfoTelemetry`) | wired only on the workbench Copilot participants | ✅ | ❌ — root cause of most gaps |
| **C. Surface-specific** — CLI session events; workbench intent events | n/a | ✅ | ✅ (just `copilotcli.chat.invoke` + `copilotcli.terminal.open` today) |

**Tool-execution divergence:** workbench tools run through `LanguageModelToolsService` (which fires per-tool product telemetry); CLI tools run inside `@github/copilot/sdk` and never reach that service — so `chat.tools.languageModelToolInvoked` never fires for CLI.

</details>

<details>
<summary>Appendix B — Full event inventory (Layer A: shared)</summary>

✅ fires · ⚠️ partial · ❌ does not fire · n/a not applicable

| Event | Workbench | CLI | Source |
|---|:---:|:---:|---|
| `interactiveSessionProviderInvoked` | ✅ | ✅ | [chatServiceTelemetry.ts:287](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L287) |
| `chat.pendingRequestChange` | ✅ | ✅ | [chatServiceImpl.ts:759](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L759) |
| `chat.stopCancellationNoop` | ✅ | ✅ | [chatServiceImpl.ts:1761](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L1761) |
| `interactiveSessionVote/Copy/Insert/Apply/RunInTerminal` | ✅ | ✅ (no `sessionType` field today) | [chatServiceTelemetry.ts:185-211](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L185) |
| `chatFollowupClicked` / `chatEditHunk` / `chatFollowupsRetrieved` | ✅ | ⚠️ (CLI rarely produces followups; edits routed through SDK) | [chatServiceTelemetry.ts:221-247](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L221) |
| `chat.tools.languageModelToolInvoked` | ✅ | ❌ — CLI tools run inside SDK | [languageModelToolsService.ts:677](../../../../src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts#L677) |
| `askQuestionsToolInvoked` | ✅ | ❌ — different elicitation path | [askQuestionsTool.ts:613](../../../../src/vs/workbench/contrib/chat/common/tools/builtinTools/askQuestionsTool.ts#L613) |
| `toolResultCompressed` | ✅ | ❌ — compression is inside SDK | [toolResultCompressorService.ts:148](../../../../src/vs/workbench/contrib/chat/browser/tools/toolResultCompressorService.ts#L148) |
| `chat.modelChange` / `chat.modelPickerInteraction` / `chat.modelsAtStartup` / `chat.modelCreatedStats` | ✅ | ✅ | [chatModelPicker.ts](../../../../src/vs/workbench/contrib/chat/browser/widget/input/chatModelPicker.ts), [chatModelCountTelemetry.ts](../../../../src/vs/workbench/contrib/chat/browser/telemetry/chatModelCountTelemetry.ts) |
| `chat.modeChange` | ✅ | n/a (CLI has no mode toggle) | [chatExecuteActions.ts:337](../../../../src/vs/workbench/contrib/chat/browser/actions/chatExecuteActions.ts#L337) |
| `agentSessionOpened` | ✅ | ✅ (when opened from Agents window) | [agentSessionsControl.ts:636](../../../../src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsControl.ts#L636) |
| `chat.thinkingStyleUsage` / `chat.promptRun` | ✅ | ⚠️ | [chatWidget.ts](../../../../src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts) |

</details>

<details>
<summary>Appendix C — Full event inventory (Layer B: Copilot extension)</summary>

These all live in `extensions/copilot/src/extension/conversation/vscode-node/` and `extensions/copilot/src/extension/prompt/node/`. **None** fire for CLI today; all fixes are vscode-only.

| Event | Workbench | CLI | Source |
|---|:---:|:---:|---|
| `panel.action.{copy,insert,followup,vote}` | ✅ | ❌ | [userActions.ts:87,114,137,364](../../src/extension/conversation/vscode-node/userActions.ts#L87) |
| `panel.edit.feedback` (MSFT, GH, Internal MSFT) | ✅ | ❌ | [userActions.ts:177,189,202](../../src/extension/conversation/vscode-node/userActions.ts#L177) |
| `interactiveSessionDone` | ✅ | ❌ | [userActions.ts:511](../../src/extension/conversation/vscode-node/userActions.ts#L511) |
| `inline.done` / `inline.trackEditSurvival` | ✅ | n/a (inline-only) | [userActions.ts:501,569](../../src/extension/conversation/vscode-node/userActions.ts#L501) |
| `chatRateLimitAction` | ✅ | ❌ | [chatParticipants.ts:224](../../src/extension/conversation/vscode-node/chatParticipants.ts#L224) |
| `request.repoInfo` (Enhanced GH + Internal MSFT) | ✅ | ❌ | [repoInfoTelemetry.ts:171](../../src/extension/prompt/node/repoInfoTelemetry.ts#L171) |
| `interactiveSessionRequest` / `interactiveSessionMessage` / `interactiveSessionResponse` (Internal MSFT) | ✅ | ❌ | [chatParticipantTelemetry.ts:629,805,881](../../src/extension/prompt/node/chatParticipantTelemetry.ts#L629) |
| `panel.request` (MSFT) | ✅ | ❌ | [chatParticipantTelemetry.ts](../../src/extension/prompt/node/chatParticipantTelemetry.ts) |
| `toolCallDetailsInternal` (Internal MSFT) | ✅ | ❌ | [chatParticipantTelemetry.ts:553](../../src/extension/prompt/node/chatParticipantTelemetry.ts#L553) |
| `copilot.search.feedback`, `languageModelAccess.*` | ✅ | n/a | [feedbackReporter.ts:167](../../src/extension/conversation/vscode-node/feedbackReporter.ts#L167), [languageModelAccess.ts:482](../../src/extension/conversation/vscode-node/languageModelAccess.ts#L482) |

</details>

<details>
<summary>Appendix D — Surface-specific events and runtime evidence</summary>

**CLI surface-specific (already exists):** `copilotcli.chat.invoke` ([copilotCLIChatSessions.ts:735](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts#L735)) and `copilotcli.terminal.open` ([copilotCLITerminalIntegration.ts:235](../../src/extension/chatSessions/vscode-node/copilotCLITerminalIntegration.ts#L235)).

**Runtime SDK session events available today** (so VS Code can subscribe and emit product telemetry without runtime changes):

- `tool.execution_start` / `tool.execution_complete` — `toolCallId`, `success`, `error.{message,code}`, `model`, `interactionId`, `turnId`, `toolTelemetry`. VS Code already consumes at [copilotcliSession.ts:1313,1341](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1313).
- `permission.requested` / `permission.completed` — covers `read | write | shell | mcp | url | memory | hook`. VS Code consumes at [copilotcliSession.ts:1119](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1119).
- `session.error` — `errorType: authentication | authorization | quota | rate_limit | context_limit | query`, upstream `code` (`user_weekly_rate_limited` etc.), `willTriggerAutoModeSwitch`. VS Code consumes at [copilotcliSession.ts:1395](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1395).
- `auto_mode_switch.requested/completed`, `model.call_failure`, `subagent.{started,completed,failed,selected,deselected}`, `exit_plan_mode.{requested,completed}`, `session.{compaction_start,compaction_complete}`, `session.{start,resume,shutdown,handoff,idle,title_changed}` — all defined in [copilot-agent-runtime/src/core/sessionEvent.ts](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts), not consumed by VS Code today.

</details>

<details>
<summary>Appendix E — OTel parity (lighter pass)</summary>

Trace coverage is roughly equivalent: both surfaces emit `invoke_agent` and child `chat` / `execute_tool` / `subagent` spans (CLI's are bridged from `@github/copilot/sdk` via [`CopilotCliBridgeSpanProcessor`](../../src/extension/chatSessions/copilotcli/node/copilotCliBridgeSpanProcessor.ts)). The gaps are:

- `GenAiMetrics.incrementUserActionCount` and `emit{InlineDone,EditFeedback,EditSurvival,EditHunkAction,UserFeedback}Event` — workbench-only, fire from [userActions.ts](../../src/extension/conversation/vscode-node/userActions.ts). Same root cause as the `panel.action.*` product-telemetry gap.
- `assistant.message` parent-span events — partial for CLI ([copilotcliSession.ts:2347](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L2347)).

Closing the P0 product-telemetry gaps closes most OTel gaps as a side effect because they emit from the same code paths.

</details>

<details>
<summary>Appendix F — Implementation hints</summary>

- For CLI-specific events follow the existing `copilotcli.*` naming convention and use `telemetryService.sendMSFTTelemetryEvent` (the [copilotCLIChatSessions.ts:737](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts#L737) pattern).
- The `sessionType` field on `interactiveSessionProviderInvoked` ([chatServiceTelemetry.ts:309](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L309)) is the canonical splitter — every new shared event should include it. Add it to existing `interactiveSessionVote/Copy/Insert/Apply/RunInTerminal` as a side-fix so dashboards can split by surface without joining on `chatSessionId`.
- For OTel side-fixes prefer extending [genAiEvents.ts](../../src/platform/otel/common/genAiEvents.ts) and [genAiMetrics.ts](../../src/platform/otel/common/genAiMetrics.ts) rather than adding new emission paths.
- Long-term: extract a shared per-request telemetry helper from [chatParticipantTelemetry.ts](../../src/extension/prompt/node/chatParticipantTelemetry.ts) and call it from both `ChatParticipantRequestHandler` and `copilotcliSession.handleRequest`. Until that refactor, instantiating `RepoInfoTelemetry` directly in the CLI session is the one-line interim fix.

</details>

<details>
<summary>Appendix G — Verification sources</summary>

- **Workbench inventory** — full grep over `extensions/copilot/src/` and `src/vs/workbench/contrib/chat/` for `publicLog2<`, `publicLog(`, `sendMSFTTelemetryEvent`, `sendGHTelemetryEvent`, `sendInternalMSFTTelemetryEvent`, `__GDPR__`. Cross-checked against `ChatServiceTelemetry`, `LanguageModelToolsService`, `ChatModelPicker`, `ChatWidget`, and `chatParticipants.ts`.
- **CLI inventory** — full grep over `extensions/copilot/src/extension/chatSessions/copilotcli/` and `chatSessions/vscode-node/`, plus inspection of [AGENTS.md](../../src/extension/chatSessions/copilotcli/AGENTS.md), `copilotcliSession.ts`, `copilotcliSessionService.ts`, `permissionHelpers.ts`, `exitPlanModeHandler.ts`, and the bridge processor.
- **Runtime evidence** — direct read of [copilot-agent-runtime/src/core/sessionEvent.ts](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) Zod schemas.
- **Layer routing** — confirmed via `ChatServiceImpl._sendRequestAsync` ([chatServiceImpl.ts:1031](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L1031)) and the absence of `onDidPerformAction` / `onDidReceiveFeedback` subscriptions in `extensions/copilot/src/extension/chatSessions/`.

</details>
