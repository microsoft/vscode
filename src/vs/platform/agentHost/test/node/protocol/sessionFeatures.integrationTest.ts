/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { SubscribeResult } from '../../../common/state/protocol/commands.js';
import type { IModelChangedAction, IResponsePartAction, SessionAddedNotification, ITitleChangedAction } from '../../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import type { ListSessionsResult, INotificationBroadcastParams } from '../../../common/state/sessionProtocol.js';
import { PendingMessageKind, ResponsePartKind, type SessionState } from '../../../common/state/sessionState.js';
import { MOCK_AUTO_TITLE } from '../mockAgent.js';
import {
	createAndSubscribeSession,
	dispatchTurnStarted,
	getActionEnvelope,
	isActionNotification,
	IServerHandle,
	nextSessionUri,
	startServer,
	TestProtocolClient,
} from './testHelpers.js';

suite('Protocol WebSocket — Session Features', function () {

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

	// ---- Session rename / title ------------------------------------------------

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
		const titleAction = getActionEnvelope(titleNotif).action as ITitleChangedAction;
		assert.strictEqual(titleAction.title, 'My Custom Title');

		const snapshot = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as SessionState;
		assert.strictEqual(state.summary.title, 'My Custom Title');
	});

	test('agent-generated titleChanged is broadcast', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-agent-title');
		dispatchTurnStarted(client, sessionUri, 'turn-title', 'with-title', 1);

		// The first titleChanged is the immediate fallback (user message text).
		// Wait for the agent-generated title which arrives second.
		const titleNotif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/titleChanged')) {
				return false;
			}
			const action = getActionEnvelope(n).action as ITitleChangedAction;
			return action.title === MOCK_AUTO_TITLE;
		});
		const titleAction = getActionEnvelope(titleNotif).action as ITitleChangedAction;
		assert.strictEqual(titleAction.title, MOCK_AUTO_TITLE);

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		const snapshot = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as SessionState;
		assert.strictEqual(state.summary.title, MOCK_AUTO_TITLE);
	});

	test('first turn immediately sets title to user message', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-immediate-title');

		// Verify the session starts with the default placeholder title
		const before = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		assert.strictEqual((before.snapshot.state as SessionState).summary.title, '');

		// Send first turn — side effects should dispatch an immediate titleChanged
		// with the user's message text before the agent produces its own title.
		dispatchTurnStarted(client, sessionUri, 'turn-immediate', 'Fix the login bug', 1);

		// The first titleChanged should carry the user message text
		const titleNotif = await client.waitForNotification(n => isActionNotification(n, 'session/titleChanged'));
		const titleAction = getActionEnvelope(titleNotif).action as ITitleChangedAction;
		assert.strictEqual(titleAction.title, 'Fix the login bug');

		// listSessions should also reflect the updated title
		const result = await client.call<ListSessionsResult>('listSessions');
		const session = result.items.find(s => s.resource === sessionUri);
		assert.ok(session, 'session should appear in listSessions');
		assert.strictEqual(session.title, 'Fix the login bug');
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
		let session: { title: string } | undefined;
		for (let i = 0; i < 20; i++) {
			const result = await client.call<ListSessionsResult>('listSessions');
			session = result.items.find(s => s.resource === sessionUri);
			if (session?.title === 'Persisted Title') {
				break;
			}
			await timeout(100);
		}
		assert.ok(session, 'session should appear in listSessions');
		assert.strictEqual(session.title, 'Persisted Title');
	});

	// ---- Session model --------------------------------------------------------

	test('session model flows through create, subscribe, listSessions, and modelChanged', async function () {
		this.timeout(10_000);

		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-model-summary' });

		const sessionUri = nextSessionUri();
		await client.call('createSession', { session: sessionUri, provider: 'mock', model: { id: 'mock-model' } });

		const addedNotif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
		const addedSession = (addedNotif.params as INotificationBroadcastParams).notification as SessionAddedNotification;
		assert.deepStrictEqual(addedSession.summary.model, { id: 'mock-model' });
		const createdSessionUri = addedSession.summary.resource;

		const initialSnapshot = await client.call<SubscribeResult>('subscribe', { resource: createdSessionUri });
		const initialState = initialSnapshot.snapshot.state as SessionState;
		assert.deepStrictEqual(initialState.summary.model, { id: 'mock-model' });

		const initialList = await client.call<ListSessionsResult>('listSessions');
		assert.deepStrictEqual(initialList.items.find(s => s.resource === createdSessionUri)?.model, { id: 'mock-model' });

		client.notify('dispatchAction', {
			clientSeq: 1,
			action: {
				type: 'session/modelChanged',
				session: createdSessionUri,
				model: { id: 'mock-model-2' },
			},
		});

		const modelNotif = await client.waitForNotification(n => isActionNotification(n, 'session/modelChanged'));
		const modelAction = getActionEnvelope(modelNotif).action as IModelChangedAction;
		assert.deepStrictEqual(modelAction.model, { id: 'mock-model-2' });

		const updatedSnapshot = await client.call<SubscribeResult>('subscribe', { resource: createdSessionUri });
		const updatedState = updatedSnapshot.snapshot.state as SessionState;
		assert.deepStrictEqual(updatedState.summary.model, { id: 'mock-model-2' });

		const updatedList = await client.call<ListSessionsResult>('listSessions');
		assert.deepStrictEqual(updatedList.items.find(s => s.resource === createdSessionUri)?.model, { id: 'mock-model-2' });
	});

	// ---- Reasoning events ------------------------------------------------------

	test('reasoning events produce reasoning response parts and append actions', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-reasoning');
		dispatchTurnStarted(client, sessionUri, 'turn-reasoning', 'with-reasoning', 1);

		// The first reasoning event produces a responsePart with kind Reasoning
		const reasoningPart = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/responsePart')) {
				return false;
			}
			const action = getActionEnvelope(n).action as IResponsePartAction;
			return action.part.kind === ResponsePartKind.Reasoning;
		});
		const reasoningAction = getActionEnvelope(reasoningPart).action as IResponsePartAction;
		assert.strictEqual(reasoningAction.part.kind, ResponsePartKind.Reasoning);

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
			const action = getActionEnvelope(n).action as IResponsePartAction;
			return action.part.kind === ResponsePartKind.Markdown;
		});
		assert.ok(mdPart);

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
	});

	// ---- Queued messages -------------------------------------------------------

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
				kind: PendingMessageKind.Queued,
				id: 'q-1',
				userMessage: { text: 'hello' },
			},
		});

		// The server should auto-consume the queued message and start a turn
		await client.waitForNotification(n => isActionNotification(n, 'session/turnStarted'));
		await client.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		// Verify the turn was created from the queued message
		const snapshot = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as SessionState;
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
				kind: PendingMessageKind.Queued,
				id: 'q-wait-1',
				userMessage: { text: 'hello' },
			},
		});

		// First turn should complete
		const firstComplete = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/turnComplete')) {
				return false;
			}
			return (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-first';
		});
		const firstSeq = getActionEnvelope(firstComplete).serverSeq;

		// The queued message's turn should complete AFTER the first turn
		const secondComplete = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/turnComplete')) {
				return false;
			}
			const envelope = getActionEnvelope(n);
			return (envelope.action as { turnId: string }).turnId !== 'turn-first'
				&& envelope.serverSeq > firstSeq;
		});
		assert.ok(secondComplete, 'should receive a second turnComplete from the queued message');

		const snapshot = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as SessionState;
		assert.ok(state.turns.length >= 2, `expected >= 2 turns but got ${state.turns.length}`);
	});

	// ---- Steering messages ----------------------------------------------------

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
				kind: PendingMessageKind.Steering,
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
		const snapshot = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as SessionState;
		assert.ok(!state.steeringMessage, 'steering message should be cleared after consumption');
	});

	// ---- Truncation -----------------------------------------------------------

	test('truncate session removes turns after specified turn', async function () {
		this.timeout(15_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-truncate');

		// Create two turns
		dispatchTurnStarted(client, sessionUri, 'turn-t1', 'hello', 1);
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete') && (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-t1');

		client.clearReceived();
		dispatchTurnStarted(client, sessionUri, 'turn-t2', 'hello', 2);
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete') && (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-t2');

		// Verify 2 turns exist
		let snapshot = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		let state = snapshot.snapshot.state as SessionState;
		assert.strictEqual(state.turns.length, 2);

		client.clearReceived();

		// Truncate: keep only turn-t1
		client.notify('dispatchAction', {
			clientSeq: 3,
			action: { type: 'session/truncated', session: sessionUri, turnId: 'turn-t1' },
		});

		await client.waitForNotification(n => isActionNotification(n, 'session/truncated'));

		snapshot = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		state = snapshot.snapshot.state as SessionState;
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

		const snapshot = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as SessionState;
		assert.strictEqual(state.turns.length, 0);
	});

	test('new turn after truncation works correctly', async function () {
		this.timeout(15_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-truncate-resume');

		dispatchTurnStarted(client, sessionUri, 'turn-tr1', 'hello', 1);
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete') && (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-tr1');

		client.clearReceived();
		dispatchTurnStarted(client, sessionUri, 'turn-tr2', 'hello', 2);
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete') && (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-tr2');

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

		const snapshot = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as SessionState;
		assert.strictEqual(state.turns.length, 2);
		assert.strictEqual(state.turns[0].id, 'turn-tr1');
		assert.strictEqual(state.turns[1].id, 'turn-tr3');
	});

	// ---- Fork -----------------------------------------------------------------

	test('fork creates a new session with source history', async function () {
		this.timeout(15_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-fork');

		// Create two turns
		dispatchTurnStarted(client, sessionUri, 'turn-f1', 'hello', 1);
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete') && (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-f1');

		client.clearReceived();
		dispatchTurnStarted(client, sessionUri, 'turn-f2', 'hello', 2);
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete') && (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-f2');

		client.clearReceived();

		// Fork at turn-f1 (keep turns up to and including turn-f1)
		const forkedSessionUri = nextSessionUri();
		await client.call('createSession', {
			session: forkedSessionUri,
			provider: 'mock',
			fork: { session: sessionUri, turnId: 'turn-f1' },
		});

		const addedNotif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
		const addedSession = (addedNotif.params as INotificationBroadcastParams).notification as SessionAddedNotification;

		// Subscribe — forked session should have 1 turn
		const snapshot = await client.call<SubscribeResult>('subscribe', { resource: addedSession.summary.resource });
		const state = snapshot.snapshot.state as SessionState;
		assert.strictEqual(state.lifecycle, 'ready');
		assert.strictEqual(state.turns.length, 1, 'forked session should have 1 turn');

		// Source session should be unaffected
		const sourceSnapshot = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const sourceState = sourceSnapshot.snapshot.state as SessionState;
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
		} catch {
			gotError = true;
		}
		assert.ok(gotError, 'should get error for invalid fork turn ID');
	});

	test('fork with invalid source session returns error', async function () {
		this.timeout(10_000);

		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-fork-no-source' });

		let gotError = false;
		try {
			await client.call('createSession', {
				session: nextSessionUri(),
				provider: 'mock',
				fork: { session: 'mock://nonexistent-session', turnId: 'turn-1' },
			});
		} catch {
			gotError = true;
		}
		assert.ok(gotError, 'should get error for invalid fork source session');
	});
});
