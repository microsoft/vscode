/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { RequestListener } from 'http';
import os from 'os';
import { stub } from 'sinon';
import type { Duplex } from 'stream';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { GitHubRequestError, GitHubTransport } from '../../../github/common/githubTransport.js';
import { NullLogService } from '../../../log/common/log.js';
import { FetchChannel, FetchChannelClient } from '../../common/fetchIpc.js';
import { NodeFetchNetwork, NodeFetchService } from '../../node/fetchService.js';

suite('NodeFetchService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const nodeTest = process.type === 'renderer' ? test.skip : test;

	function createService(fetchImpl?: typeof globalThis.fetch, overrides?: Partial<NodeFetchNetwork>, values?: Record<string, unknown>, logService = new NullLogService()) {
		const configuration = new TestConfigurationService({ 'http.systemCertificates': false, ...values });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const network: NodeFetchNetwork = {
			resolveProxy: async () => 'DIRECT',
			lookupAuthorization: async () => undefined,
			lookupKerberosAuthorization: async () => undefined,
			loadCertificates: async () => [],
			...overrides,
		};
		return store.add(new NodeFetchService(network, fetchImpl, {}, configuration, logService));
	}

	function createClient(service: NodeFetchService): FetchChannelClient {
		const channel = store.add(new FetchChannel((input, init) => service.fetch(input, init), new NullLogService()));
		return new FetchChannelClient({
			call: (command, arg) => channel.call('window', command, arg),
			listen: (event, arg) => channel.listen('window', event, arg),
		});
	}

	async function withServer(listener: RequestListener, run: (url: string) => Promise<void>): Promise<void> {
		const { createServer } = await import('http');
		const server = createServer(listener);
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		try {
			await run(`http://127.0.0.1:${address.port}`);
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	}

	test('uses host proxy resolution without logging request URLs or credentials', async () => {
		const resolved: string[] = [];
		const requests: Request[] = [];
		const logs: string[] = [];
		const service = createService(async (input, init) => {
			requests.push(new Request(input, init));
			return new Response(null, { status: 302, headers: { location: 'https://storage.test/?sig=secret' } });
		}, {
			resolveProxy: async url => {
				resolved.push(url);
				return 'PROXY proxy-user:proxy-password@proxy.test:8080';
			},
		}, undefined, new class extends NullLogService {
			override trace(message: string): void { logs.push(message); }
			override debug(message: string): void { logs.push(message); }
		}());
		const response = await service.fetch('https://api.test/private-path?sig=secret', { headers: { Authorization: 'Bearer token' }, cache: 'no-store' });
		assert.deepStrictEqual({
			resolved, status: response.status, location: response.headers.get('location'),
			requests: requests.map(request => ({
				redirect: request.redirect, credentials: request.credentials, cache: request.cache, authorization: request.headers.get('authorization'),
			})),
			privateLogs: logs.filter(line => /private-path|secret|proxy-password|Bearer token/.test(line)),
		}, {
			resolved: ['https://api.test/private-path?sig=secret'], status: 302, location: 'https://storage.test/?sig=secret',
			requests: [{ redirect: 'manual', credentials: 'omit', cache: 'no-store', authorization: 'Bearer token' }], privateLogs: [],
		});
	});

	test('uses configured proxy and bypass rules before host resolution', async () => {
		let resolutions = 0;
		let attempts = 0;
		const service = createService(async () => {
			attempts++;
			return new Response();
		}, {
			resolveProxy: async () => {
				resolutions++;
				return 'DIRECT';
			},
		}, { 'http.proxy': 'http://proxy.test:8080', 'http.noProxy': ['bypass.test'] });
		await service.fetch('https://api.test/resource');
		await service.fetch('https://bypass.test/resource');
		assert.deepStrictEqual({ resolutions, attempts }, { resolutions: 0, attempts: 2 });
	});

	test('refreshes cached system proxy routing after network interfaces change', async () => {
		const networkInterfaces = stub(os, 'networkInterfaces');
		const network = (address: string): NodeJS.Dict<os.NetworkInterfaceInfo[]> => ({
			fixture: [{ address, netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: `${address}/24` }],
		});
		networkInterfaces.onFirstCall().returns(network('192.0.2.1'));
		networkInterfaces.returns(network('192.0.2.2'));
		let resolutions = 0;
		const service = createService(async () => new Response(), {
			resolveProxy: async () => ++resolutions === 1 ? 'DIRECT' : 'PROXY proxy.test:8080',
		}, { 'http.experimental.networkInterfaceCheckInterval': 0 });
		try {
			await service.fetch('https://api.test/resource');
			await service.fetch('https://api.test/resource');
			assert.deepStrictEqual({ resolutions, snapshots: networkInterfaces.callCount }, { resolutions: 2, snapshots: 2 });
		} finally {
			networkInterfaces.restore();
		}
	});

	test('does not invoke fetch after cancellation during initialization', async () => {
		let attempts = 0;
		const service = createService(async () => {
			attempts++;
			return new Response();
		});
		const controller = new AbortController();
		const reason = new Error('cancel initialization');
		const pending = service.fetch('https://api.test', { signal: controller.signal });
		controller.abort(reason);
		await assert.rejects(pending, error => error === reason);
		assert.strictEqual(attempts, 0);
	});

	test('retains abort through asynchronous proxy resolution', async () => {
		const resolving = new DeferredPromise<void>();
		const resolved = new DeferredPromise<string>();
		let aborted = false;
		const service = createService(async input => {
			assert.ok(input instanceof Request);
			aborted = input.signal.aborted;
			input.signal.throwIfAborted();
			return new Response();
		}, {
			resolveProxy: async () => {
				void resolving.complete();
				return resolved.p;
			},
		});
		const controller = new AbortController();
		const reason = new Error('cancel proxy resolution');
		const rejected = assert.rejects(service.fetch('https://api.test', { signal: controller.signal }), error => error === reason);
		await resolving.p;
		controller.abort(reason);
		await resolved.complete('DIRECT');
		await rejected;
		assert.strictEqual(aborted, true);
	});

	nodeTest('does not retry GET or a committed POST after the server drops its response', async () => {
		const requests: string[] = [];
		await withServer((request, response) => {
			request.on('end', () => {
				if (request.url === '/warm') {
					response.end('ok');
					return;
				}
				requests.push(request.method!);
				request.socket.destroy();
			});
			request.resume();
		}, async url => {
			const service = createService();
			await (await service.fetch(`${url}/warm`)).text();
			await assert.rejects(service.fetch(`${url}/read`));
			await (await service.fetch(`${url}/warm`)).text();
			await assert.rejects(service.fetch(`${url}/mutation`, { method: 'POST', body: '{}' }));
			assert.deepStrictEqual(requests, ['GET', 'POST']);
		});
	});

	for (const method of ['GET', 'POST'] as const) {
		nodeTest(`returns the first HTTP 421 for ${method} without replaying through IPC`, async () => {
			const requests: { method: string | undefined; body: string }[] = [];
			await withServer(async (request, response) => {
				let body = '';
				for await (const chunk of request) {
					body += chunk;
				}
				if (request.url === '/warm') {
					response.end('ok');
					return;
				}
				requests.push({ method: request.method, body });
				response.writeHead(requests.length === 1 ? 421 : 200, { 'retry-after': '7' });
				response.end('first response');
			}, async url => {
				const client = createClient(createService());
				await (await client.fetch(`${url}/warm`)).text();
				const response = await client.fetch(`${url}/resource`, { method, body: method === 'POST' ? '{"value":1}' : undefined });
				assert.deepStrictEqual({
					status: response.status, retryAfter: response.headers.get('retry-after'), body: await response.text(), requests,
				}, {
					status: 421, retryAfter: '7', body: 'first response', requests: [{ method, body: method === 'POST' ? '{"value":1}' : '' }],
				});
			});
		});
	}

	nodeTest('proxy authentication precedes one origin POST and preserves HTTP 421 for the engine', async () => {
		const { createServer } = await import('http');
		const { connect } = await import('net');
		const originRequests: { method: string | undefined; body: string; authorization: string | undefined; proxyAuthorization: string | undefined }[] = [];
		const proxyRequests: { authorization: string | undefined; proxyAuthorization: string | undefined }[] = [];
		let lookups = 0;
		await withServer(async (request, response) => {
			let body = '';
			for await (const chunk of request) {
				body += chunk;
			}
			originRequests.push({ method: request.method, body, authorization: request.headers.authorization, proxyAuthorization: request.headers['proxy-authorization'] });
			response.writeHead(421, { 'retry-after': '3' });
			response.end('misdirected');
		}, async origin => {
			const proxy = createServer();
			const sockets = new Set<Duplex>();
			proxy.on('connect', (request, downstream, head) => {
				sockets.add(downstream);
				downstream.once('close', () => sockets.delete(downstream));
				proxyRequests.push({ authorization: request.headers.authorization, proxyAuthorization: request.headers['proxy-authorization'] });
				if (!request.headers['proxy-authorization']) {
					downstream.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="fixture"\r\nContent-Length: 0\r\n\r\n');
					return;
				}
				const upstream = connect(Number(new URL(origin).port), '127.0.0.1', () => {
					downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n');
					upstream.write(head);
					downstream.pipe(upstream);
					upstream.pipe(downstream);
				});
				sockets.add(upstream);
				upstream.once('close', () => sockets.delete(upstream));
				upstream.on('error', () => downstream.destroy());
				downstream.on('error', () => upstream.destroy());
			});
			await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
			const address = proxy.address();
			assert.ok(address && typeof address !== 'string');
			const service = createService(undefined, {
				lookupAuthorization: async () => {
					lookups++;
					return { username: 'fixture-user', password: 'fixture-password' };
				},
			}, { 'http.proxy': `http://127.0.0.1:${address.port}` });
			try {
				const client = createClient(service);
				const transport = store.add(new GitHubTransport((input, init) => client.fetch(input, init)));
				await assert.rejects(transport.rest({ host: 'fixture.test', accountId: 'test' }, 'origin-token', {
					method: 'POST', url: `http://origin.fixture.test:${new URL(origin).port}/resource`, body: { value: 1 },
				}, new AbortController().signal), error => error instanceof GitHubRequestError && error.statusCode === 421 && error.responseBody === 'misdirected');
				assert.deepStrictEqual({ lookups, proxyRequests, originRequests }, {
					lookups: 1,
					proxyRequests: [
						{ authorization: undefined, proxyAuthorization: undefined },
						{ authorization: undefined, proxyAuthorization: `Basic ${Buffer.from('fixture-user:fixture-password').toString('base64')}` },
					],
					originRequests: [{ method: 'POST', body: '{"value":1}', authorization: 'Bearer origin-token', proxyAuthorization: undefined }],
				});
			} finally {
				service.dispose();
				for (const socket of sockets) {
					socket.destroy();
				}
				await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve()));
			}
		});
	});

	for (const encoding of ['gzip', 'deflate', 'br'] as const) {
		for (const status of [200, 429]) {
			nodeTest(`decodes ${encoding} HTTP ${status} bodies without losing rate-limit headers`, async () => {
				const { gzipSync, deflateSync, brotliCompressSync } = await import('zlib');
				const text = '{"message":"rate limit","value":1}';
				const compressed = ({ gzip: gzipSync, deflate: deflateSync, br: brotliCompressSync })[encoding](text);
				await withServer((_request, response) => {
					response.writeHead(status, { 'content-encoding': encoding, 'content-length': compressed.length, 'retry-after': '3', 'x-ratelimit-remaining': '0' });
					response.end(compressed);
				}, async url => {
					const response = await createClient(createService()).fetch(url);
					assert.deepStrictEqual({
						status: response.status, text: await response.text(),
						retryAfter: response.headers.get('retry-after'), remaining: response.headers.get('x-ratelimit-remaining'),
					}, { status, text, retryAfter: '3', remaining: '0' });
				});
			});
		}
	}

	nodeTest('retains null-body HTTP and HEAD responses', async () => {
		await withServer((request, response) => {
			response.writeHead(Number(request.url!.slice(1)), { etag: '"one"' });
			response.end();
		}, async url => {
			const client = createClient(createService());
			const results = [];
			for (const status of [204, 205, 304]) {
				const response = await client.fetch(`${url}/${status}`);
				results.push({ status: response.status, body: response.body, etag: response.headers.get('etag') });
			}
			const head = await client.fetch(`${url}/200`, { method: 'HEAD' });
			results.push({ status: head.status, body: head.body, etag: head.headers.get('etag') });
			assert.deepStrictEqual(results, [204, 205, 304, 200].map(status => ({ status, body: null, etag: '"one"' })));
		});
	});

	nodeTest('enforces the engine decoded-byte limit and cancels a compressed response before EOF', async () => {
		const { gzipSync } = await import('zlib');
		const closed = new DeferredPromise<void>();
		const text = 'x'.repeat(1024 * 1024);
		await withServer((request, response) => {
			request.socket.once('close', () => void closed.complete());
			response.writeHead(200, { 'content-encoding': 'gzip' });
			response.write(gzipSync(text));
		}, async url => {
			const client = createClient(createService());
			const transport = store.add(new GitHubTransport((input, init) => client.fetch(input, init)));
			const result = await transport.download({ host: 'fixture.test', accountId: 'test' }, 'token', {
				url, maximumBytes: 32, timeout: 2000,
			}, new AbortController().signal);
			await closed.p;
			assert.deepStrictEqual({ text: result.text, bytes: result.bytesRead, truncated: result.truncated }, {
				text: 'x'.repeat(32), bytes: 32, truncated: true,
			});
		});
	});

	nodeTest('aborts a pending body read and closes the origin connection', async () => {
		const closed = new DeferredPromise<void>();
		await withServer((request, response) => {
			request.socket.once('close', () => void closed.complete());
			response.writeHead(200);
			response.write('first');
		}, async url => {
			const controller = new AbortController();
			const response = await createClient(createService()).fetch(url, { signal: controller.signal });
			const reader = response.body!.getReader();
			try {
				await reader.read();
				const reason = new Error('cancel stalled body');
				const rejected = assert.rejects(reader.read(), error => error === reason);
				controller.abort(reason);
				await rejected;
				await closed.p;
			} finally {
				reader.releaseLock();
			}
		});
	});

	nodeTest('propagates malformed compressed bodies without leaking their content', async () => {
		await withServer((_request, response) => {
			response.writeHead(200, { 'content-encoding': 'gzip' });
			response.end('private response text');
		}, async url => {
			const response = await createClient(createService()).fetch(url);
			await assert.rejects(response.text(), error => error instanceof Error && !error.message.includes('private response text'));
		});
	});
});
