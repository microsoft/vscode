/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { useFakeTimers } from 'sinon';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastDeepPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { COPILOT_INTEGRATION_ID } from '../../../../../../platform/endpoint/common/licenseAgreement.js';
import { AutomationDetail, AutomationRepositoryConfiguration, CreateAutomationTaskResponse, EditAutomationRequest, IAutomationsClient, ListAutomationsOptions, ListRepoAutomationsResponse } from '../../../../../../platform/github/common/missionControl/automations.js';
import { PaginatedResponse } from '../../../../../../platform/github/common/missionControl/missionControl.js';
import { ApiRequestError, MutationUncertainError } from '../../../../../../platform/github/common/missionControl/missionControlClient.js';
import { ITasksClient, ListTasksResponse, Task, TaskListOptions } from '../../../../../../platform/github/common/missionControl/tasks.js';
import { GitHubService } from '../../../../../../platform/github/common/githubService.js';
import { IGitHubAccountClient } from '../../../../../../platform/github/common/account/account.js';
import { GitHubChannelClient } from '../../../../../../platform/github/common/remote/ipcClient.js';
import { IGitHubCredentialBroker } from '../../../../../../platform/github/common/remote/ipc.js';
import { registerGitHubChannel } from '../../../../../../platform/github/common/remote/ipcServer.js';
import { TestConnection } from '../../../../../../platform/github/test/common/testConnection.js';
import { ClientConnectionEvent, IPCServer } from '../../../../../../base/parts/ipc/common/ipc.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { AutomationMutationUncertainError } from '../../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IRecentWorkspace, ISessionsRecentWorkspacesService } from '../../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../../../services/sessions/common/session.js';
import { IWorkbenchGitHubService } from '../../../../../../workbench/services/github/common/githubService.js';
import { GitHubCloudAutomationStore } from '../../browser/githubCloudAutomationStore.js';
import { RepositoryRef } from '../../../../../../platform/github/common/client/types.js';
import { ApiRequestOptions } from '../../../../../../platform/github/common/client/request.js';
import { RequestPriority } from '../../../../../../platform/github/common/types.js';
import { PaginationLimitError } from '../../../../../../platform/github/common/client/pagination.js';

const account: IDefaultAccount = { accountName: 'octocat', sessionId: 'auth-1', enterprise: false, authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false } };
const repository = { owner: 'microsoft', repo: 'vscode-internalbacklog' };
const storedRepository = { owner: repository.owner, name: repository.repo };
const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/microsoft/vscode-internalbacklog/HEAD' });
const storageKey = 'cloudAutomations.repositories.octocat';
const definition: AutomationDetail = {
	id: 'automation-1', name: 'Review', prompt: 'Review issues.', disabled: true, description: '', created_by: { login: 'octocat' },
	triggers: { custom: { types: ['future-trigger'], future_option: true } },
	created_at: '2026-09-22T00:00:00Z', updated_at: '2026-09-22T00:00:00Z',
};
const createValue = { name: definition.name, prompt: definition.prompt, description: '' };
const reconciliationMessage = 'The automation request may have been accepted. Refresh automations before submitting again.';

class TestApi extends mock<IAutomationsClient>() {
	readonly priorities: { method: string; priority: RequestPriority | undefined }[] = [];
	readonly calls: { method: string; account: string; repository: typeof repository; token: AbortSignal }[] = [];
	readonly manageability = new Map<string, boolean | Error | Promise<boolean>>();
	readonly definitions = new Map<string, readonly AutomationDetail[] | Error | Promise<readonly AutomationDetail[]>>();
	readonly detailCalls: { id: string; signal: AbortSignal }[] = [];
	detailResult: ((id: string, signal: AbortSignal) => Promise<AutomationDetail>) | undefined;
	accountName = account.accountName;
	readonly manageabilityStarted = new DeferredPromise<void>();
	readonly listStarted = new DeferredPromise<void>();
	readonly mutations: string[] = [];
	mutationResult: AutomationDetail | Promise<AutomationDetail> | Error = definition;
	tasks: readonly Task[] = [];
	readonly historyErrors = new Map<string, Error>();
	taskDetail: Task | Promise<Task> | undefined;
	readonly detailStarted = new DeferredPromise<void>();
	activeDetails = 0;
	maxActiveDetails = 0;

	override async create(): Promise<AutomationDetail> {
		this.mutations.push('create');
		if (this.mutationResult instanceof Error) {
			throw this.mutationResult;
		}
		return this.mutationResult;
	}

	override async update(_repository: RepositoryRef, _id: string, value: EditAutomationRequest): Promise<AutomationDetail> {
		this.mutations.push('update');
		return { ...definition, ...value };
	}

	override async delete(): Promise<void> {
		this.mutations.push('delete');
	}

	override async dispatch(): Promise<CreateAutomationTaskResponse> {
		this.mutations.push('run');
		return {};
	}

	override async listRuns(_id: string, _signal: AbortSignal, options?: TaskListOptions): Promise<PaginatedResponse<ListTasksResponse>> {
		const { priority, ...requestOptions } = options ?? {};
		this.priorities.push({ method: 'history', priority });
		assert.deepStrictEqual(requestOptions, { query: { per_page: 50, page: 1, sort: 'created_at', direction: 'desc', is_archived: false } });
		const error = this.historyErrors.get(_id);
		if (error) {
			throw error;
		}
		return { data: { tasks: this.tasks } };
	}

	async getTask(options?: ApiRequestOptions): Promise<Task> {
		this.priorities.push({ method: 'task', priority: options?.priority });
		this.maxActiveDetails = Math.max(this.maxActiveDetails, ++this.activeDetails);
		await this.detailStarted.complete();
		try {
			return await this.taskDetail!;
		} finally {
			this.activeDetails--;
		}
	}

	override async getConfiguration(ref: RepositoryRef, token: AbortSignal, options?: ApiRequestOptions): Promise<AutomationRepositoryConfiguration> {
		this.priorities.push({ method: 'capability', priority: options?.priority });
		this.calls.push({ method: 'capability', account: this.accountName, repository: ref, token });
		const result = this.manageability.get(ref.repo) ?? true;
		await this.manageabilityStarted.complete();
		if (result instanceof Error) {
			throw result;
		}
		return {
			automations_enabled: true,
			can_manage_automations: await result,
			allow_read_access_triggers: false,
			require_trigger_scoped_writes: false,
		};
	}

	override async list(ref: RepositoryRef, token: AbortSignal, options?: ListAutomationsOptions): Promise<PaginatedResponse<ListRepoAutomationsResponse>> {
		const { priority, ...requestOptions } = options ?? {};
		this.priorities.push({ method: 'list', priority });
		assert.deepStrictEqual(requestOptions, { query: { page: 1, per_page: 100 }, maxPages: 10 });
		this.calls.push({ method: 'list', account: this.accountName, repository: ref, token });
		const result = this.definitions.get(ref.repo) ?? [definition];
		await this.listStarted.complete();
		if (result instanceof Error) {
			throw result;
		}
		const automations = await result;
		return { data: { automations, total_count: automations.length } };
	}

	override async get(ref: RepositoryRef, id: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<AutomationDetail> {
		this.priorities.push({ method: 'get', priority: options?.priority });
		this.detailCalls.push({ id, signal });
		if (this.detailResult) {
			return this.detailResult(id, signal);
		}
		const values = await (this.definitions.get(ref.repo) ?? [definition]);
		assert.ok(!(values instanceof Error));
		const result = values.find(value => value.id === id);
		assert.ok(result);
		return result;
	}
}

function recentWorkspace(root: URI): IRecentWorkspace {
	return upcastDeepPartial<IRecentWorkspace>({ workspace: { folders: [{ root }] } });
}

suite('GitHubCloudAutomationStore', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(resolveRepositoryUri: (uri: URI) => URI | undefined | Promise<URI | undefined> = () => undefined) {
		const accountChanged = disposables.add(new Emitter<IDefaultAccount | null>());
		const accounts = new class extends mock<IDefaultAccountService>() {
			override currentDefaultAccount: IDefaultAccount | null = account;
			override readonly onDidChangeDefaultAccount = accountChanged.event;
		}();
		const recents = new class extends mock<ISessionsRecentWorkspacesService>() {
			workspaces: IRecentWorkspace[] = [];
			override getRecentWorkspaces(includeVSCodeRecents: boolean): IRecentWorkspace[] {
				assert.strictEqual(includeVSCodeRecents, false);
				return this.workspaces;
			}
		}();
		const api = new TestApi();
		const storage = disposables.add(new InMemoryStorageService());
		const clientChanged = disposables.add(new Emitter<void>());
		const credentialLifetime = new AbortController();
		const leases = { acquired: 0, released: 0 };
		const clientInvalidated = disposables.add(new Emitter<void>());
		let acquisition: Promise<void> | undefined;
		const acquisitionStarted = new DeferredPromise<void>();
		const service = new class extends mock<IWorkbenchGitHubService>() {
			override readonly onDidChangeDefaultClient = clientChanged.event;
			override async acquireDefaultAccountApiClient() {
				await acquisitionStarted.complete();
				await acquisition;
				const selected = accounts.currentDefaultAccount!;
				api.accountName = selected.accountName;
				const client = new class extends mock<IGitHubAccountClient>() {
					override readonly onDidInvalidate = clientInvalidated.event;
					override readonly onDidChangeCredentials = Event.fromDOMEventEmitter<void>(credentialLifetime.signal, 'abort');
					override readonly authorization = { providerId: 'github', sessionId: selected.sessionId, scopes: ['repo'] };
					override readonly automations = api;
					override readonly tasks = new class extends mock<ITasksClient>() {
						override get(_id: string, _signal: AbortSignal, options?: ApiRequestOptions): Promise<Task> { return api.getTask(options); }
						override async abort(): Promise<void> { api.mutations.push('stop'); }
					}();
					override dispose(): void { release.dispose(); }
				}();
				const release = toDisposable(() => leases.released++);
				leases.acquired++;
				return client;
			}
		}();
		const store = disposables.add(new GitHubCloudAutomationStore(resolveRepositoryUri, service, accounts, storage, new NullLogService(), recents));
		const changeAccount = (value: IDefaultAccount | null) => {
			accounts.currentDefaultAccount = value;
			accountChanged.fire(value);
		};
		return { store, api, accounts, recents, storage, changeAccount, clientChanged, clientInvalidated, credentialLifetime, leases, acquisitionStarted, delayAcquisition: (promise: Promise<void>) => { acquisition = promise; } };
	}

	test('construction, account changes and observing the cache do not fetch or poll', () => runWithFakedTimers({}, async () => {
		const { store, api, recents, changeAccount } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		disposables.add(autorun(reader => store.entries.read(reader)));
		changeAccount(account);
		await timeout(60_000);
		assert.deepStrictEqual({ calls: api.calls, entries: store.entries.get(), state: store.catalogueState.get() }, {
			calls: [], entries: [], state: 'loading',
		});
	}));

	for (const background of [false, true]) {
		test(`catalogue and history preserve the requested priority (background=${background})`, async () => {
			const { store, api, recents } = setup();
			recents.workspaces = [recentWorkspace(workspace)];
			api.definitions.set(repository.repo, [definition]);
			api.tasks = [{ id: 'task-1', automation_id: definition.id, state: 'in_progress', created_at: definition.created_at, remote_steerable: false }];
			api.taskDetail = api.tasks[0];
			const options = background ? { background: true } : undefined;
			await store.refresh(options);
			await store.refreshHistory(options);
			assert.deepStrictEqual(api.priorities, ['capability', 'list', 'get', 'history', 'task'].map(method => ({
				method, priority: background ? 'background' : undefined,
			})));

			api.priorities.length = 0;
			await store.create(workspace, createValue);
			assert.deepStrictEqual(api.priorities, [{ method: 'capability', priority: undefined }]);
		});
	}

	test('checks only the requested folder and resolves a canonical repository without discovery', async () => {
		const { store, api } = setup(() => workspace);
		const target = store.getWorkspaceTarget(URI.file('/repo'));
		assert.ok(target.get().disabledReason);
		await timeout(0);
		assert.deepStrictEqual({
			target: target.get(), calls: api.calls.map(call => call.method), entries: store.entries.get(),
			cached: target === store.getWorkspaceTarget(URI.file('/repo')),
		}, { target: { workspace, repositoryLabel: 'microsoft/vscode-internalbacklog' }, calls: ['capability'], entries: [], cached: true });
	});

	test('background refresh updates cached repository eligibility in both directions', async () => {
		const { store, api } = setup();
		const target = store.getWorkspaceTarget(workspace);
		await timeout(0);

		api.manageability.set(repository.repo, false);
		await store.refresh({ background: true });
		const unavailable = target.get();

		api.manageability.set(repository.repo, true);
		await store.refresh({ background: true });
		assert.deepStrictEqual({
			unavailable: { blocked: !!unavailable.disabledReason, repository: unavailable.isRepository, workspace: unavailable.workspace },
			available: target.get().workspace?.toString(),
			calls: api.calls.map(call => call.method),
		}, {
			unavailable: { blocked: true, repository: true, workspace: undefined },
			available: workspace.toString(),
			calls: ['capability', 'capability', 'capability', 'list'],
		});
	});

	for (const manageability of [false, new Error('Offline')]) {
		test(`fails closed for ${manageability === false ? 'unmanageable' : 'unverifiable'} repositories`, async () => {
			const { store, api } = setup();
			api.manageability.set(repository.repo, manageability);
			const target = store.getWorkspaceTarget(workspace);
			await timeout(0);
			assert.deepStrictEqual({ blocked: !!target.get().disabledReason, repository: target.get().isRepository, workspace: target.get().workspace, calls: api.calls.map(call => call.method) }, {
				blocked: true, repository: true, workspace: undefined, calls: ['capability'],
			});
		});
	}

	test('does not classify repository resolution failures as repositories', async () => {
		const { store } = setup(() => { throw new Error('Resolution failed'); });
		const target = store.getWorkspaceTarget(URI.file('/not-a-repository'));
		await timeout(0);
		assert.deepStrictEqual({
			blocked: !!target.get().disabledReason,
			repository: target.get().isRepository,
			workspace: target.get().workspace,
		}, {
			blocked: true,
			repository: false,
			workspace: undefined,
		});
	});

	test('temporarily suppresses repeated failed capability checks and retries after expiry', async () => {
		const clock = useFakeTimers();
		const { store, api } = setup();
		try {
			api.manageability.set(repository.repo, new Error('Offline'));
			const first = await store.isRepositoryManageable(repository, CancellationToken.None);
			const second = await store.isRepositoryManageable(repository, CancellationToken.None);
			const callsBeforeExpiry = api.calls.length;
			await clock.tickAsync(30_000);
			const third = await store.isRepositoryManageable(repository, CancellationToken.None);
			assert.deepStrictEqual({ first, second, third, callsBeforeExpiry, calls: api.calls.length }, {
				first: false, second: false, third: false, callsBeforeExpiry: 1, calls: 2,
			});
		} finally {
			clock.restore();
		}
	});

	test('successful capability checks clear transient failure suppression', async () => {
		const { store, api } = setup();
		api.manageability.set(repository.repo, new Error('Offline'));
		await store.isRepositoryManageable(repository, CancellationToken.None);
		await store.refresh();
		api.manageability.set(repository.repo, true);
		assert.strictEqual(await store.isRepositoryManageable(repository, CancellationToken.None), true);
		assert.strictEqual(api.calls.filter(call => call.method === 'capability').length, 2);
	});

	test('cancelled capability checks do not enter transient failure suppression', async () => {
		const { store, api } = setup();
		const pending = new DeferredPromise<boolean>();
		api.manageability.set(repository.repo, pending.p);
		const source = disposables.add(new CancellationTokenSource());
		const first = assert.rejects(store.isRepositoryManageable(repository, source.token), isCancellationError);
		await api.manageabilityStarted.p;
		source.cancel();
		await pending.complete(true);
		await first;
		api.manageability.set(repository.repo, new Error('Offline'));
		assert.strictEqual(await store.isRepositoryManageable(repository, CancellationToken.None), false);
		assert.strictEqual(api.calls.filter(call => call.method === 'capability').length, 2);
	});

	test('bounds transient capability failure suppression', async () => {
		const { store, api } = setup();
		for (let index = 0; index <= 100; index++) {
			const ref = { owner: 'owner', repo: `repo-${index}` };
			api.manageability.set(ref.repo, new Error('Offline'));
			await store.isRepositoryManageable(ref, CancellationToken.None);
		}
		const first = { owner: 'owner', repo: 'repo-0' };
		await store.isRepositoryManageable(first, CancellationToken.None);
		assert.strictEqual(api.calls.filter(call => call.method === 'capability').length, 102);
	});

	for (const invalidate of ['account', 'dispose'] as const) {
		test(`invalidates observed eligibility on ${invalidate} and ignores late responses`, async () => {
			const { store, api, changeAccount } = setup();
			const pending = new DeferredPromise<boolean>();
			api.manageability.set(repository.repo, pending.p);
			const target = store.getWorkspaceTarget(workspace);
			await timeout(0);
			if (invalidate === 'account') {
				changeAccount({ ...account, sessionId: 'other-session' });
			} else {
				store.dispose();
			}
			await pending.complete(true);
			await timeout(0);
			assert.deepStrictEqual({ blocked: !!target.get().disabledReason, workspace: target.get().workspace, cancelled: api.calls[0].token.aborted }, {
				blocked: true, workspace: undefined, cancelled: true,
			});
		});
	}

	test('bounds parallel eligibility reads and never enumerates account repositories', async () => {
		const { store, api } = setup();
		const pending = new DeferredPromise<boolean>();
		for (let i = 0; i < 12; i++) {
			api.manageability.set(`repo-${i}`, pending.p);
			store.getWorkspaceTarget(URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/owner/repo-${i}/HEAD` }));
		}
		await timeout(0);
		assert.strictEqual(api.calls.length, 5);
		await pending.complete(true);
		await timeout(0);
		assert.deepStrictEqual(api.calls.map(call => call.method), Array(12).fill('capability'));
	});

	test('coordinates create, preflight update, acknowledgement-only run and deletion', async () => {
		const { store, api } = setup();
		const entry = await store.create(workspace, createValue);
		const conflict = await store.update(entry, () => undefined);
		const updated = await store.update(entry, current => ({ name: `${current.name} updated` }));
		assert.ok(updated.updated);
		const acknowledgement = await store.run(updated.entry);
		await store.delete(updated.entry);
		assert.deepStrictEqual({
			conflict, updated: updated.entry.definition.name, acknowledgement,
			mutations: api.mutations, entries: store.entries.get(), history: store.history.get(),
		}, {
			conflict: { entry, updated: false }, updated: 'Review updated', acknowledgement: undefined,
			mutations: ['create', 'update', 'run', 'delete'], entries: [], history: [],
		});
	});

	test('pre-dispatch guards and repository manageability prevent mutations', async () => {
		const { store, api } = setup();
		await assert.rejects(store.create(workspace, createValue, () => { throw new Error('Disabled'); }), /Disabled/);
		api.manageability.set(repository.repo, false);
		await assert.rejects(store.create(workspace, createValue), /cannot be managed/);
		assert.deepStrictEqual(api.mutations, []);
	});

	test('a run cancelled while queued rejects with a cancellation error without dispatching', async () => {
		const { store, api, recents } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		const pending = new DeferredPromise<readonly AutomationDetail[]>();
		api.definitions.set(repository.repo, pending.p);
		const refresh = store.refresh();
		await api.listStarted.p;
		const source = disposables.add(new CancellationTokenSource());
		const rejected = assert.rejects(store.run({ repository, definition }, source.token), isCancellationError);
		source.cancel();
		await pending.complete([definition]);
		await Promise.all([refresh, rejected]);

		assert.deepStrictEqual({ mutations: api.mutations, uncertain: store.mutationUncertain.get() }, { mutations: [], uncertain: false });
	});

	test('a run cancelled during client acquisition rejects with a cancellation error and can be retried', async () => {
		const { store, api, delayAcquisition, acquisitionStarted, leases } = setup();
		const pending = new DeferredPromise<void>();
		delayAcquisition(pending.p);
		const source = disposables.add(new CancellationTokenSource());
		const rejected = assert.rejects(store.run({ repository, definition }, source.token), isCancellationError);
		await acquisitionStarted.p;
		source.cancel();
		await pending.complete();
		await rejected;
		await store.run({ repository, definition });

		assert.deepStrictEqual({ mutations: api.mutations, uncertain: store.mutationUncertain.get(), leases }, {
			mutations: ['run'], uncertain: false, leases: { acquired: 2, released: 1 },
		});
	});

	test('uncertain mutations block retries until an explicit successful refresh', async () => {
		const { store, api } = setup();
		const cause = api.mutationResult = new MutationUncertainError('unknown');
		await assert.rejects(store.create(workspace, createValue), error => error instanceof AutomationMutationUncertainError && error.cause === cause && error.message === reconciliationMessage);
		await assert.rejects(store.create(workspace, createValue), AutomationMutationUncertainError);
		await store.refresh();
		api.mutationResult = definition;
		await store.create(workspace, createValue);
		assert.deepStrictEqual({ mutations: api.mutations, uncertain: store.mutationUncertain.get() }, { mutations: ['create', 'create'], uncertain: false });
	});

	test('refresh cannot overwrite a later mutation and queued old-account work never dispatches', async () => {
		const { store, api, recents, changeAccount } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		const pending = new DeferredPromise<readonly AutomationDetail[]>();
		api.definitions.set(repository.repo, pending.p);
		const refresh = store.refresh();
		await api.listStarted.p;
		const created = store.create(workspace, createValue);
		const refreshRejected = assert.rejects(refresh, isCancellationError);
		const createRejected = assert.rejects(created, isCancellationError);
		changeAccount({ ...account, sessionId: 'new-session' });
		await pending.complete([]);
		await Promise.all([refreshRejected, createRejected]);
		assert.deepStrictEqual({ mutations: api.mutations, entries: store.entries.get() }, { mutations: [], entries: [] });
	});

	test('indeterminate HTTP failures replace unknown transport text with reconciliation guidance and retain the cause', async () => {
		const { store, api } = setup();
		const cause = api.mutationResult = new ApiRequestError(503, 'unknown', { message: 'unknown', documentation_url: 'https://docs.github.com' }, undefined, undefined, 'indeterminate');
		await assert.rejects(store.create(workspace, createValue), error => error instanceof AutomationMutationUncertainError && error.cause === cause && error.message === reconciliationMessage);
		await assert.rejects(store.create(workspace, createValue), AutomationMutationUncertainError);
		await store.refresh();
		api.mutationResult = definition;
		await store.create(workspace, createValue);
		assert.deepStrictEqual({ mutations: api.mutations, uncertain: store.mutationUncertain.get() }, {
			mutations: ['create', 'create'], uncertain: false,
		});
	});

	test('definite API failures retain their original error and do not block future mutations', async () => {
		const { store, api } = setup();
		const cause = api.mutationResult = new ApiRequestError(403, 'unknown');
		await assert.rejects(store.create(workspace, createValue), error => error === cause);
		assert.strictEqual(store.mutationUncertain.get(), false);
	});

	test('discards late mutation responses after account rotation', async () => {
		const { store, api, changeAccount } = setup();
		const pending = new DeferredPromise<AutomationDetail>();
		api.mutationResult = pending.p;
		const create = store.create(workspace, createValue);
		await timeout(0);
		const rejected = assert.rejects(create, isCancellationError);
		changeAccount({ ...account, sessionId: 'rotated' });
		await pending.complete(definition);
		await rejected;
		assert.deepStrictEqual(store.entries.get(), []);
	});

	test('missing definitions do not block remaining history or definition readiness', async () => {
		const { store, api, recents } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		api.definitions.set(repository.repo, [definition, { ...definition, id: 'deleted' }]);
		await store.refresh();
		api.historyErrors.set('deleted', new ApiRequestError(404, 'notFound'));
		api.tasks = [{ id: 'run', state: 'completed', created_at: definition.created_at, remote_steerable: true }];
		await store.refreshHistory();
		assert.deepStrictEqual({
			state: store.catalogueState.get(), definitions: store.entries.get().map(entry => entry.definition.id),
			history: store.history.get().map(row => row.task.id),
		}, { state: 'ready', definitions: [definition.id], history: ['run'] });
	});

	test('history refresh bounds detail concurrency and cancels queued work on disposal', async () => {
		const { store, api, recents } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		api.definitions.set(repository.repo, Array.from({ length: 10 }, (_, i) => ({ ...definition, id: `definition-${i}` })));
		await store.refresh();
		const task: Task = { id: 'task', state: 'in_progress', created_at: definition.created_at, remote_steerable: true };
		api.tasks = [task];
		const pending = new DeferredPromise<Task>();
		api.taskDetail = pending.p;
		const refresh = store.refreshHistory();
		await api.detailStarted.p;
		const rejected = assert.rejects(refresh, isCancellationError);
		store.dispose();
		await pending.complete(task);
		await rejected;
		assert.deepStrictEqual({ maxActive: api.maxActiveDetails, history: store.history.get() }, { maxActive: 4, history: [] });
	});

	test('history projects authoritative detail without inventing manual-run correlation', async () => {
		const { store, api } = setup();
		const entry = await store.create(workspace, createValue);
		api.tasks = [{ id: 'task', state: 'in_progress', created_at: definition.created_at, remote_steerable: true }];
		api.taskDetail = { ...api.tasks[0], state: 'waiting_for_user' };
		await store.run(entry);
		assert.deepStrictEqual(store.history.get(), []);
		await store.refreshHistory();
		assert.deepStrictEqual(store.history.get(), [{ entry, task: api.taskDetail }]);
		await store.stop(store.history.get()[0]);
		assert.deepStrictEqual(api.mutations, ['create', 'run', 'stop']);
	});

	test('credential renewal does not invalidate an otherwise successful operation', async () => {
		const { store, api, credentialLifetime, leases } = setup();
		const pending = new DeferredPromise<boolean>();
		api.manageability.set(repository.repo, pending.p);
		const create = store.create(workspace, createValue);
		await api.manageabilityStarted.p;
		credentialLifetime.abort();
		await pending.complete(true);
		await create;
		assert.deepStrictEqual({ mutations: api.mutations, entries: store.entries.get(), leases }, {
			mutations: ['create'], entries: [{ repository, definition }], leases: { acquired: 1, released: 0 },
		});
	});

	test('grant changes discard pending history and release leases', async () => {
		const { store, api, clientChanged, leases } = setup();
		await store.create(workspace, createValue);
		const task: Task = { id: 'task', state: 'in_progress', created_at: definition.created_at, remote_steerable: true };
		api.tasks = [task];
		const pending = new DeferredPromise<Task>();
		api.taskDetail = pending.p;
		const refresh = store.refreshHistory();
		await api.detailStarted.p;
		const rejected = assert.rejects(refresh, isCancellationError);
		clientChanged.fire();
		await pending.complete(task);
		await rejected;
		assert.deepStrictEqual({ history: store.history.get(), entries: store.entries.get(), leases }, {
			history: [], entries: [], leases: { acquired: 1, released: 1 },
		});
	});

	test('discovers only recent GitHub.com repositories and coalesces local, branch and case aliases', async () => {
		const local = URI.file('C:\\workspace');
		const { store, api, recents, storage } = setup(uri => uri.toString() === local.toString() ? workspace : undefined);
		recents.workspaces = [
			recentWorkspace(local),
			recentWorkspace(workspace.with({ path: '/MICROSOFT/VSCODE-INTERNALBACKLOG/refs/heads/feature' })),
			recentWorkspace(workspace),
			recentWorkspace(workspace.with({ authority: 'enterprise.example' })),
			recentWorkspace(URI.file('C:\\unresolved')),
			recentWorkspace(URI.parse('https://github.com/microsoft/vscode')),
			upcastDeepPartial<IRecentWorkspace>({ workspace: { folders: [] } }),
		];
		await store.refresh();
		assert.deepStrictEqual({
			calls: api.calls.map(({ method, account, repository }) => ({ method, account, repository })),
			entries: store.entries.get(), stored: JSON.parse(storage.get(storageKey, StorageScope.PROFILE)!),
		}, {
			calls: [{ method: 'capability', account: 'octocat', repository }, { method: 'list', account: 'octocat', repository }],
			entries: [{ repository, definition }], stored: [storedRepository],
		});
	});

	test('creation persists repository references for subsequent explicit refreshes', async () => {
		const { store, api, storage } = setup();
		await store.create(workspace, createValue);
		assert.deepStrictEqual({
			methods: api.calls.map(call => call.method), entries: store.entries.get(),
			stored: JSON.parse(storage.get(storageKey, StorageScope.PROFILE)!),
		}, { methods: ['capability'], entries: [{ repository, definition }], stored: [storedRepository] });
		const updated = { ...definition, name: 'Updated on GitHub' };
		api.definitions.set(repository.repo, [updated]);
		await store.refresh();
		assert.deepStrictEqual(store.entries.get(), [{ repository, definition: updated }]);
	});

	test('retains one default client lease across refreshes and releases it on disposal', async () => {
		const { store, recents, leases } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		await store.refresh();
		await store.refresh();
		assert.deepStrictEqual(leases, { acquired: 1, released: 0 });
		store.dispose();
		assert.deepStrictEqual(leases, { acquired: 1, released: 1 });
	});

	test('a page limit error preserves the complete catalogue without hydrating partial results', async () => {
		const { store, api, recents, leases } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		await store.refresh();
		api.definitions.set(repository.repo, new PaginationLimitError(10));
		await assert.rejects(store.refresh(), /Some GitHub repositories/);
		assert.deepStrictEqual({
			entries: store.entries.get(),
			state: store.catalogueState.get(),
			leases,
			listCalls: api.calls.filter(call => call.method === 'list').length,
			detailIds: api.detailCalls.map(call => call.id),
		}, {
			entries: [{ repository, definition }], state: 'error', leases: { acquired: 1, released: 0 },
			listCalls: 2,
			detailIds: [definition.id],
		});
	});

	test('hydrates summaries in order with at most five pending detail reads', async () => {
		const { store, api, recents } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		const definitions = Array.from({ length: 12 }, (_, index) => ({ ...definition, id: `automation-${index}` }));
		api.definitions.set(repository.repo, definitions);
		const firstBatch = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		let pending = 0;
		let maximum = 0;
		api.detailResult = async id => {
			maximum = Math.max(maximum, ++pending);
			if (pending === 5) {
				await firstBatch.complete();
			}
			await release.p;
			pending--;
			return definitions.find(value => value.id === id)!;
		};
		const refresh = store.refresh();
		await firstBatch.p;
		assert.strictEqual(api.detailCalls.length, 5);
		await release.complete();
		await refresh;
		assert.deepStrictEqual({ ids: store.entries.get().map(entry => entry.definition.id), maximum }, {
			ids: definitions.map(value => value.id), maximum: 5,
		});
	});

	test('a failed detail cancels sibling reads without starting the next batch', async () => {
		const { store, api, recents } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		api.definitions.set(repository.repo, Array.from({ length: 6 }, (_, index) => ({ ...definition, id: `automation-${index}` })));
		api.detailResult = async id => {
			if (id === 'automation-0') {
				throw new Error('Detail unavailable');
			}
			return { ...definition, id };
		};
		await assert.rejects(store.refresh(), /Some GitHub repositories/);
		assert.deepStrictEqual({
			details: api.detailCalls.map(call => ({ id: call.id, cancelled: call.signal.aborted })),
			entries: store.entries.get(),
		}, {
			details: Array.from({ length: 5 }, (_, index) => ({ id: `automation-${index}`, cancelled: true })),
			entries: [],
		});
	});

	test('client invalidation releases the retained lease and reacquires on the next refresh', async () => {
		const { store, recents, clientInvalidated, leases } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		await store.refresh();
		clientInvalidated.fire();
		assert.deepStrictEqual({ entries: store.entries.get(), leases: { ...leases } }, {
			entries: [], leases: { acquired: 1, released: 1 },
		});
		await store.refresh();
		assert.deepStrictEqual(leases, { acquired: 2, released: 1 });
	});

	test('shared-service grant changes clear the cache even when the default account is unchanged', async () => {
		const { store, recents, clientChanged } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		await store.refresh();
		clientChanged.fire();
		assert.deepStrictEqual({ entries: store.entries.get(), state: store.catalogueState.get() }, { entries: [], state: 'loading' });
	});

	test('releases a late client lease without making requests after account reset', async () => {
		const { store, api, changeAccount, delayAcquisition, acquisitionStarted, leases } = setup();
		const pending = new DeferredPromise<void>();
		delayAcquisition(pending.p);
		const refresh = store.refresh();
		const rejected = assert.rejects(refresh, isCancellationError);
		await acquisitionStarted.p;
		changeAccount(account);
		await pending.complete();
		await rejected;
		assert.deepStrictEqual({ calls: api.calls, leases }, { calls: [], leases: { acquired: 1, released: 1 } });
	});

	test('client invalidation prevents a late domain response from publishing', async () => {
		const { store, api, recents, clientInvalidated, leases } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		const pending = new DeferredPromise<readonly AutomationDetail[]>();
		api.definitions.set(repository.repo, pending.p);
		const refresh = store.refresh();
		await api.listStarted.p;
		const rejected = assert.rejects(refresh, isCancellationError);
		clientInvalidated.fire();
		await pending.complete([definition]);
		await rejected;
		assert.deepStrictEqual({ entries: store.entries.get(), state: store.catalogueState.get(), leases }, {
			entries: [], state: 'loading', leases: { acquired: 1, released: 1 },
		});
	});

	test('collects pages through the real shared domain using the selected grant and both ownership kinds', async () => {
		const secondDefinition = { ...definition, id: 'automation-2' };
		const requests: { url: string; integration: string | null }[] = [];
		const engine = disposables.add(new GitHubService({
			credentialProvider: {
				onDidChange: Event.None,
				getToken: authorization => {
					assert.deepStrictEqual(authorization, { providerId: 'github', sessionId: account.sessionId, scopes: ['repo'] });
					return 'test-token';
				},
			},
			fetch: async (input, init) => {
				const url = new URL(String(input));
				requests.push({ url: url.href, integration: new Headers(init?.headers).get('Copilot-Integration-Id') });
				let data: object;
				const headers = new Headers();
				if (url.pathname === '/user') {
					data = { id: 101 };
				} else if (url.pathname === '/agents/repos/microsoft/vscode-internalbacklog/automations/configuration') {
					data = {
						automations_enabled: true,
						can_manage_automations: true,
						allow_read_access_triggers: false,
						require_trigger_scoped_writes: false,
					};
				} else if (url.pathname.endsWith('/automation-1')) {
					data = definition;
				} else if (url.pathname.endsWith('/automation-2')) {
					data = secondDefinition;
				} else if (url.searchParams.get('page') === '2') {
					assert.strictEqual(url.href, 'https://api.githubcopilot.com/agents/repos/microsoft/vscode-internalbacklog/automations/v2?page=2&per_page=100');
					data = { automations: [secondDefinition], total_count: 2 };
				} else {
					assert.strictEqual(url.href, 'https://api.githubcopilot.com/agents/repos/microsoft/vscode-internalbacklog/automations/v2?page=1&per_page=100');
					data = { automations: [definition], total_count: 2 };
					headers.set('Link', '<https://api.githubcopilot.com/agents/repos/microsoft/vscode-internalbacklog/automations/v2?page=2&per_page=100>; rel="next"');
				}
				return new Response(JSON.stringify(data), { status: 200, headers });
			},
		}, new NullLogService(), NullTelemetryService));
		const connected = disposables.add(new Emitter<ClientConnectionEvent>());
		const server = disposables.add(new IPCServer<string>(connected.event));
		disposables.add(registerGitHubChannel(server, engine));
		const connection = disposables.add(new TestConnection(connected, 'automation-window'));
		connection.registerCredentials(new class extends mock<IGitHubCredentialBroker>() {
			override readonly onDidChange = Event.None;
			override readonly onDidChangeToken = Event.None;
			override async resolveClient() {
				return {
					authorization: { providerId: 'github', sessionId: account.sessionId, accountId: 'account', scopes: ['repo'] },
					apiBaseUri: 'https://api.github.com', graphQlUri: 'https://api.github.com/graphql',
					missionControl: { endpoint: { apiBaseUri: 'https://api.githubcopilot.com/agents', integrationId: COPILOT_INTEGRATION_ID } },
				};
			}
			override getToken() { return 'test-token'; }
		}());
		const remote = new GitHubChannelClient(connection.channel, new NullLogService());
		const service = new class extends mock<IWorkbenchGitHubService>() {
			override readonly onDidChangeDefaultClient = Event.None;
			override acquireDefaultAccountApiClient(signal: AbortSignal) {
				return remote.acquireClient({ providerId: 'github', sessionId: account.sessionId, scopes: ['repo'] }, signal);
			}
		}();
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new GitHubCloudAutomationStore(() => undefined, service,
			new class extends mock<IDefaultAccountService>() {
				override currentDefaultAccount = account;
				override readonly onDidChangeDefaultAccount = Event.None;
			}(), storage, new NullLogService(),
			new class extends mock<ISessionsRecentWorkspacesService>() {
				override getRecentWorkspaces() { return [recentWorkspace(workspace)]; }
			}(),
		));
		await store.refresh();
		assert.deepStrictEqual({ entries: store.entries.get(), requests }, {
			entries: [{ repository, definition }, { repository, definition: secondDefinition }],
			requests: [
				{ url: 'https://api.github.com/user', integration: null },
				{ url: 'https://api.githubcopilot.com/agents/repos/microsoft/vscode-internalbacklog/automations/configuration', integration: COPILOT_INTEGRATION_ID },
				{ url: 'https://api.githubcopilot.com/agents/repos/microsoft/vscode-internalbacklog/automations/v2?page=1&per_page=100', integration: COPILOT_INTEGRATION_ID },
				{ url: 'https://api.githubcopilot.com/agents/repos/microsoft/vscode-internalbacklog/automations/v2?page=2&per_page=100', integration: COPILOT_INTEGRATION_ID },
				{ url: 'https://api.githubcopilot.com/agents/repos/microsoft/vscode-internalbacklog/automations/automation-1', integration: COPILOT_INTEGRATION_ID },
				{ url: 'https://api.githubcopilot.com/agents/repos/microsoft/vscode-internalbacklog/automations/automation-2', integration: COPILOT_INTEGRATION_ID },
			],
		});
	});

	test('awaits cold local repository resolution before discovery', async () => {
		const resolved = new DeferredPromise<URI>();
		const { store, api, recents } = setup(() => resolved.p);
		recents.workspaces = [recentWorkspace(URI.file('C:\\cold-repository'))];
		const refresh = store.refresh();
		assert.deepStrictEqual(api.calls, []);
		await resolved.complete(workspace);
		await refresh;
		assert.deepStrictEqual(store.entries.get(), [{ repository, definition }]);
	});

	test('account changes during local resolution prevent discovery and creation dispatch', async () => {
		const resolved = new DeferredPromise<URI>();
		const { store, api, recents, changeAccount } = setup(() => resolved.p);
		const local = URI.file('C:\\cold-repository');
		recents.workspaces = [recentWorkspace(local)];
		const refresh = assert.rejects(store.refresh(), isCancellationError);
		const create = assert.rejects(store.create(local, createValue), isCancellationError);
		changeAccount({ ...account, sessionId: 'rotated' });
		await resolved.complete(workspace);
		await Promise.all([refresh, create]);
		assert.deepStrictEqual({ calls: api.calls, mutations: api.mutations }, { calls: [], mutations: [] });
	});

	test('client invalidation during local resolution cannot move creation into the new lifetime', async () => {
		const resolved = new DeferredPromise<URI>();
		const { store, api, clientInvalidated } = setup(() => resolved.p);
		await store.refresh();
		const create = assert.rejects(store.create(URI.file('C:\\cold-repository'), createValue), isCancellationError);
		clientInvalidated.fire();
		await resolved.complete(workspace);
		await create;
		assert.deepStrictEqual({ calls: api.calls, mutations: api.mutations, entries: store.entries.get() }, {
			calls: [], mutations: [], entries: [],
		});
	});

	test('client invalidation prevents a late creation from publishing into the reset store', async () => {
		const { store, api, clientInvalidated } = setup();
		const pending = new DeferredPromise<AutomationDetail>();
		api.mutationResult = pending.p;
		const create = store.create(workspace, createValue);
		await timeout(0);
		const rejected = assert.rejects(create, isCancellationError);
		clientInvalidated.fire();
		await pending.complete(definition);
		await rejected;
		assert.deepStrictEqual({ mutations: api.mutations, entries: store.entries.get() }, { mutations: ['create'], entries: [] });
	});

	test('skips unmanageable repositories and rechecks known repository capability on refresh', async () => {
		const { store, api, recents } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		await store.refresh();
		api.manageability.set(repository.repo, false);
		await store.refresh();
		await assert.rejects(store.create(workspace, createValue), /cannot be managed/);
		assert.deepStrictEqual({ entries: store.entries.get(), state: store.catalogueState.get(), methods: api.calls.map(call => call.method) }, {
			entries: [], state: 'ready', methods: ['capability', 'list', 'capability', 'capability'],
		});
	});

	test('rejects unsupported creation without requests or stored references', async () => {
		const { store, api, storage } = setup();
		await assert.rejects(store.create(workspace.with({ authority: 'enterprise.example' }), createValue), /GitHub.com repository/);
		assert.deepStrictEqual({ calls: api.calls, stored: storage.get(storageKey, StorageScope.PROFILE) }, { calls: [], stored: undefined });
	});

	test('publishes loading synchronously and coalesces refreshes', async () => {
		const { store, api, recents } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		const pending = new DeferredPromise<readonly AutomationDetail[]>();
		api.definitions.set(repository.repo, pending.p);
		const states: string[] = [];
		disposables.add(autorun(reader => states.push(store.catalogueState.read(reader))));
		const first = store.refresh();
		assert.strictEqual(store.catalogueState.get(), 'loading');
		const second = store.refresh();
		await api.listStarted.p;
		await pending.complete([definition]);
		await Promise.all([first, second]);
		assert.deepStrictEqual({ states, methods: api.calls.map(call => call.method) }, {
			states: ['loading', 'ready'], methods: ['capability', 'list'],
		});
	});

	test('refresh replaces web updates and deletions without interpreting server-owned triggers', async () => {
		const { store, api, recents } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		await store.refresh();
		const updated = { ...definition, name: 'Updated on GitHub' };
		api.definitions.set(repository.repo, [updated]);
		await store.refresh();
		assert.deepStrictEqual(store.entries.get(), [{ repository, definition: updated }]);
		api.definitions.set(repository.repo, []);
		await store.refresh();
		assert.deepStrictEqual({ entries: store.entries.get(), state: store.catalogueState.get() }, { entries: [], state: 'ready' });
	});

	test('partial failure retains the failed repository cache and publishes healthy updates', async () => {
		const { store, api, recents } = setup();
		const other = { owner: 'microsoft', repo: 'other' };
		recents.workspaces = [recentWorkspace(workspace), recentWorkspace(workspace.with({ path: '/microsoft/other/HEAD' }))];
		await store.refresh();
		api.definitions.set(repository.repo, [{ ...definition, name: 'Updated' }]);
		api.definitions.set(other.repo, new Error('Network failed'));
		await assert.rejects(store.refresh(), /Some GitHub repositories/);
		assert.deepStrictEqual({ entries: store.entries.get(), state: store.catalogueState.get() }, {
			entries: [{ repository, definition: { ...definition, name: 'Updated' } }, { repository: other, definition }],
			state: 'error',
		});
		api.definitions.set(other.repo, []);
		await store.refresh();
		assert.deepStrictEqual({ entries: store.entries.get(), state: store.catalogueState.get() }, {
			entries: [{ repository, definition: { ...definition, name: 'Updated' } }], state: 'ready',
		});
	});

	test('failed recent repository discovery does not discard a known catalogue', async () => {
		const { store, api, recents } = setup();
		await store.create(workspace, createValue);
		recents.workspaces = [recentWorkspace(workspace.with({ path: '/microsoft/inaccessible/HEAD' }))];
		api.manageability.set('inaccessible', new Error('Access denied'));
		await assert.rejects(store.refresh(), /Some GitHub repositories/);
		assert.deepStrictEqual({ entries: store.entries.get(), state: store.catalogueState.get() }, {
			entries: [{ repository, definition }], state: 'error',
		});
	});

	test('repository resolution failures are errors, not an empty successful catalogue', async () => {
		const { store, recents } = setup(() => { throw new Error('Resolution failed'); });
		recents.workspaces = [recentWorkspace(URI.file('C:\\workspace'))];
		await assert.rejects(store.refresh(), /Some GitHub repositories/);
		assert.strictEqual(store.catalogueState.get(), 'error');
	});

	for (const stored of ['{', '{}', '[null]', '[{"owner":"microsoft","name":""}]']) {
		test(`reports corrupt repository references without overwriting them: ${stored}`, async () => {
			const { store, api, storage } = setup();
			storage.store(storageKey, stored, StorageScope.PROFILE, StorageTarget.MACHINE);
			await assert.rejects(store.refresh());
			assert.deepStrictEqual({ state: store.catalogueState.get(), stored: storage.get(storageKey, StorageScope.PROFILE), calls: api.calls }, {
				state: 'error', stored, calls: [],
			});
		});
	}

	test('account-scoped references survive switching accounts but definitions do not', async () => {
		const { store, api, changeAccount } = setup();
		await store.create(workspace, createValue);
		await store.refresh();
		changeAccount({ ...account, accountName: 'other', sessionId: 'auth-2' });
		assert.deepStrictEqual(store.entries.get(), []);
		await store.refresh();
		assert.deepStrictEqual({ entries: store.entries.get(), accounts: api.calls.map(call => call.account) }, {
			entries: [], accounts: ['octocat', 'octocat', 'octocat'],
		});
		changeAccount(account);
		await store.refresh();
		assert.deepStrictEqual(store.entries.get(), [{ repository, definition }]);
	});

	test('restores stored owner/name references without changing their persisted shape', async () => {
		const { store, storage } = setup();
		storage.store(storageKey, JSON.stringify([storedRepository]), StorageScope.PROFILE, StorageTarget.MACHINE);
		await store.refresh();
		assert.deepStrictEqual({
			entries: store.entries.get(),
			stored: JSON.parse(storage.get(storageKey, StorageScope.PROFILE)!),
		}, {
			entries: [{ repository, definition }],
			stored: [storedRepository],
		});
	});

	for (const reset of ['account', 'same account', 'sign out', 'dispose'] as const) {
		test(`cancels and discards in-flight definitions on ${reset}`, async () => {
			const { store, api, recents, changeAccount, storage } = setup();
			recents.workspaces = [recentWorkspace(workspace), recentWorkspace(workspace.with({ path: '/microsoft/queued/HEAD' }))];
			const pending = new DeferredPromise<readonly AutomationDetail[]>();
			api.definitions.set(repository.repo, pending.p);
			const refresh = store.refresh();
			await api.listStarted.p;
			const rejected = assert.rejects(refresh, isCancellationError);
			if (reset === 'dispose') {
				store.dispose();
			} else {
				changeAccount(reset === 'sign out' ? null : reset === 'same account' ? account : { ...account, accountName: 'other', sessionId: 'auth-2' });
			}
			await pending.complete([definition]);
			await rejected;
			assert.deepStrictEqual({
				entries: store.entries.get(), cancelled: api.calls.map(call => call.token.aborted),
				stored: storage.get(storageKey, StorageScope.PROFILE), state: store.catalogueState.get(),
			}, {
				entries: [], cancelled: [true, true], stored: undefined,
				state: reset === 'sign out' || reset === 'dispose' ? 'unavailable' : 'loading',
			});
		});
	}

	test('a previous account refresh cannot clear or overwrite the new account refresh', async () => {
		const { store, api, recents, changeAccount } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		const old = new DeferredPromise<readonly AutomationDetail[]>();
		api.definitions.set(repository.repo, old.p);
		const first = store.refresh();
		await api.listStarted.p;
		const rejected = assert.rejects(first, isCancellationError);
		changeAccount({ ...account, sessionId: 'auth-2' });
		const current = new DeferredPromise<readonly AutomationDetail[]>();
		api.definitions.set(repository.repo, current.p);
		const second = store.refresh();
		await old.complete([definition]);
		await rejected;
		assert.strictEqual(store.catalogueState.get(), 'loading');
		const coalesced = store.refresh();
		await current.complete([{ ...definition, name: 'New session' }]);
		await Promise.all([second, coalesced]);
		assert.deepStrictEqual({ entries: store.entries.get(), methods: api.calls.map(call => call.method) }, {
			entries: [{ repository, definition: { ...definition, name: 'New session' } }], methods: ['capability', 'list', 'capability', 'list'],
		});
	});

	test('late creation preflight cannot persist repositories or dispatch after an account reset', async () => {
		const { store, api, changeAccount, storage } = setup();
		const pending = new DeferredPromise<boolean>();
		api.manageability.set(repository.repo, pending.p);
		const create = store.create(workspace, createValue);
		await api.manageabilityStarted.p;
		const rejected = assert.rejects(create, isCancellationError);
		changeAccount(account);
		await pending.complete(true);
		await rejected;
		assert.deepStrictEqual({
			stored: storage.get(storageKey, StorageScope.PROFILE), mutations: api.mutations, entries: store.entries.get(),
		}, { stored: undefined, mutations: [], entries: [] });
	});

	test('creation queued during refresh is retained for the next refresh', async () => {
		const { store, api, recents, storage } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		const pending = new DeferredPromise<readonly AutomationDetail[]>();
		api.definitions.set(repository.repo, pending.p);
		const refresh = store.refresh();
		await api.listStarted.p;
		const create = store.create(workspace.with({ path: '/microsoft/other/HEAD' }), createValue);
		await pending.complete([definition]);
		await Promise.all([refresh, create]);
		recents.workspaces = [];
		await store.refresh();
		assert.deepStrictEqual({
			stored: JSON.parse(storage.get(storageKey, StorageScope.PROFILE)!),
			repositories: store.entries.get().map(entry => entry.repository.repo).sort(),
		}, {
			stored: [storedRepository, { owner: 'microsoft', name: 'other' }],
			repositories: ['other', repository.repo].sort(),
		});
	});

	for (const value of [null, { ...account, enterprise: true }]) {
		test(`rejects reads and creation when ${value ? 'signed into enterprise' : 'signed out'}`, async () => {
			const { store, api, changeAccount } = setup();
			changeAccount(value);
			await assert.rejects(store.refresh(), /Sign in to GitHub.com/);
			await assert.rejects(store.create(workspace, createValue), /Sign in to GitHub.com/);
			assert.deepStrictEqual({ calls: api.calls, state: store.catalogueState.get() }, { calls: [], state: 'unavailable' });
		});
	}
});
