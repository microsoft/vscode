/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AnonymousClient } from '../../common/anonymous/anonymousClient.js';
import { LocalApiRequestProvider } from '../../common/client/localApiRequestProvider.js';
import { ApiRequest, IApiRequestProvider } from '../../common/client/request.js';
import { parse, SchemaError } from '../../common/client/schema.js';
import { GitHubService } from '../../common/githubService.js';
import { GitHubClientOptions, GitHubCredentialChange, GitHubRequestError, GitHubServiceOptions } from '../../common/githubTypes.js';
import { RequestFetch, RequestOptions } from '../../common/types.js';
import { getGitHubClientInternals } from './githubClientTestUtils.js';

const apiBaseUri = 'https://api.github.com';
const rawBaseUri = 'https://raw.githubusercontent.com';
const commitSha = 'a'.repeat(40);
const account = { host: 'api.github.com', accountId: '101' };
const authorizedOptions: GitHubClientOptions = {
	apiBaseUri, graphQlUri: `${apiBaseUri}/graphql`,
	authorization: { providerId: 'github', sessionId: 'session', scopes: ['repo'] },
};
const signal = () => new AbortController().signal;

function read(provider: LocalApiRequestProvider, path: string, signal: AbortSignal, options?: RequestOptions) {
	return provider.request({ method: 'GET', path, expectedStatus: [200], options }, signal, parse.jsonValue);
}

suite('GitHub anonymous clients', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const create = (options: GitHubServiceOptions) => store.add(new GitHubService(options, new NullLogService(), NullTelemetryService));

	function assertRequestError(action: () => void, kind: GitHubRequestError['kind']): void {
		assert.throws(action, function isExpectedRequestError(error: unknown) {
			return error instanceof GitHubRequestError && error.kind === kind;
		});
	}

	test('gist reads forward request options and cancellation to the provider', async () => {
		const requests: { request: ApiRequest; signal: AbortSignal }[] = [];
		const dispatched = new Error('Request reached the provider');
		const provider: IApiRequestProvider = {
			request: async (request: ApiRequest, signal: AbortSignal) => {
				requests.push({ request, signal });
				throw dispatched;
			},
		};
		const client = store.add(new AnonymousClient(provider, undefined, Disposable.None));
		const requestSignal = signal();
		const options = { caller: 'test.gist', deadline: Date.now() + 10_000 };

		await assert.rejects(client.gist.get('123abc', requestSignal, options), error => error === dispatched);
		assert.deepStrictEqual(requests.map(({ request, signal }) => ({ path: request.path, options: request.options, sameSignal: signal === requestSignal })), [
			{ path: '/gists/123abc', options, sameSignal: true },
		]);
	});

	test('returns separate disposable facades backed by one default anonymous engine', async () => {
		const requests: { url: string; etag: string | null }[] = [];
		const service = create({
			fetch: async (input, init) => {
				const etag = new Headers(init?.headers).get('If-None-Match');
				requests.push({ url: String(input), etag });
				return etag ? new Response(null, { status: 304 }) : new Response(commitSha, { headers: { etag: '"commit"' } });
			},
		});
		const first = store.add(service.acquireAnonymousClient());
		const second = store.add(service.acquireAnonymousClient());
		assert.strictEqual(requests.length, 0);
		await first.content.resolveRef({ owner: 'owner', repo: 'repo' }, 'HEAD', signal());
		first.dispose();
		const result = await second.content.resolveRef({ owner: 'owner', repo: 'repo' }, 'HEAD', signal());
		await assert.rejects(first.content.resolveRef({ owner: 'owner', repo: 'repo' }, 'HEAD', signal()), isCancellationError);
		assert.deepStrictEqual({ sameFacade: first === second, result, requests }, {
			sameFacade: false, result: commitSha,
			requests: [
				{ url: `${apiBaseUri}/repos/owner/repo/commits/HEAD`, etag: null },
				{ url: `${apiBaseUri}/repos/owner/repo/commits/HEAD`, etag: '"commit"' },
			],
		});
	});

	test('public reads require no credential provider, identity lookup or ambient credentials', async () => {
		const seen: { url: string; authorization: string | null; credentials: RequestCredentials | undefined; referrerPolicy: ReferrerPolicy | undefined }[] = [];
		const service = create({
			fetch: async (input, init) => {
				seen.push({
					url: String(input), authorization: new Headers(init?.headers).get('Authorization'),
					credentials: init?.credentials, referrerPolicy: init?.referrerPolicy,
				});
				return Response.json({ total_count: 0, incomplete_results: false, items: [] });
			},
		});
		const client = store.add(service.acquireAnonymousClient());
		const response = await client.search.issues('test', signal());
		assert.deepStrictEqual({ response, seen }, {
			response: { total_count: 0, incomplete_results: false, items: [] },
			seen: [{ url: `${apiBaseUri}/search/issues?q=is%3Aissue+test`, authorization: null, credentials: 'omit', referrerPolicy: 'no-referrer' }],
		});
		assertRequestError(() => service.acquireClient(authorizedOptions), 'authentication');
	});

	test('anonymous clients are not invalidated by sign-out', async () => {
		const changed = store.add(new Emitter<GitHubCredentialChange>());
		const service = create({
			credentialProvider: { onDidChange: changed.event, getToken: () => assert.fail('No credential lookup expected') },
			fetch: async () => new Response(commitSha),
		});
		const client = store.add(service.acquireAnonymousClient());
		changed.fire({ providerId: 'github' });
		assert.strictEqual(await client.content.resolveRef({ owner: 'o', repo: 'r' }, 'HEAD', signal()), commitSha);
	});

	test('private ETags and responses cannot enter the anonymous cache', async () => {
		const seen: { authorization: boolean; etag: string | null }[] = [];
		const service = create({
			credentialProvider: { onDidChange: Event.None, getToken: () => 'token' },
			fetch: async (_input, init) => {
				const headers = new Headers(init?.headers);
				const authorization = headers.has('Authorization');
				const etag = headers.get('If-None-Match');
				seen.push({ authorization, etag });
				return etag ? new Response(null, { status: 304 })
					: Response.json({ visibility: authorization ? 'private' : 'public' }, { headers: { etag: authorization ? '"private"' : '"public"' } });
			},
		});
		const authorized = store.add(service.acquireClient(authorizedOptions)).object;
		const anonymous = store.add(service.acquireAnonymousRequestProviders()).object.rest;
		await getGitHubClientInternals(authorized).transport.rest(account, 'token', { method: 'GET', url: `${apiBaseUri}/repos/o/r` }, signal());
		await read(anonymous, '/repos/o/r', signal());
		const reused = await read(anonymous, '/repos/o/r', signal());
		assert.deepStrictEqual({ seen, reused }, {
			seen: [{ authorization: true, etag: null }, { authorization: false, etag: null }, { authorization: false, etag: '"public"' }],
			reused: { data: { visibility: 'public' }, status: 200 },
		});
	});

	test('disposing one facade cancels only its waiter in a shared read', async () => {
		const started = new DeferredPromise<AbortSignal>();
		const response = new DeferredPromise<Response>();
		let calls = 0;
		const service = create({
			fetch: async (_input, init) => {
				calls++;
				assert.ok(init?.signal);
				void started.complete(init.signal);
				return response.p;
			},
		});
		const first = store.add(service.acquireAnonymousClient());
		const peer = store.add(service.acquireAnonymousClient());
		const rejected = assert.rejects(first.content.resolveRef({ owner: 'o', repo: 'r' }, 'HEAD', signal()), isCancellationError);
		const pending = peer.content.resolveRef({ owner: 'o', repo: 'r' }, 'HEAD', signal());
		const active = await started.p;
		first.dispose();
		await rejected;
		await response.complete(new Response(commitSha));
		assert.deepStrictEqual({ calls, aborted: active.aborted, result: await pending }, { calls: 1, aborted: false, result: commitSha });
	});

	test('last-reference disposal cancels its work and permits later acquisition', async () => {
		const started = new DeferredPromise<AbortSignal>();
		const response = new DeferredPromise<Response>();
		let calls = 0;
		const service = create({
			fetch: async (_input, init) => {
				if (++calls > 1) {
					return new Response(commitSha);
				}
				assert.ok(init?.signal);
				void started.complete(init.signal);
				return response.p;
			},
		});
		const first = store.add(service.acquireAnonymousClient());
		const pending = assert.rejects(first.content.resolveRef({ owner: 'o', repo: 'r' }, 'HEAD', signal()), isCancellationError);
		const active = await started.p;
		first.dispose();
		await pending;
		await response.complete(new Response(commitSha));
		const next = store.add(service.acquireAnonymousClient());
		assert.deepStrictEqual({ aborted: active.aborted, result: await next.content.resolveRef({ owner: 'o', repo: 'r' }, 'HEAD', signal()) }, {
			aborted: true, result: commitSha,
		});
	});

	for (const mode of ['reacquired', 'shared'] as const) {
		test(`anonymous cooldowns survive ${mode} without blocking authenticated reads`, () => runWithFakedTimers({}, async () => {
			const started = Date.now();
			const requests: { url: string; at: number; authenticated: boolean }[] = [];
			const service = create({
				credentialProvider: { onDidChange: Event.None, getToken: () => 'token' },
				fetch: async (input, init) => {
					requests.push({ url: String(input), at: Date.now() - started, authenticated: new Headers(init?.headers).has('Authorization') });
					return requests.length === 1 ? new Response('{"message":"secondary rate limit"}', { status: 403, headers: { 'Retry-After': '5' } }) : Response.json({});
				},
			});
			try {
				const first = store.add(service.acquireAnonymousRequestProviders());
				await assert.rejects(read(first.object.rest, '/first', signal()), { kind: 'rateLimit' });
				if (mode === 'reacquired') {
					first.dispose();
				}
				const second = store.add(service.acquireAnonymousRequestProviders());
				const authorized = store.add(service.acquireClient(authorizedOptions)).object;
				await getGitHubClientInternals(authorized).transport.rest(account, 'token', { method: 'GET', url: `${apiBaseUri}/authenticated` }, signal());
				await read(second.object.rest, '/second', signal());
				assert.deepStrictEqual(requests, [
					{ url: `${apiBaseUri}/first`, at: 0, authenticated: false },
					{ url: `${apiBaseUri}/authenticated`, at: 0, authenticated: true },
					{ url: `${apiBaseUri}/second`, at: 5_000, authenticated: false },
				]);
			} finally {
				service.dispose();
			}
		}));
	}

	test('authenticated failures never fall back to anonymous access', async () => {
		const requests: boolean[] = [];
		const service = create({
			credentialProvider: { onDidChange: Event.None, getToken: () => assert.fail('Unexpected credential selection') },
			fetch: async (_input, init) => {
				requests.push(new Headers(init?.headers).has('Authorization'));
				return Response.json({}, { status: 404 });
			},
		});
		const authorized = store.add(service.acquireClient(authorizedOptions)).object;
		const anonymous = store.add(service.acquireAnonymousRequestProviders()).object.rest;
		await assert.rejects(getGitHubClientInternals(authorized).transport.rest(account, 'token', { method: 'GET', url: `${apiBaseUri}/private` }, signal()), { kind: 'notFound' });
		await assert.rejects(read(anonymous, '/private', signal()), { kind: 'notFound' });
		assert.deepStrictEqual(requests, [true, false]);
	});

	test('anonymous and authenticated contexts share the engine capacity limit', () => {
		const service = create({ credentialProvider: { onDidChange: Event.None, getToken: () => 'token' } });
		for (let index = 0; index < 63; index++) {
			store.add(service.acquireClient({ ...authorizedOptions, authorization: { ...authorizedOptions.authorization, sessionId: String(index) } }));
		}
		const client = store.add(service.acquireAnonymousClient());
		const peer = store.add(service.acquireAnonymousClient());
		const extraOptions = { ...authorizedOptions, authorization: { ...authorizedOptions.authorization, sessionId: 'extra' } };
		assertRequestError(() => service.acquireClient(extraOptions), 'overloaded');
		client.dispose();
		assertRequestError(() => service.acquireClient(extraOptions), 'overloaded');
		peer.dispose();
		const authorized = store.add(service.acquireClient(extraOptions));
		assertRequestError(() => service.acquireAnonymousClient(), 'overloaded');
		authorized.dispose();
		store.add(service.acquireAnonymousClient());
	});

	test('anonymous and authenticated requests share process admission', async () => {
		const gates = Array.from({ length: 13 }, () => new DeferredPromise<Response>());
		const requests: boolean[] = [];
		const service = create({
			credentialProvider: { onDidChange: Event.None, getToken: () => 'token' },
			fetch: async (_input, init) => {
				const index = requests.length;
				requests.push(new Headers(init?.headers).has('Authorization'));
				return gates[index].p;
			},
		});
		const anonymous = store.add(service.acquireAnonymousRequestProviders()).object.rest;
		const authenticated = store.add(service.acquireClient(authorizedOptions)).object;
		const pending = [
			read(anonymous, '/public', signal()),
			...Array.from({ length: 12 }, (_, index) => getGitHubClientInternals(authenticated).transport.rest(
				{ ...account, accountId: String(index) }, 'token',
				{ method: 'GET', url: `${apiBaseUri}/request-${index}`, caller: `caller-${index}` }, signal(),
			)),
		];
		await timeout(0);
		const initiallyStarted = requests.length;
		for (const gate of gates) {
			await gate.complete(Response.json({}));
		}
		await Promise.all(pending);
		assert.deepStrictEqual({
			initiallyStarted,
			anonymousRequests: requests.filter(authenticated => !authenticated).length,
			authenticatedRequests: requests.filter(authenticated => authenticated).length,
		}, { initiallyStarted: 12, anonymousRequests: 1, authenticatedRequests: 12 });
	});

	test('separate anonymous leases cannot multiply concurrency', async () => {
		const gate = new DeferredPromise<void>();
		const requests: string[] = [];
		const service = create({
			fetch: async input => {
				requests.push(String(input));
				await gate.p;
				return Response.json({});
			},
		});
		const first = store.add(service.acquireAnonymousRequestProviders()).object.rest;
		const second = store.add(service.acquireAnonymousRequestProviders()).object.rest;
		const paths = Array.from({ length: 12 }, (_, index) => `/request-${index}`);
		const pending = paths.map((path, index) => read(index % 2 ? first : second, path, signal(), { caller: `caller-${index % 2}` }));
		await timeout(0);
		const initiallyStarted = requests.length;
		await gate.complete();
		await Promise.all(pending);
		assert.deepStrictEqual({ initiallyStarted, requests: requests.sort() }, {
			initiallyStarted: 10, requests: paths.map(path => `${apiBaseUri}${path}`).sort(),
		});
	});

	test('anonymous reads honor deadlines while parked by a cooldown', () => runWithFakedTimers({}, async () => {
		let calls = 0;
		const service = create({ fetch: async () => { calls++; return new Response(null, { status: 429, headers: { 'Retry-After': '60' } }); } });
		try {
			const provider = store.add(service.acquireAnonymousRequestProviders()).object.rest;
			await assert.rejects(read(provider, '/first', signal()), { kind: 'rateLimit' });
			await assert.rejects(read(provider, '/second', signal(), { deadline: Date.now() + 50 }), { kind: 'timeout' });
			assert.strictEqual(calls, 1);
		} finally {
			service.dispose();
		}
	}));
});

suite('GitHub public raw content', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const path = '.devcontainer/devcontainer.json';
	const rawPath = `/microsoft/sample/${commitSha}/${path}`;
	const content = '{ // JSONC and UTF-8\n"image":"image","name":"caf\u00e9",}';
	const create = (fetch: RequestFetch) => store.add(new GitHubService({
		fetch, credentialProvider: { onDidChange: Event.None, getToken: () => assert.fail('Raw content must remain anonymous') },
	}, new NullLogService(), NullTelemetryService));

	test('composes ref resolution and one pinned download without acquiring a second lease', async () => {
		const requests: Request[] = [];
		const service = create(async (input, init) => {
			requests.push(new Request(input, init));
			return new Response(String(input).includes('/commits/') ? commitSha : content);
		});
		const client = store.add(service.acquireAnonymousClient());
		const options = { caller: 'devContainerSample', deadline: Date.now() + 10_000 };
		const sha = await client.content.resolveRef({ owner: 'microsoft', repo: 'sample' }, 'HEAD', signal(), options);
		const result = await client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, sha, path, signal(), options);
		assert.deepStrictEqual({
			sha, result,
			requests: requests.map(request => ({
				url: request.url, authorization: request.headers.get('authorization'), credentials: request.credentials, referrerPolicy: request.referrerPolicy,
			})),
			rawApiHeaders: ['x-github-api-version', 'x-client-application', 'x-client-source', 'x-client-feature', 'x-is-retry'].map(name => requests[1].headers.get(name)),
		}, {
			sha: commitSha, result: content,
			requests: [`${apiBaseUri}/repos/microsoft/sample/commits/HEAD`, rawBaseUri + rawPath].map(url => ({
				url, authorization: null, credentials: 'omit', referrerPolicy: 'no-referrer',
			})),
			rawApiHeaders: [null, null, null, null, null],
		});
	});

	test('encodes file path segments without changing the pinned revision', async () => {
		const requests: string[] = [];
		const service = create(async input => { requests.push(String(input)); return new Response(content); });
		const client = store.add(service.acquireAnonymousClient());
		await client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, commitSha, 'docs/a #?%.md', signal());
		assert.deepStrictEqual(requests, [`${rawBaseUri}/microsoft/sample/${commitSha}/docs/a%20%23%3F%25.md`]);
	});

	test('resolves and downloads a revision pinned to a SHA-256 object ID', async () => {
		const expectedSha = '0123456789abcdef'.repeat(4);
		const requests: string[] = [];
		const service = create(async input => {
			requests.push(String(input));
			return new Response(String(input).includes('/commits/') ? expectedSha : content);
		});
		const client = store.add(service.acquireAnonymousClient());
		const sha = await client.content.resolveRef({ owner: 'microsoft', repo: 'sample' }, 'HEAD', signal());
		const result = await client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, sha, path, signal());
		assert.deepStrictEqual({ sha, result, requests }, {
			sha: expectedSha, result: content,
			requests: [`${apiBaseUri}/repos/microsoft/sample/commits/HEAD`, `${rawBaseUri}/microsoft/sample/${expectedSha}/${path}`],
		});
	});

	for (const invalidPath of ['', '..', '../main/file.json', '/file.json', '//other.example.test/file.json', 'dir/../file.json', 'dir//file.json', 'dir\\file.json']) {
		test(`rejects an invalid raw path before dispatch: ${JSON.stringify(invalidPath)}`, async () => {
			const service = create(async () => assert.fail('No fetch expected'));
			const client = store.add(service.acquireAnonymousClient());
			await assert.rejects(client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, commitSha, invalidPath, signal()), { kind: 'validation' });
		});
	}

	for (const invalidSha of ['', 'main', 'a'.repeat(39), 'z'.repeat(40), 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), `${commitSha}\n`, `${'a'.repeat(64)}\n`]) {
		test(`rejects an invalid pinned revision: ${JSON.stringify(invalidSha)}`, async () => {
			const service = create(async () => assert.fail('No fetch expected'));
			const client = store.add(service.acquireAnonymousClient());
			await assert.rejects(client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, invalidSha, path, signal()), { kind: 'validation' });
		});
	}

	for (const invalidSha of ['', 'null', '{}', 'a'.repeat(39), 'z'.repeat(40), `${commitSha}\n`]) {
		test(`rejects invalid commit responses: ${JSON.stringify(invalidSha)}`, async () => {
			const service = create(async () => new Response(invalidSha));
			const client = store.add(service.acquireAnonymousClient());
			await assert.rejects(client.content.resolveRef({ owner: 'microsoft', repo: 'sample' }, 'HEAD', signal()), SchemaError);
		});
	}

	for (const size of [0, 1024 * 1024]) {
		test(`accepts a raw file of exactly ${size} bytes`, async () => {
			const content = 'a'.repeat(size);
			const service = create(async () => new Response(content));
			const client = store.add(service.acquireAnonymousClient());
			assert.strictEqual(await client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, commitSha, path, signal()), content);
		});
	}

	test('preserves UTF-8, the byte order mark, and whitespace', async () => {
		const text = `\ufeff \t${content}\r\n `;
		const service = create(async () => new Response(text));
		const client = store.add(service.acquireAnonymousClient());
		assert.strictEqual(await client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, commitSha, path, signal()), text);
	});

	test('enforces a byte limit and cancels the oversized response', async () => {
		const cancelled = new DeferredPromise<void>();
		const bytes = new TextEncoder().encode('\u00e9'.repeat(512 * 1024 + 1));
		const service = create(async () => new Response(new ReadableStream<Uint8Array>({
			start: controller => controller.enqueue(bytes),
			cancel: () => { void cancelled.complete(); },
		})));
		const client = store.add(service.acquireAnonymousClient());
		await assert.rejects(client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, commitSha, path, signal()), { kind: 'responseTooLarge' });
		await cancelled.p;
	});

	test('does not return failed response bodies as successful files', async () => {
		const service = create(async () => new Response(new ReadableStream<Uint8Array>({ start: controller => controller.error(new Error('Body failed')) })));
		const client = store.add(service.acquireAnonymousClient());
		await assert.rejects(client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, commitSha, path, signal()), { kind: 'network' });
	});

	for (const location of [
		'https://other.example.test/file.json', `http://raw.githubusercontent.com${rawPath}`, `https://user@raw.githubusercontent.com${rawPath}`,
		'/microsoft/sample/main/file.json', `/microsoft/other/${commitSha}/file.json`, `/microsoft/sample/${commitSha}/../main/file.json`,
	]) {
		test(`rejects unsafe or unpinned raw redirects: ${location}`, async () => {
			const requests: string[] = [];
			const service = create(async input => {
				requests.push(String(input));
				return new Response(null, { status: 302, headers: { location } });
			});
			const client = store.add(service.acquireAnonymousClient());
			await assert.rejects(client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, commitSha, path, signal()), { kind: 'authorization' });
			assert.deepStrictEqual(requests, [rawBaseUri + rawPath]);
		});
	}

	test('raw redirects within the pinned revision remain credential-free', async () => {
		const requests: Request[] = [];
		const renamed = `/microsoft/sample/${commitSha}/renamed.json`;
		const service = create(async (input, init) => {
			requests.push(new Request(input, init));
			return requests.length === 1 ? new Response(null, { status: 302, headers: { location: renamed } }) : new Response(content);
		});
		const client = store.add(service.acquireAnonymousClient());
		const result = await client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, commitSha, path, signal());
		assert.deepStrictEqual({
			result, requests: requests.map(request => ({
				url: request.url, authorization: request.headers.get('authorization'), credentials: request.credentials,
			}))
		}, {
			result: content, requests: [rawBaseUri + rawPath, rawBaseUri + renamed].map(url => ({ url, authorization: null, credentials: 'omit' })),
		});
	});

	test('API quota exhaustion does not delay reads on the raw origin', async () => {
		const service = create(async input => String(input).includes('/commits/')
			? new Response(commitSha, { headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60) } })
			: new Response(content));
		const client = store.add(service.acquireAnonymousClient());
		const options = { deadline: Date.now() + 1_000 };
		const sha = await client.content.resolveRef({ owner: 'microsoft', repo: 'sample' }, 'HEAD', signal(), options);
		assert.strictEqual(await client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, sha, path, signal(), options), content);
	});

	test('raw cooldowns survive reacquisition without blocking API reads', () => runWithFakedTimers({}, async () => {
		const requests: string[] = [];
		const service = create(async input => {
			requests.push(String(input));
			return String(input).startsWith(rawBaseUri) ? new Response(null, { status: 429, headers: { 'Retry-After': '60' } }) : new Response(commitSha);
		});
		try {
			const first = store.add(service.acquireAnonymousClient());
			await assert.rejects(first.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, commitSha, path, signal()), { kind: 'rateLimit' });
			first.dispose();
			const second = store.add(service.acquireAnonymousClient());
			const sha = await second.content.resolveRef({ owner: 'microsoft', repo: 'sample' }, 'HEAD', signal());
			await assert.rejects(second.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, sha, path, signal(), { deadline: Date.now() + 50 }), { kind: 'timeout' });
			assert.deepStrictEqual(requests, [rawBaseUri + rawPath, `${apiBaseUri}/repos/microsoft/sample/commits/HEAD`]);
		} finally {
			service.dispose();
		}
	}));

	test('preserves raw HTTP failures without fallback and checks successful status codes', async () => {
		let calls = 0;
		const service = create(async () => new Response(content, { status: ++calls === 1 ? 404 : 202 }));
		const client = store.add(service.acquireAnonymousClient());
		await assert.rejects(client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, commitSha, path, signal()), { kind: 'notFound', statusCode: 404 });
		await assert.rejects(client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, commitSha, path, signal()), { kind: 'malformedResponse', statusCode: 202 });
		assert.strictEqual(calls, 2);
	});

	for (const reason of [undefined, new Error('Caller cancelled'), { cancelled: true }]) {
		test(`preserves a pre-cancelled caller's ${typeof reason} reason without dispatch`, async () => {
			const service = create(async () => assert.fail('No fetch expected'));
			const client = store.add(service.acquireAnonymousClient());
			const controller = new AbortController();
			controller.abort(reason);
			await assert.rejects(client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, commitSha, path, controller.signal), error => error === controller.signal.reason);
		});
	}

	for (const kind of ['caller', 'client', 'service'] as const) {
		test(`${kind} cancellation aborts outstanding raw reads`, async () => {
			const started = new DeferredPromise<AbortSignal>();
			const response = new DeferredPromise<Response>();
			const service = create(async (_input, init) => {
				assert.ok(init?.signal);
				void started.complete(init.signal);
				return response.p;
			});
			const client = store.add(service.acquireAnonymousClient());
			const controller = new AbortController();
			const rejected = assert.rejects(client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, commitSha, path, controller.signal), isCancellationError);
			const active = await started.p;
			if (kind === 'caller') {
				controller.abort(new CancellationError());
			} else if (kind === 'client') {
				client.dispose();
			} else {
				service.dispose();
			}
			await rejected;
			await response.complete(new Response(content));
			assert.strictEqual(active.aborted, true);
		});
	}

	test('the second operation respects the original caller deadline', () => runWithFakedTimers({}, async () => {
		const startedAt = Date.now();
		const response = new DeferredPromise<Response>();
		const service = create(async input => {
			if (String(input).includes('/commits/')) {
				await timeout(40);
				return new Response(commitSha);
			}
			return response.p;
		});
		try {
			const client = store.add(service.acquireAnonymousClient());
			const options = { caller: 'devContainerSample', deadline: startedAt + 50 };
			const sha = await client.content.resolveRef({ owner: 'microsoft', repo: 'sample' }, 'HEAD', signal(), options);
			await assert.rejects(client.content.getRawFile({ owner: 'microsoft', repo: 'sample' }, sha, path, signal(), options), { kind: 'timeout', requestDispatched: true });
			assert.strictEqual(Date.now() - startedAt, 50);
		} finally {
			await response.complete(new Response(content));
			service.dispose();
		}
	}));
});
