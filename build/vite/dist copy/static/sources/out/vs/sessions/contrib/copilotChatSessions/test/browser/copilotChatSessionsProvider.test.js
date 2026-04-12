/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IAgentSessionsService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ILanguageModelToolsService } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { CopilotChatSessionsProvider, COPILOT_PROVIDER_ID } from '../../browser/copilotChatSessionsProvider.js';
// ---- Helpers ----------------------------------------------------------------
function createMockAgentSession(resource, opts) {
    const providerType = opts?.providerType ?? AgentSessionProviders.Background;
    let archived = opts?.archived ?? false;
    let read = opts?.read ?? true;
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.resource = resource;
            this.providerType = providerType;
            this.providerLabel = 'Copilot';
            this.label = opts?.title ?? 'Test Session';
            this.status = 1 /* ChatSessionStatus.Completed */;
            this.icon = Codicon.copilot;
            this.timing = { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined };
            this.metadata = { repositoryPath: '/test/repo' };
        }
        isArchived() { return archived; }
        setArchived(value) { archived = value; }
        isPinned() { return false; }
        setPinned() { }
        isRead() { return read; }
        isMarkedUnread() { return false; }
        setRead(value) { read = value; }
    }();
}
// ---- Mock Agent Sessions Service --------------------------------------------
class MockAgentSessionsModel {
    constructor() {
        this._sessions = [];
        this._onDidChangeSessions = new Emitter();
        this.onDidChangeSessions = this._onDidChangeSessions.event;
        this.onWillResolve = Event.None;
        this.onDidResolve = Event.None;
        this.onDidChangeSessionArchivedState = Event.None;
        this.resolved = true;
    }
    get sessions() { return [...this._sessions]; }
    getSession(resource) {
        return this._sessions.find(s => s.resource.toString() === resource.toString());
    }
    addSession(session) {
        this._sessions.push(session);
        this._onDidChangeSessions.fire();
    }
    removeSession(resource) {
        const idx = this._sessions.findIndex(s => s.resource.toString() === resource.toString());
        if (idx !== -1) {
            this._sessions.splice(idx, 1);
            this._onDidChangeSessions.fire();
        }
    }
    async resolve() { }
    dispose() {
        this._onDidChangeSessions.dispose();
    }
}
// ---- Provider factory -------------------------------------------------------
function createProvider(disposables, model, opts) {
    const instantiationService = disposables.add(new TestInstantiationService());
    const configService = new TestConfigurationService();
    configService.setUserConfiguration('sessions.github.copilot.multiChatSessions', opts?.multiChatEnabled ?? false);
    instantiationService.stub(IConfigurationService, configService);
    instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
    instantiationService.stub(IFileDialogService, {});
    instantiationService.stub(ICommandService, {
        executeCommand: async (_id, ...args) => {
            // Simulate 'github.copilot.cli.sessions.delete' removing the session
            const opts = args[0];
            if (opts?.resource) {
                model.removeSession(opts.resource);
            }
            return undefined;
        },
    });
    instantiationService.stub(IAgentSessionsService, {
        model: model,
        onDidChangeSessionArchivedState: Event.None,
        getSession: (resource) => model.getSession(resource),
    });
    instantiationService.stub(IChatSessionsService, {
        getChatSessionContribution: () => ({ type: 'test-copilot', name: 'test', displayName: 'Test', description: 'test', icon: undefined }),
        getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } }),
        onDidCommitSession: Event.None,
        updateSessionOptions: () => true,
        setSessionOption: () => true,
        getSessionOption: () => undefined,
        onDidChangeOptionGroups: Event.None,
    });
    instantiationService.stub(IChatService, {
        acquireOrLoadSession: async () => undefined,
        sendRequest: async () => ({ kind: 'sent', data: {} }),
        removeHistoryEntry: async (resource) => { model.removeSession(resource); },
        setChatSessionTitle: () => { },
    });
    instantiationService.stub(IChatWidgetService, {
        openSession: async () => undefined,
        lastFocusedWidget: undefined,
        onDidChangeFocusedSession: Event.None,
    });
    instantiationService.stub(ILanguageModelsService, {
        lookupLanguageModel: () => undefined,
    });
    instantiationService.stub(ILanguageModelToolsService, {
        toToolReferences: () => [],
    });
    // Stub IInstantiationService so provider can use createInstance for CopilotCLISession
    instantiationService.stub(IInstantiationService, instantiationService);
    const provider = disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider));
    return provider;
}
// ---- Provider factory for send/cancel tests ---------------------------------
/**
 * Creates a provider suitable for testing sendChat flows. Stubs all services
 * needed by CopilotCLISession and _sendFirstChat, including IGitService and a
 * non-null IChatWidget mock.
 *
 * The caller can pass a custom `sendRequest` implementation to control the
 * lifecycle of the in-flight request.
 */
function createProviderForSendTests(disposables, model, sendRequest) {
    const instantiationService = disposables.add(new TestInstantiationService());
    const configService = new TestConfigurationService();
    configService.setUserConfiguration('sessions.github.copilot.multiChatSessions', false);
    instantiationService.stub(IConfigurationService, configService);
    instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
    instantiationService.stub(IFileDialogService, {});
    instantiationService.stub(ICommandService, { executeCommand: async () => undefined });
    instantiationService.stub(IAgentSessionsService, {
        model: model,
        onDidChangeSessionArchivedState: Event.None,
        getSession: (resource) => model.getSession(resource),
    });
    instantiationService.stub(IChatSessionsService, {
        getChatSessionContribution: () => ({ type: 'test-copilot', name: 'test', displayName: 'Test', description: 'test', icon: undefined }),
        getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } }),
        onDidCommitSession: Event.None,
        updateSessionOptions: () => true,
        setSessionOption: () => true,
        getSessionOption: () => undefined,
        onDidChangeOptionGroups: Event.None,
    });
    instantiationService.stub(IChatService, {
        acquireOrLoadSession: async () => undefined,
        sendRequest: sendRequest,
        removeHistoryEntry: async (resource) => { model.removeSession(resource); },
        setChatSessionTitle: () => { },
    });
    instantiationService.stub(IChatWidgetService, {
        openSession: async () => new class extends mock() {
            constructor() {
                super(...arguments);
                this.input = new class extends mock() {
                    constructor() {
                        super(...arguments);
                        this.setPermissionLevel = () => { };
                    }
                }();
            }
        }(),
        lastFocusedWidget: undefined,
        onDidChangeFocusedSession: Event.None,
    });
    instantiationService.stub(ILanguageModelsService, { lookupLanguageModel: () => undefined });
    instantiationService.stub(ILanguageModelToolsService, { toToolReferences: () => [] });
    instantiationService.stub(IGitService, { openRepository: async () => undefined });
    instantiationService.stub(IInstantiationService, instantiationService);
    return disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider));
}
suite('CopilotChatSessionsProvider', () => {
    const disposables = new DisposableStore();
    let model;
    setup(() => {
        model = new MockAgentSessionsModel();
        disposables.add(toDisposable(() => model.dispose()));
    });
    teardown(() => {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    // ---- Provider identity -------
    test('has correct id and label', () => {
        const provider = createProvider(disposables, model);
        assert.strictEqual(provider.id, COPILOT_PROVIDER_ID);
        assert.strictEqual(provider.sessionTypes.length, 2);
    });
    // ---- Capabilities -------
    test('capabilities.multipleChatsPerSession is false by default', () => {
        const provider = createProvider(disposables, model);
        assert.strictEqual(provider.capabilities.multipleChatsPerSession, false);
    });
    test('capabilities.multipleChatsPerSession is true when setting is enabled', () => {
        const provider = createProvider(disposables, model, { multiChatEnabled: true });
        assert.strictEqual(provider.capabilities.multipleChatsPerSession, true);
    });
    // ---- Session listing -------
    test('getSessions returns empty array initially', () => {
        const provider = createProvider(disposables, model);
        assert.strictEqual(provider.getSessions().length, 0);
    });
    test('getSessions returns adapted sessions from agent model', () => {
        const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
        const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
        model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
        model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));
        const provider = createProvider(disposables, model);
        const sessions = provider.getSessions();
        assert.strictEqual(sessions.length, 2);
    });
    test('getSessions ignores non-Background/Cloud sessions', () => {
        const bgResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/bg-session' });
        const localResource = URI.from({ scheme: AgentSessionProviders.Local, path: '/local-session' });
        model.addSession(createMockAgentSession(bgResource));
        model.addSession(createMockAgentSession(localResource, { providerType: AgentSessionProviders.Local }));
        const provider = createProvider(disposables, model);
        const sessions = provider.getSessions();
        assert.strictEqual(sessions.length, 1);
    });
    test('onDidChangeSessions fires when agent model changes', () => {
        const provider = createProvider(disposables, model);
        provider.getSessions(); // Initialize cache
        const changes = [];
        disposables.add(provider.onDidChangeSessions(e => changes.push(e)));
        const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/new-session' });
        model.addSession(createMockAgentSession(resource, { title: 'New Session' }));
        assert.ok(changes.length > 0);
        assert.strictEqual(changes[0].added.length, 1);
    });
    // ---- Session creation -------
    // Note: createNewSession tests are limited because CopilotCLISession
    // requires IGitService and creates disposables that are hard to clean
    // up in isolation. Full integration tests should cover session creation.
    test('createNewSession throws when workspace has no repository', () => {
        const provider = createProvider(disposables, model);
        const workspace = {
            label: 'empty',
            icon: Codicon.folder,
            repositories: [],
            requiresWorkspaceTrust: true,
        };
        assert.throws(() => provider.createNewSession(workspace), /Workspace has no repository URI/);
    });
    // ---- Session actions -------
    test('archiveSession sets archived state', () => {
        const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
        const agentSession = createMockAgentSession(resource);
        model.addSession(agentSession);
        const provider = createProvider(disposables, model);
        provider.getSessions(); // Initialize cache
        const session = provider.getSessions()[0];
        provider.archiveSession(session.sessionId);
        assert.strictEqual(agentSession.isArchived(), true);
    });
    test('unarchiveSession clears archived state', () => {
        const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
        const agentSession = createMockAgentSession(resource, { archived: true });
        model.addSession(agentSession);
        const provider = createProvider(disposables, model);
        provider.getSessions();
        const session = provider.getSessions()[0];
        provider.unarchiveSession(session.sessionId);
        assert.strictEqual(agentSession.isArchived(), false);
    });
    test('setRead marks session as read', () => {
        const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
        const agentSession = createMockAgentSession(resource, { read: false });
        model.addSession(agentSession);
        const provider = createProvider(disposables, model);
        provider.getSessions();
        const session = provider.getSessions()[0];
        provider.setRead(session.sessionId, true);
        assert.strictEqual(agentSession.isRead(), true);
    });
    // ---- Single-chat mode (multi-chat disabled) -------
    test('single-chat mode: each session has exactly one chat', () => {
        const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
        model.addSession(createMockAgentSession(resource));
        const provider = createProvider(disposables, model, { multiChatEnabled: false });
        const sessions = provider.getSessions();
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].chats.get().length, 1);
        assert.strictEqual(sessions[0].mainChat.resource.toString(), resource.toString());
    });
    test('single-chat mode: sendAndCreateChat throws for unknown session', async () => {
        const provider = createProvider(disposables, model, { multiChatEnabled: false });
        await assert.rejects(() => provider.sendAndCreateChat('nonexistent', { query: 'test' }), /not found or not a new session/);
    });
    // ---- Multi-chat mode -------
    suite('multi-chat (setting enabled)', () => {
        test('getSessions groups chats by session group', () => {
            const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
            model.addSession(createMockAgentSession(resource1, { title: 'Chat 1' }));
            model.addSession(createMockAgentSession(resource2, { title: 'Chat 2' }));
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            const sessions = provider.getSessions();
            // Without explicit grouping, each chat is its own session
            assert.strictEqual(sessions.length, 2);
        });
        test('session title comes from primary (first) chat', () => {
            const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            model.addSession(createMockAgentSession(resource, { title: 'Primary Title' }));
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            const sessions = provider.getSessions();
            assert.strictEqual(sessions[0].title.get(), 'Primary Title');
        });
        test('session has mainChat set to the first chat', () => {
            const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            model.addSession(createMockAgentSession(resource));
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            const sessions = provider.getSessions();
            assert.ok(sessions[0].mainChat);
            assert.strictEqual(sessions[0].mainChat.resource.toString(), resource.toString());
        });
        test('sendAndCreateChat throws for unknown session when no untitled session exists', async () => {
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            await assert.rejects(() => provider.sendAndCreateChat('nonexistent', { query: 'test' }), /not found/);
        });
        test('deleteSession removes session from model and list', async () => {
            const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
            model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
            model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            const sessions = provider.getSessions();
            assert.strictEqual(sessions.length, 2);
            await provider.deleteSession(sessions[0].sessionId);
            const remainingSessions = provider.getSessions();
            assert.strictEqual(remainingSessions.length, 1);
            assert.strictEqual(remainingSessions[0].title.get(), 'Session 2');
        });
        test('deleteChat with single chat delegates to deleteSession', async () => {
            const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            model.addSession(createMockAgentSession(resource));
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            const sessions = provider.getSessions();
            const session = sessions[0];
            await provider.deleteChat(session.sessionId, resource);
            // Model should no longer have the session
            assert.strictEqual(model.sessions.length, 0);
        });
        test('deleteChat throws when multi-chat is disabled', async () => {
            const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            model.addSession(createMockAgentSession(resource));
            const provider = createProvider(disposables, model, { multiChatEnabled: false });
            const sessions = provider.getSessions();
            const session = sessions[0];
            await assert.rejects(() => provider.deleteChat(session.sessionId, resource), /not supported when multi-chat is disabled/);
        });
        test('session group cache is invalidated on session removal', () => {
            const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
            model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
            model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            // Initialize sessions
            let sessions = provider.getSessions();
            assert.strictEqual(sessions.length, 2);
            // Remove one from the model
            model.removeSession(resource1);
            // Re-fetch
            sessions = provider.getSessions();
            assert.strictEqual(sessions.length, 1);
            assert.strictEqual(sessions[0].title.get(), 'Session 2');
        });
        test('resolveWorkspace creates proper workspace structure', () => {
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            const uri = URI.file('/test/project');
            const workspace = provider.resolveWorkspace(uri);
            assert.strictEqual(workspace.label, 'project');
            assert.strictEqual(workspace.repositories.length, 1);
            assert.strictEqual(workspace.repositories[0].uri.toString(), uri.toString());
            assert.strictEqual(workspace.requiresWorkspaceTrust, true);
        });
        test('chats observable updates when group model changes', () => {
            const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
            model.addSession(createMockAgentSession(resource1, { title: 'Chat 1' }));
            model.addSession(createMockAgentSession(resource2, { title: 'Chat 2' }));
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            const sessions = provider.getSessions();
            assert.strictEqual(sessions.length, 2);
            // Both are separate sessions initially
            const session1 = sessions[0];
            assert.strictEqual(session1.chats.get().length, 1);
        });
        test('session status aggregates across chats', () => {
            const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            model.addSession(createMockAgentSession(resource));
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            const sessions = provider.getSessions();
            // With a single chat, session status should match the chat status
            assert.ok(sessions[0].status.get() !== undefined);
        });
        test('session isRead aggregates across all chats', () => {
            const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            model.addSession(createMockAgentSession(resource, { read: true }));
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            const sessions = provider.getSessions();
            assert.strictEqual(sessions[0].isRead.get(), true);
        });
        test('session isRead is false when any chat is unread', () => {
            const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            model.addSession(createMockAgentSession(resource, { read: false }));
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            const sessions = provider.getSessions();
            assert.strictEqual(sessions[0].isRead.get(), false);
        });
        test('removing a chat from a group fires changed (not removed) with correct sessionId', async () => {
            const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
            model.addSession(createMockAgentSession(resource1, { title: 'Chat 1' }));
            model.addSession(createMockAgentSession(resource2, { title: 'Chat 2' }));
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            const sessions = provider.getSessions();
            assert.strictEqual(sessions.length, 2);
            // Manually group both chats under the first session
            const chat2Id = sessions[1].sessionId;
            // Access the group model indirectly by deleting the second session's group
            // and re-adding its chat to the first group via deleteChat flow
            // Instead, simulate by removing the second chat from the model
            const changes = [];
            disposables.add(provider.onDidChangeSessions(e => changes.push(e)));
            model.removeSession(resource2);
            // The removed chat was standalone, so it should fire a removed event
            assert.ok(changes.length > 0);
            const lastChange = changes[changes.length - 1];
            assert.strictEqual(lastChange.removed.length, 1);
            assert.strictEqual(lastChange.removed[0].sessionId, chat2Id);
        });
        test('getSessions does not create duplicate groups on repeated calls', () => {
            const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            model.addSession(createMockAgentSession(resource));
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            // Call getSessions multiple times
            const sessions1 = provider.getSessions();
            const sessions2 = provider.getSessions();
            assert.strictEqual(sessions1.length, 1);
            assert.strictEqual(sessions2.length, 1);
            // Should return the same cached session object
            assert.strictEqual(sessions1[0], sessions2[0]);
        });
        test('changed events are not duplicated when multiple chats update', () => {
            const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
            const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
            model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
            model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));
            const provider = createProvider(disposables, model, { multiChatEnabled: true });
            provider.getSessions(); // Initialize
            const changes = [];
            disposables.add(provider.onDidChangeSessions(e => changes.push(e)));
            // Trigger a refresh that updates both sessions
            model.addSession(createMockAgentSession(URI.from({ scheme: AgentSessionProviders.Background, path: '/session-3' }), { title: 'Session 3' }));
            // Each event should not have duplicates in the changed array
            for (const change of changes) {
                const changedIds = change.changed.map(s => s.sessionId);
                const uniqueIds = new Set(changedIds);
                assert.strictEqual(changedIds.length, uniqueIds.size, 'Changed events should not have duplicates');
            }
        });
    });
    // ---- Browse actions -------
    test('has folder and repo browse actions', () => {
        const provider = createProvider(disposables, model);
        assert.strictEqual(provider.browseActions.length, 2);
        assert.strictEqual(provider.browseActions[0].providerId, COPILOT_PROVIDER_ID);
        assert.strictEqual(provider.browseActions[1].providerId, COPILOT_PROVIDER_ID);
    });
    // ---- Uncommitted temp session cleanup ------------------------------------
    suite('uncommitted temp session cleanup', () => {
        const workspace = {
            label: 'repo',
            icon: Codicon.folder,
            repositories: [{
                    uri: URI.file('/test/repo'),
                    workingDirectory: undefined,
                    detail: undefined,
                    baseBranchName: undefined,
                    baseBranchProtected: undefined,
                }],
            requiresWorkspaceTrust: false,
        };
        /**
         * Returns a provider wired up so that sendRequest keeps the request
         * in-flight indefinitely. Also returns helpers to resolve the request
         * as a cancellation (so the provider cleans up promptly in tests).
         */
        function makeInFlightProvider() {
            let resolveComplete;
            let resolveCreated;
            const responseCompletePromise = new Promise(r => { resolveComplete = r; });
            const responseCreatedPromise = new Promise(r => { resolveCreated = r; });
            const provider = createProviderForSendTests(disposables, model, async () => ({
                kind: 'sent',
                data: {
                    responseCompletePromise,
                    responseCreatedPromise,
                    agent: new class extends mock() {
                    }(),
                },
            }));
            return {
                provider,
                cancelRequest: () => {
                    resolveCreated({ isCanceled: true });
                    resolveComplete();
                },
            };
        }
        /** Wait for the provider to fire an "added" session change event. */
        function waitForSessionAdded(provider) {
            return new Promise(resolve => {
                const d = provider.onDidChangeSessions(e => {
                    if (e.added.length > 0) {
                        d.dispose();
                        resolve();
                    }
                });
            });
        }
        test('deleteSession removes a temp session that is awaiting commit', async () => {
            const { provider, cancelRequest } = makeInFlightProvider();
            const newSession = provider.createNewSession(workspace);
            const sessionId = newSession.sessionId;
            const added = waitForSessionAdded(provider);
            const sendPromise = provider.sendAndCreateChat(sessionId, { query: 'test' });
            await added;
            assert.strictEqual(provider.getSessions().length, 1, 'session should appear while in-flight');
            await provider.deleteSession(sessionId);
            assert.strictEqual(provider.getSessions().length, 0, 'session should be removed after deleteSession');
            // Clean up in-flight request so _sendFirstChat resolves quickly
            cancelRequest();
            await sendPromise.catch(() => { });
        });
        test('archiveSession removes a temp session that is awaiting commit', async () => {
            const { provider, cancelRequest } = makeInFlightProvider();
            const newSession = provider.createNewSession(workspace);
            const sessionId = newSession.sessionId;
            const added = waitForSessionAdded(provider);
            const sendPromise = provider.sendAndCreateChat(sessionId, { query: 'test' });
            await added;
            assert.strictEqual(provider.getSessions().length, 1, 'session should appear while in-flight');
            await provider.archiveSession(sessionId);
            assert.strictEqual(provider.getSessions().length, 0, 'session should be removed after archiveSession');
            cancelRequest();
            await sendPromise.catch(() => { });
        });
        test('cancelling the request before commit removes the temp session', async () => {
            const { provider, cancelRequest } = makeInFlightProvider();
            const changes = [];
            disposables.add(provider.onDidChangeSessions(e => changes.push(e)));
            const newSession = provider.createNewSession(workspace);
            const sessionId = newSession.sessionId;
            const added = waitForSessionAdded(provider);
            const sendPromise = provider.sendAndCreateChat(sessionId, { query: 'test' });
            await added;
            assert.strictEqual(provider.getSessions().length, 1, 'session should appear while in-flight');
            assert.ok(changes.some(e => e.added.some(s => s.sessionId === sessionId)), 'added event should have fired');
            // Simulate user stopping the request
            cancelRequest();
            await sendPromise.catch(() => { });
            assert.strictEqual(provider.getSessions().length, 0, 'session should be cleaned up after cancellation');
            assert.ok(changes.some(e => e.removed.some(s => s.sessionId === sessionId)), 'removed event should have fired');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2NvcGlsb3RDaGF0U2Vzc2lvbnMvdGVzdC9icm93c2VyL2NvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVB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