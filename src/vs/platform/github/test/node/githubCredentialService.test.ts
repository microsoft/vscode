/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubCredentialService } from '../../common/githubCredentialService.js';
import { GitHubBackoffPolicy } from '../../common/githubBackoff.js';
import { GitHubRequestError, GitHubTransport } from '../../common/githubTransport.js';
import { IGitHubTokenProvider } from '../../common/githubTypes.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';
import { nodeFetch } from './nodeFetch.js';
import { gitHubDisconnectResponse, gitHubJsonResponse, gitHubRateLimitResponse, gitHubRestStep, ProgrammableGitHubServer } from './programmableGitHubServer.js';

/** Jitter-free so every asserted delay is exact. */
const testBackoffPolicy: GitHubBackoffPolicy = {
	immediateRetries: 1,
	base: 1_000,
	maximum: 8_000,
	decay: 60_000,
	jitter: 0,
};

function signal(): AbortSignal {
	return new AbortController().signal;
}

/** Lets every pending continuation reach the scheduler before time is advanced. */
function flush(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}

function unreachableUserSteps(count: number): readonly ReturnType<typeof gitHubRestStep>[] {
	// A failed identity resolution costs two requests because the transport
	// retries an unreachable GET once before giving up.
	return Array.from({ length: count * 2 }, () => gitHubRestStep({ method: 'GET', path: '/user', response: gitHubDisconnectResponse() }));
}

function resolvedUserSteps(count: number): readonly ReturnType<typeof gitHubRestStep>[] {
	return Array.from({ length: count }, () => gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }));
}

class TestTokenProvider extends Disposable implements IGitHubTokenProvider {

	private readonly _onDidChangeToken = this._register(new Emitter<void>());
	readonly onDidChangeToken = this._onDidChangeToken.event;
	readonly invalidatedTokens: string[] = [];
	private _token: string | undefined;

	/**
	 * `retainInvalidated` models the agent host, whose provider cannot drop a
	 * token, so a refusal there leaves the very same credential in place.
	 */
	constructor(private readonly _retainInvalidated = false) {
		super();
	}

	getToken(): string | undefined {
		return this._token;
	}

	setToken(token: string | undefined): void {
		this._token = token;
		this._onDidChangeToken.fire();
	}

	invalidateToken(token: string): void {
		this.invalidatedTokens.push(token);
		if (!this._retainInvalidated && this._token === token) {
			this._token = undefined;
		}
	}
}

suite('GitHubCredentialService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function withServer(fn: (server: ProgrammableGitHubServer) => Promise<void>): Promise<void> {
		const server = await ProgrammableGitHubServer.start();
		try {
			await fn(server);
		} finally {
			await server.disposeAsync();
		}
	}

	test('resolves a stable account once per accepted token generation', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101, login: 'ignored' }) }),
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 202, login: 'ignored-again' }) }),
			);
			const endpoint = server.createEndpointService();
			const tokenProvider = disposables.add(new TestTokenProvider());
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const credentials = disposables.add(new GitHubCredentialService(undefined, undefined, transport, tokenProvider, endpoint));

			tokenProvider.setToken('one');
			const first = await credentials.getCredential(signal());
			const shared = await credentials.getCredential(signal());
			tokenProvider.setToken('two');
			const replacement = await credentials.getCredential(signal());

			assert.deepStrictEqual({
				first: { account: first.account, generation: first.generation },
				sharedObject: first === shared,
				firstAborted: first.signal.aborted,
				replacement: { account: replacement.account, generation: replacement.generation },
				requestCount: server.requests.length,
			}, {
				first: { account: { host: new URL(server.apiBaseUrl).host, accountId: '101' }, generation: 1 },
				sharedObject: true,
				firstAborted: true,
				replacement: { account: { host: new URL(server.apiBaseUrl).host, accountId: '202' }, generation: 2 },
				requestCount: 2,
			});
			server.assertSatisfied();
		});
	});

	test('invalidates a rejected bootstrap credential even when the 401 body is oversized', async () => {
		const tokenProvider = disposables.add(new TestTokenProvider());
		tokenProvider.setToken('rejected-token');
		const transport = disposables.add(new GitHubTransport(async () => new Response('credential was rejected', { status: 401 }), undefined, false, undefined, { maximumResponseBytes: 4 }));
		const credentials = disposables.add(new GitHubCredentialService(undefined, undefined, transport, tokenProvider, {
			onDidChange: Event.None,
			getApiBaseUri: () => 'https://api.example.test',
			getGraphQlUri: () => 'https://api.example.test/graphql',
		}));
		await assert.rejects(credentials.getCredential(signal()), { kind: 'authentication', statusCode: 401 });
		assert.deepStrictEqual(tokenProvider.invalidatedTokens, ['rejected-token']);
	});

	test('invalidates the matching authentication generation after 401', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/one', response: gitHubJsonResponse({ value: 1 }, { etag: '"one"' }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/two', response: gitHubJsonResponse({ value: 2 }, { etag: '"two"' }) }),
			);
			const endpoint = server.createEndpointService();
			const tokenProvider = disposables.add(new TestTokenProvider());
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const credentials = disposables.add(new GitHubCredentialService(undefined, undefined, transport, tokenProvider, endpoint));
			tokenProvider.setToken('one');
			const credential = await credentials.getCredential(signal());
			await transport.rest(credential.account, credential.token, { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/one` }, signal());
			await transport.rest(credential.account, credential.token, { method: 'GET', url: `${server.apiBaseUrl}/repos/o/r/two` }, signal());
			const invalidations: string[] = [];
			disposables.add(credentials.onDidInvalidate(event => invalidations.push(event.reason)));

			credentials.handleRequestError(credential, new GitHubRequestError('Bad credentials', 'authentication', 401));

			assert.deepStrictEqual({
				token: tokenProvider.getToken(),
				invalidatedTokens: tokenProvider.invalidatedTokens,
				aborted: credential.signal.aborted,
				invalidations,
			}, {
				token: undefined,
				invalidatedTokens: ['one'],
				aborted: true,
				invalidations: ['authentication'],
			});
			server.assertSatisfied();
		});
	});

	test('preserves account cooldowns across token rotation', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r', response: gitHubRateLimitResponse({ status: 429, retryAfterSeconds: 5 }) }),
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r', response: gitHubJsonResponse({ ok: true }) }),
			);
			const scheduler = disposables.add(new FakeGitHubScheduler());
			const tokenProvider = disposables.add(new TestTokenProvider());
			const transport = disposables.add(new GitHubTransport(nodeFetch, scheduler));
			const credentials = disposables.add(new GitHubCredentialService(scheduler, testBackoffPolicy, transport, tokenProvider, server.createEndpointService()));
			tokenProvider.setToken('one');
			const first = await credentials.getCredential(signal());
			const request = { method: 'GET' as const, url: `${server.apiBaseUrl}/repos/o/r` };
			await assert.rejects(transport.rest(first.account, first.token, request, signal()), { kind: 'rateLimit' });
			tokenProvider.setToken('two');
			const second = await credentials.getCredential(signal());
			const cooldown = transport.rateLimits.getDelay(second.account, 'core');
			const pending = transport.rest(second.account, second.token, request, signal());
			scheduler.advanceBy(4_999);
			const beforeReset = server.requests.length;
			scheduler.advanceBy(1);
			await pending;
			assert.deepStrictEqual({ cooldown, beforeReset, requests: server.requests.length, timers: scheduler.pendingCount }, {
				cooldown: 5_000, beforeReset: 3, requests: 4, timers: 0,
			});
			server.assertSatisfied();
		});
	});

	for (const status of [429, 503]) {
		test(`identity bootstrap honors Retry-After across repeated attempts after HTTP ${status}`, async () => {
			const scheduler = disposables.add(new FakeGitHubScheduler());
			const requests: number[] = [];
			const tokenProvider = disposables.add(new TestTokenProvider());
			tokenProvider.setToken('token');
			const transport = disposables.add(new GitHubTransport(async () => {
				requests.push(scheduler.now());
				return requests.length === 1
					? new Response('{"message":"Try later"}', {
						status,
						headers: { 'Retry-After': status === 429 ? '120' : new Date(120_000).toUTCString() },
					})
					: new Response('{"id":101}');
			}, scheduler));
			const credentials = disposables.add(new GitHubCredentialService(scheduler, testBackoffPolicy, transport, tokenProvider, {
				onDidChange: Event.None,
				getApiBaseUri: () => 'https://api.example.test',
				getGraphQlUri: () => 'https://api.example.test/graphql',
			}));
			await assert.rejects(credentials.getCredential(signal()), { kind: status === 429 ? 'rateLimit' : 'server' });
			const pending = credentials.getCredential(signal());
			await flush();
			scheduler.advanceBy(119_999);
			await flush();
			const requestsBeforeReset = requests.length;
			scheduler.advanceBy(1);
			const credential = await pending;
			assert.deepStrictEqual({ requests, requestsBeforeReset, account: credential.account, timers: scheduler.pendingCount }, {
				requests: [0, 120_000], requestsBeforeReset: 1,
				account: { host: 'api.example.test', accountId: '101' }, timers: 0,
			});
		});
	}

	test('cancelling a bootstrap cooldown waiter does not erase the server delay', async () => {
		const scheduler = disposables.add(new FakeGitHubScheduler());
		const tokenProvider = disposables.add(new TestTokenProvider());
		tokenProvider.setToken('token');
		let requests = 0;
		const transport = disposables.add(new GitHubTransport(async () => ++requests === 1
			? new Response('', { status: 429, headers: { 'Retry-After': '120' } })
			: new Response('{"id":101}'), scheduler));
		const credentials = disposables.add(new GitHubCredentialService(scheduler, testBackoffPolicy, transport, tokenProvider, {
			onDidChange: Event.None,
			getApiBaseUri: () => 'https://api.example.test',
			getGraphQlUri: () => 'https://api.example.test/graphql',
		}));
		await assert.rejects(credentials.getCredential(signal()), { kind: 'rateLimit' });
		const controller = new AbortController();
		const reason = new Error('cancelled');
		const rejected = assert.rejects(credentials.getCredential(controller.signal), error => error === reason);
		await flush();
		controller.abort(reason);
		await rejected;
		const cancelledTimers = scheduler.pendingCount;
		const pending = credentials.getCredential(signal());
		await flush();
		scheduler.advanceBy(119_999);
		const requestsBeforeReset = requests;
		scheduler.advanceBy(1);
		await pending;
		assert.deepStrictEqual({ cancelledTimers, requestsBeforeReset, requests, timers: scheduler.pendingCount }, {
			cancelledTimers: 0, requestsBeforeReset: 1, requests: 2, timers: 0,
		});
	});

	for (const status of [429, 503]) {
		test(`bounds each credential wait without shortening a long HTTP ${status} cooldown`, async () => {
			const scheduler = disposables.add(new FakeGitHubScheduler());
			const tokenProvider = disposables.add(new TestTokenProvider());
			tokenProvider.setToken('token');
			const requests: number[] = [];
			const transport = disposables.add(new GitHubTransport(async () => {
				requests.push(scheduler.now());
				return requests.length === 1
					? new Response('{}', { status, headers: { 'Retry-After': '360' } })
					: new Response('{"id":101}');
			}, scheduler));
			const credentials = disposables.add(new GitHubCredentialService(scheduler, testBackoffPolicy, transport, tokenProvider, {
				onDidChange: Event.None,
				getApiBaseUri: () => 'https://api.example.test',
				getGraphQlUri: () => 'https://api.example.test/graphql',
			}));
			await assert.rejects(credentials.getCredential(signal()), { kind: status === 429 ? 'rateLimit' : 'server' });
			let outcome: string | undefined;
			const first = credentials.getCredential(signal()).then(
				() => { outcome = 'success'; },
				error => { outcome = error instanceof GitHubRequestError ? error.kind : 'unexpected'; },
			);
			await flush();
			scheduler.advanceBy(100_000);
			const peer = credentials.getCredential(signal());
			await flush();
			scheduler.advanceBy(200_000);
			await flush();
			const outcomeAtDeadline = outcome;
			scheduler.advanceBy(59_999);
			await flush();
			const beforeReset = requests.length;
			scheduler.advanceBy(1);
			const credential = await peer;
			await first;
			assert.deepStrictEqual({ outcomeAtDeadline, outcome, beforeReset, requests, account: credential.account, timers: scheduler.pendingCount }, {
				outcomeAtDeadline: 'timeout', outcome: 'timeout', beforeReset: 1, requests: [0, 360_000],
				account: { host: 'api.example.test', accountId: '101' }, timers: 0,
			});
		});
	}

	for (const method of ['get', 'resolve'] as const) {
		test(`bounds ${method}Credential when the token provider stalls`, async () => {
			const scheduler = disposables.add(new FakeGitHubScheduler());
			const token = new DeferredPromise<string>();
			let calls = 0;
			const transport = disposables.add(new GitHubTransport(async () => {
				calls++;
				return new Response('{"id":101}');
			}, scheduler));
			const credentials = disposables.add(new GitHubCredentialService(scheduler, testBackoffPolicy, transport, { getToken: () => token.p }, {
				onDidChange: Event.None,
				getApiBaseUri: () => 'https://api.example.test',
				getGraphQlUri: () => 'https://api.example.test/graphql',
			}));
			let outcome: string | undefined;
			const pending = (method === 'get' ? credentials.getCredential(signal()) : credentials.resolveCredential('token', signal())).then(
				() => { outcome = 'success'; },
				error => { outcome = error instanceof GitHubRequestError ? error.kind : 'unexpected'; },
			);
			scheduler.advanceBy(300_000);
			await flush();
			const outcomeBeforeToken = outcome;
			await token.complete('token');
			await pending;
			assert.deepStrictEqual({ outcomeBeforeToken, outcome, calls, timers: scheduler.pendingCount }, {
				outcomeBeforeToken: 'timeout', outcome: 'timeout', calls: 0, timers: 0,
			});
		});
	}

	test('preserves cancellation when token acquisition aborts synchronously', async () => {
		const scheduler = disposables.add(new FakeGitHubScheduler());
		const controller = new AbortController();
		const reason = new Error('cancelled');
		const transport = disposables.add(new GitHubTransport(undefined, scheduler));
		const credentials = disposables.add(new GitHubCredentialService(scheduler, testBackoffPolicy, transport, {
			getToken: () => { controller.abort(reason); return undefined; },
		}, {
			onDidChange: Event.None,
			getApiBaseUri: () => 'https://api.example.test',
			getGraphQlUri: () => 'https://api.example.test/graphql',
		}));
		await assert.rejects(credentials.getCredential(controller.signal), error => error === reason);
		await flush();
		assert.strictEqual(scheduler.pendingCount, 0);
	});

	test('retries stable account resolution after a transient identity failure', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubDisconnectResponse() }),
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubDisconnectResponse() }),
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
			);
			const tokenProvider = disposables.add(new TestTokenProvider());
			tokenProvider.setToken('one');
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const credentials = disposables.add(new GitHubCredentialService(undefined, undefined, transport, tokenProvider, server.createEndpointService()));

			await assert.rejects(() => credentials.getCredential(signal()), error =>
				error instanceof GitHubRequestError && error.kind === 'network');
			const recovered = await credentials.getCredential(signal());

			assert.deepStrictEqual({
				account: recovered.account,
				generation: recovered.generation,
				requestCount: server.requests.length,
			}, {
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
				generation: 2,
				requestCount: 3,
			});
			server.assertSatisfied();
		});
	});

	test('ignores authentication errors from a replaced credential generation', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
			);
			const tokenProvider = disposables.add(new TestTokenProvider());
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const credentials = disposables.add(new GitHubCredentialService(undefined, undefined, transport, tokenProvider, server.createEndpointService()));

			tokenProvider.setToken('one');
			const previous = await credentials.getCredential(signal());
			tokenProvider.setToken('two');
			const current = await credentials.getCredential(signal());
			credentials.handleRequestError(previous, new GitHubRequestError('Old request failed', 'authentication', 401));

			assert.deepStrictEqual({
				token: tokenProvider.getToken(),
				invalidatedTokens: tokenProvider.invalidatedTokens,
				previousAborted: previous.signal.aborted,
				currentAborted: current.signal.aborted,
			}, {
				token: 'two',
				invalidatedTokens: [],
				previousAborted: true,
				currentAborted: false,
			});
			server.assertSatisfied();
		});
	});

	test('delays identity resolution while GitHub keeps failing the same credential', async () => {
		await withServer(async server => {
			server.enqueue(
				...unreachableUserSteps(2),
				...resolvedUserSteps(1),
			);
			const scheduler = disposables.add(new FakeGitHubScheduler({ now: 0 }));
			const tokenProvider = disposables.add(new TestTokenProvider());
			tokenProvider.setToken('one');
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const credentials = disposables.add(new GitHubCredentialService(scheduler, testBackoffPolicy, transport, tokenProvider, server.createEndpointService()));

			await assert.rejects(() => credentials.getCredential(signal()));
			await assert.rejects(() => credentials.getCredential(signal()));
			const delayed = credentials.getCredential(signal());
			await flush();
			const requestsWhileDelayed = server.requests.length;
			const armedDelay = scheduler.nextDueTime;
			scheduler.advanceBy(1_000);
			const recovered = await delayed;

			assert.deepStrictEqual({
				requestsWhileDelayed,
				armedDelay,
				requestCount: server.requests.length,
				account: recovered.account,
			}, {
				requestsWhileDelayed: 4,
				armedDelay: 1_000,
				requestCount: 5,
				account: { host: new URL(server.apiBaseUrl).host, accountId: '101' },
			});
			server.assertSatisfied();
		});
	});

	test('escalates while GitHub refuses a credential whose identity call still resolves', async () => {
		await withServer(async server => {
			// The shape an authentication outage actually takes: `/user` answers
			// but every real request is refused, and the host cannot drop the
			// token. Each refusal must cost more than the last, or the
			// subscribers that re-ask on invalidation spin with no delay at all.
			server.enqueue(...resolvedUserSteps(4));
			const scheduler = disposables.add(new FakeGitHubScheduler({ now: 0 }));
			const tokenProvider = disposables.add(new TestTokenProvider(true));
			tokenProvider.setToken('one');
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const credentials = disposables.add(new GitHubCredentialService(scheduler, testBackoffPolicy, transport, tokenProvider, server.createEndpointService()));

			const delays: number[] = [];
			const expectedDelays = [0, 0, 1_000, 2_000];
			for (let round = 0; round < 4; round++) {
				const startedAt = scheduler.now();
				const pending = credentials.getCredential(signal());
				await flush();
				scheduler.advanceBy(expectedDelays[round]);
				const credential = await pending;
				delays.push(scheduler.now() - startedAt);
				credentials.handleRequestError(credential, new GitHubRequestError('Bad credentials', 'authentication', 401));
			}

			assert.deepStrictEqual({ delays, requestCount: server.requests.length }, {
				delays: [0, 0, 1_000, 2_000],
				requestCount: 4,
			});
			server.assertSatisfied();
		});
	});

	test('resolves without delay once a new credential replaces the failing one', async () => {
		await withServer(async server => {
			server.enqueue(
				...unreachableUserSteps(2),
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 202 }) }),
			);
			const scheduler = disposables.add(new FakeGitHubScheduler({ now: 0 }));
			const tokenProvider = disposables.add(new TestTokenProvider());
			tokenProvider.setToken('one');
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const credentials = disposables.add(new GitHubCredentialService(scheduler, testBackoffPolicy, transport, tokenProvider, server.createEndpointService()));

			await assert.rejects(() => credentials.getCredential(signal()));
			await assert.rejects(() => credentials.getCredential(signal()));
			// Parks on the delay the two failures established, and must abandon
			// it rather than resolve the credential that has since been replaced.
			const abandoned = assert.rejects(
				() => credentials.getCredential(signal()),
				error => error instanceof GitHubRequestError && error.kind === 'authentication',
			);
			await flush();
			tokenProvider.setToken('two');
			const recovered = await credentials.getCredential(signal());
			await abandoned;

			assert.deepStrictEqual({
				account: recovered.account,
				requestCount: server.requests.length,
				pendingDelays: scheduler.pendingCount,
			}, {
				account: { host: new URL(server.apiBaseUrl).host, accountId: '202' },
				requestCount: 5,
				pendingDelays: 0,
			});
			server.assertSatisfied();
		});
	});
});
