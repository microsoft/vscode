/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ICreateAutomationOptions } from '../../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../../../services/sessions/common/session.js';
import { ISessionsRecentWorkspacesService } from '../../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
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

class TestApi extends mock<CloudAutomationApiClient>() {
	definitions: ICloudAutomationDefinition[] = [];
	readonly calls: { method: string; account: string; repository?: ICloudAutomationRepository; id?: string; value?: ICloudAutomationMutation }[] = [];
	isPrivate = true;
	listPromise: Promise<readonly ICloudAutomationDefinition[]> | undefined;
	historyPromise: Promise<readonly ICloudAutomationTask[]> | undefined;
	readonly historyStarted = new DeferredPromise<void>();
	readonly historyTokens: CancellationToken[] = [];
	override async requirePrivateRepository(): Promise<void> {
		if (!this.isPrivate) {
			throw new Error('Private repository required.');
		}
	}
	override async list(): Promise<readonly ICloudAutomationDefinition[]> {
		return this.listPromise ?? this.definitions;
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
	override async listRuns(_account: string, _id: string, token: CancellationToken): Promise<readonly ICloudAutomationTask[]> {
		this.historyTokens.push(token);
		void this.historyStarted.complete();
		return this.historyPromise ?? [];
	}
}

suite('CloudAutomationStore', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(enabled = true) {
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
			override getRecentWorkspaces() { return []; }
		}();
		const store = disposables.add(new CloudAutomationStore('cloud', 'copilot-cloud-agent', uri => uri, api, accounts, configuration, storage, new NullLogService(), recents));
		return { store, api, storage, accounts, configuration, changeAccount: (value: IDefaultAccount | null) => { accounts.currentDefaultAccount = value; changed.fire(value); } };
	}

	test('disabled feature does not affect the ready local catalogue', () => {
		const { store } = setup(false);
		assert.deepStrictEqual({ state: store.catalogueState.get(), create: store.canCreateAutomation.get(), definitions: store.automations.get() }, { state: 'ready', create: false, definitions: [] });
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
		assert.deepStrictEqual(runs.map(run => ({ status: run.status, description: run.statusDescription, error: run.errorMessage })), [
			{ status: 'running', description: undefined, error: undefined },
			{ status: 'running', description: 'Needs input on GitHub', error: undefined },
			{ status: 'failed', description: undefined, error: 'timed_out' },
		]);
	});
});
