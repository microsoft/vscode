/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentSession, type IAgentConnection, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import type { ISessionAction, ITerminalAction } from '../../../../../platform/agentHost/common/state/protocol/action-origin.generated.js';
import type { IResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { NotificationType } from '../../../../../platform/agentHost/common/state/protocol/notifications.js';
import type { IAgentInfo, IModelSelection, IRootState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, type IActionEnvelope, type INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionStatus as ProtocolSessionStatus } from '../../../../../platform/agentHost/common/state/sessionState.js';
import type { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService, type ChatSendResult, type IChatSendRequestOptions } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionChangeEvent } from '../../../../services/sessions/common/sessionsProvider.js';
import { SessionStatus, COPILOT_CLI_SESSION_TYPE } from '../../../../services/sessions/common/session.js';
import { remoteAgentHostSessionTypeId } from '../../common/remoteAgentHostSessionType.js';
import { RemoteAgentHostSessionsProvider, type IRemoteAgentHostSessionsProviderConfig } from '../../browser/remoteAgentHostSessionsProvider.js';

// ---- Mock connection --------------------------------------------------------

class MockAgentConnection extends mock<IAgentConnection>() {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAction = new Emitter<IActionEnvelope>();
	override readonly onDidAction = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<INotification>();
	override readonly onDidNotification = this._onDidNotification.event;

	private readonly _onDidRootStateChange = new Emitter<IRootState>();
	private _rootStateValue: IRootState = { agents: [{ provider: 'copilot', displayName: 'Copilot', description: '', models: [] } as IAgentInfo] };
	override readonly rootState: IAgentSubscription<IRootState>;

	override readonly clientId = 'test-client-1';
	private readonly _sessions = new Map<string, IAgentSessionMetadata>();
	public disposedSessions: URI[] = [];
	public dispatchedActions: { action: ISessionAction | ITerminalAction; clientId: string; clientSeq: number }[] = [];
	public failResolveSessionConfig = false;
	public resolveSessionConfigResult: IResolveSessionConfigResult = { schema: { type: 'object', properties: {} }, values: { isolation: 'worktree' } };

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

	override async resolveSessionConfig(): Promise<IResolveSessionConfigResult> {
		await Promise.resolve();
		if (this.failResolveSessionConfig) {
			throw new Error('resolveSessionConfig unavailable');
		}
		return this.resolveSessionConfigResult;
	}

	dispatchAction(action: ISessionAction | ITerminalAction, clientId: string, clientSeq: number): void {
		this.dispatchedActions.push({ action, clientId, clientSeq });
	}

	override dispatch(action: ISessionAction | ITerminalAction): void {
		this.dispatchedActions.push({ action, clientId: this.clientId, clientSeq: this._nextSeq++ });
	}

	// Test helpers
	addSession(meta: IAgentSessionMetadata): void {
		this._sessions.set(AgentSession.id(meta.session), meta);
	}

	setAgents(agents: IAgentInfo[]): void {
		this._rootStateValue = { agents };
		this._onDidRootStateChange.fire(this._rootStateValue);
	}

	fireNotification(n: INotification): void {
		this._onDidNotification.fire(n);
	}

	fireAction(envelope: IActionEnvelope): void {
		this._onDidAction.fire(envelope);
	}

	dispose(): void {
		this._onDidAction.dispose();
		this._onDidNotification.dispose();
		this._onDidRootStateChange.dispose();
	}
}

// ---- Test helpers -----------------------------------------------------------

function createSession(id: string, opts?: { provider?: string; summary?: string; model?: string; project?: { uri: URI; displayName: string }; workingDirectory?: URI; startTime?: number; modifiedTime?: number }): IAgentSessionMetadata {
	return {
		session: AgentSession.uri(opts?.provider ?? 'copilot', id),
		startTime: opts?.startTime ?? 1000,
		modifiedTime: opts?.modifiedTime ?? 2000,
		summary: opts?.summary,
		model: opts?.model ? { id: opts.model } : undefined,
		project: opts?.project,
		workingDirectory: opts?.workingDirectory,
	};
}

function createProvider(disposables: DisposableStore, connection: MockAgentConnection, overrides?: { address?: string; connectionName?: string | undefined; sendRequest?: (resource: URI, message: string, options?: IChatSendRequestOptions) => Promise<ChatSendResult>; openSession?: boolean }): RemoteAgentHostSessionsProvider {
	const instantiationService = disposables.add(new TestInstantiationService());

	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(INotificationService, { error: () => { } });
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
	instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));

	const config: IRemoteAgentHostSessionsProviderConfig = {
		address: overrides?.address ?? 'localhost:4321',
		name: overrides !== undefined && Object.prototype.hasOwnProperty.call(overrides, 'connectionName') ? overrides.connectionName ?? '' : 'Test Host',
	};

	const provider = disposables.add(instantiationService.createInstance(RemoteAgentHostSessionsProvider, config));
	provider.setConnection(connection);
	return provider;
}

async function waitForSessionConfig(provider: RemoteAgentHostSessionsProvider, sessionId: string, predicate: (config: IResolveSessionConfigResult | undefined) => boolean): Promise<void> {
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

function fireSessionAdded(connection: MockAgentConnection, rawId: string, opts?: { provider?: string; title?: string; model?: string; modelConfig?: Record<string, string>; project?: { uri: string; displayName: string }; workingDirectory?: string }): void {
	const provider = opts?.provider ?? 'copilot';
	const sessionUri = AgentSession.uri(provider, rawId);
	connection.fireNotification({
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

function fireSessionRemoved(connection: MockAgentConnection, rawId: string, provider = 'copilot'): void {
	const sessionUri = AgentSession.uri(provider, rawId);
	connection.fireNotification({
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
		const provider = createProvider(disposables, connection, { address: '10.0.0.1:8080', connectionName: 'My Host' });

		assert.strictEqual(provider.id, 'agenthost-10.0.0.1__8080');
		assert.strictEqual(provider.label, 'My Host');
		assert.strictEqual(provider.sessionTypes.length, 1);
		assert.strictEqual(provider.sessionTypes[0].id, COPILOT_CLI_SESSION_TYPE);
		assert.strictEqual(provider.sessionTypes[0].label, 'Copilot [My Host]');
	});

	test('session types update when the host advertises additional agents', () => {
		const provider = createProvider(disposables, connection, { address: '10.0.0.1:8080', connectionName: 'My Host' });
		assert.deepStrictEqual(provider.sessionTypes.map(t => t.id), [
			COPILOT_CLI_SESSION_TYPE,
		]);

		let changes = 0;
		disposables.add(provider.onDidChangeSessionTypes!(() => changes++));

		connection.setAgents([
			{ provider: 'copilot', displayName: 'Copilot', description: '', models: [] } as IAgentInfo,
			{ provider: 'openai', displayName: 'OpenAI', description: '', models: [] } as IAgentInfo,
		]);

		assert.strictEqual(changes, 1);
		assert.deepStrictEqual(provider.sessionTypes.map(t => ({ id: t.id, label: t.label })), [
			{ id: COPILOT_CLI_SESSION_TYPE, label: 'Copilot [My Host]' },
			{ id: remoteAgentHostSessionTypeId('10.0.0.1__8080', 'openai'), label: 'OpenAI [My Host]' },
		]);
	});

	test('falls back to address-based label when no name given', () => {
		const provider = createProvider(disposables, connection, { connectionName: undefined, address: 'myhost:9999' });

		assert.strictEqual(provider.label, 'myhost:9999');
	});

	// ---- Workspace resolution -------

	test('resolveWorkspace builds workspace from URI', () => {
		const provider = createProvider(disposables, connection);
		const uri = URI.parse('vscode-agent-host://auth/home/user/project');
		const ws = provider.resolveWorkspace(uri);

		assert.strictEqual(ws.label, 'project [Test Host]');
		assert.strictEqual(ws.repositories.length, 1);
		assert.strictEqual(ws.repositories[0].uri.toString(), uri.toString());
		assert.strictEqual(ws.repositories[0].detail, undefined);
	});

	// ---- Browse actions -------

	test('has one browse action for remote folders', () => {
		const provider = createProvider(disposables, connection);

		assert.strictEqual(provider.browseActions.length, 1);
		assert.ok(provider.browseActions[0].label.includes('Folders'));
		assert.strictEqual(provider.browseActions[0].providerId, provider.id);
	});

	// ---- Session listing via notifications -------

	test('onDidChangeSessions fires when session added notification arrives', () => {
		const provider = createProvider(disposables, connection);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		fireSessionAdded(connection, 'notif-1', { title: 'Notif Session' });

		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].added.length, 1);
		assert.strictEqual(changes[0].added[0].title.get(), 'Notif Session');
	});

	test('session added notifications ingest any advertised agent provider', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.setAgents([
			{ provider: 'copilot', displayName: 'Copilot', description: '', models: [] } as IAgentInfo,
			{ provider: 'openai', displayName: 'OpenAI', description: '', models: [] } as IAgentInfo,
		]);
		const provider = createProvider(disposables, connection);

		fireSessionAdded(connection, 'cop-1', { provider: 'copilot', title: 'Copilot Session' });
		fireSessionAdded(connection, 'oai-1', { provider: 'openai', title: 'OpenAI Session' });

		const sessions = provider.getSessions();
		assert.deepStrictEqual(
			sessions.map(s => ({ title: s.title.get(), sessionType: s.sessionType })).sort((a, b) => a.title.localeCompare(b.title)),
			[
				{ title: 'Copilot Session', sessionType: COPILOT_CLI_SESSION_TYPE },
				{ title: 'OpenAI Session', sessionType: remoteAgentHostSessionTypeId('localhost__4321', 'openai') },
			],
		);
	}));

	test('session removed notification removes from cache', () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'to-remove', { title: 'Removed' });

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		fireSessionRemoved(connection, 'to-remove');

		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].removed.length, 1);
	});

	test('duplicate session added notification is ignored', () => {
		const provider = createProvider(disposables, connection);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		fireSessionAdded(connection, 'dup-sess', { title: 'Dup' });
		fireSessionAdded(connection, 'dup-sess', { title: 'Dup' });

		assert.strictEqual(changes.length, 1);
	});

	test('uses project metadata as workspace group source', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const projectUri = URI.parse('vscode-agent-host://localhost__4321/file/-/home/user/vscode');
		const workingDirectory = URI.parse('vscode-agent-host://localhost__4321/file/-/tmp/copilot-worktrees/vscode-feature');
		connection.addSession(createSession('project-1', {
			summary: 'Project Session',
			project: { uri: projectUri, displayName: 'vscode' },
			workingDirectory,
		}));

		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await timeout(0);

		const workspace = provider.getSessions()[0].workspace.get();
		assert.deepStrictEqual({
			label: workspace?.label,
			repository: workspace?.repositories[0]?.uri.toString(),
			workingDirectory: workspace?.repositories[0]?.workingDirectory?.toString(),
			detail: workspace?.repositories[0]?.detail,
		}, {
			label: 'vscode [Test Host]',
			repository: projectUri.toString(),
			workingDirectory: workingDirectory.toString(),
			detail: undefined,
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
		assert.deepStrictEqual(workspaces.map(workspace => workspace?.repositories[0]?.uri.toString()), [
			'vscode-agent-host://localhost__4321/file/-/home/user/vscode',
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

	test('uses model metadata as selected model for listed sessions', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('model-1', { summary: 'Model Session', model: 'claude-sonnet-4.5' }));

		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await timeout(0);

		const session = provider.getSessions().find(s => s.title.get() === 'Model Session');
		assert.strictEqual(session?.modelId.get(), 'remote-localhost__4321-copilot:claude-sonnet-4.5');
	}));

	test('uses model metadata from session added notification', () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'notif-model', { title: 'Notif Model Session', model: 'gpt-5' });

		const session = provider.getSessions().find(s => s.title.get() === 'Notif Model Session');
		assert.strictEqual(session?.modelId.get(), 'remote-localhost__4321-copilot:gpt-5');
	});

	test('setModel updates existing session model and dispatches raw model', () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'set-model', { title: 'Set Model Session', model: 'old-model' });

		const session = provider.getSessions().find(s => s.title.get() === 'Set Model Session');
		assert.ok(session);

		provider.setModel(session!.sessionId, 'remote-localhost__4321-copilot:new-model');

		assert.strictEqual(session!.modelId.get(), 'remote-localhost__4321-copilot:new-model');
		assert.deepStrictEqual(connection.dispatchedActions.at(-1)?.action, {
			type: ActionType.SessionModelChanged,
			session: AgentSession.uri('copilot', 'set-model').toString(),
			model: { id: 'new-model' },
		});
	});

	test('setModel preserves current model config when model id is unchanged', () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'set-model-config', { title: 'Set Model Config Session', model: 'configured-model', modelConfig: { thinkingLevel: 'high' } });

		const session = provider.getSessions().find(s => s.title.get() === 'Set Model Config Session');
		assert.ok(session);

		provider.setModel(session!.sessionId, 'remote-localhost__4321-copilot:configured-model');

		assert.deepStrictEqual(connection.dispatchedActions.at(-1)?.action, {
			type: ActionType.SessionModelChanged,
			session: AgentSession.uri('copilot', 'set-model-config').toString(),
			model: { id: 'configured-model', config: { thinkingLevel: 'high' } },
		});
	});

	// ---- Session lifecycle -------

	test('createNewSession returns session with correct fields', () => {
		const provider = createProvider(disposables, connection);
		const session = provider.createNewSession(URI.parse('vscode-agent-host://auth/home/user/project'), provider.sessionTypes[0].id);

		assert.strictEqual(session.providerId, provider.id);
		assert.strictEqual(session.status.get(), SessionStatus.Untitled);
		assert.ok(session.workspace.get());
		assert.strictEqual(session.workspace.get()?.label, 'project [Test Host]');
		// sessionType should be the logical type, not the resource scheme
		assert.strictEqual(session.sessionType, provider.sessionTypes[0].id);
		assert.deepStrictEqual(provider.getSessionConfig(session.sessionId), { schema: { type: 'object', properties: {} }, values: {} });
	});

	test('createNewSession clears session config when resolving config is unavailable', async () => {
		connection.failResolveSessionConfig = true;
		const provider = createProvider(disposables, connection);
		const workspaceUri = URI.parse('vscode-agent-host://auth/home/user/project');
		const session = provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
		const resolved = provider.getSessionByResource(session.resource);

		assert.deepStrictEqual({
			listedSessions: provider.getSessions().length,
			resolvedResource: resolved?.resource.toString(),
			resolvedWorkspaceLabel: resolved?.workspace.get()?.label,
		}, {
			listedSessions: 0,
			resolvedResource: session.resource.toString(),
			resolvedWorkspaceLabel: 'project [Test Host]',
		});
	});

	test('clearConnection clears pending new session config', () => {
		const provider = createProvider(disposables, connection);

		const session = provider.createNewSession(URI.parse('vscode-agent-host://auth/home/user/project'), provider.sessionTypes[0].id);
		provider.clearConnection();

		assert.deepStrictEqual({
			resolved: provider.getSessionByResource(session.resource),
			config: provider.getSessionConfig(session.sessionId),
		}, {
			resolved: undefined,
			config: undefined,
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
		assert.strictEqual(AgentSession.provider(disposedUri), 'copilot');
		assert.strictEqual(AgentSession.id(disposedUri), 'del-sess');
		// Session should no longer appear in getSessions
		const remaining = provider.getSessions();
		assert.strictEqual(remaining.find((s) => s.title.get() === 'To Delete'), undefined);
	});

	// ---- Rename -------

	test('renameSession dispatches SessionTitleChanged action with correct session URI', async () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'rename-sess', { title: 'Old Title' });

		const sessions = provider.getSessions();
		const target = sessions.find((s) => s.title.get() === 'Old Title');
		assert.ok(target, 'Session should exist');

		await provider.renameChat(target!.sessionId, target!.resource, 'New Title');

		assert.strictEqual(connection.dispatchedActions.length, 1);
		const dispatched = connection.dispatchedActions[0];
		assert.strictEqual(dispatched.action.type, ActionType.SessionTitleChanged);
		assert.strictEqual((dispatched.action as { title: string }).title, 'New Title');
		// The session URI in the action must be the backend agent session URI
		const actionSession = (dispatched.action as { session: string }).session;
		assert.strictEqual(AgentSession.provider(actionSession), 'copilot');
		assert.strictEqual(AgentSession.id(actionSession), 'rename-sess');
		assert.strictEqual(dispatched.clientId, 'test-client-1');
	});

	test('renameSession updates local title optimistically', async () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'rename-opt', { title: 'Before' });

		const sessions = provider.getSessions();
		const target = sessions.find((s) => s.title.get() === 'Before');
		assert.ok(target);

		await provider.renameChat(target!.sessionId, target!.resource, 'After');

		assert.strictEqual(target!.title.get(), 'After');
	});

	test('renameSession is no-op for unknown chatId', async () => {
		const provider = createProvider(disposables, connection);
		await provider.renameChat('nonexistent-id', URI.parse('test://nonexistent'), 'Ignored');

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

		await provider.renameChat(target!.sessionId, target!.resource, 'Title 1');
		await provider.renameChat(target!.sessionId, target!.resource, 'Title 2');

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
			action: {
				type: ActionType.SessionTitleChanged,
				session: AgentSession.uri('copilot', 'echo-sess').toString(),
				title: 'Server Title',
			},
			serverSeq: 1,
			origin: undefined,
		} as IActionEnvelope);

		assert.strictEqual(target!.title.get(), 'Server Title');
		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].changed.length, 1);
	});

	test('server-echoed SessionModelChanged updates cached model', () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'model-change', { title: 'Model Change', model: 'old-model' });

		const target = provider.getSessions().find(s => s.title.get() === 'Model Change');
		assert.ok(target);

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		connection.fireAction({
			action: {
				type: ActionType.SessionModelChanged,
				session: AgentSession.uri('copilot', 'model-change').toString(),
				model: { id: 'new-model' } satisfies IModelSelection,
			},
			serverSeq: 1,
			origin: undefined,
		} as IActionEnvelope);

		assert.strictEqual(target!.modelId.get(), 'remote-localhost__4321-copilot:new-model');
		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].changed.length, 1);
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
			action: {
				type: 'session/turnComplete',
				session: AgentSession.uri('copilot', 'persist-sess').toString(),
			},
			serverSeq: 1,
			origin: undefined,
		} as IActionEnvelope);

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
		const session = provider.createNewSession(URI.parse('vscode-agent-host://auth/home/user/project'), provider.sessionTypes[0].id);
		await waitForSessionConfig(provider, session.sessionId, config => config?.schema.required?.includes('branch') === true);

		assert.strictEqual(session.loading.get(), true);
	});

	test('cached session loading reflects authenticationPending', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('cached-auth', { summary: 'Cached' }));
		const provider = createProvider(disposables, connection);
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

	test('sendAndCreateChat throws for unknown session', async () => {
		const provider = createProvider(disposables, connection);
		await assert.rejects(
			() => provider.sendAndCreateChat('nonexistent', { query: 'test' }),
			/not found or not a new session/,
		);
	});

	test('sendAndCreateChat forwards resolved session config to chat service', async () => {
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
		const session = provider.createNewSession(URI.parse('vscode-agent-host://auth/home/user/project'), provider.sessionTypes[0].id);
		await timeout(0);

		await provider.sendAndCreateChat(session.sessionId, { query: 'hello' });

		assert.deepStrictEqual(sendOptions.map(options => options.agentHostSessionConfig), [{ isolation: 'worktree' }]);
	});

	// ---- Session data adapter -------

	test('session adapter has correct workspace from working directory', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		connection.addSession(createSession('ws-sess', { summary: 'WS Test', workingDirectory: URI.parse('vscode-agent-host://localhost__4321/file/-/home/user/myrepo') }));

		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await timeout(0);

		const sessions = provider.getSessions();
		const wsSession = sessions.find((s) => s.title.get() === 'WS Test');
		assert.ok(wsSession, 'Session with working directory should exist');

		const workspace = wsSession!.workspace.get();
		assert.ok(workspace, 'Workspace should be populated');
		assert.strictEqual(workspace!.label, 'myrepo [Test Host]');
		assert.strictEqual(workspace!.repositories[0].detail, undefined);
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
			action: {
				type: 'session/turnComplete',
				session: AgentSession.uri('copilot', 'turn-sess').toString(),
			},
			serverSeq: 1,
			origin: undefined,
		} as IActionEnvelope);

		await timeout(0);

		assert.ok(changes.length > 0);
		const updatedSession = provider.getSessions().find((s) => s.title.get() === 'After');
		assert.ok(updatedSession, 'Session should have updated title');
	}));

});
