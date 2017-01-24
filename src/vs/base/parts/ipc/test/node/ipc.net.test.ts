/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TPromise } from 'vs/base/common/winjs.base';
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

	test('read/write', () => {

		const a = new Protocol(stream);
		const b = new Protocol(stream);

		return new TPromise(resolve => {
			const sub = b.onMessage(data => {
				sub.dispose();
				assert.equal(data, 'foobarfarboo');
				resolve(null);
			});
			a.send('foobarfarboo');
		}).then(() => {
			return new TPromise(resolve => {
				const sub = b.onMessage(data => {
					sub.dispose();
					assert.equal(data, 123);
					resolve(null);
				});
				a.send(123);
			});
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

		a.send(data);

		return new TPromise(resolve => {
			b.onMessage(msg => {
				assert.deepEqual(msg, data);
				resolve(null);
			});
		});
	});
});
