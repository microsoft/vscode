# Agent Product Telemetry Parity Audit

**Audit branch:** `zhichli/agenttele`
**Date:** 2026-05-05
**Scope:** Compare **product telemetry** (`publicLog2` / GDPR-tagged events, plus Copilot extension `sendMSFTTelemetryEvent` / `sendGHTelemetryEvent` / `sendInternalMSFTTelemetryEvent`) emitted by:

- **Workbench Copilot Chat agent (agent mode)** — the default Copilot chat participants registered in [extensions/copilot/src/extension/conversation/vscode-node/chatParticipants.ts](../../src/extension/conversation/vscode-node/chatParticipants.ts) plus the workbench chat platform under [src/vs/workbench/contrib/chat/](../../../../src/vs/workbench/contrib/chat).
- **Copilot CLI agent** — the `targetChatSessionType: 'copilotcli'` integration under [extensions/copilot/src/extension/chatSessions/copilotcli/](../../src/extension/chatSessions/copilotcli) plus its participant glue in [extensions/copilot/src/extension/chatSessions/vscode-node/](../../src/extension/chatSessions/vscode-node).

OTel parity is covered in a lighter pass at the end. This document is read-only — no code changes are made; recommended fixes are listed in [§5 Recommended fixes](#5-recommended-fixes).

> **Bottom line:** The two surfaces share the **workbench-layer** chat events (request lifecycle, vote/copy/insert/apply, model picker, mode change). The CLI surface is **missing every Copilot-extension-layer product event** the workbench agent emits — most importantly tool-invocation telemetry, rate-limit telemetry, and the Copilot-mirrored user-action events (`panel.action.*`, `panel.edit.feedback`, `interactiveSessionDone`, `inline.trackEditSurvival`). The CLI also has **no error / failure telemetry** of its own.
>
> **Almost all of the fix work lives in this `vscode` repo**, not in `copilot-agent-runtime`. The runtime already emits the underlying signals as session events (`tool.execution_start/complete`, `permission.requested/completed`, `session.error` with rate-limit codes, `auto_mode_switch.*`, `model.call_failure`, etc.) — the gaps are about **subscribing** to those events in `extensions/copilot/src/extension/chatSessions/copilotcli/` and emitting `publicLog2` / `sendMSFTTelemetryEvent` from VS Code. Only a handful of nice-to-haves (e.g. richer permission-decision context) would benefit from runtime-side schema additions.

---

## 0. Ownership legend

Used in the tables and recommendations below.

| Tag | Meaning |
|---|---|
| **vscode** | Fix lives entirely in `microsoft/vscode` (this repo). The runtime already exposes the data via existing session events / SDK APIs; VS Code just needs to subscribe and emit product telemetry. |
| **runtime** | Fix lives in `github/copilot-agent-runtime` — a new session event field, schema change, or SDK API surface is required before VS Code can emit a parity event. |
| **both** | Coordinated change: runtime adds a new field / event, VS Code subscribes and emits product telemetry once the SDK ships the change. |
| **shared / workbench** | Fix lives in `microsoft/vscode` but in the workbench chat platform (`src/vs/workbench/contrib/chat/...`), benefitting both surfaces and any future agent integration. |

Key runtime evidence (so you can see why most fixes are vscode-only):

- Tool execution: [`tool.execution_start`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) and [`tool.execution_complete`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) carry `toolCallId`, `success`, `model`, `interactionId`, `result`, `error.{message,code}`, `toolTelemetry`, `turnId` — already consumed by [copilotcliSession.ts:1313,1341](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1313).
- Permissions: [`permission.requested`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) / [`permission.completed`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) cover `read | write | shell | mcp | url | memory | hook` and ship the decision result — already consumed by [copilotcliSession.ts:1119](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1119).
- Errors / rate-limit: [`session.error`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) carries `errorType` (`authentication | authorization | quota | rate_limit | context_limit | query`), the upstream `code` (`user_weekly_rate_limited`, `user_global_rate_limited`, etc.), and the `willTriggerAutoModeSwitch` flag — already consumed at [copilotcliSession.ts:1395](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1395).
- Auto model switch: [`auto_mode_switch.requested`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) / `auto_mode_switch.completed` exist; not consumed by VS Code today.
- Model failures: [`model.call_failure`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) with `durationMs`; not consumed.
- Subagents, plan-mode, compaction, schedules: [`subagent.{started,completed,failed,selected,deselected}`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts), [`exit_plan_mode.{requested,completed}`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts), [`session.{compaction_start,compaction_complete}`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) — all available.

### Worked example: repo / commit / diff telemetry (`request.repoInfo`)

A representative sanity-check of the “vscode-only” claim. The workbench Copilot agent emits a [`request.repoInfo`](../../src/extension/prompt/node/repoInfoTelemetry.ts#L171) event — sent as `sendEnhancedGHTelemetryEvent` always, and additionally as `sendInternalMSFTTelemetryEvent` for internal users — carrying:

- `remoteUrl`, `repoId`, `repoType` (`github | ado`), `headCommitHash`, `headBranchName`
- `fileRelativePaths`, `diffsJSON`, `result` (`success | filesChanged | diffTooLarge | noChanges | tooManyChanges | mergeBaseTooOld | virtualFileSystem | tooManyCommits`)
- Measurements: `workspaceFileCount`, `changedFileCount`, `diffSizeBytes`

It is instantiated by [`ChatTelemetryBuilder`](../../src/extension/prompt/node/chatParticipantTelemetry.ts#L260) and triggered from [`PanelChatTelemetry._sendInternalRequestTelemetryEvent`](../../src/extension/prompt/node/chatParticipantTelemetry.ts#L647) and [`ChatTelemetry.afterToolLoop`](../../src/extension/prompt/node/chatParticipantTelemetry.ts#L566) inside [`ChatParticipantRequestHandler`](../../src/extension/prompt/node/chatParticipantRequestHandler.ts#L57). The CLI agent does **not** go through `ChatParticipantRequestHandler` — it dispatches directly via [`copilotCLIChatSessions.handleRequestImpl`](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts#L798) — so today the CLI emits **no** `request.repoInfo` event. The same is true of the related workbench-only events `interactiveSessionRequest`, `interactiveSessionResponse`, `interactiveSessionMessage`, `panel.request`, and `toolCallDetailsInternal` defined in [chatParticipantTelemetry.ts](../../src/extension/prompt/node/chatParticipantTelemetry.ts) — they all fire only when `ChatParticipantRequestHandler` runs.

**Owner of the fix: vscode (no runtime SDK change).** [`RepoInfoTelemetry`](../../src/extension/prompt/node/repoInfoTelemetry.ts#L99) takes only workbench-side services — `ITelemetryService`, `IGitService`, `IGitDiffService`, `IGitExtensionService`, `IFileSystemService`, `IWorkspaceFileIndex`, `IConfigurationService`, `ICopilotTokenStore`. None of them touches the runtime SDK; the data comes from VS Code's local git extension API. The CLI session already injects `IGitService` and uses it for OTel attributes at [copilotcliSession.ts:969](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L969) (`resolveWorkspaceOTelMetadata(this._gitService)`). Closing this gap is a pure additive change inside VS Code: instantiate `RepoInfoTelemetry` per request in `copilotcliSession.handleRequest`, call `sendBeginTelemetryIfNeeded()` at the start and `sendEndTelemetry()` after the request settles. (Bonus: the `chat.advanced.debug.disableRepoInfoTelemetry` team-internal setting and the `keysToRemoveFromStandardTelemetry` PII gate in [telemetryData.ts:113](../../src/platform/telemetry/common/telemetryData.ts#L113) continue to apply unchanged.)

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

| Event | Workbench agent | CLI agent | Owner of any fix | Distinguishing field | Source |
|---|:---:|:---:|:---:|---|---|
| `interactiveSessionProviderInvoked` | ✅ | ✅ | — | `sessionType` (`local` vs `copilotcli`), `chatMode`, `agent`, `agentExtensionId` | [chatServiceTelemetry.ts:287](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L287) |
| `chat.pendingRequestChange` | ✅ | ✅ | — | `source` (sendRequest/cancel/etc.) | [chatServiceImpl.ts:759](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L759) |
| `chat.stopCancellationNoop` | ✅ | ✅ | — | `reason` | [chatServiceImpl.ts:1761](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L1761) |
| `interactiveSessionVote` | ✅ | ✅ | shared / workbench (add `sessionType`) | `agentId`, `direction` | [chatServiceTelemetry.ts:185](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L185) |
| `interactiveSessionCopy` | ✅ | ✅ | shared / workbench (add `sessionType`) | `agentId`, `copyKind` | [chatServiceTelemetry.ts:191](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L191) |
| `interactiveSessionInsert` | ✅ | ✅ | shared / workbench (add `sessionType`) | `agentId`, `newFile` | [chatServiceTelemetry.ts:197](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L197) |
| `interactiveSessionApply` | ✅ | ✅ | shared / workbench (add `sessionType`) | `agentId`, `codeMapper`, `editsProposed` | [chatServiceTelemetry.ts:203](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L203) |
| `interactiveSessionRunInTerminal` | ✅ | ✅ | shared / workbench (add `sessionType`) | `agentId`, `languageId` | [chatServiceTelemetry.ts:211](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L211) |
| `chatFollowupClicked` | ✅ | ⚠️ | — | CLI never produces followups, so the count is effectively always 0 | [chatServiceTelemetry.ts:221](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L221) |
| `chatEditHunk` | ✅ | ⚠️ | — | CLI's edits flow through the SDK and may not surface in workbench `chatEditing` infrastructure for all edit types | [chatServiceTelemetry.ts:236](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L236) |
| `chatFollowupsRetrieved` | ✅ | ⚠️ | — | Same — CLI rarely emits followups | [chatServiceTelemetry.ts:247](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L247) |
| `chat.tools.languageModelToolInvoked` | ✅ | ❌ | **vscode** (subscribe to `tool.execution_complete` from runtime — schema already complete) | **CLI tools run inside SDK; never go through `LanguageModelToolsService.invokeTool`** | [languageModelToolsService.ts:677,691](../../../../src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts#L677) |
| `askQuestionsToolInvoked` | ✅ | ❌ | — (CLI uses different elicitation flow) | Workbench AskQuestions tool only | [askQuestionsTool.ts:613](../../../../src/vs/workbench/contrib/chat/common/tools/builtinTools/askQuestionsTool.ts#L613) |
| `toolResultCompressed` | ✅ | ❌ | — (CLI compression happens inside SDK) | Workbench tool-result compressor only | [toolResultCompressorService.ts:148](../../../../src/vs/workbench/contrib/chat/browser/tools/toolResultCompressorService.ts#L148) |
| `chat.modelChange` | ✅ | ✅ | — | Picker fires for both | [chatModelPicker.ts:700](../../../../src/vs/workbench/contrib/chat/browser/widget/input/chatModelPicker.ts#L700) |
| `chat.modelPickerInteraction` | ✅ | ✅ | — | — | [chatModelPicker.ts:717](../../../../src/vs/workbench/contrib/chat/browser/widget/input/chatModelPicker.ts#L717) |
| `chat.modeChange` | ✅ | n/a | — | CLI surface has no mode toggle (no Ask/Agent/Edits) | [chatExecuteActions.ts:337](../../../../src/vs/workbench/contrib/chat/browser/actions/chatExecuteActions.ts#L337) |
| `chat.modelsAtStartup` | ✅ | ✅ | — | One snapshot per startup, includes both providers | [chatModelCountTelemetry.ts:69](../../../../src/vs/workbench/contrib/chat/browser/telemetry/chatModelCountTelemetry.ts#L69) |
| `chat.modelCreatedStats` | ✅ | ✅ | — | Per provider, including `copilotcli` | [chatModelCountTelemetry.ts:80](../../../../src/vs/workbench/contrib/chat/browser/telemetry/chatModelCountTelemetry.ts#L80) |
| `agentSessionOpened` | ✅* | ✅* | — | Fires when opened from the Agents window | [agentSessionsControl.ts:636](../../../../src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsControl.ts#L636) |
| `chat.thinkingStyleUsage` | ✅ | ⚠️ | — | Only emits when the SDK reports thinking content via the bridged stream | [chatWidget.ts:2312](../../../../src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts#L2312) |
| `chat.promptRun` | ✅ | ⚠️ | — | Fires for prompt-file invocations regardless of surface, but CLI rarely uses prompt files today | [chatWidget.ts:2356](../../../../src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts#L2356) |

### 2.2 Layer (B) — Copilot extension chat participants (workbench-only today)

These all live in `extensions/copilot/src/extension/conversation/vscode-node/` and are wired via `agent.onDidPerformAction` / `agent.onDidReceiveFeedback` on the **workbench** Copilot participants only. **None** of them fire for the CLI agent because [copilotCLIChatSessions.ts](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts) does not subscribe to those events.

All fixes in this layer are **vscode-only**: subscribe `onDidPerformAction` / `onDidReceiveFeedback` on the CLI participant and route to `userFeedbackService`. No runtime change is needed because the workbench layer hands these events to the participant via the `vscode.ChatParticipant` API regardless of session type.

| Event | Workbench agent | CLI agent | Owner of fix | Source |
|---|:---:|:---:|:---:|---|
| `panel.action.copy` (MSFT) | ✅ | ❌ | **vscode** | [userActions.ts:87](../../src/extension/conversation/vscode-node/userActions.ts#L87) |
| `panel.action.insert` (MSFT) | ✅ | ❌ | **vscode** | [userActions.ts:114](../../src/extension/conversation/vscode-node/userActions.ts#L114) |
| `panel.action.followup` (MSFT) | ✅ | ❌ | **vscode** | [userActions.ts:137](../../src/extension/conversation/vscode-node/userActions.ts#L137) |
| `panel.action.vote` (MSFT) | ✅ | ❌ | **vscode** | [userActions.ts:364](../../src/extension/conversation/vscode-node/userActions.ts#L364) |
| `panel.edit.feedback` (MSFT) | ✅ | ❌ | **vscode** | [userActions.ts:177](../../src/extension/conversation/vscode-node/userActions.ts#L177) |
| `panel.edit.feedback` (GH) | ✅ | ❌ | **vscode** | [userActions.ts:189](../../src/extension/conversation/vscode-node/userActions.ts#L189) |
| `panel.edit.feedback` (Internal MSFT) | ✅ | ❌ | **vscode** | [userActions.ts:202](../../src/extension/conversation/vscode-node/userActions.ts#L202) |
| `inline.done` (MSFT + GH) | ✅ | n/a | — | [userActions.ts:501,504](../../src/extension/conversation/vscode-node/userActions.ts#L501) |
| `interactiveSessionDone` (Internal MSFT) | ✅ | ❌ | **vscode** | [userActions.ts:511](../../src/extension/conversation/vscode-node/userActions.ts#L511) |
| `inline.trackEditSurvival` (MSFT + GH) | ✅ | n/a | — | [userActions.ts:569,576](../../src/extension/conversation/vscode-node/userActions.ts#L569) |
| `chatRateLimitAction` (MSFT) | ✅ | ❌ | **vscode** (subscribe to `session.error` with `errorType === 'rate_limit'` + `auto_mode_switch.*`) | [chatParticipants.ts:224,227,263](../../src/extension/conversation/vscode-node/chatParticipants.ts#L224) |
| `copilot.search.feedback` (MSFT) | ✅ | n/a | — | [feedbackReporter.ts:167](../../src/extension/conversation/vscode-node/feedbackReporter.ts#L167) |
| `languageModelAccess.*` (MSFT + Internal) | ✅ | n/a | — | [languageModelAccess.ts:482,606](../../src/extension/conversation/vscode-node/languageModelAccess.ts#L482) |

#### Layer (B) addendum — events emitted from `ChatParticipantRequestHandler`

The Copilot extension also fires a second cluster of product telemetry from [`ChatTelemetry`](../../src/extension/prompt/node/chatParticipantTelemetry.ts) / [`PanelChatTelemetry`](../../src/extension/prompt/node/chatParticipantTelemetry.ts#L580) / [`RepoInfoTelemetry`](../../src/extension/prompt/node/repoInfoTelemetry.ts) inside [`ChatParticipantRequestHandler`](../../src/extension/prompt/node/chatParticipantRequestHandler.ts#L57). The CLI agent dispatches via [`copilotCLIChatSessions.handleRequestImpl`](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts#L798) and never instantiates this handler, so **none** of these fire for CLI today.

| Event | Workbench agent | CLI agent | Owner of fix | Source |
|---|:---:|:---:|:---:|---|
| `request.repoInfo` (Enhanced GH + Internal MSFT) — `remoteUrl`, `repoId`, `repoType`, `headCommitHash`, `headBranchName`, `fileRelativePaths`, `diffsJSON`, `workspaceFileCount`, `changedFileCount`, `diffSizeBytes`, `result` | ✅ | ❌ | **vscode** — reuse [`RepoInfoTelemetry`](../../src/extension/prompt/node/repoInfoTelemetry.ts#L99) directly; CLI session already injects `IGitService` ([copilotcliSession.ts:805](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L805)) | [repoInfoTelemetry.ts:171](../../src/extension/prompt/node/repoInfoTelemetry.ts#L171) |
| `interactiveSessionRequest` (Internal MSFT) | ✅ | ❌ | **vscode** | [chatParticipantTelemetry.ts:881](../../src/extension/prompt/node/chatParticipantTelemetry.ts#L881) |
| `interactiveSessionMessage` (Internal MSFT) | ✅ | ❌ | **vscode** | [chatParticipantTelemetry.ts:629](../../src/extension/prompt/node/chatParticipantTelemetry.ts#L629) |
| `interactiveSessionResponse` (Internal MSFT) | ✅ | ❌ | **vscode** | [chatParticipantTelemetry.ts:805,1000](../../src/extension/prompt/node/chatParticipantTelemetry.ts#L805) |
| `panel.request` (MSFT) | ✅ | ❌ | **vscode** | [chatParticipantTelemetry.ts](../../src/extension/prompt/node/chatParticipantTelemetry.ts) |
| `toolCallDetailsInternal` (Internal MSFT) | ✅ | ❌ | **vscode** | [chatParticipantTelemetry.ts:553](../../src/extension/prompt/node/chatParticipantTelemetry.ts#L553) |

_None of the fixes above require a runtime SDK change._ Each event reads from VS Code-side state (git extension, conversation/turn objects, endpoint, prompt). The cleanest approach is to extract a small reusable helper from `chatParticipantTelemetry.ts` that takes the request, conversation, and endpoint and emits the cluster, then call it from both `ChatParticipantRequestHandler` (existing) and `copilotcliSession.handleRequest` (new). Until that refactor, instantiating `RepoInfoTelemetry` directly in the CLI session is a one-line win for the most valuable event in the cluster.

### 2.3 Layer (C) — Surface-specific events

| Event | Workbench agent | CLI agent | Owner of fix | Source / status |
|---|:---:|:---:|:---:|---|
| `copilotcli.chat.invoke` | n/a | ✅ | — | [copilotCLIChatSessions.ts:735](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts#L735) — `chatRequestId`, `hasChatSessionItem`, `isUntitled`, `hasDelegatePrompt` |
| `copilotcli.terminal.open` | n/a | ✅ | — | [copilotCLITerminalIntegration.ts:235](../../src/extension/chatSessions/vscode-node/copilotCLITerminalIntegration.ts#L235) — `sessionType`, `shell`, `terminalCreationMethod`, `location` |
| `chat.intentDetected` and other workbench-agent intent events under `extensions/copilot/src/extension/intents/` | ✅ | ❌ | — | not relevant to CLI |
| Session **create / open / fork / dispose** | (none) | (none) | **shared / workbench** | Neither surface emits product telemetry for session lifecycle. The runtime [`session.start`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) / [`session.shutdown`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) events are already exposed; emit from workbench `ChatServiceImpl` keyed on `sessionType` |
| Tool **permission request / grant / deny** | n/a (no permission UI) | ❌ | **vscode** (runtime already emits [`permission.requested`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) / `permission.completed` with kind + decision) | CLI permission flow ([permissionHelpers.ts](../../src/extension/chatSessions/copilotcli/node/permissionHelpers.ts)) is OTel-only today |
| Plan-mode / fleet / autopilot transitions | n/a | ❌ | **vscode** (runtime emits [`exit_plan_mode.requested/completed`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts), [`auto_mode_switch.requested/completed`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts)) | [exitPlanModeHandler.ts](../../src/extension/chatSessions/copilotcli/node/exitPlanModeHandler.ts) emits no product telemetry |
| Slash commands (`/commit`, `/sync`, `/merge`, `/create-pr`, `/update-pr`) | n/a | ❌ | **vscode** | These are VS Code-side built-in commands routed in [copilotcliSession.ts](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts); no per-command telemetry beyond the generic `copilotcli.chat.invoke` (which only flags `/delegate`) |
| Compaction (start / complete) | (none) | ❌ | **vscode** | Runtime emits [`session.compaction_start`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) / `session.compaction_complete` already |
| Subagent lifecycle | (workbench has its own subagent path) | ❌ | **vscode** | Runtime emits [`subagent.started/completed/failed/selected/deselected`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) already |
| Model call failure (per-call latency / error code) | partial via CAPI logs | ❌ | **vscode** | Runtime emits [`model.call_failure`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) with `durationMs` and `code` |

---

## 3. Parity gap summary

Each gap is tagged with the repo that owns the fix.

### 3.1 Critical gaps (CLI is missing important workbench events)

These are gaps where the workbench agent has telemetry that materially supports product or quality decisions and the CLI surface produces nothing equivalent.

1. **Tool invocation telemetry (`chat.tools.languageModelToolInvoked`)** — _**Owner: vscode.**_ Runtime already exposes [`tool.execution_start`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) and [`tool.execution_complete`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) (with `success`, `error.code`, `model`, `interactionId`, `turnId`, `toolTelemetry`). VS Code already subscribes for UI purposes at [copilotcliSession.ts:1313,1341](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1313); add a `publicLog2` send alongside. Without it we cannot answer: how often does the CLI agent call shell/file/search/MCP tools, pass/error rate, latency.
2. **Rate-limit signals (`chatRateLimitAction`)** — _**Owner: vscode.**_ Runtime emits [`session.error`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) with `errorType: "rate_limit"` plus the upstream `code` (`user_weekly_rate_limited`, `user_global_rate_limited`, `user_model_rate_limited`, …) and the `willTriggerAutoModeSwitch` flag, plus [`auto_mode_switch.requested/completed`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts). VS Code just needs to subscribe and call `sendMSFTTelemetryEvent('chatRateLimitAction', …)`.
3. **Error / failure telemetry** — _**Owner: vscode.**_ Runtime emits [`session.error`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) (with `errorType: authentication | authorization | quota | rate_limit | context_limit | query` and upstream `code`) and [`model.call_failure`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts). VS Code already listens at [copilotcliSession.ts:1395](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1395) but routes only to UI — add a product-telemetry send.
4. **Mirrored Copilot user-action events** — _**Owner: vscode.**_ `panel.action.copy / insert / followup / vote`, `panel.edit.feedback`, `interactiveSessionDone`. The shared workbench `interactiveSessionVote/Copy/Insert/Apply` events DO fire; but the Copilot-extension-layer mirrors carrying `participant`, `command`, `codeBlockIndex`, model context are missing for CLI. No runtime change needed — wire `agent.onDidPerformAction` / `onDidReceiveFeedback` on the CLI participant to `UserFeedbackService`.
5. **Permission flow** — _**Owner: vscode**_ (with optional **runtime** improvement). Runtime emits [`permission.requested`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) and [`permission.completed`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) covering `read | write | shell | mcp | url | memory | hook` with the decision result. VS Code already listens at [copilotcliSession.ts:1119](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1119); add a `copilotcli.permission.decision` `publicLog2` send. _Optional runtime add:_ explicit `auto: boolean` (whether the decision was made silently by an allowlist/policy) and `policySource` strings — useful for accurate "% auto-approved" metrics.
6. **Repo / commit / diff telemetry (`request.repoInfo` + `interactiveSessionMessage` / `interactiveSessionRequest` / `interactiveSessionResponse` / `panel.request` / `toolCallDetailsInternal`)** — _**Owner: vscode.**_ All of these fire only inside `ChatParticipantRequestHandler`, which the CLI session never invokes. Reuse [`RepoInfoTelemetry`](../../src/extension/prompt/node/repoInfoTelemetry.ts#L99) directly from `copilotcliSession.handleRequest` (it already injects `IGitService`); over time, extract a shared per-request telemetry helper from `chatParticipantTelemetry.ts` and call it from both handlers. **No runtime SDK change** — all data comes from the local git extension, the conversation, and the endpoint, all VS Code-side.

### 3.2 Moderate gaps

6. **Session lifecycle events** — _**Owner: shared / workbench.**_ Runtime exposes [`session.start`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts), [`session.resume`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts), [`session.shutdown`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts), [`session.handoff`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts), [`session.idle`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts), [`session.title_changed`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts). Add a workbench-layer `chat.session.created/disposed` carrying `sessionType` so both surfaces get covered uniformly.
7. **Slash-command telemetry** — _**Owner: vscode.**_ Workbench tracks slash-command via `interactiveSessionProviderInvoked.slashCommand`. CLI's richer set (`/commit`, `/sync`, `/merge`, `/create-pr`, `/create-draft-pr`, `/update-pr`, `/delegate`, `/plan`, `/fleet`, `/compact`) is dispatched in VS Code's [copilotcliSession.ts](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts) but only `/delegate` is captured in `copilotcli.chat.invoke.hasDelegatePrompt`. Pure VS Code-side fix.
8. **Plan / fleet / autopilot mode transitions** — _**Owner: vscode.**_ Runtime emits [`exit_plan_mode.requested/completed`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) and [`auto_mode_switch.requested/completed`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts). Subscribe in [exitPlanModeHandler.ts](../../src/extension/chatSessions/copilotcli/node/exitPlanModeHandler.ts) (and the auto-mode handler) and emit `copilotcli.planmode.exit` / `copilotcli.autoModeSwitch`.
9. **Subagent telemetry** — _**Owner: vscode.**_ Runtime emits [`subagent.started/completed/failed/selected/deselected`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) with `durationMs`. Already partially consumed at [copilotcliSession.ts:1410](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1410); add product-telemetry send.
10. **Compaction telemetry** — _**Owner: vscode.**_ Runtime emits [`session.compaction_start/complete`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts). Useful for measuring context-pressure rate. Pure VS Code subscribe-and-emit.

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

### Quick split: where the work lands

| # | Fix | Repo | Notes |
|---|---|:---:|---|
| 1 | CLI tool-invocation telemetry | **vscode** | Subscribe to existing runtime [`tool.execution_complete`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) |
| 2 | CLI permission-decision telemetry | **vscode** | Subscribe to existing runtime [`permission.requested/completed`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) |
| 2a | (optional) Add `auto`/`policySource` to permission.completed | **runtime** | Schema enrichment; only if accurate auto-approval rate matters |
| 3 | CLI error / failure telemetry | **vscode** | Subscribe to existing runtime [`session.error`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) + [`model.call_failure`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) |
| 4 | Wire CLI participant into `UserFeedbackService` | **vscode** | No runtime change — workbench API already supplies events |
| 5 | `chatRateLimitAction` for CLI | **vscode** | Subscribe to runtime [`session.error` (rate_limit)](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) and [`auto_mode_switch.*`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) |
| 6 | Repo / commit / diff telemetry (`request.repoInfo` + chatParticipantTelemetry events) | **vscode** | Reuse existing `RepoInfoTelemetry` and chat telemetry helpers; runtime not involved |
| 7 | Session lifecycle events | **shared / workbench** | Workbench-layer addition; benefits CLI + future agents |
| 8 | CLI slash-command coverage | **vscode** | Slash commands are dispatched by VS Code |
| 9 | Plan / fleet / autopilot transitions | **vscode** | Subscribe to runtime [`exit_plan_mode.*`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) + [`auto_mode_switch.*`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) |
| 10 | Subagent telemetry for CLI | **vscode** | Subscribe to runtime [`subagent.*`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) |
| 11 | Compaction telemetry | **vscode** | Subscribe to runtime [`session.compaction_*`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) |
| 12 | Documentation | **vscode** | Update `agent_monitoring.md` |

Net-net: **11 of 12 fixes are vscode-only**. Only fix 2a (optional permission schema enrichment) needs runtime work, and fix 7 sits in the workbench chat platform.

### P0 — Tool / permission visibility (CLI) — **vscode**

1. **Emit a CLI-side tool-invocation event.** _Owner: vscode._ Add a `copilotcli.tool.invoke` event in [copilotcliSession.ts](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts) wherever `'tool.execution_complete'` is already handled (line 1341). The event payload comes directly from the runtime SDK schema — no runtime change needed. Carry: `toolName`, `success`, `errorCode`, `durationMs` (compute from `tool.execution_start`'s timestamp), `model`, `isUserRequested`, `interactionId`, `turnId`, plus `parentToolCallId` (for sub-agent attribution).
2. **Emit a permission-decision event.** _Owner: vscode._ From [copilotcliSession.ts:1119](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1119) (`'permission.requested'` handler) emit `copilotcli.permission.decision` carrying `kind` (`read|write|shell|mcp|url|memory|hook` — runtime already enumerates these), `outcome` (from the `permission.completed` event's `result`), and `toolName`/`server`. Do **not** include the requested path or shell command (PII).
   - **Optional runtime improvement (2a):** _Owner: runtime._ Add `auto: boolean` and `policySource: string` to the `permission.completed` schema so VS Code can distinguish silent-allowlist from interactive decisions without re-deriving it. Required only if dashboards must compare "% auto-approved" across surfaces.
3. **Emit error/failure events.** _Owner: vscode._ Extend the existing [copilotcliSession.ts:1395](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1395) handler to call `sendMSFTTelemetryEvent('copilotcli.session.error', { errorType, code, willTriggerAutoModeSwitch })`. Also subscribe to [`model.call_failure`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) for per-call latency/error data.

### P1 — Wire CLI participant into `UserFeedbackService` — **vscode**

4. **Subscribe `onDidPerformAction` and `onDidReceiveFeedback` for the CLI participant.** _Owner: vscode._ In [copilotCLIChatSessions.ts](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts) (or equivalent registration site), call `userFeedbackService.handleUserAction(e, participantId)` and `handleFeedback`. This single change will close:
    - `panel.action.copy / insert / followup / vote` (product)
    - `panel.edit.feedback` MSFT/GH/Internal (product)
    - `interactiveSessionDone` (product)
    - `GenAiMetrics.incrementUserActionCount` and edit/feedback OTel events (OTel)

   No runtime change. Be careful with `participantId` — the CLI participant ID and `agentId` should be passed through so dashboards can split by surface.

### P1 — Rate-limit and model-fallback parity — **vscode**

5. **Mirror `chatRateLimitAction` for CLI.** _Owner: vscode._ Subscribe to runtime [`session.error`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) where `errorType === 'rate_limit'` (the schema already exposes the upstream `code` and `willTriggerAutoModeSwitch` flag). Map to the same `chatRateLimitAction` event used in [chatParticipants.ts:224](../../src/extension/conversation/vscode-node/chatParticipants.ts#L224). Also subscribe to [`auto_mode_switch.completed`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) and emit `chatRateLimitAction` with `action: 'autoSwitch'`.

### P2 — Richer lifecycle and command coverage

6. **Session lifecycle events (both surfaces).** _Owner: shared / workbench._ Add `chat.session.created` / `chat.session.disposed` in workbench `ChatServiceImpl` carrying `sessionType`, `agent`, `forkedFrom?`, `resumed?`. Workbench-layer fix benefits both surfaces and future agents.
7. **CLI slash-command coverage.** _Owner: vscode._ Extend `copilotcli.chat.invoke` (or add `copilotcli.slashCommand.invoke`) in [copilotCLIChatSessions.ts](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts) to capture `command` for the full `/commit /sync /merge /create-pr /create-draft-pr /update-pr /plan /fleet /compact` set. Slash-command parsing already lives in VS Code.
8. **Plan / fleet / autopilot transitions.** _Owner: vscode._ Subscribe to runtime [`exit_plan_mode.completed`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) and [`auto_mode_switch.completed`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts). Emit `copilotcli.planmode.exit` with the chosen option (`autopilot|interactive|exit-only|autopilot-fleet`) and `hasSavedPlanChanges`.
9. **Subagent telemetry for CLI.** _Owner: vscode._ Extend the existing [copilotcliSession.ts:1410,1418](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts#L1410) subagent handlers to also emit `copilotcli.subagent.completed` with `agentName`, `success`, `durationMs`, `errorCode`.
10. **Compaction telemetry.** _Owner: vscode._ Subscribe to runtime [`session.compaction_start/complete`](../../../../../copilot-agent-runtime/src/core/sessionEvent.ts) and emit `copilotcli.compaction` with the start/end token counts. Useful for context-pressure dashboards.

### P2 — Documentation

11. _Owner: vscode._ Document the surface split in [agent_monitoring.md](agent_monitoring.md) so consumers know which events to filter by `sessionType`. Add a small section per gap to that doc as fixes land.

### Implementation hints

- `IChatTelemetryService` does not exist as a separate service today; the workbench helper to reuse is `ChatServiceTelemetry` ([chatServiceTelemetry.ts](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts)). For CLI-specific events, follow the existing `copilotcli.*` naming convention and use `telemetryService.sendMSFTTelemetryEvent` (the [copilotCLIChatSessions.ts](../../src/extension/chatSessions/vscode-node/copilotCLIChatSessions.ts#L737) pattern).
- The `sessionType` field added to `interactiveSessionProviderInvoked` ([chatServiceTelemetry.ts:309](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceTelemetry.ts#L309)) is the canonical splitter — every new shared event should include it. Existing shared user-action events (`interactiveSessionVote/Copy/Insert/Apply/RunInTerminal`) currently do **not** carry `sessionType`; consider adding it as a tracked side-fix so dashboards can split by surface without joining on `chatSessionId`.
- For OTel side-fixes, prefer extending [genAiEvents.ts](../../src/platform/otel/common/genAiEvents.ts) and [genAiMetrics.ts](../../src/platform/otel/common/genAiMetrics.ts) emission paths that already carry the right attributes, rather than adding new ones.

---

## 6. Verification sources

- **Workbench inventory** — produced by full grep over `extensions/copilot/src/` and `src/vs/workbench/contrib/chat/` for `publicLog2<`, `publicLog(`, `sendMSFTTelemetryEvent`, `sendGHTelemetryEvent`, `sendInternalMSFTTelemetryEvent`, `__GDPR__`. Cross-checked against `ChatServiceTelemetry`, `LanguageModelToolsService`, `ChatModelPicker`, `ChatWidget`, and the `extensions/copilot/src/extension/conversation/vscode-node/` participant glue.
- **CLI inventory** — full grep over `extensions/copilot/src/extension/chatSessions/copilotcli/` and `extensions/copilot/src/extension/chatSessions/vscode-node/`, plus inspection of [AGENTS.md](../../src/extension/chatSessions/copilotcli/AGENTS.md), [copilotcliSession.ts](../../src/extension/chatSessions/copilotcli/node/copilotcliSession.ts), [copilotcliSessionService.ts](../../src/extension/chatSessions/copilotcli/node/copilotcliSessionService.ts), [permissionHelpers.ts](../../src/extension/chatSessions/copilotcli/node/permissionHelpers.ts), [exitPlanModeHandler.ts](../../src/extension/chatSessions/copilotcli/node/exitPlanModeHandler.ts), and the bridge processor.
- **Layer-A vs Layer-B routing** — confirmed via `ChatServiceImpl._sendRequestAsync` ([chatServiceImpl.ts:1031](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L1031)) and the absence of `onDidPerformAction` / `onDidReceiveFeedback` subscriptions in `extensions/copilot/src/extension/chatSessions/`.
