/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { type IObservable, observableValue } from '../../../../base/common/observable.js';
import { basename, dirname, isAbsolute, join, resolve, sep } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { createSchema, platformSessionSchema, schemaProperty, type SessionMode } from '../../common/agentHostSchema.js';
import { createPricingMetaFromBilling, normalizeCAPIBilling } from '../../common/agentModelPricing.js';
import { getReasoningEffortDescription, getReasoningEffortLabel } from '../../common/reasoningEffort.js';
import { AgentHostCodexAgentBinaryArgsEnvVar, AgentHostCodexAgentCodexHomeEnvVar, AgentHostCodexAgentSdkRootEnvVar, AgentSession, AgentSignal, IActiveClient, IAgent, IAgentChats, IAgentCreateChatForkSource, IAgentCreateChatResult, IAgentCreateChatOptions, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IMcpNotification, type AgentProvider } from '../../common/agentService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ActionType, isChatAction, type SessionAction, type ChatAction } from '../../common/state/sessionActions.js';
import type { ConfigSchema, ModelSelection, ProtectedResourceMetadata, ToolDefinition, AgentSelection } from '../../common/state/protocol/state.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { buildDefaultChatUri, parseChatUri, type ClientPluginCustomization, type MessageAttachment, type PendingMessage, type ChatInputAnswer, ChatInputResponseKind, type PolicyState, type ToolCallResult, ToolResultContentType, type Turn } from '../../common/state/sessionState.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { ActiveClientToolSet } from '../activeClientState.js';
import { McpCustomizationController } from '../shared/mcpCustomizationController.js';
import { buildCodexMcpReadResult, codexMcpListToInventory, codexMcpToolsChanged, inventoryToSdkServers, translateCodexMcpStartupState, type ICodexMcpServerEntry } from './codexMcpServers.js';
import { buildElicitationRequest, cancelledElicitationResponse, declinedElicitationResponse, elicitationResponseFromAnswers } from './codexElicitationMapper.js';
import type { AhpMcpUiHostCapabilities, Customization } from '../../common/state/protocol/channels-session/state.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { extractForwardedErrorInfo } from '../shared/forwardedChatError.js';
import { IAgentSdkDownloader, IAgentSdkPackage } from '../agentSdkDownloader.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { CodexAppServerClient, JsonRpcError, transportFromChildProcess, type ICodexAppServerClient, type ServerRequestHandlerResult } from './codexAppServerClient.js';
import { ICodexProxyService, type ICodexProxyHandle } from './codexProxyService.js';
import { createCodexSessionMapState, extractUserInputText, mapAgentMessageDelta, mapCommandExecutionOutputDelta, mapFileChangeOutputDelta, mapFileChangePatchUpdated, mapItemCompleted, mapItemStarted, mapMcpToolCallProgress, mapReasoningSummaryPartAdded, mapReasoningSummaryTextDelta, mapReasoningTextDelta, mapTokenUsageUpdated, mapTurnCompleted, mapTurnStarted, resetCodexTurnMapState, type ICodexSessionMapState } from './codexMapAppServerEvents.js';
import { resolveCodexInput } from './codexPromptResolver.js';
import { buildUserInputRequest, emptyUserInputResponse, userInputResponseFromAnswers } from './codexUserInputMapper.js';
import { replayThreadToTurns } from './codexReplayMapper.js';
import { CodexSessionMetadataStore } from './codexSessionMetadataStore.js';
import { CodexSessionConfigKey, collaborationModeKind, narrowAdditionalDirectories, narrowApprovalPolicy, narrowBoolean, narrowPersonality, narrowReasoningEffort, narrowReasoningSummary, narrowSandboxMode, narrowWebSearchMode, type CodexApprovalPolicy } from './codexSessionConfigKeys.js';
import type { ReasoningEffort } from './protocol/generated/ReasoningEffort.js';
import type { ReasoningSummary } from './protocol/generated/ReasoningSummary.js';
import type { Personality } from './protocol/generated/Personality.js';
import type { WebSearchMode } from './protocol/generated/WebSearchMode.js';
import type { SandboxMode } from './protocol/generated/v2/SandboxMode.js';
import type { SandboxPolicy } from './protocol/generated/v2/SandboxPolicy.js';
import type { CommandExecutionApprovalDecision } from './protocol/generated/v2/CommandExecutionApprovalDecision.js';
import type { CommandExecutionRequestApprovalParams } from './protocol/generated/v2/CommandExecutionRequestApprovalParams.js';
import type { CommandExecutionRequestApprovalResponse } from './protocol/generated/v2/CommandExecutionRequestApprovalResponse.js';
import type { FileChangeApprovalDecision } from './protocol/generated/v2/FileChangeApprovalDecision.js';
import type { FileChangeRequestApprovalParams } from './protocol/generated/v2/FileChangeRequestApprovalParams.js';
import type { FileChangeRequestApprovalResponse } from './protocol/generated/v2/FileChangeRequestApprovalResponse.js';
import type { PermissionsRequestApprovalParams } from './protocol/generated/v2/PermissionsRequestApprovalParams.js';
import type { PermissionsRequestApprovalResponse } from './protocol/generated/v2/PermissionsRequestApprovalResponse.js';
import type { DynamicToolSpec } from './protocol/generated/v2/DynamicToolSpec.js';
import type { DynamicToolCallParams } from './protocol/generated/v2/DynamicToolCallParams.js';
import type { DynamicToolCallResponse } from './protocol/generated/v2/DynamicToolCallResponse.js';
import type { DynamicToolCallOutputContentItem } from './protocol/generated/v2/DynamicToolCallOutputContentItem.js';
import type { ToolRequestUserInputParams } from './protocol/generated/v2/ToolRequestUserInputParams.js';
import type { ToolRequestUserInputQuestion } from './protocol/generated/v2/ToolRequestUserInputQuestion.js';
import type { ToolRequestUserInputResponse } from './protocol/generated/v2/ToolRequestUserInputResponse.js';
import type { JsonValue } from './protocol/generated/serde_json/JsonValue.js';
import type { GetAccountResponse } from './protocol/generated/v2/GetAccountResponse.js';
import type { Thread } from './protocol/generated/v2/Thread.js';
import type { ThreadListResponse } from './protocol/generated/v2/ThreadListResponse.js';
import type { ThreadReadResponse } from './protocol/generated/v2/ThreadReadResponse.js';
import type { TurnCompletedNotification } from './protocol/generated/v2/TurnCompletedNotification.js';
import type { TurnStartedNotification } from './protocol/generated/v2/TurnStartedNotification.js';
import type { ItemStartedNotification } from './protocol/generated/v2/ItemStartedNotification.js';
import type { TurnStartParams } from './protocol/generated/v2/TurnStartParams.js';
import type { UserInput } from './protocol/generated/v2/UserInput.js';
import type { ListMcpServerStatusResponse } from './protocol/generated/v2/ListMcpServerStatusResponse.js';
import type { McpServerToolCallResponse } from './protocol/generated/v2/McpServerToolCallResponse.js';
import type { McpResourceReadResponse } from './protocol/generated/v2/McpResourceReadResponse.js';
import type { McpServerStartupState } from './protocol/generated/v2/McpServerStartupState.js';
import type { McpServerElicitationRequestParams } from './protocol/generated/v2/McpServerElicitationRequestParams.js';
import type { McpServerElicitationRequestResponse } from './protocol/generated/v2/McpServerElicitationRequestResponse.js';

const CLIENT_INFO = {
	name: 'vscode_agent_host',
	title: 'VS Code Agent Host',
	// The codex `clientInfo.version` is informational. Hardcoded to a
	// non-empty placeholder; bumping it isn't required when our code
	// changes.
	version: '0.1.0',
};

const CODEX_THINKING_LEVEL_KEY = 'thinkingLevel';

/**
 * User-agent prefix applied to the Codex agent's outbound CAPI calls (e.g. the
 * model-list fetch) so the traffic is identifiable server-side. Mirrors
 * `claudeAgent.ts` and the `vscode_codex` prefix used by `codexProxyService.ts`
 * and `oaiLanguageModelServer.ts`.
 */
const USER_AGENT_PREFIX = 'vscode_codex';

const CODEX_REASONING_EFFORTS: readonly ReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];

/**
 * MCP App capabilities advertised on every codex MCP server. Mirrors
 * {@link DEFAULT_MCP_APP_CAPABILITIES} but omits `sampling`: codex owns
 * the model connection (through the `vscode-proxy` provider) and exposes
 * no app-server RPC for App-initiated `sampling/createMessage`, so the
 * host cannot serve that capability for codex.
 */
const CODEX_MCP_APP_CAPABILITIES: AhpMcpUiHostCapabilities = {
	serverTools: { listChanged: true },
	serverResources: {},
};

/**
 * Codex surfaces an MCP tool-call approval as a `request_user_input`
 * question whose id is `mcp_tool_call_approval_<callId>` (the `<callId>`
 * matches the `mcpToolCall` item id). The host intercepts these and renders
 * them on the normal tool-approval card instead of a chat-input question;
 * see {@link CodexAgent._handleMcpToolApprovalViaCard}.
 *
 * Codex decodes the answer string back into a decision: `Allow` accepts the
 * call, the synthetic `__codex_mcp_decline__` rejects it (anything else is
 * treated as a cancel). These mirror the constants in codex
 * `core/src/mcp_tool_call.rs`.
 */
const MCP_TOOL_APPROVAL_QUESTION_ID_PREFIX = 'mcp_tool_call_approval_';
const MCP_TOOL_APPROVAL_ANSWER_ALLOW = 'Allow';
const MCP_TOOL_APPROVAL_ANSWER_DECLINE = '__codex_mcp_decline__';

/**
 * `supported_endpoints` value (on a Copilot CAPI {@link CCAModel}) that marks
 * a model as reachable through CAPI's OpenAI-shaped Responses endpoint. Codex
 * only drives models via this endpoint (the `vscode-proxy` provider uses
 * `wire_api="responses"`), so the model picker is filtered to models that
 * advertise it. Confirmed against the live CAPI catalog: gpt-5.x / gpt-5*-codex
 * / mai-code carry `/responses`; Anthropic models carry `/v1/messages` and
 * chat-only models carry `/chat/completions` (neither is usable by codex).
 */
const CODEX_RESPONSES_ENDPOINT = '/responses';

const codexSessionConfigSchema = createSchema({
	[CodexSessionConfigKey.ApprovalPolicy]: schemaProperty<CodexApprovalPolicy>({
		type: 'string',
		title: localize('codex.sessionConfig.approvalPolicy', "Approvals"),
		description: localize('codex.sessionConfig.approvalPolicyDescription', "How Codex requests approval for tool calls."),
		enum: ['never', 'on-request', 'on-failure', 'untrusted'],
		enumLabels: [
			localize('codex.sessionConfig.approvalPolicy.never', "No Escalations"),
			localize('codex.sessionConfig.approvalPolicy.onRequest', "Ask When Needed"),
			localize('codex.sessionConfig.approvalPolicy.onFailure', "Ask on Failure"),
			localize('codex.sessionConfig.approvalPolicy.untrusted', "Ask More Often"),
		],
		enumDescriptions: [
			localize('codex.sessionConfig.approvalPolicy.neverDescription', "Never ask for elevated permission; commands that cannot run in the sandbox are rejected."),
			localize('codex.sessionConfig.approvalPolicy.onRequestDescription', "Ask only when Codex determines a command needs elevated permission."),
			localize('codex.sessionConfig.approvalPolicy.onFailureDescription', "Try commands in the sandbox first, then ask to retry with elevated permission if the sandbox blocks them."),
			localize('codex.sessionConfig.approvalPolicy.untrustedDescription', "Ask before more command categories so you can review actions more closely."),
		],
		default: 'on-request',
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.SandboxMode]: schemaProperty<SandboxMode>({
		type: 'string',
		title: localize('codex.sessionConfig.sandboxMode', "Sandbox"),
		description: localize('codex.sessionConfig.sandboxModeDescription', "Filesystem and network restrictions applied to tool calls."),
		enum: ['read-only', 'workspace-write', 'danger-full-access'],
		enumLabels: [
			localize('codex.sessionConfig.sandboxMode.readOnly', "Read-Only"),
			localize('codex.sessionConfig.sandboxMode.workspaceWrite', "Workspace Write"),
			localize('codex.sessionConfig.sandboxMode.dangerFullAccess', "Full Access (Dangerous)"),
		],
		enumDescriptions: [
			localize('codex.sessionConfig.sandboxMode.readOnlyDescription', "Tool calls can read the workspace but cannot modify files."),
			localize('codex.sessionConfig.sandboxMode.workspaceWriteDescription', "Tool calls can read and write within the workspace; network is controlled separately."),
			localize('codex.sessionConfig.sandboxMode.dangerFullAccessDescription', "Tool calls have unrestricted disk and network access."),
		],
		default: 'workspace-write',
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.WebSearchMode]: schemaProperty<WebSearchMode>({
		type: 'string',
		title: localize('codex.sessionConfig.webSearchMode', "Web Search"),
		description: localize('codex.sessionConfig.webSearchModeDescription', "Web-search tool availability for the model."),
		enum: ['disabled', 'cached', 'live'],
		enumLabels: [
			localize('codex.sessionConfig.webSearchMode.disabled', "Disabled"),
			localize('codex.sessionConfig.webSearchMode.cached', "Cached Only"),
			localize('codex.sessionConfig.webSearchMode.live', "Live"),
		],
		default: 'disabled',
		sessionMutable: false,
	}),
	[CodexSessionConfigKey.ModelReasoningEffort]: schemaProperty<ReasoningEffort>({
		type: 'string',
		title: localize('codex.sessionConfig.modelReasoningEffort', "Reasoning Effort"),
		description: localize('codex.sessionConfig.modelReasoningEffortDescription', "Controls how much reasoning effort Codex uses."),
		enum: [...CODEX_REASONING_EFFORTS],
		enumLabels: CODEX_REASONING_EFFORTS.map(getReasoningEffortLabel),
		enumDescriptions: CODEX_REASONING_EFFORTS.map(effort => getReasoningEffortDescription(effort) ?? ''),
		default: 'medium',
		sessionMutable: true,
	}),
	[SessionConfigKey.Mode]: platformSessionSchema.definition[SessionConfigKey.Mode],
	[CodexSessionConfigKey.Personality]: schemaProperty<Personality>({
		type: 'string',
		title: localize('codex.sessionConfig.personality', "Personality"),
		description: localize('codex.sessionConfig.personalityDescription', "Tone Codex uses when communicating."),
		enum: ['none', 'friendly', 'pragmatic'],
		enumLabels: [
			localize('codex.sessionConfig.personality.none', "Default"),
			localize('codex.sessionConfig.personality.friendly', "Friendly"),
			localize('codex.sessionConfig.personality.pragmatic', "Pragmatic"),
		],
		enumDescriptions: [
			localize('codex.sessionConfig.personality.noneDescription', "Use Codex's built-in default tone."),
			localize('codex.sessionConfig.personality.friendlyDescription', "Warmer, more conversational tone."),
			localize('codex.sessionConfig.personality.pragmaticDescription', "Terse, no-nonsense tone focused on actions."),
		],
		default: 'none',
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.ReasoningSummary]: schemaProperty<ReasoningSummary>({
		type: 'string',
		title: localize('codex.sessionConfig.reasoningSummary', "Reasoning Summary"),
		description: localize('codex.sessionConfig.reasoningSummaryDescription', "How Codex summarizes its reasoning in the response stream."),
		enum: ['auto', 'concise', 'detailed', 'none'],
		enumLabels: [
			localize('codex.sessionConfig.reasoningSummary.auto', "Auto"),
			localize('codex.sessionConfig.reasoningSummary.concise', "Concise"),
			localize('codex.sessionConfig.reasoningSummary.detailed', "Detailed"),
			localize('codex.sessionConfig.reasoningSummary.none', "None"),
		],
		default: 'auto',
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.AdditionalDirectories]: schemaProperty<string[]>({
		type: 'array',
		title: localize('codex.sessionConfig.additionalDirectories', "Additional Writable Directories"),
		description: localize('codex.sessionConfig.additionalDirectoriesDescription', "Absolute paths the sandbox is allowed to write to, in addition to the workspace. Only applies when Sandbox is Workspace Write."),
		items: { type: 'string', title: localize('codex.sessionConfig.additionalDirectories.item', "Directory") },
		enumDynamic: true,
		default: [],
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.NetworkAccessEnabled]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('codex.sessionConfig.networkAccessEnabled', "Network"),
		description: localize('codex.sessionConfig.networkAccessEnabledDescription', "Allow sandboxed tool calls to make outbound network requests. Only applies when Sandbox is Workspace Write."),
		default: false,
		sessionMutable: true,
	}),
	[SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions],
});

const codexVisibleSessionConfigSchema = createSchema({
	[SessionConfigKey.Mode]: codexSessionConfigSchema.definition[SessionConfigKey.Mode],
	[CodexSessionConfigKey.ApprovalPolicy]: codexSessionConfigSchema.definition[CodexSessionConfigKey.ApprovalPolicy],
	[CodexSessionConfigKey.SandboxMode]: codexSessionConfigSchema.definition[CodexSessionConfigKey.SandboxMode],
	[CodexSessionConfigKey.WebSearchMode]: codexSessionConfigSchema.definition[CodexSessionConfigKey.WebSearchMode],
	[CodexSessionConfigKey.Personality]: codexSessionConfigSchema.definition[CodexSessionConfigKey.Personality],
	[CodexSessionConfigKey.ReasoningSummary]: codexSessionConfigSchema.definition[CodexSessionConfigKey.ReasoningSummary],
	[SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions],
});

const codexWorkspaceWriteSessionConfigSchema = createSchema({
	...codexVisibleSessionConfigSchema.definition,
	[CodexSessionConfigKey.NetworkAccessEnabled]: codexSessionConfigSchema.definition[CodexSessionConfigKey.NetworkAccessEnabled],
});

interface ICodexSessionConfigDefaults {
	readonly [CodexSessionConfigKey.ApprovalPolicy]: CodexApprovalPolicy;
	readonly [CodexSessionConfigKey.SandboxMode]: SandboxMode;
	readonly [CodexSessionConfigKey.WebSearchMode]: WebSearchMode;
	readonly [CodexSessionConfigKey.ModelReasoningEffort]: ReasoningEffort;
	readonly [CodexSessionConfigKey.AdditionalDirectories]: string[];
	readonly [CodexSessionConfigKey.NetworkAccessEnabled]: boolean;
	readonly [SessionConfigKey.Mode]: SessionMode;
	readonly [CodexSessionConfigKey.Personality]: Personality;
	readonly [CodexSessionConfigKey.ReasoningSummary]: ReasoningSummary;
}

const codexSessionConfigDefaults: ICodexSessionConfigDefaults = {
	[CodexSessionConfigKey.ApprovalPolicy]: 'on-request',
	[CodexSessionConfigKey.SandboxMode]: 'workspace-write',
	[CodexSessionConfigKey.WebSearchMode]: 'disabled',
	[CodexSessionConfigKey.ModelReasoningEffort]: 'medium',
	[CodexSessionConfigKey.AdditionalDirectories]: [],
	[CodexSessionConfigKey.NetworkAccessEnabled]: false,
	[SessionConfigKey.Mode]: 'interactive',
	[CodexSessionConfigKey.Personality]: 'none',
	[CodexSessionConfigKey.ReasoningSummary]: 'auto',
};

const CodexPrewarmTtlMs = 60_000;

/**
 * Per-session bookkeeping. The codex thread is owned by the shared
 * connection in {@link CodexAgent}; this struct only tracks what the
 * `IAgent` surface needs.
 */
/** Resolved user-input answer captured from the client's `chat/inputCompleted`. */
interface ICodexUserInputResult {
	readonly response: ChatInputResponseKind;
	readonly answers?: Record<string, ChatInputAnswer>;
}

interface ICodexSession {
	/** Caller-facing session id used in the `codex:/<id>` URI; may differ from the codex thread id. */
	readonly sessionId: string;
	/**
	 * Codex app-server thread id used in JSON-RPC `thread/*` and `turn/*` calls.
	 * Undefined until the session has been materialized (first `sendMessage`
	 * triggers `thread/start`). Decoupling materialization from
	 * `createSession` mirrors the Claude harness's provisional/materialize
	 * split and avoids spawning an orphan codex thread when the workbench
	 * rebinds a provisional URI after a chip-selection.
	 */
	threadId: string | undefined;
	readonly sessionUri: URI;
	/**
	 * The directory the codex thread runs in. Usually supplied by the client
	 * on `createSession`, but Codex requires a cwd, so when none is provided
	 * (e.g. an editor window with no workspace folder open) one is lazily
	 * created as a managed temp folder at materialize time (tracked by
	 * {@link managedWorkingDirectory} for cleanup). Mutable so that lazy
	 * assignment can happen after the provisional `createSession`.
	 */
	workingDirectory: URI | undefined;
	/**
	 * Set to the temp folder created for this session when no working
	 * directory was supplied, so {@link CodexAgent.disposeSession} can remove
	 * it. `undefined` when the client supplied a working directory.
	 */
	managedWorkingDirectory: URI | undefined;
	readonly mapState: ICodexSessionMapState;
	/**
	 * Phase 4: parked deferreds for `item/commandExecution/requestApproval`,
	 * keyed by the host-side toolCallId. Resolved by
	 * {@link CodexAgent.respondToPermissionRequest}.
	 */
	readonly pendingCommandApprovals: PendingRequestRegistry<CommandExecutionApprovalDecision>;
	/**
	 * Per-session set of "accept for session" decisions. When the user
	 * picks Accept-for-Session in a previous approval, subsequent
	 * approval requests on the same session resolve automatically.
	 */
	readonly acceptedForSession: Set<string>;
	/**
	 * Steering messages handed to codex via `turn/steer` that are awaiting
	 * the matching `userMessage` item echo, which promotes them into their
	 * own visible turn. Keyed by {@link PendingMessage.id}. Drained (with a
	 * `steering_consumed` signal) on turn completion, abort, dispose, or a
	 * `turn/steer` rejection so the chat UI's pending bubble never sticks.
	 */
	readonly pendingSteeringFlips: Map<string, PendingMessage>;
	/**
	 * Client-provided tool definitions for this session, keyed by the
	 * contributing workbench client. The merged set is registered with codex
	 * as `dynamicTools` at `thread/start`. Empty until the first active client
	 * sets its tools.
	 */
	readonly clientToolSet: ActiveClientToolSet;
	/**
	 * Parked deferreds for in-flight client-tool calls (codex
	 * `item/tool/call`), keyed by the host-side toolCallId. Resolved by
	 * {@link CodexAgent.onClientToolCallComplete}.
	 */
	readonly pendingClientToolCalls: PendingRequestRegistry<ToolCallResult>;
	/**
	 * Parked deferreds for in-flight user-input requests (codex
	 * `item/tool/requestUserInput`, i.e. the model's `ask_user`), keyed by a
	 * host-generated requestId. Resolved by
	 * {@link CodexAgent.respondToUserInputRequest}.
	 */
	readonly pendingUserInputs: PendingRequestRegistry<ICodexUserInputResult>;
	/**
	 * Signature of the {@link clientTools} the codex thread was started
	 * with. Codex only accepts `dynamicTools` at `thread/start`, so if the
	 * tools change before the first turn (e.g. the prewarmed thread started
	 * before {@link setClientTools} arrived) the thread is restarted to pick
	 * them up. `undefined` until materialized.
	 */
	materializedToolsSig: string | undefined;
	/** True once a turn has been started on the (materialized) thread. */
	firstTurnSent: boolean;
	model: ModelSelection | undefined;
	/** Workbench-facing turn id for the active turn. */
	currentTurnId: string | undefined;
	/** Codex app-server turn id for the active turn. */
	currentAppTurnId: string | undefined;
	/** Codex app-server turn id -> workbench-facing turn id. */
	readonly hostTurnIdByAppTurnId: Map<string, string>;
	/**
	 * Workbench-facing turn id -> codex app-server turn id, retained across
	 * turn completion so {@link CodexAgent.truncateSession} can translate a
	 * live host turn id to a `thread/rollback` target.
	 */
	readonly codexTurnIdByHostTurnId: Map<string, string>;
	/** Set when this session was restored (Phase 3) and needs `thread/resume` before the first `turn/start`. */
	needsResume: boolean;
	/** Most recent user prompt sent on this session — used as fallback userMessage text in `turn/started`. */
	lastPromptText: string;
	/** True once the workbench has disposed this session. Guards background prewarm continuations. */
	disposed: boolean;
	/** In-flight background or foreground materialization, shared across callers. */
	materializePromise: Promise<void> | undefined;
	/** Whether the workbench-facing materialize event has been emitted. */
	materializedEventFired: boolean;
	/** TTL timer for a materialized-but-unused prewarmed thread. */
	prewarmTimer: ReturnType<typeof setTimeout> | undefined;
	/** True once the prewarmed session has been claimed by a user turn. */
	prewarmClaimed: boolean;
	/** True once the agent host's server tools have been advertised on this session. */
	serverToolsAdvertised: boolean;
	/**
	 * Per-session MCP customization surface. Created lazily the first time
	 * the session needs to surface codex's MCP servers (either via
	 * {@link CodexAgent.getSessionCustomizations} or when the connection's
	 * MCP inventory is applied). Disposed when the session is removed.
	 */
	mcpController: McpCustomizationController | undefined;
}

/**
 * Connection state machine. The codex process is spawned lazily on first
 * need (Decision 6) and stays alive for the agent's lifetime.
 */
type ConnectionState =
	| { readonly kind: 'idle' }
	| { readonly kind: 'starting'; readonly promise: Promise<IConnectionReady> }
	| ({ readonly kind: 'ready' } & IConnectionReady);

interface IConnectionReady {
	readonly client: ICodexAppServerClient;
	readonly proxyHandle: ICodexProxyHandle;
	readonly child: ChildProcessWithoutNullStreams;
}

/**
 * `IAgent` implementation backed by `codex app-server`.
 *
 * Phase 2 surface: createSession (blocks on `thread/start`), sendMessage
 * (one `turn/start`, streams `agentMessage` deltas), setPendingMessages
 * (steering via `turn/steer`), abortSession (`turn/interrupt`),
 * disposeSession (`thread/unsubscribe`, no process kill).
 *
 * Decisions 3 (shared process), 6 (lazy spawn), 7 (session id == threadId),
 * 10 (no cwd → reject), 15 (cancel, keep streamed content), 16 (steering),
 * 17 (attachments), 18 (apikey auth).
 */

/**
 * `@openai/codex` distribution descriptor. Lives in this file because it
 * encodes Codex-specific knowledge — the env-var name and the fact that
 * Codex's Linux binaries are statically musl-linked and ship as a single
 * `linux-*` SKU regardless of host libc.
 */
export const CodexSdkPackage: IAgentSdkPackage = {
	id: 'codex',
	displayName: 'Codex',
	devOverrideEnvVar: AgentHostCodexAgentSdkRootEnvVar,
	hasSeparateMuslLinuxPackage: false,
};

/**
 * Convert a workbench {@link ToolCallResult} into the codex
 * {@link DynamicToolCallResponse} returned for an `item/tool/call` request.
 * Text content maps to `inputText`; when there is no text content the
 * tool's past-tense summary is used so codex never receives an empty body.
 */
function dynamicToolResponseFromResult(result: ToolCallResult): DynamicToolCallResponse {
	const contentItems: DynamicToolCallOutputContentItem[] = [];
	for (const c of result.content ?? []) {
		if (c.type === ToolResultContentType.Text) {
			contentItems.push({ type: 'inputText', text: c.text });
		}
	}
	if (contentItems.length === 0) {
		// Codex rejects an empty tool body, so always send a non-empty
		// `inputText`: prefer the tool's past-tense summary, otherwise a
		// generic completion marker keyed off success.
		const summary = typeof result.pastTenseMessage === 'string' && result.pastTenseMessage.length > 0
			? result.pastTenseMessage
			: (result.success ? 'Tool completed with no output.' : 'Tool failed with no output.');
		contentItems.push({ type: 'inputText', text: summary });
	}
	return { contentItems, success: result.success };
}

function toolsSignature(tools: readonly ToolDefinition[] | undefined): string {
	if (!tools || tools.length === 0) {
		return '';
	}
	return tools
		.map(t => `${t.name}\u0000${t.description ?? ''}\u0000${JSON.stringify(t.inputSchema ?? null)}`)
		.sort()
		.join('\u0001');
}

/**
 * Codex active-client handle. Writes flow into the owning session's
 * {@link ActiveClientToolSet}; the session is resolved lazily so writes that
 * arrive before (or after) the session exists are gracefully dropped, matching
 * the prior `setClientTools` early-return behavior. Codex has no client
 * customization layer, so `customizations` is inert.
 */
class CodexActiveClientHandle implements IActiveClient {
	constructor(
		private readonly _getSession: () => ICodexSession | undefined,
		readonly clientId: string,
		readonly displayName: string | undefined,
		private readonly _onToolsSet: (tools: readonly ToolDefinition[]) => void,
	) { }

	get tools(): readonly ToolDefinition[] {
		return this._getSession()?.clientToolSet.get(this.clientId) ?? [];
	}
	set tools(tools: readonly ToolDefinition[]) {
		this._getSession()?.clientToolSet.set(this.clientId, tools);
		this._onToolsSet(tools);
	}

	get customizations(): readonly ClientPluginCustomization[] {
		return [];
	}
	set customizations(_customizations: readonly ClientPluginCustomization[]) {
		// Codex does not support client-contributed customizations.
	}
}

/**
 * Map a resolved approval decision to the {@link FileChangeApprovalDecision}
 * subset. The host's boolean response only yields `accept`/`decline`; the
 * command-only amendment variants are treated as a decline for file changes.
 */
function narrowFileChangeDecision(decision: CommandExecutionApprovalDecision): FileChangeApprovalDecision {
	switch (decision) {
		case 'accept':
		case 'acceptForSession':
		case 'decline':
		case 'cancel':
			return decision;
		default:
			return 'decline';
	}
}

export class CodexAgent extends Disposable implements IAgent {

	readonly id: AgentProvider = 'codex';

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _onDidMaterializeSession = this._register(new Emitter<IAgentMaterializeSessionEvent>());
	readonly onDidMaterializeSession = this._onDidMaterializeSession.event;

	private readonly _onMcpNotification = this._register(new Emitter<IMcpNotification>());
	readonly onMcpNotification = this._onMcpNotification.event;

	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models: IObservable<readonly IAgentModelInfo[]> = this._models;

	/** Keyed by caller-facing sessionId (the URI host). */
	private readonly _sessions = new Map<string, ICodexSession>();
	/** Inverse map: codex threadId → caller-facing sessionId, for routing codex notifications back to sessions. */
	private readonly _sessionIdByThreadId = new Map<string, string>();
	/**
	 * Connection-global MCP server inventory reported by the codex
	 * app-server (`mcpServerStatus/list` + `mcpServer/startupStatus/updated`).
	 * Codex owns MCP servers at the process level — shared across every
	 * thread — so the inventory lives on the agent and is mirrored onto each
	 * session's {@link ICodexSession.mcpController}. Keyed by server name.
	 */
	private readonly _mcpInventory = new Map<string, ICodexMcpServerEntry>();
	private _githubToken: string | undefined;
	private _connection: ConnectionState = { kind: 'idle' };
	private _modelsRefreshPromise: Promise<void> | undefined;
	private readonly _metadataStore: CodexSessionMetadataStore;

	/**
	 * The agent host's server-tool host (feedback "comments" today, more in the
	 * future). Server tools execute in-process against the session's own state
	 * — unlike client tools, which round-trip to the workbench. `undefined`
	 * until {@link setServerToolHost} is called during registration; remains
	 * `undefined` in test / standalone construction.
	 */
	private _serverToolHost: IAgentServerToolHost | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@ICodexProxyService private readonly _codexProxyService: ICodexProxyService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@IAgentSdkDownloader private readonly _agentSdkDownloader: IAgentSdkDownloader,
		@IProductService private readonly _productService: IProductService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._metadataStore = instantiationService.createInstance(CodexSessionMetadataStore);
	}

	// #region Auth

	getProtectedResources(): ProtectedResourceMetadata[] {
		return [
			this._gitHubEndpointService.getCopilotResource(),
			this._gitHubEndpointService.getRepoResource()
		];
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource === this._gitHubEndpointService.getRepoResource().resource) {
			return true;
		}
		if (resource !== this._gitHubEndpointService.getCopilotResource().resource) {
			return false;
		}
		const changed = this._githubToken !== token;
		this._githubToken = token;
		if (changed && this._connection.kind === 'ready') {
			// Codex stays running — proxy reads the new token from its
			// own cell on the next request (Decision 4).
			this._connection.proxyHandle.setToken(token);
			this._queueModelRefresh(token);
		} else if (changed) {
			// Defer model refresh until the connection comes up.
			this._queueModelRefresh(token);
		}
		this._logService.info('[Codex] Auth token updated');
		return true;
	}

	private _queueModelRefresh(token: string): void {
		const refreshPromise = this._refreshModels(token).finally(() => {
			if (this._modelsRefreshPromise === refreshPromise) {
				this._modelsRefreshPromise = undefined;
			}
		});
		this._modelsRefreshPromise = refreshPromise;
		void this._modelsRefreshPromise;
	}

	private _ensureAuthenticated(): string {
		const token = this._githubToken;
		if (!token) {
			throw new ProtocolError(
				AHP_AUTH_REQUIRED,
				'Authentication is required to use Codex',
				this.getProtectedResources(),
			);
		}
		return token;
	}

	private _defaultModel(): ModelSelection | undefined {
		const models = this._models.get();
		const chosen = models[0];
		return chosen ? { id: chosen.id } : undefined;
	}

	private _supportedModelOrUndefined(model: ModelSelection | undefined): ModelSelection | undefined {
		if (model && this._models.get().some(m => m.id === model.id)) {
			return model;
		}
		if (model) {
			this._logService.warn(`[Codex] Ignoring unknown model '${model.id}'`);
		}
		return this._defaultModel();
	}

	private async _resolveModel(session: ICodexSession): Promise<ModelSelection> {
		// Ensure the catalog is populated before validating the selection so a
		// model picked before models finished loading isn't dropped.
		if (this._models.get().length === 0 && this._modelsRefreshPromise) {
			await this._modelsRefreshPromise;
		}
		const selected = this._supportedModelOrUndefined(session.model);
		if (selected) {
			session.model = selected;
			return selected;
		}
		throw new Error('Codex has no available models.');
	}

	private _createReasoningEffortConfigSchema(): ConfigSchema {
		return {
			type: 'object',
			properties: {
				[CODEX_THINKING_LEVEL_KEY]: {
					type: 'string',
					title: localize('codex.modelThinkingLevel.title', "Thinking Level"),
					description: localize('codex.modelThinkingLevel.description', "Controls how much reasoning effort Codex uses."),
					default: 'medium',
					enum: [...CODEX_REASONING_EFFORTS],
					enumLabels: CODEX_REASONING_EFFORTS.map(getReasoningEffortLabel),
					enumDescriptions: CODEX_REASONING_EFFORTS.map(effort => getReasoningEffortDescription(effort) ?? ''),
				},
			},
		};
	}

	private _getReasoningEffort(session: ICodexSession): ReasoningEffort | undefined {
		const modelConfigEffort = narrowReasoningEffort(session.model?.config?.[CODEX_THINKING_LEVEL_KEY]);
		if (modelConfigEffort) {
			return modelConfigEffort;
		}
		const config = this._configurationService.getSessionConfigValues(session.sessionUri.toString());
		return narrowReasoningEffort(config?.[CodexSessionConfigKey.ModelReasoningEffort]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.ModelReasoningEffort];
	}

	private _readSessionConfig(session: ICodexSession): ReturnType<typeof codexSessionConfigSchema.validateOrDefault> {
		return codexSessionConfigSchema.validateOrDefault(
			this._configurationService.getSessionConfigValues(session.sessionUri.toString()),
			codexSessionConfigDefaults,
		);
	}

	private _sandboxPolicy(session: ICodexSession, config: ReturnType<typeof codexSessionConfigSchema.validateOrDefault>): SandboxPolicy {
		const mode = narrowSandboxMode(config[CodexSessionConfigKey.SandboxMode]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.SandboxMode];
		if (mode === 'danger-full-access') {
			return { type: 'dangerFullAccess' };
		}
		const networkAccess = narrowBoolean(config[CodexSessionConfigKey.NetworkAccessEnabled]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.NetworkAccessEnabled];
		if (mode === 'read-only') {
			return { type: 'readOnly', networkAccess: false };
		}
		const writableRoots = [
			...(session.workingDirectory ? [session.workingDirectory.fsPath] : []),
			...(narrowAdditionalDirectories(config[CodexSessionConfigKey.AdditionalDirectories]) ?? []),
		];
		return {
			type: 'workspaceWrite',
			writableRoots,
			networkAccess,
			excludeTmpdirEnvVar: false,
			excludeSlashTmp: false,
		};
	}

	private _turnStartOptions(session: ICodexSession, modelId: string): Pick<TurnStartParams, 'approvalPolicy' | 'sandboxPolicy' | 'effort' | 'runtimeWorkspaceRoots' | 'personality' | 'summary' | 'collaborationMode'> {
		const config = this._readSessionConfig(session);
		const approvalPolicy = narrowApprovalPolicy(config[CodexSessionConfigKey.ApprovalPolicy]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.ApprovalPolicy];
		const sandboxPolicy = this._sandboxPolicy(session, config);
		const runtimeWorkspaceRoots = sandboxPolicy.type === 'workspaceWrite' ? sandboxPolicy.writableRoots : undefined;
		const effort = this._getReasoningEffort(session);
		const personality = narrowPersonality(config[CodexSessionConfigKey.Personality]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.Personality];
		const summary = narrowReasoningSummary(config[CodexSessionConfigKey.ReasoningSummary]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.ReasoningSummary];
		// Map the platform-generic Agent Mode to codex's native collaboration
		// mode. Always send it (even for `default`) so switching Plan → Interactive
		// resets the sticky thread mode. `collaborationMode.settings` carries the
		// model + effort because codex treats it as authoritative over the
		// top-level fields when a collaboration mode is set.
		const mode = collaborationModeKind(config[SessionConfigKey.Mode]);
		const collaborationMode: TurnStartParams['collaborationMode'] = {
			mode,
			settings: { model: modelId, reasoning_effort: effort ?? null, developer_instructions: null },
		};
		return {
			approvalPolicy,
			sandboxPolicy,
			effort,
			personality,
			summary,
			collaborationMode,
			...(runtimeWorkspaceRoots ? { runtimeWorkspaceRoots } : {}),
		};
	}

	private async _refreshModels(token: string): Promise<void> {
		try {
			const userAgent = `${USER_AGENT_PREFIX}/${this._productService.version}`;
			const all = await this._copilotApiService.models(token, { headers: { 'User-Agent': userAgent }, suppressIntegrationId: true });
			if (this._githubToken !== token) {
				return;
			}
			const configSchema = this._createReasoningEffortConfigSchema();
			// Codex talks to every model through the `vscode-proxy` custom model
			// provider with `wire_api="responses"` (see CodexProxyService), so it
			// can only drive models that expose Copilot CAPI's OpenAI-shaped
			// Responses endpoint. Filter the catalog to those advertising
			// `/responses` in `supported_endpoints` (this drops Anthropic
			// `/v1/messages` and chat-completions-only models, which codex cannot
			// use). The chosen id is forwarded straight through; CAPI remains the
			// authority on what the token may actually use.
			const models = all
				.filter(m => m.supported_endpoints?.includes(CODEX_RESPONSES_ENDPOINT))
				.sort((a, b) => Number(b.is_chat_default) - Number(a.is_chat_default))
				.map((m): IAgentModelInfo => ({
					provider: this.id,
					id: m.id,
					name: m.name ?? m.id,
					maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
					maxOutputTokens: m.capabilities?.limits?.max_output_tokens,
					maxPromptTokens: m.capabilities?.limits?.max_prompt_tokens,
					supportsVision: !!m.capabilities?.supports?.vision,
					configSchema,
					policyState: m.policy?.state as PolicyState | undefined,
					_meta: createPricingMetaFromBilling(
						normalizeCAPIBilling(m.billing),
						typeof m.model_picker_price_category === 'string'
							? m.model_picker_price_category
							: undefined,
					),
				}));
			this._models.set(models, undefined);
		} catch (err) {
			this._logService.warn(`[Codex] Failed to refresh models: ${err instanceof Error ? err.message : String(err)}`);
			if (this._githubToken === token) {
				this._models.set([], undefined);
			}
		}
	}

	// #endregion

	// #region Connection lifecycle

	/**
	 * Lazily spawn the codex app-server, initialize the connection,
	 * authenticate via apiKey, and return the ready connection. Idempotent
	 * — concurrent callers share the same promise.
	 */
	private _ensureConnection(): Promise<IConnectionReady> {
		if (this._connection.kind === 'ready') {
			return Promise.resolve(this._connection);
		}
		if (this._connection.kind === 'starting') {
			return this._connection.promise;
		}
		const token = this._ensureAuthenticated();
		const promise = this._startConnection(token).then(ready => {
			this._connection = { kind: 'ready', ...ready };
			return ready;
		}).catch(err => {
			this._connection = { kind: 'idle' };
			throw err;
		});
		this._connection = { kind: 'starting', promise };
		return promise;
	}

	/**
	 * Resolve the Codex SDK root — the directory whose
	 * `node_modules/@openai/codex-<target>/…` holds the native binary.
	 *
	 * Mirrors the three-tier resolution in `ClaudeAgentSdkService._loadSdk`:
	 *   1. dev override / product download, via the downloader, when the SDK
	 *      `isAvailable` (env override || `product.agentSdks.codex`);
	 *   2. dev fallback to this repo's `node_modules`, where `@openai/codex`
	 *      and its per-host binary package are devDependencies — this is what
	 *      lets running-from-source (and dev smoke tests) spawn Codex without
	 *      an env-var override.
	 *
	 * `isAvailable` is already false in dev, so it discriminates the two
	 * without injecting `INativeEnvironmentService`. When neither path
	 * resolves we defer to the downloader so callers get its actionable
	 * "not configured" diagnostic.
	 */
	private async _resolveSdkRoot(): Promise<string> {
		if (this._agentSdkDownloader.isAvailable(CodexSdkPackage)) {
			return this._agentSdkDownloader.loadSdkRoot(CodexSdkPackage, CancellationToken.None);
		}
		const devRoot = await resolveCodexDevSdkRoot();
		if (devRoot) {
			this._logService.info(`[Codex] resolving SDK from repo node_modules (dev fallback): ${devRoot}`);
			return devRoot;
		}
		return this._agentSdkDownloader.loadSdkRoot(CodexSdkPackage, CancellationToken.None);
	}

	private async _startConnection(token: string): Promise<IConnectionReady> {
		// Resolve the Codex SDK root: dev override / product download via the
		// downloader, or this repo's `node_modules` in a source checkout (see
		// `_resolveSdkRoot`). We spawn the native codex binary inside the
		// platform package directly (the same shape the JS shim at
		// `node_modules/@openai/codex/bin/codex.js` would resolve to) — going
		// through the shim adds a launcher hop and forces an
		// `ELECTRON_RUN_AS_NODE` round-trip when the agent host runs as an
		// Electron utility process.
		const root = await this._resolveSdkRoot();
		const codexTarget = codexPackageSuffix(process.platform, process.arch);
		if (!codexTarget) {
			throw new Error(`Codex: unsupported platform ${process.platform}-${process.arch}`);
		}
		const triple = codexBinaryTriple(codexTarget);
		if (!triple) {
			throw new Error(`Codex: no binary triple known for sdkTarget '${codexTarget}'`);
		}
		const binaryName = process.platform === 'win32' ? 'codex.exe' : 'codex';
		const binaryPath = join(root, 'node_modules', `@openai/codex-${codexTarget}`, 'vendor', triple, 'bin', binaryName);
		try {
			fs.accessSync(binaryPath, fs.constants.X_OK);
		} catch (err) {
			throw new Error(`Codex binary not executable: ${binaryPath} (${err instanceof Error ? err.message : String(err)})`);
		}

		const proxyHandle = await this._codexProxyService.start(token);

		// Build child env: inherit, override OPENAI_API_KEY so the proxy's
		// nonce check passes. The proxy provider is plumbed via `-c` CLI
		// overrides below; we deliberately do NOT write a config.toml,
		// which would force a managed CODEX_HOME and trip codex's
		// "refusing to write helper binaries under TMPDIR" warning.
		const env: NodeJS.ProcessEnv = {
			...process.env,
			OPENAI_API_KEY: proxyHandle.nonce,
		};
		const userCodexHome = process.env[AgentHostCodexAgentCodexHomeEnvVar];
		if (userCodexHome) {
			env.CODEX_HOME = userCodexHome;
		}

		// Define an in-memory `vscode-proxy` provider that points at our
		// local proxy with WebSocket transport disabled. Using `-c`
		// overrides composes with the user's ~/.codex/config.toml — their
		// other settings (model, MCP servers, etc.) still apply.
		const providerOverrides = [
			`model_provider="vscode-proxy"`,
			`model_providers.vscode-proxy.name="VS Code Proxy"`,
			`model_providers.vscode-proxy.base_url="${proxyHandle.baseUrl}/v1"`,
			`model_providers.vscode-proxy.wire_api="responses"`,
			`model_providers.vscode-proxy.env_key="OPENAI_API_KEY"`,
			`model_providers.vscode-proxy.requires_openai_auth=false`,
			`model_providers.vscode-proxy.supports_websockets=false`,
			// Route MCP tool-call approvals through codex's `request_user_input`
			// path (a proper Allow / Allow-and-remember / Cancel options
			// question the agent host already renders) instead of the
			// `tool_call_mcp_elicitation` path, which surfaces them as an
			// empty-schema `mcpServer/elicitation/request` that would render as
			// a bare free-text prompt. With this off, the host's MCP
			// elicitation handler is reserved for genuine server-to-user
			// elicitations.
			`features.tool_call_mcp_elicitation=false`,
			// CAPI rejects the hosted `image_generation` tool; disable it so codex does not emit it.
			`features.image_generation=false`,
		];

		// Extra args forwarded as JSON from the workbench setting.
		const extraArgs = parseBinaryArgs(process.env[AgentHostCodexAgentBinaryArgsEnvVar]);
		const args = ['app-server', ...providerOverrides.flatMap(kv => ['-c', kv]), ...extraArgs];

		this._logService.info(`[Codex] spawning ${binaryPath} ${args.join(' ')}`);
		const child = spawn(binaryPath, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });

		// Surface stderr to the log channel — codex writes useful startup
		// diagnostics there. Mirror Claude's pattern.
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', chunk => this._logService.info(`[Codex stderr] ${String(chunk).trimEnd()}`));

		const transport = transportFromChildProcess(child);
		const client = new CodexAppServerClient(transport, (level, msg) => {
			this._logService.info(`[CodexClient ${level}] ${msg}`);
		});

		// Tear everything down if the child dies on its own.
		client.onExit(e => {
			this._logService.warn(`[Codex] app-server exited code=${e.code} signal=${e.signal}`);
			this._handleConnectionLost();
		});
		client.onTransportError(err => {
			this._logService.error(`[Codex] transport error: ${err.message}`);
			this._handleConnectionLost();
		});

		// Initialize handshake. Failure here is fatal for the connection.
		try {
			await client.request<'initialize'>('initialize', {
				clientInfo: CLIENT_INFO,
				capabilities: { experimentalApi: true, requestAttestation: false, optOutNotificationMethods: null },
			});
			client.notify<'initialized'>('initialized', undefined as never);
			// With `requires_openai_auth = false` on the proxy provider,
			// codex does not require a separate login step — the proxy
			// nonce is read from OPENAI_API_KEY by the provider's env_key.
			if (userCodexHome) {
				// User-provided CODEX_HOME may target a provider that
				// still requires auth; preserve the apiKey login path.
				await client.request<'account/login/start'>('account/login/start', {
					type: 'apiKey',
					apiKey: proxyHandle.nonce,
				});
			}
			void this._logAccountSnapshot(client);
		} catch (err) {
			client.dispose();
			proxyHandle.dispose();
			try { child.kill('SIGKILL'); } catch { /* already dead */ }
			throw err;
		}

		// Wire global notification → SessionAction dispatch.
		this._registerIgnoredNotifications(client);
		this._register(client.onNotification('turn/started', params => this._dispatchByThread(params.threadId, s => this._handleTurnStartedNotification(s, params))));
		this._register(client.onNotification('item/started', params => this._dispatchByThread(params.threadId, s => this._handleItemStarted(s, params))));
		this._register(client.onNotification('item/agentMessage/delta', params => this._dispatchByThread(params.threadId, s => mapAgentMessageDelta(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/commandExecution/outputDelta', params => this._dispatchByThread(params.threadId, s => mapCommandExecutionOutputDelta(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/fileChange/patchUpdated', params => this._dispatchByThread(params.threadId, s => mapFileChangePatchUpdated(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/fileChange/outputDelta', params => this._dispatchByThread(params.threadId, s => mapFileChangeOutputDelta(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/mcpToolCall/progress', params => this._dispatchByThread(params.threadId, s => mapMcpToolCallProgress(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/reasoning/summaryPartAdded', params => this._dispatchByThread(params.threadId, s => mapReasoningSummaryPartAdded(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/reasoning/summaryTextDelta', params => this._dispatchByThread(params.threadId, s => mapReasoningSummaryTextDelta(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/reasoning/textDelta', params => this._dispatchByThread(params.threadId, s => mapReasoningTextDelta(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('thread/tokenUsage/updated', params => this._dispatchByThread(params.threadId, s => mapTokenUsageUpdated(this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/completed', params => this._dispatchByThread(params.threadId, s => mapItemCompleted(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('turn/completed', params => this._dispatchByThread(params.threadId, s => this._handleTurnCompletedNotification(s, params))));

		// MCP server lifecycle. Codex owns MCP servers at the process level
		// (shared across threads); surface them to AHP clients as per-session
		// customizations + an `mcp://` side channel. The startup notification
		// drives state transitions; `ready` triggers a full inventory refresh
		// so the freshly-loaded tools become available.
		this._register(client.onNotification('mcpServer/startupStatus/updated', params => this._handleMcpStartupStatus(client, params.name, params.status, params.error)));

		// Phase 4: command-execution approval requests. Park on a
		// per-session deferred, emit `ChatToolCallReady` in the
		// PendingConfirmation state, and answer codex when the user
		// (or accept-for-session memoization) decides.
		this._register(client.onRequest<'item/commandExecution/requestApproval'>(
			'item/commandExecution/requestApproval',
			params => this._handleCommandApprovalRequestRpc(params),
		));

		// File-change and permission-escalation approval requests (raised in
		// non-`danger-full-access` sandboxes / on the on-request approval
		// policy). Surface them through the same pending-confirmation flow.
		this._register(client.onRequest<'item/fileChange/requestApproval'>(
			'item/fileChange/requestApproval',
			params => this._handleFileChangeApprovalRequestRpc(params),
		));
		this._register(client.onRequest<'item/permissions/requestApproval'>(
			'item/permissions/requestApproval',
			params => this._handlePermissionsApprovalRequestRpc(params),
		));

		// Client-provided (dynamic) tool execution requests. Codex asks the
		// host to run a tool registered via `thread/start.dynamicTools`; we
		// route the call to the owning workbench client and answer with its
		// result.
		this._register(client.onRequest<'item/tool/call'>(
			'item/tool/call',
			params => this._handleDynamicToolCallRpc(params),
		));

		// User-input requests (the model's `ask_user`). Surface the questions
		// as a chat input request and answer codex with the user's response.
		this._register(client.onRequest<'item/tool/requestUserInput'>(
			'item/tool/requestUserInput',
			params => this._handleUserInputRequestRpc(params),
		));

		// MCP elicitation requests. An MCP server (relayed by codex) asks the
		// user for structured input mid-tool-call. Surface it through the same
		// chat-input flow as `ask_user` and answer codex with accept/decline/cancel.
		this._register(client.onRequest<'mcpServer/elicitation/request'>(
			'mcpServer/elicitation/request',
			params => this._handleElicitationRequestRpc(params),
		));

		// Seed the MCP server inventory from the freshly-connected app-server.
		// Best-effort and fire-and-forget: failures leave the inventory empty
		// until the next `mcpServer/startupStatus/updated` notification.
		void this._refreshMcpInventory(client);

		return { client, proxyHandle, child };
	}

	/**
	 * Map the session's tools into codex `dynamicTools` specs: the agent host's
	 * server tools (executed in-process) plus the workbench client's tools
	 * (round-tripped to the client). Both are registered with codex the same
	 * way — at `thread/start` — and dispatched apart in
	 * {@link _handleDynamicToolCallRpc} by name.
	 */
	private _buildDynamicTools(session: ICodexSession): DynamicToolSpec[] | undefined {
		const serverTools = this._serverToolHost?.definitions ?? [];
		const clientTools = session.clientToolSet.merged();
		// Server tools first; a server tool name shadows a colliding client tool
		// (the agent host owns those names) and matches the routing order below.
		const seen = new Set<string>();
		const all: ToolDefinition[] = [];
		for (const t of [...serverTools, ...clientTools]) {
			if (seen.has(t.name)) {
				continue;
			}
			seen.add(t.name);
			all.push(t);
		}
		if (all.length === 0) {
			return undefined;
		}
		return all.map(t => ({
			name: t.name,
			description: t.description ?? '',
			inputSchema: (t.inputSchema ?? { type: 'object' }) as JsonValue,
		}));
	}

	private async _handleDynamicToolCallRpc(params: DynamicToolCallParams): Promise<ServerRequestHandlerResult<DynamicToolCallResponse>> {
		const sessionId = this._sessionIdByThreadId.get(params.threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session) {
			return { result: this._toolFailure(`Codex tool call for unknown thread ${params.threadId}`) };
		}
		// Server tools are executed in-process against the session's own state
		// (no workbench round-trip). We register them under their bare name, so
		// codex calls back with `namespace === null`. Dispatch them here before
		// the client-tool path below.
		const host = this._serverToolHost;
		if (host && params.namespace === null && host.toolNames.includes(params.tool)) {
			try {
				const text = host.executeTool(session.sessionUri.toString(), params.tool, params.arguments);
				return { result: { contentItems: [{ type: 'inputText', text }], success: true } };
			} catch (err) {
				return { result: this._toolFailure(`Server tool ${params.tool} failed: ${err instanceof Error ? err.message : String(err)}`) };
			}
		}
		// `item/started` for the `dynamicToolCall` (id === callId) is delivered
		// before this request and seeds the host toolCallId + ChatToolCallReady
		// the owning client reacts to. Look it up so the client's completion
		// (keyed by that toolCallId) resolves this request.
		const toolCallId = session.mapState.itemToToolCall.get(params.callId)?.toolCallId;
		if (toolCallId === undefined) {
			return { result: this._toolFailure(`No pending client tool call for ${params.tool} (callId ${params.callId})`) };
		}
		if (session.clientToolSet.size === 0) {
			return { result: this._toolFailure(`No client available to run ${params.tool}`) };
		}
		try {
			// `register` consumes any result the client already delivered (the
			// display path emits ChatToolCallReady before this request, so the
			// completion can race ahead — PendingRequestRegistry buffers it).
			const result = await session.pendingClientToolCalls.register(toolCallId);
			return { result: dynamicToolResponseFromResult(result) };
		} catch (err) {
			if (err instanceof CancellationError) {
				return { result: this._toolFailure(`Client tool ${params.tool} was cancelled`) };
			}
			return { result: this._toolFailure(`Client tool ${params.tool} failed: ${err instanceof Error ? err.message : String(err)}`) };
		}
	}

	private _toolFailure(message: string): DynamicToolCallResponse {
		this._logService.warn(`[Codex] dynamic tool call failed: ${message}`);
		return { contentItems: [{ type: 'inputText', text: message }], success: false };
	}

	private async _handleUserInputRequestRpc(params: ToolRequestUserInputParams): Promise<ServerRequestHandlerResult<ToolRequestUserInputResponse>> {
		const sessionId = this._sessionIdByThreadId.get(params.threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session) {
			return { result: emptyUserInputResponse(params.questions) };
		}
		// MCP tool-call approvals arrive as a single `request_user_input`
		// question id'd `mcp_tool_call_approval_<callId>`. Render them on the
		// normal tool-approval card (mirroring shell/file approvals) instead of
		// a chat-input question, when the originating `mcpToolCall` item's host
		// tool call is known. Falls through to the chat-input path otherwise.
		const approvalQuestion = params.questions.length === 1 && params.questions[0].id.startsWith(MCP_TOOL_APPROVAL_QUESTION_ID_PREFIX)
			? params.questions[0]
			: undefined;
		if (approvalQuestion) {
			const callId = approvalQuestion.id.slice(MCP_TOOL_APPROVAL_QUESTION_ID_PREFIX.length);
			const entry = session.mapState.itemToToolCall.get(callId);
			if (entry) {
				return this._handleMcpToolApprovalViaCard(session, approvalQuestion, entry);
			}
		}
		const requestId = generateUuid();
		const request = buildUserInputRequest(requestId, params.questions);
		try {
			const result = await session.pendingUserInputs.registerAndFire(requestId, () => {
				this._fire(session.sessionUri, { type: ActionType.ChatInputRequested, request });
			});
			return { result: userInputResponseFromAnswers(params.questions, result.response, result.answers) };
		} catch (err) {
			// Session disposed / connection lost while awaiting; answer codex
			// with empty answers so the turn unwinds instead of hanging.
			return { result: emptyUserInputResponse(params.questions) };
		}
	}

	/**
	 * Renders an MCP tool-call approval on the normal tool-approval card
	 * (a pending-confirmation `ChatToolCallReady` on the originating
	 * `mcpToolCall` host tool call) rather than as a chat-input question.
	 * The user's Allow/Deny decision is mapped back to the answer string
	 * codex expects (`Allow` / `__codex_mcp_decline__`). Mirrors the shell
	 * command approval flow ({@link CodexAgent._handleCommandApprovalRequest}).
	 */
	private async _handleMcpToolApprovalViaCard(
		session: ICodexSession,
		question: ToolRequestUserInputQuestion,
		entry: { readonly toolCallId: string; readonly turnId: string },
	): Promise<{ readonly result: ToolRequestUserInputResponse }> {
		const confirmationTitle = question.question || question.header || 'Run MCP tool';
		let decision: CommandExecutionApprovalDecision;
		try {
			decision = await session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
				this._fire(session.sessionUri, {
					type: ActionType.ChatToolCallReady,
					turnId: entry.turnId,
					toolCallId: entry.toolCallId,
					invocationMessage: confirmationTitle,
					toolInput: confirmationTitle,
					confirmationTitle,
				});
			});
		} catch (err) {
			// Session disposed / connection lost while awaiting; decline so the
			// codex-side MCP tool call unwinds instead of hanging.
			decision = 'decline';
		}
		const allow = decision === 'accept' || decision === 'acceptForSession';
		const answer = allow ? MCP_TOOL_APPROVAL_ANSWER_ALLOW : MCP_TOOL_APPROVAL_ANSWER_DECLINE;
		return { result: { answers: { [question.id]: { answers: [answer] } } } };
	}

	private async _handleElicitationRequestRpc(params: McpServerElicitationRequestParams): Promise<ServerRequestHandlerResult<McpServerElicitationRequestResponse>> {
		const sessionId = this._sessionIdByThreadId.get(params.threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		this._logService.info(`[Codex] elicitation request threadId=${params.threadId} mode=${params.mode} server=${params.serverName} session=${session ? session.sessionId : 'NONE'}`);
		if (!session) {
			this._logService.warn(`[Codex] elicitation request for unknown threadId=${params.threadId}; declining`);
			return { result: declinedElicitationResponse() };
		}
		const requestId = generateUuid();
		const request = buildElicitationRequest(requestId, params);
		try {
			const result = await session.pendingUserInputs.registerAndFire(requestId, () => {
				this._fire(session.sessionUri, { type: ActionType.ChatInputRequested, request });
			});
			this._logService.info(`[Codex] elicitation resolved requestId=${requestId} response=${result.response}`);
			return { result: elicitationResponseFromAnswers(params, result.response, result.answers) };
		} catch (err) {
			// Session disposed / connection lost while awaiting; cancel the
			// elicitation so the MCP server's request unwinds.
			this._logService.info(`[Codex] elicitation cancelled requestId=${requestId}: ${err instanceof Error ? err.message : String(err)}`);
			return { result: cancelledElicitationResponse() };
		}
	}

	private _hostTurnId(session: ICodexSession, appTurnId: string): string {
		return session.hostTurnIdByAppTurnId.get(appTurnId) ?? appTurnId;
	}

	private _withHostTurnId<T extends { readonly turnId: string }>(session: ICodexSession, params: T): T {
		const turnId = this._hostTurnId(session, params.turnId);
		return turnId === params.turnId ? params : { ...params, turnId };
	}

	private _withHostTurn<T extends { readonly turn: { readonly id: string } }>(session: ICodexSession, params: T): T {
		const appTurnId = params.turn.id;
		const hostTurnId = session.currentTurnId ?? this._hostTurnId(session, appTurnId);
		session.hostTurnIdByAppTurnId.set(appTurnId, hostTurnId);
		session.currentAppTurnId = appTurnId;
		return hostTurnId === appTurnId ? params : { ...params, turn: { ...params.turn, id: hostTurnId } };
	}

	private _handleTurnStartedNotification(session: ICodexSession, params: TurnStartedNotification): (SessionAction | ChatAction)[] {
		// The workbench already dispatched the canonical turn start before sendMessage.
		// Codex's event only establishes app-server turn id correlation for later items.
		mapTurnStarted(session.mapState, this._withHostTurn(session, params), session.lastPromptText);
		return [];
	}

	private _handleTurnCompletedNotification(session: ICodexSession, params: TurnCompletedNotification): (SessionAction | ChatAction)[] {
		const appTurnId = params.turn.id;
		const hostTurnId = this._hostTurnId(session, appTurnId);
		const out = mapTurnCompleted(session.mapState, this._withHostTurn(session, params));
		// Remember which codex (app-server) turn each workbench turn maps to so
		// truncateSession can translate a host turn id to a thread rollback even
		// after the live correlation below is cleared.
		session.codexTurnIdByHostTurnId.set(hostTurnId, appTurnId);
		// Codex reports app-server turn ids, while the workbench owns host turn ids.
		// Clear the correlation after completion so later turns cannot reuse stale ids.
		if (session.currentAppTurnId === appTurnId || session.currentTurnId === hostTurnId) {
			session.currentTurnId = undefined;
			session.currentAppTurnId = undefined;
		}
		session.hostTurnIdByAppTurnId.delete(appTurnId);
		// Any steering still buffered was never echoed as a `userMessage`
		// item; clear the pending bubble now that the turn is over.
		this._drainPendingSteering(session);
		return out;
	}

	/**
	 * Dispatch a codex `item/started` notification. `userMessage` items are
	 * intercepted here (rather than in the pure mapper) because steering
	 * promotion needs the agent's per-session turn-correlation state; all
	 * other item kinds defer to {@link mapItemStarted}.
	 */
	private _handleItemStarted(session: ICodexSession, params: ItemStartedNotification): (SessionAction | ChatAction)[] {
		if (params.item.type === 'userMessage') {
			return this._handleSteeredUserMessage(session, params.item.content);
		}
		return mapItemStarted(session.mapState, this._withHostTurnId(session, params));
	}

	/**
	 * Codex echoes every user message — the turn opener (already shown by
	 * the workbench before `sendMessage`) and any steered input — as a
	 * `userMessage` item. Only steered input is buffered in
	 * {@link ICodexSession.pendingSteeringFlips}; a buffered match is
	 * promoted into its own visible turn and everything else is dropped.
	 */
	private _handleSteeredUserMessage(session: ICodexSession, content: readonly UserInput[]): (SessionAction | ChatAction)[] {
		const text = extractUserInputText(content);
		const steering = this._takeMatchingPendingSteering(session, text);
		if (!steering) {
			return [];
		}
		return this._beginSteeringTurn(session, steering);
	}

	/**
	 * Pop the buffered steering message whose text matches the echoed
	 * `userMessage` content. Matching by content (not FIFO) keeps the
	 * mapping correct when several steering messages with different texts
	 * are in flight.
	 */
	private _takeMatchingPendingSteering(session: ICodexSession, text: string): PendingMessage | undefined {
		for (const [id, msg] of session.pendingSteeringFlips) {
			if (msg.message.text === text) {
				session.pendingSteeringFlips.delete(id);
				return msg;
			}
		}
		return undefined;
	}

	/**
	 * Promote a steered message into its own protocol turn: complete the
	 * in-flight turn (so its response parts settle into history) and open a
	 * fresh turn whose user message is the steering content. The
	 * `queuedMessageId` clears the corresponding pending steering bubble.
	 * Subsequent codex items for the same app-server turn are re-mapped to
	 * the new host turn id so the steering response lands there.
	 */
	private _beginSteeringTurn(session: ICodexSession, steering: PendingMessage): (SessionAction | ChatAction)[] {
		const actions: (SessionAction | ChatAction)[] = [];
		const appTurnId = session.currentAppTurnId;
		const previousHostTurnId = session.currentTurnId ?? (appTurnId ? this._hostTurnId(session, appTurnId) : undefined);
		if (previousHostTurnId) {
			actions.push({ type: ActionType.ChatTurnComplete, turnId: previousHostTurnId });
		}
		const newHostTurnId = generateUuid();
		if (appTurnId) {
			session.hostTurnIdByAppTurnId.set(appTurnId, newHostTurnId);
		}
		session.currentTurnId = newHostTurnId;
		resetCodexTurnMapState(session.mapState);
		actions.push({
			type: ActionType.ChatTurnStarted,
			turnId: newHostTurnId,
			message: steering.message,
			queuedMessageId: steering.id,
		});
		return actions;
	}

	/**
	 * Clear any steering messages still buffered (never echoed by codex)
	 * and fire `steering_consumed` for each so the chat UI removes the
	 * lingering pending bubble. Called on turn completion, abort, dispose,
	 * and connection loss.
	 */
	private _drainPendingSteering(session: ICodexSession): void {
		if (session.pendingSteeringFlips.size === 0) {
			return;
		}
		const ids = [...session.pendingSteeringFlips.keys()];
		session.pendingSteeringFlips.clear();
		for (const id of ids) {
			this._fireSteeringConsumed(session, id);
		}
	}

	private _fireSteeringConsumed(session: ICodexSession, id: string): void {
		this._onDidSessionProgress.fire({ kind: 'steering_consumed', chat: URI.parse(buildDefaultChatUri(session.sessionUri)), id });
	}

	private _registerIgnoredNotifications(client: ICodexAppServerClient): void {
		const ignored = [
			'thread/started', // thread/start response is authoritative for session materialization.
			'thread/status/changed', // Codex thread status is not surfaced in Agent Host state yet.
			'thread/settings/updated', // VS Code owns session config; Codex settings echoes are not consumed yet.
			'thread/goal/updated', // Goals are not surfaced in the Agent Host UI yet.
			'thread/goal/cleared', // Goals are not surfaced in the Agent Host UI yet.
			'account/updated', // Account state is read on connect; live account updates are not surfaced yet.
			'account/rateLimits/updated', // Rate-limit UI/state is not implemented yet.
			'remoteControl/status/changed', // Remote-control state is not part of the VS Code integration.
			'serverRequest/resolved', // We resolve requests through JSON-RPC responses, so this echo is informational.
		] as const;
		for (const method of ignored) {
			this._register(client.onNotification(method, () => { /* intentionally ignored */ }));
		}
	}

	private async _logAccountSnapshot(client: ICodexAppServerClient): Promise<void> {
		try {
			const response = await client.request<'account/read', GetAccountResponse>('account/read', { refreshToken: false });
			const accountType = response.account?.type ?? 'none';
			const planType = response.account?.type === 'chatgpt' ? response.account.planType : undefined;
			this._logService.info(`[Codex] account/read accountType=${accountType} requiresOpenaiAuth=${response.requiresOpenaiAuth}${planType ? ` planType=${planType}` : ''}`);
		} catch (err) {
			this._logService.warn(`[Codex] account/read failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private _dispatchByThread(threadId: string, mapFn: (s: ICodexSession) => ReturnType<typeof mapTurnStarted>): void {
		const sessionId = this._sessionIdByThreadId.get(threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session) {
			// Usually an unclaimed prewarm; ignore.
			this._logService.trace(`[Codex] Ignoring notification for untracked threadId=${threadId}; likely unclaimed prewarm`);
			return;
		}
		const actions = mapFn(session);
		for (const action of actions) {
			this._fire(session.sessionUri, action);
		}
	}

	/**
	 * Phase 4: handle `item/commandExecution/requestApproval` from
	 * codex. Look up the host-side tool call for the item, emit a
	 * `ChatToolCallReady` in PendingConfirmation, park on a deferred
	 * keyed by toolCallId, and resolve when the user (or the
	 * accept-for-session memo) decides. Unknown sessions / items
	 * decline silently so codex stops blocking.
	 */
	private async _handleCommandApprovalRequestRpc(params: CommandExecutionRequestApprovalParams): Promise<{ readonly result: CommandExecutionRequestApprovalResponse }> {
		// The request handler must return Codex's JSON-RPC result wrapper; keep
		// the approval method below focused on the host-side permission decision.
		const decision = await this._handleCommandApprovalRequest(params);
		return { result: { decision } };
	}

	private async _handleCommandApprovalRequest(params: {
		readonly threadId: string;
		readonly turnId: string;
		readonly itemId: string;
		readonly command?: string | null;
		readonly reason?: string | null;
	}): Promise<CommandExecutionApprovalDecision> {
		const sessionId = this._sessionIdByThreadId.get(params.threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session) {
			this._logService.warn(`[Codex] commandExecution/requestApproval for unknown threadId=${params.threadId}; declining`);
			return 'decline';
		}
		const entry = session.mapState.itemToToolCall.get(params.itemId);
		if (!entry) {
			this._logService.warn(`[Codex:${sessionId}] commandExecution/requestApproval for unknown itemId=${params.itemId}; declining`);
			return 'decline';
		}
		const command = params.command ?? '';
		// Accept-for-session memo: if the user previously accepted this
		// exact command for the session, auto-accept without prompting.
		if (command && session.acceptedForSession.has(command)) {
			return 'acceptForSession';
		}
		const confirmationTitle = params.reason ?? 'Run shell command';
		// Atomically register the deferred and fire the
		// PendingConfirmation signal so a synchronous responder can't
		// miss the registration.
		const decision = await session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
			this._fire(session.sessionUri, {
				type: ActionType.ChatToolCallReady,
				turnId: entry.turnId,
				toolCallId: entry.toolCallId,
				invocationMessage: command,
				toolInput: command,
				confirmationTitle,
			});
		});
		// Track accept-for-session decisions for the next request.
		if (decision === 'acceptForSession' && command) {
			session.acceptedForSession.add(command);
		}
		return decision;
	}

	private async _handleFileChangeApprovalRequestRpc(params: FileChangeRequestApprovalParams): Promise<{ readonly result: FileChangeRequestApprovalResponse }> {
		const decision = await this._requestItemApproval(params.threadId, params.itemId, params.reason ?? 'Apply file changes');
		return { result: { decision: narrowFileChangeDecision(decision) } };
	}

	private async _handlePermissionsApprovalRequestRpc(params: PermissionsRequestApprovalParams): Promise<{ readonly result: PermissionsRequestApprovalResponse }> {
		const decision = await this._requestItemApproval(params.threadId, params.itemId, params.reason ?? 'Grant elevated permissions');
		const granted = decision === 'accept' || decision === 'acceptForSession';
		return {
			result: {
				// Grant exactly what was requested on accept; nothing on decline.
				permissions: granted
					? { network: params.permissions.network ?? undefined, fileSystem: params.permissions.fileSystem ?? undefined }
					: {},
				scope: decision === 'acceptForSession' ? 'session' : 'turn',
			},
		};
	}

	/**
	 * Shared approval flow for item-scoped `requestApproval` requests that
	 * don't carry their own command string: look up the host tool call for
	 * the item, fire a pending-confirmation `ChatToolCallReady`, and resolve
	 * when the user (via {@link respondToPermissionRequest}) decides. Declines
	 * if the session or item is unknown.
	 */
	private async _requestItemApproval(threadId: string, itemId: string, confirmationTitle: string): Promise<CommandExecutionApprovalDecision> {
		const sessionId = this._sessionIdByThreadId.get(threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session) {
			this._logService.warn(`[Codex] approval request for unknown threadId=${threadId}; declining`);
			return 'decline';
		}
		const entry = session.mapState.itemToToolCall.get(itemId);
		if (!entry) {
			this._logService.warn(`[Codex:${sessionId}] approval request for unknown itemId=${itemId}; declining`);
			return 'decline';
		}
		return session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
			this._fire(session.sessionUri, {
				type: ActionType.ChatToolCallReady,
				turnId: entry.turnId,
				toolCallId: entry.toolCallId,
				invocationMessage: confirmationTitle,
				toolInput: confirmationTitle,
				confirmationTitle,
			});
		});
	}

	private _handleConnectionLost(): void {
		const conn = this._connection;
		if (conn.kind !== 'ready') {
			return;
		}
		this._connection = { kind: 'idle' };
		// Notify every known session with a single ChatError + complete
		// pair so the UI surfaces "agent disconnected" cleanly.
		for (const session of this._sessions.values()) {
			// Unpark any pending approvals so awaiters unwind.
			session.pendingCommandApprovals.denyAll('decline');
			// Reject in-flight client tool calls so their handlers unwind.
			session.pendingClientToolCalls.rejectAll(new CancellationError());
			session.pendingUserInputs.rejectAll(new CancellationError());
			// Clear any buffered steering so its pending bubble doesn't leak.
			this._drainPendingSteering(session);
			const turnId = session.currentTurnId;
			const appTurnId = session.currentAppTurnId;
			session.currentTurnId = undefined;
			session.currentAppTurnId = undefined;
			if (appTurnId) {
				session.hostTurnIdByAppTurnId.delete(appTurnId);
			}
			if (turnId) {
				this._fire(session.sessionUri, {
					type: ActionType.ChatError,
					turnId,
					error: { errorType: 'CodexDisconnected', message: 'Codex app-server disconnected; session must restart.' },
				});
				this._fire(session.sessionUri, { type: ActionType.ChatTurnComplete, turnId });
			}
		}
		// Release resources. The proxy handle is refcounted and drops
		// the underlying server once everyone releases.
		try {
			conn.client.dispose();
		} catch (err) {
			this._logService.error(`[Codex] Failed to dispose app-server client after connection lost: ${err instanceof Error ? err.message : String(err)}`);
		}
		try {
			conn.proxyHandle.dispose();
		} catch (err) {
			this._logService.error(`[Codex] Failed to dispose proxy handle after connection lost: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// #endregion

	// #region IAgent methods

	getDescriptor(): IAgentDescriptor {
		return {
			provider: this.id,
			displayName: localize('codexAgent.displayName', "Codex"),
			description: localize('codexAgent.description', "Codex agent backed by the OpenAI Codex app-server"),
		};
	}

	private _sessionUriFromChat(chat: URI): URI {
		const parsed = parseChatUri(chat);
		return parsed ? URI.parse(parsed.session) : chat;
	}

	// ---- Chat surface ------------------------------------------------------
	//
	// Chat-addressed adoption of the {@link IAgent} surface introduced
	// in gate G-C1. Codex is a SINGLE-CHAT harness: a session owns exactly one
	// (default) chat addressed by its default chat channel URI, so the
	// chat methods simply route to the existing session-addressed
	// implementations. The legacy `(session, chat?)` methods below are kept as a
	// compat shim (removed centrally in gate G-C2) and both surfaces coexist.

	/**
	 * The chat-addressed operation surface for the chats within a session.
	 * Codex is single-chat: peer-chat operations
	 * ({@link IAgentChats.createChat}/{@link IAgentChats.fork})
	 * are unsupported and throw, mirroring today's behavior where Codex omits
	 * `createChat` (the orchestrator rejected multi-chat for Codex). The
	 * remaining methods address the session's single default chat, whose
	 * URI is the deterministic default chat channel URI.
	 */
	readonly chats: IAgentChats = {
		createChat: (_chat: URI, _options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> => {
			throw new Error('Codex agent does not support multiple chats');
		},
		fork: (_chat: URI, _source: IAgentCreateChatForkSource, _options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> => {
			throw new Error('Codex agent does not support chat forking');
		},
		disposeChat: (_chat: URI): Promise<void> => {
			// Codex has no additional (peer) chats to dispose; the
			// default chat lives and dies with its session.
			return Promise.resolve();
		},
		sendMessage: (chat: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, _senderClientId?: string): Promise<void> => {
			return this._sendMessage(chat, prompt, attachments, turnId);
		},
		abort: (chat: URI): Promise<void> => {
			return this._abort(chat);
		},
		changeModel: (chat: URI, model: ModelSelection): Promise<void> => {
			return this._changeModel(chat, model);
		},
		changeAgent: (_chat: URI, _agent: AgentSelection | undefined): Promise<void> => {
			// Codex does not support selecting a custom agent.
			return Promise.resolve();
		},
		getMessages: (chat: URI): Promise<readonly Turn[]> => {
			return this.getSessionMessages(chat);
		},
	};

	async createSession(config: IAgentCreateSessionConfig = {}): Promise<IAgentCreateSessionResult> {
		this._logService.info(`[Codex DEBUG] createSession session=${config.session?.toString() ?? '(none)'} model=${config.model?.id ?? '(none)'} cwd=${config.workingDirectory?.toString() ?? '(none)'}`);
		this._ensureAuthenticated();
		if (config.fork) {
			throw new Error('Codex agent does not support session forking');
		}
		// Codex requires a working directory to start a thread, but the client
		// may not have one to give (e.g. an editor window with no workspace
		// folder open). Rather than reject session creation — which would break
		// both the session and the first-use SDK download progress notification
		// that keys off a successful `createSession` — defer: a managed temp
		// folder is created lazily at materialize time (see `_materialize`).

		// Provisional / lazy materialize. We DON'T call `thread/start` here
		// because the workbench may rebind this URI to a fresh one when the
		// user changes a chip selection, and we'd otherwise leak an
		// orphan codex thread per rebind. The actual `thread/start` happens
		// on the first `sendMessage` (or `getSessionMetadata` for restore).
		const effectiveModel = this._supportedModelOrUndefined(config.model);
		const sessionId = config.session ? AgentSession.id(config.session) : generateUuid();
		const sessionUri = config.session ?? AgentSession.uri(this.id, sessionId);

		// If the workbench is rebinding this URI (createSession arriving
		// after a previous dispose for the same id), reuse the existing
		// entry so we don't lose accumulated state.
		const existing = this._sessions.get(sessionId);
		if (existing) {
			existing.model = effectiveModel ?? existing.model;
			return {
				session: sessionUri,
				workingDirectory: existing.workingDirectory ?? config.workingDirectory,
				provisional: existing.threadId === undefined,
			};
		}

		const clientToolSet = new ActiveClientToolSet();
		const session: ICodexSession = {
			sessionId,
			threadId: undefined,
			sessionUri,
			workingDirectory: config.workingDirectory,
			managedWorkingDirectory: undefined,
			mapState: createCodexSessionMapState(new Set(this._serverToolHost?.toolNames ?? []), clientToolSet),
			pendingCommandApprovals: new PendingRequestRegistry<CommandExecutionApprovalDecision>(),
			acceptedForSession: new Set<string>(),
			pendingSteeringFlips: new Map<string, PendingMessage>(),
			clientToolSet,
			pendingClientToolCalls: new PendingRequestRegistry<ToolCallResult>(),
			pendingUserInputs: new PendingRequestRegistry<ICodexUserInputResult>(),
			materializedToolsSig: undefined,
			firstTurnSent: false,
			model: effectiveModel,
			currentTurnId: undefined,
			currentAppTurnId: undefined,
			hostTurnIdByAppTurnId: new Map<string, string>(),
			codexTurnIdByHostTurnId: new Map<string, string>(),
			needsResume: false,
			lastPromptText: '',
			disposed: false,
			materializePromise: undefined,
			materializedEventFired: false,
			prewarmTimer: undefined,
			prewarmClaimed: false,
			serverToolsAdvertised: false,
			mcpController: undefined,
		};
		this._sessions.set(sessionId, session);
		this._schedulePrewarm(session);
		return {
			session: sessionUri,
			workingDirectory: config.workingDirectory,
			provisional: true,
		};
	}

	/**
	 * Lazily start (or resume) a codex thread for `session`. Idempotent:
	 * if `threadId` is already populated, just returns. Called from
	 * `sendMessage` before the first `turn/start`.
	 */
	private async _materializeIfNeeded(session: ICodexSession, fireMaterializedEvent = true): Promise<void> {
		if (session.disposed) {
			return;
		}
		if (session.threadId !== undefined) {
			if (fireMaterializedEvent) {
				this._fireMaterialized(session);
			}
			return;
		}
		if (session.materializePromise) {
			await session.materializePromise;
			if (fireMaterializedEvent) {
				this._fireMaterialized(session);
			}
			return;
		}
		session.materializePromise = this._materialize(session).finally(() => {
			session.materializePromise = undefined;
		});
		await session.materializePromise;
		if (fireMaterializedEvent) {
			this._fireMaterialized(session);
		}
	}

	private async _materialize(session: ICodexSession): Promise<void> {
		if (session.disposed) {
			return;
		}
		if (!session.workingDirectory) {
			// No working directory was supplied (e.g. an editor window with no
			// workspace folder open). Codex requires one, so create a managed
			// per-session temp folder and remember it for cleanup on dispose.
			const dir = join(os.tmpdir(), 'vscode-agent-codex', session.sessionId);
			await fs.promises.mkdir(dir, { recursive: true });
			session.workingDirectory = URI.file(dir);
			session.managedWorkingDirectory = session.workingDirectory;
			this._logService.info(`[Codex] no working directory supplied for session=${session.sessionUri.toString()}; using managed temp folder ${dir}`);
		}
		const conn = await this._ensureConnection();
		const config = this._readSessionConfig(session);
		const model = await this._resolveModel(session);
		const startResult = await conn.client.request<'thread/start', { thread: { id: string } }>('thread/start', {
			cwd: session.workingDirectory.fsPath,
			model: model.id,
			approvalPolicy: narrowApprovalPolicy(config[CodexSessionConfigKey.ApprovalPolicy]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.ApprovalPolicy],
			sandbox: narrowSandboxMode(config[CodexSessionConfigKey.SandboxMode]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.SandboxMode],
			config: {
				web_search: narrowWebSearchMode(config[CodexSessionConfigKey.WebSearchMode]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.WebSearchMode],
			},
			dynamicTools: this._buildDynamicTools(session),
		});
		const threadId = startResult.thread.id;
		if (session.disposed) {
			try {
				await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId });
			} catch (err) {
				this._logService.info(`[Codex:${threadId}] thread/unsubscribe after disposed prewarm failed: ${err instanceof Error ? err.message : String(err)}`);
			}
			return;
		}
		session.threadId = threadId;
		session.materializedToolsSig = toolsSignature(session.clientToolSet.merged());
		this._logService.info(`[Codex DEBUG] materialized session=${session.sessionUri.toString()} threadId=${session.threadId}`);
		this._sessionIdByThreadId.set(session.threadId, session.sessionId);
		// Advertise the agent host's server tools on this session so clients see
		// them as server-provided. Execution happens in-process via
		// `_handleDynamicToolCallRpc`; the tools were registered with codex in
		// the `dynamicTools` of the `thread/start` above.
		if (!session.serverToolsAdvertised && this._serverToolHost) {
			session.serverToolsAdvertised = true;
			this._serverToolHost.advertise(session.sessionUri.toString());
		}
	}

	/**
	 * Tear down the current codex thread and start a fresh one so the
	 * session's current client tools are registered as `dynamicTools`.
	 * Only safe before any turn has committed history on the thread.
	 */
	private async _restartThreadWithCurrentTools(session: ICodexSession): Promise<void> {
		const conn = this._connection;
		const oldThreadId = session.threadId;
		this._logService.info(`[Codex:${session.sessionId}] restarting thread ${oldThreadId} to apply client tools [${session.clientToolSet.merged().map(t => t.name).join(', ') || '(none)'}]`);
		if (conn.kind === 'ready' && oldThreadId !== undefined) {
			this._sessionIdByThreadId.delete(oldThreadId);
			try {
				await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId: oldThreadId });
			} catch (err) {
				this._logService.info(`[Codex:${oldThreadId}] thread/unsubscribe during tool restart failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
		session.threadId = undefined;
		session.materializePromise = undefined;
		await this._materializeIfNeeded(session);
	}

	private _fireMaterialized(session: ICodexSession): void {
		if (session.disposed) {
			return;
		}
		if (session.materializedEventFired) {
			return;
		}
		session.materializedEventFired = true;
		this._onDidMaterializeSession.fire({
			session: session.sessionUri,
			workingDirectory: session.workingDirectory,
			project: undefined,
		});
	}

	private _schedulePrewarm(session: ICodexSession): void {
		if (!session.workingDirectory) {
			return;
		}
		void (async () => {
			// Prewarm is a background latency optimization, not a user action,
			// so it must NOT trigger a cold SDK download. When the SDK isn't
			// local yet, skip prewarm; the first `sendMessage` materializes the
			// thread and fires the (host-level progress-reported) download then.
			if (!(await this._agentSdkDownloader.isSdkResolvableWithoutDownload(CodexSdkPackage))) {
				this._logService.info(`[Codex] SDK not downloaded yet; skipping prewarm for session=${session.sessionUri.toString()} until a message triggers the download`);
				return;
			}
			await this._materializeIfNeeded(session, false);
			if (session.prewarmClaimed || session.threadId === undefined) {
				return;
			}
			this._logService.info(`[Codex] prewarm ready session=${session.sessionUri.toString()} threadId=${session.threadId}`);
			const prewarmTimer = setTimeout(() => {
				void this._expirePrewarm(session);
			}, CodexPrewarmTtlMs);
			session.prewarmTimer = prewarmTimer;
		})().catch(err => {
			this._logService.warn(`[Codex] prewarm failed session=${session.sessionUri.toString()}: ${err instanceof Error ? err.message : String(err)}`);
		});
	}

	private async _expirePrewarm(session: ICodexSession): Promise<void> {
		if (session.disposed || session.prewarmClaimed || session.threadId === undefined) {
			return;
		}
		const threadId = session.threadId;
		session.threadId = undefined;
		this._sessionIdByThreadId.delete(threadId);
		try {
			const conn = await this._ensureConnection();
			await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId });
			this._logService.info(`[Codex] prewarm TTL eviction session=${session.sessionUri.toString()} threadId=${threadId}`);
		} catch (err) {
			this._logService.warn(`[Codex] prewarm TTL eviction failed session=${session.sessionUri.toString()} threadId=${threadId}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private _persistMaterializedSession(session: ICodexSession): void {
		if (session.disposed || !session.threadId) {
			return;
		}
		// Persist only once the prewarmed thread is claimed by a turn. This
		// avoids restoring an expired, never-used prewarm as a live session.
		void this._metadataStore.write(session.sessionUri, {
			threadId: session.threadId,
			cwd: session.workingDirectory,
			modelId: session.model?.id,
		});
	}

	private _claimPrewarm(session: ICodexSession): void {
		session.prewarmClaimed = true;
		if (session.prewarmTimer) {
			clearTimeout(session.prewarmTimer);
			session.prewarmTimer = undefined;
		}
	}

	private async _sendMessage(chat: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string): Promise<void> {
		const sessionUri = this._sessionUriFromChat(chat);
		this._logService.info(`[Codex DEBUG] sendMessage session=${sessionUri.toString()} prompt=${JSON.stringify(prompt).slice(0, 60)}`);
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			throw new Error(`Codex session not found: ${sessionUri.toString()}`);
		}
		const conn = await this._ensureConnection();
		const effectiveTurnId = turnId ?? generateUuid();

		// Materialize codex thread on first send (provisional → live).
		// `_materializeIfNeeded` is idempotent.
		try {
			this._claimPrewarm(session);
			await this._materializeIfNeeded(session);
			this._persistMaterializedSession(session);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._logService.error(`[Codex:${sessionId}] materialize failed: ${message}`);
			this._fire(sessionUri, {
				type: ActionType.ChatError,
				turnId: effectiveTurnId,
				error: { errorType: 'CodexMaterializeFailed', message },
			});
			this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId });
			return;
		}
		// Codex registers client tools only at `thread/start`. If the thread
		// was prewarmed (or otherwise started) before the current client tools
		// were known, restart it now — before any turn commits history, so
		// nothing is lost — so the tools land in `dynamicTools`.
		if (!session.firstTurnSent && !session.needsResume && toolsSignature(session.clientToolSet.merged()) !== session.materializedToolsSig) {
			try {
				await this._restartThreadWithCurrentTools(session);
				this._persistMaterializedSession(session);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				this._logService.error(`[Codex:${sessionId}] tool re-materialize failed: ${message}`);
				this._fire(sessionUri, {
					type: ActionType.ChatError,
					turnId: effectiveTurnId,
					error: { errorType: 'CodexMaterializeFailed', message },
				});
				this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId });
				return;
			}
		}
		const threadId = session.threadId!;
		if (session.needsResume) {
			try {
				await conn.client.request<'thread/resume'>('thread/resume', {
					threadId,
				});
				session.needsResume = false;
			} catch (err) {
				this._fire(sessionUri, {
					type: ActionType.ChatError,
					turnId: effectiveTurnId,
					error: {
						errorType: 'CodexResumeFailed',
						message: err instanceof Error ? err.message : String(err),
					},
				});
				this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId });
				return;
			}
		}

		const { input, cleanupPaths } = resolveCodexInput(prompt, attachments);
		// Buffer the prompt text for `turn/started`'s userMessage fallback.
		session.lastPromptText = prompt;
		session.currentTurnId = effectiveTurnId;
		try {
			const model = await this._resolveModel(session);
			const turnOptions = this._turnStartOptions(session, model.id);
			await conn.client.request<'turn/start'>('turn/start', {
				threadId,
				input: input.slice(),
				model: model.id,
				...turnOptions,
			});
			// The thread now has committed history; client tools are locked to
			// what was registered at `thread/start` and won't be re-applied.
			session.firstTurnSent = true;
			// We don't await turn completion here — the notification
			// stream emits ChatTurnComplete asynchronously.
		} catch (err) {
			if (err instanceof CancellationError) {
				this._fire(sessionUri, { type: ActionType.ChatTurnCancelled, turnId: effectiveTurnId });
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			this._logService.error(`[Codex:${sessionId}] turn/start error: ${message}`);
			this._fire(sessionUri, {
				type: ActionType.ChatError,
				turnId: effectiveTurnId,
				error: { errorType: 'CodexTurnError', ...extractForwardedErrorInfo(message) },
			});
			this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId });
		} finally {
			// Best-effort temp-file cleanup. Image-on-localImage will be
			// re-read by codex synchronously during the turn so this is
			// safe to defer slightly; we delete after a generous grace.
			if (cleanupPaths.length > 0) {
				setTimeout(() => {
					for (const p of cleanupPaths) {
						try { fs.unlinkSync(p); } catch { /* ignore */ }
					}
				}, 30_000);
			}
		}
	}

	setPendingMessages(sessionUri: URI, steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
		// Queued messages are consumed server-side (AgentSideEffects drives a
		// fresh turn per `idle`); only the single steering message reaches the
		// agent for mid-turn injection.
		if (!steeringMessage) {
			return;
		}
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			return;
		}
		// `_syncPendingMessages` re-sends the current steering message on every
		// pending-state change; ignore a steering message already in flight.
		if (session.pendingSteeringFlips.has(steeringMessage.id)) {
			return;
		}
		const appTurnId = session.currentAppTurnId;
		const conn = this._connection;
		const text = steeringMessage.message.text;
		const hasContent = text.length > 0 || (steeringMessage.message.attachments?.length ?? 0) > 0;
		// Steering only makes sense mid-turn. Without an active codex turn, a
		// ready connection, a thread, or any content we cannot steer — clear
		// the pending bubble so it doesn't stick (the model never saw it).
		if (!appTurnId || conn.kind !== 'ready' || session.threadId === undefined || !hasContent) {
			this._fireSteeringConsumed(session, steeringMessage.id);
			return;
		}
		const { input } = resolveCodexInput(text, steeringMessage.message.attachments);
		const threadId = session.threadId;
		// Buffer so the codex `userMessage` echo can promote this into a
		// visible turn (see {@link _handleSteeredUserMessage}).
		session.pendingSteeringFlips.set(steeringMessage.id, steeringMessage);
		void conn.client.request<'turn/steer'>('turn/steer', {
			threadId,
			input: input.slice(),
			expectedTurnId: appTurnId,
		}).catch(err => {
			// Steer rejected (commonly an `expectedTurnId` mismatch because the
			// turn just completed). Drop the buffered entry and clear the
			// pending bubble so it doesn't stick.
			if (session.pendingSteeringFlips.delete(steeringMessage.id)) {
				this._fireSteeringConsumed(session, steeringMessage.id);
			}
			if (err instanceof JsonRpcError) {
				this._logService.info(`[Codex:${sessionId}] turn/steer skipped: ${err.message}`);
				return;
			}
			this._logService.warn(`[Codex:${sessionId}] turn/steer failed: ${err instanceof Error ? err.message : String(err)}`);
		});
	}

	private async _abort(chat: URI): Promise<void> {
		const sessionUri = this._sessionUriFromChat(chat);
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			return;
		}
		// Clear any steering buffered for the turn we're aborting so its
		// pending bubble doesn't outlive the turn.
		this._drainPendingSteering(session);
		if (!session.currentAppTurnId || session.threadId === undefined) {
			return;
		}
		const threadId = session.threadId;
		const conn = this._connection;
		if (conn.kind !== 'ready') {
			return;
		}
		try {
			await conn.client.request<'turn/interrupt'>('turn/interrupt', {
				threadId,
				turnId: session.currentAppTurnId,
			});
		} catch (err) {
			this._logService.warn(`[Codex:${sessionId}] turn/interrupt failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async disposeSession(sessionUri: URI): Promise<void> {
		this._logService.info(`[Codex DEBUG] disposeSession session=${sessionUri.toString()}`);
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			return;
		}
		session.disposed = true;
		this._claimPrewarm(session);
		this._sessions.delete(sessionId);
		session.mcpController?.dispose();
		// Remove the managed temp folder created for a session that had no
		// client-supplied working directory. Best-effort; the OS temp dir is
		// reclaimed anyway, but clean up proactively so it doesn't accumulate.
		if (session.managedWorkingDirectory) {
			const dir = session.managedWorkingDirectory.fsPath;
			fs.promises.rm(dir, { recursive: true, force: true }).catch(err => {
				this._logService.info(`[Codex] failed to remove managed temp folder ${dir}: ${err instanceof Error ? err.message : String(err)}`);
			});
		}
		if (session.threadId !== undefined) {
			this._sessionIdByThreadId.delete(session.threadId);
		}
		// Unpark any pending approvals so codex doesn't deadlock waiting
		// on a response we will never deliver.
		session.pendingCommandApprovals.denyAll('decline');
		// Reject any in-flight client tool calls so their `item/tool/call`
		// handlers unwind instead of awaiting a response that won't arrive.
		session.pendingClientToolCalls.rejectAll(new CancellationError());
		session.pendingUserInputs.rejectAll(new CancellationError());
		// Clear any buffered steering so its pending bubble doesn't leak.
		this._drainPendingSteering(session);
		const conn = this._connection;
		if (conn.kind === 'ready' && session.threadId !== undefined) {
			const threadId = session.threadId;
			// `thread/unsubscribe` is the codex-native way to release a
			// session. Codex evicts after its 30-minute idle grace.
			try {
				await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId });
			} catch (err) {
				this._logService.info(`[Codex:${threadId}] thread/unsubscribe failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	private async _changeModel(chat: URI, model: ModelSelection): Promise<void> {
		const sessionUri = this._sessionUriFromChat(chat);
		const session = this._sessions.get(AgentSession.id(sessionUri));
		if (session) {
			const supported = this._supportedModelOrUndefined(model);
			if (supported) {
				session.model = supported;
			}
		}
	}

	async truncateSession(sessionUri: URI, turnId?: string): Promise<void> {
		// Codex rolls back by a count of trailing turns. Resolve how many turns
		// follow `turnId` (or all of them when omitted) from the persisted
		// thread, whose turn ids match the workbench's restored turn ids
		// (see {@link replayThreadToTurns}). Unknown ids no-op to avoid data loss.
		const read = await this._readSession(sessionUri);
		if (!read) {
			return;
		}
		const turns = read.thread.turns ?? [];
		if (turns.length === 0) {
			return;
		}
		let numTurns: number;
		if (turnId === undefined) {
			numTurns = turns.length;
		} else {
			// A live session's workbench turn id maps to a codex turn id; a
			// restored session already uses codex turn ids, so fall back to the
			// id as-is on a miss.
			const session = this._sessions.get(AgentSession.id(sessionUri));
			const codexTurnId = session?.codexTurnIdByHostTurnId.get(turnId) ?? turnId;
			const index = turns.findIndex(t => t.id === codexTurnId);
			if (index === -1) {
				this._logService.warn(`[Codex] truncateSession: turnId ${turnId} not found in thread ${read.thread.id}; skipping`);
				return;
			}
			numTurns = turns.length - (index + 1);
		}
		if (numTurns <= 0) {
			return;
		}
		try {
			const conn = await this._ensureConnection();
			await conn.client.request<'thread/rollback'>('thread/rollback', { threadId: read.thread.id, numTurns });
		} catch (err) {
			this._logService.warn(`[Codex:${read.thread.id}] thread/rollback failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async onArchivedChanged(sessionUri: URI, isArchived: boolean): Promise<void> {
		const threadId = await this._resolveThreadId(sessionUri);
		if (threadId === undefined) {
			return;
		}
		const conn = this._connection;
		if (conn.kind !== 'ready') {
			return;
		}
		try {
			if (isArchived) {
				await conn.client.request<'thread/archive'>('thread/archive', { threadId });
			} else {
				await conn.client.request<'thread/unarchive'>('thread/unarchive', { threadId });
			}
		} catch (err) {
			this._logService.warn(`[Codex:${threadId}] thread/${isArchived ? 'archive' : 'unarchive'} failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/** Resolve the codex thread id for a session: in-memory → persisted overlay. */
	private async _resolveThreadId(sessionUri: URI): Promise<string | undefined> {
		const existing = this._sessions.get(AgentSession.id(sessionUri));
		if (existing?.threadId !== undefined) {
			return existing.threadId;
		}
		const overlay = await this._metadataStore.read(sessionUri);
		return overlay.threadId;
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		// `requestId` is the host-side toolCallId; iterate sessions and
		// resolve the first match. Mirrors the Claude/Copilot agents.
		for (const session of this._sessions.values()) {
			if (session.pendingCommandApprovals.respond(requestId, approved ? 'accept' : 'decline')) {
				if (!approved) {
					// Remember the decline so the tool's `item/completed` (which
					// codex reports as a generic failure) maps to `userCancelled`.
					session.mapState.declinedToolCalls.add(requestId);
				}
				return;
			}
		}
		this._logService.info(`[Codex] respondToPermissionRequest: unknown requestId=${requestId}`);
	}

	respondToUserInputRequest(requestId: string, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>): void {
		// `requestId` was minted per request; find the owning session and
		// resolve its parked deferred. Mirrors respondToPermissionRequest.
		for (const session of this._sessions.values()) {
			if (session.pendingUserInputs.respond(requestId, { response, answers })) {
				return;
			}
		}
		this._logService.info(`[Codex] respondToUserInputRequest: unknown requestId=${requestId}`);
	}

	getSessionMessages(chat: URI): Promise<readonly Turn[]> {
		return this._readSession(this._sessionUriFromChat(chat)).then(read => read ? replayThreadToTurns(read.thread) : []);
	}

	async getSessionMetadata(session: URI): Promise<IAgentSessionMetadata | undefined> {
		const sessionId = AgentSession.id(session);
		const read = await this._readSession(session);
		if (!read) {
			return undefined;
		}
		// Register the session in our map so subsequent sendMessage triggers
		// thread/resume (Decision 8). The threadId came from the metadata
		// overlay or from `thread/list` (when the session was materialized
		// in a prior process); `_readSession` returns the resolved id.
		if (!this._sessions.has(sessionId)) {
			const workingDirectory = read.thread.cwd ? URI.file(read.thread.cwd) : undefined;
			const threadId = read.thread.id;
			const clientToolSet = new ActiveClientToolSet();
			this._sessions.set(sessionId, {
				sessionId,
				threadId,
				sessionUri: session,
				workingDirectory,
				managedWorkingDirectory: undefined,
				mapState: createCodexSessionMapState(new Set(this._serverToolHost?.toolNames ?? []), clientToolSet),
				pendingCommandApprovals: new PendingRequestRegistry<CommandExecutionApprovalDecision>(),
				acceptedForSession: new Set<string>(),
				pendingSteeringFlips: new Map<string, PendingMessage>(),
				clientToolSet,
				pendingClientToolCalls: new PendingRequestRegistry<ToolCallResult>(),
				pendingUserInputs: new PendingRequestRegistry<ICodexUserInputResult>(),
				materializedToolsSig: undefined,
				firstTurnSent: true,
				model: undefined,
				currentTurnId: undefined,
				currentAppTurnId: undefined,
				hostTurnIdByAppTurnId: new Map<string, string>(),
				codexTurnIdByHostTurnId: new Map<string, string>(),
				needsResume: true,
				lastPromptText: '',
				disposed: false,
				materializePromise: undefined,
				materializedEventFired: true,
				prewarmTimer: undefined,
				prewarmClaimed: true,
				serverToolsAdvertised: false,
				mcpController: undefined,
			});
			this._sessionIdByThreadId.set(threadId, sessionId);
			// Restored threads skip materialization (the thread already exists),
			// so advertise the server tools here for client-side parity.
			const restored = this._sessions.get(sessionId);
			if (restored && !restored.serverToolsAdvertised && this._serverToolHost) {
				restored.serverToolsAdvertised = true;
				this._serverToolHost.advertise(restored.sessionUri.toString());
			}
		}
		return this._threadToMetadata(read.thread, session);
	}

	private async _readSession(session: URI): Promise<ThreadReadResponse | undefined> {
		// Resolve the codex thread id for this session URI. Resolution
		// order: in-memory session → persisted metadata overlay → URI host
		// (for sessions materialized in a prior process where sessionId
		// equals threadId by convention).
		const sessionId = AgentSession.id(session);
		const existing = this._sessions.get(sessionId);
		let threadId = existing?.threadId;
		if (threadId === undefined) {
			const overlay = await this._metadataStore.read(session);
			threadId = overlay.threadId ?? sessionId;
		}
		try {
			const conn = await this._ensureConnection();
			const response = await conn.client.request<'thread/read', ThreadReadResponse>('thread/read', {
				threadId,
				includeTurns: true,
			});
			return response;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			// `thread not loaded` is app-server's expected response for any
			// thread we have not yet resumed in this process; sendMessage's
			// `thread/resume` path will handle it. Log at info level.
			if (/thread not loaded/i.test(message)) {
				this._logService.info(`[Codex:${threadId}] thread/read: not loaded yet (will resume on first send)`);
			} else {
				this._logService.warn(`[Codex:${threadId}] thread/read failed: ${message}`);
			}
			return undefined;
		}
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		if (!this._githubToken) {
			return [];
		}
		// Don't connect (and trigger a cold SDK download) just to list threads
		// at startup. When the SDK isn't local yet, surface an empty list; the
		// download fires (with host-level progress) once the user starts a
		// session, and the next `listSessions` — driven by the renderer's
		// post-turn refresh — returns the full list.
		if (!(await this._agentSdkDownloader.isSdkResolvableWithoutDownload(CodexSdkPackage))) {
			this._logService.info('[Codex] SDK not downloaded yet; deferring thread/list until a session triggers the download');
			return [];
		}
		try {
			const conn = await this._ensureConnection();
			const response = await conn.client.request<'thread/list', ThreadListResponse>('thread/list', {
				limit: 200,
			});
			// Map persisted threads back to the URI the workbench already
			// knows them by. After `_materializeIfNeeded` runs, the codex
			// thread is persisted to disk under its thread id but the
			// workbench/state-manager keyed the session by its provisional
			// URI (`codex:/<provisional-uuid>`). If we returned a fresh
			// `codex:/<threadId>` URI here, `_refreshSessions` would treat
			// the provisional URI as missing and evict the live session
			// the user is actively viewing.
			const liveUriByThreadId = new Map<string, URI>();
			for (const s of this._sessions.values()) {
				if (s.threadId !== undefined) {
					liveUriByThreadId.set(s.threadId, s.sessionUri);
				}
			}
			return response.data.map(t => this._threadToMetadata(
				t,
				liveUriByThreadId.get(t.id) ?? AgentSession.uri(this.id, t.id),
			));
		} catch (err) {
			this._logService.warn(`[Codex] thread/list failed: ${err instanceof Error ? err.message : String(err)}`);
			return [];
		}
	}

	private _threadToMetadata(thread: Thread, sessionUri: URI): IAgentSessionMetadata {
		return {
			session: sessionUri,
			// Codex returns Unix seconds; the agent host expects ms.
			startTime: (thread.createdAt ?? 0) * 1000,
			modifiedTime: (thread.updatedAt ?? thread.createdAt ?? 0) * 1000,
			summary: thread.name ?? thread.preview ?? undefined,
			workingDirectory: thread.cwd ? URI.file(thread.cwd) : undefined,
		};
	}

	setServerToolHost(host: IAgentServerToolHost): void {
		this._serverToolHost = host;
	}

	getOrCreateActiveClient(session: URI, client: { readonly clientId: string; readonly displayName?: string }): IActiveClient {
		const sessionId = AgentSession.id(session);
		return new CodexActiveClientHandle(
			() => this._sessions.get(sessionId),
			client.clientId,
			client.displayName,
			tools => this._logService.info(`[Codex:${sessionId}] active client ${client.clientId} tools=[${tools.map(t => t.name).join(', ') || '(none)'}]`),
		);
	}

	removeActiveClient(session: URI, clientId: string): void {
		const sessionId = AgentSession.id(session);
		this._sessions.get(sessionId)?.clientToolSet.delete(clientId);
	}

	onClientToolCallComplete(session: URI, _chat: URI, toolCallId: string, result: ToolCallResult): void {
		const sessionId = AgentSession.id(session);
		const sess = this._sessions.get(sessionId);
		// `AgentSideEffects` forwards every `ChatToolCallComplete` envelope
		// (including codex-owned tools like shell); a miss is the expected path.
		sess?.pendingClientToolCalls.respondOrBuffer(toolCallId, result);
	}

	setCustomizationEnabled(_uri: string, _enabled: boolean): void {
		// no-op; customizations not yet wired for codex.
	}

	// ---- MCP servers -------------------------------------------------------

	/**
	 * Surfaces codex's MCP servers to AHP clients as per-session
	 * customizations. Codex has no plugin/directory customization layer, so
	 * every server is a bare top-level {@link McpServerCustomization}. The
	 * returned snapshot reflects the current connection-global inventory;
	 * subsequent lifecycle transitions arrive as customization actions
	 * emitted by the session's {@link McpCustomizationController}.
	 */
	async getSessionCustomizations(sessionUri: URI): Promise<readonly Customization[]> {
		const session = this._sessions.get(AgentSession.id(sessionUri));
		if (!session) {
			return [];
		}
		const controller = this._getOrCreateMcpController(session);
		controller.applyAll(inventoryToSdkServers(this._mcpInventory));
		this._refreshMcpCustomizationIds(session, controller);
		return controller.topLevelCustomizations();
	}

	/**
	 * Routes an MCP request received on this session's `mcp://` side channel
	 * to codex. Read-only methods (`tools/list`, `resources/list`,
	 * `resources/templates/list`) are answered from the cached inventory;
	 * `tools/call` and `resources/read` round-trip to the app-server with the
	 * session's thread id. Unknown servers / methods reject with
	 * `Method not found` so the protocol server maps them to JSON-RPC
	 * `-32601`.
	 */
	async handleMcpRequest(sessionUri: URI, serverName: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			throw new Error(`Method not found: no active session ${sessionId}`);
		}
		const entry = this._mcpInventory.get(serverName);
		if (!entry) {
			throw new Error(`Method not found: unknown MCP server '${serverName}'`);
		}
		const read = buildCodexMcpReadResult(method, entry);
		if (read.handled) {
			return read.result;
		}
		switch (method) {
			case 'tools/call': {
				const tool = params && typeof params['name'] === 'string' ? params['name'] : undefined;
				if (!tool) {
					throw new Error(`tools/call missing 'name' parameter`);
				}
				const threadId = await this._ensureThreadId(session);
				const conn = await this._ensureConnection();
				return conn.client.request<'mcpServer/tool/call', McpServerToolCallResponse>('mcpServer/tool/call', {
					threadId,
					server: serverName,
					tool,
					arguments: (params ? params['arguments'] : undefined) as JsonValue,
				});
			}
			case 'resources/read': {
				const uri = params && typeof params['uri'] === 'string' ? params['uri'] : undefined;
				if (!uri) {
					throw new Error(`resources/read missing 'uri' parameter`);
				}
				const threadId = await this._ensureThreadId(session);
				const conn = await this._ensureConnection();
				return conn.client.request<'mcpServer/resource/read', McpResourceReadResponse>('mcpServer/resource/read', {
					threadId,
					server: serverName,
					uri,
				});
			}
			default:
				throw new Error(`Method not found: ${method}`);
		}
	}

	/**
	 * Lazily create the per-session {@link McpCustomizationController}. Not
	 * registered on the agent (sessions come and go) — disposed explicitly
	 * when the session is removed.
	 */
	private _getOrCreateMcpController(session: ICodexSession): McpCustomizationController {
		if (!session.mcpController) {
			session.mcpController = new McpCustomizationController({
				providerId: this.id,
				sessionId: session.sessionId,
				resolveChildId: () => undefined,
				emit: action => this._fire(session.sessionUri, action),
				capabilities: CODEX_MCP_APP_CAPABILITIES,
			});
		}
		return session.mcpController;
	}

	/** Mirrors the connection-global inventory onto every live session. */
	private _applyMcpInventoryToSessions(): void {
		const servers = inventoryToSdkServers(this._mcpInventory);
		for (const session of this._sessions.values()) {
			if (session.disposed) {
				continue;
			}
			const controller = this._getOrCreateMcpController(session);
			controller.applyAll(servers);
			this._refreshMcpCustomizationIds(session, controller);
		}
	}

	/**
	 * Refreshes the session's mapper snapshot of server name → customization id
	 * (read when stamping the MCP contributor on tool calls). Plain data, owned
	 * here — the mapper never reaches back into the controller. Must run on every
	 * inventory change because MCP servers are discovered asynchronously, after a
	 * session (and possibly its first tool call) already exists.
	 */
	private _refreshMcpCustomizationIds(session: ICodexSession, controller: McpCustomizationController): void {
		const ids = session.mapState.mcpCustomizationIds;
		ids.clear();
		for (const serverName of this._mcpInventory.keys()) {
			const id = controller.customizationIdForServer(serverName);
			if (id !== undefined) {
				ids.set(serverName, id);
			}
		}
	}

	/**
	 * Re-reads the full MCP inventory from the app-server (paginated) and
	 * re-publishes it to every session. Fires `notifications/tools/list_changed`
	 * on each ready channel whose tool set changed.
	 */
	private async _refreshMcpInventory(client: ICodexAppServerClient): Promise<void> {
		let data: ListMcpServerStatusResponse['data'] = [];
		try {
			let cursor: string | null | undefined = null;
			do {
				const response: ListMcpServerStatusResponse = await client.request<'mcpServerStatus/list', ListMcpServerStatusResponse>('mcpServerStatus/list', { cursor, detail: 'full' });
				data = data.concat(response.data);
				cursor = response.nextCursor;
			} while (cursor);
		} catch (err) {
			this._logService.warn(`[Codex] Failed to list MCP servers: ${err instanceof Error ? err.message : String(err)}`);
			return;
		}
		// Drop the result if the connection was replaced while we were listing.
		if (this._connection.kind === 'ready' && this._connection.client !== client) {
			return;
		}
		const next = codexMcpListToInventory(data);
		const toolsChanged: string[] = [];
		for (const [name, entry] of next) {
			const prev = this._mcpInventory.get(name);
			if (prev && codexMcpToolsChanged(prev, entry)) {
				toolsChanged.push(name);
			}
		}
		this._mcpInventory.clear();
		for (const [name, entry] of next) {
			this._mcpInventory.set(name, entry);
		}
		this._applyMcpInventoryToSessions();
		for (const name of toolsChanged) {
			this._fireMcpToolsListChanged(name);
		}
	}

	/**
	 * Handles a `mcpServer/startupStatus/updated` notification. `ready`
	 * triggers a full inventory refresh (to pull the now-loaded tools);
	 * other transitions update the cached state in place so the UI sees the
	 * server settle into starting/error/stopped promptly.
	 */
	private _handleMcpStartupStatus(client: ICodexAppServerClient, name: string, status: McpServerStartupState, error: string | null): void {
		if (this._connection.kind === 'ready' && this._connection.client !== client) {
			return;
		}
		if (status === 'ready') {
			void this._refreshMcpInventory(client);
			return;
		}
		if (status === 'cancelled') {
			this._mcpInventory.delete(name);
		} else {
			const prev = this._mcpInventory.get(name);
			this._mcpInventory.set(name, {
				state: translateCodexMcpStartupState(status, error),
				tools: prev?.tools ?? [],
				resources: prev?.resources ?? [],
				resourceTemplates: prev?.resourceTemplates ?? [],
			});
		}
		this._applyMcpInventoryToSessions();
	}

	/**
	 * Broadcasts `notifications/tools/list_changed` for `serverName` on every
	 * session whose channel for that server is currently ready. Clients
	 * refetch `tools/list` in response.
	 */
	private _fireMcpToolsListChanged(serverName: string): void {
		for (const session of this._sessions.values()) {
			const channel = session.mcpController?.channelForServer(serverName);
			if (channel) {
				this._onMcpNotification.fire({ channel, method: 'notifications/tools/list_changed' });
			}
		}
	}

	/**
	 * Ensures the session has a materialized codex thread and returns its id.
	 * MCP tool calls (`mcpServer/tool/call`) are thread-scoped, so a call
	 * arriving before the first turn lazily starts the thread.
	 */
	private async _ensureThreadId(session: ICodexSession): Promise<string> {
		await this._materializeIfNeeded(session, false);
		if (session.threadId === undefined) {
			throw new Error(`Cannot run MCP tool: codex session ${session.sessionId} is not materialized`);
		}
		return session.threadId;
	}

	async shutdown(): Promise<void> {
		if (this._connection.kind === 'ready') {
			try { this._connection.client.dispose(); } catch { /* ignore */ }
			try { this._connection.proxyHandle.dispose(); } catch { /* ignore */ }
		}
		this._connection = { kind: 'idle' };
		for (const s of this._sessions.values()) {
			s.pendingCommandApprovals.denyAll('decline');
			s.pendingClientToolCalls.rejectAll(new CancellationError());
			s.pendingUserInputs.rejectAll(new CancellationError());
			s.mcpController?.dispose();
		}
		this._sessions.clear();
		this._sessionIdByThreadId.clear();
		this._mcpInventory.clear();
	}

	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		const values = codexSessionConfigSchema.validateOrDefault(params.config, codexSessionConfigDefaults);
		const isWorkspaceWrite = values[CodexSessionConfigKey.SandboxMode] === 'workspace-write';
		const schema = isWorkspaceWrite
			? codexWorkspaceWriteSessionConfigSchema.toProtocol()
			: codexVisibleSessionConfigSchema.toProtocol();
		const resolvedValues: Record<string, unknown> = {
			[SessionConfigKey.Mode]: values[SessionConfigKey.Mode],
			[CodexSessionConfigKey.ApprovalPolicy]: values[CodexSessionConfigKey.ApprovalPolicy],
			[CodexSessionConfigKey.SandboxMode]: values[CodexSessionConfigKey.SandboxMode],
			[CodexSessionConfigKey.WebSearchMode]: values[CodexSessionConfigKey.WebSearchMode],
			[CodexSessionConfigKey.Personality]: values[CodexSessionConfigKey.Personality],
			[CodexSessionConfigKey.ReasoningSummary]: values[CodexSessionConfigKey.ReasoningSummary],
		};
		if (isWorkspaceWrite) {
			resolvedValues[CodexSessionConfigKey.NetworkAccessEnabled] = values[CodexSessionConfigKey.NetworkAccessEnabled];
		}
		return Promise.resolve({ values: resolvedValues, schema });
	}

	async sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		if (params.property !== CodexSessionConfigKey.AdditionalDirectories) {
			return { items: [] };
		}
		const query = params.query?.trim();
		if (!query) {
			return { items: [] };
		}
		const workingDirectory = params.workingDirectory?.fsPath;
		const resolved = isAbsolute(query)
			? query
			: resolve(workingDirectory ?? process.cwd(), query);
		const parent = query.endsWith(sep) ? resolved : dirname(resolved);
		const prefix = query.endsWith(sep) ? '' : basename(resolved).toLowerCase();
		try {
			const entries = await fs.promises.readdir(parent, { withFileTypes: true });
			return {
				items: entries
					.filter(entry => entry.isDirectory() && entry.name.toLowerCase().startsWith(prefix))
					.slice(0, 50)
					.map(entry => {
						const value = join(parent, entry.name);
						return { value, label: entry.name, description: value };
					}),
			};
		} catch {
			return { items: [] };
		}
	}

	// #endregion

	private _fire(sessionUri: URI, action: SessionAction | ChatAction): void {
		this._onDidSessionProgress.fire({ kind: 'action', resource: isChatAction(action) ? URI.parse(buildDefaultChatUri(sessionUri)) : sessionUri, action });
	}

	override dispose(): void {
		if (this._connection.kind === 'ready') {
			try { this._connection.client.dispose(); } catch { /* ignore */ }
			try { this._connection.proxyHandle.dispose(); } catch { /* ignore */ }
		}
		this._connection = { kind: 'idle' };
		for (const s of this._sessions.values()) {
			s.pendingCommandApprovals.denyAll('decline');
			s.pendingClientToolCalls.rejectAll(new CancellationError());
			s.pendingUserInputs.rejectAll(new CancellationError());
			s.mcpController?.dispose();
		}
		this._sessions.clear();
		this._sessionIdByThreadId.clear();
		this._mcpInventory.clear();
		super.dispose();
	}
}

function parseBinaryArgs(json: string | undefined): string[] {
	if (!json) {
		return [];
	}
	try {
		const parsed = JSON.parse(json);
		return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
	} catch {
		return [];
	}
}

/**
 * The suffix Codex uses for its platform `optionalDependencies` packages
 * (`@openai/codex-${suffix}`). Codex's Linux binaries are statically
 * musl-linked and ship under the same `linux-<arch>` package regardless of
 * host libc, so this never returns a `-musl` suffix.
 *
 * Returns undefined for unsupported `(platform, arch)` combinations — the
 * caller surfaces the error.
 */
export function codexPackageSuffix(platform: NodeJS.Platform, arch: string): string | undefined {
	if ((platform !== 'linux' && platform !== 'darwin' && platform !== 'win32') ||
		(arch !== 'x64' && arch !== 'arm64')) {
		return undefined;
	}
	return `${platform}-${arch}`;
}

/**
 * Mirrors the triple table inside `@openai/codex/bin/codex.js` so we can spawn
 * the native binary at `vendor/<triple>/bin/codex` directly without going
 * through the JS shim launcher.
 */
export function codexBinaryTriple(sdkTarget: string): string | undefined {
	switch (sdkTarget) {
		case 'linux-x64': return 'x86_64-unknown-linux-musl';
		case 'linux-arm64': return 'aarch64-unknown-linux-musl';
		case 'darwin-x64': return 'x86_64-apple-darwin';
		case 'darwin-arm64': return 'aarch64-apple-darwin';
		case 'win32-x64': return 'x86_64-pc-windows-msvc';
		case 'win32-arm64': return 'aarch64-pc-windows-msvc';
		default: return undefined;
	}
}

/**
 * Locate the SDK root for the dev (running-from-source) fallback by resolving
 * `@openai/codex` — a devDependency in source checkouts — out of this repo's
 * `node_modules`. Returns the directory that *contains* that `node_modules`
 * (i.e. the value `_startConnection` joins `node_modules/@openai/codex-<target>`
 * onto), or undefined when the package can't be resolved (e.g. a built product
 * where it isn't shipped). `@openai/codex` declares no `exports` map, so its
 * `package.json` is resolvable.
 *
 * `resolvePackageJsonPath` is a seam for tests; production resolves the path
 * via {@link defaultResolveCodexPackageJsonPath}.
 */
export async function resolveCodexDevSdkRoot(
	resolvePackageJsonPath: () => string | Promise<string> = defaultResolveCodexPackageJsonPath,
): Promise<string | undefined> {
	try {
		const pkgJson = await resolvePackageJsonPath();
		// <root>/node_modules/@openai/codex/package.json → <root>
		return dirname(dirname(dirname(dirname(pkgJson))));
	} catch {
		return undefined;
	}
}

async function defaultResolveCodexPackageJsonPath(): Promise<string> {
	// Dynamic import of `node:module` (not a static top-level import): the
	// unit-test electron renderer that loads this module for
	// `codexPackagePaths.test` cannot fetch a static `node:module` import, so
	// the sibling WSL/SSH host services resolve `createRequire` the same way
	// for the same reason.
	const { createRequire } = await import('node:module');
	return createRequire(import.meta.url).resolve('@openai/codex/package.json');
}
