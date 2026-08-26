/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import type { AccountInfo, AgentInfo, ForkSessionOptions, ForkSessionResult, GetSessionMessagesOptions, McpSdkServerConfigWithInstance, McpServerStatus, ModelInfo, Options, PermissionMode, Query, SDKControlInterruptResponse, SDKMessage, SDKSessionInfo, SDKUserMessage, SdkMcpToolDefinition, SessionMessage, SessionMutationOptions, Settings, SlashCommand, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { CCAModel } from '@vscode/copilot-api';

import assert from 'assert';
import { isCustomizationEnabled } from '../../common/customizationEnablement.js';
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
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid, isUUID } from '../../../../base/common/uuid.js';
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
import { IActiveClient, IAgent, IAgentChatContext, IAgentChatDataChange, IAgentChatMetadata, IAgentCreateChatOptions, IAgentCreateChatResult, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentMaterializeChatEvent, IAgentSpawnChatEvent, AgentSession, AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../common/agent.js';
import { AgentHostAutoApprovePolicyRestrictedConfigKey, AgentHostClaudeMultiRootEnabledConfigKey, AgentHostGitHubMcpServerEnabledConfigKey } from '../../common/agentHostSchema.js';
import { AgentHostConfigKey } from '../../common/agentHostCustomizationConfig.js';
import { AgentFeedbackAttachmentDisplayKind } from '../../common/meta/agentFeedbackAttachments.js';
import { ChatInputRequestPurpose, readChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { toClientPluginMcpDefaultCwdsMeta } from '../../common/meta/clientPluginCustomizationMeta.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { CustomizationLoadStatus, CustomizationType, MessageAttachmentKind, MessageKind, ResponsePartKind, ChatInputResponseKind, SessionStatus, ToolResultContentType, buildChatUri, buildDefaultChatUri, buildSubagentChatUri, buildSubagentSessionUri, customizationId, isDefaultChatUri, parseChatUri, parseDefaultChatUri, parseRequiredSessionUriFromChatUri, type ClientPluginCustomization, type Customization, type PluginCustomization } from '../../common/state/sessionState.js';
import { McpServerStatus as McpCustomizationServerStatus, type ChildCustomization, type CustomizationEnablement, type McpServerCustomization } from '../../common/state/protocol/channels-session/state.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ChatOriginKind, CustomizationEnablementKind, ProtectedResourceMetadata, ChatInputAnswerState, ChatInputAnswerValueKind, ToolCallStatus, type SessionConfigState, type ChatInputRequest, type ToolDefinition } from '../../common/state/protocol/state.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { IAgentHostCustomizationEnablementService, type IAgentHostCustomizationEnablementService as ICustomizationEnablementService } from '../../node/agentHostCustomizationEnablementService.js';
import { AgentHostSessionTitleSignal, IAgentHostSessionTitleSignal } from '../../node/agentHostSessionTitleSignal.js';
import { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { IAgentHostAuthenticationService, type IAgentHostAuthTokenChangeEvent } from '../../node/agentHostAuthenticationService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { createTestAgentService, getTestAgentStateManager } from './agentServiceTestUtils.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { makeMcpServerCustomization } from '../../../agentPlugins/common/pluginParsers.js';
import { ClaudeAgent, fromSdkModelInfo } from '../../node/claude/claudeAgent.js';
import { CLAUDE_PROVIDER_ANTHROPIC, CLAUDE_PROVIDER_COPILOT } from '../../common/claudeProviders.js';
import { toClaudeModelSelectionId } from '../../node/claude/claudeModelSelection.js';
import { ClaudeAgentSession } from '../../node/claude/claudeAgentSession.js';
import { createClaudeInternalMcpServerCustomization } from '../../node/claude/customizations/claudeSessionCustomizationDiscovery.js';
import { ClaudeSessionMetadataStore } from '../../node/claude/claudeSessionMetadataStore.js';
import { ClaudeSessionConfigKey } from '../../common/claudeSessionConfigKeys.js';
import { ClaudeAgentSdkService, IClaudeAgentSdkService, IClaudeSdkBindings } from '../../node/claude/claudeAgentSdkService.js';
import { AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY, AGENT_SDK_SETUP_RELOAD_REQUEST_KEY, readAgentSdkSetupInfos } from '../../common/agentSdkSetup.js';
import { IAgentSdkDownloader } from '../../node/agentSdkDownloader.js';
import { RecordingAgentSdkDownloader } from './testAgentSdkDownloader.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { IClaudeProxyCreditsReport, IClaudeProxyHandle, IClaudeProxyService } from '../../node/claude/claudeProxyService.js';
import { resolvePromptToContentBlocks } from '../../node/claude/claudePromptResolver.js';
import { ICopilotApiService, type ICopilotApiServiceRequestOptions } from '../../node/shared/copilotApiService.js';
import { createAgentChatContext } from '../../node/agentChatContext.js';
import { createNoopGitService, createNullSessionDataService, createSessionDataService, RecordingCheckpointService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

// #region Test fakes

interface IStartCall {
	readonly token: string;
}

function reducerBackedEnablementChangeEvent(stateManager: AgentHostStateManager): Event<{ sessions: readonly string[] }> {
	return Event.map(
		Event.filter(stateManager.onDidEmitEnvelope, envelope =>
			envelope.action.type === ActionType.SessionCustomizationsChanged
			|| envelope.action.type === ActionType.SessionCustomizationUpdated
			|| envelope.action.type === ActionType.SessionCustomizationToggled
		),
		envelope => ({ sessions: [envelope.channel.toString()] }),
	);
}

/**
 * Enumerate the agent's live additional-chat backings for a session as
 * channel URI strings (backings AH did not stamp with a storage scope).
 * Replaces the removed `IAgent.getChats` for tests that assert additional-chat
 * lifecycle at the agent level (the orchestrator now owns the durable
 * catalog).
 */
function listAdditionalChats(agent: ClaudeAgent, session: URI): string[] {
	const backings = (agent as unknown as { _chatBackings: Map<string, { readonly sdkSessionId: string }> })._chatBackings;
	return [...backings].flatMap(([chat]) => !isDefaultChatUri(chat) && parseRequiredSessionUriFromChatUri(chat) === session.toString() ? [chat] : []);
}

function listLiveChats(agent: ClaudeAgent): string[] {
	const internals = agent as unknown as {
		_chatBackings: Map<string, { readonly sdkSessionId: string }>;
		_chatEntriesBySdkId: Map<string, unknown>;
	};
	return [...internals._chatBackings].flatMap(([chat, backing]) => internals._chatEntriesBySdkId.has(backing.sdkSessionId) ? [chat] : []);
}

function listSessionChatBackings(agent: ClaudeAgent): string[] {
	const index = (agent as unknown as {
		_chatBackings: Map<string, { readonly sdkSessionId: string }>;
	})._chatBackings;
	return [...index].flatMap(([chat]) => isDefaultChatUri(chat) ? [chat] : []);
}

function defaultChatUri(session: URI): URI {
	return URI.parse(buildDefaultChatUri(session));
}

/** Recovers the owning session id from a {@link IAgentChatMetadata.chat} default-chat URI. */
function sessionIdOfChat(chat: URI): string {
	return AgentSession.id(URI.parse(parseRequiredSessionUriFromChatUri(chat)));
}

function discoverClaudeCodeChats(agent: ClaudeAgent): Promise<IAgentChatMetadata[] | undefined> {
	return (agent as unknown as { _listClaudeCodeChats(): Promise<IAgentChatMetadata[] | undefined> })._listClaudeCodeChats();
}

/**
 * The host-owned {@link IAgentChatContext} Agent Host stamps on every addressed
 * chat operation, rebuilt here from the chat URI.
 *
 * The URI-shape derivation lives in the test harness on purpose: it stands in
 * for the orchestrator's `createAgentChatContext`, which is the only place in
 * the system allowed to derive these facts. The agent under test must consume
 * them and never re-derive them.
 */
function chatContext(chat: URI, overrides?: Partial<IAgentChatContext>): IAgentChatContext {
	const parsed = parseChatUri(chat);
	const session = parsed ? URI.parse(parsed.session) : chat;
	return {
		configurationResource: session,
		resource: isDefaultChatUri(chat) ? session : chat,
		...overrides,
	};
}

/**
 * Provisions a session the way Agent Host does: the host mints both the session
 * URI and the chat URI it starts the session with, and creates them together
 * through the single {@link IAgentChats.createChat} seam. Also surfaces the SDK
 * conversation id the provider bound to that chat — independent of the AH
 * session id — which tests need to drive the fake SDK.
 */
async function createSession(agent: ClaudeAgent, config: IAgentCreateSessionConfig = {}, chatOptions?: IAgentCreateChatOptions): Promise<IAgentCreateSessionResult & { readonly sdkSessionId: string }> {
	const session = config.session ?? AgentSession.uri('claude', generateUuid());
	const chat = defaultChatUri(session);
	const created = await createProviderSession(agent, chat, chatContext(chat), { ...config, session }, chatOptions);
	return { ...created, sdkSessionId: AgentSession.id(created.chat!.backingSession!) };
}

/**
 * Creates a session's first chat exactly like `AgentService._createProviderSession`:
 * the session's create config is flattened onto {@link IAgentCreateChatOptions},
 * and the host — not the provider — assembles the session-level result around
 * the flat chat result the provider returns.
 */
async function createProviderSession(agent: ClaudeAgent, chat: URI, context: IAgentChatContext, config: IAgentCreateSessionConfig, chatOptions?: IAgentCreateChatOptions): Promise<IAgentCreateSessionResult> {
	const result = await agent.chats.createChat(chat, context, {
		model: config.model,
		agent: config.agent,
		workingDirectories: config.workingDirectories,
		config: config.config,
		activeClient: config.activeClient,
		deferBacking: !chatOptions?.fork && !config.importConversation,
		importConversation: config.importConversation,
		...chatOptions,
	});
	if (!result) {
		throw new Error('Expected chat backing metadata');
	}
	return {
		session: config.session ?? context.configurationResource,
		...(result.project ? { project: result.project } : {}),
		...(result.resolvedWorkingDirectory ? { resolvedWorkingDirectory: result.resolvedWorkingDirectory } : {}),
		...(result.provisional ? { provisional: true } : {}),
		chat: result,
	};
}

/**
 * Unloads a session's default chat from memory the way Agent Host's idle
 * eviction does: the live runtime is dropped while the durable transcript and
 * the chat's exact backing survive, so the next send cold-resumes.
 */
async function releaseDefaultChat(agent: ClaudeAgent, session: URI): Promise<void> {
	const chat = defaultChatUri(session);
	await agent.chats.releaseChat(chat, chatContext(chat));
}

/**
 * Tears a session down the way Agent Host does: every catalog chat is disposed
 * through the chat surface — here the session-backed default chat. There is no
 * separate finalize step; trace-context release now lives solely in the exact
 * chat's own disposal (see `_disposeChat`).
 */
async function disposeSession(agent: ClaudeAgent, session: URI): Promise<void> {
	const chat = defaultChatUri(session);
	await agent.chats.disposeChat(chat, chatContext(chat));
}

/**
 * Restores a session's default chat the way Agent Host does for a legacy entry
 * that carries no persisted `providerData`: the migration seam recovers the
 * historical identity and normal materialization consumes the canonical data.
 */
async function bindDefaultChat(agent: ClaudeAgent, session: URI): Promise<void> {
	const chat = defaultChatUri(session);
	const recovered = await agent.recoverLegacyChat!(chat, chatContext(chat));
	await agent.materializeChat!(chat, chatContext(chat), recovered.providerData);
}

/**
 * The host's last published customization snapshot for a session — what
 * `AgentService`/`AgentSideEffects` hand to `getChatCustomizations` and
 * `getOrCreateActiveClient`. `undefined` means the host has published none
 * yet, which is deliberately distinct from an empty list.
 */
function hostCustomizations(stateManager: AgentHostStateManager, session: URI): readonly Customization[] | undefined {
	return stateManager.getSessionState(session.toString())?.customizations;
}

/**
 * The way Agent Host addresses `getOrCreateActiveClient`: one call per exact
 * chat, with that chat's own host-supplied context. There is no membership
 * argument — a client contributing to several chats gets one call (and
 * handle) per chat.
 */
function getOrCreateActiveClient(agent: ClaudeAgent, chat: URI, clientId: string, hostCustomizations?: readonly Customization[]): IActiveClient {
	return agent.getOrCreateActiveClient(chat, chatContext(chat), { clientId }, hostCustomizations);
}

/**
 * Pushes a client's plugin customizations the way production does for a
 * session's default chat: Agent Host hands the provider the exact chat (and
 * the session's customization snapshot) through the active-client fan-out,
 * and the sync then lands on that one chat. The provider never synthesizes
 * membership or a default chat itself — this helper picks the default chat
 * explicitly, the way a real fan-out over a session with only its default
 * chat would.
 */
async function syncClientCustomizations(agent: ClaudeAgent, stateManager: AgentHostStateManager, session: URI, clientId: string, customizations: ClientPluginCustomization[]): Promise<ISyncedCustomization[]> {
	const chat = defaultChatUri(session);
	const context = chatContext(chat);
	agent.getOrCreateActiveClient(chat, context, { clientId }, hostCustomizations(stateManager, session));
	return agent.syncClientCustomizations(chat, context, clientId, customizations);
}

/**
 * The resolved placement Agent Host stamps on every chat creation: the
 * complete working-directory set plus the session's provider config. Flattened
 * onto {@link IAgentCreateChatOptions} — there is no inherited-context wrapper
 * and no separate initialization shape.
 */
function resolvedChatOptions(workingDirectories: readonly URI[] = [URI.file('/work')], config?: Record<string, unknown>): IAgentCreateChatOptions {
	return { workingDirectories, ...(config ? { config } : {}) };
}

async function startActiveTurn(disposables: Pick<DisposableStore, 'add'>, ctx: ITestContext, session: URI, sessionId: string): Promise<void> {
	const turnActive = new DeferredPromise<void>();
	const finishTurn = new DeferredPromise<void>();
	ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
	ctx.sdk.queryAdvance = async index => {
		if (index === 1) {
			turnActive.complete();
			await finishTurn.p;
		}
	};
	const sendPromise = ctx.agent.chats.sendMessage(defaultChatUri(session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(session)));
	await turnActive.p;
	disposables.add(toDisposable(() => {
		finishTurn.complete();
		void sendPromise.catch(() => { });
	}));
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

	/**
	 * When set, {@link start} rejects with this error instead of returning a
	 * handle — models a transient proxy-startup failure. The token is still
	 * recorded in {@link startCalls} before the throw so tests can assert the
	 * attempt was made.
	 */
	startError: Error | undefined;

	/** Tests fire this to simulate a per-request CAPI credits report. */
	readonly onDidReportCreditsEmitter = new Emitter<IClaudeProxyCreditsReport>();
	readonly onDidReportCredits: Event<IClaudeProxyCreditsReport> = this.onDidReportCreditsEmitter.event;

	async start(token: string): Promise<IClaudeProxyHandle> {
		this.startCalls.push({ token });
		if (this.startError) {
			throw this.startError;
		}
		return {
			baseUrl: 'http://127.0.0.1:0',
			nonce: `nonce-for-${token}`,
			dispose: () => { this.disposeCount++; },
		};
	}

	dispose(): void { this.onDidReportCreditsEmitter.dispose(); }
}

class FakeAgentHostAuthenticationService implements IAgentHostAuthenticationService {
	declare readonly _serviceBrand: undefined;
	private readonly _tokens = new Map<string, string>();
	private readonly _onDidChangeAuthToken = new Emitter<IAgentHostAuthTokenChangeEvent>();
	readonly onDidChangeAuthToken = this._onDidChangeAuthToken.event;

	setToken(resource: string, token: string): void {
		const previous = this._tokens.get(resource);
		if (token) {
			this._tokens.set(resource, token);
		} else {
			this._tokens.delete(resource);
		}
		const current = this._tokens.get(resource);
		if (previous !== current) {
			this._onDidChangeAuthToken.fire({ resource, scopes: [], token: current });
		}
	}

	getAuthToken(request: Parameters<IAgentHostAuthenticationService['getAuthToken']>[0]): string | undefined {
		return this._tokens.get(request.resource);
	}

	dispose(): void {
		this._onDidChangeAuthToken.dispose();
	}
}

function connectAuthentication(agent: ClaudeAgent, authenticationService: FakeAgentHostAuthenticationService): void {
	const authenticate = agent.authenticate.bind(agent);
	agent.authenticate = async (resource, token) => {
		const authenticated = await authenticate(resource, token);
		if (authenticated) {
			authenticationService.setToken(resource, token);
		}
		return authenticated;
	};
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
	resolveApiEndpoint() { return Promise.resolve('https://api.githubcopilot.com'); }
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
	mcpToggleGate: Promise<void> | undefined;

	/** Phase 19 — programmable native model enumeration. */
	supportedModelsResult: ModelInfo[] = [];
	supportedModelsCallCount = 0;
	readonly supportedModelsOptions: Options[] = [];

	/**
	 * Programmable `accountInfo()` report. Defaults to the shape measured on a
	 * machine with nothing configured, so a test that does not opt in gets the
	 * honest "no account" answer; {@link NATIVE_ACCOUNT} is the opt-in.
	 */
	accountInfoResult: AccountInfo = { tokenSource: 'none', apiProvider: 'firstParty' };
	accountInfoCallCount = 0;

	/**
	 * Optional gate awaited by {@link FakeQuery.supportedModels} before it
	 * resolves. Lets a test park the native half of a merged refresh mid-flight
	 * (the call is counted before the await, so `supportedModelsCallCount`-based
	 * waits still fire) to stage a refresh race. Resolves immediately when
	 * undefined.
	 */
	supportedModelsGate: Promise<void> | undefined;

	/**
	 * Programmable rejection for the native half of a merged refresh. Distinct
	 * from a *fulfilled* empty enumeration, which is an honest "no native models";
	 * a rejection is "we could not find out".
	 */
	supportedModelsRejection: Error | undefined;

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

	ensureAvailableCalls = 0;
	async ensureAvailable(): Promise<void> {
		this.ensureAvailableCalls++;
		if (this.ensureAvailableRejection) {
			throw this.ensureAvailableRejection;
		}
		// Deliberately does NOT flip {@link canLoadWithoutDownloadResult}: a real
		// fetch takes seconds, so tests stage that flip themselves when they
		// release the gate.
		await this.ensureAvailableGate;
	}

	/** Optional gate awaited by {@link ensureAvailable}, so a test can park a download mid-flight. */
	ensureAvailableGate: Promise<void> | undefined;

	/** Programmable failure for an explicit download (dead CDN, disk full). */
	ensureAvailableRejection: Error | undefined;

	/**
	 * Programmable result for {@link canLoadWithoutDownload}. Defaults to
	 * `true` (SDK already local). Set to `false` to simulate the cold-start
	 * case where the SDK isn't downloaded yet — restore-reachable reads
	 * ({@link getSessionInfo} via `getChatMetadata`, {@link getSessionMessages})
	 * MUST defer rather than trigger a download.
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
	readonly toolHandlers = new Map<string, (args: any, extra: unknown) => Promise<CallToolResult>>();
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
		this.toolHandlers.set(name, _handler);
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
	readonly mcpToggleCalls: Array<{ serverName: string; enabled: boolean }> = [];
	readonly mcpReconnectCalls: string[] = [];
	mcpServerStatusCallCount = 0;

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

	async interrupt(): Promise<SDKControlInterruptResponse | undefined> {
		this.interruptCount++;
		return undefined;
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
		if (this._sdk.supportedModelsRejection) {
			return Promise.reject(this._sdk.supportedModelsRejection);
		}
		const gate = this._sdk.supportedModelsGate;
		return gate ? gate.then(() => this._sdk.supportedModelsResult) : Promise.resolve(this._sdk.supportedModelsResult);
	}
	supportedAgents(): never {
		if (this._sdk.supportedAgentsResult === undefined) { throw new Error('FakeQuery: supportedAgents not modeled'); }
		return Promise.resolve(this._sdk.supportedAgentsResult) as never;
	}
	mcpServerStatus(): never {
		this.mcpServerStatusCallCount++;
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
	accountInfo(): Promise<AccountInfo> {
		this._sdk.accountInfoCallCount++;
		return Promise.resolve(this._sdk.accountInfoResult);
	}
	rewindFiles(): never { throw new Error('FakeQuery: rewindFiles not modeled'); }
	readFile(): never { throw new Error('FakeQuery: readFile not modeled'); }
	seedReadState(): never { throw new Error('FakeQuery: seedReadState not modeled'); }
	reconnectMcpServer(serverName: string): never {
		this.mcpReconnectCalls.push(serverName);
		return Promise.resolve() as never;
	}
	toggleMcpServer(serverName: string, enabled: boolean): never {
		this.mcpToggleCalls.push({ serverName, enabled });
		return (async () => {
			await this._sdk.mcpToggleGate;
			if (this._sdk.mcpServerStatusResult) {
				this._sdk.mcpServerStatusResult = this._sdk.mcpServerStatusResult.map(server =>
					server.name === serverName ? { ...server, status: enabled ? 'connected' : 'disabled' } : server
				);
			}
		})() as never;
	}
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

/**
 * Records `emitSessionTitleChanged` invocations so the OTel title-span wiring
 * test can assert what the agent forwarded to the host telemetry pipeline. All
 * other {@link IAgentHostOTelService} members are inert no-ops.
 */
class RecordingOTelService implements IAgentHostOTelService {
	readonly _serviceBrand: undefined;
	readonly titleChanges: Array<{ conversationId: string; sessionUri: string; title: string }> = [];
	async getSdkTelemetryConfig(): Promise<undefined> { return undefined; }
	async getNativeSdkTelemetryConfig(): Promise<undefined> { return undefined; }
	getSessionTraceContext(): undefined { return undefined; }
	releaseSessionTraceContext(): void { }
	withTraceContext<T>(_context: undefined, fn: () => T): T { return fn(); }
	getCurrentTraceContext(): undefined { return undefined; }
	getSpansDbPath(): undefined { return undefined; }
	emitSessionTitleChanged(conversationId: string, sessionUri: string, title: string): void {
		this.titleChanges.push({ conversationId, sessionUri, title });
	}
	async flush(): Promise<void> { }
}

interface ITestContext {
	readonly agent: ClaudeAgent;
	readonly proxy: FakeClaudeProxyService;
	readonly api: FakeCopilotApiService;
	readonly sdk: FakeClaudeAgentSdkService;
	readonly sessionData: RecordingSessionDataService;
	readonly stateManager: AgentHostStateManager;
	readonly configService: AgentConfigurationService;
	readonly otelService: RecordingOTelService;
	readonly instantiationService: IInstantiationService;
	readonly fileService: IFileService;
	readonly sdkDownloader: RecordingAgentSdkDownloader;
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
	overrides?: { logService?: ILogService; database?: TestSessionDatabase; sessionDataService?: ISessionDataService; rootConfig?: Record<string, unknown>; userHome?: URI; gitHubEndpointService?: IAgentHostGitHubEndpointService; checkpointService?: IAgentHostCheckpointService; nativeAccount?: AccountInfo },
): ITestContext {
	const proxy = new FakeClaudeProxyService();
	const api = new FakeCopilotApiService();
	api.models = async () => [...ALL_MODELS];
	const sdk = new FakeClaudeAgentSdkService();
	// Staged before the agent is constructed: its ctor queues the first model
	// refresh, which is what asks for the account.
	if (overrides?.nativeAccount) {
		sdk.accountInfoResult = overrides.nativeAccount;
	}
	const sessionData = new RecordingSessionDataService(
		overrides?.sessionDataService
		?? (overrides?.database
			? createSessionDataService(overrides.database)
			: createSessionDataService())
	);
	const logService = overrides?.logService ?? new NullLogService();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
	const authenticationService = disposables.add(new FakeAgentHostAuthenticationService());

	// In-memory file service the session's customization scan / agent-name
	// resolution runs against; exposed so tests can seed `.claude/**` files.
	const fileService = disposables.add(new FileService(new NullLogService()));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));

	const otelService = new RecordingOTelService();
	const sdkDownloader = new RecordingAgentSdkDownloader();
	const services = new ServiceCollection(
		[IFileService, fileService],
		[INativeEnvironmentService, { userHome: overrides?.userHome ?? URI.file('/mock-home') } as INativeEnvironmentService],
		[ILogService, logService],
		[ICopilotApiService, api],
		[IClaudeProxyService, proxy],
		[ISessionDataService, sessionData],
		[IClaudeAgentSdkService, sdk],
		[IAgentSdkDownloader, sdkDownloader],
		[IAgentPluginManager, new FakeAgentPluginManager()],
		[IAgentHostGitService, createNoopGitService()],
		[IAgentHostCheckpointService, overrides?.checkpointService ?? NULL_CHECKPOINT_SERVICE],
		[IAgentConfigurationService, configService],
		[IAgentHostStateManager, stateManager],
		[IAgentHostCustomizationEnablementService, reducerBackedEnablementService(stateManager)],
		[IAgentHostSessionTitleSignal, disposables.add(new AgentHostSessionTitleSignal(stateManager))],
		[IAgentHostOTelService, otelService],
		[IProductService, FakeProductService],
		[IAgentHostGitHubEndpointService, overrides?.gitHubEndpointService ?? createTestGitHubEndpointService()],
		[IAgentHostAuthenticationService, authenticationService],
	);
	const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
	// Seed root config (e.g. `allowSignedOutWhenUsable`) BEFORE the agent
	// resolves its transport mode in the constructor.
	if (overrides?.rootConfig) {
		configService.updateRootConfig(overrides.rootConfig);
	}
	const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
	connectAuthentication(agent, authenticationService);
	// Mirrors exactly what Agent Host stamps on every addressed chat
	// operation: `createAgentChatContext` is the orchestrator's single
	// derivation, so the agent under test always receives the same exhaustive
	// facts (kind, catalog origin, session customization snapshot) it gets in
	// production. A context a test passes explicitly layers on top.
	const toChatContext = (chat: URI, context?: URI | IAgentChatContext): IAgentChatContext => {
		const explicit = context && !URI.isUri(context) ? context : undefined;
		const session = explicit?.configurationResource
			?? (context && URI.isUri(context) ? context : undefined)
			?? (chat.scheme === 'ahp-chat' ? URI.parse(parseRequiredSessionUriFromChatUri(chat.toString())) : chat);
		return { ...createAgentChatContext(stateManager, session, chat), ...explicit };
	};
	const chats = agent.chats as {
		createChat: typeof agent.chats.createChat;
		sendMessage: typeof agent.chats.sendMessage;
		changeModel: typeof agent.chats.changeModel;
		changeAgent: typeof agent.chats.changeAgent;
		getMessages: typeof agent.chats.getMessages;
	};
	const createChat = chats.createChat.bind(agent.chats);
	chats.createChat = (chat, context, options) => createChat(chat, toChatContext(chat, context), options);
	const sendMessage = chats.sendMessage.bind(agent.chats);
	chats.sendMessage = (chat, prompt, workingDirectoriesOrDirectory, attachments, turnId, senderClientId, clientTypeOrContext, context) => {
		const explicitContext = context ?? (typeof clientTypeOrContext === 'string' ? undefined : clientTypeOrContext);
		const clientType = typeof clientTypeOrContext === 'string' ? clientTypeOrContext : undefined;
		return sendMessage(chat, prompt, workingDirectoriesOrDirectory, attachments, turnId, senderClientId, clientType, toChatContext(chat, explicitContext));
	};
	const changeModel = chats.changeModel.bind(agent.chats);
	chats.changeModel = (chat, model, context) => changeModel(chat, model, toChatContext(chat, context));
	const changeAgent = chats.changeAgent.bind(agent.chats);
	chats.changeAgent = (chat, nextAgent, context) => changeAgent(chat, nextAgent, toChatContext(chat, context));
	const getMessages = chats.getMessages.bind(agent.chats);
	chats.getMessages = (chat, context) => getMessages(chat, toChatContext(chat, context));
	return { agent, proxy, api, sdk, sessionData, stateManager, configService, otelService, instantiationService, fileService, sdkDownloader };
}

/** Drains the microtask queue so awaited refresh writes settle. */
function tick(): Promise<void> {
	return new Promise(resolve => setImmediate(resolve));
}

/**
 * The SDK account report of a user signed in on their own credentials — the
 * `claude login` / keychain case no filesystem check could ever see. Pass as
 * `nativeAccount` to make an agent publish native models.
 */
const NATIVE_ACCOUNT: AccountInfo = { tokenSource: 'ANTHROPIC_AUTH_TOKEN', apiProvider: 'firstParty' };


/**
 * A two-turn source transcript (`u1`/`a1`, `u2`/`a2`) used by the Phase 6.5
 * fork tests. Forking at `u1` keeps `[u1]` inclusive, anchored on that turn's
 * last assistant envelope `a1`.
 */
function forkSourceMessages(sourceId: string): SessionMessage[] {
	return [
		{ type: 'user', uuid: 'u1', session_id: sourceId, parent_tool_use_id: null, parent_agent_id: null, message: { role: 'user', content: [{ type: 'text', text: 'apple' }] } },
		{ type: 'assistant', uuid: 'a1', session_id: sourceId, parent_tool_use_id: null, parent_agent_id: null, message: { id: 'msg_a1', role: 'assistant', content: [{ type: 'text', text: 'apple!' }] } },
		{ type: 'user', uuid: 'u2', session_id: sourceId, parent_tool_use_id: null, parent_agent_id: null, message: { role: 'user', content: [{ type: 'text', text: 'banana' }] } },
		{ type: 'assistant', uuid: 'a2', session_id: sourceId, parent_tool_use_id: null, parent_agent_id: null, message: { id: 'msg_a2', role: 'assistant', content: [{ type: 'text', text: 'banana!' }] } },
	];
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

function createTestAgentStateServices(disposables: Pick<DisposableStore, 'add'>): ConstructorParameters<typeof ServiceCollection> {
	const logService = new NullLogService();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	return [
		[IAgentConfigurationService, disposables.add(new AgentConfigurationService(stateManager, logService))],
		[IAgentHostStateManager, stateManager],
		[IAgentHostSessionTitleSignal, disposables.add(new AgentHostSessionTitleSignal(stateManager))],
		[IAgentHostOTelService, new RecordingOTelService()],
		[IAgentHostCustomizationEnablementService, reducerBackedEnablementService(stateManager)],
		[IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
		// Every test ClaudeAgent's always-on merged model refresh reads `userHome`
		// at construction, so a mock environment service is part of the baseline.
		[INativeEnvironmentService, { userHome: URI.file('/mock-home') } as INativeEnvironmentService],
	];
}

function reducerBackedEnablementService(stateManager: AgentHostStateManager): ICustomizationEnablementService {
	const resolve = (session: string, target: { readonly id: string; readonly name: string; readonly source: URI }) => {
		const customizations = stateManager.getSessionState(session)?.customizations ?? [];
		const customization = customizations
			.flatMap(item => [item, ...(item.type === CustomizationType.McpServer ? [] : item.children ?? [])])
			.find(item => item.id === target.id || (item.name === target.name && item.uri === target.source.toString()));
		const enablement = customization?.type === CustomizationType.Plugin || customization?.type === CustomizationType.McpServer
			? customization.enablement ?? []
			: [];
		return {
			kind: 'resolved' as const,
			enablement,
			enabled: isCustomizationEnabled({ enablement }),
			workingDirectory: { kind: 'workspaceless' as const },
		};
	};
	return {
		_serviceBrand: undefined,
		onDidChange: reducerBackedEnablementChangeEvent(stateManager),
		initializeSession: async () => { },
		getWorkingDirectoryState: () => ({ kind: 'workspaceless' }),
		resolve,
		applyClientGlobalEnablement: resolve,
		replaceEnablement: resolve,
		setEnablement: resolve,
		whenIdle: async () => { },
	};
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

	test('advertises multipleWorkingDirectories only when the hidden setting is enabled', () => {
		const { agent, configService } = createTestContext(disposables);
		const disabledByDefault = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
		configService.updateRootConfig({ [AgentHostClaudeMultiRootEnabledConfigKey]: true });
		const whenEnabled = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
		configService.updateRootConfig({ [AgentHostClaudeMultiRootEnabledConfigKey]: false });
		const afterDisabling = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
		assert.deepStrictEqual({ disabledByDefault, whenEnabled, afterDisabling }, {
			disabledByDefault: undefined,
			whenEnabled: { immutablePrimary: true },
			afterDisabling: undefined,
		});
	});

	test('selects provider-native autonomous session config and respects policy', () => {
		const { agent, configService } = createTestContext(disposables);
		const selected = agent.getAutonomousSessionConfig({});
		configService.updateRootConfig({ [AgentHostAutoApprovePolicyRestrictedConfigKey]: true });
		const restricted = agent.getAutonomousSessionConfig({});

		assert.deepStrictEqual({ selected, restricted }, {
			selected: { [ClaudeSessionConfigKey.PermissionMode]: 'auto' },
			restricted: undefined,
		});
	});

	test('getProtectedResources returns the GitHub resource', () => {
		const { agent } = createTestContext(disposables);
		assert.deepStrictEqual(agent.getProtectedResources(), [{
			resource: 'https://api.github.com',
			resource_name: 'GitHub Copilot',
			authorization_servers: ['https://github.com/login/oauth'],
			scopes_supported: ['read:user', 'user:email'],
			// Shape check; the `required` flag itself is the subject of
			// 'the Copilot resource is unconditionally optional […]'.
			required: false,
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

	test('signed-in probe flips inferred-native to proxy (allowSignedOutWhenUsable)', async () => {
		// The fix for the startup catch-22: with the exp flag on and the SDK
		// reporting a Claude account, a signed-OUT user resolves to native — which
		// still advertises the Copilot resource as not-required so the host can
		// probe. If the host then silently forwards a GitHub token (the user was
		// signed in all along), the acquired proxy handle re-resolves the default
		// (rule 2: signed in ⇒ proxy) and flips the transport to proxy, starting
		// the proxy.
		const { agent, proxy } = createTestContext(disposables, {
			rootConfig: { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true },
			nativeAccount: NATIVE_ACCOUNT,
		});
		// Signed out at startup ⇒ native, Copilot advertised as not-required.
		const before = {
			resources: agent.getProtectedResources().map(r => ({ resource: r.resource, required: r.required })),
			proxyStarts: proxy.startCalls.length,
		};

		// Host probe forwards a GitHub token (user was signed in) ⇒ flip to proxy.
		await agent.authenticate('https://api.github.com', 'gh-token');
		await tick();

		assert.deepStrictEqual({
			before,
			after: {
				resources: agent.getProtectedResources().map(r => ({ resource: r.resource, required: r.required })),
				proxyStarts: proxy.startCalls.length,
			},
		}, {
			before: {
				resources: [
					{ resource: 'https://api.github.com', required: false },
					{ resource: 'https://api.github.com/repos', required: false },
				],
				proxyStarts: 0,
			},
			after: {
				resources: [
					{ resource: 'https://api.github.com', required: false },
					{ resource: 'https://api.github.com/repos', required: false },
				],
				proxyStarts: 1,
			},
		});
	});

	test('coalesces concurrent refreshModels calls onto one CAPI models request', async () => {
		const { agent, api } = createTestContext(disposables);
		// Block the first request in flight so the second caller has something
		// to coalesce onto: a periodic scheduler tick landing on top of an
		// auth-triggered refresh must not double-hit the service.
		const gate = new DeferredPromise<void>();
		let modelsCalls = 0;
		api.models = async () => { modelsCalls++; await gate.p; return [...ALL_MODELS]; };
		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		const first = agent.refreshModels();
		const second = agent.refreshModels();
		gate.complete();
		await Promise.all([first, second]);

		assert.deepStrictEqual({
			modelsCalls,
			hasModels: agent.models.get().length > 0,
		}, {
			modelsCalls: 1,
			hasModels: true,
		});
	});

	test('keeps the last known-good models only when every attempted source fails', async () => {
		// Retention is all-or-nothing across the merged catalog: a source that
		// *answers* is authoritative for its own half. Asking the SDK on every
		// refresh widened where that bites — a Copilot-only user used to skip the
		// native half entirely, so a CAPI hiccup held their picker; now the native
		// half answers "no account" and the merged write drops the stale rows.
		const { agent, api, sdk } = createTestContext(disposables);
		api.models = async () => [...ALL_MODELS];
		await agent.authenticate('https://api.github.com', 'tok');
		await agent.refreshModels();
		const populated = agent.models.get().map(model => model.id);

		// Only the proxy fails; the native half answers honestly (no account, so no
		// models) and that answer is published.
		api.models = async () => { throw new Error('transient failure'); };
		await agent.refreshModels();
		const proxyOnlyFailed = agent.models.get().map(model => model.id);

		// Now nothing can answer: the catalog is held rather than blanked again.
		api.models = async () => [...ALL_MODELS];
		await agent.refreshModels();
		const republished = agent.models.get().map(model => model.id);
		api.models = async () => { throw new Error('transient failure'); };
		sdk.supportedModelsRejection = new Error('sdk subprocess died');
		await agent.refreshModels();

		assert.deepStrictEqual({
			populated,
			proxyOnlyFailed,
			republished,
			bothFailed: agent.models.get().map(model => model.id),
		}, {
			populated: [
				toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4.6'),
				toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-sonnet-4.6'),
			],
			proxyOnlyFailed: [],
			republished: [
				toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4.6'),
				toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-sonnet-4.6'),
			],
			bothFailed: [
				toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4.6'),
				toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-sonnet-4.6'),
			],
		});
	});

	test('clears models when enumeration for a replacement token fails', async () => {
		const { agent, api } = createTestContext(disposables);
		api.models = async token => {
			if (token === 'tokB') {
				throw new Error('token B failure');
			}
			return [...ALL_MODELS];
		};
		await agent.authenticate('https://api.github.com', 'tokA');
		await agent.refreshModels();

		await agent.authenticate('https://api.github.com', 'tokB');
		await agent.refreshModels();

		assert.deepStrictEqual(agent.models.get(), []);
	});

	test('first sign-in keeps the native catalog published while the proxy catalog enumerates', async () => {
		// The window gate reads an agent with no models as `Unusable`, so a *first*
		// sign-in must never blank the bootstrap native catalog: it has no
		// superseded account to drop, and blanking would close the
		// `allowSignedOutWhenUsable` gate mid-startup and force the sign-in dialog
		// on a user who is already signing in.
		const { agent, api, sdk } = createTestContext(disposables, { nativeAccount: NATIVE_ACCOUNT });
		sdk.supportedModelsResult = [
			{ value: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', description: '', supportedEffortLevels: ['high'] },
		];
		// The constructor's bootstrap refresh publishes native-only (no token yet).
		for (let i = 0; i < 100 && agent.models.get().length === 0; i++) {
			await tick();
		}
		const bootstrap = agent.models.get().map(model => model.name);

		// Hold the CAPI enumeration open so the post-sign-in refresh is still in
		// flight when we sample the catalog — that pending window is exactly what
		// the renderer saw as an empty (and therefore `Unusable`) agent.
		const gate = new DeferredPromise<void>();
		api.models = async () => { await gate.p; return [...ALL_MODELS]; };
		await agent.authenticate('https://api.github.com', 'tok');
		const whileEnumerating = agent.models.get().map(model => model.name);

		gate.complete();
		await agent.refreshModels();

		assert.deepStrictEqual({
			bootstrap,
			whileEnumerating,
			merged: agent.models.get().map(model => model.name),
		}, {
			bootstrap: ['Claude Sonnet 4.5'],
			whileEnumerating: ['Claude Sonnet 4.5'],
			merged: ['Claude Opus 4.6', 'Claude Sonnet 4.6', 'Claude Sonnet 4.5'],
		});
	});

	test('signed out with an SDK-reported account: models populate from supportedModels() with no proxy start and no CAPI models() call', async () => {
		// Native enumeration only publishes when the SDK's own account report says
		// the user is set up, so hand it one. Signed out, so the proxy half of the
		// merged catalog contributes nothing.
		const { agent, proxy, api, sdk } = createTestContext(disposables, { nativeAccount: NATIVE_ACCOUNT });
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
			models: [{ id: toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-sonnet-4-5-20250929'), name: 'Claude Sonnet 4.5' }],
			proxyStarts: 0,
			supportedModelsCalls: 1,
			capiModelsCalls: 0,
		});
	});

	test('the SDK default alias row is dropped from the native catalog', async () => {
		// `supportedModels()` includes a synthetic `default` row ("Default
		// (recommended)") that aliases whichever concrete model the CLI is
		// configured to use. Published next to the Copilot-routed models it reads
		// as a third, unrelated choice whose target is invisible, so it is
		// filtered out — the model it resolves to is already its own row.
		const { agent, sdk } = createTestContext(disposables, { nativeAccount: NATIVE_ACCOUNT });
		sdk.supportedModelsResult = [
			{ value: 'default', resolvedModel: 'claude-sonnet-4-5-20250929', displayName: 'Default (recommended)', description: '' },
			{ value: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', description: '' },
		];
		for (let i = 0; i < 100 && sdk.supportedModelsCallCount === 0; i++) {
			await tick();
		}
		await tick();
		assert.deepStrictEqual(agent.models.get().map(m => ({ id: m.id, name: m.name })), [
			{ id: toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-sonnet-4-5-20250929'), name: 'Claude Sonnet 4.5' },
		]);
	});

	test('an SDK account report of "nothing configured" publishes an empty catalog instead of the SDK static list', async () => {
		// `supportedModels()` answers even with no credentials (it is a static
		// catalog), so publishing it would advertise models that fail on first
		// use — and would make the type look usable-without-GitHub to the window
		// gate. The gate is `accountInfo()`, not the model list: both are asked
		// (they are local, cheap calls against an already-present SDK) and the
		// account report is what decides whether the models are published.
		const { agent, sdk } = createTestContext(disposables);
		sdk.supportedModelsResult = [
			{ value: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', description: '' },
		];
		for (let i = 0; i < 100 && sdk.accountInfoCallCount === 0; i++) {
			await tick();
		}
		await tick();
		assert.deepStrictEqual({
			models: agent.models.get(),
			accountInfoCalls: sdk.accountInfoCallCount,
			supportedModelsCalls: sdk.supportedModelsCallCount,
		}, {
			models: [],
			accountInfoCalls: 1,
			supportedModelsCalls: 1,
		});
	});

	test('native model enumeration closes the throwaway query (no leaked subprocess)', async () => {
		const { sdk } = createTestContext(disposables, { nativeAccount: NATIVE_ACCOUNT });
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

	test('native-default authenticate still starts the proxy so Copilot-routed models can run', async () => {
		// With the merged catalog always on, a native default no longer short-
		// circuits sign-in: `authenticate` falls through to acquire a proxy handle
		// so a session that later picks a Copilot-routed model has a started proxy
		// to run against — even though the model-less default
		// (`_defaultTransportMode`) was native right up to this call.
		const { agent, proxy } = createTestContext(disposables, {
			rootConfig: { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true },
			nativeAccount: NATIVE_ACCOUNT,
		});
		const accepted = await agent.authenticate('https://api.github.com', 'tok');
		await tick();
		assert.deepStrictEqual({ accepted, proxyStarts: proxy.startCalls.length }, { accepted: true, proxyStarts: 1 });
	});

	test('a host-default transport flip no longer proactively demands auth (sign-in defers to first send)', async () => {
		// A host-default flip only changes the fallback transport for model-less
		// sessions; the merged catalog still publishes both providers and
		// `getProtectedResources()` keeps Copilot optional, so a flip must NOT fire
		// `auth/required`. Sign-in for a Copilot-routed model defers to the first
		// send, where `_ensureAuthenticated` throws `AHP_AUTH_REQUIRED`. Signing in
		// is the surviving runtime flip lever (native default → proxy default).
		const { agent } = createTestContext(disposables, {
			rootConfig: { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true },
			nativeAccount: NATIVE_ACCOUNT,
		});
		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.strictEqual((agent as IAgent).authenticationRequired, undefined);
	});

	test('construction in proxy mode does not emit auth/required', async () => {
		const { agent } = createTestContext(disposables);

		await tick();

		assert.strictEqual((agent as IAgent).authenticationRequired, undefined);
	});

	test('re-authenticating an unchanged token starts the proxy when a prior start left no handle', async () => {
		// authenticate() always attempts the proxy on sign-in (so the merged
		// catalog's Copilot models are runnable). A proxy-start failure is soft: it
		// leaves BOTH the token and the handle unset. Re-authenticating with the
		// SAME token must therefore retry start() — the uncommitted token reads as
		// new, not as an "unchanged" short-circuit (which is additionally guarded by
		// `&& this._proxyHandle`).
		const { agent, proxy } = createTestContext(disposables);
		let failNext = true;
		proxy.start = async (token: string) => {
			proxy.startCalls.push({ token });
			if (failNext) {
				failNext = false;
				throw new Error('proxy bind failed');
			}
			return { baseUrl: 'http://127.0.0.1:0', nonce: `nonce-for-${token}`, dispose: () => { proxy.disposeCount++; } };
		};

		// First authenticate: start fails softly, leaving token 'T' uncommitted and
		// no handle.
		await agent.authenticate('https://api.github.com', 'T');
		// Re-auth with the SAME token: uncommitted token ⇒ must retry start() (now succeeds).
		await agent.authenticate('https://api.github.com', 'T');
		await tick();

		assert.deepStrictEqual({
			startTokens: proxy.startCalls.map(c => c.token),
			disposeCount: proxy.disposeCount,
		}, { startTokens: ['T', 'T'], disposeCount: 0 });
	});

	test('createChat before authenticate throws ProtocolError(AHP_AUTH_REQUIRED) with protected resources', async () => {
		const { agent } = createTestContext(disposables);

		await assert.rejects(
			() => createSession(agent, { workingDirectories: [URI.file('/workspace')] }),
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
				{ provider: 'claude', id: toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4.6'), name: 'Claude Opus 4.6', maxContextWindow: 200_000, maxOutputTokens: 8192, maxPromptTokens: 200_000, supportsVision: false, policyState: 'enabled', _meta: { multiplierNumeric: 1, modelGroupId: CLAUDE_PROVIDER_COPILOT } },
				{ provider: 'claude', id: toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-sonnet-4.6'), name: 'Claude Sonnet 4.6', maxContextWindow: 200_000, maxOutputTokens: 8192, maxPromptTokens: 200_000, supportsVision: false, policyState: 'enabled', _meta: { multiplierNumeric: 1, modelGroupId: CLAUDE_PROVIDER_COPILOT } },
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
			modelGroupId: CLAUDE_PROVIDER_COPILOT,
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
			[
				toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-sonnet-4.6'),
				toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4.6'),
				toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-haiku-4.6'),
			],
		);
	});

	test('authenticate sources configSchema enum from each model\'s reasoning_effort list (Phase 6.1 / Cycle D3 / I5)', async () => {
		// Per Phase 6.1 plan D3 + CONTEXT.md M12 (line ~1802): the
		// `configSchema.properties.thinkingLevel.enum` advertised on each
		// Claude model must come from that model's own
		// `capabilities.supports.reasoning_effort` list — different
		// Claude models support different effort subsets (some
		// `['low','medium','high']`, some `['high']`, some none at all).
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
			[toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4.6')]: {
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
			[toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-sonnet-4.6')]: {
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
			[toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-haiku-4.6')]: undefined,
			[toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4.5')]: {
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
			[toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-sonnet-4.5')]: undefined,
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

	test('revoking authentication disposes the Copilot proxy and clears its models', async () => {
		const { agent, proxy } = createTestContext(disposables);
		await agent.authenticate('https://api.github.com', 'tok');
		await tick();
		assert.ok(agent.models.get().length > 0);

		const accepted = await agent.authenticate('https://api.github.com', '');
		await tick();

		assert.deepStrictEqual({
			accepted,
			githubToken: agent['_githubToken'],
			proxyHandle: agent['_proxyHandle'],
			startTokens: proxy.startCalls.map(call => call.token),
			disposeCount: proxy.disposeCount,
			models: agent.models.get(),
		}, {
			accepted: true,
			githubToken: undefined,
			proxyHandle: undefined,
			startTokens: ['tok'],
			disposeCount: 1,
			models: [],
		});
	});

	test('authenticate retries proxy startup after a transient failure', async () => {
		// Regression: a previous implementation set `_githubToken = token`
		// before awaiting `start()`. If start threw, the token was recorded
		// but no proxy was running, and the next authenticate() call with
		// the same token took the "unchanged" path and falsely returned
		// true. The corrected ordering leaves BOTH `_githubToken` and
		// `_proxyHandle` unset when start() throws (a soft failure), so a
		// retry still sees the token as new and re-attempts start().
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
			...createTestAgentStateServices(disposables),
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IAgentHostGitService, createNoopGitService()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		// A proxy-start failure is soft: GitHub sign-in still succeeds. The
		// token and handle stay uncommitted, so the merged refresh that the
		// soft path kicks off self-gates its proxy source to empty (and this
		// fixture has no native setup), leaving the catalog empty.
		const firstAccepted = await agent.authenticate('https://api.github.com', 'tok');
		await tick();
		assert.deepStrictEqual(agent.models.get(), []);

		// Retry with the SAME token MUST attempt start() again — the soft
		// failure left the token uncommitted, so this is seen as a new token
		// rather than short-circuited as "unchanged".
		const accepted = await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.deepStrictEqual({
			firstAccepted,
			accepted,
			startTokens: proxy.startCalls.map(c => c.token),
			disposeCount: proxy.disposeCount,
			modelIds: agent.models.get().map(m => m.id),
		}, {
			firstAccepted: true,
			accepted: true,
			startTokens: ['tok', 'tok'],
			disposeCount: 0,
			modelIds: [toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, CLAUDE_OPUS.id), toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, CLAUDE_SONNET.id)],
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
			[
				toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4.6'),
				toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-sonnet-4.6'),
			],
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
			...createTestAgentStateServices(disposables),
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader()],
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
		await agent.chats.abort(chat, chatContext(chat));
		await agent.chats.changeModel(chat, { id: 'claude-opus-4.6' }, chatContext(chat));
	});

	test('AgentService surfaces the registered ClaudeAgent in the providers map', () => {
		const { agent } = createTestContext(disposables);
		const fileService = disposables.add(new FileService(new NullLogService()));
		const service = disposables.add(createTestAgentService(
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
		const rootAgents = getTestAgentStateManager(service).rootState.agents;
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
			...createTestAgentStateServices(disposables),
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader()],
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
		assert.deepStrictEqual(agent.models.get().map(m => m.id), [toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, CLAUDE_SONNET.id)]);

		// Now unblock refresh-A: it must observe the rotated token and
		// drop its write rather than overwrite refresh-B's result.
		tokAModels.complete([CLAUDE_OPUS]);
		await tick();
		assert.deepStrictEqual(agent.models.get().map(m => m.id), [toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, CLAUDE_SONNET.id)]);
	});

	// #region Phase 5 — session lifecycle

	test('createChat (non-fork) mints a claude:/<uuid> backing with provisional: true; no DB or SDK contact', async () => {
		// Phase 6 §5.1 Test 1. Per-session DB is overlay/cache only and
		// the SDK subprocess fork is deferred until first sendMessage.
		// `provisional: true` opts the session into the AgentService's
		// deferred-`sessionAdded` protocol. Workbench eagerly creates
		// sessions on folder-pick + arms a 30s GC; for an empty Claude
		// session that's a cheap in-memory drop because nothing has
		// been persisted yet.
		const { agent, sdk, sessionData } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const result = await createSession(agent, { workingDirectories: [URI.parse('file:///workspace')] });

		assert.deepStrictEqual({
			scheme: result.session.scheme,
			provider: AgentSession.provider(result.session),
			isUuid: isUUID(result.sdkSessionId),
			workingDirectory: result.resolvedWorkingDirectory?.toString(),
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

	test('createChat without a workingDirectory materializes in a shared scratch dir (workspace-less quick chat)', async () => {
		// Regression: a workspace-less quick chat gave Claude no cwd, so it
		// threw "workingDirectory is required" at materialize. The scratch-dir
		// fallback is now shared with the Copilot agent.
		const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/claude-qc-home-`));
		const { agent, sdk } = createTestContext(disposables, { userHome });
		try {
			await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

			const created = await createSession(agent, {});
			const sessionId = created.sdkSessionId;
			// The scratch dir is keyed by the AH session id — the SDK
			// conversation id is minted independently by the chat seam.
			const expected = URI.joinPath(userHome, '.copilot', 'chats', AgentSession.id(created.session));
			assert.strictEqual(created.resolvedWorkingDirectory?.fsPath, expected.fsPath);
			await fs.access(expected.fsPath);

			// Drive materialize via the first send; before the fix this rejected
			// with "workingDirectory is required".
			sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
			await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
			assert.strictEqual(sdk.capturedStartupOptions.at(-1)?.cwd, expected.fsPath);
		} finally {
			await fs.rm(userHome.fsPath, { recursive: true, force: true });
		}
	});

	test('createProvisional creates a session without SDK startup contact', async () => {
		const { sdk, instantiationService } = createTestContext(disposables);

		const session = disposables.add(ClaudeAgentSession.createProvisional(
			'test-session',
			URI.parse(buildDefaultChatUri(AgentSession.uri('claude', 'test-session'))),
			URI.file('/workspace'),
			undefined,
			undefined,
			undefined,
			undefined,
			new PendingRequestRegistry<CallToolResult>(),
			'default',
			instantiationService,
		));

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			sessionId: session.sessionId,
			chat: session.chatChannelUri.toString(),
		}, {
			startupCallCount: 0,
			sessionId: 'test-session',
			chat: buildDefaultChatUri(AgentSession.uri('claude', 'test-session')),
		});
	});

	test('pipeline methods throw before materialize on provisional sessions', async () => {
		const { instantiationService } = createTestContext(disposables);
		const session = disposables.add(ClaudeAgentSession.createProvisional(
			'test-session',
			URI.parse(buildDefaultChatUri(AgentSession.uri('claude', 'test-session'))),
			URI.file('/workspace'),
			undefined,
			undefined,
			undefined,
			undefined,
			new PendingRequestRegistry<CallToolResult>(),
			'default',
			instantiationService,
		));

		await assert.rejects(
			session.send({
				type: 'user',
				message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
				session_id: 'test-session',
				parent_tool_use_id: null,
			}, 'turn-1', AgentSession.uri('claude', 'test-session')),
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
		const created = await createSession(agent, { workingDirectories: [URI.file('/work-resume')], model: initialModel });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		// Phase 2: user changes the model post-materialize — this hits the
		// runtime path inside session.setModel and rewrites the overlay.
		const updatedModel = { id: 'claude-opus-4.6', config: { thinkingLevel: 'medium' } };
		await agent.chats.changeModel(defaultChatUri(created.session), updatedModel, chatContext(defaultChatUri(created.session)));

		// Phase 3: simulate cross-window resume by tearing the in-memory
		// entry down and forcing the resume branch on the next send.
		await releaseDefaultChat(agent, created.session);
		sdk.sessionList = [{ sessionId, cwd: '/work-resume', summary: '', lastModified: Date.now() }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'turn 2', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

		// Phase 4: confirm the resume started the SDK with the updated model
		// from Phase 2. Model selection is no longer surfaced on
		// `IAgentChatMetadata`; the observable effect of the overlay is the
		// model the resume query is started with. If materialize wrote
		// unconditionally on resume, the SDK would start with the initial
		// materialize-time model instead.
		assert.deepStrictEqual(
			{ model: sdk.capturedStartupOptions.at(-1)?.model, effort: sdk.capturedStartupOptions.at(-1)?.effort },
			{ model: 'claude-opus-4-6', effort: 'medium' },
			'resume must not clobber the overlay model',
		);
	});

	test('captures the baseline checkpoint on fresh materialize but not on resume (parity with Copilot)', async () => {
		const checkpointService = new RecordingCheckpointService();
		const { agent, sdk } = createTestContext(disposables, { checkpointService });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const workDir = URI.file('/work-baseline');

		// Fresh materialize captures the baseline for the resolved directories.
		const created = await createSession(agent, { workingDirectories: [workDir] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', [workDir], undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		// Cross-window resume (dispose + second send) must NOT capture a late baseline.
		await releaseDefaultChat(agent, created.session);
		sdk.sessionList = [{ sessionId, cwd: workDir.fsPath, summary: '', lastModified: Date.now() }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'turn 2', [workDir], undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.deepStrictEqual(checkpointService.baselineCalls, [
			{ session: created.session.toString(), workingDirectories: [workDir.toString()] },
		]);
	});

	test('createChat honors the host-minted session URI', async () => {
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

		const result = await createSession(agent, { session: expected, workingDirectories: [URI.file('/work')] });

		assert.deepStrictEqual({
			session: result.session.toString(),
			provisional: result.provisional,
		}, {
			session: expected.toString(),
			provisional: true,
		});
	});

	test('createChat({ fork }) forks at the anchor uuid, then materializes lazily on first sendMessage', async () => {
		// Fork translates turnId u1 → its last-assistant uuid a1 (INCLUSIVE),
		// returns non-provisional WITHOUT starting the Query; the first
		// sendMessage resumes from disk (Options.resume) — see CONTEXT M9.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		const sourceUri = AgentSession.uri('claude', 'ah-source');
		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const events: IAgentMaterializeChatEvent[] = [];
		disposables.add(agent.onDidMaterializeChat(e => events.push(e)));
		await agent.materializeChat(defaultChatUri(sourceUri), { configurationResource: sourceUri, resource: sourceUri }, JSON.stringify({ sdkSessionId: sourceId }));

		// The fork binds the exact target chat directly, so the new AH session
		// id stays independent of the forked SDK conversation id.
		const result = await createSession(agent, {}, { fork: { source: defaultChatUri(sourceUri), turnId: 'u1' } });
		const newUri = result.session;

		// Snapshot fork-time state: file written, no Query, no materialize event.
		const atForkTime = {
			getMessagesCall: sdk.getSessionMessagesCalls[0],
			forkCall: sdk.forkSessionCalls[0],
			materializeCount: events.length,
			startupCount: sdk.capturedStartupOptions.length,
			resultSession: result.session.toString(),
			resultCwd: result.resolvedWorkingDirectory?.fsPath,
			provisional: result.provisional,
			forkedSdkId: result.sdkSessionId,
		};

		// First send resumes the forked file: the Query starts with `resume`.
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(defaultChatUri(newUri), 'next', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(newUri)));

		assert.deepStrictEqual({
			atForkTime,
			afterSend: {
				materializeCount: events.length,
				materializeUri: events[0]?.chat.toString(),
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
				forkedSdkId: 'forked-1',
			},
			afterSend: {
				materializeCount: 1,
				materializeUri: defaultChatUri(newUri).toString(),
				startupResume: 'forked-1',
				startupSessionId: undefined,
			},
		});
	});

	test('createChat({ fork }) ignores requested working directories and inherits the live source set', async () => {
		const { agent, sdk } = createTestContext(disposables, { rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourcePrimary = URI.file('/source-a');
		const sourceAdditional = URI.file('/source-b');
		const requestedPrimary = URI.file('/requested-a');
		const requestedAdditional = URI.file('/requested-b');
		const source = await createSession(agent, { workingDirectories: [sourcePrimary, sourceAdditional] });
		const sourceId = source.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sourceId), makeResultSuccess(sourceId)];
		await agent.chats.sendMessage(defaultChatUri(source.session), 'seed', [sourcePrimary, sourceAdditional], undefined, 'turn-source', undefined, undefined, chatContext(defaultChatUri(source.session)));

		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: sourcePrimary.fsPath }];
		await bindDefaultChat(agent, source.session);

		const forked = await createSession(agent, {
			workingDirectories: [requestedPrimary, requestedAdditional],
		}, { fork: { source: defaultChatUri(source.session), turnId: 'u1' } });
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(defaultChatUri(forked.session), 'continue', undefined, undefined, 'turn-fork', undefined, undefined, chatContext(defaultChatUri(forked.session)));

		assert.deepStrictEqual({
			cwd: sdk.capturedStartupOptions[1]?.cwd,
			additionalDirectories: sdk.capturedStartupOptions[1]?.additionalDirectories,
		}, {
			cwd: sourcePrimary.fsPath,
			additionalDirectories: [sourceAdditional.fsPath],
		});
	});

	test('createChat({ fork }) at the last turn anchors on that turn\'s assistant', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const source = AgentSession.uri('claude', sourceId);
		await bindDefaultChat(agent, source);
		await createSession(agent, {}, { fork: { source: defaultChatUri(source), turnId: 'u2' } });

		assert.deepStrictEqual(sdk.forkSessionCalls[0], { sessionId: sourceId, options: { upToMessageId: 'a2' } });
	});

	test('truncateChat(turnId) resolves the anchor, restarts at it on the same id, and prunes the DB', async () => {
		const database = new TestSessionDatabase();
		const { agent, sdk } = createTestContext(disposables, { database });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		sdk.sessionMessagesById.set(sessionId, forkSourceMessages(sessionId));
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		await agent.truncateChat(defaultChatUri(created.session), 'u1', chatContext(defaultChatUri(created.session)));
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.deepStrictEqual({
			startupCount: sdk.startupCallCount,
			rebuildResume: sdk.capturedStartupOptions[1]?.resume,
			rebuildResumeAt: sdk.capturedStartupOptions[1]?.resumeSessionAt,
			sameChat: agent.getSessionForTesting(created.session)?.chatChannelUri.toString() === defaultChatUri(created.session).toString(),
			prunedAfter: database.deleteTurnsAfterCalls,
			getMessagesCall: sdk.getSessionMessagesCalls.at(-1),
		}, {
			startupCount: 2,
			rebuildResume: sessionId,
			rebuildResumeAt: 'a1',
			sameChat: true,
			prunedAfter: ['u1'],
			getMessagesCall: { sessionId, options: { includeSystemMessages: true } },
		});
	});

	test('truncateChat cold-resumes an unloaded chat, then applies the anchor on the next turn', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		sdk.sessionMessagesById.set(sessionId, forkSourceMessages(sessionId));
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		// Unload the session from memory; the transcript stays resumable.
		await releaseDefaultChat(agent, created.session);
		assert.strictEqual(agent.getSessionForTesting(created.session), undefined, 'unloaded');
		sdk.sessionList = [{ sessionId, cwd: '/work', summary: '', lastModified: Date.now() }];

		await agent.truncateChat(defaultChatUri(created.session), 'u1', chatContext(defaultChatUri(created.session)));
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

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

	test('truncateChat throws when the turn is not in the transcript', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		sdk.sessionMessagesById.set(sessionId, forkSourceMessages(sessionId));
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		await assert.rejects(() => agent.truncateChat(defaultChatUri(created.session), 'no-such-turn', chatContext(defaultChatUri(created.session))), /turn no-such-turn not found/);
	});

	test('truncateChat on a provisional chat is a no-op', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });

		await agent.truncateChat(defaultChatUri(created.session), 'u1', chatContext(defaultChatUri(created.session)));

		assert.deepStrictEqual({
			startupCount: sdk.startupCallCount,
			getMessagesCalls: sdk.getSessionMessagesCalls.length,
		}, {
			startupCount: 0,
			getMessagesCalls: 0,
		});
	});

	test('truncateChat() with no turnId clears the chat in place (deleteSession + fresh same id)', async () => {
		const database = new TestSessionDatabase();
		const { agent, sdk } = createTestContext(disposables, { database });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		await agent.truncateChat(defaultChatUri(created.session), undefined, chatContext(defaultChatUri(created.session)));

		// The next turn materializes FRESH (non-resume) on the SAME id.
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));
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

	test('truncateChat() with no turnId awaits the live query teardown (subprocess exit) before deleteSession', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		// Block the live query's teardown (models `transport.waitForExit()` —
		// the subprocess not yet exited / still flushing the transcript).
		const exitGate = new DeferredPromise<void>();
		sdk.queryReturnGate = exitGate.p;

		const truncated = agent.truncateChat(defaultChatUri(created.session), undefined, chatContext(defaultChatUri(created.session)));
		await timeout(0);
		// deleteSession MUST NOT run while the subprocess is still alive: a
		// premature delete would race the dying writer re-flushing `<id>.jsonl`.
		assert.deepStrictEqual(sdk.deleteSessionCalls, [], 'deleteSession ran before the subprocess exited');

		exitGate.complete();
		await truncated;
		assert.deepStrictEqual(sdk.deleteSessionCalls, [sessionId]);
	});

	test('truncateChat() with no turnId on an unloaded chat deletes + recreates fresh on the same id, preserving the overlay', async () => {
		const database = new TestSessionDatabase();
		const { agent, sdk, instantiationService } = createTestContext(disposables, { database });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		// Unload the session from memory; the transcript stays on disk. The
		// remove-all path then has no live `existing` and must read the cwd
		// from `getSessionInfo` before deleting + recreating.
		await releaseDefaultChat(agent, created.session);
		assert.strictEqual(agent.getSessionForTesting(created.session), undefined, 'unloaded');
		sdk.sessionList = [{ sessionId, cwd: '/work', summary: '', lastModified: Date.now() }];

		// Seed a permissionMode overlay the cold recreate must carry forward.
		const metaStore = instantiationService.createInstance(ClaudeSessionMetadataStore);
		await metaStore.write(created.session, { permissionMode: 'plan' });

		await agent.truncateChat(defaultChatUri(created.session), undefined, chatContext(defaultChatUri(created.session)));

		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));
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

	test('createChat({ fork }) inherits the source permissionMode overlay', async () => {
		const { agent, sdk, instantiationService } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		const sourceUri = AgentSession.uri('claude', sourceId);
		// Seed the SOURCE overlay; the fork must copy it onto the new session
		// so it reaches `Options.permissionMode` at materialize.
		const metaStore = instantiationService.createInstance(ClaudeSessionMetadataStore);
		await metaStore.write(sourceUri, { permissionMode: 'plan' });

		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];
		await bindDefaultChat(agent, sourceUri);

		const result = await createSession(agent, {}, { fork: { source: defaultChatUri(sourceUri), turnId: 'u1' } });
		await bindDefaultChat(agent, result.session);

		// Fork defers the Query; materialize it via the first send. The resume
		// path reads the inherited overlay into `Options.permissionMode`.
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(defaultChatUri(result.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(result.session)));

		assert.strictEqual(sdk.capturedStartupOptions[0]?.permissionMode, 'plan');
	});

	test('createChat({ fork }) with a create-config model override persists it on the fork', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];
		await bindDefaultChat(agent, AgentSession.uri('claude', sourceId));

		const result = await createSession(agent, {
			model: { id: 'claude-opus-4.6' },
		}, { fork: { source: defaultChatUri(AgentSession.uri('claude', sourceId)), turnId: 'u1' } });

		// The fork's model override is no longer surfaced on metadata; its
		// observable effect is the model the forked session's SDK query is
		// started with on its first send.
		await bindDefaultChat(agent, result.session);
		const forkedId = result.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(forkedId), makeResultSuccess(forkedId)];
		await agent.chats.sendMessage(defaultChatUri(result.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(result.session)));

		assert.strictEqual(sdk.capturedStartupOptions.at(-1)?.model, 'claude-opus-4-6');
	});

	test('createChat({ fork }) falls back to a fresh conversation when the turnId is not in the transcript', async () => {
		// One creation algorithm, one answer for an unanchorable source: the
		// chat is created fresh instead of inheriting the whole source backend.
		// The requested turn is routinely missing from the SDK transcript while
		// the source conversation is still live and unflushed, and Agent Host
		// has already seeded the visible turns it forked, so failing the call
		// would leave the user with no chat at all.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		await bindDefaultChat(agent, AgentSession.uri('claude', sourceId));

		const created = await createSession(agent, {
			workingDirectories: [URI.file('/work')],
		}, { fork: { source: defaultChatUri(AgentSession.uri('claude', sourceId)), turnId: 'no-such-turn' } });

		assert.deepStrictEqual({
			forkCalls: sdk.forkSessionCalls.length,
			inheritedSource: created.sdkSessionId === sourceId,
			provisional: created.provisional,
			workingDirectory: created.resolvedWorkingDirectory?.fsPath,
		}, {
			forkCalls: 0,
			inheritedSource: false,
			provisional: true,
			workingDirectory: URI.file('/work').fsPath,
		});
	});

	test('createChat({ fork }) rejects when the forked session has no working directory', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		await bindDefaultChat(agent, AgentSession.uri('claude', sourceId));
		// No `sessionList` entry → `getSessionInfo('forked-1')` resolves
		// undefined (no cwd), and no `config.workingDirectories` is supplied.
		// Fail fast here rather than at the first `sendMessage`.
		await assert.rejects(
			createSession(agent, {}, { fork: { source: defaultChatUri(AgentSession.uri('claude', sourceId)), turnId: 'u1' } }),
			/no working directory/,
		);
	});

	test('createChat({ fork }) does not classify an unbound source chat by URI shape', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const subagentUri = URI.parse(buildSubagentSessionUri(AgentSession.uri('claude', 'parent').toString(), 'tool-call-1'));
		const created = await createSession(agent, {
			workingDirectories: [URI.file('/work')],
		}, { fork: { source: defaultChatUri(subagentUri), turnId: 'u1' } });
		assert.deepStrictEqual({
			provisional: created.provisional,
			getMessages: sdk.getSessionMessagesCalls.length,
			fork: sdk.forkSessionCalls.length,
		}, { provisional: true, getMessages: 0, fork: 0 });
	});

	test('createChat({ fork }) falls back to a fresh conversation for a provisional/never-sent source', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		// A chat is provisional until its first sendMessage, so its source has
		// no transcript to anchor a fork in — the new chat is created fresh.
		const provisional = await createSession(agent, { workingDirectories: [URI.file('/src')] });
		await bindDefaultChat(agent, provisional.session);

		const created = await createSession(agent, {
			workingDirectories: [URI.file('/src')],
		}, { fork: { source: defaultChatUri(provisional.session), turnId: 'u1' } });

		assert.deepStrictEqual({
			forkCalls: sdk.forkSessionCalls.length,
			inheritedSource: created.sdkSessionId === provisional.sdkSessionId,
			provisional: created.provisional,
		}, {
			forkCalls: 0,
			inheritedSource: false,
			provisional: true,
		});
	});

	test('first sendMessage on a provisional session materializes it (single startup, single materialize event)', async () => {
		// Phase 6 §5.1 Test 3 (tracer). Forces the materialize spine into
		// existence: `_provisionalSessions` map, `_materializeProvisional`,
		// `IClaudeAgentSdkService.startup()`, `_onDidMaterializeChat`
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

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		assert.strictEqual(sdk.startupCallCount, 0, 'createSession does not touch the SDK');

		const events: IAgentMaterializeChatEvent[] = [];
		assert.ok(agent.onDidMaterializeChat, 'agent must expose onDidMaterializeChat');
		disposables.add(agent.onDidMaterializeChat(e => events.push(e)));

		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			materializeEventCount: events.length,
			eventChat: events[0]?.chat.toString(),
			eventCwd: events[0]?.workingDirectories?.[0]?.fsPath,
			startupOptionsCwd: sdk.capturedStartupOptions[0]?.cwd,
			startupOptionsSessionId: sdk.capturedStartupOptions[0]?.sessionId,
		}, {
			startupCallCount: 1,
			materializeEventCount: 1,
			eventChat: defaultChatUri(created.session).toString(),
			eventCwd: URI.file('/work').fsPath,
			startupOptionsCwd: URI.file('/work').fsPath,
			startupOptionsSessionId: sessionId,
		});
	});

	test('multi-root session passes additionalDirectories to the SDK and emits the full resolved set', async () => {
		const { agent, sdk } = createTestContext(disposables, { rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const repoA = URI.file('/repo-a');
		const repoB = URI.file('/repo-b');
		const created = await createSession(agent, { workingDirectories: [repoA, repoB] });
		const sessionId = created.sdkSessionId;
		const events: IAgentMaterializeChatEvent[] = [];
		disposables.add(agent.onDidMaterializeChat(e => events.push(e)));
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', [repoA, repoB], undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.deepStrictEqual({
			cwd: sdk.capturedStartupOptions[0]?.cwd,
			additionalDirectories: sdk.capturedStartupOptions[0]?.additionalDirectories,
			eventDirs: events[0]?.workingDirectories?.map(d => d.fsPath),
		}, {
			cwd: repoA.fsPath,
			additionalDirectories: [repoB.fsPath],
			eventDirs: [repoA.fsPath, repoB.fsPath],
		});
	});

	test('consecutive send snapshots replace secondary roots before the next prompt', async () => {
		const database = new TestSessionDatabase();
		const { agent, sdk } = createTestContext(disposables, { database, rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const primary = URI.file('/repo-a');
		const originalSecondary = URI.file('/repo-b');
		const replacementSecondary = URI.file('/repo-c');
		const created = await createSession(agent, { workingDirectories: [primary, originalSecondary] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', [primary, originalSecondary], undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		const sessionBeforeRebuild = agent.getSessionForTesting(created.session);

		const persistedBeforeRebuild = JSON.parse((await database.getMetadata('claude.workingDirectories'))!);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', [primary, replacementSecondary], undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'third', [primary], undefined, 'turn-3', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			firstAdditionalDirectories: sdk.capturedStartupOptions[0]?.additionalDirectories,
			rebuildAdditionalDirectories: sdk.capturedStartupOptions[1]?.additionalDirectories,
			removalAdditionalDirectories: sdk.capturedStartupOptions[2]?.additionalDirectories,
			persistedBeforeRebuild,
			persistedAfterRebuild: JSON.parse((await database.getMetadata('claude.workingDirectories'))!),
			sameSession: agent.getSessionForTesting(created.session) === sessionBeforeRebuild,
			sessionAborted: sessionBeforeRebuild?.abortController.signal.aborted,
		}, {
			startupCallCount: 3,
			firstAdditionalDirectories: [originalSecondary.fsPath],
			rebuildAdditionalDirectories: [replacementSecondary.fsPath],
			removalAdditionalDirectories: undefined,
			persistedBeforeRebuild: [primary.toString(), originalSecondary.toString()],
			persistedAfterRebuild: [primary.toString()],
			sameSession: true,
			sessionAborted: false,
		});
	});

	test('identical consecutive send snapshots do not rebuild the Claude query', async () => {
		const { agent, sdk } = createTestContext(disposables, { rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const primary = URI.file('/repo-a');
		const secondary = URI.file('/repo-b');
		const created = await createSession(agent, { workingDirectories: [primary, secondary] });
		const sessionId = created.sdkSessionId;
		const nextTurn = new DeferredPromise<void>();
		sdk.queryAdvance = async index => {
			if (index === 2) {
				await nextTurn.p;
			}
		};
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', [primary, secondary], undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		nextTurn.complete();
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', [primary, secondary], undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.strictEqual(sdk.startupCallCount, 1);
	});

	test('a queued send applies changed roots only after the active turn completes', async () => {
		const { agent, sdk } = createTestContext(disposables, { rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const primary = URI.file('/repo-a');
		const originalSecondary = URI.file('/repo-b');
		const replacementSecondary = URI.file('/repo-c');
		const created = await createSession(agent, { workingDirectories: [primary, originalSecondary] });
		const sessionId = created.sdkSessionId;
		const turnActive = new DeferredPromise<void>();
		const finishTurn = new DeferredPromise<void>();
		sdk.queryAdvance = async index => {
			if (index === 1) {
				turnActive.complete();
				await finishTurn.p;
			}
		};
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		const firstSend = agent.chats.sendMessage(defaultChatUri(created.session), 'first', [primary, originalSecondary], undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		await turnActive.p;
		const liveSession = agent.getSessionForTesting(created.session);

		const secondSend = agent.chats.sendMessage(defaultChatUri(created.session), 'second', [primary, replacementSecondary], undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));
		await tick();
		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			interruptCount: sdk.warmQueries[0]?.produced?.interruptCount,
			sessionAborted: liveSession?.abortController.signal.aborted,
		}, {
			startupCallCount: 1,
			interruptCount: 0,
			sessionAborted: false,
		});

		finishTurn.complete();
		await firstSend;
		await secondSend;
		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			additionalDirectories: sdk.capturedStartupOptions[1]?.additionalDirectories,
			sameSession: agent.getSessionForTesting(created.session) === liveSession,
		}, {
			startupCallCount: 2,
			additionalDirectories: [replacementSecondary.fsPath],
			sameSession: true,
		});
	});

	test('an unloaded single-root session accepts its first secondary root', async () => {
		const { agent, sdk } = createTestContext(disposables, { rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const primary = URI.file('/repo-a');
		const secondary = URI.file('/repo-b');
		const created = await createSession(agent, { workingDirectories: [primary] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', [primary], undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		sdk.sessionList = [{ sessionId, cwd: primary.fsPath, summary: '', lastModified: Date.now() }];
		await releaseDefaultChat(agent, created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', [primary, secondary], undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.deepStrictEqual({
			resume: sdk.capturedStartupOptions.at(-1)?.resume,
			additionalDirectories: sdk.capturedStartupOptions.at(-1)?.additionalDirectories,
		}, {
			resume: sessionId,
			additionalDirectories: [secondary.fsPath],
		});
	});

	test('failed secondary-root rebuild blocks the prompt and retries on the next send', async () => {
		const { agent, sdk } = createTestContext(disposables, { rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const primary = URI.file('/repo-a');
		const originalSecondary = URI.file('/repo-b');
		const replacementSecondary = URI.file('/repo-c');
		const created = await createSession(agent, { workingDirectories: [primary, originalSecondary] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', [primary, originalSecondary], undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		sdk.startupRejection = new Error('root rebuild failed');

		await assert.rejects(
			agent.chats.sendMessage(defaultChatUri(created.session), 'blocked', [primary, replacementSecondary], undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session))),
			/root rebuild failed/,
		);
		sdk.startupRejection = undefined;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'retry', [primary, replacementSecondary], undefined, 'turn-3', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			retryAdditionalDirectories: sdk.capturedStartupOptions.at(-1)?.additionalDirectories,
		}, {
			startupCallCount: 3,
			retryAdditionalDirectories: [replacementSecondary.fsPath],
		});
	});

	test('failed applied-root persistence disposes the rebuilt Claude query', async () => {
		const database = new TestSessionDatabase();
		const originalSetMetadata = database.setMetadata.bind(database);
		let failWorkingDirectoryWrite = false;
		database.setMetadata = async (key, value) => {
			if (failWorkingDirectoryWrite && key === 'claude.workingDirectories') {
				throw new Error('applied roots persist failed');
			}
			await originalSetMetadata(key, value);
		};
		const { agent, sdk } = createTestContext(disposables, { database, rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const primary = URI.file('/repo-a');
		const originalSecondary = URI.file('/repo-b');
		const replacementSecondary = URI.file('/repo-c');
		const created = await createSession(agent, { workingDirectories: [primary, originalSecondary] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', [primary, originalSecondary], undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		failWorkingDirectoryWrite = true;
		await assert.rejects(
			agent.chats.sendMessage(defaultChatUri(created.session), 'blocked', [primary, replacementSecondary], undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session))),
			/applied roots persist failed/,
		);
		failWorkingDirectoryWrite = false;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'retry', [primary, replacementSecondary], undefined, 'turn-3', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.deepStrictEqual({
			rebuiltQueryDisposed: sdk.warmQueries[1]?.asyncDisposeCount,
			persistedWorkingDirectories: JSON.parse((await database.getMetadata('claude.workingDirectories'))!),
			startupCallCount: sdk.startupCallCount,
		}, {
			rebuiltQueryDisposed: 1,
			persistedWorkingDirectories: [primary.toString(), replacementSecondary.toString()],
			startupCallCount: 3,
		});
	});

	test('multi-root session discovers and retains customizations from an additional directory', async () => {
		const { agent, sdk, fileService, stateManager } = createTestContext(disposables, { rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const repoA = URI.file('/repo-a');
		const repoB = URI.file('/repo-b');
		const skillUri = URI.joinPath(repoB, '.claude', 'skills', 'from-b', 'SKILL.md');
		await fileService.writeFile(skillUri, VSBuffer.fromString('---\nname: from-b\ndescription: Skill from B\n---\nbody'));
		const created = await createSession(agent, { workingDirectories: [repoA, repoB] });
		const before = await agent.getChatCustomizations(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session));
		const sessionId = created.sdkSessionId;
		sdk.supportedAgentsResult = [];
		sdk.supportedCommandsResult = [{ name: 'from-b', description: 'Skill from B', argumentHint: '' }];
		sdk.mcpServerStatusResult = [];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', [repoA, repoB], undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		const after = await agent.getChatCustomizations(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session));
		const skillContainerUri = URI.joinPath(repoB, '.claude', 'skills').toString();
		const names = (customizations: readonly Customization[]) => {
			const container = customizations.find(customization => customization.uri === skillContainerUri);
			return container?.type === CustomizationType.Directory ? container.children?.map(skill => skill.name) : undefined;
		};

		assert.deepStrictEqual({
			before: names(before),
			after: names(after),
		}, {
			before: ['from-b'],
			after: ['from-b'],
		});
	});

	test('cold resume recovers the additional directories from the persisted overlay', async () => {
		const database = new TestSessionDatabase();
		const repoA = URI.file('/repo-a');
		const repoB = URI.file('/repo-b');

		// First "process": create + first send persists the overlay working set.
		const ctxA = createTestContext(disposables, { database, rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await ctxA.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(ctxA.agent, { workingDirectories: [repoA, repoB] });
		const sessionId = created.sdkSessionId;
		ctxA.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await ctxA.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', [repoA, repoB], undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		// Second "process" over the same DB: the SDK catalog only knows the cwd,
		// and the send carries no resolved set — the tail must come from the overlay.
		const ctxB = createTestContext(disposables, { database });
		await ctxB.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		ctxB.sdk.sessionList = [{ sessionId, summary: 's', lastModified: 1, cwd: repoA.fsPath }];
		ctxB.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await bindDefaultChat(ctxB.agent, created.session);
		await ctxB.agent.chats.sendMessage(defaultChatUri(created.session), 'again', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.deepStrictEqual({
			cwd: ctxB.sdk.capturedStartupOptions[0]?.cwd,
			additionalDirectories: ctxB.sdk.capturedStartupOptions[0]?.additionalDirectories,
		}, {
			cwd: repoA.fsPath,
			additionalDirectories: [repoB.fsPath],
		});
	});

	test('cold resume prefers the complete send snapshot over the persisted root seed', async () => {
		const database = new TestSessionDatabase();
		const repoA = URI.file('/repo-a');
		const staleRepoB = URI.file('/repo-b');
		const ctxA = createTestContext(disposables, { database, rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await ctxA.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(ctxA.agent, { workingDirectories: [repoA, staleRepoB] });
		const sessionId = created.sdkSessionId;
		ctxA.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await ctxA.agent.chats.sendMessage(defaultChatUri(created.session), 'first', [repoA, staleRepoB], undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		const ctxB = createTestContext(disposables, { database });
		await ctxB.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		ctxB.sdk.sessionList = [{ sessionId, summary: 's', lastModified: 1, cwd: repoA.fsPath }];
		ctxB.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await bindDefaultChat(ctxB.agent, created.session);
		await ctxB.agent.chats.sendMessage(defaultChatUri(created.session), 'again', [repoA], undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.deepStrictEqual({
			additionalDirectories: ctxB.sdk.capturedStartupOptions[0]?.additionalDirectories,
			persistedWorkingDirectories: JSON.parse((await database.getMetadata('claude.workingDirectories'))!),
		}, {
			additionalDirectories: undefined,
			persistedWorkingDirectories: [repoA.toString()],
		});
	});

	test('getChatMetadata hydrates the additional directories from the persisted overlay', async () => {
		const database = new TestSessionDatabase();
		const repoA = URI.file('/repo-a');
		const repoB = URI.file('/repo-b');

		const ctxA = createTestContext(disposables, { database, rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await ctxA.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(ctxA.agent, { workingDirectories: [repoA, repoB] });
		const sessionId = created.sdkSessionId;
		ctxA.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await ctxA.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', [repoA, repoB], undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		// A fresh agent over the same DB reconstructs the summary from the SDK's
		// cwd (single) plus the persisted overlay tail.
		const ctxB = createTestContext(disposables, { database });
		await ctxB.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		ctxB.sdk.sessionList = [{ sessionId, summary: 's', lastModified: 1, cwd: repoA.fsPath }];

		// The host hands back the default chat's persisted `providerData`, which
		// carries the SDK conversation id — the AH session id never addresses
		// the SDK catalog.
		const chat = defaultChatUri(created.session);
		const meta = await ctxB.agent.getChatMetadata(chat, chatContext(chat), created.chat!.providerData);

		assert.deepStrictEqual(
			meta?.workingDirectories?.map(d => d.fsPath),
			[repoA.fsPath, repoB.fsPath],
		);
	});

	test('a forked peer chat inherits the parent session additional directories', async () => {
		const { agent, sdk } = createTestContext(disposables, { rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const repoA = URI.file('/repo-a');
		const repoB = URI.file('/repo-b');
		const created = await createSession(agent, { workingDirectories: [repoA, repoB] });
		const parentId = created.sdkSessionId;
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: repoA.fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.createChat(chatUri, created.session, { model: { id: 'claude-opus-4.6' }, ...resolvedChatOptions([repoA, repoB]), fork: { source: defaultChatUri(created.session), turnId: 'u1' } });

		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(chatUri, 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chatUri));

		assert.deepStrictEqual({
			cwd: sdk.capturedStartupOptions[0]?.cwd,
			additionalDirectories: sdk.capturedStartupOptions[0]?.additionalDirectories,
		}, {
			cwd: repoA.fsPath,
			additionalDirectories: [repoB.fsPath],
		});
	});

	test('a live peer chat replaces roots from each complete send snapshot', async () => {
		const { agent, sdk } = createTestContext(disposables, { rootConfig: { [AgentHostClaudeMultiRootEnabledConfigKey]: true } });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const repoA = URI.file('/repo-a');
		const repoB = URI.file('/repo-b');
		const repoC = URI.file('/repo-c');
		const created = await createSession(agent, { workingDirectories: [repoA, repoB] });
		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-live-roots'));
		await agent.chats.createChat(chatUri, created.session, { ...resolvedChatOptions([repoA, repoB]) });
		sdk.nextQueryMessages = [makeSystemInitMessage('peer'), makeResultSuccess('peer')];
		await agent.chats.sendMessage(chatUri, 'first', [repoA, repoB], undefined, 'turn-1', undefined, undefined, chatContext(chatUri));
		sdk.nextQueryMessages = [makeSystemInitMessage('peer'), makeResultSuccess('peer')];
		await agent.chats.sendMessage(chatUri, 'second', [repoA, repoC], undefined, 'turn-2', undefined, undefined, chatContext(chatUri));

		assert.deepStrictEqual(
			sdk.capturedStartupOptions.map(options => options.additionalDirectories),
			[[repoB.fsPath], [repoC.fsPath]],
		);
	});

	test('a forked peer chat inherits its never-materialized parent\'s explicit model', async () => {
		// The model inheritance in `_resolveParentSession` (`provisionalModel ??
		// overlay.model`): a peer chat forked from a parent that only ever held
		// its picked model in `provisionalModel` (never materialized, so the overlay is
		// empty) must still run that model. Reading the overlay alone would silently
		// drop it and fall back to the host default. Bare id, proxy default transport.
		const { agent, sdk, proxy } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')], model: { id: 'claude-opus-4.6' } });
		const parentId = created.sdkSessionId;
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.createChat(chatUri, created.session, { model: { id: 'claude-opus-4.6' }, ...resolvedChatOptions(), fork: { source: defaultChatUri(created.session), turnId: 'u1' } });

		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(chatUri, 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chatUri));

		// Materialized over the proxy transport (host default) resuming the fork,
		// carrying the parent's model normalized to its bare SDK id.
		assert.deepStrictEqual({
			model: sdk.capturedStartupOptions[0]?.model,
			resume: sdk.capturedStartupOptions[0]?.resume,
			proxyStarts: proxy.startCalls.length,
		}, {
			model: 'claude-opus-4-6',
			resume: 'forked-1',
			proxyStarts: 1,
		});
	});

	test('materializing in a worktree reanchors customization discovery', async () => {
		const { agent, sdk, fileService, stateManager } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const workspace = URI.file('/workspace');
		const worktree = URI.file('/workspace.worktrees/session');
		const created = await createSession(agent, { workingDirectories: [workspace] });
		const sessionId = created.sdkSessionId;
		sdk.supportedCommandsResult = [{ name: 'worktree-skill', description: 'Worktree skill', argumentHint: '' }];
		sdk.supportedAgentsResult = [];
		sdk.mcpServerStatusResult = [];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', [worktree], undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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
		const customizations = await agent.getChatCustomizations!(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session));
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

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')], agent: { uri: agentFile.toString() } });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, 'my-real-agent');
	});

	test('materialize resolves a built-in (claude-internal) agent selection to its name', async () => {
		// A built-in agent (e.g. `Explore`) has no editable file on disk; it is
		// selected via a synthetic `claude-internal:/agent/<name>` URI. Materialize
		// must decode the name from the path and start the SDK with agent=Explore
		// (the inverse of `nonEditableUri`).
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')], agent: { uri: 'claude-internal:/agent/Explore' } });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, 'Explore');
	});

	test('materialize event payload includes the exact chat resource', async () => {
		// Phase 6 §5.1 Test 4. Pins the {@link IAgentMaterializeChatEvent}
		// payload independently of the tracer in Test 3. The default
		// {@link createNoopGitService} produces no project metadata, so
		// `project` is `undefined`. Claude never mints a fresh backing at
		// materialize time, so `result` is omitted entirely — AgentService
		// relies on this exact shape to forward to its `sessionAdded`
		// notification, so a snapshot here is the load-bearing contract.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const cwd = URI.file('/payload-shape');
		const created = await createSession(agent, { workingDirectories: [cwd] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const events: IAgentMaterializeChatEvent[] = [];
		assert.ok(agent.onDidMaterializeChat);
		disposables.add(agent.onDidMaterializeChat(e => events.push(e)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.strictEqual(events.length, 1, 'event fires exactly once');
		const ev = events[0];
		assert.deepStrictEqual({
			chat: ev.chat.toString(),
			workingDirectory: ev.workingDirectories?.[0]?.toString(),
			project: ev.project,
			keys: Object.keys(ev).sort(),
		}, {
			chat: defaultChatUri(created.session).toString(),
			workingDirectory: cwd.toString(),
			project: undefined,
			keys: ['chat', 'project', 'workingDirectories'],
		});
	});

	test('createChat model + config.permissionMode flow into Options on first send (M11 / Phase 6.1 C2)', async () => {
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

		const created = await createSession(agent, {
			workingDirectories: [URI.file('/work')],
			model: { id: 'claude-sonnet-4.6' },
			config: { permissionMode: 'plan' },
		});
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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

	test('createChat model.config.thinkingLevel flows into Options.effort on first send (M11 / Phase 6.1 C2)', async () => {
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

		const created = await createSession(agent, {
			workingDirectories: [URI.file('/work')],
			model: { id: 'claude-opus-4.6', config: { thinkingLevel: 'high' } },
		});
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

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
		await agent.chats.sendMessage(defaultChatUri(created.session), 'turn-1', undefined, undefined, 'turn-id-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		// Snapshot before the second send so we can assert the second send
		// did NOT call startup() again.
		const startupCallsAfterTurn1 = sdk.startupCallCount;
		const queryCallsAfterTurn1 = sdk.warmQueries[0]?.queryCallCount ?? -1;

		// Second turn — pushes onto the existing Query.
		const p2 = agent.chats.sendMessage(defaultChatUri(created.session), 'turn-2', undefined, undefined, 'turn-id-2', undefined, undefined, chatContext(defaultChatUri(created.session)));
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

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
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
		disposables.add(agent.onDidChatProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
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
		disposables.add(agent.onDidChatProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
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
		disposables.add(agent.onDidChatProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
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
		disposables.add(agent.onDidChatProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
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
		disposables.add(agent.onDidChatProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeAssistantMessage(sessionId, [
				{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: {} },
			]),
			makeResultSuccess(sessionId),
		];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidChatProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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
		// onDidChatProgress — the orchestrator records the spawn edge on the
		// unified chat catalog. A completed subagent chat stays live and
		// subscribable (removed only on session teardown). The
		// signals must STILL be forwarded verbatim so the existing
		// AgentSideEffects subagent handling (turn lifecycle + parent tool-call
		// content) is preserved.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
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
		disposables.add(agent.onDidChatProgress(s => signals.push(s)));
		const spawned: IAgentSpawnChatEvent[] = [];
		disposables.add(agent.onDidSpawnChat!(e => spawned.push(e)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
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
		disposables.add(agent.onDidChatProgress(s => signals.push(s)));

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		// Snapshot before the SDK has streamed any messages.
		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		const session = agent.getSessionForTesting(created.session);
		assert.ok(session, 'session is materialized');
		assert.strictEqual(session.isResumed, true, 'isResumed flipped after system:init');
	});

	test('tearing a materialized session down aborts the controller and rejects the in-flight send', async () => {
		// Phase 6 §5.1 Test 11. The dispose chain registered in
		// `ClaudeAgentSession`'s constructor calls
		// `abortController.abort()`. The for-await loop sees
		// `signal.aborted` and throws `CancellationError`, and the
		// `_processMessages` catch latches `_fatalError` + rejects every
		// in-flight deferred. Without the latch the in-flight send
		// would park forever and the test would hang. Driven through
		// `shutdown`, whose teardown drain runs on the dispose sequencer —
		// independent of the send sequencer — so it lands while the send is
		// still parked.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		// Park the iterator at index 0 so `_processMessages` is
		// suspended inside `next()` when teardown runs. After teardown
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
		const materialized = Event.toPromise(agent.onDidMaterializeChat);

		const send = agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		const settle: { rejected?: unknown } = {};
		const sendDone = send.then(() => { settle.rejected = false; }, err => { settle.rejected = err; });

		await materialized;
		// One additional macro-flush so `entry.send` has pushed the
		// deferred to `_inFlightRequests` and `_processMessages` has
		// started its for-await (parked on `advance.p`).
		await new Promise<void>(resolve => setImmediate(resolve));

		const aborter = sdk.capturedStartupOptions[0]?.abortController;
		await agent.shutdown();
		// Release the parked iterator so the for-await loop unblocks
		// and the abort-check throws CancellationError.
		advance.complete();
		await sendDone;

		assert.deepStrictEqual({
			rejectedIsCancellation: isCancellationError(settle.rejected),
			abortedAfterTeardown: aborter?.signal.aborted,
			sessionRemoved: agent.getSessionForTesting(created.session) === undefined,
		}, {
			rejectedIsCancellation: true,
			abortedAfterTeardown: true,
			sessionRemoved: true,
		});
	});

	test('teardown racing _writeCustomizationDirectory does not orphan the materialized session (C1)', async () => {
		// Council-review C1 regression. The plan's Q8 belt-and-suspenders
		// abort guard at `_materializeProvisional` only catches an abort
		// that lands while `await sdk.startup()` is in flight.
		// `_writeCustomizationDirectory` is a SECOND async boundary where
		// a racing teardown (`shutdown`, which drains on `_disposeSequencer` —
		// a different sequencer from `sendMessage`'s `_sessionSequencer`)
		// can fire, find the provisional record, abort, remove, and
		// return. Without the pre-commit abort gate added in this fix,
		// materialize would still set `_sessions[sessionId]` and fire
		// `onDidMaterializeChat` — leaking a WarmQuery subprocess.
		//
		// Test setup uses a custom session database whose `setMetadata`
		// blocks on a per-test deferred so we can deterministically
		// interleave dispose with persist. The fix asserts:
		//  - the racing `sendMessage` rejects with `CancellationError`
		//  - the session never lands in `_sessions`
		//  - `onDidMaterializeChat` never fires
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
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IAgentHostGitService, createNoopGitService()],
			[IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
			[IAgentConfigurationService, configService],
			[IAgentHostStateManager, stateManager],
			[IAgentHostCustomizationEnablementService, reducerBackedEnablementService(stateManager)],
			[IAgentHostSessionTitleSignal, disposables.add(new AgentHostSessionTitleSignal(stateManager))],
			[IAgentHostOTelService, new RecordingOTelService()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		services.set(IAgentHostAuthenticationService, disposables.add(new FakeAgentHostAuthenticationService()));
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent: ClaudeAgent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		await bindDefaultChat(agent, created.session);
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const materializeEvents: IAgentMaterializeChatEvent[] = [];
		disposables.add(agent.onDidMaterializeChat(e => materializeEvents.push(e)));

		// Kick off the materialize. It will pass the post-startup abort
		// gate, create the wrapper, then park inside `setMetadata`.
		const send = agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		const settle: { rejected?: unknown } = {};
		const sendDone = send.then(() => { settle.rejected = false; }, err => { settle.rejected = err; });

		// Wait until the persist step has actually been entered. This is
		// the deterministic gate — without it we'd be racing the materialize
		// progress against our dispose call.
		while (!persistEntered) {
			await new Promise<void>(resolve => setImmediate(resolve));
		}

		// Now tear down while persist is parked. The dispose-sequencer is
		// independent of the send-sequencer, so this runs immediately:
		// finds the provisional, aborts the controller, drops the live
		// entry, returns.
		await agent.shutdown();

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

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });

		await disposeSession(agent, created.session);

		// Materializing now requires a provisional record; without it
		// the sequencer task throws synchronously inside the queued fn.
		const sendErr = await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)))
			.then(() => undefined, err => err);

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			warmQueriesLength: sdk.warmQueries.length,
			sendThrewUnknown: sendErr instanceof Error && /unknown session|no backing chat|working directory missing/i.test(sendErr.message),
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

		const events: IAgentMaterializeChatEvent[] = [];
		disposables.add(agent.onDidMaterializeChat(e => events.push(e)));

		await bindDefaultChat(agent, sessionUri);
		await agent.chats.sendMessage(defaultChatUri(sessionUri), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(sessionUri)));

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			materializeEventCount: events.length,
			eventChat: events[0]?.chat.toString(),
			eventCwd: events[0]?.workingDirectories?.[0]?.fsPath,
			startupOptionsCwd: sdk.capturedStartupOptions[0]?.cwd,
			// In resume mode the SDK gets `Options.resume = <id>` and
			// MUST NOT get `Options.sessionId`.
			startupOptionsResume: sdk.capturedStartupOptions[0]?.resume,
			startupOptionsSessionId: sdk.capturedStartupOptions[0]?.sessionId,
			sessionInMap: agent.getSessionForTesting(sessionUri) !== undefined,
		}, {
			startupCallCount: 1,
			materializeEventCount: 1,
			eventChat: defaultChatUri(sessionUri).toString(),
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

		await bindDefaultChat(agent, sessionUri);
		const sendErr = await agent.chats.sendMessage(defaultChatUri(sessionUri), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(sessionUri)))
			.then(() => undefined, err => err);

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			sendThrewUnknown: sendErr instanceof Error && /unknown session|no backing chat|working directory missing/i.test(sendErr.message),
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
		// The fix: only forward `setPermissionMode` when the live config
		// actually carries a value, leaving the session's seeded
		// bijective state (set via `seedBijectiveState` at resume time)
		// authoritative otherwise.
		//
		// Setup: stage the per-session DB with `claude.permissionMode='plan'`,
		// then run two turns. Turn 1 picks up the mode via
		// `Options.permissionMode` at materialize. Turn 2 must NOT
		// record an extra `setPermissionMode` call.
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
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await bindDefaultChat(agent, sessionUri);
		await agent.chats.sendMessage(defaultChatUri(sessionUri), 'turn-1', undefined, undefined, 't1', undefined, undefined, chatContext(defaultChatUri(sessionUri)));

		sdk.nextQueryMessages = [makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(sessionUri), 'turn-2', undefined, undefined, 't2', undefined, undefined, chatContext(defaultChatUri(sessionUri)));

		const fakeQuery = sdk.warmQueries.at(-1)?.produced;
		assert.deepStrictEqual({
			optionsPermissionMode: sdk.capturedStartupOptions[0]?.permissionMode,
			recordedModes: fakeQuery?.recordedPermissionModes ?? [],
		}, {
			optionsPermissionMode: 'plan',
			recordedModes: ['plan'],
		});
	});

	test('configuration events forward a mid-turn picker change and revert to the fallback when the key is deleted (issue #321691)', async () => {
		const { agent, sdk, stateManager } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, {
			workingDirectories: [URI.file('/work')],
			config: { permissionMode: 'default' },
		});
		const sessionId = created.sdkSessionId;
		stateManager.createSession({
			resource: created.session.toString(),
			provider: agent.id,
			title: '',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		stateManager.setSessionConfig(created.session.toString(), {
			schema: { type: 'object', properties: {} },
			values: { permissionMode: 'default' },
		});

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

		const turn = agent.chats.sendMessage(defaultChatUri(created.session), 'edit a file', undefined, undefined, 't1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		await reached.p;

		stateManager.dispatchClientAction(created.session.toString(), {
			type: ActionType.SessionConfigChanged,
			config: { permissionMode: 'bypassPermissions' },
		}, { clientId: 'picker', clientSeq: 1 });
		await tick();
		stateManager.dispatchClientAction(created.session.toString(), {
			type: ActionType.SessionConfigChanged,
			config: {},
			replace: true,
		}, { clientId: 'picker', clientSeq: 2 });
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
		const matCreated = await createSession(agent, { workingDirectories: [URI.file('/work-mat')] });
		sdk.nextQueryMessages = [
			makeSystemInitMessage(matCreated.sdkSessionId),
			makeResultSuccess(matCreated.sdkSessionId),
		];
		await agent.chats.sendMessage(defaultChatUri(matCreated.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(matCreated.session)));

		// Leave a second session provisional.
		const provCreated = await createSession(agent, { workingDirectories: [URI.file('/work-prov')] });
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
			provDropped: await agent.chats.sendMessage(defaultChatUri(provCreated.session), 'late', undefined, undefined, 'turn-late', undefined, undefined, chatContext(defaultChatUri(provCreated.session)))
				.then(() => false, err => err instanceof Error && /unknown session|no backing chat/i.test(err.message)),
			// Same for the materialized URI.
			matDropped: await agent.chats.sendMessage(defaultChatUri(matCreated.session), 'late', undefined, undefined, 'turn-late', undefined, undefined, chatContext(defaultChatUri(matCreated.session)))
				.then(() => false, err => err instanceof Error && /unknown session|no backing chat/i.test(err.message)),
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
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		const sessionUri = created.session;
		const observed: AgentSignal[] = [];
		disposables.add(agent.onDidChatProgress(s => {
			const resource = s.kind === 'action' || s.kind === 'model_call_completed' ? s.resource : s.chat;
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

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-explicit', undefined, undefined, chatContext(defaultChatUri(created.session)));

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
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
		];

		const fileUri = URI.file('/work/src/foo.ts');
		const dirUri = URI.file('/work/src/bar');
		await agent.chats.sendMessage(defaultChatUri(created.session), 'review please', undefined, [
			{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'foo.ts', displayKind: 'document' },
			{ type: MessageAttachmentKind.Resource, uri: dirUri.toString(), label: 'bar', displayKind: 'directory' },
		], 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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
					'The user selected these feedback comments for you to act on (comment ids):\n' +
					'- feedback-1\n\n' +
					'Use the `listComments` tool to read their content and focus on these comments. ' +
					'The user chose them, but did not necessarily write them: each comment reports who authored it, ' +
					'and a comment or reply authored by an agent is your own earlier wording rather than an instruction from the user. ' +
					'Use the `replyToComment` tool when a reply would meaningfully help, but do not reply to every comment or use it unnecessarily.\n\n' +
					'The user selected these feedback comments for you to act on (comment ids):\n' +
					'- feedback-2\n\n' +
					'Use the `listComments` tool to read their content and focus on these comments. ' +
					'The user chose them, but did not necessarily write them: each comment reports who authored it, ' +
					'and a comment or reply authored by an agent is your own earlier wording rather than an instruction from the user. ' +
					'Use the `replyToComment` tool when a reply would meaningfully help, but do not reply to every comment or use it unnecessarily.',
			},
		]);
	});

	test('shutdown resolves without throwing', async () => {
		const { agent } = createTestContext(disposables);
		await agent.shutdown();
	});

	test('tearing down a chat of an unknown session is a safe no-op', async () => {
		const { agent } = createTestContext(disposables);
		await disposeSession(agent, URI.parse('claude:/never-created'));
	});

	test('shutdown clears provisional sessions; a concurrent chat teardown is safe', async () => {
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
		const r1 = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		await createSession(agent, { workingDirectories: [URI.file('/work')] });

		const p1 = disposeSession(agent, r1.session);
		const p2 = agent.shutdown();
		await Promise.all([p1, p2]);

		// `shutdown` is memoized — a second call returns the same
		// promise. Pin that here so concurrent teardowns don't double-drain.
		const third = agent.shutdown();
		assert.strictEqual(third, p2);
		await third;
	});

	test('tearing a session down removes the wrapper but does NOT delete the SDK or DB session', async () => {
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
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		// Make the SDK report the just-created session as if its
		// metadata had been written by an earlier `query()` turn —
		// that's the steady state once Phase 6 sendMessage lands.
		sdk.sessionList = [{
			sessionId: created.sdkSessionId,
			summary: 'Hello world',
			lastModified: 100,
		}];

		await disposeSession(agent, created.session);
		const result = await discoverClaudeCodeChats(agent);
		assert.ok(result);

		assert.deepStrictEqual({
			ids: result.map(r => sessionIdOfChat(r.chat)),
			summary: result[0]?.summary,
			sdkCalls: sdk.listSessionsCallCount,
		}, {
			ids: [created.sdkSessionId],
			summary: 'Hello world',
			sdkCalls: 1,
		});
	});

	test('chats.getMessages returns an empty transcript for a chat with no backing', async () => {
		// A chat the provider has never backed (no `createChat` /
		// `materializeChat`) has no SDK conversation to read, so the read
		// resolves empty rather than throwing. We assert the result is also a
		// fresh array (not a shared sentinel) so future implementations can't
		// leak mutations.
		const { agent } = createTestContext(disposables);
		const c1 = defaultChatUri(URI.parse('claude:/unknown-1'));
		const c2 = defaultChatUri(URI.parse('claude:/unknown-2'));
		const a = await agent.chats.getMessages(c1, chatContext(c1));
		const b = await agent.chats.getMessages(c2, chatContext(c2));
		assert.deepStrictEqual({ a, b, distinct: a !== b }, { a: [], b: [], distinct: true });
	});

	test('native catalog returns every SDK entry while migration returns known sessions', async () => {
		// Plan section 3.3.2: the SDK is the source of truth; the per-session DB
		// is a pure overlay/cache. We seed two SDK entries and a single
		// DB carrying `claude.customizationDirectory` for entry 'a'. The
		// result must include both entries; the overlay value must
		// surface only on the entry that has a DB.
		const dbA = new TestSessionDatabase();
		const dbB = new TestSessionDatabase();
		const dbC = new TestSessionDatabase();
		await dbA.setMetadata('claude.customizationDirectory', URI.file('/foo').toString());
		await dbA.setMetadata('agentHost.workspaceless', 'false');

		const sessionData: ISessionDataService = {
			...createNullSessionDataService(),
			openDatabase: session => ({
				object: AgentSession.id(session) === 'a' ? dbA : AgentSession.id(session) === 'b' ? dbB : dbC,
				dispose: () => { /* no-op */ },
			}),
			tryOpenDatabase: async session => {
				if (AgentSession.id(session) === 'a') {
					return { object: dbA, dispose: () => { /* no-op */ } };
				}
				if (AgentSession.id(session) === 'b') {
					return { object: dbB, dispose: () => { /* no-op */ } };
				}
				if (AgentSession.id(session) === 'c') {
					return { object: dbC, dispose: () => { /* no-op */ } };
				}
				return undefined;
			},
		};
		const sdk = new FakeClaudeAgentSdkService();
		sdk.sessionList = [
			{ sessionId: 'a', summary: 'Session A', lastModified: 1000, createdAt: 900 },
			{ sessionId: 'b', summary: 'Session B', lastModified: 2000, createdAt: 1900 },
			{ sessionId: 'c', summary: 'Session C', lastModified: 3000, createdAt: 2900 },
		];

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			...createTestAgentStateServices(disposables),
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
		await agent.materializeChat(defaultChatUri(AgentSession.uri('claude', 'b')), chatContext(defaultChatUri(AgentSession.uri('claude', 'b'))), undefined);

		const result = await discoverClaudeCodeChats(agent);
		const chatsToMigrate = await agent.listChatsToMigrate();
		assert.ok(result);
		assert.ok(chatsToMigrate);
		const a = result.find(r => sessionIdOfChat(r.chat) === 'a');
		const b = result.find(r => sessionIdOfChat(r.chat) === 'b');
		assert.deepStrictEqual({
			count: result.length,
			ids: result.map(r => sessionIdOfChat(r.chat)).sort(),
			summaryA: a?.summary,
			summaryB: b?.summary,
			modifiedA: a?.modifiedTime,
			modifiedB: b?.modifiedTime,
			sdkCalls: sdk.listSessionsCallCount,
			availabilityRequests: sdk.ensureAvailableCalls,
			migrationChats: chatsToMigrate?.map(r => sessionIdOfChat(r.chat)),
		}, {
			count: 3,
			ids: ['a', 'b', 'c'],
			summaryA: 'Session A',
			summaryB: 'Session B',
			modifiedA: 1000,
			modifiedB: 2000,
			sdkCalls: 2,
			availabilityRequests: 0,
			migrationChats: ['a'],
		});

		sdk.sessionList = [];
		assert.deepStrictEqual(await agent.listChatsToMigrate(), []);
		sdk.listSessionsRejection = new Error('catalog unavailable');
		assert.strictEqual(await agent.listChatsToMigrate(), undefined);
	});

	test('native discovery emits only unknown Claude Code chats as external', async () => {
		const knownInternal = AgentSession.uri('claude', 'known-internal');
		const knownExternal = AgentSession.uri('claude', 'known-external');
		const unknownExternal = AgentSession.uri('claude', 'unknown-external');
		const chats = [
			{ chat: defaultChatUri(knownInternal), startTime: 1, modifiedTime: 2 },
			{ chat: defaultChatUri(knownExternal), startTime: 3, modifiedTime: 4 },
			{ chat: defaultChatUri(unknownExternal), startTime: 5, modifiedTime: 6 },
		];
		const emitted: unknown[] = [];
		const emitClaudeCodeChats = (ClaudeAgent.prototype as unknown as {
			_emitClaudeCodeChats(this: {
				_listClaudeCodeChats(): Promise<typeof chats>;
				_isKnownClaudeCodeChat(chat: IAgentChatMetadata): Promise<boolean>;
				_onDidDiscoverChats: { fire(chats: readonly unknown[]): void };
				_logService: { warn(message: string): void };
			}): Promise<void>;
		})._emitClaudeCodeChats;

		await emitClaudeCodeChats.call({
			_listClaudeCodeChats: async () => chats,
			_isKnownClaudeCodeChat: async chat => sessionIdOfChat(chat.chat) !== 'unknown-external',
			_onDidDiscoverChats: { fire: chats => emitted.push(...chats) },
			_logService: { warn: () => { } },
		});

		assert.deepStrictEqual(emitted, [{ ...chats[2], external: true }]);
	});

	test('external chat discovery tolerates a corrupt DB without poisoning the rest of the listing', async () => {
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
			...createTestAgentStateServices(disposables),
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		const result = await discoverClaudeCodeChats(agent);
		assert.ok(result);
		const find = (id: string) => result.find(r => sessionIdOfChat(r.chat) === id);
		assert.deepStrictEqual({
			count: result.length,
			ids: result.map(r => sessionIdOfChat(r.chat)).sort(),
			corruptSummary: find('corrupt')?.summary,
		}, {
			count: 3,
			ids: ['corrupt', 'external', 'ok'],
			corruptSummary: 'Corrupt',
		});
	});

	test('external chat discovery returns undefined (cannot enumerate yet) when the SDK fails to load', async () => {
		// Copilot-reviewer comment: `AgentService.listSessions` fans out
		// across providers via `Promise.all` (agentService.ts:202-204).
		// If our SDK dynamic import rejects (corrupt install, missing
		// optional dep) and we let it propagate, every other provider's
		// session list disappears too \u2014 the sibling Copilot provider
		// goes blank. Catching here keeps Claude's row from poisoning the
		// fan-out; `undefined` (not `[]`) signals "can't enumerate yet"
		// rather than falsely claiming there are no external chats, so the
		// caller retries on the next external discovery pass instead of
		// permanently dropping this provider's chats from migration.
		const sdk = new FakeClaudeAgentSdkService();
		sdk.listSessionsRejection = new Error('simulated SDK load failure');

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			...createTestAgentStateServices(disposables),
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, sdk],
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		const result = await discoverClaudeCodeChats(agent);
		assert.deepStrictEqual(result, undefined);
	});

	test('getChatMetadata joins SDK info with sidecar overlay, returns SDK-only fields for external sessions, and undefined for unknown ids (Phase 6.1 / Cycle D4 / I7)', async () => {
		// Phase 6.1 plan / Cycle D4 + drift I7. CONTEXT.md M11 / agents.md
		// section "Lazy session metadata" (~line 2125) require Claude to
		// expose a per-chat lookup that mirrors the
		// `IAgent.getChatMetadata` shape so AgentService can hydrate
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
			...createTestAgentStateServices(disposables),
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		const sidecarUri = AgentSession.uri('claude', 'sidecar');
		const externalUri = AgentSession.uri('claude', 'external');
		const unknownUri = AgentSession.uri('claude', 'unknown');
		const sidecarChat = defaultChatUri(sidecarUri);
		const externalChat = defaultChatUri(externalUri);
		const unknownChat = defaultChatUri(unknownUri);

		const sidecar = await agent.getChatMetadata(sidecarChat, chatContext(sidecarChat));
		const external = await agent.getChatMetadata(externalChat, chatContext(externalChat));
		const unknown = await agent.getChatMetadata(unknownChat, chatContext(unknownChat));

		assert.deepStrictEqual({
			sidecar: {
				chat: sidecar?.chat.toString(),
				summary: sidecar?.summary,
				startTime: sidecar?.startTime,
				modifiedTime: sidecar?.modifiedTime,
				workingDirectory: sidecar?.workingDirectories?.[0]?.toString(),
			},
			external: {
				chat: external?.chat.toString(),
				summary: external?.summary,
				startTime: external?.startTime,
				modifiedTime: external?.modifiedTime,
				workingDirectory: external?.workingDirectories?.[0]?.toString(),
			},
			unknown,
			sdkLookups: sdk.getSessionInfoCalls.slice().sort(),
		}, {
			sidecar: {
				chat: sidecarChat.toString(),
				summary: 'With Sidecar',
				startTime: 4900,
				modifiedTime: 5000,
				workingDirectory: URI.file('/work').toString(),
			},
			external: {
				chat: externalChat.toString(),
				summary: 'External',
				startTime: 5900,
				modifiedTime: 6000,
				workingDirectory: URI.file('/raw-cli').toString(),
			},
			unknown: undefined,
			sdkLookups: ['external', 'sidecar', 'unknown'],
		});
	});

	test('getChatMetadata resolves a registered AH session through its exact default-chat backing', async () => {
		const { agent, sdk } = createTestContext(disposables);
		const session = AgentSession.uri(agent.id, 'ah-session');
		sdk.sessionList = [{ sessionId: 'sdk-default', summary: 'Exact default', lastModified: 10, cwd: '/work' }];

		const chat = defaultChatUri(session);
		const metadata = await agent.getChatMetadata(chat, chatContext(chat), JSON.stringify({ sdkSessionId: 'sdk-default' }));

		assert.deepStrictEqual({
			chat: metadata?.chat.toString(),
			summary: metadata?.summary,
			lookups: sdk.getSessionInfoCalls,
		}, {
			chat: chat.toString(),
			summary: 'Exact default',
			lookups: ['sdk-default'],
		});
	});

	test('neither restore nor cold discovery pulls the SDK down', async () => {
		// Regression: when a materialized Claude session is restored on
		// startup (the renderer subscribes to the last-active session), the
		// host's restore path calls `getChatMetadata` -> `getSessionInfo`
		// and `chats.getMessages`, both of which dynamically import the SDK.
		// Before the fix that eagerly triggered a cold SDK download (with no
		// progress interest registered, so no notification) purely from
		// preselecting/restoring Claude — the download must only start on the
		// first user message. Discovery used to be exempt and fetch in the
		// background; it no longer is, since the download is the user's call.
		const sdk = new FakeClaudeAgentSdkService();
		sdk.canLoadWithoutDownloadResult = false;
		sdk.sessionList = [
			{ sessionId: 'materialized', summary: 'Materialized Session', lastModified: 5000, createdAt: 4900, cwd: '/work' },
		];
		sdk.sessionMessagesById.set('materialized', forkSourceMessages('materialized'));

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			...createTestAgentStateServices(disposables),
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, sdk],
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IProductService, FakeProductService],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
		const discoveredChats: number[] = [];
		disposables.add(agent.onDidDiscoverChats(chats => discoveredChats.push(chats.length)));

		const sessionUri = AgentSession.uri('claude', 'materialized');
		const chat = defaultChatUri(sessionUri);
		const metadata = await agent.getChatMetadata(chat, chatContext(chat));
		await bindDefaultChat(agent, sessionUri);
		const messages = await agent.chats.getMessages(defaultChatUri(sessionUri), chatContext(defaultChatUri(sessionUri)));
		await timeout(0);

		assert.deepStrictEqual({
			metadata,
			messages,
			// Nothing reachable from restore or discovery may touch the SDK
			// while it is absent, whether to read it or to fetch it.
			getSessionInfoCalls: sdk.getSessionInfoCalls,
			getSessionMessagesCalls: sdk.getSessionMessagesCalls,
			availabilityRequests: sdk.ensureAvailableCalls,
			discoveredChats,
		}, {
			metadata: undefined,
			messages: [],
			getSessionInfoCalls: [],
			getSessionMessagesCalls: [],
			availabilityRequests: 0,
			discoveredChats: [],
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
		await createSession(agent, { workingDirectories: [URI.file('/work')] });
		await createSession(agent, { workingDirectories: [URI.file('/work')] });

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
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader(false)],
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
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader(false)],
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

	test('resolveChatConfig returns Claude-native permissionMode + reused Permissions schema', async () => {
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
		const result = await agent.resolveChatConfig({});
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

	test('chatConfigCompletions returns no items (permissionMode is a static enum)', async () => {
		// Plan section 3.3.5 — Claude's only schema property is the
		// `permissionMode` static enum, so dynamic completion is
		// definitionally empty. Locks the contract before Phase 6's
		// branch picker (subject to the worktree-extraction prerequisite
		// in section 8) might want to plug into this method.
		const { agent } = createTestContext(disposables);
		const result = await agent.chatConfigCompletions({ property: 'permissionMode', query: 'def' });
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
			...createTestAgentStateServices(disposables),
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new RecordingProxyService()],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IAgentHostGitService, createNoopGitService()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
			[IAgentHostAuthenticationService, disposables.add(new FakeAgentHostAuthenticationService())],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = instantiationService.createInstance(ClaudeAgent);

		await agent.authenticate('https://api.github.com', 'tok');
		await createSession(agent, { workingDirectories: [URI.file('/work')] });
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
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[IAgentHostGitService, createNoopGitService()],
			[IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
			[IAgentConfigurationService, configService],
			[IAgentHostStateManager, stateManager],
			[IAgentHostCustomizationEnablementService, reducerBackedEnablementService(stateManager)],
			[IAgentHostSessionTitleSignal, disposables.add(new AgentHostSessionTitleSignal(stateManager))],
			[IAgentHostOTelService, new RecordingOTelService()],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
		);
		services.set(IAgentHostAuthenticationService, disposables.add(new FakeAgentHostAuthenticationService()));
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent: ClaudeAgent = instantiationService.createInstance(ClaudeAgent);

		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		await bindDefaultChat(agent, created.session);
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const send = agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
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
			agent.onClientToolCallComplete(chat, 'toolu_unknown', { success: true, pastTenseMessage: 'ran' });
		});
	});

	// #region Phase 10 — client (MCP) tools

	test('setClientTools registers tools that flow into Options.mcpServers on first materialize', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		const tools: ToolDefinition[] = [{ name: 'echo', description: 'Echo back', inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] } }];
		getOrCreateActiveClient(agent, defaultChatUri(created.session), 'client-1').tools = tools;

		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'go', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		// Pause the iterator after the first result so the pipeline doesn't
		// rebind on its own ("stream ended without result" → needsRebind).
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (i: number) => { if (i === 2) { await advance.p; } };
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		assert.strictEqual(sdk.startupCallCount, 1, 'first materialize');

		getOrCreateActiveClient(agent, defaultChatUri(created.session), 'client-1').tools = [{ name: 'echo', inputSchema: { type: 'object' } }];
		sdk.queryAdvance = undefined;
		advance.complete();
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

		const lastBuild = sdk.createSdkMcpServerCalls[sdk.createSdkMcpServerCalls.length - 1];
		assert.deepStrictEqual({
			startupCount: sdk.startupCallCount,
			firstMcp: !!sdk.capturedStartupOptions[0].mcpServers,
			secondMcpToolNames: lastBuild?.toolNames,
		}, {
			startupCount: 2,
			firstMcp: true,
			secondMcpToolNames: ['echo'],
		});
	});

	test('a pending truncation anchor reaches the next rebuild as Options.resumeSessionAt, consumed once', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		// Pause after the first result so the pipeline doesn't auto-rebind on its own.
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (i: number) => { if (i === 2) { await advance.p; } };
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		assert.strictEqual(sdk.startupCallCount, 1, 'first materialize');

		// Stage a pending truncation anchor, then send again. The pending anchor
		// alone (no tool/customization diff) must force an anchored rebuild.
		await agent.getSessionForTesting(created.session)!.truncateToTurn('turn-1', 'anchor-uuid', created.session);
		sdk.queryAdvance = undefined;
		advance.complete();
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

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
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		await agent.getSessionForTesting(created.session)!.truncateToTurn('turn-1', 'anchor-uuid', created.session);
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));
		// A later tool-driven rebind must NOT resurrect the consumed anchor.
		getOrCreateActiveClient(agent, defaultChatUri(created.session), 'c1').tools = [{ name: 'echo', inputSchema: { type: 'object' } }];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'third', undefined, undefined, 'turn-3', undefined, undefined, chatContext(defaultChatUri(created.session)));

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
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		await agent.getSessionForTesting(created.session)!.truncateToTurn('turn-1', 'anchor-uuid', created.session);

		// The anchor-carrying rebuild fails at startup (one-shot). The anchor
		// must NOT be cleared — losing it would silently proceed without
		// `resumeSessionAt`, undoing the checkpoint restore.
		sdk.startupRejection = new Error('transient startup failure');
		await assert.rejects(() => agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session))));

		// Retry: the staged anchor is re-applied on the next (now-succeeding) send.
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second-retry', undefined, undefined, 'turn-2b', undefined, undefined, chatContext(defaultChatUri(created.session)));
		assert.strictEqual(sdk.capturedStartupOptions.at(-1)?.resumeSessionAt, 'anchor-uuid');
	});

	test('truncateToTurn / pruneAllTurns reach the session database', async () => {
		const database = new TestSessionDatabase();
		const { agent, sdk } = createTestContext(disposables, { database });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		const session = agent.getSessionForTesting(created.session)!;

		await session.truncateToTurn('turn-1', 'anchor-uuid', created.session);
		await session.pruneAllTurns(created.session);

		assert.deepStrictEqual(
			{ afterCalls: database.deleteTurnsAfterCalls, allCalls: database.deleteAllTurnsCalls },
			{ afterCalls: ['turn-1'], allCalls: 1 },
		);
	});

	test('setClientTools with an equal snapshot does NOT restart', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (i: number) => { if (i === 2) { await advance.p; } };
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		const tools: ToolDefinition[] = [{ name: 'echo', description: 'e', inputSchema: { type: 'object' } }];
		getOrCreateActiveClient(agent, defaultChatUri(created.session), 'c1').tools = tools;
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		assert.strictEqual(sdk.startupCallCount, 1, 'first materialize');

		getOrCreateActiveClient(agent, defaultChatUri(created.session), 'c1').tools = [{ name: 'echo', description: 'e', inputSchema: { type: 'object' } }];
		advance.complete();
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.strictEqual(sdk.startupCallCount, 1, 'equal snapshot should NOT yield-restart');
	});

	test('setClientTools on an unknown chat is silently dropped', () => {
		const { agent } = createTestContext(disposables);
		const unknownChat = defaultChatUri(URI.parse('claude:/never-existed'));
		assert.doesNotThrow(() => {
			getOrCreateActiveClient(agent, unknownChat, 'c1').tools = [{ name: 't', inputSchema: { type: 'object' } }];
		});
	});

	test('onClientToolCallComplete resolves the parked deferred keyed by tool_use_id', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		getOrCreateActiveClient(agent, defaultChatUri(created.session), 'c1').tools = [{ name: 'echo', inputSchema: { type: 'object' } }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'go', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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
		// No runtime is registered for the exact chat; completion is a no-op.
		assert.doesNotThrow(() => {
			agent.onClientToolCallComplete(chat, 'tu_anything', { success: true, pastTenseMessage: 'ran' });
		});
	});

	test('chat teardown rejects every parked client-tool call with CancellationError', async () => {
		// Since the bridge is gone, the only way to park on the session's
		// registry is through the real MCP handler, which is hard to drive
		// from FakeQuery. The unit-level guarantee is covered by
		// PendingRequestRegistry tests; here we just assert that dispose
		// does not throw when there are no parked calls (the common case).
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		getOrCreateActiveClient(agent, defaultChatUri(created.session), 'c1').tools = [{ name: 'echo', inputSchema: { type: 'object' } }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'go', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		await assert.doesNotReject(disposeSession(agent, created.session));
	});

	test('FakeQuery.setMcpServers stays unmodeled (Phase 10 never calls Query.setMcpServers for client tools)', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		getOrCreateActiveClient(agent, defaultChatUri(created.session), 'c1').tools = [{ name: 'echo', inputSchema: { type: 'object' } }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		// Change tools to force a rebind path (must use yield-restart, NOT Query.setMcpServers).
		getOrCreateActiveClient(agent, defaultChatUri(created.session), 'c1').tools = [{ name: 'echo2', inputSchema: { type: 'object' } }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));
		// If `Query.setMcpServers` had been called, `FakeQuery.setMcpServers` would have thrown.
		assert.strictEqual(sdk.startupCallCount, 2, 'rebind path used yield-restart, not setMcpServers');
	});

	test('setClientTools landing during the materialize gap is re-synced into the live session', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		// Initial snapshot before materialize starts.
		getOrCreateActiveClient(agent, defaultChatUri(created.session), 'c1').tools = [{ name: 'first', inputSchema: { type: 'object' } }];

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

		const send = agent.chats.sendMessage(defaultChatUri(created.session), 'go', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		// Wait until the materializer has snapshotted ['first'] into the diff
		// and is paused inside `sdk.startup`. THEN inject the update.
		await startupReached.p;
		getOrCreateActiveClient(agent, defaultChatUri(created.session), 'c1').tools = [{ name: 'second', inputSchema: { type: 'object' } }];
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

		await bindDefaultChat(agent, sessionUri);
		const send = agent.chats.sendMessage(defaultChatUri(sessionUri), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(sessionUri)));
		// Wait until the resume's `sdk.startup` is in flight, then inject the
		// update. Pre-fix the call hit the silent-drop branch because no
		// provisional was registered for the resume.
		await startupReached.p;
		getOrCreateActiveClient(agent, defaultChatUri(sessionUri), 'c1').tools = [{ name: 'resumed', inputSchema: { type: 'object' } }];
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
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		// Pause the iterator after the first result so the pipeline doesn't
		// auto-rebind via "stream ended without result".
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (i: number) => { if (i === 2) { await advance.p; } };
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];

		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		assert.strictEqual(sdk.startupCallCount, 1);

		// Stage a rebind whose startup will reject.
		getOrCreateActiveClient(agent, defaultChatUri(created.session), 'c1').tools = [{ name: 'echo', inputSchema: { type: 'object' } }];
		sdk.startupRejection = new Error('simulated rebind startup failure');
		sdk.queryAdvance = undefined;
		advance.complete();
		await assert.rejects(agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session))));

		// Pre-fix: `_buildClientMcpServers` consumed the diff, but the SDK
		// startup that followed rejected without re-marking dirty, so the next
		// send skipped the rebind branch and silently kept the stale server
		// set. Post-fix: the rematerializer's catch re-marks dirty, so this
		// send retries the rebind and succeeds.
		sdk.startupRejection = undefined;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'third', undefined, undefined, 'turn-3', undefined, undefined, chatContext(defaultChatUri(created.session)));
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

suite('ClaudeAgent — agent SDK setup channel', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** What the workbench would read off root state right now. */
	function readSetup(ctx: ITestContext) {
		return readAgentSdkSetupInfos(ctx.stateManager.rootState).find(setup => setup.agent === 'claude');
	}

	/** Addresses a download request at an agent the way `IAgentSdkSetupService` does. */
	function dispatchDownload(ctx: ITestContext, agent = 'claude', request = 'req-1'): void {
		ctx.configService.updateRootConfig({ [AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY]: { agent, request } });
	}

	/** Addresses a reload request the same way, as the banner's link does. */
	function dispatchReload(ctx: ITestContext, agent = 'claude', request = 'req-1'): void {
		ctx.configService.updateRootConfig({ [AGENT_SDK_SETUP_RELOAD_REQUEST_KEY]: { agent, request } });
	}

	/** Waits for the ctor's queued publish (and any refresh it chains) to settle. */
	async function settle(): Promise<void> {
		for (let i = 0; i < 20; i++) {
			await tick();
		}
	}

	test('an SDK already on disk publishes `ready` plus the docs URL the banner links to', async () => {
		const ctx = createTestContext(disposables);
		await settle();

		assert.deepStrictEqual(readSetup(ctx), {
			agent: 'claude',
			download: 'ready',
			setupDocsUrl: 'https://code.claude.com/docs/en/third-party-integrations',
			// No in-app sign-in: every Claude credential is established outside the
			// app, so the banner can only point at the docs.
			signInProviderName: undefined,
		});
	});

	test('a cold cache publishes `notDownloaded`, which is what turns the banner into an offer', async () => {
		const ctx = createTestContext(disposables);
		ctx.sdk.canLoadWithoutDownloadResult = false;
		await ctx.agent.refreshModels();
		await settle();

		assert.strictEqual(readSetup(ctx)?.download, 'notDownloaded');
	});

	test('an explicit download fetches the SDK, holds progress interest for the fetch, and ends at `ready`', async () => {
		const ctx = createTestContext(disposables);
		ctx.sdk.canLoadWithoutDownloadResult = false;
		let releaseDownload = () => { };
		ctx.sdk.ensureAvailableGate = new Promise<void>(resolve => {
			// Releasing the gate is the moment the SDK lands on disk.
			releaseDownload = () => { ctx.sdk.canLoadWithoutDownloadResult = true; resolve(); };
		});
		await ctx.agent.refreshModels();
		await settle();

		dispatchDownload(ctx);
		await settle();
		const inFlight = {
			download: readSetup(ctx)?.download,
			interests: [...ctx.sdkDownloader.progressInterests],
			held: ctx.sdkDownloader.heldProgressInterests,
			fetches: ctx.sdk.ensureAvailableCalls,
		};

		releaseDownload();
		await settle();

		assert.deepStrictEqual({ inFlight, after: readSetup(ctx)?.download, held: ctx.sdkDownloader.heldProgressInterests }, {
			inFlight: { download: 'downloading', interests: ['claude'], held: 1, fetches: 1 },
			after: 'ready',
			held: 0,
		});
	});

	test('a download that lands stays `downloading` until the catalog does, so the banner never flashes "no account"', async () => {
		const ctx = createTestContext(disposables, { nativeAccount: NATIVE_ACCOUNT });
		// Let the constructor's own refresh reach enumeration before the gate below
		// goes up, so the only blocked enumeration is the download's.
		for (let i = 0; i < 100 && ctx.sdk.supportedModelsCallCount === 0; i++) {
			await tick();
		}
		ctx.sdk.canLoadWithoutDownloadResult = false;
		await ctx.agent.refreshModels();
		await settle();

		ctx.sdk.supportedModelsResult = [
			{ value: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', description: '', supportedEffortLevels: ['high'] },
		];
		let releaseEnumeration = () => { };
		ctx.sdk.supportedModelsGate = new Promise<void>(resolve => { releaseEnumeration = resolve; });
		// Resolving the fetch is the moment the SDK lands on disk.
		ctx.sdk.ensureAvailableGate = Promise.resolve().then(() => { ctx.sdk.canLoadWithoutDownloadResult = true; });
		const enumerationsBefore = ctx.sdk.supportedModelsCallCount;

		dispatchDownload(ctx);
		for (let i = 0; i < 100 && ctx.sdk.supportedModelsCallCount === enumerationsBefore; i++) {
			await tick();
		}
		const enumerating = { download: readSetup(ctx)?.download, models: ctx.agent.models.get().length };

		releaseEnumeration();
		for (let i = 0; i < 100 && ctx.agent.models.get().length === 0; i++) {
			await tick();
		}
		await settle();

		assert.deepStrictEqual({ enumerating, after: readSetup(ctx)?.download, models: ctx.agent.models.get().length }, {
			// `ready` while the catalog is still empty is precisely how the window
			// renders "we looked and found no account".
			enumerating: { download: 'downloading', models: 0 },
			after: 'ready',
			models: 1,
		});
	});

	test('the request key is cleared as it is consumed, so an identical later press still lands', async () => {
		const ctx = createTestContext(disposables);
		ctx.sdk.canLoadWithoutDownloadResult = false;
		await ctx.agent.refreshModels();
		await settle();

		dispatchDownload(ctx, 'claude', 'press-1');
		await settle();
		const consumed = ctx.configService.getRootConfigValues()[AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY];

		dispatchDownload(ctx, 'claude', 'press-2');
		await settle();

		assert.deepStrictEqual({ consumed, fetches: ctx.sdk.ensureAvailableCalls }, { consumed: undefined, fetches: 2 });
	});

	test('a request addressed to another agent is ignored', async () => {
		const ctx = createTestContext(disposables);
		ctx.sdk.canLoadWithoutDownloadResult = false;
		await ctx.agent.refreshModels();
		await settle();

		dispatchDownload(ctx, 'codex');
		await settle();

		assert.deepStrictEqual({
			fetches: ctx.sdk.ensureAvailableCalls,
			// Left in place for the agent it names, rather than consumed by this one.
			key: ctx.configService.getRootConfigValues()[AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY],
		}, {
			fetches: 0,
			key: { agent: 'codex', request: 'req-1' },
		});
	});

	test('a failed download releases the progress interest and stops claiming to be downloading', async () => {
		const ctx = createTestContext(disposables);
		ctx.sdk.canLoadWithoutDownloadResult = false;
		ctx.sdk.ensureAvailableRejection = new Error('CDN unreachable');
		await ctx.agent.refreshModels();
		await settle();

		dispatchDownload(ctx);
		await settle();

		assert.deepStrictEqual({
			download: readSetup(ctx)?.download,
			held: ctx.sdkDownloader.heldProgressInterests,
		}, {
			download: 'notDownloaded',
			held: 0,
		});
	});

	test('chat discovery waits for the SDK rather than fetching it, and runs again once it lands', async () => {
		// The catalog of migratable Claude Code chats lives inside the SDK, so
		// discovery used to fetch one at startup — hundreds of megabytes for a
		// user still being asked whether they want it.
		const ctx = createTestContext(disposables);
		ctx.sdk.canLoadWithoutDownloadResult = false;
		ctx.sdk.sessionList = [{ sessionId: 'from-claude-code', summary: 'An existing chat', lastModified: 1000, createdAt: 900 }];
		// Subscribing is what starts discovery.
		const discovered: number[] = [];
		disposables.add(ctx.agent.onDidDiscoverChats(chats => discovered.push(chats.length)));
		await settle();
		const cold = {
			discovered: [...discovered],
			// `undefined` is "ask again later", as distinct from "nothing to migrate".
			migratable: await ctx.agent.listChatsToMigrate(),
			fetches: ctx.sdk.ensureAvailableCalls,
		};

		let landed = () => { };
		ctx.sdk.ensureAvailableGate = new Promise<void>(resolve => {
			landed = () => { ctx.sdk.canLoadWithoutDownloadResult = true; resolve(); };
		});
		dispatchDownload(ctx);
		await settle();
		const inFlight = [...discovered];

		landed();
		await settle();

		assert.deepStrictEqual({ cold, inFlight, after: discovered, migratable: await ctx.agent.listChatsToMigrate() }, {
			cold: { discovered: [], migratable: undefined, fetches: 0 },
			inFlight: [],
			after: [1],
			migratable: [],
		});
	});

	test('a reload re-asks the SDK for the account the user set up elsewhere, fetching nothing', async () => {
		// Setup happens outside the app, so nothing fires when it finishes — a fresh
		// `accountInfo()` is the only way to see it, and the SDK is already on disk.
		const ctx = createTestContext(disposables);
		await settle();
		const before = ctx.sdk.accountInfoCallCount;
		ctx.sdk.accountInfoResult = NATIVE_ACCOUNT;
		ctx.sdk.supportedModelsResult = [
			{ value: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', description: '', supportedEffortLevels: ['high'] },
		];

		dispatchReload(ctx);
		await settle();

		assert.deepStrictEqual({
			asked: ctx.sdk.accountInfoCallCount > before,
			fetches: ctx.sdk.ensureAvailableCalls,
			models: ctx.agent.models.get().map(model => model.name),
			// Consumed like the download key, so pressing the link twice is two reloads.
			key: ctx.configService.getRootConfigValues()[AGENT_SDK_SETUP_RELOAD_REQUEST_KEY],
		}, {
			asked: true,
			fetches: 0,
			models: ['Claude Sonnet 4.5'],
			key: undefined,
		});
	});

	test('a reload addressed to another agent is ignored', async () => {
		const ctx = createTestContext(disposables);
		await settle();
		const before = ctx.sdk.accountInfoCallCount;

		dispatchReload(ctx, 'codex');
		await settle();

		assert.deepStrictEqual({
			asked: ctx.sdk.accountInfoCallCount > before,
			// Left in place for the agent it names, rather than consumed by this one.
			key: ctx.configService.getRootConfigValues()[AGENT_SDK_SETUP_RELOAD_REQUEST_KEY],
		}, {
			asked: false,
			key: { agent: 'codex', request: 'req-1' },
		});
	});
});

suite('ClaudeAgent — per-session provider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * The per-session proxy bearer (`ANTHROPIC_AUTH_TOKEN`) is injected into
	 * `Options.settings.env` only for the Copilot proxy transport; the native
	 * transport omits it (see `buildOptions`). Its presence is the cast-free
	 * discriminator for which transport a captured startup ran on.
	 */
	function proxyAuthTokenOf(options: Options | undefined): string | undefined {
		const settings = options?.settings;
		if (!settings || typeof settings === 'string') {
			return undefined;
		}
		return settings.env?.ANTHROPIC_AUTH_TOKEN;
	}

	/**
	 * Materialize a signed-in session by running one full turn, mirroring the
	 * top-level `materialize()` helper. Defaults to a Copilot (proxy) model. With
	 * `block`, turn-1 parks the query iterator at index 2 (an extra staged result)
	 * so a follow-up turn drains a hot-swap on the SAME live query — the returned
	 * `advance` releases it. Without `block`, turn-1 fully drains so a follow-up
	 * send rebuilds/resumes on a fresh query.
	 */
	async function materializeSession(
		ctx: ITestContext,
		opts?: { readonly model?: { readonly id: string }; readonly block?: boolean },
	): Promise<{ readonly sessionUri: URI; readonly sessionId: string; readonly advance: DeferredPromise<void> }> {
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		const model = opts?.model ?? { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4.6') };
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/workspace')], model });
		const sessionId = created.sdkSessionId;
		const advance = new DeferredPromise<void>();
		if (opts?.block) {
			ctx.sdk.queryAdvance = async (i: number) => { if (i === 2) { await advance.p; } };
			ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId), makeResultSuccess(sessionId)];
		} else {
			ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		}
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		return { sessionUri: created.session, sessionId, advance };
	}

	test('a cross-transport model switch defers, then rebuilds on the new (native) transport at the next send (US 11)', async () => {
		const ctx = createTestContext(disposables);
		const { sessionUri, sessionId } = await materializeSession(ctx);
		const nativeModel = { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-sonnet-4-5-20250929') };

		// Switching to a native-qualified model on a live proxy session defers:
		// no hot-swap on the old transport, and no rebuild until the next send.
		await ctx.agent.chats.changeModel(defaultChatUri(sessionUri), nativeModel, chatContext(defaultChatUri(sessionUri)));
		const atSwitch = {
			startups: ctx.sdk.startupCallCount,
			hotSwaps: ctx.sdk.warmQueries[0]?.produced?.recordedModels ?? [],
		};

		// The next send consumes the pending switch: a fresh subprocess is
		// materialized on the native transport, resuming the same session id.
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'again', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(sessionUri)));
		const rebuild = ctx.sdk.capturedStartupOptions[1];

		assert.deepStrictEqual({
			atSwitch,
			afterSendStartups: ctx.sdk.startupCallCount,
			initialWasProxy: proxyAuthTokenOf(ctx.sdk.capturedStartupOptions[0]) !== undefined,
			rebuild: { model: rebuild?.model, resume: rebuild?.resume, isProxy: proxyAuthTokenOf(rebuild) !== undefined },
			// The rebuild resumes the transcript, which replays the pre-switch
			// `/model`; the pipeline must re-assert the SWITCHED model onto the fresh
			// query, not the stale pre-switch one — else the new transport runs the
			// old model and 400s (`model_not_supported`).
			replayedOnRebuild: ctx.sdk.warmQueries[1]?.produced?.recordedModels ?? [],
		}, {
			atSwitch: { startups: 1, hotSwaps: [] },
			afterSendStartups: 2,
			initialWasProxy: true,
			rebuild: { model: 'claude-sonnet-4-5', resume: sessionId, isProxy: false },
			replayedOnRebuild: ['claude-sonnet-4-5'],
		});
	});

	test('a same-transport model change still hot-swaps the live query (no rebuild)', async () => {
		const ctx = createTestContext(disposables);
		const { sessionUri, advance } = await materializeSession(ctx, { block: true });

		// Another Copilot-qualified model is the same transport → the change is
		// pushed onto the live query in place, never rebuilding the subprocess.
		await ctx.agent.chats.changeModel(defaultChatUri(sessionUri), { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-sonnet-4-5-20250929') }, chatContext(defaultChatUri(sessionUri)));

		// Drive one more turn on the same (parked) query so it drains cleanly.
		const p2 = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'again', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(sessionUri)));
		await tick();
		advance.complete();
		await p2;

		assert.deepStrictEqual({
			startups: ctx.sdk.startupCallCount,
			hotSwaps: ctx.sdk.warmQueries[0]?.produced?.recordedModels ?? [],
		}, {
			startups: 1,
			hotSwaps: ['claude-sonnet-4-5'],
		});
	});

	test('a switch during an in-flight turn leaves it untouched; the rebuild fires only on the next send (US 12)', async () => {
		const ctx = createTestContext(disposables);
		const { sessionUri, sessionId, advance } = await materializeSession(ctx, { block: true });
		const nativeModel = { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-sonnet-4-5-20250929') };

		// Turn 2 is in flight (parked in the SDK). A switch issued now serializes
		// behind it on the session sequencer and must not disturb the running turn.
		const inflight = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'turn 2', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(sessionUri)));
		await tick();
		const switching = ctx.agent.chats.changeModel(defaultChatUri(sessionUri), nativeModel, chatContext(defaultChatUri(sessionUri)));
		await tick();
		const duringTurn = { startups: ctx.sdk.startupCallCount, warmQueries: ctx.sdk.warmQueries.length };

		// Release the in-flight turn; only then does the queued switch apply (as a
		// deferral — still no rebuild, no hot-swap on the old transport).
		advance.complete();
		await inflight;
		await switching;
		const afterSwitch = { startups: ctx.sdk.startupCallCount, hotSwaps: ctx.sdk.warmQueries[0]?.produced?.recordedModels ?? [] };

		// The subsequent send is what rebuilds onto the native transport.
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'turn 3', undefined, undefined, 'turn-3', undefined, undefined, chatContext(defaultChatUri(sessionUri)));
		const rebuild = ctx.sdk.capturedStartupOptions.at(-1);

		assert.deepStrictEqual({
			duringTurn,
			afterSwitch,
			afterNextSend: { startups: ctx.sdk.startupCallCount, isNative: proxyAuthTokenOf(rebuild) === undefined, model: rebuild?.model },
		}, {
			duringTurn: { startups: 1, warmQueries: 1 },
			afterSwitch: { startups: 1, hotSwaps: [] },
			afterNextSend: { startups: 2, isNative: true, model: 'claude-sonnet-4-5' },
		});
	});

	test('a native→Copilot switch while signed out surfaces AHP_AUTH_REQUIRED on the next send, then rebuilds once signed in (US 27)', async () => {
		const ctx = createTestContext(disposables);
		const nativeModel = { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-sonnet-4-5-20250929') };
		const copilotModel = { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4.6') };

		// Materialize native while signed out (native needs no proxy handle).
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/workspace')], model: nativeModel });
		const sessionId = created.sdkSessionId;
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		// Switch to a Copilot model → deferred. The next send's rebuild resolves the
		// proxy transport, which requires a GitHub sign-in that is absent.
		await ctx.agent.chats.changeModel(defaultChatUri(created.session), copilotModel, chatContext(defaultChatUri(created.session)));
		const first = await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'turn 2', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)))
			.then(() => 'sent', (err: unknown) => (err instanceof ProtocolError && err.code === AHP_AUTH_REQUIRED) ? 'auth-required' : `unexpected:${err}`);
		const startupsAfterFailure = ctx.sdk.startupCallCount;

		// Signing in provides the proxy handle; the still-pending switch rebuilds
		// on the Copilot proxy at the next send (US 27: Copilot required again).
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'turn 3', undefined, undefined, 'turn-3', undefined, undefined, chatContext(defaultChatUri(created.session)));
		const rebuild = ctx.sdk.capturedStartupOptions.at(-1);

		assert.deepStrictEqual({
			first,
			startupsAfterFailure,
			startupsAfterAuth: ctx.sdk.startupCallCount,
			rebuiltProxy: proxyAuthTokenOf(rebuild) !== undefined,
			rebuildModel: rebuild?.model,
		}, {
			first: 'auth-required',
			startupsAfterFailure: 1,
			startupsAfterAuth: 2,
			rebuiltProxy: true,
			rebuildModel: 'claude-opus-4-6',
		});
	});

	test('with a runtime host-default transport flip, a live session is not rerouted on an ordinary (non-switch) rebuild', async () => {
		// Byte-identity guard for the live-switch machinery. Pre-feature the
		// transport was fixed at materialize and every warm rebuild reused it. An
		// ordinary rebuild — here a crash-recovery resume, NOT a provider switch —
		// must still reuse the transport the session materialized under even after
		// the host-global default flips underneath it. Otherwise signing into
		// Copilot mid-conversation would silently drag a running native
		// (BYO-Anthropic) session onto the proxy on its next rebind.
		const ctx = createTestContext(disposables, {
			rootConfig: { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true },
			nativeAccount: NATIVE_ACCOUNT,
		});
		// The host default only becomes native once the SDK has been *asked* about
		// the account — that answer is what `_defaultTransportMode` reads. Await a
		// full refresh, or this materializes on the proxy default and throws
		// `AHP_AUTH_REQUIRED` while signed out.
		await ctx.agent.refreshModels();

		// Materialize a native session while signed out: turn-1 starts the
		// subprocess (system_init) then crashes mid-stream, leaving it needing a
		// warm rebind on the next send.
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/workspace')], model: { id: 'claude-sonnet-4-5-20250929' } });
		const sid = created.sdkSessionId;
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid)];
		ctx.sdk.queryAdvance = async (i: number) => { if (i === 1) { throw new Error('subprocess crashed'); } };
		await assert.rejects(
			ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session))),
			(err: Error) => err.message.includes('subprocess crashed'),
		);
		ctx.sdk.queryAdvance = undefined;

		// Sign into Copilot: this flips the host default native→proxy and
		// acquires a proxy handle.
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();

		// Positive control that the flip is live: a brand-new session now
		// materializes on the proxy (carrying the per-session bearer token).
		const fresh = await createSession(ctx.agent, { workingDirectories: [URI.file('/fresh')], model: { id: 'claude-opus-4.6' } });
		const freshSid = fresh.sdkSessionId;
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(freshSid), makeResultSuccess(freshSid)];
		await ctx.agent.chats.sendMessage(defaultChatUri(fresh.session), 'hi', undefined, undefined, 'fresh-1', undefined, undefined, chatContext(defaultChatUri(fresh.session)));

		// Recover the ORIGINAL session: the next send warm-rebuilds it (resume),
		// and that rebuild must stay native despite the flipped host default.
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'recover', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.deepStrictEqual({
			originalMaterializeNative: proxyAuthTokenOf(ctx.sdk.capturedStartupOptions[0]) === undefined,
			freshSessionProxy: proxyAuthTokenOf(ctx.sdk.capturedStartupOptions[1]) !== undefined,
			rebuild: {
				resume: ctx.sdk.capturedStartupOptions[2]?.resume,
				stayedNative: proxyAuthTokenOf(ctx.sdk.capturedStartupOptions[2]) === undefined,
			},
			totalStartups: ctx.sdk.startupCallCount,
		}, {
			originalMaterializeNative: true,
			freshSessionProxy: true,
			rebuild: { resume: sid, stayedNative: true },
			totalStartups: 3,
		});
	});

	test('a Copilot→native switch survives a cold resume: the reload rematerializes on native', async () => {
		const ctx = createTestContext(disposables);
		const { sessionUri, sessionId } = await materializeSession(ctx);
		const nativeModel = { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-sonnet-4-5-20250929') };

		// Switch persists the native model to the overlay, then tear the session
		// down so the next send has to cold-resume from that overlay.
		await ctx.agent.chats.changeModel(defaultChatUri(sessionUri), nativeModel, chatContext(defaultChatUri(sessionUri)));
		await releaseDefaultChat(ctx.agent, sessionUri);

		ctx.sdk.sessionList = [{ sessionId, cwd: URI.file('/workspace').fsPath, summary: '', lastModified: Date.now() }];
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'turn 2', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(sessionUri)));
		const resumed = ctx.sdk.capturedStartupOptions.at(-1);

		// Resume derives transport from the persisted model, not the stale
		// `transport` overlay field — so the reload lands on native.
		assert.deepStrictEqual({
			model: resumed?.model,
			resume: resumed?.resume,
			isNative: proxyAuthTokenOf(resumed) === undefined,
		}, {
			model: 'claude-sonnet-4-5',
			resume: sessionId,
			isNative: true,
		});
	});

	test('the Copilot resource is unconditionally optional, whatever the opt-in or the SDK account report says', async () => {
		// The load-bearing assertion of the whole feature. `required: false` is what
		// stops `resolveAgentAuthRequirement` answering `GitHub` for this session
		// type; when *every* type answers `GitHub`, `resolveSignedOutWindowGate`
		// puts a non-dismissible sign-in wall over the entire Agents window.
		//
		// The full 2x2 is asserted because the behavior it replaces was a 2x2 with
		// three `true`s in it: neither the opt-in nor the account report may bring
		// the requirement back. Even with no Claude account the type reads as
		// `Unusable` rather than `GitHub`, which is what opens the window. The flag
		// is absent by design — it gates this one level up, in
		// `resolveSignedOutWindowGate`.
		const advertisedRequirement = async (inputs: { optIn: boolean; account: boolean }) => {
			const { agent } = createTestContext(disposables, {
				...(inputs.optIn ? { rootConfig: { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true } } : {}),
				...(inputs.account ? { nativeAccount: NATIVE_ACCOUNT } : {}),
			});
			// Let the account probe land. The old answer keyed on exactly this fact,
			// so without the wait both halves of the matrix would be asserting the
			// same pre-probe state and the test would pass vacuously.
			await agent.refreshModels();
			return agent.getProtectedResources().find(r => r.resource === 'https://api.github.com')?.required;
		};

		assert.deepStrictEqual({
			optInOnWithAccount: await advertisedRequirement({ optIn: true, account: true }),
			optInOffWithAccount: await advertisedRequirement({ optIn: false, account: true }),
			optInOnNoAccount: await advertisedRequirement({ optIn: true, account: false }),
			optInOffNoAccount: await advertisedRequirement({ optIn: false, account: false }),
		}, {
			optInOnWithAccount: false,
			optInOffWithAccount: false,
			optInOnNoAccount: false,
			optInOffNoAccount: false,
		});
	});

	test('the Copilot resource is advertised, never dropped, so the silent token probe survives', async () => {
		// `authenticateProtectedResources` matches on `resource` and ignores
		// `required`, so dropping it would break sign-in forwarding.
		const optional = createTestContext(disposables, {
			rootConfig: { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true },
			nativeAccount: NATIVE_ACCOUNT,
		}).agent.getProtectedResources();
		assert.deepStrictEqual(optional.map(r => ({ resource: r.resource, required: r.required })), [
			{ resource: 'https://api.github.com', required: false },
			{ resource: 'https://api.github.com/repos', required: false },
		]);
	});

	test('merged catalog lists both providers, each id provider-qualified', async () => {
		const { agent, api, sdk } = createTestContext(disposables, { nativeAccount: NATIVE_ACCOUNT });
		api.models = async () => [CLAUDE_OPUS];
		sdk.supportedModelsResult = [
			{ value: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', description: '' },
		];
		await agent.authenticate('https://api.github.com', 'tok');
		await agent.refreshModels();
		await tick();

		// Proxy first (preserves `models[0]`-is-default), then native; each id is
		// rewritten to its provider-qualified form so the picked row carries its
		// transport.
		assert.deepStrictEqual(agent.models.get().map(m => ({ id: m.id, name: m.name })), [
			{ id: toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4.6'), name: 'Claude Opus 4.6' },
			{ id: toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-sonnet-4-5-20250929'), name: 'Claude Sonnet 4.5' },
		]);
	});

	test('per-session transport gates on the picked model, not a global mode', async () => {
		// Signed out (no proxy handle). The transport is derived per session from
		// the picked model: a native-qualified model resolves without GitHub, while
		// a Copilot-qualified one still throws AHP_AUTH_REQUIRED.
		const { agent } = createTestContext(disposables);
		const nativeModel = { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-sonnet-4-5-20250929') };
		const copilotModel = { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4.6') };

		const native = await createSession(agent, { workingDirectories: [URI.file('/ws-native')], model: nativeModel });
		const copilotOutcome = await createSession(agent, { workingDirectories: [URI.file('/ws-copilot')], model: copilotModel })
			.then(() => 'created', err => (err instanceof ProtocolError && err.code === AHP_AUTH_REQUIRED) ? 'auth-required' : `unexpected:${err}`);

		assert.deepStrictEqual(
			{ nativeProvisional: native.provisional, copilotOutcome },
			{ nativeProvisional: true, copilotOutcome: 'auth-required' },
		);
	});

	test('a forked peer chat inherits its never-materialized parent\'s native model and runs native with a bare id, signed out', async () => {
		// Regression (Findings B + E): forking a peer chat from a parent that only
		// ever held its model in `provisionalModel` (never materialized, so nothing
		// in the overlay yet) must inherit that native model — routing the peer
		// chat's transport native so it runs with NO GitHub sign-in — and the
		// provider-qualified selection id must be stripped to the bare, SDK-
		// normalized id before it reaches the subprocess (a `@provider=…` id is
		// unparseable and would 400). The prior weaker form only asserted the chat
		// was created; it never materialized, so it masked both bugs.
		const { agent, sdk, proxy } = createTestContext(disposables);
		const nativeModel = { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-sonnet-4-5-20250929') };
		// Signed out (no `authenticate`) — only the native transport can run here.
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')], model: nativeModel });
		const parentId = created.sdkSessionId;
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.createChat(chatUri, created.session, { ...resolvedChatOptions(), fork: { source: defaultChatUri(created.session), turnId: 'u1' } });

		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(chatUri, 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chatUri));

		// Materialized native (resumed `forked-1`) with the bare model id and
		// without ever starting the proxy.
		assert.deepStrictEqual({
			model: sdk.capturedStartupOptions[0]?.model,
			resume: sdk.capturedStartupOptions[0]?.resume,
			proxyStarts: proxy.startCalls.length,
		}, {
			model: 'claude-sonnet-4-5',
			resume: 'forked-1',
			proxyStarts: 0,
		});
	});

	test('signed out, the native catalog bootstraps with no manual refresh', async () => {
		// Regression (Finding A): the constructor must bootstrap the merged catalog
		// unconditionally — a signed-out window with a native setup has no GitHub
		// token to trigger a proxy refresh, so without this it would never populate
		// its picker and dead-end. No `authenticate`, no explicit `refreshModels`.
		const { agent, sdk } = createTestContext(disposables, { nativeAccount: NATIVE_ACCOUNT });
		sdk.supportedModelsResult = [
			{ value: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', description: '' },
		];
		// The constructor kicks off the initial merged enumeration; wait for it.
		for (let i = 0; i < 100 && sdk.supportedModelsCallCount === 0; i++) {
			await tick();
		}
		await tick();

		// Signed out → the proxy half contributes nothing; only the native
		// models appear, provider-qualified.
		assert.deepStrictEqual(agent.models.get().map(m => m.id), [
			toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-sonnet-4-5-20250929'),
		]);
	});

	test('a failing proxy start does not fail sign-in', async () => {
		// Regression (Finding D): `authenticate` always tries to start the proxy so
		// the merged catalog's Copilot models can run, but a `start()` failure is
		// always soft — GitHub sign-in itself succeeded and a Copilot-routed model
		// simply re-drives sign-in on its first send. So a transient failure must
		// resolve sign-in as success, not reject. (Shown here on a first sign-in,
		// where there is no prior handle to tear down.)
		const { agent, proxy } = createTestContext(disposables);
		proxy.startError = new Error('proxy boom');

		const ok = await agent.authenticate('https://api.github.com', 'tok');

		assert.deepStrictEqual({ ok, proxyStartAttempts: proxy.startCalls.length }, { ok: true, proxyStartAttempts: 1 });
	});

	test('a replacement token whose proxy start fails tears down the prior account instead of silently serving it', async () => {
		// Regression (#5): sign-in commits account A (handle + token + models). A
		// replacement token B then arrives whose `start()` fails. Keeping A's live
		// handle would silently run every Copilot-routed session under A behind a
		// "successful" B sign-in. So the stale handle is disposed and the token
		// cleared together (upholding the `_githubToken` ↔ `_proxyHandle` invariant):
		// A's models drop to empty and a Copilot-routed session now demands fresh
		// sign-in (`AHP_AUTH_REQUIRED`) rather than reusing A. Contrast the soft
		// first-sign-in failures above, which have no prior handle to tear down.
		const { agent, proxy } = createTestContext(disposables);
		let failNext = false;
		proxy.start = async (token: string) => {
			proxy.startCalls.push({ token });
			if (failNext) {
				throw new Error('proxy bind failed');
			}
			return { baseUrl: 'http://127.0.0.1:0', nonce: `nonce-for-${token}`, dispose: () => { proxy.disposeCount++; } };
		};

		// Account A signs in cleanly: start() succeeds and the merged catalog populates.
		await agent.authenticate('https://api.github.com', 'tokA');
		await tick();
		const modelsUnderA = agent.models.get().length;

		// Account B replaces A but its start() fails.
		failNext = true;
		await agent.authenticate('https://api.github.com', 'tokB');
		await tick();

		// A Copilot-routed (model-less ⇒ proxy default) session must now demand
		// sign-in rather than run under the superseded account A.
		let createError: unknown;
		try {
			await createSession(agent, { workingDirectories: [URI.file('/workspace')] });
		} catch (err) {
			createError = err;
		}

		assert.deepStrictEqual({
			hadModelsUnderA: modelsUnderA > 0,
			startTokens: proxy.startCalls.map(c => c.token),
			staleHandleDisposed: proxy.disposeCount,
			modelsAfterFailedReplacement: agent.models.get(),
			copilotSessionDemandsSignIn: createError instanceof ProtocolError && createError.code === AHP_AUTH_REQUIRED,
		}, {
			hadModelsUnderA: true,
			startTokens: ['tokA', 'tokB'],
			staleHandleDisposed: 1,
			modelsAfterFailedReplacement: [],
			copilotSessionDemandsSignIn: true,
		});
	});
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
		const workingDirectoryPendingChange = disposables.add(new Emitter<string>());
		const fakeConfigService: IAgentConfigurationService = {
			onDidRootConfigChange: Event.None,
			onDidSessionConfigChange: Event.None,
			getSessionConfigValues: () => undefined,
			onDidChangeWorkingDirectoryPending: workingDirectoryPendingChange.event,
		} as unknown as IAgentConfigurationService;
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionData = new RecordingSessionDataService(createSessionDataService());
		const services = new ServiceCollection(
			...claudeFileEnvServices(disposables),
			[ILogService, new NullLogService()],
			[IAgentConfigurationService, fakeConfigService],
			[IAgentHostStateManager, stateManager],
			[IAgentHostCustomizationEnablementService, reducerBackedEnablementService(stateManager)],
			[IAgentHostOTelService, new RecordingOTelService()],
			[IClaudeAgentSdkService, sdk],
			[ICopilotApiService, new FakeCopilotApiService()],
			[IAgentHostAuthenticationService, disposables.add(new FakeAgentHostAuthenticationService())],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader()],
			[IAgentPluginManager, new FakeAgentPluginManager()],
			[ISessionDataService, sessionData],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const session = disposables.add(ClaudeAgentSession.createProvisional(
			'session-id',
			URI.parse(buildDefaultChatUri('claude:/session-id')),
			URI.file('/workspace'),
			undefined,
			undefined,
			undefined,
			undefined,
			new PendingRequestRegistry<CallToolResult>(),
			'default',
			instantiationService,
		));
		await session.materialize({
			transport: { kind: 'proxy', handle: { baseUrl: 'http://127.0.0.1:0', nonce: 'n', dispose: () => { } } },
			canUseTool: async () => ({ behavior: 'deny', message: 'unused' }),
			onElicitation: async () => ({ action: 'cancel' }),
			isResume: false,
			resource: URI.parse('claude:/session-id'),
			configResource: URI.parse('claude:/session-id'),
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

	class FakeServerToolHost implements IAgentServerToolHost {
		readonly definitions: readonly ToolDefinition[] = [{
			name: 'viewUnreviewedComments',
			description: 'View unreviewed comments',
			inputSchema: { type: 'object', properties: {} },
		}];
		readonly toolNames = this.definitions.map(definition => definition.name);
		confirmationRequiredForSession = false;

		advertise(): void { }
		getDefinitionsForSession(): readonly ToolDefinition[] { return this.definitions; }
		canRequireConfirmation(): boolean { return true; }
		requiresConfirmation(): boolean { return this.confirmationRequiredForSession; }
		executeTool(): string { return 'ok'; }
	}

	/**
	 * Materialize a session and return its captured `canUseTool` closure
	 * alongside the {@link ITestContext} pieces tests need. Drives a
	 * minimal in-flight turn so
	 * {@link FakeClaudeAgentSdkService.capturedStartupOptions}[0] is
	 * populated and the session lives in `_sessions`.
	 *
	 * Also seeds a {@link SessionSummary} into the
	 * {@link AgentHostStateManager} so {@link AgentConfigurationService}
	 * can read/write the session's `permissionMode` (the agent's
	 * `createSession` does NOT touch state — that's the AgentService
	 * layer's job, which we don't run here).
	 */
	async function materialize(seedConfig?: { permissionMode?: string }, serverToolHost?: IAgentServerToolHost): Promise<{
		ctx: ITestContext;
		canUseTool: NonNullable<Options['canUseTool']>;
		sessionUri: URI;
		sessionId: string;
	}> {
		const ctx = createTestContext(disposables);
		if (serverToolHost) {
			ctx.agent.setServerToolHost(serverToolHost);
		}
		await ctx.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

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

		await startActiveTurn(disposables, ctx, created.session, sessionId);

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
			requestId: toolUseID,
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

	test('server tool with nothing to confirm is allowed without prompting', async () => {
		const host = new FakeServerToolHost();
		const { ctx, canUseTool } = await materialize(undefined, host);
		const signals: AgentSignal[] = [];
		disposables.add(ctx.agent.onDidChatProgress(signal => signals.push(signal)));

		const result = await canUseTool('mcp__host__viewUnreviewedComments', {}, makeOptions('tu_empty_comments'));

		assert.deepStrictEqual({
			result,
			pendingConfirmations: signals.filter(signal => signal.kind === 'pending_confirmation').length,
		}, {
			result: { behavior: 'allow', updatedInput: {} },
			pendingConfirmations: 0,
		});
	});

	// Tests 3 and 4 (bypassPermissions / acceptEdits auto-allow) intentionally
	// omitted: the SDK auto-approves under those modes BEFORE invoking
	// `canUseTool`, so there is no host-side branch to exercise. See
	// `_handleCanUseTool` JSDoc.
	//
	// Tests 5 and 6 (plan-mode auto-deny / live config flip) intentionally
	// omitted: `_handleCanUseTool` makes no permission-mode-aware decisions
	// for SDK tools; whatever the SDK delegates is
	// surfaced to the user verbatim. Mode-driven behavior is covered by
	// the §3.6 SDK-forwarding tests (live `setPermissionMode`).

	test('Test 7 — pending_confirmation signal carries the correct shape', async () => {
		const { ctx, canUseTool, sessionUri } = await materialize();

		const signals: AgentSignal[] = [];
		disposables.add(ctx.agent.onDidChatProgress(s => signals.push(s)));

		const promise = canUseTool('Read', { file_path: '/tmp/foo.txt' }, makeOptions('tu_shape'));
		await tick();

		const captured = signals.find(s => s.kind === 'pending_confirmation');
		ctx.agent.respondToPermissionRequest('tu_shape', true);
		await promise;

		// The agent keys its chat map by the default-chat URI, which populates
		// that URI's cached string form on the emitted object; mirror it on the
		// expected URI so the deep-equal is not tripped by the internal cache.
		const expectedChat = URI.parse(buildDefaultChatUri(sessionUri));
		expectedChat.toString();
		assert.deepStrictEqual(captured, {
			kind: 'pending_confirmation',
			chat: expectedChat,
			state: {
				status: ToolCallStatus.PendingConfirmation,
				toolCallId: 'tu_shape',
				toolName: 'Read',
				displayName: 'Read file',
				invocationMessage: { markdown: 'Read [foo.txt](file:///tmp/foo.txt)' },
				toolInput: '{\n  "file_path": "/tmp/foo.txt"\n}',
				confirmationTitle: 'Read file?',
				_meta: { toolKind: 'read' },
			},
			permissionKind: 'read',
			permissionPath: '/tmp/foo.txt',
		});
	});

	test('Test 8 — synchronous auto-respond inside pending_confirmation listener resolves canUseTool', async () => {
		// Regression: the `agentSideEffects` auto-approval path responds
		// synchronously inside `onDidChatProgress.fire(...)`. If the
		// permission deferred is registered AFTER the fire, that response
		// hits an empty pending map and the SDK's `canUseTool` deadlocks.
		// Mirror the synchronous-respond pattern here and assert the
		// canUseTool promise resolves with `allow`.
		const { ctx, canUseTool } = await materialize();

		disposables.add(ctx.agent.onDidChatProgress(s => {
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

		const session = ctx.agent.getSessionForTesting(sessionUri);
		assert.ok(session, 'session is materialized');

		const ac = new AbortController();
		const options: Parameters<NonNullable<Options['canUseTool']>>[2] = {
			signal: ac.signal,
			toolUseID: 'tu_aborted',
			requestId: 'tu_aborted',
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
			requestId: 'tu_pre_aborted',
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
		const sub = ctx.agent.onDidChatProgress(s => signals.push(s));
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
		const sub = ctx.agent.onDidChatProgress(s => signals.push(s));
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
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

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
		disposables.add(ctx.agent.onDidChatProgress(s => {
			if (s.kind === 'action' && s.action.type === ActionType.ChatInputRequested) {
				inputRequests.push(s.action.request);
			}
		}));

		await startActiveTurn(disposables, ctx, created.session, sessionId);
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
		}, { signal: new AbortController().signal, toolUseID: 'tu_ask', requestId: 'tu_ask' });
		await tick();

		const inputRequest = inputRequests.at(-1)!;
		assert.strictEqual(readChatInputRequestPurpose(inputRequest), ChatInputRequestPurpose.AskUser);
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
		}, { signal: new AbortController().signal, toolUseID: 'tu_ask_cancel', requestId: 'tu_ask_cancel' });
		await tick();

		ctx.agent.respondToUserInputRequest('tu_ask_cancel', ChatInputResponseKind.Cancel);
		const result = await promise;

		assert.deepStrictEqual(result, { behavior: 'deny', message: 'The user cancelled the question' });
	});

	test('Test 12b — ExitPlanMode: Approve persists permissionMode=acceptEdits without a reentrant live SDK call', async () => {
		// Calling `Query.setPermissionMode` synchronously inside
		// `canUseTool` collides with the SDK's control channel (which
		// is mid-flight delivering the canUseTool request) and leaves
		// the turn unable to resume. Mirror production: write the new
		// mode to `IAgentConfigurationService`. The session ignores this
		// server-originated event to avoid a reentrant SDK control request.
		const { ctx, canUseTool, sessionUri } = await materialize();

		const signals: AgentSignal[] = [];
		disposables.add(ctx.agent.onDidChatProgress(s => signals.push(s)));

		const promise = canUseTool('ExitPlanMode', { plan: '1. Read foo\n2. Edit foo' }, {
			signal: new AbortController().signal,
			toolUseID: 'tu_plan_ok',
			requestId: 'tu_plan_ok',
		});
		await tick();

		const captured = signals.find(s => s.kind === 'pending_confirmation');
		ctx.agent.respondToPermissionRequest('tu_plan_ok', true);
		const result = await promise;

		const fakeQuery = ctx.sdk.warmQueries.at(-1)?.produced;
		const persistedMode = ctx.configService.getSessionConfigValues(sessionUri.toString())?.['permissionMode'];
		// See Test 7: the agent keys its chat map by the default-chat URI, which
		// populates the emitted URI's cached string form; mirror it here.
		const expectedChat = URI.parse(buildDefaultChatUri(sessionUri));
		expectedChat.toString();
		assert.deepStrictEqual({
			signal: captured,
			result,
			recordedModes: fakeQuery?.recordedPermissionModes ?? [],
			persistedMode,
		}, {
			signal: {
				kind: 'pending_confirmation',
				chat: expectedChat,
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
			requestId: 'tu_plan_deny',
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

	test('Test 13c — ExitPlanMode: approving from a peer chat persists permissionMode to the owning session config scope, not the peer chat URI', async () => {
		// A peer/side chat shares its owning session's `configurationResource`
		// but is addressed by its own distinct chat URI (`resource`). The
		// permission-mode write on Approve must land on the shared session
		// scope regardless of which chat surfaced the plan — writing under
		// the peer's own chat URI would silently no-op (no session entry is
		// ever keyed by a chat channel URI) and the mode would never persist.
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/work')] });
		const session = created.session;

		const state = ctx.stateManager.createSession({
			resource: session.toString(),
			provider: 'claude',
			title: 't',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		// Seed `state.config` (see `materialize()` above) so `updateSessionConfig` writes propagate.
		(state as { config?: SessionConfigState }).config = {
			schema: { type: 'object', properties: {} },
			values: {},
		};

		const peer = URI.parse(buildChatUri(session, 'peer'));
		const peerContext = { configurationResource: session, resource: peer };
		const peerResult = await ctx.agent.chats.createChat(peer, peerContext, { ...resolvedChatOptions() });
		const peerSdkId = AgentSession.id(peerResult!.backingSession!);

		const configChanges: string[] = [];
		disposables.add(ctx.stateManager.onDidChangeSessionConfig(e => configChanges.push(e.session.toString())));

		// Materialize the peer chat's own SDK conversation and keep its turn
		// open, mirroring `startActiveTurn`, so `canUseTool` can be driven
		// directly for that chat's captured `Options`.
		const turnActive = new DeferredPromise<void>();
		const finishTurn = new DeferredPromise<void>();
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(peerSdkId), makeResultSuccess(peerSdkId)];
		ctx.sdk.queryAdvance = async index => {
			if (index === 1) {
				turnActive.complete();
				await finishTurn.p;
			}
		};
		const sendPromise = ctx.agent.chats.sendMessage(peer, 'hi', undefined, undefined, 'turn-1', undefined, undefined, peerContext);
		await turnActive.p;
		disposables.add(toDisposable(() => {
			finishTurn.complete();
			void sendPromise.catch(() => { });
		}));

		const peerCanUseTool = ctx.sdk.capturedStartupOptions.at(-1)?.canUseTool;
		assert.ok(peerCanUseTool, 'peer chat canUseTool callback was wired into Options');

		const promise = peerCanUseTool('ExitPlanMode', { plan: 'peer plan' }, {
			signal: new AbortController().signal,
			toolUseID: 'tu_peer_plan',
			requestId: 'tu_peer_plan',
		});
		await tick();

		ctx.agent.respondToPermissionRequest('tu_peer_plan', true);
		const result = await promise;

		assert.deepStrictEqual({
			result,
			configChanges,
			ownerPermissionMode: ctx.configService.getSessionConfigValues(session.toString())?.['permissionMode'],
		}, {
			result: { behavior: 'allow', updatedInput: { plan: 'peer plan' } },
			// Exactly one config write, keyed by the owning session — never
			// by the peer chat's own URI.
			configChanges: [session.toString()],
			ownerPermissionMode: 'acceptEdits',
		});
	});

	test('Test 14 — ExitPlanMode: synchronous respond inside pending_confirmation listener resolves canUseTool', async () => {
		// Same race as Test 8 but for the ExitPlanMode permission path
		// (`_handleExitPlanMode`): the deferred must be registered
		// before the `pending_confirmation` event is fired, otherwise
		// a synchronous responder hits an empty pending map and the
		// SDK's `canUseTool` deadlocks.
		const { ctx, canUseTool } = await materialize();

		disposables.add(ctx.agent.onDidChatProgress(s => {
			if (s.kind === 'pending_confirmation' && s.state.toolName === 'ExitPlanMode') {
				ctx.agent.respondToPermissionRequest(s.state.toolCallId, true);
			}
		}));

		const result = await canUseTool('ExitPlanMode', { plan: 'sync test' }, {
			signal: new AbortController().signal,
			toolUseID: 'tu_plan_race',
			requestId: 'tu_plan_race',
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
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

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

		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		ctx.configService.updateSessionConfig(created.session.toString(), { permissionMode: 'acceptEdits' });
		const p2 = ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi-2', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));
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
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

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
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

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
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		const inputRequests: ChatInputRequest[] = [];
		disposables.add(ctx.agent.onDidChatProgress(s => {
			if (s.kind === 'action' && s.action.type === ActionType.ChatInputRequested) {
				inputRequests.push(s.action.request);
			}
		}));

		await startActiveTurn(disposables, ctx, created.session, sessionId);
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
		assert.strictEqual(readChatInputRequestPurpose(inputRequest), ChatInputRequestPurpose.Elicitation);
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
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		return { ctx, sessionId, sessionUri: created.session };
	}

	test('Options carries enableFileCheckpointing and only the transient host-context hook', async () => {
		// Phase 8 refactor. Pins the Options shape that
		// `_materializeProvisional` ships to the SDK: file checkpointing
		// must be on (a startup option, not user-bypassable). File-edit
		// tracking remains wired
		// through `ClaudeAgentSession._observeAssistantMessage` /
		// `_observeUserMessage` in the message-pump loop; the only SDK hook
		// adds transient host context to a submitted prompt.
		const { ctx } = await materialize();
		const opts = ctx.sdk.capturedStartupOptions[0];
		assert.ok(opts, 'Options captured');

		assert.deepStrictEqual({
			enableFileCheckpointing: opts.enableFileCheckpointing,
			hookNames: Object.keys(opts.hooks ?? {}),
			userPromptSubmitHooks: opts.hooks?.UserPromptSubmit?.[0].hooks.length,
		}, {
			enableFileCheckpointing: true,
			hookNames: ['UserPromptSubmit'],
			userPromptSubmitHooks: 1,
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
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/workspace')], model: { id: 'claude-opus-4.6' } });
		const sessionId = created.sdkSessionId;
		const advance = new DeferredPromise<void>();
		ctx.sdk.queryAdvance = async (i: number) => { if (i === 2) { await advance.p; } };
		ctx.sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
			...(opts?.extraMessages ?? [makeResultSuccess(sessionId)]),
		];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		const warm = ctx.sdk.warmQueries[0];
		const query = warm.produced!;
		return { ctx, sessionUri: created.session, sessionId, warm, query, advance };
	}

	test('changeModel on a provisional session mutates the pending model bag (no SDK contact)', async () => {
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		const created = await createSession(ctx.agent, {
			workingDirectories: [URI.file('/workspace')],
			model: { id: 'claude-opus-4.6' },
		});

		await ctx.agent.chats.changeModel(defaultChatUri(created.session), { id: 'claude-sonnet-4.6', config: { thinkingLevel: 'medium' } }, chatContext(defaultChatUri(created.session)));

		assert.strictEqual(ctx.sdk.startupCallCount, 0);
		const sid = created.sdkSessionId;
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		const opts = ctx.sdk.capturedStartupOptions[0];
		assert.deepStrictEqual({ model: opts.model, effort: opts.effort }, { model: 'claude-sonnet-4-6', effort: 'medium' });
	});

	test('changeModel on a materialized session queues a model+effort bundle that drains at the next yield boundary', async () => {
		const { ctx, sessionUri, query, advance } = await materialize();

		await ctx.agent.chats.changeModel(defaultChatUri(sessionUri), { id: 'claude-sonnet-4.6', config: { thinkingLevel: 'high' } }, chatContext(defaultChatUri(sessionUri)));
		const p2 = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'next', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(sessionUri)));
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

		await ctx.agent.chats.changeModel(defaultChatUri(sessionUri), { id: 'claude-opus-4.6', config: { thinkingLevel: 'max' } }, chatContext(defaultChatUri(sessionUri)));
		const p2 = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'next', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(sessionUri)));
		await tick();
		advance.complete();
		await p2;

		assert.deepStrictEqual(query.recordedFlagSettings.map(s => s.effortLevel), ['max']);
	});

	test('changeModel with same id and unchanged effort skips the SDK setters', async () => {
		const { ctx, sessionUri, query, advance } = await materialize();

		await ctx.agent.chats.changeModel(defaultChatUri(sessionUri), { id: 'claude-opus-4.6' }, chatContext(defaultChatUri(sessionUri)));
		const p2 = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'next', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(sessionUri)));
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
		const longSend = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'long task', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(sessionUri)));
		await tick();

		ctx.agent.setPendingMessages!(defaultChatUri(sessionUri), { id: 'pending-1', message: { text: 'switch topic', origin: { kind: MessageKind.User } } }, []);
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
		ctx.agent.setPendingMessages!(defaultChatUri(sessionUri), undefined, [{ id: 'q1', message: { text: 'queued', origin: { kind: MessageKind.User } } }]);
		await tick();
		assert.strictEqual(query.drainedPrompts.length, before);
		advance.complete();
	});

	test('steering_consumed fires when the iterable hands the steering message to the SDK', async () => {
		const { ctx, sessionUri, advance } = await materialize();
		const sid = AgentSession.id(sessionUri);

		const signals: AgentSignal[] = [];
		disposables.add(ctx.agent.onDidChatProgress(s => signals.push(s)));

		const longSend = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'long task', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(sessionUri)));
		await tick();

		ctx.agent.setPendingMessages!(defaultChatUri(sessionUri), { id: 'pending-9', message: { text: 'steer', origin: { kind: MessageKind.User } } }, []);
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
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/workspace')], model: { id: 'claude-opus-4.6' } });
		const sid = created.sdkSessionId;

		// Block the FakeQuery at index 0 so the first turn never completes.
		const stall = new DeferredPromise<void>();
		ctx.sdk.queryAdvance = async (i) => { if (i === 0) { await stall.p; } };
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];

		const inFlight = ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		await tick();

		await ctx.agent.chats.abort(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)));
		await assert.rejects(inFlight, (err: unknown) => isCancellationError(err));

		// Unblock the (now-aborted) iterator so it terminates cleanly.
		ctx.sdk.queryAdvance = undefined;
		stall.complete();
		await tick();

		// Next sendMessage rebuilds via resume mode.
		const startupBefore = ctx.sdk.startupCallCount;
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'next', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

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
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/workspace')], model: { id: 'claude-opus-4.6' } });
		const sid = created.sdkSessionId;

		// Materialize the session by driving one full turn so canUseTool is wired into Options.
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		const canUseTool = ctx.sdk.capturedStartupOptions[0]?.canUseTool;
		assert.ok(canUseTool, 'canUseTool was wired into Options');

		const permissionPromise = canUseTool('Read', { file_path: '/tmp/foo.txt' }, {
			signal: new AbortController().signal,
			toolUseID: 'tu_pending',
			requestId: 'tu_pending',
		});
		await tick();

		await ctx.agent.chats.abort(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)));
		const result = await permissionPromise;
		assert.deepStrictEqual(result, { behavior: 'deny', message: 'User declined' });
	});

	test('subprocess crash mid-stream rejects the in-flight turn and the next sendMessage rebinds via resume', async () => {
		const ctx = createTestContext(disposables);
		await ctx.agent.authenticate('https://api.github.com', 'tok');
		await tick();
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/workspace')], model: { id: 'claude-opus-4.6' } });
		const sid = created.sdkSessionId;

		// First turn: yield system_init then throw mid-stream (subprocess crash).
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid)];
		ctx.sdk.queryAdvance = async (i) => { if (i === 1) { throw new Error('subprocess crashed'); } };

		await assert.rejects(
			ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session))),
			(err: Error) => err.message.includes('subprocess crashed'),
		);

		// Second turn rebuilds via resume.
		ctx.sdk.queryAdvance = undefined;
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid), makeResultSuccess(sid)];
		const startupBefore = ctx.sdk.startupCallCount;
		await ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'recover', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));
		assert.strictEqual(ctx.sdk.startupCallCount, startupBefore + 1, 'crash recovery called startup again');
		const resumeOpts = ctx.sdk.capturedStartupOptions[ctx.sdk.startupCallCount - 1];
		assert.strictEqual(resumeOpts.resume, sid);
	});

	test('rebind re-applies bijective state (model + effort) on the new Query', async () => {
		const { ctx, sessionUri, sessionId, query: firstQuery, advance } = await materialize();

		// Hot-swap model + effort on the live query so the bijective
		// cache picks up the new values.
		await ctx.agent.chats.changeModel(defaultChatUri(sessionUri), { id: 'claude-sonnet-4.6', config: { thinkingLevel: 'high' } }, chatContext(defaultChatUri(sessionUri)));
		const p2 = ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'apply', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(sessionUri)));
		await tick();
		advance.complete();
		await p2;
		assert.deepStrictEqual({ models: firstQuery.recordedModels, efforts: firstQuery.recordedFlagSettings.map(s => s.effortLevel) }, { models: ['claude-sonnet-4-6'], efforts: ['high'] });

		// Now abort and resend; the rebound query MUST receive the same
		// model + effort via the rebind's re-apply pass.
		await ctx.agent.chats.abort(defaultChatUri(sessionUri), chatContext(defaultChatUri(sessionUri)));
		ctx.sdk.queryAdvance = undefined;
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await ctx.agent.chats.sendMessage(defaultChatUri(sessionUri), 'after-abort', undefined, undefined, 'turn-3', undefined, undefined, chatContext(defaultChatUri(sessionUri)));

		const reboundQuery = ctx.sdk.warmQueries[1].produced!;
		assert.deepStrictEqual({
			models: reboundQuery.recordedModels,
			efforts: reboundQuery.recordedFlagSettings.map(s => s.effortLevel),
		}, { models: ['claude-sonnet-4-6'], efforts: ['high'] });
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
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/workspace')], model: { id: 'claude-opus-4.6' } });
		const sid = created.sdkSessionId;

		// Stage: system_init, then PARK at index 1 so the original turn
		// hasn't yet streamed its result. The test injects steering, then
		// releases the gate so the SDK emits result#1 (intermediate),
		// echoes the steering, then emits result#2 (final).
		const advance = new DeferredPromise<void>();
		ctx.sdk.queryAdvance = async (i) => { if (i === 1) { await advance.p; } };
		ctx.sdk.nextQueryMessages = [makeSystemInitMessage(sid)];

		const inFlight = ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'long task', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		await tick();

		// Subscribe BEFORE injecting steering so we capture the
		// `steering_consumed` signal that fires the moment the iterable
		// hands the message to the SDK.
		const signals: AgentSignal[] = [];
		disposables.add(ctx.agent.onDidChatProgress(s => signals.push(s)));

		// Inject steering and capture its uuid via the iterable's drain.
		ctx.agent.setPendingMessages!(defaultChatUri(created.session), { id: 'pending-steer', message: { text: 'moo', origin: { kind: MessageKind.User } } }, []);
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
		const created = await createSession(ctx.agent, { workingDirectories: [URI.file('/workspace')], model: { id: 'claude-opus-4.6' } });
		const sid = created.sdkSessionId;

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

		const inFlight = ctx.agent.chats.sendMessage(defaultChatUri(created.session), 'long task', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		let inFlightResolved = false;
		void inFlight.then(() => { inFlightResolved = true; }, () => { inFlightResolved = true; });
		await tick();

		// Inject steering so the queue holds [original, steering] when
		// result#1 lands.
		ctx.agent.setPendingMessages!(defaultChatUri(created.session), { id: 'pending-c1', message: { text: 'steer', origin: { kind: MessageKind.User } } }, []);
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

suite('ClaudeAgent (Phase 13 — transcript reconstruction)', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function makeUserSessionMessage(uuid: string, text: string): SessionMessage {
		return {
			type: 'user',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			parent_agent_id: null,
			message: { role: 'user', content: [{ type: 'text', text }] },
		};
	}

	function makeAssistantSessionMessage(uuid: string, text: string): SessionMessage {
		return {
			type: 'assistant',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			parent_agent_id: null,
			message: { id: `msg_${uuid}`, role: 'assistant', content: [{ type: 'text', text }] },
		};
	}

	test('getMessages returns mapped Turn[] from SDK transcript', async () => {
		const { agent, sdk } = createTestContext(disposables);
		const sessionId = 'phase13-1';
		sdk.sessionMessagesById.set(sessionId, [
			makeUserSessionMessage('u1', 'hi'),
			makeAssistantSessionMessage('a1', 'hello'),
		]);

		const sessionUri = AgentSession.uri(agent.id, sessionId);
		await bindDefaultChat(agent, sessionUri);
		const turns = await agent.chats.getMessages(defaultChatUri(sessionUri), chatContext(defaultChatUri(sessionUri)));

		assert.strictEqual(turns.length, 1);
		assert.strictEqual(turns[0].id, 'u1');
		assert.strictEqual(turns[0].message.text, 'hi');
		assert.strictEqual(sdk.getSessionMessagesCalls.length, 1);
		assert.deepStrictEqual(sdk.getSessionMessagesCalls[0], {
			sessionId,
			options: { includeSystemMessages: true },
		});
	});

	test('getMessages resolves a released peer-chat subagent through the exact source backing', async () => {
		const { agent, sdk, stateManager } = createTestContext(disposables);
		const parentSessionId = 'sdk-parent';
		const toolCallId = 'tool-call-1';
		const agentId = 'agent1';
		const ownerSession = AgentSession.uri(agent.id, 'ah-owner');
		const parentUri = URI.parse(buildChatUri(ownerSession, 'peer'));
		const subagentUri = buildSubagentChatUri(ownerSession.toString(), toolCallId);
		stateManager.createSession({
			resource: ownerSession.toString(),
			provider: agent.id,
			title: 'parent',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		stateManager.addChat(ownerSession.toString(), parentUri.toString());
		stateManager.addChat(ownerSession.toString(), subagentUri, {
			origin: { kind: ChatOriginKind.Tool, chat: parentUri.toString(), toolCallId },
		});
		await agent.materializeChat(parentUri, { configurationResource: ownerSession, resource: parentUri }, JSON.stringify({ sdkSessionId: parentSessionId }));
		sdk.sessionMessagesById.set(parentSessionId, [
			makeUserSessionMessage('parent-user', 'delegate'),
			{
				...makeAssistantMessage(parentSessionId, [
					{ type: 'tool_use', id: toolCallId, name: 'Task', input: { prompt: 'subagent task' } },
				]),
				parent_agent_id: null,
			},
			{
				...makeUserToolResultMessage(parentSessionId, toolCallId, [
					{ type: 'text', text: 'done' },
					{ type: 'text', text: `agentId: ${agentId} (use SendMessage with to: '${agentId}')` },
				]),
				parent_agent_id: null,
				session_id: parentSessionId,
				uuid: 'parent-tool-result',
			},
		]);
		sdk.subagentMessagesByKey.set(`${parentSessionId}::${agentId}`, [
			makeUserSessionMessage('subagent-user', 'subagent task'),
			makeAssistantSessionMessage('subagent-assistant', 'subagent response'),
		]);

		const turns = await agent.chats.getMessages(URI.parse(subagentUri), {
			configurationResource: ownerSession,
			resource: URI.parse(subagentUri),
			origin: { kind: ChatOriginKind.Tool, chat: parentUri.toString(), toolCallId },
		});

		assert.deepStrictEqual({
			turns: turns.map(turn => ({
				message: turn.message.text,
				response: turn.responseParts
					.filter(part => part.kind === ResponsePartKind.Markdown)
					.map(part => part.content),
			})),
			parentCalls: sdk.getSessionMessagesCalls,
			subagentCalls: sdk.getSubagentMessagesCalls,
		}, {
			turns: [{
				message: 'subagent task',
				response: ['subagent response'],
			}],
			parentCalls: [{
				sessionId: parentSessionId,
				options: { includeSystemMessages: true },
			}],
			subagentCalls: [{
				sessionId: parentSessionId,
				agentId,
				options: undefined,
			}],
		});
	});

	test('getMessages on a provisional chat returns [] with no SDK call', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/workspace')] });

		const turns = await agent.chats.getMessages(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)));

		assert.deepStrictEqual(turns, []);
		assert.strictEqual(sdk.getSessionMessagesCalls.length, 0, 'provisional chat must not hit SDK');
	});

	test('getMessages returns [] on SDK fetch failure (warn-logged)', async () => {
		const log = new CapturingLogService();
		const { agent, sdk } = createTestContext(disposables, { logService: log });
		sdk.getSessionMessagesRejection = new Error('simulated SDK failure');

		const sessionUri = AgentSession.uri(agent.id, 'fail-id');
		await bindDefaultChat(agent, sessionUri);
		const turns = await agent.chats.getMessages(defaultChatUri(sessionUri), chatContext(defaultChatUri(sessionUri)));

		assert.deepStrictEqual(turns, []);
		assert.ok(log.warns.some(w => w.includes('getSessionMessages SDK fetch failed')),
			`expected warn-log; got: ${log.warns.join(' | ')}`);
	});

	// Note: Phase 12 step 8 priming used to be tested here against a
	// `FakeClaudeSubagentResolver`. With the per-session
	// `SubagentRegistry`, priming is exercised by Phase D's
	// `claudeSubagentRegistry.test.ts` (`primeFromTranscript`) and by
	// `claudeTranscriptService.test.ts`'s integration tests on
	// `loadParentTranscript`. The transcript-read integration is
	// covered indirectly by all the materialized-session tests above.
});

// #endregion

// #region Phase 11 — customizations / plugins

suite('ClaudeAgent — Phase 11 customizations', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function makeSyncedRef(uri: string, dir: string, children?: ChildCustomization[]): ISyncedCustomization {
		return {
			customization: {
				type: CustomizationType.Plugin,
				id: customizationId(uri),
				uri,
				name: uri,
				load: { kind: CustomizationLoadStatus.Loaded },
				...(children === undefined ? undefined : { children }),
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
		const authenticationService = disposables.add(new FakeAgentHostAuthenticationService());
		const resolveReducerEnablement = (session: string, target: { readonly id: string }) => {
			const findCustomization = (customizations: readonly (Customization | ChildCustomization)[]): PluginCustomization | McpServerCustomization | undefined => {
				for (const customization of customizations) {
					if (customization.id === target.id && (customization.type === CustomizationType.Plugin || customization.type === CustomizationType.McpServer)) {
						return customization;
					}
					if (customization.type === CustomizationType.Plugin || customization.type === CustomizationType.Directory) {
						const child = findCustomization(customization.children ?? []);
						if (child !== undefined) {
							return child;
						}
					}
				}
				return undefined;
			};
			const customization = findCustomization(stateManager.getSessionState(session)?.customizations ?? []);
			const enablement = customization?.enablement ?? [];
			return {
				kind: 'resolved' as const,
				enablement,
				enabled: isCustomizationEnabled({ enablement }),
				workingDirectory: { kind: 'workspaceless' as const },
			};
		};

		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));

		const otelService = new RecordingOTelService();
		const sdkDownloader = new RecordingAgentSdkDownloader();
		const services = new ServiceCollection(
			[IFileService, fileService],
			[INativeEnvironmentService, { userHome: URI.file('/mock-home') } as INativeEnvironmentService],
			[ILogService, logService],
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
			[IAgentSdkDownloader, sdkDownloader],
			[IAgentPluginManager, pluginManager],
			[IAgentHostGitService, createNoopGitService()],
			[IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
			[IAgentConfigurationService, configService],
			[IAgentHostStateManager, stateManager],
			[IAgentHostSessionTitleSignal, disposables.add(new AgentHostSessionTitleSignal(stateManager))],
			[IAgentHostOTelService, otelService],
			[IAgentHostCustomizationEnablementService, {
				_serviceBrand: undefined,
				onDidChange: reducerBackedEnablementChangeEvent(stateManager),
				initializeSession: async () => { },
				getWorkingDirectoryState: () => ({ kind: 'workspaceless' }),
				resolve: resolveReducerEnablement,
				applyClientGlobalEnablement: (session, target, clientEnablement) => {
					const existing = resolveReducerEnablement(session, target);
					const global = clientEnablement.find(entry => entry.kind === CustomizationEnablementKind.Global);
					const enablement = global === undefined
						? existing.enablement
						: [...existing.enablement.filter(entry => entry.kind !== CustomizationEnablementKind.Global), global];
					return { ...existing, enablement, enabled: isCustomizationEnabled({ enablement }) };
				},
				replaceEnablement: () => ({ kind: 'resolved', enablement: [], enabled: true, workingDirectory: { kind: 'workspaceless' } }),
				setEnablement: () => ({ kind: 'resolved', enablement: [], enabled: true, workingDirectory: { kind: 'workspaceless' } }),
				whenIdle: async () => { },
			} satisfies ICustomizationEnablementService],
			[IProductService, FakeProductService],
			[IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
			[IAgentHostAuthenticationService, authenticationService],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
		connectAuthentication(agent, authenticationService);
		const chats = agent.chats as { sendMessage: typeof agent.chats.sendMessage };
		const sendMessage = chats.sendMessage.bind(agent.chats);
		chats.sendMessage = (chat, prompt, workingDirectoriesOrDirectory, attachments, turnId, senderClientId, clientTypeOrContext, context) => {
			const explicitContext = context ?? (typeof clientTypeOrContext === 'string' ? undefined : clientTypeOrContext);
			const clientType = typeof clientTypeOrContext === 'string' ? clientTypeOrContext : undefined;
			// Same host derivation `AgentSideEffects` performs, so every send
			// carries the session's live customization snapshot.
			const explicit = explicitContext && !URI.isUri(explicitContext) ? explicitContext : undefined;
			const session = explicit?.configurationResource
				?? (explicitContext && URI.isUri(explicitContext) ? explicitContext : undefined)
				?? (chat.scheme === 'ahp-chat' ? URI.parse(parseRequiredSessionUriFromChatUri(chat.toString())) : chat);
			return sendMessage(chat, prompt, workingDirectoriesOrDirectory, attachments, turnId, senderClientId, clientType, { ...createAgentChatContext(stateManager, session, chat), ...explicit });
		};
		return { agent, proxy, api, sdk, sessionData, stateManager, configService, otelService, instantiationService, fileService, sdkDownloader };
	}

	function publishReducerCustomizations(stateManager: AgentHostStateManager, session: URI, customizations: readonly Customization[]): void {
		const resource = session.toString();
		if (!stateManager.getSessionState(resource)) {
			const now = new Date().toISOString();
			stateManager.createSession({
				resource,
				provider: 'claude',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: now,
				modifiedAt: now,
			});
		}
		stateManager.dispatchServerAction(resource, { type: ActionType.SessionCustomizationsChanged, customizations: [...customizations] });
	}

	test('createChat seeds the eager activeClient customizations to the plugin manager', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const customizations = [makeClientCustomization('https://bundle', 'Synced')];
		await createSession(agent, {
			session: AgentSession.uri('claude', 'eager'),
			workingDirectories: [URI.file('/work')],
			activeClient: { clientId: 'client-1', tools: [], customizations },
		});

		// The eagerly-claimed active client's customizations must be synced at
		// creation (mirrors the Copilot agent). Without this, built-in skills
		// like `/create-pr` never reach the SDK: the workbench state already
		// carries the active client, so no follow-up `session/activeClientSet`
		// is dispatched to trigger the sync.
		assert.deepStrictEqual(pm.syncCalls, [{ clientId: 'client-1', customizations }]);
	});

	test('createChat without an activeClient does not sync customizations', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		await createSession(agent, {
			session: AgentSession.uri('claude', 'no-eager'),
			workingDirectories: [URI.file('/work')],
		});

		assert.deepStrictEqual(pm.syncCalls, []);
	});

	test('GitHub MCP is enabled by default and respects customization disablement', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent, sdk, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const enabled = await createSession(agent, { workingDirectories: [URI.file('/enabled')] });
		sdk.supportedAgentsResult = [];
		sdk.mcpServerStatusResult = [];
		sdk.nextQueryMessages = [makeSystemInitMessage(enabled.sdkSessionId), makeResultSuccess(enabled.sdkSessionId)];
		await agent.chats.sendMessage(defaultChatUri(enabled.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(enabled.session)));

		const disabled = await createSession(agent, { workingDirectories: [URI.file('/disabled')] });
		const customization = createClaudeInternalMcpServerCustomization('github-mcp-server');
		publishReducerCustomizations(stateManager, disabled.session, [customization]);
		stateManager.dispatchServerAction(disabled.session.toString(), {
			type: ActionType.SessionCustomizationToggled,
			id: customization.id,
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
		});
		sdk.nextQueryMessages = [makeSystemInitMessage(disabled.sdkSessionId), makeResultSuccess(disabled.sdkSessionId)];
		await agent.chats.sendMessage(defaultChatUri(disabled.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(disabled.session)));

		const enabledOptions = sdk.capturedStartupOptions[0];
		const disabledOptions = sdk.capturedStartupOptions[1];
		const enabledServer = enabledOptions.mcpServers?.['github-mcp-server'];
		const enabledRemoteServer = enabledServer?.type === 'http' || enabledServer?.type === 'sse' ? enabledServer : undefined;
		assert.deepStrictEqual({
			enabled: enabledServer ? {
				type: enabledServer.type,
				url: enabledRemoteServer?.url,
				features: enabledRemoteServer?.headers?.['X-MCP-Features'],
				authorization: enabledRemoteServer?.headers?.Authorization,
				webSearchEnabled: enabledRemoteServer?.headers?.['X-MCP-Tools']?.split(',').includes('web_search'),
			} : undefined,
			disabled: disabledOptions.mcpServers?.['github-mcp-server'],
			denied: typeof disabledOptions.settings === 'string' ? undefined : disabledOptions.settings?.deniedMcpServers,
		}, {
			enabled: {
				type: 'http',
				url: 'https://api.githubcopilot.com/mcp',
				features: 'remote_mcp_ui_apps,mcp_apps_disable_form_deferral',
				authorization: undefined,
				webSearchEnabled: true,
			},
			disabled: undefined,
			denied: [{ serverName: 'github-mcp-server' }],
		});
	});

	test('GitHub MCP root setting disables server injection', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent, sdk, configService } = buildCtxWith(pm);
		configService.updateRootConfig({ [AgentHostGitHubMcpServerEnabledConfigKey]: false });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		sdk.supportedAgentsResult = [];
		sdk.mcpServerStatusResult = [];
		sdk.nextQueryMessages = [makeSystemInitMessage(created.sdkSessionId), makeResultSuccess(created.sdkSessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.strictEqual(sdk.capturedStartupOptions[0].mcpServers?.['github-mcp-server'], undefined);
	});

	test('GitHub MCP injection deduplicates an existing server by endpoint URI', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent, sdk, fileService } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const workspace = URI.file('/work');
		await fileService.createFolder(workspace);
		await fileService.writeFile(
			URI.joinPath(workspace, '.mcp.json'),
			VSBuffer.fromString(JSON.stringify({
				existingGitHub: { type: 'http', url: 'https://api.githubcopilot.com/mcp' },
			})),
		);
		const created = await createSession(agent, { workingDirectories: [workspace] });
		sdk.supportedAgentsResult = [];
		sdk.mcpServerStatusResult = [];
		sdk.nextQueryMessages = [makeSystemInitMessage(created.sdkSessionId), makeResultSuccess(created.sdkSessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.strictEqual(sdk.capturedStartupOptions[0].mcpServers?.['github-mcp-server'], undefined);
	});

	test('disabled bundled MCP children are excluded from initial SDK startup', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent, sdk, fileService, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const pluginUri = 'https://bundle';
		const pluginDir = URI.file('/p/bundle');
		const workspace = URI.file('/work');
		await fileService.createFolder(URI.joinPath(pluginDir, '.claude-plugin'));
		await fileService.writeFile(
			URI.joinPath(pluginDir, '.claude-plugin', 'plugin.json'),
			VSBuffer.fromString(JSON.stringify({ name: 'bundle' })),
		);
		await fileService.writeFile(
			URI.joinPath(pluginDir, '.mcp.json'),
			VSBuffer.fromString(JSON.stringify({
				enabled: { type: 'http', url: 'https://enabled.example.com/mcp' },
				disabled: { type: 'stdio', command: 'node', args: ['server.js'] },
			})),
		);
		const disabledChild = makeMcpServerCustomization(URI.joinPath(pluginDir, '.mcp.json'), 'disabled');
		const publishedDisabledChild = createClaudeInternalMcpServerCustomization('disabled');
		const synced = makeSyncedRef(pluginUri, pluginDir.fsPath, [disabledChild]);
		const mcpDefaultCwds = toClientPluginMcpDefaultCwdsMeta({ enabled: null, disabled: null });
		pm.syncResult = [{
			...synced,
			customization: { ...synced.customization, _meta: mcpDefaultCwds },
		}];
		const created = await createSession(agent, {
			workingDirectories: [workspace],
			activeClient: {
				clientId: 'client-1',
				tools: [],
				customizations: [{
					...makeClientCustomization(pluginUri, 'Bundle'),
					_meta: mcpDefaultCwds,
					childEnablement: {
						disabled: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
					},
				}],
			},
		});
		publishReducerCustomizations(stateManager, created.session, [publishedDisabledChild]);
		stateManager.dispatchServerAction(created.session.toString(), {
			type: ActionType.SessionCustomizationToggled,
			id: publishedDisabledChild.id,
			enablement: [
				{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: false },
				{ kind: CustomizationEnablementKind.Global, enabled: true },
			],
		});

		sdk.supportedAgentsResult = [];
		sdk.mcpServerStatusResult = [];
		sdk.nextQueryMessages = [makeSystemInitMessage(created.sdkSessionId), makeResultSuccess(created.sdkSessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		const startupOptions = sdk.capturedStartupOptions[0];
		assert.deepStrictEqual({
			explicitServers: Object.keys(startupOptions.mcpServers ?? {}).sort(),
			deniedServers: typeof startupOptions.settings === 'string' ? undefined : startupOptions.settings?.deniedMcpServers,
		}, {
			explicitServers: ['enabled', 'github-mcp-server'],
			deniedServers: [{
				serverName: 'disabled',
			}],
		});
	});

	test('workspace MCP enablement gates SDK startup and rebuilds after re-enable', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent, sdk, fileService, stateManager, configService } = buildCtxWith(pm);
		configService.updateRootConfig({ [AgentHostClaudeMultiRootEnabledConfigKey]: true });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const primary = URI.file('/primary');
		const additional = URI.file('/additional');
		await Promise.all([
			fileService.writeFile(URI.joinPath(primary, '.mcp.json'), VSBuffer.fromString(JSON.stringify({
				'primary-enabled': { type: 'http', url: 'https://primary-enabled.example.com/mcp' },
				'primary-disabled': { type: 'http', url: 'https://primary-disabled.example.com/mcp' },
			}))),
			fileService.writeFile(URI.joinPath(additional, '.mcp.json'), VSBuffer.fromString(JSON.stringify({
				'additional-enabled': { type: 'http', url: 'https://additional-enabled.example.com/mcp' },
				'additional-disabled': { type: 'http', url: 'https://additional-disabled.example.com/mcp' },
			}))),
		]);
		const created = await createSession(agent, { workingDirectories: [primary, additional] });
		const chat = defaultChatUri(created.session);
		const initial = await agent.getChatCustomizations!(chat, chatContext(chat), hostCustomizations(stateManager, created.session));
		const customizations = [
			...initial,
			makeMcpServerCustomization(URI.joinPath(additional, '.mcp.json'), 'additional-enabled'),
			makeMcpServerCustomization(URI.joinPath(additional, '.mcp.json'), 'additional-disabled'),
		];
		publishReducerCustomizations(stateManager, created.session, customizations);
		for (const name of ['primary-disabled', 'additional-disabled']) {
			const server = customizations.find(customization => customization.type === CustomizationType.McpServer && customization.name === name);
			assert.ok(server);
			stateManager.dispatchServerAction(created.session.toString(), {
				type: ActionType.SessionCustomizationToggled,
				id: server.id,
				enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
			});
		}

		sdk.supportedAgentsResult = [];
		sdk.mcpServerStatusResult = [];
		sdk.nextQueryMessages = [makeSystemInitMessage(created.sdkSessionId), makeResultSuccess(created.sdkSessionId)];
		await agent.chats.sendMessage(chat, 'first', [primary, additional], undefined, 'turn-1', undefined, undefined, chatContext(chat));

		const options = sdk.capturedStartupOptions[0];
		const settings = options.settings;
		assert.ok(settings && typeof settings !== 'string');
		assert.deepStrictEqual({
			explicitServers: Object.keys(options.mcpServers ?? {}).sort(),
			deniedServers: settings.deniedMcpServers,
		}, {
			explicitServers: ['additional-enabled', 'github-mcp-server'],
			deniedServers: [{
				serverName: 'primary-disabled',
			}],
		});

		for (const name of ['primary-disabled', 'additional-disabled']) {
			const server = customizations.find(customization => customization.type === CustomizationType.McpServer && customization.name === name);
			assert.ok(server);
			stateManager.dispatchServerAction(created.session.toString(), {
				type: ActionType.SessionCustomizationToggled,
				id: server.id,
				enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }],
			});
		}

		sdk.nextQueryMessages = [makeSystemInitMessage(created.sdkSessionId), makeResultSuccess(created.sdkSessionId)];
		await agent.chats.sendMessage(chat, 'second', [primary, additional], undefined, 'turn-2', undefined, undefined, chatContext(chat));

		const rebuiltOptions = sdk.capturedStartupOptions[1];
		assert.ok(rebuiltOptions);
		assert.deepStrictEqual({
			explicitServers: Object.keys(rebuiltOptions.mcpServers ?? {}).sort(),
			deniedServers: typeof rebuiltOptions.settings === 'string' ? undefined : rebuiltOptions.settings?.deniedMcpServers,
		}, {
			explicitServers: ['additional-disabled', 'additional-enabled', 'github-mcp-server'],
			deniedServers: undefined,
		});
	});

	test('session MCP enablement persists across materialization and customization refreshes', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent, sdk, fileService, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const workspace = URI.file('/work');
		await fileService.createFolder(workspace);
		await fileService.writeFile(
			URI.joinPath(workspace, '.mcp.json'),
			VSBuffer.fromString(JSON.stringify({ slack: { type: 'http', url: 'https://mcp.slack.com/mcp' } })),
		);
		const created = await createSession(agent, { workingDirectories: [workspace] });
		const before = await agent.getChatCustomizations(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session));
		const server = before.find(customization => customization.type === CustomizationType.McpServer && customization.name === 'slack');
		assert.ok(server);

		const sessionResource = created.session.toString();
		stateManager.createSession({
			resource: sessionResource,
			provider: 'claude',
			title: 'MCP reconciliation',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		stateManager.dispatchServerAction(sessionResource, {
			type: ActionType.SessionCustomizationsChanged,
			customizations: [...before],
		});
		stateManager.dispatchServerAction(sessionResource, {
			type: ActionType.SessionCustomizationToggled,
			id: server.id,
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
		});
		const staged = await agent.getChatCustomizations(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session));
		const sessionId = created.sdkSessionId;
		sdk.supportedAgentsResult = [];
		sdk.mcpServerStatusResult = [{ name: 'slack', status: 'connected' }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		const afterMaterialize = await agent.getChatCustomizations(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session));
		stateManager.dispatchServerAction(sessionResource, {
			type: ActionType.SessionCustomizationToggled,
			id: server.id,
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }],
		});
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));
		const afterEnable = await agent.getChatCustomizations(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session));
		const queries = sdk.warmQueries.map(warm => warm.produced).filter(query => query !== undefined);
		const toggleCalls = queries.flatMap(query => query.mcpToggleCalls);
		const toggleTransitions = toggleCalls.filter((call, index) => index === 0 || toggleCalls[index - 1].enabled !== call.enabled);

		const enabledForSlack = (customizations: readonly Customization[]) => {
			const customization = customizations.find(customization => customization.type === CustomizationType.McpServer && customization.name === 'slack');
			return customization?.type === CustomizationType.McpServer ? isCustomizationEnabled(customization) : undefined;
		};
		assert.deepStrictEqual({
			staged: enabledForSlack(staged),
			afterMaterialize: enabledForSlack(afterMaterialize),
			afterEnable: enabledForSlack(afterEnable),
			toggleTransitions,
			reconnectedServers: [...new Set(queries.flatMap(query => query.mcpReconnectCalls))],
		}, {
			staged: false,
			afterMaterialize: false,
			afterEnable: true,
			toggleTransitions: [
				{ serverName: 'slack', enabled: false },
				{ serverName: 'slack', enabled: true },
			],
			reconnectedServers: ['slack'],
		});
	});

	test('reconciles newly-disabled MCP servers when customizations are republished', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent, sdk, fileService, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const workspace = URI.file('/work');
		await fileService.createFolder(workspace);
		await fileService.writeFile(
			URI.joinPath(workspace, '.mcp.json'),
			VSBuffer.fromString(JSON.stringify({ slack: { type: 'http', url: 'https://mcp.slack.com/mcp' } })),
		);
		const created = await createSession(agent, { workingDirectories: [workspace] });
		const chat = defaultChatUri(created.session);
		const initial = await agent.getChatCustomizations!(chat, chatContext(chat), hostCustomizations(stateManager, created.session));
		const slack = initial.find(customization => customization.type === CustomizationType.McpServer && customization.name === 'slack');
		assert.ok(slack);
		publishReducerCustomizations(stateManager, created.session, initial);
		const sessionId = AgentSession.id(created.session);
		sdk.supportedAgentsResult = [];
		sdk.mcpServerStatusResult = [{ name: 'slack', status: 'connected' }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'start', undefined, undefined, 'turn-1');

		const query = sdk.warmQueries.map(warm => warm.produced).find((query): query is FakeQuery => query !== undefined)!;
		const mcpServerStatusCallCount = query.mcpServerStatusCallCount;
		publishReducerCustomizations(stateManager, created.session, initial);
		await timeout(0);
		assert.strictEqual(query.mcpServerStatusCallCount, mcpServerStatusCallCount);

		const disabledEnablement: CustomizationEnablement[] = [{ kind: CustomizationEnablementKind.Session, enabled: false }];
		publishReducerCustomizations(stateManager, created.session, initial.map(customization =>
			customization.id === slack.id
				? { ...customization, enablement: disabledEnablement }
				: customization
		));
		await timeout(0);

		const queries = sdk.warmQueries.map(warm => warm.produced).filter((query): query is FakeQuery => query !== undefined);
		assert.deepStrictEqual(queries.flatMap(query => query.mcpToggleCalls), [{ serverName: 'slack', enabled: false }]);
	});

	test('serializes customization and send-triggered MCP reconciliation', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent, sdk, fileService, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const workspace = URI.file('/work');
		await fileService.createFolder(workspace);
		await fileService.writeFile(
			URI.joinPath(workspace, '.mcp.json'),
			VSBuffer.fromString(JSON.stringify({ slack: { type: 'http', url: 'https://mcp.slack.com/mcp' } })),
		);
		const created = await createSession(agent, { workingDirectories: [workspace] });
		const chat = defaultChatUri(created.session);
		const initial = await agent.getChatCustomizations!(chat, chatContext(chat), hostCustomizations(stateManager, created.session));
		const slack = initial.find(customization => customization.type === CustomizationType.McpServer && customization.name === 'slack');
		assert.ok(slack);
		publishReducerCustomizations(stateManager, created.session, initial);
		const sessionId = AgentSession.id(created.session);
		sdk.supportedAgentsResult = [];
		sdk.mcpServerStatusResult = [{ name: 'slack', status: 'connected' }];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'start', undefined, undefined, 'turn-1');

		const gate = new DeferredPromise<void>();
		sdk.mcpToggleGate = gate.p;
		const disabledEnablement: CustomizationEnablement[] = [{ kind: CustomizationEnablementKind.Session, enabled: false }];
		const disabled = initial.map(customization =>
			customization.id === slack.id
				? { ...customization, enablement: disabledEnablement }
				: customization
		);
		publishReducerCustomizations(stateManager, created.session, disabled);
		await timeout(0);
		let queries = sdk.warmQueries.map(warm => warm.produced).filter((query): query is FakeQuery => query !== undefined);
		assert.deepStrictEqual(queries.flatMap(query => query.mcpToggleCalls), [{ serverName: 'slack', enabled: false }]);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		const send = agent.chats.sendMessage(defaultChatUri(created.session), 'continue', undefined, undefined, 'turn-2');
		await timeout(0);
		queries = sdk.warmQueries.map(warm => warm.produced).filter((query): query is FakeQuery => query !== undefined);
		assert.deepStrictEqual(queries.flatMap(query => query.mcpToggleCalls), [{ serverName: 'slack', enabled: false }]);

		gate.complete();
		await send;
	});

	test('createChat re-seeds the eager activeClient when the host re-creates an existing chat', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const customizations = [makeClientCustomization('https://bundle', 'Synced')];
		const cfg = {
			session: AgentSession.uri('claude', 'reconnect'),
			workingDirectories: [URI.file('/work')],
			activeClient: { clientId: 'client-1', tools: [], customizations },
		};
		await createSession(agent, cfg);
		// AgentService reissues createSession for the same URI on reconnect; the
		// eager client must be re-applied even though the session already exists.
		await createSession(agent, cfg);

		assert.deepStrictEqual(pm.syncCalls, [
			{ clientId: 'client-1', customizations },
			{ clientId: 'client-1', customizations },
		]);
	});

	test('createChat eager seeding suppresses orphan customization progress', async () => {
		const pm = new FakeAgentPluginManager();
		pm.syncResult = [makeSyncedRef('https://bundle', '/p/bundle')];
		const { agent } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const updates: string[] = [];
		disposables.add(agent.onDidChatProgress(s => {
			if (s.kind === 'action' && s.action.type === ActionType.SessionCustomizationUpdated) {
				updates.push(s.action.customization.uri.toString());
			}
		}));

		await createSession(agent, {
			session: AgentSession.uri('claude', 'quiet'),
			workingDirectories: [URI.file('/work')],
			activeClient: { clientId: 'client-1', tools: [], customizations: [makeClientCustomization('https://bundle', 'Synced')] },
		});

		// The session state does not exist yet at create time, so the initial
		// sync must be quiet — no orphan SessionCustomizationUpdated envelopes.
		assert.deepStrictEqual(updates, []);
	});

	test('setClientCustomizations forwards each item as a SessionCustomizationUpdated action', async () => {
		const pm = new FakeAgentPluginManager();
		pm.syncResult = [makeSyncedRef('https://a', '/p/a'), makeSyncedRef('https://b', '/p/b')];
		const { agent, stateManager } = buildCtxWith(pm);

		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });

		const updates: { uri: string }[] = [];
		disposables.add(agent.onDidChatProgress(s => {
			if (s.kind === 'action' && s.action.type === ActionType.SessionCustomizationUpdated) {
				updates.push({ uri: s.action.customization.uri.toString() });
			}
		}));

		const synced = await syncClientCustomizations(agent, stateManager, created.session, 'client-1', [
			makeClientCustomization('https://a', 'A'),
			makeClientCustomization('https://b', 'B'),
		]);

		assert.strictEqual(synced.length, 2);
		assert.ok(updates.some(u => u === undefined ? false : u.uri.includes('a')), `expected an update for plugin a; got ${JSON.stringify(updates)}`);
		assert.ok(updates.some(u => u === undefined ? false : u.uri.includes('b')), `expected an update for plugin b; got ${JSON.stringify(updates)}`);
	});

	test('reducer-backed customization enablement stays isolated per session', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const s1 = await createSession(agent, { session: AgentSession.uri('claude', 'a'), workingDirectories: [URI.file('/work')] });
		const s2 = await createSession(agent, { session: AgentSession.uri('claude', 'b'), workingDirectories: [URI.file('/work')] });

		pm.syncResult = [makeSyncedRef('https://shared', '/p/shared')];
		await syncClientCustomizations(agent, stateManager, s1.session, 'c', [makeClientCustomization('https://shared', 'S')]);
		await syncClientCustomizations(agent, stateManager, s2.session, 'c', [makeClientCustomization('https://shared', 'S')]);

		const [initial1, initial2] = await Promise.all([
			agent.getChatCustomizations(defaultChatUri(s1.session), chatContext(defaultChatUri(s1.session)), hostCustomizations(stateManager, s1.session)),
			agent.getChatCustomizations(defaultChatUri(s2.session), chatContext(defaultChatUri(s2.session)), hostCustomizations(stateManager, s2.session)),
		]);
		publishReducerCustomizations(stateManager, s1.session, initial1);
		publishReducerCustomizations(stateManager, s2.session, initial2);
		stateManager.dispatchServerAction(s1.session.toString(), {
			type: ActionType.SessionCustomizationToggled,
			id: customizationId('https://shared'),
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
		});

		const [projected1, projected2] = await Promise.all([
			agent.getChatCustomizations(defaultChatUri(s1.session), chatContext(defaultChatUri(s1.session)), hostCustomizations(stateManager, s1.session)),
			agent.getChatCustomizations(defaultChatUri(s2.session), chatContext(defaultChatUri(s2.session)), hostCustomizations(stateManager, s2.session)),
		]);
		assert.deepStrictEqual({
			first: (() => {
				const customization = projected1.find(customization => customization.id === customizationId('https://shared'));
				return customization?.type === CustomizationType.Plugin ? isCustomizationEnabled(customization) : undefined;
			})(),
			second: (() => {
				const customization = projected2.find(customization => customization.id === customizationId('https://shared'));
				return customization?.type === CustomizationType.Plugin ? isCustomizationEnabled(customization) : undefined;
			})(),
		}, {
			first: false,
			second: true,
		});
	});

	test('getCustomizations returns [] — provider-level catalogue, not a cross-session aggregator', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const s1 = await createSession(agent, { session: AgentSession.uri('claude', 'one'), workingDirectories: [URI.file('/work')] });
		const s2 = await createSession(agent, { session: AgentSession.uri('claude', 'two'), workingDirectories: [URI.file('/work')] });

		pm.syncResult = [makeSyncedRef('https://shared', '/p/shared'), makeSyncedRef('https://a', '/p/a')];
		await syncClientCustomizations(agent, stateManager, s1.session, 'c', []);
		pm.syncResult = [makeSyncedRef('https://shared', '/p/shared'), makeSyncedRef('https://b', '/p/b')];
		await syncClientCustomizations(agent, stateManager, s2.session, 'c', []);

		// `IAgent.getCustomizations()` is the provider-level catalogue
		// (host-configured), NOT an aggregator across sessions. Claude has
		// no host-configured customizations today, so [] is the contract.
		// Client-pushed refs flow through `getChatCustomizations` instead.
		assert.deepStrictEqual(agent.getCustomizations(), []);
	});

	test('getChatCustomizations resolves against a provisional session', async () => {
		const pm = new FakeAgentPluginManager();
		pm.syncResult = [makeSyncedRef('https://a', '/p/a')];
		const { agent, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		assert.strictEqual(created.provisional, true);

		await syncClientCustomizations(agent, stateManager, created.session, 'c', [makeClientCustomization('https://a', 'A')]);

		const customizations = await agent.getChatCustomizations!(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session));
		// The client-pushed customization, plus the curated read-only built-ins
		// always present pre-materialize for discoverability (before a live SDK
		// set exists): the built-in agents directory and the "Built-in" skills
		// container.
		assert.deepStrictEqual(customizations.map(c => c.uri), ['https://a', 'file:///mock-home/.claude/agents', 'agent-builtin:/skills']);
	});

	test('getChatCustomizations overlays the enablement state onto client-pushed entries', async () => {
		const pm = new FakeAgentPluginManager();
		pm.syncResult = [makeSyncedRef('https://a', '/p/a')];
		const { agent, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });

		await syncClientCustomizations(agent, stateManager, created.session, 'c', [makeClientCustomization('https://a', 'A')]);
		const initial = await agent.getChatCustomizations!(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session));
		publishReducerCustomizations(stateManager, created.session, initial);
		stateManager.dispatchServerAction(created.session.toString(), {
			type: ActionType.SessionCustomizationToggled,
			id: customizationId('https://a'),
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
		});

		const customizations = await agent.getChatCustomizations!(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session));
		const customization = customizations.find(c => c.uri === 'https://a');
		assert.strictEqual(customization?.type === CustomizationType.Plugin ? isCustomizationEnabled(customization) : undefined, false);
	});

	test('replacing client customizations removes stale plugin and bundled MCP enablement', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent, sdk, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const pluginUri = 'https://bundle';
		const serverName = 'bundled';
		const child: McpServerCustomization = {
			type: CustomizationType.McpServer,
			id: 'bundled-server',
			uri: `${pluginUri}/.mcp.json`,
			name: serverName,
			state: { kind: McpCustomizationServerStatus.Starting },
		};
		const plugin: PluginCustomization = {
			type: CustomizationType.Plugin,
			id: customizationId(pluginUri),
			uri: pluginUri,
			name: 'Bundle',
			children: [child],
		};
		const clientCustomization: ClientPluginCustomization = {
			...makeClientCustomization(pluginUri, 'Bundle'),
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			childEnablement: { [serverName]: [{ kind: CustomizationEnablementKind.Global, enabled: false }] },
		};
		pm.syncResult = [makeSyncedRef(pluginUri, '/p/bundle', [child])];
		await syncClientCustomizations(agent, stateManager, created.session, 'client-1', [clientCustomization]);
		sdk.nextQueryMessages = [makeSystemInitMessage(created.sdkSessionId), makeResultSuccess(created.sdkSessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		const session = agent.getSessionForTesting(created.session)!;
		session.setHostCustomizations([plugin]);
		const getDesiredMcpEnablement = () => (session as unknown as { _getDesiredMcpServerEnablement(): Map<string, boolean> })._getDesiredMcpServerEnablement();

		const before = [...getDesiredMcpEnablement()];
		pm.syncResult = [];
		await syncClientCustomizations(agent, stateManager, created.session, 'client-1', []);
		const after = [...getDesiredMcpEnablement()];

		assert.deepStrictEqual({ before, after }, {
			before: [[serverName, false]],
			after: [[serverName, true]],
		});
	});

	test('removing a client removes its plugin and bundled MCP enablement', async () => {
		const pm = new FakeAgentPluginManager();
		const { agent, sdk, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const pluginUri = 'https://bundle';
		const serverName = 'bundled';
		const child: McpServerCustomization = {
			type: CustomizationType.McpServer,
			id: 'bundled-server',
			uri: `${pluginUri}/.mcp.json`,
			name: serverName,
			state: { kind: McpCustomizationServerStatus.Starting },
		};
		const plugin: PluginCustomization = {
			type: CustomizationType.Plugin,
			id: customizationId(pluginUri),
			uri: pluginUri,
			name: 'Bundle',
			children: [child],
		};
		pm.syncResult = [makeSyncedRef(pluginUri, '/p/bundle', [child])];
		await syncClientCustomizations(agent, stateManager, created.session, 'client-1', [{
			...makeClientCustomization(pluginUri, 'Bundle'),
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			childEnablement: { [serverName]: [{ kind: CustomizationEnablementKind.Global, enabled: false }] },
		}]);
		sdk.nextQueryMessages = [makeSystemInitMessage(created.sdkSessionId), makeResultSuccess(created.sdkSessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		const session = agent.getSessionForTesting(created.session)!;
		session.setHostCustomizations([plugin]);
		const getDesiredMcpEnablement = () => (session as unknown as { _getDesiredMcpServerEnablement(): Map<string, boolean> })._getDesiredMcpServerEnablement();

		const before = [...getDesiredMcpEnablement()];
		agent.removeActiveClient(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), 'client-1');
		await tick();
		const after = [...getDesiredMcpEnablement()];

		assert.deepStrictEqual({ before, after }, {
			before: [[serverName, false]],
			after: [[serverName, true]],
		});
	});

	test('send pre-flight: dirty customizations triggers a rebind (SDK plugin URI set is captured at startup, so any change must restart the Query)', async () => {
		const pm = new FakeAgentPluginManager();
		const ctx = buildCtxWith(pm);
		const { agent, sdk, stateManager } = ctx;
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		// Stage 2 turns and park the iterator after turn 1's `result` so
		// `_query` stays bound (mirroring the "reuse query" pattern).
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (idx: number) => { if (idx === 2) { await advance.p; } };
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		assert.strictEqual(sdk.startupCallCount, 1);

		// Customization sync flips dirty; the next sendMessage's
		// pre-flight rebinds so `Options.plugins` on the new Query
		// includes the new path.
		pm.syncResult = [makeSyncedRef('https://a', '/p/a')];
		await syncClientCustomizations(agent, stateManager, created.session, 'c', [makeClientCustomization('https://a', 'A')]);
		const firstQuery = sdk.warmQueries[0].produced!;

		const p2 = agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));
		await tick();
		advance.complete();
		await p2;

		assert.deepStrictEqual({
			reloadsOnFirstQuery: firstQuery.reloadPluginsCallCount,
			startups: sdk.startupCallCount,
			warmQueries: sdk.warmQueries.length,
		}, { reloadsOnFirstQuery: 0, startups: 2, warmQueries: 2 });
	});

	test('mid-turn reducer toggle reconciles before the following send', async () => {
		const pm = new FakeAgentPluginManager();
		const ctx = buildCtxWith(pm);
		const { agent, sdk, stateManager } = ctx;
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		// Materialize, then drain the dirty bit from a customization
		// sync so the pre-flight for the SECOND turn is clean.
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];
		pm.syncResult = [makeSyncedRef('https://x', '/p/x')];
		await syncClientCustomizations(agent, stateManager, created.session, 'c', [makeClientCustomization('https://x', 'X')]);
		publishReducerCustomizations(stateManager, created.session, await agent.getChatCustomizations(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session)));
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
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

		const inflight = agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));
		await new Promise(r => setImmediate(r));

		// Toggle a synced customization during the in-flight turn. Its pre-flight
		// already passed, so no SDK action occurs until the following send.
		const startupsBefore = sdk.startupCallCount;
		stateManager.dispatchServerAction(created.session.toString(), {
			type: ActionType.SessionCustomizationToggled,
			id: customizationId('https://x'),
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
		});
		assert.strictEqual(session.clientCustomizationsDiff.hasDifference, false);
		assert.strictEqual(sdk.startupCallCount, startupsBefore, 'no rebind during the in-flight turn');

		gate.complete();
		await inflight;
		sdk.queryAdvance = undefined;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'third', undefined, undefined, 'turn-3', undefined, undefined, chatContext(defaultChatUri(created.session)));
		assert.deepStrictEqual({
			startups: sdk.startupCallCount,
			plugins: sdk.capturedStartupOptions.at(-1)?.plugins,
		}, {
			startups: startupsBefore + 1,
			plugins: undefined,
		});
	});

	test('getChatCustomizations swallows SDK snapshot failure and returns the client-pushed projection', async () => {
		// `snapshotResolvedCustomizations` calls `supportedAgents()` and
		// `mcpServerStatus()` in `Promise.all`; the FakeQuery throws on
		// both. The session should warn-log and still return the
		// client-pushed slice rather than blanking the UI.
		const pm = new FakeAgentPluginManager();
		pm.syncResult = [makeSyncedRef('https://a', '/p/a')];
		const { agent, sdk, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await syncClientCustomizations(agent, stateManager, created.session, 'c', [makeClientCustomization('https://a', 'A')]);
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		const customizations = await agent.getChatCustomizations!(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session));
		// SDK snapshot failed → `sdk` stays undefined → unfiltered fallback:
		// the client-pushed entry survives (UI not blanked) and the curated
		// built-ins are appended (the built-in agents directory and the skills
		// container) since there is no live set to derive from.
		assert.deepStrictEqual(customizations.map(c => c.uri), ['https://a', 'file:///mock-home/.claude/agents', 'agent-builtin:/skills'], 'client-pushed projection survives SDK snapshot failure');
	});

	test('getChatCustomizations derives the Built-in container from the live SDK command set post-materialize', async () => {
		// Once materialized, the runtime's real built-ins are exactly the SDK
		// commands we don't discover on disk — surfaced read-only with the
		// SDK's own descriptions, replacing the curated pre-materialize seed.
		const pm = new FakeAgentPluginManager();
		const { agent, sdk, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		// A successful snapshot: one SDK-only command, no agents/MCP. (No disk
		// skills exist under /work, so the command becomes a built-in.)
		sdk.supportedCommandsResult = [{ name: 'sdkcmd', description: 'Provided by the runtime.', argumentHint: '' }];
		sdk.supportedAgentsResult = [];
		sdk.mcpServerStatusResult = [];
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		const customizations = await agent.getChatCustomizations!(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session));
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
	});

	test('getChatCustomizations surfaces a native plugin captured from the live SDK init.plugins (path filter)', async () => {
		// Native plugins are auto-loaded by the runtime; the host only surfaces
		// them. Post-materialize, a plugin survives only when the captured
		// `system/init.plugins` reports its resolved root path — proving the
		// pipeline captures `message.plugins` and the discovery filter consumes it.
		const pm = new FakeAgentPluginManager();
		const { agent, sdk, fileService, stateManager } = buildCtxWith(pm);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

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
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		const customizations = await agent.getChatCustomizations!(defaultChatUri(created.session), chatContext(defaultChatUri(created.session)), hostCustomizations(stateManager, created.session));
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
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		await agent.chats.changeAgent(defaultChatUri(created.session), { uri: 'file:///foo/agents/code-reviewer.md' }, chatContext(defaultChatUri(created.session)));
		assert.strictEqual(sdk.startupCallCount, 0, 'no SDK startup from changeAgent on provisional');

		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, 'code-reviewer', 'agent name resolved from file URI basename');
	});

	test('changeAgent on a materialized session triggers a rebind with the new Options.agent on the rebuilt Query', async () => {
		const pm = new FakeAgentPluginManager();
		const ctx = buildCtxWith(pm);
		const { agent, sdk } = ctx;
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;

		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, undefined, 'no agent on first startup');

		// Mid-session agent change: flips dirty, next send rebinds
		// (SDK has no working runtime hook to swap the agent in place).
		await agent.chats.changeAgent(defaultChatUri(created.session), { uri: 'file:///foo/agents/planner.md' }, chatContext(defaultChatUri(created.session)));
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.strictEqual(sdk.startupCallCount, 2, 'rebind on agent change');
		assert.strictEqual(sdk.capturedStartupOptions[1]?.agent, 'planner', 'agent baked into rebuilt Options');
	});

	test('changeAgent(undefined) clears the selection: rebind, Options.agent omitted', async () => {
		const pm = new FakeAgentPluginManager();
		const ctx = buildCtxWith(pm);
		const { agent, sdk } = ctx;
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, {
			workingDirectories: [URI.file('/work')],
			agent: { uri: 'file:///foo/agents/planner.md' },
		});
		const sessionId = created.sdkSessionId;

		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];
		await agent.chats.sendMessage(defaultChatUri(created.session), 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(defaultChatUri(created.session)));
		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, 'planner');

		await agent.chats.changeAgent(defaultChatUri(created.session), undefined, chatContext(defaultChatUri(created.session)));
		await agent.chats.sendMessage(defaultChatUri(created.session), 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(defaultChatUri(created.session)));

		assert.strictEqual(sdk.startupCallCount, 2);
		assert.strictEqual(sdk.capturedStartupOptions[1]?.agent, undefined, 'cleared agent omitted from rebuilt Options');
	});

	// #region Multi-chat — additional (non-default) chats

	test('createChat persists an additional chat; getChats lists it; disposeChat removes it', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));

		await agent.chats.createChat(chatUri, created.session, { ...resolvedChatOptions() });
		const afterCreate = listAdditionalChats(agent, created.session);

		// Idempotent re-create must not duplicate the catalog entry.
		await agent.chats.createChat(chatUri, created.session, { ...resolvedChatOptions() });
		const afterRecreate = listAdditionalChats(agent, created.session);

		await agent.chats.disposeChat(chatUri, chatContext(chatUri));
		const afterDispose = listAdditionalChats(agent, created.session);

		assert.deepStrictEqual({ afterCreate, afterRecreate, afterDispose }, {
			afterCreate: [chatUri.toString()],
			afterRecreate: [chatUri.toString()],
			afterDispose: [],
		});
	});

	test('createChat resolves every chat the same way, whatever role the host gives it', async () => {
		// One creation algorithm: the chat a session starts with and an
		// additional chat are created by the same call with the same resolved
		// options, and both come back with the same resolved metadata — an
		// exact opaque backing plus its own separately-enumerable SDK
		// conversation. The provider classifies neither.
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const workDir = URI.file('/work');
		const created = await createSession(agent, { workingDirectories: [workDir] });
		const additionalChat = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		const additional = await agent.chats.createChat(additionalChat, chatContext(additionalChat), resolvedChatOptions([workDir]));

		const shapeOf = (result: IAgentCreateChatResult) => ({
			fields: Object.keys(result).sort(),
			resolvedWorkingDirectory: result.resolvedWorkingDirectory?.fsPath,
			provisional: result.provisional,
			backsItsOwnConversation: JSON.parse(result.providerData!).sdkSessionId === AgentSession.id(result.backingSession!),
		});
		const expected = {
			fields: ['backingSession', 'providerData', 'provisional', 'resolvedWorkingDirectory'],
			resolvedWorkingDirectory: workDir.fsPath,
			provisional: true,
			backsItsOwnConversation: true,
		};

		assert.deepStrictEqual({
			firstChat: shapeOf(created.chat!),
			additionalChat: shapeOf(additional!),
			distinctConversations: AgentSession.id(additional!.backingSession!) !== created.sdkSessionId,
		}, {
			firstChat: expected,
			additionalChat: expected,
			distinctConversations: true,
		});
	});

	test('createChat without working directories runs an additional chat in the session scratch dir too', async () => {
		// The workspace-less fallback is a property of the creation algorithm,
		// not of a session's first chat: an additional chat the host resolved
		// no directory for lands in the same per-session scratch dir.
		const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/claude-peer-qc-home-`));
		const { agent, sdk } = createTestContext(disposables, { userHome });
		try {
			await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

			const created = await createSession(agent, {});
			const additionalChat = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
			const additional = await agent.chats.createChat(additionalChat, chatContext(additionalChat), {});
			const expected = URI.joinPath(userHome, '.copilot', 'chats', AgentSession.id(created.session));

			const additionalId = AgentSession.id(additional!.backingSession!);
			sdk.nextQueryMessages = [makeSystemInitMessage(additionalId), makeResultSuccess(additionalId)];
			await agent.chats.sendMessage(additionalChat, 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(additionalChat));

			assert.deepStrictEqual({
				resolvedWorkingDirectory: additional?.resolvedWorkingDirectory?.fsPath,
				startupCwd: sdk.capturedStartupOptions.at(-1)?.cwd,
			}, {
				resolvedWorkingDirectory: expected.fsPath,
				startupCwd: expected.fsPath,
			});
		} finally {
			await fs.rm(userHome.fsPath, { recursive: true, force: true });
		}
	});

	test('createChat / disposeChat on the default chat URI are no-ops', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const defaultChat = URI.parse(buildChatUri(created.session.toString(), 'default'));

		await agent.chats.createChat(defaultChat, created.session, { ...resolvedChatOptions() });
		await agent.chats.disposeChat(defaultChat, chatContext(defaultChat));

		assert.deepStrictEqual(listAdditionalChats(agent, created.session), []);
	});

	test('chat backings retain only provider chat data', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const defaultChat = defaultChatUri(created.session);
		await bindDefaultChat(agent, created.session);
		const additionalChat = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		const additional = await agent.chats.createChat(additionalChat, created.session, { model: { id: 'claude-opus-4.6' }, ...resolvedChatOptions() });
		const backings = (agent as unknown as {
			_chatBackings: Map<string, { readonly sdkSessionId: string; readonly model?: { readonly id: string } }>;
		})._chatBackings;

		assert.deepStrictEqual([...backings].map(([chat, backing]) => ({ chat, backing })), [
			{ chat: defaultChat.toString(), backing: { sdkSessionId: created.sdkSessionId } },
			{ chat: additionalChat.toString(), backing: { sdkSessionId: AgentSession.id(additional!.backingSession!), model: { id: 'claude-opus-4.6' } } },
		]);
	});

	test('createChat keeps the AH session id independent from the Claude SDK id', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const session = AgentSession.uri('claude', 'ah-session');
		const chat = defaultChatUri(session);
		const context = { configurationResource: session, resource: session };

		const created = await createProviderSession(agent, chat, context, { session, workingDirectories: [URI.file('/work')] });
		const sdkSessionId = AgentSession.id(created.chat!.backingSession!);
		sdk.nextQueryMessages = [makeSystemInitMessage(sdkSessionId), makeResultSuccess(sdkSessionId)];
		await agent.chats.sendMessage(chat, 'hello', undefined, undefined, 'turn-1', undefined, undefined, context);

		assert.deepStrictEqual({
			ahSessionId: AgentSession.id(created.session),
			sdkSessionId,
			startupSessionId: sdk.capturedStartupOptions[0]?.sessionId,
			providerData: JSON.parse(created.chat!.providerData!),
		}, {
			ahSessionId: 'ah-session',
			sdkSessionId,
			startupSessionId: sdkSessionId,
			providerData: { sdkSessionId },
		});
		assert.notStrictEqual(sdkSessionId, 'ah-session');
	});

	test('createChat({ fork }) binds the exact target chat directly, with no bindSessionChat call, decoupling the new AH session id from the forked SDK id', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		const sourceUri = AgentSession.uri('claude', sourceId);
		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];
		await bindDefaultChat(agent, sourceUri);

		const targetSession = AgentSession.uri('claude', 'ah-target');
		const targetChat = defaultChatUri(targetSession);
		const targetContext = { configurationResource: targetSession, resource: targetSession };

		const created = await createProviderSession(agent, targetChat, targetContext, {
			session: targetSession,
		}, { fork: { source: defaultChatUri(sourceUri), turnId: 'u1' } });

		// No `bindSessionChat` call anywhere above: the fork already bound the
		// exact target chat, so the first send must resume the forked SDK
		// transcript directly.
		const sdkSessionId = AgentSession.id(created.chat!.backingSession!);
		sdk.nextQueryMessages = [makeSystemInitMessage(sdkSessionId), makeResultSuccess(sdkSessionId)];
		await agent.chats.sendMessage(targetChat, 'hi', undefined, undefined, 'turn-1', undefined, undefined, targetContext);

		assert.deepStrictEqual({
			ahSessionId: AgentSession.id(created.session),
			sdkSessionId,
			startupResume: sdk.capturedStartupOptions[0]?.resume,
			provisional: created.provisional,
			providerData: JSON.parse(created.chat!.providerData!),
		}, {
			ahSessionId: 'ah-target',
			sdkSessionId: 'forked-1',
			startupResume: 'forked-1',
			// No live session object is registered for a fork; materialization
			// stays deferred to the first send.
			provisional: undefined,
			providerData: { sdkSessionId: 'forked-1' },
		});
		assert.notStrictEqual(sdkSessionId, 'ah-target');
	});

	test('createChat({ fork }) forks from a source whose own AH session id differs from its SDK backing', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		// The source was itself provisioned via `createChat`, so its AH
		// session id ('ah-source') is independent of the SDK id Claude assigned.
		const sourceSession = AgentSession.uri('claude', 'ah-source');
		const sourceChat = defaultChatUri(sourceSession);
		const sourceContext = { configurationResource: sourceSession, resource: sourceSession };
		const sourceCreated = await createProviderSession(agent, sourceChat, sourceContext, { session: sourceSession, workingDirectories: [URI.file('/work')] });
		const sourceSdkId = AgentSession.id(sourceCreated.chat!.backingSession!);
		assert.notStrictEqual(sourceSdkId, 'ah-source');

		// Materialize the source with a real send so it is pipeline-ready and
		// has a genuine transcript to fork from.
		sdk.nextQueryMessages = [makeSystemInitMessage(sourceSdkId), makeResultSuccess(sourceSdkId)];
		await agent.chats.sendMessage(sourceChat, 'hello', undefined, undefined, 'turn-0', undefined, undefined, sourceContext);
		sdk.sessionMessagesById.set(sourceSdkId, forkSourceMessages(sourceSdkId));
		sdk.forkSessionResult = { sessionId: 'forked-source' };
		sdk.sessionList = [{ sessionId: 'forked-source', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const targetSession = AgentSession.uri('claude', 'ah-target-2');
		const targetChat = defaultChatUri(targetSession);
		const targetContext = { configurationResource: targetSession, resource: targetSession };
		const created = await createProviderSession(agent, targetChat, targetContext, {
			session: targetSession,
		}, { fork: { source: sourceChat, turnId: 'u1' } });

		assert.deepStrictEqual({
			forkCall: sdk.forkSessionCalls.at(-1),
			ahSessionId: AgentSession.id(created.session),
			sdkSessionId: AgentSession.id(created.chat!.backingSession!),
		}, {
			forkCall: { sessionId: sourceSdkId, options: { upToMessageId: 'a1' } },
			ahSessionId: 'ah-target-2',
			sdkSessionId: 'forked-source',
		});
	});

	test('createChat({ fork }) inherits the source permissionMode overlay onto the exact target chat', async () => {
		const { agent, sdk, instantiationService } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sourceId = 'src-uuid';
		const sourceUri = AgentSession.uri('claude', sourceId);
		// Seed the SOURCE overlay; the fork must copy it onto the exact target
		// chat's own overlay key (not the SDK-derived fork session URI).
		const metaStore = instantiationService.createInstance(ClaudeSessionMetadataStore);
		await metaStore.write(sourceUri, { permissionMode: 'plan' });

		sdk.sessionMessagesById.set(sourceId, forkSourceMessages(sourceId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];
		await bindDefaultChat(agent, sourceUri);

		const targetSession = AgentSession.uri('claude', 'ah-target-overlay');
		const targetChat = defaultChatUri(targetSession);
		const targetContext = { configurationResource: targetSession, resource: targetSession };
		const created = await createProviderSession(agent, targetChat, targetContext, {
			session: targetSession,
		}, { fork: { source: defaultChatUri(sourceUri), turnId: 'u1' } });

		// No `bindSessionChat`: the overlay must already be keyed to the exact
		// target chat's own AH session so the first send resumes with the
		// inherited permission mode.
		const sdkSessionId = AgentSession.id(created.chat!.backingSession!);
		sdk.nextQueryMessages = [makeSystemInitMessage(sdkSessionId), makeResultSuccess(sdkSessionId)];
		await agent.chats.sendMessage(targetChat, 'hi', undefined, undefined, 'turn-1', undefined, undefined, targetContext);

		assert.strictEqual(sdk.capturedStartupOptions[0]?.permissionMode, 'plan');
	});

	test('createChat({ importConversation }) binds the exact target chat directly and its model takes precedence over a create-config model', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const session = AgentSession.uri('claude', 'ah-import');
		const chat = defaultChatUri(session);
		const context = { configurationResource: session, resource: session };

		const created = await createProviderSession(agent, chat, context, {
			session,
			workingDirectories: [URI.file('/work')],
			// Mutually exclusive with `fork`; Claude has no native
			// transcript-seeding for arbitrary imported turns, so `turns` has no
			// observable effect here (host-level turn display is out of scope).
			importConversation: { turns: [], model: { id: 'claude-opus-4.6' } },
			model: { id: 'claude-sonnet-4.5' },
		});

		// No `bindSessionChat`: the exact chat is already bound; the first real
		// send starts the SDK conversation with the imported model, not the
		// create-config model override.
		const sdkSessionId = AgentSession.id(created.chat!.backingSession!);
		sdk.nextQueryMessages = [makeSystemInitMessage(sdkSessionId), makeResultSuccess(sdkSessionId)];
		await agent.chats.sendMessage(chat, 'hello', undefined, undefined, 'turn-1', undefined, undefined, context);

		assert.deepStrictEqual({
			ahSessionId: AgentSession.id(created.session),
			startupModel: sdk.capturedStartupOptions[0]?.model,
			provisional: created.provisional,
		}, {
			ahSessionId: 'ah-import',
			startupModel: 'claude-opus-4-6',
			provisional: true,
		});
	});

	test('active-client tools are addressed to the exact chats Agent Host calls out, independently', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const session = AgentSession.uri('claude', 'ah-session');
		const defaultChat = defaultChatUri(session);
		const created = await createProviderSession(agent, defaultChat, { configurationResource: session, resource: session }, { session, workingDirectories: [URI.file('/work')] });
		const peer = URI.parse(buildChatUri(session, 'peer'));
		const peerResult = await agent.chats.createChat(peer, { configurationResource: session, resource: peer }, { ...resolvedChatOptions() });
		const defaultHandle = agent.getOrCreateActiveClient(defaultChat, { configurationResource: session, resource: session }, { clientId: 'client' });
		const peerHandle = agent.getOrCreateActiveClient(peer, { configurationResource: session, resource: peer }, { clientId: 'client' });
		defaultHandle.tools = [{ name: 'client_tool', description: 'tool', inputSchema: { type: 'object' } }];
		peerHandle.tools = [{ name: 'client_tool', description: 'tool', inputSchema: { type: 'object' } }];
		const defaultSdkId = AgentSession.id(created.chat!.backingSession!);
		const peerSdkId = AgentSession.id(peerResult!.backingSession!);
		sdk.nextQueryMessages = [makeSystemInitMessage(defaultSdkId), makeResultSuccess(defaultSdkId)];
		await agent.chats.sendMessage(defaultChat, 'default', undefined, undefined, 'turn-default', undefined, undefined, { configurationResource: session, resource: session });
		sdk.nextQueryMessages = [makeSystemInitMessage(peerSdkId), makeResultSuccess(peerSdkId)];
		await agent.chats.sendMessage(peer, 'peer', undefined, undefined, 'turn-peer', undefined, undefined, { configurationResource: session, resource: peer });

		const defaultSession = agent.getSessionForTesting(created.chat!.backingSession!)!;
		const peerSession = agent.getSessionForTesting(peerResult!.backingSession!)!;
		const before = [defaultSession, peerSession].map(chat => chat.getClientTools('client').map(tool => tool.name));
		agent.removeActiveClient(defaultChat, { configurationResource: session, resource: session }, 'client');
		await tick();
		const afterDefaultOnly = [defaultSession, peerSession].map(chat => chat.getClientTools('client').map(tool => tool.name));
		agent.removeActiveClient(peer, { configurationResource: session, resource: peer }, 'client');
		await tick();
		const afterBoth = [defaultSession, peerSession].map(chat => chat.getClientTools('client').map(tool => tool.name));

		assert.deepStrictEqual({ before, afterDefaultOnly, afterBoth }, {
			before: [['client_tool'], ['client_tool']],
			// Removing the default chat's handle must not touch the peer's —
			// there is no shared membership to fan the removal across.
			afterDefaultOnly: [[], ['client_tool']],
			afterBoth: [[], []],
		});
	});

	test('createChat({ fork }) forks the source chat; the additional chat resumes its own forked SDK session', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		// Parent session with a two-turn transcript; fork the additional chat at u1.
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const parentId = created.sdkSessionId;
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.createChat(chatUri, created.session, { ...resolvedChatOptions(), fork: { source: defaultChatUri(created.session), turnId: 'u1' } });

		const forkCall = sdk.forkSessionCalls[0];

		// Sending to the additional chat resumes ITS forked chat, not the parent's.
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(chatUri, 'next', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chatUri));

		assert.deepStrictEqual({
			forkCall,
			chats: listAdditionalChats(agent, created.session),
			startupResume: sdk.capturedStartupOptions[0]?.resume,
		}, {
			forkCall: { sessionId: parentId, options: { upToMessageId: 'a1' } },
			chats: [chatUri.toString()],
			startupResume: 'forked-1',
		});
	});

	test('createChat({ fork }) keeps provider history intact', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const parentId = created.sdkSessionId;
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.forkSessionResult = { sessionId: 'side-1' };
		sdk.sessionList = [{ sessionId: 'side-1', summary: 'side', lastModified: 1, cwd: URI.file('/work').fsPath }];
		sdk.sessionMessagesById.set('side-1', forkSourceMessages('side-1').slice(0, 2));

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-side'));
		const internals = agent as unknown as {
			_sessionSequencer: { queue<T>(key: string, task: () => Promise<T>): Promise<T> };
		};
		const sourceLockEntered = new DeferredPromise<void>();
		const releaseSourceLock = new DeferredPromise<void>();
		const sourceLock = internals._sessionSequencer.queue(parentId, async () => {
			sourceLockEntered.complete();
			await releaseSourceLock.p;
		});
		await sourceLockEntered.p;
		let result;
		const createTimeout = timeout(5_000);
		try {
			result = await Promise.race([
				agent.chats.createChat(chatUri, created.session, { fork: { source: defaultChatUri(created.session), turnId: 'u1' }, ...resolvedChatOptions() }),
				createTimeout.then(() => { throw new Error('Fork creation waited for the source turn lock'); }),
			]);
		} finally {
			createTimeout.cancel();
			releaseSourceLock.complete();
			await sourceLock;
		}
		sdk.nextQueryMessages = [makeSystemInitMessage('side-1'), makeResultSuccess('side-1')];
		await agent.chats.sendMessage(chatUri, 'side question', undefined, undefined, 'turn-side', undefined, undefined, chatContext(chatUri));
		const sentContent = sdk.warmQueries.at(-1)?.produced?.drainedPrompts[0]?.message.content;
		const sentPrompt = typeof sentContent === 'string'
			? sentContent
			: sentContent?.filter(block => block.type === 'text').map(block => block.text).join('\n');
		sdk.sessionMessagesById.set('side-1', [
			...forkSourceMessages('side-1').slice(0, 2),
			{ type: 'user', uuid: 'turn-side', session_id: 'side-1', parent_tool_use_id: null, parent_agent_id: null, message: { role: 'user', content: [{ type: 'text', text: 'side question' }] } },
			{ type: 'assistant', uuid: 'a3', session_id: 'side-1', parent_tool_use_id: null, parent_agent_id: null, message: { id: 'msg_a3', role: 'assistant', content: [{ type: 'text', text: 'side answer' }] } },
		]);
		await agent.chats.changeModel(chatUri, { id: 'claude-opus-4-6' }, chatContext(chatUri));
		const turns = await agent.chats.getMessages(chatUri, chatContext(chatUri));

		assert.deepStrictEqual({
			forkCall: sdk.forkSessionCalls[0],
			sentPrompt,
			returnsInheritedTurns: turns.length > 1,
			providerData: result ? JSON.parse(result.providerData!) : undefined,
			inheritedTurnId: result?.inheritedTurnId,
		}, {
			forkCall: { sessionId: parentId, options: { upToMessageId: 'a1' } },
			sentPrompt: 'side question',
			returnsInheritedTurns: true,
			providerData: { sdkSessionId: 'side-1' },
			inheritedTurnId: 'u1',
		});
	});

	test('createChat({ fork }) creates a fresh provider chat when the source transcript is unavailable', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-side-live'));
		const result = await agent.chats.createChat(chatUri, created.session, { fork: { source: defaultChatUri(created.session), turnId: 'turn-source' }, ...resolvedChatOptions() });

		assert.deepStrictEqual({
			forked: sdk.forkSessionCalls.length,
			hasProviderData: result?.providerData !== undefined,
		}, {
			forked: 0,
			hasProviderData: true,
		});
	});

	test('createChat({ fork }) still creates the chat when nothing is inheritable', async () => {
		// The fork is created without provider inheritance rather than failing
		// outright when the requested turn is unavailable to the SDK.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-side-orphan'));
		const result = await agent.chats.createChat(chatUri, created.session, { fork: { source: defaultChatUri(created.session), turnId: 'turn-source' }, ...resolvedChatOptions() });

		assert.deepStrictEqual({
			forked: sdk.forkSessionCalls.length,
			hasProviderData: result?.providerData !== undefined,
		}, {
			forked: 0,
			hasProviderData: true,
		});
	});

	test('createChat({ fork }) creates a fresh provider chat when a source fork is rejected', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const parentId = created.sdkSessionId;
		const sourceChat = defaultChatUri(created.session);
		const turnId = 'request_31bb16da-2a24-4312-8adb-04781b463d41';
		sdk.sessionMessagesById.set(parentId, [{
			type: 'user',
			uuid: turnId,
			session_id: parentId,
			parent_tool_use_id: null,
			parent_agent_id: null,
			message: { role: 'user', content: [{ type: 'text', text: 'source question' }] },
		}]);
		sdk.forkSessionRejection = new Error(`Invalid upToMessageId: ${turnId}`);

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-side-active'));
		const result = await agent.chats.createChat(chatUri, created.session, {
			fork: { source: sourceChat, turnId },
			...resolvedChatOptions(),
		});
		assert.ok(result?.providerData);

		assert.deepStrictEqual({
			forked: sdk.forkSessionCalls.length,
			hasProviderData: result.providerData !== undefined,
		}, {
			forked: 0,
			hasProviderData: true,
		});
	});

	test('createChat({ fork }) uses the supplied provider anchor', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const parentId = created.sdkSessionId;
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.forkSessionResult = { sessionId: 'side-local-1' };
		sdk.sessionList = [{ sessionId: 'side-local-1', summary: 'side local', lastModified: 1, cwd: URI.file('/work').fsPath }];
		sdk.sessionMessagesById.set('side-local-1', forkSourceMessages('side-local-1').slice(0, 2));

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-side-local'));
		const result = await agent.chats.createChat(chatUri, created.session, {
			fork: {
				source: defaultChatUri(created.session),
				turnId: 'u1',
			},
			...resolvedChatOptions(),
		});
		sdk.nextQueryMessages = [makeSystemInitMessage('side-local-1'), makeResultSuccess('side-local-1')];
		await agent.chats.sendMessage(chatUri, 'side question', undefined, undefined, 'turn-side-local', undefined, undefined, chatContext(chatUri));
		const sentContent = sdk.warmQueries.at(-1)?.produced?.drainedPrompts[0]?.message.content;
		const sentPrompt = typeof sentContent === 'string'
			? sentContent
			: sentContent?.filter(block => block.type === 'text').map(block => block.text).join('\n');
		sdk.sessionMessagesById.set('side-local-1', [
			...forkSourceMessages('side-local-1').slice(0, 2),
			{ type: 'user', uuid: 'turn-side-local', session_id: 'side-local-1', parent_tool_use_id: null, parent_agent_id: null, message: { role: 'user', content: [{ type: 'text', text: 'side question' }] } },
			{ type: 'assistant', uuid: 'a3', session_id: 'side-local-1', parent_tool_use_id: null, parent_agent_id: null, message: { id: 'msg_a3', role: 'assistant', content: [{ type: 'text', text: 'side answer' }] } },
		]);
		const turns = await agent.chats.getMessages(chatUri, chatContext(chatUri));

		assert.deepStrictEqual({
			forkCall: sdk.forkSessionCalls[0],
			sentPrompt,
			returnsInheritedTurns: turns.length > 1,
			providerData: result ? JSON.parse(result.providerData!) : undefined,
			inheritedTurnId: result?.inheritedTurnId,
		}, {
			forkCall: { sessionId: parentId, options: { upToMessageId: 'a1' } },
			sentPrompt: 'side question',
			returnsInheritedTurns: true,
			providerData: { sdkSessionId: 'side-local-1' },
			inheritedTurnId: 'u1',
		});
	});

	test('createChat({ fork }) with an unknown turn falls back to a fresh chat', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const parentId = created.sdkSessionId;
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.createChat(chatUri, created.session, { ...resolvedChatOptions(), fork: { source: defaultChatUri(created.session), turnId: 'does-not-exist' } });

		assert.deepStrictEqual({
			forked: sdk.forkSessionCalls.length,
			chats: listAdditionalChats(agent, created.session),
		}, {
			forked: 0,
			chats: [chatUri.toString()],
		});
	});

	test('sendMessage to an additional chat targets a chat distinct from the parent session', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const parentId = created.sdkSessionId;
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.createChat(chatUri, created.session, { ...resolvedChatOptions(), fork: { source: defaultChatUri(created.session), turnId: 'u1' } });

		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(chatUri, 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chatUri));

		// The additional chat's startup resumed `forked-1`; the parent session was
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

	test('SDK callbacks route to an additional chat through the reverse SDK id index', async () => {
		const { agent, proxy, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const chatUri = URI.parse(buildChatUri(created.session, 'chat-1'));
		const result = await agent.chats.createChat(chatUri, created.session, { ...resolvedChatOptions() });
		const additionalId = AgentSession.id(result!.backingSession!);
		sdk.nextQueryMessages = [makeSystemInitMessage(additionalId), makeResultSuccess(additionalId)];
		sdk.queryAdvance = async index => {
			if (index === 1) {
				proxy.onDidReportCreditsEmitter.fire({ sessionId: additionalId, totalNanoAiu: 42 });
			}
		};
		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidChatProgress(signal => signals.push(signal)));

		await agent.chats.sendMessage(chatUri, 'additional', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chatUri));

		const usage = signals
			.filter(signal => signal.kind === 'action' && signal.resource.toString() === chatUri.toString())
			.map(signal => signal.kind === 'action' ? signal.action : undefined)
			.find(action => action?.type === ActionType.ChatUsage);
		assert.deepStrictEqual(usage?.type === ActionType.ChatUsage ? usage.usage._meta?.copilotUsage : undefined, { totalNanoAiu: 42 });
	});

	test('truncateChat targets the addressed SDK session', async () => {
		const database = new TestSessionDatabase();
		const { agent, sdk } = createTestContext(disposables, { database });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const chat = URI.parse(buildChatUri(created.session, 'chat-1'));
		const result = await agent.chats.createChat(chat, created.session, { ...resolvedChatOptions() });
		const additionalId = AgentSession.id(result!.backingSession!);
		sdk.sessionMessagesById.set(additionalId, forkSourceMessages(additionalId));
		sdk.nextQueryMessages = [makeSystemInitMessage(additionalId), makeResultSuccess(additionalId)];
		await agent.chats.sendMessage(chat, 'additional', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chat));

		await agent.truncateChat(chat, 'u1', chatContext(chat));

		assert.deepStrictEqual({
			getMessagesCall: sdk.getSessionMessagesCalls.at(-1),
			prunedAfter: database.deleteTurnsAfterCalls,
			parentMaterialized: sdk.capturedStartupOptions.some(options => options.sessionId === created.sdkSessionId),
		}, {
			getMessagesCall: { sessionId: additionalId, options: { includeSystemMessages: true } },
			prunedAfter: ['u1'],
			parentMaterialized: false,
		});
	});

	test('configuration events keep the inherited additional mode on the next send', async () => {
		const { agent, sdk, stateManager } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')], config: { permissionMode: 'default' } });
		stateManager.createSession({
			resource: created.session.toString(),
			provider: agent.id,
			title: '',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		stateManager.setSessionConfig(created.session.toString(), {
			schema: { type: 'object', properties: {} },
			values: { permissionMode: 'default' },
		});
		const chat = URI.parse(buildChatUri(created.session, 'chat-1'));
		const result = await agent.chats.createChat(chat, created.session, { ...resolvedChatOptions() });
		const additionalId = AgentSession.id(result!.backingSession!);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(additionalId), makeResultSuccess(additionalId),
			makeSystemInitMessage(additionalId), makeResultSuccess(additionalId),
		];
		await agent.chats.sendMessage(chat, 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chat));

		stateManager.dispatchClientAction(created.session.toString(), {
			type: ActionType.SessionConfigChanged,
			config: { permissionMode: 'bypassPermissions' },
		}, { clientId: 'picker', clientSeq: 1 });
		await tick();
		await agent.chats.sendMessage(chat, 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(chat));

		assert.deepStrictEqual(sdk.warmQueries.at(-1)?.produced?.recordedPermissionModes, ['bypassPermissions']);
	});

	test('lazy chat materialization applies the latest persisted permission mode', async () => {
		const { agent, configService, sdk, stateManager } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')], config: { permissionMode: 'default' } });
		const state = stateManager.createSession({
			resource: created.session.toString(),
			provider: 'claude',
			title: 'additional config',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		(state as { config?: SessionConfigState }).config = {
			schema: { type: 'object', properties: {} },
			values: { permissionMode: 'default' },
		};
		const chat = URI.parse(buildChatUri(created.session, 'chat-1'));
		const result = await agent.chats.createChat(chat, created.session, { ...resolvedChatOptions() });
		const additionalId = AgentSession.id(result!.backingSession!);
		sdk.nextQueryMessages = [makeSystemInitMessage(additionalId), makeResultSuccess(additionalId)];
		await agent.chats.sendMessage(chat, 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chat));
		await agent.chats.releaseChat(chat, chatContext(chat));

		configService.updateSessionConfig(created.session.toString(), { permissionMode: 'bypassPermissions' });
		sdk.sessionList = [{ sessionId: additionalId, summary: 'additional', lastModified: 1, cwd: URI.file('/work').fsPath }];
		sdk.nextQueryMessages = [makeSystemInitMessage(additionalId), makeResultSuccess(additionalId)];
		await agent.chats.sendMessage(chat, 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(chat));

		assert.strictEqual(sdk.capturedStartupOptions.at(-1)?.permissionMode, 'bypassPermissions');
	});

	test('onClientToolCallComplete targets the addressed additional chat', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const chat = URI.parse(buildChatUri(created.session, 'chat-1'));
		const result = await agent.chats.createChat(chat, created.session, { ...resolvedChatOptions() });
		const backingSession = result!.backingSession!;
		const additionalId = AgentSession.id(backingSession);
		sdk.nextQueryMessages = [makeSystemInitMessage(additionalId), makeResultSuccess(additionalId)];
		await agent.chats.sendMessage(chat, 'additional', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chat));
		const additional = agent.getSessionForTesting(backingSession)!;
		let settled = false;
		void additional.pendingClientToolCalls.register('tool-1').then(() => settled = true, () => undefined);

		agent.onClientToolCallComplete(chat, 'tool-1', { success: true, pastTenseMessage: 'ran' });
		await tick();

		assert.strictEqual(settled, true);
	});

	test('changeModel on an additional chat persists in the catalog so a later resume picks it up', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const parentId = created.sdkSessionId;
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.createChat(chatUri, created.session, { ...resolvedChatOptions(), fork: { source: defaultChatUri(created.session), turnId: 'u1' } });

		// Change the additional chat's model before it is materialized.
		await agent.chats.changeModel(chatUri, { id: 'claude-opus-4.6' }, chatContext(chatUri));

		// First send materializes (resumes) the chat with the changed model.
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(chatUri, 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chatUri));

		assert.strictEqual(sdk.capturedStartupOptions[0]?.model, 'claude-opus-4-6');
	});

	test('disposing the default SDK session does not dispose its additional chats', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		const result = await agent.chats.createChat(chatUri, created.session, { ...resolvedChatOptions() });
		const additionalId = AgentSession.id(result!.backingSession!);
		sdk.nextQueryMessages = [makeSystemInitMessage(additionalId), makeResultSuccess(additionalId)];
		await agent.chats.sendMessage(chatUri, 'additional', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chatUri));

		await disposeSession(agent, created.session);

		assert.deepStrictEqual({
			backings: listAdditionalChats(agent, created.session),
			liveChats: listLiveChats(agent),
			defaultSession: agent.getSessionForTesting(created.session),
		}, {
			backings: [chatUri.toString()],
			liveChats: [chatUri.toString()],
			defaultSession: undefined,
		});

		await agent.chats.disposeChat(chatUri, chatContext(chatUri));
		assert.deepStrictEqual(listAdditionalChats(agent, created.session), []);
	});

	test('disposeChat removes a host-bound default-chat provisional', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const session = AgentSession.uri('claude', 'unbound-default');
		await createSession(agent, { session, workingDirectories: [URI.file('/work')] });
		await bindDefaultChat(agent, session);
		assert.deepStrictEqual(listSessionChatBackings(agent), [defaultChatUri(session).toString()]);

		await agent.chats.disposeChat(defaultChatUri(session), chatContext(defaultChatUri(session)));

		assert.deepStrictEqual(listSessionChatBackings(agent), []);
	});

	test('releaseChat releases only the addressed live chat', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const session = AgentSession.uri('claude', 'release-session');
		const defaultChat = defaultChatUri(session);
		await createSession(agent, { session, workingDirectories: [URI.file('/work')] });
		await bindDefaultChat(agent, session);
		const additionalChat = URI.parse(buildChatUri(session, 'additional'));
		const additionalResult = await agent.chats.createChat(additionalChat, session, { ...resolvedChatOptions() });
		const additionalId = AgentSession.id(additionalResult!.backingSession!);
		sdk.nextQueryMessages = [makeSystemInitMessage('release-session'), makeResultSuccess('release-session')];
		await agent.chats.sendMessage(defaultChat, 'default', undefined, undefined, 'turn-default', undefined, undefined, chatContext(defaultChat));
		sdk.nextQueryMessages = [makeSystemInitMessage(additionalId), makeResultSuccess(additionalId)];
		await agent.chats.sendMessage(additionalChat, 'additional', undefined, undefined, 'turn-additional', undefined, undefined, chatContext(additionalChat));

		await agent.chats.releaseChat(additionalChat, chatContext(additionalChat));

		assert.deepStrictEqual({
			liveChats: listLiveChats(agent),
			backings: listAdditionalChats(agent, session),
		}, {
			liveChats: [defaultChat.toString()],
			backings: [additionalChat.toString()],
		});

		await agent.chats.releaseChat(defaultChat, chatContext(defaultChat));

		assert.deepStrictEqual({
			liveChats: listLiveChats(agent),
			sessionChatBackings: listSessionChatBackings(agent),
			backings: listAdditionalChats(agent, session),
		}, {
			liveChats: [],
			sessionChatBackings: [defaultChat.toString()],
			backings: [additionalChat.toString()],
		});
	});

	test('setPendingMessages routes steering to a materialized additional chat, warns for an unknown one', async () => {
		const logService = new CapturingLogService();
		const { agent, sdk } = createTestContext(disposables, { logService });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const parentId = created.sdkSessionId;
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.createChat(chatUri, created.session, { ...resolvedChatOptions(), fork: { source: defaultChatUri(created.session), turnId: 'u1' } });
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(chatUri, 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chatUri));

		// Known materialized additional chat: resolved via the `chat` arg, no warning.
		logService.warns.length = 0;
		agent.setPendingMessages!(chatUri, { id: 'p1', message: { text: 'steer', origin: { kind: MessageKind.User } } }, []);
		const warnAfterKnown = logService.warns.filter(w => w.includes('setPendingMessages'));

		// Unknown additional chat URI: not found, warns.
		const unknownChat = URI.parse(buildChatUri(created.session.toString(), 'chat-missing'));
		agent.setPendingMessages!(unknownChat, undefined, []);
		const warnAfterUnknown = logService.warns.filter(w => w.includes('setPendingMessages'));

		assert.deepStrictEqual({ knownWarns: warnAfterKnown.length, unknownWarns: warnAfterUnknown.length }, { knownWarns: 0, unknownWarns: 1 });
	});

	test('changeAgent on an additional chat persists to its overlay so a later resume picks it up', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const parentId = created.sdkSessionId;
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats.createChat(chatUri, created.session, { ...resolvedChatOptions(), fork: { source: defaultChatUri(created.session), turnId: 'u1' } });

		// Select a custom agent for the additional chat before it is materialized; the
		// selection lands on the chat's own overlay (mirrors changeModel).
		await agent.chats.changeAgent(chatUri, { uri: 'file:///foo/agents/planner.md' }, chatContext(chatUri));

		// First send materializes (resumes) the chat with the selected agent.
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats.sendMessage(chatUri, 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chatUri));

		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, 'planner');
	});

	test('sendMessage routes each additional chat to its own forked chat', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const parentId = created.sdkSessionId;
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));

		// Two additional chats, each forked from a different turn into its own SDK
		// chat. Staging distinct fork results pins per-chat identity.
		const chatA = URI.parse(buildChatUri(created.session.toString(), 'chat-a'));
		sdk.forkSessionResult = { sessionId: 'forked-a' };
		await agent.chats.createChat(chatA, created.session, { ...resolvedChatOptions(), fork: { source: defaultChatUri(created.session), turnId: 'u1' } });

		const chatB = URI.parse(buildChatUri(created.session.toString(), 'chat-b'));
		sdk.forkSessionResult = { sessionId: 'forked-b' };
		await agent.chats.createChat(chatB, created.session, { ...resolvedChatOptions(), fork: { source: defaultChatUri(created.session), turnId: 'u2' } });

		sdk.sessionList = [
			{ sessionId: 'forked-a', summary: 'a', lastModified: 1, cwd: URI.file('/work').fsPath },
			{ sessionId: 'forked-b', summary: 'b', lastModified: 1, cwd: URI.file('/work').fsPath },
		];

		// Each send must resume the chat backing THAT chat, never the
		// other and never the (un-materialized) parent session.
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-a'), makeResultSuccess('forked-a')];
		await agent.chats.sendMessage(chatA, 'to a', undefined, undefined, 'turn-a', undefined, undefined, chatContext(chatA));
		sdk.nextQueryMessages = [makeSystemInitMessage('forked-b'), makeResultSuccess('forked-b')];
		await agent.chats.sendMessage(chatB, 'to b', undefined, undefined, 'turn-b', undefined, undefined, chatContext(chatB));

		assert.deepStrictEqual({
			chats: listAdditionalChats(agent, created.session).sort(),
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

	test('restart round-trip: a forked additional chat re-materializes from the orchestrator\'s providerData on a fresh agent backed by the same database', async () => {
		const database = new TestSessionDatabase();

		// --- First "process": create a forked additional chat with a model override.
		// `createChat` hands the orchestrator an opaque `providerData` blob to
		// persist. ---
		const ctxA = createTestContext(disposables, { database });
		await ctxA.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(ctxA.agent, { workingDirectories: [URI.file('/work')] });
		const parentId = created.sdkSessionId;
		ctxA.sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		ctxA.sdk.forkSessionResult = { sessionId: 'forked-1' };

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		const createResult = await ctxA.agent.chats.createChat(chatUri, created.session, {
			model: { id: 'claude-opus-4.6' },
			...resolvedChatOptions(),
			fork: { source: defaultChatUri(created.session), turnId: 'u1' },
		});
		const providerData = createResult?.providerData;
		const catalogBefore = listAdditionalChats(ctxA.agent, created.session);

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

		await ctxB.agent.materializeChat!(chatUri, created.session, providerData);
		// Catalog reappears from the re-attached live backing without SDK contact.
		const catalogAfter = listAdditionalChats(ctxB.agent, created.session);

		// First send on the restored chat resumes its forked chat with
		// the persisted model override — history + per-chat model both came back.
		ctxB.sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await ctxB.agent.chats.sendMessage(chatUri, 'after restart', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chatUri));

		assert.deepStrictEqual({
			providerData: providerData && JSON.parse(providerData),
			catalogBefore,
			catalogAfter,
			liveChats: listLiveChats(ctxB.agent),
			resume: ctxB.sdk.capturedStartupOptions[0]?.resume,
			model: ctxB.sdk.capturedStartupOptions[0]?.model,
		}, {
			providerData: { sdkSessionId: 'forked-1', model: { id: 'claude-opus-4.6' } },
			catalogBefore: [chatUri.toString()],
			catalogAfter: [chatUri.toString()],
			liveChats: [chatUri.toString()],
			resume: 'forked-1',
			model: 'claude-opus-4-6',
		});
	});

	/**
	 * Per-resource-aware `ISessionDataService` double: unlike the shared
	 * single-database helper most tests use (fine when only one resource's
	 * overlay ever matters), this keys a distinct {@link TestSessionDatabase}
	 * per exact resource string — needed to prove a peer chat's own overlay is
	 * genuinely distinct from its session's shared configuration scope. The
	 * backing map may be reused across two `createTestContext` calls to
	 * simulate a restart that persists per-resource overlays to "disk".
	 */
	function createPerResourceSessionDataService(databases = new Map<string, TestSessionDatabase>()): ISessionDataService {
		const dbFor = (resource: URI) => {
			const key = resource.toString();
			let db = databases.get(key);
			if (!db) {
				db = new TestSessionDatabase();
				databases.set(key, db);
			}
			return db;
		};
		return {
			_serviceBrand: undefined,
			getSessionDataDir: session => URI.from({ scheme: Schemas.inMemory, path: `/session-data${session.path}` }),
			getSessionDataDirById: sessionId => URI.from({ scheme: Schemas.inMemory, path: `/session-data/${sessionId}` }),
			openDatabase: session => ({ object: dbFor(session), dispose: () => { } }),
			tryOpenDatabase: async session => ({ object: dbFor(session), dispose: () => { } }),
			deleteSessionData: async () => { },
			onWillDeleteSessionData: Event.None,
			cleanupOrphanedData: async () => { },
			whenIdle: async () => { },
		};
	}

	test('cold peer-chat fork inherits model/agent/permissionMode/workingDirectories from the source PEER chat, not the session-wide scope (regression)', async () => {
		// Regression coverage for the bug where a fork sourced from a peer
		// (non-default) chat read the shared session-wide configuration scope
		// instead of that peer's own persistence resource. A "wrong" overlay is
		// seeded at the session-wide scope as a trap: if the fix regresses, the
		// fork below would pick up these decoy values instead of the peer's own.
		const databases = new Map<string, TestSessionDatabase>();

		const ctxA = createTestContext(disposables, { sessionDataService: createPerResourceSessionDataService(databases) });
		await ctxA.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(ctxA.agent, { workingDirectories: [URI.file('/work')] });

		const metaStore = ctxA.instantiationService.createInstance(ClaudeSessionMetadataStore);
		await metaStore.write(created.session, {
			model: { id: 'claude-sonnet-4.6' },
			permissionMode: 'bypassPermissions',
			agent: { uri: 'claude-internal:/agent/DecoyAgent' },
			workingDirectories: [URI.file('/session-level-decoy')],
		});

		// The peer chat: its own model/agent/permissionMode/cwd, all distinct
		// from the session-wide decoy overlay above.
		const peerChatUri = URI.parse(buildChatUri(created.session.toString(), 'peer-chat'));
		const peerCreateResult = await ctxA.agent.chats.createChat(peerChatUri, created.session, {
			model: { id: 'claude-opus-4.6' },
			agent: { uri: 'claude-internal:/agent/PeerAgent' },
			workingDirectories: [URI.file('/peer-work')],
			config: { [ClaudeSessionConfigKey.PermissionMode]: 'plan' },
		});
		const peerProviderData = peerCreateResult?.providerData;
		const peerSdkId = JSON.parse(peerProviderData!).sdkSessionId as string;

		// Materialize the peer chat so its own settings are persisted to ITS OWN
		// overlay (keyed by its own resource, not the session-wide scope).
		ctxA.sdk.nextQueryMessages = [makeSystemInitMessage(peerSdkId), makeResultSuccess(peerSdkId)];
		await ctxA.agent.chats.sendMessage(peerChatUri, 'hi peer', undefined, undefined, 'turn-0', undefined, undefined, chatContext(peerChatUri));

		// --- Simulate a restart: a brand-new agent over the SAME database.
		// Nothing carries over in memory; the peer chat's backing must be
		// re-attached via `materializeChat` before it can be forked from. ---
		const ctxB = createTestContext(disposables, { sessionDataService: createPerResourceSessionDataService(databases) });
		await ctxB.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		await ctxB.agent.materializeChat!(peerChatUri, created.session, peerProviderData);

		ctxB.sdk.sessionMessagesById.set(peerSdkId, forkSourceMessages(peerSdkId));
		ctxB.sdk.forkSessionResult = { sessionId: 'forked-cold' };
		// Deliberately no `sessionList` entry for 'forked-cold': the forked
		// conversation's cwd must fall back to the peer's own overlay, not the
		// SDK (which has none for a brand-new fork) or the request.
		const forkChatUri = URI.parse(buildChatUri(created.session.toString(), 'peer-fork'));
		await ctxB.agent.chats.createChat(forkChatUri, created.session, {
			fork: { source: peerChatUri, turnId: 'u1' },
		});

		ctxB.sdk.nextQueryMessages = [makeSystemInitMessage('forked-cold'), makeResultSuccess('forked-cold')];
		await ctxB.agent.chats.sendMessage(forkChatUri, 'after fork', undefined, undefined, 'turn-1', undefined, undefined, chatContext(forkChatUri));

		assert.deepStrictEqual({
			model: ctxB.sdk.capturedStartupOptions[0]?.model,
			agent: ctxB.sdk.capturedStartupOptions[0]?.agent,
			permissionMode: ctxB.sdk.capturedStartupOptions[0]?.permissionMode,
			cwd: ctxB.sdk.capturedStartupOptions[0]?.cwd,
		}, {
			model: 'claude-opus-4-6',
			agent: 'PeerAgent',
			permissionMode: 'plan',
			cwd: URI.file('/peer-work').fsPath,
		});
	});

	test('cold peer-chat fork falls back to the source peer\'s recorded backing model when the peer was never materialized', async () => {
		// The peer was created (recording a backing model) but never sent a
		// message before the restart, so it has no overlay entry yet. The
		// fork must still recover the model from the backing, not lose it.
		const database = new TestSessionDatabase();

		const ctxA = createTestContext(disposables, { database });
		await ctxA.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(ctxA.agent, { workingDirectories: [URI.file('/work')] });

		const peerChatUri = URI.parse(buildChatUri(created.session.toString(), 'peer-chat'));
		const peerCreateResult = await ctxA.agent.chats.createChat(peerChatUri, created.session, {
			model: { id: 'claude-opus-4.6' },
			workingDirectories: [URI.file('/peer-work')],
		});
		const peerProviderData = peerCreateResult?.providerData;
		const peerSdkId = JSON.parse(peerProviderData!).sdkSessionId as string;
		// Note: no `sendMessage` on the peer chat — it is never materialized,
		// so `_metadataStore.read` on its resource returns `{}`.

		const ctxB = createTestContext(disposables, { database });
		await ctxB.agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		await ctxB.agent.materializeChat!(peerChatUri, created.session, peerProviderData);

		ctxB.sdk.sessionMessagesById.set(peerSdkId, forkSourceMessages(peerSdkId));
		ctxB.sdk.forkSessionResult = { sessionId: 'forked-cold-2' };
		ctxB.sdk.sessionList = [{ sessionId: 'forked-cold-2', summary: 'fork', lastModified: 1, cwd: URI.file('/peer-work').fsPath }];
		const forkChatUri = URI.parse(buildChatUri(created.session.toString(), 'peer-fork-2'));
		await ctxB.agent.chats.createChat(forkChatUri, created.session, {
			fork: { source: peerChatUri, turnId: 'u1' },
		});

		ctxB.sdk.nextQueryMessages = [makeSystemInitMessage('forked-cold-2'), makeResultSuccess('forked-cold-2')];
		await ctxB.agent.chats.sendMessage(forkChatUri, 'after fork', undefined, undefined, 'turn-1', undefined, undefined, chatContext(forkChatUri));

		assert.strictEqual(ctxB.sdk.capturedStartupOptions[0]?.model, 'claude-opus-4-6');
	});

	test('changeModel on an additional chat fires onDidChangeChatData with the refreshed providerData', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		const createResult = await agent.chats.createChat(chatUri, created.session, { ...resolvedChatOptions() });
		const sdkSessionId = JSON.parse(createResult!.providerData!).sdkSessionId as string;

		const changes: IAgentChatDataChange[] = [];
		disposables.add(agent.onDidChangeChatData!(e => changes.push(e)));

		await agent.chats.changeModel(chatUri, { id: 'claude-opus-4.6' }, chatContext(chatUri));

		assert.deepStrictEqual(changes.map(c => ({ chat: c.chat.toString(), providerData: JSON.parse(c.providerData) })), [
			{ chat: chatUri.toString(), providerData: { sdkSessionId, model: { id: 'claude-opus-4.6' } } },
		]);
	});

	// #endregion

	// #region Multi-chat — chat surface (G-C1 adoption)

	test('createChat mints a provisional session and chat teardown tears it down', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		// Tearing the session down must not throw and must be idempotent.
		await disposeSession(agent, created.session);
		await disposeSession(agent, created.session);

		assert.deepStrictEqual({
			scheme: created.session.scheme,
			provisional: created.provisional,
		}, {
			scheme: 'claude',
			provisional: true,
		});
	});

	test('chats.createChat persists an additional chat; getChats lists it; chats.disposeChat removes it', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));

		await agent.chats!.createChat(chatUri, created.session, { ...resolvedChatOptions() });
		const afterCreate = listAdditionalChats(agent, created.session);

		await agent.chats!.disposeChat(chatUri, chatContext(chatUri));
		const afterDispose = listAdditionalChats(agent, created.session);

		assert.deepStrictEqual({ afterCreate, afterDispose }, {
			afterCreate: [chatUri.toString()],
			afterDispose: [],
		});
	});

	test('chats.createChat({ fork }) forks the source chat; chats.sendMessage resumes the additional chat\'s own forked SDK session', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const parentId = created.sdkSessionId;
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats!.createChat(chatUri, created.session, { ...resolvedChatOptions(), fork: { source: defaultChatUri(created.session), turnId: 'u1' } });

		const forkCall = sdk.forkSessionCalls[0];

		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats!.sendMessage(chatUri, 'next', undefined, undefined, 'turn-1');

		assert.deepStrictEqual({
			forkCall,
			chats: listAdditionalChats(agent, created.session),
			startupResume: sdk.capturedStartupOptions[0]?.resume,
		}, {
			forkCall: { sessionId: parentId, options: { upToMessageId: 'a1' } },
			chats: [chatUri.toString()],
			startupResume: 'forked-1',
		});
	});

	test('chats addresses the default chat by the default chat URI (sendMessage and getMessages both route to its exact backing)', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const chat = defaultChatUri(created.session);
		await agent.chats.sendMessage(chat, 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chat));
		const turns = await agent.chats.getMessages(chat, chatContext(chat));

		assert.deepStrictEqual({
			startupSessionId: sdk.capturedStartupOptions[0]?.sessionId,
			resume: sdk.capturedStartupOptions[0]?.resume,
			turns,
			transcriptRead: sdk.getSessionMessagesCalls.at(-1),
		}, {
			startupSessionId: sessionId,
			resume: undefined,
			turns: [],
			transcriptRead: { sessionId, options: { includeSystemMessages: true } },
		});
	});

	test('chats.changeModel on an additional fires onDidChangeChatData with the refreshed providerData (parity with legacy changeModel)', async () => {
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		const createResult = await agent.chats!.createChat(chatUri, created.session, { ...resolvedChatOptions() });
		const sdkSessionId = JSON.parse(createResult!.providerData!).sdkSessionId as string;

		const changes: IAgentChatDataChange[] = [];
		disposables.add(agent.onDidChangeChatData!(e => changes.push(e)));

		await agent.chats.changeModel(chatUri, { id: 'claude-opus-4.6' }, chatContext(chatUri));

		assert.deepStrictEqual(changes.map(c => ({ chat: c.chat.toString(), providerData: JSON.parse(c.providerData) })), [
			{ chat: chatUri.toString(), providerData: { sdkSessionId, model: { id: 'claude-opus-4.6' } } },
		]);
	});

	test('chats.changeAgent on an additional persists to its overlay so a later resume picks it up (parity with legacy changeAgent)', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const parentId = created.sdkSessionId;
		sdk.sessionMessagesById.set(parentId, forkSourceMessages(parentId));
		sdk.forkSessionResult = { sessionId: 'forked-1' };
		sdk.sessionList = [{ sessionId: 'forked-1', summary: 'fork', lastModified: 1, cwd: URI.file('/work').fsPath }];

		const chatUri = URI.parse(buildChatUri(created.session.toString(), 'chat-1'));
		await agent.chats!.createChat(chatUri, created.session, { ...resolvedChatOptions(), fork: { source: defaultChatUri(created.session), turnId: 'u1' } });

		// Select a custom agent for the additional chat before it is materialized.
		await agent.chats!.changeAgent(chatUri, { uri: 'file:///foo/agents/reviewer.md' }, chatContext(chatUri));

		sdk.nextQueryMessages = [makeSystemInitMessage('forked-1'), makeResultSuccess('forked-1')];
		await agent.chats!.sendMessage(chatUri, 'hi', undefined, undefined, 'turn-1');

		assert.strictEqual(sdk.capturedStartupOptions[0]?.agent, 'reviewer');
	});

	// #endregion
});

// #endregion

suite('ClaudeAgent — host OTel session-title spans', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('emits a host OTel session-title span when this agent\'s session title changes', () => {
		const { stateManager, otelService } = createTestContext(disposables);
		const sessionUri = AgentSession.uri('claude', 'wire-title');
		stateManager.createSession({
			resource: sessionUri.toString(),
			provider: 'claude',
			title: 'Initial',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});

		stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionTitleChanged, title: 'Renamed' });

		assert.deepStrictEqual(otelService.titleChanges, [{ conversationId: 'wire-title', sessionUri: sessionUri.toString(), title: 'Renamed' }]);
	});

	test('ignores session-title changes belonging to another provider', () => {
		const { stateManager, otelService } = createTestContext(disposables);
		const foreignUri = AgentSession.uri('copilot', 'foreign-title');
		stateManager.createSession({
			resource: foreignUri.toString(),
			provider: 'copilot',
			title: 'Initial',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});

		stateManager.dispatchServerAction(foreignUri.toString(), { type: ActionType.SessionTitleChanged, title: 'Renamed' });

		assert.deepStrictEqual(otelService.titleChanges, []);
	});
});

// #region materializeChat — legacy default-chat identity recovery

suite('ClaudeAgent — materializeChat legacy default-chat recovery', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('materializeChat recovers the historical implicit default-chat identity from an old persisted session when providerData is absent', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		// An "old" persisted Claude session predating the peer-chat catalog:
		// before exact-chat backings existed, its default chat was never
		// assigned a separately-persisted `providerData` blob at all — the
		// implicit identity is simply `sdkSessionId === AgentSession.id(session)`.
		// Only the explicit context/session and the SDK's own on-disk store
		// (never a `chat`-URI-shape check) recover it.
		const sessionUri = AgentSession.uri('claude', 'ah-legacy-session');
		const sessionId = AgentSession.id(sessionUri);
		sdk.sessionList = [{ sessionId, summary: 'legacy', lastModified: 1, cwd: URI.file('/work').fsPath }];
		sdk.sessionMessagesById.set(sessionId, forkSourceMessages(sessionId));

		const chatUri = defaultChatUri(sessionUri);
		const result = await agent.recoverLegacyChat!(chatUri, { configurationResource: sessionUri, resource: sessionUri });
		await agent.materializeChat!(chatUri, { configurationResource: sessionUri, resource: sessionUri }, result.providerData);

		// The recovered backing resolves and sends like any other exact chat
		// (a plain resume of the existing SDK transcript) with no prior
		// explicit bind/create call.
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(chatUri, 'hello', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chatUri));

		assert.deepStrictEqual({
			providerData: result && result.providerData ? JSON.parse(result.providerData) : undefined,
			backingSession: result?.backingSession,
			resume: sdk.capturedStartupOptions[0]?.resume,
			liveChats: listLiveChats(agent),
		}, {
			providerData: { sdkSessionId: sessionId },
			// The recovered SDK session shares the top-level session's own id —
			// it is not a separately-enumerable backing session to suppress.
			backingSession: undefined,
			resume: sessionId,
			liveChats: [chatUri.toString()],
		});
	});

	test('materializeChat legacy default-chat recovery is idempotent across repeated calls', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const sessionUri = AgentSession.uri('claude', 'ah-legacy-repeat');
		const sessionId = AgentSession.id(sessionUri);
		sdk.sessionList = [{ sessionId, summary: 'legacy', lastModified: 1, cwd: URI.file('/work').fsPath }];
		const chatUri = defaultChatUri(sessionUri);
		const context: IAgentChatContext = { configurationResource: sessionUri, resource: sessionUri };

		// Simulates the orchestrator invoking materialize more than once for
		// the same legacy entry (e.g. a reconnect racing restore) before ever
		// persisting the returned blob back.
		const first = await agent.recoverLegacyChat!(chatUri, context);
		const second = await agent.recoverLegacyChat!(chatUri, context);
		await agent.materializeChat!(chatUri, context, second.providerData);

		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(chatUri, 'hello again', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chatUri));

		assert.deepStrictEqual({
			first: first && first.providerData ? JSON.parse(first.providerData) : undefined,
			second: second && second.providerData ? JSON.parse(second.providerData) : undefined,
			liveChats: listLiveChats(agent),
			resume: sdk.capturedStartupOptions[0]?.resume,
			startupCount: sdk.capturedStartupOptions.length,
		}, {
			first: { sdkSessionId: sessionId },
			second: { sdkSessionId: sessionId },
			liveChats: [chatUri.toString()],
			resume: sessionId,
			startupCount: 1,
		});
	});

	test('materializeChat does not assign the default backing to a peer without providerData', async () => {
		const { agent } = createTestContext(disposables);
		const session = AgentSession.uri('claude', 'peer-without-backing');
		const chat = URI.parse(buildChatUri(session, 'peer'));

		const result = await agent.materializeChat!(chat, { configurationResource: session, resource: chat }, undefined);

		assert.deepStrictEqual({
			result,
			backing: (agent as unknown as { _chatBackings: Map<string, unknown> })._chatBackings.get(chat.toString()),
		}, {
			result: undefined,
			backing: undefined,
		});
	});
});

// #endregion

// #region Host seams — the provider consumes them and reads no shared host state

suite('ClaudeAgent — host seams', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('a peer chat server tool executes against its exact Agent Host chat channel', async () => {
		const { agent, sdk } = createTestContext(disposables);
		const toolName = 'peer_server_tool';
		let executedChatUri: string | undefined;
		agent.setServerToolHost({
			definitions: [{ name: toolName, inputSchema: { type: 'object', properties: {} } }],
			toolNames: [toolName],
			advertise: () => { },
			getDefinitionsForSession: () => [{ name: toolName, inputSchema: { type: 'object', properties: {} } }],
			canRequireConfirmation: () => false,
			requiresConfirmation: () => false,
			executeTool: chatUri => {
				executedChatUri = chatUri;
				return 'done';
			},
		});
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const peerChat = URI.parse(buildChatUri(created.session.toString(), 'peer-server-tool'));
		const peerCreated = await agent.chats.createChat(peerChat, { configurationResource: created.session, resource: peerChat }, { ...resolvedChatOptions() });
		const peerSdkId = AgentSession.id(peerCreated!.backingSession!);
		sdk.nextQueryMessages = [makeSystemInitMessage(peerSdkId), makeResultSuccess(peerSdkId)];

		await agent.chats.sendMessage(peerChat, 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(peerChat));
		const result = await sdk.toolHandlers.get(toolName)!({}, undefined);

		assert.deepStrictEqual({
			executedChatUri,
			result,
		}, {
			executedChatUri: peerChat.toString(),
			result: { content: [{ type: 'text', text: 'done' }] },
		});
	});

	test('a subagent chat resolves its spawn edge only from the host-supplied origin', async () => {
		const { agent, sdk, stateManager } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const session = AgentSession.uri('claude', 'ah-spawn');
		const subagentChat = URI.parse(buildSubagentChatUri(session.toString(), 'tool-call-1'));
		// Host state deliberately carries the subagent's tool origin: the
		// provider must NOT pick it up from there. Only the context does.
		stateManager.createSession({
			resource: session.toString(),
			provider: 'claude',
			title: 'spawner',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		stateManager.addChat(session.toString(), subagentChat.toString(), {
			origin: { kind: ChatOriginKind.Tool, chat: defaultChatUri(session).toString(), toolCallId: 'tool-call-1' },
		});

		const turns = await agent.chats.getMessages(subagentChat, {
			configurationResource: session,
			resource: subagentChat,
		});

		assert.deepStrictEqual({
			turns,
			// No spawning chat means nothing to read: the provider must not
			// fall back to the session's own transcript.
			transcriptReads: sdk.getSessionMessagesCalls.length,
			subagentReads: sdk.getSubagentMessagesCalls.length,
		}, { turns: [], transcriptReads: 0, subagentReads: 0 });
	});

	test('a client tool completion addressed to a subagent resolves the spawning chat from the context origin', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const sessionId = created.sdkSessionId;
		const spawningChat = defaultChatUri(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.chats.sendMessage(spawningChat, 'go', undefined, undefined, 'turn-1', undefined, undefined, chatContext(spawningChat));

		const subagentChat = URI.parse(buildSubagentChatUri(created.session.toString(), 'tool-call-1'));
		const live = agent.getSessionForTesting(created.session)!;
		const completed: string[] = [];
		live.completeClientToolCall = (toolCallId: string) => { completed.push(toolCallId); return true; };

		// The routing target is the subagent chat itself (no runtime of its
		// own); only the host-supplied `Tool` origin names the conversation
		// that owns the parked call.
		agent.onClientToolCallComplete(subagentChat, 'tu_1', { success: true, pastTenseMessage: 'ran' }, {
			configurationResource: created.session,
			resource: subagentChat,
			origin: { kind: ChatOriginKind.Tool, chat: spawningChat.toString(), toolCallId: 'tool-call-1' },
		});
		// Without an origin there is nothing to route to — silent no-op.
		agent.onClientToolCallComplete(subagentChat, 'tu_2', { success: true, pastTenseMessage: 'ran' }, {
			configurationResource: created.session,
			resource: subagentChat,
		});

		assert.deepStrictEqual(completed, ['tu_1']);
	});

	test('a client active on one chat is not implicitly extended to a newly created peer chat', async () => {
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await createSession(agent, { workingDirectories: [URI.file('/work')] });
		const defaultChat = defaultChatUri(created.session);
		const peerChat = URI.parse(buildChatUri(created.session.toString(), 'peer-1'));
		const defaultHandle = getOrCreateActiveClient(agent, defaultChat, 'c1');
		defaultHandle.tools = [{ name: 'echo', inputSchema: { type: 'object' } }];

		// Materialize the default chat so its handle's tools actually land on
		// a live runtime.
		sdk.nextQueryMessages = [makeSystemInitMessage(created.sdkSessionId), makeResultSuccess(created.sdkSessionId)];
		await agent.chats.sendMessage(defaultChat, 'default', undefined, undefined, 'turn-default', undefined, undefined, chatContext(defaultChat));

		const peerCreated = await agent.chats.createChat(peerChat, { configurationResource: created.session, resource: peerChat }, { ...resolvedChatOptions() });
		const peerBackingSession = peerCreated!.backingSession!;
		const peerSdkId = AgentSession.id(peerBackingSession);

		// The peer chat materializes without the host ever addressing it: no
		// tools should reach its runtime, since the default chat's handle has
		// no bearing on any other chat.
		sdk.nextQueryMessages = [makeSystemInitMessage(peerSdkId), makeResultSuccess(peerSdkId)];
		await agent.chats.sendMessage(peerChat, 'hi', undefined, undefined, 'turn-1', undefined, undefined, chatContext(peerChat));
		const peerSessionBeforeAddressed = agent.getSessionForTesting(peerBackingSession)!;

		assert.deepStrictEqual(
			peerSessionBeforeAddressed.getClientTools('c1').map(tool => tool.name),
			[],
		);

		// Only once Agent Host explicitly addresses the peer chat does the
		// client's tools reach it — its own independent handle, not an
		// extension of the default chat's.
		getOrCreateActiveClient(agent, peerChat, 'c1').tools = [{ name: 'echo', inputSchema: { type: 'object' } }];
		assert.deepStrictEqual(
			peerSessionBeforeAddressed.getClientTools('c1').map(tool => tool.name),
			['echo'],
		);
		// ...and the default chat's own tools are untouched by addressing the peer.
		assert.deepStrictEqual(
			agent.getSessionForTesting(created.chat!.backingSession!)!.getClientTools('c1').map(tool => tool.name),
			['echo'],
		);
	});

	test('remove-all truncation works on a legacy default chat recovered by materializeChat', async () => {
		const database = new TestSessionDatabase();
		const { agent, sdk } = createTestContext(disposables, { database });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		// An old persisted session: no `providerData`, so restore recovers the
		// canonical backing (SDK id === session id) and everything afterwards —
		// including remove-all — runs the single exact-chat path.
		const session = AgentSession.uri('claude', 'ah-legacy-truncate');
		const sessionId = AgentSession.id(session);
		const chat = defaultChatUri(session);
		sdk.sessionList = [{ sessionId, summary: 'legacy', lastModified: 1, cwd: URI.file('/work').fsPath }];
		await bindDefaultChat(agent, session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
			makeSystemInitMessage(sessionId), makeResultSuccess(sessionId),
		];
		await agent.chats.sendMessage(chat, 'first', undefined, undefined, 'turn-1', undefined, undefined, chatContext(chat));

		await agent.truncateChat(chat, undefined, chatContext(chat));
		await agent.chats.sendMessage(chat, 'second', undefined, undefined, 'turn-2', undefined, undefined, chatContext(chat));

		const last = sdk.capturedStartupOptions.at(-1);
		assert.deepStrictEqual({
			deleted: sdk.deleteSessionCalls,
			allTurnsPruned: database.deleteAllTurnsCalls,
			lastSessionId: last?.sessionId,
			lastResume: last?.resume,
			sessionPresent: agent.getSessionForTesting(session) !== undefined,
		}, {
			deleted: [sessionId],
			allTurnsPruned: 1,
			lastSessionId: sessionId,
			lastResume: undefined,
			sessionPresent: true,
		});
	});
});

// #endregion
