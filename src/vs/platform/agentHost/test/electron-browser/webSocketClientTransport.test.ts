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
	readonly sent: (string | ArrayBufferLike | Blob | ArrayBufferView)[] = [];
	send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void { this.sent.push(data); }
	close(): void { this.readyState = this.CLOSED; }
}

suite('WebSocketClientTransport', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('sends only AHP messages without Web PubSub capability controls', async () => {
		const socket = new TestWebSocket();
		const instantiation = store.add(new TestInstantiationService());
		const transport = store.add(new class extends WebSocketClientTransport {
			protected override createWebSocket(): WebSocket { return socket; }
		}('ws://test', undefined, undefined, instantiation));
		const received: object[] = [];
		store.add(transport.onMessage(message => received.push(message)));
		const connecting = transport.connect();
		socket.readyState = socket.OPEN;
		socket.dispatchEvent(new Event('open'));
		await connecting;
		const request = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientId: 'client' } } as const;
		transport.send(request);
		const response = { jsonrpc: '2.0', id: 1, result: {} };
		socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(response) }));
		assert.deepStrictEqual({ sent: socket.sent, received }, { sent: [JSON.stringify(request)], received: [response] });
	});

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
