/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { EventEmitter } from 'events';
import { AddressInfo, connect, createServer, Server, Socket } from 'net';
import { tmpdir } from 'os';
import { Barrier, timeout } from '../../../../common/async.js';
import { VSBuffer } from '../../../../common/buffer.js';
import { Emitter, Event } from '../../../../common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../common/lifecycle.js';
import { ILoadEstimator, PersistentProtocol, Protocol, ProtocolConstants, SocketCloseEvent, SocketDiagnosticsEventType } from '../../common/ipc.net.js';
import { createRandomIPCHandle, createStaticIPCHandle, NodeSocket, WebSocketNodeSocket } from '../../node/ipc.net.js';
import { flakySuite } from '../../../../test/common/testUtils.js';
import { runWithFakedTimers } from '../../../../test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';

class MessageStream extends Disposable {

	private _currentComplete: ((data: VSBuffer) => void) | null;
	private _messages: VSBuffer[];

	constructor(x: Protocol | PersistentProtocol) {
		super();
		this._currentComplete = null;
		this._messages = [];
		this._register(x.onMessage(data => {
			this._messages.push(data);
			this._trigger();
		}));
	}

	private _trigger(): void {
		if (!this._currentComplete) {
			return;
		}
		if (this._messages.length === 0) {
			return;
		}
		const complete = this._currentComplete;
		const msg = this._messages.shift()!;

		this._currentComplete = null;
		complete(msg);
	}

	public waitForOne(): Promise<VSBuffer> {
		return new Promise<VSBuffer>((complete) => {
			this._currentComplete = complete;
			this._trigger();
		});
	}
}

class EtherStream extends EventEmitter {
	constructor(
		private readonly _ether: Ether,
		private readonly _name: 'a' | 'b'
	) {
		super();
	}

	write(data: Buffer, cb?: Function): boolean {
		if (!Buffer.isBuffer(data)) {
			throw new Error(`Invalid data`);
		}
		this._ether.write(this._name, data);
		return true;
	}

	destroy(): void {
	}
}

class Ether {

	private readonly _a: EtherStream;
	private readonly _b: EtherStream;

	private _ab: Buffer[];
	private _ba: Buffer[];

	public get a(): Socket {
		// eslint-disable-next-line local/code-no-any-casts
		return <any>this._a;
	}

	public get b(): Socket {
		// eslint-disable-next-line local/code-no-any-casts
		return <any>this._b;
	}

	constructor(
		private readonly _wireLatency = 0
	) {
		this._a = new EtherStream(this, 'a');
		this._b = new EtherStream(this, 'b');
		this._ab = [];
		this._ba = [];
	}

	public write(from: 'a' | 'b', data: Buffer): void {
		setTimeout(() => {
			if (from === 'a') {
				this._ab.push(data);
			} else {
				this._ba.push(data);
			}

			setTimeout(() => this._deliver(), 0);
		}, this._wireLatency);
	}

	private _deliver(): void {

		if (this._ab.length > 0) {
			const data = Buffer.concat(this._ab);
			this._ab.length = 0;
			this._b.emit('data', data);
			setTimeout(() => this._deliver(), 0);
			return;
		}

		if (this._ba.length > 0) {
			const data = Buffer.concat(this._ba);
			this._ba.length = 0;
			this._a.emit('data', data);
			setTimeout(() => this._deliver(), 0);
			return;
		}

	}
}

suite('IPC, Socket Protocol', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let ether: Ether;

	setup(() => {
		ether = new Ether();
	});

	test('read/write', async () => {

		const a = new Protocol(new NodeSocket(ether.a));
		const b = new Protocol(new NodeSocket(ether.b));
		const bMessages = new MessageStream(b);

		a.send(VSBuffer.fromString('foobarfarboo'));
		const msg1 = await bMessages.waitForOne();
		assert.strictEqual(msg1.toString(), 'foobarfarboo');

		const buffer = VSBuffer.alloc(1);
		buffer.writeUInt8(123, 0);
		a.send(buffer);
		const msg2 = await bMessages.waitForOne();
		assert.strictEqual(msg2.readUInt8(0), 123);

		bMessages.dispose();
		a.dispose();
		b.dispose();
	});


	test('read/write, object data', async () => {

		const a = new Protocol(new NodeSocket(ether.a));
		const b = new Protocol(new NodeSocket(ether.b));
		const bMessages = new MessageStream(b);

		const data = {
			pi: Math.PI,
			foo: 'bar',
			more: true,
			data: 'Hello World'.split('')
		};

		a.send(VSBuffer.fromString(JSON.stringify(data)));
		const msg = await bMessages.waitForOne();
		assert.deepStrictEqual(JSON.parse(msg.toString()), data);

		bMessages.dispose();
		a.dispose();
		b.dispose();
	});



	test('issue #211462: destroy socket after end timeout', async () => {
		const socket = new EventEmitter();
		Object.assign(socket, { destroy: () => socket.emit('close') });
		const protocol = ds.add(new Protocol(new NodeSocket(socket as Socket)));

		const disposed = sinon.stub();
		const timers = sinon.useFakeTimers();

		ds.add(toDisposable(() => timers.restore()));
		ds.add(protocol.onDidDispose(disposed));

		socket.emit('end');
		assert.ok(!disposed.called);
		timers.tick(29_999);
		assert.ok(!disposed.called);
		timers.tick(1);
		assert.ok(disposed.called);
	});
});

suite('PersistentProtocol reconnection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('acks get piggybacked with messages', async () => {
		const ether = new Ether();
		const a = new PersistentProtocol({ socket: new NodeSocket(ether.a) });
		const aMessages = new MessageStream(a);
		const b = new PersistentProtocol({ socket: new NodeSocket(ether.b) });
		const bMessages = new MessageStream(b);

		a.send(VSBuffer.fromString('a1'));
		assert.strictEqual(a.unacknowledgedCount, 1);
		assert.strictEqual(b.unacknowledgedCount, 0);

		a.send(VSBuffer.fromString('a2'));
		assert.strictEqual(a.unacknowledgedCount, 2);
		assert.strictEqual(b.unacknowledgedCount, 0);

		a.send(VSBuffer.fromString('a3'));
		assert.strictEqual(a.unacknowledgedCount, 3);
		assert.strictEqual(b.unacknowledgedCount, 0);

		const a1 = await bMessages.waitForOne();
		assert.strictEqual(a1.toString(), 'a1');
		assert.strictEqual(a.unacknowledgedCount, 3);
		assert.strictEqual(b.unacknowledgedCount, 0);

		const a2 = await bMessages.waitForOne();
		assert.strictEqual(a2.toString(), 'a2');
		assert.strictEqual(a.unacknowledgedCount, 3);
		assert.strictEqual(b.unacknowledgedCount, 0);

		const a3 = await bMessages.waitForOne();
		assert.strictEqual(a3.toString(), 'a3');
		assert.strictEqual(a.unacknowledgedCount, 3);
		assert.strictEqual(b.unacknowledgedCount, 0);

		b.send(VSBuffer.fromString('b1'));
		assert.strictEqual(a.unacknowledgedCount, 3);
		assert.strictEqual(b.unacknowledgedCount, 1);

		const b1 = await aMessages.waitForOne();
		assert.strictEqual(b1.toString(), 'b1');
		assert.strictEqual(a.unacknowledgedCount, 0);
		assert.strictEqual(b.unacknowledgedCount, 1);

		a.send(VSBuffer.fromString('a4'));
		assert.strictEqual(a.unacknowledgedCount, 1);
		assert.strictEqual(b.unacknowledgedCount, 1);

		const b2 = await bMessages.waitForOne();
		assert.strictEqual(b2.toString(), 'a4');
		assert.strictEqual(a.unacknowledgedCount, 1);
		assert.strictEqual(b.unacknowledgedCount, 0);

		aMessages.dispose();
		bMessages.dispose();
		a.dispose();
		b.dispose();
	});

	test('ack gets sent after a while', async () => {
		await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
			const loadEstimator: ILoadEstimator = {
				hasHighLoad: () => false
			};
			const ether = new Ether();
			const aSocket = new NodeSocket(ether.a);
			const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
			const aMessages = new MessageStream(a);
			const bSocket = new NodeSocket(ether.b);
			const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
			const bMessages = new MessageStream(b);

			// send one message A -> B
			a.send(VSBuffer.fromString('a1'));
			assert.strictEqual(a.unacknowledgedCount, 1);
			assert.strictEqual(b.unacknowledgedCount, 0);
			const a1 = await bMessages.waitForOne();
			assert.strictEqual(a1.toString(), 'a1');
			assert.strictEqual(a.unacknowledgedCount, 1);
			assert.strictEqual(b.unacknowledgedCount, 0);

			// wait for ack to arrive B -> A
			await timeout(2 * ProtocolConstants.AcknowledgeTime);
			assert.strictEqual(a.unacknowledgedCount, 0);
			assert.strictEqual(b.unacknowledgedCount, 0);

			aMessages.dispose();
			bMessages.dispose();
			a.dispose();
			b.dispose();
		});
	});

	test('messages that are never written to a socket should not cause an ack timeout', async () => {
		await runWithFakedTimers(
			{
				useFakeTimers: true,
				useSetImmediate: true,
				maxTaskCount: 1000
			},
			async () => {
				// Date.now() in fake timers starts at 0, which is very inconvenient
				// since we want to test exactly that a certain field is not initialized with Date.now()
				// As a workaround we wait such that Date.now() starts producing more realistic values
				await timeout(60 * 60 * 1000);

				const loadEstimator: ILoadEstimator = {
					hasHighLoad: () => false
				};
				const ether = new Ether();
				const aSocket = new NodeSocket(ether.a);
				const a = new PersistentProtocol({ socket: aSocket, loadEstimator, sendKeepAlive: false });
				const aMessages = new MessageStream(a);
				const bSocket = new NodeSocket(ether.b);
				const b = new PersistentProtocol({ socket: bSocket, loadEstimator, sendKeepAlive: false });
				const bMessages = new MessageStream(b);

				// send message a1 before reconnection to get _recvAckCheck() scheduled
				a.send(VSBuffer.fromString('a1'));
				assert.strictEqual(a.unacknowledgedCount, 1);
				assert.strictEqual(b.unacknowledgedCount, 0);

				// read message a1 at B
				const a1 = await bMessages.waitForOne();
				assert.strictEqual(a1.toString(), 'a1');
				assert.strictEqual(a.unacknowledgedCount, 1);
				assert.strictEqual(b.unacknowledgedCount, 0);

				// send message b1 to send the ack for a1
				b.send(VSBuffer.fromString('b1'));
				assert.strictEqual(a.unacknowledgedCount, 1);
				assert.strictEqual(b.unacknowledgedCount, 1);

				// read message b1 at A to receive the ack for a1
				const b1 = await aMessages.waitForOne();
				assert.strictEqual(b1.toString(), 'b1');
				assert.strictEqual(a.unacknowledgedCount, 0);
				assert.strictEqual(b.unacknowledgedCount, 1);

				// begin reconnection
				aSocket.dispose();
				const aSocket2 = new NodeSocket(ether.a);
				a.beginAcceptReconnection(aSocket2, null);

				let timeoutListenerCalled = false;
				const socketTimeoutListener = a.onSocketTimeout(() => {
					timeoutListenerCalled = true;
				});

				// send message 2 during reconnection
				a.send(VSBuffer.fromString('a2'));
				assert.strictEqual(a.unacknowledgedCount, 1);
				assert.strictEqual(b.unacknowledgedCount, 1);

				// wait for scheduled _recvAckCheck() to execute
				await timeout(2 * ProtocolConstants.TimeoutTime);

				assert.strictEqual(a.unacknowledgedCount, 1);
				assert.strictEqual(b.unacknowledgedCount, 1);
				assert.strictEqual(timeoutListenerCalled, false);

				a.endAcceptReconnection();
				assert.strictEqual(timeoutListenerCalled, false);

				await timeout(2 * ProtocolConstants.TimeoutTime);
				assert.strictEqual(a.unacknowledgedCount, 0);
				assert.strictEqual(b.unacknowledgedCount, 0);
				assert.strictEqual(timeoutListenerCalled, false);

				socketTimeoutListener.dispose();
				aMessages.dispose();
				bMessages.dispose();
				a.dispose();
				b.dispose();
			}
		);
	});

	test('acks are always sent after a reconnection', async () => {
		await runWithFakedTimers(
			{
				useFakeTimers: true,
				useSetImmediate: true,
				maxTaskCount: 1000
			},
			async () => {

				const loadEstimator: ILoadEstimator = {
					hasHighLoad: () => false
				};
				const wireLatency = 1000;
				const ether = new Ether(wireLatency);
				const aSocket = new NodeSocket(ether.a);
				const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
				const aMessages = new MessageStream(a);
				const bSocket = new NodeSocket(ether.b);
				const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
				const bMessages = new MessageStream(b);

				// send message a1 to have something unacknowledged
				a.send(VSBuffer.fromString('a1'));
				assert.strictEqual(a.unacknowledgedCount, 1);
				assert.strictEqual(b.unacknowledgedCount, 0);

				// read message a1 at B
				const a1 = await bMessages.waitForOne();
				assert.strictEqual(a1.toString(), 'a1');
				assert.strictEqual(a.unacknowledgedCount, 1);
				assert.strictEqual(b.unacknowledgedCount, 0);

				// wait for B to send an ACK message,
				// but resume before A receives it
				await timeout(ProtocolConstants.AcknowledgeTime + wireLatency / 2);
				assert.strictEqual(a.unacknowledgedCount, 1);
				assert.strictEqual(b.unacknowledgedCount, 0);

				// simulate complete reconnection
				aSocket.dispose();
				bSocket.dispose();
				const ether2 = new Ether(wireLatency);
				const aSocket2 = new NodeSocket(ether2.a);
				const bSocket2 = new NodeSocket(ether2.b);
				b.beginAcceptReconnection(bSocket2, null);
				b.endAcceptReconnection();
				a.beginAcceptReconnection(aSocket2, null);
				a.endAcceptReconnection();

				// wait for quite some time
				await timeout(2 * ProtocolConstants.AcknowledgeTime + wireLatency);
				assert.strictEqual(a.unacknowledgedCount, 0);
				assert.strictEqual(b.unacknowledgedCount, 0);

				aMessages.dispose();
				bMessages.dispose();
				a.dispose();
				b.dispose();
			}
		);
	});

	test('onSocketTimeout is emitted at most once every 20s', async () => {
		await runWithFakedTimers(
			{
				useFakeTimers: true,
				useSetImmediate: true,
				maxTaskCount: 1000
			},
			async () => {

				const loadEstimator: ILoadEstimator = {
					hasHighLoad: () => false
				};
				const ether = new Ether();
				const aSocket = new NodeSocket(ether.a);
				const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
				const aMessages = new MessageStream(a);
				const bSocket = new NodeSocket(ether.b);
				const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
				const bMessages = new MessageStream(b);

				// never receive acks
				b.pauseSocketWriting();

				// send message a1 to have something unacknowledged
				a.send(VSBuffer.fromString('a1'));

				// wait for the first timeout to fire
				await Event.toPromise(a.onSocketTimeout);

				let timeoutFiredAgain = false;
				const timeoutListener = a.onSocketTimeout(() => {
					timeoutFiredAgain = true;
				});

				// send more messages
				a.send(VSBuffer.fromString('a2'));
				a.send(VSBuffer.fromString('a3'));

				// wait for 10s
				await timeout(ProtocolConstants.TimeoutTime / 2);

				assert.strictEqual(timeoutFiredAgain, false);

				timeoutListener.dispose();
				aMessages.dispose();
				bMessages.dispose();
				a.dispose();
				b.dispose();
			}
		);
	});

	test('writing can be paused', async () => {
		await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
			const loadEstimator: ILoadEstimator = {
				hasHighLoad: () => false
			};
			const ether = new Ether();
			const aSocket = new NodeSocket(ether.a);
			const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
			const aMessages = new MessageStream(a);
			const bSocket = new NodeSocket(ether.b);
			const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
			const bMessages = new MessageStream(b);

			// send one message A -> B
			a.send(VSBuffer.fromString('a1'));
			const a1 = await bMessages.waitForOne();
			assert.strictEqual(a1.toString(), 'a1');

			// ask A to pause writing
			b.sendPause();

			// send a message B -> A
			b.send(VSBuffer.fromString('b1'));
			const b1 = await aMessages.waitForOne();
			assert.strictEqual(b1.toString(), 'b1');

			// send a message A -> B (this should be blocked at A)
			a.send(VSBuffer.fromString('a2'));

			// wait a long time and check that not even acks are written
			await timeout(2 * ProtocolConstants.AcknowledgeTime);
			assert.strictEqual(a.unacknowledgedCount, 1);
			assert.strictEqual(b.unacknowledgedCount, 1);

			// ask A to resume writing
			b.sendResume();

			// check that B receives message
			const a2 = await bMessages.waitForOne();
			assert.strictEqual(a2.toString(), 'a2');

			// wait a long time and check that acks are written
			await timeout(2 * ProtocolConstants.AcknowledgeTime);
			assert.strictEqual(a.unacknowledgedCount, 0);
			assert.strictEqual(b.unacknowledgedCount, 0);

			aMessages.dispose();
			bMessages.dispose();
			a.dispose();
			b.dispose();
		});
	});
});

flakySuite('IPC, create handle', () => {

	test('createRandomIPCHandle', async () => {
		return testIPCHandle(createRandomIPCHandle());
	});

	test('createStaticIPCHandle', async () => {
		return testIPCHandle(createStaticIPCHandle(tmpdir(), 'test', '1.64.0'));
	});

	function testIPCHandle(handle: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const pipeName = createRandomIPCHandle();

			const server = createServer();

			server.on('error', () => {
				return new Promise(() => server.close(() => reject()));
			});

			server.listen(pipeName, () => {
				server.removeListener('error', reject);

				return new Promise(() => {
					server.close(() => resolve());
				});
			});
		});
	}

});

suite('WebSocketNodeSocket', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	function toUint8Array(data: number[]): Uint8Array {
		const result = new Uint8Array(data.length);
		for (let i = 0; i < data.length; i++) {
			result[i] = data[i];
		}
		return result;
	}

	function fromUint8Array(data: Uint8Array): number[] {
		const result = [];
		for (let i = 0; i < data.length; i++) {
			result[i] = data[i];
		}
		return result;
	}

	function fromCharCodeArray(data: number[]): string {
		let result = '';
		for (let i = 0; i < data.length; i++) {
			result += String.fromCharCode(data[i]);
		}
		return result;
	}

	class FakeNodeSocket extends Disposable {

		private readonly _onData = new Emitter<VSBuffer>();
		public readonly onData = this._onData.event;

		private readonly _onClose = new Emitter<SocketCloseEvent>();
		public readonly onClose = this._onClose.event;

		public writtenData: VSBuffer[] = [];

		public traceSocketEvent(type: SocketDiagnosticsEventType, data?: VSBuffer | Uint8Array | ArrayBuffer | ArrayBufferView | any): void {
		}

		constructor() {
			super();
		}

		public write(data: VSBuffer): void {
			this.writtenData.push(data);
		}

		public fireData(data: number[]): void {
			this._onData.fire(VSBuffer.wrap(toUint8Array(data)));
		}
	}

	async function testReading(frames: number[][], permessageDeflate: boolean): Promise<string> {
		const disposables = new DisposableStore();
		const socket = new FakeNodeSocket();
		// eslint-disable-next-line local/code-no-any-casts
		const webSocket = disposables.add(new WebSocketNodeSocket(<any>socket, permessageDeflate, null, false));

		const barrier = new Barrier();
		let remainingFrameCount = frames.length;

		let receivedData: string = '';
		disposables.add(webSocket.onData((buff) => {
			receivedData += fromCharCodeArray(fromUint8Array(buff.buffer));
			remainingFrameCount--;
			if (remainingFrameCount === 0) {
				barrier.open();
			}
		}));

		for (let i = 0; i < frames.length; i++) {
			socket.fireData(frames[i]);
		}

		await barrier.wait();

		disposables.dispose();

		return receivedData;
	}

	test('A single-frame unmasked text message', async () => {
		const frames = [
			[0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f] // contains "Hello"
		];
		const actual = await testReading(frames, false);
		assert.deepStrictEqual(actual, 'Hello');
	});

	test('A single-frame masked text message', async () => {
		const frames = [
			[0x81, 0x85, 0x37, 0xfa, 0x21, 0x3d, 0x7f, 0x9f, 0x4d, 0x51, 0x58] // contains "Hello"
		];
		const actual = await testReading(frames, false);
		assert.deepStrictEqual(actual, 'Hello');
	});

	test('A fragmented unmasked text message', async () => {
		// contains "Hello"
		const frames = [
			[0x01, 0x03, 0x48, 0x65, 0x6c], // contains "Hel"
			[0x80, 0x02, 0x6c, 0x6f], // contains "lo"
		];
		const actual = await testReading(frames, false);
		assert.deepStrictEqual(actual, 'Hello');
	});

	suite('compression', () => {
		test('A single-frame compressed text message', async () => {
			// contains "Hello"
			const frames = [
				[0xc1, 0x07, 0xf2, 0x48, 0xcd, 0xc9, 0xc9, 0x07, 0x00], // contains "Hello"
			];
			const actual = await testReading(frames, true);
			assert.deepStrictEqual(actual, 'Hello');
		});

		test('A fragmented compressed text message', async () => {
			// contains "Hello"
			const frames = [  // contains "Hello"
				[0x41, 0x03, 0xf2, 0x48, 0xcd],
				[0x80, 0x04, 0xc9, 0xc9, 0x07, 0x00]
			];
			const actual = await testReading(frames, true);
			assert.deepStrictEqual(actual, 'Hello');
		});

		test('A single-frame non-compressed text message', async () => {
			const frames = [
				[0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f] // contains "Hello"
			];
			const actual = await testReading(frames, true);
			assert.deepStrictEqual(actual, 'Hello');
		});

		test('A single-frame compressed text message followed by a single-frame non-compressed text message', async () => {
			const frames = [
				[0xc1, 0x07, 0xf2, 0x48, 0xcd, 0xc9, 0xc9, 0x07, 0x00], // contains "Hello"
				[0x81, 0x05, 0x77, 0x6f, 0x72, 0x6c, 0x64] // contains "world"
			];
			const actual = await testReading(frames, true);
			assert.deepStrictEqual(actual, 'Helloworld');
		});
	});

	test('Large buffers are split and sent in chunks', async () => {

		let receivingSideOnDataCallCount = 0;
		let receivingSideTotalBytes = 0;
		const receivingSideSocketClosedBarrier = new Barrier();

		const server = await listenOnRandomPort((socket) => {
			// stop the server when the first connection is received
			server.close();

			const webSocketNodeSocket = new WebSocketNodeSocket(new NodeSocket(socket), true, null, false);
			ds.add(webSocketNodeSocket.onData((data) => {
				receivingSideOnDataCallCount++;
				receivingSideTotalBytes += data.byteLength;
			}));

			ds.add(webSocketNodeSocket.onClose(() => {
				webSocketNodeSocket.dispose();
				receivingSideSocketClosedBarrier.open();
			}));
		});

		const socket = connect({
			host: '127.0.0.1',
			port: (<AddressInfo>server.address()).port
		});

		const buff = generateRandomBuffer(1 * 1024 * 1024);

		const webSocketNodeSocket = new WebSocketNodeSocket(new NodeSocket(socket), true, null, false);
		webSocketNodeSocket.write(buff);
		await webSocketNodeSocket.drain();
		webSocketNodeSocket.dispose();
		await receivingSideSocketClosedBarrier.wait();

		assert.strictEqual(receivingSideTotalBytes, buff.byteLength);
		assert.strictEqual(receivingSideOnDataCallCount, 4);
	});

	test('issue #194284: ping/pong opcodes are supported', async () => {

		const disposables = new DisposableStore();
		const socket = new FakeNodeSocket();
		// eslint-disable-next-line local/code-no-any-casts
		const webSocket = disposables.add(new WebSocketNodeSocket(<any>socket, false, null, false));

		let receivedData: string = '';
		disposables.add(webSocket.onData((buff) => {
			receivedData += fromCharCodeArray(fromUint8Array(buff.buffer));
		}));

		// A single-frame non-compressed text message that contains "Hello"
		socket.fireData([0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);

		// A ping message that contains "data"
		socket.fireData([0x89, 0x04, 0x64, 0x61, 0x74, 0x61]);

		// Another single-frame non-compressed text message that contains "Hello"
		socket.fireData([0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);

		assert.strictEqual(receivedData, 'HelloHello');
		assert.deepStrictEqual(
			socket.writtenData.map(x => fromUint8Array(x.buffer)),
			[
				// A pong message that contains "data"
				[0x8A, 0x04, 0x64, 0x61, 0x74, 0x61]
			]
		);

		disposables.dispose();

		return receivedData;
	});

	function generateRandomBuffer(size: number): VSBuffer {
		const buff = VSBuffer.alloc(size);
		for (let i = 0; i < size; i++) {
			buff.writeUInt8(Math.floor(256 * Math.random()), i);
		}
		return buff;
	}

	function listenOnRandomPort(handler: (socket: Socket) => void): Promise<Server> {
		return new Promise((resolve, reject) => {
			const server = createServer(handler).listen(0);
			server.on('listening', () => {
				resolve(server);
			});
			server.on('error', (err) => {
				reject(err);
			});
		});
	}
});
