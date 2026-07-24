/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, CopilotClientOptions, CopilotSession, GitHubTelemetryNotification, PermissionAllowAllMode, PermissionRequest, SessionEvent, SessionEventHandler, SessionEventPayload, SessionEventType, TypedSessionEventHandler } from '@github/copilot-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, type DisposableStore, type IDisposable, type IReference } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { waitForState } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService, type IStat } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, LogLevel, NullLogService } from '../../../log/common/log.js';
import { IAgentHostProxyResolver } from '../../node/agentHostProxyResolver.js';
import type { IAgentHostClientProxyConnection } from '../../common/agentHostClientProxyChannel.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AgentHostTelemetryService } from '../../node/agentHostTelemetryService.js';
import { CopilotCliConfigKey } from '../../common/copilotCliConfig.js';
import { AgentHostPreferLongContextEnabledConfigKey, AgentHostSystemProxyEnabledConfigKey } from '../../common/agentHostSchema.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { AgentSession, GITHUB_COPILOT_PROTECTED_RESOURCE, type AgentSignal, type IAgentCreateChatForkSource, type IAgentSessionMetadata, type IAgentSpawnChatEvent } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { buildDefaultChatUri, buildChatUri, buildSubagentChatUri, parseRequiredSessionUriFromChatUri, CustomizationLoadStatus, MessageKind, ResponsePartKind, ToolResultContentType, TurnState, customizationId, type ClientPluginCustomization, type PluginCustomization, type ToolCallResult, type Turn, RuleCustomization } from '../../common/state/sessionState.js';
import { CustomizationType, SessionStatus, ToolCallContributorKind, type AgentSelection, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { ActionType, type ChatAction, type SessionAction } from '../../common/state/sessionActions.js';

import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { IAgentHostGitService, type IBranch, type IDefaultBranch } from '../../common/agentHostGitService.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { AgentHostCompletions, IAgentHostCompletions } from '../../node/agentHostCompletions.js';
import { COPILOT_AGENT_HOST_SYSTEM_MESSAGE, CopilotAgent, CopilotSessionEntry, rebaseUnder, REFRESH_DEBOUNCE_MS } from '../../node/copilot/copilotAgent.js';
import { COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS } from '../../node/copilot/prompts/systemMessage.js';
import { NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { IAgentHostReviewService, NULL_REVIEW_SERVICE } from '../../common/agentHostReviewService.js';
import { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { CopilotAgentSession } from '../../node/copilot/copilotAgentSession.js';
import { AgentBranchNameGenerator, getAgentBranchNameHintFromMessage, normalizeAgentBranchName } from '../../node/shared/agentBranchNameGenerator.js';
import type { CopilotSessionLaunchPlan, IActiveClientSnapshot } from '../../node/copilot/copilotSessionLauncher.js';
import { ShellManager } from '../../node/copilot/copilotShellTools.js';
import { registerPendingEditContentProvider } from '../../node/copilot/pendingEditContentStore.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { createNullSessionDataService } from '../common/sessionTestHelpers.js';
import { ActiveClientToolSet } from '../../node/activeClientState.js';
import { ByokLmBridgeRegistry, IByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { ICopilotApiService, type ICopilotApiServiceRequestOptions, type ICopilotUtilityChatCompletionRequest, type IRestrictedTelemetryContext } from '../../node/shared/copilotApiService.js';
import type { IAgentHostInternalTelemetryContext, IAgentHostRestrictedTelemetryContext } from '../../node/agentHostRestrictedTelemetry.js';
import { injectSideChatContext } from '../../node/agentPeerChats.js';

/**
 * Test helpers for the single `_sessions` container. All chats (default + peers)
 * live inside the owning session's {@link CopilotSessionEntry}, keyed by chat URI
 * string; the default chat is the entry's `defaultChat`. These wrap that
 * structure so tests can inject/observe fakes without reaching into private
 * container internals.
 */
function sessionsMap(agent: CopilotAgent): Map<string, CopilotSessionEntry> {
	return (agent as unknown as { _sessions: Map<string, CopilotSessionEntry> })._sessions;
}

function defaultChatUri(session: URI): URI {
	return URI.parse(buildDefaultChatUri(session));
}

/** Inject (or replace) a session's default-chat stub. */
function setDefaultSessionStub(agent: CopilotAgent, sessionId: string, stub: unknown): void {
	const sessions = sessionsMap(agent);
	const defaultChatKey = buildDefaultChatUri(AgentSession.uri('copilotcli', sessionId).toString());
	let entry = sessions.get(sessionId);
	if (!entry) {
		entry = new CopilotSessionEntry();
		sessions.set(sessionId, entry);
	}
	entry.setDefaultChat(defaultChatKey, new CopilotSessionEntry(stub as CopilotAgentSession));
}

/** Inject a peer-chat stub into its owning session's entry (creating the entry if needed). */
function setPeerChatStub(agent: CopilotAgent, chatUri: URI, stub: unknown): void {
	const sessionId = AgentSession.id(URI.parse(parseRequiredSessionUriFromChatUri(chatUri)));
	const sessions = sessionsMap(agent);
	let entry = sessions.get(sessionId);
	if (!entry) {
		entry = new CopilotSessionEntry();
		sessions.set(sessionId, entry);
	}
	entry.registerPeerChat(chatUri.toString(), new CopilotSessionEntry(stub as CopilotAgentSession));
}

/** Resolve a peer-chat stub from its owning session's entry. */
function getPeerChatStub(agent: CopilotAgent, chatUri: URI): CopilotAgentSession | undefined {
	const sessionId = AgentSession.id(URI.parse(parseRequiredSessionUriFromChatUri(chatUri)));
	return sessionsMap(agent).get(sessionId)?.getPeerChat(chatUri.toString());
}

/** True when a peer chat is tracked in its owning session's entry. */
function hasPeerChatStub(agent: CopilotAgent, chatUri: URI): boolean {
	const sessionId = AgentSession.id(URI.parse(parseRequiredSessionUriFromChatUri(chatUri)));
	return sessionsMap(agent).get(sessionId)?.hasPeerChat(chatUri.toString()) ?? false;
}

/** Total number of peer chats tracked across all sessions. */
function peerChatCount(agent: CopilotAgent): number {
	let count = 0;
	for (const entry of sessionsMap(agent).values()) {
		count += entry.peerChatKeys().length;
	}
	return count;
}

class TestAgentPluginManager implements IAgentPluginManager {
	declare readonly _serviceBrand: undefined;

	readonly basePath = URI.from({ scheme: 'inmemory', path: '/agentPlugins' });

	async syncCustomizations(_clientId: string, _customizations: ClientPluginCustomization[], _progress?: (status: PluginCustomization) => void): Promise<ISyncedCustomization[]> {
		return [];
	}
}

class TestAgentHostGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	repositoryRoot: URI | undefined = undefined;
	headCommit: string | undefined = '0'.repeat(40);
	addedWorktrees: { repositoryRoot: URI; worktree: URI; branchName: string; startPoint: string }[] = [];
	addedExistingWorktrees: { repositoryRoot: URI; worktree: URI; branchName: string }[] = [];
	removedWorktrees: { repositoryRoot: URI; worktree: URI }[] = [];
	existingBranches = new Set<string>();
	dirtyWorkingDirectories = new Set<string>();

	async getCurrentBranch(): Promise<string | undefined> { return undefined; }
	async getDefaultBranch(): Promise<IDefaultBranch | undefined> { return undefined; }
	async getBranch(): Promise<IBranch | undefined> { return undefined; }
	async getRefs(): Promise<IBranch[]> { return []; }
	async getBranches(): Promise<IBranch[]> { return []; }
	async getRepositoryRoot(): Promise<URI | undefined> { return this.repositoryRoot; }
	async getWorktreeRoots(): Promise<URI[]> { return []; }
	async addWorktree(repositoryRoot: URI, worktree: URI, branchName: string, startPoint: string): Promise<void> {
		this.addedWorktrees.push({ repositoryRoot, worktree, branchName, startPoint });
		this.existingBranches.add(branchName);
	}
	async copyWorktreeIncludeFiles(): Promise<void> { }
	async addExistingWorktree(repositoryRoot: URI, worktree: URI, branchName: string): Promise<void> {
		this.addedExistingWorktrees.push({ repositoryRoot, worktree, branchName });
	}
	async removeWorktree(repositoryRoot: URI, worktree: URI): Promise<void> {
		this.removedWorktrees.push({ repositoryRoot, worktree });
	}
	async branchExists(_repositoryRoot: URI, branchName: string): Promise<boolean> {
		return this.existingBranches.has(branchName);
	}
	async hasUncommittedChanges(workingDirectory: URI): Promise<boolean> {
		return this.dirtyWorkingDirectories.has(workingDirectory.fsPath);
	}
	async commitAll(): Promise<void> { }
	async restore(): Promise<void> { }
	async hasUpstream(): Promise<boolean> { return false; }
	async pull(): Promise<void> { }
	async push(): Promise<void> { }
	async getSessionGitState(): Promise<undefined> { return undefined; }
	async computeSessionFileDiffs(): Promise<undefined> { return undefined; }
	async showBlob(): Promise<undefined> { return undefined; }
	async captureWorkingTreeAsTree(): Promise<undefined> { return undefined; }
	async commitTree(): Promise<undefined> { return undefined; }
	async updateRef(): Promise<void> { }
	async deleteRefs(): Promise<void> { }
	async revParse(_repositoryRoot: URI, expression: string): Promise<string | undefined> {
		return expression === 'HEAD' ? this.headCommit : undefined;
	}
	async resolveBranchBaselineCommit(): Promise<string | undefined> { return undefined; }
	async overlayPathIntoTree(): Promise<string | undefined> { return undefined; }
	async diffTreePaths(): Promise<string[] | undefined> { return undefined; }
	async computeFileDiffsBetweenRefs(): Promise<undefined> { return undefined; }
	async getFetchRemoteUrls(): Promise<undefined> { return undefined; }
	async getUntrackedPaths(): Promise<[]> { return []; }
	async getBranchDiffSafetyInfo(): Promise<undefined> { return undefined; }
	async getDiffPatchBetweenRefs(): Promise<undefined> { return undefined; }
}

class TestAgentHostTerminalManager implements IAgentHostTerminalManager {
	declare readonly _serviceBrand: undefined;

	async createTerminal(): Promise<void> { }
	writeInput(): void { }
	async sendText(): Promise<void> { }
	onData(): IDisposable { return Disposable.None; }
	onExit(): IDisposable { return Disposable.None; }
	onClaimChanged(): IDisposable { return Disposable.None; }
	onCommandFinished(): IDisposable { return Disposable.None; }
	createAltBufferPromise(_uri: string, _store: DisposableStore): Promise<void> { return new Promise(() => { }); }
	getContent(): string | undefined { return undefined; }
	getClaim(): undefined { return undefined; }
	hasTerminal(): boolean { return false; }
	getExitCode(): number | undefined { return undefined; }
	supportsCommandDetection(): boolean { return false; }
	disposeTerminal(): void { }
	getTerminalInfos(): [] { return []; }
	getTerminalState(): undefined { return undefined; }
	async getDefaultShell(): Promise<string> { return '/bin/bash'; }
	createOutputTerminal(): void { }
	appendOutputTerminalData(): void { }
	resetOutputTerminal(): void { }
	finalizeOutputTerminal(): void { }
}

class TestCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	readonly utilityCalls: { token: string; request: ICopilotUtilityChatCompletionRequest; options?: ICopilotApiServiceRequestOptions }[] = [];
	response = 'generated-branch-name';
	error: Error | undefined;
	apiEndpoint: string | undefined;
	userLogin: string | undefined;
	readonly restrictedTelemetryContexts = new Map<string, IRestrictedTelemetryContext>();
	readonly restrictedTelemetryContextCalls: string[] = [];

	messages(_githubToken: string, _request: Anthropic.MessageCreateParamsStreaming, _options?: ICopilotApiServiceRequestOptions): AsyncGenerator<Anthropic.MessageStreamEvent>;
	messages(_githubToken: string, _request: Anthropic.MessageCreateParamsNonStreaming, _options?: ICopilotApiServiceRequestOptions): Promise<Anthropic.Message>;
	messages(): AsyncGenerator<Anthropic.MessageStreamEvent> | Promise<Anthropic.Message> {
		throw new Error('not used');
	}
	async countTokens(): Promise<Anthropic.MessageTokensCount> { throw new Error('not used'); }
	async models(): Promise<CCAModel[]> { return []; }
	async responses(): Promise<Response> { throw new Error('not used'); }
	async resolveRestrictedTelemetryContext(githubToken: string): Promise<IRestrictedTelemetryContext> {
		this.restrictedTelemetryContextCalls.push(githubToken);
		return this.restrictedTelemetryContexts.get(githubToken) ?? {
			restrictedTelemetryEnabled: false,
			trackingId: undefined,
			telemetryEndpoint: undefined,
			isInternal: false,
			userName: undefined,
			isVscodeTeamMember: false,
		};
	}
	async resolveApiEndpoint() { return this.apiEndpoint; }
	async resolveUserLogin() { return this.userLogin; }
	async utilityChatCompletion(githubToken: string, request: ICopilotUtilityChatCompletionRequest, options?: ICopilotApiServiceRequestOptions): Promise<string> {
		this.utilityCalls.push({ token: githubToken, request, options });
		if (this.error) {
			throw this.error;
		}
		return this.response;
	}
}

class TestSessionDataService extends Disposable implements ISessionDataService {
	declare readonly _serviceBrand: undefined;

	private readonly _databases = new Map<string, SessionDatabase>();
	readonly openedSessions: string[] = [];

	getSessionDataDir(session: URI): URI { return URI.from({ scheme: 'test', path: `/session-data/${AgentSession.id(session)}` }); }
	getSessionDataDirById(sessionId: string): URI { return URI.from({ scheme: 'test', path: `/session-data/${sessionId}` }); }

	openDatabase(session: URI): IReference<SessionDatabase> {
		const sessionId = AgentSession.id(session);
		this.openedSessions.push(sessionId);
		let db = this._databases.get(sessionId);
		if (!db) {
			db = this._register(new SessionDatabase(':memory:'));
			this._databases.set(sessionId, db);
		}
		return { object: db, dispose: () => { } };
	}

	async tryOpenDatabase(session: URI): Promise<IReference<SessionDatabase> | undefined> {
		const db = this._databases.get(AgentSession.id(session));
		return db ? { object: db, dispose: () => { } } : undefined;
	}

	deleteSessionData(): Promise<void> { return Promise.resolve(); }
	readonly onWillDeleteSessionData = Event.None;
	cleanupOrphanedData(): Promise<void> { return Promise.resolve(); }
	whenIdle(): Promise<void> { return Promise.resolve(); }
}
type CopilotModelsList = CopilotClient['rpc']['models']['list'];
type CopilotModelInfo = Awaited<ReturnType<CopilotModelsList>>['models'][number];

interface ITestCopilotModelInfo {
	readonly id: string;
	readonly name: string;
	readonly capabilities?: {
		readonly supports?: { readonly vision?: boolean };
		readonly limits?: { readonly max_context_window_tokens?: number; readonly max_output_tokens?: number; readonly max_prompt_tokens?: number };
	};
	readonly policy?: { readonly state?: NonNullable<CopilotModelInfo['policy']>['state'] };
	readonly billing?: CopilotModelInfo['billing'];
	readonly modelPickerCategory?: CopilotModelInfo['modelPickerCategory'];
	readonly modelPickerPriceCategory?: CopilotModelInfo['modelPickerPriceCategory'];
	readonly supportedReasoningEfforts?: CopilotModelInfo['supportedReasoningEfforts'];
	readonly defaultReasoningEffort?: CopilotModelInfo['defaultReasoningEffort'];
}

interface ITestCopilotClient extends Pick<CopilotClient, 'start' | 'stop' | 'listSessions' | 'createSession' | 'resumeSession' | 'getSessionMetadata' | 'deleteSession'> {
	readonly rpc: {
		readonly sessions: { readonly fork: CopilotClient['rpc']['sessions']['fork'] };
		readonly models: { readonly list: CopilotModelsList };
	};
}

function toSdkModelInfo(model: ITestCopilotModelInfo): CopilotModelInfo {
	return {
		id: model.id,
		name: model.name,
		capabilities: {
			supports: {
				vision: model.capabilities?.supports?.vision ?? false,
				reasoningEffort: !!model.supportedReasoningEfforts?.length,
			},
			limits: {
				max_context_window_tokens: model.capabilities?.limits?.max_context_window_tokens ?? 0,
				max_output_tokens: model.capabilities?.limits?.max_output_tokens,
				max_prompt_tokens: model.capabilities?.limits?.max_prompt_tokens,
			},
		},
		...(model.policy ? { policy: { state: model.policy.state ?? 'enabled', terms: '' } } : {}),
		...(model.billing ? { billing: model.billing } : {}),
		...(model.modelPickerCategory ? { modelPickerCategory: model.modelPickerCategory } : {}),
		...(model.modelPickerPriceCategory ? { modelPickerPriceCategory: model.modelPickerPriceCategory } : {}),
		...(model.supportedReasoningEfforts ? { supportedReasoningEfforts: model.supportedReasoningEfforts } : {}),
		...(model.defaultReasoningEffort ? { defaultReasoningEffort: model.defaultReasoningEffort } : {}),
	};
}

class TestCopilotClient implements ITestCopilotClient {
	readonly rpc: ITestCopilotClient['rpc'] = {
		sessions: { fork: async () => ({ sessionId: 'forked-session' }) },
		models: {
			list: async params => {
				this.modelListRequests.push(params);
				const error = this.modelListErrors.shift();
				if (error) {
					throw error;
				}
				return { models: this._models.map(toSdkModelInfo) };
			}
		},
	};
	startCallCount = 0;
	stopCallCount = 0;
	listSessionCallCount = 0;
	readonly modelListRequests: Parameters<CopilotModelsList>[0][] = [];
	readonly modelListErrors: Error[] = [];
	readonly getSessionMetadataCalls: string[] = [];
	readonly deletedSessionIds: string[] = [];

	constructor(
		private readonly _sessions: Awaited<ReturnType<ITestCopilotClient['listSessions']>>,
		private readonly _models: readonly ITestCopilotModelInfo[] = [],
	) { }

	async start(): Promise<void> {
		this.startCallCount++;
	}
	async stop(): ReturnType<ITestCopilotClient['stop']> {
		this.stopCallCount++;
		return [];
	}
	async listSessions(): ReturnType<ITestCopilotClient['listSessions']> {
		this.listSessionCallCount++;
		return this._sessions;
	}
	async getSessionMetadata(sessionId: string): ReturnType<ITestCopilotClient['getSessionMetadata']> {
		this.getSessionMetadataCalls.push(sessionId);
		return this._sessions.find(s => s.sessionId === sessionId);
	}
	async deleteSession(sessionId: string): Promise<void> {
		this.deletedSessionIds.push(sessionId);
	}
	createSession: ITestCopilotClient['createSession'] = async () => { throw new Error('not implemented'); };
	resumeSession: ITestCopilotClient['resumeSession'] = async () => { throw new Error('not implemented'); };
}

interface IFakeAgentSession {
	send: (prompt: string, attachments?: unknown, turnId?: string, announcement?: string) => Promise<void>;
	getMessages: () => Promise<readonly Turn[]>;
	dispose: () => void;
}

class MockCopilotSession {
	readonly sessionId = 'test-session-1';
	readonly rpc = {
		options: {
			update: async () => ({ success: true }),
		},
		permissions: {
			setAllowAll: async ({ mode }: { mode: PermissionAllowAllMode }) => ({ success: true, mode }),
		},
	};
	private readonly _handlers = new Set<SessionEventHandler>();
	private readonly _typedHandlers = new Map<SessionEventType, Set<(event: SessionEventPayload<SessionEventType>) => void>>();

	on(_handler: SessionEventHandler): () => void;
	on<K extends SessionEventType>(_eventType: K, _handler: TypedSessionEventHandler<K>): () => void;
	on<K extends SessionEventType>(eventTypeOrHandler: K | SessionEventHandler, handler?: TypedSessionEventHandler<K>): () => void {
		if (typeof eventTypeOrHandler === 'function') {
			this._handlers.add(eventTypeOrHandler);
			return () => this._handlers.delete(eventTypeOrHandler);
		}
		if (!handler) {
			throw new Error(`Missing handler for ${eventTypeOrHandler}`);
		}
		let handlers = this._typedHandlers.get(eventTypeOrHandler);
		if (!handlers) {
			handlers = new Set();
			this._typedHandlers.set(eventTypeOrHandler, handlers);
		}
		const typedHandler = handler as (event: SessionEventPayload<SessionEventType>) => void;
		handlers.add(typedHandler);
		return () => handlers.delete(typedHandler);
	}

	emit<K extends SessionEventType>(event: SessionEventPayload<K>): void {
		const sessionEvent = event as SessionEvent;
		for (const handler of this._handlers) {
			handler(sessionEvent);
		}
		const typedEvent = event as SessionEventPayload<SessionEventType>;
		for (const handler of this._typedHandlers.get(event.type) ?? []) {
			handler(typedEvent);
		}
	}

	async send(): Promise<string> { return ''; }
	async abort(): Promise<void> { }
	async setModel(): Promise<void> { }
	async getEvents(): Promise<SessionEventPayload<SessionEventType>[]> { return []; }
	async disconnect(): Promise<void> { }
}

class TestSdkError extends Error {
	constructor(message: string, readonly code: number) {
		super(message);
	}
}

class MockAgentHostOTelService implements IAgentHostOTelService {
	readonly _serviceBrand: undefined;

	async getSdkTelemetryConfig() {
		return undefined;
	}
	getSpansDbPath() {
		return undefined;
	}
	async flush() {
		//
	}
}

class TestProxyResolver implements IAgentHostProxyResolver {
	declare readonly _serviceBrand: undefined;
	resolveProxyCalls = 0;
	resolvedProxy: string | undefined;

	register(_clientId: string, _connection: IAgentHostClientProxyConnection): IDisposable {
		return Disposable.None;
	}

	async resolveProxy(_url: string): Promise<string | undefined> {
		this.resolveProxyCalls++;
		return this.resolvedProxy;
	}

	readonly fetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, init);
}

class ResumePathCopilotAgent extends CopilotAgent {
	constructor(
		private readonly _copilotClient: ITestCopilotClient,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionDataService sessionDataService: ISessionDataService,
		@IAgentHostGitService gitService: IAgentHostGitService,
		@IAgentConfigurationService configurationService: IAgentConfigurationService,
		@IAgentHostStateManager stateManager: AgentHostStateManager,
		@IAgentHostCompletions completions: IAgentHostCompletions,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IByokLmBridgeRegistry byokBridgeRegistry: IByokLmBridgeRegistry,
		@ITelemetryService telemetryService: ITelemetryService,
		@IAgentHostProxyResolver proxyResolver: IAgentHostProxyResolver,
		@ICopilotApiService copilotApiService: ICopilotApiService,
	) {
		super(logService, instantiationService, sessionDataService, gitService, configurationService, stateManager, createTestGitHubEndpointService(), new MockAgentHostOTelService(), completions, NULL_CHECKPOINT_SERVICE, NULL_REVIEW_SERVICE, environmentService, byokBridgeRegistry, telemetryService, copilotApiService, proxyResolver);
		this._enablePlanModeOnClient(this._copilotClient as CopilotClient);
	}

	protected override _createCopilotClient(): CopilotClient {
		return this._copilotClient as CopilotClient;
	}
}

class TestableCopilotAgent extends CopilotAgent {
	private readonly _fakeSessions = new Map<string, IFakeAgentSession>();
	readonly resumeCalls: string[] = [];
	readonly createdClientOptions: CopilotClientOptions[] = [];

	// Keep model-refresh retries effectively instant in tests.
	protected override readonly _modelRefreshBaseDelayMs = 1;
	protected override readonly _modelRefreshMaxDelayMs = 2;

	constructor(
		private readonly _copilotClient: ITestCopilotClient,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionDataService sessionDataService: ISessionDataService,
		@IAgentHostGitService gitService: IAgentHostGitService,
		@IAgentConfigurationService configurationService: IAgentConfigurationService,
		@IAgentHostStateManager stateManager: AgentHostStateManager,
		@IAgentHostCompletions completions: IAgentHostCompletions,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IByokLmBridgeRegistry byokBridgeRegistry: IByokLmBridgeRegistry,
		@ITelemetryService telemetryService: ITelemetryService,
		@IAgentHostProxyResolver proxyResolver: IAgentHostProxyResolver,
		@ICopilotApiService copilotApiService: ICopilotApiService,
	) {
		super(logService, instantiationService, sessionDataService, gitService, configurationService, stateManager, createTestGitHubEndpointService(), new MockAgentHostOTelService(), completions, NULL_CHECKPOINT_SERVICE, NULL_REVIEW_SERVICE, environmentService, byokBridgeRegistry, telemetryService, copilotApiService, proxyResolver);
		this._enablePlanModeOnClient(this._copilotClient as CopilotClient);
	}

	protected override _createCopilotClient(options: CopilotClientOptions): CopilotClient {
		this.createdClientOptions.push(options);
		return this._copilotClient as CopilotClient;
	}

	registerFakeSession(sessionId: string, fake: IFakeAgentSession): void {
		this._fakeSessions.set(sessionId, fake);
	}

	protected override async _resumeSession(sessionId: string): Promise<CopilotAgentSession> {
		this.resumeCalls.push(sessionId);
		const fake = this._fakeSessions.get(sessionId);
		if (!fake) {
			throw new Error(`No fake session registered for '${sessionId}'`);
		}
		const sessionUri = AgentSession.uri('copilotcli', sessionId);
		const emitter = (this as unknown as { _onDidSessionProgress: { fire(s: AgentSignal): void } })._onDidSessionProgress;
		let turnId = '';
		// `_sessions` is a DisposableMap, so it will dispose() the entry on
		// teardown. The fields below are the only ones touched by sendMessage
		// and getSessionMessages in the code under test.
		const stub = {
			send: fake.send,
			getMessages: fake.getMessages,
			appliedSnapshot: undefined,
			dispose: fake.dispose,
			resetTurnState: (newTurnId: string) => { turnId = newTurnId; },
			emitInitialMarkdown: (content: string) => {
				emitter.fire({
					kind: 'action',
					resource: sessionUri,
					action: {
						type: ActionType.ChatResponsePart,
						turnId,
						part: { kind: ResponsePartKind.Markdown, id: `synth-${Date.now()}`, content },
					},
				});
			},
		} as unknown as CopilotAgentSession;
		return stub;
	}
}

function getCreatedClientOptions(agent: CopilotAgent): readonly CopilotClientOptions[] {
	assert.ok(agent instanceof TestableCopilotAgent);
	return agent.createdClientOptions;
}

function createTestAgentContext(disposables: Pick<DisposableStore, 'add'>, options?: { sessionDataService?: ISessionDataService; copilotClient?: ITestCopilotClient; useRealResumePath?: boolean; gitService?: TestAgentHostGitService; environmentServiceRegistration?: 'native' | 'none'; pluginManager?: IAgentPluginManager; fileService?: FileService; copilotApiService?: ICopilotApiService; gitHubEndpointService?: IAgentHostGitHubEndpointService; telemetryService?: ITelemetryService; userHome?: URI; logService?: ILogService; proxyResolver?: IAgentHostProxyResolver }): { agent: CopilotAgent; instantiationService: IInstantiationService; configurationService: IAgentConfigurationService; fileService: FileService; stateManager: AgentHostStateManager } {
	const services = new ServiceCollection();
	const logService = options?.logService ?? new NullLogService();
	const fileService = options?.fileService ?? disposables.add(new FileService(logService));
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
	services.set(ILogService, logService);
	services.set(IFileService, fileService);
	services.set(IAgentConfigurationService, configService);
	services.set(IAgentHostStateManager, stateManager);
	services.set(IAgentHostGitHubEndpointService, options?.gitHubEndpointService ?? createTestGitHubEndpointService());
	services.set(ISessionDataService, options?.sessionDataService ?? createNullSessionDataService());
	services.set(IAgentPluginManager, options?.pluginManager ?? new TestAgentPluginManager());
	services.set(IAgentHostGitService, options?.gitService ?? new TestAgentHostGitService());
	services.set(IAgentHostReviewService, NULL_REVIEW_SERVICE);
	services.set(IAgentHostTerminalManager, new TestAgentHostTerminalManager());
	services.set(IAgentHostOTelService, {
		_serviceBrand: undefined,
		getSdkTelemetryConfig: async () => undefined,
		getSpansDbPath: () => undefined,
		flush: async () => undefined,
	});
	services.set(IAgentHostCompletions, disposables.add(new AgentHostCompletions(logService)));
	services.set(IAgentHostProxyResolver, options?.proxyResolver ?? new TestProxyResolver());
	services.set(IByokLmBridgeRegistry, new ByokLmBridgeRegistry());
	const copilotApiService = options?.copilotApiService ?? new TestCopilotApiService();
	services.set(ICopilotApiService, copilotApiService);
	services.set(ITelemetryService, options?.telemetryService ?? NullTelemetryService);
	if (options?.environmentServiceRegistration !== 'none') {
		const environmentService = {
			_serviceBrand: undefined,
			userHome: options?.userHome ?? URI.from({ scheme: Schemas.inMemory, path: '/mock-home' }),
			tmpDir: URI.from({ scheme: Schemas.inMemory, path: '/mock-tmp' }),
		} as INativeEnvironmentService;
		services.set(INativeEnvironmentService, environmentService);
	}
	const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
	services.set(IInstantiationService, instantiationService);
	const agent = options?.copilotClient
		? instantiationService.createInstance(options.useRealResumePath ? ResumePathCopilotAgent : TestableCopilotAgent, options.copilotClient)
		: instantiationService.createInstance(CopilotAgent);
	return { agent, instantiationService, configurationService: configService, fileService, stateManager };
}

function createTestAgent(disposables: Pick<DisposableStore, 'add'>, options?: { sessionDataService?: ISessionDataService; copilotClient?: ITestCopilotClient; useRealResumePath?: boolean; gitService?: TestAgentHostGitService; environmentServiceRegistration?: 'native' | 'none'; pluginManager?: IAgentPluginManager; fileService?: FileService; copilotApiService?: ICopilotApiService; gitHubEndpointService?: IAgentHostGitHubEndpointService; telemetryService?: ITelemetryService; userHome?: URI; logService?: ILogService }): CopilotAgent {
	return createTestAgentContext(disposables, options).agent;
}

type CopilotCreateSessionOptions = Parameters<CopilotClient['createSession']>[0];

function createAgentSessionThroughAgent(agent: CopilotAgent, instantiationService: IInstantiationService, options?: { readonly mockSession?: MockCopilotSession; readonly activeClientToolSet?: ActiveClientToolSet; readonly snapshot?: IActiveClientSnapshot }): { readonly session: CopilotAgentSession; readonly createOptions: () => CopilotCreateSessionOptions | undefined } {
	const sessionUri = AgentSession.uri('copilotcli', 'test-session-1');
	const shellManager = instantiationService.createInstance(ShellManager, sessionUri, undefined);
	let createOptions: CopilotCreateSessionOptions | undefined;
	const mockSession = options?.mockSession ?? new MockCopilotSession();
	const launchPlan: CopilotSessionLaunchPlan = {
		kind: 'create',
		client: {
			createSession: async options => {
				createOptions = options;
				return mockSession as unknown as CopilotSession;
			},
			resumeSession: async () => mockSession as unknown as CopilotSession,
		},
		activeClientToolSet: options?.activeClientToolSet ?? new ActiveClientToolSet(),
		sessionId: 'test-session-1',
		workingDirectory: undefined,
		resolvedAgentName: undefined,
		snapshot: options?.snapshot ?? { tools: [], plugins: [], mcpServers: {} },
		shellManager,
		githubToken: 'token',
		model: undefined,
	};
	const agentInternals = (agent as unknown as {
		_getOrCreateActiveClient: (session: URI, directory: URI | undefined) => unknown;
		_createAgentSession: (launchPlan: CopilotSessionLaunchPlan, customizationDirectory: URI | undefined, activeClient: unknown) => CopilotAgentSession;
	});
	const activeClient = agentInternals._getOrCreateActiveClient(sessionUri, undefined);
	return { session: agentInternals._createAgentSession(launchPlan, undefined, activeClient), createOptions: () => createOptions };
}

function withoutUndefinedProperties(metadata: IAgentSessionMetadata): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(metadata)) {
		if (value !== undefined) {
			result[key] = value;
		}
	}
	return result;
}

function sdkSession(sessionId: string, cwd?: string): Awaited<ReturnType<ITestCopilotClient['listSessions']>>[number] {
	return {
		sessionId,
		startTime: new Date(1000),
		modifiedTime: new Date(2000),
		summary: `SDK ${sessionId}`,
		isRemote: false,
		...(cwd ? { context: { workingDirectory: cwd } } : {}),
	};
}

async function disposeAgent(agent: CopilotAgent): Promise<void> {
	await agent.shutdown();
	agent.dispose();
	// CopilotAgent.dispose calls super.dispose() from a promise continuation so
	// async shutdown can stop SDK sessions before child disposables are released.
	// Let that continuation run before the disposable leak tracker checks.
	await Promise.resolve();
}

suite('CopilotAgent', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('installs the GitHub telemetry callback in CopilotClientOptions', async () => {
		const client = new TestCopilotClient([]);
		const agent = createTestAgent(disposables, { copilotClient: client }) as TestableCopilotAgent;
		try {
			await agent.listSessions();
			assert.strictEqual(typeof getCreatedClientOptions(agent).at(-1)?.onGitHubTelemetry, 'function');
		} finally {
			await disposeAgent(agent);
		}
	});

	test('routes exact legacy targets exclusively and falls back to generic forwarding', async () => {
		const client = new TestCopilotClient([]);
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.restrictedTelemetryContexts.set('restricted-token', {
			restrictedTelemetryEnabled: true,
			trackingId: 'restricted-tid',
			telemetryEndpoint: 'https://telemetry.example',
			isInternal: true,
			userName: 'octocat',
			isVscodeTeamMember: true,
		});
		const telemetryService = disposables.add(new class extends AgentHostTelemetryService {
			readonly genericEvents: string[] = [];
			readonly enhancedEvents: string[] = [];
			readonly internalEvents: string[] = [];
			restrictedEnabled = false;

			override publicLog(eventName: string): void {
				this.genericEvents.push(eventName);
			}
			override sendEnhancedGHTelemetryEvent(eventName: string): void {
				this.enhancedEvents.push(eventName);
			}
			override sendEnhancedGHTelemetryEventForContext(_context: IAgentHostRestrictedTelemetryContext, eventName: string): void {
				this.enhancedEvents.push(eventName);
			}
			override sendInternalMSFTTelemetryEvent(eventName: string): void {
				this.internalEvents.push(eventName);
			}
			override sendInternalMSFTTelemetryEventForContext(_context: IAgentHostInternalTelemetryContext, eventName: string): void {
				this.internalEvents.push(eventName);
			}
			override setRestrictedTelemetryEnabled(enabled: boolean): void {
				this.restrictedEnabled = enabled;
				super.setRestrictedTelemetryEnabled(enabled);
			}
		}(NullTelemetryService));
		const agent = createTestAgent(disposables, { copilotClient: client, copilotApiService, telemetryService }) as TestableCopilotAgent;
		try {
			await agent.authenticate('https://api.github.com', 'restricted-token');
			for (let i = 0; i < 100 && !telemetryService.restrictedEnabled; i++) {
				await Promise.resolve();
			}
			await agent.listSessions();
			const forward = getCreatedClientOptions(agent).at(-1)?.onGitHubTelemetry;
			assert.ok(forward);

			const notification = (kind: string, restricted: boolean): GitHubTelemetryNotification => ({
				sessionId: 'session-1',
				restricted,
				event: { kind, properties: {}, metrics: {} },
			});
			await forward(notification('engine.messages.length', true));
			await forward(notification('engine.messages', false));
			await forward(notification('unknown_restricted', true));
			await forward(notification('tool_call_executed', false));

			assert.deepStrictEqual({
				generic: telemetryService.genericEvents,
				enhanced: telemetryService.enhancedEvents,
				internal: telemetryService.internalEvents,
			}, {
				generic: ['copilotCli/unknown_restricted', 'copilotCli/tool_call_executed'],
				enhanced: ['engine.messages.length'],
				internal: ['engine.messages.length'],
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('routes exact targets using the current auth token and reflects token changes', async () => {
		const client = new TestCopilotClient([]);
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.restrictedTelemetryContexts.set('token-a', {
			restrictedTelemetryEnabled: true,
			trackingId: 'token-a-tid',
			telemetryEndpoint: 'https://token-a.telemetry.example/',
			isInternal: true,
			userName: 'token-a-user',
			isVscodeTeamMember: true,
		});
		copilotApiService.restrictedTelemetryContexts.set('token-b', {
			restrictedTelemetryEnabled: false,
			trackingId: 'token-b-tid',
			telemetryEndpoint: undefined,
			isInternal: false,
			userName: 'token-b-user',
			isVscodeTeamMember: false,
		});
		const telemetryService = disposables.add(new class extends AgentHostTelemetryService {
			readonly enhancedContexts: IAgentHostRestrictedTelemetryContext[] = [];
			readonly internalContexts: IAgentHostInternalTelemetryContext[] = [];
			override sendEnhancedGHTelemetryEventForContext(context: IAgentHostRestrictedTelemetryContext): void {
				this.enhancedContexts.push(context);
			}
			override sendInternalMSFTTelemetryEventForContext(context: IAgentHostInternalTelemetryContext): void {
				this.internalContexts.push(context);
			}
		}(NullTelemetryService));
		const agent = createTestAgent(disposables, { copilotClient: client, copilotApiService, telemetryService }) as TestableCopilotAgent;
		try {
			await agent.authenticate('https://api.github.com', 'token-a');
			await agent.listSessions();
			const forward = getCreatedClientOptions(agent).at(-1)?.onGitHubTelemetry;
			assert.ok(forward);

			const notification: GitHubTelemetryNotification = {
				sessionId: 'session-a',
				restricted: true,
				event: { kind: 'engine.messages.length', properties: {}, metrics: {} },
			};
			await forward(notification);

			// Swapping the current auth token to opted-out token-b: later events resolve context from it and emit nothing.
			await agent.authenticate('https://api.github.com', 'token-b');
			await forward(notification);

			assert.deepStrictEqual({
				enhancedContexts: telemetryService.enhancedContexts,
				internalContexts: telemetryService.internalContexts.map(context => ({
					isInternal: context.isInternal,
					trackingId: context.trackingId,
					userName: context.userName,
					isVscodeTeamMember: context.isVscodeTeamMember,
				})),
			}, {
				enhancedContexts: [{
					restrictedTelemetryEnabled: true,
					trackingId: 'token-a-tid',
					telemetryEndpoint: 'https://token-a.telemetry.example/telemetry',
					isInternal: true,
					userName: 'token-a-user',
					isVscodeTeamMember: true,
				}],
				internalContexts: [{
					isInternal: true,
					trackingId: 'token-a-tid',
					userName: 'token-a-user',
					isVscodeTeamMember: true,
				}],
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('advertises Copilot as its display name', async () => {
		const agent = createTestAgent(disposables);
		try {
			assert.deepStrictEqual(agent.getDescriptor(), {
				provider: 'copilotcli',
				displayName: 'Copilot',
				description: 'Copilot SDK agent running in the local agent host process',
				capabilities: { multipleChats: { fork: true, sideChat: true } },
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	suite('spawned chat channel', () => {
		function fireSignal(agent: CopilotAgent, signal: AgentSignal): void {
			(agent as unknown as { _onDidSessionProgress: { fire(s: AgentSignal): void } })._onDidSessionProgress.fire(signal);
		}

		test('mirrors subagent_started onto onDidSpawnChat; subagent_completed leaves the chat live', async () => {
			const agent = createTestAgent(disposables);
			const spawned: IAgentSpawnChatEvent[] = [];
			disposables.add(agent.onDidSpawnChat(e => spawned.push(e)));
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'spawn-session');
				const parentChat = buildDefaultChatUri(sessionUri.toString());
				const toolCallId = 'tool-42';
				const expectedChat = buildSubagentChatUri(parseRequiredSessionUriFromChatUri(parentChat), toolCallId);

				fireSignal(agent, {
					kind: 'subagent_started',
					chat: URI.parse(parentChat),
					toolCallId,
					agentName: 'researcher',
					agentDisplayName: 'Researcher',
					agentDescription: 'Looks things up',
				});
				// Unrelated signals must not produce spawn events.
				fireSignal(agent, { kind: 'action', resource: sessionUri, action: { type: ActionType.SessionTitleChanged, title: 'x' } });
				// A completed subagent chat stays live (removed only on session teardown).
				fireSignal(agent, { kind: 'subagent_completed', chat: URI.parse(parentChat), toolCallId });

				assert.deepStrictEqual({
					spawned: spawned.map(e => ({
						session: e.session.toString(),
						chat: e.chat.toString(),
						parent: e.parent ? { chat: e.parent.chat.toString(), toolCallId: e.parent.toolCallId } : undefined,
						title: e.title,
					})),
				}, {
					spawned: [{
						session: sessionUri.toString(),
						chat: expectedChat,
						parent: { chat: parentChat, toolCallId },
						title: 'Researcher',
					}],
				});
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	test('uses generated Agents-window Copilot CLI branch names', async () => {
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.response = 'add-agent-host-config';
		const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());

		assert.deepStrictEqual({
			generated: await generator.generateBranchName({ sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', message: 'Add agent host config', githubToken: 'token' }),
			fallback: await generator.generateBranchName({ sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', message: 'Add agent host config' }),
			token: copilotApiService.utilityCalls[0]?.token,
			promptIncludesUserText: copilotApiService.utilityCalls[0]?.request.messages.some(message => message.content.includes('Add agent host config')),
		}, {
			generated: 'agents/add-agent-host-config',
			fallback: 'agents/add-agent-host-config',
			token: 'token',
			promptIncludesUserText: true,
		});
	});

	test('finds an available branch name when candidates collide', async () => {
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.response = 'add-agent-host-config';
		const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());
		const collisions = new Set([
			'agents/add-agent-host-config',
			'agents/add-agent-host-config-12345678',
			'agents/12345678-aaaa-bbbb-cccc-123456789abc',
		]);
		const exhaustedCandidates: string[] = [];
		let exhaustionError: string | undefined;
		try {
			await generator.generateBranchName({
				sessionId: '12345678-aaaa-bbbb-cccc-123456789abc',
				branchNameCollides: async name => {
					exhaustedCandidates.push(name);
					return true;
				},
			});
		} catch (error) {
			exhaustionError = error instanceof Error ? error.message : String(error);
		}

		assert.deepStrictEqual({
			unique: await generator.generateBranchName({ sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', message: 'Add agent host config', githubToken: 'token', branchNameCollides: async () => false }),
			collision: await generator.generateBranchName({ sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', message: 'Add agent host config', githubToken: 'token', branchNameCollides: async name => name === 'agents/add-agent-host-config' }),
			repeatedCollision: await generator.generateBranchName({ sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', message: 'Add agent host config', githubToken: 'token', branchNameCollides: async name => collisions.has(name) }),
			fallbackCollision: await generator.generateBranchName({ sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', branchNameCollides: async name => collisions.has(name) }),
			exhaustion: {
				error: exhaustionError,
				candidateCount: exhaustedCandidates.length,
				firstCandidate: exhaustedCandidates[0],
				lastCandidate: exhaustedCandidates.at(-1),
			},
		}, {
			unique: 'agents/add-agent-host-config',
			collision: 'agents/add-agent-host-config-12345678',
			repeatedCollision: 'agents/add-agent-host-config-12345678-2',
			fallbackCollision: 'agents/12345678-aaaa-bbbb-cccc-123456789abc-2',
			exhaustion: {
				error: 'Unable to find an available branch name after checking 100 candidates',
				candidateCount: 100,
				firstCandidate: 'agents/12345678-aaaa-bbbb-cccc-123456789abc',
				lastCandidate: 'agents/12345678-aaaa-bbbb-cccc-123456789abc-100',
			},
		});
	});

	test('prepends the branch prefix ahead of the built-in agents/ prefix', async () => {
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.response = 'add-agent-host-config';
		const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());

		assert.deepStrictEqual({
			withPrefix: await generator.generateBranchName({ sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', message: 'Add agent host config', githubToken: 'token', branchPrefix: 'users/alice/' }),
			emptyPrefix: await generator.generateBranchName({ sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', message: 'Add agent host config', githubToken: 'token', branchPrefix: '' }),
			fallbackWithPrefix: await generator.generateBranchName({ sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', branchPrefix: 'users/alice/' }),
		}, {
			withPrefix: 'users/alice/agents/add-agent-host-config',
			emptyPrefix: 'agents/add-agent-host-config',
			fallbackWithPrefix: 'users/alice/agents/12345678-aaaa-bbbb-cccc-123456789abc',
		});
	});

	test('keeps generated branch names short', async () => {
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.response = 'a'.repeat(100);
		const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());

		assert.strictEqual(
			(await generator.generateBranchName({ sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', message: 'Add agent host config', githubToken: 'token' })).length,
			'agents/'.length + 48,
		);
	});

	test('normalizes generated branch names', () => {
		assert.deepStrictEqual({
			simple: normalizeAgentBranchName('feature-branch'),
			uppercase: normalizeAgentBranchName('Feature-Branch'),
			special: normalizeAgentBranchName('Fix: Add new feature! (#42)'),
			unicode: normalizeAgentBranchName('café-feature'),
			empty: normalizeAgentBranchName('🚀🎉'),
		}, {
			simple: 'feature-branch',
			uppercase: 'feature-branch',
			special: 'fixaddnewfeature42',
			unicode: 'caf-feature',
			empty: '',
		});
	});

	test('derives slug branch hint from first message for fallback', () => {
		assert.deepStrictEqual({
			simple: getAgentBranchNameHintFromMessage('Add agent host config'),
			punctuation: getAgentBranchNameHintFromMessage('  Fix: the bug!! '),
			unicode: getAgentBranchNameHintFromMessage('Refactor café ☕ rendering'),
			words: getAgentBranchNameHintFromMessage('one two three four five six seven eight nine ten'),
			long: getAgentBranchNameHintFromMessage('a'.repeat(100))?.length,
			empty: getAgentBranchNameHintFromMessage('!!! ??? ...'),
		}, {
			simple: 'add-agent-host-config',
			punctuation: 'fix-the-bug',
			unicode: 'refactor-cafe-rendering',
			words: 'one-two-three-four-five-six-seven-eight',
			long: 48,
			empty: undefined,
		});
	});

	test('falls back to first-message slug when generated branch name cannot be used', async () => {
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.response = '!!! ??? ...';
		const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());

		assert.strictEqual(
			await generator.generateBranchName({ sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', message: 'Add agent host config', githubToken: 'token' }),
			'agents/add-agent-host-config',
		);
	});

	test('falls back to first-message slug when branch name generation fails', async () => {
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.error = new Error('failed');
		const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());

		assert.strictEqual(
			await generator.generateBranchName({ sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', message: 'Add agent host config', githubToken: 'token' }),
			'agents/add-agent-host-config',
		);
	});

	test('falls back to session id when no branch name can be derived', async () => {
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.response = '!!! ??? ...';
		const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());

		assert.strictEqual(
			await generator.generateBranchName({ sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', message: '!!! ??? ...', githubToken: 'token' }),
			'agents/12345678-aaaa-bbbb-cccc-123456789abc',
		);
	});

	test('contributes GHE-aware GitHub and discovered CAPI diagnostics endpoints', async () => {
		const endpointService = createTestGitHubEndpointService('https://github.example.com');
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.apiEndpoint = 'https://copilot.example.com';
		copilotApiService.userLogin = 'octocat';
		const agent = createTestAgent(disposables, { copilotApiService, gitHubEndpointService: endpointService });
		try {
			await agent.authenticate(endpointService.getCopilotResource().resource, 'token');

			assert.deepStrictEqual({
				endpoints: await agent.getNetworkDiagnosticsEndpoints(),
				account: await agent.getNetworkDiagnosticsAccount(),
			}, {
				endpoints: [
					{ name: 'GitHub API', url: endpointService.getApiBaseUri() },
					{ name: 'Copilot API (CAPI)', url: 'https://copilot.example.com/_ping' },
				],
				account: 'octocat',
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('returns empty models and lists sessions before authentication', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const ownedSession = AgentSession.uri('copilotcli', 'owned-before-auth');
		const ownedDb = sessionDataService.openDatabase(ownedSession);
		ownedDb.dispose();
		const client = new TestCopilotClient([sdkSession('owned-before-auth')]);
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
		try {
			const sessions = await agent.listSessions();
			assert.deepStrictEqual({
				models: agent.models.get(),
				sessions: sessions.map(session => AgentSession.id(session.session)),
				starts: client.startCallCount,
				listCalls: client.listSessionCallCount,
			}, {
				models: [],
				sessions: ['owned-before-auth'],
				starts: 1,
				listCalls: 1,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('starts the client and creates a provisional session before authentication', async () => {
		const client = new TestCopilotClient([]);
		const agent = createTestAgent(disposables, { copilotClient: client });
		const session = AgentSession.uri('copilotcli', 'unauth-create');
		const workingDirectory = URI.file('/workspace');
		try {
			const result = await agent.createSession({ session, workingDirectory });
			assert.ok(result.workingDirectory);
			assert.deepStrictEqual({
				session: result.session.toString(),
				workingDirectory: result.workingDirectory.toString(),
				provisional: result.provisional,
				starts: client.startCallCount,
				stops: client.stopCallCount,
			}, {
				session: session.toString(),
				workingDirectory: workingDirectory.toString(),
				provisional: true,
				starts: 1,
				stops: 0,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('passes the GitHub token when refreshing models', async () => {
		const client = new TestCopilotClient([], [{
			id: 'gpt-4o',
			name: 'GPT-4o',
		}]);
		const agent = createTestAgent(disposables, { copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'model-token');
			await waitForState(agent.models, models => models.length > 0);

			assert.deepStrictEqual(client.modelListRequests, [{ gitHubToken: 'model-token' }]);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('does not stop the client when the auth token changes', async () => {
		const client = new TestCopilotClient([], [{
			id: 'gpt-4o',
			name: 'GPT-4o',
		}]);
		const agent = createTestAgent(disposables, { copilotClient: client });
		try {
			await agent.listSessions();
			await agent.authenticate('https://api.github.com', 'model-token-a');
			for (let i = 0; i < 200 && client.modelListRequests.length < 1; i++) {
				await new Promise(resolve => setTimeout(resolve, 0));
			}
			await agent.authenticate('https://api.github.com', 'model-token-b');
			for (let i = 0; i < 200 && client.modelListRequests.length < 2; i++) {
				await new Promise(resolve => setTimeout(resolve, 0));
			}

			assert.deepStrictEqual({
				starts: client.startCallCount,
				stops: client.stopCallCount,
				requests: client.modelListRequests,
			}, {
				starts: 1,
				stops: 0,
				requests: [{ gitHubToken: 'model-token-a' }, { gitHubToken: 'model-token-b' }],
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('retries refreshing models after a transient failure', async () => {
		const client = new TestCopilotClient([], [{
			id: 'gpt-4o',
			name: 'GPT-4o',
		}]);
		client.modelListErrors.push(new Error('429 "too many requests"'));
		const agent = createTestAgent(disposables, { copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, m => m.length > 0);

			assert.deepStrictEqual({
				modelNames: models.map(m => m.name),
				requestCount: client.modelListRequests.length,
			}, {
				modelNames: ['GPT-4o'],
				requestCount: 2,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('stops refreshing models after the maximum number of attempts', async () => {
		const client = new TestCopilotClient([], [{
			id: 'gpt-4o',
			name: 'GPT-4o',
		}]);
		for (let i = 0; i < 10; i++) {
			client.modelListErrors.push(new Error('429 "too many requests"'));
		}
		const agent = createTestAgent(disposables, { copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token');
			for (let i = 0; i < 500 && client.modelListRequests.length < 5; i++) {
				await new Promise(resolve => setTimeout(resolve, 1));
			}
			// Give any erroneous extra retry a chance to fire before asserting.
			await new Promise(resolve => setTimeout(resolve, 10));

			assert.deepStrictEqual({
				requestCount: client.modelListRequests.length,
				models: agent.models.get(),
			}, {
				requestCount: 5,
				models: [],
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('keeps the previously loaded models when a later refresh fails', async () => {
		const client = new TestCopilotClient([], [{
			id: 'gpt-4o',
			name: 'GPT-4o',
		}]);
		const agent = createTestAgent(disposables, { copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token-a');
			await waitForState(agent.models, m => m.length > 0);

			// A refresh triggered by the next token change fails on every attempt.
			for (let i = 0; i < 10; i++) {
				client.modelListErrors.push(new Error('429 "too many requests"'));
			}
			const requestsBefore = client.modelListRequests.length;
			await agent.authenticate('https://api.github.com', 'token-b');
			for (let i = 0; i < 500 && client.modelListRequests.length < requestsBefore + 5; i++) {
				await new Promise(resolve => setTimeout(resolve, 1));
			}
			await new Promise(resolve => setTimeout(resolve, 10));

			assert.deepStrictEqual({
				modelNames: agent.models.get().map(m => m.name),
				retriedRequests: client.modelListRequests.length - requestsBefore,
			}, {
				modelNames: ['GPT-4o'],
				retriedRequests: 5,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('does not refresh models or restart the client after shutdown', async () => {
		const client = new TestCopilotClient([], [{
			id: 'gpt-4o',
			name: 'GPT-4o',
		}]);
		const agent = createTestAgent(disposables, { copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token');
			await waitForState(agent.models, m => m.length > 0);
			await agent.shutdown();

			const startsAfterShutdown = client.startCallCount;
			const requestsAfterShutdown = client.modelListRequests.length;

			// Simulate a queued model-refresh retry timer firing after shutdown.
			// It must bail out rather than call `_ensureClient()` and spawn a
			// fresh SDK client for an agent that is already torn down.
			await (agent as unknown as { _refreshModels(attempt?: number): Promise<void> })._refreshModels(1);

			assert.deepStrictEqual({
				starts: client.startCallCount,
				requests: client.modelListRequests.length,
			}, {
				starts: startsAfterShutdown,
				requests: requestsAfterShutdown,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('createSession infers workspace-less from an omitted workingDirectory and uses a stable scratch dir', async () => {
		const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/qc-home-`));
		const agent = createTestAgent(disposables, { userHome });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			const result = await agent.createSession({
				session: AgentSession.uri('copilotcli', 'temp-fallback'),
			});

			assert.strictEqual(result.provisional, true);
			assert.ok(result.workingDirectory);
			const expected = URI.joinPath(userHome, '.copilot', 'chats', 'temp-fallback');
			assert.strictEqual(result.workingDirectory.scheme, Schemas.file);
			assert.strictEqual(result.workingDirectory.fsPath, expected.fsPath);
			assert.deepStrictEqual(await fs.readdir(result.workingDirectory.fsPath), []);
			// Tagged workspace-less purely from inference (no input flag).
			const provisional = (agent as unknown as { _provisionalSessions: Map<string, { workspaceless?: boolean }> })._provisionalSessions.get('temp-fallback');
			assert.strictEqual(provisional?.workspaceless, true);
		} finally {
			await fs.rm(userHome.fsPath, { recursive: true, force: true });
			await disposeAgent(agent);
		}
	}).timeout(30_000);

	suite('quick chat scratch directory', () => {
		test('resume recreates a reaped quick chat scratch dir (ensure-exists on restore)', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/qc-home-`));
			const sessionId = 'qc-resume';
			const session = AgentSession.uri('copilotcli', sessionId);
			const scratchDir = URI.joinPath(userHome, '.copilot', 'chats', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const db = sessionDataService.openDatabase(session);
			await db.object.setMetadata('copilot.workingDirectory', scratchDir.toString());
			await db.object.setMetadata('agentHost.workspaceless', 'true');
			db.dispose();
			const client = new TestCopilotClient([sdkSession(sessionId, scratchDir.fsPath)]);
			const agent = createTestAgent(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService, userHome });
			const internals = agent as unknown as { _resumeSession: (id: string) => Promise<unknown> };
			try {
				await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'token');
				await assert.rejects(() => fs.access(scratchDir.fsPath));
				// The stubbed SDK can't finish initializing the resumed session, but
				// the scratch dir is ensured before that point.
				await internals._resumeSession(sessionId).catch(() => undefined);
				await fs.access(scratchDir.fsPath);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		}).timeout(30_000);

		test('disposeSession cleans up the quick chat scratch dir', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/qc-home-`));
			const agent = createTestAgent(disposables, { userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'qc-dispose');
				const result = await agent.createSession({ session });
				const scratchDir = URI.joinPath(userHome, '.copilot', 'chats', 'qc-dispose');
				await fs.access(scratchDir.fsPath);
				await agent.disposeSession(result.session);
				await assert.rejects(() => fs.access(scratchDir.fsPath));
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		}).timeout(30_000);
	});

	suite('restart on startup config change', () => {

		class StopCountingClient extends TestCopilotClient {
			stopCount = 0;
			override async stop(): ReturnType<ITestCopilotClient['stop']> {
				this.stopCount++;
				return super.stop();
			}
		}

		class MutableLogService extends NullLogService {
			private _level = LogLevel.Info;

			override setLevel(level: LogLevel): void {
				this._level = level;
			}

			override getLevel(): LogLevel {
				return this._level;
			}
		}

		test('resolves the system proxy by default and bypasses it when disabled', async () => {
			const proxyResolver = new TestProxyResolver();
			proxyResolver.resolvedProxy = 'http://system-proxy.example:8080';
			const { agent, configurationService } = createTestAgentContext(disposables, { proxyResolver });
			const resolveProxyForSdk = (env: Record<string, string | undefined>) => (agent as unknown as {
				_resolveProxyForSdk(env: Record<string, string | undefined>): Promise<string | undefined>;
			})._resolveProxyForSdk(env);
			try {
				assert.strictEqual(await resolveProxyForSdk({}), proxyResolver.resolvedProxy);

				configurationService.updateRootConfig({ [AgentHostSystemProxyEnabledConfigKey]: false });
				assert.deepStrictEqual({
					proxy: await resolveProxyForSdk({}),
					resolveProxyCalls: proxyResolver.resolveProxyCalls,
				}, {
					proxy: undefined,
					resolveProxyCalls: 1,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('passes the configured log level to the Copilot SDK client', async () => {
			const client = new TestCopilotClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				configurationService.updateRootConfig({ [CopilotCliConfigKey.CopilotSdkLogLevel]: 'trace' });
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listSessions();

				assert.deepStrictEqual(getCreatedClientOptions(agent).map(options => options.logLevel), ['all']);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('uses info when neither the setting nor agent host enables trace', async () => {
			const client = new TestCopilotClient([]);
			const { agent } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listSessions();

				assert.deepStrictEqual(getCreatedClientOptions(agent).map(options => options.logLevel), ['info']);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('uses trace when the agent host log level is trace', async () => {
			const client = new TestCopilotClient([]);
			const logService = new MutableLogService();
			logService.setLevel(LogLevel.Trace);
			const { agent } = createTestAgentContext(disposables, { copilotClient: client, logService });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listSessions();

				assert.deepStrictEqual(getCreatedClientOptions(agent).map(options => options.logLevel), ['all']);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('restarts the client when the Copilot SDK log level changes', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listSessions();

				configurationService.updateRootConfig({ [CopilotCliConfigKey.CopilotSdkLogLevel]: 'trace' });
				await Promise.resolve();
				await agent.listSessions();

				assert.deepStrictEqual({
					stopCount: client.stopCount,
					logLevel: getCreatedClientOptions(agent).at(-1)?.logLevel,
				}, {
					stopCount: 1,
					logLevel: 'all',
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('restarts the idle client when the rubber duck config changes', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				// Force the client to start so a subsequent config change has something to restart.
				await agent.listSessions();

				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: true });
				await Promise.resolve();

				assert.strictEqual(client.stopCount, 1);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('restarts and disposes active sessions when the config changes', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listSessions();

				let disposed = false;
				setDefaultSessionStub(agent, 'active', { dispose() { disposed = true; } });

				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: true });
				await Promise.resolve();

				assert.deepStrictEqual({
					stopCount: client.stopCount,
					disposed,
				}, {
					stopCount: 1,
					disposed: true,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('does not restart when an unrelated config key changes', async () => {
			const client = new StopCountingClient([]);
			const logService = new MutableLogService();
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client, logService });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listSessions();

				logService.setLevel(LogLevel.Trace);
				configurationService.updateRootConfig({ [CopilotCliConfigKey.EnableCustomTerminalTool]: true });
				await Promise.resolve();

				assert.strictEqual(client.stopCount, 0);
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	test('models include billing multiplier metadata when SDK provides it', async () => {
		const agent = createTestAgent(disposables, {
			copilotClient: new TestCopilotClient([], [{
				id: 'gpt-4o',
				name: 'GPT-4o',
				billing: { multiplier: 1.5 },
				capabilities: { limits: { max_context_window_tokens: 128000, max_output_tokens: 16000, max_prompt_tokens: 112000 }, supports: { vision: true } },
			}]),
		});
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, models => models.length > 0);

			assert.deepStrictEqual(models, [{
				provider: 'copilotcli',
				id: 'gpt-4o',
				name: 'GPT-4o',
				maxContextWindow: 128000,
				maxOutputTokens: 16000,
				maxPromptTokens: 112000,
				supportsVision: true,
				configSchema: undefined,
				policyState: undefined,
				_meta: { multiplierNumeric: 1.5 },
			}]);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('models include picker and promo metadata when the SDK provides it', async () => {
		const agent = createTestAgent(disposables, {
			copilotClient: new TestCopilotClient([], [{
				id: 'claude-sonnet',
				name: 'Claude Sonnet',
				capabilities: { limits: { max_context_window_tokens: 200_000 } },
				billing: {
					multiplier: 1,
					promo: {
						id: 'summer-sale',
						discountPercent: 25,
						endsAt: '2026-08-01T00:00:00Z',
						message: 'Save on Claude Sonnet',
					},
					tokenPrices: {
						batchSize: 100_000,
						maxPromptTokens: 200_000,
						inputPrice: 0.3,
						cacheReadPrice: 0.1,
						outputPrice: 1.5,
						longContext: { maxPromptTokens: 1_000_000, inputPrice: 0.6, cacheReadPrice: 0.1, outputPrice: 2.25 },
					},
				},
				modelPickerCategory: 'powerful',
				modelPickerPriceCategory: 'medium',
			}]),
		});
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, models => models.length > 0);

			assert.deepStrictEqual(models[0]._meta, {
				multiplierNumeric: 1,
				inputCost: 3,
				cacheCost: 1,
				outputCost: 15,
				longContextInputCost: 6,
				longContextCacheCost: 1,
				longContextOutputCost: 22.5,
				priceCategory: 'medium',
				category: 'powerful',
				promo: {
					id: 'summer-sale',
					discountPercent: 25,
					endsAt: '2026-08-01T00:00:00Z',
					message: 'Save on Claude Sonnet',
				},
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('configSchema emits a thinkingLevel property when the model advertises reasoning efforts', async () => {
		const agent = createTestAgent(disposables, {
			copilotClient: new TestCopilotClient([], [{
				id: 'o3',
				name: 'o3',
				capabilities: { limits: { max_context_window_tokens: 128000 } },
				supportedReasoningEfforts: ['low', 'medium', 'high'],
				defaultReasoningEffort: 'medium',
			}]),
		});
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, models => models.length > 0);

			const schema = models[0].configSchema;
			assert.deepStrictEqual(schema?.properties.thinkingLevel?.enum, ['low', 'medium', 'high']);
			assert.strictEqual(schema?.properties.thinkingLevel?.default, 'medium');
			assert.strictEqual(schema?.properties.contextSize, undefined);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('configSchema emits a numeric contextSize property when long_context tier exceeds default', async () => {
		const agent = createTestAgent(disposables, {
			copilotClient: new TestCopilotClient([], [{
				id: 'claude-sonnet',
				name: 'Claude Sonnet',
				capabilities: { limits: { max_context_window_tokens: 200_000 } },
				billing: {
					multiplier: 1,
					tokenPrices: {
						maxPromptTokens: 200_000,
						longContext: { maxPromptTokens: 1_000_000, inputPrice: 2 },
					},
				},
			}]),
		});
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, models => models.length > 0);

			const contextSize = models[0].configSchema?.properties.contextSize;
			assert.strictEqual(contextSize?.type, 'number');
			assert.deepStrictEqual(contextSize?.enum, [200_000, 1_000_000]);
			assert.strictEqual(contextSize?.default, 200_000);
			assert.deepStrictEqual(contextSize?.enumLabels, ['200K', '1M']);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('configSchema omits contextSize when long_context tier is missing or not larger', async () => {
		const agent = createTestAgent(disposables, {
			copilotClient: new TestCopilotClient([], [
				{
					id: 'no-long-context',
					name: 'No Long Context',
					billing: { multiplier: 1, tokenPrices: { contextMax: 200_000 } },
				},
				{
					id: 'equal-long-context',
					name: 'Equal Long Context',
					billing: {
						multiplier: 1,
						tokenPrices: { contextMax: 200_000, longContext: { contextMax: 200_000 } },
					},
				},
			]),
		});
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, models => models.length > 0);

			assert.strictEqual(models[0].configSchema, undefined);
			assert.strictEqual(models[1].configSchema, undefined);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('configSchema shows both context options by default when long_context tier has no surcharge', async () => {
		const agent = createTestAgent(disposables, {
			copilotClient: new TestCopilotClient([], [{
				id: 'free-long-context',
				name: 'Free Long Context',
				capabilities: { limits: { max_context_window_tokens: 200_000 } },
				billing: {
					multiplier: 1,
					tokenPrices: {
						contextMax: 200_000,
						longContext: { contextMax: 1_000_000 },
					},
				},
			}]),
		});
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, models => models.length > 0);

			const contextSize = models[0].configSchema?.properties?.contextSize;
			assert.strictEqual(contextSize?.type, 'number');
			assert.deepStrictEqual(contextSize?.enum, [200_000, 1_000_000]);
			assert.strictEqual(contextSize?.default, 200_000);
			assert.deepStrictEqual(contextSize?.enumLabels, ['200K', '1M']);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('configSchema shows only long context option when long_context tier has no surcharge and preferLongContext is enabled', async () => {
		const { agent, configurationService } = createTestAgentContext(disposables, {
			copilotClient: new TestCopilotClient([], [{
				id: 'free-long-context',
				name: 'Free Long Context',
				capabilities: { limits: { max_context_window_tokens: 200_000 } },
				billing: {
					multiplier: 1,
					tokenPrices: {
						contextMax: 200_000,
						longContext: { contextMax: 1_000_000 },
					},
				},
			}]),
		});
		try {
			configurationService.updateRootConfig({ [AgentHostPreferLongContextEnabledConfigKey]: true });
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, models => models.length > 0);

			const contextSize = models[0].configSchema?.properties?.contextSize;
			assert.strictEqual(contextSize?.type, 'number');
			assert.deepStrictEqual(contextSize?.enum, [1_000_000]);
			assert.strictEqual(contextSize?.default, 1_000_000);
			assert.deepStrictEqual(contextSize?.enumLabels, ['1M']);
		} finally {
			await disposeAgent(agent);
		}
	});

	suite('contextSize to contextTier mapping', () => {
		const longContextModel: ITestCopilotModelInfo = {
			id: 'claude-sonnet',
			name: 'Claude Sonnet',
			capabilities: { limits: { max_context_window_tokens: 200_000 } },
			billing: {
				multiplier: 1,
				tokenPrices: {
					contextMax: 200_000,
					longContext: { contextMax: 1_000_000, inputPrice: 2 },
				},
			},
		};

		async function captureSessionConfig(model: ModelSelection | undefined, models: readonly ITestCopilotModelInfo[], preferLongContext?: boolean): Promise<CopilotCreateSessionOptions | undefined> {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([], models);
			let capturedConfig: CopilotCreateSessionOptions | undefined;
			client.createSession = async config => {
				capturedConfig = config;
				return new MockCopilotSession() as unknown as CopilotSession;
			};
			const { agent, configurationService } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client });
			try {
				if (preferLongContext) {
					configurationService.updateRootConfig({ [AgentHostPreferLongContextEnabledConfigKey]: true });
				}
				await agent.authenticate('https://api.github.com', 'token');
				await waitForState(agent.models, m => m.length > 0);
				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'ctx-session'),
					workingDirectory: URI.file('/workspace'),
					...(model ? { model } : {}),
				});
				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', undefined);
				return capturedConfig;
			} finally {
				await disposeAgent(agent);
			}
		}

		test('maps the largest numeric context size to long_context', async () => {
			const config = await captureSessionConfig({ id: 'claude-sonnet', config: { contextSize: '1000000' } }, [longContextModel]);
			assert.ok(config, 'SDK createSession should be called during materialization');
			assert.strictEqual(config.contextTier, 'long_context');
		});

		test('maps the default numeric context size to default', async () => {
			const config = await captureSessionConfig({ id: 'claude-sonnet', config: { contextSize: '200000' } }, [longContextModel]);
			assert.ok(config);
			assert.strictEqual(config.contextTier, 'default');
		});

		test('drops a numeric context size the model does not offer', async () => {
			const config = await captureSessionConfig(
				{ id: 'no-context-picker', config: { contextSize: '1000000' } },
				[{ id: 'no-context-picker', name: 'No Picker' }],
			);
			assert.ok(config);
			assert.strictEqual(config.contextTier, undefined);
		});

		test('passes through a legacy resolved tier string under the deprecated contextTier key', async () => {
			const config = await captureSessionConfig({ id: 'claude-sonnet', config: { contextTier: 'long_context' } }, [longContextModel]);
			assert.ok(config);
			assert.strictEqual(config.contextTier, 'long_context');
		});

		test('leaves the SDK on its default tier when model has no surcharge and no explicit selection', async () => {
			const freeLongContextModel: ITestCopilotModelInfo = {
				id: 'free-long-ctx',
				name: 'Free Long Ctx',
				capabilities: { limits: { max_context_window_tokens: 200_000 } },
				billing: {
					multiplier: 1,
					tokenPrices: {
						contextMax: 200_000,
						longContext: { contextMax: 1_000_000 },
					},
				},
			};
			const config = await captureSessionConfig({ id: 'free-long-ctx' }, [freeLongContextModel]);
			assert.ok(config);
			assert.strictEqual(config.contextTier, undefined);
		});

		test('uses long_context when model has no surcharge, no explicit selection and preferLongContext is enabled', async () => {
			const freeLongContextModel: ITestCopilotModelInfo = {
				id: 'free-long-ctx',
				name: 'Free Long Ctx',
				capabilities: { limits: { max_context_window_tokens: 200_000 } },
				billing: {
					multiplier: 1,
					tokenPrices: {
						contextMax: 200_000,
						longContext: { contextMax: 1_000_000 },
					},
				},
			};
			const config = await captureSessionConfig({ id: 'free-long-ctx' }, [freeLongContextModel], true);
			assert.ok(config);
			assert.strictEqual(config.contextTier, 'long_context');
		});
	});

	test('agent-created sessions can resolve session-state paths via INativeEnvironmentService', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const { agent, instantiationService } = createTestAgentContext(disposables, {
			environmentServiceRegistration: 'native',
			sessionDataService,
		});
		const previousXdgStateHome = process.env['XDG_STATE_HOME'];
		delete process.env['XDG_STATE_HOME'];
		try {
			const createdSession = createAgentSessionThroughAgent(agent, instantiationService);
			const agentSession = disposables.add(createdSession.session);
			await agentSession.initializeSession();
			const onPermissionRequest = createdSession.createOptions()?.onPermissionRequest;
			assert.ok(onPermissionRequest);

			const result = await onPermissionRequest({
				kind: 'read',
				intention: 'read plan',
				path: URI.file('/mock-home/.copilot/session-state/test-session-1/plan.md').fsPath,
				toolCallId: 'tc-read-plan-agent-composition',
			}, { sessionId: 'test-session-1' });

			assert.strictEqual(result.kind, 'approve-once');
		} finally {
			if (previousXdgStateHome === undefined) {
				delete process.env['XDG_STATE_HOME'];
			} else {
				process.env['XDG_STATE_HOME'] = previousXdgStateHome;
			}
			await disposeAgent(agent);
		}
	});

	test('client tool call contributor prefers the message sender when it provides the tool', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const { agent, instantiationService } = createTestAgentContext(disposables, { environmentServiceRegistration: 'native', sessionDataService });
		const actions: (SessionAction | ChatAction)[] = [];
		disposables.add(agent.onDidSessionProgress(signal => {
			if (signal.kind === 'action') {
				actions.push(signal.action);
			}
		}));
		const activeClientToolSet = new ActiveClientToolSet();
		const sharedTool: ToolDefinition = { name: 'shared', description: 'Shared tool', inputSchema: { type: 'object', properties: {} } };
		activeClientToolSet.set('client-A', [sharedTool]);
		activeClientToolSet.set('client-B', [sharedTool]);
		const mockSession = new MockCopilotSession();
		const createdSession = createAgentSessionThroughAgent(agent, instantiationService, {
			mockSession,
			activeClientToolSet,
			snapshot: { tools: activeClientToolSet.merged(), plugins: [], mcpServers: {} },
		});
		const agentSession = disposables.add(createdSession.session);
		try {
			await agentSession.initializeSession();
			agentSession.resetTurnState('turn-1', 'client-B');

			mockSession.emit({
				type: 'tool.execution_start',
				data: { toolCallId: 'tool-1', toolName: 'shared', arguments: {} },
			} as SessionEventPayload<'tool.execution_start'>);

			const toolStart = actions.find(action => action.type === ActionType.ChatToolCallStart);
			assert.deepStrictEqual(toolStart?.type === ActionType.ChatToolCallStart ? toolStart.contributor : undefined, {
				kind: ToolCallContributorKind.Client,
				clientId: 'client-B',
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('client tool completion unblocks a pending permission request', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const { agent, instantiationService, fileService } = createTestAgentContext(disposables, { environmentServiceRegistration: 'native', sessionDataService });
		disposables.add(registerPendingEditContentProvider(fileService));
		const createdSession = createAgentSessionThroughAgent(agent, instantiationService);
		const agentSession = disposables.add(createdSession.session);
		const pendingEditContentUri = new DeferredPromise<URI>();
		disposables.add(agent.onDidSessionProgress(signal => {
			if (signal.kind === 'pending_confirmation') {
				const uri = signal.state.edits?.items[0]?.after?.content.uri;
				if (uri) {
					pendingEditContentUri.complete(URI.parse(uri));
				}
			}
		}));
		try {
			await agentSession.initializeSession();
			const onPermissionRequest = createdSession.createOptions()?.onPermissionRequest;
			assert.ok(onPermissionRequest);

			const permissionRequestResult = onPermissionRequest({
				kind: 'write',
				toolCallId: 'tool-1',
				canOfferSessionApproval: false,
				diff: '--- a/file.txt\n+++ b/file.txt\n@@ -0,0 +1 @@\n+after',
				fileName: URI.file('/workspace/file.txt').fsPath,
				intention: 'write file',
				newFileContents: 'after',
			}, { sessionId: 'test-session-1' });
			const editContentUri = await pendingEditContentUri.p;

			agentSession.handleClientToolCallComplete('tool-1', {
				success: false,
				pastTenseMessage: 'Client tool failed',
				content: [{ type: ToolResultContentType.Text, text: 'failed before approval' }],
				error: { message: 'failed before approval' },
			});
			await timeout(0);

			assert.deepStrictEqual({
				permissionResult: await permissionRequestResult,
				pendingEditContentExists: await fileService.exists(editContentUri),
			}, {
				permissionResult: { kind: 'approve-once' },
				pendingEditContentExists: false,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('auto-approves one duplicate write permission request after approval', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const { agent, instantiationService, fileService } = createTestAgentContext(disposables, { environmentServiceRegistration: 'native', sessionDataService });
		disposables.add(registerPendingEditContentProvider(fileService));
		const createdSession = createAgentSessionThroughAgent(agent, instantiationService);
		const agentSession = disposables.add(createdSession.session);
		let nextPendingPermission = new DeferredPromise<void>();
		let pendingPermissionCount = 0;
		disposables.add(agent.onDidSessionProgress(signal => {
			if (signal.kind === 'pending_confirmation') {
				pendingPermissionCount++;
				nextPendingPermission.complete();
			}
		}));
		try {
			await agentSession.initializeSession();
			const onPermissionRequest = createdSession.createOptions()?.onPermissionRequest;
			assert.ok(onPermissionRequest);
			const request: PermissionRequest = {
				kind: 'write',
				toolCallId: 'tool-1',
				canOfferSessionApproval: true,
				diff: '--- a/file.txt\n+++ b/file.txt\n@@ -0,0 +1 @@\n+after',
				fileName: URI.file('/outside/file.txt').fsPath,
				intention: 'write file',
				newFileContents: 'after',
			};

			const firstResultPromise = onPermissionRequest(request, { sessionId: 'test-session-1' });
			await nextPendingPermission.p;
			agentSession.respondToPermissionRequest('tool-1', true);
			const firstResult = await firstResultPromise;
			const duplicateResult = await onPermissionRequest({ ...request }, { sessionId: 'test-session-1' });

			nextPendingPermission = new DeferredPromise<void>();
			const thirdResultPromise = onPermissionRequest({ ...request }, { sessionId: 'test-session-1' });
			await nextPendingPermission.p;
			agentSession.respondToPermissionRequest('tool-1', false);
			const thirdResult = await thirdResultPromise;

			assert.deepStrictEqual({
				results: [firstResult, duplicateResult, thirdResult],
				pendingPermissionCount,
			}, {
				results: [{ kind: 'approve-once' }, { kind: 'approve-once' }, { kind: 'denied-interactively-by-user' }],
				pendingPermissionCount: 2,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('requires confirmation when a second write permission request differs', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const { agent, instantiationService, fileService } = createTestAgentContext(disposables, { environmentServiceRegistration: 'native', sessionDataService });
		disposables.add(registerPendingEditContentProvider(fileService));
		const createdSession = createAgentSessionThroughAgent(agent, instantiationService);
		const agentSession = disposables.add(createdSession.session);
		let nextPendingPermission = new DeferredPromise<void>();
		let pendingPermissionCount = 0;
		disposables.add(agent.onDidSessionProgress(signal => {
			if (signal.kind === 'pending_confirmation') {
				pendingPermissionCount++;
				nextPendingPermission.complete();
			}
		}));
		try {
			await agentSession.initializeSession();
			const onPermissionRequest = createdSession.createOptions()?.onPermissionRequest;
			assert.ok(onPermissionRequest);
			const request: PermissionRequest = {
				kind: 'write',
				toolCallId: 'tool-1',
				canOfferSessionApproval: true,
				diff: '--- a/file.txt\n+++ b/file.txt\n@@ -0,0 +1 @@\n+first',
				fileName: URI.file('/outside/file.txt').fsPath,
				intention: 'write file',
				newFileContents: 'first',
			};

			const firstResultPromise = onPermissionRequest(request, { sessionId: 'test-session-1' });
			await nextPendingPermission.p;
			agentSession.respondToPermissionRequest('tool-1', true);
			const firstResult = await firstResultPromise;

			nextPendingPermission = new DeferredPromise<void>();
			const changedResultPromise = onPermissionRequest({
				...request,
				diff: '--- a/other.txt\n+++ b/other.txt\n@@ -0,0 +1 @@\n+second',
				fileName: URI.file('/outside/other.txt').fsPath,
				newFileContents: 'second',
			}, { sessionId: 'test-session-1' });
			await nextPendingPermission.p;
			agentSession.respondToPermissionRequest('tool-1', false);
			const changedResult = await changedResultPromise;

			assert.deepStrictEqual({
				results: [firstResult, changedResult],
				pendingPermissionCount,
			}, {
				results: [{ kind: 'approve-once' }, { kind: 'denied-interactively-by-user' }],
				pendingPermissionCount: 2,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('auto-approves one duplicate read permission request after approval', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const { agent, instantiationService, fileService } = createTestAgentContext(disposables, { environmentServiceRegistration: 'native', sessionDataService });
		disposables.add(registerPendingEditContentProvider(fileService));
		const createdSession = createAgentSessionThroughAgent(agent, instantiationService);
		const agentSession = disposables.add(createdSession.session);
		let nextPendingPermission = new DeferredPromise<void>();
		let pendingPermissionCount = 0;
		disposables.add(agent.onDidSessionProgress(signal => {
			if (signal.kind === 'pending_confirmation') {
				pendingPermissionCount++;
				nextPendingPermission.complete();
			}
		}));
		try {
			await agentSession.initializeSession();
			const onPermissionRequest = createdSession.createOptions()?.onPermissionRequest;
			assert.ok(onPermissionRequest);
			const request: PermissionRequest = {
				kind: 'read',
				toolCallId: 'tool-1',
				intention: 'read file',
				path: URI.file('/outside/file.txt').fsPath,
			};

			const firstResultPromise = onPermissionRequest(request, { sessionId: 'test-session-1' });
			await nextPendingPermission.p;
			agentSession.respondToPermissionRequest('tool-1', true);
			const firstResult = await firstResultPromise;
			const duplicateResult = await onPermissionRequest({ ...request }, { sessionId: 'test-session-1' });

			nextPendingPermission = new DeferredPromise<void>();
			const thirdResultPromise = onPermissionRequest({ ...request }, { sessionId: 'test-session-1' });
			await nextPendingPermission.p;
			agentSession.respondToPermissionRequest('tool-1', false);
			const thirdResult = await thirdResultPromise;

			assert.deepStrictEqual({
				results: [firstResult, duplicateResult, thirdResult],
				pendingPermissionCount,
			}, {
				results: [{ kind: 'approve-once' }, { kind: 'approve-once' }, { kind: 'denied-interactively-by-user' }],
				pendingPermissionCount: 2,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('listSessions only returns sessions with a database', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const ownedSession = AgentSession.uri('copilotcli', 'owned');
		const ownedDb = sessionDataService.openDatabase(ownedSession);
		ownedDb.dispose();

		const client = new TestCopilotClient([sdkSession('owned'), sdkSession('external')]);
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			assert.deepStrictEqual((await agent.listSessions()).map(s => AgentSession.id(s.session)), ['owned']);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('listSessions reads stored metadata from sessions with a database', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const legacySession = AgentSession.uri('copilotcli', 'legacy');
		const legacyDb = sessionDataService.openDatabase(legacySession);
		await legacyDb.object.setMetadata('copilot.workingDirectory', URI.file('/workspace').toString());
		legacyDb.dispose();

		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([sdkSession('legacy')]) });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			assert.deepStrictEqual((await agent.listSessions()).map(withoutUndefinedProperties), [{
				session: legacySession,
				startTime: 1000,
				modifiedTime: 2000,
				summary: 'SDK legacy',
				workingDirectory: URI.file('/workspace'),
			}]);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('listSessions does not itself re-emit the workspaceless tag (AgentService overlays it centrally)', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const session = AgentSession.uri('copilotcli', 'quick');
		const db = sessionDataService.openDatabase(session);
		// A committed quick chat persists a scratch cwd AND the AH-owned
		// workspace-less marker. The marker is surfaced onto `_meta` by
		// `AgentService.listSessions` (see agentService.test.ts), not by the agent
		// itself — the agent only reads it for the resume system prompt / cleanup.
		await db.object.setMetadata('copilot.workingDirectory', URI.file('/scratch/quick').toString());
		await db.object.setMetadata('agentHost.workspaceless', 'true');
		db.dispose();

		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([sdkSession('quick')]) });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			assert.deepStrictEqual((await agent.listSessions()).map(withoutUndefinedProperties), [{
				session,
				startTime: 1000,
				modifiedTime: 2000,
				summary: 'SDK quick',
				workingDirectory: URI.file('/scratch/quick'),
			}]);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('getSessionMetadata reads one SDK session and stored metadata without listing sessions', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const session = AgentSession.uri('copilotcli', 'target');
		const db = sessionDataService.openDatabase(session);
		await db.object.setMetadata('copilot.workingDirectory', URI.file('/workspace').toString());
		db.dispose();

		const client = new TestCopilotClient([sdkSession('target')]);
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			const metadata = await agent.getSessionMetadata(session);
			assert.ok(metadata);
			assert.deepStrictEqual(withoutUndefinedProperties(metadata), {
				session,
				startTime: 1000,
				modifiedTime: 2000,
				summary: 'SDK target',
				workingDirectory: URI.file('/workspace'),
			});
			assert.deepStrictEqual(client.getSessionMetadataCalls, ['target']);
			assert.strictEqual(client.listSessionCallCount, 0);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('getSessionMetadata only returns sessions with a database', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const session = AgentSession.uri('copilotcli', 'external');
		const client = new TestCopilotClient([sdkSession('external', '/workspace')]);
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			assert.strictEqual(await agent.getSessionMetadata(session), undefined);
			assert.deepStrictEqual(client.getSessionMetadataCalls, []);
			assert.strictEqual(client.listSessionCallCount, 0);
			assert.deepStrictEqual(sessionDataService.openedSessions, []);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('listSessions does not create databases for unowned SDK sessions', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([sdkSession('external', '/workspace')]) });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			assert.deepStrictEqual(await agent.listSessions(), []);
			assert.deepStrictEqual(sessionDataService.openedSessions, []);
		} finally {
			await disposeAgent(agent);
		}
	});

	suite('createSession activeClient eager-claim', () => {

		class SpyingPluginManager extends TestAgentPluginManager {
			public readonly calls: { clientId: string; customizations: ClientPluginCustomization[] }[] = [];

			override async syncCustomizations(clientId: string, customizations: ClientPluginCustomization[], _progress?: (status: PluginCustomization) => void): Promise<ISyncedCustomization[]> {
				this.calls.push({ clientId, customizations: [...customizations] });
				return [];
			}
		}

		test('createSession seeds activeClient tools and syncs customizations', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const pluginManager = new SpyingPluginManager();
			// `createSession` now creates a provisional record without
			// touching the SDK; activeClient seeding and plugin sync happen
			// inline before the provisional record is stored.
			client.createSession = async () => { throw new Error('SDK should not be touched on provisional create'); };

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, pluginManager });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const customizations: ClientPluginCustomization[] = [{ type: CustomizationType.Plugin, id: customizationId('file:///plugin-a'), uri: 'file:///plugin-a', name: 'Plugin A', enabled: true }];
				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'test-session'),
					workingDirectory: URI.file('/workspace'),
					activeClient: {
						clientId: 'client-1',
						tools: [{ name: 't1', description: 'd', inputSchema: { type: 'object' } }],
						customizations,
					},
				});

				assert.strictEqual(result.provisional, true);
				assert.deepStrictEqual(pluginManager.calls, [{ clientId: 'client-1', customizations }]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createSession without activeClient does not sync customizations', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const pluginManager = new SpyingPluginManager();
			client.createSession = async () => { throw new Error('SDK should not be touched on provisional create'); };

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, pluginManager });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'test-session-2'),
					workingDirectory: URI.file('/workspace'),
				});

				assert.strictEqual(result.provisional, true);
				assert.deepStrictEqual(pluginManager.calls, []);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('session plugin enablement is projected from reducer state per session', async () => {
			class PassthroughPluginManager extends TestAgentPluginManager {
				override async syncCustomizations(_clientId: string, customizations: ClientPluginCustomization[]): Promise<ISyncedCustomization[]> {
					return customizations.map(customization => ({ customization }));
				}
			}

			const { agent, stateManager } = createTestAgentContext(disposables, { pluginManager: new PassthroughPluginManager() });
			try {
				const firstSession = AgentSession.uri('copilotcli', 'first-enable-state');
				const secondSession = AgentSession.uri('copilotcli', 'second-enable-state');
				const now = new Date().toISOString();
				for (const session of [firstSession, secondSession]) {
					stateManager.createSession({
						resource: session.toString(),
						provider: 'copilotcli',
						title: 'Test',
						status: SessionStatus.Idle,
						createdAt: now,
						modifiedAt: now,
					});
				}

				const plugin: ClientPluginCustomization = {
					type: CustomizationType.Plugin,
					id: 'file:///plugin-a',
					uri: 'file:///plugin-a',
					name: 'Plugin A',
					enabled: true,
				};
				agent.getOrCreateActiveClient(firstSession, { clientId: 'client-1' }).customizations = [plugin];
				agent.getOrCreateActiveClient(secondSession, { clientId: 'client-2' }).customizations = [plugin];

				const [firstInitial, secondInitial] = await Promise.all([
					agent.getSessionCustomizations(firstSession),
					agent.getSessionCustomizations(secondSession),
				]);
				stateManager.dispatchServerAction(firstSession.toString(), { type: ActionType.SessionCustomizationsChanged, customizations: [...firstInitial] });
				stateManager.dispatchServerAction(secondSession.toString(), { type: ActionType.SessionCustomizationsChanged, customizations: [...secondInitial] });
				stateManager.dispatchServerAction(firstSession.toString(), { type: ActionType.SessionCustomizationToggled, id: plugin.id, enabled: false });

				const [first, second] = await Promise.all([
					agent.getSessionCustomizations(firstSession),
					agent.getSessionCustomizations(secondSession),
				]);
				assert.deepStrictEqual({
					first: first.find(customization => customization.id === plugin.id)?.enabled,
					second: second.find(customization => customization.id === plugin.id)?.enabled,
				}, {
					first: false,
					second: true,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('setClientCustomizations publishes parsed agents in SessionCustomizationUpdated', async () => {
			const fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

			const pluginDir = URI.from({ scheme: Schemas.inMemory, path: '/plugin-a' });
			await fileService.createFolder(URI.joinPath(pluginDir, 'agents'));
			await fileService.writeFile(
				URI.joinPath(pluginDir, 'agents', 'helper.md'),
				VSBuffer.fromString('---\nname: helper-agent\ndescription: helps out\n---\nbody'),
			);

			class PluginDirSpyManager extends TestAgentPluginManager {
				override async syncCustomizations(_clientId: string, customizations: ClientPluginCustomization[]): Promise<ISyncedCustomization[]> {
					return customizations.map(c => ({
						customization: { ...c, load: { kind: CustomizationLoadStatus.Loaded } },
						pluginDir,
					}));
				}
			}

			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const pluginManager = new PluginDirSpyManager();
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, pluginManager, fileService });

			const actions: (SessionAction | ChatAction)[] = [];
			disposables.add(agent.onDidSessionProgress(s => {
				if (s.kind === 'action') {
					actions.push(s.action);
				}
			}));

			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'sync-customizations-test');
				agent.getOrCreateActiveClient(session, { clientId: 'client-1' }).customizations = [{ type: CustomizationType.Plugin, id: customizationId(pluginDir.toString()), uri: pluginDir.toString(), name: 'Plugin A', enabled: true }];

				// Wait for the deferred resolution chain in PluginController.sync.
				await new Promise(r => setTimeout(r, 50));

				const updatesWithChildren = actions
					.filter(a => a.type === ActionType.SessionCustomizationUpdated)
					.filter((a): a is Extract<SessionAction, { type: ActionType.SessionCustomizationUpdated }> => true)
					.filter(a => (a.customization as PluginCustomization).children !== undefined);

				assert.strictEqual(updatesWithChildren.length > 0, true, 'expected SessionCustomizationUpdated to carry parsed children');
				const agentChildren = (updatesWithChildren.at(-1)!.customization as PluginCustomization).children!.filter(c => c.type === CustomizationType.Agent);
				assert.deepStrictEqual(agentChildren, [{
					type: CustomizationType.Agent,
					id: customizationId(URI.joinPath(pluginDir, 'agents', 'helper.md').toString()),
					uri: URI.joinPath(pluginDir, 'agents', 'helper.md').toString(),
					name: 'helper-agent',
					description: 'helps out',
				}]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('getSessionCustomizations publishes discovered files as Directory customizations', async () => {
			const fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

			const agentContent = [
				'---',
				'name: helper',
				'description: helps out',
				'---',
				'agent body',
			];
			const instructionContent = [
				'---',
				'name: nested',
				'description: nested instructions',
				'applyTo: *.ts, *.js',
				'---',
				'instruction body',
			];


			const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
			await fileService.createFolder(URI.joinPath(workspace, '.github', 'agents'));
			await fileService.createFolder(URI.joinPath(workspace, '.github', 'instructions', 'team'));
			const agentFile = URI.joinPath(workspace, '.github', 'agents', 'helper.agent.md');
			const instructionFile = URI.joinPath(workspace, '.github', 'instructions', 'team', 'nested.instructions.md');
			await fileService.writeFile(agentFile, VSBuffer.fromString(agentContent.join('\n')));
			await fileService.writeFile(instructionFile, VSBuffer.fromString(instructionContent.join('\n')));
			const agentsMdFile = URI.joinPath(workspace, 'AGENTS.md');
			await fileService.writeFile(agentsMdFile, VSBuffer.fromString('agents md body'));

			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });

			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'session-discovery-directories');
				await agent.createSession({
					session,
					workingDirectory: workspace,
				});

				const customizations = await agent.getSessionCustomizations(session);
				const discoveredDirectories = customizations.filter(customization => customization.type === CustomizationType.Directory);

				// All discovery roots are returned, even if empty or non-existing
				// Workspace root is included because AGENTS.md was created
				assert.strictEqual(discoveredDirectories.length, 13);
				const expectedUris = [
					// workspace roots
					workspace.toString(),
					URI.joinPath(workspace, '.github', 'agents').toString(),
					URI.joinPath(workspace, '.claude', 'agents').toString(),
					URI.joinPath(workspace, '.github', 'skills').toString(),
					URI.joinPath(workspace, '.agents', 'skills').toString(),
					URI.joinPath(workspace, '.claude', 'skills').toString(),
					URI.joinPath(workspace, '.github', 'instructions').toString(),
					URI.joinPath(workspace, '.github', 'hooks').toString(),
					// user home roots
					URI.from({ scheme: Schemas.inMemory, path: '/mock-home/.copilot/agents' }).toString(),
					URI.from({ scheme: Schemas.inMemory, path: '/mock-home/.agents/skills' }).toString(),
					URI.from({ scheme: Schemas.inMemory, path: '/mock-home/.copilot/skills' }).toString(),
					URI.from({ scheme: Schemas.inMemory, path: '/mock-home/.copilot/instructions' }).toString(),
					URI.from({ scheme: Schemas.inMemory, path: '/mock-home/.copilot/hooks' }).toString(),
				];
				assert.deepStrictEqual(discoveredDirectories.map(customization => customization.uri).sort(), expectedUris.sort());

				const agentDirectory = discoveredDirectories.find(customization => customization.uri === URI.joinPath(workspace, '.github', 'agents').toString());
				assert.ok(agentDirectory);
				assert.strictEqual(agentDirectory.contents, CustomizationType.Agent);
				assert.deepStrictEqual(agentDirectory.children, [{
					type: CustomizationType.Agent,
					id: customizationId(agentFile.toString()),
					uri: agentFile.toString(),
					name: 'helper',
					description: 'helps out',
				}]);

				const instructionDirectory = discoveredDirectories.find(customization => customization.uri === URI.joinPath(workspace, '.github', 'instructions').toString());
				assert.ok(instructionDirectory);
				assert.strictEqual(instructionDirectory.contents, CustomizationType.Rule);
				assert.deepStrictEqual(instructionDirectory.children, [{
					type: CustomizationType.Rule,
					id: customizationId(instructionFile.toString()),
					uri: instructionFile.toString(),
					name: 'nested',
					description: 'nested instructions',
					globs: ['*.ts', '*.js'],
					alwaysApply: undefined,
				}]);

				const agentInstructionsDirectory = discoveredDirectories.find(customization => customization.uri === workspace.toString());
				assert.ok(agentInstructionsDirectory);
				assert.strictEqual(agentInstructionsDirectory.contents, CustomizationType.Rule);
				assert.deepStrictEqual(agentInstructionsDirectory.children, [{
					type: CustomizationType.Rule,
					id: customizationId(agentsMdFile.toString()),
					uri: agentsMdFile.toString(),
					name: 'AGENTS.md',
					alwaysApply: true,
				} satisfies RuleCustomization]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('getSessionCustomizations starts initial discovery without debounce', async () => {
			class StatTrackingFileSystemProvider extends InMemoryFileSystemProvider {
				trackStats = false;
				statCalls = 0;

				override async stat(resource: URI): Promise<IStat> {
					if (this.trackStats) {
						this.statCalls++;
					}
					return super.stat(resource);
				}
			}

			const fileService = disposables.add(new FileService(new NullLogService()));
			const provider = disposables.add(new StatTrackingFileSystemProvider());
			disposables.add(fileService.registerProvider(Schemas.inMemory, provider));
			const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
			await fileService.createFolder(workspace);

			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });

			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'session-discovery-immediate');
				await agent.createSession({ session, workingDirectory: workspace });

				provider.trackStats = true;
				const customizations = agent.getSessionCustomizations(session);
				await timeout(REFRESH_DEBOUNCE_MS + 200);

				assert.notEqual(provider.statCalls, 0, 'expected discovery to start before the debounce interval');
				const resolved = await customizations;
				assert.ok(resolved.length > 0, 'expected discovery to resolve with some customizations');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('getSessionCustomizations clears discovered files when the root disappears', async () => {
			const fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

			const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
			const agentsRoot = URI.joinPath(workspace, '.github', 'agents');
			await fileService.createFolder(agentsRoot);
			await fileService.writeFile(URI.joinPath(agentsRoot, 'helper.agent.md'), VSBuffer.fromString('agent body'));

			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });

			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'session-discovery-cleared');
				await agent.createSession({
					session,
					workingDirectory: workspace,
				});

				const before = await agent.getSessionCustomizations(session);
				const beforeDirs = before.filter(customization => customization.type === CustomizationType.Directory);
				const agentsDirBefore = beforeDirs.find(d => d.uri === agentsRoot.toString());
				assert.ok(agentsDirBefore);
				assert.strictEqual(agentsDirBefore!.children!.length, 1); // has the helper agent file

				await fileService.del(agentsRoot, { recursive: true });

				let after = await agent.getSessionCustomizations(session);
				let afterDirs = after.filter(customization => customization.type === CustomizationType.Directory);
				for (let i = 0; i < 20 && afterDirs.some(d => d.uri === agentsRoot.toString() && (d.children?.length ?? 0) > 0); i++) {
					await new Promise(resolve => setTimeout(resolve, 50));
					after = await agent.getSessionCustomizations(session);
					afterDirs = after.filter(customization => customization.type === CustomizationType.Directory);
				}
				// agentsRoot still appears in discovery (as an empty directory) since it's a discovery root
				const agentsDirAfter = afterDirs.find(d => d.uri === agentsRoot.toString());
				assert.ok(agentsDirAfter);
				assert.strictEqual(agentsDirAfter.children?.length ?? 0, 0); // files are cleared
			} finally {
				await disposeAgent(agent);
			}
		});

		test('getSessionCustomizations does not republish discovered directories when watcher changes are discovery-neutral', async () => {
			const fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

			const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
			const agentsRoot = URI.joinPath(workspace, '.github', 'agents');
			await fileService.createFolder(agentsRoot);
			await fileService.writeFile(URI.joinPath(agentsRoot, 'helper.agent.md'), VSBuffer.fromString('agent body'));

			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });

			const actions: (SessionAction | ChatAction)[] = [];
			disposables.add(agent.onDidSessionProgress(progress => {
				if (progress.kind === 'action') {
					actions.push(progress.action);
				}
			}));

			const countDirectoryPublishesForAgentsRoot = (): number => actions.filter(action => {
				if (action.type === ActionType.SessionCustomizationUpdated) {
					const customization = (action as Extract<SessionAction, { type: ActionType.SessionCustomizationUpdated }>).customization;
					return customization.type === CustomizationType.Directory && customization.uri === agentsRoot.toString();
				}
				if (action.type === ActionType.SessionCustomizationsChanged) {
					const customizations = (action as Extract<SessionAction, { type: ActionType.SessionCustomizationsChanged }>).customizations;
					return customizations.some(customization => customization.type === CustomizationType.Directory && customization.uri === agentsRoot.toString());
				}
				return false;
			}).length;

			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'session-discovery-neutral-watcher-change');
				await agent.createSession({
					session,
					workingDirectory: workspace,
				});

				await agent.getSessionCustomizations(session);
				await new Promise(resolve => setTimeout(resolve, 50));
				const publishCountBefore = countDirectoryPublishesForAgentsRoot();

				// README.md is intentionally excluded from discovered agents.
				await fileService.writeFile(URI.joinPath(agentsRoot, 'README.md'), VSBuffer.fromString('ignored'));

				for (let i = 0; i < 20; i++) {
					await new Promise(resolve => setTimeout(resolve, 50));
					assert.strictEqual(countDirectoryPublishesForAgentsRoot(), publishCountBefore, 'expected no republish when discovery output is unchanged');
				}

				const after = await agent.getSessionCustomizations(session);
				const afterDirs = after.filter(customization => customization.type === CustomizationType.Directory);
				// All discovery roots are discovered (workspace root only if it has AGENTS.md)
				const expectedUris = [
					URI.joinPath(workspace, '.github', 'agents').toString(),
					URI.joinPath(workspace, '.claude', 'agents').toString(),
					URI.joinPath(workspace, '.github', 'skills').toString(),
					URI.joinPath(workspace, '.agents', 'skills').toString(),
					URI.joinPath(workspace, '.claude', 'skills').toString(),
					URI.joinPath(workspace, '.github', 'instructions').toString(),
					URI.joinPath(workspace, '.github', 'hooks').toString(),
					// user home roots
					URI.from({ scheme: Schemas.inMemory, path: '/mock-home/.copilot/agents' }).toString(),
					URI.from({ scheme: Schemas.inMemory, path: '/mock-home/.agents/skills' }).toString(),
					URI.from({ scheme: Schemas.inMemory, path: '/mock-home/.copilot/skills' }).toString(),
					URI.from({ scheme: Schemas.inMemory, path: '/mock-home/.copilot/instructions' }).toString(),
					URI.from({ scheme: Schemas.inMemory, path: '/mock-home/.copilot/hooks' }).toString(),
				];
				assert.deepStrictEqual(afterDirs.map(customization => customization.uri).sort(), expectedUris.sort());
			} finally {
				await disposeAgent(agent);
			}
		});

		test('getSessionCustomizations coalesces burst watcher changes into one discovered refresh publish', async () => {
			const fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

			const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
			const agentsRoot = URI.joinPath(workspace, '.github', 'agents');
			const instructionsRoot = URI.joinPath(workspace, '.github', 'instructions');
			await fileService.createFolder(agentsRoot);
			await fileService.createFolder(instructionsRoot);
			await fileService.writeFile(URI.joinPath(agentsRoot, 'helper-0.agent.md'), VSBuffer.fromString('agent 0'));
			await fileService.writeFile(URI.joinPath(instructionsRoot, 'base.instructions.md'), VSBuffer.fromString('---\napplyTo:\n  - src/**\n---\nbase instruction'));

			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });

			const actions: (SessionAction | ChatAction)[] = [];
			disposables.add(agent.onDidSessionProgress(progress => {
				if (progress.kind === 'action') {
					actions.push(progress.action);
				}
			}));

			type DiscoveredDirectoryCustomization = PluginCustomization & { children: NonNullable<PluginCustomization['children']> };

			const countDiscoveredRefreshPublishes = (): number => actions.filter(action => {
				if (action.type !== ActionType.SessionCustomizationsChanged) {
					return false;
				}
				const customizations = (action as Extract<SessionAction, { type: ActionType.SessionCustomizationsChanged }>).customizations;
				return customizations.some(customization => customization.type === CustomizationType.Directory && customization.uri === agentsRoot.toString())
					&& customizations.some(customization => customization.type === CustomizationType.Directory && customization.uri === instructionsRoot.toString());
			}).length;

			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'session-discovery-burst-watcher-change');
				await agent.createSession({
					session,
					workingDirectory: workspace,
				});

				await agent.getSessionCustomizations(session);
				await new Promise(resolve => setTimeout(resolve, 50));
				const publishCountBeforeBurst = countDiscoveredRefreshPublishes();

				await Promise.all([
					fileService.writeFile(URI.joinPath(agentsRoot, 'helper-1.agent.md'), VSBuffer.fromString('agent 1')),
					fileService.writeFile(URI.joinPath(agentsRoot, 'helper-2.agent.md'), VSBuffer.fromString('agent 2')),
					fileService.writeFile(URI.joinPath(instructionsRoot, 'extra.instructions.md'), VSBuffer.fromString('---\napplyTo:\n  - test/**\n---\nextra instruction')),
				]);

				let discoveredAgentCount = 0;
				let discoveredInstructionCount = 0;
				for (let i = 0; i < 20 && (discoveredAgentCount < 3 || discoveredInstructionCount < 2); i++) {
					await new Promise(resolve => setTimeout(resolve, 50));
					const customizations = await agent.getSessionCustomizations(session);
					const discoveredAgentDirectory = customizations.find((customization): customization is DiscoveredDirectoryCustomization => customization.type === CustomizationType.Directory && customization.uri === agentsRoot.toString());
					const discoveredInstructionDirectory = customizations.find((customization): customization is DiscoveredDirectoryCustomization => customization.type === CustomizationType.Directory && customization.uri === instructionsRoot.toString());
					discoveredAgentCount = discoveredAgentDirectory?.children.filter(child => child.type === CustomizationType.Agent).length ?? 0;
					discoveredInstructionCount = discoveredInstructionDirectory?.children.filter(child => child.type === CustomizationType.Rule).length ?? 0;
				}

				assert.strictEqual(discoveredAgentCount, 3, 'expected agent burst changes to be discovered');
				assert.strictEqual(discoveredInstructionCount, 2, 'expected instruction burst changes to be discovered');
				assert.strictEqual(
					countDiscoveredRefreshPublishes(),
					publishCountBeforeBurst + 1,
					'expected burst watcher changes across folders to result in exactly one discovered refresh publish (_onDidRefresh)'
				);
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	suite('provisional sessions', () => {

		test('createSession does not call client.createSession or create worktrees', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const gitService = new TestAgentHostGitService();
			let clientCreateCalls = 0;
			let worktreeCalls = 0;
			client.createSession = async () => { clientCreateCalls++; throw new Error('SDK not expected'); };
			const origAddWorktree = gitService.addWorktree.bind(gitService);
			gitService.addWorktree = async (...args) => { worktreeCalls++; return origAddWorktree(...args); };

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, gitService });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'prov-1'),
					workingDirectory: URI.file('/workspace'),
					config: { isolation: 'worktree', branch: 'main' },
				});

				assert.strictEqual(result.provisional, true);
				assert.strictEqual(clientCreateCalls, 0, 'client.createSession should not be called for provisional sessions');
				assert.strictEqual(worktreeCalls, 0, 'no worktree should be created for provisional sessions');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('sendMessage on the default chat materializes the parent provisional session', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			let capturedConfig: CopilotCreateSessionOptions | undefined;
			client.createSession = async config => {
				capturedConfig = config;
				return new MockCopilotSession() as unknown as CopilotSession;
			};
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'prov-default-chat'),
					workingDirectory: URI.file('/workspace'),
				});

				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', undefined);

				assert.strictEqual(capturedConfig?.sessionId, 'prov-default-chat');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeSession on provisional session does not touch SDK or worktree', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const gitService = new TestAgentHostGitService();
			let removeWorktreeCalls = 0;
			const origRemoveWorktree = gitService.removeWorktree.bind(gitService);
			gitService.removeWorktree = async (...args) => { removeWorktreeCalls++; return origRemoveWorktree(...args); };

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, gitService });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'prov-2'),
					workingDirectory: URI.file('/workspace'),
				});

				await agent.disposeSession(result.session);

				assert.strictEqual(removeWorktreeCalls, 0, 'no worktree to remove for provisional');
				assert.strictEqual(agent.hasSession(result.session), false);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeSession removes the session from the SDK on-disk store', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'persisted-session-1');
				await agent.disposeSession(session);

				assert.deepStrictEqual(client.deletedSessionIds, ['persisted-session-1']);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeSession on provisional session does not call client.deleteSession', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'prov-3'),
					workingDirectory: URI.file('/workspace'),
				});

				await agent.disposeSession(result.session);

				assert.deepStrictEqual(client.deletedSessionIds, []);
				assert.strictEqual(agent.hasSession(result.session), false);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeSession propagates SDK delete errors and preserves in-memory state', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			client.deleteSession = async () => { throw new Error('boom'); };
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'persisted-session-2');
				await assert.rejects(() => agent.disposeSession(session), /boom/);
			} finally {
				await disposeAgent(agent);
			}
		});

		// Forking a provisional session is no longer a special case: the agent
		// service drops `config.fork` for sources with no turns, so the call
		// reduces to a plain new-session create.

		test('materialization passes VS Code-specific system message to the SDK', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			let capturedConfig: Parameters<ITestCopilotClient['createSession']>[0] | undefined;
			client.createSession = async config => {
				capturedConfig = config;
				return new MockCopilotSession() as unknown as CopilotSession;
			};

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'system-message-session'),
					workingDirectory: URI.file('/workspace'),
				});
				assert.strictEqual(result.provisional, true);

				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', undefined);

				assert.ok(capturedConfig, 'SDK createSession should be called during provisional materialization');
				const systemMessage = capturedConfig.systemMessage;
				assert.deepStrictEqual(systemMessage, {
					...COPILOT_AGENT_HOST_SYSTEM_MESSAGE,
					content: COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS,
				});
				if (!systemMessage || systemMessage.mode !== 'customize') {
					assert.fail('Expected customize-mode system message');
				}
				assert.strictEqual(systemMessage.sections?.identity?.action, 'replace');
				assert.strictEqual(
					systemMessage.sections?.identity?.content,
					'You are an AI assistant using Copilot CLI runtime in VS Code. You help users with software engineering tasks. When asked about your identity, you must state that you are an AI assistant using Copilot CLI runtime in VS Code.'
				);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('materialization forwards the GitHub token to the SDK at the session level (#318693)', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			let capturedConfig: Parameters<ITestCopilotClient['createSession']>[0] | undefined;
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			client.createSession = async config => {
				capturedConfig = config;
				return new MockCopilotSession() as unknown as CopilotSession;
			};

			try {
				await agent.authenticate('https://api.github.com', 'gh-token-abc');

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'session-level-token'),
					workingDirectory: URI.file('/workspace'),
				});
				assert.strictEqual(result.provisional, true);

				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', undefined);

				assert.deepStrictEqual({
					configToken: capturedConfig?.gitHubToken,
				}, {
					configToken: 'gh-token-abc',
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('failed materialization surfaces the create error', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			client.createSession = async () => { throw new Error('create failed'); };
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'gh-token-abc');
				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'failed-session-token'),
					workingDirectory: URI.file('/workspace'),
				});

				await assert.rejects(agent.chats.sendMessage(defaultChatUri(result.session), 'hello', undefined), /create failed/);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('materialization skips managed shell tools when root config disables the custom terminal tool', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			let capturedConfig: Parameters<ITestCopilotClient['createSession']>[0] | undefined;
			client.createSession = async config => {
				capturedConfig = config;
				return new MockCopilotSession() as unknown as CopilotSession;
			};

			const { agent, configurationService } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				configurationService.updateRootConfig({ [CopilotCliConfigKey.EnableCustomTerminalTool]: false });

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'sdk-terminal-defaults'),
					workingDirectory: URI.file('/workspace'),
				});
				assert.strictEqual(result.provisional, true);

				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', undefined);

				assert.deepStrictEqual(capturedConfig?.tools?.map(tool => tool.name), []);
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	suite('onClientToolCallComplete', () => {

		/**
		 * Injects a stub session into the agent's `_sessions` map so we can
		 * observe how `onClientToolCallComplete` resolves URIs to session
		 * entries without standing up a full Copilot SDK session.
		 */
		function installStubSession(agent: CopilotAgent, sessionId: string): { calls: { toolCallId: string; result: ToolCallResult }[] } {
			const calls: { toolCallId: string; result: ToolCallResult }[] = [];
			const stub = {
				handleClientToolCallComplete(toolCallId: string, result: ToolCallResult) {
					calls.push({ toolCallId, result });
				},
				dispose() { },
			};
			setDefaultSessionStub(agent, sessionId, stub);
			return { calls };
		}

		test('routes a top-level session URI to its session entry', async () => {
			const agent = createTestAgent(disposables);
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'session-top');
				const defaultChat = URI.parse(buildDefaultChatUri(sessionUri));
				const { calls } = installStubSession(agent, AgentSession.id(sessionUri));

				const result: ToolCallResult = { success: true, pastTenseMessage: 'did it' };
				agent.onClientToolCallComplete(sessionUri, defaultChat, 'tc-top', result);

				assert.deepStrictEqual(calls, [{ toolCallId: 'tc-top', result }]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('is a no-op when no session entry exists for the resolved id', async () => {
			const agent = createTestAgent(disposables);
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'session-missing');
				const defaultChat = URI.parse(buildDefaultChatUri(sessionUri));
				// No stub installed — the call should be silently ignored.
				agent.onClientToolCallComplete(sessionUri, defaultChat, 'tc-x', { success: true, pastTenseMessage: 'noop' });
			} finally {
				await disposeAgent(agent);
			}
		});

		test('routes a peer chat URI to its chat-session entry', async () => {
			// Client-tool completions for tools running inside an additional
			// (non-default) chat carry both the owning session URI and the
			// chat channel URI. The agent must route by the chat URI to the peer
			// chat hosted on the owning session's entry.
			const agent = createTestAgent(disposables);
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'session-with-peer');
				const chatUri = URI.parse(buildChatUri(sessionUri, 'peer-1'));
				const calls: { toolCallId: string; result: ToolCallResult }[] = [];
				const stub = {
					handleClientToolCallComplete(toolCallId: string, result: ToolCallResult) { calls.push({ toolCallId, result }); },
					dispose() { },
				};
				setPeerChatStub(agent, chatUri, stub);

				const result: ToolCallResult = { success: true, pastTenseMessage: 'peer done' };
				agent.onClientToolCallComplete(sessionUri, chatUri, 'tc-peer', result);

				assert.deepStrictEqual(calls, [{ toolCallId: 'tc-peer', result }]);
			} finally {
				await disposeAgent(agent);
			}
		});
		test('routes the default chat URI to the session entry, not a chat-session', async () => {
			// The default chat is not a peer chat; passing its chat URI must
			// still resolve via `_sessions` by the owning session id. This is
			// the regression that previously hung the agent.
			const agent = createTestAgent(disposables);
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'session-default');
				const defaultChatUri = URI.parse(buildDefaultChatUri(sessionUri));
				const { calls } = installStubSession(agent, AgentSession.id(sessionUri));

				const result: ToolCallResult = { success: true, pastTenseMessage: 'default done' };
				agent.onClientToolCallComplete(sessionUri, defaultChatUri, 'tc-default', result);

				assert.deepStrictEqual(calls, [{ toolCallId: 'tc-default', result }]);
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	suite('peer chat routing and lifecycle', () => {

		/** Installs a stub peer chat into the owning session's entry, keyed by the chat URI. */
		function installStubChat(agent: CopilotAgent, chatUri: URI, options?: { permissionOwner?: string; inputOwner?: string }) {
			const events: string[] = [];
			let disposed = false;
			const stub = {
				respondToPermissionRequest(requestId: string, approved: boolean): boolean {
					if (options?.permissionOwner === requestId) {
						events.push(`perm:${requestId}:${approved}`);
						return true;
					}
					return false;
				},
				respondToUserInputRequest(requestId: string, response: unknown): boolean {
					if (options?.inputOwner === requestId) {
						events.push(`input:${requestId}`);
						return true;
					}
					return false;
				},
				handleClientToolCallComplete() { },
				dispose() { disposed = true; },
			};
			setPeerChatStub(agent, chatUri, stub);
			return { events, isDisposed: () => disposed };
		}

		test('respondToPermissionRequest routes to a peer chat session', async () => {
			const agent = createTestAgent(disposables);
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'session-perm');
				const chatUri = URI.parse(buildChatUri(sessionUri, 'peer-perm'));
				const chat = installStubChat(agent, chatUri, { permissionOwner: 'req-1' });

				agent.respondToPermissionRequest('req-1', true);

				assert.deepStrictEqual(chat.events, ['perm:req-1:true']);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('respondToUserInputRequest routes to a peer chat session', async () => {
			const agent = createTestAgent(disposables);
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'session-input');
				const chatUri = URI.parse(buildChatUri(sessionUri, 'peer-input'));
				const chat = installStubChat(agent, chatUri, { inputOwner: 'req-2' });

				agent.respondToUserInputRequest('req-2', 'submit' as never);

				assert.deepStrictEqual(chat.events, ['input:req-2']);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('setPendingMessages steers the addressed chat, not the session\'s default chat', async () => {
			// Regression for #326244: a steering message submitted in a forked
			// (peer) chat must only reach that chat's SDK session.
			const agent = createTestAgent(disposables);
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'session-steer');
				const chatUri = URI.parse(buildChatUri(sessionUri, 'peer-steer'));
				const steered: string[] = [];
				setDefaultSessionStub(agent, AgentSession.id(sessionUri), {
					sendSteering: async (msg: { id: string }) => { steered.push(`default:${msg.id}`); },
					dispose() { },
				});
				setPeerChatStub(agent, chatUri, {
					sendSteering: async (msg: { id: string }) => { steered.push(`peer:${msg.id}`); },
					dispose() { },
				});

				agent.setPendingMessages(chatUri, { id: 'steer-peer', message: { text: 'stop', origin: { kind: MessageKind.User } } }, []);
				agent.setPendingMessages(URI.parse(buildDefaultChatUri(sessionUri)), { id: 'steer-default', message: { text: 'stop', origin: { kind: MessageKind.User } } }, []);

				assert.deepStrictEqual(steered, ['peer:steer-peer', 'default:steer-default']);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeSession disposes the session\'s peer chats', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'parent-with-peers'),
					workingDirectory: URI.file('/workspace'),
				});
				const chatUri = URI.parse(buildChatUri(result.session, 'peer-x'));
				const chat = installStubChat(agent, chatUri);

				await agent.disposeSession(result.session);

				assert.strictEqual(chat.isDisposed(), true, 'peer chat should be disposed with its parent session');
				assert.strictEqual(hasPeerChatStub(agent, chatUri), false, 'peer chat entry should be removed');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeChat deletes the SDK chat (via legacy fallback) and drops the live backing without rewriting copilot.chats', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'session-dispose-chat');
				const db = sessionDataService.openDatabase(session);
				// A legacy session whose backing still lives in copilot.chats.
				await db.object.setMetadata('copilot.chats', JSON.stringify({
					'peer-a': { sdkSessionId: 'sdk-a' },
				}));
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				const internals = agent as unknown as { _chatBackings: Map<string, unknown> };
				// Materialize the backing first, mirroring the orchestrator's
				// restore handing back the persisted providerData.
				await agent.materializeChat(chatUri, JSON.stringify({ sdkSessionId: 'sdk-a' }));

				await agent.chats.disposeChat(chatUri);

				const remaining = await db.object.getMetadata('copilot.chats');
				assert.deepStrictEqual({
					backingCleared: internals._chatBackings.has(chatUri.toString()),
					deleted: client.deletedSessionIds,
					// The agent no longer owns the durable catalog, so it leaves
					// the legacy blob untouched (orchestrator drops the entry).
					legacyUntouched: remaining ? JSON.parse(remaining) : {},
				}, {
					backingCleared: false,
					deleted: ['sdk-a'],
					legacyUntouched: { 'peer-a': { sdkSessionId: 'sdk-a' } },
				});
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	suite('peer chat create / fork / model+agent / restore round-trip', () => {

		/** Internal surface the multi-chat tests reach into to stub the SDK/agent-session seam. */
		type ChatInternals = {
			_chatBackings: Map<string, { sdkSessionId: string; model?: ModelSelection }>;
			_sessions: Map<string, CopilotSessionEntry>;
			_createAgentSession: (launchPlan: CopilotSessionLaunchPlan, customizationDirectory: URI | undefined, activeClient: unknown, identity?: { sessionUri: URI; chatChannelUri: URI }) => CopilotAgentSession;
			_sessionSequencer: { queue<T>(key: string, task: () => Promise<T>): Promise<T> };
			_forkSdkChat: (client: unknown, sourceEntry: unknown, turnId: string, targetDbDir: URI) => Promise<{ sessionId: string; inheritedTurnCount: number }>;
			_resolveAgentName: (snapshot: IActiveClientSnapshot, agent: AgentSelection) => string | undefined;
		};

		interface IFakeChatRecorder {
			initialized: boolean;
			disposed: boolean;
			readonly remapCalls: ReadonlyMap<string, string>[];
			readonly sends: { prompt: string; turnId: string | undefined; mode: unknown; senderClientId: string | undefined }[];
			readonly resets: { turnId: string; senderClientId: string | undefined }[];
			readonly modelCalls: { id: string }[];
			readonly agentCalls: (string | undefined)[];
		}

		/**
		 * Builds a fake {@link CopilotAgentSession} that records the calls
		 * `createChat`/`sendMessage`/`changeModel`/`changeAgent` route to a peer
		 * chat, so tests can drive the real agent methods while stubbing only the
		 * SDK-backed chat. The `_createAgentSession` seam returns this.
		 */
		function makeFakeChatSession(sessionUri: URI, sdkSessionId: string, getMessages?: () => Promise<readonly Turn[]>, owned?: IDisposable): { rec: IFakeChatRecorder; fake: CopilotAgentSession } {
			const rec: IFakeChatRecorder = {
				initialized: false,
				disposed: false,
				remapCalls: [],
				sends: [],
				resets: [],
				modelCalls: [],
				agentCalls: [],
			};
			const fake = {
				sessionUri,
				sessionId: sdkSessionId,
				appliedSnapshot: { tools: [], plugins: [], mcpServers: {} } satisfies IActiveClientSnapshot,
				async initializeSession(): Promise<void> { rec.initialized = true; },
				async remapTurnIds(mapping: ReadonlyMap<string, string>): Promise<void> { rec.remapCalls.push(mapping); },
				async send(prompt: string, _attachments: unknown, turnId: string | undefined, mode: unknown, senderClientId: string | undefined): Promise<void> {
					rec.sends.push({ prompt, turnId, mode, senderClientId });
				},
				resetTurnState(turnId: string, senderClientId: string | undefined): void { rec.resets.push({ turnId, senderClientId }); },
				async setModel(id: string): Promise<void> { rec.modelCalls.push({ id }); },
				async setAgent(name: string | undefined): Promise<void> { rec.agentCalls.push(name); },
				handleClientToolCallComplete(): void { },
				async getNextTurnEventId(): Promise<string | undefined> { return undefined; },
				getMessages: getMessages ?? (async () => []),
				dispose(): void { rec.disposed = true; owned?.dispose(); },
			} as unknown as CopilotAgentSession;
			return { rec, fake };
		}

		test('createChat materializes a peer chat, records its backing, and returns providerData (no copilot.chats write)', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'create-peer');
				await agent.createSession({ session, workingDirectory: URI.file('/workspace') });

				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				const internals = agent as unknown as ChatInternals;
				let captured: CopilotSessionLaunchPlan | undefined;
				let capturedChannel: URI | undefined;
				let capturedSession: URI | undefined;
				let rec: IFakeChatRecorder | undefined;
				internals._createAgentSession = (launchPlan, _dir, _ac, identity) => {
					captured = launchPlan;
					capturedChannel = identity?.chatChannelUri;
					capturedSession = identity?.sessionUri;
					const built = makeFakeChatSession(session, launchPlan.sessionId, undefined, launchPlan.shellManager);
					rec = built.rec;
					return built.fake;
				};

				const model: ModelSelection = { id: 'gpt-x' };
				const result = await agent.chats.createChat(chatUri, { model });

				const db = sessionDataService.openDatabase(session);
				const raw = await db.object.getMetadata('copilot.chats');
				assert.deepStrictEqual({
					tracked: hasPeerChatStub(agent, chatUri),
					initialized: rec?.initialized,
					session: capturedSession?.toString(),
					channel: capturedChannel?.toString(),
					kind: captured?.kind,
					backing: internals._chatBackings.get(chatUri.toString()),
					providerData: result ? JSON.parse(result.providerData!) : undefined,
					// The orchestrator now owns the durable catalog; the agent no
					// longer writes its private `copilot.chats` metadata.
					legacyCatalogWritten: raw !== undefined,
				}, {
					tracked: true,
					initialized: true,
					session: session.toString(),
					channel: chatUri.toString(),
					kind: 'create',
					backing: { sdkSessionId: captured!.sessionId, model: { id: 'gpt-x' } },
					providerData: { sdkSessionId: captured!.sessionId, model: { id: 'gpt-x' } },
					legacyCatalogWritten: false,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createChat is a no-op for the default chat URI', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'create-default');
				const internals = agent as unknown as ChatInternals;
				internals._createAgentSession = () => { throw new Error('_createAgentSession must not be called for the default chat'); };

				await agent.chats.createChat(URI.parse(buildDefaultChatUri(session)), {});

				assert.deepStrictEqual({
					tracked: peerChatCount(agent),
				}, {
					tracked: 0,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createChat forks the source chat into a new peer chat and returns the forked chat providerData', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'fork-peer');
				await agent.createSession({ session, workingDirectory: URI.file('/workspace') });

				const internals = agent as unknown as ChatInternals;
				// Install the default chat as the fork source so resolution stays
				// in-memory (no SDK resume).
				const source = makeFakeChatSession(session, 'source-sdk');
				setDefaultSessionStub(agent, AgentSession.id(session), source.fake);

				// Stub the SDK/fs fork seam: assert the inputs and hand back a
				// deterministic forked chat id.
				let forkArgs: { sourceEntry: unknown; turnId: string } | undefined;
				internals._forkSdkChat = async (_client, sourceEntry, turnId) => {
					forkArgs = { sourceEntry, turnId };
					return { sessionId: 'forked-sdk-id', inheritedTurnCount: 0 };
				};
				let captured: CopilotSessionLaunchPlan | undefined;
				internals._createAgentSession = (launchPlan) => {
					captured = launchPlan;
					return makeFakeChatSession(session, launchPlan.sessionId, undefined, launchPlan.shellManager).fake;
				};

				const chatUri = URI.parse(buildChatUri(session, 'peer-fork'));
				const result = await agent.chats.fork(chatUri, { source: URI.parse(buildDefaultChatUri(session)), turnId: 't1' });

				const db = sessionDataService.openDatabase(session);
				const raw = await db.object.getMetadata('copilot.chats');
				assert.deepStrictEqual({
					sourceIsDefaultSession: forkArgs?.sourceEntry === source.fake,
					forkedTurnId: forkArgs?.turnId,
					launchKind: captured?.kind,
					launchSessionId: captured?.sessionId,
					tracked: hasPeerChatStub(agent, chatUri),
					backing: internals._chatBackings.get(chatUri.toString()),
					providerData: result ? JSON.parse(result.providerData!) : undefined,
					legacyCatalogWritten: raw !== undefined,
				}, {
					sourceIsDefaultSession: true,
					forkedTurnId: 't1',
					launchKind: 'resume',
					launchSessionId: 'forked-sdk-id',
					tracked: true,
					backing: { sdkSessionId: 'forked-sdk-id' },
					providerData: { sdkSessionId: 'forked-sdk-id' },
					legacyCatalogWritten: false,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createChat side chat forks hidden context and filters inherited turns', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'side-peer');
				await agent.createSession({ session, workingDirectory: URI.file('/workspace') });
				const sourceTurn: Turn = {
					id: 't1',
					state: TurnState.Complete,
					message: { text: 'source', origin: { kind: MessageKind.User } },
					responseParts: [],
					usage: undefined,
				};
				const partialResponse = 'partial source answer';
				const sourceContext = 'User request:\nsource\n\nAgent response:\nsource answer\n\n---\n\nUser request:\nactive source';
				const injectedPrompt = injectSideChatContext('side', partialResponse, sourceContext);
				const sideTurn: Turn = {
					id: 't2',
					state: TurnState.Complete,
					message: { text: injectedPrompt, origin: { kind: MessageKind.User } },
					responseParts: [],
					usage: undefined,
				};
				const source = makeFakeChatSession(session, 'source-sdk', async () => [sourceTurn]);
				setDefaultSessionStub(agent, AgentSession.id(session), source.fake);
				const internals = agent as unknown as ChatInternals;
				internals._forkSdkChat = async () => ({ sessionId: 'side-sdk-id', inheritedTurnCount: 1 });
				let messageReadCount = 0;
				let sideRecorder: IFakeChatRecorder | undefined;
				internals._createAgentSession = launchPlan => {
					const side = makeFakeChatSession(session, launchPlan.sessionId, async () => {
						messageReadCount++;
						return messageReadCount <= 2 ? [sourceTurn] : [sourceTurn, sideTurn];
					}, launchPlan.shellManager);
					sideRecorder = side.rec;
					return side.fake;
				};

				const chatUri = URI.parse(buildChatUri(session, 'peer-side'));
				const sourceLockEntered = new DeferredPromise<void>();
				const releaseSourceLock = new DeferredPromise<void>();
				const sourceLock = internals._sessionSequencer.queue(AgentSession.id(session), async () => {
					sourceLockEntered.complete();
					await releaseSourceLock.p;
				});
				await sourceLockEntered.p;
				let result;
				const createTimeout = timeout(5_000);
				try {
					result = await Promise.race([
						agent.chats.createChat(chatUri, { sideChat: { source: URI.parse(buildDefaultChatUri(session)), turnId: 'active-turn', sourceContext, partialResponse } }),
						createTimeout.then(() => { throw new Error('Side chat creation waited for the source turn lock'); }),
					]);
				} finally {
					createTimeout.cancel();
					releaseSourceLock.complete();
					await sourceLock;
				}
				await agent.chats.sendMessage(chatUri, 'side', undefined, undefined, 't2');
				await agent.chats.sendMessage(chatUri, 'follow-up', undefined, undefined, 't3');
				await agent.chats.changeModel(chatUri, { id: 'gpt-y' });
				const turns = await agent.chats.getMessages(chatUri);

				assert.deepStrictEqual({
					hasExplanationGuidance: sideRecorder?.sends[0]?.prompt.includes('Prefer explanation over action'),
					sentPrompts: sideRecorder?.sends.map(send => send.prompt),
					turns: turns.map(turn => turn.id),
					visiblePrompt: turns[0]?.message.text,
					sideChat: result ? JSON.parse(result.providerData!).sideChat : undefined,
				}, {
					hasExplanationGuidance: true,
					sentPrompts: [injectedPrompt, 'follow-up'],
					turns: ['t2'],
					visiblePrompt: 'side',
					sideChat: { source: buildDefaultChatUri(session), turnId: 'active-turn', inheritedTurnCount: 1, context: sourceContext, partialResponse },
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createChat side chat preserves a local source turn id while forking from the concrete provider anchor', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'side-local-peer');
				await agent.createSession({ session, workingDirectory: URI.file('/workspace') });
				const sourceTurn: Turn = {
					id: 't1',
					state: TurnState.Complete,
					message: { text: 'source', origin: { kind: MessageKind.User } },
					responseParts: [],
					usage: undefined,
				};
				const sourceContext = 'User request:\nsource\n\nAgent response:\nsource answer\n\n---\n\nUser request:\n!command';
				const injectedPrompt = injectSideChatContext('side', undefined, sourceContext);
				const sideTurn: Turn = {
					id: 't2',
					state: TurnState.Complete,
					message: { text: injectedPrompt, origin: { kind: MessageKind.User } },
					responseParts: [],
					usage: undefined,
				};
				const source = makeFakeChatSession(session, 'source-sdk', async () => [sourceTurn]);
				setDefaultSessionStub(agent, AgentSession.id(session), source.fake);
				const internals = agent as unknown as ChatInternals;
				let forkTurnId: string | undefined;
				internals._forkSdkChat = async (_client, _sourceEntry, turnId) => {
					forkTurnId = turnId;
					return { sessionId: 'side-sdk-id', inheritedTurnCount: 1 };
				};
				let messageReadCount = 0;
				let sideRecorder: IFakeChatRecorder | undefined;
				internals._createAgentSession = launchPlan => {
					const side = makeFakeChatSession(session, launchPlan.sessionId, async () => {
						messageReadCount++;
						return messageReadCount <= 2 ? [sourceTurn] : [sourceTurn, sideTurn];
					}, launchPlan.shellManager);
					sideRecorder = side.rec;
					return side.fake;
				};

				const chatUri = URI.parse(buildChatUri(session, 'peer-side-local'));
				const result = await agent.chats.createChat(chatUri, {
					sideChat: {
						source: URI.parse(buildDefaultChatUri(session)),
						turnId: 'local-1',
						providerAnchorTurnId: 't1',
						sourceContext,
					},
				});
				await agent.chats.sendMessage(chatUri, 'side', undefined, undefined, 't2');
				await agent.chats.sendMessage(chatUri, 'follow-up', undefined, undefined, 't3');
				const turns = await agent.chats.getMessages(chatUri);

				assert.deepStrictEqual({
					forkTurnId,
					sentPrompts: sideRecorder?.sends.map(send => send.prompt),
					turns: turns.map(turn => turn.id),
					visiblePrompt: turns[0]?.message.text,
					sideChat: result ? JSON.parse(result.providerData!).sideChat : undefined,
				}, {
					forkTurnId: 't1',
					sentPrompts: [injectedPrompt, 'follow-up'],
					turns: ['t2'],
					visiblePrompt: 'side',
					sideChat: {
						source: buildDefaultChatUri(session),
						turnId: 'local-1',
						providerAnchorTurnId: 't1',
						inheritedTurnCount: 1,
						context: sourceContext,
					},
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('sendMessage routes a turn to the targeted peer chat only', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'route-msg');
				const chatA = URI.parse(buildChatUri(session, 'peer-a'));
				const chatB = URI.parse(buildChatUri(session, 'peer-b'));
				const a = makeFakeChatSession(session, 'sdk-a');
				const b = makeFakeChatSession(session, 'sdk-b');
				setPeerChatStub(agent, chatA, a.fake);
				setPeerChatStub(agent, chatB, b.fake);

				await agent.chats.sendMessage(chatA, 'hello-a', undefined, undefined, 'turn-a', 'client-1');

				assert.deepStrictEqual({
					aSends: a.rec.sends.map(s => ({ prompt: s.prompt, turnId: s.turnId, senderClientId: s.senderClientId })),
					aResets: a.rec.resets,
					bSends: b.rec.sends,
					bResets: b.rec.resets,
				}, {
					aSends: [{ prompt: 'hello-a', turnId: 'turn-a', senderClientId: 'client-1' }],
					aResets: [{ turnId: 'turn-a', senderClientId: 'client-1' }],
					bSends: [],
					bResets: [],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('sendMessage throws for a peer chat with no backing chat', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'route-ghost');
				const chatUri = URI.parse(buildChatUri(session, 'ghost'));
				await assert.rejects(
					() => agent.chats.sendMessage(chatUri, 'hi', undefined),
					/unknown chat/,
				);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('changeModel applies to the targeted peer chat only', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'model-route');
				const chatA = URI.parse(buildChatUri(session, 'peer-a'));
				const chatB = URI.parse(buildChatUri(session, 'peer-b'));
				const a = makeFakeChatSession(session, 'sdk-a');
				const b = makeFakeChatSession(session, 'sdk-b');
				setPeerChatStub(agent, chatA, a.fake);
				setPeerChatStub(agent, chatB, b.fake);

				await agent.chats.changeModel(chatA, { id: 'model-x' });

				assert.deepStrictEqual({
					aModels: a.rec.modelCalls.map(m => m.id),
					bModels: b.rec.modelCalls.map(m => m.id),
				}, {
					aModels: ['model-x'],
					bModels: [],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('changeAgent resolves and applies the agent to the targeted peer chat, and clears it with undefined', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'agent-route');
				const chatA = URI.parse(buildChatUri(session, 'peer-a'));
				const a = makeFakeChatSession(session, 'sdk-a');
				const internals = agent as unknown as ChatInternals;
				setPeerChatStub(agent, chatA, a.fake);
				internals._resolveAgentName = (_snapshot, selection) => selection.uri === 'agent://x' ? 'Resolved Agent' : undefined;

				await agent.chats.changeAgent(chatA, { uri: 'agent://x' });
				await agent.chats.changeAgent(chatA, undefined);

				assert.deepStrictEqual(a.rec.agentCalls, ['Resolved Agent', undefined]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('round-trips peer chats through providerData + materializeChat and resumes per-chat history after a restart', async () => {
			// A single session data service is shared across the two agent
			// instances to model the on-disk store surviving a process restart.
			const sessionDataService = disposables.add(new TestSessionDataService());
			const session = AgentSession.uri('copilotcli', 'restore-rt');
			const created: Record<string, string> = {};
			const providerData: Record<string, string> = {};

			// ---- process #1: create two peer chats, capturing the opaque
			// providerData blob the orchestrator would persist for each ----
			const agent1 = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent1.authenticate('https://api.github.com', 'token');
				await agent1.createSession({ session, workingDirectory: URI.file('/workspace') });
				const internals1 = agent1 as unknown as ChatInternals;
				internals1._createAgentSession = (launchPlan, _dir, _ac, identity) => {
					if (identity) {
						created[identity.chatChannelUri.authority] = launchPlan.sessionId;
					}
					return makeFakeChatSession(session, launchPlan.sessionId, undefined, launchPlan.shellManager).fake;
				};
				const peerAUri = URI.parse(buildChatUri(session, 'peer-a'));
				const peerBUri = URI.parse(buildChatUri(session, 'peer-b'));
				const resA = await agent1.chats.createChat(peerAUri, {});
				const resB = await agent1.chats.createChat(peerBUri, {});
				providerData['peer-a'] = resA!.providerData!;
				providerData['peer-b'] = resB!.providerData!;
			} finally {
				await disposeAgent(agent1);
			}

			// ---- process #2: fresh agent, empty in-memory state ----
			const agent2 = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent2.authenticate('https://api.github.com', 'token');
				// The orchestrator re-creates the (provisional) parent session on
				// restore; this seeds the working directory the peer-chat resume
				// path needs.
				await agent2.createSession({ session, workingDirectory: URI.file('/workspace') });

				const internals2 = agent2 as unknown as ChatInternals;
				const peerA = URI.parse(buildChatUri(session, 'peer-a'));
				const peerB = URI.parse(buildChatUri(session, 'peer-b'));
				// The orchestrator hands each persisted blob back to the agent.
				await agent2.materializeChat(peerA, providerData['peer-a']);
				await agent2.materializeChat(peerB, providerData['peer-b']);

				const peerAHistory: readonly Turn[] = [{ id: 'turn-1' } as unknown as Turn];
				let resumed: CopilotSessionLaunchPlan | undefined;
				internals2._createAgentSession = (launchPlan) => {
					resumed = launchPlan;
					return makeFakeChatSession(session, launchPlan.sessionId, async () => peerAHistory, launchPlan.shellManager).fake;
				};

				await agent2.chats.sendMessage(peerA, 'after restart', undefined);
				const history = await getPeerChatStub(agent2, peerA)!.getMessages();

				assert.deepStrictEqual({
					materializedBackings: [internals2._chatBackings.get(peerA.toString()), internals2._chatBackings.get(peerB.toString())],
					resumeKind: resumed?.kind,
					resumeSessionId: resumed?.sessionId,
					expectedSessionId: created['peer-a'],
					historyLen: history.length,
					tracked: hasPeerChatStub(agent2, peerA),
				}, {
					materializedBackings: [{ sdkSessionId: created['peer-a'] }, { sdkSessionId: created['peer-b'] }],
					resumeKind: 'resume',
					resumeSessionId: created['peer-a'],
					expectedSessionId: created['peer-a'],
					historyLen: 1,
					tracked: true,
				});
			} finally {
				await disposeAgent(agent2);
			}
		});

		test('materializeChat falls back to the legacy copilot.chats catalog when providerData is undefined', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'legacy-materialize');
				const db = sessionDataService.openDatabase(session);
				await db.object.setMetadata('copilot.chats', JSON.stringify({
					'peer-a': { sdkSessionId: 'legacy-sdk', model: { id: 'gpt-legacy' } },
				}));
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				const internals = agent as unknown as ChatInternals;

				// undefined blob -> agent recovers the backing from its own catalog.
				await agent.materializeChat(chatUri, undefined);
				// A corrupt blob is dropped (no backing recorded).
				const corruptUri = URI.parse(buildChatUri(session, 'peer-corrupt'));
				await agent.materializeChat(corruptUri, 'not json');

				assert.deepStrictEqual({
					legacy: internals._chatBackings.get(chatUri.toString()),
					corrupt: internals._chatBackings.has(corruptUri.toString()),
				}, {
					legacy: { sdkSessionId: 'legacy-sdk', model: { id: 'gpt-legacy' } },
					corrupt: false,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('changeModel on a peer chat refreshes its backing and fires onDidChangeChatData', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'model-blob');
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				const internals = agent as unknown as ChatInternals;
				setPeerChatStub(agent, chatUri, makeFakeChatSession(session, 'sdk-a').fake);
				internals._chatBackings.set(chatUri.toString(), { sdkSessionId: 'sdk-a' });

				const events: { chat: string; providerData: unknown }[] = [];
				disposables.add(agent.onDidChangeChatData(e => events.push({ chat: e.chat.toString(), providerData: JSON.parse(e.providerData) })));

				await agent.chats.changeModel(chatUri, { id: 'model-x' });

				assert.deepStrictEqual({
					backing: internals._chatBackings.get(chatUri.toString()),
					events,
				}, {
					backing: { sdkSessionId: 'sdk-a', model: { id: 'model-x' } },
					events: [{ chat: chatUri.toString(), providerData: { sdkSessionId: 'sdk-a', model: { id: 'model-x' } } }],
				});
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	// The chat-addressed surface ({@link IAgent.chats}) is a thin adapter over
	// the legacy `(session, chat?)` methods. These tests verify it resolves a
	// single chat URI back to the right `(session, chat)` target — a peer
	// `ahp-chat` URI keeps its own identity, a session URI maps to the
	// session's default chat — and then delegates to the legacy implementation.
	suite('chat surface (IAgentChats)', () => {

		type ConvInternals = {
			_sessions: Map<string, CopilotSessionEntry>;
			_provisionalSessions: Map<string, unknown>;
			_createAgentSession: (launchPlan: CopilotSessionLaunchPlan, dir: URI | undefined, activeClient: unknown, identity?: { sessionUri: URI; chatChannelUri: URI }) => CopilotAgentSession;
		};

		interface IFakeConvRecorder {
			readonly sends: { prompt: string; turnId: string | undefined; senderClientId: string | undefined }[];
			readonly resets: { turnId: string; senderClientId: string | undefined }[];
			readonly modelCalls: string[];
			readonly agentCalls: (string | undefined)[];
			aborted: number;
			disposed: boolean;
		}

		/**
		 * Installs a recording fake {@link CopilotAgentSession} as a peer chat
		 * (hosted on the owning session's entry) or as a session's default chat,
		 * keyed as the real agent would, so the chat adapter can drive
		 * the real legacy methods.
		 */
		function installFake(agent: CopilotAgent, key: string, target: 'chat' | 'session', sessionUri: URI): IFakeConvRecorder {
			const rec: IFakeConvRecorder = { sends: [], resets: [], modelCalls: [], agentCalls: [], aborted: 0, disposed: false };
			const fake = {
				sessionUri,
				sessionId: `sdk-${key}`,
				appliedSnapshot: { tools: [], plugins: [], mcpServers: {} } satisfies IActiveClientSnapshot,
				async send(prompt: string, _attachments: unknown, turnId: string | undefined, _mode: unknown, senderClientId: string | undefined): Promise<void> {
					rec.sends.push({ prompt, turnId, senderClientId });
				},
				resetTurnState(turnId: string, senderClientId: string | undefined): void { rec.resets.push({ turnId, senderClientId }); },
				async setModel(id: string): Promise<void> { rec.modelCalls.push(id); },
				async setAgent(name: string | undefined): Promise<void> { rec.agentCalls.push(name); },
				async abort(): Promise<void> { rec.aborted++; },
				async getMessages(): Promise<readonly Turn[]> { return [{ id: `turn-${key}` } as unknown as Turn]; },
				handleClientToolCallComplete(): void { },
				dispose(): void { rec.disposed = true; },
			} as unknown as CopilotAgentSession;
			if (target === 'chat') {
				setPeerChatStub(agent, URI.parse(key), fake);
			} else {
				setDefaultSessionStub(agent, key, fake);
			}
			return rec;
		}

		/**
		 * Stubs `_createAgentSession` (the SDK-backed launch seam) so peer-chat
		 * creation/fork stays in-memory: it returns a minimal fake whose
		 * `sessionId` echoes the launch plan, which is what `createChat` records
		 * as the chat's backing.
		 */
		function stubBackingSession(agent: CopilotAgent): void {
			(agent as unknown as ConvInternals)._createAgentSession = (launchPlan, _dir, _ac, identity) => {
				return {
					sessionUri: identity?.sessionUri ?? AgentSession.uri('copilotcli', launchPlan.sessionId),
					sessionId: launchPlan.sessionId,
					appliedSnapshot: { tools: [], plugins: [], mcpServers: {} } satisfies IActiveClientSnapshot,
					async initializeSession(): Promise<void> { },
					async remapTurnIds(): Promise<void> { },
					async getMessages(): Promise<readonly Turn[]> { return []; },
					handleClientToolCallComplete(): void { },
					dispose(): void { launchPlan.shellManager?.dispose(); },
				} as unknown as CopilotAgentSession;
			};
		}

		test('createSession mints a provisional session', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				const session = AgentSession.uri('copilotcli', 'scope-create');
				const result = await agent.createSession({ session, workingDirectory: URI.file('/workspace') });
				const internals = agent as unknown as ConvInternals;
				assert.deepStrictEqual({
					session: result.session.toString(),
					provisional: internals._provisionalSessions.has(AgentSession.id(session)),
				}, {
					session: session.toString(),
					provisional: true,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeSession tears down a provisional session', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				const session = AgentSession.uri('copilotcli', 'scope-dispose');
				await agent.createSession({ session, workingDirectory: URI.file('/workspace') });
				const internals = agent as unknown as ConvInternals;
				assert.strictEqual(internals._provisionalSessions.has(AgentSession.id(session)), true);

				await agent.disposeSession(session);

				assert.strictEqual(internals._provisionalSessions.has(AgentSession.id(session)), false);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createChat creates a peer chat and returns its providerData', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'conv-create');
				await agent.createSession({ session, workingDirectory: URI.file('/workspace') });
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));

				stubBackingSession(agent);
				const result = await agent.chats.createChat(chatUri, { model: { id: 'gpt-x' } });

				assert.deepStrictEqual({
					tracked: hasPeerChatStub(agent, chatUri),
					hasProviderData: !!(result && result.providerData),
					model: result ? (JSON.parse(result.providerData!) as { model?: ModelSelection }).model : undefined,
				}, {
					tracked: true,
					hasProviderData: true,
					model: { id: 'gpt-x' },
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('fork delegates to createChat with the fork source', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'conv-fork');
				await agent.createSession({ session, workingDirectory: URI.file('/workspace') });
				installFake(agent, AgentSession.id(session), 'session', session);

				const forkArgs: { turnId: string }[] = [];
				(agent as unknown as { _forkSdkChat: (client: unknown, sourceEntry: unknown, turnId: string) => Promise<{ sessionId: string; inheritedTurnCount: number }> })._forkSdkChat = async (_c, _s, turnId) => {
					forkArgs.push({ turnId });
					return { sessionId: 'forked-sdk-id', inheritedTurnCount: 0 };
				};
				stubBackingSession(agent);

				const chatUri = URI.parse(buildChatUri(session, 'peer-fork'));
				const source: IAgentCreateChatForkSource = { source: URI.parse(buildDefaultChatUri(session)), turnId: 't1' };
				const result = await agent.chats.fork(chatUri, source);

				assert.deepStrictEqual({
					forkArgs,
					tracked: hasPeerChatStub(agent, chatUri),
					providerData: result ? JSON.parse(result.providerData!) : undefined,
				}, {
					forkArgs: [{ turnId: 't1' }],
					tracked: true,
					providerData: { sdkSessionId: 'forked-sdk-id' },
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('sendMessage routes a peer chat URI to the peer chat', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'conv-send-peer');
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				const rec = installFake(agent, chatUri.toString(), 'chat', session);

				await agent.chats.sendMessage(chatUri, 'hello-peer', undefined, undefined, 'turn-1', 'client-1');

				assert.deepStrictEqual({
					sends: rec.sends,
					resets: rec.resets,
				}, {
					sends: [{ prompt: 'hello-peer', turnId: 'turn-1', senderClientId: 'client-1' }],
					resets: [{ turnId: 'turn-1', senderClientId: 'client-1' }],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('sendMessage routes a scope (session) URI to the default chat', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'conv-send-default');
				const rec = installFake(agent, AgentSession.id(session), 'session', session);

				await agent.chats.sendMessage(defaultChatUri(session), 'hello-default', undefined, undefined, 'turn-d', 'client-d');

				assert.deepStrictEqual(rec.sends, [{ prompt: 'hello-default', turnId: 'turn-d', senderClientId: 'client-d' }]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('abort, changeModel, and changeAgent route a peer URI to the peer chat', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'conv-ops');
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				const rec = installFake(agent, chatUri.toString(), 'chat', session);
				(agent as unknown as { _resolveAgentName: (snap: IActiveClientSnapshot, a: AgentSelection) => string | undefined })._resolveAgentName = (_snap, sel) => sel.uri === 'agent://x' ? 'Resolved Agent' : undefined;

				await agent.chats.abort(chatUri);
				await agent.chats.changeModel(chatUri, { id: 'model-x' });
				await agent.chats.changeAgent(chatUri, { uri: 'agent://x' });
				await agent.chats.changeAgent(chatUri, undefined);

				assert.deepStrictEqual({
					aborted: rec.aborted,
					modelCalls: rec.modelCalls,
					agentCalls: rec.agentCalls,
				}, {
					aborted: 1,
					modelCalls: ['model-x'],
					agentCalls: ['Resolved Agent', undefined],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('getMessages returns the peer chat history', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'conv-history');
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				installFake(agent, chatUri.toString(), 'chat', session);

				const turns = await agent.chats.getMessages(chatUri);

				assert.deepStrictEqual(turns.map(t => t.id), [`turn-${chatUri.toString()}`]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeChat disposes the peer chat', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'conv-dispose');
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				const rec = installFake(agent, chatUri.toString(), 'chat', session);

				await agent.chats.disposeChat(chatUri);

				assert.deepStrictEqual({
					disposed: rec.disposed,
					tracked: hasPeerChatStub(agent, chatUri),
					deleted: client.deletedSessionIds,
				}, {
					disposed: true,
					tracked: false,
					deleted: ['sdk-' + chatUri.toString()],
				});
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	// Regression for the #319516 incident: a window reload reconnects with a
	// NEW clientId but an identical tool list. The cached SDK session's
	// staleness check (`ActiveClient.requiresRestart`) must NOT treat a
	// clientId-only change as a config change — otherwise either the session
	// is needlessly restarted, or (the actual bug) the cached session is
	// reused while the live clientId is never updated, so subsequent client
	// tool calls are stamped with the dead window's id and hang forever.
	suite('client tool refresh on reload (#319516)', () => {
		/** Minimal structural view of the agent's private per-session ActiveClient. */
		type TestActiveClient = {
			readonly toolSet: { ownerOf(toolName: string): string | undefined };
			snapshot(): Promise<IActiveClientSnapshot>;
			requiresRestart(snap: IActiveClientSnapshot): Promise<boolean>;
		};

		function getActiveClient(agent: CopilotAgent, session: URI): TestActiveClient {
			const activeClients = (agent as unknown as { _activeClients: { get(s: URI): TestActiveClient | undefined } })._activeClients;
			const activeClient = activeClients.get(session);
			assert.ok(activeClient, 'expected an ActiveClient to exist after registering client tools');
			return activeClient;
		}

		const tools: ToolDefinition[] = [{ name: 'my_tool', description: 'A test tool', inputSchema: { type: 'object', properties: {} } }];

		test('clientId-only change (reload) does NOT require a restart and updates the live owner', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'reload-session');

				// Window A registers its tools; this is the snapshot the SDK
				// session would be created with.
				agent.getOrCreateActiveClient(session, { clientId: 'client-A' }).tools = tools;
				const activeClient = getActiveClient(agent, session);
				const appliedSnapshot = await activeClient.snapshot();
				assert.strictEqual(activeClient.toolSet.ownerOf('my_tool'), 'client-A');

				// Window A reloads: window B reconnects with a new clientId but
				// the identical tool list. The reload removes A then adds B.
				agent.removeActiveClient(session, 'client-A');
				agent.getOrCreateActiveClient(session, { clientId: 'client-B' }).tools = [...tools];

				// Root-cause assertions: the cached SDK session must be reused
				// (no restart) AND the live owner must now be window B's, so
				// the next client tool call is stamped with a live owner.
				assert.strictEqual(await activeClient.requiresRestart(appliedSnapshot), false);
				assert.strictEqual(activeClient.toolSet.ownerOf('my_tool'), 'client-B');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('a structural tool change still requires a restart', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'tools-change-session');

				agent.getOrCreateActiveClient(session, { clientId: 'client-A' }).tools = tools;
				const activeClient = getActiveClient(agent, session);
				const appliedSnapshot = await activeClient.snapshot();

				// A genuinely different tool set (added tool) must restart so the
				// SDK session is rebuilt with the new tools.
				agent.getOrCreateActiveClient(session, { clientId: 'client-A' }).tools = [...tools, { name: 'second_tool', description: 'another', inputSchema: { type: 'object', properties: {} } }];

				assert.strictEqual(await activeClient.requiresRestart(appliedSnapshot), true);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('multiple active clients merge their tools and removal isolates per client', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'multi-client-session');

				// Two clients each contribute their own tool plus a shared one.
				agent.getOrCreateActiveClient(session, { clientId: 'client-A' }).tools = [
					{ name: 'shared', description: 'from A', inputSchema: { type: 'object', properties: {} } },
					{ name: 'a_tool', description: 'A only', inputSchema: { type: 'object', properties: {} } },
				];
				agent.getOrCreateActiveClient(session, { clientId: 'client-B' }).tools = [
					{ name: 'shared', description: 'from B', inputSchema: { type: 'object', properties: {} } },
					{ name: 'b_tool', description: 'B only', inputSchema: { type: 'object', properties: {} } },
				];
				const activeClient = getActiveClient(agent, session);

				// The SDK snapshot merges both clients, deduping the shared name
				// in favor of the first-inserted client (A), and ownership maps
				// each tool to its contributing client.
				const merged = await activeClient.snapshot();
				assert.deepStrictEqual(merged.tools.map(t => t.name), ['shared', 'a_tool', 'b_tool']);
				assert.strictEqual(activeClient.toolSet.ownerOf('shared'), 'client-A');
				assert.strictEqual(activeClient.toolSet.ownerOf('a_tool'), 'client-A');
				assert.strictEqual(activeClient.toolSet.ownerOf('b_tool'), 'client-B');

				// Removing client A keeps B's contribution and hands the shared
				// tool to B (now the sole provider).
				agent.removeActiveClient(session, 'client-A');
				const afterRemoval = await activeClient.snapshot();
				assert.deepStrictEqual(afterRemoval.tools.map(t => t.name), ['shared', 'b_tool']);
				assert.strictEqual(activeClient.toolSet.ownerOf('shared'), 'client-B');
				assert.strictEqual(activeClient.toolSet.ownerOf('a_tool'), undefined);
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	suite('config-driven session refresh', () => {
		test('waits for the previous SDK session to disconnect before resuming', async () => {
			const client = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { copilotClient: client });
			const sessionId = 'config-refresh-session';
			const session = AgentSession.uri('copilotcli', sessionId);
			const disconnectStarted = new DeferredPromise<void>();
			const allowDisconnect = new DeferredPromise<void>();
			const order: string[] = [];
			const previousSession = {
				appliedSnapshot: { tools: [], plugins: [], mcpServers: {} },
				destroySession: async () => {
					order.push('disconnect-started');
					disconnectStarted.complete();
					await allowDisconnect.p;
					order.push('disconnect-finished');
				},
				dispose: () => order.push('previous-disposed'),
			} as unknown as CopilotAgentSession;
			const resumedSession = {
				send: async () => { order.push('send'); },
				dispose: () => { },
			} as unknown as CopilotAgentSession;
			const internals = agent as unknown as {
				_resumeSession: (id: string) => Promise<CopilotAgentSession>;
			};

			setDefaultSessionStub(agent, sessionId, previousSession);
			agent.getOrCreateActiveClient(session, { clientId: 'client' }).tools = [
				{ name: 'new_tool', description: 'A newly registered tool', inputSchema: { type: 'object', properties: {} } },
			];
			internals._resumeSession = async id => {
				assert.strictEqual(id, sessionId);
				order.push('resume');
				setDefaultSessionStub(agent, sessionId, resumedSession);
				return resumedSession;
			};

			try {
				const send = agent.chats.sendMessage(defaultChatUri(session), 'hello', undefined);
				await disconnectStarted.p;
				assert.deepStrictEqual(order, ['disconnect-started']);

				allowDisconnect.complete();
				await send;
				assert.deepStrictEqual(order, [
					'disconnect-started',
					'disconnect-finished',
					'previous-disposed',
					'resume',
					'send',
				]);
			} finally {
				allowDisconnect.complete();
				await disposeAgent(agent);
			}
		});
	});

	suite('_resumeSession dedup', () => {
		// Regression: two concurrent paths (e.g. an outdated-config refresh in
		// `sendMessage` and a `getSessionMessages` subscribe) each calling
		// `_resumeSession(id)` used to construct two `CopilotAgentSession`
		// entries for the same id; the second `_sessions.set(id, …)` on the
		// underlying `DisposableMap` disposed the first one mid
		// `initializeSession()`, producing 'Trying to add a disposable to a
		// DisposableStore that has already been disposed' warnings and a
		// half-initialised session with no event subscriptions.

		type AgentInternals = {
			_resumeSession: (id: string) => Promise<CopilotAgentSession>;
			_doResumeSession: (id: string) => Promise<CopilotAgentSession>;
		};
		const makeFakeSession = () => ({ dispose: () => { } } as unknown as CopilotAgentSession);

		test('dedupes concurrent calls for the same sessionId', async () => {
			const agent = createTestAgent(disposables);
			const internals = agent as unknown as AgentInternals;
			const deferred = new DeferredPromise<CopilotAgentSession>();
			let doResumeCalls = 0;
			internals._doResumeSession = () => {
				doResumeCalls++;
				return deferred.p;
			};
			try {
				const p1 = internals._resumeSession('s1');
				const p2 = internals._resumeSession('s1');
				assert.strictEqual(p1, p2);
				assert.strictEqual(doResumeCalls, 1);

				const session = makeFakeSession();
				deferred.complete(session);
				assert.strictEqual(await p1, session);
				assert.strictEqual(await p2, session);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('clears inflight entry after resolution so the next call re-invokes _doResumeSession', async () => {
			const agent = createTestAgent(disposables);
			const internals = agent as unknown as AgentInternals;
			let doResumeCalls = 0;
			internals._doResumeSession = async () => {
				doResumeCalls++;
				return makeFakeSession();
			};
			try {
				await internals._resumeSession('s1');
				await internals._resumeSession('s1');
				assert.strictEqual(doResumeCalls, 2);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('clears inflight entry on rejection so the next call retries', async () => {
			const agent = createTestAgent(disposables);
			const internals = agent as unknown as AgentInternals;
			let attempt = 0;
			internals._doResumeSession = async () => {
				attempt++;
				if (attempt === 1) {
					throw new Error('first failed');
				}
				return makeFakeSession();
			};
			try {
				await assert.rejects(() => internals._resumeSession('s1'), /first failed/);
				await internals._resumeSession('s1');
				assert.strictEqual(attempt, 2);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('does not dedupe across different sessionIds', async () => {
			const agent = createTestAgent(disposables);
			const internals = agent as unknown as AgentInternals;
			const ids: string[] = [];
			internals._doResumeSession = async (id: string) => {
				ids.push(id);
				return makeFakeSession();
			};
			try {
				await Promise.all([
					internals._resumeSession('s1'),
					internals._resumeSession('s2'),
				]);
				assert.deepStrictEqual([...ids].sort(), ['s1', 's2']);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('post-init shutdown race: disposes the session and throws CancellationError instead of registering on a disposed _sessions map', async () => {
			// Without this guard an in-flight `_resumeSession` /
			// `_materializeProvisional` whose `initializeSession()`
			// resolves AFTER `dispose()` -> `shutdown()` -> `super.dispose()`
			// has run would call `_sessions.set(...)` on a disposed
			// DisposableMap, leaking the session and reproducing the
			// 'Trying to add a disposable to a DisposableStore that has
			// already been disposed' warning this PR exists to eliminate.
			const agent = createTestAgent(disposables);
			const internals = agent as unknown as {
				_registerInitializedSession: (id: string, s: CopilotAgentSession) => void;
				_shutdownPromise: Promise<void> | undefined;
			};
			let disposed = 0;
			const fakeSession = { dispose: () => { disposed++; } } as unknown as CopilotAgentSession;
			internals._shutdownPromise = Promise.resolve();
			try {
				assert.throws(
					() => internals._registerInitializedSession('s1', fakeSession),
					(err: unknown) => isCancellationError(err),
				);
				assert.strictEqual(disposed, 1, 'session should be disposed by the guard');
			} finally {
				// Clear the fake shutdown promise so disposeAgent doesn't
				// short-circuit and leave real state behind.
				internals._shutdownPromise = undefined;
				await disposeAgent(agent);
			}
		});

		test('shutdown during resume cancels the in-flight resume', async () => {
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/resume-telemetry-shutdown-`);
			const client = new TestCopilotClient([sdkSession('s1', workingDirectory)]);
			const deferredSession = new DeferredPromise<CopilotSession>();
			let resumeCalled = false;
			client.resumeSession = () => {
				resumeCalled = true;
				return deferredSession.p;
			};
			const agent = createTestAgent(disposables, {
				copilotClient: client,
				useRealResumePath: true,
				sessionDataService: disposables.add(new TestSessionDataService()),
			});
			const internals = agent as unknown as { _resumeSession: (id: string) => Promise<CopilotAgentSession> };
			try {
				await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'token');
				const resumePromise = internals._resumeSession('s1');
				for (let i = 0; i < 200 && !resumeCalled; i++) {
					await timeout(0);
				}
				assert.strictEqual(resumeCalled, true);

				await agent.shutdown();
				deferredSession.complete(new MockCopilotSession() as unknown as CopilotSession);

				await assert.rejects(resumePromise, (error: unknown) => isCancellationError(error));
			} finally {
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});
	});

	suite('_resumeSession fallback', () => {
		type AgentInternals = {
			_resumeSession: (id: string) => Promise<CopilotAgentSession>;
		};

		test('does not restore a persisted custom agent that is absent from the current plugin snapshot', async () => {
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/resume-agent-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const session = AgentSession.uri('copilotcli', 's1');
			const dbRef = sessionDataService.openDatabase(session);
			try {
				await dbRef.object.setMetadata('copilot.workingDirectory', URI.file(workingDirectory).toString());
				await dbRef.object.setMetadata('copilot.agent', JSON.stringify({ uri: 'file:///old-client/data.md' }));
			} finally {
				dbRef.dispose();
			}

			const client = new TestCopilotClient([sdkSession('s1', workingDirectory)]);
			const resumeAgents: (string | undefined)[] = [];
			client.resumeSession = async (_sessionId, options) => {
				resumeAgents.push(options?.agent);
				return new MockCopilotSession() as unknown as CopilotSession;
			};
			const agent = createTestAgent(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService });
			const internals = agent as unknown as AgentInternals;
			try {
				await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'token');
				await internals._resumeSession('s1');
				assert.deepStrictEqual(resumeAgents, [undefined]);
			} finally {
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('retries resume without a custom agent when the SDK reports the stored agent is missing', async () => {
			const fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

			const repo = URI.from({ scheme: Schemas.inMemory, path: '/repo' });
			const dataAgent = URI.joinPath(repo, '.github', 'agents', 'data.md');
			await fileService.writeFile(dataAgent, VSBuffer.fromString('---\nname: Data\ndescription: data queries\n---\nbody'));

			const sessionDataService = disposables.add(new TestSessionDataService());
			const session = AgentSession.uri('copilotcli', 's1');
			const dbRef = sessionDataService.openDatabase(session);
			try {
				await dbRef.object.setMetadata('copilot.workingDirectory', repo.toString());
				await dbRef.object.setMetadata('copilot.agent', JSON.stringify({ uri: dataAgent.toString() }));
			} finally {
				dbRef.dispose();
			}

			const client = new TestCopilotClient([sdkSession('s1')]);
			const resumeAgents: (string | undefined)[] = [];
			client.resumeSession = async (_sessionId, options) => {
				resumeAgents.push(options?.agent);
				if (resumeAgents.length === 1) {
					throw new TestSdkError(`Request session.resume failed with message: Custom agent 'Data' not found`, -32603);
				}
				return new MockCopilotSession() as unknown as CopilotSession;
			};
			client.createSession = async () => {
				throw new Error('createSession should not be called');
			};

			const agent = createTestAgent(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService, fileService });
			const internals = agent as unknown as AgentInternals;
			try {
				await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'token');
				await internals._resumeSession('s1');
				assert.deepStrictEqual(resumeAgents, ['Data', undefined]);
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	suite('customization anchoring', () => {

		test('rebaseUnder rebases paths under the source dir and leaves others untouched', () => {
			const original = URI.file('/Users/me/src/vscode');
			const worktree = URI.file('/Users/me/src/vscode.worktrees/agents-x');
			assert.strictEqual(
				rebaseUnder(URI.file('/Users/me/src/vscode/.github/skills/sessions'), original, worktree)?.toString(),
				URI.file('/Users/me/src/vscode.worktrees/agents-x/.github/skills/sessions').toString(),
				'a path under the source dir is rebased onto the target dir',
			);
			assert.strictEqual(
				rebaseUnder(original, original, worktree)?.toString(),
				worktree.toString(),
				'the source dir itself maps to the target dir',
			);
			assert.strictEqual(
				rebaseUnder(URI.file('/Users/me/.copilot/skills/foo'), original, worktree),
				undefined,
				'a path outside the source dir (e.g. user home) is not rebased',
			);
		});

		let tmpDir: string;

		setup(async () => {
			tmpDir = await fs.mkdtemp(`${os.tmpdir()}/copilot-agent-anchor-test-`);
		});

		teardown(async () => {
			await fs.rm(tmpDir, { recursive: true, force: true });
		});

		async function materializeAndCaptureAnchor(resolvedWorkingDirectory: URI | undefined): Promise<{ anchor: URI | undefined; sdkWorkingDirectory: string | undefined; originalFolder: URI }> {
			const originalFolder = URI.joinPath(URI.file(tmpDir), 'repo');
			await fs.mkdir(originalFolder.fsPath, { recursive: true });

			const client = new TestCopilotClient([]);
			let sdkWorkingDirectory: string | undefined;
			client.createSession = async config => {
				sdkWorkingDirectory = config.workingDirectory;
				return new MockCopilotSession() as unknown as CopilotSession;
			};

			const agent = createTestAgent(disposables, {
				sessionDataService: disposables.add(new TestSessionDataService()),
				copilotClient: client,
			});

			// Capture the customization anchor handed to `_createAgentSession`. The
			// host pushes the resolved working directory (the worktree) into the first
			// `sendMessage`, mirroring AgentSideEffects.
			let anchor: URI | undefined;
			const agentInternals = agent as unknown as {
				_createAgentSession: (launchPlan: CopilotSessionLaunchPlan, customizationDirectory: URI | undefined, activeClient: unknown, identity?: { sessionUri: URI; chatChannelUri: URI }) => CopilotAgentSession;
			};
			const originalCreateAgentSession = agentInternals._createAgentSession;
			agentInternals._createAgentSession = (launchPlan, customizationDirectory, activeClient, identity) => {
				anchor = customizationDirectory;
				return originalCreateAgentSession.call(agent, launchPlan, customizationDirectory, activeClient, identity);
			};

			try {
				await agent.authenticate('https://api.github.com', 'token');
				const result = await agent.createSession({ session: AgentSession.uri('copilotcli', 'anchor-session'), workingDirectory: originalFolder });
				assert.strictEqual(result.provisional, true);
				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', resolvedWorkingDirectory, undefined, undefined, undefined);
			} finally {
				await disposeAgent(agent);
			}
			return { anchor, sdkWorkingDirectory, originalFolder };
		}

		test('materialization re-anchors customization discovery to the resolved worktree', async () => {
			const worktree = URI.joinPath(URI.file(tmpDir), 'repo.worktrees', 'agents-x');
			const { anchor, sdkWorkingDirectory, originalFolder } = await materializeAndCaptureAnchor(worktree);
			assert.strictEqual(anchor?.toString(), worktree.toString(), 'customization discovery must be anchored to the worktree, not the original folder');
			assert.notStrictEqual(anchor?.toString(), originalFolder.toString(), 'the anchor must move off the original folder');
			assert.strictEqual(sdkWorkingDirectory, worktree.fsPath, 'the SDK working directory must be the worktree');
		});

		test('materialization without a worktree keeps the anchor on the original folder', async () => {
			const originalFolder = URI.joinPath(URI.file(tmpDir), 'repo');
			const { anchor } = await materializeAndCaptureAnchor(undefined);
			assert.strictEqual(anchor?.toString(), originalFolder.toString(), 'the anchor stays on the original folder when no worktree is created');
		});

		test('worktree skill/instruction directories sent to the SDK resolve inside the worktree', async () => {
			const fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

			const originalFolder = URI.from({ scheme: Schemas.inMemory, path: '/orig' });
			const worktree = URI.from({ scheme: Schemas.inMemory, path: '/wt' });

			// A skill present only in the ORIGINAL folder must NOT reach the SDK;
			// the worktree's own skill + instruction must.
			await fileService.writeFile(URI.joinPath(originalFolder, '.github', 'skills', 'orig-skill', 'SKILL.md'), VSBuffer.fromString('---\nname: orig-skill\ndescription: from the original repo\n---\nbody'));
			await fileService.writeFile(URI.joinPath(worktree, '.github', 'skills', 'wt-skill', 'SKILL.md'), VSBuffer.fromString('---\nname: wt-skill\ndescription: from the worktree\n---\nbody'));
			await fileService.writeFile(URI.joinPath(worktree, '.github', 'instructions', 'wt.instructions.md'), VSBuffer.fromString('---\napplyTo: "**/*.ts"\ndescription: worktree instruction\n---\nbody'));

			const client = new TestCopilotClient([]);
			let capturedConfig: Parameters<ITestCopilotClient['createSession']>[0] | undefined;
			client.createSession = async config => {
				capturedConfig = config;
				return new MockCopilotSession() as unknown as CopilotSession;
			};

			const { agent } = createTestAgentContext(disposables, {
				sessionDataService: disposables.add(new TestSessionDataService()),
				copilotClient: client,
				fileService,
			});

			// The active-client claim anchors the provisional plugin controller to
			// the ORIGINAL folder first; the host pushes the worktree into the first
			// send, so this exercises the re-anchor at materialization.
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'wt-dirs-session'),
					workingDirectory: originalFolder,
					activeClient: { clientId: 'c1', tools: [] },
				});
				assert.strictEqual(result.provisional, true);
				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', worktree, undefined, undefined, undefined);
			} finally {
				await disposeAgent(agent);
			}

			assert.ok(capturedConfig, 'the SDK createSession must run during materialization');
			assert.deepStrictEqual(
				{
					workingDirectory: capturedConfig.workingDirectory,
					skillDirectories: capturedConfig.skillDirectories,
					instructionDirectories: capturedConfig.instructionDirectories,
				},
				{
					workingDirectory: worktree.fsPath,
					skillDirectories: [URI.joinPath(worktree, '.github', 'skills', 'wt-skill').fsPath],
					instructionDirectories: [URI.joinPath(worktree, '.github', 'instructions').fsPath],
				},
				'skill/instruction directories sent to the SDK must resolve inside the worktree, never the original folder',
			);
		});

	});

	suite('custom agent worktree translation', () => {

		// The new methods under test are private; reach in the same way the
		// surrounding suites do (e.g. `customization anchoring`).
		type AgentInternals = {
			_getAlternativeAgentForWorktree(provisional: unknown, workingDirectory: URI | undefined): AgentSelection | undefined;
			_resolveAgentWhenMaterializing(provisional: unknown, snapshot: IActiveClientSnapshot, workingDirectory: URI | undefined): Promise<{ agent: AgentSelection; name: string } | undefined>;
			_resolveAgentName(snapshot: IActiveClientSnapshot, agent: AgentSelection): string | undefined;
			_createAgentSession(launchPlan: CopilotSessionLaunchPlan, customizationDirectory: URI | undefined, activeClient: unknown, identity?: { sessionUri: URI; chatChannelUri: URI }): CopilotAgentSession;
			_readSessionMetadata(session: URI): Promise<{ agent?: AgentSelection }>;
		};

		const repo = URI.file('/repo');
		const worktree = URI.joinPath(URI.file('/repo.worktrees'), 'agents-x');
		const repoAgentUri = URI.joinPath(repo, '.github', 'agents', 'agent.md').toString();
		const worktreeAgentUri = URI.joinPath(worktree, '.github', 'agents', 'agent.md').toString();
		const emptySnapshot: IActiveClientSnapshot = { tools: [], plugins: [], mcpServers: {} };

		function provisional(workingDirectory: URI | undefined, agent: AgentSelection | undefined): unknown {
			const sessionUri = AgentSession.uri('copilotcli', 'prov-agent');
			return { sessionId: AgentSession.id(sessionUri), sessionUri, workingDirectory, model: undefined, agent, project: undefined };
		}

		test('_getAlternativeAgentForWorktree rewrites a repo agent path onto the worktree', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				const internals = agent as unknown as AgentInternals;
				assert.deepStrictEqual(
					internals._getAlternativeAgentForWorktree(provisional(repo, { uri: repoAgentUri }), worktree),
					{ uri: worktreeAgentUri },
				);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('_getAlternativeAgentForWorktree returns undefined when there is nothing to translate', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				const internals = agent as unknown as AgentInternals;
				const outsideRepoAgent: AgentSelection = { uri: URI.file('/home/me/.copilot/agents/agent.md').toString() };
				assert.deepStrictEqual(
					{
						noAgent: internals._getAlternativeAgentForWorktree(provisional(repo, undefined), worktree),
						folderIsolation: internals._getAlternativeAgentForWorktree(provisional(repo, { uri: repoAgentUri }), undefined),
						sameWorkingDirectory: internals._getAlternativeAgentForWorktree(provisional(repo, { uri: repoAgentUri }), repo),
						agentOutsideRepo: internals._getAlternativeAgentForWorktree(provisional(repo, outsideRepoAgent), worktree),
					},
					{
						noAgent: undefined,
						folderIsolation: undefined,
						sameWorkingDirectory: undefined,
						agentOutsideRepo: undefined,
					},
				);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('_resolveAgentWhenMaterializing keeps the original agent for folder isolation (no worktree)', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				const internals = agent as unknown as AgentInternals;
				internals._resolveAgentName = (_snapshot, selection) => selection.uri === repoAgentUri ? 'Repo Agent' : undefined;
				// Folder isolation: the resolved working directory equals the
				// user-picked folder, so there is no worktree copy to translate to
				// and the originally selected agent is kept as-is.
				assert.deepStrictEqual(
					await internals._resolveAgentWhenMaterializing(provisional(repo, { uri: repoAgentUri }), emptySnapshot, repo),
					{ agent: { uri: repoAgentUri }, name: 'Repo Agent' },
				);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('_resolveAgentWhenMaterializing returns undefined when no agent is selected or neither resolves', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				const internals = agent as unknown as AgentInternals;
				internals._resolveAgentName = () => undefined;
				assert.deepStrictEqual(
					{
						noAgent: await internals._resolveAgentWhenMaterializing(provisional(repo, undefined), emptySnapshot, worktree),
						neitherResolves: await internals._resolveAgentWhenMaterializing(provisional(repo, { uri: repoAgentUri }), emptySnapshot, worktree),
					},
					{ noAgent: undefined, neitherResolves: undefined },
				);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('materialization rewrites a repo agent to its worktree copy and persists it (no resolution stubbing)', async () => {
			// End-to-end through real customization discovery: the same custom
			// agent file exists in both the original repo and the worktree. The
			// user selects the repo copy, but once the worktree is materialized
			// discovery re-anchors there, so the persisted/launched agent must be
			// the worktree copy — proving the translation against real resolution
			// rather than a stubbed `_resolveAgentName`.
			const fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

			const repoFolder = URI.from({ scheme: Schemas.inMemory, path: '/repo' });
			const worktreeFolder = URI.from({ scheme: Schemas.inMemory, path: '/repo.worktrees/agents-x' });
			const repoAgentFile = URI.joinPath(repoFolder, '.github', 'agents', 'agent.md');
			const worktreeAgentFile = URI.joinPath(worktreeFolder, '.github', 'agents', 'agent.md');
			const agentContents = VSBuffer.fromString('---\nname: My Agent\ndescription: a custom agent\n---\nbody');
			await fileService.writeFile(repoAgentFile, agentContents);
			await fileService.writeFile(worktreeAgentFile, agentContents);

			const client = new TestCopilotClient([]);
			client.createSession = async () => new MockCopilotSession() as unknown as CopilotSession;

			const sessionDataService = disposables.add(new TestSessionDataService());
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });

			let launchAgentName: string | undefined;
			const internals = agent as unknown as AgentInternals;
			const originalCreateAgentSession = internals._createAgentSession;
			internals._createAgentSession = (launchPlan, customizationDirectory, activeClient, identity) => {
				launchAgentName = launchPlan.resolvedAgentName;
				return originalCreateAgentSession.call(agent, launchPlan, customizationDirectory, activeClient, identity);
			};

			try {
				await agent.authenticate('https://api.github.com', 'token');
				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'agent-translate'),
					workingDirectory: repoFolder,
					agent: { uri: repoAgentFile.toString() },
				});
				assert.strictEqual(result.provisional, true);
				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', worktreeFolder, undefined, undefined, undefined);

				// `_readSessionMetadata` reads back the exact agent field the
				// resume path consumes, so asserting it stands in for restore.
				const stored = await internals._readSessionMetadata(result.session);
				assert.deepStrictEqual(
					{ storedAgent: stored.agent, launchAgentName },
					{ storedAgent: { uri: worktreeAgentFile.toString() }, launchAgentName: 'My Agent' },
					'the repo agent must be rewritten to its worktree copy, both for the SDK launch and the persisted metadata the restore path reads',
				);
			} finally {
				await disposeAgent(agent);
			}
		});

	});
});
