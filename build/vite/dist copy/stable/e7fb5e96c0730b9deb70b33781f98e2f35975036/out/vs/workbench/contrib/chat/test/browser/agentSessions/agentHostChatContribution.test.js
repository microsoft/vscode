/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../../base/common/async.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IAgentHostService, AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import { createSessionState, createActiveTurn, ROOT_STATE_URI } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { IChatService, IChatToolInvocation } from '../../../common/chatService/chatService.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { AgentHostContribution, AgentHostSessionListController, AgentHostSessionHandler } from '../../../browser/agentSessions/agentHost/agentHostChatContribution.js';
import { AgentHostLanguageModelProvider } from '../../../browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestFileService } from '../../../../../test/common/workbenchTestServices.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { MockLabelService } from '../../../../../services/label/test/common/mockLabelService.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IStorageService, InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
// ---- Mock agent host service ------------------------------------------------
class MockAgentHostService extends mock() {
    constructor() {
        super(...arguments);
        this._onDidAction = new Emitter();
        this.onDidAction = this._onDidAction.event;
        this._onDidNotification = new Emitter();
        this.onDidNotification = this._onDidNotification.event;
        this.onAgentHostExit = Event.None;
        this.onAgentHostStart = Event.None;
        this._nextId = 1;
        this._sessions = new Map();
        this.createSessionCalls = [];
        this.disposedSessions = [];
        this.agents = [{ provider: 'copilot', displayName: 'Agent Host - Copilot', description: 'test', requiresAuth: true }];
        // Protocol methods
        this.clientId = 'test-window-1';
        this.dispatchedActions = [];
        this.sessionStates = new Map();
        this._nextSeq = 1;
    }
    async listSessions() {
        return [...this._sessions.values()];
    }
    async listAgents() {
        return this.agents;
    }
    async refreshModels() { }
    async createSession(config) {
        if (config) {
            this.createSessionCalls.push(config);
        }
        const id = `sdk-session-${this._nextId++}`;
        const session = AgentSession.uri('copilot', id);
        this._sessions.set(id, { session, startTime: Date.now(), modifiedTime: Date.now() });
        return session;
    }
    async disposeSession(session) { this.disposedSessions.push(session); }
    async shutdown() { }
    async restartAgentHost() { }
    /** Returns dispatched actions filtered to turn-related types only
     *  (excludes lifecycle actions like activeClientChanged). */
    get turnActions() {
        return this.dispatchedActions.filter(d => d.action.type === 'session/turnStarted');
    }
    async subscribe(resource) {
        const resourceStr = resource.toString();
        const existingState = this.sessionStates.get(resourceStr);
        if (existingState) {
            return { resource: resourceStr, state: existingState, fromSeq: 0 };
        }
        // Root state subscription
        if (resourceStr === ROOT_STATE_URI) {
            return {
                resource: resourceStr,
                state: {
                    agents: this.agents.map(a => ({ provider: a.provider, displayName: a.displayName, description: a.description, models: [] })),
                    activeSessions: 0
                },
                fromSeq: 0,
            };
        }
        const summary = {
            resource: resourceStr,
            provider: 'copilot',
            title: 'Test',
            status: "idle" /* SessionStatus.Idle */,
            createdAt: Date.now(),
            modifiedAt: Date.now(),
        };
        return {
            resource: resourceStr,
            state: { ...createSessionState(summary), lifecycle: "ready" /* SessionLifecycle.Ready */ },
            fromSeq: 0,
        };
    }
    unsubscribe(_resource) { }
    dispatchAction(action, clientId, clientSeq) {
        this.dispatchedActions.push({ action, clientId, clientSeq });
    }
    nextClientSeq() {
        return this._nextSeq++;
    }
    // Test helpers
    fireAction(envelope) {
        this._onDidAction.fire(envelope);
    }
    addSession(meta) {
        this._sessions.set(AgentSession.id(meta.session), meta);
    }
    dispose() {
        this._onDidAction.dispose();
        this._onDidNotification.dispose();
    }
}
// ---- Minimal service mocks --------------------------------------------------
class MockChatAgentService extends mock() {
    constructor() {
        super(...arguments);
        this.registeredAgents = new Map();
    }
    registerDynamicAgent(data, agentImpl) {
        this.registeredAgents.set(data.id, { data, impl: agentImpl });
        return toDisposable(() => this.registeredAgents.delete(data.id));
    }
}
// ---- Helpers ----------------------------------------------------------------
function createTestServices(disposables) {
    const instantiationService = disposables.add(new TestInstantiationService());
    const agentHostService = new MockAgentHostService();
    disposables.add(toDisposable(() => agentHostService.dispose()));
    const chatAgentService = new MockChatAgentService();
    instantiationService.stub(IAgentHostService, agentHostService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IProductService, { quality: 'insider' });
    instantiationService.stub(IChatAgentService, chatAgentService);
    instantiationService.stub(IFileService, TestFileService);
    instantiationService.stub(ILabelService, MockLabelService);
    instantiationService.stub(IChatSessionsService, {
        registerChatSessionItemController: () => toDisposable(() => { }),
        registerChatSessionContentProvider: () => toDisposable(() => { }),
        registerChatSessionContribution: () => toDisposable(() => { }),
    });
    instantiationService.stub(IDefaultAccountService, { onDidChangeDefaultAccount: Event.None, getDefaultAccount: async () => null });
    instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None });
    instantiationService.stub(ILanguageModelsService, {
        deltaLanguageModelChatProviderDescriptors: () => { },
        registerLanguageModelProvider: () => toDisposable(() => { }),
    });
    instantiationService.stub(IConfigurationService, { getValue: () => true });
    instantiationService.stub(IOutputService, { getChannel: () => undefined });
    instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => ({ id: '', folders: [] }), getWorkspaceFolder: () => null });
    instantiationService.stub(IChatEditingService, {
        registerEditingSessionProvider: () => toDisposable(() => { }),
    });
    instantiationService.stub(IChatService, {
        getSession: () => undefined,
        onDidCreateModel: Event.None,
        removePendingRequest: () => { },
    });
    instantiationService.stub(IAgentHostFileSystemService, {
        registerAuthority: () => toDisposable(() => { }),
        ensureSyncedCustomizationProvider: () => { },
    });
    instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
    instantiationService.stub(ICustomizationHarnessService, {
        registerExternalHarness: () => toDisposable(() => { }),
    });
    instantiationService.stub(IAgentPluginService, {
        plugins: observableValue('plugins', []),
    });
    return { instantiationService, agentHostService, chatAgentService };
}
function createContribution(disposables) {
    const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);
    const listController = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-copilot', 'copilot', agentHostService, undefined));
    const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
        provider: 'copilot',
        agentId: 'agent-host-copilot',
        sessionType: 'agent-host-copilot',
        fullName: 'Agent Host - Copilot',
        description: 'Copilot SDK agent running in a dedicated process',
        connection: agentHostService,
        connectionAuthority: 'local',
    }));
    const contribution = disposables.add(instantiationService.createInstance(AgentHostContribution));
    return { contribution, listController, sessionHandler, agentHostService, chatAgentService };
}
function makeRequest(overrides = {}) {
    return upcastPartial({
        sessionResource: overrides.sessionResource ?? URI.from({ scheme: 'untitled', path: '/chat-1' }),
        requestId: 'req-1',
        agentId: 'agent-host-copilot',
        message: overrides.message ?? 'Hello',
        variables: overrides.variables ?? { variables: [] },
        location: ChatAgentLocation.Chat,
        userSelectedModelId: overrides.userSelectedModelId,
    });
}
/** Extract the text value from a string or IMarkdownString. */
function textOf(value) {
    if (value === undefined) {
        return undefined;
    }
    return typeof value === 'string' ? value : value.value;
}
/**
 * Start a turn through the state-driven flow. Creates a chat session,
 * starts the requestHandler (non-blocking), and waits for the first action
 * to be dispatched. Returns helpers to fire server action envelopes.
 */
async function startTurn(sessionHandler, agentHostService, ds, overrides) {
    const sessionResource = overrides?.sessionResource ?? URI.from({ scheme: 'agent-host-copilot', path: '/untitled-turntest' });
    const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
    ds.add(toDisposable(() => chatSession.dispose()));
    // Clear any lifecycle actions (e.g. activeClientChanged from customization setup)
    // so tests only see turn-related dispatches.
    agentHostService.dispatchedActions.length = 0;
    const collected = [];
    const seq = { v: 1 };
    const turnPromise = chatSession.requestHandler(makeRequest({
        message: overrides?.message ?? 'Hello',
        sessionResource,
        variables: overrides?.variables,
        userSelectedModelId: overrides?.userSelectedModelId,
    }), (parts) => collected.push(parts), [], overrides?.cancellationToken ?? CancellationToken.None);
    await timeout(10);
    // Filter for turn-related dispatches only (skip activeClientChanged etc.)
    const turnDispatches = agentHostService.dispatchedActions.filter(d => d.action.type === 'session/turnStarted');
    const lastDispatch = turnDispatches[turnDispatches.length - 1] ?? agentHostService.dispatchedActions[agentHostService.dispatchedActions.length - 1];
    const session = lastDispatch?.action?.session;
    const turnId = lastDispatch?.action?.turnId;
    const fire = (action) => {
        agentHostService.fireAction({ action, serverSeq: seq.v++, origin: undefined });
    };
    // Echo the turnStarted action to clear the pending write-ahead entry.
    // Without this, the optimistic state replay would re-add activeTurn after
    // the server's turnComplete clears it, preventing the turn from finishing.
    if (lastDispatch) {
        agentHostService.fireAction({
            action: lastDispatch.action,
            serverSeq: seq.v++,
            origin: { clientId: agentHostService.clientId, clientSeq: lastDispatch.clientSeq },
        });
    }
    return { turnPromise, collected, chatSession, session, turnId, fire };
}
suite('AgentHostChatContribution', () => {
    const disposables = new DisposableStore();
    teardown(() => disposables.clear());
    ensureNoDisposablesAreLeakedInTestSuite();
    // ---- Registration ---------------------------------------------------
    suite('registration', () => {
        test('registers agent', () => {
            const { chatAgentService } = createContribution(disposables);
            assert.ok(chatAgentService.registeredAgents.has('agent-host-copilot'));
        });
    });
    // ---- Session list (IChatSessionItemController) ----------------------
    suite('session list', () => {
        test('refresh populates items from agent host', async () => {
            const { listController, agentHostService } = createContribution(disposables);
            agentHostService.addSession({ session: AgentSession.uri('copilot', 'aaa'), startTime: 1000, modifiedTime: 2000, summary: 'My session' });
            agentHostService.addSession({ session: AgentSession.uri('copilot', 'bbb'), startTime: 3000, modifiedTime: 4000 });
            await listController.refresh(CancellationToken.None);
            assert.strictEqual(listController.items.length, 2);
            assert.strictEqual(listController.items[0].label, 'My session');
            assert.strictEqual(listController.items[1].label, 'Session bbb');
            assert.strictEqual(listController.items[0].resource.scheme, 'agent-host-copilot');
            assert.strictEqual(listController.items[0].resource.path, '/aaa');
        });
        test('refresh fires onDidChangeChatSessionItems', async () => {
            const { listController, agentHostService } = createContribution(disposables);
            let fired = false;
            disposables.add(listController.onDidChangeChatSessionItems(() => { fired = true; }));
            agentHostService.addSession({ session: AgentSession.uri('copilot', 'x'), startTime: 1000, modifiedTime: 2000 });
            await listController.refresh(CancellationToken.None);
            assert.ok(fired);
        });
        test('refresh handles error gracefully', async () => {
            const { listController, agentHostService } = createContribution(disposables);
            agentHostService.listSessions = async () => { throw new Error('fail'); };
            await listController.refresh(CancellationToken.None);
            assert.strictEqual(listController.items.length, 0);
        });
    });
    // ---- Session ID resolution in _invokeAgent --------------------------
    suite('session ID resolution', () => {
        test('creates new SDK session for untitled resource', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, { message: 'Hello' });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(agentHostService.turnActions.length, 1);
            assert.strictEqual(agentHostService.turnActions[0].action.type, 'session/turnStarted');
            assert.strictEqual(agentHostService.turnActions[0].action.userMessage.text, 'Hello');
            assert.ok(AgentSession.id(URI.parse(session)).startsWith('sdk-session-'));
        }));
        test('reuses SDK session for same resource on second message', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const resource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-reuse' });
            const chatSession = await sessionHandler.provideChatSessionContent(resource, CancellationToken.None);
            disposables.add(toDisposable(() => chatSession.dispose()));
            // Clear lifecycle actions so only turn dispatches are counted
            agentHostService.dispatchedActions.length = 0;
            // First turn
            const turn1Promise = chatSession.requestHandler(makeRequest({ message: 'First', sessionResource: resource }), () => { }, [], CancellationToken.None);
            await timeout(10);
            const dispatch1 = agentHostService.turnActions[0];
            const action1 = dispatch1.action;
            // Echo the turnStarted to clear pending write-ahead
            agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
            agentHostService.fireAction({ action: { type: 'session/turnComplete', session: action1.session, turnId: action1.turnId }, serverSeq: 2, origin: undefined });
            await turn1Promise;
            // Second turn
            const turn2Promise = chatSession.requestHandler(makeRequest({ message: 'Second', sessionResource: resource }), () => { }, [], CancellationToken.None);
            await timeout(10);
            const dispatch2 = agentHostService.turnActions[1];
            const action2 = dispatch2.action;
            agentHostService.fireAction({ action: dispatch2.action, serverSeq: 3, origin: { clientId: agentHostService.clientId, clientSeq: dispatch2.clientSeq } });
            agentHostService.fireAction({ action: { type: 'session/turnComplete', session: action2.session, turnId: action2.turnId }, serverSeq: 4, origin: undefined });
            await turn2Promise;
            assert.strictEqual(agentHostService.turnActions.length, 2);
            assert.strictEqual(agentHostService.turnActions[0].action.session.toString(), agentHostService.turnActions[1].action.session.toString());
        }));
        test('uses sessionId from agent-host scheme resource', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
                message: 'Hi',
                sessionResource: URI.from({ scheme: 'agent-host-copilot', path: '/existing-session-42' }),
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(AgentSession.id(URI.parse(session)), 'existing-session-42');
        }));
        test('agent-host scheme with untitled path creates new session via mapping', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
                message: 'Hi',
                sessionResource: URI.from({ scheme: 'agent-host-copilot', path: '/untitled-abc123' }),
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            // Should create a new SDK session, not use "untitled-abc123" literally
            assert.ok(AgentSession.id(URI.parse(session)).startsWith('sdk-session-'));
        }));
        test('passes raw model id extracted from language model identifier', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
                message: 'Hi',
                userSelectedModelId: 'agent-host-copilot:claude-sonnet-4-20250514',
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(agentHostService.createSessionCalls.length, 1);
            assert.strictEqual(agentHostService.createSessionCalls[0].model, 'claude-sonnet-4-20250514');
        }));
        test('passes model id as-is when no vendor prefix', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
                message: 'Hi',
                userSelectedModelId: 'gpt-4o',
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(agentHostService.createSessionCalls.length, 1);
            assert.strictEqual(agentHostService.createSessionCalls[0].model, 'gpt-4o');
        }));
        test('does not create backend session eagerly for untitled sessions', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-deferred' });
            const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => session.dispose()));
            // No backend session should have been created yet
            assert.strictEqual(agentHostService.createSessionCalls.length, 0);
        });
    });
    // ---- Progress event → chat progress conversion ----------------------
    suite('progress routing', () => {
        test('delta events become markdownContent progress', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/responsePart', session, turnId, part: { kind: 'markdown', id: 'md-1', content: 'hello ' } });
            fire({ type: 'session/delta', session, turnId, partId: 'md-1', content: 'world' });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            // Events may be coalesced by the throttler, so check total content
            const markdownParts = collected.flat().filter((p) => p.kind === 'markdownContent');
            const totalContent = markdownParts.map(p => p.content.value).join('');
            assert.strictEqual(totalContent, 'hello world');
        }));
        test('tool_start events become toolInvocation progress', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-1', toolName: 'read_file', displayName: 'Read File' });
            fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-1', invocationMessage: 'Reading file', confirmed: 'not-needed' });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(collected.length, 1);
            assert.strictEqual(collected[0][0].kind, 'toolInvocation');
        }));
        test('tool_complete event transitions toolInvocation to completed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-2', toolName: 'bash', displayName: 'Bash' });
            fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-2', invocationMessage: 'Running Bash command', confirmed: 'not-needed' });
            fire({
                type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-2',
                result: { success: true, pastTenseMessage: 'Ran Bash command' },
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(collected.length, 1);
            const invocation = collected[0][0];
            assert.strictEqual(invocation.kind, 'toolInvocation');
            assert.strictEqual(invocation.toolCallId, 'tc-2');
            assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
        }));
        test('tool_complete with failure sets error state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-3', toolName: 'bash', displayName: 'Bash' });
            fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-3', invocationMessage: 'Running Bash command', confirmed: 'not-needed' });
            fire({
                type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-3',
                result: { success: false, pastTenseMessage: '"Bash" failed', content: [{ type: 'text', text: 'command not found' }], error: { message: 'command not found' } },
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(collected.length, 1);
            const invocation = collected[0][0];
            assert.strictEqual(invocation.kind, 'toolInvocation');
            assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
        }));
        test('malformed toolArguments does not throw', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-bad', toolName: 'bash', displayName: 'Bash' });
            fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-bad', invocationMessage: 'Running Bash command', confirmed: 'not-needed' });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(collected.length, 1);
            assert.strictEqual(collected[0][0].kind, 'toolInvocation');
        }));
        test('outstanding tool invocations are completed on idle', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            // tool_start without tool_complete
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-orphan', toolName: 'bash', displayName: 'Bash' });
            fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-orphan', invocationMessage: 'Running Bash command', confirmed: 'not-needed' });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(collected.length, 1);
            const invocation = collected[0][0];
            assert.strictEqual(invocation.kind, 'toolInvocation');
            assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
        }));
        test('events from other sessions are ignored', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            // Delta from a different session — will be ignored (session not subscribed)
            agentHostService.fireAction({
                action: { type: 'session/delta', session: AgentSession.uri('copilot', 'other-session').toString(), turnId, partId: 'md-other', content: 'wrong' },
                serverSeq: 100,
                origin: undefined,
            });
            fire({ type: 'session/responsePart', session, turnId, part: { kind: 'markdown', id: 'md-1', content: 'right' } });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(collected.length, 1);
            assert.strictEqual(collected[0][0].content.value, 'right');
        }));
    });
    // ---- Cancellation -----------------------------------------------------
    suite('cancellation', () => {
        test('cancellation resolves the agent invoke', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const cts = new CancellationTokenSource();
            disposables.add(cts);
            const { turnPromise } = await startTurn(sessionHandler, agentHostService, disposables, {
                cancellationToken: cts.token,
            });
            cts.cancel();
            await turnPromise;
            assert.ok(agentHostService.dispatchedActions.some(a => a.action.type === 'session/turnCancelled'));
        }));
        test('cancellation force-completes outstanding tool invocations', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const cts = new CancellationTokenSource();
            disposables.add(cts);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
                cancellationToken: cts.token,
            });
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-cancel', toolName: 'bash', displayName: 'Bash' });
            fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-cancel', invocationMessage: 'Running Bash command', confirmed: 'not-needed' });
            cts.cancel();
            await turnPromise;
            // The tool invocation may or may not have been emitted before cancellation
            // (the throttler can coalesce events). If it was emitted, it should be complete.
            const toolInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
            for (const inv of toolInvocations) {
                assert.strictEqual(IChatToolInvocation.isComplete(inv), true);
            }
        }));
        test('cancellation calls abortSession on the agent host service', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const cts = new CancellationTokenSource();
            disposables.add(cts);
            const { turnPromise } = await startTurn(sessionHandler, agentHostService, disposables, {
                cancellationToken: cts.token,
            });
            cts.cancel();
            await turnPromise;
            // Cancellation now dispatches session/turnCancelled action
            assert.ok(agentHostService.dispatchedActions.some(a => a.action.type === 'session/turnCancelled'));
        }));
    });
    // ---- Error events -------------------------------------------------------
    suite('error events', () => {
        test('error event renders error message and finishes the request', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId } = await startTurn(sessionHandler, agentHostService, disposables);
            agentHostService.fireAction({
                action: {
                    type: 'session/error',
                    session,
                    turnId,
                    error: { errorType: 'test_error', message: 'Something went wrong' },
                },
                serverSeq: 99,
                origin: undefined,
            });
            await turnPromise;
            // Should have received the error message and the request should have finished
            assert.ok(collected.length >= 1);
            const errorPart = collected.flat().find(p => p.kind === 'markdownContent' && p.content.value.includes('Something went wrong'));
            assert.ok(errorPart, 'Should have found a markdownContent part containing the error message');
        }));
    });
    // ---- Permission requests -----------------------------------------------
    suite('permission requests', () => {
        test('permission_request event shows confirmation and responds when confirmed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            // Simulate a tool call requiring confirmation via toolCallStart + toolCallReady
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-perm-1', toolName: 'shell', displayName: 'Shell' });
            fire({
                type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-perm-1',
                invocationMessage: 'echo hello', toolInput: 'echo hello',
            });
            await timeout(10);
            // The tool call should have produced a ChatToolInvocation in WaitingForConfirmation state
            // After toolCallStart (Streaming) and toolCallReady without confirmed (PendingConfirmation),
            // the handler emits two progress events — we want the last one (with confirmation).
            const toolInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
            assert.ok(toolInvocations.length >= 1, 'Should have received tool confirmation progress');
            const permInvocation = toolInvocations[toolInvocations.length - 1];
            assert.strictEqual(permInvocation.kind, 'toolInvocation');
            // Confirm the tool
            IChatToolInvocation.confirmWith(permInvocation, { type: 4 /* ToolConfirmKind.UserAction */ });
            await timeout(10);
            // The handler should have dispatched session/toolCallConfirmed
            assert.ok(agentHostService.dispatchedActions.some(a => {
                if (a.action.type !== 'session/toolCallConfirmed') {
                    return false;
                }
                const action = a.action;
                return action.toolCallId === 'tc-perm-1' && action.approved === true;
            }));
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
        }));
        test('permission_request denied when user skips', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-perm-2', toolName: 'write', displayName: 'Write File' });
            fire({
                type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-perm-2',
                invocationMessage: 'Write to /tmp/test.txt',
            });
            await timeout(10);
            const toolInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
            const permInvocation = toolInvocations[toolInvocations.length - 1];
            // Deny the permission
            IChatToolInvocation.confirmWith(permInvocation, { type: 0 /* ToolConfirmKind.Denied */ });
            await timeout(10);
            assert.ok(agentHostService.dispatchedActions.some(a => {
                if (a.action.type !== 'session/toolCallConfirmed') {
                    return false;
                }
                const action = a.action;
                return action.toolCallId === 'tc-perm-2' && action.approved === false;
            }));
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
        }));
        test('shell permission shows terminal-style confirmation data', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-perm-shell', toolName: 'shell', displayName: 'Shell', _meta: { toolKind: 'terminal' } });
            fire({
                type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-perm-shell',
                invocationMessage: 'echo hello', toolInput: 'echo hello',
            });
            await timeout(10);
            const toolInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
            const permInvocation = toolInvocations[toolInvocations.length - 1];
            assert.strictEqual(permInvocation.toolSpecificData?.kind, 'terminal');
            const termData = permInvocation.toolSpecificData;
            assert.strictEqual(termData.commandLine.original, 'echo hello');
            IChatToolInvocation.confirmWith(permInvocation, { type: 4 /* ToolConfirmKind.UserAction */ });
            await timeout(10);
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
        }));
        test('read permission shows input-style confirmation data', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-perm-read', toolName: 'read_file', displayName: 'Read File' });
            fire({
                type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-perm-read',
                invocationMessage: 'Read file contents', toolInput: '/workspace/file.ts',
            });
            await timeout(10);
            const permInvocation = collected[0][0];
            IChatToolInvocation.confirmWith(permInvocation, { type: 4 /* ToolConfirmKind.UserAction */ });
            await timeout(10);
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
        }));
    });
    // ---- History loading ---------------------------------------------------
    suite('history loading', () => {
        test('loads user and assistant messages into history', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'sess-1');
            agentHostService.sessionStates.set(sessionUri.toString(), {
                ...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: "idle" /* SessionStatus.Idle */, createdAt: Date.now(), modifiedAt: Date.now() }),
                lifecycle: "ready" /* SessionLifecycle.Ready */,
                turns: [{
                        id: 'turn-1',
                        userMessage: { text: 'What is 2+2?' },
                        responseParts: [{ kind: "markdown" /* ResponsePartKind.Markdown */, id: 'md-1', content: '4' }],
                        usage: undefined,
                        state: "complete" /* TurnState.Complete */,
                    }],
            });
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/sess-1' });
            const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => session.dispose()));
            assert.strictEqual(session.history.length, 2);
            const request = session.history[0];
            assert.strictEqual(request.type, 'request');
            if (request.type === 'request') {
                assert.strictEqual(request.prompt, 'What is 2+2?');
            }
            const response = session.history[1];
            assert.strictEqual(response.type, 'response');
            if (response.type === 'response') {
                assert.strictEqual(response.parts.length, 1);
                assert.strictEqual(response.parts[0].content.value, '4');
            }
        });
        test('untitled sessions have empty history', async () => {
            const { sessionHandler } = createContribution(disposables);
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-xyz' });
            const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => session.dispose()));
            assert.strictEqual(session.history.length, 0);
        });
    });
    // ---- Tool invocation rendering -----------------------------------------
    suite('tool invocation rendering', () => {
        test('bash tool renders as terminal command block with output', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-shell', toolName: 'bash', displayName: 'Bash', _meta: { toolKind: 'terminal', language: 'shellscript' } });
            fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-shell', invocationMessage: 'Running `echo hello`', toolInput: 'echo hello', confirmed: 'not-needed' });
            fire({
                type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-shell',
                result: { success: true, pastTenseMessage: 'Ran `echo hello`', content: [{ type: 'text', text: 'hello\n' }] },
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            const invocation = collected[0][0];
            const termData = invocation.toolSpecificData;
            assert.deepStrictEqual({
                kind: invocation.kind,
                invocationMessage: textOf(invocation.invocationMessage),
                pastTenseMessage: textOf(invocation.pastTenseMessage),
                dataKind: termData.kind,
                commandLine: termData.commandLine.original,
                language: termData.language,
                outputText: termData.terminalCommandOutput?.text,
                exitCode: termData.terminalCommandState?.exitCode,
            }, {
                kind: 'toolInvocation',
                invocationMessage: 'Running `echo hello`',
                pastTenseMessage: undefined,
                dataKind: 'terminal',
                commandLine: 'echo hello',
                language: 'shellscript',
                outputText: 'hello\n',
                exitCode: 0,
            });
        }));
        test('bash tool failure sets exit code 1 and error output', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-fail', toolName: 'bash', displayName: 'Bash', _meta: { toolKind: 'terminal', language: 'shellscript' } });
            fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-fail', invocationMessage: 'Running `bad_cmd`', toolInput: 'bad_cmd', confirmed: 'not-needed' });
            fire({
                type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-fail',
                result: { success: false, pastTenseMessage: '"Bash" failed', content: [{ type: 'text', text: 'command not found: bad_cmd' }], error: { message: 'command not found: bad_cmd' } },
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            const invocation = collected[0][0];
            const termData = invocation.toolSpecificData;
            assert.deepStrictEqual({
                pastTenseMessage: invocation.pastTenseMessage,
                outputText: termData.terminalCommandOutput?.text,
                exitCode: termData.terminalCommandState?.exitCode,
            }, {
                pastTenseMessage: undefined,
                outputText: 'command not found: bad_cmd',
                exitCode: 1,
            });
        }));
        test('generic tool has invocation message and no toolSpecificData', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-gen', toolName: 'custom_tool', displayName: 'custom_tool' });
            fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-gen', invocationMessage: 'Using "custom_tool"', confirmed: 'not-needed' });
            fire({
                type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-gen',
                result: { success: true, pastTenseMessage: 'Used "custom_tool"' },
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            const invocation = collected[0][0];
            assert.deepStrictEqual({
                invocationMessage: textOf(invocation.invocationMessage),
                pastTenseMessage: textOf(invocation.pastTenseMessage),
                toolSpecificData: invocation.toolSpecificData,
            }, {
                invocationMessage: 'Using "custom_tool"',
                pastTenseMessage: 'Used "custom_tool"',
                toolSpecificData: undefined,
            });
        }));
        test('bash tool without arguments has no terminal data', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-noargs', toolName: 'bash', displayName: 'Bash', toolKind: 'terminal' });
            fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-noargs', invocationMessage: 'Running Bash command', confirmed: 'not-needed' });
            fire({
                type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-noargs',
                result: { success: true, pastTenseMessage: 'Ran Bash command' },
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            const invocation = collected[0][0];
            assert.deepStrictEqual({
                invocationMessage: textOf(invocation.invocationMessage),
                pastTenseMessage: textOf(invocation.pastTenseMessage),
                toolSpecificData: invocation.toolSpecificData,
            }, {
                invocationMessage: 'Running Bash command',
                pastTenseMessage: 'Ran Bash command',
                toolSpecificData: undefined,
            });
        }));
        test('view tool shows file path in messages', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-view', toolName: 'view', displayName: 'View File' });
            fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-view', invocationMessage: 'Reading /tmp/test.txt', confirmed: 'not-needed' });
            fire({
                type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-view',
                result: { success: true, pastTenseMessage: 'Read /tmp/test.txt' },
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            const invocation = collected[0][0];
            assert.deepStrictEqual({
                invocationMessage: textOf(invocation.invocationMessage),
                pastTenseMessage: textOf(invocation.pastTenseMessage),
            }, {
                invocationMessage: 'Reading /tmp/test.txt',
                pastTenseMessage: 'Read /tmp/test.txt',
            });
        }));
    });
    // ---- History with tool events ----------------------------------------
    suite('history with tool events', () => {
        test('tool_start and tool_complete appear as toolInvocationSerialized in history', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'tool-hist');
            agentHostService.sessionStates.set(sessionUri.toString(), {
                ...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: "idle" /* SessionStatus.Idle */, createdAt: Date.now(), modifiedAt: Date.now() }),
                lifecycle: "ready" /* SessionLifecycle.Ready */,
                turns: [{
                        id: 'turn-1',
                        userMessage: { text: 'run ls' },
                        state: "complete" /* TurnState.Complete */,
                        responseParts: [{
                                kind: 'toolCall', toolCall: {
                                    status: 'completed', toolCallId: 'tc-1', toolName: 'bash', displayName: 'Bash',
                                    invocationMessage: 'Running `ls`', toolInput: 'ls', _meta: { toolKind: 'terminal', language: 'shellscript' },
                                    confirmed: 'not-needed', success: true, pastTenseMessage: 'Ran `ls`', content: [{ type: 'text', text: 'file1\nfile2' }],
                                }
                            }],
                        usage: undefined,
                    }],
            });
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/tool-hist' });
            const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => chatSession.dispose()));
            // request, response
            assert.strictEqual(chatSession.history.length, 2);
            const response = chatSession.history[1];
            assert.strictEqual(response.type, 'response');
            if (response.type === 'response') {
                assert.strictEqual(response.parts.length, 1);
                const toolPart = response.parts[0];
                assert.strictEqual(toolPart.kind, 'toolInvocationSerialized');
                assert.strictEqual(toolPart.toolCallId, 'tc-1');
                assert.strictEqual(toolPart.isComplete, true);
                // Terminal tool has output and exit code
                assert.strictEqual(toolPart.toolSpecificData?.kind, 'terminal');
                const termData = toolPart.toolSpecificData;
                assert.strictEqual(termData.terminalCommandOutput?.text, 'file1\nfile2');
                assert.strictEqual(termData.terminalCommandState?.exitCode, 0);
            }
        });
        test('orphaned tool_start is marked complete in history', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'orphan-tool');
            agentHostService.sessionStates.set(sessionUri.toString(), {
                ...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: "idle" /* SessionStatus.Idle */, createdAt: Date.now(), modifiedAt: Date.now() }),
                lifecycle: "ready" /* SessionLifecycle.Ready */,
                turns: [{
                        id: 'turn-1',
                        userMessage: { text: 'do something' },
                        state: "complete" /* TurnState.Complete */,
                        responseParts: [{
                                kind: 'toolCall', toolCall: { status: 'completed', toolCallId: 'tc-orphan', toolName: 'read_file', displayName: 'Read File', invocationMessage: 'Reading file', confirmed: 'not-needed', success: false, pastTenseMessage: 'Reading file' },
                            }],
                        usage: undefined,
                    }],
            });
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/orphan-tool' });
            const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => chatSession.dispose()));
            assert.strictEqual(chatSession.history.length, 2);
            const response = chatSession.history[1];
            if (response.type === 'response') {
                const toolPart = response.parts[0];
                assert.strictEqual(toolPart.kind, 'toolInvocationSerialized');
                assert.strictEqual(toolPart.isComplete, true);
            }
        });
        test('non-terminal tool_complete sets pastTenseMessage in history', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'generic-tool');
            agentHostService.sessionStates.set(sessionUri.toString(), {
                ...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: "idle" /* SessionStatus.Idle */, createdAt: Date.now(), modifiedAt: Date.now() }),
                lifecycle: "ready" /* SessionLifecycle.Ready */,
                turns: [{
                        id: 'turn-1',
                        userMessage: { text: 'search' },
                        state: "complete" /* TurnState.Complete */,
                        responseParts: [{
                                kind: 'toolCall', toolCall: { status: 'completed', toolCallId: 'tc-g', toolName: 'grep', displayName: 'Grep', invocationMessage: 'Searching...', confirmed: 'not-needed', success: true, pastTenseMessage: 'Searched for pattern' },
                            }],
                        usage: undefined,
                    }],
            });
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/generic-tool' });
            const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => chatSession.dispose()));
            const response = chatSession.history[1];
            if (response.type === 'response') {
                const toolPart = response.parts[0];
                assert.strictEqual(textOf(toolPart.pastTenseMessage), 'Searched for pattern');
                assert.strictEqual(toolPart.toolSpecificData, undefined);
            }
        });
        test('empty session produces empty history', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'empty-sess');
            agentHostService.sessionStates.set(sessionUri.toString(), {
                ...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: "idle" /* SessionStatus.Idle */, createdAt: Date.now(), modifiedAt: Date.now() }),
                lifecycle: "ready" /* SessionLifecycle.Ready */,
                turns: [],
            });
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/empty-sess' });
            const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => chatSession.dispose()));
            assert.strictEqual(chatSession.history.length, 0);
        });
    });
    // ---- Server error handling ----------------------------------------------
    suite('server error handling', () => {
        test('server-side error resolves the agent invoke without throwing', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, session, turnId } = await startTurn(sessionHandler, agentHostService, disposables);
            // Simulate a server-side error (e.g. sendMessage failure on the server)
            agentHostService.fireAction({
                action: {
                    type: 'session/error',
                    session,
                    turnId,
                    error: { errorType: 'connection_error', message: 'connection lost' },
                },
                serverSeq: 99,
                origin: undefined,
            });
            await turnPromise;
        }));
    });
    // ---- Session list provider filtering --------------------------------
    suite('session list provider filtering', () => {
        test('filters sessions to only the matching provider', async () => {
            const { listController, agentHostService } = createContribution(disposables);
            // Add sessions from both providers (use a non-copilot scheme to test filtering)
            agentHostService.addSession({ session: AgentSession.uri('copilot', 'cp-1'), startTime: 1000, modifiedTime: 2000 });
            agentHostService.addSession({ session: URI.from({ scheme: 'other-provider', path: '/cl-1' }), startTime: 1000, modifiedTime: 2000 });
            agentHostService.addSession({ session: AgentSession.uri('copilot', 'cp-2'), startTime: 3000, modifiedTime: 4000 });
            await listController.refresh(CancellationToken.None);
            // The list controller is configured for 'copilot', so only copilot sessions
            assert.strictEqual(listController.items.length, 2);
            assert.ok(listController.items.every(item => item.resource.scheme === 'agent-host-copilot'));
        });
    });
    // ---- Language model provider ----------------------------------------
    suite('language model provider', () => {
        test('maps models with correct metadata', async () => {
            const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));
            provider.updateModels([
                { provider: 'copilot', id: 'gpt-4o', name: 'GPT-4o', maxContextWindow: 128000, supportsVision: true },
            ]);
            const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);
            assert.strictEqual(models.length, 1);
            assert.strictEqual(models[0].identifier, 'agent-host-copilot:gpt-4o');
            assert.strictEqual(models[0].metadata.name, 'GPT-4o');
            assert.strictEqual(models[0].metadata.maxInputTokens, 128000);
            assert.strictEqual(models[0].metadata.capabilities?.vision, true);
            assert.strictEqual(models[0].metadata.targetChatSessionType, 'agent-host-copilot');
        });
        test('filters out disabled models', async () => {
            const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));
            provider.updateModels([
                { provider: 'copilot', id: 'gpt-4o', name: 'GPT-4o', maxContextWindow: 128000, supportsVision: false, policyState: "enabled" /* PolicyState.Enabled */ },
                { provider: 'copilot', id: 'gpt-3.5', name: 'GPT-3.5', maxContextWindow: 16000, supportsVision: false, policyState: "disabled" /* PolicyState.Disabled */ },
            ]);
            const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);
            assert.strictEqual(models.length, 1);
            assert.strictEqual(models[0].metadata.name, 'GPT-4o');
        });
        test('returns empty when no models set', async () => {
            const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));
            const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);
            assert.strictEqual(models.length, 0);
        });
        test('sendChatRequest throws', async () => {
            const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));
            await assert.rejects(() => provider.sendChatRequest(), /do not support direct chat requests/);
        });
    });
    // ---- Attachment context conversion --------------------------------------
    suite('attachment context', () => {
        test('file variable with file:// URI becomes file attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
                message: 'check this file',
                variables: {
                    variables: [
                        upcastPartial({ kind: 'file', id: 'v-file', name: 'test.ts', value: URI.file('/workspace/test.ts') }),
                    ],
                },
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(agentHostService.turnActions.length, 1);
            const turnAction = agentHostService.turnActions[0].action;
            assert.deepStrictEqual(turnAction.userMessage.attachments, [
                { type: 'file', path: URI.file('/workspace/test.ts').fsPath, displayName: 'test.ts' },
            ]);
        }));
        test('directory variable with file:// URI becomes directory attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
                message: 'check this dir',
                variables: {
                    variables: [
                        upcastPartial({ kind: 'directory', id: 'v-dir', name: 'src', value: URI.file('/workspace/src') }),
                    ],
                },
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(agentHostService.turnActions.length, 1);
            const turnAction = agentHostService.turnActions[0].action;
            assert.deepStrictEqual(turnAction.userMessage.attachments, [
                { type: 'directory', path: URI.file('/workspace/src').fsPath, displayName: 'src' },
            ]);
        }));
        test('implicit selection variable becomes selection attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
                message: 'explain this',
                variables: {
                    variables: [
                        upcastPartial({ kind: 'implicit', id: 'v-implicit', name: 'selection', isFile: true, isSelection: true, uri: URI.file('/workspace/foo.ts'), enabled: true, value: undefined }),
                    ],
                },
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(agentHostService.turnActions.length, 1);
            const turnAction = agentHostService.turnActions[0].action;
            assert.deepStrictEqual(turnAction.userMessage.attachments, [
                { type: 'selection', path: URI.file('/workspace/foo.ts').fsPath, displayName: 'selection' },
            ]);
        }));
        test('non-file URIs are skipped', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
                message: 'check this',
                variables: {
                    variables: [
                        upcastPartial({ kind: 'file', id: 'v-file', name: 'untitled', value: URI.from({ scheme: 'untitled', path: '/foo' }) }),
                    ],
                },
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(agentHostService.turnActions.length, 1);
            const turnAction = agentHostService.turnActions[0].action;
            // No attachments because it's not a file:// URI
            assert.strictEqual(turnAction.userMessage.attachments, undefined);
        }));
        test('tool variables are skipped', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
                message: 'use tools',
                variables: {
                    variables: [
                        upcastPartial({ kind: 'tool', id: 'v-tool', name: 'myTool', value: { id: 'tool-1' } }),
                    ],
                },
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(agentHostService.turnActions.length, 1);
            const turnAction = agentHostService.turnActions[0].action;
            assert.strictEqual(turnAction.userMessage.attachments, undefined);
        }));
        test('mixed variables extracts only supported types', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
                message: 'mixed',
                variables: {
                    variables: [
                        upcastPartial({ kind: 'file', id: 'v-file', name: 'a.ts', value: URI.file('/workspace/a.ts') }),
                        upcastPartial({ kind: 'tool', id: 'v-tool', name: 'myTool', value: { id: 'tool-1' } }),
                        upcastPartial({ kind: 'directory', id: 'v-dir', name: 'lib', value: URI.file('/workspace/lib') }),
                        upcastPartial({ kind: 'file', id: 'v-file', name: 'remote.ts', value: URI.from({ scheme: 'vscode-remote', path: '/remote/file.ts' }) }),
                    ],
                },
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(agentHostService.turnActions.length, 1);
            const turnAction = agentHostService.turnActions[0].action;
            assert.deepStrictEqual(turnAction.userMessage.attachments, [
                { type: 'file', path: URI.file('/workspace/a.ts').fsPath, displayName: 'a.ts' },
                { type: 'directory', path: URI.file('/workspace/lib').fsPath, displayName: 'lib' },
            ]);
        }));
        test('no variables results in no attachments argument', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
                message: 'Hello',
            });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(agentHostService.turnActions.length, 1);
            const turnAction = agentHostService.turnActions[0].action;
            assert.strictEqual(turnAction.userMessage.attachments, undefined);
        }));
    });
    // ---- AgentHostContribution discovery ---------------------------------
    suite('dynamic discovery', () => {
        test('setting gate prevents registration', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { instantiationService } = createTestServices(disposables);
            instantiationService.stub(IConfigurationService, { getValue: () => false });
            const contribution = disposables.add(instantiationService.createInstance(AgentHostContribution));
            // Contribution should exist but not have registered any agents
            assert.ok(contribution);
            // Let async work settle
            await timeout(10);
        }));
    });
    // ---- IAgentConnection unification -------------------------------------
    suite('IAgentConnection config', () => {
        test('handler uses custom extensionId from config', async () => {
            const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);
            disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
                provider: 'copilot',
                agentId: 'remote-test-copilot',
                sessionType: 'remote-test-copilot',
                fullName: 'Remote Copilot',
                description: 'Remote agent',
                connection: agentHostService,
                connectionAuthority: 'local',
                extensionId: 'vscode.remote-agent-host',
                extensionDisplayName: 'Remote Agent Host',
            }));
            const registered = chatAgentService.registeredAgents.get('remote-test-copilot');
            assert.ok(registered);
            assert.strictEqual(registered.data.extensionId.value, 'vscode.remote-agent-host');
            assert.strictEqual(registered.data.extensionDisplayName, 'Remote Agent Host');
        });
        test('handler defaults extensionId when not provided', async () => {
            const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);
            disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
                provider: 'copilot',
                agentId: 'default-ext-test',
                sessionType: 'default-ext-test',
                fullName: 'Test',
                description: 'test',
                connection: agentHostService,
                connectionAuthority: 'local',
            }));
            const registered = chatAgentService.registeredAgents.get('default-ext-test');
            assert.ok(registered);
            assert.strictEqual(registered.data.extensionId.value, 'vscode.agent-host');
            assert.strictEqual(registered.data.extensionDisplayName, 'Agent Host');
        });
        test('handler uses resolveWorkingDirectory callback', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { instantiationService, agentHostService } = createTestServices(disposables);
            const handler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
                provider: 'copilot',
                agentId: 'workdir-test',
                sessionType: 'workdir-test',
                fullName: 'Test',
                description: 'test',
                connection: agentHostService,
                connectionAuthority: 'local',
                resolveWorkingDirectory: () => URI.file('/custom/working/dir'),
            }));
            const { turnPromise, session, turnId, fire } = await startTurn(handler, agentHostService, disposables);
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(agentHostService.createSessionCalls.length, 1);
            assert.strictEqual(agentHostService.createSessionCalls[0].workingDirectory?.toString(), URI.file('/custom/working/dir').toString());
        }));
        test('handler passes vscode-agent-host URI as-is to createSession', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { instantiationService, agentHostService } = createTestServices(disposables);
            // The workspace repository URI in the Sessions app is a
            // vscode-agent-host:// URI. It must be passed through unchanged
            // because the connection's createSession already converts it via
            // fromAgentHostUri before sending to the remote server.
            const agentHostUri = URI.from({
                scheme: 'vscode-agent-host',
                authority: 'my-server',
                path: '/file/-/home/user/project',
            });
            const handler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
                provider: 'copilot',
                agentId: 'workdir-agenthost-test',
                sessionType: 'workdir-agenthost-test',
                fullName: 'Test',
                description: 'test',
                connection: agentHostService,
                connectionAuthority: 'my-server',
                resolveWorkingDirectory: () => agentHostUri,
            }));
            const { turnPromise, session, turnId, fire } = await startTurn(handler, agentHostService, disposables);
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            assert.strictEqual(agentHostService.createSessionCalls.length, 1);
            assert.strictEqual(agentHostService.createSessionCalls[0].workingDirectory?.toString(), agentHostUri.toString());
        }));
        test('list controller includes description in items', async () => {
            const { instantiationService, agentHostService } = createTestServices(disposables);
            const controller = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'remote-test', 'copilot', agentHostService, 'My Remote Host'));
            agentHostService.addSession({ session: AgentSession.uri('copilot', 'sess-1'), startTime: 1000, modifiedTime: 2000, summary: 'Test session' });
            await controller.refresh(CancellationToken.None);
            assert.strictEqual(controller.items.length, 1);
            assert.strictEqual(controller.items[0].description, 'My Remote Host');
        });
        test('list controller omits description when undefined', async () => {
            const { instantiationService, agentHostService } = createTestServices(disposables);
            const controller = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-copilot', 'copilot', agentHostService, undefined));
            agentHostService.addSession({ session: AgentSession.uri('copilot', 'sess-2'), startTime: 1000, modifiedTime: 2000, summary: 'Test' });
            await controller.refresh(CancellationToken.None);
            assert.strictEqual(controller.items.length, 1);
            assert.strictEqual(controller.items[0].description, undefined);
        });
        test('handler works with any IAgentConnection, not just IAgentHostService', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);
            // Create handler with agentHostService as IAgentConnection (not IAgentHostService)
            const handler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
                provider: 'copilot',
                agentId: 'connection-test',
                sessionType: 'connection-test',
                fullName: 'Connection Test',
                description: 'test',
                connection: agentHostService,
                connectionAuthority: 'local',
            }));
            // Verify it registered an agent
            assert.ok(chatAgentService.registeredAgents.has('connection-test'));
            // Verify it can run a turn through the IAgentConnection path
            const { turnPromise, session, turnId, fire } = await startTurn(handler, agentHostService, disposables, {
                message: 'Test message',
            });
            fire({ type: 'session/delta', session, turnId, content: 'Response' });
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            // Turn dispatched via connection.dispatchAction
            assert.strictEqual(agentHostService.turnActions.length, 1);
            assert.strictEqual(agentHostService.turnActions[0].action.userMessage.text, 'Test message');
        }));
    });
    // ---- Reconnection to active turn ----------------------------------------
    suite('reconnection to active turn', () => {
        function makeSessionStateWithActiveTurn(sessionUri, overrides) {
            const summary = {
                resource: sessionUri,
                provider: 'copilot',
                title: 'Active Session',
                status: "idle" /* SessionStatus.Idle */,
                createdAt: Date.now(),
                modifiedAt: Date.now(),
            };
            const activeTurnParts = [];
            const reasoningText = overrides?.reasoning ?? '';
            if (reasoningText) {
                activeTurnParts.push({ kind: "reasoning" /* ResponsePartKind.Reasoning */, id: 'reasoning-1', content: reasoningText });
            }
            activeTurnParts.push({ kind: "markdown" /* ResponsePartKind.Markdown */, id: 'md-active', content: overrides?.streamingText ?? 'Partial response so far' });
            return {
                ...createSessionState(summary),
                lifecycle: "ready" /* SessionLifecycle.Ready */,
                turns: [{
                        id: 'turn-completed',
                        userMessage: { text: 'First message' },
                        responseParts: [{ kind: "markdown" /* ResponsePartKind.Markdown */, id: 'md-1', content: 'First response' }],
                        usage: undefined,
                        state: "complete" /* TurnState.Complete */,
                    }],
                activeTurn: {
                    ...createActiveTurn('turn-active', { text: 'Second message' }),
                    responseParts: activeTurnParts,
                },
            };
        }
        test('loads completed turns as history and active turn request/response', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'reconnect-1');
            agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-1' });
            const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => session.dispose()));
            // Should have: completed turn (request + response) + active turn (request + empty response) = 4
            assert.strictEqual(session.history.length, 4);
            assert.strictEqual(session.history[0].type, 'request');
            if (session.history[0].type === 'request') {
                assert.strictEqual(session.history[0].prompt, 'First message');
            }
            assert.strictEqual(session.history[2].type, 'request');
            if (session.history[2].type === 'request') {
                assert.strictEqual(session.history[2].prompt, 'Second message');
            }
            // Active turn response should be an empty placeholder
            assert.strictEqual(session.history[3].type, 'response');
            if (session.history[3].type === 'response') {
                assert.strictEqual(session.history[3].parts.length, 0);
            }
        });
        test('sets isCompleteObs to false and populates progressObs for active turn', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'reconnect-2');
            agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-2' });
            const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => session.dispose()));
            assert.strictEqual(session.isCompleteObs?.get(), false, 'Should not be complete when active turn exists');
            const progress = session.progressObs?.get() ?? [];
            assert.ok(progress.length > 0, 'Should have initial progress from active turn');
            // Should contain the streaming text as markdown
            const markdownPart = progress.find(p => p.kind === 'markdownContent');
            assert.ok(markdownPart, 'Should have markdown content from streaming text');
            assert.strictEqual(markdownPart.content.value, 'Partial response so far');
        });
        test('provides interruptActiveResponseCallback when reconnecting', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'reconnect-3');
            agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-3' });
            const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => session.dispose()));
            assert.ok(session.interruptActiveResponseCallback, 'Should provide interrupt callback');
        });
        test('interrupt callback dispatches turnCancelled action', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'reconnect-cancel');
            agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-cancel' });
            const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => session.dispose()));
            assert.ok(session.interruptActiveResponseCallback);
            const result = await session.interruptActiveResponseCallback();
            assert.strictEqual(result, true);
            // Should have dispatched a turnCancelled action
            const cancelAction = agentHostService.dispatchedActions.find(d => d.action.type === 'session/turnCancelled');
            assert.ok(cancelAction, 'Should dispatch session/turnCancelled');
        });
        test('streams new text deltas into progressObs after reconnection', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'reconnect-stream');
            const sessionState = makeSessionStateWithActiveTurn(sessionUri.toString(), { streamingText: 'Before' });
            agentHostService.sessionStates.set(sessionUri.toString(), sessionState);
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-stream' });
            const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => session.dispose()));
            const initialLen = (session.progressObs?.get() ?? []).length;
            // Fire a delta action to simulate the server streaming more text
            agentHostService.fireAction({
                action: { type: 'session/delta', session: sessionUri.toString(), turnId: 'turn-active', partId: 'md-active', content: ' and more' },
                serverSeq: 1,
                origin: undefined,
            });
            await timeout(10);
            const progress = session.progressObs?.get() ?? [];
            assert.ok(progress.length > initialLen, 'Should have appended new progress items');
            // The last markdown part should be the delta
            const lastMarkdown = [...progress].reverse().find(p => p.kind === 'markdownContent');
            assert.ok(lastMarkdown, 'Should have a new markdown delta');
            assert.strictEqual(lastMarkdown.content.value, ' and more');
        }));
        test('marks session complete when turn finishes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'reconnect-complete');
            agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-complete' });
            const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => session.dispose()));
            assert.strictEqual(session.isCompleteObs?.get(), false);
            // Fire turnComplete to finish the active turn
            agentHostService.fireAction({
                action: { type: 'session/turnComplete', session: sessionUri.toString(), turnId: 'turn-active' },
                serverSeq: 1,
                origin: undefined,
            });
            await timeout(10);
            assert.strictEqual(session.isCompleteObs?.get(), true, 'Should be complete after turnComplete');
        }));
        test('handles active turn with running tool call', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'reconnect-tool');
            const sessionState = makeSessionStateWithActiveTurn(sessionUri.toString());
            sessionState.activeTurn.responseParts.push({
                kind: "toolCall" /* ResponsePartKind.ToolCall */,
                toolCall: {
                    toolCallId: 'tc-running',
                    toolName: 'bash',
                    displayName: 'Bash',
                    invocationMessage: 'Running command',
                    status: "running" /* ToolCallStatus.Running */,
                    confirmed: "not-needed" /* ToolCallConfirmationReason.NotNeeded */,
                },
            });
            agentHostService.sessionStates.set(sessionUri.toString(), sessionState);
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-tool' });
            const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => session.dispose()));
            const progress = session.progressObs?.get() ?? [];
            const toolInvocation = progress.find(p => p.kind === 'toolInvocation');
            assert.ok(toolInvocation, 'Should have a live tool invocation in progress');
            assert.strictEqual(toolInvocation.toolCallId, 'tc-running');
        });
        test('handles active turn with pending tool confirmation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'reconnect-perm');
            const sessionState = makeSessionStateWithActiveTurn(sessionUri.toString());
            sessionState.activeTurn.responseParts.push({
                kind: "toolCall" /* ResponsePartKind.ToolCall */,
                toolCall: {
                    toolCallId: 'tc-pending',
                    toolName: 'bash',
                    displayName: 'Bash',
                    invocationMessage: 'Run command',
                    confirmationTitle: 'Clean up',
                    toolInput: 'rm -rf /tmp/test',
                    status: "pending-confirmation" /* ToolCallStatus.PendingConfirmation */,
                },
            });
            agentHostService.sessionStates.set(sessionUri.toString(), sessionState);
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-perm' });
            const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => session.dispose()));
            const progress = session.progressObs?.get() ?? [];
            const permInvocation = progress.find(p => p.kind === 'toolInvocation');
            assert.ok(permInvocation, 'Should have a live permission request in progress');
            // Complete the turn so the awaitConfirmation promise and its internal
            // DisposableStore are cleaned up before test teardown.
            agentHostService.fireAction({
                action: { type: 'session/turnComplete', session: sessionUri.toString(), turnId: 'turn-active' },
                serverSeq: 1,
                origin: undefined,
            });
            await timeout(10);
        }));
        test('no active turn loads completed history only with isComplete true', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'no-active-turn');
            agentHostService.sessionStates.set(sessionUri.toString(), {
                ...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Done', status: "idle" /* SessionStatus.Idle */, createdAt: Date.now(), modifiedAt: Date.now() }),
                lifecycle: "ready" /* SessionLifecycle.Ready */,
                turns: [{
                        id: 'turn-done',
                        userMessage: { text: 'Hello' },
                        responseParts: [{ kind: "markdown" /* ResponsePartKind.Markdown */, id: 'md-1', content: 'Hi' }],
                        usage: undefined,
                        state: "complete" /* TurnState.Complete */,
                    }],
            });
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/no-active-turn' });
            const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => session.dispose()));
            assert.strictEqual(session.history.length, 2);
            assert.strictEqual(session.isCompleteObs?.get(), true);
            assert.deepStrictEqual(session.progressObs?.get(), []);
        });
        test('includes reasoning in initial progress', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionUri = AgentSession.uri('copilot', 'reconnect-reasoning');
            agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString(), {
                streamingText: 'text',
                reasoning: 'Let me think...',
            }));
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-reasoning' });
            const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => session.dispose()));
            const progress = session.progressObs?.get() ?? [];
            const thinking = progress.find(p => p.kind === 'thinking');
            assert.ok(thinking, 'Should have thinking progress from reasoning');
            const markdown = progress.find(p => p.kind === 'markdownContent');
            assert.ok(markdown);
            assert.strictEqual(markdown.content.value, 'text');
        });
    });
    // ---- Server-initiated turns -------------------------------------------
    suite('server-initiated turns', () => {
        test('detects server-initiated turn and fires onDidStartServerRequest', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            // Create and subscribe a session
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-server-turn' });
            const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => chatSession.dispose()));
            // Clear lifecycle actions so only turn dispatches are counted
            agentHostService.dispatchedActions.length = 0;
            // First, do a normal turn so the backend session is created
            const turn1Promise = chatSession.requestHandler(makeRequest({ message: 'Hello', sessionResource }), () => { }, [], CancellationToken.None);
            await timeout(10);
            const dispatch1 = agentHostService.turnActions[0];
            const action1 = dispatch1.action;
            const session = action1.session;
            // Echo + complete the first turn
            agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
            agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId }, serverSeq: 2, origin: undefined });
            await turn1Promise;
            // Now simulate a server-initiated turn (e.g. from a consumed queued message)
            const serverTurnId = 'server-turn-1';
            const serverRequestEvents = [];
            disposables.add(chatSession.onDidStartServerRequest(e => serverRequestEvents.push(e)));
            agentHostService.fireAction({
                action: {
                    type: 'session/turnStarted',
                    session,
                    turnId: serverTurnId,
                    userMessage: { text: 'queued message text' },
                },
                serverSeq: 3,
                origin: undefined, // Server-originated — no client origin
            });
            await timeout(10);
            // onDidStartServerRequest should have fired
            assert.strictEqual(serverRequestEvents.length, 1);
            assert.strictEqual(serverRequestEvents[0].prompt, 'queued message text');
            // isCompleteObs should be false (turn in progress)
            assert.strictEqual(chatSession.isCompleteObs.get(), false);
        }));
        test('server-initiated turn streams progress through progressObs', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-server-progress' });
            const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => chatSession.dispose()));
            // Clear lifecycle actions so only turn dispatches are counted
            agentHostService.dispatchedActions.length = 0;
            // Normal turn to create backend session
            const turn1Promise = chatSession.requestHandler(makeRequest({ message: 'Init', sessionResource }), () => { }, [], CancellationToken.None);
            await timeout(10);
            const dispatch1 = agentHostService.turnActions[0];
            const action1 = dispatch1.action;
            const session = action1.session;
            agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
            agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId }, serverSeq: 2, origin: undefined });
            await turn1Promise;
            // Server-initiated turn
            const serverTurnId = 'server-turn-progress';
            agentHostService.fireAction({
                action: { type: 'session/turnStarted', session, turnId: serverTurnId, userMessage: { text: 'auto queued' } },
                serverSeq: 3, origin: undefined,
            });
            await timeout(10);
            // Stream a response part + delta
            agentHostService.fireAction({
                action: { type: 'session/responsePart', session, turnId: serverTurnId, part: { kind: 'markdown', id: 'md-srv', content: 'Hello ' } },
                serverSeq: 4, origin: undefined,
            });
            agentHostService.fireAction({
                action: { type: 'session/delta', session, turnId: serverTurnId, partId: 'md-srv', content: 'world' },
                serverSeq: 5, origin: undefined,
            });
            await timeout(50);
            // Progress should be in progressObs
            const progress = chatSession.progressObs.get();
            const markdownParts = progress.filter((p) => p.kind === 'markdownContent');
            const totalContent = markdownParts.map(p => p.content.value).join('');
            assert.strictEqual(totalContent, 'Hello world');
            // Complete the turn
            agentHostService.fireAction({
                action: { type: 'session/turnComplete', session, turnId: serverTurnId },
                serverSeq: 6, origin: undefined,
            });
            await timeout(10);
            assert.strictEqual(chatSession.isCompleteObs.get(), true);
        }));
        test('disposing chat session does not call disposeSession on connection', async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/existing-session-1' });
            const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            // Dispose the chat session (simulates user navigating away)
            chatSession.dispose();
            // disposeSession must NOT be called — the backend session should persist
            assert.strictEqual(agentHostService.disposedSessions.length, 0, 'Disposing the UI chat session should not dispose the backend session');
        });
        test('client-dispatched turns are not treated as server-initiated', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-no-dupe' });
            const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => chatSession.dispose()));
            const serverRequestEvents = [];
            disposables.add(chatSession.onDidStartServerRequest(e => serverRequestEvents.push(e)));
            // Clear lifecycle actions so only turn dispatches are counted
            agentHostService.dispatchedActions.length = 0;
            // Normal client turn — should NOT fire onDidStartServerRequest
            const turnPromise = chatSession.requestHandler(makeRequest({ message: 'Client turn', sessionResource }), () => { }, [], CancellationToken.None);
            await timeout(10);
            const dispatch = agentHostService.turnActions[0];
            const action = dispatch.action;
            agentHostService.fireAction({ action: dispatch.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch.clientSeq } });
            agentHostService.fireAction({ action: { type: 'session/turnComplete', session: action.session, turnId: action.turnId }, serverSeq: 2, origin: undefined });
            await turnPromise;
            assert.strictEqual(serverRequestEvents.length, 0, 'Client-dispatched turns should not trigger onDidStartServerRequest');
        }));
        test('server-initiated turn does not duplicate tool calls on repeated state changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-server-tool-dedup' });
            const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => chatSession.dispose()));
            // Clear lifecycle actions so only turn dispatches are counted
            agentHostService.dispatchedActions.length = 0;
            // First, do a normal turn so the backend session is created
            const turn1Promise = chatSession.requestHandler(makeRequest({ message: 'Init', sessionResource }), () => { }, [], CancellationToken.None);
            await timeout(10);
            const dispatch1 = agentHostService.turnActions[0];
            const action1 = dispatch1.action;
            const session = action1.session;
            agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
            agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId }, serverSeq: 2, origin: undefined });
            await turn1Promise;
            // Server-initiated turn
            const serverTurnId = 'server-turn-tool-dedup';
            agentHostService.fireAction({
                action: { type: 'session/turnStarted', session, turnId: serverTurnId, userMessage: { text: 'queued' } },
                serverSeq: 3, origin: undefined,
            });
            await timeout(10);
            // Tool start + ready (auto-confirmed)
            agentHostService.fireAction({
                action: { type: 'session/toolCallStart', session, turnId: serverTurnId, toolCallId: 'tc-srv-1', toolName: 'bash', displayName: 'Bash' },
                serverSeq: 4, origin: undefined,
            });
            agentHostService.fireAction({
                action: { type: 'session/toolCallReady', session, turnId: serverTurnId, toolCallId: 'tc-srv-1', invocationMessage: 'Running Bash', confirmed: 'not-needed' },
                serverSeq: 5, origin: undefined,
            });
            await timeout(50);
            // Tool complete
            agentHostService.fireAction({
                action: { type: 'session/toolCallComplete', session, turnId: serverTurnId, toolCallId: 'tc-srv-1', result: { success: true, pastTenseMessage: 'Ran Bash' } },
                serverSeq: 6, origin: undefined,
            });
            await timeout(50);
            // Fire additional state changes that might cause re-processing
            agentHostService.fireAction({
                action: { type: 'session/responsePart', session, turnId: serverTurnId, part: { kind: 'markdown', id: 'md-after', content: 'Done.' } },
                serverSeq: 7, origin: undefined,
            });
            agentHostService.fireAction({
                action: { type: 'session/turnComplete', session, turnId: serverTurnId },
                serverSeq: 8, origin: undefined,
            });
            await timeout(50);
            // Count tool invocations in progressObs — should be exactly 1
            const progress = chatSession.progressObs.get();
            const toolInvocations = progress.filter(p => p.kind === 'toolInvocation');
            assert.strictEqual(toolInvocations.length, 1, 'Tool call should not be duplicated');
        }));
        test('server-initiated turn picks up markdown arriving with turnStarted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const { sessionHandler, agentHostService } = createContribution(disposables);
            const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-server-md-initial' });
            const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
            disposables.add(toDisposable(() => chatSession.dispose()));
            // Clear lifecycle actions so only turn dispatches are counted
            agentHostService.dispatchedActions.length = 0;
            // First, do a normal turn so the backend session is created
            const turn1Promise = chatSession.requestHandler(makeRequest({ message: 'Init', sessionResource }), () => { }, [], CancellationToken.None);
            await timeout(10);
            const dispatch1 = agentHostService.turnActions[0];
            const action1 = dispatch1.action;
            const session = action1.session;
            agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
            agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId }, serverSeq: 2, origin: undefined });
            await turn1Promise;
            // Fire turnStarted followed immediately by a response part.
            // In production, these can arrive in rapid succession from the
            // WebSocket, and the immediate reconciliation in
            // _trackServerTurnProgress ensures content already in the state
            // is not missed.
            const serverTurnId = 'server-turn-md-initial';
            agentHostService.fireAction({
                action: { type: 'session/turnStarted', session, turnId: serverTurnId, userMessage: { text: 'queued' } },
                serverSeq: 3, origin: undefined,
            });
            agentHostService.fireAction({
                action: { type: 'session/responsePart', session, turnId: serverTurnId, part: { kind: 'markdown', id: 'md-init', content: 'Initial text' } },
                serverSeq: 4, origin: undefined,
            });
            await timeout(50);
            // The markdown should appear in progressObs
            const progress = chatSession.progressObs.get();
            const markdownParts = progress.filter((p) => p.kind === 'markdownContent');
            const totalContent = markdownParts.map(p => p.content.value).join('');
            assert.strictEqual(totalContent, 'Initial text', 'Markdown arriving with/right after turnStarted should be picked up');
            // Complete the turn
            agentHostService.fireAction({
                action: { type: 'session/turnComplete', session, turnId: serverTurnId },
                serverSeq: 5, origin: undefined,
            });
            await timeout(10);
            assert.strictEqual(chatSession.isCompleteObs.get(), true);
        }));
    });
    // ---- Customizations dispatch ------------------------------------------
    suite('customizations', () => {
        test('dispatches activeClientChanged when a new session is created', async () => {
            const { instantiationService, agentHostService } = createTestServices(disposables);
            const customizations = observableValue('customizations', [
                { uri: 'file:///plugin-a', displayName: 'Plugin A' },
            ]);
            const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
                provider: 'copilot',
                agentId: 'agent-host-copilot',
                sessionType: 'agent-host-copilot',
                fullName: 'Agent Host - Copilot',
                description: 'test',
                connection: agentHostService,
                connectionAuthority: 'local',
                customizations,
            }));
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            const activeClientAction = agentHostService.dispatchedActions.find(d => d.action.type === 'session/activeClientChanged');
            assert.ok(activeClientAction, 'should dispatch activeClientChanged');
            const ac = activeClientAction.action;
            assert.strictEqual(ac.activeClient.customizations?.length, 1);
            assert.strictEqual(ac.activeClient.customizations?.[0].uri, 'file:///plugin-a');
        });
        test('re-dispatches activeClientChanged when customizations observable changes', async () => {
            const { instantiationService, agentHostService } = createTestServices(disposables);
            const customizations = observableValue('customizations', []);
            const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
                provider: 'copilot',
                agentId: 'agent-host-copilot',
                sessionType: 'agent-host-copilot',
                fullName: 'Agent Host - Copilot',
                description: 'test',
                connection: agentHostService,
                connectionAuthority: 'local',
                customizations,
            }));
            // Create a session first
            const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
            fire({ type: 'session/turnComplete', session, turnId });
            await turnPromise;
            agentHostService.dispatchedActions.length = 0;
            // Update customizations
            customizations.set([
                { uri: 'file:///plugin-b', displayName: 'Plugin B' },
            ], undefined);
            const activeClientAction = agentHostService.dispatchedActions.find(d => d.action.type === 'session/activeClientChanged');
            assert.ok(activeClientAction, 'should re-dispatch activeClientChanged on change');
            const ac = activeClientAction.action;
            assert.strictEqual(ac.activeClient.customizations?.length, 1);
            assert.strictEqual(ac.activeClient.customizations?.[0].uri, 'file:///plugin-b');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0Q2hhdENvbnRyaWJ1dGlvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3RDaGF0Q29udHJpYnV0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMzRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDakYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDL0YsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDM0YsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUE2QixpQkFBaUIsRUFBeUIsWUFBWSxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFJaEssT0FBTyxFQUEwRixrQkFBa0IsRUFBRSxn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