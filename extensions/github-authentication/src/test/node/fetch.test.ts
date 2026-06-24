/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as http from 'http';
import * as net from 'net';
import { createFetch } from '../../node/fetch';
import { Log } from '../../common/logger';
import { AuthProviderType } from '../../github';


suite('fetching', () => {
	const logger = new Log(AuthProviderType.github);
	let server: http.Server;
	let port: number;

	setup(async () => {
		await new Promise<void>((resolve) => {
			server = http.createServer((req, res) => {
				const reqUrl = new URL(req.url!, `http://${req.headers.host}`);
				const expectAgent = reqUrl.searchParams.get('expectAgent');
				const actualAgent = String(req.headers['user-agent']).toLowerCase();
				if (expectAgent && !actualAgent.includes(expectAgent)) {
					if (reqUrl.searchParams.get('error') === 'html') {
						res.writeHead(200, {
							'Content-Type': 'text/html',
							'X-Client-User-Agent': actualAgent,
						});
						res.end('<html><body><h1>Bad Request</h1></body></html>');
						return;
					} else {
						res.writeHead(400, {
							'X-Client-User-Agent': actualAgent,
						});
						res.end('Bad Request');
						return;
					}
				}
				switch (reqUrl.pathname) {
					case '/json': {
						res.writeHead(200, {
							'Content-Type': 'application/json',
							'X-Client-User-Agent': actualAgent,
						});
						res.end(JSON.stringify({ message: 'Hello, world!' }));
						break;
					}
					case '/text': {
						res.writeHead(200, {
							'Content-Type': 'text/plain',
							'X-Client-User-Agent': actualAgent,
						});
						res.end('Hello, world!');
						break;
					}
					default:
						res.writeHead(404);
						res.end('Not Found');
						break;
				}
			}).listen(() => {
				port = (server.address() as net.AddressInfo).port;
				resolve();
			});
		});
	});

	teardown(async () => {
		await new Promise<unknown>((resolve) => {
			server.close(resolve);
		});
	});

	test('should use Electron fetch', async () => {
		const res = await createFetch()(`http://localhost:${port}/json`, {
			logger,
			retryFallbacks: true,
			expectJSON: true,
		});
		const actualAgent = res.headers.get('x-client-user-agent') || 'None';
		assert.ok(actualAgent.includes('electron'), actualAgent);
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(await res.json(), { message: 'Hello, world!' });
	});

	test('should use Electron fetch 2', async () => {
		const res = await createFetch()(`http://localhost:${port}/text`, {
			logger,
			retryFallbacks: true,
			expectJSON: false,
		});
		const actualAgent = res.headers.get('x-client-user-agent') || 'None';
		assert.ok(actualAgent.includes('electron'), actualAgent);
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(await res.text(), 'Hello, world!');
	});

	test('should fall back to Node.js fetch', async () => {
		const res = await createFetch()(`http://localhost:${port}/json?expectAgent=node`, {
			logger,
			retryFallbacks: true,
			expectJSON: true,
		});
		const actualAgent = res.headers.get('x-client-user-agent') || 'None';
		assert.strictEqual(actualAgent, 'node');
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(await res.json(), { message: 'Hello, world!' });
	});

	test('should fall back to Node.js fetch 2', async () => {
		const res = await createFetch()(`http://localhost:${port}/json?expectAgent=node&error=html`, {
			logger,
			retryFallbacks: true,
			expectJSON: true,
		});
		const actualAgent = res.headers.get('x-client-user-agent') || 'None';
		assert.strictEqual(actualAgent, 'node');
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(await res.json(), { message: 'Hello, world!' });
	});

	test('should fall back to Node.js http/s', async () => {
		const res = await createFetch()(`http://localhost:${port}/json?expectAgent=undefined`, {
			logger,
			retryFallbacks: true,
			expectJSON: true,
		});
		const actualAgent = res.headers.get('x-client-user-agent') || 'None';
		assert.strictEqual(actualAgent, 'undefined');
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(await res.json(), { message: 'Hello, world!' });
	});

	test('should fail with first error', async () => {
		const res = await createFetch()(`http://localhost:${port}/text`, {
			logger,
			retryFallbacks: true,
			expectJSON: true, // Expect JSON but server returns text
		});
		const actualAgent = res.headers.get('x-client-user-agent') || 'None';
		assert.ok(actualAgent.includes('electron'), actualAgent);
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(await res.text(), 'Hello, world!');
	});

	test('should not retry with other fetchers on 429 status', async () => {
		// Set up server to return 429 for the first request
		let requestCount = 0;
		const oldListener = server.listeners('request')[0] as (req: http.IncomingMessage, res: http.ServerResponse) => void;
		if (!oldListener) {
			throw new Error('No request listener found on server');
		}
		
		server.removeAllListeners('request');
		server.on('request', (req, res) => {
			requestCount++;
			if (req.url === '/rate-limited') {
				res.writeHead(429, {
					'Content-Type': 'text/plain',
					'X-Client-User-Agent': String(req.headers['user-agent'] ?? '').toLowerCase(),
				});
				res.end('Too Many Requests');
			} else {
				oldListener(req, res);
			}
		});

		try {
			const res = await createFetch()(`http://localhost:${port}/rate-limited`, {
				logger,
				retryFallbacks: true,
				expectJSON: false,
			});

			// Verify only one request was made (no fallback attempts)
			assert.strictEqual(requestCount, 1, 'Should only make one request for 429 status');
			assert.strictEqual(res.status, 429);
			// Note: We only check that we got a response, not which fetcher was used,
			// as the fetcher order may vary by configuration
			assert.strictEqual(await res.text(), 'Too Many Requests');
		} finally {
			// Restore original listener
			server.removeAllListeners('request');
			server.on('request', oldListener);
		}
	});
});
