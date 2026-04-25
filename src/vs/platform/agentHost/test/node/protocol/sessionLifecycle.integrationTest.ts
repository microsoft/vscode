/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { SubscribeResult } from '../../../common/state/protocol/commands.js';
import type { SessionAddedNotification, SessionRemovedNotification } from '../../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../../common/state/sessionCapabilities.js';
import type { ListSessionsResult, INotificationBroadcastParams } from '../../../common/state/sessionProtocol.js';
import { ResponsePartKind, SessionStatus, type MarkdownResponsePart, type SessionState, type ToolCallResponsePart } from '../../../common/state/sessionState.js';
import { PRE_EXISTING_SESSION_URI } from '../mockAgent.js';
import {
	createAndSubscribeSession,
	isActionNotification,
	IServerHandle,
	nextSessionUri,
	startServer,
	TestProtocolClient
} from './testHelpers.js';

suite('Protocol WebSocket — Session Lifecycle', function () {

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

	test('create session triggers sessionAdded notification', async function () {
		this.timeout(10_000);

		await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-create-session' });

		await client.call('createSession', { session: nextSessionUri(), provider: 'mock' });

		const notif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
		const notification = (notif.params as INotificationBroadcastParams).notification as SessionAddedNotification;
		assert.strictEqual(URI.parse(notification.summary.resource).scheme, 'mock');
		assert.strictEqual(notification.summary.provider, 'mock');
	});

	test('listSessions returns sessions', async function () {
		this.timeout(10_000);

		await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-list-sessions' });

		await client.call('createSession', { session: nextSessionUri(), provider: 'mock' });
		await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);

		const result = await client.call<ListSessionsResult>('listSessions');
		assert.ok(Array.isArray(result.items));
		assert.ok(result.items.length >= 1, 'should have at least one session');
	});

	test('dispose session sends sessionRemoved notification', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-dispose');
		await client.call('disposeSession', { session: sessionUri });

		const notif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionRemoved'
		);
		const removed = (notif.params as INotificationBroadcastParams).notification as SessionRemovedNotification;
		assert.strictEqual(removed.session.toString(), sessionUri.toString());
	});

	test('subscribe to a pre-existing session restores turns from agent history', async function () {
		this.timeout(10_000);

		await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-restore' });

		// The mock agent seeds a pre-existing session that was never created
		// through the server's handleCreateSession -- simulating a session
		// from a previous server lifetime.
		const preExistingUri = PRE_EXISTING_SESSION_URI.toString();
		const list = await client.call<ListSessionsResult>('listSessions');
		const preExisting = list.items.find(s => s.resource === preExistingUri);
		assert.ok(preExisting, 'listSessions should include the pre-existing session');

		// Clear notifications so we can verify no duplicate sessionAdded fires.
		client.clearReceived();

		// Subscribing to this session should trigger the restore path: the
		// server fetches message history from the agent and reconstructs turns.
		const result = await client.call<SubscribeResult>('subscribe', { resource: preExistingUri });
		const state = result.snapshot.state as SessionState;

		assert.strictEqual(state.lifecycle, 'ready', 'restored session should be in ready state');
		assert.ok(state.turns.length >= 1, `expected at least 1 restored turn but got ${state.turns.length}`);

		const turn = state.turns[0];
		assert.strictEqual(turn.userMessage.text, 'What files are here?');
		assert.strictEqual(turn.state, 'complete');
		const toolCallParts = turn.responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
		assert.ok(toolCallParts.length >= 1, 'turn should have tool call response parts');
		assert.strictEqual(toolCallParts[0].toolCall.toolName, 'list_files');
		const mdParts = turn.responseParts.filter((p): p is MarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
		assert.ok(mdParts.some(p => p.content.includes('file1.ts')), 'turn should have markdown part mentioning file1.ts');

		// Restoring should NOT emit a duplicate sessionAdded notification
		// (the session is already known to clients via listSessions).
		await new Promise(resolve => setTimeout(resolve, 200));
		const sessionAddedNotifs = client.receivedNotifications(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
		assert.strictEqual(sessionAddedNotifs.length, 0, 'restore should not emit sessionAdded');
	});

	test('isRead and isArchived flags survive in listSessions after dispatch', async function () {
		this.timeout(15_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-read-archived-flags');

		// Dispatch isArchived=true
		client.notify('dispatchAction', {
			clientSeq: 1,
			action: {
				type: 'session/isArchivedChanged',
				session: sessionUri,
				isArchived: true,
			},
		});

		await client.waitForNotification(n => isActionNotification(n, 'session/isArchivedChanged'));

		// Dispatch isRead=true
		client.notify('dispatchAction', {
			clientSeq: 2,
			action: {
				type: 'session/isReadChanged',
				session: sessionUri,
				isRead: true,
			},
		});

		await client.waitForNotification(n => isActionNotification(n, 'session/isReadChanged'));

		// Verify the flags are reflected in the subscribed session state
		const snapshot = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as SessionState;
		assert.ok(state.summary.status & SessionStatus.IsArchived, 'IsArchived flag should be set in snapshot');
		assert.ok(state.summary.status & SessionStatus.IsRead, 'IsRead flag should be set in snapshot');

		// Poll listSessions until the persisted flags appear (async DB write)
		client.close();
		const client2 = new TestProtocolClient(server.port);
		await client2.connect();
		await client2.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-read-archived-flags-2' });

		let session: ListSessionsResult['items'][0] | undefined;
		for (let i = 0; i < 20; i++) {
			const result = await client2.call<ListSessionsResult>('listSessions');
			session = result.items.find(s => s.resource === sessionUri);
			if (session && (session.status & SessionStatus.IsArchived) && (session.status & SessionStatus.IsRead)) {
				break;
			}
			await timeout(100);
		}
		assert.ok(session, 'session should appear in listSessions');
		assert.ok(session.status & SessionStatus.IsArchived, 'IsArchived should be persisted in listSessions');
		assert.ok(session.status & SessionStatus.IsRead, 'IsRead should be persisted in listSessions');

		client2.close();
	});

	test('dispatching isRead=false explicitly persists as false', async function () {
		this.timeout(15_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-isread-false');

		// On a fresh session, isRead is undefined in the DB.  Dispatching
		// isRead=false should persist the value so that listSessions
		// returns an explicit `false` rather than omitting the field.
		client.notify('dispatchAction', {
			clientSeq: 1,
			action: {
				type: 'session/isReadChanged',
				session: sessionUri,
				isRead: false,
			},
		});

		await client.waitForNotification(n => isActionNotification(n, 'session/isReadChanged'));

		client.close();
		const client2 = new TestProtocolClient(server.port);
		await client2.connect();
		await client2.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-isread-false-2' });

		let session: ListSessionsResult['items'][0] | undefined;
		for (let i = 0; i < 20; i++) {
			const result = await client2.call<ListSessionsResult>('listSessions');
			session = result.items.find(s => s.resource === sessionUri);
			if (session && !(session.status & SessionStatus.IsRead)) {
				break;
			}
			await timeout(100);
		}
		assert.ok(session, 'session should appear in listSessions');
		assert.strictEqual(session.status & SessionStatus.IsRead, 0, 'IsRead flag should not be set');

		client2.close();
	});
});
