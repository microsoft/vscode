/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastDeepPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IRecentWorkspace, ISessionsRecentWorkspacesService } from '../../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../../../services/sessions/common/session.js';
import { CloudAutomationApiClient, CloudAutomationMutationUncertainError, ICloudAutomationDefinition, ICloudAutomationMutation, ICloudAutomationRepository, ICloudAutomationTask } from '../../browser/cloudAutomationApiClient.js';
import { GitHubCloudAutomationStore } from '../../browser/gitHubCloudAutomationStore.js';

const account: IDefaultAccount = { accountName: 'octocat', sessionId: 'auth-1', enterprise: false, authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false } };
const repository = { owner: 'microsoft', name: 'vscode-internalbacklog' };
const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/microsoft/vscode-internalbacklog/HEAD' });
const storageKey = 'cloudAutomations.repositories.octocat';
const definition: ICloudAutomationDefinition = {
	id: 'automation-1', name: 'Review', prompt: 'Review issues.', disabled: true,
	triggers: { custom: { types: ['future-trigger'], future_option: true } },
	created_at: '2026-09-22T00:00:00Z', updated_at: '2026-09-22T00:00:00Z',
};

class TestApi extends mock<CloudAutomationApiClient>() {
	readonly calls: { method: string; account: string; repository: ICloudAutomationRepository; token: CancellationToken }[] = [];
	readonly visibility = new Map<string, boolean | Error | Promise<boolean>>();
	readonly definitions = new Map<string, readonly ICloudAutomationDefinition[] | Error | Promise<readonly ICloudAutomationDefinition[]>>();
	readonly listStarted = new DeferredPromise<void>();
	readonly mutations: string[] = [];
	mutationResult: ICloudAutomationDefinition | Promise<ICloudAutomationDefinition> | Error = definition;
	tasks: readonly ICloudAutomationTask[] = [];
	taskDetail: ICloudAutomationTask | Promise<ICloudAutomationTask> | undefined;
	readonly detailStarted = new DeferredPromise<void>();
	activeDetails = 0;
	maxActiveDetails = 0;

	override async create(): Promise<ICloudAutomationDefinition> {
		this.mutations.push('create');
		if (this.mutationResult instanceof Error) {
			throw this.mutationResult;
		}
		return this.mutationResult;
	}

	override async get(): Promise<ICloudAutomationDefinition> {
		return definition;
	}

	override async update(_account: string, _repository: ICloudAutomationRepository, _id: string, value: ICloudAutomationMutation): Promise<ICloudAutomationDefinition> {
		this.mutations.push('update');
		return { ...definition, ...value };
	}

	override async delete(): Promise<void> {
		this.mutations.push('delete');
	}

	override async run(): Promise<void> {
		this.mutations.push('run');
	}

	override async listRuns(): Promise<readonly ICloudAutomationTask[]> {
		return this.tasks;
	}

	override async getTask(): Promise<ICloudAutomationTask> {
		this.maxActiveDetails = Math.max(this.maxActiveDetails, ++this.activeDetails);
		await this.detailStarted.complete();
		try {
			return await this.taskDetail!;
		} finally {
			this.activeDetails--;
		}
	}

	override async isPrivateRepository(account: string, repository: ICloudAutomationRepository, token: CancellationToken): Promise<boolean> {
		this.calls.push({ method: 'visibility', account, repository, token });
		const result = this.visibility.get(repository.name) ?? true;
		if (result instanceof Error) {
			throw result;
		}
		return result;
	}

	override async requirePrivateRepository(account: string, repository: ICloudAutomationRepository, token: CancellationToken): Promise<void> {
		if (!await this.isPrivateRepository(account, repository, token)) {
			throw new Error('Private repository required.');
		}
	}

	override async list(account: string, repository: ICloudAutomationRepository, token: CancellationToken): Promise<readonly ICloudAutomationDefinition[]> {
		this.calls.push({ method: 'list', account, repository, token });
		const result = this.definitions.get(repository.name) ?? [definition];
		await this.listStarted.complete();
		if (result instanceof Error) {
			throw result;
		}
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
		const store = disposables.add(new GitHubCloudAutomationStore(resolveRepositoryUri, api, accounts, storage, new NullLogService(), recents));
		const changeAccount = (value: IDefaultAccount | null) => {
			accounts.currentDefaultAccount = value;
			accountChanged.fire(value);
		};
		return { store, api, accounts, recents, storage, changeAccount };
	}

	test('construction, account changes and observing the cache do not fetch or poll', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api, recents, changeAccount } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		disposables.add(autorun(reader => store.entries.read(reader)));
		changeAccount(account);
		await timeout(60_000);
		assert.deepStrictEqual({ calls: api.calls, entries: store.entries.get(), state: store.catalogueState.get() }, {
			calls: [], entries: [], state: 'ready',
		});
	}));

	test('coordinates create, preflight update, acknowledgement-only run and deletion', async () => {
		const { store, api } = setup();
		const entry = await store.create(workspace, { name: definition.name, prompt: definition.prompt });
		const conflict = await store.update(entry, () => undefined);
		const updated = await store.update(entry, current => ({ name: `${current.name} updated` }));
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

	test('pre-dispatch guards and public visibility prevent mutations', async () => {
		const { store, api } = setup();
		await assert.rejects(store.create(workspace, {}, () => { throw new Error('Disabled'); }), /Disabled/);
		api.visibility.set(repository.name, false);
		await assert.rejects(store.create(workspace, {}), /Private repository/);
		assert.deepStrictEqual(api.mutations, []);
	});

	test('uncertain mutations block retries until an explicit successful refresh', async () => {
		const { store, api } = setup();
		api.mutationResult = new CloudAutomationMutationUncertainError(new Error('Lost response'));
		await assert.rejects(store.create(workspace, {}), CloudAutomationMutationUncertainError);
		await assert.rejects(store.create(workspace, {}), CloudAutomationMutationUncertainError);
		await store.refresh();
		api.mutationResult = definition;
		await store.create(workspace, {});
		assert.deepStrictEqual({ mutations: api.mutations, uncertain: store.mutationUncertain.get() }, { mutations: ['create', 'create'], uncertain: false });
	});

	test('refresh cannot overwrite a later mutation and queued old-account work never dispatches', async () => {
		const { store, api, recents, changeAccount } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		const pending = new DeferredPromise<readonly ICloudAutomationDefinition[]>();
		api.definitions.set(repository.name, pending.p);
		const refresh = store.refresh();
		await api.listStarted.p;
		const created = store.create(workspace, {});
		const refreshRejected = assert.rejects(refresh, isCancellationError);
		const createRejected = assert.rejects(created, isCancellationError);
		changeAccount({ ...account, sessionId: 'new-session' });
		await pending.complete([]);
		await Promise.all([refreshRejected, createRejected]);
		assert.deepStrictEqual({ mutations: api.mutations, entries: store.entries.get() }, { mutations: [], entries: [] });
	});

	test('discards late mutation responses after account rotation', async () => {
		const { store, api, changeAccount } = setup();
		const pending = new DeferredPromise<ICloudAutomationDefinition>();
		api.mutationResult = pending.p;
		const create = store.create(workspace, {});
		await timeout(0);
		const rejected = assert.rejects(create, isCancellationError);
		changeAccount({ ...account, sessionId: 'rotated' });
		await pending.complete(definition);
		await rejected;
		assert.deepStrictEqual(store.entries.get(), []);
	});

	test('history refresh bounds detail concurrency and cancels queued work on disposal', async () => {
		const { store, api, recents } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		api.definitions.set(repository.name, Array.from({ length: 10 }, (_, i) => ({ ...definition, id: `definition-${i}` })));
		await store.refresh();
		const task = { id: 'task', state: 'running', created_at: definition.created_at };
		api.tasks = [task];
		const pending = new DeferredPromise<ICloudAutomationTask>();
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
		const entry = await store.create(workspace, {});
		api.tasks = [{ id: 'task', state: 'running', created_at: definition.created_at }];
		api.taskDetail = { ...api.tasks[0], state: 'waiting_for_user' };
		await store.run(entry);
		assert.deepStrictEqual(store.history.get(), []);
		await store.refreshHistory();
		assert.deepStrictEqual(store.history.get(), [{ entry, task: api.taskDetail }]);
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
			calls: [{ method: 'visibility', account: 'octocat', repository }, { method: 'list', account: 'octocat', repository }],
			entries: [{ repository, definition }], stored: [repository],
		});
	});

	test('registration persists only repository references and leaves fetching to explicit refresh', async () => {
		const { store, api, storage } = setup();
		await store.registerRepository(workspace);
		assert.deepStrictEqual({
			methods: api.calls.map(call => call.method), entries: store.entries.get(),
			stored: JSON.parse(storage.get(storageKey, StorageScope.PROFILE)!),
		}, { methods: ['visibility'], entries: [], stored: [repository] });
		await store.refresh();
		assert.deepStrictEqual(store.entries.get(), [{ repository, definition }]);
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
		const create = assert.rejects(store.create(local, {}), isCancellationError);
		changeAccount({ ...account, sessionId: 'rotated' });
		await resolved.complete(workspace);
		await Promise.all([refresh, create]);
		assert.deepStrictEqual({ calls: api.calls, mutations: api.mutations }, { calls: [], mutations: [] });
	});

	test('skips public repositories and rechecks known repository visibility on refresh', async () => {
		const { store, api, recents } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		await store.refresh();
		api.visibility.set(repository.name, false);
		await store.refresh();
		await assert.rejects(store.registerRepository(workspace), /Private repository/);
		assert.deepStrictEqual({ entries: store.entries.get(), state: store.catalogueState.get(), methods: api.calls.map(call => call.method) }, {
			entries: [], state: 'ready', methods: ['visibility', 'list', 'visibility', 'visibility'],
		});
	});

	test('rejects unsupported registration without requests or stored references', async () => {
		const { store, api, storage } = setup();
		await assert.rejects(store.registerRepository(workspace.with({ authority: 'enterprise.example' })), /GitHub.com repository/);
		assert.deepStrictEqual({ calls: api.calls, stored: storage.get(storageKey, StorageScope.PROFILE) }, { calls: [], stored: undefined });
	});

	test('publishes loading synchronously and coalesces refreshes', async () => {
		const { store, api, recents } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		const pending = new DeferredPromise<readonly ICloudAutomationDefinition[]>();
		api.definitions.set(repository.name, pending.p);
		const states: string[] = [];
		disposables.add(autorun(reader => states.push(store.catalogueState.read(reader))));
		const first = store.refresh();
		assert.strictEqual(store.catalogueState.get(), 'loading');
		const second = store.refresh();
		await api.listStarted.p;
		await pending.complete([definition]);
		await Promise.all([first, second]);
		assert.deepStrictEqual({ states, methods: api.calls.map(call => call.method) }, {
			states: ['ready', 'loading', 'ready'], methods: ['visibility', 'list'],
		});
	});

	test('refresh replaces web updates and deletions without interpreting server-owned triggers', async () => {
		const { store, api, recents } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		await store.refresh();
		const updated = { ...definition, name: 'Updated on GitHub' };
		api.definitions.set(repository.name, [updated]);
		await store.refresh();
		assert.deepStrictEqual(store.entries.get(), [{ repository, definition: updated }]);
		api.definitions.set(repository.name, []);
		await store.refresh();
		assert.deepStrictEqual({ entries: store.entries.get(), state: store.catalogueState.get() }, { entries: [], state: 'ready' });
	});

	test('partial failure retains the failed repository cache and publishes healthy updates', async () => {
		const { store, api, recents } = setup();
		const other = { owner: 'microsoft', name: 'other' };
		recents.workspaces = [recentWorkspace(workspace), recentWorkspace(workspace.with({ path: '/microsoft/other/HEAD' }))];
		await store.refresh();
		api.definitions.set(repository.name, [{ ...definition, name: 'Updated' }]);
		api.definitions.set(other.name, new Error('Network failed'));
		await assert.rejects(store.refresh(), /Some GitHub repositories/);
		assert.deepStrictEqual({ entries: store.entries.get(), state: store.catalogueState.get() }, {
			entries: [{ repository, definition: { ...definition, name: 'Updated' } }, { repository: other, definition }],
			state: 'error',
		});
		api.definitions.set(other.name, []);
		await store.refresh();
		assert.deepStrictEqual({ entries: store.entries.get(), state: store.catalogueState.get() }, {
			entries: [{ repository, definition: { ...definition, name: 'Updated' } }], state: 'ready',
		});
	});

	test('failed recent repository discovery does not discard a known catalogue', async () => {
		const { store, api, recents } = setup();
		await store.registerRepository(workspace);
		recents.workspaces = [recentWorkspace(workspace.with({ path: '/microsoft/inaccessible/HEAD' }))];
		api.visibility.set('inaccessible', new Error('Access denied'));
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
		await store.registerRepository(workspace);
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

	for (const reset of ['account', 'same account', 'sign out', 'dispose'] as const) {
		test(`cancels and discards in-flight definitions on ${reset}`, async () => {
			const { store, api, recents, changeAccount, storage } = setup();
			recents.workspaces = [recentWorkspace(workspace), recentWorkspace(workspace.with({ path: '/microsoft/queued/HEAD' }))];
			const pending = new DeferredPromise<readonly ICloudAutomationDefinition[]>();
			api.definitions.set(repository.name, pending.p);
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
				entries: store.entries.get(), cancelled: api.calls.map(call => call.token.isCancellationRequested),
				stored: storage.get(storageKey, StorageScope.PROFILE), state: store.catalogueState.get(),
			}, {
				entries: [], cancelled: [true, true], stored: undefined,
				state: reset === 'sign out' || reset === 'dispose' ? 'unavailable' : 'ready',
			});
		});
	}

	test('a previous account refresh cannot clear or overwrite the new account refresh', async () => {
		const { store, api, recents, changeAccount } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		const old = new DeferredPromise<readonly ICloudAutomationDefinition[]>();
		api.definitions.set(repository.name, old.p);
		const first = store.refresh();
		await api.listStarted.p;
		const rejected = assert.rejects(first, isCancellationError);
		changeAccount({ ...account, sessionId: 'auth-2' });
		const current = new DeferredPromise<readonly ICloudAutomationDefinition[]>();
		api.definitions.set(repository.name, current.p);
		const second = store.refresh();
		await old.complete([definition]);
		await rejected;
		assert.strictEqual(store.catalogueState.get(), 'loading');
		const coalesced = store.refresh();
		await current.complete([{ ...definition, name: 'New session' }]);
		await Promise.all([second, coalesced]);
		assert.deepStrictEqual({ entries: store.entries.get(), methods: api.calls.map(call => call.method) }, {
			entries: [{ repository, definition: { ...definition, name: 'New session' } }], methods: ['visibility', 'list', 'visibility', 'list'],
		});
	});

	test('late eligibility checks cannot register repositories after an account reset', async () => {
		const { store, api, changeAccount, storage } = setup();
		const pending = new DeferredPromise<boolean>();
		api.visibility.set(repository.name, pending.p);
		const registration = store.registerRepository(workspace);
		const rejected = assert.rejects(registration, isCancellationError);
		changeAccount(account);
		await pending.complete(true);
		await rejected;
		assert.strictEqual(storage.get(storageKey, StorageScope.PROFILE), undefined);
	});

	test('registration during refresh is retained for the next refresh', async () => {
		const { store, api, recents, storage } = setup();
		recents.workspaces = [recentWorkspace(workspace)];
		const pending = new DeferredPromise<readonly ICloudAutomationDefinition[]>();
		api.definitions.set(repository.name, pending.p);
		const refresh = store.refresh();
		await api.listStarted.p;
		await store.registerRepository(workspace.with({ path: '/microsoft/other/HEAD' }));
		await pending.complete([definition]);
		await refresh;
		recents.workspaces = [];
		await store.refresh();
		assert.deepStrictEqual({
			stored: JSON.parse(storage.get(storageKey, StorageScope.PROFILE)!),
			repositories: store.entries.get().map(entry => entry.repository.name).sort(),
		}, {
			stored: [{ owner: 'microsoft', name: 'other' }, repository],
			repositories: ['other', repository.name].sort(),
		});
	});

	for (const value of [null, { ...account, enterprise: true }]) {
		test(`rejects reads and registration when ${value ? 'signed into enterprise' : 'signed out'}`, async () => {
			const { store, api, changeAccount } = setup();
			changeAccount(value);
			await assert.rejects(store.refresh(), /Sign in to GitHub.com/);
			await assert.rejects(store.registerRepository(workspace), /Sign in to GitHub.com/);
			assert.deepStrictEqual({ calls: api.calls, state: store.catalogueState.get() }, { calls: [], state: 'unavailable' });
		});
	}
});
