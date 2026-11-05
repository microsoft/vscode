/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ISocket, PersistentProtocol, SocketCloseEvent, SocketDiagnosticsEventType } from '../../../../base/parts/ipc/common/ipc.net.js';
import { NullLogService } from '../../../log/common/log.js';
import { WebSocketRemoteConnection } from '../../common/remoteAuthorityResolver.js';
import { ConnectionType, IConnectionOptions, PersistentConnection, PersistentConnectionEventType } from '../../common/remoteAgentConnection.js';
import { RemoteSocketFactoryService } from '../../common/remoteSocketFactoryService.js';
import { IMessage, ISignService } from '../../../sign/common/sign.js';

class TestSocket implements ISocket {
	private readonly _onData = new Emitter<VSBuffer>();
	public readonly onData: Event<VSBuffer> = this._onData.event;
	private readonly _onClose = new Emitter<SocketCloseEvent>();
	public readonly onClose: Event<SocketCloseEvent> = this._onClose.event;
	private readonly _onEnd = new Emitter<void>();
	public readonly onEnd: Event<void> = this._onEnd.event;

	write(buffer: VSBuffer): void { }
	end(): void { }
	async drain(): Promise<void> { }
	traceSocketEvent(type: SocketDiagnosticsEventType, data?: unknown): void { }
	dispose(): void { }

	public fireClose(): void {
		this._onClose.fire(undefined);
	}
}

class TestPersistentConnection extends PersistentConnection {

	public reconnectAttempts = 0;
	public reconnectSucceeds = false;

	constructor(options: IConnectionOptions, protocol: PersistentProtocol) {
		super(ConnectionType.Management, options, 'test-reconnection-token', protocol, /* reconnectionFailureIsFatal */ false);
	}

	protected async _reconnect(): Promise<void> {
		this.reconnectAttempts++;
		if (this.reconnectSucceeds) {
			return;
		}
		throw Object.assign(new Error('connection refused'), {
			code: 'ECONNREFUSED',
			syscall: 'connect'
		});
	}
}

class TestSignService implements ISignService {
	declare readonly _serviceBrand: undefined;

	createNewMessage(value: string): Promise<IMessage> {
		return Promise.resolve({ id: '', data: value });
	}

	validate(): Promise<boolean> {
		return Promise.resolve(true);
	}

	sign(value: string): Promise<string> {
		return Promise.resolve(value);
	}
}

suite('RemoteAgentConnection', () => {

	// Note: this suite intentionally does not use `ensureNoDisposablesAreLeakedInTestSuite()`.
	// Driving `PersistentConnection`'s reconnecting loop through several failed attempts exercises
	// the internal `sleep()` helper's cancellation token listener, which is not captured for
	// disposal since it is expected to be cleaned up together with its short-lived `CancellationTokenSource`.

	test('exposes current liveness before subscribers attach and during reconnection callbacks', async () => {
		const disposables = new DisposableStore();
		try {
			const socket = new TestSocket();
			const protocol = disposables.add(new PersistentProtocol({ socket, sendKeepAlive: false }));
			const connection = disposables.add(new TestPersistentConnection({
				commit: undefined,
				quality: undefined,
				addressProvider: { getAddress: async () => ({ connectTo: new WebSocketRemoteConnection('localhost', 0), connectionToken: undefined }) },
				remoteSocketFactoryService: new RemoteSocketFactoryService(),
				signService: new TestSignService(),
				logService: new NullLogService(),
				ipcLogger: null,
			}, protocol));
			connection.reconnectSucceeds = true;
			const initial = connection.isConnected;
			const states: { type: PersistentConnectionEventType; connected: boolean }[] = [];
			disposables.add(connection.onDidStateChange(event => states.push({ type: event.type, connected: connection.isConnected })));
			const reconnected = Event.toPromise(Event.filter(connection.onDidStateChange, event => event.type === PersistentConnectionEventType.ConnectionGain));
			socket.fireClose();
			const lostBeforeLateSubscription = connection.isConnected;
			await reconnected;
			const restored = connection.isConnected;
			connection.dispose();
			assert.deepStrictEqual({
				initial,
				lostBeforeLateSubscription,
				restored,
				disposed: connection.isConnected,
				states,
			}, {
				initial: true,
				lostBeforeLateSubscription: false,
				restored: true,
				disposed: false,
				states: [
					{ type: PersistentConnectionEventType.ConnectionLost, connected: false },
					{ type: PersistentConnectionEventType.ReconnectionRunning, connected: false },
					{ type: PersistentConnectionEventType.ConnectionGain, connected: true },
				],
			});
		} finally {
			disposables.dispose();
		}
	});

	test('reconnection grace period is immune to wall-clock jumps', async () => {
		const clock = sinon.useFakeTimers();
		const disposables = new DisposableStore();
		try {
			const socket = new TestSocket();
			const protocol = disposables.add(new PersistentProtocol({ socket, sendKeepAlive: false }));

			const options: IConnectionOptions = {
				commit: undefined,
				quality: undefined,
				addressProvider: { getAddress: async () => ({ connectTo: new WebSocketRemoteConnection('localhost', 0), connectionToken: undefined }) },
				remoteSocketFactoryService: new RemoteSocketFactoryService(),
				signService: new TestSignService(),
				logService: new NullLogService(),
				ipcLogger: null
			};

			const connection = disposables.add(new TestPersistentConnection(options, protocol));
			connection.updateGraceTime(12000); // 12s, in 1s increments as required by ProcessTimeRunOnceScheduler

			let permanentFailure = false;
			disposables.add(connection.onDidStateChange(e => {
				if (e.type === PersistentConnectionEventType.ReconnectionPermanentFailure) {
					permanentFailure = true;
				}
			}));

			// connection lost -> starts the reconnecting loop
			socket.fireClose();

			// attempt 0: no wait, fails immediately
			await clock.tickAsync(0);
			assert.strictEqual(connection.reconnectAttempts, 1);
			assert.strictEqual(permanentFailure, false);

			// attempt 1: waits 5s, fails
			await clock.tickAsync(5000);
			assert.strictEqual(connection.reconnectAttempts, 2);
			assert.strictEqual(permanentFailure, false);

			// simulate a laptop going to sleep / a big wall-clock jump, without any process time passing
			clock.setSystemTime(Date.now() + 8 * 60 * 60 * 1000);

			// attempt 2: waits another 5s (total process time so far: 10s, still < 12s grace period)
			await clock.tickAsync(5000);
			assert.strictEqual(connection.reconnectAttempts, 3);
			assert.strictEqual(permanentFailure, false, 'must not expire the grace period because of a wall-clock jump');

			// attempt 3: waits 10s (total process time: 20s, past the 12s grace period), gives up for good
			await clock.tickAsync(10000);
			assert.strictEqual(connection.reconnectAttempts, 4);
			assert.strictEqual(permanentFailure, true);
			assert.strictEqual(connection.isConnected, false);
		} finally {
			disposables.dispose();
			clock.restore();
		}
	});

});
