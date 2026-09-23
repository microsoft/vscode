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
import { CLOUD_SANDBOX_AGENT_SLUG, CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { SessionStatus } from '../../../../../../platform/agentHost/common/state/sessionState.js';
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
	readonly current_environment?: { readonly id: string; readonly kind: string };
	readonly updated_at?: string;
	readonly archived_at?: string;
};

interface ITestSetup {
	readonly service: CloudSandboxApiService;
	readonly requestedUrls: string[];
	/** Peak number of task-detail fetches in flight at once during the run. */
	readonly concurrency: { max: number; current: number };
	changeAuthentication(): void;
}

class TestLogService extends NullLogService {
	readonly traces: string[] = [];
	readonly errors: (string | Error)[] = [];

	override trace(message: string, ...args: unknown[]): void {
		this.traces.push([message, ...args].join(' '));
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
	readonly onRequest?: (url: URL, token: CancellationToken) => IRequestContext | undefined | Promise<IRequestContext | undefined>;
	readonly discoveryDate?: () => string;
	readonly authenticationSessions?: (scopes?: readonly string[]) => Promise<readonly AuthenticationSession[]>;
}): ITestSetup {
	const requestedUrls: string[] = [];
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
			const override = await options.onRequest?.(new URL(url), token);
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
	}());

	return {
		service: store.add(instantiationService.createInstance(CloudSandboxApiService)),
		requestedUrls,
		concurrency,
		changeAuthentication: () => authenticationChanges.fire({ providerId: 'github', label: 'GitHub', event: { added: [], removed: [], changed: [] } }),
	};
}

suite('CloudSandboxApiService repository resolution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
			listPages: 3,
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
			listPages: 3,
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
			listPages: 11,
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

suite('CloudSandboxApiService incremental discovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const firstScanDate = 'Tue, 22 Sep 2026 10:00:00 GMT';
	const checkpoint = '2026-09-22T09:59:00.000Z';

	function updatedTask(id: string, updatedAt = '2026-09-22T09:58:00Z', repositoryId?: number): ITestTask {
		return { ...task(id, id, repositoryId, `session-${id}`, `env-${id}`), updated_at: updatedAt };
	}

	test('queries both repository scopes and resolves no task details when nothing changed', async () => {
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
			queries: [true, false].map(withRepository => ({
				per_page: '100', page: '1', sort: 'updated_at', direction: 'desc',
				with_repo: String(withRepository), since: checkpoint, include_environment_kinds: 'managed-sandbox',
			})),
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
		}, { kind: 'incremental', since: '2026-09-22T09:57:00.000Z', requests: 2 });
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
			pages: queries.map(query => [query.get('with_repo'), query.get('page')]),
			retainedFilters: queries.every(query => query.get('since') === checkpoint && query.get('include_environment_kinds') === 'managed-sandbox'),
		}, {
			kind: 'incremental', count: 101,
			pages: [['true', '1'], ['false', '1'], ['false', '2']],
			retainedFilters: true,
		});
	});

	test('reports explicit task archives and discovers unarchives without retaining stale details', async () => {
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
			archived, archivedRequests,
			unarchived: unarchived.kind === 'failed' ? [] : unarchived.sessions.map(session => session.taskId),
			detailFetches: requestedUrls.filter(url => url.endsWith('/tasks/first')).length,
		}, {
			archived: { kind: 'incremental', sessions: [], removedTaskIds: ['first'] },
			archivedRequests: 2,
			unarchived: ['first'],
			detailFetches: 1,
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
	}());
	return { service: store.add(instantiationService.createInstance(CloudSandboxApiService)), calls, errors, warnings };
}

suite('CloudSandboxApiService session creation', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

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

	test('omits the repository when it is not supplied', async () => {
		const { service, calls } = createServiceForCreate(store, {
			id: 'task-2',
			sessions: [{ id: 'sess-2', environment_id: 'env-2' }],
		});

		await service.createSession({ prompt: 'hello' }, CancellationToken.None);

		assert.deepStrictEqual(calls[0].body, {
			environment_id: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID,
			prompt: 'hello',
		});
	});

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
			'[CloudSandboxApi] Could not clean up sandbox task task-10: HTTP 500. It remains and can only be removed server-side.',
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
