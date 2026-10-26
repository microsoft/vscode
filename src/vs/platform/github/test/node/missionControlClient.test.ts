/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IGitHubAccountClient } from '../../common/account/account.js';
import { AccountClient } from '../../common/account/accountClient.js';
import { ApiRequest, ApiResponse, IApiRequestProvider } from '../../common/client/request.js';
import { PaginationLimitError } from '../../common/client/pagination.js';
import { parse, SchemaError } from '../../common/client/schema.js';
import { GitHubService } from '../../common/githubService.js';
import { GitHubRestRequest, GitHubTransport } from '../../common/githubTransport.js';
import { GitHubClientOptions, IGitHubCredentialProvider } from '../../common/githubTypes.js';
import { AutomationDetail, AutomationRepositoryConfiguration, AutomationToolGroup, AutomationTriggerDefinition } from '../../common/missionControl/automations.js';
import { ClientTokenResponse } from '../../common/missionControl/environments.js';
import { ApiRequestError, MissionControlClient } from '../../common/missionControl/missionControlClient.js';
import { Task } from '../../common/missionControl/tasks.js';

const signal = () => new AbortController().signal;
const repository = { owner: 'owner', repo: 'repo' };
const apiBaseUri = 'https://api.githubcopilot.com';
const collection = '/agents/repos/owner/repo/automations';
const date = '2026-01-01T00:00:00Z';
const serverDate = 'Thu, 01 Jan 2026 00:00:00 GMT';
const emptyPage = { automations: [], total_count: 0 };
const automationConfiguration: AutomationRepositoryConfiguration = {
	automations_enabled: true,
	can_manage_automations: false,
	allow_read_access_triggers: false,
	require_trigger_scoped_writes: true,
};
const automation: AutomationDetail = {
	id: 'automation-1', name: 'Triage', description: 'Triage issues', prompt: 'Triage the issue',
	created_at: date, updated_at: date, created_by: { id: 101 },
};
const toolGroups: readonly AutomationToolGroup[] = [{
	id: 'issues', name: 'Issues', tools: [
		{ id: 'github/issue_read', name: 'Read issue', description: 'Read an issue.', scope: 'read' },
		{ id: 'github/update_issue', name: 'Update issue', description: 'Update an issue.', scope: 'write' },
		{ id: 'report_progress', name: 'Report progress', description: 'Report progress.' },
	],
}];
const triggerDefinitions: readonly AutomationTriggerDefinition[] = [
	{
		name: 'interval', title: 'Schedule', description: 'Runs on a schedule.',
		fields: [{ name: 'types', required: true, options: ['hourly', 'daily', 'weekly'] }],
	},
	{
		name: 'issues', title: 'Issue opened', description: 'Runs when an issue is opened.',
		field_labels: { query: 'Issue query' },
		fields: [
			{ name: 'types', required: true, options: ['opened'] },
			{ name: 'query', required: false, description: 'Filter using [issue search syntax](https://docs.github.com).' },
		],
	},
	{
		name: 'automation_completed', title: 'Automation completed', description: 'Runs after an automation completes.',
		fields: [{ name: 'automation_ids', required: true }], supports_run_now: false,
	},
];
const task: Task = {
	id: 'task-1', automation_id: automation.id, state: 'queued', created_at: date, remote_steerable: true,
};
const connection: ClientTokenResponse = {
	access_token: 'connection-secret', expires_at: date, wps_endpoint: 'https://relay.example.test',
	hub: 'hub', subprotocol: 'json.webpubsub.azure.v1', client_id: 'client-1', environment_status: 'online',
	groups: { broadcast: 'broadcast', to_client: 'to-client', to_host: 'to-host', clients: 'clients' },
};

function clientOptions(): GitHubClientOptions {
	return {
		authorization: { providerId: 'github', sessionId: 'selected', scopes: ['repo'] },
		apiBaseUri: 'https://api.github.com',
		graphQlUri: 'https://api.github.com/graphql',
		missionControl: {
			endpoint: { apiBaseUri: `${apiBaseUri}/agents`, integrationId: 'test-integration' },
		},
	};
}

interface TestRequest {
	readonly url: URL;
	readonly init: RequestInit;
	readonly at: number;
}

suite('Mission Control client', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(
		respond: (request: TestRequest) => Response | Promise<Response>,
		options = clientOptions(),
		credentialProvider: IGitHubCredentialProvider = { onDidChange: Event.None, getToken: context => `token-${context.sessionId}` },
	) {
		const requests: TestRequest[] = [];
		const identities: TestRequest[] = [];
		const service = store.add(new GitHubService({
			fetch: async (input, init = {}) => {
				const request = { url: new URL(String(input)), init, at: Date.now() };
				if (request.url.pathname.endsWith('/user')) {
					identities.push(request);
					return Response.json({ id: new Headers(init.headers).get('Authorization') === 'Bearer token-second' ? 202 : 101 });
				}
				requests.push(request);
				return respond(request);
			},
		}, new NullLogService(), NullTelemetryService));
		const scope = store.add(service.createRequestProviderScope(credentialProvider));
		const acquire = (clientOptions: GitHubClientOptions = options) => {
			const reference = scope.acquireClient(clientOptions);
			const client = store.add(new AccountClient(reference.object.authorization, reference.object, reference));
			return { client, providers: reference.object };
		};
		return { service, acquire, ...acquire(), requests, identities };
	}

	test('uses shared request policies, response modes, and nested metadata', async () => {
		const requests: ApiRequest[] = [];
		const body = '{"tasks":[]}';
		const metadata = { nextLink: `${apiBaseUri}/agents/tasks?page=2`, serverDate, retryAfterSeconds: 5 };
		const provider: IApiRequestProvider = {
			request: async <T>(request: ApiRequest, _signal: AbortSignal, parser?: parse.Parser<T>): Promise<ApiResponse<T | void>> => {
				requests.push(request);
				return { data: parser?.(body), status: request.responseBody === 'none' ? 204 : 200, metadata };
			},
		};
		const client = new MissionControlClient(provider);
		for (const responseBody of [undefined, 'json', 'text', 'none'] as const) {
			const request: ApiRequest = {
				method: 'GET', path: '/tasks', expectedStatus: responseBody === 'none' ? 204 : 200,
				responseBody, policy: { retry: false }, options: { caller: 'test.shared-contract' },
			};
			const response = await client.request(request, signal(), response => response);
			assert.deepStrictEqual({ response, request: requests.at(-1) }, {
				response: {
					data: responseBody === 'none' ? undefined : responseBody === 'text' ? body : { tasks: [] },
					status: request.expectedStatus,
					metadata,
				},
				request: {
					...request, authentication: 'required', accept: 'application/json',
					responseBody: responseBody === 'none' ? 'none' : 'text',
				},
			});
		}
	});

	test('acquired clients execute every automation operation with selected credentials and exact routes', async () => {
		const { prompt, ...summary } = automation;
		const nextLink = `${apiBaseUri}${collection}/v2?page=2`;
		const acknowledgement = { automation_id: automation.id, event: 'manual' };
		const responses = [
			Response.json({ automations: [summary], total_count: 1 }, { headers: { link: `<${nextLink}>; rel="next"`, date: serverDate } }),
			Response.json(automation),
			Response.json(automation, { status: 201 }),
			Response.json(automation),
			Response.json(acknowledgement, { status: 202 }),
			Response.json({ tasks: [task] }),
			new Response(null, { status: 204 }),
			Response.json(toolGroups),
			Response.json(triggerDefinitions),
		];
		const { client, requests, identities } = setup(() => {
			const response = responses.shift();
			assert.ok(response);
			return response;
		});
		const create = { name: automation.name, description: automation.description, prompt };
		const update = { tools: [], triggers: {}, model: '' };
		const results = [
			await client.automations.list(repository, signal(), { query: { page: 1, per_page: 10, disabled: false } }),
			await client.automations.get(repository, automation.id, signal()),
			await client.automations.create(repository, create, signal()),
			await client.automations.update(repository, automation.id, update, signal()),
			await client.automations.dispatch(repository, automation.id, { event: 'manual' }, signal()),
			await client.automations.listRuns(automation.id, signal()),
			await client.automations.delete(repository, automation.id, signal()),
			await client.automations.listTools(signal()),
			await client.automations.listTriggers(signal()),
		];
		assert.deepStrictEqual({
			results,
			requests: requests.map(({ url, init }) => [init.method, url.pathname + url.search, init.body]),
			contentTypes: requests.map(({ init }) => new Headers(init.headers).get('Content-Type')),
			authentication: [...identities, ...requests].map(({ init }) => new Headers(init.headers).get('Authorization')),
			headers: requests.map(({ init }) => {
				const headers = new Headers(init.headers);
				return [headers.get('Copilot-Integration-Id'), headers.get('X-GitHub-Api-Version'), init.credentials, init.redirect, init.cache, init.referrerPolicy];
			}),
			identityUrl: identities.map(request => request.url.href),
		}, {
			results: [
				{ data: { automations: [summary], total_count: 1 }, nextLink, serverDate },
				automation, automation, automation, acknowledgement,
				{ data: { tasks: [task] }, nextLink: undefined, serverDate: undefined }, undefined,
				toolGroups, triggerDefinitions,
			],
			requests: [
				['GET', `${collection}/v2?page=1&per_page=10&disabled=false`, undefined],
				['GET', `${collection}/${automation.id}`, undefined],
				['POST', collection, JSON.stringify(create)],
				['PATCH', `${collection}/${automation.id}`, JSON.stringify(update)],
				['POST', `${collection}/${automation.id}/tasks`, '{"event":"manual"}'],
				['GET', `/agents/automations/${automation.id}/tasks`, undefined],
				['DELETE', `${collection}/${automation.id}`, undefined],
				['GET', '/agents/automations/tools', undefined],
				['GET', '/agents/automations/triggers', undefined],
			],
			contentTypes: [null, null, 'application/json', 'application/json', 'application/json', null, null, null, null],
			authentication: Array(10).fill('Bearer token-selected'),
			headers: Array(9).fill(['test-integration', null, 'omit', 'manual', 'no-store', 'no-referrer']),
			identityUrl: ['https://api.github.com/user'],
		});
	});

	test('forwards caller and deadline independently of Mission Control query parameters', async () => {
		const { client, providers } = setup(() => Response.json(emptyPage));
		const options = { caller: 'test.automations', deadline: Date.now() + 10_000 };
		const sandbox = sinon.createSandbox();
		try {
			assert.ok(providers.missionControl);
			const request = sandbox.spy(providers.missionControl, 'request');
			await client.automations.list(repository, signal(), { ...options, query: { page: 2, disabled: false } });
			const { path, options: requestOptions } = request.firstCall.args[0];
			assert.deepStrictEqual({ path, options: requestOptions }, {
				path: '/repos/owner/repo/automations/v2?page=2&disabled=false', options,
			});
		} finally {
			sandbox.restore();
		}
	});

	test('configuration reads honor server no-store and preserve caller options and false values', async () => {
		const disabled: AutomationRepositoryConfiguration = {
			automations_enabled: false, can_manage_automations: false,
			allow_read_access_triggers: true, require_trigger_scoped_writes: false,
		};
		const responses = [automationConfiguration, disabled];
		const { client, providers, requests } = setup(() => Response.json(responses.shift(), { headers: { etag: '"configuration"', 'cache-control': 'private, no-store' } }));
		const options = { caller: 'test.automationConfiguration', deadline: Date.now() + 10_000, priority: 'visible' as const, noCache: false };
		const sandbox = sinon.createSandbox();
		try {
			assert.ok(providers.missionControl);
			const request = sandbox.spy(providers.missionControl, 'request');
			const values = [
				await client.automations.getConfiguration(repository, signal(), options),
				await client.automations.getConfiguration(repository, signal(), options),
			];
			assert.deepStrictEqual({
				values,
				requests: requests.map(({ url, init }) => {
					const headers = new Headers(init.headers);
					return [init.method, url.href, headers.get('If-None-Match'), headers.has('Authorization'), headers.get('Copilot-Integration-Id')];
				}),
				metadata: request.getCalls().map(call => ({ domain: call.args[0].domain, options: call.args[0].options })),
				callerNoCache: options.noCache,
			}, {
				values: [automationConfiguration, disabled],
				requests: Array(2).fill(['GET', `${apiBaseUri}${collection}/configuration`, null, true, 'test-integration']),
				metadata: Array(2).fill({ domain: 'automations', options }),
				callerNoCache: false,
			});
		} finally {
			sandbox.restore();
		}
	});

	test('configuration reads encode repository identifiers and validate them before credential lookup', async () => {
		const { client, requests, identities } = setup(() => Response.json(automationConfiguration));
		const configuration = await client.automations.getConfiguration({ owner: 'owner name', repo: 'repo/#?' }, signal());
		assert.deepStrictEqual({ configuration, paths: requests.map(request => request.url.pathname) }, {
			configuration: automationConfiguration,
			paths: ['/agents/repos/owner%20name/repo%2F%23%3F/automations/configuration'],
		});
		const before = { identities: identities.length, requests: requests.length };
		for (const repository of [{ owner: '', repo: 'repo' }, { owner: 'owner', repo: '..' }]) {
			await assert.rejects(async () => client.automations.getConfiguration(repository, signal()), { kind: 'validation' });
		}
		assert.deepStrictEqual({ identities: identities.length, requests: requests.length }, before);
	});

	test('configuration reads reject cancellation before credential lookup', async () => {
		const { client, requests, identities } = setup(() => Response.json(automationConfiguration));
		const reason = new Error('cancelled configuration read');
		await assert.rejects(client.automations.getConfiguration(repository, AbortSignal.abort(reason)), error => error === reason);
		assert.deepStrictEqual({ identities: identities.length, requests: requests.length }, { identities: 0, requests: 0 });
	});

	test('configuration responses require all four boolean fields', async () => {
		for (const key of Object.keys(automationConfiguration)) {
			for (const invalid of [undefined, null, 'false', 0]) {
				const { client } = setup(() => Response.json({ ...automationConfiguration, [key]: invalid }));
				await assert.rejects(client.automations.getConfiguration(repository, signal()), SchemaError);
			}
		}
	});

	for (const status of [401, 404, 503]) {
		test(`configuration HTTP ${status} is an error rather than disabled defaults`, async () => {
			const { client } = setup(() => Response.json({
				message: 'Configuration unavailable', documentation_url: 'https://docs.github.com',
			}, { status, headers: { 'Retry-After': '30' } }));
			await assert.rejects(client.automations.getConfiguration(repository, signal()), error =>
				error instanceof ApiRequestError && error.statusCode === status && error.outcome === undefined);
		});
	}

	test('collects automation, task, run, and event pages with final metadata and unsummed totals', async () => {
		const { prompt, ...summary } = automation;
		const event = { id: 'event', timestamp: date, parentId: null, type: 'message', data: { text: 'Hello' } };
		const { client, requests } = setup(({ url }) => {
			const second = url.searchParams.get('page') === '2';
			const number = second ? 2 : 1;
			const next = new URL(url);
			next.searchParams.set('page', '2');
			const data = url.pathname.endsWith('/v2')
				? { automations: [{ ...summary, id: `automation-${number}` }], total_count: 2 }
				: url.pathname.endsWith('/events')
					? { events: [{ ...event, id: `event-${number}` }], total: 2 }
					: { tasks: [{ ...task, id: `task-${number}` }], total_active_count: 2 };
			return Response.json(data, { headers: { date: serverDate, ...(second ? {} : { link: `<${next.href}>; rel="next"` }) } });
		});
		const results = [
			await client.automations.list(repository, signal(), { maxPages: 2 }),
			await client.tasks.list(signal(), { maxPages: 2 }),
			await client.automations.listRuns(automation.id, signal(), { maxPages: 2 }),
			await client.tasks.getEvents(task.id, signal(), { maxPages: 2 }),
		];
		assert.deepStrictEqual({ results, requests: requests.map(request => request.url.pathname + request.url.search) }, {
			results: [
				{ automations: [1, 2].map(number => ({ ...summary, id: `automation-${number}` })), total_count: 2 },
				{ tasks: [1, 2].map(number => ({ ...task, id: `task-${number}` })), total_active_count: 2 },
				{ tasks: [1, 2].map(number => ({ ...task, id: `task-${number}` })), total_active_count: 2 },
				{ events: [1, 2].map(number => ({ ...event, id: `event-${number}` })), total: 2 },
			].map(data => ({ data, nextLink: undefined, serverDate })),
			requests: [
				`${collection}/v2`, `${collection}/v2?page=2`,
				'/agents/tasks', '/agents/tasks?page=2',
				`/agents/automations/${automation.id}/tasks`, `/agents/automations/${automation.id}/tasks?page=2`,
				`/agents/tasks/${task.id}/events`, `/agents/tasks/${task.id}/events?page=2`,
			],
		});
	});

	test('partial Mission Control pages keep a continuation but later errors still reject', async () => {
		let failSecondPage = false;
		const { client } = setup(({ url }) => {
			const page = Number(url.searchParams.get('page') ?? 1);
			if (page === 2 && failSecondPage) {
				return Response.json({ message: 'Denied' }, { status: 403 });
			}
			return Response.json({ tasks: [{ ...task, id: `task-${page}` }], total_active_count: 3 }, {
				headers: { link: `<${apiBaseUri}/agents/tasks?page=${page + 1}>; rel="next"`, date: serverDate },
			});
		});
		await assert.rejects(client.tasks.list(signal(), { maxPages: 1 }), PaginationLimitError);
		assert.deepStrictEqual(await client.tasks.list(signal(), { maxPages: 1, pageLimitBehavior: 'returnPartial' }), {
			data: { tasks: [task], total_active_count: 3 },
			nextLink: `${apiBaseUri}/agents/tasks?page=2`, serverDate,
		});
		const result = await client.tasks.list(signal(), { maxPages: 2, pageLimitBehavior: 'returnPartial' });
		assert.deepStrictEqual(result, {
			data: { tasks: [1, 2].map(number => ({ ...task, id: `task-${number}` })), total_active_count: 3 },
			nextLink: `${apiBaseUri}/agents/tasks?page=3`, serverDate,
		});
		failSecondPage = true;
		await assert.rejects(client.tasks.list(signal(), { maxPages: 3, pageLimitBehavior: 'returnPartial' }), { kind: 'authorization' });
	});

	test('single-page Mission Control limits reject invalid or repeated continuations', async () => {
		for (const link of ['not-a-link; rel="next"', `<${apiBaseUri}/agents/tasks>; rel="next"`]) {
			const { client, requests } = setup(() => Response.json({ tasks: [task] }, { headers: { link } }));
			await assert.rejects(client.tasks.list(signal(), { maxPages: 1, pageLimitBehavior: 'returnPartial' }), { kind: 'malformedResponse' });
			assert.strictEqual(requests.length, 1);
		}
	});

	test('automation discovery preserves public metadata without inventing internal fields or defaults', async () => {
		const tools: readonly AutomationToolGroup[] = [{
			id: 'issues', title: 'Issues', tools: [
				{ id: 'github/issue_read', title: 'Read issue', description: 'Read an issue.', scope: 'read' },
			],
		}, { id: 'empty', tools: [] }];
		const triggers: readonly AutomationTriggerDefinition[] = [{
			id: 'interval', title: 'Schedule', description: 'Runs on a schedule.', supports_run_now: true,
			fields: [
				{ id: 'cadence', label: 'Cadence', type: 'string_array', required: true, options: ['hourly', 'daily', 'weekly'] },
				{ id: 'minute_utc', label: 'UTC minute', type: 'integer', required: false, options: ['0', '15', '30', '45'] },
				{ id: 'write_scope', label: 'Write scope', type: 'string', required: false, options: ['trigger', 'repository'] },
			],
		}, { title: 'No fields', description: '', fields: [] }];
		const { client } = setup(request => Response.json(request.url.pathname.endsWith('/tools') ? tools : triggers));
		assert.deepStrictEqual(await Promise.all([
			client.automations.listTools(signal()), client.automations.listTriggers(signal()),
		]), [tools, triggers]);
	});

	for (const wrapped of [false, true]) {
		test(`trigger catalog accepts ${wrapped ? 'wrapped' : 'array'} responses`, async () => {
			const { client } = setup(() => Response.json(wrapped ? { triggers: triggerDefinitions } : triggerDefinitions));
			assert.deepStrictEqual(await client.automations.listTriggers(signal()), triggerDefinitions);
		});
	}

	for (const method of ['listTools', 'listTriggers'] as const) {
		test(`${method} returns an empty catalog without pagination or additional requests`, async () => {
			const { client, requests } = setup(() => Response.json([], { headers: { link: '<https://example.test/next>; rel="next"' } }));
			const result = await client.automations[method](signal());
			assert.deepStrictEqual({ result, requests: requests.length }, { result: [], requests: 1 });
		});

		test(`${method} requires an uncancelled signal before acquiring credentials`, async () => {
			const { client, identities, requests } = setup(() => Response.json([]));
			const controller = new AbortController();
			const reason = new Error('cancelled discovery');
			controller.abort(reason);
			await assert.rejects(client.automations[method](controller.signal), error => error === reason);
			assert.deepStrictEqual({ identities: identities.length, requests: requests.length }, { identities: 0, requests: 0 });
		});
	}

	for (const invalid of [
		{ method: 'listTools', name: 'a wrapped catalog', data: { tools: toolGroups } },
		{ method: 'listTools', name: 'a group without tools', data: [{ id: 'issues' }] },
		{ method: 'listTools', name: 'a tool without a description', data: [{ id: 'issues', tools: [{ id: 'github/issue_read' }] }] },
		{ method: 'listTools', name: 'an invalid permission scope', data: [{ id: 'issues', tools: [{ id: 'tool', description: '', scope: 'admin' }] }] },
		{ method: 'listTools', name: 'a null optional name', data: [{ ...toolGroups[0], name: null }] },
		{ method: 'listTriggers', name: 'an invalid wrapped catalog', data: { triggers: null } },
		{ method: 'listTriggers', name: 'missing fields', data: [{ title: 'Schedule', description: '' }] },
		{ method: 'listTriggers', name: 'a missing required-field flag', data: [{ ...triggerDefinitions[0], fields: [{ name: 'types' }] }] },
		{ method: 'listTriggers', name: 'non-string options', data: [{ ...triggerDefinitions[0], fields: [{ name: 'types', required: true, options: [1] }] }] },
		{ method: 'listTriggers', name: 'an invalid field type', data: [{ ...triggerDefinitions[0], fields: [{ id: 'types', required: true, type: 'boolean' }] }] },
		{ method: 'listTriggers', name: 'a non-string field label', data: [{ ...triggerDefinitions[0], field_labels: { types: 1 } }] },
		{ method: 'listTriggers', name: 'a non-boolean run-now flag', data: [{ ...triggerDefinitions[0], supports_run_now: 'false' }] },
	] as const) {
		test(`${invalid.method} rejects ${invalid.name}`, async () => {
			const { client } = setup(() => Response.json(invalid.data));
			await assert.rejects(client.automations[invalid.method](signal()), SchemaError);
		});
	}

	test('rejects run history belonging to a different automation', async () => {
		const { client } = setup(() => Response.json({ tasks: [{ ...task, automation_id: 'other' }] }));
		await assert.rejects(client.automations.listRuns(automation.id, signal()), /did not belong/);
	});

	for (const operation of [
		{ name: 'list', status: 201, run: (client: IGitHubAccountClient) => client.automations.list(repository, signal()) },
		{ name: 'get', status: 201, run: (client: IGitHubAccountClient) => client.automations.get(repository, automation.id, signal()) },
		{ name: 'getConfiguration', status: 201, run: (client: IGitHubAccountClient) => client.automations.getConfiguration(repository, signal()) },
		{ name: 'create', status: 200, run: (client: IGitHubAccountClient) => client.automations.create(repository, automation, signal()) },
		{ name: 'update', status: 201, run: (client: IGitHubAccountClient) => client.automations.update(repository, automation.id, { name: 'Updated' }, signal()) },
		{ name: 'delete', status: 200, run: (client: IGitHubAccountClient) => client.automations.delete(repository, automation.id, signal()) },
		{ name: 'dispatch', status: 200, run: (client: IGitHubAccountClient) => client.automations.dispatch(repository, automation.id, { event: 'manual' }, signal()) },
		{ name: 'listRuns', status: 201, run: (client: IGitHubAccountClient) => client.automations.listRuns(automation.id, signal()) },
		{ name: 'listTools', status: 201, run: (client: IGitHubAccountClient) => client.automations.listTools(signal()) },
		{ name: 'listTriggers', status: 201, run: (client: IGitHubAccountClient) => client.automations.listTriggers(signal()) },
	]) {
		test(`${operation.name} rejects an undocumented HTTP ${operation.status} success`, async () => {
			const { client, requests } = setup(() => Response.json(automation, { status: operation.status }));
			await assert.rejects(operation.run(client), { kind: 'malformedResponse' });
			assert.strictEqual(requests.length, 1);
		});
	}

	test('retains only documented diagnostics and response metadata', async () => {
		const response = {
			message: 'Invalid revision', documentation_url: 'https://docs.github.com', code: 'stale_revision',
			errors: [{ code: 'custom', message: 'Retry later' }],
			activation_context: { version: 2, sequence: '1', traceparent: 'parent', tracestate: 'state' },
		};
		const { client, requests } = setup(() => Response.json({
			...response,
			internal: 'not-public',
			errors: response.errors.map(error => ({ ...error, internal: 'not-public' })),
			activation_context: { ...response.activation_context, internal: 'not-public' },
		}, {
			status: 409, headers: { 'x-github-request-id': 'ABCD:1234:5678:90AB:CDEF', 'retry-after': '2' },
		}));
		await assert.rejects(client.automations.update(repository, automation.id, { name: 'New name' }, signal()), error => {
			assert.ok(error instanceof ApiRequestError);
			assert.deepStrictEqual({
				status: error.statusCode, response: error.response, requestId: error.requestId,
				retryAfterSeconds: error.retryAfterSeconds, rawBody: error.responseBody, outcome: error.outcome,
				attempts: requests.length,
			}, { status: 409, response, requestId: 'ABCD:1234:5678:90AB:CDEF', retryAfterSeconds: 2, rawBody: undefined, outcome: undefined, attempts: 1 });
			return true;
		});
	});

	test('missing configuration disables only Mission Control operations', async () => {
		const { client, identities, requests } = setup(() => Response.json([]), { ...clientOptions(), missionControl: undefined });
		await assert.rejects(client.automations.list(repository, signal()), /No approved Mission Control API endpoint/);
		const emails = await client.users.listEmails(signal());
		assert.deepStrictEqual({ emails, requests: requests.length, identities: identities.length }, {
			emails: [], requests: 1, identities: 1,
		});
	});

	test('coalesces safe reads without letting one cancelled caller abort a peer', async () => {
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<Response>();
		const { client, requests } = setup(() => {
			void started.complete();
			return response.p;
		});
		const controller = new AbortController();
		const reason = new Error('caller cancelled');
		const first = client.automations.list(repository, controller.signal);
		const rejected = assert.rejects(first, error => error === reason);
		const second = client.automations.list(repository, signal());
		await started.p;
		await timeout(0);
		controller.abort(reason);
		await rejected;
		await response.complete(Response.json(emptyPage));
		const page = await second;
		assert.deepStrictEqual({ data: page.data, attempts: requests.length, aborted: requests[0].init.signal?.aborted }, {
			data: emptyPage, attempts: 1, aborted: false,
		});
	});

	test('revalidates safe reads with the cached status, Link and a new server Date', async () => {
		const nextLink = `${apiBaseUri}${collection}/v2?page=2`;
		let calls = 0;
		const { client, requests } = setup(() => ++calls === 1
			? Response.json(emptyPage, { headers: { etag: '"one"', link: `<${nextLink}>; rel="next"` } })
			: new Response(null, { status: 304, headers: { etag: 'W/"two"', date: serverDate } }));
		await client.automations.list(repository, signal());
		const second = await client.automations.list(repository, signal());
		const third = await client.automations.list(repository, signal());
		assert.deepStrictEqual({
			second, third, validators: requests.map(request => new Headers(request.init.headers).get('If-None-Match')),
		}, {
			second: { data: emptyPage, nextLink, serverDate }, third: { data: emptyPage, nextLink, serverDate },
			validators: [null, '"one"', 'W/"two"'],
		});
	});

	test('a cached unexpected success status cannot become a valid automation page through 304', async () => {
		let calls = 0;
		const { client } = setup(() => ++calls === 1
			? Response.json(emptyPage, { status: 202, headers: { etag: '"pending"' } })
			: new Response(null, { status: 304 }));
		await assert.rejects(client.automations.list(repository, signal()), { kind: 'malformedResponse' });
		await assert.rejects(client.automations.list(repository, signal()), { kind: 'malformedResponse' });
	});

	test('a server no-store directive removes an existing validator and prevents caching', async () => {
		let calls = 0;
		const { client, requests } = setup(() => Response.json(emptyPage, {
			headers: ++calls === 1 ? { etag: '"one"' } : { etag: '"two"', 'cache-control': 'no-store' },
		}));
		await client.automations.list(repository, signal());
		await client.automations.list(repository, signal());
		await client.automations.list(repository, signal());
		assert.deepStrictEqual(requests.map(request => new Headers(request.init.headers).get('If-None-Match')), [null, '"one"', null]);
	});

	for (const failure of ['network', 'body', 408, 500, 501, 502, 503, 504] as const) {
		test(`ordinary reads retain one transient retry for ${failure}`, () => runWithFakedTimers({}, async () => {
			let calls = 0;
			const { service, client, requests } = setup(() => {
				if (++calls === 1) {
					if (failure === 'network') {
						throw new Error('network unavailable');
					}
					if (failure === 'body') {
						return new Response(new ReadableStream<Uint8Array>({ pull: controller => controller.error(new Error('connection lost')) }));
					}
					return Response.json({}, { status: failure });
				}
				return Response.json(emptyPage);
			});
			try {
				const page = await client.automations.list(repository, signal());
				const delay = requests[1].at - requests[0].at;
				assert.deepStrictEqual({ data: page.data, attempts: requests.length, delayed: delay >= 1000 && delay < 1250 }, {
					data: emptyPage, attempts: 2, delayed: true,
				});
			} finally {
				service.dispose();
			}
		}));
	}

	for (const refusal of [
		{ status: 429, retryAfter: '2', delay: 2000 },
		{ status: 429, retryAfter: undefined, delay: 5_000 },
		{ status: 429, retryAfter: '0', delay: 5_000 },
		{ status: 429, retryAfter: 'invalid', delay: 5_000 },
		{ status: 403, retryAfter: '2', delay: 2000 },
		{ status: 403, retryAfter: undefined, delay: 0 },
		{ status: 503, retryAfter: 'Thu, 01 Jan 2026 00:00:02 GMT', delay: 2000 },
	]) {
		test(`HTTP ${refusal.status} with Retry-After ${refusal.retryAfter} surfaces the failure and gates subsequent work`, () => runWithFakedTimers({ startTime: Date.parse(date) }, async () => {
			let calls = 0;
			const { service, client, requests } = setup(() => ++calls === 1
				? Response.json({ message: 'Refused', documentation_url: 'https://docs.github.com' }, {
					status: refusal.status, headers: refusal.retryAfter === undefined ? {} : { 'retry-after': refusal.retryAfter },
				})
				: Response.json({ tasks: [] }));
			try {
				await assert.rejects(client.automations.list(repository, signal()), { statusCode: refusal.status });
				const afterFailure = requests.length;
				await client.tasks.list(signal());
				assert.deepStrictEqual({ afterFailure, attempts: requests.length, delay: requests[1].at - requests[0].at }, {
					afterFailure: 1, attempts: 2, delay: refusal.delay,
				});
			} finally {
				service.dispose();
			}
		}));
	}

	test('a waking hint and GitHub-shaped quota headers do not park Mission Control', () => runWithFakedTimers({ startTime: Date.parse(date) }, async () => {
		const { service, client, requests } = setup(request => request.url.pathname.endsWith('/connect')
			? Response.json({ environment_status: 'waking' }, {
				status: 202, headers: { 'retry-after': '1', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Date.now() / 1000 + 60) },
			})
			: Response.json(emptyPage));
		try {
			const waking = await client.environments.connect('environment-1', signal());
			await client.automations.list(repository, signal());
			assert.deepStrictEqual({ waking, delay: requests[1].at - requests[0].at }, {
				waking: { status: 202, data: { environment_status: 'waking' }, retryAfterSeconds: 1 }, delay: 0,
			});
		} finally {
			service.dispose();
		}
	}));

	test('cooldowns survive client release without blocking GitHub REST or another account', () => runWithFakedTimers({ startTime: Date.parse(date) }, async () => {
		let refused = false;
		const { service, client, acquire, requests } = setup(request => {
			if (!refused && request.url.host === 'api.githubcopilot.com') {
				refused = true;
				return Response.json({}, { status: 429, headers: { 'retry-after': '2' } });
			}
			return Response.json(request.url.host === 'api.github.com' ? [] : emptyPage);
		});
		try {
			await assert.rejects(client.automations.list(repository, signal()), { kind: 'rateLimit' });
			await client.users.listEmails(signal());
			const options = clientOptions();
			const other = acquire({ ...options, authorization: { ...options.authorization, sessionId: 'second' } }).client;
			await other.automations.list(repository, signal());
			client.dispose();
			const reacquired = acquire().client;
			await reacquired.automations.list(repository, signal());
			assert.deepStrictEqual(requests.map(request => request.at - Date.parse(date)), [0, 0, 0, 2000]);
		} finally {
			service.dispose();
		}
	}));

	test('environment credentials and sensitive listings are neither shared nor cached', async () => {
		const { client, requests } = setup(request => Response.json(request.url.pathname.endsWith('/connect')
			? connection
			: [{ id: 'environment-1', name: 'Cloud', kind: 'managed-sandbox', status: 'online' }], { headers: { etag: '"credential"' } }));
		const connections = await Promise.all([client.environments.connect('environment-1', signal()), client.environments.connect('environment-1', signal())]);
		await Promise.all([client.environments.list(signal()), client.environments.list(signal())]);
		await client.environments.list(signal());
		assert.deepStrictEqual({
			connections, attempts: requests.length, validators: requests.map(request => new Headers(request.init.headers).get('If-None-Match')),
		}, { connections: [{ status: 200, data: connection }, { status: 200, data: connection }], attempts: 5, validators: Array(5).fill(null) });
	});

	test('mints identity credentials only on the approved gateway without sharing or caching', async () => {
		const options = clientOptions();
		const identity = { token: 'identity-secret', expires_in: 3600, expires_at: date };
		const { client, requests } = setup(() => Response.json(identity, { headers: { etag: '"private"' } }), {
			...options,
			missionControl: { endpoint: { ...options.missionControl!.endpoint, identityApiBaseUri: 'https://api.github.com/cmc_internal/api/agents' } },
		});
		const credentials = await Promise.all([client.environments.mintIdentityToken(signal()), client.environments.mintIdentityToken(signal())]);
		assert.deepStrictEqual({
			credentials,
			requests: requests.map(request => ({
				url: request.url.href, method: request.init.method, body: request.init.body,
				integration: new Headers(request.init.headers).get('Copilot-Integration-Id'),
				validator: new Headers(request.init.headers).get('If-None-Match'),
			})),
		}, {
			credentials: [identity, identity],
			requests: Array.from({ length: 2 }, () => ({
				url: 'https://api.github.com/cmc_internal/api/agents/environments/tokens',
				method: 'POST', body: '{}', integration: 'test-integration', validator: null,
			})),
		});
	});

	test('does not guess an identity endpoint when its gateway is not configured', async () => {
		const { client, requests } = setup(() => Response.json({ token: 'must-not-be-requested' }));
		await assert.rejects(client.environments.mintIdentityToken(signal()), { kind: 'validation' });
		assert.deepStrictEqual(requests, []);
	});

	test('negotiates task feed credentials on the approved gateway without caching or coalescing', async () => {
		const feed = {
			url: 'wss://relay.example.test/?access_token=feed-secret',
			subprotocol: 'json.webpubsub.azure.v1', group: 'opaque-group',
			expires_at: date, reconnect_after: date, frame_schema_version: 1,
		};
		const options = clientOptions();
		const { client, requests } = setup(request => Response.json(request.url.pathname.endsWith('/feed/connect')
			? { ...feed, access_token: 'unused-secret', hub: 'unused-hub', wps_endpoint: 'wss://unused.example.test/' }
			: { tasks: [] }, {
			headers: { etag: '"credential"' },
		}), {
			...options,
			missionControl: { endpoint: { ...options.missionControl!.endpoint, feedApiBaseUri: 'https://api.github.com/cmc_internal/api/agents' } },
		});
		const connections = await Promise.all([client.tasks.connectFeed(signal()), client.tasks.connectFeed(signal())]);
		await client.tasks.list(signal());
		assert.deepStrictEqual({
			connections,
			requests: requests.map(request => ({
				url: request.url.href, method: request.init.method,
				integration: new Headers(request.init.headers).get('Copilot-Integration-Id'),
				validator: new Headers(request.init.headers).get('If-None-Match'),
			})),
		}, {
			connections: [feed, feed],
			requests: [
				{ url: 'https://api.github.com/cmc_internal/api/agents/feed/connect', method: 'GET', integration: 'test-integration', validator: null },
				{ url: 'https://api.github.com/cmc_internal/api/agents/feed/connect', method: 'GET', integration: 'test-integration', validator: null },
				{ url: 'https://api.githubcopilot.com/agents/tasks', method: 'GET', integration: 'test-integration', validator: null },
			],
		});
	});

	test('does not guess a feed endpoint when its gateway is not configured', async () => {
		const { client, requests } = setup(() => Response.json({}));
		await assert.rejects(client.tasks.connectFeed(signal()), { kind: 'validation' });
		assert.deepStrictEqual(requests, []);
	});

	for (const status of [401, 403, 404, 503]) {
		test(`feed negotiation HTTP ${status} preserves retry diagnostics without credentials`, async () => {
			const options = clientOptions();
			const { client, requests } = setup(() => Response.json({ message: 'feed-secret', access_token: 'feed-secret' }, {
				status, headers: { 'retry-after': '30' },
			}), {
				...options,
				missionControl: { endpoint: { ...options.missionControl!.endpoint, feedApiBaseUri: 'https://api.github.com/cmc_internal/api/agents' } },
			});
			await assert.rejects(client.tasks.connectFeed(signal()), error => {
				assert.ok(error instanceof ApiRequestError);
				assert.deepStrictEqual({
					status: error.statusCode, retry: error.retryAfterSeconds, attempts: requests.length,
					containsSecret: JSON.stringify(error).includes('feed-secret'),
				}, { status, retry: 30, attempts: 1, containsSecret: false });
				return true;
			});
		});
	}

	test('sensitive HTTP failures do not retain credentials in messages or diagnostics', async () => {
		const secret = 'do-not-retain-this-credential';
		const { client } = setup(() => Response.json({ message: secret, documentation_url: secret, access_token: secret }, {
			status: 403, headers: { 'x-github-request-id': 'ABCD:1234:5678:90AB:CDEF' },
		}));
		await assert.rejects(client.environments.connect('environment-1', signal()), error => {
			assert.ok(error instanceof ApiRequestError);
			assert.deepStrictEqual({
				kind: error.kind, details: error.response, body: error.responseBody, requestId: error.requestId,
				containsSecret: `${error.message}${JSON.stringify(error)}`.includes(secret),
			}, { kind: 'authorization', details: undefined, body: undefined, requestId: 'ABCD:1234:5678:90AB:CDEF', containsSecret: false });
			return true;
		});
	});

	for (const errorBody of [
		{ error_code: 'rate_limit_exceeded', limited_resource: 'token_mint' },
		{ code: 'environment_compute_terminal' },
		{ error_code: 'future_code' },
	]) {
		test(`sensitive requests retain safe codes without retaining response content: ${JSON.stringify(errorBody)}`, async () => {
			const { client, requests } = setup(() => Response.json({ ...errorBody, message: 'private credential', access_token: 'private credential' }, {
				status: 409, headers: { 'x-github-request-id': 'ABCD:1234:5678:90AB:CDEF' },
			}));
			await assert.rejects(client.environments.connect('environment-1', signal()), error => {
				assert.ok(error instanceof ApiRequestError);
				assert.deepStrictEqual({
					code: error.code, limitedResource: error.limitedResource, requestId: error.requestId,
					privateContent: JSON.stringify(error).includes('private credential'), requests: requests.length,
				}, {
					code: errorBody.error_code ?? errorBody.code, limitedResource: errorBody.limited_resource,
					requestId: 'ABCD:1234:5678:90AB:CDEF', privateContent: false, requests: 1,
				});
				return true;
			});
		});
	}

	test('a known unavailable capability is not retried even when its status is 501', async () => {
		const { client, requests } = setup(request => request.url.pathname.endsWith('/tasks')
			? Response.json({ error_code: 'not_implemented' }, { status: 501, headers: { 'retry-after': '300' } })
			: Response.json(emptyPage));
		await assert.rejects(client.tasks.list(signal()), { code: 'not_implemented', statusCode: 501 });
		assert.strictEqual(requests.length, 1);
		await client.automations.list(repository, signal());
	});

	for (const replacement of ['replacement', 'token-selected', 'token-second', undefined]) {
		test(`a rejected credential retries only with a new grant for the same account: ${replacement}`, async () => {
			let token: string | undefined = 'token-selected';
			const { client, requests } = setup(() => {
				token = replacement;
				return requests.length === 1
					? Response.json({ error_code: 'unauthenticated' }, { status: 401 })
					: Response.json({ tasks: [] });
			}, clientOptions(), { onDidChange: Event.None, getToken: () => token });
			if (replacement === 'replacement') {
				await client.tasks.list(signal());
			} else {
				await assert.rejects(client.tasks.list(signal()), { statusCode: 401, code: 'unauthenticated' });
			}
			assert.strictEqual(requests.length, replacement === 'replacement' ? 2 : 1);
		});
	}

	test('authentication recovery retries at most once when the replacement is also rejected', async () => {
		let token = 'old';
		const { client, requests } = setup(() => {
			token = 'replacement';
			return Response.json({ error_code: 'unauthenticated' }, { status: 401 });
		}, clientOptions(), {
			onDidChange: Event.None,
			getToken: () => token,
		});
		await assert.rejects(client.tasks.list(signal()), { statusCode: 401, code: 'unauthenticated' });
		assert.strictEqual(requests.length, 2);
	});

	test('a sandbox quota does not block unrelated Mission Control reads', () => runWithFakedTimers({}, async () => {
		const { client, requests } = setup(request => request.url.pathname === '/agents/tasks' && request.init.method === 'POST'
			? Response.json({ error_code: 'rate_limit_exceeded', limited_resource: 'sandbox' }, { status: 429, headers: { 'retry-after': '2' } })
			: Response.json({ tasks: [] }));
		await assert.rejects(client.tasks.create({ prompt: 'test', environment_id: 'github-sandbox' }, signal()), { code: 'rate_limit_exceeded' });
		await client.tasks.list(signal());
		await assert.rejects(client.tasks.create({ prompt: 'test', environment_id: 'github-sandbox' }, signal()), { code: 'rate_limit_exceeded' });
		assert.deepStrictEqual(requests.map(request => request.at - requests[0].at), [0, 0, 2000]);
	}));

	test('a token-mint quota gates credential requests without blocking inventory reads', () => runWithFakedTimers({}, async () => {
		let connections = 0;
		const { client, requests } = setup(request => request.url.pathname.endsWith('/connect')
			? ++connections === 1
				? Response.json({ error_code: 'rate_limit_exceeded', limited_resource: 'token_mint' }, { status: 403, headers: { 'retry-after': '2' } })
				: Response.json(connection)
			: Response.json({ tasks: [] }));
		await assert.rejects(client.environments.connect('environment-1', signal()), { kind: 'rateLimit', code: 'rate_limit_exceeded' });
		await client.tasks.list(signal());
		await client.environments.connect('environment-1', signal());
		assert.deepStrictEqual(requests.map(request => request.at - requests[0].at), [0, 0, 2000]);
	}));

	test('credential replacement never automatically replays a mutation', async () => {
		let token = 'old';
		const { client, requests } = setup(() => {
			token = 'replacement';
			return Response.json({ error_code: 'unauthenticated' }, { status: 401 });
		}, clientOptions(), { onDidChange: Event.None, getToken: () => token });
		await assert.rejects(client.tasks.create({ prompt: 'test' }, signal()), { statusCode: 401, code: 'unauthenticated' });
		assert.strictEqual(requests.length, 1);
	});

	test('reconnect validates the client identity and keeps credential requests uncacheable', async () => {
		const { client, requests } = setup(() => Response.json(connection, { headers: { etag: '"credential"' } }));
		const result = await client.environments.reconnect('environment-1', connection.client_id, signal());
		await assert.rejects(client.environments.reconnect('environment-1', 'different-client', signal()), { outcome: 'indeterminate' });
		assert.deepStrictEqual({
			result, routes: requests.map(request => request.url.pathname + request.url.search),
			validators: requests.map(request => new Headers(request.init.headers).get('If-None-Match')),
		}, {
			result: { status: 200, data: connection },
			routes: ['/agents/environments/environment-1/reconnect?client_id=client-1', '/agents/environments/environment-1/reconnect?client_id=different-client'],
			validators: [null, null],
		});
	});

	for (const operation of ['create', 'dispatch', 'connect', 'events', 'ahpEvents'] as const) {
		for (const failure of ['network', 'body', 'server'] as const) {
			test(`${operation} does not retry a ${failure} failure`, async () => {
				const { client, requests } = setup(() => {
					if (failure === 'network') {
						throw new Error('failed');
					}
					if (failure === 'body') {
						return new Response(new ReadableStream<Uint8Array>({ pull: controller => controller.error(new Error('private response content')) }));
					}
					return Response.json({}, { status: 503 });
				});
				const pending = operation === 'create' ? client.automations.create(repository, automation, signal())
					: operation === 'dispatch' ? client.automations.dispatch(repository, automation.id, { event: 'manual' }, signal())
						: operation === 'connect' ? client.environments.connect('environment-1', signal())
							: operation === 'events' ? client.tasks.getEvents(task.id, signal())
								: client.tasks.getAhpEvents(task.id, signal());
				await assert.rejects(pending, operation === 'events' || operation === 'ahpEvents'
					? { kind: failure === 'server' ? 'server' : 'network' }
					: { kind: failure === 'server' ? 'server' : 'network', outcome: 'indeterminate' });
				assert.strictEqual(requests.length, 1);
			});
		}
	}

	test('dispatched mutations with an invalid response remain indeterminate', async () => {
		const { client } = setup(() => Response.json({}, { status: 201 }));
		await assert.rejects(client.automations.create(repository, automation, signal()), { outcome: 'indeterminate' });
	});

	test('cancelling a queued mutation does not claim it was dispatched', async () => {
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<void>();
		const { client, requests } = setup(async () => {
			void started.complete();
			await response.p;
			return Response.json(emptyPage);
		});
		const reads = Array.from({ length: 8 }, (_, index) => client.automations.list({ ...repository, repo: `repo-${index}` }, signal()));
		await started.p;
		await timeout(0);
		const controller = new AbortController();
		const reason = new Error('cancel queued write');
		const rejected = assert.rejects(client.automations.create(repository, automation, controller.signal), error => error === reason);
		await timeout(0);
		controller.abort(reason);
		await rejected;
		await response.complete();
		await Promise.all(reads);
		assert.strictEqual(requests.length, 8);
	});

	test('invalidates mapped caches and cancels in-flight work on credential replacement', async () => {
		let token = 'original';
		let reads = 0;
		const started = new DeferredPromise<void>();
		const lateResponse = new DeferredPromise<Response>();
		const { client, requests } = setup(request => {
			if (request.url.pathname === '/agents/tasks') {
				return Response.json({ tasks: [] });
			}
			if (++reads === 2) {
				void started.complete();
				return lateResponse.p;
			}
			return Response.json(emptyPage, { headers: { etag: `"${token}"` } });
		}, clientOptions(), { onDidChange: Event.None, getToken: () => token });
		await client.automations.list(repository, signal());
		const rejected = assert.rejects(client.automations.list(repository, signal()), { kind: 'authentication' });
		await started.p;
		token = 'replacement';
		await client.tasks.list(signal());
		await rejected;
		await lateResponse.complete(Response.json(emptyPage, { headers: { etag: '"obsolete"' } }));
		await client.automations.list(repository, signal());
		assert.deepStrictEqual(requests.map(({ init }) => {
			const headers = new Headers(init.headers);
			return [headers.get('Authorization'), headers.get('If-None-Match')];
		}), [
			['Bearer original', null], ['Bearer original', '"original"'],
			['Bearer replacement', null], ['Bearer replacement', null],
		]);
	});

	test('releasing the client cancels work and prevents further domain requests', async () => {
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<Response>();
		const { client, requests } = setup(() => {
			void started.complete();
			return response.p;
		});
		const rejected = assert.rejects(client.automations.list(repository, signal()));
		await started.p;
		client.dispose();
		await rejected;
		await response.complete(Response.json(emptyPage));
		await assert.rejects(client.automations.list(repository, signal()), isCancellationError);
		assert.deepStrictEqual({ attempts: requests.length, aborted: requests[0].init.signal?.aborted }, { attempts: 1, aborted: true });
	});

	test('does not follow a redirect for a credential-minting GET', async () => {
		const { client, requests } = setup(() => new Response(null, { status: 307, headers: { location: '/agents/other' } }));
		await assert.rejects(client.environments.connect('environment-1', signal()), { statusCode: 307 });
		assert.strictEqual(requests.length, 1);
	});

	test('task acknowledgements discard their bodies and representations remain distinct', async () => {
		let cancelled = false;
		const { client, requests } = setup(request => request.url.pathname.endsWith('/steer')
			? new Response(new ReadableStream<Uint8Array>({ cancel: () => { cancelled = true; } }), { status: 202 })
			: Response.json({ events: [], total: 0 }));
		await client.tasks.abort(task.id, signal());
		const [events, ahpEvents] = await Promise.all([client.tasks.getEvents(task.id, signal()), client.tasks.getAhpEvents(task.id, signal())]);
		assert.deepStrictEqual({
			cancelled, events: [events.data, ahpEvents],
			requests: requests.map(({ init }) => [init.method, init.body, new Headers(init.headers).get('Accept')]),
		}, {
			cancelled: true, events: [{ events: [], total: 0 }, { events: [], total: 0 }],
			requests: [
				['POST', '{"type":"abort"}', 'application/json'],
				['GET', undefined, 'application/json'], ['GET', undefined, 'application/vnd.github.ahp+json'],
			],
		});
	});

	test('rejects a task response with a different ID', async () => {
		const { client } = setup(() => Response.json({ ...task, id: 'other-task' }));
		await assert.rejects(client.tasks.get(task.id, signal()), new SchemaError('Task response did not match the requested task'));
	});

	test('preserves independent task and session client attribution in lists and details', async () => {
		const clients = [
			{ integration_id: 'copilot-developer-cli', slug: 'copilot-cli', creator: false },
			{ integration_id: 'vscode-chat', slug: 'copilot-vscode', creator: true },
			{ integration_id: 'future-client', slug: 'future-client', creator: false },
		];
		const sessions = [{ id: 'session-1', state: 'idle', created_at: date, clients: clients.map(client => ({ ...client, creator: false })) }];
		const response = { ...task, clients, sessions };
		const { client } = setup(request => Response.json(request.url.pathname === '/agents/tasks' ? { tasks: [response] } : response));
		const listed = await client.tasks.list(signal());
		const detail = await client.tasks.get(task.id, signal());
		assert.deepStrictEqual({ listed: listed.data.tasks[0].clients, task: detail.clients, sessions: detail.sessions }, {
			listed: clients, task: clients, sessions,
		});
	});

	test('rejects malformed client attribution rather than dropping it', async () => {
		for (const clients of [
			[{ integration_id: 'vscode-chat', slug: 'copilot-vscode', creator: 'true' }],
			[{ integration_id: 'vscode-chat', slug: '', creator: true }],
		]) {
			const { client } = setup(() => Response.json({ ...task, clients }));
			await assert.rejects(client.tasks.get(task.id, signal()), SchemaError);
		}
	});

	test('tasks use their existing contracts and configured service routes', async () => {
		const { client, requests } = setup(request => request.init.method === 'DELETE' ? new Response(null, { status: 204 })
			: Response.json(task, { status: request.init.method === 'POST' && request.url.pathname === '/agents/tasks' ? 201 : 200 }));
		const results = [
			await client.tasks.create({ prompt: 'Do the task' }, signal()),
			await client.tasks.get(task.id, signal()),
			await client.tasks.update(task.id, { name: 'Renamed' }, signal()),
			await client.tasks.archive(task.id, signal()),
			await client.tasks.unarchive(task.id, signal()),
			await client.tasks.delete(task.id, signal()),
		];
		assert.deepStrictEqual({ results, routes: requests.map(request => request.url.pathname) }, {
			results: [task, task, task, task, task, undefined],
			routes: ['/agents/tasks', '/agents/tasks/task-1', '/agents/tasks/task-1', '/agents/tasks/task-1/archive', '/agents/tasks/task-1/unarchive', '/agents/tasks/task-1'],
		});
	});

	test('AHP history checks its complete frame count without restricting paginated raw events', async () => {
		const frames = [{
			session_id: 'session-1', ns: 'ahp', seq: 0, at: date,
			payload: { kind: 'message', data: { channel: 'session:1', action: { type: 'session/delta', extra: 'preserved' }, serverSeq: 1 } },
		}];
		const rawEvents = [{ id: 'event-1', timestamp: date, parentId: null, type: 'message', data: { content: 'hello' } }];
		let total = frames.length;
		const { client } = setup(({ init }) => Response.json(new Headers(init.headers).get('Accept') === 'application/vnd.github.ahp+json'
			? { events: frames, total }
			: { events: rawEvents, total: 2 }));
		const history = await client.tasks.getAhpEvents(task.id, signal());
		for (const inconsistentTotal of [0, 2]) {
			total = inconsistentTotal;
			await assert.rejects(client.tasks.getAhpEvents(task.id, signal()), SchemaError);
		}
		const page = await client.tasks.getEvents(task.id, signal());
		assert.deepStrictEqual({ history, page: page.data }, {
			history: { events: frames, total: 1 }, page: { events: rawEvents, total: 2 },
		});
	});

	test('transport isolates version/integration representations and read execution policies', async () => {
		const account = { host: 'api.githubcopilot.com', accountId: '101' };
		const requests: Headers[] = [];
		const transport = store.add(new GitHubTransport(async (_url, init) => {
			requests.push(new Headers(init?.headers));
			return Response.json({}, { headers: { etag: '"one"' } });
		}));
		const request: GitHubRestRequest = { method: 'GET', url: `${apiBaseUri}/agents/tasks`, rateLimitResource: 'agents' };
		await transport.rest(account, 'token', request, signal());
		await transport.rest(account, 'token', { ...request, apiVersion: null }, signal());
		await transport.rest(account, 'token', { ...request, apiVersion: null, integrationId: 'integration' }, signal());
		await Promise.all([
			transport.rest(account, 'token', { ...request, retry: false }, signal()),
			transport.rest(account, 'token', request, signal()),
			transport.rest(account, 'token', { ...request, followRedirects: false }, signal()),
		]);
		assert.deepStrictEqual(requests.map(headers => [headers.get('X-GitHub-Api-Version'), headers.get('Copilot-Integration-Id'), headers.get('If-None-Match')]), [
			['2022-11-28', null, null], [null, null, null], [null, 'integration', null],
			['2022-11-28', null, '"one"'], ['2022-11-28', null, '"one"'], ['2022-11-28', null, '"one"'],
		]);
	});
});
