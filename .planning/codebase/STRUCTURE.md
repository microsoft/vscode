# Codebase Structure — Agent Host Subsystem

**Analysis Date:** 2026-05-27

Scope: this document covers ONLY the agent host subsystem of this VS Code fork. The rest of `src/vs` is intentionally out of scope.

## 1. Top-level layout under `src/vs/platform/agentHost/`

```
src/vs/platform/agentHost/
├── common/             # Cross-target contracts, schemas, URIs, config keys
├── browser/            # Renderer-side helpers (no Node deps)
├── node/               # Agent-host utility-process entry points + harnesses
│   ├── claude/         # Anthropic Claude harness (opt-in)
│   │   └── clientTools/    # In-process MCP server exposing client tools to Claude
│   ├── copilot/        # GitHub Copilot harness (always registered)
│   ├── shared/         # Shared Node services (copilot API, file edit tracker, plugin bundler)
│   └── otel/           # OpenTelemetry exporter wiring
├── electron-main/      # Desktop main-process starter
├── electron-browser/   # IPC channel transport + null providers used in renderer
└── test/               # Unit tests mirroring browser/common/electron-browser/node
```

**`common/`** — protocol-neutral contracts. Key files: [`agent.ts`](../../src/vs/platform/agentHost/common/agent.ts), [`agentService.ts`](../../src/vs/platform/agentHost/common/agentService.ts) (carries `AgentHostClaudeSdkPathEnvVar` and `AgentHostClaudeAgentSdkPathSettingId`), [`agentHostSchema.ts`](../../src/vs/platform/agentHost/common/agentHostSchema.ts), [`agentHostUri.ts`](../../src/vs/platform/agentHost/common/agentHostUri.ts), [`agentHostCustomizationConfig.ts`](../../src/vs/platform/agentHost/common/agentHostCustomizationConfig.ts), [`remoteAgentHostService.ts`](../../src/vs/platform/agentHost/common/remoteAgentHostService.ts).

**`browser/`** — renderer-side wiring. Key files: [`localAgentHostService.ts`](../../src/vs/platform/agentHost/browser/localAgentHostService.ts), [`remoteAgentHostService.ts`](../../src/vs/platform/agentHost/browser/remoteAgentHostService.ts), [`sshRemoteAgentHostService.ts`](../../src/vs/platform/agentHost/browser/sshRemoteAgentHostService.ts) plus relay transports `sshRelayTransport.ts` / `tunnelRelayTransport.ts`.

**`node/`** — utility-process entry points and all server-side state. Top-level files include [`agentHostMain.ts`](../../src/vs/platform/agentHost/node/agentHostMain.ts) (utility-process bootstrap), [`agentHostServerMain.ts`](../../src/vs/platform/agentHost/node/agentHostServerMain.ts) (standalone server), [`agentService.ts`](../../src/vs/platform/agentHost/node/agentService.ts) (`AgentService` impl), [`agentHostStateManager.ts`](../../src/vs/platform/agentHost/node/agentHostStateManager.ts), [`sessionDatabase.ts`](../../src/vs/platform/agentHost/node/sessionDatabase.ts), [`agentHostCheckpointService.ts`](../../src/vs/platform/agentHost/node/agentHostCheckpointService.ts), [`agentHostTerminalManager.ts`](../../src/vs/platform/agentHost/node/agentHostTerminalManager.ts), [`agentHostFileMonitorService.ts`](../../src/vs/platform/agentHost/node/agentHostFileMonitorService.ts), [`nodeAgentHostStarter.ts`](../../src/vs/platform/agentHost/node/nodeAgentHostStarter.ts).

**`node/claude/`** — Anthropic Claude harness. Opt-in via the SDK-path env var (see §2). Contains the SDK loader, mapper, replay, subagent + prompt-queue infrastructure, and `clientTools/`.

**`node/copilot/`** — GitHub Copilot harness. Always registered when the agent host boots.

**`node/shared/`** — services shared between harnesses: [`copilotApiService.ts`](../../src/vs/platform/agentHost/node/shared/copilotApiService.ts), [`fileEditTracker.ts`](../../src/vs/platform/agentHost/node/shared/fileEditTracker.ts), [`sessionPluginBundler.ts`](../../src/vs/platform/agentHost/node/shared/sessionPluginBundler.ts).

**`node/otel/`** — [`agentHostOTelService.ts`](../../src/vs/platform/agentHost/node/otel/agentHostOTelService.ts), the host-side OTel collector wiring (see also [`OTEL.md`](../../src/vs/platform/agentHost/OTEL.md)).

**`node/claude/clientTools/`** — in-process MCP server exposing workbench-backed tools to the Claude SDK. Files: [`claudeClientToolMcpServer.ts`](../../src/vs/platform/agentHost/node/claude/clientTools/claudeClientToolMcpServer.ts), [`claudeClientToolResult.ts`](../../src/vs/platform/agentHost/node/claude/clientTools/claudeClientToolResult.ts), [`claudeJsonSchemaToZod.ts`](../../src/vs/platform/agentHost/node/claude/clientTools/claudeJsonSchemaToZod.ts), [`claudeSessionClientToolsModel.ts`](../../src/vs/platform/agentHost/node/claude/clientTools/claudeSessionClientToolsModel.ts).

**`electron-main/`** — single file [`electronAgentHostStarter.ts`](../../src/vs/platform/agentHost/electron-main/electronAgentHostStarter.ts): spawns the utility process and forwards `chat.agentHost.claudeAgent.path` as `VSCODE_AGENT_HOST_CLAUDE_SDK_PATH` (see [`electronAgentHostStarter.ts:75`](../../src/vs/platform/agentHost/electron-main/electronAgentHostStarter.ts#L75) / [`:110`](../../src/vs/platform/agentHost/electron-main/electronAgentHostStarter.ts#L110)).

**`electron-browser/`** — IPC plumbing into the utility process: [`agentHostIpcChannelTransport.ts`](../../src/vs/platform/agentHost/electron-browser/agentHostIpcChannelTransport.ts), [`remoteAgentHostProtocolClient.ts`](../../src/vs/platform/agentHost/electron-browser/remoteAgentHostProtocolClient.ts), [`remoteAgentHostServiceImpl.ts`](../../src/vs/platform/agentHost/electron-browser/remoteAgentHostServiceImpl.ts), null providers for non-electron contexts.

**`test/`** — mirror tree (`browser/`, `common/`, `electron-browser/`, `node/`) holding unit tests for the corresponding source folders.

## 2. Where to register a new agent harness

All providers are registered inside `AgentService` from the utility-process bootstrap in [`agentHostMain.ts`](../../src/vs/platform/agentHost/node/agentHostMain.ts).

The two existing registrations are at:

- [`src/vs/platform/agentHost/node/agentHostMain.ts:167`](../../src/vs/platform/agentHost/node/agentHostMain.ts#L167) — `agentService.registerProvider(instantiationService.createInstance(CopilotAgent));` (unconditional).
- [`src/vs/platform/agentHost/node/agentHostMain.ts:174`](../../src/vs/platform/agentHost/node/agentHostMain.ts#L174) — `agentService.registerProvider(instantiationService.createInstance(ClaudeAgent));`, gated on `process.env[AgentHostClaudeSdkPathEnvVar]`.

**Convention for opt-in providers:**

1. Export a `*SdkPathEnvVar` constant from [`common/agentService.ts:79`](../../src/vs/platform/agentHost/common/agentService.ts#L79) (e.g. `AgentHostClaudeSdkPathEnvVar = 'VSCODE_AGENT_HOST_CLAUDE_SDK_PATH'`) and a paired settings id `chat.agentHost.<provider>Agent.path` (see [`common/agentService.ts:69`](../../src/vs/platform/agentHost/common/agentService.ts#L69)).
2. Read the workbench setting in the starter and forward it as the env var when spawning the utility process: see [`nodeAgentHostStarter.ts:83`](../../src/vs/platform/agentHost/node/nodeAgentHostStarter.ts#L83) / [`:86`](../../src/vs/platform/agentHost/node/nodeAgentHostStarter.ts#L86) and [`electronAgentHostStarter.ts:110`](../../src/vs/platform/agentHost/electron-main/electronAgentHostStarter.ts#L110). The standalone server reads the same env var / CLI arg in [`agentHostServerMain.ts:107`](../../src/vs/platform/agentHost/node/agentHostServerMain.ts#L107).
3. In `agentHostMain.ts`, gate `agentService.registerProvider(...)` on `process.env[<YourSdkPathEnvVar>]` (mirror line 173–175).
4. Inside the SDK loader, read the env var (e.g. [`claudeAgentSdkService.ts:173`](../../src/vs/platform/agentHost/node/claude/claudeAgentSdkService.ts#L173)–[`:179`](../../src/vs/platform/agentHost/node/claude/claudeAgentSdkService.ts#L179)) so that an unset env var produces a single actionable error referencing the setting id.

The SDK package itself is intentionally not bundled — the env var holds an absolute path to a locally installed harness SDK.

## 3. Per-harness file layout

### Claude — [`src/vs/platform/agentHost/node/claude/`](../../src/vs/platform/agentHost/node/claude/)

| File | Responsibility |
|------|----------------|
| [`claudeAgent.ts:138`](../../src/vs/platform/agentHost/node/claude/claudeAgent.ts#L138) | `ClaudeAgent` — `IAgent` implementation registered with `AgentService` |
| [`claudeAgentSession.ts:68`](../../src/vs/platform/agentHost/node/claude/claudeAgentSession.ts#L68) | `ClaudeAgentSession` — per-session lifecycle owner (post-Phase 10.5 split out of `ClaudeAgent`) |
| [`claudeAgentSdkService.ts:173`](../../src/vs/platform/agentHost/node/claude/claudeAgentSdkService.ts#L173) | Dynamic SDK loader — reads `AgentHostClaudeSdkPathEnvVar` and imports the user-supplied `@anthropic-ai/claude-agent-sdk` |
| [`claudeSdkPipeline.ts:63`](../../src/vs/platform/agentHost/node/claude/claudeSdkPipeline.ts#L63) | `ClaudeSdkPipeline` — long-lived SDK loop driving streaming requests/responses |
| [`claudeSdkMessageRouter.ts:31`](../../src/vs/platform/agentHost/node/claude/claudeSdkMessageRouter.ts#L31) | `ClaudeSdkMessageRouter` — fan-out of SDK messages to per-session consumers |
| [`claudeMapSessionEvents.ts:214`](../../src/vs/platform/agentHost/node/claude/claudeMapSessionEvents.ts#L214) | `mapSDKMessageToAgentSignals` + `ClaudeMapperState` ([`:47`](../../src/vs/platform/agentHost/node/claude/claudeMapSessionEvents.ts#L47)) — translate SDK events into `SessionAction`s |
| [`claudeReplayMapper.ts:43`](../../src/vs/platform/agentHost/node/claude/claudeReplayMapper.ts#L43) | `mapSessionMessagesToTurns` — transcript replay used by `getSessionMessages` |
| [`claudePromptQueue.ts:46`](../../src/vs/platform/agentHost/node/claude/claudePromptQueue.ts#L46) | `ClaudePromptQueue` — steering / interrupt queue for user prompts |
| [`claudePromptResolver.ts`](../../src/vs/platform/agentHost/node/claude/claudePromptResolver.ts) | Resolves user prompt strings/attachments into SDK content blocks |
| [`claudeProxyService.ts:134`](../../src/vs/platform/agentHost/node/claude/claudeProxyService.ts#L134) | `ClaudeProxyService` — auth + proxy injection for SDK HTTP calls |
| [`claudeProxyAuth.ts`](../../src/vs/platform/agentHost/node/claude/claudeProxyAuth.ts) | Auth token plumbing consumed by the proxy service |
| [`claudeSubagentRegistry.ts:123`](../../src/vs/platform/agentHost/node/claude/claudeSubagentRegistry.ts#L123) | `SubagentRegistry` — tracks subagent spawns + `SubagentSpawn` ([`:53`](../../src/vs/platform/agentHost/node/claude/claudeSubagentRegistry.ts#L53)) |
| [`claudeSubagentResolver.ts:48`](../../src/vs/platform/agentHost/node/claude/claudeSubagentResolver.ts#L48) | Strategies (`TextSuffixStrategy`, `PromptMatchStrategy`, `NativeStrategy`) for routing tool calls to subagents |
| [`claudeSubagentSignals.ts:83`](../../src/vs/platform/agentHost/node/claude/claudeSubagentSignals.ts#L83) | Mapping helpers for subagent system/assistant messages |
| [`claudeSessionMetadataStore.ts`](../../src/vs/platform/agentHost/node/claude/claudeSessionMetadataStore.ts) | Persisted per-session Claude metadata |
| [`claudeSessionPermissionMode.ts`](../../src/vs/platform/agentHost/node/claude/claudeSessionPermissionMode.ts) | Per-session permission-mode state machine |
| [`claudeCanUseTool.ts`](../../src/vs/platform/agentHost/node/claude/claudeCanUseTool.ts) | `canUseTool` callback handed to the SDK |
| [`claudeFileEditObserver.ts`](../../src/vs/platform/agentHost/node/claude/claudeFileEditObserver.ts) | Tracks file edits emitted via Claude file-edit tools |
| [`claudeToolCallRegistry.ts`](../../src/vs/platform/agentHost/node/claude/claudeToolCallRegistry.ts) | In-flight tool-call bookkeeping keyed by SDK tool-use id |
| [`claudeToolDisplay.ts:148`](../../src/vs/platform/agentHost/node/claude/claudeToolDisplay.ts#L148) | Display-name / kind / invocation-message helpers for Claude built-in tools |
| [`claudeInteractiveTools.ts:32`](../../src/vs/platform/agentHost/node/claude/claudeInteractiveTools.ts#L32) | `exit_plan_mode` + `ask_user_question` interactive-tool builders |
| [`claudeSdkOptions.ts`](../../src/vs/platform/agentHost/node/claude/claudeSdkOptions.ts) | Constructs the SDK options object per session |
| [`claudeModelId.ts`](../../src/vs/platform/agentHost/node/claude/claudeModelId.ts) | Model-id normalization |
| [`anthropicBetas.ts`](../../src/vs/platform/agentHost/node/claude/anthropicBetas.ts) / [`anthropicErrors.ts`](../../src/vs/platform/agentHost/node/claude/anthropicErrors.ts) | Beta-header set and SDK error taxonomy |
| [`clientTools/`](../../src/vs/platform/agentHost/node/claude/clientTools/) | In-process MCP server exposing workbench client tools to the SDK |

### Copilot — [`src/vs/platform/agentHost/node/copilot/`](../../src/vs/platform/agentHost/node/copilot/)

| File | Responsibility |
|------|----------------|
| [`copilotAgent.ts:233`](../../src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L233) | `CopilotAgent` — `IAgent` implementation; registered unconditionally |
| [`copilotAgentSession.ts:304`](../../src/vs/platform/agentHost/node/copilot/copilotAgentSession.ts#L304) | `CopilotAgentSession` — per-session lifecycle for Copilot turns |
| [`copilotSessionWrapper.ts`](../../src/vs/platform/agentHost/node/copilot/copilotSessionWrapper.ts) | Thin wrapper over the Copilot session API exposed to `CopilotAgent` |
| [`mapSessionEvents.ts:232`](../../src/vs/platform/agentHost/node/copilot/mapSessionEvents.ts#L232) | `mapSessionEvents` + `ISessionEvent` union — Copilot SDK events → `SessionAction` |
| [`copilotToolDisplay.ts:423`](../../src/vs/platform/agentHost/node/copilot/copilotToolDisplay.ts#L423) | Tool display-name / kind / invocation-message helpers |
| [`copilotPluginConverters.ts`](../../src/vs/platform/agentHost/node/copilot/copilotPluginConverters.ts) | Convert workbench plugin/MCP descriptors into Copilot SDK shapes |
| [`copilotShellTools.ts`](../../src/vs/platform/agentHost/node/copilot/copilotShellTools.ts) | Shell-tool helpers (parameter shaping, output capture) |
| [`copilotSlashCommandCompletionProvider.ts:76`](../../src/vs/platform/agentHost/node/copilot/copilotSlashCommandCompletionProvider.ts#L76) | Slash-command completion provider for the chat input |
| [`copilotGitProject.ts`](../../src/vs/platform/agentHost/node/copilot/copilotGitProject.ts) | Git project descriptor handed to Copilot SDK |
| [`agentHostSandboxEngine.ts:110`](../../src/vs/platform/agentHost/node/copilot/agentHostSandboxEngine.ts#L110) | `createAgentHostSandboxEngine` — sandbox runtime for Copilot terminal calls |
| [`sessionCustomizationDiscovery.ts:85`](../../src/vs/platform/agentHost/node/copilot/sessionCustomizationDiscovery.ts#L85) | `SessionCustomizationDiscovery` — discovers per-session customization bundles |
| [`pendingEditContentStore.ts:25`](../../src/vs/platform/agentHost/node/copilot/pendingEditContentStore.ts#L25) | `vscode-pending-edit` URI scheme provider for in-flight edits |

## 4. Workbench-side glue — `src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/`

This folder adapts the agent host's `SessionState` model into the chat widget's `IChatProgress` / `IChatSessionContentProvider` contracts.

| File | Role |
|------|------|
| [`agentHostSessionHandler.ts:373`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts#L373) | `AgentHostSessionHandler implements IChatSessionContentProvider` — main bridge between an agent host session and the chat view |
| [`stateToProgressAdapter.ts`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.ts) | Pure functions turning `SessionState` (turns, tool calls, attachments) into `IChatProgress`. Entry points: `turnsToHistory` ([`:137`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.ts#L137)), `activeTurnToProgress` ([`:323`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.ts#L323)), `completedToolCallToSerialized` ([`:435`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.ts#L435)), `toolCallStateToInvocation` ([`:759`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.ts#L759)), `finalizeToolInvocation` ([`:935`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.ts#L935)) |
| [`agentHostSnapshotController.ts:54`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSnapshotController.ts#L54) | `AgentHostSnapshotController implements IChatEditingSession` — drives editing snapshots from agent host file-edit signals |
| [`agentHostActiveClientService.ts:56`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.ts#L56) | `AgentHostActiveClientService` — tracks the currently-active agent host client per chat session |
| [`agentHostChatInputPicker.ts:184`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostChatInputPicker.ts#L184) | Chat-input picker base + [`agentHostChatInputPicker.contribution.ts`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostChatInputPicker.contribution.ts) registers it |
| [`agentHostCustomAgentPicker.ts:81`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCustomAgentPicker.ts#L81) | Picker action-view item for choosing a custom (sub)agent |
| [`agentHostChatContribution.ts`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostChatContribution.ts) | Workbench contribution that wires the session handler, snapshot controller, and active-client service into the chat view |
| [`agentHostPermissionUiContribution.ts`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostPermissionUiContribution.ts) | UI prompts for permission requests |
| [`agentHostSessionListController.ts`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionListController.ts) | Owns the rendered list of sessions |
| [`agentHostLanguageModelProvider.ts`](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.ts) | Exposes agent host model picks to the chat language-model API |

Data flow: `AgentHostSessionHandler` subscribes to `SessionState` from a remote/local agent host client, runs deltas through `stateToProgressAdapter` to emit `IChatProgress`, while `AgentHostSnapshotController` consumes the same state to drive `IChatEditingSession` snapshots.

## 5. Sessions window providers — `src/vs/sessions/contrib/providers/agentHost/browser/`

Picker entries and session-type metadata for the agents window are produced here.

| File | Role |
|------|------|
| [`baseAgentHostSessionsProvider.ts:941`](../../src/vs/sessions/contrib/providers/agentHost/browser/baseAgentHostSessionsProvider.ts#L941) | `BaseAgentHostSessionsProvider` — shared provider logic and the `_syncSessionTypesFromRootState` hook ([`:1162`](../../src/vs/sessions/contrib/providers/agentHost/browser/baseAgentHostSessionsProvider.ts#L1162)) that auto-derives picker entries from the registered agents reported by the host's `RootState` |
| [`localAgentHostSessionsProvider.ts:79`](../../src/vs/sessions/contrib/providers/agentHost/browser/localAgentHostSessionsProvider.ts#L79) | Local (in-process utility-process) provider; calls `_syncSessionTypesFromRootState` on every `RootState` change |
| [`localAgentHost.contribution.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/localAgentHost.contribution.ts) | Workbench contribution that registers the local provider |
| [`agentHostAgentPicker.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentHostAgentPicker.ts), [`agentHostModePicker.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentHostModePicker.ts), [`agentHostModelPicker.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentHostModelPicker.ts), [`agentHostClaudePermissionModePicker.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentHostClaudePermissionModePicker.ts) | Pickers for agent / mode / model / Claude permission-mode |
| [`agentHostPermissionPickerActionItem.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentHostPermissionPickerActionItem.ts), [`agentHostPermissionPickerDelegate.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentHostPermissionPickerDelegate.ts) | Permission picker UI |
| [`agentHostSettings.contribution.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentHostSettings.contribution.ts), [`agentHostSettingsFileSystemProvider.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentHostSettingsFileSystemProvider.ts), [`agentHostSettingsShared.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentHostSettingsShared.ts) | Per-session settings document + FS provider |
| [`agentSessionSettings.contribution.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentSessionSettings.contribution.ts), [`agentSessionSettingsFileSystemProvider.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentSessionSettingsFileSystemProvider.ts) | Session-level settings document |
| [`agentHostSessionConfigPicker.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentHostSessionConfigPicker.ts), [`agentHostSessionBranchActions.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentHostSessionBranchActions.ts), [`agentHostDiffs.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentHostDiffs.ts) | Per-session config / branch / diff UI |
| [`agentHostSkillButtons.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/agentHostSkillButtons.ts), [`exportDebugLogsAction.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/exportDebugLogsAction.ts), [`openSessionEventsFileActions.ts`](../../src/vs/sessions/contrib/providers/agentHost/browser/openSessionEventsFileActions.ts) | Miscellaneous actions/buttons surfaced in the sessions window |

> Note: the remote variant — `remoteAgentHostSessionsProvider.ts` — lives in a sibling folder, [`src/vs/sessions/contrib/providers/remoteAgentHost/browser/remoteAgentHostSessionsProvider.ts:391`](../../src/vs/sessions/contrib/providers/remoteAgentHost/browser/remoteAgentHostSessionsProvider.ts#L391), and reuses `BaseAgentHostSessionsProvider._syncSessionTypesFromRootState` via inheritance.

**`_syncSessionTypesFromRootState` ([`baseAgentHostSessionsProvider.ts:1162`](../../src/vs/sessions/contrib/providers/agentHost/browser/baseAgentHostSessionsProvider.ts#L1162))** is the single point where picker entries are auto-derived from the agent host's `RootState.registeredAgents`. Adding a new harness in §2 automatically surfaces it in the sessions window picker — no provider edits needed.

## 6. Naming conventions specific to the agent host

**Per-harness file naming** (inside `src/vs/platform/agentHost/node/<provider>/`):

- `<provider>Agent.ts` — `IAgent` implementation (e.g. [`claudeAgent.ts`](../../src/vs/platform/agentHost/node/claude/claudeAgent.ts), [`copilotAgent.ts`](../../src/vs/platform/agentHost/node/copilot/copilotAgent.ts)).
- `<provider>AgentSession.ts` — per-session lifecycle owner (e.g. [`claudeAgentSession.ts`](../../src/vs/platform/agentHost/node/claude/claudeAgentSession.ts), [`copilotAgentSession.ts`](../../src/vs/platform/agentHost/node/copilot/copilotAgentSession.ts)).
- `<provider>MapSessionEvents.ts` / `mapSessionEvents.ts` — SDK-event-to-`SessionAction` mapper (e.g. [`claudeMapSessionEvents.ts`](../../src/vs/platform/agentHost/node/claude/claudeMapSessionEvents.ts), [`copilot/mapSessionEvents.ts`](../../src/vs/platform/agentHost/node/copilot/mapSessionEvents.ts)).
- `<provider>ReplayMapper.ts` — transcript replay used by `getSessionMessages` (e.g. [`claudeReplayMapper.ts`](../../src/vs/platform/agentHost/node/claude/claudeReplayMapper.ts)).
- `<provider>ToolDisplay.ts` — display-name / kind / invocation-message helpers for built-in tools.

**Env var pattern:** `VSCODE_AGENT_HOST_<PROVIDER>_SDK_PATH` — declared in [`common/agentService.ts:79`](../../src/vs/platform/agentHost/common/agentService.ts#L79), e.g. `VSCODE_AGENT_HOST_CLAUDE_SDK_PATH`.

**Settings key pattern:** `chat.agentHost.<provider>Agent.path` — declared in [`common/agentService.ts:69`](../../src/vs/platform/agentHost/common/agentService.ts#L69), e.g. `chat.agentHost.claudeAgent.path`. The setting holds an absolute path to a locally-installed SDK package; the starters ([`nodeAgentHostStarter.ts:83`](../../src/vs/platform/agentHost/node/nodeAgentHostStarter.ts#L83), [`electronAgentHostStarter.ts:75`](../../src/vs/platform/agentHost/electron-main/electronAgentHostStarter.ts#L75)) read it and forward it as the matching env var.

---

*Structure analysis: 2026-05-27*
