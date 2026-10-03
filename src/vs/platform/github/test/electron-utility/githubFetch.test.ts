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
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { INativeHostService } from '../../../native/common/native.js';
import { GitHubRequestError, GitHubTransport } from '../../common/githubTransport.js';
import { createFetch } from '../../electron-utility/githubFetch.js';

suite('GitHub createFetch (shared process)', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const nodeTest = process.type === 'renderer' ? test.skip : test;

	type FetchNetwork = Pick<INativeHostService, 'resolveProxyForUtilityProcess' | 'lookupAuthorization' | 'lookupKerberosAuthorization' | 'loadCertificates'>;

	function createTestFetch(fetch?: typeof globalThis.fetch, overrides?: Partial<FetchNetwork>, values?: Record<string, unknown>, log = new NullLogService()) {
		const configuration = new TestConfigurationService({ 'http.systemCertificates': false, ...values });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const nativeHost = new class extends mock<INativeHostService>() {
			override readonly resolveProxyForUtilityProcess = overrides?.resolveProxyForUtilityProcess ?? (async () => 'DIRECT');
			override readonly lookupAuthorization = overrides?.lookupAuthorization ?? (async () => undefined);
			override readonly lookupKerberosAuthorization = overrides?.lookupKerberosAuthorization ?? (async () => undefined);
			override readonly loadCertificates = overrides?.loadCertificates ?? (async () => []);
		}();
		return createFetch(nativeHost, configuration, log, {}, fetch);
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

	test('uses host proxy resolution without logging URLs or credentials', async () => {
		const resolved: string[] = [];
		const requests: Request[] = [];
		const logs: string[] = [];
		const fetch = createTestFetch(async (input, init) => {
			requests.push(new Request(input, init));
			return new Response(null, { status: 302, headers: { location: 'https://storage.test/?sig=fixture-secret' } });
		}, {
			resolveProxyForUtilityProcess: async url => {
				resolved.push(url);
				return 'PROXY proxy-user:proxy-password@proxy.test:8080';
			},
		}, undefined, new class extends NullLogService {
			override trace(message: string): void { logs.push(message); }
			override debug(message: string): void { logs.push(message); }
		}());
		const response = await fetch('https://api.test/private-path?sig=fixture-secret', { headers: { authorization: 'Bearer fixture-token' }, cache: 'no-store' });
		assert.deepStrictEqual({
			resolved, status: response.status, location: response.headers.get('location'),
			requests: requests.map(request => ({
				redirect: request.redirect, credentials: request.credentials, cache: request.cache, authorization: request.headers.get('authorization'),
			})),
			privateLogs: logs.filter(line => /private-path|fixture-secret|proxy-password|fixture-token/.test(line)),
		}, {
			resolved: ['https://api.test/private-path?sig=fixture-secret'], status: 302, location: 'https://storage.test/?sig=fixture-secret',
			requests: [{ redirect: 'manual', credentials: 'omit', cache: 'no-store', authorization: 'Bearer fixture-token' }], privateLogs: [],
		});
	});

	test('uses configured proxy and bypass rules before host resolution', async () => {
		let resolutions = 0;
		let attempts = 0;
		const fetch = createTestFetch(async () => {
			attempts++;
			return new Response();
		}, {
			resolveProxyForUtilityProcess: async () => {
				resolutions++;
				return 'DIRECT';
			},
		}, { 'http.proxy': 'http://proxy.test:8080', 'http.noProxy': ['bypass.test'] });
		await fetch('https://api.test/resource');
		await fetch('https://bypass.test/resource');
		assert.deepStrictEqual({ resolutions, attempts }, { resolutions: 0, attempts: 2 });
	});

	test('loads additional host certificates only when enabled', async () => {
		const loads: boolean[] = [];
		for (const enabled of [false, true]) {
			const fetch = createTestFetch(async () => new Response(), {
				loadCertificates: async () => {
					loads.push(enabled);
					return [];
				},
			}, { 'http.systemCertificates': enabled });
			await fetch('https://api.test/resource');
		}
		assert.deepStrictEqual(loads, [true]);
	});

	test('invalidates system proxy routing after network interfaces change', async () => {
		const networkInterfaces = stub(os, 'networkInterfaces');
		const network = (address: string): NodeJS.Dict<os.NetworkInterfaceInfo[]> => ({
			fixture: [{ address, netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: `${address}/24` }],
		});
		networkInterfaces.onFirstCall().returns(network('192.0.2.1'));
		networkInterfaces.returns(network('192.0.2.2'));
		let resolutions = 0;
		const fetch = createTestFetch(async () => new Response(), {
			resolveProxyForUtilityProcess: async () => ++resolutions === 1 ? 'DIRECT' : 'PROXY proxy.test:8080',
		}, { 'http.experimental.networkInterfaceCheckInterval': 0 });
		try {
			await fetch('https://api.test/resource');
			await fetch('https://api.test/resource');
			assert.deepStrictEqual({ resolutions, snapshots: networkInterfaces.callCount }, { resolutions: 2, snapshots: 2 });
		} finally {
			networkInterfaces.restore();
		}
	});

	test('does not dispatch when initialization is cancelled', async () => {
		let attempts = 0;
		const fetch = createTestFetch(async () => {
			attempts++;
			return new Response();
		});
		const controller = new AbortController();
		const reason = new Error('cancel initialization');
		const pending = fetch('https://api.test', { signal: controller.signal });
		controller.abort(reason);
		await assert.rejects(pending, error => error === reason);
		assert.strictEqual(attempts, 0);
	});

	test('retains cancellation through asynchronous proxy resolution', async () => {
		const resolving = new DeferredPromise<void>();
		const resolved = new DeferredPromise<string>();
		let aborted = false;
		const fetch = createTestFetch(async input => {
			assert.ok(input instanceof Request);
			aborted = input.signal.aborted;
			input.signal.throwIfAborted();
			return new Response();
		}, {
			resolveProxyForUtilityProcess: async () => {
				void resolving.complete();
				return resolved.p;
			},
		});
		const controller = new AbortController();
		const reason = new Error('cancel proxy resolution');
		const rejected = assert.rejects(fetch('https://api.test', { signal: controller.signal }), error => error === reason);
		await resolving.p;
		controller.abort(reason);
		await resolved.complete('DIRECT');
		await rejected;
		assert.strictEqual(aborted, true);
	});

	test('does not add retries when the underlying fetch rejects', async () => {
		let attempts = 0;
		const error = new TypeError('fetch failed');
		const fetch = createTestFetch(async () => {
			attempts++;
			throw error;
		});
		await assert.rejects(fetch('https://api.test/resource'), actual => actual === error);
		assert.strictEqual(attempts, 1);
	});

	for (const method of ['GET', 'POST'] as const) {
		nodeTest(`preserves standard fetch recovery from HTTP 421 for ${method}`, async () => {
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
				const fetch = createTestFetch();
				await (await fetch(`${url}/warm`)).text();
				const response = await fetch(`${url}/resource`, { method, body: method === 'POST' ? '{"value":1}' : undefined });
				assert.deepStrictEqual({
					status: response.status, retryAfter: response.headers.get('retry-after'), body: await response.text(), requests,
				}, {
					status: 200, retryAfter: '7', body: 'first response', requests: Array.from({ length: 2 }, () => ({ method, body: method === 'POST' ? '{"value":1}' : '' })),
				});
			});
		});
	}

	for (const configured of [false, true]) {
		nodeTest(`keeps ${configured ? 'configured' : 'host'} proxy authentication separate from one origin POST`, async () => {
			const { createServer } = await import('http');
			const { connect } = await import('net');
			const originRequests: { method: string | undefined; body: string; authorization: string | undefined; proxyAuthorization: string | undefined }[] = [];
			const proxyRequests: (string | undefined)[] = [];
			const authorization = `Basic ${Buffer.from('fixture-user:fixture-password').toString('base64')}`;
			let lookups = 0;
			await withServer(async (request, response) => {
				let body = '';
				for await (const chunk of request) {
					body += chunk;
				}
				originRequests.push({ method: request.method, body, authorization: request.headers.authorization, proxyAuthorization: request.headers['proxy-authorization'] });
				response.writeHead(403);
				response.end('forbidden');
			}, async origin => {
				const proxy = createServer();
				const sockets = new Set<Duplex>();
				proxy.on('connect', (request, downstream, head) => {
					sockets.add(downstream);
					downstream.once('close', () => sockets.delete(downstream));
					proxyRequests.push(request.headers['proxy-authorization']);
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
				const fetch = createTestFetch(undefined, {
					lookupAuthorization: async () => {
						lookups++;
						return { username: 'fixture-user', password: 'fixture-password' };
					},
				}, { 'http.proxy': `http://127.0.0.1:${address.port}`, 'http.proxyAuthorization': configured ? authorization : undefined });
				try {
					const transport = store.add(new GitHubTransport(fetch));
					await assert.rejects(transport.rest({ host: 'fixture.test', accountId: 'test' }, 'origin-token', {
						method: 'POST', url: `http://origin.fixture.test:${new URL(origin).port}/resource`, body: { value: 1 },
					}, new AbortController().signal), error => error instanceof GitHubRequestError && error.statusCode === 403);
					assert.deepStrictEqual({ lookups, proxyRequests, originRequests }, {
						lookups: configured ? 0 : 1,
						proxyRequests: configured ? [authorization] : [undefined, authorization],
						originRequests: [{ method: 'POST', body: '{"value":1}', authorization: 'Bearer origin-token', proxyAuthorization: undefined }],
					});
				} finally {
					for (const socket of sockets) {
						socket.destroy();
					}
					await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve()));
				}
			});
		});
	}

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
					const response = await createTestFetch()(url);
					assert.deepStrictEqual({
						status: response.status, text: await response.text(),
						retryAfter: response.headers.get('retry-after'), remaining: response.headers.get('x-ratelimit-remaining'),
					}, { status, text, retryAfter: '3', remaining: '0' });
				});
			});
		}
	}

	nodeTest('retains null-body responses and does not follow redirects or add ambient credentials', async () => {
		const requests: { url: string | undefined; authorization: string | undefined; cookie: string | undefined }[] = [];
		await withServer((request, response) => {
			requests.push({ url: request.url, authorization: request.headers.authorization, cookie: request.headers.cookie });
			response.writeHead(Number(request.url!.slice(1)), { location: '/followed', etag: '"one"' });
			response.end();
		}, async url => {
			const fetch = createTestFetch();
			const results = [];
			for (const status of [204, 205, 304, 302]) {
				const response = await fetch(`${url}/${status}`, { credentials: 'include', redirect: 'follow' });
				results.push({ status: response.status, text: await response.text(), etag: response.headers.get('etag') });
			}
			const head = await fetch(`${url}/200`, { method: 'HEAD' });
			assert.deepStrictEqual({ results, headBody: head.body, requests }, {
				results: [204, 205, 304, 302].map(status => ({ status, text: '', etag: '"one"' })),
				headBody: null,
				requests: [204, 205, 304, 302, 200].map(status => ({ url: `/${status}`, authorization: undefined, cookie: undefined })),
			});
		});
	});

	nodeTest('enforces decoded-byte limits and cancels a compressed response before EOF', async () => {
		const { gzipSync } = await import('zlib');
		const closed = new DeferredPromise<void>();
		await withServer((request, response) => {
			request.socket.once('close', () => void closed.complete());
			response.writeHead(200, { 'content-encoding': 'gzip' });
			response.write(gzipSync('x'.repeat(1024 * 1024)));
		}, async url => {
			const transport = store.add(new GitHubTransport(createTestFetch(), undefined, true));
			const result = await transport.download({ host: 'fixture.test', accountId: 'test' }, 'token', {
				url, maximumBytes: 32, timeout: 2000,
			}, new AbortController().signal);
			await closed.p;
			assert.deepStrictEqual({ text: result.text, bytes: result.bytesRead, truncated: result.truncated }, {
				text: 'x'.repeat(32), bytes: 32, truncated: true,
			});
		});
	});

	nodeTest('aborts a pending read and closes the origin connection', async () => {
		const closed = new DeferredPromise<void>();
		await withServer((request, response) => {
			request.socket.once('close', () => void closed.complete());
			response.writeHead(200);
			response.write('first');
		}, async url => {
			const controller = new AbortController();
			const response = await createTestFetch()(url, { signal: controller.signal });
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
			const response = await createTestFetch()(url);
			await assert.rejects(response.text(), error => error instanceof Error && !error.message.includes('private response text'));
		});
	});
});
