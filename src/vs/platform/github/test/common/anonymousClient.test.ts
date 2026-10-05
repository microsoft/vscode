/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, SinonSpy, spy } from 'sinon';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { GitHubCancellation } from '../../common/cancellation.js';
import { GitHubService, IGitHubAnonymousClient, IGitHubService } from '../../common/githubService.js';
import { GitHubAnonymousReadOptions, GitHubTransport } from '../../common/githubTransport.js';
import { GitHubAnonymousClientOptions, GitHubClientOptions, GitHubCredentialChange, GitHubRequestError, GitHubServiceOptions } from '../../common/githubTypes.js';
import { RequestFetch } from '../../common/types.js';

const apiBaseUri = 'https://api.github.com';
const account = { host: 'api.github.com', accountId: '101' };
const authorizedOptions: GitHubClientOptions = {
	apiBaseUri, graphQlUri: `${apiBaseUri}/graphql`,
	authorization: { providerId: 'github', sessionId: 'session', scopes: ['repo'] },
};

class RecordingGitHubService extends GitHubService {
	readonly apiBases: string[] = [];
	private readonly _getSpies = new Map<IGitHubAnonymousClient, SinonSpy<Parameters<IGitHubAnonymousClient['get']>, ReturnType<IGitHubAnonymousClient['get']>>>();
	releasedClients = 0;

	get reads(): { readonly path: string; readonly signal: AbortSignal; readonly options: GitHubAnonymousReadOptions | undefined }[] {
		return [...this._getSpies.values()].flatMap(spy => spy.getCalls().map(call => {
			const [path, signal, options] = call.args;
			assert.ok(!CancellationToken.isCancellationToken(signal));
			return { path, signal, options };
		}));
	}

	override acquireAnonymousClient(options?: GitHubAnonymousClientOptions): IReference<IGitHubAnonymousClient> {
		const reference = super.acquireAnonymousClient(options);
		this.apiBases.push(reference.object.apiBaseUri);
		if (!this._getSpies.has(reference.object)) {
			this._getSpies.set(reference.object, spy(reference.object, 'get'));
		}
		const release = toDisposable(() => {
			this.releasedClients++;
			reference.dispose();
		});
		return {
			object: reference.object,
			dispose: () => release.dispose(),
		};
	}
}

suite('GitHub anonymous clients', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const signal = () => new AbortController().signal;
	const create = (options: GitHubServiceOptions) => store.add(new GitHubService(options, new NullLogService(), NullTelemetryService));

	function assertRequestError(action: () => void, kind: GitHubRequestError['kind']): void {
		function isExpectedError(error: unknown): boolean {
			return error instanceof GitHubRequestError && error.kind === kind;
		}
		assert.throws(action, isExpectedError);
	}

	test('defaults to the shared GitHub.com client when options are omitted', async () => {
		const urls: string[] = [];
		const service = create({ fetch: async input => { urls.push(String(input)); return new Response('{}'); } });
		const client = store.add(service.acquireAnonymousClient()).object;
		const explicit = store.add(service.acquireAnonymousClient({ apiBaseUri })).object;
		await client.get('/repos/owner/repo', signal());
		assert.deepStrictEqual({
			apiBaseUri: client.apiBaseUri, shared: client === explicit, urls,
		}, { apiBaseUri, shared: true, urls: [`${apiBaseUri}/repos/owner/repo`] });
	});

	test('public reads require no credential provider, identity lookup or ambient credentials', async () => {
		const seen: { url: string; authorization: string | null; credentials: RequestCredentials | undefined; referrerPolicy: ReferrerPolicy | undefined; method: string | undefined; body: RequestInit['body'] }[] = [];
		const service = create({
			fetch: async (input, init) => {
				seen.push({
					url: String(input), authorization: new Headers(init?.headers).get('Authorization'),
					credentials: init?.credentials, referrerPolicy: init?.referrerPolicy, method: init?.method, body: init?.body,
				});
				return new Response('{"items":[]}');
			},
		});
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri })).object;
		const response = await client.get('/search/issues?q=test', signal());
		assert.deepStrictEqual({ authorization: client.authorization, response: response.data, seen }, {
			authorization: { kind: 'anonymous' },
			response: { items: [] },
			seen: [{ url: `${apiBaseUri}/search/issues?q=test`, authorization: null, credentials: 'omit', referrerPolicy: 'no-referrer', method: 'GET', body: undefined }],
		});
		assertRequestError(() => service.acquireClient(authorizedOptions), 'authentication');
	});

	test('get rejects an already cancelled token without fetching', async () => {
		const service = create({ fetch: async () => assert.fail('No fetch expected') });
		const client = store.add(service.acquireAnonymousClient()).object;
		await assert.rejects(client.get('/repos/owner/repo', CancellationToken.Cancelled), CancellationError);
	});

	test('get propagates token cancellation and releases the request listener', async () => {
		const cancelled = store.add(new Emitter<void>());
		const started = new DeferredPromise<AbortSignal>();
		const service = create({
			fetch: async (_input, init) => {
				assert.ok(init?.signal);
				const signal = init.signal;
				return new Promise<Response>((_resolve, reject) => {
					signal.addEventListener('abort', () => reject(signal.reason), { once: true });
					started.complete(signal);
				});
			},
		});
		const client = store.add(service.acquireAnonymousClient()).object;
		const pending = assert.rejects(client.get('/repos/owner/repo', {
			isCancellationRequested: false, onCancellationRequested: cancelled.event,
		}), CancellationError);
		const active = await started.p;
		cancelled.fire();
		await pending;
		assert.deepStrictEqual({ aborted: active.aborted, listening: cancelled.hasListeners() }, { aborted: true, listening: false });
	});

	for (const fails of [false, true]) {
		test(`get retains its token listener until settlement and then removes it (fails: ${fails})`, async () => {
			const cancelled = store.add(new Emitter<void>());
			let listeningDuringRequest = false;
			const service = create({
				fetch: async () => {
					listeningDuringRequest = cancelled.hasListeners();
					return new Response('{}', { status: fails ? 404 : 200 });
				},
			});
			const client = store.add(service.acquireAnonymousClient()).object;
			const pending = client.get('/repos/owner/repo', { isCancellationRequested: false, onCancellationRequested: cancelled.event });
			if (fails) {
				await assert.rejects(pending, { kind: 'notFound' });
			} else {
				await pending;
			}
			assert.deepStrictEqual({ listeningDuringRequest, listeningAfterRequest: cancelled.hasListeners() }, {
				listeningDuringRequest: true, listeningAfterRequest: false,
			});
		});
	}

	test('get removes its token listener when path validation fails', async () => {
		const cancelled = store.add(new Emitter<void>());
		const service = create({ fetch: async () => assert.fail('No fetch expected') });
		const client = store.add(service.acquireAnonymousClient()).object;
		await assert.rejects(client.get('//other.example.test', {
			isCancellationRequested: false, onCancellationRequested: cancelled.event,
		}), { kind: 'validation' });
		assert.strictEqual(cancelled.hasListeners(), false);
	});

	test('anonymous clients share an origin without being invalidated by sign-out', async () => {
		const changed = store.add(new Emitter<GitHubCredentialChange>());
		const service = create({
			credentialProvider: { onDidChange: changed.event, getToken: () => { throw new Error('Anonymous calls must not request a token'); } },
			fetch: async () => new Response('{"public":true}'),
		});
		const first = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		const peer = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://API.GITHUB.COM/' }));
		first.dispose();
		changed.fire({ providerId: 'github' });
		const response = await peer.object.get('/repos/owner/repo', signal());
		assert.deepStrictEqual({ shared: first.object === peer.object, response: response.data }, { shared: true, response: { public: true } });
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
				return etag
					? new Response(null, { status: 304 })
					: new Response(JSON.stringify({ visibility: authorization ? 'private' : 'public' }), { headers: { ETag: authorization ? '"private"' : '"public"' } });
			},
		});
		const authorized = store.add(service.acquireClient(authorizedOptions)).object;
		const anonymous = store.add(service.acquireAnonymousClient({ apiBaseUri })).object;
		const url = `${apiBaseUri}/repos/owner/repo`;
		await authorized.transport.rest(account, 'token', { method: 'GET', url }, signal());
		await anonymous.get('/repos/owner/repo', signal());
		const reused = await anonymous.get('/repos/owner/repo', signal());
		assert.deepStrictEqual({ seen, publicData: reused.data }, {
			seen: [{ authorization: true, etag: null }, { authorization: false, etag: null }, { authorization: false, etag: '"public"' }],
			publicData: { visibility: 'public' },
		});
	});

	test('anonymous reads coalesce and cancellation preserves a live peer', async () => {
		const started = new DeferredPromise<AbortSignal>();
		const response = new DeferredPromise<Response>();
		let calls = 0;
		const service = create({
			fetch: async (_input, init) => {
				calls++;
				assert.ok(init?.signal);
				await started.complete(init.signal);
				return response.p;
			},
		});
		const first = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		const second = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		const controller = new AbortController();
		const reason = new Error('cancelled');
		const rejected = assert.rejects(first.object.get('/repos/owner/repo', controller.signal), error => error === reason);
		const peer = second.object.get('/repos/owner/repo', signal());
		const active = await started.p;
		controller.abort(reason);
		first.dispose();
		await rejected;
		await response.complete(new Response('{"ok":true}'));
		await peer;
		assert.deepStrictEqual({ calls, aborted: active.aborted }, { calls: 1, aborted: false });
	});

	test('last-reference disposal stops only anonymous work and later reads can reacquire', async () => {
		const started = new DeferredPromise<AbortSignal>();
		let calls = 0;
		const service = create({
			fetch: async (_input, init) => {
				if (++calls === 1) {
					assert.ok(init?.signal);
					const signal = init.signal;
					await started.complete(signal);
					return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
				}
				return new Response('{}');
			},
		});
		const reference = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		const pending = assert.rejects(reference.object.get('/repos/owner/repo', signal()));
		const active = await started.p;
		reference.dispose();
		await pending;
		await assert.rejects(reference.object.get('/repos/owner/repo', signal()), /disposed/);
		const replacement = store.add(service.acquireAnonymousClient({ apiBaseUri })).object;
		await replacement.get('/repos/owner/repo', signal());
		assert.deepStrictEqual({ aborted: active.aborted, replaced: replacement !== reference.object, calls }, { aborted: true, replaced: true, calls: 2 });
	});

	for (const mode of ['shared-origin', 'reacquired'] as const) {
		test(`anonymous cooldown survives ${mode} while authenticated traffic remains independent`, () => runWithFakedTimers({}, async () => {
			const started = Date.now();
			const requests: { url: string; at: number; authenticated: boolean }[] = [];
			const service = create({
				credentialProvider: { onDidChange: Event.None, getToken: () => 'token' },
				fetch: async (input, init) => {
					requests.push({ url: String(input), at: Date.now() - started, authenticated: new Headers(init?.headers).has('Authorization') });
					return requests.length === 1 ? new Response('{"message":"secondary rate limit"}', { status: 403, headers: { 'Retry-After': '5' } }) : new Response('{}');
				},
			});
			try {
				const first = store.add(service.acquireAnonymousClient({ apiBaseUri }));
				await assert.rejects(first.object.get('/repos/owner/repo', signal()), { kind: 'rateLimit' });
				if (mode === 'reacquired') {
					first.dispose();
				}
				const second = store.add(service.acquireAnonymousClient({ apiBaseUri: mode === 'shared-origin' ? `${apiBaseUri}/api/v3` : apiBaseUri }));
				const authorized = store.add(service.acquireClient(authorizedOptions)).object;
				await authorized.transport.rest(account, 'token', { method: 'GET', url: `${apiBaseUri}/repos/owner/other` }, signal());
				await second.object.get('/search/issues?q=test', signal());
				assert.deepStrictEqual(requests, [
					{ url: `${apiBaseUri}/repos/owner/repo`, at: 0, authenticated: false },
					{ url: `${apiBaseUri}/repos/owner/other`, at: 0, authenticated: true },
					{ url: `${second.object.apiBaseUri}/search/issues?q=test`, at: 5_000, authenticated: false },
				]);
			} finally {
				service.dispose();
			}
		}));
	}

	test('authenticated failures never trigger anonymous fallback or borrow another credential', async () => {
		const requests: boolean[] = [];
		const service = create({
			credentialProvider: { onDidChange: Event.None, getToken: () => { throw new Error('Unexpected credential selection'); } },
			fetch: async (_input, init) => {
				requests.push(new Headers(init?.headers).has('Authorization'));
				return new Response('{"message":"Not Found"}', { status: 404 });
			},
		});
		const authorized = store.add(service.acquireClient(authorizedOptions)).object;
		const anonymous = store.add(service.acquireAnonymousClient({ apiBaseUri })).object;
		await assert.rejects(authorized.transport.rest(account, 'token', { method: 'GET', url: `${apiBaseUri}/private` }, signal()), { kind: 'notFound' });
		await assert.rejects(anonymous.get('/private', signal()), { kind: 'notFound' });
		assert.deepStrictEqual(requests, [true, false]);
	});

	test('anonymous and authenticated contexts share the engine client-capacity limit', () => {
		const service = create({ credentialProvider: { onDidChange: Event.None, getToken: () => 'token' } });
		for (let i = 0; i < 63; i++) {
			store.add(service.acquireClient({ ...authorizedOptions, authorization: { ...authorizedOptions.authorization, sessionId: String(i) } }));
		}
		const publicClient = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		assertRequestError(() => service.acquireAnonymousClient({ apiBaseUri: 'https://other.example.test' }), 'overloaded');
		publicClient.dispose();
		const replacement = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://other.example.test' }));
		assert.strictEqual(replacement.object.apiBaseUri, 'https://other.example.test');
	});

	test('rejects unsafe endpoints and paths before invoking fetch', async () => {
		let calls = 0;
		const service = create({ fetch: async () => { calls++; return new Response('{}'); } });
		for (const endpoint of ['not a URL', 'http://api.github.com', 'https://name:password@api.github.com', 'https://api.github.com?secret=value', 'https://api.github.com#fragment']) {
			assertRequestError(() => service.acquireAnonymousClient({ apiBaseUri: endpoint }), 'validation');
		}
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://enterprise.example.test/api/v3' })).object;
		for (const path of ['https://other.example.test', '//other.example.test', '/../../outside', '/%2e%2e/%2e%2e/outside', '/repos\\owner', '/repos#fragment']) {
			await assert.rejects(client.get(path, signal()), { kind: 'validation' });
		}
		assert.strictEqual(calls, 0);
	});

	test('redirects never attach credentials and cannot change origin', async () => {
		const requests: { url: string; credentialless: boolean }[] = [];
		const service = create({
			fetch: async (input, init) => {
				requests.push({ url: String(input), credentialless: init?.credentials === 'omit' && !new Headers(init.headers).has('Authorization') });
				return new Response(null, { status: 302, headers: { Location: requests.length === 1 ? '/renamed' : 'https://other.example.test/data' } });
			},
		});
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri })).object;
		await assert.rejects(client.get('/old', signal()), { kind: 'authorization' });
		assert.deepStrictEqual(requests, [{ url: `${apiBaseUri}/old`, credentialless: true }, { url: `${apiBaseUri}/renamed`, credentialless: true }]);
	});

	for (const location of ['/outside', '../outside', '/api/v30/outside', '/api/v3/../outside', '/api/v3/%2e%2e/outside', '/api/v3']) {
		test(`rejects anonymous redirects outside the API base: ${location}`, async () => {
			const baseUri = 'https://enterprise.example.test/api/v3';
			const requests: string[] = [];
			const service = create({
				fetch: async input => {
					requests.push(String(input));
					return String(input) === `${baseUri}/old`
						? new Response(null, { status: 302, headers: { Location: location } })
						: new Response('{"outside":true}', { headers: { ETag: '"outside"' } });
				},
			});
			const client = store.add(service.acquireAnonymousClient({ apiBaseUri: `${baseUri}///` })).object;
			await assert.rejects(client.get('/old', signal()), { kind: 'authorization' });
			await assert.rejects(client.get('/old', signal()), { kind: 'authorization' });
			assert.deepStrictEqual(requests, [`${baseUri}/old`, `${baseUri}/old`]);
		});
	}

	test('anonymous redirects within the normalized API base retain conditional caching', async () => {
		const baseUri = 'https://enterprise.example.test/api/v3';
		const requests: { url: string; etag: string | null }[] = [];
		const service = create({
			fetch: async (input, init) => {
				const etag = new Headers(init?.headers).get('If-None-Match');
				requests.push({ url: String(input), etag });
				if (String(input) === `${baseUri}/old`) {
					return new Response(null, { status: 301, headers: { Location: 'renamed' } });
				}
				return etag
					? new Response(null, { status: 304 })
					: new Response('{"public":true}', { headers: { ETag: '"public"' } });
			},
		});
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://enterprise.example.test/ignored/../api/v3///' })).object;
		await client.get('/old', signal());
		const reused = await client.get('/old', signal());
		assert.deepStrictEqual({ requests, statusCode: reused.statusCode, data: reused.data, finalUrl: reused.finalUrl }, {
			requests: [
				{ url: `${baseUri}/old`, etag: null },
				{ url: `${baseUri}/renamed`, etag: null },
				{ url: `${baseUri}/renamed`, etag: '"public"' },
			],
			statusCode: 304, data: { public: true }, finalUrl: `${baseUri}/renamed`,
		});
	});

	test('a cached anonymous redirect cannot redirect outside the API base', async () => {
		const baseUri = 'https://enterprise.example.test/api/v3';
		const requests: string[] = [];
		const service = create({
			fetch: async input => {
				requests.push(String(input));
				if (String(input) === `${baseUri}/old`) {
					return new Response(null, { status: 302, headers: { Location: '/api/v3/renamed' } });
				}
				return requests.length === 3
					? new Response(null, { status: 307, headers: { Location: '/outside' } })
					: new Response('{"public":true}', { headers: { ETag: '"public"' } });
			},
		});
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri: baseUri })).object;
		await client.get('/old', signal());
		await assert.rejects(client.get('/old', signal()), { kind: 'authorization' });
		assert.deepStrictEqual(requests, [`${baseUri}/old`, `${baseUri}/renamed`, `${baseUri}/renamed`]);
	});

	test('anonymous API path boundaries do not restrict authenticated redirects', async () => {
		const baseUri = 'https://enterprise.example.test/api/v3';
		const requests: string[] = [];
		const service = create({
			credentialProvider: { onDidChange: Event.None, getToken: () => 'token' },
			fetch: async input => {
				requests.push(String(input));
				return requests.length === 1
					? new Response(null, { status: 302, headers: { Location: '/outside' } })
					: new Response('{"authenticated":true}');
			},
		});
		const client = store.add(service.acquireClient({ ...authorizedOptions, apiBaseUri: baseUri, graphQlUri: 'https://enterprise.example.test/api/graphql' })).object;
		const response = await client.transport.rest({ host: 'enterprise.example.test', accountId: '101' }, 'token', { method: 'GET', url: `${baseUri}/old` }, signal());
		assert.deepStrictEqual({ requests, data: response.data }, {
			requests: [`${baseUri}/old`, 'https://enterprise.example.test/outside'], data: { authenticated: true },
		});
	});

	test('anonymous work participates in the same host concurrency bound as authenticated work', async () => {
		const gates = Array.from({ length: 3 }, () => new DeferredPromise<Response>());
		const requests: boolean[] = [];
		let active = 0;
		let highWater = 0;
		const service = create({
			credentialProvider: { onDidChange: Event.None, getToken: () => 'token' },
			fetch: async (_input, init) => {
				const index = requests.length;
				requests.push(new Headers(init?.headers).has('Authorization'));
				highWater = Math.max(highWater, ++active);
				try {
					return await gates[index].p;
				} finally {
					active--;
				}
			},
		});
		const anonymous = store.add(service.acquireAnonymousClient({ apiBaseUri })).object;
		const authenticated = store.add(service.acquireClient(authorizedOptions)).object;
		const operations = [
			anonymous.get('/repos/owner/public', signal(), { caller: 'public' }),
			authenticated.transport.rest(account, 'token', { method: 'GET', url: `${apiBaseUri}/repos/owner/first`, caller: 'first' }, signal()),
			authenticated.transport.rest({ ...account, accountId: '202' }, 'other-token', { method: 'GET', url: `${apiBaseUri}/repos/owner/second`, caller: 'second' }, signal()),
		];
		await timeout(0);
		const initiallyStarted = requests.length;
		for (const gate of gates) {
			await gate.complete(new Response('{}'));
		}
		await Promise.all(operations);
		assert.deepStrictEqual({ initiallyStarted, highWater, requests }, { initiallyStarted: 2, highWater: 2, requests: [false, true, true] });
	});

	test('different API paths on the same origin cannot multiply anonymous concurrency', async () => {
		const gate = new DeferredPromise<Response>();
		const requests: string[] = [];
		const service = create({
			fetch: async input => {
				requests.push(String(input));
				return requests.length === 1 ? gate.p : new Response('{}');
			},
		});
		const first = store.add(service.acquireAnonymousClient({ apiBaseUri })).object;
		const otherPath = store.add(service.acquireAnonymousClient({ apiBaseUri: `${apiBaseUri}/api/v3` })).object;
		const operations = [first.get('/first', signal()), otherPath.get('/second', signal())];
		await timeout(0);
		const beforeRelease = requests.length;
		await gate.complete(new Response('{}'));
		await Promise.all(operations);
		assert.deepStrictEqual({ beforeRelease, requests }, {
			beforeRelease: 1, requests: [`${apiBaseUri}/first`, `${apiBaseUri}/api/v3/second`],
		});
	});

	test('anonymous work respects deadlines while parked by a server cooldown', () => runWithFakedTimers({}, async () => {
		let calls = 0;
		const service = create({ fetch: async () => { calls++; return new Response(null, { status: 429, headers: { 'Retry-After': '60' } }); } });
		try {
			const client = store.add(service.acquireAnonymousClient({ apiBaseUri })).object;
			await assert.rejects(client.get('/repos/owner/repo', signal()), { kind: 'rateLimit' });
			const pending = assert.rejects(client.get('/repos/owner/other', signal(), { deadline: Date.now() + 50 }), { kind: 'timeout' });
			await timeout(50);
			await pending;
			assert.strictEqual(calls, 1);
		} finally {
			service.dispose();
		}
	}));
});

suite('GitHub public repository files', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => restore());
	const commitSha = 'a'.repeat(40);
	const rawBaseUri = 'https://raw.githubusercontent.com';
	const path = '.devcontainer/devcontainer.json';
	const paths = ['/repos/microsoft/sample/commits/HEAD'];
	const rawPath = `/microsoft/sample/${commitSha}/${path}`;
	const content = '{ // JSONC and UTF-8\n"image":"image","name":"caf\u00e9",}';

	function fileResponse(input: Parameters<RequestFetch>[0], text = content): Response {
		return new Response(String(input).endsWith('/commits/HEAD') ? JSON.stringify({ sha: commitSha }) : text);
	}

	function create(fetch: RequestFetch): RecordingGitHubService {
		return store.add(new RecordingGitHubService({
			fetch,
			credentialProvider: {
				onDidChange: Event.None,
				getToken: () => { throw new Error('Public repository reads must not request credentials'); },
			},
		}, new NullLogService(), NullTelemetryService));
	}

	async function read(service: IGitHubService, signal: GitHubCancellation = new AbortController().signal, options?: GitHubAnonymousReadOptions) {
		const client = store.add(service.acquireAnonymousClient());
		try {
			return await client.object.getFile('microsoft', 'sample', path, signal, options);
		} finally {
			client.dispose();
		}
	}

	test('equivalent anonymous leases share a client without fetching at construction', () => {
		const service = create(async () => { throw new Error('No fetch expected'); });
		const first = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		const second = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		const other = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://github.example.test/api/v3' }));
		assert.deepStrictEqual({
			sameClient: first.object === second.object,
			differentEndpoint: first.object !== other.object, reads: service.reads,
		}, { sameClient: true, differentEndpoint: true, reads: [] });
	});

	test('raw endpoint options participate in client identity without changing API identity', () => {
		const service = create(async () => assert.fail('No fetch expected'));
		const defaults = store.add(service.acquireAnonymousClient()).object;
		const explicit = store.add(service.acquireAnonymousClient({ apiBaseUri, rawBaseUri: 'https://RAW.GITHUBUSERCONTENT.COM///' })).object;
		const other = store.add(service.acquireAnonymousClient({ apiBaseUri, rawBaseUri: 'https://raw.example.test' })).object;
		assert.deepStrictEqual({
			shared: defaults === explicit, differentRawEndpoint: defaults !== other, apiBaseUri: other.apiBaseUri,
		}, { shared: true, differentRawEndpoint: true, apiBaseUri });
	});

	test('custom API hosts require an explicit raw endpoint for file reads', async () => {
		const service = create(async () => assert.fail('No fetch expected'));
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://github.example.test/api/v3' })).object;
		await assert.rejects(client.getFile('microsoft', 'sample', path, CancellationToken.None), { kind: 'validation' });
		assert.deepStrictEqual(service.reads, []);
	});

	test('rejects invalid raw endpoints rather than falling back to GitHub.com', () => {
		const service = create(async () => assert.fail('No fetch expected'));
		for (const rawBaseUri of ['', 'not a URL', 'http://raw.example.test', 'https://user@raw.example.test', 'https://raw.example.test?query=value', 'https://raw.example.test#fragment']) {
			function isValidationError(error: unknown): boolean {
				return error instanceof GitHubRequestError && error.kind === 'validation';
			}
			assert.throws(() => service.acquireAnonymousClient({ apiBaseUri, rawBaseUri }), isValidationError);
		}
	});

	test('rejects file reads after the anonymous client is disposed', async () => {
		const service = create(async () => { throw new Error('No fetch expected'); });
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		client.dispose();
		await assert.rejects(client.object.getFile('microsoft', 'sample', path, CancellationToken.None), { kind: 'unknown', message: 'GitHub client was disposed' });
		assert.strictEqual(service.releasedClients, 1);
	});

	test('uses the configured API and raw bases without acquiring another lease', async () => {
		const endpoint = 'https://github.example.test/api/v3';
		const rawEndpoint = 'https://github.example.test/raw';
		const requests: Request[] = [];
		const service = create(async (input, init) => {
			requests.push(new Request(input, init));
			return fileResponse(input);
		});
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri: endpoint, rawBaseUri: rawEndpoint }));
		const first = await client.object.getFile('microsoft', 'sample', path, CancellationToken.None);
		const second = await client.object.getFile('microsoft', 'sample', path, new AbortController().signal);
		assert.deepStrictEqual({
			first, second, apiBases: service.apiBases, releasedClients: service.releasedClients,
			requests: requests.map(request => ({ url: request.url, authorization: request.headers.get('authorization') })),
		}, {
			first: { commitSha, content }, second: { commitSha, content }, apiBases: [endpoint], releasedClients: 0,
			requests: [endpoint + paths[0], rawEndpoint + rawPath, endpoint + paths[0], rawEndpoint + rawPath].map(url => ({ url, authorization: null })),
		});
	});

	test('uses one API read and a commit-pinned raw download without credentials or content parsing', () => runWithFakedTimers({}, async () => {
		const requests: Request[] = [];
		const download = spy(GitHubTransport.prototype, 'anonymousDownload');
		const controller = new AbortController();
		const startedAt = Date.now();
		const service = create(async (input, init) => {
			requests.push(new Request(input, init));
			if (requests.length === 1) {
				await timeout(10);
				return new Response(JSON.stringify({ sha: commitSha }));
			}
			return new Response(content);
		});
		try {
			const result = await read(service, controller.signal);
			assert.deepStrictEqual({
				result,
				apiBases: service.apiBases,
				releasedClients: service.releasedClients,
				reads: service.reads.map(read => ({ path: read.path, options: read.options, sameSignal: read.signal === controller.signal, aborted: read.signal.aborted })),
				rawSignal: download.firstCall.args[3] === controller.signal,
				requests: requests.map(request => ({ url: request.url, method: request.method, credentials: request.credentials, referrerPolicy: request.referrerPolicy, authorization: request.headers.get('authorization') })),
				rawApiHeaders: ['x-github-api-version', 'x-client-application', 'x-client-source', 'x-client-feature', 'x-is-retry'].map(name => requests[1].headers.get(name)),
			}, {
				result: { commitSha, content },
				apiBases: [apiBaseUri],
				releasedClients: 1,
				reads: paths.map(path => ({ path, options: { deadline: startedAt + 5 * 60_000 }, sameSignal: true, aborted: false })),
				rawSignal: true,
				requests: [apiBaseUri + paths[0], rawBaseUri + rawPath].map(url => ({ url, method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', authorization: null })),
				rawApiHeaders: [null, null, null, null, null],
			});
		} finally {
			service.dispose();
		}
	}));

	test('encodes raw file path segments without changing the pinned revision', async () => {
		const requests: string[] = [];
		const service = create(async input => {
			requests.push(String(input));
			return fileResponse(input);
		});
		const client = store.add(service.acquireAnonymousClient()).object;
		const result = await client.getFile('microsoft', 'sample', 'docs/a #?%.md', CancellationToken.None);
		assert.deepStrictEqual({ result, requests }, {
			result: { commitSha, content },
			requests: [apiBaseUri + paths[0], `${rawBaseUri}/microsoft/sample/${commitSha}/docs/a%20%23%3F%25.md`],
		});
	});

	for (const invalidPath of ['', '..', '../main/file.json', '/microsoft/sample/main/file.json', '//other.example.test/file.json']) {
		test(`rejects a path that escapes the pinned raw revision: ${JSON.stringify(invalidPath)}`, async () => {
			const requests: string[] = [];
			const service = create(async input => {
				requests.push(String(input));
				return fileResponse(input);
			});
			const client = store.add(service.acquireAnonymousClient()).object;
			await assert.rejects(client.getFile('microsoft', 'sample', invalidPath, CancellationToken.None), { kind: 'validation' });
			assert.deepStrictEqual(requests, [apiBaseUri + paths[0]]);
		});
	}

	test('getFile forwards caller-selected options and a shared deadline without mutating them', async () => {
		const download = spy(GitHubTransport.prototype, 'anonymousDownload');
		const options = Object.freeze({
			caller: 'test.repositoryReader',
			priority: 'background' as const,
			deadline: Date.now() + 10_000,
			etag: false,
		});
		const service = create(async input => fileResponse(input));
		const result = await read(service, CancellationToken.None, options);
		assert.deepStrictEqual({
			result, requests: service.reads.map(read => ({ path: read.path, options: read.options })),
			rawRequest: download.firstCall.args[2],
		}, {
			result: { commitSha, content }, requests: paths.map(path => ({ path, options })),
			rawRequest: { url: rawBaseUri + rawPath, maximumBytes: 1024 * 1024, timeout: 5 * 60_000, caller: options.caller, priority: options.priority, deadline: options.deadline },
		});
	});

	test('getFile honors a caller deadline without fetching', async () => {
		const service = create(async () => assert.fail('No fetch expected'));
		await assert.rejects(read(service, CancellationToken.None, { deadline: Date.now() - 1 }), { kind: 'timeout' });
		assert.strictEqual(service.releasedClients, 1);
	});

	for (const [name, response] of [
		['missing', undefined], ['null', null], ['array', []], ['missing SHA', {}],
		['non-string SHA', { sha: 123 }], ['short SHA', { sha: 'a'.repeat(39) }],
		['non-hex SHA', { sha: 'z'.repeat(40) }],
		['newline-suffixed SHA', { sha: `${commitSha}\n` }],
	] as const) {
		test(`rejects ${name} commit responses before requesting contents`, async () => {
			const service = create(async () => new Response(JSON.stringify(response)));
			await assert.rejects(read(service), { kind: 'malformedResponse' });
			assert.deepStrictEqual({ paths: service.reads.map(read => read.path), released: service.releasedClients }, { paths: [paths[0]], released: 1 });
		});
	}

	for (const size of [0, 1024 * 1024]) {
		test(`accepts a file of exactly ${size} bytes`, async () => {
			const content = 'a'.repeat(size);
			const service = create(async input => fileResponse(input, content));
			assert.deepStrictEqual(await read(service), { commitSha, content });
		});
	}

	test('preserves raw UTF-8 text, its byte order mark and whitespace', async () => {
		const text = `\ufeff \t${content}\r\n `;
		const service = create(async input => fileResponse(input, text));
		assert.deepStrictEqual(await read(service), { commitSha, content: text });
	});

	test('bounds raw bytes rather than characters and cancels an oversized response', async () => {
		const cancelled = new DeferredPromise<void>();
		const bytes = new TextEncoder().encode('\u00e9'.repeat(512 * 1024 + 1));
		const service = create(async input => String(input).endsWith('/commits/HEAD')
			? new Response(JSON.stringify({ sha: commitSha }))
			: new Response(new ReadableStream<Uint8Array>({
				start: controller => controller.enqueue(bytes),
				cancel: () => { cancelled.complete(); },
			})));
		await assert.rejects(read(service), { kind: 'responseTooLarge' });
		await cancelled.p;
		assert.strictEqual(service.releasedClients, 1);
	});

	test('a failed raw response body is not returned as a successful file', async () => {
		const service = create(async input => String(input).endsWith('/commits/HEAD')
			? new Response(JSON.stringify({ sha: commitSha }))
			: new Response(new ReadableStream<Uint8Array>({ start: controller => controller.error(new Error('Body failed')) })));
		await assert.rejects(read(service), { kind: 'network' });
		assert.strictEqual(service.releasedClients, 1);
	});

	for (const location of [
		'https://other.example.test/file.json',
		`http://raw.githubusercontent.com${rawPath}`,
		`https://user@raw.githubusercontent.com${rawPath}`,
		'/microsoft/sample/main/.devcontainer/devcontainer.json',
		`/microsoft/other/${commitSha}/.devcontainer/devcontainer.json`,
	]) {
		test(`rejects an unsafe or unpinned raw redirect: ${location}`, async () => {
			const requests: Request[] = [];
			const service = create(async (input, init) => {
				requests.push(new Request(input, init));
				return String(input).endsWith('/commits/HEAD')
					? new Response(JSON.stringify({ sha: commitSha }))
					: new Response(null, { status: 302, headers: { location } });
			});
			await assert.rejects(read(service), { kind: 'authorization' });
			assert.deepStrictEqual(requests.map(request => ({ url: request.url, credentials: request.credentials, authorization: request.headers.get('authorization') })), [
				{ url: apiBaseUri + paths[0], credentials: 'omit', authorization: null },
				{ url: rawBaseUri + rawPath, credentials: 'omit', authorization: null },
			]);
		});
	}

	test('raw redirects within the pinned revision remain credential-free', async () => {
		const requests: Request[] = [];
		const redirectedPath = `/microsoft/sample/${commitSha}/.devcontainer/renamed.json`;
		const service = create(async (input, init) => {
			requests.push(new Request(input, init));
			return String(input).endsWith('/commits/HEAD')
				? new Response(JSON.stringify({ sha: commitSha }))
				: requests.length === 2 ? new Response(null, { status: 302, headers: { location: redirectedPath } })
					: new Response(content);
		});
		const result = await read(service);
		assert.deepStrictEqual({
			result, requests: requests.map(request => ({ url: request.url, credentials: request.credentials, referrerPolicy: request.referrerPolicy, authorization: request.headers.get('authorization') })),
		}, {
			result: { commitSha, content },
			requests: [apiBaseUri + paths[0], rawBaseUri + rawPath, rawBaseUri + redirectedPath].map(url => ({
				url, credentials: 'omit', referrerPolicy: 'no-referrer', authorization: null,
			})),
		});
	});

	test('raw downloads do not wait on an exhausted REST API quota', async () => {
		const requests: string[] = [];
		const service = create(async input => {
			requests.push(String(input));
			return String(input).endsWith('/commits/HEAD')
				? new Response(JSON.stringify({ sha: commitSha }), { headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60) } })
				: new Response(content);
		});
		const result = await read(service, CancellationToken.None, { deadline: Date.now() + 1000 });
		assert.deepStrictEqual({ result, requests }, { result: { commitSha, content }, requests: [apiBaseUri + paths[0], rawBaseUri + rawPath] });
	});

	test('raw cooldowns survive client release without blocking API reads', () => runWithFakedTimers({}, async () => {
		const requests: string[] = [];
		let rawRequests = 0;
		const service = create(async input => {
			const url = String(input);
			requests.push(url);
			if (url.startsWith(rawBaseUri)) {
				return ++rawRequests === 1 ? new Response(null, { status: 429, headers: { 'Retry-After': '60' } }) : new Response(content);
			}
			return new Response(JSON.stringify({ sha: commitSha }));
		});
		try {
			await assert.rejects(read(service), { kind: 'rateLimit', statusCode: 429 });
			const client = store.add(service.acquireAnonymousClient()).object;
			await client.get('/probe', CancellationToken.None);
			const pending = assert.rejects(client.getFile('microsoft', 'sample', path, CancellationToken.None, { deadline: Date.now() + 50 }), { kind: 'timeout' });
			await timeout(50);
			await pending;
			assert.deepStrictEqual(requests, [apiBaseUri + paths[0], rawBaseUri + rawPath, `${apiBaseUri}/probe`, apiBaseUri + paths[0]]);
		} finally {
			service.dispose();
		}
	}));

	test('propagates raw HTTP errors without falling back to the API and releases the lease', async () => {
		const service = create(async input => String(input).endsWith('/commits/HEAD')
			? new Response(JSON.stringify({ sha: commitSha }))
			: new Response('{}', { status: 404 }));
		await assert.rejects(read(service), { kind: 'notFound', statusCode: 404 });
		assert.deepStrictEqual({ paths: service.reads.map(read => read.path), released: service.releasedClients }, { paths, released: 1 });
	});

	for (const [name, reason] of [['default', undefined], ['custom', new Error('Caller cancelled')], ['non-error', { cancelled: true }]] as const) {
		test(`cancellation before reading preserves the ${name} abort reason without requests`, async () => {
			const service = create(async () => { throw new Error('No fetch expected'); });
			const controller = new AbortController();
			controller.abort(reason);
			await assert.rejects(read(service, controller.signal), error => error === controller.signal.reason);
			assert.deepStrictEqual({ apiBases: service.apiBases, reads: service.reads, released: service.releasedClients }, { apiBases: [apiBaseUri], reads: [], released: 1 });
		});
	}

	test('a cancelled token performs no reads', async () => {
		const service = create(async () => assert.fail('No fetch expected'));
		await assert.rejects(read(service, CancellationToken.Cancelled), CancellationError);
		assert.deepStrictEqual({ apiBases: service.apiBases, reads: service.reads, released: service.releasedClients }, { apiBases: [apiBaseUri], reads: [], released: 1 });
	});

	for (const kind of ['signal', 'token'] as const) {
		for (const cancelledRead of [1, 2]) {
			test(`${kind} cancels read ${cancelledRead}, preserves the abort reason and releases the lease`, async () => {
				const controller = new AbortController();
				const token = store.add(new CancellationTokenSource());
				const reason = new Error('Caller cancelled');
				const started = new DeferredPromise<AbortSignal>();
				let calls = 0;
				const service = create(async (_input, init) => {
					if (++calls !== cancelledRead) {
						return new Response(JSON.stringify({ sha: commitSha }));
					}
					assert.ok(init?.signal);
					const signal = init.signal;
					return new Promise<Response>((_resolve, reject) => {
						signal.addEventListener('abort', () => reject(signal.reason), { once: true });
						started.complete(signal);
					});
				});
				const rejected = assert.rejects(read(service, kind === 'signal' ? controller.signal : token.token),
					error => kind === 'signal' ? error === reason : error instanceof CancellationError);
				const signal = await started.p;
				if (kind === 'signal') {
					controller.abort(reason);
				} else {
					token.cancel();
				}
				await rejected;
				assert.deepStrictEqual({ calls, aborted: signal.aborted, released: service.releasedClients }, { calls: cancelledRead, aborted: true, released: 1 });
			});
		}
	}

	for (const fails of [false, true]) {
		test(`releases the token adapter and lease when the repository read settles (fails: ${fails})`, async () => {
			const download = spy(GitHubTransport.prototype, 'anonymousDownload');
			const token = store.add(new CancellationTokenSource());
			const service = create(async input => String(input).endsWith('/commits/HEAD')
				? new Response(JSON.stringify({ sha: commitSha }))
				: new Response(content, { status: fails ? 404 : 200 }));
			if (fails) {
				await assert.rejects(read(service, token.token), { kind: 'notFound' });
			} else {
				assert.deepStrictEqual(await read(service, token.token), { commitSha, content });
			}
			token.cancel();
			assert.deepStrictEqual({
				paths: service.reads.map(read => read.path), aborted: service.reads.map(read => read.signal.aborted),
				sameSignal: service.reads[0].signal === download.firstCall.args[3], released: service.releasedClients,
			}, { paths, aborted: [false], sameSignal: true, released: 1 });
		});
	}

	test('releases the token listener when the client has already been disposed', async () => {
		const cancelled = store.add(new Emitter<void>());
		const service = create(async () => assert.fail('No fetch expected'));
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		client.dispose();
		await assert.rejects(client.object.getFile('microsoft', 'sample', path, {
			isCancellationRequested: false, onCancellationRequested: cancelled.event,
		}), { kind: 'unknown', message: 'GitHub client was disposed' });
		assert.strictEqual(cancelled.hasListeners(), false);
	});

	test('cancelling one repository read and releasing its lease preserves a live peer', async () => {
		const started = new DeferredPromise<AbortSignal>();
		const commitResponse = new DeferredPromise<Response>();
		let attempts = 0;
		const service = create(async (input, init) => {
			attempts++;
			if (String(input).endsWith('/commits/HEAD')) {
				assert.ok(init?.signal);
				started.complete(init.signal);
				return commitResponse.p;
			}
			return new Response(content);
		});
		const first = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		const second = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		const controller = new AbortController();
		const reason = new Error('Caller cancelled');
		const rejected = assert.rejects(first.object.getFile('microsoft', 'sample', path, controller.signal), error => error === reason);
		const peer = second.object.getFile('microsoft', 'sample', path, CancellationToken.None);
		const signal = await started.p;
		controller.abort(reason);
		first.dispose();
		await rejected;
		await commitResponse.complete(new Response(JSON.stringify({ sha: commitSha })));
		const result = await peer;
		assert.deepStrictEqual({
			result, attempts, aborted: signal.aborted, releasedClients: service.releasedClients,
		}, { result: { commitSha, content }, attempts: 2, aborted: false, releasedClients: 1 });
	});

	test('disposing the owning service aborts file reads and releases the lease', async () => {
		const controller = new AbortController();
		const started = new DeferredPromise<AbortSignal>();
		const service = create(async (_input, init) => {
			assert.ok(init?.signal);
			const signal = init.signal;
			await started.complete(signal);
			return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
		});
		const rejected = assert.rejects(read(service, controller.signal));
		const signal = await started.p;
		service.dispose();
		await rejected;
		assert.deepStrictEqual({ aborted: signal.aborted, callerAborted: controller.signal.aborted, released: service.releasedClients }, { aborted: true, callerAborted: false, released: 1 });
	});

	test('the second read expires at the original operation deadline', () => runWithFakedTimers({}, async () => {
		const download = spy(GitHubTransport.prototype, 'anonymousDownload');
		const startedAt = Date.now();
		const token = store.add(new CancellationTokenSource());
		let calls = 0;
		const service = create(async (_input, init) => {
			if (++calls === 1) {
				await timeout(60_000);
				return new Response(JSON.stringify({ sha: commitSha }));
			}
			assert.ok(init?.signal);
			const signal = init.signal;
			return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
		});
		try {
			const rejected = assert.rejects(read(service, token.token), { kind: 'timeout' });
			await timeout(5 * 60_000);
			await rejected;
			token.cancel();
			assert.deepStrictEqual({
				calls, released: service.releasedClients, deadlines: service.reads.map(read => read.options?.deadline),
				rawDeadline: download.firstCall.args[2].deadline,
				aborted: service.reads.map(read => read.signal.aborted), elapsed: Date.now() - startedAt,
			}, { calls: 2, released: 1, deadlines: [startedAt + 5 * 60_000], rawDeadline: startedAt + 5 * 60_000, aborted: [false], elapsed: 5 * 60_000 });
		} finally {
			service.dispose();
		}
	}));
});
