/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Socket } from 'net';
import { EventEmitter } from 'events';
import { Protocol } from 'vs/base/parts/ipc/node/ipc.net';

class MockDuplex extends EventEmitter {

	private _cache: Buffer[] = [];

	readonly destroyed = false;

	private _deliver(): void {
		if (this._cache.length) {
			const data = Buffer.concat(this._cache);
			this._cache.length = 0;
			this.emit('data', data);
		}
	}

	write(data: Buffer, cb?: Function): boolean {
		this._cache.push(data);
		setImmediate(() => this._deliver());
		return true;
	}
}


suite('IPC, Socket Protocol', () => {

	let stream: Socket;

	setup(() => {
		stream = <any>new MockDuplex();
	});

	test('read/write', async () => {

		const a = new Protocol(stream);
		const b = new Protocol(stream);

		await new Promise(resolve => {
			const sub = b.onMessage(data => {
				sub.dispose();
				assert.equal(data.toString(), 'foobarfarboo');
				resolve(undefined);
			});
			a.send(Buffer.from('foobarfarboo'));
		});
		return new Promise(resolve => {
			const sub_1 = b.onMessage(data => {
				sub_1.dispose();
				assert.equal(data.readInt8(0), 123);
				resolve(undefined);
			});
			const buffer = Buffer.allocUnsafe(1);
			buffer.writeInt8(123, 0);
			a.send(buffer);
		});
	});


	test('read/write, object data', () => {

		const a = new Protocol(stream);
		const b = new Protocol(stream);

		const data = {
			pi: Math.PI,
			foo: 'bar',
			more: true,
			data: 'Hello World'.split('')
		};

		a.send(Buffer.from(JSON.stringify(data)));

		return new Promise(resolve => {
			b.onMessage(msg => {
				assert.deepEqual(JSON.parse(msg.toString()), data);
				resolve(undefined);
			});
		});
	});
});
