/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { WebSocketClientTransport } from '../../browser/webSocketClientTransport.js';
import type { ITransportCloseDetails } from '../../common/state/sessionTransport.js';

class TestWebSocket extends EventTarget implements WebSocket {
	readonly CONNECTING = 0;
	readonly OPEN = 1;
	readonly CLOSING = 2;
	readonly CLOSED = 3;
	readonly bufferedAmount = 0;
	readonly extensions = '';
	readonly protocol = '';
	readonly url = 'ws://test';
	readyState: WebSocket['readyState'] = 0;
	binaryType: BinaryType = 'blob';
	onopen: WebSocket['onopen'] = null;
	onclose: WebSocket['onclose'] = null;
	onerror: WebSocket['onerror'] = null;
	onmessage: WebSocket['onmessage'] = null;
	send(): void { }
	close(): void { this.readyState = this.CLOSED; }
}

suite('WebSocketClientTransport close diagnostics', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const errorFirst of [false, true]) {
		test(`captures close details ${errorFirst ? 'after an error' : 'on normal close'} without repeating onClose`, async () => {
			const socket = new TestWebSocket();
			const instantiation = store.add(new TestInstantiationService());
			const transport = store.add(new class extends WebSocketClientTransport {
				protected override createWebSocket(): WebSocket { return socket; }
			}('ws://test', undefined, undefined, instantiation));
			let closeCount = 0;
			const details: ITransportCloseDetails[] = [];
			store.add(transport.onClose(() => closeCount++));
			store.add(transport.onDidCloseDetails(event => details.push(event)));
			const connecting = transport.connect();
			socket.readyState = socket.OPEN;
			socket.dispatchEvent(new Event('open'));
			await connecting;
			if (errorFirst) {
				socket.dispatchEvent(new Event('error'));
			}
			socket.dispatchEvent(new CloseEvent('close', { code: 4001, reason: 'remote closed', wasClean: !errorFirst }));
			const expected = { code: 4001, reason: 'remote closed', wasClean: !errorFirst };
			assert.deepStrictEqual({ closeCount, details }, {
				closeCount: 1,
				details: [expected],
			});
		});
	}
});
