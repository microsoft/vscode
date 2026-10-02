/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { RequestFetch } from '../../../github/common/types.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IAgent } from '../../common/agent.js';
import { authenticationAccountMeta } from '../../common/meta/agentAuthenticationAccount.js';
import { AgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostCopilotApiService } from '../../node/agentHostCopilotApiService.js';
import { AgentHostGitHubService } from '../../node/agentHostGitHubService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';

suite('Agent Host Copilot API binding', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const endpoint = createTestGitHubEndpointService();
	const resource = endpoint.getCopilotResource();
	const account = { providerId: 'github', accountId: '101' };
	const authRequest = { resource: resource.resource, scopes: resource.scopes_supported };
	const metadata = { _meta: authenticationAccountMeta(account) };

	function create(fetch: RequestFetch) {
		const log = new NullLogService();
		const authentication = store.add(new AgentHostAuthenticationService(log));
		const github = store.add(new AgentHostGitHubService({ fetch }, authentication, endpoint, log, NullTelemetryService));
		const service = store.add(new AgentHostCopilotApiService(fetch, log, { _serviceBrand: undefined, ...product }, endpoint, github, authentication));
		return { authentication, github, service };
	}

	test('provider authentication can discover before the accepted-token store is populated', async () => {
		const requests: string[] = [];
		const { authentication, service } = create(async input => {
			requests.push(new URL(String(input)).pathname);
			assert.strictEqual(authentication.getAuthToken(authRequest), undefined);
			return Response.json({ endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'copilot-test' });
		});
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate(_resource: string, token: string) {
				assert.deepStrictEqual(authentication.getAuthAccountForToken(resource.resource, token), account);
				assert.strictEqual(authentication.getAuthToken(authRequest), undefined);
				await service.resolveCopilotSku(token);
				assert.strictEqual(authentication.getAuthToken(authRequest), undefined);
				return true;
			}
		}();
		const result = await authentication.authenticate({ ...authRequest, token: 'pending', ...metadata }, [provider]);
		assert.deepStrictEqual({
			result, requests, token: authentication.getAuthToken(authRequest), sku: await service.resolveCopilotSku('pending'),
		}, {
			result: { authenticated: true }, requests: ['/copilot_internal/user'], token: 'pending', sku: 'copilot-test',
		});
	});

	for (const knownAccount of [false, true]) {
		for (const failure of ['rejected', 'threw'] as const) {
			test(`unsuccessful authentication discards discovery (${failure}, ${knownAccount ? 'account metadata' : 'legacy client'})`, async () => {
				let discoveries = 0;
				let readSku: () => string | undefined = () => undefined;
				const { authentication, service } = create(async () => Response.json({ access_type_sku: `sku-${++discoveries}` }));
				const provider = new class extends mock<IAgent>() {
					override getProtectedResources() { return [resource]; }
					override async authenticate(_resource: string, token: string) {
						readSku = service.captureCopilotSku(token);
						await service.resolveCopilotSku(token);
						if (failure === 'threw') {
							throw new Error('Provider rejected authentication after discovery');
						}
						return false;
					}
				}();
				const result = await authentication.authenticate({ ...authRequest, token: 'rejected', ...(knownAccount ? metadata : {}) }, [provider]);
				assert.deepStrictEqual({
					result, token: authentication.getAuthToken(authRequest), provenance: authentication.getAuthAccountForToken(resource.resource, 'rejected'),
					cached: service.getCachedCopilotSku('rejected'), captured: readSku(),
				}, { result: { authenticated: false }, token: undefined, provenance: undefined, cached: undefined, captured: undefined });
				assert.deepStrictEqual({ retried: await service.resolveCopilotSku('rejected'), oldReader: readSku(), discoveries }, {
					retried: 'sku-2', oldReader: undefined, discoveries: 2,
				});
			});
		}
	}

	for (const newerCompletesFirst of [false, true]) {
		test(`superseded authentication discards only its own discovery (newer finishes first: ${newerCompletesFirst})`, async () => {
			const started = new DeferredPromise<void>();
			const oldCompletion = new DeferredPromise<void>();
			const newCompletion = new DeferredPromise<void>();
			let oldSku: () => string | undefined = () => undefined;
			const { authentication, service } = create(async () => Response.json({ access_type_sku: 'copilot-test' }));
			const provider = new class extends mock<IAgent>() {
				override getProtectedResources() { return [resource]; }
				override async authenticate(_resource: string, token: string) {
					if (token === 'obsolete') {
						oldSku = service.captureCopilotSku(token);
						await service.resolveCopilotSku(token);
						void started.complete();
						await oldCompletion.p;
					} else {
						await service.resolveCopilotSku(token);
						await newCompletion.p;
					}
					return true;
				}
			}();
			const obsolete = authentication.authenticate({ ...authRequest, token: 'obsolete' }, [provider]);
			await started.p;
			const current = authentication.authenticate({ ...authRequest, token: 'current' }, [provider]);
			if (newerCompletesFirst) {
				await newCompletion.complete();
				await current;
			}
			await oldCompletion.complete();
			await obsolete;
			if (!newerCompletesFirst) {
				await newCompletion.complete();
				await current;
			}
			assert.deepStrictEqual({
				token: authentication.getAuthToken(authRequest), obsolete: service.getCachedCopilotSku('obsolete'),
				oldReader: oldSku(), current: service.getCachedCopilotSku('current'),
			}, { token: 'current', obsolete: undefined, oldReader: undefined, current: 'copilot-test' });
		});

		test(`a superseded same-token attempt preserves newer discovery (newer finishes first: ${newerCompletesFirst})`, async () => {
			const started = new DeferredPromise<void>();
			const firstCompletion = new DeferredPromise<void>();
			const secondCompletion = new DeferredPromise<void>();
			let discoveries = 0;
			let attempts = 0;
			const { authentication, service } = create(async () => { discoveries++; return Response.json({ access_type_sku: 'copilot-test' }); });
			const provider = new class extends mock<IAgent>() {
				override getProtectedResources() { return [resource]; }
				override async authenticate(_resource: string, token: string) {
					const first = ++attempts === 1;
					await service.resolveCopilotSku(token);
					if (first) {
						void started.complete();
						await firstCompletion.p;
						return false;
					}
					await secondCompletion.p;
					return true;
				}
			}();
			const first = authentication.authenticate({ ...authRequest, token: 'shared' }, [provider]);
			await started.p;
			const readSku = service.captureCopilotSku('shared');
			const second = authentication.authenticate({ ...authRequest, token: 'shared' }, [provider]);
			if (newerCompletesFirst) {
				await secondCompletion.complete();
				await second;
			}
			await firstCompletion.complete();
			await first;
			assert.strictEqual(readSku(), 'copilot-test');
			if (!newerCompletesFirst) {
				await secondCompletion.complete();
				await second;
			}
			assert.deepStrictEqual({ token: authentication.getAuthToken(authRequest), sku: readSku(), discoveries }, {
				token: 'shared', sku: 'copilot-test', discoveries: 1,
			});
		});
	}

	test('a failed attempt does not discard a credential still accepted for another scope set', async () => {
		const { authentication, service } = create(async () => Response.json({ access_type_sku: 'copilot-test' }));
		let accept = true;
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate(_resource: string, token: string) {
				await service.resolveCopilotSku(token);
				return accept;
			}
		}();
		const readSku = service.captureCopilotSku('shared');
		await authentication.authenticate({ resource: resource.resource, scopes: ['read:user'], token: 'shared' }, [provider]);
		accept = false;
		const result = await authentication.authenticate({ resource: resource.resource, scopes: ['repo'], token: 'shared' }, [provider]);
		assert.deepStrictEqual({ result, accepted: authentication.getAuthToken({ resource: resource.resource, scopes: ['read:user'] }), sku: readSku() }, {
			result: { authenticated: false }, accepted: 'shared', sku: 'copilot-test',
		});
	});

	test('revocation aborts active catalog reads and permanently invalidates captured SKU', async () => {
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<Response>();
		let active: AbortSignal | null | undefined;
		const { authentication, service } = create(async (input, init) => {
			if (String(input).endsWith('/copilot_internal/user')) {
				return Response.json({ access_type_sku: 'copilot-test' });
			}
			active = init?.signal;
			void started.complete();
			return response.p;
		});
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate() { return true; }
		}();
		await authentication.authenticate({ ...authRequest, token: 'accepted', ...metadata }, [provider]);
		const readSku = service.captureCopilotSku('accepted');
		await service.resolveCopilotSku('accepted');
		assert.strictEqual(readSku(), 'copilot-test');
		const pending = service.models('accepted');
		await started.p;
		await authentication.authenticate({ ...authRequest, token: '' }, [provider]);
		await assert.rejects(pending);
		await response.complete(Response.json({ data: [] }));
		assert.deepStrictEqual({ aborted: active?.aborted, sku: readSku() }, { aborted: true, sku: undefined });
	});

	test('rejected authentication cancels its active catalog request', async () => {
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<Response>();
		let active: AbortSignal | null | undefined;
		let rejected: Promise<void> | undefined;
		const { authentication, service } = create(async (input, init) => {
			if (String(input).endsWith('/copilot_internal/user')) {
				return Response.json({ access_type_sku: 'copilot-test' });
			}
			active = init?.signal;
			void started.complete();
			return response.p;
		});
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate(_resource: string, token: string) {
				rejected = assert.rejects(service.models(token));
				await started.p;
				return false;
			}
		}();
		const result = await authentication.authenticate({ ...authRequest, token: 'rejected' }, [provider]);
		await rejected;
		await response.complete(Response.json({ data: [] }));
		assert.deepStrictEqual({ result, aborted: active?.aborted, cached: service.getCachedCopilotSku('rejected') }, {
			result: { authenticated: false }, aborted: true, cached: undefined,
		});
	});

	test('provider and issuer selection do not split the same GitHub account quota', async () => {
		const requests: string[] = [];
		const { authentication, github, service } = create(async input => {
			const path = new URL(String(input)).pathname;
			requests.push(path);
			return path === '/user' ? Response.json({ id: 101 }) : Response.json({ access_type_sku: 'copilot-test' });
		});
		const repository = endpoint.getRepoResource();
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource, repository]; }
			override async authenticate() { return true; }
		}();
		await authentication.authenticate({ resource: repository.resource, scopes: repository.scopes_supported, token: 'repository', ...metadata }, [provider]);
		const client = store.add(github.acquireRepositoryClient(new AbortController().signal)).object;
		const credential = await client.credentials.getCredential(new AbortController().signal);
		await service.resolveCopilotSku('warmup');
		client.transport.rateLimits.updateFromResponse(credential.account, new Response(null, { status: 429, headers: { 'Retry-After': '60' } }));
		await authentication.authenticate({
			...authRequest, token: 'copilot',
			_meta: authenticationAccountMeta({ ...account, providerId: 'another-provider', authorizationServer: 'https://github.com/login/oauth' }),
		}, [provider]);
		await assert.rejects(service.models('copilot', { deadline: Date.now() + 100 }), { status: 429, code: 'rate_limited' });
		assert.deepStrictEqual(requests, ['/user', '/copilot_internal/user']);
	});

	test('renewed credentials retain the account model cooldown without rediscovering accepted work', async () => {
		const requests: { path: string; token: string | null }[] = [];
		const { authentication, service } = create(async (input, init) => {
			const path = new URL(String(input)).pathname;
			requests.push({ path, token: new Headers(init?.headers).get('Authorization') });
			return path === '/copilot_internal/user' ? Response.json({ access_type_sku: 'copilot-test' })
				: new Response(null, { status: 429, headers: { 'Retry-After': '60' } });
		});
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate(_resource: string, token: string) {
				if (token) {
					await service.resolveCopilotSku(token);
				}
				return true;
			}
		}();
		// Host device metadata uses real OS I/O, which must finish before virtual deadlines advance.
		assert.deepStrictEqual(await authentication.authenticate({ ...authRequest, token: 'old', ...metadata }, [provider]), { authenticated: true });
		await runWithFakedTimers({ startTime: Date.now() }, async () => {
			await assert.rejects(service.models('old'), { status: 429 });
			assert.deepStrictEqual(await authentication.authenticate({ ...authRequest, token: 'renewed', ...metadata }, [provider]), { authenticated: true });
			const pending = assert.rejects(service.models('renewed', { deadline: Date.now() + 100 }), { status: 429, code: 'rate_limited' });
			await timeout(100);
			await pending;
			assert.deepStrictEqual(requests, [
				{ path: '/copilot_internal/user', token: 'Bearer old' },
				{ path: '/models', token: 'Bearer old' },
				{ path: '/copilot_internal/user', token: 'Bearer renewed' },
			]);
		});
	});
});
