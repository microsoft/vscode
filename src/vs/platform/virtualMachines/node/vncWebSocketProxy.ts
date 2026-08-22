/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import type * as http from 'http';
import * as net from 'net';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Minimal, dependency-free WebSocket (RFC 6455) to TCP bridge used to expose a
 * QEMU VNC server to the noVNC client running inside a workbench webview.
 *
 * Security properties:
 * - Listens on 127.0.0.1 only.
 * - Every connection must present a single-use token as a WebSocket
 *   subprotocol; the token is consumed on first use.
 * - Only binary frames are forwarded to the VNC server; ping/pong/close are
 *   handled per spec.
 */
export class VncWebSocketProxy {

	private constructor(
		private readonly server: http.Server,
		readonly port: number,
		private readonly pendingTokens: Set<string>,
	) { }

	static async create(vncPort: number, onError: (error: Error) => void): Promise<VncWebSocketProxy> {
		// Lazy import to avoid paying the startup cost of the http module until
		// the first virtual machine display is actually opened.
		const http = await import('http');
		return new Promise((resolve, reject) => {
			const pendingTokens = new Set<string>();
			const server = http.createServer((_req, res) => {
				res.writeHead(426, { 'Content-Type': 'text/plain' });
				res.end('WebSocket endpoint');
			});
			server.on('error', reject);

			const late = (port: number): VncWebSocketProxy =>
				new VncWebSocketProxy(server, port, pendingTokens);

			server.on('upgrade', (req, socket: net.Socket, head: Buffer) => {
				try {
					upgradeToVnc(req, socket, head, pendingTokens, vncPort, onError);
				} catch {
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
		this.pendingTokens.add(token);
		return token;
	}

	dispose(): void {
		this.server.close();
	}
}

function upgradeToVnc(
	req: http.IncomingMessage,
	socket: net.Socket,
	head: Buffer,
	pendingTokens: Set<string>,
	vncPort: number,
	onError: (error: Error) => void,
): void {
	const key = req.headers['sec-websocket-key'];
	if (typeof key !== 'string') {
		socket.destroy();
		return;
	}
	const protocolsHeader = req.headers['sec-websocket-protocol'];
	const protocols = typeof protocolsHeader === 'string' ? protocolsHeader.split(',').map(p => p.trim()) : [];
	// noVNC sends the session token as an extra subprotocol value.
	const token = protocols.find(p => pendingTokens.has(p));
	if (!token) {
		socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
		socket.destroy();
		return;
	}
	pendingTokens.delete(token);

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

	const upstream = net.connect(vncPort, '127.0.0.1');
	upstream.setNoDelay(true);
	upstream.on('error', err => {
		onError(err);
		socket.destroy();
	});
	upstream.on('data', chunk => {
		try {
			socket.write(encodeFrame(chunk));
		} catch {
			upstream.destroy();
		}
	});
	upstream.once('close', () => socket.destroy());

	let buffer = head.length ? head : Buffer.alloc(0);
	socket.on('data', chunk => {
		buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
		buffer = consumeFrames(buffer, upstream, socket);
	});
	socket.on('error', () => upstream.destroy());
	socket.once('close', () => upstream.destroy());
}

function consumeFrames(buffer: Buffer, upstream: net.Socket, socket: net.Socket): Buffer {
	for (; ;) {
		if (buffer.length < 2) {
			return buffer;
		}
		const opcode = buffer[0] & 0x0f;
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
			if (big > BigInt(16 * 1024 * 1024)) {
				socket.destroy();
				return Buffer.alloc(0);
			}
			length = Number(big);
			offset = 10;
		}
		// Client-to-server frames must be masked (RFC 6455 §5.3).
		if (!masked) {
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
