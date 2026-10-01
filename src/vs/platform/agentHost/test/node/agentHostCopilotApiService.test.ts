/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubFetch } from '../../../github/common/githubTypes.js';
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

	function create(fetch: GitHubFetch) {
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

	test('rejected authentication never publishes its token or retains pending provenance', async () => {
		const { authentication, service } = create(async () => Response.json({ access_type_sku: 'copilot-test' }));
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [resource]; }
			override async authenticate(_resource: string, token: string) {
				await service.resolveCopilotSku(token);
				return false;
			}
		}();
		const result = await authentication.authenticate({ ...authRequest, token: 'rejected', ...metadata }, [provider]);
		assert.deepStrictEqual({
			result, token: authentication.getAuthToken(authRequest), provenance: authentication.getAuthAccountForToken(resource.resource, 'rejected'),
		}, { result: { authenticated: false }, token: undefined, provenance: undefined });
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

	test('renewed credentials retain the account model cooldown without rediscovering accepted work', () => runWithFakedTimers({}, async () => {
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
		await authentication.authenticate({ ...authRequest, token: 'old', ...metadata }, [provider]);
		await assert.rejects(service.models('old'), { status: 429 });
		await authentication.authenticate({ ...authRequest, token: 'renewed', ...metadata }, [provider]);
		const pending = assert.rejects(service.models('renewed', { deadline: Date.now() + 100 }), { status: 429, code: 'rate_limited' });
		await timeout(100);
		await pending;
		assert.deepStrictEqual(requests, [
			{ path: '/copilot_internal/user', token: 'Bearer old' },
			{ path: '/models', token: 'Bearer old' },
			{ path: '/copilot_internal/user', token: 'Bearer renewed' },
		]);
	}));
});
