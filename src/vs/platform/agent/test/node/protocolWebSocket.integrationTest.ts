/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChildProcess, fork } from 'child_process';
import { fileURLToPath } from 'url';
import { WebSocket } from 'ws';
import { URI } from '../../../../base/common/uri.js';
import { PROTOCOL_VERSION } from '../../common/state/sessionCapabilities.js';
import {
	isJsonRpcNotification,
	isJsonRpcResponse,
	type IActionBroadcastParams,
	type IFetchTurnsResult,
	type IJsonRpcErrorResponse,
	type IJsonRpcSuccessResponse,
	type IListSessionsResult,
	type INotificationBroadcastParams,
	type IProtocolMessage,
	type IProtocolNotification,
	type IServerHelloParams,
	type IStateSnapshot,
} from '../../common/state/sessionProtocol.js';
import type { IDeltaAction, ISessionAddedNotification, ISessionRemovedNotification, IUsageAction } from '../../common/state/sessionActions.js';
import type { ISessionState } from '../../common/state/sessionState.js';

// ---- JSON serialization helpers (mirror webSocketTransport.ts) --------------

function uriReplacer(_key: string, value: unknown): unknown {
	if (value instanceof URI) {
		return value.toJSON();
	}
	if (value instanceof Map) {
		return { $type: 'Map', entries: [...value.entries()] };
	}
	return value;
}

function uriReviver(_key: string, value: unknown): unknown {
	if (value && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		if (obj.$mid === 1) {
			return URI.revive(value as URI);
		}
		if (obj.$type === 'Map' && Array.isArray(obj.entries)) {
			return new Map(obj.entries as [unknown, unknown][]);
		}
	}
	return value;
}

// ---- JSON-RPC test client ---------------------------------------------------

interface IPendingCall {
	resolve: (result: unknown) => void;
	reject: (err: Error) => void;
}

class TestProtocolClient {
	private readonly _ws: WebSocket;
	private _nextId = 1;
	private readonly _pendingCalls = new Map<number, IPendingCall>();
	private readonly _notifications: IProtocolNotification[] = [];
	private readonly _notifWaiters: { predicate: (n: IProtocolNotification) => boolean; resolve: (n: IProtocolNotification) => void; reject: (err: Error) => void }[] = [];

	constructor(port: number) {
		this._ws = new WebSocket(`ws://127.0.0.1:${port}`);
	}

	async connect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this._ws.on('open', () => {
				this._ws.on('message', (data: Buffer | string) => {
					const text = typeof data === 'string' ? data : data.toString('utf-8');
					const msg = JSON.parse(text, uriReviver);
					this._handleMessage(msg);
				});
				resolve();
			});
			this._ws.on('error', reject);
		});
	}

	private _handleMessage(msg: IProtocolMessage): void {
		if (isJsonRpcResponse(msg)) {
			// JSON-RPC response — resolve pending call
			const pending = this._pendingCalls.get(msg.id);
			if (pending) {
				this._pendingCalls.delete(msg.id);
				const errResp = msg as IJsonRpcErrorResponse;
				if (errResp.error) {
					pending.reject(new Error(errResp.error.message));
				} else {
					pending.resolve((msg as IJsonRpcSuccessResponse).result);
				}
			}
		} else if (isJsonRpcNotification(msg)) {
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
	notify(method: string, params?: unknown): void {
		const msg: IProtocolMessage = { jsonrpc: '2.0', method, params };
		this._ws.send(JSON.stringify(msg, uriReplacer));
	}

	/** Send a JSON-RPC request and await the response. */
	call<T>(method: string, params?: unknown, timeoutMs = 5000): Promise<T> {
		const id = this._nextId++;
		const msg: IProtocolMessage = { jsonrpc: '2.0', id, method, params };
		this._ws.send(JSON.stringify(msg, uriReplacer));

		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this._pendingCalls.delete(id);
				reject(new Error(`Timeout waiting for response to ${method} (id=${id}, ${timeoutMs}ms)`));
			}, timeoutMs);

			this._pendingCalls.set(id, {
				resolve: result => { clearTimeout(timer); resolve(result as T); },
				reject: err => { clearTimeout(timer); reject(err); },
			});
		});
	}

	/** Wait for a server notification matching a predicate. */
	waitForNotification(predicate: (n: IProtocolNotification) => boolean, timeoutMs = 5000): Promise<IProtocolNotification> {
		const existing = this._notifications.find(predicate);
		if (existing) {
			return Promise.resolve(existing);
		}

		return new Promise<IProtocolNotification>((resolve, reject) => {
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
	receivedNotifications(predicate?: (n: IProtocolNotification) => boolean): IProtocolNotification[] {
		return predicate ? this._notifications.filter(predicate) : [...this._notifications];
	}

	close(): void {
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

	clearReceived(): void {
		this._notifications.length = 0;
	}
}

// ---- Server process lifecycle -----------------------------------------------

async function startServer(): Promise<{ process: ChildProcess; port: number }> {
	return new Promise((resolve, reject) => {
		const serverPath = fileURLToPath(new URL('../../node/agentHostServerMain.js', import.meta.url));
		const child = fork(serverPath, ['--enable-mock-agent', '--quiet', '--port', '0'], {
			stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
		});

		const timeout = setTimeout(() => {
			child.kill();
			reject(new Error('Server startup timed out'));
		}, 10_000);

		child.stdout!.on('data', (data: Buffer) => {
			const text = data.toString();
			const match = text.match(/READY:(\d+)/);
			if (match) {
				clearTimeout(timeout);
				resolve({ process: child, port: parseInt(match[1], 10) });
			}
		});

		child.stderr!.on('data', (data: Buffer) => {
			console.error('[TestServer]', data.toString());
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

function nextSessionUri(): URI {
	return URI.from({ scheme: 'mock', path: `/test-session-${++sessionCounter}` });
}

function isActionNotification(n: IProtocolNotification, actionType: string): boolean {
	if (n.method !== 'action') {
		return false;
	}
	const params = n.params as IActionBroadcastParams;
	return params.envelope.action.type === actionType;
}

function getActionParams(n: IProtocolNotification): IActionBroadcastParams {
	return n.params as IActionBroadcastParams;
}

/** Perform handshake, create a session, subscribe, and return its URI. */
async function createAndSubscribeSession(c: TestProtocolClient, clientId: string): Promise<URI> {
	c.notify('initialize', { protocolVersion: PROTOCOL_VERSION, clientId });
	await c.waitForNotification(n => n.method === 'serverHello');

	await c.call('createSession', { session: nextSessionUri(), provider: 'mock' });

	const notif = await c.waitForNotification(n =>
		n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
	);
	const realSessionUri = ((notif.params as INotificationBroadcastParams).notification as ISessionAddedNotification).summary.resource;

	await c.call<IStateSnapshot>('subscribe', { resource: realSessionUri });
	c.clearReceived();

	return realSessionUri;
}

function dispatchTurnStarted(c: TestProtocolClient, session: URI, turnId: string, text: string, clientSeq: number): void {
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

	let server: { process: ChildProcess; port: number };
	let client: TestProtocolClient;

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
	test('handshake returns serverHello with protocol version', async function () {
		this.timeout(5_000);

		client.notify('initialize', {
			protocolVersion: PROTOCOL_VERSION,
			clientId: 'test-handshake',
			initialSubscriptions: [URI.from({ scheme: 'agenthost', path: '/root' })],
		});

		const hello = await client.waitForNotification(n => n.method === 'serverHello');
		const params = hello.params as IServerHelloParams;
		assert.strictEqual(params.protocolVersion, PROTOCOL_VERSION);
		assert.ok(params.serverSeq >= 0);
		assert.ok(params.snapshots.length >= 1, 'should have root state snapshot');
	});

	// 2. Create session
	test('create session triggers sessionAdded notification', async function () {
		this.timeout(10_000);

		client.notify('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-create-session' });
		await client.waitForNotification(n => n.method === 'serverHello');

		await client.call('createSession', { session: nextSessionUri(), provider: 'mock' });

		const notif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
		const notification = (notif.params as INotificationBroadcastParams).notification as ISessionAddedNotification;
		assert.strictEqual(notification.summary.resource.scheme, 'mock');
		assert.strictEqual(notification.summary.provider, 'mock');
	});

	// 3. Send message and receive response
	test('send message and receive delta + turnComplete', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-send-message');
		dispatchTurnStarted(client, sessionUri, 'turn-1', 'hello', 1);

		const delta = await client.waitForNotification(n => isActionNotification(n, 'session/delta'));
		const deltaAction = getActionParams(delta).envelope.action;
		assert.strictEqual(deltaAction.type, 'session/delta');
		if (deltaAction.type === 'session/delta') {
			assert.strictEqual(deltaAction.content, 'Hello, world!');
		}

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
	});

	// 4. Tool invocation lifecycle
	test('tool invocation: toolStart → toolComplete → delta → turnComplete', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-tool-invocation');
		dispatchTurnStarted(client, sessionUri, 'turn-tool', 'use-tool', 1);

		await client.waitForNotification(n => isActionNotification(n, 'session/toolStart'));
		const toolComplete = await client.waitForNotification(n => isActionNotification(n, 'session/toolComplete'));
		const tcAction = getActionParams(toolComplete).envelope.action;
		if (tcAction.type === 'session/toolComplete') {
			assert.strictEqual(tcAction.result.success, true);
		}
		await client.waitForNotification(n => isActionNotification(n, 'session/delta'));
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
	});

	// 5. Error handling
	test('error prompt triggers session/error', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-error');
		dispatchTurnStarted(client, sessionUri, 'turn-err', 'error', 1);

		const errorNotif = await client.waitForNotification(n => isActionNotification(n, 'session/error'));
		const errorAction = getActionParams(errorNotif).envelope.action;
		if (errorAction.type === 'session/error') {
			assert.strictEqual(errorAction.error.message, 'Something went wrong');
		}
	});

	// 6. Permission flow
	test('permission request → resolve → response', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-permission');
		dispatchTurnStarted(client, sessionUri, 'turn-perm', 'permission', 1);

		await client.waitForNotification(n => isActionNotification(n, 'session/permissionRequest'));

		client.notify('dispatchAction', {
			clientSeq: 2,
			action: {
				type: 'session/permissionResolved',
				session: sessionUri,
				turnId: 'turn-perm',
				requestId: 'perm-1',
				approved: true,
			},
		});

		const delta = await client.waitForNotification(n => isActionNotification(n, 'session/delta'));
		const content = (getActionParams(delta).envelope.action as IDeltaAction).content;
		assert.strictEqual(content, 'Allowed.');

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
	});

	// 7. Session list
	test('listSessions returns sessions', async function () {
		this.timeout(10_000);

		client.notify('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-list-sessions' });
		await client.waitForNotification(n => n.method === 'serverHello');

		await client.call('createSession', { session: nextSessionUri(), provider: 'mock' });
		await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);

		const result = await client.call<IListSessionsResult>('listSessions');
		assert.ok(Array.isArray(result.sessions));
		assert.ok(result.sessions.length >= 1, 'should have at least one session');
	});

	// 8. Reconnect
	test('reconnect replays missed actions', async function () {
		this.timeout(15_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-reconnect');
		dispatchTurnStarted(client, sessionUri, 'turn-recon', 'hello', 1);
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		const allActions = client.receivedNotifications(n => n.method === 'action');
		assert.ok(allActions.length > 0);
		const missedFromSeq = getActionParams(allActions[0]).envelope.serverSeq - 1;

		client.close();

		const client2 = new TestProtocolClient(server.port);
		await client2.connect();
		client2.notify('reconnect', {
			clientId: 'test-reconnect',
			lastSeenServerSeq: missedFromSeq,
			subscriptions: [sessionUri],
		});

		await new Promise(resolve => setTimeout(resolve, 500));

		const replayed = client2.receivedNotifications();
		assert.ok(replayed.length > 0, 'should receive replayed actions or reconnect response');
		const hasActions = replayed.some(n => n.method === 'action');
		const hasReconnect = replayed.some(n => n.method === 'reconnectResponse');
		assert.ok(hasActions || hasReconnect);

		client2.close();
	});

	// ---- Gap tests: functionality bugs ----------------------------------------

	test('usage info is captured on completed turn', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-usage');
		dispatchTurnStarted(client, sessionUri, 'turn-usage', 'with-usage', 1);

		const usageNotif = await client.waitForNotification(n => isActionNotification(n, 'session/usage'));
		const usageAction = getActionParams(usageNotif).envelope.action as IUsageAction;
		assert.strictEqual(usageAction.usage.inputTokens, 100);
		assert.strictEqual(usageAction.usage.outputTokens, 50);

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		const snapshot = await client.call<IStateSnapshot>('subscribe', { resource: sessionUri });
		const state = snapshot.state as ISessionState;
		assert.ok(state.turns.length >= 1);
		const turn = state.turns[state.turns.length - 1];
		assert.ok(turn.usage);
		assert.strictEqual(turn.usage!.inputTokens, 100);
		assert.strictEqual(turn.usage!.outputTokens, 50);
	});

	test('modifiedAt updates on turn completion', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-modifiedAt');

		const initialSnapshot = await client.call<IStateSnapshot>('subscribe', { resource: sessionUri });
		const initialModifiedAt = (initialSnapshot.state as ISessionState).summary.modifiedAt;

		await new Promise(resolve => setTimeout(resolve, 50));

		dispatchTurnStarted(client, sessionUri, 'turn-mod', 'hello', 1);
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		const updatedSnapshot = await client.call<IStateSnapshot>('subscribe', { resource: sessionUri });
		const updatedModifiedAt = (updatedSnapshot.state as ISessionState).summary.modifiedAt;
		assert.ok(updatedModifiedAt >= initialModifiedAt);
	});

	test('createSession with invalid provider does not crash server', async function () {
		this.timeout(10_000);

		client.notify('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-invalid-create' });
		await client.waitForNotification(n => n.method === 'serverHello');

		// This should return a JSON-RPC error
		let gotError = false;
		try {
			await client.call('createSession', { session: nextSessionUri(), provider: 'nonexistent' });
		} catch {
			gotError = true;
		}
		assert.ok(gotError, 'should have received an error for invalid provider');

		// Server should still be functional
		await client.call('createSession', { session: nextSessionUri(), provider: 'mock' });
		const notif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
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

		const result = await client.call<IFetchTurnsResult>('fetchTurns', { session: sessionUri, startTurn: 0, count: 10 });
		assert.ok(result.turns.length >= 2);
		assert.ok(result.totalTurns >= 2);
	});

	// ---- Gap tests: coverage ---------------------------------------------------

	test('dispose session sends sessionRemoved notification', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-dispose');
		await client.call('disposeSession', { session: sessionUri });

		const notif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionRemoved'
		);
		const removed = (notif.params as INotificationBroadcastParams).notification as ISessionRemovedNotification;
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

		const snapshot = await client.call<IStateSnapshot>('subscribe', { resource: sessionUri });
		const state = snapshot.state as ISessionState;
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

		const snapshot = await client.call<IStateSnapshot>('subscribe', { resource: sessionUri });
		const state = snapshot.state as ISessionState;
		assert.ok(state.turns.length >= 2, `expected >= 2 turns but got ${state.turns.length}`);
		assert.strictEqual(state.turns[0].id, 'turn-m1');
		assert.strictEqual(state.turns[1].id, 'turn-m2');
	});

	test('two clients on same session both see actions', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-multi-client-1');

		const client2 = new TestProtocolClient(server.port);
		await client2.connect();
		client2.notify('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-multi-client-2' });
		await client2.waitForNotification(n => n.method === 'serverHello');
		await client2.call('subscribe', { resource: sessionUri });
		client2.clearReceived();

		dispatchTurnStarted(client, sessionUri, 'turn-mc', 'hello', 1);

		const d1 = await client.waitForNotification(n => isActionNotification(n, 'session/delta'));
		const d2 = await client2.waitForNotification(n => isActionNotification(n, 'session/delta'));
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
		client2.notify('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-unsub-helper' });
		await client2.waitForNotification(n => n.method === 'serverHello');
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
		const action = getActionParams(modelChanged).envelope.action;
		assert.strictEqual(action.type, 'session/modelChanged');
		if (action.type === 'session/modelChanged') {
			assert.strictEqual((action as { model: string }).model, 'new-mock-model');
		}

		const snapshot = await client.call<IStateSnapshot>('subscribe', { resource: sessionUri });
		const state = snapshot.state as ISessionState;
		assert.strictEqual(state.summary.model, 'new-mock-model');
	});
});
