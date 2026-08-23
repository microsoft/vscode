/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { encodeWebSocketFrame, type IWebSocketFrame, WebSocketFrameParser, WebSocketOpcode } from '../../../../base/parts/ipc/common/webSocketFraming.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { connectWebSocketOverDuplex, createWebSocketAccept, type IWebSocketOverDuplexOptions } from '../../common/webSocketOverDuplex.js';
import type { ITunnelDuplexStream } from '../../common/tunnelMessageSocket.js';

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
		stream.push(concat(response, createFrame('coalesced')));
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
		stream.push(createFrame('round trip'));

		assert.deepStrictEqual([await message], ['round trip']);
	});

	test('masks outgoing text frames', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream);
		stream.push(await createUpgradeResponse(stream.request));
		const socket = store.add(await socketPromise);
		socket.send('outbound');

		const [frame] = clientFrames(stream);
		assert.deepStrictEqual({
			mask: frame.mask !== undefined,
			opcode: frame.opcode,
			payload: frame.payload.toString(),
		}, {
			mask: true,
			opcode: WebSocketOpcode.Text,
			payload: 'outbound',
		});
	});

	test('assembles fragmented inbound text messages', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream);
		stream.push(await createUpgradeResponse(stream.request));
		const socket = store.add(await socketPromise);
		const message = Event.toPromise(socket.onDidReceiveMessage);
		stream.push(concat(
			createFrame('frag', { final: false }),
			createFrame('mented', { opcode: WebSocketOpcode.Continuation }),
		));

		assert.strictEqual(await message, 'fragmented');
	});

	test('replies to pings with a masked pong', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream);
		stream.push(await createUpgradeResponse(stream.request));
		store.add(await socketPromise);
		stream.push(createFrame('keepalive', { opcode: WebSocketOpcode.Ping }));

		const [frame] = clientFrames(stream);
		assert.deepStrictEqual({
			mask: frame.mask !== undefined,
			opcode: frame.opcode,
			payload: frame.payload.toString(),
		}, {
			mask: true,
			opcode: WebSocketOpcode.Pong,
			payload: 'keepalive',
		});
	});

	test('acknowledges close frames once and ends the stream', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream);
		stream.push(await createUpgradeResponse(stream.request));
		const socket = store.add(await socketPromise);
		let closeCount = 0;
		store.add(socket.onDidClose(() => closeCount++));
		const close = Event.toPromise(socket.onDidClose);
		stream.push(createCloseFrame(1000, 'done'));

		const [frame] = clientFrames(stream);
		assert.deepStrictEqual({
			close: await close,
			closeCount,
			endCalls: stream.endCalls,
			mask: frame.mask !== undefined,
			opcode: frame.opcode,
			payload: Array.from(frame.payload.buffer),
		}, {
			close: { code: 1000, reason: 'done' },
			closeCount: 1,
			endCalls: 1,
			mask: true,
			opcode: WebSocketOpcode.Close,
			payload: [0x03, 0xe8, 0x64, 0x6f, 0x6e, 0x65],
		});
	});

	test('forces the stream closed when the close handshake times out', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream, '/', undefined, { closeTimeoutMs: 1 });
		stream.push(await createUpgradeResponse(stream.request));
		const socket = store.add(await socketPromise);
		const close = Event.toPromise(socket.onDidClose);
		socket.close();

		const closed = await close;
		const [frame] = clientFrames(stream);
		assert.deepStrictEqual({
			error: closed.error?.message.includes('close handshake timed out'),
			endCalls: stream.endCalls,
			destroyCalls: stream.destroyCalls,
			closeCode: frame.payload.readUInt8(0) * 2 ** 8 + frame.payload.readUInt8(1),
		}, {
			error: true,
			endCalls: 1,
			destroyCalls: 1,
			closeCode: 1000,
		});
	});

	test('closes when a frame exceeds the configured payload limit', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream, '/', undefined, { maxFramePayloadLength: 4 });
		stream.push(await createUpgradeResponse(stream.request));
		const socket = store.add(await socketPromise);
		const close = Event.toPromise(socket.onDidClose);
		stream.push(createFrame('12345'));

		const closed = await close;
		const [frame] = clientFrames(stream);
		assert.deepStrictEqual({
			error: closed.error?.message.includes('configured limit of 4'),
			closeCode: frame.payload.readUInt8(0) * 2 ** 8 + frame.payload.readUInt8(1),
		}, {
			error: true,
			closeCode: 1009,
		});
	});

	test('closes when a fragmented message exceeds the configured payload limit', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream, '/', undefined, { maxFramePayloadLength: 4, maxMessagePayloadLength: 5 });
		stream.push(await createUpgradeResponse(stream.request));
		const socket = store.add(await socketPromise);
		const close = Event.toPromise(socket.onDidClose);
		stream.push(concat(
			createFrame('abc', { final: false }),
			createFrame('def', { opcode: WebSocketOpcode.Continuation }),
		));

		const closed = await close;
		const [frame] = clientFrames(stream);
		assert.deepStrictEqual({
			error: closed.error?.message.includes('configured limit of 5'),
			closeCode: frame.payload.readUInt8(0) * 2 ** 8 + frame.payload.readUInt8(1),
		}, {
			error: true,
			closeCode: 1009,
		});
	});

	test('closes with an error for invalid UTF-8 text', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream);
		stream.push(await createUpgradeResponse(stream.request));
		const socket = store.add(await socketPromise);
		const close = Event.toPromise(socket.onDidClose);
		stream.push(Uint8Array.from([0x81, 0x01, 0xc3]));

		const [frame] = clientFrames(stream);
		const closed = await close;
		assert.deepStrictEqual({
			error: closed.error?.message.includes('invalid UTF-8'),
			endCalls: stream.endCalls,
			opcode: frame.opcode,
			closeCode: frame.payload.readUInt8(0) * 2 ** 8 + frame.payload.readUInt8(1),
		}, {
			error: true,
			endCalls: 1,
			opcode: WebSocketOpcode.Close,
			closeCode: 1007,
		});
	});

	test('closes with an error for binary messages', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream);
		stream.push(await createUpgradeResponse(stream.request));
		const socket = store.add(await socketPromise);
		const close = Event.toPromise(socket.onDidClose);
		stream.push(encodeWebSocketFrame(VSBuffer.fromString('binary'), { opcode: WebSocketOpcode.Binary }).buffer);

		const [frame] = clientFrames(stream);
		const closed = await close;
		assert.deepStrictEqual({
			error: closed.error?.message.includes('binary'),
			endCalls: stream.endCalls,
			opcode: frame.opcode,
			closeCode: frame.payload.readUInt8(0) * 2 ** 8 + frame.payload.readUInt8(1),
		}, {
			error: true,
			endCalls: 1,
			opcode: WebSocketOpcode.Close,
			closeCode: 1003,
		});
	});

	test('closes with a protocol error for masked server frames', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream);
		stream.push(await createUpgradeResponse(stream.request));
		const socket = store.add(await socketPromise);
		const close = Event.toPromise(socket.onDidClose);
		stream.push(encodeWebSocketFrame(VSBuffer.fromString('masked'), { opcode: WebSocketOpcode.Text, mask: 0x12345678 }).buffer);

		const frames = clientFrames(stream);
		const [frame] = frames;
		const closed = await close;
		assert.deepStrictEqual({
			error: closed.error?.message.includes('masked WebSocket frame'),
			endCalls: stream.endCalls,
			outgoingFrames: frames.length,
			mask: frame.mask !== undefined,
			opcode: frame.opcode,
			closeCode: frame.payload.readUInt8(0) * 2 ** 8 + frame.payload.readUInt8(1),
		}, {
			error: true,
			endCalls: 1,
			outgoingFrames: 1,
			mask: true,
			opcode: WebSocketOpcode.Close,
			closeCode: 1002,
		});
	});

	test('ignores coalesced frames after a protocol failure', async () => {
		const stream = new FakeDuplexStream();
		const socketPromise = connect(stream);
		stream.push(await createUpgradeResponse(stream.request));
		const socket = store.add(await socketPromise);
		const messages: string[] = [];
		let closeCount = 0;
		store.add(socket.onDidReceiveMessage(message => messages.push(message)));
		store.add(socket.onDidClose(() => closeCount++));
		const close = Event.toPromise(socket.onDidClose);
		stream.push(concat(
			encodeWebSocketFrame(VSBuffer.fromString('binary'), { opcode: WebSocketOpcode.Binary }).buffer,
			createFrame('must not be delivered'),
		));

		const [frame] = clientFrames(stream);
		await close;
		assert.deepStrictEqual({
			closeCount,
			messages,
			outgoingFrames: clientFrames(stream).length,
			closeCode: frame.payload.readUInt8(0) * 2 ** 8 + frame.payload.readUInt8(1),
		}, {
			closeCount: 1,
			messages: [],
			outgoingFrames: 1,
			closeCode: 1003,
		});
	});

	test('does not recurse when a re-entrant stream ends during a close reply', async () => {
		const stream = new ReentrantEndDuplexStream();
		const socketPromise = connect(stream);
		stream.push(await createUpgradeResponse(stream.request));
		const socket = store.add(await socketPromise);
		stream.push(createCloseFrame(1000, 'done'));

		assert.deepStrictEqual({
			endCalls: stream.endCalls,
			socketCreated: !!socket,
		}, {
			endCalls: 1,
			socketCreated: true,
		});
	});

	test('does not recurse when disposing a re-entrant tunnel stream', async () => {
		const stream = new ReentrantDestroyDuplexStream();
		const socketPromise = connect(stream);
		stream.push(await createUpgradeResponse(stream.request));
		const socket = await socketPromise;
		socket.dispose();

		assert.strictEqual(stream.destroyCalls, 1);
	});
});

function connect(stream: FakeDuplexStream, path = '/', host?: string, options: Omit<IWebSocketOverDuplexOptions, 'path' | 'host'> = {}) {
	return connectWebSocketOverDuplex(stream, { path, host, ...options });
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

function createFrame(message: string, options: { readonly final?: boolean; readonly opcode?: WebSocketOpcode } = {}): Uint8Array {
	return encodeWebSocketFrame(VSBuffer.fromString(message), {
		final: options.final,
		opcode: options.opcode ?? WebSocketOpcode.Text,
	}).buffer;
}

function createCloseFrame(code: number, reason: string): Uint8Array {
	const reasonPayload = VSBuffer.fromString(reason);
	const payload = VSBuffer.alloc(2 + reasonPayload.byteLength);
	payload.writeUInt8(code >>> 8, 0);
	payload.writeUInt8(code, 1);
	payload.set(reasonPayload, 2);
	return encodeWebSocketFrame(payload, { opcode: WebSocketOpcode.Close }).buffer;
}

function clientFrames(stream: FakeDuplexStream): readonly IWebSocketFrame[] {
	const parser = new WebSocketFrameParser();
	return stream.writes
		.filter((write): write is Uint8Array => write instanceof Uint8Array)
		.flatMap(write => parser.acceptChunk(VSBuffer.wrap(write)));
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
	endCalls = 0;
	destroyCalls = 0;
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
		this.endCalls++;
		if (!this._ended) {
			this._ended = true;
			this.emit('end');
		}
	}

	destroy(): void {
		this.destroyCalls++;
		if (!this._destroyed) {
			this._destroyed = true;
			this.emit('close');
		}
	}

	push(chunk: Uint8Array | string): void {
		this.emit('data', typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
	}
}

class ReentrantEndDuplexStream extends FakeDuplexStream {
	override end(): void {
		this.endCalls++;
		this.emit('end');
	}
}

class ReentrantDestroyDuplexStream extends FakeDuplexStream {
	override destroy(): void {
		this.destroyCalls++;
		this.emit('close');
	}
}
