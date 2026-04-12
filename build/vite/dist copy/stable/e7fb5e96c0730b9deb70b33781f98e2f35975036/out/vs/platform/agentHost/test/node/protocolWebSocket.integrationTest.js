/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { WebSocket } from 'ws';
import { timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { PROTOCOL_VERSION } from '../../common/state/sessionCapabilities.js';
import { isJsonRpcNotification, isJsonRpcResponse, JSON_RPC_PARSE_ERROR } from '../../common/state/sessionProtocol.js';
import { MOCK_AUTO_TITLE, PRE_EXISTING_SESSION_URI } from './mockAgent.js';
class TestProtocolClient {
    constructor(port) {
        this._nextId = 1;
        this._pendingCalls = new Map();
        this._notifications = [];
        this._notifWaiters = [];
        this._ws = new WebSocket(`ws://127.0.0.1:${port}`);
    }
    async connect() {
        return new Promise((resolve, reject) => {
            this._ws.on('open', () => {
                this._ws.on('message', (data) => {
                    const text = typeof data === 'string' ? data : data.toString('utf-8');
                    const msg = JSON.parse(text);
                    this._handleMessage(msg);
                });
                resolve();
            });
            this._ws.on('error', reject);
        });
    }
    _handleMessage(msg) {
        if (isJsonRpcResponse(msg)) {
            // JSON-RPC response — resolve pending call
            const pending = this._pendingCalls.get(msg.id);
            if (pending) {
                this._pendingCalls.delete(msg.id);
                const errResp = msg;
                if (errResp.error) {
                    pending.reject(new Error(errResp.error.message));
                }
                else {
                    pending.resolve(msg.result);
                }
            }
        }
        else if (isJsonRpcNotification(msg)) {
            // JSON-RPC notification from server
            const notif = msg;
            // Check waiters first
            for (let i = this._notifWaiters.length - 1; i >= 0; i--) {
                if (this._notifWaiters[i].predicate(notif)) {
                    const waiter = this._notifWaiters.splice(i, 1)[0];
                    waiter.resolve(notif);
                }
            }
            this._notifications.push(notif);
        }
    }
    /** Send a JSON-RPC notification (fire-and-forget). */
    notify(method, params) {
        this._ws.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
    }
    /** Send a JSON-RPC request and await the response. */
    call(method, params, timeoutMs = 5000) {
        const id = this._nextId++;
        this._ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pendingCalls.delete(id);
                reject(new Error(`Timeout waiting for response to ${method} (id=${id}, ${timeoutMs}ms)`));
            }, timeoutMs);
            this._pendingCalls.set(id, {
                resolve: result => { clearTimeout(timer); resolve(result); },
                reject: err => { clearTimeout(timer); reject(err); },
            });
        });
    }
    /** Wait for a server notification matching a predicate. */
    waitForNotification(predicate, timeoutMs = 5000) {
        const existing = this._notifications.find(predicate);
        if (existing) {
            return Promise.resolve(existing);
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const idx = this._notifWaiters.findIndex(w => w.resolve === resolve);
                if (idx >= 0) {
                    this._notifWaiters.splice(idx, 1);
                }
                reject(new Error(`Timeout waiting for notification (${timeoutMs}ms)`));
            }, timeoutMs);
            this._notifWaiters.push({
                predicate,
                resolve: n => { clearTimeout(timer); resolve(n); },
                reject,
            });
        });
    }
    /** Return all received notifications matching a predicate. */
    receivedNotifications(predicate) {
        return predicate ? this._notifications.filter(predicate) : [...this._notifications];
    }
    /** Send a raw string over the WebSocket without JSON serialization. */
    sendRaw(data) {
        this._ws.send(data);
    }
    /** Wait for the next raw message from the server. */
    waitForRawMessage(timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error(`Timeout waiting for raw message (${timeoutMs}ms)`));
            }, timeoutMs);
            const onMsg = (data) => {
                cleanup();
                const text = typeof data === 'string' ? data : data.toString('utf-8');
                resolve(JSON.parse(text));
            };
            const cleanup = () => {
                clearTimeout(timer);
                this._ws.removeListener('message', onMsg);
            };
            this._ws.on('message', onMsg);
        });
    }
    close() {
        for (const w of this._notifWaiters) {
            w.reject(new Error('Client closed'));
        }
        this._notifWaiters.length = 0;
        for (const [, p] of this._pendingCalls) {
            p.reject(new Error('Client closed'));
        }
        this._pendingCalls.clear();
        this._ws.close();
    }
    clearReceived() {
        this._notifications.length = 0;
    }
}
// ---- Server process lifecycle -----------------------------------------------
async function startServer() {
    return new Promise((resolve, reject) => {
        const serverPath = fileURLToPath(new URL('../../node/agentHostServerMain.js', import.meta.url));
        const child = fork(serverPath, ['--enable-mock-agent', '--quiet', '--port', '0', '--without-connection-token'], {
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        });
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error('Server startup timed out'));
        }, 10_000);
        child.stdout.on('data', (data) => {
            const text = data.toString();
            const match = text.match(/READY:(\d+)/);
            if (match) {
                clearTimeout(timeout);
                resolve({ process: child, port: parseInt(match[1], 10) });
            }
        });
        child.stderr.on('data', () => {
            // Intentionally swallowed - the test runner fails if console.error is used.
        });
        child.on('error', err => {
            clearTimeout(timeout);
            reject(err);
        });
        child.on('exit', code => {
            clearTimeout(timeout);
            reject(new Error(`Server exited prematurely with code ${code}`));
        });
    });
}
// ---- Helpers ----------------------------------------------------------------
let sessionCounter = 0;
function nextSessionUri() {
    return URI.from({ scheme: 'mock', path: `/test-session-${++sessionCounter}` }).toString();
}
function isActionNotification(n, actionType) {
    if (n.method !== 'action') {
        return false;
    }
    const envelope = n.params;
    return envelope.action.type === actionType;
}
function getActionEnvelope(n) {
    return n.params;
}
/** Perform handshake, create a session, subscribe, and return its URI. */
async function createAndSubscribeSession(c, clientId, workingDirectory) {
    await c.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId });
    await c.call('createSession', { session: nextSessionUri(), provider: 'mock', workingDirectory });
    const notif = await c.waitForNotification(n => n.method === 'notification' && n.params.notification.type === 'notify/sessionAdded');
    const realSessionUri = notif.params.notification.summary.resource;
    await c.call('subscribe', { resource: realSessionUri });
    c.clearReceived();
    return realSessionUri;
}
function dispatchTurnStarted(c, session, turnId, text, clientSeq) {
    c.notify('dispatchAction', {
        clientSeq,
        action: {
            type: 'session/turnStarted',
            session,
            turnId,
            userMessage: { text },
        },
    });
}
// ---- Test suite -------------------------------------------------------------
suite('Protocol WebSocket E2E', function () {
    let server;
    let client;
    suiteSetup(async function () {
        this.timeout(15_000);
        server = await startServer();
    });
    suiteTeardown(function () {
        server.process.kill();
    });
    setup(async function () {
        this.timeout(10_000);
        client = new TestProtocolClient(server.port);
        await client.connect();
    });
    teardown(function () {
        client.close();
    });
    // 1. Handshake
    test('handshake returns initialize response with protocol version', async function () {
        this.timeout(5_000);
        const result = await client.call('initialize', {
            protocolVersion: PROTOCOL_VERSION,
            clientId: 'test-handshake',
            initialSubscriptions: [URI.from({ scheme: 'agenthost', path: '/root' }).toString()],
        });
        assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
        assert.ok(result.serverSeq >= 0);
        assert.ok(result.snapshots.length >= 1, 'should have root state snapshot');
    });
    // 2. Create session
    test('create session triggers sessionAdded notification', async function () {
        this.timeout(10_000);
        await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-create-session' });
        await client.call('createSession', { session: nextSessionUri(), provider: 'mock' });
        const notif = await client.waitForNotification(n => n.method === 'notification' && n.params.notification.type === 'notify/sessionAdded');
        const notification = notif.params.notification;
        assert.strictEqual(URI.parse(notification.summary.resource).scheme, 'mock');
        assert.strictEqual(notification.summary.provider, 'mock');
    });
    // 3. Send message and receive response
    test('send message and receive responsePart + turnComplete', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-send-message');
        dispatchTurnStarted(client, sessionUri, 'turn-1', 'hello', 1);
        const responsePart = await client.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
        const responsePartAction = getActionEnvelope(responsePart).action;
        assert.strictEqual(responsePartAction.part.kind, "markdown" /* ResponsePartKind.Markdown */);
        assert.strictEqual(responsePartAction.part.content, 'Hello, world!');
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
    });
    // 4. Tool invocation lifecycle
    test('tool invocation: toolCallStart → toolCallComplete → responsePart → turnComplete', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-tool-invocation');
        dispatchTurnStarted(client, sessionUri, 'turn-tool', 'use-tool', 1);
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallReady'));
        const toolComplete = await client.waitForNotification(n => isActionNotification(n, 'session/toolCallComplete'));
        const tcAction = getActionEnvelope(toolComplete).action;
        if (tcAction.type === 'session/toolCallComplete') {
            assert.strictEqual(tcAction.result.success, true);
        }
        await client.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
    });
    // 5. Error handling
    test('error prompt triggers session/error', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-error');
        dispatchTurnStarted(client, sessionUri, 'turn-err', 'error', 1);
        const errorNotif = await client.waitForNotification(n => isActionNotification(n, 'session/error'));
        const errorAction = getActionEnvelope(errorNotif).action;
        if (errorAction.type === 'session/error') {
            assert.strictEqual(errorAction.error.message, 'Something went wrong');
        }
    });
    // 6. Permission flow (via tool_ready confirmation)
    test('permission request → resolve → response', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-permission');
        dispatchTurnStarted(client, sessionUri, 'turn-perm', 'permission', 1);
        // The mock agent now fires tool_start + tool_ready instead of permission_request
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallReady'));
        // Confirm the tool call
        client.notify('dispatchAction', {
            clientSeq: 2,
            action: {
                type: 'session/toolCallConfirmed',
                session: sessionUri,
                turnId: 'turn-perm',
                toolCallId: 'tc-perm-1',
                approved: true,
            },
        });
        const responsePart = await client.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
        const responsePartAction = getActionEnvelope(responsePart).action;
        assert.strictEqual(responsePartAction.part.kind, "markdown" /* ResponsePartKind.Markdown */);
        assert.strictEqual(responsePartAction.part.content, 'Allowed.');
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
    });
    // 7. Session list
    test('listSessions returns sessions', async function () {
        this.timeout(10_000);
        await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-list-sessions' });
        await client.call('createSession', { session: nextSessionUri(), provider: 'mock' });
        await client.waitForNotification(n => n.method === 'notification' && n.params.notification.type === 'notify/sessionAdded');
        const result = await client.call('listSessions');
        assert.ok(Array.isArray(result.items));
        assert.ok(result.items.length >= 1, 'should have at least one session');
    });
    // 8. Reconnect
    test('reconnect replays missed actions', async function () {
        this.timeout(15_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-reconnect');
        dispatchTurnStarted(client, sessionUri, 'turn-recon', 'hello', 1);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        const allActions = client.receivedNotifications(n => n.method === 'action');
        assert.ok(allActions.length > 0);
        const missedFromSeq = getActionEnvelope(allActions[0]).serverSeq - 1;
        client.close();
        const client2 = new TestProtocolClient(server.port);
        await client2.connect();
        const result = await client2.call('reconnect', {
            clientId: 'test-reconnect',
            lastSeenServerSeq: missedFromSeq,
            subscriptions: [sessionUri],
        });
        assert.ok(result.type === 'replay' || result.type === 'snapshot', 'should receive replay or snapshot');
        if (result.type === 'replay') {
            assert.ok(result.actions.length > 0, 'should have replayed actions');
        }
        client2.close();
    });
    // ---- Gap tests: functionality bugs ----------------------------------------
    test('usage info is captured on completed turn', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-usage');
        dispatchTurnStarted(client, sessionUri, 'turn-usage', 'with-usage', 1);
        const usageNotif = await client.waitForNotification(n => isActionNotification(n, 'session/usage'));
        const usageAction = getActionEnvelope(usageNotif).action;
        assert.strictEqual(usageAction.usage.inputTokens, 100);
        assert.strictEqual(usageAction.usage.outputTokens, 50);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        const snapshot = await client.call('subscribe', { resource: sessionUri });
        const state = snapshot.snapshot.state;
        assert.ok(state.turns.length >= 1);
        const turn = state.turns[state.turns.length - 1];
        assert.ok(turn.usage);
        assert.strictEqual(turn.usage.inputTokens, 100);
        assert.strictEqual(turn.usage.outputTokens, 50);
    });
    test('modifiedAt updates on turn completion', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-modifiedAt');
        const initialSnapshot = await client.call('subscribe', { resource: sessionUri });
        const initialModifiedAt = initialSnapshot.snapshot.state.summary.modifiedAt;
        await new Promise(resolve => setTimeout(resolve, 50));
        dispatchTurnStarted(client, sessionUri, 'turn-mod', 'hello', 1);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        const updatedSnapshot = await client.call('subscribe', { resource: sessionUri });
        const updatedModifiedAt = updatedSnapshot.snapshot.state.summary.modifiedAt;
        assert.ok(updatedModifiedAt >= initialModifiedAt);
    });
    test('createSession with invalid provider does not crash server', async function () {
        this.timeout(10_000);
        await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-invalid-create' });
        // This should return a JSON-RPC error
        let gotError = false;
        try {
            await client.call('createSession', { session: nextSessionUri(), provider: 'nonexistent' });
        }
        catch {
            gotError = true;
        }
        assert.ok(gotError, 'should have received an error for invalid provider');
        // Server should still be functional
        await client.call('createSession', { session: nextSessionUri(), provider: 'mock' });
        const notif = await client.waitForNotification(n => n.method === 'notification' && n.params.notification.type === 'notify/sessionAdded');
        assert.ok(notif);
    });
    test('fetchTurns returns completed turn history', async function () {
        this.timeout(15_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-fetchTurns');
        dispatchTurnStarted(client, sessionUri, 'turn-ft-1', 'hello', 1);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        dispatchTurnStarted(client, sessionUri, 'turn-ft-2', 'hello', 2);
        await new Promise(resolve => setTimeout(resolve, 200));
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        const result = await client.call('fetchTurns', { session: sessionUri, limit: 10 });
        assert.ok(result.turns.length >= 2);
        assert.strictEqual(typeof result.hasMore, 'boolean');
    });
    // ---- Gap tests: coverage ---------------------------------------------------
    test('dispose session sends sessionRemoved notification', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-dispose');
        await client.call('disposeSession', { session: sessionUri });
        const notif = await client.waitForNotification(n => n.method === 'notification' && n.params.notification.type === 'notify/sessionRemoved');
        const removed = notif.params.notification;
        assert.strictEqual(removed.session.toString(), sessionUri.toString());
    });
    test('cancel turn stops in-progress processing', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-cancel');
        dispatchTurnStarted(client, sessionUri, 'turn-cancel', 'slow', 1);
        client.notify('dispatchAction', {
            clientSeq: 2,
            action: { type: 'session/turnCancelled', session: sessionUri, turnId: 'turn-cancel' },
        });
        await client.waitForNotification(n => isActionNotification(n, 'session/turnCancelled'));
        const snapshot = await client.call('subscribe', { resource: sessionUri });
        const state = snapshot.snapshot.state;
        assert.ok(state.turns.length >= 1);
        assert.strictEqual(state.turns[state.turns.length - 1].state, 'cancelled');
    });
    test('multiple sequential turns accumulate in history', async function () {
        this.timeout(15_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-multi-turns');
        dispatchTurnStarted(client, sessionUri, 'turn-m1', 'hello', 1);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        dispatchTurnStarted(client, sessionUri, 'turn-m2', 'hello', 2);
        await new Promise(resolve => setTimeout(resolve, 200));
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        const snapshot = await client.call('subscribe', { resource: sessionUri });
        const state = snapshot.snapshot.state;
        assert.ok(state.turns.length >= 2, `expected >= 2 turns but got ${state.turns.length}`);
        assert.strictEqual(state.turns[0].id, 'turn-m1');
        assert.strictEqual(state.turns[1].id, 'turn-m2');
    });
    test('two clients on same session both see actions', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-multi-client-1');
        const client2 = new TestProtocolClient(server.port);
        await client2.connect();
        await client2.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-multi-client-2' });
        await client2.call('subscribe', { resource: sessionUri });
        client2.clearReceived();
        dispatchTurnStarted(client, sessionUri, 'turn-mc', 'hello', 1);
        const d1 = await client.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
        const d2 = await client2.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
        assert.ok(d1);
        assert.ok(d2);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        await client2.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        client2.close();
    });
    test('unsubscribe stops receiving session actions', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-unsubscribe');
        client.notify('unsubscribe', { resource: sessionUri });
        await new Promise(resolve => setTimeout(resolve, 100));
        client.clearReceived();
        const client2 = new TestProtocolClient(server.port);
        await client2.connect();
        await client2.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-unsub-helper' });
        await client2.call('subscribe', { resource: sessionUri });
        dispatchTurnStarted(client2, sessionUri, 'turn-unsub', 'hello', 1);
        await client2.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        await new Promise(resolve => setTimeout(resolve, 300));
        const sessionActions = client.receivedNotifications(n => isActionNotification(n, 'session/'));
        assert.strictEqual(sessionActions.length, 0, 'unsubscribed client should not receive session actions');
        client2.close();
    });
    test('change model within session updates state', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-change-model');
        client.notify('dispatchAction', {
            clientSeq: 1,
            action: { type: 'session/modelChanged', session: sessionUri, model: 'new-mock-model' },
        });
        const modelChanged = await client.waitForNotification(n => isActionNotification(n, 'session/modelChanged'));
        const action = getActionEnvelope(modelChanged).action;
        assert.strictEqual(action.type, 'session/modelChanged');
        if (action.type === 'session/modelChanged') {
            assert.strictEqual(action.model, 'new-mock-model');
        }
        const snapshot = await client.call('subscribe', { resource: sessionUri });
        const state = snapshot.snapshot.state;
        assert.strictEqual(state.summary.model, 'new-mock-model');
    });
    // ---- Session restore: subscribe to a session from a previous server lifetime
    test('subscribe to a pre-existing session restores turns from agent history', async function () {
        this.timeout(10_000);
        await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-restore' });
        // The mock agent seeds a pre-existing session that was never created
        // through the server's handleCreateSession -- simulating a session
        // from a previous server lifetime.
        const preExistingUri = PRE_EXISTING_SESSION_URI.toString();
        const list = await client.call('listSessions');
        const preExisting = list.items.find(s => s.resource === preExistingUri);
        assert.ok(preExisting, 'listSessions should include the pre-existing session');
        // Clear notifications so we can verify no duplicate sessionAdded fires.
        client.clearReceived();
        // Subscribing to this session should trigger the restore path: the
        // server fetches message history from the agent and reconstructs turns.
        const result = await client.call('subscribe', { resource: preExistingUri });
        const state = result.snapshot.state;
        assert.strictEqual(state.lifecycle, 'ready', 'restored session should be in ready state');
        assert.ok(state.turns.length >= 1, `expected at least 1 restored turn but got ${state.turns.length}`);
        const turn = state.turns[0];
        assert.strictEqual(turn.userMessage.text, 'What files are here?');
        assert.strictEqual(turn.state, 'complete');
        const toolCallParts = turn.responseParts.filter((p) => p.kind === "toolCall" /* ResponsePartKind.ToolCall */);
        assert.ok(toolCallParts.length >= 1, 'turn should have tool call response parts');
        assert.strictEqual(toolCallParts[0].toolCall.toolName, 'list_files');
        const mdParts = turn.responseParts.filter((p) => p.kind === "markdown" /* ResponsePartKind.Markdown */);
        assert.ok(mdParts.some(p => p.content.includes('file1.ts')), 'turn should have markdown part mentioning file1.ts');
        // Restoring should NOT emit a duplicate sessionAdded notification
        // (the session is already known to clients via listSessions).
        await new Promise(resolve => setTimeout(resolve, 200));
        const sessionAddedNotifs = client.receivedNotifications(n => n.method === 'notification' && n.params.notification.type === 'notify/sessionAdded');
        assert.strictEqual(sessionAddedNotifs.length, 0, 'restore should not emit sessionAdded');
    });
    // ---- Multi-client tests -----------------------------------------------------
    test('sessionAdded notification is broadcast to all connected clients', async function () {
        this.timeout(10_000);
        await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-broadcast-add-1' });
        const client2 = new TestProtocolClient(server.port);
        await client2.connect();
        await client2.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-broadcast-add-2' });
        client.clearReceived();
        client2.clearReceived();
        await client.call('createSession', { session: nextSessionUri(), provider: 'mock' });
        const n1 = await client.waitForNotification(n => n.method === 'notification' && n.params.notification.type === 'notify/sessionAdded');
        const n2 = await client2.waitForNotification(n => n.method === 'notification' && n.params.notification.type === 'notify/sessionAdded');
        assert.ok(n1, 'client 1 should receive sessionAdded');
        assert.ok(n2, 'client 2 should receive sessionAdded');
        const uri1 = n1.params.notification.summary.resource;
        const uri2 = n2.params.notification.summary.resource;
        assert.strictEqual(uri1, uri2, 'both clients should see the same session URI');
        client2.close();
    });
    test('sessionRemoved notification is broadcast to all connected clients', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-broadcast-remove-1');
        const client2 = new TestProtocolClient(server.port);
        await client2.connect();
        await client2.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-broadcast-remove-2' });
        client2.clearReceived();
        await client.call('disposeSession', { session: sessionUri });
        const n1 = await client.waitForNotification(n => n.method === 'notification' && n.params.notification.type === 'notify/sessionRemoved');
        const n2 = await client2.waitForNotification(n => n.method === 'notification' && n.params.notification.type === 'notify/sessionRemoved');
        assert.ok(n1, 'client 1 should receive sessionRemoved');
        assert.ok(n2, 'client 2 should receive sessionRemoved even without subscribing');
        const removed1 = n1.params.notification;
        const removed2 = n2.params.notification;
        assert.strictEqual(removed1.session.toString(), sessionUri.toString());
        assert.strictEqual(removed2.session.toString(), sessionUri.toString());
        client2.close();
    });
    test('client B sends message on session created by client A', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-cross-msg-1');
        const client2 = new TestProtocolClient(server.port);
        await client2.connect();
        await client2.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-cross-msg-2' });
        await client2.call('subscribe', { resource: sessionUri });
        client.clearReceived();
        client2.clearReceived();
        // Client B dispatches the turn
        dispatchTurnStarted(client2, sessionUri, 'turn-cross', 'hello', 1);
        const r1 = await client.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
        const r2 = await client2.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
        assert.ok(r1, 'client A should see responsePart from client B turn');
        assert.ok(r2, 'client B should see its own responsePart');
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        await client2.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        client2.close();
    });
    test('both clients receive full tool progress updates', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-tool-progress-1');
        const client2 = new TestProtocolClient(server.port);
        await client2.connect();
        await client2.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-tool-progress-2' });
        await client2.call('subscribe', { resource: sessionUri });
        client.clearReceived();
        client2.clearReceived();
        dispatchTurnStarted(client, sessionUri, 'turn-tool-mc', 'use-tool', 1);
        // Both clients should see the full tool lifecycle
        for (const c of [client, client2]) {
            await c.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
            await c.waitForNotification(n => isActionNotification(n, 'session/toolCallReady'));
            await c.waitForNotification(n => isActionNotification(n, 'session/toolCallComplete'));
            await c.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
            await c.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        }
        client2.close();
    });
    test('unsubscribed client receives no actions but still gets notifications', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-scoping-1');
        const client2 = new TestProtocolClient(server.port);
        await client2.connect();
        await client2.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-scoping-2' });
        // Client 2 does NOT subscribe to the session
        client2.clearReceived();
        dispatchTurnStarted(client, sessionUri, 'turn-scoped', 'hello', 1);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        // Give some time for any stray actions to arrive
        await new Promise(resolve => setTimeout(resolve, 300));
        const sessionActions = client2.receivedNotifications(n => n.method === 'action');
        assert.strictEqual(sessionActions.length, 0, 'unsubscribed client should receive no session actions');
        // But disposing the session should still broadcast a notification
        client2.clearReceived();
        await client.call('disposeSession', { session: sessionUri });
        const removed = await client2.waitForNotification(n => n.method === 'notification' && n.params.notification.type === 'notify/sessionRemoved');
        assert.ok(removed, 'unsubscribed client should still receive sessionRemoved notification');
        client2.close();
    });
    test('late subscriber gets current state via snapshot', async function () {
        this.timeout(15_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-late-sub');
        dispatchTurnStarted(client, sessionUri, 'turn-late', 'hello', 1);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        // Client 2 joins after the turn has completed
        const client2 = new TestProtocolClient(server.port);
        await client2.connect();
        await client2.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-late-sub-2' });
        const result = await client2.call('subscribe', { resource: sessionUri });
        const state = result.snapshot.state;
        assert.ok(state.turns.length >= 1, `late subscriber should see completed turn, got ${state.turns.length}`);
        assert.strictEqual(state.turns[0].id, 'turn-late');
        assert.strictEqual(state.turns[0].state, 'complete');
        client2.close();
    });
    test('permission flow: client B confirms tool started by client A', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-cross-perm-1');
        const client2 = new TestProtocolClient(server.port);
        await client2.connect();
        await client2.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-cross-perm-2' });
        await client2.call('subscribe', { resource: sessionUri });
        client.clearReceived();
        client2.clearReceived();
        // Client A starts the permission turn
        dispatchTurnStarted(client, sessionUri, 'turn-cross-perm', 'permission', 1);
        // Both clients should see tool_start and tool_ready
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
        await client2.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallReady'));
        await client2.waitForNotification(n => isActionNotification(n, 'session/toolCallReady'));
        // Client B confirms the tool call
        client2.notify('dispatchAction', {
            clientSeq: 1,
            action: {
                type: 'session/toolCallConfirmed',
                session: sessionUri,
                turnId: 'turn-cross-perm',
                toolCallId: 'tc-perm-1',
                approved: true,
            },
        });
        // Both clients should see the response and turn completion
        await client.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
        await client2.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        await client2.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        client2.close();
    });
    test('malformed JSON message returns parse error', async function () {
        this.timeout(10_000);
        const raw = new TestProtocolClient(server.port);
        await raw.connect();
        const responsePromise = raw.waitForRawMessage();
        raw.sendRaw('this is not valid json{{{');
        const response = await responsePromise;
        assert.strictEqual(response.jsonrpc, '2.0');
        assert.strictEqual(response.id, null);
        assert.strictEqual(response.error.code, JSON_RPC_PARSE_ERROR);
        raw.close();
    });
    // ---- Edit auto-approve patterns -----------------------------------------
    test('auto-approves write to regular file (no pending confirmation)', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-autoapprove', 'file:///workspace');
        client.clearReceived();
        // Start a turn that triggers a write permission request for a regular .ts file
        dispatchTurnStarted(client, sessionUri, 'turn-autoapprove', 'write-file', 1);
        // The write should be auto-approved — we should see tool_start, tool_complete, and turn_complete
        // but NOT a pending-confirmation toolCallReady (one without `confirmed`).
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallComplete'));
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        // Verify no pending-confirmation toolCallReady was received
        const pendingConfirmNotifs = client.receivedNotifications(n => {
            if (!isActionNotification(n, 'session/toolCallReady')) {
                return false;
            }
            const action = getActionEnvelope(n).action;
            return !action.confirmed;
        });
        assert.strictEqual(pendingConfirmNotifs.length, 0, 'should not have received pending-confirmation toolCallReady for auto-approved write');
    });
    test('blocks write to .env file (requires manual confirmation)', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-autoapprove-deny', 'file:///workspace');
        client.clearReceived();
        // Start a turn that tries to write .env (blocked by default patterns)
        dispatchTurnStarted(client, sessionUri, 'turn-deny', 'write-env', 1);
        // The .env write should NOT be auto-approved — we should see toolCallReady (pending confirmation)
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallReady'));
        // Confirm it manually to let the turn complete
        client.notify('dispatchAction', {
            clientSeq: 2,
            action: {
                type: 'session/toolCallConfirmed',
                session: sessionUri,
                turnId: 'turn-deny',
                toolCallId: 'tc-write-env-1',
                approved: true,
                confirmed: 'user-action',
            },
        });
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
    });
    // ---- Session rename / title --------------------------------------------------
    test('client titleChanged updates session state snapshot', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-titleChanged');
        client.notify('dispatchAction', {
            clientSeq: 1,
            action: {
                type: 'session/titleChanged',
                session: sessionUri,
                title: 'My Custom Title',
            },
        });
        const titleNotif = await client.waitForNotification(n => isActionNotification(n, 'session/titleChanged'));
        const titleAction = getActionEnvelope(titleNotif).action;
        assert.strictEqual(titleAction.title, 'My Custom Title');
        // Verify the snapshot reflects the new title
        const snapshot = await client.call('subscribe', { resource: sessionUri });
        const state = snapshot.snapshot.state;
        assert.strictEqual(state.summary.title, 'My Custom Title');
    });
    test('agent-generated titleChanged is broadcast', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-agent-title');
        dispatchTurnStarted(client, sessionUri, 'turn-title', 'with-title', 1);
        const titleNotif = await client.waitForNotification(n => isActionNotification(n, 'session/titleChanged'));
        const titleAction = getActionEnvelope(titleNotif).action;
        assert.strictEqual(titleAction.title, MOCK_AUTO_TITLE);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        // Verify the snapshot reflects the auto-generated title
        const snapshot = await client.call('subscribe', { resource: sessionUri });
        const state = snapshot.snapshot.state;
        assert.strictEqual(state.summary.title, MOCK_AUTO_TITLE);
    });
    test('renamed session title persists across listSessions', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-title-list');
        client.notify('dispatchAction', {
            clientSeq: 1,
            action: {
                type: 'session/titleChanged',
                session: sessionUri,
                title: 'Persisted Title',
            },
        });
        await client.waitForNotification(n => isActionNotification(n, 'session/titleChanged'));
        // Poll listSessions until the persisted title appears (async DB write)
        let session;
        for (let i = 0; i < 20; i++) {
            const result = await client.call('listSessions');
            session = result.items.find(s => s.resource === sessionUri);
            if (session?.title === 'Persisted Title') {
                break;
            }
            await timeout(100);
        }
        assert.ok(session, 'session should appear in listSessions');
        assert.strictEqual(session.title, 'Persisted Title');
    });
    // ---- Reasoning events -------------------------------------------------------
    test('reasoning events produce reasoning response parts and append actions', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-reasoning');
        dispatchTurnStarted(client, sessionUri, 'turn-reasoning', 'with-reasoning', 1);
        // The first reasoning event produces a responsePart with kind Reasoning
        const reasoningPart = await client.waitForNotification(n => {
            if (!isActionNotification(n, 'session/responsePart')) {
                return false;
            }
            const action = getActionEnvelope(n).action;
            return action.part.kind === "reasoning" /* ResponsePartKind.Reasoning */;
        });
        const reasoningAction = getActionEnvelope(reasoningPart).action;
        assert.strictEqual(reasoningAction.part.kind, "reasoning" /* ResponsePartKind.Reasoning */);
        // The second reasoning chunk produces a session/reasoning append action
        const appendNotif = await client.waitForNotification(n => isActionNotification(n, 'session/reasoning'));
        const appendAction = getActionEnvelope(appendNotif).action;
        assert.strictEqual(appendAction.type, 'session/reasoning');
        if (appendAction.type === 'session/reasoning') {
            assert.strictEqual(appendAction.content, ' about this...');
        }
        // Then the markdown response part
        const mdPart = await client.waitForNotification(n => {
            if (!isActionNotification(n, 'session/responsePart')) {
                return false;
            }
            const action = getActionEnvelope(n).action;
            return action.part.kind === "markdown" /* ResponsePartKind.Markdown */;
        });
        assert.ok(mdPart);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
    });
    // ---- Queued messages --------------------------------------------------------
    test('queued message is auto-consumed when session is idle', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-queue-idle');
        client.clearReceived();
        // Queue a message when the session is idle — server should immediately consume it
        client.notify('dispatchAction', {
            clientSeq: 1,
            action: {
                type: 'session/pendingMessageSet',
                session: sessionUri,
                kind: "queued" /* PendingMessageKind.Queued */,
                id: 'q-1',
                userMessage: { text: 'hello' },
            },
        });
        // The server should auto-consume the queued message and start a turn
        await client.waitForNotification(n => isActionNotification(n, 'session/turnStarted'));
        await client.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        // Verify the turn was created from the queued message
        const snapshot = await client.call('subscribe', { resource: sessionUri });
        const state = snapshot.snapshot.state;
        assert.ok(state.turns.length >= 1);
        assert.strictEqual(state.turns[state.turns.length - 1].userMessage.text, 'hello');
        // Queue should be empty after consumption
        assert.ok(!state.queuedMessages?.length, 'queued messages should be empty after consumption');
    });
    test('queued message waits for in-progress turn to complete', async function () {
        this.timeout(15_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-queue-wait');
        // Start a turn first
        dispatchTurnStarted(client, sessionUri, 'turn-first', 'hello', 1);
        // Wait for the first turn's response to confirm it is in progress
        await client.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
        // Queue a message while the turn is in progress
        client.notify('dispatchAction', {
            clientSeq: 2,
            action: {
                type: 'session/pendingMessageSet',
                session: sessionUri,
                kind: "queued" /* PendingMessageKind.Queued */,
                id: 'q-wait-1',
                userMessage: { text: 'hello' },
            },
        });
        // First turn should complete
        const firstComplete = await client.waitForNotification(n => {
            if (!isActionNotification(n, 'session/turnComplete')) {
                return false;
            }
            return getActionEnvelope(n).action.turnId === 'turn-first';
        });
        const firstSeq = getActionEnvelope(firstComplete).serverSeq;
        // The queued message's turn should complete AFTER the first turn
        const secondComplete = await client.waitForNotification(n => {
            if (!isActionNotification(n, 'session/turnComplete')) {
                return false;
            }
            const envelope = getActionEnvelope(n);
            return envelope.action.turnId !== 'turn-first'
                && envelope.serverSeq > firstSeq;
        });
        assert.ok(secondComplete, 'should receive a second turnComplete from the queued message');
        const snapshot = await client.call('subscribe', { resource: sessionUri });
        const state = snapshot.snapshot.state;
        assert.ok(state.turns.length >= 2, `expected >= 2 turns but got ${state.turns.length}`);
    });
    // ---- Steering messages ------------------------------------------------------
    test('steering message is set and consumed by agent', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-steering');
        // Start a turn first
        dispatchTurnStarted(client, sessionUri, 'turn-steer', 'hello', 1);
        // Set a steering message while the turn is in progress
        client.notify('dispatchAction', {
            clientSeq: 2,
            action: {
                type: 'session/pendingMessageSet',
                session: sessionUri,
                kind: "steering" /* PendingMessageKind.Steering */,
                id: 'steer-1',
                userMessage: { text: 'Please be concise' },
            },
        });
        // The steering message should be set in state initially
        const setNotif = await client.waitForNotification(n => isActionNotification(n, 'session/pendingMessageSet'));
        assert.ok(setNotif, 'should see pendingMessageSet action');
        // The mock agent consumes steering and fires steering_consumed,
        // which causes the server to dispatch pendingMessageRemoved
        const removedNotif = await client.waitForNotification(n => isActionNotification(n, 'session/pendingMessageRemoved'));
        assert.ok(removedNotif, 'should see pendingMessageRemoved after agent consumes steering');
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        // Steering should be cleared from state
        const snapshot = await client.call('subscribe', { resource: sessionUri });
        const state = snapshot.snapshot.state;
        assert.ok(!state.steeringMessage, 'steering message should be cleared after consumption');
    });
    // ---- Shell auto-approve -------------------------------------------------
    test('auto-approves allowed shell command (no pending confirmation)', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-shell-approve');
        client.clearReceived();
        // Start a turn that triggers a shell permission request for "ls -la" (allowed command)
        dispatchTurnStarted(client, sessionUri, 'turn-shell-approve', 'run-safe-command', 1);
        // The shell command should be auto-approved — we should see tool_start, tool_complete, and turn_complete
        // but NOT a pending-confirmation toolCallReady.
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallComplete'));
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        // Verify no pending-confirmation toolCallReady was received
        const pendingConfirmNotifs = client.receivedNotifications(n => {
            if (!isActionNotification(n, 'session/toolCallReady')) {
                return false;
            }
            const action = getActionEnvelope(n).action;
            return !action.confirmed;
        });
        assert.strictEqual(pendingConfirmNotifs.length, 0, 'should not have received pending-confirmation toolCallReady for allowed shell command');
    });
    test('blocks denied shell command (requires manual confirmation)', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-shell-deny');
        client.clearReceived();
        // Start a turn that triggers a shell permission request for "rm -rf /" (denied command)
        dispatchTurnStarted(client, sessionUri, 'turn-shell-deny', 'run-dangerous-command', 1);
        // The denied command should NOT be auto-approved — we should see toolCallReady (pending confirmation)
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
        await client.waitForNotification(n => isActionNotification(n, 'session/toolCallReady'));
        // Confirm it manually to let the turn complete
        client.notify('dispatchAction', {
            clientSeq: 2,
            action: {
                type: 'session/toolCallConfirmed',
                session: sessionUri,
                turnId: 'turn-shell-deny',
                toolCallId: 'tc-shell-deny-1',
                approved: true,
                confirmed: 'user-action',
            },
        });
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
    });
    // ---- Truncation tests ---------------------------------------------------
    test('truncate session removes turns after specified turn', async function () {
        this.timeout(15_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-truncate');
        // Create two turns
        dispatchTurnStarted(client, sessionUri, 'turn-t1', 'hello', 1);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete') && getActionEnvelope(n).action.turnId === 'turn-t1');
        client.clearReceived();
        dispatchTurnStarted(client, sessionUri, 'turn-t2', 'hello', 2);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete') && getActionEnvelope(n).action.turnId === 'turn-t2');
        // Verify 2 turns exist
        let snapshot = await client.call('subscribe', { resource: sessionUri });
        let state = snapshot.snapshot.state;
        assert.strictEqual(state.turns.length, 2);
        client.clearReceived();
        // Truncate: keep only turn-t1
        client.notify('dispatchAction', {
            clientSeq: 3,
            action: { type: 'session/truncated', session: sessionUri, turnId: 'turn-t1' },
        });
        await client.waitForNotification(n => isActionNotification(n, 'session/truncated'));
        snapshot = await client.call('subscribe', { resource: sessionUri });
        state = snapshot.snapshot.state;
        assert.strictEqual(state.turns.length, 1);
        assert.strictEqual(state.turns[0].id, 'turn-t1');
    });
    test('truncate all turns clears session history', async function () {
        this.timeout(15_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-truncate-all');
        dispatchTurnStarted(client, sessionUri, 'turn-ta1', 'hello', 1);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        client.clearReceived();
        // Truncate all (no turnId)
        client.notify('dispatchAction', {
            clientSeq: 2,
            action: { type: 'session/truncated', session: sessionUri },
        });
        await client.waitForNotification(n => isActionNotification(n, 'session/truncated'));
        const snapshot = await client.call('subscribe', { resource: sessionUri });
        const state = snapshot.snapshot.state;
        assert.strictEqual(state.turns.length, 0);
    });
    test('new turn after truncation works correctly', async function () {
        this.timeout(15_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-truncate-resume');
        dispatchTurnStarted(client, sessionUri, 'turn-tr1', 'hello', 1);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete') && getActionEnvelope(n).action.turnId === 'turn-tr1');
        client.clearReceived();
        dispatchTurnStarted(client, sessionUri, 'turn-tr2', 'hello', 2);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete') && getActionEnvelope(n).action.turnId === 'turn-tr2');
        client.clearReceived();
        // Truncate to turn-tr1
        client.notify('dispatchAction', {
            clientSeq: 3,
            action: { type: 'session/truncated', session: sessionUri, turnId: 'turn-tr1' },
        });
        await client.waitForNotification(n => isActionNotification(n, 'session/truncated'));
        // Send a new turn after truncation
        dispatchTurnStarted(client, sessionUri, 'turn-tr3', 'hello', 4);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
        const snapshot = await client.call('subscribe', { resource: sessionUri });
        const state = snapshot.snapshot.state;
        assert.strictEqual(state.turns.length, 2);
        assert.strictEqual(state.turns[0].id, 'turn-tr1');
        assert.strictEqual(state.turns[1].id, 'turn-tr3');
    });
    // ---- Fork tests ---------------------------------------------------------
    test('fork creates a new session with source history', async function () {
        this.timeout(15_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-fork');
        // Create two turns
        dispatchTurnStarted(client, sessionUri, 'turn-f1', 'hello', 1);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete') && getActionEnvelope(n).action.turnId === 'turn-f1');
        client.clearReceived();
        dispatchTurnStarted(client, sessionUri, 'turn-f2', 'hello', 2);
        await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete') && getActionEnvelope(n).action.turnId === 'turn-f2');
        client.clearReceived();
        // Fork at turn-f1 (keep turns up to and including turn-f1)
        const forkedSessionUri = nextSessionUri();
        await client.call('createSession', {
            session: forkedSessionUri,
            provider: 'mock',
            fork: { session: sessionUri, turnId: 'turn-f1' },
        });
        const addedNotif = await client.waitForNotification(n => n.method === 'notification' && n.params.notification.type === 'notify/sessionAdded');
        const addedSession = addedNotif.params.notification;
        // Subscribe — forked session should have 1 turn (from the protocol state
        // populated during createSession with fork params).
        const snapshot = await client.call('subscribe', { resource: addedSession.summary.resource });
        const state = snapshot.snapshot.state;
        assert.strictEqual(state.lifecycle, 'ready');
        assert.strictEqual(state.turns.length, 1, 'forked session should have 1 turn');
        // Source session should be unaffected
        const sourceSnapshot = await client.call('subscribe', { resource: sessionUri });
        const sourceState = sourceSnapshot.snapshot.state;
        assert.strictEqual(sourceState.turns.length, 2);
    });
    test('fork with invalid turn ID returns error', async function () {
        this.timeout(10_000);
        const sessionUri = await createAndSubscribeSession(client, 'test-fork-invalid');
        let gotError = false;
        try {
            await client.call('createSession', {
                session: nextSessionUri(),
                provider: 'mock',
                fork: { session: sessionUri, turnId: 'nonexistent-turn' },
            });
        }
        catch {
            gotError = true;
        }
        assert.ok(gotError, 'should get error for invalid fork turn ID');
    });
    test('fork with invalid source session returns error', async function () {
        this.timeout(10_000);
        await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-fork-no-source' });
        let gotError = false;
        try {
            await client.call('createSession', {
                session: nextSessionUri(),
                provider: 'mock',
                fork: { session: 'mock://nonexistent-session', turnId: 'turn-1' },
            });
        }
        catch {
            gotError = true;
        }
        assert.ok(gotError, 'should get error for invalid fork source session');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdG9jb2xXZWJTb2NrZXQuaW50ZWdyYXRpb25UZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3Qvbm9kZS9wcm90b2NvbFdlYlNvY2tldC5pbnRlZ3JhdGlvblRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBZ0IsSUFBSSxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ25ELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFDcEMsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLElBQUksQ0FBQztBQUMvQixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBR3JELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzdFLE9BQU8sRUFDTixxQkFBcUIsRUFDckIsaUJBQWlCLEVBQ2pCLG9CQUFvQixFQVVwQixNQUFNLHVDQUF1QyxDQUFDO0FBRS9DLE9BQU8sRUFBRSxlQUFlLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQVMzRSxNQUFNLGtCQUFrQjtJQU92QixZQUFZLElBQVk7UUFMaEIsWUFBTyxHQUFHLENBQUMsQ0FBQztRQUNILGtCQUFhLEdBQUcsSUFBSSxHQUFHLEVBQXdCLENBQUM7UUFDaEQsbUJBQWMsR0FBdUIsRUFBRSxDQUFDO1FBQ3hDLGtCQUFhLEdBQTRILEVBQUUsQ0FBQztRQUc1SixJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksU0FBUyxDQUFDLGtCQUFrQixJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTztRQUNaLE9BQU8sSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDNUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRTtnQkFDeEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLENBQUMsSUFBcUIsRUFBRSxFQUFFO29CQUNoRCxNQUFNLElBQUksR0FBRyxPQUFPLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDdEUsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDN0IsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDMUIsQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsT0FBTyxFQUFFLENBQUM7WUFDWCxDQUFDLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM5QixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxjQUFjLENBQUMsR0FBcUI7UUFDM0MsSUFBSSxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzVCLDJDQUEyQztZQUMzQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDL0MsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDYixJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2xDLE1BQU0sT0FBTyxHQUFHLEdBQTRCLENBQUM7Z0JBQzdDLElBQUksT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUNuQixPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDbEQsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE9BQU8sQ0FBQyxPQUFPLENBQUUsR0FBK0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDMUQsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO2FBQU0sSUFBSSxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLG9DQUFvQztZQUNwQyxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUM7WUFDbEIsc0JBQXNCO1lBQ3RCLEtBQUssSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDekQsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUM1QyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2xELE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3ZCLENBQUM7WUFDRixDQUFDO1lBQ0QsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDakMsQ0FBQztJQUNGLENBQUM7SUFFRCxzREFBc0Q7SUFDdEQsTUFBTSxDQUFDLE1BQWMsRUFBRSxNQUFnQjtRQUN0QyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFRCxzREFBc0Q7SUFDdEQsSUFBSSxDQUFJLE1BQWMsRUFBRSxNQUFnQixFQUFFLFNBQVMsR0FBRyxJQUFJO1FBQ3pELE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUMxQixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV0RSxPQUFPLElBQUksT0FBTyxDQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3pDLE1BQU0sS0FBSyxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7Z0JBQzdCLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM5QixNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsbUNBQW1DLE1BQU0sUUFBUSxFQUFFLEtBQUssU0FBUyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQzNGLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUVkLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRTtnQkFDMUIsT0FBTyxFQUFFLE1BQU0sQ0FBQyxFQUFFLEdBQUcsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDakUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxFQUFFLEdBQUcsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNwRCxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCwyREFBMkQ7SUFDM0QsbUJBQW1CLENBQUMsU0FBMkMsRUFBRSxTQUFTLEdBQUcsSUFBSTtRQUNoRixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNyRCxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2xDLENBQUM7UUFFRCxPQUFPLElBQUksT0FBTyxDQUFtQixDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUN4RCxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsR0FBRyxFQUFFO2dCQUM3QixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLEtBQUssT0FBTyxDQUFDLENBQUM7Z0JBQ3JFLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUNkLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDbkMsQ0FBQztnQkFDRCxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMscUNBQXFDLFNBQVMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN4RSxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFFZCxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQztnQkFDdkIsU0FBUztnQkFDVCxPQUFPLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNsRCxNQUFNO2FBQ04sQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsOERBQThEO0lBQzlELHFCQUFxQixDQUFDLFNBQTRDO1FBQ2pFLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUNyRixDQUFDO0lBRUQsdUVBQXVFO0lBQ3ZFLE9BQU8sQ0FBQyxJQUFZO1FBQ25CLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxxREFBcUQ7SUFDckQsaUJBQWlCLENBQUMsU0FBUyxHQUFHLElBQUk7UUFDakMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUN0QyxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsR0FBRyxFQUFFO2dCQUM3QixPQUFPLEVBQUUsQ0FBQztnQkFDVixNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsb0NBQW9DLFNBQVMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN2RSxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDZCxNQUFNLEtBQUssR0FBRyxDQUFDLElBQXFCLEVBQUUsRUFBRTtnQkFDdkMsT0FBTyxFQUFFLENBQUM7Z0JBQ1YsTUFBTSxJQUFJLEdBQUcsT0FBTyxJQUFJLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3RFLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDM0IsQ0FBQyxDQUFDO1lBQ0YsTUFBTSxPQUFPLEdBQUcsR0FBRyxFQUFFO2dCQUNwQixZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3BCLElBQUksQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMzQyxDQUFDLENBQUM7WUFDRixJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSztRQUNKLEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3BDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUN0QyxDQUFDO1FBQ0QsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQzlCLEtBQUssTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3hDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUN0QyxDQUFDO1FBQ0QsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUMzQixJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ2xCLENBQUM7SUFFRCxhQUFhO1FBQ1osSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7Q0FDRDtBQUVELGdGQUFnRjtBQUVoRixLQUFLLFVBQVUsV0FBVztJQUN6QixPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQ3RDLE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxtQ0FBbUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDaEcsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLDRCQUE0QixDQUFDLEVBQUU7WUFDL0csS0FBSyxFQUFFLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDO1NBQ3RDLENBQUMsQ0FBQztRQUVILE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFDL0IsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2IsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQztRQUMvQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFWCxLQUFLLENBQUMsTUFBTyxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFZLEVBQUUsRUFBRTtZQUN6QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDN0IsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUN4QyxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUNYLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDdEIsT0FBTyxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDM0QsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLE1BQU8sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRTtZQUM3Qiw0RUFBNEU7UUFDN0UsQ0FBQyxDQUFDLENBQUM7UUFFSCxLQUFLLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsRUFBRTtZQUN2QixZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2IsQ0FBQyxDQUFDLENBQUM7UUFFSCxLQUFLLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsRUFBRTtZQUN2QixZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdEIsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLHVDQUF1QyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEUsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxnRkFBZ0Y7QUFFaEYsSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDO0FBRXZCLFNBQVMsY0FBYztJQUN0QixPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxpQkFBaUIsRUFBRSxjQUFjLEVBQUUsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7QUFDM0YsQ0FBQztBQUVELFNBQVMsb0JBQW9CLENBQUMsQ0FBbUIsRUFBRSxVQUFrQjtJQUNwRSxJQUFJLENBQUMsQ0FBQyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDM0IsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDLE1BQW9DLENBQUM7SUFDeEQsT0FBTyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxVQUFVLENBQUM7QUFDNUMsQ0FBQztBQUVELFNBQVMsaUJBQWlCLENBQUMsQ0FBbUI7SUFDN0MsT0FBTyxDQUFDLENBQUMsTUFBb0MsQ0FBQztBQUMvQyxDQUFDO0FBRUQsMEVBQTBFO0FBQzFFLEtBQUssVUFBVSx5QkFBeUIsQ0FBQyxDQUFxQixFQUFFLFFBQWdCLEVBQUUsZ0JBQXlCO0lBQzFHLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUU1RSxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO0lBRWpHLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQzdDLENBQUMsQ0FBQyxNQUFNLEtBQUssY0FBYyxJQUFLLENBQUMsQ0FBQyxNQUF1QyxDQUFDLFlBQVksQ0FBQyxJQUFJLEtBQUsscUJBQXFCLENBQ3JILENBQUM7SUFDRixNQUFNLGNBQWMsR0FBSyxLQUFLLENBQUMsTUFBdUMsQ0FBQyxZQUEwQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUM7SUFFbkksTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFtQixXQUFXLEVBQUUsRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztJQUMxRSxDQUFDLENBQUMsYUFBYSxFQUFFLENBQUM7SUFFbEIsT0FBTyxjQUFjLENBQUM7QUFDdkIsQ0FBQztBQUVELFNBQVMsbUJBQW1CLENBQUMsQ0FBcUIsRUFBRSxPQUFlLEVBQUUsTUFBYyxFQUFFLElBQVksRUFBRSxTQUFpQjtJQUNuSCxDQUFDLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFO1FBQzFCLFNBQVM7UUFDVCxNQUFNLEVBQUU7WUFDUCxJQUFJLEVBQUUscUJBQXFCO1lBQzNCLE9BQU87WUFDUCxNQUFNO1lBQ04sV0FBVyxFQUFFLEVBQUUsSUFBSSxFQUFFO1NBQ3JCO0tBQ0QsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELGdGQUFnRjtBQUVoRixLQUFLLENBQUMsd0JBQXdCLEVBQUU7SUFFL0IsSUFBSSxNQUErQyxDQUFDO0lBQ3BELElBQUksTUFBMEIsQ0FBQztJQUUvQixVQUFVLENBQUMsS0FBSztRQUNmLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDckIsTUFBTSxHQUFHLE1BQU0sV0FBVyxFQUFFLENBQUM7SUFDOUIsQ0FBQyxDQUFDLENBQUM7SUFFSCxhQUFhLENBQUM7UUFDYixNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ3ZCLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLEtBQUs7UUFDVixJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JCLE1BQU0sR0FBRyxJQUFJLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM3QyxNQUFNLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUN4QixDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQztRQUNSLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNoQixDQUFDLENBQUMsQ0FBQztJQUVILGVBQWU7SUFDZixJQUFJLENBQUMsNkRBQTZELEVBQUUsS0FBSztRQUN4RSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXBCLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBb0IsWUFBWSxFQUFFO1lBQ2pFLGVBQWUsRUFBRSxnQkFBZ0I7WUFDakMsUUFBUSxFQUFFLGdCQUFnQjtZQUMxQixvQkFBb0IsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1NBQ25GLENBQUMsQ0FBQztRQUVILE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzdELE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFNBQVMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNqQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDO0lBQzVFLENBQUMsQ0FBQyxDQUFDO0lBRUgsb0JBQW9CO0lBQ3BCLElBQUksQ0FBQyxtREFBbUQsRUFBRSxLQUFLO1FBQzlELElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFckIsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxFQUFFLGVBQWUsRUFBRSxnQkFBZ0IsRUFBRSxRQUFRLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO1FBRXhHLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFFcEYsTUFBTSxLQUFLLEdBQUcsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FDbEQsQ0FBQyxDQUFDLE1BQU0sS0FBSyxjQUFjLElBQUssQ0FBQyxDQUFDLE1BQXVDLENBQUMsWUFBWSxDQUFDLElBQUksS0FBSyxxQkFBcUIsQ0FDckgsQ0FBQztRQUNGLE1BQU0sWUFBWSxHQUFJLEtBQUssQ0FBQyxNQUF1QyxDQUFDLFlBQXlDLENBQUM7UUFDOUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzVFLE1BQU0sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDM0QsQ0FBQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUM7SUFDdkMsSUFBSSxDQUFDLHNEQUFzRCxFQUFFLEtBQUs7UUFDakUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBQ2hGLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU5RCxNQUFNLFlBQVksR0FBRyxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFDNUcsTUFBTSxrQkFBa0IsR0FBRyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUE2QixDQUFDO1FBQ3pGLE1BQU0sQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksNkNBQTRCLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBRSxrQkFBa0IsQ0FBQyxJQUE4QixDQUFDLE9BQU8sRUFBRSxlQUFlLENBQUMsQ0FBQztRQUVoRyxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7SUFDeEYsQ0FBQyxDQUFDLENBQUM7SUFFSCwrQkFBK0I7SUFDL0IsSUFBSSxDQUFDLGlGQUFpRixFQUFFLEtBQUs7UUFDNUYsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1FBQ25GLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVwRSxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFDeEYsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLE1BQU0sWUFBWSxHQUFHLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLDBCQUEwQixDQUFDLENBQUMsQ0FBQztRQUNoSCxNQUFNLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDeEQsSUFBSSxRQUFRLENBQUMsSUFBSSxLQUFLLDBCQUEwQixFQUFFLENBQUM7WUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNuRCxDQUFDO1FBQ0QsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBQ3ZGLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztJQUN4RixDQUFDLENBQUMsQ0FBQztJQUVILG9CQUFvQjtJQUNwQixJQUFJLENBQUMscUNBQXFDLEVBQUUsS0FBSztRQUNoRCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sVUFBVSxHQUFHLE1BQU0seUJBQXlCLENBQUMsTUFBTSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQ3pFLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVoRSxNQUFNLFVBQVUsR0FBRyxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBQ25HLE1BQU0sV0FBVyxHQUFHLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUN6RCxJQUFJLFdBQVcsQ0FBQyxJQUFJLEtBQUssZUFBZSxFQUFFLENBQUM7WUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3ZFLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILG1EQUFtRDtJQUNuRCxJQUFJLENBQUMseUNBQXlDLEVBQUUsS0FBSztRQUNwRCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sVUFBVSxHQUFHLE1BQU0seUJBQXlCLENBQUMsTUFBTSxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDOUUsbUJBQW1CLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXRFLGlGQUFpRjtRQUNqRixNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFDeEYsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1FBRXhGLHdCQUF3QjtRQUN4QixNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFO1lBQy9CLFNBQVMsRUFBRSxDQUFDO1lBQ1osTUFBTSxFQUFFO2dCQUNQLElBQUksRUFBRSwyQkFBMkI7Z0JBQ2pDLE9BQU8sRUFBRSxVQUFVO2dCQUNuQixNQUFNLEVBQUUsV0FBVztnQkFDbkIsVUFBVSxFQUFFLFdBQVc7Z0JBQ3ZCLFFBQVEsRUFBRSxJQUFJO2FBQ2Q7U0FDRCxDQUFDLENBQUM7UUFFSCxNQUFNLFlBQVksR0FBRyxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFDNUcsTUFBTSxrQkFBa0IsR0FBRyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUE2QixDQUFDO1FBQ3pGLE1BQU0sQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksNkNBQTRCLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBRSxrQkFBa0IsQ0FBQyxJQUE4QixDQUFDLE9BQU8sRUFBRSxVQUFVLENBQUMsQ0FBQztRQUUzRixNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7SUFDeEYsQ0FBQyxDQUFDLENBQUM7SUFFSCxrQkFBa0I7SUFDbEIsSUFBSSxDQUFDLCtCQUErQixFQUFFLEtBQUs7UUFDMUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxvQkFBb0IsRUFBRSxDQUFDLENBQUM7UUFFdkcsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUNwRixNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUNwQyxDQUFDLENBQUMsTUFBTSxLQUFLLGNBQWMsSUFBSyxDQUFDLENBQUMsTUFBdUMsQ0FBQyxZQUFZLENBQUMsSUFBSSxLQUFLLHFCQUFxQixDQUNySCxDQUFDO1FBRUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFzQixjQUFjLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDdkMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUUsa0NBQWtDLENBQUMsQ0FBQztJQUN6RSxDQUFDLENBQUMsQ0FBQztJQUVILGVBQWU7SUFDZixJQUFJLENBQUMsa0NBQWtDLEVBQUUsS0FBSztRQUM3QyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sVUFBVSxHQUFHLE1BQU0seUJBQXlCLENBQUMsTUFBTSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDN0UsbUJBQW1CLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUV2RixNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLFFBQVEsQ0FBQyxDQUFDO1FBQzVFLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNqQyxNQUFNLGFBQWEsR0FBRyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBRXJFLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUVmLE1BQU0sT0FBTyxHQUFHLElBQUksa0JBQWtCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BELE1BQU0sT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3hCLE1BQU0sTUFBTSxHQUFHLE1BQU0sT0FBTyxDQUFDLElBQUksQ0FBbUIsV0FBVyxFQUFFO1lBQ2hFLFFBQVEsRUFBRSxnQkFBZ0I7WUFDMUIsaUJBQWlCLEVBQUUsYUFBYTtZQUNoQyxhQUFhLEVBQUUsQ0FBQyxVQUFVLENBQUM7U0FDM0IsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxNQUFNLENBQUMsSUFBSSxLQUFLLFVBQVUsRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1FBQ3ZHLElBQUksTUFBTSxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUM5QixNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO1FBQ3RFLENBQUM7UUFFRCxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDakIsQ0FBQyxDQUFDLENBQUM7SUFFSCw4RUFBOEU7SUFFOUUsSUFBSSxDQUFDLDBDQUEwQyxFQUFFLEtBQUs7UUFDckQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN6RSxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdkUsTUFBTSxVQUFVLEdBQUcsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUNuRyxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQyxNQUFzQixDQUFDO1FBQ3pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDdkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUV2RCxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFFdkYsTUFBTSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFtQixXQUFXLEVBQUUsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUM1RixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLEtBQXNCLENBQUM7UUFDdkQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNuQyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RCLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQU0sQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBTSxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNsRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxLQUFLO1FBQ2xELElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFckIsTUFBTSxVQUFVLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUU5RSxNQUFNLGVBQWUsR0FBRyxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQW1CLFdBQVcsRUFBRSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ25HLE1BQU0saUJBQWlCLEdBQUksZUFBZSxDQUFDLFFBQVEsQ0FBQyxLQUF1QixDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUM7UUFFL0YsTUFBTSxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV0RCxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEUsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBRXZGLE1BQU0sZUFBZSxHQUFHLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBbUIsV0FBVyxFQUFFLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDbkcsTUFBTSxpQkFBaUIsR0FBSSxlQUFlLENBQUMsUUFBUSxDQUFDLEtBQXVCLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQztRQUMvRixNQUFNLENBQUMsRUFBRSxDQUFDLGlCQUFpQixJQUFJLGlCQUFpQixDQUFDLENBQUM7SUFDbkQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkRBQTJELEVBQUUsS0FBSztRQUN0RSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQztRQUV4RyxzQ0FBc0M7UUFDdEMsSUFBSSxRQUFRLEdBQUcsS0FBSyxDQUFDO1FBQ3JCLElBQUksQ0FBQztZQUNKLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFDNUYsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNSLFFBQVEsR0FBRyxJQUFJLENBQUM7UUFDakIsQ0FBQztRQUNELE1BQU0sQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFFLG9EQUFvRCxDQUFDLENBQUM7UUFFMUUsb0NBQW9DO1FBQ3BDLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDcEYsTUFBTSxLQUFLLEdBQUcsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FDbEQsQ0FBQyxDQUFDLE1BQU0sS0FBSyxjQUFjLElBQUssQ0FBQyxDQUFDLE1BQXVDLENBQUMsWUFBWSxDQUFDLElBQUksS0FBSyxxQkFBcUIsQ0FDckgsQ0FBQztRQUNGLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkNBQTJDLEVBQUUsS0FBSztRQUN0RCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sVUFBVSxHQUFHLE1BQU0seUJBQXlCLENBQUMsTUFBTSxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFFOUUsbUJBQW1CLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUV2RixtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN2RCxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFFdkYsTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFvQixZQUFZLEVBQUUsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3RHLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDcEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLE1BQU0sQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDdEQsQ0FBQyxDQUFDLENBQUM7SUFFSCwrRUFBK0U7SUFFL0UsSUFBSSxDQUFDLG1EQUFtRCxFQUFFLEtBQUs7UUFDOUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQztRQUMzRSxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUU3RCxNQUFNLEtBQUssR0FBRyxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUNsRCxDQUFDLENBQUMsTUFBTSxLQUFLLGNBQWMsSUFBSyxDQUFDLENBQUMsTUFBdUMsQ0FBQyxZQUFZLENBQUMsSUFBSSxLQUFLLHVCQUF1QixDQUN2SCxDQUFDO1FBQ0YsTUFBTSxPQUFPLEdBQUksS0FBSyxDQUFDLE1BQXVDLENBQUMsWUFBMkMsQ0FBQztRQUMzRyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsVUFBVSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDdkUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMENBQTBDLEVBQUUsS0FBSztRQUNyRCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sVUFBVSxHQUFHLE1BQU0seUJBQXlCLENBQUMsTUFBTSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBQzFFLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVsRSxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFO1lBQy9CLFNBQVMsRUFBRSxDQUFDO1lBQ1osTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLHVCQUF1QixFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRTtTQUNyRixDQUFDLENBQUM7UUFFSCxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFFeEYsTUFBTSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFtQixXQUFXLEVBQUUsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUM1RixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLEtBQXNCLENBQUM7UUFDdkQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNuQyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQzVFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlEQUFpRCxFQUFFLEtBQUs7UUFDNUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBRS9FLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMvRCxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFFdkYsbUJBQW1CLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQy9ELE1BQU0sSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDdkQsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBRXZGLE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBbUIsV0FBVyxFQUFFLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDNUYsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFzQixDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFLCtCQUErQixLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDeEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ2xELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEtBQUs7UUFDekQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO1FBRWxGLE1BQU0sT0FBTyxHQUFHLElBQUksa0JBQWtCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BELE1BQU0sT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3hCLE1BQU0sT0FBTyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQztRQUN6RyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDMUQsT0FBTyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBRXhCLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUvRCxNQUFNLEVBQUUsR0FBRyxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFDbEcsTUFBTSxFQUFFLEdBQUcsTUFBTSxPQUFPLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBQ25HLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRWQsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBQ3ZGLE1BQU0sT0FBTyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUV4RixPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDakIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNkNBQTZDLEVBQUUsS0FBSztRQUN4RCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sVUFBVSxHQUFHLE1BQU0seUJBQXlCLENBQUMsTUFBTSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDL0UsTUFBTSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUN2RCxNQUFNLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUV2QixNQUFNLE9BQU8sR0FBRyxJQUFJLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwRCxNQUFNLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN4QixNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxtQkFBbUIsRUFBRSxDQUFDLENBQUM7UUFDdkcsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBRTFELG1CQUFtQixDQUFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuRSxNQUFNLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFFeEYsTUFBTSxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN2RCxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUM5RixNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLHdEQUF3RCxDQUFDLENBQUM7UUFFdkcsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ2pCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEtBQUs7UUFDdEQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBRWhGLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUU7WUFDL0IsU0FBUyxFQUFFLENBQUM7WUFDWixNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsc0JBQXNCLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUU7U0FDdEYsQ0FBQyxDQUFDO1FBRUgsTUFBTSxZQUFZLEdBQUcsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBQzVHLE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztRQUN4RCxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssc0JBQXNCLEVBQUUsQ0FBQztZQUM1QyxNQUFNLENBQUMsV0FBVyxDQUFFLE1BQTRCLENBQUMsS0FBSyxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDM0UsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBbUIsV0FBVyxFQUFFLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDNUYsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFzQixDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUMzRCxDQUFDLENBQUMsQ0FBQztJQUVILCtFQUErRTtJQUUvRSxJQUFJLENBQUMsdUVBQXVFLEVBQUUsS0FBSztRQUNsRixJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFFakcscUVBQXFFO1FBQ3JFLG1FQUFtRTtRQUNuRSxtQ0FBbUM7UUFDbkMsTUFBTSxjQUFjLEdBQUcsd0JBQXdCLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDM0QsTUFBTSxJQUFJLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFzQixjQUFjLENBQUMsQ0FBQztRQUNwRSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEtBQUssY0FBYyxDQUFDLENBQUM7UUFDeEUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsc0RBQXNELENBQUMsQ0FBQztRQUUvRSx3RUFBd0U7UUFDeEUsTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBRXZCLG1FQUFtRTtRQUNuRSx3RUFBd0U7UUFDeEUsTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFtQixXQUFXLEVBQUUsRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztRQUM5RixNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQXNCLENBQUM7UUFFckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLE9BQU8sRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDO1FBQzFGLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFLDZDQUE2QyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFFdEcsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1QixNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLHNCQUFzQixDQUFDLENBQUM7UUFDbEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUE4QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksK0NBQThCLENBQUMsQ0FBQztRQUN6SCxNQUFNLENBQUMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFLDJDQUEyQyxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUNyRSxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBOEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLCtDQUE4QixDQUFDLENBQUM7UUFDbkgsTUFBTSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxvREFBb0QsQ0FBQyxDQUFDO1FBRW5ILGtFQUFrRTtRQUNsRSw4REFBOEQ7UUFDOUQsTUFBTSxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN2RCxNQUFNLGtCQUFrQixHQUFHLE1BQU0sQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUMzRCxDQUFDLENBQUMsTUFBTSxLQUFLLGNBQWMsSUFBSyxDQUFDLENBQUMsTUFBdUMsQ0FBQyxZQUFZLENBQUMsSUFBSSxLQUFLLHFCQUFxQixDQUNySCxDQUFDO1FBQ0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLHNDQUFzQyxDQUFDLENBQUM7SUFDMUYsQ0FBQyxDQUFDLENBQUM7SUFFSCxnRkFBZ0Y7SUFFaEYsSUFBSSxDQUFDLGlFQUFpRSxFQUFFLEtBQUs7UUFDNUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxzQkFBc0IsRUFBRSxDQUFDLENBQUM7UUFFekcsTUFBTSxPQUFPLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEQsTUFBTSxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDeEIsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxFQUFFLGVBQWUsRUFBRSxnQkFBZ0IsRUFBRSxRQUFRLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQyxDQUFDO1FBRTFHLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUN2QixPQUFPLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFeEIsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUVwRixNQUFNLEVBQUUsR0FBRyxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUMvQyxDQUFDLENBQUMsTUFBTSxLQUFLLGNBQWMsSUFBSyxDQUFDLENBQUMsTUFBdUMsQ0FBQyxZQUFZLENBQUMsSUFBSSxLQUFLLHFCQUFxQixDQUNySCxDQUFDO1FBQ0YsTUFBTSxFQUFFLEdBQUcsTUFBTSxPQUFPLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FDaEQsQ0FBQyxDQUFDLE1BQU0sS0FBSyxjQUFjLElBQUssQ0FBQyxDQUFDLE1BQXVDLENBQUMsWUFBWSxDQUFDLElBQUksS0FBSyxxQkFBcUIsQ0FDckgsQ0FBQztRQUNGLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLHNDQUFzQyxDQUFDLENBQUM7UUFDdEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsc0NBQXNDLENBQUMsQ0FBQztRQUV0RCxNQUFNLElBQUksR0FBSyxFQUFFLENBQUMsTUFBdUMsQ0FBQyxZQUEwQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUM7UUFDdEgsTUFBTSxJQUFJLEdBQUssRUFBRSxDQUFDLE1BQXVDLENBQUMsWUFBMEMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDO1FBQ3RILE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSw4Q0FBOEMsQ0FBQyxDQUFDO1FBRS9FLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNqQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtRUFBbUUsRUFBRSxLQUFLO1FBQzlFLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFckIsTUFBTSxVQUFVLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUseUJBQXlCLENBQUMsQ0FBQztRQUV0RixNQUFNLE9BQU8sR0FBRyxJQUFJLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwRCxNQUFNLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN4QixNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSx5QkFBeUIsRUFBRSxDQUFDLENBQUM7UUFDN0csT0FBTyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBRXhCLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBRTdELE1BQU0sRUFBRSxHQUFHLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQy9DLENBQUMsQ0FBQyxNQUFNLEtBQUssY0FBYyxJQUFLLENBQUMsQ0FBQyxNQUF1QyxDQUFDLFlBQVksQ0FBQyxJQUFJLEtBQUssdUJBQXVCLENBQ3ZILENBQUM7UUFDRixNQUFNLEVBQUUsR0FBRyxNQUFNLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUNoRCxDQUFDLENBQUMsTUFBTSxLQUFLLGNBQWMsSUFBSyxDQUFDLENBQUMsTUFBdUMsQ0FBQyxZQUFZLENBQUMsSUFBSSxLQUFLLHVCQUF1QixDQUN2SCxDQUFDO1FBQ0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsd0NBQXdDLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxpRUFBaUUsQ0FBQyxDQUFDO1FBRWpGLE1BQU0sUUFBUSxHQUFJLEVBQUUsQ0FBQyxNQUF1QyxDQUFDLFlBQTJDLENBQUM7UUFDekcsTUFBTSxRQUFRLEdBQUksRUFBRSxDQUFDLE1BQXVDLENBQUMsWUFBMkMsQ0FBQztRQUN6RyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsVUFBVSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDdkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBRXZFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNqQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1REFBdUQsRUFBRSxLQUFLO1FBQ2xFLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFckIsTUFBTSxVQUFVLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUUvRSxNQUFNLE9BQU8sR0FBRyxJQUFJLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwRCxNQUFNLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN4QixNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxrQkFBa0IsRUFBRSxDQUFDLENBQUM7UUFDdEcsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUN2QixPQUFPLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFeEIsK0JBQStCO1FBQy9CLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVuRSxNQUFNLEVBQUUsR0FBRyxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFDbEcsTUFBTSxFQUFFLEdBQUcsTUFBTSxPQUFPLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBQ25HLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLHFEQUFxRCxDQUFDLENBQUM7UUFDckUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsMENBQTBDLENBQUMsQ0FBQztRQUUxRCxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFDdkYsTUFBTSxPQUFPLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBRXhGLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNqQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpREFBaUQsRUFBRSxLQUFLO1FBQzVELElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFckIsTUFBTSxVQUFVLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztRQUVuRixNQUFNLE9BQU8sR0FBRyxJQUFJLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwRCxNQUFNLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN4QixNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxzQkFBc0IsRUFBRSxDQUFDLENBQUM7UUFDMUcsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUN2QixPQUFPLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFeEIsbUJBQW1CLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXZFLGtEQUFrRDtRQUNsRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDbkMsTUFBTSxDQUFDLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1lBQ25GLE1BQU0sQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQztZQUNuRixNQUFNLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDLENBQUM7WUFDdEYsTUFBTSxDQUFDLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1lBQ2xGLE1BQU0sQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUNuRixDQUFDO1FBRUQsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ2pCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHNFQUFzRSxFQUFFLEtBQUs7UUFDakYsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBRTdFLE1BQU0sT0FBTyxHQUFHLElBQUksa0JBQWtCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BELE1BQU0sT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3hCLE1BQU0sT0FBTyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixFQUFFLENBQUMsQ0FBQztRQUNwRyw2Q0FBNkM7UUFDN0MsT0FBTyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBRXhCLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuRSxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFFdkYsaURBQWlEO1FBQ2pELE1BQU0sSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDdkQsTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQztRQUNqRixNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLHVEQUF1RCxDQUFDLENBQUM7UUFFdEcsa0VBQWtFO1FBQ2xFLE9BQU8sQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUN4QixNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUU3RCxNQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUNyRCxDQUFDLENBQUMsTUFBTSxLQUFLLGNBQWMsSUFBSyxDQUFDLENBQUMsTUFBdUMsQ0FBQyxZQUFZLENBQUMsSUFBSSxLQUFLLHVCQUF1QixDQUN2SCxDQUFDO1FBQ0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsc0VBQXNFLENBQUMsQ0FBQztRQUUzRixPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDakIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsaURBQWlELEVBQUUsS0FBSztRQUM1RCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sVUFBVSxHQUFHLE1BQU0seUJBQXlCLENBQUMsTUFBTSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQzVFLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFFdkYsOENBQThDO1FBQzlDLE1BQU0sT0FBTyxHQUFHLElBQUksa0JBQWtCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BELE1BQU0sT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3hCLE1BQU0sT0FBTyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLGlCQUFpQixFQUFFLENBQUMsQ0FBQztRQUVyRyxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQW1CLFdBQVcsRUFBRSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsS0FBc0IsQ0FBQztRQUNyRCxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRSxrREFBa0QsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzNHLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDbkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxVQUFVLENBQUMsQ0FBQztRQUVyRCxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDakIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNkRBQTZELEVBQUUsS0FBSztRQUN4RSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sVUFBVSxHQUFHLE1BQU0seUJBQXlCLENBQUMsTUFBTSxFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFFaEYsTUFBTSxPQUFPLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEQsTUFBTSxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDeEIsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxFQUFFLGVBQWUsRUFBRSxnQkFBZ0IsRUFBRSxRQUFRLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZHLE1BQU0sT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDdkIsT0FBTyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBRXhCLHNDQUFzQztRQUN0QyxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU1RSxvREFBb0Q7UUFDcEQsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLE1BQU0sT0FBTyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQztRQUN6RixNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFDeEYsTUFBTSxPQUFPLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1FBRXpGLGtDQUFrQztRQUNsQyxPQUFPLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFO1lBQ2hDLFNBQVMsRUFBRSxDQUFDO1lBQ1osTUFBTSxFQUFFO2dCQUNQLElBQUksRUFBRSwyQkFBMkI7Z0JBQ2pDLE9BQU8sRUFBRSxVQUFVO2dCQUNuQixNQUFNLEVBQUUsaUJBQWlCO2dCQUN6QixVQUFVLEVBQUUsV0FBVztnQkFDdkIsUUFBUSxFQUFFLElBQUk7YUFDZDtTQUNELENBQUMsQ0FBQztRQUVILDJEQUEyRDtRQUMzRCxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFDdkYsTUFBTSxPQUFPLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUN2RixNQUFNLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFFeEYsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ2pCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEtBQUs7UUFDdkQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLEdBQUcsR0FBRyxJQUFJLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRCxNQUFNLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUVwQixNQUFNLGVBQWUsR0FBRyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUNoRCxHQUFHLENBQUMsT0FBTyxDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFFekMsTUFBTSxRQUFRLEdBQUcsTUFBTSxlQUF3QyxDQUFDO1FBQ2hFLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1QyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRTlELEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNiLENBQUMsQ0FBQyxDQUFDO0lBRUgsNEVBQTRFO0lBRTVFLElBQUksQ0FBQywrREFBK0QsRUFBRSxLQUFLO1FBQzFFLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFckIsTUFBTSxVQUFVLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsa0JBQWtCLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUNwRyxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFdkIsK0VBQStFO1FBQy9FLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsa0JBQWtCLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTdFLGlHQUFpRztRQUNqRywwRUFBMEU7UUFDMUUsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLDBCQUEwQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFFdkYsNERBQTREO1FBQzVELE1BQU0sb0JBQW9CLEdBQUcsTUFBTSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzdELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsdUJBQXVCLENBQUMsRUFBRSxDQUFDO2dCQUN2RCxPQUFPLEtBQUssQ0FBQztZQUNkLENBQUM7WUFDRCxNQUFNLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFnQyxDQUFDO1lBQ3JFLE9BQU8sQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO1FBQzFCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLHFGQUFxRixDQUFDLENBQUM7SUFDM0ksQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMERBQTBELEVBQUUsS0FBSztRQUNyRSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sVUFBVSxHQUFHLE1BQU0seUJBQXlCLENBQUMsTUFBTSxFQUFFLHVCQUF1QixFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFDekcsTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBRXZCLHNFQUFzRTtRQUN0RSxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFckUsa0dBQWtHO1FBQ2xHLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQztRQUN4RixNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFFeEYsK0NBQStDO1FBQy9DLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUU7WUFDL0IsU0FBUyxFQUFFLENBQUM7WUFDWixNQUFNLEVBQUU7Z0JBQ1AsSUFBSSxFQUFFLDJCQUEyQjtnQkFDakMsT0FBTyxFQUFFLFVBQVU7Z0JBQ25CLE1BQU0sRUFBRSxXQUFXO2dCQUNuQixVQUFVLEVBQUUsZ0JBQWdCO2dCQUM1QixRQUFRLEVBQUUsSUFBSTtnQkFDZCxTQUFTLEVBQUUsYUFBYTthQUN4QjtTQUNELENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztJQUN4RixDQUFDLENBQUMsQ0FBQztJQUVILGlGQUFpRjtJQUVqRixJQUFJLENBQUMsb0RBQW9ELEVBQUUsS0FBSztRQUMvRCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sVUFBVSxHQUFHLE1BQU0seUJBQXlCLENBQUMsTUFBTSxFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFFaEYsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRTtZQUMvQixTQUFTLEVBQUUsQ0FBQztZQUNaLE1BQU0sRUFBRTtnQkFDUCxJQUFJLEVBQUUsc0JBQXNCO2dCQUM1QixPQUFPLEVBQUUsVUFBVTtnQkFDbkIsS0FBSyxFQUFFLGlCQUFpQjthQUN4QjtTQUNELENBQUMsQ0FBQztRQUVILE1BQU0sVUFBVSxHQUFHLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUMxRyxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQyxNQUE2QixDQUFDO1FBQ2hGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBRXpELDZDQUE2QztRQUM3QyxNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQW1CLFdBQVcsRUFBRSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQzVGLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBc0IsQ0FBQztRQUN2RCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDNUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkNBQTJDLEVBQUUsS0FBSztRQUN0RCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sVUFBVSxHQUFHLE1BQU0seUJBQXlCLENBQUMsTUFBTSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDL0UsbUJBQW1CLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXZFLE1BQU0sVUFBVSxHQUFHLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUMxRyxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQyxNQUE2QixDQUFDO1FBQ2hGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxlQUFlLENBQUMsQ0FBQztRQUV2RCxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFFdkYsd0RBQXdEO1FBQ3hELE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBbUIsV0FBVyxFQUFFLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDNUYsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFzQixDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsZUFBZSxDQUFDLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0RBQW9ELEVBQUUsS0FBSztRQUMvRCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sVUFBVSxHQUFHLE1BQU0seUJBQXlCLENBQUMsTUFBTSxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFFOUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRTtZQUMvQixTQUFTLEVBQUUsQ0FBQztZQUNaLE1BQU0sRUFBRTtnQkFDUCxJQUFJLEVBQUUsc0JBQXNCO2dCQUM1QixPQUFPLEVBQUUsVUFBVTtnQkFDbkIsS0FBSyxFQUFFLGlCQUFpQjthQUN4QjtTQUNELENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUV2Rix1RUFBdUU7UUFDdkUsSUFBSSxPQUFzQyxDQUFDO1FBQzNDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUM3QixNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQXNCLGNBQWMsQ0FBQyxDQUFDO1lBQ3RFLE9BQU8sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEtBQUssVUFBVSxDQUFDLENBQUM7WUFDNUQsSUFBSSxPQUFPLEVBQUUsS0FBSyxLQUFLLGlCQUFpQixFQUFFLENBQUM7Z0JBQzFDLE1BQU07WUFDUCxDQUFDO1lBQ0QsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDcEIsQ0FBQztRQUNELE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLHVDQUF1QyxDQUFDLENBQUM7UUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDdEQsQ0FBQyxDQUFDLENBQUM7SUFFSCxnRkFBZ0Y7SUFFaEYsSUFBSSxDQUFDLHNFQUFzRSxFQUFFLEtBQUs7UUFDakYsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzdFLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFL0Usd0VBQXdFO1FBQ3hFLE1BQU0sYUFBYSxHQUFHLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzFELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsRUFBRSxDQUFDO2dCQUN0RCxPQUFPLEtBQUssQ0FBQztZQUNkLENBQUM7WUFDRCxNQUFNLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUE2QixDQUFDO1lBQ2xFLE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLGlEQUErQixDQUFDO1FBQ3hELENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxlQUFlLEdBQUcsaUJBQWlCLENBQUMsYUFBYSxDQUFDLENBQUMsTUFBNkIsQ0FBQztRQUN2RixNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSwrQ0FBNkIsQ0FBQztRQUUxRSx3RUFBd0U7UUFDeEUsTUFBTSxXQUFXLEdBQUcsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsbUJBQW1CLENBQUMsQ0FBQyxDQUFDO1FBQ3hHLE1BQU0sWUFBWSxHQUFHLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUMzRCxJQUFJLFlBQVksQ0FBQyxJQUFJLEtBQUssbUJBQW1CLEVBQUUsQ0FBQztZQUMvQyxNQUFNLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUM1RCxDQUFDO1FBRUQsa0NBQWtDO1FBQ2xDLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ25ELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsRUFBRSxDQUFDO2dCQUN0RCxPQUFPLEtBQUssQ0FBQztZQUNkLENBQUM7WUFDRCxNQUFNLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUE2QixDQUFDO1lBQ2xFLE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLCtDQUE4QixDQUFDO1FBQ3ZELENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVsQixNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7SUFDeEYsQ0FBQyxDQUFDLENBQUM7SUFFSCxnRkFBZ0Y7SUFFaEYsSUFBSSxDQUFDLHNEQUFzRCxFQUFFLEtBQUs7UUFDakUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQzlFLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUV2QixrRkFBa0Y7UUFDbEYsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRTtZQUMvQixTQUFTLEVBQUUsQ0FBQztZQUNaLE1BQU0sRUFBRTtnQkFDUCxJQUFJLEVBQUUsMkJBQTJCO2dCQUNqQyxPQUFPLEVBQUUsVUFBVTtnQkFDbkIsSUFBSSwwQ0FBMkI7Z0JBQy9CLEVBQUUsRUFBRSxLQUFLO2dCQUNULFdBQVcsRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUU7YUFDOUI7U0FDRCxDQUFDLENBQUM7UUFFSCxxRUFBcUU7UUFDckUsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1FBQ3RGLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUN2RixNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFFdkYsc0RBQXNEO1FBQ3RELE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBbUIsV0FBVyxFQUFFLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDNUYsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFzQixDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDbkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDbEYsMENBQTBDO1FBQzFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsY0FBYyxFQUFFLE1BQU0sRUFBRSxtREFBbUQsQ0FBQyxDQUFDO0lBQy9GLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVEQUF1RCxFQUFFLEtBQUs7UUFDbEUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBRTlFLHFCQUFxQjtRQUNyQixtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFbEUsa0VBQWtFO1FBQ2xFLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUV2RixnREFBZ0Q7UUFDaEQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRTtZQUMvQixTQUFTLEVBQUUsQ0FBQztZQUNaLE1BQU0sRUFBRTtnQkFDUCxJQUFJLEVBQUUsMkJBQTJCO2dCQUNqQyxPQUFPLEVBQUUsVUFBVTtnQkFDbkIsSUFBSSwwQ0FBMkI7Z0JBQy9CLEVBQUUsRUFBRSxVQUFVO2dCQUNkLFdBQVcsRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUU7YUFDOUI7U0FDRCxDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsTUFBTSxhQUFhLEdBQUcsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDMUQsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RELE9BQU8sS0FBSyxDQUFDO1lBQ2QsQ0FBQztZQUNELE9BQVEsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBNkIsQ0FBQyxNQUFNLEtBQUssWUFBWSxDQUFDO1FBQ3BGLENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxRQUFRLEdBQUcsaUJBQWlCLENBQUMsYUFBYSxDQUFDLENBQUMsU0FBUyxDQUFDO1FBRTVELGlFQUFpRTtRQUNqRSxNQUFNLGNBQWMsR0FBRyxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUMzRCxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLEVBQUUsQ0FBQztnQkFDdEQsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDO1lBQ0QsTUFBTSxRQUFRLEdBQUcsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEMsT0FBUSxRQUFRLENBQUMsTUFBNkIsQ0FBQyxNQUFNLEtBQUssWUFBWTttQkFDbEUsUUFBUSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7UUFDbkMsQ0FBQyxDQUFDLENBQUM7UUFDSCxNQUFNLENBQUMsRUFBRSxDQUFDLGNBQWMsRUFBRSw4REFBOEQsQ0FBQyxDQUFDO1FBRTFGLE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBbUIsV0FBVyxFQUFFLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDNUYsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFzQixDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFLCtCQUErQixLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDekYsQ0FBQyxDQUFDLENBQUM7SUFFSCxnRkFBZ0Y7SUFFaEYsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEtBQUs7UUFDMUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxlQUFlLENBQUMsQ0FBQztRQUU1RSxxQkFBcUI7UUFDckIsbUJBQW1CLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRWxFLHVEQUF1RDtRQUN2RCxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFO1lBQy9CLFNBQVMsRUFBRSxDQUFDO1lBQ1osTUFBTSxFQUFFO2dCQUNQLElBQUksRUFBRSwyQkFBMkI7Z0JBQ2pDLE9BQU8sRUFBRSxVQUFVO2dCQUNuQixJQUFJLDhDQUE2QjtnQkFDakMsRUFBRSxFQUFFLFNBQVM7Z0JBQ2IsV0FBVyxFQUFFLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFO2FBQzFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsd0RBQXdEO1FBQ3hELE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLDJCQUEyQixDQUFDLENBQUMsQ0FBQztRQUM3RyxNQUFNLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxxQ0FBcUMsQ0FBQyxDQUFDO1FBRTNELGdFQUFnRTtRQUNoRSw0REFBNEQ7UUFDNUQsTUFBTSxZQUFZLEdBQUcsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsK0JBQStCLENBQUMsQ0FBQyxDQUFDO1FBQ3JILE1BQU0sQ0FBQyxFQUFFLENBQUMsWUFBWSxFQUFFLGdFQUFnRSxDQUFDLENBQUM7UUFFMUYsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBRXZGLHdDQUF3QztRQUN4QyxNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQW1CLFdBQVcsRUFBRSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQzVGLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBc0IsQ0FBQztRQUN2RCxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLGVBQWUsRUFBRSxzREFBc0QsQ0FBQyxDQUFDO0lBQzNGLENBQUMsQ0FBQyxDQUFDO0lBRUgsNEVBQTRFO0lBRTVFLElBQUksQ0FBQywrREFBK0QsRUFBRSxLQUFLO1FBQzFFLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFckIsTUFBTSxVQUFVLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUNqRixNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFdkIsdUZBQXVGO1FBQ3ZGLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFckYseUdBQXlHO1FBQ3pHLGdEQUFnRDtRQUNoRCxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFDeEYsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUV2Riw0REFBNEQ7UUFDNUQsTUFBTSxvQkFBb0IsR0FBRyxNQUFNLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDN0QsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSx1QkFBdUIsQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZELE9BQU8sS0FBSyxDQUFDO1lBQ2QsQ0FBQztZQUNELE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQWdDLENBQUM7WUFDckUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7UUFDMUIsQ0FBQyxDQUFDLENBQUM7UUFDSCxNQUFNLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsdUZBQXVGLENBQUMsQ0FBQztJQUM3SSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0REFBNEQsRUFBRSxLQUFLO1FBQ3ZFLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFckIsTUFBTSxVQUFVLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUM5RSxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFdkIsd0ZBQXdGO1FBQ3hGLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdkYsc0dBQXNHO1FBQ3RHLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQztRQUN4RixNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFFeEYsK0NBQStDO1FBQy9DLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUU7WUFDL0IsU0FBUyxFQUFFLENBQUM7WUFDWixNQUFNLEVBQUU7Z0JBQ1AsSUFBSSxFQUFFLDJCQUEyQjtnQkFDakMsT0FBTyxFQUFFLFVBQVU7Z0JBQ25CLE1BQU0sRUFBRSxpQkFBaUI7Z0JBQ3pCLFVBQVUsRUFBRSxpQkFBaUI7Z0JBQzdCLFFBQVEsRUFBRSxJQUFJO2dCQUNkLFNBQVMsRUFBRSxhQUFhO2FBQ3hCO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO0lBQ3hGLENBQUMsQ0FBQyxDQUFDO0lBRUgsNEVBQTRFO0lBRTVFLElBQUksQ0FBQyxxREFBcUQsRUFBRSxLQUFLO1FBQ2hFLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFckIsTUFBTSxVQUFVLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFFNUUsbUJBQW1CO1FBQ25CLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMvRCxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxJQUFLLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQTZCLENBQUMsTUFBTSxLQUFLLFNBQVMsQ0FBQyxDQUFDO1FBRW5LLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUN2QixtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0QsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsSUFBSyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUE2QixDQUFDLE1BQU0sS0FBSyxTQUFTLENBQUMsQ0FBQztRQUVuSyx1QkFBdUI7UUFDdkIsSUFBSSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFtQixXQUFXLEVBQUUsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUMxRixJQUFJLEtBQUssR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLEtBQXNCLENBQUM7UUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUxQyxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFdkIsOEJBQThCO1FBQzlCLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUU7WUFDL0IsU0FBUyxFQUFFLENBQUM7WUFDWixNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFO1NBQzdFLENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLG1CQUFtQixDQUFDLENBQUMsQ0FBQztRQUVwRixRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFtQixXQUFXLEVBQUUsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUN0RixLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFzQixDQUFDO1FBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNsRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywyQ0FBMkMsRUFBRSxLQUFLO1FBQ3RELElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFckIsTUFBTSxVQUFVLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUVoRixtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEUsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBRXZGLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUV2QiwyQkFBMkI7UUFDM0IsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRTtZQUMvQixTQUFTLEVBQUUsQ0FBQztZQUNaLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxtQkFBbUIsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFO1NBQzFELENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLG1CQUFtQixDQUFDLENBQUMsQ0FBQztRQUVwRixNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQW1CLFdBQVcsRUFBRSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQzVGLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBc0IsQ0FBQztRQUN2RCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzNDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEtBQUs7UUFDdEQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1FBRW5GLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRSxNQUFNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxJQUFLLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQTZCLENBQUMsTUFBTSxLQUFLLFVBQVUsQ0FBQyxDQUFDO1FBRXBLLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUN2QixtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEUsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsSUFBSyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUE2QixDQUFDLE1BQU0sS0FBSyxVQUFVLENBQUMsQ0FBQztRQUVwSyxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFdkIsdUJBQXVCO1FBQ3ZCLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUU7WUFDL0IsU0FBUyxFQUFFLENBQUM7WUFDWixNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFO1NBQzlFLENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLG1CQUFtQixDQUFDLENBQUMsQ0FBQztRQUVwRixtQ0FBbUM7UUFDbkMsbUJBQW1CLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUV2RixNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQW1CLFdBQVcsRUFBRSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQzVGLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBc0IsQ0FBQztRQUN2RCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUNuRCxDQUFDLENBQUMsQ0FBQztJQUVILDRFQUE0RTtJQUU1RSxJQUFJLENBQUMsZ0RBQWdELEVBQUUsS0FBSztRQUMzRCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sVUFBVSxHQUFHLE1BQU0seUJBQXlCLENBQUMsTUFBTSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRXhFLG1CQUFtQjtRQUNuQixtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0QsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsSUFBSyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUE2QixDQUFDLE1BQU0sS0FBSyxTQUFTLENBQUMsQ0FBQztRQUVuSyxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDdkIsbUJBQW1CLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQy9ELE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLElBQUssaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBNkIsQ0FBQyxNQUFNLEtBQUssU0FBUyxDQUFDLENBQUM7UUFFbkssTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBRXZCLDJEQUEyRDtRQUMzRCxNQUFNLGdCQUFnQixHQUFHLGNBQWMsRUFBRSxDQUFDO1FBQzFDLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUU7WUFDbEMsT0FBTyxFQUFFLGdCQUFnQjtZQUN6QixRQUFRLEVBQUUsTUFBTTtZQUNoQixJQUFJLEVBQUUsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUU7U0FDaEQsQ0FBQyxDQUFDO1FBRUgsTUFBTSxVQUFVLEdBQUcsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FDdkQsQ0FBQyxDQUFDLE1BQU0sS0FBSyxjQUFjLElBQUssQ0FBQyxDQUFDLE1BQXVDLENBQUMsWUFBWSxDQUFDLElBQUksS0FBSyxxQkFBcUIsQ0FDckgsQ0FBQztRQUNGLE1BQU0sWUFBWSxHQUFJLFVBQVUsQ0FBQyxNQUF1QyxDQUFDLFlBQXlDLENBQUM7UUFFbkgseUVBQXlFO1FBQ3pFLG9EQUFvRDtRQUNwRCxNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQW1CLFdBQVcsRUFBRSxFQUFFLFFBQVEsRUFBRSxZQUFZLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDL0csTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFzQixDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1FBRS9FLHNDQUFzQztRQUN0QyxNQUFNLGNBQWMsR0FBRyxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQW1CLFdBQVcsRUFBRSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ2xHLE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsS0FBc0IsQ0FBQztRQUNuRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2pELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEtBQUs7UUFDcEQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQixNQUFNLFVBQVUsR0FBRyxNQUFNLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBRWhGLElBQUksUUFBUSxHQUFHLEtBQUssQ0FBQztRQUNyQixJQUFJLENBQUM7WUFDSixNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFO2dCQUNsQyxPQUFPLEVBQUUsY0FBYyxFQUFFO2dCQUN6QixRQUFRLEVBQUUsTUFBTTtnQkFDaEIsSUFBSSxFQUFFLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsa0JBQWtCLEVBQUU7YUFDekQsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNSLFFBQVEsR0FBRyxJQUFJLENBQUM7UUFDakIsQ0FBQztRQUNELE1BQU0sQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFFLDJDQUEyQyxDQUFDLENBQUM7SUFDbEUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZ0RBQWdELEVBQUUsS0FBSztRQUMzRCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQztRQUV4RyxJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDckIsSUFBSSxDQUFDO1lBQ0osTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRTtnQkFDbEMsT0FBTyxFQUFFLGNBQWMsRUFBRTtnQkFDekIsUUFBUSxFQUFFLE1BQU07Z0JBQ2hCLElBQUksRUFBRSxFQUFFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFO2FBQ2pFLENBQUMsQ0FBQztRQUNKLENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUixRQUFRLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLENBQUM7UUFDRCxNQUFNLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxrREFBa0QsQ0FBQyxDQUFDO0lBQ3pFLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==