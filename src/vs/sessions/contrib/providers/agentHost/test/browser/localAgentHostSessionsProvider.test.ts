/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceTimeout, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, ImmortalReference, toDisposable, type IReference } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, ISettableObservable, observableValue, type IObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostCodexAgentEnabledSettingId, AgentSession, ClaudePreferAgentHostAgentsSettingId, ClaudePreferAgentHostEditorSettingId, IAgentHostService, type IAgentCreateChatOptions, type IAgentCreateSessionConfig, type IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ChatInteractivity as ProtocolChatInteractivity, ChatOriginKind as ProtocolChatOriginKind, CustomizationLoadStatus, CustomizationType, McpServerStatus, MessageKind, SessionLifecycle, type AgentInfo, type ChangesSummary, type Customization, type RootState, type SessionConfigState, type SessionState, type SessionSummary } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri, ChangesetStatus, SessionStatus as ProtocolSessionStatus, StateComponents, withSessionWorkspaceless, type ChangesetState, type ChatState, type ChatSummary } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ActionType, NotificationType, type ActionEnvelope, type IRootConfigChangedAction, type ChatAction, type SessionAction, type TerminalAction, type INotification, type ClientAnnotationsAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService, IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatWidget, IChatWidgetService } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService, type ChatSendResult, type IChatModelReference, type IChatSendRequestOptions } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService, isIChatSessionFileChange2 } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatModeKind } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelsService, type ILanguageModelChatMetadata } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import type { IChatModel, IChatModelInputState, IInputModel } from '../../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ISessionChangeEvent } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ChatInteractivity, ChatOriginKind, getChatCapabilities, ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { IAgentHostActiveClientService } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { LocalAgentHostSessionsProvider } from '../../browser/localAgentHostSessionsProvider.js';
import { AgentHostSessionAdapter } from '../../browser/baseAgentHostSessionsProvider.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IGitHubService } from '../../../../github/browser/githubService.js';
import { GitHubPullRequestModel } from '../../../../github/browser/models/githubPullRequestModel.js';
import { IPullRequestIconCache, PullRequestIconCache } from '../../../../github/browser/pullRequestIconCache.js';
import { computePullRequestIcon, GitHubPullRequestState } from '../../../../github/common/types.js';
import { IWorkbenchEnvironmentService } from '../../../../../../workbench/services/environment/common/environmentService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';

// ---- Mock IAgentHostService -------------------------------------------------

const STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES = 'sessions.agentHost.sessionConfigPicker.selectedValues';

type SubscriptionState = SessionState | ChangesetState | ChatState;

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAction = new Emitter<ActionEnvelope>();
	override readonly onDidAction = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<INotification>();
	override readonly onDidNotification = this._onDidNotification.event;
	private readonly _onDidRootStateChange = new Emitter<RootState>();
	private _rootStateValue: RootState | Error | undefined = { agents: [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { multipleChats: { fork: true } } } as AgentInfo] };
	override readonly rootState: IAgentSubscription<RootState>;

	override readonly clientId = 'test-local-client';
	private readonly _sessions = new Map<string, IAgentSessionMetadata>();
	public disposedSessions: URI[] = [];
	public dispatchedActions: { channel: string; action: SessionAction | ChatAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction; clientId: string; clientSeq: number }[] = [];
	public failResolveSessionConfig = false;
	public resolveSessionConfigResult: ResolveSessionConfigResult = { schema: { type: 'object', properties: {} }, values: { isolation: 'worktree' } };
	public resolveSessionConfigRequests: { config?: Record<string, unknown> }[] = [];
	public resolveSessionConfigBarrier: DeferredPromise<void> | undefined;

	private readonly _authenticationPending: ISettableObservable<boolean> = observableValue('authenticationPending', false);
	override readonly authenticationPending: IObservable<boolean> = this._authenticationPending;
	override setAuthenticationPending(pending: boolean): void {
		this._authenticationPending.set(pending, undefined);
	}

	private _nextSeq = 0;

	constructor() {
		super();
		const self = this;
		this.rootState = {
			get value() { return self._rootStateValue; },
			get verifiedValue() { return self._rootStateValue instanceof Error ? undefined : self._rootStateValue; },
			onDidChange: self._onDidRootStateChange.event,
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
	override async listSessions(): Promise<IAgentSessionMetadata[]> {
		this.listSessionsCallCount++;
		if (this.failListSessionsCount > 0) {
			this.failListSessionsCount--;
			throw new Error('AHP_AUTH_REQUIRED');
		}
		return [...this._sessions.values()];
	}

	override async disposeSession(session: URI): Promise<void> {
		this.disposedSessions.push(session);
		const rawId = AgentSession.id(session);
		this._sessions.delete(rawId);
	}

	public disposedChats: URI[] = [];
	override async disposeChat(chat: URI): Promise<void> {
		this.disposedChats.push(chat);
	}

	public createdChats: { session: URI; chat: URI; options?: IAgentCreateChatOptions }[] = [];
	override async createChat(session: URI, chat: URI, options?: IAgentCreateChatOptions): Promise<void> {
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
	}

	public createdSessionUris: URI[] = [];
	public createSessionConfigs: { config?: Record<string, unknown>; workingDirectory?: URI }[] = [];
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
		this.createSessionConfigs.push({ config: config?.config, workingDirectory: config?.workingDirectory });
		this.wireOps.push(`createSession:${uri.toString()}`);
		this.createdSessionUris.push(uri);
		const hook = this.onCreateSession;
		this.onCreateSession = undefined;
		if (hook) {
			await hook(uri);
		}
		return uri;
	}

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

	// ---- Session-state subscriptions ---------------------------------------

	private readonly _sessionStateEmitters = new Map<string, Emitter<SubscriptionState>>();
	private readonly _sessionStateValues = new Map<string, SubscriptionState>();
	public sessionSubscribeCounts = new Map<string, number>();
	public sessionUnsubscribeCounts = new Map<string, number>();

	override getSubscription<T>(_kind: StateComponents, resource: URI): IReference<IAgentSubscription<T>> {
		const key = resource.toString();
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

	setRootStateError(): void {
		this._rootStateValue = new Error('root state failed');
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
		for (const emitter of this._sessionStateEmitters.values()) {
			emitter.dispose();
		}
		this._sessionStateEmitters.clear();
	}
}

// ---- Test helpers -----------------------------------------------------------

function createSession(id: string, opts?: { provider?: string; summary?: string; project?: { uri: URI; displayName: string }; workingDirectory?: URI; startTime?: number; modifiedTime?: number; quickChat?: boolean }): IAgentSessionMetadata {
	return {
		session: AgentSession.uri(opts?.provider ?? 'copilotcli', id),
		startTime: opts?.startTime ?? 1000,
		modifiedTime: opts?.modifiedTime ?? 2000,
		summary: opts?.summary,
		project: opts?.project,
		workingDirectory: opts?.workingDirectory,
		_meta: opts?.quickChat ? withSessionWorkspaceless(undefined, true) : undefined,
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
 * default (`{ mode: 'interactive', approvals: 'default' }`), so an untouched
 * setting is reported by `inspect` only as `defaultValue` (no user layer).
 * The plain {@link TestConfigurationService} does not register schema defaults,
 * so it cannot reproduce the "configured default masks remembered pick" bug.
 */
function createSchemaDefaultConfigurationService(): TestConfigurationService {
	return new class extends TestConfigurationService {
		override inspect<T>(key: string) {
			const base = super.inspect<T>(key);
			if (key === 'chat.defaultConfiguration' && base.userValue === undefined) {
				const schemaDefault = { mode: 'interactive', approvals: 'default' } as unknown as T;
				return { ...base, value: schemaDefault, defaultValue: schemaDefault };
			}
			return base;
		}
	}();
}

function createProvider(disposables: DisposableStore, agentHostService: MockAgentHostService, contributions = [
	{ type: 'agent-host-copilotcli', name: 'copilot', displayName: 'Copilot', description: 'test', icon: undefined },
], options?: { sendRequest?: (resource: URI, message: string, options?: IChatSendRequestOptions) => Promise<ChatSendResult>; acquireOrLoadSession?: (resource: URI) => Promise<IChatModelReference | undefined>; languageModelIds?: string[]; lookupLanguageModel?: (modelId: string) => ILanguageModelChatMetadata | undefined; openSession?: boolean; configurationService?: IConfigurationService; activeSession?: IObservable<IActiveSession | undefined>; visibleSessions?: IObservable<readonly (IActiveSession | undefined)[]>; storageService?: IStorageService; isSessionsWindow?: boolean; confirmDelete?: boolean; workspaceTrusted?: boolean; gitHubService?: IGitHubService; agentHostEnabled?: boolean }): LocalAgentHostSessionsProvider {
	const instantiationService = disposables.add(new TestInstantiationService());

	instantiationService.stub(IAgentHostService, agentHostService);
	const configurationService = options?.configurationService ?? new TestConfigurationService();
	instantiationService.stub(IConfigurationService, configurationService);
	instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: options?.agentHostEnabled ?? true });
	instantiationService.stub(IWorkspaceTrustManagementService, new class extends mock<IWorkspaceTrustManagementService>() {
		override isWorkspaceTrusted(): boolean { return options?.workspaceTrusted ?? true; }
		override async getUriTrustInfo(uri: URI) { return { uri, trusted: options?.workspaceTrusted ?? true }; }
	});
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
		hasResolvedVendor: () => true,
	});
	instantiationService.stub(ILabelService, {
		getUriLabel: (uri: URI) => uri.path,
	});
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IStorageService, options?.storageService ?? disposables.add(new InMemoryStorageService()));
	instantiationService.stub(IProgressService, {});
	instantiationService.stub(IGitHubService, options?.gitHubService ?? new class extends mock<IGitHubService>() {
		override findPullRequestNumberByHeadBranch = async () => undefined;
	}());
	instantiationService.stub(IPullRequestIconCache, instantiationService.createInstance(PullRequestIconCache));
	const activeSessionObs = options?.activeSession ?? constObservable<IActiveSession | undefined>(undefined);
	const visibleSessionsObs = options?.visibleSessions ?? constObservable<readonly (IActiveSession | undefined)[]>([]);
	instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
		override readonly activeSession: IObservable<IActiveSession | undefined> = activeSessionObs;
		override readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]> = visibleSessionsObs;
	}());
	instantiationService.stub(IAgentHostActiveClientService, new class extends mock<IAgentHostActiveClientService>() {
		override getActiveClient = (_sessionType: string, clientId: string) => ({ clientId, tools: [], customizations: [] });
	}());

	return disposables.add(instantiationService.createInstance(LocalAgentHostSessionsProvider));
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
			workingDirectory: opts?.workingDirectory,
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

function fireSessionSummaryChanged(agentHost: MockAgentHostService, rawId: string, changes: Partial<SessionSummary>, provider = 'copilotcli'): void {
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

	test('reports no session types before rootState hydrates', () => {
		agentHost.clearRootState();
		const provider = createProvider(disposables, agentHost);

		assert.deepStrictEqual(provider.sessionTypes, []);
	});

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
			{ provider: 'claude-code', displayName: 'Claude', description: '', models: [] } as AgentInfo,
			{ provider: 'openai', displayName: 'OpenAI', description: '', models: [] } as AgentInfo,
			{ provider: 'unknown-agent', displayName: 'Unknown', description: '', models: [] } as AgentInfo,
		]);
		const provider = createProvider(disposables, agentHost);
		assert.deepStrictEqual(
			provider.sessionTypes.map(t => ({ id: t.id, icon: t.icon.id })),
			[
				{ id: 'copilotcli', icon: 'copilot' },
				{ id: 'claude-code', icon: 'claude' },
				{ id: 'openai', icon: 'openai' },
				{ id: 'unknown-agent', icon: 'vm' },
			],
		);
	});

	// ---- AH/EH gate (preferAgentHost) -------

	// The agent host's Claude provider id is `claude`. In a window that prefers
	// the extension-host Claude (the GitHub Copilot Chat extension's), the local
	// provider must NOT advertise its own `claude` session type, otherwise the
	// welcome picker lists Claude twice. Mirrors the EH-side gate in
	// `copilotChatSessionsProvider`.

	function fireConfigChange(configService: TestConfigurationService, settingId: string): void {
		configService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([settingId]),
			change: { keys: [settingId], overrides: [] },
			affectsConfiguration: (key: string) => key === settingId,
		});
	}

	test('hides agent-host Claude when the Agents window prefers extension-host Claude', () => {
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
		]);
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, false);
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService, isSessionsWindow: true });

		assert.deepStrictEqual(provider.sessionTypes.map(t => t.id), ['copilotcli']);
	});

	test('shows agent-host Claude when the Agents window prefers agent-host Claude', () => {
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
		]);
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService, isSessionsWindow: true });

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

	test('gates agent-host Claude on the editor-window setting outside the Agents window', () => {
		agentHost.setAgents([
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
		]);
		const configService = new TestConfigurationService();
		// Editor-window setting on; Agents-window setting deliberately left off to
		// prove the non-sessions-window provider reads the editor-window setting.
		configService.setUserConfiguration(ClaudePreferAgentHostEditorSettingId, true);
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService, isSessionsWindow: false });

		assert.deepStrictEqual(provider.sessionTypes.map(t => t.id), ['claude']);
	});

	test('adds agent-host Claude live when preferAgentHost flips on', () => {
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
		]);
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, false);
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService, isSessionsWindow: true });
		assert.deepStrictEqual(provider.sessionTypes.map(t => t.id), ['copilotcli']);

		let fired = false;
		disposables.add(provider.onDidChangeSessionTypes(() => { fired = true; }));

		configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
		fireConfigChange(configService, ClaudePreferAgentHostAgentsSettingId);

		assert.ok(fired, 'onDidChangeSessionTypes should fire when the gate flips');
		assert.deepStrictEqual(provider.sessionTypes.map(t => t.id), ['copilotcli', 'claude']);
	});

	test('getSessions hides agent-host Claude sessions when extension-host Claude is preferred', () => {
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
		]);
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, false);
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService, isSessionsWindow: true });
		fireSessionAdded(agentHost, 'cli-sess', { title: 'CLI', provider: 'copilotcli' });
		fireSessionAdded(agentHost, 'claude-sess', { title: 'Claude', provider: 'claude' });

		assert.deepStrictEqual(provider.getSessions().map(s => s.sessionType), ['copilotcli']);
	});

	test('getSessions shows agent-host Claude sessions when agent-host Claude is preferred', () => {
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
		]);
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService, isSessionsWindow: true });
		fireSessionAdded(agentHost, 'cli-sess', { title: 'CLI', provider: 'copilotcli' });
		fireSessionAdded(agentHost, 'claude-sess', { title: 'Claude', provider: 'claude' });

		assert.deepStrictEqual(
			provider.getSessions().map(s => s.sessionType).sort(),
			['claude', 'copilotcli'],
		);
	});

	test('flipping preferAgentHost reveals agent-host Claude sessions and fires a refresh', () => {
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
		]);
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, false);
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService, isSessionsWindow: true });
		fireSessionAdded(agentHost, 'cli-sess', { title: 'CLI', provider: 'copilotcli' });
		fireSessionAdded(agentHost, 'claude-sess', { title: 'Claude', provider: 'claude' });
		assert.deepStrictEqual(provider.getSessions().map(s => s.sessionType), ['copilotcli']);

		let fired = false;
		disposables.add(provider.onDidChangeSessions(() => { fired = true; }));

		configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
		fireConfigChange(configService, ClaudePreferAgentHostAgentsSettingId);

		assert.ok(fired, 'onDidChangeSessions should fire so the open list re-queries');
		assert.deepStrictEqual(
			provider.getSessions().map(s => s.sessionType).sort(),
			['claude', 'copilotcli'],
		);
	});

	test('flipping preferAgentHost off does not announce hidden sessions as removed', () => {
		// The list refresh fires an empty-payload change: hidden Claude sessions
		// are filtered out at read time, not reported as `removed` (which the
		// sessions telemetry contribution would misread as a remote deletion).
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
		]);
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService, isSessionsWindow: true });
		fireSessionAdded(agentHost, 'claude-sess', { title: 'Claude', provider: 'claude' });
		assert.deepStrictEqual(provider.getSessions().map(s => s.sessionType), ['claude']);

		const removed: string[] = [];
		disposables.add(provider.onDidChangeSessions(e => removed.push(...e.removed.map(s => s.sessionType))));

		configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, false);
		fireConfigChange(configService, ClaudePreferAgentHostAgentsSettingId);

		assert.deepStrictEqual(removed, [], 'hidden sessions must not be reported as removed');
		assert.deepStrictEqual(provider.getSessions().map(s => s.sessionType), []);
	});

	test('session icons match the session type icon', () => {
		agentHost.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'claude-code', displayName: 'Claude', description: '', models: [] } as AgentInfo,
			{ provider: 'unknown-agent', displayName: 'Unknown', description: '', models: [] } as AgentInfo,
		]);
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'cli-sess', { title: 'CLI', provider: 'copilotcli' });
		fireSessionAdded(agentHost, 'claude-sess', { title: 'Claude', provider: 'claude-code' });
		fireSessionAdded(agentHost, 'unknown-sess', { title: 'Unknown', provider: 'unknown-agent' });

		assert.deepStrictEqual(
			provider.getSessions().map(s => ({ sessionType: s.sessionType, icon: s.icon.id })).sort((a, b) => a.sessionType.localeCompare(b.sessionType)),
			[
				{ sessionType: 'claude-code', icon: 'claude' },
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

	test('onDidChangeSessions fires when session added notification arrives', () => {
		const provider = createProvider(disposables, agentHost);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		fireSessionAdded(agentHost, 'notif-1', { title: 'Notif Session' });

		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].added.length, 1);
		assert.strictEqual(changes[0].added[0].title.get(), 'Notif Session');
	});

	test('session removed notification removes from cache', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'to-remove', { title: 'Removed' });

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		fireSessionRemoved(agentHost, 'to-remove');

		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].removed.length, 1);
	});

	test('identical session added notification is ignored', () => {
		const provider = createProvider(disposables, agentHost);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		const timestamp = new Date(0).toISOString();
		fireSessionAdded(agentHost, 'dup-sess', { title: 'Dup', createdAt: timestamp, modifiedAt: timestamp });
		fireSessionAdded(agentHost, 'dup-sess', { title: 'Dup', createdAt: timestamp, modifiedAt: timestamp });

		assert.strictEqual(changes.length, 1);
	});

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
			changedEvents: [[true], [true]],
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

	test('hydrated quick chat stays workspace-less after reload despite a scratch working directory', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Regression #324581: a committed quick chat persisted into the startup
		// cache carries a scratch cwd. The adapter's session-kind is fixed at
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

	test('setModel updates existing session model and lets draft debounce persist it', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'set-model', { title: 'Set Model Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Set Model Session');
		assert.ok(session);

		provider.setModel(session!.sessionId, 'agent-host-copilotcli:new-model');

		assert.strictEqual(session!.modelId.get(), 'agent-host-copilotcli:new-model');
		assert.deepStrictEqual(agentHost.dispatchedActions, []);
	});

	test('setModel updates cached selection for later message-level selection', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'set-model-config', { title: 'Set Model Config Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Set Model Config Session');
		assert.ok(session);

		provider.setModel(session!.sessionId, 'agent-host-copilotcli:configured-model');

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
				enabled: true,
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
				enabled: true,
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
				enabled: true,
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
				enabled: true,
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
				enabled: false,
				load: { kind: CustomizationLoadStatus.Loaded },
				children: [{ type: CustomizationType.Agent, id: 'agent://disabled', uri: 'agent://disabled', name: 'disabled' }],
			}, {
				// Customizations with `children === undefined` are treated as
				// "unknown" (host not yet finished parsing) and skipped.
				type: CustomizationType.Plugin,
				id: 'plugin://unparsed',
				uri: 'plugin://unparsed',
				name: 'unparsed plugin',
				enabled: true,
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
				enabled: true,
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
					enabled: true,
				}],
			} as AgentInfo,
		]);

		fireSessionAdded(agentHost, 'root-only', { title: 'Root Only' });
		const session = provider.getSessions().find(s => s.title.get() === 'Root Only');
		assert.ok(session);

		assert.deepStrictEqual(provider.getCustomAgents(session!.sessionId), []);
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
				enabled: true,
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
			enabled: true,
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
				enabled: true,
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

		assert.strictEqual(session.providerId, provider.id);
		assert.strictEqual(session.status.get(), SessionStatus.Untitled);
		assert.ok(session.workspace.get());
		assert.strictEqual(session.workspace.get()?.label, 'my-project');
		assert.strictEqual(session.sessionType, provider.sessionTypes[0].id);
		assert.deepStrictEqual(provider.getSessionConfig(session.sessionId), { schema: { type: 'object', properties: {} }, values: {} });
	});

	// ---- Quick chats (workspace-less sessions) -------

	test('declares quick chat support from the initial agent host setting', () => {
		const provider = createProvider(disposables, agentHost, undefined, { agentHostEnabled: true });
		assert.strictEqual(provider.supportsQuickChats, true);
	});

	test('does not declare quick chat support when the agent host is disabled', () => {
		const provider = createProvider(disposables, agentHost, undefined, { agentHostEnabled: false });
		assert.strictEqual(provider.supportsQuickChats, false);
	});

	test('createQuickChat returns a workspace-less untitled session', () => {
		const provider = createProvider(disposables, agentHost);
		const session = provider.createQuickChat(provider.sessionTypes[0].id);

		assert.deepStrictEqual({
			providerId: session.providerId,
			status: session.status.get(),
			workspace: session.workspace.get(),
			sessionType: session.sessionType,
		}, {
			providerId: provider.id,
			status: SessionStatus.Untitled,
			workspace: undefined,
			sessionType: provider.sessionTypes[0].id,
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
		assert.deepStrictEqual(session?.capabilities.get(), { supportsMultipleChats: false, supportsFork: true, supportsRename: true, supportsDelete: true });
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

	test('committed quick chat announced via sessionAdded stays workspace-less despite a scratch working directory', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Regression: when a quick-chat draft graduates, the host announces the
		// committed session via a `sessionAdded` notification whose summary
		// carries `_meta.workspaceless` — but also the scratch cwd the host
		// assigned. The adapter's session-kind is fixed at construction, so the
		// tag must reach it here (not just via the later listSessions/state
		// channels), otherwise `workspace` leaks the scratch folder and the
		// archive-on-delete fallback pre-fills a new session with it.
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
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: config });
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.deepStrictEqual(agentHost.createSessionConfigs[0]?.config, { autoApprove: 'autoApprove' });
	});

	test('createNewSession does not seed autoApprove when chat.defaultConfiguration approvals is the default value', () => {
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

	test('setSessionConfigValue remembers string picks and ignores unsafe keys', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const provider = createProvider(disposables, agentHost, undefined, { storageService });
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);

		await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Isolation, 'folder');
		await provider.setSessionConfigValue(session.sessionId, '__proto__', 'polluted');

		assert.deepStrictEqual(
			storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {}),
			{ [SessionConfigKey.Isolation]: 'folder' },
		);
	});

	test('maps the existing isolation setter to agent-host config without remembering it', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const provider = createProvider(disposables, agentHost, undefined, { storageService });
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);
		const firstAutomationRequest = agentHost.resolveSessionConfigRequests.length;

		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: {} },
			values: { isolation: 'folder', branch: 'main' },
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

	test('createNewSession seeds remembered values and skips unsafe remembered keys', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, `{"${SessionConfigKey.Isolation}":"folder","${SessionConfigKey.Branch}":"main","__proto__":"polluted"}`, StorageScope.PROFILE, StorageTarget.MACHINE);
		const provider = createProvider(disposables, agentHost, undefined, { storageService });
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);

		assert.deepStrictEqual({
			seededImmediately: provider.getSessionConfig(session.sessionId)?.values,
			forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config,
		}, {
			seededImmediately: { isolation: 'folder', branch: 'main' },
			forwardedToAgentHost: { isolation: 'folder', branch: 'main' },
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
		await configuredDefaultConfig.setUserConfiguration('chat.defaultConfiguration', { approvals: 'default' });
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
					return { ...base, policyValue: { mode: 'autopilot', approvals: 'default' } as unknown as T };
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

	test('deleteSession calls disposeSession and removes from cache', async () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'del-sess', { title: 'To Delete' });

		const sessions = provider.getSessions();
		const target = sessions.find(s => s.title.get() === 'To Delete');
		assert.ok(target);

		await provider.deleteSession(target!.sessionId);

		assert.strictEqual(agentHost.disposedSessions.length, 1);
		const disposedUri = agentHost.disposedSessions[0];
		assert.strictEqual(AgentSession.provider(disposedUri), 'copilotcli');
		assert.strictEqual(AgentSession.id(disposedUri), 'del-sess');
		assert.strictEqual(provider.getSessions().find(s => s.title.get() === 'To Delete'), undefined);
	});

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
			const configService = new TestConfigurationService();
			configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
			const provider = createProvider(disposables, agentHost, undefined, { configurationService: configService, isSessionsWindow: true });
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
				forkSource: sessionUri,
				forkTurnId: 'turn-1',
				forkedIsPeer: true,
				forkedInCatalog: true,
			});
		}));

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

			provider.setModel(session.sessionId, 'agent-host-copilotcli:selected-model');

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

			provider.setModel(session.sessionId, 'agent-host-copilotcli:peer-model');

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

	test('server-echoed ChatTurnStarted model does not update cached session model', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'model-change', { title: 'Model Change' });

		const target = provider.getSessions().find(s => s.title.get() === 'Model Change');
		assert.ok(target);
		provider.setModel(target!.sessionId, 'agent-host-copilotcli:old-model');

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
		await provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' });

		assert.deepStrictEqual(sendOptions.map(options => options.agentHostSessionConfig), [{ isolation: 'worktree' }]);
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
		provider.setModel(session!.sessionId, 'agent-host-copilotcli:selected-model');
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
			_meta: { github: { owner: 'owner', repo: 'repo', pullRequestUrl: 'https://github.com/owner/repo/pull/42' } },
		});

		const gitHubInfoObs = session!.workspace.get()!.folders[0]!.gitRepository!.gitHubInfo;
		const sub = autorun(reader => { gitHubInfoObs.read(reader); });
		await timeout(0);

		const pullRequest = gitHubInfoObs.get()?.pullRequest;
		assert.strictEqual(pullRequest?.number, 42, 'PR is detected from the GitHub state URL');
		assert.deepStrictEqual(pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open), 'a default open-PR icon is shown immediately while the live model is empty');
		sub.dispose();
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
