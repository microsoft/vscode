/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentSession, IAgentHostService, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import type { ISessionAction, ITerminalAction } from '../../../../../platform/agentHost/common/state/protocol/action-origin.generated.js';
import { NotificationType } from '../../../../../platform/agentHost/common/state/protocol/notifications.js';
import { SessionStatus as ProtocolSessionStatus } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ActionType, type IActionEnvelope, type INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService, type ChatSendResult } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionChangeEvent } from '../../../../services/sessions/common/sessionsProvider.js';

import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { LocalAgentHostSessionsProvider } from '../../browser/localAgentHostSessionsProvider.js';

// ---- Mock IAgentHostService -------------------------------------------------

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAction = new Emitter<IActionEnvelope>();
	override readonly onDidAction = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<INotification>();
	override readonly onDidNotification = this._onDidNotification.event;

	override readonly clientId = 'test-local-client';
	private readonly _sessions = new Map<string, IAgentSessionMetadata>();
	public disposedSessions: URI[] = [];
	public dispatchedActions: { action: ISessionAction | ITerminalAction; clientId: string; clientSeq: number }[] = [];

	private _nextSeq = 0;

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

	fireNotification(n: INotification): void {
		this._onDidNotification.fire(n);
	}

	fireAction(envelope: IActionEnvelope): void {
		this._onDidAction.fire(envelope);
	}

	dispose(): void {
		this._onDidAction.dispose();
		this._onDidNotification.dispose();
	}
}

// ---- Test helpers -----------------------------------------------------------

function createSession(id: string, opts?: { provider?: string; summary?: string; workingDirectory?: URI; startTime?: number; modifiedTime?: number }): IAgentSessionMetadata {
	return {
		session: AgentSession.uri(opts?.provider ?? 'copilot', id),
		startTime: opts?.startTime ?? 1000,
		modifiedTime: opts?.modifiedTime ?? 2000,
		summary: opts?.summary,
		workingDirectory: opts?.workingDirectory,
	};
}

function createProvider(disposables: DisposableStore, agentHostService: MockAgentHostService): LocalAgentHostSessionsProvider {
	const instantiationService = disposables.add(new TestInstantiationService());

	instantiationService.stub(IAgentHostService, agentHostService);
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IChatSessionsService, {
		getChatSessionContribution: () => ({ type: 'agent-host-copilot', name: 'test', displayName: 'Test', description: 'test', icon: undefined }),
		getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } }),
	});
	instantiationService.stub(IChatService, {
		acquireOrLoadSession: async () => undefined,
		sendRequest: async (): Promise<ChatSendResult> => ({ kind: 'sent' as const, data: {} as ChatSendResult extends { kind: 'sent'; data: infer D } ? D : never }),
	});
	instantiationService.stub(IChatWidgetService, {
		openSession: async () => undefined,
	});
	instantiationService.stub(ILanguageModelsService, {
		lookupLanguageModel: () => undefined,
	});

	return disposables.add(instantiationService.createInstance(LocalAgentHostSessionsProvider));
}

function fireSessionAdded(agentHost: MockAgentHostService, rawId: string, opts?: { provider?: string; title?: string; workingDirectory?: string }): void {
	const provider = opts?.provider ?? 'copilot';
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
			workingDirectory: opts?.workingDirectory,
		},
	});
}

function fireSessionRemoved(agentHost: MockAgentHostService, rawId: string, provider = 'copilot'): void {
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

	test('has correct id, label, and sessionType', () => {
		const provider = createProvider(disposables, agentHost);

		assert.strictEqual(provider.id, 'local-agent-host');
		assert.ok(provider.label.length > 0);
		assert.strictEqual(provider.sessionTypes.length, 1);
		assert.strictEqual(provider.sessionTypes[0].id, 'agent-host-copilot');
	});

	// ---- Workspace resolution -------

	test('resolveWorkspace builds workspace from URI', () => {
		const provider = createProvider(disposables, agentHost);
		const uri = URI.parse('file:///home/user/project');
		const ws = provider.resolveWorkspace(uri);

		assert.strictEqual(ws.label, 'project');
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

	// ---- Session lifecycle -------

	test('createNewSession returns session with correct fields', () => {
		const provider = createProvider(disposables, agentHost);
		const workspace = {
			label: 'my-project',
			icon: { id: 'folder' },
			repositories: [{ uri: URI.parse('file:///home/user/project'), workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: true,
		};

		const session = provider.createNewSession(workspace);

		assert.strictEqual(session.providerId, provider.id);
		assert.strictEqual(session.status.get(), SessionStatus.Untitled);
		assert.ok(session.workspace.get());
		assert.strictEqual(session.workspace.get()?.label, 'my-project');
		assert.strictEqual(session.sessionType, provider.sessionTypes[0].id);
	});

	test('createNewSession throws when no repository URI', () => {
		const provider = createProvider(disposables, agentHost);
		const workspace = { label: 'empty', icon: { id: 'folder' }, repositories: [], requiresWorkspaceTrust: false };

		assert.throws(() => provider.createNewSession(workspace), /Workspace has no repository URI/);
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
		assert.strictEqual(AgentSession.provider(disposedUri), 'copilot');
		assert.strictEqual(AgentSession.id(disposedUri), 'del-sess');
		assert.strictEqual(provider.getSessions().find(s => s.title.get() === 'To Delete'), undefined);
	});

	test('setRead toggles read state locally', () => {
		const provider = createProvider(disposables, agentHost);
		fireSessionAdded(agentHost, 'read-sess', { title: 'Read Test' });

		const sessions = provider.getSessions();
		const target = sessions.find(s => s.title.get() === 'Read Test');
		assert.ok(target);

		assert.strictEqual(target!.isRead.get(), true);
		provider.setRead(target!.sessionId, false);
		assert.strictEqual(target!.isRead.get(), false);
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
		assert.strictEqual(AgentSession.provider(actionSession), 'copilot');
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
				session: AgentSession.uri('copilot', 'turn-sess').toString(),
			},
			serverSeq: 1,
			origin: undefined,
		} as IActionEnvelope);

		await timeout(0);

		assert.ok(changes.length > 0);
		const updatedSession = provider.getSessions().find(s => s.title.get() === 'After');
		assert.ok(updatedSession);
	}));

	// ---- getSessionTypes -------

	test('getSessionTypes returns available types', () => {
		const provider = createProvider(disposables, agentHost);
		const types = provider.getSessionTypes('any-id');

		assert.strictEqual(types.length, 1);
		assert.strictEqual(types[0].id, 'agent-host-copilot');
	});

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

	// ---- sendAndCreateChat -------

	test('sendAndCreateChat throws for unknown session', async () => {
		const provider = createProvider(disposables, agentHost);
		await assert.rejects(
			() => provider.sendAndCreateChat('nonexistent', { query: 'test' }),
			/not found or not a new session/,
		);
	});
});
