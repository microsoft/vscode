/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ITunnelConnectFn, SocksProxy } from '../../node/socksProxy.js';
import { NodeSocket } from '../../../../base/parts/ipc/node/ipc.net.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

/**
 * Create a mock {@link ITunnelConnectFn} that connects to a local TCP
 * server instead of going through the remote agent.
 */
function createMockConnectFn(targetPort: number): ITunnelConnectFn {
	return async (_host: string, _port: number) => {
		const net = await import('net');
		const socket = net.createConnection({ host: '127.0.0.1', port: targetPort });
		await new Promise<void>((resolve, reject) => {
			socket.once('connect', resolve);
			socket.once('error', reject);
		});
		return {
			getSocket: () => new NodeSocket(socket),
			readEntireBuffer: () => VSBuffer.alloc(0),
			dispose: () => { },
		};
	};
}

/**
 * Open a SOCKS5 connection through the proxy and send/receive data.
 */
async function socksConnect(
	proxyPort: number,
	destHost: string,
	destPort: number,
): Promise<import('net').Socket> {
	const net = await import('net');
	const socket = net.createConnection({ host: '127.0.0.1', port: proxyPort });
	await new Promise<void>((resolve, reject) => {
		socket.once('connect', resolve);
		socket.once('error', reject);
	});

	// Phase 1: Method negotiation (no auth)
	socket.write(Buffer.from([0x05, 0x01, 0x00]));
	const methodReply = await readBytes(socket, 2);
	if (methodReply[0] !== 0x05 || methodReply[1] !== 0x00) {
		socket.destroy();
		throw new Error(`SOCKS5 method negotiation failed: ${methodReply[0]},${methodReply[1]}`);
	}

	// Phase 2: CONNECT request with domain name
	const hostBuf = Buffer.from(destHost, 'ascii');
	const request = Buffer.alloc(4 + 1 + hostBuf.length + 2);
	request[0] = 0x05; // VER
	request[1] = 0x01; // CMD: CONNECT
	request[2] = 0x00; // RSV
	request[3] = 0x03; // ATYP: domain
	request[4] = hostBuf.length;
	hostBuf.copy(request, 5);
	request.writeUInt16BE(destPort, 5 + hostBuf.length);
	socket.write(request);

	// Read reply (10 bytes for IPv4 bind address)
	const reply = await readBytes(socket, 10);
	if (reply[0] !== 0x05) {
		socket.destroy();
		throw new Error(`SOCKS5 bad version in reply: ${reply[0]}`);
	}
	if (reply[1] !== 0x00) {
		socket.destroy();
		throw new Error(`SOCKS5 connect failed with rep=${reply[1]}`);
	}

	return socket;
}

/**
 * Try a SOCKS5 connect and return the reply status code (without throwing).
 */
async function socksConnectStatus(
	proxyPort: number,
	destHost: string,
	destPort: number,
): Promise<number> {
	const net = await import('net');
	const socket = net.createConnection({ host: '127.0.0.1', port: proxyPort });
	await new Promise<void>((resolve, reject) => {
		socket.once('connect', resolve);
		socket.once('error', reject);
	});

	// Method negotiation
	socket.write(Buffer.from([0x05, 0x01, 0x00]));
	const methodReply = await readBytes(socket, 2);
	if (methodReply[0] !== 0x05 || methodReply[1] !== 0x00) {
		socket.destroy();
		throw new Error('Method negotiation failed');
	}

	// CONNECT request
	const hostBuf = Buffer.from(destHost, 'ascii');
	const request = Buffer.alloc(4 + 1 + hostBuf.length + 2);
	request[0] = 0x05;
	request[1] = 0x01;
	request[2] = 0x00;
	request[3] = 0x03;
	request[4] = hostBuf.length;
	hostBuf.copy(request, 5);
	request.writeUInt16BE(destPort, 5 + hostBuf.length);
	socket.write(request);

	const reply = await readBytes(socket, 10);
	socket.destroy();
	return reply[1]; // REP field
}

function readBytes(socket: import('net').Socket, length: number): Promise<Buffer> {
	return new Promise<Buffer>((resolve, reject) => {
		const tryRead = () => {
			const data = socket.read(length) as Buffer | null;
			if (data) {
				resolve(data);
			} else {
				socket.once('readable', tryRead);
			}
		};
		socket.once('error', reject);
		socket.once('close', () => reject(new Error('Socket closed')));
		tryRead();
	});
}


suite('SocksProxy', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let targetServer: Server;
	let targetPort: number;

	// A simple HTTP server that echoes the request method + URL back.
	suiteSetup(async () => {
		const http = await import('http');
		targetServer = http.createServer((req, res) => {
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.end(`ECHO ${req.method} ${req.url}`);
		});
		targetServer.listen(0, '127.0.0.1');
		await new Promise<void>(resolve => targetServer.once('listening', resolve));
		targetPort = (targetServer.address() as AddressInfo).port;
	});

	suiteTeardown(() => {
		targetServer.close();
	});

	let proxy: SocksProxy;
	let proxyPort: number;

	setup(async () => {
		const connectFn = createMockConnectFn(targetPort);
		proxy = ds.add(new SocksProxy(connectFn, new NullLogService()));
		proxyPort = await proxy.start();
		// Allow the target by default
		proxy.updateAllowlist([{ host: '127.0.0.1', port: targetPort }]);
	});

	teardown(() => {
		proxy.dispose();
	});

	// --- Basic connectivity ---

	test('start returns a valid port', () => {
		assert.ok(proxyPort > 0 && proxyPort < 65536);
	});

	test('tunnels allowed CONNECT to target', async () => {
		const socket = await socksConnect(proxyPort, '127.0.0.1', targetPort);

		// Send a raw HTTP request through the tunnel
		socket.write(`GET /tunneled HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\nConnection: close\r\n\r\n`);
		const body = await new Promise<string>((resolve, reject) => {
			const chunks: Buffer[] = [];
			socket.on('data', c => chunks.push(c));
			socket.on('end', () => resolve(Buffer.concat(chunks).toString()));
			socket.on('error', reject);
		});
		assert.ok(body.includes('ECHO GET /tunneled'), `Expected tunneled echo, got: ${body}`);
	});

	// --- Routing: tunneled vs direct ---

	test('non-allowed destinations connect directly', async () => {
		// The target server is on localhost — a non-allowed destination
		// should still succeed via direct connection.
		proxy.updateAllowlist([]); // empty allowlist

		const socket = await socksConnect(proxyPort, '127.0.0.1', targetPort);
		socket.write(`GET /direct HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\nConnection: close\r\n\r\n`);
		const body = await new Promise<string>((resolve, reject) => {
			const chunks: Buffer[] = [];
			socket.on('data', c => chunks.push(c));
			socket.on('end', () => resolve(Buffer.concat(chunks).toString()));
			socket.on('error', reject);
		});
		assert.ok(body.includes('ECHO GET /direct'), `Expected direct echo, got: ${body}`);
	});

	test('allowed destinations go through tunnel connect fn', async () => {
		const net = await import('net');
		let tunnelConnectCalled = false;
		const trackingConnect: ITunnelConnectFn = async (_host, _port) => {
			tunnelConnectCalled = true;
			const socket = net.createConnection({ host: '127.0.0.1', port: targetPort });
			await new Promise<void>((resolve, reject) => {
				socket.once('connect', resolve);
				socket.once('error', reject);
			});
			return {
				getSocket: () => new NodeSocket(socket),
				readEntireBuffer: () => VSBuffer.alloc(0),
				dispose: () => { },
			};
		};
		const proxy2 = ds.add(new SocksProxy(trackingConnect, new NullLogService()));
		const port2 = await proxy2.start();
		proxy2.updateAllowlist([{ host: '127.0.0.1', port: targetPort }]);

		const socket = await socksConnect(port2, '127.0.0.1', targetPort);
		socket.destroy();
		assert.ok(tunnelConnectCalled, 'Expected tunnel connect function to be called for allowed destination');
		proxy2.dispose();
	});

	test('non-allowed destinations do NOT call tunnel connect fn', async () => {
		let tunnelConnectCalled = false;
		const trackingConnect: ITunnelConnectFn = async () => {
			tunnelConnectCalled = true;
			throw new Error('should not be called');
		};
		const proxy2 = ds.add(new SocksProxy(trackingConnect, new NullLogService()));
		const port2 = await proxy2.start();
		proxy2.updateAllowlist([]); // nothing allowed

		// Connect to our local target server — should go direct, not through tunnel
		const socket = await socksConnect(port2, '127.0.0.1', targetPort);
		socket.destroy();
		assert.ok(!tunnelConnectCalled, 'Tunnel connect should NOT be called for non-allowed destinations');
		proxy2.dispose();
	});

	test('allowlist can be updated dynamically', async () => {
		const net = await import('net');
		let tunnelConnectCount = 0;
		const countingConnect: ITunnelConnectFn = async (_host, _port) => {
			tunnelConnectCount++;
			const socket = net.createConnection({ host: '127.0.0.1', port: targetPort });
			await new Promise<void>((resolve, reject) => {
				socket.once('connect', resolve);
				socket.once('error', reject);
			});
			return {
				getSocket: () => new NodeSocket(socket),
				readEntireBuffer: () => VSBuffer.alloc(0),
				dispose: () => { },
			};
		};
		const proxy2 = ds.add(new SocksProxy(countingConnect, new NullLogService()));
		const port2 = await proxy2.start();

		// Initially not allowed — goes direct, tunnel not called
		proxy2.updateAllowlist([]);
		const s1 = await socksConnect(port2, '127.0.0.1', targetPort);
		s1.destroy();
		assert.strictEqual(tunnelConnectCount, 0);

		// Add to allowlist — now goes through tunnel
		proxy2.updateAllowlist([{ host: '127.0.0.1', port: targetPort }]);
		const s2 = await socksConnect(port2, '127.0.0.1', targetPort);
		s2.destroy();
		assert.strictEqual(tunnelConnectCount, 1);

		proxy2.dispose();
	});

	test('localhost variants are treated as equivalent in allowlist', async () => {
		const net = await import('net');
		let tunnelConnectCount = 0;
		const countingConnect: ITunnelConnectFn = async (_host, _port) => {
			tunnelConnectCount++;
			const socket = net.createConnection({ host: '127.0.0.1', port: targetPort });
			await new Promise<void>((resolve, reject) => {
				socket.once('connect', resolve);
				socket.once('error', reject);
			});
			return {
				getSocket: () => new NodeSocket(socket),
				readEntireBuffer: () => VSBuffer.alloc(0),
				dispose: () => { },
			};
		};
		const proxy2 = ds.add(new SocksProxy(countingConnect, new NullLogService()));
		const port2 = await proxy2.start();

		// Allowlist uses 127.0.0.1, but connect using "localhost"
		proxy2.updateAllowlist([{ host: '127.0.0.1', port: targetPort }]);
		const s1 = await socksConnect(port2, 'localhost', targetPort);
		s1.destroy();
		assert.strictEqual(tunnelConnectCount, 1, 'localhost should match 127.0.0.1 in allowlist');

		// Allowlist uses localhost, connect using 127.0.0.1
		tunnelConnectCount = 0;
		proxy2.updateAllowlist([{ host: 'localhost', port: targetPort }]);
		const s2 = await socksConnect(port2, '127.0.0.1', targetPort);
		s2.destroy();
		assert.strictEqual(tunnelConnectCount, 1, '127.0.0.1 should match localhost in allowlist');

		proxy2.dispose();
	});

	// --- Connection pooling ---

	test('reuses tunnel for multiple sequential connections', async () => {
		const net = await import('net');
		let connectCount = 0;
		const countingConnect: ITunnelConnectFn = async (_host, _port) => {
			connectCount++;
			const socket = net.createConnection({ host: '127.0.0.1', port: targetPort });
			await new Promise<void>((resolve, reject) => {
				socket.once('connect', resolve);
				socket.once('error', reject);
			});
			return {
				getSocket: () => new NodeSocket(socket),
				readEntireBuffer: () => VSBuffer.alloc(0),
				dispose: () => { },
			};
		};
		const proxy2 = ds.add(new SocksProxy(countingConnect, new NullLogService()));
		const port2 = await proxy2.start();
		proxy2.updateAllowlist([{ host: '127.0.0.1', port: targetPort }]);

		// Each SOCKS CONNECT creates a new tunnel (SOCKS is per-connection,
		// unlike HTTP keep-alive). Verify they all succeed.
		for (let i = 0; i < 3; i++) {
			const socket = await socksConnect(port2, '127.0.0.1', targetPort);
			socket.write(`GET /req${i} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
			const body = await new Promise<string>((resolve, reject) => {
				const chunks: Buffer[] = [];
				socket.on('data', c => chunks.push(c));
				socket.on('end', () => resolve(Buffer.concat(chunks).toString()));
				socket.on('error', reject);
			});
			assert.ok(body.includes(`ECHO GET /req${i}`));
		}
		assert.strictEqual(connectCount, 3, `Expected 3 tunnel connections (one per SOCKS CONNECT), got ${connectCount}`);
		proxy2.dispose();
	});

	// --- Error handling ---

	test('returns failure when tunnel connect throws', async () => {
		const failingConnect: ITunnelConnectFn = async () => {
			throw new Error('simulated upstream failure');
		};
		const failProxy = ds.add(new SocksProxy(failingConnect, new NullLogService()));
		const failPort = await failProxy.start();
		failProxy.updateAllowlist([{ host: 'fail.example.com', port: 80 }]);

		const rep = await socksConnectStatus(failPort, 'fail.example.com', 80);
		assert.strictEqual(rep, 0x04); // Host unreachable
		failProxy.dispose();
	});

	// --- Lifecycle ---

	test('dispose shuts down the server', async () => {
		const connectFn = createMockConnectFn(targetPort);
		const p = ds.add(new SocksProxy(connectFn, new NullLogService()));
		await p.start();
		p.dispose();

		const net = await import('net');
		await assert.rejects(
			() => new Promise<void>((resolve, reject) => {
				const s = net.createConnection({ host: '127.0.0.1', port: p.localPort });
				s.once('connect', () => { s.destroy(); resolve(); });
				s.once('error', reject);
			}),
			/ECONNREFUSED/,
		);
	});
});
