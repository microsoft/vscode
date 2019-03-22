/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Socket } from 'net';
import { EventEmitter } from 'events';
import { Protocol, PersistentProtocol } from 'vs/base/parts/ipc/node/ipc.net';

class MessageStream {

	private _currentComplete: ((data: Buffer) => void) | null;
	private _messages: Buffer[];

	constructor(x: Protocol | PersistentProtocol) {
		this._currentComplete = null;
		this._messages = [];
		x.onMessage(data => {
			this._messages.push(data);
			this._trigger();
		});
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

	public waitForOne(): Promise<Buffer> {
		return new Promise<Buffer>((complete) => {
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
		this._ether.write(this._name, data);
		return true;
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

		setImmediate(() => this._deliver());
	}

	private _deliver(): void {

		if (this._ab.length > 0) {
			const data = Buffer.concat(this._ab);
			this._ab.length = 0;
			this._b.emit('data', data);
			setImmediate(() => this._deliver());
			return;
		}

		if (this._ba.length > 0) {
			const data = Buffer.concat(this._ba);
			this._ba.length = 0;
			this._a.emit('data', data);
			setImmediate(() => this._deliver());
			return;
		}

	}
}

suite('IPC, Socket Protocol', () => {

	let ether: Ether;

	setup(() => {
		ether = new Ether();
	});

	test('read/write', async () => {

		const a = new Protocol(ether.a);
		const b = new Protocol(ether.b);
		const bMessages = new MessageStream(b);

		a.send(Buffer.from('foobarfarboo'));
		const msg1 = await bMessages.waitForOne();
		assert.equal(msg1.toString(), 'foobarfarboo');

		const buffer = Buffer.allocUnsafe(1);
		buffer.writeInt8(123, 0);
		a.send(buffer);
		const msg2 = await bMessages.waitForOne();
		assert.equal(msg2.readInt8(0), 123);
	});


	test('read/write, object data', async () => {

		const a = new Protocol(ether.a);
		const b = new Protocol(ether.b);
		const bMessages = new MessageStream(b);

		const data = {
			pi: Math.PI,
			foo: 'bar',
			more: true,
			data: 'Hello World'.split('')
		};

		a.send(Buffer.from(JSON.stringify(data)));
		const msg = await bMessages.waitForOne();
		assert.deepEqual(JSON.parse(msg.toString()), data);
	});

});

suite('PersistentProtocol reconnection', () => {
	let ether: Ether;

	setup(() => {
		ether = new Ether();
	});

	test('acks get piggybacked with messages', async () => {
		const a = new PersistentProtocol(ether.a);
		const aMessages = new MessageStream(a);
		const b = new PersistentProtocol(ether.b);
		const bMessages = new MessageStream(b);

		a.send(Buffer.from('a1'));
		assert.equal(a.unacknowledgedCount, 1);
		assert.equal(b.unacknowledgedCount, 0);

		a.send(Buffer.from('a2'));
		assert.equal(a.unacknowledgedCount, 2);
		assert.equal(b.unacknowledgedCount, 0);

		a.send(Buffer.from('a3'));
		assert.equal(a.unacknowledgedCount, 3);
		assert.equal(b.unacknowledgedCount, 0);

		const a1 = await bMessages.waitForOne();
		assert.equal(a1.toString(), 'a1');
		assert.equal(a.unacknowledgedCount, 3);
		assert.equal(b.unacknowledgedCount, 0);

		const a2 = await bMessages.waitForOne();
		assert.equal(a2.toString(), 'a2');
		assert.equal(a.unacknowledgedCount, 3);
		assert.equal(b.unacknowledgedCount, 0);

		const a3 = await bMessages.waitForOne();
		assert.equal(a3.toString(), 'a3');
		assert.equal(a.unacknowledgedCount, 3);
		assert.equal(b.unacknowledgedCount, 0);

		b.send(Buffer.from('b1'));
		assert.equal(a.unacknowledgedCount, 3);
		assert.equal(b.unacknowledgedCount, 1);

		const b1 = await aMessages.waitForOne();
		assert.equal(b1.toString(), 'b1');
		assert.equal(a.unacknowledgedCount, 0);
		assert.equal(b.unacknowledgedCount, 1);

		a.send(Buffer.from('a4'));
		assert.equal(a.unacknowledgedCount, 1);
		assert.equal(b.unacknowledgedCount, 1);

		const b2 = await bMessages.waitForOne();
		assert.equal(b2.toString(), 'a4');
		assert.equal(a.unacknowledgedCount, 1);
		assert.equal(b.unacknowledgedCount, 0);
	});
});
