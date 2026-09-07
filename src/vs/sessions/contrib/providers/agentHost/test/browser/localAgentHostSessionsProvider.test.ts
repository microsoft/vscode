/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { DeferredPromise, raceTimeout, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableMap, DisposableStore, ImmortalReference, toDisposable, type IReference } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, ISettableObservable, observableFromEvent, observableValue, type IObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSession, type IAgentCreateChatRequestOptions, type IAgentCreateSessionConfig, type IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agent.js';
import { AgentHostCodexAgentEnabledSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY } from '../../../../../../platform/agentHost/common/automationMigration.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import type { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ChatInteractivity as ProtocolChatInteractivity, ChatOriginKind as ProtocolChatOriginKind, CustomizationEnablementKind, CustomizationLoadStatus, CustomizationType, McpServerStatus, MessageKind, SessionLifecycle, type AgentCustomization, type AgentInfo, type AutomationState, type ChangesSummary, type Customization, type RootState, type SessionActiveClient, type SessionConfigState, type SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri, ChangesetStatus, isAhpAutomationCatalogChannel, ResponsePartKind, SessionSourceControlOutcome, SessionStatus as ProtocolSessionStatus, StateComponents, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, withSessionCreationReference, withSessionEhcliAdoptable, withSessionGitHubState, withSessionGitState, withSessionMultiRootMetadata, withSessionSourceControlState, withSessionWorkspaceless, type ChangesetState, type ChatState, type ChatSummary } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { SessionArtifactType, withSessionArtifacts } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { ActionType, NotificationType, type ActionEnvelope, type IRootConfigChangedAction, type ChatAction, type SessionAction, type TerminalAction, type INotification, type ClientAnnotationsAction, type SessionSummaryChangedParams } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService, IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, ResourceTrustRequestOptions } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatWidget, IChatWidgetService } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService, type ChatSendResult, type IChatModelReference, type IChatSendRequestOptions } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService, isIChatSessionFileChange2 } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { ChatModeKind } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelsService, type ILanguageModelChatMetadata } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import type { IChatModel, IChatModelInputState, IInputModel } from '../../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ISessionChangeEvent, ISessionsProvider, type ISessionsProviderCreateSessionOptions } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ChatInteractivity, ChatModelSource, ChatOriginKind, getChatCapabilities, ISession, SessionStatus, TURN_CHANGES_CHANGESET_ID } from '../../../../../services/sessions/common/session.js';
import { IActiveSession, WorkspaceNotTrustedError } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IDevContainerAgentHostService } from '../../../../../common/devContainerAgentHostService.js';
import { IAgentCustomizationScope, IAgentHostActiveClientService } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { LocalAgentHostSessionsProvider } from '../../browser/localAgentHostSessionsProvider.js';
import { AgentHostSessionAdapter, type IAgentHostAdapterOptions } from '../../browser/baseAgentHostSessionsProvider.js';
import { IAutomationStorageService } from '../../../../automations/common/automationStorageService.js';
import { TestAutomationStorageService } from '../../../../automations/test/browser/automationTestUtils.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IGitHubService } from '../../../../github/browser/githubService.js';
import { GitHubPullRequestModel } from '../../../../github/browser/models/githubPullRequestModel.js';
import { IPullRequestIconCache, PullRequestIconCache } from '../../../../github/browser/pullRequestIconCache.js';
import { computePullRequestIcon, GitHubPullRequestState, type IGitHubPullRequest } from '../../../../github/common/types.js';
import { IWorkbenchEnvironmentService } from '../../../../../../workbench/services/environment/common/environmentService.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { IPathService } from '../../../../../../workbench/services/path/common/pathService.js';
import { MockLabelService } from '../../../../../../workbench/services/label/test/common/mockLabelService.js';
import { TestPathService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';

// ---- Mock IAgentHostService -------------------------------------------------

const STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES = 'sessions.agentHost.sessionConfigPicker.selectedValues';

type SubscriptionState = SessionState | ChangesetState | ChatState | AutomationState;

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	private _onDidAction = new Emitter<ActionEnvelope>();
	override get onDidAction(): Event<ActionEnvelope> { return this._onDidAction.event; }
	private _onDidNotification = new Emitter<INotification>();
	override get onDidNotification(): Event<INotification> { return this._onDidNotification.event; }
	private _rootStateListenerCount = 0;
	private _onDidRootStateChange = new Emitter<RootState>({
		onDidAddListener: () => this._rootStateListenerCount++,
		onWillRemoveListener: () => this._rootStateListenerCount--,
	});
	private readonly _onDidRootStateError = new Emitter<Error>();
	private _rootStateValue: RootState | Error | undefined = { agents: [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { multipleChats: { fork: true } } } as AgentInfo] };
	private _rootStateSubscription: IAgentSubscription<RootState>;
	override get rootState(): IAgentSubscription<RootState> { return this._rootStateSubscription; }
	private readonly _onAgentHostStart = new Emitter<void>();
	override readonly onAgentHostStart = this._onAgentHostStart.event;
	private readonly _onAgentHostExit = new Emitter<number>();
	override readonly onAgentHostExit = this._onAgentHostExit.event;
	override readonly initializeResult = observableValue<InitializeResult>(this, {
		protocolVersion: '1',
		serverSeq: 0,
		snapshots: [],
		_meta: { 'vscode.detachedWorktrees': true as const },
	});

	override readonly clientId = 'test-local-client';
	private readonly _sessions = new Map<string, IAgentSessionMetadata>();
	public automationCatalog: AutomationState = { entries: [] };
	public disposedSessions: URI[] = [];
	public onDisposeSession: ((session: URI) => void) | undefined;
	public failDisposeSessionFor: string | undefined;
	public dispatchedActions: { channel: string; action: SessionAction | ChatAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction; clientId: string; clientSeq: number }[] = [];
	public failResolveSessionConfig = false;
	public resolveSessionConfigResult: ResolveSessionConfigResult = { schema: { type: 'object', properties: {} }, values: { isolation: 'worktree' } };
	public resolveSessionConfigRequests: { config?: Record<string, unknown> }[] = [];
	public resolveSessionConfigBarrier: DeferredPromise<void> | undefined;
	public preparedSessionWorktree = URI.file('/home/user/project.worktrees/prepared');
	public createDetachedWorktreeCalls: { session: URI; prompt: string }[] = [];
	public claimedDetachedWorktrees: string[] = [];
	public deletedDetachedWorktrees: string[] = [];
	get rootStateListenerCount(): number { return this._rootStateListenerCount; }

	private readonly _authenticationPending: ISettableObservable<boolean> = observableValue('authenticationPending', false);
	override readonly authenticationPending: IObservable<boolean> = this._authenticationPending;
	override setAuthenticationPending(pending: boolean): void {
		this._authenticationPending.set(pending, undefined);
	}

	private _nextSeq = 0;

	constructor() {
		super();
		const self = this;
		this._rootStateSubscription = {
			get value() { return self._rootStateValue; },
			get verifiedValue() { return self._rootStateValue instanceof Error ? undefined : self._rootStateValue; },
			onDidChange: self._onDidRootStateChange.event,
			onDidError: self._onDidRootStateError.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	}

	nextClientSeq(): number {
		return this._nextSeq++;
	}

	/**
	 * Number of upcoming `listSessions()` calls that should reject, used to
	 * simulate the agent throwing `AHP_AUTH_REQUIRED` (or a transient offline
	 * error) before its token is effective server-side. Decremented per call.
	 */
	public failListSessionsCount = 0;
	public listSessionsCallCount = 0;
	public listSessionsBarrier: DeferredPromise<void> | undefined;
	override async listSessions(): Promise<IAgentSessionMetadata[]> {
		this.listSessionsCallCount++;
		await this.listSessionsBarrier?.p;
		if (this.failListSessionsCount > 0) {
			this.failListSessionsCount--;
			throw new Error('AHP_AUTH_REQUIRED');
		}
		return [...this._sessions.values()];
	}

	override async disposeSession(session: URI): Promise<void> {
		this.disposedSessions.push(session);
		const rawId = AgentSession.id(session);
		if (rawId === this.failDisposeSessionFor) {
			throw new Error(`Failed to dispose ${rawId}`);
		}
		this._sessions.delete(rawId);
		this.onDisposeSession?.(session);
	}

	public disposedChats: URI[] = [];
	override async disposeChat(chat: URI): Promise<void> {
		this.disposedChats.push(chat);
	}

	public createdChats: { session: URI; chat: URI; options?: IAgentCreateChatRequestOptions }[] = [];
	public onCreateChat: ((session: URI, chat: URI) => void) | undefined;
	override async createChat(session: URI, chat: URI, options?: IAgentCreateChatRequestOptions): Promise<void> {
		this.createdChats.push({ session, chat, options });
		const key = session.toString();
		const existing = this._sessionStateValues.get(key) as SessionState | undefined;
		if (existing && Array.isArray(existing.chats)) {
			const newChat: ChatSummary = {
				resource: chat.toString(),
				title: options?.title ?? '',
				status: ProtocolSessionStatus.Idle,
				modifiedAt: new Date(0).toISOString(),
			};
			this.setSessionState(AgentSession.id(session), AgentSession.provider(session)!, {
				...existing,
				chats: [...existing.chats, newChat],
			});
		}
		this.onCreateChat?.(session, chat);
	}

	public createdSessionUris: URI[] = [];
	public createSessionConfigs: { model?: IAgentCreateSessionConfig['model']; config?: Record<string, unknown>; metadata?: Record<string, unknown>; workingDirectory?: URI }[] = [];
	/**
	 * Per-call hook used by tests to interleave operations across the
	 * `createSession` await — e.g. to verify that no subscription is opened
	 * before the create completes, or to simulate a workspace switch landing
	 * mid-call. Cleared after the next createSession call invokes it.
	 */
	public onCreateSession: ((uri: URI) => void | Promise<void>) | undefined;
	/**
	 * Ordered log of wire-level operations: useful for asserting that
	 * `createSession` strictly precedes `subscribe` for a given session URI.
	 * Each entry is `${op}:${uri}`.
	 */
	public wireOps: string[] = [];
	override async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const uri = config?.session ?? URI.parse('copilotcli:///auto-' + this._nextSeq);
		this.createSessionConfigs.push({
			...(config?.model ? { model: config.model } : {}),
			config: config?.config,
			...(config?._meta ? { metadata: config._meta } : {}),
			workingDirectory: config?.workingDirectories?.[0],
		});
		this.wireOps.push(`createSession:${uri.toString()}`);
		this.createdSessionUris.push(uri);
		const hook = this.onCreateSession;
		this.onCreateSession = undefined;
		if (hook) {
			await hook(uri);
		}
		return uri;
	}

	override async createDetachedWorktree(session: URI, prompt: string): Promise<{ handle: string; worktree: URI }> {
		this.createDetachedWorktreeCalls.push({ session, prompt });
		return { handle: '00000000-0000-4000-8000-000000000001', worktree: this.preparedSessionWorktree };
	}
	override async deleteDetachedWorktree(handle: string): Promise<void> { this.deletedDetachedWorktrees.push(handle); }
	override async claimDetachedWorktree(handle: string): Promise<void> { this.claimedDetachedWorktrees.push(handle); }

	override async resolveSessionConfig(request: { config?: Record<string, unknown> }): Promise<ResolveSessionConfigResult> {
		this.resolveSessionConfigRequests.push(request);
		await this.resolveSessionConfigBarrier?.p;
		await Promise.resolve();
		if (this.failResolveSessionConfig) {
			throw new Error('resolveSessionConfig unavailable');
		}
		return this.resolveSessionConfigResult;
	}

	dispatchAction(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		this.dispatchedActions.push({ channel, action, clientId, clientSeq });
	}

	override dispatch(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction): void {
		this.dispatchedActions.push({ channel, action, clientId: this.clientId, clientSeq: this._nextSeq++ });
	}

	// Test helpers
	addSession(meta: IAgentSessionMetadata): void {
		this._sessions.set(AgentSession.id(meta.session), meta);
	}

	/**
	 * Drop a session from what `listSessions()` reports, without going through
	 * `disposeSession`. Simulates an agent that cannot enumerate its sessions
	 * yet (auth token or SDK still loading) and so contributes nothing to the
	 * host's aggregated listing.
	 */
	stopListingSessions(...ids: string[]): void {
		for (const id of ids) {
			this._sessions.delete(id);
		}
	}

	// ---- Session-state subscriptions ---------------------------------------

	private readonly _sessionStateEmitters = new Map<string, Emitter<SubscriptionState>>();
	private readonly _sessionStateValues = new Map<string, SubscriptionState>();
	public sessionSubscribeCounts = new Map<string, number>();
	public sessionUnsubscribeCounts = new Map<string, number>();

	override getSubscription<T>(_kind: StateComponents, resource: URI): IReference<IAgentSubscription<T>> {
		const key = resource.toString();
		if (isAhpAutomationCatalogChannel(key) && !this._sessionStateValues.has(key)) {
			this._sessionStateValues.set(key, this.automationCatalog);
		}
		return this._getSubscription<T>(key);
	}

	private _getSubscription<T>(key: string): IReference<IAgentSubscription<T>> {
		this.wireOps.push(`subscribe:${key}`);
		this.sessionSubscribeCounts.set(key, (this.sessionSubscribeCounts.get(key) ?? 0) + 1);
		let emitter = this._sessionStateEmitters.get(key);
		if (!emitter) {
			emitter = new Emitter<SubscriptionState>();
			this._sessionStateEmitters.set(key, emitter);
		}
		const self = this;
		const sub: IAgentSubscription<T> = {
			get value() { return self._sessionStateValues.get(key) as unknown as T | undefined; },
			get verifiedValue() { return self._sessionStateValues.get(key) as unknown as T | undefined; },
			onDidChange: emitter.event as unknown as Event<T>,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		return {
			object: sub,
			dispose: () => {
				this.sessionUnsubscribeCounts.set(key, (this.sessionUnsubscribeCounts.get(key) ?? 0) + 1);
			},
		};
	}

	setSessionState(rawId: string, provider: string, state: SessionState): void {
		const key = AgentSession.uri(provider, rawId).toString();
		this._sessionStateValues.set(key, state);
		this._sessionStateEmitters.get(key)?.fire(state);
	}

	setSessionStateResource(resource: URI, state: SessionState): void {
		const key = resource.toString();
		this._sessionStateValues.set(key, state);
		this._sessionStateEmitters.get(key)?.fire(state);
	}

	setChangesetState(changesetUri: string, state: ChangesetState): void {
		this._sessionStateValues.set(changesetUri, state);
		this._sessionStateEmitters.get(changesetUri)?.fire(state);
	}

	setChatState(chatUri: string, state: ChatState): void {
		this._sessionStateValues.set(chatUri, state);
		this._sessionStateEmitters.get(chatUri)?.fire(state);
	}

	setAgents(agents: AgentInfo[]): void {
		this._rootStateValue = { agents };
		this._onDidRootStateChange.fire(this._rootStateValue);
	}

	/**
	 * Fires a root state change that preserves the current `agents` reference,
	 * simulating non-agent root deltas (e.g. `RootActiveSessionsChanged` on
	 * every turn start/complete) that the real reducer emits without
	 * replacing the `agents` slice.
	 */
	fireNonAgentRootStateChange(): void {
		if (!this._rootStateValue || this._rootStateValue instanceof Error) {
			throw new Error('rootState not initialized; call setAgents first');
		}
		this._rootStateValue = { ...this._rootStateValue };
		this._onDidRootStateChange.fire(this._rootStateValue);
	}

	clearRootState(): void {
		this._rootStateValue = undefined;
	}

	replaceRootStateOnStart(agents: AgentInfo[]): void {
		const self = this;
		const previousEmitter = this._onDidRootStateChange;
		const previousActionEmitter = this._onDidAction;
		const previousNotificationEmitter = this._onDidNotification;
		const onDidChange = new Emitter<RootState>({
			onDidAddListener: () => this._rootStateListenerCount++,
			onWillRemoveListener: () => this._rootStateListenerCount--,
		});
		const value: RootState = { agents };
		this._onDidRootStateChange = onDidChange;
		this._onDidAction = new Emitter<ActionEnvelope>();
		this._onDidNotification = new Emitter<INotification>();
		this._rootStateValue = value;
		this._rootStateSubscription = {
			get value() { return self._rootStateValue; },
			get verifiedValue() { return self._rootStateValue instanceof Error ? undefined : self._rootStateValue; },
			onDidChange: onDidChange.event,
			onDidError: this._onDidRootStateError.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		this._onAgentHostStart.fire();
		previousEmitter.dispose();
		previousActionEmitter.dispose();
		previousNotificationEmitter.dispose();
	}

	fireAgentHostStart(): void {
		this._onAgentHostStart.fire();
	}

	fireAgentHostExit(): void {
		this._onAgentHostExit.fire(0);
	}

	setRootStateError(): void {
		const error = new Error('root state failed');
		this._rootStateValue = error;
		this._onDidRootStateError.fire(error);
	}

	fireNotification(n: INotification): void {
		this._onDidNotification.fire(n);
	}

	fireAction(envelope: ActionEnvelope): void {
		this._onDidAction.fire(envelope);
	}

	dispose(): void {
		this._onDidAction.dispose();
		this._onDidNotification.dispose();
		this._onDidRootStateChange.dispose();
		this._onDidRootStateError.dispose();
		this._onAgentHostStart.dispose();
		this._onAgentHostExit.dispose();
		for (const emitter of this._sessionStateEmitters.values()) {
			emitter.dispose();
		}
		this._sessionStateEmitters.clear();
	}
}

// ---- Test helpers -----------------------------------------------------------

function createSession(id: string, opts?: { provider?: string; summary?: string; status?: ProtocolSessionStatus; activity?: string; project?: { uri: URI; displayName: string }; workingDirectory?: URI; startTime?: number; modifiedTime?: number; quickChat?: boolean; multiRoot?: { workspaceFile: string }; adoptable?: boolean; _meta?: IAgentSessionMetadata['_meta'] }): IAgentSessionMetadata {
	let _meta = opts?._meta;
	_meta = opts?.quickChat ? withSessionWorkspaceless(_meta, true) : _meta;
	_meta = withSessionMultiRootMetadata(_meta, opts?.multiRoot);
	if (opts?.adoptable) {
		_meta = withSessionEhcliAdoptable(_meta);
	}
	return {
		session: AgentSession.uri(opts?.provider ?? 'copilotcli', id),
		startTime: opts?.startTime ?? 1000,
		modifiedTime: opts?.modifiedTime ?? 2000,
		summary: opts?.summary,
		status: opts?.status,
		activity: opts?.activity,
		project: opts?.project,
		workingDirectories: opts?.workingDirectory ? [opts?.workingDirectory] : undefined,
		_meta,
	};
}

function createPolicyRestrictedConfigurationService(): TestConfigurationService {
	return new class extends TestConfigurationService {
		override inspect<T>(key: string) {
			const base = super.inspect<T>(key);
			if (key === 'chat.tools.global.autoApprove') {
				return { ...base, policyValue: false as unknown as T };
			}
			return base;
		}
	}();
}

/**
 * Mimics production, where `chat.defaultConfiguration` ships with a schema
 * default (`{ mode: 'interactive', approvals: 'manual' }`), so an untouched
 * setting is reported by `inspect` only as `defaultValue` (no user layer).
 * The plain {@link TestConfigurationService} does not register schema defaults,
 * so it cannot reproduce the "configured default masks remembered pick" bug.
 */
function createSchemaDefaultConfigurationService(): TestConfigurationService {
	return new class extends TestConfigurationService {
		override inspect<T>(key: string) {
			const base = super.inspect<T>(key);
			if (key === 'chat.defaultConfiguration' && base.userValue === undefined) {
				const schemaDefault = { mode: 'interactive', approvals: 'manual' } as unknown as T;
				return { ...base, value: schemaDefault, defaultValue: schemaDefault };
			}
			return base;
		}
	}();
}

class BackendSchemeTestProvider extends LocalAgentHostSessionsProvider {
	protected override _backendSessionScheme(agentProvider: string): string {
		return agentProvider === 'copilotcli' ? 'ahp-session' : agentProvider;
	}
}

function createProvider(disposables: DisposableStore, agentHostService: MockAgentHostService, contributions = [
	{ type: 'agent-host-copilotcli', name: 'copilot', displayName: 'Copilot', description: 'test', icon: undefined },
], options?: { sendRequest?: (resource: URI, message: string, options?: IChatSendRequestOptions) => Promise<ChatSendResult>; acquireOrLoadSession?: (resource: URI) => Promise<IChatModelReference | undefined>; languageModelsService?: Partial<ILanguageModelsService>; languageModelIds?: string[]; lookupLanguageModel?: (modelId: string) => ILanguageModelChatMetadata | undefined; languageModelChanges?: Event<string>; hiddenLanguageModelIds?: ReadonlySet<string>; languageModelVisibilityChanges?: Event<void>; openSession?: boolean; configurationService?: IConfigurationService; activeSession?: IObservable<IActiveSession | undefined>; visibleSessions?: IObservable<readonly (IActiveSession | undefined)[]>; activeClient?: Omit<SessionActiveClient, 'clientId'>; activeClientAgents?: IObservable<readonly AgentCustomization[]>; activeClientScope?: (sessionType: string, roots: readonly URI[]) => IAgentCustomizationScope; storageService?: IStorageService; isSessionsWindow?: boolean; confirmDelete?: boolean; workspaceTrusted?: boolean; requestWorkspaceTrust?: (uri: URI) => Promise<boolean>; workspaceTrustBarrier?: DeferredPromise<void>; workspaceTrustError?: Error; setUrisTrust?: (uris: URI[], trusted: boolean) => Promise<void>; gitHubService?: IGitHubService; devContainerAgentHostService?: IDevContainerAgentHostService; sessionsProvidersService?: ISessionsProvidersService; pathService?: IPathService; labelService?: ILabelService; providerCtor?: typeof LocalAgentHostSessionsProvider }): LocalAgentHostSessionsProvider {
	const instantiationService = disposables.add(new TestInstantiationService());

	instantiationService.stub(IAgentHostService, agentHostService);
	const configurationService = options?.configurationService ?? new TestConfigurationService();
	instantiationService.stub(IConfigurationService, configurationService);
	instantiationService.stub(IWorkspaceTrustManagementService, new class extends mock<IWorkspaceTrustManagementService>() {
		override isWorkspaceTrusted(): boolean { return options?.workspaceTrusted ?? true; }
		override async getUriTrustInfo(uri: URI) {
			await options?.workspaceTrustBarrier?.p;
			if (options?.workspaceTrustError) {
				throw options.workspaceTrustError;
			}
			return { uri, trusted: options?.workspaceTrusted ?? true };
		}
		override async setUrisTrust(uris: URI[], trusted: boolean): Promise<void> {
			await options?.setUrisTrust?.(uris, trusted);
		}
	});
	instantiationService.stub(IWorkspaceTrustRequestService, new class extends mock<IWorkspaceTrustRequestService>() {
		override requestResourcesTrust(requestOptions: ResourceTrustRequestOptions): Promise<boolean> {
			return options?.requestWorkspaceTrust?.(requestOptions.uri) ?? Promise.resolve(options?.workspaceTrusted ?? true);
		}
	}());
	instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: options?.isSessionsWindow ?? true } as IWorkbenchEnvironmentService);
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed: options?.confirmDelete ?? true }) });
	instantiationService.stub(IChatSessionsService, {
		getChatSessionContribution: (chatSessionType: string) => contributions.find(c => c.type === chatSessionType),
		getAllChatSessionContributions: () => contributions,
		getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } }),
	});
	instantiationService.stub(IChatService, {
		acquireOrLoadSession: options?.acquireOrLoadSession ?? (async () => undefined),
		sendRequest: options?.sendRequest ?? (async (): Promise<ChatSendResult> => ({ kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never })),
	});
	instantiationService.stub(IChatWidgetService, {
		openSession: async () => options?.openSession ? new class extends mock<IChatWidget>() { }() : undefined,
	});
	instantiationService.stub(ILanguageModelsService, {
		getLanguageModelIds: () => options?.languageModelIds ?? [],
		lookupLanguageModel: options?.lookupLanguageModel ?? (() => undefined),
		getModelConfiguration: () => undefined,
		setModelConfiguration: async () => { },
		hasResolvedVendor: () => true,
		isModelHidden: (modelId: string) => options?.hiddenLanguageModelIds?.has(modelId) ?? false,
		onDidChangeLanguageModels: options?.languageModelChanges ?? Event.None,
		onDidChangeModelVisibility: options?.languageModelVisibilityChanges ?? Event.None,
		...options?.languageModelsService,
	});
	instantiationService.stub(ILabelService, options?.labelService ?? new MockLabelService());
	instantiationService.stub(ILogService, new NullLogService());
	const storageService = options?.storageService ?? disposables.add(new InMemoryStorageService());
	instantiationService.stub(IStorageService, storageService);
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(IAutomationStorageService, new TestAutomationStorageService(storageService));
	instantiationService.stub(IProgressService, {});
	instantiationService.stub(IGitHubService, options?.gitHubService ?? new class extends mock<IGitHubService>() {
		override findPullRequestNumberByHeadBranch = async () => undefined;
	}());
	instantiationService.stub(IPullRequestIconCache, instantiationService.createInstance(PullRequestIconCache));
	instantiationService.stub(IPathService, options?.pathService ?? new TestPathService(URI.file('/home/test')));
	const activeSessionObs = options?.activeSession ?? constObservable<IActiveSession | undefined>(undefined);
	const visibleSessionsObs = options?.visibleSessions ?? constObservable<readonly (IActiveSession | undefined)[]>([]);
	instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
		override readonly activeSession: IObservable<IActiveSession | undefined> = activeSessionObs;
		override readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]> = visibleSessionsObs;
	}());
	instantiationService.stub(IAgentHostActiveClientService, new class extends mock<IAgentHostActiveClientService>() {
		override acquireScope = (sessionType: string, roots: readonly URI[]) => options?.activeClientScope?.(sessionType, roots) ?? ({
			customizations: constObservable(options?.activeClient?.customizations ?? []),
			customAgents: options?.activeClientAgents ?? constObservable([]),
			tools: constObservable(options?.activeClient?.tools ?? []),
			isResolved: constObservable(true),
			whenResolved: () => Promise.resolve(),
			activeClient: (clientId: string) => constObservable({ clientId, ...(options?.activeClient ?? { tools: [], customizations: [] }) }),
			dispose: () => { },
		});
	}());
	instantiationService.stub(IDevContainerAgentHostService, options?.devContainerAgentHostService ?? new class extends mock<IDevContainerAgentHostService>() { }());
	instantiationService.stub(ISessionsProvidersService, options?.sessionsProvidersService ?? new class extends mock<ISessionsProvidersService>() { }());

	return disposables.add(instantiationService.createInstance(options?.providerCtor ?? LocalAgentHostSessionsProvider));
}

function createTestLanguageModel(id: string): ILanguageModelChatMetadata {
	return {
		extension: new ExtensionIdentifier('test.agentHost'),
		id,
		vendor: 'agent-host-copilotcli',
		name: id,
		version: '1.0',
		family: id,
		maxInputTokens: 1,
		maxOutputTokens: 1,
		isDefaultForLocation: {},
	};
}

async function waitForSessionConfig(provider: LocalAgentHostSessionsProvider, sessionId: string, predicate: (config: ResolveSessionConfigResult | undefined) => boolean): Promise<void> {
	if (predicate(provider.getSessionConfig(sessionId))) {
		return;
	}

	await new Promise<void>(resolve => {
		const disposable = provider.onDidChangeSessionConfig(changedSessionId => {
			if (changedSessionId === sessionId && predicate(provider.getSessionConfig(sessionId))) {
				disposable.dispose();
				resolve();
			}
		});
	});
}

function fireSessionAdded(agentHost: MockAgentHostService, rawId: string, opts?: { provider?: string; title?: string; project?: { uri: string; displayName: string }; workingDirectory?: string; changes?: ChangesSummary; workspaceless?: boolean; createdAt?: string; modifiedAt?: string }): void {
	const provider = opts?.provider ?? 'copilotcli';
	const sessionUri = AgentSession.uri(provider, rawId);
	agentHost.fireNotification({
		channel: 'ahp-root://',
		type: NotificationType.SessionAdded,
		summary: {
			resource: sessionUri.toString(),
			provider,
			title: opts?.title ?? `Session ${rawId}`,
			status: ProtocolSessionStatus.Idle,
			createdAt: opts?.createdAt ?? new Date().toISOString(),
			modifiedAt: opts?.modifiedAt ?? new Date().toISOString(),
			project: opts?.project,
			workingDirectories: opts?.workingDirectory ? [opts.workingDirectory] : undefined,
			changes: opts?.changes,
			...(opts?.workspaceless ? { _meta: withSessionWorkspaceless(undefined, true) } : {}),
		},
	});
}

function fireSessionMetaChanged(agentHost: MockAgentHostService, rawId: string, meta: Record<string, unknown> | undefined, provider = 'copilotcli'): void {
	agentHost.fireAction({
		channel: AgentSession.uri(provider, rawId).toString(),
		action: {
			type: ActionType.SessionMetaChanged,
			_meta: meta,
		},
		serverSeq: 1,
		origin: undefined,
	});
}

function fireSessionRemoved(agentHost: MockAgentHostService, rawId: string, provider = 'copilotcli'): void {
	const sessionUri = AgentSession.uri(provider, rawId);
	agentHost.fireNotification({
		channel: 'ahp-root://',
		type: NotificationType.SessionRemoved,
		session: sessionUri.toString(),
	});
}

function fireSessionSummaryChanged(agentHost: MockAgentHostService, rawId: string, changes: SessionSummaryChangedParams['changes'], provider = 'copilotcli'): void {
	const sessionUri = AgentSession.uri(provider, rawId);
	agentHost.fireNotification({
		channel: 'ahp-root://',
		type: NotificationType.SessionSummaryChanged,
		session: sessionUri.toString(),
		changes,
	});
}

/**
 * Seed `storageService` with persisted session summaries by running a throwaway
 * provider over a fresh agent host that lists `sessions`, then flushing so the
 * base provider's `onWillSaveState` writes the cache to storage. Used to
 * simulate what a previous window left behind for the next launch to hydrate.
 */
async function persistCachedSessions(disposables: DisposableStore, storageService: IStorageService, sessions: IAgentSessionMetadata[]): Promise<void> {
	const host = new MockAgentHostService();
	disposables.add(toDisposable(() => host.dispose()));
	for (const session of sessions) {
		host.addSession(session);
	}
	createProvider(disposables, host, undefined, { storageService });
	// Let the eager refresh pick up the sessions (marking the cache dirty) then
	// flush so the cache is persisted.
	await timeout(0);
	await storageService.flush();
}

suite('LocalAgentHostSessionsProvider', () => {
	const disposables = new DisposableStore();
	let agentHost: MockAgentHostService;

	setup(() => {
		agentHost = new MockAgentHostService();
		disposables.add(toDisposable(() => agentHost.dispose()));
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Provider identity -------

	test('Automation catalogue state follows local Agent Host connection lifetime', () => {
		agentHost.automationCatalog = { entries: [], _meta: { [AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY]: true } };
		agentHost.initializeResult.set({ ...agentHost.initializeResult.get(), automations: { create: {} } }, undefined);
		const provider = createProvider(disposables, agentHost, undefined, {
			configurationService: new TestConfigurationService({ [CHAT_AUTOMATIONS_ENABLED_SETTING]: true }),
		});
		const initial = provider.automations.catalogueState.get();

		agentHost.fireAgentHostExit();
		const disconnected = provider.automations.catalogueState.get();
		agentHost.fireAgentHostStart();

		assert.deepStrictEqual({
			initial,
			disconnected,
			reconnected: provider.automations.catalogueState.get(),
		}, {
			initial: 'ready',
			disconnected: 'unavailable',
			reconnected: 'ready',
		});
	});

	test('has correct id, label, and sessionType from rootState agents', () => {
		const provider = createProvider(disposables, agentHost);

		assert.strictEqual(provider.id, 'local-agent-host');
		assert.ok(provider.label.length > 0);
		assert.strictEqual(provider.sessionTypes.length, 1);
		// The logical sessionType id is the agent provider name itself, so
		// the same agent (e.g. `copilotcli`) shares one session type across
		// local and remote hosts and the standalone Copilot CLI provider.
		assert.strictEqual(provider.sessionTypes[0].id, 'copilotcli');
		assert.strictEqual(provider.sessionTypes[0].label, 'Copilot');
	});

	test('leaves remote connection status absent from local sessions', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'local-connection-status');

		assert.deepStrictEqual(provider.getSessions().map(session => session.remoteConnectionStatus), [undefined]);
	});

	test('session types update when the local host advertises additional agents', () => {
		const provider = createProvider(disposables, agentHost);
		assert.deepStrictEqual(provider.sessionTypes.map(t => ({ id: t.id, label: t.label })), [
			{ id: 'copilotcli', label: 'Copilot' },
		]);

		let changes = 0;
		disposables.add(provider.onDidChangeSessionTypes!(() => changes++));

		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'openai', displayName: 'OpenAI', description: '', models: [] } as AgentInfo,
		]);

		assert.strictEqual(changes, 1);
		// The logical sessionType id is the agent provider name itself.
		assert.deepStrictEqual(provider.sessionTypes.map(t => ({ id: t.id, label: t.label })), [
			{ id: 'copilotcli', label: 'Copilot' },
			{ id: 'openai', label: 'OpenAI' },
		]);
	});

	test('shares the root-state listener across session adapters', () => {
		agentHost.setAgents([{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: {} } as AgentInfo]);
		const provider = createProvider(disposables, agentHost);
		const listenerCountBeforeSessions = agentHost.rootStateListenerCount;

		for (let i = 0; i < 200; i++) {
			fireSessionAdded(agentHost, `listener-${i}`);
		}

		const listenerCountAfterSessions = agentHost.rootStateListenerCount;
		agentHost.setAgents([{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { multipleChats: { fork: true } } } as AgentInfo]);
		const supportsMultipleChatsAfterHydration = provider.getSessions()[0].capabilities.get().supportsMultipleChats;
		agentHost.setRootStateError();

		assert.deepStrictEqual({
			listenerCountBeforeSessions,
			listenerCountAfterSessions,
			sessionCount: provider.getSessions().length,
			supportsMultipleChatsAfterHydration,
			supportsMultipleChatsAfterError: provider.getSessions()[0].capabilities.get().supportsMultipleChats,
		}, {
			listenerCountBeforeSessions: 1,
			listenerCountAfterSessions: 1,
			sessionCount: 200,
			supportsMultipleChatsAfterHydration: true,
			supportsMultipleChatsAfterError: false,
		});
	});

	test('reports no session types before rootState hydrates', () => {
		agentHost.clearRootState();
		const provider = createProvider(disposables, agentHost);

		assert.deepStrictEqual(provider.sessionTypes, []);
	});

	test('rebinds session types when Agent Host starts with a new root subscription', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.clearRootState();
		const provider = createProvider(disposables, agentHost);
		let addedSessions = 0;
		disposables.add(provider.onDidChangeSessions(event => addedSessions += event.added.length));
		await timeout(0);

		agentHost.replaceRootStateOnStart([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
		]);
		fireSessionAdded(agentHost, 'after-rebind');
		await timeout(100);

		assert.deepStrictEqual({
			sessionTypes: provider.sessionTypes.map(type => ({ id: type.id, label: type.label })),
			rootStateListenerCount: agentHost.rootStateListenerCount,
			addedSessions,
		}, {
			sessionTypes: [{ id: 'copilotcli', label: 'Copilot' }],
			rootStateListenerCount: 1,
			addedSessions: 1,
		});
	}));

	test('does not duplicate listeners when Agent Host starts after listeners bind', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createProvider(disposables, agentHost);
		let addedSessions = 0;
		disposables.add(provider.onDidChangeSessions(event => addedSessions += event.added.length));
		await timeout(0);

		agentHost.fireAgentHostStart();
		fireSessionAdded(agentHost, 'after-start');
		await timeout(100);

		assert.deepStrictEqual({
			rootStateListenerCount: agentHost.rootStateListenerCount,
			addedSessions,
		}, {
			rootStateListenerCount: 1,
			addedSessions: 1,
		});
	}));

	test('reports no session types when rootState advertises no agents', () => {
		agentHost.setAgents([]);
		const provider = createProvider(disposables, agentHost);

		assert.deepStrictEqual(provider.sessionTypes, []);
	});

	test('reports no session types after rootState resolves to an error', () => {
		agentHost.clearRootState();
		const provider = createProvider(disposables, agentHost);
		assert.deepStrictEqual(provider.sessionTypes, []);

		agentHost.setRootStateError();

		assert.deepStrictEqual(provider.sessionTypes, []);
	});

	test('session type icons use per-agent codicons', () => {
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
			{ provider: 'openai', displayName: 'OpenAI', description: '', models: [] } as AgentInfo,
			{ provider: 'unknown-agent', displayName: 'Unknown', description: '', models: [] } as AgentInfo,
		]);
		const provider = createProvider(disposables, agentHost);
		assert.deepStrictEqual(
			provider.sessionTypes.map(t => ({ id: t.id, icon: t.icon.id })),
			[
				{ id: 'copilotcli', icon: 'copilot' },
				{ id: 'claude', icon: 'claude' },
				{ id: 'openai', icon: 'openai' },
				{ id: 'unknown-agent', icon: 'vm' },
			],
		);
	});

	function fireConfigChange(configService: TestConfigurationService, settingId: string): void {
		configService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([settingId]),
			change: { keys: [settingId], overrides: [] },
			affectsConfiguration: (key: string) => key === settingId,
		});
	}

	test('recomputes protection for a selected non-default base branch when configuration changes', async () => {
		const configService = new TestConfigurationService();
		await configService.setUserConfiguration('git.branchProtection', []);
		agentHost.addSession(createSession('branch-protection', {
			summary: 'Branch Protection',
			project: { uri: URI.file('/repo'), displayName: 'repo' },
			workingDirectory: URI.file('/repo.worktrees/session'),
		}));
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService });
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(candidate => candidate.title.get() === 'Branch Protection');
		assert.ok(session);
		provider.getSessionConfig(session.sessionId);
		agentHost.setSessionState('branch-protection', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Branch Protection',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			_meta: withSessionGitState(undefined, { branchName: 'agents/session', baseBranchName: 'release' }),
		});
		const repository = session.workspace.get()?.folders[0]?.gitRepository;
		const before = repository?.baseBranchProtected;

		await configService.setUserConfiguration('git.branchProtection', ['release']);
		fireConfigChange(configService, 'git.branchProtection');

		assert.deepStrictEqual({
			before,
			after: session.workspace.get()?.folders[0]?.gitRepository?.baseBranchProtected,
		}, {
			before: false,
			after: true,
		});
	});

	test('always advertises agent-host Claude', () => {
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
		]);
		const provider = createProvider(disposables, agentHost);

		assert.deepStrictEqual(provider.sessionTypes.map(t => t.id), ['copilotcli', 'claude']);
	});

	test('gates agent-host Codex in the Agents window on the provider enablement setting', () => {
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'codex', displayName: 'Codex', description: '', models: [] } as AgentInfo,
		]);
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, false);
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService, isSessionsWindow: true });

		assert.deepStrictEqual(provider.sessionTypes.map(t => t.id), ['copilotcli']);

		let sessionTypesChanged = false;
		disposables.add(provider.onDidChangeSessionTypes(() => { sessionTypesChanged = true; }));
		configService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, true);
		fireConfigChange(configService, AgentHostCodexAgentEnabledSettingId);

		assert.deepStrictEqual({
			sessionTypesChanged,
			sessionTypes: provider.sessionTypes.map(t => t.id),
		}, {
			sessionTypesChanged: true,
			sessionTypes: ['copilotcli', 'codex'],
		});
	});

	test('getSessions includes agent-host Claude sessions', () => {
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
		]);
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'cli-sess', { title: 'CLI', provider: 'copilotcli' });
		fireSessionAdded(agentHost, 'claude-sess', { title: 'Claude', provider: 'claude' });

		assert.deepStrictEqual(
			provider.getSessions().map(s => s.sessionType).sort(),
			['claude', 'copilotcli'],
		);
	});

	test('session icons match the session type icon', () => {
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
			{ provider: 'unknown-agent', displayName: 'Unknown', description: '', models: [] } as AgentInfo,
		]);
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'cli-sess', { title: 'CLI', provider: 'copilotcli' });
		fireSessionAdded(agentHost, 'claude-sess', { title: 'Claude', provider: 'claude' });
		fireSessionAdded(agentHost, 'unknown-sess', { title: 'Unknown', provider: 'unknown-agent' });

		assert.deepStrictEqual(
			provider.getSessions().map(s => ({ sessionType: s.sessionType, icon: s.icon.id })).sort((a, b) => a.sessionType.localeCompare(b.sessionType)),
			[
				{ sessionType: 'claude', icon: 'claude' },
				{ sessionType: 'copilotcli', icon: 'copilot' },
				{ sessionType: 'unknown-agent', icon: 'vm' },
			],
		);
	});

	// ---- Workspace resolution -------

	test('resolveWorkspace builds workspace from URI', () => {
		const provider = createProvider(disposables, agentHost);
		const uri = URI.parse('file:///home/user/project');
		const ws = provider.resolveWorkspace(uri);

		assert.ok(ws, 'resolveWorkspace should resolve file:// URIs');
		assert.strictEqual(ws.label, 'project');
		assert.strictEqual(ws.folders.length, 1);
		assert.strictEqual(ws.folders[0].root.toString(), uri.toString());
		assert.strictEqual(ws.requiresWorkspaceTrust, true);
	});

	// ---- Browse actions -------

	test('has no browse actions', () => {
		const provider = createProvider(disposables, agentHost);

		assert.strictEqual(provider.browseActions.length, 0);
	});

	// ---- Session listing via notifications -------

	test('batches session added and removed notifications', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createProvider(disposables, agentHost);
		await timeout(0);
		fireSessionAdded(agentHost, 'remove-1');
		fireSessionAdded(agentHost, 'remove-2');
		fireSessionAdded(agentHost, 'replace');
		const replacedSession = provider.getSessions().find(session => AgentSession.id(session.resource) === 'replace');

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		fireSessionAdded(agentHost, 'add-1');
		fireSessionAdded(agentHost, 'add-2');
		fireSessionAdded(agentHost, 'transient');
		fireSessionRemoved(agentHost, 'remove-1');
		fireSessionRemoved(agentHost, 'remove-2');
		fireSessionRemoved(agentHost, 'transient');
		fireSessionRemoved(agentHost, 'replace');
		fireSessionAdded(agentHost, 'replace');

		const eventCountBeforeDebounce = changes.length;
		const cachedBeforeDebounce = provider.getSessions().map(session => AgentSession.id(session.resource)).sort();
		await timeout(100);

		assert.deepStrictEqual({
			eventCountBeforeDebounce,
			events: changes.map(change => ({
				added: change.added.map(session => AgentSession.id(session.resource)).sort(),
				removed: change.removed.map(session => AgentSession.id(session.resource)).sort(),
				changed: change.changed.map(session => AgentSession.id(session.resource)).sort(),
			})),
			replacement: {
				addedIsOriginal: changes[0]?.added.find(session => AgentSession.id(session.resource) === 'replace') === replacedSession,
				removedIsOriginal: changes[0]?.removed.find(session => AgentSession.id(session.resource) === 'replace') === replacedSession,
			},
			cachedBeforeDebounce,
		}, {
			eventCountBeforeDebounce: 0,
			events: [{
				added: ['add-1', 'add-2', 'replace'],
				removed: ['remove-1', 'remove-2', 'replace', 'transient'],
				changed: [],
			}],
			replacement: {
				addedIsOriginal: false,
				removedIsOriginal: true,
			},
			cachedBeforeDebounce: ['add-1', 'add-2', 'replace'],
		});
	}));

	test('immediate session changes flush pending notification batches', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createProvider(disposables, agentHost);
		await timeout(0);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		fireSessionAdded(agentHost, 'deleted-before-debounce');
		const session = provider.getSessions().find(session => AgentSession.id(session.resource) === 'deleted-before-debounce');
		assert.ok(session);
		await provider.deleteSession(session.sessionId);
		const eventsAfterDelete = changes.length;
		await timeout(100);

		assert.deepStrictEqual({
			eventsAfterDelete,
			events: changes.map(change => ({
				added: change.added.map(session => AgentSession.id(session.resource)),
				removed: change.removed.map(session => AgentSession.id(session.resource)),
				changed: change.changed.map(session => AgentSession.id(session.resource)),
			})),
		}, {
			eventsAfterDelete: 1,
			events: [{
				added: [],
				removed: ['deleted-before-debounce'],
				changed: [],
			}],
		});
	}));

	test('session removed notification clears cache and metadata', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createProvider(disposables, agentHost);
		await timeout(0);
		fireSessionAdded(agentHost, 'to-remove', { title: 'Removed' });
		const metadata = Reflect.get(provider, '_metaByRawId') as Map<string, IAgentSessionMetadata>;

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		fireSessionRemoved(agentHost, 'to-remove');
		await timeout(100);

		assert.deepStrictEqual({
			removed: changes[0]?.removed.length,
			session: provider.getSessions().find(s => s.title.get() === 'Removed'),
			metadata: metadata.get('to-remove'),
		}, {
			removed: 1,
			session: undefined,
			metadata: undefined,
		});
	}));

	test('identical session added notification is ignored', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createProvider(disposables, agentHost);
		await timeout(0);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		const timestamp = new Date(0).toISOString();
		fireSessionAdded(agentHost, 'dup-sess', { title: 'Dup', createdAt: timestamp, modifiedAt: timestamp });
		fireSessionAdded(agentHost, 'dup-sess', { title: 'Dup', createdAt: timestamp, modifiedAt: timestamp });
		await timeout(100);

		assert.strictEqual(changes.length, 1);
	}));

	test('removing non-existent session is no-op', () => {
		const provider = createProvider(disposables, agentHost);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		fireSessionRemoved(agentHost, 'does-not-exist');

		assert.strictEqual(changes.length, 0);
	});

	// ---- Session listing via refresh -------

	test('session added authoritatively updates a listed session in place', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const originalProject = URI.parse('file:///Users/me/project');
		const originalWorkingDirectory = URI.parse('file:///Users/me/project');
		agentHost.addSession(createSession('worktree-upsert', {
			summary: 'Worktree Session',
			project: { uri: originalProject, displayName: 'project' },
			workingDirectory: originalWorkingDirectory,
			modifiedTime: 1000,
		}));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions()[0]!;
		const originalWorkspace = session.workspace.get()!;
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		const worktreeProject = 'file:///Users/me/project.worktrees/session';
		const worktreeWorkingDirectory = 'file:///Users/me/project.worktrees/session/src';
		fireSessionAdded(agentHost, 'worktree-upsert', {
			title: 'Worktree Session',
			project: { uri: worktreeProject, displayName: 'project-worktree' },
			workingDirectory: worktreeWorkingDirectory,
			createdAt: new Date(1000).toISOString(),
			modifiedAt: new Date(2000).toISOString(),
		});
		fireSessionSummaryChanged(agentHost, 'worktree-upsert', {
			_meta: { git: { branchName: 'agents/worktree-session', baseBranchName: 'main' } },
		});
		await timeout(100);

		const current = provider.getSessions()[0]!;
		const currentWorkspace = current.workspace.get()!;
		assert.deepStrictEqual({
			sameAdapter: current === session,
			originalWorkingDirectory: originalWorkspace.folders[0].workingDirectory.toString(),
			workingDirectory: currentWorkspace.folders[0].workingDirectory.toString(),
			branchName: currentWorkspace.folders[0].gitRepository?.branchName,
			changedEvents: changes.map(change => change.changed.map(changed => changed === session)),
		}, {
			sameAdapter: true,
			originalWorkingDirectory: originalWorkingDirectory.toString(),
			workingDirectory: worktreeWorkingDirectory,
			branchName: 'agents/worktree-session',
			changedEvents: [[true]],
		});
	}));

	test('session metadata changes notify when observable git fields change', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('git-meta', {
			summary: 'Git Session',
			project: { uri: URI.parse('file:///Users/me/project'), displayName: 'project' },
		}));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions()[0]!;
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));
		const meta = {
			git: {
				branchName: 'feature/worktree',
				baseBranchName: 'main',
				hasGitHubRemote: true,
				upstreamBranchName: 'origin/feature/worktree',
				incomingChanges: 2,
				outgoingChanges: 3,
				uncommittedChanges: 4,
			},
		};

		fireSessionMetaChanged(agentHost, 'git-meta', meta);
		fireSessionMetaChanged(agentHost, 'git-meta', meta);

		const gitRepository = session.workspace.get()!.folders[0].gitRepository!;
		assert.deepStrictEqual({
			branchName: gitRepository.branchName,
			uncommittedChanges: gitRepository.uncommittedChanges,
			changedEvents: changes.map(change => change.changed.map(changed => changed === session)),
		}, {
			branchName: 'feature/worktree',
			uncommittedChanges: 4,
			changedEvents: [[true]],
		});
	}));

	test('session metadata exposes its creation reference', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('created'));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions()[0]!;
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		fireSessionMetaChanged(agentHost, 'created', withSessionCreationReference(undefined, {
			session: 'claude:/creator',
			chat: buildDefaultChatUri('claude:/creator'),
			turnId: 'turn-1',
		}));

		assert.deepStrictEqual({
			createdBySession: session.createdBySession?.get() && {
				session: session.createdBySession.get()?.session.toString(),
				chat: session.createdBySession.get()?.chat?.toString(),
				turnId: session.createdBySession.get()?.turnId,
			},
			changedEvents: changes.map(change => change.changed.map(changed => changed === session)),
		}, {
			createdBySession: {
				session: 'agent-host-claude:/creator',
				chat: 'agent-host-claude:/creator',
				turnId: 'turn-1',
			},
			changedEvents: [[true]],
		});
	}));

	test('getSessions populates from listSessions', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('list-1', { summary: 'First' }));
		agentHost.addSession(createSession('list-2', { summary: 'Second' }));

		const provider = createProvider(disposables, agentHost);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		provider.getSessions();
		await timeout(0);

		assert.ok(changes.length > 0);
		const sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 2);
	}));

	test('eagerly populates and fires onDidChangeSessions after construction without a getSessions() call', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('eager-1', { summary: 'First' }));
		agentHost.addSession(createSession('eager-2', { summary: 'Second' }));

		const provider = createProvider(disposables, agentHost);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		// Wait for the eager listSessions() triggered by the constructor.
		await timeout(0);

		assert.deepStrictEqual({
			eventCount: changes.length,
			added: changes[0]?.added.map(s => s.title.get()).sort(),
			removed: changes[0]?.removed.length,
			changed: changes[0]?.changed.length,
			cachedTitles: provider.getSessions().map(s => s.title.get()).sort(),
		}, {
			eventCount: 1,
			added: ['First', 'Second'],
			removed: 0,
			changed: 0,
			cachedTitles: ['First', 'Second'],
		});
	}));

	test('defers eager session list fetch until authentication settles', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Simulate fresh launch: auth is pending and the agent host has no
		// sessions yet (returns []), then auth completes and the real session
		// list becomes available.
		agentHost.setAuthenticationPending(true);

		const provider = createProvider(disposables, agentHost);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		await timeout(0);

		assert.strictEqual(changes.length, 0, 'no event should fire while authentication is pending');
		assert.strictEqual(provider.getSessions().length, 0, 'no sessions should be cached while authentication is pending');

		// Auth completes; sessions become available on the agent host.
		agentHost.addSession(createSession('after-auth-1', { summary: 'First' }));
		agentHost.addSession(createSession('after-auth-2', { summary: 'Second' }));
		agentHost.setAuthenticationPending(false);

		await timeout(0);

		assert.deepStrictEqual({
			eventCount: changes.length,
			added: changes[0]?.added.map(s => s.title.get()).sort(),
			cachedTitles: provider.getSessions().map(s => s.title.get()).sort(),
		}, {
			eventCount: 1,
			added: ['First', 'Second'],
			cachedTitles: ['First', 'Second'],
		});
	}));

	test('recovers an empty list when the initial listSessions fails, without needing a new session', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Fresh launch: the agent throws on the first listSessions() (e.g.
		// AHP_AUTH_REQUIRED before its token is effective, or a transient
		// offline error). The sessions really exist on the host.
		agentHost.failListSessionsCount = 1;
		agentHost.addSession(createSession('heal-1', { summary: 'First' }));
		agentHost.addSession(createSession('heal-2', { summary: 'Second' }));

		const provider = createProvider(disposables, agentHost);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		// The eager refresh fires and fails; nothing is cached yet.
		await timeout(0);
		assert.strictEqual(changes.length, 0, 'no event should fire after a failed initial refresh');
		assert.strictEqual(provider.getSessions().length, 0, 'cache stays empty after a failed initial refresh');

		// The backoff retry (min 1s) fires on its own — no ChatTurnComplete
		// or sessionAdded needed — and the list self-heals.
		await timeout(1_100);

		assert.deepStrictEqual({
			eventCount: changes.length,
			added: changes[0]?.added.map(s => s.title.get()).sort(),
			cachedTitles: provider.getSessions().map(s => s.title.get()).sort(),
		}, {
			eventCount: 1,
			added: ['First', 'Second'],
			cachedTitles: ['First', 'Second'],
		});
	}));

	test('a session whose agent reports nothing survives the refresh', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// The host aggregates one listing across all of its agents, and an
		// agent that cannot enumerate yet (SDK not downloaded) contributes an
		// empty list instead of failing. Codex going quiet must not evict its
		// sessions: `removed` is treated as a definitive deletion downstream
		// and would discard the user's pins and groups.
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'codex', displayName: 'Codex', description: '', models: [] } as AgentInfo,
		]);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, true);
		agentHost.addSession(createSession('codex-1', { provider: 'codex', summary: 'Codex One' }));
		agentHost.addSession(createSession('cli-1', { provider: 'copilotcli', summary: 'CLI One' }));

		const provider = createProvider(disposables, agentHost, undefined, { configurationService });
		await timeout(0);

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		agentHost.stopListingSessions('codex-1');
		agentHost.fireAction({
			channel: buildDefaultChatUri(AgentSession.uri('copilotcli', 'cli-1').toString()),
			action: { type: ActionType.ChatTurnComplete },
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);
		await timeout(0);

		assert.deepStrictEqual({
			removed: changes.flatMap(c => c.removed.map(s => s.title.get())),
			cachedTitles: provider.getSessions().map(s => s.title.get()).sort(),
		}, {
			removed: [],
			cachedTitles: ['CLI One', 'Codex One'],
		});
	}));

	test('a session missing while its agent still reports others is evicted', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// The agent answered and listed a sibling session, so its namespace is
		// known: the missing session really is gone and must be evicted.
		agentHost.addSession(createSession('cli-gone', { provider: 'copilotcli', summary: 'Gone' }));
		agentHost.addSession(createSession('cli-kept', { provider: 'copilotcli', summary: 'Kept' }));

		const provider = createProvider(disposables, agentHost);
		await timeout(0);

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		agentHost.stopListingSessions('cli-gone');
		agentHost.fireAction({
			channel: buildDefaultChatUri(AgentSession.uri('copilotcli', 'cli-kept').toString()),
			action: { type: ActionType.ChatTurnComplete },
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);
		await timeout(0);

		assert.deepStrictEqual({
			removed: changes.flatMap(c => c.removed.map(s => s.title.get())),
			cachedTitles: provider.getSessions().map(s => s.title.get()).sort(),
		}, {
			removed: ['Gone'],
			cachedTitles: ['Kept'],
		});
	}));

	test('a successful empty listSessions arms no retry', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// No sessions on the host: listSessions() succeeds with []. This is a
		// valid result, not a failure — the cache should be marked initialized
		// and no background retry should be scheduled.
		const provider = createProvider(disposables, agentHost);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		await timeout(0);
		const callsAfterEagerLoad = agentHost.listSessionsCallCount;
		assert.strictEqual(callsAfterEagerLoad, 1, 'exactly one eager listSessions call');

		// Advance well past the max backoff window; no retry should fire.
		await timeout(60_000);

		assert.strictEqual(agentHost.listSessionsCallCount, callsAfterEagerLoad, 'no retry should be scheduled after a successful empty list');
		assert.strictEqual(changes.length, 0, 'no change event for an empty list');
		assert.strictEqual(provider.getSessions().length, 0);
	}));

	test('retries with backoff until listSessions succeeds', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// First two attempts fail, third succeeds. Verifies the retry keeps
		// re-arming rather than giving up after a single failed attempt.
		agentHost.failListSessionsCount = 2;
		agentHost.addSession(createSession('backoff-1', { summary: 'Only' }));

		const provider = createProvider(disposables, agentHost);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		await timeout(0);
		assert.strictEqual(provider.getSessions().length, 0, 'empty after first failure');

		// First retry (~1s) — still failing.
		await timeout(1_100);
		assert.strictEqual(provider.getSessions().length, 0, 'empty after second failure');

		// Second retry (~2s backoff) — now succeeds.
		await timeout(2_200);

		assert.deepStrictEqual({
			eventCount: changes.length,
			cachedTitles: provider.getSessions().map(s => s.title.get()).sort(),
		}, {
			eventCount: 1,
			cachedTitles: ['Only'],
		});
	}));

	// ---- Startup session cache (persistence) -------

	test('hydrates persisted sessions on startup before the live list is available', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		await persistCachedSessions(disposables, storageService, [createSession('cached-1', { summary: 'Cached One' })]);

		// Fresh launch: authentication is still pending so the eager refresh is
		// deferred, yet the persisted session must surface immediately.
		const nextHost = new MockAgentHostService();
		disposables.add(toDisposable(() => nextHost.dispose()));
		nextHost.setAuthenticationPending(true);
		const provider = createProvider(disposables, nextHost, undefined, { storageService });

		assert.deepStrictEqual({
			listSessionsCalls: nextHost.listSessionsCallCount,
			cachedTitles: provider.getSessions().map(s => s.title.get()),
		}, {
			listSessionsCalls: 0,
			cachedTitles: ['Cached One'],
		});
	}));

	test('hydrates persisted change stats before the live list is available', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const previousHost = new MockAgentHostService();
		disposables.add(toDisposable(() => previousHost.dispose()));
		previousHost.addSession(createSession('cached-metadata', { summary: 'Cached Metadata' }));
		createProvider(disposables, previousHost, undefined, { storageService });
		await timeout(0);
		await storageService.flush();

		fireSessionSummaryChanged(previousHost, 'cached-metadata', {
			changes: { additions: 12, deletions: 4, files: 3 },
		});
		await storageService.flush();

		const nextHost = new MockAgentHostService();
		disposables.add(toDisposable(() => nextHost.dispose()));
		nextHost.setAuthenticationPending(true);
		const nextProvider = createProvider(disposables, nextHost, undefined, { storageService });
		const listSessionsCallsBeforeRead = nextHost.listSessionsCallCount;
		const restored = nextProvider.getSessions()[0];

		assert.deepStrictEqual({
			listSessionsCallsBeforeRead,
			changesSummary: restored.changesSummary?.get(),
		}, {
			listSessionsCallsBeforeRead: 0,
			changesSummary: { additions: 12, deletions: 4, files: 3 },
		});
	}));

	test('hydrates creation provenance before the live list is available', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const previousHost = new MockAgentHostService();
		disposables.add(toDisposable(() => previousHost.dispose()));
		previousHost.addSession(createSession('cached-created', {
			summary: 'Cached Created',
			_meta: withSessionCreationReference(undefined, {
				session: 'copilot:/creator',
				chat: buildChatUri('copilot:/creator', 'peer'),
				turnId: 'turn-1',
			}),
		}));
		createProvider(disposables, previousHost, undefined, { storageService });
		await timeout(0);
		await storageService.flush();

		const nextHost = new MockAgentHostService();
		disposables.add(toDisposable(() => nextHost.dispose()));
		nextHost.setAuthenticationPending(true);
		const nextProvider = createProvider(disposables, nextHost, undefined, { storageService });
		const restored = nextProvider.getSessions()
			.map(session => ({
				title: session.title.get(),
				createdBySession: session.createdBySession?.get() && {
					session: session.createdBySession.get()?.session.toString(),
					chat: session.createdBySession.get()?.chat?.toString(),
					turnId: session.createdBySession.get()?.turnId,
				},
			}))
			.sort((a, b) => a.title.localeCompare(b.title));

		assert.deepStrictEqual(restored, [{
			title: 'Cached Created',
			createdBySession: {
				session: 'agent-host-copilot:/creator',
				chat: 'agent-host-copilot:/creator#peer',
				turnId: 'turn-1',
			},
		}]);
	}));

	test('hydrates a pull request icon persisted by a metadata-only update', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const previousHost = new MockAgentHostService();
		disposables.add(toDisposable(() => previousHost.dispose()));
		previousHost.addSession(createSession('cached-pr', {
			summary: 'Cached PR',
			project: { uri: URI.file('/repo'), displayName: 'repo' },
		}));
		createProvider(disposables, previousHost, undefined, { storageService });
		await timeout(0);
		await storageService.flush();

		fireSessionSummaryChanged(previousHost, 'cached-pr', {
			_meta: withSessionGitHubState(undefined, {
				owner: 'owner',
				repo: 'repo',
				pullRequestUrls: ['https://github.com/owner/repo/pull/42'],
				pullRequestBranchName: 'feature',
			}),
		});
		await storageService.flush();

		const nextHost = new MockAgentHostService();
		disposables.add(toDisposable(() => nextHost.dispose()));
		nextHost.setAuthenticationPending(true);
		const gitHubService = new class extends mock<IGitHubService>() {
			private readonly _model = { pullRequest: constObservable(undefined) } as unknown as GitHubPullRequestModel;
			override createPullRequestModelReference = () => new ImmortalReference(this._model);
		}();
		const nextProvider = createProvider(disposables, nextHost, undefined, { storageService, gitHubService });
		const restored = nextProvider.getSessions()[0];
		const pullRequestIcon = restored.completedStateIcon?.get();

		assert.deepStrictEqual({
			pullRequestIcon: pullRequestIcon && { id: pullRequestIcon.id, color: pullRequestIcon.color?.id },
		}, {
			pullRequestIcon: {
				id: computePullRequestIcon(GitHubPullRequestState.Open).id,
				color: computePullRequestIcon(GitHubPullRequestState.Open).color?.id,
			},
		});
	}));

	test('discards a legacy cache entry so read state is rebuilt from the host', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Storage-key literals of the pre-`.v2` cache schema, whose entries
		// carried a stale `isRead: true` written by the old always-read adapter.
		const LEGACY_KEY = 'localAgentHost.cachedSessions';
		const CURRENT_KEY = 'localAgentHost.cachedSessions.v2';
		const storageService = disposables.add(new InMemoryStorageService());

		// Simulate a previous (old-schema) window: persist a session, then move
		// the snapshot to the legacy key as the old build would have written it.
		await persistCachedSessions(disposables, storageService, [createSession('legacy-1', { summary: 'Legacy One' })]);
		const snapshot = storageService.get(CURRENT_KEY, StorageScope.APPLICATION);
		assert.ok(snapshot, 'precondition: current-key snapshot should exist');
		storageService.store(LEGACY_KEY, snapshot, StorageScope.APPLICATION, StorageTarget.USER);
		storageService.remove(CURRENT_KEY, StorageScope.APPLICATION);

		// Fresh launch with authentication pending so no live refresh runs: the
		// legacy entry must be discarded rather than hydrated, and its key removed.
		const nextHost = new MockAgentHostService();
		disposables.add(toDisposable(() => nextHost.dispose()));
		nextHost.setAuthenticationPending(true);
		const provider = createProvider(disposables, nextHost, undefined, { storageService });

		assert.deepStrictEqual({
			cachedSessions: provider.getSessions().length,
			legacyKeyPresent: storageService.get(LEGACY_KEY, StorageScope.APPLICATION) !== undefined,
		}, {
			cachedSessions: 0,
			legacyKeyPresent: false,
		});
	}));

	test('caches session-scoped flags but never transient activity bits', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		// A session that was mid-turn (and unread) when the cache was flushed.
		await persistCachedSessions(disposables, storageService, [{
			...createSession('busy-1', { summary: 'Busy One' }),
			status: ProtocolSessionStatus.InProgress | ProtocolSessionStatus.IsArchived,
		}]);

		// Authentication pending, so nothing corrects the hydrated state — a stale
		// spinner here would stick around indefinitely for an unreachable remote host.
		const nextHost = new MockAgentHostService();
		disposables.add(toDisposable(() => nextHost.dispose()));
		nextHost.setAuthenticationPending(true);
		const provider = createProvider(disposables, nextHost, undefined, { storageService });

		const restored = provider.getSessions()[0];
		assert.deepStrictEqual({
			status: restored.status.get(),
			isArchived: restored.isArchived.get(),
			isRead: restored.isRead.get(),
		}, {
			status: SessionStatus.Completed,
			isArchived: true,
			isRead: false,
		});
	}));

	test('hydrated quick chat stays workspace-less after reload despite a scratch working directory', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Regression #324581: a committed quick chat persisted into the startup
		// cache carries a scratch cwd. The adapter seeds its session-kind at
		// construction from `_meta.workspaceless`, so the tag must survive the
		// serialize/deserialize round-trip — otherwise the restored session
		// leaks the scratch dir as a workspace folder.
		const storageService = disposables.add(new InMemoryStorageService());
		await persistCachedSessions(disposables, storageService, [
			createSession('quick-cached', {
				summary: 'Quick Chat',
				workingDirectory: URI.file('/tmp/copilot-scratch/quick-cached'),
				quickChat: true,
			}),
		]);

		const nextHost = new MockAgentHostService();
		disposables.add(toDisposable(() => nextHost.dispose()));
		nextHost.setAuthenticationPending(true);
		const provider = createProvider(disposables, nextHost, undefined, { storageService });

		const session = provider.getSessions().find(s => AgentSession.id(s.resource.toString()) === 'quick-cached');
		assert.deepStrictEqual({
			workspace: session?.workspace.get(),
			isQuickChat: session?.isQuickChat?.get(),
		}, {
			workspace: undefined,
			isQuickChat: true,
		});
	}));

	test('hydrated session preserves multi-root metadata after reload', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const multiRoot = {
			workspaceFile: 'vscode-remote://ssh-remote+host/work/demo.code-workspace',
		};
		await persistCachedSessions(disposables, storageService, [
			createSession('multi-root-cached', { summary: 'Multi Root', multiRoot }),
		]);
		const nextHost = new MockAgentHostService();
		disposables.add(toDisposable(() => nextHost.dispose()));
		nextHost.setAuthenticationPending(true);

		const session = createProvider(disposables, nextHost, undefined, { storageService }).getSessions()[0];
		nextHost.fireAction({
			channel: AgentSession.uri('copilotcli', 'multi-root-cached').toString(),
			action: { type: ActionType.SessionTitleChanged, title: 'Updated after hydration' },
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);
		await storageService.flush();
		const repersisted = JSON.parse(storageService.get('localAgentHost.cachedSessions.v2', StorageScope.APPLICATION)!) as Array<{ multiRoot?: typeof multiRoot }>;

		assert.deepStrictEqual({
			repersisted: repersisted[0].multiRoot,
			hydratedTitle: session.title.get(),
		}, {
			repersisted: multiRoot,
			hydratedTitle: 'Updated after hydration',
		});
	}));

	test('a refresh publishes _meta and summary fields as one atomic update', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// `AgentHostSessionAdapter.update` applies `_meta` through `setMeta`,
		// which must join the caller's transaction. A plain `transaction()`
		// finishes — and therefore notifies — before `update` has applied the
		// rest of the snapshot, so observers would see a torn state: the new
		// workspace (or a fresh quick-chat promotion) alongside the previous
		// archived/read flags.
		agentHost.addSession(createSession('atomic-1', { summary: 'One', workingDirectory: URI.file('/repo') }));
		const provider = createProvider(disposables, agentHost);
		await timeout(0);

		const session = provider.getSessions()[0];
		const observed: { branch: string | undefined; isArchived: boolean }[] = [];
		disposables.add(autorun(reader => {
			observed.push({
				branch: session.workspace.read(reader)?.folders[0]?.gitRepository?.branchName,
				isArchived: session.isArchived.read(reader),
			});
		}));

		// One refresh that moves both the `_meta`-derived workspace and a
		// plain summary field.
		agentHost.addSession({
			...createSession('atomic-1', { summary: 'One', workingDirectory: URI.file('/repo') }),
			status: ProtocolSessionStatus.Idle | ProtocolSessionStatus.IsArchived,
			_meta: withSessionGitState(undefined, { branchName: 'feature' }),
		});
		agentHost.fireAction({
			channel: buildDefaultChatUri(AgentSession.uri('copilotcli', 'atomic-1').toString()),
			action: { type: ActionType.ChatTurnComplete },
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);
		await timeout(0);

		assert.deepStrictEqual(observed, [
			{ branch: undefined, isArchived: false },
			{ branch: 'feature', isArchived: true },
		]);
	}));

	test('a summaryChanged notification publishes the change chip and _meta as one atomic update', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// `_handleSessionSummaryChanged` batches into a transaction, but a
		// setter that writes its observable without one builds and finishes a
		// transaction of its own, notifying immediately. `changes` is applied
		// before `_meta`, so an observer of both would otherwise run once on
		// the new chip with the stale workspace, then again at the outer
		// finish.
		agentHost.addSession(createSession('atomic-2', { summary: 'Two', workingDirectory: URI.file('/repo') }));
		const provider = createProvider(disposables, agentHost);
		await timeout(0);

		const session = provider.getSessions()[0];
		const observed: { branch: string | undefined; files: number | undefined }[] = [];
		disposables.add(autorun(reader => {
			observed.push({
				branch: session.workspace.read(reader)?.folders[0]?.gitRepository?.branchName,
				files: session.changesSummary?.read(reader)?.files,
			});
		}));

		fireSessionSummaryChanged(agentHost, 'atomic-2', {
			changes: { additions: 3, deletions: 1, files: 2 },
			_meta: withSessionGitState(undefined, { branchName: 'feature' }),
		});
		await timeout(0);

		assert.deepStrictEqual(observed, [
			{ branch: undefined, files: undefined },
			{ branch: 'feature', files: 2 },
		]);
	}));

	test('a summaryChanged delta clearing the adoptable marker opens the passive state subscription', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// A surfaced-but-un-adopted legacy Copilot CLI session is not subscribed
		// passively (subscribing would trigger an adopting restore). Once it is
		// adopted, the host emits a `summaryChanged` clearing the marker; the
		// client must then open the state subscription it previously skipped.
		agentHost.addSession(createSession('adopt-sub', { summary: 'Legacy', adoptable: true }));
		const provider = createProvider(disposables, agentHost);
		await timeout(0);

		const session = provider.getSessions()[0];
		const lastStates = (provider as unknown as { _lastSessionStates: Map<string, SessionState> })._lastSessionStates;

		const state: SessionState = {
			provider: 'copilotcli',
			title: 'Legacy',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
		};
		// While adoptable the channel has no subscriber, so pushing a state has
		// no effect on the client.
		agentHost.setSessionState('adopt-sub', 'copilotcli', state);
		assert.strictEqual(lastStates.get(session.sessionId), undefined, 'no passive subscription while adoptable');

		fireSessionSummaryChanged(agentHost, 'adopt-sub', { _meta: undefined });
		await timeout(0);

		assert.strictEqual(lastStates.get(session.sessionId), state, 'subscription opens and applies the state once the marker clears');
	}));

	test('reconciles hydrated sessions against the authoritative list, pruning stale entries', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		await persistCachedSessions(disposables, storageService, [createSession('stale-1', { summary: 'Stale' })]);

		// Fresh launch with an authoritative (empty) list: the hydrated session
		// shows immediately, then is pruned once the first refresh succeeds.
		const nextHost = new MockAgentHostService();
		disposables.add(toDisposable(() => nextHost.dispose()));
		const provider = createProvider(disposables, nextHost, undefined, { storageService });

		const beforeRefresh = provider.getSessions().map(s => s.title.get());
		await timeout(0);
		const afterRefresh = provider.getSessions().map(s => s.title.get());

		assert.deepStrictEqual({ beforeRefresh, afterRefresh }, { beforeRefresh: ['Stale'], afterRefresh: [] });
	}));

	test('hydrated sessions survive a failed initial listSessions', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		await persistCachedSessions(disposables, storageService, [createSession('resilient-1', { summary: 'Resilient' })]);

		// Fresh launch where the first listSessions() throws (e.g.
		// AHP_AUTH_REQUIRED before the token is effective). Without caching the
		// list would be empty until the retry heals; the persisted session must
		// stay visible throughout.
		const nextHost = new MockAgentHostService();
		disposables.add(toDisposable(() => nextHost.dispose()));
		nextHost.failListSessionsCount = 1;
		nextHost.addSession(createSession('resilient-1', { summary: 'Resilient' }));
		const provider = createProvider(disposables, nextHost, undefined, { storageService });

		await timeout(0);
		const afterFailedList = provider.getSessions().map(s => s.title.get());

		// The backoff retry (min 1s) heals; the session remains listed.
		await timeout(1_100);
		const afterRetry = provider.getSessions().map(s => s.title.get());

		assert.deepStrictEqual({ afterFailedList, afterRetry }, { afterFailedList: ['Resilient'], afterRetry: ['Resilient'] });
	}));

	test('uses project metadata as workspace group source', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const projectUri = URI.file('/home/user/vscode');
		const workingDirectory = URI.file('/tmp/copilot-worktrees/vscode-feature');
		agentHost.addSession(createSession('project-1', {
			summary: 'Project Session',
			project: { uri: projectUri, displayName: 'vscode' },
			workingDirectory,
		}));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const workspace = provider.getSessions()[0].workspace.get();
		assert.deepStrictEqual({
			label: workspace?.label,
			repository: workspace?.folders[0]?.root.toString(),
			workingDirectory: workspace?.folders[0]?.workingDirectory?.toString(),
		}, {
			label: 'vscode',
			repository: projectUri.toString(),
			workingDirectory: workingDirectory.toString(),
		});
	}));

	test('listed session with only workingDirectory (no project) shows folder name', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const workingDirectory = URI.file('/home/user/standalone-folder');
		agentHost.addSession(createSession('wd-only-1', {
			summary: 'WD-only Session',
			workingDirectory,
		}));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const workspace = provider.getSessions()[0].workspace.get();
		assert.strictEqual(workspace?.label, 'standalone-folder');
	}));

	test('session added notification does not carry model metadata', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'notif-model', { title: 'Notif Model Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Notif Model Session');
		assert.strictEqual(session?.modelId.get(), undefined);
	});

	test('getModels returns only models targeting the session resource scheme', () => {
		const matchingModel = { ...createTestLanguageModel('matching'), targetChatSessionType: 'agent-host-copilotcli' };
		const otherModel = { ...createTestLanguageModel('other'), targetChatSessionType: 'agent-host-other' };
		const provider = createProvider(disposables, agentHost, undefined, {
			languageModelIds: ['matching', 'other', 'missing'],
			lookupLanguageModel: id => id === 'matching' ? matchingModel : id === 'other' ? otherModel : undefined,
		});
		fireSessionAdded(agentHost, 'model-catalog', { title: 'Model Catalog Session' });
		const session = provider.getSessions().find(session => session.title.get() === 'Model Catalog Session');
		assert.ok(session);

		const snapshot = provider.getModelsSnapshot(session.sessionId);
		assert.deepStrictEqual({
			models: snapshot.models.map(model => model.identifier),
			modelTarget: snapshot.modelTarget,
		}, {
			models: ['matching'],
			modelTarget: 'agent-host-copilotcli',
		});
	});

	test('getModelsSnapshot excludes hidden models and announces visibility changes', async () => {
		const matchingModel = { ...createTestLanguageModel('matching'), targetChatSessionType: 'agent-host-copilotcli' };
		const hiddenLanguageModelIds = new Set(['matching']);
		const visibilityChanges = disposables.add(new Emitter<void>());
		const provider = createProvider(disposables, agentHost, undefined, {
			languageModelIds: ['matching'],
			lookupLanguageModel: id => id === 'matching' ? matchingModel : undefined,
			hiddenLanguageModelIds,
			languageModelVisibilityChanges: visibilityChanges.event,
		});
		fireSessionAdded(agentHost, 'hidden-model-catalog', { title: 'Hidden Model Catalog Session' });
		const session = provider.getSessions().find(session => session.title.get() === 'Hidden Model Catalog Session');
		assert.ok(session);

		let changes = 0;
		disposables.add(provider.onDidChangeModels(() => changes++));
		assert.deepStrictEqual(provider.getModelsSnapshot(session.sessionId).models, []);

		hiddenLanguageModelIds.delete('matching');
		const modelsChanged = Event.toPromise(provider.onDidChangeModels);
		visibilityChanges.fire();
		const visibleModels = provider.getModelsSnapshot(session.sessionId).models.map(model => model.identifier);
		await modelsChanged;
		assert.deepStrictEqual({ changes, visibleModels }, { changes: 1, visibleModels: ['matching'] });
	});

	test('announces language model changes after the model catalog settles', async () => {
		const languageModelIds: string[] = [];
		const languageModelChanges = disposables.add(new Emitter<string>());
		const provider = createProvider(disposables, agentHost, undefined, {
			languageModelIds,
			languageModelChanges: languageModelChanges.event,
		});

		let modelIdsAtNotification: readonly string[] = [];
		disposables.add(provider.onDidChangeModels(() => {
			modelIdsAtNotification = [...languageModelIds];
		}));
		const modelsChanged = Event.toPromise(provider.onDidChangeModels);
		languageModelChanges.fire('agent-host-copilotcli');
		languageModelIds.push('matching');
		await modelsChanged;

		assert.deepStrictEqual(modelIdsAtNotification, ['matching']);
	});

	test('getModelsSnapshot canonicalizes a matching logical-session model identifier', () => {
		const modelId = 'gpt-5.6-sol';
		const logicalIdentifier = `copilotcli/${modelId}`;
		const unrelatedIdentifier = `other/${modelId}`;
		const targetIdentifier = `agent-host-copilotcli:${modelId}`;
		const languageModelIds = [logicalIdentifier, unrelatedIdentifier];
		const languageModels = new Map([
			[logicalIdentifier, { ...createTestLanguageModel(modelId), vendor: 'copilotcli', targetChatSessionType: 'copilotcli' }],
			[unrelatedIdentifier, { ...createTestLanguageModel(modelId), vendor: 'other', targetChatSessionType: 'other' }],
			[targetIdentifier, { ...createTestLanguageModel(modelId), targetChatSessionType: 'agent-host-copilotcli' }],
		]);
		const provider = createProvider(disposables, agentHost, undefined, {
			languageModelIds,
			lookupLanguageModel: id => languageModels.get(id),
		});
		fireSessionAdded(agentHost, 'model-alias', { title: 'Model Alias Session' });
		const session = provider.getSessions().find(session => session.title.get() === 'Model Alias Session');
		assert.ok(session);

		const pending = provider.getModelsSnapshot(session.sessionId, logicalIdentifier).desiredModelResolution;
		const unrelated = provider.getModelsSnapshot(session.sessionId, unrelatedIdentifier).desiredModelResolution;
		languageModelIds.push(targetIdentifier);
		const available = provider.getModelsSnapshot(session.sessionId, logicalIdentifier).desiredModelResolution;

		assert.deepStrictEqual({
			pending,
			unrelated,
			available: available.kind === 'available' ? { kind: available.kind, identifier: available.model.identifier } : available,
		}, {
			pending: { kind: 'pending', identifier: targetIdentifier },
			unrelated: { kind: 'unavailable', identifier: unrelatedIdentifier },
			available: { kind: 'available', identifier: targetIdentifier },
		});
	});

	test('setModel updates existing session model and lets draft debounce persist it', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'set-model', { title: 'Set Model Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Set Model Session');
		assert.ok(session);

		provider.setModel(session!.sessionId, session!.resource, 'agent-host-copilotcli:new-model', ChatModelSource.Chosen);

		assert.strictEqual(session!.modelId.get(), 'agent-host-copilotcli:new-model');
		assert.deepStrictEqual(agentHost.dispatchedActions, []);
	});

	test('setModel updates cached selection for later message-level selection', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'set-model-config', { title: 'Set Model Config Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Set Model Config Session');
		assert.ok(session);

		provider.setModel(session!.sessionId, session!.resource, 'agent-host-copilotcli:configured-model', ChatModelSource.Chosen);

		assert.strictEqual(session!.modelId.get(), 'agent-host-copilotcli:configured-model');
		assert.deepStrictEqual(agentHost.dispatchedActions, []);
	});

	test('setAgent updates existing session agent and lets draft debounce persist it', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'set-agent', { title: 'Set Agent Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Set Agent Session');
		assert.ok(session);

		provider.setAgent?.(session!.sessionId, { uri: 'agent://review', name: 'review' });

		assert.deepStrictEqual(session!.mode.get(), { id: 'agent://review', kind: 'agent' });
		assert.deepStrictEqual(agentHost.dispatchedActions, []);
	});

	test('setAgent with undefined clears the cached agent selection', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'clear-agent', { title: 'Clear Agent Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Clear Agent Session');
		assert.ok(session);

		provider.setAgent?.(session!.sessionId, { uri: 'agent://review', name: 'review' });
		provider.setAgent?.(session!.sessionId, undefined);

		assert.strictEqual(session!.mode.get(), undefined);
		assert.deepStrictEqual(agentHost.dispatchedActions, []);
	});

	test('restores the selected agent from the default chat draft on resume', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'resume-agent', { title: 'Resume Agent Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Resume Agent Session');
		assert.ok(session);
		assert.strictEqual(session!.mode.get(), undefined);

		// `getSessionConfig` opens the session-state subscription, which also opens
		// the default chat subscription used to read the persisted draft agent.
		provider.getSessionConfig(session!.sessionId);

		const defaultChatUri = buildDefaultChatUri(AgentSession.uri('copilotcli', 'resume-agent'));
		agentHost.setChatState(defaultChatUri, {
			resource: defaultChatUri,
			title: 'Resume Agent Session',
			status: ProtocolSessionStatus.Idle,
			modifiedAt: new Date(0).toISOString(),
			turns: [],
			draft: { text: '', origin: { kind: MessageKind.User }, agent: { uri: 'agent://resumed' } },
		});

		assert.deepStrictEqual(session!.mode.get(), { id: 'agent://resumed', kind: 'agent' });
	});

	test('does not override a live agent selection with the persisted draft agent', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'resume-nooverride', { title: 'Resume No Override' });

		const session = provider.getSessions().find(s => s.title.get() === 'Resume No Override');
		assert.ok(session);

		// A live pick wins; a later draft snapshot must not clobber it.
		provider.setAgent?.(session!.sessionId, { uri: 'agent://live', name: 'live' });
		provider.getSessionConfig(session!.sessionId);

		const defaultChatUri = buildDefaultChatUri(AgentSession.uri('copilotcli', 'resume-nooverride'));
		agentHost.setChatState(defaultChatUri, {
			resource: defaultChatUri,
			title: 'Resume No Override',
			status: ProtocolSessionStatus.Idle,
			modifiedAt: new Date(0).toISOString(),
			turns: [],
			draft: { text: '', origin: { kind: MessageKind.User }, agent: { uri: 'agent://resumed' } },
		});

		assert.deepStrictEqual(session!.mode.get(), { id: 'agent://live', kind: 'agent' });
	});

	test('restores the selected model from the default chat draft on resume', () => {
		// Mirrors the draft agent restore. Without it a reopened session reports no model at all,
		// which model selection reads as "this conversation never chose one" and seeds from a
		// profile-wide preference — writing that through and changing what the session runs on.
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'resume-model', { title: 'Resume Model Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Resume Model Session');
		assert.ok(session);
		assert.strictEqual(session!.modelId.get(), undefined);

		provider.getSessionConfig(session!.sessionId);

		const defaultChatUri = buildDefaultChatUri(AgentSession.uri('copilotcli', 'resume-model'));
		agentHost.setChatState(defaultChatUri, {
			resource: defaultChatUri,
			title: 'Resume Model Session',
			status: ProtocolSessionStatus.Idle,
			modifiedAt: new Date(0).toISOString(),
			turns: [],
			draft: { text: '', origin: { kind: MessageKind.User }, model: { id: 'resumed-model' } },
		});

		assert.deepStrictEqual({
			modelId: session!.modelId.get(),
			// The conversation's own model, read back from where the host persisted it — so it
			// outranks `chat.defaultModel` rather than inviting it.
			modelSource: session!.mainChat.get().modelSource.get(),
		}, {
			modelId: 'agent-host-copilotcli:resumed-model',
			modelSource: ChatModelSource.Chosen,
		});
	});

	test('does not override a live model selection with the persisted draft model', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'resume-model-nooverride', { title: 'Resume Model No Override' });

		const session = provider.getSessions().find(s => s.title.get() === 'Resume Model No Override');
		assert.ok(session);

		// A live pick wins; a later draft snapshot must not clobber it.
		provider.setModel(session!.sessionId, session!.resource, 'agent-host-copilotcli:live-model', ChatModelSource.Chosen);
		provider.getSessionConfig(session!.sessionId);

		const defaultChatUri = buildDefaultChatUri(AgentSession.uri('copilotcli', 'resume-model-nooverride'));
		agentHost.setChatState(defaultChatUri, {
			resource: defaultChatUri,
			title: 'Resume Model No Override',
			status: ProtocolSessionStatus.Idle,
			modifiedAt: new Date(0).toISOString(),
			turns: [],
			draft: { text: '', origin: { kind: MessageKind.User }, model: { id: 'resumed-model' } },
		});

		assert.deepStrictEqual({
			modelId: session!.modelId.get(),
			modelSource: session!.mainChat.get().modelSource.get(),
		}, {
			modelId: 'agent-host-copilotcli:live-model',
			modelSource: ChatModelSource.Chosen,
		});
	});

	test('rebases the selected agent to its worktree twin from the agent list before the working directory flips', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'rebase-worktree', { title: 'Rebase Worktree', workingDirectory: 'file:///Users/me/vscode' });

		const session = provider.getSessions().find(s => s.title.get() === 'Rebase Worktree');
		assert.ok(session);

		// A folder agent is picked while the session still runs in the repo.
		const folderAgent = 'file:///Users/me/vscode/.github/agents/sessions.md';
		const worktreeAgent = 'file:///Users/me/vscode.worktrees/rebase-worktree/.github/agents/sessions.md';
		provider.setAgent?.(session!.sessionId, { uri: folderAgent, name: 'sessions' });

		// The host reports the worktree-pathed agents (the folder twin is gone)
		// well before the working directory flips to the worktree. The rebase
		// must derive the worktree root from the agent list, not the (still
		// folder) working directory, so the selection is re-pointed in time.
		provider.getSessionConfig(session!.sessionId);
		agentHost.setSessionState('rebase-worktree', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Rebase Worktree',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			customizations: [{
				type: CustomizationType.Plugin,
				id: 'plugin://worktree',
				uri: 'plugin://worktree',
				name: 'worktree plugin',
				load: { kind: CustomizationLoadStatus.Loaded },
				children: [{ type: CustomizationType.Agent, id: worktreeAgent, uri: worktreeAgent, name: 'sessions' }],
			}],
		});

		assert.deepStrictEqual(session!.mode.get(), { id: worktreeAgent, kind: 'agent' });
	});

	test('leaves the selected agent untouched when the agent list has no relocated twin', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'rebase-none', { title: 'Rebase None', workingDirectory: 'file:///Users/me/vscode' });

		const session = provider.getSessions().find(s => s.title.get() === 'Rebase None');
		assert.ok(session);

		const folderAgent = 'file:///Users/me/vscode/.github/agents/sessions.md';
		provider.setAgent?.(session!.sessionId, { uri: folderAgent, name: 'sessions' });

		// An unrelated agent (different repo-relative file) must not be treated
		// as a relocation of the selection.
		provider.getSessionConfig(session!.sessionId);
		agentHost.setSessionState('rebase-none', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Rebase None',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			customizations: [{
				type: CustomizationType.Plugin,
				id: 'plugin://other',
				uri: 'plugin://other',
				name: 'other plugin',
				load: { kind: CustomizationLoadStatus.Loaded },
				children: [{ type: CustomizationType.Agent, id: 'file:///Users/me/vscode.worktrees/rebase-none/.github/agents/other.md', uri: 'file:///Users/me/vscode.worktrees/rebase-none/.github/agents/other.md', name: 'other' }],
			}],
		});

		assert.deepStrictEqual(session!.mode.get(), { id: folderAgent, kind: 'agent' });
	});

	test('carries the picked custom agent onto the committed session when a new session graduates', async () => {
		// Part 1 regression: when a new (untitled) session graduates into a real
		// running session on first send, the picked agent must travel onto the
		// committed session's `mode`. Otherwise the picker — which mirrors
		// `session.mode` — resets to the default the moment the active session is
		// swapped for the freshly committed one.
		const provider = createProvider(disposables, agentHost, undefined, {
			openSession: true,
			sendRequest: async (): Promise<ChatSendResult> => {
				agentHost.addSession(createSession('graduated', { summary: 'Graduated Session' }));
				return { kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never };
			},
		});

		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		provider.setAgent?.(session.sessionId, { uri: 'agent://picked', name: 'picked' });

		const chat = await provider.createNewChat(session.sessionId);
		const committed = await provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' });

		assert.deepStrictEqual(committed.mode.get(), { id: 'agent://picked', kind: 'agent' });
	});

	// ---- getCustomAgents / onDidChangeCustomAgents -------

	test('getCustomAgents collects agents from session customizations, coalesced by URI and sorted by name', async () => {
		const provider = createProvider(disposables, agentHost);

		fireSessionAdded(agentHost, 'agents-merge', { title: 'Merge Session' });
		const session = provider.getSessions().find(s => s.title.get() === 'Merge Session');
		assert.ok(session);

		// Custom agents live exclusively on `SessionCustomization.agents`
		// (populated by the host after parsing each customization). The host
		// merges host-/client-/session-level customizations into
		// `state.customizations` for us, so the picker only needs to read
		// from there. A duplicate `uri` across customizations is coalesced
		// (first seen wins).
		const fakeState: SessionState = {
			provider: 'copilotcli',
			title: 'Merge Session',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			customizations: [{
				type: CustomizationType.Plugin,
				id: 'plugin://session-1',
				uri: 'plugin://session-1',
				name: 'session plugin',
				load: { kind: CustomizationLoadStatus.Loaded },
				children: [
					{ type: CustomizationType.Agent, id: 'agent://shared', uri: 'agent://shared', name: 'shared', description: 'from session' },
					{ type: CustomizationType.Agent, id: 'agent://session-only', uri: 'agent://session-only', name: 'session-only' },
				],
			}, {
				type: CustomizationType.Plugin,
				id: 'plugin://session-2',
				uri: 'plugin://session-2',
				name: 'second session plugin',
				load: { kind: CustomizationLoadStatus.Loaded },
				children: [
					{ type: CustomizationType.Agent, id: 'agent://another', uri: 'agent://another', name: 'another' },
					// Duplicate URI — must NOT replace the first-seen entry.
					{ type: CustomizationType.Agent, id: 'agent://shared-dup', uri: 'agent://shared', name: 'shared (duplicate)' },
				],
			}, {
				// Disabled customizations are skipped entirely.
				type: CustomizationType.Plugin,
				id: 'plugin://disabled',
				uri: 'plugin://disabled',
				name: 'disabled plugin',
				// TODO: Step 2 selects the persisted enablement scope.
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
				load: { kind: CustomizationLoadStatus.Loaded },
				children: [{ type: CustomizationType.Agent, id: 'agent://disabled', uri: 'agent://disabled', name: 'disabled' }],
			}, {
				// Customizations with `children === undefined` are treated as
				// "unknown" (host not yet finished parsing) and skipped.
				type: CustomizationType.Plugin,
				id: 'plugin://unparsed',
				uri: 'plugin://unparsed',
				name: 'unparsed plugin',
				load: { kind: CustomizationLoadStatus.Loading },
			}],
		};
		// Force a session-state subscription so `_lastSessionStates` gets
		// populated when we push the fake state below. `getSessionConfig`
		// is the public hook that calls `_keepSessionStateAlive`.
		provider.getSessionConfig(session!.sessionId);
		agentHost.setSessionState('agents-merge', 'copilotcli', fakeState);

		assert.deepStrictEqual(provider.getCustomAgents(session!.sessionId), [
			{ type: CustomizationType.Agent, id: 'agent://another', uri: 'agent://another', name: 'another' },
			{ type: CustomizationType.Agent, id: 'agent://session-only', uri: 'agent://session-only', name: 'session-only' },
			// First-seen wins for the duplicate `agent://shared` URI.
			{ type: CustomizationType.Agent, id: 'agent://shared', uri: 'agent://shared', name: 'shared', description: 'from session' },
		]);
	});

	test('getMcpServers dispatches MCP lifecycle requests', async () => {
		const provider = createProvider(disposables, agentHost);

		fireSessionAdded(agentHost, 'mcp-lifecycle', { title: 'MCP Lifecycle' });
		const session = provider.getSessions().find(s => s.title.get() === 'MCP Lifecycle');
		assert.ok(session);

		const fakeState: SessionState = {
			provider: 'copilotcli',
			title: 'MCP Lifecycle',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			customizations: [{
				type: CustomizationType.McpServer,
				id: 'mcp://docs',
				uri: 'mcp://docs',
				name: 'Docs',
				state: { kind: McpServerStatus.Stopped },
			}],
		};
		provider.getSessionConfig(session!.sessionId);
		agentHost.setSessionState('mcp-lifecycle', 'copilotcli', fakeState);

		const servers = provider.getMcpServers(session!.sessionId);
		assert.strictEqual(servers.length, 1);
		await servers[0].start();
		await servers[0].stop();

		const actions = agentHost.dispatchedActions.slice(-2);
		assert.deepStrictEqual(actions.map(({ action }) => action.type), [
			ActionType.SessionMcpServerStartRequested,
			ActionType.SessionMcpServerStopRequested,
		]);
		assert.deepStrictEqual(actions.map(({ action }) => (action as { id: string }).id), ['mcp://docs', 'mcp://docs']);
	});

	test('getBackendChatResource looks up the host-supplied backend chat URI', () => {
		const provider = createProvider(disposables, agentHost);

		fireSessionAdded(agentHost, 'chat-lookup', { title: 'Chat Lookup' });
		fireSessionAdded(agentHost, 'no-state', { title: 'No State' });
		const session = provider.getSessions().find(s => s.title.get() === 'Chat Lookup');
		const unhydrated = provider.getSessions().find(s => s.title.get() === 'No State');
		assert.ok(session);
		assert.ok(unhydrated);

		// The backend chat URIs are host-supplied and independent of the client
		// resources; the lookup returns them verbatim rather than constructing them.
		// On the wire they are strings.
		const backendSession = AgentSession.uri('copilotcli', 'backend-abc').toString();
		const defaultBackend = buildDefaultChatUri(backendSession);
		const peerBackend = buildChatUri(backendSession, 'peer-1');
		const fakeState: SessionState = {
			provider: 'copilotcli',
			title: 'Chat Lookup',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [
				{ resource: defaultBackend, title: 'Default', status: ProtocolSessionStatus.Idle, modifiedAt: '2025-01-01T00:00:00.000Z' } satisfies ChatSummary,
				{ resource: peerBackend, title: 'Peer', status: ProtocolSessionStatus.Idle, modifiedAt: '2025-01-01T00:00:00.000Z' } satisfies ChatSummary,
			],
			defaultChat: defaultBackend,
		};
		provider.getSessionConfig(session.sessionId);
		agentHost.setSessionState('chat-lookup', 'copilotcli', fakeState);

		assert.deepStrictEqual({
			// Default chat (client resource has no fragment) resolves via `defaultChat`.
			defaultChat: provider.getBackendChatResource(session.resource)?.toString(),
			// Peer chat (client fragment) resolves via its `ChatSummary.resource`.
			peerChat: provider.getBackendChatResource(session.resource.with({ fragment: 'peer-1' }))?.toString(),
			// A peer chat absent from hydrated state has no backend URI.
			missingPeer: provider.getBackendChatResource(session.resource.with({ fragment: 'ghost' }))?.toString(),
			// A session whose state has not hydrated yields nothing.
			notHydrated: provider.getBackendChatResource(unhydrated.resource),
		}, {
			defaultChat: URI.parse(defaultBackend).toString(),
			peerChat: URI.parse(peerBackend).toString(),
			missingPeer: undefined,
			notHydrated: undefined,
		});
	});

	test('getCustomAgents returns no agents when the session has no SessionState', () => {
		const provider = createProvider(disposables, agentHost);

		// Root-level customizations on `AgentInfo` no longer contribute
		// agents directly to the picker — only `SessionCustomization.agents`
		// does — so a session without a `SessionState` resolves to empty.
		agentHost.setAgents([
			{
				provider: 'copilotcli',
				displayName: 'Copilot',
				description: '',
				models: [],
				customizations: [{
					type: CustomizationType.Plugin,
					id: 'plugin://root',
					uri: 'plugin://root',
					name: 'root plugin',
				}],
			} as AgentInfo,
		]);

		fireSessionAdded(agentHost, 'root-only', { title: 'Root Only' });
		const session = provider.getSessions().find(s => s.title.get() === 'Root Only');
		assert.ok(session);

		assert.deepStrictEqual(provider.getCustomAgents(session!.sessionId), []);
	});

	test('new session exposes client custom agents before SessionState and updates the picker', () => {
		const activeClientAgents = observableValue<readonly AgentCustomization[]>('activeClientAgents', []);
		const provider = createProvider(disposables, agentHost, undefined, { activeClientAgents });
		const session = provider.createNewSession(URI.parse('file:///home/user/proj'), provider.sessionTypes[0].id);
		let fired = 0;
		disposables.add(provider.onDidChangeCustomAgents(() => fired++));

		activeClientAgents.set([{
			type: CustomizationType.Agent,
			id: 'inbox',
			uri: 'file:///plugins/github-inbox/agents/inbox.agent.md',
			name: 'Inbox',
		}], undefined);

		assert.deepStrictEqual({
			agents: provider.getCustomAgents(session.sessionId),
			fired,
		}, {
			agents: [{
				type: CustomizationType.Agent,
				id: 'inbox',
				uri: 'file:///plugins/github-inbox/agents/inbox.agent.md',
				name: 'Inbox',
			}],
			fired: 1,
		});
	});

	test('onDidChangeCustomAgents fires on root state and session state changes', async () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'cust-events', { title: 'Cust Events' });
		const session = provider.getSessions().find(s => s.title.get() === 'Cust Events');
		assert.ok(session);

		let fired = 0;
		disposables.add(provider.onDidChangeCustomAgents(() => { fired++; }));

		// A root state change that replaces the agents reference should
		// fire the event. This is the only path that mutates agents in the
		// real reducer (`RootAgentsChanged`).
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
		]);
		const afterRoot = fired;
		assert.ok(afterRoot > 0, 'expected event to fire when the agents reference is replaced');

		// A subsequent root state change that preserves the agents reference
		// (e.g. `activeSessionsChanged` on every turn start/complete) must
		// NOT fire — firing on those caused chat session bubbles to be
		// re-hydrated mid-turn, dropping streamed responses.
		agentHost.fireNonAgentRootStateChange();
		assert.strictEqual(fired, afterRoot, 'expected event NOT to fire on non-agent root deltas (preserved agents reference)');

		// Session-state update with new customizations should fire it again.
		provider.getSessionConfig(session!.sessionId);
		agentHost.setSessionState('cust-events', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Cust Events',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			customizations: [{
				type: CustomizationType.Plugin,
				id: 'plugin://s',
				uri: 'plugin://s',
				name: 'session plugin',
				load: { kind: CustomizationLoadStatus.Loaded },
				children: [{ type: CustomizationType.Agent, id: 'agent://s', uri: 'agent://s', name: 's' }],
			}],
		});
		assert.ok(fired > afterRoot, 'expected event to fire on session state customization change');

		// A second state update with the SAME customizations reference must
		// NOT fire — only churn in `customizations` / `activeClients[].customizations`
		// counts.
		const afterFirstCustomization = fired;
		agentHost.setSessionState('cust-events', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Cust Events Updated',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			// Same identity as before:
			customizations: (provider as unknown as { _lastSessionStates: Map<string, SessionState> })._lastSessionStates.get(session!.sessionId)?.customizations,
		});
		assert.strictEqual(fired, afterFirstCustomization, 'expected event NOT to fire when customizations are unchanged');
	});

	test('NewSession forwards SessionState into _lastSessionStates so the picker sees customizations before first message', async () => {
		const provider = createProvider(disposables, agentHost);
		const sessionTypeId = provider.sessionTypes[0].id;
		const session = provider.createNewSession(URI.parse('file:///home/user/proj'), sessionTypeId);
		await timeout(0); // let eagerCreate complete and the subscription seed

		const rawId = session.resource.path.substring(1);

		let fired = 0;
		disposables.add(provider.onDidChangeCustomAgents(() => { fired++; }));

		// Push a SessionState carrying customizations as if the host had
		// resolved them and dispatched a SessionCustomizationsChanged.
		const customizations: Customization[] = [{
			type: CustomizationType.Plugin,
			id: 'plugin://new-session',
			uri: 'plugin://new-session',
			name: 'p',
			load: { kind: CustomizationLoadStatus.Loaded },
			children: [
				{ type: CustomizationType.Agent, id: 'agent://reviewer', uri: 'agent://reviewer', name: 'reviewer' },
				{ type: CustomizationType.Agent, id: 'agent://triage', uri: 'agent://triage', name: 'triage' },
			],
		}];
		const state: SessionState = {
			provider: sessionTypeId,
			title: '',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			customizations,
		};
		agentHost.setSessionState(rawId, sessionTypeId, state);

		assert.deepStrictEqual(provider.getCustomAgents(session.sessionId), [
			{ type: CustomizationType.Agent, id: 'agent://reviewer', uri: 'agent://reviewer', name: 'reviewer' },
			{ type: CustomizationType.Agent, id: 'agent://triage', uri: 'agent://triage', name: 'triage' },
		]);
		assert.ok(fired > 0, 'expected onDidChangeCustomAgents to fire when SessionState arrives');

		// A second update with a different customizations identity should
		// re-fire and update the picker.
		const after = fired;
		agentHost.setSessionState(rawId, sessionTypeId, {
			...state,
			customizations: [{
				...(customizations[0] as Extract<Customization, { type: CustomizationType.Plugin }>),
				children: [{ type: CustomizationType.Agent, id: 'agent://only', uri: 'agent://only', name: 'only' }],
			}],
		});

		assert.deepStrictEqual(provider.getCustomAgents(session.sessionId), [
			{ type: CustomizationType.Agent, id: 'agent://only', uri: 'agent://only', name: 'only' },
		]);
		assert.ok(fired > after, 'expected onDidChangeCustomAgents to fire again on a second update');
	});

	test('NewSession publishes Agent Host git metadata before the first message', async () => {
		const provider = createProvider(disposables, agentHost);
		const sessionTypeId = provider.sessionTypes[0].id;
		const session = provider.createNewSession(URI.parse('file:///home/user/proj'), sessionTypeId);
		await timeout(0);
		const rawId = session.resource.path.substring(1);

		agentHost.setSessionState(rawId, sessionTypeId, {
			provider: sessionTypeId,
			title: '',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			customizations: [],
			_meta: {
				github: {
					owner: 'partial-owner',
				},
				git: {
					hasGitHubRemote: true,
					githubOwner: 'microsoft',
					githubRepo: 'vscode',
					branchName: 'main',
				},
			},
		});

		const gitRepository = session.workspace.get()?.folders[0]?.gitRepository;
		assert.deepStrictEqual({
			hasGitHubRemote: gitRepository?.hasGitHubRemote,
			branchName: gitRepository?.branchName,
			gitHubInfo: gitRepository?.gitHubInfo.get(),
		}, {
			hasGitHubRemote: true,
			branchName: 'main',
			gitHubInfo: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequests: undefined,
				pullRequest: undefined,
				issues: undefined,
			},
		});
	});

	test('NewSession releases observed changeset subscriptions when inactive', async () => {
		const activeSession = observableValue<IActiveSession | undefined>('test.activeSession', undefined);
		const provider = createProvider(disposables, agentHost, undefined, { activeSession });
		const sessionTypeId = provider.sessionTypes[0].id;
		const session = provider.createNewSession(URI.parse('file:///home/user/proj'), sessionTypeId);
		await timeout(0);

		activeSession.set(new class extends mock<IActiveSession>() {
			override readonly resource = session.resource;
		}(), undefined);
		disposables.add(autorun(reader => {
			for (const changeset of session.changesets?.read(reader) ?? []) {
				changeset.changes.read(reader);
			}
		}));

		const backendUri = agentHost.createdSessionUris.at(-1)!;
		const changesetUri = `${backendUri}/changeset/uncommitted`;
		agentHost.setSessionState(AgentSession.id(backendUri), sessionTypeId, {
			provider: sessionTypeId,
			title: '',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			changesets: [
				{ label: 'Uncommitted Changes', uriTemplate: changesetUri, changeKind: 'uncommitted' },
			],
		});
		assert.strictEqual(agentHost.sessionSubscribeCounts.get(changesetUri), 1);

		activeSession.set(undefined, undefined);
		assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(changesetUri), 1);
	});

	test('subscribes to the session channel for a catalogue published relative to the session', async () => {
		// Verbatim, `changeset/uncommitted` parses to `file:///changeset/uncommitted`.
		const activeSession = observableValue<IActiveSession | undefined>('test.activeSession', undefined);
		const provider = createProvider(disposables, agentHost, undefined, { activeSession });
		const sessionTypeId = provider.sessionTypes[0].id;
		const session = provider.createNewSession(URI.parse('file:///home/user/proj'), sessionTypeId);
		await timeout(0);

		activeSession.set(new class extends mock<IActiveSession>() {
			override readonly resource = session.resource;
		}(), undefined);
		disposables.add(autorun(reader => {
			for (const changeset of session.changesets?.read(reader) ?? []) {
				changeset.changes.read(reader);
			}
		}));

		const backendUri = agentHost.createdSessionUris.at(-1)!;
		agentHost.setSessionState(AgentSession.id(backendUri), sessionTypeId, {
			provider: sessionTypeId,
			title: '',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			changesets: [
				{ label: 'Uncommitted Changes', uriTemplate: 'changeset/uncommitted', changeKind: 'uncommitted' },
			],
		});

		assert.deepStrictEqual({
			resolved: agentHost.sessionSubscribeCounts.get(`${backendUri}/changeset/uncommitted`),
			verbatim: agentHost.sessionSubscribeCounts.get('file:///changeset/uncommitted'),
		}, {
			resolved: 1,
			verbatim: undefined,
		});
	});

	test('NewSession dispose clears _lastSessionStates entry and fires onDidChangeCustomAgents', async () => {
		const provider = createProvider(disposables, agentHost);
		const sessionTypeId = provider.sessionTypes[0].id;
		const first = provider.createNewSession(URI.parse('file:///home/user/a'), sessionTypeId);
		await timeout(0);

		const rawId = first.resource.path.substring(1);
		agentHost.setSessionState(rawId, sessionTypeId, {
			provider: sessionTypeId,
			title: '',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			customizations: [{
				type: CustomizationType.Plugin,
				id: 'plugin://x',
				uri: 'plugin://x',
				name: 'p',
				load: { kind: CustomizationLoadStatus.Loaded },
				children: [{ type: CustomizationType.Agent, id: 'agent://x', uri: 'agent://x', name: 'x' }],
			}],
		});
		assert.strictEqual(provider.getCustomAgents(first.sessionId).length, 1);

		let fired = 0;
		disposables.add(provider.onDidChangeCustomAgents(() => { fired++; }));

		// Trigger disposal of the first NewSession explicitly. Providers no
		// longer dispose drafts implicitly when a new one is created, so the
		// management layer (modeled here) disposes the abandoned draft.
		provider.createNewSession(URI.parse('file:///home/user/b'), sessionTypeId);
		provider.deleteNewSession(first.sessionId);
		await timeout(0);

		assert.deepStrictEqual(provider.getCustomAgents(first.sessionId), []);
		assert.ok(fired > 0, 'expected onDidChangeCustomAgents to fire on NewSession dispose');
	});

	// ---- Session lifecycle -------

	test('createNewSession returns session with correct fields', () => {
		const provider = createProvider(disposables, agentHost);
		const workspaceUri = URI.parse('file:///home/user/my-project');
		const session = provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);

		assert.deepStrictEqual({
			providerId: session.providerId,
			status: session.status.get(),
			workspaceLabel: session.workspace.get()?.label,
			sessionType: session.sessionType,
			config: provider.getSessionConfig(session.sessionId),
		}, {
			providerId: provider.id,
			status: SessionStatus.Untitled,
			workspaceLabel: 'my-project',
			sessionType: provider.sessionTypes[0].id,
			config: { schema: { type: 'object', properties: {} }, values: {} },
		});
	});

	test('startNewSessionRequest exposes session activity until disposed', () => {
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/my-project'), provider.sessionTypes[0].id);

		const activity = 'Fetching pull request...';
		const preparation = provider.startNewSessionRequest(session.sessionId, activity);
		const duringDescription = session.description.get();
		const during = duringDescription ? renderAsPlaintext(duringDescription) : undefined;
		const duringStatus = session.status.get();
		const requestInProgressDuring = session.isNewSessionRequestInProgress?.get();
		preparation.dispose();

		assert.deepStrictEqual({
			status: session.status.get(),
			duringStatus,
			during,
			after: session.description.get()?.value,
			requestInProgressDuring,
			requestInProgressAfter: session.isNewSessionRequestInProgress?.get(),
		}, {
			status: SessionStatus.Untitled,
			duringStatus: SessionStatus.Untitled,
			during: activity,
			after: undefined,
			requestInProgressDuring: true,
			requestInProgressAfter: false,
		});
	});

	test('startNewSessionRequest keeps overlapping request activity until the final request is disposed', () => {
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/my-project'), provider.sessionTypes[0].id);

		const first = provider.startNewSessionRequest(session.sessionId, 'First request');
		const second = provider.startNewSessionRequest(session.sessionId, 'Second request');
		first.dispose();
		const afterFirstDescription = session.description.get();
		const afterFirst = {
			status: session.status.get(),
			inProgress: session.isNewSessionRequestInProgress?.get(),
			activity: afterFirstDescription ? renderAsPlaintext(afterFirstDescription) : undefined,
		};
		second.dispose();
		const afterSecondDescription = session.description.get();

		assert.deepStrictEqual({
			afterFirst,
			afterSecond: {
				status: session.status.get(),
				inProgress: session.isNewSessionRequestInProgress?.get(),
				activity: afterSecondDescription ? renderAsPlaintext(afterSecondDescription) : undefined,
			},
		}, {
			afterFirst: {
				status: SessionStatus.Untitled,
				inProgress: true,
				activity: 'Second request',
			},
			afterSecond: {
				status: SessionStatus.Untitled,
				inProgress: false,
				activity: undefined,
			},
		});
	});

	test('createNewSession forwards initial metadata to the agent host', async () => {
		const provider = createProvider(disposables, agentHost);
		provider.createNewSession(URI.parse('file:///home/user/my-project'), provider.sessionTypes[0].id, {
			metadata: { github: { owner: 'microsoft', repo: 'vscode', pullRequestUrl: 'https://github.com/microsoft/vscode/pull/42' } },
		});
		await timeout(0);

		assert.deepStrictEqual(agentHost.createSessionConfigs.at(-1)?.metadata, {
			github: { owner: 'microsoft', repo: 'vscode', pullRequestUrl: 'https://github.com/microsoft/vscode/pull/42' },
		});
	});

	test('createNewSession republishes standalone MCP enablement after eager creation', async () => {
		const customizations = observableValue<NonNullable<SessionActiveClient['customizations']>>('draftActiveClientCustomizations', [{
			type: CustomizationType.Plugin,
			id: 'vscode://synced-data',
			uri: 'vscode://synced-data',
			name: 'VS Code Synced Data',
			childEnablement: {
				'docs-server': [{ kind: CustomizationEnablementKind.Global, enabled: true }],
			},
		}]);
		const customAgents = observableValue<readonly AgentCustomization[]>('draftActiveClientAgents', []);
		const tools = observableValue<SessionActiveClient['tools']>('draftActiveClientTools', []);
		const isResolved = observableValue('draftActiveClientResolved', true);
		const scope: IAgentCustomizationScope = {
			customizations,
			customAgents,
			tools,
			isResolved,
			whenResolved: () => Promise.resolve(),
			activeClient: clientId => derived(reader => {
				customAgents.read(reader);
				return {
					clientId,
					customizations: customizations.read(reader),
					tools: tools.read(reader),
				};
			}),
			dispose: () => { },
		};
		const provider = createProvider(disposables, agentHost, undefined, { activeClientScope: () => scope });
		agentHost.onCreateSession = uri => {
			agentHost.setSessionState(AgentSession.id(uri), AgentSession.provider(uri)!, {
				provider: AgentSession.provider(uri)!,
				title: '',
				status: ProtocolSessionStatus.Idle,
				lifecycle: SessionLifecycle.Ready,
				activeClients: [{
					clientId: agentHost.clientId,
					customizations: customizations.get(),
					tools: tools.get(),
				}],
				chats: [],
			});
		};

		const session = provider.createNewSession(URI.parse('file:///home/user/my-project'), provider.sessionTypes[0].id);
		await timeout(0);
		const dispatchCount = agentHost.dispatchedActions.filter(dispatch => dispatch.action.type === ActionType.SessionActiveClientSet).length;
		const disabledCustomizations = [{
			type: CustomizationType.Plugin,
			id: 'vscode://synced-data',
			uri: 'vscode://synced-data',
			name: 'VS Code Synced Data',
			childEnablement: {
				'docs-server': [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			},
		}] satisfies NonNullable<SessionActiveClient['customizations']>;
		customizations.set(disabledCustomizations, undefined);

		const activeClientDispatches = agentHost.dispatchedActions.filter(dispatch => dispatch.action.type === ActionType.SessionActiveClientSet);
		assert.deepStrictEqual(
			{
				initialDispatchCount: dispatchCount,
				actions: activeClientDispatches
					.slice(dispatchCount)
					.map(({ channel, action }) => ({ channel, action })),
			},
			{
				initialDispatchCount: 0,
				actions: [{
					channel: AgentSession.uri(provider.sessionTypes[0].id, session.resource.path.substring(1)).toString(),
					action: {
						type: ActionType.SessionActiveClientSet,
						activeClient: {
							clientId: agentHost.clientId,
							customizations: disabledCustomizations,
							tools: [],
						},
					},
				}],
			},
		);
	});

	test('getMcpServers returns MCP servers from a draft session', async () => {
		const provider = createProvider(disposables, agentHost);
		agentHost.onCreateSession = uri => {
			agentHost.setSessionState(AgentSession.id(uri), AgentSession.provider(uri)!, {
				provider: AgentSession.provider(uri)!,
				title: '',
				status: ProtocolSessionStatus.Idle,
				lifecycle: SessionLifecycle.Ready,
				activeClients: [],
				chats: [],
				customizations: [{
					type: CustomizationType.Plugin,
					id: 'vscode://synced-data',
					uri: 'vscode://synced-data',
					name: 'VS Code Synced Data',
					children: [{
						type: CustomizationType.McpServer,
						id: 'docs-server',
						uri: 'vscode://synced-data/docs-server',
						name: 'Docs Server',
						state: { kind: McpServerStatus.Ready },
					}],
				}],
			});
		};

		const session = provider.createNewSession(URI.parse('file:///home/user/my-project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.deepStrictEqual(provider.getMcpServers(session.sessionId).map(server => ({
			id: server.id,
			name: server.name,
			enabled: server.enabled,
			status: server.status,
			state: server.state,
		})), [{
			id: `${AgentSession.uri(provider.sessionTypes[0].id, session.resource.path.substring(1)).authority}/docs-server`,
			name: 'Docs Server',
			enabled: true,
			status: McpServerStatus.Ready,
			state: { kind: McpServerStatus.Ready },
		}]);
	});

	test('setCustomizationEnablement dispatches for a draft session', async () => {
		const provider = createProvider(disposables, agentHost);
		agentHost.onCreateSession = uri => {
			agentHost.setSessionState(AgentSession.id(uri), AgentSession.provider(uri)!, {
				provider: AgentSession.provider(uri)!,
				title: '',
				status: ProtocolSessionStatus.Idle,
				lifecycle: SessionLifecycle.Ready,
				activeClients: [],
				chats: [],
			});
		};

		const session = provider.createNewSession(URI.parse('file:///home/user/my-project'), provider.sessionTypes[0].id);
		await timeout(0);
		agentHost.dispatchedActions.length = 0;
		const enablement = [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///home/user/my-project', enabled: false }];
		provider.setCustomizationEnablement(session.sessionId, 'docs-server', enablement);

		assert.deepStrictEqual(agentHost.dispatchedActions.map(({ channel, action }) => ({ channel, action })), [{
			channel: AgentSession.uri(provider.sessionTypes[0].id, session.resource.path.substring(1)).toString(),
			action: {
				type: ActionType.SessionCustomizationToggled,
				id: 'docs-server',
				enablement,
			},
		}]);
	});

	// ---- Quick chats (workspace-less sessions) -------

	test('declares quick chat support', () => {
		const provider = createProvider(disposables, agentHost);
		assert.strictEqual(provider.supportsQuickChats, true);
	});

	test('createQuickChat returns a workspace-less untitled session', () => {
		const provider = createProvider(disposables, agentHost);
		const session = provider.createQuickChat(provider.sessionTypes[0].id);

		assert.deepStrictEqual({
			providerId: session.providerId,
			status: session.status.get(),
			workspace: session.workspace.get(),
			sessionType: session.sessionType,
			isQuickChat: session.isQuickChat?.get(),
		}, {
			providerId: provider.id,
			status: SessionStatus.Untitled,
			workspace: undefined,
			sessionType: provider.sessionTypes[0].id,
			isQuickChat: true,
		});
	});

	test('createQuickChat eagerly creates the backend session with no working directory (inferred workspace-less)', async () => {
		const provider = createProvider(disposables, agentHost);
		provider.createQuickChat(provider.sessionTypes[0].id);
		await timeout(0); // let eagerCreate complete

		// The provider no longer passes an explicit quick-chat flag; the host
		// infers workspace-less from the absent `workingDirectory`.
		const created = agentHost.createSessionConfigs.at(-1);
		assert.strictEqual(created?.workingDirectory, undefined);
	});

	test('createQuickChat throws when no agents are advertised', () => {
		agentHost.setAgents([]);
		const provider = createProvider(disposables, agentHost);
		assert.throws(() => provider.createQuickChat('copilotcli'));
	});

	test('derives automation provenance from the provider run ledger', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('automation-1', { summary: 'Automation' }));
		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions()[0];
		const changed: boolean[] = [];
		disposables.add(provider.onDidChangeSessions(event => {
			if (event.changed.includes(session)) {
				changed.push(session.isAutomation?.get() ?? false);
			}
		}));

		const automation = await provider.automations.createAutomation({
			name: 'Automation',
			prompt: 'Run',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: provider.id, sessionTypeId: 'copilotcli' },
		});
		const claim = await provider.automations.recordRunStart(automation.id, 'manual', 1);
		await provider.automations.updateRun(claim.run.id, { sessionResource: session.resource });
		const marked = session.isAutomation?.get();

		await provider.automations.deleteRun(claim.run.id);

		assert.deepStrictEqual({
			marked,
			afterDelete: session.isAutomation?.get(),
			changed,
		}, {
			marked: true,
			afterDelete: false,
			changed: [true, false],
		});
	}));

	test('restores a quick chat from listSessions as workspace-less despite a scratch working directory', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// On reload the host re-advertises the quick chat tagged via
		// `_meta.workspaceless`, but with the throwaway scratch cwd it assigned.
		// The restored session must stay workspace-less so it groups under
		// "Quick Chats" and skips workspace trust.
		agentHost.addSession(createSession('quick-1', {
			summary: 'Quick Chat',
			workingDirectory: URI.file('/tmp/copilot-scratch/quick-1'),
			quickChat: true,
		}));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions()[0];
		assert.deepStrictEqual({
			title: session?.title.get(),
			workspace: session?.workspace.get(),
		}, {
			title: 'Quick Chat',
			workspace: undefined,
		});
	}));

	test('restored quick chat reports supportsMultipleChats === false', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// A quick chat is a single-chat session regardless of session type:
		// the `_meta.workspaceless` tag forces `supportsMultipleChats: false`.
		agentHost.addSession(createSession('quick-1', {
			summary: 'Quick Chat',
			workingDirectory: URI.file('/tmp/copilot-scratch/quick-1'),
			quickChat: true,
		}));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions()[0];
		assert.deepStrictEqual(session?.capabilities.get(), { supportsMultipleChats: false, supportsFork: true, supportsSideChat: false, supportsRename: true, supportsDelete: true });
	}));

	test('restored quick chat collapses to a single chat even when state advertises peer chats', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// A quick chat is single-chat: even if a restored `SessionState`
		// advertises peer chats, `supportsMultipleChats: false` collapses the
		// catalog to the default chat. The state subscription's `_meta` (which
		// the host copies from the summary) must keep the workspace-less tag.
		agentHost.addSession(createSession('quick-multi', {
			summary: 'Quick Chat',
			workingDirectory: URI.file('/tmp/copilot-scratch/quick-multi'),
			quickChat: true,
		}));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions()[0];
		// Subscribe to session state so the restored snapshot reaches the adapter.
		provider.getSessionConfig(session.sessionId);

		const sessionUri = AgentSession.uri('copilotcli', 'quick-multi').toString();
		const defaultChat = buildDefaultChatUri(sessionUri);
		agentHost.setSessionState('quick-multi', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Quick Chat',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			defaultChat,
			_meta: withSessionWorkspaceless(undefined, true),
			chats: [
				{ resource: defaultChat, title: '', status: ProtocolSessionStatus.Idle, modifiedAt: new Date(0).toISOString() },
				{ resource: buildChatUri(sessionUri, 'peer-1'), title: 'Peer One', status: ProtocolSessionStatus.Idle, modifiedAt: new Date(0).toISOString() },
				{ resource: buildChatUri(sessionUri, 'peer-2'), title: 'Peer Two', status: ProtocolSessionStatus.Idle, modifiedAt: new Date(0).toISOString() },
			],
		});

		assert.deepStrictEqual({
			workspace: session.workspace.get(),
			supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
			chatFragments: session.chats.get().map(c => c.resource.fragment),
			chatTitles: session.chats.get().map(c => c.title.get()),
		}, {
			workspace: undefined,
			supportsMultipleChats: false,
			chatFragments: [''],
			chatTitles: ['Quick Chat'],
		});
	}));

	test('promotes an untagged session to a quick chat once state reports it workspace-less, and persists the promotion', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Regression: a session whose first sighting carried no `_meta` (a
		// persisted cache entry written before the tag was plumbed through, or a
		// host that dropped `_meta` from its listing) is born workspace-bound,
		// so the host's throwaway scratch cwd surfaces as a workspace folder
		// named after the session id. The kind must heal itself as soon as an
		// authoritative `_meta.workspaceless` arrives — and the healed kind must
		// reach the persisted cache, otherwise the next launch resurrects the
		// mis-classification from the stale snapshot.
		const storageService = disposables.add(new InMemoryStorageService());
		agentHost.addSession(createSession('quick-untagged', {
			summary: 'Quick Chat',
			workingDirectory: URI.file('/home/user/.copilot/chats/quick-untagged'),
		}));

		const provider = createProvider(disposables, agentHost, undefined, { storageService });
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions()[0];
		const beforePromotion = { hasWorkspace: session.workspace.get() !== undefined, isQuickChat: session.isQuickChat?.get() };

		// Subscribe to session state so the host's snapshot reaches the adapter.
		provider.getSessionConfig(session.sessionId);

		const sessionUri = AgentSession.uri('copilotcli', 'quick-untagged').toString();
		const defaultChat = buildDefaultChatUri(sessionUri);
		agentHost.setSessionState('quick-untagged', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Quick Chat',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			defaultChat,
			_meta: withSessionWorkspaceless(undefined, true),
			chats: [{ resource: defaultChat, title: '', status: ProtocolSessionStatus.Idle, modifiedAt: new Date(0).toISOString() }],
		});
		await storageService.flush();

		// Next launch hydrates from the persisted cache (authentication pending,
		// so no listing can re-supply the tag).
		const nextHost = new MockAgentHostService();
		disposables.add(toDisposable(() => nextHost.dispose()));
		nextHost.setAuthenticationPending(true);
		const hydrated = createProvider(disposables, nextHost, undefined, { storageService }).getSessions()[0];

		assert.deepStrictEqual({
			beforePromotion,
			afterPromotion: { workspace: session.workspace.get(), isQuickChat: session.isQuickChat?.get() },
			afterReload: { workspace: hydrated?.workspace.get(), isQuickChat: hydrated?.isQuickChat?.get() },
		}, {
			beforePromotion: { hasWorkspace: true, isQuickChat: false },
			afterPromotion: { workspace: undefined, isQuickChat: true },
			afterReload: { workspace: undefined, isQuickChat: true },
		});
	}));

	test('reports a kind-only promotion so the list regroups a session that never had a workspace', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Regression: promotion must be announced even when the workspace does
		// not change. An untagged session with no working directory already has
		// `workspace === undefined`, so keying the change event off the
		// workspace alone would silently promote it and leave the sidebar
		// showing it outside the "Chats" section until some unrelated event
		// forced a regroup.
		agentHost.addSession(createSession('quick-no-cwd', { summary: 'Quick Chat' }));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions()[0];
		provider.getSessionConfig(session.sessionId);

		const changed: string[] = [];
		disposables.add(provider.onDidChangeSessions(e => changed.push(...e.changed.map(s => s.sessionId))));

		const sessionUri = AgentSession.uri('copilotcli', 'quick-no-cwd').toString();
		const defaultChat = buildDefaultChatUri(sessionUri);
		agentHost.setSessionState('quick-no-cwd', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Quick Chat',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			defaultChat,
			_meta: withSessionWorkspaceless(undefined, true),
			chats: [{ resource: defaultChat, title: '', status: ProtocolSessionStatus.Idle, modifiedAt: new Date(0).toISOString() }],
		});

		assert.deepStrictEqual({
			isQuickChat: session.isQuickChat?.get(),
			announced: changed.includes(session.sessionId),
		}, {
			isQuickChat: true,
			announced: true,
		});
	}));

	test('listing reconcile promotes a cached adapter in place and announces the regroup', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Regression: a startup-cache entry written while the `listSessions`
		// wire dropped `_meta` is hydrated as workspace-bound. The first
		// authoritative listing must promote that *same* adapter in place and
		// report it in `changed`, since the list regroups imperatively.
		const storageService = disposables.add(new InMemoryStorageService());
		const scratchDir = URI.file('/home/user/.copilot/chats/quick-poisoned');
		await persistCachedSessions(disposables, storageService, [
			createSession('quick-poisoned', { summary: 'Quick Chat', workingDirectory: scratchDir }),
		]);

		// Next launch: the host now reports the session as workspace-less.
		const nextHost = new MockAgentHostService();
		disposables.add(toDisposable(() => nextHost.dispose()));
		nextHost.addSession(createSession('quick-poisoned', { summary: 'Quick Chat', workingDirectory: scratchDir, quickChat: true }));

		const provider = createProvider(disposables, nextHost, undefined, { storageService });
		const hydrated = provider.getSessions()[0];
		const fromCache = { hasWorkspace: hydrated.workspace.get() !== undefined, isQuickChat: hydrated.isQuickChat?.get() };

		const changed: string[] = [];
		disposables.add(provider.onDidChangeSessions(e => changed.push(...e.changed.map(s => s.sessionId))));
		await timeout(0);

		assert.deepStrictEqual({
			fromCache,
			afterListing: { workspace: hydrated.workspace.get(), isQuickChat: hydrated.isQuickChat?.get() },
			announced: changed.includes(hydrated.sessionId),
			healedInPlace: provider.getSessions()[0] === hydrated,
		}, {
			fromCache: { hasWorkspace: true, isQuickChat: false },
			afterListing: { workspace: undefined, isQuickChat: true },
			announced: true,
			healedInPlace: true,
		});
	}));

	test('authoritative session state converts a quick chat to a workspace session in place', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const scratchDirectory = URI.file('/tmp/copilot-scratch/quick-converted');
		const workspaceDirectory = URI.file('/home/user/project');
		agentHost.addSession(createSession('quick-converted', {
			summary: 'Quick Chat',
			workingDirectory: scratchDirectory,
			quickChat: true,
		}));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions()[0] as AgentHostSessionAdapter;
		provider.getSessionConfig(session.sessionId);
		const sessionUri = AgentSession.uri('copilotcli', 'quick-converted').toString();
		const defaultChat = buildDefaultChatUri(sessionUri);
		agentHost.setSessionState('quick-converted', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Quick Chat',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			defaultChat,
			workingDirectories: [scratchDirectory.toString()],
			_meta: withSessionWorkspaceless(undefined, true),
			chats: [{ resource: defaultChat, title: '', status: ProtocolSessionStatus.Idle, modifiedAt: new Date(0).toISOString() }],
		});
		const observed: Array<{ isQuickChat: boolean | undefined; workspace: string | undefined }> = [];
		disposables.add(autorun(reader => {
			observed.push({
				isQuickChat: session.isQuickChat?.read(reader),
				workspace: session.workspace.read(reader)?.uri.toString(),
			});
		}));
		const changed: string[] = [];
		disposables.add(provider.onDidChangeSessions(event => changed.push(...event.changed.map(candidate => candidate.sessionId))));

		agentHost.setSessionState('quick-converted', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Quick Chat',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			defaultChat,
			workingDirectories: [workspaceDirectory.toString()],
			chats: [{ resource: defaultChat, title: '', status: ProtocolSessionStatus.Idle, modifiedAt: new Date(0).toISOString() }],
		});

		assert.deepStrictEqual({
			observed,
			workingDirectories: session.workingDirectories.map(directory => directory.toString()),
			announced: changed.includes(session.sessionId),
			sameAdapter: provider.getSessions()[0] === session,
		}, {
			observed: [
				{ isQuickChat: true, workspace: undefined },
				{ isQuickChat: false, workspace: workspaceDirectory.toString() },
			],
			workingDirectories: [workspaceDirectory.toString()],
			announced: true,
			sameAdapter: true,
		});
	}));

	test('isolated conversion groups by repository while running in the worktree', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const scratchDirectory = URI.file('/tmp/copilot-scratch/quick-isolated');
		const repository = URI.file('/home/user/project');
		const worktree = URI.file('/home/user/project.worktrees/implement-feature');
		agentHost.addSession(createSession('quick-isolated', {
			summary: 'Quick Chat',
			workingDirectory: scratchDirectory,
			quickChat: true,
		}));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions()[0];
		assert.ok(session);

		fireSessionSummaryChanged(agentHost, 'quick-isolated', {
			project: { uri: repository.toString(), displayName: 'project' },
			workingDirectories: [worktree.toString()],
			_meta: withSessionWorkspaceless(undefined, false),
		});
		await timeout(0);

		const workspace = session.workspace.get();
		assert.deepStrictEqual({
			isQuickChat: session.isQuickChat?.get(),
			workspace: workspace?.uri.toString(),
			folderRoot: workspace?.folders[0]?.root.toString(),
			workingDirectory: workspace?.folders[0]?.workingDirectory.toString(),
			workTreeUri: workspace?.folders[0]?.gitRepository?.workTreeUri?.toString(),
			sameAdapter: provider.getSessions()[0] === session,
		}, {
			isQuickChat: false,
			workspace: repository.toString(),
			folderRoot: repository.toString(),
			workingDirectory: worktree.toString(),
			workTreeUri: worktree.toString(),
			sameAdapter: true,
		});
	}));

	test('committed quick chat announced via sessionAdded stays workspace-less despite a scratch working directory', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Regression: when a quick-chat draft graduates, the host announces the
		// committed session via a `sessionAdded` notification whose summary
		// carries `_meta.workspaceless` — but also the scratch cwd the host
		// assigned. The adapter seeds its session-kind at construction, so the
		// tag should reach it here (not just via the later listSessions/state
		// channels), otherwise `workspace` leaks the scratch folder until a
		// later `_meta` heals it and the archive-on-delete fallback pre-fills a
		// new session with it.
		const provider = createProvider(disposables, agentHost);
		await timeout(0);

		fireSessionAdded(agentHost, 'quick-committed', {
			title: 'Quick Chat',
			workingDirectory: URI.file('/tmp/copilot-scratch/quick-committed').toString(),
			workspaceless: true,
		});

		const session = provider.getSessions().find(s => AgentSession.id(s.resource.toString()) === 'quick-committed');
		assert.deepStrictEqual({
			workspace: session?.workspace.get(),
			isQuickChat: session?.isQuickChat?.get(),
		}, {
			workspace: undefined,
			isQuickChat: true,
		});
	}));

	test('createNewSession clears session config when resolving config is unavailable', async () => {
		agentHost.failResolveSessionConfig = true;
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, config => config === undefined);

		assert.strictEqual(provider.getSessionConfig(session.sessionId), undefined);
	});

	test('enables a preferred Dev Container after asynchronous availability resolves', async () => {
		const availability = new DeferredPromise<boolean>();
		const provider = createProvider(disposables, agentHost, undefined, {
			devContainerAgentHostService: new class extends mock<IDevContainerAgentHostService>() {
				override async isAvailable(): Promise<boolean> {
					return availability.p;
				}
			}(),
		});
		const session = provider.createNewSession(
			URI.file('/home/user/project'),
			provider.sessionTypes[0].id,
		);
		provider.preferDevContainer(session.sessionId);
		const beforeResolution = provider.isDevContainerEnabled(session.sessionId);
		availability.complete(true);
		await timeout(0);

		assert.deepStrictEqual({
			beforeResolution,
			available: provider.isDevContainerAvailable(session.sessionId),
			enabled: provider.isDevContainerEnabled(session.sessionId),
		}, {
			beforeResolution: false,
			available: true,
			enabled: true,
		});
	});

	test('enables a preferred Dev Container immediately after availability resolved', async () => {
		const provider = createProvider(disposables, agentHost, undefined, {
			devContainerAgentHostService: new class extends mock<IDevContainerAgentHostService>() {
				override async isAvailable(): Promise<boolean> {
					return true;
				}
			}(),
		});
		const session = provider.createNewSession(
			URI.file('/home/user/project'),
			provider.sessionTypes[0].id,
		);
		await timeout(0);
		provider.preferDevContainer(session.sessionId);

		assert.deepStrictEqual({
			available: provider.isDevContainerAvailable(session.sessionId),
			enabled: provider.isDevContainerEnabled(session.sessionId),
		}, {
			available: true,
			enabled: true,
		});
	});

	test('does not enable a preferred Dev Container when unavailable or canceled', async () => {
		const unavailable = new DeferredPromise<boolean>();
		const canceled = new DeferredPromise<boolean>();
		let call = 0;
		const provider = createProvider(disposables, agentHost, undefined, {
			devContainerAgentHostService: new class extends mock<IDevContainerAgentHostService>() {
				override async isAvailable(): Promise<boolean> {
					return ++call === 1 ? unavailable.p : canceled.p;
				}
			}(),
		});
		const unavailableSession = provider.createNewSession(URI.file('/unavailable'), provider.sessionTypes[0].id);
		provider.preferDevContainer(unavailableSession.sessionId);
		unavailable.complete(false);
		await timeout(0);

		const canceledSession = provider.createNewSession(URI.file('/canceled'), provider.sessionTypes[0].id);
		provider.preferDevContainer(canceledSession.sessionId);
		provider.setDevContainerEnabled(canceledSession.sessionId, false);
		canceled.complete(true);
		await timeout(0);

		assert.deepStrictEqual({
			unavailableAvailable: provider.isDevContainerAvailable(unavailableSession.sessionId),
			unavailableEnabled: provider.isDevContainerEnabled(unavailableSession.sessionId),
			canceledAvailable: provider.isDevContainerAvailable(canceledSession.sessionId),
			canceledEnabled: provider.isDevContainerEnabled(canceledSession.sessionId),
		}, {
			unavailableAvailable: false,
			unavailableEnabled: false,
			canceledAvailable: true,
			canceledEnabled: false,
		});
	});

	test('prepareNewSession does not start a Dev Container when workspace trust is denied', async () => {
		let connectCalls = 0;
		const devContainerAgentHostService = new class extends mock<IDevContainerAgentHostService>() {
			override async isAvailable(): Promise<boolean> { return true; }
			override async connect(): Promise<never> {
				connectCalls++;
				throw new Error('unexpected connect');
			}
		}();
		const provider = createProvider(disposables, agentHost, undefined, {
			devContainerAgentHostService,
			requestWorkspaceTrust: async () => false,
		});
		const session = provider.createNewSession(URI.file('/home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);
		provider.setDevContainerEnabled(session.sessionId, true);

		await assert.rejects(
			provider.prepareNewSession(session.sessionId, CancellationToken.None, 'hello'),
			WorkspaceNotTrustedError,
		);
		assert.strictEqual(connectCalls, 0);
	});

	test('prepareNewSession releases the Dev Container connection when post-connect setup fails', async () => {
		const remoteWorkspace = URI.parse('agent-host://devcontainer/workspaces/project');
		const setupError = new Error('failed to trust mapped workspace');
		let releaseCalls = 0;
		const devContainerAgentHostService = new class extends mock<IDevContainerAgentHostService>() {
			override async isAvailable(): Promise<boolean> { return true; }
			override async connect() {
				return {
					providerId: 'agenthost-devcontainer',
					workspaceUri: remoteWorkspace,
					release: async () => { releaseCalls++; },
				};
			}
		}();
		const provider = createProvider(disposables, agentHost, undefined, {
			devContainerAgentHostService,
			setUrisTrust: async uris => {
				if (uris.some(uri => uri.toString() === remoteWorkspace.toString())) {
					throw setupError;
				}
			},
		});
		const session = provider.createNewSession(URI.file('/home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);
		provider.setDevContainerEnabled(session.sessionId, true);

		await assert.rejects(
			provider.prepareNewSession(session.sessionId, CancellationToken.None, 'hello'),
			error => error === setupError,
		);
		assert.deepStrictEqual({
			releaseCalls,
			deletedDetachedWorktrees: agentHost.deletedDetachedWorktrees,
		}, {
			releaseCalls: 1,
			deletedDetachedWorktrees: ['00000000-0000-4000-8000-000000000001'],
		});
	});

	test('prepareNewSession routes an enabled Dev Container draft to the connected provider', async () => {
		agentHost.resolveSessionConfigResult = {
			schema: {
				type: 'object',
				properties: {
					isolation: { type: 'string', title: 'Isolation' },
					mode: { type: 'string', title: 'Mode' },
					localOnly: { type: 'string', title: 'Local Only' },
				},
			},
			values: { isolation: 'worktree', mode: 'interactive', localOnly: 'value' },
		};
		const remoteWorkspace = URI.parse('agent-host://devcontainer/workspaces/project');
		const targetProviderId = 'agenthost-devcontainer';
		const state: { provider?: LocalAgentHostSessionsProvider; replacement?: ISession } = {};
		let connectedWorkspace: URI | undefined;
		let releaseCalls = 0;
		const trustedTargetUris: string[] = [];
		const deletedTargetDrafts: string[] = [];
		const transferredConfig: [string, unknown][] = [];
		const sourceModelId = 'agent-host-copilotcli:gpt-5';
		const targetModelId = 'agent-host-devcontainer-copilotcli:gpt-5';
		const selectedTargetModels: [string, URI, string, ChatModelSource][] = [];
		const selectedTargetAgents: [string, string, string][] = [];
		let targetMetadata: Record<string, unknown> | undefined;
		const sourceAgentUri = 'file:///home/user/project/.github/agents/reviewer.agent.md';
		const targetAgent: AgentCustomization = {
			type: CustomizationType.Agent,
			id: 'reviewer',
			uri: 'file:///workspaces/project/.github/agents/reviewer.agent.md',
			name: 'Reviewer',
		};
		const targetProvider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = targetProviderId;
			override readonly onDidChangeSessionConfig = Event.None;
			override getSessionTypes() {
				assert.ok(state.provider);
				return [...state.provider.sessionTypes];
			}
			override createNewSession(workspaceUri: URI, _sessionTypeId: string, options?: ISessionsProviderCreateSessionOptions): ISession {
				assert.strictEqual(workspaceUri.toString(), remoteWorkspace.toString());
				targetMetadata = options?.metadata;
				assert.ok(state.replacement);
				return state.replacement;
			}
			override async setSessionConfigValue(_sessionId: string, property: string, value: unknown): Promise<void> {
				transferredConfig.push([property, value]);
			}
			override deleteNewSession(sessionId: string): void {
				deletedTargetDrafts.push(sessionId);
			}
			override isSessionConfigResolving() { return constObservable(false); }
			override getSessionConfig(): ResolveSessionConfigResult {
				return {
					schema: {
						type: 'object',
						properties: {
							isolation: { type: 'string', title: 'Isolation' },
							mode: { type: 'string', title: 'Mode' },
						},
					},
					values: { mode: 'interactive' },
				};
			}
			override getModelsSnapshot() {
				return {
					models: [{
						identifier: targetModelId,
						metadata: {
							...createTestLanguageModel('gpt-5'),
							vendor: 'agent-host-devcontainer-copilotcli',
							targetChatSessionType: 'remote-devcontainer-copilot',
						},
					}],
					desiredModelResolution: { kind: 'notRequested' } as const,
					modelTarget: 'remote-devcontainer-copilot',
				};
			}
			override setModel(sessionId: string, chatResource: URI, modelId: string, source: ChatModelSource): void {
				selectedTargetModels.push([sessionId, chatResource, modelId, source]);
			}
			override getCustomAgents(): readonly AgentCustomization[] {
				return [targetAgent];
			}
			override setAgent(sessionId: string, agent: { readonly uri: string; readonly name: string } | undefined): void {
				if (agent) {
					selectedTargetAgents.push([sessionId, agent.uri, agent.name]);
				}
			}
		}();
		const sessionsProvidersService = new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
				return providerId === targetProviderId ? targetProvider as unknown as T : undefined;
			}
		}();
		const devContainerAgentHostService = new class extends mock<IDevContainerAgentHostService>() {
			override async isAvailable(): Promise<boolean> {
				return true;
			}
			override async connect(workspaceUri: URI) {
				connectedWorkspace = workspaceUri;
				return {
					providerId: targetProviderId,
					workspaceUri: remoteWorkspace,
					release: async () => { releaseCalls++; },
				};
			}
		}();
		const provider = createProvider(disposables, agentHost, undefined, {
			devContainerAgentHostService,
			sessionsProvidersService,
			languageModelIds: [sourceModelId],
			lookupLanguageModel: id => id === sourceModelId
				? { ...createTestLanguageModel('gpt-5'), targetChatSessionType: 'agent-host-copilotcli' }
				: undefined,
			setUrisTrust: async (uris, trusted) => {
				assert.strictEqual(trusted, true);
				trustedTargetUris.push(...uris.map(uri => uri.toString()));
			},
		});
		state.provider = provider;
		const source = provider.createNewSession(URI.file('/home/user/project'), provider.sessionTypes[0].id);
		const sourceBackendSession = AgentSession.uri(provider.sessionTypes[0].id, AgentSession.id(source.resource));
		await waitForSessionConfig(provider, source.sessionId, config => config?.values.mode === 'interactive');
		await timeout(0);
		const replacementResource = URI.parse('remote-devcontainer-copilot:///replacement');
		const replacementChat = { ...source.mainChat.get(), resource: replacementResource };
		const replacement = {
			...source,
			sessionId: `${targetProviderId}:${replacementResource.toString()}`,
			providerId: targetProviderId,
			resource: replacementResource,
			mainChat: constObservable(replacementChat),
			chats: constObservable([replacementChat]),
		};
		state.replacement = replacement;

		provider.setModel(source.sessionId, source.mainChat.get().resource, sourceModelId, ChatModelSource.Chosen);
		provider.setAgent(source.sessionId, { uri: sourceAgentUri, name: 'Reviewer' });
		provider.setDevContainerEnabled(source.sessionId, true);
		const prepared = await provider.prepareNewSession(source.sessionId, CancellationToken.None, 'Fix the issue');
		provider.deleteNewSession(source.sessionId);
		await prepared.discard?.();

		assert.deepStrictEqual({
			available: provider.isDevContainerAvailable(source.sessionId),
			enabled: provider.isDevContainerEnabled(source.sessionId),
			connectedWorkspace: connectedWorkspace?.toString(),
			preparedSessionId: prepared.session.sessionId,
			transferredConfig,
			selectedTargetModels,
			selectedTargetAgents,
			createdWorktree: agentHost.createDetachedWorktreeCalls.map(call => ({ session: call.session.toString(), prompt: call.prompt })),
			targetMetadata,
			claimedDetachedWorktrees: agentHost.claimedDetachedWorktrees,
			ownerDisposed: agentHost.disposedSessions.map(uri => uri.toString()),
			deletedDetachedWorktrees: agentHost.deletedDetachedWorktrees,
			deletedTargetDrafts,
			releaseCalls,
			trustedTargetUris,
		}, {
			available: false,
			enabled: false,
			connectedWorkspace: agentHost.preparedSessionWorktree.toString(),
			preparedSessionId: replacement.sessionId,
			transferredConfig: [['isolation', 'folder'], ['mode', 'interactive']],
			selectedTargetModels: [[replacement.sessionId, replacementResource, targetModelId, ChatModelSource.Chosen]],
			selectedTargetAgents: [[replacement.sessionId, targetAgent.uri, targetAgent.name]],
			createdWorktree: [{ session: sourceBackendSession.toString(), prompt: 'Fix the issue' }],
			targetMetadata: {
				'vscode.devContainerWorktree': {
					version: 1,
					handle: '00000000-0000-4000-8000-000000000001',
				},
			},
			claimedDetachedWorktrees: ['00000000-0000-4000-8000-000000000001'],
			ownerDisposed: [sourceBackendSession.toString()],
			deletedDetachedWorktrees: ['00000000-0000-4000-8000-000000000001'],
			deletedTargetDrafts: [replacement.sessionId],
			releaseCalls: 1,
			trustedTargetUris: [agentHost.preparedSessionWorktree.toString(), remoteWorkspace.toString()],
		});
	});

	test('createNewSession maps allowAll from chat.defaultConfiguration to autoApprove', async () => {
		const config = new TestConfigurationService();
		await config.setUserConfiguration('chat.defaultConfiguration', { approvals: 'allowAll' });
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: { autoApprove: { type: 'string', enum: ['default', 'autoApprove'], title: 'Auto-approve' } } },
			values: { autoApprove: 'autoApprove' },
		};
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: config });
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, c => c?.values.autoApprove === 'autoApprove');

		assert.deepStrictEqual({
			seededImmediately: provider.getSessionConfig(session.sessionId)?.values.autoApprove,
			forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove,
		}, {
			seededImmediately: 'autoApprove',
			forwardedToAgentHost: 'autoApprove',
		});
	});

	test('createNewSession seeds mode from chat.defaultConfiguration and forwards it to resolveSessionConfig', async () => {
		const config = new TestConfigurationService();
		await config.setUserConfiguration('chat.defaultConfiguration', { mode: 'autopilot' });
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: config });
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, c => c?.values.mode === 'autopilot');

		assert.deepStrictEqual({
			seededImmediately: provider.getSessionConfig(session.sessionId)?.values.mode,
			forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config?.mode,
		}, {
			seededImmediately: 'autopilot',
			forwardedToAgentHost: 'autopilot',
		});
	});

	test('createNewSession forwards seeded config to eager createSession', async () => {
		const config = new TestConfigurationService();
		await config.setUserConfiguration('chat.defaultConfiguration', { approvals: 'allowAll' });
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { autoApprove: 'autoApprove' },
		};
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: config });
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.deepStrictEqual(agentHost.createSessionConfigs[0]?.config, { autoApprove: 'autoApprove' });
	});

	test('createNewSession does not seed autoApprove when chat.defaultConfiguration approvals is manual', () => {
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);

		assert.deepStrictEqual({
			initialValues: provider.getSessionConfig(session.sessionId)?.values,
			forwardedAutoApprove: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove,
		}, {
			initialValues: {},
			forwardedAutoApprove: undefined,
		});
	});

	test('createNewSession clamps seeded autoApprove to default when policy disables global auto-approve', async () => {
		const config = createPolicyRestrictedConfigurationService();
		await config.setUserConfiguration('chat.defaultConfiguration', { approvals: 'allowAll' });
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: config });
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);

		assert.deepStrictEqual({
			seededImmediately: provider.getSessionConfig(session.sessionId)?.values.autoApprove,
			forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove,
		}, {
			seededImmediately: 'default',
			forwardedToAgentHost: 'default',
		});
	});

	test('setSessionConfigValue remembers portable string picks and drops non-remembered keys', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
			[SessionConfigKey.Branch]: 'legacy-branch',
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
		const provider = createProvider(disposables, agentHost, undefined, { storageService });
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, () => !provider.isSessionConfigResolving(session.sessionId).get());

		await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Isolation, 'folder');
		await provider.setSessionConfigValue(session.sessionId, '__proto__', 'polluted');

		assert.deepStrictEqual(
			storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {}),
			{ [SessionConfigKey.Isolation]: 'folder' },
		);
	});

	test('draft config refresh stays local and send waits for the resolved values', async () => {
		let sendCalls = 0;
		let sentConfig: Record<string, unknown> | undefined;
		const provider = createProvider(disposables, agentHost, undefined, {
			openSession: true,
			sendRequest: async (_resource, _message, options): Promise<ChatSendResult> => {
				sendCalls++;
				sentConfig = options?.agentHostSessionConfig;
				agentHost.addSession(createSession('config-resolved-send', { summary: 'Config Resolved' }));
				return { kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never };
			},
		});
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.isolation === 'worktree');
		const chat = await provider.createNewChat(session.sessionId);

		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { isolation: 'folder' },
		};
		const barrier = agentHost.resolveSessionConfigBarrier = new DeferredPromise<void>();
		const configRefresh = provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Isolation, 'folder');
		const send = provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' });
		const pending = {
			loading: session.loading.get(),
			resolving: provider.isSessionConfigResolving(session.sessionId).get(),
			sendCalls,
		};

		await barrier.complete();
		await configRefresh;
		const committed = await send;

		assert.deepStrictEqual({
			pending,
			resolved: {
				sendCalls,
				sentConfig,
				title: committed.title.get(),
			},
		}, {
			pending: {
				loading: false,
				resolving: true,
				sendCalls: 0,
			},
			resolved: {
				sendCalls: 1,
				sentConfig: { isolation: 'folder' },
				title: 'Config Resolved',
			},
		});
	});

	test('serializes draft config writes instead of dropping selections during resolution', async () => {
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.isolation === 'worktree');
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { isolation: 'folder' },
		};
		const barrier = agentHost.resolveSessionConfigBarrier = new DeferredPromise<void>();

		const isolationUpdate = provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Isolation, 'folder');
		const branchUpdate = provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Branch, 'feature');
		await timeout(0);
		const requestsWhileResolving = agentHost.resolveSessionConfigRequests.slice(-1).map(request => request.config);

		barrier.complete();
		await Promise.all([isolationUpdate, branchUpdate]);

		assert.deepStrictEqual({
			requestsWhileResolving,
			finalRequests: agentHost.resolveSessionConfigRequests.slice(-2).map(request => request.config),
		}, {
			requestsWhileResolving: [{ isolation: 'folder' }],
			finalRequests: [
				{ isolation: 'folder' },
				{ isolation: 'folder', branch: 'feature' },
			],
		});
	});

	test('first send waits for tracked draft config operations', async () => {
		let sendCalls = 0;
		const provider = createProvider(disposables, agentHost, undefined, {
			openSession: true,
			sendRequest: async (): Promise<ChatSendResult> => {
				sendCalls++;
				agentHost.addSession(createSession('config-operation-send', { summary: 'Config Operation' }));
				return { kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never };
			},
		});
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.isolation === 'worktree');
		const chat = await provider.createNewChat(session.sessionId);
		const barrier = new DeferredPromise<void>();
		provider.trackSessionConfigOperation(session.sessionId, barrier.p);

		const send = provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' });
		await timeout(0);
		const pendingSendCalls = sendCalls;

		barrier.complete();
		const committed = await send;

		assert.deepStrictEqual({
			pendingSendCalls,
			sendCalls,
			title: committed.title.get(),
		}, {
			pendingSendCalls: 0,
			sendCalls: 1,
			title: 'Config Operation',
		});
	});

	test('first send waits for trusted eager backend creation', async () => {
		const workspaceTrustBarrier = new DeferredPromise<void>();
		let sendCalls = 0;
		let statusAtLoad: SessionStatus | undefined;
		let wireOpsAtLoad: string[] | undefined;
		let wireOpsAtSend: string[] = [];
		const sessionRef: { value?: ISession } = {};
		const provider = createProvider(disposables, agentHost, undefined, {
			openSession: true,
			workspaceTrustBarrier,
			acquireOrLoadSession: async () => {
				statusAtLoad = sessionRef.value?.status.get();
				wireOpsAtLoad = [...agentHost.wireOps];
				return undefined;
			},
			sendRequest: async (): Promise<ChatSendResult> => {
				sendCalls++;
				wireOpsAtSend = [...agentHost.wireOps];
				agentHost.addSession(createSession('eager-created-send', { summary: 'Eager Created' }));
				return { kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never };
			},
		});
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		sessionRef.value = session;
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.isolation === 'worktree');
		const chat = await provider.createNewChat(session.sessionId);
		const send = provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' });
		await timeout(0);

		const pending = {
			sendCalls,
			statusAtLoad,
			wireOpsAtLoad,
			wireOps: [...agentHost.wireOps],
		};

		workspaceTrustBarrier.complete();
		const committed = await send;
		const backendKey = AgentSession.uri(provider.sessionTypes[0].id, session.resource.path.substring(1)).toString();

		assert.deepStrictEqual({
			pending,
			resolved: {
				sendCalls,
				statusAtLoad,
				wireOpsAtLoad: wireOpsAtLoad?.filter(op => op.endsWith(backendKey)),
				wireOpsAtSend: wireOpsAtSend.filter(op => op.endsWith(backendKey)),
				title: committed.title.get(),
			},
		}, {
			pending: {
				sendCalls: 0,
				statusAtLoad: undefined,
				wireOpsAtLoad: undefined,
				wireOps: [],
			},
			resolved: {
				sendCalls: 1,
				statusAtLoad: SessionStatus.Untitled,
				wireOpsAtLoad: [`createSession:${backendKey}`, `subscribe:${backendKey}`],
				wireOpsAtSend: [`createSession:${backendKey}`, `subscribe:${backendKey}`],
				title: 'Eager Created',
			},
		});
	});

	test('first send falls back when eager workspace trust lookup fails', async () => {
		let sendCalls = 0;
		const provider = createProvider(disposables, agentHost, undefined, {
			openSession: true,
			workspaceTrustError: new Error('trust lookup failed'),
			sendRequest: async (): Promise<ChatSendResult> => {
				sendCalls++;
				agentHost.addSession(createSession('trust-fallback-send', { summary: 'Trust Fallback' }));
				return { kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never };
			},
		});
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.isolation === 'worktree');
		const chat = await provider.createNewChat(session.sessionId);
		const committed = await provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' });

		assert.deepStrictEqual({
			sendCalls,
			eagerCreateCalls: agentHost.createdSessionUris.length,
			title: committed.title.get(),
		}, {
			sendCalls: 1,
			eagerCreateCalls: 0,
			title: 'Trust Fallback',
		});
	});

	test('draft disposal cancels a send waiting for config resolution', async () => {
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.isolation === 'worktree');
		const chat = await provider.createNewChat(session.sessionId);

		const barrier = agentHost.resolveSessionConfigBarrier = new DeferredPromise<void>();
		const configRefresh = provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Isolation, 'folder');
		const send = provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' });
		await Promise.resolve();
		provider.deleteNewSession(session.sessionId);

		try {
			await assert.rejects(raceTimeout(send, 100), /Canceled/);
		} finally {
			await barrier.complete();
			await configRefresh;
		}
	});

	test('maps the existing isolation setter to agent-host config without remembering it', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { isolation: 'worktree', branch: 'feature' },
		};
		const provider = createProvider(disposables, agentHost, undefined, { storageService });
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.branch === 'feature');
		const firstAutomationRequest = agentHost.resolveSessionConfigRequests.length;

		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { isolation: 'folder', branch: 'feature' },
		};
		await provider.setIsolationMode(session.sessionId, 'workspace');

		assert.deepStrictEqual({
			supportsWorktreeConfiguration: provider.sessionTypes[0].supportsWorktreeConfiguration,
			requests: agentHost.resolveSessionConfigRequests.slice(firstAutomationRequest).map(request => request.config),
			remembered: storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {}),
		}, {
			supportsWorktreeConfiguration: true,
			requests: [
				{ isolation: 'folder' },
			],
			remembered: {},
		});
	});

	test('resets the branch to the isolation default when New Worktree is toggled', async () => {
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { isolation: 'worktree', branch: 'main' },
		};
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.branch === 'main');
		const firstToggleRequest = agentHost.resolveSessionConfigRequests.length;

		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { isolation: 'folder', branch: 'feature' },
		};
		await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Isolation, 'folder');

		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { isolation: 'worktree', branch: 'main' },
		};
		await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Isolation, 'worktree');

		assert.deepStrictEqual({
			requests: agentHost.resolveSessionConfigRequests.slice(firstToggleRequest).map(request => request.config),
			config: provider.getCreateSessionConfig(session.sessionId),
		}, {
			requests: [
				{ isolation: 'folder' },
				{ isolation: 'worktree' },
			],
			config: { isolation: 'worktree', branch: 'main' },
		});
	});

	test('maps the programmatic branch tracking setter to hidden agent-host config without remembering it', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const provider = createProvider(disposables, agentHost, undefined, { storageService });
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);
		const firstAutomationRequest = agentHost.resolveSessionConfigRequests.length;

		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { [SessionConfigKey.WorktreeBranchTrack]: false },
		};
		await provider.setWorktreeBranchTrack(session.sessionId, false);

		assert.deepStrictEqual({
			requests: agentHost.resolveSessionConfigRequests.slice(firstAutomationRequest).map(request => request.config),
			createSessionConfig: provider.getCreateSessionConfig(session.sessionId),
			remembered: storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {}),
		}, {
			requests: [
				{
					[SessionConfigKey.Isolation]: 'worktree',
					[SessionConfigKey.WorktreeBranchTrack]: false,
				},
			],
			createSessionConfig: { [SessionConfigKey.WorktreeBranchTrack]: false },
			remembered: {},
		});
	});

	test('applies programmatic worktree configuration in one resolve without waiting for the startup resolve', async () => {
		const barrier = agentHost.resolveSessionConfigBarrier = new DeferredPromise<void>();
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.WorktreeBranchTrack]: true,
				[SessionConfigKey.WorktreeCreateNewBranch]: false,
				[SessionConfigKey.Branch]: 'feature/pull-request',
			},
		};

		const setting = provider.setWorktreeConfiguration(session.sessionId, {
			isolationMode: 'worktree',
			worktreeBranchTrack: true,
			worktreeCreateNewBranch: false,
			branch: 'feature/pull-request',
		});
		await timeout(0);
		const requestsBeforeResolve = agentHost.resolveSessionConfigRequests.map(request => request.config);
		await barrier.complete();
		await setting;

		assert.deepStrictEqual({
			requestsBeforeResolve,
			config: provider.getCreateSessionConfig(session.sessionId),
		}, {
			requestsBeforeResolve: [
				{},
				{
					[SessionConfigKey.Isolation]: 'worktree',
					[SessionConfigKey.WorktreeBranchTrack]: true,
					[SessionConfigKey.WorktreeCreateNewBranch]: false,
					[SessionConfigKey.Branch]: 'feature/pull-request',
				},
			],
			config: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.WorktreeBranchTrack]: true,
				[SessionConfigKey.WorktreeCreateNewBranch]: false,
				[SessionConfigKey.Branch]: 'feature/pull-request',
			},
		});
	});

	test('rejects branch configuration when agent-host resolution fails', async () => {
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);
		agentHost.failResolveSessionConfig = true;

		await assert.rejects(() => provider.setBranch(session.sessionId, 'feature/automation'), /resolveSessionConfig unavailable/);
		assert.strictEqual(provider.getCreateSessionConfig(session.sessionId), undefined);
	});

	test('rejects isolation configuration when the final resolve changes the requested value', async () => {
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { isolation: 'folder', branch: 'feature/automation' },
		};

		await assert.rejects(() => provider.setIsolationMode(session.sessionId, 'worktree'), /did not apply session config 'isolation'/);
	});

	test('cancels repository configuration when the draft is disposed during initial resolve', async () => {
		const barrier = agentHost.resolveSessionConfigBarrier = new DeferredPromise<void>();
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		const setting = provider.setIsolationMode(session.sessionId, 'worktree');
		await Promise.resolve();
		provider.deleteNewSession(session.sessionId);

		try {
			await assert.rejects(raceTimeout(setting, 100), /Canceled/);
		} finally {
			await barrier.complete();
		}
	});

	test('waits for authentication and startup config resolution before repository configuration', async () => {
		agentHost.setAuthenticationPending(true);
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { isolation: 'worktree', branch: 'feature/automation' },
		};

		const setting = provider.setBranch(session.sessionId, 'feature/automation');
		await Promise.resolve();
		assert.strictEqual(agentHost.resolveSessionConfigRequests.length, 0);

		agentHost.setAuthenticationPending(false);
		await setting;

		assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.map(request => request.config), [
			{},
			{ isolation: 'worktree', branch: 'feature/automation' },
		]);
	});

	test('setSessionConfigValue clamps autoApprove to default when policy disables global auto-approve', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const config = createPolicyRestrictedConfigurationService();
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: config, storageService });
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.AutoApprove, 'autopilot');

		assert.deepStrictEqual({
			remembered: storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {}),
			forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove,
		}, {
			remembered: { [SessionConfigKey.AutoApprove]: 'default' },
			forwardedToAgentHost: 'default',
		});
	});

	test('branch selection stays on the current workspace and the next workspace resolves its own branch', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { isolation: 'worktree', branch: 'main-a' },
		};
		const provider = createProvider(disposables, agentHost, undefined, { storageService });
		const sessionA = provider.createNewSession(URI.parse('file:///workspace-a'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, sessionA.sessionId, config => config?.values.branch === 'main-a');

		await provider.setSessionConfigValue(sessionA.sessionId, SessionConfigKey.Branch, 'feature-a');
		const branchSelectionRequest = agentHost.resolveSessionConfigRequests.at(-1)?.config;
		await provider.setSessionConfigValue(sessionA.sessionId, SessionConfigKey.Isolation, 'folder');
		provider.deleteNewSession(sessionA.sessionId);

		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { isolation: 'folder', branch: 'current-b' },
		};
		const requestCountBeforeWorkspaceB = agentHost.resolveSessionConfigRequests.length;
		const sessionB = provider.createNewSession(URI.parse('file:///workspace-b'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, sessionB.sessionId, config => config?.values.branch === 'current-b');

		assert.deepStrictEqual({
			branchSelectionRequest,
			rememberedValues: storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {}),
			workspaceBRequest: agentHost.resolveSessionConfigRequests[requestCountBeforeWorkspaceB]?.config,
			workspaceBResolved: provider.getSessionConfig(sessionB.sessionId)?.values,
		}, {
			branchSelectionRequest: { isolation: 'worktree', branch: 'feature-a' },
			rememberedValues: { isolation: 'folder' },
			workspaceBRequest: { isolation: 'folder' },
			workspaceBResolved: { isolation: 'folder', branch: 'current-b' },
		});
	});

	test('caches resolved isolation/branch schema and seeds it into the next draft', async () => {
		agentHost.resolveSessionConfigResult = {
			schema: {
				type: 'object',
				properties: {
					[SessionConfigKey.Isolation]: { title: 'Isolation', type: 'string', enum: ['folder', 'worktree'], default: 'worktree' },
					[SessionConfigKey.Branch]: { title: 'Base Branch', type: 'string', enum: ['main'] },
				},
			},
			values: { [SessionConfigKey.Isolation]: 'worktree' },
		} as ResolveSessionConfigResult;
		const provider = createProvider(disposables, agentHost);

		const first = provider.createNewSession(URI.parse('file:///home/user/a'), provider.sessionTypes[0].id);
		await timeout(0); // let the first draft resolve so the provider caches the chips
		assert.ok(first);

		// The next draft momentarily reports an empty schema while it re-resolves...
		agentHost.resolveSessionConfigResult = { schema: { type: 'object', properties: {} }, values: {} } as ResolveSessionConfigResult;
		const second = provider.createNewSession(URI.parse('file:///home/user/b'), provider.sessionTypes[0].id);

		// ...but is seeded with the cached chips so they stay visible instead of blanking.
		const seededKeys = Object.keys(provider.getSessionConfig(second.sessionId)?.schema.properties ?? {}).sort();

		await timeout(0); // let the empty resolve land, replacing the seed and pruning the cache
		const afterResolveKeys = Object.keys(provider.getSessionConfig(second.sessionId)?.schema.properties ?? {});

		// A subsequent draft is no longer seeded — the empty resolve pruned the cache.
		const third = provider.createNewSession(URI.parse('file:///home/user/c'), provider.sessionTypes[0].id);
		const thirdSeededKeys = Object.keys(provider.getSessionConfig(third.sessionId)?.schema.properties ?? {});

		assert.deepStrictEqual({ seededKeys, afterResolveKeys, thirdSeededKeys }, {
			seededKeys: [SessionConfigKey.Branch, SessionConfigKey.Isolation],
			afterResolveKeys: [],
			thirdSeededKeys: [],
		});
	});

	test('createNewSession forwards git.worktreeIncludeFiles as derived session config', () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('git.worktreeIncludeFiles', ['product.overrides.json', '**/node_modules/**']);
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService });
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);

		assert.deepStrictEqual({
			seededImmediately: provider.getSessionConfig(session.sessionId)?.values,
			forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config,
		}, {
			seededImmediately: { worktreeIncludeFiles: ['product.overrides.json', '**/node_modules/**'] },
			forwardedToAgentHost: { worktreeIncludeFiles: ['product.overrides.json', '**/node_modules/**'] },
		});
	});

	test('Automation drafts merge derived worktree settings with saved provider configuration', () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('git.branchPrefix', 'automation/');
		configService.setUserConfiguration('git.worktreeIncludeFiles', ['product.overrides.json']);
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService });
		const session = provider.createNewSession(
			URI.parse('file:///home/user/project'),
			provider.sessionTypes[0].id,
			{
				automationConfiguration: {
					sessionTemplate: {
						config: {
							mode: 'plan',
							autoApprove: 'assisted',
						},
					},
				},
			},
		);

		assert.deepStrictEqual({
			seededImmediately: provider.getSessionConfig(session.sessionId)?.values,
			forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config,
		}, {
			seededImmediately: {
				worktreeBranchPrefix: 'automation/',
				worktreeIncludeFiles: ['product.overrides.json'],
				mode: 'plan',
				autoApprove: 'assisted',
			},
			forwardedToAgentHost: {
				worktreeBranchPrefix: 'automation/',
				worktreeIncludeFiles: ['product.overrides.json'],
				mode: 'plan',
				autoApprove: 'assisted',
			},
		});
	});

	test('createNewSession gives remembered autoApprove precedence over a configured setting while policy still clamps', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
			[SessionConfigKey.AutoApprove]: 'autoApprove',
		}), StorageScope.PROFILE, StorageTarget.MACHINE);

		// Case 1: policy restricts auto-approve — remembered 'autoApprove' is clamped to 'default'
		const policyRestrictedConfig = createPolicyRestrictedConfigurationService();
		await policyRestrictedConfig.setUserConfiguration('chat.defaultConfiguration', { approvals: 'allowAll' });
		const policyRestrictedProvider = createProvider(disposables, agentHost, undefined, { configurationService: policyRestrictedConfig, storageService });
		policyRestrictedProvider.createNewSession(URI.parse('file:///home/user/project'), policyRestrictedProvider.sessionTypes[0].id);

		// Case 2: an ordinary configured setting is a plain default — the remembered pick wins over it
		const configuredDefaultConfig = new TestConfigurationService();
		await configuredDefaultConfig.setUserConfiguration('chat.defaultConfiguration', { approvals: 'manual' });
		const configuredDefaultProvider = createProvider(disposables, agentHost, undefined, { configurationService: configuredDefaultConfig, storageService });
		configuredDefaultProvider.createNewSession(URI.parse('file:///home/user/project'), configuredDefaultProvider.sessionTypes[0].id);

		assert.deepStrictEqual({
			policyRestricted: agentHost.resolveSessionConfigRequests.at(-2)?.config?.autoApprove,
			configuredDefault: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove,
		}, {
			policyRestricted: 'default',
			configuredDefault: 'autoApprove',
		});
	});

	test('createNewSession migrates a remembered legacy autoApprove=autopilot to mode=autopilot', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
			[SessionConfigKey.AutoApprove]: 'autopilot',
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
		const provider = createProvider(disposables, agentHost, undefined, { storageService });
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
			mode: 'autopilot',
			autoApprove: 'default',
		});
	});

	test('createNewSession restores and captures an Automation session template', async () => {
		const sessionTemplate = {
			modelId: 'agent-host-copilotcli:auto',
			modelConfiguration: { thinkingLevel: 'low', futureOption: true },
			agent: { uri: 'file:///agents/reviewer.agent.md' },
			config: {
				mode: 'plan',
				autoApprove: 'assisted',
				providerOption: { enabled: true },
				clearedOption: true,
				[SessionConfigKey.Permissions]: { allow: ['Shell(echo *)'], deny: [] },
				[SessionConfigKey.WorktreeBranchPrefix]: 'template-prefix/',
				[SessionConfigKey.WorktreeIncludeFiles]: ['template.json'],
				[SessionConfigKey.ShellInitScripts]: [{ shell: 'bash', script: 'source ~/.bashrc' }],
				[SessionConfigKey.AgentMerge]: true,
			},
		};
		agentHost.resolveSessionConfigResult = {
			schema: {
				type: 'object',
				properties: {
					clearedOption: { type: 'boolean', title: 'Cleared option' },
				},
			},
			values: {
				mode: 'plan',
				autoApprove: 'assisted',
				[SessionConfigKey.WorktreeBranchPrefix]: 'stale-prefix/',
				[SessionConfigKey.ShellInitScripts]: [{ shell: 'bash', script: 'source ~/.bashrc' }],
			},
		};
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(
			URI.parse('file:///home/user/project'),
			provider.sessionTypes[0].id,
			{ automationConfiguration: { sessionTemplate } },
		);
		await provider.getAutomationSessionConfiguration(session.sessionId);
		await provider.setSessionConfigValue(session.sessionId, 'clearedOption', false);
		const captured = await provider.getAutomationSessionConfiguration(session.sessionId);

		assert.deepStrictEqual({
			captured,
			initialConfig: agentHost.resolveSessionConfigRequests.at(-2)?.config,
			modelId: session.modelId.get(),
			agentUri: session.mode.get()?.id,
		}, {
			captured: {
				sessionTemplate: {
					...sessionTemplate,
					config: {
						mode: 'plan',
						autoApprove: 'assisted',
						providerOption: { enabled: true },
					},
				},
				modelId: sessionTemplate.modelId,
				mode: 'plan',
				permissionLevel: 'assisted',
			},
			initialConfig: {
				mode: 'plan',
				autoApprove: 'assisted',
				providerOption: { enabled: true },
				clearedOption: true,
			},
			modelId: sessionTemplate.modelId,
			agentUri: sessionTemplate.agent.uri,
		});
	});

	test('rejects Automation model configuration without a model before acquiring a draft', async () => {
		const provider = createProvider(disposables, agentHost);
		assert.throws(() => provider.createNewSession(URI.file('/home/user/project'), provider.sessionTypes[0].id, {
			automationConfiguration: { sessionTemplate: { modelConfiguration: { thinkingLevel: 'low' } } },
		}), /model configuration requires a model identifier/);
		await timeout(0);
		assert.deepStrictEqual(agentHost.createSessionConfigs, []);
	});

	test('Automation model options reach eager creation and the browser-executed first request', async () => {
		const modelId = 'agent-host-copilotcli:model';
		const metadata: ILanguageModelChatMetadata = {
			...createTestLanguageModel('model'),
			targetChatSessionType: 'agent-host-copilotcli',
			configurationSchema: {
				type: 'object',
				properties: { thinkingLevel: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' } },
			},
		};
		const sent: IChatSendRequestOptions[] = [];
		const sharedWrites: Record<string, unknown>[] = [];
		const provider = createProvider(disposables, agentHost, undefined, {
			languageModelIds: [modelId],
			lookupLanguageModel: () => metadata,
			languageModelsService: {
				getModelConfiguration: () => ({ thinkingLevel: 'high' }),
				setModelConfiguration: async (_modelId, values) => { sharedWrites.push(values); },
			},
			sendRequest: async (_resource, _message, options) => {
				if (options) {
					sent.push(options);
				}
				return { kind: 'rejected', reason: 'Test request captured' };
			},
		});
		const session = provider.createNewSession(URI.file('/home/user/project'), provider.sessionTypes[0].id, {
			automationConfiguration: {
				sessionTemplate: { modelId, modelConfiguration: { thinkingLevel: 'low', futureOption: true } },
			},
		});
		const captured = await provider.getAutomationSessionConfiguration(session.sessionId);
		const chat = await provider.createNewChat(session.sessionId);
		await assert.rejects(provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' }), /Test request captured/);

		assert.deepStrictEqual({
			eagerModel: agentHost.createSessionConfigs[0]?.model,
			captured: captured?.sessionTemplate?.modelConfiguration,
			sent: sent.map(options => ({ model: options.userSelectedModelId, configuration: options.userSelectedModelConfiguration })),
			sharedWrites,
		}, {
			eagerModel: { id: 'model', config: { thinkingLevel: 'low' } },
			captured: { thinkingLevel: 'low', futureOption: true },
			sent: [{ model: modelId, configuration: { thinkingLevel: 'low' } }],
			sharedWrites: [],
		});
	});

	test('Automation picker edits are captured independently and survive provider model qualification', async () => {
		const modelId = 'agent-host-copilotcli:model';
		const metadata: ILanguageModelChatMetadata = {
			...createTestLanguageModel('model'),
			targetChatSessionType: 'agent-host-copilotcli',
			configurationSchema: {
				type: 'object',
				properties: { thinkingLevel: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' } },
			},
		};
		const writes: Record<string, unknown>[] = [];
		const provider = createProvider(disposables, agentHost, undefined, {
			languageModelIds: [modelId],
			lookupLanguageModel: id => id === modelId ? metadata : id === 'model' ? { ...metadata, targetChatSessionType: 'copilotcli' } : undefined,
			languageModelsService: {
				getModelConfiguration: () => ({ thinkingLevel: 'high' }),
				setModelConfiguration: async (_modelId, values) => { writes.push(values); },
			},
		});
		const session = provider.createNewSession(URI.file('/home/user/project'), provider.sessionTypes[0].id, {
			automationConfiguration: { sessionTemplate: { modelId: 'model', modelConfiguration: { thinkingLevel: 'low' } } },
		});
		provider.setModel(session.sessionId, session.mainChat.get().resource, modelId, ChatModelSource.Chosen);
		const restored = await provider.getAutomationSessionConfiguration(session.sessionId);
		await provider.getAutomationModelConfiguration(session.sessionId)!.setModelConfiguration(modelId, { thinkingLevel: 'medium' });
		const edited = await provider.getAutomationSessionConfiguration(session.sessionId);
		provider.deleteNewSession(session.sessionId);

		assert.deepStrictEqual({
			restored: restored?.sessionTemplate?.modelConfiguration,
			edited: edited?.sessionTemplate?.modelConfiguration,
			writes,
		}, {
			restored: { thinkingLevel: 'low' },
			edited: { thinkingLevel: 'medium' },
			writes: [{ thinkingLevel: 'medium' }],
		});
	});

	test('Automation capture rejects failed initial configuration resolution', async () => {
		agentHost.failResolveSessionConfig = true;
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(
			URI.parse('file:///home/user/project'),
			provider.sessionTypes[0].id,
			{ automationConfiguration: { sessionTemplate: { config: { mode: 'plan' } } } },
		);

		await assert.rejects(provider.getAutomationSessionConfiguration(session.sessionId), /resolveSessionConfig unavailable/);
	});

	test('Automation capture retries failed resolution without dropping edited preferences', async () => {
		const initialConfig = { mode: 'interactive', autoApprove: 'default', providerOption: true };
		const updatedConfig = { ...initialConfig, mode: 'plan', autoApprove: 'assisted' };
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: initialConfig,
		};
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(
			URI.parse('file:///home/user/project'),
			provider.sessionTypes[0].id,
			{ automationConfiguration: { sessionTemplate: { config: initialConfig } } },
		);
		await provider.getAutomationSessionConfiguration(session.sessionId);

		agentHost.failResolveSessionConfig = true;
		await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Mode, 'plan');
		await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.AutoApprove, 'assisted');
		await assert.rejects(provider.getAutomationSessionConfiguration(session.sessionId), /resolveSessionConfig unavailable/);

		agentHost.failResolveSessionConfig = false;
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: updatedConfig,
		};
		const captured = await provider.getAutomationSessionConfiguration(session.sessionId);

		assert.deepStrictEqual({
			retriedConfig: agentHost.resolveSessionConfigRequests.at(-1)?.config,
			capturedConfig: captured?.sessionTemplate?.config,
			initialConfig,
		}, {
			retriedConfig: updatedConfig,
			capturedConfig: updatedConfig,
			initialConfig: { mode: 'interactive', autoApprove: 'default', providerOption: true },
		});
	});

	test('Automation capture waits for tracked configuration operations before reading values', async () => {
		const initialConfig = { mode: 'interactive' };
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: initialConfig,
		};
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(
			URI.parse('file:///home/user/project'),
			provider.sessionTypes[0].id,
			{ automationConfiguration: { sessionTemplate: { config: initialConfig } } },
		);
		await provider.getAutomationSessionConfiguration(session.sessionId);

		const barrier = new DeferredPromise<void>();
		const operation = (async () => {
			await barrier.p;
			agentHost.resolveSessionConfigResult = {
				schema: { type: 'object', properties: {} },
				values: { mode: 'plan' },
			};
			await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Mode, 'plan');
		})();
		provider.trackSessionConfigOperation(session.sessionId, operation);
		let captured = false;
		const capture = provider.getAutomationSessionConfiguration(session.sessionId).then(result => {
			captured = true;
			return result;
		});
		await timeout(0);
		const capturedBeforeOperation = captured;
		await barrier.complete();

		assert.deepStrictEqual({
			capturedBeforeOperation,
			config: (await capture)?.sessionTemplate?.config,
		}, {
			capturedBeforeOperation: false,
			config: { mode: 'plan' },
		});
	});

	test('createNewSession restores legacy Automation fields at the provider boundary', async () => {
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(
			URI.parse('file:///home/user/project'),
			provider.sessionTypes[0].id,
			{
				automationConfiguration: {
					modelId: 'agent-host-copilotcli:auto',
					mode: 'autopilot',
					permissionLevel: 'assisted',
				},
			},
		);
		const captured = await provider.getAutomationSessionConfiguration(session.sessionId);

		assert.deepStrictEqual({
			initialConfig: agentHost.resolveSessionConfigRequests.at(-1)?.config,
			modelId: session.modelId.get(),
			captured,
		}, {
			initialConfig: {
				mode: 'autopilot',
				autoApprove: 'assisted',
			},
			modelId: 'agent-host-copilotcli:auto',
			captured: {
				sessionTemplate: {
					modelId: 'agent-host-copilotcli:auto',
					config: {
						mode: 'autopilot',
						autoApprove: 'assisted',
					},
				},
				modelId: 'agent-host-copilotcli:auto',
				mode: 'autopilot',
				permissionLevel: 'assisted',
			},
		});
	});

	test('Automation drafts display policy-clamped approvals without overwriting the saved preference', async () => {
		const sessionTemplate = {
			config: {
				autoApprove: 'autoApprove',
			},
		};
		agentHost.resolveSessionConfigResult = {
			schema: {
				type: 'object',
				properties: {
					autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'] },
				},
			},
			values: { autoApprove: 'default' },
		};
		const provider = createProvider(disposables, agentHost, undefined, {
			configurationService: createPolicyRestrictedConfigurationService(),
		});
		const session = provider.createNewSession(
			URI.parse('file:///home/user/project'),
			provider.sessionTypes[0].id,
			{ automationConfiguration: { sessionTemplate } },
		);

		const capturedWithoutEdit = await provider.getAutomationSessionConfiguration(session.sessionId);
		await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.AutoApprove, 'default');
		const capturedAfterEdit = await provider.getAutomationSessionConfiguration(session.sessionId);

		assert.deepStrictEqual({
			displayed: provider.getSessionConfig(session.sessionId)?.values.autoApprove,
			initialConfig: agentHost.resolveSessionConfigRequests.at(-2)?.config?.autoApprove,
			capturedWithoutEdit: capturedWithoutEdit?.sessionTemplate?.config?.autoApprove,
			capturedAfterEdit: capturedAfterEdit?.sessionTemplate?.config?.autoApprove,
		}, {
			displayed: 'default',
			initialConfig: 'default',
			capturedWithoutEdit: 'autoApprove',
			capturedAfterEdit: 'default',
		});
	});

	test('createNewSession drops an invalid remembered mode instead of forwarding it', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
			[SessionConfigKey.Mode]: 'bogus',
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
		const provider = createProvider(disposables, agentHost, undefined, { storageService });
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.strictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config?.mode, undefined);
	});

	test('createNewSession seeds remembered mode/approvals when chat.defaultConfiguration is at its schema default', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
			[SessionConfigKey.Mode]: 'plan',
			[SessionConfigKey.AutoApprove]: 'autoApprove',
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
		const provider = createProvider(disposables, agentHost, undefined, {
			configurationService: createSchemaDefaultConfigurationService(),
			storageService,
		});
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
			mode: 'plan',
			autoApprove: 'autoApprove',
		});
	});

	test('createNewSession keeps remembered picks over an ordinary configured chat.defaultConfiguration setting', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
			[SessionConfigKey.Mode]: 'plan',
			[SessionConfigKey.AutoApprove]: 'autoApprove',
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
		const config = createSchemaDefaultConfigurationService();
		// An ordinary configured setting acts as a default that the remembered pick overrides.
		await config.setUserConfiguration('chat.defaultConfiguration', { mode: 'autopilot' });
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: config, storageService });
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
			mode: 'plan',
			autoApprove: 'autoApprove',
		});
	});

	test('createNewSession uses configured chat.defaultConfiguration when there is no remembered pick', async () => {
		const config = createSchemaDefaultConfigurationService();
		await config.setUserConfiguration('chat.defaultConfiguration', { mode: 'autopilot', approvals: 'allowAll' });
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: config });
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
			mode: 'autopilot',
			autoApprove: 'autoApprove',
		});
	});

	test('createNewSession lets an enterprise policy chat.defaultConfiguration override remembered picks', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
			[SessionConfigKey.Mode]: 'plan',
			[SessionConfigKey.AutoApprove]: 'autoApprove',
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
		const config = new class extends TestConfigurationService {
			override inspect<T>(key: string) {
				const base = super.inspect<T>(key);
				if (key === 'chat.defaultConfiguration') {
					return { ...base, policyValue: { mode: 'autopilot', approvals: 'manual' } as unknown as T };
				}
				return base;
			}
		}();
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: config, storageService });
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
			mode: 'autopilot',
			autoApprove: 'default',
		});
	});

	test('getSessionByResource resolves current new session without listing it', () => {
		const provider = createProvider(disposables, agentHost);
		const workspaceUri = URI.parse('file:///home/user/my-project');
		const session = provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
		const resolved = provider.getSessionByResource(session.resource);

		assert.deepStrictEqual({
			listedSessions: provider.getSessions().length,
			resolvedResource: resolved?.resource.toString(),
			resolvedWorkspaceLabel: resolved?.workspace.get()?.label,
		}, {
			listedSessions: 0,
			resolvedResource: session.resource.toString(),
			resolvedWorkspaceLabel: 'my-project',
		});
	});

	test('joins the active client with customizations when opening an existing session', async () => {
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const activeClient = {
			tools: [],
			customizations: [{
				type: CustomizationType.Plugin,
				id: 'file:///customizations/test',
				uri: 'file:///customizations/test',
				name: 'Test Customization',
			}],
		} satisfies Omit<SessionActiveClient, 'clientId'>;
		agentHost.addSession(createSession('active-client'));
		const provider = createProvider(disposables, agentHost, undefined, { activeSession, activeClient });
		provider.getSessions();
		await timeout(0);
		agentHost.dispatchedActions.length = 0;
		const resource = URI.from({ scheme: 'agent-host-copilotcli', path: '/active-client' });
		activeSession.set({
			providerId: provider.id,
			sessionId: `${provider.id}:${resource.toString()}`,
			resource,
		} as IActiveSession, undefined);
		await timeout(0);

		assert.deepStrictEqual(agentHost.dispatchedActions.filter(dispatch => dispatch.action.type === ActionType.SessionActiveClientSet), [{
			channel: AgentSession.uri('copilotcli', 'active-client').toString(),
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: { clientId: 'test-local-client', ...activeClient },
			},
			clientId: 'test-local-client',
			clientSeq: 0,
		}]);
	});

	test('does not publish empty customizations while resolving an unobserved active session scope', async () => {
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const resolution = new DeferredPromise<void>();
		let scopeRequests = 0;
		let activeClientReads = 0;
		const activeClient = {
			tools: [],
			customizations: [{
				type: CustomizationType.Plugin,
				id: 'file:///customizations/resolved',
				uri: 'file:///customizations/resolved',
				name: 'Resolved Customization',
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
			}],
		} satisfies Omit<SessionActiveClient, 'clientId'>;
		const scope: IAgentCustomizationScope = {
			customizations: constObservable(activeClient.customizations),
			customAgents: constObservable([]),
			tools: constObservable(activeClient.tools),
			isResolved: constObservable(true),
			whenResolved: () => resolution.p,
			activeClient: clientId => {
				activeClientReads++;
				return constObservable({ clientId, ...activeClient });
			},
			dispose: () => { },
		};
		agentHost.addSession(createSession('delayed-active-client', {
			workingDirectory: URI.file('/home/user/delayed-active-client'),
		}));
		const provider = createProvider(disposables, agentHost, undefined, {
			activeSession,
			activeClientScope: () => {
				scopeRequests++;
				return scope;
			},
		});
		provider.getSessions();
		await timeout(0);
		agentHost.dispatchedActions.length = 0;
		const resource = URI.from({ scheme: 'agent-host-copilotcli', path: '/delayed-active-client' });
		activeSession.set({
			providerId: provider.id,
			sessionId: `${provider.id}:${resource.toString()}`,
			resource,
		} as IActiveSession, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			scopeRequests,
			activeClientReads,
			actions: agentHost.dispatchedActions.filter(dispatch => dispatch.action.type === ActionType.SessionActiveClientSet),
		}, {
			scopeRequests: 1,
			activeClientReads: 0,
			actions: [],
		});

		resolution.complete();
		await timeout(0);

		assert.deepStrictEqual({
			scopeRequests,
			activeClientReads,
			actions: agentHost.dispatchedActions.filter(dispatch => dispatch.action.type === ActionType.SessionActiveClientSet),
		}, {
			scopeRequests: 1,
			activeClientReads: 1,
			actions: [{
				channel: AgentSession.uri('copilotcli', 'delayed-active-client').toString(),
				action: {
					type: ActionType.SessionActiveClientSet,
					activeClient: { clientId: 'test-local-client', ...activeClient },
				},
				clientId: 'test-local-client',
				clientSeq: 0,
			}],
		});
	});

	test('createNewSession eagerly creates the backend session with the client-allocated URI', async () => {
		const provider = createProvider(disposables, agentHost);
		const workspaceUri = URI.parse('file:///home/user/my-project');
		const session = provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
		await timeout(0); // let the eager createSession promise resolve

		const rawId = session.resource.path.substring(1);
		const expectedBackendUri = AgentSession.uri(provider.sessionTypes[0].id, rawId);
		assert.deepStrictEqual(
			agentHost.createdSessionUris.map(u => u.toString()),
			[expectedBackendUri.toString()],
			'eager createSession should be invoked with the client-allocated URI',
		);
		assert.strictEqual(
			agentHost.sessionSubscribeCounts.get(expectedBackendUri.toString()),
			1,
			'a state subscription should be held while the new session view is active',
		);
	});

	test('createNewSession does not eagerly create the backend session in an untrusted folder', async () => {
		const provider = createProvider(disposables, agentHost, undefined, { workspaceTrusted: false });
		const workspaceUri = URI.parse('file:///home/user/untrusted-project');
		provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
		await timeout(0); // let the (suppressed) eager createSession path settle

		assert.deepStrictEqual(
			agentHost.createdSessionUris.map(u => u.toString()),
			[],
			'no eager createSession should be invoked for an untrusted folder',
		);
	});

	test('createNewSession disposes the previous eager backend session on workspace switch', async () => {
		const provider = createProvider(disposables, agentHost);
		const sessionTypeId = provider.sessionTypes[0].id;

		const first = provider.createNewSession(URI.parse('file:///home/user/a'), sessionTypeId);
		await timeout(0);
		const firstRawId = first.resource.path.substring(1);
		const firstBackendUri = AgentSession.uri(sessionTypeId, firstRawId);

		// Switch workspace: the management layer disposes the abandoned draft
		// (providers no longer do so implicitly), which disposes the first
		// backend session and releases its subscription.
		const second = provider.createNewSession(URI.parse('file:///home/user/b'), sessionTypeId);
		provider.deleteNewSession(first.sessionId);
		await timeout(0);
		const secondRawId = second.resource.path.substring(1);
		const secondBackendUri = AgentSession.uri(sessionTypeId, secondRawId);

		assert.deepStrictEqual(
			agentHost.disposedSessions.map(u => u.toString()),
			[firstBackendUri.toString()],
			'first backend session should be disposed when the workspace switches',
		);
		assert.deepStrictEqual(
			agentHost.createdSessionUris.map(u => u.toString()),
			[firstBackendUri.toString(), secondBackendUri.toString()],
			'a fresh backend session should be created for the new workspace',
		);
	});

	test('eager createSession completes on the wire before getSubscription opens', async () => {
		// This guards against a regression where the order was flipped:
		// `getSubscription` first → server saw `subscribe` for an unknown
		// session → returned `AHP_SESSION_NOT_FOUND` → the client subscription
		// entered an error state → the chat handler later treated the session
		// as missing and re-issued `createSession`, producing a duplicate.
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/proj'), provider.sessionTypes[0].id);
		await timeout(0);

		const rawId = session.resource.path.substring(1);
		const backendKey = AgentSession.uri(provider.sessionTypes[0].id, rawId).toString();
		const ops = agentHost.wireOps.filter(op => op.endsWith(backendKey));
		assert.deepStrictEqual(
			ops,
			[`createSession:${backendKey}`, `subscribe:${backendKey}`],
			'createSession must complete before subscribe is issued',
		);
	});

	test('no subscription is opened if eager createSession fails', async () => {
		const provider = createProvider(disposables, agentHost);
		// Replace the next createSession call with a rejecting one. The mock's
		// onCreateSession hook runs after the URI is logged, so we throw from
		// the hook to model an auth-required / network error response.
		agentHost.onCreateSession = async () => { throw new Error('auth required'); };

		const session = provider.createNewSession(URI.parse('file:///home/user/proj'), provider.sessionTypes[0].id);
		await timeout(0);

		const rawId = session.resource.path.substring(1);
		const backendKey = AgentSession.uri(provider.sessionTypes[0].id, rawId).toString();
		assert.strictEqual(
			agentHost.sessionSubscribeCounts.get(backendKey),
			undefined,
			'no subscription should be opened when createSession rejects',
		);
	});

	test('workspace switch mid-createSession does not open a stale subscription', async () => {
		// Models the race where the user switches workspaces while the eager
		// `createSession` for the previous workspace is still in flight on
		// the wire. Providers now track multiple new sessions, so abandoning
		// the previous draft is explicit: the management layer calls
		// `deleteNewSession` on workspace switch. Once the parked create
		// eventually resolves, we must not open a subscription for it — it has
		// already been disposed.
		const provider = createProvider(disposables, agentHost);
		const sessionTypeId = provider.sessionTypes[0].id;

		const firstCreateGate = new DeferredPromise<void>();
		agentHost.onCreateSession = () => firstCreateGate.p;

		const first = provider.createNewSession(URI.parse('file:///home/user/a'), sessionTypeId);
		// Yield once so the eager createSession promise starts and parks at
		// the gate; nothing else has happened yet.
		await timeout(0);

		// Switch workspace while the first createSession is still parked.
		const second = provider.createNewSession(URI.parse('file:///home/user/b'), sessionTypeId);
		// Abandon the first draft (what the management layer does on a
		// workspace switch). Disposing the first NewSession clears its backend
		// URI before the second eager-create runs.
		provider.deleteNewSession(first.sessionId);
		await timeout(0);

		// Now release the first createSession. The async IIFE in
		// `NewSession.eagerCreate` should observe that the backend URI no
		// longer matches and bail without subscribing.
		firstCreateGate.complete();
		await timeout(0);

		const firstBackendKey = AgentSession.uri(sessionTypeId, first.resource.path.substring(1)).toString();
		const secondBackendKey = AgentSession.uri(sessionTypeId, second.resource.path.substring(1)).toString();
		assert.strictEqual(
			agentHost.sessionSubscribeCounts.get(firstBackendKey),
			undefined,
			'no subscription should be opened for the abandoned first session',
		);
		assert.strictEqual(
			agentHost.sessionSubscribeCounts.get(secondBackendKey),
			1,
			'second session should still get its eager subscription',
		);
	});

	// ---- Session actions -------

	test('deleteSession releases all cached provider state', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'del-sess', { title: 'To Delete' });

		const sessions = provider.getSessions();
		const target = sessions.find(s => s.title.get() === 'To Delete');
		assert.ok(target);
		const state: SessionState = {
			provider: 'copilotcli',
			title: 'To Delete',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
		};
		agentHost.setSessionState('del-sess', 'copilotcli', state);
		provider.getSessionConfig(target.sessionId);

		const metadata = Reflect.get(provider, '_metaByRawId') as Map<string, IAgentSessionMetadata>;
		const lastStates = Reflect.get(provider, '_lastSessionStates') as Map<string, SessionState>;
		const subscriptions = Reflect.get(provider, '_sessionStateSubscriptions') as DisposableMap<string, DisposableStore>;
		const idleTimers = Reflect.get(provider, '_sessionStateIdleTimers') as DisposableMap<string>;
		assert.deepStrictEqual({
			metadata: metadata.has('del-sess'),
			state: lastStates.has(target.sessionId),
			subscription: subscriptions.has(target.sessionId),
			timer: idleTimers.has(target.sessionId),
		}, {
			metadata: true,
			state: true,
			subscription: true,
			timer: true,
		});

		await provider.deleteSession(target.sessionId);

		assert.deepStrictEqual({
			disposedSessions: agentHost.disposedSessions.map(uri => ({
				provider: AgentSession.provider(uri),
				id: AgentSession.id(uri),
			})),
			session: provider.getSessions().find(s => s.title.get() === 'To Delete'),
			metadata: metadata.get('del-sess'),
			state: lastStates.get(target.sessionId),
			subscription: subscriptions.has(target.sessionId),
			timer: idleTimers.has(target.sessionId),
			unsubscribeCount: agentHost.sessionUnsubscribeCounts.get(AgentSession.uri('copilotcli', 'del-sess').toString()),
		}, {
			disposedSessions: [{ provider: 'copilotcli', id: 'del-sess' }],
			session: undefined,
			metadata: undefined,
			state: undefined,
			subscription: false,
			timer: false,
			unsubscribeCount: 1,
		});
	}));

	test('deleteSession does not remove a session twice when the host also notifies', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'delete-notified', { title: 'Delete Notified' });
		const target = provider.getSessions().find(s => s.title.get() === 'Delete Notified');
		assert.ok(target);

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));
		agentHost.onDisposeSession = session => fireSessionRemoved(agentHost, AgentSession.id(session));

		await provider.deleteSession(target.sessionId);
		await timeout(100);

		assert.deepStrictEqual({
			disposedSessions: agentHost.disposedSessions.length,
			removedEvents: changes.filter(change => change.removed.length > 0).length,
			session: provider.getSessions().find(s => s.title.get() === 'Delete Notified'),
		}, {
			disposedSessions: 1,
			removedEvents: 1,
			session: undefined,
		});
	}));

	test('deleteSessions disposes all sessions and removes them from cache', async () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'del-1', { title: 'First' });
		fireSessionAdded(agentHost, 'del-2', { title: 'Second' });

		const first = provider.getSessions().find(s => s.title.get() === 'First');
		const second = provider.getSessions().find(s => s.title.get() === 'Second');
		assert.ok(first);
		assert.ok(second);

		await provider.deleteSessions([first!.sessionId, second!.sessionId]);

		assert.strictEqual(agentHost.disposedSessions.length, 2);
		assert.deepStrictEqual(agentHost.disposedSessions.map(uri => AgentSession.id(uri)).sort(), ['del-1', 'del-2']);
		assert.strictEqual(provider.getSessions().find(s => s.title.get() === 'First'), undefined);
		assert.strictEqual(provider.getSessions().find(s => s.title.get() === 'Second'), undefined);
	});

	test('deleteSessions publishes successful removals before propagating a later failure', async () => {
		agentHost.addSession(createSession('delete-success', { summary: 'Delete Success' }));
		agentHost.addSession(createSession('delete-failure', { summary: 'Delete Failure' }));
		const provider = createProvider(disposables, agentHost);
		await timeout(0);
		const successful = provider.getSessions().find(s => s.title.get() === 'Delete Success');
		const failing = provider.getSessions().find(s => s.title.get() === 'Delete Failure');
		assert.ok(successful);
		assert.ok(failing);

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));
		agentHost.failDisposeSessionFor = 'delete-failure';

		await assert.rejects(provider.deleteSessions([successful.sessionId, failing.sessionId]), /Failed to dispose delete-failure/);

		assert.deepStrictEqual({
			removed: changes.flatMap(change => change.removed.map(session => session.title.get())),
			successful: provider.getSessions().find(s => s.title.get() === 'Delete Success'),
			failing: provider.getSessions().find(s => s.title.get() === 'Delete Failure')?.title.get(),
		}, {
			removed: ['Delete Success'],
			successful: undefined,
			failing: 'Delete Failure',
		});
	});

	// ---- Rename -------

	test('renameSession dispatches SessionTitleChanged on the session channel', async () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'rename-sess', { title: 'Old Title' });

		const sessions = provider.getSessions();
		const target = sessions.find(s => s.title.get() === 'Old Title');
		assert.ok(target);

		await provider.renameSession(target!.sessionId, 'New Title');

		assert.strictEqual(agentHost.dispatchedActions.length, 1);
		const dispatched = agentHost.dispatchedActions[0];
		assert.strictEqual(dispatched.action.type, ActionType.SessionTitleChanged);
		assert.strictEqual((dispatched.action as { title: string }).title, 'New Title');
		const actionSession = dispatched.channel.toString();
		assert.strictEqual(AgentSession.provider(actionSession), 'copilotcli');
		assert.strictEqual(AgentSession.id(actionSession), 'rename-sess');
		assert.strictEqual(dispatched.clientId, 'test-local-client');
	});

	test('renameSession updates the session title optimistically', async () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'rename-opt', { title: 'Before' });

		const sessions = provider.getSessions();
		const target = sessions.find(s => s.title.get() === 'Before');
		assert.ok(target);

		await provider.renameSession(target!.sessionId, 'After');
		assert.strictEqual(target!.title.get(), 'After');
	});

	test('renameChat on the default chat renames the chat tab, not the session', async () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'rename-default-chat', { title: 'Session Title' });

		const sessions = provider.getSessions();
		const target = sessions.find(s => s.title.get() === 'Session Title');
		assert.ok(target);

		await provider.renameChat(target!.sessionId, target!.mainChat.get().resource, 'Chat Title');

		// Session title is untouched; the default chat tab title changes.
		assert.strictEqual(target!.title.get(), 'Session Title');
		assert.strictEqual(target!.mainChat.get().title.get(), 'Chat Title');
		// Dispatched on the default chat channel, not the session channel.
		assert.strictEqual(agentHost.dispatchedActions.length, 1);
		const dispatched = agentHost.dispatchedActions[0];
		assert.strictEqual(dispatched.action.type, ActionType.SessionTitleChanged);
		assert.strictEqual(dispatched.channel.toString(), buildDefaultChatUri(AgentSession.uri('copilotcli', 'rename-default-chat').toString()));
	});

	test('renameChat is no-op for unknown session', async () => {
		const provider = createProvider(disposables, agentHost);
		await provider.renameChat('nonexistent-id', URI.parse('test://nonexistent'), 'Ignored');

		assert.strictEqual(agentHost.dispatchedActions.length, 0);
	});

	// ---- Multi-chat catalog (applyChatCatalog reconciliation) ----------------

	suite('multi-chat catalog', () => {
		function makeChatSummary(resource: string, title: string, status = ProtocolSessionStatus.Idle): ChatSummary {
			return { resource, title, status, modifiedAt: new Date(0).toISOString() };
		}

		function makeState(chats: ChatSummary[], opts?: { sessionTitle?: string; defaultChat?: string }): SessionState {
			return {
				provider: 'copilotcli',
				title: opts?.sessionTitle ?? 'Session',
				status: ProtocolSessionStatus.Idle,
				lifecycle: SessionLifecycle.Ready,
				activeClients: [],
				chats,
				...(opts?.defaultChat ? { defaultChat: opts.defaultChat } : {}),
			};
		}

		function setupMultiChatSession(provider: ReturnType<typeof createProvider>, rawId: string): ISession {
			// Registered with the host as well as announced: `getSessions` starts a refresh, and an
			// authoritative empty list would evict the adapter the notification just created —
			// leaving later writes landing on an instance nothing reads.
			agentHost.addSession(createSession(rawId, { summary: 'Session' }));
			fireSessionAdded(agentHost, rawId, { title: 'Session' });
			const session = provider.getSessions().find(s => AgentSession.id(s.resource.toString()) === rawId);
			assert.ok(session);
			// Force a session-state subscription so pushed states reach the adapter.
			provider.getSessionConfig(session!.sessionId);
			return session!;
		}

		test('default + peer catalog surfaces both chats with the default as mainChat', () => {
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-1');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-1').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');

			agentHost.setSessionState('multi-1', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				makeChatSummary(peerChat, 'Peer'),
			], { defaultChat }));

			assert.deepStrictEqual({
				supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
				chatFragments: session.chats.get().map(c => c.resource.fragment),
				mainIsDefault: session.mainChat.get() === session.chats.get()[0],
				peerTitle: session.chats.get()[1].title.get(),
			}, {
				supportsMultipleChats: true,
				chatFragments: ['', 'peer-1'],
				mainIsDefault: true,
				peerTitle: 'Peer',
			});
		});

		test('equivalent chat catalogs do not notify chat observers', () => {
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-stable');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-stable').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');
			const makeCatalog = () => makeState([
				makeChatSummary(defaultChat, ''),
				makeChatSummary(peerChat, 'Peer'),
			], { defaultChat });

			agentHost.setSessionState('multi-stable', 'copilotcli', makeCatalog());
			let updateCount = 0;
			disposables.add(autorun(reader => {
				session.chats.read(reader);
				updateCount++;
			}));

			agentHost.setSessionState('multi-stable', 'copilotcli', makeCatalog());

			assert.strictEqual(updateCount, 1);
		});

		test('equivalent peer chat values do not notify observers', () => {
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-values');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-values').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');
			const makeCatalog = () => makeState([
				makeChatSummary(defaultChat, ''),
				{ ...makeChatSummary(peerChat, 'Peer'), activity: 'Working' },
			], { defaultChat });

			agentHost.setSessionState('multi-values', 'copilotcli', makeCatalog());
			const peer = session.chats.get()[1];
			let updateCount = 0;
			disposables.add(autorun(reader => {
				peer.updatedAt.read(reader);
				peer.description.read(reader);
				peer.lastTurnEnd.read(reader);
				updateCount++;
			}));

			agentHost.setSessionState('multi-values', 'copilotcli', makeCatalog());

			assert.strictEqual(updateCount, 1);
		});

		test('peer chats map protocol interactivity to the provider-agnostic tri-state', () => {
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-ro');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-ro').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const readOnlyPeer = buildChatUri(sessionUri, 'peer-ro');
			const hiddenPeer = buildChatUri(sessionUri, 'peer-hidden');

			agentHost.setSessionState('multi-ro', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				{ ...makeChatSummary(readOnlyPeer, 'Worker'), interactivity: ProtocolChatInteractivity.ReadOnly },
				{ ...makeChatSummary(hiddenPeer, 'Hidden Worker'), interactivity: ProtocolChatInteractivity.Hidden },
			], { defaultChat }));

			const chats = session.chats.get();
			assert.deepStrictEqual(chats.map(c => c.interactivity.get()), [
				ChatInteractivity.Full,
				ChatInteractivity.ReadOnly,
				ChatInteractivity.Hidden,
			]);
		});

		test('subagent (tool-origin) chats surface as read-only peers', () => {
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-sub');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-sub').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const subagentChat = buildSubagentChatUri(sessionUri, 'tc-1');

			agentHost.setSessionState('multi-sub', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				{ ...makeChatSummary(subagentChat, 'Code Reviewer'), origin: { kind: ProtocolChatOriginKind.Tool, chat: defaultChat, toolCallId: 'tc-1' }, interactivity: ProtocolChatInteractivity.ReadOnly },
			], { defaultChat }));

			const chats = session.chats.get();
			assert.deepStrictEqual({
				titles: chats.map(c => c.title.get()),
				interactivity: chats.map(c => c.interactivity.get()),
				subagentOrigin: chats[1]?.origin?.kind,
				// The subagent records its parent chat (the default chat) so the
				// "Agents" row can list it under the chat that spawned it.
				subagentParentIsMain: !!chats[1]?.origin?.parentChat && isEqual(chats[1].origin.parentChat, chats[0].resource),
				// A subagent worker chat is neither renameable nor deletable.
				subagentCapabilities: getChatCapabilities(chats[1], session, undefined),
			}, {
				titles: ['Session', 'Code Reviewer'],
				interactivity: [ChatInteractivity.Full, ChatInteractivity.ReadOnly],
				subagentOrigin: ChatOriginKind.Tool,
				subagentParentIsMain: true,
				subagentCapabilities: { canRename: false, canDelete: false },
			});
		});

		test('the main chat is renameable but never deletable via capabilities', () => {
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'main-caps');
			const sessionUri = AgentSession.uri('copilotcli', 'main-caps').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');

			agentHost.setSessionState('main-caps', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				{ ...makeChatSummary(peerChat, 'Peer'), origin: { kind: ProtocolChatOriginKind.User } },
			], { defaultChat }));

			const chats = session.chats.get();
			assert.deepStrictEqual({
				// The main (default) chat: renameable, never deletable.
				main: getChatCapabilities(chats[0], session, undefined),
				// A regular user peer chat: fully manageable.
				peer: getChatCapabilities(chats[1], session, undefined),
			}, {
				main: { canRename: true, canDelete: false },
				peer: { canRename: true, canDelete: true },
			});
		});

		test('subagent chats surface as read-only peers even without multi-chat support, but user peers do not', () => {
			agentHost.setAgents([
				{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
				{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
			]);
			const provider = createProvider(disposables, agentHost);
			fireSessionAdded(agentHost, 'claude-sub', { title: 'Claude', provider: 'claude' });
			const session = provider.getSessions().find(s => AgentSession.id(s.resource.toString()) === 'claude-sub');
			assert.ok(session);
			provider.getSessionConfig(session!.sessionId);

			const sessionUri = AgentSession.uri('claude', 'claude-sub').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const subagentChat = buildSubagentChatUri(sessionUri, 'tc-1');
			const userPeer = buildChatUri(sessionUri, 'peer-1');

			agentHost.setSessionState('claude-sub', 'claude', {
				provider: 'claude',
				title: 'Claude',
				status: ProtocolSessionStatus.Idle,
				lifecycle: SessionLifecycle.Ready,
				activeClients: [],
				defaultChat,
				chats: [
					makeChatSummary(defaultChat, ''),
					{ ...makeChatSummary(subagentChat, 'Code Reviewer'), origin: { kind: ProtocolChatOriginKind.Tool, chat: defaultChat, toolCallId: 'tc-1' }, interactivity: ProtocolChatInteractivity.ReadOnly },
					{ ...makeChatSummary(userPeer, 'User Peer'), origin: { kind: ProtocolChatOriginKind.User } },
				],
			});

			const chats = session!.chats.get();
			assert.deepStrictEqual({
				supportsMultipleChats: session!.capabilities.get().supportsMultipleChats,
				titles: chats.map(c => c.title.get()),
				interactivity: chats.map(c => c.interactivity.get()),
			}, {
				supportsMultipleChats: false,
				// The user peer is not surfaced (no multi-chat support); the subagent is.
				titles: ['Claude', 'Code Reviewer'],
				interactivity: [ChatInteractivity.Full, ChatInteractivity.ReadOnly],
			});
		});

		test('a new peer chat is presented as Untitled until its first request is sent', () => {
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-new');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-new').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');

			(session as AgentHostSessionAdapter).markChatAsNew('peer-1');
			agentHost.setSessionState('multi-new', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				makeChatSummary(peerChat, 'Peer'),
			], { defaultChat }));

			const peer = () => session.chats.get().find(c => c.resource.fragment === 'peer-1');
			const whileNew = peer()!.status.get();

			(session as AgentHostSessionAdapter).markChatAsSent('peer-1');
			const afterSent = peer()!.status.get();

			assert.deepStrictEqual({ whileNew, afterSent }, {
				whileNew: SessionStatus.Untitled,
				afterSent: SessionStatus.Completed,
			});
		});

		test('a peer catalog collapsed while capabilities were absent re-expands when they hydrate', () => {
			// Simulate the race where a multi-chat SessionState is processed before
			// the agent host's root state advertises `supportsMultipleChats`.
			agentHost.setAgents([{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: {} } as AgentInfo]);

			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-late-caps');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-late-caps').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');

			agentHost.setSessionState('multi-late-caps', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				makeChatSummary(peerChat, 'Peer'),
			], { defaultChat }));

			const collapsed = {
				supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
				chatFragments: session.chats.get().map(c => c.resource.fragment),
			};

			// Capabilities hydrate late; the catalog must re-expand without another
			// session-state update.
			agentHost.setAgents([{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { multipleChats: { fork: true } } } as AgentInfo]);

			const hydrated = {
				supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
				chatFragments: session.chats.get().map(c => c.resource.fragment),
			};

			assert.deepStrictEqual({ collapsed, hydrated }, {
				collapsed: { supportsMultipleChats: false, chatFragments: [''] },
				hydrated: { supportsMultipleChats: true, chatFragments: ['', 'peer-1'] },
			});
		});

		test('session adapters observe capabilities only after receiving a chat catalog', () => {
			let listenerCount = 0;
			let agentCapabilities = new Map<string, AgentInfo['capabilities']>([['copilotcli', {}]]);
			const capabilitiesChanged = disposables.add(new Emitter<void>({
				onDidAddListener: () => listenerCount++,
				onWillRemoveListener: () => listenerCount--,
			}));
			const capabilitiesObs = observableFromEvent(disposables, capabilitiesChanged.event, () => agentCapabilities);
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IGitHubService, new class extends mock<IGitHubService>() { });
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession = constObservable<IActiveSession | undefined>(undefined);
			});
			instantiationService.stub(IPullRequestIconCache, new class extends mock<IPullRequestIconCache>() { });
			const options: IAgentHostAdapterOptions = {
				icon: Codicon.copilot,
				loading: constObservable(false),
				buildWorkspace: () => undefined,
				instantiationService,
				getConnection: () => undefined,
				agentCapabilities: capabilitiesObs,
				mapBackendSessionResource: resource => resource.with({ scheme: `agent-host-${resource.scheme}` }),
			};
			const adapters = Array.from({ length: 200 }, (_, index) => disposables.add(instantiationService.createInstance(
				AgentHostSessionAdapter,
				createSession(`lazy-capabilities-${index}`),
				'local-agent-host',
				'agent-host-copilotcli',
				'copilotcli',
				options,
			)));
			const sessionUri = AgentSession.uri('copilotcli', 'lazy-capabilities-0').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');

			const listenerCountBeforeCatalog = listenerCount;
			adapters[0].applyChatCatalog(makeState([
				makeChatSummary(defaultChat, ''),
				makeChatSummary(peerChat, 'Peer'),
			], { defaultChat }));
			const listenerCountAfterCatalog = listenerCount;
			agentCapabilities = new Map([['copilotcli', { multipleChats: { fork: true } }]]);
			capabilitiesChanged.fire();

			assert.deepStrictEqual({
				listenerCountBeforeCatalog,
				listenerCountAfterCatalog,
				chatFragmentsAfterHydration: adapters[0].chats.get().map(chat => chat.resource.fragment),
			}, {
				listenerCountBeforeCatalog: 0,
				listenerCountAfterCatalog: 1,
				chatFragmentsAfterHydration: ['', 'peer-1'],
			});
		});

		test('forkChat forwards the source chat and turn to the host and surfaces a new peer chat', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-fork');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-fork').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);

			agentHost.setSessionState('multi-fork', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
			], { defaultChat }));

			const forked = await provider.forkChat(session.sessionId, session.resource, 'turn-1');

			const call = agentHost.createdChats.at(-1);
			assert.deepStrictEqual({
				forkSource: call?.options?.fork?.source.toString(),
				forkTurnId: call?.options?.fork?.turnId,
				forkedIsPeer: !!forked.resource.fragment,
				forkedInCatalog: session.chats.get().some(c => c.resource.toString() === forked.resource.toString()),
			}, {
				forkSource: defaultChat,
				forkTurnId: 'turn-1',
				forkedIsPeer: true,
				forkedInCatalog: true,
			});
		}));

		test('forkChat inherits the source peer chat\'s model, recorded as inherited', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			// A fork continues the chat it was taken from, so it starts on that chat's model rather
			// than the session-level default it used to take, and records it as carried over rather
			// than chosen here.
			agentHost.setAgents([{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { multipleChats: { fork: true, sideChat: true } } } as AgentInfo]);
			const activeSession = observableValue<IActiveSession | undefined>('test.activeSession', undefined);
			const inputStates: { resource: string; state: Partial<IChatModelInputState> }[] = [];
			const provider = createProvider(disposables, agentHost, undefined, {
				activeSession,
				lookupLanguageModel: createTestLanguageModel,
				acquireOrLoadSession: async resource => {
					const inputModel = new class extends mock<IInputModel>() {
						override readonly state = constObservable<IChatModelInputState | undefined>(undefined);
						override setState(state: Partial<IChatModelInputState>): void {
							inputStates.push({ resource: resource.toString(), state });
						}
						override clearState(): void { }
						override toJSON(): undefined { return undefined; }
					}();
					const chatModel = new class extends mock<IChatModel>() {
						override readonly inputModel = inputModel;
					}();
					return {
						object: chatModel,
						dispose() { },
					} satisfies IChatModelReference;
				},
			});
			const session = setupMultiChatSession(provider, 'multi-fork-peer-selection');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-fork-peer-selection').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');
			agentHost.setSessionState('multi-fork-peer-selection', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				makeChatSummary(peerChat, 'Peer'),
			], { defaultChat }));

			const peer = session.chats.get().find(c => c.resource.fragment === 'peer-1');
			assert.ok(peer);
			activeSession.set({ sessionId: session.sessionId, activeChat: constObservable(peer!) } as IActiveSession, undefined);
			provider.setModel(session.sessionId, peer!.resource, 'agent-host-copilotcli:peer-model', ChatModelSource.Chosen);

			const forked = await provider.forkChat(session.sessionId, peer!.resource, 'turn-1');
			const call = agentHost.createdChats.at(-1);
			const forkedChat = session.chats.get().find(c => c.resource.fragment === forked.resource.fragment);

			assert.deepStrictEqual({
				forkSource: call?.options?.fork?.source.toString(),
				// The source peer's model, not the session-level default the fork used to take.
				createdModel: call?.options?.model,
				forkedModelId: forkedChat?.modelId.get(),
				forkedModelSource: forkedChat?.modelSource.get(),
				forkedInputSelectedModels: inputStates
					.filter(entry => entry.resource === forked.resource.toString())
					.map(entry => entry.state.selectedModel?.identifier)
					.filter((id): id is string => id !== undefined),
			}, {
				forkSource: peerChat,
				createdModel: { id: 'peer-model' },
				forkedModelId: 'agent-host-copilotcli:peer-model',
				// Inherited, not a choice, so `chat.defaultModel` may still seed the new chat.
				forkedModelSource: ChatModelSource.CarriedOver,
				forkedInputSelectedModels: ['agent-host-copilotcli:peer-model'],
			});
		}));

		test('createSideChat forwards the source chat and turn to the host and surfaces a new peer chat', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			agentHost.setAgents([{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { multipleChats: { fork: true, sideChat: true } } } as AgentInfo]);
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-side-chat');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-side-chat').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);

			agentHost.setSessionState('multi-side-chat', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
			], { defaultChat }));

			assert.strictEqual(session.capabilities.get().supportsSideChat, true);

			const selection = { text: '  selected text  ' };
			const sideChat = await provider.createSideChat(session.sessionId, session.resource, 'turn-1', selection);

			const call = agentHost.createdChats.at(-1);
			assert.deepStrictEqual({
				sideChatSource: call?.options?.sideChat?.source.toString(),
				sideChatTurnId: call?.options?.sideChat?.turnId,
				sideChatSelection: call?.options?.sideChat?.selection,
				sideChatIsPeer: !!sideChat.resource.fragment,
				sideChatInCatalog: session.chats.get().some(c => c.resource.toString() === sideChat.resource.toString()),
			}, {
				sideChatSource: defaultChat,
				sideChatTurnId: 'turn-1',
				sideChatSelection: selection,
				sideChatIsPeer: true,
				sideChatInCatalog: true,
			});
		}));

		test('createSideChat translates a subagent source to the canonical host chat URI', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			agentHost.setAgents([{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { multipleChats: { fork: true, sideChat: true } } } as AgentInfo]);
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-side-chat-subagent');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-side-chat-subagent').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const subagentChat = buildSubagentChatUri(sessionUri, 'call-1');

			agentHost.setSessionState('multi-side-chat-subagent', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				{ ...makeChatSummary(subagentChat, 'Subagent'), origin: { kind: ProtocolChatOriginKind.Tool, chat: defaultChat, toolCallId: 'call-1' } },
			], { defaultChat }));
			const sourceChat = session.chats.get().find(chat => chat.resource.fragment === 'subagent/call-1');
			assert.ok(sourceChat);

			await provider.createSideChat(session.sessionId, sourceChat.resource, 'turn-1', { text: 'selected text' });

			assert.deepStrictEqual({
				source: agentHost.createdChats.at(-1)?.options?.sideChat?.source.toString(),
				turnId: agentHost.createdChats.at(-1)?.options?.sideChat?.turnId,
				selection: agentHost.createdChats.at(-1)?.options?.sideChat?.selection,
			}, {
				source: subagentChat,
				turnId: 'turn-1',
				selection: { text: 'selected text' },
			});
		}));

		test('createSideChat reconstructs a canonical subagent URI when its source is absent from the catalog', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			agentHost.setAgents([{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { multipleChats: { fork: true, sideChat: true } } } as AgentInfo]);
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-side-chat-subagent-fallback');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-side-chat-subagent-fallback').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const subagentChat = buildSubagentChatUri(sessionUri, 'call-1');

			agentHost.setSessionState('multi-side-chat-subagent-fallback', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				{ ...makeChatSummary(subagentChat, 'Subagent'), origin: { kind: ProtocolChatOriginKind.Tool, chat: defaultChat, toolCallId: 'call-1' } },
			], { defaultChat }));
			const sourceChat = session.chats.get().find(chat => chat.resource.fragment === 'subagent/call-1');
			assert.ok(sourceChat);
			agentHost.setSessionState('multi-side-chat-subagent-fallback', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
			], { defaultChat }));

			await provider.createSideChat(session.sessionId, sourceChat.resource, 'turn-1');

			assert.strictEqual(agentHost.createdChats.at(-1)?.options?.sideChat?.source.toString(), subagentChat);
		}));

		test('createSideChat uses the backend session URI when reconstructing a missing subagent source', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			agentHost.setAgents([{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { multipleChats: { fork: true, sideChat: true } } } as AgentInfo]);
			const provider = createProvider(disposables, agentHost, undefined, { providerCtor: BackendSchemeTestProvider });
			const rawId = 'multi-side-chat-backend-source';
			const session = setupMultiChatSession(provider, rawId);
			const backendSession = URI.parse(`ahp-session:/${rawId}`);
			const defaultChat = buildDefaultChatUri(backendSession);
			const subagentChat = buildSubagentChatUri(backendSession, 'call-1');
			const sourceState = makeState([
				makeChatSummary(defaultChat, ''),
				{ ...makeChatSummary(subagentChat, 'Subagent'), origin: { kind: ProtocolChatOriginKind.Tool, chat: defaultChat, toolCallId: 'call-1' } },
			], { defaultChat });

			agentHost.setSessionStateResource(backendSession, sourceState);
			const sourceChat = session.chats.get().find(chat => chat.resource.fragment === 'subagent/call-1');
			assert.ok(sourceChat);
			agentHost.setSessionStateResource(backendSession, makeState([
				makeChatSummary(defaultChat, ''),
			], { defaultChat }));
			agentHost.onCreateChat = (_session, chat) => agentHost.setSessionStateResource(backendSession, makeState([
				makeChatSummary(defaultChat, ''),
				makeChatSummary(chat.toString(), 'Side Chat'),
			], { defaultChat }));

			await provider.createSideChat(session.sessionId, sourceChat.resource, 'turn-1');

			assert.deepStrictEqual({
				session: agentHost.createdChats.at(-1)?.session.toString(),
				source: agentHost.createdChats.at(-1)?.options?.sideChat?.source.toString(),
			}, {
				session: backendSession.toString(),
				source: subagentChat,
			});
		}));

		test('createSideChat retains its model through the first request and releases it after the grace window', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			agentHost.setAgents([{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { multipleChats: { fork: true, sideChat: true } } } as AgentInfo]);
			let activeModel: IChatModel | undefined;
			let referenceCount = 0;
			let modelWhenSent: IChatModel | undefined;
			const provider = createProvider(disposables, agentHost, undefined, {
				acquireOrLoadSession: async () => {
					activeModel ??= new class extends mock<IChatModel>() {
						override readonly inputModel = new class extends mock<IInputModel>() {
							override readonly state = constObservable<IChatModelInputState | undefined>(undefined);
							override setState(): void { }
							override clearState(): void { }
							override toJSON(): undefined { return undefined; }
						}();
					}();
					referenceCount++;
					let disposed = false;
					return {
						object: activeModel,
						dispose: () => {
							if (!disposed) {
								disposed = true;
								if (--referenceCount === 0) {
									activeModel = undefined;
								}
							}
						},
					} satisfies IChatModelReference;
				},
				sendRequest: async () => {
					modelWhenSent = activeModel;
					return { kind: 'sent', data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never };
				},
			});
			const session = setupMultiChatSession(provider, 'model-retention');
			const sessionUri = AgentSession.uri('copilotcli', 'model-retention').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			agentHost.setSessionState('model-retention', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
			], { defaultChat }));

			const sideChat = await provider.createSideChat(session.sessionId, session.resource, 'turn-1');
			const modelAfterCreate = activeModel;
			await provider.sendRequest(session.sessionId, sideChat.resource, { query: 'Continue' });
			const modelAfterSend = activeModel;
			await timeout(10_000);

			assert.deepStrictEqual({
				modelCreated: modelAfterCreate !== undefined,
				sendReusedModel: modelWhenSent === modelAfterCreate && modelAfterSend === modelAfterCreate,
				releasedAfterGraceWindow: activeModel === undefined,
			}, {
				modelCreated: true,
				sendReusedModel: true,
				releasedAfterGraceWindow: true,
			});
		}));

		test('createSideChat inherits model and agent selection from the source peer chat', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			agentHost.setAgents([{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { multipleChats: { fork: true, sideChat: true } } } as AgentInfo]);
			const activeSession = observableValue<IActiveSession | undefined>('test.activeSession', undefined);
			const inputStates: { resource: string; state: Partial<IChatModelInputState> }[] = [];
			const provider = createProvider(disposables, agentHost, undefined, {
				activeSession,
				lookupLanguageModel: createTestLanguageModel,
				acquireOrLoadSession: async resource => {
					const inputModel = new class extends mock<IInputModel>() {
						override readonly state = constObservable<IChatModelInputState | undefined>(undefined);
						override setState(state: Partial<IChatModelInputState>): void {
							inputStates.push({ resource: resource.toString(), state });
						}
						override clearState(): void { }
						override toJSON(): undefined { return undefined; }
					}();
					const chatModel = new class extends mock<IChatModel>() {
						override readonly inputModel = inputModel;
					}();
					return {
						object: chatModel,
						dispose() { },
					} satisfies IChatModelReference;
				},
			});
			const session = setupMultiChatSession(provider, 'multi-side-chat-peer-selection');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-side-chat-peer-selection').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');
			agentHost.setSessionState('multi-side-chat-peer-selection', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				makeChatSummary(peerChat, 'Peer'),
			], { defaultChat }));

			const peer = session.chats.get().find(c => c.resource.fragment === 'peer-1');
			assert.ok(peer);
			activeSession.set({ sessionId: session.sessionId, activeChat: constObservable(peer!) } as IActiveSession, undefined);
			provider.setModel(session.sessionId, peer!.resource, 'agent-host-copilotcli:peer-model', ChatModelSource.Chosen);
			provider.setAgent?.(session.sessionId, { uri: 'agent://peer', name: 'peer' });

			const sideChat = await provider.createSideChat(session.sessionId, peer!.resource, 'turn-1');
			const call = agentHost.createdChats.at(-1);

			assert.deepStrictEqual({
				sideChatSource: call?.options?.sideChat?.source.toString(),
				createdModel: call?.options?.model,
				// The peer's model was chosen by the user, and the provider reports that so model
				// selection can tell a choice from a model a chat merely inherited.
				sourceOnPeer: peer!.modelSource?.get(),
				peerInputSelectedModels: inputStates
					.filter(entry => entry.resource === sideChat.resource.toString())
					.map(entry => entry.state.selectedModel?.identifier)
					.filter((id): id is string => id !== undefined),
				peerInputModes: inputStates
					.filter(entry => entry.resource === sideChat.resource.toString())
					.map(entry => entry.state.mode?.id)
					.filter((id): id is string => id !== undefined),
			}, {
				sideChatSource: peerChat,
				createdModel: { id: 'peer-model' },
				sourceOnPeer: ChatModelSource.Chosen,
				peerInputSelectedModels: ['agent-host-copilotcli:peer-model'],
				peerInputModes: ['agent://peer'],
			});
		}));

		test('createSideChat rejects when the session capability is not advertised', async () => {
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-side-chat-unsupported');

			await assert.rejects(() => provider.createSideChat(session.sessionId, session.resource, 'turn-1'), /does not support side chats/);
		});

		test('createNewChat forwards the selected model to the host and seeds the chat input state', async () => {
			const inputStates: { resource: string; state: Partial<IChatModelInputState> }[] = [];
			const provider = createProvider(disposables, agentHost, undefined, {
				lookupLanguageModel: createTestLanguageModel,
				acquireOrLoadSession: async resource => {
					const inputModel = new class extends mock<IInputModel>() {
						override readonly state = constObservable<IChatModelInputState | undefined>(undefined);
						override setState(state: Partial<IChatModelInputState>): void {
							inputStates.push({ resource: resource.toString(), state });
						}
						override clearState(): void { }
						override toJSON(): undefined { return undefined; }
					}();
					const chatModel = new class extends mock<IChatModel>() {
						override readonly inputModel = inputModel;
					}();
					return {
						object: chatModel,
						dispose() { },
					} satisfies IChatModelReference;
				},
			});
			const session = setupMultiChatSession(provider, 'multi-model');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-model').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			agentHost.setSessionState('multi-model', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
			], { defaultChat }));

			provider.setModel(session.sessionId, session.resource, 'agent-host-copilotcli:selected-model', ChatModelSource.Chosen);

			const chat = await provider.createNewChat(session.sessionId);

			assert.deepStrictEqual({
				createdModel: agentHost.createdChats.at(-1)?.options?.model,
				peerInputSelectedModels: inputStates
					.filter(entry => entry.resource === chat.resource.toString())
					.map(entry => entry.state.selectedModel?.identifier)
					.filter((id): id is string => id !== undefined),
			}, {
				createdModel: { id: 'selected-model' },
				peerInputSelectedModels: ['agent-host-copilotcli:selected-model'],
			});
		});

		test('sendRequest keeps a peer chat model loaded while dispatching', async () => {
			const loadedResources = new Set<string>();
			const disposedResources: string[] = [];
			const sendSawLoaded: boolean[] = [];
			const provider = createProvider(disposables, agentHost, undefined, {
				acquireOrLoadSession: async resource => {
					const resourceKey = resource.toString();
					loadedResources.add(resourceKey);
					const inputModel = new class extends mock<IInputModel>() {
						override readonly state = constObservable<IChatModelInputState | undefined>(undefined);
						override setState(_state: Partial<IChatModelInputState>): void { }
						override clearState(): void { }
						override toJSON(): undefined { return undefined; }
					}();
					const chatModel = new class extends mock<IChatModel>() {
						override readonly inputModel = inputModel;
					}();
					return {
						object: chatModel,
						dispose() {
							loadedResources.delete(resourceKey);
							disposedResources.push(resourceKey);
						},
					} satisfies IChatModelReference;
				},
				sendRequest: async (resource): Promise<ChatSendResult> => {
					sendSawLoaded.push(loadedResources.has(resource.toString()));
					return { kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never };
				},
			});
			const session = setupMultiChatSession(provider, 'multi-send-peer');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-send-peer').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');
			agentHost.setSessionState('multi-send-peer', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				makeChatSummary(peerChat, 'Peer'),
			], { defaultChat }));
			const peer = session.chats.get().find(c => c.resource.fragment === 'peer-1');
			assert.ok(peer);

			await provider.sendRequest(session.sessionId, peer.resource, { query: 'hello' });

			assert.deepStrictEqual({
				sendSawLoaded,
				loadedResources: [...loadedResources],
				disposedResources,
			}, {
				sendSawLoaded: [true],
				loadedResources: [],
				disposedResources: [peer.resource.toString()],
			});
		});

		test('setModel updates the active peer chat model without changing the default chat model', () => {
			const activeSession = observableValue<IActiveSession | undefined>('test.activeSession', undefined);
			const provider = createProvider(disposables, agentHost, undefined, { activeSession });
			const session = setupMultiChatSession(provider, 'multi-active-model');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-active-model').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');
			agentHost.setSessionState('multi-active-model', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				makeChatSummary(peerChat, 'Peer'),
			], { defaultChat }));

			const peer = session.chats.get().find(c => c.resource.fragment === 'peer-1');
			assert.ok(peer);
			activeSession.set({ sessionId: session.sessionId, activeChat: constObservable(peer!) } as IActiveSession, undefined);

			provider.setModel(session.sessionId, peer!.resource, 'agent-host-copilotcli:peer-model', ChatModelSource.Chosen);

			assert.deepStrictEqual({
				defaultModelId: session.mainChat.get().modelId.get(),
				peerModelId: peer!.modelId.get(),
			}, {
				defaultModelId: undefined,
				peerModelId: 'agent-host-copilotcli:peer-model',
			});
		});

		test('deleteChat prompts for confirmation and disposes the peer chat when confirmed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const provider = createProvider(disposables, agentHost, undefined, { confirmDelete: true });
			const session = setupMultiChatSession(provider, 'multi-del');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-del').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');

			agentHost.setSessionState('multi-del', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				makeChatSummary(peerChat, 'Peer'),
			], { defaultChat }));

			const peer = session.chats.get().find(c => c.resource.fragment === 'peer-1');
			assert.ok(peer);
			await provider.deleteChat(session.sessionId, peer!.resource);

			assert.deepStrictEqual(agentHost.disposedChats.map(u => u.toString()), [peerChat]);
		}));

		test('deleteChat does not dispose the peer chat when the confirmation is cancelled', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const provider = createProvider(disposables, agentHost, undefined, { confirmDelete: false });
			const session = setupMultiChatSession(provider, 'multi-del-cancel');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-del-cancel').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');

			agentHost.setSessionState('multi-del-cancel', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				makeChatSummary(peerChat, 'Peer'),
			], { defaultChat }));

			const peer = session.chats.get().find(c => c.resource.fragment === 'peer-1');
			assert.ok(peer);
			await provider.deleteChat(session.sessionId, peer!.resource);

			assert.deepStrictEqual(agentHost.disposedChats, []);
		}));

		test('single-chat catalog degrades to the default chat only', () => {
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-single');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-single').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);

			agentHost.setSessionState('multi-single', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
			], { defaultChat }));

			assert.deepStrictEqual({
				chatCount: session.chats.get().length,
				mainIsOnlyChat: session.mainChat.get() === session.chats.get()[0],
			}, {
				chatCount: 1,
				mainIsOnlyChat: true,
			});
		});

		test('removing a peer from the catalog drops it back to the default chat', () => {
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-remove');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-remove').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');

			agentHost.setSessionState('multi-remove', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
				makeChatSummary(peerChat, 'Peer'),
			], { defaultChat }));
			const afterAdd = session.chats.get().length;

			agentHost.setSessionState('multi-remove', 'copilotcli', makeState([
				makeChatSummary(defaultChat, ''),
			], { defaultChat }));

			assert.deepStrictEqual({
				afterAdd,
				afterRemove: session.chats.get().map(c => c.resource.fragment),
			}, {
				afterAdd: 2,
				afterRemove: [''],
			});
		});

		test('default chat title diverges from the session title when renamed in the catalog', () => {
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-title');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-title').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat = buildChatUri(sessionUri, 'peer-1');

			agentHost.setSessionState('multi-title', 'copilotcli', makeState([
				makeChatSummary(defaultChat, 'Renamed Default'),
				makeChatSummary(peerChat, 'Peer'),
			], { sessionTitle: 'Session', defaultChat }));

			assert.deepStrictEqual({
				sessionTitle: session.title.get(),
				defaultChatTitle: session.mainChat.get().title.get(),
			}, {
				sessionTitle: 'Session',
				defaultChatTitle: 'Renamed Default',
			});
		});

		test('turn completion refreshes main chat status after the session-state subscription expires', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const provider = createProvider(disposables, agentHost);
			const session = setupMultiChatSession(provider, 'multi-complete');
			const sessionUri = AgentSession.uri('copilotcli', 'multi-complete').toString();
			const defaultChat = buildDefaultChatUri(sessionUri);
			const subagentChat = buildSubagentChatUri(sessionUri, 'tc-1');
			const stateWithStatus = (status: ProtocolSessionStatus): SessionState => makeState([
				makeChatSummary(defaultChat, '', status),
				{
					...makeChatSummary(subagentChat, 'Reviewer', status),
					origin: { kind: ProtocolChatOriginKind.Tool, chat: defaultChat, toolCallId: 'tc-1' },
				},
			], { defaultChat });

			agentHost.setSessionState('multi-complete', 'copilotcli', stateWithStatus(ProtocolSessionStatus.InProgress));
			await timeout(31_000);
			agentHost.setSessionState('multi-complete', 'copilotcli', stateWithStatus(ProtocolSessionStatus.Idle));
			const staleStatus = session.mainChat.get().status.get();

			agentHost.fireAction({
				channel: subagentChat,
				action: {
					type: ActionType.ChatTurnComplete,
					turnId: 'turn-1',
					duration: 1000,
				},
				serverSeq: 1,
				origin: undefined,
			} as ActionEnvelope);
			await timeout(0);

			assert.deepStrictEqual({
				staleStatus,
				updatedStatus: session.mainChat.get().status.get(),
				subagentStatus: session.chats.get().find(chat => chat.origin?.kind === ChatOriginKind.Tool)?.status.get(),
				subscribeCount: agentHost.sessionSubscribeCounts.get(sessionUri),
				unsubscribeCount: agentHost.sessionUnsubscribeCounts.get(sessionUri),
			}, {
				staleStatus: SessionStatus.InProgress,
				updatedStatus: SessionStatus.Completed,
				subagentStatus: SessionStatus.Completed,
				subscribeCount: 2,
				unsubscribeCount: 1,
			});
		}));
	});

	// ---- Title change from server -------

	test('server-echoed SessionTitleChanged updates cached title', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'echo-sess', { title: 'Original' });

		const sessions = provider.getSessions();
		const target = sessions.find(s => s.title.get() === 'Original');
		assert.ok(target);

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		agentHost.fireAction({
			channel: AgentSession.uri('copilotcli', 'echo-sess').toString(),
			action: {
				type: ActionType.SessionTitleChanged,
				title: 'Server Title',
			},
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);

		assert.strictEqual(target!.title.get(), 'Server Title');
		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].changed.length, 1);
	});

	test('a rejected SessionIsArchivedChanged leaves the session unarchived', () => {
		// The host refused the mutation, so applying it anyway would leave this
		// window claiming a session is archived when nothing was ever recorded.
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'rejected-archive', { title: 'Rejected' });

		const target = provider.getSessions().find(s => s.title.get() === 'Rejected');
		assert.ok(target);

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		agentHost.fireAction({
			channel: AgentSession.uri('copilotcli', 'rejected-archive').toString(),
			action: { type: ActionType.SessionIsArchivedChanged, isArchived: true },
			serverSeq: 1,
			origin: { clientId: 'test-client', clientSeq: 1 },
			rejectionReason: 'Session is not ready',
		} as ActionEnvelope);

		assert.deepStrictEqual({
			isArchived: target!.isArchived.get(),
			changeEvents: changes.length,
		}, {
			isArchived: false,
			changeEvents: 0,
		});
	});

	test('server-echoed ChatTurnStarted model does not update cached session model', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'model-change', { title: 'Model Change' });

		const target = provider.getSessions().find(s => s.title.get() === 'Model Change');
		assert.ok(target);
		provider.setModel(target!.sessionId, target!.resource, 'agent-host-copilotcli:old-model', ChatModelSource.Chosen);

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		agentHost.fireAction({
			channel: AgentSession.uri('copilotcli', 'model-change').toString(),
			action: {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello', origin: { kind: MessageKind.User }, model: { id: 'new-model' } },
			},
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);

		assert.strictEqual(target!.modelId.get(), 'agent-host-copilotcli:old-model');
		assert.strictEqual(changes.length, 0);
	});

	// ---- Refresh on turnComplete -------

	test('turnComplete action triggers session refresh', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('turn-sess', { summary: 'Before', modifiedTime: 1000 }));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		// Update on connection side
		agentHost.addSession(createSession('turn-sess', { summary: 'After', modifiedTime: 5000 }));

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		agentHost.fireAction({
			channel: buildDefaultChatUri(AgentSession.uri('copilotcli', 'turn-sess').toString()),
			action: {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-1',
				duration: 1000,
			},
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);

		await timeout(0);

		assert.ok(changes.length > 0);
		const updatedSession = provider.getSessions().find(s => s.title.get() === 'After');
		assert.ok(updatedSession);
	}));

	// ---- Session data adapter -------

	test('session adapter has correct workspace from working directory', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('ws-sess', { summary: 'WS Test', workingDirectory: URI.parse('file:///home/user/myrepo') }));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const sessions = provider.getSessions();
		const wsSession = sessions.find(s => s.title.get() === 'WS Test');
		assert.ok(wsSession);

		const workspace = wsSession!.workspace.get();
		assert.ok(workspace);
		assert.strictEqual(workspace!.label, 'myrepo');
	}));

	test('session adapter without working directory has no workspace', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('no-ws-sess', { summary: 'No WS' }));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const sessions = provider.getSessions();
		const session = sessions.find(s => s.title.get() === 'No WS');
		assert.ok(session);
		assert.strictEqual(session!.workspace.get(), undefined);
	}));

	test('Last Turn Changes uses live chat edits before the host changeset updates', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const workingDirectory = URI.file('/repo');
		agentHost.addSession(createSession('live-turn-changes', { summary: 'Live Turn Changes', workingDirectory }));
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const provider = createProvider(disposables, agentHost, undefined, { activeSession });
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions().find(candidate => candidate.title.get() === 'Live Turn Changes');
		assert.ok(session);
		activeSession.set(session as IActiveSession, undefined);

		const sessionUri = AgentSession.uri('copilotcli', 'live-turn-changes').toString();
		const chatUri = buildDefaultChatUri(sessionUri);
		agentHost.setSessionState('live-turn-changes', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Live Turn Changes',
			status: ProtocolSessionStatus.InProgress,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			defaultChat: chatUri,
			chats: [{
				resource: chatUri,
				title: 'Default',
				status: ProtocolSessionStatus.InProgress,
				modifiedAt: new Date(0).toISOString(),
			}],
			workingDirectories: [workingDirectory.toString()],
		});
		assert.ok(session instanceof AgentHostSessionAdapter);
		session.updateChangesets([{
			label: 'Last Turn Changes',
			uriTemplate: `${sessionUri}/changeset/turn/{turnId}`,
			changeKind: 'turn',
		}]);
		const changedFile = URI.file('/repo/live.ts');
		const externalFile = URI.file('/outside/ignored.ts');
		agentHost.setChatState(chatUri, {
			resource: chatUri,
			title: 'Default',
			status: ProtocolSessionStatus.InProgress,
			modifiedAt: new Date().toISOString(),
			turns: [],
			activeTurn: {
				id: 'active-turn',
				startedAt: new Date().toISOString(),
				message: { text: 'Edit live.ts', origin: { kind: MessageKind.User } },
				responseParts: [{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						status: ToolCallStatus.Completed,
						toolCallId: 'edit-live',
						toolName: 'create',
						displayName: 'Create File',
						invocationMessage: 'Creating live.ts',
						success: true,
						pastTenseMessage: 'Created live.ts',
						confirmed: ToolCallConfirmationReason.NotNeeded,
						content: [{
							type: ToolResultContentType.FileEdit,
							after: { uri: changedFile.toString(), content: { uri: changedFile.toString() } },
							diff: { added: 1, removed: 0 },
						}, {
							type: ToolResultContentType.FileEdit,
							after: { uri: externalFile.toString(), content: { uri: externalFile.toString() } },
							diff: { added: 1, removed: 0 },
						}],
					},
				}],
				usage: undefined,
			},
		});

		const changeset = session!.changesets.get()?.find(candidate => candidate.id === TURN_CHANGES_CHANGESET_ID);
		assert.deepStrictEqual({
			isLoading: changeset?.isLoadingChanges.get(),
			changes: changeset?.changes.get().map(change => isIChatSessionFileChange2(change) ? change.uri.toString() : change.modifiedUri.toString()),
		}, {
			isLoading: false,
			changes: [changedFile.toString()],
		});

		const changesetUri = `${sessionUri}/changeset/turn/active-turn`;
		agentHost.setChangesetState(changesetUri, { status: ChangesetStatus.Computing, files: [] });
		agentHost.setChatState(chatUri, {
			resource: chatUri,
			title: 'Default',
			status: ProtocolSessionStatus.Idle,
			modifiedAt: new Date().toISOString(),
			turns: [{
				id: 'active-turn',
				message: { text: 'Edit live.ts', origin: { kind: MessageKind.User } },
				responseParts: [],
				usage: undefined,
				state: TurnState.Complete,
			}],
		});
		const whileComputing = changeset?.changes.get().map(change => isIChatSessionFileChange2(change) ? change.uri.toString() : change.modifiedUri.toString());
		agentHost.setChangesetState(changesetUri, { status: ChangesetStatus.Ready, files: [] });
		const afterReady = changeset?.changes.get().map(change => isIChatSessionFileChange2(change) ? change.uri.toString() : change.modifiedUri.toString());

		assert.deepStrictEqual({ whileComputing, afterReady }, {
			whileComputing: [changedFile.toString()],
			afterReady: [],
		});
	}));

	test('Last Turn Changes ignores a trailing host notice turn', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const workingDirectory = URI.file('/repo');
		agentHost.addSession(createSession('notice-turn-changes', { summary: 'Notice Turn Changes', workingDirectory }));
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const provider = createProvider(disposables, agentHost, undefined, { activeSession });
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions().find(candidate => candidate.title.get() === 'Notice Turn Changes');
		assert.ok(session);
		activeSession.set(session as IActiveSession, undefined);
		assert.ok(session instanceof AgentHostSessionAdapter);

		const sessionUri = AgentSession.uri('copilotcli', 'notice-turn-changes').toString();
		const chatUri = buildDefaultChatUri(sessionUri);
		agentHost.setSessionState('notice-turn-changes', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Notice Turn Changes',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			defaultChat: chatUri,
			chats: [{
				resource: chatUri,
				title: 'Default',
				status: ProtocolSessionStatus.Idle,
				modifiedAt: new Date(0).toISOString(),
			}],
			workingDirectories: [workingDirectory.toString()],
		});
		session.updateChangesets([{
			label: 'Last Turn Changes',
			uriTemplate: `${sessionUri}/changeset/turn/{turnId}`,
			changeKind: 'turn',
		}]);

		const changedFile = URI.file('/repo/edited.ts');
		agentHost.setChangesetState(`${sessionUri}/changeset/turn/agent-turn`, {
			status: ChangesetStatus.Ready,
			files: [{
				id: changedFile.toString(),
				edit: {
					after: { uri: changedFile.toString(), content: { uri: changedFile.toString() } },
					diff: { added: 3, removed: 1 },
				},
			}],
		});
		agentHost.setChangesetState(`${sessionUri}/changeset/turn/notice-turn`, { status: ChangesetStatus.Ready, files: [] });

		// The agent's turn, followed by a hidden Agent Merge notice turn.
		agentHost.setChatState(chatUri, {
			resource: chatUri,
			title: 'Default',
			status: ProtocolSessionStatus.Idle,
			modifiedAt: new Date().toISOString(),
			turns: [{
				id: 'agent-turn',
				message: { text: 'Edit edited.ts', origin: { kind: MessageKind.User } },
				responseParts: [],
				usage: undefined,
				state: TurnState.Complete,
			}, {
				id: 'notice-turn',
				message: {
					text: '<!-- vscode-request-hidden-from-transcript -->\nAgent Merge is enabled for `feature`.',
					origin: { kind: MessageKind.SystemNotification },
				},
				responseParts: [],
				usage: undefined,
				state: TurnState.Complete,
			}],
		});

		const changeset = session.changesets.get()?.find(candidate => candidate.id === TURN_CHANGES_CHANGESET_ID);
		assert.deepStrictEqual({
			isEnabled: changeset?.isEnabled.get(),
			changes: changeset?.changes.get().map(change => isIChatSessionFileChange2(change) ? change.uri.toString() : change.modifiedUri.toString()),
		}, {
			isEnabled: true,
			changes: [changedFile.toString()],
		});
	}));

	test('registers provider-neutral resource label homes for quick chats and provider state', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const claudeHome = URI.file('/home/test/.agent/chats/claude-session');
		const rootHome = URI.file('/');
		agentHost.addSession(createSession('claude-session', { provider: 'claude', summary: 'Claude Quick Chat', quickChat: true, workingDirectory: claudeHome }));
		agentHost.addSession(createSession('root-session', { provider: 'claude', summary: 'Root Quick Chat', quickChat: true, workingDirectory: rootHome }));
		agentHost.addSession(createSession('copilot-session', { summary: 'Copilot Session' }));
		const pathService = new TestPathService(URI.file('/home/test'));
		const labelService = new MockLabelService();

		const provider = createProvider(disposables, agentHost, undefined, { pathService, labelService });
		provider.getSessions();
		await timeout(0);
		const getHomeLabel = (resource: URI): string | undefined => {
			const home = labelService.getUriHome(resource);
			return home ? labelService.getUriLabel(home) : undefined;
		};

		assert.deepStrictEqual({
			formatterCount: labelService.formatterCount,
			quickChat: getHomeLabel(URI.joinPath(claudeHome, 'artifact.md')),
			root: getHomeLabel(URI.file('/artifact.md')),
			copilotState: getHomeLabel(URI.file('/home/test/.copilot/session-state/copilot-session/artifact.md')),
		}, {
			formatterCount: 4,
			quickChat: 'claude/Claude Quick Chat',
			root: 'claude/Root Quick Chat',
			copilotState: 'Copilot/Copilot Session',
		});

		let formatterChanges = 0;
		disposables.add(labelService.onDidChangeFormatters(() => formatterChanges++));
		const copilotSession = AgentSession.uri('copilotcli', 'copilot-session').toString();
		agentHost.fireAction({
			channel: copilotSession,
			action: { type: ActionType.SessionIsReadChanged, isRead: true },
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);
		agentHost.fireAction({
			channel: copilotSession,
			action: { type: ActionType.SessionTitleChanged, title: 'Renamed/Session\\Title' },
			serverSeq: 2,
			origin: undefined,
		} as ActionEnvelope);

		assert.deepStrictEqual({
			formatterChanges,
			copilotState: getHomeLabel(URI.file('/home/test/.copilot/session-state/copilot-session/artifact.md')),
		}, {
			formatterChanges: 1,
			copilotState: 'Copilot/Renamed\u2215Session\u29F5Title',
		});

		provider.dispose();
		assert.deepStrictEqual({
			quickChat: labelService.getUriHome(URI.joinPath(claudeHome, 'artifact.md')),
			copilotState: labelService.getUriHome(URI.file('/home/test/.copilot/session-state/copilot-session/artifact.md')),
		}, {
			quickChat: undefined,
			copilotState: undefined,
		});
	}));

	test('shares one resource label formatter across session state homes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		for (let index = 0; index < 100; index++) {
			agentHost.addSession(createSession(`session-${index}`, { summary: `Session ${index}` }));
		}
		const labelService = new MockLabelService();
		const provider = createProvider(disposables, agentHost, undefined, {
			pathService: new TestPathService(URI.file('/home/test')),
			labelService,
		});
		provider.getSessions();
		await timeout(0);
		const resource = URI.file('/home/test/.copilot/session-state/session-42/artifact.md');
		const home = labelService.getUriHome(resource);

		assert.deepStrictEqual({
			formatterCount: labelService.formatterCount,
			home: home?.toString(),
			label: home ? labelService.getUriLabel(home) : undefined,
		}, {
			formatterCount: 1,
			home: URI.file('/home/test/.copilot/session-state/session-42').toString(),
			label: 'Copilot/Session 42',
		});
	}));

	test('registers the session state home before a quick chat is materialized', () => {
		const pathService = new TestPathService(URI.file('/home/test'));
		const labelService = new MockLabelService();
		const provider = createProvider(disposables, agentHost, undefined, { pathService, labelService });

		const session = provider.createQuickChat(provider.sessionTypes[0].id);
		const rawId = AgentSession.id(session.resource);
		const resource = URI.file(`/home/test/.copilot/chats/${rawId}/files/plan.md`);

		const home = labelService.getUriHome(resource);
		assert.deepStrictEqual({
			home: home?.toString(),
			label: home ? labelService.getUriLabel(home) : undefined,
		}, {
			home: URI.file(`/home/test/.copilot/chats/${rawId}`).toString(),
			label: 'Copilot/Session',
		});
	});

	test('registers the SDK session state home from recorded artifacts', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const metadata = createSession('ahp-session', { summary: 'Artifact Session' });
		agentHost.addSession({
			...metadata,
			_meta: withSessionArtifacts(metadata._meta, [{
				id: 'artifact',
				type: SessionArtifactType.File,
				label: 'Plan',
				isArtifact: true,
				uri: 'file:///home/test/.copilot/session-state/sdk-session/files/plan.md',
			}])
		});
		const labelService = new MockLabelService();
		const provider = createProvider(disposables, agentHost, undefined, {
			pathService: new TestPathService(URI.file('/home/test')),
			labelService,
		});
		provider.getSessions();
		await timeout(0);

		assert.strictEqual(
			labelService.getUriHome(URI.file('/home/test/.copilot/session-state/sdk-session/files/plan.md'))?.toString(),
			URI.file('/home/test/.copilot/session-state/sdk-session').toString()
		);
	}));

	test('session adapter uses raw ID as fallback title', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('abcdef1234567890'));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const sessions = provider.getSessions();
		const session = sessions[0];
		assert.ok(session);
		assert.strictEqual(session.title.get(), 'Session abcdef12');
	}));

	test('new session stays loading when required config is missing', async () => {
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', required: ['branch'], properties: { branch: { type: 'string', title: 'Branch', enum: ['main'] } } },
			values: {},
		};
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, config => config?.schema.required?.includes('branch') === true);

		assert.strictEqual(session.loading.get(), true);
	});

	test('cached session loading reflects authenticationPending', async () => {
		agentHost.setAuthenticationPending(true);
		agentHost.addSession(createSession('cached-auth-loading', { summary: 'Cached' }));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions().find(s => s.title.get() === 'Cached');
		assert.ok(session);
		assert.strictEqual(session!.loading.get(), true);

		agentHost.setAuthenticationPending(false);
		assert.strictEqual(session!.loading.get(), false);
	});

	test('new session defers backend startup until authentication settles', async () => {
		agentHost.setAuthenticationPending(true);
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);

		await timeout(0);

		// While auth is pending, config/backend work is intentionally deferred.
		// Providers such as Codex reject those calls with AuthRequired before the
		// first auth pass settles.
		assert.deepStrictEqual({
			loading: session.loading.get(),
			createdSessions: agentHost.createdSessionUris.length,
			resolveRequests: agentHost.resolveSessionConfigRequests.length,
			config: provider.getSessionConfig(session.sessionId),
		}, {
			loading: true,
			createdSessions: 0,
			resolveRequests: 0,
			config: { schema: { type: 'object', properties: {} }, values: {} },
		});

		agentHost.setAuthenticationPending(false);
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.isolation === 'worktree');

		assert.deepStrictEqual({
			loading: session.loading.get(),
			createdSessions: agentHost.createdSessionUris.length,
			resolveRequests: agentHost.resolveSessionConfigRequests.length,
			config: provider.getSessionConfig(session.sessionId),
		}, {
			loading: false,
			createdSessions: 1,
			resolveRequests: 1,
			config: { schema: { type: 'object', properties: {} }, values: { isolation: 'worktree' } },
		});
	});

	test('new session stays loading after authentication settles when required config is missing', async () => {
		agentHost.setAuthenticationPending(true);
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', required: ['branch'], properties: { branch: { type: 'string', title: 'Branch', enum: ['main'] } } },
			values: {},
		};
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);

		await timeout(0);

		assert.deepStrictEqual({
			loading: session.loading.get(),
			createdSessions: agentHost.createdSessionUris.length,
			resolveRequests: agentHost.resolveSessionConfigRequests.length,
			config: provider.getSessionConfig(session.sessionId),
		}, {
			loading: true,
			createdSessions: 0,
			resolveRequests: 0,
			config: { schema: { type: 'object', properties: {} }, values: {} },
		});

		agentHost.setAuthenticationPending(false);
		await waitForSessionConfig(provider, session.sessionId, config => config?.schema.required?.includes('branch') === true);

		assert.deepStrictEqual({
			loading: session.loading.get(),
			createdSessions: agentHost.createdSessionUris.length,
			resolveRequests: agentHost.resolveSessionConfigRequests.length,
			config: provider.getSessionConfig(session.sessionId),
		}, {
			loading: true,
			createdSessions: 1,
			resolveRequests: 1,
			config: {
				schema: { type: 'object', required: ['branch'], properties: { branch: { type: 'string', title: 'Branch', enum: ['main'] } } },
				values: {},
			},
		});
	});

	// ---- sendRequest -------

	test('sendRequest throws for unknown session', async () => {
		const provider = createProvider(disposables, agentHost);
		await assert.rejects(
			() => provider.sendRequest('nonexistent', URI.parse('untitled:chat'), { query: 'test' }),
			/not found/,
		);
	});

	test('sendRequest only commits a session of the same type, ignoring a foreign-type session that appears mid-send', async () => {
		// Regression test: the local agent host runs a single provider whose
		// session cache holds every agent-host session type (codex, claude,
		// copilot). When a slow session (e.g. codex cold start) is sent while a
		// session of a DIFFERENT type appears in the cache, `_waitForNewSession`
		// must not latch onto that foreign session and return it as the codex
		// commit — otherwise the active session is swapped to the wrong type.
		const codexAndClaude = [
			{ type: 'agent-host-codex', name: 'codex', displayName: 'Codex', description: 'test', icon: undefined },
			{ type: 'agent-host-claude', name: 'claude', displayName: 'Claude', description: 'test', icon: undefined },
		];
		agentHost.setAgents([
			{ provider: 'codex', displayName: 'Codex', description: '', models: [] } as AgentInfo,
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
		]);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, true);
		const provider = createProvider(disposables, agentHost, codexAndClaude, {
			openSession: true,
			configurationService,
			sendRequest: async (): Promise<ChatSendResult> => {
				// While the codex send is in flight, a foreign-type (claude)
				// session shows up in the host's list (e.g. restored from an
				// earlier run), and the real codex session also commits.
				agentHost.addSession(createSession('foreign-claude', { provider: 'claude', summary: 'Foreign Claude' }));
				agentHost.addSession(createSession('real-codex', { provider: 'codex', summary: 'Real Codex' }));
				return { kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never };
			},
		});

		const session = provider.createNewSession(URI.parse('file:///home/user/project'), 'codex');
		const chat = await provider.createNewChat(session.sessionId);
		const committed = await provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' });

		assert.strictEqual(committed.resource.scheme, 'agent-host-codex', `expected the committed session to be the codex session, got ${committed.resource.toString()}`);
	});

	test('sendRequest waits beyond 30 seconds for the backend session to commit', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createProvider(disposables, agentHost, undefined, {
			openSession: true,
			sendRequest: async (): Promise<ChatSendResult> => ({ kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never }),
		});
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		const chat = await provider.createNewChat(session.sessionId);

		const request = provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' });
		await timeout(0);
		await timeout(30_001);
		agentHost.addSession(createSession(session.sessionId, { summary: 'Committed Late' }));
		agentHost.fireAction({
			channel: buildDefaultChatUri(AgentSession.uri('copilotcli', session.sessionId).toString()),
			action: { type: ActionType.ChatTurnComplete },
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);
		await timeout(0);

		const committed = await request;
		assert.strictEqual(committed.title.get(), 'Committed Late');
	}));

	test('sendRequest does not advertise a cached committed session alongside its draft', async () => {
		const provider = createProvider(disposables, agentHost, undefined, {
			openSession: true,
			sendRequest: async (resource): Promise<ChatSendResult> => {
				const rawId = AgentSession.id(resource);
				agentHost.addSession(createSession(rawId, { summary: 'Committed Session' }));
				fireSessionAdded(agentHost, rawId, { title: 'Committed Session' });
				return { kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never };
			},
		});
		await timeout(0);

		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		const chat = await provider.createNewChat(session.sessionId);
		const draftAdvertised = new DeferredPromise<void>();
		disposables.add(provider.onDidChangeSessions(e => {
			if (e.added.includes(session)) {
				draftAdvertised.complete();
			}
		}));
		agentHost.listSessionsBarrier = new DeferredPromise<void>();
		const request = provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' });

		await draftAdvertised.p;
		const advertised = provider.getSessions().filter(candidate => isEqual(candidate.resource, session.resource));
		agentHost.listSessionsBarrier.complete();
		await request;

		assert.deepStrictEqual({
			count: advertised.length,
			isDraft: advertised[0] === session,
			resources: advertised.map(candidate => candidate.resource.toString()),
		}, {
			count: 1,
			isDraft: true,
			resources: [session.resource.toString()],
		});
	});

	test('sessionAdded does not advertise a committed session alongside its pending draft', async () => {
		const provider = createProvider(disposables, agentHost, undefined, {
			openSession: true,
			sendRequest: async (): Promise<ChatSendResult> => ({ kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never }),
		});
		await timeout(0);

		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		const chat = await provider.createNewChat(session.sessionId);
		const draftAdvertised = new DeferredPromise<void>();
		disposables.add(provider.onDidChangeSessions(e => {
			if (e.added.includes(session)) {
				draftAdvertised.complete();
			}
		}));
		agentHost.listSessionsBarrier = new DeferredPromise<void>();
		const request = provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' });

		await draftAdvertised.p;
		const rawId = AgentSession.id(session.resource);
		agentHost.addSession(createSession(rawId, { summary: 'Committed Session' }));
		fireSessionAdded(agentHost, rawId, { title: 'Committed Session' });
		const advertised = provider.getSessions().filter(candidate => isEqual(candidate.resource, session.resource));
		agentHost.listSessionsBarrier.complete();
		await request;

		assert.deepStrictEqual({
			count: advertised.length,
			isDraft: advertised[0] === session,
			resources: advertised.map(candidate => candidate.resource.toString()),
		}, {
			count: 1,
			isDraft: true,
			resources: [session.resource.toString()],
		});
	});

	test('sendRequest rejects when the provisional session is abandoned before commit', async () => {
		const provider = createProvider(disposables, agentHost, undefined, {
			openSession: true,
			sendRequest: async (): Promise<ChatSendResult> => ({ kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never }),
		});
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		const chat = await provider.createNewChat(session.sessionId);
		const rejection = assert.rejects(
			provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' }),
			/session was not committed/,
		);

		await timeout(0);
		provider.deleteNewSession(session.sessionId);
		await rejection;
		assert.deepStrictEqual(changes.map(change => ({
			added: change.added.map(session => session.resource.toString()),
			removed: change.removed.map(session => session.resource.toString()),
		})), [
			{ added: [session.resource.toString()], removed: [] },
			{ added: [], removed: [session.resource.toString()] },
		]);
	});

	test('two concurrent same-type new-session sends each commit to their own session (no swap during a shared download window)', async () => {
		// Regression: when the first send of a session type triggers a lengthy
		// bring-up (e.g. the Claude SDK download) and a SECOND session of the
		// same type is started and sent before it finishes, both sends park in
		// `_waitForNewSession`. A committed backend session keeps the eager id
		// its send created it with, so each send must graduate onto its OWN id.
		// Matching purely by novelty + scheme would let the two waiters SWAP
		// sessions — whichever materializes first is grabbed by the send that
		// parked first, regardless of ownership — leaving the user on the wrong
		// session. Here the SECOND session (B) materializes BEFORE the first
		// (A), which is exactly the ordering that triggered the swap.
		const provider = createProvider(disposables, agentHost, undefined, {
			openSession: true,
			sendRequest: async (): Promise<ChatSendResult> => ({ kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never }),
		});
		const sessionTypeId = provider.sessionTypes[0].id;

		const sessionA = provider.createNewSession(URI.parse('file:///home/user/a'), sessionTypeId);
		const chatA = await provider.createNewChat(sessionA.sessionId);
		const ownA = AgentSession.id(chatA.resource.toString());
		const sessionB = provider.createNewSession(URI.parse('file:///home/user/b'), sessionTypeId);
		const chatB = await provider.createNewChat(sessionB.sessionId);
		const ownB = AgentSession.id(chatB.resource.toString());

		// Start both sends; each parks in `_waitForNewSession` (listSessions is
		// empty because neither session has materialized yet).
		const sendA = provider.sendRequest(sessionA.sessionId, chatA.resource, { query: 'A' });
		const sendB = provider.sendRequest(sessionB.sessionId, chatB.resource, { query: 'B' });
		await new Promise<void>(resolve => setTimeout(resolve, 10));

		// The committed session keeps each send's own (eager) id. Materialize B
		// FIRST, then A — the ordering that made A grab B's session.
		fireSessionAdded(agentHost, ownB, { title: 'B' });
		await new Promise<void>(resolve => setTimeout(resolve, 10));
		fireSessionAdded(agentHost, ownA, { title: 'A' });

		const [committedA, committedB] = await Promise.all([sendA, sendB]);

		assert.deepStrictEqual(
			{ a: AgentSession.id(committedA.resource.toString()), b: AgentSession.id(committedB.resource.toString()) },
			{ a: ownA, b: ownB },
		);
	});

	test('sendRequest forwards resolved session config to chat service', async () => {
		const sendOptions: IChatSendRequestOptions[] = [];
		const provider = createProvider(disposables, agentHost, undefined, {
			openSession: true,
			sendRequest: async (_resource, _message, options): Promise<ChatSendResult> => {
				if (options) {
					sendOptions.push(options);
				}
				agentHost.addSession(createSession('created-from-send', { summary: 'Created From Send' }));
				return { kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never };
			},
		});
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.isolation === 'worktree');

		const chat = await provider.createNewChat(session.sessionId);
		const committed = await provider.sendRequest(session.sessionId, chat.resource, { query: 'hello', title: 'Pull Request', hideFromTranscript: true });

		assert.deepStrictEqual({
			sendOptions: sendOptions.map(options => ({
				agentHostSessionConfig: options.agentHostSessionConfig,
				hideFromTranscript: options.hideFromTranscript,
			})),
			title: committed.title.get(),
		}, {
			sendOptions: [{ agentHostSessionConfig: { isolation: 'worktree' }, hideFromTranscript: true }],
			title: 'Pull Request',
		});
	});

	test('sendRequest clears chat input draft while preserving selected model and agent', async () => {
		const inputStates: Partial<IChatModelInputState>[] = [];
		const languageModel = createTestLanguageModel('selected-model');
		const provider = createProvider(disposables, agentHost, undefined, {
			lookupLanguageModel: modelId => modelId === 'agent-host-copilotcli:selected-model' ? languageModel : undefined,
			acquireOrLoadSession: async () => {
				const inputModel = new class extends mock<IInputModel>() {
					override readonly state = constObservable<IChatModelInputState | undefined>(undefined);
					override setState(state: Partial<IChatModelInputState>): void {
						inputStates.push(state);
					}
					override clearState(): void { }
					override toJSON(): undefined { return undefined; }
				}();
				const chatModel = new class extends mock<IChatModel>() {
					override readonly inputModel = inputModel;
				}();
				return {
					object: chatModel,
					dispose() { },
				} satisfies IChatModelReference;
			},
		});
		fireSessionAdded(agentHost, 'send-draft', { title: 'Send Draft Session' });
		const session = provider.getSessions().find(s => s.title.get() === 'Send Draft Session');
		assert.ok(session);
		provider.setModel(session!.sessionId, session!.resource, 'agent-host-copilotcli:selected-model', ChatModelSource.Chosen);
		provider.setAgent?.(session!.sessionId, { uri: 'agent://review', name: 'review' });
		agentHost.dispatchedActions.length = 0;
		inputStates.length = 0;

		await provider.sendRequest(session!.sessionId, session!.resource, { query: 'hello' });

		assert.deepStrictEqual({
			protocolDraftActions: agentHost.dispatchedActions.filter(d => d.action.type === ActionType.ChatDraftChanged).length,
			hasSelectedModelUpdate: inputStates.some(state => state.selectedModel?.identifier === 'agent-host-copilotcli:selected-model'),
			lastInputState: inputStates.at(-1),
		}, {
			protocolDraftActions: 0,
			hasSelectedModelUpdate: true,
			lastInputState: {
				mode: { id: 'agent://review', kind: ChatModeKind.Agent },
				inputText: '',
				attachments: [],
				selections: [],
			},
		});
	});

	// ---- Running session config seeding (from SessionState.config) -------

	test('getSessionConfig seeds running config from session state subscription with full schema', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('seed-1', { summary: 'Seeded Session' }));
		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Seeded Session');
		assert.ok(session);

		// Initially the cache has nothing for this session — the picker reads
		// `undefined` while the subscription kicks off (and starts subscribing).
		assert.strictEqual(provider.getSessionConfig(session!.sessionId), undefined);

		// Now have the fake host hydrate the session-state snapshot with a
		// config containing one mutable and one read-only property.
		const config: SessionConfigState = {
			schema: {
				type: 'object',
				properties: {
					autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'], sessionMutable: true },
					isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'], readOnly: true },
				},
			},
			values: { autoApprove: 'default', isolation: 'worktree' },
		};
		const fakeState: SessionState = {
			provider: 'copilotcli', title: 'Seeded Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			config,
		};
		agentHost.setSessionState('seed-1', 'copilotcli', fakeState);

		await waitForSessionConfig(provider, session!.sessionId, c => c?.values.autoApprove === 'default');

		// The full schema + values are retained (non-mutable values are
		// required by the JSONC settings editor to round-trip via replace
		// semantics without dropping server-side config).
		const seeded = provider.getSessionConfig(session!.sessionId);
		assert.deepStrictEqual({
			properties: Object.keys(seeded?.schema.properties ?? {}).sort(),
			values: seeded?.values,
		}, {
			properties: ['autoApprove', 'isolation'],
			values: { autoApprove: 'default', isolation: 'worktree' },
		});
	}));

	test('running config state seeding preserves already-resolved schema properties', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('seed-schema', { summary: 'Schema Preserve Session' }));
		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Schema Preserve Session');
		assert.ok(session);

		const fullState: SessionState = {
			provider: 'copilotcli', title: 'Schema Preserve Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			config: {
				schema: {
					type: 'object',
					properties: {
						'codex.sandboxMode': { type: 'string', title: 'Sandbox', enum: ['read-only', 'workspace-write'], sessionMutable: true },
						'codex.networkAccessEnabled': { type: 'boolean', title: 'Network', default: false, sessionMutable: true },
					},
				},
				values: { 'codex.sandboxMode': 'workspace-write', 'codex.networkAccessEnabled': false },
			},
		};
		agentHost.setSessionState('seed-schema', 'copilotcli', fullState);
		await waitForSessionConfig(provider, session!.sessionId, c => c?.schema.properties['codex.networkAccessEnabled'] !== undefined);

		agentHost.setSessionState('seed-schema', 'copilotcli', {
			...fullState,
			config: {
				schema: {
					type: 'object',
					properties: {
						'codex.sandboxMode': { type: 'string', title: 'Sandbox', enum: ['read-only', 'workspace-write'], sessionMutable: true },
					},
				},
				values: { 'codex.sandboxMode': 'workspace-write' },
			},
		});

		assert.deepStrictEqual({
			properties: Object.keys(provider.getSessionConfig(session!.sessionId)?.schema.properties ?? {}).sort(),
			values: provider.getSessionConfig(session!.sessionId)?.values,
		}, {
			properties: ['codex.networkAccessEnabled', 'codex.sandboxMode'],
			values: { 'codex.sandboxMode': 'workspace-write', 'codex.networkAccessEnabled': false },
		});
	}));

	test('removing a session disposes its session-state subscription', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('seed-2', { summary: 'Sub Session' }));
		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Sub Session');
		assert.ok(session);

		// Trigger lazy subscription
		provider.getSessionConfig(session!.sessionId);
		const sessionUriStr = AgentSession.uri('copilotcli', 'seed-2').toString();
		assert.strictEqual(agentHost.sessionSubscribeCounts.get(sessionUriStr), 1);
		assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr) ?? 0, 0);

		fireSessionRemoved(agentHost, 'seed-2');

		assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr), 1);
	}));

	test('session-state subscription auto-releases after the idle window', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('idle-1', { summary: 'Idle Session' }));
		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Idle Session');
		assert.ok(session);

		const sessionUriStr = AgentSession.uri('copilotcli', 'idle-1').toString();

		// Initial access subscribes.
		provider.getSessionConfig(session!.sessionId);
		assert.strictEqual(agentHost.sessionSubscribeCounts.get(sessionUriStr), 1);
		assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr) ?? 0, 0);

		// Repeated access within the idle window does not re-subscribe.
		await timeout(20_000);
		provider.getSessionConfig(session!.sessionId);
		assert.strictEqual(agentHost.sessionSubscribeCounts.get(sessionUriStr), 1, 'still one wire subscribe');
		assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr) ?? 0, 0, 'no unsubscribe yet (timer reset)');

		// Idle past the 30 s window — wire unsubscribe fires.
		await timeout(31_000);
		assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr), 1, 'wire unsubscribe after idle window');

		// Re-access after release re-subscribes.
		provider.getSessionConfig(session!.sessionId);
		assert.strictEqual(agentHost.sessionSubscribeCounts.get(sessionUriStr), 2, 'fresh subscribe after release');
	}));

	// ---- gitHubInfo / PR icon -------

	test('equivalent session descriptions do not notify observers', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'description-stable', { title: 'Session' });
		const session = provider.getSessions().find(s => AgentSession.id(s.resource.toString()) === 'description-stable') as AgentHostSessionAdapter;
		assert.ok(session);
		session.status.set(SessionStatus.InProgress, undefined);
		session.setActivity('Working');
		let updateCount = 0;
		disposables.add(autorun(reader => {
			session.description.read(reader);
			updateCount++;
		}));

		session.status.set(SessionStatus.NeedsInput, undefined);

		assert.strictEqual(updateCount, 1);
	});

	test('equivalent GitHub info does not notify observers', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const makePullRequest = (): IGitHubPullRequest => ({
			number: 42,
			title: 'PR',
			body: '',
			state: GitHubPullRequestState.Closed,
			author: { login: 'author', avatarUrl: '' },
			headRef: 'feature',
			headSha: 'head',
			baseRef: 'main',
			isDraft: false,
			createdAt: new Date(0).toISOString(),
			updatedAt: new Date(0).toISOString(),
			mergedAt: undefined,
			mergeable: false,
			mergeableState: 'blocked',
		});
		const pullRequest = observableValue<IGitHubPullRequest | undefined>('pullRequest', makePullRequest());
		const gitHubService = new class extends mock<IGitHubService>() {
			private readonly _model = { pullRequest } as unknown as GitHubPullRequestModel;
			override createPullRequestModelReference = () => new ImmortalReference(this._model);
		}();
		agentHost.addSession(createSession('github-stable', { summary: 'PR Session', project: { uri: URI.parse('file:///repo'), displayName: 'repo' } }));
		const provider = createProvider(disposables, agentHost, undefined, { gitHubService });
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'PR Session');
		assert.ok(session);
		provider.getSessionConfig(session.sessionId);
		agentHost.setSessionState('github-stable', 'copilotcli', {
			provider: 'copilotcli',
			title: 'PR Session',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			_meta: { github: { owner: 'owner', repo: 'repo', pullRequestUrl: 'https://github.com/owner/repo/pull/42' } },
		});
		const gitHubInfo = session.workspace.get()!.folders[0]!.gitRepository!.gitHubInfo;
		let updateCount = 0;
		disposables.add(autorun(reader => {
			gitHubInfo.read(reader);
			updateCount++;
		}));

		pullRequest.set(makePullRequest(), undefined);

		assert.deepStrictEqual({
			updateCount,
			mainTitle: gitHubInfo.get()?.pullRequest?.title,
			historyTitles: gitHubInfo.get()?.pullRequests?.map(ref => ref.title),
		}, {
			updateCount: 1,
			mainTitle: 'PR',
			historyTitles: ['PR'],
		});
	}));

	test.skip('keeps a resolved PR number sticky across gitHubInfo recomputes (no re-lookup / icon flap)', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// A GitHub service that resolves a PR number asynchronously (mirroring the
		// real `findPullRequestNumberByHeadBranch` REST lookup) and hands out a
		// live PR model. We count lookups so we can assert the number is resolved
		// exactly once and then reused, rather than re-queried (and reset to
		// `undefined`) every time `gitHubInfo` recomputes.
		const gitHubService = new class extends mock<IGitHubService>() {
			lookupCalls = 0;
			private readonly _model = { pullRequest: constObservable(undefined) } as unknown as GitHubPullRequestModel;
			override findPullRequestNumberByHeadBranch = async () => {
				this.lookupCalls++;
				return 42;
			};
			override createPullRequestModelReference = () => new ImmortalReference(this._model);
		}();

		agentHost.addSession(createSession('pr-sticky', { summary: 'PR Session', project: { uri: URI.parse('file:///repo'), displayName: 'repo' } }));
		const provider = createProvider(disposables, agentHost, undefined, { gitHubService });
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'PR Session');
		assert.ok(session);

		// Force a session-state subscription and push git coords so the session
		// resolves owner/repo/branch and looks up its PR number.
		provider.getSessionConfig(session!.sessionId);
		agentHost.setSessionState('pr-sticky', 'copilotcli', {
			provider: 'copilotcli', title: 'PR Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			_meta: { git: { hasGitHubRemote: true, githubOwner: 'owner', githubRepo: 'repo', branchName: 'feature' } },
		});

		const gitHubInfoObs = session!.workspace.get()!.folders[0]!.gitRepository!.gitHubInfo;

		// Observe until the async PR-number lookup resolves.
		const sub1 = autorun(reader => { gitHubInfoObs.read(reader); });
		await timeout(0);
		assert.strictEqual(gitHubInfoObs.get()?.pullRequest?.number, 42, 'PR number resolves while observed');
		assert.strictEqual(gitHubService.lookupCalls, 1, 'one PR-number lookup after first resolution');
		sub1.dispose();

		// Unobserve then re-observe — this mirrors a session switch / sessions-list
		// re-render, which previously recreated a fresh (unresolved) promise
		// observable and flapped the PR number back to `undefined`, disposing the
		// shared live model and blanking the icon. The number must stay resolved
		// on the very first synchronous re-read, and no new lookup may be issued.
		let firstReObservedNumber: number | undefined;
		let captured = false;
		const sub2 = autorun(reader => {
			const number = gitHubInfoObs.read(reader)?.pullRequest?.number;
			if (!captured) {
				firstReObservedNumber = number;
				captured = true;
			}
		});
		assert.strictEqual(firstReObservedNumber, 42, 'PR number stays sticky across unobserve/reobserve');
		assert.strictEqual(gitHubService.lookupCalls, 1, 'no extra PR-number lookup on recompute');
		sub2.dispose();
	}));

	test('surfaces a default open-PR icon immediately when a PR is detected before the live model loads', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// A GitHub service whose live PR model is never populated (`pullRequest` stays
		// undefined), mirroring the window right after a PR is first detected but before
		// the first live fetch completes. Without a fallback the session list row would
		// keep the read/unread dot instead of a PR icon until that fetch lands.
		const gitHubService = new class extends mock<IGitHubService>() {
			private readonly _model = { pullRequest: constObservable(undefined) } as unknown as GitHubPullRequestModel;
			override createPullRequestModelReference = () => new ImmortalReference(this._model);
		}();

		agentHost.addSession(createSession('pr-default-icon', { summary: 'PR Session', project: { uri: URI.parse('file:///repo'), displayName: 'repo' } }));
		const provider = createProvider(disposables, agentHost, undefined, { gitHubService });
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'PR Session');
		assert.ok(session);

		// Force a session-state subscription and push GitHub state carrying a PR URL so
		// the session detects the pull request while its live model is still empty.
		provider.getSessionConfig(session!.sessionId);
		agentHost.setSessionState('pr-default-icon', 'copilotcli', {
			provider: 'copilotcli', title: 'PR Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			_meta: {
				github: {
					owner: 'owner',
					repo: 'repo',
					pullRequestUrls: [
						'https://github.com/owner/repo/pull/42',
						'https://github.com/owner/repo/pull/41',
					]
				}
			},
		});

		const gitHubInfoObs = session!.workspace.get()!.folders[0]!.gitRepository!.gitHubInfo;
		const sub = autorun(reader => { gitHubInfoObs.read(reader); });
		await timeout(0);

		const gitHubInfo = gitHubInfoObs.get();
		assert.deepStrictEqual({
			activePullRequest: gitHubInfo?.pullRequest && {
				number: gitHubInfo.pullRequest.number,
				icon: gitHubInfo.pullRequest.icon,
			},
			pullRequests: gitHubInfo?.pullRequests?.map(pullRequest => ({
				number: pullRequest.number,
				uri: pullRequest.uri.toString(),
				icon: pullRequest.icon,
			}))
		}, {
			activePullRequest: {
				number: 42,
				icon: computePullRequestIcon(GitHubPullRequestState.Open),
			},
			pullRequests: [
				{
					number: 42,
					uri: 'https://github.com/owner/repo/pull/42',
					icon: computePullRequestIcon(GitHubPullRequestState.Open),
				},
				{
					number: 41,
					uri: 'https://github.com/owner/repo/pull/41',
					icon: undefined,
				},
			]
		});
		sub.dispose();
	}));

	test('uses the latest merge or pull-request outcome as the completed-state icon', async () => {
		const gitHubService = new class extends mock<IGitHubService>() {
			private readonly _model = { pullRequest: constObservable(undefined) } as unknown as GitHubPullRequestModel;
			override createPullRequestModelReference = () => new ImmortalReference(this._model);
		}();
		agentHost.addSession(createSession('completed-state-icon', { summary: 'Completed Session', project: { uri: URI.parse('file:///repo'), displayName: 'repo' } }));
		const provider = createProvider(disposables, agentHost, undefined, { gitHubService });
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(candidate => candidate.title.get() === 'Completed Session');
		assert.ok(session);
		provider.getSessionConfig(session.sessionId);

		const mergeState = withSessionSourceControlState(undefined, {
			merge: { commit: 'merge-commit' },
			latestOutcome: SessionSourceControlOutcome.Merge,
		});
		agentHost.setSessionState('completed-state-icon', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Completed Session',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			_meta: mergeState,
		});
		const mergeIcon = session.completedStateIcon?.get();

		const pullRequestState = withSessionSourceControlState(withSessionGitHubState(mergeState, {
			owner: 'owner',
			repo: 'repo',
			pullRequestUrls: ['https://github.com/owner/repo/pull/42'],
			pullRequestBranchName: 'feature',
		}), {
			merge: { commit: 'merge-commit' },
			latestOutcome: SessionSourceControlOutcome.PullRequest,
		});
		agentHost.setSessionState('completed-state-icon', 'copilotcli', {
			provider: 'copilotcli',
			title: 'Completed Session',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			_meta: pullRequestState,
		});
		const pullRequestIcon = session.completedStateIcon?.get();

		assert.deepStrictEqual({
			merge: { id: mergeIcon?.id, color: mergeIcon?.color?.id },
			pullRequest: { id: pullRequestIcon?.id, color: pullRequestIcon?.color?.id },
		}, {
			merge: { id: Codicon.gitMerge.id, color: 'charts.purple' },
			pullRequest: {
				id: computePullRequestIcon(GitHubPullRequestState.Open).id,
				color: computePullRequestIcon(GitHubPullRequestState.Open).color?.id,
			},
		});
	});

	test('filters folder-session baseline pull requests from GitHub info', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const gitHubService = new class extends mock<IGitHubService>() {
			private readonly _model = { pullRequest: constObservable(undefined) } as unknown as GitHubPullRequestModel;
			override createPullRequestModelReference = () => new ImmortalReference(this._model);
		}();

		agentHost.addSession(createSession('pr-baseline', { summary: 'PR Session', project: { uri: URI.parse('file:///repo'), displayName: 'repo' } }));
		const provider = createProvider(disposables, agentHost, undefined, { gitHubService });
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'PR Session');
		assert.ok(session);

		provider.getSessionConfig(session.sessionId);
		agentHost.setSessionState('pr-baseline', 'copilotcli', {
			provider: 'copilotcli', title: 'PR Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			_meta: {
				github: {
					owner: 'owner',
					repo: 'repo',
					pullRequestUrls: [
						'https://github.com/owner/repo/pull/42',
						'https://github.com/owner/repo/pull/41',
					],
					initialPullRequestUrls: ['https://github.com/owner/repo/pull/42'],
				}
			},
		});

		const gitHubInfo = session.workspace.get()!.folders[0]!.gitRepository!.gitHubInfo.get();
		assert.deepStrictEqual({
			activePullRequest: gitHubInfo?.pullRequest?.number,
			pullRequests: gitHubInfo?.pullRequests?.map(pullRequest => pullRequest.number),
		}, {
			activePullRequest: 41,
			pullRequests: [41],
		});
	}));

	test('promotes PR artifacts and current-branch discovery but keeps PR references out of GitHub info', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const gitHubService = new class extends mock<IGitHubService>() {
			private readonly _model = { pullRequest: constObservable(undefined) } as unknown as GitHubPullRequestModel;
			override createPullRequestModelReference = () => new ImmortalReference(this._model);
		}();

		agentHost.addSession(createSession('pr-artifacts', { summary: 'Artifact Session', project: { uri: URI.parse('file:///repo'), displayName: 'repo' } }));
		const provider = createProvider(disposables, agentHost, undefined, { gitHubService });
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Artifact Session');
		assert.ok(session);

		provider.getSessionConfig(session.sessionId);
		const meta = withSessionArtifacts(withSessionGitHubState(undefined, {
			owner: 'owner',
			repo: 'repo',
			pullRequestUrls: ['https://github.com/owner/repo/pull/41'],
		}), [
			{ id: 'a1', type: SessionArtifactType.PullRequest, label: 'Created', isArtifact: true, link: 'https://github.com/owner/repo/pull/50', isGitHub: true },
			{ id: 'a2', type: SessionArtifactType.PullRequest, label: 'Referenced', isArtifact: false, link: 'https://github.com/owner/repo/pull/60', isGitHub: true },
			{ id: 'a3', type: SessionArtifactType.PullRequest, label: 'Duplicate', isArtifact: true, link: 'https://github.com/owner/repo/pull/41/', isGitHub: true },
			{ id: 'a4', type: SessionArtifactType.Issue, label: 'Issue', isArtifact: true, link: 'https://github.com/owner/repo/issues/7', isGitHub: true },
			{ id: 'a5', type: SessionArtifactType.PullRequest, label: 'Elsewhere', isArtifact: true, link: 'https://gitlab.com/owner/repo/-/merge_requests/3', isGitHub: false },
			{ id: 'a6', type: SessionArtifactType.File, label: 'Plan', isArtifact: true, uri: 'file:///repo/plan.md' },
			{ id: 'a7', type: SessionArtifactType.Issue, label: 'Referenced issue', isArtifact: false, link: 'https://github.com/owner/repo/issues/8', isGitHub: true },
			// The pull request discovered from git state, also recorded as a
			// reference: the pull request pill already shows it, so it is dropped here.
			{ id: 'a8', type: SessionArtifactType.PullRequest, label: 'Discovered', isArtifact: false, link: 'https://github.com/owner/repo/pull/41', isGitHub: true },
		]);
		agentHost.setSessionState('pr-artifacts', 'copilotcli', {
			provider: 'copilotcli', title: 'Artifact Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			_meta: meta,
		});

		const gitHubInfo = session.workspace.get()!.folders[0]!.gitRepository!.gitHubInfo.get();
		assert.deepStrictEqual({
			activePullRequest: gitHubInfo?.pullRequest?.number,
			pullRequests: gitHubInfo?.pullRequests?.map(pullRequest => pullRequest.number),
			issues: gitHubInfo?.issues?.map(issue => issue.number),
			artifacts: session.artifacts?.get().map(artifact => artifact.id),
		}, {
			// Newest first, so the latest pull request is the active one.
			activePullRequest: 41,
			pullRequests: [41, 50],
			// Only issues the session produced are polled; a referenced one stays a reference.
			issues: [7],
			artifacts: ['a7', 'a6', 'a5', 'a2'],
		});
	}));

	test('keeps a promoted artifact in the pill when GitHub info cannot surface it', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const gitHubService = new class extends mock<IGitHubService>() {
			private readonly _model = { pullRequest: constObservable(undefined) } as unknown as GitHubPullRequestModel;
			override createPullRequestModelReference = () => new ImmortalReference(this._model);
		}();

		agentHost.addSession(createSession('pr-unsurfaced', { summary: 'Unsurfaced Session', project: { uri: URI.parse('file:///repo'), displayName: 'repo' } }));
		const provider = createProvider(disposables, agentHost, undefined, { gitHubService });
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Unsurfaced Session');
		assert.ok(session);

		provider.getSessionConfig(session.sessionId);
		// No repository at all, plus a reference belonging to another repository:
		// neither can be polled, so both have to stay visible as artifacts.
		agentHost.setSessionState('pr-unsurfaced', 'copilotcli', {
			provider: 'copilotcli', title: 'Unsurfaced Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			_meta: withSessionArtifacts(undefined, [
				{ id: 'a1', type: SessionArtifactType.Issue, label: 'Orphan issue', isArtifact: true, link: 'https://github.com/owner/repo/issues/7', isGitHub: true },
			]),
		});
		const withoutRepository = session.artifacts?.get().map(artifact => artifact.id);

		agentHost.setSessionState('pr-unsurfaced', 'copilotcli', {
			provider: 'copilotcli', title: 'Unsurfaced Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			_meta: withSessionArtifacts(withSessionGitHubState(undefined, { owner: 'owner', repo: 'repo' }), [
				{ id: 'a1', type: SessionArtifactType.Issue, label: 'Same repo', isArtifact: true, link: 'https://github.com/owner/repo/issues/7', isGitHub: true },
				{ id: 'a2', type: SessionArtifactType.PullRequest, label: 'Other repo', isArtifact: true, link: 'https://github.com/other/project/pull/9', isGitHub: true },
			]),
		});
		const gitHubInfo = session.workspace.get()!.folders[0]!.gitRepository!.gitHubInfo.get();

		assert.deepStrictEqual({
			withoutRepository,
			foreignRepository: session.artifacts?.get().map(artifact => artifact.id),
			issues: gitHubInfo?.issues?.map(issue => issue.number),
			pullRequests: gitHubInfo?.pullRequests?.map(pullRequest => pullRequest.number),
		}, {
			withoutRepository: ['a1'],
			foreignRepository: ['a2'],
			issues: [7],
			pullRequests: undefined,
		});
	}));

	// ---- replaceSessionConfig -------

	test('replaceSessionConfig only replaces sessionMutable, non-readOnly values and preserves everything else', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('rep-1', { summary: 'Replace Session' }));
		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Replace Session');
		assert.ok(session);

		const config: SessionConfigState = {
			schema: {
				type: 'object',
				properties: {
					autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'], sessionMutable: true },
					isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] }, // non-mutable
					branch: { type: 'string', title: 'Branch', enum: ['main'], sessionMutable: true, readOnly: true }, // readOnly
				},
			},
			values: { autoApprove: 'default', isolation: 'worktree', branch: 'main' },
		};
		const fakeState: SessionState = {
			provider: 'copilotcli', title: 'Replace Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			config,
		};
		agentHost.setSessionState('rep-1', 'copilotcli', fakeState);
		await waitForSessionConfig(provider, session!.sessionId, c => c?.values.autoApprove === 'default');

		// Caller attempts to change everything — including non-mutable
		// `isolation`, readOnly `branch`, and an unknown `rogue` key. Only
		// `autoApprove` should actually change; all other values must be
		// carried through unchanged and `rogue` must be dropped.
		await provider.replaceSessionConfig(session!.sessionId, {
			autoApprove: 'autoApprove',
			isolation: 'folder',
			branch: 'other',
			rogue: 'ignored',
		});

		const sessionUri = AgentSession.uri('copilotcli', 'rep-1').toString();
		const configChanged = agentHost.dispatchedActions.find(d => d.action.type === ActionType.SessionConfigChanged && d.channel === sessionUri);
		assert.ok(configChanged, 'a SessionConfigChanged action should be dispatched');
		assert.deepStrictEqual(configChanged.action, {
			type: ActionType.SessionConfigChanged,
			config: { autoApprove: 'autoApprove', isolation: 'worktree', branch: 'main' },
			replace: true,
		});

		const latest = provider.getSessionConfig(session!.sessionId);
		assert.deepStrictEqual(latest?.values, { autoApprove: 'autoApprove', isolation: 'worktree', branch: 'main' });
	}));

	test('running session config writes clamp autoApprove to default when policy disables global auto-approve', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('policy-write', { summary: 'Policy Write Session' }));
		const configService = createPolicyRestrictedConfigurationService();
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService });
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Policy Write Session');
		assert.ok(session);

		const config: SessionConfigState = {
			schema: {
				type: 'object',
				properties: {
					autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove', 'autopilot'], sessionMutable: true },
					isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'], sessionMutable: true },
				},
			},
			values: { autoApprove: 'default', isolation: 'worktree' },
		};
		const fakeState: SessionState = {
			provider: 'copilotcli', title: 'Policy Write Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			config,
		};
		agentHost.setSessionState('policy-write', 'copilotcli', fakeState);
		await waitForSessionConfig(provider, session!.sessionId, c => c?.values.autoApprove === 'default');

		await provider.setSessionConfigValue(session!.sessionId, SessionConfigKey.AutoApprove, 'autopilot');
		const sessionUri = AgentSession.uri('copilotcli', 'policy-write').toString();
		const setConfigChanged = agentHost.dispatchedActions.find(d => d.action.type === ActionType.SessionConfigChanged && d.channel === sessionUri);

		agentHost.dispatchedActions.length = 0;
		await provider.replaceSessionConfig(session!.sessionId, {
			autoApprove: 'autoApprove',
			isolation: 'folder',
		});
		const replaceConfigChanged = agentHost.dispatchedActions.find(d => d.action.type === ActionType.SessionConfigChanged && d.channel === sessionUri);

		assert.deepStrictEqual({
			setAction: setConfigChanged?.action,
			replaceAction: replaceConfigChanged?.action,
			latestValues: provider.getSessionConfig(session!.sessionId)?.values,
		}, {
			setAction: {
				type: ActionType.SessionConfigChanged,
				config: { autoApprove: 'default' },
			},
			replaceAction: {
				type: ActionType.SessionConfigChanged,
				config: { autoApprove: 'default', isolation: 'folder' },
				replace: true,
			},
			latestValues: { autoApprove: 'default', isolation: 'folder' },
		});
	}));

	test('running session config write re-resolves schema-dependent properties', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('schema-write', { summary: 'Schema Write Session' }));
		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Schema Write Session');
		assert.ok(session);

		const config: SessionConfigState = {
			schema: {
				type: 'object',
				properties: {
					'codex.sandboxMode': { type: 'string', title: 'Sandbox', enum: ['read-only', 'workspace-write'], sessionMutable: true },
					'codex.networkAccessEnabled': { type: 'boolean', title: 'Network', default: false, sessionMutable: true },
				},
			},
			values: { 'codex.sandboxMode': 'workspace-write', 'codex.networkAccessEnabled': false },
		};
		const fakeState: SessionState = {
			provider: 'copilotcli', title: 'Schema Write Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			config,
		};
		agentHost.setSessionState('schema-write', 'copilotcli', fakeState);
		await waitForSessionConfig(provider, session!.sessionId, c => c?.values['codex.sandboxMode'] === 'workspace-write');

		agentHost.resolveSessionConfigResult = {
			schema: {
				type: 'object',
				properties: {
					'codex.sandboxMode': { type: 'string', title: 'Sandbox', enum: ['read-only', 'workspace-write'], sessionMutable: true },
				},
			},
			values: { 'codex.sandboxMode': 'read-only' },
		};

		await provider.setSessionConfigValue(session!.sessionId, 'codex.sandboxMode', 'read-only');
		await waitForSessionConfig(provider, session!.sessionId, c => c?.schema.properties['codex.networkAccessEnabled'] === undefined);

		assert.deepStrictEqual({
			resolveConfig: agentHost.resolveSessionConfigRequests.at(-1)?.config,
			properties: Object.keys(provider.getSessionConfig(session!.sessionId)?.schema.properties ?? {}).sort(),
			values: provider.getSessionConfig(session!.sessionId)?.values,
		}, {
			resolveConfig: { 'codex.sandboxMode': 'read-only', 'codex.networkAccessEnabled': false },
			properties: ['codex.sandboxMode'],
			values: { 'codex.sandboxMode': 'read-only' },
		});

		agentHost.setSessionState('schema-write', 'copilotcli', {
			...fakeState,
			config: {
				...config,
				values: { 'codex.sandboxMode': 'read-only', 'codex.networkAccessEnabled': true },
			},
		});

		assert.deepStrictEqual({
			properties: Object.keys(provider.getSessionConfig(session!.sessionId)?.schema.properties ?? {}).sort(),
			values: provider.getSessionConfig(session!.sessionId)?.values,
		}, {
			properties: ['codex.sandboxMode'],
			values: { 'codex.sandboxMode': 'read-only' },
		});
	}));

	test('replaceSessionConfig is a no-op when nothing editable actually changes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('rep-2', { summary: 'No-op Session' }));
		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'No-op Session');
		assert.ok(session);

		const config: SessionConfigState = {
			schema: {
				type: 'object',
				properties: {
					autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'], sessionMutable: true },
					isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] },
				},
			},
			values: { autoApprove: 'default', isolation: 'worktree' },
		};
		const fakeState: SessionState = {
			provider: 'copilotcli', title: 'No-op Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			config,
		};
		agentHost.setSessionState('rep-2', 'copilotcli', fakeState);
		await waitForSessionConfig(provider, session!.sessionId, c => c?.values.autoApprove === 'default');

		const before = agentHost.dispatchedActions.length;
		// Caller re-asserts the same editable value; everything else either
		// matches or is non-editable.
		await provider.replaceSessionConfig(session!.sessionId, { autoApprove: 'default' });
		assert.strictEqual(agentHost.dispatchedActions.length, before, 'no action should be dispatched');
	}));

	// ---- Server-echoed SessionConfigChanged -------

	test('projects Agent Merge enablement without notifying for unrelated session state changes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('agent-merge-enabled', { summary: 'Agent Merge Session' }));
		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(session => session.title.get() === 'Agent Merge Session');
		assert.ok(session);
		const agentMergeState = provider.getAgentMergeClientStateObservable(session.sessionId);

		const observed: boolean[] = [];
		const observer = disposables.add(autorun(reader => observed.push(agentMergeState.read(reader)?.enabled === true)));
		const sessionUri = AgentSession.uri('copilotcli', 'agent-merge-enabled').toString();
		const defaultChatUri = buildDefaultChatUri(sessionUri);
		const subscriptionsWhileObserved = {
			session: agentHost.sessionSubscribeCounts.get(sessionUri) ?? 0,
			defaultChat: agentHost.sessionSubscribeCounts.get(defaultChatUri) ?? 0,
		};
		const state = (enabled: boolean, autoApprove: string): SessionState => ({
			provider: 'copilotcli',
			title: 'Agent Merge Session',
			status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			config: {
				schema: {
					type: 'object',
					properties: {
						autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'], sessionMutable: true },
					},
				},
				values: {
					autoApprove,
					[SessionConfigKey.AgentMerge]: { enabled },
				},
			},
		});

		agentHost.setSessionState('agent-merge-enabled', 'copilotcli', state(true, 'default'));
		agentHost.setSessionState('agent-merge-enabled', 'copilotcli', state(true, 'autoApprove'));
		agentHost.setSessionState('agent-merge-enabled', 'copilotcli', state(false, 'autoApprove'));
		observer.dispose();
		await timeout(10_000);
		const replacementObserver = disposables.add(autorun(reader => observed.push(agentMergeState.read(reader)?.enabled === true)));
		const subscriptionsAfterReobserve = agentHost.sessionSubscribeCounts.get(sessionUri) ?? 0;
		replacementObserver.dispose();
		await timeout(31_000);

		assert.deepStrictEqual({
			subscriptionsWhileObserved,
			subscriptionsAfterReobserve,
			observed,
			current: agentMergeState.get()?.enabled,
			unsubscriptionsAfterIdle: {
				session: agentHost.sessionUnsubscribeCounts.get(sessionUri) ?? 0,
				defaultChat: agentHost.sessionUnsubscribeCounts.get(defaultChatUri) ?? 0,
			},
		}, {
			subscriptionsWhileObserved: { session: 1, defaultChat: 0 },
			subscriptionsAfterReobserve: 1,
			observed: [false, true, false, false],
			current: false,
			unsubscriptionsAfterIdle: { session: 1, defaultChat: 0 },
		});
	}));

	test('server-echoed SessionConfigChanged merges config values into the running cache by default', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('cfg-merge', { summary: 'Merge Session' }));
		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Merge Session');
		assert.ok(session);

		const fakeState: SessionState = {
			provider: 'copilotcli', title: 'Merge Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			config: {
				schema: {
					type: 'object',
					properties: {
						autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'], sessionMutable: true },
						isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] },
					},
				},
				values: { autoApprove: 'default', isolation: 'worktree' },
			},
		};
		agentHost.setSessionState('cfg-merge', 'copilotcli', fakeState);
		await waitForSessionConfig(provider, session!.sessionId, c => c?.values.autoApprove === 'default');

		agentHost.fireAction({
			channel: AgentSession.uri('copilotcli', 'cfg-merge').toString(),
			action: {
				type: ActionType.SessionConfigChanged,
				config: { autoApprove: 'autoApprove' },
			},
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);

		const updated = provider.getSessionConfig(session!.sessionId);
		assert.deepStrictEqual(updated?.values, { autoApprove: 'autoApprove', isolation: 'worktree' });
	}));

	test('server-echoed SessionConfigChanged with replace:true overwrites the running cache', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('cfg-replace', { summary: 'Replace Session' }));
		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Replace Session');
		assert.ok(session);

		const fakeState: SessionState = {
			provider: 'copilotcli', title: 'Replace Session', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			config: {
				schema: {
					type: 'object',
					properties: {
						autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'], sessionMutable: true },
						mode: { type: 'string', title: 'Mode', enum: ['a', 'b'], sessionMutable: true },
						isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] },
					},
				},
				values: { autoApprove: 'default', mode: 'a', isolation: 'worktree' },
			},
		};
		agentHost.setSessionState('cfg-replace', 'copilotcli', fakeState);
		await waitForSessionConfig(provider, session!.sessionId, c => c?.values.autoApprove === 'default');

		agentHost.fireAction({
			channel: AgentSession.uri('copilotcli', 'cfg-replace').toString(),
			action: {
				type: ActionType.SessionConfigChanged,
				config: { autoApprove: 'autoApprove', isolation: 'worktree' },
				replace: true,
			},
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);

		// `mode` is dropped because it wasn't re-asserted in the replace payload.
		const updated = provider.getSessionConfig(session!.sessionId);
		assert.deepStrictEqual(updated?.values, { autoApprove: 'autoApprove', isolation: 'worktree' });
	}));

	test('keeps a visible session subscribed so host-spawned subagent chats keep reaching the catalog', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Regression for the "Open Subagent" pill: a passively-watched session
		// must stay subscribed so a host-spawned subagent's `chatAdded` keeps
		// reaching the catalog past the idle-release window.
		agentHost.addSession(createSession('subagent-live', { summary: 'Lead' }));
		const visibleSessions = observableValue<readonly (IActiveSession | undefined)[]>('visible', []);
		const provider = createProvider(disposables, agentHost, undefined, { visibleSessions });
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions()[0];

		// The session's view is on screen: its state subscription must be pinned.
		visibleSessions.set([new class extends mock<IActiveSession>() {
			override readonly resource = session.resource;
		}()], undefined);

		const sessionUri = AgentSession.uri('copilotcli', 'subagent-live').toString();
		const defaultChat = buildDefaultChatUri(sessionUri);
		const subagentOne = buildSubagentChatUri(sessionUri, 'tc-1');
		const subagentTwo = buildSubagentChatUri(sessionUri, 'tc-2');
		const toolChat = (resource: string, toolCallId: string, title: string): ChatSummary => ({
			resource, title, status: ProtocolSessionStatus.InProgress, modifiedAt: new Date(0).toISOString(),
			origin: { kind: ProtocolChatOriginKind.Tool, chat: defaultChat, toolCallId },
		});
		const stateWith = (chats: ChatSummary[]): SessionState => ({
			provider: 'copilotcli', title: 'Lead', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready, activeClients: [], defaultChat, chats,
		});
		const defaultSummary: ChatSummary = { resource: defaultChat, title: '', status: ProtocolSessionStatus.Idle, modifiedAt: new Date(0).toISOString() };

		agentHost.setSessionState('subagent-live', 'copilotcli', stateWith([defaultSummary, toolChat(subagentOne, 'tc-1', 'Add name to README')]));
		assert.ok(session.chats.get().some(c => c.resource.fragment === 'subagent/tc-1'), 'first subagent should reach the catalog while visible');

		// Advance well past the idle-release window; a passively-watched session
		// used to drop its state listener here.
		await timeout(120_000);

		// A second subagent spawns later in the same run; it must still reach the
		// catalog because the visible session stayed subscribed.
		agentHost.setSessionState('subagent-live', 'copilotcli', stateWith([
			defaultSummary,
			toolChat(subagentOne, 'tc-1', 'Add name to README'),
			toolChat(subagentTwo, 'tc-2', 'Add description to package.json'),
		]));

		assert.deepStrictEqual(
			session.chats.get().map(c => c.resource.fragment).filter(f => f.startsWith('subagent/')).sort(),
			['subagent/tc-1', 'subagent/tc-2'],
			'both subagents should reach the catalog after the idle window while the session stays visible',
		);
	}));
});

suite.skip('LocalAgentHostSessionsProvider - active-session branch changeset subscription', () => {
	const disposables = new DisposableStore();
	let agentHost: MockAgentHostService;
	let activeSession: ISettableObservable<IActiveSession | undefined>;

	setup(() => {
		agentHost = disposables.add(new MockAgentHostService());
		activeSession = observableValue<IActiveSession | undefined>('test.activeSession', undefined);
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function makeActive(rawId: string, sessionType: string = 'copilotcli', status: SessionStatus = SessionStatus.Completed): IActiveSession {
		return {
			// providerId: 'unused',
			sessionType,
			resource: URI.from({ scheme: `agent-host-${sessionType}`, path: `/${rawId}` }),
			status: constObservable(status),
		} as unknown as IActiveSession;
	}

	function branchChangesKeyFor(rawId: string, sessionType: string = 'copilotcli'): string {
		return `${AgentSession.uri(sessionType, rawId).toString()}/changeset/branch`;
	}

	// The adapter subscribes to its branch changeset lazily — only while the
	// session is active AND its `changes` / `changesSummary` observable is being
	// observed. Keep an autorun alive so that the subscription is established.
	function observeSession(session: ISession): void {
		disposables.add(autorun(reader => {
			session.changes.read(reader);
			session.changesSummary?.read(reader);
		}));
	}

	function addAndObserve(provider: LocalAgentHostSessionsProvider, rawId: string, opts?: { changes?: ChangesSummary }): ISession {
		fireSessionAdded(agentHost, rawId, { title: `Session ${rawId}`, changes: opts?.changes });
		const session = provider.getSessions().find(s => s.title.get() === `Session ${rawId}`);
		assert.ok(session, `expected session ${rawId}`);
		observeSession(session);
		return session;
	}

	test('subscribes to the branch changeset when the session becomes active', () => {
		const provider = createProvider(disposables, agentHost, undefined, { activeSession });
		addAndObserve(provider, 'sess-A');

		activeSession.set(makeActive('sess-A'), undefined);

		const key = branchChangesKeyFor('sess-A');
		assert.ok(
			agentHost.wireOps.includes(`subscribe:${key}`),
			`expected a subscribe for ${key}, got wireOps=${JSON.stringify(agentHost.wireOps)}`,
		);
	});

	test('rotates the subscription when the active session changes', () => {
		const provider = createProvider(disposables, agentHost, undefined, { activeSession });
		addAndObserve(provider, 'sess-A');
		addAndObserve(provider, 'sess-B');

		activeSession.set(makeActive('sess-A'), undefined);
		assert.strictEqual(agentHost.sessionSubscribeCounts.get(branchChangesKeyFor('sess-A')) ?? 0, 1, 'A should be subscribed once on activation');

		activeSession.set(makeActive('sess-B'), undefined);
		assert.strictEqual(agentHost.sessionSubscribeCounts.get(branchChangesKeyFor('sess-B')) ?? 0, 1, 'B should be subscribed once on activation');
		assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(branchChangesKeyFor('sess-A')) ?? 0, 1, 'A should be unsubscribed when no longer active');
	});

	test('switching back to a previously-active session re-subscribes', () => {
		const provider = createProvider(disposables, agentHost, undefined, { activeSession });
		addAndObserve(provider, 'sess-A');
		addAndObserve(provider, 'sess-B');

		activeSession.set(makeActive('sess-A'), undefined);
		activeSession.set(makeActive('sess-B'), undefined);
		activeSession.set(makeActive('sess-A'), undefined);

		const subsForA = agentHost.sessionSubscribeCounts.get(branchChangesKeyFor('sess-A')) ?? 0;
		assert.strictEqual(subsForA, 2, 'switching back to A must open a fresh subscription');
	});

	test('does NOT subscribe when a different session is active', () => {
		const provider = createProvider(disposables, agentHost, undefined, { activeSession });
		addAndObserve(provider, 'sess-A');

		activeSession.set(makeActive('sess-other'), undefined);

		assert.strictEqual(
			agentHost.sessionSubscribeCounts.get(branchChangesKeyFor('sess-A')) ?? 0,
			0,
			'no branch changeset subscription should open while a different session is active',
		);
	});

	test('does NOT subscribe to uncommitted changes for an untitled active session', () => {
		createProvider(disposables, agentHost, undefined, { activeSession });

		activeSession.set(makeActive('sess-new', 'copilotcli', SessionStatus.Untitled), undefined);

		const subKeys = [...agentHost.sessionSubscribeCounts.keys()].filter(k => k.endsWith('/changeset/uncommitted'));
		assert.deepStrictEqual(subKeys, [], 'new-session composer should not restore the backend session just to refresh changes');
	});

	test('releases the subscription when no session is active', () => {
		const provider = createProvider(disposables, agentHost, undefined, { activeSession });
		addAndObserve(provider, 'sess-A');

		activeSession.set(makeActive('sess-A'), undefined);
		activeSession.set(undefined, undefined);

		const unsubsForA = agentHost.sessionUnsubscribeCounts.get(branchChangesKeyFor('sess-A')) ?? 0;
		assert.strictEqual(unsubsForA, 1, 'leaving the agents window (no active session) must release the subscription');
	});

	test('active branch changeset uses before content URI as the diff original', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createProvider(disposables, agentHost, undefined, { activeSession });
		const session = addAndObserve(provider, 'sess-A');

		activeSession.set(makeActive('sess-A'), undefined);
		agentHost.setChangesetState(branchChangesKeyFor('sess-A'), {
			status: ChangesetStatus.Ready,
			files: [{
				id: 'file:///repo/file.ts',
				edit: {
					before: { uri: 'file:///repo/file.ts', content: { uri: 'session-db:///before/file.ts' } },
					after: { uri: 'file:///repo/file.ts', content: { uri: 'file:///repo/file.ts' } },
					diff: { added: 2, removed: 1 },
				},
			}],
		});

		const changes = session.changes.get();
		assert.deepStrictEqual(changes.map(change => {
			assert.ok(isIChatSessionFileChange2(change));
			return {
				uri: change.uri.toString(),
				originalUri: change.originalUri?.toString(),
				modifiedUri: change.modifiedUri?.toString(),
				insertions: change.insertions,
				deletions: change.deletions,
			};
		}), [{
			uri: 'file:///repo/file.ts',
			originalUri: 'vscode-agent-host://local/before/file.ts?_ah%3DeyJzY2hlbWUiOiJzZXNzaW9uLWRiIn0',
			modifiedUri: 'file:///repo/file.ts',
			insertions: 2,
			deletions: 1,
		}]);
	}));

	test('changes summary tracks the live branch changeset while active and the catalogue once inactive', () => {
		const provider = createProvider(disposables, agentHost, undefined, { activeSession });
		const session = addAndObserve(provider, 'sess-A');

		// Seed the live changeset before activating the session. When the
		// subscription is first observed, this is the initial value of the
		// throttled observable, so no throttle timer has to elapse.
		agentHost.setChangesetState(branchChangesKeyFor('sess-A'), {
			status: ChangesetStatus.Ready,
			files: [{
				id: 'file:///repo/file.ts',
				edit: {
					before: { uri: 'file:///repo/file.ts', content: { uri: 'session-db:///before/file.ts' } },
					after: { uri: 'file:///repo/file.ts', content: { uri: 'file:///repo/file.ts' } },
					diff: { added: 2, removed: 1 },
				},
			}],
		});
		activeSession.set(makeActive('sess-A'), undefined);

		// While active, the summary reflects the live branch changeset.
		assert.deepStrictEqual(session.changesSummary?.get(), { additions: 2, deletions: 1, files: 1 });

		// Once another session becomes active, the catalogue-seeded summary
		// takes over again.
		activeSession.set(makeActive('sess-B'), undefined);
		fireSessionSummaryChanged(agentHost, 'sess-A', { changes: { additions: 5, deletions: 3, files: 1 } });

		assert.deepStrictEqual(session.changesSummary?.get(), { additions: 5, deletions: 3, files: 1 });
	});

	// Builds one changeset file. `version` drives the diff so that "changing" a
	// file (bumping its version) produces a genuinely different file object,
	// mirroring what the server reducer emits via a `ChangesetFileSet` action.
	function makeChangesetFile(index: number, version: number): ChangesetState['files'][number] {
		const path = `file:///repo/src/file-${index}.ts`;
		return {
			id: path,
			edit: {
				before: { uri: path, content: { uri: `session-db:///before/file-${index}.ts` } },
				after: { uri: path, content: { uri: path } },
				diff: { added: version, removed: 0 },
			},
		};
	}

	// Performance-regression guard for the per-file change cache.
	//
	// The server reducer preserves the reference of every `ChangesetFile` that
	// didn't change across an update; the provider must exploit that and only
	// rebuild the change object for the file(s) that actually changed. Here we
	// stream many single-file updates over a large file set and assert that each
	// update rebuilds exactly ONE change object (identity-wise), not all of them.
	//
	// Reverting the per-file caching (i.e. rebuilding/`...spread`-ing every file
	// on every update) makes this fail immediately: all FILE_COUNT objects are
	// freshly built on the first update.
	test('rebuilds only the changed file across many changeset updates (O(changed), not O(all))', () => runWithFakedTimers<void>({ useFakeTimers: true, maxTaskCount: 1_000 }, async () => {
		const provider = createProvider(disposables, agentHost, undefined, { activeSession });
		const session = addAndObserve(provider, 'sess-A');
		activeSession.set(makeActive('sess-A'), undefined);

		const FILE_COUNT = 200;
		const UPDATE_COUNT = 100;
		const key = branchChangesKeyFor('sess-A');

		// A stable pool of file objects. Each update below replaces exactly one
		// entry and keeps every other reference, exactly as the reducer does.
		const files: ChangesetState['files'] = [];
		for (let i = 0; i < FILE_COUNT; i++) {
			files.push(makeChangesetFile(i, 0));
		}
		agentHost.setChangesetState(key, { status: ChangesetStatus.Ready, files: [...files] });

		let previous = session.changes.get();
		assert.strictEqual(previous.length, FILE_COUNT, 'every file should surface as a change');

		for (let update = 0; update < UPDATE_COUNT; update++) {
			const changedIndex = update % FILE_COUNT;
			files[changedIndex] = makeChangesetFile(changedIndex, update + 1);
			agentHost.setChangesetState(key, { status: ChangesetStatus.Ready, files: [...files] });

			const next = session.changes.get();

			let rebuilt = 0;
			for (let i = 0; i < FILE_COUNT; i++) {
				if (next[i] !== previous[i]) {
					rebuilt++;
				}
			}

			assert.strictEqual(rebuilt, 1, `update ${update}: exactly one change object should be rebuilt, but ${rebuilt} of ${FILE_COUNT} were`);
			previous = next;
		}
	}));

	// Companion to the test above, stated as a simple identity invariant: a file
	// that is never touched must keep the *same* change object instance no matter
	// how many updates stream in for other files. Reverting the cache rebuilds
	// every change object on every update, so this identity check fails.
	test('an untouched file keeps its change-object identity while another file streams updates', () => runWithFakedTimers<void>({ useFakeTimers: true, maxTaskCount: 1_000 }, async () => {
		const provider = createProvider(disposables, agentHost, undefined, { activeSession });
		const session = addAndObserve(provider, 'sess-A');
		activeSession.set(makeActive('sess-A'), undefined);

		const FILE_COUNT = 50;
		const UPDATE_COUNT = 100;
		const key = branchChangesKeyFor('sess-A');

		const files: ChangesetState['files'] = [];
		for (let i = 0; i < FILE_COUNT; i++) {
			files.push(makeChangesetFile(i, 0));
		}
		agentHost.setChangesetState(key, { status: ChangesetStatus.Ready, files: [...files] });

		// Index 0 is never touched; only the last file "streams" updates.
		const untouchedChangeBefore = session.changes.get()[0];
		assert.ok(untouchedChangeBefore, 'the untouched file should have a change object to begin with');

		const lastIndex = FILE_COUNT - 1;
		for (let update = 0; update < UPDATE_COUNT; update++) {
			files[lastIndex] = makeChangesetFile(lastIndex, update + 1);
			agentHost.setChangesetState(key, { status: ChangesetStatus.Ready, files: [...files] });
			session.changes.get(); // force the derived chain to recompute
		}

		const untouchedChangeAfter = session.changes.get()[0];
		assert.strictEqual(untouchedChangeAfter, untouchedChangeBefore, 'an unchanged file must reuse its change object across all updates');
	}));
});
