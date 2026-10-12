/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { GitHubService } from '../../common/githubService.js';
import { RequestFetch } from '../../common/types.js';

suite('GitHub bootstrap clients', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const apiBaseUri = 'https://api.github.com';
	const signal = () => new AbortController().signal;
	const create = (fetch: RequestFetch) => store.add(new GitHubService({
		fetch,
		credentialProvider: { onDidChange: Event.None, getToken: () => { throw new Error('Bootstrap must not look up an accepted credential'); } },
	}, new NullLogService(), NullTelemetryService));

	test('uses the explicit credential without account selection or an identity request', async () => {
		const requests: { path: string; token: string | null; credentials: RequestCredentials | undefined }[] = [];
		const service = create(async (input, init) => {
			requests.push({ path: new URL(String(input)).pathname, token: new Headers(init?.headers).get('Authorization'), credentials: init?.credentials });
			return Response.json({ access_type_sku: 'test' });
		});
		const client = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'pending-token' })).object;
		const result = await client.get('/copilot_internal/user', signal());
		assert.deepStrictEqual({ requests, data: result.data }, {
			requests: [{ path: '/copilot_internal/user', token: 'Bearer pending-token', credentials: 'omit' }],
			data: { access_type_sku: 'test' },
		});
	});

	test('different credentials cannot share private responses or validators', async () => {
		const requests: { token: string | null; etag: string | null }[] = [];
		const service = create(async (_input, init) => {
			const headers = new Headers(init?.headers);
			const token = headers.get('Authorization');
			const etag = headers.get('If-None-Match');
			requests.push({ token, etag });
			return etag ? new Response(null, { status: 304 })
				: Response.json({ token }, { headers: { ETag: token === 'Bearer first' ? '"first"' : '"second"' } });
		});
		const first = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'first', accountId: '101' })).object;
		const second = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'second', accountId: '101' })).object;
		const responses = await Promise.all([first.get('/copilot_internal/user', signal()), second.get('/copilot_internal/user', signal())]);
		const revalidated = await first.get('/copilot_internal/user', signal());
		assert.deepStrictEqual({
			requests, data: responses.map(response => response.data), revalidated: revalidated.data,
		}, {
			requests: [{ token: 'Bearer first', etag: null }, { token: 'Bearer second', etag: null }, { token: 'Bearer first', etag: '"first"' }],
			data: [{ token: 'Bearer first' }, { token: 'Bearer second' }], revalidated: { token: 'Bearer first' },
		});
	});

	for (const accountId of [undefined, '101']) {
		test(`a generic 403 does not throttle ${accountId ? 'known' : 'unknown'} bootstrap credentials`, () => runWithFakedTimers({}, async () => {
			const requests: string[] = [];
			const blockedUntil: number[] = [];
			const service = create(async input => {
				const path = new URL(String(input)).pathname;
				requests.push(path);
				return path === '/denied'
					? Response.json({ message: 'Rate Limit Exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '4999' } })
					: Response.json({ ok: true });
			});
			const first = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'first', accountId }));
			await assert.rejects(first.object.get('/denied', signal()), { kind: 'authorization', statusCode: 403 });
			await first.object.get('/after', signal(), { deadline: Date.now() + 100, onBlockedUntil: time => blockedUntil.push(time) });
			first.dispose();
			const second = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'second', accountId })).object;
			await second.get('/replacement', signal(), { deadline: Date.now() + 100, onBlockedUntil: time => blockedUntil.push(time) });
			assert.deepStrictEqual({ requests, hasCooldown: blockedUntil.some(time => time > Date.now()) }, {
				requests: ['/denied', '/after', '/replacement'], hasCooldown: false,
			});
		}));
	}

	test('unknown credentials retain a shared origin cooldown across disposal and token changes', () => runWithFakedTimers({}, async () => {
		let calls = 0;
		const service = create(async () => { calls++; return new Response(null, { status: 429, headers: { 'Retry-After': '60' } }); });
		const first = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'first' }));
		await assert.rejects(first.object.get('/copilot_internal/user', signal()), { kind: 'rateLimit' });
		first.dispose();
		const replacement = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'second' })).object;
		await assert.rejects(replacement.get('/copilot_internal/user', signal(), { deadline: Date.now() + 100 }), { kind: 'rateLimit', statusCode: 429 });
		assert.strictEqual(calls, 1);
	}));

	test('known bootstrap quota feedback also governs repository reads for that account', () => runWithFakedTimers({}, async () => {
		const requests: string[] = [];
		const service = create(async input => {
			const path = new URL(String(input)).pathname;
			requests.push(path);
			return path === '/copilot_internal/user'
				? new Response(null, { status: 429, headers: { 'Retry-After': '60' } })
				: Response.json({ ok: true });
		});
		const bootstrap = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'copilot', accountId: '101' })).object;
		await assert.rejects(bootstrap.get('/copilot_internal/user', signal()), { kind: 'rateLimit' });
		const repository = store.add(service.acquireClient({
			authorization: { providerId: 'test', sessionId: 'repository', scopes: ['repo'] },
			apiBaseUri, graphQlUri: `${apiBaseUri}/graphql`,
		})).object;
		await assert.rejects(repository.transport.rest({ host: 'api.github.com', accountId: '101' }, 'repository', {
			method: 'GET', url: `${apiBaseUri}/repos/owner/repo`, deadline: Date.now() + 100,
		}, signal()), { kind: 'timeout' });
		await repository.transport.rest({ host: 'api.github.com', accountId: '202' }, 'peer', {
			method: 'GET', url: `${apiBaseUri}/repos/peer/repo`,
		}, signal());
		assert.deepStrictEqual(requests, ['/copilot_internal/user', '/repos/peer/repo']);
	}));

	test('learning account provenance cannot bypass an unresolved bootstrap cooldown', () => runWithFakedTimers({}, async () => {
		let calls = 0;
		const service = create(async () => { calls++; return new Response(null, { status: 429, headers: { 'Retry-After': '60' } }); });
		const unknown = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'token' }));
		await assert.rejects(unknown.object.get('/copilot_internal/user', signal()), { kind: 'rateLimit' });
		unknown.dispose();
		const known = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'token', accountId: '101' })).object;
		await assert.rejects(known.get('/copilot_internal/user', signal(), { deadline: Date.now() + 100 }), { kind: 'rateLimit', statusCode: 429 });
		assert.strictEqual(calls, 1);
	}));

	test('the last reference cancels work while a peer reference remains usable', async () => {
		const started = new DeferredPromise<AbortSignal>();
		const response = new DeferredPromise<Response>();
		const service = create(async (_input, init) => {
			assert.ok(init?.signal);
			void started.complete(init.signal);
			return response.p;
		});
		const first = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'token' }));
		const peer = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'token' }));
		const pending = assert.rejects(peer.object.get('/copilot_internal/user', signal()));
		const active = await started.p;
		first.dispose();
		assert.strictEqual(active.aborted, false);
		peer.dispose();
		await pending;
		await response.complete(Response.json({}));
		assert.strictEqual(active.aborted, true);
	});

	test('bootstrap reads reject escaping redirects before dispatching the target', async () => {
		const requests: string[] = [];
		const service = create(async input => {
			requests.push(String(input));
			return new Response(null, { status: 302, headers: { Location: '/outside' } });
		});
		const client = store.add(service.acquireBootstrapClient({ apiBaseUri: `${apiBaseUri}/api/v3`, token: 'token' })).object;
		await assert.rejects(client.get('/copilot_internal/user', signal()), { kind: 'authorization' });
		assert.deepStrictEqual(requests, [`${apiBaseUri}/api/v3/copilot_internal/user`]);
	});

	test('bootstrap reads participate in the same origin concurrency limit', async () => {
		const gate = new DeferredPromise<Response>();
		const requests: string[] = [];
		const service = create(async input => {
			requests.push(String(input));
			return requests.length === 1 ? gate.p : Response.json({});
		});
		const first = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'first' })).object;
		const second = store.add(service.acquireBootstrapClient({ apiBaseUri, token: 'second' })).object;
		const reads = [first.get('/first', signal()), second.get('/second', signal())];
		await timeout(0);
		assert.strictEqual(requests.length, 1);
		await gate.complete(Response.json({}));
		await Promise.all(reads);
		assert.deepStrictEqual(requests, [`${apiBaseUri}/first`, `${apiBaseUri}/second`]);
	});
});
