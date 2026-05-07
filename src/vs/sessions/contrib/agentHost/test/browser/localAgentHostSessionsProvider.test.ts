/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable, type IReference } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue, type IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostActiveClientRegistry } from '../../../../../platform/agentHost/common/agentHostActiveClientRegistry.js';
import { AgentSession, IAgentHostService, type IAgentCreateSessionConfig, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import type { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { NotificationType } from '../../../../../platform/agentHost/common/state/protocol/notifications.js';
import { SessionLifecycle, type AgentInfo, type ModelSelection, type RootState, type SessionConfigState, type SessionState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { SessionStatus as ProtocolSessionStatus, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ActionType, type ActionEnvelope, type IRootConfigChangedAction, type SessionAction, type TerminalAction, type INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService, type ChatSendResult, type IChatSendRequestOptions } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionChangeEvent } from '../../../../services/sessions/common/sessionsProvider.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { LocalAgentHostSessionsProvider } from '../../browser/localAgentHostSessionsProvider.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IGitHubService } from '../../../github/browser/githubService.js';

// ---- Mock IAgentHostService -------------------------------------------------

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
	public dispatchedActions: { action: SessionAction | TerminalAction | IRootConfigChangedAction; clientId: string; clientSeq: number }[] = [];
	/**
	 * Test hook: schema the fake host will publish via
	 * `SessionConfigChanged` when {@link publishSessionConfig} is called.
	 * The default mirrors the legacy mock provider's "isolation" schema so
	 * existing tests can rely on it without explicit setup.
	 */
	public defaultSessionConfig: SessionConfigState = {
		schema: { type: 'object', properties: {} },
		values: { isolation: 'worktree' },
	};
	/** Recorded `config` payloads passed through `createSession`. */
	public createSessionConfigs: (Record<string, unknown> | undefined)[] = [];

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

	override async listSessions(): Promise<IAgentSessionMetadata[]> {
		return [...this._sessions.values()];
	}

	override async disposeSession(session: URI): Promise<void> {
		this.disposedSessions.push(session);
		const rawId = AgentSession.id(session);
		this._sessions.delete(rawId);
	}

	public createdSessionUris: URI[] = [];
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
	/**
	 * Records the *full* createSession payload (not just `config`) so tests
	 * can assert on `activeClient`, `model`, etc. Used to detect regressions
	 * that put expensive fields back onto the createSession critical path.
	 */
	public createSessionFullPayloads: (IAgentCreateSessionConfig | undefined)[] = [];
	override async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const uri = config?.session ?? URI.parse('copilotcli:///auto-' + this._nextSeq);
		this.wireOps.push(`createSession:${uri.toString()}`);
		this.createdSessionUris.push(uri);
		this.createSessionConfigs.push(config?.config);
		this.createSessionFullPayloads.push(config);
		const hook = this.onCreateSession;
		this.onCreateSession = undefined;
		if (hook) {
			await hook(uri);
		}
		return uri;
	}

	dispatchAction(action: SessionAction | TerminalAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		this.dispatchedActions.push({ action, clientId, clientSeq });
	}

	override dispatch(action: SessionAction | TerminalAction | IRootConfigChangedAction): void {
		this.dispatchedActions.push({ action, clientId: this.clientId, clientSeq: this._nextSeq++ });
	}

	// Test helpers
	addSession(meta: IAgentSessionMetadata): void {
		this._sessions.set(AgentSession.id(meta.session), meta);
	}

	// ---- Session-state subscriptions ---------------------------------------

	private readonly _sessionStateEmitters = new Map<string, Emitter<SessionState>>();
	private readonly _sessionStateValues = new Map<string, SessionState>();
	public sessionSubscribeCounts = new Map<string, number>();
	public sessionUnsubscribeCounts = new Map<string, number>();

	override getSubscription<T>(_kind: StateComponents, resource: URI): IReference<IAgentSubscription<T>> {
		const key = resource.toString();
		this.wireOps.push(`subscribe:${key}`);
		this.sessionSubscribeCounts.set(key, (this.sessionSubscribeCounts.get(key) ?? 0) + 1);
		let emitter = this._sessionStateEmitters.get(key);
		if (!emitter) {
			emitter = new Emitter<SessionState>();
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

	/**
	 * Test helper: emit a `SessionConfigChanged` action carrying a schema
	 * (and optionally values) — the equivalent of the server's schema-push
	 * side-effect. Used by tests that previously asserted "picker re-resolves
	 * on change" to drive schema arrival.
	 */
	publishSessionConfig(rawId: string, provider: string, config: SessionConfigState): void {
		const sessionUri = AgentSession.uri(provider, rawId).toString();
		this.fireAction({
			action: {
				type: ActionType.SessionConfigChanged,
				session: sessionUri,
				schema: config.schema,
				config: config.values,
				replace: true,
			},
			origin: undefined,
			serverSeq: this._nextSeq++,
		});
	}

	setAgents(agents: AgentInfo[]): void {
		this._rootStateValue = { agents };
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

function createProvider(disposables: DisposableStore, agentHostService: MockAgentHostService, contributions = [
	{ type: 'agent-host-copilotcli', name: 'copilot', displayName: 'Copilot', description: 'test', icon: undefined },
], options?: { sendRequest?: (resource: URI, message: string, options?: IChatSendRequestOptions) => Promise<ChatSendResult>; openSession?: boolean; configurationService?: IConfigurationService; activeClientResolver?: () => { tools: never[]; customizations?: never[] } | undefined }): LocalAgentHostSessionsProvider {
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
	instantiationService.stub(IGitHubService, new class extends mock<IGitHubService>() {
		override findPullRequestNumberByHeadBranch = async () => undefined;
	}());
	instantiationService.stub(IAgentHostActiveClientRegistry, {
		registerResolver: () => toDisposable(() => { }),
		resolve: options?.activeClientResolver ?? (() => undefined),
	});

	return disposables.add(instantiationService.createInstance(LocalAgentHostSessionsProvider));
}

async function waitForSessionConfig(provider: LocalAgentHostSessionsProvider, sessionId: string, predicate: (config: SessionConfigState | undefined) => boolean): Promise<void> {
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
		type: NotificationType.SessionRemoved,
		session: sessionUri.toString(),
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

	// ---- Workspace resolution -------

	test('resolveWorkspace builds workspace from URI with [Local] tag', () => {
		const provider = createProvider(disposables, agentHost);
		const uri = URI.parse('file:///home/user/project');
		const ws = provider.resolveWorkspace(uri);

		assert.ok(ws, 'resolveWorkspace should resolve file:// URIs');
		assert.strictEqual(ws.label, 'project [Local]');
		assert.strictEqual(ws.repositories.length, 1);
		assert.strictEqual(ws.repositories[0].uri.toString(), uri.toString());
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
			repository: workspace?.repositories[0]?.uri.toString(),
			workingDirectory: workspace?.repositories[0]?.workingDirectory?.toString(),
		}, {
			label: 'vscode [Local]',
			repository: projectUri.toString(),
			workingDirectory: workingDirectory.toString(),
		});
	}));

	test('listed session with only workingDirectory (no project) shows folder name with [Local] tag', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const workingDirectory = URI.file('/home/user/standalone-folder');
		agentHost.addSession(createSession('wd-only-1', {
			summary: 'WD-only Session',
			workingDirectory,
		}));

		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const workspace = provider.getSessions()[0].workspace.get();
		assert.strictEqual(workspace?.label, 'standalone-folder [Local]');
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
			session: AgentSession.uri('copilotcli', 'set-model').toString(),
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
			session: AgentSession.uri('copilotcli', 'set-model-config').toString(),
			model: { id: 'configured-model', config: { thinkingLevel: 'high' } },
		});
	});

	// ---- Session lifecycle -------

	test('createNewSession returns session with correct fields', () => {
		const provider = createProvider(disposables, agentHost);
		const workspaceUri = URI.parse('file:///home/user/my-project');
		const session = provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);

		assert.strictEqual(session.providerId, provider.id);
		assert.strictEqual(session.status.get(), SessionStatus.Untitled);
		assert.ok(session.workspace.get());
		assert.strictEqual(session.workspace.get()?.label, 'my-project [Local]');
		assert.strictEqual(session.sessionType, provider.sessionTypes[0].id);
		// `createNewSession` writes an optimistic placeholder into the
		// running-config cache so that the picker's first click before the
		// server-pushed schema lands is not silently dropped (CODE_REVIEW.md
		// H3). The placeholder schema is empty (`properties: {}`) and the
		// values default to `{}` (or the seeded `_initialNewSessionConfig`).
		assert.deepStrictEqual(provider.getSessionConfig(session.sessionId), {
			schema: { type: 'object', properties: {} },
			values: {},
		});
	});

	test('createNewSession seeds autoApprove from chat.permissions.default and forwards it through createSession', async () => {
		const config = new TestConfigurationService();
		await config.setUserConfiguration('chat.permissions.default', 'autoApprove');
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: config });
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		// Wait for eager createSession to resolve and capture its config payload.
		await timeout(0);

		assert.deepStrictEqual({
			forwardedToAgentHost: agentHost.createSessionConfigs.at(-1)?.autoApprove,
			sessionId: session.sessionId,
		}, {
			forwardedToAgentHost: 'autoApprove',
			sessionId: session.sessionId,
		});
	});

	test('createNewSession does not seed autoApprove when chat.permissions.default is the default value', async () => {
		const provider = createProvider(disposables, agentHost);
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.strictEqual(agentHost.createSessionConfigs.at(-1)?.autoApprove, undefined);
	});

	test('createNewSession clamps seeded autoApprove to default when policy disables global auto-approve', async () => {
		const config = new class extends TestConfigurationService {
			override inspect<T>(key: string) {
				const base = super.inspect<T>(key);
				if (key === 'chat.tools.global.autoApprove') {
					return { ...base, policyValue: false as unknown as T };
				}
				return base;
			}
		}();
		await config.setUserConfiguration('chat.permissions.default', 'autopilot');
		const provider = createProvider(disposables, agentHost, undefined, { configurationService: config });
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.strictEqual(agentHost.createSessionConfigs.at(-1)?.autoApprove, 'default');
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
			resolvedWorkspaceLabel: 'my-project [Local]',
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

		// Switch workspace: should dispose the first backend session and
		// release its subscription before creating the second.
		const second = provider.createNewSession(URI.parse('file:///home/user/b'), sessionTypeId);
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
		// the wire. Once that create eventually resolves, we must not open
		// a subscription for it — it has already been disposed.
		const provider = createProvider(disposables, agentHost);
		const sessionTypeId = provider.sessionTypes[0].id;

		const firstCreateGate = new DeferredPromise<void>();
		agentHost.onCreateSession = () => firstCreateGate.p;

		const first = provider.createNewSession(URI.parse('file:///home/user/a'), sessionTypeId);
		// Yield once so the eager createSession promise starts and parks at
		// the gate; nothing else has happened yet.
		await timeout(0);

		// Switch workspace while the first createSession is still parked.
		// Disposing the first NewSession should clear its backend URI
		// before the second eager-create runs.
		const second = provider.createNewSession(URI.parse('file:///home/user/b'), sessionTypeId);
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
		const actionSession = (dispatched.action as { session: string }).session;
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
			action: {
				type: ActionType.SessionTitleChanged,
				session: AgentSession.uri('copilotcli', 'echo-sess').toString(),
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
			action: {
				type: ActionType.SessionModelChanged,
				session: AgentSession.uri('copilotcli', 'model-change').toString(),
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
			action: {
				type: 'session/turnComplete',
				session: AgentSession.uri('copilotcli', 'turn-sess').toString(),
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
		assert.strictEqual(workspace!.label, 'myrepo [Local]');
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
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		// Drive the schema through the eager-subscription path (`setSessionState`)
		// rather than the action stream — for a brand-new session there is no
		// `_sessionCache` entry yet, so the action would be buffered (H4) and
		// never drained until `notify/sessionAdded` fires. The loading state
		// is what we care about here, so we use the snapshot path that
		// actually mirrors the production seed flow for new sessions.
		const rawId = session.resource.path.substring(1);
		agentHost.setSessionState(rawId, 'copilotcli', {
			summary: { resource: AgentSession.uri('copilotcli', rawId).toString(), provider: 'copilotcli', title: '', status: ProtocolSessionStatus.Idle, createdAt: Date.now(), modifiedAt: Date.now() },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
			activeTurn: undefined,
			steeringMessage: undefined,
			queuedMessages: [],
			inputRequests: [],
			config: {
				schema: { type: 'object', required: ['branch'], properties: { branch: { type: 'string', title: 'Branch', enum: ['main'] } } },
				values: {},
			},
		} as unknown as SessionState);
		await waitForSessionConfig(provider, session.sessionId, config => config?.schema.required?.includes('branch') === true);

		assert.strictEqual(session.loading.get(), true);
	});

	test('eager subscription seeds the picker for provisional sessions (no notify/sessionAdded ever fires)', async () => {
		// Regression: provisional sessions (e.g. Copilot CLI) defer
		// `notify/sessionAdded` until materialization on first sendMessage.
		// Without an `onDidChange` listener on the eager subscription, the
		// schema would only land via `_handleSessionAdded` — which never
		// fires for provisional sessions — and the Mode picker would stay
		// hidden + the spinner stuck on. This test deliberately does NOT
		// call `addSession` or `fireNotification(SessionAdded)`; the schema
		// must arrive purely through the eager subscription's onDidChange.
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		// Pre-condition: eagerCreate has called createSession on the agent
		// host. If the eagerCreate→getSubscription wiring regresses (no
		// onDidChange listener), then setSessionState below will not flow
		// to the workbench cache.
		assert.strictEqual(agentHost.createdSessionUris.length, 1, 'eagerCreate must have called createSession');

		const rawId = session.resource.path.substring(1);
		agentHost.setSessionState(rawId, 'copilotcli', {
			summary: { resource: AgentSession.uri('copilotcli', rawId).toString(), provider: 'copilotcli', title: '', status: ProtocolSessionStatus.Idle, createdAt: Date.now(), modifiedAt: Date.now() },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
			activeTurn: undefined,
			steeringMessage: undefined,
			queuedMessages: [],
			inputRequests: [],
			config: {
				schema: { type: 'object', properties: { mode: { type: 'string', title: 'Mode', enum: ['agent', 'code'] } } },
				values: { mode: 'agent' },
			},
		} as unknown as SessionState);
		await waitForSessionConfig(provider, session.sessionId, c => c?.values.mode === 'agent');

		// Mode picker reads from this; loading should clear (no required keys).
		assert.deepStrictEqual({
			modeFromCache: provider.getSessionConfig(session.sessionId)?.values.mode,
			loading: session.loading.get(),
			// Verify our setup: the session is NOT in any cache (no SessionAdded fired).
			isInListedSessions: provider.getSessions().some(s => s.sessionId === session.sessionId),
		}, {
			modeFromCache: 'agent',
			loading: false,
			isInListedSessions: false,
		});
	});

	test('eagerCreate awaits authenticationPending before sending createSession', async () => {
		// Regression: on first launch, the workbench could race ahead of
		// the GitHub auth token. The Copilot agent then rejects createSession
		// with AHP_AUTH_REQUIRED and the picker stays empty until the user
		// switches folders. Fix: eagerCreate awaits `authenticationPending`
		// to clear before sending createSession.
		agentHost.setAuthenticationPending(true);
		const provider = createProvider(disposables, agentHost);
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);

		// Give the IIFE a couple microtask ticks; createSession must NOT
		// fire while auth is pending.
		await timeout(0);
		await timeout(0);
		assert.strictEqual(agentHost.createdSessionUris.length, 0, 'createSession must not fire while authenticationPending=true');

		// Once auth resolves, createSession fires.
		agentHost.setAuthenticationPending(false);
		await timeout(0);
		await timeout(0);
		assert.strictEqual(agentHost.createdSessionUris.length, 1, 'createSession must fire after authenticationPending flips to false');
	});

	test('eagerCreate forwards activeClient on createSession when the registry has a resolver', async () => {
		// Per `PLAN_CUSTOMIZATIONS.md`: the eager-create flow MUST include
		// the active-client bundle so the host's `_plugins.sync` runs at
		// provisional creation time (pre-warming the customization sync,
		// matching the legacy `_createAndSubscribe` flow).
		const tools = [{ name: 't1' } as never];
		const customizations = [{ uri: 'plugin:/x' } as never];
		const provider = createProvider(disposables, agentHost, undefined, {
			activeClientResolver: () => ({ tools, customizations }),
		});
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.strictEqual(agentHost.createSessionFullPayloads.length, 1);
		const payload = agentHost.createSessionFullPayloads[0];
		assert.ok(payload, 'createSession payload should not be undefined');
		assert.deepStrictEqual(payload!.activeClient, {
			clientId: agentHost.clientId,
			tools,
			customizations,
		}, 'eagerCreate must include activeClient bundled with the connection clientId');
	});

	test('eagerCreate falls back to no activeClient when no resolver is registered (race fallback)', async () => {
		// Race scenario from `PLAN_CUSTOMIZATIONS.md`: if the user picks the
		// workspace before the workbench handler has registered its resolver,
		// `activeClient` stays undefined and the legacy first-message
		// `_dispatchActiveClient` catches up. This test pins that fallback.
		const provider = createProvider(disposables, agentHost); // default resolver returns undefined
		provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		assert.strictEqual(agentHost.createSessionFullPayloads.length, 1);
		assert.strictEqual(agentHost.createSessionFullPayloads[0]?.activeClient, undefined);
	});

	test('setSessionConfigValue dispatches non-sessionMutable property changes for new sessions', async () => {
		// Regression: the `sessionMutable` gate in setSessionConfigValue was
		// silently swallowing dispatches for properties that are mutable
		// pre-creation but not post-creation (e.g. `isolation`). Without the
		// new-session bypass, the user's selection never reached the agent
		// host and materialization used the default value.
		//
		// New sessions never receive `notify/sessionAdded` until materialization,
		// so drive the schema through the eager-subscription path (`setSessionState`)
		// instead of the action stream — the action stream's
		// `_handleConfigChanged` correctly buffers actions for unknown sessions.
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		const rawId = session.resource.path.substring(1);
		agentHost.setSessionState(rawId, 'copilotcli', {
			summary: { resource: AgentSession.uri('copilotcli', rawId).toString(), provider: 'copilotcli', title: '', status: ProtocolSessionStatus.Idle, createdAt: Date.now(), modifiedAt: Date.now() },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
			activeTurn: undefined,
			steeringMessage: undefined,
			queuedMessages: [],
			inputRequests: [],
			config: {
				schema: { type: 'object', properties: { isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] } } },
				values: { isolation: 'worktree' },
			},
		} as unknown as SessionState);
		await waitForSessionConfig(provider, session.sessionId, c => c?.values.isolation === 'worktree');

		const dispatchedBefore = agentHost.dispatchedActions.length;
		await provider.setSessionConfigValue(session.sessionId, 'isolation', 'folder');

		const newDispatches = agentHost.dispatchedActions.slice(dispatchedBefore);
		const isolationChange = newDispatches.find(d =>
			d.action.type === ActionType.SessionConfigChanged
			&& (d.action as { config?: Record<string, unknown> }).config?.isolation === 'folder'
		);

		assert.ok(isolationChange, 'setSessionConfigValue must dispatch SessionConfigChanged for non-sessionMutable property on new session');
		assert.strictEqual(provider.getSessionConfig(session.sessionId)?.values.isolation, 'folder', 'local cache must reflect the optimistic update');
	});

	test('setSessionConfigValue blocks non-sessionMutable property changes for running sessions', async () => {
		// Counterpart to the test above: post-materialization, the
		// `sessionMutable` gate must STILL apply. A running session's
		// `isolation` is locked (worktree is created, SDK session bound) —
		// a stale dispatch could lie to the user about being "applied".
		agentHost.addSession(createSession('running-iso', { summary: 'Running' }));
		const provider = createProvider(disposables, agentHost);
		provider.getSessions();
		await timeout(0);

		const cached = provider.getSessions().find(s => s.title.get() === 'Running');
		assert.ok(cached);

		// Seed the running config with isolation that is NOT sessionMutable.
		agentHost.publishSessionConfig('running-iso', 'copilotcli', {
			schema: {
				type: 'object',
				properties: {
					isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] },
				},
			},
			values: { isolation: 'worktree' },
		});
		await waitForSessionConfig(provider, cached!.sessionId, c => c?.values.isolation === 'worktree');

		const dispatchedBefore = agentHost.dispatchedActions.length;
		await provider.setSessionConfigValue(cached!.sessionId, 'isolation', 'folder');

		assert.strictEqual(agentHost.dispatchedActions.length, dispatchedBefore, 'setSessionConfigValue must NOT dispatch for non-sessionMutable property on running session');
		assert.strictEqual(provider.getSessionConfig(cached!.sessionId)?.values.isolation, 'worktree', 'local cache must remain unchanged');
	});

	test('setSessionConfigValue dispatches before the server-pushed schema lands on a brand-new session', async () => {
		// Regression for CODE_REVIEW.md H3: between `createNewSession` returning
		// and the eager subscription seeding `_runningSessionConfigs` from the
		// server-pushed snapshot, the picker's first click was silently dropped
		// because (1) `_runningSessionConfigs.get(sessionId)` returned undefined,
		// or (2) once an empty stub was added, the schema lookup
		// `runningConfig.schema.properties[property]` returned undefined.
		//
		// Fix: createNewSession writes an optimistic placeholder and
		// setSessionConfigValue relaxes the schema-properties gate for new
		// sessions. This test exercises the *immediately-after-create* path:
		// no schema has been published, no snapshot has landed.
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		// Critically: do NOT await timeout(0) for the snapshot to land. Click
		// while the cache only holds the optimistic placeholder.

		const dispatchedBefore = agentHost.dispatchedActions.length;
		await provider.setSessionConfigValue(session.sessionId, 'mode', 'agent');

		const newDispatches = agentHost.dispatchedActions.slice(dispatchedBefore);
		const modeChange = newDispatches.find(d =>
			d.action.type === ActionType.SessionConfigChanged
			&& (d.action as { config?: Record<string, unknown> }).config?.mode === 'agent'
		);

		assert.deepStrictEqual({
			dispatched: !!modeChange,
			cachedValue: provider.getSessionConfig(session.sessionId)?.values.mode,
		}, {
			dispatched: true,
			cachedValue: 'agent',
		});
	});

	test('setSessionConfigValue still rejects readOnly properties on new sessions once the schema lands', async () => {
		// Counterpart to the test above: the new-session relaxation only skips
		// the `properties[property]`/`sessionMutable` gates. A `readOnly` flag
		// must STILL block dispatch — that's a server-declared constraint
		// (e.g. an env-locked default) and bypassing it would mislead the user.
		// Drive the schema in via `setSessionState` (eager-subscription path)
		// rather than `publishSessionConfig` (action stream), since for a brand-
		// new session the action stream's `_handleConfigChanged` early-returns
		// on the missing `_sessionCache` entry
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		const rawId = session.resource.path.substring(1);
		agentHost.setSessionState(rawId, 'copilotcli', {
			summary: { resource: AgentSession.uri('copilotcli', rawId).toString(), provider: 'copilotcli', title: '', status: ProtocolSessionStatus.Idle, createdAt: Date.now(), modifiedAt: Date.now() },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
			activeTurn: undefined,
			steeringMessage: undefined,
			queuedMessages: [],
			inputRequests: [],
			config: {
				schema: { type: 'object', properties: { branch: { type: 'string', title: 'Branch', readOnly: true, enum: ['main'] } } },
				values: { branch: 'main' },
			},
		} as unknown as SessionState);
		await waitForSessionConfig(provider, session.sessionId, c => c?.values.branch === 'main');

		const dispatchedBefore = agentHost.dispatchedActions.length;
		await provider.setSessionConfigValue(session.sessionId, 'branch', 'feature/x');

		assert.strictEqual(agentHost.dispatchedActions.length, dispatchedBefore, 'readOnly must block dispatch even on new sessions');
		assert.strictEqual(provider.getSessionConfig(session.sessionId)?.values.branch, 'main', 'cache must stay at the readOnly value');
	});

	test('SessionConfigChanged that beats notify/sessionAdded is buffered and applied on cache populate', async () => {
		// Regression for CODE_REVIEW.md H4. The server emits the schema-push
		// side-effect immediately after `createSession`, but the action and
		// notification subscriptions are independent — there is no ordering
		// guarantee. If the schema-only `SessionConfigChanged` arrives BEFORE
		// `notify/sessionAdded`, the previous code silently dropped it via the
		// `if (!cached) return` early-out in `_handleConfigChanged`, leaving
		// the picker schemaless until the next mutation triggered another push.
		//
		// Fix: buffer per-rawId pending config changes; drain when the cache
		// entry is populated by `_handleSessionAdded`.
		const provider = createProvider(disposables, agentHost);

		// Step 1: schema arrives over the action stream for a session whose
		// notify/sessionAdded has not yet fired. Without the buffer, this
		// would be silently dropped.
		const rawId = 'race-1';
		agentHost.publishSessionConfig(rawId, 'copilotcli', {
			schema: { type: 'object', properties: { mode: { type: 'string', title: 'Mode', sessionMutable: true, enum: ['agent', 'code'] } } },
			values: { mode: 'agent' },
		});

		// Cache is still empty for this rawId — `getSessionConfig` would
		// return undefined (no `_sessionCache` entry → no `sessionId` we
		// could even ask about yet).
		assert.strictEqual(provider.getSessions().some(s => AgentSession.id(s.resource) === rawId), false);

		// Step 2: notify/sessionAdded fires later. Drain must apply the
		// buffered schema/values to `_runningSessionConfigs`.
		fireSessionAdded(agentHost, rawId, { provider: 'copilotcli', title: 'Race Session' });

		const cached = provider.getSessions().find(s => AgentSession.id(s.resource) === rawId);
		assert.ok(cached, 'session must appear in the cache after notify/sessionAdded');

		const cachedConfig = provider.getSessionConfig(cached!.sessionId);
		assert.deepStrictEqual({
			modeFromCache: cachedConfig?.values.mode,
			schemaHasMode: !!cachedConfig?.schema.properties.mode,
		}, {
			modeFromCache: 'agent',
			schemaHasMode: true,
		});
	});

	test('snapshot-seeded config preserves top-level schema fields like `required`', async () => {
		// Drives the eager-subscription onDidChange → _seedRunningConfigFromState
		// path (separate from the action-stream path exercised above). Earlier
		// the snapshot path silently dropped `required` when copying schema,
		// causing isSessionConfigComplete to misreport completeness and the
		// new-session loading spinner to clear prematurely.
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		const rawId = session.resource.path.substring(1);
		agentHost.setSessionState(rawId, 'copilotcli', {
			summary: { resource: AgentSession.uri('copilotcli', rawId).toString(), provider: 'copilotcli', title: '', status: ProtocolSessionStatus.Idle, createdAt: Date.now(), modifiedAt: Date.now() },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
			activeTurn: undefined,
			steeringMessage: undefined,
			queuedMessages: [],
			inputRequests: [],
			config: {
				schema: { type: 'object', required: ['apiKey'], properties: { apiKey: { type: 'string', title: 'API Key' } } },
				values: {},
			},
		} as unknown as SessionState);
		await waitForSessionConfig(provider, session.sessionId, c => c?.schema.required?.includes('apiKey') === true);

		const cached = provider.getSessionConfig(session.sessionId);
		assert.deepStrictEqual({
			required: cached?.schema.required,
			loading: session.loading.get(),
		}, {
			required: ['apiKey'],
			loading: true,
		});
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

	test('new session loading reflects authenticationPending until config resolves', async () => {
		agentHost.setAuthenticationPending(true);
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		// With auth pending, eagerCreate hasn't sent createSession yet so
		// the eager-subscription path that normally seeds state.config is
		// not open. Drive the schema in via the sessionAdded → snapshot
		// flow: sessionAdded populates `_sessionCache` and opens a
		// keep-alive subscription via `_keepSessionStateAlive`, through
		// which `setSessionState` then delivers the snapshot.
		const rawId = session.resource.path.substring(1);
		fireSessionAdded(agentHost, rawId);
		agentHost.setSessionState(rawId, 'copilotcli', {
			summary: { resource: AgentSession.uri('copilotcli', rawId).toString(), provider: 'copilotcli', title: '', status: ProtocolSessionStatus.Idle, createdAt: Date.now(), modifiedAt: Date.now() },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
			activeTurn: undefined,
			steeringMessage: undefined,
			queuedMessages: [],
			inputRequests: [],
			config: {
				schema: { type: 'object', properties: { isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] } } },
				values: { isolation: 'worktree' },
			},
		} as unknown as SessionState);
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.isolation === 'worktree');

		// Even though config is complete (per-session loading is false), the
		// auth-pending flag keeps the session in the loading state.
		assert.strictEqual(session.loading.get(), true);

		agentHost.setAuthenticationPending(false);
		assert.strictEqual(session.loading.get(), false);
	});

	// ---- sendAndCreateChat -------

	test('sendAndCreateChat throws for unknown session', async () => {
		const provider = createProvider(disposables, agentHost);
		await assert.rejects(
			() => provider.sendAndCreateChat('nonexistent', { query: 'test' }),
			/not found or not a new session/,
		);
	});

	test('sendAndCreateChat forwards resolved session config to chat service', async () => {
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
		await timeout(0);

		// Drive the schema through the eager-subscription path. For a new
		// session the action stream is buffered until `notify/sessionAdded`
		// fires (H4) — but `sendAndCreateChat` requires the running config
		// to be populated *before* it issues the request, so seed via the
		// snapshot path which mirrors the production flow.
		const rawId = session.resource.path.substring(1);
		agentHost.setSessionState(rawId, 'copilotcli', {
			summary: { resource: AgentSession.uri('copilotcli', rawId).toString(), provider: 'copilotcli', title: '', status: ProtocolSessionStatus.Idle, createdAt: Date.now(), modifiedAt: Date.now() },
			lifecycle: SessionLifecycle.Ready,
			turns: [],
			activeTurn: undefined,
			steeringMessage: undefined,
			queuedMessages: [],
			inputRequests: [],
			config: {
				schema: { type: 'object', properties: { isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] } } },
				values: { isolation: 'worktree' },
			},
		} as unknown as SessionState);
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.isolation === 'worktree');

		await provider.sendAndCreateChat(session.sessionId, { query: 'hello' });

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
		const configChanged = agentHost.dispatchedActions.find(d => d.action.type === ActionType.SessionConfigChanged && (d.action as { session: string }).session === sessionUri);
		assert.ok(configChanged, 'a SessionConfigChanged action should be dispatched');
		assert.deepStrictEqual(configChanged.action, {
			type: ActionType.SessionConfigChanged,
			session: sessionUri,
			config: { autoApprove: 'autoApprove', isolation: 'worktree', branch: 'main' },
			replace: true,
		});

		const latest = provider.getSessionConfig(session!.sessionId);
		assert.deepStrictEqual(latest?.values, { autoApprove: 'autoApprove', isolation: 'worktree', branch: 'main' });
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
			action: {
				type: ActionType.SessionConfigChanged,
				session: AgentSession.uri('copilotcli', 'cfg-merge').toString(),
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
			action: {
				type: ActionType.SessionConfigChanged,
				session: AgentSession.uri('copilotcli', 'cfg-replace').toString(),
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
