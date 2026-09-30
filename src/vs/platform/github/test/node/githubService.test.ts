/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { GitHubCredentialService } from '../../common/githubCredentialService.js';
import { GitHubHostCapabilitiesService } from '../../common/githubHostCapabilitiesService.js';
import { GitHubQueryService } from '../../common/githubQueryServiceImpl.js';
import { GitHubService } from '../../common/githubService.js';
import { GitHubClientOptions, GitHubCredentialChange, GitHubServiceOptions } from '../../common/githubTypes.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { PullRequestMutationService } from '../../common/pullRequestMutationService.js';
import { PullRequestResourceService } from '../../common/pullRequestResourceService.js';
import { nodeFetch } from './nodeFetch.js';
import { gitHubJsonResponse, gitHubRestStep, ProgrammableGitHubServer } from './programmableGitHubServer.js';

function clientOptions(apiBaseUri = 'https://api.github.com', sessionId = 'session', scopes: readonly string[] = ['repo']): GitHubClientOptions {
	return { apiBaseUri, graphQlUri: `${apiBaseUri}/graphql`, authorization: { providerId: 'github', sessionId, scopes } };
}

function signal(): AbortSignal { return new AbortController().signal; }

class TestLogService extends NullLogService {
	readonly messages: string[] = [];
	override trace(message: string, ...args: unknown[]): void { this.messages.push([message, ...args].join(' ')); }
	override debug(message: string, ...args: unknown[]): void { this.messages.push([message, ...args].join(' ')); }
}

suite('GitHubService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options: Partial<GitHubServiceOptions> = {}, logService = new NullLogService(), telemetry: ITelemetryService = NullTelemetryService) {
		return disposables.add(new GitHubService({
			credentialProvider: { onDidChange: Event.None, getToken: () => 'token' },
			...options,
		}, logService, telemetry));
	}

	async function withServer(fn: (server: ProgrammableGitHubServer) => Promise<void>): Promise<void> {
		const server = await ProgrammableGitHubServer.start();
		try {
			await fn(server);
		} finally {
			await server.disposeAsync();
		}
	}

	test('owns authorization-scoped component graphs rather than a singleton account', () => {
		const service = setup();
		const first = disposables.add(service.acquireClient(clientOptions())).object;
		const second = disposables.add(service.acquireClient(clientOptions(undefined, 'other'))).object;
		assert.deepStrictEqual({
			transport: first.transport instanceof GitHubTransport,
			credentials: first.credentials instanceof GitHubCredentialService,
			capabilities: first.capabilities instanceof GitHubHostCapabilitiesService,
			query: first.query instanceof GitHubQueryService,
			pullRequests: first.pullRequests instanceof PullRequestResourceService,
			mutations: first.mutations instanceof PullRequestMutationService,
			endpoint: first.endpoint.getApiBaseUri(),
			separateClients: first !== second,
			separateTransports: first.transport !== second.transport,
			sharedQuotas: first.transport.rateLimits === second.transport.rateLimits,
		}, {
			transport: true, credentials: true, capabilities: true, query: true, pullRequests: true, mutations: true,
			endpoint: 'https://api.github.com', separateClients: true, separateTransports: true, sharedQuotas: true,
		});
	});

	test('shares only matching grants, scopes and endpoints and releases the final reference', async () => {
		const service = setup();
		const first = disposables.add(service.acquireClient(clientOptions(undefined, 'session', ['repo', 'user:email'])));
		const equivalent = disposables.add(service.acquireClient(clientOptions(undefined, 'session', ['user:email', 'repo'])));
		const narrow = disposables.add(service.acquireClient(clientOptions()));
		const enterprise = disposables.add(service.acquireClient(clientOptions('https://enterprise.example.test/api/v3', 'session', ['repo', 'user:email'])));
		const shared = first.object === equivalent.object;
		first.dispose();
		const retained = disposables.add(service.acquireClient(clientOptions(undefined, 'session', ['repo', 'user:email'])));
		const preserved = retained.object === equivalent.object;
		retained.dispose();
		equivalent.dispose();
		const recreated = disposables.add(service.acquireClient(clientOptions(undefined, 'session', ['repo', 'user:email'])));
		await assert.rejects(first.object.credentials.getCredential(signal()), /disposed/);
		assert.deepStrictEqual({ shared, preserved, isolatedScopes: narrow.object !== first.object, isolatedHost: enterprise.object !== first.object, recreated: recreated.object !== first.object }, {
			shared: true, preserved: true, isolatedScopes: true, isolatedHost: true, recreated: true,
		});
	});

	test('bounds simultaneously retained clients and reclaims capacity on release', () => {
		const service = setup();
		const clients = Array.from({ length: 64 }, (_, i) => disposables.add(service.acquireClient(clientOptions(undefined, String(i)))));
		assert.throws(() => service.acquireClient(clientOptions(undefined, 'overflow')), { kind: 'overloaded' });
		const shared = disposables.add(service.acquireClient(clientOptions(undefined, '0')));
		clients[1].dispose();
		const replacement = disposables.add(service.acquireClient(clientOptions(undefined, 'replacement')));
		assert.deepStrictEqual({ shared: shared.object === clients[0].object, session: replacement.object.authorization.sessionId }, { shared: true, session: 'replacement' });
	});

	test('resolves multiple accounts without invalidating another client', async () => {
		const changes = disposables.add(new Emitter<GitHubCredentialChange>());
		const tokens = new Map([['first', 'one'], ['second', 'two']]);
		const service = setup({
			credentialProvider: { onDidChange: changes.event, getToken: context => tokens.get(context.sessionId) },
			fetch: async (_url, init) => new Response(JSON.stringify({ id: new Headers(init?.headers).get('Authorization') === 'Bearer one' ? 101 : 202 })),
		});
		const first = disposables.add(service.acquireClient(clientOptions(undefined, 'first'))).object;
		const second = disposables.add(service.acquireClient(clientOptions(undefined, 'second'))).object;
		const credentials = await Promise.all([first.credentials.getCredential(signal()), second.credentials.getCredential(signal())]);
		let invalidations = 0;
		disposables.add(first.onDidInvalidate(() => { invalidations++; }));
		tokens.delete('first');
		changes.fire({ providerId: 'github', sessionIds: ['first'] });
		const secondAgain = await second.credentials.getCredential(signal());
		await assert.rejects(first.credentials.getCredential(signal()), /disposed/);
		assert.deepStrictEqual({
			accounts: credentials.map(credential => credential.account.accountId),
			aborted: credentials.map(credential => credential.signal.aborted),
			invalidations, sameSecond: secondAgain === credentials[1],
		}, { accounts: ['101', '202'], aborted: [true, false], invalidations: 1, sameSecond: true });
	});

	test('shares admission across clients while isolating pending work on release', async () => {
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<Response>();
		let calls = 0;
		const service = setup({
			fetch: async () => {
				calls++;
				await started.complete();
				const result = await response.p;
				return result.clone();
			}
		});
		const account = { host: 'api.github.com', accountId: '101' };
		const first = disposables.add(service.acquireClient(clientOptions(undefined, 'first')));
		const second = disposables.add(service.acquireClient(clientOptions(undefined, 'second')));
		const request = { method: 'GET' as const, url: 'https://api.github.com/resource' };
		const pending = first.object.transport.rest(account, 'token', request, signal());
		const rejected = assert.rejects(pending, /disposed/);
		await started.p;
		const peer = second.object.transport.rest(account, 'token', request, signal());
		await timeout(0);
		const beforeRelease = calls;
		first.dispose();
		await rejected;
		await response.complete(new Response('{}'));
		await peer;
		assert.deepStrictEqual({ beforeRelease, calls }, { beforeRelease: 1, calls: 2 });
	});

	test('retained-request limits cover all clients rather than each transport separately', async () => {
		const service = setup({ fetch: async () => new Promise<Response>(() => { }) });
		const first = disposables.add(service.acquireClient(clientOptions(undefined, 'first'))).object;
		const second = disposables.add(service.acquireClient(clientOptions(undefined, 'second'))).object;
		const pending = Array.from({ length: 70 }, (_, index) => {
			const client = index % 2 ? first : second;
			return client.transport.rest({ host: 'api.github.com', accountId: String(index % 2) }, 'token', {
				method: 'GET', url: `https://api.github.com/resource?page=${index}`,
			}, signal()).then(() => 'success', error => error.kind);
		});
		await timeout(0);
		service.dispose();
		assert.strictEqual((await Promise.all(pending)).filter(outcome => outcome === 'overloaded').length, 6);
	});

	test('releasing one lease does not cancel another lease of the same client', async () => {
		const started = new DeferredPromise<AbortSignal>();
		const response = new DeferredPromise<Response>();
		let calls = 0;
		const service = setup({
			fetch: async (_url, init) => {
				calls++;
				assert.ok(init?.signal);
				await started.complete(init.signal);
				return response.p;
			}
		});
		const first = disposables.add(service.acquireClient(clientOptions()));
		const peer = disposables.add(service.acquireClient(clientOptions()));
		const account = { host: 'api.github.com', accountId: '101' };
		const pending = peer.object.transport.rest(account, 'token', { method: 'GET', url: 'https://api.github.com/resource' }, signal());
		const active = await started.p;
		first.dispose();
		await response.complete(new Response('{}'));
		await pending;
		assert.deepStrictEqual({ calls, aborted: active.aborted, same: first.object === peer.object }, { calls: 1, aborted: false, same: true });
	});

	for (const change of ['release', 'revoke'] as const) {
		test(`bootstrap server cooldown survives client ${change}`, async () => {
			const changes = disposables.add(new Emitter<GitHubCredentialChange>());
			let calls = 0;
			const service = setup({
				credentialProvider: { onDidChange: changes.event, getToken: () => 'token' },
				fetch: async () => {
					calls++;
					return calls === 1 ? new Response(null, { status: 429, headers: { 'Retry-After': '120' } }) : new Response('{"id":101}');
				},
			});
			const first = disposables.add(service.acquireClient(clientOptions()));
			await assert.rejects(first.object.credentials.getCredential(signal()), { kind: 'rateLimit' });
			if (change === 'release') {
				first.dispose();
			} else {
				changes.fire({ providerId: 'github', sessionIds: ['session'] });
			}
			const replacement = disposables.add(service.acquireClient(clientOptions())).object;
			const controller = new AbortController();
			const reason = new Error('cancelled');
			const rejected = assert.rejects(replacement.credentials.getCredential(controller.signal), error => error === reason);
			await timeout(0);
			const duringCooldown = calls;
			controller.abort(reason);
			await rejected;
			const unrelated = disposables.add(service.acquireClient(clientOptions(undefined, 'unrelated'))).object;
			await unrelated.credentials.getCredential(signal());
			assert.deepStrictEqual({ duringCooldown, calls }, { duringCooldown: 1, calls: 2 });
		});
	}

	test('reacquiring a failed client cannot reset identity failure backoff', async () => {
		let calls = 0;
		const service = setup({ fetch: async () => { calls++; return new Response(null, { status: 401 }); } });
		for (let attempt = 0; attempt < 2; attempt++) {
			const reference = disposables.add(service.acquireClient(clientOptions()));
			await assert.rejects(reference.object.credentials.getCredential(signal()), { kind: 'authentication' });
			reference.dispose();
		}
		const reference = disposables.add(service.acquireClient(clientOptions()));
		const controller = new AbortController();
		const reason = new Error('cancelled');
		const rejected = assert.rejects(reference.object.credentials.getCredential(controller.signal), error => error === reason);
		await timeout(0);
		controller.abort(reason);
		await rejected;
		assert.strictEqual(calls, 2);
	});

	for (const isolation of ['session', 'scopes', 'issuer'] as const) {
		test(`does not reuse private ETags or coalesced reads across ${isolation} boundaries`, async () => {
			const seen: { token: string | null; etag: string | null }[] = [];
			const service = setup({
				fetch: async (_url, init) => {
					const headers = new Headers(init?.headers);
					seen.push({ token: headers.get('Authorization'), etag: headers.get('If-None-Match') });
					return new Response('{"value":"private"}', { headers: { ETag: '"private"' } });
				}
			});
			const account = { host: 'api.github.com', accountId: '101' };
			const options = clientOptions(undefined, 'first');
			const first = disposables.add(service.acquireClient(options)).object;
			const second = disposables.add(service.acquireClient({
				...options,
				authorization: {
					...options.authorization,
					...(isolation === 'session' ? { sessionId: 'second' }
						: isolation === 'scopes' ? { scopes: ['read:user'] }
							: { authorizationServer: 'https://enterprise.example.test/login/oauth' }),
				},
			})).object;
			const request = { method: 'GET' as const, url: 'https://api.github.com/resource' };
			await first.transport.rest(account, 'first-token', request, signal());
			await Promise.all([
				first.transport.rest(account, 'first-token', request, signal()),
				second.transport.rest(account, 'second-token', request, signal()),
			]);
			assert.deepStrictEqual(seen, [
				{ token: 'Bearer first-token', etag: null },
				{ token: 'Bearer first-token', etag: '"private"' },
				{ token: 'Bearer second-token', etag: null },
			]);
		});
	}

	test('retains shared cooldowns when one authorization client is revoked', async () => {
		const changes = disposables.add(new Emitter<GitHubCredentialChange>());
		const service = setup({ credentialProvider: { onDidChange: changes.event, getToken: () => 'token' } });
		const account = { host: 'api.github.com', accountId: '101' };
		const first = disposables.add(service.acquireClient(clientOptions(undefined, 'first'))).object;
		const second = disposables.add(service.acquireClient(clientOptions(undefined, 'second'))).object;
		first.transport.rateLimits.updateFromResponse(account, new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
		changes.fire({ providerId: 'github', sessionIds: ['first'] });
		const newFirst = disposables.add(service.acquireClient(clientOptions(undefined, 'first'))).object;
		assert.deepStrictEqual({
			retainedForPeer: second.transport.rateLimits.getDelay(account, 'core') > 0,
			retainedForRotation: newFirst.transport.rateLimits.getDelay(account, 'core') > 0,
			replaced: newFirst !== first,
		}, { retainedForPeer: true, retainedForRotation: true, replaced: true });
	});

	test('uses one injected telemetry collector without request identities', async () => {
		const events: { name: string; data: ITelemetryData | undefined }[] = [];
		const telemetry = new class extends mock<ITelemetryService>() {
			override readonly telemetryLevel = TelemetryLevel.USAGE;
			override publicLog2(name: string, data?: ITelemetryData): void { events.push({ name, data }); }
		}();
		const service = setup({
			fetch: async () => new Response('{"id":101,"private":"private-response"}'),
			telemetrySource: 'agentHost',
		}, new NullLogService(), telemetry);
		const client = disposables.add(service.acquireClient(clientOptions('https://private-host.example', 'private-session'))).object;
		await client.credentials.getCredential(signal());
		service.dispose();
		const summary = events.find(event => event.name === 'githubRequestSummary')?.data;
		assert.deepStrictEqual({ source: summary?.source, requests: summary?.requests, attempts: summary?.wireAttempts, containsPrivateData: JSON.stringify(events).includes('private') }, {
			source: 'agentHost', requests: 1, attempts: 1, containsPrivateData: false,
		});
	});

	test('preserves binding-supplied identification for each client bootstrap', async () => {
		const requests: Headers[] = [];
		const service = setup({
			clientMetadata: { application: 'vscode-insiders/1.141.0', source: 'vscode-insiders-workbench/1.141.0', egress: 'node' },
			fetch: async (_url, init) => { requests.push(new Headers(init?.headers)); return new Response('{"id":101}'); },
		});
		const client = disposables.add(service.acquireClient(clientOptions())).object;
		await client.credentials.getCredential(signal());
		assert.deepStrictEqual(requests.map(headers => ({
			application: headers.get('X-Client-Application'), source: headers.get('X-Client-Source'),
			feature: headers.get('X-Client-Feature'), retry: headers.get('X-Is-Retry'),
		})), [{ application: 'vscode-insiders/1.141.0', source: 'vscode-insiders-workbench/1.141.0', feature: 'github.credentials', retry: 'false' }]);
	});

	test('logs lifecycle without sensitive credentials or payloads', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101, private: 'response-secret' }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/pulls/7', response: gitHubJsonResponse(pullRequestResponse('private-title')) }),
			);
			const logService = new TestLogService();
			const service = setup({ fetch: nodeFetch, credentialProvider: { onDidChange: Event.None, getToken: () => 'token-secret' } }, logService);
			const client = disposables.add(service.acquireClient(clientOptions(server.apiBaseUrl))).object;
			const subscription = disposables.add(client.pullRequests.subscribePullRequest({
				host: new URL(server.apiBaseUrl).host, accountId: '101', owner: 'o', repo: 'r', number: 7,
			}, { priority: 'interactive' }));
			await subscription.refresh('core');
			assert.deepStrictEqual({
				initialized: logService.messages.some(message => message.includes('[GitHubService] Reusable GitHub service initialized')),
				credential: logService.messages.some(message => message.includes('[GitHubCredentialService] Resolved account identity')),
				resource: logService.messages.some(message => message.includes('[PullRequestResourceService] Refreshed core')),
				private: logService.messages.some(message => /token-secret|response-secret|private-title/.test(message)),
			}, { initialized: true, credential: true, resource: true, private: false });
			server.assertSatisfied();
		});
	});

	test('keeps subscriptions alive when the same authorization grant rotates its token', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/pulls/7', response: gitHubJsonResponse(pullRequestResponse('First')) }),
				gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }),
				gitHubRestStep({ method: 'GET', path: '/repos/o/r/pulls/7', response: gitHubJsonResponse(pullRequestResponse('Second')) }),
			);
			let token = 'one';
			const service = setup({ fetch: nodeFetch, credentialProvider: { onDidChange: Event.None, getToken: () => token } });
			const client = disposables.add(service.acquireClient(clientOptions(server.apiBaseUrl))).object;
			const subscription = disposables.add(client.pullRequests.subscribePullRequest({
				host: new URL(server.apiBaseUrl).host, accountId: '101', owner: 'o', repo: 'r', number: 7,
			}, { priority: 'interactive' }));
			await subscription.refresh('core');
			const resource = subscription.resource;
			token = 'two';
			await subscription.refresh('core');
			assert.deepStrictEqual({ same: subscription.resource === resource, title: resource.snapshot.get().core.value?.title, requests: server.requests.length }, {
				same: true, title: 'Second', requests: 4,
			});
			server.assertSatisfied();
		});
	});

	test('uses browser global fetch safely when no fetch is supplied', async () => {
		await withServer(async server => {
			server.enqueue(gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 101 }) }));
			const service = setup();
			const client = disposables.add(service.acquireClient(clientOptions(server.apiBaseUrl))).object;
			assert.deepStrictEqual((await client.credentials.getCredential(signal())).account, { host: new URL(server.apiBaseUrl).host, accountId: '101' });
			server.assertSatisfied();
		});
	});

	test('does not invalidate a valid token for a mismatched account resource', async () => {
		await withServer(async server => {
			server.enqueue(gitHubRestStep({ method: 'GET', path: '/user', response: gitHubJsonResponse({ id: 202 }) }));
			let invalidated = false;
			const service = setup({
				fetch: nodeFetch,
				credentialProvider: { onDidChange: Event.None, getToken: () => 'token', invalidateToken: () => { invalidated = true; } },
			});
			const client = disposables.add(service.acquireClient(clientOptions(server.apiBaseUrl))).object;
			const subscription = disposables.add(client.pullRequests.subscribePullRequest({
				host: new URL(server.apiBaseUrl).host, accountId: '101', owner: 'o', repo: 'r', number: 7,
			}, { priority: 'interactive' }));
			await assert.rejects(subscription.refresh('core'), /does not match the current GitHub credential/);
			assert.deepStrictEqual({ invalidated, requests: server.requests.length }, { invalidated: false, requests: 1 });
			server.assertSatisfied();
		});
	});
});

function pullRequestResponse(title: string): object {
	return {
		node_id: 'PR7', number: 7, title, body: '', html_url: 'https://example.test/o/r/pull/7',
		state: 'open', merged: false, draft: false, user: { id: 1, login: 'author' },
		head: { sha: 'head', ref: 'feature' },
		base: { sha: 'base', ref: 'main', repo: { node_id: 'R1', full_name: 'o/r' } },
	};
}
