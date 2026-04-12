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
import { AgentSession } from '../../../../../platform/agentHost/common/agentService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { CopilotCLISessionType } from '../../../sessions/browser/sessionTypes.js';
import { RemoteAgentHostSessionsProvider } from '../../browser/remoteAgentHostSessionsProvider.js';
// ---- Mock connection --------------------------------------------------------
class MockAgentConnection extends mock() {
    constructor() {
        super(...arguments);
        this._onDidAction = new Emitter();
        this.onDidAction = this._onDidAction.event;
        this._onDidNotification = new Emitter();
        this.onDidNotification = this._onDidNotification.event;
        this.clientId = 'test-client-1';
        this._sessions = new Map();
        this.disposedSessions = [];
        this.dispatchedActions = [];
        this._nextSeq = 0;
    }
    nextClientSeq() {
        return this._nextSeq++;
    }
    async listSessions() {
        return [...this._sessions.values()];
    }
    async disposeSession(session) {
        this.disposedSessions.push(session);
        const rawId = AgentSession.id(session);
        this._sessions.delete(rawId);
    }
    dispatchAction(action, clientId, clientSeq) {
        this.dispatchedActions.push({ action, clientId, clientSeq });
    }
    // Test helpers
    addSession(meta) {
        this._sessions.set(AgentSession.id(meta.session), meta);
    }
    fireNotification(n) {
        this._onDidNotification.fire(n);
    }
    fireAction(envelope) {
        this._onDidAction.fire(envelope);
    }
    dispose() {
        this._onDidAction.dispose();
        this._onDidNotification.dispose();
    }
}
// ---- Test helpers -----------------------------------------------------------
function createSession(id, opts) {
    return {
        session: AgentSession.uri(opts?.provider ?? 'copilot', id),
        startTime: opts?.startTime ?? 1000,
        modifiedTime: opts?.modifiedTime ?? 2000,
        summary: opts?.summary,
        workingDirectory: opts?.workingDirectory,
    };
}
function createProvider(disposables, connection, overrides) {
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileDialogService, {});
    instantiationService.stub(INotificationService, { error: () => { } });
    instantiationService.stub(IChatSessionsService, {
        getChatSessionContribution: () => ({ type: 'remote-test-copilot', name: 'test', displayName: 'Test', description: 'test', icon: undefined }),
        getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } }),
    });
    instantiationService.stub(IChatService, {
        acquireOrLoadSession: async () => undefined,
        sendRequest: async () => ({ kind: 'sent', data: {} }),
    });
    instantiationService.stub(IChatWidgetService, {
        openSession: async () => undefined,
    });
    instantiationService.stub(ILanguageModelsService, {
        lookupLanguageModel: () => undefined,
    });
    const config = {
        address: overrides?.address ?? 'localhost:4321',
        name: overrides !== undefined && Object.prototype.hasOwnProperty.call(overrides, 'connectionName') ? overrides.connectionName ?? '' : 'Test Host',
    };
    const provider = disposables.add(instantiationService.createInstance(RemoteAgentHostSessionsProvider, config));
    provider.setConnection(connection);
    return provider;
}
function fireSessionAdded(connection, rawId, opts) {
    const provider = opts?.provider ?? 'copilot';
    const sessionUri = AgentSession.uri(provider, rawId);
    connection.fireNotification({
        type: "notify/sessionAdded" /* NotificationType.SessionAdded */,
        summary: {
            resource: sessionUri.toString(),
            provider,
            title: opts?.title ?? `Session ${rawId}`,
            status: "idle" /* ProtocolSessionStatus.Idle */,
            createdAt: Date.now(),
            modifiedAt: Date.now(),
            workingDirectory: opts?.workingDirectory,
        },
    });
}
function fireSessionRemoved(connection, rawId, provider = 'copilot') {
    const sessionUri = AgentSession.uri(provider, rawId);
    connection.fireNotification({
        type: "notify/sessionRemoved" /* NotificationType.SessionRemoved */,
        session: sessionUri.toString(),
    });
}
suite('RemoteAgentHostSessionsProvider', () => {
    const disposables = new DisposableStore();
    let connection;
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
        const changes = [];
        disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
        fireSessionAdded(connection, 'notif-1', { title: 'Notif Session' });
        assert.strictEqual(changes.length, 1);
        assert.strictEqual(changes[0].added.length, 1);
        assert.strictEqual(changes[0].added[0].title.get(), 'Notif Session');
    });
    test('accepts session notifications from any agent provider', () => {
        const provider = createProvider(disposables, connection);
        const changes = [];
        disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
        fireSessionAdded(connection, 'other-sess', { provider: 'other-agent', title: 'Other Session' });
        assert.strictEqual(changes.length, 1);
        assert.strictEqual(changes[0].added.length, 1);
    });
    test('session removed notification removes from cache', () => {
        const provider = createProvider(disposables, connection);
        fireSessionAdded(connection, 'to-remove', { title: 'Removed' });
        const changes = [];
        disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
        fireSessionRemoved(connection, 'to-remove');
        assert.strictEqual(changes.length, 1);
        assert.strictEqual(changes[0].removed.length, 1);
    });
    test('duplicate session added notification is ignored', () => {
        const provider = createProvider(disposables, connection);
        const changes = [];
        disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
        fireSessionAdded(connection, 'dup-sess', { title: 'Dup' });
        fireSessionAdded(connection, 'dup-sess', { title: 'Dup' });
        assert.strictEqual(changes.length, 1);
    });
    test('removing non-existent session is no-op', () => {
        const provider = createProvider(disposables, connection);
        const changes = [];
        disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
        fireSessionRemoved(connection, 'does-not-exist');
        assert.strictEqual(changes.length, 0);
    });
    test('session removed notification removes session from any provider', () => {
        const provider = createProvider(disposables, connection);
        fireSessionAdded(connection, 'cross-prov', { provider: 'other-agent', title: 'Cross Provider' });
        assert.strictEqual(provider.getSessions().length, 1);
        const changes = [];
        disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
        fireSessionRemoved(connection, 'cross-prov', 'other-agent');
        assert.strictEqual(changes.length, 1);
        assert.strictEqual(changes[0].removed.length, 1);
        assert.strictEqual(provider.getSessions().length, 0);
    });
    // ---- Session listing via refresh -------
    test('getSessions populates from connection.listSessions', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        connection.addSession(createSession('list-1', { summary: 'First' }));
        connection.addSession(createSession('list-2', { summary: 'Second' }));
        const provider = createProvider(disposables, connection);
        const changes = [];
        disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
        provider.getSessions();
        await timeout(0);
        assert.ok(changes.length > 0);
        const sessions = provider.getSessions();
        assert.strictEqual(sessions.length, 2);
    }));
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
        assert.strictEqual(session.status.get(), 0 /* SessionStatus.Untitled */);
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
        await provider.deleteSession(target.sessionId);
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
        assert.strictEqual(target.isRead.get(), true);
        provider.setRead(target.sessionId, false);
        assert.strictEqual(target.isRead.get(), false);
    });
    // ---- Rename -------
    test('renameSession dispatches SessionTitleChanged action with correct session URI', async () => {
        const provider = createProvider(disposables, connection);
        fireSessionAdded(connection, 'rename-sess', { title: 'Old Title' });
        const sessions = provider.getSessions();
        const target = sessions.find((s) => s.title.get() === 'Old Title');
        assert.ok(target, 'Session should exist');
        await provider.renameChat(target.sessionId, target.resource, 'New Title');
        assert.strictEqual(connection.dispatchedActions.length, 1);
        const dispatched = connection.dispatchedActions[0];
        assert.strictEqual(dispatched.action.type, "session/titleChanged" /* ActionType.SessionTitleChanged */);
        assert.strictEqual(dispatched.action.title, 'New Title');
        // The session URI in the action must be the backend agent session URI
        const actionSession = dispatched.action.session;
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
        await provider.renameChat(target.sessionId, target.resource, 'After');
        assert.strictEqual(target.title.get(), 'After');
    });
    test('renameSession is no-op for unknown chatId', async () => {
        const provider = createProvider(disposables, connection);
        await provider.renameChat('nonexistent-id', URI.parse('test://nonexistent'), 'Ignored');
        assert.strictEqual(connection.dispatchedActions.length, 0);
    });
    test('renameSession increments clientSeq on successive calls', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        connection.addSession(createSession('seq-sess', { summary: 'Seq Test' }));
        const provider = createProvider(disposables, connection);
        provider.getSessions();
        await timeout(0);
        const sessions = provider.getSessions();
        const target = sessions.find((s) => s.title.get() === 'Seq Test');
        assert.ok(target);
        await provider.renameChat(target.sessionId, target.resource, 'Title 1');
        await provider.renameChat(target.sessionId, target.resource, 'Title 2');
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
        const changes = [];
        disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
        // Simulate the server echoing a title change (from auto-generation or another client)
        connection.fireAction({
            action: {
                type: "session/titleChanged" /* ActionType.SessionTitleChanged */,
                session: AgentSession.uri('copilot', 'echo-sess').toString(),
                title: 'Server Title',
            },
            serverSeq: 1,
            origin: undefined,
        });
        assert.strictEqual(target.title.get(), 'Server Title');
        assert.strictEqual(changes.length, 1);
        assert.strictEqual(changes[0].changed.length, 1);
    });
    test('renamed title survives session refresh from listSessions', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        });
        await timeout(0);
        sessions = provider.getSessions();
        target = sessions.find((s) => s.title.get() === 'Renamed Title');
        assert.ok(target, 'Session should have renamed title after refresh');
    }));
    // ---- Send -------
    test('sendAndCreateChat throws for unknown session', async () => {
        const provider = createProvider(disposables, connection);
        await assert.rejects(() => provider.sendAndCreateChat('nonexistent', { query: 'test' }), /not found or not a new session/);
    });
    // ---- Session data adapter -------
    test('session adapter has correct workspace from working directory', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        connection.addSession(createSession('ws-sess', { summary: 'WS Test', workingDirectory: URI.parse('vscode-agent-host://localhost__4321/file/-/home/user/myrepo') }));
        const provider = createProvider(disposables, connection);
        provider.getSessions();
        await timeout(0);
        const sessions = provider.getSessions();
        const wsSession = sessions.find((s) => s.title.get() === 'WS Test');
        assert.ok(wsSession, 'Session with working directory should exist');
        const workspace = wsSession.workspace.get();
        assert.ok(workspace, 'Workspace should be populated');
        assert.strictEqual(workspace.label, 'myrepo [Test Host]');
    }));
    test('session adapter without working directory has no workspace', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        connection.addSession(createSession('no-ws-sess', { summary: 'No WS' }));
        const provider = createProvider(disposables, connection);
        provider.getSessions();
        await timeout(0);
        const sessions = provider.getSessions();
        const session = sessions.find((s) => s.title.get() === 'No WS');
        assert.ok(session, 'Session should exist');
        assert.strictEqual(session.workspace.get(), undefined);
    }));
    test('session adapter uses raw ID as fallback title', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('turnComplete action triggers session refresh for matching provider', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        connection.addSession(createSession('turn-sess', { summary: 'Before', modifiedTime: 1000 }));
        const provider = createProvider(disposables, connection);
        provider.getSessions();
        await timeout(0);
        // Update on connection side
        connection.addSession(createSession('turn-sess', { summary: 'After', modifiedTime: 5000 }));
        const changes = [];
        disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
        connection.fireAction({
            action: {
                type: 'session/turnComplete',
                session: AgentSession.uri('copilot', 'turn-sess').toString(),
            },
            serverSeq: 1,
            origin: undefined,
        });
        await timeout(0);
        assert.ok(changes.length > 0);
        const updatedSession = provider.getSessions().find((s) => s.title.get() === 'After');
        assert.ok(updatedSession, 'Session should have updated title');
    }));
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
        const types = provider.getSessionTypes(session.sessionId);
        assert.strictEqual(types.length, 1);
    });
    // ---- sessionType on adapters -------
    test('session adapter uses logical session type, not resource scheme', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        connection.addSession(createSession('type-sess', { summary: 'Type Test' }));
        const provider = createProvider(disposables, connection);
        provider.getSessions();
        await timeout(0);
        const sessions = provider.getSessions();
        const session = sessions.find((s) => s.title.get() === 'Type Test');
        assert.ok(session, 'Session should exist');
        // sessionType should be the logical type (agent-host-copilot), not the resource scheme
        assert.strictEqual(session.sessionType, provider.sessionTypes[0].id);
    }));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9yZW1vdGVBZ2VudEhvc3QvdGVzdC9icm93c2VyL3JlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDNUYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLFlBQVksRUFBcUQsTUFBTSwwREFBMEQsQ0FBQztBQUszSSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN2RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsWUFBWSxFQUF1QixNQUFNLHlFQUF5RSxDQUFDO0FBQzVILE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxN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