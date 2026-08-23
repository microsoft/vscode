/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import type * as http from 'http';
import * as net from 'net';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const TOKEN_TTL_MS = 60_000;
const MAX_FRAME_PAYLOAD = 16 * 1024 * 1024;

/**
 * Dependency-free WebSocket (RFC 6455) to Unix-socket bridge for noVNC.
 *
 * QEMU only listens on the private Unix socket. The browser can reach this
 * loopback HTTP server, but the VNC protocol is forwarded only after a
 * single-use token has been presented as a WebSocket subprotocol.
 */
export class VncWebSocketProxy {

	private disposed = false;

	private constructor(
		private readonly server: http.Server,
		readonly port: number,
		private readonly pendingTokens: Map<string, ReturnType<typeof setTimeout>>,
		private readonly connections: Set<net.Socket>,
	) { }

	static async create(vncSocketPath: string, onError: (error: Error) => void): Promise<VncWebSocketProxy> {
		const http = await import('http');
		return new Promise((resolve, reject) => {
			const pendingTokens = new Map<string, ReturnType<typeof setTimeout>>();
			const connections = new Set<net.Socket>();
			const server = http.createServer((_req, res) => {
				res.writeHead(426, { 'Content-Type': 'text/plain' });
				res.end('WebSocket endpoint');
			});
			server.on('connection', socket => {
				connections.add(socket);
				socket.once('close', () => connections.delete(socket));
			});
			server.on('error', reject);

			const late = (port: number): VncWebSocketProxy =>
				new VncWebSocketProxy(server, port, pendingTokens, connections);

			server.on('upgrade', (req, socket: net.Socket, head: Buffer) => {
				try {
					upgradeToVnc(req, socket, head, pendingTokens, vncSocketPath, onError);
				} catch (error) {
					onError(error instanceof Error ? error : new Error(String(error)));
					socket.destroy();
				}
			});

			server.listen(0, '127.0.0.1', () => {
				const address = server.address();
				if (typeof address === 'object' && address) {
					resolve(late(address.port));
				} else {
					reject(new Error('Failed to determine VNC proxy port'));
				}
			});
		});
	}

	issueToken(): string {
		const token = crypto.randomBytes(24).toString('base64url');
		const timer = setTimeout(() => this.pendingTokens.delete(token), TOKEN_TTL_MS);
		this.pendingTokens.set(token, timer);
		return token;
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		for (const timer of this.pendingTokens.values()) {
			clearTimeout(timer);
		}
		this.pendingTokens.clear();
		for (const socket of this.connections) {
			socket.destroy();
		}
		this.connections.clear();
		this.server.close();
	}
}

function upgradeToVnc(
	req: http.IncomingMessage,
	socket: net.Socket,
	head: Buffer,
	pendingTokens: Map<string, ReturnType<typeof setTimeout>>,
	vncSocketPath: string,
	onError: (error: Error) => void,
): void {
	const key = req.headers['sec-websocket-key'];
	if (typeof key !== 'string' || req.headers.upgrade?.toLowerCase() !== 'websocket') {
		socket.destroy();
		return;
	}
	const protocolsHeader = req.headers['sec-websocket-protocol'];
	const protocols = typeof protocolsHeader === 'string' ? protocolsHeader.split(',').map(p => p.trim()) : [];
	const token = protocols.find(p => pendingTokens.has(p));
	if (!token) {
		socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
		socket.destroy();
		return;
	}
	const timer = pendingTokens.get(token);
	pendingTokens.delete(token);
	if (timer) {
		clearTimeout(timer);
	}

	const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
	socket.write(
		'HTTP/1.1 101 Switching Protocols\r\n' +
		'Upgrade: websocket\r\n' +
		'Connection: Upgrade\r\n' +
		`Sec-WebSocket-Accept: ${accept}\r\n` +
		'Sec-WebSocket-Protocol: binary\r\n' +
		'\r\n'
	);
	socket.setNoDelay(true);

	const upstream = net.createConnection({ path: vncSocketPath });
	upstream.setNoDelay(true);
	upstream.on('error', err => {
		onError(err);
		socket.destroy();
	});
	upstream.on('data', chunk => {
		try {
			socket.write(encodeFrame(chunk));
		} catch (error) {
			onError(error instanceof Error ? error : new Error(String(error)));
			upstream.destroy();
		}
	});
	upstream.once('close', () => socket.destroy());

	let buffer = head.length ? head : Buffer.alloc(0);
	socket.on('data', chunk => {
		buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
		buffer = consumeFrames(buffer, upstream, socket);
	});
	if (buffer.length) {
		buffer = consumeFrames(buffer, upstream, socket);
	}
	socket.on('error', () => upstream.destroy());
	socket.once('close', () => upstream.destroy());
}

function consumeFrames(buffer: Buffer, upstream: net.Socket, socket: net.Socket): Buffer {
	for (;;) {
		if (buffer.length < 2) {
			return buffer;
		}
		const firstByte = buffer[0];
		const opcode = firstByte & 0x0f;
		const masked = (buffer[1] & 0x80) !== 0;
		let length = buffer[1] & 0x7f;
		let offset = 2;
		if (length === 126) {
			if (buffer.length < 4) {
				return buffer;
			}
			length = buffer.readUInt16BE(2);
			offset = 4;
		} else if (length === 127) {
			if (buffer.length < 10) {
				return buffer;
			}
			const big = buffer.readBigUInt64BE(2);
			if (big > BigInt(MAX_FRAME_PAYLOAD)) {
				socket.destroy();
				return Buffer.alloc(0);
			}
			length = Number(big);
			offset = 10;
		}
		if (!masked || ((opcode & 0x08) !== 0 && (length > 125 || (firstByte & 0x80) === 0))) {
			socket.destroy();
			return Buffer.alloc(0);
		}
		const maskOffset = offset;
		offset += 4;
		if (buffer.length < offset + length) {
			return buffer;
		}
		const payload = Buffer.allocUnsafe(length);
		const mask = buffer.subarray(maskOffset, maskOffset + 4);
		for (let i = 0; i < length; i++) {
			payload[i] = buffer[offset + i] ^ mask[i & 3];
		}
		buffer = buffer.subarray(offset + length);

		switch (opcode) {
			case 0x0: // continuation
			case 0x2: // binary
				upstream.write(payload);
				break;
			case 0x1: // text — RFB is binary; ignore
				break;
			case 0x8: // close
				socket.write(encodeFrame(Buffer.alloc(0), 0x8));
				socket.end();
				return Buffer.alloc(0);
			case 0x9: // ping
				socket.write(encodeFrame(payload, 0xA));
				break;
			case 0xA: // pong
				break;
			default:
				socket.destroy();
				return Buffer.alloc(0);
		}
	}
}

function encodeFrame(payload: Buffer, opcode: number = 0x2): Buffer {
	const length = payload.length;
	let header: Buffer;
	if (length < 126) {
		header = Buffer.from([0x80 | opcode, length]);
	} else if (length < 65536) {
		header = Buffer.allocUnsafe(4);
		header[0] = 0x80 | opcode;
		header[1] = 126;
		header.writeUInt16BE(length, 2);
	} else {
		header = Buffer.allocUnsafe(10);
		header[0] = 0x80 | opcode;
		header[1] = 127;
		header.writeBigUInt64BE(BigInt(length), 2);
	}
	return Buffer.concat([header, payload]);
}
