/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChildProcess, fork } from 'child_process';
import { fileURLToPath } from 'url';
import { WebSocket } from 'ws';
import { URI } from '../../../../base/common/uri.js';
import { ISubscribeResult } from '../../common/state/protocol/commands.js';
import type { IActionEnvelope, IResponsePartAction, ISessionAddedNotification, ISessionRemovedNotification, IUsageAction } from '../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../common/state/sessionCapabilities.js';
import {
	isJsonRpcNotification,
	isJsonRpcResponse,
	JSON_RPC_PARSE_ERROR,
	type IAhpNotification,
	type IFetchTurnsResult,
	type IInitializeResult,
	type IJsonRpcErrorResponse,
	type IJsonRpcSuccessResponse,
	type IListSessionsResult,
	type INotificationBroadcastParams,
	type IProtocolMessage,
	type IReconnectResult
} from '../../common/state/sessionProtocol.js';
import { ResponsePartKind, type IMarkdownResponsePart, type ISessionState, type IToolCallResponsePart } from '../../common/state/sessionState.js';
import { PRE_EXISTING_SESSION_URI } from './mockAgent.js';

// ---- JSON-RPC test client ---------------------------------------------------

interface IPendingCall {
	resolve: (result: unknown) => void;
	reject: (err: Error) => void;
}

class TestProtocolClient {
	private readonly _ws: WebSocket;
	private _nextId = 1;
	private readonly _pendingCalls = new Map<number, IPendingCall>();
	private readonly _notifications: IAhpNotification[] = [];
	private readonly _notifWaiters: { predicate: (n: IAhpNotification) => boolean; resolve: (n: IAhpNotification) => void; reject: (err: Error) => void }[] = [];

	constructor(port: number) {
		this._ws = new WebSocket(`ws://127.0.0.1:${port}`);
	}

	async connect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this._ws.on('open', () => {
				this._ws.on('message', (data: Buffer | string) => {
					const text = typeof data === 'string' ? data : data.toString('utf-8');
					const msg = JSON.parse(text);
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
		this._ws.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
	}

	/** Send a JSON-RPC request and await the response. */
	call<T>(method: string, params?: unknown, timeoutMs = 5000): Promise<T> {
		const id = this._nextId++;
		this._ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));

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
	waitForNotification(predicate: (n: IAhpNotification) => boolean, timeoutMs = 5000): Promise<IAhpNotification> {
		const existing = this._notifications.find(predicate);
		if (existing) {
			return Promise.resolve(existing);
		}

		return new Promise<IAhpNotification>((resolve, reject) => {
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
	receivedNotifications(predicate?: (n: IAhpNotification) => boolean): IAhpNotification[] {
		return predicate ? this._notifications.filter(predicate) : [...this._notifications];
	}

	/** Send a raw string over the WebSocket without JSON serialization. */
	sendRaw(data: string): void {
		this._ws.send(data);
	}

	/** Wait for the next raw message from the server. */
	waitForRawMessage(timeoutMs = 5000): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				cleanup();
				reject(new Error(`Timeout waiting for raw message (${timeoutMs}ms)`));
			}, timeoutMs);
			const onMsg = (data: Buffer | string) => {
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
		const child = fork(serverPath, ['--enable-mock-agent', '--quiet', '--port', '0', '--without-connection-token'], {
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

		child.stderr!.on('data', () => {
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

function nextSessionUri(): string {
	return URI.from({ scheme: 'mock', path: `/test-session-${++sessionCounter}` }).toString();
}

function isActionNotification(n: IAhpNotification, actionType: string): boolean {
	if (n.method !== 'action') {
		return false;
	}
	const envelope = n.params as unknown as IActionEnvelope;
	return envelope.action.type === actionType;
}

function getActionEnvelope(n: IAhpNotification): IActionEnvelope {
	return n.params as unknown as IActionEnvelope;
}

/** Perform handshake, create a session, subscribe, and return its URI. */
async function createAndSubscribeSession(c: TestProtocolClient, clientId: string): Promise<string> {
	await c.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId });

	await c.call('createSession', { session: nextSessionUri(), provider: 'mock' });

	const notif = await c.waitForNotification(n =>
		n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
	);
	const realSessionUri = ((notif.params as INotificationBroadcastParams).notification as ISessionAddedNotification).summary.resource;

	await c.call<ISubscribeResult>('subscribe', { resource: realSessionUri });
	c.clearReceived();

	return realSessionUri;
}

function dispatchTurnStarted(c: TestProtocolClient, session: string, turnId: string, text: string, clientSeq: number): void {
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
	test('handshake returns initialize response with protocol version', async function () {
		this.timeout(5_000);

		const result = await client.call<IInitializeResult>('initialize', {
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

		const notif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
		const notification = (notif.params as INotificationBroadcastParams).notification as ISessionAddedNotification;
		assert.strictEqual(URI.parse(notification.summary.resource).scheme, 'mock');
		assert.strictEqual(notification.summary.provider, 'mock');
	});

	// 3. Send message and receive response
	test('send message and receive responsePart + turnComplete', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-send-message');
		dispatchTurnStarted(client, sessionUri, 'turn-1', 'hello', 1);

		const responsePart = await client.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
		const responsePartAction = getActionEnvelope(responsePart).action as IResponsePartAction;
		assert.strictEqual(responsePartAction.part.kind, ResponsePartKind.Markdown);
		assert.strictEqual((responsePartAction.part as IMarkdownResponsePart).content, 'Hello, world!');

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
		const responsePartAction = getActionEnvelope(responsePart).action as IResponsePartAction;
		assert.strictEqual(responsePartAction.part.kind, ResponsePartKind.Markdown);
		assert.strictEqual((responsePartAction.part as IMarkdownResponsePart).content, 'Allowed.');

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
	});

	// 7. Session list
	test('listSessions returns sessions', async function () {
		this.timeout(10_000);

		await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-list-sessions' });

		await client.call('createSession', { session: nextSessionUri(), provider: 'mock' });
		await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);

		const result = await client.call<IListSessionsResult>('listSessions');
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
		const result = await client2.call<IReconnectResult>('reconnect', {
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
		const usageAction = getActionEnvelope(usageNotif).action as IUsageAction;
		assert.strictEqual(usageAction.usage.inputTokens, 100);
		assert.strictEqual(usageAction.usage.outputTokens, 50);

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		const snapshot = await client.call<ISubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as ISessionState;
		assert.ok(state.turns.length >= 1);
		const turn = state.turns[state.turns.length - 1];
		assert.ok(turn.usage);
		assert.strictEqual(turn.usage!.inputTokens, 100);
		assert.strictEqual(turn.usage!.outputTokens, 50);
	});

	test('modifiedAt updates on turn completion', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-modifiedAt');

		const initialSnapshot = await client.call<ISubscribeResult>('subscribe', { resource: sessionUri });
		const initialModifiedAt = (initialSnapshot.snapshot.state as ISessionState).summary.modifiedAt;

		await new Promise(resolve => setTimeout(resolve, 50));

		dispatchTurnStarted(client, sessionUri, 'turn-mod', 'hello', 1);
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		const updatedSnapshot = await client.call<ISubscribeResult>('subscribe', { resource: sessionUri });
		const updatedModifiedAt = (updatedSnapshot.snapshot.state as ISessionState).summary.modifiedAt;
		assert.ok(updatedModifiedAt >= initialModifiedAt);
	});

	test('createSession with invalid provider does not crash server', async function () {
		this.timeout(10_000);

		await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-invalid-create' });

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

		const result = await client.call<IFetchTurnsResult>('fetchTurns', { session: sessionUri, limit: 10 });
		assert.ok(result.turns.length >= 2);
		assert.strictEqual(typeof result.hasMore, 'boolean');
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

		const snapshot = await client.call<ISubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as ISessionState;
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

		const snapshot = await client.call<ISubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as ISessionState;
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
			assert.strictEqual((action as { model: string }).model, 'new-mock-model');
		}

		const snapshot = await client.call<ISubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as ISessionState;
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
		const list = await client.call<IListSessionsResult>('listSessions');
		const preExisting = list.items.find(s => s.resource === preExistingUri);
		assert.ok(preExisting, 'listSessions should include the pre-existing session');

		// Clear notifications so we can verify no duplicate sessionAdded fires.
		client.clearReceived();

		// Subscribing to this session should trigger the restore path: the
		// server fetches message history from the agent and reconstructs turns.
		const result = await client.call<ISubscribeResult>('subscribe', { resource: preExistingUri });
		const state = result.snapshot.state as ISessionState;

		assert.strictEqual(state.lifecycle, 'ready', 'restored session should be in ready state');
		assert.ok(state.turns.length >= 1, `expected at least 1 restored turn but got ${state.turns.length}`);

		const turn = state.turns[0];
		assert.strictEqual(turn.userMessage.text, 'What files are here?');
		assert.strictEqual(turn.state, 'complete');
		const toolCallParts = turn.responseParts.filter((p): p is IToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
		assert.ok(toolCallParts.length >= 1, 'turn should have tool call response parts');
		assert.strictEqual(toolCallParts[0].toolCall.toolName, 'list_files');
		const mdParts = turn.responseParts.filter((p): p is IMarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
		assert.ok(mdParts.some(p => p.content.includes('file1.ts')), 'turn should have markdown part mentioning file1.ts');

		// Restoring should NOT emit a duplicate sessionAdded notification
		// (the session is already known to clients via listSessions).
		await new Promise(resolve => setTimeout(resolve, 200));
		const sessionAddedNotifs = client.receivedNotifications(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
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

		const n1 = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
		const n2 = await client2.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
		assert.ok(n1, 'client 1 should receive sessionAdded');
		assert.ok(n2, 'client 2 should receive sessionAdded');

		const uri1 = ((n1.params as INotificationBroadcastParams).notification as ISessionAddedNotification).summary.resource;
		const uri2 = ((n2.params as INotificationBroadcastParams).notification as ISessionAddedNotification).summary.resource;
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

		const n1 = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionRemoved'
		);
		const n2 = await client2.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionRemoved'
		);
		assert.ok(n1, 'client 1 should receive sessionRemoved');
		assert.ok(n2, 'client 2 should receive sessionRemoved even without subscribing');

		const removed1 = (n1.params as INotificationBroadcastParams).notification as ISessionRemovedNotification;
		const removed2 = (n2.params as INotificationBroadcastParams).notification as ISessionRemovedNotification;
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

		const removed = await client2.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionRemoved'
		);
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

		const result = await client2.call<ISubscribeResult>('subscribe', { resource: sessionUri });
		const state = result.snapshot.state as ISessionState;
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

		const response = await responsePromise as IJsonRpcErrorResponse;
		assert.strictEqual(response.jsonrpc, '2.0');
		assert.strictEqual(response.id, null);
		assert.strictEqual(response.error.code, JSON_RPC_PARSE_ERROR);

		raw.close();
	});
});
