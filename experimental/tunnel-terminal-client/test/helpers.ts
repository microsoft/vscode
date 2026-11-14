/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { once } from 'node:events';
import { connect } from 'node:net';
import { PassThrough, Writable } from 'node:stream';
import type { TestContext } from 'node:test';
import WebSocket, { WebSocketServer } from 'ws';
import { openSocket } from '../src/tunnel.js';
import { MessageConnection, ProtocolClient, record } from '../src/wire.js';

export class Input extends PassThrough {
	readonly isTTY = true;
	isRaw = false;
	setRawMode(value: boolean): this {
		this.isRaw = value;
		if (value) { this.emit('raw'); }
		return this;
	}
}

export class Output extends Writable {
	readonly isTTY = true;
	columns = 100;
	rows = 30;
	value = '';
	override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
		this.value += chunk.toString();
		callback();
	}
}

export async function peer(t: TestContext, handle: (socket: WebSocket) => void): Promise<MessageConnection> {
	const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
	t.after(async () => {
		for (const socket of server.clients) { socket.terminate(); }
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	});
	server.on('connection', handle);
	await once(server, 'listening');
	const address = server.address();
	if (!address || typeof address === 'string') { throw new Error('Missing test server address.'); }
	const stream = connect(address.port, '127.0.0.1');
	const connection = await openSocket(stream, '/');
	t.after(() => connection.dispose());
	return connection;
}

export function rpc(t: TestContext, connection: MessageConnection): ProtocolClient {
	const client = new ProtocolClient(connection);
	t.after(() => client.dispose());
	return client;
}

export function messages(socket: WebSocket, handle: (message: Record<string, unknown>, params: Record<string, unknown>) => void): void {
	socket.on('message', data => {
		const message = record(JSON.parse(data.toString()), 'test request');
		handle(message, record(message.params, 'test params'));
	});
}

export function reply(socket: WebSocket, request: Record<string, unknown>, result: unknown): void {
	socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
}

export function action(socket: WebSocket, channel: string, serverSeq: number, action: object, rejectionReason?: string): void {
	socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'action', params: { channel, serverSeq, action, rejectionReason } }));
}
