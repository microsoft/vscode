/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable, type IReference } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, ISettableObservable, observableValue, type IObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSession, IAgentHostService, type IAgentCreateSessionConfig, type IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { CustomizationLoadStatus, CustomizationType, SessionLifecycle, type AgentInfo, type Customization, type ModelSelection, type RootState, type SessionConfigState, type SessionState, type SessionSummary } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ChangesetStatus, SessionStatus as ProtocolSessionStatus, StateComponents, type ChangesetState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ActionType, NotificationType, type ActionEnvelope, type IRootConfigChangedAction, type SessionAction, type TerminalAction, type INotification } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IChatWidget, IChatWidgetService } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService, type ChatSendResult, type IChatSendRequestOptions } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService, isIChatSessionFileChange2 } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionChangeEvent } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../../services/sessions/common/sessionsManagement.js';
import { IAgentHostActiveClientService } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { LocalAgentHostSessionsProvider } from '../../browser/localAgentHostSessionsProvider.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IGitHubService } from '../../../../github/browser/githubService.js';

// ---- Mock IAgentHostService -------------------------------------------------

const STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES = 'sessions.agentHost.sessionConfigPicker.selectedValues';

type SubscriptionState = SessionState | ChangesetState;

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAction = new Emitter<ActionEnvelope>();
	override readonly onDidAction = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<INotification>();
	override readonly onDidNotification = this._onDidNotification.event;
	private readonly _onDidRootStateChange = new Emitter<RootState>();
	private _rootStateValue: RootState | Error | undefined = { agents: [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo] };
	override readonly rootState: IAgentSubscription<RootState>;

	override readonly clientId = 'test-local-client';
	private readonly _sessions = new Map<string, IAgentSessionMetadata>();
	public disposedSessions: URI[] = [];
	public dispatchedActions: { channel: string; action: SessionAction | TerminalAction | IRootConfigChangedAction; clientId: string; clientSeq: number }[] = [];
	public failResolveSessionConfig = false;
	public resolveSessionConfigResult: ResolveSessionConfigResult = { schema: { type: 'object', properties: {} }, values: { isolation: 'worktree' } };
	public resolveSessionConfigRequests: { config?: Record<string, unknown> }[] = [];

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

	public createdSessionUris: URI[] = [];
	public createSessionConfigs: { config?: Record<string, unknown> }[] = [];
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
		this.createSessionConfigs.push({ config: config?.config });
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
		await Promise.resolve();
		if (this.failResolveSessionConfig) {
			throw new Error('resolveSessionConfig unavailable');
		}
		return this.resolveSessionConfigResult;
	}

	dispatchAction(channel: string, action: SessionAction | TerminalAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		this.dispatchedActions.push({ channel, action, clientId, clientSeq });
	}

	override dispatch(channel: string, action: SessionAction | TerminalAction | IRootConfigChangedAction): void {
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

function createSession(id: string, opts?: { provider?: string; summary?: string; model?: string; project?: { uri: URI; displayName: string }; workingDirectory?: URI; startTime?: number; modifiedTime?: number }): IAgentSessionMetadata {
	return {
		session: AgentSession.uri(opts?.provider ?? 'copilotcli', id),
		startTime: opts?.startTime ?? 1000,
		modifiedTime: opts?.modifiedTime ?? 2000,
		summary: opts?.summary,
		model: opts?.model ? { id: opts.model } : undefined,
		project: opts?.project,
		workingDirectory: opts?.workingDirectory,
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

function createProvider(disposables: DisposableStore, agentHostService: MockAgentHostService, contributions = [
	{ type: 'agent-host-copilotcli', name: 'copilot', displayName: 'Copilot', description: 'test', icon: undefined },
], options?: { sendRequest?: (resource: URI, message: string, options?: IChatSendRequestOptions) => Promise<ChatSendResult>; openSession?: boolean; configurationService?: IConfigurationService; activeSession?: IObservable<IActiveSession | undefined>; storageService?: IStorageService }): LocalAgentHostSessionsProvider {
	const instantiationService = disposables.add(new TestInstantiationService());

	instantiationService.stub(IAgentHostService, agentHostService);
	instantiationService.stub(IConfigurationService, options?.configurationService ?? new TestConfigurationService());
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IChatSessionsService, {
		getChatSessionContribution: (chatSessionType: string) => contributions.find(c => c.type === chatSessionType),
		getAllChatSessionContributions: () => contributions,
		getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } }),
	});
	instantiationService.stub(IChatService, {
		acquireOrLoadSession: async () => undefined,
		sendRequest: options?.sendRequest ?? (async (): Promise<ChatSendResult> => ({ kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never })),
	});
	instantiationService.stub(IChatWidgetService, {
		openSession: async () => options?.openSession ? new class extends mock<IChatWidget>() { }() : undefined,
	});
	instantiationService.stub(ILanguageModelsService, {
		lookupLanguageModel: () => undefined,
	});
	instantiationService.stub(ILabelService, {
		getUriLabel: (uri: URI) => uri.path,
	});
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IStorageService, options?.storageService ?? disposables.add(new InMemoryStorageService()));
	instantiationService.stub(IGitHubService, new class extends mock<IGitHubService>() {
		override findPullRequestNumberByHeadBranch = async () => undefined;
	}());
	const activeSessionObs = options?.activeSession ?? constObservable<IActiveSession | undefined>(undefined);
	instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
		override readonly activeSession: IObservable<IActiveSession | undefined> = activeSessionObs;
	}());
	instantiationService.stub(IAgentHostActiveClientService, new class extends mock<IAgentHostActiveClientService>() {
		override getActiveClient = (_sessionType: string, clientId: string) => ({ clientId, tools: [], customizations: [] });
	}());

	return disposables.add(instantiationService.createInstance(LocalAgentHostSessionsProvider));
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

function fireSessionAdded(agentHost: MockAgentHostService, rawId: string, opts?: { provider?: string; title?: string; model?: string; modelConfig?: Record<string, string>; project?: { uri: string; displayName: string }; workingDirectory?: string }): void {
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
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			model: opts?.model ? { id: opts.model, ...(opts.modelConfig ? { config: opts.modelConfig } : {}) } : undefined,
			project: opts?.project,
			workingDirectory: opts?.workingDirectory,
		},
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

	test('duplicate session added notification is ignored', () => {
		const provider = createProvider(disposables, agentHost);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		fireSessionAdded(agentHost, 'dup-sess', { title: 'Dup' });
		fireSessionAdded(agentHost, 'dup-sess', { title: 'Dup' });

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

		// The backoff retry (min 1s) fires on its own — no SessionTurnComplete
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

	test('uses model metadata as selected model for listed sessions', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		agentHost.addSession(createSession('model-1', { summary: 'Model Session', model: 'claude-sonnet-4.5' }));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions().find(s => s.title.get() === 'Model Session');
		assert.strictEqual(session?.modelId.get(), 'agent-host-copilotcli:claude-sonnet-4.5');
	}));

	test('uses model metadata from session added notification', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'notif-model', { title: 'Notif Model Session', model: 'gpt-5' });

		const session = provider.getSessions().find(s => s.title.get() === 'Notif Model Session');
		assert.strictEqual(session?.modelId.get(), 'agent-host-copilotcli:gpt-5');
	});

	test('setModel updates existing session model and dispatches raw model', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'set-model', { title: 'Set Model Session', model: 'old-model' });

		const session = provider.getSessions().find(s => s.title.get() === 'Set Model Session');
		assert.ok(session);

		provider.setModel(session!.sessionId, 'agent-host-copilotcli:new-model');

		assert.strictEqual(session!.modelId.get(), 'agent-host-copilotcli:new-model');
		assert.deepStrictEqual(agentHost.dispatchedActions.at(-1)?.action, {
			type: ActionType.SessionModelChanged,
			model: { id: 'new-model' },
		});
	});

	test('setModel preserves current model config when model id is unchanged', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'set-model-config', { title: 'Set Model Config Session', model: 'configured-model', modelConfig: { thinkingLevel: 'high' } });

		const session = provider.getSessions().find(s => s.title.get() === 'Set Model Config Session');
		assert.ok(session);

		provider.setModel(session!.sessionId, 'agent-host-copilotcli:configured-model');

		assert.deepStrictEqual(agentHost.dispatchedActions.at(-1)?.action, {
			type: ActionType.SessionModelChanged,
			model: { id: 'configured-model', config: { thinkingLevel: 'high' } },
		});
	});

	test('setAgent updates existing session agent and dispatches SessionAgentChanged', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'set-agent', { title: 'Set Agent Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Set Agent Session');
		assert.ok(session);

		provider.setAgent?.(session!.sessionId, { uri: 'agent://review', name: 'review' });

		// The selected agent is now carried on `mode` (with `kind: 'agent'`).
		// The wire `SessionAgentChanged` action carries only the URI; the receiver
		// re-resolves the display name from its customization snapshot.
		assert.deepStrictEqual(session!.mode.get(), { id: 'agent://review', kind: 'agent' });
		assert.deepStrictEqual(agentHost.dispatchedActions.at(-1)?.action, {
			type: ActionType.SessionAgentChanged,
			agent: { uri: 'agent://review' },
		});
	});

	test('setAgent with undefined clears the selection and dispatches an empty action', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'clear-agent', { title: 'Clear Agent Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Clear Agent Session');
		assert.ok(session);

		provider.setAgent?.(session!.sessionId, { uri: 'agent://review', name: 'review' });
		provider.setAgent?.(session!.sessionId, undefined);

		assert.strictEqual(session!.mode.get(), undefined);
		assert.deepStrictEqual(agentHost.dispatchedActions.at(-1)?.action, {
			type: ActionType.SessionAgentChanged,
		});
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
			summary: {
				resource: AgentSession.uri('copilotcli', 'agents-merge').toString(),
				provider: 'copilotcli',
				title: 'Merge Session',
				status: ProtocolSessionStatus.Idle,
				createdAt: 0,
				modifiedAt: 0,
			},
			lifecycle: SessionLifecycle.Ready,
			turns: [],
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
			summary: {
				resource: AgentSession.uri('copilotcli', 'cust-events').toString(),
				provider: 'copilotcli',
				title: 'Cust Events',
				status: ProtocolSessionStatus.Idle,
				createdAt: 0,
				modifiedAt: 0,
			},
			lifecycle: SessionLifecycle.Ready,
			turns: [],
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
		// NOT fire — only churn in `customizations` / `activeClient.customizations`
		// counts.
		const afterFirstCustomization = fired;
		agentHost.setSessionState('cust-events', 'copilotcli', {
			summary: {
				resource: AgentSession.uri('copilotcli', 'cust-events').toString(),
				provider: 'copilotcli',
				title: 'Cust Events Updated',
				status: ProtocolSessionStatus.Idle,
				createdAt: 0,
				modifiedAt: 0,
			},
			lifecycle: SessionLifecycle.Ready,
			turns: [],
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
			summary: {
				resource: AgentSession.uri(sessionTypeId, rawId).toString(),
				provider: sessionTypeId,
				title: '',
				status: ProtocolSessionStatus.Idle,
				createdAt: 0,
				modifiedAt: 0,
			},
			lifecycle: SessionLifecycle.Ready,
			turns: [],
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
			summary: {
				resource: AgentSession.uri(sessionTypeId, rawId).toString(),
				provider: sessionTypeId,
				title: '',
				status: ProtocolSessionStatus.Idle,
				createdAt: 0,
				modifiedAt: 0,
			},
			lifecycle: SessionLifecycle.Ready,
			turns: [],
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

	test('createNewSession clears session config when resolving config is unavailable', async () => {
		agentHost.failResolveSessionConfig = true;
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, config => config === undefined);

		assert.strictEqual(provider.getSessionConfig(session.sessionId), undefined);
	});

	test('createNewSession seeds autoApprove from chat.permissions.default and forwards it to resolveSessionConfig', async () => {
		const config = new TestConfigurationService();
		await config.setUserConfiguration('chat.permissions.default', 'autoApprove');
		agentHost.resolveSessionConfigResult = {
			schema: { type: 'object', properties: { autoApprove: { type: 'string', enum: ['default', 'autoApprove', 'autopilot'], title: 'Auto-approve' } } },
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

	test('createNewSession forwards seeded config to eager createSession', async () => {
		const config = new TestConfigurationService();
		await config.setUserConfiguration('chat.permissions.default', 'autoApprove');
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: config });
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.deepStrictEqual(agentHost.createSessionConfigs[0]?.config, { autoApprove: 'autoApprove' });
	});

	test('createNewSession does not seed autoApprove when chat.permissions.default is the default value', () => {
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
		await config.setUserConfiguration('chat.permissions.default', 'autopilot');
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

	test('createNewSession gives chat.permissions.default precedence over remembered autoApprove while normalizing by policy', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
			[SessionConfigKey.AutoApprove]: 'autopilot',
		}), StorageScope.PROFILE, StorageTarget.MACHINE);

		// Case 1: policy restricts auto-approve — setting 'autoApprove' is clamped to 'default'
		const policyRestrictedConfig = createPolicyRestrictedConfigurationService();
		await policyRestrictedConfig.setUserConfiguration('chat.permissions.default', 'autoApprove');
		const policyRestrictedProvider = createProvider(disposables, agentHost, undefined, { configurationService: policyRestrictedConfig, storageService });
		policyRestrictedProvider.createNewSession(URI.parse('file:///home/user/project'), policyRestrictedProvider.sessionTypes[0].id);

		// Case 2: configured 'default' wins over remembered 'autopilot'
		const configuredDefaultConfig = new TestConfigurationService();
		await configuredDefaultConfig.setUserConfiguration('chat.permissions.default', 'default');
		const configuredDefaultProvider = createProvider(disposables, agentHost, undefined, { configurationService: configuredDefaultConfig, storageService });
		configuredDefaultProvider.createNewSession(URI.parse('file:///home/user/project'), configuredDefaultProvider.sessionTypes[0].id);

		// The forwarded config proves the setting took precedence over the
		// remembered value and was properly normalized.
		assert.deepStrictEqual({
			policyRestricted: agentHost.resolveSessionConfigRequests.at(-2)?.config?.autoApprove,
			configuredDefault: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove,
		}, {
			policyRestricted: 'default',
			configuredDefault: 'default',
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

	// ---- Rename -------

	test('renameChat dispatches SessionTitleChanged action', async () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'rename-sess', { title: 'Old Title' });

		const sessions = provider.getSessions();
		const target = sessions.find(s => s.title.get() === 'Old Title');
		assert.ok(target);

		await provider.renameChat(target!.sessionId, target!.resource, 'New Title');

		assert.strictEqual(agentHost.dispatchedActions.length, 1);
		const dispatched = agentHost.dispatchedActions[0];
		assert.strictEqual(dispatched.action.type, ActionType.SessionTitleChanged);
		assert.strictEqual((dispatched.action as { title: string }).title, 'New Title');
		const actionSession = dispatched.channel.toString();
		assert.strictEqual(AgentSession.provider(actionSession), 'copilotcli');
		assert.strictEqual(AgentSession.id(actionSession), 'rename-sess');
		assert.strictEqual(dispatched.clientId, 'test-local-client');
	});

	test('renameChat updates local title optimistically', async () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'rename-opt', { title: 'Before' });

		const sessions = provider.getSessions();
		const target = sessions.find(s => s.title.get() === 'Before');
		assert.ok(target);

		await provider.renameChat(target!.sessionId, target!.resource, 'After');
		assert.strictEqual(target!.title.get(), 'After');
	});

	test('renameChat is no-op for unknown session', async () => {
		const provider = createProvider(disposables, agentHost);
		await provider.renameChat('nonexistent-id', URI.parse('test://nonexistent'), 'Ignored');

		assert.strictEqual(agentHost.dispatchedActions.length, 0);
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

	test('server-echoed SessionModelChanged updates cached model', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'model-change', { title: 'Model Change', model: 'old-model' });

		const target = provider.getSessions().find(s => s.title.get() === 'Model Change');
		assert.ok(target);

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		agentHost.fireAction({
			channel: AgentSession.uri('copilotcli', 'model-change').toString(),
			action: {
				type: ActionType.SessionModelChanged,
				model: { id: 'new-model' } satisfies ModelSelection,
			},
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);

		assert.strictEqual(target!.modelId.get(), 'agent-host-copilotcli:new-model');
		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].changed.length, 1);
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
			channel: AgentSession.uri('copilotcli', 'turn-sess').toString(),
			action: {
				type: 'session/turnComplete',
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
			/not found or not a new session/,
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
			summary: { resource: AgentSession.uri('copilotcli', 'seed-1').toString(), provider: 'copilotcli', title: 'Seeded Session', status: ProtocolSessionStatus.Idle, createdAt: 0, modifiedAt: 0 },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
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
			summary: { resource: AgentSession.uri('copilotcli', 'seed-schema').toString(), provider: 'copilotcli', title: 'Schema Preserve Session', status: ProtocolSessionStatus.Idle, createdAt: 0, modifiedAt: 0 },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
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
			summary: { resource: AgentSession.uri('copilotcli', 'rep-1').toString(), provider: 'copilotcli', title: 'Replace Session', status: ProtocolSessionStatus.Idle, createdAt: 0, modifiedAt: 0 },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
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
			summary: { resource: AgentSession.uri('copilotcli', 'policy-write').toString(), provider: 'copilotcli', title: 'Policy Write Session', status: ProtocolSessionStatus.Idle, createdAt: 0, modifiedAt: 0 },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
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
			summary: { resource: AgentSession.uri('copilotcli', 'schema-write').toString(), provider: 'copilotcli', title: 'Schema Write Session', status: ProtocolSessionStatus.Idle, createdAt: 0, modifiedAt: 0 },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
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
			summary: { resource: AgentSession.uri('copilotcli', 'rep-2').toString(), provider: 'copilotcli', title: 'No-op Session', status: ProtocolSessionStatus.Idle, createdAt: 0, modifiedAt: 0 },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
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
			summary: { resource: AgentSession.uri('copilotcli', 'cfg-merge').toString(), provider: 'copilotcli', title: 'Merge Session', status: ProtocolSessionStatus.Idle, createdAt: 0, modifiedAt: 0 },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
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
			summary: { resource: AgentSession.uri('copilotcli', 'cfg-replace').toString(), provider: 'copilotcli', title: 'Replace Session', status: ProtocolSessionStatus.Idle, createdAt: 0, modifiedAt: 0 },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
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
});

suite('LocalAgentHostSessionsProvider - active-session branch changeset subscription', () => {
	const disposables = new DisposableStore();
	let agentHost: MockAgentHostService;
	let activeSession: ISettableObservable<IActiveSession | undefined>;

	setup(() => {
		agentHost = disposables.add(new MockAgentHostService());
		activeSession = observableValue<IActiveSession | undefined>('test.activeSession', undefined);
	});

	teardown(() => disposables.clear());

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
		return `${AgentSession.uri(sessionType, rawId).toString()}/changeset/session`;
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

	function addAndObserve(provider: LocalAgentHostSessionsProvider, rawId: string): ISession {
		fireSessionAdded(agentHost, rawId, { title: `Session ${rawId}` });
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

	test('active branch changeset uses before content URI as the diff original', () => {
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
	});

	test('changes summary tracks the live branch changeset while active and the catalogue once inactive', () => {
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

		// While active, the summary reflects the live branch changeset.
		assert.deepStrictEqual(session.changesSummary?.get(), { additions: 2, deletions: 1, files: 1 });

		// Once another session becomes active, the catalogue-seeded summary
		// takes over again.
		activeSession.set(makeActive('sess-B'), undefined);
		fireSessionSummaryChanged(agentHost, 'sess-A', { changes: { additions: 5, deletions: 3, files: 1 } });

		assert.deepStrictEqual(session.changesSummary?.get(), { additions: 5, deletions: 3, files: 1 });
	});
});
