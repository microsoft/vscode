/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, SinonSpy, spy } from 'sinon';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
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
import { GitHubAnonymousReadOptions } from '../../common/githubTransport.js';
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
		return [...this._getSpies.values()].flatMap(spy => spy.getCalls().map(call => ({ path: call.args[0], signal: call.args[1], options: call.args[2] })));
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
	const blobSha = 'b'.repeat(40);
	const path = '.devcontainer/devcontainer.json';
	const paths = ['/repos/microsoft/sample/commits/HEAD', `/repos/microsoft/sample/contents/${path}?ref=${commitSha}`];
	const content = '{ // JSONC and UTF-8\n"image":"image","name":"caf\u00e9",}';

	function file(content: string) {
		const buffer = VSBuffer.fromString(content);
		return {
			type: 'file', sha: blobSha, encoding: 'base64', size: buffer.byteLength, content: encodeBase64(buffer),
			download_url: `https://raw.githubusercontent.com/microsoft/sample/${commitSha}/${path}`,
		};
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

	async function read(service: IGitHubService, cancellation: GitHubCancellation = new AbortController().signal) {
		const client = store.add(service.acquireAnonymousClient());
		try {
			return await client.object.readFile('microsoft', 'sample', path, cancellation);
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

	test('rejects file reads after the anonymous client is disposed', async () => {
		const service = create(async () => { throw new Error('No fetch expected'); });
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		client.dispose();
		await assert.rejects(client.object.readFile('microsoft', 'sample', path, CancellationToken.None), { kind: 'unknown', message: 'GitHub client was disposed' });
		assert.strictEqual(service.releasedClients, 1);
	});

	test('uses the client API base for both reads without acquiring another lease', async () => {
		const endpoint = 'https://github.example.test/api/v3';
		const requests: Request[] = [];
		const service = create(async (input, init) => {
			requests.push(new Request(input, init));
			return new Response(JSON.stringify(String(input).endsWith('/commits/HEAD') ? { sha: commitSha } : file(content)));
		});
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri: endpoint }));
		const first = await client.object.readFile('microsoft', 'sample', path, CancellationToken.None);
		const second = await client.object.readFile('microsoft', 'sample', path, new AbortController().signal);
		assert.deepStrictEqual({
			first, second, apiBases: service.apiBases, releasedClients: service.releasedClients,
			requests: requests.map(request => ({ url: request.url, authorization: request.headers.get('authorization') })),
		}, {
			first: { commitSha, content }, second: { commitSha, content }, apiBases: [endpoint], releasedClients: 0,
			requests: [...paths, ...paths].map(path => ({ url: `${endpoint}${path}`, authorization: null })),
		});
	});

	test('pins Contents to HEAD, decodes wrapped base64, and shares the caller signal while releasing its anonymous lease', () => runWithFakedTimers({}, async () => {
		const requests: Request[] = [];
		const controller = new AbortController();
		const startedAt = Date.now();
		const service = create(async (input, init) => {
			requests.push(new Request(input, init));
			if (requests.length === 1) {
				await timeout(10);
				return new Response(JSON.stringify({ sha: commitSha }));
			}
			const response = file(content);
			response.content = `${response.content.slice(0, 60)}\r\n${response.content.slice(60)}\n`;
			return new Response(JSON.stringify(response));
		});
		try {
			const result = await read(service, controller.signal);
			assert.deepStrictEqual({
				result,
				apiBases: service.apiBases,
				releasedClients: service.releasedClients,
				reads: service.reads.map(read => ({ path: read.path, options: read.options, sameSignal: read.signal === controller.signal, aborted: read.signal.aborted })),
				requests: requests.map(request => ({ url: request.url, method: request.method, credentials: request.credentials, authorization: request.headers.get('authorization') })),
			}, {
				result: { commitSha, content },
				apiBases: [apiBaseUri],
				releasedClients: 1,
				reads: paths.map(path => ({ path, options: { caller: 'github.query', priority: 'interactive', deadline: startedAt + 5 * 60_000 }, sameSignal: true, aborted: false })),
				requests: paths.map(path => ({ url: `${apiBaseUri}${path}`, method: 'GET', credentials: 'omit', authorization: null })),
			});
		} finally {
			service.dispose();
		}
	}));

	for (const [name, response] of [
		['missing', undefined], ['null', null], ['array', []], ['missing SHA', {}],
		['non-string SHA', { sha: 123 }], ['short SHA', { sha: 'a'.repeat(39) }],
		['non-hex SHA', { sha: 'z'.repeat(40) }],
	] as const) {
		test(`rejects ${name} commit responses before requesting contents`, async () => {
			const service = create(async () => new Response(JSON.stringify(response)));
			await assert.rejects(read(service), { kind: 'malformedResponse' });
			assert.deepStrictEqual({ paths: service.reads.map(read => read.path), released: service.releasedClients }, { paths: [paths[0]], released: 1 });
		});
	}

	const validFile = file(content);
	for (const [name, response] of [
		['missing', undefined], ['null', null], ['directory listing', []],
		['directory', { ...validFile, type: 'dir' }],
		['symlink', { ...validFile, type: 'symlink' }],
		['unsupported encoding', { ...validFile, encoding: 'none' }],
		['missing size', { ...validFile, size: undefined }],
		['string size', { ...validFile, size: '5' }],
		['negative size', { ...validFile, size: -1 }],
		['fractional size', { ...validFile, size: 1.5 }],
		['oversized file', { ...validFile, size: 1024 * 1024 + 1 }],
		['missing content', { ...validFile, content: undefined }],
		['non-string content', { ...validFile, content: [] }],
		['truncated content', { ...validFile, content: '' }],
		['invalid base64', { ...validFile, size: 1, content: '!!!!' }],
		['noncanonical padding', { ...validFile, size: 1, content: 'YR==' }],
		['content after padding', { ...validFile, size: 3, content: 'YQ=A' }],
		['decoded size mismatch', { ...validFile, size: 2, content: 'YQ==' }],
	] as const) {
		test(`rejects ${name} file responses without following download_url`, async () => {
			const service = create(async input => new Response(JSON.stringify(String(input).endsWith('/commits/HEAD') ? { sha: commitSha } : response)));
			await assert.rejects(read(service), { kind: 'malformedResponse' });
			assert.deepStrictEqual({
				paths: service.reads.map(read => read.path), released: service.releasedClients, aborted: service.reads.map(read => read.signal.aborted),
			}, { paths, released: 1, aborted: [false, false] });
		});
	}

	for (const size of [0, 1024 * 1024]) {
		test(`accepts a file of exactly ${size} bytes`, async () => {
			const content = 'a'.repeat(size);
			const service = create(async input => new Response(JSON.stringify(String(input).endsWith('/commits/HEAD') ? { sha: commitSha } : file(content))));
			assert.deepStrictEqual(await read(service), { commitSha, content });
		});
	}

	test('propagates HTTP errors without a raw-host fallback and releases the lease', async () => {
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
			const token = store.add(new CancellationTokenSource());
			const service = create(async input => String(input).endsWith('/commits/HEAD')
				? new Response(JSON.stringify({ sha: commitSha }))
				: new Response(JSON.stringify(fails ? {} : file(content))));
			if (fails) {
				await assert.rejects(read(service, token.token), { kind: 'malformedResponse' });
			} else {
				assert.deepStrictEqual(await read(service, token.token), { commitSha, content });
			}
			token.cancel();
			assert.deepStrictEqual({
				paths: service.reads.map(read => read.path), aborted: service.reads.map(read => read.signal.aborted),
				sameSignal: service.reads[0].signal === service.reads[1].signal, released: service.releasedClients,
			}, { paths, aborted: [false, false], sameSignal: true, released: 1 });
		});
	}

	test('releases the token listener when the client has already been disposed', async () => {
		const cancelled = store.add(new Emitter<void>());
		const service = create(async () => assert.fail('No fetch expected'));
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		client.dispose();
		await assert.rejects(client.object.readFile('microsoft', 'sample', path, {
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
			return new Response(JSON.stringify(file(content)));
		});
		const first = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		const second = store.add(service.acquireAnonymousClient({ apiBaseUri }));
		const controller = new AbortController();
		const reason = new Error('Caller cancelled');
		const rejected = assert.rejects(first.object.readFile('microsoft', 'sample', path, controller.signal), error => error === reason);
		const peer = second.object.readFile('microsoft', 'sample', path, CancellationToken.None);
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
				aborted: service.reads.map(read => read.signal.aborted), elapsed: Date.now() - startedAt,
			}, { calls: 2, released: 1, deadlines: [startedAt + 5 * 60_000, startedAt + 5 * 60_000], aborted: [false, false], elapsed: 5 * 60_000 });
		} finally {
			service.dispose();
		}
	}));
});
