/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import type { CopilotSession, CurrentToolMetadata, PermissionMode, PermissionRequest, SessionEvent, SessionEventHandler, SessionEventPayload, SessionEventType, Tool, ToolResultObject, TypedSessionEventHandler } from '@github/copilot-sdk';
import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { PluginFormat } from '../../../agentPlugins/common/pluginParsers.js';
import { isCustomizationEnabled } from '../../common/customizationEnablement.js';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join, sep } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { McpServerType } from '../../../mcp/common/mcpPlatformTypes.js';
import type { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from '../../../telemetry/common/gdprTypings.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { getTelemetryChatSessionId } from '../../common/agentTelemetryCorrelation.js';
import { AgentSession, type AgentSignal, type IAgentActionSignal, type IAgentToolPendingConfirmationSignal } from '../../common/agent.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind } from '../../common/agentHostTelemetry.js';
import type { ChatInputRequestWithPlanReview } from '../../common/agentHostPlanReview.js';
import { AgentFeedbackAttachmentDisplayKind } from '../../common/meta/agentFeedbackAttachments.js';
import { ChatInputRequestPurpose, readChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { readToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { ISessionDataService, type ISessionDatabase } from '../../common/sessionDataService.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { ActionType, type ChatDeltaAction, type ChatErrorAction, type ChatInputRequestedAction, type ChatResponsePartAction, type ChatToolCallCompleteAction, type ChatToolCallDeltaAction, type ChatToolCallReadyAction, type ChatToolCallStartAction, type ChatTurnCompleteAction, type ChatUsageAction, type SessionAction, type StateAction } from '../../common/state/sessionActions.js';
import { MessageAttachmentKind, MessageKind, ResponsePartKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, ToolCallConfirmationReason, ToolCallRiskAssessmentKind, ToolCallRiskAssessmentStatus, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, buildChatUri, buildDefaultChatUri, createSessionState, getInlineToolInput, mergeSessionWithDefaultChat, readSessionPromptCacheState, readUsageInfoMeta, SessionStatus, withSessionPromptCacheState, type ToolResultContent, type ToolResultFileEditContent, type ToolResultTerminalContent, type UsageInfoMeta } from '../../common/state/sessionState.js';
import { TerminalClaimKind } from '../../common/state/protocol/state.js';
import { toHostSnapshotAttachmentMeta } from '../../common/meta/agentSnapshotAttachmentMeta.js';
import { STREAMING_TOOL_DISPLAY_INTERVAL_MS } from '../../common/streamingToolCallDisplay.js';
import { CustomizationEnablementKind, CustomizationType, McpAuthRequiredReason, McpServerStatus, type Customization, type McpServerCustomization } from '../../common/state/protocol/channels-session/state.js';
import { CopilotAgentSession } from '../../node/copilot/copilotAgentSession.js';
import { buildNonPtyShellTerminalUri } from '../../node/copilot/copilotNonPtyShellTerminals.js';
import { buildMcpChannel } from '../../node/shared/mcpCustomizationController.js';
import { buildSandboxConfigForSdk } from '../../node/copilot/sandboxConfigForSdk.js';
import { ActiveClientToolSet } from '../../node/activeClientState.js';
import { type CopilotSessionLaunchPlan, type IActiveClientSnapshot, type ICopilotSessionLauncher, type ICopilotSessionRuntime } from '../../node/copilot/copilotSessionLauncher.js';
import { CopilotSessionWrapper } from '../../node/copilot/copilotSessionWrapper.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { IAgentHostCustomizationEnablementService, type CustomizationEnablementResolution, type ICustomizationEnablementTarget } from '../../node/agentHostCustomizationEnablementService.js';
import { AgentHostPromptCache, IAgentHostPromptCache } from '../../node/agentHostPromptCache.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { TestAgentHostTerminalManager } from './testAgentHostTerminalManager.js';
import { buildCopilotSystemNotification } from '../../node/copilot/copilotSystemNotification.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentHostAutoReplyEnabledConfigKey, AgentHostDisableRepoInfoTelemetryConfigKey, AgentHostGlobalAutoApproveEnabledConfigKey } from '../../common/agentHostSchema.js';
import { CopilotCliConfigKey } from '../../common/copilotCliConfig.js';
import { SEMANTIC_SEARCH_TOOL_NAME } from '../../common/semanticSearchConstants.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from '../../common/toolSearchConstants.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey } from '../../common/sandboxConfigSchema.js';
import { AgentSandboxEnabledValue } from '../../../sandbox/common/settings.js';
import { createNoopGitService, createSessionDataService, createZeroDiffComputeService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { OtelData } from '../../common/otlp/otlpLogEmitter.js';
import { type IAgentServerToolDefinition, IAgentServerToolHost } from '../../common/agentServerTools.js';
import { SessionServerToolName } from '../../common/serverToolNames.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { ICopilotApiService, type ICopilotApiServiceRequestOptions, type ICopilotUtilityChatCompletionRequest, type IRestrictedTelemetryContext } from '../../node/shared/copilotApiService.js';
import { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import type { IAgentHostRestrictedTelemetry, IAgentHostRestrictedTelemetryContext, IAgentHostInternalTelemetryContext, TelemetryMeasurements, TelemetryProps } from '../../node/agentHostRestrictedTelemetry.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';

// ---- Mock CopilotSession (SDK level) ----------------------------------------

/**
 * Minimal mock of the SDK's {@link CopilotSession}. Implements `on()` to
 * store typed handlers, and exposes `fire()` so tests can push events
 * through the real {@link CopilotSessionWrapper} event pipeline.
 */
class MockCopilotSession {
	readonly sessionId = 'test-session-1';
	readonly sendRequests: unknown[] = [];
	readonly sendMessagesRequests: unknown[] = [];
	sendMessagesError: Error | undefined;
	sendMessagesGate: Promise<void> | undefined;
	sendGate: Promise<void> | undefined;
	readonly modeSetCalls: Array<{ mode: 'interactive' | 'plan' | 'autopilot' }> = [];
	readonly permissionModeSetCalls: PermissionMode[] = [];
	permissionModeSetSuccess = true;
	readonly gitHubCredentialUpdates: Array<{ credentials?: { type: 'token'; host: string; token: string } }> = [];
	gitHubCredentialUpdateResult = { success: true, copilotUserResolved: true };
	gitHubCredentialUpdateError: Error | undefined;
	readonly collectLogsCalls: Parameters<CopilotSession['rpc']['debug']['collectLogs']>[0][] = [];
	readonly collectLogsResults: Awaited<ReturnType<CopilotSession['rpc']['debug']['collectLogs']>>[] = [];
	readonly experimentalModeUpdates: boolean[] = [];
	experimentalModeUpdateSuccess = true;
	sandboxConfigUpdateSuccess = true;
	abortCalls = 0;
	abortGate: Promise<void> | undefined;
	readonly compactCalls: unknown[] = [];
	readonly commandListCalls: unknown[] = [];
	readonly commandInvokeCalls: Array<{ name: string; input?: string }> = [];
	readonly fleetStartCalls: Array<{ prompt?: string }> = [];
	fleetStartResult: { started: boolean } = { started: true };
	fleetStartError: unknown = undefined;
	/** Awaited inside `rpc.fleet.start` so a test can hold the RPC in flight. */
	fleetStartGate: Promise<void> | undefined;
	/** Invoked inside `rpc.fleet.start` before it settles, so a test can emit SDK events (e.g. a racing `session.idle`). */
	onFleetStart: (() => void) | undefined = undefined;
	/** Invoked inside `rpc.mode.set`, so a test can race an abort against turn preflight. */
	onModeSet: (() => void) | undefined = undefined;
	/** Invoked inside `rpc.commands.list`, so a test can race an abort against slash-command resolution (before the fleet turn captures its token). */
	onCommandList: (() => void) | undefined = undefined;
	/** Ordered log of the SDK RPCs/sends relevant to turn preflight, so tests can assert cross-RPC ordering. */
	readonly operationLog: string[] = [];
	readonly mcpEnableCalls: Array<{ serverName: string }> = [];
	readonly mcpDisableCalls: Array<{ serverName: string }> = [];
	readonly mcpStartServerCalls: Array<{ serverName: string }> = [];
	readonly mcpStopServerCalls: Array<{ serverName: string }> = [];
	readonly samplingResponses: Parameters<CopilotSession['rpc']['ui']['handlePendingSampling']>[0][] = [];
	readonly registeredEventInterests: string[] = [];
	readonly releasedEventInterests: string[] = [];
	mcpDisableGate: Promise<unknown> | undefined;
	mcpStopServerGate: Promise<unknown> | undefined;
	compactResult: { success: boolean; tokensRemoved: number; messagesRemoved: number; contextWindow?: { currentTokens: number; tokenLimit: number; messagesLength: number } } = { success: true, tokensRemoved: 0, messagesRemoved: 0 };
	compactError: unknown = undefined;
	/** Invoked inside `rpc.history.compact` before it settles, so tests can emit the SDK's in-flight compaction events. */
	onCompact: (() => void) | undefined = undefined;
	commandListResult: {
		commands: Array<{
			name: string;
			kind: 'builtin' | 'skill' | 'client';
			description: string;
			allowDuringAgentExecution: boolean;
			aliases?: string[];
			input?: { hint: string; required?: boolean; preserveMultilineInput?: boolean };
		}>;
	} = { commands: [] };
	commandInvokeResult: { kind: 'text'; text: string; markdown?: boolean } | { kind: 'completed'; message?: string } | { kind: 'agent-prompt'; prompt: string; displayPrompt: string; mode?: 'interactive' | 'plan' | 'autopilot' } = { kind: 'text', text: '' };
	messages: SessionEvent[] = [];
	usageMetricsResult = {
		totalPremiumRequestCost: 0,
		totalUserRequests: 0,
		totalApiDurationMs: 0,
		totalNanoAiu: 0,
		sessionStartTime: new Date().toISOString(),
		codeChanges: { linesAdded: 0, linesRemoved: 0, filesModifiedCount: 0, filesModified: [] },
		modelMetrics: {} as Record<string, { cacheExpiresAt?: string }>,
		currentModel: undefined as string | undefined,
		lastCallInputTokens: 0,
		lastCallOutputTokens: 0,
	};
	/** Rejects the next `usage.getMetrics` call, then clears itself. */
	usageMetricsError: unknown = undefined;
	usageMetricsCalls = 0;
	/** Awaited inside `usage.getMetrics` so tests can hold a refresh in flight. */
	usageMetricsGate: Promise<unknown> | undefined;
	disconnectCalls = 0;
	disconnectGate: Promise<void> | undefined;
	disconnectHook: (() => void) | undefined;
	disconnectError: Error | undefined;
	/**
	 * Per-call gates, consumed in call order, for holding individual reads in flight.
	 * Lets a test make an earlier-issued read resolve after a later one.
	 */
	readonly usageMetricsGates: Array<Promise<unknown>> = [];
	backgroundTasks: Awaited<ReturnType<CopilotSession['rpc']['tasks']['list']>>['tasks'] = [];
	backgroundTaskListCalls = 0;
	backgroundTaskRefreshCalls = 0;
	backgroundTaskListError: Error | undefined;

	private readonly _handlers = new Map<string, Set<(event: SessionEvent) => void>>();
	private readonly _allHandlers = new Set<SessionEventHandler>();
	planReadResult: { exists: boolean; content: string | null; path: string | null } = { exists: false, content: null, path: null };
	planReadPromise: Promise<{ exists: boolean; content: string | null; path: string | null }> | undefined;

	getInstructionSourcesResult: { sources: Array<{ id: string; label: string; sourcePath: string; content: string; type: string; location: string; applyTo?: string[] }> } = { sources: [] };
	getInstructionSourcesError: unknown = undefined;
	getInstructionSourcesCallCount = 0;

	on(handler: SessionEventHandler): () => void;
	on<K extends SessionEventType>(eventType: K, handler: TypedSessionEventHandler<K>): () => void;
	on<K extends SessionEventType>(eventTypeOrHandler: K | SessionEventHandler, handler?: TypedSessionEventHandler<K>): () => void {
		if (typeof eventTypeOrHandler === 'function') {
			this._allHandlers.add(eventTypeOrHandler);
			return () => { this._allHandlers.delete(eventTypeOrHandler); };
		}

		const eventType = eventTypeOrHandler;
		let set = this._handlers.get(eventType);
		if (!set) {
			set = new Set();
			this._handlers.set(eventType, set);
		}
		assert.ok(handler);
		set.add(handler as (event: SessionEvent) => void);
		return () => { set.delete(handler as (event: SessionEvent) => void); };
	}

	/** Push an event through to all registered handlers of the given type. */
	fire<K extends SessionEventType>(type: K, data: SessionEventPayload<K>['data'], overrides?: Partial<Omit<SessionEventPayload<K>, 'type' | 'data'>>): void {
		const event = { type, data, id: 'evt-1', timestamp: new Date().toISOString(), parentId: null, ...overrides } as SessionEventPayload<K>;
		this._accumulateUsageMetrics(type, data);
		const set = this._handlers.get(type);
		if (set) {
			for (const handler of set) {
				handler(event);
			}
		}
		for (const handler of this._allHandlers) {
			handler(event);
		}
	}

	/**
	 * Mirrors the SDK's own usage tracker, which folds the `copilotUsage` billed on
	 * `assistant.usage` (including sub-agent calls) and `session.compaction_complete`
	 * into the session-wide total that `usage.getMetrics` reports.
	 */
	private _accumulateUsageMetrics(type: SessionEventType, data: unknown): void {
		if (type === 'session.model_change') {
			const modelChange = data as { newModel?: string };
			if (modelChange.newModel) {
				this.usageMetricsResult.currentModel = modelChange.newModel;
			}
		}
		if (type === 'assistant.usage') {
			const usage = data as { model?: string; cacheExpiresAt?: string; parentToolCallId?: string };
			if (!usage.parentToolCallId && usage.model) {
				this.usageMetricsResult.currentModel = usage.model;
				if (usage.cacheExpiresAt) {
					this.usageMetricsResult.modelMetrics[usage.model] = { cacheExpiresAt: usage.cacheExpiresAt };
				}
			}
		}
		const billed = type === 'assistant.usage'
			? data
			: type === 'session.compaction_complete'
				? (data as { compactionTokensUsed?: unknown } | undefined)?.compactionTokensUsed
				: undefined;
		const totalNanoAiu = (billed as { copilotUsage?: { totalNanoAiu?: number } } | undefined)?.copilotUsage?.totalNanoAiu;
		if (typeof totalNanoAiu === 'number') {
			this.usageMetricsResult.totalNanoAiu += totalNanoAiu;
		}
	}

	// Stubs for methods the wrapper / session class calls
	async send(request: unknown) {
		this.operationLog.push('send');
		this.sendRequests.push(request);
		await this.sendGate;
		return `message-${this.sendRequests.length}`;
	}
	async abort() {
		this.abortCalls++;
		await this.abortGate;
	}
	async setModel() { }
	async getEvents(): Promise<SessionEvent[]> { return this.messages; }
	async disconnect() {
		this.disconnectCalls++;
		this.disconnectHook?.();
		await this.disconnectGate;
		if (this.disconnectError) {
			throw this.disconnectError;
		}
	}

	readonly rpc = {
		sendMessages: async (request: unknown) => {
			this.sendMessagesRequests.push(request);
			if (this.sendMessagesError) {
				throw this.sendMessagesError;
			}
			await this.sendMessagesGate;
		},
		debug: {
			collectLogs: async (params: Parameters<CopilotSession['rpc']['debug']['collectLogs']>[0]) => {
				this.collectLogsCalls.push(params);
				const result = this.collectLogsResults.shift();
				if (result) {
					return result;
				}
				const { destination } = params;
				return destination.kind === 'directory'
					? { kind: 'directory' as const, path: destination.outputDirectory, entries: [] }
					: { kind: 'archive' as const, path: destination.outputPath, entries: [] };
			},
		},
		mode: {
			get: async () => ({ mode: 'interactive' as const }),
			set: async (params: { mode: 'interactive' | 'plan' | 'autopilot' }) => {
				this.operationLog.push('mode.set');
				this.modeSetCalls.push({ mode: params.mode });
				this.onModeSet?.();
			},
		},
		permissions: {
			setMode: async (params: { mode?: PermissionMode }) => {
				const mode = params.mode ?? 'manual';
				this.operationLog.push('permissions.setMode');
				this.permissionModeSetCalls.push(mode);
				return { success: this.permissionModeSetSuccess, enabled: mode === 'allow-all', mode };
			},
		},
		eventLog: {
			registerInterest: async ({ eventType }: { eventType: string }) => {
				this.registeredEventInterests.push(eventType);
				return { handle: `interest-${this.registeredEventInterests.length}` };
			},
			releaseInterest: async ({ handle }: { handle: string }) => {
				this.releasedEventInterests.push(handle);
				return { success: true };
			},
		},
		ui: {
			handlePendingSampling: async (params: Parameters<CopilotSession['rpc']['ui']['handlePendingSampling']>[0]) => {
				this.samplingResponses.push(params);
				return { success: true };
			},
		},
		gitHubAuth: {
			setCredentials: async (params: { credentials?: { type: 'token'; host: string; token: string } }) => {
				this.gitHubCredentialUpdates.push(params);
				if (this.gitHubCredentialUpdateError) {
					throw this.gitHubCredentialUpdateError;
				}
				return this.gitHubCredentialUpdateResult;
			},
		},
		plan: {
			read: async () => this.planReadPromise ?? this.planReadResult,
			update: async (_params: { content: string }) => { /* no-op */ },
			delete: async () => { /* no-op */ },
		},
		history: {
			compact: async (params?: unknown) => {
				this.compactCalls.push(params ?? null);
				this.onCompact?.();
				if (this.compactError !== undefined) {
					throw this.compactError;
				}
				return this.compactResult;
			},
		},
		commands: {
			list: async (params?: unknown) => {
				this.commandListCalls.push(params ?? null);
				this.onCommandList?.();
				return this.commandListResult;
			},
			invoke: async (params: { name: string; input?: string }) => {
				this.operationLog.push('commands.invoke');
				this.commandInvokeCalls.push(params);
				return this.commandInvokeResult;
			},
		},
		fleet: {
			start: async (params: { prompt?: string }) => {
				this.operationLog.push('fleet.start');
				this.fleetStartCalls.push(params);
				this.onFleetStart?.();
				await this.fleetStartGate;
				if (this.fleetStartError !== undefined) {
					throw this.fleetStartError;
				}
				return this.fleetStartResult;
			},
		},
		tasks: {
			list: async () => {
				this.backgroundTaskListCalls++;
				if (this.backgroundTaskListError) {
					const error = this.backgroundTaskListError;
					this.backgroundTaskListError = undefined;
					throw error;
				}
				const tasks = this.backgroundTasks.map(task => ({ ...task }));
				return { tasks };
			},
			refresh: async () => {
				this.backgroundTaskRefreshCalls++;
				return {};
			},
		},
		mcp: {
			list: async () => {
				if (this.mcpListError !== undefined) {
					throw this.mcpListError;
				}
				return this.mcpListResult;
			},
			enable: async (params: { serverName: string }) => {
				this.mcpEnableCalls.push(params);
				if (this.mcpEnableError !== undefined) {
					throw this.mcpEnableError;
				}
				this.mcpListResult = {
					servers: this.mcpListResult.servers.map(server => server.name === params.serverName ? { ...server, status: 'pending' } : server),
				};
			},
			listTools: async (_params: { serverName: string }) => {
				return { tools: [] };
			},
			disable: async (params: { serverName: string }) => {
				this.mcpDisableCalls.push(params);
				await this.mcpDisableGate;
				this.mcpListResult = {
					servers: this.mcpListResult.servers.map(server => server.name === params.serverName ? { ...server, status: 'disabled' } : server),
				};
			},
			startServer: async (params: { serverName: string }) => {
				this.mcpStartServerCalls.push(params);
				if (this.mcpStartServerError !== undefined) {
					throw this.mcpStartServerError;
				}
				this.mcpListResult = {
					servers: this.mcpListResult.servers.map(server => server.name === params.serverName ? { ...server, status: 'pending' } : server),
				};
			},
			stopServer: async (params: { serverName: string }) => {
				this.mcpStopServerCalls.push(params);
				await this.mcpStopServerGate;
				this.mcpListResult = {
					servers: this.mcpListResult.servers.map(server => server.name === params.serverName ? { ...server, status: 'not_configured' } : server),
				};
			},
			executeSampling: async () => ({ status: 'completed' as const, result: undefined }),
			cancelSamplingExecution: async () => { /* no-op */ },
		},
		options: {
			update: async (params: { sandboxConfig?: unknown; isExperimentalMode?: boolean }) => {
				if (params.sandboxConfig !== undefined) {
					this.operationLog.push('options.update:sandbox');
					this.sandboxConfigUpdates.push(params.sandboxConfig);
				}
				if (params.isExperimentalMode !== undefined) {
					this.experimentalModeUpdates.push(params.isExperimentalMode);
				}
				return { success: params.sandboxConfig !== undefined ? this.sandboxConfigUpdateSuccess : this.experimentalModeUpdateSuccess };
			},
		},
		instructions: {
			getSources: async () => {
				this.getInstructionSourcesCallCount++;
				if (this.getInstructionSourcesError !== undefined) {
					throw this.getInstructionSourcesError;
				}
				return this.getInstructionSourcesResult;
			},
		},
		usage: {
			getMetrics: async () => {
				this.usageMetricsCalls++;
				if (this.usageMetricsError !== undefined) {
					const err = this.usageMetricsError;
					this.usageMetricsError = undefined;
					throw err;
				}
				// Snapshot at call time, like a real RPC whose result reflects the state
				// when the request was served rather than when the caller observes it.
				const snapshot = { ...this.usageMetricsResult };
				await (this.usageMetricsGates.shift() ?? this.usageMetricsGate);
				return snapshot;
			},
		},
	};

	readonly sandboxConfigUpdates: unknown[] = [];

	mcpListResult: { servers: ReadonlyArray<{ name: string; status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled' | 'not_configured'; error?: string }> } = { servers: [] };
	mcpListError: unknown = undefined;
	mcpEnableError: unknown = undefined;
	mcpStartServerError: unknown = undefined;
}

class TestCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	apiEndpoint: string | undefined;
	restrictedTelemetryContext: IRestrictedTelemetryContext = { restrictedTelemetryEnabled: false, trackingId: undefined, telemetryEndpoint: undefined };
	restrictedTelemetryContextError: Error | undefined;

	messages(_githubToken: string, _request: Anthropic.MessageCreateParamsStreaming, _options?: ICopilotApiServiceRequestOptions): AsyncGenerator<Anthropic.MessageStreamEvent>;
	messages(_githubToken: string, _request: Anthropic.MessageCreateParamsNonStreaming, _options?: ICopilotApiServiceRequestOptions): Promise<Anthropic.Message>;
	messages(): AsyncGenerator<Anthropic.MessageStreamEvent> | Promise<Anthropic.Message> { throw new Error('not used'); }
	async countTokens(): Promise<Anthropic.MessageTokensCount> { throw new Error('not used'); }
	async models(): Promise<CCAModel[]> { return []; }
	async responses(): Promise<Response> { throw new Error('not used'); }
	async utilityChatCompletion(_githubToken: string, _request: ICopilotUtilityChatCompletionRequest): Promise<string> { throw new Error('not used'); }
	async resolveRestrictedTelemetryContext() {
		if (this.restrictedTelemetryContextError) {
			throw this.restrictedTelemetryContextError;
		}
		return this.restrictedTelemetryContext;
	}
	async resolveApiEndpoint() { return this.apiEndpoint; }
}

class CapturingRestrictedTelemetryService implements ITelemetryService, IAgentHostRestrictedTelemetry {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sendErrorTelemetry = true;
	readonly sessionId = 'sessionId';
	readonly machineId = 'machineId';
	readonly sqmId = 'sqmId';
	readonly devDeviceId = 'devDeviceId';
	readonly firstSessionDate = 'firstSessionDate';
	readonly events: Array<{ destination: 'enhanced' | 'internal'; eventName: string; properties: TelemetryProps | undefined; measurements?: TelemetryMeasurements }> = [];

	publicLog(): void { }
	publicLog2(): void { }
	publicLogError(): void { }
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
	sendGHTelemetryEvent(): void { }
	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.events.push({ destination: 'enhanced', eventName, properties, ...(measurements ? { measurements } : {}) });
	}
	sendEnhancedGHTelemetryEventForContext(_context: IAgentHostRestrictedTelemetryContext, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.events.push({ destination: 'enhanced', eventName, properties, ...(measurements ? { measurements } : {}) });
	}
	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.events.push({ destination: 'internal', eventName, properties, ...(measurements ? { measurements } : {}) });
	}
	sendInternalMSFTTelemetryEventForContext(_context: IAgentHostInternalTelemetryContext, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.events.push({ destination: 'internal', eventName, properties, ...(measurements ? { measurements } : {}) });
	}
	setCopilotTrackingId(): void { }
	setRestrictedTelemetryEndpoint(): void { }
	setRestrictedTelemetryEnabled(): void { }
	setInternalTelemetryContext(): void { }
}

class CapturingLogService extends NullLogService {
	readonly errors: Array<{ first: string | Error; args: unknown[] }> = [];
	readonly warnings: Array<{ message: string; args: unknown[] }> = [];
	readonly traces: Array<{ message: string; args: unknown[] }> = [];
	readonly infos: Array<{ message: string; args: unknown[] }> = [];

	override trace(message: string, ...args: unknown[]): void {
		this.traces.push({ message, args });
		super.trace(message, ...args);
	}

	override info(message: string, ...args: unknown[]): void {
		this.infos.push({ message, args });
		super.info(message, ...args);
	}

	override error(message: string | Error, ...args: unknown[]): void {
		this.errors.push({ first: message, args });
		super.error(message, ...args);
	}

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push({ message, args });
		super.warn(message, ...args);
	}
}

class CapturingTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sendErrorTelemetry = true;
	readonly sessionId = 'sessionId';
	readonly machineId = 'machineId';
	readonly sqmId = 'sqmId';
	readonly devDeviceId = 'devDeviceId';
	readonly firstSessionDate = 'firstSessionDate';
	readonly events: Array<{ eventName: string; data: unknown }> = [];

	publicLog(): void { }
	publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
		this.events.push({ eventName, data });
	}
	publicLogError(): void { }
	publicLogError2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
		this.events.push({ eventName, data });
	}
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

// ---- Helpers ----------------------------------------------------------------

/**
 * Invokes a client-SDK tool's handler with the minimal fields the SDK
 * contract requires, and narrows the `unknown` return type to
 * {@link ToolResultObject} — which is what {@link CopilotAgentSession}'s
 * handler implementation actually returns.
 */
function invokeClientToolHandler(tool: Pick<Tool, 'name' | 'handler'>, toolCallId: string, args: Record<string, unknown> = {}, availableTools?: CurrentToolMetadata[]): Promise<ToolResultObject> {
	return Promise.resolve(tool.handler!(args, {
		sessionId: 'test-session-1',
		toolCallId,
		toolName: tool.name,
		arguments: args,
		availableTools,
	})) as Promise<ToolResultObject>;
}

type ISessionInternalsForTest = {
	_onDidSessionProgress: { fire(event: AgentSignal): void };
	_editTracker: {
		trackEditStart(path: string): Promise<void>;
		completeEdit(path: string): Promise<void>;
		takeCompletedEdit(turnId: string, toolCallId: string, path: string, toolName: string, toolInput: unknown, modelId: string | undefined): Promise<ToolResultFileEditContent | undefined>;
	};
	_pendingClientToolCalls: {
		register(toolCallId: string): Promise<ToolResultObject>;
		respondOrBuffer(toolCallId: string, value: ToolResultObject): void;
	};
};

function isAction(s: AgentSignal, type: ActionType): s is IAgentActionSignal {
	return s.kind === 'action' && s.action.type === type;
}

function getActions(signals: readonly AgentSignal[]) {
	return signals
		.filter((s): s is IAgentActionSignal => s.kind === 'action')
		.map(s => s.action);
}

function getInputRequest(signal: AgentSignal): ChatInputRequestedAction['request'] {
	assert.strictEqual(signal.kind, 'action');
	if (signal.kind !== 'action') { throw new Error('unreachable'); }
	assert.strictEqual(signal.action.type, ActionType.ChatInputRequested);
	return (signal.action as ChatInputRequestedAction).request;
}

interface TestPermissionRequestBase {
	readonly toolCallId?: string;
	readonly managedApprovalRequired?: boolean;
}

type TestPermissionRequest = TestPermissionRequestBase & ({
	readonly kind: 'read';
	readonly path?: string;
	readonly intention?: string;
	readonly requestSandboxBypass?: boolean;
} | {
	readonly kind: 'write';
	readonly fileName?: string;
	readonly intention?: string;
	readonly diff?: string;
	readonly newFileContents?: string;
	readonly requestSandboxBypass?: boolean;
} | {
	readonly kind: 'shell';
	readonly fullCommandText?: string;
	readonly requestSandboxBypass?: boolean;
} | {
	readonly kind: 'custom-tool';
	readonly toolName?: string;
	readonly args?: Extract<PermissionRequest, { kind: 'custom-tool' }>['args'];
});

function toPermissionRequest(request: TestPermissionRequest): PermissionRequest {
	switch (request.kind) {
		case 'read':
			return { intention: '', path: '', ...request };
		case 'write':
			return { canOfferSessionApproval: false, diff: '', fileName: '', intention: '', ...request };
		case 'shell':
			return {
				canOfferSessionApproval: false,
				commands: [],
				fullCommandText: '',
				hasWriteFileRedirection: false,
				intention: '',
				possiblePaths: [],
				possibleUrls: [],
				...request,
			};
		case 'custom-tool':
			return { toolDescription: '', toolName: '', ...request };
	}
}

type TestCopilotSessionRuntime = Omit<ICopilotSessionRuntime, 'handlePermissionRequest' | 'createClientSdkTools'> & {
	handlePermissionRequest(request: TestPermissionRequest): ReturnType<ICopilotSessionRuntime['handlePermissionRequest']>;
	createClientSdkTools(toolSearchActive?: boolean): ReturnType<ICopilotSessionRuntime['createClientSdkTools']>;
};

async function createAgentSession(disposables: DisposableStore, options?: {
	clientSnapshot?: IActiveClientSnapshot;
	activeClientToolSet?: ActiveClientToolSet;
	environmentServiceRegistration?: 'native' | 'none';
	logService?: ILogService;
	telemetryService?: ITelemetryService;
	captureRuntime?: { current?: ICopilotSessionRuntime };
	workingDirectory?: URI;
	/** Per-key effective config values returned by the fake configuration service. */
	configValues?: Record<string, unknown>;
	/** Per-key root config values returned by the fake configuration service's `getRootValue`. */
	rootValues?: Record<string, unknown>;
	fileContents?: Record<string, string>;
	fileReadErrors?: readonly string[];
	sessionDatabase?: ISessionDatabase;
	/** Configure the mock session before {@link CopilotAgentSession.initializeSession} runs. */
	configureMockSession?: (session: MockCopilotSession) => void;
	sessionCustomizations?: () => readonly Customization[];
	resolveCustomizationEnablement?: (target: ICustomizationEnablementTarget) => CustomizationEnablementResolution;
	initialSessionMeta?: Record<string, unknown>;
	sessionUri?: URI;
	/** Exact persistence/config scope for this chat (`IAgentChatContext.resource`); distinct from `sessionUri` for peer chats. */
	resource?: URI;
	chatChannelUri?: URI;
	/** Optional server-tool host wired into the session. */
	serverToolHost?: IAgentServerToolHost;
	/** Whether the launch plan represents an ephemeral session. */
	isEphemeral?: boolean;
	/** Whether the owning chat surface is scoped to editing a single file. */
	hasScopedEditSurface?: boolean;
	/** Platform used to compute the SDK sandbox policy. Defaults to `'linux'` so sandbox tests are deterministic. */
	platform?: NodeJS.Platform;
	githubToken?: string;
	copilotApiEndpoint?: string;
	gitService?: IAgentHostGitService;
	gitHubEndpointService?: IAgentHostGitHubEndpointService;
	restrictedTelemetryContext?: IRestrictedTelemetryContext;
	restrictedTelemetryContextError?: Error;
	isLaunchTokenCurrent?: () => boolean;
	onTurnEnded?: () => void;
	modelId?: string;
	enableDevelopmentErrorInjection?: boolean;
	resume?: boolean;
	initializeEnablementSession?: (session: string) => Promise<void>;
	beforeLaunch?: () => void;
}): Promise<{
	session: CopilotAgentSession;
	runtime: TestCopilotSessionRuntime;
	mockSession: MockCopilotSession;
	signals: AgentSignal[];
	waitForSignal: (predicate: (signal: AgentSignal) => boolean) => Promise<AgentSignal>;
	terminalManager: TestAgentHostTerminalManager;
	dispatchedActions: readonly StateAction[];
	sessionConfigUpdates: ReadonlyArray<{ session: string; patch: Record<string, unknown> }>;
	setConfigValue: (key: string, value: unknown) => void;
	setRootValue: (key: string, value: unknown) => void;
	fireRootConfigChange: () => void;
	fireSessionConfigChange: (config: Record<string, unknown>, session?: string) => void;
	dispatchSessionAction: (action: StateAction) => void;
}> {
	const progressEmitter = disposables.add(new Emitter<AgentSignal>());
	const signals: AgentSignal[] = [];
	const waiters: { predicate: (signal: AgentSignal) => boolean; deferred: DeferredPromise<AgentSignal> }[] = [];

	disposables.add(progressEmitter.event(signal => {
		signals.push(signal);
		for (let i = waiters.length - 1; i >= 0; i--) {
			if (waiters[i].predicate(signal)) {
				const { deferred } = waiters[i];
				waiters.splice(i, 1);
				deferred.complete(signal);
			}
		}
	}));

	const waitForSignal = (predicate: (signal: AgentSignal) => boolean): Promise<AgentSignal> => {
		const existing = signals.find(predicate);
		if (existing) {
			return Promise.resolve(existing);
		}
		const deferred = new DeferredPromise<AgentSignal>();
		waiters.push({ predicate, deferred });
		return deferred.p;
	};

	const parentSessionUri = AgentSession.uri('copilot', 'test-session-1');
	const sessionUri = options?.sessionUri ?? parentSessionUri;
	const chatChannelUri = options?.chatChannelUri ?? URI.parse(buildDefaultChatUri(sessionUri));
	const mockSession = new MockCopilotSession();
	options?.configureMockSession?.(mockSession);

	const launchPlanBase = {
		client: {
			createSession: async () => mockSession as unknown as CopilotSession,
			resumeSession: async () => mockSession as unknown as CopilotSession,
		},
		activeClientToolSet: new ActiveClientToolSet(),
		sessionId: 'test-session-1',
		workingDirectory: options?.workingDirectory,
		resolvedAgentName: undefined,
		snapshot: options?.clientSnapshot ?? { tools: [], plugins: [], mcpServers: {} },
		shellManager: undefined,
		githubToken: options?.githubToken,
		isEphemeral: options?.isEphemeral,
		hasScopedEditSurface: options?.hasScopedEditSurface,
	};
	const model = options?.modelId ? { id: options.modelId } : undefined;
	const launchPlan: CopilotSessionLaunchPlan = options?.resume
		? {
			...launchPlanBase,
			kind: 'resume',
			workingDirectory: options.workingDirectory ?? URI.file('/workspace'),
			fallback: { model },
		}
		: {
			...launchPlanBase,
			kind: 'create',
			model,
		};
	let launchedRuntime: ICopilotSessionRuntime | undefined;
	const sessionLauncher: ICopilotSessionLauncher = {
		launch: async (_plan, runtime) => {
			options?.beforeLaunch?.();
			launchedRuntime = runtime;
			if (options?.captureRuntime) {
				options.captureRuntime.current = runtime;
			}
			return new CopilotSessionWrapper(mockSession as unknown as CopilotSession);
		}
	};

	const services = new ServiceCollection();
	services.set(ILogService, options?.logService ?? new NullLogService());
	services.set(ITelemetryService, options?.telemetryService ?? new NullTelemetryServiceShape());
	services.set(IAgentHostGitService, options?.gitService ?? createNoopGitService());
	services.set(IAgentHostGitHubEndpointService, options?.gitHubEndpointService ?? createTestGitHubEndpointService());
	services.set(IAgentHostOTelService, {
		_serviceBrand: undefined,
		getSessionTraceContext: () => undefined,
		releaseSessionTraceContext: () => { },
		withTraceContext: <T>(_context: undefined, fn: () => T): T => fn(),
	} as unknown as IAgentHostOTelService);
	const copilotApiService = new TestCopilotApiService();
	copilotApiService.apiEndpoint = options?.copilotApiEndpoint;
	if (options?.restrictedTelemetryContext) {
		copilotApiService.restrictedTelemetryContext = options.restrictedTelemetryContext;
	}
	copilotApiService.restrictedTelemetryContextError = options?.restrictedTelemetryContextError;
	services.set(ICopilotApiService, copilotApiService);
	const storedFileContents = new Map(Object.entries(options?.fileContents ?? {}));
	services.set(IFileService, {
		_serviceBrand: undefined,
		readFile: async (resource: URI) => {
			if (options?.fileReadErrors?.includes(resource.toString()) || options?.fileReadErrors?.includes(resource.fsPath)) {
				throw new Error('read failed');
			}
			return { value: VSBuffer.fromString(storedFileContents.get(resource.toString()) ?? storedFileContents.get(resource.fsPath) ?? '') };
		},
		exists: async (resource: URI) => storedFileContents.has(resource.toString()) || storedFileContents.has(resource.fsPath),
		writeFile: async (resource: URI, content: VSBuffer) => {
			storedFileContents.set(resource.toString(), content.toString());
			return { resource } as Awaited<ReturnType<IFileService['writeFile']>>;
		},
		del: async (resource: URI) => {
			storedFileContents.delete(resource.toString());
			storedFileContents.delete(resource.fsPath);
		},
	} as Partial<IFileService> as IFileService);
	services.set(ISessionDataService, createSessionDataService(options?.sessionDatabase));
	services.set(IDiffComputeService, createZeroDiffComputeService());
	const sessionConfigUpdates: Array<{ session: string; patch: Record<string, unknown> }> = [];
	const configValues = options?.configValues ?? {};
	const rootValues = options?.rootValues ?? {};
	const rootConfigEmitter = disposables.add(new Emitter<void>());
	const sessionConfigEmitter = disposables.add(new Emitter<{ session: string; config: Record<string, unknown>; origin: { clientId: string; clientSeq: number } | undefined }>());
	const customizationEnablementEmitter = disposables.add(new Emitter<{ sessions: readonly string[] }>());
	const fakeConfigurationService: IAgentConfigurationService = {
		_serviceBrand: undefined,
		onDidRootConfigChange: rootConfigEmitter.event,
		onDidSessionConfigChange: sessionConfigEmitter.event,
		// Simple per-key map suffices for tests; the real service walks
		// session → parent → host and validates against the schema, but
		// neither matters here — we just need to surface a value the
		// session class will read. Gated on `sessionUri` (the owning
		// session/configuration scope) so tests can catch a caller that
		// mistakenly reads with a peer chat's own resource URI instead.
		getEffectiveValue: ((session: string, _schema: unknown, key: string) => session === sessionUri.toString() ? configValues[key] : undefined) as IAgentConfigurationService['getEffectiveValue'],
		getEffectiveWorkingDirectories: () => undefined,
		getSessionConfigValues: () => undefined,
		updateSessionConfig: (session, patch) => { sessionConfigUpdates.push({ session, patch }); },
		getRootValue: ((_schema: unknown, key: string) => rootValues[key]) as IAgentConfigurationService['getRootValue'],
		updateRootConfig: () => { /* no-op */ },
		persistRootConfig: () => { /* no-op */ },
		whenIdle: async () => { /* no-op */ },
	};
	services.set(IAgentConfigurationService, fakeConfigurationService);
	const stateManager = disposables.add(new class extends AgentHostStateManager {
		readonly dispatchedActions: StateAction[] = [];
		override dispatchServerAction(channel: string, action: StateAction): void {
			this.dispatchedActions.push(action);
			super.dispatchServerAction(channel, action);
		}
		override getSessionState(session: string) {
			if ((!options?.sessionCustomizations && !options?.initialSessionMeta) || session !== sessionUri.toString()) {
				return super.getSessionState(session);
			}
			const state = createSessionState({
				resource: sessionUri.toString(),
				provider: 'copilot',
				title: 'Test session',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			});
			return mergeSessionWithDefaultChat({
				...state,
				...(options.initialSessionMeta ? { _meta: options.initialSessionMeta } : {}),
				...(options.sessionCustomizations ? { customizations: [...options.sessionCustomizations()] } : {}),
			}, undefined);
		}
	}(new NullLogService()));
	// The session's prompt-cache seam is backed by real host state, so the
	// session must exist for `_meta` to be readable and writable — exactly as
	// in production, where Agent Host creates it before any provider runtime.
	const stateManagerNow = new Date().toISOString();
	stateManager.createSession({
		resource: sessionUri.toString(),
		provider: 'copilot',
		title: 'Test session',
		status: SessionStatus.Idle,
		createdAt: stateManagerNow,
		modifiedAt: stateManagerNow,
		...(options?.initialSessionMeta ? { _meta: options.initialSessionMeta } : {}),
	}, { emitNotification: false });
	services.set(IAgentHostStateManager, stateManager);
	services.set(IAgentHostCustomizationEnablementService, {
		_serviceBrand: undefined,
		onDidChange: customizationEnablementEmitter.event,
		initializeSession: session => options?.initializeEnablementSession?.(session) ?? Promise.resolve(),
		getWorkingDirectoryState: () => ({ kind: 'workspaceless' }),
		resolve: (_session: string, target: ICustomizationEnablementTarget) => {
			if (options?.resolveCustomizationEnablement) {
				return options.resolveCustomizationEnablement(target);
			}
			const customizations = options?.sessionCustomizations?.() ?? [];
			const customization = customizations.find(item => item.id === target.id)
				?? customizations.flatMap(item => item.type === CustomizationType.McpServer ? [] : item.children ?? []).find(item => item.id === target.id);
			const enablement = customization?.type === CustomizationType.McpServer || customization?.type === CustomizationType.Plugin
				? customization.enablement ?? []
				: [];
			return {
				kind: 'resolved',
				enablement,
				enabled: isCustomizationEnabled({ enablement }),
				workingDirectory: { kind: 'workspaceless' },
			};
		},
		applyClientGlobalEnablement: () => ({ kind: 'resolved', enablement: [], enabled: true, workingDirectory: { kind: 'workspaceless' } }),
		replaceEnablement: () => ({ kind: 'resolved', enablement: [], enabled: true, workingDirectory: { kind: 'workspaceless' } }),
		setEnablement: () => ({ kind: 'resolved', enablement: [], enabled: true, workingDirectory: { kind: 'workspaceless' } }),
		whenIdle: async () => { },
	} satisfies IAgentHostCustomizationEnablementService);
	// The session consumes the narrow prompt-cache seam (§8d of
	// MULTI_CHAT_ARCHITECTURE.md) rather than the state manager itself.
	services.set(IAgentHostPromptCache, new AgentHostPromptCache(stateManager));
	const environmentService = {
		_serviceBrand: undefined,
		userHome: URI.file('/mock-home'),
		tmpDir: URI.file('/mock-tmp'),
	} as INativeEnvironmentService;
	if (options?.environmentServiceRegistration !== 'none') {
		services.set(INativeEnvironmentService, environmentService);
	}
	const terminalManager = disposables.add(new TestAgentHostTerminalManager());
	services.set(IAgentHostTerminalManager, terminalManager);
	const instantiationService = disposables.add(new InstantiationService(services));

	const session = disposables.add(instantiationService.createInstance(
		CopilotAgentSession,
		{
			sessionUri,
			resource: options?.resource,
			chatChannelUri,
			rawSessionId: 'test-session-1',
			onDidSessionProgress: progressEmitter,
			sessionLauncher,
			launchPlan,
			shellManager: undefined,
			clientSnapshot: options?.clientSnapshot,
			activeClientToolSet: options?.activeClientToolSet,
			// The owning session's last host-published customization snapshot
			// (§8b), handed to the session by the agent. The session reads it
			// through this accessor instead of shared host state.
			hostCustomizations: () => options?.sessionCustomizations?.() ?? [],
			workingDirectory: options?.workingDirectory,
			serverToolHost: options?.serverToolHost,
			platform: options?.platform ?? 'linux',
			isLaunchTokenCurrent: options?.isLaunchTokenCurrent,
			onTurnEnded: options?.onTurnEnded,
			enableDevelopmentErrorInjection: options?.enableDevelopmentErrorInjection ?? true,
		},
	));

	await session.initializeSession();
	if (!launchedRuntime) {
		throw new Error('Expected session runtime');
	}
	const sdkRuntime = launchedRuntime;
	const runtime: TestCopilotSessionRuntime = {
		...sdkRuntime,
		handlePermissionRequest: request => sdkRuntime.handlePermissionRequest(toPermissionRequest(request)),
		createClientSdkTools: toolSearchActive => sdkRuntime.createClientSdkTools(toolSearchActive ?? false),
	};

	return {
		session,
		runtime,
		mockSession,
		signals,
		waitForSignal,
		terminalManager,
		dispatchedActions: stateManager.dispatchedActions,
		sessionConfigUpdates,
		setConfigValue: (key, value) => { configValues[key] = value; },
		setRootValue: (key, value) => { rootValues[key] = value; },
		fireRootConfigChange: () => rootConfigEmitter.fire(),
		fireSessionConfigChange: (config, session = sessionUri.toString()) => sessionConfigEmitter.fire({ session, config, origin: { clientId: 'test', clientSeq: 1 } }),
		dispatchSessionAction: action => {
			stateManager.dispatchServerAction(sessionUri.toString(), action);
			if (action.type === ActionType.SessionCustomizationsChanged) {
				customizationEnablementEmitter.fire({ sessions: [sessionUri.toString()] });
			}
		},
	};
}

// ---- Tests ------------------------------------------------------------------

/**
 * The exact read-only reminder the Copilot session builds for host-created
 * snapshot attachments (mirrors `_snapshotReadonlyReminder`). Used to assert the
 * main-turn `additionalContext` and the steering `<reminder>` note.
 */
function expectedSnapshotReadonlyNote(paths: string[]): string {
	return 'The following attached files are read-only snapshots of content the user shared '
		+ '(pasted text, an unsaved editor, or a diff view) and must not be edited:\n'
		+ paths.map(path => `- ${path}`).join('\n');
}

suite('CopilotAgentSession', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('initializes customization enablement before launching the SDK session', async () => {
		let initialized = false;
		await createAgentSession(disposables, {
			initializeEnablementSession: async session => {
				assert.strictEqual(session, AgentSession.uri('copilot', 'test-session-1').toString());
				initialized = true;
			},
			beforeLaunch: () => assert.strictEqual(initialized, true),
		});
	});

	test('retains transient host instructions until the delayed prompt hook consumes them', async () => {
		const { session, runtime } = await createAgentSession(disposables);

		await session.send('Inspect the request', undefined, 'turn-1', undefined, undefined, AgentHostClientType.Unknown, ['Rename before working']);

		assert.deepStrictEqual({
			firstHook: runtime.handleUserPromptSubmitted(),
			secondHook: runtime.handleUserPromptSubmitted(),
		}, {
			firstHook: { additionalContext: 'Rename before working' },
			secondHook: undefined,
		});
	});

	test('updates GitHub credentials through the SDK session RPC', async () => {
		const { session, mockSession } = await createAgentSession(disposables);
		await session.initializeSession();

		const result = await session.updateGitHubCredentials('github.com', 'updated-token');

		assert.deepStrictEqual({ result, updates: mockSession.gitHubCredentialUpdates }, {
			result: { success: true, copilotUserResolved: true },
			updates: [{ credentials: { type: 'token', host: 'github.com', token: 'updated-token' } }],
		});
	});

	test('collects SDK debug logs without process logs', async () => {
		const { session, mockSession } = await createAgentSession(disposables);
		const outputDirectory = URI.file('/tmp/agent-host-debug');

		const sessionLogsIncluded = await session.collectDebugLogs(outputDirectory, true);
		const processLogsIncluded = await session.collectDebugLogs(outputDirectory, false);

		assert.deepStrictEqual({
			included: [sessionLogsIncluded, processLogsIncluded],
			calls: mockSession.collectLogsCalls,
		}, {
			included: [false, false],
			calls: [{
				destination: { kind: 'directory', outputDirectory: outputDirectory.fsPath },
				include: { events: true, processLogs: false, shellLogs: true },
			}, {
				destination: { kind: 'directory', outputDirectory: outputDirectory.fsPath },
				include: { events: false, processLogs: false, shellLogs: false },
			}],
		});
	});

	test('retries SDK debug collection while the event log is pending', async () => {
		const { session, mockSession } = await createAgentSession(disposables);
		const testRoot = mkdtempSync(join(tmpdir(), 'copilot-debug-logs-'));
		const outputDirectory = URI.file(join(testRoot, 'output'));
		const retryDirectory = join(testRoot, 'retry');
		mkdirSync(retryDirectory);
		try {
			mockSession.collectLogsResults.push({
				kind: 'directory',
				path: retryDirectory,
				entries: [],
				skippedEntries: [{ bundlePath: 'events.jsonl', path: join(testRoot, 'events.jsonl'), reason: 'not found' }],
			}, {
				kind: 'directory',
				path: outputDirectory.fsPath,
				entries: [{ bundlePath: 'events.jsonl', source: 'events', sizeBytes: 42 }],
			});

			const included = await session.collectDebugLogs(outputDirectory, true);

			assert.deepStrictEqual({
				included,
				callCount: mockSession.collectLogsCalls.length,
				retryDirectoryExists: existsSync(retryDirectory),
			}, {
				included: true,
				callCount: 2,
				retryDirectoryExists: false,
			});
		} finally {
			rmSync(testRoot, { recursive: true, force: true });
		}
	});

	test('does not retry a permanently skipped SDK event log', async () => {
		const { session, mockSession } = await createAgentSession(disposables);
		const outputDirectory = URI.file('/tmp/agent-host-debug');
		mockSession.collectLogsResults.push({
			kind: 'directory',
			path: outputDirectory.fsPath,
			entries: [],
			skippedEntries: [{ bundlePath: 'events.jsonl', path: '/tmp/events.jsonl', reason: 'permission denied' }],
		});

		const included = await session.collectDebugLogs(outputDirectory, true);

		assert.deepStrictEqual({
			included,
			callCount: mockSession.collectLogsCalls.length,
		}, {
			included: false,
			callCount: 1,
		});
	});

	suite('CopilotSessionWrapper', () => {
		test('fires unhandled events when no wrapped listener is registered', () => {
			const mockSession = new MockCopilotSession();
			const wrapper = disposables.add(new CopilotSessionWrapper(mockSession as unknown as CopilotSession));
			const events: string[] = [];
			disposables.add(wrapper.onUnhandledEvent(e => events.push(e.type)));

			mockSession.fire('session.compaction_start', {} as SessionEventPayload<'session.compaction_start'>['data']);

			assert.deepStrictEqual(events, ['session.compaction_start']);
		});

		test('tracks wrapped listener registrations dynamically', () => {
			const mockSession = new MockCopilotSession();
			const wrapper = disposables.add(new CopilotSessionWrapper(mockSession as unknown as CopilotSession));
			const events: string[] = [];
			disposables.add(wrapper.onUnhandledEvent(e => events.push(e.type)));
			const handledListener = wrapper.onSessionCompactionStart(() => { });

			mockSession.fire('session.compaction_start', {} as SessionEventPayload<'session.compaction_start'>['data']);
			handledListener.dispose();
			mockSession.fire('session.compaction_start', {} as SessionEventPayload<'session.compaction_start'>['data']);

			assert.deepStrictEqual(events, ['session.compaction_start']);
		});

		test('reports a completed disconnect separately from a pending disconnect', async () => {
			const disconnectGate = new DeferredPromise<void>();
			const mockSession = new MockCopilotSession();
			mockSession.disconnectGate = disconnectGate.p;
			const wrapper = disposables.add(new CopilotSessionWrapper(mockSession as unknown as CopilotSession));

			const disconnect = wrapper.disconnect();
			const pendingState = wrapper.lifecycleState;
			disconnectGate.complete();
			await disconnect;

			assert.deepStrictEqual({
				pendingState,
				completedState: wrapper.lifecycleState,
			}, {
				pendingState: 'disconnecting',
				completedState: 'disconnected',
			});
		});

		test('returns to active and permits retry after disconnect rejects', async () => {
			const mockSession = new MockCopilotSession();
			mockSession.disconnectError = new Error('disconnect failed');
			const wrapper = disposables.add(new CopilotSessionWrapper(mockSession as unknown as CopilotSession));

			await assert.rejects(wrapper.disconnect(), /disconnect failed/);
			const rejectedState = wrapper.lifecycleState;
			mockSession.disconnectError = undefined;
			await wrapper.disconnect();

			assert.deepStrictEqual({
				rejectedState,
				completedState: wrapper.lifecycleState,
				disconnectCalls: mockSession.disconnectCalls,
			}, {
				rejectedState: 'active',
				completedState: 'disconnected',
				disconnectCalls: 2,
			});
		});
	});

	test('destroySession completes when shutdown arrives before the response', async () => {
		const disconnectStarted = new DeferredPromise<void>();
		const disconnectGate = new DeferredPromise<void>();
		const { session, mockSession } = await createAgentSession(disposables, {
			configureMockSession: mockSession => {
				mockSession.disconnectGate = disconnectGate.p;
				mockSession.disconnectHook = () => { void disconnectStarted.complete(); };
			},
		});

		const destroy = session.destroySession();

		await disconnectStarted.p;
		try {
			mockSession.fire('session.shutdown', {
				shutdownType: 'normal',
				totalApiDurationMs: 0,
			} as unknown as SessionEventPayload<'session.shutdown'>['data']);
			await destroy;
			session.dispose();

			assert.strictEqual(mockSession.disconnectCalls, 1);
		} finally {
			disconnectGate.complete();
		}
	});

	test('reports bounded provider lifecycle state for the active turn', async () => {
		const sendGate = new DeferredPromise<void>();
		const { session, mockSession } = await createAgentSession(disposables, {
			configureMockSession: mockSession => {
				mockSession.sendGate = sendGate.p;
			},
		});
		session.resetTurnState('turn-1');

		assert.deepStrictEqual(session.getTurnDiagnosticSnapshot('turn-1'), {
			state: 'available',
			providerCallState: 'notStarted',
			providerTurnStarted: false,
			providerSessionState: 'active',
		});

		const send = session.send('hello', undefined, 'turn-1');
		while (mockSession.sendRequests.length === 0) {
			await timeout(0);
		}
		assert.deepStrictEqual(session.getTurnDiagnosticSnapshot('turn-1'), {
			state: 'available',
			providerCallState: 'pending',
			providerTurnStarted: false,
			providerSessionState: 'active',
		});

		mockSession.fire('assistant.turn_start', { turnId: 'sdk-turn-1' });
		assert.deepStrictEqual(session.getTurnDiagnosticSnapshot('turn-1'), {
			state: 'available',
			providerCallState: 'pending',
			providerTurnStarted: true,
			providerSessionState: 'active',
		});

		sendGate.complete();
		await send;
		mockSession.fire('session.shutdown', {
			codeChanges: { filesModified: [], linesAdded: 0, linesRemoved: 0 },
			modelMetrics: {},
			sessionStartTime: 0,
			shutdownType: 'routine',
			totalApiDurationMs: 0,
		});

		assert.deepStrictEqual(session.getTurnDiagnosticSnapshot('turn-1'), {
			state: 'available',
			providerCallState: 'resolved',
			providerTurnStarted: true,
			providerSessionState: 'shutdown',
		});
		assert.strictEqual(session.getTurnDiagnosticSnapshot('other-turn'), undefined);
	});

	test('logs SDK events without wrapped handlers', async () => {
		const logService = new CapturingLogService();
		const { mockSession } = await createAgentSession(disposables, { logService });

		mockSession.fire('session.title_changed', { title: 'A new title' } as SessionEventPayload<'session.title_changed'>['data'], {
			ephemeral: true,
			id: 'evt-title',
			timestamp: '2026-06-24T00:00:00.000Z',
		});

		assert.deepStrictEqual(
			logService.traces.filter(t => t.message.includes('Unhandled SDK event')).map(t => t.message),
			['[Copilot:test-session-1] Unhandled SDK event: {"type":"session.title_changed","data":{"title":"A new title"},"id":"evt-title","timestamp":"2026-06-24T00:00:00.000Z","parentId":null,"ephemeral":true}']
		);
	});

	test('logs managed settings resolution and enforcement', async () => {
		const logService = new CapturingLogService();
		const { mockSession } = await createAgentSession(disposables, { logService });

		mockSession.fire('session.managed_settings_resolved', {
			source: 'server',
			serverManaged: true,
			deviceManaged: false,
			managedKeys: ['permissions'],
			bypassPermissionsDisabled: true,
			failClosed: false,
		} as SessionEventPayload<'session.managed_settings_resolved'>['data']);
		mockSession.fire('session.managed_settings_enforced', {
			action: 'bypass_permissions_blocked',
			escalation: 'allow_all',
			setting: 'permissions.disableBypassPermissionsMode',
			failClosed: false,
			message: 'Bypass permissions mode is disabled by enterprise policy.',
		} as SessionEventPayload<'session.managed_settings_enforced'>['data']);

		assert.deepStrictEqual({
			infos: logService.infos.map(entry => entry.message).filter(message => message.includes('Managed settings')),
			warnings: logService.warnings.map(entry => entry.message).filter(message => message.includes('Managed settings')),
		}, {
			infos: ['[Copilot:test-session-1] Managed settings resolved: source=server, managedKeys=permissions, bypassPermissionsDisabled=true, failClosed=false'],
			warnings: ['[Copilot:test-session-1] Managed settings enforced: action=bypass_permissions_blocked, setting=permissions.disableBypassPermissionsMode, escalation=allow_all, failClosed=false, message=Bypass permissions mode is disabled by enterprise policy.'],
		});
	});

	test('maps internal attachment URIs to Copilot SDK path fields', async () => {
		const fileUri = URI.file('/workspace/file.ts');
		const selectionUri = URI.file('/workspace/selection.ts');
		const { session, mockSession } = await createAgentSession(disposables, {
			fileContents: {
				[selectionUri.toString()]: 'alpha\nbeta\n012selected text345\nomega',
			},
		});

		await session.send('hello', [
			{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'file.ts', displayKind: 'document' },
			{
				type: MessageAttachmentKind.Resource,
				uri: selectionUri.toString(),
				label: 'selection.ts',
				displayKind: 'selection',
				selection: {
					range: {
						start: { line: 2, character: 3 },
						end: { line: 2, character: 16 },
					},
				},
			},
		]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'hello',
			attachments: [
				{ type: 'file', path: fileUri.fsPath, displayName: 'file.ts' },
				{
					type: 'selection',
					filePath: selectionUri.fsPath,
					displayName: 'selection.ts',
					text: 'selected text',
					selection: {
						start: { line: 2, character: 3 },
						end: { line: 2, character: 16 },
					},
				},
			],
		}]);
	});

	test('maps symbol Resource attachments to SDK selection so the range survives (#315193)', async () => {
		// Symbols arrive as a Resource with displayKind 'symbol' AND a populated selection.range. Keying the selection
		// branch off the `selection` field (not displayKind === 'selection') keeps the range instead of degrading the
		// symbol to a plain file reference.
		const symbolUri = URI.file('/workspace/sym.ts');
		const { session, mockSession } = await createAgentSession(disposables, {
			fileContents: {
				[symbolUri.toString()]: 'line0\nline1\nfunction foo() {}\nline3',
			},
		});

		await session.send('explain this', [
			{
				type: MessageAttachmentKind.Resource,
				uri: symbolUri.toString(),
				label: 'foo',
				displayKind: 'symbol',
				selection: {
					range: {
						start: { line: 2, character: 9 },
						end: { line: 2, character: 12 },
					},
				},
			},
		]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'explain this',
			attachments: [
				{
					type: 'selection',
					filePath: symbolUri.fsPath,
					displayName: 'foo',
					text: 'foo',
					selection: {
						start: { line: 2, character: 9 },
						end: { line: 2, character: 12 },
					},
				},
			],
		}]);
	});

	test('memoizes the event reconstruction across getMessages/getSubagentMessages and invalidates on log changes', async () => {
		const { session, mockSession } = await createAgentSession(disposables);
		let getEventsCalls = 0;
		mockSession.getEvents = async () => { getEventsCalls++; return mockSession.messages; };

		// A single resume wave reads + reconstructs the event log once, shared
		// by the parent turns and every subagent lookup.
		await session.getMessages();
		await session.getSubagentMessages('tc-x');
		await session.getMessages();
		assert.strictEqual(getEventsCalls, 1, 'event log should be read once for the whole resume wave');

		// A log-mutating event drops the memo so a later read rebuilds from
		// fresh events instead of serving stale turns.
		mockSession.fire('assistant.turn_end', { turnId: 'sdk-0' } as SessionEventPayload<'assistant.turn_end'>['data']);
		await session.getMessages();
		assert.strictEqual(getEventsCalls, 2, 'memo should be invalidated after the event log changes');

		session.resetTurnState('turn-error');
		mockSession.fire('session.error', {
			errorType: 'TestError',
			message: 'something went wrong',
		} as SessionEventPayload<'session.error'>['data']);
		await session.getMessages();
		assert.strictEqual(getEventsCalls, 3, 'memo should be invalidated after a session error');
	});

	test('describes an interrupted restored request without exposing Agent Host terminology', async () => {
		const { session, mockSession } = await createAgentSession(disposables, { resume: true });
		mockSession.messages = [
			{ type: 'user.message', id: 'interrupted-turn', data: { interactionId: 'message-1', content: 'Keep working' } },
			{ type: 'assistant.turn_start', data: { turnId: 'sdk-turn' } },
			{ type: 'assistant.message', data: { messageId: 'message-2', content: 'Partial response' } },
		] as SessionEvent[];

		const turn = (await session.getMessages())[0];

		assert.deepStrictEqual(turn.responseParts.at(-1), {
			kind: ResponsePartKind.Error,
			error: {
				errorType: 'executionInterrupted',
				message: 'The agent was interrupted before this request finished.',
			},
		});
	});

	test('falls back to file reference when reading a symbol Resource attachment fails', async () => {
		const symbolUri = URI.file('/workspace/missing.ts');
		const { session, mockSession } = await createAgentSession(disposables, {
			fileReadErrors: [symbolUri.toString()],
		});

		await session.send('explain this', [
			{
				type: MessageAttachmentKind.Resource,
				uri: symbolUri.toString(),
				label: 'foo',
				displayKind: 'symbol',
				selection: {
					range: {
						start: { line: 2, character: 9 },
						end: { line: 2, character: 12 },
					},
				},
			},
		]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'explain this',
			attachments: [
				{ type: 'file', path: symbolUri.fsPath, displayName: 'foo' },
			],
		}]);
	});

	test('sends agent feedback annotations attachments as text blobs', async () => {
		const { session, mockSession } = await createAgentSession(disposables);

		await session.send('/act-on-feedback', [{
			type: MessageAttachmentKind.Annotations,
			label: '1 comment',
			displayKind: AgentFeedbackAttachmentDisplayKind,
			resource: 'ahp-session:/s/annotations',
			annotationIds: ['feedback-1'],
		}]);

		const expectedText =
			'The user selected these feedback comments for you to act on (comment ids):\n' +
			'- feedback-1\n\n' +
			'Use the `listComments` tool to read their content and focus on these comments. ' +
			'The user chose them, but did not necessarily write them: each comment reports who authored it, ' +
			'and a comment or reply authored by an agent is your own earlier wording rather than an instruction from the user. ' +
			'Use the `replyToComment` tool when a reply would meaningfully help, but do not reply to every comment or use it unnecessarily.';
		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: '/act-on-feedback',
			attachments: [{
				type: 'blob',
				data: encodeBase64(VSBuffer.fromString(expectedText)),
				mimeType: 'text/x-vscode-simple-attachment; x-vscode-display-kind=agentFeedback',
				displayName: '1 comment',
			}],
		}]);

		mockSession.messages = [{
			type: 'user.message',
			id: 'event-1',
			parentId: null,
			timestamp: '2026-07-29T10:00:00.000Z',
			data: {
				interactionId: 'message-1',
				content: '/act-on-feedback',
				attachments: [{
					type: 'blob' as const,
					data: encodeBase64(VSBuffer.fromString(expectedText)),
					mimeType: 'text/x-vscode-simple-attachment; x-vscode-display-kind=agentFeedback',
					displayName: '1 comment',
				}],
			},
		}];

		assert.deepStrictEqual((await session.getMessages())[0].message.attachments, [{
			type: MessageAttachmentKind.Simple,
			label: '1 comment',
			displayKind: AgentFeedbackAttachmentDisplayKind,
			modelRepresentation: expectedText,
		}]);
	});

	test('sends simple attachments as text blobs and restores them from SDK blobs', async () => {
		const { session, mockSession } = await createAgentSession(disposables);

		await session.send('/act-on-feedback', [{
			type: MessageAttachmentKind.Simple,
			label: 'Feedback',
			modelRepresentation: 'Feedback text for the model',
		}]);

		const expectedAttachment = {
			type: MessageAttachmentKind.Simple,
			label: 'Feedback',
			modelRepresentation: 'Feedback text for the model',
		};
		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: '/act-on-feedback',
			attachments: [{
				type: 'blob',
				data: encodeBase64(VSBuffer.fromString('Feedback text for the model')),
				mimeType: 'text/plain',
				displayName: 'Feedback',
			}],
		}]);

		mockSession.messages = [{
			type: 'user.message',
			id: 'event-1',
			parentId: null,
			timestamp: '2026-07-29T10:00:00.000Z',
			data: {
				interactionId: 'message-1',
				content: '/act-on-feedback',
				attachments: [{
					type: 'blob',
					data: encodeBase64(VSBuffer.fromString('Feedback text for the model')),
					mimeType: 'text/plain',
					displayName: 'Feedback',
				}],
			},
		}];

		assert.deepStrictEqual(await session.getMessages(), [{
			id: 'event-1',
			startedAt: '2026-07-29T10:00:00.000Z',
			duration: 0,
			message: {
				text: '/act-on-feedback',
				origin: { kind: MessageKind.User },
				attachments: [expectedAttachment],
			},
			responseParts: [],
			usage: undefined,
			state: 'cancelled',
		}]);
	});

	test('sends display-kind simple attachments as inline text SDK blobs', async () => {
		const { session, mockSession } = await createAgentSession(disposables);
		const attachment = {
			type: MessageAttachmentKind.Simple,
			label: 'Browser Pages',
			displayKind: 'workspace',
			modelRepresentation: 'No browser pages are currently shared with you.',
		} as const;

		await session.send('hello', [attachment]);
		const sdkAttachment = {
			type: 'blob' as const,
			data: encodeBase64(VSBuffer.fromString(attachment.modelRepresentation)),
			mimeType: 'text/x-vscode-simple-attachment; x-vscode-display-kind=workspace',
			displayName: attachment.label,
		};
		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'hello',
			attachments: [sdkAttachment],
		}]);

		mockSession.messages = [{
			type: 'user.message',
			id: 'event-1',
			parentId: null,
			timestamp: new Date().toISOString(),
			data: {
				interactionId: 'message-1',
				content: 'hello',
				attachments: [{
					...sdkAttachment,
					mimeType: 'text/plain; x-vscode-display-kind=workspace',
				}],
			},
		}];

		assert.deepStrictEqual((await session.getMessages())[0].message.attachments, [attachment]);
	});

	test('forwards an embedded resource with a selection as its already-sliced inline blob', async () => {
		const { session, mockSession } = await createAgentSession(disposables);

		// The handler inlines only the selected text into `data`, so the adapter forwards it verbatim (no re-slicing).
		await session.send('what is the selected word?', [{
			type: MessageAttachmentKind.EmbeddedResource,
			label: 'file:test.js',
			displayKind: 'selection',
			data: encodeBase64(VSBuffer.fromString('world')),
			contentType: 'text/plain',
			selection: { range: { start: { line: 1, character: 6 }, end: { line: 1, character: 11 } } },
		}]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'what is the selected word?',
			attachments: [{
				type: 'blob',
				data: encodeBase64(VSBuffer.fromString('world')),
				mimeType: 'text/plain',
				displayName: 'file:test.js',
			}],
		}]);
	});

	test('sends an embedded resource without a selection as the full blob', async () => {
		const { session, mockSession } = await createAgentSession(disposables);

		await session.send('what is in this file?', [{
			type: MessageAttachmentKind.EmbeddedResource,
			label: 'file:test.js',
			displayKind: 'document',
			data: encodeBase64(VSBuffer.fromString('line0\nhello world\nline2')),
			contentType: 'text/plain',
		}]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'what is in this file?',
			attachments: [{
				type: 'blob',
				data: encodeBase64(VSBuffer.fromString('line0\nhello world\nline2')),
				mimeType: 'text/plain',
				displayName: 'file:test.js',
			}],
		}]);
	});

	test('sends a host-created text snapshot as a read-only file reference with a read-only additionalContext note (#331154)', async () => {
		const snapshotUri = URI.file('/data/attachments/id/Pasted text #1.txt');
		const { session, mockSession } = await createAgentSession(disposables);

		await session.send('trim this', [{
			type: MessageAttachmentKind.Resource,
			label: 'Pasted text #1',
			displayKind: 'document',
			uri: snapshotUri.toString(),
			_meta: toHostSnapshotAttachmentMeta('text/plain'),
		}]);

		// The snapshot is sent as an ordinary file (path preserved, plain display name) so the model can
		// read it on demand; the read-only signal rides the user-prompt-submitted additionalContext
		// (the runtime renders it as a <system_reminder>), and the message text is left unchanged.
		assert.deepStrictEqual({
			sendRequests: mockSession.sendRequests,
			additionalContext: session.handleUserPromptSubmitted(),
		}, {
			sendRequests: [{
				prompt: 'trim this',
				attachments: [{ type: 'file', path: snapshotUri.fsPath, displayName: 'Pasted text #1' }],
			}],
			additionalContext: { additionalContext: expectedSnapshotReadonlyNote([snapshotUri.fsPath]) },
		});
	});

	test('sends a snapshotted selection through the selection path so the model keeps the selected text, with a read-only note (#331154)', async () => {
		const snapshotUri = URI.file('/data/attachments/id/snap.txt');
		const { session, mockSession } = await createAgentSession(disposables, {
			fileContents: {
				[snapshotUri.toString()]: 'line0\nhello world\nline2',
			},
		});

		await session.send('what is here?', [{
			type: MessageAttachmentKind.Resource,
			label: 'snap.txt',
			displayKind: 'selection',
			uri: snapshotUri.toString(),
			selection: { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } } },
			_meta: toHostSnapshotAttachmentMeta(undefined),
		}]);

		// A snapshotted selection stays on the selection path so the model still receives the selected
		// text and range; the read-only signal rides the additionalContext note, not the attachment shape.
		assert.deepStrictEqual({
			sendRequests: mockSession.sendRequests,
			additionalContext: session.handleUserPromptSubmitted(),
		}, {
			sendRequests: [{
				prompt: 'what is here?',
				attachments: [{
					type: 'selection',
					filePath: snapshotUri.fsPath,
					displayName: 'snap.txt',
					text: 'hello',
					selection: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
				}],
			}],
			additionalContext: { additionalContext: expectedSnapshotReadonlyNote([snapshotUri.fsPath]) },
		});
	});

	test('keeps a non-text binary snapshot as a read-only file reference (#331154)', async () => {
		const snapshotUri = URI.file('/data/attachments/id/document.pdf');
		const { session, mockSession } = await createAgentSession(disposables);

		await session.send('summarize', [{
			type: MessageAttachmentKind.Resource,
			label: 'document.pdf',
			displayKind: 'document',
			uri: snapshotUri.toString(),
			_meta: toHostSnapshotAttachmentMeta('application/pdf'),
		}]);

		assert.deepStrictEqual({
			sendRequests: mockSession.sendRequests,
			additionalContext: session.handleUserPromptSubmitted(),
		}, {
			sendRequests: [{
				prompt: 'summarize',
				attachments: [{ type: 'file', path: snapshotUri.fsPath, displayName: 'document.pdf' }],
			}],
			additionalContext: { additionalContext: expectedSnapshotReadonlyNote([snapshotUri.fsPath]) },
		});
	});

	test('sends a snapshotted image as a read-only file reference (#331154)', async () => {
		const snapshotUri = URI.file('/data/attachments/id/Pasted Image.png');
		const { session, mockSession } = await createAgentSession(disposables);

		await session.send('what is in this image?', [{
			type: MessageAttachmentKind.Resource,
			label: 'Pasted Image',
			displayKind: 'image',
			uri: snapshotUri.toString(),
			_meta: toHostSnapshotAttachmentMeta('image/png'),
		}]);

		// The runtime materializes the image from its on-disk path, so it is sent as a file reference
		// rather than an inline blob; the read-only signal rides the additionalContext note.
		assert.deepStrictEqual({
			sendRequests: mockSession.sendRequests,
			additionalContext: session.handleUserPromptSubmitted(),
		}, {
			sendRequests: [{
				prompt: 'what is in this image?',
				attachments: [{ type: 'file', path: snapshotUri.fsPath, displayName: 'Pasted Image' }],
			}],
			additionalContext: { additionalContext: expectedSnapshotReadonlyNote([snapshotUri.fsPath]) },
		});
	});

	test('sends paste simple attachments as text blobs', async () => {
		const { session, mockSession } = await createAgentSession(disposables);

		await session.send('continue', [{
			type: MessageAttachmentKind.Simple,
			label: 'Previous conversation',
			displayKind: 'paste',
			modelRepresentation: 'Transcript text',
		}]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'continue',
			attachments: [{
				type: 'blob',
				data: encodeBase64(VSBuffer.fromString('Transcript text')),
				mimeType: 'text/x-vscode-simple-attachment; x-vscode-display-kind=paste',
				displayName: 'Previous conversation',
			}],
		}]);

		mockSession.messages = [{
			type: 'user.message',
			id: 'event-1',
			parentId: null,
			timestamp: new Date().toISOString(),
			data: {
				interactionId: 'message-1',
				content: 'continue',
				attachments: [{
					type: 'blob',
					data: encodeBase64(VSBuffer.fromString('Transcript text')),
					mimeType: 'text/x-vscode-simple-attachment; x-vscode-display-kind=paste',
					displayName: 'Previous conversation',
				}],
			},
		}];

		assert.deepStrictEqual((await session.getMessages())[0].message.attachments, [{
			type: MessageAttachmentKind.Simple,
			label: 'Previous conversation',
			displayKind: 'paste',
			modelRepresentation: 'Transcript text',
		}]);
	});

	test('`/compact` runs the history compact RPC and completes the turn with output', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		await session.send('/compact', undefined, 'turn-compact');

		// The compact command is handled inline via the history RPC and must
		// not fall through to a normal SDK `send()` turn.
		assert.strictEqual(mockSession.compactCalls.length, 1);
		assert.deepStrictEqual(mockSession.sendRequests, []);

		// The turn opened by the server is closed inline (the SDK never fires
		// `onIdle` for the compact path) after emitting the completion message.
		const actions = getActions(signals);
		const responseParts = actions.filter((a): a is ChatResponsePartAction => a.type === ActionType.ChatResponsePart);
		assert.strictEqual(responseParts.length, 1);
		const responsePart = responseParts[0];
		assert.strictEqual(responsePart.part.kind, ResponsePartKind.Markdown);
		if (responsePart.part.kind !== ResponsePartKind.Markdown) {
			throw new Error('unreachable');
		}
		assert.deepStrictEqual({
			turnId: responsePart.turnId,
			kind: responsePart.part.kind,
			content: responsePart.part.content,
		}, {
			turnId: 'turn-compact',
			kind: ResponsePartKind.Markdown,
			content: 'Compaction completed',
		});
		const turnComplete = actions.find(a => a.type === ActionType.ChatTurnComplete);
		assert.ok(turnComplete, 'expected the turn to complete');
		assert.strictEqual((turnComplete as ChatTurnCompleteAction).turnId, 'turn-compact');
	});

	test('`/compact` reports post-compaction context window usage before completing the turn', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.compactResult = { success: true, tokensRemoved: 1200, messagesRemoved: 3, contextWindow: { currentTokens: 4500, tokenLimit: 128000, messagesLength: 7 } };

		await session.send('/compact', undefined, 'turn-compact');

		const actions = getActions(signals);
		const usage = actions.find(a => a.type === ActionType.ChatUsage) as ChatUsageAction | undefined;
		assert.ok(usage, 'expected a usage action reporting the shrunken context window');
		assert.deepStrictEqual({ turnId: usage.turnId, usage: usage.usage }, {
			turnId: 'turn-compact',
			usage: { inputTokens: 4500, outputTokens: 0, model: undefined },
		});
		// Usage must precede the turn completion so the reducer accepts it.
		const usageIndex = actions.findIndex(a => a.type === ActionType.ChatUsage);
		const completeIndex = actions.findIndex(a => a.type === ActionType.ChatTurnComplete);
		assert.ok(usageIndex >= 0 && completeIndex > usageIndex, 'usage emitted before turn complete');
	});

	test('`/compact` skips usage when the SDK omits the context window', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.compactResult = { success: true, tokensRemoved: 0, messagesRemoved: 0 };

		await session.send('/compact', undefined, 'turn-compact');

		const usage = getActions(signals).find(a => a.type === ActionType.ChatUsage);
		assert.strictEqual(usage, undefined, 'no usage action without a context window');
	});

	test('`/compact` carries the last-seen model id on the post-compaction usage', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		// A prior model call sets `_lastSeenModelId`, which the compaction usage
		// reports so the context-usage widget can resolve the context window.
		mockSession.fire('assistant.usage', {
			inputTokens: 10,
			outputTokens: 20,
			model: 'claude-sonnet-4.6',
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		mockSession.compactResult = { success: true, tokensRemoved: 1200, messagesRemoved: 3, contextWindow: { currentTokens: 4500, tokenLimit: 128000, messagesLength: 7 } };

		await session.send('/compact', undefined, 'turn-compact');

		const usage = getActions(signals).reverse().find(a => a.type === ActionType.ChatUsage) as ChatUsageAction | undefined;
		assert.deepStrictEqual(usage?.usage, { inputTokens: 4500, outputTokens: 0, model: 'claude-sonnet-4.6' });
	});

	test('a resumed session does not bill its restored history to the first new turn', async () => {
		// The SDK re-folds usage from its durable event log on resume, so `getMetrics`
		// opens at the accumulated total of everything already billed.
		const { session, mockSession, signals } = await createAgentSession(disposables, {
			configureMockSession: mock => { mock.usageMetricsResult.totalNanoAiu = 40_000_000_000; },
		});

		session.resetTurnState('turn-after-resume');
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.6',
			inputTokens: 10,
			outputTokens: 20,
			copilotUsage: { totalNanoAiu: 500_000_000 },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		await timeout(0);

		const usageActions = getActions(signals).filter(a => a.type === ActionType.ChatUsage) as ChatUsageAction[];
		// The new turn bills only its own call, while the session total carries the history.
		assert.deepStrictEqual(usageActions.at(-1)?.usage._meta?.copilotUsage, {
			totalNanoAiu: 500_000_000,
			sessionTotalNanoAiu: 40_500_000_000,
		});
	});

	test('a failed usage read leaves the turn cost intact', async () => {
		// The turn's own cost comes from the events, so a metrics outage costs only
		// the session total's freshness rather than the turn's reported cost.
		const { session, mockSession, signals } = await createAgentSession(disposables, {
			configureMockSession: mock => {
				mock.usageMetricsResult.totalNanoAiu = 40_000_000_000;
				mock.usageMetricsError = new Error('rpc unavailable');
			},
		});

		session.resetTurnState('turn-with-failed-read');
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.6',
			inputTokens: 10,
			outputTokens: 20,
			copilotUsage: { totalNanoAiu: 500_000_000 },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		await timeout(0);
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.6',
			inputTokens: 10,
			outputTokens: 20,
			copilotUsage: { totalNanoAiu: 250_000_000 },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		await timeout(0);

		const usageActions = getActions(signals).filter(a => a.type === ActionType.ChatUsage) as ChatUsageAction[];
		// Both calls counted toward the turn even though the first metrics read failed.
		assert.deepStrictEqual(usageActions.at(-1)?.usage._meta?.copilotUsage, {
			totalNanoAiu: 750_000_000,
			sessionTotalNanoAiu: 40_750_000_000,
		});
	});

	test('a session total that drops after truncation is adopted rather than treated as stale', async () => {
		// `history.truncate` (checkpoint restore, editing an earlier message) makes the
		// SDK re-fold usage from the surviving events, so its authoritative total
		// legitimately decreases. Treating that as a stale read would freeze the
		// reported cost until billing climbed back past the pre-truncation figure.
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-before-truncate');
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.6',
			inputTokens: 10,
			outputTokens: 20,
			copilotUsage: { totalNanoAiu: 10_000_000_000 },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		await timeout(0);

		// Truncation rewinds the SDK's total from 10 down to 3; the next call brings it
		// to 4. A high-water guard would reject everything below 10 and freeze the
		// reported cost, so the drop must be adopted.
		mockSession.usageMetricsResult.totalNanoAiu = 3_000_000_000;
		session.resetTurnState('turn-after-truncate');
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.6',
			inputTokens: 10,
			outputTokens: 20,
			copilotUsage: { totalNanoAiu: 1_000_000_000 },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		await timeout(0);

		const usageActions = getActions(signals).filter(a => a.type === ActionType.ChatUsage) as ChatUsageAction[];
		assert.deepStrictEqual(usageActions.at(-1)?.usage._meta?.copilotUsage, {
			totalNanoAiu: 1_000_000_000,
			sessionTotalNanoAiu: 4_000_000_000,
		});
	});

	test('overlapping usage events issue one metrics read at a time and converge on the newest', async () => {
		// `getMetrics` is a real RPC round trip. Letting several overlap means an older
		// one can resolve last and publish a stale session cost, and a high-water guard
		// can't reject it because the total legitimately drops after a truncation.
		// Serializing the reads removes the interleaving entirely and coalesces the
		// redundant reads a burst of usage events would otherwise issue.
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-overlapping');
		const slowFirstRead = new DeferredPromise<void>();
		mockSession.usageMetricsGates.push(slowFirstRead.p);

		const fireUsage = (totalNanoAiu: number) => mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.6',
			inputTokens: 10,
			outputTokens: 20,
			copilotUsage: { totalNanoAiu },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);

		fireUsage(500_000_000);
		await timeout(0);
		fireUsage(1_000_000_000);
		await timeout(0);
		fireUsage(500_000_000);
		await timeout(0);
		// The first read is still in flight, so the two later events have not started
		// their own — they are waiting behind it and collapse into a single follow-up.
		assert.strictEqual(mockSession.usageMetricsCalls, 1);

		slowFirstRead.complete();
		for (let i = 0; i < 5; i++) {
			await timeout(0);
		}

		// One follow-up read for the three events that queued behind the first, and it
		// observed the newest total rather than any earlier snapshot.
		assert.strictEqual(mockSession.usageMetricsCalls, 2);
		session.resetTurnState('turn-after-overlap');
		fireUsage(250_000_000);
		for (let i = 0; i < 5; i++) {
			await timeout(0);
		}
		const usageActions = getActions(signals).filter(a => a.type === ActionType.ChatUsage) as ChatUsageAction[];
		assert.strictEqual(
			(usageActions.at(-1)?.usage._meta as UsageInfoMeta | undefined)?.copilotUsage?.sessionTotalNanoAiu,
			2_250_000_000,
		);
	});

	test('a turn ending while its usage refresh is in flight still bills that turn', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-racing-idle');
		const gate = new DeferredPromise<void>();
		mockSession.usageMetricsGate = gate.p;
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.6',
			inputTokens: 10,
			outputTokens: 20,
			copilotUsage: { totalNanoAiu: 500_000_000 },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		// The SDK's terminal `session.idle` lands before the metrics RPC resolves — the
		// common case, since idle follows a turn's last usage event almost immediately.
		mockSession.fire('session.idle', { aborted: false } as SessionEventPayload<'session.idle'>['data']);
		gate.complete();
		await timeout(0);

		const usageActions = getActions(signals).filter(a => a.type === ActionType.ChatUsage) as ChatUsageAction[];
		// The cost belongs to the turn that incurred it, so it must survive the turn
		// ending mid-refresh. The session total may lag here — the re-emit carrying it
		// is dropped once the turn is no longer active — which `ChatModel.sessionCost`
		// absorbs by taking the larger of the reported total and the summed turns.
		assert.strictEqual((usageActions.at(-1)?.usage._meta as UsageInfoMeta | undefined)?.copilotUsage?.totalNanoAiu, 500_000_000);
	});

	test('`/compact` reports the compaction call credits on the post-compaction usage', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.compactResult = { success: true, tokensRemoved: 1200, messagesRemoved: 3, contextWindow: { currentTokens: 4500, tokenLimit: 128000, messagesLength: 7 } };
		// The SDK bills the summarization call on `session.compaction_complete` (emitted while the
		// history RPC is still in flight) rather than as an `assistant.usage` event.
		mockSession.onCompact = () => mockSession.fire('session.compaction_complete', {
			success: true,
			tokensRemoved: 1200,
			// `copilotUsage` is `asInternal` in the SDK schema, so it is absent from the public type but present at runtime.
			compactionTokensUsed: { model: 'claude-sonnet-4.6', inputTokens: 9000, outputTokens: 400, copilotUsage: { totalNanoAiu: 250_000_000 } },
		} as unknown as SessionEventPayload<'session.compaction_complete'>['data']);

		await session.send('/compact', undefined, 'turn-compact');
		await timeout(0);

		const usageActions = getActions(signals).filter(a => a.type === ActionType.ChatUsage) as ChatUsageAction[];
		assert.deepStrictEqual(usageActions.at(-1), {
			type: ActionType.ChatUsage,
			turnId: 'turn-compact',
			usage: {
				inputTokens: 4500,
				outputTokens: 0,
				model: undefined,
				_meta: {
					copilotUsage: { totalNanoAiu: 250_000_000, sessionTotalNanoAiu: 250_000_000 },
					turnTokenTotals: [{ model: 'claude-sonnet-4.6', inputTokens: 9000, cachedTokens: 0, outputTokens: 400 }],
					directTurnTokenTotals: [{ model: 'claude-sonnet-4.6', inputTokens: 9000, cachedTokens: 0, outputTokens: 400 }],
					directCopilotUsage: { totalNanoAiu: 250_000_000 },
				},
			},
		});
	});

	test('automatic compaction folds its credits into the turn running total', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-auto-compact');
		mockSession.fire('assistant.usage', {
			model: 'claude-sonnet-4.6',
			inputTokens: 10,
			outputTokens: 20,
			copilotUsage: { totalNanoAiu: 500_000_000 },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		mockSession.fire('session.compaction_complete', {
			success: true,
			tokensRemoved: 1200,
			compactionTokensUsed: { model: 'claude-sonnet-4.6', copilotUsage: { totalNanoAiu: 250_000_000 } },
		} as unknown as SessionEventPayload<'session.compaction_complete'>['data']);
		await timeout(0);

		const usageActions = getActions(signals).filter(a => a.type === ActionType.ChatUsage) as ChatUsageAction[];
		// The compaction credits add to the turn total while the parent turn's own model and
		// context tokens are preserved, so the response footer shows the full turn cost.
		assert.deepStrictEqual(usageActions.at(-1)?.usage, {
			inputTokens: 10,
			outputTokens: 20,
			model: 'claude-sonnet-4.6',
			cacheReadTokens: undefined,
			_meta: {
				copilotUsage: { totalNanoAiu: 750_000_000, sessionTotalNanoAiu: 750_000_000 },
				// The compaction call reported no tokens of its own, so only the model call shows.
				turnTokenTotals: [{ model: 'claude-sonnet-4.6', inputTokens: 10, cachedTokens: 0, outputTokens: 20 }],
				directTurnTokenTotals: [{ model: 'claude-sonnet-4.6', inputTokens: 10, cachedTokens: 0, outputTokens: 20 }],
				directCopilotUsage: { totalNanoAiu: 750_000_000 },
			},
		});
	});

	test('failed compaction does not report credits', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-failed-compact');
		mockSession.fire('session.compaction_complete', {
			success: false,
			error: 'boom',
			compactionTokensUsed: { copilotUsage: { totalNanoAiu: 250_000_000 } },
		} as unknown as SessionEventPayload<'session.compaction_complete'>['data']);
		await timeout(0);

		assert.deepStrictEqual(getActions(signals).filter(a => a.type === ActionType.ChatUsage), []);
	});

	test('compaction billed outside a turn shows in the session total, not on the next turn', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		// Automatic compaction can run with no turn active (e.g. after an abort). It is
		// nobody's turn cost — and an out-of-turn compaction usually finds a cold prompt
		// cache and pays the ~12x cache-write rate, so billing it to an unrelated next
		// turn would dominate that turn's footer.
		mockSession.fire('session.compaction_complete', {
			success: true,
			compactionTokensUsed: { model: 'claude-opus-4.6', copilotUsage: { totalNanoAiu: 133_468_375_000 } },
		} as unknown as SessionEventPayload<'session.compaction_complete'>['data']);
		await timeout(0);
		assert.deepStrictEqual(getActions(signals).filter(a => a.type === ActionType.ChatUsage), []);

		session.resetTurnState('turn-after-compact');
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.6',
			inputTokens: 10,
			outputTokens: 20,
			copilotUsage: { totalNanoAiu: 500_000_000 },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		await timeout(0);

		const usageActions = getActions(signals).filter(a => a.type === ActionType.ChatUsage) as ChatUsageAction[];
		assert.deepStrictEqual(usageActions.at(-1)?.usage, {
			inputTokens: 10,
			outputTokens: 20,
			model: 'claude-opus-4.6',
			cacheReadTokens: undefined,
			_meta: {
				// The turn bills only its own call; the compaction is visible in the session total.
				copilotUsage: { totalNanoAiu: 500_000_000, sessionTotalNanoAiu: 133_968_375_000 },
				turnTokenTotals: [{ model: 'claude-opus-4.6', inputTokens: 10, cachedTokens: 0, outputTokens: 20 }],
				directTurnTokenTotals: [{ model: 'claude-opus-4.6', inputTokens: 10, cachedTokens: 0, outputTokens: 20 }],
				directCopilotUsage: { totalNanoAiu: 500_000_000 },
			},
		});
	});

	test('a turn that never reports usage does not inherit out-of-turn compaction cost', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		mockSession.fire('session.compaction_complete', {
			success: true,
			compactionTokensUsed: { copilotUsage: { totalNanoAiu: 2_000_000_000 } },
		} as unknown as SessionEventPayload<'session.compaction_complete'>['data']);
		await timeout(0);

		session.resetTurnState('turn-1');
		session.resetTurnState('turn-2');
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.6',
			inputTokens: 1,
			outputTokens: 1,
			copilotUsage: { totalNanoAiu: 1_000_000_000 },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		await timeout(0);

		const usageActions = getActions(signals).filter(a => a.type === ActionType.ChatUsage) as ChatUsageAction[];
		assert.deepStrictEqual(usageActions.at(-1)?.usage._meta, {
			copilotUsage: { totalNanoAiu: 1_000_000_000, sessionTotalNanoAiu: 3_000_000_000 },
			turnTokenTotals: [{ model: 'claude-opus-4.6', inputTokens: 1, cachedTokens: 0, outputTokens: 1 }],
			directTurnTokenTotals: [{ model: 'claude-opus-4.6', inputTokens: 1, cachedTokens: 0, outputTokens: 1 }],
			directCopilotUsage: { totalNanoAiu: 1_000_000_000 },
		});
	});

	test('each turn bills only its own calls while the session total accumulates', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		mockSession.fire('session.compaction_complete', {
			success: true,
			compactionTokensUsed: { copilotUsage: { totalNanoAiu: 2_000_000_000 } },
		} as unknown as SessionEventPayload<'session.compaction_complete'>['data']);
		await timeout(0);

		session.resetTurnState('turn-1');
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.6',
			inputTokens: 1,
			outputTokens: 1,
			copilotUsage: { totalNanoAiu: 1_000_000_000 },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		await timeout(0);
		session.resetTurnState('turn-2');
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.6',
			inputTokens: 1,
			outputTokens: 1,
			copilotUsage: { totalNanoAiu: 1_000_000_000 },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		await timeout(0);

		const usageActions = getActions(signals).filter(a => a.type === ActionType.ChatUsage) as ChatUsageAction[];
		// Each turn reports its own single call; the session total carries the
		// out-of-turn compaction plus both turns.
		assert.deepStrictEqual(usageActions.map(a => ({ turnId: a.turnId, copilotUsage: a.usage._meta?.copilotUsage })), [
			{ turnId: 'turn-1', copilotUsage: { totalNanoAiu: 1_000_000_000, sessionTotalNanoAiu: 2_000_000_000 } },
			{ turnId: 'turn-1', copilotUsage: { totalNanoAiu: 1_000_000_000, sessionTotalNanoAiu: 3_000_000_000 } },
			{ turnId: 'turn-2', copilotUsage: { totalNanoAiu: 1_000_000_000, sessionTotalNanoAiu: 3_000_000_000 } },
			{ turnId: 'turn-2', copilotUsage: { totalNanoAiu: 1_000_000_000, sessionTotalNanoAiu: 4_000_000_000 } },
		]);
	});

	test('`/compact` completes the turn even when compaction reports failure', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.compactResult = { success: false, tokensRemoved: 0, messagesRemoved: 0 };

		await session.send('/compact', undefined, 'turn-compact');

		assert.strictEqual(mockSession.compactCalls.length, 1);
		assert.deepStrictEqual(mockSession.sendRequests, []);
		const turnComplete = getActions(signals).find(a => a.type === ActionType.ChatTurnComplete);
		assert.ok(turnComplete, 'expected the turn to complete on a failed compaction');
	});

	test('`/compact` treats nothing-to-compact errors as completed', async () => {
		const logService = new CapturingLogService();
		const { session, mockSession, signals } = await createAgentSession(disposables, { logService });
		mockSession.compactError = new Error('NOTHING TO COMPACT for this conversation');

		await session.send('/compact', undefined, 'turn-compact');

		const actions = getActions(signals);
		assert.deepStrictEqual({
			compactCalls: mockSession.compactCalls.length,
			sendRequests: mockSession.sendRequests,
			errors: logService.errors,
			responseParts: actions
				.filter(a => a.type === ActionType.ChatResponsePart)
				.map(a => {
					const part = (a as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown ? { turnId: a.turnId, kind: part.kind, content: part.content } : { turnId: a.turnId, kind: part.kind };
				}),
			turnComplete: actions
				.filter(a => a.type === ActionType.ChatTurnComplete)
				.map(a => (a as ChatTurnCompleteAction).turnId),
		}, {
			compactCalls: 1,
			sendRequests: [],
			errors: [],
			responseParts: [{ turnId: 'turn-compact', kind: ResponsePartKind.Markdown, content: 'Compaction completed' }],
			turnComplete: ['turn-compact'],
		});
	});

	test('a failed send releases the turn so the chat does not look busy forever', async () => {
		// Nothing closes a turn whose send rejected: the SDK loop never starts,
		// so no `session.idle` arrives. The host finalizes the protocol turn with
		// a ChatError, and the session must drop its handle to match — a chat
		// stuck `busy` blocks idle eviction and parks deferred client restarts.
		let turnEndCount = 0;
		const { session, mockSession } = await createAgentSession(disposables, { onTurnEnded: () => turnEndCount++ });
		mockSession.send = async () => { throw new Error('send failed'); };

		await assert.rejects(() => session.send('hello', undefined, 'turn-failed'), /send failed/);

		assert.deepStrictEqual({ hasActiveTurn: session.hasActiveTurn, turnEndCount }, { hasActiveTurn: false, turnEndCount: 1 });
	});

	test('`/env` runs the runtime command when listed and emits markdown output', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [{
				name: 'env',
				kind: 'builtin',
				description: 'Show loaded environment details',
				allowDuringAgentExecution: true,
			}],
		};
		mockSession.commandInvokeResult = { kind: 'text', text: '## Environment\n\nLoaded.', markdown: true };

		await session.send('/env', undefined, 'turn-env');

		const actions = getActions(signals);
		assert.deepStrictEqual({
			commandListCalls: mockSession.commandListCalls,
			commandInvokeCalls: mockSession.commandInvokeCalls,
			sendRequests: mockSession.sendRequests,
			responseParts: actions
				.filter(a => a.type === ActionType.ChatResponsePart)
				.map(a => {
					const part = (a as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown ? { kind: part.kind, content: part.content } : { kind: part.kind };
				}),
			turnComplete: actions
				.filter(a => a.type === ActionType.ChatTurnComplete)
				.map(a => (a as ChatTurnCompleteAction).turnId),
		}, {
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
			commandInvokeCalls: [{ name: 'env' }],
			sendRequests: [],
			responseParts: [{ kind: ResponsePartKind.Markdown, content: '## Environment\n\nLoaded.' }],
			turnComplete: ['turn-env'],
		});
	});

	test('`/env` escapes plain text runtime command output before emitting markdown', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [{
				name: 'env',
				kind: 'builtin',
				description: 'Show loaded environment details',
				allowDuringAgentExecution: true,
			}],
		};
		mockSession.commandInvokeResult = { kind: 'text', text: '*plain*\n- item', markdown: false };

		await session.send('/env', undefined, 'turn-env');

		const responsePart = getActions(signals).find(a => a.type === ActionType.ChatResponsePart) as ChatResponsePartAction | undefined;
		assert.strictEqual(responsePart?.part.kind, ResponsePartKind.Markdown);
		if (responsePart?.part.kind === ResponsePartKind.Markdown) {
			assert.strictEqual(responsePart.part.content, '\\*plain\\*\n\\- item');
		}
	});

	test('`/env` falls through to a normal SDK send when not listed', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = { commands: [] };

		await session.send('/env', undefined, 'turn-env');

		assert.deepStrictEqual({
			commandListCalls: mockSession.commandListCalls,
			commandInvokeCalls: mockSession.commandInvokeCalls,
			sendRequests: mockSession.sendRequests,
			responseParts: getActions(signals).filter(a => a.type === ActionType.ChatResponsePart),
			turnComplete: getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete),
		}, {
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
			commandInvokeCalls: [],
			sendRequests: [{ prompt: '/env', attachments: undefined }],
			responseParts: [],
			turnComplete: [],
		});
	});

	test('`/env` forwards trailing text as runtime command input', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [{
				name: 'env',
				kind: 'builtin',
				description: 'Show loaded environment details',
				allowDuringAgentExecution: true,
			}],
		};
		mockSession.commandInvokeResult = { kind: 'completed', message: 'done' };

		await session.send('/env details please', undefined, 'turn-env-input');

		const actions = getActions(signals);
		assert.deepStrictEqual({
			commandListCalls: mockSession.commandListCalls,
			commandInvokeCalls: mockSession.commandInvokeCalls,
			sendRequests: mockSession.sendRequests,
			responseParts: actions
				.filter(a => a.type === ActionType.ChatResponsePart)
				.map(a => {
					const part = (a as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown ? { kind: part.kind, content: part.content } : { kind: part.kind };
				}),
			turnComplete: actions
				.filter(a => a.type === ActionType.ChatTurnComplete)
				.map(a => (a as ChatTurnCompleteAction).turnId),
		}, {
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
			commandInvokeCalls: [{ name: 'env', input: 'details please' }],
			sendRequests: [],
			responseParts: [{ kind: ResponsePartKind.Markdown, content: 'done' }],
			turnComplete: ['turn-env-input'],
		});
	});

	test('invokes non-local runtime slash commands via commands API', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [{
				name: 'focus',
				aliases: ['f'],
				kind: 'builtin',
				description: 'Focus on a scope',
				allowDuringAgentExecution: true,
				input: { hint: 'scope' },
			}],
		};
		mockSession.commandInvokeResult = { kind: 'completed', message: 'Focus done' };

		await session.send('/f src/vs/platform', undefined, 'turn-focus');

		const actions = getActions(signals);
		assert.deepStrictEqual({
			commandListCalls: mockSession.commandListCalls,
			commandInvokeCalls: mockSession.commandInvokeCalls,
			sendRequests: mockSession.sendRequests,
			responseParts: actions
				.filter(a => a.type === ActionType.ChatResponsePart)
				.map(a => {
					const part = (a as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown ? { kind: part.kind, content: part.content } : { kind: part.kind };
				}),
			turnComplete: actions
				.filter(a => a.type === ActionType.ChatTurnComplete)
				.map(a => (a as ChatTurnCompleteAction).turnId),
		}, {
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
			commandInvokeCalls: [{ name: 'focus', input: 'src/vs/platform' }],
			sendRequests: [],
			responseParts: [{ kind: ResponsePartKind.Markdown, content: 'Focus done' }],
			turnComplete: ['turn-focus'],
		});
	});

	test('caches runtime slash command availability across checks', async () => {
		const { session, mockSession } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [
				{
					name: 'env',
					kind: 'builtin',
					description: 'Show loaded environment details',
					allowDuringAgentExecution: true,
				},
				{
					name: 'review',
					kind: 'builtin',
					description: 'Run code review agent to analyze changes',
					allowDuringAgentExecution: false,
				},
				{
					name: 'not-a-builtin',
					kind: 'skill',
					description: 'Skill command',
					allowDuringAgentExecution: false,
				},
			],
		};

		assert.deepStrictEqual({
			env: await session.hasRuntimeSlashCommand('env'),
			review: await session.hasRuntimeSlashCommand('review'),
			skill: await session.hasRuntimeSlashCommand('not-a-builtin'),
			commandListCalls: mockSession.commandListCalls,
		}, {
			env: true,
			review: true,
			skill: true,
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
		});
	});

	test('`/review` invokes runtime command when listed', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [{
				name: 'review',
				kind: 'builtin',
				description: 'Run code review agent to analyze changes',
				allowDuringAgentExecution: true,
				input: { hint: 'scope' },
			}],
		};
		mockSession.commandInvokeResult = { kind: 'completed', message: 'Review done' };

		await session.send('/review focus on tests', undefined, 'turn-review');

		assert.deepStrictEqual({
			commandListCalls: mockSession.commandListCalls,
			commandInvokeCalls: mockSession.commandInvokeCalls,
			sendRequests: mockSession.sendRequests,
			responseParts: getActions(signals)
				.filter(a => a.type === ActionType.ChatResponsePart)
				.map(a => {
					const part = (a as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown ? { kind: part.kind, content: part.content } : { kind: part.kind };
				}),
			turnComplete: getActions(signals)
				.filter(a => a.type === ActionType.ChatTurnComplete)
				.map(a => (a as ChatTurnCompleteAction).turnId),
		}, {
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
			commandInvokeCalls: [{ name: 'review', input: 'focus on tests' }],
			sendRequests: [],
			responseParts: [{ kind: ResponsePartKind.Markdown, content: 'Review done' }],
			turnComplete: ['turn-review'],
		});
	});

	test('`/rubber-duck` invokes the native runtime command', async () => {
		const { session, mockSession } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [{
				name: 'rubber-duck',
				kind: 'builtin',
				description: 'Get an independent critique',
				allowDuringAgentExecution: true,
				input: { hint: 'review prompt' },
			}],
		};
		mockSession.commandInvokeResult = {
			kind: 'agent-prompt',
			prompt: 'Run the rubber duck critic.',
			displayPrompt: 'Review the current work',
			mode: 'interactive',
		};

		await session.send('/rubber-duck focus on tests', undefined, 'turn-rubber-duck');

		assert.deepStrictEqual({
			commandListCalls: mockSession.commandListCalls,
			commandInvokeCalls: mockSession.commandInvokeCalls,
			sendRequests: mockSession.sendRequests,
		}, {
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
			commandInvokeCalls: [{ name: 'rubber-duck', input: 'focus on tests' }],
			sendRequests: [{ prompt: 'Run the rubber duck critic.', attachments: undefined }],
		});
	});

	test('`/security-review` falls through to normal send when runtime command is unavailable', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = { commands: [] };

		await session.send('/security-review', undefined, 'turn-security-review');

		assert.deepStrictEqual({
			commandListCalls: mockSession.commandListCalls,
			commandInvokeCalls: mockSession.commandInvokeCalls,
			sendRequests: mockSession.sendRequests,
			responseParts: getActions(signals).filter(a => a.type === ActionType.ChatResponsePart),
			turnComplete: getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete),
		}, {
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
			commandInvokeCalls: [],
			sendRequests: [{ prompt: '/security-review', attachments: undefined }],
			responseParts: [],
			turnComplete: [],
		});
	});

	suite('/fleet lifecycle (issue #8837)', () => {
		const fleetCommand = (aliases?: string[]) => ({
			name: 'fleet',
			kind: 'builtin' as const,
			description: 'Fan the plan out across parallel subagents',
			allowDuringAgentExecution: false,
			...(aliases ? { aliases } : {}),
		});

		test('canonical built-in /fleet starts via rpc.fleet.start, keeps the turn open, and completes once on idle', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			mockSession.commandListResult = { commands: [fleetCommand()] };

			await session.send('/fleet the full analysis', undefined, 'turn-fleet', 'interactive');

			assert.deepStrictEqual({
				fleetStartCalls: mockSession.fleetStartCalls,
				commandInvokeCalls: mockSession.commandInvokeCalls,
				sendRequests: mockSession.sendRequests,
				turnCompleteBeforeIdle: getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete).length,
				hasActiveTurn: session.hasActiveTurn,
				diagnostics: session.getTurnDiagnosticSnapshot('turn-fleet'),
			}, {
				fleetStartCalls: [{ prompt: 'the full analysis' }],
				commandInvokeCalls: [],
				sendRequests: [],
				turnCompleteBeforeIdle: 0,
				hasActiveTurn: true,
				diagnostics: {
					state: 'available',
					providerCallState: 'resolved',
					providerTurnStarted: false,
					providerSessionState: 'active',
				},
			});

			mockSession.fire('assistant.message_delta', { deltaContent: 'Deploying fleet' } as SessionEventPayload<'assistant.message_delta'>['data']);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			const actions = getActions(signals);
			const responseParts = actions.filter(a => a.type === ActionType.ChatResponsePart) as ChatResponsePartAction[];
			const turnComplete = actions.filter(a => a.type === ActionType.ChatTurnComplete) as ChatTurnCompleteAction[];
			assert.deepStrictEqual({
				responsePartTurnIds: responseParts.map(a => a.turnId),
				turnCompleteTurnIds: turnComplete.map(a => a.turnId),
				hasActiveTurn: session.hasActiveTurn,
			}, {
				responsePartTurnIds: ['turn-fleet'],
				turnCompleteTurnIds: ['turn-fleet'],
				hasActiveTurn: false,
			});
		});

		test('fleet preflight applies mode, permission, and sandbox before fleet.start and skips commands.invoke and the outer send', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			mockSession.commandListResult = { commands: [fleetCommand()] };

			await session.send('/fleet go', undefined, 'turn-fleet', 'interactive');

			const log = mockSession.operationLog;
			const modeIdx = log.indexOf('mode.set');
			const permIdx = log.indexOf('permissions.setMode');
			const sandboxIdx = log.indexOf('options.update:sandbox');
			const startIdx = log.indexOf('fleet.start');
			assert.deepStrictEqual({
				strictPreflightOrder: modeIdx >= 0 && permIdx > modeIdx && sandboxIdx > permIdx && startIdx > sandboxIdx,
				fleetStartCount: log.filter(op => op === 'fleet.start').length,
				invokedGenericCommand: log.includes('commands.invoke'),
				sentThroughNormalSend: log.includes('send'),
			}, {
				strictPreflightOrder: true,
				fleetStartCount: 1,
				invokedGenericCommand: false,
				sentThroughNormalSend: false,
			});
		});

		test('a client command named `fleet` still routes through commands.invoke', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			mockSession.commandListResult = {
				commands: [{ name: 'fleet', kind: 'client', description: 'A client command', allowDuringAgentExecution: true }],
			};
			mockSession.commandInvokeResult = { kind: 'completed', message: 'client fleet done' };

			await session.send('/fleet go', undefined, 'turn-fleet', 'interactive');

			assert.deepStrictEqual({
				fleetStartCalls: mockSession.fleetStartCalls,
				commandInvokeCalls: mockSession.commandInvokeCalls,
			}, {
				fleetStartCalls: [],
				commandInvokeCalls: [{ name: 'fleet', input: 'go' }],
			});
		});

		test('resolves fleet via alias and case-insensitively, and omits an empty prompt', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			mockSession.commandListResult = { commands: [fleetCommand(['fl'])] };

			await session.send('/FLEET the full analysis', undefined, 'turn-fleet-1', 'interactive');
			await session.send('/fl', undefined, 'turn-fleet-2', 'interactive');

			assert.deepStrictEqual(mockSession.fleetStartCalls, [
				{ prompt: 'the full analysis' },
				{},
			]);
		});

		test('rejects /fleet attachments before any SDK side effect', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			mockSession.commandListResult = { commands: [fleetCommand()] };

			await assert.rejects(session.send(
				'/fleet go',
				[{ type: MessageAttachmentKind.Resource, uri: 'file:///workspace/file.ts', label: 'file.ts', displayKind: 'document' }],
				'turn-fleet',
				'interactive',
			));

			assert.deepStrictEqual({
				operationLog: mockSession.operationLog,
				fleetStartCalls: mockSession.fleetStartCalls,
				commandInvokeCalls: mockSession.commandInvokeCalls,
				sendRequests: mockSession.sendRequests,
				hasActiveTurn: session.hasActiveTurn,
			}, {
				operationLog: [],
				fleetStartCalls: [],
				commandInvokeCalls: [],
				sendRequests: [],
				hasActiveTurn: false,
			});
		});

		test('started:false surfaces an error and clears the turn without an SDK send', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			mockSession.commandListResult = { commands: [fleetCommand()] };
			mockSession.fleetStartResult = { started: false };

			await assert.rejects(session.send('/fleet go', undefined, 'turn-fleet', 'interactive'));

			assert.deepStrictEqual({
				fleetStartCalls: mockSession.fleetStartCalls,
				sendRequests: mockSession.sendRequests,
				commandInvokeCalls: mockSession.commandInvokeCalls,
				hasActiveTurn: session.hasActiveTurn,
			}, {
				fleetStartCalls: [{ prompt: 'go' }],
				sendRequests: [],
				commandInvokeCalls: [],
				hasActiveTurn: false,
			});
		});

		test('a fleet.start rejection propagates and clears the turn', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			mockSession.commandListResult = { commands: [fleetCommand()] };
			mockSession.fleetStartError = new Error('fleet boom');

			await assert.rejects(session.send('/fleet go', undefined, 'turn-fleet', 'interactive'), /fleet boom/);
			assert.strictEqual(session.hasActiveTurn, false);
		});

		test('a session.idle racing fleet.start settlement completes the turn exactly once', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			mockSession.commandListResult = { commands: [fleetCommand()] };
			// Emit the terminal idle while `fleet.start` is still in flight.
			mockSession.onFleetStart = () => mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			await session.send('/fleet go', undefined, 'turn-fleet', 'interactive');

			const turnComplete = getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete) as ChatTurnCompleteAction[];
			assert.deepStrictEqual({
				turnCompleteTurnIds: turnComplete.map(a => a.turnId),
				hasActiveTurn: session.hasActiveTurn,
			}, {
				turnCompleteTurnIds: ['turn-fleet'],
				hasActiveTurn: false,
			});
		});

		test('a fleet.start rejection after idle already completed the turn does not emit a second terminal action', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			mockSession.commandListResult = { commands: [fleetCommand()] };
			mockSession.fleetStartError = new Error('late boom');
			mockSession.onFleetStart = () => mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			// Must not reject: idle is authoritative once it has completed the turn.
			await session.send('/fleet go', undefined, 'turn-fleet', 'interactive');

			const actions = getActions(signals);
			assert.deepStrictEqual({
				turnCompleteCount: actions.filter(a => a.type === ActionType.ChatTurnComplete).length,
				chatErrorCount: actions.filter(a => a.type === ActionType.ChatError).length,
				hasActiveTurn: session.hasActiveTurn,
			}, {
				turnCompleteCount: 1,
				chatErrorCount: 0,
				hasActiveTurn: false,
			});
		});

		test('an aborted idle after a successful fleet start tears the turn down without a success completion', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			mockSession.commandListResult = { commands: [fleetCommand()] };

			// Marking the turn running ensures an abort before the first SDK event tears it down.
			await session.send('/fleet go', undefined, 'turn-fleet', 'interactive');
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);

			assert.deepStrictEqual({
				turnCompleteCount: getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete).length,
				hasActiveTurn: session.hasActiveTurn,
			}, {
				turnCompleteCount: 0,
				hasActiveTurn: false,
			});
		});

		test('an abort racing fleet.start settlement discards the turn without a success completion', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			mockSession.commandListResult = { commands: [fleetCommand()] };
			// Abort while `fleet.start` is in flight, then deliver the aborted terminal
			// idle (which resets the live abort token and leaves the pending turn open).
			mockSession.onFleetStart = () => {
				void session.abort();
				mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);
			};

			await session.send('/fleet go', undefined, 'turn-fleet', 'interactive');

			assert.deepStrictEqual({
				turnCompleteCount: getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete).length,
				chatErrorCount: getActions(signals).filter(a => a.type === ActionType.ChatError).length,
				hasActiveTurn: session.hasActiveTurn,
			}, {
				turnCompleteCount: 0,
				chatErrorCount: 0,
				hasActiveTurn: false,
			});
		});

		test('an abort during fleet preflight does not start the fleet loop', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			mockSession.commandListResult = { commands: [fleetCommand()] };
			// Abort while the shared preflight (mode/permission/sandbox/MCP) is running,
			// before `fleet.start` would be invoked.
			mockSession.onModeSet = () => {
				void session.abort();
				mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);
			};

			await session.send('/fleet go', undefined, 'turn-fleet', 'interactive');

			assert.deepStrictEqual({
				fleetStartCalls: mockSession.fleetStartCalls,
				sentThroughNormalSend: mockSession.operationLog.includes('send'),
				turnCompleteCount: getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete).length,
				chatErrorCount: getActions(signals).filter(a => a.type === ActionType.ChatError).length,
				hasActiveTurn: session.hasActiveTurn,
			}, {
				fleetStartCalls: [],
				sentThroughNormalSend: false,
				turnCompleteCount: 0,
				chatErrorCount: 0,
				hasActiveTurn: false,
			});
		});

		test('an abort during slash-command resolution does not start the fleet loop', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			mockSession.commandListResult = { commands: [fleetCommand()] };
			// Abort while `rpc.commands.list` (slash-command resolution) is in flight —
			// before `_startFleet` runs. The aborted `session.idle` resets the live token
			// and leaves the pending turn open, so only a token captured before this await
			// reflects the cancellation. Reading a fresh token would start the fleet loop
			// after the user cancelled.
			mockSession.onCommandList = () => {
				void session.abort();
				mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);
			};

			await session.send('/fleet go', undefined, 'turn-fleet', 'interactive');

			assert.deepStrictEqual({
				fleetStartCalls: mockSession.fleetStartCalls,
				sentThroughNormalSend: mockSession.operationLog.includes('send'),
				turnCompleteCount: getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete).length,
				chatErrorCount: getActions(signals).filter(a => a.type === ActionType.ChatError).length,
				hasActiveTurn: session.hasActiveTurn,
			}, {
				fleetStartCalls: [],
				sentThroughNormalSend: false,
				turnCompleteCount: 0,
				chatErrorCount: 0,
				hasActiveTurn: false,
			});
		});

		test('binds the fleet user.message event id to the original turn (message after RPC resolves)', async () => {
			const sessionDatabase = new TestSessionDatabase();
			const { session, mockSession } = await createAgentSession(disposables, { sessionDatabase });
			mockSession.commandListResult = { commands: [fleetCommand()] };

			await session.send('/fleet go', undefined, 'turn-fleet', 'interactive');
			mockSession.fire('user.message', { content: 'Fleet deployed: go' } as SessionEventPayload<'user.message'>['data'], { id: 'evt-fleet' });

			assert.deepStrictEqual(sessionDatabase.setTurnEventIdCalls, [{ turnId: 'turn-fleet', eventId: 'evt-fleet' }]);
		});

		test('binds the fleet user.message event id to the original turn (message before RPC resolves)', async () => {
			const sessionDatabase = new TestSessionDatabase();
			const { session, mockSession } = await createAgentSession(disposables, { sessionDatabase });
			mockSession.commandListResult = { commands: [fleetCommand()] };
			mockSession.onFleetStart = () => mockSession.fire('user.message', { content: 'Fleet deployed: go' } as SessionEventPayload<'user.message'>['data'], { id: 'evt-fleet' });

			await session.send('/fleet go', undefined, 'turn-fleet', 'interactive');

			assert.deepStrictEqual(sessionDatabase.setTurnEventIdCalls, [{ turnId: 'turn-fleet', eventId: 'evt-fleet' }]);
		});

		test('plan review and ask_user during an active fleet turn do not hit the no-active-turn fallback', async () => {
			const { session, runtime, mockSession, signals } = await createAgentSession(disposables);
			mockSession.commandListResult = { commands: [fleetCommand()] };
			mockSession.planReadResult = { exists: true, content: '## Plan', path: '/sessions/abc/plan.md' };

			await session.send('/fleet the full analysis', undefined, 'turn-fleet', 'interactive');

			const planReviewPromise = runtime.handleExitPlanModeRequest(
				{ summary: '## Plan summary', actions: ['interactive'], recommendedAction: 'interactive' },
				{ sessionId: 'test-session-1' },
			);
			const askUserPromise = runtime.handleUserInputRequest({ question: 'Proceed?' }, { sessionId: 'test-session-1' });

			// Plan review awaits `rpc.plan.read()` before raising its request, so let the microtask settle.
			await timeout(0);
			const inputRequests = getActions(signals).filter(a => a.type === ActionType.ChatInputRequested);
			assert.strictEqual(inputRequests.length, 2, 'plan review and ask_user should each raise an input request while fleet is active');

			session.dispose();
			assert.deepStrictEqual({
				planReview: await planReviewPromise,
				askUser: await askUserPromise,
			}, {
				planReview: { approved: false },
				askUser: { answer: '', wasFreeform: true },
			});
		});
	});

	test('applies the effective mode before invoking a non-fleet runtime command', async () => {
		const { session, mockSession } = await createAgentSession(disposables);
		// Establish a stale prior SDK mode, then clear setup noise from the trace.
		await session.applyMode('plan');
		mockSession.operationLog.length = 0;
		mockSession.commandListResult = {
			commands: [{ name: 'env', kind: 'builtin', description: 'Show environment', allowDuringAgentExecution: true }],
		};
		mockSession.commandInvokeResult = { kind: 'completed', message: 'done' };

		await session.send('/env', undefined, 'turn-env', 'interactive');

		const log = mockSession.operationLog;
		assert.deepStrictEqual({
			modeBeforeInvoke: log.indexOf('mode.set') >= 0 && log.indexOf('mode.set') < log.indexOf('commands.invoke'),
			lastModeApplied: mockSession.modeSetCalls.at(-1),
		}, {
			modeBeforeInvoke: true,
			lastModeApplied: { mode: 'interactive' },
		});
	});

	test('reapplies an agent-prompt mode override before the SDK send', async () => {
		const { session, mockSession } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [{ name: 'refine', kind: 'builtin', description: 'Refine', allowDuringAgentExecution: true }],
		};
		mockSession.commandInvokeResult = { kind: 'agent-prompt', prompt: 'do it', displayPrompt: 'do it', mode: 'autopilot' };

		await session.send('/refine now', undefined, 'turn-refine', 'interactive');

		const log = mockSession.operationLog;
		assert.deepStrictEqual({
			modeSetCalls: mockSession.modeSetCalls,
			sendRequests: mockSession.sendRequests,
			firstModeBeforeInvoke: log.indexOf('mode.set') < log.indexOf('commands.invoke'),
			overrideModeAfterInvokeBeforeSend: log.lastIndexOf('mode.set') > log.indexOf('commands.invoke') && log.lastIndexOf('mode.set') < log.indexOf('send'),
		}, {
			modeSetCalls: [{ mode: 'interactive' }, { mode: 'autopilot' }],
			sendRequests: [{ prompt: 'do it', attachments: undefined }],
			firstModeBeforeInvoke: true,
			overrideModeAfterInvokeBeforeSend: true,
		});
	});

	test('emits accumulated Copilot usage metadata', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-usage');
		mockSession.fire('assistant.usage', {
			model: 'claude-sonnet-4.6',
			inputTokens: 10,
			outputTokens: 20,
			cacheReadTokens: 5,
			cost: 2,
			// `copilotUsage` is marked `asInternal` in the SDK schema so it is not on the public type, but is present at runtime.
			copilotUsage: { totalNanoAiu: 500_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		await timeout(0);
		mockSession.fire('assistant.usage', {
			model: 'claude-sonnet-4.6',
			inputTokens: 30,
			outputTokens: 40,
			cost: 2,
			copilotUsage: { totalNanoAiu: 750_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		await timeout(0);

		const usageActions = signals
			.filter((s): s is IAgentActionSignal => s.kind === 'action')
			.map(s => s.action)
			.filter(a => a.type === ActionType.ChatUsage);

		// The turn's running total and the session total both come from the SDK's usage
		// metrics, so they are reported on the enrichment re-emit that follows each event.
		assert.deepStrictEqual(usageActions.at(-1)?.usage, {
			inputTokens: 30,
			outputTokens: 40,
			model: 'claude-sonnet-4.6',
			cacheReadTokens: undefined,
			_meta: {
				cost: 2,
				copilotUsage: { totalNanoAiu: 1_250_000_000, sessionTotalNanoAiu: 1_250_000_000 },
				turnTokenTotals: [{ model: 'claude-sonnet-4.6', inputTokens: 40, cachedTokens: 5, outputTokens: 60 }],
				directTurnTokenTotals: [{ model: 'claude-sonnet-4.6', inputTokens: 40, cachedTokens: 5, outputTokens: 60 }],
				directCopilotUsage: { totalNanoAiu: 1_250_000_000 },
			},
		});
	});

	test('restores non-Opus prompt cache expiration from usage metrics on initialize', async () => {
		const cacheExpiresAt = '2026-07-24T12:00:00.000Z';
		const { dispatchedActions } = await createAgentSession(disposables, {
			resume: true,
			configureMockSession: session => {
				session.usageMetricsResult.currentModel = 'gpt-5.4';
				session.usageMetricsResult.modelMetrics['gpt-5.4'] = { cacheExpiresAt };
			},
		});

		const promptCaches = dispatchedActions
			.filter(action => action.type === ActionType.SessionMetaChanged)
			.map(action => readSessionPromptCacheState(action._meta))
			.filter(cache => cache !== undefined);
		assert.deepStrictEqual(promptCaches, [{
			modelId: 'gpt-5.4',
			cacheExpiresAt,
		}]);
	});

	test('updates prompt cache expiration from main-agent usage only', async () => {
		const { mockSession, dispatchedActions } = await createAgentSession(disposables);
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.8',
			inputTokens: 100,
			outputTokens: 10,
			cacheExpiresAt: '2026-07-24T12:00:00.000Z',
		});
		mockSession.fire('assistant.usage', {
			model: 'claude-haiku-4.5',
			inputTokens: 50,
			outputTokens: 5,
			cacheExpiresAt: '2026-07-24T12:10:00.000Z',
			parentToolCallId: 'subagent-tool-call',
		});
		await timeout(0);

		const promptCaches = dispatchedActions
			.filter(action => action.type === ActionType.SessionMetaChanged)
			.map(action => readSessionPromptCacheState(action._meta))
			.filter(cache => cache !== undefined);
		assert.deepStrictEqual(promptCaches, [{
			modelId: 'claude-opus-4.8',
			cacheExpiresAt: '2026-07-24T12:00:00.000Z',
		}]);
	});

	test('preserves prompt cache expiration when later usage omits a cache update', async () => {
		const { mockSession, dispatchedActions } = await createAgentSession(disposables);
		mockSession.fire('assistant.usage', {
			model: 'claude-sonnet-4.6',
			inputTokens: 100,
			outputTokens: 10,
			cacheExpiresAt: '2026-07-24T12:00:00.000Z',
		});
		await timeout(0);
		mockSession.fire('assistant.usage', {
			model: 'claude-sonnet-4.6',
			inputTokens: 50,
			outputTokens: 5,
		});
		await timeout(0);

		const promptCaches = dispatchedActions
			.filter(action => action.type === ActionType.SessionMetaChanged)
			.map(action => readSessionPromptCacheState(action._meta))
			.filter(cache => cache !== undefined);
		assert.deepStrictEqual(promptCaches, [{
			modelId: 'claude-sonnet-4.6',
			cacheExpiresAt: '2026-07-24T12:00:00.000Z',
		}]);
	});

	test('preserves restored prompt cache metadata after a resume metrics failure', async () => {
		const cacheExpiresAt = '2026-07-24T12:00:00.000Z';
		const initialSessionMeta = withSessionPromptCacheState(undefined, { modelId: 'claude-sonnet-4.6', cacheExpiresAt });
		assert.ok(initialSessionMeta);
		const { mockSession, dispatchedActions } = await createAgentSession(disposables, {
			resume: true,
			initialSessionMeta,
			configureMockSession: session => {
				session.usageMetricsResult.currentModel = 'claude-sonnet-4.6';
				session.usageMetricsResult.modelMetrics['claude-sonnet-4.6'] = { cacheExpiresAt };
				session.usageMetricsError = new Error('rpc unavailable');
			},
		});
		mockSession.fire('assistant.usage', {
			model: 'claude-sonnet-4.6',
			inputTokens: 50,
			outputTokens: 5,
		});
		await timeout(0);

		assert.deepStrictEqual(dispatchedActions.filter(action => action.type === ActionType.SessionMetaChanged), []);
	});

	test('clears prompt cache expiration when switching to a model without cached state', async () => {
		const { mockSession, dispatchedActions } = await createAgentSession(disposables);
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.8',
			inputTokens: 100,
			outputTokens: 10,
			cacheExpiresAt: '2026-07-24T12:00:00.000Z',
		});
		mockSession.fire('session.model_change', {
			previousModel: 'claude-opus-4.8',
			newModel: 'gpt-5.4',
		});
		await timeout(0);

		const promptCaches = dispatchedActions
			.filter(action => action.type === ActionType.SessionMetaChanged)
			.map(action => readSessionPromptCacheState(action._meta));
		assert.deepStrictEqual(promptCaches, [{
			modelId: 'claude-opus-4.8',
			cacheExpiresAt: '2026-07-24T12:00:00.000Z',
		}, undefined]);
	});

	test('preserves prompt cache expiration for same-model configuration changes', async () => {
		const { mockSession, dispatchedActions } = await createAgentSession(disposables);
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.8',
			inputTokens: 100,
			outputTokens: 10,
			cacheExpiresAt: '2026-07-24T12:00:00.000Z',
		});
		await timeout(0);
		mockSession.fire('session.model_change', {
			previousModel: 'claude-opus-4.8',
			newModel: 'claude-opus-4.8',
			reasoningEffort: 'high',
		});
		await timeout(0);

		const promptCaches = dispatchedActions
			.filter(action => action.type === ActionType.SessionMetaChanged)
			.map(action => readSessionPromptCacheState(action._meta));
		assert.deepStrictEqual(promptCaches, [{
			modelId: 'claude-opus-4.8',
			cacheExpiresAt: '2026-07-24T12:00:00.000Z',
		}]);
	});

	test('clears another model cache when a usage metrics refresh fails', async () => {
		const { mockSession, dispatchedActions } = await createAgentSession(disposables);
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.8',
			inputTokens: 100,
			outputTokens: 10,
			cacheExpiresAt: '2026-07-24T12:00:00.000Z',
		});
		await timeout(0);
		mockSession.usageMetricsError = new Error('rpc unavailable');
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.4',
			inputTokens: 50,
			outputTokens: 5,
		});
		await timeout(0);

		const promptCaches = dispatchedActions
			.filter(action => action.type === ActionType.SessionMetaChanged)
			.map(action => readSessionPromptCacheState(action._meta));
		assert.deepStrictEqual(promptCaches, [{
			modelId: 'claude-opus-4.8',
			cacheExpiresAt: '2026-07-24T12:00:00.000Z',
		}, undefined]);
	});

	test('forwards Auto model resolution on live usage metadata', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		const autoModeResolved = {
			chosenModel: 'claude-opus-4.8',
			reasoningBucket: 'high' as const,
			categoryScores: { reasoning: 0.91, code_gen: 0.72 },
			predictedLabel: 'needs_reasoning',
			confidence: 0.93,
			candidateModels: ['claude-opus-4.8', 'claude-sonnet-4.6'],
		};

		session.resetTurnState('turn-before-auto');
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 100,
			outputTokens: 200,
			cost: 5,
		} as SessionEventPayload<'assistant.usage'>['data']);
		session.resetTurnState('turn-auto');
		mockSession.fire('session.auto_mode_resolved', autoModeResolved);
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.8',
			inputTokens: 10,
			outputTokens: 20,
			cost: 2,
		} as SessionEventPayload<'assistant.usage'>['data']);

		const usageActions = signals
			.filter((signal): signal is IAgentActionSignal => signal.kind === 'action')
			.map(signal => signal.action)
			.filter((action): action is ChatUsageAction => action.type === ActionType.ChatUsage && action.turnId === 'turn-auto');

		assert.deepStrictEqual({
			usages: usageActions.map(action => action.usage),
			parsed: readUsageInfoMeta(usageActions.at(-1)?.usage).autoModeResolved,
		}, {
			usages: [
				{
					model: 'claude-opus-4.8',
					_meta: { autoModeResolved },
				},
				{
					inputTokens: 10,
					outputTokens: 20,
					model: 'claude-opus-4.8',
					cacheReadTokens: undefined,
					_meta: {
						cost: 2,
						autoModeResolved,
						turnTokenTotals: [{ model: 'claude-opus-4.8', inputTokens: 10, cachedTokens: 0, outputTokens: 20 }],
						directTurnTokenTotals: [{ model: 'claude-opus-4.8', inputTokens: 10, cachedTokens: 0, outputTokens: 20 }],
					},
				},
			],
			parsed: autoModeResolved,
		});
	});

	test('scopes a subagent Auto resolution to the subagent instead of the parent turn', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-1');
		mockSession.fire('subagent.started', {
			toolCallId: 'tc-subagent',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			agentDescription: 'Explore tests',
		} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

		// The subagent routes its own model call; the parent never picked this model.
		mockSession.fire('session.auto_mode_resolved', { chosenModel: 'gpt-5.5' }, { agentId: 'agent-1' });
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 5,
			outputTokens: 7,
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-1' });

		const routed = signals.flatMap(signal =>
			signal.kind === 'action' && signal.action.type === ActionType.ChatUsage
				? [{
					parentToolCallId: signal.parentToolCallId,
					chosenModel: readUsageInfoMeta(signal.action.usage).autoModeResolved?.chosenModel,
				}]
				: []);

		assert.deepStrictEqual(routed, [
			// The parent aggregate keeps describing the parent's own model call...
			{ parentToolCallId: undefined, chosenModel: undefined },
			// ...while the subagent's own component carries the routing.
			{ parentToolCallId: 'tc-subagent', chosenModel: 'gpt-5.5' },
		]);
	});

	test('keeps a subagent Auto resolution when the root turn moves on beneath it', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-1');
		mockSession.fire('subagent.started', {
			toolCallId: 'tc-subagent',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			agentDescription: 'Explore tests',
		} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

		mockSession.fire('session.auto_mode_resolved', { chosenModel: 'gpt-5.5' }, { agentId: 'agent-1' });
		// Steering mints a new root turn while the subagent is still running. Losing
		// the routing here would show the routed model to the hidden cohort, which
		// reads "no routing reported" as "not routed".
		session.resetTurnState('turn-2');
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 5,
			outputTokens: 7,
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-1' });

		const subagentRouting = signals.flatMap(signal =>
			signal.kind === 'action' && signal.action.type === ActionType.ChatUsage && signal.parentToolCallId === 'tc-subagent'
				? [readUsageInfoMeta(signal.action.usage).autoModeResolved?.chosenModel]
				: []);

		assert.deepStrictEqual(subagentRouting, ['gpt-5.5']);
	});

	test('keeps a subagent Auto resolution when the root turn has already been cleared', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-1');
		mockSession.fire('subagent.started', {
			toolCallId: 'tc-subagent',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			agentDescription: 'Explore tests',
		} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

		// A root-scope error clears the active turn while the subagent runs on.
		// Its routing must still be recorded, since the client reads "no routing
		// reported" as "not routed" and would name the concrete model.
		session.resetTurnState('');
		mockSession.fire('session.auto_mode_resolved', { chosenModel: 'gpt-5.5' }, { agentId: 'agent-1' });
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 5,
			outputTokens: 7,
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-1' });

		const subagentRouting = signals.flatMap(signal =>
			signal.kind === 'action' && signal.action.type === ActionType.ChatUsage && signal.parentToolCallId === 'tc-subagent'
				? [readUsageInfoMeta(signal.action.usage).autoModeResolved?.chosenModel]
				: []);

		assert.deepStrictEqual(subagentRouting, ['gpt-5.5']);
	});

	test('accumulates whole-turn token totals per model across parent and subagent calls', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-1');
		mockSession.fire('subagent.started', {
			toolCallId: 'tc-subagent',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			agentDescription: 'Explore tests',
		} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.8',
			inputTokens: 10,
			outputTokens: 20,
			cacheReadTokens: 4,
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.8',
			inputTokens: 100,
			outputTokens: 200,
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		// A subagent's call counts toward the turn under the subagent's own model,
		// exactly once, even though the event produces a parent and a child emit.
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 5,
			outputTokens: 7,
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-1' });

		const usageSignals = signals.flatMap(signal =>
			signal.kind === 'action' && signal.action.type === ActionType.ChatUsage
				? [{
					parentToolCallId: signal.parentToolCallId,
					turnTokenTotals: (signal.action.usage._meta as UsageInfoMeta | undefined)?.turnTokenTotals,
					directTurnTokenTotals: (signal.action.usage._meta as UsageInfoMeta | undefined)?.directTurnTokenTotals,
				}]
				: []);

		assert.deepStrictEqual(usageSignals, [
			{
				parentToolCallId: undefined,
				turnTokenTotals: [{ model: 'claude-opus-4.8', inputTokens: 10, cachedTokens: 4, outputTokens: 20 }],
				directTurnTokenTotals: [{ model: 'claude-opus-4.8', inputTokens: 10, cachedTokens: 4, outputTokens: 20 }],
			},
			{
				parentToolCallId: undefined,
				turnTokenTotals: [{ model: 'claude-opus-4.8', inputTokens: 110, cachedTokens: 4, outputTokens: 220 }],
				directTurnTokenTotals: [{ model: 'claude-opus-4.8', inputTokens: 110, cachedTokens: 4, outputTokens: 220 }],
			},
			{
				parentToolCallId: undefined,
				turnTokenTotals: [
					{ model: 'claude-opus-4.8', inputTokens: 110, cachedTokens: 4, outputTokens: 220 },
					{ model: 'gpt-5.5', inputTokens: 5, cachedTokens: 0, outputTokens: 7 },
				],
				directTurnTokenTotals: [
					{ model: 'claude-opus-4.8', inputTokens: 110, cachedTokens: 4, outputTokens: 220 },
				],
			},
			// The subagent's own report describes just its component of the turn.
			{
				parentToolCallId: 'tc-subagent',
				turnTokenTotals: undefined,
				directTurnTokenTotals: [{ model: 'gpt-5.5', inputTokens: 5, cachedTokens: 0, outputTokens: 7 }],
			},
		]);
	});

	test('starts whole-turn token totals over for each turn', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-1');
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.8',
			inputTokens: 10,
			outputTokens: 20,
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);

		session.resetTurnState('turn-2');
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.8',
			inputTokens: 3,
			outputTokens: 4,
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);

		const usageActions = getActions(signals).filter(a => a.type === ActionType.ChatUsage) as ChatUsageAction[];
		assert.deepStrictEqual((usageActions.at(-1)?.usage._meta as UsageInfoMeta | undefined)?.turnTokenTotals, [
			{ model: 'claude-opus-4.8', inputTokens: 3, cachedTokens: 0, outputTokens: 4 },
		]);
		assert.deepStrictEqual((usageActions.at(-1)?.usage._meta as UsageInfoMeta | undefined)?.directTurnTokenTotals, [
			{ model: 'claude-opus-4.8', inputTokens: 3, cachedTokens: 0, outputTokens: 4 },
		]);
	});

	test('reports the parent turn aggregate and additionally the per-subagent component', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-1');

		// Map the subagent's agentId to its parent tool call id.
		mockSession.fire('subagent.started', {
			toolCallId: 'tc-subagent',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			agentDescription: 'Explore tests',
		} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

		// Parent agent usage (no agentId) only contributes to the parent aggregate.
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.8',
			inputTokens: 10,
			outputTokens: 20,
			copilotUsage: { totalNanoAiu: 500_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		await timeout(0);

		// Subagent usage (its agentId) is emitted to the subagent's child session as
		// its own component; the parent aggregate grows via the SDK's session metrics.
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 5,
			outputTokens: 7,
			copilotUsage: { totalNanoAiu: 200_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-1' });
		await timeout(0);

		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 6,
			outputTokens: 8,
			copilotUsage: { totalNanoAiu: 300_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-1' });
		await timeout(0);

		const usageSignals = signals.flatMap(signal => {
			if (signal.kind !== 'action' || signal.action.type !== ActionType.ChatUsage) {
				return [];
			}
			return [{
				parentToolCallId: signal.parentToolCallId,
				model: signal.action.usage.model,
				inputTokens: signal.action.usage.inputTokens,
				outputTokens: signal.action.usage.outputTokens,
				totalNanoAiu: (signal.action.usage._meta as UsageInfoMeta | undefined)?.copilotUsage?.totalNanoAiu,
				directNanoAiu: (signal.action.usage._meta as UsageInfoMeta | undefined)?.directCopilotUsage?.totalNanoAiu,
			}];
		});

		// The parent aggregate always keeps the parent's own model/context tokens, and
		// its credits cover every call the turn caused (its own plus every subagent's).
		// They land on the synchronous emit, so a turn ending mid-refresh cannot lose them.
		assert.deepStrictEqual(usageSignals, [
			{ parentToolCallId: undefined, model: 'claude-opus-4.8', inputTokens: 10, outputTokens: 20, totalNanoAiu: 500_000_000, directNanoAiu: 500_000_000 },
			{ parentToolCallId: undefined, model: 'claude-opus-4.8', inputTokens: 10, outputTokens: 20, totalNanoAiu: 500_000_000, directNanoAiu: 500_000_000 },
			{ parentToolCallId: undefined, model: 'claude-opus-4.8', inputTokens: 10, outputTokens: 20, totalNanoAiu: 700_000_000, directNanoAiu: 500_000_000 },
			{ parentToolCallId: 'tc-subagent', model: 'gpt-5.5', inputTokens: 5, outputTokens: 7, totalNanoAiu: 200_000_000, directNanoAiu: 200_000_000 },
			{ parentToolCallId: undefined, model: 'claude-opus-4.8', inputTokens: 10, outputTokens: 20, totalNanoAiu: 700_000_000, directNanoAiu: 500_000_000 },
			{ parentToolCallId: undefined, model: 'claude-opus-4.8', inputTokens: 10, outputTokens: 20, totalNanoAiu: 1_000_000_000, directNanoAiu: 500_000_000 },
			{ parentToolCallId: 'tc-subagent', model: 'gpt-5.5', inputTokens: 6, outputTokens: 8, totalNanoAiu: 500_000_000, directNanoAiu: 500_000_000 },
			{ parentToolCallId: undefined, model: 'claude-opus-4.8', inputTokens: 10, outputTokens: 20, totalNanoAiu: 1_000_000_000, directNanoAiu: 500_000_000 },
		]);
	});

	test('starts direct subagent usage over when a retained child resumes', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-1');
		mockSession.fire('subagent.started', {
			toolCallId: 'tc-subagent',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			agentDescription: 'Explore tests',
		} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 5,
			outputTokens: 7,
			copilotUsage: { totalNanoAiu: 200_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-1' });
		mockSession.fire('subagent.completed', {
			toolCallId: 'tc-subagent',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			durationMs: 1,
			totalTokens: 12,
			totalToolCalls: 0,
		} as SessionEventPayload<'subagent.completed'>['data'], { agentId: 'agent-1' });

		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 6,
			outputTokens: 8,
			copilotUsage: { totalNanoAiu: 300_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-1' });

		const childUsage = signals.filter((signal): signal is IAgentActionSignal =>
			signal.kind === 'action'
			&& signal.parentToolCallId === 'tc-subagent'
			&& signal.action.type === ActionType.ChatUsage
		);
		const resumed = childUsage.at(-1)?.action;
		assert.ok(resumed?.type === ActionType.ChatUsage);
		const meta = resumed.usage._meta as UsageInfoMeta | undefined;
		assert.deepStrictEqual(meta?.directTurnTokenTotals, [
			{ model: 'gpt-5.5', inputTokens: 6, cachedTokens: 0, outputTokens: 8 },
		]);
		assert.deepStrictEqual(meta?.directCopilotUsage, { totalNanoAiu: 300_000_000 });
	});

	test('keeps direct subagent usage after the root turn completes', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-root');
		mockSession.fire('subagent.started', {
			toolCallId: 'tc-background',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			agentDescription: 'Background tests',
		} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-background' });
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 5,
			outputTokens: 7,
			copilotUsage: { totalNanoAiu: 200_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-background' });
		mockSession.fire('session.idle', { aborted: false } as SessionEventPayload<'session.idle'>['data']);

		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 6,
			outputTokens: 8,
			copilotUsage: { totalNanoAiu: 300_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-background' });

		const childUsage = signals.filter((signal): signal is IAgentActionSignal =>
			signal.kind === 'action'
			&& signal.parentToolCallId === 'tc-background'
			&& signal.action.type === ActionType.ChatUsage
		);
		const latest = childUsage.at(-1)?.action;
		assert.ok(latest?.type === ActionType.ChatUsage);
		const meta = latest.usage._meta as UsageInfoMeta | undefined;
		assert.deepStrictEqual(meta?.directTurnTokenTotals, [
			{ model: 'gpt-5.5', inputTokens: 11, cachedTokens: 0, outputTokens: 15 },
		]);
		assert.deepStrictEqual(meta?.directCopilotUsage, { totalNanoAiu: 500_000_000 });
	});

	test('does not fold an old background child into a newly active root', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-old-root');
		mockSession.fire('subagent.started', {
			toolCallId: 'tc-old-background',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			agentDescription: 'Background tests',
		} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-old-background' });
		mockSession.fire('session.idle', { aborted: false } as SessionEventPayload<'session.idle'>['data']);

		session.resetTurnState('turn-new-root');
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.8',
			inputTokens: 10,
			outputTokens: 2,
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 100,
			outputTokens: 20,
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-old-background' });

		const newRootUsage = signals.filter((signal): signal is IAgentActionSignal =>
			signal.kind === 'action'
			&& signal.parentToolCallId === undefined
			&& signal.action.type === ActionType.ChatUsage
			&& signal.action.turnId === 'turn-new-root'
		).at(-1);
		assert.ok(newRootUsage?.action.type === ActionType.ChatUsage);
		const meta = newRootUsage.action.usage._meta as UsageInfoMeta | undefined;
		assert.deepStrictEqual(meta?.turnTokenTotals, [
			{ model: 'claude-opus-4.8', inputTokens: 10, cachedTokens: 0, outputTokens: 2 },
		]);
		assert.deepStrictEqual(meta?.directTurnTokenTotals, [
			{ model: 'claude-opus-4.8', inputTokens: 10, cachedTokens: 0, outputTokens: 2 },
		]);
	});

	test('keeps unmapped subagent usage in root inclusive totals without direct attribution', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-root');
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 100,
			outputTokens: 20,
			copilotUsage: { totalNanoAiu: 400_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'unknown-agent' });

		const usageSignals = signals.filter((signal): signal is IAgentActionSignal =>
			signal.kind === 'action' && signal.action.type === ActionType.ChatUsage
		);
		assert.strictEqual(usageSignals.some(signal => signal.parentToolCallId !== undefined), false);
		const rootUsage = usageSignals.at(-1)?.action;
		assert.ok(rootUsage?.type === ActionType.ChatUsage);
		const meta = rootUsage.usage._meta as UsageInfoMeta | undefined;
		assert.deepStrictEqual(meta?.turnTokenTotals, [
			{ model: 'gpt-5.5', inputTokens: 100, cachedTokens: 0, outputTokens: 20 },
		]);
		assert.deepStrictEqual(meta?.copilotUsage, { totalNanoAiu: 400_000_000 });
		assert.strictEqual(meta?.directTurnTokenTotals, undefined);
		assert.strictEqual(meta?.directCopilotUsage, undefined);
	});

	test('routes legacy parentToolCallId usage to the child direct bucket', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-root');
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 9,
			outputTokens: 3,
			parentToolCallId: 'tc-legacy',
			copilotUsage: { totalNanoAiu: 400_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);

		const childUsage = signals.find((signal): signal is IAgentActionSignal =>
			signal.kind === 'action'
			&& signal.parentToolCallId === 'tc-legacy'
			&& signal.action.type === ActionType.ChatUsage
		);
		assert.ok(childUsage?.action.type === ActionType.ChatUsage);
		const meta = childUsage.action.usage._meta as UsageInfoMeta | undefined;
		assert.deepStrictEqual(meta?.directTurnTokenTotals, [
			{ model: 'gpt-5.5', inputTokens: 9, cachedTokens: 0, outputTokens: 3 },
		]);
		assert.deepStrictEqual(meta?.directCopilotUsage, { totalNanoAiu: 400_000_000 });
		const rootUsage = signals.find((signal): signal is IAgentActionSignal =>
			signal.kind === 'action'
			&& signal.parentToolCallId === undefined
			&& signal.action.type === ActionType.ChatUsage
		);
		assert.ok(rootUsage?.action.type === ActionType.ChatUsage);
		const rootMeta = rootUsage.action.usage._meta as UsageInfoMeta | undefined;
		assert.deepStrictEqual(rootMeta?.turnTokenTotals, [
			{ model: 'gpt-5.5', inputTokens: 9, cachedTokens: 0, outputTokens: 3 },
		]);
		assert.deepStrictEqual(rootMeta?.copilotUsage, { totalNanoAiu: 400_000_000 });
	});

	test('does not fold an old background child legacy usage into a newly active root', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-old-root');
		mockSession.fire('subagent.started', {
			toolCallId: 'tc-legacy-bg',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			agentDescription: 'Background legacy tests',
		} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-legacy-bg' });
		mockSession.fire('session.idle', { aborted: false } as SessionEventPayload<'session.idle'>['data']);

		session.resetTurnState('turn-new-root');
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.8',
			inputTokens: 10,
			outputTokens: 2,
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);

		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 100,
			outputTokens: 20,
			parentToolCallId: 'tc-legacy-bg',
			copilotUsage: { totalNanoAiu: 400_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);

		const newRootUsages = signals.filter((signal): signal is IAgentActionSignal =>
			signal.kind === 'action'
			&& signal.parentToolCallId === undefined
			&& signal.action.type === ActionType.ChatUsage
			&& signal.action.turnId === 'turn-new-root'
		);
		for (const signal of newRootUsages) {
			assert.ok(signal.action.type === ActionType.ChatUsage);
			const meta = signal.action.usage._meta as UsageInfoMeta | undefined;
			assert.deepStrictEqual(meta?.turnTokenTotals, [
				{ model: 'claude-opus-4.8', inputTokens: 10, cachedTokens: 0, outputTokens: 2 },
			]);
		}

		const childUsage = signals.filter((signal): signal is IAgentActionSignal =>
			signal.kind === 'action'
			&& signal.parentToolCallId === 'tc-legacy-bg'
			&& signal.action.type === ActionType.ChatUsage
		).at(-1);
		assert.ok(childUsage?.action.type === ActionType.ChatUsage);
		const childMeta = childUsage.action.usage._meta as UsageInfoMeta | undefined;
		assert.deepStrictEqual(childMeta?.directTurnTokenTotals, [
			{ model: 'gpt-5.5', inputTokens: 100, cachedTokens: 0, outputTokens: 20 },
		]);
		assert.deepStrictEqual(childMeta?.directCopilotUsage, { totalNanoAiu: 400_000_000 });
	});

	test('attributes subagent compaction to the child direct bucket', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-root');
		mockSession.fire('subagent.started', {
			toolCallId: 'tc-compaction',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			agentDescription: 'Compaction tests',
		} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-compaction' });
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 5,
			outputTokens: 7,
			cacheReadTokens: 2,
			cost: 3,
			copilotUsage: { totalNanoAiu: 100_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-compaction' });
		mockSession.fire('session.compaction_complete', {
			success: true,
			tokensRemoved: 1_000,
			compactionTokensUsed: {
				model: 'gpt-5.5',
				inputTokens: 40_000,
				outputTokens: 500,
				cacheReadTokens: 10_000,
				copilotUsage: { totalNanoAiu: 5_000_000_000 },
			},
		} as unknown as SessionEventPayload<'session.compaction_complete'>['data'], { agentId: 'agent-compaction' });

		const childUsage = signals.filter((signal): signal is IAgentActionSignal =>
			signal.kind === 'action'
			&& signal.parentToolCallId === 'tc-compaction'
			&& signal.action.type === ActionType.ChatUsage
		).at(-1);
		assert.ok(childUsage?.action.type === ActionType.ChatUsage);
		assert.deepStrictEqual({
			model: childUsage.action.usage.model,
			inputTokens: childUsage.action.usage.inputTokens,
			outputTokens: childUsage.action.usage.outputTokens,
			cacheReadTokens: childUsage.action.usage.cacheReadTokens,
			cost: (childUsage.action.usage._meta as UsageInfoMeta | undefined)?.cost,
		}, {
			model: 'gpt-5.5',
			inputTokens: 5,
			outputTokens: 7,
			cacheReadTokens: 2,
			cost: 3,
		});
		const meta = childUsage.action.usage._meta as UsageInfoMeta | undefined;
		assert.deepStrictEqual(meta?.directTurnTokenTotals, [
			{ model: 'gpt-5.5', inputTokens: 40_005, cachedTokens: 10_002, outputTokens: 507 },
		]);
		assert.deepStrictEqual(meta?.directCopilotUsage, { totalNanoAiu: 5_100_000_000 });
		assert.strictEqual(meta?.copilotUsage?.totalNanoAiu, 5_100_000_000);
	});

	test('forwards account quota snapshots on usage metadata', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-quota');
		mockSession.fire('assistant.usage', {
			model: 'claude-sonnet-4.6',
			inputTokens: 10,
			outputTokens: 20,
			// `quotaSnapshots` is marked `asInternal` in the SDK schema so it is not on the public type, but is present at runtime.
			quotaSnapshots: {
				premium_models: {
					isUnlimitedEntitlement: false,
					entitlementRequests: 300,
					usedRequests: 75,
					usageAllowedWithExhaustedQuota: true,
					remainingPercentage: 75,
					overage: 1.5,
					overageAllowedWithExhaustedQuota: true,
					resetDate: '2026-07-01T00:00:00.000Z',
					tokenBasedBilling: true,
					overageEntitlement: 5000,
				},
			},
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);

		const usageActions = signals
			.filter((s): s is IAgentActionSignal => s.kind === 'action')
			.map(s => s.action)
			.filter(a => a.type === ActionType.ChatUsage);

		assert.deepStrictEqual(usageActions.map(a => a.usage._meta?.quotaSnapshots), [
			{
				premium_models: {
					isUnlimitedEntitlement: false,
					entitlementRequests: 300,
					usedRequests: 75,
					remainingPercentage: 75,
					overage: 1.5,
					overageAllowedWithExhaustedQuota: true,
					resetDate: '2026-07-01T00:00:00.000Z',
					tokenBasedBilling: true,
					overageEntitlement: 5000,
				},
			},
		]);
	});

	test('extracts selected text from file contents for different line endings and bounds', async () => {
		const testCases = [
			{
				name: 'lf multiline',
				contents: 'zero\none\ntwo\nthree',
				selection: { start: { line: 1, character: 1 }, end: { line: 2, character: 2 } },
				expectedText: 'ne\ntw',
			},
			{
				name: 'crlf multiline',
				contents: 'zero\r\none\r\ntwo\r\nthree',
				selection: { start: { line: 1, character: 1 }, end: { line: 2, character: 2 } },
				expectedText: 'ne\r\ntw',
			},
			{
				name: 'clamps past eof',
				contents: 'zero\none',
				selection: { start: { line: 1, character: 1 }, end: { line: 42, character: 99 } },
				expectedText: 'ne',
			},
			{
				name: 'empty when end is before start',
				contents: 'zero\none',
				selection: { start: { line: 1, character: 3 }, end: { line: 1, character: 1 } },
				expectedText: '',
			},
		] satisfies ReadonlyArray<{
			name: string;
			contents: string;
			selection: {
				start: { line: number; character: number };
				end: { line: number; character: number };
			};
			expectedText: string;
		}>;

		for (const testCase of testCases) {
			const selectionUri = URI.file(`/workspace/${testCase.name}.ts`);
			const { session, mockSession } = await createAgentSession(disposables, {
				fileContents: {
					[selectionUri.toString()]: testCase.contents,
				},
			});

			await session.send('hello', [{
				type: MessageAttachmentKind.Resource,
				uri: selectionUri.toString(),
				label: `${testCase.name}.ts`,
				displayKind: 'selection',
				selection: { range: testCase.selection },
			}]);

			assert.deepStrictEqual(mockSession.sendRequests, [{
				prompt: 'hello',
				attachments: [{
					type: 'selection',
					filePath: selectionUri.fsPath,
					displayName: `${testCase.name}.ts`,
					text: testCase.expectedText,
					selection: testCase.selection,
				}],
			}], testCase.name);
			disposables.clear();
		}
	});

	test('falls back to file attachment when selection text cannot be read', async () => {
		const selectionUri = URI.file('/workspace/missing.ts');
		const logService = new CapturingLogService();
		const { session, mockSession } = await createAgentSession(disposables, {
			fileReadErrors: [selectionUri.toString()],
			logService,
		});

		await session.send('hello', [{
			type: MessageAttachmentKind.Resource,
			uri: selectionUri.toString(),
			label: 'missing.ts',
			displayKind: 'selection',
			selection: {
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 5 },
				},
			},
		}]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'hello',
			attachments: [
				{ type: 'file', path: selectionUri.fsPath, displayName: 'missing.ts' },
			],
		}]);
		assert.strictEqual(logService.warnings.length, 1);
		assert.match(logService.warnings[0].message, /Failed to read selected text/);
	});

	// ---- permission handling ----

	suite('permission handling', () => {

		test('read permission fires tool_ready (deferred to side effects)', async () => {
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'read',
				path: '/workspace/src/file.ts',
				toolCallId: 'tc-1',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-1', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('auto-approves read permission for session-state plan files', async () => {
			const previousCopilotHome = process.env['COPILOT_HOME'];
			process.env['COPILOT_HOME'] = '/mock-state-home/.copilot';
			try {
				const { runtime, signals } = await createAgentSession(disposables);
				const result = await runtime.handlePermissionRequest({
					kind: 'read',
					path: join('/mock-state-home', '.copilot', 'session-state', 'test-session-1', 'plan.md'),
					toolCallId: 'tc-read-plan',
				});

				assert.strictEqual(result.kind, 'approve-once');
				assert.strictEqual(signals.length, 0);
			} finally {
				if (previousCopilotHome === undefined) {
					delete process.env['COPILOT_HOME'];
				} else {
					process.env['COPILOT_HOME'] = previousCopilotHome;
				}
			}
		});

		test('resolves native environment through INativeEnvironmentService registration', async () => {
			const previousCopilotHome = process.env['COPILOT_HOME'];
			delete process.env['COPILOT_HOME'];
			try {
				const { runtime, signals } = await createAgentSession(disposables, { environmentServiceRegistration: 'native' });
				const result = await runtime.handlePermissionRequest({
					kind: 'read',
					path: join('/mock-home', '.copilot', 'session-state', 'test-session-1', 'plan.md'),
					toolCallId: 'tc-read-plan-native-env',
				});

				assert.strictEqual(result.kind, 'approve-once');
				assert.strictEqual(signals.length, 0);
			} finally {
				if (previousCopilotHome === undefined) {
					delete process.env['COPILOT_HOME'];
				} else {
					process.env['COPILOT_HOME'] = previousCopilotHome;
				}
			}
		});

		test('logs and rethrows permission failures', async () => {
			const previousCopilotHome = process.env['COPILOT_HOME'];
			delete process.env['COPILOT_HOME'];
			const logService = new CapturingLogService();
			try {
				const { runtime } = await createAgentSession(disposables, {
					environmentServiceRegistration: 'none',
					logService,
				});

				await assert.rejects(
					runtime.handlePermissionRequest({
						kind: 'read',
						path: join('/mock-home', '.copilot', 'session-state', 'test-session-1', 'plan.md'),
						toolCallId: 'tc-read-plan-missing-env',
					}),
				);

				assert.strictEqual(logService.errors.length, 1);
				const [entry] = logService.errors;
				assert.ok(entry.first instanceof TypeError);
				assert.strictEqual(entry.args[0], '[Copilot:test-session-1] Failed to handle permission request: kind=read, toolCallId=tc-read-plan-missing-env');
			} finally {
				if (previousCopilotHome === undefined) {
					delete process.env['COPILOT_HOME'];
				} else {
					process.env['COPILOT_HOME'] = previousCopilotHome;
				}
			}
		});

		test('write permission fires tool_ready (deferred to side effects)', async () => {
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'write',
				fileName: '/workspace/src/file.ts',
				toolCallId: 'tc-1',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-1', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('new-file write permission includes proposed content and create wording', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'write',
				fileName: '/workspace/package.json',
				newFileContents: '{"name":"example"}\n',
				toolCallId: 'tc-create',
			});

			const signal = await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signal.kind, 'pending_confirmation');
			if (signal.kind !== 'pending_confirmation') {
				throw new Error('Expected a pending confirmation');
			}
			const edit = signal.state.edits?.items[0];
			assert.deepStrictEqual({
				title: signal.state.confirmationTitle,
				message: signal.state.invocationMessage,
				before: edit?.before,
				afterUri: edit?.after?.uri,
				contentScheme: edit?.after?.content.uri ? URI.parse(edit.after.content.uri).scheme : undefined,
			}, {
				title: 'Create file?',
				message: { markdown: 'Create [package.json](file:///workspace/package.json)' },
				before: undefined,
				afterUri: 'file:///workspace/package.json',
				contentScheme: 'pending-edit-content',
			});

			assert.ok(session.respondToPermissionRequest('tc-create', false));
			assert.deepStrictEqual(await resultPromise, { kind: 'reject', feedback: 'The user denied permission.' });
		});

		test('auto-approves write permission for session-state plan files', async () => {
			const previousCopilotHome = process.env['COPILOT_HOME'];
			process.env['COPILOT_HOME'] = '/mock-state-home/.copilot';
			try {
				const { runtime, signals } = await createAgentSession(disposables);
				const result = await runtime.handlePermissionRequest({
					kind: 'write',
					fileName: join('/mock-state-home', '.copilot', 'session-state', 'test-session-1', 'plan.md'),
					toolCallId: 'tc-write-plan',
				});

				assert.strictEqual(result.kind, 'approve-once');
				assert.strictEqual(signals.length, 0);
			} finally {
				if (previousCopilotHome === undefined) {
					delete process.env['COPILOT_HOME'];
				} else {
					process.env['COPILOT_HOME'] = previousCopilotHome;
				}
			}
		});

		test('does not auto-approve session-state files from another session', async () => {
			const previousCopilotHome = process.env['COPILOT_HOME'];
			process.env['COPILOT_HOME'] = '/mock-state-home/.copilot';
			try {
				const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
				const resultPromise = runtime.handlePermissionRequest({
					kind: 'write',
					fileName: join('/mock-state-home', '.copilot', 'session-state', 'different-session', 'plan.md'),
					toolCallId: 'tc-write-other-plan',
				});

				await waitForSignal(s => s.kind === 'pending_confirmation');
				assert.strictEqual(signals.length, 1);

				assert.ok(session.respondToPermissionRequest('tc-write-other-plan', true));
				const result = await resultPromise;
				assert.strictEqual(result.kind, 'approve-once');
			} finally {
				if (previousCopilotHome === undefined) {
					delete process.env['COPILOT_HOME'];
				} else {
					process.env['COPILOT_HOME'] = previousCopilotHome;
				}
			}
		});

		test('does not auto-approve traversal paths that escape the session-state directory', async () => {
			const previousCopilotHome = process.env['COPILOT_HOME'];
			process.env['COPILOT_HOME'] = '/mock-state-home/.copilot';
			try {
				const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
				const sessionDir = join('/mock-state-home', '.copilot', 'session-state', 'test-session-1');
				const resultPromise = runtime.handlePermissionRequest({
					kind: 'write',
					fileName: `${sessionDir}${sep}..${sep}outside.md`,
					toolCallId: 'tc-write-traversal',
				});

				await waitForSignal(s => s.kind === 'pending_confirmation');
				assert.strictEqual(signals.length, 1);

				assert.ok(session.respondToPermissionRequest('tc-write-traversal', true));
				const result = await resultPromise;
				assert.strictEqual(result.kind, 'approve-once');
			} finally {
				if (previousCopilotHome === undefined) {
					delete process.env['COPILOT_HOME'];
				} else {
					process.env['COPILOT_HOME'] = previousCopilotHome;
				}
			}
		});

		test('auto-approves read of Copilot SDK large-tool-output temp files', async () => {
			const { runtime, signals } = await createAgentSession(disposables);

			// Layout 1: <timestamp>-copilot-tool-output-<id>.txt
			const result1 = await runtime.handlePermissionRequest({
				kind: 'read',
				path: join('/mock-tmp', '1730000000000-copilot-tool-output-abc123.txt'),
				toolCallId: 'tc-tool-output-1',
			});
			assert.strictEqual(result1.kind, 'approve-once');

			// Layout 2: copilot-tool-output-<timestamp>-<id>.txt
			const result2 = await runtime.handlePermissionRequest({
				kind: 'read',
				path: join('/mock-tmp', 'copilot-tool-output-1730000000000-abc123.txt'),
				toolCallId: 'tc-tool-output-2',
			});
			assert.strictEqual(result2.kind, 'approve-once');

			// Layout 3: <timestamp>-copilot-tool-output-<process-id>-<uuid>.txt
			const result3 = await runtime.handlePermissionRequest({
				kind: 'read',
				path: join('/mock-tmp', '1786499016779-copilot-tool-output-44600-1a0a63b8-4548-4fb8-a507-da72473e0556.txt'),
				toolCallId: 'tc-tool-output-3',
			});
			assert.strictEqual(result3.kind, 'approve-once');

			assert.strictEqual(signals.length, 0);
		});

		test('does not auto-approve tool-output-named files outside tmpdir', async () => {
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'read',
				path: join('/some/other/dir', 'copilot-tool-output-1730000000000-abc123.txt'),
				toolCallId: 'tc-tool-output-outside',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-tool-output-outside', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('does not auto-approve unrelated files inside tmpdir', async () => {
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'read',
				path: join('/mock-tmp', 'something-else.txt'),
				toolCallId: 'tc-tmp-other',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-tmp-other', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('does not auto-approve write to a tool-output temp path', async () => {
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'write',
				fileName: join('/mock-tmp', 'copilot-tool-output-1730000000000-abc123.txt'),
				toolCallId: 'tc-tool-output-write',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-tool-output-write', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('write permission outside working directory fires tool_ready', async () => {
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);

			const resultPromise = runtime.handlePermissionRequest({
				kind: 'write',
				fileName: '/other/file.ts',
				toolCallId: 'tc-write-outside',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-write-outside', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('read permission outside working directory fires tool_ready', async () => {
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);

			// Kick off permission request but don't await — it will block
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'read',
				path: '/other/file.ts',
				toolCallId: 'tc-2',
			});

			// Should have fired a pending_confirmation signal
			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			// Respond to it
			assert.ok(session.respondToPermissionRequest('tc-2', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('denies permission when no toolCallId', async () => {
			const { runtime } = await createAgentSession(disposables);
			const result = await runtime.handlePermissionRequest({ kind: 'write' });
			assert.strictEqual(result.kind, 'reject');
		});

		test('rejects with feedback when user denies', async () => {
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'shell',
				toolCallId: 'tc-3',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);
			session.respondToPermissionRequest('tc-3', false);
			const result = await resultPromise;
			assert.deepStrictEqual(result, { kind: 'reject', feedback: 'The user denied permission.' });
		});

		test('shell permissions carry the tracked shell language when known', async () => {
			const cases = [
				{ toolCallId: 'tc-powershell-language', trackedToolName: 'powershell', expected: 'powershell' },
				{ toolCallId: 'tc-bash-language', trackedToolName: 'bash', expected: 'bash' },
				{ toolCallId: 'tc-unrecognized-language', trackedToolName: 'unexpected-shell-tool', expected: undefined },
				{ toolCallId: 'tc-missing-language', trackedToolName: undefined, expected: undefined },
			] as const;
			const actual: string[] = [];

			for (const { toolCallId, trackedToolName } of cases) {
				const { session, runtime, mockSession, waitForSignal } = await createAgentSession(disposables);
				if (trackedToolName) {
					mockSession.fire('tool.execution_start', {
						toolCallId,
						toolName: trackedToolName,
						arguments: { command: 'Get-ChildItem' },
					} as SessionEventPayload<'tool.execution_start'>['data']);
				}
				const resultPromise = runtime.handlePermissionRequest({
					kind: 'shell',
					toolCallId,
					fullCommandText: 'Get-ChildItem',
				});
				const signal = await waitForSignal(s => s.kind === 'pending_confirmation' && s.state.toolCallId === toolCallId);
				assert.strictEqual(signal.kind, 'pending_confirmation');
				if (signal.kind !== 'pending_confirmation') {
					throw new Error('Expected a pending confirmation');
				}
				actual.push(`${toolCallId}=${signal.shellLanguage}`);
				assert.ok(session.respondToPermissionRequest(toolCallId, true));
				assert.strictEqual((await resultPromise).kind, 'approve-once');
			}

			assert.deepStrictEqual(actual, cases.map(({ toolCallId, expected }) => `${toolCallId}=${expected}`));
		});

		test('custom terminal permissions are normalized for shell auto-approval', async () => {
			const cases = [
				{ toolCallId: 'tc-custom-bash', toolName: 'bash', command: 'git status' },
				{ toolCallId: 'tc-custom-powershell', toolName: 'powershell', command: 'Get-ChildItem' },
			] as const;
			const actual: Array<{ permissionKind: string | undefined; toolInput: string | undefined; shellLanguage: string | undefined }> = [];

			for (const { toolCallId, toolName, command } of cases) {
				const { session, runtime, waitForSignal } = await createAgentSession(disposables);
				const resultPromise = runtime.handlePermissionRequest({
					kind: 'custom-tool',
					toolCallId,
					toolName,
					args: { command },
				});
				const signal = await waitForSignal(s => s.kind === 'pending_confirmation' && s.state.toolCallId === toolCallId);
				assert.strictEqual(signal.kind, 'pending_confirmation');
				if (signal.kind !== 'pending_confirmation') {
					throw new Error('Expected a pending confirmation');
				}
				actual.push({
					permissionKind: signal.permissionKind,
					toolInput: getInlineToolInput(signal.state.toolInput),
					shellLanguage: signal.shellLanguage,
				});
				assert.ok(session.respondToPermissionRequest(toolCallId, true));
				assert.strictEqual((await resultPromise).kind, 'approve-once');
				disposables.clear();
			}

			assert.deepStrictEqual(actual, cases.map(({ toolName, command }) => ({
				permissionKind: 'shell',
				toolInput: command,
				shellLanguage: toolName,
			})));
		});

		test('auto-approves sandboxed-by-default shell command without prompting', async () => {
			const { runtime, signals } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } },
			});

			const result = await runtime.handlePermissionRequest({
				kind: 'shell',
				toolCallId: 'tc-sandboxed',
				fullCommandText: 'cat ~/something.txt',
			});

			assert.strictEqual(result.kind, 'approve-once');
			assert.strictEqual(signals.length, 0);
		});

		test('does not auto-approve a sandboxed shell command for a file-scoped surface', async () => {
			// The sandbox contains a command to the workspace, not to inline
			// chat's single target file, so it must still prompt.
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } },
				hasScopedEditSurface: true,
			});

			const resultPromise = runtime.handlePermissionRequest({
				kind: 'shell',
				toolCallId: 'tc-scoped-sandboxed',
				fullCommandText: 'cat ~/something.txt',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation' && s.state.toolCallId === 'tc-scoped-sandboxed');
			assert.strictEqual(signals.length, 1);
			assert.ok(session.respondToPermissionRequest('tc-scoped-sandboxed', true));
			assert.strictEqual((await resultPromise).kind, 'approve-once');
		});

		test('does not auto-approve a shell command that opted out of the sandbox', async () => {
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } },
			});

			const resultPromise = runtime.handlePermissionRequest({
				kind: 'shell',
				toolCallId: 'tc-sandboxbypass',
				fullCommandText: 'cat ~/something.txt',
				requestSandboxBypass: true,
			});

			// Must fall through to the normal confirmation flow rather than
			// auto-approving, since the command escapes the sandbox.
			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);
			assert.ok(session.respondToPermissionRequest('tc-sandboxbypass', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('per-request sandbox: applies the configured policy under default permissions', async () => {
			const sandbox = { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On };
			const { session, mockSession } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: sandbox },
			});

			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual(mockSession.sandboxConfigUpdates.at(-1), buildSandboxConfigForSdk('linux', sandbox));
			assert.deepStrictEqual(mockSession.permissionModeSetCalls, ['manual']);
		});

		test('per-request sandbox: applies the configured policy under session bypass approvals', async () => {
			const sandbox = { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On };
			const { session, mockSession } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: sandbox },
				configValues: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
			});

			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual(mockSession.sandboxConfigUpdates.at(-1), buildSandboxConfigForSdk('linux', sandbox));
			assert.deepStrictEqual(mockSession.permissionModeSetCalls, ['allow-all']);
		});

		test('per-request permissions: delegates approvals to the SDK under Approve When Safe', async () => {
			const { session, mockSession } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'assisted' },
			});

			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual({
				experimentalModeUpdates: mockSession.experimentalModeUpdates,
				permissionModes: mockSession.permissionModeSetCalls,
			}, {
				experimentalModeUpdates: [true],
				permissionModes: ['assisted'],
			});
		});

		test('does not send when the SDK rejects experimental mode for Approve When Safe', async () => {
			const { session, mockSession } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'assisted' },
			});
			mockSession.experimentalModeUpdateSuccess = false;

			await assert.rejects(() => session.send('hello', undefined, 'turn-1'), /rejected experimental mode/);

			assert.deepStrictEqual({
				permissionModes: mockSession.permissionModeSetCalls,
				sends: mockSession.sendRequests,
			}, {
				permissionModes: [],
				sends: [],
			});
		});

		test('switching from Bypass to Default immediately disables SDK allow-all mode', async () => {
			const configValues: Record<string, unknown> = { [SessionConfigKey.AutoApprove]: 'autoApprove' };
			const logService = new CapturingLogService();
			const { session, mockSession } = await createAgentSession(disposables, { configValues, logService });

			await session.send('hello', undefined, 'turn-1');
			configValues[SessionConfigKey.AutoApprove] = 'default';
			await session.syncPermissionMode('config-change');

			assert.deepStrictEqual({
				modes: mockSession.permissionModeSetCalls,
				logs: logService.infos
					.map(entry => entry.message)
					.filter(message => message.includes('Syncing permission mode')),
			}, {
				modes: ['allow-all', 'manual'],
				logs: [
					'[Copilot:test-session-1] Syncing permission mode: source=turn-start, agentMode=interactive, configuredLevel=autoApprove, sdkMode=allow-all, previousSdkMode=unknown, globalAutoApprove=false',
					'[Copilot:test-session-1] Syncing permission mode: source=config-change, agentMode=interactive, configuredLevel=default, sdkMode=manual, previousSdkMode=allow-all, globalAutoApprove=false',
				],
			});
		});

		test('switching from Approve When Safe to Ask When Needed disables SDK experimental mode', async () => {
			const configValues: Record<string, unknown> = { [SessionConfigKey.AutoApprove]: 'assisted' };
			const { session, mockSession } = await createAgentSession(disposables, { configValues });

			await session.syncPermissionMode('turn-start');
			configValues[SessionConfigKey.AutoApprove] = 'default';
			await session.syncPermissionMode('config-change');

			assert.deepStrictEqual({
				experimentalModeUpdates: mockSession.experimentalModeUpdates,
				permissionModes: mockSession.permissionModeSetCalls,
			}, {
				experimentalModeUpdates: [true, false],
				permissionModes: ['assisted', 'manual'],
			});
		});

		test('Approve When Safe honors approve recommendations without prompting', async () => {
			const { session, runtime, mockSession, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'assisted' },
			});
			await session.syncPermissionMode('turn-start');
			mockSession.fire('permission.requested', {
				requestId: 'request-1',
				permissionRequest: { kind: 'read', path: '/workspace/src/file.ts', intention: 'Read the file', toolCallId: 'tc-assisted' },
				promptRequest: {
					kind: 'path',
					accessKind: 'read',
					paths: ['/workspace/src/file.ts'],
					toolCallId: 'tc-assisted',
					assistedApproval: { recommendation: 'approve', reason: 'Low risk' },
				},
			});

			const result = await runtime.handlePermissionRequest({
				kind: 'read',
				path: '/workspace/src/file.ts',
				toolCallId: 'tc-assisted',
			});

			assert.deepStrictEqual({ result, signals }, {
				result: { kind: 'approve-once' },
				signals: [],
			});
		});

		test('managed approval requires confirmation despite an approve recommendation', async () => {
			const { session, runtime, mockSession, signals, waitForSignal } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'assisted' },
			});
			await session.syncPermissionMode('turn-start');
			mockSession.fire('permission.requested', {
				requestId: 'request-managed',
				permissionRequest: {
					kind: 'read',
					path: '/workspace/src/file.ts',
					intention: 'Read the file',
					toolCallId: 'tc-managed',
					managedApprovalRequired: true,
				},
				promptRequest: {
					kind: 'path',
					accessKind: 'read',
					paths: ['/workspace/src/file.ts'],
					toolCallId: 'tc-managed',
					assistedApproval: { recommendation: 'approve', reason: 'Low risk' },
				},
			});

			const resultPromise = runtime.handlePermissionRequest({
				kind: 'read',
				path: '/workspace/src/file.ts',
				toolCallId: 'tc-managed',
				managedApprovalRequired: true,
			});

			await waitForSignal(signal => signal.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);
			assert.strictEqual(signals[0].kind === 'pending_confirmation' && signals[0].managedApprovalRequired, true);
			assert.ok(session.respondToPermissionRequest('tc-managed', true));
			assert.strictEqual((await resultPromise).kind, 'approve-once');
		});

		test('managed approval requires confirmation under global and session allow-all modes', async () => {
			const testCases = [
				{
					name: 'global',
					options: { rootValues: { [AgentHostGlobalAutoApproveEnabledConfigKey]: true } },
				},
				{
					name: 'session',
					options: { configValues: { [SessionConfigKey.AutoApprove]: 'autoApprove' } },
				},
			];

			for (const testCase of testCases) {
				const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables, testCase.options);
				await session.syncPermissionMode('turn-start');
				const toolCallId = `tc-managed-${testCase.name}`;
				const resultPromise = runtime.handlePermissionRequest({
					kind: 'read',
					path: '/workspace/src/file.ts',
					toolCallId,
					managedApprovalRequired: true,
				});

				await waitForSignal(signal => signal.kind === 'pending_confirmation');
				assert.deepStrictEqual({
					managedApprovalRequired: signals[0].kind === 'pending_confirmation' ? signals[0].managedApprovalRequired : undefined,
					responded: session.respondToPermissionRequest(toolCallId, false),
					result: await resultPromise,
				}, {
					managedApprovalRequired: true,
					responded: true,
					result: { kind: 'reject', feedback: 'The user denied permission.' },
				}, testCase.name);
				disposables.clear();
			}
		});

		test('managed read and write approvals do not auto-approve duplicate requests', async () => {
			const testCases = [
				{
					name: 'read',
					request: {
						kind: 'read' as const,
						path: '/workspace/src/file.ts',
						toolCallId: 'tc-managed-duplicate-read',
						managedApprovalRequired: true,
					},
				},
				{
					name: 'write',
					request: {
						kind: 'write' as const,
						fileName: '/workspace/src/file.ts',
						toolCallId: 'tc-managed-duplicate-write',
						managedApprovalRequired: true,
					},
				},
			];

			for (const testCase of testCases) {
				const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
				const firstResultPromise = runtime.handlePermissionRequest(testCase.request);
				await waitForSignal(signal => signal.kind === 'pending_confirmation');
				assert.ok(session.respondToPermissionRequest(testCase.request.toolCallId, true));
				const firstResult = await firstResultPromise;

				const duplicateResultPromise = runtime.handlePermissionRequest({ ...testCase.request });
				await timeout(0);
				const pendingConfirmationCount = signals.filter(signal => signal.kind === 'pending_confirmation').length;
				assert.ok(session.respondToPermissionRequest(testCase.request.toolCallId, false));

				assert.deepStrictEqual({
					results: [firstResult, await duplicateResultPromise],
					pendingConfirmationCount,
				}, {
					results: [{ kind: 'approve-once' }, { kind: 'reject', feedback: 'The user denied permission.' }],
					pendingConfirmationCount: 2,
				}, testCase.name);
				disposables.clear();
			}
		});

		test('Approve When Safe correlates a recommendation event that arrives after the permission callback', async () => {
			const { session, runtime, mockSession, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'assisted' },
			});
			await session.syncPermissionMode('turn-start');

			const resultPromise = runtime.handlePermissionRequest({
				kind: 'write',
				fileName: '/workspace/package.json',
				intention: 'Edit file',
				diff: 'diff',
				toolCallId: 'tc-assisted-late-event',
			});
			mockSession.fire('permission.requested', {
				requestId: 'request-late-event',
				permissionRequest: {
					kind: 'write',
					fileName: '/workspace/package.json',
					intention: 'Edit file',
					diff: 'diff',
					canOfferSessionApproval: true,
					toolCallId: 'tc-assisted-late-event',
				},
				promptRequest: {
					kind: 'write',
					fileName: '/workspace/package.json',
					intention: 'Edit file',
					diff: 'diff',
					canOfferSessionApproval: true,
					toolCallId: 'tc-assisted-late-event',
					assistedApproval: { recommendation: 'approve', reason: 'Matches the request' },
				},
			});

			assert.deepStrictEqual({
				result: await resultPromise,
				signals,
			}, {
				result: { kind: 'approve-once' },
				signals: [],
			});
		});

		test('Approve When Safe prompts when the model requires approval', async () => {
			const { session, runtime, mockSession, waitForSignal } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'assisted' },
			});
			await session.syncPermissionMode('turn-start');
			mockSession.fire('permission.requested', {
				requestId: 'request-2',
				permissionRequest: { kind: 'read', path: '/workspace/src/file.ts', intention: 'Read the file', toolCallId: 'tc-assisted-prompt' },
				promptRequest: {
					kind: 'path',
					accessKind: 'read',
					paths: ['/workspace/src/file.ts'],
					toolCallId: 'tc-assisted-prompt',
					assistedApproval: { recommendation: 'requireApproval', reason: 'Needs confirmation' },
				},
			});

			const resultPromise = runtime.handlePermissionRequest({
				kind: 'read',
				path: '/workspace/src/file.ts',
				toolCallId: 'tc-assisted-prompt',
			});
			const confirmation = await waitForSignal(signal => signal.kind === 'pending_confirmation');
			assert.deepStrictEqual(confirmation.kind === 'pending_confirmation' ? confirmation.state.riskAssessment : undefined, {
				kind: ToolCallRiskAssessmentKind.Judge,
				status: ToolCallRiskAssessmentStatus.Complete,
				reason: 'Needs confirmation',
				safety: 0,
			});
			assert.ok(session.respondToPermissionRequest('tc-assisted-prompt', true));

			assert.strictEqual((await resultPromise).kind, 'approve-once');
		});

		test('Approve When Safe never bypasses sandbox-escape confirmation', async () => {
			const { session, runtime, mockSession, waitForSignal } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'assisted' },
			});
			await session.syncPermissionMode('turn-start');
			mockSession.fire('permission.requested', {
				requestId: 'request-3',
				permissionRequest: {
					kind: 'shell',
					canOfferSessionApproval: false,
					commands: [],
					fullCommandText: 'curl https://example.com',
					hasWriteFileRedirection: false,
					intention: 'Access the network',
					possiblePaths: [],
					possibleUrls: [{ url: 'https://example.com' }],
					requestSandboxBypass: true,
					toolCallId: 'tc-assisted-bypass',
				},
				promptRequest: {
					kind: 'commands',
					canOfferSessionApproval: false,
					commandIdentifiers: ['curl'],
					fullCommandText: 'curl https://example.com',
					intention: 'Access the network',
					toolCallId: 'tc-assisted-bypass',
					assistedApproval: { recommendation: 'approve', reason: 'Incorrect recommendation' },
				},
			});

			const resultPromise = runtime.handlePermissionRequest({
				kind: 'shell',
				toolCallId: 'tc-assisted-bypass',
				fullCommandText: 'curl https://example.com',
				requestSandboxBypass: true,
			});
			const confirmation = await waitForSignal(signal => signal.kind === 'pending_confirmation');
			assert.deepStrictEqual(confirmation.kind === 'pending_confirmation' ? confirmation.state.riskAssessment : undefined, {
				kind: ToolCallRiskAssessmentKind.Judge,
				status: ToolCallRiskAssessmentStatus.Complete,
				reason: 'Incorrect recommendation',
				safety: 1,
			});
			assert.ok(session.respondToPermissionRequest('tc-assisted-bypass', false));

			assert.deepStrictEqual(await resultPromise, { kind: 'reject', feedback: 'The user denied permission.' });
		});

		test('does not send when the SDK rejects the requested permission mode', async () => {
			const { session, mockSession } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'assisted' },
			});
			mockSession.permissionModeSetSuccess = false;

			await assert.rejects(() => session.send('hello', undefined, 'turn-1'), /rejected permission mode 'assisted'/);

			assert.deepStrictEqual(mockSession.sendRequests, []);
		});

		test('defers an idle session approval change until the next turn', async () => {
			const { session, mockSession, setConfigValue, fireSessionConfigChange } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'assisted' },
			});
			await session.syncPermissionMode('turn-start');
			setConfigValue(SessionConfigKey.AutoApprove, 'default');

			fireSessionConfigChange({ [SessionConfigKey.AutoApprove]: 'default' });
			await timeout(0);
			const beforeTurn = [...mockSession.permissionModeSetCalls];
			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual({
				beforeTurn,
				afterTurn: mockSession.permissionModeSetCalls,
			}, {
				beforeTurn: ['assisted'],
				afterTurn: ['assisted', 'manual'],
			});
		});

		test('keeps sandbox enabled when the session approval level changes', async () => {
			const sandbox = { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On };
			const { session, mockSession, setConfigValue, fireSessionConfigChange } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: sandbox },
				configValues: { [SessionConfigKey.AutoApprove]: 'default' },
			});
			await session.send('hello', undefined, 'turn-1');

			setConfigValue(SessionConfigKey.AutoApprove, 'autoApprove');
			fireSessionConfigChange({ [SessionConfigKey.AutoApprove]: 'autoApprove' });
			await timeout(0);

			setConfigValue(SessionConfigKey.AutoApprove, 'default');
			fireSessionConfigChange({ [SessionConfigKey.AutoApprove]: 'default' });
			await timeout(0);

			assert.deepStrictEqual({
				permissionModes: mockSession.permissionModeSetCalls,
				sandboxConfigs: mockSession.sandboxConfigUpdates,
			}, {
				permissionModes: ['manual', 'allow-all', 'manual'],
				sandboxConfigs: [
					buildSandboxConfigForSdk('linux', sandbox),
					buildSandboxConfigForSdk('linux', sandbox),
					buildSandboxConfigForSdk('linux', sandbox),
				],
			});
		});

		test('ignores approval changes for other sessions', async () => {
			const { session, mockSession, setConfigValue, fireSessionConfigChange } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'assisted' },
			});
			await session.syncPermissionMode('turn-start');
			setConfigValue(SessionConfigKey.AutoApprove, 'default');

			fireSessionConfigChange({ [SessionConfigKey.AutoApprove]: 'default' }, AgentSession.uri('copilot', 'other-session').toString());
			await timeout(0);

			assert.deepStrictEqual(mockSession.permissionModeSetCalls, ['assisted']);
		});

		test('syncs permission mode when root approval configuration changes', async () => {
			const { session, mockSession, setRootValue, fireRootConfigChange } = await createAgentSession(disposables);
			await session.syncPermissionMode('turn-start');
			session.resetTurnState('active-turn');
			setRootValue(AgentHostGlobalAutoApproveEnabledConfigKey, true);

			fireRootConfigChange();
			await timeout(0);

			assert.deepStrictEqual(mockSession.permissionModeSetCalls, ['manual', 'allow-all']);
		});

		test('aborts when a live permission mode update fails', async () => {
			const { session, mockSession, setConfigValue, fireSessionConfigChange } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'assisted' },
			});
			await session.syncPermissionMode('turn-start');
			session.resetTurnState('active-turn');
			mockSession.permissionModeSetSuccess = false;
			setConfigValue(SessionConfigKey.AutoApprove, 'default');

			fireSessionConfigChange({ [SessionConfigKey.AutoApprove]: 'default' });
			await timeout(0);

			assert.strictEqual(mockSession.abortCalls, 1);
		});

		test('aborts when a live sandbox update fails', async () => {
			const { session, mockSession, setConfigValue, fireSessionConfigChange } = await createAgentSession(disposables);
			await session.syncPermissionMode('turn-start');
			session.resetTurnState('active-turn');
			mockSession.sandboxConfigUpdateSuccess = false;
			setConfigValue(SessionConfigKey.AutoApprove, 'autoApprove');

			fireSessionConfigChange({ [SessionConfigKey.AutoApprove]: 'autoApprove' });
			await timeout(0);

			assert.deepStrictEqual({
				permissionModes: mockSession.permissionModeSetCalls,
				abortCalls: mockSession.abortCalls,
			}, {
				permissionModes: ['manual', 'allow-all'],
				abortCalls: 1,
			});
		});

		test('per-request permissions: Autopilot with Ask When Needed keeps SDK approval mode off', async () => {
			const sandbox = { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On };
			const { session, mockSession } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: sandbox },
				configValues: {
					[SessionConfigKey.Mode]: 'autopilot',
					[SessionConfigKey.AutoApprove]: 'default',
				},
			});

			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual({
				permissionModes: mockSession.permissionModeSetCalls,
				sandbox: mockSession.sandboxConfigUpdates.at(-1),
			}, {
				permissionModes: ['manual'],
				sandbox: buildSandboxConfigForSdk('linux', sandbox),
			});
		});

		test('per-request sandbox: applies the configured policy under global auto-approve', async () => {
			const sandbox = { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On };
			const { session, mockSession } = await createAgentSession(disposables, {
				rootValues: {
					[AgentHostSandboxConfigKey.Sandbox]: sandbox,
					[AgentHostGlobalAutoApproveEnabledConfigKey]: true,
				},
			});

			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual(mockSession.sandboxConfigUpdates.at(-1), buildSandboxConfigForSdk('linux', sandbox));
		});

		test('per-request sandbox: applies the configured policy on Windows', async () => {
			const sandbox = { [AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.On };
			const { session, mockSession } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: sandbox },
				platform: 'win32',
			});

			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual(mockSession.sandboxConfigUpdates.at(-1), buildSandboxConfigForSdk('win32', sandbox));
		});

		test('per-request sandbox: explicitly disabled when the sandbox setting is off', async () => {
			const { session, mockSession } = await createAgentSession(disposables);

			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual(mockSession.sandboxConfigUpdates.at(-1), { enabled: false });
		});

		test('per-request sandbox: left untouched when the custom terminal tool is enabled', async () => {
			const { session, mockSession } = await createAgentSession(disposables, {
				rootValues: {
					[AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On },
					[CopilotCliConfigKey.EnableCustomTerminalTool]: true,
				},
			});

			await session.send('hello', undefined, 'turn-1');

			// The host's own terminal sandbox engine handles containment, so the
			// SDK sandbox config is not managed in this mode.
			assert.deepStrictEqual(mockSession.sandboxConfigUpdates, []);
		});

		test('pending permissions are denied on dispose', async () => {
			const { session, runtime } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'write',
				toolCallId: 'tc-4',
			});

			session.dispose();
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'reject');
		});

		test('late permission requests are rejected after dispose', async () => {
			const { session, runtime } = await createAgentSession(disposables);
			session.dispose();

			assert.deepStrictEqual(await runtime.handlePermissionRequest({
				kind: 'write',
				toolCallId: 'tc-after-dispose',
			}), { kind: 'reject' });
		});

		test('pending permissions are denied on abort', async () => {
			const { session, runtime } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'write',
				toolCallId: 'tc-5',
			});

			await session.abort();
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'reject');
		});

		test('interactive callbacks are cancelled while abort is in progress', async () => {
			const { session, runtime, mockSession } = await createAgentSession(disposables);
			session.resetTurnState('turn-aborting');
			const pendingUserInput = runtime.handleUserInputRequest(
				{ question: 'Existing question' },
				{ sessionId: 'test-session-1' },
			);
			const pendingElicitation = runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Existing elicitation',
				mode: 'form',
				requestedSchema: { type: 'object', properties: {} },
			});
			const abortGate = new DeferredPromise<void>();
			mockSession.abortGate = abortGate.p;

			const abortPromise = session.abort();
			assert.strictEqual(mockSession.abortCalls, 1);

			const permission = await runtime.handlePermissionRequest({
				kind: 'write',
				toolCallId: 'tc-during-abort',
			});
			const userInput = await runtime.handleUserInputRequest(
				{ question: 'New question' },
				{ sessionId: 'test-session-1' },
			);
			const elicitation = await runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'New elicitation',
				mode: 'form',
				requestedSchema: { type: 'object', properties: {} },
			});
			const planReview = await runtime.handleExitPlanModeRequest({
				actions: ['interactive'],
				recommendedAction: 'interactive',
				summary: 'Plan',
			}, { sessionId: 'test-session-1' });
			const mcpAuth = await runtime.handleMcpAuthRequest({
				requestId: 'auth-during-abort',
				serverName: 'test-server',
				serverUrl: 'https://mcp.example.com',
				reason: 'initial',
			}, { sessionId: 'test-session-1' });

			abortGate.complete();
			await abortPromise;
			assert.deepStrictEqual({
				pendingUserInput: await pendingUserInput,
				pendingElicitation: await pendingElicitation,
				permission,
				userInput,
				elicitation,
				planReview,
				mcpAuth,
			}, {
				pendingUserInput: { answer: '', wasFreeform: true },
				pendingElicitation: { action: 'cancel' },
				permission: { kind: 'reject' },
				userInput: { answer: '', wasFreeform: true },
				elicitation: { action: 'cancel' },
				planReview: { approved: false },
				mcpAuth: { kind: 'cancelled' },
			});
		});

		test('respondToPermissionRequest returns false for unknown id', async () => {
			const { session } = await createAgentSession(disposables);
			assert.strictEqual(session.respondToPermissionRequest('unknown-id', true), false);
		});

		test('rejects permission requests for unroutable subagent tools', async () => {
			const logService = new CapturingLogService();
			const { runtime, mockSession, signals } = await createAgentSession(disposables, { logService });
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-orphaned-subagent-tool',
				toolName: 'powershell',
				arguments: { command: 'echo test' },
			} as SessionEventPayload<'tool.execution_start'>['data'], { agentId: 'unknown-agent' });

			const result = await runtime.handlePermissionRequest({
				kind: 'shell',
				toolCallId: 'tc-orphaned-subagent-tool',
				fullCommandText: 'echo test',
			});

			assert.deepStrictEqual({
				result,
				pendingConfirmations: signals.filter(signal => signal.kind === 'pending_confirmation').length,
				errors: logService.errors.map(entry => entry.first).filter(message => typeof message === 'string' && message.includes('unroutable subagent tool call')),
			}, {
				result: { kind: 'reject' },
				pendingConfirmations: 0,
				errors: ['[Copilot:test-session-1] Rejecting permission request for unroutable subagent tool call: toolCallId=tc-orphaned-subagent-tool, kind=shell'],
			});
		});
	});

	// ---- peer chat configuration scope --------------------------------------
	// A peer chat's `resource` (its exact persistence/storage scope) differs
	// from `sessionUri` (the shared owning/configuration scope). These tests
	// prove config reads, permission/auto-approve resolution, and session
	// config change notifications resolve through the owning session — so a
	// peer chat observes the same effective config as the session's initial
	// chat — while `resource` still governs its own storage.
	suite('peer chat configuration scope', () => {

		const parentSessionUri = AgentSession.uri('copilot', 'test-session-1');
		const peerChatUri = URI.parse(buildChatUri(parentSessionUri, 'peer-1'));

		test('peer chat observes mode identically to the initial chat', async () => {
			const configValues = { [SessionConfigKey.Mode]: 'autopilot' };
			const question = { question: 'Pick a color', choices: ['red', 'blue', 'green'] };

			const { runtime: initialRuntime } = await createAgentSession(disposables, { configValues });
			const { runtime: peerRuntime } = await createAgentSession(disposables, {
				sessionUri: parentSessionUri,
				chatChannelUri: peerChatUri,
				resource: peerChatUri,
				configValues,
			});

			const initialResult = await initialRuntime.handleUserInputRequest(question, { sessionId: 'test-session-1' });
			const peerResult = await peerRuntime.handleUserInputRequest(question, { sessionId: 'test-session-1' });

			assert.deepStrictEqual(peerResult, initialResult);
			assert.strictEqual(peerResult.answer, 'The user is not available to answer your question. Choose a pragmatic option best aligned with the context of the request.');
		});

		test('peer chat observes auto-approve/permissions identically to the initial chat', async () => {
			const sandbox = { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On };
			const options = {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: sandbox },
				configValues: {
					[SessionConfigKey.Mode]: 'autopilot',
					[SessionConfigKey.AutoApprove]: 'default',
				},
			};

			const { session: initialSession, mockSession: initialMockSession } = await createAgentSession(disposables, options);
			await initialSession.send('hello', undefined, 'turn-1');

			const { session: peerSession, mockSession: peerMockSession } = await createAgentSession(disposables, {
				...options,
				sessionUri: parentSessionUri,
				chatChannelUri: peerChatUri,
				resource: peerChatUri,
			});
			await peerSession.send('hello', undefined, 'turn-1');

			const summarize = (mockSession: MockCopilotSession) => ({
				permissionModes: mockSession.permissionModeSetCalls,
				sandbox: mockSession.sandboxConfigUpdates.at(-1),
			});
			assert.deepStrictEqual(summarize(peerMockSession), summarize(initialMockSession));
			assert.deepStrictEqual(summarize(peerMockSession), {
				permissionModes: ['manual'],
				sandbox: buildSandboxConfigForSdk('linux', sandbox),
			});
		});

		test('peer chat observes session config changes identically to the initial chat', async () => {
			const configValues = { [SessionConfigKey.AutoApprove]: 'assisted' };

			const { session: initialSession, mockSession: initialMockSession, setConfigValue: setInitialConfigValue, fireSessionConfigChange: fireInitialSessionConfigChange } = await createAgentSession(disposables, { configValues: { ...configValues } });
			await initialSession.syncPermissionMode('turn-start');
			initialSession.resetTurnState('active-turn');
			setInitialConfigValue(SessionConfigKey.AutoApprove, 'default');
			fireInitialSessionConfigChange({ [SessionConfigKey.AutoApprove]: 'default' });
			await timeout(0);

			const { session: peerSession, mockSession: peerMockSession, setConfigValue: setPeerConfigValue, fireSessionConfigChange: firePeerSessionConfigChange } = await createAgentSession(disposables, {
				sessionUri: parentSessionUri,
				chatChannelUri: peerChatUri,
				resource: peerChatUri,
				configValues: { ...configValues },
			});
			await peerSession.syncPermissionMode('turn-start');
			peerSession.resetTurnState('active-turn');
			setPeerConfigValue(SessionConfigKey.AutoApprove, 'default');
			// Config changes are always emitted keyed by the owning session URI
			// (the default here), never by this peer chat's own `resource`.
			firePeerSessionConfigChange({ [SessionConfigKey.AutoApprove]: 'default' });
			await timeout(0);

			assert.deepStrictEqual(peerMockSession.permissionModeSetCalls, initialMockSession.permissionModeSetCalls);
			assert.deepStrictEqual(peerMockSession.permissionModeSetCalls, ['assisted', 'manual']);
		});

		test('peer chat ignores session config changes scoped to its own chat resource', async () => {
			const { session, mockSession, setConfigValue, fireSessionConfigChange } = await createAgentSession(disposables, {
				sessionUri: parentSessionUri,
				chatChannelUri: peerChatUri,
				resource: peerChatUri,
				configValues: { [SessionConfigKey.AutoApprove]: 'assisted' },
			});
			await session.syncPermissionMode('turn-start');
			setConfigValue(SessionConfigKey.AutoApprove, 'default');

			// A change event keyed by this peer chat's own resource (rather than
			// the owning session) must not be mistaken for the shared config scope.
			fireSessionConfigChange({ [SessionConfigKey.AutoApprove]: 'default' }, peerChatUri.toString());
			await timeout(0);

			assert.deepStrictEqual(mockSession.permissionModeSetCalls, ['assisted']);
		});
	});

	// ---- sendSteering ----

	suite('sendSteering', () => {

		test('forwards attachments to the SDK', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			const imageUri = URI.file('/session/attachments/pasted-image.png');

			await session.sendSteering({
				id: 'steer-1',
				message: {
					text: 'see the screenshot',
					origin: { kind: MessageKind.User },
					attachments: [{
						type: MessageAttachmentKind.Resource,
						uri: imageUri.toString(),
						label: 'Pasted Image',
						displayKind: 'image',
					}],
				},
			});

			assert.deepStrictEqual(mockSession.sendRequests, [{
				prompt: 'see the screenshot',
				attachments: [{
					type: 'file',
					path: imageUri.fsPath,
					displayName: 'Pasted Image',
				}],
				mode: 'immediate',
			}]);
		});

		test('sends a host-created text snapshot in a steering message as a read-only file reference with a <reminder> note (#331154)', async () => {
			const snapshotUri = URI.file('/session/attachments/pasted.txt');
			const { session, mockSession } = await createAgentSession(disposables);

			await session.sendSteering({
				id: 'steer-text',
				message: {
					text: 'use this',
					origin: { kind: MessageKind.User },
					attachments: [{
						type: MessageAttachmentKind.Resource,
						uri: snapshotUri.toString(),
						label: 'Pasted text #1',
						displayKind: 'document',
						_meta: toHostSnapshotAttachmentMeta('text/plain'),
					}],
				},
			});

			// Steering can't use the additionalContext hook, so the read-only note is folded into the
			// steering prompt as a <reminder> block (stripped from the bubble, forwarded to the model);
			// the attachment keeps its plain display name.
			assert.deepStrictEqual(mockSession.sendRequests, [{
				prompt: `use this\n\n<reminder>\n${expectedSnapshotReadonlyNote([snapshotUri.fsPath])}\n</reminder>`,
				attachments: [{
					type: 'file',
					path: snapshotUri.fsPath,
					displayName: 'Pasted text #1',
				}],
				mode: 'immediate',
			}]);
		});

		test('promotes steering to its own turn when the SDK echoes the user message', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });

			// Sending the steering must not flip turns until the SDK has
			// echoed the user message back through the event stream.
			assert.strictEqual(signals.find(s => s.kind === 'action' && (s as IAgentActionSignal).action.type === ActionType.ChatTurnStarted), undefined);

			mockSession.fire('user.message', {
				content: 'focus on tests',
				interactionId: 'interaction-steer',
			} as SessionEventPayload<'user.message'>['data']);

			const actions = signals.filter(s => s.kind === 'action').map(s => (s as IAgentActionSignal).action);
			const turnComplete = actions.find(a => a.type === ActionType.ChatTurnComplete);
			const turnStarted = actions.find(a => a.type === ActionType.ChatTurnStarted);
			assert.ok(turnComplete, 'should complete the in-flight turn before promoting steering');
			assert.strictEqual(turnComplete.turnId, 'turn-original');
			assert.ok(turnStarted, 'should start a new turn for the steering message');
			assert.notStrictEqual(turnStarted.turnId, 'turn-original');
			assert.deepStrictEqual(turnStarted.message, { text: 'focus on tests', origin: { kind: MessageKind.User } });
			assert.strictEqual(turnStarted.queuedMessageId, 'steer-1');
		});

		test('promotes scaffolded steering with attachments to its own turn', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');
			const imageUri = URI.file('/session/attachments/pasted-image.png');

			await session.sendSteering({
				id: 'steer-attachment',
				message: {
					text: 'Inspect the attached screenshot.',
					origin: { kind: MessageKind.User },
					attachments: [{
						type: MessageAttachmentKind.Resource,
						uri: imageUri.toString(),
						label: 'Pasted Image',
						displayKind: 'image',
					}],
				},
			});
			mockSession.fire('user.message', {
				content: `Inspect the attached screenshot.
<attachments>
<attachment id="pasted-image.png">/session/attachments/pasted-image.png</attachment>
</attachments>
<userRequest>
Inspect the attached screenshot.
</userRequest>
<reminder>
Use the attached image as context.
</reminder>`,
				interactionId: 'interaction-steer',
			} as SessionEventPayload<'user.message'>['data']);

			assert.deepStrictEqual(getActions(signals)
				.filter(action => action.type === ActionType.ChatTurnComplete || action.type === ActionType.ChatTurnStarted)
				.map(action => action.type === ActionType.ChatTurnComplete
					? { type: action.type, turnId: action.turnId }
					: { type: action.type, message: action.message, queuedMessageId: action.queuedMessageId }), [
				{ type: ActionType.ChatTurnComplete, turnId: 'turn-original' },
				{
					type: ActionType.ChatTurnStarted,
					message: {
						text: 'Inspect the attached screenshot.',
						origin: { kind: MessageKind.User },
						attachments: [{
							type: MessageAttachmentKind.Resource,
							uri: imageUri.toString(),
							label: 'Pasted Image',
							displayKind: 'image',
						}],
					},
					queuedMessageId: 'steer-attachment',
				},
			]);
		});

		test('promotes steering when the SDK echoes before send resolves', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');
			const sendGate = new DeferredPromise<string>();
			mockSession.send = async request => {
				mockSession.sendRequests.push(request);
				return sendGate.p;
			};

			const steeringPromise = session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			await timeout(0);
			assert.strictEqual(mockSession.sendRequests.length, 1);

			mockSession.fire('user.message', {
				content: 'focus on tests',
				interactionId: 'interaction-steer',
			} as SessionEventPayload<'user.message'>['data']);

			const turnStarted = signals
				.filter(s => s.kind === 'action')
				.map(s => (s as IAgentActionSignal).action)
				.find(a => a.type === ActionType.ChatTurnStarted);
			assert.deepStrictEqual(turnStarted && {
				message: turnStarted.message,
				queuedMessageId: turnStarted.queuedMessageId,
			}, {
				message: { text: 'focus on tests', origin: { kind: MessageKind.User } },
				queuedMessageId: 'steer-1',
			});
			sendGate.complete('message-1');
			await steeringPromise;
		});

		test('promotes steering when the SDK idles before echoing it', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');
			const sendGate = new DeferredPromise<string>();
			mockSession.send = async request => {
				mockSession.sendRequests.push(request);
				return sendGate.p;
			};

			const steeringPromise = session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			await timeout(0);
			assert.strictEqual(mockSession.sendRequests.length, 1);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);
			mockSession.fire('user.message', {
				content: 'focus on tests',
				interactionId: 'interaction-steer',
			} as SessionEventPayload<'user.message'>['data']);

			const actions = signals.filter(s => s.kind === 'action').map(s => (s as IAgentActionSignal).action);
			assert.deepStrictEqual(actions
				.filter(action => action.type === ActionType.ChatTurnComplete || action.type === ActionType.ChatTurnStarted)
				.map(action => action.type === ActionType.ChatTurnComplete
					? { type: action.type, turnId: action.turnId }
					: { type: action.type, message: action.message, queuedMessageId: action.queuedMessageId }), [
				{ type: ActionType.ChatTurnComplete, turnId: 'turn-original' },
				{
					type: ActionType.ChatTurnStarted,
					message: { text: 'focus on tests', origin: { kind: MessageKind.User } },
					queuedMessageId: 'steer-1',
				},
			]);
			sendGate.complete('message-1');
			await steeringPromise;
		});

		test('routes subsequent SDK events into the steering turn', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			mockSession.fire('user.message', {
				content: 'focus on tests',
				interactionId: 'interaction-steer',
			} as SessionEventPayload<'user.message'>['data']);

			const turnStarted = signals
				.filter(s => s.kind === 'action')
				.map(s => (s as IAgentActionSignal).action)
				.find(a => a.type === ActionType.ChatTurnStarted)!;

			mockSession.fire('assistant.message_delta', {
				deltaContent: 'No problem',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			const responseParts = signals
				.filter(s => s.kind === 'action')
				.map(s => (s as IAgentActionSignal).action)
				.filter(a => a.type === ActionType.ChatResponsePart);
			assert.ok(responseParts.length > 0, 'expected delta to allocate a response part');
			assert.strictEqual(responseParts[0].turnId, turnStarted.turnId, 'response part should land in the steering turn, not the original');
		});

		test('reports tool-call details for the turn completed by steering', async () => {
			const telemetryService = new CapturingTelemetryService();
			const { session, mockSession } = await createAgentSession(disposables, {
				telemetryService,
				clientSnapshot: { tools: [{ name: 'grep' }], plugins: [], mcpServers: {} },
			});
			session.resetTurnState('turn-original');
			await session.send('hello agent', undefined, 'turn-original');
			mockSession.fire('user.message', { content: 'hello agent' } as SessionEventPayload<'user.message'>['data']);
			mockSession.fire('assistant.message', {
				messageId: 'msg-tools',
				content: '',
				model: 'gpt-x',
				toolRequests: [{ toolCallId: 'tc-1', name: 'grep', arguments: {} }],
			} as SessionEventPayload<'assistant.message'>['data']);

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			mockSession.fire('user.message', {
				content: 'focus on tests',
				interactionId: 'interaction-steer',
			} as SessionEventPayload<'user.message'>['data']);

			assert.deepStrictEqual(telemetryService.events
				.filter(event => event.eventName === 'toolCallDetails')
				.map(event => {
					const data = event.data as Record<string, unknown>;
					return {
						requestId: data.requestId,
						responseType: data.responseType,
						toolCounts: data.toolCounts,
						model: data.model,
						numRequests: data.numRequests,
						messageCharLen: data.messageCharLen,
						totalToolCalls: data.totalToolCalls,
					};
				}), [{
					requestId: 'turn-original',
					responseType: 'success',
					toolCounts: JSON.stringify({ grep: 1 }),
					model: 'gpt-x',
					numRequests: 1,
					messageCharLen: 11,
					totalToolCalls: 1,
				}]);
		});

		test('does not flip turns for SDK-injected user messages (non-user source)', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });

			// SDK injects an unrelated user.message (e.g. skill content)
			// with the steering's exact text but a non-'user' source.
			// Even if the text happened to match, the synthetic-source
			// guard MUST skip the flip.
			mockSession.fire('user.message', {
				content: 'focus on tests',
				source: 'skill-pdf',
			} as SessionEventPayload<'user.message'>['data']);

			const turnStarted = signals.find(s => s.kind === 'action' && (s as IAgentActionSignal).action.type === ActionType.ChatTurnStarted);
			assert.strictEqual(turnStarted, undefined, 'synthetic user messages should not promote steering to a turn');
		});

		test('does not flip turns for subagent user messages', async () => {
			const sessionDatabase = new TestSessionDatabase();
			const { session, mockSession, signals } = await createAgentSession(disposables, { sessionDatabase });
			session.resetTurnState('turn-original');

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			mockSession.fire('user.message', {
				content: 'focus on tests',
			} as SessionEventPayload<'user.message'>['data'], { agentId: 'agent-1', id: 'evt-subagent' });
			await timeout(0);

			const turnStarted = signals.find(s => s.kind === 'action' && (s as IAgentActionSignal).action.type === ActionType.ChatTurnStarted);
			assert.deepStrictEqual({
				turnStarted,
				setTurnEventIdCalls: sessionDatabase.setTurnEventIdCalls,
			}, {
				turnStarted: undefined,
				setTurnEventIdCalls: [],
			});
		});

		test('does not flip turns when the user.message content does not match', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			mockSession.fire('user.message', {
				content: 'something completely different',
			} as SessionEventPayload<'user.message'>['data']);

			const turnStarted = signals.find(s => s.kind === 'action' && (s as IAgentActionSignal).action.type === ActionType.ChatTurnStarted);
			assert.strictEqual(turnStarted, undefined, 'unrelated user messages should not consume the pending steering');
		});

		test('does not send the same steering message again before it is flipped', async () => {
			const { session, mockSession } = await createAgentSession(disposables);

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });

			assert.strictEqual(mockSession.sendRequests.length, 1);
		});

		test('fires steering_consumed on abort when the steering never reached its turn', async () => {
			const { session, signals } = await createAgentSession(disposables);

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			await session.abort();

			const consumed = signals.find(s => s.kind === 'steering_consumed');
			assert.ok(consumed, 'abort should clean up pending steering UI state');
			assert.strictEqual((consumed as { id: string }).id, 'steer-1');
		});

		test('an abort during a steering turn tears it down without completing it', async () => {
			// A steering turn is promoted mid-loop while the SDK is actively
			// producing its response, so it must be `running` (not `pending`).
			// Otherwise an abort's terminal idle would treat it as a not-yet-
			// started queued turn and leave it open, and a later idle would
			// orphan-complete it.
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-0' } as SessionEventPayload<'assistant.turn_start'>['data']);

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			mockSession.fire('user.message', {
				content: 'focus on tests',
				interactionId: 'interaction-steer',
			} as SessionEventPayload<'user.message'>['data']);

			const steeringTurnId = getActions(signals).find(a => a.type === ActionType.ChatTurnStarted)?.turnId;
			assert.ok(steeringTurnId && steeringTurnId !== 'turn-original', 'steering should start its own turn');

			// Abort: the running steering turn is finalized by the client's
			// ChatTurnCancelled, so its terminal idle must tear it down rather
			// than complete it — and a subsequent stray idle must find no turn.
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			const steeringCompletions = getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete && a.turnId === steeringTurnId);
			assert.strictEqual(steeringCompletions.length, 0, 'an aborted steering turn must not be completed');
		});

		test('does not signal cleanup when send fails', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);

			mockSession.send = async () => { throw new Error('send failed'); };

			await session.sendSteering({ id: 'steer-fail', message: { text: 'will fail', origin: { kind: MessageKind.User } } });

			const consumed = signals.find(s => s.kind === 'steering_consumed');
			const turnStarted = signals.find(s => s.kind === 'action' && (s as IAgentActionSignal).action.type === ActionType.ChatTurnStarted);
			assert.strictEqual(consumed, undefined, 'should not fire steering_consumed on failure');
			assert.strictEqual(turnStarted, undefined, 'should not start a new turn on failure');
		});
	});

	suite('failed turn resume', () => {

		test('the development $error path uses raw sendMessages even with attachments', async () => {
			const { session, mockSession } = await createAgentSession(disposables);

			await session.send('$error', [{
				type: MessageAttachmentKind.Simple,
				label: 'context',
				modelRepresentation: 'attached context',
			}], 'turn-error');

			assert.deepStrictEqual({
				sendRequests: mockSession.sendRequests,
				sendMessagesRequests: mockSession.sendMessagesRequests,
			}, {
				sendRequests: [],
				sendMessagesRequests: [{
					messages: [{ prompt: '$error' }],
					requestHeaders: { Authorization: '******' },
				}],
			});
		});

		test('the development $error-ui path emits an error even with attachments', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);

			await session.send('$error-ui', [{
				type: MessageAttachmentKind.Simple,
				label: 'context',
				modelRepresentation: 'attached context',
			}], 'turn-error');

			assert.deepStrictEqual({
				sendRequests: mockSession.sendRequests,
				sendMessagesRequests: mockSession.sendMessagesRequests,
				actions: getActions(signals).map(action => action.type === ActionType.ChatError ? { ...action, duration: 0 } : action),
			}, {
				sendRequests: [],
				sendMessagesRequests: [],
				actions: [{
					type: ActionType.ChatError,
					turnId: 'turn-error',
					duration: 0,
					part: {
						kind: ResponsePartKind.Error,
						error: {
							errorType: 'developmentRecoverableError',
							message: 'Injected recoverable development error (1/1).',
						},
					},
				}],
			});
		});

		test('the development $error-ui path can repeat failures before succeeding in the same turn', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);

			await session.send('$error-ui:2', undefined, 'turn-error');
			await session.resume('turn-error');
			await session.resume('turn-error');

			assert.deepStrictEqual({
				sendRequests: mockSession.sendRequests,
				sendMessagesRequests: mockSession.sendMessagesRequests,
				actions: getActions(signals).map(action => ({
					type: action.type,
					turnId: action.type === ActionType.ChatError || action.type === ActionType.ChatResponsePart || action.type === ActionType.ChatTurnComplete ? action.turnId : undefined,
					error: action.type === ActionType.ChatError ? action.part.error.message : undefined,
					content: action.type === ActionType.ChatResponsePart && action.part.kind === ResponsePartKind.Markdown ? action.part.content : undefined,
				})),
			}, {
				sendRequests: [],
				sendMessagesRequests: [],
				actions: [
					{ type: ActionType.ChatError, turnId: 'turn-error', error: 'Injected recoverable development error (1/2).', content: undefined },
					{ type: ActionType.ChatError, turnId: 'turn-error', error: 'Injected recoverable development error (2/2).', content: undefined },
					{ type: ActionType.ChatResponsePart, turnId: 'turn-error', error: undefined, content: 'Recovered after 2 injected failure(s).' },
					{ type: ActionType.ChatTurnComplete, turnId: 'turn-error', error: undefined, content: undefined },
				],
			});
		});

		test('the development $error-ui-tool path preserves a completed tool call across failure and resume', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);

			await session.send('$error-ui-tool', undefined, 'turn-error');
			await session.resume('turn-error');

			assert.deepStrictEqual({
				sendRequests: mockSession.sendRequests,
				sendMessagesRequests: mockSession.sendMessagesRequests,
				actions: getActions(signals).map(action => ({
					type: action.type,
					toolCallId: action.type === ActionType.ChatToolCallStart || action.type === ActionType.ChatToolCallReady || action.type === ActionType.ChatToolCallComplete ? action.toolCallId : undefined,
					error: action.type === ActionType.ChatError ? action.part.error.message : undefined,
					content: action.type === ActionType.ChatResponsePart && action.part.kind === ResponsePartKind.Markdown ? action.part.content : undefined,
				})),
			}, {
				sendRequests: [],
				sendMessagesRequests: [],
				actions: [
					{ type: ActionType.ChatToolCallStart, toolCallId: 'turn-error-development-tool', error: undefined, content: undefined },
					{ type: ActionType.ChatToolCallReady, toolCallId: 'turn-error-development-tool', error: undefined, content: undefined },
					{ type: ActionType.ChatToolCallComplete, toolCallId: 'turn-error-development-tool', error: undefined, content: undefined },
					{ type: ActionType.ChatError, toolCallId: undefined, error: 'Injected recoverable development error (1/1).', content: undefined },
					{ type: ActionType.ChatResponsePart, toolCallId: undefined, error: undefined, content: 'Recovered after 1 injected failure(s).' },
					{ type: ActionType.ChatTurnComplete, toolCallId: undefined, error: undefined, content: undefined },
				],
			});
		});

		test('development error helpers can be disabled for product builds', async () => {
			const disabled = await createAgentSession(disposables, { enableDevelopmentErrorInjection: false });

			await disabled.session.send('$error-ui-tool', undefined, 'turn-error');

			assert.deepStrictEqual({
				actions: getActions(disabled.signals),
				sendRequests: disabled.mockSession.sendRequests,
				sendMessagesRequests: disabled.mockSession.sendMessagesRequests,
			}, {
				actions: [],
				sendRequests: [{ prompt: '$error-ui-tool', attachments: undefined }],
				sendMessagesRequests: [],
			});
		});

		test('resumes the same turn with zero SDK messages', async () => {
			const { session, mockSession } = await createAgentSession(disposables);

			await session.resume('turn-1', 'plan', 'client-1');

			assert.deepStrictEqual({
				sendRequests: mockSession.sendRequests,
				sendMessagesRequests: mockSession.sendMessagesRequests,
				modeSetCalls: mockSession.modeSetCalls,
			}, {
				sendRequests: [],
				sendMessagesRequests: [{ messages: [] }],
				modeSetCalls: [{ mode: 'plan' }],
			});
		});

		test('clears the active turn when the continuation connection closes', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			mockSession.sendMessagesError = new Error('Connection closed during continuation');

			await assert.rejects(() => session.resume('turn-1'), /Connection closed/);

			assert.deepStrictEqual({
				active: session.hasActiveTurn,
				sendMessagesRequests: mockSession.sendMessagesRequests,
			}, {
				active: false,
				sendMessagesRequests: [{ messages: [] }],
			});
		});

		for (const timing of ['before', 'after'] as const) {
			test(`ignores a stale idle ${timing} zero-message continuation resolves`, async () => {
				const gate = new DeferredPromise<void>();
				const { session, mockSession, signals } = await createAgentSession(disposables);
				if (timing === 'before') {
					mockSession.sendMessagesGate = gate.p;
				}

				const resumePromise = session.resume('turn-1');
				await timeout(0);
				if (timing === 'before') {
					mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);
					gate.complete();
				}
				await resumePromise;
				if (timing === 'after') {
					mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);
				}
				const beforeProviderStart = {
					active: session.hasActiveTurn,
					terminalActions: getActions(signals).filter(action => action.type === ActionType.ChatTurnComplete || action.type === ActionType.ChatError),
				};

				mockSession.fire('assistant.turn_start', { turnId: 'sdk-turn-2' } as SessionEventPayload<'assistant.turn_start'>['data']);
				mockSession.fire('assistant.message', {
					messageId: 'm2',
					content: 'Recovered response',
					toolRequests: [],
				} as SessionEventPayload<'assistant.message'>['data']);
				mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

				assert.deepStrictEqual({
					beforeProviderStart,
					active: session.hasActiveTurn,
					actions: getActions(signals).filter(action => action.type === ActionType.ChatResponsePart || action.type === ActionType.ChatTurnComplete).map(action => action.type),
				}, {
					beforeProviderStart: { active: true, terminalActions: [] },
					active: false,
					actions: [ActionType.ChatResponsePart, ActionType.ChatTurnComplete],
				});
			});
		}

		test('cancellation before the provider turn starts clears the resumed turn', async () => {
			const abortGate = new DeferredPromise<void>();
			const { session, mockSession, signals } = await createAgentSession(disposables);
			await session.resume('turn-1');
			mockSession.abortGate = abortGate.p;

			const abortPromise = session.abort();
			await timeout(0);
			mockSession.fire('abort', { reason: 'user_abort' } as SessionEventPayload<'abort'>['data']);
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);
			const activeAfterIdle = session.hasActiveTurn;
			abortGate.complete();
			await abortPromise;

			assert.deepStrictEqual({
				active: session.hasActiveTurn,
				activeAfterIdle,
				abortCalls: mockSession.abortCalls,
				actions: getActions(signals),
			}, {
				active: false,
				activeAfterIdle: false,
				abortCalls: 1,
				actions: [],
			});
		});

		test('cancellation after provider start but before content clears without completing', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			await session.resume('turn-1');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-turn-2' } as SessionEventPayload<'assistant.turn_start'>['data']);

			await session.abort();
			mockSession.fire('abort', { reason: 'user_abort' } as SessionEventPayload<'abort'>['data']);
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);

			assert.deepStrictEqual({
				active: session.hasActiveTurn,
				actions: getActions(signals),
			}, {
				active: false,
				actions: [],
			});
		});

		test('quarantines late cancelled events until the next provider turn starts', async () => {
			const abortGate = new DeferredPromise<void>();
			const logService = new CapturingLogService();
			const { session, mockSession, signals } = await createAgentSession(disposables, { logService });
			await session.resume('turn-1');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-turn-2' } as SessionEventPayload<'assistant.turn_start'>['data']);
			mockSession.abortGate = abortGate.p;
			const abortPromise = session.abort();
			await timeout(0);

			mockSession.fire('assistant.message_delta', {
				deltaContent: 'Late response delta before idle',
			} as SessionEventPayload<'assistant.message_delta'>['data']);
			mockSession.fire('assistant.message', {
				messageId: 'late-message-before-idle',
				content: 'Late response before idle',
				toolRequests: [],
			} as SessionEventPayload<'assistant.message'>['data']);
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);
			abortGate.complete();
			await abortPromise;
			const fireLateTurnEvents = (suffix: string) => {
				mockSession.fire('assistant.message', {
					messageId: `late-message-${suffix}`,
					content: `Late response ${suffix}`,
					toolRequests: [],
				} as SessionEventPayload<'assistant.message'>['data']);
				mockSession.fire('assistant.tool_call_delta', {
					toolCallId: `late-tool-${suffix}`,
					toolName: 'bash',
					inputDelta: '{"command":"echo late"}',
				});
				mockSession.fire('tool.execution_start', {
					toolCallId: `late-tool-${suffix}`,
					toolName: 'bash',
					arguments: { command: 'echo late' },
				} as SessionEventPayload<'tool.execution_start'>['data']);
				mockSession.fire('session.error', {
					errorType: 'LateError',
					message: `Late error ${suffix}`,
				} as SessionEventPayload<'session.error'>['data']);
				mockSession.fire('subagent.started', {
					toolCallId: `late-subagent-${suffix}`,
					agentName: 'late-agent',
					agentDisplayName: 'Late Agent',
					agentDescription: 'Late cancelled subagent',
				} as SessionEventPayload<'subagent.started'>['data'], { agentId: `late-agent-${suffix}` });
			};
			fireLateTurnEvents('after-idle');
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			session.resetTurnState('turn-2');
			fireLateTurnEvents('after-next-turn-reset');
			const beforeProviderStart = {
				active: session.hasActiveTurn,
				actions: getActions(signals),
			};

			mockSession.fire('assistant.turn_start', { turnId: 'sdk-turn-3' } as SessionEventPayload<'assistant.turn_start'>['data']);
			mockSession.fire('assistant.message', {
				messageId: 'valid-message',
				content: 'Valid next response',
				toolRequests: [],
			} as SessionEventPayload<'assistant.message'>['data']);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.deepStrictEqual({
				beforeProviderStart,
				activeAfterCompletion: session.hasActiveTurn,
				actionsAfterCompletion: getActions(signals).map(action => action.type),
				subagentSignals: signals.filter(signal => signal.kind === 'subagent_started' || signal.kind === 'subagent_resumed'),
				droppedResponseLogged: logService.errors.some(error => /after cancellation/i.test(String(error.first))),
			}, {
				beforeProviderStart: { active: true, actions: [] },
				activeAfterCompletion: false,
				actionsAfterCompletion: [ActionType.ChatResponsePart, ActionType.ChatTurnComplete],
				subagentSignals: [],
				droppedResponseLogged: true,
			});
		});

		test('inline commands complete while cancelled provider events remain quarantined', async () => {
			const logService = new CapturingLogService();
			const { session, mockSession, signals } = await createAgentSession(disposables, { logService });
			await session.resume('turn-1');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-turn-2' } as SessionEventPayload<'assistant.turn_start'>['data']);
			await session.abort();
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);

			await session.send('/compact', undefined, 'turn-compact-after-cancel');
			mockSession.fire('assistant.message', {
				messageId: 'late-cancelled-message',
				content: 'Late cancelled response',
				toolRequests: [],
			} as SessionEventPayload<'assistant.message'>['data']);

			assert.deepStrictEqual({
				active: session.hasActiveTurn,
				actions: getActions(signals).map(action => action.type),
				droppedResponseLogged: logService.errors.some(error => /after cancellation/i.test(String(error.first))),
			}, {
				active: false,
				actions: [ActionType.ChatResponsePart, ActionType.ChatTurnComplete],
				droppedResponseLogged: true,
			});
		});

		test('turn-starting system notifications establish a trusted post-cancellation boundary', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			await session.resume('turn-1');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-turn-2' } as SessionEventPayload<'assistant.turn_start'>['data']);
			await session.abort();
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);

			mockSession.fire('system.notification', {
				content: '<system_notification>\nAgent "agent-a" has finished processing and is now idle.\n</system_notification>',
				kind: { type: 'agent_idle', agentId: 'agent-a', agentType: 'general-purpose', description: 'Investigate the issue' },
			} as SessionEventPayload<'system.notification'>['data']);
			mockSession.fire('assistant.message_delta', {
				deltaContent: 'Reading the background agent result now.',
			} as SessionEventPayload<'assistant.message_delta'>['data']);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.deepStrictEqual({
				active: session.hasActiveTurn,
				actions: getActions(signals).map(action => action.type),
			}, {
				active: false,
				actions: [ActionType.ChatTurnStarted, ActionType.ChatResponsePart, ActionType.ChatTurnComplete],
			});
		});

		test('a root user-message echo establishes the boundary for a no-op replacement turn', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			await session.resume('turn-1');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-turn-2' } as SessionEventPayload<'assistant.turn_start'>['data']);
			await session.abort();
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);

			await session.send('next request', undefined, 'turn-2');
			mockSession.fire('user.message', {
				content: 'next request',
				interactionId: 'interaction-turn-2',
				source: 'user',
			} as SessionEventPayload<'user.message'>['data']);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.deepStrictEqual({
				active: session.hasActiveTurn,
				actions: getActions(signals).map(action => action.type),
			}, {
				active: false,
				actions: [ActionType.ChatTurnComplete],
			});
		});
	});

	// ---- system.notification ----

	suite('system.notification', () => {

		test('translator handles every notification kind and ignores empty content', () => {
			const base: Omit<SessionEventPayload<'system.notification'>, 'data'> = {
				id: 'evt-system',
				parentId: null,
				timestamp: new Date().toISOString(),
				type: 'system.notification' as const,
			};

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: '<system_notification>\nShell done\n</system_notification>',
					kind: { type: 'shell_completed', shellId: 'shell-a', exitCode: 0, description: 'sleep 6' },
				},
			}), {
				messageText: '`sleep 6` completed',
				startsTurn: true,
			});

			const shellNotificationWithoutDescription = buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Shell done',
					kind: { type: 'shell_completed', shellId: 'shell-a', exitCode: 0 },
				},
			});
			assert.ok(shellNotificationWithoutDescription);
			assert.deepStrictEqual(shellNotificationWithoutDescription, {
				messageText: 'Shell completed',
				startsTurn: true,
			});
			assert.ok(!shellNotificationWithoutDescription.messageText.includes('shell-a'));

			const detachedShellNotification = buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Detached done',
					kind: { type: 'shell_detached_completed', shellId: 'detached-a' },
				},
			});
			assert.ok(detachedShellNotification);
			assert.deepStrictEqual(detachedShellNotification, {
				messageText: 'Shell completed',
				startsTurn: true,
			});
			assert.ok(!detachedShellNotification.messageText.includes('detached-a'));

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Agent done',
					kind: { type: 'agent_completed', agentId: 'agent-a', agentType: 'task', status: 'completed' },
				},
			}), {
				messageText: 'Background agent agent-a completed',
				startsTurn: true,
			});

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Agent failed',
					kind: { type: 'agent_completed', agentId: 'agent-b', agentType: 'task', status: 'failed' },
				},
			}), {
				messageText: 'Background agent agent-b failed',
				startsTurn: true,
			});

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: '<system_notification>\nAgent idle\n</system_notification>',
					kind: { type: 'agent_idle', agentId: 'agent-a', agentType: 'task' },
				},
			}), {
				messageText: 'Background agent agent-a is complete',
				startsTurn: true,
			});

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Inbox message',
					kind: { type: 'new_inbox_message', entryId: 'entry-a', senderName: 'sidekick', senderType: 'sidekick-agent', summary: 'New message' },
				},
			}), {
				messageText: 'New inbox message from sidekick',
				startsTurn: false,
			});

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Discovered instruction',
					kind: { type: 'instruction_discovered', sourcePath: 'packages/billing/AGENTS.md', triggerFile: 'packages/billing/src/index.ts', triggerTool: 'view', description: 'AGENTS.md from packages/billing/' },
				},
			}), {
				messageText: 'Instruction discovered: AGENTS.md from packages/billing/',
				startsTurn: false,
			});

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: '<system_notification>\nExternal host ping\n</system_notification>',
					kind: { type: 'unclassified', metadata: { source: 'host' } },
				},
			}), {
				messageText: 'External host ping',
				startsTurn: true,
			});

			assert.strictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: '   ',
					kind: { type: 'agent_idle', agentId: 'agent-a', agentType: 'task' },
				},
			}), undefined);
		});

		test('idle notification starts a system-initiated turn without sending another SDK message', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('system.notification', {
				content: '<system_notification>\nShell command completed\n</system_notification>',
				kind: { type: 'shell_completed', shellId: 'shell-a', exitCode: 0, description: 'sleep 6' },
			} as SessionEventPayload<'system.notification'>['data']);

			assert.strictEqual(mockSession.sendRequests.length, 0, 'system notification should not call session.send');
			const actions = getActions(signals);
			const turnStarted = actions.find(a => a.type === ActionType.ChatTurnStarted);
			assert.ok(turnStarted, 'should synthesize a fresh turn');
			assert.deepStrictEqual(turnStarted.message, { text: '`sleep 6` completed', origin: { kind: MessageKind.SystemNotification } });
		});

		test('agent idle notification routes resumed SDK events into a generated system turn', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('system.notification', {
				content: '<system_notification>\nAgent "agent-a" has finished processing and is now idle.\n</system_notification>',
				kind: { type: 'agent_idle', agentId: 'agent-a', agentType: 'general-purpose', description: 'Investigate the issue' },
			} as SessionEventPayload<'system.notification'>['data']);
			const turnStarted = getActions(signals).find(a => a.type === ActionType.ChatTurnStarted)!;

			mockSession.fire('assistant.message_delta', {
				deltaContent: 'Reading the background agent result now.',
			} as SessionEventPayload<'assistant.message_delta'>['data']);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.deepStrictEqual({
				message: turnStarted.message,
				responseTurnId: (getActions(signals).find(a => a.type === ActionType.ChatResponsePart && a.part.kind === ResponsePartKind.Markdown) as ChatResponsePartAction | undefined)?.turnId,
				completedTurnId: (getActions(signals).find(a => a.type === ActionType.ChatTurnComplete) as ChatTurnCompleteAction | undefined)?.turnId,
			}, {
				message: { text: 'Background agent agent-a is complete', origin: { kind: MessageKind.SystemNotification } },
				responseTurnId: turnStarted.turnId,
				completedTurnId: turnStarted.turnId,
			});
		});

		test('agent idle notification during an active turn appends a SystemNotification response part', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-active');

			mockSession.fire('system.notification', {
				content: 'Agent "agent-a" has finished processing and is now idle.',
				kind: { type: 'agent_idle', agentId: 'agent-a', agentType: 'general-purpose' },
			} as SessionEventPayload<'system.notification'>['data']);

			const actions = getActions(signals);
			const systemPart = actions.find(a => a.type === ActionType.ChatResponsePart && a.part.kind === ResponsePartKind.SystemNotification) as ChatResponsePartAction | undefined;
			assert.deepStrictEqual({
				turnStarted: actions.find(a => a.type === ActionType.ChatTurnStarted),
				turnId: systemPart?.turnId,
				part: systemPart?.part,
			}, {
				turnStarted: undefined,
				turnId: 'turn-active',
				part: {
					kind: ResponsePartKind.SystemNotification,
					content: 'Background agent agent-a is complete',
				},
			});
		});

		test('passive notifications render only within an active turn', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('system.notification', {
				content: 'Inbox from sidekick',
				kind: { type: 'new_inbox_message', entryId: 'entry-a', senderName: 'sidekick', senderType: 'sidekick-agent', summary: 'New message' },
			} as SessionEventPayload<'system.notification'>['data']);
			assert.deepStrictEqual(getActions(signals), []);

			session.resetTurnState('turn-active');
			mockSession.fire('system.notification', {
				content: 'Inbox from sidekick',
				kind: { type: 'new_inbox_message', entryId: 'entry-a', senderName: 'sidekick', senderType: 'sidekick-agent', summary: 'New message' },
			} as SessionEventPayload<'system.notification'>['data']);
			mockSession.fire('system.notification', {
				content: 'Discovered instruction',
				kind: { type: 'instruction_discovered', sourcePath: 'packages/billing/AGENTS.md', triggerFile: 'packages/billing/src/index.ts', triggerTool: 'view', description: 'AGENTS.md from packages/billing/' },
			} as SessionEventPayload<'system.notification'>['data']);

			assert.deepStrictEqual(getActions(signals)
				.filter(action => action.type === ActionType.ChatResponsePart)
				.map(action => action.part), [
				{ kind: ResponsePartKind.SystemNotification, content: 'New inbox message from sidekick' },
				{ kind: ResponsePartKind.SystemNotification, content: 'Instruction discovered: AGENTS.md from packages/billing/' },
			]);
		});

		test('generated system turn completes on session.idle', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('system.notification', {
				content: 'Shell command completed',
				kind: { type: 'shell_completed', shellId: 'shell-a', exitCode: 0, description: 'sleep 6' },
			} as SessionEventPayload<'system.notification'>['data']);
			const turnStarted = getActions(signals).find(a => a.type === ActionType.ChatTurnStarted)!;

			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			const turnComplete = getActions(signals).find(a => a.type === ActionType.ChatTurnComplete);
			assert.ok(turnComplete, 'expected idle to complete the generated turn');
			assert.strictEqual((turnComplete as { turnId: string }).turnId, turnStarted.turnId);
		});

		test('a late event after a completed turn is dropped and logged (never targets the stale turn id)', async () => {
			const logService = new CapturingLogService();
			const { session, mockSession, signals } = await createAgentSession(disposables, { logService });
			session.resetTurnState('turn-old');

			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);
			mockSession.fire('assistant.message_delta', {
				deltaContent: 'late text',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			// With no active turn, the late delta is dropped (not emitted even as a
			// no-op), so it can never be attributed to the stale 'turn-old', and the
			// unexpected state is surfaced via an error log.
			const markdownActions = getActions(signals)
				.filter(a => a.type === ActionType.ChatResponsePart && a.part.kind === ResponsePartKind.Markdown);
			assert.strictEqual(markdownActions.length, 0, 'the late delta must be dropped, not emitted');
			assert.ok(logService.errors.some(e => /no active turn/i.test(String(e.first))), 'the dropped delta should be logged');
		});
	});

	// ---- event mapping ----

	suite('event mapping', () => {

		test('sampling requests are rejected when no sampling provider is available', async () => {
			const { mockSession, session } = await createAgentSession(disposables);
			mockSession.fire('sampling.requested', {
				requestId: 'sampling-1',
				mcpRequestId: 'mcp-1',
				serverName: 'test-server',
			});
			await timeout(0);
			session.dispose();
			await timeout(0);

			assert.deepStrictEqual({
				registeredEventInterests: mockSession.registeredEventInterests,
				releasedEventInterests: mockSession.releasedEventInterests,
				samplingResponses: mockSession.samplingResponses,
			}, {
				registeredEventInterests: ['sampling.requested'],
				releasedEventInterests: ['interest-1'],
				samplingResponses: [{ requestId: 'sampling-1' }],
			});
		});

		test('tool_start event is mapped for non-hidden tools', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-10',
				toolName: 'bash',
				arguments: { command: 'echo hello' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(signals.length, 2);
			const toolStart = signals[0];
			assert.ok(isAction(toolStart, ActionType.ChatToolCallStart));
			if (isAction(toolStart, ActionType.ChatToolCallStart)) {
				const action = toolStart.action as ChatToolCallStartAction;
				assert.strictEqual(action.toolCallId, 'tc-10');
				assert.strictEqual(action.toolName, 'bash');
			}
		});

		test('tool call deltas start once, accumulate buffered input, and finalize at tool start', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('assistant.tool_call_delta', {
				toolCallId: 'tc-stream',
				inputDelta: '{"command":"npm ',
			});
			assert.strictEqual(signals.length, 0);

			mockSession.fire('assistant.tool_call_delta', {
				toolCallId: 'tc-stream',
				toolName: 'bash',
				inputDelta: 'test","description":"Run',
			});
			await timeout(STREAMING_TOOL_DISPLAY_INTERVAL_MS + 10);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-stream',
				toolName: 'bash',
				arguments: { command: 'npm test', description: 'Run all tests' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const actions = getActions(signals);
			const starts = actions.filter(action => action.type === ActionType.ChatToolCallStart) as ChatToolCallStartAction[];
			const deltas = actions.filter(action => action.type === ActionType.ChatToolCallDelta) as ChatToolCallDeltaAction[];
			const ready = actions.find(action => action.type === ActionType.ChatToolCallReady) as ChatToolCallReadyAction | undefined;
			assert.deepStrictEqual({
				starts: starts.map(action => ({ toolCallId: action.toolCallId, toolName: action.toolName })),
				deltas: deltas.map(action => ({
					content: action.content,
					hasInvocationMessage: action.invocationMessage !== undefined,
				})),
				ready: ready && { toolCallId: ready.toolCallId, toolInput: ready.toolInput, intention: ready.intention },
			}, {
				starts: [{ toolCallId: 'tc-stream', toolName: 'bash' }],
				deltas: [{ content: '', hasInvocationMessage: true }],
				ready: { toolCallId: 'tc-stream', toolInput: 'npm test', intention: 'Run all tests' },
			});
		});

		test('edit tool deltas progressively refine file and line-count details', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('assistant.tool_call_delta', {
				toolCallId: 'tc-edit-stream',
				toolName: 'edit',
				inputDelta: '{"path":"/repo/file.ts","old_str":"one\\ntwo"',
			});
			mockSession.fire('assistant.tool_call_delta', {
				toolCallId: 'tc-edit-stream',
				toolName: 'edit',
				inputDelta: ',"new_str":"one\\nupdated\\nthree"',
			});
			await timeout(STREAMING_TOOL_DISPLAY_INTERVAL_MS + 10);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-edit-stream',
				toolName: 'edit',
				arguments: {
					path: '/repo/file.ts',
					old_str: 'one\ntwo',
					new_str: 'one\nupdated\nthree',
				},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const actions = getActions(signals);
			const deltas = actions.filter(action => action.type === ActionType.ChatToolCallDelta) as ChatToolCallDeltaAction[];
			const ready = actions.find(action => action.type === ActionType.ChatToolCallReady) as ChatToolCallReadyAction | undefined;
			assert.deepStrictEqual({
				deltas: deltas.flatMap(action => {
					const message = action.invocationMessage;
					const text = typeof message === 'string' ? message : message?.markdown;
					return text ? [text] : [];
				}),
				ready: typeof ready?.invocationMessage === 'string' ? ready.invocationMessage : ready?.invocationMessage.markdown,
			}, {
				deltas: [
					'Replacing 2 lines in [file.ts](file:///repo/file.ts)',
					'Replacing 2 lines with 3 lines in [file.ts](file:///repo/file.ts)',
				],
				ready: 'Edit [file.ts](file:///repo/file.ts)',
			});
		});

		test('raw apply_patch deltas stream line counts and resolved files', async () => {
			const { mockSession, signals } = await createAgentSession(disposables, {
				workingDirectory: URI.file('/workspace'),
			});
			mockSession.fire('assistant.tool_call_delta', {
				toolCallId: 'tc-patch-stream',
				toolName: 'apply_patch',
				inputDelta: [
					'*** Begin Patch',
					'*** Update File: src/file.ts',
					'@@',
					'-old',
					'+new',
					'*** End Patch',
				].join('\n'),
			});
			await timeout(STREAMING_TOOL_DISPLAY_INTERVAL_MS + 10);

			const delta = getActions(signals).find(action => action.type === ActionType.ChatToolCallDelta) as ChatToolCallDeltaAction | undefined;
			const message = delta?.invocationMessage;
			assert.strictEqual(
				typeof message === 'string' ? message : message?.markdown,
				'Generating patch (6 lines) in [file.ts](file:///workspace/src/file.ts)',
			);
		});

		test('MCP tool deltas stream before final contributor metadata arrives', async () => {
			const { mockSession, signals } = await createAgentSession(disposables, {
				configureMockSession: mock => {
					mock.mcpListResult = { servers: [{ name: 'docs', status: 'connected' }] };
				},
			});
			mockSession.fire('session.mcp_server_status_changed', {
				serverName: 'docs',
				status: 'connected',
			} as SessionEventPayload<'session.mcp_server_status_changed'>['data']);
			mockSession.fire('assistant.tool_call_delta', {
				toolCallId: 'tc-stream-mcp',
				toolName: 'mcp_tool',
				inputDelta: '{"topic":"metadata"}',
			});
			await timeout(STREAMING_TOOL_DISPLAY_INTERVAL_MS + 10);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-stream-mcp',
				toolName: 'mcp_tool',
				mcpServerName: 'docs',
				arguments: { topic: 'metadata' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const actions = getActions(signals);
			const starts = actions.filter(action => action.type === ActionType.ChatToolCallStart) as ChatToolCallStartAction[];
			const deltas = actions.filter(action => action.type === ActionType.ChatToolCallDelta) as ChatToolCallDeltaAction[];
			const ready = actions.find(action => action.type === ActionType.ChatToolCallReady) as ChatToolCallReadyAction | undefined;
			assert.deepStrictEqual({
				startCount: starts.length,
				startContributor: starts[0]?.contributor,
				deltas: deltas.map(action => ({
					content: action.content,
					hasInvocationMessage: action.invocationMessage !== undefined,
				})),
				readyContributor: ready?.contributor,
			}, {
				startCount: 1,
				startContributor: undefined,
				deltas: [{ content: '', hasInvocationMessage: true }],
				readyContributor: {
					kind: ToolCallContributorKind.MCP,
					customizationId: 'mcp-top-level:copilot:test-session-1:docs',
				},
			});
		});

		test('full assistant message does not duplicate markdown emitted before a tool delta', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-stream-dedup');
			mockSession.fire('assistant.message_delta', {
				deltaContent: 'I will inspect the file.',
			} as SessionEventPayload<'assistant.message_delta'>['data']);
			mockSession.fire('assistant.tool_call_delta', {
				toolCallId: 'tc-dedup',
				toolName: 'view',
				inputDelta: '{"path":"/workspace/file.ts"}',
			});
			mockSession.fire('assistant.message', {
				messageId: 'msg-dedup',
				content: 'I will inspect the file.',
				toolRequests: [{
					toolCallId: 'tc-dedup',
					name: 'view',
					arguments: { path: '/workspace/file.ts' },
					type: 'function',
				}],
			} as SessionEventPayload<'assistant.message'>['data']);

			const markdownParts = getActions(signals).flatMap(action =>
				action.type === ActionType.ChatResponsePart && action.part.kind === ResponsePartKind.Markdown
					? [{ kind: action.part.kind, content: action.part.content }]
					: []);
			assert.deepStrictEqual(markdownParts, [{
				kind: ResponsePartKind.Markdown,
				content: 'I will inspect the file.',
			}]);
		});

		test('tool_start carries MCP App UI metadata from the SDK', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-app',
				toolName: 'mcp_tool',
				mcpServerName: 'docs',
				toolDescription: {
					name: 'mcp_tool',
					_meta: {
						ui: { resourceUri: 'ui://docs' },
					},
				},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const toolStart = signals.find(s => isAction(s, ActionType.ChatToolCallStart));
			assert.ok(toolStart && isAction(toolStart, ActionType.ChatToolCallStart));
			if (toolStart && isAction(toolStart, ActionType.ChatToolCallStart)) {
				const action = toolStart.action as ChatToolCallStartAction;
				assert.deepStrictEqual(action._meta, {
					mcpServerName: 'docs',
					ui: { resourceUri: 'ui://docs' },
				});
			}
		});

		test('tool_start carries the MCP App channel when the server is already ready', async () => {
			// A tool call cannot begin until its MCP server is Ready, so the
			// AHP `mcp://` channel is always available at `tool.execution_start`
			// and is published as part of the initial `_meta.ui` payload.
			const { mockSession, signals } = await createAgentSession(disposables, {
				configureMockSession: m => {
					m.mcpListResult = { servers: [{ name: 'docs', status: 'connected' }] };
				},
			});
			mockSession.fire('session.mcp_server_status_changed', {
				serverName: 'docs',
				status: 'connected',
			} as SessionEventPayload<'session.mcp_server_status_changed'>['data']);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-app-channel',
				toolName: 'mcp_tool',
				mcpServerName: 'docs',
				arguments: { topic: 'metadata' },
				toolDescription: {
					name: 'mcp_tool',
					_meta: {
						ui: { resourceUri: 'ui://docs' },
					},
				},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const toolStart = signals.find(s => isAction(s, ActionType.ChatToolCallStart));
			assert.ok(toolStart && isAction(toolStart, ActionType.ChatToolCallStart));
			if (toolStart && isAction(toolStart, ActionType.ChatToolCallStart)) {
				const action = toolStart.action as ChatToolCallStartAction;
				assert.deepStrictEqual({
					contributor: action.contributor,
					meta: action._meta,
				}, {
					contributor: {
						kind: ToolCallContributorKind.MCP,
						customizationId: 'mcp-top-level:copilot:test-session-1:docs',
					},
					meta: {
						mcpServerName: 'docs',
						ui: {
							resourceUri: 'ui://docs',
							channel: buildMcpChannel(URI.parse(buildDefaultChatUri(AgentSession.uri('copilot', 'test-session-1'))), 'docs'),
						},
					},
				});
			}
		});

		test('tool_start derives intention from a shell tool description argument', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-intent');

			// The shell tool's own `description` argument carries the intention.
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-intent',
				toolName: 'bash',
				arguments: { command: 'ls', description: 'List files in the repo root' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const toolStart = signals.find(s => isAction(s, ActionType.ChatToolCallStart));
			assert.ok(toolStart && isAction(toolStart, ActionType.ChatToolCallStart));
			assert.strictEqual((toolStart.action as ChatToolCallStartAction).intention, 'List files in the repo root');
		});

		test('non-pty shell terminal URIs are scoped by session and tool call', () => {
			assert.deepStrictEqual([
				buildNonPtyShellTerminalUri(AgentSession.uri('copilot', 'session-1'), 'tool-call-1'),
				buildNonPtyShellTerminalUri(AgentSession.uri('copilot', 'session-1'), 'tool-call-2'),
				buildNonPtyShellTerminalUri(AgentSession.uri('copilot', 'session-2'), 'tool-call-1'),
			], [
				'agenthost-terminal://shell/session-1/tool-call-1',
				'agenthost-terminal://shell/session-1/tool-call-2',
				'agenthost-terminal://shell/session-2/tool-call-1',
			]);
		});

		test('completed non-pty shell calls retire their distinct live output resources', async () => {
			const { session, mockSession, signals, terminalManager } = await createAgentSession(disposables);
			const terminalUris = ['tc-retire-1', 'tc-retire-2', 'tc-retire-3']
				.map(toolCallId => buildNonPtyShellTerminalUri(session.resourceUri, toolCallId));

			for (let i = 0; i < terminalUris.length; i++) {
				const toolCallId = `tc-retire-${i + 1}`;
				const output = `output ${i + 1}\n`;
				mockSession.fire('tool.execution_start', {
					toolCallId,
					toolName: 'bash',
					arguments: { command: `command-${i + 1}` },
				} as SessionEventPayload<'tool.execution_start'>['data']);
				mockSession.fire('tool.execution_partial_result', {
					toolCallId,
					partialOutput: output,
				} as SessionEventPayload<'tool.execution_partial_result'>['data']);
				mockSession.fire('tool.execution_complete', {
					toolCallId,
					success: true,
					result: {
						content: output,
						contents: [{ type: 'shell_exit', shellId: `${i + 1}`, exitCode: 0, outputPreview: output }],
					},
				} as SessionEventPayload<'tool.execution_complete'>['data']);
			}

			const completions = getActions(signals)
				.filter((action): action is ChatToolCallCompleteAction => action.type === ActionType.ChatToolCallComplete);
			assert.deepStrictEqual({
				terminalResults: completions.map(action => {
					const terminal = action.result.content?.find(content => content.type === ToolResultContentType.Terminal) as ToolResultTerminalContent | undefined;
					return {
						resource: terminal?.resource,
						preview: terminal?.result?.preview,
					};
				}),
				disposed: terminalManager.disposedTerminals,
			}, {
				terminalResults: terminalUris.map((resource, i) => ({
					resource,
					preview: `output ${i + 1}\n`,
				})),
				disposed: terminalUris,
			});

			session.dispose();
			assert.deepStrictEqual(terminalManager.disposedTerminals, terminalUris);
		});

		test('emits todo store telemetry for successful built-in Copilot SQL', async () => {
			const telemetryService = new CapturingTelemetryService();
			const { session, mockSession, waitForSignal } = await createAgentSession(disposables, {
				telemetryService,
				sessionUri: AgentSession.uri('copilotcli', 'test-session-1'),
			});
			session.resetTurnState('turn-sql', undefined, AgentHostClientType.EditorWindow, {
				clientType: AgentHostClientType.EditorWindow,
				connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
				transportKind: AgentHostTransportKind.MessagePort,
				hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
				machineId: 'client-machine-id',
				devDeviceId: 'client-dev-device-id',
			});

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-sql',
				toolName: 'sql',
				arguments: { query: 'INSERT INTO todos (id, title, status) VALUES (1, \'Test\', \'pending\')' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-sql',
				success: true,
			} as SessionEventPayload<'tool.execution_complete'>['data']);
			await waitForSignal(signal => isAction(signal, ActionType.ChatToolCallComplete));

			assert.deepStrictEqual(telemetryService.events.filter(event => event.eventName === 'todoStoreOperation'), [{
				eventName: 'todoStoreOperation',
				data: {
					initiatorClientType: 'editor_window',
					initiatorConnectionKind: 'remote_extension_host',
					initiatorTransportKind: 'message_port',
					hostLaunchKind: 'vscode_main_process',
					initiatorMachineId: 'client-machine-id',
					initiatorDevDeviceId: 'client-dev-device-id',
					operation: 'write',
					target: 'todos',
					toolCallId: 'tc-sql',
					provider: 'copilotcli',
					agentSessionId: 'test-session-1',
					isSubagentSession: false,
				},
			}]);
		});

		test('does not emit todo store telemetry for failed or contributed SQL', async () => {
			const telemetryService = new CapturingTelemetryService();
			const { mockSession } = await createAgentSession(disposables, {
				telemetryService,
				sessionUri: AgentSession.uri('copilotcli', 'test-session-1'),
				sessionCustomizations: () => [{
					type: CustomizationType.McpServer,
					id: 'database-customization',
					uri: 'file:///plugin/.mcp.json',
					name: 'database',
					state: { kind: McpServerStatus.Starting },
				}],
			});

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-failed',
				toolName: 'sql',
				arguments: { query: 'DELETE FROM todo_deps' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-failed',
				success: false,
			} as SessionEventPayload<'tool.execution_complete'>['data']);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-mcp',
				toolName: 'sql',
				mcpServerName: 'database',
				arguments: { query: 'SELECT * FROM todos' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-mcp',
				success: true,
			} as SessionEventPayload<'tool.execution_complete'>['data']);
			await timeout(0);

			assert.deepStrictEqual(telemetryService.events.filter(event => event.eventName === 'todoStoreOperation'), []);
		});

		test('tool partial results stream into an output-only terminal channel', async () => {
			const { session, mockSession, signals, waitForSignal, terminalManager } = await createAgentSession(disposables);
			session.resetTurnState('turn-stream');

			const terminalUri = 'agenthost-terminal://shell/test-session-1/tc-stream';
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-stream',
				toolName: 'bash',
				arguments: { command: 'print ticks', description: 'Print ticks' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-stream',
				partialOutput: 'tick 1\n',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);
			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-stream',
				partialOutput: 'tick 1\ntick 2\n',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-stream',
				success: true,
				result: {
					content: 'tick 1\ntick 2\n',
					contents: [{ type: 'shell_exit', shellId: '0', exitCode: 0, outputPreview: 'tick 1\ntick 2\n' }],
				},
			} as SessionEventPayload<'tool.execution_complete'>['data']);
			await waitForSignal(signal => isAction(signal, ActionType.ChatToolCallComplete));

			// The first partial result creates the channel and attaches the
			// terminal block once; later partials only append channel data.
			assert.deepStrictEqual(getActions(signals)
				.filter(action => action.type === ActionType.ChatToolCallContentChanged)
				.map(action => ({
					turnId: action.turnId,
					toolCallId: action.toolCallId,
					content: action.content,
				})), [
				{
					turnId: 'turn-stream',
					toolCallId: 'tc-stream',
					content: [{ type: ToolResultContentType.Terminal, resource: terminalUri, title: 'Run Shell Command', isPty: false }],
				},
			]);
			assert.deepStrictEqual(terminalManager.outputTerminalsCreated, [{
				uri: terminalUri,
				title: 'Run Shell Command',
				claim: { kind: TerminalClaimKind.Session, session: AgentSession.uri('copilot', 'test-session-1').toString(), chat: buildDefaultChatUri(AgentSession.uri('copilot', 'test-session-1')), toolCallId: 'tc-stream' },
			}]);
			assert.deepStrictEqual(terminalManager.outputTerminalData, [
				{ uri: terminalUri, data: 'tick 1\n' },
				{ uri: terminalUri, data: 'tick 2\n' },
			]);
			assert.deepStrictEqual(terminalManager.outputTerminalsFinalized, [{ uri: terminalUri, exitCode: 0 }]);
			assert.deepStrictEqual(terminalManager.disposedTerminals, [terminalUri]);

			// shell_exit completion data lands on the streamed terminal block.
			const completed = getActions(signals).find(action => action.type === ActionType.ChatToolCallComplete) as ChatToolCallCompleteAction;
			assert.deepStrictEqual(completed.result.content, [
				{
					type: ToolResultContentType.Terminal,
					resource: terminalUri,
					title: 'Run Shell Command',
					isPty: false,
					result: { exitCode: 0, preview: 'tick 1\ntick 2\n' },
				},
				{ type: ToolResultContentType.Text, text: 'tick 1\ntick 2\n' },
			]);
		});

		test('truncated shell output streams through marker, rolling-tail, and completion transitions', async () => {
			const { session, mockSession, signals, waitForSignal, terminalManager } = await createAgentSession(disposables);
			session.resetTurnState('turn-truncated-stream');

			const terminalUri = 'agenthost-terminal://shell/test-session-1/tc-rewrite';
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-rewrite',
				toolName: 'bash',
				arguments: { command: 'yes' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-rewrite',
				partialOutput: 'line 1\nline 498\nline 499\n',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);
			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-rewrite',
				partialOutput: 'line 1\nline 498\nline 499\n<output too long - dropped 42 lines from the end>\n',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);
			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-rewrite',
				partialOutput: 'line 1\nline 498\nline 499\n<output too long - dropped 99 lines from the end>\n',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);
			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-rewrite',
				partialOutput: 'line 498\nline 499\nline 500\n',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);
			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-rewrite',
				partialOutput: 'line 499\nline 500\nline 501\n',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-rewrite',
				success: true,
				result: {
					content: 'Output too large',
					contents: [{
						type: 'shell_exit',
						shellId: '0',
						exitCode: 0,
						outputPreview: 'line 1\nline 2\n',
						outputTruncated: true,
					}],
				},
			} as SessionEventPayload<'tool.execution_complete'>['data']);
			await waitForSignal(signal => isAction(signal, ActionType.ChatToolCallComplete));

			const completed = getActions(signals).find(action => action.type === ActionType.ChatToolCallComplete) as ChatToolCallCompleteAction;
			const terminalResult = completed.result.content?.find(content => content.type === ToolResultContentType.Terminal) as ToolResultTerminalContent | undefined;
			assert.deepStrictEqual({
				data: terminalManager.outputTerminalData,
				resets: terminalManager.outputTerminalResets,
				finalized: terminalManager.outputTerminalsFinalized,
				disposed: terminalManager.disposedTerminals,
				result: terminalResult?.result,
			}, {
				data: [
					{ uri: terminalUri, data: 'line 1\nline 498\nline 499\n' },
					{ uri: terminalUri, data: '<output too long - dropped 42 lines from the end>\n' },
					{ uri: terminalUri, data: 'line 500\n' },
					{ uri: terminalUri, data: 'line 501\n' },
				],
				resets: [],
				finalized: [{ uri: terminalUri, exitCode: 0 }],
				disposed: [terminalUri],
				result: { exitCode: 0, preview: 'line 1\nline 2\n', truncated: true },
			});
		});

		test('zero-partial shell completion creates, seeds, and finalizes the output channel', async () => {
			const { mockSession, signals, terminalManager } = await createAgentSession(disposables);

			const terminalUri = 'agenthost-terminal://shell/test-session-1/tc-quiet';
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-quiet',
				toolName: 'bash',
				arguments: { command: 'true' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-quiet',
				success: true,
				result: {
					content: 'ok\n',
					contents: [{ type: 'shell_exit', shellId: '0', exitCode: 0, outputPreview: 'ok\n' }],
				},
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			// Completion creates, seeds, and finalizes the channel before the
			// static result is published and the live resource is retired.
			assert.deepStrictEqual({
				created: terminalManager.outputTerminalsCreated.map(t => t.uri),
				data: terminalManager.outputTerminalData,
				finalized: terminalManager.outputTerminalsFinalized,
				disposed: terminalManager.disposedTerminals,
			}, {
				created: [terminalUri],
				data: [{ uri: terminalUri, data: 'ok\n' }],
				finalized: [{ uri: terminalUri, exitCode: 0 }],
				disposed: [terminalUri],
			});
			const completed = getActions(signals).find(action => action.type === ActionType.ChatToolCallComplete) as ChatToolCallCompleteAction;
			assert.ok(completed.result.content?.some(c => c.type === ToolResultContentType.Terminal && c.resource === terminalUri));
		});

		test('empty shell preview still retires the completed output channel', async () => {
			const { mockSession, terminalManager } = await createAgentSession(disposables);
			const terminalUri = 'agenthost-terminal://shell/test-session-1/tc-empty-preview';

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-empty-preview',
				toolName: 'bash',
				arguments: { command: 'true' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-empty-preview',
				success: true,
				result: {
					content: '',
					contents: [{ type: 'shell_exit', shellId: '0', exitCode: 0, outputPreview: '' }],
				},
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.deepStrictEqual({
				finalized: terminalManager.outputTerminalsFinalized,
				disposed: terminalManager.disposedTerminals,
			}, {
				finalized: [{ uri: terminalUri, exitCode: 0 }],
				disposed: [terminalUri],
			});
		});

		test('tool success without shell_exit does not fabricate a process exit', async () => {
			const { session, mockSession, terminalManager } = await createAgentSession(disposables);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-err',
				toolName: 'bash',
				arguments: { command: 'boom' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-err',
				partialOutput: 'boom\n',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-err',
				success: false,
				error: { message: 'failed' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-ok',
				toolName: 'bash',
				arguments: { command: 'fine' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-ok',
				partialOutput: 'fine\n',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-ok',
				success: true,
				result: { content: 'fine\n' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			// Tool completion and process completion are separate lifecycles.
			assert.deepStrictEqual({
				data: terminalManager.outputTerminalData,
				finalized: terminalManager.outputTerminalsFinalized,
				disposed: terminalManager.disposedTerminals,
			}, {
				data: [
					{ uri: 'agenthost-terminal://shell/test-session-1/tc-err', data: 'boom\n' },
					{ uri: 'agenthost-terminal://shell/test-session-1/tc-ok', data: 'fine\n' },
				],
				finalized: [],
				disposed: [],
			});
			session.dispose();
			assert.deepStrictEqual(terminalManager.disposedTerminals, [
				'agenthost-terminal://shell/test-session-1/tc-err',
				'agenthost-terminal://shell/test-session-1/tc-ok',
			]);
		});

		test('stable shell completion fallback finalizes when the SDK strips shell_exit', async () => {
			const { mockSession, signals, waitForSignal, terminalManager } = await createAgentSession(disposables);
			const terminalUri = 'agenthost-terminal://shell/test-session-1/tc-exit-fallback';

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-exit-fallback',
				toolName: 'bash',
				arguments: { command: 'eci hi' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-exit-fallback',
				partialOutput: '/bin/bash: eci: command not found\n',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-exit-fallback',
				success: true,
				result: {
					content: '/bin/bash: eci: command not found\n<shellId: shell-error completed with exit code 127>',
				},
			} as SessionEventPayload<'tool.execution_complete'>['data']);
			await waitForSignal(signal => isAction(signal, ActionType.ChatToolCallComplete));

			assert.deepStrictEqual({
				finalized: terminalManager.outputTerminalsFinalized,
				disposed: terminalManager.disposedTerminals,
			}, {
				finalized: [{ uri: terminalUri, exitCode: 127 }],
				disposed: [terminalUri],
			});
			const completed = getActions(signals).find(action => action.type === ActionType.ChatToolCallComplete) as ChatToolCallCompleteAction;
			assert.ok(completed.result.content?.some(content =>
				content.type === ToolResultContentType.Terminal
				&& content.resource === terminalUri
				&& content.isPty === false
				&& content.result?.exitCode === 127
				&& content.result.preview === '/bin/bash: eci: command not found\n'
			));
		});

		test('background shell does not create an output-only terminal', async () => {
			const { mockSession, signals, waitForSignal, terminalManager } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-background',
				toolName: 'bash',
				arguments: { command: 'long-running-command' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-background',
				success: true,
				result: { content: '<command started in background with shellId: shell-bg>' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);
			await waitForSignal(signal => isAction(signal, ActionType.ChatToolCallComplete));

			const completed = getActions(signals).find(action => action.type === ActionType.ChatToolCallComplete) as ChatToolCallCompleteAction;
			assert.ok(!completed.result.content?.some(content => content.type === ToolResultContentType.Terminal));
			assert.deepStrictEqual(terminalManager.outputTerminalsCreated, []);

			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-background',
				partialOutput: 'late output\n',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);

			mockSession.fire('system.notification', {
				content: '<system_notification>Shell command completed</system_notification>',
				kind: { type: 'shell_completed', shellId: 'shell-bg', exitCode: 7, description: 'long-running-command' },
			} as SessionEventPayload<'system.notification'>['data']);
			assert.deepStrictEqual({
				created: terminalManager.outputTerminalsCreated,
				data: terminalManager.outputTerminalData,
				finalized: terminalManager.outputTerminalsFinalized,
			}, { created: [], data: [], finalized: [] });
		});

		test('background shell output remains live until its session is disposed', async () => {
			const { session, mockSession, terminalManager } = await createAgentSession(disposables);
			const terminalUri = 'agenthost-terminal://shell/test-session-1/tc-background-stream';

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-background-stream',
				toolName: 'bash',
				arguments: { command: 'long-running-command' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-background-stream',
				partialOutput: 'started\n',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-background-stream',
				success: true,
				result: { content: '<command started in background with shellId: shell-bg>' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);
			mockSession.fire('system.notification', {
				content: '<system_notification>Shell command completed</system_notification>',
				kind: { type: 'shell_completed', shellId: 'shell-bg', exitCode: 0, description: 'long-running-command' },
			} as SessionEventPayload<'system.notification'>['data']);

			assert.deepStrictEqual(terminalManager.disposedTerminals, []);
			session.dispose();
			assert.deepStrictEqual(terminalManager.disposedTerminals, [terminalUri]);
		});

		test('completions without partials or shell_exit never create output channels', async () => {
			const { mockSession, terminalManager } = await createAgentSession(disposables);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-grep',
				toolName: 'grep',
				arguments: { pattern: 'x' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-grep',
				success: true,
				result: { content: 'match' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-silent',
				toolName: 'bash',
				arguments: { command: 'true' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-silent',
				success: true,
				result: { content: '' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.deepStrictEqual({
				created: terminalManager.outputTerminalsCreated,
				finalized: terminalManager.outputTerminalsFinalized,
			}, { created: [], finalized: [] });
		});

		test('tool partial results for untracked tools are ignored', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-untracked',
				partialOutput: 'orphaned output',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);

			assert.deepStrictEqual(getActions(signals), []);
		});

		test('tool partial results for tracked non-shell tools are ignored', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-non-shell',
				toolName: 'grep',
				arguments: { pattern: 'needle' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_partial_result', {
				toolCallId: 'tc-non-shell',
				partialOutput: 'unexpected partial output',
			} as SessionEventPayload<'tool.execution_partial_result'>['data']);

			assert.deepStrictEqual(getActions(signals)
				.filter(action => action.type === ActionType.ChatToolCallContentChanged), []);
		});

		test('live tool_start strips redundant cd prefix matching workingDirectory', async () => {
			const wd = URI.file('/repo/project');
			const { mockSession, signals } = await createAgentSession(disposables, { workingDirectory: wd });
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-cd',
				toolName: 'bash',
				arguments: { command: 'cd /repo/project && npm test' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(signals.length, 2);
			// toolInput on the auto-ready signal (signals[1])
			const readySignal = signals[1];
			assert.ok(isAction(readySignal, ActionType.ChatToolCallReady));
			if (isAction(readySignal, ActionType.ChatToolCallReady)) {
				const action = readySignal.action as ChatToolCallReadyAction;
				assert.strictEqual(action.toolInput, 'npm test');
			}
		});

		test('live tool_complete past-tense message reflects the rewritten command', async () => {
			const wd = URI.file('/repo/project');
			const { mockSession, signals } = await createAgentSession(disposables, { workingDirectory: wd });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-cd-complete',
				toolName: 'bash',
				arguments: { command: 'cd /repo/project && npm test' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-cd-complete',
				success: true,
				result: { content: 'all tests passed' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.strictEqual(signals.length, 3);
			const completeSignal = signals[2];
			assert.ok(isAction(completeSignal, ActionType.ChatToolCallComplete));
			if (isAction(completeSignal, ActionType.ChatToolCallComplete)) {
				const action = completeSignal.action as ChatToolCallCompleteAction;
				const past = action.result.pastTenseMessage;
				const pastStr = typeof past === 'string' ? past : (past?.markdown ?? '');
				assert.ok(!pastStr.includes('cd /repo/project'), `past-tense message should not contain stripped prefix, got: ${pastStr}`);
				assert.ok(pastStr.includes('npm test'), `past-tense message should contain the rewritten command, got: ${pastStr}`);
			}
		});

		test('live tool_complete maps SDK shell_exit content to terminal completion', async () => {
			const { session, mockSession, signals, terminalManager } = await createAgentSession(disposables);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-shell-exit',
				toolName: 'bash',
				arguments: { command: 'gti status' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-shell-exit',
				success: true,
				result: {
					content: 'command not found\n',
					contents: [{ type: 'shell_exit', shellId: '0', exitCode: 127, cwd: '/repo' }],
				},
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.strictEqual(signals.length, 3);
			const completeSignal = signals[2];
			assert.ok(isAction(completeSignal, ActionType.ChatToolCallComplete));
			if (isAction(completeSignal, ActionType.ChatToolCallComplete)) {
				const action = completeSignal.action as ChatToolCallCompleteAction;
				assert.strictEqual(action.result.success, true);
				assert.deepStrictEqual(action.result.content, [
					{ type: ToolResultContentType.Text, text: 'command not found\n' },
					{
						type: ToolResultContentType.Terminal,
						resource: 'agenthost-terminal://shell/test-session-1/tc-shell-exit',
						title: 'Run Shell Command',
						isPty: false,
						result: { exitCode: 127 },
					},
				]);
			}
			// The advertised channel exists and is terminated; with no preview
			// there is nothing to seed.
			assert.deepStrictEqual({
				created: terminalManager.outputTerminalsCreated.map(t => t.uri),
				data: terminalManager.outputTerminalData,
				finalized: terminalManager.outputTerminalsFinalized,
				disposed: terminalManager.disposedTerminals,
			}, {
				created: ['agenthost-terminal://shell/test-session-1/tc-shell-exit'],
				data: [],
				finalized: [{ uri: 'agenthost-terminal://shell/test-session-1/tc-shell-exit', exitCode: 127 }],
				disposed: [],
			});
			session.dispose();
			assert.deepStrictEqual(terminalManager.disposedTerminals, ['agenthost-terminal://shell/test-session-1/tc-shell-exit']);
		});

		test('live read_bash completion does not render shell_exit metadata as a terminal command', async () => {
			const { mockSession, signals, terminalManager } = await createAgentSession(disposables);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-read-bash',
				toolName: 'read_bash',
				arguments: { shellId: 'build', delay: 0 },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-read-bash',
				success: true,
				result: {
					content: 'Build completed\n',
					contents: [{ type: 'shell_exit', shellId: 'build', exitCode: 0, outputPreview: 'Build completed\n' }],
				},
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			const completeSignal = signals[2];
			assert.ok(isAction(completeSignal, ActionType.ChatToolCallComplete));
			if (isAction(completeSignal, ActionType.ChatToolCallComplete)) {
				const action = completeSignal.action as ChatToolCallCompleteAction;
				assert.deepStrictEqual({
					pastTenseMessage: action.result.pastTenseMessage,
					content: action.result.content,
					createdTerminals: terminalManager.outputTerminalsCreated,
				}, {
					pastTenseMessage: 'Read Terminal',
					content: [{ type: ToolResultContentType.Text, text: 'Build completed\n' }],
					createdTerminals: [],
				});
			}
		});

		test('live task_complete emits the input summary when tool output is truncated', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-task-complete',
				toolName: 'task_complete',
				arguments: { summary: 'Completed the requested work.' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-task-complete',
				success: true,
				result: { content: 'Output too large to read at once (11.3 KB). Saved to: /tmp/task-complete.txt' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			const actions = getActions(signals);
			assert.deepStrictEqual(actions.map(a => a.type), [ActionType.ChatResponsePart]);
			const responsePart = actions[0] as ChatResponsePartAction;
			assert.strictEqual(responsePart.part.kind, ResponsePartKind.Markdown);
			if (responsePart.part.kind !== ResponsePartKind.Markdown) {
				return;
			}
			assert.deepStrictEqual(responsePart.part, {
				kind: ResponsePartKind.Markdown,
				id: responsePart.part.id,
				content: '\n\n**Task completed:** Completed the requested work.',
			});
		});

		test('live tool_start does not rewrite when cd target differs from workingDirectory', async () => {
			const wd = URI.file('/repo/project');
			const { mockSession, signals } = await createAgentSession(disposables, { workingDirectory: wd });
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-cd-other',
				toolName: 'bash',
				arguments: { command: 'cd /tmp && ls' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(signals.length, 2);
			const readySignal = signals[1];
			assert.ok(isAction(readySignal, ActionType.ChatToolCallReady));
			if (isAction(readySignal, ActionType.ChatToolCallReady)) {
				assert.strictEqual((readySignal.action as ChatToolCallReadyAction).toolInput, 'cd /tmp && ls');
			}
		});

		test('live tool_start without workingDirectory passes command through', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-cd-nowd',
				toolName: 'bash',
				arguments: { command: 'cd /repo/project && npm test' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(signals.length, 2);
			const readySignal = signals[1];
			assert.ok(isAction(readySignal, ActionType.ChatToolCallReady));
			if (isAction(readySignal, ActionType.ChatToolCallReady)) {
				assert.strictEqual((readySignal.action as ChatToolCallReadyAction).toolInput, 'cd /repo/project && npm test');
			}
		});

		test('edit hooks resolve relative apply_patch file paths against workingDirectory', async () => {
			const capturedRuntime: { current?: ICopilotSessionRuntime } = {};
			const workingDirectory = URI.file('/repo/project');
			const absolutePath = URI.file('/tmp/absolute.ts').fsPath;
			const { session } = await createAgentSession(disposables, { workingDirectory, captureRuntime: capturedRuntime });
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			const started: string[] = [];
			const completed: string[] = [];
			sessionInternals._editTracker.trackEditStart = async path => { started.push(path); };
			sessionInternals._editTracker.completeEdit = async path => { completed.push(path); };
			const patch = [
				'*** Begin Patch',
				'*** Update File: foo.ts',
				'@@',
				'+new',
				'*** Update File: src/bar.ts',
				'@@',
				'+new',
				`*** Update File: ${absolutePath}`,
				'@@',
				'+new',
				'*** End Patch',
			].join('\n');

			await capturedRuntime.current!.handlePreToolUse({
				sessionId: 'test-session-1',
				timestamp: new Date(0),
				workingDirectory: '/repo/project',
				toolName: 'apply_patch',
				toolArgs: patch,
			});
			await capturedRuntime.current!.handlePostToolUse({
				sessionId: 'test-session-1',
				timestamp: new Date(0),
				workingDirectory: '/repo/project',
				toolName: 'apply_patch',
				toolArgs: patch,
				toolResult: { textResultForLlm: '', resultType: 'success' },
			});

			assert.deepStrictEqual({ started, completed }, {
				started: [join(workingDirectory.fsPath, 'foo.ts'), join(workingDirectory.fsPath, 'src/bar.ts'), absolutePath],
				completed: [join(workingDirectory.fsPath, 'foo.ts'), join(workingDirectory.fsPath, 'src/bar.ts'), absolutePath],
			});
		});

		test('tool_complete resolves relative apply_patch file paths before taking completed edits', async () => {
			const workingDirectory = URI.file('/repo/project');
			const { session, mockSession, waitForSignal } = await createAgentSession(disposables, { workingDirectory });
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			const taken: string[] = [];
			sessionInternals._editTracker.takeCompletedEdit = async (_turnId, _toolCallId, path, _toolName, _toolInput, _modelId) => {
				taken.push(path);
				return undefined;
			};
			session.resetTurnState('turn-apply-patch');
			const patch = [
				'*** Begin Patch',
				'*** Update File: foo.ts',
				'@@',
				'+new',
				'*** Update File: src/bar.ts',
				'@@',
				'+new',
				'*** End Patch',
			].join('\n');

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-apply-patch',
				toolName: 'apply_patch',
				arguments: patch,
			} as unknown as SessionEventPayload<'tool.execution_start'>['data']);

			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-apply-patch',
				success: true,
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			await waitForSignal(s => isAction(s, ActionType.ChatToolCallComplete));

			assert.deepStrictEqual(taken, [join(workingDirectory.fsPath, 'foo.ts'), join(workingDirectory.fsPath, 'src/bar.ts')]);
		});

		test('hidden tools are not emitted as tool_start', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-11',
				toolName: 'report_intent',
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(signals.length, 0);
		});

		test('assistant.intent surfaces as session activity', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('assistant.intent', { intent: 'Reading repo docs' });
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.deepStrictEqual(signals
				.filter(signal => isAction(signal, ActionType.SessionActivityChanged))
				.map(signal => (signal.action as { activity: string | undefined }).activity), [
				'Reading repo docs',
				undefined,
			]);
		});

		test('assistant.intent from a peer chat targets the owning session', async () => {
			const sessionUri = AgentSession.uri('copilot', 'owner');
			const chatChannelUri = URI.parse(buildChatUri(sessionUri, 'peer'));
			const { mockSession, signals } = await createAgentSession(disposables, { sessionUri, chatChannelUri });

			mockSession.fire('assistant.intent', { intent: 'Reading peer context' });

			assert.deepStrictEqual(signals
				.filter(signal => isAction(signal, ActionType.SessionActivityChanged))
				.map(signal => ({ resource: signal.resource.toString(), activity: (signal.action as { activity: string | undefined }).activity })), [{
					resource: sessionUri.toString(),
					activity: 'Reading peer context',
				}]);
		});

		test('assistant.intent clears session activity', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('assistant.intent', { intent: 'Reading repo docs' });
			mockSession.fire('assistant.intent', { intent: '' });

			assert.deepStrictEqual(signals
				.filter(signal => isAction(signal, ActionType.SessionActivityChanged))
				.map(signal => (signal.action as { activity: string | undefined }).activity), [
				'Reading repo docs',
				undefined,
			]);
		});

		test('tool_complete event produces past-tense message', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			// First fire tool_start so it's tracked
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-12',
				toolName: 'bash',
				arguments: { command: 'ls' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// Then fire complete
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-12',
				success: true,
				result: { content: 'file1.ts\nfile2.ts' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.strictEqual(signals.length, 3);
			const completeSignal = signals[2];
			assert.ok(isAction(completeSignal, ActionType.ChatToolCallComplete));
			if (isAction(completeSignal, ActionType.ChatToolCallComplete)) {
				const action = completeSignal.action as ChatToolCallCompleteAction;
				assert.strictEqual(action.toolCallId, 'tc-12');
				assert.ok(action.result.success);
				assert.ok(action.result.pastTenseMessage);
			}
		});

		test('tool_complete for untracked tool is ignored', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-untracked',
				success: true,
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.strictEqual(signals.length, 0);
		});

		test('idle event completes the active turn', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-idle');
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.strictEqual(signals.length, 1);
			assert.ok(isAction(signals[0], ActionType.ChatTurnComplete));
		});

		test('idle event completes the active turn while a detached shell runs', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			mockSession.backgroundTasks = [{
				type: 'shell',
				id: 'shell-1',
				description: 'Monitor CI',
				status: 'running',
				startedAt: new Date(0).toISOString(),
				command: 'monitor-ci',
				attachmentMode: 'detached',
				executionMode: 'background',
			}];
			session.resetTurnState('turn-background');
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.deepStrictEqual({
				hasActiveTurn: session.hasActiveTurn,
				completedTurns: getActions(signals).filter(action => action.type === ActionType.ChatTurnComplete).length,
				listCalls: mockSession.backgroundTaskListCalls,
				refreshCalls: mockSession.backgroundTaskRefreshCalls,
			}, {
				hasActiveTurn: false,
				completedTurns: 1,
				listCalls: 0,
				refreshCalls: 0,
			});
		});

		test('running detached shell state defers release conservatively', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			const runningShell = {
				type: 'shell' as const,
				id: 'shell-running',
				description: 'Monitor CI',
				status: 'running' as const,
				startedAt: new Date(0).toISOString(),
				command: 'monitor-ci',
				attachmentMode: 'detached' as const,
				executionMode: 'background' as const,
			};
			mockSession.backgroundTasks = [runningShell];
			const running = await session.hasRunningDetachedShells();
			mockSession.backgroundTasks = [{ ...runningShell, status: 'completed', completedAt: new Date().toISOString() }];
			const completed = await session.hasRunningDetachedShells();
			mockSession.backgroundTaskListError = new Error('transient tasks.list failure');
			const failedRead = await session.hasRunningDetachedShells();

			assert.deepStrictEqual({
				running,
				completed,
				failedRead,
				listCalls: mockSession.backgroundTaskListCalls,
				refreshCalls: mockSession.backgroundTaskRefreshCalls,
			}, {
				running: true,
				completed: false,
				failedRead: true,
				listCalls: 3,
				refreshCalls: 3,
			});
		});

		test('tool-call aggregate emits once with cancelled result across abort and idle', async () => {
			const telemetryService = new CapturingTelemetryService();
			const sessionUri = AgentSession.uri('copilotcli', 'test-session-1');
			const peerChatUri = URI.parse(buildChatUri(sessionUri, 'peer-1'));
			const { session, mockSession, signals } = await createAgentSession(disposables, {
				telemetryService,
				sessionUri,
				chatChannelUri: peerChatUri,
				resource: peerChatUri,
				clientSnapshot: { tools: [{ name: 'grep' }, { name: 'edit' }], plugins: [], mcpServers: {} },
			});
			session.resetTurnState('turn-tool-details');
			await session.send('hello agent', undefined, 'turn-tool-details');
			mockSession.fire('user.message', { content: 'hello agent' } as SessionEventPayload<'user.message'>['data']);
			mockSession.fire('assistant.message', {
				messageId: 'msg-tools',
				content: '',
				model: 'gpt-x',
				apiCallId: 'api-tools',
				toolRequests: [
					{ toolCallId: 'tc-1', name: 'grep', arguments: {} },
					{ toolCallId: 'tc-2', name: 'edit', arguments: {} },
				],
			} as SessionEventPayload<'assistant.message'>['data'], { id: 'evt-tools' });
			mockSession.fire('assistant.message', {
				messageId: 'msg-final',
				content: 'done',
				model: 'gpt-x',
				apiCallId: 'api-final',
			} as SessionEventPayload<'assistant.message'>['data'], { id: 'evt-final' });
			mockSession.fire('abort', { reason: 'user_abort' } as SessionEventPayload<'abort'>['data']);
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);

			assert.deepStrictEqual({
				telemetry: telemetryService.events.map(event => {
					const data = event.data as Record<string, unknown>;
					return {
						eventName: event.eventName,
						provider: data.provider,
						requestId: data.requestId,
						responseType: data.responseType,
						toolCounts: data.toolCounts,
						model: data.model,
						numRequests: data.numRequests,
						turnIndex: data.turnIndex,
						messageCharLen: data.messageCharLen,
						availableToolCount: data.availableToolCount,
						totalToolCalls: data.totalToolCalls,
						parallelToolCallRounds: data.parallelToolCallRounds,
						parallelToolCallsTotal: data.parallelToolCallsTotal,
					};
				}),
				modelCalls: signals.filter(signal => signal.kind === 'model_call_completed').map(signal => ({
					turnId: signal.kind === 'model_call_completed' ? signal.turnId : undefined,
					modelCallId: signal.kind === 'model_call_completed' ? signal.modelCallId : undefined,
				})),
			}, {
				telemetry: [{
					eventName: 'toolCallDetails',
					provider: 'copilotcli',
					requestId: 'turn-tool-details',
					responseType: 'cancelled',
					toolCounts: JSON.stringify({ grep: 1, edit: 1 }),
					model: 'gpt-x',
					numRequests: 2,
					turnIndex: 0,
					messageCharLen: 11,
					availableToolCount: 2,
					totalToolCalls: 2,
					parallelToolCallRounds: 1,
					parallelToolCallsTotal: 2,
				}],
				modelCalls: [
					{ turnId: 'turn-tool-details', modelCallId: 'api-tools' },
					{ turnId: 'turn-tool-details', modelCallId: 'api-final' },
				],
			});
		});

		test('split assistant messages count as one model call', async () => {
			const telemetryService = new CapturingTelemetryService();
			const { session, mockSession, signals } = await createAgentSession(disposables, {
				telemetryService,
				clientSnapshot: { tools: [{ name: 'grep' }], plugins: [], mcpServers: {} },
			});
			session.resetTurnState('turn-split-message');
			await session.send('hello agent', undefined, 'turn-split-message');
			mockSession.fire('user.message', { content: 'hello agent' } as SessionEventPayload<'user.message'>['data']);
			mockSession.fire('assistant.message', {
				messageId: 'msg-part-1',
				content: 'reasoning',
				model: 'gpt-x',
				chunkIndex: 0,
				chunkCount: 2,
			} as SessionEventPayload<'assistant.message'>['data']);
			mockSession.fire('assistant.message', {
				messageId: 'msg-part-2',
				content: 'answer',
				model: 'gpt-x',
				chunkIndex: 1,
				chunkCount: 2,
			} as SessionEventPayload<'assistant.message'>['data']);
			mockSession.fire('session.idle', { aborted: false } as SessionEventPayload<'session.idle'>['data']);

			assert.deepStrictEqual({
				numRequests: (telemetryService.events.find(event => event.eventName === 'toolCallDetails')?.data as Record<string, unknown> | undefined)?.numRequests,
				modelCallIds: signals.filter(signal => signal.kind === 'model_call_completed').map(signal => signal.kind === 'model_call_completed' ? signal.modelCallId : undefined),
			}, {
				numRequests: 1,
				modelCallIds: ['msg-part-2'],
			});
		});

		test('tool approval waits for permission outcome and falls back only at completion', async () => {
			const telemetryService = new CapturingTelemetryService();
			const sessionUri = AgentSession.uri('copilotcli', 'test-session-1');
			const peerChatUri = URI.parse(buildChatUri(sessionUri, 'peer-1'));
			const { session, mockSession } = await createAgentSession(disposables, {
				telemetryService,
				sessionUri,
				chatChannelUri: peerChatUri,
				resource: peerChatUri,
			});
			session.resetTurnState('turn-approval');

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-approved', toolName: 'bash', arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);
			assert.strictEqual(telemetryService.events.length, 0);
			mockSession.fire('permission.requested', {
				requestId: 'permission-approved',
				permissionRequest: { kind: 'custom-tool', toolCallId: 'tc-approved', toolName: 'bash' },
			} as SessionEventPayload<'permission.requested'>['data']);
			assert.strictEqual(telemetryService.events.length, 0);
			mockSession.fire('permission.completed', {
				requestId: 'permission-approved', toolCallId: 'tc-approved', result: { kind: 'approved' },
			} as SessionEventPayload<'permission.completed'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-approved', success: true, result: { content: 'done' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-denied', toolName: 'edit', arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('permission.requested', {
				requestId: 'permission-denied',
				permissionRequest: { kind: 'custom-tool', toolCallId: 'tc-denied', toolName: 'edit' },
			} as SessionEventPayload<'permission.requested'>['data']);
			mockSession.fire('permission.completed', {
				requestId: 'permission-denied', toolCallId: 'tc-denied', result: { kind: 'denied-interactively-by-user' },
			} as SessionEventPayload<'permission.completed'>['data']);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-no-permission', toolName: 'grep', arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);
			assert.strictEqual(telemetryService.events.filter(event => event.eventName === 'chat.toolApproval').length, 2);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-no-permission', success: true, result: { content: 'done' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.deepStrictEqual(telemetryService.events.filter(event => event.eventName === 'chat.toolApproval').map(event => {
				const data = event.data as Record<string, unknown>;
				return {
					provider: data.provider,
					toolId: data.toolId,
					confirmKind: data.confirmKind,
					confirmationNotNeededReason: data.confirmationNotNeededReason,
				};
			}), [{
				provider: 'copilotcli', toolId: 'bash', confirmKind: 'userAction', confirmationNotNeededReason: undefined,
			}, {
				provider: 'copilotcli', toolId: 'edit', confirmKind: 'denied', confirmationNotNeededReason: undefined,
			}, {
				provider: 'copilotcli', toolId: 'grep', confirmKind: 'confirmationNotNeeded', confirmationNotNeededReason: undefined,
			}]);
		});

		test('tool-search approval telemetry classifies the override as a client tool', async () => {
			const telemetryService = new CapturingTelemetryService();
			const { runtime, mockSession } = await createAgentSession(disposables, {
				telemetryService,
				clientSnapshot: {
					tools: [{ name: CLIENT_TOOL_SEARCH_REFERENCE_NAME, description: 'Search tools', inputSchema: { type: 'object', properties: {} } }],
					plugins: [],
					mcpServers: {},
				},
			});
			runtime.createClientSdkTools(true);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-tool-search-telemetry',
				toolName: RUNTIME_TOOL_SEARCH_TOOL_NAME,
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-tool-search-telemetry',
				success: true,
				result: { content: 'done' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.deepStrictEqual(telemetryService.events
				.filter(event => event.eventName === 'chat.toolApproval')
				.map(event => {
					const data = event.data as Record<string, unknown>;
					return { toolId: data.toolId, toolSourceKind: data.toolSourceKind };
				}), [{
					toolId: RUNTIME_TOOL_SEARCH_TOOL_NAME,
					toolSourceKind: 'client',
				}]);
		});

		test('idle event without an active turn is ignored', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.strictEqual(signals.length, 0);
		});

		test('reports the turn ending on both normal completion and abort', async () => {
			// The agent parks work that must not interrupt a live turn (notably a
			// CLI client restart) until this fires, so every path out of an
			// in-flight turn has to report it — otherwise that work is stranded
			// and the session spins forever.
			let turnEndCount = 0;
			const { session, mockSession } = await createAgentSession(disposables, { onTurnEnded: () => turnEndCount++ });

			session.resetTurnState('turn-completed');
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);
			const afterCompletion = turnEndCount;

			session.resetTurnState('turn-aborted');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-0' } as SessionEventPayload<'assistant.turn_start'>['data']);
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);

			assert.deepStrictEqual({
				afterCompletion,
				afterAbort: turnEndCount,
				hasActiveTurn: session.hasActiveTurn,
			}, {
				afterCompletion: 1,
				afterAbort: 2,
				hasActiveTurn: false,
			});
		});

		test('drops and logs a markdown delta emitted with no active turn', async () => {
			// A delta should only arrive while a turn is active. With none, we
			// can't persist the part id (so every delta would allocate a fresh
			// part) and the action would carry an empty turnId — drop it and log.
			const logService = new CapturingLogService();
			const { mockSession, signals } = await createAgentSession(disposables, { logService });

			// No resetTurnState → no active turn.
			mockSession.fire('assistant.message_delta', {
				deltaContent: 'orphan text',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			const parts = getActions(signals).filter(a => a.type === ActionType.ChatResponsePart || a.type === ActionType.ChatDelta);
			assert.strictEqual(parts.length, 0, 'no response part/delta should be emitted without an active turn');
			assert.strictEqual(logService.errors.length, 1, 'should log an error');
			assert.match(String(logService.errors[0].first), /no active turn/i);
		});

		test('abort-induced idle does not complete a pending queued turn', async () => {
			// Repro for the blank-response-after-abort race: a running turn is
			// aborted while a queued message exists. The queued message's
			// `send()` creates a fresh (pending) turn before the abort's
			// terminal `session.idle` is delivered. That idle must not complete
			// the queued turn — structurally, because it has not started running
			// yet, and because the idle carries `aborted: true`.
			const { session, mockSession, signals } = await createAgentSession(disposables);

			// The queued message has started its (pending) turn by the time the
			// abort's terminal idle arrives — no SDK event has run it yet.
			session.resetTurnState('turn-queued');
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);

			assert.strictEqual(
				getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete).length,
				0,
				'abort-induced idle must not complete the pending queued turn',
			);

			// The queued turn now actually runs (first SDK event) and then
			// completes on its own (non-abort) idle.
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-0' } as SessionEventPayload<'assistant.turn_start'>['data']);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			const completions = getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete);
			assert.strictEqual(completions.length, 1, 'the queued turn should complete on its real idle');
			assert.strictEqual((completions[0] as ChatTurnCompleteAction).turnId, 'turn-queued');
		});

		test('abort-induced idle tears down a running turn without completing it', async () => {
			// Plain abort (no queued message): the running turn is finalized by
			// the client-dispatched ChatTurnCancelled, so the abort's idle must
			// not also emit a ChatTurnComplete. The turn handle is dropped so a
			// later stray idle cannot complete it.
			const { session, mockSession, signals } = await createAgentSession(disposables);

			session.resetTurnState('turn-aborted');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-0' } as SessionEventPayload<'assistant.turn_start'>['data']);
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);

			assert.strictEqual(
				getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete).length,
				0,
				'abort-induced idle must not complete the running aborted turn',
			);

			// A subsequent stray idle has no turn to act on.
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);
			assert.strictEqual(getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete).length, 0);
		});

		test('a running turn after a prior abort still completes on its idle', async () => {
			// No lingering state across turns: the next turn completes normally.
			const { session, mockSession, signals } = await createAgentSession(disposables);

			session.resetTurnState('turn-aborted');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-0' } as SessionEventPayload<'assistant.turn_start'>['data']);
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);
			assert.strictEqual(getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete).length, 0);

			session.resetTurnState('turn-next');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-1' } as SessionEventPayload<'assistant.turn_start'>['data']);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			const completions = getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete);
			assert.strictEqual(completions.length, 1);
			assert.strictEqual((completions[0] as ChatTurnCompleteAction).turnId, 'turn-next');
		});

		test('emits auth-required only for Copilot auth rejections', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			let authRequiredCount = 0;
			disposables.add(session.onDidRequireAuth(() => authRequiredCount++));

			for (const data of [
				{ errorType: 'authentication', message: 'expired', statusCode: 401 },
				{ errorType: 'authorization', message: 'unauthorized', statusCode: 401 },
				{ errorType: 'authentication', message: 'forbidden', statusCode: 403 },
				{ errorType: 'quota', message: 'quota exceeded', statusCode: 401 },
				{ errorType: 'rate_limit', message: 'too many requests', statusCode: 429 },
			]) {
				mockSession.fire('session.error', data as SessionEventPayload<'session.error'>['data']);
			}

			assert.strictEqual(authRequiredCount, 2);
		});

		test('error event is forwarded', async () => {
			const telemetryService = new CapturingTelemetryService();
			const { session, mockSession, signals } = await createAgentSession(disposables, { telemetryService });
			session.resetTurnState('turn-1');
			mockSession.fire('session.error', {
				errorType: 'TestError',
				errorCode: 'test-code',
				message: 'something went wrong',
				stack: 'Error: something went wrong',
				statusCode: 500,
				providerCallId: 'provider-request-id',
				serviceRequestId: 'service-request-id',
			} as SessionEventPayload<'session.error'>['data'], { id: 'session-error-event', parentId: 'previous-event', agentId: 'sdk-agent-id' });

			assert.strictEqual(signals.length, 1);
			assert.ok(isAction(signals[0], ActionType.ChatError));
			if (isAction(signals[0], ActionType.ChatError)) {
				const action = signals[0].action as ChatErrorAction;
				assert.deepStrictEqual({
					error: action.part.error,
					resumable: action.part.resumable,
				}, {
					error: {
						errorType: 'TestError',
						message: 'something went wrong',
						stack: 'Error: something went wrong',
						_meta: {
							chatError: {
								fetchError: {
									type: 'failed',
									reason: 'something went wrong',
									requestId: 'provider-request-id',
									serverRequestId: 'service-request-id',
									capiError: {
										code: 'test-code',
										message: 'something went wrong',
									},
								},
							},
						},
					},
					resumable: undefined,
				});
			}
			assert.deepStrictEqual(telemetryService.events.filter(event => event.eventName === 'agentHost.copilotSdkSessionError'), [{
				eventName: 'agentHost.copilotSdkSessionError',
				data: {
					agentSessionId: 'test-session-1',
					chatSessionId: getTelemetryChatSessionId(URI.parse(buildDefaultChatUri(AgentSession.uri('copilot', 'test-session-1')))),
					turnId: 'turn-1',
					sdkSessionId: 'test-session-1',
					sdkEventId: 'session-error-event',
					sdkParentEventId: 'previous-event',
					sdkAgentId: 'sdk-agent-id',
					errorType: 'TestError',
					errorCode: 'test-code',
					statusCode: 500,
					providerCallId: 'provider-request-id',
					serviceRequestId: 'service-request-id',
					eligibleForAutoSwitch: undefined,
					msg: 'something went wrong',
					callstack: 'Error: something went wrong',
				},
			}]);
		});

		test('model call failure emits structured correlation telemetry without the restricted error message', async () => {
			const telemetryService = new CapturingTelemetryService();
			const { session, mockSession } = await createAgentSession(disposables, { telemetryService });
			session.resetTurnState('turn-1');
			mockSession.fire('model.call_failure', {
				source: 'subagent',
				failureKind: 'transport',
				transport: 'websocket',
				apiEndpoint: '/chat/completions',
				statusCode: 502,
				durationMs: 42,
				model: 'private-deployment-name',
				reasoningEffort: 'high',
				isAuto: false,
				isByok: true,
				rte: true,
				initiator: 'sub-agent',
				badRequestKind: undefined,
				errorType: 'websocket_error',
				errorCode: 'connection_reset',
				errorMessage: 'restricted provider detail',
				apiCallId: 'api-call-id',
				providerCallId: 'provider-request-id',
				serviceRequestId: 'service-request-id',
				requestFingerprint: {
					messageCount: 4,
					toolCallCount: 2,
					toolResultMessageCount: 1,
					namelessToolCallCount: 0,
					imagePartCount: 1,
					imagePartsMissingMediaType: 0,
				},
			}, { id: 'model-failure-event', parentId: 'previous-event', agentId: 'sdk-agent-id' });

			assert.deepStrictEqual(telemetryService.events.filter(event => event.eventName === 'agentHost.copilotModelCallFailure'), [{
				eventName: 'agentHost.copilotModelCallFailure',
				data: {
					agentSessionId: 'test-session-1',
					chatSessionId: getTelemetryChatSessionId(URI.parse(buildDefaultChatUri(AgentSession.uri('copilot', 'test-session-1')))),
					turnId: 'turn-1',
					sdkSessionId: 'test-session-1',
					sdkEventId: 'model-failure-event',
					sdkParentEventId: 'previous-event',
					sdkAgentId: 'sdk-agent-id',
					failureKind: 'transport',
					source: 'subagent',
					transport: 'websocket',
					apiEndpoint: 'chatCompletions',
					statusCode: 502,
					durationMs: 42,
					model: 'byokModel',
					reasoningEffort: 'high',
					isAuto: false,
					isByok: true,
					rte: true,
					badRequestKind: undefined,
					apiCallId: 'api-call-id',
					providerCallId: 'provider-request-id',
					serviceRequestId: 'service-request-id',
					messageCount: 4,
					toolCallCount: 2,
					toolResultMessageCount: 1,
					namelessToolCallCount: 0,
					imagePartCount: 1,
					imagePartsMissingMediaType: 0,
				},
			}]);
		});

		test('message delta is forwarded', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-1');
			mockSession.fire('assistant.message_delta', {
				messageId: 'msg-1',
				deltaContent: 'Hello ',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			assert.ok(signals.length >= 1);
			const hasDelta = signals.some(s => {
				if (s.kind !== 'action') { return false; }
				if (s.action.type === ActionType.ChatResponsePart) {
					const part = (s.action as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown && part.content === 'Hello ';
				}
				if (s.action.type === ActionType.ChatDelta) {
					return (s.action as ChatDeltaAction).content === 'Hello ';
				}
				return false;
			});
			assert.ok(hasDelta, 'should have forwarded the delta content');
		});

		test('complete assistant message without preceding deltas surfaces a markdown response part', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('assistant.message', {
				messageId: 'msg-2',
				content: 'Let me help you.',
				toolRequests: [{
					toolCallId: 'tc-20',
					name: 'bash',
					arguments: { command: 'ls' },
					type: 'function',
				}],
			} as SessionEventPayload<'assistant.message'>['data']);

			// The session emits a fresh markdown response part for the
			// content. Tool calls fire their own events, so
			// `toolRequests` on the assistant message are not forwarded
			// during live streaming.
			assert.ok(signals.length >= 1);
			const hasPart = signals.some(s => {
				if (s.kind !== 'action') { return false; }
				if (s.action.type === ActionType.ChatResponsePart) {
					const part = (s.action as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown && part.content === 'Let me help you.';
				}
				if (s.action.type === ActionType.ChatDelta) {
					return (s.action as ChatDeltaAction).content === 'Let me help you.';
				}
				return false;
			});
			assert.ok(hasPart, 'should have surfaced the message content');
		});

		test('history replay renders assistant tool requests when lifecycle events are missing', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			mockSession.getEvents = async () => [
				{
					type: 'user.message',
					data: { messageId: 'turn-1', content: 'inspect the workspace' },
				},
				{
					type: 'assistant.message',
					data: {
						messageId: 'msg-1',
						content: 'I will inspect the workspace.',
						toolRequests: [
							{
								toolCallId: 'tc-view',
								name: 'view',
								arguments: { path: '/workspace/file.ts' },
								type: 'function',
							},
							{
								toolCallId: 'tc-bash',
								name: 'bash',
								arguments: { command: 'npm test' },
								type: 'function',
							},
							{
								toolCallId: 'tc-intent',
								name: 'report_intent',
								arguments: { intent: 'Inspecting files' },
								type: 'function',
							},
						],
					},
				},
				{
					type: 'tool.execution_complete',
					data: {
						toolCallId: 'tc-bash',
						success: false,
						error: { message: 'tests failed' },
					},
				},
				{
					type: 'assistant.message',
					data: { messageId: 'msg-2', content: 'Done.' },
				},
			] as SessionEvent[];

			const turns = await session.getMessages();

			const actual = turns.map(turn => {
				const parts: Array<Record<string, unknown>> = [];
				for (const part of turn.responseParts) {
					switch (part.kind) {
						case ResponsePartKind.ToolCall:
							parts.push({
								kind: part.kind,
								toolCallId: part.toolCall.toolCallId,
								toolName: part.toolCall.toolName,
								status: part.toolCall.status,
								success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : undefined,
								content: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.content : undefined,
							});
							break;
						case ResponsePartKind.Markdown:
							parts.push({ kind: part.kind, content: part.content });
							break;
						default:
							parts.push({ kind: part.kind });
					}
				}
				return { message: turn.message.text, parts };
			});

			assert.deepStrictEqual(actual, [{
				message: 'inspect the workspace',
				parts: [
					{ kind: ResponsePartKind.Markdown, content: 'I will inspect the workspace.' },
					{ kind: ResponsePartKind.ToolCall, toolCallId: 'tc-view', toolName: 'view', status: ToolCallStatus.Completed, success: true, content: undefined },
					{ kind: ResponsePartKind.ToolCall, toolCallId: 'tc-bash', toolName: 'bash', status: ToolCallStatus.Completed, success: false, content: [{ type: ToolResultContentType.Text, text: 'tests failed' }] },
					{ kind: ResponsePartKind.Markdown, content: 'Done.' },
				],
			}]);
		});

		test('history replay does not duplicate assistant tool requests with lifecycle events', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			mockSession.getEvents = async () => [
				{
					type: 'user.message',
					data: { messageId: 'turn-1', content: 'run tests' },
				},
				{
					type: 'assistant.message',
					data: {
						messageId: 'msg-1',
						content: '',
						toolRequests: [{
							toolCallId: 'tc-bash',
							name: 'bash',
							arguments: { command: 'npm test' },
							type: 'function',
						}],
					},
				},
				{
					type: 'tool.execution_start',
					data: {
						toolCallId: 'tc-bash',
						toolName: 'bash',
						arguments: { command: 'npm test' },
					},
				},
				{
					type: 'tool.execution_complete',
					data: {
						toolCallId: 'tc-bash',
						success: true,
						result: { content: 'passed' },
					},
				},
				{
					type: 'assistant.message',
					data: { messageId: 'msg-2', content: 'Done.' },
				},
			] as SessionEvent[];

			const turns = await session.getMessages();
			const toolCalls = turns[0].responseParts.flatMap(part => part.kind === ResponsePartKind.ToolCall ? [part.toolCall] : []);

			assert.deepStrictEqual(toolCalls.map(toolCall => ({
				toolCallId: toolCall.toolCallId,
				toolName: toolCall.toolName,
				content: toolCall.status === ToolCallStatus.Completed ? toolCall.content : undefined,
			})), [{
				toolCallId: 'tc-bash',
				toolName: 'bash',
				content: [{ type: ToolResultContentType.Text, text: 'passed' }],
			}]);
		});

		test('subagent message delta does not suppress final parent assistant message', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-1');

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-subagent',
				toolName: 'task',
				arguments: { description: 'Explore tests', agent_type: 'explore' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			mockSession.fire('subagent.started', {
				toolCallId: 'tc-subagent',
				agentName: 'explore',
				agentDisplayName: 'Explore',
				agentDescription: 'Explore tests',
			} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

			mockSession.fire('assistant.message_delta', {
				messageId: 'msg-child',
				deltaContent: 'Subagent found the answer.',
			} as SessionEventPayload<'assistant.message_delta'>['data'], { agentId: 'agent-1' });

			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-subagent',
				success: true,
				result: { content: 'done' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			mockSession.fire('assistant.message', {
				messageId: 'msg-parent-final',
				content: 'Final parent answer.',
			} as SessionEventPayload<'assistant.message'>['data']);

			const markdownParts = signals.flatMap(signal => {
				if (signal.kind !== 'action' || signal.action.type !== ActionType.ChatResponsePart) {
					return [];
				}
				const part = (signal.action as ChatResponsePartAction).part;
				if (part.kind !== ResponsePartKind.Markdown) {
					return [];
				}
				return [{ parentToolCallId: signal.parentToolCallId, content: part.content }];
			});

			assert.deepStrictEqual(markdownParts, [
				{ parentToolCallId: 'tc-subagent', content: 'Subagent found the answer.' },
				{ parentToolCallId: undefined, content: 'Final parent answer.' },
			]);
		});

		test('reasoning delta after tool_start starts a new reasoning response part', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-1');

			// First reasoning delta — allocates a fresh reasoning response part.
			mockSession.fire('assistant.reasoning_delta', {
				deltaContent: 'thinking step 1',
			} as SessionEventPayload<'assistant.reasoning_delta'>['data']);

			// A tool call interleaves between reasoning rounds.
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-r-1',
				toolName: 'bash',
				arguments: { command: 'echo hi' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-r-1',
				success: true,
				result: { content: 'hi' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			// Second round of reasoning, after the tool call. This must
			// land in a NEW reasoning response part — otherwise the
			// renderer / state-tree would merge it into the pre-tool-call
			// block and the visual ordering would be wrong on restore.
			mockSession.fire('assistant.reasoning_delta', {
				deltaContent: 'thinking step 2',
			} as SessionEventPayload<'assistant.reasoning_delta'>['data']);

			// Pull the protocol-level reasoning response parts. Both
			// `ChatResponsePart{Reasoning}` (allocates a new part) and
			// `ChatReasoning` (appends to an existing part) translate to
			// the legacy `'reasoning'` view, so we have to inspect raw
			// signals to tell them apart.
			const reasoningResponseParts = signals.flatMap(s => {
				if (s.kind !== 'action' || s.action.type !== ActionType.ChatResponsePart) {
					return [];
				}
				return s.action.part.kind === ResponsePartKind.Reasoning ? [s.action.part] : [];
			});
			assert.strictEqual(reasoningResponseParts.length, 2,
				'reasoning after a tool call should allocate a new response part, not append to the part from before the tool call');
			assert.notStrictEqual(reasoningResponseParts[0].id, reasoningResponseParts[1].id,
				'second reasoning round should have a distinct part id');
			assert.strictEqual(reasoningResponseParts[0].content, 'thinking step 1');
			assert.strictEqual(reasoningResponseParts[1].content, 'thinking step 2');
		});

		test('subagent reasoning delta routes to the subagent session scope', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-1');

			mockSession.fire('subagent.started', {
				toolCallId: 'tc-subagent',
				agentName: 'explore',
				agentDisplayName: 'Explore',
				agentDescription: 'Explore tests',
			} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

			mockSession.fire('assistant.reasoning_delta', {
				reasoningId: 'reasoning-child',
				deltaContent: 'Subagent thinking.',
			} as SessionEventPayload<'assistant.reasoning_delta'>['data'], { agentId: 'agent-1' });

			mockSession.fire('assistant.reasoning_delta', {
				reasoningId: 'reasoning-parent',
				deltaContent: 'Parent thinking.',
			} as SessionEventPayload<'assistant.reasoning_delta'>['data']);

			const reasoningParts = signals.flatMap(signal => {
				if (signal.kind !== 'action' || signal.action.type !== ActionType.ChatResponsePart) {
					return [];
				}
				const part = (signal.action as ChatResponsePartAction).part;
				if (part.kind !== ResponsePartKind.Reasoning) {
					return [];
				}
				return [{ parentToolCallId: signal.parentToolCallId, content: part.content }];
			});

			assert.deepStrictEqual(reasoningParts, [
				{ parentToolCallId: 'tc-subagent', content: 'Subagent thinking.' },
				{ parentToolCallId: undefined, content: 'Parent thinking.' },
			]);
		});

		test('subagent tool completion routes to the subagent session scope', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-1');

			mockSession.fire('subagent.started', {
				toolCallId: 'tc-subagent',
				agentName: 'explore',
				agentDisplayName: 'Explore',
				agentDescription: 'Explore tests',
			} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-child-tool',
				toolName: 'bash',
				arguments: { command: 'echo hi' },
			} as SessionEventPayload<'tool.execution_start'>['data'], { agentId: 'agent-1' });

			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-child-tool',
				success: true,
				result: { content: 'hi' },
			} as SessionEventPayload<'tool.execution_complete'>['data'], { agentId: 'agent-1' });

			const toolCompletions = signals.flatMap(signal => {
				if (!isAction(signal, ActionType.ChatToolCallComplete)) {
					return [];
				}
				const action = signal.action as ChatToolCallCompleteAction;
				return [{ parentToolCallId: signal.parentToolCallId, toolCallId: action.toolCallId }];
			});

			assert.deepStrictEqual(toolCompletions, [
				{ parentToolCallId: 'tc-subagent', toolCallId: 'tc-child-tool' },
			]);
		});

		test('subagent skill invocation routes to the subagent session scope', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-1');

			mockSession.fire('subagent.started', {
				toolCallId: 'tc-subagent',
				agentName: 'explore',
				agentDisplayName: 'Explore',
				agentDescription: 'Explore tests',
			} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

			mockSession.fire('skill.invoked', {
				name: 'explore',
				path: '/skills/explore/SKILL.md',
			} as SessionEventPayload<'skill.invoked'>['data'], { id: 'skill-event', agentId: 'agent-1' });

			const skillActions = signals
				.filter((signal): signal is IAgentActionSignal => signal.kind === 'action')
				.filter(signal =>
					signal.action.type === ActionType.ChatToolCallStart
					|| signal.action.type === ActionType.ChatToolCallReady
					|| signal.action.type === ActionType.ChatToolCallComplete
				)
				.map(signal => ({ parentToolCallId: signal.parentToolCallId, action: signal.action }));

			assert.deepStrictEqual(skillActions, [
				{
					parentToolCallId: 'tc-subagent',
					action: {
						type: ActionType.ChatToolCallStart,
						turnId: 'turn-1',
						toolCallId: 'synth-skill-skill-event',
						toolName: 'skill',
						displayName: 'Read Skill',
					},
				},
				{
					parentToolCallId: 'tc-subagent',
					action: {
						type: ActionType.ChatToolCallReady,
						turnId: 'turn-1',
						toolCallId: 'synth-skill-skill-event',
						invocationMessage: { markdown: 'Read skill [explore](file:///skills/explore/SKILL.md)' },
						confirmed: ToolCallConfirmationReason.NotNeeded,
					},
				},
				{
					parentToolCallId: 'tc-subagent',
					action: {
						type: ActionType.ChatToolCallComplete,
						turnId: 'turn-1',
						toolCallId: 'synth-skill-skill-event',
						result: {
							success: true,
							pastTenseMessage: { markdown: 'Read skill [explore](file:///skills/explore/SKILL.md)' },
						},
					},
				},
			]);
		});

		test('history replay seeds turn id from the SDK envelope id, matching `turns.event_id`', async () => {
			// Regression test: fork / truncate look up the SDK boundary
			// event id via `getNextTurnEventId(turnId)`, which keys on
			// either `turns.id` (live `request_xxx`) or `turns.event_id`
			// (SDK envelope id). For sessions restored from disk we want
			// the restored turn id to be the SDK envelope id so that
			// lookup succeeds without translation.
			const { session, mockSession } = await createAgentSession(disposables);
			mockSession.getEvents = async () => [
				{
					type: 'user.message',
					id: 'sdk-evt-user-1',
					data: { interactionId: 'capi-interaction-1', content: 'first prompt' },
				},
				{
					type: 'assistant.message',
					id: 'sdk-evt-asst-1',
					data: { messageId: 'sdk-msg-1', content: 'first response.' },
				},
				{
					type: 'user.message',
					id: 'sdk-evt-user-2',
					data: { interactionId: 'capi-interaction-2', content: 'second prompt' },
				},
				{
					type: 'assistant.message',
					id: 'sdk-evt-asst-2',
					data: { messageId: 'sdk-msg-2', content: 'second response.' },
				},
			] as SessionEvent[];

			const turns = await session.getMessages();
			assert.deepStrictEqual(
				turns.map(t => ({ id: t.id, text: t.message.text })),
				[
					{ id: 'sdk-evt-user-1', text: 'first prompt' },
					{ id: 'sdk-evt-user-2', text: 'second prompt' },
				],
			);
		});
	});

	suite('getForkBoundaryEventId', () => {
		test('resolves when the matching user message event arrives', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			session.resetTurnState('turn-waiting');

			const eventIdPromise = session.getForkBoundaryEventId('previous-turn');
			mockSession.fire('user.message', { content: 'hello agent' } as SessionEventPayload<'user.message'>['data'], { id: 'sdk-event-waiting' });
			await timeout(0);

			assert.deepStrictEqual(await eventIdPromise, 'sdk-event-waiting');
		});

		test('resolves from a user message event recorded before waiting', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			session.resetTurnState('turn-recorded');
			mockSession.fire('user.message', { content: 'hello agent' } as SessionEventPayload<'user.message'>['data'], { id: 'sdk-event-recorded' });
			await timeout(0);

			assert.deepStrictEqual(await session.getForkBoundaryEventId('previous-turn'), 'sdk-event-recorded');
		});

		test('rejects when the turn ends before its user message event arrives', async () => {
			const { session } = await createAgentSession(disposables);
			session.resetTurnState('turn-ended');

			const eventIdPromise = session.getForkBoundaryEventId('previous-turn');
			session.discardActiveTurn();

			await assert.rejects(eventIdPromise, /its next turn \(turn-ended\) never produced an SDK event id: Turn turn-ended was disposed before its SDK event id was recorded/);
		});

		test('retains the active turn event promise when session.idle clears it during the database read', async () => {
			const databaseRead = new DeferredPromise<string | undefined>();
			const sessionDatabase = new TestSessionDatabase();
			sessionDatabase.getNextTurnEventId = () => databaseRead.p;
			const { session, mockSession } = await createAgentSession(disposables, { sessionDatabase });
			session.resetTurnState('turn-ended-during-read');

			const eventIdPromise = session.getForkBoundaryEventId('previous-turn');
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);
			await timeout(0);
			databaseRead.complete(undefined);

			await assert.rejects(eventIdPromise, /its next turn \(turn-ended-during-read\) never produced an SDK event id/);
		});

		test('rejects pending waiters when the session is disposed', async () => {
			const { session } = await createAgentSession(disposables);
			session.resetTurnState('turn-disposed');

			const eventIdPromise = session.getForkBoundaryEventId('previous-turn');
			session.dispose();

			await assert.rejects(eventIdPromise, /its next turn \(turn-disposed\) never produced an SDK event id: Turn turn-disposed was disposed before its SDK event id was recorded/);
		});
	});

	// ---- user input handling ----

	suite('user input handling', () => {

		test('handleUserInputRequest fires user_input_request progress event', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-input');

			// Start the request (don't await — it blocks waiting for response)
			const resultPromise = runtime.handleUserInputRequest(
				{ question: 'What is your name?' },
				{ sessionId: 'test-session-1' }
			);

			// Verify signal was fired
			assert.strictEqual(signals.length, 1);
			const request = getInputRequest(signals[0]);
			const requestId = request.id;
			assert.strictEqual(readChatInputRequestPurpose(request), ChatInputRequestPurpose.AskUser);
			assert.ok(request.questions);
			assert.strictEqual(request.questions[0].message, 'What is your name?');
			const questionId = request.questions[0].id;

			// Respond to unblock the promise
			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Text, value: 'Alice' }
				}
			});

			const result = await resultPromise;
			assert.strictEqual(result.answer, 'Alice');
			assert.strictEqual(result.wasFreeform, true);
		});

		test('handleUserInputRequest with choices generates SingleSelect question', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-input');

			const resultPromise = runtime.handleUserInputRequest(
				{ question: 'Pick a color', choices: ['red', 'blue', 'green'] },
				{ sessionId: 'test-session-1' }
			);

			assert.strictEqual(signals.length, 1);
			const request = getInputRequest(signals[0]);
			assert.ok(request.questions);
			assert.strictEqual(request.questions.length, 1);
			assert.strictEqual(request.questions[0].kind, ChatInputQuestionKind.SingleSelect);
			if (request.questions[0].kind === ChatInputQuestionKind.SingleSelect) {
				assert.strictEqual(request.questions[0].options.length, 3);
				assert.strictEqual(request.questions[0].options[0].label, 'red');
			}

			// Respond with a selected choice
			const questions = request.questions;
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept, {
				[questions[0].id]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'blue' }
				}
			});

			const result = await resultPromise;
			assert.strictEqual(result.answer, 'blue');
			assert.strictEqual(result.wasFreeform, false);
		});

		test('handleUserInputRequest returns empty answer on cancel', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-input');

			const resultPromise = runtime.handleUserInputRequest(
				{ question: 'Cancel me' },
				{ sessionId: 'test-session-1' }
			);

			const request = getInputRequest(signals[0]);
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Cancel);

			const result = await resultPromise;
			assert.strictEqual(result.answer, '');
			assert.strictEqual(result.wasFreeform, true);
		});

		test('respondToUserInputRequest returns false for unknown id', async () => {
			const { session } = await createAgentSession(disposables);
			assert.strictEqual(session.respondToUserInputRequest('unknown-id', ChatInputResponseKind.Accept), false);
		});

		test('handleUserInputRequest returns empty answer on skipped question', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-input');

			const resultPromise = runtime.handleUserInputRequest(
				{ question: 'Skip me' },
				{ sessionId: 'test-session-1' }
			);

			const request = getInputRequest(signals[0]);
			const questionId = request.questions![0].id;
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Skipped,
				}
			});

			const result = await resultPromise;
			assert.strictEqual(result.answer, '');
			assert.strictEqual(result.wasFreeform, true);
		});

		test('pending user inputs are cancelled on dispose', async () => {
			const { session, runtime } = await createAgentSession(disposables);
			session.resetTurnState('turn-input');

			const resultPromise = runtime.handleUserInputRequest(
				{ question: 'Will be cancelled' },
				{ sessionId: 'test-session-1' }
			);

			session.dispose();
			const result = await resultPromise;
			assert.strictEqual(result.answer, '');
			assert.strictEqual(result.wasFreeform, true);
		});

		test('handleUserInputRequest rejects without an active turn', async () => {
			const { runtime, signals } = await createAgentSession(disposables);

			const result = await runtime.handleUserInputRequest(
				{ question: 'Cannot be displayed' },
				{ sessionId: 'test-session-1' },
			);

			assert.deepStrictEqual({ result, signals }, {
				result: { answer: 'No active turn', wasFreeform: true },
				signals: [],
			});
		});

		test('autopilot auto-answers a free-form question and records it in history', async () => {
			const { runtime, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.Mode]: 'autopilot' },
			});

			const result = await runtime.handleUserInputRequest(
				{ question: 'Pick a color', choices: ['red', 'blue', 'green'] },
				{ sessionId: 'test-session-1' }
			);

			// `wasFreeform: false` because we picked one of the SDK's
			// offered choices — the SDK uses this hint to record whether
			// the user typed something custom.
			assert.strictEqual(result.answer, 'The user is not available to answer your question. Choose a pragmatic option best aligned with the context of the request.');
			assert.strictEqual(result.wasFreeform, true);
			assert.deepStrictEqual(getActions(signals).map(action => action.type), [
				ActionType.ChatInputRequested,
				ActionType.ChatInputCompleted,
			]);
			const requested = getActions(signals)[0];
			assert.strictEqual(requested.type === ActionType.ChatInputRequested ? readChatInputRequestPurpose(requested.request) : undefined, undefined);
			const completed = getActions(signals)[1];
			assert.deepStrictEqual(completed.type === ActionType.ChatInputCompleted ? Object.values(completed.answers ?? {}) : [], [{
				state: ChatInputAnswerState.Submitted,
				value: {
					kind: ChatInputAnswerValueKind.Text,
					value: result.answer,
				},
			}]);
		});

		test('autopilot does not auto-answer when mode is not "autopilot"', async () => {
			// Sanity check: with mode=interactive the question must
			// still be surfaced as a progress event (the existing behavior).
			const { session, runtime, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.Mode]: 'interactive' },
			});
			session.resetTurnState('turn-input');

			runtime.handleUserInputRequest(
				{ question: 'Need user input' },
				{ sessionId: 'test-session-1' }
			);

			// Microtask flush so the handler can run far enough to either
			// short-circuit or emit a progress event.
			await Promise.resolve();
			assert.strictEqual(signals.length, 1);
			assert.ok(isAction(signals[0], ActionType.ChatInputRequested));
		});

		test('auto-reply auto-answers a question and records it in history', async () => {
			// `chat.autoReply` is forwarded as the autoReplyEnabled root config.
			// Even in interactive mode it must short-circuit like autopilot.
			const { runtime, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.Mode]: 'interactive' },
				rootValues: { [AgentHostAutoReplyEnabledConfigKey]: true },
			});

			const result = await runtime.handleUserInputRequest(
				{ question: 'Pick a color', choices: ['red', 'blue', 'green'] },
				{ sessionId: 'test-session-1' }
			);

			assert.strictEqual(result.answer, 'The user is not available to answer your question. Choose a pragmatic option best aligned with the context of the request.');
			assert.strictEqual(result.wasFreeform, true);
			assert.deepStrictEqual(getActions(signals).map(action => action.type), [
				ActionType.ChatInputRequested,
				ActionType.ChatInputCompleted,
			]);
			const requested = getActions(signals)[0];
			assert.strictEqual(requested.type === ActionType.ChatInputRequested ? readChatInputRequestPurpose(requested.request) : undefined, undefined);
			const completed = getActions(signals)[1];
			assert.deepStrictEqual(completed.type === ActionType.ChatInputCompleted ? Object.values(completed.answers ?? {}) : [], [{
				state: ChatInputAnswerState.Submitted,
				value: {
					kind: ChatInputAnswerValueKind.Text,
					value: result.answer,
				},
			}]);
		});
	});

	// ---- elicitation handling ----

	suite('elicitation handling', () => {

		test('form-mode request projects schema fields to questions and accept round-trips content', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-elicitation');

			const resultPromise = runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Configure deployment',
				mode: 'form',
				requestedSchema: {
					type: 'object',
					properties: {
						environment: { type: 'string', enum: ['dev', 'prod'], enumNames: ['Development', 'Production'] },
						replicas: { type: 'integer', minimum: 1, maximum: 10, default: 3 },
						confirm: { type: 'boolean', default: false },
						region: { type: 'string', minLength: 2, default: 'us-west-2' },
						tags: { type: 'array', items: { type: 'string', enum: ['a', 'b', 'c'] } },
					},
					required: ['environment', 'confirm'],
				},
			});

			assert.strictEqual(signals.length, 1);
			const request = getInputRequest(signals[0]);
			assert.strictEqual(readChatInputRequestPurpose(request), ChatInputRequestPurpose.Elicitation);
			assert.strictEqual(request.message, 'Configure deployment');
			assert.ok(request.questions);
			assert.deepStrictEqual(request.questions.map(q => ({ id: q.id, kind: q.kind, required: q.required })), [
				{ id: 'environment', kind: ChatInputQuestionKind.SingleSelect, required: true },
				{ id: 'replicas', kind: ChatInputQuestionKind.Integer, required: false },
				{ id: 'confirm', kind: ChatInputQuestionKind.Boolean, required: true },
				{ id: 'region', kind: ChatInputQuestionKind.Text, required: false },
				{ id: 'tags', kind: ChatInputQuestionKind.MultiSelect, required: false },
			]);
			const envQuestion = request.questions[0];
			assert.strictEqual(envQuestion.kind, ChatInputQuestionKind.SingleSelect);
			if (envQuestion.kind === ChatInputQuestionKind.SingleSelect) {
				assert.deepStrictEqual(envQuestion.options, [
					{ id: 'dev', label: 'Development' },
					{ id: 'prod', label: 'Production' },
				]);
			}

			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept, {
				environment: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: 'prod' } },
				replicas: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Number, value: 5 } },
				confirm: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Boolean, value: true } },
				region: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'eu-west-1' } },
				tags: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ['a', 'c'] } },
			});

			assert.deepStrictEqual(await resultPromise, {
				action: 'accept',
				content: {
					environment: 'prod',
					replicas: 5,
					confirm: true,
					region: 'eu-west-1',
					tags: ['a', 'c'],
				},
			});
		});

		test('skipped and missing answers are omitted from accept content', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-elicitation');

			const resultPromise = runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Partial form',
				mode: 'form',
				requestedSchema: {
					type: 'object',
					properties: {
						name: { type: 'string' },
						count: { type: 'integer' },
					},
				},
			});

			const request = getInputRequest(signals[0]);
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept, {
				name: { state: ChatInputAnswerState.Skipped },
				// `count` is missing entirely
			});

			assert.deepStrictEqual(await resultPromise, { action: 'accept', content: {} });
		});

		test('url-mode request surfaces url and accept returns no content', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-elicitation');

			const resultPromise = runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Open this link',
				mode: 'url',
				url: 'https://example.com/auth',
			});

			const request = getInputRequest(signals[0]);
			assert.strictEqual(request.url, 'https://example.com/auth');
			assert.strictEqual(request.questions, undefined);

			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept);
			assert.deepStrictEqual(await resultPromise, { action: 'accept' });
		});

		test('free-form request (no schema) returns submitted text as content.answer', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-elicitation');

			const resultPromise = runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'What is your favorite color?',
				mode: 'form',
				// No requestedSchema — the workbench fallback renders a single text question.
			});

			const request = getInputRequest(signals[0]);
			assert.strictEqual(request.questions, undefined);

			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept, {
				answer: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'teal' } },
			});

			assert.deepStrictEqual(await resultPromise, { action: 'accept', content: { answer: 'teal' } });
		});

		test('decline response maps to action=decline', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-elicitation');

			const resultPromise = runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Please confirm',
				mode: 'form',
				requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
			});

			const request = getInputRequest(signals[0]);
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Decline);
			assert.deepStrictEqual(await resultPromise, { action: 'decline' });
		});

		test('cancel response maps to action=cancel', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-elicitation');

			const resultPromise = runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Please confirm',
				mode: 'form',
				requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
			});

			const request = getInputRequest(signals[0]);
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Cancel);
			assert.deepStrictEqual(await resultPromise, { action: 'cancel' });
		});

		test('autopilot auto-cancels without firing a progress event', async () => {
			const { runtime, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.Mode]: 'autopilot' },
			});

			const result = await runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Need input',
				mode: 'form',
				requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
			});

			assert.deepStrictEqual(result, { action: 'cancel' });
			assert.strictEqual(signals.length, 0);
		});

		test('pending elicitations are cancelled on dispose', async () => {
			const { session, runtime } = await createAgentSession(disposables);
			session.resetTurnState('turn-elicitation');

			const resultPromise = runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Will be cancelled',
				mode: 'form',
				requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
			});

			session.dispose();
			assert.deepStrictEqual(await resultPromise, { action: 'cancel' });
		});

		test('elicitation rejects without an active turn', async () => {
			const { runtime, signals } = await createAgentSession(disposables);

			const result = await runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Cannot be displayed',
				mode: 'form',
				requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
			});

			assert.deepStrictEqual({ result, signals }, {
				result: { action: 'decline' },
				signals: [],
			});
		});
	});

	suite('SDK callback logging', () => {

		test('logs and rethrows user input callback failures', async () => {
			const logService = new CapturingLogService();
			const { session, runtime } = await createAgentSession(disposables, { logService });
			session.resetTurnState('turn-input');
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			sessionInternals._onDidSessionProgress.fire = () => {
				throw new Error('user input boom');
			};

			await assert.rejects(
				runtime.handleUserInputRequest(
					{ question: 'Need input' },
					{ sessionId: 'test-session-1' },
				),
				/user input boom/,
			);

			assert.strictEqual(logService.errors.length, 1);
			const [entry] = logService.errors;
			assert.ok(entry.first instanceof Error);
			assert.strictEqual((entry.first as Error).message, 'user input boom');
			assert.strictEqual(entry.args[0], '[Copilot:test-session-1] Failed to handle user input request: question="Need input"');
		});

		test('logs and rethrows onPreToolUse failures', async () => {
			const logService = new CapturingLogService();
			const capturedRuntime: { current?: ICopilotSessionRuntime } = {};
			const { session } = await createAgentSession(disposables, { logService, captureRuntime: capturedRuntime });
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			sessionInternals._editTracker.trackEditStart = async () => {
				throw new Error('pre tool boom');
			};

			await assert.rejects(
				capturedRuntime.current!.handlePreToolUse({
					sessionId: 'test-session-1',
					timestamp: new Date(0),
					workingDirectory: '/tmp',
					toolName: 'edit',
					toolArgs: { path: '/tmp/file.ts' },
				}),
				/pre tool boom/,
			);

			assert.strictEqual(logService.errors.length, 1);
			const [entry] = logService.errors;
			assert.ok(entry.first instanceof Error);
			assert.strictEqual((entry.first as Error).message, 'pre tool boom');
			assert.strictEqual(entry.args[0], '[Copilot:test-session-1] Failed in onPreToolUse: tool=edit');
		});

		test('logs and rethrows onPostToolUse failures', async () => {
			const logService = new CapturingLogService();
			const capturedRuntime: { current?: ICopilotSessionRuntime } = {};
			const { session } = await createAgentSession(disposables, { logService, captureRuntime: capturedRuntime });
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			sessionInternals._editTracker.completeEdit = async () => {
				throw new Error('post tool boom');
			};

			await assert.rejects(
				capturedRuntime.current!.handlePostToolUse({
					sessionId: 'test-session-1',
					timestamp: new Date(0),
					workingDirectory: '/tmp',
					toolName: 'edit',
					toolArgs: { path: '/tmp/file.ts' },
					toolResult: { textResultForLlm: '', resultType: 'success' },
				}),
				/post tool boom/,
			);

			assert.strictEqual(logService.errors.length, 1);
			const [entry] = logService.errors;
			assert.ok(entry.first instanceof Error);
			assert.strictEqual((entry.first as Error).message, 'post tool boom');
			assert.strictEqual(entry.args[0], '[Copilot:test-session-1] Failed in onPostToolUse: tool=edit');
		});
	});

	// ---- client tool calls ----

	suite('client tool calls', () => {

		const snapshot: IActiveClientSnapshot = {
			tools: [{
				name: 'my_tool',
				description: 'A test tool',
				inputSchema: { type: 'object', properties: {} },
			}],
			plugins: [],
			mcpServers: {},
		};

		/** Builds a live ActiveClientToolSet seeded with the given owning clientId and the snapshot's tools. */
		const activeClientToolSetWith = (clientId: string): ActiveClientToolSet => {
			const toolSet = new ActiveClientToolSet();
			toolSet.set(clientId, snapshot.tools);
			return toolSet;
		};

		test('semantic search overrides the built-in tool and is never deferred', async () => {
			const semanticSearchSnapshot: IActiveClientSnapshot = {
				tools: [{
					name: SEMANTIC_SEARCH_TOOL_NAME,
					description: 'Semantically searches the workspace',
					inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
				}],
				plugins: [],
				mcpServers: {},
			};
			const { runtime } = await createAgentSession(disposables, { clientSnapshot: semanticSearchSnapshot });
			const [tool] = runtime.createClientSdkTools(true);

			assert.deepStrictEqual({
				name: tool.name,
				defer: tool.defer,
				overridesBuiltInTool: tool.overridesBuiltInTool,
				skipPermission: tool.skipPermission,
			}, {
				name: SEMANTIC_SEARCH_TOOL_NAME,
				defer: 'never',
				overridesBuiltInTool: true,
				skipPermission: true,
			});
		});

		test('semantic search becomes ready without an SDK permission callback', async () => {
			const semanticSearchSnapshot: IActiveClientSnapshot = {
				tools: [{
					name: SEMANTIC_SEARCH_TOOL_NAME,
					description: 'Semantically searches the workspace',
					inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
				}],
				plugins: [],
				mcpServers: {},
			};
			const activeClientToolSet = new ActiveClientToolSet();
			activeClientToolSet.set('test-client', semanticSearchSnapshot.tools);
			const { session, runtime, mockSession, signals } = await createAgentSession(disposables, {
				clientSnapshot: semanticSearchSnapshot,
				activeClientToolSet,
			});

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-semantic-search',
				toolName: SEMANTIC_SEARCH_TOOL_NAME,
				arguments: { query: 'tool routing' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const readySignal = signals.find(s => isAction(s, ActionType.ChatToolCallReady));
			assert.ok(readySignal && isAction(readySignal, ActionType.ChatToolCallReady));
			const readyAction = readySignal.action as ChatToolCallReadyAction;
			assert.deepStrictEqual({
				contributor: readyAction.contributor,
				confirmed: readyAction.confirmed,
			}, {
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'test-client' },
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			const handlerPromise = invokeClientToolHandler(runtime.createClientSdkTools()[0], 'tc-semantic-search', { query: 'tool routing' });
			session.handleClientToolCallComplete('tc-semantic-search', {
				success: true,
				pastTenseMessage: 'Searched codebase',
				content: [{ type: ToolResultContentType.Text, text: 'result text' }],
			});
			assert.strictEqual((await handlerPromise).textResultForLlm, 'result text');
		});

		test('client tool started with no connected client fails immediately', async () => {
			// No activeClientState is provided, so the session seeds one with
			// an undefined clientId — i.e. no client is connected to run the tool.
			const { runtime, mockSession, signals } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-no-client',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start is stamped as a client contributor with no owner...
			const startSignal = signals.find(s => isAction(s, ActionType.ChatToolCallStart));
			assert.ok(startSignal && isAction(startSignal, ActionType.ChatToolCallStart));
			assert.deepStrictEqual((startSignal.action as ChatToolCallStartAction).contributor, undefined);

			// ...and is failed immediately (ready + complete) rather than left
			// pending for the server-side disconnect timeout.
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.ChatToolCallReady)).length, 1);
			const completeSignal = signals.find(s => isAction(s, ActionType.ChatToolCallComplete));
			assert.ok(completeSignal && isAction(completeSignal, ActionType.ChatToolCallComplete));
			assert.strictEqual((completeSignal.action as ChatToolCallCompleteAction).result.success, false);

			// When the SDK invokes the handler it resolves immediately with the
			// buffered failure result.
			const tools = runtime.createClientSdkTools();
			const result = await invokeClientToolHandler(tools[0], 'tc-no-client');
			assert.strictEqual(result.resultType, 'failure');
		});

		test('client tool handler waits for completion without emitting tool_ready', async () => {

			const { session, runtime, mockSession, signals } = await createAgentSession(disposables, { clientSnapshot: snapshot, activeClientToolSet: activeClientToolSetWith('test-client') });

			// SDK emits tool.execution_start — tool_start fires immediately
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-client-1',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start fires immediately (client tools don't auto-ready)
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.ChatToolCallStart)).length, 1);
			const startSignal = signals.find(s => isAction(s, ActionType.ChatToolCallStart));
			assert.ok(startSignal && isAction(startSignal, ActionType.ChatToolCallStart));
			if (isAction(startSignal!, ActionType.ChatToolCallStart)) {
				assert.deepStrictEqual((startSignal.action as ChatToolCallStartAction).contributor, { kind: ToolCallContributorKind.Client, clientId: 'test-client' });
			}

			// SDK invokes the handler — it creates a deferred and waits,
			// but does NOT fire tool_ready (that comes from the permission flow).
			const tools = runtime.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-client-1', { file: 'test.ts' });

			// No pending_confirmation or tool_ready should have been emitted by the handler
			assert.strictEqual(signals.filter(s => s.kind === 'pending_confirmation' || isAction(s, ActionType.ChatToolCallReady)).length, 0);

			// Complete the tool call
			session.handleClientToolCallComplete('tc-client-1', {
				success: true,
				pastTenseMessage: 'did it',
				content: [{ type: ToolResultContentType.Text, text: 'result text' }],
			});

			const result = await handlerPromise;
			assert.strictEqual(result.resultType, 'success');
			assert.strictEqual(result.textResultForLlm, 'result text');
		});

		test('client tool auto-readies when SDK allow-all mode is on', async () => {
			const { session, runtime, mockSession, signals } = await createAgentSession(disposables, {
				clientSnapshot: snapshot,
				activeClientToolSet: activeClientToolSetWith('test-client'),
				configValues: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
			});
			await session.syncPermissionMode('turn-start');

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-allow-all',
				toolName: 'my_tool',
				arguments: { file: 'test.ts' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const readySignal = signals.find(s => isAction(s, ActionType.ChatToolCallReady));
			assert.ok(readySignal && isAction(readySignal, ActionType.ChatToolCallReady));
			const readyAction = readySignal.action as ChatToolCallReadyAction;
			const readyToolInput = getInlineToolInput(readyAction.toolInput);
			assert.deepStrictEqual({
				permissionModeSetCalls: mockSession.permissionModeSetCalls,
				toolCallId: readyAction.toolCallId,
				toolInput: readyToolInput === undefined ? undefined : JSON.parse(readyToolInput),
				confirmed: readyAction.confirmed,
				autoApproveBySetting: readToolCallMeta(readyAction).autoApproveBySetting,
			}, {
				permissionModeSetCalls: ['allow-all'],
				toolCallId: 'tc-allow-all',
				toolInput: { file: 'test.ts' },
				confirmed: ToolCallConfirmationReason.NotNeeded,
				autoApproveBySetting: true,
			});

			const handlerPromise = invokeClientToolHandler(runtime.createClientSdkTools()[0], 'tc-allow-all', { file: 'test.ts' });
			session.handleClientToolCallComplete('tc-allow-all', {
				success: true,
				pastTenseMessage: 'did it',
				content: [{ type: ToolResultContentType.Text, text: 'result text' }],
			});
			assert.strictEqual((await handlerPromise).textResultForLlm, 'result text');
		});

		test('SDK-approved client tool auto-readies in assisted mode', async () => {
			const { session, runtime, mockSession, signals } = await createAgentSession(disposables, {
				clientSnapshot: snapshot,
				activeClientToolSet: activeClientToolSetWith('test-client'),
				configValues: { [SessionConfigKey.AutoApprove]: 'assisted' },
			});
			await session.syncPermissionMode('turn-start');

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-assisted',
				toolName: 'my_tool',
				arguments: { file: 'test.ts' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			mockSession.fire('permission.requested', {
				requestId: 'permission-assisted',
				permissionRequest: {
					kind: 'custom-tool',
					toolCallId: 'tc-assisted',
					toolName: 'my_tool',
				},
				promptRequest: {
					kind: 'custom-tool',
					toolCallId: 'tc-assisted',
					toolName: 'my_tool',
					assistedApproval: {
						recommendation: 'approve',
						reason: 'The requested browser navigation is safe.',
					},
				},
			} as SessionEventPayload<'permission.requested'>['data']);
			const permissionResult = await runtime.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-assisted',
				toolName: 'my_tool',
			});
			const readySignal = signals.find((s): s is IAgentToolPendingConfirmationSignal => s.kind === 'pending_confirmation');
			const readyState = readySignal?.state;
			const readyToolInput = getInlineToolInput(readyState?.toolInput);

			assert.deepStrictEqual({
				permissionModeSetCalls: mockSession.permissionModeSetCalls,
				permissionResult,
				ready: readyState ? {
					...readyState,
					toolInput: readyToolInput === undefined ? undefined : JSON.parse(readyToolInput),
				} : undefined,
			}, {
				permissionModeSetCalls: ['assisted'],
				permissionResult: { kind: 'approve-once' },
				ready: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-assisted',
					toolName: 'my_tool',
					displayName: 'my_tool',
					invocationMessage: 'my_tool',
					toolInput: { file: 'test.ts' },
					riskAssessment: {
						kind: ToolCallRiskAssessmentKind.Judge,
						status: ToolCallRiskAssessmentStatus.Complete,
						reason: 'The requested browser navigation is safe.',
						safety: 1,
					},
				},
			});
		});

		async function createToolSearchSession(autoApprove: boolean) {
			const toolSearchSnapshot: IActiveClientSnapshot = {
				tools: [{ name: 'toolSearch', description: 'Search tools', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } }],
				plugins: [],
				mcpServers: {},
			};
			const activeClientToolSet = new ActiveClientToolSet();
			activeClientToolSet.set('tool-search-client', toolSearchSnapshot.tools);
			const created = await createAgentSession(disposables, {
				clientSnapshot: toolSearchSnapshot,
				activeClientToolSet,
				modelId: 'claude-opus-4.8',
				...(autoApprove ? { configValues: { [SessionConfigKey.AutoApprove]: 'autoApprove' } } : {}),
				rootValues: { [CopilotCliConfigKey.ToolSearchEnabled]: true },
			});
			if (autoApprove) {
				await created.session.syncPermissionMode('turn-start');
			}
			return created;
		}

		async function runToolSearch(clientResultText: string, availableTools: CurrentToolMetadata[], query = 'search tools', success = true): Promise<ToolResultObject> {
			const { session, runtime, mockSession } = await createToolSearchSession(false);
			const [override] = runtime.createClientSdkTools(true);
			const toolCallId = 'tc-tool-search-result';
			const args = query ? { query } : {};

			mockSession.fire('tool.execution_start', {
				toolCallId,
				toolName: 'tool_search_tool',
				arguments: args,
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const handlerPromise = invokeClientToolHandler(override, toolCallId, args, availableTools);
			session.handleClientToolCallComplete(toolCallId, {
				success,
				pastTenseMessage: 'Searched tools',
				content: [{ type: ToolResultContentType.Text, text: clientResultText }],
				...(success ? {} : { error: { message: 'Tool search failed' } }),
			});
			return handlerPromise;
		}

		test('tool-search override routes to the client and injects deferred candidates', async () => {
			const { session, runtime, mockSession, signals, waitForSignal } = await createToolSearchSession(false);

			const [override] = runtime.createClientSdkTools(true);
			assert.strictEqual(override.name, 'tool_search_tool');
			assert.strictEqual(override.overridesBuiltInTool, true);
			assert.strictEqual(override.defer, 'never');
			assert.strictEqual(override.skipPermission, true);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-tool-search',
				toolName: 'tool_search_tool',
				arguments: { query: 'add numbers' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const start = signals.find(s => isAction(s, ActionType.ChatToolCallStart));
			assert.ok(start && isAction(start, ActionType.ChatToolCallStart));
			assert.deepStrictEqual((start.action as ChatToolCallStartAction).contributor, { kind: ToolCallContributorKind.Client, clientId: 'tool-search-client' });
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.ChatToolCallReady)).length, 0);

			const handlerPromise = invokeClientToolHandler(override, 'tc-tool-search', { query: 'add numbers' }, [
				{ name: 'everything-get-sum', description: 'Adds numbers', deferLoading: true },
				{ name: 'read_file', description: 'Reads a file', deferLoading: false },
			]);

			const readySignal = await waitForSignal(s => isAction(s, ActionType.ChatToolCallReady));
			assert.ok(isAction(readySignal, ActionType.ChatToolCallReady));
			const ready = readySignal.action as ChatToolCallReadyAction;
			assert.deepStrictEqual({
				readyCount: signals.filter(s => isAction(s, ActionType.ChatToolCallReady)).length,
				confirmed: ready.confirmed,
				meta: ready._meta,
			}, {
				readyCount: 1,
				confirmed: ToolCallConfirmationReason.NotNeeded,
				meta: {
					toolSearchCandidates: [{ name: 'everything-get-sum', description: 'Adds numbers' }],
				},
			});

			session.handleClientToolCallComplete('tc-tool-search', {
				success: true,
				pastTenseMessage: 'Searched tools',
				content: [{ type: ToolResultContentType.Text, text: '["everything-get-sum"]' }],
			});

			const result = await handlerPromise;
			assert.strictEqual(result.resultType, 'success');
			assert.deepStrictEqual({
				textResultForLlm: result.textResultForLlm,
				toolReferences: result.toolReferences,
			}, {
				textResultForLlm: '["everything-get-sum"]',
				toolReferences: ['everything-get-sum'],
			});
		});

		test('tool-search override aligns model-visible names with runtime references', async () => {
			const cases: { clientResultText: string; availableTools: CurrentToolMetadata[]; expected: string[] }[] = [
				{
					clientResultText: '["github-pull-request_create_pull_request","github-pull-request_doSearch"]',
					availableTools: [
						{ name: 'create_pull_request', description: 'Create a pull request', deferLoading: true },
						{ name: 'doSearch', description: 'Search GitHub', deferLoading: true },
					],
					expected: [],
				},
				{
					clientResultText: '["github-pull-request/create_pull_request","github-pull-request/create_pull_request"]',
					availableTools: [
						{ name: 'create_pull_request', namespacedName: 'github-pull-request/create_pull_request', description: 'Create a pull request', deferLoading: true },
					],
					expected: ['create_pull_request'],
				},
			];

			const results = [];
			for (const testCase of cases) {
				const result = await runToolSearch(testCase.clientResultText, testCase.availableTools);
				results.push({
					textResultForLlm: result.textResultForLlm,
					toolReferences: result.toolReferences,
				});
			}
			assert.deepStrictEqual(results, cases.map(testCase => ({
				textResultForLlm: JSON.stringify(testCase.expected),
				toolReferences: testCase.expected,
			})));
		});

		test('tool-search override preserves non-list client result text', async () => {
			const texts = ['Error: query parameter is required', '"create_pull_request"'];
			const results = [];
			for (const text of texts) {
				const result = await runToolSearch(text, [], '');
				results.push({
					textResultForLlm: result.textResultForLlm,
					toolReferences: result.toolReferences,
				});
			}
			assert.deepStrictEqual(results, texts.map(text => ({
				textResultForLlm: text,
				toolReferences: [],
			})));
		});

		test('tool-search override preserves failed client result text', async () => {
			const result = await runToolSearch(
				'["github-pull-request/create_pull_request"]',
				[{ name: 'create_pull_request', namespacedName: 'github-pull-request/create_pull_request', description: 'Create a pull request', deferLoading: true }],
				'create pull request',
				false,
			);
			assert.deepStrictEqual({
				resultType: result.resultType,
				textResultForLlm: result.textResultForLlm,
				toolReferences: result.toolReferences,
			}, {
				resultType: 'failure',
				textResultForLlm: '["github-pull-request/create_pull_request"]',
				toolReferences: ['create_pull_request'],
			});
		});

		test('auto-approved tool search defers its only ready until candidates are available', async () => {
			const { session, runtime, mockSession, signals, waitForSignal } = await createToolSearchSession(true);
			const [override] = runtime.createClientSdkTools(true);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-tool-search',
				toolName: 'tool_search_tool',
				arguments: { query: 'add numbers' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.ChatToolCallReady)).length, 0);

			const handlerPromise = invokeClientToolHandler(override, 'tc-tool-search', { query: 'add numbers' }, [
				{ name: 'everything-get-sum', description: 'Adds numbers', deferLoading: true },
			]);

			const readySignal = await waitForSignal(s => isAction(s, ActionType.ChatToolCallReady));
			assert.ok(isAction(readySignal, ActionType.ChatToolCallReady));
			const ready = readySignal.action as ChatToolCallReadyAction;
			assert.deepStrictEqual({
				readyCount: signals.filter(s => isAction(s, ActionType.ChatToolCallReady)).length,
				confirmed: ready.confirmed,
				meta: ready._meta,
			}, {
				readyCount: 1,
				confirmed: ToolCallConfirmationReason.NotNeeded,
				meta: {
					autoApproveBySetting: true,
					toolSearchCandidates: [{ name: 'everything-get-sum', description: 'Adds numbers' }],
				},
			});

			session.handleClientToolCallComplete('tc-tool-search', {
				success: true,
				pastTenseMessage: 'Searched tools',
				content: [{ type: ToolResultContentType.Text, text: '["everything-get-sum"]' }],
			});
			await handlerPromise;
		});

		test('tool-search override follows the launch-time decision', async () => {
			const toolSearchSnapshot: IActiveClientSnapshot = {
				tools: [
					{ name: 'toolSearch', description: 'Search tools', inputSchema: { type: 'object', properties: {} } },
					{ name: 'my_tool', description: 'Regular tool', inputSchema: { type: 'object', properties: {} } },
				],
				plugins: [],
				mcpServers: {},
			};

			const { runtime } = await createAgentSession(disposables, {
				clientSnapshot: toolSearchSnapshot,
			});

			assert.deepStrictEqual({
				inactive: runtime.createClientSdkTools(false).map(tool => tool.name),
				active: runtime.createClientSdkTools(true).map(tool => tool.name),
			}, {
				inactive: ['my_tool'],
				active: ['tool_search_tool', 'my_tool'],
			});
		});

		test('agent-coordination client tools auto-ready with a tailored invocation message', async () => {
			const agentSnapshot: IActiveClientSnapshot = {
				tools: [{ name: 'list_agents', description: 'List agents', inputSchema: { type: 'object', properties: {} } }],
				plugins: [],
				mcpServers: {},
			};
			const activeClientToolSet = new ActiveClientToolSet();
			activeClientToolSet.set('agent-client', agentSnapshot.tools);
			const { mockSession, signals } = await createAgentSession(disposables, { clientSnapshot: agentSnapshot, activeClientToolSet });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-list-agents',
				toolName: 'list_agents',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// Unlike other client tools (which defer to the permission flow),
			// the auto-approved agent-coordination tools auto-ready so their
			// invocation renders our tailored message instead of the generic
			// "Running {displayName}…" fallback.
			const readySignal = signals.find(s => isAction(s, ActionType.ChatToolCallReady));
			assert.ok(readySignal && isAction(readySignal, ActionType.ChatToolCallReady));
			assert.strictEqual((readySignal.action as ChatToolCallReadyAction).invocationMessage, 'List agents');
		});

		test('client tool handler does not emit tool_ready (permission flow owns it)', async () => {
			const activeClientToolSet = new ActiveClientToolSet();
			activeClientToolSet.set('client-perm', snapshot.tools);
			const { session, runtime, mockSession, signals, waitForSignal } = await createAgentSession(disposables, { clientSnapshot: snapshot, activeClientToolSet });

			// SDK emits tool.execution_start — tool_start fires immediately
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-client-perm',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start fired, no pending_confirmation yet
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.ChatToolCallStart)).length, 1);
			assert.strictEqual(signals.filter(s => s.kind === 'pending_confirmation').length, 0);

			// Permission request fires — pending_confirmation from permission flow.
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-client-perm',
				toolName: 'my_tool',
			});

			// pending_confirmation from permission flow should have fired (with confirmationTitle)
			await waitForSignal(s => s.kind === 'pending_confirmation');
			const permSignals = signals.filter((s): s is IAgentToolPendingConfirmationSignal => s.kind === 'pending_confirmation');
			assert.strictEqual(permSignals.length, 1);
			assert.strictEqual(permSignals[0].state.toolCallId, 'tc-client-perm');
			assert.ok(permSignals[0].state.confirmationTitle);

			const tools = runtime.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-client-perm');

			// The handler should NOT emit its own pending_confirmation — only the
			// permission flow fires pending_confirmation for client tools.
			assert.strictEqual(signals.filter(s => s.kind === 'pending_confirmation').length, 1, 'handler should not emit a second pending_confirmation');

			// Approve and clean up
			session.respondToPermissionRequest('tc-client-perm', true);
			const permResult = await resultPromise;
			assert.strictEqual(permResult.kind, 'approve-once');
			session.handleClientToolCallComplete('tc-client-perm', {
				success: true,
				pastTenseMessage: 'did it',
			});
			assert.deepStrictEqual(await handlerPromise, {
				textResultForLlm: '<empty />',
				resultType: 'success',
				binaryResultsForLlm: undefined,
			});
		});

		test('pending_confirmation routes follow-up turns after subagent completion', async () => {
			const { session, runtime, mockSession, signals, waitForSignal } = await createAgentSession(disposables, { clientSnapshot: snapshot, activeClientToolSet: activeClientToolSetWith('test-client') });

			mockSession.fire('subagent.started', {
				toolCallId: 'tc-parent-subagent',
				agentName: 'helper',
				agentDisplayName: 'Helper',
				agentDescription: 'Helps',
			} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-client-tool' });

			mockSession.fire('subagent.completed', {
				toolCallId: 'tc-parent-subagent',
				agentName: 'helper',
				agentDisplayName: 'Helper',
				durationMs: 1,
				totalTokens: 0,
				totalToolCalls: 0,
			} as SessionEventPayload<'subagent.completed'>['data'], { agentId: 'agent-client-tool' });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-sub-client',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data'], { agentId: 'agent-client-tool' });

			assert.deepStrictEqual(signals.filter(signal => signal.kind === 'subagent_resumed').map(signal => signal.toolCallId), ['tc-parent-subagent']);

			const resultPromise = runtime.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-sub-client',
				toolName: 'my_tool',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			const permSignals = signals.filter((s): s is IAgentToolPendingConfirmationSignal => s.kind === 'pending_confirmation');
			assert.strictEqual(permSignals.length, 1);
			assert.strictEqual(permSignals[0].parentToolCallId, 'tc-parent-subagent');

			session.respondToPermissionRequest('tc-sub-client', false);
			await resultPromise;

			mockSession.fire('hook.end', {
				hookInvocationId: 'hook-follow-up-stop',
				hookType: 'agentStop',
				success: true,
			} as SessionEventPayload<'hook.end'>['data'], { agentId: 'agent-client-tool' });

			assert.deepStrictEqual(signals.filter(signal => signal.kind === 'subagent_completed').map(signal => signal.toolCallId), [
				'tc-parent-subagent',
				'tc-parent-subagent',
			]);
		});

		test('handleClientToolCallComplete pre-completes when no handler is waiting yet', async () => {
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			// Completion arrives before handler — pre-creates deferred
			session.handleClientToolCallComplete('tc-unknown', {
				success: true,
				pastTenseMessage: 'done',
			});

			// Handler picks up the pre-completed result
			const tools = runtime.createClientSdkTools();
			const result = await invokeClientToolHandler(tools[0], 'tc-unknown');
			assert.strictEqual(result.resultType, 'success');
		});

		test('handleClientToolCallComplete with failure result', async () => {
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = runtime.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-client-3');

			session.handleClientToolCallComplete('tc-client-3', {
				success: false,
				pastTenseMessage: 'failed',
				error: { message: 'something broke' },
			});

			const result = await handlerPromise;
			assert.strictEqual(result.resultType, 'failure');
			assert.strictEqual(result.error, 'something broke');
		});

		test('pending client tool calls are cancelled on dispose', async () => {
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = runtime.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-client-4');

			session.dispose();
			const result = await handlerPromise;
			assert.strictEqual(result.resultType, 'failure');
			assert.ok(result.error);
		});

		test('multiple concurrent client tool calls resolve independently', async () => {
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = runtime.createClientSdkTools();
			const promise1 = invokeClientToolHandler(tools[0], 'tc-multi-1');
			const promise2 = invokeClientToolHandler(tools[0], 'tc-multi-2');

			// Complete in reverse order
			session.handleClientToolCallComplete('tc-multi-2', {
				success: true,
				pastTenseMessage: 'second done',
				content: [{ type: ToolResultContentType.Text, text: 'result-2' }],
			});
			session.handleClientToolCallComplete('tc-multi-1', {
				success: true,
				pastTenseMessage: 'first done',
				content: [{ type: ToolResultContentType.Text, text: 'result-1' }],
			});

			const [result1, result2] = await Promise.all([promise1, promise2]);
			assert.strictEqual(result1.textResultForLlm, 'result-1');
			assert.strictEqual(result2.textResultForLlm, 'result-2');
		});

		test('handler cleans up deferred after consuming result', async () => {
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = runtime.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-cleanup');

			session.handleClientToolCallComplete('tc-cleanup', {
				success: true,
				pastTenseMessage: 'done',
				content: [{ type: ToolResultContentType.Text, text: 'ok' }],
			});

			await handlerPromise;

			// A second complete for the same toolCallId should create a new
			// deferred (not fail). This tests the cleanup path.
			session.handleClientToolCallComplete('tc-cleanup', {
				success: true,
				pastTenseMessage: 'done again',
			});
		});

		test('client tool handler logs and rethrows failures', async () => {
			const logService = new CapturingLogService();
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot, logService });
			const tools = runtime.createClientSdkTools();
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			sessionInternals._pendingClientToolCalls.register = () => {
				throw new Error('client tool boom');
			};

			await assert.rejects(
				invokeClientToolHandler(tools[0], 'tc-client-error'),
				/client tool boom/,
			);

			assert.strictEqual(logService.errors.length, 1);
			const [entry] = logService.errors;
			assert.ok(entry.first instanceof Error);
			assert.strictEqual((entry.first as Error).message, 'client tool boom');
			assert.strictEqual(entry.args[0], '[Copilot:test-session-1] Failed in client tool handler: tool=my_tool, toolCallId=tc-client-error');
		});

		test('permission request before client tool handler emits only confirmation ready', async () => {
			const { session, runtime, mockSession, signals, waitForSignal } = await createAgentSession(disposables, {
				clientSnapshot: snapshot,
				activeClientToolSet: activeClientToolSetWith('test-client'),
			});

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-ready-data',
				toolName: 'my_tool',
				arguments: { file: 'test.ts' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start should have fired
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.ChatToolCallStart)).length, 1);

			// Permission before the handler should produce only the confirmation
			// pending_confirmation, not a synthetic auto-ready.
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-ready-data',
				toolName: 'my_tool',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			const permSignals = signals.filter((s): s is IAgentToolPendingConfirmationSignal => s.kind === 'pending_confirmation');
			assert.strictEqual(permSignals.length, 1);
			assert.ok(permSignals[0].state.confirmationTitle);

			session.respondToPermissionRequest('tc-ready-data', true);
			await resultPromise;
		});

		test('client tool completion does not approve a pending managed permission', async () => {
			const { session, runtime, mockSession, signals, waitForSignal } = await createAgentSession(disposables, {
				clientSnapshot: snapshot,
				activeClientToolSet: activeClientToolSetWith('test-client'),
			});
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-managed-client',
				toolName: 'my_tool',
				arguments: { file: 'test.ts' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			const permissionPromise = runtime.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-managed-client',
				toolName: 'my_tool',
				managedApprovalRequired: true,
			});
			await waitForSignal(signal => signal.kind === 'pending_confirmation');

			session.handleClientToolCallComplete('tc-managed-client', {
				success: true,
				pastTenseMessage: 'did it',
				content: [{ type: ToolResultContentType.Text, text: 'result text' }],
			});
			let permissionResult: Awaited<typeof permissionPromise> | undefined;
			void permissionPromise.then(result => permissionResult = result);
			await timeout(0);

			assert.deepStrictEqual({
				permissionResult,
				pendingConfirmations: signals.filter(signal => signal.kind === 'pending_confirmation').length,
			}, {
				permissionResult: undefined,
				pendingConfirmations: 1,
			});
			assert.ok(session.respondToPermissionRequest('tc-managed-client', false));
			assert.deepStrictEqual(await permissionPromise, { kind: 'reject', feedback: 'The user denied permission.' });
		});

		test('handleClientToolCallComplete with content containing embedded resources', async () => {
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = runtime.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-embedded');

			session.handleClientToolCallComplete('tc-embedded', {
				success: true,
				pastTenseMessage: 'done',
				content: [
					{ type: ToolResultContentType.Text, text: 'text part' },
					{ type: ToolResultContentType.EmbeddedResource, data: 'base64data', contentType: 'image/png' },
				],
			});

			const result = await handlerPromise;
			assert.strictEqual(result.resultType, 'success');
			// Text content should be extracted
			assert.strictEqual(result.textResultForLlm, 'text part');
		});

		test('handleClientToolCallComplete describes embedded-resource-only content', async () => {
			const testCases = [
				{
					toolCallId: 'tc-image-only',
					contentType: 'image/png',
					expectedText: 'Tool produced the attached image',
					expectedType: 'image',
				},
				{
					toolCallId: 'tc-file-only',
					contentType: 'application/pdf',
					expectedText: 'Tool produced the attached file',
					expectedType: 'resource',
				},
				{
					toolCallId: 'tc-image-and-file',
					contentType: 'image/png',
					additionalContentType: 'application/pdf',
					expectedText: 'Tool produced the attached image and file',
					expectedType: 'image',
				},
			] satisfies ReadonlyArray<{
				readonly toolCallId: string;
				readonly contentType: string;
				readonly additionalContentType?: string;
				readonly expectedText: string;
				readonly expectedType: 'image' | 'resource';
			}>;
			const embeddedResource = (data: string, contentType: string): ToolResultContent => ({ type: ToolResultContentType.EmbeddedResource, data, contentType });

			for (const testCase of testCases) {
				const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });
				const tools = runtime.createClientSdkTools();
				const handlerPromise = invokeClientToolHandler(tools[0], testCase.toolCallId);
				const content: ToolResultContent[] = [
					embeddedResource('base64data', testCase.contentType),
					...(testCase.additionalContentType ? [embeddedResource('base64data2', testCase.additionalContentType)] : []),
				];

				session.handleClientToolCallComplete(testCase.toolCallId, {
					success: true,
					pastTenseMessage: 'done',
					content,
				});

				assert.deepStrictEqual(await handlerPromise, {
					textResultForLlm: testCase.expectedText,
					resultType: 'success',
					binaryResultsForLlm: [
						{ data: 'base64data', mimeType: testCase.contentType, type: testCase.expectedType },
						...(testCase.additionalContentType ? [{ data: 'base64data2', mimeType: testCase.additionalContentType, type: 'resource' }] : []),
					],
				});
				disposables.clear();
			}
		});

		test('client tool start stamps the owning clientId from the shared ActiveClientToolSet', async () => {
			const activeClientToolSet = new ActiveClientToolSet();
			activeClientToolSet.set('client-A', snapshot.tools);
			const { mockSession, signals } = await createAgentSession(disposables, { clientSnapshot: snapshot, activeClientToolSet });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-live-1',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// A window reload removes the old client and re-pushes the same
			// tools under a new clientId.
			activeClientToolSet.delete('client-A');
			activeClientToolSet.set('client-B', snapshot.tools);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-live-2',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const starts = signals.filter((s): s is IAgentActionSignal => isAction(s, ActionType.ChatToolCallStart));
			assert.deepStrictEqual(starts.map(s => (s.action as ChatToolCallStartAction).contributor), [
				{ kind: ToolCallContributorKind.Client, clientId: 'client-A' },
				{ kind: ToolCallContributorKind.Client, clientId: 'client-B' },
			]);
		});

		test('completion arriving before the SDK handler registers still resolves', async () => {
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });
			const tools = runtime.createClientSdkTools();

			// Completion races ahead of the handler.
			session.handleClientToolCallComplete('tc-early', {
				success: true,
				pastTenseMessage: 'done',
				content: [{ type: ToolResultContentType.Text, text: 'buffered result' }],
			});

			const result = await invokeClientToolHandler(tools[0], 'tc-early');
			assert.strictEqual(result.resultType, 'success');
			assert.strictEqual(result.textResultForLlm, 'buffered result');
		});

		test('completion arriving before the permission request unblocks the SDK', async () => {
			const activeClientToolSet = new ActiveClientToolSet();
			activeClientToolSet.set('client-disconnected', snapshot.tools);
			const { session, runtime, mockSession, signals } = await createAgentSession(disposables, { clientSnapshot: snapshot, activeClientToolSet });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-complete-before-permission',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			session.handleClientToolCallComplete('tc-complete-before-permission', {
				success: false,
				pastTenseMessage: 'my_tool failed',
				error: { message: 'Client disconnected' },
			});

			const permissionPromise = runtime.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-complete-before-permission',
				toolName: 'my_tool',
			});
			let permissionResult: Awaited<typeof permissionPromise> | undefined;
			void permissionPromise.then(result => permissionResult = result);
			await Promise.resolve();
			if (!permissionResult) {
				session.respondToPermissionRequest('tc-complete-before-permission', false);
				await permissionPromise;
			}

			const toolResult = await invokeClientToolHandler(runtime.createClientSdkTools()[0], 'tc-complete-before-permission');
			assert.deepStrictEqual({
				permissionResult,
				pendingConfirmations: signals.filter(signal => signal.kind === 'pending_confirmation').length,
				toolResult,
			}, {
				permissionResult: { kind: 'approve-once' },
				pendingConfirmations: 0,
				toolResult: {
					textResultForLlm: 'Client disconnected',
					resultType: 'failure',
					error: 'Client disconnected',
					binaryResultsForLlm: undefined,
				},
			});
		});

		test('buffered client tool completion does not approve a managed permission', async () => {
			const activeClientToolSet = new ActiveClientToolSet();
			activeClientToolSet.set('test-client', snapshot.tools);
			const { session, runtime, mockSession, signals, waitForSignal } = await createAgentSession(disposables, { clientSnapshot: snapshot, activeClientToolSet });
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-managed-buffered',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);
			session.handleClientToolCallComplete('tc-managed-buffered', {
				success: true,
				pastTenseMessage: 'did it',
				content: [{ type: ToolResultContentType.Text, text: 'buffered result' }],
			});

			const permissionPromise = runtime.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-managed-buffered',
				toolName: 'my_tool',
				managedApprovalRequired: true,
			});
			await waitForSignal(signal => signal.kind === 'pending_confirmation');
			let permissionResult: Awaited<typeof permissionPromise> | undefined;
			void permissionPromise.then(result => permissionResult = result);
			await timeout(0);

			assert.deepStrictEqual({
				permissionResult,
				pendingConfirmations: signals.filter(signal => signal.kind === 'pending_confirmation').length,
			}, {
				permissionResult: undefined,
				pendingConfirmations: 1,
			});
			assert.ok(session.respondToPermissionRequest('tc-managed-buffered', false));
			assert.deepStrictEqual(await permissionPromise, { kind: 'reject', feedback: 'The user denied permission.' });
		});
	});

	// ---- Server tools -------------------------------------------------------

	suite('server tools', () => {

		const fakeToolDefinitions: readonly IAgentServerToolDefinition[] = [
			{ name: 'serverToolA', description: 'A', inputSchema: { type: 'object', properties: {} } },
			{ name: 'serverToolB', description: 'B', inputSchema: { type: 'object', properties: {} } },
		];

		class FakeServerToolHost implements IAgentServerToolHost {
			readonly toolNames: readonly string[];
			readonly advertised: string[] = [];
			readonly executions: Array<{ sessionUri: string; toolName: string; rawArgs: unknown }> = [];
			readonly confirmationToolNames = new Set<string>();
			readonly sessionConfirmationToolNames = new Set<string>();
			result = 'ok';
			error: Error | undefined;

			constructor(readonly definitions: readonly IAgentServerToolDefinition[] = fakeToolDefinitions) {
				this.toolNames = definitions.map(def => def.name);
			}

			advertise(sessionUri: string): void {
				this.advertised.push(sessionUri);
			}

			getDefinitionsForSession(): readonly IAgentServerToolDefinition[] { return this.definitions; }

			canRequireConfirmation(toolName: string): boolean { return this.confirmationToolNames.has(toolName); }

			requiresConfirmation(_sessionUri: string, toolName: string): boolean { return this.sessionConfirmationToolNames.has(toolName); }

			executeTool(sessionUri: string, toolName: string, rawArgs: unknown): string {
				this.executions.push({ sessionUri, toolName, rawArgs });
				if (this.error) {
					throw this.error;
				}
				return this.result;
			}
		}

		test('advertises the server tools on initialize and exposes them as server SDK tools', async () => {
			const serverToolHost = new FakeServerToolHost();
			const { runtime } = await createAgentSession(disposables, { serverToolHost });

			const sessionUri = AgentSession.uri('copilot', 'test-session-1').toString();
			assert.deepStrictEqual(serverToolHost.advertised, [sessionUri]);

			const tools = runtime.createServerSdkTools();
			assert.deepStrictEqual(tools.map(t => t.name).sort(), [...serverToolHost.toolNames].sort());
			// Server tools are always-available internal tools; they must be
			// eager (`defer: 'never'`) so tool search never hides them behind
			// `tool_search_tool`.
			assert.deepStrictEqual(tools.map(t => t.defer), tools.map(() => 'never'));
		});

		test('exposes only ephemeral-enabled server tools in an ephemeral session', async () => {
			const serverToolHost = new FakeServerToolHost([
				...fakeToolDefinitions,
				{ name: 'ephemeralServerTool', description: 'Available in ephemeral sessions', inputSchema: { type: 'object', properties: {} }, enabledForEphemeralSessions: true },
				{ name: SessionServerToolName.RenameChat, description: 'Rename the chat', inputSchema: { type: 'object', properties: {} } },
			]);
			const { runtime } = await createAgentSession(disposables, { serverToolHost, isEphemeral: true });

			assert.deepStrictEqual(runtime.createServerSdkTools().map(tool => tool.name), ['ephemeralServerTool']);
		});

		test('server tool handler routes to the host and returns a success result', async () => {
			const serverToolHost = new FakeServerToolHost();
			serverToolHost.result = 'listed 2 comments';
			const { runtime } = await createAgentSession(disposables, { serverToolHost });

			const tools = runtime.createServerSdkTools();
			const result = await invokeClientToolHandler(tools[0], 'tc-server-tool', { foo: 'bar' });

			const sessionUri = buildDefaultChatUri(AgentSession.uri('copilot', 'test-session-1'));
			assert.deepStrictEqual(serverToolHost.executions, [{ sessionUri, toolName: tools[0].name, rawArgs: { foo: 'bar' } }]);
			assert.strictEqual(result.resultType, 'success');
			assert.strictEqual(result.textResultForLlm, 'listed 2 comments');
		});

		test('server tool handler surfaces host failures as a failure result', async () => {
			const serverToolHost = new FakeServerToolHost();
			serverToolHost.error = new Error('boom');
			const { runtime } = await createAgentSession(disposables, { serverToolHost });

			const tools = runtime.createServerSdkTools();
			const result = await invokeClientToolHandler(tools[0], 'tc-server-tool');

			assert.strictEqual(result.resultType, 'failure');
			assert.strictEqual(result.textResultForLlm, 'boom');
			assert.strictEqual(result.error, 'boom');
		});

		test('exposes no server SDK tools and advertises nothing when no host is wired', async () => {
			const { runtime } = await createAgentSession(disposables);
			assert.deepStrictEqual(runtime.createServerSdkTools(), []);
		});

		test('auto-approves server tools that do not require confirmation', async () => {
			const serverToolHost = new FakeServerToolHost();
			const { runtime, signals } = await createAgentSession(disposables, { serverToolHost });

			const results = [];
			for (const toolName of serverToolHost.toolNames) {
				results.push(await runtime.handlePermissionRequest({ kind: 'custom-tool', toolCallId: `tc-${toolName}`, toolName }));
			}

			assert.deepStrictEqual({
				results,
				pendingConfirmations: signals.filter(s => s.kind === 'pending_confirmation').length,
			}, {
				results: serverToolHost.toolNames.map(() => ({ kind: 'approve-once' })),
				pendingConfirmations: 0,
			});
		});

		test('auto-approves a confirmation server tool when the session has nothing to confirm', async () => {
			const serverToolHost = new FakeServerToolHost();
			const toolName = serverToolHost.toolNames[0];
			serverToolHost.confirmationToolNames.add(toolName);
			const { runtime, signals } = await createAgentSession(disposables, { serverToolHost });

			const result = await runtime.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-empty-server-tool',
				toolName,
				managedApprovalRequired: true,
			});

			assert.deepStrictEqual({
				result,
				pendingConfirmations: signals.filter(signal => signal.kind === 'pending_confirmation').length,
			}, {
				result: { kind: 'approve-once' },
				pendingConfirmations: 0,
			});
		});

		test('requests confirmation when a server tool has content to confirm', async () => {
			const serverToolHost = new FakeServerToolHost();
			const toolName = serverToolHost.toolNames[0];
			serverToolHost.confirmationToolNames.add(toolName);
			serverToolHost.sessionConfirmationToolNames.add(toolName);
			const { session, runtime, waitForSignal } = await createAgentSession(disposables, { serverToolHost });

			const permission = runtime.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-nonempty-server-tool',
				toolName,
			});
			await waitForSignal(signal => signal.kind === 'pending_confirmation' && signal.state.toolCallId === 'tc-nonempty-server-tool');
			assert.strictEqual(session.respondToPermissionRequest('tc-nonempty-server-tool', false), true);

			assert.deepStrictEqual(await permission, { kind: 'reject', feedback: 'The user denied permission.' });
		});
	});

	// ---- Plan mode ----------------------------------------------------------

	suite('plan mode', () => {

		const planRequestParams = (overrides?: Partial<{ actions: string[]; recommendedAction: string; summary: string }>) => ({
			sessionId: 'test-session-1',
			summary: overrides?.summary ?? '## Plan summary',
			planContent: '## Plan',
			actions: overrides?.actions ?? ['autopilot', 'interactive', 'exit_only'],
			recommendedAction: overrides?.recommendedAction ?? 'autopilot',
		});

		test('applyMode pushes the mode to the SDK only when it changes', async () => {
			const { session, mockSession } = await createAgentSession(disposables);

			await session.applyMode('plan');
			await session.applyMode('plan');
			await session.applyMode('autopilot');
			await session.applyMode(undefined);
			await session.applyMode('autopilot');

			assert.deepStrictEqual(mockSession.modeSetCalls, [
				{ mode: 'plan' },
				{ mode: 'autopilot' },
			]);
		});

		test('send applies mode before forwarding to the SDK', async () => {
			const { session, mockSession } = await createAgentSession(disposables);

			await session.send('hi', undefined, 'turn-1', 'plan');

			assert.deepStrictEqual(mockSession.modeSetCalls, [{ mode: 'plan' }]);
			assert.strictEqual(mockSession.sendRequests.length, 1);
		});

		test('handleExitPlanModeRequest produces a plan-review input request with fallback question', async () => {
			const { session, runtime, mockSession, signals, waitForSignal } = await createAgentSession(disposables);
			session.resetTurnState('turn-plan');

			mockSession.planReadResult = { exists: true, content: '## Plan', path: '/sessions/abc/plan.md' };

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams(), { sessionId: 'test-session-1' });

			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			assert.strictEqual(readChatInputRequestPurpose(request), ChatInputRequestPurpose.PlanReview);

			const planReview = (request as ChatInputRequestWithPlanReview).planReview;
			assert.deepStrictEqual(planReview, {
				title: 'Review Plan',
				content: '## Plan summary',
				canProvideFeedback: true,
				answerQuestionId: request.questions?.[0].id,
				planUri: URI.file('/sessions/abc/plan.md').toString(),
				actions: [
					{
						id: 'autopilot',
						label: 'Implement with Autopilot',
						description: 'Continue autonomously until done, using the selected approval level.',
						default: true,
					},
					{
						id: 'interactive',
						label: 'Implement Plan',
						description: 'Implement the plan, asking for input and approval for each action.',
					},
					{
						id: 'exit_only',
						label: 'Approve Plan Only',
						description: 'Approve the plan without executing it. I will implement it myself.',
					},
				],
			});

			// The summary is now carried by the plan-review payload so the
			// renderer can dock the richer plan review widget without duplicating
			// the content as a separate markdown response part.
			const deltaContent = signals.flatMap(s => {
				if (s.kind !== 'action') { return []; }
				if (s.action.type === ActionType.ChatResponsePart) {
					const part = (s.action as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown ? [part.content] : [];
				}
				if (s.action.type === ActionType.ChatDelta) {
					return [(s.action as ChatDeltaAction).content];
				}
				return [];
			}).join('');
			assert.strictEqual(deltaContent, '');

			const question = request.questions?.[0];
			assert.strictEqual(question?.kind, ChatInputQuestionKind.SingleSelect);
			if (question?.kind === ChatInputQuestionKind.SingleSelect) {
				assert.deepStrictEqual(question.options.map(o => o.id), ['autopilot', 'interactive', 'exit_only']);
				const recommended = question.options.find(o => o.recommended);
				assert.strictEqual(recommended?.id, 'autopilot');
				assert.strictEqual(question.allowFreeformInput, true);
			}

			// Resolve the request so the deferred completes and the test can clean up.
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Decline);
			await responsePromise;
		});

		test('handleExitPlanModeRequest rejects when its turn changes while reading the plan', async () => {
			const { session, runtime, mockSession, signals } = await createAgentSession(disposables);
			const planRead = new DeferredPromise<{ exists: boolean; content: string | null; path: string | null }>();
			mockSession.planReadPromise = planRead.p;
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams(), { sessionId: 'test-session-1' });
			session.resetTurnState('turn-next');
			planRead.complete({ exists: true, content: '## Plan', path: '/sessions/abc/plan.md' });

			assert.deepStrictEqual({
				response: await responsePromise,
				inputRequests: signals.filter(signal => isAction(signal, ActionType.ChatInputRequested)).length,
			}, {
				response: { approved: false },
				inputRequests: 0,
			});
		});

		test('keeps an in-flight callback cancelled after send resets the abort token', async () => {
			const { session, runtime, mockSession, signals } = await createAgentSession(disposables);
			const planRead = new DeferredPromise<{ exists: boolean; content: string | null; path: string | null }>();
			mockSession.planReadPromise = planRead.p;
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams(), { sessionId: 'test-session-1' });
			await session.abort();
			await session.send('continue');
			planRead.complete({ exists: true, content: '## Plan', path: '/sessions/abc/plan.md' });
			await timeout(0);

			const inputRequests = signals.filter(signal => isAction(signal, ActionType.ChatInputRequested));
			assert.strictEqual(inputRequests.length, 1);
			const request = getInputRequest(inputRequests[0]);
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept, {
				[request.questions![0].id]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'interactive' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: false });
		});

		test('resolves an in-flight callback after abort without a client response', async () => {
			const { session, runtime, mockSession } = await createAgentSession(disposables);
			const planRead = new DeferredPromise<{ exists: boolean; content: string | null; path: string | null }>();
			mockSession.planReadPromise = planRead.p;
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams(), { sessionId: 'test-session-1' });
			await session.abort();
			planRead.complete({ exists: true, content: '## Plan', path: '/sessions/abc/plan.md' });

			const timeoutPromise = timeout(100);
			try {
				assert.deepStrictEqual(await Promise.race([
					responsePromise,
					timeoutPromise.then(() => {
						throw new Error('Timed out waiting for the aborted callback to resolve');
					}),
				]), { approved: false });
			} finally {
				timeoutPromise.cancel();
			}
		});

		test('completing the input request with autopilot preserves Ask When Needed and syncs mode=autopilot', async () => {
			const { session, runtime, waitForSignal, sessionConfigUpdates } = await createAgentSession(disposables);
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'autopilot' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'autopilot' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'autopilot' });
			// Picking "Implement with Autopilot" flips the AHP mode immediately.
			assert.deepStrictEqual(sessionConfigUpdates, [
				{ session: 'copilot:/test-session-1', patch: { mode: 'autopilot' } },
			]);
		});

		test('peer chat syncs mode=autopilot to the owning session, not its own chat resource', async () => {
			// A peer chat's `resource` (exact persistence scope) differs from
			// `sessionUri` (the shared owning/configuration scope). The SDK-mode
			// sync must target the owning session so every peer chat observes it.
			const parentSessionUri = AgentSession.uri('copilot', 'test-session-1');
			const peerChatUri = URI.parse(buildChatUri(parentSessionUri, 'peer-1'));
			const { session, runtime, waitForSignal, sessionConfigUpdates } = await createAgentSession(disposables, {
				sessionUri: parentSessionUri,
				chatChannelUri: peerChatUri,
				resource: peerChatUri,
			});
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'autopilot' }), { sessionId: 'test-session-1' });
			const request = getInputRequest(await waitForSignal(s => isAction(s, ActionType.ChatInputRequested)));
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept, {
				[request.questions![0].id]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'autopilot' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'autopilot' });
			assert.deepStrictEqual(sessionConfigUpdates, [
				{ session: parentSessionUri.toString(), patch: { mode: 'autopilot' } },
			]);
		});

		test('completing the input request with autopilot enables edit auto-approval under Allow All', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
			});
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'autopilot' }), { sessionId: 'test-session-1' });
			const request = getInputRequest(await waitForSignal(s => isAction(s, ActionType.ChatInputRequested)));
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept, {
				[request.questions![0].id]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'autopilot' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'autopilot', autoApproveEdits: true });
		});

		test('completing the input request with interactive resolves with approved + interactive (no autoApprove) and syncs mode=interactive', async () => {
			const { session, runtime, waitForSignal, sessionConfigUpdates } = await createAgentSession(disposables);
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'interactive' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'interactive' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'interactive' });
			assert.deepStrictEqual(sessionConfigUpdates, [
				{ session: 'copilot:/test-session-1', patch: { mode: 'interactive' } },
			]);
		});

		test('declining the input request resolves with approved=false', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams(), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));

			session.respondToUserInputRequest(getInputRequest(signal).id, ChatInputResponseKind.Decline);

			assert.deepStrictEqual(await responsePromise, { approved: false });
		});

		test('abort resolves and clears a pending plan review', async () => {
			const { session, runtime, mockSession, waitForSignal } = await createAgentSession(disposables);
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams(), { sessionId: 'test-session-1' });
			const request = getInputRequest(await waitForSignal(s => isAction(s, ActionType.ChatInputRequested)));

			await session.abort();
			const lateResponseHandled = session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept);

			assert.deepStrictEqual({
				response: await responsePromise,
				abortCalls: mockSession.abortCalls,
				lateResponseHandled,
			}, {
				response: { approved: false },
				abortCalls: 1,
				lateResponseHandled: false,
			});
		});

		test('exit_only resolves as approved + interactive without autoApproveEdits', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive', 'exit_only'], recommendedAction: 'exit_only' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'exit_only' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'exit_only' });
		});

		test('freeform feedback alongside a selected action becomes a revision request', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'interactive' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: {
						kind: ChatInputAnswerValueKind.Selected,
						value: 'interactive',
						freeformValues: ['Please use Python instead of Node.js'],
					},
				},
			});

			assert.deepStrictEqual(await responsePromise, {
				approved: false,
				feedback: 'Please use Python instead of Node.js',
				selectedAction: 'interactive',
			});
		});

		test('selectedAction not in offered actions falls back to recommendedAction', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['interactive', 'exit_only'], recommendedAction: 'interactive' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			// SDK only offered `interactive` and `exit_only`; the client
			// somehow sent `autopilot` (e.g. stale UI state). The agent
			// host clamps to `recommendedAction` so the SDK never sees a
			// value it didn't offer.
			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'autopilot' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'interactive' });
		});

		test('selectedAction not in offered actions and no fallback resolves to approved=false', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);
			session.resetTurnState('turn-plan');

			// SDK offered `exit_only` only and recommended a value not in
			// the offered set. The client picked something invalid. With
			// no usable selectedAction and no feedback, decline.
			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['exit_only'], recommendedAction: 'autopilot' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'interactive' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: false });
		});

		test('text answer with feedback becomes a revision request without selectedAction', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'interactive' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			// The single-select question normally produces a Selected
			// value, but a defensive Text response should still be
			// translated to a revision request when the answer is
			// non-empty (selectedAction falls back to recommendedAction).
			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Text, value: 'Add tests for edge cases' },
				},
			});

			assert.deepStrictEqual(await responsePromise, {
				approved: false,
				feedback: 'Add tests for edge cases',
				selectedAction: 'interactive',
			});
		});

		test('whitespace-only freeform feedback is ignored', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'interactive' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: {
						kind: ChatInputAnswerValueKind.Selected,
						value: 'interactive',
						freeformValues: ['   ', ''],
					},
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'interactive' });
		});

		test('session.mode_changed → plan updates the AHP session config', async () => {
			const { mockSession, sessionConfigUpdates } = await createAgentSession(disposables);

			mockSession.fire('session.mode_changed', { previousMode: 'interactive', newMode: 'plan' } as SessionEventPayload<'session.mode_changed'>['data']);

			assert.deepStrictEqual(sessionConfigUpdates, [
				{ session: 'copilot:/test-session-1', patch: { mode: 'plan' } },
			]);
		});

		test('session.mode_changed → interactive updates the AHP session config', async () => {
			const { mockSession, sessionConfigUpdates } = await createAgentSession(disposables);

			mockSession.fire('session.mode_changed', { previousMode: 'plan', newMode: 'interactive' } as SessionEventPayload<'session.mode_changed'>['data']);

			assert.deepStrictEqual(sessionConfigUpdates, [
				{ session: 'copilot:/test-session-1', patch: { mode: 'interactive' } },
			]);
		});

		test('session.mode_changed → autopilot maps directly to mode=autopilot', async () => {
			// The SDK and AHP share the same three-mode space; autopilot now
			// lives on the `mode` axis and the `autoApprove` axis is left
			// untouched. The translation is contained in the Copilot agent.
			const { mockSession, sessionConfigUpdates } = await createAgentSession(disposables);

			mockSession.fire('session.mode_changed', { previousMode: 'plan', newMode: 'autopilot' } as SessionEventPayload<'session.mode_changed'>['data']);

			assert.deepStrictEqual(sessionConfigUpdates, [
				{ session: 'copilot:/test-session-1', patch: { mode: 'autopilot' } },
			]);
		});

		test('session.mode_changed for unsupported mode is ignored', async () => {
			const { mockSession, sessionConfigUpdates } = await createAgentSession(disposables);

			mockSession.fire('session.mode_changed', { previousMode: 'interactive', newMode: 'shell' } as unknown as SessionEventPayload<'session.mode_changed'>['data']);

			assert.strictEqual(sessionConfigUpdates.length, 0);
		});

		test('session.mode_changed from a subagent does not update the session config', async () => {
			// Sub-agents (e.g. a `task` tool sub-agent running in plan mode)
			// emit `session.mode_changed` carrying an `agentId`. These reflect
			// the sub-agent's internal mode, not the root session's, and must
			// not flip the shared session mode picker (e.g. to Plan) mid-turn.
			const { mockSession, sessionConfigUpdates } = await createAgentSession(disposables);

			mockSession.fire('session.mode_changed', { previousMode: 'interactive', newMode: 'plan' } as SessionEventPayload<'session.mode_changed'>['data'], { agentId: 'subagent-1' });

			assert.strictEqual(sessionConfigUpdates.length, 0);
		});

		// ---- no automatic plan → implementation handoff -------------------

		test('handleExitPlanModeRequest always surfaces the plan-review UI, even in autopilot mode', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.Mode]: 'autopilot' },
			});
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({
				actions: ['autopilot', 'interactive', 'exit_only'],
				recommendedAction: 'autopilot',
			}), { sessionId: 'test-session-1' });

			// There is no automatic handoff from plan into implementation: the
			// user must explicitly choose an action regardless of mode.
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			session.respondToUserInputRequest(getInputRequest(signal).id, ChatInputResponseKind.Decline);
			await responsePromise;
		});

		test('handleExitPlanModeRequest does NOT auto-accept when autoApprove=default', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'default' },
			});
			session.resetTurnState('turn-plan');

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams(), { sessionId: 'test-session-1' });

			// The user-input request fires — the user must respond.
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			session.respondToUserInputRequest(getInputRequest(signal).id, ChatInputResponseKind.Decline);
			await responsePromise;
		});
	});

	suite('MCP server inventory', () => {

		test('does not enable a server while its customization resolution is pending', async () => {
			const serverName = 'azure';
			const id = 'mcp-top-level:copilot:test-session-1:azure';
			const { session, mockSession } = await createAgentSession(disposables, {
				sessionCustomizations: () => [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					state: { kind: McpServerStatus.Starting },
				}],
				resolveCustomizationEnablement: () => ({ kind: 'pending', reason: 'session' }),
				configureMockSession: mock => {
					mock.mcpListResult = { servers: [{ name: serverName, status: 'disabled' }] };
				},
			});

			await session.send('keep Azure disabled while the decision loads');

			assert.deepStrictEqual(mockSession.mcpEnableCalls, []);
		});

		test('does not enable a server resolved as disabled when the SDK reports it disabled', async () => {
			const serverName = 'azure';
			const id = 'mcp-top-level:copilot:test-session-1:azure';
			const { session, mockSession } = await createAgentSession(disposables, {
				sessionCustomizations: () => [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					state: { kind: McpServerStatus.Starting },
				}],
				resolveCustomizationEnablement: () => ({
					kind: 'resolved',
					enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
					enabled: false,
					workingDirectory: { kind: 'workspaceless' },
				}),
				configureMockSession: mock => {
					mock.mcpListResult = { servers: [{ name: serverName, status: 'disabled' }] };
				},
			});

			await session.send('keep Azure disabled');

			assert.deepStrictEqual(mockSession.mcpEnableCalls, []);
		});

		test('enables a server resolved as enabled when the SDK reports it disabled', async () => {
			const serverName = 'azure';
			const id = 'mcp-top-level:copilot:test-session-1:azure';
			const { session, mockSession } = await createAgentSession(disposables, {
				sessionCustomizations: () => [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
					state: { kind: McpServerStatus.Starting },
				}],
				resolveCustomizationEnablement: () => ({
					kind: 'resolved',
					enablement: [],
					enabled: true,
					workingDirectory: { kind: 'workspaceless' },
				}),
				configureMockSession: mock => {
					mock.mcpListResult = { servers: [{ name: serverName, status: 'disabled' }] };
				},
			});

			await session.send('enable Azure');

			assert.deepStrictEqual(mockSession.mcpEnableCalls, [{ serverName }]);
		});

		test('re-enabling an explicitly projected plugin server defers to a session refresh', async () => {
			const serverName = 'vscode_probe';
			const pluginUri = 'https://bundle';
			const pluginDir = URI.file('/bundle');
			const child: McpServerCustomization = {
				type: CustomizationType.McpServer,
				id: 'vscode-probe',
				uri: URI.joinPath(pluginDir, '.mcp.json').toString(),
				name: serverName,
				state: { kind: McpServerStatus.Stopped },
			};
			let enabled = false;
			const customizations = (): readonly Customization[] => [{
				type: CustomizationType.Plugin,
				id: 'bundle',
				uri: pluginUri,
				name: 'Bundle',
				children: [child],
			}];
			const { session, mockSession, dispatchSessionAction } = await createAgentSession(disposables, {
				clientSnapshot: {
					tools: [],
					plugins: [{
						format: PluginFormat.Copilot,
						hooks: [],
						mcpServers: [{
							name: serverName,
							configuration: { type: McpServerType.LOCAL, command: 'node', args: ['server.js'] },
							defaultCwd: URI.file('/workspace'),
							sdkRegistration: 'sessionConfig',
							uri: URI.joinPath(pluginDir, '.mcp.json'),
							customization: child,
						}],
						disabledMcpServers: [serverName],
						agents: [],
						skills: [],
						instructions: [],
						pluginDir,
						sourceUri: URI.parse(pluginUri),
					}],
					mcpServers: {},
				},
				sessionCustomizations: customizations,
				resolveCustomizationEnablement: target => ({
					kind: 'resolved',
					enablement: target.id === child.id && !enabled
						? [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: false }]
						: [],
					enabled: target.id === child.id ? enabled : true,
					workingDirectory: { kind: 'workspaceless' },
				}),
				configureMockSession: mock => {
					mock.mcpListResult = { servers: [{ name: serverName, status: 'disabled' }] };
				},
			});

			enabled = true;
			dispatchSessionAction({ type: ActionType.SessionCustomizationsChanged, customizations: [...customizations()] });
			await timeout(0);

			assert.deepStrictEqual({
				requiresRefresh: session.requiresMcpLaunchConfigurationRefresh,
				enableCalls: mockSession.mcpEnableCalls,
			}, {
				requiresRefresh: true,
				enableCalls: [],
			});
		});

		test('session MCP desired enablement reconciles runtime drift', async () => {
			const serverName = 'slack';
			const id = 'mcp-top-level:copilot:test-session-1:slack';
			let desiredEnabled = true;
			const { session, mockSession } = await createAgentSession(disposables, {
				sessionCustomizations: () => [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					...(!desiredEnabled ? {
						// TODO: Step 2 selects the persisted enablement scope.
						enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
					} : {}),
					state: { kind: McpServerStatus.Starting },
				}],
				configureMockSession: mock => {
					mock.mcpListResult = { servers: [{ name: serverName, status: 'pending' }] };
				},
			});

			desiredEnabled = false;
			await session.send('disable Slack');
			const afterDisable = session.topLevelMcpCustomizations();
			mockSession.fire('session.mcp_servers_loaded', { servers: [{ name: serverName, status: 'pending' }] });
			mockSession.mcpListResult = { servers: [{ name: serverName, status: 'pending' }] };
			const afterRuntimeUpdate = session.topLevelMcpCustomizations();
			await session.send('keep Slack disabled');
			const afterReconcile = session.topLevelMcpCustomizations();
			desiredEnabled = true;
			await session.send('enable Slack');

			assert.deepStrictEqual({
				disableCalls: mockSession.mcpDisableCalls,
				afterDisable,
				afterRuntimeUpdate,
				afterReconcile,
				enableCalls: mockSession.mcpEnableCalls,
				afterEnable: session.topLevelMcpCustomizations(),
			}, {
				disableCalls: [{ serverName }, { serverName }],
				afterDisable: [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					// TODO: Step 2 selects the persisted enablement scope.
					enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
					state: { kind: McpServerStatus.Stopped },
					channel: undefined,
					mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } },
				}],
				afterRuntimeUpdate: [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					// TODO: Step 2 selects the persisted enablement scope.
					enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
					state: { kind: McpServerStatus.Starting },
					channel: undefined,
					mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } },
				}],
				afterReconcile: [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					// TODO: Step 2 selects the persisted enablement scope.
					enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
					state: { kind: McpServerStatus.Stopped },
					channel: undefined,
					mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } },
				}],
				enableCalls: [{ serverName }],
				afterEnable: [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					state: { kind: McpServerStatus.Starting },
					channel: undefined,
					mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } },
				}],
			});
		});

		test('sending a message does not mark an enabled server as Starting', async () => {
			const serverName = 'db';
			const id = 'mcp-top-level:copilot:test-session-1:db';
			const { session } = await createAgentSession(disposables, {
				sessionCustomizations: () => [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					state: { kind: McpServerStatus.Stopped },
				}],
				// The server is settled (failed) before the turn. Sending does not
				// reconnect it, so its state must stay put until the SDK reports a
				// live `pending` of its own.
				configureMockSession: mock => { mock.mcpListResult = { servers: [{ name: serverName, status: 'failed', error: 'boom' }] }; },
			});

			const beforeSend = session.topLevelMcpCustomizations()[0]?.state;
			await session.send('hello');
			const afterSend = session.topLevelMcpCustomizations()[0]?.state;

			assert.deepStrictEqual({ beforeSend, afterSend }, {
				beforeSend: { kind: McpServerStatus.Error, error: { errorType: 'mcp-server-failed', message: 'boom' } },
				afterSend: { kind: McpServerStatus.Error, error: { errorType: 'mcp-server-failed', message: 'boom' } },
			});
		});

		test('startMcpServer reports Starting only once the SDK reports the reconnect', async () => {
			const serverName = 'db';
			const id = 'mcp-top-level:copilot:test-session-1:db';
			const { session, mockSession } = await createAgentSession(disposables, {
				sessionCustomizations: () => [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					state: { kind: McpServerStatus.Stopped },
				}],
				// Settled (failed) before the explicit start, and startServer
				// rejects, so the SDK never reports a connect attempt.
				configureMockSession: mock => {
					mock.mcpListResult = { servers: [{ name: serverName, status: 'failed', error: 'boom' }] };
					mock.mcpStartServerError = new Error('start failed');
				},
			});

			const beforeStart = session.topLevelMcpCustomizations()[0]?.state;
			await session.startMcpServer(id).catch(() => { });
			// Let the fire-and-forget inventory refresh settle.
			await timeout(0);
			const afterFailedStart = session.topLevelMcpCustomizations()[0]?.state;
			mockSession.fire('session.mcp_server_status_changed', {
				serverName,
				status: 'pending',
			} as SessionEventPayload<'session.mcp_server_status_changed'>['data']);
			const afterSdkPending = session.topLevelMcpCustomizations()[0]?.state;

			assert.deepStrictEqual({ startServerCalls: mockSession.mcpStartServerCalls, beforeStart, afterFailedStart, afterSdkPending }, {
				startServerCalls: [{ serverName }],
				beforeStart: { kind: McpServerStatus.Error, error: { errorType: 'mcp-server-failed', message: 'boom' } },
				afterFailedStart: { kind: McpServerStatus.Error, error: { errorType: 'mcp-server-failed', message: 'boom' } },
				afterSdkPending: { kind: McpServerStatus.Starting },
			});
		});

		test('stopMcpServer uses the SDK lifecycle method', async () => {
			const serverName = 'db';
			const id = 'mcp-top-level:copilot:test-session-1:db';
			const { session, mockSession } = await createAgentSession(disposables, {
				sessionCustomizations: () => [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					state: { kind: McpServerStatus.Ready },
				}],
				configureMockSession: mock => {
					mock.mcpListResult = { servers: [{ name: serverName, status: 'connected' }] };
				},
			});

			await session.stopMcpServer(id);

			assert.deepStrictEqual({
				stopServerCalls: mockSession.mcpStopServerCalls,
				state: session.topLevelMcpCustomizations()[0]?.state,
			}, {
				stopServerCalls: [{ serverName }],
				state: { kind: McpServerStatus.Stopped },
			});
		});

		test('startMcpServer waits for an in-flight stop of the same server', async () => {
			const serverName = 'db';
			const id = 'mcp-top-level:copilot:test-session-1:db';
			const stopGate = new DeferredPromise<void>();
			const { session, mockSession } = await createAgentSession(disposables, {
				sessionCustomizations: () => [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					enabled: true,
					state: { kind: McpServerStatus.Ready },
				}],
				configureMockSession: mock => {
					mock.mcpListResult = { servers: [{ name: serverName, status: 'connected' }] };
					mock.mcpStopServerGate = stopGate.p;
				},
			});

			const stopPromise = session.stopMcpServer(id);
			await timeout(0);
			const startPromise = session.startMcpServer(id);
			await timeout(0);
			const callsWhileStopping = {
				stop: [...mockSession.mcpStopServerCalls],
				start: [...mockSession.mcpStartServerCalls],
			};
			stopGate.complete();
			await Promise.all([stopPromise, startPromise]);

			assert.deepStrictEqual({
				callsWhileStopping,
				finalCalls: {
					stop: mockSession.mcpStopServerCalls,
					start: mockSession.mcpStartServerCalls,
				},
			}, {
				callsWhileStopping: {
					stop: [{ serverName }],
					start: [],
				},
				finalCalls: {
					stop: [{ serverName }],
					start: [{ serverName }],
				},
			});
		});

		test('peer chat MCP desired enablement uses parent session customizations', async () => {
			const parentSessionUri = AgentSession.uri('copilot', 'parent-session');
			const peerChatUri = URI.parse(buildChatUri(parentSessionUri, 'peer-1'));
			const serverName = 'slack';
			const id = 'mcp-top-level:copilot:test-session-1:slack';
			const { session, mockSession } = await createAgentSession(disposables, {
				sessionUri: parentSessionUri,
				chatChannelUri: peerChatUri,
				sessionCustomizations: () => [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					// TODO: Step 2 selects the persisted enablement scope.
					enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
					state: { kind: McpServerStatus.Starting },
				}],
				configureMockSession: mock => {
					mock.mcpListResult = { servers: [{ name: serverName, status: 'pending' }] };
				},
			});

			await session.send('keep Slack disabled');

			assert.deepStrictEqual({
				disableCalls: mockSession.mcpDisableCalls,
				effectiveEnabled: isCustomizationEnabled(session.topLevelMcpCustomizations()[0] ?? {}),
			}, {
				disableCalls: [{ serverName }],
				effectiveEnabled: false,
			});
		});

		test('keeps a disabled plugin MCP child disabled after a runtime reconfiguration', async () => {
			const serverName = 'slack';
			const serverId = 'plugin-1/mcp/slack';
			const { session, mockSession } = await createAgentSession(disposables, {
				sessionCustomizations: () => [{
					type: CustomizationType.Plugin,
					id: 'plugin-1',
					uri: 'file:///plugin',
					name: 'Slack Plugin',
					children: [{
						type: CustomizationType.McpServer,
						id: serverId,
						uri: 'file:///plugin/package.json',
						name: serverName,
						// TODO: Step 2 selects the persisted enablement scope.
						enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
						state: { kind: McpServerStatus.Starting },
					}],
				}],
				configureMockSession: mock => {
					mock.mcpListResult = { servers: [{ name: serverName, status: 'pending' }] };
				},
			});

			await session.send('keep MCP server disabled');
			mockSession.fire('session.mcp_servers_loaded', { servers: [{ name: serverName, status: 'not_configured' }] });
			await session.send('keep MCP server disabled after reconfiguration');

			assert.deepStrictEqual({
				disableCalls: mockSession.mcpDisableCalls,
				enableCalls: mockSession.mcpEnableCalls,
			}, {
				disableCalls: [{ serverName }],
				enableCalls: [],
			});
		});

		test('MCP authentication uses current child enablement and permits unknown servers', async () => {
			const serverName = 'slack';
			const serverId = 'plugin-1/mcp/slack';
			let enabled = false;
			const customizations = (): readonly Customization[] => [{
				type: CustomizationType.Plugin,
				id: 'plugin-1',
				uri: 'file:///plugin',
				name: 'Slack Plugin',
				children: [{
					type: CustomizationType.McpServer,
					id: serverId,
					uri: 'file:///plugin/package.json',
					name: serverName,
					state: { kind: McpServerStatus.Starting },
				}],
			}];
			const { session, runtime, waitForSignal } = await createAgentSession(disposables, {
				clientSnapshot: {
					tools: [],
					plugins: [{
						format: PluginFormat.Copilot,
						hooks: [],
						mcpServers: [],
						disabledMcpServers: [serverName],
						agents: [],
						skills: [],
						instructions: [],
					}],
					mcpServers: {},
				},
				sessionCustomizations: customizations,
				resolveCustomizationEnablement: target => ({
					kind: 'resolved',
					enablement: target.id === serverId && !enabled
						? [{ kind: CustomizationEnablementKind.Session, enabled: false }]
						: [],
					enabled,
					workingDirectory: { kind: 'workspaceless' },
				}),
			});

			const request = {
				requestId: 'auth-enable-transition',
				serverName,
				serverUrl: 'https://mcp.example.com',
				reason: 'upscope' as const,
			};
			const disabledResult = await runtime.handleMcpAuthRequest(request, { sessionId: 'test-session-1' });

			enabled = true;
			const authPromise = runtime.handleMcpAuthRequest({ ...request, requestId: 'auth-enabled' }, { sessionId: 'test-session-1' });
			await waitForSignal(signal => isAction(signal, ActionType.SessionMcpServerStateChanged));
			await session.resolveMcpAuthentication({ resource: 'https://mcp.example.com', scopes: [], token: 'enabled-token' });

			const { session: unknownSession, runtime: unknownRuntime, waitForSignal: waitForUnknownSignal } = await createAgentSession(disposables);
			const unknownAuthPromise = unknownRuntime.handleMcpAuthRequest({
				requestId: 'auth-unknown',
				serverName: 'unknown',
				serverUrl: 'https://unknown.example.com',
				reason: 'upscope',
			}, { sessionId: 'test-session-1' });
			await waitForUnknownSignal(signal => isAction(signal, ActionType.SessionCustomizationUpdated));
			await unknownSession.resolveMcpAuthentication({ resource: 'https://unknown.example.com', scopes: [], token: 'unknown-token' });

			assert.deepStrictEqual({
				disabledResult,
				enabledResult: await authPromise,
				unknownResult: await unknownAuthPromise,
			}, {
				disabledResult: null,
				enabledResult: { kind: 'token', accessToken: 'enabled-token' },
				unknownResult: { kind: 'token', accessToken: 'unknown-token' },
			});
		});

		test('reconciles a workspace-disabled plugin child when customizations are republished', async () => {
			const serverName = 'azure';
			const serverId = 'plugin-1/mcp/azure';
			let pluginEnabled = true;
			const customizations = (): readonly Customization[] => [{
				type: CustomizationType.Plugin,
				id: 'plugin-1',
				uri: 'file:///plugin',
				name: 'Azure Plugin',
				...(!pluginEnabled ? {
					enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: false }],
				} : {}),
				children: [{
					type: CustomizationType.McpServer,
					id: serverId,
					uri: 'file:///plugin/package.json',
					name: serverName,
					state: { kind: McpServerStatus.Starting },
				}],
			}];
			const { mockSession, dispatchSessionAction } = await createAgentSession(disposables, {
				sessionCustomizations: customizations,
				configureMockSession: mock => {
					mock.mcpListResult = { servers: [{ name: serverName, status: 'connected' }] };
				},
			});

			pluginEnabled = false;
			dispatchSessionAction({
				type: ActionType.SessionCustomizationsChanged,
				customizations: [...customizations()],
			});
			await timeout(0);

			assert.deepStrictEqual(mockSession.mcpDisableCalls, [{ serverName }]);
		});

		test('disabling an MCP server cancels its pending authentication before awaiting the SDK', async () => {
			const serverName = 'slack';
			const id = 'mcp-top-level:copilot:test-session-1:slack';
			let desiredEnabled = true;
			const { session, mockSession, runtime } = await createAgentSession(disposables, {
				sessionCustomizations: () => [{
					type: CustomizationType.McpServer,
					id,
					uri: id,
					name: serverName,
					...(!desiredEnabled ? {
						// TODO: Step 2 selects the persisted enablement scope.
						enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
					} : {}),
					state: { kind: McpServerStatus.Starting },
				}],
				configureMockSession: mock => {
					mock.mcpListResult = { servers: [{ name: serverName, status: 'pending' }] };
				},
			});
			const authPromise = runtime.handleMcpAuthRequest({
				requestId: 'auth-disable',
				serverName,
				serverUrl: 'https://mcp.slack.com/mcp',
				reason: 'initial',
				resourceMetadata: JSON.stringify({
					resource: 'https://mcp.slack.com',
					authorization_servers: ['https://slack.com/oauth'],
				}),
			}, { sessionId: session.sessionId });
			mockSession.mcpDisableGate = authPromise;
			desiredEnabled = false;

			let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
			try {
				await Promise.race([
					session.send('disable Slack'),
					new Promise((_, reject) => {
						timeoutHandle = setTimeout(() => reject(new Error('Timed out disabling Slack')), 1000);
					}),
				]);
			} finally {
				clearTimeout(timeoutHandle);
			}

			assert.deepStrictEqual({
				authResult: await authPromise,
				disableCalls: mockSession.mcpDisableCalls,
			}, {
				authResult: { kind: 'cancelled' },
				disableCalls: [{ serverName }],
			});
		});

		test('tool-triggered MCP auth transitions the active MCP tool call until authentication resolves', async () => {
			const { session, mockSession, runtime, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-auth');
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tool-auth',
				toolName: 'mcp_tool',
				mcpServerName: 'github',
				arguments: { owner: 'microsoft', repo: 'vscode' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const authPromise = runtime.handleMcpAuthRequest({
				requestId: 'auth-tool',
				serverName: 'github',
				serverUrl: 'https://api.githubcopilot.com/mcp/',
				reason: 'upscope',
				resourceMetadata: JSON.stringify({
					resource: 'https://api.githubcopilot.com/mcp/',
					resource_name: 'GitHub MCP Server',
					authorization_servers: ['https://github.com/login/oauth'],
					scopes_supported: ['repo', 'notifications'],
				}),
				wwwAuthenticateParams: { scope: 'repo notifications', error: 'insufficient_scope' },
			}, { sessionId: 'test-session-1' });
			await timeout(0);

			const beforeResolve = getActions(signals)
				.filter(action => action.type === ActionType.ChatToolCallAuthRequired)
				.map(action => action.type === ActionType.ChatToolCallAuthRequired ? action : undefined);
			const resolved = await session.resolveMcpAuthentication({
				resource: 'https://api.githubcopilot.com/mcp/',
				scopes: ['repo', 'notifications'],
				token: 'token',
			});
			await authPromise;
			const afterResolve = getActions(signals)
				.filter(action => action.type === ActionType.ChatToolCallAuthResolved)
				.map(action => action.type === ActionType.ChatToolCallAuthResolved ? action : undefined);

			assert.deepStrictEqual({
				beforeResolve,
				resolved,
				afterResolve,
			}, {
				beforeResolve: [{
					type: ActionType.ChatToolCallAuthRequired,
					turnId: 'turn-auth',
					toolCallId: 'tool-auth',
					auth: {
						reason: McpAuthRequiredReason.InsufficientScope,
						resource: {
							resource: 'https://api.githubcopilot.com/mcp/',
							resource_name: 'GitHub MCP Server',
							authorization_servers: ['https://github.com/login/oauth'],
							scopes_supported: ['repo', 'notifications'],
						},
						requiredScopes: ['repo', 'notifications'],
						description: 'insufficient_scope',
					},
				}],
				resolved: true,
				afterResolve: [{
					type: ActionType.ChatToolCallAuthResolved,
					turnId: 'turn-auth',
					toolCallId: 'tool-auth',
				}],
			});
		});

		test('client tool completion cancels a pending MCP authentication for that tool call', async () => {
			const { session, mockSession, runtime } = await createAgentSession(disposables);
			session.resetTurnState('turn-auth-cancel');
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tool-auth-cancel',
				toolName: 'mcp_tool',
				mcpServerName: 'github',
			} as SessionEventPayload<'tool.execution_start'>['data']);
			const authPromise = runtime.handleMcpAuthRequest({
				requestId: 'auth-tool-cancel',
				serverName: 'github',
				serverUrl: 'https://api.githubcopilot.com/mcp/',
				reason: 'upscope',
				wwwAuthenticateParams: { scope: 'notifications', error: 'insufficient_scope' },
			}, { sessionId: 'test-session-1' });

			session.handleClientToolCallComplete('tool-auth-cancel', {
				success: false,
				pastTenseMessage: 'Cancelled tool call',
				error: { message: 'MCP authentication was cancelled', code: 'cancelled' },
			});

			assert.deepStrictEqual(await authPromise, { kind: 'cancelled' });
		});

		test('client tool completion preserves shared MCP authentication for other tool calls', async () => {
			const { session, mockSession, runtime, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-shared-auth');
			for (const toolCallId of ['tool-auth-cancel', 'tool-auth-continue']) {
				mockSession.fire('tool.execution_start', {
					toolCallId,
					toolName: 'mcp_tool',
					mcpServerName: 'github',
				} as SessionEventPayload<'tool.execution_start'>['data']);
			}
			const authPromise = runtime.handleMcpAuthRequest({
				requestId: 'shared-auth',
				serverName: 'github',
				serverUrl: 'https://api.githubcopilot.com/mcp/',
				reason: 'upscope',
				wwwAuthenticateParams: { scope: 'notifications', error: 'insufficient_scope' },
			}, { sessionId: 'test-session-1' });

			session.handleClientToolCallComplete('tool-auth-cancel', {
				success: false,
				pastTenseMessage: 'Cancelled tool call',
				error: { message: 'MCP authentication was cancelled', code: 'cancelled' },
			});
			const resolved = await session.resolveMcpAuthentication({
				resource: 'https://api.githubcopilot.com/mcp/',
				scopes: ['notifications'],
				token: 'token',
			});

			assert.deepStrictEqual({
				resolved,
				authResult: await authPromise,
				resolvedToolCalls: getActions(signals)
					.filter(action => action.type === ActionType.ChatToolCallAuthResolved)
					.map(action => action.type === ActionType.ChatToolCallAuthResolved ? action.toolCallId : undefined),
			}, {
				resolved: true,
				authResult: { kind: 'token', accessToken: 'token' },
				resolvedToolCalls: ['tool-auth-continue'],
			});
		});

		test('initial GitHub MCP auth reuses the existing token without requesting the advertised scope catalog', async () => {
			const { runtime, signals } = await createAgentSession(disposables, { githubToken: 'existing-token' });

			const result = await runtime.handleMcpAuthRequest({
				requestId: 'faa18cc1-fe2d-492a-8350-9faa4bbb5389',
				serverName: 'github',
				serverUrl: 'https://api.githubcopilot.com/mcp/',
				reason: 'initial',
				resourceMetadata: JSON.stringify({
					resource: 'https://api.githubcopilot.com/mcp/',
					resource_name: 'GitHub MCP Server',
					authorization_servers: ['https://github.com/login/oauth'],
					scopes_supported: ['repo', 'read:org', 'read:user', 'user:email', 'read:packages', 'write:packages', 'read:project', 'project', 'gist', 'notifications', 'workflow', 'codespace'],
				}),
				wwwAuthenticateParams: {
					resourceMetadataUrl: 'https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/',
					error: 'invalid_request',
				},
			}, { sessionId: 'test-session-1' });

			assert.deepStrictEqual({
				result,
				customizationUpdates: getActions(signals).filter(action => action.type === ActionType.SessionCustomizationUpdated),
			}, {
				result: { kind: 'token', accessToken: 'existing-token' },
				customizationUpdates: [],
			});
		});

		test('initial GitHub MCP auth reuses the existing token for the per-user enterprise endpoint', async () => {
			const { runtime, signals } = await createAgentSession(disposables, {
				githubToken: 'existing-enterprise-token',
				copilotApiEndpoint: 'https://api.enterprise.githubcopilot.com',
			});

			const result = await runtime.handleMcpAuthRequest({
				requestId: 'enterprise-initial-auth',
				serverName: 'github',
				serverUrl: 'https://api.enterprise.githubcopilot.com/mcp/',
				reason: 'initial',
			}, { sessionId: 'test-session-1' });

			assert.deepStrictEqual({
				result,
				customizationUpdates: getActions(signals).filter(action => action.type === ActionType.SessionCustomizationUpdated),
			}, {
				result: { kind: 'token', accessToken: 'existing-enterprise-token' },
				customizationUpdates: [],
			});
		});

		test('MCP auth request publishes authRequired state and resolves with authenticate token', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables, { githubToken: 'existing-token' });

			const authPromise = runtime.handleMcpAuthRequest({
				requestId: 'auth-1',
				serverName: 'github',
				serverUrl: 'https://api.githubcopilot.com/mcp',
				reason: 'upscope',
				staticClientConfig: {
					clientId: 'configured-client-id',
					clientSecret: 'configured-client-secret',
					publicClient: false,
				},
				resourceMetadata: JSON.stringify({
					resource: 'https://api.githubcopilot.com/mcp',
					resource_name: 'GitHub MCP Server',
					authorization_servers: ['https://github.com/login/oauth'],
					scopes_supported: ['repo', 'notifications'],
				}),
				wwwAuthenticateParams: { scope: 'repo notifications', error: 'insufficient_scope' },
			}, { sessionId: 'test-session-1' });

			const signal = await waitForSignal(s => isAction(s, ActionType.SessionCustomizationUpdated)) as IAgentActionSignal;
			const action = signal.action as Extract<SessionAction, { type: ActionType.SessionCustomizationUpdated }>;

			assert.deepStrictEqual(action.customization, {
				type: 'mcpServer',
				id: 'mcp-top-level:copilot:test-session-1:github',
				uri: 'mcp-top-level:copilot:test-session-1:github',
				name: 'github',
				state: {
					kind: McpServerStatus.AuthRequired,
					reason: McpAuthRequiredReason.InsufficientScope,
					oauthClient: {
						clientId: 'configured-client-id',
						clientSecret: 'configured-client-secret',
					},
					resource: {
						resource: 'https://api.githubcopilot.com/mcp',
						resource_name: 'GitHub MCP Server',
						authorization_servers: ['https://github.com/login/oauth'],
						scopes_supported: ['repo', 'notifications'],
					},
					requiredScopes: ['repo', 'notifications'],
					description: 'insufficient_scope',
				},
				channel: undefined,
				mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } },
			});

			assert.strictEqual(await session.resolveMcpAuthentication({ resource: 'https://api.githubcopilot.com/mcp', scopes: ['repo', 'notifications'], token: 'token-1' }), true);
			assert.deepStrictEqual(await authPromise, { kind: 'token', accessToken: 'token-1' });
		});

		test('initial auth for a server impersonating the GitHub MCP name uses the normal auth flow', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables, { githubToken: 'existing-token' });

			const authPromise = runtime.handleMcpAuthRequest({
				requestId: 'auth-lookalike',
				serverName: 'github',
				serverUrl: 'https://mcp.example.com',
				reason: 'initial',
				staticClientConfig: {
					clientId: 'public-client-id',
					publicClient: true,
				},
				resourceMetadata: JSON.stringify({
					resource: 'https://mcp.example.com',
					resource_name: 'Lookalike MCP',
					authorization_servers: ['https://github.com/login/oauth'],
					scopes_supported: ['repo'],
				}),
			}, { sessionId: 'test-session-1' });

			const signal = await waitForSignal(signal => isAction(signal, ActionType.SessionCustomizationUpdated)) as IAgentActionSignal;
			const customization = (signal.action as Extract<SessionAction, { type: ActionType.SessionCustomizationUpdated }>).customization;
			if (customization.type !== CustomizationType.McpServer) {
				assert.fail(`Expected MCP server customization, got ${customization.type}`);
			}
			const resolved = await session.resolveMcpAuthentication({ resource: 'https://mcp.example.com', scopes: ['repo'], token: 'interactive-token' });

			assert.deepStrictEqual({
				resolved,
				result: await authPromise,
				oauthClient: customization.state.kind === McpServerStatus.AuthRequired ? customization.state.oauthClient : undefined,
				requiredScopes: customization.state.kind === McpServerStatus.AuthRequired ? customization.state.requiredScopes : undefined,
				supportedScopes: customization.state.kind === McpServerStatus.AuthRequired ? customization.state.resource.scopes_supported : undefined,
			}, {
				resolved: true,
				result: { kind: 'token', accessToken: 'interactive-token' },
				oauthClient: { clientId: 'public-client-id' },
				requiredScopes: undefined,
				supportedScopes: ['repo'],
			});
		});

		test('needs-auth status remains starting when no auth request details are available', async () => {
			const { mockSession, waitForSignal } = await createAgentSession(disposables);

			mockSession.fire('session.mcp_server_status_changed', {
				serverName: 'github',
				status: 'needs-auth',
			} as SessionEventPayload<'session.mcp_server_status_changed'>['data']);

			const signal = await waitForSignal(s => isAction(s, ActionType.SessionCustomizationUpdated)) as IAgentActionSignal;
			const action = signal.action as Extract<SessionAction, { type: ActionType.SessionCustomizationUpdated }>;
			assert.strictEqual(action.customization.type, 'mcpServer');
			assert.deepStrictEqual(action.customization.state, { kind: McpServerStatus.Starting });
		});

		test('seeds inventory from rpc.mcp.list at subscription time', async () => {
			const { signals, waitForSignal } = await createAgentSession(disposables, {
				configureMockSession: m => {
					m.mcpListResult = {
						servers: [
							{ name: 'alpha', status: 'connected' },
							{ name: 'beta', status: 'pending' },
						],
					};
				},
			});

			await waitForSignal(s => isAction(s, ActionType.SessionCustomizationUpdated));
			// Give the seed's microtask chain time to apply both servers.
			await timeout(0);

			const updates = getActions(signals).filter(a => a.type === ActionType.SessionCustomizationUpdated);
			const names = updates.map(a => (a as { customization: { name: string } }).customization.name).sort();
			assert.deepStrictEqual(names, ['alpha', 'beta']);
		});

		test('logs a warning and continues when rpc.mcp.list rejects', async () => {
			const logService = new CapturingLogService();
			const { mockSession, waitForSignal } = await createAgentSession(disposables, {
				logService,
				configureMockSession: m => { m.mcpListError = new Error('boom'); },
			});
			// Allow the rejected promise to surface.
			await timeout(0);
			await timeout(0);

			assert.ok(
				logService.warnings.some(w => w.message.includes('Failed to seed MCP server inventory')),
				`expected seed-failure warning, got: ${JSON.stringify(logService.warnings)}`,
			);

			// Subsequent live events still flow through the normal pipeline.
			mockSession.fire('session.mcp_servers_loaded', {
				servers: [{ name: 'late', status: 'connected' }],
			} as SessionEventPayload<'session.mcp_servers_loaded'>['data']);
			await waitForSignal(s => isAction(s, ActionType.SessionCustomizationUpdated));
		});

		test('a failed MCP server logs at error with structured attributes and preserves the failure detail', async () => {
			const logService = new CapturingLogService();
			const { mockSession, waitForSignal } = await createAgentSession(disposables, { logService });

			mockSession.fire('session.mcp_server_status_changed', {
				serverName: 'db',
				status: 'failed',
				error: 'connection refused',
			} as SessionEventPayload<'session.mcp_server_status_changed'>['data']);

			const signal = await waitForSignal(s => isAction(s, ActionType.SessionCustomizationUpdated)) as IAgentActionSignal;
			const action = signal.action as Extract<SessionAction, { type: ActionType.SessionCustomizationUpdated }>;
			const record = logService.errors.find(e => String(e.first).includes('MCP server \'db\''));

			assert.deepStrictEqual({
				state: action.customization.type === 'mcpServer' ? action.customization.state : undefined,
				body: record ? String(record.first).replace(/^\[Copilot:[^\]]*\]\s*/, '') : undefined,
				attributes: record?.args[0] instanceof OtelData ? record.args[0].attributes : undefined,
			}, {
				state: { kind: McpServerStatus.Error, error: { errorType: 'mcp-server-failed', message: 'connection refused' } },
				body: 'MCP server \'db\' failed (error): connection refused',
				attributes: { mcpEvent: 'statusChanged', mcpServer: 'db', mcpStatus: 'failed', mcpState: 'error', errorType: 'mcp-server-failed' },
			});
		});

		test('an MCP lifecycle change logs at info with the SDK-reported metadata', async () => {
			const logService = new CapturingLogService();
			const { mockSession, waitForSignal } = await createAgentSession(disposables, { logService });

			mockSession.fire('session.mcp_servers_loaded', {
				servers: [{ name: 'docs', status: 'connected', source: 'plugin', transport: 'stdio', pluginName: 'acme', pluginVersion: '1.2.3' }],
			} as SessionEventPayload<'session.mcp_servers_loaded'>['data']);
			await waitForSignal(s => isAction(s, ActionType.SessionCustomizationUpdated));

			const record = logService.infos.find(i => i.message.includes('MCP server \'docs\''));
			assert.deepStrictEqual(record?.args[0] instanceof OtelData ? record.args[0].attributes : undefined, {
				mcpEvent: 'loaded',
				mcpServer: 'docs',
				mcpStatus: 'connected',
				mcpState: 'ready',
				mcpSource: 'plugin',
				mcpTransport: 'stdio',
				mcpPlugin: 'acme',
				mcpPluginVersion: '1.2.3',
			});
		});

		test('an unchanged MCP status is not logged twice', async () => {
			const logService = new CapturingLogService();
			// Seeding the same server keeps the first log deterministic regardless
			// of when the rpc seed and the live events interleave.
			const { mockSession, waitForSignal } = await createAgentSession(disposables, {
				logService,
				configureMockSession: m => { m.mcpListResult = { servers: [{ name: 'docs', status: 'connected' }] }; },
			});

			mockSession.fire('session.mcp_servers_loaded', { servers: [{ name: 'docs', status: 'connected' }] } as SessionEventPayload<'session.mcp_servers_loaded'>['data']);
			await waitForSignal(s => isAction(s, ActionType.SessionCustomizationUpdated));
			mockSession.fire('session.mcp_servers_loaded', { servers: [{ name: 'docs', status: 'connected' }] } as SessionEventPayload<'session.mcp_servers_loaded'>['data']);
			await timeout(0);

			const docsLogs = logService.infos.filter(i => i.message.includes('MCP server \'docs\''));
			assert.strictEqual(docsLogs.length, 1);
		});
	});

	suite('restricted telemetry', () => {
		test('uses the client request id for model conversation.messageText', async () => {
			const telemetryService = new CapturingRestrictedTelemetryService();
			const { mockSession } = await createAgentSession(disposables, {
				telemetryService,
				restrictedTelemetryContext: {
					restrictedTelemetryEnabled: true,
					trackingId: 'tracking-id',
					telemetryEndpoint: 'https://telemetry.example',
				},
			});

			mockSession.fire('assistant.message', {
				messageId: 'message-1',
				content: 'model response',
				clientRequestId: 'client-request-id',
				serviceRequestId: 'service-request-id',
			} as SessionEventPayload<'assistant.message'>['data']);
			await timeout(0);

			assert.deepStrictEqual(telemetryService.events
				.filter(event => event.eventName === 'conversation.messageText')
				.map(event => ({ destination: event.destination, headerRequestId: event.properties?.headerRequestId })), [
				{ destination: 'enhanced', headerRequestId: 'client-request-id' },
				{ destination: 'internal', headerRequestId: 'client-request-id' },
			]);
		});

		test('emits automode.routerDecisionRestricted from root Auto mode resolution', async () => {
			const telemetryService = new CapturingRestrictedTelemetryService();
			const { session, mockSession } = await createAgentSession(disposables, {
				telemetryService,
				restrictedTelemetryContext: {
					restrictedTelemetryEnabled: true,
					trackingId: 'tracking-id',
					telemetryEndpoint: 'https://telemetry.example',
				},
			});
			session.resetTurnState('turn-auto', undefined, AgentHostClientType.AgentsWindow);

			mockSession.fire('session.auto_mode_resolved', {
				chosenModel: 'subagent-model',
			} as SessionEventPayload<'session.auto_mode_resolved'>['data'], { agentId: 'subagent-1' });
			mockSession.fire('session.auto_mode_resolved', {
				chosenModel: 'gpt-5',
				predictedLabel: 'needs_reasoning',
				confidence: 0.91,
				candidateModels: ['gpt-5', 'gpt-4.1'],
				categoryScores: { needs_reasoning: 0.9, no_reasoning: 0.1 },
				routingMethod: 'binary',
				availableModels: ['gpt-5', 'gpt-4.1', 'gpt-5-mini'],
				fallback: false,
				fallbackReason: 'not-needed',
				stickyOverride: true,
				routerLatencyMs: 25,
				endToEndLatencyMs: 40,
				chosenShortfall: 0.05,
				hasImage: true,
			} as SessionEventPayload<'session.auto_mode_resolved'>['data']);

			assert.deepStrictEqual(telemetryService.events
				.filter(event => event.eventName === 'automode.routerDecisionRestricted')
				.map(event => ({ destination: event.destination, properties: event.properties, measurements: event.measurements })), [{
					destination: 'enhanced',
					properties: {
						conversationId: 'test-session-1',
						vscodeRequestId: 'turn-auto',
						initiatorClientType: 'agents_window',
						predictedLabel: 'needs_reasoning',
						routingMethod: 'binary',
						fallback: 'false',
						fallbackReason: 'not-needed',
						candidateModel: 'gpt-5',
						chosenModel: 'gpt-5',
						candidateModels: JSON.stringify(['gpt-5', 'gpt-4.1']),
						availableModels: JSON.stringify(['gpt-5', 'gpt-4.1', 'gpt-5-mini']),
						stickyOverrideStr: 'true',
						hasImage: 'true',
						binaryScores: JSON.stringify({ needs_reasoning: 0.9, no_reasoning: 0.1 }),
					},
					measurements: {
						confidence: 0.91,
						latencyMs: 25,
						e2eLatencyMs: 40,
						stickyOverride: 1,
						chosenShortfall: 0.05,
						scoreNeedsReasoning: 0.9,
						scoreNoReasoning: 0.1,
					},
				}]);
		});
	});

	suite('repoInfo telemetry', () => {
		test('captures one begin and end across root SDK rounds', async () => {
			const workingDirectory = URI.file('/repo');
			const gitService: IAgentHostGitService = {
				...createNoopGitService(),
				getRepositoryRoot: async () => workingDirectory,
				getSessionGitState: async () => ({ branchName: 'feature', baseBranchName: 'main' }),
				getFetchRemoteUrls: async () => ['https://github.com/microsoft/vscode'],
				resolveBranchBaselineCommit: async () => 'base',
				getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 10 }),
				captureWorkingTreeAsTree: async () => 'tree',
				computeFileDiffsBetweenRefs: async () => [],
			};
			const telemetryService = new CapturingRestrictedTelemetryService();
			const { session, mockSession } = await createAgentSession(disposables, {
				workingDirectory,
				gitService,
				telemetryService,
				githubToken: 'github-token',
				restrictedTelemetryContext: {
					restrictedTelemetryEnabled: true,
					trackingId: 'tracking-id',
					telemetryEndpoint: 'https://telemetry.example',
					isInternal: true,
					userName: 'octocat',
					isVscodeTeamMember: true,
					copilotIgnoreEnabled: false,
				},
			});

			mockSession.fire('assistant.turn_start', { turnId: 'subagent-turn' }, { agentId: 'subagent-1' });
			mockSession.fire('assistant.turn_end', { turnId: 'subagent-turn' }, { agentId: 'subagent-1' });
			session.resetTurnState('request-1', undefined, AgentHostClientType.EditorWindow);
			mockSession.fire('assistant.turn_start', { turnId: 'root-round-1' });
			await timeout(0);
			mockSession.fire('assistant.turn_end', { turnId: 'root-round-1' });
			mockSession.fire('assistant.turn_start', { turnId: 'root-round-2' });
			mockSession.fire('assistant.turn_end', { turnId: 'root-round-2' });
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);
			await timeout(0);

			assert.deepStrictEqual(telemetryService.events
				.filter(event => event.eventName === 'request.repoInfo')
				.map(event => ({ destination: event.destination, initiatorClientType: event.properties?.initiatorClientType, location: event.properties?.location, telemetryMessageId: event.properties?.telemetryMessageId, result: event.properties?.result })), [
				{ destination: 'enhanced', initiatorClientType: 'editor_window', location: 'begin', telemetryMessageId: 'request-1', result: 'noChanges' },
				{ destination: 'internal', initiatorClientType: 'editor_window', location: 'begin', telemetryMessageId: 'request-1', result: 'noChanges' },
				{ destination: 'enhanced', initiatorClientType: 'editor_window', location: 'end', telemetryMessageId: 'request-1', result: 'noChanges' },
				{ destination: 'internal', initiatorClientType: 'editor_window', location: 'end', telemetryMessageId: 'request-1', result: 'noChanges' },
			]);
		});

		test('drops an in-flight capture when the launch token is no longer current', async () => {
			let tokenCurrent = true;
			const workingDirectory = URI.file('/repo');
			const telemetryService = new CapturingRestrictedTelemetryService();
			const gitService: IAgentHostGitService = {
				...createNoopGitService(),
				getRepositoryRoot: async () => workingDirectory,
				getSessionGitState: async () => ({ branchName: 'feature', baseBranchName: 'main' }),
				getFetchRemoteUrls: async () => ['https://github.com/microsoft/vscode'],
				resolveBranchBaselineCommit: async () => 'base',
				getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 10 }),
				captureWorkingTreeAsTree: async () => 'tree',
				computeFileDiffsBetweenRefs: async () => [],
			};
			const { mockSession } = await createAgentSession(disposables, {
				workingDirectory,
				gitService,
				telemetryService,
				githubToken: 'github-token',
				isLaunchTokenCurrent: () => tokenCurrent,
				restrictedTelemetryContext: {
					restrictedTelemetryEnabled: true,
					trackingId: 'tracking-id',
					telemetryEndpoint: 'https://telemetry.example',
					isInternal: true,
					userName: 'octocat',
					isVscodeTeamMember: true,
					copilotIgnoreEnabled: false,
				},
			});
			mockSession.fire('assistant.turn_start', { turnId: 'root-turn' });
			tokenCurrent = false;
			await timeout(0);

			assert.deepStrictEqual(telemetryService.events.filter(event => event.eventName === 'request.repoInfo'), []);
		});

		test('does not touch Git when repo-info telemetry is disabled', async () => {
			let gitCalls = 0;
			const { mockSession } = await createAgentSession(disposables, {
				workingDirectory: URI.file('/repo'),
				githubToken: 'github-token',
				rootValues: { [AgentHostDisableRepoInfoTelemetryConfigKey]: true },
				gitService: {
					...createNoopGitService(),
					getSessionGitState: async () => { gitCalls++; return undefined; },
				},
			});

			mockSession.fire('assistant.turn_start', { turnId: 'root-turn' });
			await timeout(0);

			assert.strictEqual(gitCalls, 0);
		});

		test('skips capture when repository telemetry context resolution fails', async () => {
			const logService = new CapturingLogService();
			const telemetryService = new CapturingRestrictedTelemetryService();
			const { mockSession } = await createAgentSession(disposables, {
				workingDirectory: URI.file('/repo'),
				githubToken: 'github-token',
				logService,
				telemetryService,
				restrictedTelemetryContextError: new Error('context failed'),
			});

			mockSession.fire('assistant.turn_start', { turnId: 'root-turn' });
			await timeout(0);
			mockSession.fire('assistant.turn_end', { turnId: 'root-turn' });
			await timeout(0);

			assert.deepStrictEqual({
				events: telemetryService.events.filter(event => event.eventName === 'request.repoInfo'),
				warnings: logService.warnings.map(warning => warning.message).filter(message => message.includes('repository info telemetry context')),
			}, {
				events: [],
				warnings: ['[Copilot:test-session-1] Failed to resolve repository info telemetry context: context failed'],
			});
		});
	});

	suite('instructionsCollected telemetry', () => {

		class CapturingTelemetryService implements ITelemetryService {
			declare readonly _serviceBrand: undefined;
			readonly telemetryLevel = TelemetryLevel.USAGE;
			readonly sendErrorTelemetry = true;
			readonly sessionId = 'sessionId';
			readonly machineId = 'machineId';
			readonly sqmId = 'sqmId';
			readonly devDeviceId = 'devDeviceId';
			readonly firstSessionDate = 'firstSessionDate';

			readonly events: Array<{ eventName: string; data: unknown }> = [];

			publicLog(): void { }
			publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
				this.events.push({ eventName, data });
			}
			publicLogError(): void { }
			publicLogError2(): void { }
			setExperimentProperty(): void { }
			setCommonProperty(): void { }
		}

		function fireUserMessage(mockSession: MockCopilotSession, overrides?: Partial<{ content: string; source: string }>) {
			mockSession.fire('user.message', {
				content: overrides?.content ?? 'hi',
				...(overrides?.source !== undefined ? { source: overrides.source } : {}),
			} as SessionEventPayload<'user.message'>['data']);
		}

		test('emits with counts derived from source types + AH identifiers', async () => {
			const telemetryService = new CapturingTelemetryService();
			const { session, mockSession } = await createAgentSession(disposables, { telemetryService });
			session.resetTurnState('turn-instructions', undefined, AgentHostClientType.EditorWindow, {
				clientType: AgentHostClientType.EditorWindow,
				connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
				transportKind: AgentHostTransportKind.MessagePort,
				hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
				machineId: 'client-machine-id',
				devDeviceId: 'client-dev-device-id',
			});

			mockSession.getInstructionSourcesResult = {
				sources: [
					{ id: 'a', label: '', sourcePath: '.github/copilot-instructions.md', content: '', type: 'repo', location: 'repository' },
					{ id: 'b', label: '', sourcePath: 'AGENTS.md', content: '', type: 'model', location: 'repository' },
					{ id: 'c', label: '', sourcePath: 'CLAUDE.md', content: '', type: 'model', location: 'repository' },
					{ id: 'd', label: '', sourcePath: '.github/instructions/ts.instructions.md', content: '', type: 'vscode', location: 'repository', applyTo: ['**/*.ts'] },
					{ id: 'e', label: '', sourcePath: '.github/instructions/general.instructions.md', content: '', type: 'vscode', location: 'repository' },
					{ id: 'f', label: '', sourcePath: 'nested AGENTS.md', content: '', type: 'nested-agents', location: 'working-directory' },
					{ id: 'g', label: '', sourcePath: 'child instruction files', content: '', type: 'child-instructions', location: 'working-directory' },
				],
			};

			fireUserMessage(mockSession);
			await timeout(0);

			const emitted = telemetryService.events.filter(e => e.eventName === 'agentHost.instructionsCollected');
			assert.deepStrictEqual(emitted, [{
				eventName: 'agentHost.instructionsCollected',
				data: {
					initiatorClientType: 'editor_window',
					initiatorConnectionKind: 'remote_extension_host',
					initiatorTransportKind: 'message_port',
					hostLaunchKind: 'vscode_main_process',
					initiatorMachineId: 'client-machine-id',
					initiatorDevDeviceId: 'client-dev-device-id',
					provider: 'copilot',
					agentSessionId: 'test-session-1',
					isSubagentSession: false,
					totalInstructionsCount: 7,
					agentInstructionsCount: 3, // repo + model + model
					applyingInstructionsCount: 1, // only the ts.instructions.md has applyTo
					referencedInstructionsCount: 2, // nested-agents + child-instructions
					claudeMdCount: 1,
				},
			}]);
			assert.strictEqual(mockSession.getInstructionSourcesCallCount, 1);
		});

		test('skips SDK-injected messages (source !== "user")', async () => {
			const telemetryService = new CapturingTelemetryService();
			const { mockSession } = await createAgentSession(disposables, { telemetryService });

			fireUserMessage(mockSession, { source: 'skill-pdf' });
			await timeout(0);

			assert.strictEqual(telemetryService.events.filter(e => e.eventName === 'agentHost.instructionsCollected').length, 0);
			assert.strictEqual(mockSession.getInstructionSourcesCallCount, 0, 'should short-circuit before the RPC');
		});

		test('skips subagent user messages', async () => {
			const telemetryService = new CapturingTelemetryService();
			const { mockSession } = await createAgentSession(disposables, { telemetryService });

			mockSession.fire('user.message', {
				content: 'delegated prompt',
			} as SessionEventPayload<'user.message'>['data'], { agentId: 'agent-1' });
			await timeout(0);

			assert.deepStrictEqual({
				events: telemetryService.events.filter(e => e.eventName === 'agentHost.instructionsCollected'),
				getSourcesCalls: mockSession.getInstructionSourcesCallCount,
			}, {
				events: [],
				getSourcesCalls: 0,
			});
		});

		test('does not emit or leak an unhandled rejection when getSources throws', async () => {
			const telemetryService = new CapturingTelemetryService();
			const { mockSession } = await createAgentSession(disposables, { telemetryService });
			mockSession.getInstructionSourcesError = new Error('rpc unavailable');

			// Any unhandled rejection during this turn would fail the test process.
			fireUserMessage(mockSession);
			await timeout(0);

			assert.strictEqual(telemetryService.events.filter(e => e.eventName === 'agentHost.instructionsCollected').length, 0);
			assert.strictEqual(mockSession.getInstructionSourcesCallCount, 1);
		});
	});
});
