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
import { isJsonRpcNotification, isJsonRpcResponse, type ICreateSessionParams, type IProtocolMessage, type IProtocolNotification, type IServerHelloParams, type IStateSnapshot } from '../../common/state/sessionProtocol.js';
import { SessionStatus, type ISessionSummary } from '../../common/state/sessionState.js';
import { PROTOCOL_VERSION } from '../../common/state/sessionCapabilities.js';
import type { IProtocolServer, IProtocolTransport } from '../../common/state/sessionTransport.js';
import { ProtocolServerHandler, type IProtocolSideEffectHandler } from '../../node/protocolServerHandler.js';
import { SessionStateManager } from '../../node/sessionStateManager.js';

// ---- Mock helpers -----------------------------------------------------------

class MockProtocolTransport implements IProtocolTransport {
	private readonly _onMessage = new Emitter<IProtocolMessage>();
	readonly onMessage = this._onMessage.event;
	private readonly _onClose = new Emitter<void>();
	readonly onClose = this._onClose.event;

	readonly sent: IProtocolMessage[] = [];

	send(message: IProtocolMessage): void {
		this.sent.push(message);
	}

	simulateMessage(msg: IProtocolMessage): void {
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
	async handleCreateSession(_command: ICreateSessionParams): Promise<void> { }
	handleDisposeSession(_session: URI): void { }
	async handleListSessions(): Promise<ISessionSummary[]> { return []; }
}

// ---- Helpers ----------------------------------------------------------------

function notification(method: string, params?: unknown): IProtocolMessage {
	return { jsonrpc: '2.0', method, params } as IProtocolMessage;
}

function request(id: number, method: string, params?: unknown): IProtocolMessage {
	return { jsonrpc: '2.0', id, method, params } as IProtocolMessage;
}

function findNotification(sent: IProtocolMessage[], method: string): IProtocolNotification | undefined {
	return sent.find(isJsonRpcNotification) as IProtocolNotification | undefined;
}

function findNotifications(sent: IProtocolMessage[], method: string): IProtocolNotification[] {
	return sent.filter(isJsonRpcNotification) as IProtocolNotification[];
}

function findResponse(sent: IProtocolMessage[], id: number): IProtocolMessage | undefined {
	return sent.find(isJsonRpcResponse) as IProtocolMessage | undefined;
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
		transport.simulateMessage(notification('initialize', {
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

	test('handshake sends serverHello notification', () => {
		const transport = connectClient('client-1');

		const hello = findNotification(transport.sent, 'serverHello');
		assert.ok(hello, 'should have sent serverHello');
		const params = hello.params as IServerHelloParams;
		assert.strictEqual(params.protocolVersion, PROTOCOL_VERSION);
		assert.strictEqual(params.serverSeq, stateManager.serverSeq);
	});

	test('handshake with initialSubscriptions returns snapshots', () => {
		stateManager.createSession(makeSessionSummary());

		const transport = connectClient('client-1', [sessionUri]);

		const hello = findNotification(transport.sent, 'serverHello');
		assert.ok(hello);
		const params = hello.params as IServerHelloParams;
		assert.strictEqual(params.snapshots.length, 1);
		assert.strictEqual(params.snapshots[0].resource.toString(), sessionUri.toString());
	});

	test('subscribe request returns snapshot', async () => {
		stateManager.createSession(makeSessionSummary());

		const transport = connectClient('client-1');
		transport.sent.length = 0;

		transport.simulateMessage(request(1, 'subscribe', { resource: sessionUri }));

		// Wait for async response
		await new Promise(resolve => setTimeout(resolve, 10));

		const resp = findResponse(transport.sent, 1);
		assert.ok(resp, 'should have sent response');
		const snapshot = (resp as { result: IStateSnapshot }).result;
		assert.strictEqual(snapshot.resource.toString(), sessionUri.toString());
	});

	test('client action is dispatched and echoed', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: 'session/ready', session: sessionUri });

		const transport = connectClient('client-1', [sessionUri]);
		transport.sent.length = 0;

		transport.simulateMessage(notification('dispatchAction', {
			clientSeq: 1,
			action: {
				type: 'session/turnStarted',
				session: sessionUri,
				turnId: 'turn-1',
				userMessage: { text: 'hello' },
			},
		}));

		const actionMsgs = findNotifications(transport.sent, 'action');
		const turnStarted = actionMsgs.find(m => {
			const params = m.params as { envelope: { action: { type: string } } };
			return params.envelope.action.type === 'session/turnStarted';
		});
		assert.ok(turnStarted, 'should have echoed turnStarted');
		const envelope = (turnStarted!.params as { envelope: { origin: { clientId: string; clientSeq: number } } }).envelope;
		assert.strictEqual(envelope.origin.clientId, 'client-1');
		assert.strictEqual(envelope.origin.clientSeq, 1);
	});

	test('actions are scoped to subscribed sessions', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: 'session/ready', session: sessionUri });

		const transportA = connectClient('client-a', [sessionUri]);
		const transportB = connectClient('client-b');

		transportA.sent.length = 0;
		transportB.sent.length = 0;

		stateManager.dispatchServerAction({
			type: 'session/titleChanged',
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
		stateManager.dispatchServerAction({ type: 'session/ready', session: sessionUri });

		const transport1 = connectClient('client-r', [sessionUri]);
		const hello = findNotification(transport1.sent, 'serverHello');
		const helloSeq = (hello!.params as IServerHelloParams).serverSeq;
		transport1.simulateClose();

		stateManager.dispatchServerAction({ type: 'session/titleChanged', session: sessionUri, title: 'Title A' });
		stateManager.dispatchServerAction({ type: 'session/titleChanged', session: sessionUri, title: 'Title B' });

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		transport2.simulateMessage(notification('reconnect', {
			clientId: 'client-r',
			lastSeenServerSeq: helloSeq,
			subscriptions: [sessionUri],
		}));

		const replayed = findNotifications(transport2.sent, 'action');
		assert.strictEqual(replayed.length, 2);
	});

	test('reconnect sends fresh snapshots when gap too large', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: 'session/ready', session: sessionUri });

		const transport1 = connectClient('client-g', [sessionUri]);
		transport1.simulateClose();

		for (let i = 0; i < 1100; i++) {
			stateManager.dispatchServerAction({ type: 'session/titleChanged', session: sessionUri, title: `Title ${i}` });
		}

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		transport2.simulateMessage(notification('reconnect', {
			clientId: 'client-g',
			lastSeenServerSeq: 0,
			subscriptions: [sessionUri],
		}));

		const reconnectResp = findNotification(transport2.sent, 'reconnectResponse');
		assert.ok(reconnectResp, 'should receive a reconnectResponse');
		const params = reconnectResp!.params as { snapshots: IStateSnapshot[] };
		assert.ok(params.snapshots.length > 0, 'should contain snapshots');
	});

	test('client disconnect cleans up', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: 'session/ready', session: sessionUri });

		const transport = connectClient('client-d', [sessionUri]);
		transport.sent.length = 0;

		transport.simulateClose();

		stateManager.dispatchServerAction({ type: 'session/titleChanged', session: sessionUri, title: 'After Disconnect' });

		assert.strictEqual(transport.sent.length, 0);
	});
});
