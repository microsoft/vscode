/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable, type IReference } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSession, type IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agent.js';
import { IAgentHostConnectionsService, type IAgentHostSessionResolutionPolicy, type IAgentHostSessionSchemeAlias } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { agentHostAuthority, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { IAgentHostService, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { AgentHostTransportFailureReason } from '../../../../../../platform/agentHost/common/state/sessionTransport.js';
import { SessionArtifactType, withSessionArtifacts } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import type { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { MessageKind, SessionLifecycle, type AgentInfo, type AutomationState, type RootState, type SessionConfigState, type SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, NotificationType, type ActionEnvelope, type IRootConfigChangedAction, type SessionAction, type TerminalAction, type INotification, type ClientAnnotationsAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { buildDefaultChatUri, isAhpAutomationCatalogChannel, SessionStatus as ProtocolSessionStatus, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService, IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatWidget, IChatWidgetService } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService, type ChatSendResult, type IChatSendRequestOptions } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionChangeEvent } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ChatInteractivity, ChatModelSource, SessionRemoteConnectionFailureReason, SessionStatus, type ISession } from '../../../../../services/sessions/common/session.js';
import { RemoteAgentHostSessionsProvider, type IRemoteAgentHostSessionsProviderConfig } from '../../browser/remoteAgentHostSessionsProvider.js';
import { CloudSandboxSessionsProvider } from '../../browser/cloudSandboxSessionsProvider.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IGitHubService } from '../../../../github/browser/githubService.js';
import { IPullRequestIconCache, PullRequestIconCache } from '../../../../github/browser/pullRequestIconCache.js';
import { IAgentHostActiveClientService } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { CopilotCLISessionType } from '../../../agentHost/browser/baseAgentHostSessionsProvider.js';
import { IObservable, constObservable } from '../../../../../../base/common/observable.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { MockLabelService } from '../../../../../../workbench/services/label/test/common/mockLabelService.js';

// ---- Mock connection --------------------------------------------------------

class MockAgentConnection extends mock<IAgentConnection>() {
	private readonly _onDidAction = new Emitter<ActionEnvelope>();
	override readonly onDidAction = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<INotification>();
	override readonly onDidNotification = this._onDidNotification.event;

	private readonly _onDidRootStateChange = new Emitter<RootState>();
	private _rootStateValue: RootState = { agents: [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo] };
	override readonly rootState: IAgentSubscription<RootState>;
	override readonly initializeResult = constObservable({
		protocolVersion: '1',
		serverSeq: 0,
		snapshots: [],
		automations: { create: {}, schedules: {}, runCancellation: {} },
	});

	override readonly clientId = 'test-client-1';
	private readonly _sessions = new Map<string, IAgentSessionMetadata>();
	public disposedSessions: URI[] = [];
	public dispatchedActions: { channel: string; action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction; clientId: string; clientSeq: number }[] = [];
	public failResolveSessionConfig = false;
	public resolveSessionConfigResult: ResolveSessionConfigResult = { schema: { type: 'object', properties: {} }, values: { isolation: 'worktree' } };

	private _nextSeq = 0;

	constructor() {
		super();
		const self = this;
		this.rootState = {
			get value() { return self._rootStateValue; },
			get verifiedValue() { return self._rootStateValue; },
			onDidChange: self._onDidRootStateChange.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	}

	nextClientSeq(): number {
		return this._nextSeq++;
	}

	override async listSessions(): Promise<IAgentSessionMetadata[]> {
		return [...this._sessions.values()];
	}

	override async disposeSession(session: URI): Promise<void> {
		this.disposedSessions.push(session);
		const rawId = AgentSession.id(session);
		this._sessions.delete(rawId);
	}

	public createdSessionUris: URI[] = [];
	override async createSession(config?: { session?: URI }): Promise<URI> {
		const uri = config?.session ?? URI.parse('copilotcli:///auto');
		this.createdSessionUris.push(uri);
		return uri;
	}

	override async resolveSessionConfig(): Promise<ResolveSessionConfigResult> {
		await Promise.resolve();
		if (this.failResolveSessionConfig) {
			throw new Error('resolveSessionConfig unavailable');
		}
		return this.resolveSessionConfigResult;
	}

	dispatchAction(channel: string, action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		this.dispatchedActions.push({ channel, action, clientId, clientSeq });
	}

	override dispatch(channel: string, action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction): void {
		this.dispatchedActions.push({ channel, action, clientId: this.clientId, clientSeq: this._nextSeq++ });
	}

	// Test helpers
	addSession(meta: IAgentSessionMetadata): void {
		this._sessions.set(AgentSession.id(meta.session), meta);
	}

	// ---- Session-state subscriptions ---------------------------------------

	private readonly _sessionStateEmitters = new Map<string, Emitter<SessionState | AutomationState>>();
	private readonly _sessionStateErrorEmitters = new Map<string, Emitter<Error>>();
	private readonly _sessionStateValues = new Map<string, SessionState | AutomationState>();
	public sessionSubscribeCounts = new Map<string, number>();
	public sessionUnsubscribeCounts = new Map<string, number>();
	/**
	 * Channel URIs whose next subscribe fails the way a session the host has not created yet
	 * does: the reference resolves, then settles into an error state via `onDidError`.
	 */
	public readonly failNextSessionSubscribe = new Set<string>();

	override getSubscription<T>(_kind: StateComponents, resource: URI): IReference<IAgentSubscription<T>> {
		const key = resource.toString();
		if (isAhpAutomationCatalogChannel(key) && !this._sessionStateValues.has(key)) {
			this._sessionStateValues.set(key, { entries: [] });
		}
		return this._getSubscription<T>(key);
	}

	private _getSubscription<T>(key: string): IReference<IAgentSubscription<T>> {
		this.sessionSubscribeCounts.set(key, (this.sessionSubscribeCounts.get(key) ?? 0) + 1);
		let emitter = this._sessionStateEmitters.get(key);
		if (!emitter) {
			emitter = new Emitter<SessionState | AutomationState>();
			this._sessionStateEmitters.set(key, emitter);
		}
		let errorEmitter = this._sessionStateErrorEmitters.get(key);
		if (!errorEmitter) {
			errorEmitter = new Emitter<Error>();
			this._sessionStateErrorEmitters.set(key, errorEmitter);
		}
		const failing = this.failNextSessionSubscribe.delete(key);
		const self = this;
		let error: Error | undefined;
		const sub: IAgentSubscription<T> = {
			get value() { return (error ?? self._sessionStateValues.get(key)) as unknown as T | Error | undefined; },
			get verifiedValue() { return self._sessionStateValues.get(key) as unknown as T | undefined; },
			onDidChange: emitter.event as unknown as Event<T>,
			onDidError: errorEmitter.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		if (failing) {
			// Defer the error so the consumer can attach listeners after the reference resolves.
			queueMicrotask(() => {
				error = new Error(`not found: ${key}`);
				errorEmitter.fire(error);
			});
		}
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

	setAgents(agents: AgentInfo[]): void {
		this._rootStateValue = { agents };
		this._onDidRootStateChange.fire(this._rootStateValue);
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
		for (const emitter of this._sessionStateErrorEmitters.values()) {
			emitter.dispose();
		}
		this._sessionStateErrorEmitters.clear();
	}
}

// ---- Test helpers -----------------------------------------------------------

function createSession(id: string, opts?: { provider?: string; summary?: string; project?: { uri: URI; displayName: string }; workingDirectory?: URI; startTime?: number; modifiedTime?: number; status?: ProtocolSessionStatus; _meta?: IAgentSessionMetadata['_meta'] }): IAgentSessionMetadata {
	return {
		session: AgentSession.uri(opts?.provider ?? 'copilotcli', id),
		startTime: opts?.startTime ?? 1000,
		modifiedTime: opts?.modifiedTime ?? 2000,
		summary: opts?.summary,
		status: opts?.status,
		project: opts?.project,
		workingDirectories: opts?.workingDirectory ? [opts?.workingDirectory] : undefined,
		_meta: opts?._meta,
	};
}

function createProvider(disposables: DisposableStore, connection: MockAgentConnection, overrides?: { address?: string; preferenceKey?: string; connectionName?: string | undefined; sendRequest?: (resource: URI, message: string, options?: IChatSendRequestOptions) => Promise<ChatSendResult>; openSession?: boolean; storageService?: IStorageService; localAgentHostService?: IAgentHostService; noConnection?: boolean; connectOnDemand?: () => Promise<void>; isWebPlatform?: boolean; workspaceTrusted?: boolean; omitHostFromWorkspaceLabel?: boolean; workspaceTypeIcon?: ThemeIcon; sessionSchemeAlias?: IAgentHostSessionSchemeAlias; defaultChangesetKind?: IRemoteAgentHostSessionsProviderConfig['defaultChangesetKind']; sessionResolutionPolicies?: Array<{ authority: string; policy: IAgentHostSessionResolutionPolicy }>; devContainerWorktreeScope?: string; readOnlyWhenDisconnected?: boolean; ctor?: typeof RemoteAgentHostSessionsProvider; labelService?: ILabelService; defaultDirectory?: string }): RemoteAgentHostSessionsProvider {
	const instantiationService = disposables.add(new TestInstantiationService());

	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed: true }) });
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	instantiationService.stub(INotificationService, { error: () => { } });
	instantiationService.stub(IWorkspaceTrustManagementService, new class extends mock<IWorkspaceTrustManagementService>() {
		override isWorkspaceTrusted(): boolean { return overrides?.workspaceTrusted ?? true; }
		override async getUriTrustInfo(uri: URI) { return { uri, trusted: overrides?.workspaceTrusted ?? true }; }
	});
	instantiationService.stub(IChatSessionsService, {
		getChatSessionContribution: () => ({ type: 'remote-test-copilot', name: 'test', displayName: 'Test', description: 'test', icon: undefined }),
		getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } }),
	});
	instantiationService.stub(IChatService, {
		acquireOrLoadSession: async () => undefined,
		sendRequest: overrides?.sendRequest ?? (async (): Promise<ChatSendResult> => ({ kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never })),
	});
	instantiationService.stub(IChatWidgetService, {
		openSession: async () => overrides?.openSession ? new class extends mock<IChatWidget>() { }() : undefined,
	});
	instantiationService.stub(ILanguageModelsService, {
		lookupLanguageModel: () => undefined,
	});
	instantiationService.stub(IStorageService, overrides?.storageService ?? disposables.add(new InMemoryStorageService()));
	instantiationService.stub(IAgentHostService, overrides?.localAgentHostService ?? new class extends mock<IAgentHostService>() { }());
	instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
		registerSessionResolutionPolicy: (authority, policy) => {
			overrides?.sessionResolutionPolicies?.push({ authority, policy });
			return Disposable.None;
		},
	}));
	instantiationService.stub(IProgressService, {});
	instantiationService.stub(ILabelService, overrides?.labelService ?? new MockLabelService());
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IGitHubService, new class extends mock<IGitHubService>() {
		override findPullRequestNumberByHeadBranch = async () => undefined;
	}());
	instantiationService.stub(IPullRequestIconCache, instantiationService.createInstance(PullRequestIconCache));
	instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
		override readonly activeSession: IObservable<IActiveSession | undefined> = constObservable<IActiveSession | undefined>(undefined);
		override readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]> = constObservable<readonly (IActiveSession | undefined)[]>([]);
	}());
	instantiationService.stub(IAgentHostActiveClientService, new class extends mock<IAgentHostActiveClientService>() {
		override acquireScope = (_sessionType: string, _roots: readonly URI[]) => ({
			customizations: constObservable([]),
			customAgents: constObservable([]),
			tools: constObservable([]),
			isResolved: constObservable(true),
			whenResolved: () => Promise.resolve(),
			activeClient: (clientId: string) => constObservable({ clientId, tools: [], customizations: [] }),
			dispose: () => { },
		});
	}());

	const config: IRemoteAgentHostSessionsProviderConfig = {
		address: overrides?.address ?? 'localhost:4321',
		preferenceKey: overrides?.preferenceKey,
		name: overrides !== undefined && Object.prototype.hasOwnProperty.call(overrides, 'connectionName') ? overrides.connectionName ?? '' : 'Test Host',
		connectOnDemand: overrides?.connectOnDemand,
		omitHostFromWorkspaceLabel: overrides?.omitHostFromWorkspaceLabel,
		workspaceTypeIcon: overrides?.workspaceTypeIcon,
		sessionSchemeAlias: overrides?.sessionSchemeAlias,
		defaultChangesetKind: overrides?.defaultChangesetKind,
		devContainerWorktreeScope: overrides?.devContainerWorktreeScope,
		readOnlyWhenDisconnected: overrides?.readOnlyWhenDisconnected,
	};

	const baseCtor = overrides?.ctor ?? RemoteAgentHostSessionsProvider;
	const providerCtor = overrides?.isWebPlatform !== undefined
		? class extends baseCtor {
			protected override get isWebPlatform(): boolean { return overrides.isWebPlatform!; }
		}
		: baseCtor;
	const provider = disposables.add(instantiationService.createInstance(providerCtor, config));
	if (!overrides?.noConnection) {
		provider.setConnection(connection, overrides?.defaultDirectory);
	}
	return provider;
}

async function waitForSessionConfig(provider: RemoteAgentHostSessionsProvider, sessionId: string, predicate: (config: ResolveSessionConfigResult | undefined) => boolean): Promise<void> {
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

function fireSessionAdded(connection: MockAgentConnection, rawId: string, opts?: { provider?: string; title?: string; project?: { uri: string; displayName: string }; workingDirectory?: string; createdAt?: string; modifiedAt?: string; metadata?: Record<string, unknown> }): void {
	const provider = opts?.provider ?? 'copilotcli';
	const sessionUri = AgentSession.uri(provider, rawId);
	connection.fireNotification({
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
			_meta: opts?.metadata,
		},
	});
}

function fireSessionRemoved(connection: MockAgentConnection, rawId: string, provider = 'copilotcli'): void {
	const sessionUri = AgentSession.uri(provider, rawId);
	connection.fireNotification({
		channel: 'ahp-root://',
		type: NotificationType.SessionRemoved,
		session: sessionUri.toString(),
	});
}

suite('RemoteAgentHostSessionsProvider', () => {
	const disposables = new DisposableStore();
	let connection: MockAgentConnection;

	setup(() => {
		connection = new MockAgentConnection();
		disposables.add(toDisposable(() => connection.dispose()));
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Provider identity -------

	test('derives id and label from config, and session types from rootState agents', () => {
		const provider = createProvider(disposables, connection, { address: '10.0.0.1:8080', connectionName: 'My Host', isWebPlatform: false });

		assert.strictEqual(provider.id, 'agenthost-10.0.0.1__8080');
		assert.strictEqual(provider.label, 'My Host');
		assert.strictEqual(provider.sessionTypes.length, 1);
		assert.strictEqual(provider.sessionTypes[0].id, CopilotCLISessionType.id);
		assert.strictEqual(provider.sessionTypes[0].label, 'Copilot [My Host]');
	});

	test('registers provider-owned session resolution policy', () => {
		const policies: Array<{ authority: string; policy: IAgentHostSessionResolutionPolicy }> = [];
		createProvider(disposables, connection, {
			address: 'sandbox.example',
			sessionSchemeAlias: { ui: 'copilot', backend: 'ahp-session' },
			defaultChangesetKind: ChangesetKind.Session,
			sessionResolutionPolicies: policies,
		});

		assert.deepStrictEqual(policies, [{
			authority: agentHostAuthority('sandbox.example'),
			policy: {
				sessionSchemeAlias: { ui: 'copilot', backend: 'ahp-session' },
				defaultChangesetKind: ChangesetKind.Session,
			},
		}]);
	});

	test('session types update when the host advertises additional agents', () => {
		const provider = createProvider(disposables, connection, { address: '10.0.0.1:8080', connectionName: 'My Host', isWebPlatform: false });
		assert.deepStrictEqual(provider.sessionTypes.map(t => t.id), [
			CopilotCLISessionType.id,
		]);

		let changes = 0;
		disposables.add(provider.onDidChangeSessionTypes!(() => changes++));

		connection.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'openai', displayName: 'OpenAI', description: '', models: [] } as AgentInfo,
		]);

		assert.strictEqual(changes, 1);
		assert.deepStrictEqual(provider.sessionTypes.map(t => ({ id: t.id, label: t.label })), [
			{ id: CopilotCLISessionType.id, label: 'Copilot [My Host]' },
			{ id: 'openai', label: 'OpenAI [My Host]' },
		]);
	});

	test('session-type labels omit host suffix on web', () => {
		const provider = createProvider(disposables, connection, { address: '10.0.0.1:8080', connectionName: 'My Host', isWebPlatform: true });

		connection.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'openai', displayName: 'OpenAI', description: '', models: [] } as AgentInfo,
		]);

		assert.deepStrictEqual(provider.sessionTypes.map(t => ({ id: t.id, label: t.label })), [
			{ id: CopilotCLISessionType.id, label: 'Copilot' },
			{ id: 'openai', label: 'OpenAI' },
		]);
	});

	test('falls back to address-based label when no name given', () => {
		const provider = createProvider(disposables, connection, { connectionName: undefined, address: 'myhost:9999' });

		assert.strictEqual(provider.label, 'myhost:9999');
	});

	test('derives session remote connection status from the backing provider', () => {
		const provider = createProvider(disposables, connection);
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connected);
		fireSessionAdded(connection, 'connection-status');
		const session = provider.getSessions()[0];
		const statuses = [session.remoteConnectionStatus?.get()];

		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.reconnecting);
		statuses.push(session.remoteConnectionStatus?.get());
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
		statuses.push(session.remoteConnectionStatus?.get());
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnectedBecause(AgentHostTransportFailureReason.HostNotRunning));
		statuses.push(session.remoteConnectionStatus?.get());
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.incompatible('Protocol version mismatch', ['1']));
		statuses.push(session.remoteConnectionStatus?.get());

		assert.deepStrictEqual({
			hasRemoteHost: session.remoteConnectionStatus !== undefined,
			statuses,
		}, {
			hasRemoteHost: true,
			statuses: [
				{ kind: 'connected' },
				{ kind: 'reconnecting' },
				{ kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.Unknown },
				{ kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning },
				{ kind: 'incompatible' },
			],
		});
	});

	test('keeps initial connections read-only but permits self-healing reconnects', () => {
		const provider = createProvider(disposables, connection, { readOnlyWhenDisconnected: true });
		provider.seedSessions([createSession('sandbox-session')]);
		const chat = provider.getSessions()[0].mainChat.get();
		const statuses = [
			RemoteAgentHostConnectionStatus.disconnected,
			RemoteAgentHostConnectionStatus.connecting,
			RemoteAgentHostConnectionStatus.connected,
			RemoteAgentHostConnectionStatus.reconnecting,
			RemoteAgentHostConnectionStatus.disconnected,
			RemoteAgentHostConnectionStatus.connecting,
			RemoteAgentHostConnectionStatus.disconnected,
			RemoteAgentHostConnectionStatus.incompatible('Protocol version mismatch', ['1']),
			RemoteAgentHostConnectionStatus.connected,
		];
		const interactivity = statuses.map(status => {
			provider.setConnectionStatus(status);
			return { status: status.kind, interactivity: chat.interactivity.get() };
		});

		assert.deepStrictEqual(interactivity, [
			{ status: 'disconnected', interactivity: ChatInteractivity.ReadOnly },
			{ status: 'connecting', interactivity: ChatInteractivity.ReadOnly },
			{ status: 'connected', interactivity: ChatInteractivity.Full },
			{ status: 'reconnecting', interactivity: ChatInteractivity.Full },
			{ status: 'disconnected', interactivity: ChatInteractivity.ReadOnly },
			{ status: 'connecting', interactivity: ChatInteractivity.ReadOnly },
			{ status: 'disconnected', interactivity: ChatInteractivity.ReadOnly },
			{ status: 'incompatible', interactivity: ChatInteractivity.ReadOnly },
			{ status: 'connected', interactivity: ChatInteractivity.Full },
		]);
	});

	test('does not present an active chat as busy while its remote host is unavailable', () => {
		const provider = createProvider(disposables, connection);
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connected);
		provider.seedSessions([createSession('active-session', { status: ProtocolSessionStatus.InProgress })]);
		const session = provider.getSessions()[0];
		const chat = session.mainChat.get();
		const statuses = [chat.status.get()];

		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnectedBecause(AgentHostTransportFailureReason.HostNotRunning));
		statuses.push(chat.status.get());
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connected);
		statuses.push(chat.status.get());

		assert.deepStrictEqual(statuses, [SessionStatus.InProgress, SessionStatus.Error, SessionStatus.InProgress]);
	});

	test('resolves a cached session without connecting during restore and prepares it on demand', async () => {
		let connectCalls = 0;
		const connectionHolder: { provider?: RemoteAgentHostSessionsProvider } = {};
		connection.addSession(createSession('cached-session'));
		const provider = createProvider(disposables, connection, {
			noConnection: true,
			connectOnDemand: async () => {
				connectCalls++;
				if (!connectionHolder.provider) {
					throw new Error('Provider was not initialized');
				}
				connectionHolder.provider.setConnection(connection);
			},
		});
		connectionHolder.provider = provider;
		provider.seedSessions([createSession('cached-session')]);
		const sessionResource = provider.getSessions()[0].resource;

		const unrelated = await provider.resolveSessionResource(URI.parse('other:///session'), 'open');
		const resolved = await provider.resolveSessionResource(sessionResource, 'restore');
		const connectCallsAfterResolve = connectCalls;
		await provider.prepareSessionForOpen(provider.getSessions()[0], 'restore');
		const resolvedWhileConnected = await provider.resolveSessionResource(sessionResource, 'open');
		await provider.prepareSessionForOpen(provider.getSessions()[0], 'open');

		assert.deepStrictEqual({
			unrelated,
			resolved: resolved?.toString(),
			resolvedWhileConnected: resolvedWhileConnected?.toString(),
			connectCallsAfterResolve,
			connectCalls,
		}, {
			unrelated: undefined,
			resolved: sessionResource.toString(),
			resolvedWhileConnected: sessionResource.toString(),
			connectCallsAfterResolve: 0,
			connectCalls: 1,
		});
	});

	test('remoteLocationPreferenceKey defaults to the live address when no stable preference key is given (e.g. tunnels/WSL)', () => {
		const provider = createProvider(disposables, connection, { address: 'tunnel:abc123' });
		assert.strictEqual(provider.remoteLocationPreferenceKey, 'tunnel:abc123');
	});

	test('remoteLocationPreferenceKey is distinct from the live forwarded address for a real SSH host', () => {
		const provider = createProvider(disposables, connection, { address: 'localhost:4321', preferenceKey: 'ssh:my-host-alias' });
		assert.strictEqual(provider.remoteAddress, 'localhost:4321');
		assert.strictEqual(provider.remoteLocationPreferenceKey, 'ssh:my-host-alias');
	});

	test('session type icons use per-agent codicons', () => {
		connection.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'claude', displayName: 'Claude', description: '', models: [] } as AgentInfo,
			{ provider: 'openai', displayName: 'OpenAI', description: '', models: [] } as AgentInfo,
			{ provider: 'unknown-agent', displayName: 'Unknown', description: '', models: [] } as AgentInfo,
		]);
		const provider = createProvider(disposables, connection, { address: '10.0.0.1:8080', connectionName: 'My Host' });
		assert.deepStrictEqual(
			provider.sessionTypes.map(t => ({ id: t.id, icon: t.icon.id })),
			[
				{ id: CopilotCLISessionType.id, icon: 'copilot' },
				{ id: 'claude', icon: 'claude' },
				{ id: 'openai', icon: 'openai' },
				{ id: 'unknown-agent', icon: 'remote' },
			],
		);
	});

	// ---- Workspace resolution -------

	test('resolveWorkspace builds workspace from URI', () => {
		const provider = createProvider(disposables, connection, { isWebPlatform: true });
		const uri = URI.parse('vscode-agent-host://localhost__4321/home/user/project');
		const ws = provider.resolveWorkspace(uri);

		assert.ok(ws, 'resolveWorkspace should resolve vscode-agent-host:// URIs');
		assert.strictEqual(ws.label, 'project');
		assert.strictEqual(ws.folders.length, 1);
		assert.strictEqual(ws.folders[0].root.toString(), uri.toString());
	});

	test('createNewSession eagerly creates the backend session in a trusted folder', async () => {
		const provider = createProvider(disposables, connection);
		const session = provider.createNewSession(URI.parse('vscode-agent-host://localhost__4321/home/user/trusted-project'), provider.sessionTypes[0].id);
		provider.setAuthenticationPending(false); // eager create only runs once auth settles
		await timeout(0); // let the eager createSession promise resolve

		const rawId = session.resource.path.substring(1);
		const expectedBackendUri = AgentSession.uri(provider.sessionTypes[0].id, rawId);
		assert.deepStrictEqual(
			connection.createdSessionUris.map(u => u.toString()),
			[expectedBackendUri.toString()],
			'eager createSession should be invoked with the client-allocated URI',
		);
	});

	test('createNewSession does not eagerly create the backend session in an untrusted folder', async () => {
		const provider = createProvider(disposables, connection, { workspaceTrusted: false });
		provider.createNewSession(URI.parse('vscode-agent-host://localhost__4321/home/user/untrusted-project'), provider.sessionTypes[0].id);
		provider.setAuthenticationPending(false); // settle auth so only trust can gate the eager create
		await timeout(0); // let the (suppressed) eager createSession path settle

		assert.deepStrictEqual(
			connection.createdSessionUris.map(u => u.toString()),
			[],
			'no eager createSession should be invoked for an untrusted folder',
		);
	});

	// ---- Browse actions -------

	test('has one browse action for remote folders', () => {
		const provider = createProvider(disposables, connection);

		assert.strictEqual(provider.browseActions.length, 1);
		assert.ok(provider.browseActions[0].label.includes('Folders'));
		assert.strictEqual(provider.browseActions[0].providerId, provider.id);
	});

	// ---- Session listing via notifications -------

	test('onDidChangeSessions fires when session added notification arrives', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createProvider(disposables, connection);
		await timeout(0);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		fireSessionAdded(connection, 'notif-1', { title: 'Notif Session' });
		await timeout(100);

		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].added.length, 1);
		assert.strictEqual(changes[0].added[0].title.get(), 'Notif Session');
	}));

	test('session added notifications ingest any advertised agent provider', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.setAgents([
			{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [] } as AgentInfo,
			{ provider: 'openai', displayName: 'OpenAI', description: '', models: [] } as AgentInfo,
		]);
		const provider = createProvider(disposables, connection);

		fireSessionAdded(connection, 'cop-1', { provider: 'copilotcli', title: 'Copilot Session' });
		fireSessionAdded(connection, 'oai-1', { provider: 'openai', title: 'OpenAI Session' });

		const sessions = provider.getSessions();
		assert.deepStrictEqual(
			sessions.map(s => ({ title: s.title.get(), sessionType: s.sessionType })).sort((a, b) => a.title.localeCompare(b.title)),
			[
				{ title: 'Copilot Session', sessionType: CopilotCLISessionType.id },
				{ title: 'OpenAI Session', sessionType: 'openai' },
			],
		);
	}));

	test('session removed notification removes from cache', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createProvider(disposables, connection);
		await timeout(0);
		fireSessionAdded(connection, 'to-remove', { title: 'Removed' });

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		fireSessionRemoved(connection, 'to-remove');
		await timeout(100);

		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].removed.length, 1);
	}));

	test('duplicate session added notification is ignored', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createProvider(disposables, connection);
		await timeout(0);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		const timestamp = new Date(0).toISOString();
		fireSessionAdded(connection, 'dup-sess', { title: 'Dup', createdAt: timestamp, modifiedAt: timestamp });
		fireSessionAdded(connection, 'dup-sess', { title: 'Dup', createdAt: timestamp, modifiedAt: timestamp });
		await timeout(100);

		assert.strictEqual(changes.length, 1);
	}));

	test('uses project metadata as workspace group source', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const projectUri = URI.parse('vscode-agent-host://localhost__4321/home/user/vscode?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0');
		const workingDirectory = URI.parse('vscode-agent-host://localhost__4321/tmp/copilot-worktrees/vscode-feature?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0');
		connection.addSession(createSession('project-1', {
			summary: 'Project Session',
			project: { uri: projectUri, displayName: 'vscode' },
			workingDirectory,
		}));

		const provider = createProvider(disposables, connection, { isWebPlatform: true });
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

	test('session added converts file project URIs and preserves repository URLs', () => {
		const provider = createProvider(disposables, connection);

		fireSessionAdded(connection, 'file-project', {
			title: 'File Project',
			project: { uri: 'file:///home/user/vscode', displayName: 'vscode' },
			workingDirectory: 'file:///tmp/copilot-worktrees/vscode-feature',
		});
		fireSessionAdded(connection, 'url-project', {
			title: 'URL Project',
			project: { uri: 'https://github.com/microsoft/vscode', displayName: 'vscode' },
		});

		const workspaces = provider.getSessions().map(session => session.workspace.get());
		assert.deepStrictEqual(workspaces.map(workspace => workspace?.folders[0]?.root.toString()), [
			'vscode-agent-host://localhost__4321/home/user/vscode?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0',
			'https://github.com/microsoft/vscode',
		]);
	});

	test('removing non-existent session is no-op', () => {
		const provider = createProvider(disposables, connection);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		fireSessionRemoved(connection, 'does-not-exist');

		assert.strictEqual(changes.length, 0);
	});

	// ---- Session listing via refresh -------

	test('getSessions populates from connection.listSessions', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('list-1', { summary: 'First' }));
		connection.addSession(createSession('list-2', { summary: 'Second' }));

		const provider = createProvider(disposables, connection);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		provider.getSessions();
		await timeout(0);

		assert.ok(changes.length > 0);
		const sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 2);
	}));

	test('session added notification does not carry model metadata', () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'notif-model', { title: 'Notif Model Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Notif Model Session');
		assert.strictEqual(session?.modelId.get(), undefined);
	});

	test('setModel updates existing session model without dispatching session-level model change', () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'set-model', { title: 'Set Model Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Set Model Session');
		assert.ok(session);

		provider.setModel(session!.sessionId, session!.resource, 'remote-localhost__4321-copilotcli:new-model', ChatModelSource.Chosen);

		assert.strictEqual(session!.modelId.get(), 'remote-localhost__4321-copilotcli:new-model');
		assert.strictEqual(connection.dispatchedActions.length, 0);
	});

	test('setModel leaves dispatch log untouched for later message-level selection', () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'set-model-config', { title: 'Set Model Config Session' });

		const session = provider.getSessions().find(s => s.title.get() === 'Set Model Config Session');
		assert.ok(session);

		provider.setModel(session!.sessionId, session!.resource, 'remote-localhost__4321-copilotcli:configured-model', ChatModelSource.Chosen);

		assert.strictEqual(session!.modelId.get(), 'remote-localhost__4321-copilotcli:configured-model');
		assert.strictEqual(connection.dispatchedActions.length, 0);
	});

	// ---- Session lifecycle -------

	test('createNewSession returns session with correct fields', () => {
		const provider = createProvider(disposables, connection, { isWebPlatform: true });
		const session = provider.createNewSession(URI.parse('vscode-agent-host://localhost__4321/home/user/project'), provider.sessionTypes[0].id);

		assert.strictEqual(session.providerId, provider.id);
		assert.strictEqual(session.status.get(), SessionStatus.Untitled);
		assert.ok(session.workspace.get());
		assert.strictEqual(session.workspace.get()?.label, 'project');
		// sessionType should be the logical type, not the resource scheme
		assert.strictEqual(session.sessionType, provider.sessionTypes[0].id);
		assert.deepStrictEqual(provider.getSessionConfig(session.sessionId), { schema: { type: 'object', properties: {} }, values: {} });
	});

	test('createNewSession clears session config when resolving config is unavailable', async () => {
		connection.failResolveSessionConfig = true;
		const provider = createProvider(disposables, connection, { isWebPlatform: true });
		const workspaceUri = URI.parse('vscode-agent-host://localhost__4321/home/user/project');
		const session = provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
		const resolved = provider.getSessionByResource(session.resource);

		assert.deepStrictEqual({
			listedSessions: provider.getSessions().length,
			resolvedResource: resolved?.resource.toString(),
			resolvedWorkspaceLabel: resolved?.workspace.get()?.label,
		}, {
			listedSessions: 0,
			resolvedResource: session.resource.toString(),
			resolvedWorkspaceLabel: 'project',
		});
	});

	test('clearConnection clears pending new session config and capabilities', () => {
		connection.setAgents([{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { multipleChats: { fork: true } } } as AgentInfo]);
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'running-session', { title: 'Running Session' });
		const runningSession = provider.getSessions()[0];

		const session = provider.createNewSession(URI.parse('vscode-agent-host://localhost__4321/home/user/project'), provider.sessionTypes[0].id);
		const supportsMultipleChatsBeforeDisconnect = runningSession.capabilities.get().supportsMultipleChats;
		provider.clearConnection();

		assert.deepStrictEqual({
			resolved: provider.getSessionByResource(session.resource),
			config: provider.getSessionConfig(session.sessionId),
			sessionTypes: provider.sessionTypes,
			supportsMultipleChatsBeforeDisconnect,
			supportsMultipleChatsAfterDisconnect: runningSession.capabilities.get().supportsMultipleChats,
		}, {
			resolved: undefined,
			config: undefined,
			sessionTypes: [],
			supportsMultipleChatsBeforeDisconnect: true,
			supportsMultipleChatsAfterDisconnect: false,
		});
	});

	// ---- Session actions -------

	test('deleteSession calls disposeSession with backend agent URI and removes from cache', async () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'del-sess', { title: 'To Delete' });

		const sessions = provider.getSessions();
		const target = sessions.find((s) => s.title.get() === 'To Delete');
		assert.ok(target, 'Session should exist');

		await provider.deleteSession(target!.sessionId);

		assert.strictEqual(connection.disposedSessions.length, 1);
		// The disposed URI must be a backend agent session URI (copilot://del-sess),
		// not the UI resource (remote-localhost_4321-copilot:///del-sess)
		const disposedUri = connection.disposedSessions[0];
		assert.strictEqual(AgentSession.provider(disposedUri), 'copilotcli');
		assert.strictEqual(AgentSession.id(disposedUri), 'del-sess');
		// Session should no longer appear in getSessions
		const remaining = provider.getSessions();
		assert.strictEqual(remaining.find((s) => s.title.get() === 'To Delete'), undefined);
	});

	test('delegates Dev Container worktree lifecycle by handle from session metadata', async () => {
		const handle = '00000000-0000-4000-8000-000000000001';
		const metadata = { 'vscode.devContainerWorktree': { version: 1, handle } };
		const delegated: string[] = [];
		const localAgentHostService = new class extends mock<IAgentHostService>() {
			override async setDetachedWorktreeArchived(actualHandle: string, archived: boolean): Promise<void> {
				delegated.push(`${archived ? 'archive' : 'unarchive'}:${actualHandle}`);
			}
			override async deleteDetachedWorktree(actualHandle: string): Promise<void> {
				delegated.push(`delete:${actualHandle}`);
			}
		}();
		const provider = createProvider(disposables, connection, { localAgentHostService });
		fireSessionAdded(connection, 'dev-container-worktree', { title: 'Dev Container Worktree', metadata });
		const session = provider.getSessions().find(candidate => candidate.title.get() === 'Dev Container Worktree');
		assert.ok(session);
		await provider.deleteSession(session.sessionId);

		const unarchiveConnection = new MockAgentConnection();
		const unarchiveProvider = createProvider(disposables, unarchiveConnection, { localAgentHostService });
		fireSessionAdded(unarchiveConnection, 'dev-container-worktree-unarchive', { title: 'Dev Container Worktree Unarchive', metadata });
		const sessionToUnarchive = unarchiveProvider.getSessions().find(candidate => candidate.title.get() === 'Dev Container Worktree Unarchive');
		assert.ok(sessionToUnarchive);
		await unarchiveProvider.unarchiveSession(sessionToUnarchive.sessionId);

		const archiveConnection = new MockAgentConnection();
		const archiveProvider = createProvider(disposables, archiveConnection, { localAgentHostService });
		fireSessionAdded(archiveConnection, 'dev-container-worktree-archive', { title: 'Dev Container Worktree Archive', metadata });
		const sessionToArchive = archiveProvider.getSessions().find(candidate => candidate.title.get() === 'Dev Container Worktree Archive');
		assert.ok(sessionToArchive);
		await archiveProvider.archiveSession(sessionToArchive.sessionId);

		assert.deepStrictEqual(delegated, [
			`delete:${handle}`,
			`unarchive:${handle}`,
			`archive:${handle}`,
		]);
	});

	test('deletes a detached Dev Container worktree when its draft is abandoned', async () => {
		const handle = '00000000-0000-4000-8000-000000000001';
		const deleted = new DeferredPromise<void>();
		const localAgentHostService = new class extends mock<IAgentHostService>() {
			override async deleteDetachedWorktree(actualHandle: string): Promise<void> {
				assert.strictEqual(actualHandle, handle);
				deleted.complete();
			}
		}();
		const provider = createProvider(disposables, connection, { localAgentHostService });
		const draft = provider.createNewSession(
			URI.parse('vscode-agent-host://localhost__4321/home/user/project'),
			provider.sessionTypes[0].id,
			{ metadata: { 'vscode.devContainerWorktree': { version: 1, handle } } },
		);

		provider.deleteNewSession(draft.sessionId);
		await deleted.p;

		assert.strictEqual(deleted.isSettled, true);
	});

	test('deletes a detached Dev Container worktree when its draft provider disconnects', async () => {
		const handle = '00000000-0000-4000-8000-000000000001';
		const deleted = new DeferredPromise<void>();
		const provider = createProvider(disposables, connection, {
			localAgentHostService: new class extends mock<IAgentHostService>() {
				override async deleteDetachedWorktree(actualHandle: string): Promise<void> {
					assert.strictEqual(actualHandle, handle);
					deleted.complete();
				}
			}(),
		});
		provider.createNewSession(
			URI.parse('vscode-agent-host://localhost__4321/home/user/project'),
			provider.sessionTypes[0].id,
			{ metadata: { 'vscode.devContainerWorktree': { version: 1, handle } } },
		);

		provider.clearConnection();
		await deleted.p;

		assert.strictEqual(deleted.isSettled, true);
	});

	test('deletes a detached Dev Container worktree when the remote session is removed', async () => {
		const handle = '00000000-0000-4000-8000-000000000001';
		const deleted = new DeferredPromise<void>();
		createProvider(disposables, connection, {
			localAgentHostService: new class extends mock<IAgentHostService>() {
				override async deleteDetachedWorktree(actualHandle: string): Promise<void> {
					assert.strictEqual(actualHandle, handle);
					deleted.complete();
				}
			}(),
		});
		fireSessionAdded(connection, 'removed-dev-container-worktree', {
			metadata: { 'vscode.devContainerWorktree': { version: 1, handle } },
		});

		fireSessionRemoved(connection, 'removed-dev-container-worktree');
		await deleted.p;

		assert.strictEqual(deleted.isSettled, true);
	});

	test('reconciles detached worktree handles after an authoritative session listing', async () => {
		class RefreshableRemoteAgentHostSessionsProvider extends RemoteAgentHostSessionsProvider {
			refresh(): Promise<void> { return this._refreshSessions(); }
		}
		const handle = '00000000-0000-4000-8000-000000000001';
		const metadata = { 'vscode.devContainerWorktree': { version: 1, handle } };
		const reconciliations: { scope: string; activeHandles: readonly string[] }[] = [];
		const provider = createProvider(disposables, connection, {
			ctor: RefreshableRemoteAgentHostSessionsProvider,
			devContainerWorktreeScope: 'file:///workspace',
			localAgentHostService: new class extends mock<IAgentHostService>() {
				override async reconcileDetachedWorktrees(scope: string, activeHandles: readonly string[]): Promise<void> {
					reconciliations.push({ scope, activeHandles });
				}
			}(),
		}) as RefreshableRemoteAgentHostSessionsProvider;
		const session = createSession('temporarily-unlisted', { _meta: metadata });
		connection.addSession(session);
		await provider.refresh();

		await connection.disposeSession(session.session);
		await provider.refresh();

		assert.deepStrictEqual(reconciliations, [
			{ scope: 'file:///workspace', activeHandles: [] },
			{ scope: 'file:///workspace', activeHandles: [handle] },
			{ scope: 'file:///workspace', activeHandles: [] },
		]);
	});

	// ---- Rename -------

	test('renameSession dispatches SessionTitleChanged action with correct session URI', async () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'rename-sess', { title: 'Old Title' });

		const sessions = provider.getSessions();
		const target = sessions.find((s) => s.title.get() === 'Old Title');
		assert.ok(target, 'Session should exist');

		await provider.renameSession(target!.sessionId, 'New Title');

		assert.strictEqual(connection.dispatchedActions.length, 1);
		const dispatched = connection.dispatchedActions[0];
		assert.strictEqual(dispatched.action.type, ActionType.SessionTitleChanged);
		assert.strictEqual((dispatched.action as { title: string }).title, 'New Title');
		// The session URI in the action must be the backend agent session URI
		const actionSession = dispatched.channel.toString();
		assert.strictEqual(AgentSession.provider(actionSession), 'copilotcli');
		assert.strictEqual(AgentSession.id(actionSession), 'rename-sess');
		assert.strictEqual(dispatched.clientId, 'test-client-1');
	});

	test('renameSession updates local title optimistically', async () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'rename-opt', { title: 'Before' });

		const sessions = provider.getSessions();
		const target = sessions.find((s) => s.title.get() === 'Before');
		assert.ok(target);

		await provider.renameSession(target!.sessionId, 'After');

		assert.strictEqual(target!.title.get(), 'After');
	});

	test('renameSession is no-op for unknown chatId', async () => {
		const provider = createProvider(disposables, connection);
		await provider.renameSession('nonexistent-id', 'Ignored');

		assert.strictEqual(connection.dispatchedActions.length, 0);
	});

	test('renameSession increments clientSeq on successive calls', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('seq-sess', { summary: 'Seq Test' }));
		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await timeout(0);

		const sessions = provider.getSessions();
		const target = sessions.find((s) => s.title.get() === 'Seq Test');
		assert.ok(target);

		await provider.renameSession(target!.sessionId, 'Title 1');
		await provider.renameSession(target!.sessionId, 'Title 2');

		assert.strictEqual(connection.dispatchedActions.length, 2);
		assert.strictEqual(connection.dispatchedActions[0].clientSeq, 0);
		assert.strictEqual(connection.dispatchedActions[1].clientSeq, 1);
	}));

	test('server-echoed SessionTitleChanged updates cached title', () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'echo-sess', { title: 'Original' });

		const sessions = provider.getSessions();
		const target = sessions.find((s) => s.title.get() === 'Original');
		assert.ok(target);

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		// Simulate the server echoing a title change (from auto-generation or another client)
		connection.fireAction({
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
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'model-change', { title: 'Model Change' });

		const target = provider.getSessions().find(s => s.title.get() === 'Model Change');
		assert.ok(target);
		provider.setModel(target!.sessionId, target!.resource, 'remote-localhost__4321-copilotcli:old-model', ChatModelSource.Chosen);

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		connection.fireAction({
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

		assert.strictEqual(target!.modelId.get(), 'remote-localhost__4321-copilotcli:old-model');
		assert.strictEqual(changes.length, 0);
	});

	test('renamed title survives session refresh from listSessions', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Simulate server persisting the renamed title: after rename, listSessions
		// returns the updated summary
		connection.addSession(createSession('persist-sess', { summary: 'Original Title' }));
		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await timeout(0);

		// Verify initial title
		let sessions = provider.getSessions();
		let target = sessions.find((s) => s.title.get() === 'Original Title');
		assert.ok(target, 'Session should exist with original title');

		// Simulate server updating the summary (as would happen after persist + reload)
		connection.addSession(createSession('persist-sess', { summary: 'Renamed Title', modifiedTime: 5000 }));

		// Trigger refresh via turnComplete action (simulates what happens on reload)
		connection.fireAction({
			channel: buildDefaultChatUri(AgentSession.uri('copilotcli', 'persist-sess').toString()),
			action: {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-1',
				duration: 1000,
			},
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);

		await timeout(0);

		sessions = provider.getSessions();
		target = sessions.find((s) => s.title.get() === 'Renamed Title');
		assert.ok(target, 'Session should have renamed title after refresh');
	}));

	// ---- Send -------

	test('new session stays loading when required config is missing', async () => {
		connection.resolveSessionConfigResult = {
			schema: { type: 'object', required: ['branch'], properties: { branch: { type: 'string', title: 'Branch', enum: ['main'] } } },
			values: {},
		};
		const provider = createProvider(disposables, connection);
		const session = provider.createNewSession(URI.parse('vscode-agent-host://localhost__4321/home/user/project'), provider.sessionTypes[0].id);
		provider.setAuthenticationPending(false);
		await waitForSessionConfig(provider, session.sessionId, config => config?.schema.required?.includes('branch') === true);

		assert.strictEqual(session.loading.get(), true);
	});

	test('cached session loading reflects authenticationPending', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('cached-auth', { summary: 'Cached' }));
		const provider = createProvider(disposables, connection);
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connected);
		await timeout(0);

		const session = provider.getSessions().find(s => s.title.get() === 'Cached');
		assert.ok(session);
		// Default at construction is `true`; clear it and verify.
		assert.strictEqual(session!.loading.get(), true);

		provider.setAuthenticationPending(false);
		assert.strictEqual(session!.loading.get(), false);

		// Sticky: a subsequent re-auth pass must not flicker the UI back to loading.
		provider.setAuthenticationPending(true);
		assert.strictEqual(session!.loading.get(), false);
	}));

	test('cached session loading settles while the host is unavailable but stays pending while it connects', async () => {
		connection.addSession(createSession('cached-connection-state', { summary: 'Cached' }));
		const provider = createProvider(disposables, connection);
		await timeout(0);

		const session = provider.getSessions().find(s => s.title.get() === 'Cached');
		assert.ok(session);
		const loading = [session!.loading.get()];

		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
		loading.push(session!.loading.get());
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.reconnecting);
		loading.push(session!.loading.get());
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.incompatible('Protocol version mismatch', ['1']));
		loading.push(session!.loading.get());
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
		loading.push(session!.loading.get());
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connected);
		loading.push(session!.loading.get());

		assert.deepStrictEqual(loading, [false, true, true, false, false, true]);
	});

	test('unpublishCachedSessions hides sessions but retains persisted cache', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		connection.addSession(createSession('keep-me', { summary: 'Keep Me' }));
		const provider = createProvider(disposables, connection, { storageService });
		await timeout(0);
		assert.strictEqual(provider.getSessions().length, 1);

		const events: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => events.push(e)));

		provider.unpublishCachedSessions();

		// Sessions are hidden from the listing immediately.
		assert.deepStrictEqual(
			{
				sessionCount: provider.getSessions().length,
				eventCount: events.length,
				eventRemovedTitles: events.flatMap(e => e.removed.map(s => s.title.get())),
			},
			{ sessionCount: 0, eventCount: 1, eventRemovedTitles: [] },
		);

		// Flush triggers onWillSaveState; the metadata must survive so the
		// session re-serializes instead of being dropped from storage.
		await storageService.flush();

		const provider2 = createProvider(disposables, new MockAgentConnection(), { storageService, noConnection: true });
		assert.deepStrictEqual(
			provider2.getSessions().map(s => s.title.get()),
			['Keep Me'],
		);
	}));

	test('authoritative session update persists materialized workspace metadata', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const provider = createProvider(disposables, connection, { storageService });
		const timestamp = new Date(0).toISOString();
		fireSessionAdded(connection, 'persist-upsert', {
			title: 'Worktree Session',
			project: { uri: 'file:///Users/me/project', displayName: 'project' },
			workingDirectory: 'file:///Users/me/project',
			createdAt: timestamp,
			modifiedAt: timestamp,
		});
		fireSessionAdded(connection, 'persist-upsert', {
			title: 'Worktree Session',
			project: { uri: 'file:///Users/me/project', displayName: 'project' },
			workingDirectory: 'file:///Users/me/project.worktrees/session',
			createdAt: timestamp,
			modifiedAt: new Date(1000).toISOString(),
		});
		const currentWorkspace = provider.getSessions()[0].workspace.get()!;

		await storageService.flush();

		const restoredProvider = createProvider(disposables, new MockAgentConnection(), { storageService, noConnection: true });
		const restoredWorkspace = restoredProvider.getSessions()[0].workspace.get()!;
		assert.deepStrictEqual({
			current: {
				root: currentWorkspace.folders[0].root.path,
				workingDirectory: currentWorkspace.folders[0].workingDirectory.path,
			},
			restored: {
				root: restoredWorkspace.folders[0].root.path,
				workingDirectory: restoredWorkspace.folders[0].workingDirectory.path,
			},
		}, {
			current: {
				root: '/Users/me/project',
				workingDirectory: '/Users/me/project.worktrees/session',
			},
			restored: {
				root: '/Users/me/project',
				workingDirectory: '/Users/me/project.worktrees/session',
			},
		});
	}));

	test('setConnection after unpublishCachedSessions restores cached sessions', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('restore-me', { summary: 'Restore Me' }));
		const provider = createProvider(disposables, connection);
		await timeout(0);
		assert.strictEqual(provider.getSessions().length, 1);

		provider.unpublishCachedSessions();
		assert.strictEqual(provider.getSessions().length, 0);
		const events: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => events.push(e)));

		// Simulate the host coming back online with a fresh connection that
		// still reports the same session with updated metadata.
		const reconnected = new MockAgentConnection();
		disposables.add(toDisposable(() => reconnected.dispose()));
		reconnected.addSession(createSession('restore-me', { summary: 'Restored' }));
		provider.setConnection(reconnected);
		await timeout(0);

		assert.deepStrictEqual(
			{
				sessions: provider.getSessions().map(s => s.title.get()),
				added: events.flatMap(e => e.added.map(s => s.title.get())),
				changed: events.flatMap(e => e.changed.map(s => s.title.get())),
				removed: events.flatMap(e => e.removed.map(s => s.title.get())),
			},
			{
				sessions: ['Restored'],
				added: ['Restored'],
				changed: ['Restored'],
				removed: [],
			},
		);
	}));

	test('sendRequest throws for unknown session', async () => {
		const provider = createProvider(disposables, connection);
		await assert.rejects(
			() => provider.sendRequest('nonexistent', URI.parse('untitled:chat'), { query: 'test' }),
			/not found/,
		);
	});

	test('sendRequest forwards resolved session config to chat service', async () => {
		const sendOptions: IChatSendRequestOptions[] = [];
		const provider = createProvider(disposables, connection, {
			openSession: true,
			sendRequest: async (_resource, _message, options): Promise<ChatSendResult> => {
				if (options) {
					sendOptions.push(options);
				}
				connection.addSession(createSession('created-from-send', { summary: 'Created From Send' }));
				return { kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never };
			},
		});
		const session = provider.createNewSession(URI.parse('vscode-agent-host://localhost__4321/home/user/project'), provider.sessionTypes[0].id);
		provider.setAuthenticationPending(false);
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.isolation === 'worktree');

		const chat = await provider.createNewChat(session.sessionId);
		await provider.sendRequest(session.sessionId, chat.resource, { query: 'hello' });

		assert.deepStrictEqual(sendOptions.map(options => options.agentHostSessionConfig), [{ isolation: 'worktree' }]);
	});

	// ---- Session data adapter -------

	test('session adapter has correct workspace from working directory', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('ws-sess', { summary: 'WS Test', workingDirectory: URI.parse('vscode-agent-host://localhost__4321/home/user/myrepo?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0') }));

		const provider = createProvider(disposables, connection, { isWebPlatform: true });
		provider.getSessions();
		await timeout(0);

		const sessions = provider.getSessions();
		const wsSession = sessions.find((s) => s.title.get() === 'WS Test');
		assert.ok(wsSession, 'Session with working directory should exist');

		const workspace = wsSession!.workspace.get();
		assert.ok(workspace, 'Workspace should be populated');
		assert.strictEqual(workspace!.label, 'myrepo');
		assert.strictEqual(workspace!.requiresWorkspaceTrust, true, 'remote session folders require workspace trust');
	}));

	test('session adapter without working directory has no workspace', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('no-ws-sess', { summary: 'No WS' }));

		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await timeout(0);

		const sessions = provider.getSessions();
		const session = sessions.find((s) => s.title.get() === 'No WS');
		assert.ok(session, 'Session should exist');
		assert.strictEqual(session!.workspace.get(), undefined);
	}));

	test('registers remote SDK session state homes from artifacts', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const metadata = createSession('ahp-session', {
			summary: 'Remote Session',
			_meta: withSessionArtifacts(undefined, [{
				id: 'artifact',
				type: SessionArtifactType.File,
				label: 'Plan',
				isArtifact: true,
				uri: 'file:///home/remote/.copilot/session-state/sdk-session/files/plan.md',
			}])
		});
		connection.addSession(metadata);
		const labelService = new MockLabelService();
		const provider = createProvider(disposables, connection, { labelService, defaultDirectory: '/workspace/project' });
		provider.getSessions();
		await timeout(0);

		const root = URI.file('/home/remote/.copilot/session-state/sdk-session');
		const resource = toAgentHostUri(URI.joinPath(root, 'files/plan.md'), agentHostAuthority('localhost:4321'));
		const providerLabel = provider.sessionTypes.find(type => type.id === CopilotCLISessionType.id)?.label;
		assert.deepStrictEqual({
			home: labelService.getUriHome(resource)?.path,
			label: labelService.getUriLabel(resource),
		}, {
			home: root.path,
			label: `${providerLabel}/Remote Session/files/plan.md`,
		});
	}));

	test('session adapter uses raw ID as fallback title', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('abcdef1234567890'));

		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await timeout(0);

		const sessions = provider.getSessions();
		const session = sessions[0];
		assert.ok(session);
		assert.strictEqual(session.title.get(), 'Session abcdef12');
	}));

	// ---- Refresh on turnComplete -------

	test('turnComplete action triggers session refresh for matching provider', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('turn-sess', { summary: 'Before', modifiedTime: 1000 }));

		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await timeout(0);

		// Update on connection side
		connection.addSession(createSession('turn-sess', { summary: 'After', modifiedTime: 5000 }));

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		connection.fireAction({
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
		const updatedSession = provider.getSessions().find((s) => s.title.get() === 'After');
		assert.ok(updatedSession, 'Session should have updated title');
	}));

	// ---- Running session config seeding (from SessionState.config) -------

	test('getSessionConfig seeds running config from session state subscription with full schema', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('seed-1', { summary: 'Seeded Session' }));
		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Seeded Session');
		assert.ok(session);

		assert.strictEqual(provider.getSessionConfig(session!.sessionId), undefined);

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
		connection.setSessionState('seed-1', 'copilotcli', fakeState);

		await waitForSessionConfig(provider, session!.sessionId, c => c?.values.autoApprove === 'default');

		// Full schema + values are retained; the JSONC settings editor relies
		// on this to preserve non-mutable values through replace dispatches.
		const seeded = provider.getSessionConfig(session!.sessionId);
		assert.deepStrictEqual({
			properties: Object.keys(seeded?.schema.properties ?? {}).sort(),
			values: seeded?.values,
		}, {
			properties: ['autoApprove', 'isolation'],
			values: { autoApprove: 'default', isolation: 'worktree' },
		});
	}));

	test('removing a session disposes its session-state subscription', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('seed-2', { summary: 'Sub Session' }));
		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Sub Session');
		assert.ok(session);

		provider.getSessionConfig(session!.sessionId);
		const sessionUriStr = AgentSession.uri('copilotcli', 'seed-2').toString();
		assert.strictEqual(connection.sessionSubscribeCounts.get(sessionUriStr), 1);
		assert.strictEqual(connection.sessionUnsubscribeCounts.get(sessionUriStr) ?? 0, 0);

		fireSessionRemoved(connection, 'seed-2');

		assert.strictEqual(connection.sessionUnsubscribeCounts.get(sessionUriStr), 1);
	}));

	test('replacing the connection disposes all session-state subscriptions', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('seed-3', { summary: 'Reconnect Session' }));
		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await timeout(0);
		const session = provider.getSessions().find(s => s.title.get() === 'Reconnect Session');
		assert.ok(session);

		provider.getSessionConfig(session!.sessionId);
		const sessionUriStr = AgentSession.uri('copilotcli', 'seed-3').toString();
		assert.strictEqual(connection.sessionSubscribeCounts.get(sessionUriStr), 1);
		assert.strictEqual(connection.sessionUnsubscribeCounts.get(sessionUriStr) ?? 0, 0);

		const newConnection = new MockAgentConnection();
		disposables.add(toDisposable(() => newConnection.dispose()));
		provider.setConnection(newConnection);

		assert.strictEqual(connection.sessionUnsubscribeCounts.get(sessionUriStr), 1);
	}));

	// ---- Non-web label formatting (native desktop) -------
	//
	// In the browser test runner `isWeb` is always `true`, so by default
	// every test above exercises the web branch (which drops the
	// `[<hostname>]` suffix because the titlebar host filter renders it
	// redundantly). These tests pin the non-web (desktop) behaviour where
	// the host suffix / host description must still appear.

	test('non-web: resolveWorkspace includes [host] suffix in label', () => {
		const provider = createProvider(disposables, connection, { isWebPlatform: false });
		const uri = URI.parse('vscode-agent-host://localhost__4321/home/user/project');
		const ws = provider.resolveWorkspace(uri);

		assert.ok(ws);
		assert.strictEqual(ws.label, 'project [Test Host]');
	});

	test('non-web: session workspace from project metadata includes [host] suffix', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const projectUri = URI.parse('vscode-agent-host://localhost__4321/home/user/vscode?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0');
		connection.addSession(createSession('project-1', {
			summary: 'Project Session',
			project: { uri: projectUri, displayName: 'vscode' },
		}));

		const provider = createProvider(disposables, connection, { isWebPlatform: false });
		provider.getSessions();
		await timeout(0);

		assert.strictEqual(provider.getSessions()[0].workspace.get()?.label, 'vscode [Test Host]');
	}));

	test('non-web: session workspace from working directory includes [host] suffix', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('ws-sess', {
			summary: 'WS Test',
			workingDirectory: URI.parse('vscode-agent-host://localhost__4321/home/user/myrepo?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0'),
		}));

		const provider = createProvider(disposables, connection, { isWebPlatform: false });
		provider.getSessions();
		await timeout(0);

		const wsSession = provider.getSessions().find(s => s.title.get() === 'WS Test');
		assert.strictEqual(wsSession?.workspace.get()?.label, 'myrepo [Test Host]');
	}));

	test('non-web: createNewSession workspace label includes [host] suffix', () => {
		const provider = createProvider(disposables, connection, { isWebPlatform: false });
		const session = provider.createNewSession(URI.parse('vscode-agent-host://localhost__4321/home/user/project'), provider.sessionTypes[0].id);

		assert.strictEqual(session.workspace.get()?.label, 'project [Test Host]');
	});

	test('non-web: idle session description is undefined', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('desc-sess', { summary: 'Desc Test' }));

		const provider = createProvider(disposables, connection, { isWebPlatform: false });
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions().find(s => s.title.get() === 'Desc Test');
		assert.strictEqual(session?.description.get(), undefined);
	}));

	test('web: session description is undefined (host filter dropdown replaces it)', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('desc-sess-web', { summary: 'Desc Web' }));

		const provider = createProvider(disposables, connection, { isWebPlatform: true });
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions().find(s => s.title.get() === 'Desc Web');
		assert.strictEqual(session?.description.get(), undefined);
	}));

	test('a session first seen while its repository lookup failed is fixed by a later discovery pass', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Seeds run after the constructor has hydrated `_sessionCache`, so the cached entry is what
		// a later pass meets. Skipping cached entries would make retrying the lookup pointless.
		const storageService = disposables.add(new InMemoryStorageService());
		const seed = (provider: RemoteAgentHostSessionsProvider, project?: { uri: URI; displayName: string }) => provider.seedSessions([{
			session: AgentSession.uri('copilotcli', 'seeded-1'),
			startTime: 0,
			modifiedTime: 0,
			summary: 'Seeded Session',
			...(project ? { project } : {}),
		}]);

		// Pass 1: the lookup failed, so the session is seeded and persisted with no project.
		const first = createProvider(disposables, new MockAgentConnection(), { storageService, noConnection: true, isWebPlatform: false, omitHostFromWorkspaceLabel: true });
		seed(first);
		await storageService.flush();
		const afterFailedLookup = first.getSessions()[0].workspace.get()?.label;

		// Pass 2: the cached project-less entry is hydrated first, then the lookup succeeds.
		const second = createProvider(disposables, new MockAgentConnection(), { storageService, noConnection: true, isWebPlatform: false, omitHostFromWorkspaceLabel: true });
		const restoredBeforeSeed = second.getSessions()[0].workspace.get()?.label;
		seed(second, { uri: URI.parse('https://github.com/osortega/simple-server'), displayName: 'osortega/simple-server' });
		const afterBackfill = second.getSessions()[0].workspace.get()?.label;

		// The recovered project must reach the snapshot, or every reload re-strands the session.
		await storageService.flush();
		const third = createProvider(disposables, new MockAgentConnection(), { storageService, noConnection: true, isWebPlatform: false, omitHostFromWorkspaceLabel: true });

		assert.deepStrictEqual({
			afterFailedLookup,
			restoredBeforeSeed,
			afterBackfill,
			survivesReload: third.getSessions()[0].workspace.get()?.label,
		}, {
			afterFailedLookup: undefined,
			restoredBeforeSeed: undefined,
			afterBackfill: 'osortega/simple-server',
			survivesReload: 'osortega/simple-server',
		});
	}));

	test('re-subscribes to session state after a subscribe that failed because the host had no such session', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// A failed pre-creation subscribe must remain retryable so later session state, including changesets, can arrive.
		connection.addSession(createSession('late-1', { summary: 'Created after we asked' }));
		const provider = createProvider(disposables, connection, { isWebPlatform: false, omitHostFromWorkspaceLabel: true });
		const backendUri = AgentSession.uri('copilotcli', 'late-1').toString();
		provider.getSessions();
		await timeout(0);
		connection.failNextSessionSubscribe.add(backendUri);

		const session = provider.getSessions()[0];
		provider.getSessionByResource(session.resource);
		await timeout(0);
		const afterFailedSubscribe = connection.sessionSubscribeCounts.get(backendUri);

		// The host has created the session by the time anything asks again.
		connection.setSessionState('late-1', 'copilotcli', {
			provider: 'copilotcli', title: 'Created after we asked', status: ProtocolSessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			changesets: [{ label: 'Branch Changes', uriTemplate: 'changeset/branch', changeKind: 'branch' }],
		} as unknown as SessionState);
		provider.getSessionByResource(session.resource);
		await timeout(0);

		assert.deepStrictEqual({
			afterFailedSubscribe,
			afterRetry: connection.sessionSubscribeCounts.get(backendUri),
			changesets: provider.getSessions()[0].changesets.get()?.map(c => c.id),
		}, {
			afterFailedSubscribe: 1,
			afterRetry: 2,
			changesets: ['branch'],
		});
	}));

	test('a configured defaultChangesetKind reaches the session adapter', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const gitBackedCatalogue = [
			{ label: 'Session Changes', uriTemplate: 'changeset/session', changeKind: 'session' },
			{ label: 'Branch Changes', uriTemplate: 'changeset/branch', changeKind: 'branch' },
		];
		const defaultChangesetIds = async (defaultChangesetKind?: IRemoteAgentHostSessionsProviderConfig['defaultChangesetKind']) => {
			const localConnection = disposables.add(new MockAgentConnection());
			localConnection.addSession(createSession('changeset-default-1', { summary: 'Changeset default' }));
			const provider = createProvider(disposables, localConnection, { defaultChangesetKind });
			provider.getSessions();
			await timeout(0);
			localConnection.setSessionState('changeset-default-1', 'copilotcli', {
				provider: 'copilotcli', title: 'Changeset default', status: ProtocolSessionStatus.Idle,
				lifecycle: SessionLifecycle.Ready,
				activeClients: [],
				chats: [],
				changesets: gitBackedCatalogue,
			} as unknown as SessionState);
			const session = provider.getSessions()[0];
			provider.getSessionByResource(session.resource);
			await timeout(0);
			return provider.getSessions()[0].changesets.get()
				?.map(c => `${c.id}${c.isDefault.get() ? '*' : ''}`);
		};

		assert.deepStrictEqual({
			configured: await defaultChangesetIds(ChangesetKind.Session),
			unconfigured: await defaultChangesetIds(),
		}, {
			configured: ['session*', 'branch'],
			unconfigured: ['session', 'branch*'],
		});
	}));

	test('seedSessions never overwrites a project the host already reported', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('authoritative-1', {
			summary: 'Authoritative',
			project: { uri: URI.parse('vscode-agent-host://localhost__4321/home/user/real?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0'), displayName: 'real-repo' },
		}));
		const provider = createProvider(disposables, connection, { isWebPlatform: false, omitHostFromWorkspaceLabel: true });
		provider.getSessions();
		await timeout(0);

		provider.seedSessions([{
			session: AgentSession.uri('copilotcli', 'authoritative-1'),
			startTime: 0,
			modifiedTime: 0,
			summary: 'Stale Seed',
			project: { uri: URI.parse('https://github.com/someone/stale'), displayName: 'someone/stale' },
		}]);

		assert.deepStrictEqual({
			label: provider.getSessions()[0].workspace.get()?.label,
			title: provider.getSessions()[0].title.get(),
		}, {
			label: 'real-repo',
			title: 'Authoritative',
		});
	}));

	test('non-web: omitHostFromWorkspaceLabel drops the [host] suffix so sessions group by repository', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const projectUri = URI.parse('vscode-agent-host://localhost__4321/home/user/vscode?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0');
		connection.addSession(createSession('sandbox-1', {
			summary: 'Sandbox Session',
			project: { uri: projectUri, displayName: 'osortega/simple-server' },
		}));

		const provider = createProvider(disposables, connection, { isWebPlatform: false, omitHostFromWorkspaceLabel: true });
		provider.getSessions();
		await timeout(0);

		assert.deepStrictEqual({
			session: provider.getSessions()[0].workspace.get()?.label,
			browsed: provider.resolveWorkspace(URI.parse('vscode-agent-host://localhost__4321/home/user/project'))?.label,
		}, {
			session: 'osortega/simple-server',
			browsed: 'project',
		});
	}));

	test('workspaceTypeIcon reaches the built workspace, and is absent by default', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('sandbox-icon', {
			summary: 'Sandbox Session',
			project: { uri: URI.parse('https://github.com/osortega/simple-server'), displayName: 'osortega/simple-server' },
		}));

		const withIcon = createProvider(disposables, connection, { isWebPlatform: false, workspaceTypeIcon: Codicon.package });
		const withoutIcon = createProvider(disposables, new MockAgentConnection(), { isWebPlatform: false, noConnection: true });
		withIcon.getSessions();
		await timeout(0);

		assert.deepStrictEqual({
			declared: withIcon.getSessions()[0].workspace.get()?.typeIcon?.id,
			// Other hosts leave it unset so the icon stays inferred from the workspace shape.
			browsed: withoutIcon.resolveWorkspace(URI.parse('vscode-agent-host://localhost__4321/home/user/project'))?.typeIcon,
		}, {
			declared: Codicon.package.id,
			browsed: undefined,
		});
	}));

});

suite('CloudSandboxSessionsProvider provisional sessions', () => {

	const disposables = new DisposableStore();
	let connection: MockAgentConnection;

	setup(() => {
		connection = new MockAgentConnection();
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	/** The sandbox provider, built on the same mocks as the remote provider it extends. */
	function createSandboxProvider(store: DisposableStore, conn: MockAgentConnection, overrides?: { noConnection?: boolean; isWebPlatform?: boolean; omitHostFromWorkspaceLabel?: boolean }): CloudSandboxSessionsProvider {
		return createProvider(store, conn, { ...overrides, ctor: CloudSandboxSessionsProvider }) as CloudSandboxSessionsProvider;
	}

	/** Force a session refresh the way the host does: a turn-complete action on a known session. */
	async function refreshViaTurnComplete(connection: MockAgentConnection, rawId: string): Promise<void> {
		connection.fireAction({
			channel: buildDefaultChatUri(AgentSession.uri('copilotcli', rawId).toString()),
			action: { type: ActionType.ChatTurnComplete, turnId: 'turn-refresh', duration: 1 },
			serverSeq: 1,
			origin: undefined,
		} as ActionEnvelope);
		await timeout(0);
	}

	test('a provisional session survives a host listing that does not know it yet', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// The first listing after connecting can legitimately omit a just-minted session.
		connection.addSession(createSession('other-1', { summary: 'Someone else' }));
		const provider = createSandboxProvider(disposables, connection, { isWebPlatform: false, omitHostFromWorkspaceLabel: true });
		provider.seedProvisionalSession({
			session: AgentSession.uri('copilotcli', 'provisional-1'),
			startTime: 0,
			modifiedTime: 0,
			summary: 'Just provisioned',
		});
		provider.publishWithheldSession('provisional-1');

		await timeout(0);
		const survivedUnknown = provider.getSessions().map((s: ISession) => AgentSession.id(s.resource)).sort();

		// Once the host knows it, it reconciles like any other session.
		connection.addSession(createSession('provisional-1', { summary: 'Just provisioned' }));
		await refreshViaTurnComplete(connection, 'other-1');
		const afterHostKnows = provider.getSessions().map((s: ISession) => AgentSession.id(s.resource)).sort();

		assert.deepStrictEqual({ survivedUnknown, afterHostKnows }, {
			survivedUnknown: ['other-1', 'provisional-1'],
			afterHostKnows: ['other-1', 'provisional-1'],
		});
	}));

	test('a provisional session the host never lists is evicted once its grace period ends', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('other-1', { summary: 'Someone else' }));
		const provider = createSandboxProvider(disposables, connection, { isWebPlatform: false, omitHostFromWorkspaceLabel: true });
		provider.seedProvisionalSession({
			session: AgentSession.uri('copilotcli', 'never-listed'),
			startTime: 0,
			modifiedTime: 0,
			summary: 'Never materialized',
		});
		provider.publishWithheldSession('never-listed');
		await timeout(0);

		// The first listing that omits it starts the clock; it is still protected here.
		await refreshViaTurnComplete(connection, 'other-1');
		const afterFirstOmission = provider.getSessions().map((s: ISession) => AgentSession.id(s.resource)).sort();

		// The protection is bounded so a session the host will never list cannot become a
		// permanent row that only a reload clears.
		await timeout(CloudSandboxSessionsProvider.PROVISIONAL_GRACE_MS + 1);
		await refreshViaTurnComplete(connection, 'other-1');

		assert.deepStrictEqual({
			afterFirstOmission,
			afterGrace: provider.getSessions().map((s: ISession) => AgentSession.id(s.resource)),
		}, {
			afterFirstOmission: ['never-listed', 'other-1'],
			afterGrace: ['other-1'],
		});
	}));

	test('a slow connection does not consume the grace period before the host answers', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Waking a sandbox can take minutes. If the clock ran from the seed, the first listing
		// would meet an already-expired deadline and evict immediately — the disappearance this
		// guard exists to prevent.
		connection.addSession(createSession('other-1', { summary: 'Someone else' }));
		// Seeded before connecting, exactly as provisioning does it: no listing can arrive until
		// the sandbox is awake.
		const provider = createSandboxProvider(disposables, connection, { noConnection: true, isWebPlatform: false, omitHostFromWorkspaceLabel: true });
		provider.seedProvisionalSession({
			session: AgentSession.uri('copilotcli', 'slow-wake'),
			startTime: 0,
			modifiedTime: 0,
			summary: 'Slow to wake',
		});
		provider.publishWithheldSession('slow-wake');

		await timeout(CloudSandboxSessionsProvider.PROVISIONAL_GRACE_MS * 2);
		provider.setConnection(connection);
		await timeout(0);

		assert.deepStrictEqual(provider.getSessions().map((s: ISession) => AgentSession.id(s.resource)).sort(), ['other-1', 'slow-wake']);
	}));

	test('a withheld seed is cached and openable but stays out of the sessions list until published', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createSandboxProvider(disposables, new MockAgentConnection(), { noConnection: true, isWebPlatform: false, omitHostFromWorkspaceLabel: true });
		const announced: string[][] = [];
		disposables.add(provider.onDidChangeSessions(e => announced.push(e.added.map(s => s.sessionId))));

		provider.seedProvisionalSession({
			session: AgentSession.uri('copilotcli', 'withheld-1'),
			startTime: 0,
			modifiedTime: 0,
			summary: 'Withheld Session',
		});

		const whileWithheld = {
			listed: provider.getSessions().map((s: ISession) => AgentSession.id(s.resource)),
			// Reachable by id so the caller that seeded it can still act on it, and openable by
			// resource so a swap into it does not land on a session the UI cannot resolve.
			cached: AgentSession.id(provider.getCachedSession('withheld-1')!.resource),
			announced: announced.length,
		};

		provider.publishWithheldSession('withheld-1');

		assert.deepStrictEqual({
			whileWithheld,
			listedAfterPublish: provider.getSessions().map((s: ISession) => AgentSession.id(s.resource)),
			announcedAfterPublish: announced,
		}, {
			whileWithheld: { listed: [], cached: 'withheld-1', announced: 0 },
			listedAfterPublish: ['withheld-1'],
			announcedAfterPublish: [['agenthost-localhost__4321:remote-localhost__4321-copilotcli:/withheld-1']],
		});
	}));

	test('publishing with announce:false lists the session without firing its own event', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const provider = createSandboxProvider(disposables, new MockAgentConnection(), { noConnection: true, isWebPlatform: false, omitHostFromWorkspaceLabel: true });
		provider.seedProvisionalSession({
			session: AgentSession.uri('copilotcli', 'withheld-2'),
			startTime: 0,
			modifiedTime: 0,
			summary: 'Withheld Session',
		});

		const announced: string[][] = [];
		disposables.add(provider.onDidChangeSessions(e => announced.push(e.added.map(s => s.sessionId))));
		// The caller fires its own replace event covering this session, so a second event here
		// would list the new row a frame before the placeholder row disappears.
		provider.publishWithheldSession('withheld-2', { announce: false });

		assert.deepStrictEqual({
			listed: provider.getSessions().map((s: ISession) => AgentSession.id(s.resource)),
			announced,
		}, {
			listed: ['withheld-2'],
			announced: [],
		});
	}));

});
