/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SubscribeResult } from '../../../common/state/protocol/commands.js';
import type { SessionAddedNotification, SessionRemovedNotification } from '../../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../../common/state/sessionCapabilities.js';
import type { INotificationBroadcastParams, ReconnectResult } from '../../../common/state/sessionProtocol.js';
import type { SessionState } from '../../../common/state/sessionState.js';
import {
	createAndSubscribeSession,
	dispatchTurnStarted,
	getActionEnvelope,
	IServerHandle,
	isActionNotification,
	nextSessionUri,
	startServer,
	TestProtocolClient,
} from './testHelpers.js';

suite('Protocol WebSocket — Multi-Client', function () {

	let server: IServerHandle;
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

		const uri1 = ((n1.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource;
		const uri2 = ((n2.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource;
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

		const removed1 = (n1.params as INotificationBroadcastParams).notification as SessionRemovedNotification;
		const removed2 = (n2.params as INotificationBroadcastParams).notification as SessionRemovedNotification;
		assert.strictEqual(removed1.session.toString(), sessionUri.toString());
		assert.strictEqual(removed2.session.toString(), sessionUri.toString());

		client2.close();
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

		const result = await client2.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const state = result.snapshot.state as SessionState;
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
		const result = await client2.call<ReconnectResult>('reconnect', {
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
});
