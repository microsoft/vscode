/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EventEmitter } from 'events';
import { createServer, Socket } from 'net';
import { tmpdir } from 'os';
import { Barrier, timeout } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ILoadEstimator, PersistentProtocol, Protocol, ProtocolConstants, SocketCloseEvent } from 'vs/base/parts/ipc/common/ipc.net';
import { createRandomIPCHandle, createStaticIPCHandle, NodeSocket, WebSocketNodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import product from 'vs/platform/product/common/product';

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
		return <any>this._a;
	}

	public get b(): Socket {
		return <any>this._b;
	}

	constructor() {
		this._a = new EtherStream(this, 'a');
		this._b = new EtherStream(this, 'b');
		this._ab = [];
		this._ba = [];
	}

	public write(from: 'a' | 'b', data: Buffer): void {
		if (from === 'a') {
			this._ab.push(data);
		} else {
			this._ba.push(data);
		}

		setTimeout(() => this._deliver(), 0);
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

	ensureNoDisposablesAreLeakedInTestSuite();

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

});

suite('PersistentProtocol reconnection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('acks get piggybacked with messages', async () => {
		const ether = new Ether();
		const a = new PersistentProtocol(new NodeSocket(ether.a));
		const aMessages = new MessageStream(a);
		const b = new PersistentProtocol(new NodeSocket(ether.b));
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
			const a = new PersistentProtocol(aSocket, null, loadEstimator);
			const aMessages = new MessageStream(a);
			const bSocket = new NodeSocket(ether.b);
			const b = new PersistentProtocol(bSocket, null, loadEstimator);
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
				const a = new PersistentProtocol(aSocket, null, loadEstimator);
				const aMessages = new MessageStream(a);
				const bSocket = new NodeSocket(ether.b);
				const b = new PersistentProtocol(bSocket, null, loadEstimator);
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
				await timeout(2 * ProtocolConstants.AcknowledgeTimeoutTime);

				assert.strictEqual(a.unacknowledgedCount, 1);
				assert.strictEqual(b.unacknowledgedCount, 1);
				assert.strictEqual(timeoutListenerCalled, false);

				a.endAcceptReconnection();
				assert.strictEqual(timeoutListenerCalled, false);

				await timeout(2 * ProtocolConstants.AcknowledgeTimeoutTime);
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
});

suite('IPC, create handle', () => {

	test('createRandomIPCHandle', async () => {
		return testIPCHandle(createRandomIPCHandle());
	});

	test('createStaticIPCHandle', async () => {
		return testIPCHandle(createStaticIPCHandle(tmpdir(), 'test', product.version));
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

		constructor() {
			super();
		}

		public fireData(data: number[]): void {
			this._onData.fire(VSBuffer.wrap(toUint8Array(data)));
		}
	}

	async function testReading(frames: number[][], permessageDeflate: boolean): Promise<string> {
		const disposables = new DisposableStore();
		const socket = new FakeNodeSocket();
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
	});
});
