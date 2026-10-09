/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { IRequestContext, type IHeaders, type IRequestOptions } from '../../../../../../base/parts/request/common/request.js';
import { CLOUD_SANDBOX_AGENT_SLUG, CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID, CloudSandboxAuthenticationRequiredError, type ICloudSandboxClientToken } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { SessionStatus } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { COPILOT_INTEGRATION_ID } from '../../../../../../platform/endpoint/common/licenseAgreement.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { CloudSandboxApiService } from '../../../browser/remoteAgentHost/cloudSandboxApiService.js';
import { ICloudSandboxTelemetryService } from '../../../browser/remoteAgentHost/cloudSandboxTelemetry.js';

function jsonResponse(body: unknown, statusCode = 200, headers: Record<string, string> = {}): IRequestContext {
	return {
		res: { headers: { date: new Date().toUTCString(), ...headers }, statusCode },
		stream: bufferToStream(VSBuffer.fromString(JSON.stringify(body))),
	};
}

/** A task as Mission Control actually returns it: the repository is a bare numeric id. */
function task(id: string, name: string, repositoryId: number | undefined, sessionId: string, environmentId: string) {
	return {
		id,
		name,
		agent_collaborators: [{ slug: CLOUD_SANDBOX_AGENT_SLUG }],
		compute: { provider: 'sandboxes' },
		current_environment: { id: environmentId, kind: 'managed-sandbox' },
		...(repositoryId !== undefined ? { repository: { id: repositoryId } } : {}),
		sessions: [{ id: sessionId, environment_id: environmentId }],
	};
}

type ITestTask = Omit<ReturnType<typeof task>, 'current_environment'> & {
	readonly event_type?: string;
	readonly current_environment?: { readonly id: string; readonly kind: string };
	readonly updated_at?: string;
	readonly archived_at?: string;
};

interface ITestSetup {
	readonly service: CloudSandboxApiService;
	readonly requestedUrls: string[];
	readonly provisioningOutcomes: ProvisioningOutcome[];
	/** Peak number of task-detail fetches in flight at once during the run. */
	readonly concurrency: { max: number; current: number };
	changeAuthentication(): void;
}

type ProvisioningOutcome = Parameters<ICloudSandboxTelemetryService['reportProvisioningOutcome']>;

class TestLogService extends NullLogService {
	readonly traces: string[] = [];
	readonly infos: string[] = [];
	readonly debugs: string[] = [];
	readonly errors: (string | Error)[] = [];

	override trace(message: string, ...args: unknown[]): void {
		this.traces.push([message, ...args].join(' '));
	}

	override info(message: string, ...args: unknown[]): void {
		this.infos.push([message, ...args].join(' '));
	}

	override debug(message: string, ...args: unknown[]): void {
		this.debugs.push([message, ...args].join(' '));
	}

	override error(error: string | Error, ..._args: unknown[]): void {
		this.errors.push(error);
	}
}

function createService(store: Pick<{ add<T extends { dispose(): void }>(t: T): T }, 'add'>, options: {
	readonly tasks: readonly ITestTask[];
	/** Repository id -> response, or 'error' to fail the lookup. */
	readonly repositories: ReadonlyMap<number, { full_name?: string } | 'error'>;
	/** Serve page 1 with fewer rows than requested while still advertising `rel="next"`. */
	readonly shortFirstPage?: boolean;
	/** Task id -> how many times its detail fetch answers 429 before succeeding. */
	readonly rateLimitedTaskFetches?: ReadonlyMap<string, number>;
	/** How many times the task list answers 429 before succeeding. */
	readonly rateLimitedListPages?: number;
	/** `Retry-After` (seconds) served with each 429; omitted leaves the caller to back off. */
	readonly retryAfterSeconds?: number;
	/** Suspend every task-detail response by this many ms, so overlapping fetches are observable. */
	readonly taskFetchDelayMs?: number;
	readonly requestError?: Error;
	readonly logService?: ILogService;
	readonly onRequest?: (url: URL, token: CancellationToken, options: IRequestOptions) => IRequestContext | undefined | Promise<IRequestContext | undefined>;
	readonly discoveryDate?: () => string;
	readonly authenticationSessions?: (scopes?: readonly string[]) => Promise<readonly AuthenticationSession[]>;
}): ITestSetup {
	const requestedUrls: string[] = [];
	const provisioningOutcomes: ProvisioningOutcome[] = [];
	const concurrency = { max: 0, current: 0 };
	const remainingTaskRateLimits = new Map(options.rateLimitedTaskFetches ?? []);
	let remainingListRateLimits = options.rateLimitedListPages ?? 0;
	const rateLimitedResponse = () => jsonResponse(
		{ message: 'too many requests' },
		429,
		options.retryAfterSeconds !== undefined ? { 'retry-after': String(options.retryAfterSeconds) } : {},
	);
	const instantiationService = store.add(new TestInstantiationService());
	const authenticationChanges = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());

	instantiationService.stub(IRequestService, new class extends mock<IRequestService>() {
		override async request(opts: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
			if (options.requestError) {
				throw options.requestError;
			}
			const url = opts.url ?? '';
			requestedUrls.push(url);
			const override = await options.onRequest?.(new URL(url), token, opts);
			if (override) {
				return override;
			}
			const repoMatch = url.match(/\/repositories\/(\d+)$/);
			if (repoMatch) {
				const entry = options.repositories.get(Number(repoMatch[1]));
				if (entry === 'error') {
					return jsonResponse({ message: 'Not Found' }, 404);
				}
				return jsonResponse(entry ?? {});
			}
			if (/\/tasks\/[^/]+$/.test(url)) {
				const id = decodeURIComponent(url.split('/').pop()!);
				const remaining = remainingTaskRateLimits.get(id) ?? 0;
				if (remaining > 0) {
					remainingTaskRateLimits.set(id, remaining - 1);
					return rateLimitedResponse();
				}
				concurrency.current++;
				concurrency.max = Math.max(concurrency.max, concurrency.current);
				try {
					if (options.taskFetchDelayMs !== undefined) {
						await timeout(options.taskFetchDelayMs);
					}
					return jsonResponse(options.tasks.find(t => t.id === id));
				} finally {
					concurrency.current--;
				}
			}
			if (remainingListRateLimits > 0) {
				remainingListRateLimits--;
				return rateLimitedResponse();
			}
			const query = new URL(url).searchParams;
			const tasks = options.tasks.filter(task => {
				if (!!task.archived_at !== (query.get('is_archived') === 'true')) {
					return false;
				}
				if (query.has('with_repo') && (task.repository?.id !== undefined) !== (query.get('with_repo') === 'true')) {
					return false;
				}
				if (query.has('include_environment_kinds') && task.current_environment?.kind !== query.get('include_environment_kinds')) {
					return false;
				}
				return !query.has('since') || !task.updated_at || Date.parse(task.updated_at) >= Date.parse(query.get('since')!);
			});
			const perPage = Number(url.match(/[?&]per_page=(\d+)/)?.[1] ?? options.tasks.length);
			const page = Number(url.match(/[?&]page=(\d+)/)?.[1] ?? 1);
			if (options.shortFirstPage && tasks.length > 0 && page === 1) {
				return jsonResponse({ tasks: [] }, 200, { link: `<https://api.github.com/agents/tasks?page=2&per_page=${perPage}>; rel="next"` });
			}
			const slice = options.shortFirstPage ? tasks : tasks.slice((page - 1) * perPage, page * perPage);
			const hasNext = !options.shortFirstPage && page * perPage < tasks.length;
			const link = hasNext
				? `<https://api.github.com/agents/tasks?page=${page + 1}&per_page=${perPage}>; rel="next"`
				: `<https://api.github.com/agents/tasks?page=${page}&per_page=${perPage}>; rel="last"`;
			return jsonResponse({ tasks: slice }, 200, { link, date: options.discoveryDate?.() ?? new Date().toUTCString() });
		}
	}());
	instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
		override async getSessions(_providerId: string, scopes?: readonly string[]) {
			return options.authenticationSessions ? options.authenticationSessions(scopes) : [{ accessToken: 'tok', id: 's', account: { id: 'a', label: 'a' }, scopes: [] }];
		}
		override readonly onDidChangeSessions = authenticationChanges.event;
		override readonly onDidRegisterAuthenticationProvider = Event.None;
		override readonly onDidUnregisterAuthenticationProvider = Event.None;
	}());
	instantiationService.stub(IProductService, { defaultChatAgent: undefined } as unknown as IProductService);
	instantiationService.stub(ILogService, options.logService ?? new NullLogService());
	instantiationService.stub(ICloudSandboxTelemetryService, new class extends mock<ICloudSandboxTelemetryService>() {
		override reportRequest(): void { }
		override reportProvisioningOutcome(...outcome: ProvisioningOutcome): void {
			provisioningOutcomes.push(outcome);
		}
	}());

	return {
		service: store.add(instantiationService.createInstance(CloudSandboxApiService)),
		requestedUrls,
		provisioningOutcomes,
		concurrency,
		changeAuthentication: () => authenticationChanges.fire({ providerId: 'github', label: 'GitHub', event: { added: [], removed: [], changed: [] } }),
	};
}

suite('CloudSandboxApiService connection credentials', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const request = { environmentId: 'env-1', sessionId: 'session-1' };

	for (const failure of ['signed out', 'already cancelled', 'cancelled in flight', 'HTTP error', 'network error'] as const) {
		test(`credential request accounting includes only issued requests when ${failure}`, async () => {
			const progress: string[] = [];
			const source = store.add(new CancellationTokenSource());
			if (failure === 'already cancelled') {
				source.cancel();
			}
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(),
				authenticationSessions: failure === 'signed out' ? async () => [] : undefined,
				onRequest: () => {
					if (failure === 'cancelled in flight') {
						source.cancel();
						throw new CancellationError();
					}
					if (failure === 'network error') {
						throw new Error('network unavailable');
					}
					return jsonResponse({}, 403);
				},
			});
			await assert.rejects(service.connect({ ...request, onRequest: event => progress.push(event) }, source.token));
			const issued = failure !== 'signed out' && failure !== 'already cancelled';
			assert.deepStrictEqual({ progress, requests: requestedUrls.length }, {
				progress: issued ? ['issued'] : [], requests: issued ? 1 : 0,
			});
		});
	}

	function clientToken(clientId: string): ICloudSandboxClientToken {
		const groupPrefix = `user.u1.env.env-1.client.${clientId}`;
		return {
			access_token: 'relay-token',
			expires_at: '2026-01-01T01:00:00Z',
			wps_endpoint: 'wss://relay.example.com/client/hubs/hub',
			hub: 'hub',
			subprotocol: 'json.reliable.webpubsub.azure.v1',
			client_id: clientId,
			groups: {
				broadcast: `${groupPrefix}.broadcast`,
				to_client: `${groupPrefix}.to-client`,
				to_host: `${groupPrefix}.to-host`,
			},
		};
	}

	test('allows thirty seconds for connection requests while keeping environment reads at ten seconds', async () => {
		const requests: { path: string; timeout: number | undefined }[] = [];
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: (url, _token, options) => {
				requests.push({ path: url.pathname, timeout: options.timeout });
				return jsonResponse(url.pathname === '/agents/environments/env-1' ? { status: 'online' } : clientToken('client-1'));
			},
		});

		await service.connect(request, CancellationToken.None);
		await service.reconnect(request, 'client-1', CancellationToken.None);
		await service.getEnvironment(request.environmentId, CancellationToken.None);

		assert.deepStrictEqual(requests, [
			{ path: '/agents/environments/env-1/connect', timeout: 30_000 },
			{ path: '/agents/environments/env-1/reconnect', timeout: 30_000 },
			{ path: '/agents/environments/env-1', timeout: 10_000 },
		]);
	});

	test('loads cloud models and reasoning metadata without creating a task or environment', async () => {
		const requests: { path: string; method: string | undefined; integration: string | string[] | undefined }[] = [];
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: (url, _token, options) => {
				requests.push({ path: url.pathname, method: options.type, integration: options.headers?.['Copilot-Integration-Id'] });
				return jsonResponse({
					default_model: 'auto',
					data: [
						{ id: 'auto', name: 'Auto' },
						{ id: 'brand-new-model', name: 'New Model', capabilities: { supports: { vision: true, reasoning_effort: ['low', 'high', 'new-effort'] }, limits: { max_prompt_tokens: 1000 } } },
						{ id: 'disabled', name: 'Disabled', policy: { state: 'disabled' } },
						{ id: 'hidden', name: 'Hidden', model_picker_enabled: false },
					],
				});
			},
		});
		const catalog = await service.listModels(CancellationToken.None);
		assert.deepStrictEqual({
			requests,
			defaultModel: catalog.defaultModel,
			models: catalog.models.map(model => ({ id: model.id, vision: model.supportsVision, input: model.maxPromptTokens, efforts: model.configSchema?.properties.reasoningEffort.enum })),
		}, {
			requests: [{ path: '/agents/swe/models', method: 'GET', integration: COPILOT_INTEGRATION_ID }],
			defaultModel: 'auto',
			models: [
				{ id: 'auto', vision: undefined, input: undefined, efforts: undefined },
				{ id: 'brand-new-model', vision: true, input: 1000, efforts: ['low', 'high', 'new-effort'] },
			],
		});
	});

	for (const body of [{}, { data: [null] }, { data: [{ id: 'bad', name: 'Bad', capabilities: { supports: { reasoning_effort: [1] } } }] }]) {
		test(`rejects invalid cloud model metadata: ${JSON.stringify(body)}`, async () => {
			const { service } = createService(store, { tasks: [], repositories: new Map(), onRequest: () => jsonResponse(body) });
			await assert.rejects(service.listModels(CancellationToken.None), /invalid model/);
		});
	}

	test('reports cloud catalog HTTP failures instead of treating them as an empty catalog', async () => {
		const { service } = createService(store, { tasks: [], repositories: new Map(), onRequest: () => jsonResponse({}, 403) });
		await assert.rejects(service.listModels(CancellationToken.None), /model catalog failed: HTTP 403/);
	});

	for (const action of ['connect', 'reconnect'] as const) {
		for (const failure of [new TypeError('Failed to fetch'), new Error('Fetch timeout: 30000ms')]) {
			test(`${action} classifies an unanswered request: ${failure.message}`, async () => {
				const { service } = createService(store, {
					tasks: [], repositories: new Map(),
					onRequest: () => { throw failure; },
				});
				await assert.rejects(action === 'connect'
					? service.connect(request, CancellationToken.None)
					: service.reconnect(request, 'client-1', CancellationToken.None), {
					name: 'CloudSandboxNetworkError', message: failure.message, cause: failure,
				});
			});
		}

		test(`${action} keeps cancellation out of network retries`, async () => {
			const source = store.add(new CancellationTokenSource());
			const { service } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: () => {
					source.cancel();
					throw new TypeError('Failed to fetch');
				},
			});
			await assert.rejects(action === 'connect'
				? service.connect(request, source.token)
				: service.reconnect(request, 'client-1', source.token), isCancellationError);
		});

		test(`${action} does not classify observer failures as network failures`, async () => {
			const failure = new Error('observer failed');
			const { service, requestedUrls } = createService(store, { tasks: [], repositories: new Map() });
			const observedRequest = { ...request, onRequest: () => { throw failure; } };
			await assert.rejects(action === 'connect'
				? service.connect(observedRequest, CancellationToken.None)
				: service.reconnect(observedRequest, 'client-1', CancellationToken.None), error => error === failure);
			assert.deepStrictEqual(requestedUrls, []);
		});

		test(`${action} logs safe upstream correlation for an HTTP failure`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const logService = new TestLogService();
			const requestId = 'ABCD:1234:5678:90AB:CDEF';
			const { service } = createService(store, {
				tasks: [], repositories: new Map(), logService,
				onRequest: async () => {
					await timeout(35);
					return jsonResponse({ message: 'Failed to open relay; token=secret-token', access_token: 'secret-token', privateBody: 'private response body' }, 500, {
						'x-github-request-id': requestId,
						'retry-after': '45',
						'set-cookie': 'private-cookie',
					});
				},
			});
			const connecting = action === 'connect'
				? service.connect(request, CancellationToken.None)
				: service.reconnect(request, 'client-1', CancellationToken.None);
			await assert.rejects(connecting, {
				name: 'CloudSandboxRequestError',
				message: `Mission Control ${action} failed: HTTP 500 (requestId=${requestId})`,
				statusCode: 500,
				retryAfterSeconds: 45,
			});
			assert.deepStrictEqual(logService.errors, [
				`[CloudSandboxApi] ${action} failed: method=GET host=api.githubcopilot.com environmentId=env-1 sessionId=session-1 clientId=${action === 'connect' ? 'none' : 'client-1'} status=500 requestId=${requestId} durationMs=35 retryAfterSeconds=45 message=Failed to open relay; token=[redacted]`,
			]);
		}));

		test(`${action} preserves valid credentials and the scoped request`, async () => {
			const progress: string[] = [];
			const observedRequest = { ...request, onRequest: (event: string) => progress.push(event) };
			const token = clientToken('client-1');
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: () => jsonResponse(token),
			});

			const result = action === 'connect'
				? await service.connect(observedRequest, CancellationToken.None)
				: await service.reconnect(observedRequest, 'client-1', CancellationToken.None);

			assert.deepStrictEqual({
				result,
				progress,
				requests: requestedUrls.map(url => {
					const parsed = new URL(url);
					return { path: parsed.pathname, query: Object.fromEntries(parsed.searchParams) };
				}),
			}, {
				result: { kind: 'token', token },
				progress: ['issued'],
				requests: [{
					path: `/agents/environments/env-1/${action}`,
					query: { ...(action === 'reconnect' ? { client_id: 'client-1' } : {}), session_id: 'session-1' },
				}],
			});
		});

		test(`${action} preserves a waking response`, async () => {
			const progress: string[] = [];
			const observedRequest = { ...request, onRequest: (event: string) => progress.push(event) };
			const { service } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: () => jsonResponse({}, 202, { 'retry-after': '5' }),
			});

			const result = action === 'connect'
				? await service.connect(observedRequest, CancellationToken.None)
				: await service.reconnect(observedRequest, 'client-1', CancellationToken.None);

			assert.deepStrictEqual({ result, progress }, { result: { kind: 'waking', waking: { retryAfterSeconds: 5 } }, progress: ['issued', 'waking'] });
		});
	}

	test('preserves transport errors from environment reads without classifying them for connection retries', async () => {
		const failure = new Error('network unavailable');
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => { throw failure; },
		});
		await assert.rejects(service.getEnvironment(request.environmentId, CancellationToken.None), error => error === failure);
	});

	for (const header of [undefined, 'ABCD:1234:5678', 'ABCD:1234:5678:90AB:CDEF\ninjected', 'ghp_secret', 'A'.repeat(129), ['ABCD:1234:5678:90AB:CDEF', 'ABCD:1234:5678:90AB:CDEF']]) {
		test(`omits unavailable or invalid request IDs: ${JSON.stringify(header)}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const logService = new TestLogService();
			const { service } = createService(store, {
				tasks: [], repositories: new Map(), logService,
				onRequest: () => {
					const response = jsonResponse({ message: 'private response body' }, 500);
					response.res.headers['x-github-request-id'] = header;
					return response;
				},
			});
			await assert.rejects(service.connect({ environmentId: 'env-1' }, CancellationToken.None), {
				name: 'CloudSandboxRequestError',
				message: 'Mission Control connect failed: HTTP 500',
			});
			assert.deepStrictEqual(logService.errors, [
				'[CloudSandboxApi] connect failed: method=GET host=api.githubcopilot.com environmentId=env-1 sessionId=none clientId=none status=500 requestId=unavailable durationMs=0 retryAfterSeconds=none message=private response body',
			]);
		}));
	}

	test('rejects refreshed credentials for a different client', async () => {
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => jsonResponse(clientToken('client-2')),
		});

		await assert.rejects(
			service.reconnect(request, 'client-1', CancellationToken.None),
			/Cloud sandbox reconnect returned credentials for a different client/,
		);
	});

	test('parses a pending response with an HTTP-date Retry-After', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1) }, async () => {
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => jsonResponse({}, 202, { 'retry-after': new Date(Date.now() + 45_000).toUTCString() }),
		});
		assert.deepStrictEqual(await service.connect(request, CancellationToken.None), {
			kind: 'waking', waking: { retryAfterSeconds: 45 },
		});
	}));

	for (const statusCode of [401, 403, 404, 429, 503]) {
		test(`retains HTTP ${statusCode} and server pacing without automatically retrying a new connection`, async () => {
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: () => jsonResponse({}, statusCode, { 'retry-after': '45' }),
			});
			await assert.rejects(service.connect(request, CancellationToken.None), {
				name: 'CloudSandboxRequestError', statusCode, retryAfterSeconds: 45,
			});
			assert.strictEqual(requestedUrls.length, 1);
		});
	}
});

suite('Mission Control environment discovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('caches credential-free metadata and invalidates it when the account changes', async () => {
		const { service, requestedUrls, changeAuthentication } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: url => url.pathname.endsWith('/agents/environments') ? jsonResponse([{
				id: 'host', kind: 'user-local', name: 'Native host', status: 'online', webpubsub: { access_token: 'must-not-be-cached' },
			}]) : undefined,
		});
		const first = await service.listEnvironments(CancellationToken.None);
		assert.strictEqual(await service.listEnvironments(CancellationToken.None), first);
		assert.strictEqual(service.getCachedEnvironments(), first);
		assert.deepStrictEqual(first, [{ id: 'host', kind: 'user-local', name: 'Native host', status: 'online' }]);
		assert.strictEqual(requestedUrls.filter(url => url.endsWith('/agents/environments')).length, 1);
		changeAuthentication();
		assert.strictEqual(service.getCachedEnvironments(), undefined);
		await service.listEnvironments(CancellationToken.None);
		assert.strictEqual(requestedUrls.filter(url => url.endsWith('/agents/environments')).length, 2);
	});

	test('does not return expired cached inventory or fetch merely to read the cache', async () => {
		await runWithFakedTimers({}, async () => {
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: url => url.pathname.endsWith('/agents/environments') ? jsonResponse([]) : undefined,
			});
			const empty = service.getCachedEnvironments();
			await service.listEnvironments(CancellationToken.None);
			const cached = service.getCachedEnvironments();
			await timeout(60_000);
			assert.deepStrictEqual({
				empty, cached, expired: service.getCachedEnvironments(),
				requests: requestedUrls.filter(url => url.endsWith('/agents/environments')).length,
			}, { empty: undefined, cached: [], expired: undefined, requests: 1 });
		});
	});

	test('skips unusable metadata without hiding other valid environments or rejecting future statuses', async () => {
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: url => url.pathname.endsWith('/agents/environments') ? jsonResponse([
				{ id: 'invalid', name: 'Invalid host', kind: 'user-local' },
				{ id: 'host', name: 'Native host', kind: 'user-local', status: 'online' },
				{ id: 'managed', name: 'Managed host', kind: 'managed-sandbox', status: 'paused' },
			]) : undefined,
		});
		assert.deepStrictEqual(await service.listEnvironments(CancellationToken.None), [
			{ id: 'host', name: 'Native host', kind: 'user-local', status: 'online' },
			{ id: 'managed', name: 'Managed host', kind: 'managed-sandbox', status: 'paused' },
		]);
	});

	test('explicit inventory refresh observes a host started since the cached offline result', async () => {
		let status = 'offline';
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: url => url.pathname.endsWith('/agents/environments') ? jsonResponse([{ id: 'host', name: 'Native host', kind: 'user-local', status }]) : undefined,
		});
		assert.strictEqual((await service.listEnvironments(CancellationToken.None))[0].status, 'offline');
		status = 'online';
		assert.strictEqual((await service.listEnvironments(CancellationToken.None, { refresh: true }))[0].status, 'online');
	});

	test('explicit inventory refresh removes deleted environments from the API cache', async () => {
		let environments = [{ id: 'host', name: 'Native host', kind: 'user-local', status: 'online' }];
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: url => url.pathname.endsWith('/agents/environments') ? jsonResponse(environments) : undefined,
		});
		await service.listEnvironments(CancellationToken.None);
		environments = [];
		const refreshed = await service.listEnvironments(CancellationToken.None, { refresh: true });
		assert.deepStrictEqual({
			refreshed, cached: service.getCachedEnvironments(),
			requests: requestedUrls.filter(url => url.endsWith('/agents/environments')).length,
		}, { refreshed: [], cached: [], requests: 2 });
	});

	test('does not publish a late inventory from a previous account', async () => {
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<IRequestContext>();
		const { service, changeAuthentication } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: url => {
				if (url.pathname.endsWith('/agents/environments')) {
					started.complete();
					return response.p;
				}
				return undefined;
			},
		});
		const inventory = service.listEnvironments(CancellationToken.None);
		await started.p;
		changeAuthentication();
		response.complete(jsonResponse([{ id: 'host', kind: 'user-local', name: 'Old account', status: 'online' }]));
		await assert.rejects(inventory, CancellationError);
	});
});

suite('CloudSandboxApiService repository resolution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('distinguishes repo-less tasks from unresolved repository names', async () => {
		const { service } = createService(store, {
			tasks: [
				task('with-repository', 'Repository chat', 42, 'with-repository', 'environment-1'),
				task('without-repository', 'General chat', undefined, 'without-repository', 'environment-2'),
			],
			repositories: new Map([[42, 'error']]),
		});
		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual(result.kind === 'failed' ? result : result.sessions.map(session => ({
			id: session.sessionId, hasRepository: session.hasRepository, name: session.repoName,
		})), [
			{ id: 'with-repository', hasRepository: true, name: undefined },
			{ id: 'without-repository', hasRepository: false, name: undefined },
		]);
	});

	test('retains the repository scope when task payloads omit repository details', async () => {
		const current = { ...task('task-1', 'Chat', undefined, 'session-1', 'environment-1'), updated_at: '2026-07-01T00:01:00.000Z' };
		let hasRepository = true;
		const { service, requestedUrls } = createService(store, {
			tasks: [current],
			repositories: new Map(),
			onRequest: url => url.pathname.endsWith('/tasks')
				? jsonResponse({ tasks: url.searchParams.get('with_repo') === String(hasRepository) && url.searchParams.get('is_archived') === 'false' ? [current] : [] })
				: undefined,
		});
		const withRepository = await service.listSessions(CancellationToken.None);
		hasRepository = false;
		const withoutRepository = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			classifications: [withRepository, withoutRepository].map(result => result.kind === 'failed' ? result.reason : result.sessions.map(session => session.hasRepository)),
			detailReads: requestedUrls.filter(url => url.endsWith('/tasks/task-1')).length,
		}, { classifications: [[true], [false]], detailReads: 2 });
	});

	test('preserves the creating application from cloud task discovery', async () => {
		const { service } = createService(store, {
			tasks: [{ ...task('task-1', 'From Slack', undefined, 'session-1', 'environment-1'), event_type: 'slack' }],
			repositories: new Map(),
		});
		const result = await service.listSessions(CancellationToken.None);
		assert.deepStrictEqual(result.kind === 'failed' ? result : result.sessions.map(session => session.eventType), ['slack']);
	});

	test('preserves the bound session activity independently of the task state', async () => {
		const states = ['queued', 'in_progress', 'waiting_for_user', 'idle', 'completed', 'failed', 'timed_out', 'cancelled'];
		const { service } = createService(store, {
			tasks: states.map(state => ({
				...task(state, state, undefined, `session-${state}`, `environment-${state}`),
				state: 'idle',
				sessions: [{ id: `session-${state}`, environment_id: `environment-${state}`, state }],
			})),
			repositories: new Map(),
		});
		const result = await service.listSessions(CancellationToken.None);
		assert.deepStrictEqual(result.kind === 'failed' ? result : result.sessions.map(session => [session.name, session.status]), [
			['queued', SessionStatus.InProgress],
			['in_progress', SessionStatus.InProgress],
			['waiting_for_user', SessionStatus.InputNeeded],
			['idle', SessionStatus.Idle],
			['completed', SessionStatus.Idle],
			['failed', SessionStatus.Error],
			['timed_out', SessionStatus.Error],
			['cancelled', SessionStatus.Error],
		]);
	});

	test('resolves the repository name from its numeric id', async () => {
		const { service } = createService(store, {
			tasks: [task('task-1', 'Change port to 5555', 290012776, 'sess-1', 'env-1')],
			repositories: new Map([[290012776, { full_name: 'osortega/simple-server' }]]),
		});

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual(result, {
			kind: 'complete',
			sessions: [{
				environmentId: 'env-1',
				sessionId: 'sess-1',
				taskId: 'task-1',
				name: 'Change port to 5555',
				repoName: 'osortega/simple-server',
				hasRepository: true,
				updatedAt: undefined,
			}],
		});
	});

	test('retains activity in cached task details and refreshes it when an incremental scan changes the task', async () => {
		const current = {
			...task('activity-cache', 'Question', undefined, 'original-session', 'original-environment'),
			updated_at: '2026-07-01T00:01:00.000Z',
			state: 'in_progress',
			sessions: [{ id: 'original-session', environment_id: 'original-environment', state: 'waiting_for_user' }],
		};
		const h = createService(store, {
			tasks: [current],
			repositories: new Map(),
			discoveryDate: () => '2026-07-01T00:01:00.000Z',
		});
		const initial = await h.service.listSessions(CancellationToken.None);
		const cached = await h.service.listSessions(CancellationToken.None, { incremental: true });
		current.updated_at = '2026-07-01T00:02:00.000Z';
		current.sessions[0].state = 'completed';
		const refreshed = await h.service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			statuses: [initial, cached, refreshed].map(result => result.kind === 'failed' ? result.reason : result.sessions.map(session => session.status)),
			detailReads: h.requestedUrls.filter(url => url.endsWith('/tasks/activity-cache')).length,
		}, {
			statuses: [[SessionStatus.InputNeeded], [SessionStatus.InputNeeded], [SessionStatus.Idle]],
			detailReads: 2,
		});
	});

	test('propagates task-list cancellation without error logging', async () => {
		const logService = new TestLogService();
		const { service } = createService(store, {
			tasks: [],
			repositories: new Map(),
			requestError: new CancellationError(),
			logService,
		});

		await assert.rejects(() => service.listSessions(CancellationToken.None), error => isCancellationError(error));
		assert.deepStrictEqual({
			cancelledTraces: logService.traces.filter(message => message.includes(' -> cancelled')).length,
			errors: logService.errors,
		}, {
			cancelledTraces: 1,
			errors: [],
		});
	});

	test('does not start discovery reads when already cancelled', async () => {
		const logService = new TestLogService();
		const cancellation = store.add(new CancellationTokenSource());
		cancellation.cancel();
		const { service } = createService(store, {
			tasks: [],
			repositories: new Map(),
			requestError: new Error('transport stopped'),
			logService,
		});

		await assert.rejects(() => service.listSessions(cancellation.token), error => isCancellationError(error));
		assert.deepStrictEqual({
			cancelledTraces: logService.traces.filter(message => message.includes(' -> cancelled')).length,
			errors: logService.errors,
		}, {
			cancelledTraces: 0,
			errors: [],
		});
	});

	test('resolves each repository once across a whole discovery pass', async () => {
		// Tasks resolve concurrently, so the in-flight promise must be shared, not just the result.
		const { service, requestedUrls } = createService(store, {
			tasks: [
				task('task-1', 'a', 290012776, 'sess-1', 'env-1'),
				task('task-2', 'b', 290012776, 'sess-2', 'env-2'),
				task('task-3', 'c', 999, 'sess-3', 'env-3'),
			],
			repositories: new Map<number, { full_name?: string }>([
				[290012776, { full_name: 'osortega/simple-server' }],
				[999, { full_name: 'osortega/other' }],
			]),
		});

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			names: result.kind === 'failed' ? [] : result.sessions.map(s => s.repoName),
			repoLookups: requestedUrls.filter(u => /\/repositories\//.test(u)).length,
		}, {
			names: ['osortega/simple-server', 'osortega/simple-server', 'osortega/other'],
			repoLookups: 2,
		});
	});

	test('a failed lookup leaves every sharing session discoverable and is retried next pass', async () => {
		// Two tasks on the same failing repository: they share one memoized promise, and if it
		// rejects the callers that receive it drop their sessions from the listing entirely.
		const repositories = new Map<number, { full_name?: string } | 'error'>([[290012776, 'error']]);
		const { service, requestedUrls } = createService(store, {
			tasks: [
				task('task-1', 'Change port to 5555', 290012776, 'sess-1', 'env-1'),
				task('task-2', 'hi', 290012776, 'sess-2', 'env-2'),
			],
			repositories,
		});

		const first = await service.listSessions(CancellationToken.None);
		repositories.set(290012776, { full_name: 'osortega/simple-server' });
		const second = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			// `complete`, not `partial`: the sessions resolved fine, only their label did not.
			firstKind: first.kind,
			firstSessions: first.kind === 'failed' ? [] : first.sessions.map(s => s.sessionId),
			firstNames: first.kind === 'failed' ? [] : first.sessions.map(s => s.repoName),
			secondNames: second.kind === 'failed' ? [] : second.sessions.map(s => s.repoName),
			repoLookups: requestedUrls.filter(u => /\/repositories\//.test(u)).length,
		}, {
			firstKind: 'complete',
			firstSessions: ['sess-1', 'sess-2'],
			firstNames: [undefined, undefined],
			secondNames: ['osortega/simple-server', 'osortega/simple-server'],
			// One per pass: the failure is evicted so the second pass retries, but neither pass
			// issues a second lookup for the task that shares the repository.
			repoLookups: 2,
		});
	});

	test('scans past the first page and stays complete', async () => {
		// A full first page means there may be more; a sandbox task on the second must be found.
		const filler = Array.from({ length: 100 }, (_, i) => task(`filler-${i}`, 'x', undefined, `fs-${i}`, `fe-${i}`));
		const { service, requestedUrls } = createService(store, {
			tasks: [...filler, task('task-old', 'older sandbox', undefined, 'sess-old', 'env-old')],
			repositories: new Map(),
		});

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			kind: result.kind,
			found: result.kind === 'failed' ? [] : result.sessions.filter(s => s.sessionId === 'sess-old').map(s => s.sessionId),
			listPages: requestedUrls.filter(u => /[?&]per_page=/.test(u)).length,
		}, {
			kind: 'complete',
			found: ['sess-old'],
			listPages: 5,
		});
	});

	test('follows the Link header past a short page', async () => {
		// Mission Control can return fewer rows than asked for and still advertise a next page, so
		// page length must not be used to detect the end.
		const { service, requestedUrls } = createService(store, {
			tasks: [task('task-old', 'older sandbox', undefined, 'sess-old', 'env-old')],
			repositories: new Map(),
			shortFirstPage: true,
		});

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			kind: result.kind,
			found: result.kind === 'failed' ? [] : result.sessions.map(s => s.sessionId),
			listPages: requestedUrls.filter(u => /[?&]per_page=/.test(u)).length,
		}, {
			kind: 'complete',
			found: ['sess-old'],
			listPages: 5,
		});
	});

	test('a truncated scan is partial, so callers do not reconcile against it', async () => {
		// Every page comes back full, so the page ceiling is hit with tasks still unscanned.
		// Reporting `complete` here would let the caller tear down sessions it simply never saw.
		const tasks = Array.from({ length: 100 * 12 }, (_, i) => task(`t-${i}`, 'x', undefined, `s-${i}`, `e-${i}`));
		const { service, requestedUrls } = createService(store, { tasks, repositories: new Map() });

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			kind: result.kind,
			sessions: result.kind === 'failed' ? -1 : result.sessions.length,
			listPages: requestedUrls.filter(u => /[?&]per_page=/.test(u)).length,
		}, {
			kind: 'partial',
			sessions: 1000,
			listPages: 13,
		});
	});
});

suite('CloudSandboxApiService discovery logs', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('logs only discovered sessions with their identity and display metadata', async () => {
		const logService = new TestLogService();
		const bound = {
			...task('bound', 'Work on repository', 42, 'session-1', 'env-1'),
			updated_at: '2026-09-22T10:00:00Z',
			state: 'idle',
			sessions: [{ id: 'session-1', environment_id: 'env-1', state: 'waiting_for_user', ahp_resource_uri: 'ahp-session:/session-1' }],
			prompt: 'not-for-logs',
		};
		const { service } = createService(store, {
			tasks: [
				bound,
				{ ...task('archived', 'Old task', undefined, 'session-2', 'env-2'), archived_at: '2026-09-21T10:00:00Z' },
				{ ...task('different-agent', 'Other agent', undefined, 'session-3', 'env-3'), agent_collaborators: [{ slug: 'other' }] },
				{ ...task('unbound', 'Not ready', undefined, 'session-4', 'env-4'), sessions: [] },
			],
			repositories: new Map([[42, { full_name: 'owner/repository' }]]),
			logService,
		});

		await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			sessions: logService.debugs,
			info: logService.infos.filter(message => message.includes('Discovered sandbox session ')),
			exposedPrompt: [...logService.infos, ...logService.debugs].some(message => message.includes('not-for-logs')),
		}, {
			sessions: [`[CloudSandboxApi] Discovered sandbox session ${JSON.stringify({
				taskId: 'bound', sessionId: 'session-1', environmentId: 'env-1',
				name: 'Work on repository', repoName: 'owner/repository',
				updatedAt: bound.updated_at, status: SessionStatus.InputNeeded,
			})}`, `[CloudSandboxApi] Discovered sandbox session ${JSON.stringify({
				taskId: 'archived', sessionId: 'session-2', environmentId: 'env-2', name: 'Old task',
			})}`],
			info: [],
			exposedPrompt: false,
		});
	});
});

suite('CloudSandboxApiService discovery account', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves a credential-free account key without issuing HTTP requests', async () => {
		const { service, requestedUrls } = createService(store, { tasks: [], repositories: new Map() });

		assert.deepStrictEqual({ accountKey: await service.getAccountKey(), requestedUrls }, {
			accountKey: '["github","a"]', requestedUrls: [],
		});
	});

	test('uses the same narrowest eligible authentication session as task requests', async () => {
		const scopes = ['read:user', 'user:email', 'repo', 'workflow'];
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async requestedScopes => requestedScopes ? [] : [
				{ id: 'wide-session', accessToken: 'wide-token', account: { id: 'wide', label: 'Wide' }, scopes: [...scopes, 'gist'] },
				{ id: 'narrow-session', accessToken: 'narrow-token', account: { id: 'narrow', label: 'Narrow' }, scopes },
			],
		});

		assert.strictEqual(await service.getAccountKey(), '["github","narrow"]');
	});

	test('announces sign-out after authentication changes', async () => {
		const { service, changeAuthentication } = createService(store, {
			tasks: [], repositories: new Map(), authenticationSessions: async () => [],
		});
		const changed = Event.toPromise(service.onDidChangeAccount);
		changeAuthentication();

		assert.deepStrictEqual([await service.getAccountKey(), await changed], [undefined, undefined]);
	});

	test('does not mistake a failed authentication lookup for signing out', async () => {
		const { service, changeAuthentication } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => { throw new Error('provider temporarily unavailable'); },
		});
		const changes: (string | undefined)[] = [];
		store.add(service.onDidChangeAccount(account => changes.push(account)));
		changeAuthentication();
		await assert.rejects(service.getAccountKey(), /requires a signed-in GitHub account/);

		assert.deepStrictEqual(changes, []);
	});

	test('rejects an account lookup overtaken by an authentication change', async () => {
		const pending = new DeferredPromise<readonly AuthenticationSession[]>();
		let hold = true;
		const { service, changeAuthentication } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => hold ? pending.p : [],
		});
		const oldAccount = service.getAccountKey();
		const rejected = assert.rejects(oldAccount, isCancellationError);
		hold = false;
		changeAuthentication();
		await pending.complete([{ id: 'old-session', accessToken: 'old-token', account: { id: 'old', label: 'Old' }, scopes: [] }]);
		await rejected;
	});
});

suite('CloudSandboxApiService stalled sandbox discovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const startTime = Date.UTC(2026, 8, 30, 12);
	const oneHour = 60 * 60_000;

	function unstartedTask(id: string, createdAt = startTime - oneHour, ahpResourceUri?: string) {
		const created = new Date(createdAt).toISOString();
		return {
			...task(id, 'New remote session', undefined, `session-${id}`, `env-${id}`),
			state: 'queued',
			updated_at: created,
			sessions: [{
				id: `session-${id}`,
				environment_id: `env-${id}`,
				state: 'queued',
				created_at: created,
				updated_at: created,
				ahp_resource_uri: ahpResourceUri,
			}],
		};
	}

	for (const age of [0, oneHour - 1, oneHour, oneHour + 1]) {
		test(`only hides an unchanged queued default title after one hour (age=${age}ms)`, () => runWithFakedTimers({ useFakeTimers: true, startTime }, async () => {
			const { service, requestedUrls } = createService(store, {
				tasks: [unstartedTask('stalled', startTime - age)], repositories: new Map(),
			});

			const result = await service.listSessions(CancellationToken.None);

			assert.deepStrictEqual({
				kind: result.kind,
				sessions: result.kind === 'failed' ? result.reason : result.sessions.map(session => session.taskId),
				requests: requestedUrls.map(url => new URL(url).pathname),
			}, {
				kind: 'complete',
				sessions: age >= oneHour ? [] : ['stalled'],
				requests: ['/agents/tasks', '/agents/tasks', '/agents/tasks', '/agents/tasks', '/agents/tasks/stalled'],
			});
		}));
	}

	test('keeps sessions with progress, another title, or incomplete evidence', () => runWithFakedTimers({ useFakeTimers: true, startTime }, async () => {
		const base = unstartedTask('base');
		const session = base.sessions[0];
		const tasks = [
			{ ...base, id: 'named', name: 'Work on my repository' },
			{ ...base, id: 'task-running', state: 'in_progress' },
			{ ...base, id: 'task-idle', state: 'idle' },
			{ ...base, id: 'task-unknown', state: undefined },
			{ ...base, id: 'session-running', sessions: [{ ...session, state: 'in_progress' }] },
			{ ...base, id: 'session-unknown', sessions: [{ ...session, state: undefined }] },
			{ ...base, id: 'ahp-resource', sessions: [{ ...session, ahp_resource_uri: 'ahp-session:/started' }] },
			{ ...base, id: 'updated', sessions: [{ ...session, updated_at: new Date(startTime - oneHour + 1).toISOString() }] },
			{ ...base, id: 'missing-created', sessions: [{ ...session, created_at: undefined }] },
			{ ...base, id: 'missing-updated', sessions: [{ ...session, updated_at: undefined }] },
			{ ...base, id: 'invalid-dates', sessions: [{ ...session, created_at: 'invalid', updated_at: 'invalid' }] },
			unstartedTask('future', startTime + 1),
			{ ...base, id: 'multiple-sessions', sessions: [session, { ...session, id: 'second', state: 'idle' }] },
		];
		const { service } = createService(store, { tasks, repositories: new Map() });

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual(result.kind === 'failed' ? result : result.sessions.map(session => session.taskId), tasks.map(task => task.id));
	}));

	test('reevaluates cached candidates outside the incremental window when they reach the cutoff without fetching details again', () => runWithFakedTimers({ useFakeTimers: true, startTime }, async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [unstartedTask('stalled', startTime - oneHour + 1_000)], repositories: new Map(),
		});
		const initial = await service.listSessions(CancellationToken.None);
		const cached = await service.listSessions(CancellationToken.None, { incremental: true });
		await timeout(1_000);
		const expired = await service.listSessions(CancellationToken.None, { incremental: true });
		const stillExpired = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			visible: [initial, cached].map(result => result.kind === 'failed' ? result.reason : result.sessions.map(session => session.taskId)),
			expired,
			stillExpired,
			detailReads: requestedUrls.filter(url => url.endsWith('/tasks/stalled')).length,
		}, {
			visible: [['stalled'], ['stalled']],
			expired: { kind: 'incremental', sessions: [], removedTaskIds: ['stalled'] },
			stillExpired: { kind: 'incremental', sessions: [], removedTaskIds: ['stalled'] },
			detailReads: 1,
		});
	}));

	test('uses the server clock for the cutoff and falls back to local time when Date is unavailable', () => runWithFakedTimers({ useFakeTimers: true, startTime }, async () => {
		const results = [];
		for (const date of [new Date(startTime - 1_000).toUTCString(), '']) {
			const { service } = createService(store, {
				tasks: [unstartedTask('stalled')], repositories: new Map(), discoveryDate: () => date,
			});
			const result = await service.listSessions(CancellationToken.None);
			results.push(result.kind === 'failed' ? result.reason : result.sessions.map(session => session.taskId));
		}
		assert.deepStrictEqual(results, [['stalled'], []]);
	}));

	for (const truncation of ['scope failure', 'page failure', 'page limit']) {
		for (const observed of [false, true]) {
			test(`only removes observed candidates during ${truncation} (observed=${observed})`, () => runWithFakedTimers({ useFakeTimers: true, startTime }, async () => {
				const current = { ...unstartedTask('stalled', startTime - oneHour + 1_000), repository: observed ? { id: 123 } : undefined };
				const other = {
					...task('other', 'Work', 123, 'other-session', 'other-environment'),
					updated_at: new Date(startTime - oneHour).toISOString(),
				};
				let truncate = false;
				const { service, requestedUrls } = createService(store, {
					tasks: [current, other], repositories: new Map([[123, { full_name: 'owner/repo' }]]),
					onRequest: url => {
						if (!truncate || url.pathname !== '/agents/tasks') {
							return undefined;
						}
						if (url.searchParams.get('with_repo') === 'true') {
							return jsonResponse({ tasks: observed ? [other, current] : [other] });
						}
						if (truncation === 'scope failure' || (truncation === 'page failure' && url.searchParams.get('page') === '2')) {
							return jsonResponse({}, 503);
						}
						return jsonResponse({ tasks: [] }, 200, { link: '<https://api.githubcopilot.com/agents/tasks?page=2>; rel="next"' });
					},
				});
				await service.listSessions(CancellationToken.None);
				await timeout(1_000);
				if (!observed) {
					current.updated_at = new Date(startTime + 1_000).toISOString();
					current.state = 'idle';
					current.sessions[0].state = 'idle';
					current.sessions[0].updated_at = current.updated_at;
					current.sessions[0].ahp_resource_uri = 'ahp-session:/started';
				}
				truncate = true;
				const partial = await service.listSessions(CancellationToken.None, { incremental: true });
				const partialDetailReads = requestedUrls.filter(url => url.endsWith('/tasks/stalled')).length;
				truncate = false;
				const recovered = await service.listSessions(CancellationToken.None, { incremental: true });

				assert.deepStrictEqual({
					partial: partial.kind === 'failed' ? partial : {
						kind: partial.kind,
						sessions: partial.sessions.map(session => session.taskId),
						removedTaskIds: partial.kind === 'complete' ? [] : partial.removedTaskIds,
					},
					partialDetailReads,
					recovered: recovered.kind === 'failed' ? recovered : {
						kind: recovered.kind,
						sessions: recovered.sessions.map(session => [session.taskId, session.status]),
						removedTaskIds: recovered.kind === 'complete' ? [] : recovered.removedTaskIds,
					},
				}, {
					partial: { kind: 'partial', sessions: ['other'], removedTaskIds: observed ? ['stalled'] : [] },
					partialDetailReads: 1,
					recovered: {
						kind: 'incremental',
						sessions: observed ? [] : [['stalled', SessionStatus.Idle]],
						removedTaskIds: observed ? ['stalled'] : [],
					},
				});
			}));
		}
	}

	test('restores a hidden task when discovery reports that its session started', () => runWithFakedTimers({ useFakeTimers: true, startTime }, async () => {
		const current = unstartedTask('stalled');
		const { service, requestedUrls } = createService(store, { tasks: [current], repositories: new Map() });
		const initial = await service.listSessions(CancellationToken.None);
		current.updated_at = new Date(startTime).toISOString();
		current.state = 'idle';
		current.sessions[0].state = 'idle';
		current.sessions[0].updated_at = current.updated_at;
		current.sessions[0].ahp_resource_uri = 'ahp-session:/started';

		const recovered = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			initial,
			kind: recovered.kind,
			sessions: recovered.kind === 'failed' ? recovered.reason : recovered.sessions.map(session => [session.taskId, session.status]),
			detailReads: requestedUrls.filter(url => url.endsWith('/tasks/stalled')).length,
		}, {
			initial: { kind: 'complete', sessions: [] },
			kind: 'incremental',
			sessions: [['stalled', SessionStatus.Idle]],
			detailReads: 2,
		});
	}));

	test('reports filtered tasks as explicit removals even when another detail fetch leaves discovery partial', () => runWithFakedTimers({ useFakeTimers: true, startTime }, async () => {
		const { service } = createService(store, {
			tasks: [unstartedTask('stalled'), task('unresolved', 'Work', undefined, 'other-session', 'other-environment')],
			repositories: new Map(),
			onRequest: url => url.pathname.endsWith('/tasks/unresolved') ? jsonResponse({}, 503) : undefined,
		});

		assert.deepStrictEqual(await service.listSessions(CancellationToken.None), {
			kind: 'partial', sessions: [], removedTaskIds: ['stalled'],
		});
	}));
});

suite('CloudSandboxApiService incremental discovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const firstScanDate = 'Tue, 22 Sep 2026 10:00:00 GMT';
	const checkpoint = '2026-09-22T09:59:00.000Z';

	function updatedTask(id: string, updatedAt = '2026-09-22T09:58:00Z', repositoryId?: number): ITestTask {
		return { ...task(id, id, repositoryId, `session-${id}`, `env-${id}`), updated_at: updatedAt };
	}

	test('queries both repository and archive scopes and resolves no task details when nothing changed', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [updatedTask('old')],
			repositories: new Map(),
			discoveryDate: () => firstScanDate,
		});
		await service.listSessions(CancellationToken.None);
		requestedUrls.length = 0;

		const result = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			result,
			queries: requestedUrls.map(url => Object.fromEntries(new URL(url).searchParams)),
		}, {
			result: { kind: 'incremental', sessions: [], removedTaskIds: [] },
			queries: [false, true].flatMap(archived => [true, false].map(withRepository => ({
				per_page: '100', page: '1', sort: 'updated_at', direction: 'desc',
				with_repo: String(withRepository), is_archived: String(archived), since: checkpoint, include_environment_kinds: 'managed-sandbox',
			}))),
		});
	});

	test('reuses unchanged details in the overlap and fetches new and changed tasks', async () => {
		const tasks = [updatedTask('unchanged', checkpoint), updatedTask('changed', checkpoint)];
		const { service, requestedUrls } = createService(store, {
			tasks, repositories: new Map(), discoveryDate: () => firstScanDate,
		});
		await service.listSessions(CancellationToken.None);
		tasks[1] = { ...tasks[1], name: 'Changed elsewhere', updated_at: '2026-09-22T10:00:00Z' };
		tasks.push(updatedTask('new', '2026-09-22T10:00:00Z'));
		requestedUrls.length = 0;

		const result = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			kind: result.kind,
			names: result.kind === 'failed' ? [] : result.sessions.map(session => session.name),
			details: requestedUrls.filter(url => new URL(url).pathname.startsWith('/agents/tasks/')).map(url => new URL(url).pathname),
		}, {
			kind: 'incremental',
			names: ['unchanged', 'Changed elsewhere', 'new'],
			details: ['/agents/tasks/changed', '/agents/tasks/new'],
		});
	});

	test('uses task timestamps when the browser cannot read the response Date header', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [updatedTask('old')], repositories: new Map(), discoveryDate: () => '',
		});
		await service.listSessions(CancellationToken.None);
		requestedUrls.length = 0;
		const result = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			kind: result.kind,
			since: new URL(requestedUrls[0]).searchParams.get('since'),
			requests: requestedUrls.length,
		}, { kind: 'incremental', since: '2026-09-22T09:57:00.000Z', requests: 4 });
	});

	test('preserves incremental filters on every page even when pagination links omit them', async () => {
		const tasks: ITestTask[] = [];
		const { service, requestedUrls } = createService(store, {
			tasks, repositories: new Map(), discoveryDate: () => firstScanDate,
		});
		await service.listSessions(CancellationToken.None);
		tasks.push(...Array.from({ length: 101 }, (_, i) => updatedTask(`new-${i}`, checkpoint)));
		requestedUrls.length = 0;

		const result = await service.listSessions(CancellationToken.None, { incremental: true });
		const queries = requestedUrls.filter(url => new URL(url).pathname === '/agents/tasks').map(url => new URL(url).searchParams);

		assert.deepStrictEqual({
			kind: result.kind,
			count: result.kind === 'failed' ? 0 : result.sessions.length,
			pages: queries.map(query => [query.get('with_repo'), query.get('is_archived'), query.get('page')]),
			retainedFilters: queries.every(query => query.get('since') === checkpoint && query.get('include_environment_kinds') === 'managed-sandbox'),
		}, {
			kind: 'incremental', count: 101,
			pages: [['true', 'false', '1'], ['false', 'false', '1'], ['false', 'false', '2'], ['true', 'true', '1'], ['false', 'true', '1']],
			retainedFilters: true,
		});
	});

	test('discovers task archives and unarchives without removing their sessions', async () => {
		const tasks = [updatedTask('first')];
		const { service, requestedUrls } = createService(store, {
			tasks, repositories: new Map(), discoveryDate: () => firstScanDate,
		});
		await service.listSessions(CancellationToken.None);
		tasks[0] = { ...tasks[0], archived_at: checkpoint, updated_at: checkpoint };
		requestedUrls.length = 0;
		const archived = await service.listSessions(CancellationToken.None, { incremental: true });
		const archivedRequests = requestedUrls.length;
		tasks[0] = { ...tasks[0], archived_at: undefined };
		const unarchived = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			archived: archived.kind === 'failed' ? archived : { kind: archived.kind, sessions: archived.sessions.map(session => [session.taskId, session.isArchived]), removedTaskIds: archived.kind === 'incremental' ? archived.removedTaskIds : [] },
			archivedRequests,
			unarchived: unarchived.kind === 'failed' ? [] : unarchived.sessions.map(session => [session.taskId, session.isArchived]),
			detailFetches: requestedUrls.filter(url => url.endsWith('/tasks/first')).length,
		}, {
			archived: { kind: 'incremental', sessions: [['first', true]], removedTaskIds: [] },
			archivedRequests: 5,
			unarchived: [['first', undefined]],
			detailFetches: 2,
		});
	});

	test('removes a previously discovered task when its environment binding disappears', async () => {
		const tasks = [updatedTask('first')];
		const { service } = createService(store, {
			tasks, repositories: new Map(), discoveryDate: () => firstScanDate,
		});
		await service.listSessions(CancellationToken.None);
		tasks[0] = { ...updatedTask('first', checkpoint), sessions: [] };

		const removed = await service.listSessions(CancellationToken.None, { incremental: true });
		const stillUnbound = await service.listSessions(CancellationToken.None, { incremental: true });
		tasks[0] = updatedTask('first', checkpoint);
		const rebound = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			removed,
			stillUnbound,
			rebound: rebound.kind === 'failed' ? [] : rebound.sessions.map(session => session.taskId),
		}, {
			removed: { kind: 'incremental', sessions: [], removedTaskIds: ['first'] },
			stillUnbound: { kind: 'incremental', sessions: [], removedTaskIds: [] },
			rebound: ['first'],
		});
	});

	test('retains a failed task until retry confirms its binding disappeared, even outside the discovery window', async () => {
		const tasks = [updatedTask('first')];
		let failDetail = false;
		let omitFromList = false;
		const { service } = createService(store, {
			tasks, repositories: new Map(), discoveryDate: () => firstScanDate,
			onRequest: url => {
				if (failDetail && url.pathname.endsWith('/tasks/first')) {
					return jsonResponse({}, 500);
				}
				if (omitFromList && url.pathname.endsWith('/tasks')) {
					return jsonResponse({ tasks: [] }, 200, { date: firstScanDate });
				}
				return undefined;
			},
		});
		await service.listSessions(CancellationToken.None);
		tasks[0] = { ...updatedTask('first', checkpoint), sessions: [] };
		failDetail = true;
		const failed = await service.listSessions(CancellationToken.None, { incremental: true });
		failDetail = false;
		omitFromList = true;
		const retried = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({ failed, retried }, {
			failed: { kind: 'partial', sessions: [], removedTaskIds: [] },
			retried: { kind: 'incremental', sessions: [], removedTaskIds: ['first'] },
		});
	});

	test('does not advance the checkpoint past an unresolved task', async () => {
		const tasks: ITestTask[] = [];
		let failing = false;
		let date = firstScanDate;
		const { service, requestedUrls } = createService(store, {
			tasks, repositories: new Map(), discoveryDate: () => date,
			onRequest: url => failing && url.pathname.endsWith('/tasks/new') ? jsonResponse({}, 500) : undefined,
		});
		await service.listSessions(CancellationToken.None);
		tasks.push(updatedTask('new', checkpoint));
		date = 'Tue, 22 Sep 2026 10:05:00 GMT';
		failing = true;
		const partial = await service.listSessions(CancellationToken.None, { incremental: true });
		failing = false;
		requestedUrls.length = 0;
		const recovered = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			firstKind: partial.kind,
			recovered: recovered.kind === 'failed' ? [] : recovered.sessions.map(session => session.taskId),
			since: new URL(requestedUrls[0]).searchParams.get('since'),
		}, { firstKind: 'partial', recovered: ['new'], since: checkpoint });
	});

	test('does not advance the checkpoint after a later list page fails', async () => {
		const tasks: ITestTask[] = [];
		let failSecondPage = false;
		let date = firstScanDate;
		const { service, requestedUrls } = createService(store, {
			tasks, repositories: new Map(), discoveryDate: () => date,
			onRequest: url => failSecondPage && url.searchParams.get('page') === '2' ? jsonResponse({}, 500) : undefined,
		});
		await service.listSessions(CancellationToken.None);
		tasks.push(...Array.from({ length: 101 }, (_, i) => updatedTask(`new-${i}`, checkpoint)));
		date = 'Tue, 22 Sep 2026 10:05:00 GMT';
		failSecondPage = true;
		const partial = await service.listSessions(CancellationToken.None, { incremental: true });
		failSecondPage = false;
		requestedUrls.length = 0;
		const recovered = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			firstKind: partial.kind,
			recovered: recovered.kind === 'failed' ? 0 : recovered.sessions.length,
			since: new URL(requestedUrls[0]).searchParams.get('since'),
			details: requestedUrls.filter(url => new URL(url).pathname.startsWith('/agents/tasks/')).length,
		}, { firstKind: 'partial', recovered: 101, since: checkpoint, details: 1 });
	});

	test('retries missing bindings and repository names even if the task falls outside the incremental window', async () => {
		const tasks = [updatedTask('binding'), updatedTask('repository', undefined, 42)];
		tasks[0] = { ...tasks[0], sessions: [] };
		const repositories = new Map<number, { full_name?: string } | 'error'>([[42, 'error']]);
		const { service, requestedUrls } = createService(store, {
			tasks, repositories, discoveryDate: () => firstScanDate,
		});
		await service.listSessions(CancellationToken.None);
		tasks[0] = updatedTask('binding');
		repositories.set(42, { full_name: 'owner/repository' });
		requestedUrls.length = 0;

		const result = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			sessions: result.kind === 'failed' ? [] : result.sessions.map(session => [session.taskId, session.repoName]),
			details: requestedUrls.filter(url => new URL(url).pathname.startsWith('/agents/tasks/')).map(url => new URL(url).pathname),
		}, {
			sessions: [['binding', undefined], ['repository', 'owner/repository']],
			details: ['/agents/tasks/binding'],
		});
	});

	test('full reconciliation includes repository-less tasks and tasks missing environment metadata', async () => {
		const tasks = [updatedTask('repository', undefined, 42), { ...updatedTask('without-metadata'), current_environment: undefined }];
		const { service, requestedUrls } = createService(store, {
			tasks, repositories: new Map([[42, { full_name: 'owner/repository' }]]), discoveryDate: () => firstScanDate,
		});
		const full = await service.listSessions(CancellationToken.None);
		tasks.pop();
		await service.listSessions(CancellationToken.None);
		tasks.push({ ...updatedTask('without-metadata'), current_environment: undefined });
		requestedUrls.length = 0;
		const restored = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			initial: full.kind === 'failed' ? [] : full.sessions.map(session => session.taskId),
			restored: restored.kind === 'failed' ? [] : restored.sessions.map(session => session.taskId),
			details: requestedUrls.filter(url => new URL(url).pathname.startsWith('/agents/tasks/')).map(url => new URL(url).pathname),
			broad: requestedUrls.every(url => !new URL(url).searchParams.has('include_environment_kinds')),
		}, {
			initial: ['repository', 'without-metadata'], restored: ['repository', 'without-metadata'],
			details: ['/agents/tasks/without-metadata'], broad: true,
		});
	});

	test('cancellation does not publish a checkpoint or cache partly resolved tasks', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		let cancel = true;
		const { service, requestedUrls } = createService(store, {
			tasks: [updatedTask('old')], repositories: new Map(), discoveryDate: () => firstScanDate,
			onRequest: url => {
				if (cancel && url.pathname.endsWith('/tasks/old')) {
					cancellation.cancel();
				}
				return undefined;
			},
		});
		await assert.rejects(service.listSessions(cancellation.token), isCancellationError);
		cancel = false;
		requestedUrls.length = 0;
		const result = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			kind: result.kind,
			since: new URL(requestedUrls[0]).searchParams.get('since'),
			detailFetches: requestedUrls.filter(url => url.endsWith('/tasks/old')).length,
		}, { kind: 'complete', since: null, detailFetches: 1 });
	});

	test('authentication changes invalidate cached tasks and the incremental checkpoint', async () => {
		const tasks = [updatedTask('old')];
		const response = new DeferredPromise<IRequestContext>();
		let paused = false;
		const { service, requestedUrls, changeAuthentication } = createService(store, {
			tasks, repositories: new Map(), discoveryDate: () => firstScanDate,
			onRequest: url => paused && url.pathname.endsWith('/tasks/new') ? response.p : undefined,
		});
		await service.listSessions(CancellationToken.None);
		tasks.push(updatedTask('new', checkpoint));
		paused = true;
		const inFlight = service.listSessions(CancellationToken.None, { incremental: true });
		changeAuthentication();
		await response.complete(jsonResponse(tasks[1]));
		const stale = await inFlight;
		paused = false;
		requestedUrls.length = 0;
		const refreshed = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			staleKind: stale.kind,
			refreshedKind: refreshed.kind,
			since: new URL(requestedUrls[0]).searchParams.get('since'),
			details: requestedUrls.filter(url => new URL(url).pathname.startsWith('/agents/tasks/')).length,
		}, { staleKind: 'failed', refreshedKind: 'complete', since: null, details: 2 });
	});
});

suite('CloudSandboxApiService discovery rate limiting', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves tasks in bounded batches rather than all at once', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Fanning out over every task at once is what trips the rate limit: a user with dozens of
		// sandbox tasks issued dozens of simultaneous requests, and each rejection dropped a
		// session from the pass.
		const tasks = Array.from({ length: 30 }, (_, i) => task(`t-${i}`, 'x', undefined, `s-${i}`, `e-${i}`));
		const { service, concurrency } = createService(store, { tasks, repositories: new Map(), taskFetchDelayMs: 10 });

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			kind: result.kind,
			sessions: result.kind === 'failed' ? -1 : result.sessions.length,
			peakConcurrency: concurrency.max,
		}, {
			kind: 'complete',
			sessions: 30,
			peakConcurrency: 5,
		});
	}));

	test('retries a rate-limited task fetch instead of dropping its session', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// A 429 that is merely reported loses the session for the life of the window, because
		// nothing re-runs a pass that otherwise succeeded.
		const { service } = createService(store, {
			tasks: [
				task('task-1', 'kept', undefined, 'sess-1', 'env-1'),
				task('task-2', 'also kept', undefined, 'sess-2', 'env-2'),
			],
			repositories: new Map(),
			rateLimitedTaskFetches: new Map([['task-1', 2]]),
			retryAfterSeconds: 1,
		});

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			// `complete`, not `partial`: the retry resolved it, so nothing was left unresolved.
			kind: result.kind,
			sessions: result.kind === 'failed' ? [] : result.sessions.map(s => s.sessionId).sort(),
		}, {
			kind: 'complete',
			sessions: ['sess-1', 'sess-2'],
		});
	}));

	test('retries a rate-limited task list rather than failing the whole pass', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Page one failing is fatal — it returns `failed`, which seeds nothing and leaves the
		// sessions list empty until something else triggers discovery.
		const { service } = createService(store, {
			tasks: [task('task-1', 'kept', undefined, 'sess-1', 'env-1')],
			repositories: new Map(),
			rateLimitedListPages: 2,
		});

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			kind: result.kind,
			sessions: result.kind === 'failed' ? [] : result.sessions.map(s => s.sessionId),
		}, {
			kind: 'complete',
			sessions: ['sess-1'],
		});
	}));

	test('waits out a long Retry-After rather than re-issuing inside the window the server asked for', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Trimming a server delay to fit a local cap re-issues the request while the server is
		// still refusing it: every retry earns another 429, the session is dropped anyway, and the
		// rate limit that caused it gets fed. A delay that does not fit the budget must end the
		// retries instead, leaving the scan `partial` for a later pass to pick up.
		const { service, requestedUrls } = createService(store, {
			tasks: [
				task('task-1', 'deferred', undefined, 'sess-1', 'env-1'),
				task('task-2', 'kept', undefined, 'sess-2', 'env-2'),
			],
			repositories: new Map(),
			rateLimitedTaskFetches: new Map([['task-1', 1]]),
			retryAfterSeconds: 60,
		});

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			kind: result.kind,
			sessions: result.kind === 'failed' ? [] : result.sessions.map(s => s.sessionId),
			// One attempt only: a 60s wait exceeds the budget, so it is not retried early.
			taskOneAttempts: requestedUrls.filter(u => u.endsWith('/tasks/task-1')).length,
		}, {
			kind: 'partial',
			sessions: ['sess-2'],
			taskOneAttempts: 1,
		});
	}));

	test('gives up on a persistently rate-limited task, leaving the scan partial', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// Retrying forever would hold discovery open; the pass must end, but as `partial` so the
		// caller does not treat the missing session as one that no longer exists.
		const { service, requestedUrls } = createService(store, {
			tasks: [
				task('task-1', 'lost', undefined, 'sess-1', 'env-1'),
				task('task-2', 'kept', undefined, 'sess-2', 'env-2'),
			],
			repositories: new Map(),
			rateLimitedTaskFetches: new Map([['task-1', Number.MAX_SAFE_INTEGER]]),
		});

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			kind: result.kind,
			sessions: result.kind === 'failed' ? [] : result.sessions.map(s => s.sessionId),
			// The original attempt plus RATE_LIMIT_MAX_RETRIES retries, then it stops.
			taskOneAttempts: requestedUrls.filter(u => u.endsWith('/tasks/task-1')).length,
		}, {
			kind: 'partial',
			sessions: ['sess-2'],
			taskOneAttempts: 4,
		});
	}));
});

interface ICreateCall {
	readonly url: string;
	readonly type: string;
	readonly body: unknown;
	readonly timeout: number | undefined;
	readonly headers: IHeaders;
}

function createServiceForCreate(store: Pick<{ add<T extends { dispose(): void }>(t: T): T }, 'add'>, response: unknown, statusCode = 200, options?: { readonly failDelete?: boolean; readonly deleteStatusCode?: number; readonly responseHeaders?: Record<string, string> }): { service: CloudSandboxApiService; calls: ICreateCall[]; errors: string[]; warnings: string[] } {
	const calls: ICreateCall[] = [];
	const errors: string[] = [];
	const warnings: string[] = [];
	const instantiationService = store.add(new TestInstantiationService());
	instantiationService.stub(IRequestService, new class extends mock<IRequestService>() {
		override async request(opts: IRequestOptions): Promise<IRequestContext> {
			calls.push({
				url: opts.url ?? '',
				type: opts.type ?? '',
				body: opts.data === undefined ? undefined : JSON.parse(opts.data),
				timeout: opts.timeout,
				headers: opts.headers ?? {},
			});
			if (opts.type === 'DELETE') {
				if (options?.failDelete) {
					throw new Error('delete failed');
				}
				// Reusing the create's failure status would fake a cleanup that never happened.
				return jsonResponse({}, options?.deleteStatusCode ?? 204);
			}
			return jsonResponse(response, statusCode, options?.responseHeaders);
		}
	}());
	instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
		override async getSessions() { return [{ accessToken: 'tok', id: 's', account: { id: 'a', label: 'a' }, scopes: [] }]; }
		override readonly onDidChangeSessions = Event.None;
		override readonly onDidRegisterAuthenticationProvider = Event.None;
		override readonly onDidUnregisterAuthenticationProvider = Event.None;
	}());
	instantiationService.stub(IProductService, { defaultChatAgent: undefined } as unknown as IProductService);
	instantiationService.stub(ILogService, new class extends NullLogService {
		override error(message: string | Error): void {
			errors.push(String(message));
		}
		override warn(message: string): void {
			warnings.push(String(message));
		}
	}());
	instantiationService.stub(ICloudSandboxTelemetryService, new class extends mock<ICloudSandboxTelemetryService>() {
		override reportRequest(): void { }
		override reportProvisioningOutcome(): void { }
	}());
	return { service: store.add(instantiationService.createInstance(CloudSandboxApiService)), calls, errors, warnings };
}

suite('CloudSandboxApiService task archiving', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('another client discovers a task archive and the original client discovers its unarchive', async () => {
		const tasks: ITestTask[] = [task('task-1', 'Task', undefined, 'session-1', 'env-1')];
		const createClient = () => createService(store, {
			tasks, repositories: new Map(),
			onRequest: (url, _token, options) => {
				if (options.type === 'POST') {
					tasks[0] = { ...tasks[0], archived_at: url.pathname.endsWith('/archive') ? new Date().toISOString() : undefined };
					return jsonResponse({});
				}
				return undefined;
			},
		}).service;
		const first = createClient();
		const second = createClient();
		await first.listSessions(CancellationToken.None);
		await first.setTaskArchived('task-1', true, CancellationToken.None);
		const archived = await second.listSessions(CancellationToken.None);
		await second.setTaskArchived('task-1', false, CancellationToken.None);
		const unarchived = await first.listSessions(CancellationToken.None, { incremental: true });
		assert.deepStrictEqual({
			archived: archived.kind === 'failed' ? archived : archived.sessions.map(session => [session.taskId, session.isArchived === true]),
			unarchived: unarchived.kind === 'failed' ? unarchived : unarchived.sessions.map(session => [session.taskId, session.isArchived === true]),
		}, { archived: [['task-1', true]], unarchived: [['task-1', false]] });
	});

	test('posts archive and unarchive to the owning task without an environment request', async () => {
		const { service, calls } = createServiceForCreate(store, {});
		await service.setTaskArchived('task/with spaces', true, CancellationToken.None);
		await service.setTaskArchived('task/with spaces', false, CancellationToken.None);
		assert.deepStrictEqual(calls.map(call => ({
			path: new URL(call.url).pathname, method: call.type, body: call.body,
			timeout: call.timeout, integration: call.headers['Copilot-Integration-Id'],
		})), [
			{ path: '/agents/tasks/task%2Fwith%20spaces/archive', method: 'POST', body: undefined, timeout: 10_000, integration: COPILOT_INTEGRATION_ID },
			{ path: '/agents/tasks/task%2Fwith%20spaces/unarchive', method: 'POST', body: undefined, timeout: 10_000, integration: COPILOT_INTEGRATION_ID },
		]);
	});

	for (const archived of [true, false]) {
		for (const statusCode of [400, 403, 404, 422, 429, 500]) {
			test(`surfaces rejected task ${archived ? 'archive' : 'unarchive'}: HTTP ${statusCode}`, async () => {
				const { service } = createServiceForCreate(store, { message: 'archive rejected' }, statusCode);
				await assert.rejects(service.setTaskArchived('task-1', archived, CancellationToken.None), new RegExp(`task ${archived ? 'archive' : 'unarchive'} failed: HTTP ${statusCode}`));
			});
		}
	}

	test('requires authentication before archiving', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(), authenticationSessions: async () => [],
		});
		await assert.rejects(service.setTaskArchived('task-1', true, CancellationToken.None), /signed-in GitHub account/);
		assert.deepStrictEqual(requestedUrls, []);
	});

	test('invalidates discovery responses started before an archive mutation', async () => {
		const pending = new DeferredPromise<IRequestContext>();
		const entered = new DeferredPromise<void>();
		let paused = false;
		const tasks = [task('task-1', 'Task', undefined, 'session-1', 'env-1')];
		const { service } = createService(store, {
			tasks, repositories: new Map(),
			onRequest: async (url, _token, options) => {
				if (options.type === 'POST') {
					return jsonResponse({});
				}
				if (paused && url.pathname.endsWith('/tasks/task-1')) {
					await entered.complete();
					return pending.p;
				}
				return undefined;
			},
		});
		paused = true;
		const discovery = service.listSessions(CancellationToken.None);
		await entered.p;
		await service.setTaskArchived('task-1', true, CancellationToken.None);
		await pending.complete(jsonResponse(tasks[0]));
		assert.strictEqual((await discovery).kind, 'failed');
	});
});

suite('CloudSandboxApiService task renaming', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('patches the encoded task name through Mission Control', async () => {
		const { service, calls } = createServiceForCreate(store, { name: 'New title' });
		await service.renameTask('task/with spaces', 'New title', CancellationToken.None);
		assert.deepStrictEqual(calls, [{
			url: 'https://api.githubcopilot.com/agents/tasks/task%2Fwith%20spaces',
			type: 'PATCH',
			body: { name: 'New title' },
			timeout: 10_000,
			headers: {
				Accept: 'application/json',
				'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
				'Content-Type': 'application/json',
				Authorization: 'Bearer tok',
			},
		}]);
	});

	for (const statusCode of [400, 403, 404, 422, 429, 500]) {
		test(`surfaces rejected task rename: HTTP ${statusCode}`, async () => {
			const { service } = createServiceForCreate(store, { message: 'rename rejected' }, statusCode);
			await assert.rejects(service.renameTask('task-1', 'New title', CancellationToken.None), new RegExp(`task rename failed: HTTP ${statusCode}`));
		});
	}

	test('requires authentication before renaming', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(), authenticationSessions: async () => [],
		});
		await assert.rejects(service.renameTask('task-1', 'New title', CancellationToken.None), /signed-in GitHub account/);
		assert.deepStrictEqual(requestedUrls, []);
	});

	test('surfaces transport errors', async () => {
		const { service } = createService(store, {
			tasks: [], repositories: new Map(), requestError: new Error('rename transport failed'),
		});
		await assert.rejects(service.renameTask('task-1', 'New title', CancellationToken.None), /rename transport failed/);
	});

	test('refreshes a renamed task even when the incremental list omits it', async () => {
		const original = { ...task('task-1', 'Old title', undefined, 'sess-1', 'env-1'), updated_at: '2026-08-01T00:00:00Z' };
		let renamed = false;
		const { service } = createService(store, {
			tasks: [original], repositories: new Map(),
			onRequest: (url, _token, options) => {
				if (options.type === 'PATCH') {
					renamed = true;
					return jsonResponse({});
				}
				if (renamed && url.pathname.endsWith('/tasks/task-1')) {
					return jsonResponse({ ...original, name: 'New title' });
				}
				return undefined;
			},
		});
		await service.listSessions(CancellationToken.None);
		await service.renameTask('task-1', 'New title', CancellationToken.None);
		const result = await service.listSessions(CancellationToken.None, { incremental: true });
		assert.deepStrictEqual(result.kind !== 'failed' ? result.sessions.map(session => session.name) : result.kind, ['New title']);
	});

	test('invalidates discovery in flight when a task is renamed', async () => {
		const entered = new DeferredPromise<void>();
		const response = new DeferredPromise<IRequestContext>();
		const original = task('task-1', 'Old title', undefined, 'sess-1', 'env-1');
		const { service } = createService(store, {
			tasks: [original], repositories: new Map(),
			onRequest: (url, _token, options) => {
				if (options.type === 'PATCH') {
					return jsonResponse({});
				}
				if (url.pathname.endsWith('/tasks/task-1')) {
					void entered.complete();
					return response.p;
				}
				return undefined;
			},
		});
		const discovery = service.listSessions(CancellationToken.None);
		await entered.p;
		await service.renameTask('task-1', 'New title', CancellationToken.None);
		await response.complete(jsonResponse(original));
		assert.strictEqual((await discovery).kind, 'failed');
	});
});

suite('CloudSandboxApiService task deletion', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const statusCode of [200, 204, 404]) {
		test(`deletes the encoded task through Mission Control: HTTP ${statusCode}`, async () => {
			const { service, calls } = createServiceForCreate(store, undefined, 200, { deleteStatusCode: statusCode });
			await service.deleteTask('task/with spaces', CancellationToken.None);
			assert.deepStrictEqual(calls, [{
				url: 'https://api.githubcopilot.com/agents/tasks/task%2Fwith%20spaces',
				type: 'DELETE',
				body: undefined,
				timeout: 10_000,
				headers: {
					Accept: 'application/json',
					'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
					Authorization: 'Bearer tok',
				},
			}]);
		});
	}

	for (const statusCode of [403, 429, 500]) {
		test(`surfaces rejected deletion: HTTP ${statusCode}`, async () => {
			const { service } = createServiceForCreate(store, undefined, 200, { deleteStatusCode: statusCode });
			await assert.rejects(service.deleteTask('task-1', CancellationToken.None), new RegExp(`task delete failed: HTTP ${statusCode}`));
		});
	}

	test('surfaces transport errors', async () => {
		const { service } = createServiceForCreate(store, undefined, 200, { failDelete: true });
		await assert.rejects(service.deleteTask('task-1', CancellationToken.None), /delete failed/);
	});

	test('requires authentication before deleting', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(), authenticationSessions: async () => [],
		});
		await assert.rejects(service.deleteTask('task-1', CancellationToken.None), /signed-in GitHub account/);
		assert.deepStrictEqual(requestedUrls, []);
	});

	test('removes deleted tasks from the incremental discovery cache', async () => {
		const { service } = createService(store, {
			tasks: [{ ...task('task-1', 'Sandbox', undefined, 'sess-1', 'env-1'), updated_at: '2026-08-01T00:00:00Z' }],
			repositories: new Map(),
			onRequest: (_url, _token, options) => options.type === 'DELETE' ? jsonResponse({}, 204) : undefined,
		});
		const before = await service.listSessions(CancellationToken.None);
		await service.deleteTask('task-1', CancellationToken.None);
		const after = await service.listSessions(CancellationToken.None, { incremental: true });
		assert.deepStrictEqual({
			before: before.kind !== 'failed' ? before.sessions.map(session => session.taskId) : before.kind,
			after: after.kind !== 'failed' ? after.sessions.map(session => session.taskId) : after.kind,
		}, { before: ['task-1'], after: [] });
	});

	test('invalidates discovery in flight when a task is deleted', async () => {
		const entered = new DeferredPromise<void>();
		const response = new DeferredPromise<IRequestContext>();
		const { service } = createService(store, {
			tasks: [task('task-1', 'Sandbox', undefined, 'sess-1', 'env-1')],
			repositories: new Map(),
			onRequest: (url, _token, options) => {
				if (options.type === 'DELETE') {
					return jsonResponse({}, 204);
				}
				if (url.pathname.endsWith('/tasks/task-1')) {
					void entered.complete();
					return response.p;
				}
				return undefined;
			},
		});
		const discovery = service.listSessions(CancellationToken.None);
		await entered.p;
		await service.deleteTask('task-1', CancellationToken.None);
		await response.complete(jsonResponse(task('task-1', 'Sandbox', undefined, 'sess-1', 'env-1')));
		assert.strictEqual((await discovery).kind, 'failed');
	});
});

suite('CloudSandboxApiService session creation', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const result of ['success', 'HTTP error', 'network error', 'invalid binding', 'invalid JSON', 'cancelled', 'late success after cancellation'] as const) {
		test(`reports provisioning duration separately when ${result}`, () => runWithFakedTimers({}, async () => {
			const source = store.add(new CancellationTokenSource());
			const error = new Error('private network error');
			const { service, provisioningOutcomes } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: async (_url, _token, options) => {
					if (options.type === 'DELETE') {
						await timeout(10);
						return jsonResponse({}, 204);
					}
					await timeout(40);
					if (result === 'cancelled' || result === 'late success after cancellation') {
						source.cancel();
					}
					if (result === 'cancelled') {
						throw new CancellationError();
					}
					if (result === 'network error') {
						throw error;
					}
					if (result === 'HTTP error') {
						return jsonResponse({ message: 'private server error' }, 500);
					}
					if (result === 'invalid JSON') {
						return { res: { headers: {}, statusCode: 200 }, stream: bufferToStream(VSBuffer.fromString('invalid')) };
					}
					return jsonResponse({
						id: 'private-task',
						sessions: result === 'invalid binding' ? [] : [{ id: 'private-session', environment_id: 'private-environment' }],
					});
				},
			});
			await timeout(100);
			const provisioning = service.createSession({ prompt: 'private prompt' }, source.token);
			if (result === 'success' || result === 'late success after cancellation') {
				await provisioning;
			} else {
				await assert.rejects(provisioning, caught => result === 'network error' ? caught === error : caught instanceof Error);
			}
			await timeout(100);
			assert.deepStrictEqual(provisioningOutcomes, [[
				result === 'success' ? 'success' : result === 'cancelled' || result === 'late success after cancellation' ? 'cancelled' : 'failure',
				result === 'invalid binding' ? 50 : 40,
			]]);
		}));
	}

	test('reports already cancelled provisioning without issuing a request', () => runWithFakedTimers({}, async () => {
		const { service, requestedUrls, provisioningOutcomes } = createService(store, { tasks: [], repositories: new Map() });
		await assert.rejects(service.createSession({ prompt: 'hello' }, CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual({ requestedUrls, provisioningOutcomes }, { requestedUrls: [], provisioningOutcomes: [['cancelled', 0]] });
	}));

	test('posts the on-demand sentinel and returns the bound environment', async () => {
		const { service, calls } = createServiceForCreate(store, {
			id: 'task-1',
			sessions: [{ id: 'sess-1', environment_id: 'env-concrete' }],
		});

		const created = await service.createSession({ repoNwo: 'osortega/simple-server', prompt: 'fix it' }, CancellationToken.None);

		assert.deepStrictEqual({
			created,
			type: calls[0].type,
			endsWithTasks: calls[0].url.endsWith('/agents/tasks'),
			body: calls[0].body,
			// Creating a task provisions a VM before replying, so it needs its own budget.
			timeout: calls[0].timeout,
			// `fetch` labels a string body `text/plain` unless told otherwise.
			contentType: calls[0].headers['Content-Type'],
		}, {
			created: { taskId: 'task-1', sessionId: 'sess-1', environmentId: 'env-concrete' },
			type: 'POST',
			endsWithTasks: true,
			body: {
				environment_id: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID,
				prompt: 'fix it',
				repositories: [{ owner: 'osortega', name: 'simple-server' }],
			},
			// A literal, not the constant: comparing a value to itself would prove nothing.
			timeout: 60_000,
			contentType: 'application/json',
		});
	});

	test('uses account compute scope when no repository is supplied', async () => {
		const { service, calls } = createServiceForCreate(store, {
			id: 'task-2',
			sessions: [{ id: 'sess-2', environment_id: 'env-2' }],
		});

		await service.createSession({ prompt: 'hello' }, CancellationToken.None);

		assert.deepStrictEqual(calls[0].body, {
			environment_id: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID,
			prompt: 'hello',
			compute: { scope: 'a' },
		});
	});

	test('pairs repo-less compute scope with the account authorizing each request', async () => {
		const calls: Pick<ICreateCall, 'body' | 'headers'>[] = [];
		let authenticationRequests = 0;
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => {
				const login = ++authenticationRequests === 1 ? 'octocat' : 'mona';
				return [{
					id: `session-${login}`,
					accessToken: `token-${login}`,
					account: { id: String(authenticationRequests), label: login },
					scopes: [],
				}];
			},
			onRequest: (_url, _token, options) => {
				calls.push({ body: JSON.parse(options.data ?? ''), headers: options.headers ?? {} });
				return jsonResponse({ id: 'task-1', sessions: [{ id: 'sess-1', environment_id: 'env-1' }] });
			},
		});

		await service.createSession({ prompt: 'hello' }, CancellationToken.None);
		await service.createSession({ prompt: 'hello' }, CancellationToken.None);

		assert.deepStrictEqual({
			authenticationRequests,
			requests: calls.map(call => ({ body: call.body, authorization: call.headers.Authorization })),
		}, {
			authenticationRequests: 2,
			requests: ['octocat', 'mona'].map(login => ({
				body: {
					environment_id: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID,
					prompt: 'hello',
					compute: { scope: login },
				},
				authorization: `Bearer token-${login}`,
			})),
		});
	});

	test('requires authentication before creating a repo-less sandbox', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(), authenticationSessions: async () => [],
		});

		await assert.rejects(service.createSession({ prompt: 'hello' }, CancellationToken.None), CloudSandboxAuthenticationRequiredError);
		assert.deepStrictEqual(requestedUrls, []);
	});

	for (const repoNwo of ['', 'octocat', '/repo', 'octocat/']) {
		test(`rejects an invalid repository instead of provisioning a repo-less sandbox: '${repoNwo}'`, async () => {
			const { service, requestedUrls } = createService(store, { tasks: [], repositories: new Map() });

			await assert.rejects(service.createSession({ repoNwo, prompt: 'hello' }, CancellationToken.None), /owner\/name/);
			assert.deepStrictEqual(requestedUrls, []);
		});
	}

	test('throws when Mission Control binds no session to the created task', async () => {
		// A task with no bound session has nothing for the relay to address, so this must not be
		// reported as a usable sandbox.
		const { service } = createServiceForCreate(store, { id: 'task-3', sessions: [] });

		await assert.rejects(
			() => service.createSession({ prompt: 'hello' }, CancellationToken.None),
			/bound no sandbox session/,
		);
	});

	test('deletes a created task that has no usable session, rather than leaving it in the task list', async () => {
		// The task exists on the server even though it is unusable, so it would otherwise show up
		// in the user's task list forever.
		const { service, calls } = createServiceForCreate(store, { id: 'task-3', sessions: [] });

		await assert.rejects(() => service.createSession({ prompt: 'hello' }, CancellationToken.None));

		assert.deepStrictEqual(calls.map(c => `${c.type} ${c.url.replace(/^.*\/agents/, '')}`), [
			'POST /tasks',
			'DELETE /tasks/task-3',
		]);
	});

	test('a failed cleanup does not replace the error explaining why creation failed', async () => {
		const { service } = createServiceForCreate(store, { id: 'task-3', sessions: [] }, 200, { failDelete: true });

		await assert.rejects(
			() => service.createSession({ prompt: 'hello' }, CancellationToken.None),
			/bound no sandbox session/,
		);
	});

	test('throws on a non-success status', async () => {
		const { service } = createServiceForCreate(store, { message: 'nope' }, 403);

		await assert.rejects(
			() => service.createSession({ prompt: 'hello' }, CancellationToken.None),
			/HTTP 403/,
		);
	});

	test('deletes the task named by a failed create, which Mission Control recorded before failing', async () => {
		// Compute is provisioned after the record exists, so a failure leaves a task behind.
		const { service, calls, warnings } = createServiceForCreate(store, { id: 'task-9', message: 'failed to create agent compute' }, 500);

		await assert.rejects(() => service.createSession({ prompt: 'hello' }, CancellationToken.None));

		assert.deepStrictEqual({
			requests: calls.map(c => `${c.type} ${c.url.replace(/^.*\/agents/, '')}`),
			// The delete succeeded, so nothing should claim an orphan was left behind.
			cleanupWarnings: warnings.filter(w => w.includes('task-9')),
		}, {
			requests: ['POST /tasks', 'DELETE /tasks/task-9'],
			cleanupWarnings: [],
		});
	});

	test('reports a rejected cleanup rather than claiming the orphan was removed', async () => {
		// A rejected delete resolves like any other response, so the status must be checked.
		const { service, warnings } = createServiceForCreate(store, { id: 'task-10', message: 'failed to create agent compute' }, 500, { deleteStatusCode: 500 });

		await assert.rejects(() => service.createSession({ prompt: 'hello' }, CancellationToken.None));

		assert.deepStrictEqual(warnings.filter(w => w.includes('task-10')), [
			'[CloudSandboxApi] Could not clean up sandbox task task-10: Mission Control task delete failed: HTTP 500 - {}. It remains and can only be removed server-side.',
		]);
	});

	test('keeps the failure message when the response names no task', async () => {
		// The body is read once: reading it again would discard the failure's explanation.
		const { service, calls } = createServiceForCreate(store, { message: 'failed to create agent compute' }, 500);

		await assert.rejects(
			() => service.createSession({ prompt: 'hello' }, CancellationToken.None),
			/HTTP 500 - .*failed to create agent compute/,
		);

		assert.deepStrictEqual(calls.map(c => c.type), ['POST']);
	});

	test('logs the request id and raw body when a create fails, so the failure can be escalated', async () => {
		// The failure message masks its cause, so the request id is what gets escalated.
		const { service, errors } = createServiceForCreate(store,
			{ message: 'failed to create agent compute' }, 500,
			{ responseHeaders: { 'x-github-request-id': 'ABCD:1234:5678', 'x-sweagentd-retry': 'compute_resource_locked' } });

		await assert.rejects(() => service.createSession({ prompt: 'hello' }, CancellationToken.None));

		assert.deepStrictEqual(errors.filter(e => e.includes('Task create failed.')), [
			'[CloudSandboxApi] Task create failed. HTTP 500 | x-github-request-id: ABCD:1234:5678 | x-sweagentd-retry: compute_resource_locked | body: {"message":"failed to create agent compute"}',
		]);
	});
});
