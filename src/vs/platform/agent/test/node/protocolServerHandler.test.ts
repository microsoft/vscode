/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { ISessionAction } from '../../common/state/sessionActions.js';
import type { IClientMessage, ICreateSessionCommand, IServerMessage, IStateSnapshot } from '../../common/state/sessionProtocol.js';
import { SessionStatus, type ISessionSummary } from '../../common/state/sessionState.js';
import { PROTOCOL_VERSION } from '../../common/state/sessionCapabilities.js';
import type { IProtocolServer, IProtocolTransport } from '../../common/state/sessionTransport.js';
import { ProtocolServerHandler, type IProtocolSideEffectHandler } from '../../node/protocolServerHandler.js';
import { SessionStateManager } from '../../node/sessionStateManager.js';
import { hasKey } from '../../../../base/common/types.js';

// ---- Mock helpers -----------------------------------------------------------

class MockProtocolTransport implements IProtocolTransport {
	private readonly _onMessage = new Emitter<IClientMessage | IServerMessage>();
	readonly onMessage = this._onMessage.event;
	private readonly _onClose = new Emitter<void>();
	readonly onClose = this._onClose.event;

	readonly sent: (IClientMessage | IServerMessage)[] = [];

	send(message: IClientMessage | IServerMessage): void {
		this.sent.push(message);
	}

	simulateMessage(msg: IClientMessage): void {
		this._onMessage.fire(msg);
	}

	simulateClose(): void {
		this._onClose.fire();
	}

	dispose(): void {
		this._onMessage.dispose();
		this._onClose.dispose();
	}
}

class MockProtocolServer implements IProtocolServer {
	private readonly _onConnection = new Emitter<IProtocolTransport>();
	readonly onConnection = this._onConnection.event;
	readonly address = 'mock://test';

	simulateConnection(transport: IProtocolTransport): void {
		this._onConnection.fire(transport);
	}

	dispose(): void {
		this._onConnection.dispose();
	}
}

class MockSideEffectHandler implements IProtocolSideEffectHandler {
	readonly handledActions: ISessionAction[] = [];
	handleAction(action: ISessionAction): void {
		this.handledActions.push(action);
	}
	handleCreateSession(_command: ICreateSessionCommand): void { }
	handleDisposeSession(_session: URI): void { }
	async handleListSessions(): Promise<ISessionSummary[]> { return []; }
}

// ---- Tests ------------------------------------------------------------------

suite('ProtocolServerHandler', () => {

	let disposables: DisposableStore;
	let stateManager: SessionStateManager;
	let server: MockProtocolServer;
	let sideEffects: MockSideEffectHandler;

	const sessionUri = URI.from({ scheme: 'copilot', path: '/test-session' });

	function makeSessionSummary(resource?: URI): ISessionSummary {
		return {
			resource: resource ?? sessionUri,
			provider: 'copilot',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
		};
	}

	function connectClient(clientId: string, initialSubscriptions?: readonly URI[]): MockProtocolTransport {
		const transport = new MockProtocolTransport();
		server.simulateConnection(transport);
		transport.simulateMessage({
			type: 'clientHello',
			protocolVersion: PROTOCOL_VERSION,
			clientId,
			initialSubscriptions,
		});
		return transport;
	}

	setup(() => {
		disposables = new DisposableStore();
		stateManager = disposables.add(new SessionStateManager(new NullLogService()));
		server = disposables.add(new MockProtocolServer());
		sideEffects = new MockSideEffectHandler();
		disposables.add(new ProtocolServerHandler(
			stateManager,
			server,
			sideEffects,
			new NullLogService(),
		));
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('handshake sends ServerHello', () => {
		const transport = connectClient('client-1');

		assert.strictEqual(transport.sent.length, 1);
		const hello = transport.sent[0] as Extract<IServerMessage, { type: 'serverHello' }>;
		assert.strictEqual(hello.type, 'serverHello');
		assert.strictEqual(hello.protocolVersion, PROTOCOL_VERSION);
		assert.strictEqual(hello.serverSeq, stateManager.serverSeq);
	});

	test('handshake with initialSubscriptions returns snapshots', () => {
		stateManager.createSession(makeSessionSummary());

		const transport = connectClient('client-1', [sessionUri]);

		const hello = transport.sent[0] as Extract<IServerMessage, { type: 'serverHello' }>;
		assert.strictEqual(hello.type, 'serverHello');
		assert.strictEqual(hello.snapshots.length, 1);
		assert.strictEqual(hello.snapshots[0].resource.toString(), sessionUri.toString());
	});

	test('subscribe sends snapshot', () => {
		stateManager.createSession(makeSessionSummary());

		const transport = connectClient('client-1');
		transport.sent.length = 0; // clear the serverHello

		transport.simulateMessage({
			type: 'subscribe',
			resource: sessionUri,
		});

		assert.strictEqual(transport.sent.length, 1);
		const snapshot = transport.sent[0] as IStateSnapshot;
		assert.strictEqual(snapshot.type, 'stateSnapshot');
		assert.strictEqual(snapshot.resource.toString(), sessionUri.toString());
	});

	test('client action is dispatched and echoed', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: 'session/ready', session: sessionUri });

		const transport = connectClient('client-1', [sessionUri]);
		transport.sent.length = 0;

		transport.simulateMessage({
			type: 'action',
			clientSeq: 1,
			action: {
				type: 'session/turnStarted',
				session: sessionUri,
				turnId: 'turn-1',
				userMessage: { text: 'hello' },
			},
		});

		// Should receive the echoed action envelope
		assert.ok(transport.sent.length >= 1);
		const actionMsg = transport.sent.find(
			m => m.type === 'action' && hasKey(m, { envelope: true }) && m.envelope.action.type === 'session/turnStarted'
		) as Extract<IServerMessage, { type: 'action' }>;
		assert.ok(actionMsg);
		assert.strictEqual(actionMsg.envelope.action.type, 'session/turnStarted');
		assert.strictEqual(actionMsg.envelope.origin?.clientId, 'client-1');
		assert.strictEqual(actionMsg.envelope.origin?.clientSeq, 1);
	});

	test('actions are scoped to subscribed sessions', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: 'session/ready', session: sessionUri });

		const transportA = connectClient('client-a', [sessionUri]);
		const transportB = connectClient('client-b'); // no subscription

		transportA.sent.length = 0;
		transportB.sent.length = 0;

		// Fire a server action on the session
		stateManager.dispatchServerAction({
			type: 'session/titleChanged',
			session: sessionUri,
			title: 'New Title',
		});

		// Client A subscribed — should see it
		const aActions = transportA.sent.filter(m => m.type === 'action');
		assert.strictEqual(aActions.length, 1);

		// Client B not subscribed — should not see it
		const bActions = transportB.sent.filter(m => m.type === 'action');
		assert.strictEqual(bActions.length, 0);
	});

	test('notifications are broadcast to all clients', () => {
		const transportA = connectClient('client-a');
		const transportB = connectClient('client-b');

		transportA.sent.length = 0;
		transportB.sent.length = 0;

		// Creating a session triggers a sessionAdded notification
		stateManager.createSession(makeSessionSummary());

		const aNotifs = transportA.sent.filter(m => m.type === 'notification');
		const bNotifs = transportB.sent.filter(m => m.type === 'notification');
		assert.strictEqual(aNotifs.length, 1);
		assert.strictEqual(bNotifs.length, 1);
	});

	test('reconnect replays missed actions', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: 'session/ready', session: sessionUri });

		// Connect and subscribe, record seq before actions
		const transport1 = connectClient('client-r', [sessionUri]);
		const helloSeq = (transport1.sent[0] as Extract<IServerMessage, { type: 'serverHello' }>).serverSeq;
		transport1.simulateClose(); // disconnect

		// Fire some actions while disconnected
		stateManager.dispatchServerAction({
			type: 'session/titleChanged',
			session: sessionUri,
			title: 'Title A',
		});
		stateManager.dispatchServerAction({
			type: 'session/titleChanged',
			session: sessionUri,
			title: 'Title B',
		});

		// Reconnect with the seq from before the actions
		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		transport2.simulateMessage({
			type: 'clientReconnect',
			clientId: 'client-r',
			lastSeenServerSeq: helloSeq,
			subscriptions: [sessionUri],
		});

		// Should receive the missed actions (not a reconnectResponse with snapshots)
		const replayedActions = transport2.sent.filter(m => m.type === 'action');
		assert.strictEqual(replayedActions.length, 2);
	});

	test('reconnect sends fresh snapshots when gap too large', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: 'session/ready', session: sessionUri });

		const transport1 = connectClient('client-g', [sessionUri]);
		transport1.simulateClose();

		// Fill the replay buffer past capacity (>1000 actions)
		for (let i = 0; i < 1100; i++) {
			stateManager.dispatchServerAction({
				type: 'session/titleChanged',
				session: sessionUri,
				title: `Title ${i}`,
			});
		}

		// Reconnect with seq 0 (very stale)
		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		transport2.simulateMessage({
			type: 'clientReconnect',
			clientId: 'client-g',
			lastSeenServerSeq: 0,
			subscriptions: [sessionUri],
		});

		const reconnectResp = transport2.sent.find(
			m => m.type === 'reconnectResponse'
		) as Extract<IServerMessage, { type: 'reconnectResponse' }>;
		assert.ok(reconnectResp, 'should receive a reconnectResponse');
		assert.ok(reconnectResp.snapshots.length > 0, 'should contain snapshots');
	});

	test('client disconnect cleans up', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: 'session/ready', session: sessionUri });

		const transport = connectClient('client-d', [sessionUri]);
		transport.sent.length = 0;

		transport.simulateClose();

		// Fire an action after disconnect — client should not receive it
		stateManager.dispatchServerAction({
			type: 'session/titleChanged',
			session: sessionUri,
			title: 'After Disconnect',
		});

		assert.strictEqual(transport.sent.length, 0);
	});
});
