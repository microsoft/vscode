/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { GitHubAutomations } from '../../common/cloud/automation.js';
import { GitHubCloudApi, GitHubCloudMutationUncertainError } from '../../common/cloud/cloudApi.js';
import { GitHubCloudTasks } from '../../common/cloud/cloudTasks.js';
import { GitHubEnvironments } from '../../common/cloud/environments.js';
import { GitHubCredential, IGitHubCredentials } from '../../common/githubCredentialService.js';
import { GitHubRepositoryRef } from '../../common/githubQueryService.js';
import { GitHubService, IGitHubClient } from '../../common/githubService.js';
import { GitHubRestRequest, GitHubRestResponse, GitHubTransport } from '../../common/githubTransport.js';
import { GitHubAuthorizationContext, GitHubClientOptions, GitHubCredentialChange, GitHubRequestError, GitHubServiceOptions } from '../../common/githubTypes.js';
import { AccountHandle, RequestFetch } from '../../common/types.js';
import { FakeScheduler } from './fakeScheduler.js';

const cloud = { apiBaseUri: 'https://api.githubcopilot.com/agents', integrationId: 'vscode-chat' };
const options: GitHubClientOptions = {
	apiBaseUri: 'https://api.github.com',
	graphQlUri: 'https://api.github.com/graphql',
	authorization: { providerId: 'github', sessionId: 'selected-session', scopes: ['repo', 'read:user'], authorizationServer: 'https://github.com/login/oauth' },
	cloud,
};
const repository: GitHubRepositoryRef = { host: 'api.github.com', accountId: '101', owner: 'owner', repo: 'repo' };
const timestamp = '2026-10-01T12:00:00Z';

function signal(): AbortSignal {
	return new AbortController().signal;
}

function json(value: object, status = 200, headers?: HeadersInit): Response {
	return new Response(JSON.stringify(value), { status, headers });
}

function automation(id = 'auto-1') {
	return { id, name: 'Automation', prompt: 'Inspect the repository', repository: { owner: repository.owner, name: repository.repo }, created_at: timestamp, updated_at: timestamp };
}

function task(id = 'task-1') {
	return { id, state: 'idle', created_at: timestamp };
}

function connectionToken(clientId = 'client-1') {
	return {
		access_token: 'sensitive-connection-token',
		expires_at: '2026-10-02T12:00:00Z',
		wps_endpoint: 'https://relay.example.test',
		hub: 'hub',
		subprotocol: 'json.reliable.webpubsub.azure.v1',
		client_id: clientId,
		groups: { broadcast: 'broadcast', to_client: 'to-client', to_host: 'to-host' },
		encrypted_github_token: 'sensitive-sealed-envelope',
		host_encryption_key: { key_id: 'key', use: 'auth-token', algorithm: 'x25519-sealedbox', public_key: 'public-key' },
	};
}

interface RecordedRequest {
	readonly url: URL;
	readonly method: string;
	readonly headers: Headers;
	readonly body: unknown;
	readonly signal: AbortSignal;
	readonly cache: RequestCache | undefined;
	readonly credentials: RequestCredentials | undefined;
}

class TestLogService extends NullLogService {
	readonly messages: string[] = [];
	override trace(message: string): void { this.messages.push(message); }
	override debug(message: string): void { this.messages.push(message); }
	override warn(message: string): void { this.messages.push(message); }
	override error(message: string): void { this.messages.push(message); }
}

class TrackingTransport extends GitHubTransport {
	submitted = 0;
	maximumSubmitted = 0;

	override async rest<T>(account: AccountHandle, token: string, request: GitHubRestRequest, signal: AbortSignal): Promise<GitHubRestResponse<T>> {
		this.maximumSubmitted = Math.max(this.maximumSubmitted, ++this.submitted);
		try {
			return await super.rest<T>(account, token, request, signal);
		} finally {
			this.submitted--;
		}
	}
}

suite('GitHub cloud domains', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(handler: (request: RecordedRequest) => Response | Promise<Response>, clientOptions = options, overrides: Partial<GitHubServiceOptions> = {}) {
		const requests: RecordedRequest[] = [];
		const grants: GitHubAuthorizationContext[] = [];
		const log = new TestLogService();
		const service = store.add(new GitHubService({
			credentialProvider: { onDidChange: Event.None, getToken: context => { grants.push(context); return 'github-token'; } },
			fetch: async (input, init) => {
				assert.ok(init?.signal);
				const request: RecordedRequest = {
					url: new URL(String(input)), method: init.method ?? 'GET', headers: new Headers(init.headers),
					body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
					signal: init.signal, cache: init.cache, credentials: init.credentials,
				};
				requests.push(request);
				if (request.url.pathname.endsWith('/user')) {
					return json({ id: 101 });
				}
				return handler(request);
			},
			...overrides,
		}, log, NullTelemetryService));
		const reference = store.add(service.acquireClient(clientOptions));
		return { service, reference, client: reference.object, requests, grants, log, calls: () => requests.filter(request => !request.url.pathname.endsWith('/user')) };
	}

	function direct(fetch: RequestFetch, requestTimeout = 5 * 60_000) {
		const clock = store.add(new FakeScheduler());
		const transport = store.add(new TrackingTransport(fetch, clock, false, undefined, { requestTimeout }));
		const credential: GitHubCredential = { account: { host: 'api.github.com', accountId: '101' }, token: 'github-token', generation: 1, signal: signal() };
		const credentials: IGitHubCredentials = {
			onDidInvalidate: Event.None,
			getCredential: async signal => { signal.throwIfAborted(); return credential; },
			resolveCredential: async () => credential,
			handleRequestError: () => { },
		};
		const api = store.add(new GitHubCloudApi(cloud, {
			onDidChange: Event.None, getApiBaseUri: () => options.apiBaseUri, getGraphQlUri: () => options.graphQlUri,
		}, credentials, transport));
		const cloudTasks = new GitHubCloudTasks(api);
		return { clock, transport, cloudTasks, automations: new GitHubAutomations(api, cloudTasks), environments: new GitHubEnvironments(api) };
	}

	test('constructs inert capabilities and rejects unconfigured endpoints before credential lookup', async () => {
		const fixture = setup(() => assert.fail('No requests expected'), { ...options, cloud: undefined });
		await Promise.all([
			assert.rejects(fixture.client.automations.list(repository, signal()), { kind: 'validation' }),
			assert.rejects(fixture.client.cloudTasks.get('task', signal()), { kind: 'validation' }),
			assert.rejects(fixture.client.environments.connect({ environmentId: 'env' }, signal()), { kind: 'validation' }),
		]);
		assert.deepStrictEqual({
			automations: fixture.client.automations instanceof GitHubAutomations,
			tasks: fixture.client.cloudTasks instanceof GitHubCloudTasks,
			environments: fixture.client.environments instanceof GitHubEnvironments,
			requests: fixture.requests.length, grants: fixture.grants.length,
		}, { automations: true, tasks: true, environments: true, requests: 0, grants: 0 });
	});

	test('includes cloud endpoint and header policy in immutable authorization lease identity', async () => {
		const mutableCloud = { ...cloud };
		const fixture = setup(() => json(task()), { ...options, cloud: mutableCloud });
		const same = store.add(fixture.service.acquireClient({ ...options, cloud: { ...cloud, apiBaseUri: `${cloud.apiBaseUri}/` } }));
		const variants: GitHubClientOptions[] = [
			{ ...options, cloud: { ...cloud, apiBaseUri: 'https://enterprise.example.test/agents' } },
			{ ...options, cloud: { ...cloud, integrationId: 'another-client' } },
			{ ...options, cloud: { ...cloud, apiVersion: '2026-01-01' } },
			{ ...options, authorization: { ...options.authorization, sessionId: 'another-session' } },
			{ ...options, authorization: { ...options.authorization, scopes: ['repo'] } },
			{ ...options, authorization: { ...options.authorization, authorizationServer: 'https://another.example.test/oauth' } },
			{ ...options, authorization: { ...options.authorization, accountId: 'other-provenance' } },
		];
		const others = variants.map(options => store.add(fixture.service.acquireClient(options)).object);
		mutableCloud.apiBaseUri = 'https://changed.example.test/agents';
		await fixture.client.cloudTasks.get('task-1', signal());
		assert.deepStrictEqual({
			equivalent: same.object === fixture.client,
			isolated: others.every(client => client !== fixture.client),
			sharedQuota: others.every(client => client.transport.rateLimits === fixture.client.transport.rateLimits),
			endpoint: fixture.calls()[0].url.href,
			grant: fixture.grants[0],
		}, {
			equivalent: true, isolated: true, sharedQuota: true,
			endpoint: `${cloud.apiBaseUri}/tasks/task-1`,
			grant: { ...options.authorization, scopes: ['read:user', 'repo'] },
		});
	});

	for (const invalidCloud of [
		{ ...cloud, apiBaseUri: 'http://insecure.example.test/agents' },
		{ ...cloud, apiBaseUri: 'https://user:password@example.test/agents' },
		{ ...cloud, apiBaseUri: 'https://example.test/agents?token=secret' },
		{ ...cloud, apiBaseUri: 'https://example.test/agents#fragment' },
		{ ...cloud, integrationId: 'id\r\nInjected: value' },
		{ ...cloud, apiVersion: 'invalid-version' },
	]) {
		test(`rejects unsafe cloud configuration ${JSON.stringify(invalidCloud)}`, () => {
			const fixture = setup(() => assert.fail('No requests expected'));
			assert.throws(() => fixture.service.acquireClient({ ...options, cloud: invalidCloud }), { kind: 'validation' });
			assert.strictEqual(fixture.requests.length, 0);
		});
	}

	test('pins enterprise identity, agents endpoint and explicit headers without falling back to dotcom', async () => {
		const fixture = setup(() => json(task()), {
			...options,
			apiBaseUri: 'https://api.enterprise.example.test/api/v3',
			graphQlUri: 'https://api.enterprise.example.test/api/graphql',
			authorization: { providerId: 'github-enterprise', sessionId: 'enterprise-session', scopes: ['repo'], authorizationServer: 'https://enterprise.example.test/oauth' },
			cloud: { ...cloud, apiBaseUri: 'https://copilot.enterprise.example.test/agents', apiVersion: '2026-01-01' },
		});
		await fixture.client.cloudTasks.get('task-1', signal());
		const request = fixture.calls()[0];
		assert.deepStrictEqual({
			urls: fixture.requests.map(request => request.url.href),
			authorization: request.headers.get('authorization'),
			integration: request.headers.get('copilot-integration-id'),
			version: request.headers.get('x-github-api-version'),
			accept: request.headers.get('accept'),
			credentials: request.credentials,
		}, {
			urls: ['https://api.enterprise.example.test/api/v3/user', 'https://copilot.enterprise.example.test/agents/tasks/task-1'],
			authorization: 'Bearer github-token', integration: cloud.integrationId, version: '2026-01-01',
			accept: 'application/json', credentials: 'omit',
		});
	});

	test('does not inherit REST identification headers for a same-origin cloud endpoint', async () => {
		const fixture = setup(() => json(task()), { ...options, cloud: { ...cloud, apiBaseUri: 'https://api.github.com/cmc_internal/api/agents' } }, {
			clientMetadata: { application: 'vscode/1.0.0', source: 'vscode-workbench/1.0.0', egress: 'node' },
		});
		await fixture.client.cloudTasks.get('task-1', signal());
		assert.deepStrictEqual({
			identityHeader: fixture.requests[0].headers.get('x-client-application'),
			cloudHeader: fixture.calls()[0].headers.get('x-client-application'),
			retryHeader: fixture.calls()[0].headers.get('x-is-retry'),
			integration: fixture.calls()[0].headers.get('copilot-integration-id'),
			version: fixture.calls()[0].headers.get('x-github-api-version'),
		}, { identityHeader: 'vscode/1.0.0', cloudHeader: null, retryHeader: null, integration: cloud.integrationId, version: null });
	});

	suite('automations', () => {
		test('reads repository privacy without enforcing feature eligibility', async () => {
			const fixture = setup(() => json({ private: false }));
			const isPrivate = await fixture.client.automations.isPrivateRepository({ ...repository, host: 'API.GITHUB.COM' }, signal());
			const request = fixture.calls()[0];
			assert.deepStrictEqual({
				isPrivate, url: request.url.href, integration: request.headers.get('copilot-integration-id'),
				version: request.headers.get('x-github-api-version'),
			}, { isPrivate: false, url: 'https://api.github.com/repos/owner/repo', integration: null, version: '2022-11-28' });
		});

		for (const ref of [
			{ ...repository, host: 'api.other.example.test' },
			{ ...repository, accountId: '202' },
		]) {
			test(`rejects mismatched repository identity ${ref.host}/${ref.accountId} before reads or writes`, async () => {
				const fixture = setup(() => json(automation()));
				const operations = [
					() => fixture.client.automations.isPrivateRepository(ref, signal()),
					() => fixture.client.automations.list(ref, signal()),
					() => fixture.client.automations.get(ref, 'auto-1', signal()),
					() => fixture.client.automations.create(ref, { name: 'New', prompt: 'Work' }, signal()),
					() => fixture.client.automations.update(ref, 'auto-1', { disabled: true }, signal()),
					() => fixture.client.automations.delete(ref, 'auto-1', signal()),
					() => fixture.client.automations.dispatch(ref, 'auto-1', 'manual', signal()),
				];
				for (const operation of operations) {
					await assert.rejects(operation, { kind: 'authentication' });
				}
				const callsBeforeValidRequest = fixture.calls().length;
				const result = await fixture.client.automations.get(repository, 'auto-1', signal());
				assert.deepStrictEqual({
					callsBeforeValidRequest, result, calls: fixture.calls().length,
					identityLookups: fixture.requests.filter(request => request.url.pathname.endsWith('/user')).length,
				}, { callsBeforeValidRequest: 0, result: automation(), calls: 1, identityLookups: 1 });
			});
		}

		test('matches repository references to the enterprise GitHub host rather than the agents endpoint', async () => {
			const fixture = setup(() => json(automation()), {
				...options,
				apiBaseUri: 'https://api.enterprise.example.test/api/v3',
				graphQlUri: 'https://api.enterprise.example.test/api/graphql',
				cloud: { ...cloud, apiBaseUri: 'https://copilot.enterprise.example.test/agents' },
			});
			await assert.rejects(fixture.client.automations.get(repository, 'auto-1', signal()), { kind: 'authentication' });
			await assert.rejects(fixture.client.automations.get({ ...repository, host: 'copilot.enterprise.example.test' }, 'auto-1', signal()), { kind: 'authentication' });
			const result = await fixture.client.automations.get({ ...repository, host: 'API.ENTERPRISE.EXAMPLE.TEST', owner: 'OWNER', repo: 'REPO' }, 'auto-1', signal());
			assert.deepStrictEqual({ result, urls: fixture.requests.map(request => request.url.href) }, {
				result: automation(),
				urls: ['https://api.enterprise.example.test/api/v3/user', 'https://copilot.enterprise.example.test/agents/automations/auto-1'],
			});
		});

		test('paginates and hydrates missing definitions in list order without following server-provided hosts', async () => {
			const fixture = setup(request => {
				if (request.url.pathname.endsWith('/v2')) {
					return request.url.searchParams.get('page') === '1'
						? json({ automations: [automation('first'), { id: 'second' }] }, 200, { link: '<https://unapproved.example.test/elsewhere>; rel="next"' })
						: json({ automations: [{ ...automation('third'), disabled: true, disabled_state: { reason: 'user' } }] });
				}
				return json(automation('second'));
			});
			const result = await fixture.client.automations.list(repository, signal(), { perPage: 2, ownership: 'user' });
			assert.deepStrictEqual({
				ids: result.items.map(item => item.id), complete: result.complete, disabled: result.items[2].disabled,
				requests: fixture.calls().map(request => `${request.url.pathname}${request.url.search}`),
				origins: [...new Set(fixture.calls().map(request => request.url.origin))],
				grants: fixture.grants.length,
			}, {
				ids: ['first', 'second', 'third'], complete: true, disabled: true,
				requests: ['/agents/repos/owner/repo/automations/v2?ownership=user&page=1&per_page=2', '/agents/automations/second', '/agents/repos/owner/repo/automations/v2?ownership=user&page=2&per_page=2'],
				origins: ['https://api.githubcopilot.com'], grants: 1,
			});
		});

		test('submits no more than five detail requests at once for a full page', async () => {
			const ids = Array.from({ length: 100 }, (_, index) => `automation-${index}`);
			const fixture = direct(async input => {
				const url = new URL(String(input));
				return url.pathname.endsWith('/v2')
					? json({ automations: ids.map(id => ({ id })) })
					: json(automation(url.pathname.split('/').pop()));
			});
			const result = await fixture.automations.list(repository, signal());
			assert.deepStrictEqual({ ids: result.items.map(item => item.id), maximum: fixture.transport.maximumSubmitted, complete: result.complete }, {
				ids, maximum: 5, complete: true,
			});
		});

		test('cleans up started hydrations when a later summary fails synchronous validation', async () => {
			const response = new DeferredPromise<Response>();
			const fixture = direct(async input => new URL(String(input)).pathname.endsWith('/v2')
				? json({ automations: [{ id: 'first' }, { id: 'second' }, { ...automation(), prompt: 42 }] })
				: response.p);
			await assert.rejects(fixture.automations.list(repository, signal()), { kind: 'malformedResponse' });
			await response.complete(json(automation('first')));
			await timeout(0);
			assert.deepStrictEqual({ submitted: fixture.transport.submitted, timers: fixture.clock.pendingCount }, { submitted: 0, timers: 0 });
		});

		test('reports the page cap as incomplete rather than silently returning a complete catalogue', async () => {
			const fixture = setup(() => json({ automations: [automation()] }, 200, { link: '</next>; rel="next"' }));
			const result = await fixture.client.automations.list(repository, signal(), { maxPages: 1 });
			assert.deepStrictEqual(result, { items: [automation()], complete: false, nextPage: 2 });
		});

		test('uses the default ten-page bound exactly', async () => {
			const fixture = setup(request => json({ automations: [automation(`page-${request.url.searchParams.get('page')}`)] }, 200, { link: '</next>; rel="next"' }));
			const result = await fixture.client.automations.list(repository, signal());
			assert.deepStrictEqual({ count: result.items.length, complete: result.complete, nextPage: result.complete ? undefined : result.nextPage, calls: fixture.calls().length }, {
				count: 10, complete: false, nextPage: 11, calls: 10,
			});
		});

		test('does not hide a failed later page behind partial success', async () => {
			const fixture = setup(request => request.url.searchParams.get('page') === '1'
				? json({ automations: [automation()] }, 200, { link: '</next>; rel="next"' })
				: json({ error: 'not authorized' }, 403));
			await assert.rejects(fixture.client.automations.list(repository, signal()), { kind: 'authorization', statusCode: 403 });
			assert.strictEqual(fixture.calls().length, 2);
		});

		test('gets, creates, patches, dispatches and deletes with the exact routes and body semantics', async () => {
			const fixture = setup(request => {
				if (request.method === 'DELETE') {
					return new Response(null, { status: 204 });
				}
				if (request.url.pathname.endsWith('/tasks')) {
					return new Response('accepted', { status: 202 });
				}
				return json(automation(), request.method === 'POST' ? 201 : 200);
			});
			const create = { name: 'New', prompt: 'Work', description: '', disabled: false, require_actor_write_permission: true };
			const update = { disabled: true, triggers: { schedule: { types: ['interval'], interval: 60 } } };
			const results = [
				await fixture.client.automations.get(repository, 'auto-1', signal()),
				await fixture.client.automations.create(repository, create, signal()),
				await fixture.client.automations.update(repository, 'auto-1', update, signal()),
			];
			await fixture.client.automations.dispatch(repository, 'auto-1', 'manual', signal());
			await fixture.client.automations.dispatch(repository, 'auto-1', 'interval', signal());
			await fixture.client.automations.delete(repository, 'auto-1', signal());
			assert.deepStrictEqual({
				results,
				calls: fixture.calls().map(request => ({
					method: request.method, path: request.url.pathname, body: request.body,
					contentType: request.headers.get('content-type'), integration: request.headers.get('copilot-integration-id'), version: request.headers.get('x-github-api-version'),
				})),
			}, {
				results: [automation(), automation(), automation()],
				calls: [
					{ method: 'GET', path: '/agents/automations/auto-1', body: undefined, contentType: null, integration: cloud.integrationId, version: null },
					{ method: 'POST', path: '/agents/repos/owner/repo/automations', body: create, contentType: 'application/json', integration: cloud.integrationId, version: null },
					{ method: 'PATCH', path: '/agents/repos/owner/repo/automations/auto-1', body: update, contentType: 'application/merge-patch+json', integration: cloud.integrationId, version: null },
					{ method: 'POST', path: '/agents/repos/owner/repo/automations/auto-1/tasks', body: { event: 'manual' }, contentType: 'application/json', integration: cloud.integrationId, version: null },
					{ method: 'POST', path: '/agents/repos/owner/repo/automations/auto-1/tasks', body: { event: 'interval' }, contentType: 'application/json', integration: cloud.integrationId, version: null },
					{ method: 'DELETE', path: '/agents/repos/owner/repo/automations/auto-1', body: undefined, contentType: null, integration: cloud.integrationId, version: null },
				],
			});
		});

		for (const invalid of [
			{ ...automation(), id: 'wrong' },
			{ ...automation(), repository: { owner: 'wrong', name: 'repo' } },
			{ ...automation(), repository: { owner: 'owner', name: 'wrong' } },
			{ ...automation(), disabled: 'true' },
			{ ...automation(), created_at: 'yesterday' },
			{ ...automation(), tools: [42] },
			{ ...automation(), triggers: { schedule: { types: [42] } } },
			{ ...automation(), disabled_state: { reason: 42 } },
		]) {
			test(`rejects malformed or mismatched definitions ${JSON.stringify(invalid)}`, async () => {
				const fixture = setup(() => json(invalid));
				await assert.rejects(fixture.client.automations.get(repository, 'auto-1', signal()), { kind: 'malformedResponse' });
			});
		}

		test('only accepts HTTP 202 for dispatch, treating another success status as unconfirmed', async () => {
			const fixture = setup(() => json({}, 200));
			await assert.rejects(fixture.client.automations.dispatch(repository, 'auto-1', 'manual', signal()), GitHubCloudMutationUncertainError);
			assert.strictEqual(fixture.calls().length, 1);
		});
	});

	suite('cloud tasks', () => {
		test('lists task filters and reuses the task domain for automation history', async () => {
			const fixture = setup(() => json({ tasks: [task()] }));
			const listed = await fixture.client.cloudTasks.list(signal(), {
				state: 'idle', isArchived: false, since: timestamp, creatorId: 5, withRepository: false,
				includeEnvironmentKinds: ['managed-sandbox'], perPage: 20,
			});
			const history = await fixture.client.automations.listRuns('auto/1', signal());
			const directHistory = await fixture.client.cloudTasks.listForAutomation('auto/1', signal());
			assert.deepStrictEqual({
				listed, history, directHistory,
				requests: fixture.calls().map(request => ({ path: request.url.pathname, query: Object.fromEntries(request.url.searchParams) })),
			}, {
				listed: { items: [task()], complete: true }, history: { items: [task()], complete: true }, directHistory: { items: [task()], complete: true },
				requests: [
					{ path: '/agents/tasks', query: { state: 'idle', is_archived: 'false', since: timestamp, creator_id: '5', with_repo: 'false', include_environment_kinds: 'managed-sandbox', sort: 'updated_at', direction: 'desc', page: '1', per_page: '20' } },
					{ path: '/agents/automations/auto%2F1/tasks', query: { sort: 'created_at', direction: 'desc', is_archived: 'false', page: '1', per_page: '50' } },
					{ path: '/agents/automations/auto%2F1/tasks', query: { sort: 'created_at', direction: 'desc', is_archived: 'false', page: '1', per_page: '50' } },
				],
			});
		});

		test('returns task details and provisions a session without issuing a first turn', async () => {
			const detailed = {
				...task(), event_type: 'manual', name: 'Task', repository: { id: 2 }, compute: { provider: 'sandboxes' },
				agent_collaborators: [{ slug: 'copilot-developer-cli' }], current_environment: { kind: 'managed-sandbox' },
				sessions: [{ id: 'session-1', environment_id: 'env-1', state: 'idle', created_at: timestamp, ahp_resource_uri: 'ahp-session:/session-1' }],
			};
			const fixture = setup(request => json(detailed, request.method === 'POST' ? 201 : 200));
			const repositories = [{ owner: repository.owner, name: repository.repo }];
			const created = await fixture.client.cloudTasks.create({ prompt: 'First turn', environment_id: 'github-sandbox', repositories }, signal());
			const read = await fixture.client.cloudTasks.get('task-1', signal());
			assert.deepStrictEqual({ created, read, calls: fixture.calls().map(request => [request.method, request.url.pathname, request.body]) }, {
				created: detailed, read: detailed,
				calls: [['POST', '/agents/tasks', { prompt: 'First turn', environment_id: 'github-sandbox', repositories }], ['GET', '/agents/tasks/task-1', undefined]],
			});
		});

		test('steers, aborts and deletes without duplicate task operations in automations', async () => {
			const fixture = setup(() => new Response(null, { status: 204 }));
			await fixture.client.cloudTasks.steer('task /1', { type: 'user_message', content: 'Continue', model: 'model' }, signal());
			await fixture.client.cloudTasks.abort('task /1', signal());
			await fixture.client.cloudTasks.delete('task /1', signal());
			assert.deepStrictEqual(fixture.calls().map(request => [request.method, request.url.pathname, request.body]), [
				['POST', '/agents/tasks/task%20%2F1/steer', { type: 'user_message', content: 'Continue', model: 'model' }],
				['POST', '/agents/tasks/task%20%2F1/steer', { type: 'abort' }],
				['DELETE', '/agents/tasks/task%20%2F1', undefined],
			]);
		});

		test('rejects exact task and reported automation identity mismatches', async () => {
			const fixture = setup(() => json({ ...task(), automation_id: 'other-automation' }));
			await assert.rejects(fixture.client.cloudTasks.get('other-task', signal()), { kind: 'malformedResponse' });
			await assert.rejects(fixture.client.cloudTasks.get('task-1', signal(), 'expected-automation'), { kind: 'malformedResponse' });
		});

		test('reports incomplete task and run lists consistently', async () => {
			const fixture = setup(() => json({ tasks: [task()] }, 200, { link: '</next>; rel="next"' }));
			const results = await Promise.all([
				fixture.client.cloudTasks.list(signal(), { maxPages: 1 }),
				fixture.client.automations.listRuns('auto-1', signal(), { maxPages: 1 }),
			]);
			assert.deepStrictEqual(results, [
				{ items: [task()], complete: false, nextPage: 2 }, { items: [task()], complete: false, nextPage: 2 },
			]);
		});

		test('returns opaque task events and complete raw AHP history using distinct representations', async () => {
			const events = [{ future_event: { nested: ['uninterpreted'] } }, { jsonrpc: '2.0', method: 'action', params: { arbitrary: true } }];
			const fixture = setup(request => json({ events, total: request.headers.get('accept') === 'application/vnd.github.ahp+json' ? 2 : 3 }));
			const taskEvents = await fixture.client.cloudTasks.getEvents('task-1', signal(), { perPage: 2 });
			const ahpEvents = await fixture.client.cloudTasks.getEvents('task-1', signal(), { format: 'ahp' });
			assert.deepStrictEqual({
				taskEvents, ahpEvents,
				calls: fixture.calls().map(request => [request.url.pathname, request.url.search, request.headers.get('accept')]),
			}, {
				taskEvents: { events, total: 3, hasNextPage: true }, ahpEvents: { events, total: 2, hasNextPage: false },
				calls: [['/agents/tasks/task-1/events', '?page=1&per_page=2', 'application/json'], ['/agents/tasks/task-1/events', '', 'application/vnd.github.ahp+json']],
			});
		});

		for (const value of [{ events: [], total: 1 }, { events: [{}], total: 0 }, { events: [], total: -1 }, { events: [], total: '0' }, {}]) {
			test(`rejects malformed or incomplete AHP history ${JSON.stringify(value)}`, async () => {
				const fixture = setup(() => json(value));
				await assert.rejects(fixture.client.cloudTasks.getEvents('task-1', signal(), { format: 'ahp' }), { kind: 'malformedResponse' });
			});
		}

		test('fails explicitly on a missing tasks array and invalid session metadata', async () => {
			const fixture = setup(request => json(request.url.pathname.endsWith('/task-1') ? { ...task(), sessions: [{ id: 5 }] } : {}));
			await assert.rejects(fixture.client.cloudTasks.list(signal()), { kind: 'malformedResponse' });
			await assert.rejects(fixture.client.cloudTasks.get('task-1', signal()), { kind: 'malformedResponse' });
		});
	});

	suite('environments', () => {
		test('reads environment status and sends connect/reconnect identity without relay side effects', async () => {
			const environment = { id: 'env-1', status: 'online', capabilities: { ahp_version: '0.6.3' } };
			const fixture = setup(request => json(request.url.pathname.endsWith('/env-1') ? environment : connectionToken('client /1')));
			const detail = await fixture.client.environments.get('env-1', signal());
			const connected = await fixture.client.environments.connect({ environmentId: 'env-1', sessionId: 'session /1' }, signal());
			const reconnected = await fixture.client.environments.reconnect({ environmentId: 'env-1', sessionId: 'session /1' }, 'client /1', signal());
			assert.deepStrictEqual({
				detail, connected, reconnected,
				requests: fixture.calls().map(request => [request.method, request.url.pathname, Object.fromEntries(request.url.searchParams)]),
			}, {
				detail: environment, connected: { kind: 'token', token: connectionToken('client /1') }, reconnected: { kind: 'token', token: connectionToken('client /1') },
				requests: [
					['GET', '/agents/environments/env-1', {}],
					['GET', '/agents/environments/env-1/connect', { session_id: 'session /1' }],
					['GET', '/agents/environments/env-1/reconnect', { session_id: 'session /1', client_id: 'client /1' }],
				],
			});
		});

		test('never coalesces or conditionally caches credential-minting GETs', async () => {
			let count = 0;
			const fixture = setup(() => json(connectionToken(`client-${++count}`), 200, { etag: '"sensitive-validator"' }));
			const results = await Promise.all([
				fixture.client.environments.connect({ environmentId: 'env' }, signal()),
				fixture.client.environments.connect({ environmentId: 'env' }, signal()),
			]);
			results.push(await fixture.client.environments.connect({ environmentId: 'env' }, signal()));
			assert.deepStrictEqual({
				clients: results.map(result => result.kind === 'token' ? result.token.client_id : 'waking'),
				requests: fixture.calls().map(request => ({ etag: request.headers.get('if-none-match'), cache: request.cache })),
			}, { clients: ['client-1', 'client-2', 'client-3'], requests: [{ etag: null, cache: 'no-store' }, { etag: null, cache: 'no-store' }, { etag: null, cache: 'no-store' }] });
		});

		test('returns 202 waking and Retry-After without parking other environment requests', async () => {
			const fixture = setup(request => request.url.pathname.endsWith('/connect')
				? new Response('waking', { status: 202, headers: { 'retry-after': '120', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '9999999999' } })
				: json({ id: 'another', status: 'online' }));
			const waking = await fixture.client.environments.connect({ environmentId: 'env' }, signal());
			const next = await fixture.client.environments.get('another', signal());
			assert.deepStrictEqual({ waking, next, calls: fixture.calls().length }, {
				waking: { kind: 'waking', retryAfterSeconds: 120 }, next: { id: 'another', status: 'online' }, calls: 2,
			});
		});

		test('leaves an absent waking delay explicit rather than inventing polling policy', async () => {
			const fixture = setup(() => new Response(null, { status: 202 }));
			assert.deepStrictEqual(await fixture.client.environments.connect({ environmentId: 'env' }, signal()), { kind: 'waking', retryAfterSeconds: undefined });
		});

		test('parses an HTTP-date waking delay against the transport observation time', async () => {
			const fixture = direct(async () => new Response(null, { status: 202, headers: { 'retry-after': 'Thu, 01 Jan 1970 00:00:07 GMT' } }));
			assert.deepStrictEqual(await fixture.environments.connect({ environmentId: 'env' }, signal()), { kind: 'waking', retryAfterSeconds: 7 });
		});

		for (const [index, invalid] of [
			{ ...connectionToken(), access_token: '' },
			{ ...connectionToken(), expires_at: 'invalid' },
			{ ...connectionToken(), groups: { broadcast: 'only-one' } },
			{ ...connectionToken(), encrypted_github_token: 42 },
			{ ...connectionToken(), host_encryption_key: null },
		].entries()) {
			test(`rejects unconfirmed malformed credentials (case ${index + 1})`, async () => {
				const fixture = setup(() => json(invalid));
				await assert.rejects(fixture.client.environments.connect({ environmentId: 'env' }, signal()), GitHubCloudMutationUncertainError);
				assert.strictEqual(fixture.calls().length, 1);
			});
		}

		test('rejects reconnect credentials for another client and mismatched environment records', async () => {
			const fixture = setup(request => json(request.url.pathname.endsWith('/reconnect') ? connectionToken('wrong') : { id: 'wrong', status: 'online' }));
			await assert.rejects(fixture.client.environments.reconnect({ environmentId: 'env' }, 'expected', signal()), GitHubCloudMutationUncertainError);
			await assert.rejects(fixture.client.environments.get('env', signal()), { kind: 'malformedResponse' });
		});

		test('never places connection material or error bodies in errors or logs', async () => {
			const secret = 'credential-that-must-not-escape';
			const fixture = setup(() => json({ access_token: secret, encrypted_github_token: secret, message: secret }, 503));
			await assert.rejects(fixture.client.environments.connect({ environmentId: 'env' }, signal()), error => {
				assert.ok(error instanceof GitHubCloudMutationUncertainError);
				assert.deepStrictEqual({ status: error.statusCode, body: error.responseBody, secret: String(error).includes(secret) }, { status: 503, body: undefined, secret: false });
				return true;
			});
			assert.strictEqual(fixture.log.messages.some(message => message.includes(secret)), false);
		});
	});

	suite('admission, credentials and outcomes', () => {
		const writes: readonly { name: string; run: (client: IGitHubClient, signal: AbortSignal) => Promise<unknown> }[] = [
			{ name: 'automation create', run: (client, signal) => client.automations.create(repository, { name: 'New', prompt: 'Work' }, signal) },
			{ name: 'task create', run: (client, signal) => client.cloudTasks.create({ prompt: 'Work', environment_id: 'github-sandbox' }, signal) },
			{ name: 'environment connect', run: (client, signal) => client.environments.connect({ environmentId: 'env' }, signal) },
		];

		for (const write of writes) {
			for (const failure of ['network', 'server', 'malformed'] as const) {
				test(`${write.name} never replays an ambiguous ${failure} outcome`, async () => {
					const fixture = setup(() => {
						if (failure === 'network') {
							throw new Error('sensitive network detail');
						}
						return new Response(failure === 'malformed' ? 'not json' : 'server failure', { status: failure === 'server' ? 503 : 200 });
					});
					await assert.rejects(write.run(fixture.client, signal()), GitHubCloudMutationUncertainError);
					assert.strictEqual(fixture.calls().length, 1);
				});
			}

			test(`${write.name} preserves definite cancellation and missing-authentication failures`, async () => {
				const fixture = setup(() => assert.fail('No cloud requests expected'), options, { credentialProvider: { onDidChange: Event.None, getToken: () => undefined } });
				const controller = new AbortController();
				controller.abort();
				await assert.rejects(write.run(fixture.client, controller.signal), { name: 'AbortError' });
				await assert.rejects(write.run(fixture.client, signal()), { kind: 'authentication' });
				assert.strictEqual(fixture.requests.length, 0);
			});

			for (const status of [403, 404, 422, 429]) {
				test(`${write.name} preserves definite HTTP ${status} refusals`, async () => {
					const fixture = setup(() => json({ message: 'refused' }, status));
					await assert.rejects(write.run(fixture.client, signal()), error => {
						return error instanceof GitHubRequestError && !(error instanceof GitHubCloudMutationUncertainError) && error.statusCode === status;
					});
					assert.strictEqual(fixture.calls().length, 1);
				});
			}
		}

		test('rejects a mutation timeout before dispatch as definite', async () => {
			let calls = 0;
			const fixture = direct(async () => { calls++; return json(automation()); }, 20);
			const value = { name: 'New', prompt: 'Work', toJSON: () => { fixture.clock.advanceWallClockBy(60); return { name: 'New', prompt: 'Work' }; } };
			await assert.rejects(fixture.automations.create(repository, value, signal()), { kind: 'timeout', requestDispatched: false });
			assert.deepStrictEqual({ calls, timers: fixture.clock.pendingCount }, { calls: 0, timers: 0 });
		});

		test('treats credential timeout after dispatch as uncertain without replay', async () => {
			const started = new DeferredPromise<void>();
			const response = new DeferredPromise<Response>();
			let calls = 0;
			const fixture = direct(async () => { calls++; await started.complete(); return response.p; }, 20);
			const rejected = assert.rejects(fixture.environments.connect({ environmentId: 'env' }, signal()), GitHubCloudMutationUncertainError);
			await started.p;
			fixture.clock.advanceBy(21);
			await rejected;
			await response.complete(json(connectionToken()));
			assert.strictEqual(calls, 1);
		});

		test('treats post-dispatch task cancellation as uncertain but queued cancellation as definite', async () => {
			const started = new DeferredPromise<void>();
			const response = new DeferredPromise<Response>();
			const fixture = setup(async () => { await started.complete(); return response.p; });
			const active = new AbortController();
			const queued = new AbortController();
			const activeRejected = assert.rejects(fixture.client.cloudTasks.abort('active', active.signal), GitHubCloudMutationUncertainError);
			await started.p;
			const queuedRejected = assert.rejects(fixture.client.cloudTasks.abort('queued', queued.signal), { name: 'AbortError' });
			await timeout(0);
			queued.abort();
			active.abort();
			await Promise.all([activeRejected, queuedRejected]);
			await response.complete(new Response(null, { status: 204 }));
			assert.deepStrictEqual(fixture.calls().map(request => request.url.pathname), ['/agents/tasks/active/steer']);
		});

		test('coalesces ordinary reads with independent cancellation', async () => {
			const started = new DeferredPromise<void>();
			const response = new DeferredPromise<Response>();
			const fixture = setup(async () => { await started.complete(); return response.p; });
			const controller = new AbortController();
			const cancelled = assert.rejects(fixture.client.cloudTasks.get('task-1', controller.signal), { name: 'AbortError' });
			const retained = fixture.client.cloudTasks.get('task-1', signal());
			await started.p;
			await timeout(0);
			controller.abort();
			await cancelled;
			const stillRunning = !fixture.calls()[0].signal.aborted;
			await response.complete(json(task()));
			assert.deepStrictEqual({ result: await retained, stillRunning, requests: fixture.calls().length }, { result: task(), stillRunning: true, requests: 1 });
		});

		test('reuses conditional reads but clears cloud validators on credential renewal', async () => {
			let token = 'first-token';
			const fixture = setup(request => request.headers.has('if-none-match')
				? new Response(null, { status: 304 })
				: json(task(), 200, { etag: '"task-etag"' }), options, {
				credentialProvider: { onDidChange: Event.None, getToken: () => token },
			});
			const first = await fixture.client.cloudTasks.get('task-1', signal());
			const cached = await fixture.client.cloudTasks.get('task-1', signal());
			token = 'second-token';
			const renewed = await fixture.client.cloudTasks.get('task-1', signal());
			assert.deepStrictEqual({ first, cached, renewed, validators: fixture.calls().map(request => request.headers.get('if-none-match')) }, {
				first: task(), cached: task(), renewed: task(), validators: [null, '"task-etag"', null],
			});
		});

		test('keeps a multi-page operation on its captured credential rather than switching accounts', async () => {
			let token = 'first-token';
			const fixture = setup(request => {
				if (request.url.searchParams.get('page') === '1') {
					token = 'another-account-token';
					return json({ tasks: [task()] }, 200, { link: '</next>; rel="next"' });
				}
				return json({ tasks: [task('task-2')] });
			}, options, { credentialProvider: { onDidChange: Event.None, getToken: () => token } });
			const result = await fixture.client.cloudTasks.list(signal());
			assert.deepStrictEqual({ ids: result.items.map(item => item.id), tokens: fixture.calls().map(request => request.headers.get('authorization')) }, {
				ids: ['task-1', 'task-2'], tokens: ['Bearer first-token', 'Bearer first-token'],
			});
		});

		test('revokes only the selected grant and cancels its credential request', async () => {
			const changes = store.add(new Emitter<GitHubCredentialChange>());
			const started = new DeferredPromise<void>();
			const response = new DeferredPromise<Response>();
			const fixture = setup(async request => {
				if (request.url.pathname.endsWith('/connect')) {
					await started.complete();
					return response.p;
				}
				return json(task());
			}, options, { credentialProvider: { onDidChange: changes.event, getToken: () => 'github-token' } });
			const peer = store.add(fixture.service.acquireClient({ ...options, authorization: { ...options.authorization, sessionId: 'peer-session' } })).object;
			const cancelled = assert.rejects(fixture.client.environments.connect({ environmentId: 'env' }, signal()), GitHubCloudMutationUncertainError);
			await started.p;
			changes.fire({ providerId: 'github', sessionIds: ['selected-session'] });
			await cancelled;
			const peerTask = await peer.cloudTasks.get('task-1', signal());
			await response.complete(json(connectionToken()));
			assert.deepStrictEqual({ peerTask, aborted: fixture.calls()[0].signal.aborted }, { peerTask: task(), aborted: true });
		});

		test('releasing the last lease cancels only its work', async () => {
			const started = new DeferredPromise<void>();
			const response = new DeferredPromise<Response>();
			const fixture = setup(async request => {
				if (request.url.pathname.endsWith('/connect')) {
					await started.complete();
					return response.p;
				}
				return json(task());
			});
			const peer = store.add(fixture.service.acquireClient({ ...options, authorization: { ...options.authorization, sessionId: 'peer-session' } })).object;
			const cancelled = assert.rejects(fixture.client.environments.connect({ environmentId: 'env' }, signal()), GitHubCloudMutationUncertainError);
			await started.p;
			fixture.reference.dispose();
			await cancelled;
			const peerTask = await peer.cloudTasks.get('task-1', signal());
			await response.complete(json(connectionToken()));
			await assert.rejects(fixture.client.cloudTasks.get('task-1', signal()), /disposed/);
			assert.deepStrictEqual({ peerTask, aborted: fixture.calls()[0].signal.aborted }, { peerTask: task(), aborted: true });
		});

		for (const entry of [
			{ name: 'generic 403 denials', message: 'Rate Limit Exceeded', kind: 'authorization', delay: 0 },
			{ name: 'explicit secondary limits', message: 'You have exceeded a secondary rate limit.', kind: 'rateLimit', delay: 60_000 },
		]) {
			for (const method of ['GET', 'POST']) {
				test(`classifies ${entry.name} for cloud ${method} without crossing quota boundaries`, async () => {
					let calls = 0;
					const fixture = direct(async () => {
						calls++;
						return json({ message: entry.message }, 403, { 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '4600' });
					});
					const operation = method === 'GET'
						? fixture.cloudTasks.get('task-1', signal())
						: fixture.cloudTasks.create({ prompt: 'Work' }, signal());
					await assert.rejects(operation, { kind: entry.kind, statusCode: 403 });
					const cloudAccount = { host: 'api.githubcopilot.com', accountId: JSON.stringify(['api.github.com', '101']) };
					assert.deepStrictEqual({
						calls,
						cloud: fixture.transport.rateLimits.getDelay(cloudAccount, 'agents'),
						core: fixture.transport.rateLimits.getDelay(cloudAccount, 'core'),
						github: fixture.transport.rateLimits.getDelay(repository, 'core'),
						timers: fixture.clock.pendingCount,
					}, { calls: 1, cloud: entry.delay, core: 0, github: 0, timers: 0 });
				});
			}
		}

		test('shares cloud cooldowns across leases without assuming REST quota parity', async () => {
			const fixture = setup(() => json({ message: 'rate limit' }, 429, { 'retry-after': '120', 'x-ratelimit-resource': 'core' }));
			await assert.rejects(fixture.client.cloudTasks.get('task-1', signal()), { kind: 'rateLimit' });
			const cloudAccount = { host: 'api.githubcopilot.com', accountId: JSON.stringify(['api.github.com', '101']) };
			const delays = {
				cloud: fixture.client.transport.rateLimits.getDelay(cloudAccount, 'agents') > 0,
				core: fixture.client.transport.rateLimits.getDelay(cloudAccount, 'core'),
				github: fixture.client.transport.rateLimits.getDelay({ host: 'api.github.com', accountId: '101' }, 'core'),
			};
			fixture.reference.dispose();
			const reacquired = store.add(fixture.service.acquireClient(options)).object;
			assert.deepStrictEqual({ ...delays, retained: reacquired.transport.rateLimits.getDelay(cloudAccount, 'agents') > 0 }, { cloud: true, core: 0, github: 0, retained: true });
		});

		test('retries an ordinary read once without retrying writes', async () => {
			let count = 0;
			const fixture = setup(() => ++count === 1 ? json({}, 503) : json(task()));
			assert.deepStrictEqual(await fixture.client.cloudTasks.get('task-1', signal()), task());
			assert.strictEqual(fixture.calls().length, 2);
		});

		test('never follows cloud redirects or leaks a credential to another endpoint', async () => {
			const fixture = setup(() => new Response(null, { status: 307, headers: { location: 'https://unapproved.example.test/agents/tasks' } }));
			await assert.rejects(fixture.client.cloudTasks.get('task-1', signal()), { statusCode: 307 });
			await assert.rejects(fixture.client.cloudTasks.create({ prompt: 'Work' }, signal()), GitHubCloudMutationUncertainError);
			assert.deepStrictEqual(fixture.calls().map(request => request.url.origin), ['https://api.githubcopilot.com', 'https://api.githubcopilot.com']);
		});

		test('bounds pagination inputs before retaining any requests', () => {
			const fixture = setup(() => assert.fail('No requests expected'));
			for (const pagination of [{ page: 0 }, { page: Infinity }, { perPage: 101 }, { perPage: 0 }, { maxPages: 11 }, { maxPages: 0 }]) {
				assert.throws(() => fixture.client.automations.list(repository, signal(), pagination), { kind: 'validation' });
				assert.throws(() => fixture.client.cloudTasks.list(signal(), pagination), { kind: 'validation' });
			}
			assert.deepStrictEqual({ requests: fixture.requests.length, grants: fixture.grants.length }, { requests: 0, grants: 0 });
		});
	});
});
