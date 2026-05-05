# Agent Product Telemetry Parity Audit

**Audit branch:** `zhichli/agenttele`
**Date:** 2026-05-05
**Scope:** Compare **product telemetry** (`publicLog2` / GDPR-tagged events, plus Copilot extension `sendMSFTTelemetryEvent` / `sendGHTelemetryEvent` / `sendInternalMSFTTelemetryEvent`) emitted by:

- **Workbench Copilot Chat agent (agent mode)** — the default Copilot chat participants registered in [extensions/copilot/src/extension/conversation/vscode-node/chatParticipants.ts](../../src/extension/conversation/vscode-node/chatParticipants.ts) plus the workbench chat platform under [src/vs/workbench/contrib/chat/](../../../../src/vs/workbench/contrib/chat).
- **Copilot CLI agent** — the `targetChatSessionType: 'copilotcli'` integration under [extensions/copilot/src/extension/chatSessions/copilotcli/](../../src/extension/chatSessions/copilotcli) plus its participant glue in [extensions/copilot/src/extension/chatSessions/vscode-node/](../../src/extension/chatSessions/vscode-node).

OTel parity is covered in a lighter pass at the end. This document is read-only — no code changes are made; recommended fixes are listed in [§5 Recommended fixes](#5-recommended-fixes).

> **Bottom line:** The two surfaces share the **workbench-layer** chat events (request lifecycle, vote/copy/insert/apply, model picker, mode change). The CLI surface is **missing every Copilot-extension-layer product event** the workbench agent emits — most importantly tool-invocation telemetry, rate-limit telemetry, and the Copilot-mirrored user-action events (`panel.action.*`, `panel.edit.feedback`, `interactiveSessionDone`, `inline.trackEditSurvival`). The CLI also has **no error / failure telemetry** of its own.

---

## 1. Architectural framing

A chat request flows through three telemetry layers. Knowing which layer fires is the key to the parity story.

| Layer | Where it lives | Fires for workbench agent? | Fires for CLI agent? |
|---|---|---|---|
| **(A) Workbench chat platform** | `src/vs/workbench/contrib/chat/...` (`ChatServiceImpl`, `ChatServiceTelemetry`, `LanguageModelToolsService`, `ChatWidget`, model picker) | Yes | Yes — both surfaces are dispatched via `ChatServiceImpl._sendRequestAsync`; `sessionType` field distinguishes them |
| **(B) Copilot extension chat participants** | `extensions/copilot/src/extension/conversation/vscode-node/...` (`ChatParticipantsContribution`, `UserFeedbackService`, `chatParticipants.ts`) | Yes | **No** — CLI registers its own participant in `extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts` and never wires `onDidPerformAction` / `onDidReceiveFeedback` to `UserFeedbackService` |
| **(C) Surface-specific** | `extensions/copilot/src/extension/chatSessions/{copilotcli,vscode-node}/...` for CLI; `extensions/copilot/src/extension/{intents,prompt,...}` for workbench | One event family each | One event family each |

The asymmetry in layer (B) is the largest source of parity gaps.

**Tool execution path divergence.** Tools invoked by the workbench Copilot agent run through the workbench `LanguageModelToolsService` ([src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts](../../../../src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts#L677)) which fires per-tool telemetry. Tools invoked by the Copilot CLI agent run **inside the `@github/copilot/sdk`** process (with VS Code-supplied tools delivered via an in-process MCP server) so they never hit the workbench `LanguageModelToolsService` and produce **no** `chat.tools.languageModelToolInvoked` events. This is the second-largest gap.

---

## 2. Side-by-side event inventory

✅ = event fires for this surface · ⚠️ = fires but with reduced fidelity · ❌ = does not fire · n/a = not applicable

### 2.1 Layer (A) — Workbench chat platform (shared)

| Event | Workbench agent | CLI agent | Distinguishing field | Source |
|---|:---:|:---:|---|---|
| `interactiveSessionProviderInvoked` | ✅ | ✅ | `sessionType` (`local` vs `copilotcli`), `chatMode`, `agent`, `agentExtensionId` | [chatServiceTelemetry.ts:287](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L287) |
| `chat.pendingRequestChange` | ✅ | ✅ | `source` (sendRequest/cancel/etc.) | [chatServiceImpl.ts:759](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L759) |
| `chat.stopCancellationNoop` | ✅ | ✅ | `reason` | [chatServiceImpl.ts:1761](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L1761) |
| `interactiveSessionVote` | ✅ | ✅ | `agentId`, `direction` | [chatServiceTelemetry.ts:185](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L185) |
| `interactiveSessionCopy` | ✅ | ✅ | `agentId`, `copyKind` | [chatServiceTelemetry.ts:191](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L191) |
| `interactiveSessionInsert` | ✅ | ✅ | `agentId`, `newFile` | [chatServiceTelemetry.ts:197](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L197) |
| `interactiveSessionApply` | ✅ | ✅ | `agentId`, `codeMapper`, `editsProposed` | [chatServiceTelemetry.ts:203](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L203) |
| `interactiveSessionRunInTerminal` | ✅ | ✅ | `agentId`, `languageId` | [chatServiceTelemetry.ts:211](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L211) |
| `chatFollowupClicked` | ✅ | ⚠️ | CLI never produces followups, so the count is effectively always 0 | [chatServiceTelemetry.ts:221](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L221) |
| `chatEditHunk` | ✅ | ⚠️ | CLI's edits flow through the SDK and may not surface in workbench `chatEditing` infrastructure for all edit types | [chatServiceTelemetry.ts:236](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L236) |
| `chatFollowupsRetrieved` | ✅ | ⚠️ | Same — CLI rarely emits followups | [chatServiceTelemetry.ts:247](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L247) |
| `chat.tools.languageModelToolInvoked` | ✅ | ❌ | **CLI tools run inside SDK; never go through `LanguageModelToolsService.invokeTool`** | [languageModelToolsService.ts:677,691](../../../../src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts#L677) |
| `askQuestionsToolInvoked` | ✅ | ❌ | Workbench AskQuestions tool only | [askQuestionsTool.ts:613](../../../../src/vs/workbench/contrib/chat/common/tools/builtinTools/askQuestionsTool.ts#L613) |
| `toolResultCompressed` | ✅ | ❌ | Workbench tool-result compressor only | [toolResultCompressorService.ts:148](../../../../src/vs/workbench/contrib/chat/browser/tools/toolResultCompressorService.ts#L148) |
| `chat.modelChange` | ✅ | ✅ | Picker fires for both | [chatModelPicker.ts:700](../../../../src/vs/workbench/contrib/chat/browser/widget/input/chatModelPicker.ts#L700) |
| `chat.modelPickerInteraction` | ✅ | ✅ | — | [chatModelPicker.ts:717](../../../../src/vs/workbench/contrib/chat/browser/widget/input/chatModelPicker.ts#L717) |
| `chat.modeChange` | ✅ | n/a | CLI surface has no mode toggle (no Ask/Agent/Edits) | [chatExecuteActions.ts:337](../../../../src/vs/workbench/contrib/chat/browser/actions/chatExecuteActions.ts#L337) |
| `chat.modelsAtStartup` | ✅ | ✅ | One snapshot per startup, includes both providers | [chatModelCountTelemetry.ts:69](../../../../src/vs/workbench/contrib/chat/browser/telemetry/chatModelCountTelemetry.ts#L69) |
| `chat.modelCreatedStats` | ✅ | ✅ | Per provider, including `copilotcli` | [chatModelCountTelemetry.ts:80](../../../../src/vs/workbench/contrib/chat/browser/telemetry/chatModelCountTelemetry.ts#L80) |
| `agentSessionOpened` | ✅* | ✅* | Fires when opened from the Agents window | [agentSessionsControl.ts:636](../../../../src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsControl.ts#L636) |
| `chat.thinkingStyleUsage` | ✅ | ⚠️ | Only emits when the SDK reports thinking content via the bridged stream | [chatWidget.ts:2312](../../../../src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts#L2312) |
| `chat.promptRun` | ✅ | ⚠️ | Fires for prompt-file invocations regardless of surface, but CLI rarely uses prompt files today | [chatWidget.ts:2356](../../../../src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts#L2356) |

### 2.2 Layer (B) — Copilot extension chat participants (workbench-only today)

These all live in `extensions/copilot/src/extension/conversation/vscode-node/` and are wired via `agent.onDidPerformAction` / `agent.onDidReceiveFeedback` on the **workbench** Copilot participants only. **None** of them fire for the CLI agent because [copilotCLIChatSessions.ts](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts) does not subscribe to those events.

| Event | Workbench agent | CLI agent | Source |
|---|:---:|:---:|---|
| `panel.action.copy` (MSFT) | ✅ | ❌ | [userActions.ts:87](../../src/extension/conversation/vscode-node/userActions.ts#L87) |
| `panel.action.insert` (MSFT) | ✅ | ❌ | [userActions.ts:114](../../src/extension/conversation/vscode-node/userActions.ts#L114) |
| `panel.action.followup` (MSFT) | ✅ | ❌ | [userActions.ts:137](../../src/extension/conversation/vscode-node/userActions.ts#L137) |
| `panel.action.vote` (MSFT) | ✅ | ❌ | [userActions.ts:364](../../src/extension/conversation/vscode-node/userActions.ts#L364) |
| `panel.edit.feedback` (MSFT) | ✅ | ❌ | [userActions.ts:177](../../src/extension/conversation/vscode-node/userActions.ts#L177) |
| `panel.edit.feedback` (GH) | ✅ | ❌ | [userActions.ts:189](../../src/extension/conversation/vscode-node/userActions.ts#L189) |
| `panel.edit.feedback` (Internal MSFT) | ✅ | ❌ | [userActions.ts:202](../../src/extension/conversation/vscode-node/userActions.ts#L202) |
| `inline.done` (MSFT + GH) | ✅ | n/a | inline-chat only | [userActions.ts:501,504](../../src/extension/conversation/vscode-node/userActions.ts#L501) |
| `interactiveSessionDone` (Internal MSFT) | ✅ | ❌ | [userActions.ts:511](../../src/extension/conversation/vscode-node/userActions.ts#L511) |
| `inline.trackEditSurvival` (MSFT + GH) | ✅ | n/a | inline-chat only | [userActions.ts:569,576](../../src/extension/conversation/vscode-node/userActions.ts#L569) |
| `chatRateLimitAction` (MSFT) | ✅ | ❌ | [chatParticipants.ts:224,227,263](../../src/extension/conversation/vscode-node/chatParticipants.ts#L224) |
| `copilot.search.feedback` (MSFT) | ✅ | n/a | search agent only | [feedbackReporter.ts:167](../../src/extension/conversation/vscode-node/feedbackReporter.ts#L167) |
| `languageModelAccess.*` (MSFT + Internal) | ✅ | n/a | LM-access surface only | [languageModelAccess.ts:482,606](../../src/extension/conversation/vscode-node/languageModelAccess.ts#L482) |

### 2.3 Layer (C) — Surface-specific events

| Event | Workbench agent | CLI agent | Source |
|---|:---:|:---:|---|
| `copilotcli.chat.invoke` | n/a | ✅ | [copilotCLIChatSessions.ts:735](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts#L735) — `chatRequestId`, `hasChatSessionItem`, `isUntitled`, `hasDelegatePrompt` |
| `copilotcli.terminal.open` | n/a | ✅ | [copilotCLITerminalIntegration.ts:235](../../src/extension/chatSessions/vscode-node/copilotCLITerminalIntegration.ts#L235) — `sessionType`, `shell`, `terminalCreationMethod`, `location` |
| `chat.intentDetected` and other workbench-agent intent events under `extensions/copilot/src/extension/intents/` | ✅ | ❌ | not relevant to CLI |
| Session **create / open / fork / dispose** | (none) | (none) | **Neither surface emits product telemetry for session lifecycle.** This is a shared gap. |
| Tool **permission request / grant / deny** | n/a (no permission UI) | ❌ | CLI permission flow ([permissionHelpers.ts](../../src/extension/chatSessions/copilotcli/node/permissionHelpers.ts)) is OTel-only |
| Plan-mode / fleet / autopilot transitions | n/a | ❌ | [exitPlanModeHandler.ts](../../src/extension/chatSessions/copilotcli/node/exitPlanModeHandler.ts) emits no product telemetry |
| Slash commands (`/commit`, `/sync`, `/merge`, `/create-pr`, `/update-pr`) | n/a | ❌ | No per-command telemetry beyond the generic `copilotcli.chat.invoke` (which only flags `/delegate`) |

---

## 3. Parity gap summary

### 3.1 Critical gaps (CLI is missing important workbench events)

These are gaps where the workbench agent has telemetry that materially supports product or quality decisions and the CLI surface produces nothing equivalent.

1. **Tool invocation telemetry (`chat.tools.languageModelToolInvoked`)** — Without it we cannot answer: how often does the CLI agent call shell/file/search/MCP tools, what is their pass/error rate, how long do they take? The SDK emits OTel `execute_tool` spans (bridged via [CopilotCliBridgeSpanProcessor](../../src/extension/chatSessions/copilotcli/node/copilotCliBridgeSpanProcessor.ts#L69)) but those are **not** product telemetry and are off by default.
2. **Rate-limit signals (`chatRateLimitAction`)** — Workbench tracks rate-limit user actions (auto-switch/try-again). The CLI session has its own auto-switch / model-fallback paths in [copilotcliSession.ts](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts) that emit nothing.
3. **Error / failure telemetry** — CLI emits **zero** product telemetry on errors. SDK errors, permission failures, MCP failures, auth failures are silent except for OTel spans (which are off by default in production for most users).
4. **Mirrored Copilot user-action events** — `panel.action.copy / insert / followup / vote`, `panel.edit.feedback`, `interactiveSessionDone`. The shared workbench `interactiveSessionVote/Copy/Insert/Apply` events DO fire, so basic product analysis is possible, but the Copilot-extension-layer mirrors (which carry richer per-participant context like `participant`, `command`, `codeBlockIndex`, model context) are missing for CLI sessions.
5. **Permission flow** — Read / write / shell / MCP permission decisions ([permissionHelpers.ts](../../src/extension/chatSessions/copilotcli/node/permissionHelpers.ts)) emit no product telemetry. We cannot measure "% of shell commands auto-approved", "% denied", etc.

### 3.2 Moderate gaps

6. **Session lifecycle events** — Neither surface fires product telemetry for session create / open / fork / delete. This is shared — but the CLI surface has *richer* lifecycle (fork, resume from disk, plan-mode transitions) that would be especially valuable to track.
7. **Slash-command telemetry** — Workbench tracks slash-command via `interactiveSessionProviderInvoked.slashCommand`. The CLI surface has a richer set (`/commit`, `/sync`, `/merge`, `/create-pr`, `/create-draft-pr`, `/update-pr`, `/delegate`, `/plan`, `/fleet`, `/compact`) but only `/delegate` is captured (in `copilotcli.chat.invoke.hasDelegatePrompt`).
8. **Plan / fleet / autopilot mode transitions** — Workbench's `chat.modeChange` fires on Ask↔Agent toggles. CLI's autopilot/interactive/plan/fleet transitions in `exitPlanModeHandler.ts` are unobserved.

### 3.3 Acceptable / by design

9. Inline-chat events (`inline.done`, `inline.trackEditSurvival`, `panel.edit.feedback`) — CLI is not an inline-chat surface; absence is correct.
10. `chat.modeChange` — CLI has no Ask/Agent/Edits modes; absence is correct.
11. `copilot.search.feedback`, `languageModelAccess.*` — workbench-specific surfaces.
12. `copilotcli.terminal.open` having no workbench counterpart — workbench has no equivalent UX.

---

## 4. OTel parity (lighter pass)

OTel is more symmetric than product telemetry, but emission paths differ.

| Signal | Workbench agent | CLI agent | Notes |
|---|:---:|:---:|---|
| `invoke_agent <name>` span | ✅ [toolCallingLoop.ts:762](../../src/extension/intents/node/toolCallingLoop.ts#L762) (e.g. `invoke_agent copilot`) | ✅ [copilotcliSession.ts:956](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L956) (`invoke_agent copilotcli`) | Both attach `gen_ai.operation.name=invoke_agent`, conversation/session IDs, request model, workspace metadata |
| `chat` span (per LLM call) | ✅ (workbench tool-calling loop) | ✅ via SDK (bridged through `CopilotCliBridgeSpanProcessor`) | CLI `chat` spans are produced by `@github/copilot/sdk` and **forwarded as-is**; coverage depends on SDK version |
| `execute_tool` span | ✅ (workbench tool runner) | ✅ via SDK bridge | Same caveat |
| `execute_hook` span | ✅ (workbench hook runner) | ✅ via SDK bridge ([copilotCliBridgeSpanProcessor.ts](../../src/extension/chatSessions/copilotcli/node/copilotCliBridgeSpanProcessor.ts)) — remapped from SDK `hook *` spans with hook-input/output enrichment | OK |
| `subagent` span | ✅ | ✅ via SDK bridge | OK |
| `permission` span | n/a (no permission UI) | ✅ via SDK bridge | CLI-only |
| `user_message` event on `invoke_agent` | ✅ | ✅ | OK |
| `assistant.message` event | ✅ | ⚠️ | CLI emits `assistant.message` directly into the SDK session ([copilotcliSession.ts:2347](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L2347)); not all branches surface as OTel events on the parent span |
| `GenAiMetrics.incrementUserActionCount` (vote/copy/insert/apply) | ✅ ([userActions.ts](../../src/extension/conversation/vscode-node/userActions.ts)) | ❌ | Same root cause as the `panel.action.*` gap — CLI participant doesn't subscribe to user actions |
| `GenAiMetrics.incrementPullRequestCount` | n/a | ✅ ([copilotcliSession.ts:1347](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1347)) | CLI-only metric tied to `/create-pr` slash command |
| `emitInlineDoneEvent`, `emitEditFeedbackEvent`, `emitEditSurvivalEvent`, `emitEditHunkActionEvent`, `emitUserFeedbackEvent` | ✅ | ❌ | Same root cause — workbench-only `UserFeedbackService` |

**OTel summary:** Trace coverage of agent runs is roughly equivalent (both emit `invoke_agent` and child spans), but the **GenAI metrics and edit/feedback events** are missing for CLI for the same reason the product telemetry is missing — the CLI participant is not wired into `UserFeedbackService`. Closing the product-telemetry gaps below will close most of the OTel gaps as a side-effect because the two emit from the same code paths in `userActions.ts`.

> Memory note (existing): the responses-API path skips client-side `tool_search` deferral when `telemetryProperties.subType` starts with `subagent`. Subagent OTel spans share this gating; not specific to CLI vs workbench, but worth keeping in mind when interpreting subagent coverage.

---

## 5. Recommended fixes

Listed roughly in priority order. None are implemented in this branch — this is an audit-only deliverable.

### P0 — Tool / permission visibility (CLI)

1. **Emit a CLI-side tool-invocation event.** Add a `copilotcli.tool.invoke` (or wire the SDK tool-execution bridge to fire workbench `chat.tools.languageModelToolInvoked`-shaped data) so we can compare per-tool success rate, latency, and result-size across surfaces. The OTel `execute_tool` bridge in [CopilotCliBridgeSpanProcessor](../../src/extension/chatSessions/copilotcli/node/copilotCliBridgeSpanProcessor.ts) already has access to all the data needed; mirror it as a `publicLog2` send when the bridge processes a tool span.
2. **Emit a permission-decision event.** From [permissionHelpers.ts](../../src/extension/chatSessions/copilotcli/node/permissionHelpers.ts) emit a single `copilotcli.permission.decision` event with `kind` (`read|write|shell|mcp`), `outcome` (`allow|deny|always|never`), `auto` (whether handled silently), and `toolName`/`server` (no payload content). This is required for both product analysis and abuse-monitoring parity.
3. **Emit error/failure events.** From [copilotcliSession.ts](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts) error paths (auth failure, SDK error, MCP failure, model fallback) emit a `copilotcli.session.error` event with `errorKind`, `recoveryAction`, `modelId`. Today the only failure visibility is OTel spans, which are off by default.

### P1 — Wire CLI participant into `UserFeedbackService`

4. **Subscribe `onDidPerformAction` and `onDidReceiveFeedback` for the CLI participant.** In [copilotCLIChatSessions.ts](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts) (or equivalent registration site), call `userFeedbackService.handleUserAction(e, participantId)` and `handleFeedback`. This single change will close:
    - `panel.action.copy / insert / followup / vote` (product)
    - `panel.edit.feedback` MSFT/GH/Internal (product)
    - `interactiveSessionDone` (product)
    - `GenAiMetrics.incrementUserActionCount` and edit/feedback OTel events (OTel)

   Be careful with `participantId` — the CLI participant ID and `agentId` should be passed through so dashboards can split by surface.

### P1 — Rate-limit and model-fallback parity

5. **Mirror `chatRateLimitAction` for CLI.** Wherever the CLI session handles HTTP 429 / model-fallback (search [copilotcliSession.ts](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts) for model-switch / `setModel` / capacity errors), emit the same `chatRateLimitAction` event used in [chatParticipants.ts:224](../../src/extension/conversation/vscode-node/chatParticipants.ts#L224) so that capacity dashboards include CLI traffic.

### P2 — Richer lifecycle and command coverage

6. **Session lifecycle events (both surfaces).** Add `chat.session.created` / `chat.session.disposed` (workbench layer) with `sessionType`, `agent`, `forkedFrom?`, `resumed?`. Both surfaces lack this; closing it once at the workbench layer covers everything.
7. **CLI slash-command coverage.** Extend `copilotcli.chat.invoke` (or add `copilotcli.slashCommand.invoke`) to capture `command` for the full `/commit /sync /merge /create-pr /create-draft-pr /update-pr /plan /fleet /compact` set, not just `hasDelegatePrompt`.
8. **Plan / fleet / autopilot transitions.** From [exitPlanModeHandler.ts](../../src/extension/chatSessions/copilotcli/node/exitPlanModeHandler.ts) emit `copilotcli.planmode.exit` with the chosen option (`autopilot|interactive|exit-only|autopilot-fleet`) and `hasSavedPlanChanges`.

### P2 — Documentation

9. Document the surface split in `agent_monitoring.md` so consumers know which events to filter by `sessionType`. Add a small section per gap to that doc as fixes land.

### Implementation hints

- `IChatTelemetryService` does not exist as a separate service today; the workbench helper to reuse is `ChatServiceTelemetry` ([chatServiceTelemetry.ts](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts)). For CLI-specific events, follow the existing `copilotcli.*` naming convention and use `telemetryService.sendMSFTTelemetryEvent` (the [copilotCLIChatSessions.ts](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts#L737) pattern).
- The `sessionType` field added to `interactiveSessionProviderInvoked` ([chatServiceTelemetry.ts:309](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L309)) is the canonical splitter — every new shared event should include it. Existing shared user-action events (`interactiveSessionVote/Copy/Insert/Apply/RunInTerminal`) currently do **not** carry `sessionType`; consider adding it as a tracked side-fix so dashboards can split by surface without joining on `chatSessionId`.
- For OTel side-fixes, prefer extending [genAiEvents.ts](../../src/platform/otel/common/genAiEvents.ts) and [genAiMetrics.ts](../../src/platform/otel/common/genAiMetrics.ts) emission paths that already carry the right attributes, rather than adding new ones.

---

## 6. Verification sources

- **Workbench inventory** — produced by full grep over `extensions/copilot/src/` and `src/vs/workbench/contrib/chat/` for `publicLog2<`, `publicLog(`, `sendMSFTTelemetryEvent`, `sendGHTelemetryEvent`, `sendInternalMSFTTelemetryEvent`, `__GDPR__`. Cross-checked against `ChatServiceTelemetry`, `LanguageModelToolsService`, `ChatModelPicker`, `ChatWidget`, and the `extensions/copilot/src/extension/conversation/vscode-node/` participant glue.
- **CLI inventory** — full grep over `extensions/copilot/src/extension/chatSessions/copilotcli/` and `extensions/copilot/src/extension/chatSessions/vscode-node/`, plus inspection of [AGENTS.md](../../src/extension/chatSessions/copilotcli/AGENTS.md), [copilotcliSession.ts](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts), [copilotcliSessionService.ts](../../src/extension/chatSessions/copilotcli/node/copilotcliSessionService.ts), [permissionHelpers.ts](../../src/extension/chatSessions/copilotcli/node/permissionHelpers.ts), [exitPlanModeHandler.ts](../../src/extension/chatSessions/copilotcli/node/exitPlanModeHandler.ts), and the bridge processor.
- **Layer-A vs Layer-B routing** — confirmed via `ChatServiceImpl._sendRequestAsync` ([chatServiceImpl.ts:1031](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L1031)) and the absence of `onDidPerformAction` / `onDidReceiveFeedback` subscriptions in `extensions/copilot/src/extension/chatSessions/`.
