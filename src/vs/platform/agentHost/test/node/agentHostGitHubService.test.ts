/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IAgent } from '../../common/agent.js';
import { authenticationAccountId, authenticationAccountMeta, readAuthenticationAccount } from '../../common/meta/agentAuthenticationAccount.js';
import { AgentHostAuthenticationService, IAgentHostAuthenticationService, IAgentHostAuthTokenChangeEvent } from '../../node/agentHostAuthenticationService.js';
import { createTestAgentHostGitHubService } from './testGitHubService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AuthRequiredReason } from '../../common/state/sessionActions.js';

suite('Agent Host GitHub clients', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const failure of ['bootstrap', 'repository'] as const) {
		test(`quarantines a ${failure} 401 once and recovers with a different repository token`, async () => {
			const endpoint = createTestGitHubEndpointService();
			const resource = endpoint.getRepoResource();
			const account = { providerId: 'github', accountId: 'account-a' };
			const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
			const accepted: string[] = [];
			const provider = new class extends mock<IAgent>() {
				override getProtectedResources() { return [resource]; }
				override async authenticate(_resource: string, token: string) { accepted.push(token); return true; }
			}();
			const authenticate = (token: string) => authentication.authenticate({
				resource: resource.resource, scopes: ['repo'], token, _meta: authenticationAccountMeta(account),
			}, [provider]);
			await authenticate('refused-token');
			const challenges: Parameters<AgentHostStateManager['emitAuthRequired']>[0][] = [];
			const stateManager = new class extends mock<AgentHostStateManager>() {
				override emitAuthRequired(params: Parameters<AgentHostStateManager['emitAuthRequired']>[0]) { challenges.push(params); }
			}();
			const requests: string[] = [];
			const service = store.add(createTestAgentHostGitHubService({
				fetch: async (input, init) => {
					const path = new URL(String(input)).pathname;
					const refused = new Headers(init?.headers).get('Authorization')?.includes('refused-token') === true;
					requests.push(`${refused ? 'refused' : 'fresh'}:${path}`);
					return refused && (failure === 'bootstrap' || path !== '/user')
						? new Response('{"message":"Bad credentials"}', { status: 401 })
						: new Response(JSON.stringify(path === '/user' ? { id: 101 } : { title: 'Recovered PR', body: '' }));
				},
			}, authentication, endpoint, new NullLogService(), NullTelemetryService, stateManager));
			const signal = new AbortController().signal;
			const read = async () => {
				const client = store.add(service.acquireRepositoryClient(signal)).object;
				const { account } = await client.credentials.getCredential(signal);
				return client.query.getIssueOrPullRequest({ ...account, owner: 'owner', repo: 'repo', number: 7 }, signal);
			};
			await assert.rejects(read(), { kind: 'authentication', statusCode: 401 });
			await timeout(0);
			const refusedAgain = await authenticate('refused-token');
			await assert.rejects(read());
			const tokenAfterRejection = authentication.getAuthToken({ resource: resource.resource, scopes: ['repo'] });
			const retainedAccount = authentication.getAuthAccount({ resource: resource.resource, scopes: ['repo'] });
			await authenticate('fresh-token');
			const recovered = await read();
			assert.deepStrictEqual({ tokenAfterRejection, retainedAccount, refusedAgain, recovered, challenges, accepted, requests }, {
				tokenAfterRejection: undefined, retainedAccount: account, refusedAgain: { authenticated: false },
				recovered: { title: 'Recovered PR', body: '' },
				challenges: [{ resource, reason: AuthRequiredReason.Expired }],
				accepted: ['refused-token', 'fresh-token'],
				requests: [
					'refused:/user', ...(failure === 'repository' ? ['refused:/repos/owner/repo/issues/7'] : []),
					'fresh:/user', 'fresh:/repos/owner/repo/issues/7',
				],
			});
		});
	}

	test('refusing an old token cannot supersede an in-flight replacement or replay it later', async () => {
		const resource = createTestGitHubEndpointService().getRepoResource();
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const replacement = new DeferredPromise<void>();
		const dispatched: string[] = [];
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate(_resource: string, token: string) {
				dispatched.push(token);
				if (token === 'fresh') {
					await replacement.p;
				}
				return true;
			}
		}();
		const request = { resource: resource.resource, scopes: ['repo'] };
		await authentication.authenticate({ ...request, token: 'old' }, [provider]);
		assert.strictEqual(authentication.rejectToken(request, 'old', undefined), true);
		const pending = authentication.authenticate({ ...request, token: 'fresh' }, [provider]);
		const refused = await authentication.authenticate({ ...request, token: 'old' }, [provider]);
		await replacement.complete();
		const accepted = await pending;
		const lateRejection = authentication.rejectToken(request, 'old', undefined);
		const lateForward = await authentication.authenticate({ ...request, token: 'old' }, [provider]);
		const replayed: string[] = [];
		await authentication.replay(new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate(_resource: string, token: string) { replayed.push(token); return true; }
		}());
		assert.deepStrictEqual({ refused, accepted, lateRejection, lateForward, dispatched, replayed, token: authentication.getAuthToken(request) }, {
			refused: { authenticated: false }, accepted: { authenticated: true }, lateRejection: false,
			lateForward: { authenticated: false }, dispatched: ['old', 'fresh'], replayed: ['fresh'], token: 'fresh',
		});
	});

	test('quarantines the selected scoped grant without falling back to another account or resource', async () => {
		const resource = createTestGitHubEndpointService().getRepoResource();
		const enterprise = createTestGitHubEndpointService('https://tenant.ghe.com').getRepoResource();
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource, enterprise]; }
			override async authenticate() { return true; }
		}();
		const account = { providerId: 'github', accountId: 'account-a' };
		for (const params of [
			{ resource: resource.resource, scopes: ['repo', 'gist'], token: 'old', _meta: authenticationAccountMeta(account) },
			{ resource: resource.resource, scopes: ['repo', 'gist', 'workflow'], token: 'other-account', _meta: authenticationAccountMeta({ providerId: 'github', accountId: 'account-b' }) },
			{ resource: resource.resource, scopes: ['read:user'], token: 'profile' },
			{ resource: enterprise.resource, scopes: ['repo'], token: 'old' },
		]) {
			await authentication.authenticate(params, [provider]);
		}
		const request = { resource: resource.resource, scopes: ['repo'] };
		const wrongAccount = authentication.rejectToken(request, 'old', 'wrong-account');
		const rejected = authentication.rejectToken(request, 'old', authenticationAccountId(account));
		const rescope = await authentication.authenticate({ ...request, token: 'old', _meta: authenticationAccountMeta(account) }, [provider]);
		assert.deepStrictEqual({
			wrongAccount, rejected, rescope, token: authentication.getAuthToken(request), account: authentication.getAuthAccount(request),
			profile: authentication.getAuthToken({ resource: resource.resource, scopes: ['read:user'] }),
			enterprise: authentication.getAuthToken({ resource: enterprise.resource, scopes: ['repo'] }),
		}, {
			wrongAccount: false, rejected: true, rescope: { authenticated: false }, token: undefined, account, profile: 'profile', enterprise: 'old',
		});
	});

	test('a pending provider acceptance cannot reinstall a token rejected while it was in flight', async () => {
		const resource = createTestGitHubEndpointService().getRepoResource();
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const pending = new DeferredPromise<void>();
		let calls = 0;
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate() {
				if (++calls > 1) {
					await pending.p;
				}
				return true;
			}
		}();
		const request = { resource: resource.resource, scopes: ['repo'], token: 'old' };
		await authentication.authenticate(request, [provider]);
		const forwarding = authentication.authenticate(request, [provider]);
		const rejected = authentication.rejectToken(request, 'old', undefined);
		await pending.complete();
		const result = await forwarding;
		assert.deepStrictEqual({ rejected, result, token: authentication.getAuthToken(request) }, {
			rejected: true, result: { authenticated: false }, token: undefined,
		});
	});

	test('a refused bearer stays quarantined across all scopes on its resource', async () => {
		const endpoint = createTestGitHubEndpointService();
		const resource = endpoint.getRepoResource().resource;
		const otherResource = endpoint.getCopilotResource().resource;
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const dispatched: string[] = [];
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [endpoint.getRepoResource(), endpoint.getCopilotResource()]; }
			override async authenticate(resource: string, token: string) { dispatched.push(`${resource}:${token}`); return true; }
		}();
		await authentication.authenticate({ resource, scopes: ['repo', 'gist'], token: 'refused' }, [provider]);
		await authentication.authenticate({ resource, scopes: ['workflow'], token: 'refused' }, [provider]);
		await authentication.authenticate({ resource: otherResource, scopes: ['read:user'], token: 'refused' }, [provider]);
		dispatched.length = 0;
		const rejected = authentication.rejectToken({ resource, scopes: ['repo', 'gist'] }, 'refused', undefined);
		const scopeSets: (readonly string[] | undefined)[] = [undefined, [], ['repo'], ['gist'], ['workflow'], ['repo', 'gist'], ['workflow', 'gist', 'repo']];
		const attempts = [];
		for (const scopes of scopeSets) {
			const result = await authentication.authenticate({ resource, scopes, token: 'refused' }, [provider]);
			attempts.push({ authenticated: result.authenticated, token: authentication.getAuthToken({ resource, scopes }) });
		}
		await authentication.replay(provider);
		assert.deepStrictEqual({
			rejected, attempts, dispatched, otherToken: authentication.getAuthToken({ resource: otherResource, scopes: ['read:user'] }),
		}, {
			rejected: true, attempts: scopeSets.map(() => ({ authenticated: false, token: undefined })),
			dispatched: [`${otherResource}:refused`], otherToken: 'refused',
		});
	});

	test('an aborted bootstrap and late 401 never quarantine a replacement token', async () => {
		const endpoint = createTestGitHubEndpointService();
		const resource = endpoint.getRepoResource();
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate() { return true; }
		}();
		const request = { resource: resource.resource, scopes: ['repo'] };
		await authentication.authenticate({ ...request, token: 'old' }, [provider]);
		const started = new DeferredPromise<void>();
		const oldResponse = new DeferredPromise<Response>();
		let challenges = 0;
		const service = store.add(createTestAgentHostGitHubService({
			fetch: async (_input, init) => {
				if (new Headers(init?.headers).get('Authorization')?.includes('old')) {
					await started.complete();
					return oldResponse.p;
				}
				return new Response('{"id":101}');
			},
		}, authentication, endpoint, new NullLogService(), NullTelemetryService, new class extends mock<AgentHostStateManager>() {
			override emitAuthRequired() { challenges++; }
		}()));
		const signal = new AbortController().signal;
		const client = store.add(service.acquireRepositoryClient(signal)).object;
		const oldRead = assert.rejects(client.credentials.getCredential(signal));
		await started.p;
		await authentication.authenticate({ ...request, token: 'fresh' }, [provider]);
		const fresh = await client.credentials.getCredential(signal);
		await oldResponse.complete(new Response('{"message":"Bad credentials"}', { status: 401 }));
		await oldRead;
		assert.deepStrictEqual({ challenges, token: authentication.getAuthToken(request), credential: fresh.token }, {
			challenges: 0, token: 'fresh', credential: 'fresh',
		});
	});

	for (const knownAccount of [false, true]) {
		test(`same-account renewal after expiry keeps the repository selection (${knownAccount ? 'account metadata' : 'legacy client'})`, () => runWithFakedTimers({}, async () => {
			const endpoint = createTestGitHubEndpointService();
			const resource = endpoint.getRepoResource();
			const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
			const provider = new class extends mock<IAgent>() {
				override getProtectedResources() { return [resource]; }
				override async authenticate() { return true; }
			}();
			const metadata = knownAccount ? { _meta: authenticationAccountMeta({ providerId: 'github', accountId: 'account-a' }) } : {};
			await authentication.authenticate({ resource: resource.resource, scopes: ['repo'], token: 'first-token', expiresIn: 1, ...metadata }, [provider]);
			const service = store.add(createTestAgentHostGitHubService({ fetch: async () => new Response('{"id":101}') }, authentication, endpoint, new NullLogService(), NullTelemetryService));
			try {
				const first = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
				await first.credentials.getCredential(new AbortController().signal);
				let changed = 0;
				let invalidated = 0;
				store.add(service.onDidChangeRepositoryClient(() => changed++));
				store.add(first.onDidInvalidate(() => invalidated++));
				await timeout(1_001);
				await assert.rejects(first.credentials.getCredential(new AbortController().signal), { kind: 'authentication' });
				await authentication.authenticate({ resource: resource.resource, scopes: ['repo'], token: 'renewed-token', expiresIn: 60, ...metadata }, [provider]);
				const next = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
				const credential = await next.credentials.getCredential(new AbortController().signal);
				assert.deepStrictEqual({ sameClient: first === next, changed, invalidated, account: credential.account.accountId }, {
					sameClient: true, changed: 0, invalidated: 0, account: '101',
				});
			} finally {
				service.dispose();
			}
		}));
	}

	for (const transition of ['same', 'different', 'revokeDifferent', 'legacyDifferent'] as const) {
		test(`bootstrap cooldown uses the forwarded account identity (${transition})`, () => runWithFakedTimers({}, async () => {
			const endpoint = createTestGitHubEndpointService();
			const resource = endpoint.getRepoResource();
			const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
			const provider = new class extends mock<IAgent>() {
				override getProtectedResources() { return [resource]; }
				override async authenticate() { return true; }
			}();
			let accountId = 101;
			const start = Date.now();
			const requests: { accountId: number; at: number }[] = [];
			const authenticate = (token: string, account: string) => authentication.authenticate({
				resource: resource.resource, scopes: ['repo'], token,
				...(transition !== 'legacyDifferent' ? { _meta: authenticationAccountMeta({ providerId: 'github', accountId: account }) } : {}),
			}, [provider]);
			await authenticate('first-token', 'account-a');
			const service = store.add(createTestAgentHostGitHubService({
				fetch: async () => {
					requests.push({ accountId, at: Date.now() - start });
					return new Response(JSON.stringify({ id: accountId }));
				},
			}, authentication, endpoint, new NullLogService(), NullTelemetryService));
			try {
				const first = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
				const credential = await first.credentials.getCredential(new AbortController().signal);
				first.transport.rateLimits.updateFromResponse(credential.account, new Response(null, {
					status: 429, headers: { 'Retry-After': '60' },
				}));
				if (transition === 'revokeDifferent') {
					await authenticate('', 'account-a');
				}
				accountId = transition === 'same' ? 101 : 202;
				await authenticate('second-token', transition === 'same' ? 'account-a' : 'account-b');
				const second = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
				await second.credentials.getCredential(new AbortController().signal);
				assert.deepStrictEqual(requests, [
					{ accountId: 101, at: 0 },
					{ accountId, at: transition === 'same' || transition === 'legacyDifferent' ? 60_000 : 0 },
				]);
				if (transition === 'different') {
					accountId = 101;
					await authenticate('third-token', 'account-a');
					const returning = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
					await returning.credentials.getCredential(new AbortController().signal);
					assert.deepStrictEqual(requests[2], { accountId: 101, at: 60_000 });
				}
			} finally {
				service.dispose();
			}
		}));
	}

	test('account provenance follows the selected scoped token and survives provider replay', async () => {
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const resource = createTestGitHubEndpointService().getRepoResource();
		const account = { providerId: 'github', accountId: 'repository-account' };
		const replayed: ReturnType<typeof readAuthenticationAccount>[] = [];
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate() { return true; }
			override async handleAuthenticationToken(params: Parameters<NonNullable<IAgent['handleAuthenticationToken']>>[0]) {
				replayed.push(readAuthenticationAccount(params));
				return true;
			}
		}();
		await authentication.authenticate({
			resource: resource.resource, scopes: ['repo', 'gist'], token: 'repository-token',
			_meta: authenticationAccountMeta(account),
		}, [provider]);
		await authentication.authenticate({
			resource: resource.resource, scopes: ['read:user'], token: 'profile-token',
			_meta: authenticationAccountMeta({ providerId: 'github', accountId: 'profile-account' }),
		}, [provider]);
		replayed.length = 0;
		await authentication.replay(provider);
		const request = { resource: resource.resource, scopes: ['repo'] };
		assert.deepStrictEqual({ token: authentication.getAuthToken(request), account: authentication.getAuthAccount(request), replayed }, {
			token: 'repository-token', account, replayed: [account, { providerId: 'github', accountId: 'profile-account' }],
		});
	});

	test('expiry-driven account fallback invalidates the old client and notifies its consumers', () => runWithFakedTimers({}, async () => {
		const endpoint = createTestGitHubEndpointService();
		const resource = endpoint.getRepoResource();
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate() { return true; }
		}();
		await authentication.authenticate({
			resource: resource.resource, scopes: ['repo'], token: 'first-token', expiresIn: 1,
			_meta: authenticationAccountMeta({ providerId: 'github', accountId: 'first' }),
		}, [provider]);
		await authentication.authenticate({
			resource: resource.resource, scopes: ['repo', 'gist'], token: 'fallback-token', expiresIn: 60,
			_meta: authenticationAccountMeta({ providerId: 'github', accountId: 'fallback' }),
		}, [provider]);
		const service = store.add(createTestAgentHostGitHubService({
			fetch: async (_url, init) => new Response(JSON.stringify({
				id: new Headers(init?.headers).get('Authorization') === 'Bearer first-token' ? 101 : 202,
			})),
		}, authentication, endpoint, new NullLogService(), NullTelemetryService));
		try {
			const first = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
			await first.credentials.getCredential(new AbortController().signal);
			let selectionsChanged = 0;
			let invalidated = 0;
			store.add(service.onDidChangeRepositoryClient(() => selectionsChanged++));
			store.add(first.onDidInvalidate(() => invalidated++));
			await timeout(1_001);
			await assert.rejects(first.credentials.getCredential(new AbortController().signal));
			const replacement = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
			const credential = await replacement.credentials.getCredential(new AbortController().signal);
			assert.deepStrictEqual({ selectionsChanged, invalidated, account: credential.account.accountId }, {
				selectionsChanged: 1, invalidated: 1, account: '202',
			});
		} finally {
			service.dispose();
		}
	}));

	test('a client acquired after expired-token pruning is retired when the known account renews', () => runWithFakedTimers({}, async () => {
		const endpoint = createTestGitHubEndpointService();
		const resource = endpoint.getRepoResource();
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate() { return true; }
		}();
		const request = { resource: resource.resource, scopes: ['repo'], _meta: authenticationAccountMeta({ providerId: 'github', accountId: 'account' }) };
		await authentication.authenticate({ ...request, token: 'first-token', expiresIn: 1 }, [provider]);
		const service = store.add(createTestAgentHostGitHubService({ fetch: async () => new Response('{"id":101}') }, authentication, endpoint, new NullLogService(), NullTelemetryService));
		try {
			const first = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
			await first.credentials.getCredential(new AbortController().signal);
			let selectionsChanged = 0;
			store.add(service.onDidChangeRepositoryClient(() => selectionsChanged++));
			await timeout(1_001);
			await authentication.replay(provider);
			const acquiring = new AbortController();
			store.add(service.onDidChangeRepositoryClient(() => acquiring.abort(new Error('Selection changed'))));
			assert.throws(() => service.acquireRepositoryClient(acquiring.signal), /Selection changed/);
			const gap = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
			await assert.rejects(gap.credentials.getCredential(new AbortController().signal), { kind: 'authentication' });
			let gapInvalidated = 0;
			store.add(gap.onDidInvalidate(() => gapInvalidated++));
			await authentication.authenticate({ ...request, token: 'renewed-token', expiresIn: 60 }, [provider]);
			const replacement = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
			const credential = await replacement.credentials.getCredential(new AbortController().signal);
			assert.deepStrictEqual({ selectionsChanged, gapInvalidated, account: credential.account.accountId }, {
				selectionsChanged: 2, gapInvalidated: 1, account: '101',
			});
		} finally {
			service.dispose();
		}
	}));

	test('unrecognized account metadata remains optional and rejected tokens cannot replace it', async () => {
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const resource = createTestGitHubEndpointService().getRepoResource();
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate(_resource: string, token: string) { return token !== 'rejected'; }
		}();
		const request = { resource: resource.resource, scopes: ['repo'] };
		await authentication.authenticate({ ...request, token: 'legacy', _meta: { 'vscode.authentication.account': { accountId: 101 } } }, [provider]);
		const legacy = { token: authentication.getAuthToken(request), account: authentication.getAuthAccount(request) };
		const account = { providerId: 'github', accountId: 'accepted' };
		await authentication.authenticate({ ...request, token: 'accepted', _meta: authenticationAccountMeta(account) }, [provider]);
		await authentication.authenticate({ ...request, token: 'rejected', _meta: authenticationAccountMeta({ providerId: 'github', accountId: 'other' }) }, [provider]);
		assert.deepStrictEqual({ legacy, token: authentication.getAuthToken(request), account: authentication.getAuthAccount(request) }, {
			legacy: { token: 'legacy', account: undefined }, token: 'accepted', account,
		});
	});

	test('preserves identity and conditional reads between repository consumers', async () => {
		const endpoint = createTestGitHubEndpointService();
		const changed = store.add(new Emitter<IAgentHostAuthTokenChangeEvent>());
		const authentication = new class extends mock<IAgentHostAuthenticationService>() {
			override readonly onDidChangeAuthToken = changed.event;
			override getAuthAccount() { return undefined; }
			override getAuthToken() { return 'token'; }
		}();
		const requests: { path: string; etag: string | null }[] = [];
		const service = store.add(createTestAgentHostGitHubService({
			fetch: async (input, init) => {
				const path = new URL(String(input)).pathname;
				const etag = new Headers(init?.headers).get('If-None-Match');
				requests.push({ path, etag });
				return path === '/user'
					? new Response('{"id":101}')
					: etag ? new Response(null, { status: 304 })
						: new Response('{"title":"Context","body":"Body","pull_request":{}}', { headers: { ETag: '"cached"' } });
			},
		}, authentication, endpoint, new NullLogService(), NullTelemetryService));
		for (let i = 0; i < 3; i++) {
			const reference = store.add(service.acquireRepositoryClient(new AbortController().signal));
			const credential = await reference.object.credentials.getCredential(new AbortController().signal);
			assert.deepStrictEqual(await reference.object.query.getIssueOrPullRequest({ ...credential.account, owner: 'owner', repo: 'repo', number: 7 }, credential.signal), { title: 'Context', body: 'Body' });
			reference.dispose();
		}
		assert.deepStrictEqual(requests, [
			{ path: '/user', etag: null },
			{ path: '/repos/owner/repo/issues/7', etag: null },
			{ path: '/repos/owner/repo/issues/7', etag: '"cached"' },
			{ path: '/repos/owner/repo/issues/7', etag: '"cached"' },
		]);
	});

	test('releasing a cancelled context reader preserves a shared peer request', async () => {
		const endpoint = createTestGitHubEndpointService();
		const authentication = new class extends mock<IAgentHostAuthenticationService>() {
			override readonly onDidChangeAuthToken = Event.None;
			override getAuthAccount() { return undefined; }
			override getAuthToken() { return 'token'; }
		}();
		const started = new DeferredPromise<AbortSignal>();
		const response = new DeferredPromise<Response>();
		const requests: string[] = [];
		const service = store.add(createTestAgentHostGitHubService({
			fetch: async (input, init) => {
				const path = new URL(String(input)).pathname;
				requests.push(path);
				if (path === '/user') {
					return new Response('{"id":101}');
				}
				assert.ok(init?.signal);
				await started.complete(init.signal);
				return response.p;
			},
		}, authentication, endpoint, new NullLogService(), NullTelemetryService));
		const controller = new AbortController();
		const first = store.add(service.acquireRepositoryClient(controller.signal));
		const second = store.add(service.acquireRepositoryClient(new AbortController().signal));
		const { account } = await first.object.credentials.getCredential(controller.signal);
		const ref = { ...account, owner: 'owner', repo: 'repo', number: 7 };
		const rejected = assert.rejects(first.object.query.getIssueOrPullRequest(ref, controller.signal));
		const peer = second.object.query.getIssueOrPullRequest(ref, new AbortController().signal);
		const wireSignal = await started.p;
		controller.abort();
		first.dispose();
		await rejected;
		await response.complete(new Response('{"title":"Shared","body":"Body"}'));
		assert.deepStrictEqual({ context: await peer, requests, wireAborted: wireSignal.aborted }, {
			context: { title: 'Shared', body: 'Body' }, requests: ['/user', '/repos/owner/repo/issues/7'], wireAborted: false,
		});
	});

	for (const enterpriseUri of [undefined, 'https://tenant.ghe.com', 'https://github.enterprise.test']) {
		test(`issue/PR context retains legacy unscoped credentials and endpoints (${enterpriseUri ?? 'github.com'})`, async () => {
			const endpoint = createTestGitHubEndpointService(enterpriseUri);
			const resource = endpoint.getRepoResource();
			const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
			const provider = new class extends mock<IAgent>() {
				override getProtectedResources() { return [resource]; }
				override async authenticate() { return true; }
			}();
			await authentication.authenticate({ resource: resource.resource, token: 'legacy-token' }, [provider]);
			const requests: string[] = [];
			const service = store.add(createTestAgentHostGitHubService({
				fetch: async input => {
					const url = String(input);
					requests.push(url);
					return url === `${endpoint.getApiBaseUri()}/user`
						? new Response('{"id":101}')
						: new Response('{"title":"Legacy context","body":null,"pull_request":{}}');
				},
			}, authentication, endpoint, new NullLogService(), NullTelemetryService));
			const signal = new AbortController().signal;
			const client = store.add(service.acquireRepositoryClient(signal)).object;
			const { account } = await client.credentials.getCredential(signal);
			const result = await client.query.getIssueOrPullRequest({ ...account, owner: 'owner', repo: 'repo', number: 7 }, signal);
			assert.deepStrictEqual({ result, requests, scopes: client.authorization.scopes }, {
				result: { title: 'Legacy context', body: '' },
				requests: [`${endpoint.getApiBaseUri()}/user`, `${endpoint.getApiBaseUri()}/repos/owner/repo/issues/7`],
				scopes: resource.scopes_supported,
			});
		});
	}

	test('account changes invalidate captured context readers and isolate their cached bodies', async () => {
		const endpoint = createTestGitHubEndpointService();
		const changed = store.add(new Emitter<IAgentHostAuthTokenChangeEvent>());
		let selected = 'account-a';
		const authentication = new class extends mock<IAgentHostAuthenticationService>() {
			override readonly onDidChangeAuthToken = changed.event;
			override getAuthAccount() { return { providerId: 'github', accountId: selected }; }
			override getAuthToken() { return selected; }
		}();
		const requests: { path: string; etag: string | null; account: string }[] = [];
		const service = store.add(createTestAgentHostGitHubService({
			fetch: async (input, init) => {
				const path = new URL(String(input)).pathname;
				requests.push({ path, etag: new Headers(init?.headers).get('If-None-Match'), account: selected });
				return path === '/user'
					? new Response(JSON.stringify({ id: selected === 'account-a' ? 101 : 202 }))
					: new Response(JSON.stringify({ title: selected, body: '' }), { headers: { ETag: '"private"' } });
			},
		}, authentication, endpoint, new NullLogService(), NullTelemetryService));
		const signal = new AbortController().signal;
		const first = store.add(service.acquireRepositoryClient(signal)).object;
		const { account } = await first.credentials.getCredential(signal);
		const firstContext = await first.query.getIssueOrPullRequest({ ...account, owner: 'owner', repo: 'repo', number: 7 }, signal);
		selected = 'account-b';
		changed.fire({ resource: endpoint.getRepoResource().resource, scopes: ['repo'], token: selected });
		await assert.rejects(first.query.getIssueOrPullRequest({ ...account, owner: 'owner', repo: 'repo', number: 7 }, signal));
		const second = store.add(service.acquireRepositoryClient(signal)).object;
		const next = await second.credentials.getCredential(signal);
		const secondContext = await second.query.getIssueOrPullRequest({ ...next.account, owner: 'owner', repo: 'repo', number: 7 }, signal);
		assert.deepStrictEqual({ firstContext, secondContext, requests }, {
			firstContext: { title: 'account-a', body: '' }, secondContext: { title: 'account-b', body: '' },
			requests: [
				{ path: '/user', etag: null, account: 'account-a' },
				{ path: '/repos/owner/repo/issues/7', etag: null, account: 'account-a' },
				{ path: '/user', etag: null, account: 'account-b' },
				{ path: '/repos/owner/repo/issues/7', etag: null, account: 'account-b' },
			],
		});
	});

	test('token refresh preserves the repository client and does not announce a selection change', async () => {
		const endpoint = createTestGitHubEndpointService();
		const changed = store.add(new Emitter<IAgentHostAuthTokenChangeEvent>());
		let token = 'first-token';
		const authentication = new class extends mock<IAgentHostAuthenticationService>() {
			override readonly onDidChangeAuthToken = changed.event;
			override getAuthAccount() { return undefined; }
			override getAuthToken() { return token; }
		}();
		const service = store.add(createTestAgentHostGitHubService({ fetch: async () => new Response('{"id":101}') }, authentication, endpoint, new NullLogService(), NullTelemetryService));
		const first = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
		await first.credentials.getCredential(new AbortController().signal);
		let invalidations = 0;
		let selectionsChanged = 0;
		store.add(first.onDidInvalidate(() => invalidations++));
		store.add(service.onDidChangeRepositoryClient(() => selectionsChanged++));
		token = 'refreshed-token';
		changed.fire({ resource: endpoint.getRepoResource().resource, scopes: ['repo'], token });
		const next = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
		const credential = await next.credentials.getCredential(new AbortController().signal);
		assert.deepStrictEqual({ sameClient: first === next, invalidations, selectionsChanged, refreshedToken: credential.token === token }, {
			sameClient: true, invalidations: 0, selectionsChanged: 0, refreshedToken: true,
		});
	});

	test('a changed GitHub identity announces a new repository selection', async () => {
		const endpoint = createTestGitHubEndpointService();
		const changed = store.add(new Emitter<IAgentHostAuthTokenChangeEvent>());
		let token = 'first-token';
		let accountId = 101;
		const authentication = new class extends mock<IAgentHostAuthenticationService>() {
			override readonly onDidChangeAuthToken = changed.event;
			override getAuthAccount() { return undefined; }
			override getAuthToken() { return token; }
		}();
		const service = store.add(createTestAgentHostGitHubService({ fetch: async () => new Response(JSON.stringify({ id: accountId })) }, authentication, endpoint, new NullLogService(), NullTelemetryService));
		const reference = store.add(service.acquireRepositoryClient(new AbortController().signal));
		await reference.object.credentials.getCredential(new AbortController().signal);
		let selectionsChanged = 0;
		store.add(service.onDidChangeRepositoryClient(() => selectionsChanged++));
		token = 'other-account-token';
		accountId = 202;
		changed.fire({ resource: endpoint.getRepoResource().resource, scopes: ['repo'], token });
		const next = store.add(service.acquireRepositoryClient(new AbortController().signal));
		const credential = await next.object.credentials.getCredential(new AbortController().signal);
		assert.deepStrictEqual({ selectionsChanged, accountId: credential.account.accountId }, { selectionsChanged: 1, accountId: '202' });
	});

	test('uses the host repository resource without a workbench or Copilot credential', async () => {
		const endpoint = createTestGitHubEndpointService('https://tenant.ghe.com');
		const changed = store.add(new Emitter<IAgentHostAuthTokenChangeEvent>());
		const requests: { resource: string; scopes: readonly string[] | undefined }[] = [];
		const authentication = new class extends mock<IAgentHostAuthenticationService>() {
			override readonly onDidChangeAuthToken = changed.event;
			override getAuthAccount() { return undefined; }
			override getAuthToken(request: { resource: string; scopes?: readonly string[] }) {
				requests.push({ resource: request.resource, scopes: request.scopes });
				return request.resource === endpoint.getRepoResource().resource ? 'repository-token' : undefined;
			}
		}();
		const wire: { url: string; authorization: string | null }[] = [];
		const service = store.add(createTestAgentHostGitHubService({
			fetch: async (url, init) => {
				wire.push({ url: String(url), authorization: new Headers(init?.headers).get('Authorization') });
				return new Response('{"id":101}');
			},
		}, authentication, endpoint, new NullLogService(), NullTelemetryService));
		const client = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
		const credential = await client.credentials.getCredential(new AbortController().signal);
		assert.deepStrictEqual({ requests, wire, account: credential.account }, {
			requests: [{ resource: 'https://api.tenant.ghe.com/repos', scopes: ['repo'] }],
			wire: [{ url: 'https://api.tenant.ghe.com/user', authorization: 'Bearer repository-token' }],
			account: { host: 'api.tenant.ghe.com', accountId: '101' },
		});
	});

	test('repository revocation invalidates the client but unrelated host auth does not', async () => {
		const endpoint = createTestGitHubEndpointService();
		const changed = store.add(new Emitter<IAgentHostAuthTokenChangeEvent>());
		let token: string | undefined = 'token';
		const authentication = new class extends mock<IAgentHostAuthenticationService>() {
			override readonly onDidChangeAuthToken = changed.event;
			override getAuthAccount() { return undefined; }
			override getAuthToken() { return token; }
		}();
		const service = store.add(createTestAgentHostGitHubService({ fetch: async () => new Response('{"id":101}') }, authentication, endpoint, new NullLogService(), NullTelemetryService));
		const client = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
		const credential = await client.credentials.getCredential(new AbortController().signal);
		let invalidated = 0;
		let selectionsChanged = 0;
		store.add(client.onDidInvalidate(() => { invalidated++; }));
		store.add(service.onDidChangeRepositoryClient(() => { selectionsChanged++; }));
		changed.fire({ resource: endpoint.getCopilotResource().resource, scopes: ['read:user'], token: undefined });
		const afterUnrelatedChange = { invalidated, selectionsChanged, aborted: credential.signal.aborted };
		token = undefined;
		changed.fire({ resource: endpoint.getRepoResource().resource, scopes: ['repo'], token });
		const replacement = store.add(service.acquireRepositoryClient(new AbortController().signal)).object;
		await assert.rejects(replacement.credentials.getCredential(new AbortController().signal), { kind: 'authentication' });
		assert.deepStrictEqual({
			afterUnrelatedChange, invalidated, selectionsChanged, aborted: credential.signal.aborted, replaced: replacement !== client,
		}, {
			afterUnrelatedChange: { invalidated: 0, selectionsChanged: 0, aborted: false },
			invalidated: 1, selectionsChanged: 1, aborted: true, replaced: true,
		});
	});
});
