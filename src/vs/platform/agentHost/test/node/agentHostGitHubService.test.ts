/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IAgentHostAuthenticationService, IAgentHostAuthTokenChangeEvent } from '../../node/agentHostAuthenticationService.js';
import { AgentHostGitHubService } from '../../node/agentHostGitHubService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';

suite('Agent Host GitHub clients', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves identity and conditional reads between repository consumers', async () => {
		const endpoint = createTestGitHubEndpointService();
		const changed = store.add(new Emitter<IAgentHostAuthTokenChangeEvent>());
		const authentication = new class extends mock<IAgentHostAuthenticationService>() {
			override readonly onDidChangeAuthToken = changed.event;
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
						: new Response('{"number":7}', { headers: { ETag: '"cached"' } });
			},
		}, authentication, endpoint, new NullLogService(), NullTelemetryService));
		for (let i = 0; i < 3; i++) {
			const reference = store.add(service.acquireRepositoryClient(new AbortController().signal));
			const credential = await reference.object.credentials.getCredential(new AbortController().signal);
			await reference.object.transport.rest(credential.account, credential.token, { method: 'GET', url: 'https://api.github.com/repos/owner/repo/pulls/7' }, credential.signal);
			reference.dispose();
		}
		assert.deepStrictEqual(requests, [
			{ path: '/user', etag: null },
			{ path: '/repos/owner/repo/pulls/7', etag: null },
			{ path: '/repos/owner/repo/pulls/7', etag: '"cached"' },
			{ path: '/repos/owner/repo/pulls/7', etag: '"cached"' },
		]);
	});

	test('token refresh preserves the repository client and does not announce a selection change', async () => {
		const endpoint = createTestGitHubEndpointService();
		const changed = store.add(new Emitter<IAgentHostAuthTokenChangeEvent>());
		let token = 'first-token';
		const authentication = new class extends mock<IAgentHostAuthenticationService>() {
			override readonly onDidChangeAuthToken = changed.event;
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
