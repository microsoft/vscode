/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable, type IReference } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue, type IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentSession, IAgentHostService, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import type { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { RootAction, SessionAction, TerminalAction } from '../../../../../platform/agentHost/common/state/protocol/action-origin.generated.js';
import type { ResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { NotificationType } from '../../../../../platform/agentHost/common/state/protocol/notifications.js';
import { SessionLifecycle, type AgentInfo, type ModelSelection, type RootState, type SessionConfigState, type SessionState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { SessionStatus as ProtocolSessionStatus, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ActionType, type ActionEnvelope, type INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
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
	public dispatchedActions: { action: RootAction | SessionAction | TerminalAction; clientId: string; clientSeq: number }[] = [];
	public failResolveSessionConfig = false;
	public resolveSessionConfigResult: ResolveSessionConfigResult = { schema: { type: 'object', properties: {} }, values: { isolation: 'worktree' } };

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

	override async resolveSessionConfig(): Promise<ResolveSessionConfigResult> {
		await Promise.resolve();
		if (this.failResolveSessionConfig) {
			throw new Error('resolveSessionConfig unavailable');
		}
		return this.resolveSessionConfigResult;
	}

	dispatchAction(action: RootAction | SessionAction | TerminalAction, clientId: string, clientSeq: number): void {
		this.dispatchedActions.push({ action, clientId, clientSeq });
	}

	override dispatch(action: RootAction | SessionAction | TerminalAction): void {
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
], options?: { sendRequest?: (resource: URI, message: string, options?: IChatSendRequestOptions) => Promise<ChatSendResult>; openSession?: boolean }): LocalAgentHostSessionsProvider {
	const instantiationService = disposables.add(new TestInstantiationService());

	instantiationService.stub(IAgentHostService, agentHostService);
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
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

	test('has one browse action for local folders', () => {
		const provider = createProvider(disposables, agentHost);

		assert.strictEqual(provider.browseActions.length, 1);
		assert.strictEqual(provider.browseActions[0].providerId, provider.id);
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
		assert.deepStrictEqual(provider.getSessionConfig(session.sessionId), { schema: { type: 'object', properties: {} }, values: {} });
	});

	test('createNewSession clears session config when resolving config is unavailable', async () => {
		agentHost.failResolveSessionConfig = true;
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, config => config === undefined);

		assert.strictEqual(provider.getSessionConfig(session.sessionId), undefined);
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

	test('new session loading reflects authenticationPending until config resolves', async () => {
		agentHost.setAuthenticationPending(true);
		const provider = createProvider(disposables, agentHost);
		const session = provider.createNewSession(URI.parse('file:///home/user/project'), provider.sessionTypes[0].id);
		// Wait for the resolved config (the mock returns `values.isolation: 'worktree'`)
		// so that the per-session loading flag has been turned off.
		await waitForSessionConfig(provider, session.sessionId, config => config?.values.isolation === 'worktree');

		// Even though config has resolved (per-session loading is false), the
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
