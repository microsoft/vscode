/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { createRequire } from 'module';

import { Event } from '../../../../base/common/event.js';
import { hasKey } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { connectWebSocketOverDuplex, createWebSocketAccept } from '../../common/webSocketOverDuplex.js';
import type { ITunnelDuplexStream, IWebSocketDuplexStream, WebSocketConnectionCtor } from '../../common/tunnelMessageSocket.js';

const WebSocketConnection = createRequire(import.meta.url)('websocket/lib/WebSocketConnection') as WebSocketConnectionCtor;
const websocketAcceptGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

suite('connectWebSocketOverDuplex', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('sends a WebSocket upgrade request and accepts a valid response', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream, '/agent-host/select', 'gateway.example');
		const request = stream.request;
		stream.push(await createUpgradeResponse(request));
		store.add(await socketPromise);

		assert.deepStrictEqual(request.replace(requestKey(request), '<key>'), [
			'GET /agent-host/select HTTP/1.1',
			'Host: gateway.example',
			'Connection: Upgrade',
			'Upgrade: websocket',
			'Sec-WebSocket-Version: 13',
			'Sec-WebSocket-Key: <key>',
			'',
			'',
		].join('\r\n'));
	});

	test('computes the RFC WebSocket accept value', async () => {
		assert.strictEqual(
			await createWebSocketAccept('dGhlIHNhbXBsZSBub25jZQ=='),
			's3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
		);
	});

	test('adapts a bare tunnel duplex stream without TCP socket methods', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream);
		stream.push(await createUpgradeResponse(stream.request));
		const socket = await socketPromise;
		const socketLike = stream as Partial<IWebSocketDuplexStream>;
		assert.deepStrictEqual({
			socketCreated: !!socket,
			hasSetNoDelay: hasKey(socketLike, { setNoDelay: true }),
			hasSetTimeout: hasKey(socketLike, { setTimeout: true }),
			hasSetKeepAlive: hasKey(socketLike, { setKeepAlive: true }),
		}, {
			socketCreated: true,
			hasSetNoDelay: false,
			hasSetTimeout: false,
			hasSetKeepAlive: false,
		});
		store.add(socket);
	});

	test('does not recurse when ending a re-entrant tunnel stream', async () => {
		const stream = new ReentrantEndDuplexStream();
		const socketPromise = connect(stream);
		stream.push(await createUpgradeResponse(stream.request));
		const socket = store.add(await socketPromise);
		stream.end();

		assert.deepStrictEqual({ endCalls: stream.endCalls, socketCreated: !!socket }, { endCalls: 2, socketCreated: true });
	});

	test('rejects a non-101 upgrade response', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream);
		stream.push('HTTP/1.1 403 Forbidden\r\n\r\n');

		await assert.rejects(socketPromise, /expected status 101 but received 403/);
	});

	test('rejects missing or invalid WebSocket accept headers', async () => {
		for (const response of [
			'HTTP/1.1 101 Switching Protocols\r\n\r\n',
			'HTTP/1.1 101 Switching Protocols\r\nSec-WebSocket-Accept: invalid\r\n\r\n',
		]) {
			const stream = new FakeDuplexStream();
			const socketPromise = connect(stream);
			stream.push(response);

			await assert.rejects(socketPromise, /Sec-WebSocket-Accept/);
		}
	});

	test('delivers a coalesced first WebSocket frame', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream);
		const response = await createUpgradeResponse(stream.request);
		stream.push(concat(response, createTextFrame('coalesced')));
		const socket = store.add(await socketPromise);
		const message = Event.toPromise(socket.onDidReceiveMessage);

		assert.deepStrictEqual([await message], ['coalesced']);
	});

	test('delivers a text frame received after the upgrade', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream);
		stream.push(await createUpgradeResponse(stream.request));
		const socket = store.add(await socketPromise);
		const message = Event.toPromise(socket.onDidReceiveMessage);
		stream.push(createTextFrame('round trip'));

		assert.deepStrictEqual([await message], ['round trip']);
	});
});

function connect(stream: FakeDuplexStream, path = '/', host?: string) {
	return connectWebSocketOverDuplex(stream, {
		path,
		host,
		webSocketConnectionCtor: WebSocketConnection,
	});
}

async function createUpgradeResponse(request: string): Promise<Uint8Array> {
	const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(requestKey(request) + websocketAcceptGuid));
	const accept = Buffer.from(digest).toString('base64');
	return new TextEncoder().encode([
		'HTTP/1.1 101 Switching Protocols',
		'Upgrade: websocket',
		'Connection: Upgrade',
		`Sec-WebSocket-Accept: ${accept}`,
		'',
		'',
	].join('\r\n'));
}

function requestKey(request: string): string {
	const match = /^Sec-WebSocket-Key: (.+)$/m.exec(request);
	if (!match) {
		throw new Error('WebSocket upgrade request did not include Sec-WebSocket-Key.');
	}
	return match[1];
}

function createTextFrame(message: string): Uint8Array {
	const data = new TextEncoder().encode(message);
	return Uint8Array.from([0x81, data.byteLength, ...data]);
}

function concat(...chunks: Uint8Array[]): Uint8Array {
	const result = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0));
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

class FakeDuplexStream extends EventEmitter implements ITunnelDuplexStream {
	readonly writes: (Uint8Array | string)[] = [];
	private _ended = false;
	private _destroyed = false;

	get request(): string {
		return this.writes.map(write => typeof write === 'string' ? write : new TextDecoder().decode(write)).join('');
	}

	write(chunk: Uint8Array | string): boolean {
		this.writes.push(chunk);
		return true;
	}

	end(): void {
		if (!this._ended) {
			this._ended = true;
			this.emit('end');
		}
	}

	destroy(): void {
		if (!this._destroyed) {
			this._destroyed = true;
			this.emit('close');
		}
	}

	pause(): void {
	}

	resume(): void {
	}

	push(chunk: Uint8Array | string): void {
		this.emit('data', Buffer.from(chunk));
	}
}

class ReentrantEndDuplexStream extends FakeDuplexStream {
	endCalls = 0;

	override end(): void {
		this.endCalls++;
		this.emit('end');
	}
}
