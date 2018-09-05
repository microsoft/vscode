/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/node/ipc';
import { Emitter, toNativePromise } from 'vs/base/common/event';

class QueueProtocol implements IMessagePassingProtocol {

	private buffering = true;
	private buffers: Buffer[] = [];

	private _onMessage = new Emitter<Buffer>({
		onFirstListenerDidAdd: () => {
			for (const buffer of this.buffers) {
				this._onMessage.fire(buffer);
			}

			this.buffers = [];
			this.buffering = false;
		},
		onLastListenerRemove: () => {
			this.buffering = true;
		}
	});

	readonly onMessage = this._onMessage.event;
	other: QueueProtocol;

	send(buffer: Buffer): void {
		this.other.receive(buffer);
	}

	protected receive(buffer: Buffer): void {
		if (this.buffering) {
			this.buffers.push(buffer);
		} else {
			this._onMessage.fire(buffer);
		}
	}
}

function createProtocolPair(): [IMessagePassingProtocol, IMessagePassingProtocol] {
	const one = new QueueProtocol();
	const other = new QueueProtocol();
	one.other = other;
	other.other = one;

	return [one, other];
}

suite('IPC', function () {

	test('createProtocolPair', async function () {
		const [clientProtocol, serverProtocol] = createProtocolPair();

		const b1 = Buffer.alloc(0);
		clientProtocol.send(b1);

		const b3 = Buffer.alloc(0);
		serverProtocol.send(b3);

		const b2 = await toNativePromise(serverProtocol.onMessage);
		const b4 = await toNativePromise(clientProtocol.onMessage);

		assert.strictEqual(b1, b2);
		assert.strictEqual(b3, b4);
	});

	suite('getDelayedChannel', function () {

	});

	suite('getNextTickChannel', function () {

	});
});
