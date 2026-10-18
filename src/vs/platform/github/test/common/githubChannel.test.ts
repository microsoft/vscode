/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { ClientConnectionEvent, IChannel, IPCServer } from '../../../../base/parts/ipc/common/ipc.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { parseGraphQLRequest } from '../../common/client/graphql.js';
import { PaginationLimitError } from '../../common/client/pagination.js';
import { ApiRequest, PaginationOptions } from '../../common/client/request.js';
import { parse, SchemaError } from '../../common/client/schema.js';
import { CoreClient } from '../../common/core/coreClient.js';
import { PullRequestListItem } from '../../common/core/pullRequests.js';
import { ReviewThread, ReviewThreadSummary, ThreadComment } from '../../common/core/reviews.js';
import { PullRequestSearchItem } from '../../common/core/search.js';
import { ApiRequestProviders, GitHubService, IGitHubRequestProviderScope } from '../../common/githubService.js';
import { GitHubAuthorizationContext, GitHubClientOptions, GitHubCredentialChange, GitHubRequestError, GitHubRequestRateLimitError, GitHubRequestTimeoutError, IGitHubCredentialProvider, MissingCommitError } from '../../common/githubTypes.js';
import { ApiRequestError, MutationUncertainError } from '../../common/missionControl/missionControlClient.js';
import { ApiRequestMessage, ApiResponseMessage, IGitHubCredentialBroker, parseAuthorization } from '../../common/remote/ipc.js';
import { GitHubChannelClient, RemoteApiRequestProvider } from '../../common/remote/ipcClient.js';
import { registerGitHubChannel } from '../../common/remote/ipcServer.js';
import { parseClientResponse } from '../../common/remote/serialization.js';
import { RequestFetch } from '../../common/types.js';
import { TestConnection } from './testConnection.js';

class RecordingGitHubService extends GitHubService {
	readonly onDidAcquireClient = this._register(new Emitter<void>());
	readonly onDidReleaseClient = this._register(new Emitter<void>());
	acquisitions = 0;
	releases = 0;
	scopes = 0;

	override acquireAnonymousRequestProviders(): IReference<ApiRequestProviders> {
		const reference = super.acquireAnonymousRequestProviders();
		this.acquisitions++;
		this.onDidAcquireClient.fire();
		const release = toDisposable(() => {
			reference.dispose();
			this.releases++;
			this.onDidReleaseClient.fire();
		});
		return { object: reference.object, dispose: () => release.dispose() };
	}

	override createRequestProviderScope(credentialProvider: IGitHubCredentialProvider): IGitHubRequestProviderScope {
		const scope = super.createRequestProviderScope(credentialProvider);
		this.scopes++;
		const dispose = toDisposable(() => {
			scope.dispose();
			this.scopes--;
		});
		return {
			acquireClient: options => {
				const reference = scope.acquireClient(options);
				this.acquisitions++;
				this.onDidAcquireClient.fire();
				const release = toDisposable(() => {
					reference.dispose();
					this.releases++;
					this.onDidReleaseClient.fire();
				});
				return { object: reference.object, dispose: () => release.dispose() };
			},
			dispose: () => dispose.dispose(),
		};
	}
}

function createTestServer(store: Pick<DisposableStore, 'add'>, fetch: RequestFetch = async () => Response.json({ value: 1 }), logService: ILogService = store.add(new NullLogService())) {
	const service = store.add(new RecordingGitHubService({
		fetch,
		credentialProvider: {
			onDidChange: Event.None,
			getToken: () => assert.fail('IPC must not use the engine host credential provider'),
		},
	}, logService, NullTelemetryService));
	const onDidConnect = store.add(new Emitter<ClientConnectionEvent>());
	const server = store.add(new IPCServer<string>(onDidConnect.event));
	const registration = store.add(registerGitHubChannel(server, service));
	const connect = (context = 'window:1') => {
		const connection = store.add(new TestConnection(onDidConnect, context));
		return { connection, remote: new GitHubChannelClient(connection.channel, logService) };
	};
	return { service, server, registration, connect };
}

suite('GitHub anonymous IPC clients', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const signal = () => new AbortController().signal;
	const read: ApiRequest & { readonly responseBody?: 'json' | 'text' } = {
		method: 'GET', path: '/repos/o/r', expectedStatus: 200,
	};
	const parseValue = parse.object({ value: parse.integer });
	const commitSha = 'a'.repeat(40);

	function setup(fetch?: RequestFetch) {
		return createTestServer(store, fetch);
	}

	async function acquireProvider(connection: TestConnection, clientId = 'client'): Promise<RemoteApiRequestProvider> {
		await connection.channel.call('acquireAnonymousClient', { clientId });
		return new RemoteApiRequestProvider(connection.channel, clientId, 'rest', signal());
	}

	function message(clientId: string): ApiRequestMessage {
		return [{ clientId, target: 'rest', request: read }, undefined];
	}

	test('exposes a directly disposable, reduced facade and executes content, gist, and issue search', async () => {
		const requests: { url: string; authorization: string | null; credentials: RequestCredentials | undefined; referrerPolicy: ReferrerPolicy | undefined }[] = [];
		const sha = 'a'.repeat(40);
		const gist = {
			id: 'gist-id', node_id: 'G_1', url: 'https://api.github.com/gists/gist-id', html_url: 'https://gist.github.com/gist-id',
			git_pull_url: 'https://gist.github.com/gist-id.git', git_push_url: 'https://gist.github.com/gist-id.git',
			forks_url: 'https://api.github.com/gists/gist-id/forks', commits_url: 'https://api.github.com/gists/gist-id/commits',
			comments_url: 'https://api.github.com/gists/gist-id/comments', public: true, description: null, files: {},
			truncated: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', comments: 0,
		};
		const { connect } = setup(async (input, init) => {
			const url = String(input);
			requests.push({
				url, authorization: new Headers(init?.headers).get('Authorization'),
				credentials: init?.credentials, referrerPolicy: init?.referrerPolicy,
			});
			return url.includes('/commits/') ? new Response(sha)
				: url.includes('/gists/') ? Response.json(gist)
					: Response.json({ total_count: 0, incomplete_results: false, items: [] });
		});
		const { remote } = connect();
		const acquisition = new AbortController();
		const client = store.add(await remote.acquireAnonymousClient(acquisition.signal));
		acquisition.abort();
		const content = await client.content.resolveRef('o', 'r', 'main', signal());
		const result = await client.gist.get('gist-id', signal());
		const search = await client.search.issues('repo:o/r', signal());
		assert.deepStrictEqual({
			wrapped: Object.hasOwn(client, 'object'), gistMethods: Object.keys(client.gist), searchMethods: Object.keys(client.search),
			content, gist: result, search, requests,
		}, {
			wrapped: false, gistMethods: ['get'], searchMethods: ['issues'],
			content: sha, gist, search: { total_count: 0, incomplete_results: false, items: [] },
			requests: [
				{ url: 'https://api.github.com/repos/o/r/commits/main', authorization: null, credentials: 'omit', referrerPolicy: 'no-referrer' },
				{ url: 'https://api.github.com/gists/gist-id', authorization: null, credentials: 'omit', referrerPolicy: 'no-referrer' },
				{ url: 'https://api.github.com/search/issues?q=is%3Aissue+repo%3Ao%2Fr', authorization: null, credentials: 'omit', referrerPolicy: 'no-referrer' },
			],
		});
	});

	test('keeps response text unchanged across real IPC and parses it only at the client', async () => {
		const body = ' {\n "value" : 7 \n} \r\n';
		const { connect } = setup(async () => new Response(body));
		const { connection } = connect();
		const provider = await acquireProvider(connection);
		const wire = await connection.channel.call<ApiResponseMessage>('request', message('client'));
		const parsed = await provider.request(read, signal(), parseValue);
		assert.deepStrictEqual({ wire, parsed }, {
			wire: [{ type: 'success', status: 200 }, body], parsed: { data: { value: 7 }, status: 200 },
		});
	});

	test('hides conditional headers and restores the original accepted status', async () => {
		const validators: (string | null)[] = [];
		const { connect } = setup(async (_input, init) => {
			const etag = new Headers(init?.headers).get('If-None-Match');
			validators.push(etag);
			return etag ? new Response(null, { status: 304 })
				: Response.json({ value: 1 }, { status: 202, headers: { etag: '"one"' } });
		});
		const provider = await acquireProvider(connect().connection);
		const request = { ...read, expectedStatus: [200, 202] };
		assert.deepStrictEqual({
			first: await provider.request(request, signal(), parseValue),
			second: await provider.request(request, signal(), parseValue), validators,
		}, {
			first: { data: { value: 1 }, status: 202 }, second: { data: { value: 1 }, status: 202 },
			validators: [null, '"one"'],
		});
	});

	for (const [method, status] of [['HEAD', 200], ['GET', 204], ['GET', 205]] as const) {
		test(`transfers an empty ${method} response with status ${status}`, async () => {
			const { connect } = setup(async () => new Response(null, { status }));
			const provider = await acquireProvider(connect().connection);
			assert.deepStrictEqual(await provider.request({
				method, path: read.path, responseBody: 'none', expectedStatus: status,
			}, signal()), { data: undefined, status });
		});
	}

	test('preserves empty text responses', async () => {
		const { connect } = setup(async () => new Response(''));
		const provider = await acquireProvider(connect().connection);
		assert.deepStrictEqual(await provider.request({ ...read, responseBody: 'text' }, signal(), parse.string), {
			data: '', status: 200,
		});
	});

	test('rejects malformed JSON and schema failures in the calling process without replay', async () => {
		let calls = 0;
		const { connect } = setup(async () => new Response(++calls === 1 ? 'not JSON' : '{}'));
		const provider = await acquireProvider(connect().connection);
		await assert.rejects(provider.request(read, signal(), parseValue), { kind: 'malformedResponse', statusCode: 200 });
		await assert.rejects(provider.request(read, signal(), parseValue), error => error instanceof SchemaError);
		assert.strictEqual(calls, 2);
	});

	test('checks expected statuses in the calling process', async () => {
		const { connect } = setup();
		const provider = await acquireProvider(connect().connection);
		for (const expectedStatus of [202, [201, 202]]) {
			await assert.rejects(provider.request({ ...read, expectedStatus }, signal(), parseValue), {
				kind: 'malformedResponse', statusCode: 200,
			});
		}
	});

	test('preserves SHA-256 object IDs through ref resolution and pinned raw-content IPC', async () => {
		const expectedSha = '0123456789abcdef'.repeat(4);
		const requests: string[] = [];
		const { connect } = setup(async input => {
			requests.push(String(input));
			return new Response(requests.length === 1 ? expectedSha : 'content');
		});
		const client = store.add(await connect().remote.acquireAnonymousClient(signal()));
		const sha = await client.content.resolveRef('o', 'r', 'main', signal());
		const content = await client.content.getRawFile('o', 'r', sha, 'file.txt', signal());
		assert.deepStrictEqual({ sha, content, requests }, {
			sha: expectedSha, content: 'content',
			requests: ['https://api.github.com/repos/o/r/commits/main', `https://raw.githubusercontent.com/o/r/${expectedSha}/file.txt`],
		});
	});

	test('resolves a commit and downloads exact raw text without API headers or credentials', async () => {
		const content = '\ufeff {\n "image": "sample" \n} \r\n';
		const requests: Request[] = [];
		const { connect } = setup(async (input, init) => {
			requests.push(new Request(input, init));
			return new Response(requests.length === 1 ? commitSha : content);
		});
		const client = store.add(await connect().remote.acquireAnonymousClient(signal()));
		const sha = await client.content.resolveRef('o', 'r', 'main', signal());
		const result = await client.content.getRawFile('o', 'r', sha, 'folder/file %.json', signal());
		assert.deepStrictEqual({
			sha, result, urls: requests.map(request => request.url),
			credentials: requests.map(request => request.credentials),
			rawHeaders: ['authorization', 'x-github-api-version', 'x-client-application', 'x-client-source', 'x-client-feature', 'x-is-retry'].map(name => requests[1].headers.get(name)),
			rawReferrer: requests[1].referrerPolicy,
		}, {
			sha: commitSha, result: content,
			urls: ['https://api.github.com/repos/o/r/commits/main', `https://raw.githubusercontent.com/o/r/${commitSha}/folder/file%20%25.json`],
			credentials: ['omit', 'omit'], rawHeaders: [null, null, null, null, null, null], rawReferrer: 'no-referrer',
		});
	});

	for (const size of [0, 1024 * 1024]) {
		test(`transfers a raw file of exactly ${size} bytes over IPC`, async () => {
			const content = '\u00e9'.repeat(size / 2);
			const { connect } = setup(async () => new Response(content));
			const client = store.add(await connect().remote.acquireAnonymousClient(signal()));
			assert.strictEqual(await client.content.getRawFile('o', 'r', commitSha, 'file', signal()), content);
		});
	}

	test('cancels oversized raw response streams and preserves the size error over IPC', async () => {
		const cancelled = new DeferredPromise<void>();
		const { connect } = setup(async () => new Response(new ReadableStream<Uint8Array>({
			start: controller => controller.enqueue(new Uint8Array(1024 * 1024 + 1)),
			cancel: () => { void cancelled.complete(); },
		})));
		const client = store.add(await connect().remote.acquireAnonymousClient(signal()));
		await assert.rejects(client.content.getRawFile('o', 'r', commitSha, 'file', signal()), { kind: 'responseTooLarge' });
		await cancelled.p;
	});

	for (const status of [202, 404]) {
		test(`preserves raw HTTP status ${status} across IPC`, async () => {
			const { connect } = setup(async () => new Response('raw body', { status }));
			const client = store.add(await connect().remote.acquireAnonymousClient(signal()));
			await assert.rejects(client.content.getRawFile('o', 'r', commitSha, 'file', signal()), {
				kind: status === 202 ? 'malformedResponse' : 'notFound', statusCode: status,
			});
		});
	}

	test('enforces raw-file capabilities and pinned-path validation on forged wire requests', async () => {
		let calls = 0;
		const { connect } = setup(async () => { calls++; return new Response('content'); });
		const { connection } = connect();
		await acquireProvider(connection);
		const raw: ApiRequest = {
			method: 'GET', path: `/o/r/${commitSha}/file`, responseBody: 'text', expectedStatus: [200],
		};
		const cases: { request: ApiRequest; bodyText?: string; kind: GitHubRequestError['kind'] }[] = [
			{ request: { ...raw, method: 'HEAD' }, kind: 'validation' },
			{ request: { ...raw, method: 'POST' }, kind: 'validation' },
			{ request: { ...raw, responseBody: 'json' }, kind: 'validation' },
			{ request: { ...raw, responseBody: 'none' }, kind: 'validation' },
			{ request: { ...raw, redirect: 'manual' }, kind: 'validation' },
			{ request: { ...raw, authentication: 'required' }, kind: 'authentication' },
			{ request: raw, bodyText: '{}', kind: 'validation' },
			...[
				'/o/r/main/file', `/o/r/${commitSha}/file?ref=main`, `/o/r/${commitSha}/%zz`,
				`/o/r/${commitSha}/%2e%2e/file`, `/o/r/${commitSha}/a%2fb`, `/o/r/${commitSha}/a%5cb`,
				`/o/r/${commitSha}/%00`, `/o/r/${commitSha}//file`, `/o/r/${commitSha}/%0a`,
			].map(path => ({ request: { ...raw, path }, kind: 'validation' as const })),
		];
		const responses = await Promise.all(cases.map(entry => connection.channel.call<ApiResponseMessage>('request', [
			{ clientId: 'client', target: 'rawContent', request: entry.request }, entry.bodyText,
		])));
		assert.deepStrictEqual({
			calls, errors: responses.map(([metadata]) => metadata.type === 'error' && metadata.error.type === 'request' ? metadata.error.kind : metadata),
		}, { calls: 0, errors: cases.map(entry => entry.kind) });
	});

	for (const location of [`https://elsewhere.example/o/r/${commitSha}/file`, `/o/r/${'b'.repeat(40)}/file`]) {
		test(`rejects a raw redirect outside the pinned origin and revision: ${location}`, async () => {
			let calls = 0;
			const { connect } = setup(async () => {
				calls++;
				return new Response(null, { status: 302, headers: { location } });
			});
			const client = store.add(await connect().remote.acquireAnonymousClient(signal()));
			await assert.rejects(client.content.getRawFile('o', 'r', commitSha, 'file', signal()), { kind: 'authorization', statusCode: 302 });
			assert.strictEqual(calls, 1);
		});
	}

	const errors = [
		new GitHubRequestError('Denied', 'authorization', 403, '{"message":"denied"}',
			[{ message: 'Forbidden', type: 'FORBIDDEN', path: ['repository', 0], extensions: { code: 'FORBIDDEN' } }],
			'Forbidden', { serverDate: 'Thu, 01 Jan 2026 00:00:00 GMT', requestId: 'request-id', retryAfterSeconds: 0.5 }),
		new GitHubRequestError('Too large', 'responseTooLarge', 200),
		new GitHubRequestTimeoutError(false),
		new GitHubRequestTimeoutError(true),
		new GitHubRequestRateLimitError(123.5),
	];
	for (const [index, expected] of errors.entries()) {
		test(`preserves typed error details across IPC (${index}: ${expected.kind})`, async () => {
			const { connect } = setup(async () => { throw expected; });
			const provider = await acquireProvider(connect().connection);
			await assert.rejects(provider.request(read, signal(), parseValue), (error: unknown) => {
				assert.ok(error instanceof GitHubRequestError);
				assert.deepStrictEqual({ ...error, message: error.message, constructor: error.constructor }, {
					...expected, message: expected.message, constructor: expected.constructor,
				});
				return true;
			});
		});
	}

	test('retains the bounded read retry policy for network failures', async () => {
		await runWithFakedTimers({}, async () => {
			let calls = 0;
			const { connect } = setup(async () => { calls++; throw new TypeError('network unavailable'); });
			const provider = await acquireProvider(connect().connection);
			await assert.rejects(provider.request(read, signal(), parseValue), { kind: 'network' });
			assert.strictEqual(calls, 2);
		});
	});

	test('rejects expired caller deadlines without dispatch', async () => {
		let calls = 0;
		const { connect } = setup(async () => { calls++; return Response.json({ value: 1 }); });
		const client = store.add(await connect().remote.acquireAnonymousClient(signal()));
		await assert.rejects(client.search.issues('repo:o/r', signal(), {
			deadline: Date.now() - 1,
			query: { per_page: 10 },
		}), { kind: 'timeout', requestDispatched: false });
		assert.strictEqual(calls, 0);
	});

	test('enforces anonymous capabilities on the server rather than trusting the facade', async () => {
		let calls = 0;
		const { connect } = setup(async () => { calls++; return Response.json({ value: 1 }); });
		const { connection } = connect();
		await acquireProvider(connection);
		const cases: { request: ApiRequestMessage; kind: GitHubRequestError['kind'] }[] = [
			{ request: [{ clientId: 'client', target: 'rest', request: { ...read, method: 'POST' } }, '{}'], kind: 'authentication' },
			{ request: [{ clientId: 'client', target: 'rest', request: { ...read, authentication: 'required' } }, undefined], kind: 'authentication' },
			{ request: [{ clientId: 'client', target: 'rest', request: read }, '{}'], kind: 'validation' },
			{ request: [{ clientId: 'client', target: 'rest', request: { ...read, method: 'HEAD' } }, '{}'], kind: 'validation' },
			{ request: [{ clientId: 'client', target: 'graphql', request: { ...read, method: 'POST', path: '/' } }, '{"query":"query { viewer { id } }"}'], kind: 'authentication' },
			{ request: [{ clientId: 'client', target: 'rawContent', request: read }, undefined], kind: 'validation' },
		];
		for (const entry of cases) {
			const [metadata] = await connection.channel.call<ApiResponseMessage>('request', entry.request);
			assert.ok(metadata.type === 'error' && metadata.error.type === 'request' && metadata.error.kind === entry.kind);
		}
		assert.strictEqual(calls, 0);
	});

	test('validates raw wire metadata and refuses paths outside the API endpoint', async () => {
		let calls = 0;
		const { connect } = setup(async () => { calls++; return Response.json({ value: 1 }); });
		const { connection } = connect();
		await acquireProvider(connection);
		for (const path of ['https://elsewhere.example/repos/o/r', '//elsewhere.example/repos/o/r', '/repos\\o\\r', '/repos/o/r#fragment']) {
			await assert.rejects(connection.channel.call('request', [{ clientId: 'client', target: 'rest', request: { ...read, path } }, undefined]), {
				name: 'SchemaError',
			});
		}
		for (const expectedStatus of [undefined, null, [], 99, 600, 200.5, '200', [200, 600]]) {
			await assert.rejects(connection.channel.call('request', [{ clientId: 'client', target: 'rest', request: { ...read, expectedStatus } }, undefined]), {
				name: 'SchemaError',
			});
		}
		for (const priority of [null, '', 'urgent', 1]) {
			await assert.rejects(connection.channel.call('request', [{ clientId: 'client', target: 'rest', request: { ...read, options: { priority } } }, undefined]), {
				name: 'SchemaError',
			});
		}
		await assert.rejects(connection.channel.call('request', { clientId: 'client' }), { name: 'SchemaError' });
		await assert.rejects(connection.channel.call('request', [message('client')[0], {}]), { name: 'SchemaError' });
		await assert.rejects(connection.channel.call('acquireAnonymousClient', { clientId: '' }), { name: 'SchemaError' });
		assert.strictEqual(calls, 0);
	});

	test('rejects duplicate acquisition without retaining another reference and releases idempotently', async () => {
		const { connect, service } = setup();
		const { connection } = connect();
		const provider = await acquireProvider(connection);
		await assert.rejects(connection.channel.call('acquireAnonymousClient', { clientId: 'client' }), {
			message: 'GitHub client lease already exists',
		});
		await connection.channel.call('releaseClient', { clientId: 'client' });
		await connection.channel.call('releaseClient', { clientId: 'client' });
		await assert.rejects(provider.request(read, signal(), parseValue), { kind: 'authorization' });
		assert.deepStrictEqual({ acquisitions: service.acquisitions, releases: service.releases }, { acquisitions: 1, releases: 1 });
	});

	for (const sameContext of [false, true]) {
		test(`isolates request and release ownership between physical connections (same context: ${sameContext})`, async () => {
			const { connect, service } = setup();
			const first = connect('window:1');
			const second = connect(sameContext ? 'window:1' : 'window:2');
			const firstProvider = await acquireProvider(first.connection, 'shared-id');
			const unauthorized = new RemoteApiRequestProvider(second.connection.channel, 'shared-id', 'rest', signal());
			await assert.rejects(unauthorized.request(read, signal(), parseValue), { kind: 'authorization' });
			await second.connection.channel.call('releaseClient', { clientId: 'shared-id' });
			const firstResult = await firstProvider.request(read, signal(), parseValue);
			const secondProvider = await acquireProvider(second.connection, 'shared-id');
			first.connection.dispose();
			const secondResult = await secondProvider.request(read, signal(), parseValue);
			assert.deepStrictEqual({ firstResult, secondResult, acquisitions: service.acquisitions, releases: service.releases }, {
				firstResult: { data: { value: 1 }, status: 200 }, secondResult: { data: { value: 1 }, status: 200 },
				acquisitions: 2, releases: 1,
			});
		});
	}

	test('rejects stale handles after reconnecting with the same context', async () => {
		const { connect, service } = setup();
		const first = connect();
		await acquireProvider(first.connection, 'old-client');
		first.connection.dispose();
		const second = connect();
		const stale = new RemoteApiRequestProvider(second.connection.channel, 'old-client', 'rest', signal());
		await assert.rejects(stale.request(read, signal(), parseValue), { kind: 'authorization' });
		const fresh = await acquireProvider(second.connection, 'new-client');
		assert.deepStrictEqual({ result: await fresh.request(read, signal(), parseValue), releases: service.releases }, {
			result: { data: { value: 1 }, status: 200 }, releases: 1,
		});
	});

	test('cleans up registration and registers new channels for already-connected clients', async () => {
		const { connect, server, service, registration } = setup();
		const { connection } = connect();
		const old = await acquireProvider(connection, 'old-client');
		registration.dispose();
		store.add(registerGitHubChannel(server, service));
		await assert.rejects(old.request(read, signal(), parseValue), { kind: 'authorization' });
		const fresh = await acquireProvider(connection, 'new-client');
		assert.deepStrictEqual({ result: await fresh.request(read, signal(), parseValue), releases: service.releases }, {
			result: { data: { value: 1 }, status: 200 }, releases: 1,
		});
	});

	test('does not allocate for an already-cancelled acquisition', async () => {
		const { connect, service } = setup();
		const { remote, connection } = connect();
		const controller = new AbortController();
		controller.abort(new CancellationError());
		await assert.rejects(remote.acquireAnonymousClient(controller.signal), isCancellationError);
		await connection.flush();
		assert.strictEqual(service.acquisitions, 0);
	});

	test('releases an allocated lease when cancellation loses the acquisition reply', async () => {
		const { connect, service } = setup();
		const { remote, connection } = connect();
		await connection.flush();
		connection.pauseResponses = true;
		const controller = new AbortController();
		const allocated = Event.toPromise(service.onDidAcquireClient.event);
		const released = Event.toPromise(service.onDidReleaseClient.event);
		const pending = remote.acquireAnonymousClient(controller.signal);
		const rejected = assert.rejects(pending, isCancellationError);
		await allocated;
		controller.abort(new CancellationError());
		await rejected;
		await released;
		connection.resumeResponses();
		await connection.flush();
		assert.deepStrictEqual({ acquisitions: service.acquisitions, releases: service.releases }, { acquisitions: 1, releases: 1 });
	});

	test('propagates failed acquisitions without creating a client', async () => {
		const { connect, service } = setup();
		const { remote, connection } = connect();
		service.dispose();
		await assert.rejects(remote.acquireAnonymousClient(signal()), { message: 'GitHub service was disposed' });
		await connection.flush();
		assert.deepStrictEqual({ acquisitions: service.acquisitions, releases: service.releases }, { acquisitions: 0, releases: 0 });
	});

	test('repeated disposal releases each lease once and rejects further operations', async () => {
		let calls = 0;
		const { connect, service } = setup(async () => { calls++; return new Response('sha'); });
		const { remote, connection } = connect();
		for (let index = 0; index < 20; index++) {
			const client = await remote.acquireAnonymousClient(signal());
			client.dispose();
			client.dispose();
			await assert.rejects(client.content.resolveRef('o', 'r', 'main', signal()), isCancellationError);
		}
		await connection.flush();
		assert.deepStrictEqual({ calls, acquisitions: service.acquisitions, releases: service.releases }, {
			calls: 0, acquisitions: 20, releases: 20,
		});
	});

	for (const target of ['rest', 'rawContent'] as const) {
		for (const release of ['dispose', 'disconnect', 'registration'] as const) {
			test(`aborts outstanding ${target} work and releases references on ${release}`, async () => {
				const response = new DeferredPromise<Response>();
				const started = new DeferredPromise<AbortSignal>();
				const { connect, service, registration } = setup(async (_input, init) => {
					assert.ok(init?.signal);
					void started.complete(init.signal);
					return response.p;
				});
				const { remote, connection } = connect();
				const client = store.add(await remote.acquireAnonymousClient(signal()));
				const pending = target === 'rest'
					? client.content.resolveRef('o', 'r', 'main', signal())
					: client.content.getRawFile('o', 'r', commitSha, 'file', signal());
				const rejected = assert.rejects(pending, isCancellationError);
				const fetchSignal = await started.p;
				if (release === 'dispose') {
					client.dispose();
					await connection.flush();
				} else if (release === 'disconnect') {
					connection.dispose();
				} else {
					registration.dispose();
				}
				await rejected;
				await response.complete(new Response(commitSha));
				assert.deepStrictEqual({ aborted: fetchSignal.aborted, releases: service.releases }, { aborted: true, releases: 1 });
			});
		}
	}

	test('cancels a request without releasing its client', async () => {
		const response = new DeferredPromise<Response>();
		const started = new DeferredPromise<AbortSignal>();
		let calls = 0;
		const { connect, service } = setup(async (_input, init) => {
			if (++calls > 1) {
				return new Response(commitSha);
			}
			assert.ok(init?.signal);
			void started.complete(init.signal);
			return response.p;
		});
		const { remote, connection } = connect();
		const client = store.add(await remote.acquireAnonymousClient(signal()));
		const controller = new AbortController();
		const pending = client.content.resolveRef('o', 'r', 'main', controller.signal);
		const rejected = assert.rejects(pending, isCancellationError);
		const fetchSignal = await started.p;
		controller.abort(new CancellationError());
		await rejected;
		await connection.flush();
		await response.complete(new Response('cancelled'));
		const next = await client.content.resolveRef('o', 'r', 'next', signal());
		assert.deepStrictEqual({ next, aborted: fetchSignal.aborted, releases: service.releases }, { next: commitSha, aborted: true, releases: 0 });
	});

	test('disposal removes only its waiter from an anonymous read shared across connections', async () => {
		const response = new DeferredPromise<Response>();
		const started = new DeferredPromise<AbortSignal>();
		let calls = 0;
		const { connect, service } = setup(async (_input, init) => {
			calls++;
			assert.ok(init?.signal);
			void started.complete(init.signal);
			return response.p;
		});
		const first = connect('window:1');
		const second = connect('window:2');
		const firstClient = store.add(await first.remote.acquireAnonymousClient(signal()));
		const secondClient = store.add(await second.remote.acquireAnonymousClient(signal()));
		const pending = firstClient.content.resolveRef('o', 'r', 'main', signal());
		const rejected = assert.rejects(pending, isCancellationError);
		const remaining = secondClient.content.resolveRef('o', 'r', 'main', signal());
		const fetchSignal = await started.p;
		await second.connection.flush();
		firstClient.dispose();
		await rejected;
		await first.connection.flush();
		const aborted = fetchSignal.aborted;
		await response.complete(new Response(commitSha));
		assert.deepStrictEqual({ result: await remaining, aborted, calls, releases: service.releases }, {
			result: commitSha, aborted: false, calls: 1, releases: 1,
		});
	});

	test('surfaces release failures and still cleans the lease up on disconnect', async () => {
		const { connect, service } = setup();
		const { connection } = connect();
		const errors: unknown[][] = [];
		const logService = store.add(new class extends NullLogService {
			override error(message: string | Error, ...args: unknown[]): void {
				errors.push([message, ...args]);
			}
		});
		const failure = new Error('release failed');
		const channel: IChannel = {
			call: <T>(command: string, arg?: unknown, token?: CancellationToken) => command === 'releaseClient'
				? Promise.reject<T>(failure) : connection.channel.call<T>(command, arg, token),
			listen: (event, arg) => connection.channel.listen(event, arg),
		};
		const remote = new GitHubChannelClient(channel, logService);
		const client = await remote.acquireAnonymousClient(signal());
		client.dispose();
		await connection.flush();
		connection.dispose();
		assert.deepStrictEqual({ errors, releases: service.releases }, {
			errors: [['[GitHubChannelClient] Failed to release client lease', failure]], releases: 1,
		});
	});

	test('rejects malformed authenticated acquisition before requesting credentials', async () => {
		const { connect, service } = setup();
		const { remote, connection } = connect();
		const authorization = { providerId: 'github', sessionId: '', scopes: ['repo'] };
		await assert.rejects(remote.acquireClient(authorization, signal()), { name: 'SchemaError' });
		await assert.rejects(connection.channel.call('acquireClient', { clientId: 'client', authorization }), { name: 'SchemaError' });
		assert.deepStrictEqual({ acquisitions: service.acquisitions, scopes: service.scopes }, { acquisitions: 0, scopes: 0 });
	});
});

class TestCredentialBroker extends Disposable implements IGitHubCredentialBroker {
	declare readonly _serviceBrand: undefined;
	readonly grants = this._register(new Emitter<GitHubCredentialChange>());
	readonly onDidChange = this.grants.event;
	readonly tokens = this._register(new Emitter<GitHubCredentialChange>());
	readonly onDidChangeToken = this.tokens.event;
	readonly resolutions: GitHubAuthorizationContext[] = [];
	readonly tokenRequests: GitHubAuthorizationContext[] = [];
	token: string | undefined = 'first-token';
	options: GitHubClientOptions = {
		authorization: { providerId: 'github', sessionId: 'selected', accountId: 'account', scopes: ['repo'] },
		apiBaseUri: 'https://api.github.com', graphQlUri: 'https://api.github.com/graphql',
	};
	resolve: ((signal: AbortSignal) => Promise<GitHubClientOptions>) | undefined;
	resolveToken: ((signal: AbortSignal) => Promise<string | undefined>) | undefined;

	async resolveClient(authorization: GitHubAuthorizationContext, signal: AbortSignal): Promise<GitHubClientOptions> {
		this.resolutions.push(authorization);
		return this.resolve ? this.resolve(signal) : this.options;
	}

	async getToken(authorization: GitHubAuthorizationContext, signal: AbortSignal): Promise<string | undefined> {
		this.tokenRequests.push(authorization);
		return this.resolveToken ? this.resolveToken(signal) : this.token;
	}
}

suite('GitHub authenticated IPC clients', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const signal = () => new AbortController().signal;
	const authorization = { providerId: 'github', sessionId: 'selected', scopes: ['repo'] };
	const grantChange = { providerId: 'github', sessionIds: ['selected'] };

	function setup(fetch: RequestFetch = async input => new URL(String(input)).pathname === '/user' ? Response.json({ id: 101 }) : Response.json([])) {
		const server = createTestServer(store, fetch);
		const connect = (context = 'window:1') => {
			const peer = server.connect(context);
			const broker = store.add(new TestCredentialBroker());
			peer.connection.registerCredentials(broker);
			return { ...peer, broker };
		};
		return { ...server, connect };
	}

	for (const missing of [false, true]) {
		test(`classifies commit lookup errors after IPC execution (missing=${missing})`, async () => {
			const body = JSON.stringify({ message: missing ? 'No commit found for SHA: head' : 'Validation Failed' });
			const requests: string[] = [];
			const { connect } = setup(async input => {
				const path = new URL(String(input)).pathname;
				requests.push(path);
				return path === '/user' ? Response.json({ id: 101 }) : new Response(body, {
					status: 422, statusText: 'Unprocessable Entity',
					headers: { 'X-GitHub-Request-Id': 'remote-commit-lookup' },
				});
			});
			const { remote } = connect();
			const client = store.add(await remote.acquireClient(authorization, signal()));
			const repository = { owner: 'o', name: 'r' };
			for (const operation of [
				() => client.pullRequests.listForCommit(repository, 'head', signal()),
				() => client.repositories.getCommit(repository, 'head', signal()),
				() => client.checks.listRuns(repository, 'head', signal()),
				() => client.content.resolveRef('o', 'r', 'head', signal()),
			]) {
				await assert.rejects(operation(), error => {
					assert.ok(error instanceof GitHubRequestError);
					assert.deepStrictEqual({
						name: error.name, missing: error instanceof MissingCommitError,
						status: error.statusCode, statusText: error.statusText, body: error.responseBody,
						requestId: error.responseMetadata?.requestId,
					}, {
						name: missing ? 'MissingCommitError' : 'GitHubRequestError', missing,
						status: 422, statusText: 'Unprocessable Entity', body,
						requestId: 'remote-commit-lookup',
					});
					return true;
				});
			}
			assert.deepStrictEqual(requests, [
				'/user', '/repos/o/r/commits/head/pulls', '/repos/o/r/commits/head',
				'/repos/o/r/commits/head/check-runs', '/repos/o/r/commits/head',
			]);
		});
	}

	test('acquires the selected grant without fetching a token and runs notifications reads and mutations', async () => {
		const requests: { path: string; method: string | undefined; token: string | null }[] = [];
		const { connect, service } = setup(async (input, init) => {
			const path = new URL(String(input)).pathname;
			requests.push({ path, method: init?.method, token: new Headers(init?.headers).get('Authorization') });
			return path === '/user' ? Response.json({ id: 101 })
				: init?.method === 'PATCH' ? new Response(null, { status: 205 })
					: init?.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json([]);
		});
		const { remote, connection, broker } = connect();
		const controller = new AbortController();
		const client = store.add(await remote.acquireClient(authorization, controller.signal));
		const requestsAtAcquisition = requests.length;
		controller.abort();
		const list = await client.notifications.list(signal());
		const read = await client.notifications.markRead('42', signal());
		const done = await client.notifications.markDone('42', signal());
		client.dispose();
		client.dispose();
		await connection.flush();
		await assert.rejects(client.notifications.list(signal()), isCancellationError);
		assert.deepStrictEqual({
			requestsAtAcquisition, list, read, done, requests,
			authorization: client.authorization, wrapped: Object.hasOwn(client, 'object'),
			frozen: Object.isFrozen(client.authorization) && Object.isFrozen(client.authorization.scopes),
			resolutions: broker.resolutions, tokenRequests: broker.tokenRequests,
			acquisitions: service.acquisitions, releases: service.releases,
		}, {
			requestsAtAcquisition: 0, list: [],
			read: undefined, done: undefined,
			requests: [
				{ path: '/user', method: 'GET', token: 'Bearer first-token' },
				{ path: '/notifications', method: 'GET', token: 'Bearer first-token' },
				{ path: '/notifications/threads/42', method: 'PATCH', token: 'Bearer first-token' },
				{ path: '/notifications/threads/42', method: 'DELETE', token: 'Bearer first-token' },
			],
			authorization: { ...authorization, accountId: 'account' },
			wrapped: false, frozen: true,
			resolutions: [authorization],
			tokenRequests: Array.from({ length: 3 }, () => ({ ...authorization, accountId: 'account' })),
			acquisitions: 1, releases: 1,
		});
	});

	test('preserves request priorities through IPC for every provider and keeps operation defaults', async () => {
		const traces: string[] = [];
		const logService = store.add(new class extends NullLogService {
			override trace(message: string): void { traces.push(message); }
		}());
		const { connect } = createTestServer(store, async (input, init) => {
			const url = new URL(String(input));
			if (url.hostname === 'raw.githubusercontent.com') {
				return new Response('raw content');
			}
			if (url.pathname === '/user') {
				return Response.json({ id: 101 });
			}
			if (url.pathname === '/graphql') {
				return Response.json({ data: { node: { reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } });
			}
			if (url.pathname === '/agents/tasks') {
				return Response.json({ tasks: [] });
			}
			if (init?.method === 'PATCH') {
				return new Response(null, { status: 205 });
			}
			return Response.json([]);
		}, logService);
		const { remote, connection } = connect();
		const broker = store.add(new TestCredentialBroker());
		broker.options = { ...broker.options, missionControl: { endpoint: { apiBaseUri: 'https://api.githubcopilot.com/agents', integrationId: 'test-integration' } } };
		connection.registerCredentials(broker);
		const client = store.add(await remote.acquireClient(authorization, signal()));

		await client.notifications.list(signal(), { priority: 'background' });
		await client.reviews.listThreadSummaries('PR_1', signal(), { priority: 'visible' });
		await client.tasks.list(signal(), { priority: 'enrichment' });
		await client.content.getRawFile('o', 'r', 'a'.repeat(40), 'README.md', signal(), { priority: 'mergeGate' });
		await client.tasks.list(signal());
		await client.notifications.markRead('42', signal());

		assert.deepStrictEqual(traces.filter(message => message.includes(' started on ')).map(message =>
			/\(priority: (?<priority>[^)]+)\)$/.exec(message)?.groups?.priority
		), ['interactive', 'background', 'visible', 'enrichment', 'mergeGate', 'interactive', 'mutation']);
	});

	for (const authenticated of [false, true]) {
		test(`honors noCache for typed blob reads through IPC (authenticated=${authenticated})`, async () => {
			const validators: (string | null)[] = [];
			let version = 0;
			const sha = 'a'.repeat(40);
			const { connect } = setup(async (input, init) => {
				if (new URL(String(input)).pathname === '/user') {
					return Response.json({ id: 101 });
				}
				const etag = new Headers(init?.headers).get('If-None-Match');
				validators.push(etag);
				return etag ? new Response(null, { status: 304 }) : Response.json({
					sha, node_id: `blob-${++version}`, url: String(input), size: 1, encoding: 'base64', content: 'AA==',
				}, { headers: { etag: `"${version}"` } });
			});
			const { remote } = connect();
			const client = store.add(await (authenticated ? remote.acquireClient(authorization, signal()) : remote.acquireAnonymousClient(signal())));
			const nodes: string[] = [];
			for (const noCache of [true, undefined, false, true, undefined]) {
				nodes.push((await client.content.getBlob('o', 'r', sha, signal(), { noCache })).node_id);
			}
			assert.deepStrictEqual({ nodes, validators }, {
				nodes: ['blob-1', 'blob-2', 'blob-2', 'blob-3', 'blob-2'], validators: [null, null, '"2"', null, '"2"'],
			});
		});
	}

	for (const sameContext of [false, true]) {
		test(`isolates credentials and private ETags across physical connections (same context: ${sameContext})`, async () => {
			const requests: { token: string | null; etag: string | null }[] = [];
			const { connect, service } = setup(async (input, init) => {
				if (new URL(String(input)).pathname === '/user') {
					return Response.json({ id: 101 });
				}
				const headers = new Headers(init?.headers);
				const token = headers.get('Authorization');
				const etag = headers.get('If-None-Match');
				requests.push({ token, etag });
				return etag ? new Response(null, { status: 304 }) : Response.json([], { headers: { etag: token === 'Bearer first-token' ? '"first"' : '"second"' } });
			});
			const first = connect('window:1');
			const second = connect(sameContext ? 'window:1' : 'window:2');
			second.broker.token = 'second-token';
			const one = store.add(await first.remote.acquireClient(authorization, signal()));
			const two = store.add(await second.remote.acquireClient(authorization, signal()));
			await one.notifications.list(signal());
			await two.notifications.list(signal());
			await one.notifications.list(signal());
			first.connection.dispose();
			await two.notifications.list(signal());
			assert.deepStrictEqual({ requests, scopes: service.scopes }, {
				requests: [
					{ token: 'Bearer first-token', etag: null }, { token: 'Bearer second-token', etag: null },
					{ token: 'Bearer first-token', etag: '"first"' }, { token: 'Bearer second-token', etag: '"second"' },
				],
				scopes: 1,
			});
		});
	}

	test('does not let another connection use or release an authenticated handle', async () => {
		const { connect, service } = setup();
		const first = connect();
		const second = connect('window:1');
		await first.connection.channel.call('acquireClient', { clientId: 'private', authorization });
		const foreign = new RemoteApiRequestProvider(second.connection.channel, 'private', 'rest', signal());
		const request: ApiRequest & { responseBody: 'json' } = { method: 'GET', path: '/notifications', responseBody: 'json', expectedStatus: [200] };
		await assert.rejects(foreign.request(request, signal(), parse.arrayOf(parse.string)), { kind: 'authorization' });
		await second.connection.channel.call('releaseClient', { clientId: 'private' });
		const owner = new RemoteApiRequestProvider(first.connection.channel, 'private', 'rest', signal());
		assert.deepStrictEqual({ result: await owner.request(request, signal(), parse.arrayOf(parse.string)), releases: service.releases }, {
			result: { data: [], status: 200 }, releases: 0,
		});
	});

	test('coordinates verified account cooldowns across isolated connection scopes', async () => {
		await runWithFakedTimers({}, async () => {
			const started = Date.now();
			const attempts: number[] = [];
			const { connect } = setup(async input => {
				if (new URL(String(input)).pathname === '/user') {
					return Response.json({ id: 101 });
				}
				attempts.push(Date.now() - started);
				return attempts.length === 1 ? new Response('Throttled', { status: 429, headers: { 'Retry-After': '10' } }) : Response.json([]);
			});
			const first = connect();
			const second = connect();
			second.broker.token = 'other-token';
			const one = store.add(await first.remote.acquireClient(authorization, signal()));
			const two = store.add(await second.remote.acquireClient(authorization, signal()));
			try {
				await assert.rejects(one.notifications.list(signal()), { kind: 'rateLimit', statusCode: 429 });
				assert.deepStrictEqual({ result: await two.notifications.list(signal()), attempts }, {
					result: [], attempts: [0, 10_000],
				});
			} finally {
				first.connection.dispose();
				second.connection.dispose();
			}
		});
	});

	test('drops authenticated scopes and stale handles when channel registration is replaced', async () => {
		const { connect, registration, service, server } = setup();
		const { remote, broker } = connect();
		const old = store.add(await remote.acquireClient(authorization, signal()));
		await old.notifications.list(signal());
		registration.dispose();
		store.add(registerGitHubChannel(server, service));
		await assert.rejects(old.notifications.list(signal()), { kind: 'authorization' });
		broker.token = 'new-connection-token';
		const current = store.add(await remote.acquireClient(authorization, signal()));
		assert.deepStrictEqual({ result: await current.notifications.list(signal()), scopes: service.scopes, acquisitions: service.acquisitions, releases: service.releases }, {
			result: [], scopes: 1, acquisitions: 2, releases: 1,
		});
	});

	test('token renewal cancels the old generation without retiring the lease or replaying its request', async () => {
		const response = new DeferredPromise<Response>();
		const started = new DeferredPromise<AbortSignal>();
		const requests: { path: string; token: string | null; etag: string | null }[] = [];
		const { connect, service } = setup(async (input, init) => {
			const path = new URL(String(input)).pathname;
			const headers = new Headers(init?.headers);
			const token = headers.get('Authorization');
			requests.push({ path, token, etag: headers.get('If-None-Match') });
			if (path === '/user') {
				return Response.json({ id: 101 });
			}
			if (init?.method === 'PATCH') {
				assert.ok(init.signal);
				void started.complete(init.signal);
				return response.p;
			}
			return Response.json([]);
		});
		const { remote, connection, broker } = connect();
		const client = store.add(await remote.acquireClient(authorization, signal()));
		const rejected = assert.rejects(client.notifications.markRead('42', signal()), { kind: 'authentication' });
		const fetchSignal = await started.p;
		broker.token = 'renewed-token';
		broker.tokens.fire(grantChange);
		await rejected;
		await connection.flush();
		await response.complete(new Response(null, { status: 205 }));
		const next = await client.notifications.list(signal());
		assert.deepStrictEqual({ next, aborted: fetchSignal.aborted, requests, acquisitions: service.acquisitions, releases: service.releases }, {
			next: [], aborted: true,
			requests: [
				{ path: '/user', token: 'Bearer first-token', etag: null },
				{ path: '/notifications/threads/42', token: 'Bearer first-token', etag: null },
				{ path: '/user', token: 'Bearer renewed-token', etag: null },
				{ path: '/notifications', token: 'Bearer renewed-token', etag: null },
			],
			acquisitions: 1, releases: 0,
		});
	});

	test('discards a token callback reply that races renewal without releasing the lease', async () => {
		const response = new DeferredPromise<string | undefined>();
		const started = new DeferredPromise<AbortSignal>();
		const tokens: (string | null)[] = [];
		const { connect, service } = setup(async (input, init) => {
			tokens.push(new Headers(init?.headers).get('Authorization'));
			return new URL(String(input)).pathname === '/user' ? Response.json({ id: 101 }) : Response.json([]);
		});
		const { remote, connection, broker } = connect();
		broker.resolveToken = signal => { void started.complete(signal); return response.p; };
		const client = store.add(await remote.acquireClient(authorization, signal()));
		const rejected = assert.rejects(client.notifications.list(signal()), { kind: 'authentication' });
		const callbackSignal = await started.p;
		broker.token = 'renewed-token';
		broker.tokens.fire(grantChange);
		await rejected;
		broker.resolveToken = undefined;
		await response.complete('stale-token');
		await connection.flush();
		assert.deepStrictEqual({
			result: await client.notifications.list(signal()), tokens, aborted: callbackSignal.aborted,
			acquisitions: service.acquisitions, releases: service.releases,
		}, {
			result: [], tokens: ['Bearer renewed-token', 'Bearer renewed-token'], aborted: true,
			acquisitions: 1, releases: 0,
		});
	});

	test('disposes only one waiter when leases in the same connection share an authenticated read', async () => {
		const response = new DeferredPromise<Response>();
		const started = new DeferredPromise<AbortSignal>();
		let reads = 0;
		const { connect, service } = setup(async (input, init) => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			reads++;
			assert.ok(init?.signal);
			void started.complete(init.signal);
			return response.p;
		});
		const { remote, connection } = connect();
		const first = store.add(await remote.acquireClient(authorization, signal()));
		const second = store.add(await remote.acquireClient(authorization, signal()));
		const rejected = assert.rejects(first.notifications.list(signal()), isCancellationError);
		const remaining = second.notifications.list(signal());
		const fetchSignal = await started.p;
		await connection.flush();
		first.dispose();
		await rejected;
		await connection.flush();
		const aborted = fetchSignal.aborted;
		await response.complete(Response.json([]));
		assert.deepStrictEqual({ result: await remaining, reads, aborted, acquisitions: service.acquisitions, releases: service.releases }, {
			result: [], reads: 1, aborted: false, acquisitions: 2, releases: 1,
		});
	});

	test('retiring a grant affects only the matching session and owning connection', async () => {
		const response = new DeferredPromise<Response>();
		const started = new DeferredPromise<AbortSignal>();
		const { connect } = setup(async (input, init) => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			if (new Headers(init?.headers).get('Authorization') === 'Bearer first-token') {
				assert.ok(init?.signal);
				void started.complete(init.signal);
				return response.p;
			}
			return Response.json([]);
		});
		const first = connect();
		const second = connect();
		second.broker.token = 'other-token';
		const one = store.add(await first.remote.acquireClient(authorization, signal()));
		const two = store.add(await second.remote.acquireClient(authorization, signal()));
		const rejected = assert.rejects(one.notifications.list(signal()), { kind: 'authentication' });
		const fetchSignal = await started.p;
		first.broker.grants.fire({ providerId: 'github', sessionIds: ['unrelated'] });
		await first.connection.flush();
		const abortedForUnrelatedSession = fetchSignal.aborted;
		first.broker.grants.fire(grantChange);
		await rejected;
		await assert.rejects(one.content.getRawFile('o', 'r', 'a'.repeat(40), 'file', signal()), { kind: 'authentication' });
		await response.complete(Response.json([]));
		assert.deepStrictEqual({ abortedForUnrelatedSession, aborted: fetchSignal.aborted, other: await two.notifications.list(signal()) }, {
			abortedForUnrelatedSession: false, aborted: true, other: [],
		});
	});

	test('does not switch an existing lease when token renewal resolves a different GitHub identity', async () => {
		let reads = 0;
		const { connect } = setup(async (input, init) => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: new Headers(init?.headers).get('Authorization') === 'Bearer first-token' ? 101 : 202 });
			}
			reads++;
			return Response.json([]);
		});
		const { remote, broker } = connect();
		const client = store.add(await remote.acquireClient(authorization, signal()));
		await client.notifications.list(signal());
		broker.token = 'other-account-token';
		broker.tokens.fire(grantChange);
		await assert.rejects(client.notifications.list(signal()), { kind: 'authentication' });
		await assert.rejects(client.notifications.list(signal()), { kind: 'authentication' });
		assert.strictEqual(reads, 1);
	});

	for (const failure of ['network', 'authentication', 'server'] as const) {
		test(`does not replay notifications mutations after ${failure} failure`, async () => {
			let mutations = 0;
			const { connect } = setup(async input => {
				if (new URL(String(input)).pathname === '/user') {
					return Response.json({ id: 101 });
				}
				mutations++;
				if (failure === 'network') {
					throw new TypeError('Network unavailable');
				}
				return new Response('Rejected', { status: failure === 'authentication' ? 401 : 503 });
			});
			const client = store.add(await connect().remote.acquireClient(authorization, signal()));
			await assert.rejects(client.notifications.markRead('42', signal()), { kind: failure });
			assert.strictEqual(mutations, 1);
		});
	}

	for (const status of [200, 201]) {
		test(`returns the reaction directly over IPC (HTTP ${status})`, async () => {
			const reaction = { id: 1, node_id: 'REA_1', user: null, content: '+1', created_at: '2026-01-01T00:00:00Z' };
			const { connect } = setup(async input => new URL(String(input)).pathname === '/user'
				? Response.json({ id: 101 }) : Response.json(reaction, { status }));
			const client = store.add(await connect().remote.acquireClient(authorization, signal()));
			assert.deepStrictEqual(await client.issues.createReaction({ owner: 'o', name: 'r' }, { kind: 'issue', number: 1 }, '+1', signal()), reaction);
		});
	}

	test('keeps raw downloads credential-free and projects Actions redirects without following them', async () => {
		const requests: { url: string; token: string | null; credentials: RequestCredentials | undefined }[] = [];
		const { connect } = setup(async (input, init) => {
			const url = new URL(String(input));
			requests.push({ url: url.href, token: new Headers(init?.headers).get('Authorization'), credentials: init?.credentials });
			return url.hostname === 'raw.githubusercontent.com' ? new Response('file')
				: url.pathname === '/user' ? Response.json({ id: 101 })
					: new Response(null, { status: 302, headers: { location: 'https://objects.example.test/log?signature=opaque' } });
		});
		const { remote, broker } = connect();
		const client = store.add(await remote.acquireClient(authorization, signal()));
		const file = await client.content.getRawFile('o', 'r', 'a'.repeat(40), 'file', signal());
		const rawTokenRequests = broker.tokenRequests.length;
		const redirect = await client.actions.getJobLogRedirect({ owner: 'o', name: 'r' }, 42, signal());
		assert.deepStrictEqual({ file, rawTokenRequests, redirect, requests }, {
			file: 'file', rawTokenRequests: 0, redirect: { url: 'https://objects.example.test/log?signature=opaque' },
			requests: [
				{ url: `https://raw.githubusercontent.com/o/r/${'a'.repeat(40)}/file`, token: null, credentials: 'omit' },
				{ url: 'https://api.github.com/user', token: 'Bearer first-token', credentials: undefined },
				{ url: 'https://api.github.com/repos/o/r/actions/jobs/42/logs', token: 'Bearer first-token', credentials: undefined },
			],
		});
	});

	test('rejects acquisition for a pre-cancelled signal without contacting the broker', async () => {
		const { connect, service } = setup();
		const { remote, broker } = connect();
		const controller = new AbortController();
		controller.abort(new CancellationError());
		await assert.rejects(remote.acquireClient(authorization, controller.signal), isCancellationError);
		assert.deepStrictEqual({ calls: broker.resolutions.length, scopes: service.scopes }, { calls: 0, scopes: 0 });
	});

	for (const ending of ['cancel', 'disconnect', 'grant change'] as const) {
		test(`does not resurrect an acquisition after ${ending} while the credential callback is pending`, async () => {
			const response = new DeferredPromise<GitHubClientOptions>();
			const started = new DeferredPromise<AbortSignal>();
			const { connect, service } = setup();
			const { remote, connection, broker } = connect();
			broker.resolve = signal => { void started.complete(signal); return response.p; };
			const controller = new AbortController();
			const rejected = assert.rejects(remote.acquireClient(authorization, controller.signal), ending === 'grant change' ? { kind: 'authentication' } : isCancellationError);
			const callbackSignal = await started.p;
			if (ending === 'cancel') {
				controller.abort(new CancellationError());
			} else if (ending === 'disconnect') {
				connection.dispose();
			} else {
				broker.grants.fire(grantChange);
			}
			await rejected;
			await response.complete(broker.options);
			if (ending !== 'disconnect') {
				await connection.flush();
			}
			assert.deepStrictEqual({ aborted: callbackSignal.aborted, acquisitions: service.acquisitions }, { aborted: true, acquisitions: 0 });
		});
	}

	test('release cancels a pending acquisition without allowing its late reply to overwrite a reused ID', async () => {
		const response = new DeferredPromise<GitHubClientOptions>();
		const started = new DeferredPromise<void>();
		const { connect, service } = setup();
		const { connection, broker } = connect();
		broker.resolve = () => { void started.complete(); return response.p; };
		const pending = connection.channel.call('acquireClient', { clientId: 'reused', authorization });
		await started.p;
		await assert.rejects(connection.channel.call('acquireClient', { clientId: 'reused', authorization }), /already exists/);
		await assert.rejects(connection.channel.call('acquireAnonymousClient', { clientId: 'reused' }), /already exists/);
		await connection.channel.call('releaseClient', { clientId: 'reused' });
		const result = await pending;
		assert.throws(() => parseClientResponse(result, parseAuthorization), CancellationError);
		broker.resolve = undefined;
		const next = await connection.channel.call('acquireClient', { clientId: 'reused', authorization });
		await response.complete(broker.options);
		await connection.flush();
		assert.deepStrictEqual({ authorization: parseClientResponse(next, parseAuthorization), acquisitions: service.acquisitions, releases: service.releases }, {
			authorization: { ...authorization, accountId: 'account' }, acquisitions: 1, releases: 0,
		});
	});

	test('releases an authenticated lease when its acquisition reply is lost', async () => {
		const { connect, service } = setup();
		const { connection, remote } = connect();
		store.add(Event.once(service.onDidAcquireClient.event)(() => { connection.pauseResponses = true; }));
		const allocated = Event.toPromise(service.onDidAcquireClient.event);
		const released = Event.toPromise(service.onDidReleaseClient.event);
		const controller = new AbortController();
		const rejected = assert.rejects(remote.acquireClient(authorization, controller.signal), isCancellationError);
		await allocated;
		controller.abort(new CancellationError());
		await rejected;
		await released;
		connection.resumeResponses();
		await connection.flush();
		assert.deepStrictEqual({ acquisitions: service.acquisitions, releases: service.releases }, { acquisitions: 1, releases: 1 });
	});

	for (const operation of ['resolveClient', 'getToken'] as const) {
		test(`bounds a stalled ${operation} credential callback`, async () => {
			await runWithFakedTimers({}, async () => {
				const response = new DeferredPromise<GitHubClientOptions>();
				const token = new DeferredPromise<string | undefined>();
				let calls = 0;
				const { connect, service } = setup(async () => { calls++; return Response.json([]); });
				const { connection, remote, broker } = connect();
				const started = Date.now();
				if (operation === 'resolveClient') {
					broker.resolve = () => response.p;
				} else {
					broker.resolveToken = () => token.p;
				}
				try {
					const request = operation === 'resolveClient' ? remote.acquireClient(authorization, signal())
						: store.add(await remote.acquireClient(authorization, signal())).notifications.list(signal());
					await assert.rejects(request, { kind: 'timeout', requestDispatched: false });
					assert.deepStrictEqual({ calls, elapsed: Date.now() - started, acquisitions: service.acquisitions }, {
						calls: 0, elapsed: 5 * 60_000, acquisitions: operation === 'resolveClient' ? 0 : 1,
					});
				} finally {
					connection.dispose();
					await response.complete(broker.options);
					await token.complete('late-token');
				}
			});
		});
	}

	for (const ending of ['dispose', 'disconnect', 'registration'] as const) {
		test(`cancels authenticated work and releases scopes on ${ending}`, async () => {
			const response = new DeferredPromise<string | undefined>();
			const started = new DeferredPromise<AbortSignal>();
			const { connect, service, registration } = setup();
			const { connection, remote, broker } = connect();
			broker.resolveToken = signal => { void started.complete(signal); return response.p; };
			const client = store.add(await remote.acquireClient(authorization, signal()));
			const rejected = assert.rejects(client.notifications.list(signal()), isCancellationError);
			const callbackSignal = await started.p;
			if (ending === 'dispose') {
				client.dispose();
				await connection.flush();
			} else if (ending === 'disconnect') {
				connection.dispose();
			} else {
				registration.dispose();
			}
			await rejected;
			await response.complete('late-token');
			assert.deepStrictEqual({ aborted: callbackSignal.aborted, releases: service.releases, scopes: service.scopes }, {
				aborted: true, releases: 1, scopes: ending === 'dispose' ? 1 : 0,
			});
		});
	}

	for (const change of ['session', 'account', 'scopes', 'issuer', 'endpoint'] as const) {
		test(`rejects mismatched ${change} metadata from the credential callback`, async () => {
			let calls = 0;
			const { connect, service } = setup(async () => { calls++; return Response.json([]); });
			const { remote, broker } = connect();
			broker.options = {
				...broker.options,
				authorization: {
					...broker.options.authorization,
					...(change === 'session' ? { sessionId: 'other' }
						: change === 'account' ? { accountId: 'other' }
							: change === 'scopes' ? { scopes: ['repo', 'gist'] }
								: change === 'issuer' ? { authorizationServer: 'https://other.example.test' } : {}),
				},
				...(change === 'endpoint' ? { apiBaseUri: 'http://api.github.com' } : {}),
			};
			await assert.rejects(remote.acquireClient({ ...authorization, accountId: 'account' }, signal()), {
				kind: change === 'endpoint' ? 'validation' : 'authentication',
			});
			assert.deepStrictEqual({ calls, acquisitions: service.acquisitions }, { calls: 0, acquisitions: 0 });
		});
	}

	test('collects REST pages over IPC and retains continuations after 304 revalidation', async () => {
		const requests: { page: string | null; etag: string | null }[] = [];
		const { connect } = setup(async (input, init) => {
			const url = new URL(String(input));
			if (url.pathname === '/user') {
				return Response.json({ id: 101 });
			}
			const page = url.searchParams.get('page');
			const etag = new Headers(init?.headers).get('If-None-Match');
			requests.push({ page, etag });
			if (etag) {
				return new Response(null, { status: 304 });
			}
			return Response.json([{ email: `${page ?? '1'}@example.test`, primary: false, verified: true, visibility: null }], {
				headers: { etag: `"${page ?? '1'}"`, ...(page ? {} : { link: '<?page=2>; rel="next"' }) },
			});
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		const first = await client.users.listEmails(signal(), { maxPages: 2 });
		const second = await client.users.listEmails(signal(), { maxPages: 2 });
		assert.deepStrictEqual({ first, second, requests }, {
			first: ['1', '2'].map(page => ({ email: `${page}@example.test`, primary: false, verified: true, visibility: null })),
			second: first,
			requests: [
				{ page: null, etag: null }, { page: '2', etag: null },
				{ page: null, etag: '"1"' }, { page: '2', etag: '"2"' },
			],
		});
	});

	test('collects GraphQL pages over IPC and preserves the final cursor at an explicit limit', async () => {
		for (const options of [
			{}, { maxPages: 1 }, { maxPages: 1, pageLimitBehavior: 'returnPartial' }, { maxPages: 2 },
		] satisfies PaginationOptions[]) {
			const first = {
				nodes: [{ id: 'T_1', isResolved: false, comments: { nodes: [] } }, null],
				pageInfo: { endCursor: 'next', hasNextPage: true },
			};
			const last = {
				nodes: [{ id: 'T_2', isResolved: true, comments: { nodes: [null] } }],
				pageInfo: { endCursor: 'end', hasNextPage: false },
			};
			const variables: unknown[] = [];
			const { connect } = setup(async (input, init) => {
				if (new URL(String(input)).pathname === '/user') {
					return Response.json({ id: 101 });
				}
				variables.push(parseGraphQLRequest(JSON.parse(String(init?.body))).variables);
				return Response.json({ data: { node: { reviewThreads: variables.length === 1 ? first : last } } });
			});
			const client = store.add(await connect().remote.acquireClient(authorization, signal()));
			const result = client.reviews.listThreadSummaries('PR_1', signal(), {
				...options, caller: 'test.pagination', deadline: Date.now() + 10_000, query: { first: 2, after: 'start' },
			});
			if (options.maxPages === 1 && options.pageLimitBehavior !== 'returnPartial') {
				await assert.rejects(result, PaginationLimitError);
				assert.strictEqual(variables.length, 1);
			} else {
				assert.deepStrictEqual({ result: await result, variables }, {
					result: options.maxPages === 2 ? { nodes: [...first.nodes, ...last.nodes], pageInfo: last.pageInfo } : first,
					variables: (options.maxPages === 2 ? ['start', 'next'] : ['start']).map(after => ({ pullRequestId: 'PR_1', first: 2, after })),
				});
			}
		}
	});

	test('single-page GraphQL limits reject missing or repeated cursors even when partial results are allowed', async () => {
		for (const endCursor of [null, 'start']) {
			let calls = 0;
			const { connect } = setup(async input => {
				if (new URL(String(input)).pathname === '/user') {
					return Response.json({ id: 101 });
				}
				calls++;
				return Response.json({
					data: {
						node: {
							reviewThreads: {
								nodes: [], pageInfo: { endCursor, hasNextPage: true },
							}
						}
					}
				});
			});
			const client = store.add(await connect().remote.acquireClient(authorization, signal()));
			await assert.rejects(client.reviews.listThreadSummaries('PR_1', signal(), {
				query: { after: 'start' }, maxPages: 1, pageLimitBehavior: 'returnPartial',
			}), { kind: 'malformedResponse' });
			assert.strictEqual(calls, 1);
		}
	});

	test('collecting review threads leaves nested comments independently paginated', async () => {
		const thread: ReviewThread = {
			id: 'T_1', path: 'a.ts', line: 1, originalLine: 1, startLine: null, originalStartLine: null,
			diffSide: 'RIGHT', startDiffSide: null, isOutdated: false, isResolved: false,
			viewerCanReply: true, viewerCanResolve: true, viewerCanUnresolve: false,
			comments: { nodes: [null], pageInfo: { endCursor: 'comments-next', hasNextPage: true } },
		};
		let calls = 0;
		const { connect } = setup(async (input, init) => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			const request = parseGraphQLRequest(JSON.parse(String(init?.body)));
			assert.ok(request.query.startsWith('query ListReviewThreads('));
			return Response.json({
				data: {
					node: {
						reviewThreads: {
							nodes: [{ ...thread, id: `T_${++calls}` }],
							pageInfo: { endCursor: `threads-${calls}`, hasNextPage: calls === 1 },
						}
					}
				}
			});
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		assert.deepStrictEqual(await client.reviews.listThreads('PR_1', signal(), { maxPages: 2 }), {
			nodes: [thread, { ...thread, id: 'T_2' }], pageInfo: { endCursor: 'threads-2', hasNextPage: false },
		});
		assert.strictEqual(calls, 2);
	});

	test('GraphQL collection preserves unavailable data and rejects invalid continuation or later failures', async () => {
		for (const ending of ['absent', 'nullNodes', 'cycle', 'missingCursor', 'schema', 'error'] as const) {
			let calls = 0;
			const errors = [{ type: 'FORBIDDEN', message: 'Denied' }];
			const { connect } = setup(async input => {
				if (new URL(String(input)).pathname === '/user') {
					return Response.json({ id: 101 });
				}
				if (++calls === 1) {
					return Response.json({
						data: {
							node: {
								reviewThreads: {
									nodes: [null], pageInfo: { endCursor: 'next', hasNextPage: true },
								}
							}
						}
					});
				}
				return Response.json({
					data: {
						node: ending === 'absent' || ending === 'error' ? null : {
							reviewThreads: {
								nodes: ending === 'nullNodes' ? null : ending === 'schema' ? [{}] : [],
								pageInfo: { endCursor: ending === 'missingCursor' ? null : 'next', hasNextPage: ending === 'cycle' || ending === 'missingCursor' },
							}
						}
					},
					...(ending === 'error' ? { errors } : {}),
				});
			});
			const client = store.add(await connect().remote.acquireClient(authorization, signal()));
			const result = client.reviews.listThreadSummaries('PR_1', signal(), { maxPages: 3, pageLimitBehavior: 'returnPartial' });
			if (ending === 'absent' || ending === 'nullNodes') {
				assert.deepStrictEqual(await result, ending === 'absent' ? null : {
					nodes: null, pageInfo: { endCursor: 'next', hasNextPage: false },
				});
			} else {
				await assert.rejects(result, ending === 'schema' ? SchemaError : { kind: ending === 'error' ? 'authorization' : 'malformedResponse' });
			}
			assert.strictEqual(calls, 2);
		}
	});

	test('lists pull request connections with cursor pagination without changing REST listing', async () => {
		const pullRequest: PullRequestListItem = {
			id: 'PR_1', number: 1, url: 'https://github.com/o/r/pull/1', title: 'First pull request',
			author: { __typename: 'User', login: 'author', avatarUrl: 'https://avatars.githubusercontent.com/u/1', url: 'https://github.com/author' },
			headRefName: 'feature/one', isCrossRepository: true, isDraft: true,
			updatedAt: '2026-10-14T00:00:00+01:00', additions: 7, deletions: 0,
		};
		const firstPage = { nodes: [pullRequest, null], pageInfo: { endCursor: 'opaque+/=', hasNextPage: true } };
		const secondPage = {
			nodes: [{ ...pullRequest, id: 'PR_2', number: 2, url: 'https://github.com/o/r/pull/2', author: null, isCrossRepository: false, isDraft: false }],
			pageInfo: { endCursor: 'last', hasNextPage: false },
		};
		const requests: { url: string; method: string | undefined }[] = [];
		const queries: ReturnType<typeof parseGraphQLRequest>[] = [];
		const { connect } = setup(async (input, init) => {
			const url = String(input);
			if (new URL(url).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			requests.push({ url, method: init?.method });
			if (init?.method === 'GET') {
				return Response.json([]);
			}
			queries.push(parseGraphQLRequest(JSON.parse(String(init?.body))));
			return Response.json({ data: { repository: { pullRequests: queries.length === 1 ? firstPage : secondPage } } });
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		const repository = { owner: 'o', name: 'r' };
		const first = await client.pullRequests.listConnection(repository, signal());
		const second = await client.pullRequests.listConnection(repository, signal(), {
			caller: 'test.pullRequests', deadline: Date.now() + 10_000,
			query: { first: 1, after: first?.pageInfo.endCursor ?? undefined },
		});
		const rest = await client.pullRequests.list(repository, signal(), { query: { state: 'closed', per_page: 10 } });
		const expectedQuery = [
			'query ListPullRequests($owner: String!, $name: String!, $first: Int! = 100, $after: String) {',
			'repository(owner: $owner, name: $name) {',
			'pullRequests(first: $first, after: $after, states: OPEN, orderBy: { field: UPDATED_AT, direction: DESC }) {',
			'nodes { id number url title author { __typename login avatarUrl url }',
			'headRefName isCrossRepository isDraft updatedAt additions deletions }',
			'pageInfo { endCursor hasNextPage } } } }',
		].join(' ');
		assert.deepStrictEqual({
			first, second, rest, requests,
			queries: queries.map(({ query, variables }) => ({ query: query.replace(/\s+/g, ' ').trim(), variables })),
		}, {
			first: firstPage, second: secondPage, rest: [],
			requests: [
				{ url: 'https://api.github.com/graphql', method: 'POST' },
				{ url: 'https://api.github.com/graphql', method: 'POST' },
				{ url: 'https://api.github.com/repos/o/r/pulls?state=closed&per_page=10', method: 'GET' },
			],
			queries: [
				{ query: expectedQuery, variables: { owner: 'o', name: 'r' } },
				{ query: expectedQuery, variables: { owner: 'o', name: 'r', first: 1, after: 'opaque+/=' } },
			],
		});
	});

	test('distinguishes absent and empty pull request connections and rejects malformed results', async () => {
		const empty = { nodes: [], pageInfo: { endCursor: null, hasNextPage: false } };
		const nullable = { ...empty, nodes: null };
		const responses = [
			{ repository: null },
			{ repository: { pullRequests: empty } },
			{ repository: { pullRequests: nullable } },
			{ repository: { pullRequests: { ...empty, nodes: [{}] } } },
			{ repository: { pullRequests: { ...empty, pageInfo: { endCursor: null, hasNextPage: 'false' } } } },
		];
		const { connect } = setup(async input => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			const data = responses.shift();
			assert.ok(data);
			return Response.json({ data });
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		const repository = { owner: 'o', name: 'r' };
		assert.deepStrictEqual([
			await client.pullRequests.listConnection(repository, signal()),
			await client.pullRequests.listConnection(repository, signal()),
			await client.pullRequests.listConnection(repository, signal()),
		], [null, empty, nullable]);
		await assert.rejects(client.pullRequests.listConnection(repository, signal()), SchemaError);
		await assert.rejects(client.pullRequests.listConnection(repository, signal()), SchemaError);
	});

	test('batches closing PR linkage counts and includes closed PRs', async () => {
		const numbers = [...Array.from({ length: 50 }, (_, index) => index + 1), 2_147_483_647];
		const batches: { numbers: number[]; variables: { owner: string; name: string }; selections: string[] }[] = [];
		const { connect } = setup(async (input, init) => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			const { query, variables } = parseGraphQLRequest(JSON.parse(String(init?.body)));
			assert.ok(variables);
			const selections = [...query.matchAll(/issue(?<number>\d+): issue\(number: \d+\) \{\s*closedByPullRequestsReferences\(first: 1, includeClosedPrs: true\) \{ totalCount \}\s*\}/g)];
			const numbers = selections.map(match => Number(match.groups!.number));
			batches.push({
				numbers,
				variables: parse.object({ owner: parse.string, name: parse.string })(variables),
				selections: selections.map(match => match[0].replace(/\s+/g, ' ')),
			});
			return Response.json({
				data: {
					repository: Object.fromEntries(numbers.map(number => [
						`issue${number}`, number === 3 ? null : { closedByPullRequestsReferences: number === 4 ? null : { totalCount: number % 3 } },
					]))
				}
			});
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		const counts = await client.issues.getClosingPullRequestCounts({ owner: 'o', name: 'r' }, [...numbers, 1], signal());
		assert.deepStrictEqual({ counts, batches }, {
			counts: Object.fromEntries(numbers.map(number => [number, number === 3 || number === 4 ? null : number % 3])),
			batches: [numbers.slice(0, 50), numbers.slice(50)].map(numbers => ({
				numbers,
				variables: { owner: 'o', name: 'r' },
				selections: numbers.map(number => `issue${number}: issue(number: ${number}) { closedByPullRequestsReferences(first: 1, includeClosedPrs: true) { totalCount } }`),
			})),
		});
	});

	test('skips empty closing PR linkage reads and validates all numbers before dispatch', async () => {
		const { connect } = setup(async () => assert.fail('No fetch expected'));
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		const repository = { owner: 'o', name: 'r' };
		assert.deepStrictEqual(await client.issues.getClosingPullRequestCounts(repository, [], signal()), {});
		for (const invalid of [0, -1, 1.5, NaN, Infinity, 2_147_483_648]) {
			await assert.rejects(client.issues.getClosingPullRequestCounts(repository, [
				...Array.from({ length: 50 }, (_, index) => index + 1), invalid,
			], signal()), SchemaError);
		}
		await assert.rejects(client.issues.getClosingPullRequestCounts(repository, [], AbortSignal.abort(new CancellationError())), isCancellationError);
		await assert.rejects(client.issues.getClosingPullRequestCounts(repository, [1], signal(), {
			deadline: Date.now() - 1,
		}), { kind: 'timeout', requestDispatched: false });
	});

	test('preserves unavailable closing PR linkage and rejects missing or malformed counts', async () => {
		const responses = [
			{ repository: null },
			{ repository: { issue1: null } },
			{ repository: {} },
			...[undefined, null, -1, 0.5, '1'].map(totalCount => ({
				repository: { issue1: { closedByPullRequestsReferences: { totalCount } } },
			})),
		];
		const { connect } = setup(async input => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			const data = responses.shift();
			assert.ok(data);
			return Response.json({ data });
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		const repository = { owner: 'o', name: 'r' };
		assert.deepStrictEqual([
			await client.issues.getClosingPullRequestCounts(repository, [1], signal()),
			await client.issues.getClosingPullRequestCounts(repository, [1], signal()),
		], [null, { 1: null }]);
		while (responses.length > 0) {
			await assert.rejects(client.issues.getClosingPullRequestCounts(repository, [1], signal()), SchemaError);
		}
	});

	test('does not return partial closing PR linkage when a later batch fails', async () => {
		let calls = 0;
		const errors = [{ message: 'Repository unavailable', type: 'FORBIDDEN', path: ['repository'] }];
		const { connect } = setup(async (input, init) => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			if (++calls === 2) {
				return Response.json({ data: { repository: null }, errors });
			}
			const { query } = parseGraphQLRequest(JSON.parse(String(init?.body)));
			return Response.json({
				data: {
					repository: Object.fromEntries([...query.matchAll(/(?<alias>issue\d+):/g)]
						.map(match => [match.groups!.alias, { closedByPullRequestsReferences: { totalCount: 1 } }]))
				}
			});
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		await assert.rejects(client.issues.getClosingPullRequestCounts({ owner: 'o', name: 'r' },
			Array.from({ length: 51 }, (_, index) => index + 1), signal()), { kind: 'authorization', graphQLErrors: errors });
		assert.strictEqual(calls, 2);
	});

	test('searches recent assigned issues with update timestamps over IPC', async () => {
		const issue = {
			id: 1, node_id: 'I_1', number: 1, title: 'Assigned issue', html_url: 'https://github.com/o/r/issues/1',
			repository_url: 'https://api.github.com/repos/o/r', state: 'open', updated_at: '2026-10-14T01:00:00Z',
			user: null, score: 1,
		};
		const page = { total_count: 1, incomplete_results: false, items: [issue] };
		const requests: { url: string; authenticated: boolean }[] = [];
		const { connect } = setup(async (input, init) => {
			const url = String(input);
			if (new URL(url).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			requests.push({ url, authenticated: new Headers(init?.headers).has('Authorization') });
			return Response.json(page);
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		const result = await client.search.issues('repo:o/r is:open assignee:@me', signal(), {
			query: { per_page: 5, sort: 'updated', order: 'desc' },
		});
		assert.deepStrictEqual({ result, requests }, {
			result: page,
			requests: [{
				url: 'https://api.github.com/search/issues?per_page=5&sort=updated&order=desc&q=is%3Aissue+repo%3Ao%2Fr+is%3Aopen+assignee%3A%40me',
				authenticated: true,
			}],
		});
	});

	test('searches pull requests with cursor pagination and latest commit status', async () => {
		const pullRequest: PullRequestSearchItem = {
			id: 'PR_1', number: 1, url: 'https://github.com/o/r/pull/1', title: 'Review this change',
			author: { __typename: 'User', login: 'author', avatarUrl: '', url: 'https://github.com/author' },
			headRefName: 'feature', isCrossRepository: true, isDraft: false,
			updatedAt: '2026-10-14T01:00:00Z', additions: 3, deletions: 2,
			mergeable: 'CONFLICTING',
			commits: { nodes: [{ commit: { committedDate: '2026-10-14T00:30:00+01:00', statusCheckRollup: { state: 'FAILURE' } } }] },
		};
		const firstPage = { nodes: [pullRequest, null], pageInfo: { endCursor: 'opaque+/=', hasNextPage: true } };
		const secondPage = {
			nodes: [{
				...pullRequest, author: null, isDraft: true, mergeable: 'UNKNOWN',
				commits: { nodes: [{ commit: { committedDate: '2026-10-14T00:30:00Z', statusCheckRollup: null } }] },
			}],
			pageInfo: { endCursor: 'last', hasNextPage: false },
		};
		const emptyPage = { nodes: [], pageInfo: { endCursor: null, hasNextPage: false } };
		const authoredPage = {
			nodes: [{ nodes: [] }, { nodes: [null] }, { nodes: null }].map((commits, index) => ({
				...pullRequest, id: `PR_${index + 2}`, number: index + 2, mergeable: 'MERGEABLE', commits,
			})),
			pageInfo: { endCursor: 'authored-last', hasNextPage: false },
		};
		const pages = [firstPage, secondPage, emptyPage, authoredPage];
		const queries: ReturnType<typeof parseGraphQLRequest>[] = [];
		const { connect } = setup(async (input, init) => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			queries.push(parseGraphQLRequest(JSON.parse(String(init?.body))));
			const search = pages.shift();
			assert.ok(search);
			return Response.json({ data: { search } });
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		const expression = 'repo:o/r is:open review-requested:@me sort:updated-desc';
		const first = await client.search.pullRequests(expression, signal());
		const second = await client.search.pullRequests(expression, signal(), {
			caller: 'test.search', deadline: Date.now() + 10_000,
			query: { first: 1, after: first.pageInfo.endCursor ?? undefined },
		});
		const assigned = await client.search.pullRequests('repo:o/r is:open assignee:@me sort:updated-desc', signal());
		const authored = await client.search.pullRequests('repo:o/r is:open author:@me sort:updated-desc', signal(), { query: { first: 5 } });
		const expectedQuery = [
			'query SearchPullRequests($query: String!, $first: Int! = 100, $after: String) {',
			'search(query: $query, type: ISSUE, first: $first, after: $after) {',
			'nodes { ... on PullRequest { id number url title author { __typename login avatarUrl url }',
			'headRefName isCrossRepository isDraft updatedAt additions deletions',
			'mergeable commits(last: 1) { nodes { commit { committedDate statusCheckRollup { state } } } } } }',
			'pageInfo { endCursor hasNextPage } } }',
		].join(' ');
		assert.deepStrictEqual({
			first, second, assigned, authored,
			queries: queries.map(({ query, variables }) => ({ query: query.replace(/\s+/g, ' ').trim(), variables })),
		}, {
			first: firstPage, second: secondPage, assigned: emptyPage, authored: authoredPage,
			queries: [
				{ query: expectedQuery, variables: { query: `is:pr ${expression}` } },
				{ query: expectedQuery, variables: { first: 1, after: 'opaque+/=', query: `is:pr ${expression}` } },
				{ query: expectedQuery, variables: { query: 'is:pr repo:o/r is:open assignee:@me sort:updated-desc' } },
				{ query: expectedQuery, variables: { first: 5, query: 'is:pr repo:o/r is:open author:@me sort:updated-desc' } },
			],
		});
	});

	test('preserves nullable PR search nodes and rejects malformed or partial results', async () => {
		const nullable = { nodes: null, pageInfo: { endCursor: null, hasNextPage: false } };
		const errors = [{ message: 'Search denied', type: 'FORBIDDEN', path: ['search'] }];
		const responses = [
			{ data: { search: nullable } },
			{ data: { search: null } },
			{ data: { search: { ...nullable, nodes: [{}] } } },
			{ data: { search: nullable }, errors },
		];
		const { connect } = setup(async input => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			const response = responses.shift();
			assert.ok(response);
			return Response.json(response);
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		assert.deepStrictEqual(await client.search.pullRequests('repo:o/r', signal()), nullable);
		await assert.rejects(client.search.pullRequests('repo:o/r', signal()), SchemaError);
		await assert.rejects(client.search.pullRequests('repo:o/r', signal()), SchemaError);
		await assert.rejects(client.search.pullRequests('repo:o/r', signal()), { kind: 'authorization', graphQLErrors: errors });
	});

	test('validates PR listing, search, and review summary page sizes and deadlines before dispatch', async () => {
		const { connect } = setup(async () => assert.fail('No fetch expected'));
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		const repository = { owner: 'o', name: 'r' };
		for (const first of [0, 101, 1.5]) {
			await assert.rejects(client.pullRequests.listConnection(repository, signal(), { query: { first } }), { kind: 'validation' });
			await assert.rejects(client.search.pullRequests('repo:o/r', signal(), { query: { first } }), { kind: 'validation' });
			await assert.rejects(client.reviews.listThreadSummaries('PR_1', signal(), { query: { first } }), { kind: 'validation' });
		}
		await assert.rejects(client.pullRequests.listConnection(repository, signal(), {
			deadline: Date.now() - 1,
		}), { kind: 'timeout', requestDispatched: false });
		await assert.rejects(client.search.pullRequests('repo:o/r', signal(), {
			deadline: Date.now() - 1,
		}), { kind: 'timeout', requestDispatched: false });
		await assert.rejects(client.reviews.listThreadSummaries('PR_1', signal(), {
			deadline: Date.now() - 1,
		}), { kind: 'timeout', requestDispatched: false });
	});

	test('paginates lightweight review thread summaries using the newest comment', async () => {
		const thread: ReviewThreadSummary = {
			id: 'T_1', isResolved: false,
			comments: { nodes: [{ createdAt: '2026-10-14T01:30:00+01:00' }] },
		};
		const firstPage = { nodes: [thread, null], pageInfo: { endCursor: 'threads-next', hasNextPage: true } };
		const secondPage = {
			nodes: [
				{ ...thread, id: 'T_2', isResolved: true, comments: { nodes: [] } },
				{ ...thread, id: 'T_3', comments: { nodes: [null] } },
				{ ...thread, id: 'T_4', comments: { nodes: null } },
			],
			pageInfo: { endCursor: 'threads-last', hasNextPage: false },
		};
		const pages = [firstPage, secondPage];
		const queries: ReturnType<typeof parseGraphQLRequest>[] = [];
		const { connect } = setup(async (input, init) => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			queries.push(parseGraphQLRequest(JSON.parse(String(init?.body))));
			const reviewThreads = pages.shift();
			assert.ok(reviewThreads);
			return Response.json({ data: { node: { reviewThreads } } });
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		const first = await client.reviews.listThreadSummaries('PR_1', signal());
		const second = await client.reviews.listThreadSummaries('PR_1', signal(), {
			caller: 'test.threadSummaries', deadline: Date.now() + 10_000,
			query: { first: 3, after: first?.pageInfo.endCursor ?? undefined },
		});
		const expectedQuery = [
			'query ListReviewThreadSummaries($pullRequestId: ID!, $first: Int! = 100, $after: String) {',
			'node(id: $pullRequestId) { ... on PullRequest {',
			'reviewThreads(first: $first, after: $after) {',
			'nodes { id isResolved comments(last: 1) { nodes { createdAt } } }',
			'pageInfo { endCursor hasNextPage } } } } }',
		].join(' ');
		assert.deepStrictEqual({
			first, second,
			queries: queries.map(({ query, variables }) => ({ query: query.replace(/\s+/g, ' ').trim(), variables })),
		}, {
			first: firstPage, second: secondPage,
			queries: [
				{ query: expectedQuery, variables: { pullRequestId: 'PR_1' } },
				{ query: expectedQuery, variables: { pullRequestId: 'PR_1', first: 3, after: 'threads-next' } },
			],
		});
	});

	test('preserves absent and empty review summaries and rejects malformed timestamps', async () => {
		const empty = { nodes: [], pageInfo: { endCursor: null, hasNextPage: false } };
		const nullable = { ...empty, nodes: null };
		const responses = [
			{ node: null },
			{ node: { reviewThreads: empty } },
			{ node: { reviewThreads: nullable } },
			...[undefined, null, 'not-a-date', '2026-10-14T01:30:00'].map(createdAt => ({
				node: { reviewThreads: { ...empty, nodes: [{ id: 'T_1', isResolved: false, comments: { nodes: [{ createdAt }] } }] } },
			})),
		];
		const { connect } = setup(async input => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			const data = responses.shift();
			assert.ok(data);
			return Response.json({ data });
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		assert.deepStrictEqual([
			await client.reviews.listThreadSummaries('PR_1', signal()),
			await client.reviews.listThreadSummaries('PR_1', signal()),
			await client.reviews.listThreadSummaries('PR_1', signal()),
		], [null, empty, nullable]);
		for (let index = 0; index < 4; index++) {
			await assert.rejects(client.reviews.listThreadSummaries('PR_1', signal()), SchemaError);
		}
	});

	test('runs typed review queries and PR mutations on the account GraphQL provider', async () => {
		const operations: { query: string; variables: unknown; url: string; authenticated: boolean }[] = [];
		const { connect } = setup(async (input, init) => {
			const url = String(input);
			if (new URL(url).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			assert.strictEqual(typeof init?.body, 'string');
			const body = parseGraphQLRequest(JSON.parse(String(init?.body)));
			operations.push({ query: body.query.split('(')[0], variables: body.variables, url, authenticated: new Headers(init?.headers).has('Authorization') });
			return body.query.startsWith('query')
				? Response.json({ data: { node: { reviewThreads: { nodes: [null], pageInfo: { endCursor: 'opaque-next', hasNextPage: true } } } } })
				: Response.json({ data: { result: { pullRequest: { id: 'PR_1', isDraft: false } } } });
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		const options = { caller: 'test.reviews', deadline: Date.now() + 10_000 };
		const threads = await client.reviews.listThreads('PR_1', signal(), { ...options, query: { first: 2, after: 'opaque', commentsFirst: 1 } });
		const ready = await client.pullRequests.markReadyForReview('PR_1', signal(), options);
		assert.deepStrictEqual({ threads, ready, operations }, {
			threads: { nodes: [null], pageInfo: { endCursor: 'opaque-next', hasNextPage: true } },
			ready: { id: 'PR_1', isDraft: false },
			operations: [
				{ query: 'query ListReviewThreads', variables: { pullRequestId: 'PR_1', first: 2, after: 'opaque', commentsFirst: 1 }, url: 'https://api.github.com/graphql', authenticated: true },
				{ query: 'mutation MarkReadyForReview', variables: { input: { pullRequestId: 'PR_1' } }, url: 'https://api.github.com/graphql', authenticated: true },
			],
		});
	});

	test('preserves review comment timestamps and reply parents across reads and mutations', async () => {
		const root: ThreadComment = {
			id: 'C_1', databaseId: 1, body: 'Root comment', url: 'https://github.com/o/r/pull/1#discussion_r1',
			createdAt: '2026-10-13T10:00:00Z', updatedAt: '2026-10-13T11:00:00Z',
			path: 'file.ts', line: null, originalLine: 3,
			state: 'SUBMITTED', author: null, viewerCanUpdate: true, viewerCanDelete: true,
			replyTo: null, pullRequestReview: { id: 'R_1', state: 'COMMENTED' },
		};
		const reply: ThreadComment = {
			...root, id: 'C_2', databaseId: 2, body: 'Reply', url: 'https://github.com/o/r/pull/1#discussion_r2',
			state: 'PENDING', replyTo: { databaseId: 1 }, pullRequestReview: { id: 'R_2', state: 'PENDING' },
		};
		const comments = {
			nodes: [root, reply, { ...reply, id: 'C_3', databaseId: null, replyTo: { databaseId: null } }, null],
			pageInfo: { endCursor: 'comments-next', hasNextPage: true },
		};
		const thread: ReviewThread = {
			id: 'T_1', path: 'file.ts', line: 3, originalLine: 3, startLine: null, originalStartLine: null,
			diffSide: 'RIGHT', startDiffSide: null, isOutdated: false, isResolved: false,
			viewerCanReply: true, viewerCanResolve: true, viewerCanUnresolve: false, comments,
		};
		const threads = { nodes: [thread, null], pageInfo: { endCursor: 'threads-next', hasNextPage: true } };
		const responses = [
			{ node: { reviewThreads: threads } },
			{ node: { comments } },
			{ result: { thread } },
			{ result: { comment: reply } },
		];
		const queries: string[] = [];
		const { connect } = setup(async (input, init) => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			queries.push(parseGraphQLRequest(JSON.parse(String(init?.body))).query);
			const data = responses.shift();
			assert.ok(data);
			return Response.json({ data });
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		const results = [
			await client.reviews.listThreads('PR_1', signal()),
			await client.reviews.listThreadComments('T_1', signal(), { query: { after: 'comments-previous' } }),
			await client.reviews.createThread({ pullRequestId: 'PR_1', body: root.body, path: thread.path, line: 3 }, signal()),
			await client.reviews.replyToThread('T_1', reply.body, signal(), { pullRequestReviewId: 'R_2' }),
		];
		assert.deepStrictEqual({
			results,
			metadataSelections: queries.map(query => [
				query.includes('createdAt'), query.includes('updatedAt'), query.includes('replyTo { databaseId }'),
			]),
		}, {
			results: [threads, comments, thread, reply],
			metadataSelections: Array.from({ length: 4 }, () => [true, true, true]),
		});
	});

	test('uses the exact Enterprise GraphQL endpoint rather than appending to the REST base', async () => {
		const urls: string[] = [];
		const { connect } = setup(async input => {
			const url = String(input);
			urls.push(url);
			return url.endsWith('/user') ? Response.json({ id: 101 }) : Response.json({ data: { node: null } });
		});
		const { remote, broker } = connect();
		const grant = { ...authorization, providerId: 'github-enterprise', authorizationServer: 'https://enterprise.example.test/login/oauth' };
		broker.options = {
			authorization: { ...grant, accountId: 'account' },
			apiBaseUri: 'https://enterprise.example.test/api/v3',
			graphQlUri: 'https://enterprise.example.test/api/graphql',
		};
		const client = store.add(await remote.acquireClient(grant, signal()));
		assert.deepStrictEqual({ result: await client.reviews.listThreadComments('T_1', signal()), urls }, {
			result: null,
			urls: ['https://enterprise.example.test/api/v3/user', 'https://enterprise.example.test/api/graphql'],
		});
	});

	test('preserves GraphQL body text through IPC and only serializes variables once', async () => {
		const bodies: RequestInit['body'][] = [];
		const responseText = ' {\n "data" : { "node" : null }, "errors" : [] \n} ';
		const { connect } = setup(async (input, init) => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			bodies.push(init?.body);
			return new Response(responseText);
		});
		const { connection } = connect();
		parseClientResponse(await connection.channel.call('acquireClient', { clientId: 'graphql', authorization }), parseAuthorization);
		const request: ApiRequest = { method: 'POST', path: '/', expectedStatus: [200], responseBody: 'json', authentication: 'required' };
		const query = 'query Node($id: ID!) { node(id: $id) { id } }';
		const bodyText = ` {\n "query" : ${JSON.stringify(query)}, "variables" : { "id" : "missing" } } `;
		const wire = await connection.channel.call<ApiResponseMessage>('request', [{ clientId: 'graphql', target: 'graphql', request }, bodyText]);
		const provider = new RemoteApiRequestProvider(connection.channel, 'graphql', 'graphql', signal());
		let serializations = 0;
		const parsed = await new CoreClient(provider, provider).graphql(query, {
			toJSON() { serializations++; return { id: 'missing' }; },
		}, signal(), parse.object({ node: parse.nullable(parse.object({ id: parse.string })) }));
		assert.deepStrictEqual({ wire, parsed, bodies, serializations }, {
			wire: [{ type: 'success', status: 200 }, responseText], parsed: { node: null },
			bodies: [bodyText, JSON.stringify({ query, variables: { id: 'missing' } })], serializations: 1,
		});
	});

	test('preserves partial GraphQL error details without exposing the partial result as success', async () => {
		const errors = [{ type: 'FORBIDDEN', message: 'Denied', path: ['node', 0], extensions: { code: 'FORBIDDEN' } }];
		const responseBody = JSON.stringify({ data: { node: null }, errors });
		let calls = 0;
		const { connect } = setup(async input => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			calls++;
			return new Response(responseBody, { headers: { 'X-GitHub-Request-Id': 'graphql-request' } });
		});
		const client = store.add(await connect().remote.acquireClient(authorization, signal()));
		await assert.rejects(client.reviews.listThreads('PR_1', signal()), (error: unknown) => {
			assert.ok(error instanceof GitHubRequestError);
			assert.deepStrictEqual({
				kind: error.kind, status: error.statusCode, errors: error.graphQLErrors,
				body: error.responseBody, metadata: error.responseMetadata, calls,
			}, {
				kind: 'authorization', status: 200, errors, body: responseBody,
				metadata: { requestId: 'graphql-request' }, calls: 1,
			});
			return true;
		});
	});

	test('enforces GraphQL wire capabilities and refuses operation-selector spoofing', async () => {
		let calls = 0;
		const { connect } = setup(async input => {
			if (new URL(String(input)).pathname === '/user') {
				return Response.json({ id: 101 });
			}
			calls++;
			return Response.json({ data: {} });
		});
		const { connection } = connect();
		parseClientResponse(await connection.channel.call('acquireClient', { clientId: 'graphql', authorization }), parseAuthorization);
		const provider = new RemoteApiRequestProvider(connection.channel, 'graphql', 'graphql', signal());
		const request: ApiRequest = { method: 'POST', path: '/', expectedStatus: [200], responseBody: 'json' };
		for (const override of [
			{ path: '/repos/o/r' }, { path: '/?operationName=Write' }, { method: 'GET' }, { redirect: 'manual' },
			{ responseBody: 'none' }, { responseBody: 'text' },
		] satisfies Partial<ApiRequest>[]) {
			await assert.rejects(provider.requestText({ ...request, ...override }, signal(), '{"query":"query { viewer { id } }"}'), { kind: 'validation' });
		}
		await assert.rejects(provider.requestText(request, signal(), JSON.stringify({
			query: 'query Read { viewer { id } } mutation Write { updateIssue(input: {}) { clientMutationId } }', operationName: 'Write',
		})), { kind: 'validation' });
		assert.strictEqual(calls, 0);
	});

	for (const mutation of [false, true]) {
		test(`retains the GraphQL wire retry policy (mutation: ${mutation})`, async () => {
			await runWithFakedTimers({}, async () => {
				let calls = 0;
				const { connect } = setup(async input => {
					if (new URL(String(input)).pathname === '/user') {
						return Response.json({ id: 101 });
					}
					if (++calls === 1) {
						throw new TypeError('Network failure');
					}
					return Response.json({ data: { node: null } });
				});
				const { remote, connection } = connect();
				const client = store.add(await remote.acquireClient(authorization, signal()));
				try {
					if (mutation) {
						await assert.rejects(client.reviews.resolveThread('T_1', signal()), { kind: 'network' });
					} else {
						assert.deepStrictEqual(await client.reviews.listThreads('PR_1', signal()), null);
					}
					assert.strictEqual(calls, mutation ? 1 : 2);
				} finally {
					connection.dispose();
				}
			});
		});
	}

	test('preserves dispatched GraphQL mutation deadline errors across IPC', async () => {
		await runWithFakedTimers({}, async () => {
			const response = new DeferredPromise<Response>();
			let calls = 0;
			const { connect } = setup(async input => {
				if (new URL(String(input)).pathname === '/user') {
					return Response.json({ id: 101 });
				}
				calls++;
				return response.p;
			});
			const { connection } = connect();
			parseClientResponse(await connection.channel.call('acquireClient', { clientId: 'graphql', authorization }), parseAuthorization);
			const provider = new RemoteApiRequestProvider(connection.channel, 'graphql', 'graphql', signal());
			const started = Date.now();
			try {
				await assert.rejects(provider.requestText({
					method: 'POST', path: '/', expectedStatus: [200], responseBody: 'json', options: { deadline: started + 10 },
				}, signal(), '{"query":"mutation Write { updateIssue(input: {}) { clientMutationId } }"}'), { kind: 'timeout', requestDispatched: true });
				assert.deepStrictEqual({ calls, elapsed: Date.now() - started }, { calls: 1, elapsed: 10 });
			} finally {
				connection.dispose();
				await response.complete(Response.json({ data: {} }));
			}
		});
	});

	for (const ending of ['dispose', 'disconnect', 'renewal'] as const) {
		test(`cancels GraphQL mutations without replay on ${ending}`, async () => {
			const response = new DeferredPromise<Response>();
			const started = new DeferredPromise<AbortSignal>();
			const queries: string[] = [];
			const { connect } = setup(async (input, init) => {
				if (new URL(String(input)).pathname === '/user') {
					return Response.json({ id: 101 });
				}
				const body = parseGraphQLRequest(JSON.parse(String(init?.body)));
				queries.push(body.query.split('(')[0]);
				if (body.query.startsWith('mutation')) {
					assert.ok(init?.signal);
					void started.complete(init.signal);
					return response.p;
				}
				return Response.json({ data: { node: null } });
			});
			const { remote, connection, broker } = connect();
			const client = store.add(await remote.acquireClient(authorization, signal()));
			const rejected = assert.rejects(client.reviews.resolveThread('T_1', signal()), ending === 'renewal' ? { kind: 'authentication' } : isCancellationError);
			const fetchSignal = await started.p;
			if (ending === 'dispose') {
				client.dispose();
				await connection.flush();
			} else if (ending === 'disconnect') {
				connection.dispose();
			} else {
				broker.token = 'renewed-token';
				broker.tokens.fire(grantChange);
			}
			await rejected;
			await response.complete(Response.json({ data: { result: { thread: { id: 'T_1', isResolved: true } } } }));
			if (ending === 'renewal') {
				assert.deepStrictEqual(await client.reviews.listThreads('PR_1', signal()), null);
			}
			assert.deepStrictEqual({ aborted: fetchSignal.aborted, queries }, {
				aborted: true, queries: ending === 'renewal' ? ['mutation ResolveReviewThread', 'query ListReviewThreads'] : ['mutation ResolveReviewThread'],
			});
		});
	}

	suite('Mission Control', () => {
		const repository = { owner: 'o', name: 'r' };
		const date = '2026-01-01T00:00:00Z';
		const definition = { id: 'automation-1', name: 'Test', description: '', prompt: 'Do work', created_by: { id: 101 }, created_at: date, updated_at: date };
		const task = { id: 'task-1', automation_id: definition.id, state: 'queued', created_at: date, remote_steerable: true };
		const options = {
			endpoint: { apiBaseUri: 'https://api.githubcopilot.com/agents', integrationId: 'test-integration' },
		};

		async function acquire(fetch: RequestFetch) {
			const server = setup((input, init) => new URL(String(input)).host === 'api.github.com'
				? Promise.resolve(Response.json({ id: 101 })) : fetch(input, init));
			const peer = server.connect();
			peer.broker.options = { ...peer.broker.options, missionControl: options };
			const client = store.add(await peer.remote.acquireClient(authorization, signal()));
			return { ...server, ...peer, client };
		}

		test('executes automation, task, and environment operations through the approved Mission Control IPC profile', async () => {
			const paths: string[] = [];
			const headers: { integration: string | null; apiVersion: string | null; credentials: RequestCredentials | undefined }[] = [];
			const responses = [
				Response.json({ automations: [definition], total_count: 1 }, { headers: { link: '<https://api.githubcopilot.com/agents/repos/o/r/automations/v2?page=2>; rel="next"', date: 'Thu, 01 Jan 2026 00:00:00 GMT' } }),
				Response.json(definition), Response.json(definition, { status: 201 }), Response.json(definition),
				new Response(null, { status: 204 }), Response.json({ automation_id: definition.id }, { status: 202 }),
				Response.json({ tasks: [task] }), Response.json([]), Response.json([]),
				Response.json({ tasks: [task] }), Response.json(task), Response.json(task, { status: 201 }), Response.json(task),
				Response.json(task), Response.json(task), new Response(null, { status: 204 }),
				new Response(null, { status: 202 }), Response.json({ events: [], total: 0 }), Response.json({ events: [], total: 0 }),
				Response.json([]), Response.json({ id: 'env', name: 'Environment', kind: 'managed-sandbox', status: 'online' }),
				Response.json({ environment_status: 'waking' }, { status: 202, headers: { 'Retry-After': '2' } }),
				Response.json({ environment_status: 'waking' }, { status: 202 }),
			];
			const { client } = await acquire(async (input, init) => {
				paths.push(`${init?.method} ${new URL(String(input)).pathname}`);
				const values = new Headers(init?.headers);
				headers.push({ integration: values.get('Copilot-Integration-Id'), apiVersion: values.get('X-GitHub-Api-Version'), credentials: init?.credentials });
				const response = responses.shift();
				assert.ok(response);
				return response;
			});
			const page = await client.automations.list(repository, signal());
			await client.automations.get(repository, definition.id, signal());
			await client.automations.create(repository, definition, signal());
			await client.automations.update(repository, definition.id, { disabled: true }, signal());
			await client.automations.delete(repository, definition.id, signal());
			await client.automations.dispatch(repository, definition.id, { event: 'manual' }, signal());
			await client.automations.listRuns(definition.id, signal());
			await client.automations.listTools(signal());
			await client.automations.listTriggers(signal());
			await client.tasks.list(signal());
			await client.tasks.get(task.id, signal());
			await client.tasks.create({ prompt: 'Work' }, signal());
			await client.tasks.update(task.id, { name: 'Renamed' }, signal());
			await client.tasks.archive(task.id, signal());
			await client.tasks.unarchive(task.id, signal());
			await client.tasks.delete(task.id, signal());
			await client.tasks.abort(task.id, signal());
			await client.tasks.getEvents(task.id, signal());
			await client.tasks.getAhpEvents(task.id, signal());
			await client.environments.list(signal());
			await client.environments.get('env', signal());
			const waking = await client.environments.connect('env', signal());
			await client.environments.reconnect('env', 'client', signal());
			assert.deepStrictEqual({ paths, metadata: { nextLink: page.nextLink, serverDate: page.serverDate }, waking, headers, remaining: responses.length }, {
				paths: [
					'GET /agents/repos/o/r/automations/v2', 'GET /agents/repos/o/r/automations/automation-1', 'POST /agents/repos/o/r/automations',
					'PATCH /agents/repos/o/r/automations/automation-1', 'DELETE /agents/repos/o/r/automations/automation-1', 'POST /agents/repos/o/r/automations/automation-1/tasks',
					'GET /agents/automations/automation-1/tasks', 'GET /agents/automations/tools', 'GET /agents/automations/triggers',
					'GET /agents/tasks', 'GET /agents/tasks/task-1', 'POST /agents/tasks', 'PATCH /agents/tasks/task-1',
					'POST /agents/tasks/task-1/archive', 'POST /agents/tasks/task-1/unarchive', 'DELETE /agents/tasks/task-1', 'POST /agents/tasks/task-1/steer',
					'GET /agents/tasks/task-1/events', 'GET /agents/tasks/task-1/events', 'GET /agents/environments', 'GET /agents/environments/env',
					'GET /agents/environments/env/connect', 'GET /agents/environments/env/reconnect',
				],
				metadata: { nextLink: 'https://api.githubcopilot.com/agents/repos/o/r/automations/v2?page=2', serverDate: 'Thu, 01 Jan 2026 00:00:00 GMT' },
				waking: { status: 202, data: { environment_status: 'waking' }, retryAfterSeconds: 2 },
				headers: Array.from({ length: 23 }, () => ({ integration: 'test-integration', apiVersion: null, credentials: 'omit' })),
				remaining: 0,
			});
		});

		test('serializes mutation bodies once before IPC and parses responses at the caller', async () => {
			const bodies: RequestInit['body'][] = [];
			const { client } = await acquire(async (_input, init) => { bodies.push(init?.body); return Response.json(definition, { status: 201 }); });
			let serialized = 0;
			const request = { ...definition, toJSON() { serialized++; return { name: 'N', description: '', prompt: 'P', tools: [] }; } };
			await client.automations.create(repository, request, signal());
			assert.deepStrictEqual({ serialized, bodies }, { serialized: 1, bodies: ['{"name":"N","description":"","prompt":"P","tools":[]}'] });
		});

		test('preserves documented API diagnostics and indeterminate HTTP failures without raw bodies', async () => {
			const details = { message: 'Unavailable', documentation_url: 'https://docs.example.test', errors: [{ code: 'custom', message: 'Retry later' }] };
			const { client } = await acquire(async () => Response.json({ ...details, secret: 'not-retained' }, {
				status: 503, headers: { 'X-GitHub-Request-Id': 'ABCD:1234:5678:90AB:CDEF', 'Retry-After': '2' },
			}));
			await assert.rejects(client.automations.create(repository, definition, signal()), (error: unknown) => {
				assert.ok(error instanceof ApiRequestError);
				assert.deepStrictEqual({
					status: error.statusCode, response: error.response, requestId: error.requestId, retry: error.retryAfterSeconds, outcome: error.outcome, raw: error.responseBody,
				}, { status: 503, response: details, requestId: 'ABCD:1234:5678:90AB:CDEF', retry: 2, outcome: 'indeterminate', raw: undefined });
				return true;
			});
		});

		for (const failure of [
			{ status: 403, body: { error_code: 'rate_limit_exceeded', limited_resource: 'token_mint' }, code: 'rate_limit_exceeded', limitedResource: 'token_mint' },
			{ status: 409, body: { code: 'environment_compute_terminal' }, code: 'environment_compute_terminal', limitedResource: undefined },
			{ status: 409, body: { error_code: 'future_code' }, code: 'future_code', limitedResource: undefined },
		]) {
			test(`preserves credential-free ${failure.code} diagnostics across IPC`, async () => {
				const { client } = await acquire(async () => Response.json({
					...failure.body, message: 'private credential', access_token: 'private credential',
				}, { status: failure.status, headers: { 'X-GitHub-Request-Id': 'ABCD:1234:5678:90AB:CDEF', 'Retry-After': '5' } }));
				await assert.rejects(client.environments.connect('env', signal()), error => {
					assert.ok(error instanceof ApiRequestError);
					assert.deepStrictEqual({
						code: error.code, limitedResource: error.limitedResource, status: error.statusCode,
						requestId: error.requestId, retryAfterSeconds: error.retryAfterSeconds,
						response: error.response, raw: error.responseBody, privateContent: JSON.stringify(error).includes('private credential'),
					}, {
						code: failure.code, limitedResource: failure.limitedResource, status: failure.status,
						requestId: 'ABCD:1234:5678:90AB:CDEF', retryAfterSeconds: 5,
						response: undefined, raw: undefined, privateContent: false,
					});
					return true;
				});
			});
		}

		test('honors noCache for Mission Control reads through IPC', async () => {
			const validators: (string | null)[] = [];
			const { client } = await acquire(async (_input, init) => {
				const etag = new Headers(init?.headers).get('If-None-Match');
				validators.push(etag);
				return etag ? new Response(null, { status: 304 }) : Response.json({ tasks: [] }, { headers: { etag: '"tasks"' } });
			});
			for (const noCache of [true, undefined, false, true, undefined]) {
				await client.tasks.list(signal(), { noCache });
			}
			assert.deepStrictEqual(validators, [null, null, '"tasks"', null, '"tasks"']);
		});

		test('sandbox rate-limit policy survives IPC without blocking task reads', () => runWithFakedTimers({}, async () => {
			const times: number[] = [];
			const { client } = await acquire(async (_input, init) => {
				times.push(Date.now());
				return init?.method === 'POST'
					? Response.json({ error_code: 'rate_limit_exceeded', limited_resource: 'sandbox' }, { status: 429, headers: { 'Retry-After': '2' } })
					: Response.json({ tasks: [] });
			});
			const request = { prompt: 'test', environment_id: 'github-sandbox' };
			await assert.rejects(client.tasks.create(request, signal()), { code: 'rate_limit_exceeded' });
			await client.tasks.list(signal());
			await assert.rejects(client.tasks.create(request, signal()), { code: 'rate_limit_exceeded' });
			assert.deepStrictEqual(times.map(time => time - times[0]), [0, 0, 2000]);
		}));

		test('malformed dispatched write responses remain indeterminate', async () => {
			const { client } = await acquire(async () => new Response('not JSON', { status: 201 }));
			await assert.rejects(client.automations.create(repository, definition, signal()), error => error instanceof MutationUncertainError);
		});

		for (const ending of ['cancel', 'dispose', 'disconnect', 'renewal'] as const) {
			test(`preserves mutation uncertainty on ${ending} after dispatch`, async () => {
				const response = new DeferredPromise<Response>();
				const started = new DeferredPromise<AbortSignal>();
				let calls = 0;
				const { client, connection, broker } = await acquire(async (_input, init) => {
					calls++;
					assert.ok(init?.signal);
					void started.complete(init.signal);
					return response.p;
				});
				const controller = new AbortController();
				const rejected = assert.rejects(client.automations.create(repository, definition, controller.signal), error => error instanceof MutationUncertainError);
				const fetchSignal = await started.p;
				if (ending === 'cancel') {
					controller.abort(new CancellationError());
				} else if (ending === 'dispose') {
					client.dispose();
				} else if (ending === 'disconnect') {
					connection.dispose();
				} else {
					broker.token = 'renewed-token';
					broker.tokens.fire(grantChange);
				}
				await rejected;
				await response.complete(Response.json(definition, { status: 201 }));
				assert.deepStrictEqual({ calls, aborted: fetchSignal.aborted }, { calls: 1, aborted: true });
			});
		}

		test('cancelling an undispatched mutation does not report an uncertain outcome', async () => {
			const response = new DeferredPromise<Response>();
			const started = new DeferredPromise<void>();
			let writes = 0;
			const { client, connection } = await acquire(async (_input, init) => {
				if (init?.method === 'POST') {
					writes++;
					return Response.json(definition, { status: 201 });
				}
				void started.complete();
				return response.p;
			});
			const read = client.automations.get(repository, definition.id, signal());
			await started.p;
			const controller = new AbortController();
			const rejected = assert.rejects(client.automations.create(repository, definition, controller.signal), isCancellationError);
			await connection.flush();
			controller.abort(new CancellationError());
			await rejected;
			await response.complete(Response.json(definition));
			await read;
			assert.strictEqual(writes, 0);
		});

		test('does not allow wire flags to bypass credential-response privacy', async () => {
			let calls = 0;
			const { connection } = await acquire(async () => { calls++; return Response.json({ message: 'secret-token', documentation_url: 'https://docs.example.test', access_token: 'secret-token' }, { status: 403 }); });
			parseClientResponse(await connection.channel.call('acquireClient', { clientId: 'forged', authorization }), parseAuthorization);
			const mc = new RemoteApiRequestProvider(connection.channel, 'forged', 'missionControl', signal());
			const request: ApiRequest = {
				method: 'GET', path: '/environments/env/connect', expectedStatus: [200], responseBody: 'text',
				policy: { sensitive: false, credential: false },
			};
			await assert.rejects(mc.requestText(request, signal()), (error: unknown) => {
				assert.ok(error instanceof ApiRequestError);
				assert.deepStrictEqual({ response: error.response, raw: error.responseBody, containsSecret: error.message.includes('secret-token') }, {
					response: undefined, raw: undefined, containsSecret: false,
				});
				return true;
			});
			assert.strictEqual(calls, 1);
		});

		test('sensitive environment lists are neither shared nor cached across IPC requests', async () => {
			const validators: (string | null)[] = [];
			const { client } = await acquire(async (_input, init) => {
				validators.push(new Headers(init?.headers).get('If-None-Match'));
				return Response.json([], { headers: { etag: '"sensitive"' } });
			});
			await Promise.all([client.environments.list(signal()), client.environments.list(signal())]);
			await client.environments.list(signal());
			assert.deepStrictEqual(validators, [null, null, null]);
		});

		test('enforces credential-GET and event-read no-retry semantics even without caller policy flags', async () => {
			await runWithFakedTimers({}, async () => {
				let calls = 0;
				const { connection } = await acquire(async () => { calls++; throw new TypeError('Network failed'); });
				parseClientResponse(await connection.channel.call('acquireClient', { clientId: 'policy', authorization }), parseAuthorization);
				const provider = new RemoteApiRequestProvider(connection.channel, 'policy', 'missionControl', signal());
				const request: ApiRequest = { method: 'GET', path: '/environments/env/connect', expectedStatus: [200], responseBody: 'text' };
				try {
					await assert.rejects(provider.requestText(request, signal()), error => error instanceof MutationUncertainError);
					await assert.rejects(provider.requestText({ ...request, path: '/tasks/task-1/events' }, signal()), { kind: 'network' });
					assert.strictEqual(calls, 2);
				} finally {
					connection.dispose();
				}
			});
		});

		test('retains safe-read coalescing and internal validators without exposing ETags', async () => {
			const validators: (string | null)[] = [];
			const { client } = await acquire(async (_input, init) => {
				const etag = new Headers(init?.headers).get('If-None-Match');
				validators.push(etag);
				return etag ? new Response(null, { status: 304 }) : Response.json({ automations: [], total_count: 0 }, { headers: { etag: '"list"' } });
			});
			const results = await Promise.all([client.automations.list(repository, signal()), client.automations.list(repository, signal())]);
			const next = await client.automations.list(repository, signal());
			assert.deepStrictEqual({ validators, results: [...results, next] }, {
				validators: [null, '"list"'],
				results: Array.from({ length: 3 }, () => ({ data: { automations: [], total_count: 0 }, nextLink: undefined, serverDate: undefined })),
			});
		});
	});

	test('does not fall back to anonymous requests when the pinned grant loses its token', async () => {
		let calls = 0;
		const { connect } = setup(async () => { calls++; return Response.json({ total_count: 0, incomplete_results: false, items: [] }); });
		const { remote, broker } = connect();
		const client = store.add(await remote.acquireClient(authorization, signal()));
		broker.token = undefined;
		await assert.rejects(client.search.issues('public', signal()), { kind: 'authentication' });
		assert.strictEqual(calls, 0);
	});
});
