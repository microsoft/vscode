/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { WebSocketClientTransport } from '../../browser/webSocketClientTransport.js';
import { parseRemoteAgentHostInput } from '../../common/remoteAgentHostService.js';
import { getProtocolMessageSize, NonReconnectableTransportError, type ITransportCloseDetails } from '../../common/state/sessionTransport.js';

class TestWebSocket extends EventTarget implements WebSocket {
	readonly CONNECTING = 0;
	readonly OPEN = 1;
	readonly CLOSING = 2;
	readonly CLOSED = 3;
	readonly bufferedAmount = 0;
	readonly extensions = '';
	readonly protocol = '';
	readonly url = 'wss://test';
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

	async function connect(address: string, connectionToken: string | undefined) {
		const socket = new TestWebSocket();
		const urls: string[] = [];
		const instantiation = store.add(new TestInstantiationService());
		const transport = store.add(new class extends WebSocketClientTransport {
			protected override createWebSocket(url: string): WebSocket {
				urls.push(url);
				return socket;
			}
		}(address, connectionToken, undefined, instantiation));
		const connecting = transport.connect();
		socket.readyState = socket.OPEN;
		socket.dispatchEvent(new Event('open'));
		const error = await connecting.then(() => undefined, error => {
			if (!(error instanceof NonReconnectableTransportError)) {
				throw error;
			}
			return error.message;
		});
		return { urls, error };
	}

	test('requires TLS for direct non-loopback connections before opening a socket', async () => {
		const blocked = [
			'my-server.example:8081',
			'ws://my-server.example:8081',
			'ws://192.0.2.1:8081',
			'ws://[2001:db8::1]:8081',
			'ws://localhost.example:8081',
			'ws://127.0.0.1.example:8081',
			'ws://localhost@my-server.example:8081',
			'ws://my-server.example:8081/?next=ws://127.0.0.1',
			'ws://0.0.0.0:8081',
			'ws://[::]:8081',
		];
		const allowed = [
			{ address: '127.0.0.1:9981', url: 'ws://127.0.0.1:9981/?tkn=test-token' },
			{ address: 'ws://127.0.0.1:9981', url: 'ws://127.0.0.1:9981/?tkn=test-token' },
			{ address: 'ws://localhost:8081/agent?mode=local', url: 'ws://localhost:8081/agent?mode=local&tkn=test-token' },
			{ address: 'ws://127.0.0.2:8081', url: 'ws://127.0.0.2:8081/?tkn=test-token' },
			{ address: 'ws://127.1:8081', url: 'ws://127.0.0.1:8081/?tkn=test-token' },
			{ address: 'ws://[::1]:8081', url: 'ws://[::1]:8081/?tkn=test-token' },
			{ address: 'ws://[0:0:0:0:0:0:0:1]:8081', url: 'ws://[::1]:8081/?tkn=test-token' },
			{ address: 'wss://my-server.example:8081/agent?mode=remote', url: 'wss://my-server.example:8081/agent?mode=remote&tkn=test-token' },
		];
		const results = await Promise.all([...blocked, ...allowed.map(value => value.address)].map(async address => ({
			address,
			...await connect(address, 'test-token'),
		})));

		assert.deepStrictEqual(results, [
			...blocked.map(address => ({
				address,
				urls: [],
				error: 'Remote agent hosts require a secure WebSocket connection (wss://). Use TLS or connect through an SSH or Dev Tunnel. Unencrypted connections are only allowed on loopback.',
			})),
			...allowed.map(({ address, url }) => ({ address, urls: [url], error: undefined })),
		]);
	});

	test('enforces transport security after parsing remote host input', async () => {
		const cases = [
			{ input: 'my-server.example:8081', address: 'my-server.example:8081', url: undefined },
			{ input: 'ws://my-server.example:8081', address: 'my-server.example:8081', url: undefined },
			{ input: 'http://my-server.example:8081', address: 'my-server.example:8081', url: undefined },
			{ input: '127.0.0.1:9981', address: '127.0.0.1:9981', url: 'ws://127.0.0.1:9981/' },
			{ input: 'ws://127.0.0.1:9981', address: '127.0.0.1:9981', url: 'ws://127.0.0.1:9981/' },
			{ input: 'http://127.0.0.1:9981', address: '127.0.0.1:9981', url: 'ws://127.0.0.1:9981/' },
			{ input: 'https://my-server.example:8081/agent?tkn=test%2Btoken&mode=remote', address: 'wss://my-server.example:8081/agent?mode=remote', url: 'wss://my-server.example:8081/agent?mode=remote&tkn=test%2Btoken' },
		];
		const results = await Promise.all(cases.map(async ({ input }) => {
			const { parsed } = parseRemoteAgentHostInput(input);
			assert.ok(parsed);
			return { input, address: parsed.address, ...await connect(parsed.address, parsed.connectionToken) };
		}));

		assert.deepStrictEqual(results, cases.map(({ input, address, url }) => ({
			input,
			address,
			urls: url ? [url] : [],
			error: url ? undefined : 'Remote agent hosts require a secure WebSocket connection (wss://). Use TLS or connect through an SSH or Dev Tunnel. Unencrypted connections are only allowed on loopback.',
		})));
	});

	test('allows localhost subdomains and root dots without allowing lookalike hosts', async () => {
		const cases = [
			{ address: 'api.localhost:8080', url: 'ws://api.localhost:8080/?tkn=test-token' },
			{ address: 'ws://api.localhost:8080', url: 'ws://api.localhost:8080/?tkn=test-token' },
			{ address: 'ws://localhost.:8080', url: 'ws://localhost.:8080/?tkn=test-token' },
			{ address: 'ws://api.localhost.:8080', url: 'ws://api.localhost.:8080/?tkn=test-token' },
			{ address: 'ws://api.dev.LOCALHOST.:8080/agent?mode=local', url: 'ws://api.dev.localhost.:8080/agent?mode=local&tkn=test-token' },
			{ address: 'ws://localhost.example:8080', url: undefined },
			{ address: 'ws://localhost.example.:8080', url: undefined },
			{ address: 'ws://api.localhost.example:8080', url: undefined },
			{ address: 'ws://notlocalhost:8080', url: undefined },
			{ address: 'ws://localhost..:8080', url: undefined },
			{ address: 'ws://api.localhost..:8080', url: undefined },
		];
		const results = await Promise.all(cases.map(async ({ address }) => ({ address, ...await connect(address, 'test-token') })));
		assert.deepStrictEqual(results, cases.map(({ address, url }) => ({
			address,
			urls: url ? [url] : [],
			error: url ? undefined : 'Remote agent hosts require a secure WebSocket connection (wss://). Use TLS or connect through an SSH or Dev Tunnel. Unencrypted connections are only allowed on loopback.',
		})));
	});

	test('allows IPv4-mapped IPv6 loopback without allowing mapped remote addresses', async () => {
		const cases = [
			{ address: 'ws://[::ffff:127.0.0.1]:8080', url: 'ws://[::ffff:7f00:1]:8080/' },
			{ address: '[::ffff:127.0.0.2]:8080', url: 'ws://[::ffff:7f00:2]:8080/' },
			{ address: 'ws://[0:0:0:0:0:ffff:7f00:1]:8080', url: 'ws://[::ffff:7f00:1]:8080/' },
			{ address: 'ws://[::ffff:127.255.255.255]:8080', url: 'ws://[::ffff:7fff:ffff]:8080/' },
			{ address: 'ws://[::ffff:126.255.255.255]:8080', url: undefined },
			{ address: 'ws://[::ffff:128.0.0.0]:8080', url: undefined },
			{ address: 'ws://[::ffff:192.0.2.1]:8080', url: undefined },
			{ address: 'ws://[::7f00:1]:8080', url: undefined },
			{ address: 'wss://[::ffff:192.0.2.1]:8080', url: 'wss://[::ffff:c000:201]:8080/' },
		];
		const results = await Promise.all(cases.map(async ({ address }) => ({ address, ...await connect(address, undefined) })));
		assert.deepStrictEqual(results, cases.map(({ address, url }) => ({
			address,
			urls: url ? [url] : [],
			error: url ? undefined : 'Remote agent hosts require a secure WebSocket connection (wss://). Use TLS or connect through an SSH or Dev Tunnel. Unencrypted connections are only allowed on loopback.',
		})));
	});

	test('sends only AHP messages without Web PubSub capability controls', async () => {
		const socket = new TestWebSocket();
		const instantiation = store.add(new TestInstantiationService());
		const transport = store.add(new class extends WebSocketClientTransport {
			protected override createWebSocket(): WebSocket { return socket; }
		}('wss://test', undefined, undefined, instantiation));
		const received: object[] = [];
		store.add(transport.onMessage(message => received.push(message)));
		const connecting = transport.connect();
		socket.readyState = socket.OPEN;
		socket.dispatchEvent(new Event('open'));
		await connecting;
		const request = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientId: 'client' } } as const;
		transport.send(request);
		const response = { jsonrpc: '2.0', id: 1, result: {} };
		const text = JSON.stringify(response, undefined, 2);
		socket.dispatchEvent(new MessageEvent('message', { data: text }));
		assert.deepStrictEqual({ sent: socket.sent, received }, { sent: [JSON.stringify(request)], received: [response] });
		assert.strictEqual(getProtocolMessageSize(received[0]), text.length * 2);
	});

	for (const errorFirst of [false, true]) {
		test(`captures close details ${errorFirst ? 'after an error' : 'on normal close'} without repeating onClose`, async () => {
			const socket = new TestWebSocket();
			const instantiation = store.add(new TestInstantiationService());
			const transport = store.add(new class extends WebSocketClientTransport {
				protected override createWebSocket(): WebSocket { return socket; }
			}('wss://test', undefined, undefined, instantiation));
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
