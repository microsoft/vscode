/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AgentSession, type IAgentConnection, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import type { IActionEnvelope, INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { NotificationType } from '../../../../../platform/agentHost/common/state/protocol/notifications.js';
import { SessionStatus as ProtocolSessionStatus } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatService, type ChatSendResult } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { SessionStatus } from '../../../sessions/common/sessionData.js';
import { ISessionChangeEvent } from '../../../sessions/browser/sessionsProvider.js';
import { CopilotCLISessionType } from '../../../sessions/browser/sessionTypes.js';
import { RemoteAgentHostSessionsProvider, type IRemoteAgentHostSessionsProviderConfig } from '../../browser/remoteAgentHostSessionsProvider.js';

// ---- Mock connection --------------------------------------------------------

class MockAgentConnection extends mock<IAgentConnection>() {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAction = new Emitter<IActionEnvelope>();
	override readonly onDidAction = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<INotification>();
	override readonly onDidNotification = this._onDidNotification.event;

	override readonly clientId = 'test-client-1';
	private readonly _sessions = new Map<string, IAgentSessionMetadata>();
	public disposedSessions: URI[] = [];

	override async listSessions(): Promise<IAgentSessionMetadata[]> {
		return [...this._sessions.values()];
	}

	override async disposeSession(session: URI): Promise<void> {
		this.disposedSessions.push(session);
		const rawId = AgentSession.id(session);
		this._sessions.delete(rawId);
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

function createSession(id: string, opts?: { provider?: string; summary?: string; workingDirectory?: string; startTime?: number; modifiedTime?: number }): IAgentSessionMetadata {
	return {
		session: AgentSession.uri(opts?.provider ?? 'copilot', id),
		startTime: opts?.startTime ?? 1000,
		modifiedTime: opts?.modifiedTime ?? 2000,
		summary: opts?.summary,
		workingDirectory: opts?.workingDirectory,
	};
}

function createProvider(disposables: DisposableStore, connection: MockAgentConnection, overrides?: { address?: string; connectionName?: string | undefined }): RemoteAgentHostSessionsProvider {
	const instantiationService = disposables.add(new TestInstantiationService());

	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IChatSessionsService, {
		getChatSessionContribution: () => ({ type: 'remote-test-copilot', name: 'test', displayName: 'Test', description: 'test', icon: undefined }),
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

	const config: IRemoteAgentHostSessionsProviderConfig = {
		connectionInfo: {
			address: overrides?.address ?? 'localhost:4321',
			name: overrides !== undefined && Object.prototype.hasOwnProperty.call(overrides, 'connectionName') ? overrides.connectionName ?? '' : 'Test Host',
			clientId: 'test-client',
		},
		connection,
	};

	return disposables.add(instantiationService.createInstance(RemoteAgentHostSessionsProvider, config));
}

function fireSessionAdded(connection: MockAgentConnection, rawId: string, opts?: { provider?: string; title?: string; workingDirectory?: string }): void {
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

	test('derives id, label, and sessionType from config', () => {
		const provider = createProvider(disposables, connection, { address: '10.0.0.1:8080', connectionName: 'My Host' });

		assert.ok(provider.id.startsWith('agenthost-'));
		assert.ok(provider.id.includes('10.0.0.1'));
		assert.strictEqual(provider.label, 'My Host');
		assert.strictEqual(provider.sessionTypes.length, 1);
		assert.strictEqual(provider.sessionTypes[0].id, CopilotCLISessionType.id);
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

	test('accepts session notifications from any agent provider', () => {
		const provider = createProvider(disposables, connection);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		fireSessionAdded(connection, 'other-sess', { provider: 'other-agent', title: 'Other Session' });

		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].added.length, 1);
	});

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

	test('removing non-existent session is no-op', () => {
		const provider = createProvider(disposables, connection);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		fireSessionRemoved(connection, 'does-not-exist');

		assert.strictEqual(changes.length, 0);
	});

	test('session removed notification removes session from any provider', () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'cross-prov', { provider: 'other-agent', title: 'Cross Provider' });
		assert.strictEqual(provider.getSessions().length, 1);

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		fireSessionRemoved(connection, 'cross-prov', 'other-agent');

		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].removed.length, 1);
		assert.strictEqual(provider.getSessions().length, 0);
	});

	// ---- Session listing via refresh -------

	test('getSessions populates from connection.listSessions', async () => {
		connection.addSession(createSession('list-1', { summary: 'First' }));
		connection.addSession(createSession('list-2', { summary: 'Second' }));

		const provider = createProvider(disposables, connection);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions((e: ISessionChangeEvent) => changes.push(e)));

		provider.getSessions();
		await new Promise(resolve => setTimeout(resolve, 50));

		assert.ok(changes.length > 0);
		const sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 2);
	});

	// ---- Session lifecycle -------

	test('createNewSession returns session with correct fields', () => {
		const provider = createProvider(disposables, connection);
		const workspace = {
			label: 'my-project',
			icon: { id: 'remote' },
			repositories: [{ uri: URI.parse('vscode-agent-host://auth/home/user/project'), workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: false,
		};

		const session = provider.createNewSession(workspace);

		assert.strictEqual(session.providerId, provider.id);
		assert.strictEqual(session.status.get(), SessionStatus.Untitled);
		assert.ok(session.workspace.get());
		assert.strictEqual(session.workspace.get()?.label, 'my-project');
		// sessionType should be the logical type, not the resource scheme
		assert.strictEqual(session.sessionType, provider.sessionTypes[0].id);
	});

	test('createNewSession throws when no repository URI', () => {
		const provider = createProvider(disposables, connection);
		const workspace = { label: 'empty', icon: { id: 'remote' }, repositories: [], requiresWorkspaceTrust: false };

		assert.throws(() => provider.createNewSession(workspace), /Workspace has no repository URI/);
	});

	test('setSessionType throws', () => {
		const provider = createProvider(disposables, connection);
		assert.throws(() => provider.setSessionType('x', { id: 'y', label: 'Y', icon: { id: 'x' } }));
	});

	// ---- Session actions -------

	test('deleteSession calls disposeSession with backend agent URI and removes from cache', async () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'del-sess', { title: 'To Delete' });

		const sessions = provider.getSessions();
		const target = sessions.find((s) => s.title.get() === 'To Delete');
		assert.ok(target, 'Session should exist');

		await provider.deleteSession(target!.id);

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

	test('setRead toggles read state locally', () => {
		const provider = createProvider(disposables, connection);
		fireSessionAdded(connection, 'read-sess', { title: 'Read Test' });

		const sessions = provider.getSessions();
		const target = sessions.find((s) => s.title.get() === 'Read Test');
		assert.ok(target, 'Session should exist');

		assert.strictEqual(target!.isRead.get(), true);
		provider.setRead(target!.id, false);
		assert.strictEqual(target!.isRead.get(), false);
	});

	// ---- Send -------

	test('sendRequest throws for unknown session', async () => {
		const provider = createProvider(disposables, connection);
		await assert.rejects(
			() => provider.sendRequest('nonexistent', { query: 'test' }),
			/not found or not a new session/,
		);
	});

	// ---- Session data adapter -------

	test('session adapter has correct workspace from working directory', async () => {
		connection.addSession(createSession('ws-sess', { summary: 'WS Test', workingDirectory: '/home/user/myrepo' }));

		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await new Promise(resolve => setTimeout(resolve, 50));

		const sessions = provider.getSessions();
		const wsSession = sessions.find((s) => s.title.get() === 'WS Test');
		assert.ok(wsSession, 'Session with working directory should exist');

		const workspace = wsSession!.workspace.get();
		assert.ok(workspace, 'Workspace should be populated');
		assert.strictEqual(workspace!.label, 'myrepo [Test Host]');
	});

	test('session adapter without working directory has no workspace', async () => {
		connection.addSession(createSession('no-ws-sess', { summary: 'No WS' }));

		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await new Promise(resolve => setTimeout(resolve, 50));

		const sessions = provider.getSessions();
		const session = sessions.find((s) => s.title.get() === 'No WS');
		assert.ok(session, 'Session should exist');
		assert.strictEqual(session!.workspace.get(), undefined);
	});

	test('session adapter uses raw ID as fallback title', async () => {
		connection.addSession(createSession('abcdef1234567890'));

		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await new Promise(resolve => setTimeout(resolve, 50));

		const sessions = provider.getSessions();
		const session = sessions[0];
		assert.ok(session);
		assert.strictEqual(session.title.get(), 'Session abcdef12');
	});

	// ---- Refresh on turnComplete -------

	test('turnComplete action triggers session refresh for matching provider', async () => {
		connection.addSession(createSession('turn-sess', { summary: 'Before', modifiedTime: 1000 }));

		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await new Promise(resolve => setTimeout(resolve, 50));

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

		await new Promise(resolve => setTimeout(resolve, 50));

		assert.ok(changes.length > 0);
		const updatedSession = provider.getSessions().find((s) => s.title.get() === 'After');
		assert.ok(updatedSession, 'Session should have updated title');
	});

	// ---- getSessionTypes -------

	test('getSessionTypes returns available types', () => {
		const provider = createProvider(disposables, connection);
		const workspace = {
			label: 'project',
			icon: { id: 'remote' },
			repositories: [{ uri: URI.parse('vscode-agent-host://auth/home/user/project'), workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: false,
		};
		const session = provider.createNewSession(workspace);
		const types = provider.getSessionTypes(session);

		assert.strictEqual(types.length, 1);
	});

	// ---- sessionType on adapters -------

	test('session adapter uses logical session type, not resource scheme', async () => {
		connection.addSession(createSession('type-sess', { summary: 'Type Test' }));

		const provider = createProvider(disposables, connection);
		provider.getSessions();
		await new Promise(resolve => setTimeout(resolve, 50));

		const sessions = provider.getSessions();
		const session = sessions.find((s) => s.title.get() === 'Type Test');
		assert.ok(session, 'Session should exist');
		// sessionType should be the logical type (agent-host-copilot), not the resource scheme
		assert.strictEqual(session!.sessionType, provider.sessionTypes[0].id);
	});
});
