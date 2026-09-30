/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { FetchChannel, FetchChannelClient } from '../../../request/common/fetchIpc.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';

const account = { host: 'api.test', accountId: 'account' };

suite('GitHub platform fetch binding', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTransport(fetchImpl: typeof globalThis.fetch, scheduler?: FakeGitHubScheduler, logService = new NullLogService()): GitHubTransport {
		const channel = store.add(new FetchChannel(fetchImpl, logService));
		const client = new FetchChannelClient({
			call: (command, arg) => channel.call('window', command, arg),
			listen: (event, arg) => channel.listen('window', event, arg),
		});
		return store.add(new GitHubTransport((input, init) => client.fetch(input, init), scheduler, false, logService));
	}

	test('preserves authenticated redirect handling, byte limits, cancellation and log privacy', async () => {
		const requests: { origin: string; authorization: string | null }[] = [];
		const logs: string[] = [];
		let cancelled = 0;
		let pulls = 0;
		const logService = new class extends NullLogService {
			override trace(message: string): void { logs.push(message); }
			override debug(message: string): void { logs.push(message); }
		}();
		const transport = createTransport(async (input, init) => {
			requests.push({ origin: new URL(String(input)).origin, authorization: new Headers(init?.headers).get('authorization') });
			if (requests.length === 1) {
				return new Response(new ReadableStream<Uint8Array>({ cancel: () => { cancelled++; } }, { highWaterMark: 0 }), {
					status: 302, headers: { location: 'https://storage.test/private-path?sig=private-signature' },
				});
			}
			return new Response(new ReadableStream<Uint8Array>({
				pull: controller => {
					pulls++;
					controller.enqueue(new TextEncoder().encode('abcdef'));
				},
				cancel: () => { cancelled++; },
			}, { highWaterMark: 0 }));
		}, undefined, logService);
		const result = await transport.download(account, 'token', {
			url: 'https://api.test/log', maximumBytes: 3, timeout: 1000,
		}, new AbortController().signal);
		assert.deepStrictEqual({
			requests, cancelled, pulls, text: result.text, bytesRead: result.bytesRead, truncated: result.truncated,
			privateLogs: logs.filter(line => /private-path|private-signature|Bearer token/.test(line)),
		}, {
			requests: [{ origin: 'https://api.test', authorization: 'Bearer token' }, { origin: 'https://storage.test', authorization: null }],
			cancelled: 2, pulls: 1, text: 'abc', bytesRead: 3, truncated: true, privateLogs: [],
		});
	});

	for (const mode of ['cancel', 'timeout'] as const) {
		test(`preserves download ${mode} during a stalled body read`, async () => {
			const scheduler = store.add(new FakeGitHubScheduler());
			const reading = new DeferredPromise<void>();
			let wireSignal: AbortSignal | undefined;
			let cancelled = 0;
			const transport = createTransport(async (_input, init) => {
				wireSignal = init?.signal ?? undefined;
				return new Response(new ReadableStream<Uint8Array>({
					pull: () => { void reading.complete(); },
					cancel: () => {
						cancelled++;
						return new Promise<void>(() => { });
					},
				}, { highWaterMark: 0 }));
			}, scheduler);
			const controller = new AbortController();
			const reason = new Error('cancel download');
			const pending = transport.download(account, 'token', { url: 'https://api.test/log', maximumBytes: 3, timeout: 1000 }, controller.signal);
			const rejected = assert.rejects(pending, mode === 'cancel' ? error => error === reason : /GitHub download timed out/);
			await reading.p;
			if (mode === 'cancel') {
				controller.abort(reason);
			} else {
				scheduler.advanceBy(1000);
			}
			await rejected;
			assert.deepStrictEqual({ cancelled, aborted: wireSignal?.aborted, timers: scheduler.pendingCount }, { cancelled: 1, aborted: true, timers: 0 });
		});
	}

	test('only the engine retries reads and discards redirect and retry bodies', async () => {
		let attempts = 0;
		let cancelled = 0;
		const transport = createTransport(async () => {
			attempts++;
			if (attempts < 3) {
				return new Response(new ReadableStream<Uint8Array>({
					cancel: () => {
						cancelled++;
						return new Promise<void>(() => { });
					},
				}, { highWaterMark: 0 }), { status: attempts === 1 ? 302 : 503, headers: { location: '/moved' } });
			}
			return new Response('{"ok":true}');
		});
		const result = await transport.rest(account, 'token', { method: 'GET', url: 'https://api.test/resource' }, new AbortController().signal);
		assert.deepStrictEqual({ data: result.data, attempts, cancelled }, { data: { ok: true }, attempts: 3, cancelled: 2 });
	});

	test('cancels a REST redirect before rejecting a changed origin', async () => {
		let cancelled = 0;
		let attempts = 0;
		const transport = createTransport(async () => {
			attempts++;
			return new Response(new ReadableStream({ cancel: () => { cancelled++; } }), {
				status: 302, headers: { location: 'https://other.test' },
			});
		});
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: 'https://api.test/resource' }, new AbortController().signal), /GitHub redirect changed origin/);
		assert.deepStrictEqual({ attempts, cancelled }, { attempts: 1, cancelled: 1 });
	});

	test('never replays a failed mutation', async () => {
		let attempts = 0;
		const transport = createTransport(async () => {
			attempts++;
			throw new Error('net::ERR_CONNECTION_RESET');
		});
		await assert.rejects(transport.rest(account, 'token', { method: 'POST', url: 'https://api.test/resource', body: {} }, new AbortController().signal), /GitHub network request failed/);
		assert.strictEqual(attempts, 1);
	});

	test('preserves coalescing and ETag revalidation', async () => {
		const validators: (string | null)[] = [];
		const transport = createTransport(async (_input, init) => {
			const validator = new Headers(init?.headers).get('if-none-match');
			validators.push(validator);
			return validator ? new Response(null, { status: 304, headers: { etag: '"v1"' } })
				: new Response('{"value":1}', { headers: { etag: '"v1"' } });
		});
		const request = { method: 'GET' as const, url: 'https://api.test/resource' };
		const [first, shared] = await Promise.all([
			transport.rest(account, 'token', request, new AbortController().signal),
			transport.rest(account, 'token', request, new AbortController().signal),
		]);
		const revalidated = await transport.rest(account, 'token', request, new AbortController().signal);
		assert.deepStrictEqual({
			data: [first.data, shared.data, revalidated.data], status: revalidated.statusCode, validators,
		}, { data: [{ value: 1 }, { value: 1 }, { value: 1 }], status: 304, validators: [null, '"v1"'] });
	});
});
