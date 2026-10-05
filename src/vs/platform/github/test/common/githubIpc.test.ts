/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, IReference } from '../../../../base/common/lifecycle.js';
import { ChannelClient, ChannelServer } from '../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { GITHUB_CHANNEL_NAME, GitHubChannel, GitHubChannelClient } from '../../common/githubIpc.js';
import { GitHubService, IGitHubAnonymousClient, IGitHubService } from '../../common/githubService.js';
import { GitHubRequestError, GitHubRequestRateLimitError, GitHubRequestTimeoutError } from '../../common/githubTypes.js';

suite('Shared-process GitHub channel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const request = { apiBaseUri: 'https://api.test', path: '/resource' };

	function connect(service: IGitHubService) {
		const lifetime = store.add(new DisposableStore());
		const clientIncoming = lifetime.add(new Emitter<VSBuffer>());
		const serverIncoming = lifetime.add(new Emitter<VSBuffer>());
		const protocolClient = lifetime.add(new ChannelClient({ onMessage: clientIncoming.event, send: data => serverIncoming.fire(data) }));
		const protocolServer = lifetime.add(new ChannelServer({ onMessage: serverIncoming.event, send: data => clientIncoming.fire(data) }, 'window'));
		protocolServer.registerChannel(GITHUB_CHANNEL_NAME, new GitHubChannel(service, new NullLogService()));
		const channel = protocolClient.getChannel(GITHUB_CHANNEL_NAME);
		return { client: new GitHubChannelClient(channel), channel, lifetime };
	}

	test('uses the shared engine for bounded anonymous reads with serializable result metadata', async () => {
		const requests: Request[] = [];
		const engine = store.add(new GitHubService({
			fetch: async (input, init) => {
				requests.push(new Request(input, init));
				return new Response('{"value":1}', { headers: { etag: '"one"', link: '</next>; rel="next"' } });
			},
		}, new NullLogService(), NullTelemetryService));
		const { client } = connect(engine);
		const result = await client.getAnonymous<{ value: number }>({ ...request, options: { caller: 'github.query', deadline: Date.now() + 10_000 } }, CancellationToken.None);
		assert.deepStrictEqual({
			result: { ...result, observedAt: Number.isFinite(result.observedAt) },
			requests: requests.map(request => ({
				url: request.url, method: request.method, authorization: request.headers.get('authorization'),
				credentials: request.credentials, referrerPolicy: request.referrerPolicy,
			})),
		}, {
			result: { data: { value: 1 }, statusCode: 200, etag: '"one"', finalUrl: 'https://api.test/resource', link: '</next>; rel="next"', observedAt: true },
			requests: [{ url: 'https://api.test/resource', method: 'GET', authorization: null, credentials: 'omit', referrerPolicy: 'no-referrer' }],
		});
	});

	test('does not expose authenticated clients or arbitrary request options', async () => {
		const engine = store.add(new GitHubService({ fetch: async () => assert.fail('no network') }, new NullLogService(), NullTelemetryService));
		const { channel, client } = connect(engine);
		await assert.rejects(channel.call('acquireClient', {}), /Invalid shared-process GitHub request/);
		for (const args of [
			{ ...request, token: 'fixture-token' },
			{ ...request, options: { headers: { authorization: 'Bearer fixture-token' } } },
			{ ...request, options: { method: 'POST' } },
			{ ...request, options: { deadline: 'later' } },
		]) {
			await assert.rejects(channel.call('getAnonymous', args), /Invalid shared-process GitHub request/);
		}
		await assert.rejects(client.getAnonymous({ ...request, apiBaseUri: 'http://api.test' }, CancellationToken.None), { kind: 'validation' });
		await assert.rejects(client.getAnonymous({ apiBaseUri: 'https://api.test/api/v3', path: '/../resource' }, CancellationToken.None), { kind: 'validation' });
	});

	test('the channel does not retain anonymous caches without a binding-owned lease', async () => {
		const etags: (string | null)[] = [];
		const engine = store.add(new GitHubService({
			fetch: async (_input, init) => {
				etags.push(new Headers(init?.headers).get('If-None-Match'));
				return new Response('{"value":1}', { headers: { ETag: '"one"' } });
			},
		}, new NullLogService(), NullTelemetryService));
		const { client } = connect(engine);
		await client.getAnonymous(request, CancellationToken.None);
		await client.getAnonymous(request, CancellationToken.None);
		assert.deepStrictEqual(etags, [null, null]);
	});

	for (const error of [
		new GitHubRequestError('Not found', 'notFound', 404, 'missing', undefined, 'Not Found'),
		new GitHubRequestTimeoutError(true),
		new GitHubRequestRateLimitError(42_000),
	]) {
		test(`round-trips ${error.kind} error semantics and releases the client lease`, async () => {
			let released = 0;
			const service = new class extends mock<IGitHubService>() {
				override acquireAnonymousClient(): IReference<IGitHubAnonymousClient> {
					return {
						object: {
							apiBaseUri: request.apiBaseUri,
							authorization: { kind: 'anonymous' },
							get: async () => { throw error; },
						},
						dispose: () => { released++; },
					};
				}
			}();
			await assert.rejects(connect(service).client.getAnonymous(request, CancellationToken.None), actual => {
				assert.ok(actual instanceof GitHubRequestError);
				assert.deepStrictEqual({
					constructor: actual.constructor, message: actual.message, kind: actual.kind,
					statusCode: actual.statusCode, statusText: actual.statusText, responseBody: actual.responseBody,
					requestDispatched: actual instanceof GitHubRequestTimeoutError ? actual.requestDispatched : undefined,
					retryAfterMs: actual instanceof GitHubRequestRateLimitError ? actual.retryAfterMs : undefined,
				}, {
					constructor: error.constructor, message: error.message, kind: error.kind,
					statusCode: error.statusCode, statusText: error.statusText, responseBody: error.responseBody,
					requestDispatched: error instanceof GitHubRequestTimeoutError ? error.requestDispatched : undefined,
					retryAfterMs: error instanceof GitHubRequestRateLimitError ? error.retryAfterMs : undefined,
				});
				return true;
			});
			assert.strictEqual(released, 1);
		});
	}

	test('propagates cancellation before headers and releases a late response', async () => {
		const started = new DeferredPromise<AbortSignal>();
		const response = new DeferredPromise<Response>();
		const cancelled = new DeferredPromise<void>();
		const engine = store.add(new GitHubService({
			fetch: async (_input, init) => {
				void started.complete(init!.signal!);
				return response.p;
			},
		}, new NullLogService(), NullTelemetryService));
		const { client } = connect(engine);
		const cancellation = store.add(new CancellationTokenSource());
		const rejected = assert.rejects(client.getAnonymous(request, cancellation.token), isCancellationError);
		const signal = await started.p;
		cancellation.cancel();
		await rejected;
		await response.complete(new Response(new ReadableStream({ cancel: () => { void cancelled.complete(); } })));
		await cancelled.p;
		assert.strictEqual(signal.aborted, true);
	});

	test('a disconnect cancels only its waiter, preserving another window sharing the read', async () => {
		const started = new DeferredPromise<AbortSignal>();
		const response = new DeferredPromise<Response>();
		let attempts = 0;
		const engine = store.add(new GitHubService({
			fetch: async (_input, init) => {
				attempts++;
				void started.complete(init!.signal!);
				return response.p;
			},
		}, new NullLogService(), NullTelemetryService));
		const first = connect(engine);
		const second = connect(engine);
		const rejected = assert.rejects(first.client.getAnonymous(request, CancellationToken.None), isCancellationError);
		const pending = second.client.getAnonymous<{ value: number }>(request, CancellationToken.None);
		const signal = await started.p;
		first.lifetime.dispose();
		await rejected;
		const abortedWithPeer = signal.aborted;
		await response.complete(new Response('{"value":1}'));
		const result = await pending;
		assert.deepStrictEqual({ attempts, abortedWithPeer, data: result.data }, { attempts: 1, abortedWithPeer: false, data: { value: 1 } });
	});

	test('rejects an already cancelled call without network access', async () => {
		const engine = store.add(new GitHubService({ fetch: async () => assert.fail('no network') }, new NullLogService(), NullTelemetryService));
		await assert.rejects(connect(engine).client.getAnonymous(request, CancellationToken.Cancelled), isCancellationError);
	});
});
