/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { PROTOCOL_VERSION } from '../../common/state/sessionCapabilities.js';
import { isJsonRpcNotification, isJsonRpcResponse, JSON_RPC_INTERNAL_ERROR, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ProtocolServerHandler } from '../../node/protocolServerHandler.js';
import { SessionStateManager } from '../../node/sessionStateManager.js';
import { AgentHostFileSystemProvider } from '../../common/agentHostFileSystemProvider.js';
// ---- Mock helpers -----------------------------------------------------------
class MockProtocolTransport {
    constructor() {
        this._onMessage = new Emitter();
        this.onMessage = this._onMessage.event;
        this._onDidSend = new Emitter();
        this.onDidSend = this._onDidSend.event;
        this._onClose = new Emitter();
        this.onClose = this._onClose.event;
        this.sent = [];
    }
    send(message) {
        this.sent.push(message);
        this._onDidSend.fire(message);
    }
    simulateMessage(msg) {
        this._onMessage.fire(msg);
    }
    simulateClose() {
        this._onClose.fire();
    }
    dispose() {
        this._onMessage.dispose();
        this._onDidSend.dispose();
        this._onClose.dispose();
    }
}
class MockProtocolServer {
    constructor() {
        this._onConnection = new Emitter();
        this.onConnection = this._onConnection.event;
        this.address = 'mock://test';
    }
    simulateConnection(transport) {
        this._onConnection.fire(transport);
    }
    dispose() {
        this._onConnection.dispose();
    }
}
class MockAgentService {
    constructor() {
        this.handledActions = [];
        this.browsedUris = [];
        this.browseErrors = new Map();
        this._onDidAction = new Emitter();
        this.onDidAction = this._onDidAction.event;
        this._onDidNotification = new Emitter();
        this.onDidNotification = this._onDidNotification.event;
    }
    /** Connect to the state manager so dispatchAction works correctly. */
    setStateManager(sm) {
        this._stateManager = sm;
    }
    dispatchAction(action, clientId, clientSeq) {
        this.handledActions.push(action);
        const origin = { clientId, clientSeq };
        this._stateManager.dispatchClientAction(action, origin);
    }
    async createSession(_config) { return URI.parse('copilot:///new-session'); }
    async disposeSession(_session) { }
    async listSessions() { return []; }
    async subscribe(resource) {
        const snapshot = this._stateManager.getSnapshot(resource.toString());
        if (!snapshot) {
            throw new Error(`Cannot subscribe to unknown resource: ${resource.toString()}`);
        }
        return snapshot;
    }
    unsubscribe(_resource) { }
    async shutdown() { }
    async getResourceMetadata() { return { resources: [] }; }
    async authenticate(_params) { return { authenticated: true }; }
    async refreshModels() { }
    async listAgents() { return []; }
    async resourceWrite(_params) { return {}; }
    async resourceList(uri) {
        this.browsedUris.push(uri);
        const error = this.browseErrors.get(uri.toString());
        if (error) {
            throw error;
        }
        return {
            entries: [
                { name: 'src', type: 'directory' },
                { name: 'README.md', type: 'file' },
            ],
        };
    }
    async resourceRead(_uri) {
        throw new Error('Not implemented');
    }
    async resourceCopy() { return {}; }
    async resourceDelete() { return {}; }
    async resourceMove() { return {}; }
    dispose() {
        this._onDidAction.dispose();
        this._onDidNotification.dispose();
    }
}
// ---- Helpers ----------------------------------------------------------------
function notification(method, params) {
    return { jsonrpc: '2.0', method, params };
}
function request(id, method, params) {
    return { jsonrpc: '2.0', id, method, params };
}
function findNotifications(sent, method) {
    return sent.filter(isJsonRpcNotification);
}
function findResponse(sent, id) {
    return sent.find(isJsonRpcResponse);
}
function waitForResponse(transport, id) {
    return Event.toPromise(Event.filter(transport.onDidSend, message => isJsonRpcResponse(message) && message.id === id));
}
// ---- Tests ------------------------------------------------------------------
suite('ProtocolServerHandler', () => {
    let disposables;
    let stateManager;
    let server;
    let agentService;
    let handler;
    const sessionUri = URI.from({ scheme: 'copilot', path: '/test-session' }).toString();
    function makeSessionSummary(resource) {
        return {
            resource: resource ?? sessionUri,
            provider: 'copilot',
            title: 'Test',
            status: "idle" /* SessionStatus.Idle */,
            createdAt: Date.now(),
            modifiedAt: Date.now(),
        };
    }
    function connectClient(clientId, initialSubscriptions) {
        const transport = new MockProtocolTransport();
        server.simulateConnection(transport);
        transport.simulateMessage(request(1, 'initialize', {
            protocolVersion: PROTOCOL_VERSION,
            clientId,
            initialSubscriptions,
        }));
        return transport;
    }
    setup(() => {
        disposables = new DisposableStore();
        stateManager = disposables.add(new SessionStateManager(new NullLogService()));
        server = disposables.add(new MockProtocolServer());
        agentService = new MockAgentService();
        agentService.setStateManager(stateManager);
        disposables.add(agentService);
        disposables.add(handler = new ProtocolServerHandler(agentService, stateManager, server, { defaultDirectory: URI.file('/home/testuser').toString() }, disposables.add(new AgentHostFileSystemProvider()), new NullLogService()));
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('handshake returns initialize response', () => {
        const transport = connectClient('client-1');
        const resp = findResponse(transport.sent, 1);
        assert.ok(resp, 'should have sent initialize response');
        const result = resp.result;
        assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
        assert.strictEqual(result.serverSeq, stateManager.serverSeq);
    });
    test('handshake with initialSubscriptions returns snapshots', () => {
        stateManager.createSession(makeSessionSummary());
        const transport = connectClient('client-1', [sessionUri]);
        const resp = findResponse(transport.sent, 1);
        assert.ok(resp);
        const result = resp.result;
        assert.strictEqual(result.snapshots.length, 1);
        assert.strictEqual(result.snapshots[0].resource.toString(), sessionUri.toString());
    });
    test('subscribe request returns snapshot', async () => {
        stateManager.createSession(makeSessionSummary());
        const transport = connectClient('client-1');
        transport.sent.length = 0;
        const responsePromise = waitForResponse(transport, 1);
        transport.simulateMessage(request(1, 'subscribe', { resource: sessionUri }));
        const resp = await responsePromise;
        assert.ok(resp, 'should have sent response');
        const result = resp.result;
        assert.strictEqual(result.snapshot.resource.toString(), sessionUri.toString());
    });
    test('client action is dispatched and echoed', () => {
        stateManager.createSession(makeSessionSummary());
        stateManager.dispatchServerAction({ type: "session/ready" /* ActionType.SessionReady */, session: sessionUri });
        const transport = connectClient('client-1', [sessionUri]);
        transport.sent.length = 0;
        transport.simulateMessage(notification('dispatchAction', {
            clientSeq: 1,
            action: {
                type: "session/turnStarted" /* ActionType.SessionTurnStarted */,
                session: sessionUri,
                turnId: 'turn-1',
                userMessage: { text: 'hello' },
            },
        }));
        const actionMsgs = findNotifications(transport.sent, 'action');
        const turnStarted = actionMsgs.find(m => {
            const envelope = m.params;
            return envelope.action.type === "session/turnStarted" /* ActionType.SessionTurnStarted */;
        });
        assert.ok(turnStarted, 'should have echoed turnStarted');
        const envelope = turnStarted.params;
        assert.strictEqual(envelope.origin.clientId, 'client-1');
        assert.strictEqual(envelope.origin.clientSeq, 1);
    });
    test('actions are scoped to subscribed sessions', () => {
        stateManager.createSession(makeSessionSummary());
        stateManager.dispatchServerAction({ type: "session/ready" /* ActionType.SessionReady */, session: sessionUri });
        const transportA = connectClient('client-a', [sessionUri]);
        const transportB = connectClient('client-b');
        transportA.sent.length = 0;
        transportB.sent.length = 0;
        stateManager.dispatchServerAction({
            type: "session/titleChanged" /* ActionType.SessionTitleChanged */,
            session: sessionUri,
            title: 'New Title',
        });
        assert.strictEqual(findNotifications(transportA.sent, 'action').length, 1);
        assert.strictEqual(findNotifications(transportB.sent, 'action').length, 0);
    });
    test('notifications are broadcast to all clients', () => {
        const transportA = connectClient('client-a');
        const transportB = connectClient('client-b');
        transportA.sent.length = 0;
        transportB.sent.length = 0;
        stateManager.createSession(makeSessionSummary());
        assert.strictEqual(findNotifications(transportA.sent, 'notification').length, 1);
        assert.strictEqual(findNotifications(transportB.sent, 'notification').length, 1);
    });
    test('reconnect replays missed actions', () => {
        stateManager.createSession(makeSessionSummary());
        stateManager.dispatchServerAction({ type: "session/ready" /* ActionType.SessionReady */, session: sessionUri });
        const transport1 = connectClient('client-r', [sessionUri]);
        const resp = findResponse(transport1.sent, 1);
        const initSeq = resp.result.serverSeq;
        transport1.simulateClose();
        stateManager.dispatchServerAction({ type: "session/titleChanged" /* ActionType.SessionTitleChanged */, session: sessionUri, title: 'Title A' });
        stateManager.dispatchServerAction({ type: "session/titleChanged" /* ActionType.SessionTitleChanged */, session: sessionUri, title: 'Title B' });
        const transport2 = new MockProtocolTransport();
        server.simulateConnection(transport2);
        transport2.simulateMessage(request(1, 'reconnect', {
            clientId: 'client-r',
            lastSeenServerSeq: initSeq,
            subscriptions: [sessionUri],
        }));
        const reconnectResp = findResponse(transport2.sent, 1);
        assert.ok(reconnectResp, 'should have sent reconnect response');
        const result = reconnectResp.result;
        assert.strictEqual(result.type, 'replay');
        if (result.type === 'replay') {
            assert.strictEqual(result.actions.length, 2);
        }
    });
    test('reconnect sends fresh snapshots when gap too large', () => {
        stateManager.createSession(makeSessionSummary());
        stateManager.dispatchServerAction({ type: "session/ready" /* ActionType.SessionReady */, session: sessionUri });
        const transport1 = connectClient('client-g', [sessionUri]);
        transport1.simulateClose();
        for (let i = 0; i < 1100; i++) {
            stateManager.dispatchServerAction({ type: "session/titleChanged" /* ActionType.SessionTitleChanged */, session: sessionUri, title: `Title ${i}` });
        }
        const transport2 = new MockProtocolTransport();
        server.simulateConnection(transport2);
        transport2.simulateMessage(request(1, 'reconnect', {
            clientId: 'client-g',
            lastSeenServerSeq: 0,
            subscriptions: [sessionUri],
        }));
        const reconnectResp = findResponse(transport2.sent, 1);
        assert.ok(reconnectResp, 'should have sent reconnect response');
        const result = reconnectResp.result;
        assert.strictEqual(result.type, 'snapshot');
        if (result.type === 'snapshot') {
            assert.ok(result.snapshots.length > 0, 'should contain snapshots');
        }
    });
    test('client disconnect cleans up', () => {
        stateManager.createSession(makeSessionSummary());
        stateManager.dispatchServerAction({ type: "session/ready" /* ActionType.SessionReady */, session: sessionUri });
        const transport = connectClient('client-d', [sessionUri]);
        transport.sent.length = 0;
        transport.simulateClose();
        stateManager.dispatchServerAction({ type: "session/titleChanged" /* ActionType.SessionTitleChanged */, session: sessionUri, title: 'After Disconnect' });
        assert.strictEqual(transport.sent.length, 0);
    });
    test('handshake includes defaultDirectory from side effects', () => {
        const transport = connectClient('client-home');
        const resp = findResponse(transport.sent, 1);
        assert.ok(resp);
        const result = resp.result;
        assert.strictEqual(URI.parse(result.defaultDirectory).path, '/home/testuser');
    });
    test('resourceList routes to side effect handler', async () => {
        const transport = connectClient('client-browse');
        transport.sent.length = 0;
        const dirUri = URI.file('/home/user/project').toString();
        const responsePromise = waitForResponse(transport, 2);
        transport.simulateMessage(request(2, 'resourceList', { uri: dirUri }));
        const resp = await responsePromise;
        assert.strictEqual(agentService.browsedUris.length, 1);
        assert.strictEqual(agentService.browsedUris[0].path, '/home/user/project');
        assert.ok(resp);
        const result = resp.result;
        assert.strictEqual(result.entries.length, 2);
        assert.strictEqual(result.entries[0].name, 'src');
        assert.strictEqual(result.entries[0].type, 'directory');
        assert.strictEqual(result.entries[1].name, 'README.md');
        assert.strictEqual(result.entries[1].type, 'file');
    });
    test('resourceList returns a JSON-RPC error when the target is invalid', async () => {
        const transport = connectClient('client-browse-error');
        transport.sent.length = 0;
        const dirUri = URI.file('/missing').toString();
        agentService.browseErrors.set(URI.file('/missing').toString(), new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Directory not found: ${dirUri}`));
        const responsePromise = waitForResponse(transport, 2);
        transport.simulateMessage(request(2, 'resourceList', { uri: dirUri }));
        const resp = await responsePromise;
        assert.ok(resp?.error);
        assert.strictEqual(resp.error.code, JSON_RPC_INTERNAL_ERROR);
        assert.match(resp.error.message, /Directory not found/);
    });
    // ---- Extension methods: auth ----------------------------------------
    test('getResourceMetadata returns resource metadata via extension request', async () => {
        const transport = connectClient('client-metadata');
        transport.sent.length = 0;
        const responsePromise = waitForResponse(transport, 2);
        transport.simulateMessage(request(2, 'getResourceMetadata'));
        const resp = await responsePromise;
        assert.ok(resp?.result);
        assert.ok(Array.isArray(resp.result.resources));
    });
    test('authenticate returns result via extension request', async () => {
        const transport = connectClient('client-auth');
        transport.sent.length = 0;
        const responsePromise = waitForResponse(transport, 2);
        transport.simulateMessage(request(2, 'authenticate', { resource: 'https://api.github.com', token: 'test-token' }));
        const resp = await responsePromise;
        assert.ok(resp?.result);
        assert.strictEqual(resp.result.authenticated, true);
    });
    test('extension request preserves ProtocolError code and data', async () => {
        // Override authenticate to throw a ProtocolError with data
        const origHandler = agentService.authenticate;
        agentService.authenticate = async () => { throw new ProtocolError(-32007, 'Auth required', { hint: 'sign in' }); };
        const transport = connectClient('client-auth-error');
        transport.sent.length = 0;
        const responsePromise = waitForResponse(transport, 2);
        transport.simulateMessage(request(2, 'authenticate', { resource: 'test', token: 'bad' }));
        const resp = await responsePromise;
        assert.ok(resp?.error);
        assert.strictEqual(resp.error.code, -32007);
        assert.strictEqual(resp.error.message, 'Auth required');
        assert.deepStrictEqual(resp.error.data, { hint: 'sign in' });
        agentService.authenticate = origHandler;
    });
    // ---- Connection count event -----------------------------------------
    test('onDidChangeConnectionCount fires on connect and disconnect', () => {
        const counts = [];
        disposables.add(handler.onDidChangeConnectionCount(c => counts.push(c)));
        const transport = connectClient('client-count-1');
        connectClient('client-count-2');
        transport.simulateClose();
        assert.deepStrictEqual(counts, [1, 2, 1]);
    });
    test('onDidChangeConnectionCount is not decremented by stale reconnect close', () => {
        const counts = [];
        disposables.add(handler.onDidChangeConnectionCount(c => counts.push(c)));
        // Connect
        const transport1 = connectClient('client-rc');
        assert.deepStrictEqual(counts, [1]);
        // Reconnect with same clientId (new transport)
        const transport2 = new MockProtocolTransport();
        server.simulateConnection(transport2);
        transport2.simulateMessage(request(1, 'reconnect', {
            clientId: 'client-rc',
            lastSeenServerSeq: 0,
            subscriptions: [],
        }));
        // Count is unchanged because same clientId was overwritten
        assert.deepStrictEqual(counts, [1, 1]);
        // Old transport closes - should NOT decrement since it's stale
        transport1.simulateClose();
        assert.deepStrictEqual(counts, [1, 1]);
        // New transport closes - should decrement
        transport2.simulateClose();
        assert.deepStrictEqual(counts, [1, 1, 0]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdG9jb2xTZXJ2ZXJIYW5kbGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvdGVzdC9ub2RlL3Byb3RvY29sU2VydmVySGFuZGxlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBSTVELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxhQUFhLEVBQW9NLE1BQU0sdUNBQXVDLENBQUM7QUFHM1UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFMUYsZ0ZBQWdGO0FBRWhGLE1BQU0scUJBQXFCO0lBQTNCO1FBQ2tCLGVBQVUsR0FBRyxJQUFJLE9BQU8sRUFBb0IsQ0FBQztRQUNyRCxjQUFTLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUM7UUFDMUIsZUFBVSxHQUFHLElBQUksT0FBTyxFQUFvQixDQUFDO1FBQ3JE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