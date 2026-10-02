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
import { GitHubRateLimitCoordinator } from '../../common/githubRateLimitCoordinator.js';
import { systemRequestScheduler } from '../../common/scheduler.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { GitHubRequestError } from '../../common/githubTypes.js';
import { RequestFetch } from '../../common/types.js';

suite('GitHub HTTP rate-limit governance', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const origin = 'https://api.github.com';
	const account = { host: 'api.github.com', accountId: '101' };
	const signal = () => new AbortController().signal;
	const create = (fetch: RequestFetch) => store.add(new GitHubService({
		fetch, credentialProvider: { onDidChange: Event.None, getToken: () => 'token' },
	}, new NullLogService(), NullTelemetryService));
	const headers = (resource: string, remaining: number) => ({
		'x-ratelimit-resource': resource,
		'x-ratelimit-remaining': String(remaining),
		'x-ratelimit-reset': String(Math.ceil((Date.now() + 3_600_000) / 1000)),
	});

	for (const message of ['Rate Limit Exceeded', 'Rate Limit Exceeded. Please review the Terms of Service.']) {
		test(`does not turn a generic 403 into a throttle: ${message}`, async () => {
			const requests: string[] = [];
			const service = create(async input => {
				const path = new URL(String(input)).pathname;
				requests.push(path);
				return path === '/copilot_internal/managed_settings'
					? Response.json({ message }, { status: 403, headers: headers('core', 4999) })
					: Response.json({ id: 101 });
			});
			const client = store.add(service.acquireClient({
				authorization: { providerId: 'github', sessionId: 'test', scopes: ['repo'] },
				apiBaseUri: origin, graphQlUri: `${origin}/graphql`,
			})).object;
			const credential = await client.credentials.getCredential(signal());
			await assert.rejects(client.transport.rest(credential.account, credential.token, {
				method: 'GET', url: `${origin}/copilot_internal/managed_settings`,
			}, signal()), { kind: 'authorization', statusCode: 403 });
			await client.transport.rest(credential.account, credential.token, { method: 'GET', url: `${origin}/repos/owner/repo` }, signal());
			assert.deepStrictEqual({ requests, delay: client.transport.rateLimits.getDelay(credential.account, 'core') }, {
				requests: ['/user', '/copilot_internal/managed_settings', '/repos/owner/repo'], delay: 0,
			});
		});
	}

	test('missing quota headers do not make the generic denial message authoritative', async () => {
		const transport = store.add(new GitHubTransport(async () => Response.json({ message: 'Rate Limit Exceeded' }, { status: 403 })));
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/copilot/mcp_registry` }, signal()), { kind: 'authorization' });
		assert.strictEqual(transport.rateLimits.getDelay(account, 'core'), 0);
	});

	for (const kind of ['primary', 'secondary', 'retry-after'] as const) {
		test(`preserves explicit ${kind} evidence on a 403`, () => runWithFakedTimers({}, async () => {
			const message = kind === 'secondary' ? 'You have exceeded a secondary rate limit.' : 'Rate Limit Exceeded';
			const transport = store.add(new GitHubTransport(async () => Response.json({ message }, {
				status: 403,
				headers: { ...headers('core', kind === 'primary' ? 0 : 4999), ...(kind === 'retry-after' ? { 'Retry-After': '10' } : {}) },
			})));
			await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/denied` }, signal()), { kind: 'rateLimit' });
			assert.deepStrictEqual({
				core: transport.rateLimits.getDelay(account, 'core'),
				search: transport.rateLimits.getDelay(account, 'search'),
			}, { core: kind === 'primary' ? 3_600_000 : kind === 'secondary' ? 60_000 : 10_000, search: kind === 'secondary' ? 60_000 : 0 });
		}));
	}

	test('generic denial does not erase an existing server cooldown', () => runWithFakedTimers({}, async () => {
		const transport = store.add(new GitHubTransport(async () => Response.json({})));
		transport.rateLimits.updateFromResponse(account, new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
		transport.rateLimits.updateFromResponse(account, new Response(null, { status: 403, headers: headers('core', 4999) }), '{"message":"Rate Limit Exceeded"}');
		assert.strictEqual(transport.rateLimits.getDelay(account, 'core'), 120_000);
	}));

	test('bootstrap policy denial does not block other clients or request another identity', async () => {
		const requests: string[] = [];
		const service = create(async input => {
			const path = new URL(String(input)).pathname;
			requests.push(path);
			return path === '/copilot_internal/user'
				? Response.json({ message: 'Rate Limit Exceeded' }, { status: 403, headers: headers('core', 4999) })
				: Response.json({});
		});
		const bootstrap = store.add(service.acquireBootstrapClient({ apiBaseUri: origin, token: 'copilot', accountId: account.accountId })).object;
		await assert.rejects(bootstrap.get('/copilot_internal/user', signal()), { kind: 'authorization', statusCode: 403 });
		const peer = store.add(service.acquireBootstrapClient({ apiBaseUri: origin, token: 'peer', accountId: account.accountId })).object;
		await peer.get('/repos/owner/repo', signal());
		assert.deepStrictEqual(requests, ['/copilot_internal/user', '/repos/owner/repo']);
	});

	for (const nextPath of ['/repos/owner/repo/commits/first/check-runs?page=2', '/repos/another/repo/commits/second/check-runs', '/repositories/123/check-suites/456/check-runs', '/repos/peer/repo/commits/branch/check%2Druns']) {
		test(`a reported checks cooldown gates alternate routes: ${nextPath}`, () => runWithFakedTimers({}, async () => {
			const requests: string[] = [];
			const transport = store.add(new GitHubTransport(async input => {
				requests.push(String(input));
				return requests.length === 1
					? Response.json({ message: 'API rate limit exceeded' }, { status: 403, headers: headers('checks', 0) })
					: Response.json({});
			}));
			await assert.rejects(transport.rest(account, 'token', {
				method: 'GET', url: `${origin}/repos/owner/repo/commits/first/check-runs`,
			}, signal()), { kind: 'rateLimit' });
			await assert.rejects(transport.rest(account, 'token', {
				method: 'GET', url: `${origin}${nextPath}`, deadline: Date.now() + 100,
			}, signal()), { kind: 'timeout' });
			await transport.rest(account, 'token', { method: 'GET', url: `${origin}/repos/owner/repo/issues/1` }, signal());
			assert.deepStrictEqual(requests, [`${origin}/repos/owner/repo/commits/first/check-runs`, `${origin}/repos/owner/repo/issues/1`]);
		}));
	}

	test('code search learns its reported bucket without blocking issue search', () => runWithFakedTimers({}, async () => {
		const requests: string[] = [];
		const transport = store.add(new GitHubTransport(async input => {
			const url = new URL(String(input));
			requests.push(url.pathname + url.search);
			return requests.length === 1
				? Response.json({ message: 'API rate limit exceeded' }, { status: 403, headers: headers('code_search', 0) })
				: Response.json({});
		}));
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/search/code?q=first` }, signal()), { kind: 'rateLimit' });
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/search/%63ode?q=second`, deadline: Date.now() + 100 }, signal()), { kind: 'timeout' });
		await transport.rest(account, 'token', { method: 'GET', url: `${origin}/search/issues?q=second` }, signal());
		assert.deepStrictEqual(requests, ['/search/code?q=first', '/search/issues?q=second']);
	}));

	test('queued bootstrap waiters see a newly reported bucket before dispatch', () => runWithFakedTimers({}, async () => {
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<Response>();
		const requests: string[] = [];
		const service = create(async input => {
			requests.push(String(input));
			if (requests.length === 1) {
				void started.complete();
				return response.p;
			}
			return Response.json({});
		});
		const first = store.add(service.acquireBootstrapClient({ apiBaseUri: origin, token: 'first', accountId: account.accountId })).object;
		const peer = store.add(service.acquireBootstrapClient({ apiBaseUri: origin, token: 'second', accountId: account.accountId })).object;
		const rejected = assert.rejects(first.get('/repos/owner/repo/commits/first/check-runs', signal()), { kind: 'rateLimit' });
		await started.p;
		const queued = assert.rejects(peer.get('/repos/peer/repo/commits/second/check-runs', signal(), { deadline: Date.now() + 100 }), { kind: 'rateLimit', statusCode: 429 });
		await timeout(0);
		await response.complete(Response.json({ message: 'API rate limit exceeded' }, { status: 403, headers: headers('checks', 0) }));
		await Promise.all([rejected, queued]);
		assert.strictEqual(requests.length, 1);
	}));

	test('an explicit secondary-limit header is authoritative even without diagnostic text', () => runWithFakedTimers({}, async () => {
		const transport = store.add(new GitHubTransport(async () => new Response(null, {
			status: 403, headers: { ...headers('checks', 4999), 'x-github-secondary-rate-limited': 'true', 'Retry-After': '3' },
		})));
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/repos/o/r/check-runs/1` }, signal()), { kind: 'rateLimit' });
		assert.deepStrictEqual(['core', 'checks', 'search'].map(resource => transport.rateLimits.getDelay(account, resource)), [3000, 3000, 3000]);
	}));

	test('secondary throttling does not apply a spent primary window to unrelated buckets', () => runWithFakedTimers({}, async () => {
		const transport = store.add(new GitHubTransport(async () => Response.json({ message: 'You have exceeded a secondary rate limit.' }, {
			status: 403, headers: headers('core', 0),
		})));
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/limited` }, signal()), { kind: 'rateLimit' });
		assert.deepStrictEqual({
			core: transport.rateLimits.getDelay(account, 'core'),
			search: transport.rateLimits.getDelay(account, 'search'),
		}, { core: 3_600_000, search: 60_000 });
	}));

	test('empty quota headers do not turn a generic denial into spent quota', async () => {
		const transport = store.add(new GitHubTransport(async () => Response.json({ message: 'Rate Limit Exceeded' }, {
			status: 403, headers: { 'x-ratelimit-remaining': '', 'x-ratelimit-reset': '', 'Retry-After': '' },
		})));
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/copilot/mcp_registry` }, signal()), { kind: 'authorization' });
		assert.strictEqual(transport.rateLimits.getDelay(account, 'core'), 0);
	});

	test('download denials use the same HTTP quota evidence without disclosing their body', async () => {
		const transport = store.add(new GitHubTransport(async () => Response.json({ message: 'Rate Limit Exceeded' }, { status: 403, headers: headers('core', 4999) })));
		await assert.rejects(transport.download(account, 'token', {
			url: `${origin}/repos/owner/repo/actions/jobs/1/logs`, maximumBytes: 1000, timeout: 100,
		}, signal()), { kind: 'authorization', statusCode: 403, responseBody: undefined });
		assert.strictEqual(transport.rateLimits.getDelay(account, 'core'), 0);
	});

	test('known checks routes ignore an unrelated core cooldown', () => runWithFakedTimers({}, async () => {
		const requests: string[] = [];
		const transport = store.add(new GitHubTransport(async input => {
			const path = new URL(String(input)).pathname;
			requests.push(path);
			return path.endsWith('/issues/1') ? new Response(null, { status: 429, headers: { ...headers('core', 4999), 'Retry-After': '60' } })
				: Response.json({}, { headers: headers('checks', 9999) });
		}));
		await transport.rest(account, 'token', { method: 'GET', url: `${origin}/repos/o/r/check-runs/1` }, signal());
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/repos/o/r/issues/1` }, signal()), { kind: 'rateLimit' });
		await transport.rest(account, 'token', { method: 'GET', url: `${origin}/repos/peer/repo/check-suites/2` }, signal());
		assert.deepStrictEqual(requests, ['/repos/o/r/check-runs/1', '/repos/o/r/issues/1', '/repos/peer/repo/check-suites/2']);
	}));

	for (const [path, resource] of [['/repos/o/r/check-runs/1', 'core'], ['/api/v3/search/code?q=first', 'search']] as const) {
		test(`preserves the reported legacy bucket ${resource} for ${path}`, () => runWithFakedTimers({}, async () => {
			let calls = 0;
			const transport = store.add(new GitHubTransport(async () => {
				calls++;
				return new Response(null, { status: 403, headers: headers(resource, 0) });
			}));
			await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}${path}` }, signal()), { kind: 'rateLimit' });
			await assert.rejects(transport.rest(account, 'token', {
				method: 'GET', url: resource === 'core' ? `${origin}/repos/o/r/issues/1` : `${origin}/api/v3/search/issues?q=second`,
				deadline: Date.now() + 100,
			}, signal()), { kind: 'timeout' });
			assert.strictEqual(calls, 1);
		}));
	}

	test('semantic issue search does not change the keyword-search bucket', () => runWithFakedTimers({}, async () => {
		const requests: string[] = [];
		const transport = store.add(new GitHubTransport(async input => {
			const url = new URL(String(input));
			requests.push(url.pathname + url.search);
			return requests.length === 1 ? new Response(null, { status: 429, headers: headers('semantic_search', 0) }) : Response.json({});
		}));
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/search/issues?q=first&search_type=semantic` }, signal()), { kind: 'rateLimit' });
		await assert.rejects(transport.rest(account, 'token', {
			method: 'GET', url: `${origin}/search/issues?q=second&search_type=hybrid`, deadline: Date.now() + 100,
		}, signal()), { kind: 'timeout' });
		await transport.rest(account, 'token', { method: 'GET', url: `${origin}/search/issues?q=keyword` }, signal());
		assert.deepStrictEqual(requests, ['/search/issues?q=first&search_type=semantic', '/search/issues?q=keyword']);
	}));

	test('resource mapping and cooldown survive the last grant lease and token replacement', () => runWithFakedTimers({}, async () => {
		const requests: string[] = [];
		const service = create(async input => {
			requests.push(String(input));
			return requests.length === 1 ? new Response(null, { status: 429, headers: headers('checks', 0) }) : Response.json({});
		});
		const first = store.add(service.acquireBootstrapClient({ apiBaseUri: origin, token: 'old', accountId: account.accountId }));
		await assert.rejects(first.object.get('/repos/o/r/check-runs/1', signal()), { kind: 'rateLimit' });
		first.dispose();
		const renewed = store.add(service.acquireBootstrapClient({ apiBaseUri: origin, token: 'new', accountId: account.accountId })).object;
		await assert.rejects(renewed.get('/repos/peer/repo/check-runs/2', signal(), { deadline: Date.now() + 100 }), { kind: 'rateLimit', statusCode: 429 });
		const otherAccount = store.add(service.acquireBootstrapClient({ apiBaseUri: origin, token: 'other', accountId: '202' })).object;
		await otherAccount.get('/repos/peer/repo/check-runs/2', signal());
		assert.deepStrictEqual(requests, [`${origin}/repos/o/r/check-runs/1`, `${origin}/repos/peer/repo/check-runs/2`]);
	}));

	test('different integrations for one account retain their own learned search resource', () => runWithFakedTimers({}, async () => {
		const calls = new Map<string, number>();
		const service = create(async (_input, init) => {
			const token = new Headers(init?.headers).get('Authorization')!;
			const count = (calls.get(token) ?? 0) + 1;
			calls.set(token, count);
			const limited = token === 'Bearer first' && count === 2;
			return Response.json({}, {
				status: limited ? 403 : 200,
				headers: headers(token === 'Bearer first' ? 'code_search' : 'code_search_expanded', limited ? 0 : 999),
			});
		});
		const acquire = (sessionId: string) => store.add(service.acquireClient({
			authorization: { providerId: 'github', sessionId, scopes: ['repo'] },
			apiBaseUri: origin, graphQlUri: `${origin}/graphql`,
		})).object;
		const first = acquire('first');
		const second = acquire('second');
		const url = `${origin}/search/code?q=test`;
		await first.transport.rest(account, 'first', { method: 'GET', url }, signal());
		await second.transport.rest(account, 'second', { method: 'GET', url }, signal());
		await assert.rejects(first.transport.rest(account, 'first', { method: 'GET', url }, signal()), { kind: 'rateLimit' });
		await second.transport.rest(account, 'second', { method: 'GET', url, deadline: Date.now() + 100 }, signal());
		await assert.rejects(first.transport.rest(account, 'first', { method: 'GET', url, deadline: Date.now() + 100 }, signal()), { kind: 'timeout' });
		assert.deepStrictEqual([...calls], [['Bearer first', 2], ['Bearer second', 2]]);
	}));

	test('learned resources are isolated by API origin and base path', () => runWithFakedTimers({}, async () => {
		const requests: string[] = [];
		const transport = store.add(new GitHubTransport(async input => {
			requests.push(String(input));
			return requests.length === 1 ? new Response(null, { status: 429, headers: headers('checks', 0) }) : Response.json({});
		}));
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/api/v3/repos/o/r/check-runs/1` }, signal()), { kind: 'rateLimit' });
		await transport.rest(account, 'token', { method: 'GET', url: `${origin}/other/api/repos/o/r/check-runs/1` }, signal());
		await transport.rest({ host: 'other.example.test', accountId: '101' }, 'other', { method: 'GET', url: 'https://other.example.test/api/v3/repos/o/r/check-runs/1' }, signal());
		assert.strictEqual(requests.length, 3);
	}));

	test('a learned bucket on a transient response prevents a retry into its cooldown', () => runWithFakedTimers({}, async () => {
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => {
			calls++;
			return new Response('unavailable', { status: 503, headers: headers('checks', 0) });
		}));
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/repos/o/r/check-runs/1` }, signal()), { kind: 'server' });
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/repos/o/r/check-runs/2`, deadline: Date.now() + 100 }, signal()), { kind: 'timeout' });
		assert.strictEqual(calls, 1);
	}));

	test('a retry rechecks a newly blocked server-reported bucket', () => runWithFakedTimers({}, async () => {
		const started = new DeferredPromise<void>();
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => {
			calls++;
			void started.complete();
			return new Response('unavailable', { status: 503, headers: headers('checks', 9999) });
		}));
		const rejected = assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/repos/o/r/check-runs/1` }, signal()), { kind: 'rateLimit' });
		await started.p;
		await timeout(0);
		transport.rateLimits.updateFromResponse(account, new Response(null, { status: 429, headers: { 'x-ratelimit-resource': 'checks', 'Retry-After': '60' } }));
		await rejected;
		assert.strictEqual(calls, 1);
	}));

	test('retains the read retry for typed network failures from an injected executor', async () => {
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => {
			if (++calls === 1) {
				throw new GitHubRequestError('Transient executor failure', 'network');
			}
			return Response.json({});
		}));
		await transport.rest(account, 'token', { method: 'GET', url: `${origin}/repos/o/r/check-runs/1` }, signal());
		assert.strictEqual(calls, 2);
	});

	test('an authenticated download uses the same reported route bucket as REST reads', () => runWithFakedTimers({}, async () => {
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => {
			calls++;
			return new Response(null, { status: 403, headers: headers('checks', 0) });
		}));
		await assert.rejects(transport.download(account, 'token', {
			url: `${origin}/repos/o/r/check-runs/1`, maximumBytes: 1000, timeout: 100,
		}, signal()), { kind: 'rateLimit' });
		await assert.rejects(transport.rest(account, 'token', {
			method: 'GET', url: `${origin}/repos/o/r/check-runs/2`, deadline: Date.now() + 100,
		}, signal()), { kind: 'timeout' });
		assert.strictEqual(calls, 1);
	}));

	test('a bootstrap redirect cannot dispatch into a known blocked bucket', () => runWithFakedTimers({}, async () => {
		const requests: string[] = [];
		const service = create(async input => {
			const path = new URL(String(input)).pathname;
			requests.push(path);
			return path === '/alias' ? new Response(null, { status: 302, headers: { Location: '/repos/o/r/check-runs/2' } })
				: new Response(null, { status: 429, headers: headers('checks', 0) });
		});
		const client = store.add(service.acquireBootstrapClient({ apiBaseUri: origin, token: 'token', accountId: account.accountId })).object;
		await assert.rejects(client.get('/repos/o/r/check-runs/1', signal()), { kind: 'rateLimit' });
		await assert.rejects(client.get('/alias', signal()), { kind: 'rateLimit', statusCode: 429 });
		assert.deepStrictEqual(requests, ['/repos/o/r/check-runs/1', '/alias']);
	}));

	for (const limit of ['primary core', 'primary reported resource', 'secondary'] as const) {
		test(`idle observations from a ${limit} cooldown cannot block other accounts`, () => runWithFakedTimers({}, async () => {
			const requests: string[] = [];
			const resource = limit === 'primary reported resource' ? 'checks' : 'core';
			const lastPath = `/repos/o/r/commits/${GitHubRateLimitCoordinator.maximumRestResourceMappings - 1}/status`;
			const service = create(async input => {
				const path = new URL(String(input)).pathname;
				requests.push(path);
				if (path.startsWith('/repos/o/r/commits/')) {
					return path === lastPath && limit === 'secondary'
						? Response.json({ message: 'You have exceeded a secondary rate limit.' }, { status: 403, headers: headers(resource, 4999) })
						: Response.json({}, { headers: headers(resource, path === lastPath ? 0 : 4999) });
				}
				return Response.json({}, { headers: headers('core', 4999) });
			});
			const acquire = (sessionId: string) => store.add(service.acquireClient({
				authorization: { providerId: 'github', sessionId, scopes: ['repo'] },
				apiBaseUri: origin, graphQlUri: `${origin}/graphql`,
			})).object;
			const busy = acquire('busy');
			const peer = acquire('peer');
			const peerAccount = { ...account, accountId: '202' };
			const peerRequest = (path: string) => peer.transport.rest(peerAccount, 'peer', { method: 'GET', url: `${origin}${path}` }, signal());
			await peerRequest('/repos/peer/r/pulls/1');
			for (let index = 0; index < GitHubRateLimitCoordinator.maximumRestResourceMappings; index++) {
				const result = busy.transport.rest(account, 'busy', { method: 'GET', url: `${origin}/repos/o/r/commits/${index}/status` }, signal());
				if (index === GitHubRateLimitCoordinator.maximumRestResourceMappings - 1 && limit === 'secondary') {
					await assert.rejects(result, { kind: 'rateLimit' });
				} else {
					await result;
				}
			}

			await peerRequest('/repos/peer/r/pulls/1');
			await peerRequest('/repos/peer/r/pulls/2');
			const anonymous = store.add(service.acquireAnonymousClient({ apiBaseUri: origin })).object;
			await anonymous.get('/public', signal());
			const bootstrap = store.add(service.acquireBootstrapClient({ apiBaseUri: origin, token: 'bootstrap' })).object;
			await bootstrap.get('/copilot_internal/user', signal());
			const calls = requests.length;
			await assert.rejects(busy.transport.rest(account, 'busy', {
				method: 'GET', url: `${origin}/repos/o/r/commits/0/status`, deadline: Date.now() + 100,
			}, signal()), { kind: 'timeout' });
			const renewed = store.add(service.acquireBootstrapClient({ apiBaseUri: origin, token: 'renewed', accountId: account.accountId })).object;
			await assert.rejects(renewed.get('/copilot_internal/user', signal(), { deadline: Date.now() + 100 }), { kind: 'rateLimit', statusCode: 429 });
			assert.strictEqual(requests.length, calls);
			assert.deepStrictEqual(requests.slice(-4), ['/repos/peer/r/pulls/1', '/repos/peer/r/pulls/2', '/public', '/copilot_internal/user']);
		}));
	}

	test('compacted cooldowns protect unknown routes without blocking known independent resources', () => runWithFakedTimers({}, async () => {
		const coordinator = store.add(new GitHubRateLimitCoordinator(systemRequestScheduler));
		coordinator.retainAccount(account, coordinator);
		const known = store.add(coordinator.acquireRestResource(account, `${origin}/search/issues`, 'client'));
		known.object.observe(new Headers({ 'x-ratelimit-resource': 'search' }));
		for (let index = 0; index < GitHubRateLimitCoordinator.maximumRestResourceMappings - 1; index++) {
			const mapping = coordinator.acquireRestResource(account, `${origin}/route/${index}`, 'client');
			mapping.object.observe(new Headers({ 'x-ratelimit-resource': index === 0 ? 'checks' : 'code_search' }));
			mapping.dispose();
		}
		coordinator.updateFromResponse(account, new Response(null, { status: 429, headers: { 'x-ratelimit-resource': 'checks', 'Retry-After': '10' } }));
		coordinator.updateFromResponse(account, new Response(null, { status: 429, headers: { 'x-ratelimit-resource': 'code_search', 'Retry-After': '20' } }));
		const peer = { ...account, accountId: '202' };
		store.add(coordinator.acquireRestResource(peer, `${origin}/first`));
		assert.strictEqual(coordinator.getDelay(account, coordinator.getRestResource(account, `${origin}/route/0`, 'client')), 10_000);
		assert.strictEqual(coordinator.getDelay(account, known.object.name), 0);
		store.add(coordinator.acquireRestResource(peer, `${origin}/second`));
		const unknown = store.add(coordinator.acquireRestResource(account, `${origin}/unknown`, 'client'));
		const blockedResource = unknown.object.name;
		assert.strictEqual(coordinator.getDelay(account, blockedResource), 20_000);
		assert.strictEqual(unknown.object.responseName, 'core');
		await timeout(15_000);
		assert.strictEqual(coordinator.getDelay(account, unknown.object.name), 5_000);
		await timeout(5_000);
		assert.deepStrictEqual({ admission: unknown.object.name, response: unknown.object.responseName }, { admission: 'core', response: 'core' });
		coordinator.releaseAccount(account, coordinator);
		assert.strictEqual(coordinator.getState(account, blockedResource), undefined);
	}));

	test('idle mapping eviction cannot forget a live checks cooldown', () => runWithFakedTimers({}, async () => {
		let calls = 0;
		const transport = store.add(new GitHubTransport(async () => {
			calls++;
			return calls === 1 ? new Response(null, { status: 429, headers: headers('checks', 0) }) : Response.json({}, { headers: headers('core', 4999) });
		}));
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/repos/o/r/check-runs/1` }, signal()), { kind: 'rateLimit' });
		for (let index = 0; index < GitHubRateLimitCoordinator.maximumRestResourceMappings + 1; index++) {
			await transport.rest(account, 'token', { method: 'GET', url: `${origin}/route/${index}` }, signal());
		}
		await assert.rejects(transport.rest(account, 'token', { method: 'GET', url: `${origin}/repos/o/r/check-runs/2`, deadline: Date.now() + 100 }, signal()), { kind: 'timeout' });
		assert.strictEqual(calls, GitHubRateLimitCoordinator.maximumRestResourceMappings + 2);
	}));

	test('bounds pinned route mappings and reclaims an unreferenced slot', async () => {
		const coordinator = store.add(new GitHubRateLimitCoordinator(systemRequestScheduler));
		const references = Array.from({ length: GitHubRateLimitCoordinator.maximumRestResourceMappings }, (_, index) => store.add(coordinator.acquireRestResource(account, `${origin}/route/${index}`)));
		await assert.rejects(async () => coordinator.acquireRestResource(account, `${origin}/overflow`), { kind: 'overloaded' });
		references[0].dispose();
		const replacement = store.add(coordinator.acquireRestResource(account, `${origin}/replacement`));
		assert.strictEqual(replacement.object.name, 'core');
	});

	test('a changed route mapping cannot discard an earlier resource cooldown', () => runWithFakedTimers({}, async () => {
		const coordinator = store.add(new GitHubRateLimitCoordinator(systemRequestScheduler));
		const mapping = store.add(coordinator.acquireRestResource(account, `${origin}/repos/o/r/check-runs/1`)).object;
		mapping.observe(new Headers({ 'x-ratelimit-resource': 'checks' }));
		coordinator.updateFromResponse(account, new Response(null, { status: 429, headers: { ...headers('checks', 0), 'Retry-After': '2' } }));
		mapping.observe(new Headers({ 'x-ratelimit-resource': 'core' }));
		coordinator.updateFromResponse(account, new Response(null, { headers: headers('core', 4999) }));
		assert.deepStrictEqual({ admission: mapping.name, reported: mapping.responseName }, { admission: 'checks', reported: 'core' });
		await timeout(2_000);
		assert.strictEqual(mapping.name, 'core');
	}));

	test('account cleanup drops idle route mappings after the server wait expires', () => runWithFakedTimers({}, async () => {
		const coordinator = store.add(new GitHubRateLimitCoordinator(systemRequestScheduler));
		const mapping = store.add(coordinator.acquireRestResource(account, `${origin}/repos/o/r/check-runs/1`));
		mapping.object.observe(new Headers({ 'x-ratelimit-resource': 'checks' }));
		coordinator.updateFromResponse(account, new Response(null, { status: 429, headers: { 'x-ratelimit-resource': 'checks', 'Retry-After': '1' } }));
		mapping.dispose();
		coordinator.releaseAccount(account);
		assert.strictEqual(coordinator.getRestResponseResource(account, `${origin}/repos/o/r/check-runs/2`), 'checks');
		await timeout(1_000);
		assert.strictEqual(coordinator.getRestResponseResource(account, `${origin}/repos/o/r/check-runs/2`), 'core');
	}));
});
