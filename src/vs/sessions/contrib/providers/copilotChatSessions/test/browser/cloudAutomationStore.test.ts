/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatAIDisabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { AutomationDetail, CreateAutomationRequest, CreateAutomationTaskResponse, EditAutomationRequest, IAutomationsClient, ListRepoAutomationsResponse } from '../../../../../../platform/github/common/missionControl/automations.js';
import { PaginatedResponse, RepositoryRef } from '../../../../../../platform/github/common/missionControl/missionControl.js';
import { ITasksClient, ListTasksResponse, Task } from '../../../../../../platform/github/common/missionControl/tasks.js';
import { IGitHubCredentials } from '../../../../../../platform/github/common/githubCredentialService.js';
import { GitHubRepository, GitHubRepositoryRef } from '../../../../../../platform/github/common/githubQueryService.js';
import { IGitHubQuery } from '../../../../../../platform/github/common/githubQueryServiceImpl.js';
import { IGitHubClient } from '../../../../../../platform/github/common/githubService.js';
import { IGitHubEndpointProvider } from '../../../../../../platform/github/common/githubTypes.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAutomationSchedule } from '../../../../../../workbench/contrib/chat/common/automations/automation.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING } from '../../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IWorkbenchGitHubService } from '../../../../../../workbench/services/github/common/githubService.js';
import { ISessionsRecentWorkspacesService } from '../../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../../../services/sessions/common/session.js';
import { CloudAutomationStore, cloudAutomationSchedule, cloudAutomationTriggers } from '../../browser/cloudAutomationStore.js';

const definition: AutomationDetail = { id: 'one', name: 'Review', description: '', created_by: { login: 'user' }, prompt: 'Review issues', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', triggers: {} };
const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/owner/private/HEAD' });
const account: IDefaultAccount = { accountName: 'user', sessionId: 'one', enterprise: false, authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false } };
const manual: IAutomationSchedule = { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };

class TestApi extends mock<IAutomationsClient>() {
	readonly calls: string[] = [];
	definitions: readonly AutomationDetail[] = [definition];
	tasks: readonly Task[] = [];
	listError: Error | undefined;
	historyError: Error | undefined;
	pendingVisibility: Promise<boolean> | undefined;
	readonly visibilityStarted = new DeferredPromise<void>();
	lastSignal: AbortSignal | undefined;
	patch: EditAutomationRequest | undefined;
	async isPrivateRepository(_repository: GitHubRepositoryRef, signal: AbortSignal): Promise<boolean> {
		this.calls.push('visibility');
		this.lastSignal = signal;
		await this.visibilityStarted.complete();
		return this.pendingVisibility ?? true;
	}
	override async list(): Promise<PaginatedResponse<ListRepoAutomationsResponse>> {
		this.calls.push('list');
		if (this.listError) {
			throw this.listError;
		}
		return { data: { automations: this.definitions, total_count: this.definitions.length } };
	}
	override async listRuns(): Promise<PaginatedResponse<ListTasksResponse>> {
		this.calls.push('history');
		if (this.historyError) {
			throw this.historyError;
		}
		return { data: { tasks: this.tasks } };
	}
	override async get(): Promise<AutomationDetail> { return this.definitions[0]; }
	override async create(_repository: RepositoryRef, value: CreateAutomationRequest): Promise<AutomationDetail> {
		this.calls.push('create');
		return { ...definition, ...value };
	}
	override async update(_repository: RepositoryRef, _id: string, value: EditAutomationRequest): Promise<AutomationDetail> {
		this.patch = value;
		this.calls.push('update');
		return { ...this.definitions[0], ...value };
	}
	override async dispatch(): Promise<CreateAutomationTaskResponse> { this.calls.push('run'); return {}; }
}

suite('CloudAutomationStore', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	function setup(logService: ILogService = new NullLogService()) {
		const instantiation = disposables.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ chat: { automations: { enabled: true, cloud: { enabled: false } } } });
		const changed = disposables.add(new Emitter<IDefaultAccount | null>());
		const accounts = new class extends mock<IDefaultAccountService>() {
			override currentDefaultAccount: IDefaultAccount | null = account;
			override onDidChangeDefaultAccount = changed.event;
		}();
		const sentimentChanged = disposables.add(new Emitter<void>());
		const entitlement = new class extends mock<IChatEntitlementService>() {
			override sentiment: IChatSentiment = {};
			override onDidChangeSentiment = sentimentChanged.event;
		}();
		const api = new TestApi();
		const credentialLifetime = new AbortController();
		const client = new class extends mock<IGitHubClient>() {
			override readonly onDidInvalidate = Event.None;
			override readonly authorization = { providerId: 'github', sessionId: account.sessionId, scopes: ['repo'] };
			override readonly endpoint = new class extends mock<IGitHubEndpointProvider>() {
				override getApiBaseUri() { return 'https://api.github.com'; }
				override getGraphQlUri() { return 'https://api.github.com/graphql'; }
			}();
			override readonly automations = api;
			override readonly query = new class extends mock<IGitHubQuery>() {
				override async getRepository(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<GitHubRepository> {
					const isPrivate = await api.isPrivateRepository(ref, signal);
					return new class extends mock<GitHubRepository>() { override readonly private = isPrivate; }();
				}
			}();
			override readonly tasks = new class extends mock<ITasksClient>() {
				override async get() { return api.tasks[0]; }
			}();
			override readonly credentials = new class extends mock<IGitHubCredentials>() {
				override async getCredential() {
					return { account: { host: 'api.github.com', accountId: account.accountName }, token: 'test-token', generation: 1, signal: credentialLifetime.signal };
				}
			}();
		}();
		const lease = () => Object.assign(toDisposable(() => { }), { object: client });
		instantiation.stub(IWorkbenchGitHubService, new class extends mock<IWorkbenchGitHubService>() {
			override readonly onDidChangeDefaultClient = Event.None;
			override async acquireDefaultAccountClient() { return lease(); }
			override acquireClient() { return lease(); }
		}());
		instantiation.stub(IInstantiationService, instantiation);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IDefaultAccountService, accounts);
		instantiation.stub(IChatEntitlementService, entitlement);
		instantiation.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiation.stub(ILogService, logService);
		instantiation.stub(ISessionsRecentWorkspacesService, upcastPartial<ISessionsRecentWorkspacesService>({
			getRecentWorkspaces: () => [{ workspace: { uri: workspace, label: 'private', icon: Codicon.repo, requiresWorkspaceTrust: false, folders: [{ root: workspace, workingDirectory: workspace, name: 'private', description: undefined }], isVirtualWorkspace: true }, providerId: 'cloud', checked: true, source: 'agents' }],
		}));
		const provider = disposables.add(instantiation.createInstance(CloudAutomationStore, 'cloud', 'cloud-agent', () => undefined));
		const set = async (key: string, value: boolean) => {
			await configuration.setUserConfiguration(key, value);
			configuration.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, affectedKeys: new Set([key]), change: { keys: [key], overrides: [] }, source: ConfigurationTarget.USER });
		};
		return { provider, api, accounts, changed, entitlement, sentimentChanged, set };
	}

	test('default-off and parent gates create no API requests or visible catalogue', async () => {
		const { provider, api, set } = setup();
		disposables.add(autorun(reader => provider.automations.read(reader)));
		assert.deepStrictEqual({ enabled: provider.enabled.get(), calls: api.calls, automations: provider.automations.get() }, { enabled: false, calls: [], automations: [] });
		await set(CHAT_AUTOMATIONS_ENABLED_SETTING, false);
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await set(ChatAIDisabledSettingId, true);
		await set(CHAT_AUTOMATIONS_ENABLED_SETTING, true);
		assert.deepStrictEqual({ enabled: provider.enabled.get(), calls: api.calls }, { enabled: false, calls: [] });
	});

	test('enablement discovers and projects definitions; hiding AI clears catalogue and cancels work', async () => {
		const { provider, api, set, entitlement, sentimentChanged } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const automation = provider.automations.get()[0];
		assert.deepStrictEqual({ name: automation.name, target: automation.target.providerId, zone: automation.schedule.timeZone, writable: provider.canCreateAutomation.get() },
			{ name: 'Review', target: 'cloud', zone: 'UTC', writable: true });
		const pending = new DeferredPromise<boolean>();
		api.pendingVisibility = pending.p;
		const run = provider.runAutomation(automation.id);
		await Promise.resolve();
		entitlement.sentiment = { hidden: true };
		sentimentChanged.fire();
		const rejected = assert.rejects(run);
		await pending.complete(true);
		await rejected;
		assert.deepStrictEqual({ calls: api.calls.includes('run'), automations: provider.automations.get(), enabled: provider.enabled.get(), cancelled: api.lastSignal?.aborted },
			{ calls: false, automations: [], enabled: false, cancelled: true });
	});

	test('account reset removes ownership and pending requests; sandbox and enterprise are not authorities', async () => {
		const { provider, accounts, changed, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const old = provider.automations.get()[0];
		accounts.currentDefaultAccount = { ...account, enterprise: true };
		changed.fire(accounts.currentDefaultAccount);
		assert.deepStrictEqual({ automation: provider.getAutomation(old.id), canCreate: provider.canCreateAutomation.get(), state: provider.catalogueState.get() },
			{ automation: undefined, canCreate: false, state: 'unavailable' });
	});

	for (const previousDefinitionError of [false, true]) {
		test(`history failure preserves a ready catalogue${previousDefinitionError ? ' after a definition failure' : ''}`, async () => {
			const { provider, api, set } = setup();
			api.tasks = [{ id: 'task', state: 'completed', created_at: definition.created_at, remote_steerable: false }];
			await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
			await provider.refresh();
			const runs = provider.runs.get();
			if (previousDefinitionError) {
				api.listError = new Error('Definitions unavailable');
				await assert.rejects(provider.refresh(), /Some GitHub repositories could not be refreshed/);
				api.listError = undefined;
			}
			api.definitions = [{ ...definition, name: 'Updated' }];
			api.historyError = new Error('History unavailable');
			await assert.rejects(provider.refresh(), error => error === api.historyError);
			const automation = provider.automations.get()[0];
			assert.deepStrictEqual({
				state: provider.catalogueState.get(),
				reason: provider.unavailableReason.get(),
				canCreate: provider.canCreateAutomation.get(),
				canRun: provider.canRunAutomation(automation.id),
				name: automation.name,
				runs: provider.runs.get(),
			}, { state: 'ready', reason: undefined, canCreate: true, canRun: true, name: 'Updated', runs });
			assert.deepStrictEqual(await provider.runAutomation(automation.id), { kind: 'accepted' });
		});
	}

	test('definition failure blocks mutations and skips history refresh without clearing cards', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const automations = provider.automations.get();
		api.calls.length = 0;
		api.listError = new Error('Definitions unavailable');
		await assert.rejects(provider.refresh(), /Some GitHub repositories could not be refreshed/);
		assert.deepStrictEqual({
			state: provider.catalogueState.get(),
			canCreate: provider.canCreateAutomation.get(),
			canRun: provider.canRunAutomation(automations[0].id),
			automations: provider.automations.get(),
			historyRequested: api.calls.includes('history'),
		}, { state: 'error', canCreate: false, canRun: false, automations, historyRequested: false });
	});

	test('hiding AI after definition refresh cancels before requesting history', async () => {
		const { provider, api, set, entitlement, sentimentChanged } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		api.calls.length = 0;
		let hideOnReady = false;
		disposables.add(autorun(reader => {
			if (provider.catalogueState.read(reader) === 'ready' && hideOnReady) {
				hideOnReady = false;
				entitlement.sentiment = { hidden: true };
				sentimentChanged.fire();
			}
		}));
		hideOnReady = true;
		await assert.rejects(provider.refresh(), isCancellationError);
		assert.deepStrictEqual({
			enabled: provider.enabled.get(),
			automations: provider.automations.get(),
			historyRequested: api.calls.includes('history'),
		}, { enabled: false, automations: [], historyRequested: false });
	});

	test('202 remains acknowledgement only and cloud history has no native session resource', async () => {
		const { provider, api, set } = setup();
		api.tasks = [{ id: 'task', state: 'waiting_for_user', created_at: definition.created_at, remote_steerable: true }];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const automation = provider.automations.get()[0];
		assert.deepStrictEqual(await provider.runAutomation(automation.id), { kind: 'accepted' });
		const run = provider.runs.get()[0];
		assert.deepStrictEqual({ status: run.status, trigger: run.trigger, needsInput: run.needsInput, session: run.sessionResource, url: run.externalResource?.toString() },
			{ status: 'running', trigger: 'external', needsInput: true, session: undefined, url: 'https://github.com/owner/private/tasks/task' });
	});

	test('logs and hides unknown run states without hiding valid history and restores recognized runs', async () => {
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}();
		const { provider, api, set } = setup(logService);
		api.tasks = [
			{ id: 'completed', state: 'completed', created_at: definition.created_at, remote_steerable: false },
			// Simulate a future domain state reaching the projection despite the current closed API union.
			{ id: 'unknown', state: 'future_state' as Task['state'], created_at: definition.created_at, remote_steerable: false },
			{ id: 'failed', state: 'failed', created_at: definition.created_at, remote_steerable: false },
		];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const statuses = provider.runs.get().map(run => run.status);
		assert.deepStrictEqual({
			statuses,
			logged: warnings.includes('[CloudAutomations] Skipping run unknown with unsupported state: future_state'),
			catalogue: provider.catalogueState.get(),
			canCreate: provider.canCreateAutomation.get(),
		}, { statuses: ['completed', 'failed'], logged: true, catalogue: 'ready', canCreate: true });
		api.tasks = api.tasks.map(task => task.id === 'unknown' ? { ...task, state: 'completed' } : task);
		await provider.refresh();
		assert.deepStrictEqual(provider.runs.get().map(run => run.status), ['completed', 'completed', 'failed']);
	});

	test('preflight conflicts and partial patches preserve remote configuration', async () => {
		const { provider, api, set } = setup();
		api.definitions = [{ ...definition, tools: ['future-tool'], reasoning_effort: 'future' }];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const expected = provider.automations.get()[0];
		api.definitions = [{ ...api.definitions[0], prompt: 'Web edit' }];
		const conflict = await provider.updateAutomationIfUnchanged(expected.id, { name: 'New' }, expected);
		await provider.updateAutomation(expected.id, { name: 'New' });
		assert.deepStrictEqual({ kind: conflict.kind, patch: api.patch }, { kind: 'conflict', patch: { name: 'New' } });
	});

	test('rejects configuration reset before dispatch for ordinary and guarded updates', async () => {
		const { provider, api, set } = setup();
		api.definitions = [{ ...definition, model: 'saved-model', tools: ['read'], reasoning_effort: 'high' }];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const automation = provider.automations.get()[0];
		await assert.rejects(provider.updateAutomation(automation.id, { sessionTemplate: null }), /Resetting cloud automation configuration is not supported/);
		await assert.rejects(provider.updateAutomationIfUnchanged(automation.id, { sessionTemplate: null }, automation), /Resetting cloud automation configuration is not supported/);
		assert.deepStrictEqual({
			dispatched: api.calls.includes('update'),
			patch: api.patch,
			template: provider.getAutomation(automation.id)?.sessionTemplate,
			canCreate: provider.canCreateAutomation.get(),
		}, { dispatched: false, patch: undefined, template: automation.sessionTemplate, canCreate: true });
		await provider.updateAutomation(automation.id, { sessionTemplate: { modelId: 'new-model', config: { tools: ['read'], reasoningEffort: 'low' } } });
		assert.deepStrictEqual(api.patch, { model: 'new-model', tools: ['read'], reasoning_effort: 'low' });
	});

	// The API replaces triggers as a whole: https://gist.github.com/timrogers/81271876a2f5384a41d1261b62ed6792#update-an-automation
	test('switching a scheduled automation to manual sends empty triggers while unrelated edits omit them', async () => {
		const { provider, api, set } = setup();
		api.definitions = [{ ...definition, triggers: { interval: { types: ['daily'], hour_utc: 9, minute_utc: 30 } } }];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const automation = provider.automations.get()[0];
		const renamed = await provider.updateAutomation(automation.id, { name: 'Renamed' });
		const renamePatch = api.patch;
		const updated = await provider.updateAutomation(automation.id, { schedule: manual });
		assert.deepStrictEqual({
			renamePatch,
			renamedSchedule: renamed.schedule,
			manualPatch: api.patch,
			updatedInterval: updated.schedule.interval,
		}, {
			renamePatch: { name: 'Renamed' },
			renamedSchedule: { interval: 'daily', timeZone: 'UTC', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			manualPatch: { triggers: {} },
			updatedInterval: 'manual',
		});
	});

	test('creation is explicit and rejects local configuration and unsupported schedules', async () => {
		const { provider, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const options = { name: 'Create', prompt: 'Review', schedule: manual, target: { kind: 'workspace' as const, folderUri: workspace, providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' as const } } };
		await assert.rejects(provider.createAutomation({ ...options, mode: 'agent' }));
		await assert.rejects(provider.createAutomation({ ...options, schedule: { ...manual, interval: 'daily' } }));
		const created = await provider.createAutomation(options);
		assert.strictEqual(created.enabled, false);
	});

	test('roundtrips UTC schedules and keeps unknown triggers read-only', () => {
		const daily = { ...manual, interval: 'daily' as const, timeZone: 'UTC' as const, scheduleHour: 7, scheduleMinute: 15 };
		assert.deepStrictEqual({ daily: cloudAutomationSchedule(cloudAutomationTriggers(daily)), custom: cloudAutomationSchedule({ webhook: { types: ['issue'] } }).interval },
			{ daily, custom: 'custom' });
	});
});
