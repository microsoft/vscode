/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { IRequestContext, type IHeaders, type IRequestOptions } from '../../../../../../base/parts/request/common/request.js';
import { CLOUD_SANDBOX_AGENT_SLUG, CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { IAuthenticationService } from '../../../../../../workbench/services/authentication/common/authentication.js';
import { CloudSandboxApiService } from '../../browser/cloudSandboxApiService.js';
import { ICloudSandboxTelemetryService } from '../../browser/cloudSandboxTelemetry.js';

function jsonResponse(body: unknown, statusCode = 200, headers: Record<string, string> = {}): IRequestContext {
	return {
		res: { headers, statusCode },
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
		...(repositoryId !== undefined ? { repository: { id: repositoryId } } : {}),
		sessions: [{ id: sessionId, environment_id: environmentId }],
	};
}

interface ITestSetup {
	readonly service: CloudSandboxApiService;
	readonly requestedUrls: string[];
	/** Peak number of task-detail fetches in flight at once during the run. */
	readonly concurrency: { max: number; current: number };
}

function createService(store: Pick<{ add<T extends { dispose(): void }>(t: T): T }, 'add'>, options: {
	readonly tasks: readonly unknown[];
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

	instantiationService.stub(IRequestService, new class extends mock<IRequestService>() {
		override async request(opts: { url?: string }): Promise<IRequestContext> {
			const url = opts.url ?? '';
			requestedUrls.push(url);
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
					return jsonResponse(options.tasks.find(t => (t as { id: string }).id === id));
				} finally {
					concurrency.current--;
				}
			}
			if (remainingListRateLimits > 0) {
				remainingListRateLimits--;
				return rateLimitedResponse();
			}
			// Paginate like Mission Control does, advertising further pages via the `Link` header.
			const perPage = Number(url.match(/[?&]per_page=(\d+)/)?.[1] ?? options.tasks.length);
			const page = Number(url.match(/[?&]page=(\d+)/)?.[1] ?? 1);
			if (options.shortFirstPage && page === 1) {
				return jsonResponse({ tasks: [] }, 200, { link: `<https://api.github.com/agents/tasks?page=2&per_page=${perPage}>; rel="next"` });
			}
			const slice = options.shortFirstPage ? options.tasks : options.tasks.slice((page - 1) * perPage, page * perPage);
			const hasNext = !options.shortFirstPage && page * perPage < options.tasks.length;
			const link = hasNext
				? `<https://api.github.com/agents/tasks?page=${page + 1}&per_page=${perPage}>; rel="next"`
				: `<https://api.github.com/agents/tasks?page=${page}&per_page=${perPage}>; rel="last"`;
			return jsonResponse({ tasks: slice }, 200, { link });
		}
	}());
	instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
		override async getSessions() { return [{ accessToken: 'tok', id: 's', account: { id: 'a', label: 'a' }, scopes: [] }]; }
		override readonly onDidChangeSessions = Event.None;
	}());
	instantiationService.stub(IProductService, { defaultChatAgent: undefined } as unknown as IProductService);
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(ICloudSandboxTelemetryService, new class extends mock<ICloudSandboxTelemetryService>() {
		override reportRequest(): void { }
	}());

	return { service: store.add(instantiationService.createInstance(CloudSandboxApiService)), requestedUrls, concurrency };
}

suite('CloudSandboxApiService repository resolution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
			listPages: 2,
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
			listPages: 2,
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
			listPages: 10,
		});
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
