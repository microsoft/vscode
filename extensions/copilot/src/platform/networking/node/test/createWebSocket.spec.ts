/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as http from 'http';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { WebSocketServer } from 'ws';
import { createWebSocket } from '../nodeFetchFetcher';

describe('createWebSocket', () => {
	let server: http.Server;
	let wss: WebSocketServer;
	let port: number;

	beforeAll(async () => {
		server = http.createServer((_req, res) => {
			res.writeHead(404, 'Not Found', { 'content-type': 'text/plain' });
			res.end('Not Found');
		});
		wss = new WebSocketServer({ server });
		wss.on('connection', ws => {
			ws.on('message', data => ws.send(data));
		});
		await new Promise<void>(resolve => {
			server.listen(0, () => {
				port = (server.address() as { port: number }).port;
				resolve();
			});
		});
	});

	afterAll(async () => {
		wss.close();
		server.close();
	});

	test('should capture 101 status on successful upgrade', async () => {
		const conn = createWebSocket(`ws://127.0.0.1:${port}`);
		await new Promise<void>((resolve, reject) => {
			conn.webSocket.onopen = () => {
				conn.webSocket.close();
				assert.strictEqual(conn.responseStatusCode, 101);
				assert.ok(conn.responseHeaders.get('upgrade') || conn.responseHeaders.get('connection'));
				resolve();
			};
			conn.webSocket.onerror = () => {
				reject(new Error('WebSocket error'));
			};
		});
	});

	test('should capture 404 status on non-upgrade response', async () => {
		// Connect to a path where the server does not upgrade (use a plain HTTP endpoint by not hitting the WebSocket path)
		// We achieve this by connecting to the server but requesting a non-existent WebSocket endpoint.
		// Since our server upgrades all connections on /, we need a server that doesn't upgrade.
		const nonWsServer = http.createServer((_req, res) => {
			res.writeHead(404, 'Not Found', { 'content-type': 'text/plain' });
			res.end('Not Found');
		});
		const nonWsPort = await new Promise<number>(resolve => {
			nonWsServer.listen(0, () => {
				resolve((nonWsServer.address() as { port: number }).port);
			});
		});
		try {
			const conn = createWebSocket(`ws://127.0.0.1:${nonWsPort}`);
			await new Promise<void>((resolve, reject) => {
				conn.webSocket.onopen = () => {
					conn.webSocket.close();
					reject(new Error('WebSocket should not have connected'));
				};
				conn.webSocket.onerror = () => {
					assert.strictEqual(conn.responseStatusCode, 404);
					assert.strictEqual(conn.responseStatusText, 'Not Found');
					assert.ok(conn.responseHeaders.get('content-type'));
					resolve();
				};
			});
		} finally {
			nonWsServer.close();
		}
	});
});
