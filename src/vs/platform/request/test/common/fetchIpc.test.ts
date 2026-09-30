/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { ChannelClient, ChannelServer, IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { FetchChannel, FetchChannelClient } from '../../common/fetchIpc.js';

suite('FetchChannel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createClient(fetchImpl: typeof globalThis.fetch, logService = new NullLogService()): FetchChannelClient {
		const server = store.add(new FetchChannel(fetchImpl, logService));
		return new FetchChannelClient({
			call: (command, arg) => server.call('window', command, arg),
			listen: (event, arg) => server.listen('window', event, arg),
		});
	}

	test('preserves request and response metadata without consuming the body at headers', async () => {
		let observed: Request | undefined;
		let pulls = 0;
		const source = new ReadableStream<Uint8Array>({
			pull: controller => {
				pulls++;
				controller.enqueue(new TextEncoder().encode('response'));
				controller.close();
			},
		}, { highWaterMark: 0 });
		const client = createClient(async (input, init) => {
			observed = new Request(input, init);
			const response = new Response(source, {
				status: 429,
				statusText: 'Too Many Requests',
				headers: { 'retry-after': '3', 'x-ratelimit-remaining': '0', etag: '"validator"', location: 'https://storage.test/?sig=secret' },
			});
			Object.defineProperty(response, 'url', { value: 'https://api.test/resource' });
			return response;
		});
		const response = await client.fetch('https://api.test/resource', {
			method: 'POST',
			headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
			body: '{"value":1}',
			cache: 'no-store',
		});
		const pullsAtHeaders = pulls;
		assert.deepStrictEqual({
			request: observed && {
				url: observed.url, method: observed.method, headers: [...observed.headers],
				body: await observed.text(), redirect: observed.redirect, credentials: observed.credentials, cache: observed.cache,
			},
			response: {
				url: response.url, status: response.status, statusText: response.statusText, headers: [...response.headers],
				body: await response.text(),
			},
			pullsAtHeaders,
			pulls,
			locked: source.locked,
		}, {
			request: {
				url: 'https://api.test/resource', method: 'POST', headers: [['authorization', 'Bearer token'], ['content-type', 'application/json']],
				body: '{"value":1}', redirect: 'manual', credentials: 'omit', cache: 'no-store',
			},
			response: {
				url: 'https://api.test/resource', status: 429, statusText: 'Too Many Requests',
				headers: [['etag', '"validator"'], ['location', 'https://storage.test/?sig=secret'], ['retry-after', '3'], ['x-ratelimit-remaining', '0']],
				body: 'response',
			},
			pullsAtHeaders: 0,
			pulls: 1,
			locked: false,
		});
	});

	test('pulls bounded chunks across the serialized IPC channel and cancels on disconnect', async () => {
		const clientIncoming = store.add(new Emitter<VSBuffer>());
		const serverIncoming = store.add(new Emitter<VSBuffer>());
		const protocolClient = store.add(new ChannelClient({ onMessage: clientIncoming.event, send: data => serverIncoming.fire(data) }));
		const protocolServer = store.add(new ChannelServer({ onMessage: serverIncoming.event, send: data => clientIncoming.fire(data) }, 'window'));
		let signal: AbortSignal | undefined;
		let pulls = 0;
		let cancels = 0;
		const source = new ReadableStream<Uint8Array>({
			pull: controller => {
				pulls++;
				controller.enqueue(new Uint8Array(128 * 1024 + 1));
			},
			cancel: () => { cancels++; },
		}, { highWaterMark: 0 });
		protocolServer.registerChannel('fetch', store.add(new FetchChannel(async (_input, init) => {
			signal = init?.signal ?? undefined;
			return new Response(source);
		}, new NullLogService())));
		const client = new FetchChannelClient(protocolClient.getChannel('fetch'));
		const response = await client.fetch('https://api.test/resource');
		const reader = response.body!.getReader();
		try {
			const first = await reader.read();
			const second = await reader.read();
			protocolServer.dispose();
			await reader.cancel();
			assert.deepStrictEqual({
				sizes: [first.value?.byteLength, second.value?.byteLength],
				pulls, cancels, aborted: signal?.aborted, locked: source.locked,
			}, { sizes: [64 * 1024, 64 * 1024], pulls: 1, cancels: 1, aborted: true, locked: false });
		} finally {
			reader.releaseLock();
		}
	});

	for (const status of [204, 304, 301, 302, 303, 307, 308, 403, 405, 429, 503]) {
		test(`returns HTTP ${status} in one attempt without following redirects or replaying`, async () => {
			let attempts = 0;
			const client = createClient(async (_input, init) => {
				attempts++;
				assert.strictEqual(init?.redirect, 'manual');
				return new Response(null, { status, headers: { location: 'https://elsewhere.test/?signed=secret' } });
			});
			const response = await client.fetch('https://api.test/resource', { method: 'POST', body: '{}' });
			assert.deepStrictEqual({ attempts, status: response.status, body: response.body }, { attempts: 1, status, body: null });
		});
	}

	test('rejects a pre-aborted request before invoking the executor', async () => {
		let attempts = 0;
		const client = createClient(async () => {
			attempts++;
			return new Response();
		});
		const reason = new Error('cancel before headers');
		await assert.rejects(client.fetch('https://api.test', { signal: AbortSignal.abort(reason) }), error => error === reason);
		assert.strictEqual(attempts, 0);
	});

	test('aborts before headers and cancels a late response', async () => {
		const started = new DeferredPromise<AbortSignal>();
		const result = new DeferredPromise<Response>();
		let cancelled = false;
		const source = new ReadableStream({ cancel: () => { cancelled = true; } });
		const client = createClient(async (_input, init) => {
			void started.complete(init!.signal!);
			return result.p;
		});
		const controller = new AbortController();
		const pending = client.fetch('https://api.test', { signal: controller.signal });
		const reason = new Error('cancel waiting for headers');
		const rejected = assert.rejects(pending, error => error === reason);
		const signal = await started.p;
		controller.abort(reason);
		await rejected;
		await result.complete(new Response(source));
		await Promise.resolve();
		assert.deepStrictEqual({ aborted: signal.aborted, cancelled, locked: source.locked }, { aborted: true, cancelled: true, locked: false });
	});

	test('aborts a pending body read even when source cancellation does not settle', async () => {
		const reading = new DeferredPromise<void>();
		let signal: AbortSignal | undefined;
		let cancelled = false;
		const source = new ReadableStream<Uint8Array>({
			pull: () => { void reading.complete(); },
			cancel: () => {
				cancelled = true;
				return new Promise<void>(() => { });
			},
		}, { highWaterMark: 0 });
		const client = createClient(async (_input, init) => {
			signal = init?.signal ?? undefined;
			return new Response(source);
		});
		const controller = new AbortController();
		const response = await client.fetch('https://api.test', { signal: controller.signal });
		const reason = new Error('cancel body');
		const reader = response.body!.getReader();
		try {
			const rejected = assert.rejects(reader.read(), error => error === reason);
			await reading.p;
			controller.abort(reason);
			await rejected;
		} finally {
			reader.releaseLock();
		}
		assert.deepStrictEqual({ aborted: signal?.aborted, cancelled, locked: source.locked }, { aborted: true, cancelled: true, locked: false });
	});

	test('body cancellation aborts the wire request without reading more data', async () => {
		let signal: AbortSignal | undefined;
		let pulls = 0;
		const client = createClient(async (_input, init) => {
			signal = init?.signal ?? undefined;
			return new Response(new ReadableStream({ pull: () => { pulls++; } }, { highWaterMark: 0 }));
		});
		const response = await client.fetch('https://api.test');
		await response.body!.cancel();
		assert.deepStrictEqual({ aborted: signal?.aborted, pulls }, { aborted: true, pulls: 0 });
	});

	for (const phase of ['headers', 'body'] as const) {
		test(`sanitizes ${phase} errors and logs without retrying`, async () => {
			const logs: string[] = [];
			const logService = new class extends NullLogService {
				override debug(message: string): void { logs.push(message); }
			}();
			let attempts = 0;
			const error = new Error('net::ERR_CERT_AUTHORITY_INVALID https://private.test/path?sig=secret Authorization: Bearer token');
			const client = createClient(async () => {
				attempts++;
				if (phase === 'headers') {
					throw error;
				}
				return new Response(new ReadableStream({ pull: controller => controller.error(error) }, { highWaterMark: 0 }));
			}, logService);
			await assert.rejects(async () => {
				const response = await client.fetch('https://api.test/?sig=secret');
				const reader = response.body!.getReader();
				try {
					await reader.read();
				} finally {
					reader.releaseLock();
				}
			}, { message: 'Network fetch failed (ERR_CERT_AUTHORITY_INVALID)' });
			assert.deepStrictEqual({ attempts, logs }, { attempts: 1, logs: ['Network fetch failed (ERR_CERT_AUTHORITY_INVALID)'] });
		});
	}

	test('does not allow another IPC client to read a response body', async () => {
		const server = store.add(new FetchChannel(async () => new Response('private'), new NullLogService()));
		const subscription = store.add(server.listen('owner', 'request', {
			id: 'request-id', url: 'https://api.test', method: 'GET', headers: [], cache: 'no-store',
		})(() => { }));
		await assert.rejects(server.call('other', 'read', 'request-id'), /Invalid fetch body read/);
		subscription.dispose();
	});

	test('sanitizes nested Node errors and bounded cyclic causes', async () => {
		const nested = new TypeError('fetch failed: https://private.test/?sig=secret', {
			cause: Object.assign(new Error('private-token'), { code: 'ECONNRESET' }),
		});
		const cyclic = new Error('private-token');
		cyclic.cause = cyclic;
		for (const [error, message] of [
			[nested, 'Network fetch failed (ECONNRESET)'],
			[cyclic, 'Network fetch failed (unknown)'],
		] as const) {
			const client = createClient(async () => { throw error; });
			await assert.rejects(client.fetch('https://api.test/?sig=secret'), { message });
		}
	});

	test('rejects non-network URLs without invoking the executor', async () => {
		const client = createClient(async () => assert.fail('executor must not run'));
		await assert.rejects(client.fetch('file:///private'), /HTTP\(S\)/);
	});

	test('cleans up a failed subscription', async () => {
		const channel: IChannel = {
			call: async () => assert.fail('no body reads'),
			listen: () => { throw new Error('connection failed'); },
		};
		await assert.rejects(new FetchChannelClient(channel).fetch('https://api.test'), /Fetch connection failed/);
	});
});
