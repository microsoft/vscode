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
import { authenticationAccountMeta, readAuthenticationAccount } from '../../common/meta/agentAuthenticationAccount.js';
import { AgentHostAuthenticationService, IAgentHostAuthenticationService, IAgentHostAuthTokenChangeEvent } from '../../node/agentHostAuthenticationService.js';
import { AgentHostGitHubService } from '../../node/agentHostGitHubService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';

suite('Agent Host GitHub clients', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
			const service = store.add(new AgentHostGitHubService({ fetch: async () => new Response('{"id":101}') }, authentication, endpoint, new NullLogService(), NullTelemetryService));
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
			const service = store.add(new AgentHostGitHubService({
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
		const service = store.add(new AgentHostGitHubService({
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
		const service = store.add(new AgentHostGitHubService({ fetch: async () => new Response('{"id":101}') }, authentication, endpoint, new NullLogService(), NullTelemetryService));
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
		const service = store.add(new AgentHostGitHubService({
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
		const service = store.add(new AgentHostGitHubService({
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
			const service = store.add(new AgentHostGitHubService({
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
		const service = store.add(new AgentHostGitHubService({
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
		const service = store.add(new AgentHostGitHubService({ fetch: async () => new Response('{"id":101}') }, authentication, endpoint, new NullLogService(), NullTelemetryService));
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
		const service = store.add(new AgentHostGitHubService({ fetch: async () => new Response(JSON.stringify({ id: accountId })) }, authentication, endpoint, new NullLogService(), NullTelemetryService));
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
		const service = store.add(new AgentHostGitHubService({
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
		const service = store.add(new AgentHostGitHubService({ fetch: async () => new Response('{"id":101}') }, authentication, endpoint, new NullLogService(), NullTelemetryService));
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
