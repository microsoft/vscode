/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { mock, upcastDeepPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { URI } from '../../../../../../base/common/uri.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ICreateAutomationOptions } from '../../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../../../services/sessions/common/session.js';
import { IRecentWorkspace, ISessionsRecentWorkspacesService } from '../../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { GitHubApiError } from '../../../../github/browser/githubApiClient.js';
import { CloudAutomationApiClient, ICloudAutomationDefinition, ICloudAutomationMutation, ICloudAutomationRepository, ICloudAutomationTask } from '../../browser/cloudAutomationApiClient.js';
import { cloudAutomationRun, cloudAutomationSchedule, cloudAutomationTriggers, CloudAutomationStore, CLOUD_AUTOMATIONS_ENABLED_SETTING } from '../../browser/cloudAutomationStore.js';

const repository: ICloudAutomationRepository = { owner: 'example', name: 'private-repo' };
const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/example/private-repo/HEAD' });
const account: IDefaultAccount = { accountName: 'octocat', sessionId: 'auth-1', enterprise: false, authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false } };

function definition(overrides: Partial<ICloudAutomationDefinition> = {}): ICloudAutomationDefinition {
	return {
		id: 'automation-1', name: 'Daily review', prompt: 'Summarize the repository.',
		triggers: { interval: { types: ['daily'], hour_utc: 12, minute_utc: 30 } },
		created_at: '2026-09-22T00:00:00Z', updated_at: '2026-09-22T00:00:00Z',
		...overrides,
	};
}

function createOptions(): ICreateAutomationOptions {
	return {
		name: 'Daily review', prompt: 'Summarize the repository.',
		schedule: { interval: 'daily', scheduleHour: 12, scheduleMinute: 30, scheduleDay: 0, timeZone: 'UTC' },
		target: { kind: 'workspace', providerId: 'cloud', sessionTypeId: 'copilot-cloud-agent', folderUri: workspace, isolation: { kind: 'default' } },
		sessionTemplate: { modelId: 'model-1', config: { tools: ['read'] } },
	};
}

function cloudTask(overrides: Partial<ICloudAutomationTask> = {}): ICloudAutomationTask {
	return {
		id: 'task-existing', automation_id: 'automation-1', state: 'completed',
		created_at: '2026-09-22T00:00:00Z', updated_at: '2026-09-22T00:01:00Z',
		...overrides,
	};
}

class TestApi extends mock<CloudAutomationApiClient>() {
	definitions: ICloudAutomationDefinition[] = [];
	readonly calls: { method: string; account: string; repository?: ICloudAutomationRepository; id?: string; value?: ICloudAutomationMutation }[] = [];
	isPrivate = true;
	privateRepositoryPromise: Promise<boolean> | undefined;
	privateRepositoryError: Error | undefined;
	readonly privateRepositoryCalls: { account: string; repository: ICloudAutomationRepository; token: CancellationToken }[] = [];
	listCalls = 0;
	readonly listedRepositories: ICloudAutomationRepository[] = [];
	readonly listErrors = new Map<string, Error>();
	readonly repositoryDefinitions = new Map<string, readonly ICloudAutomationDefinition[]>();
	listPromise: Promise<readonly ICloudAutomationDefinition[]> | undefined;
	historyPromise: Promise<readonly ICloudAutomationTask[]> | undefined;
	historyTasks: readonly ICloudAutomationTask[] = [];
	historyError: Error | undefined;
	readonly historyErrors = new Map<string, Error>();
	readonly historyByDefinition = new Map<string, readonly ICloudAutomationTask[]>();
	stopPromise: Promise<void> | undefined;
	stopError: Error | undefined;
	readonly historyStarted = new DeferredPromise<void>();
	readonly historyTokens: CancellationToken[] = [];
	readonly historyCalls: { id: string; time: number }[] = [];
	override async isPrivateRepository(account: string, repository: ICloudAutomationRepository, token: CancellationToken): Promise<boolean> {
		this.privateRepositoryCalls.push({ account, repository, token });
		if (this.privateRepositoryError !== undefined) {
			throw this.privateRepositoryError;
		}
		return this.privateRepositoryPromise ?? this.isPrivate;
	}
	override async requirePrivateRepository(): Promise<void> {
		if (!this.isPrivate) {
			throw new Error('Private repository required.');
		}
	}
	override async list(_account: string, repository: ICloudAutomationRepository): Promise<readonly ICloudAutomationDefinition[]> {
		this.listCalls++;
		this.listedRepositories.push(repository);
		const error = this.listErrors.get(repository.name);
		if (error) {
			throw error;
		}
		return this.listPromise ?? this.repositoryDefinitions.get(repository.name) ?? this.definitions;
	}
	override async get(_account: string, _repository: ICloudAutomationRepository, id: string): Promise<ICloudAutomationDefinition> {
		const current = this.definitions.find(definition => definition.id === id);
		assert.ok(current);
		return current;
	}
	override async create(account: string, repository: ICloudAutomationRepository, value: ICloudAutomationMutation): Promise<ICloudAutomationDefinition> {
		this.calls.push({ method: 'create', account, repository, value });
		const created = definition(value);
		this.definitions.push(created);
		return created;
	}
	override async update(account: string, repository: ICloudAutomationRepository, id: string, value: ICloudAutomationMutation): Promise<ICloudAutomationDefinition> {
		this.calls.push({ method: 'update', account, repository, id, value });
		const updated = definition({ ...this.definitions.find(definition => definition.id === id), ...value });
		this.definitions = [updated];
		return updated;
	}
	override async delete(account: string, repository: ICloudAutomationRepository, id: string): Promise<void> {
		this.calls.push({ method: 'delete', account, repository, id });
		this.definitions = this.definitions.filter(definition => definition.id !== id);
	}
	override async run(account: string, repository: ICloudAutomationRepository, id: string): Promise<void> {
		this.calls.push({ method: 'run', account, repository, id });
	}
	override async stopTask(account: string, id: string): Promise<void> {
		this.calls.push({ method: 'stop', account, id });
		if (this.stopError) {
			throw this.stopError;
		}
		return this.stopPromise;
	}
	override async listRuns(_account: string, id: string, token: CancellationToken): Promise<readonly ICloudAutomationTask[]> {
		this.historyTokens.push(token);
		this.historyCalls.push({ id, time: Date.now() });
		void this.historyStarted.complete();
		const error = this.historyErrors.get(id) ?? this.historyError;
		if (error !== undefined) {
			throw error;
		}
		return this.historyPromise ?? this.historyByDefinition.get(id) ?? this.historyTasks;
	}
}

suite('CloudAutomationStore', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(enabled = true, resolveRepositoryUri: (workspace: URI) => URI | undefined = uri => uri) {
		const changed = disposables.add(new Emitter<IDefaultAccount | null>());
		const accounts = new class extends mock<IDefaultAccountService>() {
			override currentDefaultAccount: IDefaultAccount | null = account;
			override readonly onDidChangeDefaultAccount = changed.event;
		}();
		const configuration = new TestConfigurationService({ chat: { automations: { enabled: true, cloud: { enabled } } } });
		const storage = disposables.add(new InMemoryStorageService());
		const api = new TestApi();
		const recents = new class extends mock<ISessionsRecentWorkspacesService>() {
			override readonly onDidChangeRecentWorkspaces = Event.None;
			workspaces: IRecentWorkspace[] = [];
			override getRecentWorkspaces() { return this.workspaces; }
		}();
		const store = disposables.add(new CloudAutomationStore('cloud', 'copilot-cloud-agent', resolveRepositoryUri, api, accounts, configuration, storage, new NullLogService(), recents));
		return { store, api, storage, accounts, configuration, recents, changeAccount: (value: IDefaultAccount | null) => { accounts.currentDefaultAccount = value; changed.fire(value); } };
	}

	function recentWorkspace(uri: URI): IRecentWorkspace {
		return upcastDeepPartial<IRecentWorkspace>({ workspace: { folders: [{ root: uri }] } });
	}

	test('discovers repositories from task branches and ignores incomplete recent workspaces', async () => {
		const { store, api, recents } = setup();
		api.definitions = [definition()];
		recents.workspaces = [
			recentWorkspace(workspace.with({ path: '/example/private-repo/copilot%2Ftask-123' })),
			recentWorkspace(workspace.with({ path: '/example/private-repo/main/src' })),
			recentWorkspace(workspace.with({ path: '/example' })),
			recentWorkspace(URI.file('C:\\local-project')),
		];
		await store.refresh();
		const automation = store.automations.get()[0];
		assert.deepStrictEqual({
			repositories: api.listedRepositories, privateChecks: api.privateRepositoryCalls.length,
			state: store.catalogueState.get(), target: automation.target,
		}, {
			repositories: [repository], privateChecks: 1, state: 'ready',
			target: { ...createOptions().target },
		});
	});

	test('a failed repository does not discard successful catalogues or disable their mutations', async () => {
		const { store, api, recents } = setup();
		api.repositoryDefinitions.set('private-repo', [definition()]);
		api.repositoryDefinitions.set('other-repo', [definition({ id: 'other' })]);
		recents.workspaces = [recentWorkspace(workspace), recentWorkspace(workspace.with({ path: '/example/other-repo/HEAD' }))];
		await store.refresh();
		api.repositoryDefinitions.set('private-repo', [definition({ name: 'Updated remotely' })]);
		api.listErrors.set('other-repo', new Error('Repository unavailable'));
		await assert.rejects(store.refresh(), /Some GitHub repositories/);
		const automation = store.automations.get().find(item => item.name === 'Updated remotely')!;
		const availability = { create: store.canCreateAutomation.get(), update: store.canUpdateAutomation(automation.id), delete: store.canDeleteAutomation(automation.id) };
		api.definitions = [definition({ name: 'Updated remotely' })];
		await store.updateAutomation(automation.id, { enabled: false });
		assert.deepStrictEqual({
			state: store.catalogueState.get(), availability,
			names: store.automations.get().map(item => item.name).sort(),
			enabled: store.getAutomation(automation.id)?.enabled, mutations: api.calls.map(call => call.method),
		}, {
			state: 'error', availability: { create: true, update: true, delete: true },
			names: ['Daily review', 'Updated remotely'], enabled: false, mutations: ['update'],
		});
	});

	test('keeps known repositories available when a new recent repository cannot be checked', async () => {
		const { store, api, recents } = setup();
		api.definitions = [definition()];
		await store.registerRepository(workspace);
		recents.workspaces = [recentWorkspace(workspace.with({ path: '/example/inaccessible/HEAD' }))];
		api.privateRepositoryError = new Error('Access denied');
		await assert.rejects(store.refresh(), /Some GitHub repositories/);
		assert.deepStrictEqual({ names: store.automations.get().map(item => item.name), calls: api.listCalls, canCreate: store.canCreateAutomation.get() }, {
			names: ['Daily review'], calls: 2, canCreate: true,
		});
	});

	test('a stale refresh cannot overwrite a completed update or resurrect a deleted automation', async () => {
		const { store, api } = setup();
		api.definitions = [definition(), definition({ id: 'deleted' })];
		await store.registerRepository(workspace);
		const [updated, deleted] = store.automations.get();
		const stale = [...api.definitions];
		const pending = new DeferredPromise<readonly ICloudAutomationDefinition[]>();
		api.listPromise = pending.p;
		const refresh = store.refresh();
		await store.updateAutomation(updated.id, { enabled: false });
		await store.deleteAutomation(deleted.id);
		await pending.complete(stale);
		await refresh;
		assert.deepStrictEqual(store.automations.get().map(item => ({ id: item.id, enabled: item.enabled })), [{ id: updated.id, enabled: false }]);
	});

	test('disabled feature does not affect the ready local catalogue', () => {
		const { store } = setup(false);
		assert.deepStrictEqual({ state: store.catalogueState.get(), create: store.canCreateAutomation.get(), definitions: store.automations.get() }, { state: 'ready', create: false, definitions: [] });
	});

	suite('target eligibility', () => {
		test('stays disabled until verified private and coalesces aliases and reactive reads', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const local = URI.file('C:\\workspace');
			const { store, api } = setup(true, uri => uri.scheme === local.scheme ? workspace : uri);
			const pending = new DeferredPromise<boolean>();
			api.privateRepositoryPromise = pending.p;
			const getReason = store.configuration.getTargetDisabledReason!;
			const states: (string | undefined)[] = [];
			const observer = disposables.add(autorun(reader => states.push(getReason(local).read(reader))));
			const reason = getReason(workspace);
			const sameRepository = reason === getReason(workspace.with({ path: '/EXAMPLE/PRIVATE-REPO/HEAD' }));
			await pending.complete(true);
			await timeout(0);
			observer.dispose();

			assert.deepStrictEqual({
				states, sameRepository, cached: reason === getReason(local),
				calls: api.privateRepositoryCalls.map(({ account, repository }) => ({ account, repository })),
			}, {
				states: ['Checking repository visibility...', undefined], sameRepository: true, cached: true,
				calls: [{ account: 'octocat', repository }],
			});
		}));

		test('public repositories and unsupported workspaces require a private repository', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { store, api } = setup();
			api.isPrivate = false;
			const getReason = store.configuration.getTargetDisabledReason!;
			const unsupported = [
				undefined,
				URI.file('C:\\unresolved-workspace'),
				workspace.with({ authority: 'github.example.com' }),
				URI.parse('https://github.com/example/private-repo'),
			].map(uri => getReason(uri).get());
			const reason = getReason(workspace);
			await timeout(0);

			assert.deepStrictEqual({ unsupported, public: reason.get(), calls: api.privateRepositoryCalls.length }, {
				unsupported: Array.from({ length: 4 }, () => 'Requires a private repository'),
				public: 'Requires a private repository', calls: 1,
			});
		}));

		test('caches failed checks without a reactive request loop', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { store, api } = setup();
			api.privateRepositoryError = new Error('Unavailable');
			const states: (string | undefined)[] = [];
			const getReason = store.configuration.getTargetDisabledReason!;
			const observer = disposables.add(autorun(reader => states.push(getReason(workspace).read(reader))));
			await timeout(0);
			for (let index = 0; index < 10; index++) {
				getReason(workspace).get();
			}
			await timeout(60_000);
			observer.dispose();

			assert.deepStrictEqual({ states, calls: api.privateRepositoryCalls.length }, {
				states: ['Checking repository visibility...', 'Unable to verify repository visibility.'], calls: 1,
			});
		}));

		test('rechecks local repository metadata instead of caching an unresolved target', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			let resolved: URI | undefined;
			const { store, api } = setup(true, () => resolved);
			const getReason = store.configuration.getTargetDisabledReason!;
			const local = URI.file('C:\\workspace');
			const unresolved = getReason(local).get();
			resolved = workspace;
			const first = getReason(local);
			await timeout(0);
			const privateReason = first.get();
			resolved = workspace.with({ path: '/example/public-repo/HEAD' });
			api.isPrivate = false;
			const second = getReason(local);
			await timeout(0);

			assert.deepStrictEqual({
				unresolved, privateReason, publicReason: second.get(),
				repositories: api.privateRepositoryCalls.map(call => call.repository.name),
			}, {
				unresolved: 'Requires a private repository', privateReason: undefined,
				publicReason: 'Requires a private repository', repositories: ['private-repo', 'public-repo'],
			});
		}));

		test('allows a failed eligibility check to be retried after an explicit refresh', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { store, api } = setup();
			api.privateRepositoryError = new Error('Temporary network failure');
			const first = store.configuration.getTargetDisabledReason!(workspace);
			await timeout(0);
			api.privateRepositoryError = undefined;
			await store.refresh();
			const retried = store.configuration.getTargetDisabledReason!(workspace);
			await timeout(0);
			assert.deepStrictEqual({ first: first.get(), retried: retried.get(), calls: api.privateRepositoryCalls.length }, {
				first: 'Unable to verify repository visibility.', retried: undefined, calls: 2,
			});
		}));

		test('distinguishes repository resolution failure from an unsupported repository', () => {
			const { store } = setup(true, () => { throw new Error('Resolution failed'); });
			assert.strictEqual(store.configuration.getTargetDisabledReason!(URI.file('C:\\workspace')).get(), 'Unable to verify repository visibility.');
		});

		test('pins requests to their account and discards late checks after account changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { store, api, changeAccount } = setup();
			const firstPending = new DeferredPromise<boolean>();
			api.privateRepositoryPromise = firstPending.p;
			const getReason = store.configuration.getTargetDisabledReason!;
			const first = getReason(workspace);
			const secondPending = new DeferredPromise<boolean>();
			api.privateRepositoryPromise = secondPending.p;
			changeAccount({ ...account, accountName: 'other-user', sessionId: 'auth-2' });
			const second = getReason(workspace);
			await firstPending.complete(true);
			await timeout(0);
			const afterStaleResult = { oldDisabled: first.get() !== undefined, current: second.get() };
			await secondPending.complete(true);
			await timeout(0);
			const verified = second.get();
			changeAccount(null);

			assert.deepStrictEqual({
				afterStaleResult, verified, signedOutDisabled: second.get() !== undefined,
				accounts: api.privateRepositoryCalls.map(call => call.account),
				cancelled: api.privateRepositoryCalls.map(call => call.token.isCancellationRequested),
			}, {
				afterStaleResult: { oldDisabled: true, current: 'Checking repository visibility...' },
				verified: undefined, signedOutDisabled: true,
				accounts: ['octocat', 'other-user'], cancelled: [true, true],
			});
		}));

		test('invalidates a verified result even when resetting the same account', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { store, api, changeAccount } = setup();
			const getReason = store.configuration.getTargetDisabledReason!;
			const first = getReason(workspace);
			await timeout(0);
			const verified = first.get();
			api.isPrivate = false;
			changeAccount(account);
			const invalidated = first.get();
			const second = getReason(workspace);
			await timeout(0);

			assert.deepStrictEqual({
				verified, invalidated, rechecked: second.get(), calls: api.privateRepositoryCalls.length,
			}, {
				verified: undefined, invalidated: 'Repository access must be verified again.',
				rechecked: 'Requires a private repository', calls: 2,
			});
		}));

		test('invalidates pending and verified results on disposal without starting more requests', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { store, api } = setup();
			const getReason = store.configuration.getTargetDisabledReason!;
			const verified = getReason(workspace);
			await timeout(0);
			const pending = new DeferredPromise<boolean>();
			api.privateRepositoryPromise = pending.p;
			const checking = getReason(workspace.with({ path: '/example/other-repo/HEAD' }));
			const states: (string | undefined)[] = [];
			const observer = disposables.add(autorun(reader => states.push(verified.read(reader))));
			store.dispose();
			const disposed = getReason(workspace).get();
			await pending.complete(true);
			await timeout(0);
			observer.dispose();

			assert.deepStrictEqual({
				states, disposed, pendingDisabled: checking.get() !== undefined,
				calls: api.privateRepositoryCalls.length,
				cancelled: api.privateRepositoryCalls.every(call => call.token.isCancellationRequested),
			}, {
				states: [undefined, 'Repository access must be verified again.'],
				disposed: 'Cloud automations are unavailable.', pendingDisabled: true, calls: 2, cancelled: true,
			});
		}));

		test('limits concurrent checks and skips queued checks when the account is cleared', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { store, api, changeAccount } = setup();
			const pending = new DeferredPromise<boolean>();
			api.privateRepositoryPromise = pending.p;
			for (let index = 0; index < 110; index++) {
				store.configuration.getTargetDisabledReason!(workspace.with({ path: `/example/repository-${index}/HEAD` }));
			}
			const inFlight = api.privateRepositoryCalls.length;
			changeAccount(null);
			await pending.complete(true);
			await timeout(0);

			assert.deepStrictEqual({
				inFlight, callsAfterSignout: api.privateRepositoryCalls.length,
				cancelled: api.privateRepositoryCalls.every(call => call.token.isCancellationRequested),
			}, { inFlight: 4, callsAfterSignout: 4, cancelled: true });
		}));

		test('bounds cached repositories while retaining recent checks', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { store, api } = setup();
			const getReason = store.configuration.getTargetDisabledReason!;
			const first = getReason(workspace);
			for (let index = 0; index < 100; index++) {
				getReason(workspace.with({ path: `/example/repository-${index}/HEAD` }));
			}
			await timeout(0);
			const callsBeforeEviction = api.privateRepositoryCalls.length;
			const recent = getReason(workspace.with({ path: '/example/repository-99/HEAD' }));
			const reused = recent === getReason(workspace.with({ path: '/example/repository-99/HEAD' }));
			const replaced = first !== getReason(workspace);
			await timeout(0);

			assert.deepStrictEqual({ callsBeforeEviction, reused, replaced, calls: api.privateRepositoryCalls.length }, {
				callsBeforeEviction: 101, reused: true, replaced: true, calls: 102,
			});
		}));

		test('a cached eligible target does not bypass the private-repository mutation guard', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { store, api } = setup();
			const reason = store.configuration.getTargetDisabledReason!(workspace);
			await timeout(0);
			api.isPrivate = false;
			await assert.rejects(store.createAutomation(createOptions()), /Private repository required/);

			assert.deepStrictEqual({ verified: reason.get(), mutations: api.calls }, { verified: undefined, mutations: [] });
		}));
	});

	test('creates a disabled private-repository definition with explicit UTC and tool configuration', async () => {
		const { store, api } = setup();
		const created = await store.createAutomation(createOptions());
		assert.deepStrictEqual({
			call: api.calls[0], enabled: created.enabled, schedule: created.schedule, provider: created.target.providerId, history: store.runs.get(),
		}, {
			call: { method: 'create', account: 'octocat', repository, value: { name: 'Daily review', prompt: 'Summarize the repository.', triggers: { interval: { types: ['daily'], hour_utc: 12, minute_utc: 30 } }, disabled: true, tools: ['read'], model: 'model-1', reasoning_effort: undefined } },
			enabled: false,
			schedule: { interval: 'daily', scheduleHour: 12, scheduleMinute: 30, scheduleDay: 0, timeZone: 'UTC' },
			provider: 'cloud', history: [],
		});
	});

	test('rejects public repositories and local execution options before mutation', async () => {
		const { store, api } = setup();
		api.isPrivate = false;
		await assert.rejects(store.createAutomation(createOptions()), /Private/);
		api.isPrivate = true;
		await assert.rejects(store.createAutomation({ ...createOptions(), target: { kind: 'quickChat', providerId: 'cloud', sessionTypeId: 'copilot-cloud-agent' } }), /repository target/);
		await assert.rejects(store.createAutomation({
			...createOptions(),
			target: { kind: 'workspace', providerId: 'cloud', sessionTypeId: 'copilotcli', folderUri: workspace, isolation: { kind: 'default' } },
		}), /repository target/);
		await assert.rejects(store.createAutomation({ ...createOptions(), mode: 'agent' }), /local mode/);
		assert.deepStrictEqual(api.calls, []);
	});

	test('keeps unsupported triggers visible and read-only instead of downgrading them to manual', async () => {
		const { store, api } = setup();
		api.definitions = [definition({ triggers: { issues: { types: ['opened'], query: 'is:open' } } })];
		await store.registerRepository(workspace);
		const automation = store.automations.get()[0];
		assert.deepStrictEqual({
			interval: automation.schedule.interval, readOnly: automation.readOnlyReason !== undefined,
			canRun: store.canRunAutomation(automation.id), canUpdate: store.canUpdateAutomation(automation.id), canDelete: store.canDeleteAutomation(automation.id),
		}, { interval: 'custom', readOnly: true, canRun: false, canUpdate: false, canDelete: true });
	});

	test('rechecks remote editable state and preserves unknown trigger fields', async () => {
		const { store, api } = setup();
		api.definitions = [definition({ triggers: { interval: { types: ['daily'], hour_utc: 12, minute_utc: 30, future_field: 'keep' } } })];
		await store.registerRepository(workspace);
		const expected = store.automations.get()[0];
		api.definitions = [definition({ name: 'Changed elsewhere' })];
		const conflict = await store.updateAutomationIfUnchanged(expected.id, { prompt: 'New prompt' }, expected);
		assert.equal(conflict.kind, 'conflict');
		assert.equal(api.calls.length, 0);
		api.definitions = [definition({ triggers: { interval: { types: ['daily'], hour_utc: 12, minute_utc: 30, future_field: 'keep' } } })];
		await store.updateAutomation(expected.id, { schedule: { interval: 'weekly', scheduleHour: 9, scheduleMinute: 15, scheduleDay: 1, timeZone: 'UTC' } });
		assert.deepStrictEqual(api.calls[0]?.value?.triggers, { interval: { future_field: 'keep', types: ['weekly'], hour_utc: 9, minute_utc: 15, day_of_week: 1 } });
	});

	test('unrelated edits do not replace a server-owned hourly anchor', async () => {
		const { store, api } = setup();
		api.definitions = [definition({ triggers: { interval: { types: ['hourly'], minute_utc: 37 } } })];
		await store.registerRepository(workspace);
		const current = store.automations.get()[0];
		await store.updateAutomation(current.id, { name: 'Renamed', schedule: current.schedule });
		assert.deepStrictEqual(api.calls[0]?.value, { name: 'Renamed' });
	});

	test('manual dispatch reports accepted without inventing a run or sending a second prompt', async () => {
		const { store, api } = setup();
		const created = await store.createAutomation({ ...createOptions(), enabled: true });
		const result = await store.runAutomation(created.id);
		assert.deepStrictEqual({ result, methods: api.calls.map(call => call.method), runs: store.runs.get() }, { result: { kind: 'accepted' }, methods: ['create', 'run'], runs: [] });
	});

	test('publishes loading synchronously and coalesces catalogue refreshes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api } = setup();
		api.definitions = [definition()];
		await store.registerRepository(workspace);
		const states: { state: string; create: boolean; reason: string | undefined }[] = [];
		const observer = disposables.add(autorun(reader => states.push({
			state: store.catalogueState.read(reader),
			create: store.canCreateAutomation.read(reader),
			reason: store.unavailableReason.read(reader),
		})));
		const pending = new DeferredPromise<readonly ICloudAutomationDefinition[]>();
		api.listPromise = pending.p;
		const first = store.refresh();
		const second = store.refresh();
		const duringRefresh = store.catalogueState.get();
		await pending.complete([]);
		await Promise.all([first, second]);
		observer.dispose();

		assert.deepStrictEqual({ duringRefresh, calls: api.listCalls, states, definitions: store.automations.get() }, {
			duringRefresh: 'loading', calls: 2,
			states: [
				{ state: 'ready', create: true, reason: undefined },
				{ state: 'loading', create: true, reason: undefined },
				{ state: 'ready', create: true, reason: undefined },
			],
			definitions: [],
		});
	}));

	test('waits for the initial catalogue before loading its history', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api } = setup();
		const pending = new DeferredPromise<readonly ICloudAutomationDefinition[]>();
		api.listPromise = pending.p;
		api.historyTasks = [cloudTask()];
		const registration = store.registerRepository(workspace);
		const observer = disposables.add(autorun(reader => store.runs.read(reader)));
		await timeout(0);
		const initial = { state: store.catalogueState.get(), historyCalls: api.historyCalls.length };
		await pending.complete([definition()]);
		await registration;
		await timeout(1);
		observer.dispose();

		assert.deepStrictEqual({
			initial, state: store.catalogueState.get(),
			history: api.historyCalls.map(call => call.id), tasks: store.runs.get().map(run => run.sessionResource?.path),
		}, {
			initial: { state: 'loading', historyCalls: 0 }, state: 'ready',
			history: ['automation-1'], tasks: ['/task/task-existing'],
		});
	}));

	test('repeatedly discovers real tasks after Run Now without correlating an older run', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api } = setup();
		const created = await store.createAutomation({ ...createOptions(), enabled: true });
		api.historyTasks = [cloudTask()];
		const observer = disposables.add(autorun(reader => store.runs.read(reader)));
		await timeout(0);
		const result = await store.runAutomation(created.id);
		await timeout(10_000);
		await timeout(0);
		const beforeDiscovery = {
			calls: api.historyCalls.length,
			tasks: store.runs.get().map(run => run.sessionResource?.path),
		};
		api.historyTasks = [cloudTask(), cloudTask({ id: 'task-discovered', state: 'queued', created_at: '2020-01-01T00:00:00Z' })];
		await timeout(5_000);
		await timeout(0);
		observer.dispose();
		await timeout(60_000);

		assert.deepStrictEqual({
			result, beforeDiscovery,
			times: api.historyCalls.map(call => call.time),
			tasks: store.runs.get().map(run => ({ path: run.sessionResource?.path, status: run.status })),
			cancelled: api.historyTokens.map(token => token.isCancellationRequested),
		}, {
			result: { kind: 'accepted' },
			beforeDiscovery: { calls: 3, tasks: ['/task/task-existing'] },
			times: [0, 5_000, 10_000, 15_000],
			tasks: [{ path: '/task/task-existing', status: 'completed' }, { path: '/task/task-discovered', status: 'pending' }],
			cancelled: [false, false, false, false],
		});
	}));

	test('bounds post-run discovery when GitHub has not published a task', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api } = setup();
		const created = await store.createAutomation({ ...createOptions(), enabled: true });
		const observer = disposables.add(autorun(reader => store.runs.read(reader)));
		await timeout(0);
		await store.runAutomation(created.id);
		await timeout(2 * 60_000);
		await timeout(0);
		const callsAtDeadline = api.historyCalls.length;
		await timeout(60_000);
		await timeout(0);
		observer.dispose();

		assert.deepStrictEqual({
			callsAtDeadline, callsAfterDeadline: api.historyCalls.length,
			lastPoll: api.historyCalls.at(-1)?.time, runs: store.runs.get(),
		}, { callsAtDeadline: 25, callsAfterDeadline: 27, lastPoll: 180_000, runs: [] });
	}));

	test('discovers website runs and resumed completed tasks within the regular refresh interval', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api } = setup();
		api.definitions = [definition()];
		api.historyTasks = [cloudTask()];
		await store.registerRepository(workspace);
		const observer = disposables.add(autorun(reader => store.runs.read(reader)));
		await timeout(0);
		api.historyTasks = [cloudTask({ state: 'running' }), cloudTask({ id: 'website-run', state: 'queued' })];
		await timeout(30_000);
		await timeout(0);
		const resumed = store.runs.get().map(run => run.status);
		api.historyTasks = api.historyTasks.map(task => ({ ...task, state: 'completed' }));
		await timeout(30_000);
		await timeout(0);
		observer.dispose();
		assert.deepStrictEqual({ resumed, completed: store.runs.get().map(run => run.status), times: api.historyCalls.map(call => call.time) }, {
			resumed: ['running', 'pending'], completed: ['completed', 'completed'], times: [0, 30_000, 60_000],
		});
	}));

	test('refreshes healthy history while retaining the last known runs for a failed history request', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api } = setup();
		api.definitions = [definition(), definition({ id: 'automation-2' })];
		api.historyByDefinition.set('automation-1', [cloudTask({ state: 'running' })]);
		api.historyByDefinition.set('automation-2', [cloudTask({ id: 'task-2', automation_id: 'automation-2', state: 'running' })]);
		await store.registerRepository(workspace);
		const observer = disposables.add(autorun(reader => store.runs.read(reader)));
		await timeout(0);
		api.historyByDefinition.set('automation-1', [cloudTask({ state: 'completed' })]);
		api.historyErrors.set('automation-2', new Error('History unavailable'));
		await timeout(30_000);
		await timeout(0);
		observer.dispose();
		assert.deepStrictEqual({
			state: store.catalogueState.get(), canCreate: store.canCreateAutomation.get(),
			runs: store.runs.get().map(run => ({ path: run.sessionResource?.path, status: run.status })),
		}, {
			state: 'error', canCreate: true,
			runs: [{ path: '/task/task-existing', status: 'completed' }, { path: '/task/task-2', status: 'running' }],
		});
	}));

	test('stops the exact cloud task without archiving it or inventing a terminal state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api } = setup();
		api.definitions = [definition()];
		api.historyTasks = [cloudTask({ id: 'first', state: 'running' }), cloudTask({ id: 'second', state: 'queued' })];
		await store.registerRepository(workspace);
		const observer = disposables.add(autorun(reader => store.runs.read(reader)));
		await timeout(0);
		const run = store.runs.get()[1];
		const stopping = new DeferredPromise<void>();
		api.stopPromise = stopping.p;
		const stop = store.stopRun(run);
		const duplicate = store.stopRun(run);
		await stopping.complete();
		await Promise.all([stop, duplicate]);
		const afterRequest = store.runs.get().map(run => run.status);
		api.historyTasks = [api.historyTasks[0], { ...api.historyTasks[1], state: 'cancelled' }];
		await timeout(0);
		observer.dispose();
		assert.deepStrictEqual({
			calls: api.calls, afterRequest, afterConfirmation: store.runs.get().map(run => run.status),
			canStop: store.canStopRun(run),
		}, {
			calls: [{ method: 'stop', account: 'octocat', id: 'second' }], afterRequest: ['running', 'pending'],
			afterConfirmation: ['running', 'failed'], canStop: false,
		});
		await assert.rejects(store.stopRun(run), /no longer active/);
	}));

	test('surfaces remote stop failures without changing the run state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api, changeAccount } = setup();
		api.definitions = [definition()];
		api.historyTasks = [cloudTask({ state: 'running' })];
		await store.registerRepository(workspace);
		const observer = disposables.add(autorun(reader => store.runs.read(reader)));
		await timeout(0);
		const run = store.runs.get()[0];
		api.stopError = new Error('Stop denied');
		await assert.rejects(store.stopRun(run), /Stop denied/);
		assert.strictEqual(store.runs.get()[0].status, 'running');
		changeAccount(null);
		observer.dispose();
		await assert.rejects(store.stopRun(run), /no longer active/);
		assert.strictEqual(api.calls.length, 1);
	}));

	test('retains post-run discovery demand without polling unobserved history', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api } = setup();
		const created = await store.createAutomation({ ...createOptions(), enabled: true });
		await store.runAutomation(created.id);
		await timeout(70_000);
		const hiddenCalls = api.historyCalls.length;
		const observer = disposables.add(autorun(reader => store.runs.read(reader)));
		await timeout(0);
		await timeout(5_000);
		await timeout(0);
		observer.dispose();
		await timeout(60_000);

		assert.deepStrictEqual({ hiddenCalls, times: api.historyCalls.map(call => call.time) }, { hiddenCalls: 0, times: [70_000, 75_000] });
	}));

	test('coalesces refresh and Run Now while history is in flight and stops at the last observer', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api } = setup();
		const created = await store.createAutomation({ ...createOptions(), enabled: true });
		const firstObserver = disposables.add(autorun(reader => store.runs.read(reader)));
		const secondObserver = disposables.add(autorun(reader => store.runsFor(created.id).read(reader)));
		await timeout(0);
		const pending = new DeferredPromise<readonly ICloudAutomationTask[]>();
		api.historyPromise = pending.p;
		await Promise.all([store.refresh(), store.refresh()]);
		await timeout(0);
		await store.runAutomation(created.id);
		await Promise.all([store.refresh(), store.refresh()]);
		await timeout(10_000);
		const coalescedCalls = api.historyCalls.length;
		firstObserver.dispose();
		const cancelledWithObserver = api.historyTokens.at(-1)?.isCancellationRequested;
		api.historyTasks = [cloudTask()];
		const next = new DeferredPromise<readonly ICloudAutomationTask[]>();
		api.historyPromise = next.p;
		await pending.complete(api.historyTasks);
		await timeout(0);
		const cancelledAfterPublish = api.historyTokens[1].isCancellationRequested;
		await timeout(5_000);
		await timeout(0);
		secondObserver.dispose();
		await next.complete([cloudTask({ id: 'stale-task' })]);
		await timeout(60_000);

		assert.deepStrictEqual({
			coalescedCalls, cancelledWithObserver, cancelledAfterPublish,
			calls: api.historyCalls.length, cancelled: api.historyTokens.at(-1)?.isCancellationRequested,
			tasks: store.runs.get().map(run => run.sessionResource?.path),
		}, {
			coalescedCalls: 2, cancelledWithObserver: false, cancelledAfterPublish: false,
			calls: 3, cancelled: true, tasks: ['/task/task-existing'],
		});
	}));

	test('coalesces a new catalogue snapshot into a full refresh after in-flight history', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api } = setup();
		api.definitions = [definition()];
		await store.registerRepository(workspace);
		const pending = new DeferredPromise<readonly ICloudAutomationTask[]>();
		api.historyPromise = pending.p;
		const observer = disposables.add(autorun(reader => store.runs.read(reader)));
		await timeout(0);
		api.definitions.push(definition({ id: 'automation-2' }));
		await Promise.all([store.refresh(), store.refresh()]);
		await timeout(0);
		const coalescedCalls = api.historyCalls.length;
		api.historyPromise = undefined;
		await pending.complete([]);
		await timeout(1);
		observer.dispose();

		assert.deepStrictEqual({ coalescedCalls, history: api.historyCalls.map(call => call.id) }, {
			coalescedCalls: 1, history: ['automation-1', 'automation-1', 'automation-2'],
		});
	}));

	test('reopening history resumes promptly after a cancelled in-flight read settles', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api } = setup();
		await store.createAutomation(createOptions());
		const pending = new DeferredPromise<readonly ICloudAutomationTask[]>();
		api.historyPromise = pending.p;
		const firstObserver = disposables.add(autorun(reader => store.runs.read(reader)));
		await timeout(0);
		firstObserver.dispose();
		const secondObserver = disposables.add(autorun(reader => store.runs.read(reader)));
		api.historyPromise = undefined;
		api.historyTasks = [cloudTask()];
		await pending.complete([cloudTask({ id: 'stale-task' })]);
		await timeout(1);
		secondObserver.dispose();
		await timeout(60_000);

		assert.deepStrictEqual({
			times: api.historyCalls.map(call => call.time),
			cancelled: api.historyTokens.map(token => token.isCancellationRequested),
			tasks: store.runs.get().map(run => run.sessionResource?.path),
		}, { times: [0, 0], cancelled: [true, false], tasks: ['/task/task-existing'] });
	}));

	test('honors Retry-After across post-run polls, explicit refreshes, and reobservation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api } = setup();
		const created = await store.createAutomation({ ...createOptions(), enabled: true });
		const firstObserver = disposables.add(autorun(reader => store.runs.read(reader)));
		await timeout(0);
		await store.runAutomation(created.id);
		api.historyError = new GitHubApiError('Retry later', 429, 0, 20);
		await timeout(5_000);
		await timeout(0);
		const failedState = store.catalogueState.get();
		api.historyError = undefined;
		await Promise.all([store.refresh(), store.refresh()]);
		firstObserver.dispose();
		const secondObserver = disposables.add(autorun(reader => store.runs.read(reader)));
		await timeout(19_999);
		const callsDuringBackoff = api.historyCalls.length;
		await timeout(1);
		await timeout(0);
		secondObserver.dispose();

		assert.deepStrictEqual({
			failedState, callsDuringBackoff,
			times: api.historyCalls.map(call => call.time), state: store.catalogueState.get(),
		}, { failedState: 'error', callsDuringBackoff: 2, times: [0, 5_000, 25_000], state: 'ready' });
	}));

	test('does not start queued history requests after the last observer leaves', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { store, api } = setup();
		api.definitions = Array.from({ length: 6 }, (_, index) => definition({ id: `automation-${index}` }));
		await store.registerRepository(workspace);
		const pending = new DeferredPromise<readonly ICloudAutomationTask[]>();
		api.historyPromise = pending.p;
		const observer = disposables.add(autorun(reader => store.runs.read(reader)));
		await timeout(0);
		observer.dispose();
		await pending.complete([]);
		await timeout(60_000);

		assert.deepStrictEqual({
			calls: api.historyCalls.length, cancelled: api.historyTokens.every(token => token.isCancellationRequested),
		}, { calls: 4, cancelled: true });
	}));

	for (const stoppedBy of ['signout', 'disposal'] as const) {
		test(`stops post-run polling and ignores pending history after ${stoppedBy}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { store, api, changeAccount } = setup();
			const created = await store.createAutomation({ ...createOptions(), enabled: true });
			const observer = disposables.add(autorun(reader => store.runs.read(reader)));
			await timeout(0);
			await store.runAutomation(created.id);
			const pending = new DeferredPromise<readonly ICloudAutomationTask[]>();
			api.historyPromise = pending.p;
			await timeout(5_000);
			await timeout(0);
			if (stoppedBy === 'signout') {
				changeAccount(null);
			} else {
				store.dispose();
			}
			await pending.complete([cloudTask()]);
			await timeout(3 * 60_000);
			observer.dispose();

			assert.deepStrictEqual({
				calls: api.historyCalls.length, cancelled: api.historyTokens.at(-1)?.isCancellationRequested, runs: store.runs.get(),
			}, { calls: 2, cancelled: true, runs: [] });
		}));
	}

	test('does not dispatch disabled definitions or cancelled requests', async () => {
		const { store, api } = setup();
		const created = await store.createAutomation(createOptions());
		await assert.rejects(store.runAutomation(created.id), /Enable/);
		await store.updateAutomation(created.id, { enabled: true });
		await assert.rejects(store.runAutomation(created.id, CancellationToken.Cancelled));
		assert.deepStrictEqual(api.calls.map(call => call.method), ['create', 'update']);
	});

	test('account changes clear definitions and prevent stale reads from publishing', async () => {
		const { store, api, changeAccount } = setup();
		await store.createAutomation(createOptions());
		const pending = new DeferredPromise<readonly ICloudAutomationDefinition[]>();
		api.listPromise = pending.p;
		const refresh = store.refresh();
		changeAccount(null);
		pending.complete([definition()]);
		await assert.rejects(refresh);
		assert.deepStrictEqual({ state: store.catalogueState.get(), definitions: store.automations.get(), runs: store.runs.get() }, { state: 'unavailable', definitions: [], runs: [] });
	});

	test('leaving history cancels pending reads without mutating remote run state', async () => {
		const { store, api } = setup();
		await store.createAutomation(createOptions());
		const history = new DeferredPromise<readonly ICloudAutomationTask[]>();
		api.historyPromise = history.p;
		const observer = disposables.add(autorun(reader => store.runs.read(reader)));
		await api.historyStarted.p;
		observer.dispose();
		await history.complete([]);
		await timeout(0);
		assert.deepStrictEqual({ cancelled: api.historyTokens.every(token => token.isCancellationRequested), mutations: api.calls.map(call => call.method) }, {
			cancelled: true, mutations: ['create'],
		});
	});

	test('corrupt repository references fail visibly rather than becoming a writable empty catalogue', () => {
		const { store, storage, changeAccount } = setup();
		storage.store('cloudAutomations.repositories.octocat', '{', StorageScope.PROFILE, StorageTarget.MACHINE);
		changeAccount(account);
		assert.deepStrictEqual({ state: store.catalogueState.get(), create: store.canCreateAutomation.get() }, { state: 'error', create: false });
	});

	test('provider creation remains opt-in after configuration changes', () => {
		const { store, configuration } = setup();
		configuration.setUserConfiguration(CLOUD_AUTOMATIONS_ENABLED_SETTING, false);
		configuration.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: key => key === CLOUD_AUTOMATIONS_ENABLED_SETTING, affectedKeys: new Set([CLOUD_AUTOMATIONS_ENABLED_SETTING]), source: 8, change: { keys: [CLOUD_AUTOMATIONS_ENABLED_SETTING], overrides: [] } });
		assert.equal(store.canCreateAutomation.get(), false);
	});
});

suite('Cloud automation projection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips supported schedules and rejects local-time or non-quarter-hour cloud times', () => {
		const schedules = [
			{ interval: 'manual' as const, scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0, timeZone: 'UTC' as const },
			{ interval: 'hourly' as const, scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0, timeZone: 'UTC' as const },
			{ interval: 'daily' as const, scheduleHour: 23, scheduleMinute: 45, scheduleDay: 0, timeZone: 'UTC' as const },
			{ interval: 'weekly' as const, scheduleHour: 0, scheduleMinute: 15, scheduleDay: 6, timeZone: 'UTC' as const },
		];
		assert.deepStrictEqual(schedules.map(schedule => cloudAutomationSchedule(cloudAutomationTriggers(schedule))), schedules);
		assert.throws(() => cloudAutomationTriggers({ ...schedules[2], scheduleMinute: 34 }), /00, 15, 30, or 45/);
		assert.throws(() => cloudAutomationTriggers({ ...schedules[2], timeZone: undefined }), /UTC explicitly/);
	});

	test('maps real task IDs to the existing cloud session viewer, not an AHP resource', () => {
		const task: ICloudAutomationTask = { id: 'task-1', automation_id: 'automation-1', state: 'completed', created_at: '2026-09-22T00:00:00Z', updated_at: '2026-09-22T00:01:00Z' };
		const run = cloudAutomationRun('definition-identity', 'octocat', task, repository);
		assert.deepStrictEqual({
			status: run.status, session: run.sessionResource?.toString(), external: run.externalResource?.toString(true), trigger: run.trigger, completed: run.completedAt,
		}, {
			status: 'completed', session: 'copilot-cloud-agent:/task/task-1',
			external: 'https://github.com/example/private-repo/tasks/task-1?author=octocat', trigger: 'external', completed: task.updated_at,
		});
	});

	test('links to the task creator rather than the viewing account', () => {
		const task: ICloudAutomationTask = {
			id: 'task-2', state: 'completed', created_at: '2026-09-22T00:00:00Z',
			creator: { login: 'automation-owner' },
		};
		const run = cloudAutomationRun('automation', 'viewer', task, repository);
		assert.strictEqual(run.externalResource?.toString(true), 'https://github.com/example/private-repo/tasks/task-2?author=automation-owner');
	});

	test('preserves idle, needs-input, and timed-out task states without inventing completion', () => {
		const base = { id: 'task', created_at: '2026-09-22T00:00:00Z' };
		const runs = ['idle', 'waiting_for_user', 'timed_out'].map(state => cloudAutomationRun('automation', 'octocat', { ...base, state }, repository));
		assert.deepStrictEqual(runs.map(run => ({ status: run.status, needsInput: run.needsInput, description: run.statusDescription, error: run.errorMessage })), [
			{ status: 'running', needsInput: undefined, description: undefined, error: undefined },
			{ status: 'running', needsInput: true, description: 'Needs input on GitHub', error: undefined },
			{ status: 'failed', needsInput: undefined, description: undefined, error: 'timed_out' },
		]);
	});
});
