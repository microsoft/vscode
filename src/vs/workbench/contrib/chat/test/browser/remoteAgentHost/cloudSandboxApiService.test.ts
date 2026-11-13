/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { bufferToStream, newWriteableBufferStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isObject } from '../../../../../../base/common/types.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { IRequestContext, type IHeaders, type IRequestOptions } from '../../../../../../base/parts/request/common/request.js';
import { CLOUD_SANDBOX_AGENT_SLUG, CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID, CloudSandboxAuthenticationRequiredError, CloudSandboxRequestError, type ICloudSandboxAuthenticationTarget, type ICloudSandboxConnectionRequest, type ICloudSandboxPreparedAuthentication, type ICloudSandboxSealTokenRequest } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { SessionStatus } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/common/actions.js';
import { COPILOT_INTEGRATION_ID } from '../../../../../../platform/endpoint/common/licenseAgreement.js';
import { IGitHubAccountClient } from '../../../../../../platform/github/common/account/account.js';
import { AccountClient } from '../../../../../../platform/github/common/account/accountClient.js';
import { IApiRequestProvider } from '../../../../../../platform/github/common/client/request.js';
import { LocalApiRequestProvider } from '../../../../../../platform/github/common/client/localApiRequestProvider.js';
import { LocalMissionControlRequestProvider } from '../../../../../../platform/github/common/client/localMissionControlRequestProvider.js';
import { SchemaError } from '../../../../../../platform/github/common/client/schema.js';
import { IGitHubCredentials } from '../../../../../../platform/github/common/githubCredentialService.js';
import { GitHubRestTextRequest, GitHubTransport, IGitHubTransport } from '../../../../../../platform/github/common/githubTransport.js';
import { AccountHandle, RequestError } from '../../../../../../platform/github/common/types.js';
import { GitHubRequestError, GitHubRequestTimeoutError } from '../../../../../../platform/github/common/githubTypes.js';
import { ClientTokenResponse } from '../../../../../../platform/github/common/missionControl/environments.js';
import { MutationUncertainError } from '../../../../../../platform/github/common/missionControl/missionControlClient.js';
import type { TaskClient } from '../../../../../../platform/github/common/missionControl/tasks.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { NullOpenerService } from '../../../../../../platform/opener/test/common/nullOpenerService.js';
import { asText, IRequestService } from '../../../../../../platform/request/common/request.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { CloudSandboxApiService } from '../../../browser/remoteAgentHost/cloudSandboxApiService.js';
import { AgentHostLanguageModelProvider } from '../../../browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { ModelCard } from '../../../browser/widget/input/modelPicker/modelPickerCard.js';
import { createModelAction } from '../../../browser/widget/input/modelPicker/modelPickerItemPrimitives.js';
import { getModelConfigSummary } from '../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ICloudSandboxTelemetryService, type ICloudSandboxDiscoveryTelemetryData } from '../../../browser/remoteAgentHost/cloudSandboxTelemetry.js';
import { IWorkbenchGitHubService } from '../../../../../services/github/common/githubService.js';
import { ITelemetryService, type ITelemetryData } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IUserDataProfile } from '../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { DidChangeUserDataProfileEvent, IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { CloudSandboxLifecycleTelemetry } from '../../../browser/remoteAgentHost/cloudSandboxLifecycleTelemetry.js';

function jsonResponse(body: unknown, statusCode = 200, headers: Record<string, string | string[]> = {}): IRequestContext {
	return {
		res: { headers: { date: new Date().toUTCString(), ...headers }, statusCode },
		stream: bufferToStream(VSBuffer.fromString(JSON.stringify(body))),
	};
}

function taskResponse(body: unknown): unknown {
	if (!isObject(body)) {
		return body;
	}
	const metadata = { state: 'queued', created_at: '2026-01-01T00:00:00Z' };
	const response: Record<string, unknown> = {
		...metadata,
		remote_steerable: true,
		...body,
	};
	if (Array.isArray(response.sessions)) {
		response.sessions = response.sessions.map((session: unknown) => isObject(session) ? { ...metadata, ...session } : session);
	}
	return response;
}

function jsonTaskResponse(body: unknown, statusCode = 200, headers: Record<string, string | string[]> = {}): IRequestContext {
	return jsonResponse(statusCode >= 200 && statusCode < 300 ? taskResponse(body) : body, statusCode, headers);
}

/** A task without optional repository-name enrichment. */
function task(id: string, name: string, repositoryId: number | undefined, sessionId: string, environmentId: string) {
	return {
		id,
		name,
		state: 'completed',
		created_at: '2026-01-01T00:00:00Z',
		remote_steerable: true,
		agent_collaborators: [{ slug: CLOUD_SANDBOX_AGENT_SLUG }],
		compute: { provider: 'sandboxes' },
		current_environment: { id: environmentId, kind: 'managed-sandbox' },
		...(repositoryId !== undefined ? { repository: { id: repositoryId } } : {}),
		sessions: [{ id: sessionId, environment_id: environmentId, state: 'completed', created_at: '2026-01-01T00:00:00Z' }],
	};
}

type ITestTask = Omit<ReturnType<typeof task>, 'current_environment' | 'compute'> & {
	readonly event_type?: string;
	readonly compute?: { readonly provider?: string } | null;
	readonly current_environment?: { readonly id: string; readonly kind: string };
	readonly updated_at?: string;
	readonly archived_at?: string;
};

interface ITestSetup {
	readonly service: CloudSandboxApiService;
	readonly requestedUrls: string[];
	readonly provisioningOutcomes: ProvisioningOutcome[];
	readonly requestOutcomes: RequestOutcome[];
	readonly lifecycleEvents: ITelemetryData[];
	readonly discoveryEvents: ICloudSandboxDiscoveryTelemetryData[];
	readonly typedRequests: GitHubRestTextRequest[];
	readonly clientLifetimes: { readonly authorization: IGitHubAccountClient['authorization']; disposed: boolean }[];
	/** Peak number of task-detail fetches in flight at once during the run. */
	readonly concurrency: { max: number; current: number };
	changeAuthentication(kind?: 'sessions' | 'register' | 'unregister'): void;
	changeProfile(id: string): void;
	invalidateClients(): void;
}

type ProvisioningOutcome = Parameters<ICloudSandboxTelemetryService['reportProvisioningOutcome']>;
type RequestOutcome = Parameters<ICloudSandboxTelemetryService['reportRequest']>;

class TestLogService extends NullLogService {
	readonly traces: string[] = [];
	readonly infos: string[] = [];
	readonly debugs: string[] = [];
	readonly warnings: string[] = [];
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

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push([message, ...args].join(' '));
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
	readonly missionControlProvider?: IApiRequestProvider;
	readonly logService?: ILogService;
	readonly onRequest?: (url: URL, token: CancellationToken, options: IRequestOptions) => IRequestContext | undefined | Promise<IRequestContext | undefined>;
	readonly discoveryDate?: () => string;
	readonly authenticationSessions?: (scopes?: readonly string[]) => Promise<readonly AuthenticationSession[]>;
}): ITestSetup {
	const requestedUrls: string[] = [];
	const provisioningOutcomes: ProvisioningOutcome[] = [];
	const requestOutcomes: RequestOutcome[] = [];
	const lifecycleEvents: ITelemetryData[] = [];
	const discoveryEvents: ICloudSandboxDiscoveryTelemetryData[] = [];
	const typedRequests: GitHubRestTextRequest[] = [];
	const clientLifetimes: ITestSetup['clientLifetimes'] = [];
	const clientInvalidations: Emitter<void>[] = [];
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
	const providerRegistered = store.add(new Emitter<{ id: string; label: string }>());
	const providerUnregistered = store.add(new Emitter<{ id: string; label: string }>());
	const profileChanges = store.add(new Emitter<DidChangeUserDataProfileEvent>());
	let profile = upcastPartial<IUserDataProfile>({ id: 'test-profile' });
	instantiationService.stub(IUserDataProfileService, new class extends mock<IUserDataProfileService>() {
		override get currentProfile() { return profile; }
		override readonly onDidChangeCurrentProfile = profileChanges.event;
	}());

	const requests = instantiationService.stub(IRequestService, new class extends mock<IRequestService>() {
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
				const id = Number(repoMatch[1]);
				const entry = options.repositories.get(id);
				if (entry === 'error') {
					return jsonResponse({ message: 'Not Found' }, 404);
				}
				return jsonResponse({
					id, node_id: `R_${id}`, name: entry?.full_name?.split('/')[1] ?? 'repository',
					full_name: entry?.full_name,
					owner: { id: 1, node_id: 'U_1', login: 'owner', avatar_url: '', html_url: 'https://github.com/owner', type: 'User' },
					private: true, html_url: `https://github.com/${entry?.full_name}`, url,
					description: null, fork: false, default_branch: 'main', clone_url: 'https://github.com/owner/repository.git',
					ssh_url: 'git@github.com:owner/repository.git', archived: false, disabled: false, language: null, stargazers_count: 0,
				});
			}
			if (new URL(url).pathname === '/agents/tasks/batch') {
				const ids = new Set(new URL(url).searchParams.get('task_ids')?.split(','));
				return jsonResponse({ tasks: options.tasks.filter(task => ids.has(task.id)) });
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
				if (query.has('with_repo') && ((task.repository?.id ?? 0) > 0) !== (query.get('with_repo') === 'true')) {
					return false;
				}
				if (query.has('include_environment_kinds') && task.current_environment?.kind !== query.get('include_environment_kinds')) {
					return false;
				}
				return !query.has('since') || !task.updated_at || Date.parse(task.updated_at) >= Date.parse(query.get('since')!);
			});
			const perPage = Number(url.match(/[?&]per_page=(\d+)/)?.[1] ?? options.tasks.length);
			const page = Number(url.match(/[?&]page=(\d+)/)?.[1] ?? 1);
			const continuation = new URL(url);
			continuation.host = 'api.github.com';
			if (options.shortFirstPage && tasks.length > 0 && page === 1) {
				continuation.searchParams.set('page', '2');
				return jsonResponse({ tasks: [] }, 200, { link: `<${continuation.href}>; rel="next"` });
			}
			const slice = options.shortFirstPage ? tasks : tasks.slice((page - 1) * perPage, page * perPage);
			const hasNext = !options.shortFirstPage && page * perPage < tasks.length;
			continuation.searchParams.set('page', String(hasNext ? page + 1 : page));
			const link = `<${continuation.href}>; rel="${hasNext ? 'next' : 'last'}"`;
			return jsonResponse({ tasks: slice }, 200, { link, date: options.discoveryDate?.() ?? new Date().toUTCString() });
		}
	}());
	let selectedSessions: readonly AuthenticationSession[] = [];
	const authentication = instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
		override async getSessions(_providerId: string, scopes?: readonly string[]) {
			selectedSessions = options.authenticationSessions ? await options.authenticationSessions(scopes) : [{ accessToken: 'tok', id: 's', account: { id: 'a', label: 'a' }, scopes: [] }];
			return selectedSessions;
		}
		override readonly onDidChangeSessions = authenticationChanges.event;
		override readonly onDidRegisterAuthenticationProvider = providerRegistered.event;
		override readonly onDidUnregisterAuthenticationProvider = providerUnregistered.event;
	}());
	instantiationService.stub(IProductService, { defaultChatAgent: undefined } as unknown as IProductService);
	instantiationService.stub(ILogService, options.logService ?? new NullLogService());
	instantiationService.stub(ICloudSandboxTelemetryService, new class extends mock<ICloudSandboxTelemetryService>() {
		override readonly lifecycle = new CloudSandboxLifecycleTelemetry(new class extends mock<ITelemetryService>() {
			override publicLog2(_eventName: string, data?: ITelemetryData): void {
				if (data) {
					lifecycleEvents.push(data);
				}
			}
		}());
		override reportRequest(...outcome: RequestOutcome): void {
			requestOutcomes.push(outcome);
		}
		override reportDiscovery(data: ICloudSandboxDiscoveryTelemetryData): void {
			discoveryEvents.push({ ...data });
		}
		override reportProvisioningOutcome(...outcome: ProvisioningOutcome): void {
			provisioningOutcomes.push(outcome);
		}
	}());
	const transport = store.add(new class extends GitHubTransport {
		override restText(account: AccountHandle, token: string, request: GitHubRestTextRequest, signal: AbortSignal) {
			typedRequests.push(request);
			return super.restText(account, token, request, signal);
		}
	}(async (input, init = {}) => {
		const lifetime = new DisposableStore();
		try {
			const token = init.signal ? CancellationToken.fromAbortSignal(init.signal, lifetime) : CancellationToken.None;
			const headers = new Headers(init.headers);
			const headerNames: Record<string, string> = {
				accept: 'Accept', authorization: 'Authorization', 'content-type': 'Content-Type',
				'copilot-integration-id': 'Copilot-Integration-Id', 'x-github-api-version': 'X-GitHub-Api-Version', 'if-none-match': 'If-None-Match',
			};
			const url = new URL(String(input));
			const context = await requests.request({
				type: init.method, url: url.href,
				headers: Object.fromEntries([...headers].map(([name, value]) => [headerNames[name] ?? name, value])),
				callSite: url.pathname === '/agents/tasks' ? 'mc.taskClient.list'
					: url.pathname === '/agents/tasks/batch' ? 'mc.taskClient.getBatch'
						: url.pathname.startsWith('/agents/tasks/') ? 'mc.taskClient.get' : 'test.typed',
				...(typeof init.body === 'string' ? { data: init.body } : {}),
			}, token);
			const responseHeaders = new Headers();
			for (const [name, values] of Object.entries(context.res.headers)) {
				for (const value of Array.isArray(values) ? values : values === undefined ? [] : [values]) {
					responseHeaders.append(name, value);
				}
			}
			const body = await asText(context);
			return new Response([204, 205, 304].includes(context.res.statusCode ?? 0) ? null : body, { status: context.res.statusCode, headers: responseHeaders });
		} finally {
			lifetime.dispose();
		}
	}, undefined, false, options.logService ?? new NullLogService()));
	instantiationService.stub(IWorkbenchGitHubService, new class extends mock<IWorkbenchGitHubService>() {
		override async acquireAccountApiClient(authorization: IGitHubAccountClient['authorization']): Promise<IGitHubAccountClient> {
			const session = selectedSessions.find(session => session.id === authorization.sessionId && session.account.id === authorization.accountId);
			assert.ok(session);
			assert.strictEqual(authorization.providerId, 'github');
			const lifetime = new DisposableStore();
			const invalidation = lifetime.add(new Emitter<void>());
			clientInvalidations.push(invalidation);
			const controller = new AbortController();
			const state = { authorization, disposed: false };
			clientLifetimes.push(state);
			lifetime.add(toDisposable(() => {
				state.disposed = true;
				controller.abort(new CancellationError());
			}));
			let refresh = false;
			const credentials: IGitHubCredentials = {
				onDidInvalidate: Event.None,
				getCredential: async () => {
					const sessions = refresh ? await authentication.getSessions(authorization.providerId, [...authorization.scopes]) : selectedSessions;
					refresh = false;
					const current = sessions.find(candidate => candidate.id === authorization.sessionId && candidate.account.id === authorization.accountId);
					if (!current) {
						throw new GitHubRequestError('The selected authentication session is unavailable', 'authentication');
					}
					return { account: { host: 'api.github.com', accountId: current.account.id }, token: current.accessToken, generation: 0, signal: controller.signal };
				},
				handleRequestError: (_credential, error) => {
					refresh ||= error instanceof GitHubRequestError && error.statusCode === 401;
				},
			};
			const provider = new LocalMissionControlRequestProvider({
				apiBaseUri: 'https://api.githubcopilot.com/agents',
				feedApiBaseUri: 'https://api.github.com/cmc_internal/api/agents',
				identityApiBaseUri: 'https://api.github.com/cmc_internal/api/agents',
				integrationId: COPILOT_INTEGRATION_ID,
			}, credentials, transport, options.logService ?? new NullLogService(), controller.signal);
			const rest = new LocalApiRequestProvider('https://api.github.com', transport, credentials, 'rest', controller.signal);
			return new AccountClient(authorization, {
				rest, graphql: rest, missionControl: options.missionControlProvider ?? provider,
				onDidInvalidate: invalidation.event,
			}, lifetime);
		}
	}());

	return {
		service: store.add(instantiationService.createInstance(CloudSandboxApiService)),
		changeProfile: id => {
			const previous = profile;
			profile = upcastPartial<IUserDataProfile>({ id });
			profileChanges.fire({ previous, profile, join: () => { } });
		},
		requestedUrls,
		provisioningOutcomes,
		requestOutcomes,
		lifecycleEvents,
		discoveryEvents,
		typedRequests,
		clientLifetimes,
		concurrency,
		invalidateClients: () => {
			for (const invalidation of clientInvalidations) {
				invalidation.fire();
			}
		},
		changeAuthentication: (kind = 'sessions') => {
			if (kind === 'register') {
				providerRegistered.fire({ id: 'github', label: 'GitHub' });
			} else if (kind === 'unregister') {
				providerUnregistered.fire({ id: 'github', label: 'GitHub' });
			} else {
				authenticationChanges.fire({ providerId: 'github', label: 'GitHub', event: { added: [], removed: [], changed: [] } });
			}
		},
	};
}

suite('CloudSandboxApiService typed reads', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reuses typed clients and repository names returned by the task list', async () => {
		const current = { ...task('one', 'One', 42, 'session', 'environment'), repository: { id: 42, full_name: 'owner/from-list' } };
		const h = createService(store, { tasks: [current], repositories: new Map() });
		const result = await h.service.listSessions(CancellationToken.None, { includeArchived: false, trigger: 'poll' });
		await h.service.listSessions(CancellationToken.None, { includeArchived: false, trigger: 'manual' });
		await h.service.resolveSession('one', CancellationToken.None);
		assert.deepStrictEqual({
			names: result.kind === 'failed' ? [] : result.sessions.map(session => session.repoName),
			clients: h.clientLifetimes.length,
			reads: h.typedRequests.map(request => ({ path: new URL(request.url).pathname, priority: request.priority })),
			repositories: h.requestedUrls.filter(url => url.includes('/repositories/')),
			legacyRequestOutcomes: h.requestOutcomes,
		}, {
			names: ['owner/from-list'], clients: 1,
			reads: [
				{ path: '/agents/tasks', priority: 'background' }, { path: '/agents/tasks', priority: 'background' },
				{ path: '/agents/tasks', priority: 'interactive' }, { path: '/agents/tasks', priority: 'interactive' },
				{ path: '/agents/tasks/one', priority: 'interactive' },
			],
			repositories: [], legacyRequestOutcomes: [],
		});
	});

	test('shares one repository enrichment for more tasks than the transport waiter limit', async () => {
		const tasks = Array.from({ length: 65 }, (_, index) => task(`task-${index}`, 'Task', 42, `session-${index}`, 'environment'));
		const h = createService(store, {
			tasks, repositories: new Map([[42, { full_name: 'owner/repository' }]]),
			onRequest: async url => {
				if (url.pathname === '/repositories/42') {
					await timeout(0);
				}
				return undefined;
			},
		});
		const result = await h.service.listSessions(CancellationToken.None);
		assert.deepStrictEqual({
			names: result.kind === 'failed' ? [] : result.sessions.map(session => session.repoName),
			lookups: h.typedRequests.filter(request => new URL(request.url).pathname === '/repositories/42').length,
			misses: h.discoveryEvents.at(-1)?.repositoryEnrichmentMissCount,
		}, { names: Array(65).fill('owner/repository'), lookups: 1, misses: 0 });
	});

	test('repository enrichment returns an invalidated scan without caching stale names after a task mutation', async () => {
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<void>();
		const current = task('task', 'Task', 42, 'session', 'environment');
		const repositories = new Map([[42, { full_name: 'owner/old-name' }]]);
		let lookups = 0;
		const h = createService(store, {
			tasks: [current], repositories,
			onRequest: async url => {
				if (url.pathname === '/repositories/42' && ++lookups === 1) {
					void started.complete();
					await response.p;
				}
				if (url.pathname === '/agents/tasks/task/archive') {
					return jsonResponse(current);
				}
				return undefined;
			},
		});
		const discovery = h.service.listSessions(CancellationToken.None);
		await started.p;
		await h.service.setTaskArchived('task', true, CancellationToken.None);
		await response.complete();
		const invalidated = await discovery;
		repositories.set(42, { full_name: 'owner/new-name' });
		const refreshed = await h.service.listSessions(CancellationToken.None);
		assert.deepStrictEqual({
			invalidated: invalidated.kind,
			generationInvalidated: h.discoveryEvents[0].generationInvalidated,
			names: refreshed.kind === 'failed' ? [] : refreshed.sessions.map(session => session.repoName),
			lookups,
		}, { invalidated: 'failed', generationInvalidated: true, names: ['owner/new-name'], lookups: 2 });
	});

	test('a later list-page failure preserves the previous checkpoint instead of publishing partial pages', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const original = task('old', 'Old', undefined, 'session', 'environment');
		const tasks = [original];
		let fail = false;
		let date = 'Tue, 22 Sep 2026 10:00:00 GMT';
		const h = createService(store, {
			tasks, repositories: new Map(), discoveryDate: () => date,
			onRequest: url => fail && url.pathname === '/agents/tasks' && url.searchParams.get('page') === '2'
				? jsonResponse({ message: 'Unavailable' }, 503) : undefined,
		});
		await h.service.listSessions(CancellationToken.None, { includeArchived: false });
		tasks.unshift(...Array.from({ length: 101 }, (_, index) => task(`new-${index}`, 'New', undefined, 'session', 'environment')));
		fail = true;
		date = 'Tue, 22 Sep 2026 10:05:00 GMT';
		const failed = await h.service.listSessions(CancellationToken.None, { includeArchived: false, incremental: true });
		fail = false;
		tasks.splice(0, 101);
		h.requestedUrls.length = 0;
		await h.service.listSessions(CancellationToken.None, { includeArchived: false, incremental: true });
		assert.deepStrictEqual({
			kind: failed.kind,
			since: h.requestedUrls.filter(url => new URL(url).pathname === '/agents/tasks').map(url => new URL(url).searchParams.get('since')),
		}, {
			kind: 'failed',
			since: ['2026-09-22T09:59:00.000Z', '2026-09-22T09:59:00.000Z'],
		});
	}));

	test('reacquires invalidated and profile-scoped clients', async () => {
		const h = createService(store, { tasks: [], repositories: new Map() });
		await h.service.listSessions(CancellationToken.None, { includeArchived: false });
		h.invalidateClients();
		await h.service.listSessions(CancellationToken.None, { includeArchived: false });
		const changed = Event.toPromise(h.service.onDidChangeAccount);
		h.changeProfile('other-profile');
		await changed;
		await h.service.listSessions(CancellationToken.None, { includeArchived: false });
		assert.deepStrictEqual(h.clientLifetimes.map(client => client.disposed), [true, true, false]);
	});

	test('splits targeted task batches at 50 IDs without individual GETs or inventory filters', async () => {
		const tasks = Array.from({ length: 51 }, (_, index) => ({
			...task(`task-${index}`, 'Task', undefined, `session-${index}`, 'environment'),
			...(index % 2 ? { archived_at: '2026-10-01T00:00:00Z' } : {}),
		}));
		const h = createService(store, { tasks, repositories: new Map() });
		const ids = tasks.map(task => task.id);
		const result = await h.service.listSessions(CancellationToken.None, { taskIds: [...ids, ids[0]], includeArchived: false, trigger: 'feedChange' });
		assert.deepStrictEqual({
			kind: result.kind, tasks: result.kind === 'failed' ? 0 : result.sessions.length,
			archived: result.kind === 'failed' ? 0 : result.sessions.filter(task => task.isArchived).length,
			requests: h.typedRequests.map(request => {
				const url = new URL(request.url);
				return {
					path: url.pathname, method: request.method, priority: request.priority,
					ids: url.searchParams.get('task_ids')?.split(','), filters: [...url.searchParams.keys()],
				};
			}),
		}, {
			kind: 'incremental', tasks: 51, archived: 25,
			requests: [ids.slice(0, 50), ids.slice(50)].map(ids => ({
				path: '/agents/tasks/batch', method: 'GET', priority: 'background', ids, filters: ['task_ids'],
			})),
		});
	});

	test('successful task batch omissions leave inventory without fallback GETs or remote deletion', async () => {
		const visible = task('visible', 'Visible', undefined, 'visible-session', 'environment');
		const omitted = task('omitted', 'Still directly readable', undefined, 'omitted-session', 'environment');
		const h = createService(store, {
			tasks: [visible, omitted], repositories: new Map(),
			onRequest: url => url.pathname === '/agents/tasks/batch' ? jsonResponse({ tasks: [visible] }) : undefined,
		});
		await h.service.listSessions(CancellationToken.None);
		await h.service.resolveSession('omitted', CancellationToken.None);
		h.requestedUrls.length = 0;
		const result = await h.service.listSessions(CancellationToken.None, { taskIds: ['visible', 'omitted'] });
		const discoveryRequests = h.requestedUrls.map(url => new URL(url).pathname);
		h.requestedUrls.length = 0;
		const resolved = await h.service.resolveSession('omitted', CancellationToken.None);
		assert.deepStrictEqual({
			result: result.kind === 'failed' ? result : {
				kind: result.kind, tasks: result.sessions.map(task => task.taskId), removed: result.removedTaskIds,
			},
			discoveryRequests,
			onDemand: { session: resolved.sessionId, requests: h.requestedUrls.map(url => new URL(url).pathname) },
		}, {
			result: { kind: 'incremental', tasks: ['visible'], removed: ['omitted'] },
			discoveryRequests: ['/agents/tasks/batch'],
			onDemand: { session: 'omitted-session', requests: ['/agents/tasks/omitted'] },
		});
	});

	test('failed task batches preserve their cached inventory while successful omissions are reconciled', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const tasks = Array.from({ length: 51 }, (_, index) => task(`task-${index}`, 'Original', undefined, `session-${index}`, 'environment'));
		const ids = tasks.map(task => task.id);
		const h = createService(store, {
			tasks, repositories: new Map(),
			onRequest: url => url.pathname === '/agents/tasks/batch'
				? url.searchParams.get('task_ids')?.includes('task-0') ? jsonResponse({}, 503) : jsonResponse({ tasks: [] })
				: undefined,
		});
		await h.service.listSessions(CancellationToken.None);
		await h.service.resolveSession('task-0', CancellationToken.None);
		tasks[0] = { ...tasks[0], name: 'Must not replace the cache' };
		h.requestedUrls.length = 0;
		const result = await h.service.listSessions(CancellationToken.None, { taskIds: ids });
		const retained = await h.service.resolveSession('task-0', CancellationToken.None);
		assert.deepStrictEqual({
			result,
			retained: retained.name,
			unexpectedRequests: h.requestedUrls.filter(url => new URL(url).pathname !== '/agents/tasks/batch'),
			batches: h.discoveryEvents.at(-1)?.taskBatchOperationCount,
			failures: h.discoveryEvents.at(-1)?.taskBatchOperationFailureCount,
		}, {
			result: { kind: 'partial', sessions: [], removedTaskIds: ['task-50'], failedTaskIds: ids.slice(0, 50) },
			retained: 'Original', unexpectedRequests: [], batches: 2, failures: 1,
		});
	}));
});

suite('CloudSandboxApiService discovery telemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const date = 'Tue, 22 Sep 2026 10:00:00 GMT';
	const emptyScan = {
		trigger: 'unknown', requestedMode: 'full', mode: 'full', outcome: 'complete',
		pageCount: undefined, listRequestCount: undefined, listOperationCount: 4, taskCount: 0, sandboxTaskCount: 0,
		changedSandboxTaskCount: 0, checkpointAdvanced: true, validDuration: true,
	};
	const summarize = (event: ICloudSandboxDiscoveryTelemetryData) => ({
		trigger: event.trigger, requestedMode: event.requestedMode, mode: event.mode, outcome: event.outcome,
		pageCount: event.pageCount, listRequestCount: event.listRequestCount, listOperationCount: event.listOperationCount, taskCount: event.taskCount,
		sandboxTaskCount: event.sandboxTaskCount, changedSandboxTaskCount: event.changedSandboxTaskCount, checkpointAdvanced: event.checkpointAdvanced,
		validDuration: Number.isFinite(event.durationMs) && event.durationMs >= 0,
	});

	test('distinguishes scope initialization, missing checkpoints and explicit repair with a checkpoint', async () => {
		const h = createService(store, { tasks: [], repositories: new Map(), discoveryDate: () => date });
		await h.service.listSessions(CancellationToken.None, { incremental: true, includeArchived: false });
		await h.service.listSessions(CancellationToken.None, { incremental: true, includeArchived: true });
		await h.service.listSessions(CancellationToken.None, { incremental: true });
		await h.service.listSessions(CancellationToken.None, { diagnostics: { intentMode: 'incremental', fullScanReason: 'reconciliationDue' } });
		assert.deepStrictEqual(h.discoveryEvents.map(event => ({
			mode: event.mode, reason: event.fullScanReason, available: event.checkpointAvailable, source: event.checkpointSource,
		})), [
			{ mode: 'full', reason: 'noCheckpoint', available: false, source: 'serverDate' },
			{ mode: 'full', reason: 'scopeInitialization', available: false, source: 'serverDate' },
			{ mode: 'incremental', reason: 'notFull', available: true, source: 'serverDate' },
			{ mode: 'full', reason: 'reconciliationDue', available: true, source: 'serverDate' },
		]);
	});

	test('distinguishes list and batch failures from optional label failures', async () => {
		const h = createService(store, {
			tasks: [task('bad', 'Bad detail', undefined, 's1', 'e1'), task('label', 'Optional label', 42, 's2', 'e2')],
			repositories: new Map([[42, 'error']]),
			onRequest: url => url.pathname === '/agents/tasks/batch' && url.searchParams.get('task_ids') === 'bad'
				|| url.pathname === '/agents/tasks' && url.searchParams.get('is_archived') === 'true'
				? jsonResponse({}, 503) : undefined,
		});
		await h.service.listSessions(CancellationToken.None);
		const listDetailReads = h.requestedUrls.filter(url => new URL(url).pathname.startsWith('/agents/tasks/'));
		await h.service.listSessions(CancellationToken.None, { taskIds: ['bad'], trigger: 'feedChange' });
		await h.service.listSessions(CancellationToken.None, { taskIds: ['label'], trigger: 'feedChange' });
		const summarizeFailures = (event: ICloudSandboxDiscoveryTelemetryData) => ({
			outcome: event.outcome, lists: event.listOperationFailureCount, batches: event.taskBatchOperationFailureCount, details: event.taskDetailFailureCount,
			labels: event.repositoryEnrichmentMissCount, unresolved: event.unresolvedTaskCount,
			advanced: event.checkpointAdvanced, invalidated: event.generationInvalidated,
		});
		assert.deepStrictEqual({ listDetailReads, events: h.discoveryEvents.map(summarizeFailures) }, {
			listDetailReads: [],
			events: [
				{ outcome: 'failed', lists: 1, batches: 0, details: 0, labels: 0, unresolved: 0, advanced: false, invalidated: false },
				{ outcome: 'partial', lists: 0, batches: 1, details: 0, labels: 0, unresolved: 1, advanced: false, invalidated: false },
				{ outcome: 'incremental', lists: 0, batches: 0, details: 0, labels: 1, unresolved: 0, advanced: false, invalidated: false },
			],
		});
	});

	test('counts successful bounded pagination separately from failures and generation invalidation', async () => {
		const h = createService(store, {
			tasks: [task('one', 'One', undefined, 's1', 'e1')], repositories: new Map(),
			onRequest: url => url.pathname === '/agents/tasks'
				? jsonResponse({ tasks: [task('one', 'One', undefined, 's1', 'e1')] }, 200, { link: `<?page=${Number(url.searchParams.get('page')) + 1}>; rel="next"` })
				: undefined,
		});
		await h.service.listSessions(CancellationToken.None);
		const bounded = h.discoveryEvents[0];
		const entered = new DeferredPromise<void>();
		const pending = new DeferredPromise<void>();
		const invalidated = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: async url => {
				if (url.pathname === '/agents/tasks/removed') {
					return jsonResponse({}, 204);
				}
				if (!entered.isSettled) {
					await entered.complete();
					await pending.p;
				}
				return undefined;
			},
		});
		const scan = invalidated.service.listSessions(CancellationToken.None);
		await entered.p;
		await invalidated.service.deleteTask('removed', CancellationToken.None);
		await pending.complete();
		await scan;
		assert.deepStrictEqual({
			bounded: { outcome: bounded.outcome, unread: bounded.unreadPageScopeCount, failures: bounded.listOperationFailureCount, advanced: bounded.checkpointAdvanced },
			invalidated: { outcome: invalidated.discoveryEvents[0].outcome, generation: invalidated.discoveryEvents[0].generationInvalidated, advanced: invalidated.discoveryEvents[0].checkpointAdvanced },
		}, {
			bounded: { outcome: 'complete', unread: 4, failures: 0, advanced: true },
			invalidated: { outcome: 'failed', generation: true, advanced: false },
		});
	});

	test('reports checkpoint fallback, unchanged checkpoints and empty targeted reads', async () => {
		const h = createService(store, { tasks: [], repositories: new Map(), discoveryDate: () => date });
		await h.service.listSessions(CancellationToken.None, { incremental: true, trigger: 'feedRenewal' });
		await h.service.listSessions(CancellationToken.None, { incremental: true, trigger: 'poll' });
		await h.service.listSessions(CancellationToken.None, { taskIds: [], trigger: 'feedChange' });
		assert.deepStrictEqual(h.discoveryEvents.map(summarize), [
			{ ...emptyScan, trigger: 'feedRenewal', requestedMode: 'incremental' },
			{ ...emptyScan, trigger: 'poll', requestedMode: 'incremental', mode: 'incremental', outcome: 'incremental', checkpointAdvanced: false },
			{ ...emptyScan, trigger: 'feedChange', requestedMode: 'targeted', mode: 'targeted', outcome: 'incremental', listOperationCount: 0, checkpointAdvanced: false },
		]);
	});

	test('counts returned tasks separately from changed sandbox summaries', async () => {
		const tasks: ITestTask[] = [
			task('sandbox', 'Private task name', undefined, 'session', 'environment'),
			{ ...task('other', 'Other task', undefined, 'other-session', 'other-environment'), compute: { provider: 'codespaces' } },
		];
		const h = createService(store, { tasks, repositories: new Map(), discoveryDate: () => date });
		await h.service.listSessions(CancellationToken.None, { trigger: 'startup' });
		await h.service.listSessions(CancellationToken.None, { trigger: 'manual' });
		tasks[0] = { ...tasks[0], name: 'Changed private name' };
		await h.service.listSessions(CancellationToken.None, { taskIds: ['sandbox', 'sandbox'], trigger: 'feedChange' });
		assert.deepStrictEqual(h.discoveryEvents.map(summarize), [
			{ ...emptyScan, trigger: 'startup', taskCount: 2, sandboxTaskCount: 1, changedSandboxTaskCount: 1 },
			{ ...emptyScan, trigger: 'manual', taskCount: 2, sandboxTaskCount: 1, checkpointAdvanced: false },
			{ ...emptyScan, trigger: 'feedChange', requestedMode: 'targeted', mode: 'targeted', outcome: 'incremental', listOperationCount: 0, taskCount: 1, sandboxTaskCount: 1, changedSandboxTaskCount: 1, checkpointAdvanced: false },
		]);
	});

	test('deduplicates returned tasks while counting logical list operations', async () => {
		const repeated = task('repeated', 'Private task', undefined, 'session', 'environment');
		const h = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: url => url.pathname === '/agents/tasks' && url.searchParams.get('with_repo') === 'false' && url.searchParams.get('is_archived') === 'false'
				? jsonResponse({ tasks: [repeated] }, 200, url.searchParams.get('page') === '1' ? { link: '<?page=2>; rel="next"' } : {})
				: url.pathname === '/agents/tasks/repeated' ? jsonResponse(repeated) : undefined,
		});
		await h.service.listSessions(CancellationToken.None);
		assert.deepStrictEqual(h.discoveryEvents.map(summarize), [
			{ ...emptyScan, taskCount: 1, sandboxTaskCount: 1, changedSandboxTaskCount: 1 },
		]);
	});

	test('counts a refused list once without estimating transport attempts', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createService(store, { tasks: [], repositories: new Map(), rateLimitedListPages: 2, retryAfterSeconds: 1 });
		await h.service.listSessions(CancellationToken.None);
		assert.deepStrictEqual(h.discoveryEvents.map(summarize), [{ ...emptyScan, outcome: 'failed', listOperationCount: 1, checkpointAdvanced: false }]);
	}));

	for (const status of [401, 403]) {
		test(`paces automatic inventory after HTTP ${status} while preserving manual and targeted reads`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			let refused = true;
			const h = createService(store, {
				tasks: [task('one', 'One', undefined, 'session', 'environment')], repositories: new Map(),
				onRequest: url => refused && url.pathname === '/agents/tasks' ? jsonResponse({}, status) : undefined,
			});
			await h.service.listSessions(CancellationToken.None, { trigger: 'startup' });
			await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal', incremental: true });
			await h.service.listSessions(CancellationToken.None, { trigger: 'feedReconnect' });
			await h.service.listSessions(CancellationToken.None, { trigger: 'poll', incremental: true });
			await h.service.listSessions(CancellationToken.None, { trigger: 'manual' });
			await h.service.listSessions(CancellationToken.None, { trigger: 'feedChange', taskIds: ['one'] });
			refused = false;
			await timeout(15 * 60_000);
			await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal', incremental: true });
			assert.deepStrictEqual(h.discoveryEvents.map(event => [event.outcome, event.listOperationCount]), [
				['failed', 1], ['failed', 0], ['failed', 0], ['failed', 0], ['failed', 1], ['incremental', 0], ['complete', 4],
			]);
		}));
	}

	test('a successful manual refresh clears authorization pacing for automatic inventory', async () => {
		let refused = true;
		const h = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: url => refused && url.pathname === '/agents/tasks' ? jsonResponse({}, 403) : undefined,
		});
		await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal' });
		refused = false;
		await h.service.listSessions(CancellationToken.None, { trigger: 'manual' });
		await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal', incremental: true });
		assert.deepStrictEqual(h.discoveryEvents.map(event => [event.outcome, event.listOperationCount]), [
			['failed', 1], ['complete', 4], ['incremental', 4],
		]);
	});

	test('preserves a longer authorization Retry-After without extending it on deferred reads', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let refused = true;
		const h = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: url => refused && url.pathname === '/agents/tasks' ? jsonResponse({}, 403, { 'retry-after': '1800' }) : undefined,
		});
		await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal' });
		refused = false;
		await timeout(15 * 60_000);
		await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal' });
		await timeout(15 * 60_000);
		await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal' });
		assert.deepStrictEqual(h.discoveryEvents.map(event => [event.outcome, event.listOperationCount]), [
			['failed', 1], ['failed', 0], ['complete', 4],
		]);
	}));

	test('an obsolete inventory refusal cannot pace the current authorization', async () => {
		const entered = new DeferredPromise<void>();
		const pending = new DeferredPromise<void>();
		const h = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: async url => {
				if (url.pathname === '/agents/tasks' && !entered.isSettled) {
					await entered.complete();
					await pending.p;
					return jsonResponse({}, 403);
				}
				return undefined;
			},
		});
		const stale = h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal' });
		await entered.p;
		const changed = Event.toPromise(h.service.onDidChangeAccount);
		h.changeAuthentication();
		await changed;
		await pending.complete();
		await stale;
		await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal' });
		assert.deepStrictEqual(h.discoveryEvents.map(event => [event.outcome, event.listOperationCount]), [['failed', 1], ['complete', 4]]);
	});

	test('shared cooldown protects the credential refused after in-request authentication recovery', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let accessToken = 'original';
		const credentials: (IHeaders[string] | undefined)[] = [];
		const h = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => [{ accessToken, id: 's', account: { id: 'a', label: 'a' }, scopes: [] }],
			onRequest: (url, _token, options) => {
				if (url.pathname !== '/agents/tasks') {
					return undefined;
				}
				credentials.push(options.headers?.Authorization);
				if (accessToken === 'original') {
					accessToken = 'replacement';
					return jsonResponse({}, 401);
				}
				return jsonResponse({}, 403, { 'retry-after': '1800' });
			},
		});
		await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal' });
		await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal' });
		await timeout(15 * 60_000);
		await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal' });
		assert.deepStrictEqual({ credentials, reads: h.discoveryEvents.map(event => event.listOperationCount) }, {
			credentials: ['Bearer original', 'Bearer replacement'], reads: [1, 1, 1],
		});
	}));

	for (const change of ['credential', 'account', 'scopes', 'profile', 'authentication event'] as const) {
		test(`retries refused inventory immediately after a ${change} change`, async () => {
			let accessToken = 'original';
			let accountId = 'a';
			let scopes: string[] = [];
			let refused = true;
			const h = createService(store, {
				tasks: [], repositories: new Map(),
				authenticationSessions: async () => [{ accessToken, id: 's', account: { id: accountId, label: accountId }, scopes }],
				onRequest: url => refused && url.pathname === '/agents/tasks' ? jsonResponse({}, 403) : undefined,
			});
			await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal' });
			if (change === 'credential') {
				accessToken = 'replacement';
			} else if (change === 'account') {
				accountId = 'b';
			} else if (change === 'scopes') {
				scopes = ['repo'];
			} else {
				const changed = Event.toPromise(h.service.onDidChangeAccount);
				if (change === 'profile') {
					h.changeProfile('replacement');
				} else {
					h.changeAuthentication();
				}
				await changed;
			}
			refused = false;
			await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal' });
			assert.deepStrictEqual(h.discoveryEvents.map(event => [event.outcome, event.listOperationCount]), [['failed', 1], ['complete', 4]]);
		});
	}

	for (const response of [
		{ status: 403, body: { error_code: 'rate_limit_exceeded' } },
		{ status: 503, body: {} },
	]) {
		test(`does not apply authorization pacing to HTTP ${response.status} ${JSON.stringify(response.body)}`, () => runWithFakedTimers({}, async () => {
			const h = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: url => url.pathname === '/agents/tasks' ? jsonResponse(response.body, response.status) : undefined,
			});
			await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal' });
			await h.service.listSessions(CancellationToken.None, { trigger: 'feedRenewal' });
			assert.deepStrictEqual(h.discoveryEvents.map(event => [event.outcome, event.listOperationCount]), [['failed', 1], ['failed', 1]]);
		}));
	}

	test('detail endpoint failures do not block summary discovery or its checkpoint', async () => {
		let fail = true;
		const h = createService(store, {
			tasks: [task('one', 'One', undefined, 's1', 'e1'), task('two', 'Two', undefined, 's2', 'e2')],
			repositories: new Map(),
			onRequest: url => fail && url.pathname === '/agents/tasks/two' ? jsonResponse({}, 503) : undefined,
		});
		await h.service.listSessions(CancellationToken.None);
		fail = false;
		await h.service.listSessions(CancellationToken.None, { incremental: true });
		assert.deepStrictEqual(h.discoveryEvents.map(summarize), [
			{ ...emptyScan, taskCount: 2, sandboxTaskCount: 2, changedSandboxTaskCount: 2 },
			{ ...emptyScan, requestedMode: 'incremental', mode: 'incremental', outcome: 'incremental', taskCount: 2, sandboxTaskCount: 2, checkpointAdvanced: false },
		]);
	});

	test('records cancellation with counters for the work already attempted', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		const h = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: url => {
				if (url.searchParams.get('page') === '2') {
					cancellation.cancel();
					throw new CancellationError();
				}
				return jsonResponse({ tasks: [] }, 200, { link: '<?page=2>; rel="next"' });
			},
		});
		await assert.rejects(h.service.listSessions(cancellation.token), CancellationError);
		assert.deepStrictEqual(h.discoveryEvents.map(summarize), [
			{ ...emptyScan, outcome: 'cancelled', listOperationCount: 1, checkpointAdvanced: false },
		]);
		assert.strictEqual(h.discoveryEvents[0].checkpointSource, 'unavailable');
	});

	test('retains the observed checkpoint source when an empty partition is followed by a list failure', async () => {
		const h = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: url => url.searchParams.get('with_repo') === 'true'
				? jsonResponse({ tasks: [] }, 200, { date })
				: jsonResponse({}, 503),
		});
		await h.service.listSessions(CancellationToken.None);
		assert.deepStrictEqual(h.discoveryEvents.map(event => ({
			source: event.checkpointSource, outcome: event.outcome, advanced: event.checkpointAdvanced, lists: event.listOperationCount,
		})), [{ source: 'serverDate', outcome: 'failed', advanced: false, lists: 2 }]);
	});

	test('reports malformed successful HTTP responses as failed discovery', async () => {
		const h = createService(store, { tasks: [], repositories: new Map(), onRequest: () => jsonResponse({ privateData: 'not a task list' }) });
		await h.service.listSessions(CancellationToken.None);
		assert.deepStrictEqual(h.discoveryEvents.map(summarize), [
			{ ...emptyScan, outcome: 'failed', listOperationCount: 1, checkpointAdvanced: false },
		]);
	});

	test('does not count list operations when authentication prevents discovery', async () => {
		const h = createService(store, { tasks: [], repositories: new Map(), authenticationSessions: async () => [] });
		await h.service.listSessions(CancellationToken.None);
		assert.deepStrictEqual(h.discoveryEvents.map(summarize), [
			{ ...emptyScan, outcome: 'failed', listOperationCount: 0, checkpointAdvanced: false },
		]);
	});

	test('concurrent targeted and inventory reads retain separate counters', async () => {
		const entered = new DeferredPromise<void>();
		const pending = new DeferredPromise<void>();
		const h = createService(store, {
			tasks: [task('one', 'One', undefined, 's1', 'e1')], repositories: new Map(), discoveryDate: () => date,
			onRequest: async url => {
				if (url.pathname === '/agents/tasks' && !entered.isSettled) {
					await entered.complete();
					await pending.p;
				}
				return undefined;
			},
		});
		const inventory = h.service.listSessions(CancellationToken.None, { trigger: 'startup' });
		await entered.p;
		await h.service.listSessions(CancellationToken.None, { taskIds: ['one'], trigger: 'feedChange' });
		await pending.complete();
		await inventory;
		assert.deepStrictEqual(h.discoveryEvents.map(summarize), [
			{ ...emptyScan, trigger: 'feedChange', requestedMode: 'targeted', mode: 'targeted', outcome: 'incremental', listOperationCount: 0, taskCount: 1, sandboxTaskCount: 1, changedSandboxTaskCount: 1, checkpointAdvanced: false },
			{ ...emptyScan, trigger: 'startup', taskCount: 1, sandboxTaskCount: 1, changedSandboxTaskCount: 1 },
		]);
	});
});

suite('CloudSandboxApiService identity credentials', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const accountKey = JSON.stringify(['github', 'a']);
	const endpoint = 'https://api.github.com/cmc_internal/api/agents/environments/tokens';

	test('exchanges the selected GitHub credential without replacing REST authentication', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const started = Date.now();
		const requests: { url: string; method?: string; authorization?: IHeaders[string]; contentType?: IHeaders[string]; data?: string }[] = [];
		const { service, requestOutcomes } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: async (url, _token, options) => {
				requests.push({ url: url.toString(), method: options.type, authorization: options.headers?.Authorization, contentType: options.headers?.['Content-Type'], data: options.data });
				if (url.toString() === endpoint) {
					await timeout(500);
					return jsonResponse({ token: 'identity', expires_in: 60, expires_at: new Date(started + 90_000).toISOString() });
				}
				return jsonResponse({ id: 'env-1', name: 'Environment', kind: 'managed-sandbox', status: 'online' });
			},
		});
		const identity = await service.getIdentityToken(accountKey, CancellationToken.None);
		const cached = await service.getIdentityToken(accountKey, CancellationToken.None);
		await service.getEnvironment('env-1', CancellationToken.None);
		assert.deepStrictEqual({ identity, cached, requests, requestOutcomes }, {
			identity: { token: 'identity', expiresAt: started + 60_000 },
			cached: identity,
			requests: [
				{ url: endpoint, method: 'POST', authorization: 'Bearer tok', contentType: 'application/json', data: '{}' },
				{ url: 'https://api.githubcopilot.com/agents/environments/env-1', method: 'GET', authorization: 'Bearer tok', contentType: undefined, data: undefined },
			],
			requestOutcomes: [['mintIdentityToken', 'succeeded']],
		});
	}));

	test('does not replay identity-token POSTs through authentication recovery', async () => {
		let lookups = 0;
		const authorizations: IHeaders[string][] = [];
		const { service, requestOutcomes } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => [{
				id: 's', scopes: [], accessToken: ++lookups === 1 ? 'old' : 'replacement', account: { id: 'a', label: 'a' },
			}],
			onRequest: (_url, _token, options) => {
				authorizations.push(options.headers?.Authorization);
				return jsonResponse({ error_code: 'unauthenticated' }, 401);
			},
		});
		await assert.rejects(service.getIdentityToken(accountKey, CancellationToken.None), { statusCode: 401 });
		assert.deepStrictEqual({ lookups, authorizations, requestOutcomes }, {
			lookups: 1, authorizations: ['Bearer old'], requestOutcomes: [['mintIdentityToken', 'clientError']],
		});
	});

	test('preserves network failure attribution when acquiring identity credentials', async () => {
		const failure = new GitHubRequestError('network unavailable', 'network');
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			missionControlProvider: { request: async () => { throw failure; } },
		});
		await assert.rejects(service.getIdentityToken(accountKey, CancellationToken.None), error => error instanceof Error
			&& error.name === 'CloudSandboxNetworkError' && error.cause === undefined);
	});

	test('refreshes the identity cache after a REST request recovers with a new GitHub credential', async () => {
		let lookups = 0;
		let environmentRequests = 0;
		const requests: { method?: string; authorization?: IHeaders[string] }[] = [];
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => [{
				id: 's', scopes: [], accessToken: ++lookups <= 2 ? 'old' : 'new', account: { id: 'a', label: 'a' },
			}],
			onRequest: (url, _token, options) => {
				requests.push({ method: options.type, authorization: options.headers?.Authorization });
				if (url.toString() === endpoint) {
					return jsonResponse({ token: requests.length === 1 ? 'first-identity' : 'second-identity', expires_in: 120 });
				}
				return ++environmentRequests === 1
					? jsonResponse({ error_code: 'unauthenticated' }, 401)
					: jsonResponse({ id: 'env-1', name: 'Environment', kind: 'managed-sandbox', status: 'online' });
			},
		});
		const first = await service.getIdentityToken(accountKey, CancellationToken.None);
		await service.getEnvironment('env-1', CancellationToken.None);
		const second = await service.getIdentityToken(accountKey, CancellationToken.None);
		assert.deepStrictEqual({ first: first.token, second: second.token, lookups, requests }, {
			first: 'first-identity', second: 'second-identity', lookups: 4,
			requests: [
				{ method: 'POST', authorization: 'Bearer old' },
				{ method: 'GET', authorization: 'Bearer old' },
				{ method: 'GET', authorization: 'Bearer new' },
				{ method: 'POST', authorization: 'Bearer new' },
			],
		});
	});

	for (const kind of ['sessions', 'register', 'unregister'] as const) {
		test(`${kind} changes discard cached and in-flight credentials`, async () => {
			const issued = new DeferredPromise<void>();
			const response = new DeferredPromise<IRequestContext>();
			let requests = 0;
			const { service, changeAuthentication } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: () => {
					if (++requests === 2) {
						void issued.complete();
						return response.p;
					}
					return jsonResponse({ token: `identity-${requests}`, expires_in: 120 });
				},
			});
			await service.getIdentityToken(accountKey, CancellationToken.None);
			changeAuthentication(kind);
			const cancelled = assert.rejects(service.getIdentityToken(accountKey, CancellationToken.None), isCancellationError);
			await issued.p;
			changeAuthentication(kind);
			await cancelled;
			const current = await service.getIdentityToken(accountKey, CancellationToken.None);
			await response.complete(jsonResponse({ token: 'obsolete', expires_in: 120 }));
			const cached = await service.getIdentityToken(accountKey, CancellationToken.None);
			assert.deepStrictEqual({ current: current.token, cached: cached.token, requests }, { current: 'identity-3', cached: 'identity-3', requests: 3 });
		});
	}

	test('sign-out cancels unresolved account lookup before any exchange', async () => {
		const sessions = new DeferredPromise<readonly AuthenticationSession[]>();
		let signedOut = false;
		const { service, changeAuthentication, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: () => signedOut ? Promise.resolve([]) : sessions.p,
		});
		const cancelled = assert.rejects(service.getIdentityToken(accountKey, CancellationToken.None), isCancellationError);
		signedOut = true;
		changeAuthentication();
		await cancelled;
		await sessions.complete([{ accessToken: 'obsolete', id: 's', account: { id: 'a', label: 'a' }, scopes: [] }]);
		await assert.rejects(service.getIdentityToken(accountKey, CancellationToken.None), CloudSandboxAuthenticationRequiredError);
		assert.deepStrictEqual(requestedUrls, []);
	});

	test('rejects a different account and rotates credentials when the GitHub session changes', async () => {
		let accessToken = 'first';
		const authorizations: IHeaders[string][] = [];
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => [{ accessToken, id: 's', account: { id: 'a', label: 'a' }, scopes: [] }],
			onRequest: (_url, _token, options) => {
				authorizations.push(options.headers?.Authorization);
				return jsonResponse({ token: `identity-${authorizations.length}`, expires_in: 120 });
			},
		});
		await assert.rejects(service.getIdentityToken(JSON.stringify(['github', 'other']), CancellationToken.None), isCancellationError);
		const first = await service.getIdentityToken(accountKey, CancellationToken.None);
		accessToken = 'second';
		const second = await service.getIdentityToken(accountKey, CancellationToken.None);
		assert.deepStrictEqual({ first: first.token, second: second.token, authorizations }, {
			first: 'identity-1', second: 'identity-2', authorizations: ['Bearer first', 'Bearer second'],
		});
	});

	for (const status of [403, 429]) {
		test(`honors HTTP ${status} Retry-After within the retry budget`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const started = Date.now();
			const times: number[] = [];
			const { service } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: () => {
					times.push(Date.now() - started);
					return times.length === 1
						? jsonResponse({}, status, { 'retry-after': '2' })
						: jsonResponse({ token: 'identity', expires_in: 120 });
				},
			});
			const identity = await service.getIdentityToken(accountKey, CancellationToken.None);
			assert.deepStrictEqual({ token: identity.token, times }, { token: 'identity', times: [0, 2000] });
		}));

	}

	test('rejects a malformed JSON response without exposing its body', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => ({
				res: { statusCode: 200, headers: {} },
				stream: bufferToStream(VSBuffer.fromString('private-invalid-response')),
			}),
		});
		await assert.rejects(service.getIdentityToken(accountKey, CancellationToken.None), error =>
			error instanceof Error && error.message.includes('invalid') && !error.message.includes('private-invalid-response'));
		assert.strictEqual(requestedUrls.length, 1);
	});

	for (const failure of ['HTTP', 'network', 'body'] as const) {
		test(`does not expose credentials in ${failure} errors or logs`, async () => {
			const logService = store.add(new TestLogService());
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(), logService,
				onRequest: () => {
					if (failure === 'network') {
						throw new Error('private-credential');
					}
					if (failure === 'body') {
						const stream = newWriteableBufferStream();
						stream.error(new Error('private-credential'));
						return { res: { statusCode: 200, headers: {} }, stream };
					}
					return jsonResponse({ token: 'private-credential' }, 403);
				},
			});
			await assert.rejects(service.getIdentityToken(accountKey, CancellationToken.None), error =>
				error instanceof Error && !error.message.includes('private-credential') && error.cause === undefined);
			assert.deepStrictEqual({
				requests: requestedUrls.length,
				exposesCredential: [...logService.traces, ...logService.infos, ...logService.debugs, ...logService.errors].some(message => String(message).includes('private-credential')),
			}, { requests: 1, exposesCredential: false });
		});
	}

	test('does not issue an exchange after cancellation or disposal', async () => {
		const { service, requestedUrls } = createService(store, { tasks: [], repositories: new Map() });
		await assert.rejects(service.getIdentityToken(accountKey, CancellationToken.Cancelled), isCancellationError);
		service.dispose();
		await assert.rejects(service.getIdentityToken(accountKey, CancellationToken.None), isCancellationError);
		assert.deepStrictEqual(requestedUrls, []);
	});
});

suite('CloudSandboxApiService token sealing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const request: ICloudSandboxSealTokenRequest = { environmentId: 'env/with spaces', token: 'private-identity' };
	const endpoint = 'https://api.github.com/cmc_internal/api/agents/environments/env%2Fwith%20spaces/seal-token';
	const key = { key_id: 'AAAAAAAAAAA', use: 'auth-token', algorithm: 'x25519-sealedbox', public_key: `${'A'.repeat(43)}=` };
	const sealedToken = `copilot-sealed.v1.${key.key_id}.${'A'.repeat(64)}`;
	const response = { encrypted_github_token: sealedToken, host_encryption_key: key };

	async function readPreparationError(preparation: Promise<ICloudSandboxPreparedAuthentication>): Promise<Error> {
		try {
			await preparation;
		} catch (error) {
			assert.ok(error instanceof Error);
			return error;
		}
		assert.fail('Expected authentication preparation to fail.');
	}

	test('prepares authentication early and seals with the captured GitHub credential', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const environment = new DeferredPromise<ICloudSandboxAuthenticationTarget>();
		const mintStarted = new DeferredPromise<void>();
		const requests: { path: string; authorization?: IHeaders[string]; data?: string }[] = [];
		const started = Date.now();
		let authentications = 0;
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => [{
				id: 'session', account: { id: 'a', label: 'a' }, scopes: [],
				accessToken: ++authentications <= 2 ? 'original' : 'different',
			}],
			onRequest: (url, _token, options) => {
				requests.push({ path: url.pathname, authorization: options.headers?.Authorization, data: options.data });
				if (url.pathname.endsWith('/tokens')) {
					void mintStarted.complete();
					return jsonResponse({ token: request.token, expires_in: 120 });
				}
				return jsonResponse(response);
			},
		});
		const prepared = service.prepareSandboxAuthentication(JSON.stringify(['github', 'a']), environment.p, CancellationToken.None);
		await mintStarted.p;
		const beforeEnvironment = requests.map(request => request.path);
		const target = { environmentId: request.environmentId, resource: 'https://api.github.com' };
		await environment.complete(target);
		assert.deepStrictEqual({ beforeEnvironment, result: await prepared, requests, authentications }, {
			beforeEnvironment: ['/cmc_internal/api/agents/environments/tokens'],
			result: { ...response, ...target, expiresAt: started + 120_000 },
			requests: [
				{ path: '/cmc_internal/api/agents/environments/tokens', authorization: 'Bearer original', data: '{}' },
				{ path: '/cmc_internal/api/agents/environments/env%2Fwith%20spaces/seal-token', authorization: 'Bearer original', data: JSON.stringify({ token: request.token, resource: target.resource }) },
			],
			authentications: 2,
		});
	}));

	test('observes early preparation errors and preserves them for a later await', async () => {
		const observed = new DeferredPromise<void>();
		const logService = store.add(new class extends TestLogService {
			override warn(message: string, ...args: unknown[]): void {
				super.warn(message, ...args);
				void observed.complete();
			}
		}());
		const { service } = createService(store, {
			tasks: [], repositories: new Map(), logService,
			onRequest: () => jsonResponse({ token: 'private-response' }, 403),
		});
		const preparation = service.prepareSandboxAuthentication(JSON.stringify(['github', 'a']),
			Promise.resolve({ environmentId: 'env-1', resource: 'https://api.github.com' }), CancellationToken.None);
		await observed.p;
		const error = await readPreparationError(preparation);
		assert.ok(error instanceof CloudSandboxRequestError);
		assert.deepStrictEqual({ status: error.statusCode, warnings: logService.warnings }, {
			status: 403, warnings: ['[CloudSandboxApi] Sandbox authentication preparation failed.'],
		});
	});

	test('account changes cancel the composed sealing request and reject a late response', async () => {
		const sealStarted = new DeferredPromise<CancellationToken>();
		const sealResponse = new DeferredPromise<IRequestContext>();
		const logService = store.add(new TestLogService());
		const { service, changeAuthentication } = createService(store, {
			tasks: [], repositories: new Map(), logService,
			onRequest: (url, token) => {
				if (url.pathname.endsWith('/tokens')) {
					return jsonResponse({ token: request.token, expires_in: 120 });
				}
				void sealStarted.complete(token);
				return sealResponse.p;
			},
		});
		const failed = readPreparationError(service.prepareSandboxAuthentication(JSON.stringify(['github', 'a']),
			Promise.resolve({ environmentId: 'env-1', resource: 'https://api.github.com' }), CancellationToken.None));
		const token = await sealStarted.p;
		changeAuthentication();
		const error = await failed;
		await sealResponse.complete(jsonResponse(response));
		assert.deepStrictEqual({ cancelled: isCancellationError(error), requestCancelled: token.isCancellationRequested, warnings: logService.warnings }, {
			cancelled: true, requestCancelled: true, warnings: [],
		});
	});

	async function readSealingError(service: CloudSandboxApiService, input = request, token = CancellationToken.None): Promise<Error> {
		try {
			await service.sealToken(input, token);
		} catch (error) {
			assert.ok(error instanceof Error);
			return error;
		}
		assert.fail('Expected token sealing to fail.');
	}

	for (const algorithm of ['x25519-sealedbox', 'hpke-x25519-hkdf-sha256-aes256gcm']) {
		for (const resource of [undefined, 'https://api.github.com']) {
			test(`requests server-side ${algorithm} sealing ${resource ? 'with' : 'without'} resource binding`, async () => {
				const requests: { url: string; method?: string; authorization?: IHeaders[string]; contentType?: IHeaders[string]; body: unknown }[] = [];
				const expected = { ...response, host_encryption_key: { ...key, algorithm } };
				const { service, requestOutcomes } = createService(store, {
					tasks: [], repositories: new Map(),
					onRequest: (url, _token, options) => {
						requests.push({
							url: url.toString(), method: options.type, authorization: options.headers?.Authorization,
							contentType: options.headers?.['Content-Type'], body: JSON.parse(options.data!),
						});
						return jsonResponse(expected);
					},
				});
				const sealed = await service.sealToken({ ...request, resource }, CancellationToken.None);
				assert.deepStrictEqual({ sealed, requests, requestOutcomes }, {
					sealed: expected,
					requests: [{
						url: endpoint, method: 'POST', authorization: 'Bearer tok', contentType: 'application/json',
						body: { token: request.token, ...(resource === undefined ? {} : { resource }) },
					}],
					requestOutcomes: [],
				});
			});
		}
	}

	test('seals the acquired identity token without changing the REST bearer or reusing envelopes', async () => {
		const requests: { method?: string; authorization?: IHeaders[string]; body?: string }[] = [];
		let seals = 0;
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: (url, _token, options) => {
				requests.push({ method: options.type, authorization: options.headers?.Authorization, body: options.data });
				if (url.pathname.endsWith('/tokens')) {
					return jsonResponse({ token: request.token, expires_in: 120 });
				}
				if (url.pathname.endsWith('/seal-token')) {
					seals++;
					return jsonResponse(response);
				}
				return jsonResponse({ id: 'env-1', name: 'Environment', kind: 'managed-sandbox', status: 'online' });
			},
		});
		const identity = await service.getIdentityToken(JSON.stringify(['github', 'a']), CancellationToken.None);
		await service.sealToken({ ...request, token: identity.token }, CancellationToken.None);
		await service.sealToken({ ...request, token: identity.token }, CancellationToken.None);
		await service.getEnvironment('env-1', CancellationToken.None);
		assert.deepStrictEqual({ seals, requests }, {
			seals: 2,
			requests: [
				{ method: 'POST', authorization: 'Bearer tok', body: '{}' },
				{ method: 'POST', authorization: 'Bearer tok', body: JSON.stringify({ token: request.token }) },
				{ method: 'POST', authorization: 'Bearer tok', body: JSON.stringify({ token: request.token }) },
				{ method: 'GET', authorization: 'Bearer tok', body: undefined },
			],
		});
	});

	for (const [name, invalid] of [
		['missing response', null],
		['plaintext token', { ...response, encrypted_github_token: 'private-identity' }],
		['missing token', { host_encryption_key: key }],
		['missing key', { encrypted_github_token: sealedToken }],
		['wrong key', { ...response, host_encryption_key: { ...key, key_id: 'BBBBBBBBBBB' } }],
		['wrong purpose', { ...response, host_encryption_key: { ...key, use: 'mcp-auth-token' } }],
		['unsupported algorithm', { ...response, host_encryption_key: { ...key, algorithm: 'unknown' } }],
		['short public key', { ...response, host_encryption_key: { ...key, public_key: 'AA==' } }],
		['malformed public key', { ...response, host_encryption_key: { ...key, public_key: '*' } }],
		['noncanonical public key', { ...response, host_encryption_key: { ...key, public_key: 'A'.repeat(43) } }],
		['missing ciphertext', { ...response, encrypted_github_token: `copilot-sealed.v1.${key.key_id}.` }],
		['short ciphertext', { ...response, encrypted_github_token: `copilot-sealed.v1.${key.key_id}.AA` }],
		['malformed ciphertext', { ...response, encrypted_github_token: `copilot-sealed.v1.${key.key_id}.*` }],
		['noncanonical ciphertext', { ...response, encrypted_github_token: `copilot-sealed.v1.${key.key_id}.${'A'.repeat(64)}AB` }],
		['oversized envelope', { ...response, encrypted_github_token: `copilot-sealed.v1.${key.key_id}.${'A'.repeat(64 * 1024)}` }],
	] as const) {
		test(`rejects ${name} without exposing the response`, async () => {
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(), onRequest: () => jsonResponse(invalid),
			});
			const error = await readSealingError(service);
			assert.deepStrictEqual({ message: error.message, requests: requestedUrls.length }, {
				message: 'The API may have accepted the operation; reconcile before trying again', requests: 1,
			});
		});
	}

	for (const status of [401, 403, 404, 409, 429, 500]) {
		test(`surfaces HTTP ${status} without replaying the sealing POST or exposing the body`, async () => {
			let authentications = 0;
			const logService = store.add(new TestLogService());
			const { service, requestedUrls, requestOutcomes } = createService(store, {
				tasks: [], repositories: new Map(), logService,
				authenticationSessions: async () => [{
					id: 'session', scopes: [], account: { id: 'a', label: 'a' }, accessToken: `github-${++authentications}`,
				}],
				onRequest: () => jsonResponse({ token: 'private-identity' }, status, { 'retry-after': '45', 'x-github-request-id': 'ABCD:1234:5678:90AB:CDEF' }),
			});
			const error = await readSealingError(service);
			assert.ok(error instanceof CloudSandboxRequestError);
			assert.deepStrictEqual({
				status: error.statusCode, retryAfter: error.retryAfterSeconds, message: error.message,
				authentications, requests: requestedUrls.length, requestOutcomes,
				exposesToken: [...logService.traces, ...logService.errors].some(message => String(message).includes(request.token)),
			}, {
				status, retryAfter: 45,
				message: `Mission Control token sealing failed: HTTP ${status} (requestId=ABCD:1234:5678:90AB:CDEF)`,
				authentications: 1, requests: 1, requestOutcomes: [], exposesToken: false,
			});
		});
	}

	for (const failure of ['network', 'body', 'JSON'] as const) {
		test(`sanitizes ${failure} failures`, async () => {
			const logService = store.add(new TestLogService());
			const { service } = createService(store, {
				tasks: [], repositories: new Map(), logService,
				onRequest: () => {
					if (failure === 'network') {
						throw new Error(request.token);
					}
					if (failure === 'body') {
						const stream = newWriteableBufferStream();
						stream.error(new Error(request.token));
						return { res: { statusCode: 200, headers: {} }, stream };
					}
					return { res: { statusCode: 200, headers: {} }, stream: bufferToStream(VSBuffer.fromString(request.token)) };
				},
			});
			const error = await readSealingError(service);
			assert.deepStrictEqual({
				exposesToken: [error.message, ...logService.traces, ...logService.errors].some(message => String(message).includes(request.token)),
				cause: error.cause,
			}, { exposesToken: false, cause: undefined });
		});
	}

	test('cancels a caller even when the HTTP transport delivers a late response', async () => {
		const source = store.add(new CancellationTokenSource());
		const issued = new DeferredPromise<void>();
		const pendingResponse = new DeferredPromise<IRequestContext>();
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => { void issued.complete(); return pendingResponse.p; },
		});
		const failed = readSealingError(service, request, source.token);
		await issued.p;
		source.cancel();
		const error = await failed;
		await pendingResponse.complete(jsonResponse(response));
		assert.deepStrictEqual({ cancelled: isCancellationError(error), requests: requestedUrls.length }, { cancelled: true, requests: 1 });
	});

	for (const [name, change] of [
		['empty environment', { environmentId: '' }],
		['parent environment segment', { environmentId: '..' }],
		['empty token', { token: ' ' }],
		['oversized token', { token: 'x'.repeat(32 * 1024 + 1) }],
		['invalid resource', { resource: 'not a URL' }],
		['oversized resource', { resource: 'https://example.test/'.padEnd(8193, 'x') }],
	] as const) {
		test(`rejects ${name} before making a request`, async () => {
			const { service, requestedUrls } = createService(store, { tasks: [], repositories: new Map() });
			await readSealingError(service, { ...request, ...change });
			assert.deepStrictEqual(requestedUrls, []);
		});
	}

	test('service disposal during account lookup prevents standalone sealing from sending credentials', async () => {
		const lookupStarted = new DeferredPromise<void>();
		const authentication = new DeferredPromise<readonly AuthenticationSession[]>();
		const { service, requestedUrls, requestOutcomes } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: () => {
				void lookupStarted.complete();
				return authentication.p;
			},
			onRequest: () => jsonResponse(response),
		});
		const failed = readSealingError(service);
		await lookupStarted.p;
		service.dispose();
		const error = await failed;
		await authentication.complete([{ id: 'session', accessToken: 'github-token', account: { id: 'a', label: 'a' }, scopes: [] }]);
		await timeout(0);
		assert.deepStrictEqual({ cancelled: isCancellationError(error), requestedUrls, requestOutcomes }, {
			cancelled: true, requestedUrls: [], requestOutcomes: [],
		});
	});

	test('service disposal cancels an in-flight standalone sealing request', async () => {
		const requestStarted = new DeferredPromise<CancellationToken>();
		const pendingResponse = new DeferredPromise<IRequestContext>();
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: (_url, token) => {
				void requestStarted.complete(token);
				return pendingResponse.p;
			},
		});
		const failed = readSealingError(service);
		const requestToken = await requestStarted.p;
		service.dispose();
		const requestCancelled = requestToken.isCancellationRequested;
		const error = await failed;
		await pendingResponse.complete(jsonResponse(response));
		assert.deepStrictEqual({ cancelled: isCancellationError(error), requestCancelled, requests: requestedUrls.length }, {
			cancelled: true, requestCancelled: true, requests: 1,
		});
	});

	test('requires sign-in and rejects calls after cancellation or disposal', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(), authenticationSessions: async () => [],
		});
		const signedOut = await readSealingError(service);
		const cancelled = await readSealingError(service, request, CancellationToken.Cancelled);
		service.dispose();
		const disposed = await readSealingError(service);
		assert.deepStrictEqual({
			signedOut: signedOut instanceof CloudSandboxAuthenticationRequiredError,
			cancelled: isCancellationError(cancelled), disposed: isCancellationError(disposed), requestedUrls,
		}, { signedOut: true, cancelled: true, disposed: true, requestedUrls: [] });
	});
});

suite('CloudSandboxApiService session feed', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function feedConnection() {
		return {
			url: 'wss://feed.example.test/client/hubs/opaque?access_token=secret',
			subprotocol: 'json.webpubsub.azure.v1',
			group: 'opaque-group',
			expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
			reconnect_after: new Date(Date.now() + 8 * 60_000).toISOString(),
			frame_schema_version: 1,
		};
	}

	test('negotiates on the GitHub gateway with the task account and strips unused credentials', async () => {
		const requests: { url: string; headers: IHeaders | undefined }[] = [];
		const connection = feedConnection();
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: (url, _token, options) => {
				requests.push({ url: url.toString(), headers: options.headers });
				return jsonResponse({ ...connection, access_token: 'unused-secret', hub: 'opaque' });
			},
		});
		const result = await service.connectSessionFeed(CancellationToken.None);
		assert.deepStrictEqual({
			url: requests[0].url,
			integration: requests[0].headers?.['Copilot-Integration-Id'],
			authenticated: !!requests[0].headers?.Authorization,
			result,
		}, {
			url: 'https://api.github.com/cmc_internal/api/agents/feed/connect',
			integration: COPILOT_INTEGRATION_ID, authenticated: true, result: connection,
		});
	});

	test('counts typed feed transport failures without inventing HTTP attempts for authentication or local validation', async () => {
		const outcomes: RequestOutcome[][] = [];
		for (const requestError of [
			new GitHubRequestError('private-network-error', 'network'),
			new GitHubRequestTimeoutError(true),
			new GitHubRequestTimeoutError(false),
			new GitHubRequestError('private-schema-error', 'schema'),
		]) {
			const h = createService(store, {
				tasks: [], repositories: new Map(),
				missionControlProvider: { request: async () => { throw requestError; } },
			});
			await assert.rejects(h.service.connectSessionFeed(CancellationToken.None));
			outcomes.push(h.requestOutcomes);
		}
		const signedOut = createService(store, { tasks: [], repositories: new Map(), authenticationSessions: async () => [] });
		await assert.rejects(signedOut.service.connectSessionFeed(CancellationToken.None));
		outcomes.push(signedOut.requestOutcomes);
		assert.deepStrictEqual(outcomes, [
			[['connectSessionFeed', 'networkError']], [['connectSessionFeed', 'networkError']], [], [], [],
		]);
	});

	test('counts dispatched feed timeouts through the production Mission Control provider conversion', async () => {
		const outcomes: RequestOutcome[][] = [];
		for (const dispatched of [false, true]) {
			const provider = new LocalMissionControlRequestProvider({
				apiBaseUri: 'https://api.githubcopilot.com/agents',
				feedApiBaseUri: 'https://api.github.com/cmc_internal/api/agents',
				integrationId: 'test',
			}, {
				onDidInvalidate: Event.None,
				getCredential: async () => ({
					account: { host: 'github.com', accountId: 'a' }, token: 'tok', generation: 0, signal: new AbortController().signal,
				}),
				handleRequestError: () => { },
			}, new class extends mock<IGitHubTransport>() {
				override async restText(_account: AccountHandle, _token: string, request: GitHubRestTextRequest): Promise<never> {
					if (dispatched) {
						request.onDidDispatch?.();
					}
					throw new GitHubRequestTimeoutError(dispatched);
				}
			}(), new NullLogService());
			const h = createService(store, { tasks: [], repositories: new Map(), missionControlProvider: provider });
			await assert.rejects(h.service.connectSessionFeed(CancellationToken.None));
			outcomes.push(h.requestOutcomes);
		}
		assert.deepStrictEqual(outcomes, [[], [['connectSessionFeed', 'networkError']]]);
	});

	test('honors relative feed lifetimes independently of the local wall clock', async () => {
		const results = [];
		for (const skew of [60 * 60_000, -60 * 60_000]) {
			const connection = {
				...feedConnection(),
				expires_at: new Date(Date.now() - skew + 10 * 60_000).toISOString(),
				reconnect_after: new Date(Date.now() - skew + 8 * 60_000).toISOString(),
				expires_in: 10 * 60_000,
				reconnect_in: 8 * 60_000,
			};
			const { service } = createService(store, {
				tasks: [], repositories: new Map(), onRequest: () => jsonResponse(connection),
			});
			const result = await service.connectSessionFeed(CancellationToken.None);
			results.push({ expiresIn: result?.expires_in, reconnectIn: result?.reconnect_in });
		}
		assert.deepStrictEqual(results, [
			{ expiresIn: 600_000, reconnectIn: 480_000 },
			{ expiresIn: 600_000, reconnectIn: 480_000 },
		]);
	});

	for (const status of [403, 404]) {
		test(`retains polling when feed negotiation returns ${status}`, async () => {
			const logService = new TestLogService();
			const { service } = createService(store, {
				tasks: [], repositories: new Map(), onRequest: () => jsonResponse({}, status), logService,
			});
			assert.deepStrictEqual({
				result: await service.connectSessionFeed(CancellationToken.None), warnings: logService.warnings, errors: logService.errors,
			}, { result: undefined, warnings: [], errors: [] });
		});
	}

	for (const status of [401, 429, 503]) {
		test(`surfaces negotiation HTTP ${status} with retry metadata`, async () => {
			const logService = new TestLogService();
			const { service } = createService(store, {
				tasks: [], repositories: new Map(), onRequest: () => jsonResponse({}, status, { 'retry-after': '30' }), logService,
			});
			await assert.rejects(service.connectSessionFeed(CancellationToken.None), {
				statusCode: status, retryAfterSeconds: 30,
			});
			assert.deepStrictEqual({ warnings: logService.warnings, errors: logService.errors }, { warnings: [], errors: [] });
		});
	}

	for (const [name, invalid] of [
		['insecure URL', { url: 'ws://feed.example.test/?access_token=secret' }],
		['invalid URL', { url: 'not a URL secret' }],
		['URL credentials', { url: 'wss://user:password@feed.example.test/' }],
		['URL fragment', { url: 'wss://feed.example.test/#secret' }],
		['expired renewal timestamp', { reconnect_after: new Date(0).toISOString() }],
		['renewal timestamp after expiry', { get reconnect_after() { return new Date(Date.now() + 20 * 60_000).toISOString(); } }],
		['unsupported schema version', { frame_schema_version: 2 }],
		['unsupported subprotocol', { subprotocol: 'json.reliable.webpubsub.azure.v1' }],
		['empty group', { group: '' }],
		['missing relative renewal', { expires_in: 600_000 }],
		['missing relative expiry', { reconnect_in: 480_000 }],
		['expired relative renewal', { expires_in: 600_000, reconnect_in: 0 }],
		['relative renewal at expiry', { expires_in: 600_000, reconnect_in: 600_000 }],
		['renewal exceeding the timer limit', { expires_in: 2 ** 32, reconnect_in: 2 ** 31 }],
	] as const) {
		test(`rejects malformed feed metadata (${name}) without disclosing it`, async () => {
			const { service } = createService(store, {
				tasks: [], repositories: new Map(), onRequest: () => jsonResponse({ ...feedConnection(), ...invalid }),
			});
			await assert.rejects(service.connectSessionFeed(CancellationToken.None), error => {
				return (error instanceof SchemaError || error instanceof RequestError && error.kind === 'schema')
					&& !error.message.includes('secret') && !error.message.includes('password');
			});
		});
	}

	test('discards feed credentials returned after an account change', async () => {
		let signedIn = true;
		const response = new DeferredPromise<IRequestContext>();
		const requested = new DeferredPromise<void>();
		const h = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => signedIn ? [{ accessToken: 'tok', id: 's', account: { id: 'a', label: 'a' }, scopes: [] }] : [],
			onRequest: () => {
				void requested.complete();
				return response.p;
			},
		});
		const request = h.service.connectSessionFeed(CancellationToken.None);
		await requested.p;
		signedIn = false;
		h.changeAuthentication();
		await response.complete(jsonResponse(feedConnection()));
		await assert.rejects(request, isCancellationError);
	});

	for (const invalidation of ['rename', 'archive', 'authentication refresh'] as const) {
		test(`${invalidation} during negotiation does not disable the account's feed`, async () => {
			const requested = new DeferredPromise<void>();
			const response = new DeferredPromise<IRequestContext>();
			const h = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: url => {
					if (url.pathname.endsWith('/feed/connect')) {
						void requested.complete();
						return response.p;
					}
					return jsonTaskResponse({ id: 'task' });
				},
			});
			const pending = h.service.connectSessionFeed(CancellationToken.None);
			await requested.p;
			if (invalidation === 'authentication refresh') {
				h.changeAuthentication();
			} else if (invalidation === 'rename') {
				await h.service.renameTask('task', 'New title', CancellationToken.None);
			} else {
				await h.service.setTaskArchived('task', true, CancellationToken.None);
			}
			const connection = feedConnection();
			await response.complete(jsonResponse(connection));
			assert.deepStrictEqual(await pending, connection);
		});
	}
});

suite('CloudSandboxApiService feed task refresh', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a delayed targeted read cannot overwrite a newer archive discovered by an inventory scan', async () => {
		const pending = new DeferredPromise<IRequestContext>();
		const entered = new DeferredPromise<void>();
		const original = { ...task('task', 'Original', 42, 'session', 'environment'), updated_at: '2026-10-18T00:00:00Z' };
		const tasks: ITestTask[] = [original];
		const { service } = createService(store, {
			tasks, repositories: new Map([[43, { full_name: 'owner/new-repo' }]]),
			onRequest: url => {
				if (url.pathname === '/repositories/42') {
					void entered.complete();
					return pending.p;
				}
				return undefined;
			},
		});
		const refresh = service.listSessions(CancellationToken.None, { taskIds: ['task'] });
		await entered.p;
		tasks[0] = {
			...original, name: 'Archived', archived_at: '2026-10-18T00:01:00Z',
			updated_at: '2026-10-18T00:01:00Z', repository: { id: 43 },
		};
		const scan = await service.listSessions(CancellationToken.None);
		await pending.complete(jsonResponse({ full_name: 'owner/old-repo' }));
		const targeted = await refresh;
		assert.deepStrictEqual([scan, targeted].map(result => result.kind === 'failed' ? [] : result.sessions.map(session => ({
			name: session.name, archived: session.isArchived, repository: session.repoName,
		}))), [
			[{ name: 'Archived', archived: true, repository: 'owner/new-repo' }],
			[{ name: 'Archived', archived: true, repository: 'owner/new-repo' }],
		]);
	});

	test('a delayed targeted read cannot restore a task removed by an inventory scan', async () => {
		const pending = new DeferredPromise<IRequestContext>();
		const entered = new DeferredPromise<void>();
		const original = { ...task('task', 'Original', undefined, 'session', 'environment'), updated_at: '2026-10-18T00:00:00Z' };
		const tasks: ITestTask[] = [original];
		let hold = false;
		const { service } = createService(store, {
			tasks, repositories: new Map(),
			onRequest: url => {
				if (hold && url.pathname === '/agents/tasks/batch') {
					void entered.complete();
					return pending.p;
				}
				return undefined;
			},
		});
		await service.listSessions(CancellationToken.None);
		hold = true;
		const refresh = service.listSessions(CancellationToken.None, { taskIds: ['task'] });
		await entered.p;
		tasks.length = 0;
		await service.listSessions(CancellationToken.None);
		await pending.complete(jsonResponse({ tasks: [original] }));
		assert.deepStrictEqual(await refresh, { kind: 'incremental', sessions: [], removedTaskIds: ['task'] });
	});

	test('a capped window eviction does not overwrite a successful pending targeted read', async () => {
		const pending = new DeferredPromise<IRequestContext>();
		const entered = new DeferredPromise<void>();
		const original = { ...task('task', 'Original', undefined, 'session', 'environment'), updated_at: '2026-10-18T00:00:00Z' };
		const tasks: ITestTask[] = [original];
		let hold = false;
		const { service } = createService(store, {
			tasks, repositories: new Map(),
			onRequest: url => {
				if (hold && url.pathname === '/agents/tasks/batch') {
					void entered.complete();
					return pending.p;
				}
				return undefined;
			},
		});
		await service.listSessions(CancellationToken.None);
		hold = true;
		const targeted = service.listSessions(CancellationToken.None, { taskIds: ['task'] });
		await entered.p;
		tasks.unshift(...Array.from({ length: 301 }, (_, i) => ({
			...task(`new-${i}`, 'Other task', undefined, `s-${i}`, `e-${i}`), compute: { provider: 'codespaces' },
		})));
		const scan = await service.listSessions(CancellationToken.None);
		await pending.complete(jsonResponse({ tasks: [original] }));
		const refreshed = await targeted;

		assert.deepStrictEqual({
			scan,
			refreshed: refreshed.kind === 'failed' ? refreshed : {
				kind: refreshed.kind,
				tasks: refreshed.sessions.map(session => session.taskId),
				removed: refreshed.removedTaskIds,
			},
		}, {
			scan: { kind: 'complete', sessions: [] },
			refreshed: { kind: 'incremental', tasks: ['task'], removed: [] },
		});
	});

	for (const cached of [false, true]) {
		test(`keeps summary rows without an execution binding with a cached task: ${cached}`, async () => {
			const original = { ...task('task', 'Original', undefined, 'session', 'environment'), updated_at: '2026-10-18T00:00:00Z' };
			const tasks: ITestTask[] = [original];
			const { service } = createService(store, { tasks, repositories: new Map() });
			if (cached) {
				await service.listSessions(CancellationToken.None);
			}
			tasks[0] = { ...original, updated_at: '2026-10-18T00:01:00Z', sessions: [] };
			const full = await service.listSessions(CancellationToken.None);
			const targeted = await service.listSessions(CancellationToken.None, { taskIds: ['task'] });

			assert.deepStrictEqual([full, targeted].map(result => result.kind === 'failed' ? result : {
				kind: result.kind, tasks: result.sessions.map(task => task.taskId), removed: result.removedTaskIds ?? [],
			}), [
				{ kind: 'complete', tasks: ['task'], removed: [] },
				{ kind: 'incremental', tasks: ['task'], removed: [] },
			]);
		});
	}

	test('an older full scan retains a task discovered by a concurrent feed read', async () => {
		const pending = new DeferredPromise<IRequestContext>();
		const entered = new DeferredPromise<void>();
		const { service } = createService(store, {
			tasks: [task('new', 'New sandbox', undefined, 'session', 'environment')],
			repositories: new Map(),
			onRequest: url => {
				if (url.pathname === '/agents/tasks') {
					if (!entered.isSettled) {
						void entered.complete();
						return pending.p;
					}
					return jsonResponse({ tasks: [] });
				}
				return undefined;
			},
		});
		const scan = service.listSessions(CancellationToken.None);
		await entered.p;
		const fast = await service.listSessions(CancellationToken.None, { taskIds: ['new'] });
		await pending.complete(jsonResponse({ tasks: [] }));
		const result = await scan;
		assert.deepStrictEqual([fast, result].map(result => ({
			kind: result.kind, tasks: result.kind === 'failed' ? [] : result.sessions.map(session => session.taskId),
		})), [{ kind: 'incremental', tasks: ['new'] }, { kind: 'complete', tasks: ['new'] }]);
	});

	test('an older full scan cannot restore a task removed by a concurrent feed read', async () => {
		const pending = new DeferredPromise<IRequestContext>();
		const entered = new DeferredPromise<void>();
		const known = { ...task('removed', 'Old sandbox', 42, 'session', 'environment'), updated_at: '2026-10-18T00:00:00Z' };
		let hold = false;
		const { service } = createService(store, {
			tasks: [known], repositories: new Map([[42, { full_name: 'owner/repo' }]]),
			onRequest: url => {
				if (!hold) { return undefined; }
				if (url.pathname === '/agents/tasks/batch') {
					return jsonResponse({ tasks: [] });
				}
				if (url.pathname === '/agents/tasks') {
					if (!entered.isSettled) {
						void entered.complete();
						return pending.p;
					}
					return jsonResponse({ tasks: [] });
				}
				return undefined;
			},
		});
		await service.listSessions(CancellationToken.None);
		hold = true;
		const scan = service.listSessions(CancellationToken.None);
		await entered.p;
		await service.listSessions(CancellationToken.None, { taskIds: ['removed'] });
		await pending.complete(jsonResponse({ tasks: [known] }));
		const result = await scan;
		assert.deepStrictEqual(result, { kind: 'complete', sessions: [], removedTaskIds: ['removed'] });
	});

	test('concurrent task refreshes retain each other in the discovery cache', async () => {
		const pending = new DeferredPromise<IRequestContext>();
		const entered = new DeferredPromise<void>();
		const first = { ...task('first', 'First', undefined, 's1', 'e1'), updated_at: '2026-10-18T00:00:00Z' };
		const second = { ...task('second', 'Second', undefined, 's2', 'e2'), updated_at: '2026-10-18T00:00:00Z' };
		const { service, requestedUrls } = createService(store, {
			tasks: [first, second], repositories: new Map(),
			onRequest: url => {
				if (url.pathname === '/agents/tasks/batch' && url.searchParams.get('task_ids') === 'first' && !entered.isSettled) {
					void entered.complete();
					return pending.p;
				}
				return undefined;
			},
		});
		const firstRefresh = service.listSessions(CancellationToken.None, { taskIds: ['first'] });
		await entered.p;
		await service.listSessions(CancellationToken.None, { taskIds: ['second'] });
		await pending.complete(jsonResponse({ tasks: [first] }));
		await firstRefresh;
		const beforeScan = requestedUrls.length;
		const result = await service.listSessions(CancellationToken.None);
		assert.deepStrictEqual({
			tasks: result.kind === 'failed' ? [] : result.sessions.map(session => session.taskId),
			detailReads: requestedUrls.slice(beforeScan).filter(url => new URL(url).pathname.startsWith('/agents/tasks/')),
		}, { tasks: ['first', 'second'], detailReads: [] });
	});

	test('a full scan can publish a newer task version than its concurrent feed read', async () => {
		const pending = new DeferredPromise<IRequestContext>();
		const entered = new DeferredPromise<void>();
		const original = { ...task('task', 'Old title', undefined, 'session', 'environment'), updated_at: '2026-10-18T00:00:00Z' };
		const newer = { ...original, name: 'New title', updated_at: '2026-10-18T00:01:00Z' };
		const { service } = createService(store, {
			tasks: [original], repositories: new Map(),
			onRequest: url => {
				if (url.pathname === '/agents/tasks') {
					if (!entered.isSettled) {
						void entered.complete();
						return pending.p;
					}
					return jsonResponse({ tasks: [] });
				}
				return undefined;
			},
		});
		const scan = service.listSessions(CancellationToken.None);
		await entered.p;
		await service.listSessions(CancellationToken.None, { taskIds: ['task'] });
		await pending.complete(jsonResponse({ tasks: [newer] }));
		const result = await scan;
		assert.deepStrictEqual(result.kind === 'failed' ? [] : result.sessions.map(session => session.name), ['New title']);
	});

	test('publishes a provisioning sandbox before its compute provider and AHP resource are populated', async () => {
		const createdAt = new Date().toISOString();
		const provisioning = {
			...task('provisioning', 'New remote session', undefined, 'session', 'environment'),
			compute: { provider: '' },
			state: 'queued',
			updated_at: createdAt,
			sessions: [{ id: 'session', environment_id: 'environment', state: 'queued', created_at: createdAt, updated_at: createdAt }],
		};
		const tasks: ITestTask[] = [provisioning];
		const { service, requestedUrls } = createService(store, { tasks, repositories: new Map() });
		const initial = await service.listSessions(CancellationToken.None, { taskIds: ['provisioning'] });
		const completed = {
			...provisioning,
			name: 'Ready sandbox',
			compute: { provider: 'sandboxes' },
			state: 'idle',
			sessions: [{ ...provisioning.sessions[0], state: 'idle', ahp_resource_uri: 'ahp-session:/session' }],
		};
		tasks[0] = completed;
		const ready = await service.listSessions(CancellationToken.None, { taskIds: ['provisioning'] });
		assert.deepStrictEqual({
			results: [initial, ready].map(result => ({
				kind: result.kind,
				sessions: result.kind === 'failed' ? [] : result.sessions.map(session => ({
					taskId: session.taskId, sessionId: session.sessionId, environmentId: session.environmentId, name: session.name, status: session.status,
				})),
			})),
			requests: requestedUrls.map(url => new URL(url).pathname),
		}, {
			results: [
				{ kind: 'incremental', sessions: [{ taskId: 'provisioning', sessionId: undefined, environmentId: undefined, name: 'New remote session', status: SessionStatus.InProgress }] },
				{ kind: 'incremental', sessions: [{ taskId: 'provisioning', sessionId: undefined, environmentId: undefined, name: 'Ready sandbox', status: SessionStatus.Idle }] },
			],
			requests: ['/agents/tasks/batch', '/agents/tasks/batch'],
		});
	});

	test('reads only hinted tasks once, deduplicates IDs, and leaves unrelated cached sessions intact', async () => {
		const tasks = [task('one', 'First', undefined, 's1', 'e1'), task('two', 'Second', undefined, 's2', 'e2')];
		const { service, requestedUrls } = createService(store, { tasks, repositories: new Map() });
		await service.listSessions(CancellationToken.None);
		const start = requestedUrls.length;
		tasks[0] = { ...tasks[0], name: 'Renamed' };
		const result = await service.listSessions(CancellationToken.None, { taskIds: ['one', 'one'] });
		const urls = requestedUrls.slice(start).map(url => new URL(url).pathname);
		const other = await service.listSessions(CancellationToken.None, { taskIds: ['two'] });
		assert.deepStrictEqual({
			kind: result.kind,
			sessions: result.kind === 'failed' ? [] : result.sessions.map(session => [session.taskId, session.name]),
			urls,
			other: other.kind === 'failed' ? [] : other.sessions.map(session => [session.taskId, session.name]),
		}, { kind: 'incremental', sessions: [['one', 'Renamed']], urls: ['/agents/tasks/batch'], other: [['two', 'Second']] });
	});

	test('discovers new sandbox tasks without inventory scans or detail GETs and ignores non-sandbox hints', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [task('sandbox', 'New', undefined, 's1', 'e1'), { ...task('actions', 'Other', undefined, 's2', 'e2'), compute: undefined, current_environment: { id: 'e2', kind: 'managed-actions' } }],
			repositories: new Map(),
		});
		const result = await service.listSessions(CancellationToken.None, { taskIds: ['sandbox', 'actions'] });
		assert.deepStrictEqual({
			kind: result.kind,
			tasks: result.kind === 'failed' ? [] : result.sessions.map(session => session.taskId),
			urls: requestedUrls.map(url => new URL(url).pathname).sort(),
		}, { kind: 'incremental', tasks: ['sandbox'], urls: ['/agents/tasks/batch'] });
	});

	for (const status of [403, 404, 500]) {
		test(`retains hinted inventory when a task batch returns HTTP ${status}`, async () => {
			let fail = false;
			const { service, requestedUrls } = createService(store, {
				tasks: [task('one', 'First', undefined, 's1', 'e1'), task('two', 'Second', undefined, 's2', 'e2')],
				repositories: new Map(),
				onRequest: url => fail && url.pathname === '/agents/tasks/batch' ? jsonResponse({}, status) : undefined,
			});
			await service.listSessions(CancellationToken.None);
			fail = true;
			const start = requestedUrls.length;
			const result = await service.listSessions(CancellationToken.None, { taskIds: ['one'] });
			assert.deepStrictEqual({
				result,
				urls: requestedUrls.slice(start).map(url => new URL(url).pathname),
			}, {
				result: { kind: 'partial', sessions: [], removedTaskIds: [], failedTaskIds: ['one'] },
				urls: Array(status === 500 ? 2 : 1).fill('/agents/tasks/batch'),
			});
		});
	}

	test('empty task batches do not scan or erase the inventory', async () => {
		const { service, requestedUrls } = createService(store, { tasks: [], repositories: new Map() });
		assert.deepStrictEqual({ result: await service.listSessions(CancellationToken.None, { taskIds: [] }), requestedUrls }, {
			result: { kind: 'incremental', sessions: [], removedTaskIds: [] }, requestedUrls: [],
		});
	});

	test('feed refreshes preserve the incremental safety-poll checkpoint', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [task('one', 'First', undefined, 's1', 'e1')], repositories: new Map(),
			discoveryDate: () => 'Sun, 18 Oct 2026 17:00:00 GMT',
		});
		await service.listSessions(CancellationToken.None);
		await service.listSessions(CancellationToken.None, { taskIds: ['one'] });
		const start = requestedUrls.length;
		await service.listSessions(CancellationToken.None, { incremental: true });
		assert.deepStrictEqual(requestedUrls.slice(start).filter(url => new URL(url).pathname === '/agents/tasks').map(url => new URL(url).searchParams.get('since')), [
			'2026-10-18T16:59:00.000Z', '2026-10-18T16:59:00.000Z', '2026-10-18T16:59:00.000Z', '2026-10-18T16:59:00.000Z',
		]);
	});
});

suite('CloudSandboxApiService connection credentials', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const request = { environmentId: 'env-1', sessionId: 'session-1' };

	test('a mismatched reconnect response fails lifecycle telemetry on the requested connection', async () => {
		const connectionId = generateUuid();
		const otherConnectionId = generateUuid();
		const { service, lifecycleEvents } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => jsonResponse(clientToken(otherConnectionId)),
		});
		await assert.rejects(service.reconnect({ environmentId: generateUuid() }, connectionId, CancellationToken.None), MutationUncertainError);
		assert.deepStrictEqual(lifecycleEvents.map(event => [event.phase, event.outcome, event.connectionId, event.failurePoint]), [
			['credentials.refresh', 'started', connectionId, undefined],
			['credentials.refresh', 'failed', connectionId, 'credentials.invalidResponse'],
		]);
	});

	test('incomplete credentials identify the client failure branch without including the response', async () => {
		const { service, lifecycleEvents } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => jsonResponse({ access_token: 'private response' }),
		});
		await assert.rejects(service.connect({ environmentId: generateUuid() }, CancellationToken.None), MutationUncertainError);
		assert.deepStrictEqual({
			failurePoint: lifecycleEvents.at(-1)?.failurePoint,
			privateContent: JSON.stringify(lifecycleEvents).includes('private'),
		}, { failurePoint: 'credentials.invalidResponse', privateContent: false });
	});

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

	function clientToken(clientId: string): ClientTokenResponse {
		const groupPrefix = `user.u1.env.env-1.client.${clientId}`;
		return {
			access_token: 'relay-token',
			expires_at: '2026-01-01T01:00:00Z',
			wps_endpoint: 'wss://relay.example.com/client/hubs/hub',
			hub: 'hub',
			subprotocol: 'json.reliable.webpubsub.azure.v1',
			client_id: clientId,
			environment_status: 'online',
			groups: {
				broadcast: `${groupPrefix}.broadcast`,
				to_client: `${groupPrefix}.to-client`,
				to_host: `${groupPrefix}.to-host`,
				clients: 'user.u1.env.env-1.clients',
			},
		};
	}

	for (const action of ['connect', 'reconnect'] as const) {
		for (const response of ['token', 'waking', 'httpError', 'incomplete', 'networkError', 'cancelled'] as const) {
			test(`${action} excludes user-local lifecycle reporting for ${response} without changing requests or aggregates`, async () => {
				const environmentId = generateUuid();
				const sessionId = generateUuid();
				const connectionId = generateUuid();
				const observations = [];
				for (const environmentKind of [undefined, 'user-local'] as const) {
					const source = store.add(new CancellationTokenSource());
					const progress: string[] = [];
					const wire: { path: string; query: string; data: IRequestOptions['data'] }[] = [];
					const { service, lifecycleEvents, requestOutcomes } = createService(store, {
						tasks: [], repositories: new Map(),
						onRequest: (url, _token, options) => {
							wire.push({ path: url.pathname, query: url.search, data: options.data });
							if (response === 'networkError') {
								throw new Error('private-person@example.invalid request failed');
							}
							if (response === 'cancelled') {
								source.cancel();
								throw new CancellationError();
							}
							return response === 'token' ? jsonResponse(clientToken(connectionId))
								: response === 'waking' ? jsonResponse({ environment_status: 'waking' }, 202, { 'retry-after': '45' })
									: response === 'httpError' ? jsonResponse({ message: 'private chat content' }, 403)
										: jsonResponse({ access_token: 'private-token' });
						},
					});
					const scopedRequest: ICloudSandboxConnectionRequest = { environmentId, sessionId, environmentKind, onRequest: event => progress.push(event) };
					const pending = action === 'connect' ? service.connect(scopedRequest, source.token) : service.reconnect(scopedRequest, connectionId, source.token);
					let result: 'token' | 'waking' | 'rejected';
					if (response === 'token' || response === 'waking') {
						result = (await pending).kind;
					} else {
						await assert.rejects(pending);
						result = 'rejected';
					}
					observations.push({
						result, wire, progress, requestOutcomes,
						reported: lifecycleEvents.length > 0,
						forbidden: /private|relay-token|relay\.example|environmentKind|user-local/.test(JSON.stringify(lifecycleEvents)),
					});
				}
				assert.deepStrictEqual(observations, [
					{ ...observations[0], reported: true, forbidden: false },
					{ ...observations[0], reported: false, forbidden: false },
				]);
			});
		}
	}

	test('uses shared default deadlines for connection requests and environment reads', async () => {
		const requests: { path: string; timeout: number | undefined }[] = [];
		const { service, typedRequests } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: (url, _token, options) => {
				requests.push({ path: url.pathname, timeout: options.timeout });
				return jsonResponse(url.pathname === '/agents/environments/env-1'
					? { id: 'env-1', name: 'Environment', kind: 'managed-sandbox', status: 'online' } : clientToken('client-1'));
			},
		});

		await service.connect(request, CancellationToken.None);
		await service.reconnect(request, 'client-1', CancellationToken.None);
		await service.getEnvironment(request.environmentId, CancellationToken.None);

		assert.deepStrictEqual({
			requests,
			explicitDeadlines: typedRequests.map(request => request.deadline),
		}, {
			requests: ['connect', 'reconnect', ''].map(action => ({
				path: `/agents/environments/env-1${action ? `/${action}` : ''}`, timeout: undefined,
			})),
			explicitDeadlines: [undefined, undefined, undefined],
		});
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

	test('renders cloud catalogue prices and effort without a local Copilot catalogue or a fixed Auto price', async () => {
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => jsonResponse({
				data: [
					{ id: 'auto', name: 'Auto', billing: { is_premium: true, multiplier: 0.9 } },
					{
						id: 'priced-model', name: 'Priced Model', model_picker_price_category: 'medium',
						billing: { token_prices: { batch_size: 1_000_000, input_price: 200_000_000_000, output_price: 1_000_000_000_000, cache_price: 10_000_000_000 } },
						capabilities: { supports: { reasoning_effort: ['low', 'medium', 'high', 'xhigh', 'max'] }, limits: { max_context_window_tokens: 1_050_000 } },
					},
				],
			}),
		});
		const catalog = await service.listModels(CancellationToken.None);
		const provider = store.add(new AgentHostLanguageModelProvider('cloud-sandbox', 'cloud-models'));
		provider.updateAdditionalModels(catalog.models);
		const [auto, model] = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		const card = store.add(new ModelCard({
			model,
			isUBB: true,
			openerService: NullOpenerService,
			configurationAccess: { getModelConfiguration: () => undefined, setModelConfiguration: async () => { }, getModelConfigurationActions: () => [] },
		}));
		assert.deepStrictEqual({
			autoDescription: createModelAction(auto, undefined, () => { }).action.description,
			autoMultiplier: auto.metadata.multiplierNumeric,
			titles: Array.from(card.element.querySelectorAll('.chat-model-card-section-title'), element => element.textContent),
			prices: Array.from(card.element.querySelectorAll('.chat-model-card-pricing-row'), row => ({
				label: row.querySelector('.chat-model-card-pricing-label')?.textContent,
				value: row.querySelector('.chat-model-card-pricing-value')?.textContent,
			})),
		}, {
			autoDescription: undefined,
			autoMultiplier: undefined,
			titles: ['Effort Level', 'Max context', 'Pricing details'],
			prices: [{ label: 'Input', value: '200' }, { label: 'Output', value: '1000' }, { label: 'Cache Read', value: '10' }],
		});
	});

	test('keeps versioned Cloud context labels and prices through host connection', async () => {
		let apiVersion: string | string[] | undefined;
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: (_url, _token, options) => {
				apiVersion = options.headers?.['X-GitHub-Api-Version'];
				return jsonResponse({
					data: [{
						id: 'context-model', name: 'Context Model',
						billing: {
							token_prices: {
								batch_size: 1_000_000,
								default: { context_max: 272_000, input_price: 200, output_price: 1000, cache_price: 10, cache_write_price: 250 },
								long_context: { context_max: 922_000, input_price: 400, output_price: 1500, cache_price: 20, cache_write_price: 500 },
							}
						},
						capabilities: { limits: { max_context_window_tokens: 1_050_000 }, supports: { reasoning_effort: ['low', 'medium', 'high'] } },
					}]
				});
			},
		});
		const catalog = await service.listModels(CancellationToken.None);
		const provider = store.add(new AgentHostLanguageModelProvider('cloud-sandbox', 'cloud-models'));
		provider.updateAdditionalModels(catalog.models);
		let [model] = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		const values: Record<string, unknown> = {};
		const accepted = new DeferredPromise<void>();
		const configurationAccess = {
			getModelConfiguration: () => values,
			setModelConfiguration: async (_id: string, next: Record<string, unknown>) => { Object.assign(values, next); },
			getModelConfigurationActions: () => [],
		};
		const card = store.add(new ModelCard({ model, isUBB: true, openerService: NullOpenerService, configurationAccess, onDidAccept: () => accepted.complete() }));
		const snapshot = () => ({
			selected: Array.from(card.element.querySelectorAll('[aria-checked="true"]'), element => element.textContent),
			prices: Array.from(card.element.querySelectorAll('.chat-model-card-pricing-value'), element => element.textContent),
			summary: getModelConfigSummary(model, configurationAccess),
		});
		const before = snapshot();
		const longContext = card.element.querySelector<HTMLElement>('[aria-label="Context Size"] [role="radio"]:last-child');
		assert.ok(longContext);
		longContext.click();
		await accepted.p;
		const after = snapshot();
		provider.updateModels([{
			id: 'context-model', provider: 'copilot', name: 'Context Model',
			configSchema: {
				type: 'object',
				properties: {
					reasoningEffort: { type: 'string', title: 'Effort Level', enum: ['low', 'medium', 'high'] },
					contextTier: { type: 'string', title: 'Context tier', enum: ['default', 'long_context'], enumLabels: ['Default', 'Long context'], default: 'default' },
				},
			},
		}]);
		[model] = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		card.update({ model, isUBB: true, openerService: NullOpenerService, configurationAccess });
		assert.deepStrictEqual({ apiVersion, before, after, connected: snapshot(), values }, {
			apiVersion: '2026-06-01',
			before: { selected: ['272K'], prices: ['200', '1000', '10', '250'], summary: 'Model default · 272K' },
			after: { selected: ['1M'], prices: ['400', '1500', '20', '500'], summary: 'Model default · 1M' },
			connected: { selected: ['1M'], prices: ['400', '1500', '20', '500'], summary: 'Model default · 1M' },
			values: { contextTier: 'long_context' },
		});
	});

	for (const body of [{}, { data: [null] }, { data: [{ id: 'bad', name: 'Bad', capabilities: { supports: { reasoning_effort: [1] } } }] }]) {
		test(`rejects invalid cloud model metadata: ${JSON.stringify(body)}`, async () => {
			const { service } = createService(store, { tasks: [], repositories: new Map(), onRequest: () => jsonResponse(body) });
			await assert.rejects(service.listModels(CancellationToken.None), SchemaError);
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
					name: 'CloudSandboxNetworkError', message: 'Mission Control connection request failed',
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
				`[CloudSandboxApi] Mission Control ${action} failed: HTTP 500 (requestId=${requestId})`,
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
				onRequest: () => jsonResponse({ environment_status: 'waking' }, 202, { 'retry-after': '5' }),
			});

			const result = action === 'connect'
				? await service.connect(observedRequest, CancellationToken.None)
				: await service.reconnect(observedRequest, 'client-1', CancellationToken.None);

			assert.deepStrictEqual({ result, progress }, { result: { kind: 'waking', waking: { retryAfterSeconds: 5 } }, progress: ['issued', 'waking'] });
		});
	}

	for (const status of [200, 201]) {
		test(`preserves malformed successful read errors without converting HTTP ${status} to a sandbox HTTP failure`, async () => {
			const { service } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: () => ({ res: { statusCode: status, headers: {} }, stream: bufferToStream(VSBuffer.fromString('invalid JSON')) }),
			});
			await assert.rejects(service.getEnvironment('environment', CancellationToken.None), {
				name: 'GitHubRequestError', kind: 'malformedResponse', statusCode: status,
			});
		});
	}

	test('preserves transport errors from environment reads without classifying them for connection retries', async () => {
		const failure = new Error('network unavailable');
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => { throw failure; },
		});
		await assert.rejects(service.getEnvironment(request.environmentId, CancellationToken.None), GitHubRequestError);
	});

	for (const header of [undefined, 'ABCD:1234:5678', 'ABCD:1234:5678:90AB:CDEF\tinjected', 'ghp_secret', 'A'.repeat(129), ['ABCD:1234:5678:90AB:CDEF', 'ABCD:1234:5678:90AB:CDEF']]) {
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
				'[CloudSandboxApi] Mission Control connect failed: HTTP 500',
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
			MutationUncertainError,
		);
	});

	test('parses a pending response with an HTTP-date Retry-After', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1) }, async () => {
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => jsonResponse({ environment_status: 'waking' }, 202, { 'retry-after': new Date(Date.now() + 45_000).toUTCString() }),
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

	for (const response of [
		{ status: 403, body: { error_code: 'rate_limit_exceeded', limited_resource: 'token_mint' }, code: 'rate_limit_exceeded', resource: 'token_mint' },
		{ status: 409, body: { code: 'environment_compute_terminal' }, code: 'environment_compute_terminal', resource: undefined },
		{ status: 409, body: { code: 'future_conflict' }, code: 'future_conflict', resource: undefined },
	]) {
		test(`preserves structured HTTP ${response.status} diagnostics: ${response.code}`, async () => {
			const { service } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: () => jsonResponse({ ...response.body, message: 'private', access_token: 'private' }, response.status, {
					'x-github-request-id': 'ABCD:1234:5678:90AB:CDEF', 'retry-after': '5',
				}),
			});
			await assert.rejects(service.connect(request, CancellationToken.None), error => {
				assert.ok(error instanceof Error);
				assert.deepStrictEqual({
					...error, message: error.message, privateContent: JSON.stringify(error).includes('private'),
				}, {
					name: 'CloudSandboxRequestError', statusCode: response.status, retryAfterSeconds: 5,
					code: response.code, limitedResource: response.resource, requestId: 'ABCD:1234:5678:90AB:CDEF',
					message: `Mission Control connect failed: HTTP ${response.status} code=${response.code} (requestId=ABCD:1234:5678:90AB:CDEF)`,
					outcome: undefined,
					privateContent: false,
				});
				return true;
			});
		});
	}

	for (const replacement of ['new credential', 'same credential', 'other account', 'rejected again', 'cancelled', 'unavailable'] as const) {
		test(`a 401 resolves credentials once and fences retries: ${replacement}`, async () => {
			const source = store.add(new CancellationTokenSource());
			let lookups = 0;
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(),
				authenticationSessions: async () => {
					const initial = lookups++ === 0;
					if (!initial && replacement === 'unavailable') {
						throw new Error('provider unavailable');
					}
					if (!initial && replacement === 'cancelled') {
						source.cancel();
					}
					return [{
						id: 's', scopes: [], accessToken: initial || replacement === 'same credential' ? 'old' : 'new',
						account: { id: !initial && replacement === 'other account' ? 'other' : 'a', label: 'a' },
					}];
				},
				onRequest: () => requestedUrls.length === 1 || replacement === 'rejected again'
					? jsonResponse({ error_code: 'unauthenticated' }, 401) : jsonResponse(clientToken('client-1')),
			});
			const connecting = service.connect(request, source.token);
			if (replacement === 'new credential') {
				await connecting;
			} else {
				await assert.rejects(connecting, replacement === 'cancelled' ? isCancellationError
					: replacement === 'unavailable' ? /provider unavailable/ : { statusCode: 401, code: 'unauthenticated' });
			}
			assert.deepStrictEqual({ lookups, requests: requestedUrls.length }, {
				lookups: 2, requests: replacement === 'new credential' || replacement === 'rejected again' ? 2 : 1,
			});
		});
	}

	test('a rejected mutation is not replayed through the authentication recovery path', async () => {
		let lookups = 0;
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => [{
				id: 's', scopes: [], accessToken: ++lookups === 1 ? 'old' : 'replacement', account: { id: 'a', label: 'a' },
			}],
			onRequest: () => jsonResponse({ error_code: 'unauthenticated' }, 401),
		});
		await assert.rejects(service.createSession({ prompt: 'test' }, CancellationToken.None), { statusCode: 401, code: 'unauthenticated' });
		assert.deepStrictEqual({ lookups, requests: requestedUrls.length }, { lookups: 1, requests: 1 });
	});
});

suite('CloudSandboxApiService history timings', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('separates authentication, request, body reading and replay without logging private data', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const logService = new TestLogService();
		const responseReady = new DeferredPromise<void>();
		const stream = newWriteableBufferStream();
		store.add(toDisposable(() => stream.destroy()));
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(), logService,
			authenticationSessions: async () => {
				await timeout(25);
				return [{ accessToken: 'private-token', id: 's', account: { id: 'a', label: 'a' }, scopes: [] }];
			},
			onRequest: async () => {
				await timeout(50);
				await responseReady.complete();
				return { res: { statusCode: 200, headers: {} }, stream };
			},
		});
		const writeBody = async () => {
			await responseReady.p;
			await timeout(75);
			stream.end(VSBuffer.fromString(JSON.stringify({
				events: [{
					ns: 'ahp', session_id: 'private-session', seq: 0, at: '2026-01-01T00:00:00Z',
					payload: {
						kind: 'message',
						data: { channel: 'ahp-session:/private-session', serverSeq: 0, action: { type: 'session/titleChanged', title: 'private-title' } },
					},
				}],
				total: 1,
			})));
		};
		const [history] = await Promise.all([service.getSessionHistory('private-task', CancellationToken.None), writeBody()]);

		assert.deepStrictEqual({
			title: history?.sessions[0].state.title,
			requests: requestedUrls.map(url => new URL(url).pathname),
			logs: logService.infos,
		}, {
			title: 'private-title',
			requests: ['/agents/tasks/private-task/events'],
			logs: [
				'[CloudSandboxApi] historyTiming loadId=1 traceId=history-1 authenticated authenticationMs=25 totalMs=25',
				'[CloudSandboxApi] historyTiming loadId=1 traceId=history-1 requestIssued authenticationMs=25 totalMs=25',
				'[CloudSandboxApi] historyTiming loadId=1 traceId=history-1 responseReceived requestMs=50 status=200 responseHeadersMs=unavailable downloadMs=unavailable decodedBodyBytes=unavailable requestId=unavailable totalMs=75',
				'[CloudSandboxApi] historyTiming loadId=1 traceId=history-1 bodyRead bodyReadAndParseMs=75 totalMs=150',
				'[CloudSandboxApi] historyTiming loadId=1 traceId=history-1 completed apiMs=125 replayMs=0 events=1 sessions=1 truncated=false totalMs=150',
			],
		});
	}));

	for (const failure of ['authentication', 'request', 'HTTP', 'JSON', 'replay', 'cancellation'] as const) {
		test(`logs the elapsed failing phase and preserves rejection for ${failure}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const logService = new TestLogService();
			const cancellation = store.add(new CancellationTokenSource());
			const error = failure === 'cancellation' ? new CancellationError() : new Error('private-error');
			const { service } = createService(store, {
				tasks: [], repositories: new Map(), logService,
				authenticationSessions: failure === 'authentication' ? async () => {
					await timeout(35);
					throw error;
				} : undefined,
				onRequest: async () => {
					await timeout(35);
					if (failure === 'cancellation') {
						cancellation.cancel();
						throw error;
					}
					if (failure === 'request') {
						throw error;
					}
					if (failure === 'JSON') {
						return { res: { statusCode: 200, headers: {} }, stream: bufferToStream(VSBuffer.fromString('private-invalid-json')) };
					}
					return failure === 'HTTP'
						? jsonResponse({ message: 'private-response' }, 503)
						: jsonResponse({ events: [], total: 1 });
				},
			});
			await assert.rejects(service.getSessionHistory('private-task', cancellation.token), error =>
				failure === 'cancellation' ? isCancellationError(error) : error instanceof Error);
			await timeout(0);

			const phase = failure === 'authentication' ? 'authentication'
				: failure === 'request' || failure === 'cancellation' ? 'request'
					: failure === 'replay' ? 'replay' : 'responseBody';
			assert.deepStrictEqual({
				terminalLog: logService.infos.at(-1),
				completed: logService.infos.some(message => message.includes(' completed ')),
				privateData: logService.infos.some(message => message.includes('private-')),
			}, {
				terminalLog: failure === 'authentication'
					? '[CloudSandboxApi] historyAuthentication traceId=standalone failed durationMs=35'
					: `[CloudSandboxApi] historyTiming loadId=1 traceId=history-1 ${failure === 'cancellation' ? 'cancelled' : 'failed'} phase=${phase} phaseMs=${phase === 'request' ? 35 : 0} totalMs=35`,
				completed: false, privateData: false,
			});
		}));
	}

	test('correlates concurrent history fetches with separate load IDs', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const logService = new TestLogService();
		const { service } = createService(store, {
			tasks: [], repositories: new Map(), logService,
			onRequest: async url => {
				await timeout(url.pathname.includes('/slow/') ? 40 : 20);
				return jsonResponse({ events: [], total: 0 });
			},
		});
		const histories = await Promise.all([
			service.getSessionHistory('slow', CancellationToken.None),
			service.getSessionHistory('fast', CancellationToken.None),
		]);

		assert.deepStrictEqual({
			histories, completions: logService.infos.filter(message => message.includes(' completed ')),
		}, {
			histories: [undefined, undefined],
			completions: [
				'[CloudSandboxApi] historyTiming loadId=2 traceId=history-2 completed apiMs=20 replayMs=0 events=0 sessions=0 truncated=false totalMs=20',
				'[CloudSandboxApi] historyTiming loadId=1 traceId=history-1 completed apiMs=40 replayMs=0 events=0 sessions=0 truncated=false totalMs=40',
			],
		});
	}));

	for (const requestId of ['ABCD:1234:5678:90AB:CDEF', 'private-invalid-header']) {
		test(`correlates transport timings and includes only a validated upstream request ID (${requestId})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const logService = new TestLogService();
			let diagnosticId: string | undefined;
			const { service } = createService(store, {
				tasks: [], repositories: new Map(), logService,
				onRequest: async (_url, _token, options) => {
					diagnosticId = options.diagnosticId;
					await timeout(200);
					return {
						...jsonResponse({ events: [], total: 0 }, 200, { 'x-github-request-id': requestId }),
						timings: { responseHeadersMs: 150, responseBodyMs: 50, decodedBodyBytes: 23 },
					};
				},
			});
			await service.getSessionHistory('private-task', CancellationToken.None, 'sandbox-1');

			assert.deepStrictEqual({
				diagnosticId,
				response: logService.infos.find(message => message.includes(' responseReceived ')),
			}, {
				diagnosticId: 'sandbox-1/history-1',
				response: `[CloudSandboxApi] historyTiming loadId=1 traceId=sandbox-1 responseReceived requestMs=200 status=200 responseHeadersMs=150 downloadMs=50 decodedBodyBytes=23 requestId=${requestId.startsWith('private-') ? 'unavailable' : requestId} totalMs=200`,
			});
		}));
	}
});

suite('CloudSandboxApiService history cache', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function historyResponse(title: string): IRequestContext {
		return jsonResponse({
			events: [{
				ns: 'ahp', session_id: 'session', seq: 0, at: '2026-01-01T00:00:00Z',
				payload: { kind: 'message', data: { channel: 'ahp-session:/session', serverSeq: 0, action: { type: 'session/titleChanged', title } } },
			}],
			total: 1,
		});
	}

	test('coalesces authentication and events reads, and previews a warm snapshot before the response', async () => {
		let authentications = 0;
		let requests = 0;
		const response = new DeferredPromise<IRequestContext>();
		const logService = new TestLogService();
		const { service } = createService(store, {
			tasks: [], repositories: new Map(), logService,
			authenticationSessions: async () => {
				authentications++;
				return [{ accessToken: 'private-token', id: 's', account: { id: 'private-account', label: 'private-label' }, scopes: [] }];
			},
			onRequest: () => ++requests === 1 ? historyResponse('Recorded') : response.p,
		});
		const first = await Promise.all([
			service.getSessionHistory('private-task', CancellationToken.None),
			service.getSessionHistory('private-task', CancellationToken.None),
		]);
		const cached = new DeferredPromise<string>();
		let completed = false;
		const refresh = service.getSessionHistory('private-task', CancellationToken.None, 'sandbox-1', history => void cached.complete(history.sessions[0].state.title));
		void refresh.then(() => completed = true);
		const beforeResponse = { title: await cached.p, completed };
		await response.complete(historyResponse('Updated'));
		const result = await refresh;
		assert.deepStrictEqual({
			authentications, requests, first: first.map(history => history?.sessions[0].state.title), beforeResponse,
			title: result?.sessions[0].state.title,
			cacheHits: logService.infos.filter(message => message.includes('historyCacheHit traceId=sandbox-1')).length,
			privateData: logService.infos.some(message => message.includes('private-')),
		}, {
			authentications: 2, requests: 2, first: ['Recorded', 'Recorded'],
			beforeResponse: { title: 'Recorded', completed: false }, title: 'Updated', cacheHits: 1, privateData: false,
		});
	});

	for (const lateStatus of [200, 403]) {
		test(`account changes prevent old-account cache reuse or invalidation by a late HTTP ${lateStatus}`, async () => {
			let account = 'first';
			let requests = 0;
			const response = new DeferredPromise<IRequestContext>();
			const cached = new DeferredPromise<void>();
			const { service, changeAuthentication } = createService(store, {
				tasks: [], repositories: new Map(),
				authenticationSessions: async () => [{ accessToken: 'token', id: 's', account: { id: account, label: account }, scopes: [] }],
				onRequest: () => ++requests === 2 ? response.p : historyResponse(account),
			});
			await service.getSessionHistory('task', CancellationToken.None);
			const refresh = service.getSessionHistory('task', CancellationToken.None, undefined, () => void cached.complete());
			await cached.p;
			const cancelled = assert.rejects(refresh, isCancellationError);
			account = 'second';
			changeAuthentication();
			await cancelled;
			let previews = 0;
			const fresh = await service.getSessionHistory('task', CancellationToken.None, undefined, () => previews++);
			const beforeLateResponse = previews;
			await response.complete(lateStatus === 200 ? historyResponse('Late first account') : jsonResponse({}, lateStatus));
			await timeout(0);
			const reopened = await service.getSessionHistory('task', CancellationToken.None, undefined, () => previews++);
			assert.deepStrictEqual({ requests, beforeLateResponse, previews, titles: [fresh, reopened].map(history => history?.sessions[0].state.title) }, {
				requests: 4, beforeLateResponse: 0, previews: 1, titles: ['second', 'second'],
			});
		});
	}

	test('clearing a task while authenticating cancels the read before any request is sent', async () => {
		const started = new DeferredPromise<void>();
		const authenticated = new DeferredPromise<readonly AuthenticationSession[]>();
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: () => { void started.complete(); return authenticated.p; },
		});
		const pending = service.getSessionHistory('task', CancellationToken.None);
		await started.p;
		const cancelled = assert.rejects(pending, isCancellationError);
		service.clearSessionHistory('task');
		await cancelled;
		await authenticated.complete([{ accessToken: 'token', id: 's', account: { id: 'a', label: 'a' }, scopes: [] }]);
		await timeout(0);
		assert.deepStrictEqual(requestedUrls, []);
	});

	for (const status of [401, 403, 404]) {
		test(`HTTP ${status} rejects refresh and evicts cached task history`, async () => {
			let responseStatus = 200;
			const { service } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: () => responseStatus === 200 ? historyResponse('Recorded') : jsonResponse({}, responseStatus),
			});
			await service.getSessionHistory('task', CancellationToken.None);
			responseStatus = status;
			await assert.rejects(service.getSessionHistory('task', CancellationToken.None), new RegExp(`HTTP ${status}`));
			responseStatus = 200;
			let previews = 0;
			await service.getSessionHistory('task', CancellationToken.None, undefined, () => previews++);
			assert.strictEqual(previews, 0);
		});
	}

	for (const mutation of ['rename', 'archive', 'unarchive', 'delete'] as const) {
		test(`${mutation} invalidates the affected task without evicting other tasks`, async () => {
			const { service } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: url => url.pathname.endsWith('/events') ? historyResponse('Recorded')
					: mutation === 'delete' ? jsonResponse({}, 204) : jsonTaskResponse({ id: 'task' }),
			});
			await service.getSessionHistory('task', CancellationToken.None);
			await service.getSessionHistory('unaffected', CancellationToken.None);
			if (mutation === 'rename') {
				await service.renameTask('task', 'Renamed', CancellationToken.None);
			} else if (mutation === 'delete') {
				await service.deleteTask('task', CancellationToken.None);
			} else {
				await service.setTaskArchived('task', mutation === 'archive', CancellationToken.None);
			}
			const previews: string[] = [];
			await service.getSessionHistory('task', CancellationToken.None, undefined, () => previews.push('task'));
			await service.getSessionHistory('unaffected', CancellationToken.None, undefined, () => previews.push('unaffected'));
			assert.deepStrictEqual(previews, ['unaffected']);
		});
	}
});

suite('Mission Control environment discovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const statusCode of [204, 404]) {
		test(`environment deletion accepts ${statusCode} and invalidates cached and in-flight discovery`, async () => {
			const requests: IRequestOptions[] = [];
			const started = new DeferredPromise<void>();
			const response = new DeferredPromise<IRequestContext>();
			let holdDiscovery = false;
			const { service, requestOutcomes } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: (url, _token, options) => {
					if (options.type === 'DELETE') {
						requests.push(options);
						return jsonResponse({}, statusCode);
					}
					if (url.pathname.endsWith('/agents/environments')) {
						if (holdDiscovery) {
							void started.complete();
							return response.p;
						}
						return jsonResponse([{ id: 'host', kind: 'user-local', name: 'Host', status: 'offline' }]);
					}
					return undefined;
				},
			});
			await service.listEnvironments(CancellationToken.None);
			holdDiscovery = true;
			const discovery = service.listEnvironments(CancellationToken.None, { refresh: true });
			const rejected = assert.rejects(discovery, CancellationError);
			await started.p;
			const account = await service.getAccountKey();
			assert.ok(account);
			await service.deleteEnvironment('host/with spaces', CancellationToken.None, account);
			await response.complete(jsonResponse([{ id: 'host', kind: 'user-local', name: 'Stale', status: 'offline' }]));
			await rejected;
			assert.deepStrictEqual({
				requests: requests.map(request => {
					assert.ok(request.url);
					return { path: new URL(request.url).pathname, method: request.type, body: request.data };
				}),
				cached: service.getCachedEnvironments(),
				deleteOutcomes: requestOutcomes.filter(([action]) => action === 'deleteEnvironment'),
			}, {
				requests: [{ path: '/agents/environments/host%2Fwith%20spaces', method: 'DELETE', body: undefined }],
				cached: undefined,
				deleteOutcomes: [],
			});
		});
	}

	for (const statusCode of [401, 403, 500]) {
		test(`environment deletion surfaces HTTP ${statusCode} and preserves cached inventory`, async () => {
			const { service } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: (_url, _token, options) => options.type === 'DELETE'
					? jsonResponse({}, statusCode) : jsonResponse([{ id: 'host', kind: 'user-local', name: 'Host', status: 'offline' }]),
			});
			const before = await service.listEnvironments(CancellationToken.None);
			const account = await service.getAccountKey();
			assert.ok(account);
			await assert.rejects(service.deleteEnvironment('host', CancellationToken.None, account), /environment delete failed/);
			assert.deepStrictEqual(service.getCachedEnvironments(), before);
		});
	}

	test('caches credential-free metadata and invalidates it when the account changes', async () => {
		const { service, requestedUrls, changeAuthentication } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: url => url.pathname.endsWith('/agents/environments') ? jsonResponse([{
				id: 'host', kind: 'user-local', name: 'Native host', status: 'online',
				webpubsub: {
					url: 'wss://relay.example.test', hub: 'hub', subprotocol: 'json.reliable.webpubsub.azure.v1',
					access_token: 'must-not-be-cached', groups: { control: 'control', ingest_ack: 'ack', events: 'events', lifecycle: 'lifecycle' },
				},
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

	test('rejects invalid environment metadata without publishing a partial inventory', async () => {
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: url => url.pathname.endsWith('/agents/environments') ? jsonResponse([
				{ id: 'invalid', name: 'Invalid host', kind: 'user-local' },
				{ id: 'host', name: 'Native host', kind: 'user-local', status: 'online' },
				{ id: 'managed', name: 'Managed host', kind: 'managed-sandbox', status: 'paused' },
			]) : undefined,
		});
		await assert.rejects(service.listEnvironments(CancellationToken.None), SchemaError);
		assert.strictEqual(service.getCachedEnvironments(), undefined);
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

suite('CloudSandboxApiService archived discovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolving an uncached task during archive discovery preserves its complete summary', async () => {
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<IRequestContext>();
		const archived = {
			...task('archived', 'Archived task', 42, 'session', 'environment'),
			archived_at: '2026-09-22T09:00:00Z',
			updated_at: '2026-09-22T10:00:00Z',
			state: 'idle',
		};
		const { service } = createService(store, {
			tasks: [archived], repositories: new Map([[42, { full_name: 'owner/repo' }]]),
			onRequest: url => {
				if (url.pathname === '/agents/tasks' && url.searchParams.get('is_archived') === 'true' && url.searchParams.get('with_repo') === 'true') {
					void started.complete();
					return response.p;
				}
				return undefined;
			},
		});
		const discovery = service.listSessions(CancellationToken.None, { includeArchived: true });
		await started.p;
		const resolved = await service.resolveSession('archived', CancellationToken.None);
		void response.complete(jsonResponse({ tasks: [archived] }));
		const result = await discovery;
		assert.ok(result.kind !== 'failed');
		const scanned = result.sessions.find(session => session.taskId === 'archived');
		const metadata = (session: typeof resolved | typeof scanned) => session && ({
			isArchived: session.isArchived, updatedAt: session.updatedAt, status: session.status, repoName: session.repoName,
			environmentId: session.environmentId, sessionId: session.sessionId,
		});
		const expected = {
			isArchived: true, updatedAt: archived.updated_at, status: SessionStatus.Idle, repoName: 'owner/repo',
			environmentId: 'environment', sessionId: 'session',
		};
		assert.deepStrictEqual([metadata(resolved), metadata(scanned)], [expected, expected]);
	});

	test('bounds active-only discovery and the first archive expansion to three pages per requested partition', async () => {
		const date = 'Tue, 22 Sep 2026 10:00:00 GMT';
		const tasks: ITestTask[] = [
			task('repo', 'Repository', 42, 'repo-session', 'repo-environment'),
			task('no-repo', 'No repository', undefined, 'no-repo-session', 'no-repo-environment'),
			{ ...task('archived-repo', 'Archived repository', 42, 'archived-repo-session', 'archived-repo-environment'), archived_at: new Date(date).toISOString() },
			{ ...task('archived-no-repo', 'Archived without repository', undefined, 'archived-no-repo-session', 'archived-no-repo-environment'), archived_at: new Date(date).toISOString() },
		].map(task => ({ ...task, updated_at: '2026-09-22T09:00:00Z' }));
		const { service, requestedUrls } = createService(store, {
			tasks, repositories: new Map([[42, { full_name: 'owner/repo' }]]),
			onRequest: url => {
				if (url.pathname !== '/agents/tasks') {
					return undefined;
				}
				const archived = url.searchParams.get('is_archived') === 'true';
				const continuation = new URL(url);
				continuation.searchParams.set('page', String(Number(url.searchParams.get('page')) + 1));
				return jsonResponse({
					tasks: tasks.filter(task => (task.repository !== undefined) === (url.searchParams.get('with_repo') === 'true')
						&& !!task.archived_at === archived),
				}, 200, { date, link: `<${continuation.search}>; rel="next"` });
			},
		});
		const partitions = () => requestedUrls.map(url => new URL(url)).filter(url => url.pathname === '/agents/tasks')
			.map(url => [url.searchParams.get('with_repo'), url.searchParams.get('is_archived'), url.searchParams.get('page')]);
		const active = await service.listSessions(CancellationToken.None, { includeArchived: false });
		const activeRequests = partitions();
		requestedUrls.length = 0;
		const expanded = await service.listSessions(CancellationToken.None, { incremental: true, includeArchived: true });
		assert.deepStrictEqual({
			kinds: [active.kind, expanded.kind],
			activeRequests,
			expandedRequests: partitions(),
			expandedDetails: requestedUrls.map(url => new URL(url).pathname).filter(path => path.startsWith('/agents/tasks/')),
		}, {
			kinds: ['scoped', 'complete'],
			activeRequests: [true, false].flatMap(withRepository => [1, 2, 3].map(page => [String(withRepository), 'false', String(page)])),
			expandedRequests: [false, true].flatMap(archived => [true, false].flatMap(withRepository =>
				[1, 2, 3].map(page => [String(withRepository), String(archived), String(page)]))),
			expandedDetails: [],
		});
	});

	test('active-only window eviction is not confirmed deletion and targeted archive reads still work', async () => {
		const original = task('changed', 'Changed', undefined, 'session', 'environment');
		const tasks: ITestTask[] = [original];
		const { service, requestedUrls } = createService(store, { tasks, repositories: new Map() });
		await service.listSessions(CancellationToken.None);
		tasks[0] = { ...original, archived_at: '2026-10-01T00:00:00Z' };
		requestedUrls.length = 0;
		const collapsed = await service.listSessions(CancellationToken.None, { includeArchived: false });
		const collapsedDetails = requestedUrls.filter(url => new URL(url).pathname.startsWith('/agents/tasks/'));
		requestedUrls.length = 0;
		const opened = await service.listSessions(CancellationToken.None, { includeArchived: false, taskIds: ['changed'] });
		assert.deepStrictEqual({
			collapsed, collapsedDetails,
			opened: opened.kind === 'failed' ? [] : opened.sessions.map(session => ({ taskId: session.taskId, archived: session.isArchived })),
			openedRequests: requestedUrls.map(url => new URL(url).pathname),
		}, {
			collapsed: { kind: 'scoped', sessions: [], removedTaskIds: [] }, collapsedDetails: [],
			opened: [{ taskId: 'changed', archived: true }], openedRequests: ['/agents/tasks/batch'],
		});
	});

	test('active-only startup reads neither archived inventory nor archived task details', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [
				task('active', 'Active', undefined, 'active-session', 'environment'),
				{ ...task('archived', 'Archived', undefined, 'archived-session', 'environment'), archived_at: '2026-10-01T00:00:00Z' },
			],
			repositories: new Map(),
		});
		const result = await service.listSessions(CancellationToken.None, { includeArchived: false });
		assert.deepStrictEqual({
			kind: result.kind,
			sessions: result.kind === 'failed' ? [] : result.sessions.map(session => session.taskId),
			lists: requestedUrls.filter(url => new URL(url).pathname === '/agents/tasks').map(url => new URL(url).searchParams.get('is_archived')),
			details: requestedUrls.filter(url => new URL(url).pathname.startsWith('/agents/tasks/')).map(url => new URL(url).pathname),
		}, { kind: 'scoped', sessions: ['active'], lists: ['false', 'false'], details: [] });
	});

	test('first archived discovery does not reuse an active-only checkpoint and later active refreshes retain its cache', async () => {
		const archived = {
			...task('archived', 'Archived', undefined, 'archived-session', 'environment'),
			archived_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
		};
		const { service, requestedUrls } = createService(store, {
			tasks: [archived], repositories: new Map(),
			discoveryDate: () => '2026-10-01T00:00:00Z',
		});
		await service.listSessions(CancellationToken.None, { includeArchived: false });
		requestedUrls.length = 0;
		const expanded = await service.listSessions(CancellationToken.None, { incremental: true, includeArchived: true });
		const expansionLists = requestedUrls.filter(url => new URL(url).pathname === '/agents/tasks').map(url => ({
			archived: new URL(url).searchParams.get('is_archived'), since: new URL(url).searchParams.get('since'),
		}));
		requestedUrls.length = 0;
		const collapsed = await service.listSessions(CancellationToken.None, { includeArchived: false });
		const readsWhileCollapsed = [...requestedUrls];
		requestedUrls.length = 0;
		const reopened = await service.listSessions(CancellationToken.None, { includeArchived: true });
		assert.deepStrictEqual({
			expansion: expanded.kind === 'failed' ? [] : expanded.sessions.map(session => session.taskId),
			expansionLists, collapsed,
			readsWhileCollapsed: readsWhileCollapsed.map(url => new URL(url).searchParams.get('is_archived')),
			reopened: reopened.kind === 'failed' ? [] : reopened.sessions.map(session => session.taskId),
			reopenedDetails: requestedUrls.filter(url => new URL(url).pathname === '/agents/tasks/archived').length,
		}, {
			expansion: ['archived'],
			expansionLists: ['false', 'false', 'true', 'true'].map(archived => ({ archived, since: null })),
			collapsed: { kind: 'scoped', sessions: [], removedTaskIds: [] }, readsWhileCollapsed: ['false', 'false'],
			reopened: ['archived'], reopenedDetails: 0,
		});
	});

	test('known archived tasks remain targetable without archived inventory demand', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [{ ...task('archived', 'Archived', undefined, 'session', 'environment'), archived_at: '2026-10-01T00:00:00Z' }],
			repositories: new Map(),
		});
		const result = await service.listSessions(CancellationToken.None, { includeArchived: false, taskIds: ['archived'] });
		assert.deepStrictEqual({
			archived: result.kind === 'failed' ? [] : result.sessions.map(session => session.isArchived),
			urls: requestedUrls.map(url => new URL(url).pathname),
		}, { archived: [true], urls: ['/agents/tasks/batch'] });
	});
});

suite('CloudSandboxApiService repository resolution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const repository of [{ id: 0 }, {}]) {
		test(`ignores an empty repository reference ${JSON.stringify(repository)}`, async () => {
			const current = {
				...task('repo-less', 'General chat', 0, 'session-1', 'environment-1'),
				updated_at: '2026-10-01T00:01:00.000Z',
			};
			const { service, requestedUrls } = createService(store, {
				tasks: [current],
				repositories: new Map(),
				onRequest: url => url.pathname.endsWith('/tasks/repo-less') ? jsonResponse({ ...current, repository }) : undefined,
				discoveryDate: () => '2026-10-01T00:03:00.000Z',
			});

			const initial = await service.listSessions(CancellationToken.None);
			const incremental = await service.listSessions(CancellationToken.None, { incremental: true });

			assert.deepStrictEqual({
				sessions: initial.kind === 'failed' ? initial : initial.sessions.map(session => ({
					id: session.taskId, hasRepository: session.hasRepository, repoName: session.repoName,
				})),
				incremental,
				repositoryLookups: requestedUrls.filter(url => url.includes('/repositories/')),
				detailReads: requestedUrls.filter(url => url.endsWith('/tasks/repo-less')).length,
			}, {
				sessions: [{ id: 'repo-less', hasRepository: false, repoName: undefined }],
				incremental: { kind: 'incremental', sessions: [], removedTaskIds: [] },
				repositoryLookups: [],
				detailReads: 0,
			});
		});
	}

	test('does not request details to decorate a repo-less task', async () => {
		const current = task('new-repository', 'Repository chat', 0, 'session-1', 'environment-1');
		const { service, requestedUrls } = createService(store, {
			tasks: [current],
			repositories: new Map([[42, { full_name: 'owner/repository' }]]),
			onRequest: url => url.pathname.endsWith('/tasks/new-repository') ? jsonResponse({ ...current, repository: { id: 42 } }) : undefined,
		});
		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			sessions: result.kind === 'failed' ? result : result.sessions.map(session => ({
				hasRepository: session.hasRepository, repoName: session.repoName,
			})),
			repositoryLookups: requestedUrls.filter(url => url.includes('/repositories/')).map(url => new URL(url).pathname),
		}, {
			sessions: [{ hasRepository: false, repoName: undefined }],
			repositoryLookups: [],
		});
	});

	test('retains the listed repository when task details contain an empty reference', async () => {
		const current = task('with-repository', 'Repository chat', 42, 'session-1', 'environment-1');
		const { service, requestedUrls } = createService(store, {
			tasks: [current],
			repositories: new Map([[42, { full_name: 'owner/repository' }]]),
			onRequest: url => url.pathname.endsWith('/tasks/with-repository') ? jsonResponse({ ...current, repository: { id: 0 } }) : undefined,
		});
		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			sessions: result.kind === 'failed' ? result : result.sessions.map(session => ({
				hasRepository: session.hasRepository, repoName: session.repoName,
			})),
			repositoryLookups: requestedUrls.filter(url => url.includes('/repositories/')).map(url => new URL(url).pathname),
		}, {
			sessions: [{ hasRepository: true, repoName: 'owner/repository' }],
			repositoryLookups: ['/repositories/42'],
		});
	});

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
			id: session.taskId, hasRepository: session.hasRepository, name: session.repoName,
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
		}, { classifications: [[true], [false]], detailReads: 0 });
	});

	test('preserves the creating application from cloud task discovery', async () => {
		const { service } = createService(store, {
			tasks: [{ ...task('task-1', 'From Slack', undefined, 'session-1', 'environment-1'), event_type: 'slack' }],
			repositories: new Map(),
		});
		const result = await service.listSessions(CancellationToken.None);
		assert.deepStrictEqual(result.kind === 'failed' ? result : result.sessions.map(session => session.eventType), ['slack']);
	});

	test('uses the task creator rather than participating or nested session clients', async () => {
		const source = {
			...task('task-1', 'From CLI', undefined, 'session-1', 'environment-1'),
			event_type: 'slack',
			clients: [
				{ integration_id: 'vscode-chat', slug: 'copilot-vscode', creator: false },
				{ integration_id: 'copilot-developer-cli', slug: 'copilot-cli', creator: true },
			],
			sessions: [{
				id: 'session-1', environment_id: 'environment-1',
				state: 'completed', created_at: '2026-01-01T00:00:00Z',
				clients: [{ integration_id: 'vscode-chat', slug: 'copilot-vscode', creator: true }],
			}],
		};
		const { service } = createService(store, { tasks: [source], repositories: new Map() });
		const result = await service.listSessions(CancellationToken.None);
		assert.deepStrictEqual(result.kind === 'failed' ? result : result.sessions.map(({ application, eventType }) => ({ application, eventType })), [
			{ application: 'copilot-cli', eventType: 'slack' },
		]);
	});

	test('hydrates creator attribution without an activity timestamp change', async () => {
		const clients: TaskClient[] = [];
		const source = {
			...task('task-1', 'From CLI', undefined, 'session-1', 'environment-1'),
			event_type: 'slack',
			updated_at: '2026-07-01T00:01:00.000Z',
			clients,
		};
		const { service, requestedUrls } = createService(store, { tasks: [source], repositories: new Map() });
		const initial = await service.listSessions(CancellationToken.None);
		clients.push({ integration_id: 'vscode-chat', slug: 'copilot-vscode', creator: false });
		const participating = await service.listSessions(CancellationToken.None);
		clients.push({ integration_id: 'copilot-developer-cli', slug: 'copilot-cli', creator: true });
		const attributed = await service.listSessions(CancellationToken.None);
		const cached = await service.listSessions(CancellationToken.None);
		assert.deepStrictEqual({
			applications: [initial, participating, attributed, cached].map(result => result.kind === 'failed' ? result.reason : result.sessions.map(session => session.application)),
			detailReads: requestedUrls.filter(url => url.endsWith('/tasks/task-1')).length,
		}, {
			applications: [[undefined], [undefined], ['copilot-cli'], ['copilot-cli']],
			detailReads: 0,
		});
	});

	for (const { label, clients } of [
		{ label: 'omits clients', clients: undefined },
		{ label: 'reports an empty client list', clients: [] },
		{ label: 'reports only participating clients', clients: [{ integration_id: 'vscode-chat', slug: 'copilot-vscode', creator: false }] },
	]) {
		test(`retains known creation provenance when a later response ${label}`, async () => {
			const source: ReturnType<typeof task> & { clients?: readonly TaskClient[]; updated_at: string } = {
				...task('task-1', 'From CLI', undefined, 'session-1', 'environment-1'),
				updated_at: '2026-07-01T00:01:00.000Z',
				clients: [{ integration_id: 'copilot-developer-cli', slug: 'copilot-cli', creator: true }],
			};
			const { service, requestedUrls } = createService(store, { tasks: [source], repositories: new Map() });
			const initial = await service.listSessions(CancellationToken.None);
			source.clients = clients;
			const cached = await service.listSessions(CancellationToken.None);
			source.updated_at = '2026-07-01T00:02:00.000Z';
			const refreshed = await service.listSessions(CancellationToken.None);
			const targeted = await service.listSessions(CancellationToken.None, { taskIds: ['task-1'] });
			assert.deepStrictEqual({
				applications: [initial, cached, refreshed, targeted].map(result => result.kind === 'failed' ? result.reason : result.sessions.map(session => session.application)),
				detailReads: requestedUrls.filter(url => url.endsWith('/tasks/task-1')).length,
			}, {
				applications: [['copilot-cli'], ['copilot-cli'], ['copilot-cli'], ['copilot-cli']],
				detailReads: 0,
			});
		});
	}

	test('lists task activity without resolving the bound session', async () => {
		const states = ['queued', 'in_progress', 'waiting_for_user', 'idle', 'completed', 'failed', 'timed_out', 'cancelled'];
		const { service } = createService(store, {
			tasks: states.map(state => ({
				...task(state, state, undefined, `session-${state}`, `environment-${state}`),
				state,
				sessions: [{ id: `session-${state}`, environment_id: `environment-${state}`, state: 'idle', created_at: '2026-01-01T00:00:00Z' }],
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
				taskId: 'task-1',
				name: 'Change port to 5555',
				repoName: 'osortega/simple-server',
				hasRepository: true,
				updatedAt: undefined,
				status: SessionStatus.Idle,
			}],
		});
	});

	test('retains task activity and refreshes it from incremental summaries without detail reads', async () => {
		const current = {
			...task('activity-cache', 'Question', undefined, 'original-session', 'original-environment'),
			updated_at: '2026-07-01T00:01:00.000Z',
			state: 'waiting_for_user',
			sessions: [{ id: 'original-session', environment_id: 'original-environment', state: 'waiting_for_user', created_at: '2026-01-01T00:00:00Z' }],
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
		current.state = 'completed';
		const refreshed = await h.service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			statuses: [initial, cached, refreshed].map(result => result.kind === 'failed' ? result.reason : result.sessions.map(session => session.status)),
			detailReads: h.requestedUrls.filter(url => url.endsWith('/tasks/activity-cache')).length,
		}, {
			statuses: [[SessionStatus.InputNeeded], [SessionStatus.InputNeeded], [SessionStatus.Idle]],
			detailReads: 0,
		});
	});

	test('propagates task-list cancellation without error logging', async () => {
		const logService = new TestLogService();
		const cancellation = store.add(new CancellationTokenSource());
		const { service } = createService(store, {
			tasks: [],
			repositories: new Map(),
			onRequest: () => {
				cancellation.cancel();
				throw new CancellationError();
			},
			logService,
		});

		await assert.rejects(service.listSessions(cancellation.token), isCancellationError);
		assert.deepStrictEqual(logService.errors, []);
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
		const tasks = Array.from({ length: 12 }, (_, index) => task(`task-${index}`, 'Task', 290012776, `session-${index}`, `environment-${index}`));
		const repositories = new Map<number, { full_name?: string } | 'error'>([[290012776, 'error']]);
		const { service, requestedUrls } = createService(store, {
			tasks,
			repositories,
		});

		const first = await service.listSessions(CancellationToken.None);
		repositories.set(290012776, { full_name: 'osortega/simple-server' });
		const second = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			firstKind: first.kind,
			firstSessions: first.kind === 'failed' ? [] : first.sessions.map(s => s.taskId),
			firstNames: first.kind === 'failed' ? [] : first.sessions.map(s => s.repoName),
			secondNames: second.kind === 'failed' ? [] : second.sessions.map(s => s.repoName),
			repoLookups: requestedUrls.filter(u => /\/repositories\//.test(u)).length,
		}, {
			firstKind: 'complete',
			firstSessions: tasks.map(task => task.id),
			firstNames: Array(12).fill(undefined),
			secondNames: Array(12).fill('osortega/simple-server'),
			repoLookups: 2,
		});
	});

	for (const slug of ['copilot-developer', 'copilot-swe-agent', undefined]) {
		test(`discovers sandbox sessions independently of agent slug (${slug})`, async () => {
			const { service } = createService(store, {
				tasks: [{
					...task('sandbox', 'Sandbox', undefined, 'session', 'environment'),
					agent_collaborators: slug ? [{ slug }] : [],
				}],
				repositories: new Map(),
			});

			const result = await service.listSessions(CancellationToken.None);

			assert.deepStrictEqual({
				kind: result.kind,
				sessions: result.kind === 'failed' ? [] : result.sessions.map(session => session.taskId),
			}, { kind: 'complete', sessions: ['sandbox'] });
		});
	}

	for (const { name, compute, kind, expected } of [
		{ name: 'missing compute', compute: undefined, kind: 'managed-sandbox', expected: true },
		{ name: 'null compute', compute: null, kind: 'managed-sandbox', expected: true },
		{ name: 'missing compute provider', compute: {}, kind: 'managed-sandbox', expected: true },
		{ name: 'empty provisioning compute provider', compute: { provider: '' }, kind: 'managed-sandbox', expected: true },
		{ name: 'empty user-local compute provider', compute: { provider: '' }, kind: 'user-local', expected: false },
		{ name: 'empty compute provider without environment kind', compute: { provider: '' }, kind: undefined, expected: false },
		{ name: 'compute only', compute: { provider: 'sandboxes' }, kind: undefined, expected: true },
		{ name: 'explicit other compute', compute: { provider: 'codespaces' }, kind: 'managed-sandbox', expected: false },
		{ name: 'user-local environment', compute: undefined, kind: 'user-local', expected: false },
		{ name: 'unknown environment kind', compute: undefined, kind: 'unknown', expected: false },
		{ name: 'missing compute and environment', compute: undefined, kind: undefined, expected: false },
	]) {
		test(`recognizes sandbox metadata (${name})`, async () => {
			const { service } = createService(store, {
				tasks: [{
					...task('sandbox', 'Sandbox', undefined, 'session', 'environment'),
					agent_collaborators: [{ slug: 'copilot-developer' }],
					compute,
					current_environment: kind ? { id: 'environment', kind } : undefined,
				}],
				repositories: new Map(),
			});

			const result = await service.listSessions(CancellationToken.None);

			assert.deepStrictEqual({
				kind: result.kind,
				sessions: result.kind === 'failed' ? [] : result.sessions.map(session => session.taskId),
			}, { kind: name === 'unknown environment kind' ? 'failed' : 'complete', sessions: expected ? ['sandbox'] : [] });
		});
	}

	test('discovers sandbox tasks on the third page and stays complete when the scope is exhausted', async () => {
		const filler = Array.from({ length: 200 }, (_, i) => task(`filler-${i}`, 'x', undefined, `fs-${i}`, `fe-${i}`));
		const { service, requestedUrls } = createService(store, {
			tasks: [...filler, task('task-old', 'older sandbox', undefined, 'sess-old', 'env-old')],
			repositories: new Map(),
		});

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			kind: result.kind,
			found: result.kind === 'failed' ? [] : result.sessions.filter(s => s.taskId === 'task-old').map(s => s.taskId),
			listPages: requestedUrls.filter(u => /[?&]per_page=/.test(u)).length,
		}, {
			kind: 'complete',
			found: ['task-old'],
			listPages: 6,
		});
	});

	test('follows the Link header after an empty first page within the page limit', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [task('task-old', 'older sandbox', undefined, 'sess-old', 'env-old')],
			repositories: new Map(),
			shortFirstPage: true,
		});

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			kind: result.kind,
			found: result.kind === 'failed' ? [] : result.sessions.map(s => s.taskId),
			listPages: requestedUrls.filter(u => /[?&]per_page=/.test(u)).length,
		}, {
			kind: 'complete',
			found: ['task-old'],
			listPages: 5,
		});
	});

	for (const repositoryId of [undefined, 42]) {
		for (const archived of [false, true]) {
			test(`bounds discovery in each scope (repository=${repositoryId}, archived=${archived})`, async () => {
				const tasks = Array.from({ length: 300 }, (_, i) => ({
					...task(`filler-${i}`, 'Other task', repositoryId, `s-${i}`, `e-${i}`),
					agent_collaborators: [{ slug: 'other' }],
					compute: { provider: 'codespaces' },
					...(archived ? { archived_at: '2026-10-01T00:00:00Z' } : {}),
				}));
				tasks.push({
					...task('older', 'Older sandbox', repositoryId, 'older-session', 'older-environment'),
					...(archived ? { archived_at: '2026-10-01T00:00:00Z' } : {}),
				});
				const { service, requestedUrls } = createService(store, {
					tasks, repositories: new Map([[42, { full_name: 'owner/repository' }]]),
				});

				const result = await service.listSessions(CancellationToken.None);

				assert.deepStrictEqual({
					kind: result.kind,
					sessions: result.kind === 'failed' ? [] : result.sessions.map(session => session.taskId),
					listPages: requestedUrls.filter(u => /[?&]per_page=/.test(u)).length,
				}, {
					kind: 'complete',
					sessions: [],
					listPages: 6,
				});
			});
		}
	}

	test('cancellation stops paging and the remaining scope requests', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: url => {
				if (url.searchParams.get('page') === '3') {
					cancellation.cancel();
					throw new CancellationError();
				}
				return jsonResponse({ tasks: [] }, 200, { link: `<?page=${Number(url.searchParams.get('page')) + 1}>; rel="next"` });
			},
		});

		await assert.rejects(service.listSessions(cancellation.token), isCancellationError);
		assert.deepStrictEqual(requestedUrls.map(url => new URL(url).searchParams.get('page')), ['1', '2', '3']);
	});
});

suite('CloudSandboxApiService pagination', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('limits cursor pagination to three pages in every scope without resolving executions', async () => {
		const date = 'Tue, 22 Sep 2026 10:00:00 GMT';
		const tasks: ITestTask[] = [
			task('repo', 'Repository', 42, 'repo-session', 'repo-environment'),
			task('no-repo', 'No repository', undefined, 'no-repo-session', 'no-repo-environment'),
			{ ...task('archived-repo', 'Archived repository', 42, 'archived-repo-session', 'archived-repo-environment'), archived_at: new Date(date).toISOString() },
			{ ...task('archived-no-repo', 'Archived without repository', undefined, 'archived-no-repo-session', 'archived-no-repo-environment'), archived_at: new Date(date).toISOString() },
		];
		const { service, requestedUrls } = createService(store, {
			tasks, repositories: new Map([[42, { full_name: 'owner/repo' }]]),
			onRequest: url => {
				if (url.pathname !== '/agents/tasks') {
					return undefined;
				}
				const cursor = url.searchParams.get('cursor');
				const next = cursor === null ? 'second+/= opaque' : cursor === 'second+/= opaque' ? 'third' : 'fourth';
				const continuation = new URL(url);
				continuation.searchParams.delete('page');
				continuation.searchParams.set('cursor', next);
				return jsonResponse({
					tasks: tasks.filter(task => (task.repository !== undefined) === (url.searchParams.get('with_repo') === 'true')
						&& !!task.archived_at === (url.searchParams.get('is_archived') === 'true')),
				}, 200, { date, link: ['<?page=1>; rel="first"', `<${continuation.search}>; rel="next"`] });
			},
		});

		const result = await service.listSessions(CancellationToken.None);
		const requests = requestedUrls.map(url => new URL(url)).filter(url => url.pathname === '/agents/tasks');

		assert.deepStrictEqual({
			kind: result.kind,
			tasks: result.kind === 'failed' ? [] : result.sessions.map(session => session.taskId),
			requests: requests.map(url => [url.origin, url.searchParams.get('with_repo'), url.searchParams.get('is_archived'), url.searchParams.get('page'), url.searchParams.get('cursor')]),
			details: requestedUrls.map(url => new URL(url).pathname).filter(path => path.startsWith('/agents/tasks/')),
		}, {
			kind: 'complete',
			tasks: tasks.map(task => task.id),
			requests: [false, true].flatMap(archived => [true, false].flatMap(withRepository => [null, 'second+/= opaque', 'third'].map(cursor =>
				['https://api.githubcopilot.com', String(withRepository), String(archived), cursor ? null : '1', cursor]))),
			details: [],
		});
	});

	test('follows numbered next-page links with the service-provided scope filters', async () => {
		const older = task('older', 'Older task', undefined, 'older-session', 'older-environment');
		const { service, requestedUrls } = createService(store, {
			tasks: [older], repositories: new Map(),
			onRequest: url => {
				if (url.pathname !== '/agents/tasks' || url.searchParams.get('with_repo') !== 'false' || url.searchParams.get('is_archived') !== 'false') {
					return undefined;
				}
				const continuation = new URL(url);
				continuation.host = 'api.github.com';
				continuation.searchParams.set('page', '7');
				return url.searchParams.get('page') === '7'
					? jsonResponse({ tasks: [older] })
					: jsonResponse({ tasks: [] }, 200, { link: `<${continuation.href}>; rel="next"` });
			},
		});

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			kind: result.kind,
			tasks: result.kind === 'failed' ? [] : result.sessions.map(session => session.taskId),
			pages: requestedUrls.map(url => new URL(url))
				.filter(url => url.pathname === '/agents/tasks' && url.searchParams.get('with_repo') === 'false' && url.searchParams.get('is_archived') === 'false')
				.map(url => [url.origin, url.searchParams.get('page'), url.searchParams.get('sort'), url.searchParams.get('direction')]),
		}, {
			kind: 'complete',
			tasks: ['older'],
			pages: [
				['https://api.githubcopilot.com', '1', 'updated_at', 'desc'],
				['https://api.githubcopilot.com', '7', 'updated_at', 'desc'],
			],
		});
	});

	for (const [link, reason, requests] of [
		['<https://example.com/agents/tasks?cursor=opaque>; rel="next"', 'GitHub returned an invalid pagination link', 1],
		['</agents/tasks/opaque/events?cursor=opaque>; rel="next"', 'GitHub returned an invalid pagination link', 1],
		['<?cursor=opaque>; rel=next', 'GitHub returned an invalid pagination link', 1],
		['<?page=2>; rel="next"', 'GitHub pagination repeated a continuation', 2],
	] as const) {
		test(`fails the scan instead of following ${link}`, async () => {
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: () => jsonResponse({ tasks: [] }, 200, { link }),
			});

			assert.deepStrictEqual({
				result: await service.listSessions(CancellationToken.None),
				requests: requestedUrls.length,
			}, {
				result: { kind: 'failed', reason: `listTasks failed: ${reason}` },
				requests,
			});
		});
	}
});

suite('CloudSandboxApiService discovery logs', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('logs discovered sessions and exclusion reasons without prompts', async () => {
		const logService = new TestLogService();
		const bound = {
			...task('bound', 'Work on repository', 42, 'session-1', 'env-1'),
			updated_at: '2026-09-22T10:00:00Z',
			state: 'idle',
			sessions: [{ id: 'session-1', environment_id: 'env-1', state: 'waiting_for_user', created_at: '2026-01-01T00:00:00Z', ahp_resource_uri: 'ahp-session:/session-1' }],
			prompt: 'not-for-logs',
		};
		const { service } = createService(store, {
			tasks: [
				bound,
				{ ...task('archived', 'Old task', undefined, 'session-2', 'env-2'), archived_at: '2026-09-21T10:00:00Z' },
				{ ...task('different-agent', 'Other agent', undefined, 'session-3', 'env-3'), agent_collaborators: [{ slug: 'other' }] },
				{ ...task('other-compute', 'Other compute', undefined, 'session-5', 'env-5'), compute: { provider: 'codespaces' } },
				{ ...task('unbound', 'Not ready', undefined, 'session-4', 'env-4'), sessions: [] },
			],
			repositories: new Map([[42, { full_name: 'owner/repository' }]]),
			logService,
		});

		await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			sessions: logService.debugs.filter(message => message.includes('Discovered sandbox session ')),
			filtering: logService.debugs.filter(message => !message.includes('Discovered sandbox session ')),
			summary: logService.infos.filter(message => message.includes('Discovery filtering ')),
			info: logService.infos.filter(message => message.includes('Discovered sandbox session ')),
			exposedPrompt: [...logService.infos, ...logService.debugs].some(message => message.includes('not-for-logs')),
		}, {
			sessions: [`[CloudSandboxApi] Discovered sandbox session ${JSON.stringify({
				taskId: 'bound',
				name: 'Work on repository', repoName: 'owner/repository',
				updatedAt: bound.updated_at, status: SessionStatus.Idle,
			})}`, `[CloudSandboxApi] Discovered sandbox session ${JSON.stringify({
				taskId: 'different-agent', name: 'Other agent', status: SessionStatus.Idle,
			})}`, `[CloudSandboxApi] Discovered sandbox session ${JSON.stringify({
				taskId: 'unbound', name: 'Not ready', status: SessionStatus.Idle,
			})}`, `[CloudSandboxApi] Discovered sandbox session ${JSON.stringify({
				taskId: 'archived', name: 'Old task', status: SessionStatus.Idle,
			})}`],
			filtering: [
				'[CloudSandboxApi] Accepted task previously excluded by agent slug {"taskId":"different-agent"}',
				'[CloudSandboxApi] Excluded task {"taskId":"other-compute","reason":"notSandboxCompute"}',
			],
			summary: ['[CloudSandboxApi] Discovery filtering {"notSandboxCompute":1,"missingSessionBinding":0,"stalledQueuedSession":0,"detailFetchFailed":0,"acceptedWithOtherAgent":1}'],
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

	test('retains the account when a token refresh overtakes the initial lookup', async () => {
		const pending = new DeferredPromise<readonly AuthenticationSession[]>();
		const original = { id: 'session', accessToken: 'original-token', account: { id: 'owner', label: 'Owner' }, scopes: [] };
		let refreshed = false;
		const { service, requestedUrls, changeAuthentication } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => refreshed ? [{ ...original, accessToken: 'refreshed-token' }] : pending.p,
		});
		const account = service.getAccountKey();
		const changed = Event.toPromise(service.onDidChangeAccount);
		refreshed = true;
		changeAuthentication();
		await changed;
		await pending.complete([original]);

		assert.deepStrictEqual({ account: await account, requestedUrls }, {
			account: '["github","owner"]', requestedUrls: [],
		});
	});

	test('does not retarget an initial account lookup to a newly selected account', async () => {
		const pending = new DeferredPromise<readonly AuthenticationSession[]>();
		let changedAccount = false;
		const { service, requestedUrls, changeAuthentication } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => changedAccount
				? [{ id: 'new-session', accessToken: 'new-token', account: { id: 'new', label: 'New' }, scopes: [] }]
				: pending.p,
		});
		const account = assert.rejects(service.getAccountKey(), isCancellationError);
		changedAccount = true;
		changeAuthentication();
		await pending.complete([{ id: 'old-session', accessToken: 'old-token', account: { id: 'old', label: 'Old' }, scopes: [] }]);
		await account;

		assert.deepStrictEqual(requestedUrls, []);
	});

	test('requires a stable account verification instead of repeatedly resolving changing authentication', async () => {
		const initial = new DeferredPromise<readonly AuthenticationSession[]>();
		const verifying = new DeferredPromise<readonly AuthenticationSession[]>();
		const enteredVerification = new DeferredPromise<void>();
		const sessions = [{ id: 'session', accessToken: 'token', account: { id: 'owner', label: 'Owner' }, scopes: [] }];
		let lookups = 0;
		const { service, changeAuthentication } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => {
				switch (++lookups) {
					case 1: return initial.p;
					case 3:
						void enteredVerification.complete();
						return verifying.p;
					default: return sessions;
				}
			},
		});
		const account = assert.rejects(service.getAccountKey(), isCancellationError);
		const changed = Event.toPromise(service.onDidChangeAccount);
		changeAuthentication();
		await changed;
		await initial.complete(sessions);
		await enteredVerification.p;
		changeAuthentication();
		await verifying.complete(sessions);
		await account;

		assert.strictEqual(lookups, 4);
	});

	test('does not cancel another draft account lookup when task cleanup invalidates discovery', async () => {
		const pending = new DeferredPromise<readonly AuthenticationSession[]>();
		const sessions = [{ id: 'session', accessToken: 'token', account: { id: 'owner', label: 'Owner' }, scopes: [] }];
		let lookups = 0;
		const { service } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => ++lookups === 2 ? pending.p : sessions,
			onRequest: () => jsonResponse({}, 204),
		});
		const accountKey = await service.getAccountKey();
		assert.ok(accountKey);
		const duringCleanup = service.getAccountKey();

		await service.deleteTask('task-unused', CancellationToken.None, accountKey);
		await pending.complete(sessions);

		assert.strictEqual(await duringCleanup, accountKey);
	});

	test('still announces account changes when task cleanup invalidates discovery', async () => {
		const pending = new DeferredPromise<readonly AuthenticationSession[]>();
		const sessions = [{ id: 'session', accessToken: 'token', account: { id: 'owner', label: 'Owner' }, scopes: [] }];
		let lookups = 0;
		const changes: (string | undefined)[] = [];
		const { service, changeAuthentication } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => ++lookups === 2 ? pending.p : sessions,
			onRequest: () => jsonResponse({}, 204),
		});
		const accountKey = await service.getAccountKey();
		assert.ok(accountKey);
		store.add(service.onDidChangeAccount(value => changes.push(value)));
		changeAuthentication();

		await service.deleteTask('task-unused', CancellationToken.None, accountKey);
		await pending.complete(sessions);
		await timeout(0);

		assert.deepStrictEqual(changes, [accountKey]);
	});
});

suite('CloudSandboxApiService task catalog', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('lists the recent window of 1750 tasks without requesting execution details or recorded history', async () => {
		const tasks = Array.from({ length: 1750 }, (_, index) => task(`task-${index}`, `Conversation ${index}`, undefined, `session-${index}`, `environment-${index}`));
		const { service, requestedUrls } = createService(store, { tasks, repositories: new Map() });
		const result = await service.listSessions(CancellationToken.None);
		assert.deepStrictEqual({
			kind: result.kind,
			count: result.kind === 'failed' ? 0 : result.sessions.length,
			resolved: result.kind === 'failed' ? [] : result.sessions.filter(task => task.sessionId || task.environmentId),
			detailReads: requestedUrls.filter(url => /\/tasks\/[^/?]+(?:\/events)?$/.test(new URL(url).pathname)),
		}, { kind: 'complete', count: 300, resolved: [], detailReads: [] });
	});

	test('retains old untitled and queued summary rows without probing their history', async () => {
		const tasks = [
			{ ...task('empty', 'New Task', undefined, 'empty-session', 'environment'), event_type: 'unknown', state: 'idle', updated_at: '2020-01-01T00:00:00Z' },
			{ ...task('queued', 'New remote session', undefined, 'queued-session', 'environment'), state: 'queued', updated_at: '2020-01-01T00:00:00Z' },
		];
		const { service, requestedUrls } = createService(store, { tasks, repositories: new Map() });
		const result = await service.listSessions(CancellationToken.None);
		assert.deepStrictEqual({
			tasks: result.kind === 'failed' ? result.reason : result.sessions.map(task => task.taskId),
			extraReads: requestedUrls.filter(url => /\/tasks\//.test(new URL(url).pathname)),
		}, { tasks: ['empty', 'queued'], extraReads: [] });
	});

	test('shares one on-demand detail read and independently cancels a waiting consumer', async () => {
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<IRequestContext>();
		const current = task('task', 'Conversation', undefined, 'session', 'environment');
		const { service, requestedUrls } = createService(store, {
			tasks: [current], repositories: new Map(),
			onRequest: url => {
				if (url.pathname.endsWith('/tasks/task')) {
					void started.complete();
					return response.p;
				}
				return undefined;
			},
		});
		await service.listSessions(CancellationToken.None);
		const source = store.add(new CancellationTokenSource());
		const cancelled = service.resolveSession('task', source.token);
		const rejection = assert.rejects(cancelled, CancellationError);
		const remaining = service.resolveSession('task', CancellationToken.None);
		await started.p;
		source.cancel();
		await rejection;
		void response.complete(jsonResponse(current));
		const resolved = await remaining;
		const cached = await service.resolveSession('task', CancellationToken.None);
		assert.deepStrictEqual({
			resolved: [resolved.taskId, resolved.sessionId, resolved.environmentId],
			cached: [cached.taskId, cached.sessionId, cached.environmentId],
			detailReads: requestedUrls.filter(url => new URL(url).pathname.endsWith('/tasks/task')).length,
		}, { resolved: ['task', 'session', 'environment'], cached: ['task', 'session', 'environment'], detailReads: 1 });
	});

	for (const change of ['credential event', 'scope detected while listing'] as const) {
		test(`cancels old on-demand task resolution after ${change}`, async () => {
			const started = new DeferredPromise<void>();
			const response = new DeferredPromise<IRequestContext>();
			const current = task('task', 'Conversation', undefined, 'session', 'environment');
			let hold = true;
			let scopes = ['repo', 'workflow'];
			const { service, requestedUrls, changeAuthentication } = createService(store, {
				tasks: [current], repositories: new Map(),
				authenticationSessions: async () => [{ id: 'auth', accessToken: 'token', account: { id: 'a', label: 'Account' }, scopes }],
				onRequest: url => {
					if (hold && url.pathname.endsWith('/tasks/task')) {
						void started.complete();
						return response.p;
					}
					return undefined;
				},
			});
			await service.listSessions(CancellationToken.None);
			const resolving = service.resolveSession('task', CancellationToken.None);
			const rejected = assert.rejects(resolving, CancellationError);
			await started.p;
			if (change === 'credential event') {
				const changed = Event.toPromise(service.onDidChangeAccount);
				changeAuthentication();
				await changed;
			} else {
				scopes = ['repo'];
				await service.listSessions(CancellationToken.None, { incremental: true });
			}
			await rejected;
			hold = false;
			await response.complete(jsonResponse(current));
			const resolved = await service.resolveSession('task', CancellationToken.None);
			assert.deepStrictEqual({
				resolved: [resolved.taskId, resolved.sessionId, resolved.environmentId],
				detailReads: requestedUrls.filter(url => new URL(url).pathname.endsWith('/tasks/task')).length,
			}, { resolved: ['task', 'session', 'environment'], detailReads: 2 });
		});
	}
});

suite('CloudSandboxApiService discovery without recorded history', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const startTime = Date.UTC(2026, 9, 18, 19);
	const oneHour = 60 * 60_000;

	function placeholderTask(id: string) {
		return {
			...task(id, 'New task', undefined, `session-${id}`, 'shared-environment'),
			event_type: 'unknown',
			state: 'idle',
			updated_at: new Date(startTime - 2 * oneHour).toISOString(),
			sessions: [{ id: `session-${id}`, environment_id: 'shared-environment', state: 'idle', created_at: '2026-01-01T00:00:00Z', ahp_resource_uri: `ahp-session:/session-${id}` }],
		};
	}

	for (const includeArchived of [false, true]) {
		test(`lists old idle placeholders without fetching history across renewals and task hints (includeArchived=${includeArchived})`, () => runWithFakedTimers({ useFakeTimers: true, startTime }, async () => {
			const tasks = [
				placeholderTask('idle'),
				{ ...placeholderTask('legacy'), name: 'New Task', repository: { id: 42 } },
				{ ...placeholderTask('archived'), archived_at: new Date(startTime - oneHour).toISOString() },
			];
			const { service, requestedUrls } = createService(store, {
				tasks, repositories: new Map([[42, { full_name: 'owner/repo' }]]),
				onRequest: url => url.pathname.endsWith('/events') ? jsonResponse({}, 503) : undefined,
			});
			const initial = await service.listSessions(CancellationToken.None, { includeArchived, trigger: 'startup' });
			const renewed = [];
			for (let pass = 0; pass < 3; pass++) {
				await timeout(5 * 60_000);
				const result = await service.listSessions(CancellationToken.None, { includeArchived, incremental: true, trigger: 'feedRenewal' });
				renewed.push(result.kind);
			}
			const targeted = await service.listSessions(CancellationToken.None, { taskIds: ['idle'], trigger: 'feedChange' });
			assert.deepStrictEqual({
				initial: initial.kind === 'failed' ? initial : { kind: initial.kind, tasks: initial.sessions.map(session => session.taskId).sort() },
				renewed,
				targeted: targeted.kind === 'failed' ? targeted : targeted.sessions.map(session => session.taskId),
				unexpectedRequests: requestedUrls.filter(url => !['/agents/tasks', '/agents/tasks/batch', '/repositories/42'].includes(new URL(url).pathname)),
				queries: requestedUrls.filter(url => new URL(url).pathname === '/agents/tasks').map(url => {
					const query = new URL(url).searchParams;
					return [query.get('with_repo'), query.get('is_archived'), query.get('since'), query.get('include_environment_kinds')];
				}),
			}, {
				initial: { kind: includeArchived ? 'complete' : 'scoped', tasks: includeArchived ? ['archived', 'idle', 'legacy'] : ['idle', 'legacy'] },
				renewed: Array(3).fill('incremental'),
				targeted: ['idle'],
				unexpectedRequests: [],
				queries: [undefined, startTime, startTime + 5 * 60_000, startTime + 10 * 60_000].flatMap(time =>
					[false, ...(includeArchived ? [true] : [])].flatMap(archived =>
						['true', 'false'].map(withRepo => [withRepo, String(archived), time === undefined ? null : new Date(time - 60_000).toISOString(), time === undefined ? null : 'managed-sandbox']))),
			});
		}));
	}

	test('explicit conversation history still loads and replays after listing an old placeholder', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [placeholderTask('idle')], repositories: new Map(),
			onRequest: url => url.pathname.endsWith('/events') ? jsonResponse({
				events: [{
					ns: 'ahp', session_id: 'session-idle', seq: 0, at: new Date(startTime).toISOString(),
					payload: { kind: 'message', data: { channel: 'ahp-session:/session-idle', serverSeq: 0, action: { type: ActionType.SessionTitleChanged, title: 'Recorded conversation' } } },
				}],
				total: 1,
			}) : undefined,
		});
		await service.listSessions(CancellationToken.None);
		const beforeOpen = requestedUrls.filter(url => url.endsWith('/events')).length;
		const history = await service.getSessionHistory('idle', CancellationToken.None);
		assert.deepStrictEqual({
			beforeOpen,
			historyRequests: requestedUrls.filter(url => url.endsWith('/events')).map(url => new URL(url).pathname),
			sessions: history?.sessions.map(session => [session.session, session.state.title]),
		}, { beforeOpen: 0, historyRequests: ['/agents/tasks/idle/events'], sessions: [['ahp-session:/session-idle', 'Recorded conversation']] });
	});

	test('live history invalidation cannot invalidate or restart an unrelated inventory pass', async () => {
		const pending = new DeferredPromise<IRequestContext>();
		const entered = new DeferredPromise<void>();
		const { service, requestedUrls } = createService(store, {
			tasks: [placeholderTask('idle')], repositories: new Map(),
			onRequest: url => {
				if (url.pathname === '/agents/tasks' && !entered.isSettled) {
					void entered.complete();
					return pending.p;
				}
				return undefined;
			},
		});
		const discovery = service.listSessions(CancellationToken.None);
		await entered.p;
		service.invalidateSessionHistory('idle');
		service.invalidateSessionHistory('other');
		await pending.complete(jsonResponse({ tasks: [] }));
		const result = await discovery;
		await service.listSessions(CancellationToken.None, { incremental: true });
		assert.deepStrictEqual({
			kind: result.kind,
			fullRequests: requestedUrls.filter(url => new URL(url).pathname === '/agents/tasks' && !new URL(url).searchParams.has('since')).length,
			historyRequests: requestedUrls.filter(url => url.endsWith('/events')).length,
		}, { kind: 'complete', fullRequests: 4, historyRequests: 0 });
	});

});

suite('CloudSandboxApiService task catalog resolution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves a cold session without a preceding inventory scan', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [task('task', 'Conversation', undefined, 'session', 'environment')], repositories: new Map(),
		});
		const resolved = await service.resolveSession('task', CancellationToken.None);
		assert.deepStrictEqual({
			binding: [resolved.taskId, resolved.sessionId, resolved.environmentId],
			paths: requestedUrls.map(url => new URL(url).pathname),
		}, { binding: ['task', 'session', 'environment'], paths: ['/agents/tasks/task'] });
	});

	for (const ending of ['cancellation', 'disposal'] as const) {
		test(`${ending} stops cold session authorization without dispatching a task read`, async () => {
			const started = new DeferredPromise<void>();
			const authorization = new DeferredPromise<readonly AuthenticationSession[]>();
			const source = store.add(new CancellationTokenSource());
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(),
				authenticationSessions: () => {
					void started.complete();
					return authorization.p;
				},
			});
			const resolving = service.resolveSession('task', source.token);
			const rejected = assert.rejects(resolving, isCancellationError);
			await started.p;
			if (ending === 'cancellation') {
				source.cancel();
			} else {
				service.dispose();
			}
			await rejected;
			await authorization.complete([{ id: 'auth', accessToken: 'token', account: { id: 'a', label: 'Account' }, scopes: [] }]);
			await timeout(0);
			assert.deepStrictEqual(requestedUrls, []);
		});
	}

	test('reports queued state from listing metadata without execution reads', async () => {
		const queued = { ...task('queued', 'New remote session', undefined, 'session', 'environment'), state: 'queued' };
		const tasks = [queued];
		const { service, requestedUrls } = createService(store, { tasks, repositories: new Map() });
		const first = await service.listSessions(CancellationToken.None);
		tasks[0] = { ...queued, state: 'in_progress' };
		const second = await service.listSessions(CancellationToken.None);
		assert.deepStrictEqual({
			queued: [first, second].map(result => result.kind === 'failed' ? result.reason : result.sessions[0].isQueued),
			details: requestedUrls.filter(url => new URL(url).pathname.startsWith('/agents/tasks/')),
		}, { queued: [true, undefined], details: [] });
	});

	test('resolves execution details only when opening a batch-discovered task', async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [task('task', 'Conversation', undefined, 'session', 'environment')], repositories: new Map(),
		});
		await service.listSessions(CancellationToken.None, { taskIds: ['task'] });
		const beforeOpen = requestedUrls.filter(url => new URL(url).pathname.endsWith('/tasks/task')).length;
		const resolved = await service.resolveSession('task', CancellationToken.None);
		await service.resolveSession('task', CancellationToken.None);
		assert.deepStrictEqual({
			beforeOpen,
			binding: [resolved.sessionId, resolved.environmentId],
			detailReads: requestedUrls.filter(url => new URL(url).pathname.endsWith('/tasks/task')).length,
		}, { beforeOpen: 0, binding: ['session', 'environment'], detailReads: 1 });
	});

	test('uses the shared queue for concurrent on-demand execution reads', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const tasks = Array.from({ length: 30 }, (_, index) => task(`task-${index}`, 'Conversation', undefined, `session-${index}`, `environment-${index}`));
		const { service, concurrency } = createService(store, { tasks, repositories: new Map(), taskFetchDelayMs: 10 });
		await service.listSessions(CancellationToken.None);
		const resolved = await Promise.all(tasks.map(task => service.resolveSession(task.id, CancellationToken.None)));
		assert.deepStrictEqual({ resolved: resolved.length, peak: concurrency.max, active: concurrency.current }, { resolved: 30, peak: 8, active: 0 });
	}));
});

suite('CloudSandboxApiService incremental discovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const firstScanDate = 'Tue, 22 Sep 2026 10:00:00 GMT';
	const checkpoint = '2026-09-22T09:59:00.000Z';

	function updatedTask(id: string, updatedAt = '2026-09-22T09:58:00Z', repositoryId?: number): ITestTask {
		return { ...task(id, id, repositoryId, `session-${id}`, `env-${id}`), updated_at: updatedAt };
	}

	test('empty undated inventory establishes a conservative checkpoint without trusting the client clock', async () => {
		const tasks: ITestTask[] = [];
		const { service, requestedUrls } = createService(store, {
			tasks, repositories: new Map(), discoveryDate: () => '',
		});
		await service.listSessions(CancellationToken.None, { includeArchived: false });
		await service.listSessions(CancellationToken.None, { incremental: true, includeArchived: false });
		tasks.push(updatedTask('new'));
		const result = await service.listSessions(CancellationToken.None, { incremental: true, includeArchived: false });
		assert.deepStrictEqual({
			queries: requestedUrls.filter(url => new URL(url).pathname === '/agents/tasks').map(url => new URL(url).searchParams.get('since')),
			found: result.kind === 'failed' ? result : result.sessions.map(session => session.taskId),
		}, { queries: [null, null, ...Array(4).fill('1970-01-01T00:00:00.000Z')], found: ['new'] });
	});

	test('execution-detail failures do not block summaries or advance task-binding retries', async () => {
		let date = firstScanDate;
		let fail = true;
		const { service, requestedUrls } = createService(store, {
			tasks: [updatedTask('unresolved')], repositories: new Map(), discoveryDate: () => date,
			onRequest: url => fail && url.pathname.endsWith('/tasks/unresolved') ? jsonResponse({}, 503) : undefined,
		});
		const results = [];
		for (let pass = 0; pass < 3; pass++) {
			results.push(await service.listSessions(CancellationToken.None, { incremental: pass > 0, includeArchived: false }));
			date = 'Tue, 22 Sep 2026 10:05:00 GMT';
		}
		fail = false;
		const recovered = await service.listSessions(CancellationToken.None, { incremental: true, includeArchived: false });
		assert.deepStrictEqual({
			results: results.map(result => result.kind === 'failed' ? result : {
				kind: result.kind, tasks: result.sessions.map(task => task.taskId), removed: result.removedTaskIds ?? [],
			}),
			recovered: recovered.kind === 'failed' ? recovered : recovered.sessions.map(session => session.taskId),
			queries: requestedUrls.filter(url => new URL(url).pathname === '/agents/tasks').map(url => new URL(url).searchParams.get('since')),
			details: requestedUrls.filter(url => url.endsWith('/tasks/unresolved')).length,
		}, {
			results: [
				{ kind: 'scoped', tasks: ['unresolved'], removed: [] },
				...Array(2).fill({ kind: 'incremental', tasks: [], removed: [] }),
			],
			recovered: [],
			queries: [null, null, checkpoint, checkpoint, ...Array(4).fill('2026-09-22T10:04:00.000Z')],
			details: 0,
		});
	});

	test('failed list partitions do not advance progress or turn partial inventory into authority', async () => {
		let fail = true;
		const { service, requestedUrls } = createService(store, {
			tasks: [updatedTask('listed', undefined, 42)], repositories: new Map(), discoveryDate: () => firstScanDate,
			onRequest: url => fail && url.pathname === '/agents/tasks' && url.searchParams.get('with_repo') === 'false' ? jsonResponse({}, 503) : undefined,
		});
		const first = await service.listSessions(CancellationToken.None, { includeArchived: false });
		const second = await service.listSessions(CancellationToken.None, { incremental: true, includeArchived: false });
		fail = false;
		const third = await service.listSessions(CancellationToken.None, { incremental: true, includeArchived: false });
		await service.listSessions(CancellationToken.None, { incremental: true, includeArchived: false });
		assert.deepStrictEqual({
			progress: [first.kind, second.kind],
			recovered: third.kind,
			queries: requestedUrls.filter(url => new URL(url).pathname === '/agents/tasks').map(url => new URL(url).searchParams.get('since')),
		}, { progress: ['failed', 'failed'], recovered: 'scoped', queries: [...Array(8).fill(null), checkpoint, checkpoint] });
	});

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
				per_page: '100', page: '1', sort: 'updated_at', direction: 'desc', include_counts: 'false',
				with_repo: String(withRepository), is_archived: String(archived), since: checkpoint, include_environment_kinds: 'managed-sandbox',
			}))),
		});
	});

	test('updates changed and new summaries in the overlap without fetching details', async () => {
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
			details: [],
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

	test('follows incremental filters supplied in pagination links', async () => {
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
			archivedRequests: 4,
			unarchived: [['first', undefined]],
			detailFetches: 0,
		});
	});

	test('keeps task rows independently of whether their execution has a binding', async () => {
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
			removed: removed.kind === 'failed' ? removed.kind : removed.sessions.map(task => task.taskId),
			stillUnbound: stillUnbound.kind === 'failed' ? stillUnbound.kind : stillUnbound.sessions.map(task => task.taskId),
			rebound: rebound.kind === 'failed' ? [] : rebound.sessions.map(session => session.taskId),
		}, {
			removed: ['first'],
			stillUnbound: ['first'],
			rebound: ['first'],
		});
	});

	test('execution-detail failures do not remove summary rows or schedule binding retries', async () => {
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

		assert.deepStrictEqual({
			failed: failed.kind === 'failed' ? failed.kind : failed.sessions.map(task => task.taskId),
			retried,
		}, {
			failed: ['first'],
			retried: { kind: 'incremental', sessions: [], removedTaskIds: [] },
		});
	});

	test('advances the summary checkpoint without requiring execution details', async () => {
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
		}, { firstKind: 'incremental', recovered: [], since: '2026-09-22T10:04:00.000Z' });
	});

	test('advances the checkpoint after refreshing the recent incremental window', async () => {
		const tasks: ITestTask[] = [];
		let date = firstScanDate;
		const { service, requestedUrls } = createService(store, {
			tasks, repositories: new Map(), discoveryDate: () => date,
		});
		await service.listSessions(CancellationToken.None);
		tasks.push(...Array.from({ length: 301 }, (_, i) => updatedTask(`new-${i}`, checkpoint)));
		date = 'Tue, 22 Sep 2026 10:05:00 GMT';
		const bounded = await service.listSessions(CancellationToken.None, { incremental: true });
		requestedUrls.length = 0;
		const recovered = await service.listSessions(CancellationToken.None, { incremental: true });

		assert.deepStrictEqual({
			firstKind: bounded.kind,
			firstCount: bounded.kind === 'failed' ? 0 : bounded.sessions.length,
			recovered: recovered.kind === 'failed' ? 0 : recovered.sessions.length,
			since: new URL(requestedUrls[0]).searchParams.get('since'),
			details: requestedUrls.filter(url => new URL(url).pathname.startsWith('/agents/tasks/')).length,
		}, { firstKind: 'incremental', firstCount: 300, recovered: 0, since: '2026-09-22T10:04:00.000Z', details: 0 });
	});

	for (const removal of ['deleted', 'outside the window']) {
		test(`evicts cached tasks ${removal} after a successful capped full refresh and enables incremental reads`, async () => {
			const cached = updatedTask('cached');
			const tasks = [cached];
			let date = firstScanDate;
			const { service, requestedUrls } = createService(store, {
				tasks, repositories: new Map(), discoveryDate: () => date,
			});
			await service.listSessions(CancellationToken.None);
			if (removal === 'deleted') {
				tasks.length = 0;
			}
			tasks.unshift(...Array.from({ length: 301 }, (_, i) => ({
				...updatedTask(`new-${i}`, checkpoint), compute: { provider: 'codespaces' },
			})));
			date = 'Tue, 22 Sep 2026 10:05:00 GMT';
			const bounded = await service.listSessions(CancellationToken.None);
			requestedUrls.length = 0;
			await service.listSessions(CancellationToken.None, { incremental: true });
			const since = new URL(requestedUrls[0]).searchParams.get('since');
			tasks.splice(0, 301);
			if (removal === 'deleted') {
				tasks.push(cached);
			}
			requestedUrls.length = 0;
			const returned = await service.listSessions(CancellationToken.None);

			assert.deepStrictEqual({
				bounded,
				since,
				returned: returned.kind === 'failed' ? returned : returned.sessions.map(session => session.taskId),
				details: requestedUrls.filter(url => url.endsWith('/tasks/cached')).length,
			}, {
				bounded: { kind: 'complete', sessions: [] },
				since: '2026-09-22T10:04:00.000Z', returned: ['cached'], details: 0,
			});
		});
	}

	test('retries unresolved repository names without retrying execution bindings outside the incremental window', async () => {
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
			sessions: [['repository', 'owner/repository']],
			details: [],
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
			details: [], broad: true,
		});
	});

	test('cancellation does not publish a checkpoint or cache partly resolved tasks', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		let cancel = true;
		const { service, requestedUrls } = createService(store, {
			tasks: [updatedTask('old')], repositories: new Map(), discoveryDate: () => firstScanDate,
			onRequest: url => {
				if (cancel && url.pathname.endsWith('/tasks')) {
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
		}, { kind: 'complete', since: null, detailFetches: 0 });
	});

	for (const changedScope of [false, true]) {
		test(`inventory authentication wait preserves only compatible concurrent task updates (changedScope=${changedScope})`, async () => {
			const tasks: ITestTask[] = [];
			let authentication: AuthenticationSession = { id: 'session', accessToken: 'token', account: { id: 'a', label: 'Account' }, scopes: ['repo', 'workflow'] };
			const originalAuthentication = authentication;
			const pending = new DeferredPromise<readonly AuthenticationSession[]>();
			const entered = new DeferredPromise<void>();
			let holdAuthentication = false;
			const { service, requestedUrls, changeAuthentication } = createService(store, {
				tasks, repositories: new Map(), discoveryDate: () => firstScanDate,
				authenticationSessions: async () => {
					if (holdAuthentication) {
						holdAuthentication = false;
						void entered.complete();
						return pending.p;
					}
					return [authentication];
				},
			});
			await service.listSessions(CancellationToken.None);
			holdAuthentication = true;
			const inventory = service.listSessions(CancellationToken.None, { incremental: true });
			await entered.p;
			tasks.push(updatedTask('old-authorization', checkpoint));
			const targeted = await service.listSessions(CancellationToken.None, { taskIds: ['old-authorization'] });
			tasks.length = 0;
			if (changedScope) {
				authentication = { ...authentication, scopes: ['repo'] };
			}
			const changed = Event.toPromise(service.onDidChangeAccount);
			changeAuthentication();
			await changed;
			requestedUrls.length = 0;
			await pending.complete([originalAuthentication]);
			const result = await inventory;
			assert.deepStrictEqual({
				targeted: targeted.kind === 'failed' ? [] : targeted.sessions.map(session => session.taskId),
				kind: result.kind,
				tasks: result.kind === 'failed' ? [] : result.sessions.map(session => session.taskId),
				since: requestedUrls.map(url => new URL(url).searchParams.get('since')),
			}, {
				targeted: ['old-authorization'],
				kind: changedScope ? 'complete' : 'incremental',
				tasks: changedScope ? [] : ['old-authorization'],
				since: Array(4).fill(changedScope ? null : checkpoint),
			});
		});
	}

	for (const change of ['token', 'scope', 'account', 'profile', 'provider registration', 'provider removal', 'sign out', 'lookup failure'] as const) {
		test(`discovery authorization compatibility after ${change} controls actual since and cached-detail reuse`, async () => {
			let authentication: AuthenticationSession = { id: 'session', accessToken: 'old-token', account: { id: 'a', label: 'Account' }, scopes: ['repo', 'read:user'] };
			let signedIn = true;
			let lookupFailed = false;
			const { service, requestedUrls, changeAuthentication, changeProfile } = createService(store, {
				tasks: [updatedTask('old', checkpoint, 42)], repositories: new Map([[42, { full_name: 'owner/repo' }]]),
				discoveryDate: () => firstScanDate,
				authenticationSessions: async () => {
					if (lookupFailed) {
						throw new Error('Authentication unavailable');
					}
					return signedIn ? [authentication] : [];
				},
			});
			await service.listSessions(CancellationToken.None);
			authentication = {
				...authentication, accessToken: 'rotated-token',
				scopes: change === 'scope' ? ['repo', 'read:user', 'workflow'] : [...authentication.scopes].reverse(),
				account: change === 'account' ? { id: 'other', label: 'Other' } : authentication.account,
			};
			signedIn = change !== 'sign out';
			lookupFailed = change === 'lookup failure';
			const changed = lookupFailed ? undefined : Event.toPromise(service.onDidChangeAccount);
			if (change === 'profile') {
				changeProfile('other-profile');
			} else {
				changeAuthentication(change === 'provider registration' ? 'register' : change === 'provider removal' ? 'unregister' : 'sessions');
			}
			if (lookupFailed) {
				await assert.rejects(service.getAccountKey(), /requires a signed-in GitHub account/);
			} else {
				await changed;
			}
			signedIn = true;
			lookupFailed = false;
			requestedUrls.length = 0;
			const result = await service.listSessions(CancellationToken.None, { incremental: true });
			assert.deepStrictEqual({
				kind: result.kind,
				since: requestedUrls.filter(url => new URL(url).pathname === '/agents/tasks').map(url => new URL(url).searchParams.get('since')),
				details: requestedUrls.filter(url => new URL(url).pathname === '/agents/tasks/old').length,
				repositories: requestedUrls.filter(url => new URL(url).pathname === '/repositories/42').length,
			}, {
				kind: change === 'token' ? 'incremental' : 'complete',
				since: Array(4).fill(change === 'token' ? checkpoint : null),
				details: 0,
				repositories: change === 'token' ? 0 : 1,
			});
		});
	}

	for (const change of ['token', 'scope', 'account'] as const) {
		test(`${change} changes invalidate in-flight reads without discarding compatible checkpoints`, async () => {
			const tasks = [updatedTask('old')];
			const response = new DeferredPromise<IRequestContext>();
			const entered = new DeferredPromise<void>();
			let paused = false;
			let authentication: AuthenticationSession = { id: 'session', accessToken: 'token', account: { id: 'a', label: 'Account' }, scopes: [] };
			const { service, requestedUrls, changeAuthentication } = createService(store, {
				tasks, repositories: new Map(), discoveryDate: () => firstScanDate,
				authenticationSessions: async () => [authentication],
				onRequest: url => {
					if (paused && url.pathname.endsWith('/tasks')) {
						paused = false;
						void entered.complete();
						return response.p;
					}
					return undefined;
				},
			});
			await service.listSessions(CancellationToken.None);
			tasks.push(updatedTask('new', checkpoint));
			paused = true;
			const inFlight = service.listSessions(CancellationToken.None, { incremental: true });
			const settled = inFlight.then(result => result.kind, error => {
				assert.ok(isCancellationError(error));
				return 'cancelled';
			});
			await entered.p;
			authentication = {
				...authentication, accessToken: 'rotated',
				scopes: change === 'scope' ? ['repo'] : [],
				account: change === 'account' ? { id: 'other', label: 'Other' } : authentication.account,
			};
			const changed = Event.toPromise(service.onDidChangeAccount);
			changeAuthentication();
			await changed;
			await response.complete(jsonResponse({ tasks }));
			const staleKind = await settled;
			paused = false;
			requestedUrls.length = 0;
			const refreshed = await service.listSessions(CancellationToken.None, { incremental: true });

			assert.deepStrictEqual({
				staleKind,
				refreshedKind: refreshed.kind,
				since: new URL(requestedUrls[0]).searchParams.get('since'),
				details: requestedUrls.filter(url => new URL(url).pathname.startsWith('/agents/tasks/')).length,
			}, {
				staleKind: change === 'token' ? 'failed' : 'cancelled', refreshedKind: change === 'token' ? 'incremental' : 'complete',
				since: change === 'token' ? checkpoint : null, details: 0,
			});
		});
	}
});

suite('CloudSandboxApiService discovery rate limiting', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not fan out execution requests while listing summaries', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
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
			peakConcurrency: 0,
		});
	}));

	test('a later resolution attempt honors the shared cooldown without dropping the listed task', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [
				task('task-1', 'kept', undefined, 'sess-1', 'env-1'),
				task('task-2', 'also kept', undefined, 'sess-2', 'env-2'),
			],
			repositories: new Map(),
			rateLimitedTaskFetches: new Map([['task-1', 1]]),
			retryAfterSeconds: 1,
		});

		const result = await service.listSessions(CancellationToken.None);
		await assert.rejects(service.resolveSession('task-1', CancellationToken.None), { statusCode: 429 });
		const afterRefusal = requestedUrls.filter(url => url.endsWith('/tasks/task-1')).length;
		const resolved = await Promise.all(['task-1', 'task-2'].map(taskId => service.resolveSession(taskId, CancellationToken.None)));
		assert.deepStrictEqual({
			kind: result.kind,
			sessions: resolved.map(s => s.sessionId).sort(),
			afterRefusal,
		}, {
			kind: 'complete',
			sessions: ['sess-1', 'sess-2'],
			afterRefusal: 1,
		});
	}));

	test('a later inventory pass recovers after the shared rate limit without an inline retry loop', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [task('task-1', 'kept', undefined, 'sess-1', 'env-1')],
			repositories: new Map(),
			rateLimitedListPages: 1,
		});

		const refused = await service.listSessions(CancellationToken.None);
		const afterRefusal = requestedUrls.length;
		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			kind: result.kind,
			sessions: result.kind === 'failed' ? [] : result.sessions.map(s => s.taskId),
			refused: refused.kind,
			afterRefusal,
		}, {
			kind: 'complete',
			sessions: ['task-1'],
			refused: 'failed',
			afterRefusal: 1,
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

		await assert.rejects(service.resolveSession('task-1', CancellationToken.None), CloudSandboxRequestError);
		assert.deepStrictEqual({
			kind: result.kind,
			sessions: result.kind === 'failed' ? [] : result.sessions.map(s => s.taskId),
			// One attempt only: a 60s wait exceeds the budget, so it is not retried early.
			taskOneAttempts: requestedUrls.filter(u => u.endsWith('/tasks/task-1')).length,
		}, {
			kind: 'complete',
			sessions: ['task-1', 'task-2'],
			taskOneAttempts: 1,
		});
	}));

	test('a persistently rate-limited task is not retried inline or removed from inventory', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const { service, requestedUrls } = createService(store, {
			tasks: [
				task('task-1', 'lost', undefined, 'sess-1', 'env-1'),
				task('task-2', 'kept', undefined, 'sess-2', 'env-2'),
			],
			repositories: new Map(),
			rateLimitedTaskFetches: new Map([['task-1', Number.MAX_SAFE_INTEGER]]),
		});

		const result = await service.listSessions(CancellationToken.None);

		await assert.rejects(service.resolveSession('task-1', CancellationToken.None), CloudSandboxRequestError);
		assert.deepStrictEqual({
			kind: result.kind,
			sessions: result.kind === 'failed' ? [] : result.sessions.map(s => s.taskId),
			taskOneAttempts: requestedUrls.filter(u => u.endsWith('/tasks/task-1')).length,
		}, {
			kind: 'complete',
			sessions: ['task-1', 'task-2'],
			taskOneAttempts: 1,
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
	const { service } = createService(store, {
		tasks: [], repositories: new Map(),
		onRequest: (url, _token, opts) => {
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
			const taskPath = /^\/agents\/tasks\/(?<id>[^/]+)(?:\/(?:archive|unarchive))?$/.exec(url.pathname);
			const data = taskPath?.groups && isObject(response) && statusCode >= 200 && statusCode < 300
				? { id: decodeURIComponent(taskPath.groups.id), ...response } : response;
			return jsonTaskResponse(data, statusCode, options?.responseHeaders);
		},
		logService: new class extends NullLogService {
			override error(message: string | Error): void {
				errors.push(String(message));
			}
			override warn(message: string): void {
				warnings.push(String(message));
			}
		}(),
	});
	return { service, calls, errors, warnings };
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
					return jsonResponse(tasks[0]);
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
			{ path: '/agents/tasks/task%2Fwith%20spaces/archive', method: 'POST', body: undefined, timeout: undefined, integration: COPILOT_INTEGRATION_ID },
			{ path: '/agents/tasks/task%2Fwith%20spaces/unarchive', method: 'POST', body: undefined, timeout: undefined, integration: COPILOT_INTEGRATION_ID },
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
					return jsonResponse(tasks[0]);
				}
				if (paused && url.pathname.endsWith('/tasks')) {
					paused = false;
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
		await pending.complete(jsonResponse({ tasks }));
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
			timeout: undefined,
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
		await assert.rejects(service.renameTask('task-1', 'New title', CancellationToken.None), MutationUncertainError);
	});

	test('refreshes a renamed task even when the incremental list omits it', async () => {
		const original = { ...task('task-1', 'Old title', undefined, 'sess-1', 'env-1'), updated_at: '2026-08-01T00:00:00Z' };
		let renamed = false;
		const { service } = createService(store, {
			tasks: [original], repositories: new Map(),
			onRequest: (url, _token, options) => {
				if (options.type === 'PATCH') {
					renamed = true;
					original.name = 'New title';
					return jsonResponse(original);
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
		let paused = true;
		const original = task('task-1', 'Old title', undefined, 'sess-1', 'env-1');
		const { service } = createService(store, {
			tasks: [original], repositories: new Map(),
			onRequest: (url, _token, options) => {
				if (options.type === 'PATCH') {
					return jsonResponse(original);
				}
				if (paused && url.pathname.endsWith('/tasks')) {
					paused = false;
					void entered.complete();
					return response.p;
				}
				return undefined;
			},
		});
		const discovery = service.listSessions(CancellationToken.None);
		await entered.p;
		await service.renameTask('task-1', 'New title', CancellationToken.None);
		await response.complete(jsonResponse({ tasks: [original] }));
		assert.strictEqual((await discovery).kind, 'failed');
	});
});

suite('CloudSandboxApiService task deletion', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const statusCode of [204, 404]) {
		test(`deletes the encoded task through Mission Control: HTTP ${statusCode}`, async () => {
			const { service, calls } = createServiceForCreate(store, undefined, 200, { deleteStatusCode: statusCode });
			await service.deleteTask('task/with spaces', CancellationToken.None);
			assert.deepStrictEqual(calls, [{
				url: 'https://api.githubcopilot.com/agents/tasks/task%2Fwith%20spaces',
				type: 'DELETE',
				body: undefined,
				timeout: undefined,
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
		await assert.rejects(service.deleteTask('task-1', CancellationToken.None), MutationUncertainError);
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
		let paused = true;
		const { service } = createService(store, {
			tasks: [task('task-1', 'Sandbox', undefined, 'sess-1', 'env-1')],
			repositories: new Map(),
			onRequest: (url, _token, options) => {
				if (options.type === 'DELETE') {
					return jsonResponse({}, 204);
				}
				if (paused && url.pathname.endsWith('/tasks')) {
					paused = false;
					void entered.complete();
					return response.p;
				}
				return undefined;
			},
		});
		const discovery = service.listSessions(CancellationToken.None);
		await entered.p;
		await service.deleteTask('task-1', CancellationToken.None);
		await response.complete(jsonResponse({ tasks: [task('task-1', 'Sandbox', undefined, 'sess-1', 'env-1')] }));
		assert.strictEqual((await discovery).kind, 'failed');
	});
});

suite('CloudSandboxApiService task ownership', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const operation of [
		{
			name: 'task binding',
			run: (service: CloudSandboxApiService, accountKey: string) => service.createSession({ environmentId: 'env-owned', expectedAccountKey: accountKey, prompt: 'hello' }, CancellationToken.None),
			response: { id: 'task-1', sessions: [{ id: 'sess-1', environment_id: 'env-owned' }] },
			statusCode: 201,
			method: 'POST',
			body: { environment_id: 'env-owned', prompt: 'hello' },
		},
		{
			name: 'task reservation',
			run: (service: CloudSandboxApiService, accountKey: string) => service.reserveSession({ repoNwo: 'owner/repo', expectedAccountKey: accountKey }, CancellationToken.None),
			response: { id: 'task-1', reserved: true, reservation_expires_at: '2030-01-01T00:10:00Z', sessions: [{ id: 'sess-1', environment_id: 'env-owned' }] },
			statusCode: 201,
			method: 'POST',
			body: { environment_id: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID, prompt: '', repositories: [{ owner: 'owner', name: 'repo' }], reserve: true },
		},
		{
			name: 'task deletion',
			run: (service: CloudSandboxApiService, accountKey: string) => service.deleteTask('task-owned', CancellationToken.None, accountKey),
			response: {},
			statusCode: 204,
			method: 'DELETE',
			body: undefined,
		},
		{
			name: 'environment deletion',
			run: (service: CloudSandboxApiService, accountKey: string) => service.deleteEnvironment('env-owned', CancellationToken.None, accountKey),
			response: {},
			statusCode: 204,
			method: 'DELETE',
			body: undefined,
		},
	]) {
		test(`blocks ${operation.name} when a different account is selected`, async () => {
			let accountId = 'owner';
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(),
				authenticationSessions: async () => [{ accessToken: 'token', id: 's', account: { id: accountId, label: accountId }, scopes: [] }],
			});
			const accountKey = await service.getAccountKey();
			assert.ok(accountKey);
			accountId = 'other';

			await assert.rejects(operation.run(service, accountKey), isCancellationError);
			assert.deepStrictEqual(requestedUrls, []);
		});

		test(`${operation.name} checks the account of the credential actually used, allowing token refresh`, async () => {
			let authenticationRequests = 0;
			const requests: IRequestOptions[] = [];
			const { service } = createService(store, {
				tasks: [], repositories: new Map(),
				authenticationSessions: async () => {
					authenticationRequests++;
					const accountId = authenticationRequests <= 2 ? 'owner' : 'other';
					return [{ accessToken: authenticationRequests === 1 ? 'old-token' : 'refreshed-token', id: 's', account: { id: accountId, label: accountId }, scopes: [] }];
				},
				onRequest: (_url, _token, options) => {
					requests.push(options);
					return jsonTaskResponse(operation.response, operation.statusCode);
				},
			});
			const accountKey = await service.getAccountKey();
			assert.ok(accountKey);

			await operation.run(service, accountKey);

			assert.deepStrictEqual({
				authenticationRequests,
				requests: requests.map(request => ({
					type: request.type,
					body: request.data === undefined ? undefined : JSON.parse(request.data),
					authorization: request.headers?.Authorization,
					diagnosticId: request.diagnosticId,
				})),
			}, {
				authenticationRequests: 2,
				requests: [{ type: operation.method, body: operation.body, authorization: 'Bearer refreshed-token', diagnosticId: undefined }],
			});
		});
	}
});

suite('CloudSandboxApiService task reservations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const expectedAccountKey = JSON.stringify(['github', 'a']);
	const expiry = '2030-01-01T00:10:00Z';
	const receipt = {
		id: 'reserved-task', reserved: true, reservation_expires_at: expiry,
		sessions: [{ id: 'reserved-session', environment_id: 'reserved-env' }],
	};

	for (const repoNwo of [undefined, 'owner/repo']) {
		test(`reserves a hidden task with ${repoNwo ? 'repository' : 'default'} context and no user prompt`, async () => {
			const { service, calls } = createServiceForCreate(store, receipt, 201);

			const reserved = await service.reserveSession({ repoNwo, expectedAccountKey }, CancellationToken.None);

			assert.deepStrictEqual({
				reserved, requests: calls.map(call => ({
					path: new URL(call.url).pathname, type: call.type, body: call.body, timeout: call.timeout,
				}))
			}, {
				reserved: { taskId: 'reserved-task', sessionId: 'reserved-session', environmentId: 'reserved-env', reservationExpiresAt: Date.parse(expiry) },
				requests: [{
					path: '/agents/tasks', type: 'POST', timeout: undefined,
					body: {
						environment_id: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID, prompt: '', reserve: true,
						...(repoNwo ? { repositories: [{ owner: 'owner', name: 'repo' }] } : { compute: { scope: 'a' } }),
					},
				}],
			});
		});
	}

	for (const taskId of ['reserved-task', 'replacement-task']) {
		test(`renewal accepts the server-returned ${taskId}`, async () => {
			const { service, calls } = createServiceForCreate(store, { ...receipt, id: taskId }, 201);

			const reserved = await service.reserveSession({ repoNwo: 'owner/repo', reservedTaskId: ' reserved-task ', expectedAccountKey }, CancellationToken.None);

			assert.deepStrictEqual({ taskId: reserved.taskId, requests: calls.map(call => ({ type: call.type, body: call.body })) }, {
				taskId,
				requests: [{
					type: 'POST',
					body: {
						environment_id: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID, prompt: '',
						repositories: [{ owner: 'owner', name: 'repo' }], reserve: true, reserved_task_id: 'reserved-task',
					},
				}],
			});
		});
	}

	for (const invalid of [
		{ name: 'missing reservation acknowledgement', response: { ...receipt, reserved: undefined } },
		{ name: 'unreserved task', response: { ...receipt, reserved: false } },
		{ name: 'invalid reservation acknowledgement', schemaInvalid: true, response: { ...receipt, reserved: 'true' } },
		{ name: 'missing expiry', response: { ...receipt, reservation_expires_at: undefined } },
		{ name: 'invalid expiry', schemaInvalid: true, response: { ...receipt, reservation_expires_at: 'not-a-date' } },
		{ name: 'numeric expiry', schemaInvalid: true, response: { ...receipt, reservation_expires_at: 42 } },
		{ name: 'missing session', response: { ...receipt, sessions: [] } },
		{ name: 'invalid session list', schemaInvalid: true, response: { ...receipt, sessions: {} } },
		{ name: 'null session', schemaInvalid: true, response: { ...receipt, sessions: [null] } },
		{ name: 'missing session identity', schemaInvalid: true, response: { ...receipt, sessions: [{ environment_id: 'reserved-env' }] } },
		{ name: 'non-concrete environment', response: { ...receipt, sessions: [{ id: 'reserved-session', environment_id: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID }] } },
		{ name: 'invalid environment type', schemaInvalid: true, response: { ...receipt, sessions: [{ id: 'reserved-session', environment_id: ['reserved-env'] }] } },
	]) {
		test(`rejects ${invalid.name} and cleans up only a schema-validated new task`, async () => {
			const { service, calls } = createServiceForCreate(store, invalid.response, 201);

			await assert.rejects(service.reserveSession({ expectedAccountKey }, CancellationToken.None),
				invalid.schemaInvalid ? MutationUncertainError : /usable task reservation/);

			assert.deepStrictEqual(calls.map(call => [call.type, new URL(call.url).pathname]), invalid.schemaInvalid
				? [['POST', '/agents/tasks']] : [['POST', '/agents/tasks'], ['DELETE', '/agents/tasks/reserved-task']]);
		});
	}

	for (const id of [undefined, '', ' ', 42]) {
		test(`rejects an unusable reservation task identity ${JSON.stringify(id)} without guessing a cleanup target`, async () => {
			const { service, calls } = createServiceForCreate(store, { ...receipt, id }, 201);

			await assert.rejects(service.reserveSession({ expectedAccountKey }, CancellationToken.None), MutationUncertainError);

			assert.deepStrictEqual(calls.map(call => call.type), ['POST']);
		});
	}

	for (const statusCode of [201, 500]) {
		test(`does not delete a renewed task with an uncertain outcome after HTTP ${statusCode}`, async () => {
			const { service, calls, warnings } = createServiceForCreate(store, { ...receipt, reserved: false }, statusCode);

			await assert.rejects(service.reserveSession({ reservedTaskId: 'reserved-task', expectedAccountKey }, CancellationToken.None));

			assert.deepStrictEqual({
				requests: calls.map(call => call.type),
				retained: warnings.some(message => message.includes('Retaining task reserved-task')),
			}, { requests: ['POST'], retained: true });
		});
	}

	for (const statusCode of [401, 403, 422, 429, 500, 503]) {
		test(`does not retry or create a visible fallback after HTTP ${statusCode}`, async () => {
			const { service, calls } = createServiceForCreate(store, { message: 'reservation unavailable' }, statusCode, { responseHeaders: { 'retry-after': '1' } });

			await assert.rejects(service.reserveSession({ expectedAccountKey }, CancellationToken.None), new RegExp(`HTTP ${statusCode}`));

			assert.deepStrictEqual(calls.map(call => call.type), ['POST']);
		});
	}

	test('cleans up a newly acknowledged task after a failed reserve request', async () => {
		const { service, calls } = createServiceForCreate(store, { id: 'failed-reservation', message: 'setup failed' }, 500);

		await assert.rejects(service.reserveSession({ expectedAccountKey }, CancellationToken.None), /HTTP 500/);

		assert.deepStrictEqual(calls.map(call => [call.type, new URL(call.url).pathname]), [
			['POST', '/agents/tasks'], ['DELETE', '/agents/tasks/failed-reservation'],
		]);
	});

	test('cleanup failure does not replace an invalid reservation error', async () => {
		const { service, calls, warnings } = createServiceForCreate(store, { ...receipt, reserved: false }, 201, { failDelete: true });

		await assert.rejects(service.reserveSession({ expectedAccountKey }, CancellationToken.None), /usable task reservation/);

		assert.deepStrictEqual({
			requests: calls.map(call => call.type),
			cleanupFailures: warnings.filter(message => message.includes('Could not clean up sandbox task')).length,
		}, { requests: ['POST', 'DELETE'], cleanupFailures: 1 });
	});

	test('does not clean up a reservation using a different account after the response', async () => {
		let account = 'a';
		const warnings: string[] = [];
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => [{ accessToken: 'token', id: 's', account: { id: account, label: account }, scopes: [] }],
			onRequest: () => {
				account = 'other';
				return jsonTaskResponse({ ...receipt, reserved: false }, 201);
			},
			logService: new class extends NullLogService {
				override warn(message: string): void { warnings.push(message); }
			}(),
		});

		await assert.rejects(service.reserveSession({ expectedAccountKey }, CancellationToken.None), /usable task reservation/);

		assert.deepStrictEqual({
			requests: requestedUrls.map(url => new URL(url).pathname),
			cleanupFailures: warnings.filter(message => message.includes('Could not clean up sandbox task')).length,
		}, { requests: ['/agents/tasks'], cleanupFailures: 1 });
	});

	for (const invalid of [{ repoNwo: 'invalid' }, { reservedTaskId: '' }, { reservedTaskId: ' ' }]) {
		test(`rejects invalid reservation input ${JSON.stringify(invalid)} before dispatch`, async () => {
			const { service, calls } = createServiceForCreate(store, receipt, 201);

			await assert.rejects(service.reserveSession({ ...invalid, expectedAccountKey }, CancellationToken.None));

			assert.deepStrictEqual(calls, []);
		});
	}

	for (const failure of ['signed out', 'already cancelled', 'network error'] as const) {
		test(`reservation ${failure} never retries or falls back`, async () => {
			const error = new Error('network unavailable');
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(),
				authenticationSessions: failure === 'signed out' ? async () => [] : undefined,
				onRequest: () => { throw error; },
			});

			await assert.rejects(service.reserveSession({ expectedAccountKey }, failure === 'already cancelled' ? CancellationToken.Cancelled : CancellationToken.None));

			assert.deepStrictEqual(requestedUrls.length, failure === 'network error' ? 1 : 0);
		});
	}

	test('cancels a reservation without replay or cleanup when its response arrives after cancellation', async () => {
		const source = store.add(new CancellationTokenSource());
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => {
				source.cancel();
				return jsonTaskResponse(receipt, 201);
			},
		});

		await assert.rejects(service.reserveSession({ expectedAccountKey }, source.token), isCancellationError);
		assert.deepStrictEqual(requestedUrls.map(url => new URL(url).pathname), ['/agents/tasks']);
	});

	test('leaves reservation request telemetry to the shared transport without reporting submitted provisioning', async () => {
		const { service, requestOutcomes, provisioningOutcomes } = createService(store, {
			tasks: [], repositories: new Map(), onRequest: () => jsonTaskResponse(receipt, 201),
		});

		await service.reserveSession({ expectedAccountKey }, CancellationToken.None);

		assert.deepStrictEqual({ requestOutcomes, provisioningOutcomes }, {
			requestOutcomes: [], provisioningOutcomes: [],
		});
	});
});

suite('CloudSandboxApiService reservation submission', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const request = {
		repoNwo: 'owner/repo',
		reservedTaskId: 'reserved-task',
		expectedAccountKey: JSON.stringify(['github', 'a']),
		prompt: 'final prompt',
	};

	for (const claimed of [false, true]) {
		for (const statusCode of [200, 201]) {
			test(`uses the claimed ${claimed} response independently of HTTP ${statusCode}`, async () => {
				const taskId = claimed ? 'reserved-task' : 'fresh-task';
				const sessionId = claimed ? 'reserved-session' : 'fresh-session';
				const environmentId = claimed ? 'reserved-env' : 'fresh-env';
				const { service, calls } = createServiceForCreate(store, {
					id: taskId, claimed, sessions: [{ id: sessionId, environment_id: environmentId }],
				}, statusCode);
				let dispatched = 0;

				const created = await service.createSession(request, CancellationToken.None, () => dispatched++);

				assert.deepStrictEqual({
					created, dispatched, requests: calls.map(call => ({
						type: call.type, path: new URL(call.url).pathname, body: call.body,
					}))
				}, {
					created: { taskId, sessionId, environmentId, claimed },
					dispatched: 1,
					requests: [{
						type: 'POST', path: '/agents/tasks',
						body: {
							environment_id: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID, prompt: 'final prompt',
							repositories: [{ owner: 'owner', name: 'repo' }], reserved_task_id: 'reserved-task',
						},
					}],
				});
			});
		}
	}

	for (const taskId of ['reserved-task', 'fresh-task']) {
		for (const statusCode of [401, 403, 422, 429, 500]) {
			test(`failed reservation submission never deletes the reported ${taskId} after HTTP ${statusCode}`, async () => {
				const { service, calls } = createServiceForCreate(store, { id: taskId, message: 'submission failed' }, statusCode, { responseHeaders: { 'retry-after': '1' } });

				await assert.rejects(service.createSession(request, CancellationToken.None), new RegExp(`HTTP ${statusCode}`));

				assert.deepStrictEqual(calls.map(call => call.type), ['POST']);
			});
		}
	}

	for (const repoNwo of [undefined, 'owner/repo']) {
		test(`reserve and submit preserve identical ${repoNwo ? 'repository' : 'default'} context`, async () => {
			const bodies: Record<string, unknown>[] = [];
			const { service, requestOutcomes, provisioningOutcomes } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: (_url, _token, options) => {
					assert.ok(options.data);
					const body: Record<string, unknown> = JSON.parse(options.data);
					bodies.push(body);
					return jsonTaskResponse({
						id: 'reserved-task', sessions: [{ id: 'reserved-session', environment_id: 'reserved-env' }],
						...(body.reserve === true ? { reserved: true, reservation_expires_at: '2030-01-01T00:10:00Z' } : { claimed: true }),
					}, body.reserve === true ? 201 : 200);
				},
			});
			const reserved = await service.reserveSession({ repoNwo, expectedAccountKey: request.expectedAccountKey }, CancellationToken.None);

			const created = await service.createSession({ ...request, repoNwo, reservedTaskId: ` ${reserved.taskId} ` }, CancellationToken.None);

			const context = {
				environment_id: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID,
				...(repoNwo ? { repositories: [{ owner: 'owner', name: 'repo' }] } : { compute: { scope: 'a' } }),
			};
			assert.deepStrictEqual({
				bodies, created, requestOutcomes, provisioningOutcomes: provisioningOutcomes.map(outcome => outcome[0]),
			}, {
				bodies: [
					{ ...context, prompt: '', reserve: true },
					{ ...context, prompt: 'final prompt', reserved_task_id: 'reserved-task' },
				],
				created: { taskId: 'reserved-task', sessionId: 'reserved-session', environmentId: 'reserved-env', claimed: true },
				requestOutcomes: [],
				provisioningOutcomes: ['success'],
			});
		});
	}

	const claimedTask = {
		id: 'reserved-task', claimed: true, sessions: [{ id: 'reserved-session', environment_id: 'reserved-env' }],
	};
	for (const invalid of [
		{ name: 'missing claim acknowledgement', response: { ...claimedTask, claimed: undefined } },
		{ name: 'invalid claim acknowledgement', schemaInvalid: true, response: { ...claimedTask, claimed: 'true' } },
		{ name: 'still reserved task', response: { ...claimedTask, reserved: true } },
		{ name: 'invalid reservation state', schemaInvalid: true, response: { ...claimedTask, reserved: 'false' } },
		{ name: 'null reservation state', schemaInvalid: true, response: { ...claimedTask, reserved: null } },
		{ name: 'different claimed task', response: { ...claimedTask, id: 'unexpected-task' } },
		{ name: 'missing task identity', schemaInvalid: true, response: { ...claimedTask, id: undefined } },
		{ name: 'numeric task identity', schemaInvalid: true, response: { ...claimedTask, id: 42 } },
		{ name: 'blank task identity', schemaInvalid: true, response: { ...claimedTask, id: ' ' } },
		{ name: 'missing claimed session', response: { ...claimedTask, sessions: [] } },
		{ name: 'missing fallback session', response: { ...claimedTask, id: 'fresh-task', claimed: false, sessions: [] } },
		{ name: 'invalid session list', schemaInvalid: true, response: { ...claimedTask, sessions: {} } },
		{ name: 'non-concrete environment', response: { ...claimedTask, sessions: [{ id: 'reserved-session', environment_id: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID }] } },
	]) {
		test(`rejects a reservation submission with ${invalid.name} without deleting or replaying it`, async () => {
			const { service, calls } = createServiceForCreate(store, invalid.response, 200);

			await assert.rejects(service.createSession(request, CancellationToken.None), invalid.schemaInvalid ? MutationUncertainError : CloudSandboxRequestError);

			assert.deepStrictEqual(calls.map(call => call.type), ['POST']);
		});
	}

	for (const invalid of [
		{ reservedTaskId: '' },
		{ reservedTaskId: ' ' },
		{ environmentId: 'existing-env' },
		{ expectedAccountKey: undefined },
		{ expectedAccountKey: 'other-account' },
	]) {
		test(`rejects invalid reservation submission ${JSON.stringify(invalid)} before dispatch`, async () => {
			const { service, calls } = createServiceForCreate(store, claimedTask, 200);
			let dispatched = 0;

			await assert.rejects(service.createSession({ ...request, ...invalid }, CancellationToken.None, () => dispatched++));

			assert.deepStrictEqual({ calls, dispatched }, { calls: [], dispatched: 0 });
		});
	}

	for (const signedOut of [false, true]) {
		test(`reservation submission does not dispatch when ${signedOut ? 'signed out' : 'already cancelled'}`, async () => {
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(), authenticationSessions: signedOut ? async () => [] : undefined,
			});
			let dispatched = 0;

			await assert.rejects(service.createSession(request, signedOut ? CancellationToken.None : CancellationToken.Cancelled, () => dispatched++));

			assert.deepStrictEqual({ requestedUrls, dispatched }, { requestedUrls: [], dispatched: 0 });
		});
	}

	for (const cancelled of [false, true]) {
		test(`reservation submission reports ${cancelled ? 'cancellation' : 'an uncertain network outcome'} after dispatch without retry or cleanup`, async () => {
			const source = store.add(new CancellationTokenSource());
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: () => {
					if (cancelled) {
						source.cancel();
					}
					throw new Error('network interrupted');
				},
			});
			let dispatched = 0;

			await assert.rejects(service.createSession(request, source.token, () => dispatched++), cancelled ? isCancellationError : MutationUncertainError);

			assert.deepStrictEqual({ requests: requestedUrls.length, dispatched }, { requests: 1, dispatched: 1 });
		});
	}

	for (const claimed of [false, true]) {
		test(`late reservation submission with claimed ${claimed} does not override cancellation or trigger cleanup`, async () => {
			const source = store.add(new CancellationTokenSource());
			const taskId = claimed ? 'reserved-task' : 'fresh-task';
			const { service, requestedUrls, provisioningOutcomes } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: () => {
					source.cancel();
					return jsonTaskResponse({ ...claimedTask, id: taskId, claimed }, 200);
				},
			});

			await assert.rejects(service.createSession(request, source.token), isCancellationError);

			assert.deepStrictEqual({
				requests: requestedUrls.length, provisioningOutcomes: provisioningOutcomes.map(outcome => outcome[0]),
			}, {
				requests: 1, provisioningOutcomes: ['cancelled'],
			});
		});
	}

	test('normal creation ignores unsolicited claim metadata and preserves its response shape', async () => {
		const { service, calls } = createServiceForCreate(store, claimedTask, 201);

		const created = await service.createSession({ repoNwo: 'owner/repo', prompt: 'final prompt' }, CancellationToken.None);

		assert.deepStrictEqual({ created, bodies: calls.map(call => call.body) }, {
			created: { taskId: 'reserved-task', sessionId: 'reserved-session', environmentId: 'reserved-env' },
			bodies: [{
				environment_id: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID, prompt: 'final prompt',
				repositories: [{ owner: 'owner', name: 'repo' }],
			}],
		});
	});
});

suite('CloudSandboxApiService session creation', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('binds creation lifecycle identity after the response and keeps reservation fallback distinct', async () => {
		const environmentId = generateUuid();
		const sessionId = generateUuid();
		const taskId = generateUuid();
		const reservedTaskId = generateUuid();
		const serverRequestId = 'ABCD:1234:5678:9ABC:DEF01234';
		const { service, lifecycleEvents } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => jsonTaskResponse({ id: taskId, claimed: false, sessions: [{ id: sessionId, environment_id: environmentId }] }, 201, { 'x-github-request-id': serverRequestId }),
		});
		await service.createSession({
			reservedTaskId, prompt: 'private prompt', repoNwo: 'private/repository',
			expectedAccountKey: JSON.stringify(['github', 'a']),
		}, CancellationToken.None);
		assert.deepStrictEqual({
			events: lifecycleEvents.map(event => ({
				outcome: event.outcome, environmentId: event.environmentId, sessionId: event.agentSessionId,
				taskId: event.taskId, reservedTaskId: event.relatedTaskId, path: event.taskCreationPath, serverRequestId: event.serverRequestId,
			})),
			operations: new Set(lifecycleEvents.map(event => event.operationId)).size,
			privateContent: JSON.stringify(lifecycleEvents).includes('private'),
		}, {
			events: [
				{ outcome: 'started', environmentId: undefined, sessionId: undefined, taskId: undefined, reservedTaskId, path: 'reservationUnconfirmed', serverRequestId: undefined },
				{ outcome: 'observed', environmentId: undefined, sessionId: undefined, taskId: undefined, reservedTaskId, path: 'reservationUnconfirmed', serverRequestId },
				{ outcome: 'succeeded', environmentId, sessionId, taskId, reservedTaskId, path: 'reservationFallback', serverRequestId },
			],
			operations: 1, privateContent: false,
		});
	});

	test('reports a pre-allocation failure without inventing environment or session IDs', async () => {
		const { service, lifecycleEvents } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => jsonResponse({ message: 'private refusal' }, 403, { 'x-github-request-id': 'ABCD:1234:5678:9ABC:DEF01234' }),
		});
		await assert.rejects(service.createSession({ prompt: 'private prompt' }, CancellationToken.None));
		assert.deepStrictEqual({
			events: lifecycleEvents.map(event => [event.outcome, event.environmentId, event.agentSessionId, event.statusCode]),
			operations: new Set(lifecycleEvents.map(event => event.operationId)).size,
			privateContent: JSON.stringify(lifecycleEvents).includes('private'),
		}, {
			events: [['started', undefined, undefined, undefined], ['failed', undefined, undefined, 403]],
			operations: 1, privateContent: false,
		});
	});

	for (const scenario of [
		{ path: 'newEnvironment', request: {} },
		{ path: 'existingEnvironment', request: { environmentId: 'private-env' } },
		{ path: 'reservationClaimed', request: { reservedTaskId: 'private-task' }, claimed: true },
		{ path: 'reservationFallback', request: { reservedTaskId: 'private-old-task' }, claimed: false },
		{ path: 'reservationUnconfirmed', request: { reservedTaskId: 'private-task' }, statusCode: 500 },
	]) {
		test(`reports the ${scenario.path} startup path without exporting creation inputs`, async () => {
			const { service, provisioningOutcomes } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: () => jsonTaskResponse({
					id: 'private-task', claimed: scenario.claimed,
					sessions: [{ id: 'private-session', environment_id: 'private-env' }],
				}, scenario.statusCode ?? 201),
			});

			const creating = service.createSession({
				...scenario.request, repoNwo: 'private/repository', prompt: 'private-prompt',
				expectedAccountKey: JSON.stringify(['github', 'a']),
			}, CancellationToken.None);
			if (scenario.statusCode) {
				await assert.rejects(creating);
			} else {
				await creating;
			}

			assert.deepStrictEqual({
				outcomes: provisioningOutcomes.map(([outcome, , path]) => ({ outcome, path })),
				privateContent: JSON.stringify(provisioningOutcomes).includes('private-'),
			}, {
				outcomes: [{ outcome: scenario.statusCode ? 'failure' : 'success', path: scenario.path }],
				privateContent: false,
			});
		});
	}

	for (const outcome of ['success', 'HTTP failure', 'network failure'] as const) {
		test(`reports task dispatch before transport for ${outcome}`, async () => {
			const events: string[] = [];
			const bodies: (string | undefined)[] = [];
			const { service } = createService(store, {
				tasks: [], repositories: new Map(),
				onRequest: (_url, _token, request) => {
					events.push('transport');
					bodies.push(request.data);
					if (outcome === 'network failure') {
						throw new Error('connection interrupted');
					}
					return outcome === 'HTTP failure'
						? jsonResponse({ message: 'unavailable' }, 503)
						: jsonTaskResponse({ id: 'task-1', sessions: [{ id: 'session-1', environment_id: 'env-1' }] }, 201);
				},
			});
			const creating = service.createSession({ prompt: 'hello', environmentId: 'env-1' }, CancellationToken.None, () => events.push('dispatch'));
			if (outcome === 'success') {
				await creating;
			} else {
				await assert.rejects(creating);
			}

			assert.deepStrictEqual({ events, bodies }, {
				events: ['dispatch', 'transport'],
				bodies: [JSON.stringify({ environment_id: 'env-1', prompt: 'hello' })],
			});
		});
	}

	for (const preflight of [
		{ name: 'no credentials', signedOut: true },
		{ name: 'wrong account', request: { expectedAccountKey: 'another-account' } },
		{ name: 'invalid repository', request: { repoNwo: '' } },
		{ name: 'invalid environment', request: { environmentId: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID } },
		{ name: 'already cancelled', token: CancellationToken.Cancelled },
	]) {
		test(`does not report task dispatch for ${preflight.name}`, async () => {
			let dispatched = 0;
			const { service, requestedUrls } = createService(store, {
				tasks: [], repositories: new Map(),
				...(preflight.signedOut ? { authenticationSessions: async () => [] } : {}),
			});

			await assert.rejects(service.createSession({ prompt: 'hello', ...preflight.request }, preflight.token ?? CancellationToken.None, () => dispatched++));

			assert.deepStrictEqual({ dispatched, requestedUrls }, { dispatched: 0, requestedUrls: [] });
		});
	}

	test('does not report task dispatch when cancelled while resolving credentials', async () => {
		const source = store.add(new CancellationTokenSource());
		let dispatched = 0;
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(),
			authenticationSessions: async () => {
				source.cancel();
				return [{ id: 'session-1', accessToken: 'token', account: { id: 'a', label: 'actor' }, scopes: ['read:user'] }];
			},
		});

		await assert.rejects(service.createSession({ prompt: 'hello' }, source.token, () => dispatched++), isCancellationError);

		assert.deepStrictEqual({ dispatched, requestedUrls }, { dispatched: 0, requestedUrls: [] });
	});

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
					return jsonTaskResponse({
						id: 'private-task',
						sessions: result === 'invalid binding' ? [] : [{ id: 'private-session', environment_id: 'private-environment' }],
					});
				},
			});
			await timeout(100);
			const provisioning = service.createSession({ prompt: 'private prompt' }, source.token);
			if (result === 'success') {
				await provisioning;
			} else {
				await assert.rejects(provisioning, result === 'late success after cancellation' || result === 'cancelled'
					? isCancellationError : result === 'network error' ? MutationUncertainError : Error);
			}
			await timeout(100);
			assert.deepStrictEqual(provisioningOutcomes, [[
				result === 'success' ? 'success' : result === 'cancelled' || result === 'late success after cancellation' ? 'cancelled' : 'failure',
				result === 'invalid binding' ? 50 : 40,
				'newEnvironment',
			]]);
		}));
	}

	test('reports already cancelled provisioning without issuing a request', () => runWithFakedTimers({}, async () => {
		const { service, requestedUrls, provisioningOutcomes } = createService(store, { tasks: [], repositories: new Map() });
		await assert.rejects(service.createSession({ prompt: 'hello' }, CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual({ requestedUrls, provisioningOutcomes }, { requestedUrls: [], provisioningOutcomes: [['cancelled', 0, 'newEnvironment']] });
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
			timeout: undefined,
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

	test('binds a repository task to an existing environment without allocating compute', async () => {
		const { service, calls } = createServiceForCreate(store, {
			id: 'task-1',
			sessions: [{ id: 'sess-1', environment_id: 'env-prepared' }],
		});

		const created = await service.createSession({ environmentId: 'env-prepared', repoNwo: 'octocat/hello-world', prompt: 'fix it' }, CancellationToken.None);

		assert.deepStrictEqual({
			created,
			requests: calls.map(call => ({ type: call.type, path: new URL(call.url).pathname, body: call.body })),
		}, {
			created: { taskId: 'task-1', sessionId: 'sess-1', environmentId: 'env-prepared' },
			requests: [{
				type: 'POST',
				path: '/agents/tasks',
				body: {
					environment_id: 'env-prepared',
					prompt: 'fix it',
					repositories: [{ owner: 'octocat', name: 'hello-world' }],
				},
			}],
		});
	});

	for (const environmentId of ['', '   ', CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID]) {
		test(`rejects an invalid prepared environment without allocating: '${environmentId}'`, async () => {
			const { service, requestedUrls } = createService(store, { tasks: [], repositories: new Map() });

			await assert.rejects(service.createSession({ environmentId, prompt: 'hello' }, CancellationToken.None), /environment identifier is invalid/);
			assert.deepStrictEqual(requestedUrls, []);
		});
	}

	test('does not adopt or delete an unexpected environment returned by task creation', async () => {
		const { service, calls } = createServiceForCreate(store, {
			id: 'task-1',
			sessions: [{ id: 'sess-1', environment_id: 'env-unexpected' }],
		});

		await assert.rejects(service.createSession({ environmentId: 'env-prepared', prompt: 'hello' }, CancellationToken.None), /bound sandbox task task-1 to a different environment/);
		assert.deepStrictEqual(calls.map(call => call.type), ['POST']);
	});

	for (const statusCode of [400, 404]) {
		test(`does not fall back to allocation when binding returns HTTP ${statusCode}`, async () => {
			const { service, calls } = createServiceForCreate(store, { message: 'environment unavailable' }, statusCode);

			await assert.rejects(service.createSession({ environmentId: 'env-prepared', prompt: 'hello' }, CancellationToken.None), new RegExp(`HTTP ${statusCode}`));
			assert.deepStrictEqual(calls.map(call => ({ type: call.type, body: call.body })), [{
				type: 'POST',
				body: { environment_id: 'env-prepared', prompt: 'hello' },
			}]);
		});
	}

	test('does not replay task binding after a request with an unknown outcome', async () => {
		const error = new Error('connection interrupted');
		const { service, requestedUrls } = createService(store, {
			tasks: [], repositories: new Map(),
			onRequest: () => { throw error; },
		});

		await assert.rejects(service.createSession({ environmentId: 'env-prepared', prompt: 'hello' }, CancellationToken.None), MutationUncertainError);
		assert.deepStrictEqual(requestedUrls.map(url => new URL(url).pathname), ['/agents/tasks']);
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
				return jsonTaskResponse({ id: 'task-1', sessions: [{ id: 'sess-1', environment_id: 'env-1' }] });
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

			await assert.rejects(service.createSession({ repoNwo, prompt: 'hello' }, CancellationToken.None), {
				name: 'CloudSandboxRequestError',
				message: 'The sandbox repository must be specified as owner/name.',
				statusCode: undefined,
				code: 'invalid_request',
			});
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
			'[CloudSandboxApi] Could not clean up sandbox task task-10: Mission Control task delete failed: HTTP 500. It remains and can only be removed server-side.',
		]);
	});

	test('keeps the failure code when the response names no task', async () => {
		const { service, calls } = createServiceForCreate(store, { message: 'private details', error_code: 'backend_error' }, 500);

		await assert.rejects(
			() => service.createSession({ prompt: 'hello' }, CancellationToken.None),
			/HTTP 500 code=backend_error/,
		);

		assert.deepStrictEqual(calls.map(c => c.type), ['POST']);
	});

	test('surfaces safe diagnostics instead of private bodies when creation fails', async () => {
		const { service, errors, warnings } = createServiceForCreate(store,
			{ message: 'private credential', access_token: 'private credential', error_code: 'backend_error' }, 500,
			{ responseHeaders: { 'x-github-request-id': 'ABCD:1234:5678:90AB:CDEF', 'x-sweagentd-retry': 'private header' } });

		await assert.rejects(() => service.createSession({ prompt: 'hello' }, CancellationToken.None), {
			message: 'Mission Control task create failed: HTTP 500 code=backend_error (requestId=ABCD:1234:5678:90AB:CDEF)',
			statusCode: 500, code: 'backend_error',
		});
		assert.strictEqual([...errors, ...warnings].some(message => message.includes('private')), false);
	});
});
