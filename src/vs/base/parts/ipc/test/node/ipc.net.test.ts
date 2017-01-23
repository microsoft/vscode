/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TPromise } from 'vs/base/common/winjs.base';
import { Duplex } from 'stream';
import { Protocol } from 'vs/base/parts/ipc/node/ipc.net';


let _buffer: Buffer[] = [];

const testDuplex = new Duplex(<any>{
	read(size) {
		const chunks: Buffer[] = [];
		for (const chunk of _buffer) {
			chunks.push(chunk);
			size -= chunk.length;
			if (size <= 0) {
				break;
			}
		}
		_buffer = _buffer.slice(chunks.length);
		this.push(Buffer.concat(chunks));
	},
	write(chunk, encoding, callback) {
		_buffer.push(chunk);
		callback();
	}
});

class TestDuplex extends Duplex {

	private _buffer: Buffer[] = [];

	constructor(options) {
		super(options);
	}

	_write(chunk, encoding, callback) {
		this._buffer.push(chunk);
		callback();
	}

	_read(size) {
		const chunks: Buffer[] = [];
		for (const chunk of this._buffer) {
			chunks.push(chunk);
			size -= chunk.length;
			if (size <= 0) {
				break;
			}
		}
		this._buffer = this._buffer.slice(chunks.length);
		this.push(Buffer.from(chunks));
	}
}


suite('IPC, Socket Protocol', () => {

	test('read/write', () => {

		const stream = testDuplex;

		const a = new Protocol(stream);
		const b = new Protocol(stream);

		a.send('foobarfarboo');

		const p1 = new TPromise(resolve => {
			b.onMessage(data => {
				assert.equal(data, 'foobarfarboo');
				resolve(null);
			});
		});
		a.send('message2');

		const p2 = new TPromise(resolve => {
			b.onMessage(data => {
				assert.equal(data, 'message2');
				resolve(null);
			});
		});

		return TPromise.join([p1, p2]);
	});
});
