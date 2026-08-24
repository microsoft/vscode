/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, CopilotClientOptions, CopilotSession, GitHubTelemetryNotification, PermissionAllowAllMode, PermissionRequest, SessionEvent, SessionEventHandler, SessionEventPayload, SessionEventType, TypedSessionEventHandler } from '@github/copilot-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import { isCustomizationEnabled } from '../../common/customizationEnablement.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, toDisposable, type DisposableStore, type IDisposable, type IReference } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, observableValue, waitForState } from '../../../../base/common/observable.js';
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
import { IAgentHostCustomizationEnablementService, type IAgentHostCustomizationEnablementService as ICustomizationEnablementService } from '../../node/agentHostCustomizationEnablementService.js';
import type { IAgentHostClientProxyConnection } from '../../common/agentHostClientProxyChannel.js';
import type { IByokLmBridgeConnection, IByokLmModelInfo } from '../../common/agentHostByokLm.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService, NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { AgentHostTelemetryService } from '../../node/agentHostTelemetryService.js';
import { CopilotCliConfigKey, CopilotCliVSCodeAssignmentContextKey } from '../../common/copilotCliConfig.js';
import { AgentHostConfigKey } from '../../common/agentHostCustomizationConfig.js';
import { AgentHostAutoApprovePolicyRestrictedConfigKey, AgentHostByokModelsEnabledConfigKey, AgentHostGitHubMcpServerEnabledConfigKey, AgentHostCopilotMultiRootEnabledConfigKey, AgentHostMigrateLegacyCopilotCliEnabledConfigKey, AgentHostProxyConfigKey, AgentHostSystemProxyEnabledConfigKey } from '../../common/agentHostSchema.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { getTelemetryChatSessionId } from '../../common/agentTelemetryCorrelation.js';
import { AgentSession, GITHUB_COPILOT_PROTECTED_RESOURCE, type AgentSignal, type IAgentChatContext, type IAgentChatMetadata, type IAgentCreateChatForkSource, type IAgentCreateChatOptions, type IAgentCreateChatResult, type IAgentCreateSessionConfig, type IAgentDiscoveredChat, type IAgentMaterializeChatEvent, type IAgentSpawnChatEvent } from '../../common/agent.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind } from '../../common/agentHostTelemetry.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { buildDefaultChatUri, buildChatUri, buildSubagentChatUri, buildSubagentSessionUri, parseRequiredSessionUriFromChatUri, CustomizationLoadStatus, MessageKind, readSessionEhcliAdoptable, ResponsePartKind, ROOT_STATE_URI, ToolResultContentType, TurnState, customizationId, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_READ_DB_KEY, type ClientPluginCustomization, type Customization, type PluginCustomization, type ToolCallResult, type Turn, RuleCustomization } from '../../common/state/sessionState.js';
import { ChatOriginKind, CustomizationEnablementKind, CustomizationType, SessionStatus, ToolCallContributorKind, type AgentSelection, type ModelSelection, type ProtectedResourceMetadata, type ToolDefinition } from '../../common/state/protocol/state.js';
import { ActionType, type ChatAction, type SessionAction } from '../../common/state/sessionActions.js';

import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { injectSideChatContext } from '../../node/agentPeerChats.js';
import { AgentHostManagedSettingsService, IAgentHostManagedSettingsService } from '../../node/agentHostManagedSettingsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostPromptCache, IAgentHostPromptCache } from '../../node/agentHostPromptCache.js';
import { AgentHostSessionTitleSignal, IAgentHostSessionTitleSignal } from '../../node/agentHostSessionTitleSignal.js';
import { IAgentHostGitService, type IAddWorktreeOptions, type IBranch, type IDefaultBranch } from '../../common/agentHostGitService.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { AgentHostCompletions, IAgentHostCompletions } from '../../node/agentHostCompletions.js';
import { COPILOT_AGENT_HOST_SYSTEM_MESSAGE, CopilotAgent, getCopilotManagedSettingsDiagnostics, rebaseUnder, REFRESH_DEBOUNCE_MS, resolveCopilotOtlpMetricsEndpoint } from '../../node/copilot/copilotAgent.js';
import { GITHUB_MCP_SERVER_NAME } from '../../node/shared/githubMcpServer.js';
import { COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS } from '../../node/copilot/prompts/systemMessage.js';
import { COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION } from '../../node/copilot/prompts/toolInstructions.js';
import { NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { IAgentHostReviewService, NULL_REVIEW_SERVICE } from '../../common/agentHostReviewService.js';
import { getCopilotHomePath } from '../../common/copilotHome.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { SEMANTIC_SEARCH_TOOL_NAME } from '../../common/semanticSearchConstants.js';
import { join } from '../../../../base/common/path.js';
import { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { createNoopCustomizationEnablementService } from './testCustomizationEnablementService.js';
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

function defaultChatUri(session: URI): URI {
	return URI.parse(buildDefaultChatUri(session));
}

/**
 * Recovers the owning session's raw id from a chat metadata entry's exact
 * default `chat` URI — {@link IAgentChatMetadata} no longer carries a `session`
 * field, only the exact chat.
 */
function sessionIdOfChat(chat: URI): string {
	return AgentSession.id(parseRequiredSessionUriFromChatUri(chat));
}

/**
 * Test convenience wrapper around {@link CopilotAgent.getChatCustomizations}:
 * the tests below only ever address a session's default chat, so build its
 * exact chat URI/context here instead of repeating it at every call site.
 */
function getDefaultChatCustomizations(agent: CopilotAgent, session: URI, hostCustomizations?: readonly Customization[]): Promise<readonly Customization[]> {
	const chat = defaultChatUri(session);
	return agent.getChatCustomizations(chat, exactChatContext(session, chat, session), hostCustomizations);
}

/**
 * Test convenience wrapper around {@link CopilotAgent.ensureChatAdopted}: the
 * tests below only ever adopt a session's default chat.
 */
function ensureDefaultChatAdopted(agent: CopilotAgent, session: URI): ReturnType<CopilotAgent['ensureChatAdopted']> {
	const chat = defaultChatUri(session);
	return agent.ensureChatAdopted(chat, exactChatContext(session, chat, session));
}

function exactChatContext(session: URI, chat: URI, resource: URI = chat): IAgentChatContext {
	return { resource, configurationResource: session };
}

/**
 * Provisions a session the way Agent Host does: one {@link IAgentChats.createChat}
 * call addressed to the session's first chat, with the owning session as the
 * persistence scope, so the creation also stands the session's runtime up.
 */
async function provisionSession(agent: CopilotAgent, config: IAgentCreateSessionConfig & { readonly session: URI }, chatOptions?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult & { readonly session: URI }> {
	const chat = defaultChatUri(config.session);
	const result = await agent.chats.createChat(chat, exactChatContext(config.session, chat, config.session), {
		model: config.model,
		agent: config.agent,
		workingDirectories: config.workingDirectories,
		config: config.config,
		activeClient: config.activeClient,
		deferBacking: !chatOptions?.fork && !config.importConversation,
		importConversation: config.importConversation,
		...chatOptions,
	});
	// The provider contract no longer echoes `session` back; the test already
	// knows it from `config`, so augment locally for test ergonomics only.
	return { ...result, session: config.session };
}

/**
 * Tears a session down the way Agent Host does: dispose its (only) chat
 * through the chat surface. Session-scoped cleanup — including the
 * workspaceless-scratch-dir teardown the old `finalizeSession` hook used to
 * run — now happens inline inside `disposeChat` once no chat is left sharing
 * the configuration scope, so there is no separate finalize call to make.
 */
async function disposeProvisionedSession(agent: CopilotAgent, session: URI): Promise<void> {
	const chat = defaultChatUri(session);
	await agent.chats.disposeChat(chat, exactChatContext(session, chat, session));
}

async function materializeLegacyDefaultChat(agent: CopilotAgent, session: URI): Promise<void> {
	const chat = defaultChatUri(session);
	const context = exactChatContext(session, chat, session);
	const recovered = await agent.recoverLegacyChat(chat, context);
	await agent.materializeChat(chat, context, recovered.providerData);
}

function chatEntriesBySdkId(agent: CopilotAgent): Map<string, { chatSession: CopilotAgentSession; dispose(): void }> {
	return (agent as unknown as { _chatEntriesBySdkId: Map<string, { chatSession: CopilotAgentSession; dispose(): void }> })._chatEntriesBySdkId;
}

function chatBackings(agent: CopilotAgent): Map<string, { sdkSessionId: string; model?: ModelSelection }> {
	return (agent as unknown as { _chatBackings: Map<string, { sdkSessionId: string; model?: ModelSelection }> })._chatBackings;
}

function chatScopes(agent: CopilotAgent): Map<string, URI> {
	return (agent as unknown as { _chatScopes: Map<string, URI> })._chatScopes;
}

function setLiveChatStub(agent: CopilotAgent, sdkSessionId: string, stub: unknown, chatUri?: URI): void {
	chatEntriesBySdkId(agent).set(sdkSessionId, {
		chatSession: stub as CopilotAgentSession,
		dispose: () => (stub as { dispose?: () => void }).dispose?.(),
	});
	if (chatUri) {
		chatBackings(agent).set(chatUri.toString(), { sdkSessionId });
	}
}

function setDefaultSessionStub(agent: CopilotAgent, sessionId: string, stub: unknown, chatUri?: URI): void {
	const sessionUri = AgentSession.uri('copilotcli', sessionId);
	const typed = stub as {
		sessionId?: string;
		sessionUri?: URI;
		resourceUri?: URI;
		chatChannelUri?: URI;
		bindChatChannel?: (uri: URI) => void;
		destroySession?: () => Promise<void>;
	};
	typed.sessionId ??= sessionId;
	typed.sessionUri ??= sessionUri;
	// A session-backed (default) chat's host-chosen persistence scope is the
	// session itself; that is how the agent identifies it without rebuilding a
	// default-chat URI (see `CopilotAgent._findSessionChat`).
	typed.resourceUri ??= sessionUri;
	typed.chatChannelUri = chatUri ?? typed.chatChannelUri ?? defaultChatUri(sessionUri);
	typed.bindChatChannel ??= (uri: URI) => { typed.chatChannelUri = uri; };
	typed.destroySession ??= async () => { };
	setLiveChatStub(agent, sessionId, typed, typed.chatChannelUri);
	// Stubs bypass real creation/materialization, so seed the scope a fork
	// would otherwise have recorded then.
	chatScopes(agent).set(typed.chatChannelUri.toString(), sessionUri);
}

function setPeerChatStub(agent: CopilotAgent, chatUri: URI, stub: unknown, sdkSessionId?: string): void {
	const resolvedSdkSessionId = sdkSessionId ?? (stub as { sessionId?: string }).sessionId ?? `sdk-${chatUri.toString()}`;
	const ownerSession = URI.parse(parseRequiredSessionUriFromChatUri(chatUri));
	const typed = stub as {
		sessionId?: string;
		sessionUri?: URI;
		resourceUri?: URI;
		chatChannelUri?: URI;
		bindChatChannel?: (uri: URI) => void;
		destroySession?: () => Promise<void>;
	};
	typed.sessionId ??= resolvedSdkSessionId;
	typed.sessionUri ??= ownerSession;
	// An additional chat is scoped to its own chat URI, never the session.
	typed.resourceUri ??= chatUri;
	typed.chatChannelUri ??= chatUri;
	typed.bindChatChannel ??= (uri: URI) => { typed.chatChannelUri = uri; };
	typed.destroySession ??= async () => { };
	setLiveChatStub(agent, resolvedSdkSessionId, typed, chatUri);
	chatBackings(agent).set(chatUri.toString(), { sdkSessionId: resolvedSdkSessionId });
	// Stubs bypass real creation/materialization, so seed the scope a fork
	// would otherwise have recorded then.
	chatScopes(agent).set(chatUri.toString(), ownerSession);
}

function getPeerChatStub(agent: CopilotAgent, chatUri: URI): CopilotAgentSession | undefined {
	const sdkSessionId = chatBackings(agent).get(chatUri.toString())?.sdkSessionId;
	return sdkSessionId ? chatEntriesBySdkId(agent).get(sdkSessionId)?.chatSession : undefined;
}

function hasLiveChat(agent: CopilotAgent, chatUri: URI): boolean {
	const sdkSessionId = chatBackings(agent).get(chatUri.toString())?.sdkSessionId;
	return !!sdkSessionId && !!chatEntriesBySdkId(agent).get(sdkSessionId);
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
	addedWorktrees: { repositoryRoot: URI; options: IAddWorktreeOptions }[] = [];
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
	async addWorktree(repositoryRoot: URI, options: IAddWorktreeOptions): Promise<void> {
		this.addedWorktrees.push({ repositoryRoot, options });
		if (options.newBranchName) {
			this.existingBranches.add(options.newBranchName);
		}
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
	async mergeBranch(): Promise<string> { return ''; }
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
}

interface ITestCopilotClient extends Pick<CopilotClient, 'start' | 'stop' | 'listSessions' | 'createSession' | 'resumeSession' | 'getSessionMetadata' | 'deleteSession'> {
	readonly rpc: {
		readonly sessions: {
			readonly fork: CopilotClient['rpc']['sessions']['fork'];
			readonly list: CopilotClient['rpc']['sessions']['list'];
		};
		readonly models: { readonly list: CopilotModelsList };
	};
}

type TestCopilotSessionMetadata = Awaited<ReturnType<ITestCopilotClient['listSessions']>>[number] & { readonly clientName?: string };

interface ITestCopilotSessionOptions {
	readonly clientName?: string;
	readonly repository?: string;
	readonly modifiedTime?: Date;
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
	};
}

class TestCopilotClient implements ITestCopilotClient {
	readonly rpc: ITestCopilotClient['rpc'] = {
		sessions: {
			fork: async () => ({ sessionId: 'forked-session' }),
			list: async () => {
				this.sessionListStarted?.complete();
				await this.sessionListGate;
				return {
					sessions: this._sessions.map(session => ({
						sessionId: session.sessionId,
						startTime: session.startTime.toISOString(),
						modifiedTime: session.modifiedTime.toISOString(),
						summary: session.summary,
						clientName: session.clientName,
						isRemote: false,
						...(session.context ? {
							context: {
								cwd: session.context.workingDirectory,
								gitRoot: session.context.gitRoot,
								repository: session.context.repository,
								branch: session.context.branch,
							}
						} : {}),
					}))
				};
			},
		},
		models: {
			list: async params => {
				this.modelListRequests.push(params);
				const gate = this.modelListGates.shift() ?? this.modelListGate;
				const models = this.modelListResponses.shift() ?? this._models;
				const error = this.modelListErrors.shift();
				await gate;
				if (error) {
					throw error;
				}
				return { models: models.map(toSdkModelInfo) };
			}
		},
	};
	startCallCount = 0;
	stopCallCount = 0;
	readonly startCalled = new DeferredPromise<void>();
	startGate: Promise<void> | undefined;
	startError: Error | undefined;
	listSessionCallCount = 0;
	sessionListStarted: DeferredPromise<void> | undefined;
	sessionListGate: Promise<void> | undefined;
	readonly modelListRequests: Parameters<CopilotModelsList>[0][] = [];
	readonly modelListErrors: Error[] = [];
	/** When set, `models.list` records its request then blocks on this until resolved. */
	modelListGate: Promise<void> | undefined;
	/** Per-request gates and results, captured when each request starts. */
	readonly modelListGates: Promise<void>[] = [];
	readonly modelListResponses: ITestCopilotModelInfo[][] = [];
	readonly getSessionMetadataCalls: string[] = [];
	readonly deletedSessionIds: string[] = [];

	constructor(
		private readonly _sessions: TestCopilotSessionMetadata[],
		private readonly _models: readonly ITestCopilotModelInfo[] = [],
	) { }

	async start(): Promise<void> {
		this.startCallCount++;
		this.startCalled.complete();
		await this.startGate;
		if (this.startError) {
			throw this.startError;
		}
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

class RecordingTelemetryService extends NullTelemetryServiceShape {
	readonly events: Array<{ eventName: string; data: unknown }> = [];
	readonly errorEvents: Array<{ eventName: string; data: unknown }> = [];
	readonly experimentProperties: Record<string, string> = {};

	override setExperimentProperty(name?: string, value?: string): void {
		this.experimentProperties[name ?? ''] = value ?? '';
	}

	override publicLog2(eventName?: string, data?: unknown): void {
		this.events.push({ eventName: eventName ?? '', data });
	}

	override publicLogError2(eventName?: string, data?: unknown): void {
		this.errorEvents.push({ eventName: eventName ?? '', data });
	}
}

interface IFakeAgentSession {
	send: (prompt: string, attachments?: unknown, turnId?: string, announcement?: string) => Promise<void>;
	getMessages: () => Promise<readonly Turn[]>;
	dispose: () => void;
}

interface ICredentialUpdateSession {
	readonly hasActiveTurn: boolean;
	updateGitHubCredentials(host: string, token: string): Promise<{ readonly success: boolean; readonly copilotUserResolved?: boolean }>;
	dispose(): void;
}

class MockCopilotSession {
	readonly sessionId = 'test-session-1';
	readonly rpc = {
		options: {
			update: async () => ({ success: true }),
		},
		gitHubAuth: {
			setCredentials: async () => ({ success: true, copilotUserResolved: true }),
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
	async getNativeSdkTelemetryConfig() { return undefined; }
	getSessionTraceContext() { return undefined; }
	releaseSessionTraceContext() { }
	withTraceContext<T>(_context: undefined, fn: () => T): T { return fn(); }
	getCurrentTraceContext() { return undefined; }
	getSpansDbPath() {
		return undefined;
	}
	emitSessionTitleChanged(_conversationId: string, _sessionUri: string, _title: string): void { }
	async flush() {
		//
	}
}

/**
 * Records the OTel session-title spans the agent emits, so the wiring from the
 * host's {@link IAgentHostSessionTitleSignal} through to the provider filter
 * can be asserted end to end.
 */
class RecordingTitleOTelService extends MockAgentHostOTelService {
	readonly titleCalls: { conversationId: string; sessionUri: string; title: string }[] = [];

	override emitSessionTitleChanged(conversationId: string, sessionUri: string, title: string): void {
		this.titleCalls.push({ conversationId, sessionUri, title });
	}
}

/**
 * Records every configuration scope whose trace context was released, so a
 * failed `createChat` can be asserted to release it exactly when it finalizes
 * the scope (i.e. no other chat still shares it) and never otherwise.
 */
class RecordingReleaseOTelService implements IAgentHostOTelService {
	declare readonly _serviceBrand: undefined;
	readonly released: string[] = [];

	async getSdkTelemetryConfig() { return undefined; }
	async getNativeSdkTelemetryConfig() { return undefined; }
	getSessionTraceContext() { return undefined; }
	releaseSessionTraceContext(sessionUri: string): void {
		this.released.push(sessionUri);
	}
	withTraceContext<T>(_context: undefined, fn: () => T): T { return fn(); }
	getCurrentTraceContext() { return undefined; }
	getSpansDbPath() { return undefined; }
	emitSessionTitleChanged(_conversationId: string, _sessionUri: string, _title: string): void { }
	async flush() { }
}

class TestProxyResolver implements IAgentHostProxyResolver {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidRegisterConnection = new Emitter<void>();
	readonly onDidRegisterConnection = this._onDidRegisterConnection.event;
	private readonly _onDidChangeConfiguration = new Emitter<void>();
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;
	private readonly _connections = new Map<string, IAgentHostClientProxyConnection>();
	resolveProxyCalls = 0;
	resolvedProxy: string | undefined;
	resolveProxyGate: Promise<void> | undefined;

	register(clientId: string, connection: IAgentHostClientProxyConnection): IDisposable {
		const hadConnections = this._connections.size > 0;
		this._connections.set(clientId, connection);
		if (!hadConnections) {
			this._onDidRegisterConnection.fire();
		}
		return toDisposable(() => {
			if (this._connections.get(clientId) === connection) {
				this._connections.delete(clientId);
			}
		});
	}

	getConfigurationValue<T>(_key: string): T | undefined {
		return undefined;
	}

	fireConfigurationChange(): void {
		this._onDidChangeConfiguration.fire();
	}

	async resolveProxy(_url: string): Promise<string | undefined> {
		this.resolveProxyCalls++;
		await this.resolveProxyGate;
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
		@IAgentHostSessionTitleSignal sessionTitleSignal: IAgentHostSessionTitleSignal,
		@IAgentHostManagedSettingsService managedSettingsService: IAgentHostManagedSettingsService,
		@IAgentHostGitHubEndpointService gitHubEndpointService: IAgentHostGitHubEndpointService,
		@IAgentHostOTelService otelService: IAgentHostOTelService,
		@IAgentHostCompletions completions: IAgentHostCompletions,
		@IAgentHostCustomizationEnablementService customizationEnablementService: ICustomizationEnablementService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IByokLmBridgeRegistry byokBridgeRegistry: IByokLmBridgeRegistry,
		@ITelemetryService telemetryService: ITelemetryService,
		@IAgentHostProxyResolver proxyResolver: IAgentHostProxyResolver,
		@ICopilotApiService copilotApiService: ICopilotApiService,
		@IFileService fileService: IFileService,
	) {
		super(logService, instantiationService, sessionDataService, gitService, configurationService, sessionTitleSignal, managedSettingsService, gitHubEndpointService, otelService, completions, NULL_CHECKPOINT_SERVICE, NULL_REVIEW_SERVICE, customizationEnablementService, environmentService, byokBridgeRegistry, telemetryService, copilotApiService, proxyResolver, fileService);
	}

	protected override _createCopilotClient(): CopilotClient {
		return this._copilotClient as CopilotClient;
	}
}

class TestableCopilotAgent extends CopilotAgent {
	private readonly _fakeSessions = new Map<string, IFakeAgentSession>();
	readonly resumeCalls: string[] = [];
	readonly createdClientOptions: CopilotClientOptions[] = [];
	lastClientOptions: CopilotClientOptions | undefined;
	protected override readonly _now: () => number;

	// Keep model-refresh retries effectively instant in tests.
	protected override readonly _modelRefreshBaseDelayMs = 1;
	protected override readonly _modelRefreshMaxDelayMs = 2;

	constructor(
		private readonly _copilotClient: ITestCopilotClient,
		now: () => number,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionDataService sessionDataService: ISessionDataService,
		@IAgentHostGitService gitService: IAgentHostGitService,
		@IAgentConfigurationService configurationService: IAgentConfigurationService,
		@IAgentHostSessionTitleSignal sessionTitleSignal: IAgentHostSessionTitleSignal,
		@IAgentHostManagedSettingsService managedSettingsService: IAgentHostManagedSettingsService,
		@IAgentHostGitHubEndpointService gitHubEndpointService: IAgentHostGitHubEndpointService,
		@IAgentHostOTelService otelService: IAgentHostOTelService,
		@IAgentHostCompletions completions: IAgentHostCompletions,
		@IAgentHostCustomizationEnablementService customizationEnablementService: ICustomizationEnablementService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IByokLmBridgeRegistry byokBridgeRegistry: IByokLmBridgeRegistry,
		@ITelemetryService telemetryService: ITelemetryService,
		@IAgentHostProxyResolver proxyResolver: IAgentHostProxyResolver,
		@ICopilotApiService copilotApiService: ICopilotApiService,
		@IFileService fileService: IFileService,
	) {
		super(logService, instantiationService, sessionDataService, gitService, configurationService, sessionTitleSignal, managedSettingsService, gitHubEndpointService, otelService, completions, NULL_CHECKPOINT_SERVICE, NULL_REVIEW_SERVICE, customizationEnablementService, environmentService, byokBridgeRegistry, telemetryService, copilotApiService, proxyResolver, fileService);
		this._now = now;
	}

	protected override _createCopilotClient(options: CopilotClientOptions): CopilotClient {
		this.createdClientOptions.push(options);
		this.lastClientOptions = options;
		return this._copilotClient as CopilotClient;
	}

	registerFakeSession(sessionId: string, fake: IFakeAgentSession): void {
		this._fakeSessions.set(sessionId, fake);
	}

	protected override async _resumeSession(sessionId: string, _chatChannelUri?: URI, _workingDirectories?: readonly URI[]): Promise<CopilotAgentSession> {
		this.resumeCalls.push(sessionId);
		const fake = this._fakeSessions.get(sessionId);
		if (!fake) {
			throw new Error(`No fake session registered for '${sessionId}'`);
		}
		const sessionUri = AgentSession.uri('copilotcli', sessionId);
		const emitter = (this as unknown as { _onDidChatProgress: { fire(s: AgentSignal): void } })._onDidChatProgress;
		let turnId = '';
		// `_chatEntriesBySdkId` is a DisposableMap, so it will dispose() the entry on
		// teardown. The fields below are the only ones touched by sendMessage
		// and getSessionMessages in the code under test.
		const stub = {
			send: fake.send,
			getMessages: fake.getMessages,
			appliedSnapshot: undefined,
			dispose: fake.dispose,
			onDidRequireAuth: Event.None,
			hasRunningDetachedShells: async () => false,
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

function createTestAgentContext(disposables: Pick<DisposableStore, 'add'>, options?: { sessionDataService?: ISessionDataService; copilotClient?: ITestCopilotClient; useRealResumePath?: boolean; gitService?: TestAgentHostGitService; environmentServiceRegistration?: 'native' | 'none'; pluginManager?: IAgentPluginManager; fileService?: FileService; copilotApiService?: ICopilotApiService; gitHubEndpointService?: IAgentHostGitHubEndpointService; telemetryService?: ITelemetryService; userHome?: URI; logService?: ILogService; proxyResolver?: IAgentHostProxyResolver; byokBridgeRegistry?: IByokLmBridgeRegistry; otelService?: IAgentHostOTelService; customizationEnablementService?: ICustomizationEnablementService; rootConfig?: Record<string, unknown>; now?: () => number }): { agent: CopilotAgent; instantiationService: IInstantiationService; configurationService: IAgentConfigurationService; managedSettingsService: IAgentHostManagedSettingsService; fileService: FileService; stateManager: AgentHostStateManager } {
	const services = new ServiceCollection();
	const logService = options?.logService ?? new NullLogService();
	const fileService = options?.fileService ?? disposables.add(new FileService(logService));
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
	configService.updateRootConfig({
		[AgentHostByokModelsEnabledConfigKey]: true,
		...options?.rootConfig,
	});
	const managedSettingsService = disposables.add(new AgentHostManagedSettingsService());
	services.set(ILogService, logService);
	services.set(IFileService, fileService);
	services.set(IAgentConfigurationService, configService);
	services.set(IAgentHostManagedSettingsService, managedSettingsService);
	services.set(IAgentHostStateManager, stateManager);
	// Narrow host seams the provider consumes instead of the state manager
	// itself (see §8 of MULTI_CHAT_ARCHITECTURE.md). Both are constructed over
	// the same test state manager, so a test that drives host state still sees
	// the provider react through the seam it actually depends on.
	services.set(IAgentHostPromptCache, new AgentHostPromptCache(stateManager));
	services.set(IAgentHostSessionTitleSignal, disposables.add(new AgentHostSessionTitleSignal(stateManager)));
	services.set(IAgentHostGitHubEndpointService, options?.gitHubEndpointService ?? createTestGitHubEndpointService());
	services.set(ISessionDataService, options?.sessionDataService ?? createNullSessionDataService());
	services.set(IAgentPluginManager, options?.pluginManager ?? new TestAgentPluginManager());
	services.set(IAgentHostGitService, options?.gitService ?? new TestAgentHostGitService());
	services.set(IAgentHostReviewService, NULL_REVIEW_SERVICE);
	services.set(IAgentHostTerminalManager, new TestAgentHostTerminalManager());
	services.set(IAgentHostOTelService, options?.otelService ?? {
		_serviceBrand: undefined,
		getSdkTelemetryConfig: async () => undefined,
		getNativeSdkTelemetryConfig: async () => undefined,
		getSessionTraceContext: () => undefined,
		releaseSessionTraceContext: () => { },
		withTraceContext: <T>(_context: undefined, fn: () => T): T => fn(),
		getCurrentTraceContext: () => undefined,
		getSpansDbPath: () => undefined,
		emitSessionTitleChanged: () => { },
		flush: async () => undefined,
	});
	services.set(IAgentHostCompletions, disposables.add(new AgentHostCompletions(logService)));
	services.set(IAgentHostProxyResolver, options?.proxyResolver ?? new TestProxyResolver());
	services.set(IAgentHostCustomizationEnablementService, options?.customizationEnablementService ?? createNoopCustomizationEnablementService());
	services.set(IByokLmBridgeRegistry, options?.byokBridgeRegistry ?? new ByokLmBridgeRegistry());
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
		? options.useRealResumePath
			? instantiationService.createInstance(ResumePathCopilotAgent, options.copilotClient)
			: instantiationService.createInstance(TestableCopilotAgent, options.copilotClient, options.now ?? Date.now)
		: instantiationService.createInstance(CopilotAgent);
	return { agent, instantiationService, configurationService: configService, managedSettingsService, fileService, stateManager };
}

function createTestAgent(disposables: Pick<DisposableStore, 'add'>, options?: { sessionDataService?: ISessionDataService; copilotClient?: ITestCopilotClient; useRealResumePath?: boolean; gitService?: TestAgentHostGitService; environmentServiceRegistration?: 'native' | 'none'; pluginManager?: IAgentPluginManager; fileService?: FileService; copilotApiService?: ICopilotApiService; gitHubEndpointService?: IAgentHostGitHubEndpointService; telemetryService?: ITelemetryService; userHome?: URI; logService?: ILogService; proxyResolver?: IAgentHostProxyResolver; byokBridgeRegistry?: IByokLmBridgeRegistry; otelService?: IAgentHostOTelService }): CopilotAgent {
	return createTestAgentContext(disposables, options).agent;
}

type CopilotCreateSessionOptions = Parameters<CopilotClient['createSession']>[0];

function createAgentSessionThroughAgent(agent: CopilotAgent, instantiationService: IInstantiationService, options?: { readonly mockSession?: MockCopilotSession; readonly activeClientToolSet?: ActiveClientToolSet; readonly snapshot?: IActiveClientSnapshot }): { readonly session: CopilotAgentSession; readonly activeClient: unknown; readonly createOptions: () => CopilotCreateSessionOptions | undefined } {
	const sessionUri = AgentSession.uri('copilotcli', 'test-session-1');
	const shellManager = instantiationService.createInstance(ShellManager, sessionUri, undefined);
	let createOptions: CopilotCreateSessionOptions | undefined;
	const mockSession = options?.mockSession ?? new MockCopilotSession();
	const agentInternals = (agent as unknown as {
		_getOrCreateActiveClient: (session: URI, directory: URI | undefined) => { readonly toolSet: ActiveClientToolSet };
		_createAgentSession: (launchPlan: CopilotSessionLaunchPlan, customizationDirectory: URI | undefined, activeClient: unknown) => CopilotAgentSession;
	});
	const activeClient = agentInternals._getOrCreateActiveClient(sessionUri, undefined);
	const launchPlan: CopilotSessionLaunchPlan = {
		kind: 'create',
		client: {
			createSession: async options => {
				createOptions = options;
				return mockSession as unknown as CopilotSession;
			},
			resumeSession: async () => mockSession as unknown as CopilotSession,
		},
		// Production always launches with the owning session's live registry
		// (`activeClient.toolSet`), so default to it here too; a test that
		// needs an isolated registry passes its own.
		activeClientToolSet: options?.activeClientToolSet ?? activeClient.toolSet,
		sessionId: 'test-session-1',
		workingDirectory: undefined,
		resolvedAgentName: undefined,
		snapshot: options?.snapshot ?? { tools: [], plugins: [], mcpServers: {} },
		shellManager,
		githubToken: 'token',
		model: undefined,
	};
	return { session: agentInternals._createAgentSession(launchPlan, undefined, activeClient), activeClient, createOptions: () => createOptions };
}

function withoutUndefinedProperties(metadata: IAgentChatMetadata): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(metadata)) {
		if (value !== undefined) {
			result[key] = value;
		}
	}
	return result;
}

function sdkSession(sessionId: string, cwd?: string, options?: ITestCopilotSessionOptions): TestCopilotSessionMetadata {
	return {
		sessionId,
		startTime: new Date(1000),
		modifiedTime: options?.modifiedTime ?? new Date(2000),
		summary: `SDK ${sessionId}`,
		isRemote: false,
		...(cwd ? {
			context: {
				workingDirectory: cwd,
				...(options?.repository !== undefined ? { repository: options.repository } : {}),
			}
		} : {}),
		...(options?.clientName !== undefined ? { clientName: options.clientName } : {}),
	};
}

/** Writes the extension-host Copilot CLI sidecar marker that makes a session adoptable-legacy. */
async function writeExtensionHostMarker(userHome: URI, sessionId: string, metadata: Record<string, unknown> = { origin: 'vscode' }): Promise<void> {
	const dir = join(getCopilotHomePath(userHome.fsPath, process.env), 'session-state', sessionId);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(join(dir, 'vscode.metadata.json'), JSON.stringify(metadata), 'utf8');
}

/**
 * Attaches a discovery listener — which is what starts a discovery pass — then
 * awaits that same memoized pass, so an expected-empty result is observed only
 * after classification actually ran. Returns a comparable snapshot of
 * everything the agent emitted.
 */
async function collectDiscoveredChats(agent: CopilotAgent): Promise<Array<{ id: string; external: boolean; adoptable: boolean }>> {
	const discovered: IAgentDiscoveredChat[] = [];
	const listener = agent.onDidDiscoverChats(chats => discovered.push(...chats));
	try {
		await (agent as unknown as { _startCopilotChatDiscovery(): Promise<void> })._startCopilotChatDiscovery();
		return discovered.map(chat => ({
			id: sessionIdOfChat(chat.chat),
			external: chat.external,
			adoptable: readSessionEhcliAdoptable(chat._meta) === true,
		}));
	} finally {
		listener.dispose();
	}
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

	test('resolves the state file from the SDK backing instead of the Agent Host session id', async () => {
		const { agent, fileService } = createTestAgentContext(disposables, { userHome: URI.file('/home/test') });
		try {
			const session = AgentSession.uri('copilotcli', 'agent-host-session-id');
			chatBackings(agent).set(buildDefaultChatUri(session).toString(), { sdkSessionId: 'sdk-conversation-id' });
			const stateFile = URI.file('/home/test/.copilot/session-state/sdk-conversation-id/events.jsonl');
			const provider = disposables.add(new InMemoryFileSystemProvider());
			disposables.add(fileService.registerProvider(Schemas.file, provider));
			const beforeCreate = await agent.getSessionStateFile(session);
			await fileService.createFile(stateFile);

			assert.deepStrictEqual({
				beforeCreate,
				afterCreate: (await agent.getSessionStateFile(session))?.toString(),
			}, {
				beforeCreate: undefined,
				afterCreate: 'file:///home/test/.copilot/session-state/sdk-conversation-id/events.jsonl',
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('initializes enablement before disabling the built-in GitHub MCP server at launch', async () => {
		let initializedSession: string | undefined;
		const disabledRootMcpServers = (CopilotAgent.prototype as unknown as {
			_disabledRootMcpServers(this: {
				readonly id: string;
				_isGitHubMcpServerEnabled(): boolean;
				readonly _customizationEnablementService: {
					initializeSession(session: string): Promise<void>;
					resolve(session: string, target: { readonly name: string }): { kind: 'resolved'; enablement: readonly [{ kind: CustomizationEnablementKind.Session; enabled: boolean }]; enabled: boolean; workingDirectory: { kind: 'workspaceless' } };
				};
			}, session: URI, sessionId: string, snapshot: { readonly mcpServers: Record<string, unknown> }): Promise<readonly string[]>;
		})._disabledRootMcpServers;
		const result = await disabledRootMcpServers.call({
			id: 'copilotcli',
			_isGitHubMcpServerEnabled: () => true,
			_customizationEnablementService: {
				initializeSession: async session => { initializedSession = session; },
				resolve: (_session, target) => {
					const enabled = target.name !== GITHUB_MCP_SERVER_NAME;
					return { kind: 'resolved', enablement: [{ kind: CustomizationEnablementKind.Session, enabled }], enabled, workingDirectory: { kind: 'workspaceless' } };
				},
			},
		}, AgentSession.uri('copilotcli', 'session'), 'sdk-session', { mcpServers: {} });

		assert.deepStrictEqual({ initializedSession, result }, {
			initializedSession: AgentSession.uri('copilotcli', 'session').toString(),
			result: [GITHUB_MCP_SERVER_NAME],
		});
	});

	test('selects provider-native autonomous session config and respects policy', async () => {
		const { agent, configurationService } = createTestAgentContext(disposables);
		try {
			const selected = agent.getAutonomousSessionConfig({});
			configurationService.updateRootConfig({ [AgentHostAutoApprovePolicyRestrictedConfigKey]: true });
			const restricted = agent.getAutonomousSessionConfig({});

			assert.deepStrictEqual({ selected, restricted }, {
				selected: { [SessionConfigKey.Mode]: 'autopilot', [SessionConfigKey.AutoApprove]: 'assisted' },
				restricted: { [SessionConfigKey.Mode]: 'autopilot' },
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('installs the GitHub telemetry callback in CopilotClientOptions', async () => {
		const client = new TestCopilotClient([]);
		const agent = createTestAgent(disposables, { copilotClient: client }) as TestableCopilotAgent;
		try {
			await agent.listChatsToMigrate();
			assert.strictEqual(typeof getCreatedClientOptions(agent).at(-1)?.onGitHubTelemetry, 'function');
		} finally {
			await disposeAgent(agent);
		}
	});

	test('threads the assignment context from root config into forwarded CLI telemetry, sticky across a wipe', async () => {
		const client = new TestCopilotClient([]);
		const telemetryService = new class extends RecordingTelemetryService {
			override publicLog(eventName?: string, data?: unknown): void {
				this.events.push({ eventName: eventName ?? '', data });
			}
		}();
		const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client, telemetryService });
		try {
			await agent.listChatsToMigrate();
			const forward = getCreatedClientOptions(agent).at(-1)?.onGitHubTelemetry;
			assert.ok(forward);

			const notification = (sessionId: string): GitHubTelemetryNotification => ({
				sessionId,
				restricted: false,
				event: { kind: 'response.success', properties: {}, metrics: {} },
			});
			configurationService.updateRootConfig({ [CopilotCliVSCodeAssignmentContextKey]: 'experiment:1' });
			await forward(notification('set'));
			configurationService.updateRootConfig({}, true);
			await forward(notification('wiped-sticky'));
			configurationService.updateRootConfig({ [CopilotCliVSCodeAssignmentContextKey]: '' });
			await forward(notification('cleared'));

			const expectedData = (sessionId: string, assignmentContext?: string) => ({
				created_at: undefined,
				model_call_id: undefined,
				exp_assignment_context: undefined,
				session_id: sessionId,
				sdk_session_id: sessionId,
				copilot_tracking_id: undefined,
				kind: 'response.success',
				restricted: false,
				...(assignmentContext ? { 'abexp.assignmentcontext': assignmentContext } : {}),
			});
			const events = telemetryService.events.map(event => {
				if (event.eventName !== 'agentHost.copilotClientStartup') {
					return event;
				}
				const data = event.data as Record<string, unknown>;
				return { ...event, data: { ...data, durationMs: typeof data.durationMs } };
			});
			assert.deepStrictEqual({ events, experimentProperties: telemetryService.experimentProperties }, {
				events: [
					{ eventName: 'agentHost.copilotClientStartup', data: { outcome: 'success', durationMs: 'number', attemptNumber: 1 } },
					{ eventName: 'copilotSdk/response.success', data: expectedData('set', 'experiment:1') },
					{ eventName: 'copilotSdk/response.success', data: expectedData('wiped-sticky', 'experiment:1') },
					{ eventName: 'copilotSdk/response.success', data: expectedData('cleared') },
				],
				experimentProperties: {},
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('correlates forwarded response telemetry with active SDK session turns', async () => {
		const client = new TestCopilotClient([]);
		const telemetryService = new class extends RecordingTelemetryService {
			override publicLog(eventName?: string, data?: unknown): void {
				this.events.push({ eventName: eventName ?? '', data });
			}
		}();
		const agent = createTestAgent(disposables, { copilotClient: client, telemetryService }) as TestableCopilotAgent;
		try {
			await agent.listChatsToMigrate();
			const forward = getCreatedClientOptions(agent).at(-1)?.onGitHubTelemetry;
			assert.ok(forward);

			chatEntriesBySdkId(agent).set('active-session', {
				chatSession: { currentTurnId: 'turn-1' } as CopilotAgentSession,
				dispose() { },
			});
			chatEntriesBySdkId(agent).set('second-active-session', {
				chatSession: { currentTurnId: 'turn-2' } as CopilotAgentSession,
				dispose() { },
			});
			chatEntriesBySdkId(agent).set('idle-session', {
				chatSession: { currentTurnId: undefined } as CopilotAgentSession,
				dispose() { },
			});
			const notification = (sessionId: string, turnId: string): GitHubTelemetryNotification => ({
				sessionId,
				restricted: false,
				event: {
					kind: 'response.success',
					properties: { turnId },
					metrics: {},
				},
			});

			await forward(notification('active-session', 'runtime-active'));
			await forward(notification('second-active-session', 'runtime-second-active'));
			await forward(notification('active-session', 'runtime-active-again'));
			await forward(notification('idle-session', 'runtime-idle'));
			await forward(notification('unknown-session', 'runtime-unknown'));

			assert.deepStrictEqual(telemetryService.events.map(event => {
				const data = event.data as Record<string, unknown>;
				return event.eventName === 'agentHost.copilotClientStartup'
					? { eventName: event.eventName, outcome: data.outcome, durationMs: typeof data.durationMs, attemptNumber: data.attemptNumber }
					: { eventName: event.eventName, sessionId: data.sdk_session_id, turnId: data.turnId };
			}), [
				{ eventName: 'agentHost.copilotClientStartup', outcome: 'success', durationMs: 'number', attemptNumber: 1 },
				{ eventName: 'copilotSdk/response.success', sessionId: 'active-session', turnId: 'turn-1' },
				{ eventName: 'copilotSdk/response.success', sessionId: 'second-active-session', turnId: 'turn-2' },
				{ eventName: 'copilotSdk/response.success', sessionId: 'active-session', turnId: 'turn-1' },
				{ eventName: 'copilotSdk/response.success', sessionId: 'idle-session', turnId: undefined },
				{ eventName: 'copilotSdk/response.success', sessionId: 'unknown-session', turnId: undefined },
			]);
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
			await agent.listChatsToMigrate();
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
				generic: ['copilotSdk/unknown_restricted', 'copilotSdk/tool_call_executed'],
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
			await agent.listChatsToMigrate();
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

	test('advertises multipleWorkingDirectories only when the hidden setting is enabled', async () => {
		const { agent, stateManager } = createTestAgentContext(disposables);
		try {
			const setMultiRoot = (enabled: boolean) => stateManager.dispatchServerAction(ROOT_STATE_URI, {
				type: ActionType.RootConfigChanged,
				config: { [AgentHostCopilotMultiRootEnabledConfigKey]: enabled },
			});
			const disabledByDefault = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
			setMultiRoot(true);
			const whenEnabled = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
			setMultiRoot(false);
			const afterDisabling = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
			assert.deepStrictEqual({ disabledByDefault, whenEnabled, afterDisabling }, {
				disabledByDefault: undefined,
				whenEnabled: { immutablePrimary: true },
				afterDisabling: undefined,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('computeFolderPickerDecision hides the picker unless multiple folders carry .github/hooks', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const folder = (name: string) => URI.from({ scheme: Schemas.inMemory, path: `/${name}` });
		const seedHook = (name: string, file = 'hook.json') => fileService.writeFile(URI.joinPath(folder(name), '.github', 'hooks', file), VSBuffer.fromString('{}'));
		const [a, b, c] = [folder('wsA'), folder('wsB'), folder('wsC')];

		const { agent, stateManager } = createTestAgentContext(disposables, { fileService });
		try {
			stateManager.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [AgentHostCopilotMultiRootEnabledConfigKey]: true } });

			await seedHook('wsB');
			const soleHookFolder = await agent.computeFolderPickerDecision([a, b, c]);

			await seedHook('wsA', 'nested/other.json');
			const multipleHookFolders = await agent.computeFolderPickerDecision([a, b, c]);

			const noHookFolders = await agent.computeFolderPickerDecision([folder('wsX'), folder('wsY')]);
			const singleWorkingDirectory = await agent.computeFolderPickerDecision([b]);

			stateManager.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [AgentHostCopilotMultiRootEnabledConfigKey]: false } });
			const multiRootDisabled = await agent.computeFolderPickerDecision([a, b, c]);

			assert.deepStrictEqual({ soleHookFolder, multipleHookFolders, noHookFolders, singleWorkingDirectory, multiRootDisabled }, {
				soleHookFolder: { hidden: true, primary: b.toString() },
				multipleHookFolders: { hidden: false },
				noHookFolders: { hidden: true },
				singleWorkingDirectory: undefined,
				multiRootDisabled: undefined,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	suite('spawned chat channel', () => {
		function fireSignal(agent: CopilotAgent, signal: AgentSignal): void {
			(agent as unknown as { _onDidChatProgress: { fire(s: AgentSignal): void } })._onDidChatProgress.fire(signal);
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

		test('getMessages resolves a canonical subagent chat through its exact parent chat', async () => {
			const agent = createTestAgent(disposables);
			const session = AgentSession.uri('copilotcli', 'parent-session');
			const parentChat = defaultChatUri(session);
			const childChat = URI.parse(buildSubagentChatUri(session.toString(), 'tool-1'));
			const turn: Turn = {
				id: 'child-turn',
				state: TurnState.Complete,
				message: { text: 'child task', origin: { kind: MessageKind.User } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'part-1', content: 'child result' }],
				usage: {},
			};
			setDefaultSessionStub(agent, AgentSession.id(session), {
				getSubagentMessages: async (toolCallId: string) => toolCallId === 'tool-1' ? [turn] : [],
				dispose: () => { },
			}, parentChat);

			try {
				const turns = await agent.chats.getMessages(childChat, {
					configurationResource: session,
					resource: childChat,
					origin: { kind: ChatOriginKind.Tool, chat: parentChat.toString(), toolCallId: 'tool-1' },
				});
				assert.deepStrictEqual(turns, [turn]);
			} finally {
				await disposeAgent(agent);
			}
		});
		test('getMessages requires the host-supplied tool origin to reconstruct a subagent chat', async () => {
			// Regression guard for the removed `chatId.startsWith('subagent/')`
			// routing fallback: without the host's explicit `Tool` origin the
			// provider must not recover a spawning chat from the URI's shape.
			const agent = createTestAgent(disposables);
			const session = AgentSession.uri('copilotcli', 'origin-required-session');
			const parentChat = defaultChatUri(session);
			const childChat = URI.parse(buildSubagentChatUri(session.toString(), 'tool-1'));
			const turn: Turn = {
				id: 'child-turn',
				state: TurnState.Complete,
				message: { text: 'child task', origin: { kind: MessageKind.User } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'part-1', content: 'child result' }],
				usage: {},
			};
			const subagentCalls: string[] = [];
			setDefaultSessionStub(agent, AgentSession.id(session), {
				getSubagentMessages: async (toolCallId: string) => {
					subagentCalls.push(toolCallId);
					return toolCallId === 'tool-1' ? [turn] : [];
				},
				dispose: () => { },
			}, parentChat);

			try {
				assert.deepStrictEqual({
					withoutOrigin: await agent.chats.getMessages(childChat, { configurationResource: session, resource: childChat }),
					subagentCalls,
					withOrigin: await agent.chats.getMessages(childChat, {
						configurationResource: session,
						resource: childChat,
						origin: { kind: ChatOriginKind.Tool, chat: parentChat.toString(), toolCallId: 'tool-1' },
					}),
				}, {
					withoutOrigin: [],
					subagentCalls: ['tool-1'],
					withOrigin: [turn],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('getMessages reconstructs a legacy subagent session address from the origin the host stamps', async () => {
			// The legacy restore path still addresses `<parent>/subagent/<id>`
			// session URIs, but Agent Host always stamps the equivalent `Tool`
			// origin, so the provider routes it exactly like a canonical
			// subagent chat without ever walking the URI.
			const agent = createTestAgent(disposables);
			const session = AgentSession.uri('copilotcli', 'legacy-subagent-session');
			const parentChat = defaultChatUri(session);
			const legacyChild = URI.parse(buildSubagentSessionUri(session.toString(), 'tool-7'));
			const turn: Turn = {
				id: 'legacy-child-turn',
				state: TurnState.Complete,
				message: { text: 'legacy child task', origin: { kind: MessageKind.User } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'part-1', content: 'legacy result' }],
				usage: {},
			};
			setDefaultSessionStub(agent, AgentSession.id(session), {
				getSubagentMessages: async (toolCallId: string) => toolCallId === 'tool-7' ? [turn] : [],
				dispose: () => { },
			}, parentChat);

			try {
				const turns = await agent.chats.getMessages(legacyChild, {
					configurationResource: session,
					resource: legacyChild,
					origin: { kind: ChatOriginKind.Tool, chat: parentChat.toString(), toolCallId: 'tool-7' },
				});
				assert.deepStrictEqual(turns, [turn]);
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

	test('queries managed settings with pre-resolved token authentication', async () => {
		let receivedInput: { authInfo?: { type: 'token'; host: string; token: string }; token?: string; signal?: AbortSignal } | undefined;
		let proxyEnvironment: Record<string, string | undefined> | undefined;
		const runtimeSdk = {
			getManagedSettings: async (input?: typeof receivedInput) => {
				receivedInput = input;
				proxyEnvironment = {
					HTTP_PROXY: process.env['HTTP_PROXY'],
					HTTPS_PROXY: process.env['HTTPS_PROXY'],
				};
				return { resolved: { source: 'none' as const, serverManaged: false, deviceManaged: false, clientManaged: false, failClosed: false, bypassPermissionsDisabled: false, managedKeys: [] } };
			},
		};
		const signal = new AbortController().signal;
		const before = {
			HTTP_PROXY: process.env['HTTP_PROXY'],
			HTTPS_PROXY: process.env['HTTPS_PROXY'],
		};

		await getCopilotManagedSettingsDiagnostics(runtimeSdk, 'token', 'https://github.example.com', signal, 3500, 'http://proxy.example.com:8080');

		assert.deepStrictEqual({
			authInfo: receivedInput?.authInfo,
			token: receivedInput?.token,
			signalForwarded: receivedInput?.signal === signal,
			proxyEnvironment,
			environmentRestored: {
				HTTP_PROXY: process.env['HTTP_PROXY'],
				HTTPS_PROXY: process.env['HTTPS_PROXY'],
			},
		}, {
			authInfo: { type: 'token', host: 'https://github.example.com', token: 'token' },
			token: 'token',
			signalForwarded: true,
			proxyEnvironment: {
				HTTP_PROXY: 'http://proxy.example.com:8080',
				HTTPS_PROXY: 'http://proxy.example.com:8080',
			},
			environmentRestored: before,
		});
	});

	test('identifies a stalled managed settings query', async () => {
		const runtimeSdk = {
			getManagedSettings: () => new Promise<never>(() => { }),
		};

		await assert.rejects(
			getCopilotManagedSettingsDiagnostics(runtimeSdk, 'token', 'https://github.com', new AbortController().signal, 10),
			/Copilot runtime managed-settings query exceeded 0.01 seconds while waiting for native MDM or GitHub policy resolution/,
		);
	});

	test('returns empty models and lists sessions before authentication', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const ownedSession = AgentSession.uri('copilotcli', 'owned-before-auth');
		const ownedDb = sessionDataService.openDatabase(ownedSession);
		// A genuinely owned session persists a working directory at materialize;
		// listing gates on that (an empty DB is a ghost / un-migrated session).
		await ownedDb.object.setMetadata('copilot.workingDirectory', URI.file('/workspace').toString());
		ownedDb.dispose();
		const client = new TestCopilotClient([sdkSession('owned-before-auth')]);
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
		try {
			const catalog = await agent.listChatsToMigrate();
			assert.deepStrictEqual({
				models: agent.models.get(),
				sessions: catalog?.map(session => sessionIdOfChat(session.chat)),
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

	test('bounds native session metadata resolution while listing legacy chats', async () => {
		class BlockingSessionDataService extends TestSessionDataService {
			readonly gate = new DeferredPromise<void>();
			activeReads = 0;
			maxActiveReads = 0;

			override async tryOpenDatabase(session: URI): Promise<IReference<SessionDatabase> | undefined> {
				this.activeReads++;
				this.maxActiveReads = Math.max(this.maxActiveReads, this.activeReads);
				await this.gate.p;
				this.activeReads--;
				return super.tryOpenDatabase(session);
			}
		}

		const sessionDataService = disposables.add(new BlockingSessionDataService());
		const client = new TestCopilotClient(Array.from({ length: 8 }, (_, index) => sdkSession(`legacy-${index}`)));
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
		try {
			const listing = agent.listChatsToMigrate();
			for (let i = 0; i < 50 && sessionDataService.activeReads < 4; i++) {
				await new Promise(resolve => setTimeout(resolve, 0));
			}
			assert.strictEqual(sessionDataService.activeReads, 4);

			sessionDataService.gate.complete();
			await listing;

			assert.strictEqual(sessionDataService.maxActiveReads, 4);
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
			const result = await provisionSession(agent, { session, workingDirectories: [workingDirectory] });
			assert.ok(result.resolvedWorkingDirectory);
			assert.deepStrictEqual({
				session: result.session.toString(),
				workingDirectory: result.resolvedWorkingDirectory.toString(),
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

	test('revoking authentication clears the token and model catalog', async () => {
		const client = new TestCopilotClient([], [{
			id: 'gpt-4o',
			name: 'GPT-4o',
		}]);
		const agent = createTestAgent(disposables, { copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'model-token');
			await waitForState(agent.models, models => models.length > 0);

			await agent.authenticate('https://api.github.com', '');
			await waitForState(agent.models, models => models.length === 0);

			assert.deepStrictEqual({
				githubToken: agent['_githubToken'],
				models: agent.models.get(),
			}, {
				githubToken: undefined,
				models: [],
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('updates every live session after a changed auth token without restarting an unchanged proxy', async () => {
		const client = new TestCopilotClient([], [{
			id: 'gpt-4o',
			name: 'GPT-4o',
		}]);
		const agent = createTestAgent(disposables, { copilotClient: client });
		const first = {
			hasActiveTurn: false,
			updates: [] as Array<{ host: string; token: string }>,
			async updateGitHubCredentials(host: string, token: string) {
				this.updates.push({ host, token });
				return { success: true, copilotUserResolved: true };
			},
			dispose() { },
		} satisfies ICredentialUpdateSession & { updates: Array<{ host: string; token: string }> };
		const second = {
			hasActiveTurn: false,
			updates: [] as Array<{ host: string; token: string }>,
			async updateGitHubCredentials(host: string, token: string) {
				this.updates.push({ host, token });
				return { success: true, copilotUserResolved: true };
			},
			dispose() { },
		} satisfies ICredentialUpdateSession & { updates: Array<{ host: string; token: string }> };
		try {
			await agent.listChatsToMigrate();
			setDefaultSessionStub(agent, 'first', first);
			setDefaultSessionStub(agent, 'second', second);
			await agent.authenticate('https://api.github.com', 'model-token-a');
			await agent.authenticate('https://api.github.com', 'model-token-a');

			assert.deepStrictEqual({
				firstUpdates: first.updates,
				secondUpdates: second.updates,
				stops: client.stopCallCount,
			}, {
				firstUpdates: [{ host: 'https://github.com', token: 'model-token-a' }],
				secondUpdates: [{ host: 'https://github.com', token: 'model-token-a' }],
				stops: 0,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('defers a proxy-change restart until credential updates finish', async () => {
		const client = new TestCopilotClient([]);
		const proxyResolver = new TestProxyResolver();
		const proxyResolutionGate = new DeferredPromise<void>();
		const credentialUpdateStarted = new DeferredPromise<void>();
		const credentialUpdateGate = new DeferredPromise<void>();
		const agent = createTestAgent(disposables, { copilotClient: client, proxyResolver });
		const session = {
			hasActiveTurn: false,
			disposed: false,
			disposedBeforeUpdateCompleted: false,
			async updateGitHubCredentials() {
				credentialUpdateStarted.complete();
				await credentialUpdateGate.p;
				this.disposedBeforeUpdateCompleted = this.disposed;
				return { success: true };
			},
			dispose() { this.disposed = true; },
		} satisfies ICredentialUpdateSession & { disposed: boolean; disposedBeforeUpdateCompleted: boolean };
		const pendingRestartCount = () => (agent as unknown as { _pendingClientRestartReasons: Set<string> })._pendingClientRestartReasons.size;
		try {
			await agent.listChatsToMigrate();
			setDefaultSessionStub(agent, 'proxy-change-during-credentials', session);
			proxyResolver.resolvedProxy = 'http://new-proxy:8080';
			proxyResolver.resolveProxyGate = proxyResolutionGate.p;

			const authentication = agent.authenticate('https://api.github.com', 'fresh-token');
			await credentialUpdateStarted.p;
			proxyResolutionGate.complete();
			for (let i = 0; i < 20 && pendingRestartCount() === 0 && client.stopCallCount === 0; i++) {
				await timeout(0);
			}
			const duringUpdate = {
				stops: client.stopCallCount,
				disposed: session.disposed,
				pendingRestarts: pendingRestartCount(),
			};

			credentialUpdateGate.complete();
			await authentication;

			assert.deepStrictEqual({
				duringUpdate,
				disposedBeforeUpdateCompleted: session.disposedBeforeUpdateCompleted,
				afterUpdate: {
					stops: client.stopCallCount,
					disposed: session.disposed,
					pendingRestarts: pendingRestartCount(),
				},
			}, {
				duringUpdate: {
					stops: 0,
					disposed: false,
					pendingRestarts: 1,
				},
				disposedBeforeUpdateCompleted: false,
				afterUpdate: {
					stops: 1,
					disposed: true,
					pendingRestarts: 0,
				},
			});
		} finally {
			proxyResolutionGate.complete();
			credentialUpdateGate.complete();
			await disposeAgent(agent);
		}
	});

	test('defers a proxy-change restart until an active turn ends', async () => {
		const client = new TestCopilotClient([]);
		const proxyResolver = new TestProxyResolver();
		const agent = createTestAgent(disposables, { copilotClient: client, proxyResolver });
		const session = {
			hasActiveTurn: true as boolean,
			disposed: false,
			async updateGitHubCredentials() { return { success: true }; },
			dispose() { this.disposed = true; },
		} satisfies ICredentialUpdateSession & { disposed: boolean };
		try {
			await agent.listChatsToMigrate();
			setDefaultSessionStub(agent, 'proxy-change', session);
			proxyResolver.resolvedProxy = 'http://new-proxy:8080';
			await agent.authenticate('https://api.github.com', 'fresh-token');
			const duringTurn = { stops: client.stopCallCount, disposed: session.disposed, proxyResolutions: proxyResolver.resolveProxyCalls };

			session.hasActiveTurn = false;
			(agent as unknown as { _onChatTurnEnded(): void })._onChatTurnEnded();
			await timeout(0);
			assert.deepStrictEqual(duringTurn, { stops: 0, disposed: false, proxyResolutions: 2 });
			assert.deepStrictEqual({ stops: client.stopCallCount, disposed: session.disposed }, { stops: 1, disposed: true });
		} finally {
			await disposeAgent(agent);
		}
	});

	test('serializes concurrent changed auth tokens so the final session credentials use the latest token', async () => {
		const client = new TestCopilotClient([]);
		const agent = createTestAgent(disposables, { copilotClient: client });
		const firstUpdateStarted = new DeferredPromise<void>();
		const firstUpdateGate = new DeferredPromise<void>();
		const session = {
			hasActiveTurn: false,
			appliedTokens: [] as string[],
			async updateGitHubCredentials(_host: string, token: string) {
				if (token === 'token-a') {
					firstUpdateStarted.complete();
					await firstUpdateGate.p;
				}
				this.appliedTokens.push(token);
				return { success: true };
			},
			dispose() { },
		} satisfies ICredentialUpdateSession & { appliedTokens: string[] };
		try {
			await agent.listChatsToMigrate();
			setDefaultSessionStub(agent, 'concurrent-auth', session);

			const authA = agent.authenticate('https://api.github.com', 'token-a');
			await firstUpdateStarted.p;
			const authB = agent.authenticate('https://api.github.com', 'token-b');
			firstUpdateGate.complete();
			await Promise.all([authA, authB]);

			assert.deepStrictEqual(session.appliedTokens, ['token-a', 'token-b']);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('defers a changed-token fallback restart until an active turn ends', async () => {
		const client = new TestCopilotClient([]);
		const agent = createTestAgent(disposables, { copilotClient: client });
		const rejected = {
			hasActiveTurn: true as boolean,
			disposed: false,
			dispose() { this.disposed = true; },
			async updateGitHubCredentials() { return { success: false }; },
		} satisfies ICredentialUpdateSession & { disposed: boolean };
		const failed = {
			hasActiveTurn: false,
			disposed: false,
			dispose() { this.disposed = true; },
			async updateGitHubCredentials() { throw new Error('runtime unavailable'); },
		} satisfies ICredentialUpdateSession & { disposed: boolean };
		try {
			await agent.listChatsToMigrate();
			setDefaultSessionStub(agent, 'rejected', rejected);
			setDefaultSessionStub(agent, 'failed', failed);

			await agent.authenticate('https://api.github.com', 'fresh-token');
			const duringTurn = { stopCount: client.stopCallCount, rejectedDisposed: rejected.disposed, failedDisposed: failed.disposed };

			rejected.hasActiveTurn = false;
			(agent as unknown as { _onChatTurnEnded(): void })._onChatTurnEnded();
			await timeout(0);

			assert.deepStrictEqual({
				duringTurn,
				afterTurn: { stopCount: client.stopCallCount, rejectedDisposed: rejected.disposed, failedDisposed: failed.disposed },
			}, {
				duringTurn: { stopCount: 0, rejectedDisposed: false, failedDisposed: false },
				afterTurn: { stopCount: 1, rejectedDisposed: true, failedDisposed: true },
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('keeps a session alive when credentials update without Copilot user metadata', async () => {
		const client = new TestCopilotClient([]);
		const agent = createTestAgent(disposables, { copilotClient: client });
		const session = {
			hasActiveTurn: false,
			updates: 0,
			async updateGitHubCredentials() {
				this.updates++;
				return { success: true, copilotUserResolved: false };
			},
			dispose() { },
		} satisfies ICredentialUpdateSession & { updates: number };
		try {
			await agent.listChatsToMigrate();
			setDefaultSessionStub(agent, 'degraded-metadata', session);
			await agent.authenticate('https://api.github.com', 'fresh-token');

			assert.deepStrictEqual({ updates: session.updates, stops: client.stopCallCount }, { updates: 1, stops: 0 });
		} finally {
			await disposeAgent(agent);
		}
	});

	test('rearms expired Copilot auth notifications after every authenticate call', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const { agent, instantiationService } = createTestAgentContext(disposables, { sessionDataService });
		const mockSession = new MockCopilotSession();
		const createdSession = createAgentSessionThroughAgent(agent, instantiationService, { mockSession });
		const authRequests: Array<{ readonly resource: ProtectedResourceMetadata; readonly reason?: string }> = [];
		disposables.add(autorun(reader => {
			const requirement = agent.authenticationRequired.read(reader);
			if (requirement) {
				authRequests.push(requirement);
			}
		}));
		try {
			await createdSession.session.initializeSession();
			(agent as unknown as {
				_registerLiveChat(chat: URI, session: CopilotAgentSession, activeClient: unknown): void;
			})._registerLiveChat(createdSession.session.chatChannelUri, createdSession.session, createdSession.activeClient);

			const authError = (errorType: 'authentication' | 'authorization', statusCode = 401) => mockSession.emit({
				type: 'session.error',
				data: { errorType, message: 'token rejected', statusCode },
			} as SessionEventPayload<'session.error'>);
			authError('authentication');
			authError('authorization');
			authError('authentication', 403);

			await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'fresh-token');
			authError('authorization');
			await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'fresh-token');
			authError('authentication');
			await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'new-token');
			authError('authentication');

			assert.deepStrictEqual(authRequests, [
				{ resource: GITHUB_COPILOT_PROTECTED_RESOURCE, reason: 'expired' },
				{ resource: GITHUB_COPILOT_PROTECTED_RESOURCE, reason: 'expired' },
				{ resource: GITHUB_COPILOT_PROTECTED_RESOURCE, reason: 'expired' },
				{ resource: GITHUB_COPILOT_PROTECTED_RESOURCE, reason: 'expired' },
			]);
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

	test('requests reauthentication when refreshing models returns unauthorized', async () => {
		const client = new TestCopilotClient([], [{
			id: 'gpt-4o',
			name: 'GPT-4o',
		}]);
		client.modelListErrors.push(new Error('Failed to fetch Copilot user info: 401 Unauthorized: {"message":"Bad credentials"}'));
		const agent = createTestAgent(disposables, { copilotClient: client });
		const authRequests: Array<{ readonly resource: ProtectedResourceMetadata; readonly reason?: string }> = [];
		disposables.add(autorun(reader => {
			const requirement = agent.authenticationRequired.read(reader);
			if (requirement) {
				authRequests.push(requirement);
			}
		}));
		try {
			await agent.authenticate('https://api.github.com', 'token');
			await waitForState(agent.models, models => models.length > 0);

			assert.deepStrictEqual(authRequests, [{
				resource: GITHUB_COPILOT_PROTECTED_RESOURCE,
				reason: 'expired',
			}]);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('recovers the client and reports telemetry when the SDK connection is closed', async () => {
		const client = new TestCopilotClient([], [{
			id: 'gpt-4o',
			name: 'GPT-4o',
		}]);
		client.modelListErrors.push(new Error('Connection is closed.'));
		const telemetryService = new RecordingTelemetryService();
		const agent = createTestAgent(disposables, { copilotClient: client, telemetryService });
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, m => m.length > 0);
			const failure = telemetryService.errorEvents[0].data as Record<string, unknown>;
			const recovery = telemetryService.events.find(event => event.eventName === 'agentHost.copilotClientRecovery')?.data as Record<string, unknown>;

			assert.deepStrictEqual({
				modelNames: models.map(model => model.name),
				startCount: client.startCallCount,
				stopCount: client.stopCallCount,
				requestCount: client.modelListRequests.length,
				failure: {
					...failure,
					clientFailureId: typeof failure.clientFailureId,
					callstack: typeof failure.callstack,
				},
				recovery: {
					...recovery,
					clientFailureIdMatches: recovery.clientFailureId === failure.clientFailureId,
					clientFailureId: typeof recovery.clientFailureId,
					durationMs: typeof recovery.durationMs,
				},
			}, {
				modelNames: ['GPT-4o'],
				startCount: 2,
				stopCount: 1,
				requestCount: 2,
				failure: {
					clientFailureId: 'string',
					failureKind: 'connectionClosed',
					operation: 'modelRefresh',
					activeTurnCount: 0,
					recoveryStarted: true,
					errorName: 'Error',
					errorCode: undefined,
					msg: 'Connection is closed.',
					callstack: 'string',
				},
				recovery: {
					clientFailureId: 'string',
					failureKind: 'connectionClosed',
					durationMs: 'number',
					failedTurnCount: 0,
					stopSucceeded: true,
					clientFailureIdMatches: true,
				},
			});

		} finally {
			await disposeAgent(agent);
		}
	});

	test('reports one successful Copilot client startup outcome for concurrent callers', async () => {
		const client = new TestCopilotClient([]);
		const startGate = new DeferredPromise<void>();
		client.startGate = startGate.p;
		const telemetryService = new RecordingTelemetryService();
		const agent = createTestAgent(disposables, { copilotClient: client, telemetryService });
		const first = agent.listChatsToMigrate();
		const second = agent.listChatsToMigrate();
		try {
			await client.startCalled.p;
			startGate.complete();
			await Promise.all([first, second]);
			const startupEvents = telemetryService.events
				.filter(event => event.eventName === 'agentHost.copilotClientStartup')
				.map(event => {
					const data = event.data as Record<string, unknown>;
					return { ...data, durationMs: typeof data.durationMs };
				});

			assert.deepStrictEqual({
				startCallCount: client.startCallCount,
				listSessionCallCount: client.listSessionCallCount,
				startupEvents,
			}, {
				startCallCount: 1,
				listSessionCallCount: 2,
				startupEvents: [{
					outcome: 'success',
					durationMs: 'number',
					attemptNumber: 1,
				}],
			});
		} finally {
			startGate.complete();
			await Promise.allSettled([first, second]);
			await disposeAgent(agent);
		}
	});

	test('reports one startup failure and no operation failure when concurrent callers share a failed start', async () => {
		const client = new TestCopilotClient([]);
		const startGate = new DeferredPromise<void>();
		client.startGate = startGate.p;
		client.startError = new Error('Connection is closed.');
		const telemetryService = new RecordingTelemetryService();
		const agent = createTestAgent(disposables, { copilotClient: client, telemetryService });
		const first = agent.listChatsToMigrate();
		const second = agent.listChatsToMigrate();
		try {
			await client.startCalled.p;
			startGate.complete();
			const results = await Promise.all([first, second]);
			const startupEvents = telemetryService.events.map(event => {
				const data = event.data as Record<string, unknown>;
				return { eventName: event.eventName, ...data, durationMs: typeof data.durationMs };
			});

			assert.deepStrictEqual({
				results,
				startCallCount: client.startCallCount,
				stopCallCount: client.stopCallCount,
				listSessionCallCount: client.listSessionCallCount,
				startupEvents,
				errorEvents: telemetryService.errorEvents,
			}, {
				results: [undefined, undefined],
				startCallCount: 1,
				stopCallCount: 0,
				listSessionCallCount: 0,
				startupEvents: [{
					eventName: 'agentHost.copilotClientStartup',
					outcome: 'failure',
					durationMs: 'number',
					attemptNumber: 1,
					startupFailureCause: 'other',
					startupFailureResource: 'other',
				}],
				errorEvents: [],
			});
		} finally {
			startGate.complete();
			await Promise.allSettled([first, second]);
			client.startError = undefined;
			await disposeAgent(agent);
		}
	});

	test('surfaces unavailable (not a rejection) for a classified Copilot client startup failure', async () => {
		// A recognized startup error means the CLI client is transiently
		// unavailable, not that this provider authoritatively has no legacy
		// chats: `listChatsToMigrate` must report unavailable (still reporting
		// the failure via telemetry) rather than reject or return complete-empty.
		const client = new TestCopilotClient([]);
		client.startError = new Error('Failed to start CLI server: spawn failed');
		const telemetryService = new RecordingTelemetryService();
		const agent = createTestAgent(disposables, { copilotClient: client, telemetryService });
		try {
			assert.strictEqual(await agent.listChatsToMigrate(), undefined);
			const startup = telemetryService.events.find(event => event.eventName === 'agentHost.copilotClientStartup')?.data as Record<string, unknown>;
			assert.deepStrictEqual({
				operationFailureEvents: telemetryService.errorEvents.filter(event => event.eventName === 'agentHost.copilotClientFailure').length,
				startup: {
					...startup,
					durationMs: typeof startup.durationMs,
				},
			}, {
				operationFailureEvents: 0,
				startup: {
					outcome: 'failure',
					durationMs: 'number',
					attemptNumber: 1,
					startupFailureCause: 'spawnFailed',
					startupFailureResource: 'other',
					startupExitCode: undefined,
				},
			});
		} finally {
			client.startError = undefined;
			await disposeAgent(agent);
		}
	});

	test('reports bounded Copilot client startup failure details', async () => {
		const client = new TestCopilotClient([]);
		const telemetryService = new RecordingTelemetryService();
		const agent = createTestAgent(disposables, { copilotClient: client, telemetryService });
		const cases = [{
			message: 'CLI server exited with code 1\nNative addon "runtime" not found. prebuilds/win32-x64/runtime.node: The specified procedure could not be found. runtime.win32-x64-msvc.node: Cannot find module',
			expected: { startupFailureCause: 'nativeModuleProcedureNotFound', startupFailureResource: 'runtime', startupExitCode: 1 },
		}, {
			message: 'CLI server exited with code 3221226505\nprebuilds/win32-x64/runtime.node: A dynamic link library (DLL) initialization routine failed.',
			expected: { startupFailureCause: 'nativeModuleInitializationFailed', startupFailureResource: 'runtime', startupExitCode: 3221226505 },
		}, {
			message: 'CLI server exited with code 1\nPermission denied',
			expected: { startupFailureCause: 'permissionDenied', startupFailureResource: 'other', startupExitCode: 1 },
		}, {
			message: 'Failed to start CLI server: spawn EACCES',
			expected: { startupFailureCause: 'permissionDenied', startupFailureResource: 'other', startupExitCode: undefined },
		}, {
			message: 'CLI server exited with code 1\nCannot find module conpty.node',
			expected: { startupFailureCause: 'nativeModuleNotFound', startupFailureResource: 'conpty', startupExitCode: 1 },
		}, {
			message: 'CLI server exited with code 1\nCannot find module cli-native.node',
			expected: { startupFailureCause: 'nativeModuleNotFound', startupFailureResource: 'cliNative', startupExitCode: 1 },
		}, {
			message: 'CLI server exited with code 1\nCannot find module wxc-exec.exe',
			expected: { startupFailureCause: 'nativeModuleNotFound', startupFailureResource: 'sandbox', startupExitCode: 1 },
		}, {
			message: 'CLI server exited with code 1\nCannot find module /Users/wxc/project/helper.node',
			expected: { startupFailureCause: 'nativeModuleNotFound', startupFailureResource: 'other', startupExitCode: 1 },
		}, {
			message: 'Timeout waiting for CLI server to start',
			expected: { startupFailureCause: 'timeout', startupFailureResource: 'other', startupExitCode: undefined },
		}, {
			message: 'CLI server exited unexpectedly with code 3221225477',
			expected: { startupFailureCause: 'processExitedUnexpectedly', startupFailureResource: 'other', startupExitCode: 3221225477 },
		}, {
			message: 'CLI server exited with code 0',
			expected: { startupFailureCause: 'processExited', startupFailureResource: 'other', startupExitCode: 0 },
		}, {
			message: 'CLI server exited with code 9007199254740992',
			expected: { startupFailureCause: 'processExited', startupFailureResource: 'other', startupExitCode: undefined },
		}];

		try {
			for (const testCase of cases) {
				client.startError = new Error(testCase.message);
				// All of these are recognized startup failures: the client is
				// transiently unavailable, so `listChatsToMigrate` reports
				// unavailable (still reporting telemetry below) rather than
				// rejecting.
				assert.strictEqual(await agent.listChatsToMigrate(), undefined);
			}

			assert.deepStrictEqual(telemetryService.events.filter(event => event.eventName === 'agentHost.copilotClientStartup').map(event => {
				const data = event.data as Record<string, unknown>;
				return {
					outcome: data.outcome,
					durationMs: typeof data.durationMs,
					attemptNumber: data.attemptNumber,
					startupFailureCause: data.startupFailureCause,
					startupFailureResource: data.startupFailureResource,
					startupExitCode: data.startupExitCode,
				};
			}), cases.map((testCase, index) => ({
				outcome: 'failure',
				durationMs: 'number',
				attemptNumber: index + 1,
				...testCase.expected,
			})));
		} finally {
			client.startError = undefined;
			await disposeAgent(agent);
		}
	});

	test('coalesces closed connection recovery and preserves an already-cancelled turn', async () => {
		type RecoveryInternals = {
			_handleClientOperationFailure(error: unknown, operation: 'modelRefresh'): Promise<{ failedTurnIds: ReadonlySet<string> } | undefined>;
		};
		class GatedStopClient extends TestCopilotClient {
			readonly stopGate = new DeferredPromise<void>();

			override async stop(): ReturnType<ITestCopilotClient['stop']> {
				await this.stopGate.p;
				return super.stop();
			}
		}
		const client = new GatedStopClient([]);
		const telemetryService = new RecordingTelemetryService();
		const agent = createTestAgent(disposables, { copilotClient: client, telemetryService });
		const cancelledChat = defaultChatUri(AgentSession.uri('copilotcli', 'cancelled'));
		const failedChat = defaultChatUri(AgentSession.uri('copilotcli', 'failed'));
		const calls = {
			cancelled: { discard: 0, fail: 0, dispose: 0 },
			failed: { discard: 0, fail: 0, dispose: 0 },
		};
		let cancelledActive = true;
		let failedActive = true;
		setDefaultSessionStub(agent, 'cancelled', {
			sessionId: 'cancelled',
			sessionUri: AgentSession.uri('copilotcli', 'cancelled'),
			chatUri: cancelledChat,
			get hasActiveTurn() { return cancelledActive; },
			abort: async () => { throw new Error('Connection is closed.'); },
			discardActiveTurn: () => { calls.cancelled.discard++; cancelledActive = false; },
			failActiveTurn: () => {
				if (!cancelledActive) {
					return undefined;
				}
				calls.cancelled.fail++;
				cancelledActive = false;
				return 'cancelled-turn';
			},
			dispose: () => calls.cancelled.dispose++,
		});
		setDefaultSessionStub(agent, 'failed', {
			sessionId: 'failed',
			sessionUri: AgentSession.uri('copilotcli', 'failed'),
			chatUri: failedChat,
			get hasActiveTurn() { return failedActive; },
			discardActiveTurn: () => { calls.failed.discard++; failedActive = false; },
			failActiveTurn: () => {
				if (!failedActive) {
					return undefined;
				}
				calls.failed.fail++;
				failedActive = false;
				return 'failed-turn';
			},
			dispose: () => calls.failed.dispose++,
		});
		try {
			await agent.listChatsToMigrate();
			const abort = agent.chats.abort(cancelledChat, exactChatContext(AgentSession.uri('copilotcli', 'cancelled'), cancelledChat));
			for (let i = 0; i < 100 && calls.cancelled.discard === 0; i++) {
				await timeout(0);
			}
			const internals = agent as unknown as RecoveryInternals;
			const second = internals._handleClientOperationFailure(new Error('Connection is closed.'), 'modelRefresh');
			client.stopGate.complete();
			const [, secondResult] = await Promise.all([abort, second]);
			const failures = telemetryService.errorEvents
				.filter(event => event.eventName === 'agentHost.copilotClientFailure')
				.map(event => event.data as Record<string, unknown>);
			const recoveryTurns = telemetryService.errorEvents
				.filter(event => event.eventName === 'agentHost.copilotClientRecoveryTurnFailed')
				.map(event => event.data as Record<string, unknown>);
			const recovery = telemetryService.events.find(event => event.eventName === 'agentHost.copilotClientRecovery')?.data as Record<string, unknown>;

			assert.deepStrictEqual({
				calls,
				secondFailedTurnIds: [...(secondResult?.failedTurnIds ?? [])],
				stopCount: client.stopCallCount,
				remainingSessions: chatEntriesBySdkId(agent).size,
				failures: failures.map(failure => ({
					...failure,
					clientFailureId: typeof failure.clientFailureId,
					callstack: typeof failure.callstack,
				})),
				recoveryTurns: recoveryTurns.map(recoveryTurn => ({
					...recoveryTurn,
					clientFailureIdMatches: recoveryTurn.clientFailureId === recovery.clientFailureId,
					clientFailureId: typeof recoveryTurn.clientFailureId,
				})),
				recovery: {
					...recovery,
					clientFailureIdMatches: failures.every(failure => failure.clientFailureId === recovery.clientFailureId),
					clientFailureId: typeof recovery.clientFailureId,
					durationMs: typeof recovery.durationMs,
				},
			}, {
				calls: {
					cancelled: { discard: 1, fail: 0, dispose: 1 },
					failed: { discard: 0, fail: 1, dispose: 1 },
				},
				secondFailedTurnIds: ['failed-turn'],
				stopCount: 1,
				remainingSessions: 0,
				failures: [{
					clientFailureId: 'string',
					failureKind: 'connectionClosed',
					operation: 'abort',
					agentSessionId: 'cancelled',
					chatSessionId: getTelemetryChatSessionId(cancelledChat),
					turnId: undefined,
					sdkSessionId: 'cancelled',
					activeTurnCount: 1,
					recoveryStarted: true,
					errorName: 'Error',
					errorCode: undefined,
					msg: 'Connection is closed.',
					callstack: 'string',
				}, {
					clientFailureId: 'string',
					failureKind: 'connectionClosed',
					operation: 'modelRefresh',
					activeTurnCount: 0,
					recoveryStarted: false,
					errorName: 'Error',
					errorCode: undefined,
					msg: 'Connection is closed.',
					callstack: 'string',
				}],
				recoveryTurns: [{
					clientFailureId: 'string',
					agentSessionId: 'failed',
					chatSessionId: getTelemetryChatSessionId(failedChat),
					turnId: 'failed-turn',
					sdkSessionId: 'failed',
					clientFailureIdMatches: true,
				}],
				recovery: {
					clientFailureId: 'string',
					failureKind: 'connectionClosed',
					durationMs: 'number',
					failedTurnCount: 1,
					stopSucceeded: true,
					clientFailureIdMatches: true,
				},
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('reports but does not recover or discard for another classified abort failure', async () => {
		const telemetryService = new RecordingTelemetryService();
		const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]), telemetryService });
		const chat = defaultChatUri(AgentSession.uri('copilotcli', 'abort-failure'));
		let discardCount = 0;
		setDefaultSessionStub(agent, 'abort-failure', {
			chatUri: chat,
			hasActiveTurn: true,
			abort: async () => { throw new Error('Client not connected'); },
			discardActiveTurn: () => discardCount++,
			dispose: () => { },
		});
		try {
			await assert.rejects(agent.chats.abort(chat, {
				...exactChatContext(AgentSession.uri('copilotcli', 'abort-failure'), chat),
				clientTelemetryContext: {
					clientType: AgentHostClientType.EditorWindow,
					connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
					transportKind: AgentHostTransportKind.MessagePort,
					hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
					machineId: 'client-machine-id',
					devDeviceId: 'client-dev-device-id',
				},
			}), /Client not connected/);
			const failure = telemetryService.errorEvents[0].data as Record<string, unknown>;
			assert.deepStrictEqual({
				discardCount,
				remainingSessions: chatEntriesBySdkId(agent).size,
				failure: {
					...failure,
					clientFailureId: typeof failure.clientFailureId,
					callstack: typeof failure.callstack,
				},
			}, {
				discardCount: 0,
				remainingSessions: 1,
				failure: {
					clientFailureId: 'string',
					failureKind: 'clientNotConnected',
					operation: 'abort',
					initiatorClientType: 'editor_window',
					initiatorConnectionKind: 'remote_extension_host',
					initiatorTransportKind: 'message_port',
					hostLaunchKind: 'vscode_main_process',
					initiatorMachineId: 'client-machine-id',
					initiatorDevDeviceId: 'client-dev-device-id',
					agentSessionId: 'abort-failure',
					chatSessionId: getTelemetryChatSessionId(chat),
					turnId: undefined,
					sdkSessionId: 'abort-failure',
					activeTurnCount: 1,
					recoveryStarted: false,
					errorName: 'Error',
					errorCode: undefined,
					msg: 'Client not connected',
					callstack: 'string',
				},
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

	test('retains the previous model catalog when a token refresh cannot update it', async () => {
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

	test('coalesces concurrent refreshModels calls onto one models.list request', async () => {
		const client = new TestCopilotClient([], [{
			id: 'gpt-4o',
			name: 'GPT-4o',
		}]);
		const agent = createTestAgent(disposables, { copilotClient: client });
		try {
			// Block the first request in flight so the second caller has
			// something to coalesce onto: an auth-triggered refresh landing on
			// top of a periodic scheduler tick must not double-hit the service.
			const gate = new DeferredPromise<void>();
			client.modelListGate = gate.p;
			await agent.authenticate('https://api.github.com', 'token');

			const first = agent.refreshModels();
			const second = agent.refreshModels();
			gate.complete();
			await Promise.all([first, second]);

			assert.deepStrictEqual({
				requests: client.modelListRequests,
				modelNames: agent.models.get().map(m => m.name),
			}, {
				requests: [{ gitHubToken: 'token' }],
				modelNames: ['GPT-4o'],
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

	test('does not publish an in-flight model refresh after shutdown', async () => {
		const client = new TestCopilotClient([], [{
			id: 'initial',
			name: 'Initial',
		}]);
		const agent = createTestAgent(disposables, { copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token');
			await waitForState(agent.models, models => models.some(model => model.id === 'initial'));
			await Promise.resolve();

			const gate = new DeferredPromise<void>();
			client.modelListGates.push(gate.p);
			client.modelListResponses.push([{ id: 'late', name: 'Late' }]);
			const requestsBefore = client.modelListRequests.length;
			const refresh = agent.refreshModels();
			for (let i = 0; i < 500 && client.modelListRequests.length <= requestsBefore; i++) {
				await timeout(1);
			}
			assert.strictEqual(client.modelListRequests.length, requestsBefore + 1, 'expected the gated model request to start');

			await agent.shutdown();
			gate.complete();
			await refresh;

			assert.deepStrictEqual(agent.models.get().map(model => model.id), ['initial']);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('preserves startup cancellation when stopping the started client fails', async () => {
		class FailingStopClient extends TestCopilotClient {
			override async stop(): ReturnType<ITestCopilotClient['stop']> {
				await super.stop();
				throw new Error('stop failed');
			}
		}
		const client = new FailingStopClient([]);
		const startGate = new DeferredPromise<void>();
		client.startGate = startGate.p;
		const telemetryService = new RecordingTelemetryService();
		const agent = createTestAgent(disposables, { copilotClient: client, telemetryService });
		try {
			const listPromise = agent.listChatsToMigrate();
			await client.startCalled.p;
			const shutdownPromise = agent.shutdown();
			startGate.complete();

			// Shutting down mid-start is "client transiently unavailable", not
			// an authoritative "no chats to migrate" answer, so `listChatsToMigrate`
			// reports unavailable rather than rejecting with the
			// `CancellationError` that `_ensureClient` itself throws.
			assert.strictEqual(await listPromise, undefined);
			await shutdownPromise;

			assert.deepStrictEqual({
				starts: client.startCallCount,
				stops: client.stopCallCount,
				startup: telemetryService.events
					.filter(event => event.eventName === 'agentHost.copilotClientStartup')
					.map(event => {
						const data = event.data as Record<string, unknown>;
						return { ...data, durationMs: typeof data.durationMs };
					}),
			}, {
				starts: 1,
				stops: 1,
				startup: [{
					outcome: 'cancelled',
					durationMs: 'number',
					attemptNumber: 1,
				}],
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('createChat infers workspace-less from an omitted workingDirectory and uses a stable scratch dir', async () => {
		const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/qc-home-`));
		const agent = createTestAgent(disposables, { userHome });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			const result = await provisionSession(agent, {
				session: AgentSession.uri('copilotcli', 'temp-fallback'),
			});

			assert.strictEqual(result.provisional, true);
			const resultWorkingDirectory = result.resolvedWorkingDirectory;
			assert.ok(resultWorkingDirectory);
			const expected = URI.joinPath(userHome, '.copilot', 'chats', 'temp-fallback');
			assert.strictEqual(resultWorkingDirectory.scheme, Schemas.file);
			assert.strictEqual(resultWorkingDirectory.fsPath, expected.fsPath);
			assert.deepStrictEqual(await fs.readdir(resultWorkingDirectory.fsPath), []);
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

		test('session teardown cleans up the quick chat scratch dir', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/qc-home-`));
			const agent = createTestAgent(disposables, { userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'qc-dispose');
				const result = await provisionSession(agent, { session });
				const scratchDir = URI.joinPath(userHome, '.copilot', 'chats', 'qc-dispose');
				await fs.access(scratchDir.fsPath);
				// No `workingDirectories` was supplied at creation, so the provider's
				// own provisional record already carries `workspaceless: true`; chat
				// disposal reads that (never the host) to decide the scratch dir goes.
				await disposeProvisionedSession(agent, result.session);
				await assert.rejects(() => fs.access(scratchDir.fsPath));
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		}).timeout(30_000);
	});

	suite('working-directory persistence', () => {
		const repoA = URI.file('/repoA');
		const repoB = URI.file('/repoB');
		const repoC = URI.file('/repoC');

		async function restore(seed: (db: ReturnType<TestSessionDataService['openDatabase']>) => Promise<void>, cwd?: string): Promise<{ list: string[] | undefined; meta: string[] | undefined }> {
			const sessionId = 'wd-persist';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const db = sessionDataService.openDatabase(session);
			// Mark the project resolved so the restore path does not probe git.
			await db.object.setMetadata('copilot.project.resolved', 'true');
			await seed(db);
			db.dispose();
			const client = new TestCopilotClient([sdkSession(sessionId, cwd)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'token');
				const catalog = await agent.listChatsToMigrate();
				const listed = catalog?.find(s => sessionIdOfChat(s.chat) === sessionId);
				const chat = defaultChatUri(session);
				const meta = await agent.getChatMetadata(chat, exactChatContext(session, chat, session));
				return {
					list: listed?.workingDirectories?.map(d => d.toString()),
					meta: meta?.workingDirectories?.map(d => d.toString()),
				};
			} finally {
				await disposeAgent(agent);
			}
		}

		test('restores the persisted ordered set from copilot.workingDirectories', async () => {
			const result = await restore(async db => {
				await db.object.setMetadata('copilot.workingDirectories', JSON.stringify([repoA, repoB, repoC].map(d => d.toString())));
				await db.object.setMetadata('copilot.workingDirectory', repoA.toString());
			});
			assert.deepStrictEqual(result, {
				list: [repoA.toString(), repoB.toString(), repoC.toString()],
				meta: [repoA.toString(), repoB.toString(), repoC.toString()],
			});
		});

		test('falls back to the legacy single working directory when the set is absent', async () => {
			const result = await restore(async db => {
				await db.object.setMetadata('copilot.workingDirectory', repoA.toString());
			});
			assert.deepStrictEqual(result, {
				list: [repoA.toString()],
				meta: [repoA.toString()],
			});
		});

		test('falls back to the legacy single working directory when the set is malformed', async () => {
			const result = await restore(async db => {
				await db.object.setMetadata('copilot.workingDirectories', 'not-json');
				await db.object.setMetadata('copilot.workingDirectory', repoA.toString());
			});
			assert.deepStrictEqual(result, {
				list: [repoA.toString()],
				meta: [repoA.toString()],
			});
		});
	});

	suite('restart on startup config change', () => {

		class StopCountingClient extends TestCopilotClient {
			stopCount = 0;
			stopGate: Promise<void> | undefined;
			stopError: Error | undefined;
			override async stop(): ReturnType<ITestCopilotClient['stop']> {
				this.stopCount++;
				await this.stopGate;
				if (this.stopError) {
					throw this.stopError;
				}
				return super.stop();
			}
		}

		/** A client whose start can flip a startup-config value via `onAfterStart`. */
		class ConfigChangeOnStartClient extends TestCopilotClient {
			onAfterStart: (() => void) | undefined;
			override async start(): Promise<void> {
				await super.start();
				this.onAfterStart?.();
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

		test('self-heals a configuration-changed cold-start abort when stopping the started client fails', async () => {
			const client = new StopCountingClient([]);
			const startGate = new DeferredPromise<void>();
			client.startGate = startGate.p;
			client.stopError = new Error('stop failed');
			const telemetryService = new RecordingTelemetryService();
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client, telemetryService });
			const startup = agent.listChatsToMigrate();
			try {
				await client.startCalled.p;
				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				startGate.complete();

				const catalog = await startup;
				const startupEvents = telemetryService.events.map(event => {
					const data = event.data as Record<string, unknown>;
					return {
						eventName: event.eventName,
						outcome: data.outcome,
						durationMs: typeof data.durationMs,
						attemptNumber: data.attemptNumber,
						startupFailureCause: data.startupFailureCause,
						startupFailureResource: data.startupFailureResource,
						startupExitCode: data.startupExitCode,
					};
				});
				assert.deepStrictEqual({
					catalog,
					startCallCount: client.startCallCount,
					stopCount: client.stopCount,
					startupEvents,
				}, {
					catalog: [],
					startCallCount: 2,
					stopCount: 1,
					startupEvents: [{
						eventName: 'agentHost.copilotClientStartup',
						outcome: 'failure',
						durationMs: 'number',
						attemptNumber: 1,
						startupFailureCause: 'configurationChanged',
						startupFailureResource: 'other',
						startupExitCode: undefined,
					}, {
						eventName: 'agentHost.copilotClientStartup',
						outcome: 'success',
						durationMs: 'number',
						attemptNumber: 2,
						startupFailureCause: undefined,
						startupFailureResource: undefined,
						startupExitCode: undefined,
					}],
				});
			} finally {
				client.stopError = undefined;
				startGate.complete();
				await startup;
				await disposeAgent(agent);
			}
		});

		test('self-heals a clean configuration-changed cold-start abort and returns the catalog', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const ownedSession = AgentSession.uri('copilotcli', 'owned-selfheal');
			const ownedDb = sessionDataService.openDatabase(ownedSession);
			await ownedDb.object.setMetadata('copilot.workingDirectory', URI.file('/workspace').toString());
			ownedDb.dispose();
			const client = new ConfigChangeOnStartClient([sdkSession('owned-selfheal')]);
			const telemetryService = new RecordingTelemetryService();
			const { agent, configurationService } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, telemetryService });
			// Change a startup-config value only while the first client starts, so
			// that start aborts as config-changed and the second start (with the
			// now-current config) succeeds.
			client.onAfterStart = () => {
				if (client.startCallCount === 1) {
					configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				}
			};
			try {
				const catalog = await agent.listChatsToMigrate();
				const startupOutcomes = telemetryService.events
					.filter(event => event.eventName === 'agentHost.copilotClientStartup')
					.map(event => (event.data as Record<string, unknown>).outcome);
				assert.deepStrictEqual({
					sessions: catalog?.map(session => sessionIdOfChat(session.chat)),
					startCallCount: client.startCallCount,
					stopCallCount: client.stopCallCount,
					startupOutcomes,
				}, {
					sessions: ['owned-selfheal'],
					startCallCount: 2,
					stopCallCount: 1,
					startupOutcomes: ['failure', 'success'],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('self-heals a clean configuration-changed cold-start abort on the restore describe path', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const session = AgentSession.uri('copilotcli', 'restore-target');
			const db = sessionDataService.openDatabase(session);
			await db.object.setMetadata('copilot.workingDirectory', URI.file('/workspace').toString());
			db.dispose();
			const client = new ConfigChangeOnStartClient([sdkSession('restore-target')]);
			const { agent, configurationService } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client });
			client.onAfterStart = () => {
				if (client.startCallCount === 1) {
					configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				}
			};
			try {
				const chat = defaultChatUri(session);
				const metadata = await agent.getChatMetadata(chat, exactChatContext(session, chat, session));
				assert.deepStrictEqual({
					metadata: metadata && withoutUndefinedProperties(metadata),
					startCallCount: client.startCallCount,
					stopCallCount: client.stopCallCount,
					getSessionMetadataCalls: client.getSessionMetadataCalls,
				}, {
					metadata: {
						chat,
						startTime: 1000,
						modifiedTime: 2000,
						summary: 'SDK restore-target',
						workingDirectories: [URI.file('/workspace')],
					},
					startCallCount: 2,
					stopCallCount: 1,
					getSessionMetadataCalls: ['restore-target'],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('gives up after the bounded number of re-acquires when the startup config keeps changing', async () => {
			const client = new ConfigChangeOnStartClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			// Flip the value on every start so each attempt aborts as config-changed.
			client.onAfterStart = () => {
				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: client.startCallCount % 2 === 0 });
			};
			try {
				const result = await agent.listChatsToMigrate();
				assert.deepStrictEqual({
					result,
					startCallCount: client.startCallCount,
				}, {
					result: undefined,
					startCallCount: 2,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('shares one global re-acquire budget: a late joiner cannot drive an extra start', async () => {
			const releaseAttempt2 = new DeferredPromise<void>();
			// Parks its own second start so the healing sequence is observably in
			// flight (mid-retry, attempt 2 running) when the late joiner arrives.
			class LateJoinerBudgetClient extends ConfigChangeOnStartClient {
				override async start(): Promise<void> {
					if (this.startCallCount + 1 === 2) {
						this.startGate = releaseAttempt2.p;
					}
					await super.start();
				}
			}
			const client = new LateJoinerBudgetClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			// Alternate the value so every attempt's post-start config differs from
			// its pre-start snapshot and aborts as config-changed.
			client.onAfterStart = () => {
				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: client.startCallCount % 2 === 0 });
			};
			const ensureClient = () => (agent as unknown as { _ensureClient(): Promise<unknown> })._ensureClient();
			try {
				const first = ensureClient();
				// Wait until attempt 1 has aborted (config-changed) and attempt 2 has
				// begun and parked on its gate: the sequence is now mid-retry.
				for (let i = 0; i < 50 && client.startCallCount < 2; i++) {
					await timeout(0);
				}
				// The late joiner arrives while attempt 2 is in flight.
				const second = ensureClient();
				releaseAttempt2.complete();
				const outcomes = await Promise.allSettled([first, second]);
				// Global budget: the late joiner shares the in-flight sequence, so it
				// cannot force a third start. A per-caller budget would instead let
				// `second` run its own retry after attempt 2 aborts, driving a third.
				assert.deepStrictEqual({
					firstRejected: outcomes[0].status === 'rejected',
					secondRejected: outcomes[1].status === 'rejected',
					startCallCount: client.startCallCount,
				}, {
					firstRejected: true,
					secondRejected: true,
					startCallCount: 2,
				});
			} finally {
				releaseAttempt2.complete();
				await disposeAgent(agent);
			}
		});

		test('coalesces concurrent client acquisitions across a single re-acquire', async () => {
			const client = new ConfigChangeOnStartClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			client.onAfterStart = () => {
				if (client.startCallCount === 1) {
					configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				}
			};
			const ensureClient = () => (agent as unknown as { _ensureClient(): Promise<unknown> })._ensureClient();
			try {
				const first = ensureClient();
				const second = ensureClient();
				const [firstClient, secondClient] = await Promise.all([first, second]);
				assert.deepStrictEqual({
					sameHealthyClient: firstClient === client && secondClient === client,
					startCallCount: client.startCallCount,
					stopCallCount: client.stopCallCount,
				}, {
					sameHealthyClient: true,
					startCallCount: 2,
					stopCallCount: 1,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

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

		test('does not block client startup on system proxy resolution', async () => {
			const client = new TestCopilotClient([]);
			const proxyResolver = new TestProxyResolver();
			const resolveProxyGate = new DeferredPromise<void>();
			proxyResolver.resolvedProxy = 'http://system-proxy.example:8080';
			proxyResolver.resolveProxyGate = resolveProxyGate.p;
			const { agent } = createTestAgentContext(disposables, { copilotClient: client, proxyResolver });
			const startup = agent.listChatsToMigrate();
			let proxyResolutionCompleted = false;
			try {
				await startup;

				assert.deepStrictEqual({
					startCallCount: client.startCallCount,
					resolveProxyCalls: proxyResolver.resolveProxyCalls,
					httpProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTP_PROXY'],
				}, {
					startCallCount: 1,
					resolveProxyCalls: 1,
					httpProxy: undefined,
				});

				resolveProxyGate.complete();
				proxyResolutionCompleted = true;
				for (let i = 0; i < 20 && client.stopCallCount < 1; i++) {
					await timeout(0);
				}
				await agent.listChatsToMigrate();

				assert.deepStrictEqual({
					startCallCount: client.startCallCount,
					stopCallCount: client.stopCallCount,
					resolveProxyCalls: proxyResolver.resolveProxyCalls,
					httpProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTP_PROXY'],
					httpsProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTPS_PROXY'],
				}, {
					startCallCount: 2,
					stopCallCount: 1,
					resolveProxyCalls: 2,
					httpProxy: proxyResolver.resolvedProxy,
					httpsProxy: proxyResolver.resolvedProxy,
				});
			} finally {
				if (!proxyResolutionCompleted) {
					resolveProxyGate.complete();
				}
				await startup;
				await disposeAgent(agent);
			}
		});

		test('does not restart for a proxy resolution superseded while the client starts', async () => {
			const client = new TestCopilotClient([]);
			const proxyResolver = new TestProxyResolver();
			const resolveProxyGate = new DeferredPromise<void>();
			const startGate = new DeferredPromise<void>();
			const firstProxy = 'http://stale-system-proxy.example:8080';
			proxyResolver.resolvedProxy = firstProxy;
			proxyResolver.resolveProxyGate = resolveProxyGate.p;
			client.startGate = startGate.p;
			const { agent } = createTestAgentContext(disposables, { copilotClient: client, proxyResolver });
			const proxyState = agent as unknown as {
				_resolvedProxy: string | undefined;
				_refreshProxy(): void;
			};
			const startup = agent.listChatsToMigrate();
			try {
				for (let i = 0; i < 20 && client.startCallCount < 1; i++) {
					await timeout(0);
				}
				assert.deepStrictEqual({
					startCallCount: client.startCallCount,
					resolveProxyCalls: proxyResolver.resolveProxyCalls,
				}, {
					startCallCount: 1,
					resolveProxyCalls: 1,
				});

				resolveProxyGate.complete();
				for (let i = 0; i < 20 && proxyState._resolvedProxy !== firstProxy; i++) {
					await timeout(0);
				}
				assert.strictEqual(proxyState._resolvedProxy, firstProxy);

				proxyResolver.resolvedProxy = undefined;
				proxyResolver.resolveProxyGate = undefined;
				proxyState._refreshProxy();
				for (let i = 0; i < 20 && proxyState._resolvedProxy !== undefined; i++) {
					await timeout(0);
				}
				assert.strictEqual(proxyState._resolvedProxy, undefined);

				startGate.complete();
				await startup;
				await timeout(0);

				assert.deepStrictEqual({
					startCallCount: client.startCallCount,
					stopCallCount: client.stopCallCount,
					resolveProxyCalls: proxyResolver.resolveProxyCalls,
				}, {
					startCallCount: 1,
					stopCallCount: 0,
					resolveProxyCalls: 2,
				});
			} finally {
				resolveProxyGate.complete();
				startGate.complete();
				await startup;
				await disposeAgent(agent);
			}
		});

		test('forwards a system proxy resolved when the bridge registers before client startup', async () => {
			const client = new TestCopilotClient([]);
			const proxyResolver = new TestProxyResolver();
			proxyResolver.resolvedProxy = 'http://system-proxy.example:8080';
			const { agent } = createTestAgentContext(disposables, { copilotClient: client, proxyResolver });
			try {
				disposables.add(proxyResolver.register('test', {
					resolveProxy: async () => undefined,
					lookupAuthorization: async () => undefined,
					lookupKerberosAuthorization: async () => undefined,
				}));
				await timeout(0);
				await agent.listChatsToMigrate();

				assert.deepStrictEqual({
					startCallCount: client.startCallCount,
					resolveProxyCalls: proxyResolver.resolveProxyCalls,
					httpProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTP_PROXY'],
					httpsProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTPS_PROXY'],
				}, {
					startCallCount: 1,
					resolveProxyCalls: 2,
					httpProxy: proxyResolver.resolvedProxy,
					httpsProxy: proxyResolver.resolvedProxy,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('resolves the proxy when system proxy support is enabled after construction', async () => {
			const client = new TestCopilotClient([]);
			const proxyResolver = new TestProxyResolver();
			const proxy = 'http://enabled-system-proxy.example:8080';
			const { agent, configurationService } = createTestAgentContext(disposables, {
				copilotClient: client,
				proxyResolver,
				rootConfig: { [AgentHostSystemProxyEnabledConfigKey]: false },
			});
			try {
				await agent.listChatsToMigrate();
				proxyResolver.resolvedProxy = proxy;
				configurationService.updateRootConfig({ [AgentHostSystemProxyEnabledConfigKey]: true });
				for (let i = 0; i < 20 && client.stopCallCount < 1; i++) {
					await timeout(0);
				}
				await agent.listChatsToMigrate();

				assert.deepStrictEqual({
					startCallCount: client.startCallCount,
					stopCallCount: client.stopCallCount,
					resolveProxyCalls: proxyResolver.resolveProxyCalls,
					httpProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTP_PROXY'],
					httpsProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTPS_PROXY'],
				}, {
					startCallCount: 2,
					stopCallCount: 1,
					resolveProxyCalls: 1,
					httpProxy: proxy,
					httpsProxy: proxy,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('refreshes the proxy when the enterprise host changes', async () => {
			const client = new TestCopilotClient([]);
			const proxyResolver = new TestProxyResolver();
			const endpointChange = disposables.add(new Emitter<void>());
			let enterpriseUri: string | undefined;
			const currentEndpointService = () => createTestGitHubEndpointService(enterpriseUri);
			const endpointService = {
				_serviceBrand: undefined,
				onDidChange: endpointChange.event,
				getApiBaseUri: () => currentEndpointService().getApiBaseUri(),
				getGraphQlUri: () => currentEndpointService().getGraphQlUri(),
				getEnterpriseHost: () => currentEndpointService().getEnterpriseHost(),
				getEnterpriseUri: () => currentEndpointService().getEnterpriseUri(),
				getCopilotResource: () => currentEndpointService().getCopilotResource(),
				getRepoResource: () => currentEndpointService().getRepoResource(),
			} satisfies IAgentHostGitHubEndpointService;
			const initialProxy = 'http://github-proxy.example:8080';
			const enterpriseProxy = 'http://enterprise-proxy.example:8080';
			proxyResolver.resolvedProxy = initialProxy;
			const { agent } = createTestAgentContext(disposables, { copilotClient: client, proxyResolver, gitHubEndpointService: endpointService });
			try {
				disposables.add(proxyResolver.register('test', {
					resolveProxy: async () => undefined,
					lookupAuthorization: async () => undefined,
					lookupKerberosAuthorization: async () => undefined,
				}));
				await timeout(0);
				await agent.listChatsToMigrate();
				proxyResolver.resolvedProxy = enterpriseProxy;
				enterpriseUri = 'https://github.example.com';
				endpointChange.fire();
				for (let i = 0; i < 20 && client.stopCallCount < 1; i++) {
					await timeout(0);
				}
				await agent.listChatsToMigrate();

				assert.deepStrictEqual({
					startCallCount: client.startCallCount,
					stopCallCount: client.stopCallCount,
					resolveProxyCalls: proxyResolver.resolveProxyCalls,
					httpProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTP_PROXY'],
					httpsProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTPS_PROXY'],
				}, {
					startCallCount: 2,
					stopCallCount: 1,
					resolveProxyCalls: 3,
					httpProxy: enterpriseProxy,
					httpsProxy: enterpriseProxy,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('refreshes the proxy when Agent Host proxy configuration changes', async () => {
			const client = new TestCopilotClient([]);
			const proxyResolver = new TestProxyResolver();
			const proxy = 'http://configured-proxy.example:8080';
			const { agent } = createTestAgentContext(disposables, { copilotClient: client, proxyResolver });
			try {
				await agent.listChatsToMigrate();
				proxyResolver.resolvedProxy = proxy;
				proxyResolver.fireConfigurationChange();
				for (let i = 0; i < 20 && client.stopCallCount < 1; i++) {
					await timeout(0);
				}
				await agent.listChatsToMigrate();

				assert.deepStrictEqual({
					startCallCount: client.startCallCount,
					stopCallCount: client.stopCallCount,
					resolveProxyCalls: proxyResolver.resolveProxyCalls,
					httpProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTP_PROXY'],
					httpsProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTPS_PROXY'],
				}, {
					startCallCount: 2,
					stopCallCount: 1,
					resolveProxyCalls: 3,
					httpProxy: proxy,
					httpsProxy: proxy,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('forwards the configured Kerberos proxy SPN to the Copilot runtime', async () => {
			const client = new TestCopilotClient([]);
			const kerberosSpn = 'HTTP/proxy.example';
			const { agent } = createTestAgentContext(disposables, {
				copilotClient: client,
				rootConfig: { [AgentHostProxyConfigKey.ProxyKerberosServicePrincipal]: kerberosSpn },
			});
			try {
				await agent.listChatsToMigrate();

				assert.strictEqual(getCreatedClientOptions(agent).at(-1)?.env?.['COPILOT_PROXY_KERBEROS_SPN'], kerberosSpn);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('preserves an explicit Kerberos proxy SPN environment override', async () => {
			const client = new TestCopilotClient([]);
			const configuredSpn = 'HTTP/configured.proxy';
			const environmentSpn = 'HTTP/environment.proxy';
			const previous = process.env['COPILOT_PROXY_KERBEROS_SPN'];
			process.env['COPILOT_PROXY_KERBEROS_SPN'] = environmentSpn;
			const { agent } = createTestAgentContext(disposables, {
				copilotClient: client,
				rootConfig: { [AgentHostProxyConfigKey.ProxyKerberosServicePrincipal]: configuredSpn },
			});
			try {
				await agent.listChatsToMigrate();

				assert.strictEqual(getCreatedClientOptions(agent).at(-1)?.env?.['COPILOT_PROXY_KERBEROS_SPN'], environmentSpn);
			} finally {
				if (previous === undefined) {
					delete process.env['COPILOT_PROXY_KERBEROS_SPN'];
				} else {
					process.env['COPILOT_PROXY_KERBEROS_SPN'] = previous;
				}
				await disposeAgent(agent);
			}
		});

		test('restarts the Copilot runtime when the Kerberos proxy SPN changes', async () => {
			const client = new TestCopilotClient([]);
			const proxyResolver = new TestProxyResolver();
			const initialSpn = 'HTTP/initial.proxy';
			const changedSpn = 'HTTP/changed.proxy';
			const { agent, configurationService } = createTestAgentContext(disposables, {
				copilotClient: client,
				proxyResolver,
				rootConfig: { [AgentHostProxyConfigKey.ProxyKerberosServicePrincipal]: initialSpn },
			});
			try {
				await agent.listChatsToMigrate();
				configurationService.updateRootConfig({ [AgentHostProxyConfigKey.ProxyKerberosServicePrincipal]: changedSpn });
				proxyResolver.fireConfigurationChange();
				for (let i = 0; i < 20 && client.stopCallCount < 1; i++) {
					await timeout(0);
				}
				await agent.listChatsToMigrate();

				assert.deepStrictEqual({
					startCallCount: client.startCallCount,
					stopCallCount: client.stopCallCount,
					kerberosSpn: getCreatedClientOptions(agent).at(-1)?.env?.['COPILOT_PROXY_KERBEROS_SPN'],
				}, {
					startCallCount: 2,
					stopCallCount: 1,
					kerberosSpn: changedSpn,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('does not restart the Copilot runtime when an unset Kerberos proxy SPN is mirrored as empty', async () => {
			const client = new TestCopilotClient([]);
			const proxyResolver = new TestProxyResolver();
			// The workbench mirrors an unset SPN as an empty string, which must not trigger a restart.
			const previousSpnEnv = process.env['COPILOT_PROXY_KERBEROS_SPN'];
			delete process.env['COPILOT_PROXY_KERBEROS_SPN'];
			const { agent, configurationService } = createTestAgentContext(disposables, {
				copilotClient: client,
				proxyResolver,
			});
			try {
				await agent.listChatsToMigrate();
				const resolveProxyCallsBefore = proxyResolver.resolveProxyCalls;
				configurationService.updateRootConfig({ [AgentHostProxyConfigKey.ProxyKerberosServicePrincipal]: '' });
				proxyResolver.fireConfigurationChange();
				for (let i = 0; i < 20; i++) {
					await timeout(0);
				}

				assert.deepStrictEqual({
					startCallCount: client.startCallCount,
					stopCallCount: client.stopCallCount,
					proxyRefreshRan: proxyResolver.resolveProxyCalls > resolveProxyCallsBefore,
				}, {
					startCallCount: 1,
					stopCallCount: 0,
					proxyRefreshRan: true,
				});
			} finally {
				if (previousSpnEnv === undefined) {
					delete process.env['COPILOT_PROXY_KERBEROS_SPN'];
				} else {
					process.env['COPILOT_PROXY_KERBEROS_SPN'] = previousSpnEnv;
				}
				await disposeAgent(agent);
			}
		});

		test('restarts the Copilot runtime without a Kerberos proxy SPN when a configured SPN is cleared', async () => {
			const client = new TestCopilotClient([]);
			const proxyResolver = new TestProxyResolver();
			const initialSpn = 'HTTP/initial.proxy';
			// Clearing a previously-set SPN also mirrors as an empty string, but here
			// it is a real change: the client baked in the old SPN and must restart
			// so the replacement runs without one.
			const previousSpnEnv = process.env['COPILOT_PROXY_KERBEROS_SPN'];
			delete process.env['COPILOT_PROXY_KERBEROS_SPN'];
			const { agent, configurationService } = createTestAgentContext(disposables, {
				copilotClient: client,
				proxyResolver,
				rootConfig: { [AgentHostProxyConfigKey.ProxyKerberosServicePrincipal]: initialSpn },
			});
			try {
				await agent.listChatsToMigrate();
				configurationService.updateRootConfig({ [AgentHostProxyConfigKey.ProxyKerberosServicePrincipal]: '' });
				proxyResolver.fireConfigurationChange();
				for (let i = 0; i < 20 && client.stopCallCount < 1; i++) {
					await timeout(0);
				}
				await agent.listChatsToMigrate();

				assert.deepStrictEqual({
					startCallCount: client.startCallCount,
					stopCallCount: client.stopCallCount,
					kerberosSpn: getCreatedClientOptions(agent).at(-1)?.env?.['COPILOT_PROXY_KERBEROS_SPN'],
				}, {
					startCallCount: 2,
					stopCallCount: 1,
					kerberosSpn: undefined,
				});
			} finally {
				if (previousSpnEnv === undefined) {
					delete process.env['COPILOT_PROXY_KERBEROS_SPN'];
				} else {
					process.env['COPILOT_PROXY_KERBEROS_SPN'] = previousSpnEnv;
				}
				await disposeAgent(agent);
			}
		});

		test('resolves the proxy on first client start without a bridge', async () => {
			const client = new TestCopilotClient([]);
			const proxyResolver = new TestProxyResolver();
			const proxy = 'http://late-system-proxy.example:8080';
			const { agent } = createTestAgentContext(disposables, { copilotClient: client, proxyResolver });
			try {
				await timeout(0);
				proxyResolver.resolvedProxy = proxy;
				await agent.listChatsToMigrate();
				for (let i = 0; i < 20 && client.stopCallCount < 1; i++) {
					await timeout(0);
				}
				await agent.listChatsToMigrate();

				assert.deepStrictEqual({
					startCallCount: client.startCallCount,
					stopCallCount: client.stopCallCount,
					resolveProxyCalls: proxyResolver.resolveProxyCalls,
					httpProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTP_PROXY'],
					httpsProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTPS_PROXY'],
				}, {
					startCallCount: 2,
					stopCallCount: 1,
					resolveProxyCalls: 1,
					httpProxy: proxy,
					httpsProxy: proxy,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('refreshes the cached proxy without blocking every fresh client start', async () => {
			const client = new TestCopilotClient([]);
			const proxyResolver = new TestProxyResolver();
			const secondResolutionGate = new DeferredPromise<void>();
			const initialProxy = 'http://initial-system-proxy.example:8080';
			const changedProxy = 'http://changed-system-proxy.example:8080';
			proxyResolver.resolvedProxy = initialProxy;
			const { agent } = createTestAgentContext(disposables, { copilotClient: client, proxyResolver });
			const stopClient = () => (agent as unknown as { _stopClient(): Promise<void> })._stopClient();
			try {
				disposables.add(proxyResolver.register('test', {
					resolveProxy: async () => undefined,
					lookupAuthorization: async () => undefined,
					lookupKerberosAuthorization: async () => undefined,
				}));
				await timeout(0);
				await agent.listChatsToMigrate();
				await stopClient();

				proxyResolver.resolvedProxy = changedProxy;
				proxyResolver.resolveProxyGate = secondResolutionGate.p;
				await agent.listChatsToMigrate();
				const duringResolution = {
					startCallCount: client.startCallCount,
					stopCallCount: client.stopCallCount,
					resolveProxyCalls: proxyResolver.resolveProxyCalls,
					httpProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTP_PROXY'],
					httpsProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTPS_PROXY'],
				};

				secondResolutionGate.complete();
				for (let i = 0; i < 20 && client.stopCallCount < 2; i++) {
					await timeout(0);
				}
				proxyResolver.resolveProxyGate = undefined;
				await agent.listChatsToMigrate();
				await timeout(0);

				assert.deepStrictEqual({
					duringResolution,
					afterResolution: {
						startCallCount: client.startCallCount,
						stopCallCount: client.stopCallCount,
						resolveProxyCalls: proxyResolver.resolveProxyCalls,
						httpProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTP_PROXY'],
						httpsProxy: getCreatedClientOptions(agent).at(-1)?.env?.['HTTPS_PROXY'],
					},
				}, {
					duringResolution: {
						startCallCount: 2,
						stopCallCount: 1,
						resolveProxyCalls: 3,
						httpProxy: initialProxy,
						httpsProxy: initialProxy,
					},
					afterResolution: {
						startCallCount: 3,
						stopCallCount: 2,
						resolveProxyCalls: 4,
						httpProxy: changedProxy,
						httpsProxy: changedProxy,
					},
				});
			} finally {
				secondResolutionGate.complete();
				await disposeAgent(agent);
			}
		});

		test('passes the configured log level to the Copilot SDK client', async () => {
			const client = new TestCopilotClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				configurationService.updateRootConfig({ [CopilotCliConfigKey.CopilotSdkLogLevel]: 'trace' });
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listChatsToMigrate();

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
				await agent.listChatsToMigrate();

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
				await agent.listChatsToMigrate();

				assert.deepStrictEqual(getCreatedClientOptions(agent).map(options => options.logLevel), ['all']);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('enables the rubber duck CLI feature by default', async () => {
			const client = new TestCopilotClient([]);
			const { agent } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listChatsToMigrate();

				assert.strictEqual(getCreatedClientOptions(agent).at(-1)?.env?.['RUBBER_DUCK_AGENT'], 'true');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('does not enable the rubber duck CLI feature when explicitly disabled', async () => {
			const client = new TestCopilotClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listChatsToMigrate();

				assert.strictEqual(getCreatedClientOptions(agent).at(-1)?.env?.['RUBBER_DUCK_AGENT'], undefined);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('enables the auto v2 endpoint always and multi-turn context routing only when configured', async () => {
			const defaultClient = new TestCopilotClient([]);
			const { agent: defaultAgent } = createTestAgentContext(disposables, { copilotClient: defaultClient });
			try {
				await defaultAgent.listChatsToMigrate();

				const routingClient = new TestCopilotClient([]);
				const { agent: routingAgent } = createTestAgentContext(disposables, {
					copilotClient: routingClient,
					rootConfig: { [CopilotCliConfigKey.MultiTurnContextRouting]: true },
				});
				try {
					await routingAgent.listChatsToMigrate();

					const defaultEnv = getCreatedClientOptions(defaultAgent).at(-1)?.env;
					const routingEnv = getCreatedClientOptions(routingAgent).at(-1)?.env;
					assert.deepStrictEqual({
						defaultAutoV2: defaultEnv?.['AUTO_V2_ENDPOINT'],
						defaultMultiTurn: defaultEnv?.['MULTI_TURN_CONTEXT_ROUTING'],
						routingAutoV2: routingEnv?.['AUTO_V2_ENDPOINT'],
						routingMultiTurn: routingEnv?.['MULTI_TURN_CONTEXT_ROUTING'],
					}, {
						defaultAutoV2: 'true',
						defaultMultiTurn: undefined,
						routingAutoV2: 'true',
						routingMultiTurn: 'true',
					});
				} finally {
					await disposeAgent(routingAgent);
				}
			} finally {
				await disposeAgent(defaultAgent);
			}
		});

		test('enables the built-in GitHub MCP server by default and removes its environment variable when disabled', async () => {
			const enabledClient = new TestCopilotClient([]);
			const { agent: enabledAgent } = createTestAgentContext(disposables, { copilotClient: enabledClient });
			const previousEnvValue = process.env['COPILOT_ENABLE_BUILTIN_GITHUB_MCP'];
			try {
				await enabledAgent.listChatsToMigrate();
				process.env['COPILOT_ENABLE_BUILTIN_GITHUB_MCP'] = 'true';

				const disabledClient = new TestCopilotClient([]);
				const { agent: disabledAgent } = createTestAgentContext(disposables, {
					copilotClient: disabledClient,
					rootConfig: { [AgentHostGitHubMcpServerEnabledConfigKey]: false },
				});
				try {
					await disabledAgent.listChatsToMigrate();
					assert.deepStrictEqual([
						getCreatedClientOptions(enabledAgent).at(-1)?.env?.['COPILOT_ENABLE_BUILTIN_GITHUB_MCP'],
						getCreatedClientOptions(disabledAgent).at(-1)?.env?.['COPILOT_ENABLE_BUILTIN_GITHUB_MCP'],
					], ['true', undefined]);
				} finally {
					await disposeAgent(disabledAgent);
				}
			} finally {
				if (previousEnvValue === undefined) {
					delete process.env['COPILOT_ENABLE_BUILTIN_GITHUB_MCP'];
				} else {
					process.env['COPILOT_ENABLE_BUILTIN_GITHUB_MCP'] = previousEnvValue;
				}
				await disposeAgent(enabledAgent);
			}
		});

		test('restarts the client when built-in GitHub MCP support is enabled', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, {
				copilotClient: client,
				rootConfig: { [AgentHostGitHubMcpServerEnabledConfigKey]: false },
			});
			try {
				await agent.listChatsToMigrate();
				configurationService.updateRootConfig({ [AgentHostGitHubMcpServerEnabledConfigKey]: true });
				await Promise.resolve();
				await agent.listChatsToMigrate();

				assert.deepStrictEqual({
					stopCount: client.stopCount,
					env: getCreatedClientOptions(agent).at(-1)?.env?.['COPILOT_ENABLE_BUILTIN_GITHUB_MCP'],
				}, {
					stopCount: 1,
					env: 'true',
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('restarts the client when the Copilot SDK log level changes', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listChatsToMigrate();

				configurationService.updateRootConfig({ [CopilotCliConfigKey.CopilotSdkLogLevel]: 'trace' });
				await Promise.resolve();
				await agent.listChatsToMigrate();

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

		test('restarts sessions when managed permission contributions change or are removed', async () => {
			const client = new StopCountingClient([]);
			const { agent, managedSettingsService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listChatsToMigrate();

				const restricted = { disableBypassPermissionsMode: 'disable' as const };
				managedSettingsService.setClientPermissions('client', restricted);
				await Promise.resolve();
				await agent.listChatsToMigrate();
				managedSettingsService.setClientPermissions('client', restricted);
				await Promise.resolve();
				managedSettingsService.removeClientPermissions('client');
				await Promise.resolve();

				assert.strictEqual(client.stopCount, 2);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('re-enumerates models after a startup-config restart', async () => {
			const client = new StopCountingClient([], [{ id: 'gpt-4o', name: 'GPT-4o' }]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listChatsToMigrate();
				await waitForState(agent.models, m => m.length > 0);
				const requestsBefore = client.modelListRequests.length;

				// The catalog belonged to the subprocess being torn down, and the
				// replacement may point at a different CAPI endpoint entirely.
				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				for (let i = 0; i < 500 && client.modelListRequests.length <= requestsBefore; i++) {
					await timeout(1);
				}

				assert.deepStrictEqual({
					stopCount: client.stopCount,
					refreshesAfterRestart: client.modelListRequests.length - requestsBefore,
				}, {
					stopCount: 1,
					refreshesAfterRestart: 1,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('coalesces concurrent token and startup-config refresh triggers', async () => {
			const client = new StopCountingClient([], [{ id: 'gpt-4o', name: 'GPT-4o' }]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			const stopGate = new DeferredPromise<void>();
			try {
				await agent.authenticate('https://api.github.com', 'token-a');
				await agent.listChatsToMigrate();
				await waitForState(agent.models, models => models.length > 0);
				await Promise.resolve();
				const requestsBefore = client.modelListRequests.length;
				client.stopGate = stopGate.p;

				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				await agent.authenticate('https://api.github.com', 'token-b');
				await timeout(10);
				assert.strictEqual(client.modelListRequests.length, requestsBefore, 'model refresh must wait for the old client to stop');
				stopGate.complete();
				for (let i = 0; i < 500 && client.modelListRequests.length <= requestsBefore; i++) {
					await timeout(1);
				}
				await Promise.resolve();

				assert.deepStrictEqual({
					stopCount: client.stopCount,
					refreshes: client.modelListRequests.length - requestsBefore,
					lastToken: client.modelListRequests.at(-1)?.gitHubToken,
				}, {
					stopCount: 1,
					refreshes: 1,
					lastToken: 'token-b',
				});
			} finally {
				stopGate.complete();
				await disposeAgent(agent);
			}
		});

		test('does not start a replacement client while the previous client is stopping', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			const stopGate = new DeferredPromise<void>();
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listChatsToMigrate();
				client.stopGate = stopGate.p;

				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				const listPromise = agent.listChatsToMigrate();
				await timeout(10);
				assert.strictEqual(client.startCallCount, 1, 'replacement client must wait for the old client to stop');

				stopGate.complete();
				await listPromise;
				assert.deepStrictEqual({
					starts: client.startCallCount,
					stops: client.stopCount,
				}, {
					starts: 2,
					stops: 1,
				});
			} finally {
				stopGate.complete();
				await disposeAgent(agent);
			}
		});

		test('a failed client stop does not poison later model refreshes', async () => {
			const client = new StopCountingClient([], [{ id: 'gpt-4o', name: 'GPT-4o' }]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await waitForState(agent.models, models => models.length > 0);
				await agent.listChatsToMigrate();
				const requestsBefore = client.modelListRequests.length;
				client.stopError = new Error('stop failed');

				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				await timeout(10);
				client.stopError = undefined;
				await agent.refreshModels();

				assert.strictEqual(client.modelListRequests.length, requestsBefore + 1);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('drops an in-flight catalog from the previous client generation', async () => {
			const client = new StopCountingClient([], [{ id: 'initial', name: 'Initial' }]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await waitForState(agent.models, models => models.some(model => model.id === 'initial'));
				await Promise.resolve();

				const staleGate = new DeferredPromise<void>();
				const replacementGate = new DeferredPromise<void>();
				client.modelListGates.push(staleGate.p, replacementGate.p);
				client.modelListResponses.push(
					[{ id: 'stale', name: 'Stale' }],
					[{ id: 'replacement', name: 'Replacement' }],
				);
				const requestsBefore = client.modelListRequests.length;
				const staleRefresh = agent.refreshModels();
				for (let i = 0; i < 500 && client.modelListRequests.length < requestsBefore + 1; i++) {
					await timeout(1);
				}

				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				for (let i = 0; i < 500 && client.modelListRequests.length < requestsBefore + 2; i++) {
					await timeout(1);
				}
				assert.deepStrictEqual(agent.models.get(), []);

				replacementGate.complete();
				await waitForState(agent.models, models => models.some(model => model.id === 'replacement'));
				staleGate.complete();
				await staleRefresh;

				assert.deepStrictEqual(agent.models.get().map(model => model.id), ['replacement']);
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
				await agent.listChatsToMigrate();

				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
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
				await agent.listChatsToMigrate();

				let disposed = false;
				setDefaultSessionStub(agent, 'active', { dispose() { disposed = true; } });

				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
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
				await agent.listChatsToMigrate();

				logService.setLevel(LogLevel.Trace);
				configurationService.updateRootConfig({ [CopilotCliConfigKey.EnableCustomTerminalTool]: true });
				await Promise.resolve();

				assert.strictEqual(client.stopCount, 0);
			} finally {
				await disposeAgent(agent);
			}
		});

		/**
		 * Signals the turn-ended hook the agent wires into every chat it creates
		 * (`onTurnEnded`), which stub-injected chats bypass.
		 */
		function reportChatTurnEnded(agent: CopilotAgent): void {
			(agent as unknown as { _onChatTurnEnded(): void })._onChatTurnEnded();
		}

		/** A stub chat whose in-flight turn can be ended by the test. */
		function busyChatStub(): { hasActiveTurn: boolean; disposed: boolean; dispose(): void; destroySession(): Promise<void> } {
			return {
				hasActiveTurn: true,
				disposed: false,
				dispose() { this.disposed = true; },
				destroySession: async () => { },
			};
		}

		test('defers the restart until an in-flight turn ends', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listChatsToMigrate();

				const chat = busyChatStub();
				setDefaultSessionStub(agent, 'busy', chat);

				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				await timeout(0);
				const duringTurn = { stopCount: client.stopCount, disposed: chat.disposed };

				chat.hasActiveTurn = false;
				reportChatTurnEnded(agent);
				await timeout(0);

				assert.deepStrictEqual({
					duringTurn,
					afterTurn: { stopCount: client.stopCount, disposed: chat.disposed },
				}, {
					duringTurn: { stopCount: 0, disposed: false },
					afterTurn: { stopCount: 1, disposed: true },
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('keeps deferring while another chat is still running its turn', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listChatsToMigrate();

				const first = busyChatStub();
				const second = busyChatStub();
				setDefaultSessionStub(agent, 'busy-1', first);
				setDefaultSessionStub(agent, 'busy-2', second);

				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				await timeout(0);

				first.hasActiveTurn = false;
				reportChatTurnEnded(agent);
				await timeout(0);
				const afterFirst = client.stopCount;

				second.hasActiveTurn = false;
				reportChatTurnEnded(agent);
				await timeout(0);

				assert.deepStrictEqual({ afterFirst, afterSecond: client.stopCount }, { afterFirst: 0, afterSecond: 1 });
			} finally {
				await disposeAgent(agent);
			}
		});

		test('applies a deferred restart when the busy session is disposed instead', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listChatsToMigrate();

				setDefaultSessionStub(agent, 'busy', busyChatStub());

				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				await timeout(0);
				const duringTurn = client.stopCount;

				// A disposed session never reports its turn ending, so disposal
				// must drain the parked restart itself.
				await disposeProvisionedSession(agent, AgentSession.uri('copilotcli', 'busy'));

				assert.deepStrictEqual({ duringTurn, afterDispose: client.stopCount }, { duringTurn: 0, afterDispose: 1 });
			} finally {
				await disposeAgent(agent);
			}
		});

		test('does not restart a client that was already stopped', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listChatsToMigrate();

				const chat = busyChatStub();
				setDefaultSessionStub(agent, 'busy', chat);

				// Two startup values change while the turn runs; the first
				// restart to actually run satisfies both.
				configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: false });
				configurationService.updateRootConfig({ [CopilotCliConfigKey.CopilotSdkLogLevel]: 'trace' });
				await timeout(0);

				chat.hasActiveTurn = false;
				reportChatTurnEnded(agent);
				reportChatTurnEnded(agent);
				await timeout(0);

				assert.strictEqual(client.stopCount, 1);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('does not restart the shared client when model-family overrides change', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listChatsToMigrate();

				configurationService.updateRootConfig({ modelCapabilityOverrides: { 'preview-model': { family: 'claude-opus-4.8' } } });
				await timeout(0);
				configurationService.updateRootConfig({ modelCapabilityOverrides: { '*': { family: 'gpt-5' } } });
				await timeout(0);

				assert.strictEqual(client.stopCount, 0);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('does not pass an ambient model-family override to the shared runtime', async () => {
			const previousModelFamily = process.env['COPILOT_MODEL_FAMILY'];
			process.env['COPILOT_MODEL_FAMILY'] = 'claude-opus-4.8';
			const client = new TestCopilotClient([]);
			const { agent } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listChatsToMigrate();

				assert.strictEqual((agent as TestableCopilotAgent).lastClientOptions?.env?.['COPILOT_MODEL_FAMILY'], undefined);
			} finally {
				if (previousModelFamily === undefined) {
					delete process.env['COPILOT_MODEL_FAMILY'];
				} else {
					process.env['COPILOT_MODEL_FAMILY'] = previousModelFamily;
				}
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

	test('models keep an open-ended, message-only promotion', async () => {
		const agent = createTestAgent(disposables, {
			copilotClient: new TestCopilotClient([], [{
				id: 'claude-sonnet',
				name: 'Claude Sonnet',
				capabilities: { limits: { max_context_window_tokens: 200_000 } },
				// No `endsAt` and a zero discount: the promo must survive normalization.
				billing: { multiplier: 1, promo: { id: 'featured', discountPercent: 0, message: 'Now available' } },
			}]),
		});
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, models => models.length > 0);

			assert.deepStrictEqual(models[0]._meta?.promo, { id: 'featured', discountPercent: 0, message: 'Now available' });
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

	test('configSchema falls back to a default thinkingLevel when the model advertises no default', async () => {
		const agent = createTestAgent(disposables, {
			copilotClient: new TestCopilotClient([], [{
				id: 'gpt-5.6-terra',
				name: 'GPT-5.6 Terra',
				capabilities: { limits: { max_context_window_tokens: 128000 } },
				supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
			}, {
				id: 'claude-opus-5',
				name: 'Claude Opus 5',
				capabilities: { limits: { max_context_window_tokens: 200000 } },
				supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
			}, {
				id: 'no-preferred',
				name: 'No Preferred',
				capabilities: { limits: { max_context_window_tokens: 128000 } },
				supportedReasoningEfforts: ['minimal', 'xhigh'],
			}, {
				id: 'non-standard-only',
				name: 'Non Standard Only',
				capabilities: { limits: { max_context_window_tokens: 128000 } },
				supportedReasoningEfforts: ['minimal', 'none'],
			}]),
		});
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, models => models.length === 4);

			assert.deepStrictEqual(models.map(model => [model.id, model.configSchema?.properties.thinkingLevel?.enum, model.configSchema?.properties.thinkingLevel?.default]), [
				['gpt-5.6-terra', ['low', 'medium', 'high', 'xhigh'], 'medium'],
				['claude-opus-5', ['low', 'medium', 'high', 'xhigh', 'max'], 'high'],
				['no-preferred', ['minimal', 'xhigh'], 'minimal'],
				['non-standard-only', ['minimal', 'none'], 'minimal'],
			]);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('BYOK model configSchema exposes the advertised reasoning efforts', async () => {
		const byokBridgeRegistry = new ByokLmBridgeRegistry();
		const agent = createTestAgent(disposables, { byokBridgeRegistry });
		const modelSnapshots = disposables.add(new Emitter<IByokLmModelInfo[]>());
		const connection: IByokLmBridgeConnection = {
			chat: async () => ({ output: [] }),
			onDidChangeModels: modelSnapshots.event,
		};
		disposables.add(byokBridgeRegistry.register('renderer', connection));

		try {
			modelSnapshots.fire([
				{
					vendor: 'acme',
					id: 'fallback-default',
					name: 'Fallback Default',
					supportedReasoningEfforts: ['minimal', 'low', 'high'],
					defaultReasoningEffort: 'minimal',
				},
				{
					vendor: 'acme',
					id: 'valid-default',
					name: 'Valid Default',
					supportedReasoningEfforts: ['low', 'medium', 'high'],
					defaultReasoningEffort: 'medium',
				},
				{
					vendor: 'acme',
					id: 'minimal-only',
					name: 'Minimal Only',
					supportedReasoningEfforts: ['minimal'],
					defaultReasoningEffort: 'minimal',
				},
			]);
			const models = await waitForState(agent.models, models => models.length === 3);

			assert.deepStrictEqual(models.map(model => ({
				id: model.id,
				thinkingLevel: model.configSchema?.properties.thinkingLevel && {
					enum: model.configSchema.properties.thinkingLevel.enum,
					default: model.configSchema.properties.thinkingLevel.default,
				},
			})), [
				{ id: 'acme/fallback-default', thinkingLevel: { enum: ['minimal', 'low', 'high'], default: 'minimal' } },
				{ id: 'acme/valid-default', thinkingLevel: { enum: ['low', 'medium', 'high'], default: 'medium' } },
				{ id: 'acme/minimal-only', thinkingLevel: { enum: ['minimal'], default: 'minimal' } },
			]);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('BYOK models follow synchronized root configuration', async () => {
		const byokBridgeRegistry = new ByokLmBridgeRegistry();
		const { agent, configurationService } = createTestAgentContext(disposables, {
			byokBridgeRegistry,
			rootConfig: { [AgentHostByokModelsEnabledConfigKey]: false },
		});
		const modelSnapshots = disposables.add(new Emitter<IByokLmModelInfo[]>());
		disposables.add(byokBridgeRegistry.register('renderer', {
			chat: async () => ({ output: [] }),
			onDidChangeModels: modelSnapshots.event,
		}));

		try {
			modelSnapshots.fire([{ vendor: 'acme', id: 'model', name: 'Model' }]);
			const disabledModels = agent.models.get();
			configurationService.updateRootConfig({ [AgentHostByokModelsEnabledConfigKey]: true });
			const enabledModels = await waitForState(agent.models, models => models.length === 1);
			configurationService.updateRootConfig({ [AgentHostByokModelsEnabledConfigKey]: false });
			const disabledAgainModels = await waitForState(agent.models, models => models.length === 0);

			assert.deepStrictEqual({
				disabled: disabledModels.map(model => model.id),
				enabled: enabledModels.map(model => model.id),
				disabledAgain: disabledAgainModels.map(model => model.id),
			}, {
				disabled: [],
				enabled: ['acme/model'],
				disabledAgain: [],
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('BYOK models make Copilot authentication optional only while signed-out operation is enabled', async () => {
		const byokBridgeRegistry = new ByokLmBridgeRegistry();
		const { agent, configurationService } = createTestAgentContext(disposables, { byokBridgeRegistry });
		const modelSnapshots = disposables.add(new Emitter<IByokLmModelInfo[]>());
		const connection: IByokLmBridgeConnection = {
			chat: async () => ({ output: [] }),
			onDidChangeModels: modelSnapshots.event,
		};
		disposables.add(byokBridgeRegistry.register('renderer', connection));
		const copilotRequired = () => agent.getProtectedResources()
			.find(resource => resource.resource === GITHUB_COPILOT_PROTECTED_RESOURCE.resource)?.required !== false;

		try {
			const initiallyRequired = copilotRequired();
			configurationService.updateRootConfig({ [AgentHostConfigKey.AllowSignedOutWhenUsable]: true });
			const requiredWithoutByok = copilotRequired();
			modelSnapshots.fire([{ vendor: 'gemini', id: 'gemini-2.5-pro', modelIdentifier: 'gemini/Gemini/gemini-2.5-pro' }]);
			await waitForState(agent.models, models => models.length === 1);
			const optionalWithByok = copilotRequired();
			modelSnapshots.fire([]);
			await waitForState(agent.models, models => models.length === 0);
			const requiredAfterHide = copilotRequired();
			configurationService.updateRootConfig({ [AgentHostConfigKey.AllowSignedOutWhenUsable]: false });
			const requiredAfterDisable = copilotRequired();

			assert.deepStrictEqual({
				initiallyRequired,
				requiredWithoutByok,
				optionalWithByok,
				requiredAfterHide,
				requiredAfterDisable,
			}, {
				initiallyRequired: true,
				requiredWithoutByok: true,
				optionalWithByok: false,
				requiredAfterHide: true,
				requiredAfterDisable: true,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('BYOK models from multiple Gemini provider groups have unique picker identifiers', async () => {
		const byokBridgeRegistry = new ByokLmBridgeRegistry();
		const agent = createTestAgent(disposables, { byokBridgeRegistry });
		const modelSnapshots = disposables.add(new Emitter<IByokLmModelInfo[]>());
		const connection: IByokLmBridgeConnection = {
			chat: async () => ({ output: [] }),
			onDidChangeModels: modelSnapshots.event,
		};
		disposables.add(byokBridgeRegistry.register('renderer', connection));

		try {
			modelSnapshots.fire([
				{
					vendor: 'google',
					id: 'gemini-2.5-pro',
					name: 'Gemini 2.5 Pro',
					modelIdentifier: 'google/Gemini Personal/gemini-2.5-pro',
				},
				{
					vendor: 'google',
					id: 'gemini-2.5-pro',
					name: 'Gemini 2.5 Pro',
					modelIdentifier: 'google/Gemini Work/gemini-2.5-pro',
				},
			]);
			const models = await waitForState(agent.models, models => models.length === 2);

			assert.deepStrictEqual(models.map(model => model.id), [
				'google/Gemini Personal/gemini-2.5-pro',
				'google/Gemini Work/gemini-2.5-pro',
			]);
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

	test('configSchema shows both context options with the longer window as default when long_context tier has no surcharge', async () => {
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
			assert.strictEqual(contextSize?.default, 1_000_000);
			assert.deepStrictEqual(contextSize?.enumLabels, ['200K', '1M']);
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

		async function captureSessionConfig(model: ModelSelection | undefined, models: readonly ITestCopilotModelInfo[]): Promise<CopilotCreateSessionOptions | undefined> {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([], models);
			let capturedConfig: CopilotCreateSessionOptions | undefined;
			client.createSession = async config => {
				capturedConfig = config;
				return new MockCopilotSession() as unknown as CopilotSession;
			};
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await waitForState(agent.models, m => m.length > 0);
				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'ctx-session'),
					workingDirectories: [URI.file('/workspace')],
					...(model ? { model } : {}),
				});
				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', undefined, undefined, undefined, undefined, exactChatContext(result.session, defaultChatUri(result.session), result.session));
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

		test('defaults to long_context when model has no surcharge and no explicit selection (free long context)', async () => {
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
			assert.strictEqual(config.contextTier, 'long_context');
		});
	});

	test('agent-created sessions can resolve session-state paths via INativeEnvironmentService', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const { agent, instantiationService } = createTestAgentContext(disposables, {
			environmentServiceRegistration: 'native',
			sessionDataService,
		});
		const previousCopilotHome = process.env['COPILOT_HOME'];
		delete process.env['COPILOT_HOME'];
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
			if (previousCopilotHome === undefined) {
				delete process.env['COPILOT_HOME'];
			} else {
				process.env['COPILOT_HOME'] = previousCopilotHome;
			}
			await disposeAgent(agent);
		}
	});

	test('client tool call contributor prefers the message sender when it provides the tool', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const { agent, instantiationService } = createTestAgentContext(disposables, { environmentServiceRegistration: 'native', sessionDataService });
		const actions: (SessionAction | ChatAction)[] = [];
		disposables.add(agent.onDidChatProgress(signal => {
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
		disposables.add(agent.onDidChatProgress(signal => {
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
		disposables.add(agent.onDidChatProgress(signal => {
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
				results: [{ kind: 'approve-once' }, { kind: 'approve-once' }, { kind: 'reject', feedback: 'The user denied permission.' }],
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
		disposables.add(agent.onDidChatProgress(signal => {
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
				results: [{ kind: 'approve-once' }, { kind: 'reject', feedback: 'The user denied permission.' }],
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
		disposables.add(agent.onDidChatProgress(signal => {
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
				results: [{ kind: 'approve-once' }, { kind: 'approve-once' }, { kind: 'reject', feedback: 'The user denied permission.' }],
				pendingPermissionCount: 2,
			});
		} finally {
			await disposeAgent(agent);
		}
	});

	test('does not support external chat discovery', async () => {
		const agent = createTestAgent(disposables);
		try {
			assert.strictEqual((agent as { listExternalChats?: object }).listExternalChats, undefined);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('listChatsToMigrate returns only Agent Host-owned sessions without legacy markers', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const ownedSession = AgentSession.uri('copilotcli', 'owned');
		const ownedDb = sessionDataService.openDatabase(ownedSession);
		// Stored metadata identifies an existing Agent Host session.
		await ownedDb.object.setMetadata('copilot.workingDirectory', URI.file('/workspace').toString());
		ownedDb.dispose();
		// Empty and absent sidecars are not existing Agent Host sessions.
		const ghostSession = AgentSession.uri('copilotcli', 'ghost');
		sessionDataService.openDatabase(ghostSession).dispose();

		const client = new TestCopilotClient([sdkSession('owned'), sdkSession('ghost'), sdkSession('external')]);
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			const catalog = await agent.listChatsToMigrate();
			assert.deepStrictEqual(catalog?.map(s => sessionIdOfChat(s.chat)), ['owned']);
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

			const catalog = await agent.listChatsToMigrate();
			assert.deepStrictEqual(catalog?.map(withoutUndefinedProperties), [{
				chat: defaultChatUri(legacySession),
				startTime: 1000,
				modifiedTime: 2000,
				summary: 'SDK legacy',
				workingDirectories: [URI.file('/workspace')],
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

			const catalog = await agent.listChatsToMigrate();
			assert.deepStrictEqual(catalog?.map(withoutUndefinedProperties), [{
				chat: defaultChatUri(session),
				startTime: 1000,
				modifiedTime: 2000,
				summary: 'SDK quick',
				workingDirectories: [URI.file('/scratch/quick')],
			}]);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('getChatMetadata reads one SDK session and stored metadata without listing sessions', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const session = AgentSession.uri('copilotcli', 'target');
		const db = sessionDataService.openDatabase(session);
		await db.object.setMetadata('copilot.workingDirectory', URI.file('/workspace').toString());
		db.dispose();

		const client = new TestCopilotClient([sdkSession('target')]);
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			const chat = defaultChatUri(session);
			const metadata = await agent.getChatMetadata(chat, exactChatContext(session, chat, session));
			assert.ok(metadata);
			assert.deepStrictEqual(withoutUndefinedProperties(metadata), {
				chat,
				startTime: 1000,
				modifiedTime: 2000,
				summary: 'SDK target',
				workingDirectories: [URI.file('/workspace')],
			});
			assert.deepStrictEqual(client.getSessionMetadataCalls, ['target']);
			assert.strictEqual(client.listSessionCallCount, 0);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('getChatMetadata returns a provider-native session without a database', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const session = AgentSession.uri('copilotcli', 'external');
		const client = new TestCopilotClient([sdkSession('external', '/workspace')]);
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			const chat = defaultChatUri(session);
			const metadata = await agent.getChatMetadata(chat, exactChatContext(session, chat, session));
			assert.ok(metadata);
			assert.deepStrictEqual(withoutUndefinedProperties(metadata), {
				chat,
				startTime: 1000,
				modifiedTime: 2000,
				summary: 'SDK external',
				workingDirectories: [URI.file('/workspace')],
			});
			assert.deepStrictEqual(client.getSessionMetadataCalls, ['external']);
			assert.strictEqual(client.listSessionCallCount, 0);
			assert.deepStrictEqual(sessionDataService.openedSessions, []);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('listChatsToMigrate checks but does not create databases for unowned SDK sessions', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([sdkSession('external', '/workspace')]) });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			assert.deepStrictEqual(await agent.listChatsToMigrate(), []);
			assert.deepStrictEqual(sessionDataService.openedSessions, []);
		} finally {
			await disposeAgent(agent);
		}
	});

	suite('listSessions legacy-CLI surfacing (migration)', () => {

		test('signals extension-host chats only after internal migration is enabled', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/migration-event-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/migration-event-cwd-`);
			const sessionId = 'migration-event';
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			await writeExtensionHostMarker(userHome, sessionId);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client, userHome });
			const discoveredChats: Array<readonly IAgentChatMetadata[]> = [];
			const listener = agent.onDidDiscoverChats(chats => discoveredChats.push(chats));
			try {
				for (let i = 0; i < 10; i++) {
					await timeout(0);
				}
				assert.deepStrictEqual([...discoveredChats], []);

				configurationService.updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });
				for (let i = 0; i < 50 && discoveredChats.length === 0; i++) {
					await timeout(0);
				}
				configurationService.updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: false });
				configurationService.updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });
				for (let i = 0; i < 50 && discoveredChats.length < 2; i++) {
					await timeout(0);
				}
				assert.deepStrictEqual(discoveredChats.map(chats => chats.map(chat => sessionIdOfChat(chat.chat))), [[sessionId], [sessionId]]);
			} finally {
				listener.dispose();
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('signals migrated chats when internal migration is initially enabled', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/initial-migration-event-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/initial-migration-event-cwd-`);
			const sessionId = 'initial-migration-event';
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			await writeExtensionHostMarker(userHome, sessionId);
			const { agent } = createTestAgentContext(disposables, {
				copilotClient: client,
				userHome,
				rootConfig: { [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true },
			});
			const discoveredChats: Array<readonly IAgentChatMetadata[]> = [];
			const listener = agent.onDidDiscoverChats(chats => discoveredChats.push(chats));
			try {
				for (let i = 0; i < 50 && discoveredChats.length === 0; i++) {
					await timeout(0);
				}
				assert.deepStrictEqual(discoveredChats.map(chats => chats.map(chat => sessionIdOfChat(chat.chat))), [[sessionId]]);
			} finally {
				listener.dispose();
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not signal extension-host chats when migration is disabled during discovery', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/disabled-during-migration-event-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/disabled-during-migration-event-cwd-`);
			const sessionId = 'disabled-during-migration-event';
			const listStarted = new DeferredPromise<void>();
			const releaseList = new DeferredPromise<void>();
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			client.sessionListStarted = listStarted;
			client.sessionListGate = releaseList.p;
			await writeExtensionHostMarker(userHome, sessionId);
			const { agent, configurationService } = createTestAgentContext(disposables, {
				copilotClient: client,
				userHome,
				rootConfig: { [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true },
			});
			const discoveredChats: Array<readonly IAgentChatMetadata[]> = [];
			const listener = agent.onDidDiscoverChats(chats => discoveredChats.push(chats));
			try {
				await listStarted.p;
				configurationService.updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: false });
				releaseList.complete();
				for (let i = 0; i < 20; i++) {
					await timeout(0);
				}
				assert.deepStrictEqual(discoveredChats, []);
			} finally {
				listener.dispose();
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not discover an extension-host chat with an empty Agent Host database', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/ghost-migration-event-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/ghost-migration-event-cwd-`);
			const sessionId = 'ghost-migration-event';
			const sessionDataService = disposables.add(new TestSessionDataService());
			sessionDataService.openDatabase(AgentSession.uri('copilotcli', sessionId)).dispose();
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			await writeExtensionHostMarker(userHome, sessionId);
			const { agent } = createTestAgentContext(disposables, {
				sessionDataService,
				copilotClient: client,
				userHome,
				rootConfig: { [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true },
			});
			const discoveredChats: Array<readonly IAgentChatMetadata[]> = [];
			const listener = agent.onDidDiscoverChats(chats => discoveredChats.push(chats));
			try {
				for (let i = 0; i < 50 && discoveredChats.length === 0; i++) {
					await timeout(0);
				}
				assert.deepStrictEqual(discoveredChats.flatMap(chats => chats.map(chat => sessionIdOfChat(chat.chat))), []);
			} finally {
				listener.dispose();
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('listChatsToMigrate excludes extension-host chats from the dedicated discovery flow', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/surface-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/surface-cwd-`);
			const sessionId = 'ehcli-surface';
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const { agent, configurationService } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId);
				configurationService.updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });

				const catalog = await agent.listChatsToMigrate();
				assert.deepStrictEqual(catalog, []);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('getChatMetadata re-derives the adoptable marker for a discovered extension-host chat', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/surface-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/surface-cwd-`);
			const sessionId = 'ehcli-metadata';
			const session = AgentSession.uri('copilotcli', sessionId);
			const chat = defaultChatUri(session);
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const agent = createTestAgent(disposables, { copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId);

				const metadata = await agent.getChatMetadata(chat, exactChatContext(session, chat, session));

				assert.strictEqual(readSessionEhcliAdoptable(metadata?._meta), true);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not list the extension-host CLI session when migrate is OFF', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/surface-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/surface-cwd-`);
			const sessionId = 'ehcli-off';
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId);
				assert.deepStrictEqual(await agent.listChatsToMigrate(), []);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not list an un-owned SDK session without the extension-host marker', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/surface-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/surface-cwd-`);
			const sessionId = 'no-marker';
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const { agent, configurationService } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				configurationService.updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });
				// No marker written: standalone SDK chats are not legacy extension-host sessions.
				assert.deepStrictEqual(await agent.listChatsToMigrate(), []);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not surface a legacy CLI session whose marker originates from another Copilot host', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/surface-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/surface-cwd-`);
			const sessionId = 'ehcli-other-origin';
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const { agent, configurationService } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				// The GitHub Copilot app writes the same marker with `origin: 'other'`.
				await writeExtensionHostMarker(userHome, sessionId, { origin: 'other' });
				configurationService.updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });

				assert.deepStrictEqual(await agent.listChatsToMigrate(), []);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('lists an already-adopted (native) session normally, not as adoptable', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/surface-home-`));
			const sessionId = 'native';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			// A native / already-adopted session persists a working directory.
			const db = sessionDataService.openDatabase(session);
			await db.object.setMetadata('copilot.workingDirectory', URI.file('/workspace').toString());
			db.dispose();
			const client = new TestCopilotClient([sdkSession(sessionId, '/workspace')]);
			const { agent, configurationService } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId); // marker present but already adopted
				configurationService.updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });

				const catalog = await agent.listChatsToMigrate();
				assert.deepStrictEqual(
					catalog?.map(s => ({ id: sessionIdOfChat(s.chat), adoptable: readSessionEhcliAdoptable(s._meta) })),
					[{ id: sessionId, adoptable: false }],
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});
	});

	suite('external chat discovery', () => {

		test('surfaces a standalone Copilot CLI SDK session as external', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/external-discovery-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/external-discovery-cwd-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession('external-cli', workingDirectory, {
				clientName: 'github/cli',
				repository: 'owner/repository',
				modifiedTime: new Date(),
			})]);
			// Migration stays off: external discovery must not depend on it.
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				assert.deepStrictEqual(await collectDiscoveredChats(agent), [
					{ id: 'external-cli', external: true, adoptable: false },
				]);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('surfaces a GitHub Copilot app session as external rather than adoptable', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/external-origin-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/external-origin-cwd-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession('other-origin', workingDirectory, {
				clientName: 'github/autopilot',
				repository: 'owner/repository',
				modifiedTime: new Date(),
			})]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				// The GitHub Copilot app writes the same sidecar with `origin: 'other'`.
				await writeExtensionHostMarker(userHome, 'other-origin', { origin: 'other' });

				assert.deepStrictEqual(await collectDiscoveredChats(agent), [
					{ id: 'other-origin', external: true, adoptable: false },
				]);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not surface SDK sessions with an unknown or missing client name', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/unsupported-client-discovery-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/unsupported-client-discovery-cwd-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([
				sdkSession('unknown-client', workingDirectory, { clientName: 'other/client', repository: 'owner/repository', modifiedTime: new Date() }),
				sdkSession('missing-client', workingDirectory, { repository: 'owner/repository', modifiedTime: new Date() }),
			]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				assert.deepStrictEqual(await collectDiscoveredChats(agent), []);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('surfaces only sessions modified within the seven-day boundary', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/age-boundary-discovery-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/age-boundary-discovery-cwd-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const now = Date.UTC(2026, 7, 17, 12);
			const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
			const client = new TestCopilotClient([
				sdkSession('at-boundary', workingDirectory, { clientName: 'github/cli', repository: 'owner/repository', modifiedTime: new Date(sevenDaysAgo) }),
				sdkSession('outside-boundary', workingDirectory, { clientName: 'github/cli', repository: 'owner/repository', modifiedTime: new Date(sevenDaysAgo - 1) }),
			]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome, now: () => now });
			try {
				assert.deepStrictEqual(await collectDiscoveredChats(agent), [
					{ id: 'at-boundary', external: true, adoptable: false },
				]);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not surface a session with missing repository metadata', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/missing-repository-discovery-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/missing-repository-discovery-cwd-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([
				sdkSession('missing-repository', workingDirectory, { clientName: 'github/cli', modifiedTime: new Date() }),
			]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				assert.deepStrictEqual(await collectDiscoveredChats(agent), []);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not surface a repository-less session', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/repository-less-discovery-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/repository-less-discovery-cwd-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([
				sdkSession('repository-less', workingDirectory, { clientName: 'github/autopilot', repository: '', modifiedTime: new Date() }),
			]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				assert.deepStrictEqual(await collectDiscoveredChats(agent), []);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('keeps a legacy extension-host chat internal and adoptable', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adoptable-discovery-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adoptable-discovery-cwd-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession('ehcli-discovery', workingDirectory)]);
			await writeExtensionHostMarker(userHome, 'ehcli-discovery');
			const { agent } = createTestAgentContext(disposables, {
				sessionDataService,
				copilotClient: client,
				userHome,
				rootConfig: { [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true },
			});
			try {
				assert.deepStrictEqual(await collectDiscoveredChats(agent), [
					{ id: 'ehcli-discovery', external: false, adoptable: true },
				]);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not surface a legacy chat the user archived in the extension host', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/archived-discovery-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/archived-discovery-cwd-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession('ehcli-archived', workingDirectory)]);
			await writeExtensionHostMarker(userHome, 'ehcli-archived', { origin: 'vscode', archived: true });
			const { agent } = createTestAgentContext(disposables, {
				sessionDataService,
				copilotClient: client,
				userHome,
				rootConfig: { [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true },
			});
			try {
				assert.deepStrictEqual(await collectDiscoveredChats(agent), []);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not surface a session Agent Host owns or one the SDK reports without a working directory', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/owned-discovery-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/owned-discovery-cwd-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const ownedDb = sessionDataService.openDatabase(AgentSession.uri('copilotcli', 'owned'));
			await ownedDb.object.setMetadata('copilot.workingDirectory', URI.file(workingDirectory).toString());
			ownedDb.dispose();
			// `workspaceless` has no SDK working directory, so resuming it would throw.
			const client = new TestCopilotClient([
				sdkSession('owned', workingDirectory),
				sdkSession('workspaceless'),
			]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				assert.deepStrictEqual(await collectDiscoveredChats(agent), []);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});
		/** Discovered chats with the working directory each one resolved to. */
		async function collectDiscoveredWorkingDirectories(agent: CopilotAgent): Promise<Array<{ id: string; workingDirectory: string | undefined }>> {
			const discovered: IAgentDiscoveredChat[] = [];
			const listener = agent.onDidDiscoverChats(chats => discovered.push(...chats));
			try {
				await (agent as unknown as { _startCopilotChatDiscovery(): Promise<void> })._startCopilotChatDiscovery();
				return discovered.map(chat => ({
					id: sessionIdOfChat(chat.chat),
					workingDirectory: chat.workingDirectories?.[0]?.fsPath,
				}));
			} finally {
				listener.dispose();
			}
		}

		test('recovers a cwd-less legacy chat working directory from the extension-host marker', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/marker-cwd-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/marker-cwd-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession('marker-cwd')]);
			await writeExtensionHostMarker(userHome, 'marker-cwd', { origin: 'vscode', workspaceFolder: { folderPath: workingDirectory } });
			const { agent } = createTestAgentContext(disposables, {
				sessionDataService,
				copilotClient: client,
				userHome,
				rootConfig: { [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true },
			});
			try {
				assert.deepStrictEqual(await collectDiscoveredWorkingDirectories(agent), [
					{ id: 'marker-cwd', workingDirectory: URI.file(workingDirectory).fsPath },
				]);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('prefers the worktree checkout over the repository root when recovering a legacy chat', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/marker-worktree-home-`));
			const repository = await fs.mkdtemp(`${os.tmpdir()}/marker-repo-`);
			const worktree = await fs.mkdtemp(`${os.tmpdir()}/marker-worktree-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession('marker-worktree')]);
			// A worktree session ran in its checkout; keying off the repository root
			// would hide it from a window opened on that worktree.
			await writeExtensionHostMarker(userHome, 'marker-worktree', {
				origin: 'vscode',
				repositoryProperties: { repositoryPath: repository },
				worktreeProperties: { worktreePath: worktree, repositoryPath: repository },
			});
			const { agent } = createTestAgentContext(disposables, {
				sessionDataService,
				copilotClient: client,
				userHome,
				rootConfig: { [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true },
			});
			try {
				assert.deepStrictEqual(await collectDiscoveredWorkingDirectories(agent), [
					{ id: 'marker-worktree', workingDirectory: URI.file(worktree).fsPath },
				]);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(repository, { recursive: true, force: true });
				await fs.rm(worktree, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('a marker written after an initial read miss is picked up without a restart', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/marker-late-home-`));
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			const isLegacy = (agent as unknown as { _isExtensionHostCliSession(id: string): Promise<boolean> })._isExtensionHostCliSession.bind(agent);
			try {
				const beforeMarker = await isLegacy('late-marker');
				await writeExtensionHostMarker(userHome, 'late-marker');

				// A miss must not be memoized: the extension host can write the marker
				// after the probe, and the session would stay non-adoptable until restart.
				assert.deepStrictEqual(
					{ beforeMarker, afterMarker: await isLegacy('late-marker') },
					{ beforeMarker: false, afterMarker: true },
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('a chat whose database cannot be read is skipped without withholding the rest of the catalog', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/corrupt-discovery-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/corrupt-discovery-cwd-`);
			class FailingSessionDataService extends TestSessionDataService {
				override async tryOpenDatabase(session: URI): Promise<IReference<SessionDatabase> | undefined> {
					if (AgentSession.id(session) === 'corrupt') {
						throw new Error('database is corrupt');
					}
					return super.tryOpenDatabase(session);
				}
			}
			const sessionDataService = disposables.add(new FailingSessionDataService());
			const client = new TestCopilotClient([
				sdkSession('corrupt', workingDirectory, { clientName: 'github/cli', repository: 'owner/repository', modifiedTime: new Date() }),
				sdkSession('healthy', workingDirectory, { clientName: 'github/cli', repository: 'owner/repository', modifiedTime: new Date() }),
			]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				assert.deepStrictEqual(await collectDiscoveredChats(agent), [
					{ id: 'healthy', external: true, adoptable: false },
				]);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('registry-known candidates are dropped without opening any session database', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/known-discovery-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/known-discovery-cwd-`);
			const tryOpened: string[] = [];
			class CountingSessionDataService extends TestSessionDataService {
				override async tryOpenDatabase(session: URI): Promise<IReference<SessionDatabase> | undefined> {
					tryOpened.push(AgentSession.id(session));
					return super.tryOpenDatabase(session);
				}
			}
			const sessionDataService = disposables.add(new CountingSessionDataService());
			const client = new TestCopilotClient([
				sdkSession('known-a', workingDirectory),
				sdkSession('known-b', workingDirectory),
				sdkSession('fresh', workingDirectory, { clientName: 'github/cli', repository: 'owner/repository', modifiedTime: new Date() }),
			]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			const filterCalls: string[][] = [];
			agent.setKnownSessionsFilter(async sessions => {
				filterCalls.push(sessions.map(s => AgentSession.id(s)));
				return new Set([
					AgentSession.uri('copilotcli', 'known-a').toString(),
					AgentSession.uri('copilotcli', 'known-b').toString(),
				]);
			});
			try {
				assert.deepStrictEqual({
					discovered: await collectDiscoveredChats(agent),
					filterCalls,
					tryOpened,
				}, {
					discovered: [{ id: 'fresh', external: true, adoptable: false }],
					filterCalls: [['known-a', 'known-b', 'fresh']],
					tryOpened: [],
				});
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not resolve projects for adoptable chats that migration will not emit', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adoptable-skip-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adoptable-skip-cwd-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const repositoryRootCalls: string[] = [];
			class CountingGitService extends TestAgentHostGitService {
				override async getRepositoryRoot(workingDirectory?: URI): Promise<URI | undefined> {
					repositoryRootCalls.push(workingDirectory?.fsPath ?? '');
					return super.getRepositoryRoot();
				}
			}
			const gitService = new CountingGitService();
			const client = new TestCopilotClient([sdkSession('ehcli-skipped', workingDirectory)]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome, gitService });
			try {
				await writeExtensionHostMarker(userHome, 'ehcli-skipped');

				assert.deepStrictEqual({
					discovered: await collectDiscoveredChats(agent),
					repositoryRootCalls,
				}, {
					discovered: [],
					repositoryRootCalls: [],
				});
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('reads stored session metadata with a single bulk metadata query', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/bulk-metadata-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/bulk-metadata-cwd-`);
			const calls: string[] = [];
			class CountingSessionDataService extends TestSessionDataService {
				override async tryOpenDatabase(session: URI): Promise<IReference<SessionDatabase> | undefined> {
					const ref = await super.tryOpenDatabase(session);
					if (!ref) {
						return ref;
					}
					const db = ref.object;
					const object = {
						getMetadata: (key: string) => { calls.push(`getMetadata:${key}`); return db.getMetadata(key); },
						getMetadataObject: (keys: Record<string, unknown>) => { calls.push('getMetadataObject'); return db.getMetadataObject(keys); },
					} as unknown as SessionDatabase;
					return { object, dispose: () => ref.dispose() };
				}
			}
			const sessionDataService = disposables.add(new CountingSessionDataService());
			const session = AgentSession.uri('copilotcli', 'bulk-metadata');
			const db = sessionDataService.openDatabase(session);
			await db.object.setMetadata('copilot.workingDirectory', URI.file(workingDirectory).toString());
			db.dispose();
			const client = new TestCopilotClient([sdkSession('bulk-metadata', workingDirectory)]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await collectDiscoveredChats(agent);

				assert.deepStrictEqual(calls, ['getMetadataObject']);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});
	});

	suite('createChat fork', () => {
		/**
		 * Stubs the SDK fork seam and the launch seam so a fork stays in memory:
		 * `_forkSdkChat` records its inputs and hands back a deterministic
		 * forked SDK id, and `_createAgentSession` returns a recording fake.
		 */
		function stubForkSeams(agent: CopilotAgent, forkedSdkId = 'forked-sdk-id'): {
			readonly forks: { sourceEntry: unknown; turnId: string; targetDbDir: string }[];
			readonly launches: { kind: string; sessionId: string; workingDirectory: string | undefined; chatChannelUri: string | undefined; resource: string | undefined }[];
			readonly remaps: ReadonlyMap<string, string>[];
		} {
			const forks: { sourceEntry: unknown; turnId: string; targetDbDir: string }[] = [];
			const launches: { kind: string; sessionId: string; workingDirectory: string | undefined; chatChannelUri: string | undefined; resource: string | undefined }[] = [];
			const remaps: ReadonlyMap<string, string>[] = [];
			const internals = agent as unknown as {
				_forkSdkChat: (client: unknown, sourceEntry: unknown, turnId: string, targetDbDir: URI) => Promise<{ sessionId: string; inheritedTurnId: string | undefined }>;
				_createAgentSession: (launchPlan: CopilotSessionLaunchPlan, dir: URI | undefined, activeClient: unknown, identity?: { sessionUri: URI; chatChannelUri: URI; resource?: URI }) => CopilotAgentSession;
			};
			internals._forkSdkChat = async (_client, sourceEntry, turnId, targetDbDir) => {
				const sessionId = forks.length === 0 ? forkedSdkId : `${forkedSdkId}-${forks.length + 1}`;
				forks.push({ sourceEntry, turnId, targetDbDir: targetDbDir.toString() });
				return { sessionId, inheritedTurnId: 'u1' };
			};
			internals._createAgentSession = (launchPlan, _dir, _ac, identity) => {
				launches.push({
					kind: launchPlan.kind,
					sessionId: launchPlan.sessionId,
					workingDirectory: launchPlan.workingDirectory?.toString(),
					chatChannelUri: identity?.chatChannelUri?.toString(),
					resource: identity?.resource?.toString(),
				});
				const built = makeForkFake(launchPlan, identity?.chatChannelUri, remaps);
				return built;
			};
			return { forks, launches, remaps };
		}

		function makeForkFake(launchPlan: CopilotSessionLaunchPlan, chatChannelUri: URI | undefined, remaps: ReadonlyMap<string, string>[]): CopilotAgentSession {
			return {
				sessionUri: AgentSession.uri('copilotcli', launchPlan.sessionId),
				chatChannelUri,
				sessionId: launchPlan.sessionId,
				appliedSnapshot: { tools: [], plugins: [], mcpServers: {} } satisfies IActiveClientSnapshot,
				onMcpNotification: Event.None,
				onDidRequireAuth: Event.None,
				mcpServerStates: observableValue('test', []),
				async initializeSession(): Promise<void> { },
				async remapTurnIds(mapping: ReadonlyMap<string, string>): Promise<void> { remaps.push(mapping); },
				async getMessages(): Promise<readonly Turn[]> { return []; },
				async destroySession(): Promise<void> { },
				handleClientToolCallComplete(): void { },
				dispose(): void { launchPlan.shellManager?.dispose(); },
			} as unknown as CopilotAgentSession;
		}

		function makeSourceStub(workingDirectory: URI, turn: Turn, eventId?: string): { getMessages(): Promise<readonly Turn[]>; getTurnEventId(turnId: string): Promise<string | undefined>; workingDirectory: URI; dispose(): void } {
			return {
				getMessages: async () => [{ ...turn, ...(eventId ? { id: eventId } : {}) }],
				getTurnEventId: async (turnId: string) => eventId && turnId === turn.id ? eventId : undefined,
				workingDirectory,
				dispose: () => { },
			};
		}

		const sourceTurn: Turn = {
			id: 'source-turn',
			state: TurnState.Complete,
			message: { text: 'Remember FORK_ALPHA.', origin: { kind: MessageKind.User } },
			responseParts: [{ kind: ResponsePartKind.Markdown, id: 'response', content: 'ready' }],
			usage: {},
		};

		suite('_forkSdkChat boundary', () => {
			type ForkRequest = Parameters<CopilotClient['rpc']['sessions']['fork']>[0];
			type ForkSdkChatInternals = {
				_forkSdkChat: (client: CopilotClient, sourceEntry: CopilotAgentSession, turnId: string, targetDbDir: URI) => Promise<{ sessionId: string; inheritedTurnId: string | undefined }>;
			};

			function makeForkClient(forkCalls: ForkRequest[]): CopilotClient {
				return {
					rpc: {
						sessions: {
							fork: async (params: ForkRequest) => {
								forkCalls.push(params);
								return { sessionId: 'forked-session' };
							},
						},
					},
				} as unknown as CopilotClient;
			}

			function makeForkSource(options: {
				readonly boundaryEventId?: string;
				readonly getForkBoundaryEventId?: (turnId: string) => Promise<string | undefined>;
			}): { source: CopilotAgentSession; boundaryCalls: string[] } {
				const boundaryCalls: string[] = [];
				const source = {
					sessionId: 'source-sdk-session',
					sessionUri: AgentSession.uri('copilotcli', 'fork-sdk-source'),
					getMessages: async (): Promise<readonly Turn[]> => [sourceTurn],
					getForkBoundaryEventId: async (turnId: string): Promise<string | undefined> => {
						boundaryCalls.push(turnId);
						return options.getForkBoundaryEventId
							? options.getForkBoundaryEventId(turnId)
							: options.boundaryEventId;
					},
				} as unknown as CopilotAgentSession;
				return { source, boundaryCalls };
			}

			function forkSdkChat(agent: CopilotAgent, client: CopilotClient, source: CopilotAgentSession): Promise<{ sessionId: string; inheritedTurnId: string | undefined }> {
				return (agent as unknown as ForkSdkChatInternals)._forkSdkChat(client, source, sourceTurn.id, URI.file('/fork-sdk-chat-target'));
			}

			test('omits the SDK boundary when there is no next turn', async () => {
				const agent = createTestAgent(disposables);
				const forkCalls: ForkRequest[] = [];
				const { source, boundaryCalls } = makeForkSource({});
				try {
					await forkSdkChat(agent, makeForkClient(forkCalls), source);

					assert.deepStrictEqual({ forkCalls, boundaryCalls }, {
						forkCalls: [{ sessionId: 'source-sdk-session' }],
						boundaryCalls: ['source-turn'],
					});
				} finally {
					await disposeAgent(agent);
				}
			});

			test('uses an already-resolved SDK boundary without waiting', async () => {
				const agent = createTestAgent(disposables);
				const forkCalls: ForkRequest[] = [];
				const { source, boundaryCalls } = makeForkSource({ boundaryEventId: 'next-turn-event' });
				try {
					await forkSdkChat(agent, makeForkClient(forkCalls), source);

					assert.deepStrictEqual({ forkCalls, boundaryCalls }, {
						forkCalls: [{ sessionId: 'source-sdk-session', toEventId: 'next-turn-event' }],
						boundaryCalls: ['source-turn'],
					});
				} finally {
					await disposeAgent(agent);
				}
			});

			test('waits for the source session to resolve the SDK boundary before forking', async () => {
				const agent = createTestAgent(disposables);
				const forkCalls: ForkRequest[] = [];
				const { source, boundaryCalls } = makeForkSource({
					getForkBoundaryEventId: async () => {
						await timeout(5);
						return 'active-next-turn-event';
					},
				});
				try {
					await forkSdkChat(agent, makeForkClient(forkCalls), source);

					assert.deepStrictEqual({ forkCalls, boundaryCalls }, {
						forkCalls: [{ sessionId: 'source-sdk-session', toEventId: 'active-next-turn-event' }],
						boundaryCalls: ['source-turn'],
					});
				} finally {
					await disposeAgent(agent);
				}
			});

			test('fails the fork when an active next turn never produces an SDK boundary', async () => {
				const agent = createTestAgent(disposables);
				const forkCalls: ForkRequest[] = [];
				const { source, boundaryCalls } = makeForkSource({
					getForkBoundaryEventId: async () => { throw new Error('its next turn (active-next-turn) never produced an SDK event id: boom'); },
				});
				let error: Error | undefined;
				try {
					try {
						await forkSdkChat(agent, makeForkClient(forkCalls), source);
					} catch (err) {
						error = err instanceof Error ? err : new Error(String(err));
					}

					assert.deepStrictEqual({
						error: error?.message,
						forkCalls,
						boundaryCalls,
					}, {
						error: '[Copilot] fork: failed to resolve fork boundary for turn source-turn in source session source-sdk-session because its next turn (active-next-turn) never produced an SDK event id: boom',
						forkCalls: [],
						boundaryCalls: ['source-turn'],
					});
				} finally {
					await disposeAgent(agent);
				}
			});
		});

		test('rejects a fork whose source is the chat being created', async () => {
			const client = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { copilotClient: client });
			const session = AgentSession.uri('copilotcli', 'same-session');
			const chat = defaultChatUri(session);

			try {
				await assert.rejects(() => agent.chats.createChat(chat, exactChatContext(session, chat), {
					fork: { source: chat, turnId: 'turn-1' },
				}), /Cannot fork Copilot chat .* onto itself/);
				assert.strictEqual(client.startCallCount, 0);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('a fork from another session inherits its process root and reports the forked backing', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			const source = AgentSession.uri('copilotcli', 'source-session');
			const target = AgentSession.uri('copilotcli', 'target-session');
			const sourceWorkingDirectory = URI.file('/source-workspace');
			const sourceEventId = '00000000-0000-4000-8000-000000000000';
			const sourceStub = makeSourceStub(sourceWorkingDirectory, sourceTurn, sourceEventId);
			setDefaultSessionStub(agent, AgentSession.id(source), sourceStub);
			const seams = stubForkSeams(agent);

			try {
				await agent.authenticate('https://api.github.com', 'token');
				const forkedTurnId = '11111111-1111-4111-8111-111111111111';
				const result = await provisionSession(agent, {
					session: target,
					workingDirectories: [URI.file('/ignored-client-workspace')],
				}, {
					fork: {
						source: defaultChatUri(source),
						turnId: sourceTurn.id,
						turnIdMapping: new Map([[sourceTurn.id, forkedTurnId]]),
					},
				});
				const retried = await provisionSession(agent, {
					session: target,
					workingDirectories: [URI.file('/different-retry-workspace')],
				}, {
					fork: {
						source: defaultChatUri(source),
						turnId: sourceTurn.id,
					},
				});

				const storedWorkingDirectory = await sessionDataService.openDatabase(target).object.getMetadata('copilot.workingDirectory');
				assert.deepStrictEqual({
					resultSession: result.session.toString(),
					resolvedWorkingDirectory: result.resolvedWorkingDirectory?.toString(),
					providerData: JSON.parse(result.providerData!),
					backingSession: result.backingSession?.toString(),
					recordedBacking: chatBackings(agent).get(defaultChatUri(target).toString()),
					forkedFromSource: seams.forks.map(fork => ({ isSourceEntry: fork.sourceEntry === sourceStub, turnId: fork.turnId })),
					launches: seams.launches,
					remaps: seams.remaps.map(mapping => [...mapping]),
					storedWorkingDirectory,
					retried: {
						session: retried.session?.toString(),
						resolvedWorkingDirectory: retried.resolvedWorkingDirectory?.toString(),
						providerData: JSON.parse(retried.providerData!),
					},
				}, {
					resultSession: target.toString(),
					resolvedWorkingDirectory: sourceWorkingDirectory.toString(),
					providerData: { sdkSessionId: 'forked-sdk-id' },
					backingSession: AgentSession.uri('copilotcli', 'forked-sdk-id').toString(),
					recordedBacking: { sdkSessionId: 'forked-sdk-id' },
					forkedFromSource: [{ isSourceEntry: true, turnId: sourceTurn.id }],
					launches: [{
						kind: 'resume',
						sessionId: 'forked-sdk-id',
						workingDirectory: sourceWorkingDirectory.toString(),
						chatChannelUri: defaultChatUri(target).toString(),
						resource: target.toString(),
					}],
					remaps: [[[sourceTurn.id, forkedTurnId]]],
					storedWorkingDirectory: sourceWorkingDirectory.toString(),
					retried: {
						session: target.toString(),
						resolvedWorkingDirectory: sourceWorkingDirectory.toString(),
						providerData: { sdkSessionId: 'forked-sdk-id' },
					},
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('a fork copies the source database into the storage scope of the chat it creates', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			const source = AgentSession.uri('copilotcli', 'db-source-session');
			const target = AgentSession.uri('copilotcli', 'db-target-session');
			const peerChat = URI.parse(buildChatUri(target, 'peer-fork'));
			setDefaultSessionStub(agent, AgentSession.id(source), makeSourceStub(URI.file('/source-workspace'), sourceTurn));
			const seams = stubForkSeams(agent);

			try {
				await agent.authenticate('https://api.github.com', 'token');
				await provisionSession(agent, {
					session: target,
				}, {
					fork: { source: defaultChatUri(source), turnId: sourceTurn.id },
				});
				await agent.chats.createChat(peerChat, exactChatContext(target, peerChat), {
					workingDirectories: [URI.file('/target-workspace')],
					fork: { source: defaultChatUri(target), turnId: sourceTurn.id },
				});

				assert.deepStrictEqual(seams.forks.map(fork => fork.targetDbDir), [
					sessionDataService.getSessionDataDir(target).toString(),
					sessionDataService.getSessionDataDir(peerChat).toString(),
				]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createChat forks directly onto the exact target chat (no bindSessionChat needed)', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			const source = AgentSession.uri('copilotcli', 'chat-fork-source');
			const target = AgentSession.uri('copilotcli', 'chat-fork-target');
			const targetChat = defaultChatUri(target);
			setDefaultSessionStub(agent, AgentSession.id(source), makeSourceStub(URI.file('/source-workspace'), sourceTurn));
			const seams = stubForkSeams(agent, 'bound-fork-sdk-id');

			try {
				await agent.authenticate('https://api.github.com', 'token');
				const result = await provisionSession(agent, {
					session: target,
				}, {
					fork: {
						source: defaultChatUri(source),
						turnId: sourceTurn.id,
					},
				});

				assert.deepStrictEqual({
					resultSession: result.session.toString(),
					boundChat: seams.launches.map(launch => launch.chatChannelUri),
					live: hasLiveChat(agent, targetChat),
				}, {
					resultSession: target.toString(),
					boundChat: [targetChat.toString()],
					live: true,
				});
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	suite('createChat activeClient eager-claim', () => {

		class SpyingPluginManager extends TestAgentPluginManager {
			public readonly calls: { clientId: string; customizations: ClientPluginCustomization[] }[] = [];

			override async syncCustomizations(clientId: string, customizations: ClientPluginCustomization[], _progress?: (status: PluginCustomization) => void): Promise<ISyncedCustomization[]> {
				this.calls.push({ clientId, customizations: [...customizations] });
				return [];
			}
		}

		test('createChat seeds activeClient tools and syncs customizations', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const pluginManager = new SpyingPluginManager();
			// A session-scoped `createChat` creates a provisional record without
			// touching the SDK; activeClient seeding and plugin sync happen
			// inline before the provisional record is stored.
			client.createSession = async () => { throw new Error('SDK should not be touched on provisional create'); };

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, pluginManager });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const customizations: ClientPluginCustomization[] = [{ type: CustomizationType.Plugin, id: customizationId('file:///plugin-a'), uri: 'file:///plugin-a', name: 'Plugin A', }];
				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'test-session'),
					workingDirectories: [URI.file('/workspace')],
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

		test('createChat without activeClient does not sync customizations', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const pluginManager = new SpyingPluginManager();
			client.createSession = async () => { throw new Error('SDK should not be touched on provisional create'); };

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, pluginManager });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'test-session-2'),
					workingDirectories: [URI.file('/workspace')],
				});

				assert.strictEqual(result.provisional, true);
				assert.deepStrictEqual(pluginManager.calls, []);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('provisional session anchors customization discovery to the additional roots (gated)', async () => {
			const { agent, stateManager } = createTestAgentContext(disposables);
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const repoA = URI.file('/repo-a');
				const repoB = URI.file('/repo-b');

				const additionalDirsAfterCreate = async (enabled: boolean, workingDirectories: readonly URI[]): Promise<string[]> => {
					stateManager.dispatchServerAction(ROOT_STATE_URI, {
						type: ActionType.RootConfigChanged,
						config: { [AgentHostCopilotMultiRootEnabledConfigKey]: enabled },
					});
					const uri = AgentSession.uri('copilotcli', `mrp-${enabled}-${workingDirectories.length}`);
					await provisionSession(agent, {
						session: uri,
						workingDirectories,
						activeClient: { clientId: 'client-1', tools: [], customizations: [] },
					});
					const activeClients = (agent as unknown as { _activeClients: { get(u: URI): { pluginController: { additionalDirectories: readonly URI[] } } | undefined } })._activeClients;
					return (activeClients.get(uri)?.pluginController.additionalDirectories ?? []).map(d => d.toString());
				};

				// A brand-new (pre-send) provisional chat must anchor discovery to every
				// root when multi-root is on, so its custom-agent picker shows the union.
				const multiRootOn = await additionalDirsAfterCreate(true, [repoA, repoB]);
				const multiRootOff = await additionalDirsAfterCreate(false, [repoA, repoB]);
				const singleRootOn = await additionalDirsAfterCreate(true, [repoA]);

				assert.deepStrictEqual({ multiRootOn, multiRootOff, singleRootOn }, {
					multiRootOn: [repoB.toString()],
					multiRootOff: [],
					singleRootOn: [],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('create gates the SDK additionalDirectories on the multi-root flag', async () => {
			const runCreate = async (multiRootEnabled: boolean): Promise<{ workingDirectory: string | undefined; additionalDirectories: string[] | undefined }> => {
				const sessionDataService = disposables.add(new TestSessionDataService());
				const client = new TestCopilotClient([], [{ id: 'claude-sonnet', name: 'Claude Sonnet' }]);
				let capturedConfig: CopilotCreateSessionOptions | undefined;
				client.createSession = async config => {
					capturedConfig = config;
					return new MockCopilotSession() as unknown as CopilotSession;
				};
				const { agent, configurationService } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client });
				try {
					configurationService.updateRootConfig({ [AgentHostCopilotMultiRootEnabledConfigKey]: multiRootEnabled });
					await agent.authenticate('https://api.github.com', 'token');
					await waitForState(agent.models, m => m.length > 0);

					const repoA = URI.file('/repo-a');
					const repoB = URI.file('/repo-b');
					const session = AgentSession.uri('copilotcli', `multi-root-sdk-${multiRootEnabled}`);
					const chat = defaultChatUri(session);
					const result = await provisionSession(agent, { session, workingDirectories: [repoA, repoB] });
					await agent.chats.sendMessage(chat, 'hello', [repoA, repoB], undefined, undefined, undefined, exactChatContext(result.session, chat, result.session));
					return { workingDirectory: capturedConfig?.workingDirectory, additionalDirectories: (capturedConfig as unknown as { additionalDirectories?: string[] } | undefined)?.additionalDirectories };
				} finally {
					await disposeAgent(agent);
				}
			};

			const enabled = await runCreate(true);
			const disabled = await runCreate(false);
			assert.deepStrictEqual({ enabled, disabled }, {
				enabled: { workingDirectory: URI.file('/repo-a').fsPath, additionalDirectories: [URI.file('/repo-b').fsPath] },
				disabled: { workingDirectory: URI.file('/repo-a').fsPath, additionalDirectories: [] },
			});
		});

		test('createChat keeps the AH session id independent from the default Copilot SDK id', async () => {
			const client = new TestCopilotClient([], [{ id: 'claude-sonnet', name: 'Claude Sonnet' }]);
			const sessionDataService = disposables.add(new TestSessionDataService());
			let createdSdkSessionId: string | undefined;
			client.createSession = async config => {
				createdSdkSessionId = config.sessionId;
				return new MockCopilotSession() as unknown as CopilotSession;
			};
			const { agent } = createTestAgentContext(disposables, { copilotClient: client, sessionDataService });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'ah-session');
				const chat = defaultChatUri(session);
				const result = await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });
				await agent.chats.sendMessage(chat, 'hello', [URI.file('/workspace')], undefined, 'turn-1', undefined, exactChatContext(session, chat, session));

				const sdkSessionId = JSON.parse(result.providerData!).sdkSessionId as string;
				assert.deepStrictEqual({
					ahSessionId: AgentSession.id(result.session),
					sdkSessionId,
					createdSdkSessionId,
				}, {
					ahSessionId: 'ah-session',
					sdkSessionId,
					createdSdkSessionId: sdkSessionId,
				});
				assert.notStrictEqual(sdkSessionId, 'ah-session');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createChat binds a fresh session-backed chat directly and materializes it on first send, with no bindSessionChat call', async () => {
			const client = new TestCopilotClient([], [{ id: 'claude-sonnet', name: 'Claude Sonnet' }]);
			const sessionDataService = disposables.add(new TestSessionDataService());
			client.createSession = async () => new MockCopilotSession() as unknown as CopilotSession;
			const { agent } = createTestAgentContext(disposables, { copilotClient: client, sessionDataService });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'fresh-exact-chat');
				const chat = defaultChatUri(session);
				const workingDirectory = URI.file('/workspace');

				const materialized: IAgentMaterializeChatEvent[] = [];
				disposables.add(agent.onDidMaterializeChat(e => materialized.push(e)));

				const result = await provisionSession(agent, {
					session,
					workingDirectories: [workingDirectory],
				});

				// The exact target chat is bound directly at provisional creation
				// time — before any live SDK session exists — with no separate
				// `bindSessionChat` call anywhere in this test.
				assert.deepStrictEqual({
					provisional: result.provisional,
					boundBeforeSend: chatBackings(agent).has(chat.toString()),
					liveBeforeSend: hasLiveChat(agent, chat),
				}, {
					provisional: true,
					boundBeforeSend: true,
					liveBeforeSend: false,
				});

				await agent.chats.sendMessage(chat, 'hello', [workingDirectory], undefined, 'turn-1', undefined, exactChatContext(result.session, chat, result.session));

				assert.strictEqual(hasLiveChat(agent, chat), true);
				assert.strictEqual(materialized.length, 1);
				assert.deepStrictEqual({
					chat: materialized[0].chat.toString(),
					workingDirectories: materialized[0].workingDirectories?.map(d => d.toString()),
				}, {
					chat: chat.toString(),
					workingDirectories: [workingDirectory.toString()],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('session plugin enablement is projected from the host snapshot supplied at the boundary, per session', async () => {
			class PassthroughPluginManager extends TestAgentPluginManager {
				override async syncCustomizations(_clientId: string, customizations: ClientPluginCustomization[]): Promise<ISyncedCustomization[]> {
					return customizations.map(customization => ({ customization }));
				}
			}

			const pendingEnablementService: ICustomizationEnablementService = {
				_serviceBrand: undefined,
				onDidChange: Event.None,
				initializeSession: async () => { },
				getWorkingDirectoryState: () => ({ kind: 'pending' }),
				resolve: () => ({ kind: 'pending', reason: 'session' }),
				applyClientGlobalEnablement: () => ({ kind: 'pending', reason: 'session' }),
				replaceEnablement: () => ({ kind: 'pending', reason: 'session' }),
				setEnablement: () => ({ kind: 'pending', reason: 'session' }),
				whenIdle: async () => { },
			};
			const { agent, stateManager } = createTestAgentContext(disposables, { pluginManager: new PassthroughPluginManager(), customizationEnablementService: pendingEnablementService });
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
				// The host's published snapshot for a session — the exact value
				// `AgentService`/`AgentSideEffects` hand to the provider. The
				// provider must never read this itself.
				const hostSnapshot = (session: URI) => stateManager.getSessionState(session.toString())?.customizations;

				const plugin: ClientPluginCustomization = {
					type: CustomizationType.Plugin,
					id: 'file:///plugin-a',
					uri: 'file:///plugin-a',
					name: 'Plugin A',
				};
				agent.getOrCreateActiveClient(defaultChatUri(firstSession), firstSession, { clientId: 'client-1' }).customizations = [plugin];
				agent.getOrCreateActiveClient(defaultChatUri(secondSession), secondSession, { clientId: 'client-2' }).customizations = [plugin];

				const [firstInitial, secondInitial] = await Promise.all([
					getDefaultChatCustomizations(agent, firstSession, hostSnapshot(firstSession)),
					getDefaultChatCustomizations(agent, secondSession, hostSnapshot(secondSession)),
				]);
				stateManager.dispatchServerAction(firstSession.toString(), { type: ActionType.SessionCustomizationsChanged, customizations: [...firstInitial] });
				stateManager.dispatchServerAction(secondSession.toString(), { type: ActionType.SessionCustomizationsChanged, customizations: [...secondInitial] });
				stateManager.dispatchServerAction(firstSession.toString(), { type: ActionType.SessionCustomizationToggled, id: plugin.id, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }] });

				const [first, second] = await Promise.all([
					getDefaultChatCustomizations(agent, firstSession, hostSnapshot(firstSession)),
					getDefaultChatCustomizations(agent, secondSession, hostSnapshot(secondSession)),
				]);
				assert.deepStrictEqual({
					first: (() => {
						const customization = first.find(customization => customization.id === plugin.id);
						return customization?.type === CustomizationType.Plugin ? isCustomizationEnabled(customization) : undefined;
					})(),
					second: (() => {
						const customization = second.find(customization => customization.id === plugin.id);
						return customization?.type === CustomizationType.Plugin ? isCustomizationEnabled(customization) : undefined;
					})(),
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
			disposables.add(agent.onDidChatProgress(s => {
				if (s.kind === 'action') {
					actions.push(s.action);
				}
			}));

			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'sync-customizations-test');
				agent.getOrCreateActiveClient(defaultChatUri(session), session, { clientId: 'client-1' }).customizations = [{ type: CustomizationType.Plugin, id: customizationId(pluginDir.toString()), uri: pluginDir.toString(), name: 'Plugin A' }];

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
				await provisionSession(agent, {
					session,
					workingDirectories: [workspace],
				});

				const customizations = await getDefaultChatCustomizations(agent, session);
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
				await provisionSession(agent, { session, workingDirectories: [workspace] });

				provider.trackStats = true;
				const customizations = getDefaultChatCustomizations(agent, session);
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
				await provisionSession(agent, {
					session,
					workingDirectories: [workspace],
				});

				const before = await getDefaultChatCustomizations(agent, session);
				const beforeDirs = before.filter(customization => customization.type === CustomizationType.Directory);
				const agentsDirBefore = beforeDirs.find(d => d.uri === agentsRoot.toString());
				assert.ok(agentsDirBefore);
				assert.strictEqual(agentsDirBefore!.children!.length, 1); // has the helper agent file

				await fileService.del(agentsRoot, { recursive: true });

				let after = await getDefaultChatCustomizations(agent, session);
				let afterDirs = after.filter(customization => customization.type === CustomizationType.Directory);
				for (let i = 0; i < 20 && afterDirs.some(d => d.uri === agentsRoot.toString() && (d.children?.length ?? 0) > 0); i++) {
					await new Promise(resolve => setTimeout(resolve, 50));
					after = await getDefaultChatCustomizations(agent, session);
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
			disposables.add(agent.onDidChatProgress(progress => {
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
				await provisionSession(agent, {
					session,
					workingDirectories: [workspace],
				});

				await getDefaultChatCustomizations(agent, session);
				await new Promise(resolve => setTimeout(resolve, 50));
				const publishCountBefore = countDirectoryPublishesForAgentsRoot();

				// README.md is intentionally excluded from discovered agents.
				await fileService.writeFile(URI.joinPath(agentsRoot, 'README.md'), VSBuffer.fromString('ignored'));

				for (let i = 0; i < 20; i++) {
					await new Promise(resolve => setTimeout(resolve, 50));
					assert.strictEqual(countDirectoryPublishesForAgentsRoot(), publishCountBefore, 'expected no republish when discovery output is unchanged');
				}

				const after = await getDefaultChatCustomizations(agent, session);
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
			disposables.add(agent.onDidChatProgress(progress => {
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
				await provisionSession(agent, {
					session,
					workingDirectories: [workspace],
				});

				await getDefaultChatCustomizations(agent, session);
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
					const customizations = await getDefaultChatCustomizations(agent, session);
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

	suite('createChat failure rollback', () => {
		/** Structural view of the agent's private per-scope maps under test. */
		function activeClients(agent: CopilotAgent): { get(session: URI): { dispose(): void } | undefined } {
			return (agent as unknown as { _activeClients: { get(session: URI): { dispose(): void } | undefined } })._activeClients;
		}
		function sessionLifetimes(agent: CopilotAgent): Map<string, { isPermanentlyClosed: boolean }> {
			return (agent as unknown as { _sessionLifetimes: Map<string, { isPermanentlyClosed: boolean }> })._sessionLifetimes;
		}
		function provisionalSessions(agent: CopilotAgent): Map<string, unknown> {
			return (agent as unknown as { _provisionalSessions: Map<string, unknown> })._provisionalSessions;
		}
		function hostCustomizations(agent: CopilotAgent, session: URI): readonly Customization[] {
			return (agent as unknown as { _retainedHostCustomizations(session: URI): readonly Customization[] })._retainedHostCustomizations(session);
		}

		/**
		 * Stubs `_createAgentSession` so the `n`th call it services (1-based)
		 * throws once `initializeSession` runs, mirroring an SDK `createSession`
		 * failure without needing a real CLI process; every other call
		 * succeeds trivially, just like {@link stubForkSeams}'s fake above.
		 */
		function stubMintFailureOnCall(agent: CopilotAgent, failingCallNumber: number, message = 'mint failed'): void {
			let callIndex = 0;
			const internals = agent as unknown as {
				_createAgentSession: (launchPlan: CopilotSessionLaunchPlan, dir: URI | undefined, activeClient: unknown, identity?: { sessionUri: URI; chatChannelUri: URI; resource?: URI }) => CopilotAgentSession;
			};
			internals._createAgentSession = (launchPlan, _dir, _activeClient, identity) => {
				callIndex++;
				const shouldFail = callIndex === failingCallNumber;
				return {
					sessionUri: AgentSession.uri('copilotcli', launchPlan.sessionId),
					chatChannelUri: identity?.chatChannelUri,
					sessionId: launchPlan.sessionId,
					appliedSnapshot: { tools: [], plugins: [], mcpServers: {} } satisfies IActiveClientSnapshot,
					onMcpNotification: Event.None,
					onDidRequireAuth: Event.None,
					mcpServerStates: observableValue('test', []),
					async initializeSession(): Promise<void> {
						if (shouldFail) {
							throw new Error(message);
						}
					},
					async remapTurnIds(): Promise<void> { },
					async getMessages(): Promise<readonly Turn[]> { return []; },
					async destroySession(): Promise<void> { },
					handleClientToolCallComplete(): void { },
					dispose(): void { launchPlan.shellManager?.dispose(); },
				} as unknown as CopilotAgentSession;
			};
		}

		test('a client-startup failure on a workspace-less deferred create leaves no trace of the scope (including its scratch dir)', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/rollback-startup-home-`));
			const client = new TestCopilotClient([]);
			client.startError = new Error('Failed to start CLI server: spawn failed');
			const otelService = new RecordingReleaseOTelService();
			const agent = createTestAgent(disposables, { copilotClient: client, userHome, otelService });
			const session = AgentSession.uri('copilotcli', 'rollback-startup-session');
			const sessionId = AgentSession.id(session);
			const chat = defaultChatUri(session);
			const scratchDir = URI.joinPath(userHome, '.copilot', 'chats', sessionId);
			try {
				await agent.authenticate('https://api.github.com', 'token');
				// No workingDirectories: `_resolveCreateWorkingDirectory` mkdir's the
				// stable scratch dir before `_ensureClient()` throws, so the scratch
				// dir exists at the moment of failure — the rollback must remove it.
				await assert.rejects(() => provisionSession(agent, { session }), /Failed to start CLI server/);

				assert.deepStrictEqual({
					chatScope: chatScopes(agent).has(chat.toString()),
					chatBacking: chatBackings(agent).has(chat.toString()),
					provisional: provisionalSessions(agent).has(sessionId),
					activeClient: !!activeClients(agent).get(session),
					lifetime: sessionLifetimes(agent).has(sessionId),
					scratchDirRemoved: await fs.access(scratchDir.fsPath).then(() => false, () => true),
					released: otelService.released,
				}, {
					chatScope: false,
					chatBacking: false,
					provisional: false,
					activeClient: false,
					lifetime: false,
					scratchDirRemoved: true,
					released: [session.toString()],
				});
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		}).timeout(30_000);

		test('an import/resume failure disposes the ActiveClient it created and drops the ghost chat backing', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/rollback-import-home-`));
			const workingDirectory = URI.file(await fs.mkdtemp(`${os.tmpdir()}/rollback-import-cwd-`));
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			client.resumeSession = async () => { throw new Error('resume failed'); };
			const otelService = new RecordingReleaseOTelService();
			const agent = createTestAgent(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService, userHome, otelService });
			const session = AgentSession.uri('copilotcli', 'rollback-import-session');
			const sessionId = AgentSession.id(session);
			const chat = defaultChatUri(session);
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const turn: Turn = {
					id: 'rollback-import-turn',
					state: TurnState.Complete,
					message: { text: 'Remember ROLLBACK_IMPORT.', origin: { kind: MessageKind.User } },
					responseParts: [{ kind: ResponsePartKind.Markdown, id: 'response', content: 'ready' }],
					usage: {},
				};

				// `_resumeSession` records `_chatBackings` unconditionally before
				// resuming; the failure surfaces from `initializeSession` (via the
				// stubbed `client.resumeSession`) afterwards, leaving a ghost entry
				// the rollback must drop, and an ActiveClient
				// (`_getOrCreateActiveClient` in `_doResumeSession`) it must dispose.
				await assert.rejects(() => provisionSession(agent, {
					session,
					workingDirectories: [workingDirectory],
					importConversation: { turns: [turn] },
				}), /resume failed/);

				assert.deepStrictEqual({
					chatScope: chatScopes(agent).has(chat.toString()),
					chatBacking: chatBackings(agent).has(chat.toString()),
					activeClient: !!activeClients(agent).get(session),
					lifetimeClosed: sessionLifetimes(agent).get(sessionId)?.isPermanentlyClosed,
					released: otelService.released,
				}, {
					chatScope: false,
					chatBacking: false,
					activeClient: false,
					lifetimeClosed: true,
					released: [session.toString()],
				});
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		}).timeout(30_000);

		test('a fresh mint failure disposes the ActiveClient and session lifetime it created', async () => {
			const client = new TestCopilotClient([]);
			const otelService = new RecordingReleaseOTelService();
			const agent = createTestAgent(disposables, { copilotClient: client, otelService });
			stubMintFailureOnCall(agent, 1, 'createSession failed');
			const session = AgentSession.uri('copilotcli', 'rollback-mint-session');
			const sessionId = AgentSession.id(session);
			const chat = defaultChatUri(session);
			const workingDirectory = URI.file('/rollback-mint-workspace');
			const plugin: Customization = { type: CustomizationType.Plugin, id: 'file:///rollback-plugin', uri: 'file:///rollback-plugin', name: 'Rollback Plugin', enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }] };
			try {
				await agent.authenticate('https://api.github.com', 'token');
				// A non-deferred, non-fork, non-import create dispatches straight to
				// `_mintChatBacking`, which claims an ActiveClient (via
				// `_getOrCreateActiveClient`) and a session lifetime (via
				// `_queueSession`) before `initializeSession` fails. The context also
				// carries a host customization snapshot, so the failure must clear
				// the retained snapshot along with everything else.
				await assert.rejects(() => agent.chats.createChat(chat, { configurationResource: session, resource: session, customizations: [plugin] }, {
					workingDirectories: [workingDirectory],
					deferBacking: false,
				}), /createSession failed/);

				assert.deepStrictEqual({
					chatScope: chatScopes(agent).has(chat.toString()),
					chatBacking: chatBackings(agent).has(chat.toString()),
					activeClient: !!activeClients(agent).get(session),
					lifetimeClosed: sessionLifetimes(agent).get(sessionId)?.isPermanentlyClosed,
					hostCustomizations: hostCustomizations(agent, session),
					released: otelService.released,
				}, {
					chatScope: false,
					chatBacking: false,
					activeClient: false,
					lifetimeClosed: true,
					hostCustomizations: [],
					released: [session.toString()],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('a failing peer mint rolls back its own state but leaves an already-succeeded sibling chat\'s scope resources intact', async () => {
			const client = new TestCopilotClient([]);
			const otelService = new RecordingReleaseOTelService();
			const agent = createTestAgent(disposables, { copilotClient: client, otelService });
			// The 2nd `_createAgentSession` call (the peer chat's) fails; the 1st
			// (the default chat's) succeeds and stays live.
			stubMintFailureOnCall(agent, 2, 'peer mint failed');
			const session = AgentSession.uri('copilotcli', 'rollback-sibling-session');
			const sessionId = AgentSession.id(session);
			const defaultChat = defaultChatUri(session);
			const peerChat = URI.parse(buildChatUri(session, 'rollback-sibling-peer'));
			const workingDirectory = URI.file('/rollback-sibling-workspace');
			const plugin: Customization = { type: CustomizationType.Plugin, id: 'file:///rollback-sibling-plugin', uri: 'file:///rollback-sibling-plugin', name: 'Rollback Sibling Plugin', enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }] };
			try {
				await agent.authenticate('https://api.github.com', 'token');

				await agent.chats.createChat(defaultChat, { configurationResource: session, resource: session, customizations: [plugin] }, {
					workingDirectories: [workingDirectory],
					deferBacking: false,
				});
				await assert.rejects(() => agent.chats.createChat(peerChat, exactChatContext(session, peerChat, session), {
					workingDirectories: [workingDirectory],
					deferBacking: false,
				}), /peer mint failed/);

				assert.deepStrictEqual({
					// The failed peer's own bookkeeping is gone.
					peerChatScope: chatScopes(agent).has(peerChat.toString()),
					peerChatBacking: chatBackings(agent).has(peerChat.toString()),
					// The scope is still live because the default chat still shares it,
					// so nothing scope-wide is finalized.
					defaultChatScope: chatScopes(agent).has(defaultChat.toString()),
					defaultChatLive: hasLiveChat(agent, defaultChat),
					activeClient: !!activeClients(agent).get(session),
					lifetimeClosed: sessionLifetimes(agent).get(sessionId)?.isPermanentlyClosed,
					hostCustomizations: hostCustomizations(agent, session).map(c => c.id),
					released: otelService.released,
				}, {
					peerChatScope: false,
					peerChatBacking: false,
					defaultChatScope: true,
					defaultChatLive: true,
					activeClient: true,
					lifetimeClosed: false,
					hostCustomizations: ['file:///rollback-sibling-plugin'],
					released: [],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('a client-start failure on a duplicate/reconnect create for an already-reserved chat leaves its existing binding untouched', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/rollback-duplicate-home-`));
			const client = new TestCopilotClient([]);
			const otelService = new RecordingReleaseOTelService();
			const agent = createTestAgent(disposables, { copilotClient: client, userHome, otelService });
			const session = AgentSession.uri('copilotcli', 'rollback-duplicate-session');
			const sessionId = AgentSession.id(session);
			const chat = defaultChatUri(session);
			const scratchDir = URI.joinPath(userHome, '.copilot', 'chats', sessionId);
			try {
				await agent.authenticate('https://api.github.com', 'token');

				// First create succeeds: reserves the chat's backing, stands up the
				// scope's ActiveClient/lifetime, and (workspace-less) creates the
				// stable scratch dir.
				const first = await provisionSession(agent, { session });
				assert.strictEqual(first.provisional, true);

				const before = {
					chatScope: chatScopes(agent).has(chat.toString()),
					chatBacking: chatBackings(agent).get(chat.toString()),
					activeClient: !!activeClients(agent).get(session),
					lifetimeClosed: sessionLifetimes(agent).get(sessionId)?.isPermanentlyClosed,
					scratchDirExists: await fs.access(scratchDir.fsPath).then(() => true, () => false),
					released: [...otelService.released],
				};

				// Force the very next `_ensureClient()` call to attempt a fresh
				// client start — as if the CLI process crashed and a reconnect is
				// underway — and make that restart fail.
				(agent as unknown as { _client: unknown })._client = undefined;
				client.startError = new Error('Failed to reconnect CLI server');

				// A duplicate/reconnect create for the SAME already-reserved chat:
				// `_reserveChatBacking` calls `_ensureClient()` unconditionally
				// before its own idempotency check ever runs, so this failure
				// surfaces before `_createChat` (or `_reserveChatBacking`) can even
				// recognize the chat as already bound. The preexisting reservation
				// must come out exactly as it went in — none of it is this call's
				// to unwind.
				await assert.rejects(() => provisionSession(agent, { session }), /Failed to reconnect CLI server/);

				assert.deepStrictEqual({
					chatScope: chatScopes(agent).has(chat.toString()),
					chatBacking: chatBackings(agent).get(chat.toString()),
					activeClient: !!activeClients(agent).get(session),
					lifetimeClosed: sessionLifetimes(agent).get(sessionId)?.isPermanentlyClosed,
					scratchDirExists: await fs.access(scratchDir.fsPath).then(() => true, () => false),
					released: otelService.released,
				}, before);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		}).timeout(30_000);
	});

	suite('createChat exact-chat provisioning (import)', () => {
		test('createChat threads the exact target chat into a plain import (no fork)', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			const session = AgentSession.uri('copilotcli', 'import-target-thread');
			const chat = defaultChatUri(session);

			let importedChat: URI | undefined;
			const internals = agent as unknown as {
				_importConversation(options: IAgentCreateChatOptions, sessionId: string, directory: URI, chatArg: URI | undefined): Promise<IAgentCreateChatResult>;
			};
			internals._importConversation = async (_config, _sessionId, directory, chatArg) => {
				importedChat = chatArg;
				return { resolvedWorkingDirectory: directory };
			};

			try {
				const turn: Turn = {
					id: 'import-turn-1',
					state: TurnState.Complete,
					message: { text: 'Remember IMPORT_ALPHA.', origin: { kind: MessageKind.User } },
					responseParts: [{ kind: ResponsePartKind.Markdown, id: 'response', content: 'ready' }],
					usage: {},
				};

				await provisionSession(agent, {
					session,
					workingDirectories: [URI.file('/workspace')],
					importConversation: { turns: [turn] },
				});

				// Regression guard: session provisioning used to hardcode
				// `undefined` for the plain (non-fork) import branch's `chat`
				// argument, leaving the imported session's chat unbound until a
				// later `bindSessionChat` call.
				assert.strictEqual(importedChat?.toString(), chat.toString());
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createChat imports a conversation directly onto the exact target chat end-to-end, with no bindSessionChat call', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/import-exact-home-`));
			const workingDirectory = URI.file(await fs.mkdtemp(`${os.tmpdir()}/import-exact-cwd-`));
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const mockSession = new MockCopilotSession();
			const resumeCalls: string[] = [];
			client.resumeSession = async id => {
				resumeCalls.push(id);
				return mockSession as unknown as CopilotSession;
			};
			const agent = createTestAgent(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'import-exact-chat');
				const chat = defaultChatUri(session);
				const turn: Turn = {
					id: 'imported-turn-1',
					state: TurnState.Complete,
					message: { text: 'Remember IMPORT_ALPHA.', origin: { kind: MessageKind.User } },
					responseParts: [{ kind: ResponsePartKind.Markdown, id: 'response', content: 'ready' }],
					usage: {},
				};

				const result = await provisionSession(agent, {
					session,
					workingDirectories: [workingDirectory],
					importConversation: { turns: [turn] },
				});

				// The imported session's default chat is bound directly by
				// `createChat` itself (via `_importConversation` →
				// `_resumeSession` → `_bindSessionChat`) — no `bindSessionChat`
				// call appears anywhere in this test.
				assert.deepStrictEqual({
					resumeCalls,
					resultSession: result.session.toString(),
					boundSdkId: chatBackings(agent).get(chat.toString())?.sdkSessionId,
					live: hasLiveChat(agent, chat),
				}, {
					resumeCalls: ['import-exact-chat'],
					resultSession: session.toString(),
					boundSdkId: 'import-exact-chat',
					live: true,
				});

				await agent.chats.sendMessage(chat, 'follow-up', [workingDirectory], undefined, 'turn-2', undefined, exactChatContext(result.session, chat, result.session));
				assert.strictEqual(hasLiveChat(agent, chat), true);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		}).timeout(30_000);
	});

	suite('provisional sessions', () => {

		test('createChat does not call client.createSession or create worktrees', async () => {
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

				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'prov-1'),
					workingDirectories: [URI.file('/workspace')],
					config: { isolation: 'worktree', branch: 'main' },
				});

				assert.strictEqual(result.provisional, true);
				assert.strictEqual(clientCreateCalls, 0, 'client.createSession should not be called for provisional sessions');
				assert.strictEqual(worktreeCalls, 0, 'no worktree should be created for provisional sessions');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('sendMessage on the session-backed chat materializes the parent provisional session', async () => {
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
				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'prov-default-chat'),
					workingDirectories: [URI.file('/workspace')],
				});

				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', undefined, undefined, undefined, undefined, exactChatContext(result.session, defaultChatUri(result.session), result.session));

				// The provisional session materializes onto the SDK id reserved
				// for its session-backed chat at create time, which is
				// independent of the host-minted AH session id.
				assert.strictEqual(capturedConfig?.sessionId, JSON.parse(result.providerData!).sdkSessionId);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('getModel reports the creation model while the backing is still deferred', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			client.createSession = async () => new MockCopilotSession() as unknown as CopilotSession;
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'prov-default-model'),
					model: { id: 'gpt-x' },
					workingDirectories: [URI.file('/workspace')],
				});
				const chat = defaultChatUri(result.session);
				const context = exactChatContext(result.session, chat, result.session);

				// The first turn's telemetry reads the bound model before the
				// send materializes the session, so the reserved backing must
				// already carry it.
				const beforeSend = agent.chats.getModel?.(chat, context);
				await agent.chats.sendMessage(chat, 'hello', undefined, undefined, undefined, undefined, context);

				assert.deepStrictEqual({ beforeSend, afterMaterialize: agent.chats.getModel?.(chat, context) }, {
					beforeSend: { id: 'gpt-x' },
					afterMaterialize: { id: 'gpt-x' },
				});
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

				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'prov-2'),
					workingDirectories: [URI.file('/workspace')],
				});

				await disposeProvisionedSession(agent, result.session);

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
				await materializeLegacyDefaultChat(agent, session);
				await disposeProvisionedSession(agent, session);

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

				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'prov-3'),
					workingDirectories: [URI.file('/workspace')],
				});

				await disposeProvisionedSession(agent, result.session);

				assert.deepStrictEqual(client.deletedSessionIds, []);
				assert.strictEqual(agent.hasSession(result.session), false);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeSession reopens its lifetime after an SDK delete error', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			let deleteAttempts = 0;
			client.deleteSession = async () => {
				deleteAttempts++;
				if (deleteAttempts === 1) {
					throw new Error('boom');
				}
			};
			// The SDK session still exists after the first failure, so it is genuine.
			client.getSessionMetadata = async id => deleteAttempts === 1 ? sdkSession(id) : undefined;
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'persisted-session-2');
				await materializeLegacyDefaultChat(agent, session);
				await assert.rejects(() => disposeProvisionedSession(agent, session), /boom/);
				await disposeProvisionedSession(agent, session);
				assert.strictEqual(deleteAttempts, 2);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeChat keeps a live chat backing when SDK deletion fails', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			client.deleteSession = async () => { throw new Error('boom'); };
			// The SDK session still exists, so the delete failure is genuine.
			client.getSessionMetadata = async id => sdkSession(id);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'persisted-session-live');
				const chatUri = URI.parse(buildDefaultChatUri(session));
				let disposed = false;
				setDefaultSessionStub(agent, AgentSession.id(session), {
					sessionId: AgentSession.id(session),
					sessionUri: session,
					chatChannelUri: chatUri,
					destroySession: async () => { },
					dispose: () => { disposed = true; },
				}, chatUri);

				await assert.rejects(() => agent.chats.disposeChat(chatUri, exactChatContext(session, chatUri)), /boom/);

				assert.deepStrictEqual({
					tracked: hasLiveChat(agent, chatUri),
					backing: chatBackings(agent).get(chatUri.toString()),
					disposed,
				}, {
					tracked: true,
					backing: { sdkSessionId: AgentSession.id(session) },
					disposed: false,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeChat completes idempotently when the SDK session was already deleted', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			// `getSessionMetadata` returns undefined for every id (session already gone).
			const client = new TestCopilotClient([]);
			client.deleteSession = async () => { throw new Error('session not found'); };
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'persisted-session-gone');
				const chatUri = URI.parse(buildDefaultChatUri(session));
				let disposed = false;
				setDefaultSessionStub(agent, AgentSession.id(session), {
					sessionId: AgentSession.id(session),
					sessionUri: session,
					chatChannelUri: chatUri,
					destroySession: async () => { },
					dispose: () => { disposed = true; },
				}, chatUri);

				// A confirmed-gone SDK session is swallowed so a retried teardown completes.
				await agent.chats.disposeChat(chatUri, exactChatContext(session, chatUri));

				assert.deepStrictEqual({
					tracked: hasLiveChat(agent, chatUri),
					backing: chatBackings(agent).get(chatUri.toString()),
					disposed,
				}, {
					tracked: false,
					backing: undefined,
					disposed: true,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

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

				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'system-message-session'),
					workingDirectories: [URI.file('/workspace')],
				});
				assert.strictEqual(result.provisional, true);

				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', undefined, undefined, undefined, undefined, exactChatContext(result.session, defaultChatUri(result.session), result.session));

				assert.ok(capturedConfig, 'SDK createSession should be called during provisional materialization');
				const systemMessage = capturedConfig.systemMessage;
				assert.deepStrictEqual(systemMessage, {
					...COPILOT_AGENT_HOST_SYSTEM_MESSAGE,
					sections: {
						...COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections,
						tool_instructions: {
							action: 'append',
							content: `\n${COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION}`,
						},
					},
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

		test('materialization applies the per-model capability overrides without changing the wire model', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([], [{ id: 'claude-sonnet', name: 'Claude Sonnet' }]);
			let capturedConfig: Parameters<ITestCopilotClient['createSession']>[0] | undefined;
			client.createSession = async config => {
				capturedConfig = config;
				return new MockCopilotSession() as unknown as CopilotSession;
			};

			const { agent, configurationService } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client });
			try {
				configurationService.updateRootConfig({
					modelCapabilityOverrides: {
						// Bare '*' expands to the three source wildcards rather than
						// being dropped, so an 'exclude everything' is honoured.
						'claude-sonnet': { family: 'claude-opus-4.8', reasoningEffort: 'xhigh', availableTools: ['*'], excludedTools: ['mcp:*', '*'], modelCapabilities: { supports: { vision: false } } },
					},
				});
				await agent.authenticate('https://api.github.com', 'token');
				await waitForState(agent.models, m => m.length > 0);

				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'capability-override-session'),
					workingDirectories: [URI.file('/workspace')],
					model: { id: 'claude-sonnet', config: { thinkingLevel: 'medium' } },
				});
				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', undefined, undefined, undefined, undefined, exactChatContext(result.session, defaultChatUri(result.session), result.session));

				assert.deepStrictEqual({
					model: capturedConfig?.model,
					reasoningEffort: capturedConfig?.reasoningEffort,
					availableTools: capturedConfig?.availableTools,
					excludedTools: capturedConfig?.excludedTools,
					modelCapabilities: capturedConfig?.modelCapabilities,
				}, {
					// the alias routes the prompt only; the session still runs on the
					// selected model
					model: 'claude-sonnet',
					// the per-model effort beats the picker's 'medium'
					reasoningEffort: 'xhigh',
					availableTools: ['builtin:*', 'mcp:*', 'custom:*'],
					excludedTools: ['mcp:*', 'builtin:*', 'custom:*', `builtin:${SEMANTIC_SEARCH_TOOL_NAME}`],
					modelCapabilities: { supports: { vision: false } },
				});
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

				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'session-level-token'),
					workingDirectories: [URI.file('/workspace')],
				});
				assert.strictEqual(result.provisional, true);

				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', undefined, undefined, undefined, undefined, exactChatContext(result.session, defaultChatUri(result.session), result.session));

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
				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'failed-session-token'),
					workingDirectories: [URI.file('/workspace')],
				});

				await assert.rejects(agent.chats.sendMessage(defaultChatUri(result.session), 'hello', undefined, undefined, undefined, undefined, exactChatContext(result.session, defaultChatUri(result.session), result.session)), /create failed/);
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

				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'sdk-terminal-defaults'),
					workingDirectories: [URI.file('/workspace')],
				});
				assert.strictEqual(result.provisional, true);

				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', undefined, undefined, undefined, undefined, exactChatContext(result.session, defaultChatUri(result.session), result.session));

				assert.deepStrictEqual(capturedConfig?.tools?.map(tool => tool.name), []);
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	suite('host seams (no AgentHostStateManager)', () => {

		/**
		 * The provider must resolve every host fact from the seams Agent Host
		 * hands it, so it must construct and run without `IAgentHostStateManager`
		 * registered at all. This container mirrors the production DI wiring
		 * minus the state manager, registering only the narrow seams (§8).
		 */
		function createSeamOnlyAgent(): { agent: CopilotAgent; stateManager: AgentHostStateManager } {
			const logService = new NullLogService();
			const stateManager = disposables.add(new AgentHostStateManager(logService));
			const services = new ServiceCollection();
			services.set(ILogService, logService);
			services.set(IFileService, disposables.add(new FileService(logService)));
			services.set(IAgentConfigurationService, disposables.add(new AgentConfigurationService(stateManager, logService)));
			services.set(IAgentHostManagedSettingsService, disposables.add(new AgentHostManagedSettingsService()));
			services.set(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
			services.set(ISessionDataService, createNullSessionDataService());
			services.set(IAgentPluginManager, new TestAgentPluginManager());
			services.set(IAgentHostGitService, new TestAgentHostGitService());
			services.set(IAgentHostReviewService, NULL_REVIEW_SERVICE);
			services.set(IAgentHostTerminalManager, new TestAgentHostTerminalManager());
			services.set(IAgentHostOTelService, new MockAgentHostOTelService());
			services.set(IAgentHostCompletions, disposables.add(new AgentHostCompletions(logService)));
			services.set(IAgentHostProxyResolver, new TestProxyResolver());
			services.set(IByokLmBridgeRegistry, new ByokLmBridgeRegistry());
			services.set(ICopilotApiService, new TestCopilotApiService());
			services.set(ITelemetryService, NullTelemetryService);
			services.set(INativeEnvironmentService, {
				_serviceBrand: undefined,
				userHome: URI.from({ scheme: Schemas.inMemory, path: '/mock-home' }),
				tmpDir: URI.from({ scheme: Schemas.inMemory, path: '/mock-tmp' }),
			} as INativeEnvironmentService);
			// The seams — and deliberately NOT `IAgentHostStateManager`.
			services.set(IAgentHostPromptCache, new AgentHostPromptCache(stateManager));
			services.set(IAgentHostSessionTitleSignal, disposables.add(new AgentHostSessionTitleSignal(stateManager)));
			services.set(IAgentHostCustomizationEnablementService, {
				_serviceBrand: undefined,
				onDidChange: Event.None,
				initializeSession: async () => { },
				getWorkingDirectoryState: () => ({ kind: 'pending' }),
				resolve: () => ({ kind: 'pending', reason: 'session' }),
				applyClientGlobalEnablement: () => ({ kind: 'pending', reason: 'session' }),
				replaceEnablement: () => ({ kind: 'pending', reason: 'session' }),
				setEnablement: () => ({ kind: 'pending', reason: 'session' }),
				whenIdle: async () => { },
			} satisfies ICustomizationEnablementService);
			const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
			services.set(IInstantiationService, instantiationService);
			return { agent: instantiationService.createInstance(CopilotAgent), stateManager };
		}

		test('constructs and serves session-addressed calls without the state manager registered', async () => {
			const { agent, stateManager } = createSeamOnlyAgent();
			try {
				const session = AgentSession.uri('copilotcli', 'seam-only-session');
				const mcpCalls: string[] = [];
				setDefaultSessionStub(agent, AgentSession.id(session), {
					topLevelMcpCustomizations: () => [],
					startMcpServer: async (id: string) => { mcpCalls.push(`start:${id}`); },
					stopMcpServer: async (id: string) => { mcpCalls.push(`stop:${id}`); },
					handleMcpRequest: async (serverName: string, method: string) => `${serverName}/${method}`,
					dispose: () => { },
				});

				await agent.startMcpServer(session, 'mcp-1');
				await agent.stopMcpServer(session, 'mcp-1');

				assert.deepStrictEqual({
					mcpCalls,
					mcpRequest: await agent.handleMcpRequest(defaultChatUri(session), 'srv', 'tools/list', undefined),
					customizations: await getDefaultChatCustomizations(agent, session),
					// Constructing the agent never touched the state manager.
					sessions: stateManager.getSessionUris().length,
				}, {
					mcpCalls: ['start:mcp-1', 'stop:mcp-1'],
					mcpRequest: 'srv/tools/list',
					customizations: [],
					sessions: 0,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('MCP requests route to the exact host chat instead of the owning session', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'scope-resolved-session');
				// The Agent Host session id, chat id, and SDK id intentionally differ.
				const boundChat = URI.parse(buildChatUri(session, 'host-picked'));
				setLiveChatStub(agent, 'unrelated-sdk-id', {
					sessionId: 'unrelated-sdk-id',
					sessionUri: session,
					resourceUri: session,
					chatChannelUri: boundChat,
					topLevelMcpCustomizations: () => [],
					startMcpServer: async () => { },
					handleMcpRequest: async (serverName: string, method: string) => `${serverName}/${method}`,
					dispose: () => { },
				}, boundChat);

				const staleChat = URI.parse(buildChatUri(session, 'stale'));
				chatBackings(agent).set(staleChat.toString(), { sdkSessionId: 'unrelated-sdk-id' });

				assert.deepStrictEqual({
					result: await agent.handleMcpRequest(boundChat, 'srv', 'tools/call', undefined),
					staleRejected: await agent.handleMcpRequest(staleChat, 'srv', 'tools/call', undefined).then(
						() => false,
						error => error instanceof Error && error.message.startsWith('Method not found: no active chat'),
					),
				}, {
					result: 'srv/tools/call',
					staleRejected: true,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('handleMcpRequest rejects when the exact chat has no live runtime', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'no-live-chat');
				await assert.rejects(
					() => agent.handleMcpRequest(defaultChatUri(session), 'srv', 'tools/list', undefined),
					/Method not found: no active chat/,
				);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('emits the session-title OTel span from the title signal, filtered to this provider', async () => {
			const logService = new NullLogService();
			const stateManager = disposables.add(new AgentHostStateManager(logService));
			const titleSignal = disposables.add(new AgentHostSessionTitleSignal(stateManager));
			const otel = new RecordingTitleOTelService();
			const services = new ServiceCollection();
			services.set(ILogService, logService);
			services.set(IFileService, disposables.add(new FileService(logService)));
			services.set(IAgentConfigurationService, disposables.add(new AgentConfigurationService(stateManager, logService)));
			services.set(IAgentHostManagedSettingsService, disposables.add(new AgentHostManagedSettingsService()));
			services.set(IAgentHostStateManager, stateManager);
			services.set(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
			services.set(ISessionDataService, createNullSessionDataService());
			services.set(IAgentPluginManager, new TestAgentPluginManager());
			services.set(IAgentHostGitService, new TestAgentHostGitService());
			services.set(IAgentHostReviewService, NULL_REVIEW_SERVICE);
			services.set(IAgentHostTerminalManager, new TestAgentHostTerminalManager());
			services.set(IAgentHostOTelService, otel);
			services.set(IAgentHostCompletions, disposables.add(new AgentHostCompletions(logService)));
			services.set(IAgentHostProxyResolver, new TestProxyResolver());
			services.set(IByokLmBridgeRegistry, new ByokLmBridgeRegistry());
			services.set(ICopilotApiService, new TestCopilotApiService());
			services.set(ITelemetryService, NullTelemetryService);
			services.set(IAgentHostPromptCache, new AgentHostPromptCache(stateManager));
			services.set(IAgentHostSessionTitleSignal, titleSignal);
			services.set(INativeEnvironmentService, {
				_serviceBrand: undefined,
				userHome: URI.from({ scheme: Schemas.inMemory, path: '/mock-home' }),
				tmpDir: URI.from({ scheme: Schemas.inMemory, path: '/mock-tmp' }),
			} as INativeEnvironmentService);
			const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
			services.set(IInstantiationService, instantiationService);
			const agent = instantiationService.createInstance(CopilotAgent);
			try {
				const copilotSession = AgentSession.uri('copilotcli', 'titled-session');
				const claudeSession = AgentSession.uri('claude', 'other-provider-session');
				const now = new Date().toISOString();
				for (const [session, provider] of [[copilotSession, 'copilotcli'], [claudeSession, 'claude']] as const) {
					stateManager.createSession({ resource: session.toString(), provider, title: 'Test', status: SessionStatus.Idle, createdAt: now, modifiedAt: now });
					stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title: `Renamed ${provider}` });
				}

				assert.deepStrictEqual(otel.titleCalls, [{
					conversationId: AgentSession.id(copilotSession),
					sessionUri: copilotSession.toString(),
					title: 'Renamed copilotcli',
				}]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('emits the session-title span under the SDK conversation id when it diverges from the AH session id', async () => {
			const otel = new RecordingTitleOTelService();
			const { agent, stateManager } = createTestAgentContext(disposables, { otelService: otel });
			try {
				const session = AgentSession.uri('copilotcli', 'ah-session-id');
				// Model a fork/import whose live SDK id differs from its AH session id.
				setLiveChatStub(agent, 'sdk-conversation-id', { sessionId: 'sdk-conversation-id', resourceUri: session });
				const now = new Date().toISOString();
				stateManager.createSession({ resource: session.toString(), provider: 'copilotcli', title: 'Test', status: SessionStatus.Idle, createdAt: now, modifiedAt: now });
				stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title: 'Renamed' });

				assert.deepStrictEqual(otel.titleCalls, [{
					conversationId: 'sdk-conversation-id',
					sessionUri: session.toString(),
					title: 'Renamed',
				}]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('emits the session-title span under the SDK conversation id for a divergent session after a cold restart', async () => {
			const otel = new RecordingTitleOTelService();
			const { agent, stateManager } = createTestAgentContext(disposables, { otelService: otel });
			try {
				const session = AgentSession.uri('copilotcli', 'ah-session-id');
				// Cold restart: the divergent SDK id survives only in the persisted
				// default-chat backing. The session has not been resumed into a live
				// entry yet, so a rename in this window must still correlate on the
				// SDK id, recovered from the backing rather than a live session.
				await agent.materializeChat(defaultChatUri(session), session, JSON.stringify({ sdkSessionId: 'sdk-conversation-id' }));
				const now = new Date().toISOString();
				stateManager.createSession({ resource: session.toString(), provider: 'copilotcli', title: 'Test', status: SessionStatus.Idle, createdAt: now, modifiedAt: now });
				stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title: 'Renamed' });

				assert.deepStrictEqual(otel.titleCalls, [{
					conversationId: 'sdk-conversation-id',
					sessionUri: session.toString(),
					title: 'Renamed',
				}]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('retains the host customization snapshot supplied at each boundary, and never clears it on "no snapshot yet"', async () => {
			const { agent, stateManager } = createTestAgentContext(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'retained-snapshot-session');
				const chat = defaultChatUri(session);
				const plugin: Customization = {
					type: CustomizationType.Plugin,
					id: 'file:///plugin-a',
					uri: 'file:///plugin-a',
					name: 'Plugin A',
					enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
				};
				const internals = agent as unknown as { _retainedHostCustomizations(session: URI): readonly Customization[] };

				// No boundary has carried a snapshot yet.
				const beforeAnyBoundary = internals._retainedHostCustomizations(session);
				// An active-client fan-out carries one...
				agent.getOrCreateActiveClient(chat, session, { clientId: 'client-1' }, [plugin]);
				const afterActiveClient = internals._retainedHostCustomizations(session).map(c => c.id);
				// ...and `undefined` ("no snapshot yet") never clears it.
				agent.getOrCreateActiveClient(chat, session, { clientId: 'client-1' }, undefined);
				const afterUndefined = internals._retainedHostCustomizations(session).map(c => c.id);
				// An addressed chat operation's context refreshes it.
				await agent.chats.getMessages(chat, { configurationResource: session, resource: session, customizations: [{ ...plugin, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }] }] });
				const afterChatContext = internals._retainedHostCustomizations(session).map(c =>
					c.type === CustomizationType.Plugin || c.type === CustomizationType.McpServer ? isCustomizationEnabled(c) : c.enabled
				);

				assert.deepStrictEqual({
					beforeAnyBoundary,
					afterActiveClient,
					afterUndefined,
					afterChatContext,
					// The provider never read the snapshot out of host state.
					hostState: stateManager.getSessionState(session.toString())?.customizations,
				}, {
					beforeAnyBoundary: [],
					afterActiveClient: ['file:///plugin-a'],
					afterUndefined: ['file:///plugin-a'],
					afterChatContext: [true],
					hostState: undefined,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('reads and writes prompt-cache metadata through IAgentHostPromptCache', async () => {
			const logService = new NullLogService();
			const stateManager = disposables.add(new AgentHostStateManager(logService));
			const promptCache = new AgentHostPromptCache(stateManager);
			const session = AgentSession.uri('copilotcli', 'prompt-cache-session');
			const now = new Date().toISOString();
			stateManager.createSession({ resource: session.toString(), provider: 'copilotcli', title: 'Test', status: SessionStatus.Idle, createdAt: now, modifiedAt: now });

			const initial = promptCache.read(session);
			const written = promptCache.write(session, { modelId: 'gpt-5', cacheExpiresAt: '2030-01-01T00:00:00.000Z' });
			const readBack = promptCache.read(session);
			// A second live session sharing the URI sees the persisted value win.
			const noOp = promptCache.write(session, { modelId: 'gpt-5', cacheExpiresAt: '2030-01-01T00:00:00.000Z' });
			const cleared = promptCache.write(session, undefined);

			assert.deepStrictEqual({
				initial,
				written,
				readBack,
				noOp,
				cleared,
				afterClear: promptCache.read(session),
				unknownSession: promptCache.write(AgentSession.uri('copilotcli', 'unknown'), { modelId: 'gpt-5', cacheExpiresAt: '2030-01-02T00:00:00.000Z' }),
			}, {
				initial: undefined,
				written: { modelId: 'gpt-5', cacheExpiresAt: '2030-01-01T00:00:00.000Z' },
				readBack: { modelId: 'gpt-5', cacheExpiresAt: '2030-01-01T00:00:00.000Z' },
				noOp: { modelId: 'gpt-5', cacheExpiresAt: '2030-01-01T00:00:00.000Z' },
				cleared: undefined,
				afterClear: undefined,
				unknownSession: { modelId: 'gpt-5', cacheExpiresAt: '2030-01-02T00:00:00.000Z' },
			});
		});
	});

	suite('onClientToolCallComplete', () => {

		/**
		 * Injects a stub live leaf so we can observe how
		 * `onClientToolCallComplete` resolves chat routing without standing up a
		 * full Copilot SDK session.
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

		test('routes the exact default chat to its runtime', async () => {
			const agent = createTestAgent(disposables);
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'session-top');
				const defaultChat = URI.parse(buildDefaultChatUri(sessionUri));
				const { calls } = installStubSession(agent, AgentSession.id(sessionUri));

				const result: ToolCallResult = { success: true, pastTenseMessage: 'did it' };
				agent.onClientToolCallComplete(defaultChat, 'tc-top', result);

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
				agent.onClientToolCallComplete(defaultChat, 'tc-x', { success: true, pastTenseMessage: 'noop' });
			} finally {
				await disposeAgent(agent);
			}
		});

		test('routes an exact chat URI to its chat-session entry', async () => {
			// Client-tool completions for tools running inside a concrete chat
			// carry both the owning session URI and the exact chat URI. The agent
			// must route by that URI to the addressed chat leaf.
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
				agent.onClientToolCallComplete(chatUri, 'tc-peer', result);

				assert.deepStrictEqual(calls, [{ toolCallId: 'tc-peer', result }]);
			} finally {
				await disposeAgent(agent);
			}
		});
		test('routes the session-backed chat URI to the session entry, not a chat leaf', async () => {
			const agent = createTestAgent(disposables);
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'session-default');
				const defaultChatUri = URI.parse(buildDefaultChatUri(sessionUri));
				const { calls } = installStubSession(agent, AgentSession.id(sessionUri));

				const result: ToolCallResult = { success: true, pastTenseMessage: 'default done' };
				agent.onClientToolCallComplete(defaultChatUri, 'tc-default', result);

				assert.deepStrictEqual(calls, [{ toolCallId: 'tc-default', result }]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('routes a subagent completion through the spawning chat named by its host-supplied origin', async () => {
			// The host resolves a subagent's routing target to its ancestor
			// chat, but when that chat has no backing yet the provider must
			// recover the spawning chat from the origin the host stamped on the
			// *addressed* chat's context — never by parsing the subagent URI.
			const agent = createTestAgent(disposables);
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'session-subagent-origin');
				const spawningChat = URI.parse(buildChatUri(sessionUri, 'peer-1'));
				const subagentChat = URI.parse(buildSubagentChatUri(spawningChat.toString(), 'tool-1'));
				const calls: { toolCallId: string; result: ToolCallResult }[] = [];
				setPeerChatStub(agent, spawningChat, {
					handleClientToolCallComplete(toolCallId: string, result: ToolCallResult) { calls.push({ toolCallId, result }); },
					dispose() { },
				});

				const result: ToolCallResult = { success: true, pastTenseMessage: 'subagent done' };
				agent.onClientToolCallComplete(subagentChat, 'tc-subagent', result, {
					configurationResource: sessionUri,
					resource: subagentChat,
					origin: { kind: ChatOriginKind.Tool, chat: spawningChat.toString(), toolCallId: 'tool-1' },
				});

				assert.deepStrictEqual(calls, [{ toolCallId: 'tc-subagent', result }]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('falls back to the owning session-backed chat named by the context, not a subagent URI walk', async () => {
			const agent = createTestAgent(disposables);
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'session-subagent-fallback');
				const { calls } = installStubSession(agent, AgentSession.id(sessionUri));
				// Addressed to a subagent chat whose spawning chat has no live
				// backing: routing lands on the owning session's session-backed
				// chat, resolved from `context.configurationResource`.
				const subagentChat = URI.parse(buildSubagentChatUri(buildChatUri(sessionUri, 'gone'), 'tool-9'));

				const result: ToolCallResult = { success: true, pastTenseMessage: 'fallback done' };
				agent.onClientToolCallComplete(subagentChat, 'tc-fallback', result, {
					configurationResource: sessionUri,
					resource: subagentChat,
					origin: { kind: ChatOriginKind.Tool, chat: buildChatUri(sessionUri, 'gone'), toolCallId: 'tool-9' },
				});

				assert.deepStrictEqual(calls, [{ toolCallId: 'tc-fallback', result }]);
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	suite('exact chat routing and lifecycle', () => {

		/** Installs a stub chat leaf into the owning session's entry, keyed by the chat URI. */
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

		test('respondToPermissionRequest routes to the addressed chat session', async () => {
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

		test('respondToUserInputRequest routes to the addressed chat session', async () => {
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

		test('disposeSession leaves other chat leaves intact', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'parent-with-peers'),
					workingDirectories: [URI.file('/workspace')],
				});
				const chatUri = URI.parse(buildChatUri(result.session, 'peer-x'));
				const chat = installStubChat(agent, chatUri);

				await disposeProvisionedSession(agent, result.session);

				assert.deepStrictEqual({
					disposed: chat.isDisposed(),
					live: hasLiveChat(agent, chatUri),
					backing: chatBackings(agent).get(chatUri.toString()),
				}, {
					disposed: false,
					live: true,
					backing: { sdkSessionId: 'sdk-' + chatUri.toString() },
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('materializeChat does not assign the default backing to a peer without providerData', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'peer-without-backing');
				const chat = URI.parse(buildChatUri(session, 'peer'));

				const result = await agent.materializeChat(chat, exactChatContext(session, chat), undefined);

				assert.deepStrictEqual({
					result,
					backing: chatBackings(agent).get(chat.toString()),
				}, {
					result: undefined,
					backing: undefined,
				});
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
				await agent.materializeChat(chatUri, session, JSON.stringify({ sdkSessionId: 'sdk-a' }));

				await agent.chats.disposeChat(chatUri, exactChatContext(session, chatUri));

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

	suite('chat create / fork / model+agent / restore round-trip', () => {

		/** Internal surface these chat-routing tests reach into to stub the SDK/agent-session seam. */
		type ChatInternals = {
			_chatBackings: Map<string, { sdkSessionId: string; model?: ModelSelection }>;
			_createAgentSession: (launchPlan: CopilotSessionLaunchPlan, customizationDirectory: URI | undefined, activeClient: unknown, identity?: { sessionUri: URI; chatChannelUri: URI }) => CopilotAgentSession;
			_resumeSession: (sessionId: string) => Promise<CopilotAgentSession>;
			_getOrCreateSessionLifetime: (sessionId: string) => { queueSession<T>(task: () => Promise<T>): Promise<T> } | undefined;
			_forkSdkChat: (client: unknown, sourceEntry: unknown, turnId: string, targetDbDir: URI) => Promise<{ sessionId: string; inheritedTurnId: string | undefined }>;
			_resolveAgentName: (snapshot: IActiveClientSnapshot, agent: AgentSelection) => string | undefined;
			_resolveChatContext: (chat: URI, context: IAgentChatContext) => unknown;
		};

		interface IFakeChatRecorder {
			initialized: boolean;
			disposed: boolean;
			readonly remapCalls: ReadonlyMap<string, string>[];
			readonly sends: { prompt: string; turnId: string | undefined; mode: unknown; senderClientId: string | undefined }[];
			readonly resets: { turnId: string; senderClientId: string | undefined }[];
			readonly modelCalls: { id: string; effort: string | undefined; tier?: string | undefined }[];
			readonly agentCalls: (string | undefined)[];
			readonly debugLogCalls: { outputDirectory: string; includeSessionLogs: boolean }[];
		}

		/**
		 * Builds a fake {@link CopilotAgentSession} that records the calls
		 * `createChat`/`sendMessage`/`changeModel`/`changeAgent` route to an
		 * addressed chat leaf, so tests can drive the real agent methods while
		 * stubbing only the SDK-backed chat. The `_createAgentSession` seam
		 * returns this.
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
				debugLogCalls: [],
			};
			const fake = {
				sessionUri,
				chatChannelUri: sessionUri,
				sessionId: sdkSessionId,
				appliedSnapshot: { tools: [], plugins: [], mcpServers: {} } satisfies IActiveClientSnapshot,
				onMcpNotification: Event.None,
				onDidRequireAuth: Event.None,
				mcpServerStates: observableValue('test', []),
				async initializeSession(): Promise<void> { rec.initialized = true; },
				async remapTurnIds(mapping: ReadonlyMap<string, string>): Promise<void> { rec.remapCalls.push(mapping); },
				async send(prompt: string, _attachments: unknown, turnId: string | undefined, mode: unknown, senderClientId: string | undefined): Promise<void> {
					rec.sends.push({ prompt, turnId, mode, senderClientId });
				},
				resetTurnState(turnId: string, senderClientId: string | undefined): void { rec.resets.push({ turnId, senderClientId }); },
				async setModel(id: string, reasoningEffort?: string, contextTier?: string): Promise<void> { rec.modelCalls.push({ id, effort: reasoningEffort, tier: contextTier }); },
				async setAgent(name: string | undefined): Promise<void> { rec.agentCalls.push(name); },
				async collectDebugLogs(outputDirectory: URI, includeSessionLogs: boolean): Promise<void> {
					rec.debugLogCalls.push({ outputDirectory: outputDirectory.toString(), includeSessionLogs });
				},
				async hasRunningDetachedShells(): Promise<boolean> { return false; },
				handleClientToolCallComplete(): void { },
				async getNextTurnEventId(): Promise<string | undefined> { return undefined; },
				getMessages: getMessages ?? (async () => []),
				async destroySession(): Promise<void> { },
				dispose(): void { rec.disposed = true; owned?.dispose(); },
			} as unknown as CopilotAgentSession;
			return { rec, fake };
		}

		test('collectDebugLogs targets the selected peer chat', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'debug-peer');
				const defaultChat = URI.parse(buildDefaultChatUri(session));
				const peerChat = URI.parse(buildChatUri(session, 'peer-a'));
				const defaultSession = makeFakeChatSession(session, 'sdk-default');
				const peerSession = makeFakeChatSession(session, 'sdk-peer');
				setDefaultSessionStub(agent, AgentSession.id(session), defaultSession.fake, defaultChat);
				setPeerChatStub(agent, peerChat, peerSession.fake);

				const included = await agent.collectDebugLogs(session, URI.file('/debug-output'), peerChat);

				assert.deepStrictEqual({
					included,
					defaultChat: defaultSession.rec.debugLogCalls,
					peerChat: peerSession.rec.debugLogCalls,
				}, {
					included: true,
					defaultChat: [],
					peerChat: [{ outputDirectory: 'file:///debug-output', includeSessionLogs: true }],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createChat materializes an addressed chat, records its backing, and returns providerData (no copilot.chats write)', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'create-peer');
				await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });

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
					(built.fake as { chatChannelUri?: URI }).chatChannelUri = identity?.chatChannelUri;
					rec = built.rec;
					return built.fake;
				};

				const model: ModelSelection = { id: 'gpt-x' };
				const result = await agent.chats.createChat(chatUri, session, { model, workingDirectories: [URI.file('/workspace')] });

				const db = sessionDataService.openDatabase(session);
				const raw = await db.object.getMetadata('copilot.chats');
				assert.deepStrictEqual({
					tracked: hasLiveChat(agent, chatUri),
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

		test('resumes distinct peer chats in parallel while coalescing duplicate requests', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'parallel-peer-resume');
				setDefaultSessionStub(agent, AgentSession.id(session), { workingDirectory: URI.file('/workspace'), dispose() { } });
				const firstPeer = URI.parse(buildChatUri(session, 'peer-a'));
				const secondPeer = URI.parse(buildChatUri(session, 'peer-b'));
				await agent.materializeChat(firstPeer, exactChatContext(session, firstPeer), JSON.stringify({ sdkSessionId: 'sdk-a' }));
				await agent.materializeChat(secondPeer, exactChatContext(session, secondPeer), JSON.stringify({ sdkSessionId: 'sdk-b' }));

				const gates = new Map<string, DeferredPromise<void>>([
					['sdk-a', new DeferredPromise<void>()],
					['sdk-b', new DeferredPromise<void>()],
				]);
				const started = new Set<string>();
				const initializeCounts = new Map<string, number>();
				const internals = agent as unknown as ChatInternals;
				internals._createAgentSession = (launchPlan, _directory, _activeClient, identity) => {
					const built = makeFakeChatSession(identity!.sessionUri, launchPlan.sessionId, undefined, launchPlan.shellManager);
					built.fake.initializeSession = async () => {
						started.add(launchPlan.sessionId);
						initializeCounts.set(launchPlan.sessionId, (initializeCounts.get(launchPlan.sessionId) ?? 0) + 1);
						await gates.get(launchPlan.sessionId)!.p;
					};
					return built.fake;
				};

				const first = agent.chats.getMessages(firstPeer, exactChatContext(session, firstPeer));
				const duplicate = agent.chats.getMessages(firstPeer, exactChatContext(session, firstPeer));
				const second = agent.chats.getMessages(secondPeer, exactChatContext(session, secondPeer));
				for (let i = 0; i < 50 && started.size < 2; i++) {
					await timeout(0);
				}
				const startedBeforeCompletion = [...started].sort();
				gates.get('sdk-a')!.complete();
				gates.get('sdk-b')!.complete();
				await Promise.all([first, duplicate, second]);

				assert.deepStrictEqual({
					startedBeforeCompletion,
					firstPeerInitializations: initializeCounts.get('sdk-a'),
					secondPeerInitializations: initializeCounts.get('sdk-b'),
				}, {
					startedBeforeCompletion: ['sdk-a', 'sdk-b'],
					firstPeerInitializations: 1,
					secondPeerInitializations: 1,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('retries a peer resume after initialization fails', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'retry-peer-resume');
				setDefaultSessionStub(agent, AgentSession.id(session), { workingDirectory: URI.file('/workspace'), dispose() { } });
				const chat = URI.parse(buildChatUri(session, 'peer-a'));
				await agent.materializeChat(chat, exactChatContext(session, chat), JSON.stringify({ sdkSessionId: 'sdk-a' }));
				let initializationAttempts = 0;
				const internals = agent as unknown as ChatInternals;
				internals._createAgentSession = (launchPlan, _directory, _activeClient, identity) => {
					const built = makeFakeChatSession(identity!.sessionUri, launchPlan.sessionId, undefined, launchPlan.shellManager);
					built.fake.initializeSession = async () => {
						initializationAttempts++;
						if (initializationAttempts === 1) {
							throw new Error('first initialization failed');
						}
					};
					return built.fake;
				};

				await assert.rejects(() => agent.chats.getMessages(chat, exactChatContext(session, chat)), /first initialization failed/);
				await agent.chats.getMessages(chat, exactChatContext(session, chat));

				assert.strictEqual(initializationAttempts, 2);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('waits for an in-flight peer resume lease before releasing the exact chat', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'release-during-peer-resume');
				setDefaultSessionStub(agent, AgentSession.id(session), {
					workingDirectory: URI.file('/workspace'),
					hasActiveTurn: false,
					async destroySession() { },
					dispose() { },
				});
				const chat = URI.parse(buildChatUri(session, 'peer-a'));
				await agent.materializeChat(chat, exactChatContext(session, chat), JSON.stringify({ sdkSessionId: 'sdk-a' }));
				const gate = new DeferredPromise<void>();
				let initialized = false;
				const internals = agent as unknown as ChatInternals;
				internals._createAgentSession = (launchPlan, _directory, _activeClient, identity) => {
					const built = makeFakeChatSession(identity!.sessionUri, launchPlan.sessionId, undefined, launchPlan.shellManager);
					built.fake.initializeSession = async () => {
						initialized = true;
						await gate.p;
					};
					return built.fake;
				};

				const messages = agent.chats.getMessages(chat, exactChatContext(session, chat));
				for (let i = 0; i < 50 && !initialized; i++) {
					await timeout(0);
				}
				let released = false;
				const release = agent.chats.releaseChat(chat, exactChatContext(session, chat)).then(() => { released = true; });
				await timeout(0);
				const releasedBeforeResume = released;
				gate.complete();
				await Promise.all([messages, release]);

				assert.deepStrictEqual({
					initialized,
					releasedBeforeResume,
					peerStillRegistered: hasLiveChat(agent, chat),
				}, {
					initialized: true,
					releasedBeforeResume: false,
					peerStillRegistered: false,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('waits for peer resume leases in consecutive release cycles', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'consecutive-peer-releases');
				setDefaultSessionStub(agent, AgentSession.id(session), {
					workingDirectory: URI.file('/workspace'),
					hasActiveTurn: false,
					async destroySession() { },
					dispose() { },
				});
				const firstPeer = URI.parse(buildChatUri(session, 'peer-a'));
				const secondPeer = URI.parse(buildChatUri(session, 'peer-b'));
				const db = sessionDataService.openDatabase(session);
				await db.object.setMetadata('copilot.chats', JSON.stringify({
					'peer-a': { sdkSessionId: 'sdk-a' },
					'peer-b': { sdkSessionId: 'sdk-b' },
				}));
				await agent.materializeChat(firstPeer, exactChatContext(session, firstPeer), JSON.stringify({ sdkSessionId: 'sdk-a' }));
				await agent.materializeChat(secondPeer, exactChatContext(session, secondPeer), JSON.stringify({ sdkSessionId: 'sdk-b' }));
				const firstGate = new DeferredPromise<void>();
				const secondGate = new DeferredPromise<void>();
				const initialized = new Set<string>();
				const internals = agent as unknown as ChatInternals;
				internals._createAgentSession = (launchPlan, _directory, _activeClient, identity) => {
					const built = makeFakeChatSession(identity!.sessionUri, launchPlan.sessionId, undefined, launchPlan.shellManager);
					built.fake.initializeSession = async () => {
						initialized.add(launchPlan.sessionId);
						await (launchPlan.sessionId === 'sdk-a' ? firstGate : secondGate).p;
					};
					return built.fake;
				};

				const firstMessages = agent.chats.getMessages(firstPeer, exactChatContext(session, firstPeer));
				for (let i = 0; i < 50 && !initialized.has('sdk-a'); i++) {
					await timeout(0);
				}
				let firstReleased = false;
				const firstRelease = agent.chats.releaseChat(firstPeer, exactChatContext(session, firstPeer)).then(() => { firstReleased = true; });
				await timeout(0);
				const firstReleasedBeforeResume = firstReleased;
				firstGate.complete();
				await Promise.all([firstMessages, firstRelease]);

				const secondMessages = agent.chats.getMessages(secondPeer, exactChatContext(session, secondPeer));
				for (let i = 0; i < 50 && !initialized.has('sdk-b'); i++) {
					await timeout(0);
				}
				let secondReleased = false;
				const secondRelease = agent.chats.releaseChat(secondPeer, exactChatContext(session, secondPeer)).then(() => { secondReleased = true; });
				await timeout(0);
				const secondReleasedBeforeResume = secondReleased;
				secondGate.complete();
				await Promise.all([secondMessages, secondRelease]);

				assert.deepStrictEqual({
					firstReleasedBeforeResume,
					secondReleasedBeforeResume,
					initialized: [...initialized].sort(),
				}, {
					firstReleasedBeforeResume: false,
					secondReleasedBeforeResume: false,
					initialized: ['sdk-a', 'sdk-b'],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('resumes a peer access that starts during parent release', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'peer-access-during-release');
				const releaseGate = new DeferredPromise<void>();
				let releaseStarted = false;
				setDefaultSessionStub(agent, AgentSession.id(session), { workingDirectory: URI.file('/workspace'), dispose() { } });
				const chat = URI.parse(buildChatUri(session, 'peer-a'));
				setPeerChatStub(agent, chat, {
					workingDirectory: URI.file('/workspace'),
					hasActiveTurn: false,
					async hasRunningDetachedShells() { return false; },
					async getMessages() { return []; },
					async destroySession() {
						releaseStarted = true;
						await releaseGate.p;
					},
					dispose() { },
				}, 'sdk-a');
				const db = sessionDataService.openDatabase(session);
				await db.object.setMetadata('copilot.chats', JSON.stringify({ 'peer-a': { sdkSessionId: 'sdk-a' } }));
				await agent.materializeChat(chat, exactChatContext(session, chat), JSON.stringify({ sdkSessionId: 'sdk-a' }));
				const internals = agent as unknown as ChatInternals;
				let initializations = 0;
				internals._createAgentSession = (launchPlan, _directory, _activeClient, identity) => {
					const built = makeFakeChatSession(identity!.sessionUri, launchPlan.sessionId, undefined, launchPlan.shellManager);
					built.fake.initializeSession = async () => { initializations++; };
					return built.fake;
				};

				const release = agent.chats.releaseChat(chat, exactChatContext(session, chat));
				for (let i = 0; i < 50 && !releaseStarted; i++) {
					await timeout(0);
				}
				const messages = agent.chats.getMessages(chat, exactChatContext(session, chat));
				await timeout(0);
				const initializedDuringRelease = initializations;
				releaseGate.complete();
				await Promise.all([release, messages]);

				assert.deepStrictEqual({
					releaseStarted,
					initializedDuringRelease,
					initializations,
				}, {
					releaseStarted: true,
					initializedDuringRelease: 0,
					initializations: 1,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('does not block a session-sequenced peer resume behind a queued release', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'sequenced-peer-resume-before-release');
				const sessionId = AgentSession.id(session);
				setDefaultSessionStub(agent, sessionId, {
					workingDirectory: URI.file('/workspace'),
					hasActiveTurn: false,
					async destroySession() { },
					dispose() { },
				});
				const chat = URI.parse(buildChatUri(session, 'peer-a'));
				await agent.materializeChat(chat, exactChatContext(session, chat), JSON.stringify({ sdkSessionId: 'sdk-a' }));
				const enterPeerResume = new DeferredPromise<void>();
				const initialize = new DeferredPromise<void>();
				let sequencedOperationStarted = false;
				let initialized = false;
				const internals = agent as unknown as ChatInternals;
				internals._createAgentSession = (launchPlan, _directory, _activeClient, identity) => {
					const built = makeFakeChatSession(identity!.sessionUri, launchPlan.sessionId, undefined, launchPlan.shellManager);
					built.fake.initializeSession = async () => {
						initialized = true;
						await initialize.p;
					};
					return built.fake;
				};

				const sequencedPeerResume = internals._getOrCreateSessionLifetime('sdk-a')!.queueSession(async () => {
					sequencedOperationStarted = true;
					await enterPeerResume.p;
					return agent.chats.getMessages(chat, exactChatContext(session, chat));
				});
				for (let i = 0; i < 50 && !sequencedOperationStarted; i++) {
					await timeout(0);
				}
				const release = agent.chats.releaseChat(chat, exactChatContext(session, chat));
				enterPeerResume.complete();
				for (let i = 0; i < 50 && !initialized; i++) {
					await timeout(0);
				}
				const initializedBeforeRelease = initialized;
				initialize.complete();
				await Promise.all([sequencedPeerResume, release]);

				assert.deepStrictEqual({ sequencedOperationStarted, initializedBeforeRelease }, {
					sequencedOperationStarted: true,
					initializedBeforeRelease: true,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('wakes peer resume waiters and refuses new leases during shutdown', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'shutdown-wakes-peer-resume');
				const releaseGate = new DeferredPromise<void>();
				let releaseStarted = false;
				setDefaultSessionStub(agent, AgentSession.id(session), { workingDirectory: URI.file('/workspace'), dispose() { } });
				const waitingChat = URI.parse(buildChatUri(session, 'peer-a'));
				setPeerChatStub(agent, waitingChat, {
					workingDirectory: URI.file('/workspace'),
					hasActiveTurn: false,
					async hasRunningDetachedShells() { return false; },
					async destroySession() {
						releaseStarted = true;
						await releaseGate.p;
					},
					dispose() { },
				}, 'sdk-a');
				const afterShutdownChat = URI.parse(buildChatUri(session, 'peer-b'));
				await agent.materializeChat(waitingChat, exactChatContext(session, waitingChat), JSON.stringify({ sdkSessionId: 'sdk-a' }));
				await agent.materializeChat(afterShutdownChat, exactChatContext(session, afterShutdownChat), JSON.stringify({ sdkSessionId: 'sdk-b' }));

				const release = agent.chats.releaseChat(waitingChat, exactChatContext(session, waitingChat));
				for (let i = 0; i < 50 && !releaseStarted; i++) {
					await timeout(0);
				}
				const waitingMessages = agent.chats.getMessages(waitingChat, exactChatContext(session, waitingChat));
				const shutdown = agent.shutdown();
				const messagesAfterShutdown = await agent.chats.getMessages(afterShutdownChat, exactChatContext(session, afterShutdownChat));
				let waitingMessagesSettled = false;
				waitingMessages.then(() => { waitingMessagesSettled = true; });
				for (let i = 0; i < 50 && !waitingMessagesSettled; i++) {
					await timeout(0);
				}
				releaseGate.complete();
				const messagesBeforeReleaseCompletes = await waitingMessages;
				await Promise.all([release, shutdown]);

				assert.deepStrictEqual({
					waitingMessagesSettled,
					messagesBeforeReleaseCompletes,
					messagesAfterShutdown,
				}, {
					waitingMessagesSettled: true,
					messagesBeforeReleaseCompletes: [],
					messagesAfterShutdown: [],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('resumes peers after recreating a disposed session ID', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'reused-session-lifetime');
				await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });
				await disposeProvisionedSession(agent, session);
				await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });
				setDefaultSessionStub(agent, AgentSession.id(session), { workingDirectory: URI.file('/workspace'), dispose() { } });
				const chat = URI.parse(buildChatUri(session, 'peer-a'));
				await agent.materializeChat(chat, exactChatContext(session, chat), JSON.stringify({ sdkSessionId: 'sdk-a' }));
				let initialized = false;
				const internals = agent as unknown as ChatInternals;
				internals._createAgentSession = (launchPlan, _directory, _activeClient, identity) => {
					const built = makeFakeChatSession(identity!.sessionUri, launchPlan.sessionId, undefined, launchPlan.shellManager);
					built.fake.initializeSession = async () => { initialized = true; };
					return built.fake;
				};

				await agent.chats.getMessages(chat, exactChatContext(session, chat));
				assert.strictEqual(initialized, true);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('waits for an in-flight peer resume lease before disposing the exact chat', async () => {
			const client = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'dispose-during-peer-resume');
				setDefaultSessionStub(agent, AgentSession.id(session), {
					workingDirectory: URI.file('/workspace'),
					async destroySession() { },
					dispose() { },
				});
				const chat = URI.parse(buildChatUri(session, 'peer-a'));
				await agent.materializeChat(chat, exactChatContext(session, chat), JSON.stringify({ sdkSessionId: 'sdk-a' }));
				const gate = new DeferredPromise<void>();
				let initialized = false;
				const internals = agent as unknown as ChatInternals;
				internals._createAgentSession = (launchPlan, _directory, _activeClient, identity) => {
					const built = makeFakeChatSession(identity!.sessionUri, launchPlan.sessionId, undefined, launchPlan.shellManager);
					built.fake.initializeSession = async () => {
						initialized = true;
						await gate.p;
					};
					return built.fake;
				};

				const messages = agent.chats.getMessages(chat, exactChatContext(session, chat));
				for (let i = 0; i < 50 && !initialized; i++) {
					await timeout(0);
				}
				const dispose = agent.chats.disposeChat(chat, exactChatContext(session, chat));
				await timeout(0);
				const deletedBeforeResume = client.deletedSessionIds.includes('sdk-a');
				gate.complete();
				await Promise.all([messages, dispose]);

				assert.deepStrictEqual({
					initialized,
					deletedBeforeResume,
					peerStillRegistered: hasLiveChat(agent, chat),
				}, {
					initialized: true,
					deletedBeforeResume: false,
					peerStillRegistered: false,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createChat returns the existing backing without inferring a chat role from the resource', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'create-default');
				const created = await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });
				const internals = agent as unknown as ChatInternals;
				internals._createAgentSession = () => { throw new Error('_createAgentSession must not be called for the session-backed chat'); };

				const result = await agent.chats.createChat(defaultChatUri(session), exactChatContext(session, defaultChatUri(session), session), {});

				assert.deepStrictEqual({
					backings: chatBackings(agent).size,
					providerData: result?.providerData ? JSON.parse(result.providerData) : undefined,
				}, {
					backings: 1,
					providerData: JSON.parse(created.providerData!),
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createChat forks the source chat into a new addressed chat and returns the forked chat providerData', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'fork-peer');
				await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });

				const internals = agent as unknown as ChatInternals;
				// Install the session-backed chat as the fork source so resolution stays
				// in-memory (no SDK resume).
				const source = makeFakeChatSession(session, 'source-sdk');
				setDefaultSessionStub(agent, AgentSession.id(session), source.fake, defaultChatUri(session));

				// Stub the SDK/fs fork seam: assert the inputs and hand back a
				// deterministic forked chat id.
				let forkArgs: { sourceEntry: unknown; turnId: string } | undefined;
				internals._forkSdkChat = async (_client, sourceEntry, turnId) => {
					forkArgs = { sourceEntry, turnId };
					return { sessionId: 'forked-sdk-id', inheritedTurnId: undefined };
				};
				let captured: CopilotSessionLaunchPlan | undefined;
				internals._createAgentSession = (launchPlan, _dir, _ac, identity) => {
					captured = launchPlan;
					const built = makeFakeChatSession(session, launchPlan.sessionId, undefined, launchPlan.shellManager);
					(built.fake as { chatChannelUri?: URI }).chatChannelUri = identity?.chatChannelUri;
					return built.fake;
				};

				const chatUri = URI.parse(buildChatUri(session, 'peer-fork'));
				const result = await agent.chats.createChat(chatUri, session, { fork: { source: URI.parse(buildDefaultChatUri(session)), turnId: 't1' }, workingDirectories: [URI.file('/workspace')] });

				const db = sessionDataService.openDatabase(session);
				const raw = await db.object.getMetadata('copilot.chats');
				assert.deepStrictEqual({
					sourceIsDefaultSession: forkArgs?.sourceEntry === source.fake,
					forkedTurnId: forkArgs?.turnId,
					launchKind: captured?.kind,
					launchSessionId: captured?.sessionId,
					tracked: hasLiveChat(agent, chatUri),
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
				await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });
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
				setDefaultSessionStub(agent, AgentSession.id(session), source.fake, defaultChatUri(session));
				const internals = agent as unknown as ChatInternals;
				internals._forkSdkChat = async () => ({ sessionId: 'side-sdk-id', inheritedTurnId: 't1' });
				let sideRecorder: IFakeChatRecorder | undefined;
				internals._createAgentSession = launchPlan => {
					const side = makeFakeChatSession(session, launchPlan.sessionId, async () => (
						sideRecorder && sideRecorder.sends.length > 0 ? [sourceTurn, sideTurn] : [sourceTurn]
					), launchPlan.shellManager);
					sideRecorder = side.rec;
					return side.fake;
				};

				const chatUri = URI.parse(buildChatUri(session, 'peer-side'));
				const sourceLockEntered = new DeferredPromise<void>();
				const releaseSourceLock = new DeferredPromise<void>();
				const sourceLock = internals._getOrCreateSessionLifetime(AgentSession.id(session))!.queueSession(async () => {
					sourceLockEntered.complete();
					await releaseSourceLock.p;
				});
				await sourceLockEntered.p;
				let result;
				const createTimeout = timeout(5_000);
				try {
					result = await Promise.race([
						agent.chats.createChat(chatUri, exactChatContext(session, chatUri), {
							sideChat: { source: URI.parse(buildDefaultChatUri(session)), turnId: 'active-turn', sourceContext, partialResponse },
							workingDirectories: [URI.file('/workspace')],
						}),
						createTimeout.then(() => { throw new Error('Side chat creation waited for the source turn lock'); }),
					]);
				} finally {
					createTimeout.cancel();
					releaseSourceLock.complete();
					await sourceLock;
				}
				await agent.chats.sendMessage(chatUri, 'side', undefined, undefined, 't2');
				await agent.chats.sendMessage(chatUri, 'follow-up', undefined, undefined, 't3');
				await agent.chats.changeModel(chatUri, { id: 'gpt-y' }, exactChatContext(session, chatUri));
				const turns = await agent.chats.getMessages(chatUri, exactChatContext(session, chatUri));

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
					sideChat: { source: buildDefaultChatUri(session), turnId: 'active-turn', inheritedTurnId: 't1', context: sourceContext, partialResponse },
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
				await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });
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
				setDefaultSessionStub(agent, AgentSession.id(session), source.fake, defaultChatUri(session));
				const internals = agent as unknown as ChatInternals;
				let forkTurnId: string | undefined;
				internals._forkSdkChat = async (_client, _sourceEntry, turnId) => {
					forkTurnId = turnId;
					return { sessionId: 'side-sdk-id', inheritedTurnId: 't1' };
				};
				let sideRecorder: IFakeChatRecorder | undefined;
				internals._createAgentSession = launchPlan => {
					const side = makeFakeChatSession(session, launchPlan.sessionId, async () => (
						sideRecorder && sideRecorder.sends.length > 0 ? [sourceTurn, sideTurn] : [sourceTurn]
					), launchPlan.shellManager);
					sideRecorder = side.rec;
					return side.fake;
				};

				const chatUri = URI.parse(buildChatUri(session, 'peer-side-local'));
				const result = await agent.chats.createChat(chatUri, exactChatContext(session, chatUri), {
					sideChat: {
						source: URI.parse(buildDefaultChatUri(session)),
						turnId: 'local-1',
						providerAnchorTurnId: 't1',
						sourceContext,
					},
					workingDirectories: [URI.file('/workspace')],
				});
				await agent.chats.sendMessage(chatUri, 'side', undefined, undefined, 't2');
				await agent.chats.sendMessage(chatUri, 'follow-up', undefined, undefined, 't3');
				const turns = await agent.chats.getMessages(chatUri, exactChatContext(session, chatUri));

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
						inheritedTurnId: 't1',
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

		test('sendMessage on an addressed chat resumes the addressed backing even when the parent session is provisional', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'route-provisional-peer');
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });
				await agent.materializeChat(chatUri, session, JSON.stringify({ sdkSessionId: 'peer-sdk-id' }));

				const internals = agent as unknown as ChatInternals;
				const launches: { kind: string; sessionId: string; chat: string | undefined }[] = [];
				internals._createAgentSession = (launchPlan, _dir, _ac, identity) => {
					launches.push({ kind: launchPlan.kind, sessionId: launchPlan.sessionId, chat: identity?.chatChannelUri.toString() });
					const built = makeFakeChatSession(session, launchPlan.sessionId, undefined, launchPlan.shellManager);
					(built.fake as { chatChannelUri?: URI }).chatChannelUri = identity?.chatChannelUri;
					return built.fake;
				};

				await agent.chats.sendMessage(chatUri, 'hello peer', undefined, undefined, undefined, undefined, exactChatContext(session, chatUri));

				assert.deepStrictEqual({
					launches,
					tracked: hasLiveChat(agent, chatUri),
					parentResumeCalls: (agent as TestableCopilotAgent).resumeCalls,
				}, {
					launches: [{ kind: 'resume', sessionId: 'peer-sdk-id', chat: chatUri.toString() }],
					tracked: true,
					parentResumeCalls: [],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('sendMessage resolves the working directory before resuming an addressed backing', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const { agent, configurationService } = createTestAgentContext(disposables, {
				sessionDataService,
				copilotClient: new TestCopilotClient([]),
				rootConfig: { [AgentHostCopilotMultiRootEnabledConfigKey]: true },
			});
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'route-resolved-peer');
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				const persistedWorkingDirectory = URI.file('/missing-worktree');
				const resolvedWorkingDirectory = URI.file('/repository');
				const secondaryWorkingDirectory = URI.file('/secondary');
				const resolveCalls: { session: string; workingDirectory: string }[] = [];
				configurationService.resolveWorkingDirectoryForResume = async (session, workingDirectory) => {
					resolveCalls.push({ session, workingDirectory: workingDirectory.toString() });
					return resolvedWorkingDirectory;
				};
				await provisionSession(agent, { session, workingDirectories: [persistedWorkingDirectory, secondaryWorkingDirectory] });
				await agent.materializeChat(chatUri, session, JSON.stringify({ sdkSessionId: 'peer-sdk-id' }));

				const internals = agent as unknown as ChatInternals;
				const launches: { workingDirectory: string | undefined; additionalDirectories: string[] | undefined; customizationDirectory: string | undefined }[] = [];
				internals._createAgentSession = (launchPlan, customizationDirectory, _activeClient, identity) => {
					launches.push({
						workingDirectory: launchPlan.workingDirectory?.toString(),
						additionalDirectories: launchPlan.additionalDirectories?.map(directory => directory.toString()),
						customizationDirectory: customizationDirectory?.toString(),
					});
					const built = makeFakeChatSession(session, launchPlan.sessionId, undefined, launchPlan.shellManager);
					(built.fake as { chatChannelUri?: URI }).chatChannelUri = identity?.chatChannelUri;
					(built.fake as { appliedAdditionalDirectories?: readonly URI[] }).appliedAdditionalDirectories = launchPlan.additionalDirectories;
					return built.fake;
				};

				await agent.chats.sendMessage(chatUri, 'hello peer', [persistedWorkingDirectory, secondaryWorkingDirectory], undefined, undefined, undefined, exactChatContext(session, chatUri, session));
				const dbRef = sessionDataService.openDatabase(session);
				const storedWorkingDirectories = await dbRef.object.getMetadata('copilot.workingDirectories');
				dbRef.dispose();

				assert.deepStrictEqual({
					resolveCalls,
					launches,
					storedWorkingDirectories: storedWorkingDirectories ? JSON.parse(storedWorkingDirectories) : undefined,
				}, {
					resolveCalls: [{ session: session.toString(), workingDirectory: persistedWorkingDirectory.toString() }],
					launches: [{
						workingDirectory: resolvedWorkingDirectory.toString(),
						additionalDirectories: [secondaryWorkingDirectory.toString()],
						customizationDirectory: resolvedWorkingDirectory.toString(),
					}],
					storedWorkingDirectories: [resolvedWorkingDirectory.toString(), secondaryWorkingDirectory.toString()],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('sendMessage throws for a chat with no backing chat', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'route-ghost');
				const chatUri = URI.parse(buildChatUri(session, 'ghost'));
				await assert.rejects(
					() => agent.chats.sendMessage(chatUri, 'hi', undefined, undefined, undefined, undefined, exactChatContext(session, chatUri)),
					/unknown chat/,
				);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('changeModel applies to the targeted chat only', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'model-route');
				const chatA = URI.parse(buildChatUri(session, 'peer-a'));
				const chatB = URI.parse(buildChatUri(session, 'peer-b'));
				const a = makeFakeChatSession(session, 'sdk-a');
				const b = makeFakeChatSession(session, 'sdk-b');
				setPeerChatStub(agent, chatA, a.fake);
				setPeerChatStub(agent, chatB, b.fake);

				await agent.chats.changeModel(chatA, { id: 'model-x' }, exactChatContext(session, chatA));

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

		test('changeModel applies the per-model reasoning-effort override from the capability overrides', async () => {
			const { agent, configurationService } = createTestAgentContext(disposables);
			try {
				configurationService.updateRootConfig({ modelCapabilityOverrides: { 'model-x': { reasoningEffort: 'low' }, '*': { reasoningEffort: 'high' } } });
				const session = AgentSession.uri('copilotcli', 'model-effort');
				const chatA = URI.parse(buildChatUri(session, 'peer-a'));
				const a = makeFakeChatSession(session, 'sdk-a');
				setPeerChatStub(agent, chatA, a.fake);

				await agent.chats.changeModel(chatA, { id: 'model-x' }, exactChatContext(session, chatA));
				await agent.chats.changeModel(chatA, { id: 'model-y', config: { thinkingLevel: 'medium' } }, exactChatContext(session, chatA));

				assert.deepStrictEqual(a.rec.modelCalls, [
					// the specific entry wins; the wildcard covers every other model,
					// beating the picker's thinking level
					{ id: 'model-x', effort: 'low', tier: undefined },
					{ id: 'model-y', effort: 'high', tier: undefined },
				]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('changeModel keeps the selected model id and tuning through a family alias', async () => {
			const { agent, configurationService } = createTestAgentContext(disposables);
			try {
				configurationService.updateRootConfig({
					modelCapabilityOverrides: {
						'preview-model': { family: 'claude-opus-4.8' },
						'pinned-model': { family: 'gpt-5', reasoningEffort: 'high' },
					},
				});
				const session = AgentSession.uri('copilotcli', 'model-family');
				const chatA = URI.parse(buildChatUri(session, 'peer-a'));
				const a = makeFakeChatSession(session, 'sdk-a');
				setPeerChatStub(agent, chatA, a.fake);

				await agent.chats.changeModel(chatA, { id: 'preview-model', config: { thinkingLevel: 'medium' } }, exactChatContext(session, chatA));
				await agent.chats.changeModel(chatA, { id: 'pinned-model' }, exactChatContext(session, chatA));

				assert.deepStrictEqual(a.rec.modelCalls, [
					// the alias never reaches the wire; the picker's level survives
					{ id: 'preview-model', effort: 'medium', tier: undefined },
					// a per-model effort override still applies
					{ id: 'pinned-model', effort: 'high', tier: undefined },
				]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('changeModel persists the model for metadata-fallback resumes', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([], [{ id: 'model-a', name: 'Model A' }, { id: 'model-b', name: 'Model B' }]);
			client.createSession = async () => new MockCopilotSession() as unknown as CopilotSession;
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await waitForState(agent.models, m => m.length > 0);
				const session = AgentSession.uri('copilotcli', 'model-persist-session');
				const chat = defaultChatUri(session);
				const result = await provisionSession(agent, {
					session,
					workingDirectories: [URI.file('/workspace')],
					model: { id: 'model-a' },
				});
				await agent.chats.sendMessage(chat, 'hello', undefined, undefined, undefined, undefined, exactChatContext(result.session, chat, result.session));

				await agent.chats.changeModel(chat, { id: 'model-b' }, exactChatContext(result.session, chat, result.session));

				const stored = await sessionDataService.openDatabase(session).object.getMetadata('copilot.model');
				assert.deepStrictEqual(JSON.parse(stored ?? 'null'), { id: 'model-b' });
			} finally {
				await disposeAgent(agent);
			}
		});

		test('changeAgent resolves and applies the agent to the targeted chat, and clears it with undefined', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'agent-route');
				const chatA = URI.parse(buildChatUri(session, 'peer-a'));
				const a = makeFakeChatSession(session, 'sdk-a');
				const internals = agent as unknown as ChatInternals;
				setPeerChatStub(agent, chatA, a.fake);
				internals._resolveAgentName = (_snapshot, selection) => selection.uri === 'agent://x' ? 'Resolved Agent' : undefined;

				await agent.chats.changeAgent(chatA, { uri: 'agent://x' }, exactChatContext(session, chatA));
				await agent.chats.changeAgent(chatA, undefined, exactChatContext(session, chatA));

				assert.deepStrictEqual(a.rec.agentCalls, ['Resolved Agent', undefined]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('round-trips addressed chats through providerData + materializeChat and resumes per-chat history after a restart', async () => {
			// A single session data service is shared across the two agent
			// instances to model the on-disk store surviving a process restart.
			const sessionDataService = disposables.add(new TestSessionDataService());
			const session = AgentSession.uri('copilotcli', 'restore-rt');
			const created: Record<string, string> = {};
			const providerData: Record<string, string> = {};

			// ---- process #1: create two addressed chats, capturing the opaque
			// providerData blob the orchestrator would persist for each ----
			const agent1 = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent1.authenticate('https://api.github.com', 'token');
				await provisionSession(agent1, { session, workingDirectories: [URI.file('/workspace')] });
				const internals1 = agent1 as unknown as ChatInternals;
				internals1._createAgentSession = (launchPlan, _dir, _ac, identity) => {
					if (identity) {
						created[identity.chatChannelUri.authority] = launchPlan.sessionId;
					}
					const built = makeFakeChatSession(session, launchPlan.sessionId, undefined, launchPlan.shellManager);
					(built.fake as { chatChannelUri?: URI }).chatChannelUri = identity?.chatChannelUri;
					return built.fake;
				};
				const peerAUri = URI.parse(buildChatUri(session, 'peer-a'));
				const peerBUri = URI.parse(buildChatUri(session, 'peer-b'));
				const resA = await agent1.chats.createChat(peerAUri, session, { workingDirectories: [URI.file('/workspace')] });
				const resB = await agent1.chats.createChat(peerBUri, session, { workingDirectories: [URI.file('/workspace')] });
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
				await provisionSession(agent2, { session, workingDirectories: [URI.file('/workspace')] });

				const internals2 = agent2 as unknown as ChatInternals;
				const peerA = URI.parse(buildChatUri(session, 'peer-a'));
				const peerB = URI.parse(buildChatUri(session, 'peer-b'));
				// The orchestrator hands each persisted blob back to the agent.
				await agent2.materializeChat(peerA, session, providerData['peer-a']);
				await agent2.materializeChat(peerB, session, providerData['peer-b']);

				const peerAHistory: readonly Turn[] = [{ id: 'turn-1' } as unknown as Turn];
				let resumed: CopilotSessionLaunchPlan | undefined;
				internals2._createAgentSession = (launchPlan, _dir, _ac, identity) => {
					resumed = launchPlan;
					const built = makeFakeChatSession(session, launchPlan.sessionId, async () => peerAHistory, launchPlan.shellManager);
					(built.fake as { chatChannelUri?: URI }).chatChannelUri = identity?.chatChannelUri;
					return built.fake;
				};

				await agent2.chats.sendMessage(peerA, 'after restart', undefined, undefined, undefined, undefined, exactChatContext(session, peerA));
				const history = await getPeerChatStub(agent2, peerA)!.getMessages();

				assert.deepStrictEqual({
					materializedBackings: [internals2._chatBackings.get(peerA.toString()), internals2._chatBackings.get(peerB.toString())],
					resumeKind: resumed?.kind,
					resumeSessionId: resumed?.sessionId,
					expectedSessionId: created['peer-a'],
					historyLen: history.length,
					tracked: hasLiveChat(agent2, peerA),
					parentResumeCalls: (agent2 as TestableCopilotAgent).resumeCalls,
				}, {
					materializedBackings: [{ sdkSessionId: created['peer-a'] }, { sdkSessionId: created['peer-b'] }],
					resumeKind: 'resume',
					resumeSessionId: created['peer-a'],
					expectedSessionId: created['peer-a'],
					historyLen: 1,
					tracked: true,
					parentResumeCalls: [],
				});
			} finally {
				await disposeAgent(agent2);
			}
		});

		test('legacy peer catalog migrates to canonical providerData before materialization', async () => {
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

				const legacy = await agent.listLegacyChatBackings(session);
				await agent.materializeChat(chatUri, session, legacy[0].providerData);
				// A corrupt blob is dropped (no backing recorded).
				const corruptUri = URI.parse(buildChatUri(session, 'peer-corrupt'));
				await agent.materializeChat(corruptUri, session, 'not json');

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

		test('changeModel on a chat leaf refreshes its backing and fires onDidChangeChatData', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'model-blob');
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				const internals = agent as unknown as ChatInternals;
				setPeerChatStub(agent, chatUri, makeFakeChatSession(session, 'sdk-a').fake);
				internals._chatBackings.set(chatUri.toString(), { sdkSessionId: 'sdk-a' });

				const events: { chat: string; providerData: unknown }[] = [];
				disposables.add(agent.onDidChangeChatData(e => events.push({ chat: e.chat.toString(), providerData: JSON.parse(e.providerData) })));

				await agent.chats.changeModel(chatUri, { id: 'model-x' }, exactChatContext(session, chatUri));

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
	// single chat URI back to the right `(session, chat)` target — an
	// `ahp-chat` URI keeps its own identity, while a session URI maps to the
	// session-backed chat — and then delegates to the legacy implementation.
	suite('chat surface (IAgentChats)', () => {

		type ConvInternals = {
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
		 * Installs a recording fake {@link CopilotAgentSession} as an addressed
		 * chat leaf (hosted on the owning session) or as a session-backed chat,
		 * keyed as the real agent would, so the chat adapter can drive the real
		 * legacy methods.
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
				async hasRunningDetachedShells(): Promise<boolean> { return false; },
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
		 * Stubs `_createAgentSession` (the SDK-backed launch seam) so chat
		 * creation/fork stays in-memory: it returns a minimal fake whose
		 * `sessionId` echoes the launch plan, which is what `createChat` records
		 * as the chat's backing.
		 */
		function stubBackingSession(agent: CopilotAgent): void {
			(agent as unknown as ConvInternals)._createAgentSession = (launchPlan, _dir, _ac, identity) => {
				const sessionUri = identity?.sessionUri ?? AgentSession.uri('copilotcli', launchPlan.sessionId);
				const chatChannelUri = identity?.chatChannelUri ?? defaultChatUri(sessionUri);
				return {
					sessionUri,
					chatChannelUri,
					sessionId: launchPlan.sessionId,
					appliedSnapshot: { tools: [], plugins: [], mcpServers: {} } satisfies IActiveClientSnapshot,
					onMcpNotification: Event.None,
					onDidRequireAuth: Event.None,
					mcpServerStates: observableValue('test', []),
					async initializeSession(): Promise<void> { },
					async remapTurnIds(): Promise<void> { },
					async getMessages(): Promise<readonly Turn[]> { return []; },
					async destroySession(): Promise<void> { },
					handleClientToolCallComplete(): void { },
					dispose(): void { launchPlan.shellManager?.dispose(); },
				} as unknown as CopilotAgentSession;
			};
		}

		test('one createChat entry serves both a deferred first backing and an eager additional backing', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'uniform-create');
				const sessionChat = defaultChatUri(session);
				const peerChat = URI.parse(buildChatUri(session, 'peer-a'));
				stubBackingSession(agent);

				const standsUpSession = await agent.chats.createChat(sessionChat, exactChatContext(session, sessionChat, session), { workingDirectories: [URI.file('/workspace')], deferBacking: true });
				const independent = await agent.chats.createChat(peerChat, exactChatContext(session, peerChat), { workingDirectories: [URI.file('/workspace')] });

				const backings = chatBackings(agent);
				assert.deepStrictEqual({
					deferred: {
						// The provider contract carries no `session`; results are keyed
						// only by the exact chat, never by the session that owns it.
						hasSessionField: standsUpSession ? Object.hasOwn(standsUpSession, 'session') : false,
						resolvedWorkingDirectory: standsUpSession?.resolvedWorkingDirectory?.toString(),
						provisional: standsUpSession?.provisional,
						recordedBacking: JSON.parse(standsUpSession!.providerData!).sdkSessionId === backings.get(sessionChat.toString())?.sdkSessionId,
						backingIsSeparatelyEnumerable: standsUpSession?.backingSession !== undefined,
					},
					eager: {
						hasSessionField: independent ? Object.hasOwn(independent, 'session') : false,
						provisional: independent?.provisional,
						recordedBacking: JSON.parse(independent!.providerData!).sdkSessionId === backings.get(peerChat.toString())?.sdkSessionId,
						backingIsSeparatelyEnumerable: independent?.backingSession !== undefined,
					},
				}, {
					deferred: {
						hasSessionField: false,
						resolvedWorkingDirectory: URI.file('/workspace').toString(),
						provisional: true,
						recordedBacking: true,
						backingIsSeparatelyEnumerable: true,
					},
					eager: {
						hasSessionField: false,
						provisional: undefined,
						recordedBacking: true,
						backingIsSeparatelyEnumerable: true,
					},
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('an imported creation reports the exact backing it recorded and no separately enumerable backing session', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/import-backing-home-`));
			const workingDirectory = URI.file(await fs.mkdtemp(`${os.tmpdir()}/import-backing-cwd-`));
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			client.resumeSession = async () => new MockCopilotSession() as unknown as CopilotSession;
			const agent = createTestAgent(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'import-backing');
				const chat = defaultChatUri(session);
				const turn: Turn = {
					id: 'imported-turn-1',
					state: TurnState.Complete,
					message: { text: 'Remember IMPORT_ALPHA.', origin: { kind: MessageKind.User } },
					responseParts: [{ kind: ResponsePartKind.Markdown, id: 'response', content: 'ready' }],
					usage: {},
				};

				const result = await provisionSession(agent, {
					session,
					workingDirectories: [workingDirectory],
					importConversation: { turns: [turn] },
				});

				assert.deepStrictEqual({
					providerData: JSON.parse(result.providerData!),
					recordedBacking: chatBackings(agent).get(chat.toString()),
					backingSession: result.backingSession,
				}, {
					providerData: { sdkSessionId: 'import-backing' },
					recordedBacking: { sdkSessionId: 'import-backing' },
					backingSession: undefined,
				});
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		}).timeout(30_000);

		test('createChat mints a provisional session', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				const session = AgentSession.uri('copilotcli', 'scope-create');
				const result = await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });
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

		test('session teardown tears down a provisional session', async () => {
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
			try {
				const session = AgentSession.uri('copilotcli', 'scope-dispose');
				await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });
				const internals = agent as unknown as ConvInternals;
				assert.strictEqual(internals._provisionalSessions.has(AgentSession.id(session)), true);

				await disposeProvisionedSession(agent, session);

				assert.strictEqual(internals._provisionalSessions.has(AgentSession.id(session)), false);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createChat creates a chat leaf and returns its providerData', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'conv-create');
				await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));

				stubBackingSession(agent);
				const result = await agent.chats.createChat(chatUri, session, { model: { id: 'gpt-x' }, workingDirectories: [URI.file('/workspace')] });

				assert.deepStrictEqual({
					tracked: hasLiveChat(agent, chatUri),
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

		test('a fork source mints the forked backing through the same createChat entry', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'conv-fork');
				await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });
				installFake(agent, AgentSession.id(session), 'session', session);

				const forkArgs: { turnId: string }[] = [];
				(agent as unknown as { _forkSdkChat: (client: unknown, sourceEntry: unknown, turnId: string) => Promise<{ sessionId: string; inheritedTurnId: string | undefined }> })._forkSdkChat = async (_c, _s, turnId) => {
					forkArgs.push({ turnId });
					return { sessionId: 'forked-sdk-id', inheritedTurnId: undefined };
				};
				stubBackingSession(agent);

				const chatUri = URI.parse(buildChatUri(session, 'peer-fork'));
				const source: IAgentCreateChatForkSource = { source: URI.parse(buildDefaultChatUri(session)), turnId: 't1' };
				const result = await agent.chats.createChat(chatUri, session, { fork: source, workingDirectories: [URI.file('/workspace')] });

				assert.deepStrictEqual({
					forkArgs,
					tracked: hasLiveChat(agent, chatUri),
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

		test('a cold peer fork reads the source peer storage scope', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'cold-peer-fork-owner');
				await provisionSession(agent, { session, workingDirectories: [URI.file('/workspace')] });
				const source = URI.parse(buildChatUri(session, 'source-peer'));
				await agent.materializeChat(source, exactChatContext(session, source), JSON.stringify({ sdkSessionId: 'source-peer-sdk' }));

				let resolvedSourceResource: string | undefined;
				(agent as unknown as { _ensureResolvedChatSession: (context: { resource: URI }) => Promise<CopilotAgentSession> })._ensureResolvedChatSession = async context => {
					resolvedSourceResource = context.resource.toString();
					return {} as unknown as CopilotAgentSession;
				};
				(agent as unknown as { _forkSdkChat: () => Promise<{ sessionId: string; inheritedTurnId: string | undefined }> })._forkSdkChat = async () => {
					return { sessionId: 'forked-peer-sdk', inheritedTurnId: undefined };
				};
				stubBackingSession(agent);

				const fork = URI.parse(buildChatUri(session, 'forked-peer'));
				await agent.chats.createChat(fork, exactChatContext(session, fork), {
					fork: { source, turnId: 'turn-1' },
					workingDirectories: [URI.file('/workspace')],
				});

				assert.strictEqual(resolvedSourceResource, source.toString());
			} finally {
				await disposeAgent(agent);
			}
		});

		test('sendMessage routes an exact chat URI to the addressed chat', async () => {
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

		test('sendMessage routes a scope (session) URI to the session-backed chat', async () => {
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

		test('abort, changeModel, and changeAgent route an exact chat URI to the addressed chat', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'conv-ops');
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				const rec = installFake(agent, chatUri.toString(), 'chat', session);
				(agent as unknown as { _resolveAgentName: (snap: IActiveClientSnapshot, a: AgentSelection) => string | undefined })._resolveAgentName = (_snap, sel) => sel.uri === 'agent://x' ? 'Resolved Agent' : undefined;

				await agent.chats.abort(chatUri, exactChatContext(session, chatUri));
				await agent.chats.changeModel(chatUri, { id: 'model-x' }, exactChatContext(session, chatUri));
				await agent.chats.changeAgent(chatUri, { uri: 'agent://x' }, exactChatContext(session, chatUri));
				await agent.chats.changeAgent(chatUri, undefined, exactChatContext(session, chatUri));

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

		test('getMessages returns the addressed chat history', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'conv-history');
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				installFake(agent, chatUri.toString(), 'chat', session);

				const turns = await agent.chats.getMessages(chatUri, exactChatContext(session, chatUri));

				assert.deepStrictEqual(turns.map(t => t.id), [`turn-${chatUri.toString()}`]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeChat disposes the addressed chat', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const session = AgentSession.uri('copilotcli', 'conv-dispose');
				const chatUri = URI.parse(buildChatUri(session, 'peer-a'));
				const rec = installFake(agent, chatUri.toString(), 'chat', session);

				await agent.chats.disposeChat(chatUri, exactChatContext(session, chatUri));

				assert.deepStrictEqual({
					disposed: rec.disposed,
					tracked: hasLiveChat(agent, chatUri),
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

		test('releaseChat releases only the addressed live chat', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'conv-release');
				const defaultRec = installFake(agent, AgentSession.id(session), 'session', session);
				const peerChat = URI.parse(buildChatUri(session, 'peer-release'));
				const peerRec = installFake(agent, peerChat.toString(), 'chat', session);

				await agent.chats.releaseChat(peerChat, exactChatContext(session, peerChat));

				assert.deepStrictEqual({
					defaultDisposed: defaultRec.disposed,
					peerDisposed: peerRec.disposed,
					defaultLive: hasLiveChat(agent, defaultChatUri(session)),
					peerLive: hasLiveChat(agent, peerChat),
					peerBacking: chatBackings(agent).get(peerChat.toString()),
				}, {
					defaultDisposed: false,
					peerDisposed: true,
					defaultLive: true,
					peerLive: false,
					peerBacking: { sdkSessionId: 'sdk-' + peerChat.toString() },
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeChat releases the peer chat\'s own OTel trace context without releasing a still-live sibling\'s scope', async () => {
			const otelService = new RecordingReleaseOTelService();
			const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]), otelService });
			try {
				const session = AgentSession.uri('copilotcli', 'conv-peer-otel');
				const defaultChat = defaultChatUri(session);
				const defaultRec = installFake(agent, AgentSession.id(session), 'session', session);
				const peerChat = URI.parse(buildChatUri(session, 'peer-otel'));
				const peerRec = installFake(agent, peerChat.toString(), 'chat', session);

				// A peer chat's own OTel trace context is keyed by its host-chosen
				// persistence resource — its own chat URI, `exactChatContext`'s
				// default `resource` — never by the shared session scope.
				// Disposing it while the default chat still shares the scope must
				// release only that key: the scope is still live, so nothing
				// scope-wide is released or finalized.
				await agent.chats.disposeChat(peerChat, exactChatContext(session, peerChat));

				assert.deepStrictEqual({
					peerDisposed: peerRec.disposed,
					defaultDisposed: defaultRec.disposed,
					peerLive: hasLiveChat(agent, peerChat),
					defaultLive: hasLiveChat(agent, defaultChat),
					released: otelService.released,
				}, {
					peerDisposed: true,
					defaultDisposed: false,
					peerLive: false,
					defaultLive: true,
					released: [peerChat.toString()],
				});

				// Disposing the last remaining chat — the default, whose own
				// resource coincides with the scope — finalizes the scope too:
				// its key is released once for the chat's own teardown and once
				// more (idempotently) by scope finalization.
				await agent.chats.disposeChat(defaultChat, exactChatContext(session, defaultChat, session));

				assert.deepStrictEqual(otelService.released, [peerChat.toString(), session.toString(), session.toString()]);
			} finally {
				await disposeAgent(agent);
			}
		});
	});


	suite('active-client chat membership fan-out', () => {
		/**
		 * Structural view of the agent's private per-session `ActiveClient`,
		 * limited to the host-owned membership surface under test.
		 */
		type MembershipActiveClient = {
			clientChats(clientId: string): readonly string[];
			contributesTo(clientId: string, chatKey: string): boolean;
			toolsForChat(chatKey: string): readonly ToolDefinition[];
			snapshot(chatKey?: string): Promise<IActiveClientSnapshot>;
			requiresRestart(snap: IActiveClientSnapshot, chatKey?: string): Promise<boolean>;
		};

		function membership(agent: CopilotAgent, session: URI): MembershipActiveClient {
			const activeClients = (agent as unknown as { _activeClients: { get(s: URI): MembershipActiveClient | undefined } })._activeClients;
			const activeClient = activeClients.get(session);
			assert.ok(activeClient, 'expected an ActiveClient after a host fan-out');
			return activeClient;
		}

		const toolA: ToolDefinition = { name: 'tool_a', description: 'from A', inputSchema: { type: 'object', properties: {} } };
		const toolB: ToolDefinition = { name: 'tool_b', description: 'from B', inputSchema: { type: 'object', properties: {} } };

		test('adding a chat to a client\'s membership extends its reach without touching other clients', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'membership-growth');
				const defaultChat = defaultChatUri(session);
				const peerChat = URI.parse(buildChatUri(session, 'peer-1'));

				// First: client A reaches only the session's own chat; client B
				// reaches both, added one exact chat at a time — so the peer chat
				// is a chat the host has published membership for.
				agent.getOrCreateActiveClient(defaultChat, session, { clientId: 'client-A' }).tools = [toolA];
				agent.getOrCreateActiveClient(defaultChat, session, { clientId: 'client-B' }).tools = [toolB];
				agent.getOrCreateActiveClient(peerChat, session, { clientId: 'client-B' });
				const active = membership(agent, session);
				const peerSnapshotBeforeGrowth = await active.snapshot(peerChat.toString());

				const before = {
					chatsA: active.clientChats('client-A'),
					toolsOnDefault: active.toolsForChat(defaultChat.toString()).map(tool => tool.name),
					toolsOnPeer: active.toolsForChat(peerChat.toString()).map(tool => tool.name),
					reachesPeerA: active.contributesTo('client-A', peerChat.toString()),
					reachesDefaultA: active.contributesTo('client-A', defaultChat.toString()),
				};

				// The catalog grew: the host addresses the new peer chat for
				// client A too, incrementally alongside its existing membership.
				agent.getOrCreateActiveClient(peerChat, session, { clientId: 'client-A' });

				assert.deepStrictEqual({
					before,
					after: {
						chatsA: active.clientChats('client-A'),
						toolsOnPeer: active.toolsForChat(peerChat.toString()).map(tool => tool.name),
						reachesPeerA: active.contributesTo('client-A', peerChat.toString()),
						// The peer chat's live runtime advertised the pre-growth
						// set, so its next interaction must reconcile.
						peerNeedsRefresh: await active.requiresRestart(peerSnapshotBeforeGrowth, peerChat.toString()),
						defaultUnchanged: await active.requiresRestart(await active.snapshot(defaultChat.toString()), defaultChat.toString()),
					},
				}, {
					before: {
						chatsA: [defaultChat.toString()],
						toolsOnDefault: ['tool_a', 'tool_b'],
						toolsOnPeer: ['tool_b'],
						reachesPeerA: false,
						reachesDefaultA: true,
					},
					after: {
						chatsA: [defaultChat.toString(), peerChat.toString()],
						toolsOnPeer: ['tool_a', 'tool_b'],
						reachesPeerA: true,
						peerNeedsRefresh: true,
						defaultUnchanged: false,
					},
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('removeActiveClient drops membership for exactly the addressed chat, clearing tools/customizations only once no chats remain', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'membership-replacement');
				const defaultChat = defaultChatUri(session);
				const peerChat = URI.parse(buildChatUri(session, 'peer-1'));

				agent.getOrCreateActiveClient(defaultChat, session, { clientId: 'client-A' }).tools = [toolA];
				agent.getOrCreateActiveClient(peerChat, session, { clientId: 'client-A' });
				agent.getOrCreateActiveClient(defaultChat, session, { clientId: 'client-B' }).tools = [toolB];
				agent.getOrCreateActiveClient(peerChat, session, { clientId: 'client-B' });
				const active = membership(agent, session);

				// Removing one of client A's two chats narrows its membership —
				// it still reaches the default chat, so its tool contribution
				// there is untouched.
				agent.removeActiveClient(peerChat, session, 'client-A');
				const afterNarrowing = {
					chatsA: active.clientChats('client-A'),
					reachesPeer: active.contributesTo('client-A', peerChat.toString()),
					toolsOnPeer: active.toolsForChat(peerChat.toString()).map(tool => tool.name),
					toolsOnDefault: active.toolsForChat(defaultChat.toString()).map(tool => tool.name),
				};

				// Removing a chat the client is no longer (or never was)
				// registered for is a no-op — it must not disturb the client's
				// remaining membership.
				agent.removeActiveClient(peerChat, session, 'client-A');
				const afterNoOpRemoval = active.clientChats('client-A');

				// Removing client A's last remaining chat fully drops its tool
				// and customization contributions.
				agent.removeActiveClient(defaultChat, session, 'client-A');

				assert.deepStrictEqual({
					afterNarrowing,
					afterNoOpRemoval,
					afterRemoval: {
						chatsA: active.clientChats('client-A'),
						toolsOnDefault: active.toolsForChat(defaultChat.toString()).map(tool => tool.name),
					},
				}, {
					afterNarrowing: {
						chatsA: [defaultChat.toString()],
						reachesPeer: false,
						toolsOnPeer: ['tool_b'],
						toolsOnDefault: ['tool_a', 'tool_b'],
					},
					afterNoOpRemoval: [defaultChat.toString()],
					afterRemoval: {
						chatsA: [],
						toolsOnDefault: ['tool_b'],
					},
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('a chat the host has published no membership for yet keeps every client in scope', async () => {
			// A peer chat's SDK runtime is provisioned before the host's
			// follow-up fan-out reaches the provider. A client tool call issued
			// in that window must still resolve an owning client rather than
			// being dropped, so an unpublished chat is in scope for everyone.
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'membership-pre-fanout');
				const defaultChat = defaultChatUri(session);
				const justCreatedPeer = URI.parse(buildChatUri(session, 'peer-new'));

				agent.getOrCreateActiveClient(defaultChat, session, { clientId: 'client-A' }).tools = [toolA];
				const active = membership(agent, session);

				assert.deepStrictEqual({
					reachesUnpublished: active.contributesTo('client-A', justCreatedPeer.toString()),
					toolsOnUnpublished: active.toolsForChat(justCreatedPeer.toString()).map(tool => tool.name),
				}, {
					reachesUnpublished: true,
					toolsOnUnpublished: ['tool_a'],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('a live chat stamps a client tool call only with a client the host fanned that chat out to', async () => {
			// End-to-end over a real `CopilotAgentSession`: the turn's sender
			// provides the tool, but the host's membership no longer names this
			// chat for it, so the stamp falls through to the client that does
			// contribute here rather than dispatching to an unrelated client.
			const sessionDataService = disposables.add(new TestSessionDataService());
			const { agent, instantiationService } = createTestAgentContext(disposables, { environmentServiceRegistration: 'native', sessionDataService });
			const actions: (SessionAction | ChatAction)[] = [];
			disposables.add(agent.onDidChatProgress(signal => {
				if (signal.kind === 'action') {
					actions.push(signal.action);
				}
			}));
			// `createAgentSessionThroughAgent` builds the session for this URI
			// and leaves it addressed by its own channel, which is what the
			// membership below names.
			const session = AgentSession.uri('copilotcli', 'test-session-1');
			const otherChat = URI.parse(buildChatUri(session, 'peer-1'));
			const sharedTool: ToolDefinition = { name: 'shared', description: 'Shared tool', inputSchema: { type: 'object', properties: {} } };
			// Both clients provide the tool; the host fans A out to this chat
			// and B out to a different one only.
			agent.getOrCreateActiveClient(defaultChatUri(session), session, { clientId: 'client-A' }).tools = [sharedTool];
			agent.getOrCreateActiveClient(otherChat, session, { clientId: 'client-B' }).tools = [sharedTool];

			const mockSession = new MockCopilotSession();
			const createdSession = createAgentSessionThroughAgent(agent, instantiationService, {
				mockSession,
				snapshot: { tools: [sharedTool], plugins: [], mcpServers: {} },
			});
			const agentSession = disposables.add(createdSession.session);
			try {
				await agentSession.initializeSession();
				// The turn's sender is client-B, which does NOT reach this chat.
				agentSession.resetTurnState('turn-1', 'client-B');

				mockSession.emit({
					type: 'tool.execution_start',
					data: { toolCallId: 'tool-1', toolName: 'shared', arguments: {} },
				} as SessionEventPayload<'tool.execution_start'>);

				const toolStart = actions.find(action => action.type === ActionType.ChatToolCallStart);
				assert.deepStrictEqual(toolStart?.type === ActionType.ChatToolCallStart ? toolStart.contributor : undefined, {
					kind: ToolCallContributorKind.Client,
					clientId: 'client-A',
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
				agent.getOrCreateActiveClient(defaultChatUri(session), session, { clientId: 'client-A' }).tools = tools;
				const activeClient = getActiveClient(agent, session);
				const appliedSnapshot = await activeClient.snapshot();
				assert.strictEqual(activeClient.toolSet.ownerOf('my_tool'), 'client-A');

				// Window A reloads: window B reconnects with a new clientId but
				// the identical tool list. The reload removes A then adds B.
				agent.removeActiveClient(defaultChatUri(session), session, 'client-A');
				agent.getOrCreateActiveClient(defaultChatUri(session), session, { clientId: 'client-B' }).tools = [...tools];

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

				agent.getOrCreateActiveClient(defaultChatUri(session), session, { clientId: 'client-A' }).tools = tools;
				const activeClient = getActiveClient(agent, session);
				const appliedSnapshot = await activeClient.snapshot();

				// A genuinely different tool set (added tool) must restart so the
				// SDK session is rebuilt with the new tools.
				agent.getOrCreateActiveClient(defaultChatUri(session), session, { clientId: 'client-A' }).tools = [...tools, { name: 'second_tool', description: 'another', inputSchema: { type: 'object', properties: {} } }];

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
				agent.getOrCreateActiveClient(defaultChatUri(session), session, { clientId: 'client-A' }).tools = [
					{ name: 'shared', description: 'from A', inputSchema: { type: 'object', properties: {} } },
					{ name: 'a_tool', description: 'A only', inputSchema: { type: 'object', properties: {} } },
				];
				agent.getOrCreateActiveClient(defaultChatUri(session), session, { clientId: 'client-B' }).tools = [
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
				agent.removeActiveClient(defaultChatUri(session), session, 'client-A');
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
		interface IRefreshSessionStub {
			sessionId: string;
			appliedSnapshot: IActiveClientSnapshot;
			appliedAdditionalDirectories: readonly URI[];
			destroyCalls: number;
			disposeCalls: number;
			sendCalls: string[];
			destroySession(): Promise<void>;
			dispose(): void;
			send(prompt: string): Promise<void>;
		}

		function refreshSessionStub(additionalDirectories: readonly URI[]): IRefreshSessionStub {
			return {
				sessionId: 'config-refresh-session',
				appliedSnapshot: { tools: [], plugins: [], mcpServers: {} },
				appliedAdditionalDirectories: additionalDirectories,
				destroyCalls: 0,
				disposeCalls: 0,
				sendCalls: [],
				async destroySession() { this.destroyCalls++; },
				dispose() { this.disposeCalls++; },
				async send(prompt: string) { this.sendCalls.push(prompt); },
			};
		}

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
			agent.getOrCreateActiveClient(defaultChatUri(session), session, { clientId: 'client' }).tools = [
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

		test('coalesces root and structural divergence into one same-conversation resume before send', async () => {
			const client = new TestCopilotClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			configurationService.updateRootConfig({ [AgentHostCopilotMultiRootEnabledConfigKey]: true });
			const sessionId = 'config-refresh-session';
			const session = AgentSession.uri('copilotcli', sessionId);
			const primary = URI.file('/workspace/primary');
			const oldSecondary = URI.file('/workspace/old');
			const newSecondary = URI.file('/workspace/new');
			const previousSession = refreshSessionStub([oldSecondary]);
			const resumedSession = refreshSessionStub([newSecondary]);
			const resumeCalls: { sessionId: string; workingDirectories: readonly URI[] | undefined }[] = [];
			const internals = agent as unknown as {
				_resumeSession: (id: string, chatChannelUri?: URI, workingDirectories?: readonly URI[]) => Promise<CopilotAgentSession>;
			};

			setDefaultSessionStub(agent, sessionId, previousSession);
			agent.getOrCreateActiveClient(defaultChatUri(session), session, { clientId: 'client' }).tools = [
				{ name: 'new_tool', description: 'A newly registered tool', inputSchema: { type: 'object', properties: {} } },
			];
			internals._resumeSession = async (id, _chatChannelUri, workingDirectories) => {
				resumeCalls.push({ sessionId: id, workingDirectories });
				setDefaultSessionStub(agent, sessionId, resumedSession);
				return resumedSession as unknown as CopilotAgentSession;
			};

			try {
				await agent.chats.sendMessage(defaultChatUri(session), 'hello', [primary, newSecondary]);

				assert.deepStrictEqual({
					previousDestroyCalls: previousSession.destroyCalls,
					previousDisposeCalls: previousSession.disposeCalls,
					resumeCalls: resumeCalls.map(call => ({
						sessionId: call.sessionId,
						workingDirectories: call.workingDirectories?.map(directory => directory.toString()),
					})),
					resumedSends: resumedSession.sendCalls,
				}, {
					previousDestroyCalls: 1,
					previousDisposeCalls: 1,
					resumeCalls: [{ sessionId, workingDirectories: [primary.toString(), newSecondary.toString()] }],
					resumedSends: ['hello'],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('does not refresh equivalent reordered additional roots', async () => {
			const client = new TestCopilotClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			configurationService.updateRootConfig({ [AgentHostCopilotMultiRootEnabledConfigKey]: true });
			const sessionId = 'config-refresh-session';
			const session = AgentSession.uri('copilotcli', sessionId);
			const primary = URI.file('/workspace/primary');
			const secondaryA = URI.file('/workspace/secondary-a');
			const secondaryB = URI.file('/workspace/secondary-b');
			const currentSession = refreshSessionStub([secondaryB, secondaryA]);
			let resumeCalls = 0;
			const internals = agent as unknown as {
				_resumeSession: (id: string, chatChannelUri?: URI, workingDirectories?: readonly URI[]) => Promise<CopilotAgentSession>;
			};

			setDefaultSessionStub(agent, sessionId, currentSession);
			agent.getOrCreateActiveClient(defaultChatUri(session), session, { clientId: 'client' });
			internals._resumeSession = async () => {
				resumeCalls++;
				throw new Error('Identical roots must not resume');
			};

			try {
				await agent.chats.sendMessage(defaultChatUri(session), 'hello', [primary, secondaryA, secondaryB]);
				assert.deepStrictEqual({
					destroyCalls: currentSession.destroyCalls,
					resumeCalls,
					sends: currentSession.sendCalls,
				}, {
					destroyCalls: 0,
					resumeCalls: 0,
					sends: ['hello'],
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('leaves a failed root refresh retryable on the next send', async () => {
			const client = new TestCopilotClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			configurationService.updateRootConfig({ [AgentHostCopilotMultiRootEnabledConfigKey]: true });
			const sessionId = 'config-refresh-session';
			const session = AgentSession.uri('copilotcli', sessionId);
			const roots = [URI.file('/workspace/primary'), URI.file('/workspace/new')];
			const previousSession = refreshSessionStub([URI.file('/workspace/old')]);
			const resumedSession = refreshSessionStub(roots.slice(1));
			let resumeCalls = 0;
			let providerChatErrors = 0;
			const internals = agent as unknown as {
				_resumeSession: (id: string, chatChannelUri?: URI, workingDirectories?: readonly URI[]) => Promise<CopilotAgentSession>;
			};
			disposables.add(agent.onDidChatProgress(signal => {
				if (signal.kind === 'action' && signal.action.type === ActionType.ChatError) {
					providerChatErrors++;
				}
			}));
			internals._resumeSession = async () => {
				resumeCalls++;
				chatBackings(agent).set(defaultChatUri(session).toString(), { sdkSessionId: sessionId });
				if (resumeCalls === 1) {
					throw new Error('permission configure failed');
				}
				setDefaultSessionStub(agent, sessionId, resumedSession);
				return resumedSession as unknown as CopilotAgentSession;
			};
			setDefaultSessionStub(agent, sessionId, previousSession);
			agent.getOrCreateActiveClient(defaultChatUri(session), session, { clientId: 'client' });

			try {
				const chat = defaultChatUri(session);
				await assert.rejects(() => agent.chats.sendMessage(chat, 'first', roots, undefined, undefined, undefined, exactChatContext(session, chat)), /permission configure failed/);
				await agent.chats.sendMessage(chat, 'retry', roots, undefined, undefined, undefined, exactChatContext(session, chat));

				assert.deepStrictEqual({
					resumeCalls,
					previousDestroyCalls: previousSession.destroyCalls,
					resumedSends: resumedSession.sendCalls,
					providerChatErrors,
				}, {
					resumeCalls: 2,
					previousDestroyCalls: 1,
					resumedSends: ['retry'],
					providerChatErrors: 0,
				});
			} finally {
				await disposeAgent(agent);
			}
		});

		test('cold resume applies and persists the complete send snapshot including root removal', async () => {
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/resume-roots-`);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const sessionId = 'config-refresh-cold';
			const session = AgentSession.uri('copilotcli', sessionId);
			const primary = URI.file(workingDirectory);
			const persistedSecondary = URI.file('/workspace/persisted');
			const dbRef = sessionDataService.openDatabase(session);
			try {
				await dbRef.object.setMetadata('copilot.workingDirectory', primary.toString());
				await dbRef.object.setMetadata('copilot.workingDirectories', JSON.stringify([primary, persistedSecondary].map(directory => directory.toString())));
			} finally {
				dbRef.dispose();
			}

			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const mockSession = new MockCopilotSession();
			const resumeCalls: string[] = [];
			const resumeAdditionalDirectories: (string[] | undefined)[] = [];
			client.resumeSession = async (id, options) => {
				resumeCalls.push(id);
				resumeAdditionalDirectories.push(options?.additionalDirectories);
				return mockSession as unknown as CopilotSession;
			};
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService });
			configurationService.updateRootConfig({ [AgentHostCopilotMultiRootEnabledConfigKey]: true });
			try {
				await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'token');
				const chat = defaultChatUri(session);
				const recovered = await agent.recoverLegacyChat(chat, exactChatContext(session, chat, session));
				await agent.materializeChat(chat, exactChatContext(session, chat, session), recovered.providerData);
				await agent.chats.sendMessage(chat, 'hello', [primary], undefined, undefined, undefined, exactChatContext(session, chat, session));
				const persistedDbRef = sessionDataService.openDatabase(session);
				let persistedWorkingDirectories: string | undefined;
				try {
					persistedWorkingDirectories = await persistedDbRef.object.getMetadata('copilot.workingDirectories');
				} finally {
					persistedDbRef.dispose();
				}

				assert.deepStrictEqual({
					resumeCalls,
					resumeAdditionalDirectories,
					persistedWorkingDirectories: persistedWorkingDirectories ? JSON.parse(persistedWorkingDirectories) : undefined,
				}, {
					resumeCalls: [sessionId],
					resumeAdditionalDirectories: [[]],
					persistedWorkingDirectories: [primary.toString()],
				});
			} finally {
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});
	});

	suite('_resumeSession dedup', () => {
		// Regression: two concurrent paths (e.g. an outdated-config refresh in
		// `sendMessage` and a `getSessionMessages` subscribe) each calling
		// `_resumeSession(id)` used to construct two `CopilotAgentSession`
		// entries for the same id; the second `_chatEntriesBySdkId.set(id, …)` on the
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
				for (let i = 0; i < 50 && doResumeCalls === 0; i++) {
					await timeout(0);
				}
				assert.strictEqual(doResumeCalls, 1);

				const session = makeFakeSession();
				deferred.complete(session);
				assert.strictEqual(await p1, session);
				assert.strictEqual(await p2, session);
			} finally {
				deferred.complete(makeFakeSession());
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

		test('post-init shutdown race: disposes the session and throws CancellationError instead of registering on a disposed chat-entry map', async () => {
			// Without this guard an in-flight `_resumeSession` /
			// `_materializeProvisional` whose `initializeSession()`
			// resolves AFTER `dispose()` -> `shutdown()` -> `super.dispose()`
			// has run would call `_chatEntriesBySdkId.set(...)` on a disposed
			// DisposableMap, leaking the session and reproducing the
			// 'Trying to add a disposable to a DisposableStore that has
			// already been disposed' warning this PR exists to eliminate.
			const agent = createTestAgent(disposables);
			const internals = agent as unknown as {
				_registerInitializedSession: (id: string, s: CopilotAgentSession, activeClient: unknown, client: CopilotClient) => void;
				_shutdownPromise: Promise<void> | undefined;
			};
			let disposed = 0;
			const fakeSession = { dispose: () => { disposed++; } } as unknown as CopilotAgentSession;
			const client = new TestCopilotClient([]) as unknown as CopilotClient;
			internals._shutdownPromise = Promise.resolve();
			try {
				assert.throws(
					() => internals._registerInitializedSession('s1', fakeSession, undefined, client),
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

		test('post-init client replacement race disposes the stale session', async () => {
			const currentClient = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { copilotClient: currentClient });
			const internals = agent as unknown as {
				_throwIfClientReplaced: (client: CopilotClient, session: CopilotAgentSession) => void;
			};
			let disposed = 0;
			const staleSession = {
				sessionId: 'stale-session',
				dispose: () => { disposed++; },
			} as unknown as CopilotAgentSession;
			try {
				await agent.listChatsToMigrate();
				assert.doesNotThrow(() => internals._throwIfClientReplaced(currentClient as unknown as CopilotClient, staleSession));
				assert.throws(
					() => internals._throwIfClientReplaced(new TestCopilotClient([]) as unknown as CopilotClient, staleSession),
					(error: unknown) => isCancellationError(error),
				);
				assert.strictEqual(disposed, 1);
			} finally {
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

				const shutdown = agent.shutdown();
				deferredSession.complete(new MockCopilotSession() as unknown as CopilotSession);

				await shutdown;
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

		test('resume gates the persisted additional roots on the multi-root flag', async () => {
			const runResume = async (multiRootEnabled: boolean): Promise<string[] | undefined> => {
				const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/resume-multi-root-`);
				const secondary = await fs.mkdtemp(`${os.tmpdir()}/resume-multi-root-b-`);
				const sessionDataService = disposables.add(new TestSessionDataService());
				const session = AgentSession.uri('copilotcli', 's1');
				const dbRef = sessionDataService.openDatabase(session);
				try {
					await dbRef.object.setMetadata('copilot.workingDirectory', URI.file(workingDirectory).toString());
					await dbRef.object.setMetadata('copilot.workingDirectories', JSON.stringify([URI.file(workingDirectory).toString(), URI.file(secondary).toString()]));
				} finally {
					dbRef.dispose();
				}

				const client = new TestCopilotClient([sdkSession('s1', workingDirectory)]);
				let capturedAdditional: string[] | undefined;
				client.resumeSession = async (_sessionId, options) => {
					capturedAdditional = (options as unknown as { additionalDirectories?: string[] } | undefined)?.additionalDirectories;
					return new MockCopilotSession() as unknown as CopilotSession;
				};
				const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService });
				const internals = agent as unknown as AgentInternals;
				try {
					configurationService.updateRootConfig({ [AgentHostCopilotMultiRootEnabledConfigKey]: multiRootEnabled });
					await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'token');
					await internals._resumeSession('s1');
					return capturedAdditional;
				} finally {
					await fs.rm(workingDirectory, { recursive: true, force: true });
					await fs.rm(secondary, { recursive: true, force: true });
					await disposeAgent(agent);
				}
			};

			const enabled = await runResume(true);
			const disabled = await runResume(false);
			assert.deepStrictEqual({
				enabledHasSecondary: (enabled ?? []).length,
				disabled: disabled ?? [],
			}, {
				enabledHasSecondary: 1,
				disabled: [],
			});
		});
	});

	suite('customization anchoring', () => {

		test('uses signal paths only for Copilot OTLP/HTTP metrics endpoints', () => {
			assert.strictEqual(resolveCopilotOtlpMetricsEndpoint('http://collector:4318', 'http/protobuf'), 'http://collector:4318/v1/metrics');
			assert.strictEqual(resolveCopilotOtlpMetricsEndpoint('http://collector:4318/custom', 'http/json'), 'http://collector:4318/custom');
			assert.strictEqual(resolveCopilotOtlpMetricsEndpoint('https://collector:4317', 'grpc'), 'https://collector:4317');
		});

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
				const result = await provisionSession(agent, { session: AgentSession.uri('copilotcli', 'anchor-session'), workingDirectories: [originalFolder] });
				assert.strictEqual(result.provisional, true);
				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', resolvedWorkingDirectory, undefined, undefined, undefined, exactChatContext(result.session, defaultChatUri(result.session), result.session));
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
				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'wt-dirs-session'),
					workingDirectories: [originalFolder],
					activeClient: { clientId: 'c1', tools: [] },
				});
				assert.strictEqual(result.provisional, true);
				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', worktree, undefined, undefined, undefined, exactChatContext(result.session, defaultChatUri(result.session), result.session));
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
				const result = await provisionSession(agent, {
					session: AgentSession.uri('copilotcli', 'agent-translate'),
					workingDirectories: [repoFolder],
					agent: { uri: repoAgentFile.toString() },
				});
				assert.strictEqual(result.provisional, true);
				await agent.chats.sendMessage(defaultChatUri(result.session), 'hello', worktreeFolder, undefined, undefined, undefined, exactChatContext(result.session, defaultChatUri(result.session), result.session));

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

	suite('ensureChatAdopted (legacy Copilot CLI migration)', () => {

		async function writeExtensionHostMarker(userHome: URI, sessionId: string, metadata: Record<string, unknown> = { origin: 'vscode' }): Promise<void> {
			const dir = join(getCopilotHomePath(userHome.fsPath, process.env), 'session-state', sessionId);
			await fs.mkdir(dir, { recursive: true });
			await fs.writeFile(join(dir, 'vscode.metadata.json'), JSON.stringify(metadata), 'utf8');
		}

		async function writeExtensionHostRequestDetails(userHome: URI, sessionId: string, details: readonly Record<string, unknown>[]): Promise<void> {
			const dir = join(getCopilotHomePath(userHome.fsPath, process.env), 'session-state', sessionId);
			await fs.mkdir(dir, { recursive: true });
			await fs.writeFile(join(dir, 'vscode.requests.metadata.json'), JSON.stringify(details), 'utf8');
		}

		test('keeps a deleted worktree as the working directory so resume can recreate it', async () => {
			// Parity with native worktree sessions: the checkout is recreated from the
			// recorded branch rather than the session being re-rooted at the repository.
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const repositoryRoot = await fs.mkdtemp(`${os.tmpdir()}/adopt-repo-`);
			const worktreePath = join(repositoryRoot, '..', 'gone.worktrees', 'feature-x');
			const sessionId = 'legacy-worktree-gone';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			// The SDK still reports the deleted checkout, exactly as it does on disk.
			const client = new TestCopilotClient([sdkSession(sessionId, worktreePath)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId, {
					origin: 'vscode',
					worktreeProperties: { worktreePath, repositoryPath: repositoryRoot, branchName: 'feature/x', baseBranchName: 'main' },
				});

				const adopted = await ensureDefaultChatAdopted(agent, session);

				const db = await sessionDataService.tryOpenDatabase(session);
				const persistedCwd = await db?.object.getMetadata('copilot.workingDirectory');
				db?.dispose();

				assert.deepStrictEqual(
					{
						adopted: adopted.adopted,
						worktree: adopted.worktree && {
							branchName: adopted.worktree.branchName,
							baseBranch: adopted.worktree.baseBranch,
							worktreePath: adopted.worktree.worktreePath.fsPath,
							repositoryRoot: adopted.worktree.repositoryRoot.fsPath,
						},
						persistedCwd,
					},
					{
						adopted: true,
						worktree: { branchName: 'feature/x', baseBranch: 'main', worktreePath: URI.file(worktreePath).fsPath, repositoryRoot: URI.file(repositoryRoot).fsPath },
						persistedCwd: URI.file(worktreePath).toString(),
					},
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(repositoryRoot, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('adopts a deleted worktree with the local repository as its project, not the remote', async () => {
			// Git resolution runs in the (missing) checkout and falls back to the
			// remote, whose URI is not a path — the session could then never be
			// matched to the repository folder a window has open.
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const repositoryRoot = await fs.mkdtemp(`${os.tmpdir()}/adopt-repo-`);
			const worktreePath = join(repositoryRoot, '..', 'gone.worktrees', 'feature-y');
			const sessionId = 'legacy-worktree-remote-project';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, worktreePath)]);
			// No git root resolves for a checkout that is gone, so the project would
			// otherwise come from `context.repository`.
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId, {
					origin: 'vscode',
					worktreeProperties: { worktreePath, repositoryPath: repositoryRoot, branchName: 'feature/y', baseBranchName: 'main' },
				});

				await ensureDefaultChatAdopted(agent, session);

				const db = await sessionDataService.tryOpenDatabase(session);
				const projectUri = await db?.object.getMetadata('copilot.project.uri');
				db?.dispose();

				assert.strictEqual(projectUri, URI.file(repositoryRoot).toString());
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(repositoryRoot, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('backfills the adopted-legacy marker for a session migrated by an older build', async () => {
			// Those sessions already have a working directory, so adoption short-circuits
			// as `alreadyNative` and never reaches the write. Without the backfill a
			// migrated worktree session stays filtered out of its repository window.
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adopt-old-`);
			const sessionId = 'legacy-already-adopted';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId);
				// Metadata an older build wrote: adopted, but without the provenance marker.
				const seed = sessionDataService.openDatabase(session);
				await seed.object.setMetadata('copilot.workingDirectory', URI.file(workingDirectory).toString());
				seed.dispose();

				const adopted = await ensureDefaultChatAdopted(agent, session);

				const db = await sessionDataService.tryOpenDatabase(session);
				const marker = await db?.object.getMetadata('agentHost.ehcliAdopted');
				db?.dispose();

				assert.deepStrictEqual(
					{ reason: adopted.reason, marker },
					{ reason: 'alreadyNative', marker: 'true' },
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not backfill the adopted-legacy marker onto a native session', async () => {
			// No extension-host marker means the session was never a legacy chat.
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adopt-native-`);
			const sessionId = 'native-session';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				const seed = sessionDataService.openDatabase(session);
				await seed.object.setMetadata('copilot.workingDirectory', URI.file(workingDirectory).toString());
				seed.dispose();

				await ensureDefaultChatAdopted(agent, session);

				const db = await sessionDataService.tryOpenDatabase(session);
				const marker = await db?.object.getMetadata('agentHost.ehcliAdopted');
				db?.dispose();

				assert.strictEqual(marker, undefined);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('sees an archive toggled in the extension host after the marker was cached', async () => {
			// The marker cache memoizes successful reads for the agent's lifetime, but
			// `archived` is user-toggled while both hosts run, so it must be re-read.
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adopt-archive-`);
			const sessionId = 'legacy-archived-later';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId, { origin: 'vscode', archived: false });
				// Populate the marker cache, as discovery does when it classifies the chat.
				await (agent as unknown as { _isExtensionHostCliSession(id: string): Promise<boolean> })._isExtensionHostCliSession(sessionId);
				// The user archives it in the extension host list afterwards.
				await writeExtensionHostMarker(userHome, sessionId, { origin: 'vscode', archived: true });

				await ensureDefaultChatAdopted(agent, session);

				const db = await sessionDataService.tryOpenDatabase(session);
				const archived = await db?.object.getMetadata('isArchived');
				db?.dispose();

				assert.strictEqual(archived, 'true');
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('declines adoption when the archived state can no longer be read', async () => {
			// Adoption commits the archived state and makes the extension host stop
			// listing the chat, so guessing "not archived" would resurface a session the
			// user had filed away. Leave it for the next open instead.
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adopt-marker-gone-`);
			const sessionId = 'legacy-marker-unreadable';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId);
				// Classify it as legacy while the marker is readable, then corrupt it.
				await (agent as unknown as { _isExtensionHostCliSession(id: string): Promise<boolean> })._isExtensionHostCliSession(sessionId);
				await fs.writeFile(join(getCopilotHomePath(userHome.fsPath, process.env), 'session-state', sessionId, 'vscode.metadata.json'), '{ not json', 'utf8');

				const adopted = await ensureDefaultChatAdopted(agent, session);

				const db = await sessionDataService.tryOpenDatabase(session);
				const persistedCwd = await db?.object.getMetadata('copilot.workingDirectory');
				db?.dispose();

				assert.deepStrictEqual(
					{ adopted, persistedCwd },
					{ adopted: { adopted: false, eligible: true, reason: 'markerUnavailable' }, persistedCwd: undefined },
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('reports no recorded worktree when the checkout still exists', async () => {
			// A live worktree is handled by the existing probe-the-directory bridge.
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adopt-live-`);
			const sessionId = 'legacy-worktree-live';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId, {
					origin: 'vscode',
					worktreeProperties: { worktreePath: workingDirectory, repositoryPath: workingDirectory, branchName: 'feature/y' },
				});

				const adopted = await ensureDefaultChatAdopted(agent, session);

				assert.deepStrictEqual({ adopted: adopted.adopted, worktree: adopted.worktree }, { adopted: true, worktree: undefined });
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('adopts a legacy extension-host session in place and seeds folder isolation', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adopt-cwd-`);
			const sessionId = 'legacy-adopt';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId);

				const first = await ensureDefaultChatAdopted(agent, session);
				// A second call is a no-op: the first adopt persisted a working
				// directory, which now reads as an already-native session.
				const second = await ensureDefaultChatAdopted(agent, session);

				const db = await sessionDataService.tryOpenDatabase(session);
				const configValues = await db?.object.getMetadata('configValues');
				db?.dispose();

				assert.deepStrictEqual(
					{ first, second, configValues },
					{ first: { adopted: true, eligible: true, reason: 'adopted' }, second: { adopted: false, eligible: false, native: true, reason: 'alreadyNative' }, configValues: JSON.stringify({ [SessionConfigKey.Isolation]: 'folder' }) },
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not adopt a session whose recorded working directory no longer exists', async () => {
			// A months-old session may have run in a worktree that has since been
			// deleted. Adopting it commits the claim (the extension host list stops
			// showing it) and then fails to resume, leaving it in neither list.
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const deletedWorkingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adopt-gone-`);
			await fs.rm(deletedWorkingDirectory, { recursive: true, force: true });
			const sessionId = 'legacy-missing-cwd';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, deletedWorkingDirectory)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId);

				const adopted = await ensureDefaultChatAdopted(agent, session);

				const db = await sessionDataService.tryOpenDatabase(session);
				const persistedCwd = await db?.object.getMetadata('copilot.workingDirectory');
				db?.dispose();

				assert.deepStrictEqual(
					{ adopted, persistedCwd },
					{ adopted: { adopted: false, eligible: true, reason: 'workingDirectoryMissing' }, persistedCwd: undefined },
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('carries over the legacy archived state on adoption', async () => {
			// Archiving is user-curated: adopting must not resurface a session the
			// user filed away in the extension host list.
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adopt-cwd-`);
			const sessionId = 'legacy-archived';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId, { origin: 'vscode', archived: true });

				const adopted = await ensureDefaultChatAdopted(agent, session);

				const db = await sessionDataService.tryOpenDatabase(session);
				const archived = await db?.object.getMetadata(AH_META_IS_ARCHIVED_DB_KEY);
				db?.dispose();

				assert.deepStrictEqual(
					{ adopted, archived },
					{ adopted: { adopted: true, eligible: true, reason: 'adopted' }, archived: 'true' },
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('carries over the legacy per-request credits on adoption', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adopt-cwd-`);
			const sessionId = 'legacy-credits';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId);
				await writeExtensionHostRequestDetails(userHome, sessionId, [
					{ vscodeRequestId: 'vsc-1', copilotRequestId: 'evt-1', responseModelId: 'gpt-5.4', creditsUsed: 1.5 },
					// Zero credits is real consumption and keeps its response model.
					{ vscodeRequestId: 'vsc-2', copilotRequestId: 'evt-2', responseModelId: 'gpt-5.4-mini', creditsUsed: 0 },
					// No credits recorded and no SDK id: both are skipped.
					{ vscodeRequestId: 'vsc-3', copilotRequestId: 'evt-3' },
					{ vscodeRequestId: 'vsc-4', creditsUsed: 4 },
				]);

				const adopted = await ensureDefaultChatAdopted(agent, session);

				const db = await sessionDataService.tryOpenDatabase(session);
				const usages = [...(await db?.object.getTurnUsages() ?? new Map()).entries()];
				db?.dispose();

				assert.deepStrictEqual(
					{ adopted, usages },
					{
						adopted: { adopted: true, eligible: true, reason: 'adopted' },
						usages: [
							['evt-1', JSON.stringify({ model: 'gpt-5.4', _meta: { copilotUsage: { totalNanoAiu: 1_500_000_000 } } })],
							['evt-2', JSON.stringify({ model: 'gpt-5.4-mini', _meta: { copilotUsage: { totalNanoAiu: 0 } } })],
						],
					},
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('carries over the legacy custom title on adoption', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adopt-cwd-`);
			const sessionId = 'legacy-titled';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId, { origin: 'vscode', customTitle: 'My Legacy Session' });

				const adopted = await ensureDefaultChatAdopted(agent, session);

				const db = await sessionDataService.tryOpenDatabase(session);
				const customTitle = await db?.object.getMetadata('customTitle');
				db?.dispose();

				assert.deepStrictEqual(
					{ adopted, customTitle },
					{ adopted: { adopted: true, eligible: true, reason: 'adopted' }, customTitle: 'My Legacy Session' },
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('marks the adopted session read so it is not surfaced as unread on open', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adopt-cwd-`);
			const sessionId = 'legacy-read';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId);

				const adopted = await ensureDefaultChatAdopted(agent, session);

				const db = await sessionDataService.tryOpenDatabase(session);
				const isRead = await db?.object.getMetadata(AH_META_IS_READ_DB_KEY);
				db?.dispose();

				assert.deepStrictEqual(
					{ adopted, isRead },
					{ adopted: { adopted: true, eligible: true, reason: 'adopted' }, isRead: 'true' },
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not adopt a Copilot SDK session without the extension-host marker', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const sessionId = 'not-extension-host';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, '/workspace')]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				// No `vscode.metadata.json` marker -> not an adoptable EH CLI session.
				const adopted = await ensureDefaultChatAdopted(agent, session);

				assert.deepStrictEqual(
					{ adopted, getSessionMetadataCalls: client.getSessionMetadataCalls, openedDatabases: sessionDataService.openedSessions },
					{ adopted: { adopted: false, eligible: false, reason: 'notLegacyChat' }, getSessionMetadataCalls: [], openedDatabases: [] },
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not adopt a session whose marker originates from another Copilot host', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const sessionId = 'github-copilot-app';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, '/workspace')]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				// The GitHub Copilot app writes the same marker with `origin: 'other'`.
				await writeExtensionHostMarker(userHome, sessionId, { origin: 'other' });
				// Credits are migrated for legacy VS Code sessions only: a sidecar
				// belonging to another Copilot host must never be read or applied.
				await writeExtensionHostRequestDetails(userHome, sessionId, [
					{ vscodeRequestId: 'vsc-1', copilotRequestId: 'evt-1', creditsUsed: 9 },
				]);

				const adopted = await ensureDefaultChatAdopted(agent, session);

				assert.deepStrictEqual(
					{ adopted, getSessionMetadataCalls: client.getSessionMetadataCalls, openedDatabases: sessionDataService.openedSessions },
					{ adopted: { adopted: false, eligible: false, reason: 'notLegacyChat' }, getSessionMetadataCalls: [], openedDatabases: [] },
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('adopts an origin-less legacy marker carrying VS Code repository properties', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/adopt-cwd-`);
			const sessionId = 'legacy-originless';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, workingDirectory)]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				// Older VS Code markers predate the `origin` field but carry VS
				// Code-specific properties; the EH `getSessionOrigin` heuristic
				// treats these as `vscode`.
				await writeExtensionHostMarker(userHome, sessionId, { repositoryProperties: { repositoryPath: workingDirectory } });

				const adopted = await ensureDefaultChatAdopted(agent, session);

				assert.deepStrictEqual(adopted, { adopted: true, eligible: true, reason: 'adopted' });
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await fs.rm(workingDirectory, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not adopt an origin-less legacy marker without VS Code properties', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const sessionId = 'legacy-originless-bare';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([sdkSession(sessionId, '/workspace')]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				// A bare marker with neither `origin` nor VS Code-specific
				// properties is ambiguous; mirror the EH heuristic and treat it as
				// non-VS Code.
				await writeExtensionHostMarker(userHome, sessionId, { modified: 123, created: 123 });

				const adopted = await ensureDefaultChatAdopted(agent, session);

				assert.deepStrictEqual(
					{ adopted, getSessionMetadataCalls: client.getSessionMetadataCalls, openedDatabases: sessionDataService.openedSessions },
					{ adopted: { adopted: false, eligible: false, reason: 'notLegacyChat' }, getSessionMetadataCalls: [], openedDatabases: [] },
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

		test('does not re-adopt a session that already has stored working-directory metadata', async () => {
			const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/adopt-home-`));
			const sessionId = 'already-adopted';
			const session = AgentSession.uri('copilotcli', sessionId);
			const sessionDataService = disposables.add(new TestSessionDataService());
			// Seed as if already native / adopted: a persisted working directory.
			const seed = sessionDataService.openDatabase(session);
			await seed.object.setMetadata('copilot.workingDirectory', URI.file('/workspace').toString());
			seed.dispose();
			const client = new TestCopilotClient([sdkSession(sessionId, '/workspace')]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, userHome });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await writeExtensionHostMarker(userHome, sessionId); // even with a marker present
				// An already-migrated session's usage must never be rewritten from
				// the legacy sidecar: live agent-host usage is authoritative.
				await writeExtensionHostRequestDetails(userHome, sessionId, [
					{ vscodeRequestId: 'vsc-1', copilotRequestId: 'evt-1', creditsUsed: 9 },
				]);

				const adopted = await ensureDefaultChatAdopted(agent, session);

				const db = await sessionDataService.tryOpenDatabase(session);
				const usages = [...(await db?.object.getTurnUsages() ?? new Map()).entries()];
				db?.dispose();

				assert.deepStrictEqual(
					{ adopted, getSessionMetadataCalls: client.getSessionMetadataCalls, usages },
					{ adopted: { adopted: false, eligible: false, native: true, reason: 'alreadyNative' }, getSessionMetadataCalls: [], usages: [] },
				);
			} finally {
				await fs.rm(userHome.fsPath, { recursive: true, force: true });
				await disposeAgent(agent);
			}
		});

	});
});
