/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import type { AgentInfo, ForkSessionOptions, ForkSessionResult, GetSessionMessagesOptions, McpSdkServerConfigWithInstance, McpServerStatus, ModelInfo, Options, PermissionMode, Query, SDKMessage, SDKSessionInfo, SDKUserMessage, SdkMcpToolDefinition, SessionMessage, SessionMutationOptions, Settings, SlashCommand, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { CCAModel } from '@vscode/copilot-api';

import assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import {
	makeAssistantMessage,
	makeContentBlockStartText,
	makeContentBlockStartThinking,
	makeContentBlockStartToolUse,
	makeContentBlockStop,
	makeMessageStart,
	makeMessageStop,
	makeResultSuccess,
	makeStreamEvent,
	makeSystemInitMessage,
	makeTextDelta,
	makeThinkingDelta,
	makeUserToolResultMessage,
} from './claudeMapSessionEventsTestUtils.js';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { isUUID } from '../../../../base/common/uuid.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { Schemas } from '../../../../base/common/network.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IAgentChatDataChange, IAgentMaterializeSessionEvent, IAgentSpawnChatEvent, AgentSession, AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../common/agentService.js';
import { AgentFeedbackAttachmentDisplayKind } from '../../common/meta/agentFeedbackAttachments.js';
import { ActionType, type AuthRequiredParams } from '../../common/state/sessionActions.js';
import { CustomizationLoadStatus, CustomizationType, MessageAttachmentKind, MessageKind, ResponsePartKind, ChatInputResponseKind, SessionStatus, ToolResultContentType, buildChatUri, buildDefaultChatUri, buildSubagentChatUri, buildSubagentSessionUri, customizationId, parseChatUri, parseDefaultChatUri, type ClientPluginCustomization, type PluginCustomization } from '../../common/state/sessionState.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ProtectedResourceMetadata, ChatInputAnswerState, ChatInputAnswerValueKind, ToolCallStatus, type SessionConfigState, type ChatInputRequest, type ToolDefinition } from '../../common/state/protocol/state.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { ClaudeAgent, fromSdkModelInfo } from '../../node/claude/claudeAgent.js';
import { ClaudeAgentSession } from '../../node/claude/claudeAgentSession.js';
import { ClaudeSessionMetadataStore } from '../../node/claude/claudeSessionMetadataStore.js';
import { ClaudeAgentSdkService, IClaudeAgentSdkService, IClaudeSdkBindings } from '../../node/claude/claudeAgentSdkService.js';
import { IAgentSdkDownloader } from '../../node/agentSdkDownloader.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { IClaudeProxyCreditsReport, IClaudeProxyHandle, IClaudeProxyService } from '../../node/claude/claudeProxyService.js';
import { resolvePromptToContentBlocks } from '../../node/claude/claudePromptResolver.js';
import { ICopilotApiService, type ICopilotApiServiceRequestOptions } from '../../node/shared/copilotApiService.js';
import { AgentService } from '../../node/agentService.js';
import { createNoopGitService, createNullSessionDataService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

// #region Test fakes

interface IStartCall {
	readonly token: string;
}

/**
 * Enumerate the agent's live peer-chat backings for a session as channel URI
 * strings. Replaces the removed `IAgent.getChats` for tests that assert peer
 * chat lifecycle at the agent level (the orchestrator now owns the durable
 * catalog).
 */
function listPeerChats(agent: ClaudeAgent, session: URI): string[] {
	const backings = (agent as unknown as { _chatBackings: Map<string, unknown> })._chatBackings;
	const sessionId = AgentSession.id(session);
	return [...backings.keys()].filter(key => {
		const parsed = parseChatUri(URI.parse(key));
		return !!parsed && AgentSession.id(URI.parse(parsed.session)) === sessionId;
	});
}

function defaultChatUri(session: URI): URI {
	return URI.parse(buildDefaultChatUri(session));
}

class FakeAgentPluginManager implements IAgentPluginManager {
	declare readonly _serviceBrand: undefined;
	readonly basePath = URI.from({ scheme: 'inmemory', path: '/agentPlugins' });

	syncResult: readonly ISyncedCustomization[] | undefined;
	syncCalls: { clientId: string; customizations: readonly ClientPluginCustomization[] }[] = [];

	async syncCustomizations(
		clientId: string,
		customizations: ClientPluginCustomization[],
		progress?: (status: PluginCustomization) => void,
	): Promise<ISyncedCustomization[]> {
		this.syncCalls.push({ clientId, customizations: [...customizations] });
		if (this.syncResult) {
			if (progress) {
				for (const synced of this.syncResult) {
					progress(synced.customization);
				}
			}
			return [...this.syncResult];
		}
		return [];
	}
}

class FakeClaudeProxyService implements IClaudeProxyService {
	declare readonly _serviceBrand: undefined;

	readonly startCalls: IStartCall[] = [];
	disposeCount = 0;

	/** Tests fire this to simulate a per-request CAPI credits report. */
	readonly onDidReportCreditsEmitter = new Emitter<IClaudeProxyCreditsReport>();
	readonly onDidReportCredits: Event<IClaudeProxyCreditsReport> = this.onDidReportCreditsEmitter.event;

	async start(token: string): Promise<IClaudeProxyHandle> {
		this.startCalls.push({ token });
		return {
			baseUrl: 'http://127.0.0.1:0',
			nonce: `nonce-for-${token}`,
			dispose: () => { this.disposeCount++; },
		};
	}

	dispose(): void { this.onDidReportCreditsEmitter.dispose(); }
}

class FakeCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	models: (token: string, options?: ICopilotApiServiceRequestOptions) => Promise<CCAModel[]> =
		async () => [];

	messages(): never { throw new Error('not used in ClaudeAgent tests'); }
	countTokens(): Promise<Anthropic.MessageTokensCount> { throw new Error('not used in ClaudeAgent tests'); }
	responses(): Promise<Response> { throw new Error('not used in ClaudeAgent tests'); }
	utilityChatCompletion(): Promise<never> { throw new Error('not used in ClaudeAgent tests'); }
	resolveRestrictedTelemetryContext() { return Promise.resolve({ restrictedTelemetryEnabled: false, trackingId: undefined, telemetryEndpoint: undefined }); }
	resolveApiEndpoint() { return Promise.resolve(undefined); }
}

const FakeProductService: IProductService = {
	_serviceBrand: undefined,
	version: '1.0.0-test',
} as IProductService;

// FakeClaudeSubagentResolver removed in the Phase 12 refactor (the
// IClaudeSubagentResolver service no longer exists). Per-session
// subagent state lives on `ClaudeAgentSession.subagents`
// (SubagentRegistry); tests that need to inject inner-tool edges or
// observe spawns reach in via `agent.getSessionForTesting(uri)?.subagents`.

class FakeClaudeAgentSdkService implements IClaudeAgentSdkService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Mutable list returned by {@link listSessions}. Tests assign it
	 * before invoking the agent under test. Defaults to empty so suites
	 * that don't care about session enumeration aren't forced to set it.
	 */
	sessionList: readonly SDKSessionInfo[] = [];
	listSessionsCallCount = 0;

	/**
	 * Phase 6: counts {@link startup} invocations. The Phase-6 contract
	 * is that materialization is the FIRST `startup()` call, so this
	 * field anchors invariants like "non-fork createSession does not
	 * touch the SDK" and "materialize fires exactly once".
	 */
	startupCallCount = 0;

	/**
	 * Captures every {@link Options} argument forwarded to {@link startup}.
	 * Tests assert env strip, abortController identity, sessionId / resume
	 * routing, and the canUseTool stub via this list.
	 */
	readonly capturedStartupOptions: Options[] = [];

	/**
	 * Programmable rejection for {@link startup}. Set per test to simulate
	 * SDK init failure (corrupt postinstall, network error, abort during
	 * init handshake). Cleared automatically after the first throw — set
	 * to a fresh value if a test wants repeated failures.
	 */
	startupRejection: Error | undefined;

	/**
	 * Messages the {@link FakeQuery} produced by `warm.query(...)` will
	 * yield. Tests stage the SDK transcript here before invoking
	 * `sendMessage`. The default empty array means the prompt iterable
	 * is consumed but no messages stream back — useful for tests that
	 * never expect a `result` (e.g. cancellation paths).
	 */
	nextQueryMessages: SDKMessage[] = [];

	/**
	 * Optional async hook invoked between yielded messages. Tests use it
	 * to block the iterator at a specific index so concurrent
	 * `sendMessage` / `disposeSession` / `shutdown` races can be staged
	 * deterministically. Resolves immediately when undefined.
	 */
	queryAdvance: ((index: number) => Promise<void>) | undefined;

	/**
	 * Optional gate awaited by {@link FakeQuery.return}. Models the SDK's
	 * teardown awaiting the subprocess's actual exit, so tests can assert
	 * remove-all defers `deleteSession` until the live query has fully torn
	 * down. Resolves immediately when undefined.
	 */
	queryReturnGate: Promise<void> | undefined;

	/**
	 * Phase 16 — programmable live SDK customization snapshot, read by
	 * {@link FakeQuery.supportedCommands} / `supportedAgents` /
	 * `mcpServerStatus`. `supportedCommands` defaults to `[]`; the other two
	 * stay unmodeled (throwing) until a test opts in, preserving the
	 * snapshot-failure coverage.
	 */
	supportedCommandsResult: SlashCommand[] = [];
	supportedAgentsResult: AgentInfo[] | undefined = undefined;
	mcpServerStatusResult: McpServerStatus[] | undefined = undefined;

	/** Phase 19 — programmable native model enumeration. */
	supportedModelsResult: ModelInfo[] = [];
	supportedModelsCallCount = 0;
	readonly supportedModelsOptions: Options[] = [];

	/** All warm queries produced by {@link startup}. Last entry is the most recent. */
	readonly warmQueries: FakeWarmQuery[] = [];

	/** All queries produced by {@link query} (native model enumeration). */
	readonly enumerationQueries: FakeQuery[] = [];

	/**
	 * Programmable rejection for {@link listSessions}. Set per test to
	 * simulate the SDK dynamic import failing (corrupt postinstall,
	 * missing optional dep). Mirror of {@link startupRejection}.
	 */
	listSessionsRejection: Error | undefined;

	async listSessions(): Promise<readonly SDKSessionInfo[]> {
		this.listSessionsCallCount++;
		if (this.listSessionsRejection) {
			const err = this.listSessionsRejection;
			throw err;
		}
		return this.sessionList;
	}

	async canLoadWithoutDownload(): Promise<boolean> {
		return this.canLoadWithoutDownloadResult;
	}

	/**
	 * Programmable result for {@link canLoadWithoutDownload}. Defaults to
	 * `true` (SDK already local). Set to `false` to simulate the cold-start
	 * case where the SDK isn't downloaded yet — restore-reachable reads
	 * ({@link listSessions}, {@link getSessionInfo} via `getSessionMetadata`,
	 * {@link getSessionMessages}) MUST defer rather than trigger a download.
	 */
	canLoadWithoutDownloadResult = true;

	/**
	 * Fake for {@link IClaudeAgentSdkService.getSessionInfo}. Tests stage
	 * `sessionList` and the fake searches it by id; setting
	 * {@link getSessionInfoOverride} replaces the default lookup
	 * wholesale (used to simulate the "session moved off disk" case).
	 */
	getSessionInfoOverride: ((sessionId: string) => Promise<SDKSessionInfo | undefined>) | undefined;

	getSessionInfoCalls: string[] = [];

	async getSessionInfo(sessionId: string): Promise<SDKSessionInfo | undefined> {
		this.getSessionInfoCalls.push(sessionId);
		if (this.getSessionInfoOverride) {
			return this.getSessionInfoOverride(sessionId);
		}
		return this.sessionList.find(s => s.sessionId === sessionId);
	}

	/**
	 * Phase 13: programmable transcript fetch. Tests stage canned
	 * `SessionMessage[]` per session id; absence resolves to `[]` to match
	 * the SDK's own "session not found" semantics. `getSessionMessagesRejection`
	 * lets tests simulate SDK throw paths (corrupt JSONL, dynamic-import fault).
	 */
	sessionMessagesById = new Map<string, readonly SessionMessage[]>();
	getSessionMessagesCalls: { sessionId: string; options: GetSessionMessagesOptions | undefined }[] = [];
	getSessionMessagesRejection: Error | undefined;

	async getSessionMessages(sessionId: string, options?: GetSessionMessagesOptions): Promise<readonly SessionMessage[]> {
		this.getSessionMessagesCalls.push({ sessionId, options });
		if (this.getSessionMessagesRejection) {
			const err = this.getSessionMessagesRejection;
			throw err;
		}
		return this.sessionMessagesById.get(sessionId) ?? [];
	}

	/**
	 * Phase 12: programmable subagent enumeration. Tests stage
	 * `subagentsBySessionId` keyed by parent session id; absent entries
	 * resolve to `[]`. `listSubagentsRejection` simulates SDK throw paths.
	 */
	subagentsBySessionId = new Map<string, readonly string[]>();
	listSubagentsCalls: { sessionId: string; options: unknown }[] = [];
	listSubagentsRejection: Error | undefined;

	async listSubagents(sessionId: string, options?: unknown): Promise<readonly string[]> {
		this.listSubagentsCalls.push({ sessionId, options });
		if (this.listSubagentsRejection) {
			throw this.listSubagentsRejection;
		}
		return this.subagentsBySessionId.get(sessionId) ?? [];
	}

	/**
	 * Phase 12: programmable subagent transcript fetch. Tests stage canned
	 * messages keyed by `${sessionId}::${agentId}`. Absent entries resolve
	 * to `[]`. `getSubagentMessagesRejection` simulates SDK throw paths.
	 */
	subagentMessagesByKey = new Map<string, readonly SessionMessage[]>();
	getSubagentMessagesCalls: { sessionId: string; agentId: string; options: unknown }[] = [];
	getSubagentMessagesRejection: Error | undefined;

	async getSubagentMessages(sessionId: string, agentId: string, options?: unknown): Promise<readonly SessionMessage[]> {
		this.getSubagentMessagesCalls.push({ sessionId, agentId, options });
		if (this.getSubagentMessagesRejection) {
			throw this.getSubagentMessagesRejection;
		}
		return this.subagentMessagesByKey.get(`${sessionId}::${agentId}`) ?? [];
	}

	/**
	 * Phase 6.5: programmable fork. Tests capture the forwarded
	 * `(sessionId, options)` and program the resulting new session id (or a
	 * rejection). Defaults to a deterministic `forked-<source>` id so suites
	 * that don't care about the exact value don't have to set it.
	 */
	forkSessionCalls: { sessionId: string; options: ForkSessionOptions | undefined }[] = [];
	forkSessionResult: ForkSessionResult | undefined;
	forkSessionRejection: Error | undefined;

	async forkSession(sessionId: string, options?: ForkSessionOptions): Promise<ForkSessionResult> {
		this.forkSessionCalls.push({ sessionId, options });
		if (this.forkSessionRejection) {
			throw this.forkSessionRejection;
		}
		return this.forkSessionResult ?? { sessionId: `forked-${sessionId}` };
	}

	/**
	 * Programmable session deletion (remove-all truncation). Tests
	 * capture the deleted ids; `deleteSessionRejection` simulates SDK throw.
	 */
	deleteSessionCalls: string[] = [];
	deleteSessionRejection: Error | undefined;

	async deleteSession(sessionId: string, _options?: SessionMutationOptions): Promise<void> {
		this.deleteSessionCalls.push(sessionId);
		if (this.deleteSessionRejection) {
			throw this.deleteSessionRejection;
		}
	}

	async startup(params: { options: Options; initializeTimeoutMs?: number }): Promise<WarmQuery> {
		this.startupCallCount++;
		this.capturedStartupOptions.push(params.options);
		if (this.startupAdvance) {
			await this.startupAdvance(this.startupCallCount);
		}
		if (this.startupRejection) {
			const err = this.startupRejection;
			this.startupRejection = undefined;
			throw err;
		}
		const warm = new FakeWarmQuery(this);
		this.warmQueries.push(warm);
		return warm;
	}

	async query(params: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }): Promise<Query> {
		if (params.options) {
			this.supportedModelsOptions.push(params.options);
		}
		if (typeof params.prompt === 'string') {
			throw new Error('FakeClaudeAgentSdkService.query: enumeration always passes an AsyncIterable prompt');
		}
		const query = new FakeQuery(params.prompt, this);
		this.enumerationQueries.push(query);
		return query;
	}

	/**
	 * Optional async hook invoked inside {@link startup} after the call is
	 * counted but before resolving. Tests use it to stage a race where
	 * `setClientTools` lands while a materialize is mid-flight.
	 */
	startupAdvance: ((callIndex: number) => Promise<void>) | undefined;

	/**
	 * Phase 10 — records each per-tool `tool()` call and each
	 * `createSdkMcpServer()` call the agent makes via the
	 * {@link buildClientToolMcpServer} factory. Tests inspect these to
	 * assert the right snapshot reached the SDK; they also inspect
	 * `capturedStartupOptions[n].mcpServers.client.instance` for the
	 * `_stubTools` round-trip.
	 */
	readonly toolCalls: Array<{
		readonly name: string;
		readonly description: string;
		readonly inputSchema: Record<string, any>;
	}> = [];
	readonly createSdkMcpServerCalls: Array<{
		readonly name: string;
		readonly toolNames: readonly string[];
	}> = [];

	async tool(
		name: string,
		description: string,
		inputSchema: Record<string, any>,
		_handler: (args: any, extra: unknown) => Promise<CallToolResult>,
	): Promise<SdkMcpToolDefinition<any>> {
		this.toolCalls.push({ name, description, inputSchema });
		return { name } as unknown as SdkMcpToolDefinition<any>;
	}

	async createSdkMcpServer(options: {
		name: string;
		tools?: Array<SdkMcpToolDefinition<any>>;
	}): Promise<McpSdkServerConfigWithInstance> {
		const toolNames = (options.tools ?? []).map(t => (t as { name: string }).name);
		this.createSdkMcpServerCalls.push({ name: options.name, toolNames });
		return {
			type: 'sdk',
			name: options.name,
			instance: {
				_stubTools: toolNames,
			},
		} as unknown as McpSdkServerConfigWithInstance;
	}
}

/**
 * Test double for `WarmQuery`. Each instance is bound to a single
 * `FakeClaudeAgentSdkService` so mutations to `nextQueryMessages` after
 * `startup()` resolves but before `warm.query(...)` runs still propagate.
 */
class FakeWarmQuery implements WarmQuery {
	queryCallCount = 0;
	asyncDisposeCount = 0;
	closeCount = 0;
	/** The {@link FakeQuery} returned from `query()`. Undefined before. */
	produced: FakeQuery | undefined;

	constructor(private readonly _sdk: FakeClaudeAgentSdkService) { }

	query(prompt: string | AsyncIterable<SDKUserMessage>): Query {
		this.queryCallCount++;
		if (typeof prompt === 'string') {
			throw new Error('FakeWarmQuery: agent host always passes an AsyncIterable, never a string prompt');
		}
		const q = new FakeQuery(prompt, this._sdk);
		this.produced = q;
		return q;
	}

	close(): void {
		this.closeCount++;
	}

	async [Symbol.asyncDispose](): Promise<void> {
		this.asyncDisposeCount++;
	}
}

/**
 * Test double for the SDK's `Query` AsyncGenerator. Snapshots the bound
 * prompt iterable on construction so tests can assert on what the agent
 * actually pushed to the SDK, then yields messages from
 * {@link FakeClaudeAgentSdkService.nextQueryMessages} in order.
 */
class FakeQuery implements AsyncGenerator<SDKMessage, void> {
	/** The iterable passed to `warm.query(...)`. */
	readonly capturedPrompt: AsyncIterable<SDKUserMessage>;

	/** Prompts the agent has actually pushed (drained from `capturedPrompt` by `_collectPrompts`). */
	readonly drainedPrompts: SDKUserMessage[] = [];

	interruptCount = 0;
	returnCount = 0;
	throwCount = 0;
	closeCount = 0;

	/** Modes recorded by `setPermissionMode` calls in plan/turn order. */
	readonly recordedPermissionModes: PermissionMode[] = [];

	/** Phase 9 — SDK ids recorded by `setModel` calls (yield-boundary fan-out). */
	readonly recordedModels: (string | undefined)[] = [];

	/** Phase 9 — settings recorded by `applyFlagSettings` (effortLevel hot-swap). */
	readonly recordedFlagSettings: Settings[] = [];

	private _yieldIndex = 0;

	constructor(prompt: AsyncIterable<SDKUserMessage>, private readonly _sdk: FakeClaudeAgentSdkService) {
		this.capturedPrompt = prompt;
		const iterator = prompt[Symbol.asyncIterator]();
		// Drain the prompt iterable in the background so the agent's
		// `_pendingPromptDeferred.complete()` actually pumps the queue.
		// The real SDK consumes prompts as they arrive; this fake mirrors
		// that pull behavior without waiting for the full transcript first.
		void (async () => {
			while (true) {
				const r = await iterator.next();
				if (r.done) {
					return;
				}
				this.drainedPrompts.push(r.value);
			}
		})();
	}

	[Symbol.asyncIterator](): AsyncGenerator<SDKMessage, void> {
		return this;
	}

	async next(): Promise<IteratorResult<SDKMessage, void>> {
		if (this._sdk.queryAdvance) {
			await this._sdk.queryAdvance(this._yieldIndex);
		}
		if (this._yieldIndex >= this._sdk.nextQueryMessages.length) {
			return { done: true, value: undefined };
		}
		const value = this._sdk.nextQueryMessages[this._yieldIndex++];
		return { done: false, value };
	}

	async return(_value: void): Promise<IteratorResult<SDKMessage, void>> {
		this.returnCount++;
		if (this._sdk.queryReturnGate) {
			await this._sdk.queryReturnGate;
		}
		return { done: true, value: undefined };
	}

	async throw(err: unknown): Promise<IteratorResult<SDKMessage, void>> {
		this.throwCount++;
		throw err;
	}

	async interrupt(): Promise<void> {
		this.interruptCount++;
	}

	// Phase 6 doesn't exercise the rest of the Query control surface; if a
	// test trips one of these, surface it loudly so we know to model it.
	async setPermissionMode(mode: PermissionMode): Promise<void> {
		this.recordedPermissionModes.push(mode);
	}
	async setModel(model?: string): Promise<void> { this.recordedModels.push(model); }
	setMcpPermissionModeOverride(): never { throw new Error('FakeQuery: setMcpPermissionModeOverride not modeled'); }
	setMaxThinkingTokens(): never { throw new Error('FakeQuery: setMaxThinkingTokens not modeled'); }
	async applyFlagSettings(s: Settings): Promise<void> { this.recordedFlagSettings.push(s); }
	initializationResult(): never { throw new Error('FakeQuery: initializationResult not modeled'); }
	reinitialize(): never { throw new Error('FakeQuery: reinitialize not modeled'); }

	supportedCommands(): never {
		return Promise.resolve(this._sdk.supportedCommandsResult) as never;
	}
	supportedModels(): Promise<ModelInfo[]> {
		this._sdk.supportedModelsCallCount++;
		return Promise.resolve(this._sdk.supportedModelsResult);
	}
	supportedAgents(): never {
		if (this._sdk.supportedAgentsResult === undefined) { throw new Error('FakeQuery: supportedAgents not modeled'); }
		return Promise.resolve(this._sdk.supportedAgentsResult) as never;
	}
	mcpServerStatus(): never {
		if (this._sdk.mcpServerStatusResult === undefined) { throw new Error('FakeQuery: mcpServerStatus not modeled'); }
		return Promise.resolve(this._sdk.mcpServerStatusResult) as never;
	}
	getContextUsage(): never { throw new Error('FakeQuery: getContextUsage not modeled'); }
	usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET(): never { throw new Error('FakeQuery: usage_EXPERIMENTAL not modeled'); }
	/** Phase 11 — programmable tool-name snapshot returned by `reloadPlugins()`. */
	reloadPluginsResults: readonly string[][] = [];
	reloadPluginsCallCount = 0;
	reloadPlugins(): never {
		this.reloadPluginsCallCount++;
		const idx = Math.min(this.reloadPluginsCallCount - 1, this.reloadPluginsResults.length - 1);
		const names = this.reloadPluginsResults[idx] ?? [];
		return Promise.resolve({
			commands: names.map(name => ({ name, description: '', argumentHint: '' })),
			agents: [],
			plugins: [],
			mcpServers: [],
			error_count: 0,
		}) as never;
	}
	accountInfo(): never { throw new Error('FakeQuery: accountInfo not modeled'); }
	rewindFiles(): never { throw new Error('FakeQuery: rewindFiles not modeled'); }
	readFile(): never { throw new Error('FakeQuery: readFile not modeled'); }
	seedReadState(): never { throw new Error('FakeQuery: seedReadState not modeled'); }
	reconnectMcpServer(): never { throw new Error('FakeQuery: reconnectMcpServer not modeled'); }
	toggleMcpServer(): never { throw new Error('FakeQuery: toggleMcpServer not modeled'); }
	setMcpServers(): never { throw new Error('FakeQuery: setMcpServers not modeled'); }
	streamInput(): never { throw new Error('FakeQuery: streamInput not modeled'); }
	stopTask(): never { throw new Error('FakeQuery: stopTask not modeled'); }
	reloadSkills(): never { throw new Error('FakeQuery: reloadSkills not modeled'); }
	backgroundTasks(): never { throw new Error('FakeQuery: backgroundTasks not modeled'); }
	close(): void { this.closeCount++; }
	[Symbol.asyncDispose](): Promise<void> { return Promise.resolve(); }
}

/**
 * Wraps a delegate {@link ISessionDataService} and records call counts so
 * tests can assert that lifecycle methods (e.g. non-fork `createSession`)
 * don't touch the database. The delegate's behavior is preserved verbatim.
 */
class RecordingSessionDataService implements ISessionDataService {
	declare readonly _serviceBrand: undefined;

	openDatabaseCallCount = 0;
	tryOpenDatabaseCallCount = 0;

	constructor(private readonly _delegate: ISessionDataService) { }

	getSessionDataDir(session: URI) { return this._delegate.getSessionDataDir(session); }
	getSessionDataDirById(sessionId: string) { return this._delegate.getSessionDataDirById(sessionId); }
	openDatabase(session: URI) {
		this.openDatabaseCallCount++;
		return this._delegate.openDatabase(session);
	}
	tryOpenDatabase(session: URI) {
		this.tryOpenDatabaseCallCount++;
		return this._delegate.tryOpenDatabase(session);
	}
	deleteSessionData(session: URI) { return this._delegate.deleteSessionData(session); }
	get onWillDeleteSessionData() { return this._delegate.onWillDeleteSessionData; }
	cleanupOrphanedData(knownSessionIds: Set<string>) { return this._delegate.cleanupOrphanedData(knownSessionIds); }
	whenIdle() { return this._delegate.whenIdle(); }
}

// #endregion

// #region Fixture models

/** Build a {@link CCAModel} with sensible defaults; override per test. */
function makeModel(overrides: Partial<CCAModel> & { readonly id: string; readonly name: string; readonly vendor: string }): CCAModel {
	return {
		billing: { is_premium: false, multiplier: 1, restricted_to: [] },
		capabilities: {
			family: 'test',
			limits: { max_context_window_tokens: 200_000, max_output_tokens: 8192, max_prompt_tokens: 200_000 },
			object: 'model_capabilities',
			supports: { parallel_tool_calls: true, streaming: true, tool_calls: true, vision: false },
			tokenizer: 'o200k_base',
			type: 'chat',
		},
		is_chat_default: false,
		is_chat_fallback: false,
		model_picker_category: 'Anthropic',
		model_picker_enabled: true,
		object: 'model',
		policy: { state: 'enabled', terms: '' },
		preview: false,
		supported_endpoints: ['/v1/messages'],
		version: '1',
		...overrides,
	};
}

/**
 * Build a `CCAModelSupports` with `reasoning_effort` / `adaptive_thinking`
 * augmentations the SDK type doesn't yet declare (tracked at
 * microsoft/vscode-capi#85). Mirrors the runtime shape `claudeAgent.ts`
 * narrows at the read boundary.
 */
function makeSupports(extras: { adaptive_thinking?: boolean; reasoning_effort?: readonly string[] } = {}): CCAModel['capabilities']['supports'] {
	return { parallel_tool_calls: true, streaming: true, tool_calls: true, vision: false, ...extras } as CCAModel['capabilities']['supports'];
}

const CLAUDE_OPUS = makeModel({ id: 'claude-opus-4.6', name: 'Claude Opus 4.6', vendor: 'Anthropic' });
const CLAUDE_SONNET = makeModel({ id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', vendor: 'Anthropic' });
const NON_ANTHROPIC = makeModel({ id: 'gpt-5', name: 'GPT-5', vendor: 'OpenAI' });
const ANTHROPIC_NO_MESSAGES_ENDPOINT = makeModel({ id: 'claude-haiku-3.5', name: 'Claude Haiku 3.5', vendor: 'Anthropic', supported_endpoints: ['/chat/completions'] });
const ANTHROPIC_PICKER_DISABLED = makeModel({ id: 'claude-opus-4.5', name: 'Claude Opus 4.5', vendor: 'Anthropic', model_picker_enabled: false });
const ANTHROPIC_NO_TOOL_CALLS = makeModel({
	id: 'claude-sonnet-3.5', name: 'Claude Sonnet 3.5', vendor: 'Anthropic',
	capabilities: {
		family: 'test',
		limits: { max_context_window_tokens: 200_000, max_output_tokens: 8192, max_prompt_tokens: 200_000 },
		object: 'model_capabilities',
		supports: { parallel_tool_calls: false, streaming: true, tool_calls: false, vision: false },
		tokenizer: 'o200k_base',
		type: 'chat',
	},
});
const SYNTHETIC_AUTO = makeModel({ id: 'auto', name: 'Auto', vendor: 'copilot' });

const ALL_MODELS: readonly CCAModel[] = [
	CLAUDE_OPUS, CLAUDE_SONNET, NON_ANTHROPIC,
	ANTHROPIC_NO_MESSAGES_ENDPOINT, ANTHROPIC_PICKER_DISABLED,
	ANTHROPIC_NO_TOOL_CALLS, SYNTHETIC_AUTO,
];

// #endregion

// #region Test harness

interface ITestContext {
	readonly agent: ClaudeAgent;
	readonly proxy: FakeClaudeProxyService;
	readonly api: FakeCopilotApiService;
	readonly sdk: FakeClaudeAgentSdkService;
	readonly sessionData: RecordingSessionDataService;
	readonly stateManager: AgentHostStateManager;
	readonly configService: AgentConfigurationService;
	readonly instantiationService: IInstantiationService;
	readonly fileService: IFileService;
}

/**
 * {@link NullLogService} subclass that captures `warn` / `error` messages
 * so tests can assert defense-in-depth diagnostics fired from the mapper
 * or other internals. All other levels remain no-ops.
 */
class CapturingLogService extends NullLogService {
	readonly infos: string[] = [];
	readonly warns: string[] = [];
	readonly errors: string[] = [];
	override info(message: string, ...args: unknown[]): void {
		this.infos.push([message, ...args.map(a => String(a))].join(' '));
	}
	override warn(message: string, ...args: unknown[]): void {
		this.warns.push([message, ...args.map(a => String(a))].join(' '));
	}
	override error(message: string | Error, ...args: unknown[]): void {
		this.errors.push([String(message), ...args.map(a => String(a))].join(' '));
	}
}

function createTestContext(
	disposables: Pick<DisposableStore, 'add'>,
	overrides?: { logService?: ILogService; database?: TestSessionDatabase; rootConfig?: Record<string, unknown>; userHome?: URI; gitHubEndpointService?: IAgentHostGitHubEndpointService },
): ITestContext {
	const proxy = new FakeClaudeProxyService();
	const api = new FakeCopilotApiService();
	api.models = async () => [...ALL_MODELS];
	const sdk = new FakeClaudeAgentSdkService();
	const sessionData = new RecordingSessionDataService(
		overrides?.database
			? createSessionDataService(overrides.database)
			: createSessionDataService()
	);
	const logService = overrides?.logService ?? new NullLogService();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const configService = disposables.add(new AgentConfigurationService(stateManager, logService));

	// In-memory file service the session's customization scan / agent-name
	// resolution runs against; exposed so tests can seed `.claude/**` files.
	const fileService = disposables.add(new FileService(new NullLogService()));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));

	const services = new ServiceCollection(
		[IFileService, fileService],
		[INativeEnvironmentService, { userHome: overrides?.userHome ?? URI.file('/mock-home') } as INativeEnvironmentService],
		[ILogService, logService],
		[ICopilotApiService, api],
		[IClaudeProxyService, proxy],
		[ISessionDataService, sessionData],
		[IClaudeAgentSdkService, sdk],
		[IAgentPluginManager, new FakeAgentPluginManager()],
		[IAgentHostGitService, createNoopGitService()],
		[IAgentConfigurationService, configService],
		[IProductService, FakeProductService],
		[IAgentHostGitHubEndpointService, overrides?.gitHubEndpointService ?? createTestGitHubEndpointService()],
	);
	const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
	// Phase 19: seed root config (e.g. `claudeUseCopilotProxy`) BEFORE the agent
	// resolves its transport mode in the constructor.
	if (overrides?.rootConfig) {
		configService.updateRootConfig(overrides.rootConfig);
	}
	const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
	return { agent, proxy, api, sdk, sessionData, stateManager, configService, instantiationService, fileService };
}

/** Drains the microtask queue so awaited refresh writes settle. */
function tick(): Promise<void> {
	return new Promise(resolve => setImmediate(resolve));
}

/**
 * A two-turn source transcript (`u1`/`a1`, `u2`/`a2`) used by the Phase 6.5
 * fork tests. Forking at `u1` keeps `[u1]` inclusive, anchored on that turn's
 * last assistant envelope `a1`.
 */
function forkSourceMessages(sourceId: string): SessionMessage[] {
	return [
		{ type: 'user', uuid: 'u1', session_id: sourceId, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: 'apple' }] } },
		{ type: 'assistant', uuid: 'a1', session_id: sourceId, parent_tool_use_id: null, message: { id: 'msg_a1', role: 'assistant', content: [{ type: 'text', text: 'apple!' }] } },
		{ type: 'user', uuid: 'u2', session_id: sourceId, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: 'banana' }] } },
		{ type: 'assistant', uuid: 'a2', session_id: sourceId, parent_tool_use_id: null, message: { id: 'msg_a2', role: 'assistant', content: [{ type: 'text', text: 'banana!' }] } },
	];
}

/**
 * Stub for {@link IAgentSdkDownloader} consumed by tests that need a real
 * `ClaudeAgentSdkService` constructor but override `_loadSdk` themselves —
 * the downloader is therefore never actually called.
 */
function stubAgentSdkDownloader(): IAgentSdkDownloader {
	return {
		_serviceBrand: undefined,
		onDidDownloadProgress: Event.None,
		isAvailable: () => false,
		isSdkResolvableWithoutDownload: async () => false,
		loadSdkRoot: () => { throw new Error('test stub: downloader.loadSdkRoot should not be called'); },
	};
}

/**
 * Foundational services every {@link ClaudeAgentSession} requires for its
 * customization disk scan: an in-memory {@link IFileService} (nothing is
 * seeded under the mock home, so the scan is deterministically empty in
 * tests) and a mock {@link INativeEnvironmentService} supplying `userHome`.
 * Spread into each test {@link ServiceCollection}.
 */
function claudeFileEnvServices(disposables: Pick<DisposableStore, 'add'>): [typeof IFileService | typeof INativeEnvironmentService, IFileService | INativeEnvironmentService][] {
	const fileService = disposables.add(new FileService(new NullLogService()));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
	return [
		[IFileService, fileService],
		[INativeEnvironmentService, { userHome: URI.file('/mock-home') } as INativeEnvironmentService],
	];
}

/**
 * A real {@link AgentConfigurationService} backed by a fresh
 * {@link AgentHostStateManager} for minimal test {@link ServiceCollection}s
 * that don't otherwise build one. `ClaudeAgent` always receives this service
 * via DI in production, so tests must register it too.
 */
function createTestAgentConfigService(disposables: Pick<DisposableStore, 'add'>): AgentConfigurationService {
	const logService = new NullLogService();
	return disposables.add(new AgentConfigurationService(disposables.add(new AgentHostStateManager(logService)), logService));
}

// #endregion

suite('ClaudeAgent', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('getDescriptor advertises the Claude provider', () => {
		const { agent } = createTestContext(disposables);
		const desc = agent.getDescriptor();
		assert.deepStrictEqual(
			{ provider: desc.provider, displayName: desc.displayName, hasDescription: desc.description.length > 0 },
			{ provider: 'claude', displayName: 'Claude', hasDescription: true },
		);
	});

	test('getProtectedResources returns the GitHub resource', () => {
		const { agent } = createTestContext(disposables);
		assert.deepStrictEqual(agent.getProtectedResources(), [{
			resource: 'https://api.github.com',
			resource_name: 'GitHub Copilot',
			authorization_servers: ['https://github.com/login/oauth'],
			scopes_supported: ['read:user', 'user:email'],
			required: true,
		}, {
			resource: 'https://api.github.com/repos',
			resource_name: 'GitHub Repository',
			authorization_servers: ['https://github.com/login/oauth'],
			scopes_supported: ['repo'],
			required: false,
		}]);
	});

	test('enterprise: getProtectedResources + authenticate use the computed enterprise resource', async () => {
		const { agent } = createTestContext(disposables, {
			gitHubEndpointService: createTestGitHubEndpointService('https://ghe.acme.com'),
		});

		assert.deepStrictEqual({
			resources: agent.getProtectedResources().map(r => ({ resource: r.resource, servers: r.authorization_servers })),
			acceptsEnterpriseCopilot: await agent.authenticate('https://ghe.acme.com/api/v3', 'tok'),
			rejectsDotCom: await agent.authenticate('https://api.github.com', 'tok'),
		}, {
			resources: [
				{ resource: 'https://ghe.acme.com/api/v3', servers: ['https://ghe.acme.com/login/oauth'] },
				{ resource: 'https://ghe.acme.com/api/v3/repos', servers: ['https://ghe.acme.com/login/oauth'] },
			],
			acceptsEnterpriseCopilot: true,
			rejectsDotCom: false,
		});
	});

	test('models observable is empty before authenticate', () => {
		const { agent } = createTestContext(disposables);
		assert.deepStrictEqual(agent.models.get(), []);
	});

	test('fromSdkModelInfo projects ModelInfo without commercial metadata and reuses the effort schema', () => {
		const projected = fromSdkModelInfo(
			{ value: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', description: 'desc', supportedEffortLevels: ['low', 'high'] },
			'claude',
		);
		assert.deepStrictEqual({
			provider: projected.provider,
			id: projected.id,
			name: projected.name,
			supportsVision: projected.supportsVision,
			hasConfigSchema: projected.configSchema !== undefined,
			hasPolicyState: projected.policyState !== undefined,
			hasMeta: projected._meta !== undefined,
		}, {
			provider: 'claude',
			id: 'claude-sonnet-4-5-20250929',
			name: 'Claude Sonnet 4.5',
			supportsVision: false,
			hasConfigSchema: true,
			hasPolicyState: false,
			hasMeta: false,
		});
	});

	test('native transport: getProtectedResources omits the Copilot resource', () => {
		const { agent } = createTestContext(disposables, { rootConfig: { claudeUseCopilotProxy: false } });
		assert.deepStrictEqual(
			agent.getProtectedResources().map(r => r.resource),
			['https://api.github.com/repos'],
		);
	});

	test('native transport: models populate from supportedModels() with no proxy start and no CAPI models() call', async () => {
		const { agent, proxy, api, sdk } = createTestContext(disposables, { rootConfig: { claudeUseCopilotProxy: false } });
		let capiModelsCalls = 0;
		api.models = async () => { capiModelsCalls++; return []; };
		sdk.supportedModelsResult = [
			{ value: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', description: '', supportedEffortLevels: ['high'] },
		];
		// The constructor kicks off an initial native refresh; `_fetchNativeModels`
		// awaits a real `mkdtemp` before enumerating, so poll until it lands.
		for (let i = 0; i < 100 && sdk.supportedModelsCallCount === 0; i++) {
			await tick();
		}
		await tick();
		assert.deepStrictEqual({
			models: agent.models.get().map(m => ({ id: m.id, name: m.name })),
			proxyStarts: proxy.startCalls.length,
			supportedModelsCalls: sdk.supportedModelsCallCount,
			capiModelsCalls,
		}, {
			models: [{ id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' }],
			proxyStarts: 0,
			supportedModelsCalls: 1,
			capiModelsCalls: 0,
		});
	});

	test('native model enumeration closes the throwaway query (no leaked subprocess)', async () => {
		const { sdk } = createTestContext(disposables, { rootConfig: { claudeUseCopilotProxy: false } });
		sdk.supportedModelsResult = [
			{ value: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', description: '' },
		];
		// The constructor kicks off the initial native enumeration; wait for it.
		for (let i = 0; i < 100 && sdk.supportedModelsCallCount === 0; i++) {
			await tick();
		}
		await tick();
		assert.deepStrictEqual({
			queries: sdk.enumerationQueries.length,
			closed: sdk.enumerationQueries[0]?.closeCount,
		}, {
			queries: 1,
			closed: 1,
		});
	});

	test('native transport: authenticate never starts the proxy', async () => {
		const { agent, proxy } = createTestContext(disposables, { rootConfig: { claudeUseCopilotProxy: false } });
		const accepted = await agent.authenticate('https://api.github.com', 'tok');
		await tick();
		assert.deepStrictEqual({ accepted, proxyStarts: proxy.startCalls.length }, { accepted: true, proxyStarts: 0 });
	});

	test('transport flip native→proxy with no proxy handle emits auth/required once', () => {
		const { agent, configService } = createTestContext(disposables, { rootConfig: { claudeUseCopilotProxy: false } });
		const events: Omit<AuthRequiredParams, 'channel'>[] = [];
		disposables.add(agent.onDidRequireAuth(e => events.push(e)));

		configService.updateRootConfig({ claudeUseCopilotProxy: true });

		assert.deepStrictEqual(events, [{ resource: 'https://api.github.com', reason: 'required' }]);
	});

	test('transport flip does not emit auth/required when a proxy handle already exists', async () => {
		const { agent, proxy, configService } = createTestContext(disposables);
		await agent.authenticate('https://api.github.com', 'tok');
		await tick();
		assert.strictEqual(proxy.startCalls.length, 1);

		const events: Omit<AuthRequiredParams, 'channel'>[] = [];
		disposables.add(agent.onDidRequireAuth(e => events.push(e)));
		configService.updateRootConfig({ claudeUseCopilotProxy: false }); // → native
		configService.updateRootConfig({ claudeUseCopilotProxy: true });  // → proxy; handle persists

		assert.deepStrictEqual(events, []);
	});

	test('transport flip proxy→native does not emit auth/required', () => {
		const { agent, configService } = createTestContext(disposables);
		const events: Omit<AuthRequiredParams, 'channel'>[] = [];
		disposables.add(agent.onDidRequireAuth(e => events.push(e)));

		configService.updateRootConfig({ claudeUseCopilotProxy: false });

		assert.deepStrictEqual(events, []);
	});

	test('construction in proxy mode does not emit auth/required', async () => {
		const { agent } = createTestContext(disposables);
		const events: Omit<AuthRequiredParams, 'channel'>[] = [];
		disposables.add(agent.onDidRequireAuth(e => events.push(e)));

		await tick();

		assert.deepStrictEqual(events, []);
	});

	test('proxy-mode authenticate with an unchanged token starts the proxy when no handle exists', async () => {
		// Native mode records the Copilot token without starting the proxy. After
		// a flip to proxy the agent has a token but no handle; re-authenticating
		// with the SAME token must still start the proxy rather than short-
		// circuiting on the "token unchanged" path.
		const { agent, proxy, configService } = createTestContext(disposables, { rootConfig: { claudeUseCopilotProxy: false } });
		await agent.authenticate('https://api.github.com', 'T');
		assert.strictEqual(proxy.startCalls.length, 0);

		configService.updateRootConfig({ claudeUseCopilotProxy: true });
		await agent.authenticate('https://api.github.com', 'T');
		await tick();

		assert.deepStrictEqual({
			startTokens: proxy.startCalls.map(c => c.token),
			disposeCount: proxy.disposeCount,
		}, { startTokens: ['T'], disposeCount: 0 });
	});

	test('createSession before authenticate throws ProtocolError(AHP_AUTH_REQUIRED) with protected resources', async () => {
		const { agent } = createTestContext(disposables);

		await assert.rejects(
			() => agent.createSession({ workingDirectory: URI.file('/workspace') }),
			(err: Error) =>
				err instanceof ProtocolError &&
				err.code === AHP_AUTH_REQUIRED &&
				Array.isArray(err.data) &&
				(err.data as ProtectedResourceMetadata[])[0]?.resource === 'https://api.github.com',
		);
	});

	test('authenticate populates models filtered to Claude family', async () => {
		const { agent, proxy } = createTestContext(disposables);

		const accepted = await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.deepStrictEqual({
			accepted,
			startCalls: proxy.startCalls.map(c => c.token),
			models: agent.models.get(),
		}, {
			accepted: true,
			startCalls: ['tok'],
			models: [
				{ provider: 'claude', id: 'claude-opus-4.6', name: 'Claude Opus 4.6', maxContextWindow: 200_000, maxOutputTokens: 8192, maxPromptTokens: 200_000, supportsVision: false, policyState: 'enabled', _meta: { multiplierNumeric: 1 } },
				{ provider: 'claude', id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', maxContextWindow: 200_000, maxOutputTokens: 8192, maxPromptTokens: 200_000, supportsVision: false, policyState: 'enabled', _meta: { multiplierNumeric: 1 } },
			],
		});
	});

	test('authenticate populates full pricing metadata from billing tokenPrices', async () => {
		const modelWithPricing = makeModel({
			id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', vendor: 'Anthropic',
			billing: {
				is_premium: false, multiplier: 2, restricted_to: [],
				// Runtime CAPI fields not yet declared on the SDK type:
				tokenPrices: { inputPrice: 3, cachePrice: 0.3, cacheWritePrice: 3.75, outputPrice: 15, longContext: { inputPrice: 6, cachePrice: 0.6, cacheWritePrice: 7.5, outputPrice: 30 } },
				priceCategory: 'medium',
			} as CCAModel['billing'],
		});

		const { agent, api } = createTestContext(disposables);
		api.models = async () => [modelWithPricing];
		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		const models = agent.models.get();
		assert.strictEqual(models.length, 1);
		assert.deepStrictEqual(models[0]._meta, {
			multiplierNumeric: 2,
			inputCost: 3,
			cacheCost: 0.3,
			cacheWriteCost: 3.75,
			outputCost: 15,
			longContextInputCost: 6,
			longContextCacheCost: 0.6,
			longContextCacheWriteCost: 7.5,
			longContextOutputCost: 30,
			priceCategory: 'medium',
		});
	});

	test('authenticate surfaces the CAPI chat-default model first; ties preserve insertion order', async () => {
		// `IAgentModelInfo` carries no explicit `isDefault` bit; the
		// picker uses `models[0]` as the de facto default at
		// modelPicker.ts:144. So a stable sort by `is_chat_default`
		// ensures whichever model CAPI flags as the chat default ends
		// up at position 0, regardless of the order CAPI returned the
		// list. Equal-priority entries fall through the comparator
		// unchanged so insertion order wins on ties.
		const opus = makeModel({ id: 'claude-opus-4.6', name: 'Claude Opus 4.6', vendor: 'Anthropic' });
		const sonnetDefault = makeModel({ id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', vendor: 'Anthropic', is_chat_default: true });
		const haiku = makeModel({ id: 'claude-haiku-4.6', name: 'Claude Haiku 4.6', vendor: 'Anthropic' });

		const { agent, api } = createTestContext(disposables);
		api.models = async () => [opus, sonnetDefault, haiku];
		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.deepStrictEqual(
			agent.models.get().map(m => m.id),
			['claude-sonnet-4.6', 'claude-opus-4.6', 'claude-haiku-4.6'],
		);
	});

	test('authenticate sources configSchema enum from each model\'s reasoning_effort list (Phase 6.1 / Cycle D3 / I5)', async () => {
		// Per Phase 6.1 plan D3 + CONTEXT.md M12 (line ~1802): the
		// `configSchema.properties.thinkingLevel.enum` advertised on each
		// Claude model must come from that model's own
		// `capabilities.supports.reasoning_effort` list — different
		// Claude models support different effort subsets (some
		// `['low','medium','high']`, some `['high']`, some none at all).
		// Mirror of the extension pattern at
		// extensions/copilot/src/extension/chatSessions/claude/node/
		// claudeCodeModels.ts:208-212 (`pickReasoningEffort`), which
		// reads `endpoint.supportsReasoningEffort` per-endpoint.
		//
		// CAPI's `/models` JSON exposes `reasoning_effort: string[]` and
		// `adaptive_thinking: boolean` on each model's `supports` bag,
		// but the published `@vscode/copilot-api` types don't yet
		// surface these fields (tracked at microsoft/vscode-capi#85);
		// `claudeAgent.ts` narrows the bag locally at the read boundary.
		const capsBase = {
			family: 'test',
			limits: { max_context_window_tokens: 200_000, max_output_tokens: 8192, max_prompt_tokens: 200_000 },
			object: 'model_capabilities',
			tokenizer: 'o200k_base',
			type: 'chat',
		} as const;
		const fullEffortModel = makeModel({
			id: 'claude-opus-4.6', name: 'Claude Opus 4.6', vendor: 'Anthropic',
			capabilities: { ...capsBase, supports: makeSupports({ adaptive_thinking: true, reasoning_effort: ['low', 'medium', 'high'] }) },
		});
		const highOnlyModel = makeModel({
			id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', vendor: 'Anthropic',
			capabilities: { ...capsBase, supports: makeSupports({ adaptive_thinking: true, reasoning_effort: ['high'] }) },
		});
		const emptyEffortModel = makeModel({
			id: 'claude-haiku-4.6', name: 'Claude Haiku 4.6', vendor: 'Anthropic',
			capabilities: { ...capsBase, supports: makeSupports({ adaptive_thinking: false, reasoning_effort: [] }) },
		});
		const unknownEffortModel = makeModel({
			id: 'claude-opus-4.5', name: 'Claude Opus 4.5', vendor: 'Anthropic',
			capabilities: { ...capsBase, supports: makeSupports({ adaptive_thinking: true, reasoning_effort: ['low', 'bogus', 'high'] }) },
		});
		const noEffortFieldModel = makeModel({
			id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', vendor: 'Anthropic',
		});

		const { agent, api } = createTestContext(disposables);
		api.models = async () => [fullEffortModel, highOnlyModel, emptyEffortModel, unknownEffortModel, noEffortFieldModel];
		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		const schemasById = Object.fromEntries(
			agent.models.get().map(m => [m.id, m.configSchema] as const),
		);
		assert.deepStrictEqual(schemasById, {
			'claude-opus-4.6': {
				type: 'object',
				properties: {
					thinkingLevel: {
						type: 'string',
						title: 'Thinking Level',
						description: 'Controls how much reasoning effort Claude uses.',
						enum: ['low', 'medium', 'high'],
						enumLabels: ['Low', 'Medium', 'High'],
						enumDescriptions: ['Faster responses with less reasoning', 'Balanced reasoning and speed', 'Greater reasoning depth but slower'],
						default: 'high',
					},
				},
			},
			'claude-sonnet-4.6': {
				type: 'object',
				properties: {
					thinkingLevel: {
						type: 'string',
						title: 'Thinking Level',
						description: 'Controls how much reasoning effort Claude uses.',
						enum: ['high'],
						enumLabels: ['High'],
						enumDescriptions: ['Greater reasoning depth but slower'],
						default: 'high',
					},
				},
			},
			'claude-haiku-4.6': undefined,
			'claude-opus-4.5': {
				type: 'object',
				properties: {
					thinkingLevel: {
						type: 'string',
						title: 'Thinking Level',
						description: 'Controls how much reasoning effort Claude uses.',
						enum: ['low', 'high'],
						enumLabels: ['Low', 'High'],
						enumDescriptions: ['Faster responses with less reasoning', 'Greater reasoning depth but slower'],
						default: 'high',
					},
				},
			},
			'claude-sonnet-4.5': undefined,
		});
	});

	test('authenticate rejects non-GitHub resources without disturbing state', async () => {
		const { agent, proxy } = createTestContext(disposables);

		const rejected = await agent.authenticate('https://other.example.com', 'tok');
		const accepted = await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.deepStrictEqual({
			rejected,
			accepted,
			startCalls: proxy.startCalls.map(c => c.token),
			disposeCount: proxy.disposeCount,
		}, {
			rejected: false,
			accepted: true,
			startCalls: ['tok'],
			disposeCount: 0,
		});
	});

	test('authenticate with the same token does not restart the proxy', async () => {
		const { agent, proxy } = createTestContext(disposables);

		await agent.authenticate('https://api.github.com', 'tok');
		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.deepStrictEqual({
			startCalls: proxy.startCalls.length,
			disposeCount: proxy.disposeCount,
		}, { startCalls: 1, disposeCount: 0 });
	});

	test('authenticate with a different token restarts the proxy and disposes the old handle', async () => {
		const { agent, proxy } = createTestContext(disposables);

		await agent.authenticate('https://api.github.com', 'tokA');
		await agent.authenticate('https://api.github.com', 'tokB');
		await tick();

		assert.deepStrictEqual({
			startTokens: proxy.startCalls.map(c => c.token),
			disposeCount: proxy.disposeCount,
		}, {
			startTokens: ['tokA', 'tokB'],
			disposeCount: 1,
		});
	});

	test('authenticate retries proxy startup after a transient failure', async () => {
		// Regression: a previous implementation set `_githubToken = token`
		// before awaiting `start()`. If start threw, the token was recorded
		// but no proxy was running, and the next authenticate() call with
		// the same token took the "unchanged" path and falsely returned
		// true. This test pins the corrected ordering: state mutates only
		// after start() succeeds.
		const proxy = new FakeClaudeProxyService();
		const api = new FakeCopilotApiService();
		api.models = async () => [...ALL_MODELS];

		// Replace start() with a fake that records every invocation
		// (whether or not it succeeds) and fails the first attempt only.
		let failNext = true;
		proxy.start = async (token: string) => {
			proxy.startCalls.push({ token });
			if (failNext) {
				failNext = false;
				throw new Error('proxy bind failed');
			}
			return {
				baseUrl: 'http://127.0.0.1:0',
				nonce: `nonce-for-${token}`,
				dispose: () => { proxy.disposeCount++; },
			};
		};

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[IAgentConfigurationService, createTestAgentConfigService(disposables)],
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IAgentHostGitService, createNoopGitService()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		await assert.rejects(agent.authenticate('https://api.github.com', 'tok'), /proxy bind failed/);

		// Models still empty (proxy never started, refresh never ran).
		assert.deepStrictEqual(agent.models.get(), []);

		// Retry with the SAME token MUST attempt start() again — not
		// short-circuit on `tokenChanged === false`.
		const accepted = await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.deepStrictEqual({
			accepted,
			startTokens: proxy.startCalls.map(c => c.token),
			disposeCount: proxy.disposeCount,
			modelIds: agent.models.get().map(m => m.id),
		}, {
			accepted: true,
			startTokens: ['tok', 'tok'],
			disposeCount: 0,
			modelIds: [CLAUDE_OPUS.id, CLAUDE_SONNET.id],
		});
	});

	test('model filter excludes non-Claude entries', async () => {
		// Same fixture set as the populate test, but assert on ids only —
		// catches every exclusion criterion in one snapshot.
		const { agent } = createTestContext(disposables);
		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.deepStrictEqual(
			agent.models.get().map(m => m.id),
			['claude-opus-4.6', 'claude-sonnet-4.6'],
		);
	});

	test('AgentSession URI helpers round-trip the claude scheme', () => {
		const uri = AgentSession.uri('claude', 'abc');
		assert.deepStrictEqual({
			scheme: uri.scheme,
			id: AgentSession.id(uri),
			provider: AgentSession.provider(uri),
		}, { scheme: 'claude', id: 'abc', provider: 'claude' });
	});

	test('dispose disposes the proxy handle and is idempotent', async () => {
		const proxy = new FakeClaudeProxyService();
		const api = new FakeCopilotApiService();
		api.models = async () => [];

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[IAgentConfigurationService, createTestAgentConfigService(disposables)],
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent = instantiationService.createInstance(ClaudeAgent);

		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		agent.dispose();
		agent.dispose();

		assert.strictEqual(proxy.disposeCount, 1);
	});

	test('phase-stub graduation: abortSession + changeModel no longer throw', async () => {
		// Phase 9 graduation: both methods land in this phase. They are
		// idempotent on unknown default chat URIs (no-op rather than throw)
		// because the workbench may race a session dispose with these
		// calls; matching CopilotAgent's permissive surface keeps the
		// AgentSideEffects.handleAction `.catch()` path quiet on common
		// paths. Behavior on known sessions is exercised by the dedicated
		// Phase 9 suites below.
		const { agent } = createTestContext(disposables);
		const chat = defaultChatUri(URI.parse('claude:/unknown'));
		await agent.chats.abort(chat);
		await agent.chats.changeModel(chat, { id: 'claude-opus-4.6' });
	});

	test('AgentService surfaces the registered ClaudeAgent in the providers map', () => {
		const { agent } = createTestContext(disposables);
		const fileService = disposables.add(new FileService(new NullLogService()));
		const service = disposables.add(new AgentService(
			new NullLogService(),
			fileService,
			createNullSessionDataService(),
			{ _serviceBrand: undefined } as IProductService,
			createNoopGitService(),
		));

		service.registerProvider(agent);

		// AgentSideEffects publishes registered providers into root state
		// on the next autorun tick. The state manager exposes the root
		// state via a public accessor.
		const rootAgents = service.stateManager.rootState.agents;
		assert.deepStrictEqual(
			rootAgents.map(a => ({ provider: a.provider, displayName: a.displayName })),
			[{ provider: 'claude', displayName: 'Claude' }],
		);
	});

	test('stale model writes from an old token are dropped', async () => {
		// Wire a controllable models() so token-A's refresh can hang
		// while token-B's refresh runs to completion. Phase 4's stale-
		// write guard MUST drop the late token-A result.
		const proxy = new FakeClaudeProxyService();
		const api = new FakeCopilotApiService();
		const tokAModels = new DeferredPromise<CCAModel[]>();
		api.models = (token: string) => token === 'tokA'
			? tokAModels.p
			: Promise.resolve([CLAUDE_SONNET]);

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[IAgentConfigurationService, createTestAgentConfigService(disposables)],
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		// First authenticate: refresh-A starts and hangs on tokAModels.p.
		await agent.authenticate('https://api.github.com', 'tokA');
		// Second authenticate: refresh-B runs to completion, models == [B].
		await agent.authenticate('https://api.github.com', 'tokB');
		await tick();
		assert.deepStrictEqual(agent.models.get().map(m => m.id), [CLAUDE_SONNET.id]);

		// Now unblock refresh-A: it must observe the rotated token and
		// drop its write rather than overwrite refresh-B's result.
		tokAModels.complete([CLAUDE_OPUS]);
		await tick();
		assert.deepStrictEqual(agent.models.get().map(m => m.id), [CLAUDE_SONNET.id]);
	});

	// #region Phase 5 — session lifecycle

	test('createSession (non-fork) returns a claude:/<uuid> URI with provisional: true; no DB or SDK contact', async () => {
		// Phase 6 §5.1 Test 1. Per-session DB is overlay/cache only and
		// the SDK subprocess fork is deferred until first sendMessage.
		// `provisional: true` opts the session into the AgentService's
		// deferred-`sessionAdded` protocol. Workbench eagerly creates
		// sessions on folder-pick + arms a 30s GC; for an empty Claude
		// session that's a cheap in-memory drop because nothing has
		// been persisted yet.
		const { agent, sdk, sessionData } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const result = await agent.createSession({ workingDirectory: URI.parse('file:///workspace') });

		assert.deepStrictEqual({
			scheme: result.session.scheme,
			provider: AgentSession.provider(result.session),
			isUuid: isUUID(AgentSession.id(result.session)),
			workingDirectory: result.workingDirectory?.toString(),
			provisional: result.provisional,
			openDatabaseCalls: sessionData.openDatabaseCallCount,
			tryOpenDatabaseCalls: sessionData.tryOpenDatabaseCallCount,
			startupCallCount: sdk.startupCallCount,
			listSessionsCallCount: sdk.listSessionsCallCount,
		}, {
			scheme: 'claude',
			provider: 'claude',
			isUuid: true,
			workingDirectory: 'file:///workspace',
			provisional: true,
			openDatabaseCalls: 0,
			tryOpenDatabaseCalls: 0,
			startupCallCount: 0,
			listSessionsCallCount: 0,
		});
	});

	test('createSession without a workingDirectory materializes in a shared scratch dir (workspace-less quick chat)', async () => {
		// Regression: a workspace-less quick chat gave Claude no cwd, so it
		// threw "workingDirectory is required" at materialize. The scratch-dir
		// fallback is now shared with the Copilot agent.
		const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/claude-qc-home-`));
		const { agent, sdk } = createTestContext(disposables, { userHome });
		try {
			await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

			const created = await agent.createSession({});
			const sessionId = AgentSession.id(created.session);
			const expected = URI.joinPath(userHome, '.copilot', 'chats', sessionId);
			assert.strictEqual(created.workingDirectory?.fsPath, expected.fsPath);
			await fs.access(expected.fsPath);

			// Drive materialize via the first send; before the fix this rejected
			// with "workingDirectory is required".
			sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
			await agent.chats.sendMessage(created.session, 'hi', undefined, undefined, 'turn-1');
			assert.strictEqual(sdk.capturedStartupOptions.at(-1)?.cwd, expected.fsPath);
		} finally {
			await fs.rm(userHome.fsPath, { recursive: true, force: true });
		}
	});

	test('createProvisional creates a session without SDK startup contact', async () => {
		const { sdk, instantiationService } = createTestContext(disposables);

		const session = disposables.add(ClaudeAgentSession.createProvisional(
			'test-session',
			AgentSession.uri('claude', 'test-session'),
			URI.parse(buildDefaultChatUri(AgentSession.uri('claude', 'test-session'))),
			URI.file('/workspace'),
			undefined,
			undefined,
			undefined,
			undefined,
			new PendingRequestRegistry<CallToolResult>(),
			'default',
			instantiationService.createInstance(ClaudeSessionMetadataStore, 'claude'),
			instantiationService,
		));

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			sessionId: session.sessionId,
			sessionUri: session.sessionUri.toString(),
		}, {
			startupCallCount: 0,
			sessionId: 'test-session',
			sessionUri: 'claude:/test-session',
		});
	});

	test('pipeline methods throw before materialize on provisional sessions', async () => {
		const { instantiationService } = createTestContext(disposables);
		const session = disposables.add(ClaudeAgentSession.createProvisional(
			'test-session',
			AgentSession.uri('claude', 'test-session'),
			URI.parse(buildDefaultChatUri(AgentSession.uri('claude', 'test-session'))),
			URI.file('/workspace'),
			undefined,
			undefined,
			undefined,
			undefined,
			new PendingRequestRegistry<CallToolResult>(),
			'default',
			instantiationService.createInstance(ClaudeSessionMetadataStore, 'claude'),
			instantiationService,
		));

		await assert.rejects(
			session.send({
				type: 'user',
				message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
				session_id: 'test-session',
				parent_tool_use_id: null,
			}, 'turn-1'),
			/session is not materialized/i,
		);
	});

	test('resume keeps the existing overlay model (materialize does not clobber on isResume)', async () => {
		// On the resume path `session.materialize(ctx)` must NOT write the
		// session overlay: the overlay is the SOURCE of model /
		// permissionMode at resume time. If materialize wrote unconditionally,
		// the user's prior model selection would be silently overwritten with
		// whatever default `_resumeSession` had to fall back to.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		// Phase 1: fresh materialize so the overlay is seeded with the
		// session's initial model.
		const initialModel = { id: 'claude-sonnet-4.6', config: { thinkingLevel: 'high' } };
		const created = await agent.createSession({ workingDirectory: URI.file('/work-resume'), model: initialModel });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		// Phase 2: user changes the model post-materialize — this hits the
		// runtime path inside session.setModel and rewrites the overlay.
		const updatedModel = { id: 'claude-opus-4.6', config: { thinkingLevel: 'medium' } };
		await agent.chats.changeModel(defaultChatUri(created.session), updatedModel);

		// Phase 3: simulate cross-window resume by tearing the in-memory
		// entry down and forcing the resume branch on the next send.
		await agent.disposeSession(created.session);
		sdk.sessionList = [{ sessionId, cwd: '/work-resume', summary: '', lastModified: Date.now() }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'turn 2', undefined, undefined, 'turn-2');

		// Phase 4: confirm the resume started the SDK with the updated model
		// from Phase 2. Model selection is no longer surfaced on
		// `IAgentSessionMetadata`; the observable effect of the overlay is the
		// model the resume query is started with. If materialize wrote
		// unconditionally on resume, the SDK would start with the initial
		// materialize-time model instead.
		assert.deepStrictEqual(
			{ model: sdk.capturedStartupOptions.at(-1)?.model, effort: sdk.capturedStartupOptions.at(-1)?.effort },
			{ model: 'claude-opus-4-6', effort: 'medium' },
			'resume must not clobber the overlay model',
		);
	});

	test('createSession honors config.session when the workbench pre-mints the URI', async () => {
		// Workbench eagerly mints the session URI client-side (PR #313841
		// folder-pick path) and round-trips it through createSession so
		// the chat editor can render immediately. AgentService then
		// double-checks the returned URI matches and surfaces "Agent
		// host returned unexpected session URI" if the agent ignored
		// the hint. Mirrors CopilotAgent's `config.session ?
		// AgentSession.id(config.session) : generateUuid()` contract.
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const expected = AgentSession.uri('claude', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

		const result = await agent.createSession({ session: expected, workingDirectory: URI.file('/work') });

		assert.deepStrictEqual({
			session: result.session.toString(),
			provisional: result.provisional,
		}, {
			session: expected.toString(),
			provisional: true,
		});
	});

	test('createSession({ fork }) forks at the anchor uuid, then materializes lazily on first sendMessage', async () => {
		// Fork translates turnId u1 → its last-assistant uuid a1 (INCLUSIVE),
		// returns non-provisional WITHOUT starting the Query; the first
		// sendMessage resumes from disk (Options.resume) — see CONTEXT M9.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		const sourceUri = AgentSession.uri('claude', sourceId);
		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const events: IAgentMaterializeSessionEvent[] = [];
		disposables.add(agent.onDidMaterializeSession(e => events.push(e)));

		const result = await agent.createSession({ fork: { session: sourceUri, turnIndex: 0, turnId: 'u1' } });
		const newUri = AgentSession.uri('claude', 'forked-1');

		// Snapshot fork-time state: file written, no Query, no materialize event.
		const atForkTime = {
			getMessagesCall: sdk.getSessionMessagesCalls[0],
			forkCall: sdk.forkSessionCalls[0],
			materializeCount: events.length,
			startupCount: sdk.capturedStartupOptions.length,
			resultSession: result.session.toString(),
			resultCwd: result.workingDirectory?.fsPath,
			provisional: result.provisional,
		};

		// First send resumes the forked file: the Query starts with `resume`.
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(defaultChatUri(newUri), 'next', undefined, undefined, 'turn-1');

		assert.deepStrictEqual({
			atForkTime,
			afterSend: {
				materializeCount: events.length,
				materializeUri: events[0]?.session.toString(),
				startupResume: sdk.capturedStartupOptions[0]?.resume,
				startupSessionId: sdk.capturedStartupOptions[0]?.sessionId,
			},
		}, {
			atForkTime: {
				getMessagesCall: { sessionId: sourceId, options: { includeSystemMessages: true } },
				forkCall: { sessionId: sourceId, options: { upToMessageId: 'a1' } },
				materializeCount: 0,
				startupCount: 0,
				resultSession: newUri.toString(),
				resultCwd: URI.file('/work').fsPath,
				provisional: undefined,
			},
			afterSend: {
				materializeCount: 1,
				materializeUri: newUri.toString(),
				startupResume: 'forked-1',
				startupSessionId: undefined,
			},
		});
	});

	test('createSession({ fork }) at the last turn anchors on that turn\'s assistant', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		await agent.createSession({ fork: { session: AgentSession.uri('claude', sourceId), turnIndex: 1, turnId: 'u2' } });

		assert.deepStrictEqual(sdk.forkSessionCalls[0], { sessionId: sourceId, options: { upToMessageId: 'a2' } });
	});

	test('truncateSession(turnId) resolves the anchor, restarts at it on the same id, and prunes the DB', async () => {
		const database = new TestSessionDatabase();
		const { agent, sdk } = createTestContext(disposables, { database });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.sessionMessagesById.set(sessionId, forkSourceMessages(sessionId));
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');
		await agent.truncateSession(created.session, 'u1');
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2');

		assert.deepStrictEqual({
			startupCount: sdk.startupCallCount,
			rebuildResume: sdk.capturedStartupOptions[1]?.resume,
			rebuildResumeAt: sdk.capturedStartupOptions[1]?.resumeSessionAt,
			sameUri: agent.getSessionForTesting(created.session)?.sessionUri.toString() === created.session.toString(),
			prunedAfter: database.deleteTurnsAfterCalls,
			getMessagesCall: sdk.getSessionMessagesCalls.at(-1),
		}, {
			startupCount: 2,
			rebuildResume: sessionId,
			rebuildResumeAt: 'a1',
			sameUri: true,
			prunedAfter: ['u1'],
			getMessagesCall: { sessionId, options: { includeSystemMessages: true } },
		});
	});

	test('truncateSession cold-resumes an unloaded session, then applies the anchor on the next turn', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.sessionMessagesById.set(sessionId, forkSourceMessages(sessionId));
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');

		// Unload the session from memory; the transcript stays resumable.
		await agent.disposeSession(created.session);
		assert.strictEqual(agent.getSessionForTesting(created.session), undefined, 'unloaded');
		sdk.sessionList = [{ sessionId, cwd: '/work', summary: '', lastModified: Date.now() }];

		await agent.truncateSession(created.session, 'u1');
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2');

		const last = sdk.capturedStartupOptions.at(-1);
		assert.deepStrictEqual({
			resume: last?.resume,
			resumeAt: last?.resumeSessionAt,
			sessionPresent: agent.getSessionForTesting(created.session) !== undefined,
		}, {
			resume: sessionId,
			resumeAt: 'a1',
			sessionPresent: true,
		});
	});

	test('truncateSession throws when the turn is not in the transcript', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.sessionMessagesById.set(sessionId, forkSourceMessages(sessionId));
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');

		await assert.rejects(() => agent.truncateSession(created.session, 'no-such-turn'), /turn no-such-turn not found/);
	});

	test('truncateSession on a provisional session is a no-op', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });

		await agent.truncateSession(created.session, 'u1');

		assert.deepStrictEqual({
			startupCount: sdk.startupCallCount,
			getMessagesCalls: sdk.getSessionMessagesCalls.length,
		}, {
			startupCount: 0,
			getMessagesCalls: 0,
		});
	});

	test('truncateSession() with no turnId clears the session in place (deleteSession + fresh same id)', async () => {
		const database = new TestSessionDatabase();
		const { agent, sdk } = createTestContext(disposables, { database });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');

		await agent.truncateSession(created.session);

		// The next turn materializes FRESH (non-resume) on the SAME id.
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2');
		const last = sdk.capturedStartupOptions.at(-1);
		assert.deepStrictEqual({
			deleted: sdk.deleteSessionCalls,
			allTurnsPruned: database.deleteAllTurnsCalls,
			lastSessionId: last?.sessionId,
			lastResume: last?.resume,
			lastResumeAt: last?.resumeSessionAt,
			sessionPresent: agent.getSessionForTesting(created.session) !== undefined,
		}, {
			deleted: [sessionId],
			allTurnsPruned: 1,
			lastSessionId: sessionId,
			lastResume: undefined,
			lastResumeAt: undefined,
			sessionPresent: true,
		});
	});

	test('truncateSession() with no turnId awaits the live query teardown (subprocess exit) before deleteSession', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');

		// Block the live query's teardown (models `transport.waitForExit()` —
		// the subprocess not yet exited / still flushing the transcript).
		const exitGate = new DeferredPromise<void>();
		sdk.queryReturnGate = exitGate.p;

		const truncated = agent.truncateSession(created.session);
		await timeout(0);
		// deleteSession MUST NOT run while the subprocess is still alive: a
		// premature delete would race the dying writer re-flushing `<id>.jsonl`.
		assert.deepStrictEqual(sdk.deleteSessionCalls, [], 'deleteSession ran before the subprocess exited');

		exitGate.complete();
		await truncated;
		assert.deepStrictEqual(sdk.deleteSessionCalls, [sessionId]);
	});

	test('truncateSession() with no turnId on an UNLOADED session deletes + recreates fresh on the same id, preserving the overlay (cold remove-all)', async () => {
		const database = new TestSessionDatabase();
		const { agent, sdk, instantiationService } = createTestContext(disposables, { database });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');

		// Unload the session from memory; the transcript stays on disk. The
		// remove-all path then has no live `existing` and must read the cwd
		// from `getSessionInfo` before deleting + recreating.
		await agent.disposeSession(created.session);
		assert.strictEqual(agent.getSessionForTesting(created.session), undefined, 'unloaded');
		sdk.sessionList = [{ sessionId, cwd: '/work', summary: '', lastModified: Date.now() }];

		// Seed a permissionMode overlay the cold recreate must carry forward.
		const metaStore = instantiationService.createInstance(ClaudeSessionMetadataStore, 'claude');
		await metaStore.write(created.session, { permissionMode: 'plan' });

		await agent.truncateSession(created.session);

		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2');
		const last = sdk.capturedStartupOptions.at(-1);
		assert.deepStrictEqual({
			deleted: sdk.deleteSessionCalls,
			cwdConsulted: sdk.getSessionInfoCalls.includes(sessionId),
			allTurnsPruned: database.deleteAllTurnsCalls,
			lastSessionId: last?.sessionId,
			lastResume: last?.resume,
			lastResumeAt: last?.resumeSessionAt,
			permissionMode: last?.permissionMode,
			sessionPresent: agent.getSessionForTesting(created.session) !== undefined,
		}, {
			deleted: [sessionId],
			cwdConsulted: true,
			allTurnsPruned: 1,
			lastSessionId: sessionId,
			lastResume: undefined,
			lastResumeAt: undefined,
			permissionMode: 'plan',
			sessionPresent: true,
		});
	});

	test('createSession({ fork }) inherits the source permissionMode overlay', async () => {
		const { agent, sdk, instantiationService } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		const sourceUri = AgentSession.uri('claude', sourceId);
		// Seed the SOURCE overlay; the fork must copy it onto the new session
		// so it reaches `Options.permissionMode` at materialize.
		const metaStore = instantiationService.createInstance(ClaudeSessionMetadataStore, 'claude');
		await metaStore.write(sourceUri, { permissionMode: 'plan' });

		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const result = await agent.createSession({ fork: { session: sourceUri, turnIndex: 0, turnId: 'u1' } });

		// Fork defers the Query; materialize it via the first send. The resume
		// path reads the inherited overlay into `Options.permissionMode`.
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(defaultChatUri(result.session), 'hi', undefined, undefined, 'turn-1');

		assert.strictEqual(sdk.capturedStartupOptions[0]?.permissionMode, 'plan');
	});

	test('createSession({ fork }) with a create-config model override persists it on the fork', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const result = await agent.createSession({
			fork: { session: AgentSession.uri('claude', sourceId), turnIndex: 0, turnId: 'u1' },
			model: { id: 'claude-opus-4.6' },
		});

		// The fork's model override is no longer surfaced on metadata; its
		// observable effect is the model the forked session's SDK query is
		// started with on its first send.
		const forkedId = AgentSession.id(result.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(forkedId), makeResultSuccess(forkedId)];
		await agent.chats.sendMessage(defaultChatUri(result.session), 'hi', undefined, undefined, 'turn-1');

		assert.strictEqual(sdk.capturedStartupOptions.at(-1)?.model, 'claude-opus-4-6');
	});

	test('createSession({ fork }) rejects when the turnId is not in the transcript', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));

		await assert.rejects(
			agent.createSession({ fork: { session: AgentSession.uri('claude', sourceId), turnIndex: 9, turnId: 'no-such-turn' } }),
			/not found in transcript/,
		);
		assert.strictEqual(sdk.forkSessionCalls.length, 0, 'no fork when the anchor cannot be resolved');
	});

	test('createSession({ fork }) rejects when the forked session has no working directory', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		// No `sessionList` entry → `getSessionInfo('forked-1')` resolves
		// undefined (no cwd), and no `config.workingDirectory` is supplied.
		// Fail fast here rather than at the first `sendMessage`.
		await assert.rejects(
			agent.createSession({ fork: { session: AgentSession.uri('claude', sourceId), turnIndex: 0, turnId: 'u1' } }),
			/no working directory/,
		);
	});

	test('createSession({ fork }) rejects a subagent source with no SDK contact', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const subagentUri = URI.parse(buildSubagentSessionUri(AgentSession.uri('claude', 'parent').toString(), 'tool-call-1'));

		await assert.rejects(
			agent.createSession({ fork: { session: subagentUri, turnIndex: 0, turnId: 'u1' } }),
			/subagent/,
		);
		assert.deepStrictEqual({
			getMessages: sdk.getSessionMessagesCalls.length,
			fork: sdk.forkSessionCalls.length,
		}, { getMessages: 0, fork: 0 });
	});

	test('createSession({ fork }) rejects a provisional/never-sent source', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		// A plain createSession is provisional until the first sendMessage.
		const provisional = await agent.createSession({ workingDirectory: URI.file('/src') });

		await assert.rejects(
			agent.createSession({ fork: { session: provisional.session, turnIndex: 0, turnId: 'u1' } }),
			/provisional/,
		);
		assert.strictEqual(sdk.forkSessionCalls.length, 0);
	});

	test('first sendMessage on a provisional session materializes it (single startup, single materialize event)', async () => {
		// Phase 6 §5.1 Test 3 (tracer). Forces the materialize spine into
		// existence: `_provisionalSessions` map, `_materializeProvisional`,
		// `IClaudeAgentSdkService.startup()`, `_onDidMaterializeSession`
		// event, and `entry.send` plumbing in `ClaudeAgentSession`.
		//
		// Public-interface assertions only: we never read `_sessions`
		// or `_provisionalSessions` directly. The behavioral signature
		// of "first send materializes" is:
		//   - SDK `startup()` is called exactly once (was 0 after
		//     createSession; is 1 after sendMessage).
		//   - The materialize event fires exactly once with the right URI.
		//   - The startup options carry the working directory the user
		//     picked at createSession time.
		const { agent, sdk, proxy } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		assert.strictEqual(proxy.startCalls.length, 1, 'proxy started by authenticate');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		assert.strictEqual(sdk.startupCallCount, 0, 'createSession does not touch the SDK');

		const events: IAgentMaterializeSessionEvent[] = [];
		assert.ok(agent.onDidMaterializeSession, 'agent must expose onDidMaterializeSession');
		disposables.add(agent.onDidMaterializeSession(e => events.push(e)));

		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			materializeEventCount: events.length,
			eventSession: events[0]?.session.toString(),
			eventCwd: events[0]?.workingDirectory?.fsPath,
			startupOptionsCwd: sdk.capturedStartupOptions[0]?.cwd,
			startupOptionsSessionId: sdk.capturedStartupOptions[0]?.sessionId,
		}, {
			startupCallCount: 1,
			materializeEventCount: 1,
			eventSession: created.session.toString(),
			eventCwd: URI.file('/work').fsPath,
			startupOptionsCwd: URI.file('/work').fsPath,
			startupOptionsSessionId: sessionId,
		});
	});

	test('materializing in a worktree reanchors customization discovery', async () => {
		const { agent, sdk, fileService } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const workspace = URI.file('/workspace');
		const worktree = URI.file('/workspace.worktrees/session');
		const created = await agent.createSession({ workingDirectory: workspace });
		const sessionId = AgentSession.id(created.session);
		sdk.supportedCommandsResult = [{ name: 'worktree-skill', description: 'Worktree skill', argumentHint: '' }];
		sdk.supportedAgentsResult = [];
		sdk.mcpServerStatusResult = [];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', worktree, undefined, 'turn-1');

		let sessionChanges = 0;
		let agentChanges = 0;
		const session = agent.getSessionForTesting(created.session)!;
		const customizationChanged = Event.toPromise(session.onDidCustomizationsChange, disposables.add(new DisposableStore()));
		disposables.add(session.onDidCustomizationsChange(() => sessionChanges++));
		disposables.add(agent.onDidCustomizationsChange(() => agentChanges++));
		await fileService.writeFile(
			URI.joinPath(worktree, '.claude', 'skills', 'worktree-skill', 'SKILL.md'),
			VSBuffer.fromString('---\nname: worktree-skill\ndescription: Worktree skill\n---\nbody'),
		);
		await customizationChanged;
		const customizations = await agent.getSessionCustomizations!(created.session);
		const skills = customizations.find(customization => customization.uri === URI.joinPath(worktree, '.claude', 'skills').toString());

		assert.deepStrictEqual({
			sessionChanges,
			agentChanges,
			startupCwd: sdk.capturedStartupOptions[0]?.cwd,
			skills: skills?.type === CustomizationType.Directory ? skills.children?.map(skill => skill.name) : undefined,
		}, {
			sessionChanges: 1,
			agentChanges: 1,
			startupCwd: worktree.fsPath,
			skills: ['worktree-skill'],
		});
	}).timeout(5_000);

	test('materialize resolves the SDK agent name from the file frontmatter, not the filename', async () => {
		// `_resolveAgentName` parses the selected `~/.claude/agents/<file>.md`:
		// the SDK keys agents by their frontmatter `name`, which need not match
		// the filename. A selection pointing at `foo.md` whose frontmatter says
		// `name: my-real-agent` must start the SDK up with agent=my-real-agent.
		const { agent, sdk, fileService } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const agentFile = URI.file('/mock-home/.claude/agents/foo.md');
		await fileService.writeFile(agentFile, VSBuffer.fromString('---\nname: my-real-agent\ndescription: A real agent\n---\nbody'));

		const created = await agent.createSession({ workingDirectory: URI.file('/work'), agent: { uri: agentFile.toString() } });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, 'my-real-agent');
	});

	test('materialize resolves a built-in (claude-internal) agent selection to its name', async () => {
		// A built-in agent (e.g. `Explore`) has no editable file on disk; it is
		// selected via a synthetic `claude-internal:/agent/<name>` URI. Materialize
		// must decode the name from the path and start the SDK with agent=Explore
		// (the inverse of `nonEditableUri`).
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work'), agent: { uri: 'claude-internal:/agent/Explore' } });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, 'Explore');
	});

	test('materialize event payload shape — { session, workingDirectory, project: undefined }', async () => {
		// Phase 6 §5.1 Test 4. Pins the {@link IAgentMaterializeSessionEvent}
		// payload independently of the tracer in Test 3. The default
		// {@link createNoopGitService} produces no project metadata, so
		// `project` is `undefined`. AgentService relies on this exact
		// shape to forward to its `sessionAdded` notification (it spreads
		// the event into `IAgentSessionMetadata`-shaped fields), so a
		// snapshot here is the load-bearing contract.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const cwd = URI.file('/payload-shape');
		const created = await agent.createSession({ workingDirectory: cwd });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const events: IAgentMaterializeSessionEvent[] = [];
		assert.ok(agent.onDidMaterializeSession);
		disposables.add(agent.onDidMaterializeSession(e => events.push(e)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		assert.strictEqual(events.length, 1, 'event fires exactly once');
		const ev = events[0];
		assert.deepStrictEqual({
			session: ev.session.toString(),
			workingDirectory: ev.workingDirectory?.toString(),
			project: ev.project,
			keys: Object.keys(ev).sort(),
		}, {
			session: created.session.toString(),
			workingDirectory: cwd.toString(),
			project: undefined,
			keys: ['project', 'session', 'workingDirectory'],
		});
	});

	test('createSession config.model + config.config.permissionMode flow into Options on first send (M11 / Phase 6.1 C2)', async () => {
		// Phase 6.1 Cycle E (drift C2). M11 mandates that the
		// `IAgentCreateSessionConfig` bag (`model` + `config.*`) survives
		// from `createSession` → provisional record → first `query()`'s
		// `Options.*`. The pre-fix surface dropped both: `provisional`
		// had no `model`/`config` fields and the materialize site
		// hardcoded `permissionMode: 'default'` with no `Options.model`
		// at all — SDK defaults silently won.
		// Pinned shape: `Options.model === created-time model.id`,
		// `Options.permissionMode === created-time permissionMode`.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({
			workingDirectory: URI.file('/work'),
			model: { id: 'claude-sonnet-4.6' },
			config: { permissionMode: 'plan' },
		});
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		assert.deepStrictEqual({
			model: sdk.capturedStartupOptions[0]?.model,
			permissionMode: sdk.capturedStartupOptions[0]?.permissionMode,
		}, {
			// Endpoint id `claude-sonnet-4.6` is normalized to SDK format at the
			// SDK seam (see `toSdkModelId`); the CLI only recognizes the dashed form.
			model: 'claude-sonnet-4-6',
			permissionMode: 'plan',
		});
	});

	test('createSession model.config.thinkingLevel flows into Options.effort on first send (M11 / Phase 6.1 C2)', async () => {
		// Phase 6.1 Cycle E. Per CONTEXT.md M11 + the M-portrait at
		// CONTEXT.md:1497, `effort` is the third leg of the
		// `IAgentCreateSessionConfig` → `Options.*` triplet (alongside
		// model and permissionMode). Unlike the other two, effort is
		// nested inside `ModelSelection.config.thinkingLevel` rather
		// than living as its own session-config key — mirroring
		// CopilotAgent's `_getReasoningEffort` pattern at
		// copilotAgent.ts:487. The SDK's `Options.effort` accepts the
		// full 5-value `EffortLevel` union (sdk.d.ts:443 + sdk.d.ts:1214);
		// the 4-value clamp at sdk.d.ts:4292 only applies to the live
		// `applyFlagSettings` hot-swap path (Phase 9).
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({
			workingDirectory: URI.file('/work'),
			model: { id: 'claude-opus-4.6', config: { thinkingLevel: 'high' } },
		});
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		assert.deepStrictEqual({
			model: sdk.capturedStartupOptions[0]?.model,
			effort: sdk.capturedStartupOptions[0]?.effort,
		}, {
			// Endpoint id `claude-opus-4.6` → SDK format at the SDK seam.
			model: 'claude-opus-4-6',
			effort: 'high',
		});
	});

	test('two sendMessage calls reuse the materialized Query', async () => {
		// Phase 6 §5.1 Test 5. After the first send materializes the
		// session, subsequent sends MUST push onto the same prompt
		// iterable / SDK Query — they MUST NOT re-fork the subprocess
		// (`startup()` is expensive and would lose conversational state
		// since the SDK's resume-from-session-id only kicks in on init).
		// The invariants here are: (a) `startup()` is called exactly once
		// across both turns, (b) `warm.query()` is bound exactly once,
		// (c) both deferreds resolve on their respective `result` SDK
		// messages, (d) both prompts traverse the prompt iterable.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		// Stage two turns. Park the iterator at index 2 (right after the
		// first `result`) until the test releases it; this proves the
		// second send reuses the same Query rather than spawning a new
		// one (the gate would otherwise be irrelevant). Index choice
		// mirrors plan §5.1 test 5.
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (idx: number) => {
			if (idx === 2) {
				await advance.p;
			}
		};
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
			makeResultSuccess(sessionId),
		];

		// First turn — materializes; resolves on result(idx=1).
		await agent.chats.sendMessage(defaultChatUri(created.session), 'turn-1', undefined, undefined, 'turn-id-1');

		// Snapshot before the second send so we can assert the second send
		// did NOT call startup() again.
		const startupCallsAfterTurn1 = sdk.startupCallCount;
		const queryCallsAfterTurn1 = sdk.warmQueries[0]?.queryCallCount ?? -1;

		// Second turn — pushes onto the existing Query.
		const p2 = agent.chats.sendMessage(defaultChatUri(created.session), 'turn-2', undefined, undefined, 'turn-id-2');
		// Drain microtasks so `await entry.setPermissionMode(...)` resolves
		// and `entry.send(...)` synchronously pushes the second prompt onto
		// the in-flight queue BEFORE we release the iterator gate. Otherwise
		// the parked iterator yields the second `result` with no in-flight
		// request to match it and `_processMessages` falls into
		// "stream ended without result".
		await tick();
		// Release the parked iterator so result(idx=2) flows through.
		advance.complete();
		await p2;

		assert.deepStrictEqual({
			startupCallsAfterTurn1,
			startupCallsAfterTurn2: sdk.startupCallCount,
			queryCallsAfterTurn1,
			queryCallsAfterTurn2: sdk.warmQueries[0]?.queryCallCount,
			warmQueryCount: sdk.warmQueries.length,
			drainedPromptCount: sdk.warmQueries[0]?.produced?.drainedPrompts.length,
		}, {
			startupCallsAfterTurn1: 1,
			startupCallsAfterTurn2: 1,
			queryCallsAfterTurn1: 1,
			queryCallsAfterTurn2: 1,
			warmQueryCount: 1,
			drainedPromptCount: 2,
		});
	});

	test('text content_block emits ChatResponsePart(Markdown) before ChatDelta', async () => {
		// Phase 6 §5.1 Test 6 + §3.6. The protocol reducer at
		// `actions.ts:233 (ChatDelta)` requires the targeted
		// `ChatResponsePart` to have already been emitted, otherwise
		// the delta has nowhere to land. This test pins that ordering by
		// staging a single text turn and asserting the first emitted
		// `ChatResponsePart(Markdown, partId=X)` precedes every
		// `ChatDelta(partId=X)` for the same X. The mapper allocates
		// the partId on `content_block_start`, BEFORE any delta can
		// arrive (deltas are SDK-ordered after the start), so the
		// invariant holds by construction.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeStreamEvent(sessionId, makeMessageStart()),
			makeStreamEvent(sessionId, makeContentBlockStartText(0)),
			makeStreamEvent(sessionId, makeTextDelta(0, 'hello ')),
			makeStreamEvent(sessionId, makeTextDelta(0, 'world')),
			makeStreamEvent(sessionId, makeContentBlockStop(0)),
			makeStreamEvent(sessionId, makeMessageStop()),
			makeResultSuccess(sessionId),
		];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		const actionSignals = signals.filter(s => s.kind === 'action');
		const partActions = actionSignals
			.map((s, i) => ({ s, i }))
			.filter(({ s }) => s.kind === 'action' && s.action.type === ActionType.ChatResponsePart);
		const deltaActions = actionSignals
			.map((s, i) => ({ s, i }))
			.filter(({ s }) => s.kind === 'action' && s.action.type === ActionType.ChatDelta);

		assert.strictEqual(partActions.length, 1, 'exactly one Markdown response part');
		assert.strictEqual(deltaActions.length, 2, 'two text deltas');

		const part = partActions[0].s.kind === 'action' && partActions[0].s.action.type === ActionType.ChatResponsePart
			? partActions[0].s.action
			: undefined;
		const firstDelta = deltaActions[0].s.kind === 'action' && deltaActions[0].s.action.type === ActionType.ChatDelta
			? deltaActions[0].s.action
			: undefined;
		const secondDelta = deltaActions[1].s.kind === 'action' && deltaActions[1].s.action.type === ActionType.ChatDelta
			? deltaActions[1].s.action
			: undefined;

		assert.ok(part, 'ChatResponsePart action present');
		assert.ok(firstDelta, 'first ChatDelta action present');
		assert.ok(secondDelta, 'second ChatDelta action present');
		assert.strictEqual(part.part.kind, ResponsePartKind.Markdown, 'part kind is Markdown');

		assert.deepStrictEqual({
			partKindIsMarkdown: part.part.kind === ResponsePartKind.Markdown,
			partPrecedesDelta: partActions[0].i < deltaActions[0].i,
			partIdsMatch: part.part.id === firstDelta.partId && part.part.id === secondDelta.partId,
			turnId: part.turnId,
			deltaTexts: [firstDelta.content, secondDelta.content],
			session: partActions[0].s.kind === 'action' ? partActions[0].s.resource.toString() : undefined,
		}, {
			partKindIsMarkdown: true,
			partPrecedesDelta: true,
			partIdsMatch: true,
			turnId: 'turn-1',
			deltaTexts: ['hello ', 'world'],
			session: buildDefaultChatUri(created.session),
		});
	});

	test('thinking content_block emits ChatResponsePart(Reasoning) before ChatReasoning', async () => {
		// Phase 6 §5.1 Test 7. Same ordering invariant as Test 6 but for
		// extended-thinking blocks: `ChatResponsePart(Reasoning)` MUST
		// precede every `ChatReasoning(partId)` for the same partId
		// (`actions.ts:540` reducer requires the part to exist).
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeStreamEvent(sessionId, makeMessageStart()),
			makeStreamEvent(sessionId, makeContentBlockStartThinking(0)),
			makeStreamEvent(sessionId, makeThinkingDelta(0, 'let me think')),
			makeStreamEvent(sessionId, makeThinkingDelta(0, ' more')),
			makeStreamEvent(sessionId, makeContentBlockStop(0)),
			makeStreamEvent(sessionId, makeMessageStop()),
			makeResultSuccess(sessionId),
		];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		const actionSignals = signals.filter(s => s.kind === 'action');
		const partActions = actionSignals
			.map((s, i) => ({ s, i }))
			.filter(({ s }) => s.kind === 'action' && s.action.type === ActionType.ChatResponsePart);
		const reasoningActions = actionSignals
			.map((s, i) => ({ s, i }))
			.filter(({ s }) => s.kind === 'action' && s.action.type === ActionType.ChatReasoning);

		const part = partActions[0]?.s.kind === 'action' && partActions[0].s.action.type === ActionType.ChatResponsePart
			? partActions[0].s.action
			: undefined;
		const firstReasoning = reasoningActions[0]?.s.kind === 'action' && reasoningActions[0].s.action.type === ActionType.ChatReasoning
			? reasoningActions[0].s.action
			: undefined;
		const secondReasoning = reasoningActions[1]?.s.kind === 'action' && reasoningActions[1].s.action.type === ActionType.ChatReasoning
			? reasoningActions[1].s.action
			: undefined;

		assert.ok(part, 'ChatResponsePart action present');
		assert.ok(firstReasoning, 'first ChatReasoning action present');
		assert.ok(secondReasoning, 'second ChatReasoning action present');
		assert.ok(part.part.kind === ResponsePartKind.Reasoning, 'part kind is Reasoning');

		assert.deepStrictEqual({
			partActionsCount: partActions.length,
			reasoningActionsCount: reasoningActions.length,
			partKindIsReasoning: part.part.kind === ResponsePartKind.Reasoning,
			partPrecedesReasoning: partActions[0].i < reasoningActions[0].i,
			partIdsMatch: part.part.id === firstReasoning.partId && part.part.id === secondReasoning.partId,
			turnId: part.turnId,
			reasoningTexts: [firstReasoning.content, secondReasoning.content],
		}, {
			partActionsCount: 1,
			reasoningActionsCount: 2,
			partKindIsReasoning: true,
			partPrecedesReasoning: true,
			partIdsMatch: true,
			turnId: 'turn-1',
			reasoningTexts: ['let me think', ' more'],
		});
	});

	test('result emits ChatUsage immediately before ChatTurnComplete', async () => {
		// Phase 6 §5.1 Test 8 + §4 mapping table. The protocol contract
		// requires usage to be reported BEFORE the turn is marked
		// complete (otherwise consumers that flush state on
		// `ChatTurnComplete` lose the usage attribution). Both
		// signals come from the single `result` SDK message; the mapper
		// emits them in the prescribed order.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		const result = makeResultSuccess(sessionId);
		// Override the zero-default usage with values the mapper must
		// forward verbatim into `ChatUsage.usage`.
		result.usage.input_tokens = 17;
		result.usage.output_tokens = 42;
		result.usage.cache_read_input_tokens = 5;
		result.modelUsage = {
			'claude-sonnet-4-test': {
				inputTokens: 17,
				outputTokens: 42,
				cacheReadInputTokens: 5,
				cacheCreationInputTokens: 0,
				webSearchRequests: 0,
				costUSD: 0,
				contextWindow: 200000,
				maxOutputTokens: 8192,
			},
		};
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), result];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		const tail = signals
			.map(s => s.kind === 'action' ? s.action : undefined)
			.filter((a): a is NonNullable<typeof a> =>
				a?.type === ActionType.ChatUsage || a?.type === ActionType.ChatTurnComplete);

		const usage = tail[0]?.type === ActionType.ChatUsage ? tail[0] : undefined;
		const complete = tail[1]?.type === ActionType.ChatTurnComplete ? tail[1] : undefined;

		assert.ok(usage, 'first action in tail is ChatUsage');
		assert.ok(complete, 'second action in tail is ChatTurnComplete');

		assert.deepStrictEqual({
			tailLength: tail.length,
			usageType: tail[0]?.type,
			completeType: tail[1]?.type,
			usageTurnId: usage.turnId,
			completeTurnId: complete.turnId,
			inputTokens: usage.usage.inputTokens,
			outputTokens: usage.usage.outputTokens,
			cacheReadTokens: usage.usage.cacheReadTokens,
			model: usage.usage.model,
		}, {
			tailLength: 2,
			usageType: ActionType.ChatUsage,
			completeType: ActionType.ChatTurnComplete,
			usageTurnId: 'turn-1',
			completeTurnId: 'turn-1',
			inputTokens: 17,
			outputTokens: 42,
			cacheReadTokens: 5,
			model: 'claude-sonnet-4-test',
		});
	});

	test('proxy credit reports are summed and attached to the turn ChatUsage as copilotUsage', async () => {
		// CAPI bills real Copilot credits per `/v1/messages` request via
		// `copilot_usage.total_nano_aiu`, surfaced by the proxy's
		// `onDidReportCredits` (the SDK strips it from its `result`). The
		// session accumulates every report for the turn and attaches the
		// sum to the turn's ChatUsage as `_meta.copilotUsage.totalNanoAiu`.
		const { agent, proxy, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		const result = makeResultSuccess(sessionId);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), result];

		// Two proxy reports (e.g. a main-thread call plus a subagent call)
		// fired mid-turn, before the result closes the turn. `queryAdvance`
		// runs just before each message is yielded; index 1 is the result.
		sdk.queryAdvance = async (idx: number) => {
			if (idx === 1) {
				proxy.onDidReportCreditsEmitter.fire({ sessionId, totalNanoAiu: 1_500_000_000 });
				proxy.onDidReportCreditsEmitter.fire({ sessionId, totalNanoAiu: 500_000_000 });
			}
		};

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		const usage = signals
			.map(s => s.kind === 'action' ? s.action : undefined)
			.find(a => a?.type === ActionType.ChatUsage);
		assert.ok(usage && usage.type === ActionType.ChatUsage, 'ChatUsage action present');
		assert.deepStrictEqual(usage.usage._meta?.copilotUsage, { totalNanoAiu: 2_000_000_000 });
	});

	test('multiple text blocks each get a distinct partId; deltas route correctly', async () => {
		// Phase 6 §5.1 Test 9. Anthropic streams interleave text blocks
		// (e.g. assistant emits two paragraphs in the same turn). Each
		// `content_block_start` event has a distinct `index`; the mapper
		// allocates a fresh partId per index and routes deltas via the
		// `currentBlockParts` map. This test stages two text blocks at
		// indices 0 and 1, sends a delta into each, and asserts the
		// allocation produced two distinct partIds and the deltas
		// landed on the right one.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeStreamEvent(sessionId, makeMessageStart()),
			makeStreamEvent(sessionId, makeContentBlockStartText(0)),
			makeStreamEvent(sessionId, makeTextDelta(0, 'first ')),
			makeStreamEvent(sessionId, makeContentBlockStop(0)),
			makeStreamEvent(sessionId, makeContentBlockStartText(1)),
			makeStreamEvent(sessionId, makeTextDelta(1, 'second')),
			makeStreamEvent(sessionId, makeContentBlockStop(1)),
			makeStreamEvent(sessionId, makeMessageStop()),
			makeResultSuccess(sessionId),
		];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		const partActions = signals
			.map(s => s.kind === 'action' ? s.action : undefined)
			.filter(a => a?.type === ActionType.ChatResponsePart);
		const deltaActions = signals
			.map(s => s.kind === 'action' ? s.action : undefined)
			.filter(a => a?.type === ActionType.ChatDelta);

		const part0 = partActions[0]?.type === ActionType.ChatResponsePart ? partActions[0] : undefined;
		const part1 = partActions[1]?.type === ActionType.ChatResponsePart ? partActions[1] : undefined;
		const delta0 = deltaActions[0]?.type === ActionType.ChatDelta ? deltaActions[0] : undefined;
		const delta1 = deltaActions[1]?.type === ActionType.ChatDelta ? deltaActions[1] : undefined;

		assert.ok(part0 && part1, 'two ChatResponsePart actions present');
		assert.ok(delta0 && delta1, 'two ChatDelta actions present');

		const id0 = part0.part.kind === ResponsePartKind.Markdown ? part0.part.id : '';
		const id1 = part1.part.kind === ResponsePartKind.Markdown ? part1.part.id : '';

		assert.deepStrictEqual({
			partActionsCount: partActions.length,
			deltaActionsCount: deltaActions.length,
			distinctPartIds: id0 !== id1,
			delta0RoutedToPart0: delta0.partId === id0,
			delta1RoutedToPart1: delta1.partId === id1,
			delta0Content: delta0.content,
			delta1Content: delta1.content,
		}, {
			partActionsCount: 2,
			deltaActionsCount: 2,
			distinctPartIds: true,
			delta0RoutedToPart0: true,
			delta1RoutedToPart1: true,
			delta0Content: 'first ',
			delta1Content: 'second',
		});
	});

	test('canonical SDKAssistantMessage with tool_use content drops silently (partial stream owns ChatToolCallStart)', async () => {
		// Phase 7 §3.3: the canonical `SDKAssistantMessage` (`type:
		// 'assistant'`) is no longer special-cased for `tool_use`. The
		// `stream_event` partials already emitted `ChatToolCallStart`
		// — the reducer is append-only, so re-emitting from the canonical
		// envelope would duplicate. Drop silently. The Phase 6.1
		// warn-and-drop is gone alongside `canUseTool: deny`.
		const logService = new CapturingLogService();
		const { agent, sdk } = createTestContext(disposables, { logService });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeAssistantMessage(sessionId, [
				{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: {} },
			]),
			makeResultSuccess(sessionId),
		];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		const responsePartCount = signals
			.map(s => s.kind === 'action' ? s.action : undefined)
			.filter(a => a?.type === ActionType.ChatResponsePart).length;

		assert.deepStrictEqual({
			responsePartCount,
			warnedAboutToolUse: logService.warns.some(m => /tool_use/.test(m)),
		}, {
			responsePartCount: 0,
			warnedAboutToolUse: false,
		});
	});

	test('D3: subagent spawn mirrors onto onDidSpawnChat while the subagent signals still flow', async () => {
		// The membership channel (onDidSpawnChat) is derived from the
		// subagent_started signal the agent already emits on
		// onDidSessionProgress — the orchestrator records the spawn edge on the
		// unified chat catalog. A completed subagent chat stays live and
		// subscribable (removed only on session teardown). The
		// signals must STILL be forwarded verbatim so the existing
		// AgentSideEffects subagent handling (turn lifecycle + parent tool-call
		// content) is preserved.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		const PARENT = 'toolu_parent_sa';

		const innerAssistant = makeAssistantMessage(sessionId, [
			{ type: 'text', text: 'searching the workspace', citations: null },
		]);
		innerAssistant.parent_tool_use_id = PARENT;

		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			// Stream the spawning Task tool_use so the registry records the spawn.
			makeStreamEvent(sessionId, makeMessageStart()),
			makeStreamEvent(sessionId, makeContentBlockStartToolUse(0, PARENT, 'Task')),
			makeStreamEvent(sessionId, makeContentBlockStop(0)),
			makeStreamEvent(sessionId, makeMessageStop()),
			// Canonical Task assistant records subagent metadata (subagent_type).
			makeAssistantMessage(sessionId, [
				{ type: 'tool_use', id: PARENT, name: 'Task', input: { description: 'Count files', subagent_type: 'Explore', prompt: 'go' } },
			]),
			// Inner subagent content (parent_tool_use_id set) prepends subagent_started.
			innerAssistant,
			// Parent tool result completes the foreground subagent.
			makeUserToolResultMessage(sessionId, PARENT, 'done'),
			makeResultSuccess(sessionId),
		];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));
		const spawned: IAgentSpawnChatEvent[] = [];
		disposables.add(agent.onDidSpawnChat!(e => spawned.push(e)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		const subagentChatUri = buildSubagentChatUri(created.session, PARENT);

		assert.deepStrictEqual({
			startedSignals: signals.filter(s => s.kind === 'subagent_started').length,
			completedSignals: signals.filter(s => s.kind === 'subagent_completed').length,
			spawned: spawned.map(e => ({
				session: e.session.toString(),
				chat: e.chat.toString(),
				parentChat: e.parent?.chat.toString(),
				parentToolCallId: e.parent?.toolCallId,
				title: e.title,
			})),
		}, {
			startedSignals: 1,
			completedSignals: 1,
			spawned: [{
				session: created.session.toString(),
				chat: subagentChatUri,
				parentChat: buildDefaultChatUri(created.session),
				parentToolCallId: PARENT,
				// Titled by the Task tool's concise `description` input, not the
				// agent-type name (`subagent_type: 'Explore'`).
				title: 'Count files',
			}],
		});
	});

	test('canonical SDKAssistantMessage with text content does not double-emit signals already produced by stream_event partials (Phase 6.1 / Cycle F)', async () => {
		// CONTEXT.md M8:875 — partials are advisory, final
		// `SDKAssistantMessage` is canonical. With `includePartialMessages:
		// true` (Phase 6 §3.4) the `stream_event` partials already drove
		// the response part + per-token deltas. The terminal `'assistant'`
		// envelope MUST NOT add a second copy: the reducer is append-only
		// (no replace path), so a double-emit would corrupt the activeTurn
		// `responseParts` list with a duplicated block.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeStreamEvent(sessionId, makeMessageStart()),
			makeStreamEvent(sessionId, makeContentBlockStartText(0)),
			makeStreamEvent(sessionId, makeTextDelta(0, 'hello')),
			makeStreamEvent(sessionId, makeContentBlockStop(0)),
			makeStreamEvent(sessionId, makeMessageStop()),
			makeAssistantMessage(sessionId, [
				{ type: 'text', text: 'hello', citations: null },
			]),
			makeResultSuccess(sessionId),
		];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		const partActions = signals
			.map(s => s.kind === 'action' ? s.action : undefined)
			.filter(a => a?.type === ActionType.ChatResponsePart);
		const deltaActions = signals
			.map(s => s.kind === 'action' ? s.action : undefined)
			.filter(a => a?.type === ActionType.ChatDelta);

		const delta0 = deltaActions[0]?.type === ActionType.ChatDelta ? deltaActions[0] : undefined;

		assert.deepStrictEqual({
			partCount: partActions.length,
			deltaCount: deltaActions.length,
			deltaContent: delta0?.content,
		}, {
			partCount: 1,
			deltaCount: 1,
			deltaContent: 'hello',
		});
	});

	test('_isResumed flips on first system:init', async () => {
		// Phase 6 §5.1 Test 10. The SDK's `system:init` message marks
		// the start of a session. Phase 7+ teardown+recreate uses
		// `_isResumed` to drive `Options.resume = sessionId` on the
		// second `startup()`, signalling the SDK to reuse the existing
		// transcript. Phase 6 has no teardown+recreate yet, so the test
		// asserts the flag flip directly through a session getter.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		// Snapshot before the SDK has streamed any messages.
		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		const session = agent.getSessionForTesting(created.session);
		assert.ok(session, 'session is materialized');
		assert.strictEqual(session.isResumed, true, 'isResumed flipped after system:init');
	});

	test('disposing a materialized session aborts the controller and rejects the in-flight send', async () => {
		// Phase 6 §5.1 Test 11. The dispose chain registered in
		// `ClaudeAgentSession`'s constructor calls
		// `abortController.abort()`. The for-await loop sees
		// `signal.aborted` and throws `CancellationError`, and the
		// `_processMessages` catch latches `_fatalError` + rejects every
		// in-flight deferred. Without the latch the in-flight send
		// would park forever and the test would hang.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		// Park the iterator at index 0 so `_processMessages` is
		// suspended inside `next()` when dispose runs. After dispose
		// flips `signal.aborted`, releasing `advance` lets the
		// for-await body run the `if (aborted) throw` check.
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (idx: number) => {
			if (idx === 0) {
				await advance.p;
			}
		};
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
		];

		// Use the materialize event to deterministically wait until the
		// session is in `_sessions` (and the in-flight deferred has been
		// queued by `entry.send`). Without this we'd race materialize.
		const materialized = Event.toPromise(agent.onDidMaterializeSession);

		const send = agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');
		const settle: { rejected?: unknown } = {};
		const sendDone = send.then(() => { settle.rejected = false; }, err => { settle.rejected = err; });

		await materialized;
		// One additional macro-flush so `entry.send` has pushed the
		// deferred to `_inFlightRequests` and `_processMessages` has
		// started its for-await (parked on `advance.p`).
		await new Promise<void>(resolve => setImmediate(resolve));

		const aborter = sdk.capturedStartupOptions[0]?.abortController;
		await agent.disposeSession(created.session);
		// Release the parked iterator so the for-await loop unblocks
		// and the abort-check throws CancellationError.
		advance.complete();
		await sendDone;

		assert.deepStrictEqual({
			rejectedIsCancellation: isCancellationError(settle.rejected),
			abortedAfterDispose: aborter?.signal.aborted,
			sessionRemoved: agent.getSessionForTesting(created.session) === undefined,
		}, {
			rejectedIsCancellation: true,
			abortedAfterDispose: true,
			sessionRemoved: true,
		});
	});

	test('dispose racing _writeCustomizationDirectory does not orphan the materialized session (C1)', async () => {
		// Council-review C1 regression. The plan's Q8 belt-and-suspenders
		// abort guard at `_materializeProvisional` only catches an abort
		// that lands while `await sdk.startup()` is in flight.
		// `_writeCustomizationDirectory` is a SECOND async boundary where
		// a racing `disposeSession` (which uses `_disposeSequencer` — a
		// different sequencer from `sendMessage`'s `_sessionSequencer`)
		// can fire, find the provisional record, abort, remove, and
		// return. Without the pre-commit abort gate added in this fix,
		// materialize would still set `_sessions[sessionId]` and fire
		// `onDidMaterializeSession` — leaking a WarmQuery subprocess.
		//
		// Test setup uses a custom session database whose `setMetadata`
		// blocks on a per-test deferred so we can deterministically
		// interleave dispose with persist. The fix asserts:
		//  - the racing `sendMessage` rejects with `CancellationError`
		//  - the session never lands in `_sessions`
		//  - `onDidMaterializeSession` never fires
		//  - the WarmQuery is asyncDisposed (no orphan subprocess)
		const persistGate = new DeferredPromise<void>();
		let persistEntered = false;
		const blockingDb = new TestSessionDatabase();
		const originalSetMetadata = blockingDb.setMetadata.bind(blockingDb);
		blockingDb.setMetadata = async (key, value) => {
			persistEntered = true;
			await persistGate.p;
			await originalSetMetadata(key, value);
		};

		const proxy = new FakeClaudeProxyService();
		const api = new FakeCopilotApiService();
		api.models = async () => [...ALL_MODELS];
		const sdk = new FakeClaudeAgentSdkService();
		const sessionData = createSessionDataService(blockingDb);
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configService = disposables.add(new AgentConfigurationService(stateManager, logService));

		const services = new ServiceCollection(
			...claudeFileEnvServices(disposables),
			[ILogService, logService],
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IAgentHostGitService, createNoopGitService()],
			[IAgentConfigurationService, configService],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent: ClaudeAgent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const materializeEvents: IAgentMaterializeSessionEvent[] = [];
		disposables.add(agent.onDidMaterializeSession(e => materializeEvents.push(e)));

		// Kick off the materialize. It will pass the post-startup abort
		// gate, create the wrapper, then park inside `setMetadata`.
		const send = agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');
		const settle: { rejected?: unknown } = {};
		const sendDone = send.then(() => { settle.rejected = false; }, err => { settle.rejected = err; });

		// Wait until the persist step has actually been entered. This is
		// the deterministic gate — without it we'd be racing the materialize
		// progress against our dispose call.
		while (!persistEntered) {
			await new Promise<void>(resolve => setImmediate(resolve));
		}

		// Now dispose while persist is parked. The dispose-sequencer is
		// independent of the send-sequencer, so this runs immediately:
		// finds the provisional, aborts the controller, removes from
		// `_provisionalSessions`, returns.
		await agent.disposeSession(created.session);

		// Release the persist gate. Materialize resumes after the
		// `await setMetadata`, hits the pre-commit abort gate (signal is
		// aborted), disposes the wrapper, and throws CancellationError.
		persistGate.complete();
		await sendDone;

		assert.deepStrictEqual({
			rejectedIsCancellation: isCancellationError(settle.rejected),
			sessionNotInMap: agent.getSessionForTesting(created.session) === undefined,
			materializeNeverFired: materializeEvents.length === 0,
			warmQueryDisposed: sdk.warmQueries[0]?.asyncDisposeCount === 1,
		}, {
			rejectedIsCancellation: true,
			sessionNotInMap: true,
			materializeNeverFired: true,
			warmQueryDisposed: true,
		});
	});

	test('disposing a provisional session never calls SDK startup and removes the record', async () => {
		// Phase 6 §5.1 Test 12. Symmetric with createSession's
		// "no SDK contact" invariant: provisional dispose must NOT
		// reach `sdk.startup` (no subprocess spawn for an
		// already-cancelled session). Pinned by:
		//  - `sdk.startupCallCount === 0` after dispose
		//  - a subsequent `sendMessage` for the same URI throws
		//    'Cannot send to unknown session' (proves the provisional
		//    record was actually removed, not just abort-flagged)
		//  - the provisional's `AbortController` flipped to aborted
		//    (so any future racing materialize would short-circuit)
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });

		await agent.disposeSession(created.session);

		// Materializing now requires a provisional record; without it
		// the sequencer task throws synchronously inside the queued fn.
		const sendErr = await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1')
			.then(() => undefined, err => err);

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			warmQueriesLength: sdk.warmQueries.length,
			sendThrewUnknown: sendErr instanceof Error && /unknown session/i.test(sendErr.message),
			materializedAbsent: agent.getSessionForTesting(created.session) === undefined,
		}, {
			startupCallCount: 0,
			warmQueriesLength: 0,
			sendThrewUnknown: true,
			materializedAbsent: true,
		});
	});

	test('sendMessage on a disk-only session (created in another window) resumes from disk', async () => {
		// Regression for: "Open a session that was not started in the
		// active window, send it a message → Error: Cannot send to
		// unknown session: <id>". Before the fix, sendMessage's else
		// branch (no `_sessions` entry AND no `_provisionalSessions`
		// entry) threw outright. After the fix it routes through
		// `_resumeSession`, which mirrors CopilotAgent._resumeSession:
		// read `cwd` from `sdkService.getSessionInfo`, model + permission
		// mode from the metadata overlay, build an on-the-fly provisional
		// record, and materialize with `startMode: 'resume'` so the SDK
		// loads the existing transcript via `Options.resume` instead of
		// minting a fresh sessionId via `Options.sessionId`.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		// Stage a session that exists on disk (in the SDK's transcript
		// store) but was never createSession'd on this agent instance.
		const sessionId = 'cross-window-session-id';
		const sessionUri = AgentSession.uri('claude', sessionId);
		sdk.sessionList = [{
			sessionId,
			summary: 'From another window',
			lastModified: 5000,
			createdAt: 4900,
			cwd: URI.file('/work').fsPath,
		}];
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
		];

		const events: IAgentMaterializeSessionEvent[] = [];
		disposables.add(agent.onDidMaterializeSession(e => events.push(e)));

		await agent.chats.sendMessage(defaultChatUri(sessionUri), 'hi', undefined, undefined, 'turn-1');

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			materializeEventCount: events.length,
			eventSession: events[0]?.session.toString(),
			eventCwd: events[0]?.workingDirectory?.fsPath,
			startupOptionsCwd: sdk.capturedStartupOptions[0]?.cwd,
			// In resume mode the SDK gets `Options.resume = <id>` and
			// MUST NOT get `Options.sessionId`.
			startupOptionsResume: sdk.capturedStartupOptions[0]?.resume,
			startupOptionsSessionId: sdk.capturedStartupOptions[0]?.sessionId,
			sessionInMap: agent.getSessionForTesting(sessionUri) !== undefined,
		}, {
			startupCallCount: 1,
			materializeEventCount: 1,
			eventSession: sessionUri.toString(),
			eventCwd: URI.file('/work').fsPath,
			startupOptionsCwd: URI.file('/work').fsPath,
			startupOptionsResume: sessionId,
			startupOptionsSessionId: undefined,
			sessionInMap: true,
		});
	});

	test('sendMessage on a disk-only session whose SDK record is missing throws "unknown session"', async () => {
		// Defense-in-depth pair to the resume-from-disk test above. If
		// the SDK has no record of the session id at all (e.g. the
		// transcript file was deleted out from under us), `_resumeSession`
		// must surface a clear error rather than silently fabricating a
		// fresh session bound to the wrong cwd. Also pins: no SDK startup
		// is performed in this failure path (no subprocess spawn for a
		// session we can't actually resume).
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sessionUri = AgentSession.uri('claude', 'ghost-session-id');
		// sdk.sessionList stays empty — getSessionInfo resolves undefined.

		const sendErr = await agent.chats.sendMessage(defaultChatUri(sessionUri), 'hi', undefined, undefined, 'turn-1')
			.then(() => undefined, err => err);

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			sendThrewUnknown: sendErr instanceof Error && /unknown session/i.test(sendErr.message),
			sessionAbsent: agent.getSessionForTesting(sessionUri) === undefined,
		}, {
			startupCallCount: 0,
			sendThrewUnknown: true,
			sessionAbsent: true,
		});
	});

	test('resumed session keeps overlay-derived permissionMode on turn 2 (no silent flip to default)', async () => {
		// Regression for Copilot review feedback on the cross-window
		// resume PR. Before the fix, the materialized-session branch in
		// `sendMessage` unconditionally called
		// `session.setPermissionMode(_readSessionPermissionMode(uri) ?? 'default')`
		// on turn 2. For a cross-window-resumed session, AgentService
		// never registered the per-session schema (that happens via
		// `sessionAdded` for createSession-spawned sessions), so
		// `_readSessionPermissionMode` returned `undefined`, the
		// fallback `'default'` won, and a plan-mode session silently
		// downgraded to default mode mid-chat.
		//
		// The C9 mechanism: the pipeline is seeded at materialize with the
		// resolved permissionMode ('plan') as its applied-config baseline, and
		// `setPermissionMode` dedups against it. Turn 2 reuses the live pipeline,
		// resolves 'plan' again, matches the seed, and issues NO runtime call —
		// the seeded mode stays authoritative and 'default' is never pushed.
		//
		// Setup: stage the per-session DB with `claude.permissionMode='plan'`,
		// then run two turns on ONE subprocess (park at the turn boundary so the
		// pipeline stays live for turn 2). Turn 1 picks up the mode via
		// `Options.permissionMode` at materialize; turn 2 records no
		// `setPermissionMode` call.
		const sessionId = 'cross-window-mode-session';
		const sessionUri = AgentSession.uri('claude', sessionId);

		const db = new TestSessionDatabase();
		await db.setMetadata('claude.permissionMode', 'plan');

		const { agent, sdk } = createTestContext(disposables, { database: db });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		sdk.sessionList = [{
			sessionId,
			summary: 'From another window (plan mode)',
			lastModified: 5000,
			createdAt: 4900,
			cwd: URI.file('/work').fsPath,
		}];
		// Park the consumer loop at the turn boundary so the pipeline stays live
		// across both turns on a single subprocess (production reuse).
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (i: number) => { if (i === 2) { await advance.p; } };
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(sessionUri), 'turn-1', undefined, undefined, 't1');

		// Turn 2 reuses the live pipeline; its result drains at the parked boundary.
		sdk.nextQueryMessages.push(makeResultSuccess(sessionId));
		const turn2 = agent.chats.sendMessage(defaultChatUri(sessionUri), 'turn-2', undefined, undefined, 't2');
		advance.complete();
		await turn2;

		const fakeQuery = sdk.warmQueries.at(-1)?.produced;
		assert.deepStrictEqual({
			startupCount: sdk.startupCallCount,
			optionsPermissionMode: sdk.capturedStartupOptions[0]?.permissionMode,
			recordedModes: fakeQuery?.recordedPermissionModes ?? [],
		}, {
			startupCount: 1,
			optionsPermissionMode: 'plan',
			recordedModes: [],
		});
	});

	test('onSessionConfigChanged forwards a mid-turn picker change and reverts to the fallback when the key is deleted (issue #321691)', async () => {
		// The host calls this hook for user/picker changes only (internal server
		// writes like ExitPlanMode never route here), so it forwards the new mode
		// to the live Query so the next tool this turn auto-approves — without
		// waiting for the next send(). A `replace` that deletes `permissionMode`
		// reverts the Query to the fallback the next send() would apply.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({
			workingDirectory: URI.file('/work'),
			config: { permissionMode: 'default' },
		});
		const sessionId = AgentSession.id(created.session);

		// Park the turn mid-flight (materialized, query live) until released.
		const reached = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		sdk.queryAdvance = async (idx: number) => {
			if (idx === 1) {
				reached.complete();
				await release.p;
			}
		};
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const turn = agent.chats.sendMessage(defaultChatUri(created.session), 'edit a file', undefined, undefined, 't1');
		await reached.p;

		// Picker switches to Bypass Permissions...
		agent.onSessionConfigChanged(created.session, { permissionMode: 'bypassPermissions' });
		await tick();
		// ...then a `replace` deletes the key, reverting to the 'default' fallback.
		agent.onSessionConfigChanged(created.session, {});
		await tick();

		const recordedMidTurn = [...(sdk.warmQueries.at(-1)?.produced?.recordedPermissionModes ?? [])];

		release.complete();
		await turn;

		assert.deepStrictEqual(recordedMidTurn, ['bypassPermissions', 'default']);
	});

	test('shutdown drains a mix of provisional and materialized sessions', async () => {
		// Phase 6 §5.1 Test 13. The shutdown spec is two-phase:
		//  1) Provisional sessions: abort each AbortController + clear
		//     the map. No SDK contact (mirrors `disposeSession`'s
		//     provisional branch). This unblocks any racing
		//     `await sdk.startup()` so the materialize unwinds via the
		//     post-startup abort guard.
		//  2) Materialized sessions: drain through the per-session
		//     `_disposeSequencer` so a concurrent caller targeting the
		//     same id is serialized; each entry's `dispose()` flips
		//     `signal.aborted` and asyncDisposes the WarmQuery.
		// What this test pins: after `shutdown()`, every provisional
		// AbortController is aborted, every materialized session has
		// been removed from the map, and `shutdown()` is memoized
		// (second call returns the same promise identity).
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		// Materialize one session by running a turn end-to-end.
		const matCreated = await agent.createSession({ workingDirectory: URI.file('/work-mat') });
		sdk.nextQueryMessages = [
			makeSystemInitMessage(AgentSession.id(matCreated.session)),
			makeResultSuccess(AgentSession.id(matCreated.session)),
		];
		await agent.chats.sendMessage(defaultChatUri(matCreated.session), 'hi', undefined, undefined, 'turn-1');

		// Leave a second session provisional.
		const provCreated = await agent.createSession({ workingDirectory: URI.file('/work-prov') });
		const provAborter = (() => {
			// The provisional's controller isn't directly observable from the
			// public surface; capture it indirectly via the `capturedStartupOptions`
			// of a hypothetical materialize. Since we never materialize the
			// provisional here, we reach into the agent's test accessor:
			const provSession = agent.getSessionForTesting(provCreated.session);
			assert.strictEqual(provSession, undefined, 'second session must remain provisional');
			return undefined;
		})();
		assert.strictEqual(provAborter, undefined);

		// Capture the materialized session's WarmQuery so we can assert
		// it was asyncDisposed by shutdown.
		const matWarm = sdk.warmQueries[0];
		assert.ok(matWarm, 'materialized session must have a WarmQuery');
		const asyncDisposeBefore = matWarm.asyncDisposeCount;

		const first = agent.shutdown();
		const second = agent.shutdown();
		await Promise.all([first, second]);

		assert.deepStrictEqual({
			memoized: first === second,
			matRemoved: agent.getSessionForTesting(matCreated.session) === undefined,
			matWarmAsyncDisposed: matWarm.asyncDisposeCount > asyncDisposeBefore,
			// A post-shutdown sendMessage to the provisional URI must
			// fail because the provisional record was cleared.
			provDropped: await agent.chats.sendMessage(defaultChatUri(provCreated.session), 'late', undefined, undefined, 'turn-late')
				.then(() => false, err => err instanceof Error && /unknown session/i.test(err.message)),
			// Same for the materialized URI.
			matDropped: await agent.chats.sendMessage(defaultChatUri(matCreated.session), 'late', undefined, undefined, 'turn-late')
				.then(() => false, err => err instanceof Error && /unknown session/i.test(err.message)),
		}, {
			memoized: true,
			matRemoved: true,
			matWarmAsyncDisposed: true,
			provDropped: true,
			matDropped: true,
		});
	});

	test('mapper throwing on a malformed stream_event is logged and the turn continues', async () => {
		// Phase 6 §5.1 Test 14. The mapper does its OWN warn-and-skip
		// for known malformed shapes (e.g. tool_use streams while
		// `canUseTool: deny`). The try/catch in `_processMessages` is
		// defense-in-depth for everything else: a programming bug in
		// the mapper, an SDK output we didn't anticipate, etc. This
		// test pins that resilience guarantee — pass an event that
		// makes the mapper crash on field access (`event.delta.type`
		// when `delta` is missing), then verify:
		//   1) the catch absorbs the throw (turn doesn't reject),
		//   2) the next valid stream event still flows through (the
		//      mapper state isn't poisoned),
		//   3) the result message still completes the deferred.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		const sessionUri = created.session;
		const observed: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => {
			const resource = s.kind === 'action' ? s.resource : s.chat;
			if ((parseDefaultChatUri(resource) ?? resource.toString()) === sessionUri.toString()) {
				observed.push(s);
			}
		}));

		// Build a `content_block_delta` event missing the required
		// `delta` field. The malformed event is typed as
		// `BetaRawContentBlockDeltaEvent` via `// @ts-expect-error`
		// rather than a cast — keeps the type system honest about the
		// shape while still letting the runtime exercise the mapper's
		// defensive try/catch.
		const malformedDeltaEvent = { type: 'content_block_delta', index: 0 };
		// @ts-expect-error - intentionally missing `delta` field to test mapper resilience
		const malformedEvent: BetaRawContentBlockDeltaEvent = malformedDeltaEvent;
		const malformedMessage = makeStreamEvent(sessionId, malformedEvent);

		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeStreamEvent(sessionId, makeMessageStart()),
			makeStreamEvent(sessionId, makeContentBlockStartText(0)),
			malformedMessage,
			makeStreamEvent(sessionId, makeTextDelta(0, 'recover')),
			makeStreamEvent(sessionId, makeContentBlockStop(0)),
			makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		const deltas = observed.flatMap(s =>
			s.kind === 'action' && s.action.type === ActionType.ChatDelta
				? [s.action.content]
				: []);
		const turnCompletes = observed.filter(s =>
			s.kind === 'action' && s.action.type === ActionType.ChatTurnComplete);

		assert.deepStrictEqual({
			deltas,
			turnCompleteCount: turnCompletes.length,
		}, {
			deltas: ['recover'],
			turnCompleteCount: 1,
		});
	});

	test('sendMessage tags SDKUserMessage.uuid with the effective turn id (M1 / Turn.id ↔ uuid invariant)', async () => {
		// Phase 6.1 Cycle C / drift C1. M1 + the Glossary mandate that
		// the outbound `SDKUserMessage.uuid` carries the agent host's
		// `effectiveTurnId` (`turnId ?? generateUuid()`). Phase 6.5 fork
		// (`sdk.getSessionMessages` → message-UUID lookup) and Phase 13
		// replay (`SDKUserMessageReplay.uuid`) both depend on this id
		// being our turn id, NOT a fresh SDK-generated uuid.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-explicit');

		const drained = sdk.warmQueries[0]?.produced?.drainedPrompts ?? [];
		assert.deepStrictEqual({
			drainedCount: drained.length,
			uuid: drained[0]?.uuid,
		}, {
			drainedCount: 1,
			uuid: 'turn-explicit',
		});
	});

	test('attachments (File and Directory) become a system-reminder block on the user message', async () => {
		// Phase 6 §5.1 Test 15. The prompt resolver must produce two
		// content blocks for an attachment-bearing send: a `text`
		// block carrying the prompt, then a `text` block wrapped in
		// `<system-reminder>` listing the attached URIs (one line
		// per entry, prefix `- `, paths via fsPath for `file:` URIs).
		// Phase 6 only round-trips File and Directory — the Selection
		// branch is dead-code (AgentSideEffects strips text/selection
		// at the protocol → agent boundary).
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
		];

		const fileUri = URI.file('/work/src/foo.ts');
		const dirUri = URI.file('/work/src/bar');
		await agent.chats.sendMessage(defaultChatUri(created.session), 'review please', undefined, [
			{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'foo.ts', displayKind: 'document' },
			{ type: MessageAttachmentKind.Resource, uri: dirUri.toString(), label: 'bar', displayKind: 'directory' },
		], 'turn-1');

		const drained = sdk.warmQueries[0]?.produced?.drainedPrompts ?? [];
		assert.strictEqual(drained.length, 1, 'one prompt was drained');
		const userMessage = drained[0];
		const content = userMessage.message.content;
		assert.ok(Array.isArray(content), 'content blocks are an array');

		assert.deepStrictEqual({
			blockCount: content.length,
			promptText: content[0]?.type === 'text' ? content[0].text : undefined,
			reminderText: content[1]?.type === 'text' ? content[1].text : undefined,
		}, {
			blockCount: 2,
			promptText: 'review please',
			reminderText:
				'<system-reminder>\nThe user provided the following references:\n' +
				`- ${fileUri.fsPath}\n` +
				`- ${dirUri.fsPath}\n\n` +
				'IMPORTANT: this context may or may not be relevant to your tasks. ' +
				'You should not respond to this context unless it is highly relevant to your task.\n' +
				'</system-reminder>',
		});
	});

	test('selection attachments become URI references with line suffixes', () => {
		const fileUri = URI.file('/work/src/foo.ts');
		const blocks = resolvePromptToContentBlocks('review please', [{
			type: MessageAttachmentKind.Resource,
			uri: fileUri.toString(),
			label: 'foo.ts',
			displayKind: 'selection',
			selection: {
				range: {
					start: { line: 9, character: 1 },
					end: { line: 11, character: 2 },
				},
			},
		}]);

		assert.strictEqual(blocks.length, 2);
		assert.strictEqual(blocks[0].type, 'text');
		assert.strictEqual(blocks[0].text, 'review please');
		assert.strictEqual(blocks[1].type, 'text');
		assert.ok(blocks[1].text.includes(`- ${fileUri.fsPath}:10`));
		assert.ok(!blocks[1].text.includes('```'));
	});

	test('simple attachments use their model representation as context', () => {
		const blocks = resolvePromptToContentBlocks('/act-on-feedback', [{
			type: MessageAttachmentKind.Simple,
			label: 'Feedback',
			displayKind: AgentFeedbackAttachmentDisplayKind,
			modelRepresentation: 'Feedback text for the model',
		}]);

		assert.deepStrictEqual(blocks, [
			{ type: 'text', text: '/act-on-feedback' },
			{
				type: 'text',
				text: 'Feedback text for the model',
			},
		]);
	});

	test('agent feedback annotations attachments reference the attached comment ids', () => {
		const blocks = resolvePromptToContentBlocks('/act-on-feedback', [{
			type: MessageAttachmentKind.Annotations,
			label: '2 comments',
			displayKind: AgentFeedbackAttachmentDisplayKind,
			resource: 'ahp-session:/s/annotations',
			annotationIds: ['feedback-1'],
		}, {
			type: MessageAttachmentKind.Annotations,
			label: '2 comments',
			displayKind: AgentFeedbackAttachmentDisplayKind,
			resource: 'ahp-session:/s/annotations',
			annotationIds: ['feedback-2'],
		}]);

		assert.deepStrictEqual(blocks, [
			{ type: 'text', text: '/act-on-feedback' },
			{
				type: 'text',
				text:
					'The user attached specific feedback comments to act on (comment ids):\n' +
					'- feedback-1\n\n' +
					'Use the `listComments` tool to read their content and focus on these comments.\n\n' +
					'The user attached specific feedback comments to act on (comment ids):\n' +
					'- feedback-2\n\n' +
					'Use the `listComments` tool to read their content and focus on these comments.',
			},
		]);
	});

	test('shutdown resolves without throwing', async () => {
		const { agent } = createTestContext(disposables);
		await agent.shutdown();
	});

	test('disposeSession is a safe no-op for an unknown session', async () => {
		const { agent } = createTestContext(disposables);
		await agent.disposeSession(URI.parse('claude:/never-created'));
	});

	test('shutdown clears provisional sessions; concurrent disposeSession is safe', async () => {
		// Phase-6 update: createSession is provisional, so no
		// `ClaudeAgentSession` wrappers exist before the first
		// `sendMessage`. The wrapper-disposal-once invariant moves to
		// the materialized-session shutdown drain in Cycle 13 (§5.1
		// Test 13). What this test still pins: shutdown + a concurrent
		// `disposeSession` for a provisional URI complete without
		// throwing, both share the `_disposeSequencer` for the same
		// key, and the agent does not surface a double-dispose error.
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const r1 = await agent.createSession({ workingDirectory: URI.file('/work') });
		await agent.createSession({ workingDirectory: URI.file('/work') });

		const p1 = agent.disposeSession(r1.session);
		const p2 = agent.shutdown();
		await Promise.all([p1, p2]);

		// `shutdown` is memoized — a second call returns the same
		// promise. Pin that here so concurrent teardowns don't double-drain.
		const third = agent.shutdown();
		assert.strictEqual(third, p2);
		await third;
	});

	test('disposeSession removes the wrapper but does NOT delete the SDK or DB session', async () => {
		// Plan section 3.3.4 — `disposeSession` is wrapper teardown, NOT
		// session deletion. The SDK session and the per-session DB
		// outlive `disposeSession`; permanent deletion is a Phase 13
		// concern (deletion command) and goes through a different code
		// path. The user-visible consequence: closing a tab in the
		// workbench drops the wrapper but the session reappears in the
		// session list (and its history is still on disk) until
		// explicitly deleted. This invariant prevents accidental
		// regression in Phase 6+ where wrapper teardown will gain real
		// cleanup work (Query.interrupt) — that work MUST NOT spill
		// into SDK-side or DB-side deletion.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		// Make the SDK report the just-created session as if its
		// metadata had been written by an earlier `query()` turn —
		// that's the steady state once Phase 6 sendMessage lands.
		sdk.sessionList = [{
			sessionId: AgentSession.id(created.session),
			summary: 'Hello world',
			lastModified: 100,
		}];

		await agent.disposeSession(created.session);
		const result = await agent.listSessions();

		assert.deepStrictEqual({
			ids: result.map(r => AgentSession.id(r.session)),
			summary: result[0]?.summary,
			sdkCalls: sdk.listSessionsCallCount,
		}, {
			ids: [AgentSession.id(created.session)],
			summary: 'Hello world',
			sdkCalls: 1,
		});
	});

	test('getSessionMessages returns an empty transcript for any session', async () => {
		// Phase 5 doesn't reconstruct transcripts. Real history reconstruction
		// from the SDK event log lands in Phase 13; the bare method shape is
		// required by IAgent so callers can subscribe before any messages
		// exist. Returning `[]` is correct: the agent service supplies its
		// own provisional turns from in-memory state until this method
		// surfaces the persisted log. We assert the result is also a fresh
		// array (not a shared sentinel) so future implementations can't
		// leak mutations.
		const { agent } = createTestContext(disposables);
		const a = await agent.getSessionMessages(URI.parse('claude:/unknown-1'));
		const b = await agent.getSessionMessages(URI.parse('claude:/unknown-2'));
		assert.deepStrictEqual({ a, b, distinct: a !== b }, { a: [], b: [], distinct: true });
	});

	test('listSessions returns SDK entries decorated with the per-session DB overlay', async () => {
		// Plan section 3.3.2: the SDK is the source of truth; the per-session DB
		// is a pure overlay/cache. We seed two SDK entries and a single
		// DB carrying `claude.customizationDirectory` for entry 'a'. The
		// result must include both entries; the overlay value must
		// surface only on the entry that has a DB.
		const dbA = new TestSessionDatabase();
		await dbA.setMetadata('claude.customizationDirectory', URI.file('/foo').toString());

		const sessionData: ISessionDataService = {
			...createNullSessionDataService(),
			tryOpenDatabase: async session => {
				if (AgentSession.id(session) === 'a') {
					return { object: dbA, dispose: () => { /* no-op */ } };
				}
				return undefined;
			},
		};
		const sdk = new FakeClaudeAgentSdkService();
		sdk.sessionList = [
			{ sessionId: 'a', summary: 'Session A', lastModified: 1000, createdAt: 900 },
			{ sessionId: 'b', summary: 'Session B', lastModified: 2000, createdAt: 1900 },
		];

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[IAgentConfigurationService, createTestAgentConfigService(disposables)],
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		const result = await agent.listSessions();
		const a = result.find(r => AgentSession.id(r.session) === 'a');
		const b = result.find(r => AgentSession.id(r.session) === 'b');
		assert.deepStrictEqual({
			count: result.length,
			ids: result.map(r => AgentSession.id(r.session)).sort(),
			summaryA: a?.summary,
			summaryB: b?.summary,
			modifiedA: a?.modifiedTime,
			modifiedB: b?.modifiedTime,
			custDirA: a?.customizationDirectory?.toString(),
			custDirB: b?.customizationDirectory,
			sdkCalls: sdk.listSessionsCallCount,
		}, {
			count: 2,
			ids: ['a', 'b'],
			summaryA: 'Session A',
			summaryB: 'Session B',
			modifiedA: 1000,
			modifiedB: 2000,
			custDirA: URI.file('/foo').toString(),
			custDirB: undefined,
			sdkCalls: 1,
		});
	});

	test('listSessions tolerates a corrupt DB without poisoning the rest of the listing', async () => {
		// Plan section 3.3.2 risk: a single corrupt per-session DB MUST NOT
		// drop the other entries from the listing. CopilotAgent's
		// `Promise.all`-with-throwing-mapper pattern at copilotAgent.ts:519
		// has this latent bug; we follow AgentService.listSessions's
		// inner-try/catch pattern instead. We simulate the failure by
		// rejecting `tryOpenDatabase` for one specific sessionId; the
		// other two must still surface, and the corrupt one must fall
		// back to the bare SDK-derived entry (NOT undefined / NOT
		// dropped).
		const dbOk = new TestSessionDatabase();
		await dbOk.setMetadata('claude.customizationDirectory', URI.file('/ok').toString());

		const sessionData: ISessionDataService = {
			...createNullSessionDataService(),
			tryOpenDatabase: async session => {
				const id = AgentSession.id(session);
				if (id === 'corrupt') {
					throw new Error('simulated DB open failure');
				}
				if (id === 'ok') {
					return { object: dbOk, dispose: () => { /* no-op */ } };
				}
				return undefined;
			},
		};
		const sdk = new FakeClaudeAgentSdkService();
		sdk.sessionList = [
			{ sessionId: 'ok', summary: 'OK', lastModified: 100 },
			{ sessionId: 'corrupt', summary: 'Corrupt', lastModified: 200 },
			{ sessionId: 'external', summary: 'External', lastModified: 300 },
		];

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[IAgentConfigurationService, createTestAgentConfigService(disposables)],
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		const result = await agent.listSessions();
		const find = (id: string) => result.find(r => AgentSession.id(r.session) === id);
		assert.deepStrictEqual({
			count: result.length,
			ids: result.map(r => AgentSession.id(r.session)).sort(),
			okCustDir: find('ok')?.customizationDirectory?.toString(),
			corruptCustDir: find('corrupt')?.customizationDirectory,
			corruptSummary: find('corrupt')?.summary,
			externalCustDir: find('external')?.customizationDirectory,
		}, {
			count: 3,
			ids: ['corrupt', 'external', 'ok'],
			okCustDir: URI.file('/ok').toString(),
			corruptCustDir: undefined,
			corruptSummary: 'Corrupt',
			externalCustDir: undefined,
		});
	});

	test('listSessions returns an empty list (does not reject) when the SDK fails to load', async () => {
		// Copilot-reviewer comment: `AgentService.listSessions` fans out
		// across providers via `Promise.all` (agentService.ts:202-204).
		// If our SDK dynamic import rejects (corrupt install, missing
		// optional dep) and we let it propagate, every other provider's
		// session list disappears too \u2014 the sibling Copilot provider
		// goes blank. Catching here keeps Claude's row empty while
		// Copilot's row still surfaces.
		const sdk = new FakeClaudeAgentSdkService();
		sdk.listSessionsRejection = new Error('simulated SDK load failure');

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[IAgentConfigurationService, createTestAgentConfigService(disposables)],
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, sdk],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		const result = await agent.listSessions();
		assert.deepStrictEqual(result, []);
	});

	test('getSessionMetadata joins SDK info with sidecar overlay, returns SDK-only fields for external sessions, and undefined for unknown ids (Phase 6.1 / Cycle D4 / I7)', async () => {
		// Phase 6.1 plan / Cycle D4 + drift I7. CONTEXT.md M11 / agents.md
		// section "Lazy session metadata" (~line 2125) require Claude to
		// expose a per-session lookup that mirrors the
		// `IAgent.getSessionMetadata` shape so AgentService can hydrate
		// stale session URIs without enumerating the full provider
		// catalog. The Claude shape MUST surface external CLI sessions
		// (no sidecar) — otherwise `claude:/<id>` URIs from raw Anthropic
		// CLI runs become un-hydrate-able once enumerated. Composes:
		//   sdkService.getSessionInfo(id)   -> summary, cwd, timestamps
		//   _readSessionMetadata(uri)       -> model, customizationDirectory
		// SDK miss => undefined (caller treats as deleted/not-yet-created).
		const dbSidecar = new TestSessionDatabase();
		await dbSidecar.setMetadata('claude.customizationDirectory', URI.file('/cust').toString());
		await dbSidecar.setMetadata('claude.model', JSON.stringify({ id: 'claude-opus-4.6', config: { thinkingLevel: 'high' } }));

		const sessionData: ISessionDataService = {
			...createNullSessionDataService(),
			tryOpenDatabase: async session => {
				if (AgentSession.id(session) === 'sidecar') {
					return { object: dbSidecar, dispose: () => { /* no-op */ } };
				}
				return undefined;
			},
		};
		const sdk = new FakeClaudeAgentSdkService();
		sdk.sessionList = [
			{ sessionId: 'sidecar', summary: 'With Sidecar', lastModified: 5000, createdAt: 4900, cwd: '/work' },
			{ sessionId: 'external', summary: 'External', lastModified: 6000, createdAt: 5900, cwd: '/raw-cli' },
		];

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[IAgentConfigurationService, createTestAgentConfigService(disposables)],
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		const sidecarUri = AgentSession.uri('claude', 'sidecar');
		const externalUri = AgentSession.uri('claude', 'external');
		const unknownUri = AgentSession.uri('claude', 'unknown');

		const sidecar = await agent.getSessionMetadata!(sidecarUri);
		const external = await agent.getSessionMetadata!(externalUri);
		const unknown = await agent.getSessionMetadata!(unknownUri);

		assert.deepStrictEqual({
			sidecar: {
				session: sidecar?.session.toString(),
				summary: sidecar?.summary,
				startTime: sidecar?.startTime,
				modifiedTime: sidecar?.modifiedTime,
				workingDirectory: sidecar?.workingDirectory?.toString(),
				customizationDirectory: sidecar?.customizationDirectory?.toString(),
			},
			external: {
				session: external?.session.toString(),
				summary: external?.summary,
				startTime: external?.startTime,
				modifiedTime: external?.modifiedTime,
				workingDirectory: external?.workingDirectory?.toString(),
				customizationDirectory: external?.customizationDirectory,
			},
			unknown,
			sdkLookups: sdk.getSessionInfoCalls.slice().sort(),
		}, {
			sidecar: {
				session: sidecarUri.toString(),
				summary: 'With Sidecar',
				startTime: 4900,
				modifiedTime: 5000,
				workingDirectory: URI.file('/work').toString(),
				customizationDirectory: URI.file('/cust').toString(),
			},
			external: {
				session: externalUri.toString(),
				summary: 'External',
				startTime: 5900,
				modifiedTime: 6000,
				workingDirectory: URI.file('/raw-cli').toString(),
				customizationDirectory: undefined,
			},
			unknown: undefined,
			sdkLookups: ['external', 'sidecar', 'unknown'],
		});
	});

	test('restore-reachable SDK reads defer (no download) when the SDK is not yet local (preselection premature-download fix)', async () => {
		// Regression: when a materialized Claude session is restored on
		// startup (the renderer subscribes to the last-active session), the
		// host's restore path calls `getSessionMetadata` -> `getSessionInfo`
		// and `getSessionMessages`, both of which dynamically import the SDK.
		// Before the fix that eagerly triggered a cold SDK download (with no
		// progress interest registered, so no notification) purely from
		// preselecting/restoring Claude — the download must only start on the
		// first user message. `listSessions` was already guarded; this locks
		// in the matching guard on the two other restore-reachable reads.
		const sdk = new FakeClaudeAgentSdkService();
		sdk.canLoadWithoutDownloadResult = false;
		sdk.sessionList = [
			{ sessionId: 'materialized', summary: 'Materialized Session', lastModified: 5000, createdAt: 4900, cwd: '/work' },
		];
		sdk.sessionMessagesById.set('materialized', forkSourceMessages('materialized'));

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[IAgentConfigurationService, createTestAgentConfigService(disposables)],
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, sdk],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IProductService, FakeProductService],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		const sessionUri = AgentSession.uri('claude', 'materialized');
		const metadata = await agent.getSessionMetadata!(sessionUri);
		const messages = await agent.getSessionMessages(sessionUri);
		const sessions = await agent.listSessions();

		assert.deepStrictEqual({
			metadata,
			messages,
			sessions,
			// The SDK must never be touched — no `getSessionInfo` /
			// `getSessionMessages` calls => no dynamic import => no download.
			getSessionInfoCalls: sdk.getSessionInfoCalls,
			getSessionMessagesCalls: sdk.getSessionMessagesCalls,
		}, {
			metadata: undefined,
			messages: [],
			sessions: [],
			getSessionInfoCalls: [],
			getSessionMessagesCalls: [],
		});
	});

	test('shutdown is idempotent and returns the same memoized promise on concurrent calls', async () => {
		// Phase 6+ INVARIANT: the SDK Query subprocess for each live
		// session is aborted inside `shutdown()`. If two callers race
		// (e.g. ChatService.onDidShutdown + the host's own teardown),
		// they MUST share one drain pass — otherwise we double-abort
		// and risk EBUSY on the SQLite handle. Phase 5 has no async
		// work yet, so the race is benign in practice; the memoization
		// is locked NOW so Phase 6 inherits the contract for free.
		// Mirror of `CopilotAgent.shutdown()` at copilotAgent.ts:1246.
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		await agent.createSession({ workingDirectory: URI.file('/work') });
		await agent.createSession({ workingDirectory: URI.file('/work') });

		const first = agent.shutdown();
		const second = agent.shutdown();
		await Promise.all([first, second]);
		const third = agent.shutdown();
		await third;

		assert.deepStrictEqual({
			firstEqualsSecond: first === second,
			firstEqualsThird: first === third,
		}, {
			firstEqualsSecond: true,
			firstEqualsThird: true,
		});
	});

	test('ClaudeAgentSdkService caches the resolved module and logs the first load failure exactly once', async () => {
		// Plan section 3.1 risk: a corrupt postinstall (missing native binding,
		// bad node_modules) will fault every `import()` call. We MUST
		// surface the first failure clearly so it's diagnosable, but
		// MUST NOT spam the log on every subsequent call (listSessions
		// runs per workbench refresh and per session-list rerender).
		// Successful resolution is also cached so the dynamic import
		// runs only once across the lifetime of the host.
		//
		// We drive this via a `TestableClaudeAgentSdkService` that
		// overrides the protected `_loadSdk` seam — the production code
		// returns the narrowed `IClaudeSdkBindings` slice rather than
		// the full SDK module type, so the test can build a fake
		// without naming every export. A `RecordingLogService` captures
		// `error()` invocations.
		const errorCalls: unknown[][] = [];
		class RecordingLogService extends NullLogService {
			override error(...args: unknown[]): void {
				errorCalls.push(args);
			}
		}

		let importBehavior: 'fail' | IClaudeSdkBindings = 'fail';
		let importInvocations = 0;
		class TestableClaudeAgentSdkService extends ClaudeAgentSdkService {
			protected override async _loadSdk(): Promise<IClaudeSdkBindings> {
				importInvocations++;
				if (importBehavior === 'fail') {
					throw new Error('simulated SDK load failure');
				}
				return importBehavior;
			}
		}

		const services = new ServiceCollection(
			[ILogService, new RecordingLogService()],
			[IAgentSdkDownloader, stubAgentSdkDownloader()],
		);
		const inst = disposables.add(new InstantiationService(services));
		const svc = inst.createInstance(TestableClaudeAgentSdkService);

		// First two calls fault → exactly one log entry; both retry the import.
		await assert.rejects(() => svc.listSessions(), /simulated SDK load failure/);
		await assert.rejects(() => svc.listSessions(), /simulated SDK load failure/);
		const failuresLogged = errorCalls.length;
		const importInvocationsAfterFailures = importInvocations;

		// Recover.
		importBehavior = {
			listSessions: async () => [{ sessionId: 's', summary: 's', lastModified: 1 }],
			getSessionInfo: async () => undefined,
			startup: async () => { throw new Error('TestableClaudeAgentSdkService: startup not modeled'); },
			query: () => { throw new Error('not modeled'); },
			getSessionMessages: async () => [],
			listSubagents: async () => [],
			getSubagentMessages: async () => [],
			forkSession: async () => { throw new Error('not modeled'); },
			deleteSession: async () => { throw new Error('not modeled'); },
			createSdkMcpServer: () => { throw new Error('not modeled'); },
			tool: () => { throw new Error('not modeled'); },
		};
		const result1 = await svc.listSessions();
		const importInvocationsAfterFirstSuccess = importInvocations;

		// Subsequent successful calls hit the cache.
		const result2 = await svc.listSessions();

		assert.deepStrictEqual({
			failuresLogged,
			importInvocationsAfterFailures,
			importInvocationsAfterFirstSuccess,
			invocationsAfterCachedCall: importInvocations,
			result1Length: result1.length,
			result1Id: result1[0]?.sessionId,
			result2Length: result2.length,
			finalLogCount: errorCalls.length,
		}, {
			failuresLogged: 1,
			importInvocationsAfterFailures: 2,
			importInvocationsAfterFirstSuccess: 3,
			invocationsAfterCachedCall: 3,
			result1Length: 1,
			result1Id: 's',
			result2Length: 1,
			finalLogCount: 1,
		});
	});

	test('ClaudeAgentSdkService forwards listSubagents + getSubagentMessages to the underlying bindings (Phase 12 step 2)', async () => {
		// Phase 12 needs two new SDK reads. `listSubagents(sessionId)`
		// returns alphabetical subagent ids for replay enumeration;
		// `getSubagentMessages(sessionId, agentId)` returns the SDK-parsed
		// transcript for the child session. Both mirror `getSessionMessages`'
		// loader-and-cache shape: production just forwards through.
		const listCalls: { sessionId: string; options: unknown }[] = [];
		const getCalls: { sessionId: string; agentId: string; options: unknown }[] = [];
		const importBehavior: IClaudeSdkBindings = {
			listSessions: async () => [],
			getSessionInfo: async () => undefined,
			startup: async () => { throw new Error('not used'); },
			query: () => { throw new Error('not modeled'); },
			getSessionMessages: async () => [],
			listSubagents: async (sessionId, options) => {
				listCalls.push({ sessionId, options });
				return ['agent-a', 'agent-b'];
			},
			getSubagentMessages: async (sessionId, agentId, options) => {
				getCalls.push({ sessionId, agentId, options });
				return [{ uuid: 'u1' } as unknown as SessionMessage];
			},
			forkSession: async () => { throw new Error('not modeled'); },
			deleteSession: async () => { throw new Error('not modeled'); },
			createSdkMcpServer: () => { throw new Error('not modeled'); },
			tool: () => { throw new Error('not modeled'); },
		};
		class TestableClaudeAgentSdkService extends ClaudeAgentSdkService {
			protected override async _loadSdk(): Promise<IClaudeSdkBindings> {
				return importBehavior;
			}
		}

		const inst = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, new NullLogService()],
			[IAgentSdkDownloader, stubAgentSdkDownloader()],
		)));
		const svc = inst.createInstance(TestableClaudeAgentSdkService);

		const subagentIds = await svc.listSubagents('sess-1');
		const messages = await svc.getSubagentMessages('sess-1', 'agent-a', { limit: 1 });

		assert.deepStrictEqual({
			subagentIds,
			messagesLength: messages.length,
			listCalls,
			getCalls,
		}, {
			subagentIds: ['agent-a', 'agent-b'],
			messagesLength: 1,
			listCalls: [{ sessionId: 'sess-1', options: undefined }],
			getCalls: [{ sessionId: 'sess-1', agentId: 'agent-a', options: { limit: 1 } }],
		});
	});

	test('resolveSessionConfig returns Claude-native permissionMode + reused Permissions schema', async () => {
		// Plan section 3.3.5 / decision B5 — Claude collapses the platform's
		// two-axis approval model (`autoApprove` × `mode`) onto a single
		// `permissionMode` axis matching the SDK's native
		// `PermissionMode` enum (5/6 values, excluding `dontAsk`;
		// sdk.d.ts:1560). `Permissions` (allow/deny tool lists) is reused
		// unchanged from `platformSessionSchema` because the SDK accepts
		// `allowedTools` / `disallowedTools` natively.
		// Tested keys: presence + ordering of enum + the five-value
		// canonical set (matching SDK `PermissionMode` typedef at
		// `sdk.d.ts:1560`, excluding `dontAsk`, ratified in Phase 6.1 Cycle A
		// under I2) + default. Skipped keys (AutoApprove, Mode, Isolation,
		// Branch, BranchNameHint) MUST be absent — workbench
		// `AgentHostModePicker` and friends key off these property names
		// to decide what to render, and accidentally re-introducing
		// `mode` would drop the wrong picker into the Claude UI.
		const { agent } = createTestContext(disposables);
		const result = await agent.resolveSessionConfig({});
		const properties = result.schema.properties;
		const permissionMode = properties['permissionMode'];

		assert.deepStrictEqual({
			topLevelType: result.schema.type,
			propertyKeys: Object.keys(properties).sort(),
			permissionModeType: permissionMode?.type,
			permissionModeEnum: permissionMode?.enum,
			permissionModeDefault: permissionMode?.default,
			permissionsType: properties['permissions']?.type,
			values: result.values,
			autoApproveAbsent: properties['autoApprove'] === undefined,
			modeAbsent: properties['mode'] === undefined,
			isolationAbsent: properties['isolation'] === undefined,
			branchAbsent: properties['branch'] === undefined,
		}, {
			topLevelType: 'object',
			propertyKeys: ['permissionMode', 'permissions'],
			permissionModeType: 'string',
			permissionModeEnum: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'],
			permissionModeDefault: 'default',
			permissionsType: 'object',
			values: { permissionMode: 'default' },
			autoApproveAbsent: true,
			modeAbsent: true,
			isolationAbsent: true,
			branchAbsent: true,
		});
	});

	test('sessionConfigCompletions returns no items (permissionMode is a static enum)', async () => {
		// Plan section 3.3.5 — Claude's only schema property is the
		// `permissionMode` static enum, so dynamic completion is
		// definitionally empty. Locks the contract before Phase 6's
		// branch picker (subject to the worktree-extraction prerequisite
		// in section 8) might want to plug into this method.
		const { agent } = createTestContext(disposables);
		const result = await agent.sessionConfigCompletions({ property: 'permissionMode', query: 'def' });
		assert.deepStrictEqual(result, { items: [] });
	});

	test('dispose releases the proxy handle even with no materialized sessions', async () => {
		// Phase-6 update: the wrapper-before-proxy ordering invariant
		// only applies once a session has been materialized — provisional
		// sessions hold no SDK subprocess that talks to the proxy. The
		// wrapper-before-proxy ordering test moves to Cycle 11 (§5.1
		// Test 11 — dispose materialized aborts controller). What this
		// test still pins for Phase 6: dispose releases the proxy handle
		// even if no session was ever materialized, so authenticated-but-
		// unused agents don't leak the proxy refcount.
		let proxyDisposed = false;

		class RecordingProxyService implements IClaudeProxyService {
			declare readonly _serviceBrand: undefined;
			readonly onDidReportCredits: Event<IClaudeProxyCreditsReport> = Event.None;
			async start(_token: string): Promise<IClaudeProxyHandle> {
				return {
					baseUrl: 'http://127.0.0.1:0',
					nonce: 'n',
					dispose: () => { proxyDisposed = true; },
				};
			}
			dispose(): void { /* no-op */ }
		}

		const services = new ServiceCollection(
			...claudeFileEnvServices(disposables),
			[ILogService, new NullLogService()],
			[IAgentConfigurationService, createTestAgentConfigService(disposables)],
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new RecordingProxyService()],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IAgentHostGitService, createNoopGitService()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = instantiationService.createInstance(ClaudeAgent);

		await agent.authenticate('https://api.github.com', 'tok');
		await agent.createSession({ workingDirectory: URI.file('/work') });
		agent.dispose();

		assert.strictEqual(proxyDisposed, true);
	});

	test('agent.dispose() during a racing first sendMessage aborts the provisional and disposes the WarmQuery', async () => {
		// Copilot reviewer: `dispose()` did not abort provisional
		// AbortControllers. If a `sendMessage` was racing materialize
		// (parked inside `_writeCustomizationDirectory`), `dispose()`
		// would synchronously dispose `_sessions` and remove provisional
		// records via teardown — but the materialize sequencer
		// continuation, having already passed the post-startup abort
		// gate, would resume past the persist step and call
		// `_sessions.set(...)` on an already-disposed DisposableMap,
		// orphaning the WarmQuery subprocess. The fix adds a
		// `provisional.abortController.abort()` step before
		// `super.dispose()` so the post-customization-write abort gate
		// catches the race and asyncDisposes the WarmQuery.
		const persistGate = new DeferredPromise<void>();
		let persistEntered = false;
		const blockingDb = new TestSessionDatabase();
		const originalSetMetadata = blockingDb.setMetadata.bind(blockingDb);
		blockingDb.setMetadata = async (key, value) => {
			persistEntered = true;
			await persistGate.p;
			await originalSetMetadata(key, value);
		};

		const proxy = new FakeClaudeProxyService();
		const api = new FakeCopilotApiService();
		api.models = async () => [...ALL_MODELS];
		const sdk = new FakeClaudeAgentSdkService();
		const sessionData = createSessionDataService(blockingDb);
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configService = disposables.add(new AgentConfigurationService(stateManager, logService));

		const services = new ServiceCollection(
			...claudeFileEnvServices(disposables),
			[ILogService, logService],
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IAgentHostGitService, createNoopGitService()],
			[IAgentConfigurationService, configService],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent: ClaudeAgent = instantiationService.createInstance(ClaudeAgent);

		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const send = agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');
		const settle: { rejected?: unknown } = {};
		const sendDone = send.then(() => { settle.rejected = false; }, err => { settle.rejected = err; });

		while (!persistEntered) {
			await new Promise<void>(resolve => setImmediate(resolve));
		}

		// Now dispose the WHOLE AGENT while persist is parked. This is
		// the path the reviewer flagged: provisional AbortController
		// must be aborted so the post-customization-write gate catches.
		agent.dispose();

		persistGate.complete();
		await sendDone;

		assert.deepStrictEqual({
			rejectedIsCancellation: isCancellationError(settle.rejected),
			warmQueryDisposed: sdk.warmQueries[0]?.asyncDisposeCount === 1,
		}, {
			rejectedIsCancellation: true,
			warmQueryDisposed: true,
		});
	});

	test('onClientToolCallComplete is a benign no-op for an unknown toolCallId (Phase 10)', () => {
		// `AgentSideEffects` fires `onClientToolCallComplete` for every
		// server-dispatched `ChatToolCallComplete` envelope, including
		// the ones the Claude mapper emits for normal SDK tool completions.
		// Unknown ids (SDK-owned tools, stale workbench races) must NOT throw.
		const { agent } = createTestContext(disposables);
		const session = URI.parse('claude:/sess-1');
		const chat = URI.parse(buildDefaultChatUri(session));
		assert.doesNotThrow(() => {
			agent.onClientToolCallComplete(session, chat, 'toolu_unknown', { success: true, pastTenseMessage: 'ran' });
		});
	});

	// #region Phase 10 — client (MCP) tools

	test('setClientTools registers tools that flow into Options.mcpServers on first materialize', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		const tools: ToolDefinition[] = [{ name: 'echo', description: 'Echo back', inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] } }];
		agent.getOrCreateActiveClient(created.session, { clientId: 'client-1' }).tools = tools;

		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'go', undefined, undefined, 'turn-1');

		const opts = sdk.capturedStartupOptions[0];
		assert.ok(opts.mcpServers, 'mcpServers populated');
		assert.deepStrictEqual({
			startupCount: sdk.startupCallCount,
			builtToolNames: sdk.toolCalls.map(t => t.name),
		}, {
			startupCount: 1,
			builtToolNames: ['echo'],
		});
	});

	test('setClientTools after materialize triggers yield-restart on next sendMessage with the new tool set', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		// Pause the iterator after the first result so the pipeline doesn't
		// rebind on its own ("stream ended without result" → needsRebind).
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (i: number) => { if (i === 2) { await advance.p; } };
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');
		assert.strictEqual(sdk.startupCallCount, 1, 'first materialize');

		agent.getOrCreateActiveClient(created.session, { clientId: 'client-1' }).tools = [{ name: 'echo', inputSchema: { type: 'object' } }];
		sdk.queryAdvance = undefined;
		advance.complete();
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2');

		const lastBuild = sdk.createSdkMcpServerCalls[sdk.createSdkMcpServerCalls.length - 1];
		assert.deepStrictEqual({
			startupCount: sdk.startupCallCount,
			firstMcp: !!sdk.capturedStartupOptions[0].mcpServers,
			secondMcpToolNames: lastBuild?.toolNames,
		}, {
			startupCount: 2,
			firstMcp: false,
			secondMcpToolNames: ['echo'],
		});
	});

	test('a pending truncation anchor reaches the next rebuild as Options.resumeSessionAt, consumed once', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		// Pause after the first result so the pipeline doesn't auto-rebind on its own.
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (i: number) => { if (i === 2) { await advance.p; } };
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');
		assert.strictEqual(sdk.startupCallCount, 1, 'first materialize');

		// Stage a pending truncation anchor, then send again. The pending anchor
		// alone (no tool/customization diff) must force an anchored rebuild.
		await agent.getSessionForTesting(created.session)!.truncateToTurn('turn-1', 'anchor-uuid');
		sdk.queryAdvance = undefined;
		advance.complete();
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2');

		assert.deepStrictEqual({
			startupCount: sdk.startupCallCount,
			firstResumeAt: sdk.capturedStartupOptions[0].resumeSessionAt,
			secondResumeAt: sdk.capturedStartupOptions[1]?.resumeSessionAt,
		}, {
			startupCount: 2,
			firstResumeAt: undefined,
			secondResumeAt: 'anchor-uuid',
		});
	});

	test('the truncation anchor is applied exactly once and not leaked to later rebuilds', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');
		await agent.getSessionForTesting(created.session)!.truncateToTurn('turn-1', 'anchor-uuid');
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2');
		// A later tool-driven rebind must NOT resurrect the consumed anchor.
		agent.getOrCreateActiveClient(created.session, { clientId: 'c1' }).tools = [{ name: 'echo', inputSchema: { type: 'object' } }];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'third', undefined, undefined, 'turn-3');

		const anchored = sdk.capturedStartupOptions.filter(o => o.resumeSessionAt === 'anchor-uuid');
		assert.deepStrictEqual({
			anchoredCount: anchored.length,
			lastResumeAt: sdk.capturedStartupOptions.at(-1)?.resumeSessionAt,
		}, {
			anchoredCount: 1,
			lastResumeAt: undefined,
		});
	});

	test('a rebuild that fails after reading the anchor keeps it staged so the next send retries the truncation', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');
		await agent.getSessionForTesting(created.session)!.truncateToTurn('turn-1', 'anchor-uuid');

		// The anchor-carrying rebuild fails at startup (one-shot). The anchor
		// must NOT be cleared — losing it would silently proceed without
		// `resumeSessionAt`, undoing the checkpoint restore.
		sdk.startupRejection = new Error('transient startup failure');
		await assert.rejects(() => agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2'));

		// Retry: the staged anchor is re-applied on the next (now-succeeding) send.
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second-retry', undefined, undefined, 'turn-2b');
		assert.strictEqual(sdk.capturedStartupOptions.at(-1)?.resumeSessionAt, 'anchor-uuid');
	});

	test('truncateToTurn / pruneAllTurns reach the session database', async () => {
		const database = new TestSessionDatabase();
		const { agent, sdk } = createTestContext(disposables, { database });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');
		const session = agent.getSessionForTesting(created.session)!;

		await session.truncateToTurn('turn-1', 'anchor-uuid');
		await session.pruneAllTurns();

		assert.deepStrictEqual(
			{ afterCalls: database.deleteTurnsAfterCalls, allCalls: database.deleteAllTurnsCalls },
			{ afterCalls: ['turn-1'], allCalls: 1 },
		);
	});

	test('setClientTools with an equal snapshot does NOT restart', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (i: number) => { if (i === 2) { await advance.p; } };
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		const tools: ToolDefinition[] = [{ name: 'echo', description: 'e', inputSchema: { type: 'object' } }];
		agent.getOrCreateActiveClient(created.session, { clientId: 'c1' }).tools = tools;
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');
		assert.strictEqual(sdk.startupCallCount, 1, 'first materialize');

		agent.getOrCreateActiveClient(created.session, { clientId: 'c1' }).tools = [{ name: 'echo', description: 'e', inputSchema: { type: 'object' } }];
		advance.complete();
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2');

		assert.strictEqual(sdk.startupCallCount, 1, 'equal snapshot should NOT yield-restart');
	});

	test('setClientTools on an unknown session id is silently dropped', () => {
		const { agent } = createTestContext(disposables);
		assert.doesNotThrow(() => {
			agent.getOrCreateActiveClient(URI.parse('claude:/never-existed'), { clientId: 'c1' }).tools = [{ name: 't', inputSchema: { type: 'object' } }];
		});
	});

	test('onClientToolCallComplete resolves the parked deferred keyed by tool_use_id', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		agent.getOrCreateActiveClient(created.session, { clientId: 'c1' }).tools = [{ name: 'echo', inputSchema: { type: 'object' } }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'go', undefined, undefined, 'turn-1');

		// Completion for an unknown tool_use_id is a benign no-op (no parked
		// handler in this test path because we don't drive the real MCP
		// handler from FakeQuery).
		const session = agent.getSessionForTesting(created.session)!;
		const settled = session.completeClientToolCall('tu_unknown', { success: true, pastTenseMessage: 'ok', content: [{ type: ToolResultContentType.Text, text: 'hello' }] });
		assert.strictEqual(settled, false, 'no parked handler in this test path; unknown id is silent');
	});

	test('onClientToolCallComplete walks subagent URIs to the root session', () => {
		const { agent } = createTestContext(disposables);
		const root = URI.parse('claude:/root-1');
		const chat = URI.parse(buildDefaultChatUri(root));
		// Build a depth-2 subagent URI (subagent of a subagent).
		const depth1 = URI.parse(buildSubagentSessionUri(root, 'tu_outer'));
		const depth2 = URI.parse(buildSubagentSessionUri(depth1, 'tu_inner'));
		// No session is registered for `root`; the walk should reach root and
		// then silently no-op (entry not found). Just assert no throw.
		assert.doesNotThrow(() => {
			agent.onClientToolCallComplete(depth2, chat, 'tu_anything', { success: true, pastTenseMessage: 'ran' });
		});
	});

	test('dispose rejects every parked client-tool call with CancellationError', async () => {
		// Since the bridge is gone, the only way to park on the session's
		// registry is through the real MCP handler, which is hard to drive
		// from FakeQuery. The unit-level guarantee is covered by
		// PendingRequestRegistry tests; here we just assert that dispose
		// does not throw when there are no parked calls (the common case).
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		agent.getOrCreateActiveClient(created.session, { clientId: 'c1' }).tools = [{ name: 'echo', inputSchema: { type: 'object' } }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'go', undefined, undefined, 'turn-1');
		await assert.doesNotReject(agent.disposeSession(created.session));
	});

	test('FakeQuery.setMcpServers stays unmodeled (Phase 10 never calls Query.setMcpServers for client tools)', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		agent.getOrCreateActiveClient(created.session, { clientId: 'c1' }).tools = [{ name: 'echo', inputSchema: { type: 'object' } }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');
		// Change tools to force a rebind path (must use yield-restart, NOT Query.setMcpServers).
		agent.getOrCreateActiveClient(created.session, { clientId: 'c1' }).tools = [{ name: 'echo2', inputSchema: { type: 'object' } }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2');
		// If `Query.setMcpServers` had been called, `FakeQuery.setMcpServers` would have thrown.
		assert.strictEqual(sdk.startupCallCount, 2, 'rebind path used yield-restart, not setMcpServers');
	});

	test('setClientTools landing during the materialize gap is re-synced into the live session', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		// Initial snapshot before materialize starts.
		agent.getOrCreateActiveClient(created.session, { clientId: 'c1' }).tools = [{ name: 'first', inputSchema: { type: 'object' } }];

		// Pause startup #1 so we can inject an update during the gap.
		const startupReached = new DeferredPromise<void>();
		const startupGate = new DeferredPromise<void>();
		sdk.startupAdvance = async (i: number) => {
			if (i === 1) {
				startupReached.complete();
				await startupGate.p;
			}
		};
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const send = agent.chats.sendMessage(defaultChatUri(created.session), 'go', undefined, undefined, 'turn-1');
		// Wait until the materializer has snapshotted ['first'] into the diff
		// and is paused inside `sdk.startup`. THEN inject the update.
		await startupReached.p;
		agent.getOrCreateActiveClient(created.session, { clientId: 'c1' }).tools = [{ name: 'second', inputSchema: { type: 'object' } }];
		startupGate.complete();
		await send;

		// Pre-fix: hasDifference was false after publish, so session.send used
		// the materializer's snapshot only — startupCount stayed at 1 and the
		// 'second' update was silently lost. Post-fix: the re-synced diff flips
		// dirty, session.send rebinds before sending, and the new MCP server
		// carries ['second'].
		assert.deepStrictEqual({
			startupCount: sdk.startupCallCount,
			firstSnapshot: sdk.createSdkMcpServerCalls[0]?.toolNames,
			lastSnapshot: sdk.createSdkMcpServerCalls.at(-1)?.toolNames,
		}, {
			startupCount: 2,
			firstSnapshot: ['first'],
			lastSnapshot: ['second'],
		});
	});

	test('setClientTools landing during the resume bootstrap gap is re-synced into the live session', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sessionId = 'cross-window-session-id';
		const sessionUri = AgentSession.uri('claude', sessionId);
		sdk.sessionList = [{
			sessionId,
			summary: 'From another window',
			lastModified: 5000,
			createdAt: 4900,
			cwd: URI.file('/work').fsPath,
		}];

		const startupReached = new DeferredPromise<void>();
		const startupGate = new DeferredPromise<void>();
		sdk.startupAdvance = async (i: number) => {
			if (i === 1) {
				startupReached.complete();
				await startupGate.p;
			}
		};
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const send = agent.chats.sendMessage(defaultChatUri(sessionUri), 'hi', undefined, undefined, 'turn-1');
		// Wait until the resume's `sdk.startup` is in flight, then inject the
		// update. Pre-fix the call hit the silent-drop branch because no
		// provisional was registered for the resume.
		await startupReached.p;
		agent.getOrCreateActiveClient(sessionUri, { clientId: 'c1' }).tools = [{ name: 'resumed', inputSchema: { type: 'object' } }];
		startupGate.complete();
		await send;

		assert.deepStrictEqual({
			startupCount: sdk.startupCallCount,
			lastSnapshot: sdk.createSdkMcpServerCalls.at(-1)?.toolNames,
		}, {
			startupCount: 2,
			lastSnapshot: ['resumed'],
		});
	});

	test('rebind failure leaves the client-tool diff dirty so the next send retries', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		// Pause the iterator after the first result so the pipeline doesn't
		// auto-rebind via "stream ended without result".
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (i: number) => { if (i === 2) { await advance.p; } };
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');
		assert.strictEqual(sdk.startupCallCount, 1);

		// Stage a rebind whose startup will reject.
		agent.getOrCreateActiveClient(created.session, { clientId: 'c1' }).tools = [{ name: 'echo', inputSchema: { type: 'object' } }];
		sdk.startupRejection = new Error('simulated rebind startup failure');
		sdk.queryAdvance = undefined;
		advance.complete();
		await assert.rejects(agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2'));

		// Pre-fix: `_buildClientMcpServers` consumed the diff, but the SDK
		// startup that followed rejected without re-marking dirty, so the next
		// send skipped the rebind branch and silently kept the stale server
		// set. Post-fix: the rematerializer's catch re-marks dirty, so this
		// send retries the rebind and succeeds.
		sdk.startupRejection = undefined;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'third', undefined, undefined, 'turn-3');
		assert.deepStrictEqual({
			startupCount: sdk.startupCallCount,
			lastSnapshot: sdk.createSdkMcpServerCalls.at(-1)?.toolNames,
		}, {
			startupCount: 3,
			lastSnapshot: ['echo'],
		});
	});

	// #endregion

	// #endregion
});

suite('ClaudeAgentSession (Phase 7 §3.2)', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('dispose with parked permission unblocks SDK (Test 17)', async () => {
		// Phase 7 plan Step 1 / §3.2 / Test 17: the SDK parks inside its
		// `canUseTool` callback on the deferred returned from
		// `requestPermission`. If the session is disposed mid-park, the
		// deferred MUST resolve with `false` so the SDK's `for await`
		// loop unwinds and the subprocess shuts down cleanly.
		const sdk = new FakeClaudeAgentSdkService();
		const fakeConfigService: IAgentConfigurationService = {
			getSessionConfigValues: () => undefined,
		} as unknown as IAgentConfigurationService;
		const sessionData = new RecordingSessionDataService(createSessionDataService());
		const services = new ServiceCollection(
			...claudeFileEnvServices(disposables),
			[ILogService, new NullLogService()],
			[IAgentConfigurationService, fakeConfigService],
			[IClaudeAgentSdkService, sdk],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[ISessionDataService, sessionData],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const session = disposables.add(ClaudeAgentSession.createProvisional(
			'session-id',
			URI.parse('claude:/session-id'),
			URI.parse(buildDefaultChatUri('claude:/session-id')),
			URI.file('/workspace'),
			undefined,
			undefined,
			undefined,
			undefined,
			new PendingRequestRegistry<CallToolResult>(),
			'default',
			instantiationService.createInstance(ClaudeSessionMetadataStore, 'claude'),
			instantiationService,
		));
		await session.materialize({
			transport: { kind: 'proxy', handle: { baseUrl: 'http://127.0.0.1:0', nonce: 'n', dispose: () => { } } },
			canUseTool: async () => ({ behavior: 'deny', message: 'unused' }),
			onElicitation: async () => ({ action: 'cancel' }),
			isResume: false,
		});

		const permission = session.requestPermission({
			toolUseID: 'tu_1',
			state: {
				status: ToolCallStatus.PendingConfirmation,
				toolCallId: 'tu_1',
				toolName: 'Read',
				displayName: 'Read file',
				invocationMessage: 'Read file',
				toolInput: '{}',
				confirmationTitle: 'Read file?',
			},
			permissionKind: 'read',
		});
		session.dispose();

		assert.strictEqual(await permission, false);
	});
});

suite('ClaudeAgent (Phase 7 §3.4 — _handleCanUseTool)', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Materialize a session and return its captured `canUseTool` closure
	 * alongside the {@link ITestContext} pieces tests need. Drives a
	 * minimal `system_init → result_success` turn so
	 * {@link FakeClaudeAgentSdkService.capturedStartupOptions}[0] is
	 * populated and the session lives in `_sessions`.
	 *
	 * Also seeds a {@link SessionSummary} into the
	 * {@link AgentHostStateManager} so {@link AgentConfigurationService}
	 * can read/write the session's `permissionMode` (the agent's
	 * `createSession` does NOT touch state — that's the AgentService
	 * layer's job, which we don't run here).
	 */
	async function materialize(seedConfig?: { permissionMode?: string }): Promise<{
		ctx: ITestContext;
		canUseTool: NonNullable<Options['canUseTool']>;
		sessionUri: URI;
		sessionId: string;
	}> {
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const state = ctx.stateManager.createSession({
			resource: created.session.toString(),
			provider: 'claude',
			title: 't',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		// Seed an initial `config` object directly: the
		// `SessionConfigChanged` reducer no-ops when `state.config` is
		// undefined (reducers.ts:593), so we cannot reach the seeded
		// values via `updateSessionConfig` alone.
		(state as { config?: SessionConfigState }).config = {
			schema: { type: 'object', properties: {} },
			values: { ...(seedConfig ?? {}) },
		};

		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		const canUseTool = ctx.sdk.capturedStartupOptions[0]?.canUseTool;
		assert.ok(canUseTool, 'canUseTool callback was wired into Options');
		return { ctx, canUseTool, sessionUri: created.session, sessionId };
	}

	/**
	 * Build the SDK's `canUseTool` `options` arg with a minimal
	 * AbortController-backed signal and a stable toolUseID.
	 */
	function makeOptions(toolUseID: string, overrides?: { blockedPath?: string }): Parameters<NonNullable<Options['canUseTool']>>[2] {
		return {
			signal: new AbortController().signal,
			toolUseID,
			...(overrides?.blockedPath !== undefined ? { blockedPath: overrides.blockedPath } : {}),
		};
	}

	test('Test 1 — default mode parks, respondToPermissionRequest(true) → allow', async () => {
		const { ctx, canUseTool } = await materialize();

		const promise = canUseTool('Read', { file_path: '/tmp/foo.txt' }, makeOptions('tu_1'));
		await tick();

		ctx.agent.respondToPermissionRequest('tu_1', true);
		const result = await promise;

		assert.deepStrictEqual(result, { behavior: 'allow', updatedInput: { file_path: '/tmp/foo.txt' } });
	});

	test('Test 2 — default mode parks, respondToPermissionRequest(false) → deny', async () => {
		const { ctx, canUseTool } = await materialize();

		const promise = canUseTool('Read', { file_path: '/tmp/foo.txt' }, makeOptions('tu_2'));
		await tick();

		ctx.agent.respondToPermissionRequest('tu_2', false);
		const result = await promise;

		assert.deepStrictEqual(result, { behavior: 'deny', message: 'User declined' });
	});

	// Tests 3 and 4 (bypassPermissions / acceptEdits auto-allow) intentionally
	// omitted: the SDK auto-approves under those modes BEFORE invoking
	// `canUseTool`, so there is no host-side branch to exercise. See
	// `_handleCanUseTool` JSDoc.
	//
	// Tests 5 and 6 (plan-mode auto-deny / live config flip) intentionally
	// omitted: `_handleCanUseTool` is a pure UI bridge and makes no
	// permission-mode-aware decisions; whatever the SDK delegates is
	// surfaced to the user verbatim. Mode-driven behavior is covered by
	// the §3.6 SDK-forwarding tests (live `setPermissionMode`).

	test('Test 7 — pending_confirmation signal carries the correct shape', async () => {
		const { ctx, canUseTool, sessionUri } = await materialize();

		const signals: AgentSignal[] = [];
		disposables.add(ctx.agent.onDidSessionProgress(s => signals.push(s)));

		const promise = canUseTool('Read', { file_path: '/tmp/foo.txt' }, makeOptions('tu_shape'));
		await tick();

		const captured = signals.find(s => s.kind === 'pending_confirmation');
		ctx.agent.respondToPermissionRequest('tu_shape', true);
		await promise;

		assert.deepStrictEqual(captured, {
			kind: 'pending_confirmation',
			chat: URI.parse(buildDefaultChatUri(sessionUri)),
			state: {
				status: ToolCallStatus.PendingConfirmation,
				toolCallId: 'tu_shape',
				toolName: 'Read',
				displayName: 'Read file',
				invocationMessage: { markdown: 'Reading [foo.txt](file:///tmp/foo.txt)' },
				toolInput: '{\n  "file_path": "/tmp/foo.txt"\n}',
				confirmationTitle: 'Read file?',
			},
			permissionKind: 'read',
			permissionPath: '/tmp/foo.txt',
		});
	});

	test('Test 8 — synchronous auto-respond inside pending_confirmation listener resolves canUseTool', async () => {
		// Regression: the `agentSideEffects` auto-approval path responds
		// synchronously inside `onDidSessionProgress.fire(...)`. If the
		// permission deferred is registered AFTER the fire, that response
		// hits an empty pending map and the SDK's `canUseTool` deadlocks.
		// Mirror the synchronous-respond pattern here and assert the
		// canUseTool promise resolves with `allow`.
		const { ctx, canUseTool } = await materialize();

		disposables.add(ctx.agent.onDidSessionProgress(s => {
			if (s.kind === 'pending_confirmation') {
				ctx.agent.respondToPermissionRequest(s.state.toolCallId, true);
			}
		}));

		const result = await canUseTool('Read', { file_path: '/tmp/race.txt' }, makeOptions('tu_race'));
		assert.deepStrictEqual(result, { behavior: 'allow', updatedInput: { file_path: '/tmp/race.txt' } });
	});

	test('SDK abort signal unparks a pending canUseTool with deny instead of waiting on the user', async () => {
		// The SDK can cancel an in-flight `canUseTool` request mid-flight
		// (subprocess teardown, upstream abort). When that happens, a
		// host parked on `requestPermission` would otherwise wait for a
		// user answer that will never come, leaving an orphaned pending
		// entry. Asserts the abort listener resolves the parked promise
		// with `deny` and clears the entry.
		const { ctx, canUseTool, sessionUri } = await materialize();

		const session = ctx.agent['_sessions'].get(AgentSession.id(sessionUri))?.defaultChat;
		assert.ok(session, 'session is materialized');

		const ac = new AbortController();
		const options: Parameters<NonNullable<Options['canUseTool']>>[2] = {
			signal: ac.signal,
			toolUseID: 'tu_aborted',
		};

		const promise = canUseTool('Read', { file_path: '/tmp/x' }, options);
		await tick();

		ac.abort();
		const result = await promise;

		assert.deepStrictEqual(result, { behavior: 'deny', message: 'User declined' });
		// The entry must be cleared so a late `respondToPermissionRequest`
		// is a no-op on the session and does not double-resolve.
		assert.strictEqual(session.respondToPermissionRequest('tu_aborted', true), false);
	});

	test('SDK abort signal already aborted on entry returns deny without parking', async () => {
		const { canUseTool } = await materialize();

		const ac = new AbortController();
		ac.abort();
		const result = await canUseTool('Read', { file_path: '/tmp/y' }, {
			signal: ac.signal,
			toolUseID: 'tu_pre_aborted',
		});

		assert.deepStrictEqual(result, { behavior: 'deny', message: 'SDK aborted the tool request' });
	});

	test('respondToPermissionRequest unknown id is silent', () => {
		const ctx = createTestContext(disposables);
		// Should not throw despite no matching session.
		ctx.agent.respondToPermissionRequest('nope', true);
	});

	test('Phase 12 step 5 — canUseTool inside a subagent context tags pending_confirmation with parentToolCallId and feeds the resolver cache', async () => {
		const { ctx, canUseTool, sessionUri } = await materialize();

		// Prime the session's registry with an inner-tool→parent edge.
		// (In production, the mapper does this on `content_block_start` of
		// an inner tool_use; here we inject it directly via the registry to
		// keep the test focused on the canUseTool bridge.)
		const session = ctx.agent.getSessionForTesting(sessionUri);
		assert.ok(session, 'session must be materialized');
		session.subagents.recordSpawn('toolu_parent');
		session.subagents.noteInnerTool('toolu_inner', 'toolu_parent');

		const signals: AgentSignal[] = [];
		const sub = ctx.agent.onDidSessionProgress(s => signals.push(s));
		disposables.add(sub);

		const promise = canUseTool('Read', { file_path: '/tmp/inner.txt' }, {
			...makeOptions('toolu_inner'),
			agentID: 'agent-hex-1',
		});
		ctx.agent.respondToPermissionRequest('toolu_inner', true);
		await promise;

		const pending = signals.find(s => s.kind === 'pending_confirmation');
		assert.ok(pending && pending.kind === 'pending_confirmation', 'pending_confirmation emitted');

		assert.deepStrictEqual({
			pendingParent: pending.parentToolCallId,
			parentSpawnAgentId: session.subagents.getSpawn('toolu_parent')?.agentId,
		}, {
			pendingParent: 'toolu_parent',
			parentSpawnAgentId: 'agent-hex-1',
		});
	});

	test('Phase 12 step 5 — AskUserQuestion + ExitPlanMode inside a subagent context tag their emitted signals with parentToolCallId', async () => {
		const { ctx, canUseTool, sessionUri } = await materialize();

		const session = ctx.agent.getSessionForTesting(sessionUri);
		assert.ok(session, 'session must be materialized');
		session.subagents.recordSpawn('toolu_parent_ask');
		session.subagents.recordSpawn('toolu_parent_plan');
		session.subagents.noteInnerTool('toolu_inner_ask', 'toolu_parent_ask');
		session.subagents.noteInnerTool('toolu_inner_plan', 'toolu_parent_plan');

		const signals: AgentSignal[] = [];
		const sub = ctx.agent.onDidSessionProgress(s => signals.push(s));
		disposables.add(sub);

		// AskUserQuestion — emits a ChatInputRequested action.
		const askPromise = canUseTool(
			'AskUserQuestion',
			{ questions: [{ question: 'q1', multiSelect: 'single-or-free-form', header: 'h', options: [{ label: 'a' }] }] },
			{ ...makeOptions('toolu_inner_ask'), agentID: 'agent-ask' },
		);
		ctx.agent.respondToUserInputRequest('toolu_inner_ask', ChatInputResponseKind.Cancel);
		await askPromise;

		// ExitPlanMode — emits a pending_confirmation.
		const planPromise = canUseTool(
			'ExitPlanMode',
			{ plan: '1. do thing' },
			{ ...makeOptions('toolu_inner_plan'), agentID: 'agent-plan' },
		);
		ctx.agent.respondToPermissionRequest('toolu_inner_plan', false);
		await planPromise;

		const askAction = signals.find(s => s.kind === 'action' && s.action.type === ActionType.ChatInputRequested);
		const planConfirm = signals.find(s => s.kind === 'pending_confirmation' && s.state.toolName === 'ExitPlanMode');

		assert.deepStrictEqual({
			askParent: askAction?.kind === 'action' ? askAction.parentToolCallId : null,
			planParent: planConfirm?.kind === 'pending_confirmation' ? planConfirm.parentToolCallId : null,
			askParentSpawnAgentId: session.subagents.getSpawn('toolu_parent_ask')?.agentId,
			planParentSpawnAgentId: session.subagents.getSpawn('toolu_parent_plan')?.agentId,
		}, {
			askParent: 'toolu_parent_ask',
			planParent: 'toolu_parent_plan',
			askParentSpawnAgentId: 'agent-ask',
			planParentSpawnAgentId: 'agent-plan',
		});
	});
});

suite('ClaudeAgent (Phase 7 §3.5 — INTERACTIVE_CLAUDE_TOOLS)', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Materialize a session and return its captured `canUseTool` closure
	 * plus the {@link ChatInputRequest} stream so the AskUserQuestion
	 * / ExitPlanMode tests can drive question rendering and answer
	 * dispatch directly without touching the SDK's `for await` loop.
	 */
	async function materialize(): Promise<{
		ctx: ITestContext;
		canUseTool: NonNullable<Options['canUseTool']>;
		inputRequests: ChatInputRequest[];
		sessionUri: URI;
	}> {
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const state = ctx.stateManager.createSession({
			resource: created.session.toString(),
			provider: 'claude',
			title: 't',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		// Seed `state.config` so `updateSessionConfig` writes propagate
		// (the `SessionConfigChanged` reducer no-ops when `state.config`
		// is undefined — reducers.ts:593). Production seeds this from
		// the AgentService schema-registration path; tests mirror.
		(state as { config?: SessionConfigState }).config = {
			schema: { type: 'object', properties: {} },
			values: {},
		};

		const inputRequests: ChatInputRequest[] = [];
		disposables.add(ctx.agent.onDidSessionProgress(s => {
			if (s.kind === 'action' && s.action.type === ActionType.ChatInputRequested) {
				inputRequests.push(s.action.request);
			}
		}));

		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');
		const canUseTool = ctx.sdk.capturedStartupOptions[0]?.canUseTool;
		assert.ok(canUseTool, 'canUseTool callback was wired into Options');
		return { ctx, canUseTool, inputRequests, sessionUri: created.session };
	}

	test('Test 12 — AskUserQuestion: surfaces ChatInputRequested, returns updatedInput keyed by question text', async () => {
		const { ctx, canUseTool, inputRequests } = await materialize();

		const promise = canUseTool('AskUserQuestion', {
			questions: [{
				header: 'q1',
				question: 'Pick one?',
				options: [{ label: 'Apple' }, { label: 'Banana' }],
			}],
		}, { signal: new AbortController().signal, toolUseID: 'tu_ask' });
		await tick();

		const inputRequest = inputRequests.at(-1)!;
		ctx.agent.respondToUserInputRequest('tu_ask', ChatInputResponseKind.Accept, {
			q1: {
				state: ChatInputAnswerState.Submitted,
				value: { kind: ChatInputAnswerValueKind.Selected, value: 'Apple' },
			},
		});
		const result = await promise;

		assert.deepStrictEqual({
			requestId: inputRequest.id,
			questions: inputRequest.questions?.map(q => ({ id: q.id, kind: q.kind, message: q.message } as const)),
			result,
		}, {
			requestId: 'tu_ask',
			questions: [{ id: 'q1', kind: 'single-select', message: 'Pick one?' }],
			result: {
				behavior: 'allow',
				updatedInput: {
					questions: [{
						header: 'q1',
						question: 'Pick one?',
						options: [{ label: 'Apple' }, { label: 'Banana' }],
					}],
					answers: { 'Pick one?': 'Apple' },
				},
			},
		});
	});

	test('Test 13 — AskUserQuestion: cancel returns deny with production wording', async () => {
		const { ctx, canUseTool } = await materialize();

		const promise = canUseTool('AskUserQuestion', {
			questions: [{ header: 'q1', question: 'Pick one?', options: [{ label: 'Apple' }] }],
		}, { signal: new AbortController().signal, toolUseID: 'tu_ask_cancel' });
		await tick();

		ctx.agent.respondToUserInputRequest('tu_ask_cancel', ChatInputResponseKind.Cancel);
		const result = await promise;

		assert.deepStrictEqual(result, { behavior: 'deny', message: 'The user cancelled the question' });
	});

	test('Test 12b — ExitPlanMode: Approve persists permissionMode=acceptEdits to session config and returns allow without a live SDK call', async () => {
		// Calling `Query.setPermissionMode` synchronously inside
		// `canUseTool` collides with the SDK's control channel (which
		// is mid-flight delivering the canUseTool request) and leaves
		// the turn unable to resume. Mirror production: write the new
		// mode to `IAgentConfigurationService` and let the next
		// `sendMessage` forward it via `entry.setPermissionMode(...)`
		// between turns.
		const { ctx, canUseTool, sessionUri } = await materialize();

		const signals: AgentSignal[] = [];
		disposables.add(ctx.agent.onDidSessionProgress(s => signals.push(s)));

		const promise = canUseTool('ExitPlanMode', { plan: '1. Read foo\n2. Edit foo' }, {
			signal: new AbortController().signal,
			toolUseID: 'tu_plan_ok',
		});
		await tick();

		const captured = signals.find(s => s.kind === 'pending_confirmation');
		ctx.agent.respondToPermissionRequest('tu_plan_ok', true);
		const result = await promise;

		const fakeQuery = ctx.sdk.warmQueries.at(-1)?.produced;
		const persistedMode = ctx.configService.getSessionConfigValues(sessionUri.toString())?.['permissionMode'];
		assert.deepStrictEqual({
			signal: captured,
			result,
			recordedModes: fakeQuery?.recordedPermissionModes ?? [],
			persistedMode,
		}, {
			signal: {
				kind: 'pending_confirmation',
				chat: URI.parse(buildDefaultChatUri(sessionUri)),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tu_plan_ok',
					toolName: 'ExitPlanMode',
					displayName: 'Ready to code?',
					invocationMessage: { markdown: '1. Read foo\n2. Edit foo' },
					toolInput: '{"plan":"1. Read foo\\n2. Edit foo"}',
					confirmationTitle: 'Ready to code?',
					options: [
						{ id: 'approve', label: 'Approve', kind: 'approve' },
						{ id: 'deny', label: 'Deny', kind: 'deny' },
					],
				},
				permissionKind: 'custom-tool',
			},
			result: { behavior: 'allow', updatedInput: { plan: '1. Read foo\n2. Edit foo' } },
			recordedModes: [],
			persistedMode: 'acceptEdits',
		});
	});

	test('Test 13b — ExitPlanMode: Deny returns deny with production wording, no mode flip', async () => {
		const { ctx, canUseTool } = await materialize();

		const promise = canUseTool('ExitPlanMode', { plan: 'just plan' }, {
			signal: new AbortController().signal,
			toolUseID: 'tu_plan_deny',
		});
		await tick();

		ctx.agent.respondToPermissionRequest('tu_plan_deny', false);
		const result = await promise;

		const fakeQuery = ctx.sdk.warmQueries.at(-1)?.produced;
		assert.deepStrictEqual({
			result,
			recordedModes: fakeQuery?.recordedPermissionModes ?? [],
		}, {
			result: { behavior: 'deny', message: 'The user declined the plan, maybe ask why?' },
			recordedModes: [],
		});
	});

	test('Test 14 — ExitPlanMode: synchronous respond inside pending_confirmation listener resolves canUseTool', async () => {
		// Same race as Test 8 but for the ExitPlanMode permission path
		// (`_handleExitPlanMode`): the deferred must be registered
		// before the `pending_confirmation` event is fired, otherwise
		// a synchronous responder hits an empty pending map and the
		// SDK's `canUseTool` deadlocks.
		const { ctx, canUseTool } = await materialize();

		disposables.add(ctx.agent.onDidSessionProgress(s => {
			if (s.kind === 'pending_confirmation' && s.state.toolName === 'ExitPlanMode') {
				ctx.agent.respondToPermissionRequest(s.state.toolCallId, true);
			}
		}));

		const result = await canUseTool('ExitPlanMode', { plan: 'sync test' }, {
			signal: new AbortController().signal,
			toolUseID: 'tu_plan_race',
		});
		assert.deepStrictEqual(result, { behavior: 'allow', updatedInput: { plan: 'sync test' } });
	});

	test('respondToUserInputRequest unknown id is silent', () => {
		const ctx = createTestContext(disposables);
		ctx.agent.respondToUserInputRequest('nope', ChatInputResponseKind.Accept);
	});
});

suite('ClaudeAgent (Phase 7 §3.6 / §3.8 — permissionMode propagation)', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('Test 16 — live permissionMode update forwards via Query.setPermissionMode on the next sendMessage', async () => {
		// Plan §3.6 / §3.8: a `SessionConfigChanged` action arriving
		// between turns must reach the SDK before the next user
		// message yields. The agent re-reads the live state in
		// `sendMessage` and forwards via `Query.setPermissionMode`
		// — skipping the just-materialized first turn (already seeded
		// via `Options.permissionMode`).
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		// Seed state.config so `updateSessionConfig` (which dispatches
		// SessionConfigChanged) is honoured by the reducer.
		const state = ctx.stateManager.createSession({
			resource: created.session.toString(),
			provider: 'claude',
			title: 't',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		(state as { config?: SessionConfigState }).config = {
			schema: { type: 'object', properties: {} },
			values: { permissionMode: 'default' },
		};

		// Park the FakeQuery iterator after turn 1's result so the second
		// `sendMessage` doesn't race past idx 2 before the prompt has
		// been pushed (mirrors the gate pattern in the multi-turn
		// reuse test at L1188).
		const advance = new DeferredPromise<void>();
		ctx.sdk.queryAdvance = async (idx: number) => {
			if (idx === 2) {
				await advance.p;
			}
		};
		ctx.sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
			makeResultSuccess(sessionId),
		];

		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');
		ctx.configService.updateSessionConfig(created.session.toString(), { permissionMode: 'acceptEdits' });
		const p2 = ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi-2', undefined, undefined, 'turn-2');
		// Drain microtasks so `await entry.setPermissionMode('acceptEdits')`
		// resolves and the second prompt lands in the in-flight queue before
		// the iterator yields its `result(idx=2)` (see the multi-turn reuse
		// test above for the same gate-pattern explanation).
		await tick();
		advance.complete();
		await p2;

		const fakeQuery = ctx.sdk.warmQueries.at(-1)?.produced;
		assert.deepStrictEqual({
			startupPermissionMode: ctx.sdk.capturedStartupOptions[0]?.permissionMode,
			recordedModes: fakeQuery?.recordedPermissionModes ?? [],
		}, {
			startupPermissionMode: 'default',
			recordedModes: ['acceptEdits'],
		});
	});

	test('Test 16b — live state seeded BEFORE first sendMessage flows into Options.permissionMode at materialize', async () => {
		// Plan §3.6: `Options.permissionMode` reads live state first,
		// falling back to `provisional.config` only when state has not
		// been seeded. Production AgentService seeds state.config on
		// createSession, so the live read wins there. This test
		// exercises that path.
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		const state = ctx.stateManager.createSession({
			resource: created.session.toString(),
			provider: 'claude',
			title: 't',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		(state as { config?: SessionConfigState }).config = {
			schema: { type: 'object', properties: {} },
			values: { permissionMode: 'plan' },
		};

		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		const fakeQuery = ctx.sdk.warmQueries.at(-1)?.produced;
		assert.deepStrictEqual({
			startupPermissionMode: ctx.sdk.capturedStartupOptions[0]?.permissionMode,
			recordedModes: fakeQuery?.recordedPermissionModes ?? [],
		}, {
			startupPermissionMode: 'plan',
			recordedModes: [],
		});
	});
});

suite('ClaudeAgent (Phase 10.6 — MCP elicitation translation)', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Materialize a session and return its captured `onElicitation` closure plus
	 * the {@link ChatInputRequest} stream, so the elicitation tests can drive an
	 * `elicit/create` round-trip directly without the SDK's `for await` loop.
	 */
	async function materialize(): Promise<{
		ctx: ITestContext;
		onElicitation: NonNullable<Options['onElicitation']>;
		inputRequests: ChatInputRequest[];
	}> {
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const inputRequests: ChatInputRequest[] = [];
		disposables.add(ctx.agent.onDidSessionProgress(s => {
			if (s.kind === 'action' && s.action.type === ActionType.ChatInputRequested) {
				inputRequests.push(s.action.request);
			}
		}));

		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');
		const onElicitation = ctx.sdk.capturedStartupOptions[0]?.onElicitation;
		assert.ok(onElicitation, 'onElicitation callback was wired into Options');
		return { ctx, onElicitation, inputRequests };
	}

	test('form-mode elicitation surfaces ChatInputRequested and returns accepted content', async () => {
		const { ctx, onElicitation, inputRequests } = await materialize();

		const promise = onElicitation(
			{ serverName: 'test-mcp', message: 'Pick a side', mode: 'form', requestedSchema: { type: 'object', properties: { side: { type: 'string' } } } },
			{ signal: new AbortController().signal },
		);
		await tick();

		const inputRequest = inputRequests.at(-1)!;
		ctx.agent.respondToUserInputRequest(inputRequest.id, ChatInputResponseKind.Accept, {
			side: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'left' } },
		});

		assert.deepStrictEqual({
			message: inputRequest.message,
			questions: inputRequest.questions?.map(q => ({ id: q.id, kind: q.kind } as const)),
			result: await promise,
		}, {
			message: 'Pick a side',
			questions: [{ id: 'side', kind: 'text' }],
			result: { action: 'accept', content: { side: 'left' } },
		});
	});

	test('declined form-mode elicitation returns a decline result', async () => {
		const { ctx, onElicitation, inputRequests } = await materialize();

		const promise = onElicitation(
			{ serverName: 'm', message: 'q', mode: 'form', requestedSchema: { type: 'object', properties: { side: { type: 'string' } } } },
			{ signal: new AbortController().signal },
		);
		await tick();
		ctx.agent.respondToUserInputRequest(inputRequests.at(-1)!.id, ChatInputResponseKind.Decline);

		assert.deepStrictEqual(await promise, { action: 'decline' });
	});

	test('aborting the SDK signal cancels a parked elicitation', async () => {
		const { onElicitation, inputRequests } = await materialize();

		const controller = new AbortController();
		const promise = onElicitation(
			{ serverName: 'm', message: 'q', mode: 'form', requestedSchema: { type: 'object', properties: { side: { type: 'string' } } } },
			{ signal: controller.signal },
		);
		await tick();
		assert.ok(inputRequests.at(-1), 'the elicitation parked as a ChatInputRequested action');
		controller.abort();

		assert.deepStrictEqual(await promise, { action: 'cancel' });
	});

	test('url-mode elicitation surfaces the url with no questions and accepts with no content', async () => {
		const { ctx, onElicitation, inputRequests } = await materialize();

		const promise = onElicitation(
			{ serverName: 'm', message: 'Authorize', mode: 'url', url: 'https://example.com/auth' },
			{ signal: new AbortController().signal },
		);
		await tick();

		const inputRequest = inputRequests.at(-1)!;
		ctx.agent.respondToUserInputRequest(inputRequest.id, ChatInputResponseKind.Accept);

		assert.deepStrictEqual({
			message: inputRequest.message,
			url: inputRequest.url,
			questions: inputRequest.questions,
			result: await promise,
		}, {
			message: 'Authorize',
			url: 'https://example.com/auth',
			questions: undefined,
			result: { action: 'accept' },
		});
	});

	test('a pre-aborted signal cancels without ever parking', async () => {
		const { onElicitation, inputRequests } = await materialize();

		const controller = new AbortController();
		controller.abort();
		const result = await onElicitation(
			{ serverName: 'm', message: 'q', mode: 'form', requestedSchema: { type: 'object', properties: { side: { type: 'string' } } } },
			{ signal: controller.signal },
		);

		assert.deepStrictEqual({ result, parked: inputRequests.length }, { result: { action: 'cancel' }, parked: 0 });
	});

	test('a url-mode request with no url cancels without surfacing a prompt', async () => {
		const { onElicitation, inputRequests } = await materialize();

		const result = await onElicitation(
			{ serverName: 'm', message: 'Authorize', mode: 'url' },
			{ signal: new AbortController().signal },
		);

		assert.deepStrictEqual({ result, parked: inputRequests.length }, { result: { action: 'cancel' }, parked: 0 });
	});

	test('a form with no representable fields cancels without surfacing a prompt', async () => {
		const { onElicitation, inputRequests } = await materialize();

		const result = await onElicitation(
			{ serverName: 'm', message: 'q', mode: 'form', requestedSchema: { type: 'object', properties: {} } },
			{ signal: new AbortController().signal },
		);

		assert.deepStrictEqual({ result, parked: inputRequests.length }, { result: { action: 'cancel' }, parked: 0 });
	});
});

suite('ClaudeAgent (Phase 8 — file edit tracking via SDK message stream)', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function materialize(): Promise<{ ctx: ITestContext; sessionId: string; sessionUri: URI }> {
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');
		return { ctx, sessionId, sessionUri: created.session };
	}

	test('Options carries enableFileCheckpointing on and no SDK hooks (file-edit tracking is observed off the message stream, not via user-bypassable hooks)', async () => {
		// Phase 8 refactor. Pins the Options shape that
		// `_materializeProvisional` ships to the SDK: file checkpointing
		// must be on (a startup option, not user-bypassable), and
		// `Options.hooks` must be absent — file-edit tracking is wired
		// through `ClaudeAgentSession._observeAssistantMessage` /
		// `_observeUserMessage` in the message-pump loop. Hooks were
		// rejected because they can be disabled via the user's settings,
		// which would silently break the diff/checkpoint UX.
		const { ctx } = await materialize();
		const opts = ctx.sdk.capturedStartupOptions[0];
		assert.ok(opts, 'Options captured');

		assert.deepStrictEqual({
			enableFileCheckpointing: opts.enableFileCheckpointing,
			hooks: opts.hooks,
		}, {
			enableFileCheckpointing: true,
			hooks: undefined,
		});
	});

	test('Options carries forwardSubagentText: true so live subagent text + thinking flow through (Phase 12 step 1)', async () => {
		// Without this, the SDK emits only tool_use / tool_result blocks
		// from subagent contexts; text and thinking are dropped. Replay
		// via `getSubagentMessages` would then return the full transcript
		// while the live child session was content-empty — a silent
		// live-vs-replay asymmetry. The plan locks this on at startup.
		const { ctx } = await materialize();
		const opts = ctx.sdk.capturedStartupOptions[0];
		assert.ok(opts, 'Options captured');
		assert.strictEqual(opts.forwardSubagentText, true);
	});
});

// #region Phase 9 — abort + steering + changeModel + crash recovery

suite('ClaudeAgent (Phase 9 — runtime mutation surface)', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Materialize a session, complete one turn, and leave the SDK
	 * consumer loop parked at the next {@link FakeQuery.next} via
	 * {@link FakeClaudeAgentSdkService.queryAdvance}. Stage the SDK
	 * transcript as `[system_init, result, ...rest]` so the loop yields
	 * one full turn and then parks at index 2 for the test to release.
	 *
	 * Returns the parked-iterator gate (`advance`) so the test can let
	 * the second turn flow through after queuing whatever Phase 9 mutation
	 * it's exercising.
	 */
	async function materialize(opts?: { extraMessages?: SDKMessage[]; logService?: ILogService }): Promise<{
		ctx: ITestContext;
		sessionUri: URI;
		sessionId: string;
		warm: FakeWarmQuery;
		query: FakeQuery;
		advance: DeferredPromise<void>;
	}> {
		const ctx = createTestContext(disposables, { logService: opts?.logService });
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/workspace'), model: { id: 'claude-opus-4.6' } });
		const sessionId = AgentSession.id(created.session);
		const advance = new DeferredPromise<void>();
		ctx.sdk.queryAdvance = async (i: number) => { if (i === 2) { await advance.p; } };
		ctx.sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
			...(opts?.extraMessages ?? [makeResultSuccess(sessionId)]),
		];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');
		const warm = ctx.sdk.warmQueries[0];
		const query = warm.produced!;
		return { ctx, sessionUri: created.session, sessionId, warm, query, advance };
	}

	test('changeModel on a provisional session mutates the pending model bag (no SDK contact)', async () => {
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		const created = await ctx.agent.createSession({
			workingDirectory: URI.file('/workspace'),
			model: { id: 'claude-opus-4.6' },
		});

		await ctx.agent.chats.changeModel(defaultChatUri(created.session), { id: 'claude-sonnet-4.6', config: { thinkingLevel: 'medium' } });

		assert.strictEqual(ctx.sdk.startupCallCount, 0);
		const sid = AgentSession.id(created.session);
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');
		const opts = ctx.sdk.capturedStartupOptions[0];
		assert.deepStrictEqual({ model: opts.model, effort: opts.effort }, { model: 'claude-sonnet-4-6', effort: 'medium' });
	});

	test('changeModel on a materialized session queues a model+effort bundle that drains at the next yield boundary', async () => {
		const { ctx, sessionUri, query, advance } = await materialize();

		await ctx.agent.chats.changeModel(defaultChatUri(sessionUri), { id: 'claude-sonnet-4.6', config: { thinkingLevel: 'high' } });
		const p2 = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'next', undefined, undefined, 'turn-2');
		await tick();
		advance.complete();
		await p2;

		assert.deepStrictEqual({
			models: query.recordedModels,
			efforts: query.recordedFlagSettings.map(s => s.effortLevel),
		}, {
			models: ['claude-sonnet-4-6'],
			efforts: ['high'],
		});
	});

	test('changeModel with `max` effort passes `max` through on the runtime path', async () => {
		const { ctx, sessionUri, query, advance } = await materialize();

		await ctx.agent.chats.changeModel(defaultChatUri(sessionUri), { id: 'claude-opus-4.6', config: { thinkingLevel: 'max' } });
		const p2 = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'next', undefined, undefined, 'turn-2');
		await tick();
		advance.complete();
		await p2;

		assert.deepStrictEqual(query.recordedFlagSettings.map(s => s.effortLevel), ['max']);
	});

	test('changeModel with same id and unchanged effort skips the SDK setters', async () => {
		const { ctx, sessionUri, query, advance } = await materialize();

		await ctx.agent.chats.changeModel(defaultChatUri(sessionUri), { id: 'claude-opus-4.6' });
		const p2 = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'next', undefined, undefined, 'turn-2');
		await tick();
		advance.complete();
		await p2;

		assert.deepStrictEqual({
			models: query.recordedModels,
			efforts: query.recordedFlagSettings,
		}, { models: [], efforts: [] });
	});

	test('setPendingMessages with steering injects a `priority: now` SDK user message into the iterable', async () => {
		const { ctx, sessionUri, query, advance } = await materialize();
		const sid = AgentSession.id(sessionUri);

		// Start a long turn that parks at the gate so steering has
		// something to steer into.
		const longSend = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'long task', undefined, undefined, 'turn-2');
		await tick();

		ctx.agent.setPendingMessages!(sessionUri, { id: 'pending-1', message: { text: 'switch topic', origin: { kind: MessageKind.User } } }, []);
		await tick();
		await tick();

		const steered = query.drainedPrompts.find(p => p.priority === 'now');
		assert.ok(steered, `expected steering with priority:'now' in drained prompts, got priorities=${query.drainedPrompts.map(p => p.priority).join(',')}`);
		assert.strictEqual(steered.message.role, 'user');

		// Cleanup: stage the steering echo + a result so the long send completes.
		ctx.sdk.nextQueryMessages.push(
			{ type: 'user', message: { role: 'user', content: 'switch topic' }, session_id: sid, parent_tool_use_id: null, uuid: steered.uuid },
			makeResultSuccess(sid),
		);
		advance.complete();
		await longSend;
	});

	test('setPendingMessages with empty steering and non-empty queued is a no-op', async () => {
		const { ctx, sessionUri, query, advance } = await materialize();
		const before = query.drainedPrompts.length;
		ctx.agent.setPendingMessages!(sessionUri, undefined, [{ id: 'q1', message: { text: 'queued', origin: { kind: MessageKind.User } } }]);
		await tick();
		assert.strictEqual(query.drainedPrompts.length, before);
		advance.complete();
	});

	test('steering_consumed fires when the iterable hands the steering message to the SDK', async () => {
		const { ctx, sessionUri, advance } = await materialize();
		const sid = AgentSession.id(sessionUri);

		const signals: AgentSignal[] = [];
		disposables.add(ctx.agent.onDidSessionProgress(s => signals.push(s)));

		const longSend = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'long task', undefined, undefined, 'turn-2');
		await tick();

		ctx.agent.setPendingMessages!(sessionUri, { id: 'pending-9', message: { text: 'steer', origin: { kind: MessageKind.User } } }, []);
		// Microtask cycles let the FakeQuery's background drain pull the
		// steering entry off `_toYield`; that drain is when our session
		// fires `steering_consumed` (SDK ack semantics — mirrors Copilot's
		// `sendSteering` firing right after `send({mode:'immediate'})`).
		// Firing later (on the steering's result) would let the user
		// reorder/delete the still-pending entry; the SDK has no hook for
		// that, so we ack as soon as the SDK takes ownership.
		await tick();
		await tick();

		const consumed = signals.find(s => s.kind === 'steering_consumed');
		assert.ok(consumed, `expected steering_consumed after iterable yield, got kinds: ${signals.map(s => s.kind).join(', ')}`);
		assert.deepStrictEqual({ kind: consumed.kind, id: (consumed as { id: string }).id }, { kind: 'steering_consumed', id: 'pending-9' });

		// Cleanup so longSend resolves.
		ctx.sdk.nextQueryMessages.push(makeResultSuccess(sid));
		advance.complete();
		await longSend;
	});


	test('abortSession on a materialized session cancels the in-flight turn and leaves the session reusable', async () => {
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/workspace'), model: { id: 'claude-opus-4.6' } });
		const sid = AgentSession.id(created.session);

		// Block the FakeQuery at index 0 so the first turn never completes.
		const stall = new DeferredPromise<void>();
		ctx.sdk.queryAdvance = async (i) => { if (i === 0) { await stall.p; } };
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];

		const inFlight = ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');
		await tick();

		await ctx.agent.chats.abort(defaultChatUri(created.session));
		await assert.rejects(inFlight, (err: unknown) => isCancellationError(err));

		// Unblock the (now-aborted) iterator so it terminates cleanly.
		ctx.sdk.queryAdvance = undefined;
		stall.complete();
		await tick();

		// Next sendMessage rebuilds via resume mode.
		const startupBefore = ctx.sdk.startupCallCount;
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'next', undefined, undefined, 'turn-2');

		assert.strictEqual(ctx.sdk.startupCallCount, startupBefore + 1, 'rebind called startup again');
		const resumeOpts = ctx.sdk.capturedStartupOptions[ctx.sdk.startupCallCount - 1];
		assert.deepStrictEqual({
			resume: resumeOpts.resume,
			sessionId: resumeOpts.sessionId,
		}, { resume: sid, sessionId: undefined });
	});

	test('abortSession denies any parked permission requests so the SDK canUseTool callback unwinds with deny instead of leaving stale UI behind', async () => {
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/workspace'), model: { id: 'claude-opus-4.6' } });
		const sid = AgentSession.id(created.session);

		// Materialize the session by driving one full turn so canUseTool is wired into Options.
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');

		const canUseTool = ctx.sdk.capturedStartupOptions[0]?.canUseTool;
		assert.ok(canUseTool, 'canUseTool was wired into Options');

		const permissionPromise = canUseTool('Read', { file_path: '/tmp/foo.txt' }, {
			signal: new AbortController().signal,
			toolUseID: 'tu_pending',
		});
		await tick();

		await ctx.agent.chats.abort(defaultChatUri(created.session));
		const result = await permissionPromise;
		assert.deepStrictEqual(result, { behavior: 'deny', message: 'User declined' });
	});

	test('subprocess crash mid-stream rejects the in-flight turn and the next sendMessage rebinds via resume', async () => {
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/workspace'), model: { id: 'claude-opus-4.6' } });
		const sid = AgentSession.id(created.session);

		// First turn: yield system_init then throw mid-stream (subprocess crash).
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid)];
		ctx.sdk.queryAdvance = async (i) => { if (i === 1) { throw new Error('subprocess crashed'); } };

		await assert.rejects(
			ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1'),
			(err: Error) => err.message.includes('subprocess crashed'),
		);

		// Second turn rebuilds via resume.
		ctx.sdk.queryAdvance = undefined;
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
		const startupBefore = ctx.sdk.startupCallCount;
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'recover', undefined, undefined, 'turn-2');
		assert.strictEqual(ctx.sdk.startupCallCount, startupBefore + 1, 'crash recovery called startup again');
		const resumeOpts = ctx.sdk.capturedStartupOptions[ctx.sdk.startupCallCount - 1];
		assert.strictEqual(resumeOpts.resume, sid);
	});

	test('rebuild carries bijective state (model + effort) into the new Query via Options', async () => {
		const { ctx, sessionUri, sessionId, query: firstQuery, advance } = await materialize();

		// Hot-swap model + effort on the live query so the bijective
		// cache picks up the new values.
		await ctx.agent.chats.changeModel(defaultChatUri(sessionUri), { id: 'claude-sonnet-4.6', config: { thinkingLevel: 'high' } });
		const p2 = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'apply', undefined, undefined, 'turn-2');
		await tick();
		advance.complete();
		await p2;
		assert.deepStrictEqual({ models: firstQuery.recordedModels, efforts: firstQuery.recordedFlagSettings.map(s => s.effortLevel) }, { models: ['claude-sonnet-4-6'], efforts: ['high'] });

		// Now abort and resend; the rebuilt query MUST carry the same model +
		// effort — under C9 delivered via the rebuild's `Options` (baked from the
		// provisional model), NOT a runtime `setModel`/`applyFlagSettings` replay.
		await ctx.agent.chats.abort(defaultChatUri(sessionUri));
		ctx.sdk.queryAdvance = undefined;
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'after-abort', undefined, undefined, 'turn-3');

		const rebuildOpts = ctx.sdk.capturedStartupOptions[1];
		assert.deepStrictEqual({
			model: rebuildOpts.model,
			effort: rebuildOpts.effort,
		}, { model: 'claude-sonnet-4-6', effort: 'high' });
	});

	// C9 adversarial edge cases — races the immutable-pipeline / session-orchestrated
	// rebuild opens up that a happy-path E2E can't hold open. Driven deterministically
	// against the real ClaudeAgentSession + ClaudeSdkPipeline via the controllable SDK
	// fake (park a turn / park inside startup, then fire a concurrent abort).

	test('double abort (two aborts back-to-back) is idempotent, rejects the in-flight turn once, and the session still rebuilds on the next send', async () => {
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/workspace'), model: { id: 'claude-opus-4.6' } });
		const sid = AgentSession.id(created.session);

		// Park the first turn so it is genuinely in flight when we abort.
		const stall = new DeferredPromise<void>();
		ctx.sdk.queryAdvance = async (i) => { if (i === 0) { await stall.p; } };
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
		const inFlight = ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');
		await tick();

		// Abort twice — the second must be a no-op (the shared-controller signal is
		// already aborted), NOT a throw or a double-settle of the same deferred.
		await ctx.agent.chats.abort(defaultChatUri(created.session));
		await ctx.agent.chats.abort(defaultChatUri(created.session));
		await assert.rejects(inFlight, (err: unknown) => isCancellationError(err));

		// The session survives the double abort: the next send recover-rebuilds cleanly.
		ctx.sdk.queryAdvance = undefined;
		stall.complete();
		await tick();
		const startupBefore = ctx.sdk.startupCallCount;
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'again', undefined, undefined, 'turn-2');
		assert.strictEqual(ctx.sdk.startupCallCount, startupBefore + 1, 'double-abort still allows exactly one clean rebuild');
	});

	test('abort landing inside a rebuild\'s startup() await is caught by the post-await gate: the half-built WarmQuery is disposed and the send rejects', async () => {
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/workspace'), model: { id: 'claude-opus-4.6' } });
		const sid = AgentSession.id(created.session);

		// Turn 1 materializes (startup #1).
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1');
		// Kill the pipeline so the next send must rebuild.
		await ctx.agent.chats.abort(defaultChatUri(created.session));
		await tick();

		// Park INSIDE the rebuild's startup() (startup #2), then abort mid-await. This
		// exercises `_installPipeline`'s post-await gate on the rebuild path (not just
		// the materialize path): an abort that lands while the subprocess is spawning
		// must dispose the freshly-spawned WarmQuery and NOT install a dead pipeline.
		const inStartup = new DeferredPromise<void>();
		const releaseStartup = new DeferredPromise<void>();
		ctx.sdk.startupAdvance = async (callIndex) => {
			if (callIndex === 2) { inStartup.complete(); await releaseStartup.p; }
		};
		const warmsBeforeRebuild = ctx.sdk.warmQueries.length;
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
		const rebuildSend = ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'rebuild', undefined, undefined, 'turn-2');
		await inStartup.p;

		await ctx.agent.chats.abort(defaultChatUri(created.session));
		releaseStartup.complete();
		await assert.rejects(rebuildSend, (err: unknown) => isCancellationError(err));

		const rebuildWarm = ctx.sdk.warmQueries[warmsBeforeRebuild];
		assert.deepStrictEqual({
			spawnedRebuildWarm: !!rebuildWarm,
			rebuildWarmDisposed: rebuildWarm?.asyncDisposeCount,
			startups: ctx.sdk.startupCallCount,
		}, {
			spawnedRebuildWarm: true,
			rebuildWarmDisposed: 1,
			startups: 2,
		});
	});

	test('abort→resend churn: every retired WarmQuery is disposed (no leaked subprocess handle across repeated recover-rebuilds), one startup per cycle', async () => {
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/workspace'), model: { id: 'claude-opus-4.6' } });
		const sid = AgentSession.id(created.session);

		const CYCLES = 4;
		for (let n = 0; n < CYCLES; n++) {
			const stall = new DeferredPromise<void>();
			ctx.sdk.queryAdvance = async (i) => { if (i === 0) { await stall.p; } };
			ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
			const inFlight = ctx.agent.chats.sendMessage(defaultChatUri(created.session), `msg-${n}`, undefined, undefined, `turn-${n}`);
			await tick();
			await ctx.agent.chats.abort(defaultChatUri(created.session));
			await assert.rejects(inFlight, (err: unknown) => isCancellationError(err));
			ctx.sdk.queryAdvance = undefined;
			stall.complete();
			await tick();
		}

		// One SDK startup per cycle (materialize on cycle 0, recover-rebuild thereafter),
		// and every WarmQuery except the still-live last one was async-disposed at least
		// once — the deterministic analog of "no orphan subprocess accumulates".
		const retired = ctx.sdk.warmQueries.slice(0, -1);
		assert.deepStrictEqual({
			startups: ctx.sdk.startupCallCount,
			warmCount: ctx.sdk.warmQueries.length,
			leakedRetiredWarms: retired.filter(w => w.asyncDisposeCount === 0).length,
		}, {
			startups: CYCLES,
			warmCount: CYCLES,
			leakedRetiredWarms: 0,
		});
	});


	test('intermediate result during steering does NOT complete the in-flight sendMessage or fire ChatTurnComplete', async () => {
		// CONTEXT.md M10: when the SDK preempts via `'now'`-priority, it
		// emits one `result` message per turn it ran (the aborted
		// original + the steering reply). Protocol-wise this is ONE Turn,
		// so the agent must suppress the intermediate result: do not
		// settle the original sendMessage's deferred, do not fire
		// ChatTurnComplete. The FINAL result (when no steering is
		// outstanding) closes the protocol Turn.
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/workspace'), model: { id: 'claude-opus-4.6' } });
		const sid = AgentSession.id(created.session);

		// Stage: system_init, then PARK at index 1 so the original turn
		// hasn't yet streamed its result. The test injects steering, then
		// releases the gate so the SDK emits result#1 (intermediate),
		// echoes the steering, then emits result#2 (final).
		const advance = new DeferredPromise<void>();
		ctx.sdk.queryAdvance = async (i) => { if (i === 1) { await advance.p; } };
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid)];

		const inFlight = ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'long task', undefined, undefined, 'turn-1');
		await tick();

		// Subscribe BEFORE injecting steering so we capture the
		// `steering_consumed` signal that fires the moment the iterable
		// hands the message to the SDK.
		const signals: AgentSignal[] = [];
		disposables.add(ctx.agent.onDidSessionProgress(s => signals.push(s)));

		// Inject steering and capture its uuid via the iterable's drain.
		ctx.agent.setPendingMessages!(created.session, { id: 'pending-steer', message: { text: 'moo', origin: { kind: MessageKind.User } } }, []);
		await tick();
		await tick();
		const query = ctx.sdk.warmQueries[0].produced!;
		const steeringPrompt = query.drainedPrompts.find(p => p.priority === 'now');
		assert.ok(steeringPrompt && steeringPrompt.uuid, 'steering uuid captured');

		// Stage the rest: result#1 (intermediate; for the aborted turn),
		// then result#2 (final). The SDK's user-echo for steering is no
		// longer used to fire `steering_consumed` (we fire on iterable
		// yield); staging it would still work but isn't required.
		ctx.sdk.nextQueryMessages.push(
			makeResultSuccess(sid),
			makeResultSuccess(sid),
		);

		advance.complete();
		await inFlight;

		// Exactly one ChatTurnComplete fires (the final result), and
		// steering_consumed fires for the echo.
		const turnCompletes = signals.filter(s => s.kind === 'action' && s.action.type === ActionType.ChatTurnComplete);
		const consumed = signals.filter(s => s.kind === 'steering_consumed');
		assert.deepStrictEqual({
			turnCompleteCount: turnCompletes.length,
			steeringConsumedCount: consumed.length,
			steeringConsumedId: consumed[0] && (consumed[0] as { id: string }).id,
		}, {
			turnCompleteCount: 1,
			steeringConsumedCount: 1,
			steeringConsumedId: 'pending-steer',
		});
	});

	test('intermediate result during steering does NOT settle the original sendMessage promise (regression for C1)', async () => {
		// Tightens the previous test: result#1 is consumed BEFORE result#2
		// is staged, so we can directly observe whether `inFlight`
		// resolved early. The PromptQueue must defer entry-deferred
		// completion until the turn fully drains.
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		const created = await ctx.agent.createSession({ workingDirectory: URI.file('/workspace'), model: { id: 'claude-opus-4.6' } });
		const sid = AgentSession.id(created.session);

		// Park BOTH advance gates so we can release results one at a time.
		const advance1 = new DeferredPromise<void>();
		const advance2 = new DeferredPromise<void>();
		ctx.sdk.queryAdvance = async (i) => {
			if (i === 1) { await advance1.p; }
			if (i === 2) { await advance2.p; }
		};
		ctx.sdk.nextQueryMessages = [
			makeSystemInitMessage(sid),
			makeResultSuccess(sid), // intermediate (unblocked by advance1)
			makeResultSuccess(sid), // final (unblocked by advance2)
		];

		const inFlight = ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'long task', undefined, undefined, 'turn-1');
		let inFlightResolved = false;
		void inFlight.then(() => { inFlightResolved = true; }, () => { inFlightResolved = true; });
		await tick();

		// Inject steering so the queue holds [original, steering] when
		// result#1 lands.
		ctx.agent.setPendingMessages!(created.session, { id: 'pending-c1', message: { text: 'steer', origin: { kind: MessageKind.User } } }, []);
		await tick();
		await tick();

		// Release result#1 only. After it's consumed, `inFlight` MUST
		// still be pending — the original entry's deferred should be
		// held back because steering is still in-flight.
		advance1.complete();
		await tick();
		await tick();
		assert.strictEqual(inFlightResolved, false, 'sendMessage resolved on intermediate result');

		// Release result#2 — now the turn is done and inFlight resolves.
		advance2.complete();
		await inFlight;
		assert.strictEqual(inFlightResolved, true);
	});
});

// #endregion

// #region Phase 13 — Session restoration

suite('ClaudeAgent (Phase 13 — getSessionMessages)', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function makeUserSessionMessage(uuid: string, text: string): SessionMessage {
		return {
			type: 'user',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			message: { role: 'user', content: [{ type: 'text', text }] },
		};
	}

	function makeAssistantSessionMessage(uuid: string, text: string): SessionMessage {
		return {
			type: 'assistant',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			message: { id: `msg_${uuid}`, role: 'assistant', content: [{ type: 'text', text }] },
		};
	}

	test('getSessionMessages returns mapped Turn[] from SDK transcript', async () => {
		const { agent, sdk } = createTestContext(disposables);
		const sessionId = 'phase13-1';
		sdk.sessionMessagesById.set(sessionId, [
			makeUserSessionMessage('u1', 'hi'),
			makeAssistantSessionMessage('a1', 'hello'),
		]);

		const turns = await agent.getSessionMessages(AgentSession.uri(agent.id, sessionId));

		assert.strictEqual(turns.length, 1);
		assert.strictEqual(turns[0].id, 'u1');
		assert.strictEqual(turns[0].message.text, 'hi');
		assert.strictEqual(sdk.getSessionMessagesCalls.length, 1);
		assert.deepStrictEqual(sdk.getSessionMessagesCalls[0], {
			sessionId,
			options: { includeSystemMessages: true },
		});
	});

	test('getSessionMessages on subagent URI returns [] when parent session is not materialized', async () => {
		const { agent, sdk } = createTestContext(disposables);
		const parentUri = AgentSession.uri(agent.id, 'parent');
		const subagentUri = URI.parse(`${parentUri.toString()}/subagent/tool-call-1`);

		const turns = await agent.getSessionMessages(subagentUri);

		// Parent session was never materialized, so the per-session
		// SubagentRegistry is unreachable — early-return branch must
		// fire and the parent SDK path must NOT.
		assert.deepStrictEqual({
			turns,
			sdkParentCalls: sdk.getSessionMessagesCalls.length,
		}, {
			turns: [],
			sdkParentCalls: 0,
		});
	});

	test('getSessionMessages on provisional session returns [] with no SDK call', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/workspace') });

		const turns = await agent.getSessionMessages(created.session);

		assert.deepStrictEqual(turns, []);
		assert.strictEqual(sdk.getSessionMessagesCalls.length, 0, 'provisional session must not hit SDK');
	});

	test('getSessionMessages returns [] on SDK fetch failure (warn-logged)', async () => {
		const log = new CapturingLogService();
		const { agent, sdk } = createTestContext(disposables, { logService: log });
		sdk.getSessionMessagesRejection = new Error('simulated SDK failure');

		const turns = await agent.getSessionMessages(AgentSession.uri(agent.id, 'fail-id'));

		assert.deepStrictEqual(turns, []);
		assert.ok(log.warns.some(w => w.includes('getSessionMessages SDK fetch failed')),
			`expected warn-log; got: ${log.warns.join(' | ')}`);
	});

	// Note: Phase 12 step 8 priming used to be tested here against a
	// `FakeClaudeSubagentResolver`. With the per-session
	// `SubagentRegistry`, priming is exercised by Phase D's
	// `claudeSubagentRegistry.test.ts` (`primeFromTranscript`) and by
	// `claudeTranscriptService.test.ts`'s integration tests on
	// `loadParentTranscript`. The `getSessionMessages` integration is
	// covered indirectly by all the materialized-session tests above.
});

// #endregion

// #region Phase 11 — customizations / plugins

suite('ClaudeAgent — Phase 11 customizations', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function makeSyncedRef(uri: string, dir: string): ISyncedCustomization {
		return {
			customization: {
				type: CustomizationType.Plugin,
				id: customizationId(uri),
				uri,
				name: uri,
				enabled: true,
				load: { kind: CustomizationLoadStatus.Loaded },
			},
			pluginDir: URI.file(dir),
		};
	}

	function makeClientCustomization(uri: string, name: string): ClientPluginCustomization {
		return {
			type: CustomizationType.Plugin,
			id: customizationId(uri),
			uri,
			name,
			enabled: true,
		};
	}

	function buildCtxWith(pluginManager: FakeAgentPluginManager): ITestContext {
		const proxy = new FakeClaudeProxyService();
		const api = new FakeCopilotApiService();
		api.models = async () => [...ALL_MODELS];
		const sdk = new FakeClaudeAgentSdkService();
		const sessionData = new RecordingSessionDataService(createSessionDataService());
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configService = disposables.add(new AgentConfigurationService(stateManager, logService));

		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));

		const services = new ServiceCollection(
			[IFileService, fileService],
			[INativeEnvironmentService, { userHome: URI.file('/mock-home') } as INativeEnvironmentService],
			[ILogService, logService],
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
			[IAgentPluginManager, pluginManager],
			[IAgentHostGitService, createNoopGitService()],
			[IAgentConfigurationService, configService],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
		return { agent, proxy, api, sdk, sessionData, stateManager, configService, instantiationService, fileService };
	}

	test('createSession seeds the eager activeClient customizations to the plugin manager', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const customizations = [makeClientCustomization('https://bundle', 'Synced')];
		await agent.createSession({
			session: AgentSession.uri('claude', 'eager'),
			workingDirectory: URI.file('/work'),
			activeClient: { clientId: 'client-1', tools: [], customizations },
		});

		// The eagerly-claimed active client's customizations must be synced at
		// creation (mirrors the Copilot agent). Without this, built-in skills
		// like `/create-pr` never reach the SDK: the workbench state already
		// carries the active client, so no follow-up `session/activeClientSet`
		// is dispatched to trigger the sync.
		assert.deepStrictEqual(pm.syncCalls, [{ clientId: 'client-1', customizations }]);
	});

	test('createSession without an activeClient does not sync customizations', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		await agent.createSession({
			session: AgentSession.uri('claude', 'no-eager'),
			workingDirectory: URI.file('/work'),
		});

		assert.deepStrictEqual(pm.syncCalls, []);
	});

	test('createSession re-seeds the eager activeClient on reconnect to an existing session', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const customizations = [makeClientCustomization('https://bundle', 'Synced')];
		const cfg = {
			session: AgentSession.uri('claude', 'reconnect'),
			workingDirectory: URI.file('/work'),
			activeClient: { clientId: 'client-1', tools: [], customizations },
		};
		await agent.createSession(cfg);
		// AgentService reissues createSession for the same URI on reconnect; the
		// eager client must be re-applied even though the session already exists.
		await agent.createSession(cfg);

		assert.deepStrictEqual(pm.syncCalls, [
			{ clientId: 'client-1', customizations },
			{ clientId: 'client-1', customizations },
		]);
	});

	test('createSession eager seeding suppresses orphan customization progress', async () => {
		const pm = new FakeAgentPluginManager();
		pm.syncResult = [makeSyncedRef('https://bundle', '/p/bundle')];
		const { agent } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const updates: string[] = [];
		disposables.add(agent.onDidSessionProgress(s => {
			if (s.kind === 'action' && s.action.type === ActionType.SessionCustomizationUpdated) {
				updates.push(s.action.customization.uri.toString());
			}
		}));

		await agent.createSession({
			session: AgentSession.uri('claude', 'quiet'),
			workingDirectory: URI.file('/work'),
			activeClient: { clientId: 'client-1', tools: [], customizations: [makeClientCustomization('https://bundle', 'Synced')] },
		});

		// The session state does not exist yet at create time, so the initial
		// sync must be quiet — no orphan SessionCustomizationUpdated envelopes.
		assert.deepStrictEqual(updates, []);
	});

	test('setClientCustomizations forwards each item as a SessionCustomizationUpdated action', async () => {
		const pm = new FakeAgentPluginManager();
		pm.syncResult = [makeSyncedRef('https://a', '/p/a'), makeSyncedRef('https://b', '/p/b')];
		const { agent } = buildCtxWith(pm);

		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });

		const updates: { uri: string }[] = [];
		disposables.add(agent.onDidSessionProgress(s => {
			if (s.kind === 'action' && s.action.type === ActionType.SessionCustomizationUpdated) {
				updates.push({ uri: s.action.customization.uri.toString() });
			}
		}));

		const synced = await agent.syncClientCustomizations(created.session, 'client-1', [
			makeClientCustomization('https://a', 'A'),
			makeClientCustomization('https://b', 'B'),
		]);

		assert.strictEqual(synced.length, 2);
		assert.ok(updates.some(u => u === undefined ? false : u.uri.includes('a')), `expected an update for plugin a; got ${JSON.stringify(updates)}`);
		assert.ok(updates.some(u => u === undefined ? false : u.uri.includes('b')), `expected an update for plugin b; got ${JSON.stringify(updates)}`);
	});

	test('setCustomizationEnabled fans out to every in-memory session', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const s1 = await agent.createSession({ session: AgentSession.uri('claude', 'a'), workingDirectory: URI.file('/work') });
		const s2 = await agent.createSession({ session: AgentSession.uri('claude', 'b'), workingDirectory: URI.file('/work') });

		pm.syncResult = [makeSyncedRef('https://shared', '/p/shared')];
		await agent.syncClientCustomizations(s1.session, 'c', [makeClientCustomization('https://shared', 'S')]);
		await agent.syncClientCustomizations(s2.session, 'c', [makeClientCustomization('https://shared', 'S')]);

		// One fire per per-session diff change confirms fan-out.
		let changes = 0;
		disposables.add(agent.onDidCustomizationsChange(() => changes++));
		agent.setCustomizationEnabled(customizationId('https://shared'), false);

		assert.strictEqual(changes, 2);
	});

	test('getCustomizations returns [] — provider-level catalogue, not a cross-session aggregator', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const s1 = await agent.createSession({ session: AgentSession.uri('claude', 'one'), workingDirectory: URI.file('/work') });
		const s2 = await agent.createSession({ session: AgentSession.uri('claude', 'two'), workingDirectory: URI.file('/work') });

		pm.syncResult = [makeSyncedRef('https://shared', '/p/shared'), makeSyncedRef('https://a', '/p/a')];
		await agent.syncClientCustomizations(s1.session, 'c', []);
		pm.syncResult = [makeSyncedRef('https://shared', '/p/shared'), makeSyncedRef('https://b', '/p/b')];
		await agent.syncClientCustomizations(s2.session, 'c', []);

		// `IAgent.getCustomizations()` is the provider-level catalogue
		// (host-configured), NOT an aggregator across sessions. Claude has
		// no host-configured customizations today, so [] is the contract.
		// Client-pushed refs flow through `getSessionCustomizations` instead.
		assert.deepStrictEqual(agent.getCustomizations(), []);
	});

	test('getSessionCustomizations resolves against a provisional session', async () => {
		const pm = new FakeAgentPluginManager();
		pm.syncResult = [makeSyncedRef('https://a', '/p/a')];
		const { agent } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		assert.strictEqual(created.provisional, true);

		await agent.syncClientCustomizations(created.session, 'c', [makeClientCustomization('https://a', 'A')]);

		const customizations = await agent.getSessionCustomizations!(created.session);
		// The client-pushed customization, plus the curated read-only built-ins
		// always present pre-materialize for discoverability (before a live SDK
		// set exists): the built-in agents directory and the "Built-in" skills
		// container.
		assert.deepStrictEqual(customizations.map(c => c.uri), ['https://a', 'file:///mock-home/.claude/agents', 'agent-builtin:/skills']);
	});

	test('getSessionCustomizations overlays the enablement state onto client-pushed entries', async () => {
		const pm = new FakeAgentPluginManager();
		pm.syncResult = [makeSyncedRef('https://a', '/p/a')];
		const { agent } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });

		await agent.syncClientCustomizations(created.session, 'c', [makeClientCustomization('https://a', 'A')]);
		// Disable the client-pushed entry; the projection must reflect it.
		agent.setCustomizationEnabled(customizationId('https://a'), false);
		// Disabling a DISCOVERED entry's id must be a no-op — the enablement
		// overlay is applied to the client-pushed tier only.
		agent.setCustomizationEnabled(customizationId('agent-builtin:/skills'), false);

		const customizations = await agent.getSessionCustomizations!(created.session);
		assert.strictEqual(customizations.find(c => c.uri === 'https://a')?.enabled, false);
		assert.strictEqual(customizations.find(c => c.uri === 'agent-builtin:/skills')?.enabled, true, 'discovered entries are not toggled by the enablement map');
	});

	test('send pre-flight: dirty customizations triggers a rebind (SDK plugin URI set is captured at startup, so any change must restart the Query)', async () => {
		const pm = new FakeAgentPluginManager();
		const ctx = buildCtxWith(pm);
		const { agent, sdk } = ctx;
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		// Stage 2 turns and park the iterator after turn 1's `result` so
		// `_query` stays bound (mirroring the "reuse query" pattern).
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (idx: number) => { if (idx === 2) { await advance.p; } };
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');
		assert.strictEqual(sdk.startupCallCount, 1);

		// Customization sync flips dirty; the next sendMessage's
		// pre-flight rebinds so `Options.plugins` on the new Query
		// includes the new path.
		pm.syncResult = [makeSyncedRef('https://a', '/p/a')];
		await agent.syncClientCustomizations(created.session, 'c', [makeClientCustomization('https://a', 'A')]);
		const firstQuery = sdk.warmQueries[0].produced!;

		const p2 = agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2');
		await tick();
		advance.complete();
		await p2;

		assert.deepStrictEqual({
			reloadsOnFirstQuery: firstQuery.reloadPluginsCallCount,
			startups: sdk.startupCallCount,
			warmQueries: sdk.warmQueries.length,
		}, { reloadsOnFirstQuery: 0, startups: 2, warmQueries: 2 });
	});

	test('mid-turn setCustomizationEnabled does not affect the in-flight send (race coverage)', async () => {
		const pm = new FakeAgentPluginManager();
		const ctx = buildCtxWith(pm);
		const { agent, sdk } = ctx;
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		// Materialize, then drain the dirty bit from a customization
		// sync so the pre-flight for the SECOND turn is clean.
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];
		pm.syncResult = [makeSyncedRef('https://x', '/p/x')];
		await agent.syncClientCustomizations(created.session, 'c', [makeClientCustomization('https://x', 'X')]);
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');
		const session = agent.getSessionForTesting(created.session)!;
		// First-turn materialize consumed the dirty bit from the sync
		// above (plugin path baked into `Options.plugins` of the
		// startup `Query`), so the pre-flight for the second turn
		// starts clean.
		assert.strictEqual(session.clientCustomizationsDiff.hasDifference, false);

		// Block the SECOND turn mid-iterator so a toggle can land while
		// the SDK is mid-yield.
		const gate = new DeferredPromise<void>();
		sdk.queryAdvance = async (i: number) => { if (i === 2) { await gate.p; } };

		const inflight = agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2');
		await new Promise(r => setImmediate(r));

		// Toggle a SYNCED customization during the in-flight turn. The
		// diff flips dirty (state changed) but no SDK action drains
		// during the current send — its pre-flight already passed.
		const startupsBefore = sdk.startupCallCount;
		agent.setCustomizationEnabled(customizationId('https://x'), false);
		assert.strictEqual(session.clientCustomizationsDiff.hasDifference, true);
		assert.strictEqual(sdk.startupCallCount, startupsBefore, 'no rebind during the in-flight turn');

		gate.complete();
		await inflight;
	});

	test('getSessionCustomizations swallows SDK snapshot failure and returns the client-pushed projection', async () => {
		// `snapshotResolvedCustomizations` calls `supportedAgents()` and
		// `mcpServerStatus()` in `Promise.all`; the FakeQuery throws on
		// both. The session should warn-log and still return the
		// client-pushed slice rather than blanking the UI.
		const pm = new FakeAgentPluginManager();
		pm.syncResult = [makeSyncedRef('https://a', '/p/a')];
		const { agent, sdk } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.syncClientCustomizations(created.session, 'c', [makeClientCustomization('https://a', 'A')]);
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');

		const customizations = await agent.getSessionCustomizations!(created.session);
		// SDK snapshot failed → `sdk` stays undefined → unfiltered fallback:
		// the client-pushed entry survives (UI not blanked) and the curated
		// built-ins are appended (the built-in agents directory and the skills
		// container) since there is no live set to derive from.
		assert.deepStrictEqual(customizations.map(c => c.uri), ['https://a', 'file:///mock-home/.claude/agents', 'agent-builtin:/skills'], 'client-pushed projection survives SDK snapshot failure');
	});

	test('getSessionCustomizations derives the Built-in container from the live SDK command set post-materialize', async () => {
		// Once materialized, the runtime's real built-ins are exactly the SDK
		// commands we don't discover on disk — surfaced read-only with the
		// SDK's own descriptions, replacing the curated pre-materialize seed.
		const pm = new FakeAgentPluginManager();
		const { agent, sdk } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		// A successful snapshot: one SDK-only command, no agents/MCP. (No disk
		// skills exist under /work, so the command becomes a built-in.)
		// Park the consumer loop at the turn boundary (index 2) so the pipeline
		// stays live for the post-turn snapshot — the real SDK iterable parks
		// between turns; the fake would otherwise end the stream and mark the
		// pipeline dead, collapsing the snapshot to the disk-only fallback.
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (i: number) => { if (i === 2) { await advance.p; } };
		sdk.supportedCommandsResult = [{ name: 'sdkcmd', description: 'Provided by the runtime.', argumentHint: '' }];
		sdk.supportedAgentsResult = [];
		sdk.mcpServerStatusResult = [];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');

		const customizations = await agent.getSessionCustomizations!(created.session);
		assert.strictEqual(customizations.length, 1);
		const container = customizations[0];
		assert.strictEqual(container.type, CustomizationType.Directory);
		assert.strictEqual(container.uri, 'agent-builtin:/skills');

		// The single child is the SDK command (with the SDK's description),
		// proving the live command set — not the curated hardcoded list —
		// drives the post-materialize built-ins.
		const child = container.children?.[0];
		assert.ok(child);
		assert.strictEqual(child.type, CustomizationType.Skill);
		assert.deepStrictEqual(
			{ count: container.children?.length, name: child.name, description: child.description },
			{ count: 1, name: 'sdkcmd', description: 'Provided by the runtime.' }
		);
		advance.complete();
	});

	test('getSessionCustomizations surfaces a native plugin captured from the live SDK init.plugins (path filter)', async () => {
		// Native plugins are auto-loaded by the runtime; the host only surfaces
		// them. Post-materialize, a plugin survives only when the captured
		// `system/init.plugins` reports its resolved root path — proving the
		// pipeline captures `message.plugins` and the discovery filter consumes it.
		const pm = new FakeAgentPluginManager();
		const { agent, sdk, fileService } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		// Seed an enabled native plugin under the mock user home cache.
		const root = '/mock-home/.claude/plugins/cache/m/tg/1.0.0';
		await fileService.writeFile(URI.file('/mock-home/.claude/settings.json'), VSBuffer.fromString(JSON.stringify({ enabledPlugins: { 'tg@m': true } })));
		await fileService.writeFile(URI.file(`${root}/.claude-plugin/plugin.json`), VSBuffer.fromString(JSON.stringify({ name: 'tg' })));

		sdk.supportedCommandsResult = [];
		sdk.supportedAgentsResult = [];
		sdk.mcpServerStatusResult = [];
		// The live session reports the plugin loaded at its resolved root.
		const init = makeSystemInitMessage(sessionId);
		init.plugins = [{ name: 'tg', path: root }];
		sdk.nextQueryMessages = [init, makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');

		const customizations = await agent.getSessionCustomizations!(created.session);
		assert.deepStrictEqual(
			customizations.filter(c => c.type === CustomizationType.Plugin).map(c => c.name),
			['tg@m'],
			'native plugin survives post-materialize because the captured init.plugins reports its root',
		);
	});

	test('changeAgent on a provisional session stashes the selection (no SDK contact) and lands on Options.agent at materialize', async () => {
		const pm = new FakeAgentPluginManager();
		const ctx = buildCtxWith(pm);
		const { agent, sdk } = ctx;
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		await agent.chats.changeAgent(defaultChatUri(created.session), { uri: 'file:///foo/agents/code-reviewer.md' });
		assert.strictEqual(sdk.startupCallCount, 0, 'no SDK startup from changeAgent on provisional');

		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');

		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, 'code-reviewer', 'agent name resolved from file URI basename');
	});

	test('changeAgent on a materialized session triggers a rebind with the new Options.agent on the rebuilt Query', async () => {
		const pm = new FakeAgentPluginManager();
		const ctx = buildCtxWith(pm);
		const { agent, sdk } = ctx;
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');
		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, undefined, 'no agent on first startup');

		// Mid-session agent change: flips dirty, next send rebinds
		// (SDK has no working runtime hook to swap the agent in place).
		await agent.chats.changeAgent(defaultChatUri(created.session), { uri: 'file:///foo/agents/planner.md' });
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2');

		assert.strictEqual(sdk.startupCallCount, 2, 'rebind on agent change');
		assert.strictEqual(sdk.capturedStartupOptions[1]?.agent, 'planner', 'agent baked into rebuilt Options');
	});

	test('changeAgent(undefined) clears the selection: rebind, Options.agent omitted', async () => {
		const pm = new FakeAgentPluginManager();
		const ctx = buildCtxWith(pm);
		const { agent, sdk } = ctx;
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({
			workingDirectory: URI.file('/work'),
			agent: { uri: 'file:///foo/agents/planner.md' },
		});
		const sessionId = AgentSession.id(created.session);

		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1');
		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, 'planner');

		await agent.chats.changeAgent(defaultChatUri(created.session), undefined);
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2');

		assert.strictEqual(sdk.startupCallCount, 2);
		assert.strictEqual(sdk.capturedStartupOptions[1]?.agent, undefined, 'cleared agent omitted from rebuilt Options');
	});

	// #region Multi-chat — additional (non-default) peer chats

	test('createChat persists a peer chat; getChats lists it; disposeChat removes it', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));

		await agent.chats.createChat(chatUri);
		const afterCreate = listPeerChats(agent, created.session);

		// Idempotent re-create must not duplicate the catalog entry.
		await agent.chats.createChat(chatUri);
		const afterRecreate = listPeerChats(agent, created.session);

		await agent.chats.disposeChat(chatUri);
		const afterDispose = listPeerChats(agent, created.session);

		assert.deepStrictEqual({ afterCreate, afterRecreate, afterDispose }, {
			afterCreate: [chatUri.toString()],
			afterRecreate: [chatUri.toString()],
			afterDispose: [],
		});
	});

	test('createChat / disposeChat on the default chat URI are no-ops', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const defaultChat = URI.parse(buildChatUri(created.session.toString(), 'default'));

		await agent.chats.createChat(defaultChat);
		await agent.chats.disposeChat(defaultChat);

		assert.deepStrictEqual(listPeerChats(agent, created.session), []);
	});

	test('createChat({ fork }) forks the source chat; the peer chat resumes its own forked SDK session', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		// Parent session with a two-turn transcript; fork the peer chat at u1.
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const parentId = AgentSession.id(created.session);
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.fork(chatUri, { source: created.session, turnId: 'u1' });

		const forkCall = sdk.forkSessionCalls[0];

		// Sending to the peer chat resumes ITS forked chat, not the parent's.
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(chatUri, 'next', undefined, undefined, 'turn-1');

		assert.deepStrictEqual({
			forkCall,
			chats: listPeerChats(agent, created.session),
			startupResume: sdk.capturedStartupOptions[0]?.resume,
		}, {
			forkCall: { sessionId: parentId, options: { upToMessageId: 'a1' } },
			chats: [chatUri.toString()],
			startupResume: 'forked-1',
		});
	});

	test('createChat({ fork }) with an unknown turn falls back to a fresh chat', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const parentId = AgentSession.id(created.session);
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.fork(chatUri, { source: created.session, turnId: 'does-not-exist' });

		assert.deepStrictEqual({
			forked: sdk.forkSessionCalls.length,
			chats: listPeerChats(agent, created.session),
		}, {
			forked: 0,
			chats: [chatUri.toString()],
		});
	});

	test('sendMessage to a peer chat targets a chat distinct from the parent session', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const parentId = AgentSession.id(created.session);
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.fork(chatUri, { source: created.session, turnId: 'u1' });

		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(chatUri, 'hi', undefined, undefined, 'turn-1');

		// The peer chat's startup resumed `forked-1`; the parent session was
		// never materialized (no fresh `sessionId` startup for the parent).
		assert.deepStrictEqual({
			startupCount: sdk.capturedStartupOptions.length,
			resume: sdk.capturedStartupOptions[0]?.resume,
			parentMaterialized: sdk.capturedStartupOptions.some(o => o.sessionId === parentId),
		}, {
			startupCount: 1,
			resume: 'forked-1',
			parentMaterialized: false,
		});
	});

	test('changeModel on a peer chat persists in the catalog so a later resume picks it up', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const parentId = AgentSession.id(created.session);
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.fork(chatUri, { source: created.session, turnId: 'u1' });

		// Change the peer chat's model before it is materialized.
		await agent.chats.changeModel(chatUri, { id: 'claude-opus-4.6' });

		// First send materializes (resumes) the chat with the changed model.
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(chatUri, 'hi', undefined, undefined, 'turn-1');

		assert.strictEqual(sdk.capturedStartupOptions[0]?.model, 'claude-opus-4-6');
	});

	test('disposing the parent session disposes its peer chats', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.createChat(chatUri);

		await agent.disposeSession(created.session);

		// The persisted catalog still records the chat (dispose tears down live
		// state, not on-disk history), but no in-memory chat survives —
		// re-disposing the chat is a clean no-op.
		await agent.chats.disposeChat(chatUri);
		assert.deepStrictEqual(listPeerChats(agent, created.session), []);
	});

	test('setPendingMessages routes steering to a materialized peer chat, warns for an unknown one', async () => {
		const logService = new CapturingLogService();
		const { agent, sdk } = createTestContext(disposables, { logService });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const parentId = AgentSession.id(created.session);
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.fork(chatUri, { source: created.session, turnId: 'u1' });
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(chatUri, 'hi', undefined, undefined, 'turn-1');

		// Known materialized peer chat: resolved via the `chat` arg, no warning.
		logService.warns.length = 0;
		agent.setPendingMessages!(created.session, { id: 'p1', message: { text: 'steer', origin: { kind: MessageKind.User } } }, [], chatUri);
		const warnAfterKnown = logService.warns.filter(w => w.includes('setPendingMessages'));

		// Unknown peer chat URI: not found, warns.
		const unknownChat = URI.parse(buildChatUri(created.session.toString(), 'chat-missing'));
		agent.setPendingMessages!(created.session, undefined, [], unknownChat);
		const warnAfterUnknown = logService.warns.filter(w => w.includes('setPendingMessages'));

		assert.deepStrictEqual({ knownWarns: warnAfterKnown.length, unknownWarns: warnAfterUnknown.length }, { knownWarns: 0, unknownWarns: 1 });
	});

	test('changeAgent on a peer chat persists to its overlay so a later resume picks it up', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const parentId = AgentSession.id(created.session);
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.fork(chatUri, { source: created.session, turnId: 'u1' });

		// Select a custom agent for the peer chat before it is materialized; the
		// selection lands on the chat's own overlay (mirrors changeModel).
		await agent.chats.changeAgent(chatUri, { uri: 'file:///foo/agents/planner.md' });

		// First send materializes (resumes) the chat with the selected agent.
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(chatUri, 'hi', undefined, undefined, 'turn-1');

		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, 'planner');
	});

	test('sendMessage routes each peer chat to its own forked chat', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const parentId = AgentSession.id(created.session);
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));

		// Two peer chats, each forked from a different turn into its own SDK
		// chat. Staging distinct fork results pins per-chat identity.
		const chatA = URI.parse(buildChatUri(created.session.toString(), 'chat-a'));
		sdk.forkSessionResult = { sessionId: 'forked-a' };
		await agent.chats.fork(chatA, { source: created.session, turnId: 'u1' });

		const chatB = URI.parse(buildChatUri(created.session.toString(), 'chat-b'));
		sdk.forkSessionResult = { sessionId: 'forked-b' };
		await agent.chats.fork(chatB, { source: created.session, turnId: 'u2' });

		sdk.sessionList = [
			{ sessionId: 'forked-a', summary: 'a', lastModified: 1, cwd: URI.file('/work').fsPath },
			{ sessionId: 'forked-b', summary: 'b', lastModified: 1, cwd: URI.file('/work').fsPath },
		];

		// Each send must resume the chat backing THAT chat, never the
		// other and never the (un-materialized) parent session.
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-a'), makeResultSuccess('forked-a')];
		await agent.chats.sendMessage(chatA, 'to a', undefined, undefined, 'turn-a');
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-b'), makeResultSuccess('forked-b')];
		await agent.chats.sendMessage(chatB, 'to b', undefined, undefined, 'turn-b');

		assert.deepStrictEqual({
			chats: listPeerChats(agent, created.session).sort(),
			resumeA: sdk.capturedStartupOptions[0]?.resume,
			resumeB: sdk.capturedStartupOptions[1]?.resume,
			parentMaterialized: sdk.capturedStartupOptions.some(o => o.sessionId === parentId),
		}, {
			chats: [chatA.toString(), chatB.toString()].sort(),
			resumeA: 'forked-a',
			resumeB: 'forked-b',
			parentMaterialized: false,
		});
	});

	test('restart round-trip: a forked peer chat re-materializes from the orchestrator\'s providerData on a fresh agent backed by the same database', async () => {
		const database = new TestSessionDatabase();

		// --- First "process": create a forked peer chat with a model override.
		// `createChat` hands the orchestrator an opaque `providerData` blob to
		// persist. ---
		const ctxA = createTestContext(disposables, { database });
		await ctxA.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await ctxA.agent.createSession({ workingDirectory: URI.file('/work') });
		const parentId = AgentSession.id(created.session);
		ctxA.sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		ctxA.sdk.forkSessionResult = { sessionId: 'forked-1' };

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		const createResult = await ctxA.agent.chats.fork(chatUri, { source: created.session, turnId: 'u1' }, {
			model: { id: 'claude-opus-4.6' },
		});
		const providerData = createResult?.providerData;
		const catalogBefore = listPeerChats(ctxA.agent, created.session);

		// --- Simulate a restart: a brand-new agent over the SAME database.
		// Nothing carries over in memory; the parent + forked transcripts
		// survive on disk, staged in the fresh SDK's session list. The
		// orchestrator hands the persisted `providerData` back via
		// `materializeChat` to re-attach the chat's backing. ---
		const ctxB = createTestContext(disposables, { database });
		await ctxB.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		ctxB.sdk.sessionList = [
			{ sessionId: parentId, summary: 'parent', lastModified: 1, cwd: URI.file('/work').fsPath },
			{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath },
		];

		await ctxB.agent.materializeChat!(chatUri, providerData);
		// Catalog reappears from the re-attached live backing without SDK contact.
		const catalogAfter = listPeerChats(ctxB.agent, created.session);

		// First send on the restored chat resumes its forked chat with
		// the persisted model override — history + per-chat model both came back.
		ctxB.sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await ctxB.agent.chats.sendMessage(chatUri, 'after restart', undefined, undefined, 'turn-1');

		assert.deepStrictEqual({
			providerData: providerData && JSON.parse(providerData),
			catalogBefore,
			catalogAfter,
			resume: ctxB.sdk.capturedStartupOptions[0]?.resume,
			model: ctxB.sdk.capturedStartupOptions[0]?.model,
		}, {
			providerData: { sdkSessionId: 'forked-1', model: { id: 'claude-opus-4.6' } },
			catalogBefore: [chatUri.toString()],
			catalogAfter: [chatUri.toString()],
			resume: 'forked-1',
			model: 'claude-opus-4-6',
		});
	});

	test('changeModel on a peer chat fires onDidChangeChatData with the refreshed providerData', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		const createResult = await agent.chats.createChat(chatUri);
		const sdkSessionId = JSON.parse(createResult!.providerData!).sdkSessionId as string;

		const changes: IAgentChatDataChange[] = [];
		disposables.add(agent.onDidChangeChatData!(e => changes.push(e)));

		await agent.chats.changeModel(chatUri, { id: 'claude-opus-4.6' });

		assert.deepStrictEqual(changes.map(c => ({ chat: c.chat.toString(), providerData: JSON.parse(c.providerData) })), [
			{ chat: chatUri.toString(), providerData: { sdkSessionId, model: { id: 'claude-opus-4.6' } } },
		]);
	});

	// #endregion

	// #region Multi-chat — chat surface (G-C1 adoption)

	test('createSession mints a provisional session and disposeSession tears it down', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		// Tearing the session down must not throw and must be idempotent.
		await agent.disposeSession(created.session);
		await agent.disposeSession(created.session);

		assert.deepStrictEqual({
			scheme: created.session.scheme,
			provisional: created.provisional,
		}, {
			scheme: 'claude',
			provisional: true,
		});
	});

	test('chats.createChat persists a peer chat; getChats lists it; chats.disposeChat removes it', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));

		await agent.chats!.createChat(chatUri);
		const afterCreate = listPeerChats(agent, created.session);

		await agent.chats!.disposeChat(chatUri);
		const afterDispose = listPeerChats(agent, created.session);

		assert.deepStrictEqual({ afterCreate, afterDispose }, {
			afterCreate: [chatUri.toString()],
			afterDispose: [],
		});
	});

	test('chats.fork forks the source chat; chats.sendMessage resumes the peer chat\'s own forked SDK session', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const parentId = AgentSession.id(created.session);
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats!.fork(chatUri, { source: created.session, turnId: 'u1' });

		const forkCall = sdk.forkSessionCalls[0];

		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats!.sendMessage(chatUri, 'next', undefined, undefined, 'turn-1');

		assert.deepStrictEqual({
			forkCall,
			chats: listPeerChats(agent, created.session),
			startupResume: sdk.capturedStartupOptions[0]?.resume,
		}, {
			forkCall: { sessionId: parentId, options: { upToMessageId: 'a1' } },
			chats: [chatUri.toString()],
			startupResume: 'forked-1',
		});
	});

	test('chats addresses the default chat by the default chat URI (sendMessage routes to the default chat; getMessages mirrors getSessionMessages)', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const chat = defaultChatUri(created.session);
		await agent.chats!.sendMessage(chat, 'hi', undefined, undefined, 'turn-1');

		const viaChats = await agent.chats!.getMessages(chat);
		const viaLegacy = await agent.getSessionMessages(created.session);

		assert.deepStrictEqual({
			startupSessionId: sdk.capturedStartupOptions[0]?.sessionId,
			resume: sdk.capturedStartupOptions[0]?.resume,
			messagesMatchLegacy: JSON.stringify(viaChats) === JSON.stringify(viaLegacy),
		}, {
			startupSessionId: sessionId,
			resume: undefined,
			messagesMatchLegacy: true,
		});
	});

	test('chats.changeModel on a peer fires onDidChangeChatData with the refreshed providerData (parity with legacy changeModel)', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		const createResult = await agent.chats!.createChat(chatUri);
		const sdkSessionId = JSON.parse(createResult!.providerData!).sdkSessionId as string;

		const changes: IAgentChatDataChange[] = [];
		disposables.add(agent.onDidChangeChatData!(e => changes.push(e)));

		await agent.chats.changeModel(chatUri, { id: 'claude-opus-4.6' });

		assert.deepStrictEqual(changes.map(c => ({ chat: c.chat.toString(), providerData: JSON.parse(c.providerData) })), [
			{ chat: chatUri.toString(), providerData: { sdkSessionId, model: { id: 'claude-opus-4.6' } } },
		]);
	});

	test('chats.changeAgent on a peer persists to its overlay so a later resume picks it up (parity with legacy changeAgent)', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const parentId = AgentSession.id(created.session);
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats!.fork(chatUri, { source: created.session, turnId: 'u1' });

		// Select a custom agent for the peer chat before it is materialized.
		await agent.chats!.changeAgent(chatUri, { uri: 'file:///foo/agents/reviewer.md' });

		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats!.sendMessage(chatUri, 'hi', undefined, undefined, 'turn-1');

		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, 'reviewer');
	});

	// #endregion
});

// #endregion
