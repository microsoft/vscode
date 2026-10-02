/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as copilotApi from '@vscode/copilot-api';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubService } from '../../../github/common/githubService.js';
import { GitHubFetch } from '../../../github/common/githubTypes.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { CopilotApiError, CopilotApiService, ICopilotApiServiceOptions } from '../../common/copilotApiService.js';

suite('Copilot discovery and control', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const githubOrigin = 'https://api.github.com';
	const capiOrigin = 'https://api.githubcopilot.com';
	const user = (api = capiOrigin) => Response.json({ endpoints: { api }, access_type_sku: 'test-sku' });
	const models = (id = 'test-model') => Response.json({ object: 'list', data: [{ id }] });

	function create(fetch: GitHubFetch, options: Partial<ICopilotApiServiceOptions> = {}) {
		const log = new NullLogService();
		const github = store.add(new GitHubService({
			fetch, credentialProvider: { onDidChange: Event.None, getToken: () => { throw new Error('Unexpected credential lookup'); } },
		}, log, NullTelemetryService));
		const service = store.add(new CopilotApiService({
			api: copilotApi,
			fetch,
			endpoints: { onDidChange: Event.None, getApiBaseUri: () => githubOrigin, getEnterpriseUri: () => undefined },
			getExtensionInformation: async () => ({
				name: 'test', sessionId: 'test-session', machineId: 'test-machine', deviceId: 'test-device',
				vscodeVersion: '1.0.0', version: '1.0.0', buildType: 'dev',
			}),
			...options,
		}, log, github));
		return { service, github };
	}

	test('discovers and lists models with the supplied token and no /user lookup', async () => {
		const requests: { path: string; authorization: string | null; credentials: RequestCredentials | undefined }[] = [];
		const { service } = create(async (input, init) => {
			const path = new URL(String(input)).pathname;
			requests.push({ path, authorization: new Headers(init?.headers).get('Authorization'), credentials: init?.credentials });
			return path === '/copilot_internal/user' ? user() : models();
		});
		const result = await service.models('pending-token');
		assert.deepStrictEqual({ requests, ids: result.map(model => model.id) }, {
			requests: [
				{ path: '/copilot_internal/user', authorization: 'Bearer pending-token', credentials: 'omit' },
				{ path: '/models', authorization: 'Bearer pending-token', credentials: 'omit' },
			],
			ids: ['test-model'],
		});
	});

	for (const phase of ['discovery', 'models'] as const) {
		test(`cancelling one ${phase} waiter preserves a coalesced peer`, async () => {
			const started = new DeferredPromise<AbortSignal>();
			const response = new DeferredPromise<Response>();
			const requests: string[] = [];
			const { service } = create(async (input, init) => {
				const path = new URL(String(input)).pathname;
				requests.push(path);
				if (path === (phase === 'discovery' ? '/copilot_internal/user' : '/models')) {
					assert.ok(init?.signal);
					void started.complete(init.signal);
					return response.p;
				}
				return path === '/copilot_internal/user' ? user() : models();
			});
			const controller = new AbortController();
			const first = service.models('token', { signal: controller.signal });
			const peer = service.models('token');
			const active = await started.p;
			const reason = new Error('Caller cancelled');
			controller.abort(reason);
			await assert.rejects(first, error => error === reason);
			assert.strictEqual(active.aborted, false);
			await response.complete(phase === 'discovery' ? user() : models());
			const result = await peer;
			assert.deepStrictEqual({ requests, ids: result.map(model => model.id) }, {
				requests: ['/copilot_internal/user', '/models'], ids: ['test-model'],
			});
		});
	}

	test('representation-changing integration options do not coalesce model catalogs', async () => {
		const headers: (string | null)[] = [];
		const { service } = create(async (input, init) => {
			if (new URL(String(input)).pathname === '/copilot_internal/user') {
				return user();
			}
			headers.push(new Headers(init?.headers).get('Copilot-Integration-Id'));
			return models(String(headers.length));
		});
		const results = await Promise.all([
			service.models('token', { headers: { 'User-Agent': 'caller' } }),
			service.models('token', { headers: { 'user-agent': 'caller' } }),
			service.models('token', { headers: { 'User-Agent': 'caller' }, suppressIntegrationId: true }),
		]);
		assert.deepStrictEqual({ requests: headers.length, ids: results.map(result => result[0].id) }, {
			requests: 2, ids: ['1', '1', '2'],
		});
	});

	test('endpoint changes cancel pending discovery and cannot install its late response', async () => {
		const changed = store.add(new Emitter<void>());
		const started = new DeferredPromise<void>();
		const oldResponse = new DeferredPromise<Response>();
		let api = githubOrigin;
		const requests: string[] = [];
		const { service } = create(async input => {
			const url = String(input);
			requests.push(url);
			if (url === `${githubOrigin}/copilot_internal/user`) {
				void started.complete();
				return oldResponse.p;
			}
			return url.endsWith('/copilot_internal/user') ? user('https://new-capi.example.test') : models('current');
		}, {
			endpoints: { onDidChange: changed.event, getApiBaseUri: () => api, getEnterpriseUri: () => undefined },
		});
		const previous = service.models('token');
		await started.p;
		api = 'https://api.enterprise.example.test';
		changed.fire();
		await assert.rejects(previous);
		const current = await service.models('token');
		await oldResponse.complete(user('https://old-capi.example.test'));
		await timeout(0);
		assert.deepStrictEqual({ requests, ids: current.map(model => model.id), endpoint: await service.resolveApiEndpoint('token') }, {
			requests: [`${githubOrigin}/copilot_internal/user`, `${api}/copilot_internal/user`, 'https://new-capi.example.test/models'],
			ids: ['current'], endpoint: 'https://new-capi.example.test',
		});
	});

	test('a deadline includes shared discovery and prevents a late catalog request', () => runWithFakedTimers({}, async () => {
		const response = new DeferredPromise<Response>();
		const requests: string[] = [];
		let active: AbortSignal | null | undefined;
		const { service } = create(async (input, init) => {
			requests.push(new URL(String(input)).pathname);
			active = init?.signal;
			return response.p;
		});
		const pending = assert.rejects(service.models('token', { deadline: Date.now() + 100 }), { kind: 'timeout' });
		await timeout(100);
		await pending;
		await response.complete(user());
		await timeout(0);
		assert.deepStrictEqual({ requests, aborted: active?.aborted }, { requests: ['/copilot_internal/user'], aborted: true });
	}));

	test('caller cancellation while host metadata is pending prevents network dispatch', async () => {
		const metadata = new DeferredPromise<void>();
		let calls = 0;
		const { service } = create(async () => { calls++; return user(); }, {
			getExtensionInformation: async () => {
				await metadata.p;
				return { name: 'test', sessionId: '', machineId: '', deviceId: '', vscodeVersion: '1', version: '1', buildType: 'dev' };
			},
		});
		const controller = new AbortController();
		const pending = service.models('token', { signal: controller.signal });
		controller.abort(new Error('Cancelled before metadata'));
		await assert.rejects(pending, /Cancelled before metadata/);
		await metadata.complete();
		await timeout(0);
		assert.strictEqual(calls, 0);
	});

	for (const retryAfter of ['2', 'http-date'] as const) {
		test(`CAPI cooldowns honor ${retryAfter} without parking GitHub or another known account`, () => runWithFakedTimers({}, async () => {
			const attempts: { token: string | null; at: number }[] = [];
			const { service, github } = create(async (input, init) => {
				const url = new URL(String(input));
				if (url.pathname === '/copilot_internal/user') {
					return user();
				}
				if (url.hostname === 'api.github.com') {
					return Response.json({ public: true });
				}
				const token = new Headers(init?.headers).get('Authorization');
				attempts.push({ token, at: Date.now() });
				return attempts.length === 1
					? Response.json({ error: { code: 'user_global_rate_limited', message: 'limited' } }, {
						status: 429, headers: { 'Retry-After': retryAfter === '2' ? '2' : new Date(Date.now() + 2_000).toUTCString() },
					})
					: models();
			}, { getAccountId: token => token === 'first' ? '101' : '202' });
			await assert.rejects(service.models('first'), { status: 429, code: 'user_global_rate_limited' });
			await service.models('second');
			const publicClient = store.add(github.acquireAnonymousClient({ apiBaseUri: githubOrigin })).object;
			await publicClient.get('/public', new AbortController().signal);
			const resumed = service.models('first');
			await timeout(1);
			assert.strictEqual(attempts.length, 2);
			await resumed;
			assert.deepStrictEqual(attempts.map(attempt => attempt.token), ['Bearer first', 'Bearer second', 'Bearer first']);
			assert.ok(attempts[2].at - attempts[0].at >= (retryAfter === '2' ? 2_000 : 1_000));
		}));
	}

	test('quota exhaustion keeps the CAPI error code and does not replay', async () => {
		let attempts = 0;
		const { service } = create(async input => {
			if (new URL(String(input)).pathname === '/copilot_internal/user') {
				return user();
			}
			attempts++;
			return Response.json({ error: { code: 'quota_exceeded', message: 'quota' } }, { status: 402 });
		});
		await assert.rejects(service.models('token'), error => error instanceof CopilotApiError && error.status === 402 && error.code === 'quota_exceeded');
		assert.strictEqual(attempts, 1);
	});

	test('transient catalog failures retry once but inference POSTs are never replayed', async () => {
		const requests: string[] = [];
		let modelAttempts = 0;
		const { service } = create(async input => {
			const path = new URL(String(input)).pathname;
			requests.push(path);
			if (path === '/copilot_internal/user') {
				return user();
			}
			if (path === '/models') {
				return ++modelAttempts === 1 ? new Response('unavailable', { status: 503 }) : models();
			}
			return new Response('unavailable', { status: 503 });
		});
		await service.models('token');
		await assert.rejects(service.responses('token', '{"model":"test"}'), { status: 503 });
		assert.deepStrictEqual(requests, ['/copilot_internal/user', '/models', '/models', '/responses']);
	});

	test('bounds model response bodies and cancels the discarded stream', async () => {
		let cancelled = false;
		const { service } = create(async input => new URL(String(input)).pathname === '/copilot_internal/user' ? user()
			: new Response(new ReadableStream<Uint8Array>({
				start: controller => controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1)),
				cancel: () => { cancelled = true; },
			})));
		await assert.rejects(service.models('token'), { kind: 'responseTooLarge' });
		assert.strictEqual(cancelled, true);
	});

	test('releases discovery and invalidates captured SKU when the service is disposed', async () => {
		const started = new DeferredPromise<void>();
		const gate = new DeferredPromise<Response>();
		let active: AbortSignal | null | undefined;
		const { service } = create(async (_input, init) => {
			active = init?.signal;
			void started.complete();
			return gate.p;
		});
		const readSku = service.captureCopilotSku('token');
		const pending = service.models('token');
		await started.p;
		service.dispose();
		await assert.rejects(pending);
		await gate.complete(user());
		assert.deepStrictEqual({ aborted: active?.aborted, sku: readSku() }, { aborted: true, sku: undefined });
	});

	test('expires cached payloads while a captured SKU reader follows same-credential refresh', () => runWithFakedTimers({}, async () => {
		let discoveries = 0;
		const { service } = create(async () => { discoveries++; return user(); });
		const readSku = service.captureCopilotSku('token');
		await service.resolveCopilotSku('token');
		assert.strictEqual(readSku(), 'test-sku');
		await timeout(30 * 60_000 + 1);
		assert.strictEqual(readSku(), undefined);
		await service.resolveCopilotSku('token');
		assert.strictEqual(discoveries, 2);
		assert.strictEqual(readSku(), 'test-sku');
	}));

	test('limits discovery waiters while preserving the admitted shared operation', async () => {
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<Response>();
		let calls = 0;
		const { service } = create(async () => {
			calls++;
			void started.complete();
			return response.p;
		});
		const pending = Array.from({ length: 64 }, () => service.resolveCopilotSku('token'));
		await started.p;
		await assert.rejects(service.resolveCopilotSku('token'), { kind: 'overloaded' });
		await response.complete(user());
		const results = await Promise.all(pending);
		assert.deepStrictEqual({ calls, results: [...new Set(results)] }, { calls: 1, results: ['test-sku'] });
	});

	test('bounds idle captured credential contexts without issuing network requests', async () => {
		let calls = 0;
		const { service } = create(async () => { calls++; return user(); });
		for (let index = 0; index < 64; index++) {
			service.captureCopilotSku(`token-${index}`);
		}
		await assert.rejects(service.resolveCopilotSku('overflow'), { kind: 'overloaded' });
		assert.strictEqual(calls, 0);
	});

	test('cancelled cold discoveries release capacity for new credentials', async () => {
		let calls = 0;
		const { service } = create(async () => { calls++; return user(); }, {
			getExtensionInformation: () => new Promise(() => { }),
		});
		for (let index = 0; index < 70; index++) {
			const controller = new AbortController();
			const reason = new Error('Cancelled cold discovery');
			const pending = service.models(`token-${index}`, { signal: controller.signal });
			controller.abort(reason);
			await assert.rejects(pending, error => error === reason);
		}
		assert.strictEqual(calls, 0);
	});

	test('a stalled model body times out and releases its reader and request slot', () => runWithFakedTimers({}, async () => {
		let cancelled = false;
		let calls = 0;
		const { service } = create(async input => {
			if (String(input).endsWith('/copilot_internal/user')) {
				return user();
			}
			return ++calls === 1 ? new Response(new ReadableStream<Uint8Array>({
				start: controller => controller.enqueue(new TextEncoder().encode('{"data":[')),
				cancel: () => { cancelled = true; },
			})) : models();
		});
		await assert.rejects(service.models('token', { deadline: Date.now() + 100 }), { kind: 'timeout' });
		const result = await service.models('token');
		assert.deepStrictEqual({ cancelled, calls, ids: result.map(model => model.id) }, {
			cancelled: true, calls: 2, ids: ['test-model'],
		});
	}));

	test('rejects unsafe discovered CAPI endpoints before sending the credential to them', async () => {
		const requests: string[] = [];
		const { service } = create(async input => {
			requests.push(String(input));
			return user('http://unsafe.example.test');
		});
		await assert.rejects(service.models('token'), { kind: 'validation' });
		assert.deepStrictEqual(requests, [`${githubOrigin}/copilot_internal/user`]);
	});

	for (const captured of [false, true]) {
		test(`a refresh crossing payload expiry survives and accepts another waiter (captured SKU: ${captured})`, () => runWithFakedTimers({}, async () => {
			let discoveries = 0;
			let active: AbortSignal | null | undefined;
			const { service } = create(async (_input, init) => {
				if (++discoveries === 2) {
					active = init?.signal;
					await timeout(2_000);
				}
				return user();
			});
			if (captured) {
				service.captureCopilotSku('token');
			}
			await service.resolveCopilotSku('token');
			await timeout(30 * 60_000 - 1_000);
			const refresh = service.resolveCopilotSku('token');
			const results = Promise.all([refresh, (async () => {
				await timeout(1_500);
				return service.resolveCopilotSku('token');
			})()]);
			assert.deepStrictEqual(await results, ['test-sku', 'test-sku']);
			assert.deepStrictEqual({ discoveries, aborted: active?.aborted }, { discoveries: 2, aborted: false });
		}));
	}

	for (const phase of ['discovery', 'models'] as const) {
		test(`reports a known ${phase} cooldown promptly when it cannot fit the caller budget`, () => runWithFakedTimers({}, async () => {
			let refusals = 0;
			const { service } = create(async input => {
				if (phase === 'discovery' || !String(input).endsWith('/copilot_internal/user')) {
					refusals++;
					return Response.json({ error: { code: 'user_global_rate_limited', message: 'limited' } }, { status: 429, headers: { 'Retry-After': '60' } });
				}
				return user();
			});
			await assert.rejects(service.models('token'), { status: 429 });
			const start = Date.now();
			await assert.rejects(service.models('token'), { status: 429, code: 'rate_limited' });
			assert.deepStrictEqual({ refusals, elapsed: Date.now() - start }, { refusals: 1, elapsed: 0 });
		}));
	}

	test('newly observed model cooldown rejects only queued waiters whose budgets cannot accommodate it', () => runWithFakedTimers({}, async () => {
		const refusal = new DeferredPromise<Response>();
		const started = new DeferredPromise<void>();
		let modelCalls = 0;
		const { service } = create(async input => {
			if (String(input).endsWith('/copilot_internal/user')) {
				return user();
			}
			if (++modelCalls === 1) {
				void started.complete();
				return refusal.p;
			}
			return models();
		});
		const first = assert.rejects(service.models('token'), { status: 429 });
		await started.p;
		const short = assert.rejects(service.models('token', { headers: { 'User-Agent': 'peer' }, deadline: Date.now() + 100 }), { status: 429, code: 'rate_limited' });
		const long = service.models('token', { headers: { 'User-Agent': 'peer' } });
		await timeout(1);
		const refusedAt = Date.now();
		await refusal.complete(Response.json({ error: { code: 'rate_limited' } }, { status: 429, headers: { 'Retry-After': '2' } }));
		await first;
		await short;
		assert.strictEqual(Date.now(), refusedAt);
		assert.deepStrictEqual((await long).map(model => model.id), ['test-model']);
		assert.deepStrictEqual({ modelCalls, waited: Date.now() - refusedAt }, { modelCalls: 2, waited: 2_000 });
	}));

	test('discovery cooldowns respect individual outer waiter budgets', () => runWithFakedTimers({}, async () => {
		let discoveries = 0;
		const { service } = create(async input => {
			if (String(input).endsWith('/copilot_internal/user')) {
				return ++discoveries === 1 ? new Response(null, { status: 429, headers: { 'Retry-After': '2' } }) : user();
			}
			return models();
		});
		await assert.rejects(service.models('token'), { status: 429 });
		const refusedAt = Date.now();
		const short = assert.rejects(service.models('token', { deadline: refusedAt + 100 }), { status: 429, code: 'rate_limited' });
		const long = service.models('token');
		await short;
		assert.strictEqual(Date.now(), refusedAt);
		assert.deepStrictEqual((await long).map(model => model.id), ['test-model']);
		assert.deepStrictEqual({ discoveries, elapsed: Date.now() - refusedAt }, { discoveries: 2, elapsed: 2_000 });
	}));

	test('a generic GitHub discovery denial remains a 403 and does not poison later control reads', async () => {
		const requests: string[] = [];
		const { service } = create(async input => {
			const path = new URL(String(input)).pathname;
			requests.push(path);
			if (requests.length === 1) {
				return Response.json({ message: 'Rate Limit Exceeded' }, {
					status: 403, headers: { 'x-ratelimit-resource': 'core', 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': String(Math.ceil(Date.now() / 1000) + 3600) },
				});
			}
			return path === '/copilot_internal/user' ? user() : models();
		}, { getAccountId: () => '101' });
		await assert.rejects(service.models('token'), error => error instanceof CopilotApiError && error.status === 403 && error.code !== 'rate_limited');
		const result = await service.models('token');
		assert.deepStrictEqual({ requests, models: result.map(model => model.id) }, {
			requests: ['/copilot_internal/user', '/copilot_internal/user', '/models'], models: ['test-model'],
		});
	});

	test('discovery uses a reported non-core bucket across credential replacement', () => runWithFakedTimers({}, async () => {
		let calls = 0;
		const { service } = create(async () => {
			calls++;
			return Response.json({ message: 'API rate limit exceeded' }, {
				status: 403, headers: {
					'x-ratelimit-resource': 'discovery', 'x-ratelimit-remaining': '0',
					'x-ratelimit-reset': String(Math.ceil(Date.now() / 1000) + 3600),
				},
			});
		}, { getAccountId: () => '101' });
		await assert.rejects(service.models('first'), { status: 403 });
		const now = Date.now();
		await assert.rejects(service.models('replacement'), { status: 429, code: 'rate_limited' });
		assert.deepStrictEqual({ calls, elapsed: Date.now() - now }, { calls: 1, elapsed: 0 });
	}));
});
