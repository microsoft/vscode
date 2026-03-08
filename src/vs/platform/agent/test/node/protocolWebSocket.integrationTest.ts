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
import type {
	IActionMessage,
	IClientMessage,
	IListSessionsResponse,
	INotificationMessage,
	IServerHello,
	IServerMessage,
	IStateSnapshot,
} from '../../common/state/sessionProtocol.js';
import type { IDeltaAction, ISessionAddedNotification } from '../../common/state/sessionActions.js';

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

// ---- Test WebSocket client --------------------------------------------------

class TestProtocolClient {
	private readonly _ws: WebSocket;
	private readonly _received: IServerMessage[] = [];
	private readonly _waiters: { predicate: (msg: IServerMessage) => boolean; resolve: (msg: IServerMessage) => void; reject: (err: Error) => void }[] = [];

	constructor(port: number) {
		this._ws = new WebSocket(`ws://127.0.0.1:${port}`);
	}

	async connect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this._ws.on('open', () => {
				this._ws.on('message', (data: Buffer | string) => {
					const text = typeof data === 'string' ? data : data.toString('utf-8');
					const msg = JSON.parse(text, uriReviver) as IServerMessage;

					// Check waiters first (iterate backwards for safe splice)
					for (let i = this._waiters.length - 1; i >= 0; i--) {
						if (this._waiters[i].predicate(msg)) {
							const waiter = this._waiters.splice(i, 1)[0];
							waiter.resolve(msg);
						}
					}
					this._received.push(msg);
				});
				resolve();
			});
			this._ws.on('error', reject);
		});
	}

	send(msg: IClientMessage): void {
		this._ws.send(JSON.stringify(msg, uriReplacer));
	}

	/** Wait for the next message matching the predicate. */
	waitFor<T extends IServerMessage>(predicate: (msg: IServerMessage) => msg is T, timeoutMs?: number): Promise<T>;
	waitFor(predicate: (msg: IServerMessage) => boolean, timeoutMs?: number): Promise<IServerMessage>;
	waitFor(predicate: (msg: IServerMessage) => boolean, timeoutMs = 5000): Promise<IServerMessage> {
		// Check already-received messages
		const existing = this._received.find(predicate);
		if (existing) {
			return Promise.resolve(existing);
		}

		return new Promise<IServerMessage>((resolve, reject) => {
			const timer = setTimeout(() => {
				const idx = this._waiters.findIndex(w => w.resolve === resolve);
				if (idx >= 0) {
					this._waiters.splice(idx, 1);
				}
				reject(new Error(`Timeout waiting for message (${timeoutMs}ms)`));
			}, timeoutMs);

			this._waiters.push({
				predicate,
				resolve: (msg) => { clearTimeout(timer); resolve(msg); },
				reject,
			});
		});
	}

	/** Return all received messages matching a predicate. */
	received(predicate?: (msg: IServerMessage) => boolean): IServerMessage[] {
		return predicate ? this._received.filter(predicate) : [...this._received];
	}

	close(): void {
		// Reject any remaining waiters so tests don't hang
		for (const w of this._waiters) {
			w.reject(new Error('Client closed'));
		}
		this._waiters.length = 0;
		this._ws.close();
	}

	clearReceived(): void {
		this._received.length = 0;
	}
}

// ---- Server process lifecycle -----------------------------------------------

async function startServer(): Promise<{ process: ChildProcess; port: number }> {
	return new Promise((resolve, reject) => {
		// Use the production agentHostServerMain with mock agent enabled
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

		child.on('error', (err) => {
			clearTimeout(timeout);
			reject(err);
		});

		child.on('exit', (code) => {
			clearTimeout(timeout);
			reject(new Error(`Server exited prematurely with code ${code}`));
		});
	});
}

// ---- Helpers for common patterns --------------------------------------------

let sessionCounter = 0;

function nextSessionUri(): URI {
	return URI.from({ scheme: 'mock', path: `/test-session-${++sessionCounter}` });
}

/** Perform handshake, create a session, subscribe, and return its URI. */
async function createAndSubscribeSession(c: TestProtocolClient, clientId: string): Promise<URI> {
	// Handshake
	c.send({ type: 'clientHello', protocolVersion: PROTOCOL_VERSION, clientId });
	await c.waitFor((m): m is IServerHello => m.type === 'serverHello');

	// Create session (server assigns the real URI)
	c.send({ type: 'command', command: { type: 'createSession', session: nextSessionUri(), provider: 'mock' } });

	// Wait for sessionAdded notification to discover the server-assigned URI
	const notif = await c.waitFor((m): m is INotificationMessage =>
		m.type === 'notification' && (m as INotificationMessage).notification.type === 'notify/sessionAdded'
	);
	const realSessionUri = (notif.notification as ISessionAddedNotification).summary.resource;

	// Subscribe to the real session URI
	c.send({ type: 'subscribe', resource: realSessionUri });

	// Wait for the snapshot
	await c.waitFor((m): m is IStateSnapshot => m.type === 'stateSnapshot');

	// Clear received so tests can inspect only subsequent messages
	c.clearReceived();

	return realSessionUri;
}

function dispatchTurnStarted(c: TestProtocolClient, session: URI, turnId: string, text: string, clientSeq: number): void {
	c.send({
		type: 'action',
		clientSeq,
		action: {
			type: 'session/turnStarted',
			session,
			turnId,
			userMessage: { text },
		},
	});
}

function isAction(msg: IServerMessage, actionType: string): msg is IActionMessage {
	return msg.type === 'action' && (msg as IActionMessage).envelope.action.type === actionType;
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

		client.send({
			type: 'clientHello',
			protocolVersion: PROTOCOL_VERSION,
			clientId: 'test-handshake',
			initialSubscriptions: [URI.from({ scheme: 'agenthost', path: '/root' })],
		});

		const hello = await client.waitFor((m): m is IServerHello => m.type === 'serverHello');
		assert.strictEqual(hello.protocolVersion, PROTOCOL_VERSION);
		assert.ok(hello.serverSeq >= 0);
		assert.ok(hello.snapshots.length >= 1, 'should have root state snapshot');
	});

	// 2. Create session via command
	test('create session command triggers sessionAdded notification', async function () {
		this.timeout(10_000);

		// Handshake
		client.send({ type: 'clientHello', protocolVersion: PROTOCOL_VERSION, clientId: 'test-create-session' });
		await client.waitFor((m): m is IServerHello => m.type === 'serverHello');

		const sessionUri = nextSessionUri();
		client.send({ type: 'command', command: { type: 'createSession', session: sessionUri, provider: 'mock' } });

		const notification = await client.waitFor((m): m is INotificationMessage =>
			m.type === 'notification' && (m as INotificationMessage).notification.type === 'notify/sessionAdded'
		);
		assert.strictEqual(notification.notification.type, 'notify/sessionAdded');
		if (notification.notification.type === 'notify/sessionAdded') {
			assert.strictEqual(notification.notification.summary.resource.scheme, 'mock');
			assert.strictEqual(notification.notification.summary.provider, 'mock');
		}
	});

	// 3. Send message and receive response
	test('send message and receive delta + turnComplete', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-send-message');

		dispatchTurnStarted(client, sessionUri, 'turn-1', 'hello', 1);

		// Should receive session/delta with "Hello, world!"
		const delta = await client.waitFor(m => isAction(m, 'session/delta'));
		assert.strictEqual(delta.type, 'action');
		const deltaAction = (delta as IActionMessage).envelope.action;
		assert.strictEqual(deltaAction.type, 'session/delta');
		if (deltaAction.type === 'session/delta') {
			assert.strictEqual(deltaAction.content, 'Hello, world!');
		}

		// Should receive session/turnComplete
		const complete = await client.waitFor(m => isAction(m, 'session/turnComplete'));
		assert.strictEqual((complete as IActionMessage).envelope.action.type, 'session/turnComplete');
	});

	// 4. Tool invocation lifecycle
	test('tool invocation: toolStart → toolComplete → delta → turnComplete', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-tool-invocation');

		dispatchTurnStarted(client, sessionUri, 'turn-tool', 'use-tool', 1);

		// toolStart
		const toolStart = await client.waitFor(m => isAction(m, 'session/toolStart'));
		const toolStartAction = (toolStart as IActionMessage).envelope.action;
		assert.strictEqual(toolStartAction.type, 'session/toolStart');

		// toolComplete
		const toolComplete = await client.waitFor(m => isAction(m, 'session/toolComplete'));
		const toolCompleteAction = (toolComplete as IActionMessage).envelope.action;
		assert.strictEqual(toolCompleteAction.type, 'session/toolComplete');
		if (toolCompleteAction.type === 'session/toolComplete') {
			assert.strictEqual(toolCompleteAction.result.success, true);
		}

		// delta
		const delta = await client.waitFor(m => isAction(m, 'session/delta'));
		if ((delta as IActionMessage).envelope.action.type === 'session/delta') {
			assert.strictEqual((delta as IActionMessage).envelope.action.type, 'session/delta');
		}

		// turnComplete
		await client.waitFor(m => isAction(m, 'session/turnComplete'));
	});

	// 5. Error handling
	test('error prompt triggers session/error', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-error');

		dispatchTurnStarted(client, sessionUri, 'turn-err', 'error', 1);

		const errorMsg = await client.waitFor(m => isAction(m, 'session/error'));
		const errorAction = (errorMsg as IActionMessage).envelope.action;
		assert.strictEqual(errorAction.type, 'session/error');
		if (errorAction.type === 'session/error') {
			assert.strictEqual(errorAction.error.message, 'Something went wrong');
		}
	});

	// 6. Permission flow
	test('permission request → resolve → response', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-permission');

		dispatchTurnStarted(client, sessionUri, 'turn-perm', 'permission', 1);

		// Wait for permissionRequest action
		const permReq = await client.waitFor(m => isAction(m, 'session/permissionRequest'));
		const permAction = (permReq as IActionMessage).envelope.action;
		assert.strictEqual(permAction.type, 'session/permissionRequest');

		// Approve the permission
		client.send({
			type: 'action',
			clientSeq: 2,
			action: {
				type: 'session/permissionResolved',
				session: sessionUri,
				turnId: 'turn-perm',
				requestId: 'perm-1',
				approved: true,
			},
		});

		// After approval, should get delta + turnComplete
		const delta = await client.waitFor(m => isAction(m, 'session/delta'));
		if ((delta as IActionMessage).envelope.action.type === 'session/delta') {
			const content = ((delta as IActionMessage).envelope.action as IDeltaAction).content;
			assert.strictEqual(content, 'Allowed.');
		}

		await client.waitFor(m => isAction(m, 'session/turnComplete'));
	});

	// 7. Session list
	test('listSessions command returns listSessionsResponse', async function () {
		this.timeout(10_000);

		// Handshake + create a session first
		client.send({ type: 'clientHello', protocolVersion: PROTOCOL_VERSION, clientId: 'test-list-sessions' });
		await client.waitFor((m): m is IServerHello => m.type === 'serverHello');

		const sessionUri = nextSessionUri();
		client.send({ type: 'command', command: { type: 'createSession', session: sessionUri, provider: 'mock' } });
		await client.waitFor((m): m is INotificationMessage =>
			m.type === 'notification' && (m as INotificationMessage).notification.type === 'notify/sessionAdded'
		);

		// Request session list
		client.send({ type: 'command', command: { type: 'listSessions' } });

		const listResponse = await client.waitFor((m): m is IListSessionsResponse => m.type === 'listSessionsResponse');
		assert.strictEqual(listResponse.type, 'listSessionsResponse');
		assert.ok(Array.isArray(listResponse.sessions));
		// At least the session we just created should be in the list
		assert.ok(listResponse.sessions.length >= 1, 'should have at least one session');
	});

	// 8. Reconnect replays missed actions
	test('reconnect replays missed actions', async function () {
		this.timeout(15_000);

		// First connection: handshake + create session + subscribe
		const sessionUri = await createAndSubscribeSession(client, 'test-reconnect');

		// Trigger a turn so the server enqueues several actions
		dispatchTurnStarted(client, sessionUri, 'turn-recon', 'hello', 1);

		// Wait for turnComplete to know all actions are emitted
		await client.waitFor(m => isAction(m, 'session/turnComplete'));

		// Record the serverSeq we've seen so far — take the last action message
		const allActions = client.received(m => m.type === 'action') as IActionMessage[];
		assert.ok(allActions.length > 0, 'should have received actions');

		// Use a seq BEFORE the last few actions so they'll be replayed
		// The first action's serverSeq - 1 means we "missed" all of them
		const missedFromSeq = allActions[0].envelope.serverSeq - 1;

		// Disconnect the first client
		client.close();

		// New connection
		const client2 = new TestProtocolClient(server.port);
		await client2.connect();

		// Reconnect with the old seq
		client2.send({
			type: 'clientReconnect',
			clientId: 'test-reconnect',
			lastSeenServerSeq: missedFromSeq,
			subscriptions: [sessionUri],
		});

		// Wait a bit for replayed actions or reconnectResponse
		// The server sends either replayed action messages or a reconnectResponse with snapshots
		await new Promise(resolve => setTimeout(resolve, 500));

		const replayed = client2.received();
		assert.ok(replayed.length > 0, 'should receive replayed actions or reconnect response');

		// Verify: either we got replayed actions or a reconnectResponse with snapshots
		const hasReplayedActions = replayed.some(m => m.type === 'action');
		const hasReconnectResponse = replayed.some(m => m.type === 'reconnectResponse');
		assert.ok(hasReplayedActions || hasReconnectResponse, 'should get replayed actions or reconnect response');

		client2.close();
	});
});
